const test = require("node:test");
const assert = require("node:assert/strict");

const {
  MODEL_ID,
  MODEL_VERSION,
  MODEL_STATUS,
  gameWinProbability,
  seriesWinProbability,
  predictFullMatch
} = require("../src/research/lol-full-match-model.js");

test("equal GPR ratings produce 50% game and series probabilities", () => {
  assert.equal(gameWinProbability(1500, 1500), 0.5);
  assert.equal(seriesWinProbability(0.5, 1), 0.5);
  assert.ok(Math.abs(seriesWinProbability(0.5, 3) - 0.5) < 1e-15);
  assert.ok(Math.abs(seriesWinProbability(0.5, 5) - 0.5) < 1e-15);
});

test("higher GPR rating raises full-match win probability", () => {
  const gameProbability = gameWinProbability(1600, 1400);
  assert.ok(gameProbability > 0.5);
  assert.ok(seriesWinProbability(gameProbability, 3) > 0.5);
});

test("best-of series probability is exact majority probability", () => {
  const p = 0.7;
  const expectedBo3 = p ** 2 + 2 * p ** 2 * (1 - p);
  assert.ok(Math.abs(seriesWinProbability(p, 3) - expectedBo3) < 1e-15);
});

test("prediction output is independent from prediction-market prices", () => {
  const prediction = predictFullMatch({
    teamA: "Gen.G",
    teamB: "kt Rolster",
    gprA: 1527,
    gprB: 1384,
    bestOf: 3,
    generatedAt: "2026-08-17T19:03:20.000Z",
    evidenceCutoffAt: "2026-08-17T19:03:20.000Z"
  });

  assert.equal(prediction.modelId, MODEL_ID);
  assert.equal(prediction.modelVersion, MODEL_VERSION);
  assert.equal(prediction.modelStatus, MODEL_STATUS);
  assert.equal(prediction.marketOddsUsed, false);
  assert.equal(prediction.calibratedProbabilityA, null);
  assert.equal(prediction.uncertaintyLowA, null);
  assert.equal(prediction.uncertaintyHighA, null);
  assert.ok(prediction.rawProbabilityA > 0.5);
});

test("invalid inputs fail closed", () => {
  assert.throws(() => gameWinProbability(Number.NaN, 1400), /finite/);
  assert.throws(() => seriesWinProbability(1.1, 3), /between 0 and 1/);
  assert.throws(() => seriesWinProbability(0.6, 2), /positive odd integer/);
  assert.throws(() => predictFullMatch({
    teamA: "A",
    teamB: "B",
    gprA: 1500,
    gprB: 1400,
    bestOf: 3,
    generatedAt: "2026-08-17T20:00:00.000Z",
    evidenceCutoffAt: "2026-08-17T20:01:00.000Z"
  }), /evidenceCutoffAt/);
});
