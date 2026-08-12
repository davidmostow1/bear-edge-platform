const test = require("node:test");
const assert = require("node:assert/strict");

const {
  isBearEdgeTestModeEnabled
} = require("../src/config/runtime-flags.js");

test("fixture mode stays disabled outside the test environment", () => {
  assert.equal(isBearEdgeTestModeEnabled({
    NODE_ENV: "production",
    BEAR_EDGE_TEST_MODE: "1"
  }), false);
  assert.equal(isBearEdgeTestModeEnabled({
    BEAR_EDGE_TEST_MODE: "true"
  }), false);
});

test("fixture mode requires both the test environment and explicit opt-in", () => {
  assert.equal(isBearEdgeTestModeEnabled({
    NODE_ENV: "test",
    BEAR_EDGE_TEST_MODE: "1"
  }), true);
  assert.equal(isBearEdgeTestModeEnabled({
    NODE_ENV: "test",
    BEAR_EDGE_TEST_MODE: "false"
  }), false);
});
