function assertFiniteNumber(value, name) {
  if (typeof value !== "number" || !Number.isFinite(value)) {
    throw new TypeError(`${name} must be a finite number.`);
  }
}

function assertProbability(value, name) {
  assertFiniteNumber(value, name);

  if (value < 0 || value > 1) {
    throw new RangeError(`${name} must be between 0 and 1.`);
  }
}

function americanToDecimal(americanOdds) {
  assertFiniteNumber(americanOdds, "americanOdds");

  if (americanOdds === 0) {
    throw new RangeError("americanOdds cannot be 0.");
  }

  if (americanOdds > 0) {
    return 1 + americanOdds / 100;
  }

  return 1 + 100 / Math.abs(americanOdds);
}

function americanToImpliedProbability(americanOdds) {
  assertFiniteNumber(americanOdds, "americanOdds");

  if (americanOdds === 0) {
    throw new RangeError("americanOdds cannot be 0.");
  }

  if (americanOdds > 0) {
    return 100 / (americanOdds + 100);
  }

  return Math.abs(americanOdds) / (Math.abs(americanOdds) + 100);
}

function normalizeTwoWayNoVig(probabilityA, probabilityB) {
  assertProbability(probabilityA, "probabilityA");
  assertProbability(probabilityB, "probabilityB");

  const total = probabilityA + probabilityB;

  if (total <= 0) {
    throw new RangeError("probabilityA and probabilityB cannot both be 0.");
  }

  return {
    sideA: probabilityA / total,
    sideB: probabilityB / total
  };
}

function getTwoWayNoVigProbabilities(americanOddsA, americanOddsB) {
  const impliedA = americanToImpliedProbability(americanOddsA);
  const impliedB = americanToImpliedProbability(americanOddsB);
  const normalized = normalizeTwoWayNoVig(impliedA, impliedB);

  return {
    impliedA,
    impliedB,
    marketVig: impliedA + impliedB - 1,
    noVigA: normalized.sideA,
    noVigB: normalized.sideB
  };
}

module.exports = {
  americanToDecimal,
  americanToImpliedProbability,
  getTwoWayNoVigProbabilities,
  normalizeTwoWayNoVig
};
