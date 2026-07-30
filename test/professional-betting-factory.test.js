const path = require("node:path");
const test = require("node:test");
const assert = require("node:assert/strict");

const {
  auditProfessionalBettingFactory,
  loadProfessionalBettingRequirements,
  renderProfessionalBettingFactoryMarkdown
} = require("../src/audit/professional-betting-factory.js");

const ROOT_DIR = path.resolve(__dirname, "..");
const SOURCE_PATH = path.join(
  ROOT_DIR,
  "governance",
  "source",
  "professional-betting-factory-source.txt"
);

test("professional betting factory manifest accounts for the exact 600-line source", async () => {
  const manifest = await loadProfessionalBettingRequirements({ rootDir: ROOT_DIR });
  const audit = await auditProfessionalBettingFactory({
    rootDir: ROOT_DIR,
    sourcePath: SOURCE_PATH,
    manifest
  });

  assert.equal(audit.source.expectedSha256, "2263a4f1900c2a5458404daf0d1df9850e13045cf0b1e7c4dba7f005837381f5");
  assert.equal(audit.source.actualSha256, audit.source.expectedSha256);
  assert.equal(audit.source.actualLineCount, 600);
  assert.equal(audit.source.unaccountedLines.length, 0);
  assert.ok(audit.summary.requirementCount >= 90);
  assert.equal(audit.summary.duplicateIds.length, 0);
  assert.equal(audit.summary.unknownCount, 0);
  assert.equal(audit.summary.invalidRequirements.length, 0);
  assert.equal(audit.summary.missingEvidence.length, 0);
  assert.equal(audit.dispositionComplete, true);
});

test("factory manifest includes every required architecture and conduct control", async () => {
  const manifest = await loadProfessionalBettingRequirements({ rootDir: ROOT_DIR });
  const ids = new Set(manifest.requirements.map((requirement) => requirement.id));
  const mandatoryIds = [
    "ARCH-THREE-ENGINES",
    "MARKET-MULTI-BOOK",
    "MARKET-REMOVE-VIG",
    "MARKET-WEIGHT-BOOKS",
    "MARKET-CONSENSUS",
    "MARKET-OUTLIER-DETECTION",
    "MODEL-INDEPENDENT-PROBABILITY",
    "MODEL-UNCERTAINTY",
    "MODEL-CALIBRATION",
    "MODEL-SHRINKAGE",
    "DECISION-MINIMUM-PRICE",
    "DECISION-BEST-PRICE",
    "DECISION-EXPLICIT-EXPIRY",
    "DECISION-PASS-WAIT-BET",
    "RISK-CORRELATED-EXPOSURE",
    "RISK-DAILY-CAP",
    "LEARNING-CLOSING-LINE-VALUE",
    "LEARNING-MODEL-DRIFT",
    "DATA-IMMUTABLE-RECORDS",
    "EXECUTION-AUTOMATIC-WITHDRAWAL",
    "PROHIBIT-AUTOMATIC-WAGERING",
    "PROHIBIT-CONCEALED-IDENTITIES",
    "PROHIBIT-ACCOUNT-SHARING",
    "PROHIBIT-LINE-MANIPULATION",
    "PROHIBIT-UNLICENSED-DATA",
    "PROHIBIT-INSIDE-INFORMATION",
    "PROHIBIT-RETROSPECTIVE-INSERTION",
    "PROHIBIT-DELETING-LOSSES",
    "PROHIBIT-UNPROVEN-WIN-RATE",
    "PROHIBIT-BET-EVERY-DISCREPANCY",
    "PROHIBIT-HISTORICAL-ROI-ONLY"
  ];

  for (const id of mandatoryIds) {
    assert.equal(ids.has(id), true, `Missing mandatory factory requirement ${id}`);
  }

  for (const requirement of manifest.requirements) {
    assert.notEqual(requirement.status, "unknown", `${requirement.id} has an unknown disposition`);
    assert.ok(requirement.sourceLines.length > 0, `${requirement.id} has no source lines`);
    assert.ok(requirement.evidence.length > 0, `${requirement.id} has no evidence or blocker record`);

    if (requirement.status === "blocked_external") {
      assert.ok(requirement.blocker, `${requirement.id} has no external blocker explanation`);
    }

    if (requirement.status === "prohibited_by_design") {
      assert.ok(requirement.prohibitionReason, `${requirement.id} has no prohibition rationale`);
    }
  }
});

test("factory Markdown renders every atomic requirement without truncation", async () => {
  const manifest = await loadProfessionalBettingRequirements({ rootDir: ROOT_DIR });
  const audit = await auditProfessionalBettingFactory({
    rootDir: ROOT_DIR,
    sourcePath: SOURCE_PATH,
    manifest
  });
  const markdown = renderProfessionalBettingFactoryMarkdown(manifest, audit);

  for (const requirement of manifest.requirements) {
    assert.ok(markdown.includes(`### ${requirement.id}`), `Markdown omitted ${requirement.id}`);

    if (requirement.blocker) {
      assert.ok(markdown.includes(requirement.blocker), `Markdown omitted blocker for ${requirement.id}`);
    }

    if (requirement.prohibitionReason) {
      assert.ok(
        markdown.includes(requirement.prohibitionReason),
        `Markdown omitted prohibition rationale for ${requirement.id}`
      );
    }
  }
});
