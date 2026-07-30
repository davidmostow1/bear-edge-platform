const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { spawnSync } = require("node:child_process");
const test = require("node:test");
const assert = require("node:assert/strict");

const ROOT_DIR = path.resolve(__dirname, "..");
const SIMULATOR_PATH = path.join(ROOT_DIR, "script", "simulate_verified_card.js");

test("verified-card simulator and README have portable repository defaults", (t) => {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "bear-edge-simulation-"));
  t.after(() => fs.rmSync(tempDir, { recursive: true, force: true }));

  const simulatorSource = fs.readFileSync(SIMULATOR_PATH, "utf8");
  const readme = fs.readFileSync(path.join(ROOT_DIR, "README.md"), "utf8");

  assert.doesNotMatch(simulatorSource, /\/Users\//);
  assert.doesNotMatch(readme, /\/Users\//);

  const result = spawnSync(
    process.execPath,
    [SIMULATOR_PATH, "--output-dir", tempDir, "--iterations", "2"],
    { cwd: ROOT_DIR, encoding: "utf8" }
  );

  assert.equal(result.status, 0, result.stderr);
  const output = JSON.parse(result.stdout);

  assert.equal(output.trials, 2);
  for (const filePath of [output.jsonPath, output.csvPath, output.markdownPath]) {
    assert.equal(path.dirname(filePath), tempDir);
    assert.equal(fs.existsSync(filePath), true);
  }
});
