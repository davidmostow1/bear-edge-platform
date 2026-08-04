const test = require("node:test");
const assert = require("node:assert/strict");

const {
  calculatePredictionsContractEconomics
} = require("../src/live/predictions-contract-economics.js");

test("Predictions contract economics include exact visible fee, payout, and research Kelly", () => {
  const result = calculatePredictionsContractEconomics({
    contractCost: 0.43,
    grossPayout: 1,
    fee: 0.02,
    winProbability: 0.5
  });

  assert.equal(result.totalCost, 0.45);
  assert.equal(result.profitIfWin, 0.55);
  assert.equal(result.lossIfLose, 0.45);
  assert.ok(Math.abs(result.expectedProfit - 0.05) < 1e-12);
  assert.ok(Math.abs(result.roi - (0.05 / 0.45)) < 1e-12);
  assert.ok(Math.abs(result.researchKellyFraction - (1 / 11)) < 1e-12);
  assert.equal(result.evidenceStatus, "exact_visible_contract_quote");
  assert.equal(result.betCallPermission, "PRICE_CHECK_ONLY");
  assert.equal(result.authorizedStake, 0);
});

test("Predictions contract economics preserve an explicit zero fee", () => {
  const result = calculatePredictionsContractEconomics({
    contractCost: 0.4,
    grossPayout: 1,
    fee: 0,
    winProbability: 0.5
  });

  assert.equal(result.totalCost, 0.4);
  assert.equal(result.profitIfWin, 0.6);
  assert.equal(result.lossIfLose, 0.4);
  assert.equal(result.expectedProfit, 0.1);
  assert.ok(Math.abs(result.researchKellyFraction - (1 / 6)) < 1e-12);
});

test("Predictions contract economics fail closed without every exact quote field", () => {
  assert.throws(
    () => calculatePredictionsContractEconomics({
      contractCost: 0.43,
      grossPayout: 1,
      winProbability: 0.5
    }),
    /fee/
  );
  assert.throws(
    () => calculatePredictionsContractEconomics({
      contractCost: 0.43,
      grossPayout: 1,
      fee: 0.02
    }),
    /winProbability/
  );
});

test("Predictions contract economics reject impossible economics and invalid probabilities", () => {
  assert.throws(
    () => calculatePredictionsContractEconomics({
      contractCost: 0.98,
      grossPayout: 1,
      fee: 0.02,
      winProbability: 0.5
    }),
    /exceed total cost/
  );
  assert.throws(
    () => calculatePredictionsContractEconomics({
      contractCost: 0.43,
      grossPayout: 1,
      fee: -0.01,
      winProbability: 0.5
    }),
    /fee/
  );
  assert.throws(
    () => calculatePredictionsContractEconomics({
      contractCost: 0.43,
      grossPayout: 1,
      fee: 0.02,
      winProbability: 1.1
    }),
    /winProbability/
  );
});

test("Predictions contract economics reject sportsbook American-odds substitution", () => {
  assert.throws(
    () => calculatePredictionsContractEconomics({
      contractCost: 0.43,
      grossPayout: 1,
      fee: 0.02,
      winProbability: 0.5,
      americanOdds: 133
    }),
    /American odds/
  );
});

test("Predictions contract economics require the one-dollar contract settlement value", () => {
  assert.throws(
    () => calculatePredictionsContractEconomics({
      contractCost: 0.43,
      grossPayout: 2.63,
      fee: 0.02,
      winProbability: 0.5
    }),
    /one dollar/
  );
});
