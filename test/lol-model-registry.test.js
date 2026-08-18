const test = require("node:test");
const assert = require("node:assert/strict");
const path = require("node:path");

const { resolveModelStatus } = require("../src/calibration/model-registry.js");

const REGISTRY_PATH = path.resolve(__dirname, "../models/registry.json");

test("LoL full-match model is registered fail-closed", () => {
  const model = resolveModelStatus(
    "SBKP-LOL-FMW-GPR-BT-0.1.0",
    "0.1.0",
    "full_match_winner",
    { registryPath: REGISTRY_PATH }
  );

  assert.ok(model);
  assert.equal(model.modelStatus, "research_only");
  assert.equal(model.calibrationReportId, null);
  assert.equal(model.calibrationReportDigest, null);
  assert.deepEqual(model.featureSet, ["best_of", "gpr_a", "gpr_b"]);
  assert.deepEqual(model.dataSources, [
    "riot_global_power_rankings",
    "riot_official_schedule"
  ]);
  assert.deepEqual(model.calculationImplementation.modules, [
    "src/research/lol-full-match-model.js"
  ]);
  assert.equal(model.calculationImplementation.probabilityExport, "predictFullMatch");
});
