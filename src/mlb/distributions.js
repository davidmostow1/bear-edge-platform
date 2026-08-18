// @ts-nocheck
function createCountAccumulator(maximum = 40) {
  const counts = new Array(maximum + 1).fill(0);
  let observations = 0;
  return {
    add(rawValue) {
      const value = Math.max(0, Math.floor(Number(rawValue) || 0));
      counts[Math.min(value, maximum)] += 1;
      observations += 1;
    },
    finalize() {
      if (observations === 0) throw new RangeError("cannot finalize an empty count distribution");
      return counts.map((count) => count / observations);
    }
  };
}

function normalizePmf(values) {
  if (!Array.isArray(values) || values.length === 0) throw new TypeError("pmf must be a non-empty array");
  const clean = values.map((value) => Math.max(0, Number(value) || 0));
  const total = clean.reduce((sum, value) => sum + value, 0);
  if (!(total > 0)) throw new RangeError("pmf must have positive mass");
  return clean.map((value) => value / total);
}

function summarizePmf(input) {
  const pmf = normalizePmf(input);
  const mean = pmf.reduce((sum, probability, value) => sum + probability * value, 0);
  const variance = pmf.reduce((sum, probability, value) => sum + probability * (value - mean) ** 2, 0);
  const quantile = (target) => {
    let cumulative = 0;
    for (let value = 0; value < pmf.length; value += 1) {
      cumulative += pmf[value];
      if (cumulative >= target) return value;
    }
    return pmf.length - 1;
  };
  return { mean, standardDeviation: Math.sqrt(variance), median: quantile(0.5), p10: quantile(0.1), p90: quantile(0.9) };
}

function settleCountLine(input, line, side) {
  const pmf = normalizePmf(input);
  const normalizedSide = String(side).toLowerCase();
  if (!Number.isFinite(line)) throw new TypeError("line must be finite");
  if (normalizedSide !== "over" && normalizedSide !== "under") throw new TypeError("side must be over or under");
  let winProbability = 0;
  let pushProbability = 0;
  let lossProbability = 0;
  for (let value = 0; value < pmf.length; value += 1) {
    const probability = pmf[value];
    if (value === line) pushProbability += probability;
    else if ((normalizedSide === "over" && value > line) || (normalizedSide === "under" && value < line)) winProbability += probability;
    else lossProbability += probability;
  }
  const resolved = winProbability + lossProbability;
  const fairWinProbability = resolved > 0 ? winProbability / resolved : 0.5;
  const fairDecimalOdds = fairWinProbability > 0 ? 1 / fairWinProbability : Infinity;
  const fairAmericanOdds = fairDecimalOdds >= 2
    ? Math.round((fairDecimalOdds - 1) * 100)
    : Math.round(-100 / Math.max(1e-12, fairDecimalOdds - 1));
  return { line, side: normalizedSide, winProbability, pushProbability, lossProbability, fairWinProbability, fairDecimalOdds, fairAmericanOdds };
}

function buildCountLadder(pmf, lines) {
  const uniqueLines = [...new Set(lines.map(Number).filter(Number.isFinite))].sort((a, b) => a - b);
  return uniqueLines.flatMap((line) => [settleCountLine(pmf, line, "over"), settleCountLine(pmf, line, "under")]);
}

module.exports = { createCountAccumulator, normalizePmf, summarizePmf, settleCountLine, buildCountLadder };
