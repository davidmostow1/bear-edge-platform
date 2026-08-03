const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { spawnSync } = require("node:child_process");

const ROOT = path.resolve(__dirname, "..");
const SCRIPT = path.join(ROOT, "script", "simulate_verified_card.js");
const INPUT = path.join(ROOT, "examples", "historical-verified-card.json");

test("simulation command saves a reproducible research manifest", () => {
  const outputDir = fs.mkdtempSync(path.join(os.tmpdir(), "bear-edge-simulation-"));
  const result = spawnSync(process.execPath, [
    SCRIPT,
    "--input", INPUT,
    "--output-dir", outputDir,
    "--iterations", "3",
    "--seed", "integration-seed"
  ], {
    cwd: ROOT,
    encoding: "utf8"
  });

  assert.equal(result.status, 0, result.stderr);
  const summary = JSON.parse(result.stdout);
  const report = JSON.parse(fs.readFileSync(summary.jsonPath, "utf8"));
  const markdown = fs.readFileSync(summary.markdownPath, "utf8");

  assert.equal(report.baseline.runManifest.seed, "integration-seed");
  assert.match(report.baseline.runManifest.inputSnapshotDigest, /^sha256:[a-f0-9]{64}$/);
  assert.equal(report.baseline.runManifest.executionVenue, "research_fixture");
  assert.equal(report.baseline.evidenceClassification.auditStatus, "REPRODUCIBLE_RESEARCH_SIMULATION");
  assert.equal(report.baseline.evidenceClassification.executionGrade, false);
  assert.equal(report.baseline.evidenceClassification.betCallPermission, "PRICE_CHECK_ONLY");
  assert.equal(report.baseline.evidenceClassification.authorizedStake, 0);
  assert.match(markdown, /Audit status: `REPRODUCIBLE_RESEARCH_SIMULATION`/);
  assert.match(markdown, /Authorized stake: \$0\.00/);
  assert.match(markdown, /This artifact is reproducible research, not an executable bet/);
});
