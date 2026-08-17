#!/usr/bin/env node

const fs = require("node:fs");
const path = require("node:path");
const { execFileSync } = require("node:child_process");

const { contentDigest } = require("../src/audit/canonical-json.js");

const REPO_ROOT = path.resolve(__dirname, "..");
const DIGEST_PATTERN = /^[a-f0-9]{64}$/;
const PINNED_CANONICAL_STATUS_DIGEST =
  "b5f06dbda954a0e823eccaf5104f9e594f42174f4ce07b01de3e79f77bd878f8";
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
  "CANONICAL_BRANCH_PROTECTION_UNCONFIGURED",
  "SUPABASE_V2_1_SYNC_NOT_COMPATIBILITY_PROVEN",
  "EXTERNAL_RECEIPT_SOURCE_ATTESTATION_UNAVAILABLE",
  "NO_VALIDATED_MODEL",
  "NO_CALIBRATION_REPORT",
  "NO_PROSPECTIVE_SETTLED_COHORT",
  "NO_PROVEN_PREDICTIVE_EDGE",
  "NO_ESPORTS_HISTORICAL_PIPELINE",
  "SOURCE_RIGHTS_AND_LINEAGE_UNRESOLVED",
  "SUPABASE_AUTHORITY_CUTOVER_NOT_IMPLEMENTED"
]);
const CANONICAL_BRANCH_PROTECTION_BLOCKER =
  "CANONICAL_BRANCH_PROTECTION_UNCONFIGURED";
const SUPPORTED_CANONICAL_STATE = "MERGED_RESEARCH_BASELINE";
const PINNED_CANONICAL_BASELINE = Object.freeze({
  commit: "3698869087ab95dc2890079d7b7c615a32cfc8c3",
  tree: "3eda1f4fc2e847d491c8ec2615564eddaed23e73",
  pullRequest: 31,
  mergeMethod: "MERGE_COMMIT"
});
const PINNED_PROJECTION_HARDENING = Object.freeze({
  pullRequest: 32,
  headCommit: "52380ca495bb8ff2034031c377496e531d560f73",
  mergeCommit: "b6c19292f96a0787fa6e198e8b8179db763390fe",
  tree: "09b55d04f9b4f0bdc13069c5376f8e5e5a2a973f",
  mergeMethod: "MERGE_COMMIT"
});
const PINNED_REPOSITORY_SNAPSHOT = Object.freeze({
  fullName: "davidmostow1/bear-edge-platform",
  defaultBranch: "master",
  defaultBranchCommit: PINNED_PROJECTION_HARDENING.mergeCommit,
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
const PINNED_CANONICAL_VERIFICATION = Object.freeze({
  commit: PINNED_CANONICAL_BASELINE.commit,
  tree: PINNED_CANONICAL_BASELINE.tree,
  environment: "LOCAL_CLEAN_CHECKOUT_AND_GITHUB_ACTIONS_NODE_20",
  command: "npm run verify",
  passed: 756,
  failed: 0,
  grade: "CONFIRMED",
  remoteRunUrl: "https://github.com/davidmostow1/bear-edge-platform/actions/runs/31633987337",
  packageSmoke: "PASS_ON_IDENTICAL_TREE_IN_SEPARATE_TEMP_INSTALL"
});
const PINNED_PROJECTION_HARDENING_VERIFICATION = Object.freeze({
  commit: PINNED_PROJECTION_HARDENING.mergeCommit,
  tree: PINNED_PROJECTION_HARDENING.tree,
  environment: "LOCAL_CLEAN_CHECKOUT_AND_GITHUB_ACTIONS_NODE_20",
  command: "npm run verify",
  passed: 776,
  failed: 0,
  grade: "CONFIRMED",
  remoteRunUrl: "https://github.com/davidmostow1/bear-edge-platform/actions/runs/31639833629",
  packageSmoke: "NOT_SEPARATELY_REPEATED_ON_HARDENED_TREE"
});
const PINNED_SUPABASE_SNAPSHOT = Object.freeze({
  observedAt: "2026-08-12T21:06:21.958Z",
  projectRef: "anxouzruouyraumgjdju",
  postgresVersion: "17.6",
  decisionRecords: 12,
  settlementRecords: 0,
  recordAmendments: 0,
  predictionOutcomes: 0,
  closingPrices: 0,
  edgeFunctions: 0,
  liveMigrationCount: 18,
  gitMigrationCount: 18,
  currentAuditRecordSchemaVersion: "2.1.0",
  liveAuditRecordSchemaVersions: Object.freeze(["2.0.0", "2.1.0"]),
  liveDecisionRecordSchemaVersions: Object.freeze({
    "2.0.0": 12,
    "2.1.0": 0
  }),
  shadowEvidenceMigrationApplied: true,
  hardeningMigrationApplied: true,
  currentRecordSyncCompatible: false,
  liveMissingGitMigrations: Object.freeze([]),
  authenticatedProjectionInsertExposed: false,
  snapshotChecksFailClosed: true,
  shadowRetryIdempotencyProven: true,
  pgliteRuntimeProofPassed: true,
  hostedSingleSessionRuntimeProofPassed: true,
  hostedMultiSessionConcurrencyProven: false,
  hostedPostgrestAuthProven: false,
  catalogControlsVerified: true,
  canonicalParentDecisionRecords: 0,
  gitIncludesLiveLeanMigration: true,
  leakedPasswordProtectionWarning: true,
  grade: "PARTIAL"
});
const PINNED_EXTERNAL_EVIDENCE_SCOPE = Object.freeze({
  snapshotId: "bear-edge.external-audit.2026-08-12.v3",
  observationMode: "DIRECT_CONNECTOR_AND_LOCAL_EXACT_SHA",
  receiptPath: "docs/canonical/receipts/p0-hardening-deployment-20260812.json",
  receiptRetention: "NORMALIZED_CONTENT_ADDRESSED_FACTS_RAW_CONNECTOR_PAYLOAD_NOT_RETAINED",
  receiptDigest: "5a2dcbd99122fa9a4eaa67ac16a3e6c9b66679bb7f3c3cc8a43d4c31630716fb",
  refreshRequiredBeforeClaimChange: true,
  machineAuditScope: "LOCAL_INVARIANTS_CANONICAL_BASELINE_ANCESTRY_AND_PINNED_EXTERNAL_RECEIPT"
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

function canonicalStatusDigest(status) {
  return contentDigest(status);
}

function readGitRepositoryState(repoRoot) {
  try {
    const baselineCommit = PINNED_CANONICAL_BASELINE.commit;
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
    const baselineTree = execFileSync(
      "git",
      ["-C", repoRoot, "rev-parse", `${baselineCommit}^{tree}`],
      { encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] }
    ).trim();
    const workingTreeClean = execFileSync(
      "git",
      ["-C", repoRoot, "status", "--porcelain=v1", "-z", "--untracked-files=all"],
      { encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] }
    ).length === 0;
    return {
      branch,
      canonicalBaselineCommit: baselineCommit,
      canonicalBaselineTree: baselineTree,
      headCommit,
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
  const {
    boundaries,
    documents,
    migrationFiles,
    predecessorReceipt,
    receipt,
    registry,
    repositoryState = null
  } = context;
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
      && status.repository.canonicalBaselineCommit === PINNED_CANONICAL_BASELINE.commit
      && status.repository.canonicalBaselineTree === PINNED_CANONICAL_BASELINE.tree
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
    "The merged research baseline must remain PARTIAL until branch protection is configured."
  );
  requireCondition(
    status.repository.canonicalizationState === SUPPORTED_CANONICAL_STATE,
    "CANONICAL_LIFECYCLE_DRIFT",
    "The canonical lifecycle must identify the reviewed merged research baseline."
  );
  requireCondition(
    status.repository.commitIdentityMode
      === "CANONICAL_BASELINE_ANCESTRY_PLUS_RUNTIME_EXACT_SHA"
      && status.repository.pullRequest === PINNED_CANONICAL_BASELINE.pullRequest
      && status.repository.mergeMethod === PINNED_CANONICAL_BASELINE.mergeMethod
      && objectsEqual(status.repository.projectionHardening, PINNED_PROJECTION_HARDENING)
      && status.repository.branchProtected === false
      && status.repository.repositoryRulesetCount === 0,
    "CANONICAL_IDENTITY_INVALID",
    "The repository receipt must identify the merged baseline and its still-unprotected branch state."
  );
  if (repositoryState !== null) {
    requireCondition(
      repositoryState.canonicalBaselineCommit === PINNED_CANONICAL_BASELINE.commit
        && repositoryState.canonicalBaselineTree === PINNED_CANONICAL_BASELINE.tree,
      "CANONICAL_BASELINE_ANCESTRY_DRIFT",
      "Current Git HEAD must descend from the reviewed canonical baseline merge commit."
    );
  }
  requireCondition(
    objectsEqual(status?.externalEvidence, PINNED_EXTERNAL_EVIDENCE_SCOPE)
      && DIGEST_PATTERN.test(status.externalEvidence.receiptDigest),
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
    status?.esports?.sourceContractImplemented === true
      && status.esports.syntheticDatasetProofImplemented === false
      && status.esports.realCorpusAuthorized === false
      && status.esports.independentProbabilityGeneratorImplemented === true
      && status.esports.independentProbabilityGeneratorScope
        === "CS2_DOTA2_LOL_VALORANT_PREMATCH_SERIES_WINNER"
      && objectsEqual(status.esports.independentProbabilityGeneratorModels, [
        "cs2_elo_series_v1@1.0.0",
        "dota_elo_series_v1@1.0.0",
        "lol_elo_series_v1@1.0.0",
        "valorant_elo_series_v1@1.0.0"
      ])
      && status.esports.historicalPointInTimeDatasetReady === false
      && status.esports.prospectiveSettledCohortSize === 0
      && status.esports.operationalBetAuthorityImplemented === false
      && status.esports.uncommittedEvaluatorDisposition === "IMPORTED_ON_INTEGRATION_BRANCH_NOT_MERGED"
      && status.esports.grade === "PARTIAL",
    "ESPORTS_STATUS_OVERCLAIMED",
    "Canonical status must describe the four game-scoped independent generators without inventing predictive validation or wagering authority."
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
      selected: "DOTA2_PREMATCH_BO3_SERIES_WINNER",
      selectedByUser: true,
      selectedOn: "2026-08-12"
    }),
    "NEXT_PRODUCT_DECISION_DRIFT",
    "The pinned next-product selection may change only through an explicit reviewed decision."
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
      && migrationFiles.includes("20260812195952_harden_authoritative_projections.sql")
      && status.supabaseSnapshot.shadowEvidenceMigrationApplied === true
      && status.supabaseSnapshot.hardeningMigrationApplied === true
      && status.supabaseSnapshot.liveMigrationCount === migrationFiles.length
      && status.supabaseSnapshot.liveMissingGitMigrations.length === 0
      && status.supabaseSnapshot.gitIncludesLiveLeanMigration === true,
    "MIGRATION_SNAPSHOT_INVALID",
    "Canonical migration snapshot must preserve the observed complete hardening deployment."
  );

  requireCondition(
    Array.isArray(status?.blockingIssues)
      && REQUIRED_PERSISTENT_BLOCKERS.every((blocker) => status.blockingIssues.includes(blocker)),
    "BLOCKER_INVENTORY_INCOMPLETE",
    "Canonical status must retain every P0 blocker."
  );
  requireCondition(
    status.blockingIssues.includes(CANONICAL_BRANCH_PROTECTION_BLOCKER),
    "CANONICAL_PROTECTION_BLOCKER_DRIFT",
    "The unprotected default branch must remain an explicit blocker."
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
      `**Baseline lifecycle:** \`${status.repository.canonicalizationState}\``
    ),
    "CANONICAL_DOCUMENT_STATE_DRIFT",
    "Human-readable status must match the machine-readable baseline lifecycle."
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

  requireCondition(
    objectsEqual(status?.softwareVerification?.canonicalBaseline, PINNED_CANONICAL_VERIFICATION),
    "CANONICAL_VERIFICATION_EVIDENCE_DRIFT",
    "Canonical baseline verification must match the exact merge commit, tree, test count, and CI receipt."
  );
  requireCondition(
    objectsEqual(
      status?.softwareVerification?.projectionHardening,
      PINNED_PROJECTION_HARDENING_VERIFICATION
    ),
    "PROJECTION_HARDENING_VERIFICATION_EVIDENCE_DRIFT",
    "Projection hardening verification must match the exact merge commit, tree, tests, and CI receipt."
  );
  requireCondition(
    receipt?.predecessor?.path === "docs/canonical/receipts/p0-baseline-20260812.json"
      && DIGEST_PATTERN.test(receipt.predecessor.contentDigest)
      && contentDigest(predecessorReceipt) === receipt.predecessor.contentDigest,
    "EXTERNAL_RECEIPT_CHAIN_DRIFT",
    "The hardening receipt must bind the retained canonical predecessor receipt."
  );
  requireCondition(
    contentDigest(receipt) === status.externalEvidence.receiptDigest,
    "EXTERNAL_RECEIPT_DIGEST_DRIFT",
    "The normalized external receipt digest must match its canonical JSON content."
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
    canonicalBaselineCommit: status.repository.canonicalBaselineCommit,
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
    "Canonical status cannot pass unless Git HEAD and canonical-baseline ancestry are readable."
  );
  validateExpectedHead(repositoryState, process.env.BEAR_EDGE_EXPECTED_HEAD_SHA);

  return validateCanonicalStatusDocument(readJson(statusPath), {
    boundaries: readJson(path.join(repoRoot, "governance", "system-boundaries.json")),
    documents,
    migrationFiles,
    predecessorReceipt: readJson(path.join(
      repoRoot,
      "docs",
      "canonical",
      "receipts",
      "p0-baseline-20260812.json"
    )),
    receipt: readJson(path.join(repoRoot, PINNED_EXTERNAL_EVIDENCE_SCOPE.receiptPath)),
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
  CANONICAL_BRANCH_PROTECTION_BLOCKER,
  CanonicalStatusError,
  PINNED_CANONICAL_VERIFICATION,
  REQUIRED_SAFETY_STATEMENT,
  REQUIRED_PERSISTENT_BLOCKERS,
  REQUIRED_DOCUMENTS,
  auditCanonicalStatus,
  canonicalStatusDigest,
  readGitRepositoryState,
  validateExpectedHead,
  validateCanonicalStatusDocument
};
