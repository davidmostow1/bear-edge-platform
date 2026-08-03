function requiredFiniteNumber(input, name) {
  if (!Object.prototype.hasOwnProperty.call(input, name)
    || typeof input[name] !== "number"
    || !Number.isFinite(input[name])) {
    throw new Error(`${name} must be supplied as a finite number from the visible contract quote.`);
  }

  return input[name];
}

function round(value, digits = 12) {
  const factor = 10 ** digits;
  return Math.round((value + Number.EPSILON) * factor) / factor;
}

function calculatePredictionsContractEconomics(input = {}) {
  if (Object.prototype.hasOwnProperty.call(input, "americanOdds")) {
    throw new Error("American odds cannot substitute for exact DraftKings Predictions contract economics.");
  }

  const contractCost = requiredFiniteNumber(input, "contractCost");
  const grossPayout = requiredFiniteNumber(input, "grossPayout");
  const fee = requiredFiniteNumber(input, "fee");
  const winProbability = requiredFiniteNumber(input, "winProbability");

  if (contractCost <= 0) {
    throw new Error("contractCost must be greater than zero.");
  }
  if (grossPayout <= 0) {
    throw new Error("grossPayout must be greater than zero.");
  }
  if (grossPayout !== 1) {
    throw new Error("grossPayout must equal the one dollar settlement value of one Predictions contract.");
  }
  if (fee < 0) {
    throw new Error("fee cannot be negative.");
  }
  if (winProbability < 0 || winProbability > 1) {
    throw new Error("winProbability must be between zero and one.");
  }

  const totalCost = round(contractCost + fee);

  if (grossPayout <= totalCost) {
    throw new Error("grossPayout must exceed total cost for a valid winning contract quote.");
  }

  const profitIfWin = round(grossPayout - totalCost);
  const lossIfLose = totalCost;
  const expectedProfit = round(
    winProbability * profitIfWin - (1 - winProbability) * lossIfLose
  );
  const roi = expectedProfit / totalCost;
  const netWinMultiple = profitIfWin / totalCost;
  const rawKellyFraction = (
    netWinMultiple * winProbability - (1 - winProbability)
  ) / netWinMultiple;

  return {
    contractCost,
    grossPayout,
    fee,
    totalCost,
    winProbability,
    profitIfWin,
    lossIfLose,
    expectedProfit,
    roi,
    researchKellyFraction: Math.max(0, rawKellyFraction),
    evidenceStatus: "exact_visible_contract_quote",
    betCallPermission: "PRICE_CHECK_ONLY",
    authorizedStake: 0,
    warnings: [
      "This fee-aware result is research only and cannot authorize a DraftKings Predictions trade.",
      "The win probability must come from an independent registered model, not the displayed contract price."
    ]
  };
}

module.exports = {
  calculatePredictionsContractEconomics
};
