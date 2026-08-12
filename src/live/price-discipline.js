const PRICE_INVALIDATION_CONDITIONS = Object.freeze([
  "price_below_minimum",
  "line_changed",
  "lineup_changed",
  "injury_status_changed",
  "market_stale",
  "event_time_cutoff_reached",
  "source_verification_lost"
]);

/**
 * @typedef {object} PriceDisciplinePolicy
 * @property {number} [minEvRoi]
 * @property {number} [minKellyFraction]
 * @property {number} [bankroll]
 * @property {number} [kellyMultiplier]
 * @property {number} [minStake]
 * @property {number} [maxStake]
 * @property {number} [maxBankrollFraction]
 * @property {number} [maxMarketAgeMinutes]
 * @property {number} [prohibitedWindowMinutes]
 */

function assertFinite(value, name) {
  if (typeof value !== "number" || !Number.isFinite(value)) {
    throw new TypeError(`${name} must be a finite number.`);
  }
}

function assertProbability(value, name) {
  assertFinite(value, name);

  if (value <= 0 || value >= 1) {
    throw new RangeError(`${name} must be greater than 0 and less than 1.`);
  }
}

function assertNonNegative(value, name) {
  assertFinite(value, name);

  if (value < 0) {
    throw new RangeError(`${name} must be zero or greater.`);
  }
}

function assertPositive(value, name) {
  assertFinite(value, name);

  if (value <= 0) {
    throw new RangeError(`${name} must be greater than 0.`);
  }
}

function decimalToAmerican(decimalOdds) {
  assertFinite(decimalOdds, "decimalOdds");

  if (decimalOdds <= 1) {
    throw new RangeError("decimalOdds must be greater than 1.");
  }

  return decimalOdds >= 2
    ? (decimalOdds - 1) * 100
    : -100 / (decimalOdds - 1);
}

function comparableAmericanOdds(americanOdds) {
  assertFinite(americanOdds, "americanOdds");

  if (americanOdds === 0) {
    throw new RangeError("americanOdds cannot be 0.");
  }

  return americanOdds === -100 ? 100 : americanOdds;
}

function isAmericanOddsAtLeast(currentAmericanOdds, minimumAmericanOdds) {
  return comparableAmericanOdds(currentAmericanOdds) >= comparableAmericanOdds(minimumAmericanOdds);
}

function minimumIntegerAmericanOdds(decimalOddsBoundary) {
  const boundary = decimalToAmerican(decimalOddsBoundary);
  const next = Math.floor(boundary) + 1;

  return next >= -100 && next < 100 ? 100 : next;
}

function infeasibleMinimumPrice(reasonCode, constraints = []) {
  return {
    feasible: false,
    bindingConstraint: null,
    decimalOddsBoundary: null,
    americanOddsBoundary: null,
    minimumAcceptableAmericanOdds: null,
    constraints,
    reasonCodes: [reasonCode]
  };
}

function calculateMinimumAcceptablePrice({
  winProbability,
  minEvRoi = 0.01,
  minKellyFraction = 0.005,
  bankroll,
  kellyMultiplier = 0.12,
  minStake = 5,
  maxStake = Infinity,
  maxBankrollFraction = 0.015
}) {
  assertProbability(winProbability, "winProbability");
  assertNonNegative(minEvRoi, "minEvRoi");
  assertNonNegative(minKellyFraction, "minKellyFraction");
  assertPositive(bankroll, "bankroll");
  assertNonNegative(kellyMultiplier, "kellyMultiplier");
  assertNonNegative(minStake, "minStake");

  if (maxStake !== Infinity) {
    assertPositive(maxStake, "maxStake");
  }

  assertPositive(maxBankrollFraction, "maxBankrollFraction");

  const absoluteStakeCap = Math.min(maxStake, bankroll * maxBankrollFraction);

  if (absoluteStakeCap <= minStake) {
    return infeasibleMinimumPrice("STAKE_CAP_CANNOT_CLEAR_MINIMUM");
  }

  if (kellyMultiplier <= 0) {
    return infeasibleMinimumPrice("KELLY_MULTIPLIER_CANNOT_CLEAR_MINIMUM");
  }

  const minimumKellyForStake = minStake / (bankroll * kellyMultiplier);
  const requiredKellyFraction = Math.max(minKellyFraction, minimumKellyForStake);

  if (winProbability <= requiredKellyFraction) {
    return infeasibleMinimumPrice("PROBABILITY_CANNOT_CLEAR_KELLY_REQUIREMENT");
  }

  const constraints = [
    {
      id: "positive_price_edge",
      decimalOddsBoundary: 1 / winProbability
    },
    {
      id: "expected_value",
      decimalOddsBoundary: (1 + minEvRoi) / winProbability
    },
    {
      id: requiredKellyFraction === minimumKellyForStake ? "minimum_stake" : "kelly",
      decimalOddsBoundary: 1 + (1 - winProbability) / (winProbability - requiredKellyFraction)
    }
  ];
  const binding = constraints.reduce((current, candidate) =>
    candidate.decimalOddsBoundary > current.decimalOddsBoundary ? candidate : current
  );
  const americanOddsBoundary = decimalToAmerican(binding.decimalOddsBoundary);

  return {
    feasible: true,
    bindingConstraint: binding.id,
    decimalOddsBoundary: binding.decimalOddsBoundary,
    americanOddsBoundary,
    minimumAcceptableAmericanOdds: minimumIntegerAmericanOdds(binding.decimalOddsBoundary),
    constraints,
    reasonCodes: []
  };
}

function parseTimestamp(value) {
  const parsed = Date.parse(value ?? "");
  return Number.isFinite(parsed) ? parsed : null;
}

/**
 * @param {{
 *   currentAmericanOdds: number,
 *   winProbability: number,
 *   priceCapturedAt?: string | null,
 *   eventStartAt?: string | null,
 *   now?: Date | string,
 *   policy?: PriceDisciplinePolicy
 * }} input
 */
function buildPriceDiscipline({
  currentAmericanOdds,
  winProbability,
  priceCapturedAt,
  eventStartAt,
  now = new Date(),
  policy = {}
}) {
  const nowMs = now instanceof Date ? now.getTime() : Date.parse(now);

  if (!Number.isFinite(nowMs)) {
    throw new TypeError("now must be a valid date or ISO timestamp.");
  }

  const resolvedPolicy = {
    minEvRoi: policy.minEvRoi ?? 0.01,
    minKellyFraction: policy.minKellyFraction ?? 0.005,
    bankroll: policy.bankroll,
    kellyMultiplier: policy.kellyMultiplier ?? 0.12,
    minStake: policy.minStake ?? 5,
    maxStake: policy.maxStake ?? Infinity,
    maxBankrollFraction: policy.maxBankrollFraction ?? 0.015,
    maxMarketAgeMinutes: policy.maxMarketAgeMinutes ?? 10,
    prohibitedWindowMinutes: policy.prohibitedWindowMinutes ?? 5
  };
  assertNonNegative(resolvedPolicy.maxMarketAgeMinutes, "maxMarketAgeMinutes");
  assertNonNegative(resolvedPolicy.prohibitedWindowMinutes, "prohibitedWindowMinutes");

  const minimumPrice = calculateMinimumAcceptablePrice({
    winProbability,
    minEvRoi: resolvedPolicy.minEvRoi,
    minKellyFraction: resolvedPolicy.minKellyFraction,
    bankroll: resolvedPolicy.bankroll,
    kellyMultiplier: resolvedPolicy.kellyMultiplier,
    minStake: resolvedPolicy.minStake,
    maxStake: resolvedPolicy.maxStake,
    maxBankrollFraction: resolvedPolicy.maxBankrollFraction
  });
  const capturedAtMs = parseTimestamp(priceCapturedAt);
  const eventStartMs = parseTimestamp(eventStartAt);
  const expiryCandidates = [];

  if (capturedAtMs !== null) {
    expiryCandidates.push({
      reason: "market_freshness",
      timestamp: capturedAtMs + resolvedPolicy.maxMarketAgeMinutes * 60000
    });
  }

  if (eventStartMs !== null) {
    expiryCandidates.push({
      reason: "event_time_cutoff",
      timestamp: eventStartMs - resolvedPolicy.prohibitedWindowMinutes * 60000
    });
  }

  const bindingExpiry = expiryCandidates.length > 0
    ? expiryCandidates.reduce((current, candidate) =>
        candidate.timestamp < current.timestamp ? candidate : current
      )
    : null;
  const expired = bindingExpiry !== null && nowMs >= bindingExpiry.timestamp;
  const clearsMinimumPrice = minimumPrice.feasible && isAmericanOddsAtLeast(
    currentAmericanOdds,
    minimumPrice.minimumAcceptableAmericanOdds
  );
  const status = !minimumPrice.feasible
    ? "infeasible"
    : expired
      ? "expired"
      : !clearsMinimumPrice
        ? "below_minimum"
        : "active";

  return {
    status,
    evaluatedAt: new Date(nowMs).toISOString(),
    currentAmericanOdds,
    minimumAcceptableAmericanOdds: minimumPrice.minimumAcceptableAmericanOdds,
    clearsMinimumPrice,
    expired,
    validUntil: bindingExpiry ? new Date(bindingExpiry.timestamp).toISOString() : null,
    expiryReason: bindingExpiry?.reason ?? null,
    minimumPrice,
    invalidationConditions: [...PRICE_INVALIDATION_CONDITIONS]
  };
}

module.exports = {
  PRICE_INVALIDATION_CONDITIONS,
  buildPriceDiscipline,
  calculateMinimumAcceptablePrice,
  decimalToAmerican,
  isAmericanOddsAtLeast
};
