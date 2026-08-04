const { safeErrorMessage } = require("../config/secrets.js");

const PRESENTATION_GATE = "bear_edge_provenance_ui";
const SHADOW_GATE = "bear_edge_shadow_model";
const ALLOWED_GATES = new Set([PRESENTATION_GATE, SHADOW_GATE]);

function defaultSdkFactory(options) {
  const { Statsig, StatsigUser } = require("@statsig/statsig-node-core");
  const client = new Statsig(options.secret, {
    environment: options.environment,
    initTimeoutMs: options.initializeTimeoutMs,
    outputLogLevel: "error"
  });

  return {
    client,
    createUser: (operatorId) => new StatsigUser({ userID: operatorId })
  };
}

function redactConfiguredSecret(error, secret) {
  const message = safeErrorMessage(error);
  return secret ? message.replaceAll(secret, "[REDACTED]") : message;
}

function withTimeout(promise, timeoutMs) {
  let timeout;
  const timeoutPromise = new Promise((_, reject) => {
    timeout = setTimeout(() => reject(new Error("Statsig initialization timed out.")), timeoutMs);
  });

  return Promise.race([promise, timeoutPromise]).finally(() => clearTimeout(timeout));
}

function createStatsigControl(options = {}) {
  const secret = String(options.secret ?? process.env.STATSIG_SERVER_SDK_SECRET ?? "").trim();
  const environment = String(options.environment ?? process.env.STATSIG_ENVIRONMENT ?? "development").trim();
  const defaultOperatorId = String(options.operatorId ?? process.env.BEAR_EDGE_OPERATOR_ID ?? "local_operator").trim();
  const initializeTimeoutMs = Number.isFinite(options.initializeTimeoutMs)
    ? Math.max(100, Number(options.initializeTimeoutMs))
    : 5000;
  const evaluations = new Map();
  let client = null;
  let createUser = null;
  let initialized = false;
  let lastSafeError = null;
  let initializedAt = null;

  function status() {
    return {
      provider: "statsig",
      configured: Boolean(secret),
      initialized,
      mode: initialized ? "remote_control" : "control_fallback",
      environment,
      gates: {
        presentation: PRESENTATION_GATE,
        shadow: SHADOW_GATE
      },
      lastSafeError,
      initializedAt,
      secretReturned: false
    };
  }

  async function initialize() {
    if (!secret) {
      return status();
    }

    try {
      const sdk = (options.sdkFactory ?? defaultSdkFactory)({
        environment,
        initializeTimeoutMs,
        secret
      });
      client = sdk.client;
      createUser = sdk.createUser;
      const result = await withTimeout(Promise.resolve(client.initialize()), initializeTimeoutMs);

      if (result?.isSuccess === false) {
        throw new Error(result.error ?? "Statsig initialization failed.");
      }

      initialized = true;
      initializedAt = new Date().toISOString();
      lastSafeError = null;
    } catch (error) {
      initialized = false;
      client = null;
      createUser = null;
      lastSafeError = redactConfiguredSecret(error, secret);
    }

    return status();
  }

  function operatorUser(operatorId) {
    const resolvedId = String(operatorId ?? defaultOperatorId).trim() || defaultOperatorId;
    return createUser(resolvedId);
  }

  function evaluationKey(gateName, operatorId) {
    return `${String(operatorId ?? defaultOperatorId)}:${gateName}`;
  }

  function evaluateGate(gateName, operatorId) {
    if (!ALLOWED_GATES.has(gateName) || !initialized || !client || !createUser) {
      return {
        gateName,
        value: false,
        ruleId: null,
        controlReason: "control_fallback"
      };
    }

    try {
      const user = operatorUser(operatorId);
      const result = client.getFeatureGate(user, gateName, {
        disableExposureLogging: true
      });
      const evaluation = {
        gateName,
        value: result?.value === true,
        ruleId: result?.ruleID ?? result?.ruleId ?? null,
        controlReason: result?.details?.reason ?? "remote_evaluation"
      };
      evaluations.set(evaluationKey(gateName, operatorId), { evaluation, user });
      return evaluation;
    } catch (error) {
      lastSafeError = redactConfiguredSecret(error, secret);
      return {
        gateName,
        value: false,
        ruleId: null,
        controlReason: "evaluation_failure"
      };
    }
  }

  function checkPresentationGate(operatorId) {
    return evaluateGate(PRESENTATION_GATE, operatorId).value;
  }

  function getShadowAssignment(operatorId) {
    return evaluateGate(SHADOW_GATE, operatorId).value ? "shadow" : "control";
  }

  function recordExposure(gateName, operatorId) {
    const stored = evaluations.get(evaluationKey(gateName, operatorId));
    const evaluation = stored?.evaluation ?? {
      gateName,
      value: false,
      ruleId: null,
      controlReason: "not_evaluated"
    };

    if (ALLOWED_GATES.has(gateName) && initialized && stored && client) {
      try {
        client.manuallyLogFeatureGateExposure(stored.user, gateName);
      } catch (error) {
        lastSafeError = redactConfiguredSecret(error, secret);
      }
    }

    return {
      gateName,
      value: evaluation.value,
      ruleId: evaluation.ruleId,
      controlReason: evaluation.controlReason,
      exposedAt: new Date().toISOString()
    };
  }

  async function shutdown() {
    if (client && initialized) {
      try {
        await client.shutdown();
      } catch (error) {
        lastSafeError = redactConfiguredSecret(error, secret);
      }
    }

    initialized = false;
    client = null;
    createUser = null;
    evaluations.clear();
    return status();
  }

  return {
    checkPresentationGate,
    getShadowAssignment,
    getStatus: status,
    initialize,
    recordExposure,
    shutdown
  };
}

module.exports = {
  PRESENTATION_GATE,
  SHADOW_GATE,
  createStatsigControl
};
