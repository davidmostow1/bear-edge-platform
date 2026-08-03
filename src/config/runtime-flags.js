const ENABLED_ENV_VALUES = new Set(["1", "true", "yes", "on"]);

function isEnvironmentFlagEnabled(value) {
  return ENABLED_ENV_VALUES.has(String(value ?? "").trim().toLowerCase());
}

function isBearEdgeTestModeEnabled(env = process.env) {
  return env.NODE_ENV === "test" && isEnvironmentFlagEnabled(env.BEAR_EDGE_TEST_MODE);
}

module.exports = {
  isBearEdgeTestModeEnabled,
  isEnvironmentFlagEnabled
};
