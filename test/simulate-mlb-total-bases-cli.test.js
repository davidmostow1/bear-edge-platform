const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { spawnSync } = require("node:child_process");

function writeInput(directory, overrides = {}) {
  const inputPath = path.join(directory, "input.json");
  const payload = {
    slateDate: "2026-07-20",
    generatedAt: "2026-07-20T14:00:00.000Z",
    candidates: [
      {
        eventId: "mlb-2026-07-20-pit-nyy",
        playerId: "player-123",
        playerName: "Example Hitter",
        matchup: "PIT @ NYY",
        gameStatus: "pregame",
        lineupConfirmed: true,
        battingOrderSlot: 2,
        sportsbook: "DraftKings",
        capturedAt: "2026-07-20T14:00:00.000Z",
        threshold: 1.5,
        side: "over",
        draftKingsOdds: 120,
        oppositeOdds: -150,
        bankroll: 100,
        marketWeight: 0.75,
        requiredEvRoi: 0.04,
        seed: "cli-tb-v1",
        iterations: 5000,
        plateAppearances: [
          { value: 4, probability: 0.5 },
          { value: 5, probability: 0.5 }
        ],
        outcomeProbabilities: {
          0: 0.65,
          1: 0.22,
          2: 0.08,
          3: 0.01,
          4: 0.04
        },
        ...overrides
      }
    ]
  };
  fs.writeFileSync(inputPath, `${JSON.stringify(payload, null, 2)}\n`);
  return inputPath;
}

function runCli(inputPath, outputPath) {
  return spawnSync(process.execPath, [
    path.resolve("script/simulate_mlb_total_bases.js"),
    "--input",
    inputPath,
    "--output",
    outputPath
  ], {
    cwd: path.resolve("."),
    encoding: "utf8"
  });
}

test("total-bases CLI writes deterministic shadow-mode JSON", () => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), "bear-edge-tb-cli-"));
  const inputPath = writeInput(directory);
  const firstOutput = path.join(directory, "first.json");
  const secondOutput = path.join(directory, "second.json");

  const first = runCli(inputPath, firstOutput);
  const second = runCli(inputPath, secondOutput);

  assert.equal(first.status, 0, first.stderr);
  assert.equal(second.status, 0, second.stderr);

  const firstPayload = JSON.parse(fs.readFileSync(firstOutput, "utf8"));
  const secondPayload = JSON.parse(fs.readFileSync(secondOutput, "utf8"));

  assert.equal(firstPayload.mode, "shadow");
  assert.equal(firstPayload.executionBook, "DraftKings");
  assert.equal(firstPayload.results.length, 1);
  assert.equal(firstPayload.results[0].authorizedStake, 0);
  assert.deepEqual(firstPayload.results, secondPayload.results);
});

test("total-bases CLI preserves WAIT when lineup is unconfirmed", () => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), "bear-edge-tb-cli-wait-"));
  const inputPath = writeInput(directory, { lineupConfirmed: false });
  const outputPath = path.join(directory, "result.json");
  const run = runCli(inputPath, outputPath);

  assert.equal(run.status, 0, run.stderr);
  const payload = JSON.parse(fs.readFileSync(outputPath, "utf8"));
  assert.equal(payload.results[0].verdict, "WAIT");
  assert.ok(payload.results[0].riskFlags.includes("LINEUP_UNCONFIRMED"));
});
