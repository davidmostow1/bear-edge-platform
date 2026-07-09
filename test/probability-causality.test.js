const test = require("node:test");
const assert = require("node:assert/strict");

const {
  describeCausalEvidence,
  simulateBetCard
} = require("../src/live/probability-causality.js");

test("simulateBetCard returns deterministic full trial output", () => {
  const resultA = simulateBetCard({
    seed: "deterministic",
    iterations: 5,
    startingBankroll: 100,
    bets: [
      {
        id: "az",
        selection: "AZ moneyline",
        americanOdds: 127,
        stake: 1.55,
        fairProbability: 0.52313636,
        marketImpliedProbability: 0.4405
      },
      {
        id: "chc",
        selection: "CHC moneyline",
        americanOdds: 150,
        stake: 1.03,
        fairProbability: 0.472625,
        marketImpliedProbability: 0.4
      }
    ]
  });
  const resultB = simulateBetCard({
    seed: "deterministic",
    iterations: 5,
    startingBankroll: 100,
    bets: [
      {
        id: "az",
        selection: "AZ moneyline",
        americanOdds: 127,
        stake: 1.55,
        fairProbability: 0.52313636,
        marketImpliedProbability: 0.4405
      },
      {
        id: "chc",
        selection: "CHC moneyline",
        americanOdds: 150,
        stake: 1.03,
        fairProbability: 0.472625,
        marketImpliedProbability: 0.4
      }
    ]
  });

  assert.equal(resultA.trials.length, 5);
  assert.deepEqual(resultA.trials, resultB.trials);
  assert.equal(resultA.bets.length, 2);
  assert.equal(resultA.bets[0].causality.causalClaimAllowed, false);
  assert.equal(resultA.assumptions.causality.includes("not causal evidence"), true);
});

test("simulateBetCard stress scenarios reduce optimistic edge", () => {
  const fair = simulateBetCard({
    seed: "stress",
    iterations: 10,
    scenario: "fair",
    startingBankroll: 100,
    bets: [
      {
        selection: "Edge bet",
        americanOdds: 150,
        stake: 10,
        fairProbability: 0.5,
        marketImpliedProbability: 0.4
      }
    ]
  });
  const market = simulateBetCard({
    seed: "stress",
    iterations: 10,
    scenario: "market",
    startingBankroll: 100,
    bets: [
      {
        selection: "Edge bet",
        americanOdds: 150,
        stake: 10,
        fairProbability: 0.5,
        marketImpliedProbability: 0.4
      }
    ]
  });

  assert.ok(fair.expectedNetProfitPerTrial > market.expectedNetProfitPerTrial);
  assert.equal(market.bets[0].simulationProbability, 0.4);
});

test("describeCausalEvidence blocks unsupported causal claims", () => {
  const audit = describeCausalEvidence({
    selection: "AZ moneyline"
  });

  assert.equal(audit.causalClaimAllowed, false);
  assert.equal(audit.causalEvidenceGrade, "D_observational_predictive_only");
  assert.ok(audit.requiredForUpgrade.some((item) => item.includes("Backtest")));
});
