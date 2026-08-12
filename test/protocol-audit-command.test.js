const test = require("node:test");
const assert = require("node:assert/strict");

const {
  DEFAULT_OUTPUT_PATHS,
  parseArgs
} = require("../script/build_protocol_audit.js");

test("protocol audit command uses stable report paths by default", () => {
  assert.deepEqual(parseArgs([]), {
    bankroll: undefined,
    help: false,
    ...DEFAULT_OUTPUT_PATHS
  });
});

test("protocol audit command allows explicit report paths to override defaults", () => {
  assert.deepEqual(
    parseArgs([
      "--out-json",
      "tmp/protocol.json",
      "--out-csv",
      "tmp/protocol.csv",
      "--out-md",
      "tmp/protocol.md",
      "--bankroll",
      "250"
    ]),
    {
      bankroll: 250,
      help: false,
      outJsonPath: "tmp/protocol.json",
      outCsvPath: "tmp/protocol.csv",
      outMdPath: "tmp/protocol.md"
    }
  );
});
