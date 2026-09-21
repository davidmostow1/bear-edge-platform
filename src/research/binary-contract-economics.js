const { contentDigest } = require("../audit/canonical-json.js");

const FEE_SCHEDULE_SCHEMA_VERSION = "1.0.0";
const ROUNDING_METHOD = "ceil_cent_per_order";
const DIGEST_PATTERN = /^[a-f0-9]{64}$/;

function isPlainObject(value) {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function finiteNumber(value) {
  return typeof value === "number" && Number.isFinite(value);
}

function assertIdentity(value, field) {
  if (typeof value !== "string" || !value.trim() || value !== value.trim()) {
    throw new TypeError(`${field} must be a non-empty trimmed string.`);
  }
}

function assertDigest(value, field) {
  if (typeof value !== "string" || !DIGEST_PATTERN.test(value)) {
    throw new TypeError(`${field} must be a lowercase SHA-256 digest.`);
  }
}

function assertPriceCents(value) {
  if (!Number.isInteger(value) || value < 1 || value > 99) {
    throw new TypeError("priceCents must be an integer from 1 through 99.");
  }
}

function assertContracts(value) {
  if (!Number.isSafeInteger(value) || value < 1) {
    throw new TypeError("contracts must be a positive safe integer.");
  }
}

function assertProbability(value, field) {
  if (!finiteNumber(value) || value < 0 || value > 1) {
    throw new TypeError(`${field} must be a finite probability from zero through one.`);
  }
}

function validateRoleRule(rule, field) {
  if (!isPlainObject(rule)
      || !Number.isSafeInteger(rule.numerator)
      || rule.numerator < 0
      || !Number.isSafeInteger(rule.denominator)
      || rule.denominator <= 0) {
    throw new TypeError(`${field} must define non-negative integer numerator and positive denominator.`);
  }
}

function scheduleIdentity(schedule) {
  const { scheduleDigest: _scheduleDigest, ...identity } = schedule;
  return identity;
}

function buildFeeSchedule(input) {
  if (!isPlainObject(input)) throw new TypeError("Fee schedule input is required.");
  assertIdentity(input.scheduleId, "scheduleId");
  assertDigest(input.sourceDigest, "sourceDigest");
  if (typeof input.effectiveAt !== "string" || !Number.isFinite(Date.parse(input.effectiveAt))) {
    throw new TypeError("effectiveAt must be a valid timestamp.");
  }
  if (input.rounding !== ROUNDING_METHOD) {
    throw new TypeError(`rounding must equal ${ROUNDING_METHOD}.`);
  }
  if (!isPlainObject(input.roles) || Object.keys(input.roles).length === 0) {
    throw new TypeError("roles must define at least one fee role.");
  }
  const roles = {};
  for (const role of Object.keys(input.roles).sort()) {
    assertIdentity(role, `roles.${role}`);
    validateRoleRule(input.roles[role], `roles.${role}`);
    roles[role] = {
      numerator: input.roles[role].numerator,
      denominator: input.roles[role].denominator
    };
  }
  const baseSchedule = {
    schemaVersion: FEE_SCHEDULE_SCHEMA_VERSION,
    scheduleId: input.scheduleId,
    sourceDigest: input.sourceDigest,
    effectiveAt: new Date(input.effectiveAt).toISOString(),
    rounding: input.rounding,
    roles
  };
  return {
    ...baseSchedule,
    scheduleDigest: contentDigest(baseSchedule)
  };
}

function validateFeeSchedule(schedule) {
  if (!isPlainObject(schedule)) throw new TypeError("feeSchedule must be an object.");
  if (schedule.schemaVersion !== FEE_SCHEDULE_SCHEMA_VERSION) {
    throw new TypeError("Unsupported fee schedule schema version.");
  }
  assertIdentity(schedule.scheduleId, "feeSchedule.scheduleId");
  assertDigest(schedule.sourceDigest, "feeSchedule.sourceDigest");
  assertDigest(schedule.scheduleDigest, "feeSchedule.scheduleDigest");
  if (schedule.rounding !== ROUNDING_METHOD) {
    throw new TypeError(`feeSchedule.rounding must equal ${ROUNDING_METHOD}.`);
  }
  if (typeof schedule.effectiveAt !== "string" || !Number.isFinite(Date.parse(schedule.effectiveAt))) {
    throw new TypeError("feeSchedule.effectiveAt must be a valid timestamp.");
  }
  if (!isPlainObject(schedule.roles) || Object.keys(schedule.roles).length === 0) {
    throw new TypeError("feeSchedule.roles must define at least one fee role.");
  }
  for (const role of Object.keys(schedule.roles)) {
    validateRoleRule(schedule.roles[role], `feeSchedule.roles.${role}`);
  }
  if (contentDigest(scheduleIdentity(schedule)) !== schedule.scheduleDigest) {
    throw new TypeError("scheduleDigest does not match the fee schedule content.");
  }
  return schedule;
}

function tradingFeeCents({ priceCents, contracts, role, feeSchedule }) {
  assertPriceCents(priceCents);
  assertContracts(contracts);
  assertIdentity(role, "role");
  validateFeeSchedule(feeSchedule);
  const rule = feeSchedule.roles[role];
  if (!rule) throw new TypeError(`feeSchedule does not define role ${role}.`);

  const rawNumerator = rule.numerator * contracts * priceCents * (100 - priceCents);
  const rawDenominator = rule.denominator * 100;
  if (!Number.isSafeInteger(rawNumerator) || !Number.isSafeInteger(rawDenominator)) {
    throw new RangeError("Fee calculation exceeds safe integer precision.");
  }
  return Math.ceil(rawNumerator / rawDenominator);
}

function evaluateBinaryContract({
  winProbability,
  priceCents,
  contracts,
  role,
  feeSchedule
}) {
  assertProbability(winProbability, "winProbability");
  assertPriceCents(priceCents);
  assertContracts(contracts);
  const feeCents = tradingFeeCents({ priceCents, contracts, role, feeSchedule });
  const principalCents = contracts * priceCents;
  const totalCostCents = principalCents + feeCents;
  const payoutIfWinCents = contracts * 100;
  const expectedPayoutCents = winProbability * payoutIfWinCents;
  const expectedProfitCents = expectedPayoutCents - totalCostCents;
  const breakEvenProbability = totalCostCents / payoutIfWinCents;
  const feeAdjustedEdge = winProbability - breakEvenProbability;
  const expectedRoi = totalCostCents > 0 ? expectedProfitCents / totalCostCents : null;

  return {
    winProbability,
    priceCents,
    contracts,
    role,
    scheduleId: feeSchedule.scheduleId,
    scheduleDigest: feeSchedule.scheduleDigest,
    feeCents,
    principalCents,
    totalCostCents,
    payoutIfWinCents,
    expectedPayoutCents,
    expectedProfitCents,
    breakEvenProbability,
    feeAdjustedEdge,
    expectedRoi
  };
}

function maximumAcceptablePrice({
  winProbability,
  contracts,
  role,
  feeSchedule,
  minFeeAdjustedEdge = 0,
  minExpectedRoi = 0
}) {
  assertProbability(winProbability, "winProbability");
  assertContracts(contracts);
  if (!finiteNumber(minFeeAdjustedEdge) || minFeeAdjustedEdge < 0 || minFeeAdjustedEdge >= 1) {
    throw new TypeError("minFeeAdjustedEdge must be a non-negative number below one.");
  }
  if (!finiteNumber(minExpectedRoi) || minExpectedRoi < 0) {
    throw new TypeError("minExpectedRoi must be a non-negative finite number.");
  }
  validateFeeSchedule(feeSchedule);

  let best = null;
  for (let priceCents = 1; priceCents <= 99; priceCents += 1) {
    const economics = evaluateBinaryContract({
      winProbability,
      priceCents,
      contracts,
      role,
      feeSchedule
    });
    const clearsEdge = economics.feeAdjustedEdge + 1e-12 >= minFeeAdjustedEdge;
    const clearsRoi = economics.expectedRoi !== null
      && economics.expectedRoi + 1e-12 >= minExpectedRoi;
    if (clearsEdge && clearsRoi) {
      best = economics;
    }
  }

  if (best === null) {
    return {
      feasible: false,
      maxPriceCents: null,
      economics: null,
      thresholds: { minFeeAdjustedEdge, minExpectedRoi }
    };
  }
  return {
    feasible: true,
    maxPriceCents: best.priceCents,
    economics: best,
    thresholds: { minFeeAdjustedEdge, minExpectedRoi }
  };
}

module.exports = {
  FEE_SCHEDULE_SCHEMA_VERSION,
  ROUNDING_METHOD,
  buildFeeSchedule,
  evaluateBinaryContract,
  maximumAcceptablePrice,
  tradingFeeCents,
  validateFeeSchedule
};
