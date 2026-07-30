const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");

const { createStatsigControl } = require("../src/integrations/statsig-control.js");

test("missing Statsig secret keeps every gate off", async () => {
  const control = createStatsigControl({ secret: "" });

  await control.initialize();

  assert.equal(control.checkPresentationGate("operator_1"), false);
  assert.equal(control.getShadowAssignment("operator_1"), "control");
  assert.equal(control.getStatus().mode, "control_fallback");
  assert.equal(control.getStatus().configured, false);
});

test("initialization failure remains a redacted control fallback", async () => {
  const secret = "statsig-secret-value";
  const control = createStatsigControl({
    secret,
    sdkFactory: () => ({
      client: {
        initialize: async () => {
          throw new Error(`failed with ${secret}`);
        }
      },
      createUser: (operatorId) => ({ operatorId })
    })
  });

  await control.initialize();

  const status = control.getStatus();
  assert.equal(status.mode, "control_fallback");
  assert.equal(status.configured, true);
  assert.equal(status.initialized, false);
  assert.equal(JSON.stringify(status).includes(secret), false);
  assert.equal(control.checkPresentationGate("operator_1"), false);
});

test("gate checks suppress automatic exposure and exposure is logged only after display", async () => {
  const evaluations = [];
  const exposures = [];
  const client = {
    initialize: async () => ({ isSuccess: true }),
    getFeatureGate: (user, gateName, options) => {
      evaluations.push({ user, gateName, options });
      return {
        value: gateName === "bear_edge_provenance_ui",
        ruleID: gateName === "bear_edge_provenance_ui" ? "rule_provenance" : "rule_shadow",
        details: { reason: "Network" }
      };
    },
    manuallyLogFeatureGateExposure: (user, gateName) => {
      exposures.push({ user, gateName });
    },
    shutdown: async () => ({ isSuccess: true })
  };
  const control = createStatsigControl({
    secret: "statsig-secret-value",
    environment: "development",
    sdkFactory: () => ({
      client,
      createUser: (operatorId) => ({ operatorId })
    })
  });

  await control.initialize();

  assert.equal(control.checkPresentationGate("operator_1"), true);
  assert.equal(control.getShadowAssignment("operator_1"), "control");
  assert.equal(evaluations.length, 2);
  assert.equal(evaluations.every((entry) => entry.options.disableExposureLogging === true), true);
  assert.equal(exposures.length, 0);

  const exposure = control.recordExposure("bear_edge_provenance_ui", "operator_1");
  assert.equal(exposures.length, 1);
  assert.deepEqual(exposure, {
    gateName: "bear_edge_provenance_ui",
    value: true,
    ruleId: "rule_provenance",
    controlReason: "Network",
    exposedAt: exposure.exposedAt
  });
  assert.equal(typeof exposure.exposedAt, "string");

  await control.shutdown();
  assert.equal(control.getStatus().initialized, false);
});

test("Statsig control source cannot authorize betting or size stakes", () => {
  const source = fs.readFileSync(require.resolve("../src/integrations/statsig-control.js"), "utf8");

  assert.doesNotMatch(source, /VERIFIED_BETS_ALLOWED/);
  assert.doesNotMatch(source, /verdict\s*=/);
  assert.doesNotMatch(source, /recommendedStake/);
  assert.doesNotMatch(source, /kelly/i);
});
