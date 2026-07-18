const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { spawnSync } = require("node:child_process");

const ROOT = path.resolve(__dirname, "..");

test("calibration readiness command audits the ledger without treating legacy rows as evidence", () => {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "bear-edge-calibration-readiness-"));
  const ledgerPath = path.join(tempDir, "decision_log.jsonl");
  const jsonPath = path.join(tempDir, "calibration_readiness.json");
  const jsonlPath = path.join(tempDir, "calibration_dataset.jsonl");
  const markdownPath = path.join(tempDir, "calibration_readiness.md");
  fs.writeFileSync(ledgerPath, `${JSON.stringify({
    timestamp: "2026-07-17T12:00:00.000Z",
    selection: "Legacy prediction",
    verdict: "BET"
  })}\n`, "utf8");

  const result = spawnSync(process.execPath, [
    path.join(ROOT, "script/build_calibration_readiness.js"),
    "--ledger", ledgerPath,
    "--json", jsonPath,
    "--jsonl", jsonlPath,
    "--markdown", markdownPath
  ], {
    cwd: ROOT,
    encoding: "utf8"
  });

  assert.equal(result.status, 0, result.stderr);
  const report = JSON.parse(fs.readFileSync(jsonPath, "utf8"));
  const markdown = fs.readFileSync(markdownPath, "utf8");
  assert.equal(report.readiness.status, "blocked");
  assert.equal(report.projection.summary.legacyRecordCount, 1);
  assert.equal(report.projection.rows.length, 0);
  assert.ok(report.readiness.reasonCodes.includes("NO_ELIGIBLE_PREDICTIONS"));
  assert.equal(fs.readFileSync(jsonlPath, "utf8"), "");
  assert.match(markdown, /Status: blocked/);
  assert.match(markdown, /NO_ELIGIBLE_PREDICTIONS/);
  assert.match(markdown, /Legacy records \| 1/);

  fs.rmSync(tempDir, { recursive: true, force: true });
});

test("package exposes the calibration readiness audit command", () => {
  const packageJson = JSON.parse(fs.readFileSync(path.join(ROOT, "package.json"), "utf8"));

  assert.equal(
    packageJson.scripts["audit:calibration"],
    "node ./script/build_calibration_readiness.js"
  );
});
