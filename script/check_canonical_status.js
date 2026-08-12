#!/usr/bin/env node

const fs = require("node:fs");
const path = require("node:path");
const crypto = require("node:crypto");
const { execFileSync } = require("node:child_process");

const { contentDigest } = require("../src/audit/canonical-json.js");

const REPO_ROOT = path.resolve(__dirname, "..");
const DIGEST_PATTERN = /^[a-f0-9]{64}$/;
const STATUS_DIGEST_SENTINEL = "SELF_REFERENTIAL_CANDIDATE_DIGEST";
const PINNED_CANONICAL_STATUS_DIGEST =
  "ac04d7b715b39f17417bbbd7140fca48a786103960a9f2636463e3f8942c378f";
const REQUIRED_GRADES = Object.freeze([
  "CONFIRMED",
  "PARTIAL",
  "FAILED",
  "UNVERIFIED"
]);
const REQUIRED_DOCUMENTS = Object.freeze([
  "AGENTS.md",
  "docs/canonical/STATUS.md",
  "docs/canonical/ARCHITECTURE.md",
  "docs/canonical/SOURCE_OF_TRUTH.md",
  "docs/canonical/BRANCH_DISPOSITION.md",
  "docs/canonical/ROADMAP.md"
]);
const REQUIRED_PERSISTENT_BLOCKERS = Object.freeze([
  "NO_VALIDATED_MODEL",
  "NO_CALIBRATION_REPORT",
  "NO_PROSPECTIVE_SETTLED_COHORT",
  "NO_PROVEN_PREDICTIVE_EDGE",
  "NO_ESPORTS_PROBABILITY_GENERATOR",
  "NO_ESPORTS_HISTORICAL_PIPELINE",
  "SOURCE_RIGHTS_AND_LINEAGE_UNRESOLVED",
  "SUPABASE_AUTHORITY_CUTOVER_NOT_IMPLEMENTED",
  "GIT_AND_LIVE_SUPABASE_MIGRATIONS_DIFFER",
  "LIVE_SUPABASE_REJECTS_SCHEMA_2_1_SYNC",
  "EXTERNAL_AUDIT_RAW_RECEIPTS_NOT_RETAINED"
]);
const CANONICALIZATION_BLOCKER =
  "CANONICALIZATION_REQUIRES_EXTERNAL_EXACT_SHA_CI_RECEIPT";
const SUPPORTED_CANDIDATE_STATE = "CONSOLIDATION_CANDIDATE";
const PINNED_CANDIDATE_BRANCH = "codex/bear-edge-canonicalize-20260812";
const PINNED_REPOSITORY_SNAPSHOT = Object.freeze({
  fullName: "davidmostow1/bear-edge-platform",
  defaultBranch: "master",
  defaultBranchCommit: "738b3e462dd1e46264240006f72a843a04cc17cf",
  recoveryBaselineCommit: "5f284eb8cf66050f06601087ef04a267441f1958",
  recoveryBaselineRefs: Object.freeze([
    "codex/pitcher-strikeout-complete-data-research",
    "codex/reconcile-pr17-master"
  ])
});
const PINNED_RECOVERY_VERIFICATION = Object.freeze({
  commit: "5f284eb8cf66050f06601087ef04a267441f1958",
  environment: "GitHub Actions Node 20",
  command: "npm run verify",
  passed: 728,
  failed: 0,
  grade: "CONFIRMED"
});
const PINNED_LOCAL_CANDIDATE_VERIFICATION = Object.freeze({
  command: "npm run verify",
  commitBinding: "EXTERNAL_EXACT_SHA_REQUIRED",
  environment: "LOCAL_CANDIDATE_CONTENT",
  verificationNotBefore: "2026-08-12T12:05:00.000Z",
  passed: 754,
  failed: 0,
  grade: "CONFIRMED",
  remoteRunUrl: null
});
const PINNED_SUPABASE_SNAPSHOT = Object.freeze({
  observedOn: "2026-08-12",
  projectRef: "anxouzruouyraumgjdju",
  decisionRecords: 12,
  settlementRecords: 0,
  recordAmendments: 0,
  edgeFunctions: 0,
  liveMigrationCount: 16,
  gitMigrationCount: 17,
  currentAuditRecordSchemaVersion: "2.1.0",
  liveAuditRecordSchemaVersions: Object.freeze(["2.0.0"]),
  currentRecordSyncCompatible: false,
  liveMissingGitMigration: "20260718010000_shadow_evidence_v21.sql",
  gitIncludesLiveLeanMigration: true,
  leakedPasswordProtectionWarning: true,
  grade: "PARTIAL"
});
const PINNED_EXTERNAL_EVIDENCE_SCOPE = Object.freeze({
  snapshotId: "bear-edge.external-audit.2026-08-12.v1",
  observationMode: "PINNED_READ_ONLY_SNAPSHOT",
  receiptRetention: "SUMMARY_ONLY_RAW_CONNECTOR_OUTPUT_NOT_RETAINED",
  receiptDigest: null,
  refreshRequiredBeforeClaimChange: true,
  machineAuditScope: "LOCAL_INVARIANTS_AND_PINNED_SNAPSHOT_CONSISTENCY"
});
const REQUIRED_SAFETY_STATEMENT =
  "SAFETY_INVARIANT: authorization is RESEARCH_ONLY; authorized stake is $0; execution is disabled.";
const REQUIRED_CURRENT_AUTHORITY_STATEMENT =
  "CURRENT: local JSONL is authoritative; Supabase is a remote projection.";
const REQUIRED_TARGET_AUTHORITY_STATEMENT =
  "TARGET: Supabase is authoritative after explicit cutover; local JSONL is a write-ahead/replay journal.";

class CanonicalStatusError extends Error {
  constructor(code, message) {
    super(message);
    this.name = "CanonicalStatusError";
    this.code = code;
  }
}

function requireCondition(condition, code, message) {
  if (!condition) {
    throw new CanonicalStatusError(code, message);
  }
}

function objectsEqual(actual, expected) {
  return JSON.stringify(actual) === JSON.stringify(expected);
}

function readJson(filePath) {
  return JSON.parse(fs.readFileSync(filePath, "utf8"));
}

function normalizeCanonicalStatusForDigest(status) {
  const normalized = JSON.parse(JSON.stringify(status));

  if (normalized?.repository) {
    normalized.repository.candidateContentDigest = STATUS_DIGEST_SENTINEL;
  }
  if (normalized?.softwareVerification?.canonicalizationCandidate) {
    normalized.softwareVerification.canonicalizationCandidate.candidateContentDigest =
      STATUS_DIGEST_SENTINEL;
  }

  return normalized;
}

function canonicalStatusDigest(status) {
  return contentDigest(normalizeCanonicalStatusForDigest(status));
}

function sha256File(filePath) {
  return crypto.createHash("sha256").update(fs.readFileSync(filePath)).digest("hex");
}

function readGitRepositoryState(repoRoot) {
  try {
    const baselineCommit = PINNED_REPOSITORY_SNAPSHOT.recoveryBaselineCommit;
    const headCommit = execFileSync(
      "git",
      ["-C", repoRoot, "rev-parse", "HEAD"],
      { encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] }
    ).trim();
    const branch = execFileSync(
      "git",
      ["-C", repoRoot, "branch", "--show-current"],
      { encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] }
    ).trim();
    execFileSync(
      "git",
      ["-C", repoRoot, "merge-base", "--is-ancestor", baselineCommit, headCommit],
      { stdio: "ignore" }
    );
    const committedPaths = execFileSync(
      "git",
      ["-C", repoRoot, "diff", "--name-only", "-z", baselineCommit, headCommit],
      { encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] }
    ).split("\0").filter(Boolean);
    const trackedWorktreePaths = execFileSync(
      "git",
      ["-C", repoRoot, "diff", "--name-only", "-z", "HEAD"],
      { encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] }
    ).split("\0").filter(Boolean);
    const untrackedPaths = execFileSync(
      "git",
      ["-C", repoRoot, "ls-files", "--others", "--exclude-standard", "-z"],
      { encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] }
    ).split("\0").filter(Boolean);
    const changedPaths = [...new Set([
      ...committedPaths,
      ...trackedWorktreePaths,
      ...untrackedPaths
    ])].sort();
    const workingTreeClean = execFileSync(
      "git",
      ["-C", repoRoot, "status", "--porcelain=v1", "-z", "--untracked-files=all"],
      { encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] }
    ).length === 0;
    const statusPath = "docs/canonical/STATUS.json";
    const statusDigest = canonicalStatusDigest(readJson(path.join(repoRoot, statusPath)));
    const digestEntries = changedPaths
      .map((relativePath) => ({
        path: relativePath,
        sha256: relativePath === statusPath
          ? statusDigest
          : fs.existsSync(path.join(repoRoot, relativePath))
            ? sha256File(path.join(repoRoot, relativePath))
            : null
      }));

    return {
      branch,
      canonicalStatusDigest: statusDigest,
      candidateContentDigest: contentDigest(digestEntries),
      changedPaths,
      headCommit,
      recoveryBaselineCommit: baselineCommit,
      workingTreeClean
    };
  } catch (_error) {
    return null;
  }
}

function countByModelStatus(models) {
  const counts = {
    research_only: 0,
    shadow: 0,
    validated: 0,
    retired: 0
  };

  for (const model of models) {
    if (Object.prototype.hasOwnProperty.call(counts, model?.modelStatus)) {
      counts[model.modelStatus] += 1;
    }
  }

  return counts;
}

function validateExpectedHead(repositoryState, expectedHeadSha) {
  if (expectedHeadSha === undefined || expectedHeadSha === "") {
    return;
  }

  requireCondition(
    /^[a-f0-9]{40}$/.test(expectedHeadSha),
    "EXPECTED_HEAD_SHA_INVALID",
    "BEAR_EDGE_EXPECTED_HEAD_SHA must be a full lowercase Git commit SHA."
  );
  requireCondition(
    repositoryState?.headCommit === expectedHeadSha,
    "EXPECTED_HEAD_SHA_MISMATCH",
    "The checked-out Git HEAD does not match the externally supplied exact-SHA receipt."
  );
  requireCondition(
    repositoryState?.workingTreeClean === true,
    "EXPECTED_HEAD_WORKTREE_DIRTY",
    "Exact-SHA verification requires a clean working tree."
  );
}

function validateCanonicalStatusDocument(status, context) {
  const { boundaries, documents, migrationFiles, registry, repositoryState = null } = context;
  const models = Array.isArray(registry?.models) ? registry.models : [];
  const counts = countByModelStatus(models);
  const reportCount = models.filter((model) => (
    typeof model?.calibrationReportId === "string" && model.calibrationReportId.trim()
  )).length;

  requireCondition(
    status?.schemaVersion === "bear-edge.canonical-status.v1",
    "STATUS_SCHEMA_INVALID",
    "Canonical status schemaVersion must equal bear-edge.canonical-status.v1."
  );
  requireCondition(
    objectsEqual(Object.keys(status).sort(), [
      "externalEvidenceAsOf",
      "authority",
      "authorization",
      "blockingIssues",
      "claimGrades",
      "esports",
      "externalEvidence",
      "models",
      "nextProductDecision",
      "promotionPolicy",
      "repository",
      "schemaVersion",
      "softwareVerification",
      "supabaseSnapshot"
    ].sort()),
    "STATUS_FIELDS_INVALID",
    "Canonical status may not add unvalidated top-level claims."
  );
  requireCondition(
    Number.isFinite(Date.parse(status?.externalEvidenceAsOf ?? "")),
    "STATUS_TIME_INVALID",
    "Canonical status must have a valid external-evidence timestamp."
  );
  requireCondition(
    JSON.stringify(status?.claimGrades) === JSON.stringify(REQUIRED_GRADES),
    "STATUS_GRADES_INVALID",
    "Canonical status must preserve the four evidence grades in their fixed order."
  );
  requireCondition(
    status?.repository?.fullName === PINNED_REPOSITORY_SNAPSHOT.fullName
      && status.repository.defaultBranch === PINNED_REPOSITORY_SNAPSHOT.defaultBranch
      && status.repository.defaultBranchCommit === PINNED_REPOSITORY_SNAPSHOT.defaultBranchCommit
      && status.repository.recoveryBaselineCommit
        === PINNED_REPOSITORY_SNAPSHOT.recoveryBaselineCommit
      && objectsEqual(
        status.repository.recoveryBaselineRefs,
        PINNED_REPOSITORY_SNAPSHOT.recoveryBaselineRefs
      ),
    "REPOSITORY_EVIDENCE_DRIFT",
    "Repository identity and audited Git snapshot must match the pinned external evidence."
  );
  requireCondition(
    status.repository.grade === "PARTIAL",
    "REPOSITORY_GRADE_DRIFT",
    "The consolidation candidate repository state must remain PARTIAL."
  );
  requireCondition(
    status.repository.canonicalizationState === SUPPORTED_CANDIDATE_STATE,
    "LIFECYCLE_REQUIRES_EXTERNAL_VERIFIER",
    "The offline audit can certify only the consolidation-candidate content; exact commit and remote-green states require external receipts."
  );
  requireCondition(
    status.repository.commitIdentityMode === "RUNTIME_GIT_SHA_PLUS_CANDIDATE_CONTENT_DIGEST"
      && status.repository.canonicalizationBranch === PINNED_CANDIDATE_BRANCH
      && Array.isArray(status.repository.candidateChangedPaths)
      && status.repository.candidateChangedPaths.length > 0
      && DIGEST_PATTERN.test(status.repository.candidateContentDigest ?? ""),
    "CANDIDATE_IDENTITY_INVALID",
    "The pinned candidate must identify its branch, runtime commit-binding mode, complete changed-path set, and content digest."
  );
  if (repositoryState !== null) {
    requireCondition(
      repositoryState.recoveryBaselineCommit === PINNED_REPOSITORY_SNAPSHOT.recoveryBaselineCommit
        && (repositoryState.branch === "" || repositoryState.branch === PINNED_CANDIDATE_BRANCH)
        && objectsEqual(repositoryState.changedPaths, status.repository.candidateChangedPaths)
        && repositoryState.candidateContentDigest
          === status.repository.candidateContentDigest,
      "CANDIDATE_CONTENT_EVIDENCE_DRIFT",
      "Current Git ancestry, branch or detached checkout, changed paths, and candidate content digest must match the pinned receipt."
    );
  }
  requireCondition(
    objectsEqual(status?.externalEvidence, PINNED_EXTERNAL_EVIDENCE_SCOPE),
    "EXTERNAL_EVIDENCE_SCOPE_DRIFT",
    "External facts must retain the pinned snapshot identity and explicit non-refresh scope."
  );

  requireCondition(
    status?.authorization?.mode === "RESEARCH_ONLY"
      && status.authorization.permission === "PRICE_CHECK_ONLY"
      && boundaries.defaultAuthorization === "PRICE_CHECK_ONLY"
      && status.authorization.authorizedStakeUsd === 0
      && status.authorization.executionEnabled === false
      && status.authorization.grade === "CONFIRMED",
    "AUTHORIZATION_BOUNDARY_CHANGED",
    "Canonical status must remain RESEARCH_ONLY, PRICE_CHECK_ONLY, $0, and execution-disabled."
  );
  requireCondition(
    boundaries?.wageringAuthority === "UNCHANGED"
      && boundaries?.modelValidation === "NOT_ESTABLISHED",
    "BOUNDARY_MANIFEST_CHANGED",
    "System-boundary manifest must not claim new wagering or model authority."
  );

  requireCondition(models.length > 0, "MODEL_REGISTRY_EMPTY", "Model registry must not be empty.");
  requireCondition(
    status?.models?.registered === models.length
      && status.models.researchOnly === counts.research_only
      && status.models.shadow === counts.shadow
      && status.models.validated === counts.validated
      && status.models.retired === counts.retired
      && status.models.calibrationReports === reportCount,
    "MODEL_STATUS_DRIFT",
    "Canonical model counts must match the exact registry."
  );
  requireCondition(
    models.every((model) => model?.modelStatus === "research_only")
      && counts.validated === 0
      && reportCount === 0,
    "MODEL_AUTHORITY_CHANGED",
    "Canonicalization cannot silently promote a model or add calibration authority."
  );
  requireCondition(
    status.models.registryPolicyVersion === registry.policyVersion,
    "PROMOTION_POLICY_IDENTITY_DRIFT",
    "Canonical status policy version must match the registry."
  );
  requireCondition(
    status.models.grade === "CONFIRMED"
      && status.models.predictiveEdgeGrade === "UNVERIFIED",
    "MODEL_EVIDENCE_GRADE_DRIFT",
    "Registry state is confirmed, but predictive edge must remain UNVERIFIED."
  );

  requireCondition(
    registry?.policyDigest === contentDigest(registry?.promotionPolicy)
      && objectsEqual(status?.promotionPolicy, {
        policyVersion: registry.policyVersion,
        policyDigest: registry.policyDigest,
        thresholds: registry.promotionPolicy
      }),
    "PROMOTION_POLICY_DRIFT",
    "Canonical status must bind the complete validated promotion policy and its content digest."
  );

  requireCondition(
    status?.esports?.independentProbabilityGeneratorImplemented === false
      && status.esports.historicalPointInTimeDatasetReady === false
      && status.esports.prospectiveSettledCohortSize === 0
      && status.esports.operationalBetAuthorityImplemented === false
      && status.esports.uncommittedEvaluatorDisposition === "QUARANTINED_NOT_IMPORTED"
      && status.esports.grade === "FAILED",
    "ESPORTS_STATUS_OVERCLAIMED",
    "Canonical status must not claim an implemented or authorized esports model."
  );

  requireCondition(
    status?.authority?.current?.decisionLifecycle === "LOCAL_APPEND_ONLY_JSONL"
      && status.authority.current.cloudDecisionTables === "SUPABASE_REMOTE_PROJECTION"
      && status.authority.target.decisionLifecycle
        === "SUPABASE_APPEND_ONLY_OPERATIONAL_EVENTS_AFTER_EXPLICIT_CUTOVER"
      && status.authority.cutoverComplete === false
      && status.authority.grade === "PARTIAL",
    "AUTHORITY_ARCHITECTURE_DRIFT",
    "Canonical status must distinguish current local authority from the target Supabase cutover."
  );
  requireCondition(
    objectsEqual(status?.nextProductDecision, {
      recommended: "CS2_PREMATCH_BO3_SERIES_WINNER",
      alternativesRequireExplicitSelection: true
    }),
    "NEXT_PRODUCT_DECISION_DRIFT",
    "The pinned next-product recommendation may change only through an explicit reviewed decision."
  );

  requireCondition(
    objectsEqual(status?.supabaseSnapshot, PINNED_SUPABASE_SNAPSHOT),
    "SUPABASE_EVIDENCE_DRIFT",
    "Supabase claims must match the pinned read-only runtime snapshot."
  );
  requireCondition(
    status.supabaseSnapshot.gitMigrationCount === migrationFiles.length
      && migrationFiles.includes("20260718010000_shadow_evidence_v21.sql")
      && migrationFiles.includes("20260801173038_allow_lean_decision_verdict.sql")
      && status.supabaseSnapshot.liveMissingGitMigration
        === "20260718010000_shadow_evidence_v21.sql"
      && status.supabaseSnapshot.gitIncludesLiveLeanMigration === true,
    "MIGRATION_SNAPSHOT_INVALID",
    "Canonical migration snapshot must preserve the observed Git/live difference."
  );

  requireCondition(
    Array.isArray(status?.blockingIssues)
      && REQUIRED_PERSISTENT_BLOCKERS.every((blocker) => status.blockingIssues.includes(blocker)),
    "BLOCKER_INVENTORY_INCOMPLETE",
    "Canonical status must retain every P0 blocker."
  );
  requireCondition(
    status.blockingIssues.includes(CANONICALIZATION_BLOCKER),
    "CANDIDATE_BLOCKER_STATE_DRIFT",
    "The offline candidate must require an external exact-SHA and remote-CI receipt."
  );

  for (const relativePath of REQUIRED_DOCUMENTS) {
    const content = documents[relativePath];
    requireCondition(
      typeof content === "string" && content.length > 0,
      "CANONICAL_DOCUMENT_MISSING",
      `Missing required canonical document: ${relativePath}.`
    );
    requireCondition(
      content.includes(REQUIRED_SAFETY_STATEMENT),
      "CANONICAL_SAFETY_BOUNDARY_MISSING",
      `${relativePath} must retain the exact affirmative RESEARCH_ONLY, $0, execution-disabled invariant.`
    );
  }
  requireCondition(
    documents["AGENTS.md"].includes(
      `**Models validated:** ${counts.validated}/${models.length}`
    ),
    "REVIEWER_STANDING_STATE_DRIFT",
    "AGENTS.md standing model count must agree with the evaluated registry."
  );
  requireCondition(
    documents["docs/canonical/ARCHITECTURE.md"].includes(
      REQUIRED_CURRENT_AUTHORITY_STATEMENT
    )
      && documents["docs/canonical/ARCHITECTURE.md"].includes(
        REQUIRED_TARGET_AUTHORITY_STATEMENT
      ),
    "AUTHORITY_DOCUMENT_AMBIGUOUS",
    "Architecture document must retain the exact audited CURRENT and TARGET authority statements."
  );
  requireCondition(
    documents["docs/canonical/STATUS.md"].includes(
      "Passing tests establish software behavior"
    ),
    "TEST_SCOPE_OVERCLAIMED",
    "Status document must preserve the boundary between software tests and predictive evidence."
  );
  requireCondition(
    documents["docs/canonical/STATUS.md"].includes(
      `**Candidate lifecycle:** \`${status.repository.canonicalizationState}\``
    ),
    "CANDIDATE_DOCUMENT_STATE_DRIFT",
    "Human-readable status must match the machine-readable candidate lifecycle."
  );

  requireCondition(
    objectsEqual(status?.softwareVerification?.recoveryBaseline, PINNED_RECOVERY_VERIFICATION),
    "RECOVERY_VERIFICATION_EVIDENCE_DRIFT",
    "Recovery baseline verification must match the pinned exact-commit CI observation."
  );
  requireCondition(
    status?.softwareVerification?.meaning
      === "Passing tests establish implemented software behavior, not predictive validity, calibration, profitability, provider access, or production readiness.",
    "VERIFICATION_SCOPE_DRIFT",
    "Verification meaning must retain the software-versus-predictive evidence boundary."
  );

  const candidateVerification = status?.softwareVerification?.canonicalizationCandidate;
  const { candidateContentDigest: receiptContentDigest, ...candidateReceipt } =
    candidateVerification ?? {};
  requireCondition(
    objectsEqual(candidateReceipt, PINNED_LOCAL_CANDIDATE_VERIFICATION)
      && receiptContentDigest === status.repository.candidateContentDigest
      && Number.isFinite(Date.parse(candidateVerification?.verificationNotBefore ?? "")),
    "CANDIDATE_VERIFICATION_EVIDENCE_DRIFT",
    "Local verification must match the pinned run boundary/count and the exact candidate content digest."
  );
  requireCondition(
    canonicalStatusDigest(status) === PINNED_CANONICAL_STATUS_DIGEST,
    "STATUS_SNAPSHOT_DRIFT",
    "Every material canonical-status field must match the pinned normalized status digest."
  );

  return {
    status: "PASS",
    auditScope: PINNED_EXTERNAL_EVIDENCE_SCOPE.machineAuditScope,
    repositoryStateChecked: repositoryState !== null,
    externalEvidenceAsOf: status.externalEvidenceAsOf,
    recoveryBaselineCommit: status.repository.recoveryBaselineCommit,
    canonicalizationState: status.repository.canonicalizationState,
    runtimeHeadCommit: repositoryState?.headCommit ?? null,
    workingTreeClean: repositoryState?.workingTreeClean ?? null,
    modelCount: models.length,
    validatedModelCount: counts.validated,
    authorizedStakeUsd: status.authorization.authorizedStakeUsd,
    executionEnabled: status.authorization.executionEnabled,
    gitMigrationCount: migrationFiles.length,
    blockerCount: status.blockingIssues.length
  };
}

function auditCanonicalStatus(options = {}) {
  const repoRoot = path.resolve(options.repoRoot ?? REPO_ROOT);
  const statusPath = path.join(repoRoot, "docs", "canonical", "STATUS.json");
  const migrationRoot = path.join(repoRoot, "supabase", "migrations");
  const documents = Object.fromEntries(REQUIRED_DOCUMENTS.map((relativePath) => [
    relativePath,
    fs.readFileSync(path.join(repoRoot, relativePath), "utf8")
  ]));
  const migrationFiles = fs.readdirSync(migrationRoot)
    .filter((fileName) => fileName.endsWith(".sql"))
    .sort();

  const repositoryState = readGitRepositoryState(repoRoot);

  requireCondition(
    repositoryState !== null,
    "REPOSITORY_STATE_UNAVAILABLE",
    "Canonical status cannot pass unless Git HEAD, branch, changed paths, and content digests are readable."
  );
  validateExpectedHead(repositoryState, process.env.BEAR_EDGE_EXPECTED_HEAD_SHA);

  return validateCanonicalStatusDocument(readJson(statusPath), {
    boundaries: readJson(path.join(repoRoot, "governance", "system-boundaries.json")),
    documents,
    migrationFiles,
    registry: readJson(path.join(repoRoot, "models", "registry.json")),
    repositoryState
  });
}

function main() {
  const result = auditCanonicalStatus();
  process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
}

if (require.main === module) {
  try {
    main();
  } catch (error) {
    const code = typeof error?.code === "string"
      ? error.code
      : "CANONICAL_STATUS_AUDIT_FAILED";
    const message = error instanceof Error ? error.message : "Unknown canonical status failure.";
    process.stderr.write(`${code}: ${message}\n`);
    process.exitCode = 1;
  }
}

module.exports = {
  CANONICALIZATION_BLOCKER,
  CanonicalStatusError,
  PINNED_LOCAL_CANDIDATE_VERIFICATION,
  REQUIRED_SAFETY_STATEMENT,
  REQUIRED_PERSISTENT_BLOCKERS,
  REQUIRED_DOCUMENTS,
  auditCanonicalStatus,
  canonicalStatusDigest,
  readGitRepositoryState,
  validateExpectedHead,
  validateCanonicalStatusDocument
};
