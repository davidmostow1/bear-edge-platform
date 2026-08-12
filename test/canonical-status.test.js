const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const {
  REQUIRED_DOCUMENTS,
  auditCanonicalStatus,
  readGitRepositoryState,
  validateExpectedHead,
  validateCanonicalStatusDocument
} = require("../script/check_canonical_status.js");

const ROOT = path.resolve(__dirname, "..");

function loadContext() {
  return {
    boundaries: JSON.parse(fs.readFileSync(
      path.join(ROOT, "governance", "system-boundaries.json"),
      "utf8"
    )),
    documents: Object.fromEntries(REQUIRED_DOCUMENTS.map((relativePath) => [
      relativePath,
      fs.readFileSync(path.join(ROOT, relativePath), "utf8")
    ])),
    migrationFiles: fs.readdirSync(path.join(ROOT, "supabase", "migrations"))
      .filter((fileName) => fileName.endsWith(".sql"))
      .sort(),
    predecessorReceipt: JSON.parse(fs.readFileSync(
      path.join(ROOT, "docs", "canonical", "receipts", "p0-baseline-20260812.json"),
      "utf8"
    )),
    receipt: JSON.parse(fs.readFileSync(
      path.join(
        ROOT,
        "docs",
        "canonical",
        "receipts",
        "p0-hardening-deployment-20260812.json"
      ),
      "utf8"
    )),
    registry: JSON.parse(fs.readFileSync(path.join(ROOT, "models", "registry.json"), "utf8"))
  };
}

function loadStatus() {
  return JSON.parse(fs.readFileSync(
    path.join(ROOT, "docs", "canonical", "STATUS.json"),
    "utf8"
  ));
}

function assertFailureCode(callback, code) {
  assert.throws(callback, (error) => (
    error instanceof Error
    && /** @type {{ code?: unknown }} */ (error).code === code
  ));
}

test("canonical status audit agrees with registry, migrations, authorization, and documents", () => {
  const result = auditCanonicalStatus();
  const packageJson = JSON.parse(fs.readFileSync(path.join(ROOT, "package.json"), "utf8"));

  assert.equal(result.status, "PASS");
  assert.equal(result.modelCount, 5);
  assert.equal(result.validatedModelCount, 0);
  assert.equal(result.authorizedStakeUsd, 0);
  assert.equal(result.executionEnabled, false);
  assert.equal(result.gitMigrationCount, 18);
  assert.ok(
    packageJson.files.includes("docs/canonical/**/*"),
    "portable packages must retain the machine-audited canonical status bundle"
  );
  assert.ok(
    packageJson.files.includes("AGENTS.md"),
    "portable packages must retain the reviewer protocol audited by canonical status"
  );
});

test("canonical status audit fails closed when Git evidence is unavailable", () => {
  const previousPath = process.env.PATH;

  try {
    process.env.PATH = "/nonexistent";
    assertFailureCode(
      () => auditCanonicalStatus(),
      "REPOSITORY_STATE_UNAVAILABLE"
    );
  } finally {
    process.env.PATH = previousPath;
  }
});

test("exact-SHA verification accepts only the matching clean checkout", () => {
  const headCommit = "a".repeat(40);

  assert.doesNotThrow(() => validateExpectedHead({ headCommit, workingTreeClean: true }, headCommit));
  assertFailureCode(
    () => validateExpectedHead({ headCommit, workingTreeClean: true }, "b".repeat(40)),
    "EXPECTED_HEAD_SHA_MISMATCH"
  );
  assertFailureCode(
    () => validateExpectedHead({ headCommit, workingTreeClean: false }, headCommit),
    "EXPECTED_HEAD_WORKTREE_DIRTY"
  );
});

test("CI binds verification to the pull-request head instead of the synthetic merge SHA", () => {
  const workflow = fs.readFileSync(path.join(ROOT, ".github", "workflows", "ci.yml"), "utf8");

  assert.match(workflow, /ref: \$\{\{ github\.event\.pull_request\.head\.sha \|\| github\.sha \}\}/);
  assert.match(workflow, /fetch-depth: 0/);
  assert.match(
    workflow,
    /BEAR_EDGE_EXPECTED_HEAD_SHA: \$\{\{ github\.event\.pull_request\.head\.sha \|\| github\.sha \}\}/
  );
});

test("canonical status audit rejects unvalidated top-level claims", () => {
  const status = loadStatus();
  status.profitability = "CONFIRMED";

  assertFailureCode(
    () => validateCanonicalStatusDocument(status, loadContext()),
    "STATUS_FIELDS_INVALID"
  );
});

test("canonical status audit binds evidence time and every authority field", () => {
  const repositoryState = readGitRepositoryState(ROOT);
  assert.ok(repositoryState);

  for (const mutate of [
    (status) => { status.externalEvidenceAsOf = "2099-12-31T23:59:59.000Z"; },
    (status) => { status.authority.current.code = "CONVERSATION_MEMORY"; },
    (status) => { status.authority.target.rawEvidence = "UNRETAINED_CHAT_TEXT"; }
  ]) {
    const status = loadStatus();
    mutate(status);

    assertFailureCode(
      () => validateCanonicalStatusDocument(status, {
        ...loadContext(),
        repositoryState
      }),
      "STATUS_SNAPSHOT_DRIFT"
    );
  }
});

test("canonical status audit rejects a nonzero authorized stake", () => {
  const status = loadStatus();
  status.authorization.authorizedStakeUsd = 1;

  assertFailureCode(
    () => validateCanonicalStatusDocument(status, loadContext()),
    "AUTHORIZATION_BOUNDARY_CHANGED"
  );
});

test("canonical status audit rejects model-count drift", () => {
  const status = loadStatus();
  status.models.registered += 1;

  assertFailureCode(
    () => validateCanonicalStatusDocument(status, loadContext()),
    "MODEL_STATUS_DRIFT"
  );
});

test("canonical status audit rejects an invented esports model capability", () => {
  const status = loadStatus();
  status.esports.independentProbabilityGeneratorImplemented = true;

  assertFailureCode(
    () => validateCanonicalStatusDocument(status, loadContext()),
    "ESPORTS_STATUS_OVERCLAIMED"
  );
});

test("canonical status audit rejects a silent Supabase authority claim", () => {
  const status = loadStatus();
  status.authority.current.decisionLifecycle = "SUPABASE_APPEND_ONLY_OPERATIONAL_EVENTS";

  assertFailureCode(
    () => validateCanonicalStatusDocument(status, loadContext()),
    "AUTHORITY_ARCHITECTURE_DRIFT"
  );
});

test("canonical status audit rejects safety wording removed from a required document", () => {
  const context = loadContext();
  context.documents["docs/canonical/ROADMAP.md"] = "RESEARCH_ONLY without an authorized-stake statement";

  assertFailureCode(
    () => validateCanonicalStatusDocument(loadStatus(), context),
    "CANONICAL_SAFETY_BOUNDARY_MISSING"
  );
});

test("canonical status audit binds the standing reviewer model count", () => {
  const context = loadContext();
  context.documents["AGENTS.md"] = context.documents["AGENTS.md"].replace(
    "**Models validated:** 0/5",
    "**Models validated:** 0/4"
  );

  assertFailureCode(
    () => validateCanonicalStatusDocument(loadStatus(), context),
    "REVIEWER_STANDING_STATE_DRIFT"
  );
});

test("canonical status audit rejects fabricated repository evidence", () => {
  const status = loadStatus();
  status.repository.fullName = "wrong-owner/wrong-repository";
  status.repository.defaultBranchCommit = "a".repeat(40);
  status.repository.recoveryBaselineCommit = "b".repeat(40);

  assertFailureCode(
    () => validateCanonicalStatusDocument(status, loadContext()),
    "REPOSITORY_EVIDENCE_DRIFT"
  );
});

test("canonical status audit rejects a fabricated verification count", () => {
  const status = loadStatus();
  status.softwareVerification.canonicalBaseline.passed = 999999;

  assertFailureCode(
    () => validateCanonicalStatusDocument(status, loadContext()),
    "CANONICAL_VERIFICATION_EVIDENCE_DRIFT"
  );
});

test("canonical status audit rejects an invented predictive-edge grade", () => {
  const status = loadStatus();
  status.models.predictiveEdgeGrade = "CONFIRMED";

  assertFailureCode(
    () => validateCanonicalStatusDocument(status, loadContext()),
    "MODEL_EVIDENCE_GRADE_DRIFT"
  );
});

test("canonical status audit rejects fabricated Supabase evidence", () => {
  const status = loadStatus();
  status.supabaseSnapshot.projectRef = "fabricated-project";
  status.supabaseSnapshot.decisionRecords = 999999;

  assertFailureCode(
    () => validateCanonicalStatusDocument(status, loadContext()),
    "SUPABASE_EVIDENCE_DRIFT"
  );
});

test("canonical status binds deployed hardening while keeping synchronization disabled", () => {
  const status = loadStatus();

  assert.equal(status.supabaseSnapshot.liveMigrationCount, 18);
  assert.deepEqual(status.supabaseSnapshot.liveMissingGitMigrations, []);
  assert.equal(status.supabaseSnapshot.hardeningMigrationApplied, true);
  assert.equal(status.supabaseSnapshot.authenticatedProjectionInsertExposed, false);
  assert.equal(status.supabaseSnapshot.snapshotChecksFailClosed, true);
  assert.equal(status.supabaseSnapshot.shadowRetryIdempotencyProven, true);
  assert.equal(status.supabaseSnapshot.hostedSingleSessionRuntimeProofPassed, true);
  assert.equal(status.supabaseSnapshot.hostedMultiSessionConcurrencyProven, false);
  assert.equal(status.supabaseSnapshot.hostedPostgrestAuthProven, false);
  assert.equal(status.supabaseSnapshot.currentRecordSyncCompatible, false);
  assert.equal(status.repository.branchProtected, false);

  for (const mutate of [
    (candidate) => { candidate.supabaseSnapshot.liveMissingGitMigrations = ["invented.sql"]; },
    (candidate) => { candidate.supabaseSnapshot.authenticatedProjectionInsertExposed = true; },
    (candidate) => { candidate.supabaseSnapshot.snapshotChecksFailClosed = false; },
    (candidate) => { candidate.supabaseSnapshot.currentRecordSyncCompatible = true; },
    (candidate) => { candidate.repository.branchProtected = true; }
  ]) {
    const candidate = loadStatus();
    mutate(candidate);

    assert.throws(() => validateCanonicalStatusDocument(candidate, loadContext()));
  }
});

test("canonical status rejects hardening receipt content drift", () => {
  const context = loadContext();
  context.receipt.claimBoundary = "fabricated stronger claim";

  assertFailureCode(
    () => validateCanonicalStatusDocument(loadStatus(), context),
    "EXTERNAL_RECEIPT_DIGEST_DRIFT"
  );
});

test("canonical status rejects predecessor receipt chain drift", () => {
  const context = loadContext();
  context.predecessorReceipt.claimBoundary = "fabricated predecessor claim";

  assertFailureCode(
    () => validateCanonicalStatusDocument(loadStatus(), context),
    "EXTERNAL_RECEIPT_CHAIN_DRIFT"
  );
});

test("canonical status audit binds every promotion-policy field and digest", () => {
  const status = loadStatus();
  status.promotionPolicy.thresholds.maximumExpectedCalibrationError = 0.99;

  assertFailureCode(
    () => validateCanonicalStatusDocument(status, loadContext()),
    "PROMOTION_POLICY_DRIFT"
  );
});

test("canonical status audit rejects negated safety prose containing the old tokens", () => {
  const context = loadContext();
  context.documents["docs/canonical/ROADMAP.md"] = context.documents[
    "docs/canonical/ROADMAP.md"
  ].replace(
    "SAFETY_INVARIANT: authorization is RESEARCH_ONLY; authorized stake is $0; execution is disabled.",
    "SAFETY_INVARIANT: authorization is not RESEARCH_ONLY; authorized stake is not $0; execution is enabled."
  );

  assertFailureCode(
    () => validateCanonicalStatusDocument(loadStatus(), context),
    "CANONICAL_SAFETY_BOUNDARY_MISSING"
  );
});

test("canonical status audit rejects inverted authority prose", () => {
  const context = loadContext();
  context.documents["docs/canonical/ARCHITECTURE.md"] = context.documents[
    "docs/canonical/ARCHITECTURE.md"
  ].replace(
    "CURRENT: local JSONL is authoritative; Supabase is a remote projection.",
    "CURRENT: Supabase is authoritative; local JSONL is a remote projection."
  );

  assertFailureCode(
    () => validateCanonicalStatusDocument(loadStatus(), context),
    "AUTHORITY_DOCUMENT_AMBIGUOUS"
  );
});

test("canonical status audit rejects a lifecycle that overclaims P0 closure", () => {
  const status = loadStatus();
  status.repository.canonicalizationState = "P0_CLOSED";

  assertFailureCode(
    () => validateCanonicalStatusDocument(status, loadContext()),
    "CANONICAL_LIFECYCLE_DRIFT"
  );
});

test("canonical status accepts descendants of the reviewed merged baseline", () => {
  const repositoryState = readGitRepositoryState(ROOT);
  assert.ok(repositoryState);

  assert.doesNotThrow(() => validateCanonicalStatusDocument(loadStatus(), {
    ...loadContext(),
    repositoryState: {
      ...repositoryState,
      headCommit: "d".repeat(40),
      workingTreeClean: true
    }
  }));
});

test("canonical baseline receipt is branch-independent for normal descendant development", () => {
  const repositoryState = readGitRepositoryState(ROOT);
  assert.ok(repositoryState);

  for (const branch of ["master", "codex/dota-source-and-dataset-proof"]) {
    assert.doesNotThrow(() => validateCanonicalStatusDocument(loadStatus(), {
      ...loadContext(),
      repositoryState: {
        ...repositoryState,
        branch,
        headCommit: "e".repeat(40),
        workingTreeClean: true
      }
    }));
  }
});

test("canonical status binds the explicitly selected Dota 2 product lane", () => {
  const status = loadStatus();

  assert.deepEqual(status.nextProductDecision, {
    selected: "DOTA2_PREMATCH_BO3_SERIES_WINNER",
    selectedByUser: true,
    selectedOn: "2026-08-12"
  });
});

test("canonical status rejects a checkout that does not descend from the merged baseline", () => {
  const repositoryState = readGitRepositoryState(ROOT);
  assert.ok(repositoryState);

  assertFailureCode(
    () => validateCanonicalStatusDocument(loadStatus(), {
      ...loadContext(),
      repositoryState: {
        ...repositoryState,
        canonicalBaselineCommit: "f".repeat(40)
      }
    }),
    "CANONICAL_BASELINE_ANCESTRY_DRIFT"
  );
});
