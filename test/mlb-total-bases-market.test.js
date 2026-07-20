const test = require("node:test");
const assert = require("node:assert/strict");

const {
  evaluateTotalBasesCandidate
} = require("../src/mlb/total-bases-market.js");

function validInput(overrides = {}) {
  return {
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
    seed: "tb-market-v1",
    iterations: 10000,
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
  };
}

test("evaluateTotalBasesCandidate combines simulation with paired DraftKings prices", () => {
  const result = evaluateTotalBasesCandidate(validInput());

  assert.equal(result.executionBook, "DraftKings");
  assert.equal(result.threshold, 1.5);
  assert.equal(result.side, "over");
  assert.equal(result.simulation.iterations, 10000);
  assert.ok(result.rawModelProbability > 0 && result.rawModelProbability < 1);
  assert.ok(result.noVigMarketProbability > 0 && result.noVigMarketProbability < 1);
  assert.ok(result.adjustedProbability > 0 && result.adjustedProbability < 1);
  assert.ok(Number.isInteger(result.fairAmericanOdds));
  assert.ok(Number.isFinite(result.expectedValueRoi));
  assert.ok(result.quarterKellyFraction >= 0);
  assert.ok(result.maximumAcceptableAmericanOdds !== 0);
  assert.ok(["BET", "LEAN", "WAIT", "PASS"].includes(result.verdict));
});

test("evaluateTotalBasesCandidate applies exact side probability independently", () => {
  const over = evaluateTotalBasesCandidate(validInput({ side: "over" }));
  const under = evaluateTotalBasesCandidate(validInput({
    side: "under",
    draftKingsOdds: -150,
    oppositeOdds: 120
  }));

  assert.ok(Math.abs(over.rawModelProbability + under.rawModelProbability - 1) < 1e-12);
});

test("evaluateTotalBasesCandidate fails closed without paired DraftKings prices", () => {
  assert.throws(
    () => evaluateTotalBasesCandidate(validInput({ oppositeOdds: null })),
    /oppositeOdds is required/
  );

  assert.throws(
    () => evaluateTotalBasesCandidate(validInput({ draftKingsOdds: null })),
    /draftKingsOdds is required/
  );
});

test("evaluateTotalBasesCandidate blocks live games and unconfirmed lineups", () => {
  assert.throws(
    () => evaluateTotalBasesCandidate(validInput({ gameStatus: "live" })),
    /pregame markets only/
  );

  const result = evaluateTotalBasesCandidate(validInput({ lineupConfirmed: false }));
  assert.equal(result.verdict, "WAIT");
  assert.ok(result.riskFlags.includes("LINEUP_UNCONFIRMED"));
  assert.equal(result.authorizedStake, 0);
});
