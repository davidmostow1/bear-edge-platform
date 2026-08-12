const DEFAULT_MARKET_WEIGHT = 0.35;
const DEFAULT_MAX_INJURY_AGE_MINUTES = 90;

const BET_INPUT_SCHEMA = Object.freeze({
  type: "object",
  additionalProperties: false,
  required: ["selection", "marketOdds", "oppositeOdds", "modelProbability", "bankroll"],
  properties: Object.freeze({
    selection: { type: "string", minLength: 1 },
    marketType: {
      type: "string",
      enum: ["straight", "moneyline", "spread", "total", "prop", "alt-prop"]
    },
    marketOdds: { type: "number", not: { const: 0 } },
    oppositeOdds: { type: "number", not: { const: 0 } },
    modelProbability: { type: "number", minimum: 0, maximum: 1 },
    bankroll: { type: "number", exclusiveMinimum: 0 },
    marketWeight: { type: "number", minimum: 0, maximum: 1 },
    injuryDataAgeMinutes: { anyOf: [{ type: "number", minimum: 0 }, { type: "null" }] },
    maxInjuryAgeMinutes: { type: "number", exclusiveMinimum: 0 },
    tiltLocked: { type: "boolean" },
    isParlay: { type: "boolean" },
    hasCorrelationRisk: { type: "boolean" },
    thresholds: {
      type: "object",
      additionalProperties: false,
      properties: {
        minEdge: { type: "number", minimum: 0, maximum: 1 },
        minEvRoi: { type: "number" },
        minKellyFraction: { type: "number", minimum: 0, maximum: 1 }
      }
    },
    stakePolicy: {
      type: "object",
      additionalProperties: false,
      properties: {
        kellyMultiplier: { type: "number", minimum: 0, maximum: 1 },
        maxStake: { anyOf: [{ type: "number", exclusiveMinimum: 0 }, { type: "null" }] },
        maxBankrollFraction: { type: "number", minimum: 0, maximum: 1 },
        minStake: { type: "number", minimum: 0 }
      }
    },
    notes: {
      type: "array",
      items: { type: "string" }
    }
  })
});

class BetInputValidationError extends Error {
  constructor(issues) {
    super("Bet input validation failed.");
    this.name = "BetInputValidationError";
    this.issues = issues;
  }
}

function isPlainObject(value) {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function pushIssue(issues, path, message) {
  issues.push({ path, message });
}

function hasOwn(object, key) {
  return Object.prototype.hasOwnProperty.call(object, key);
}

function ensureOnlyAllowedKeys(object, allowedKeys, path, issues) {
  for (const key of Object.keys(object)) {
    if (!allowedKeys.includes(key)) {
      pushIssue(issues, path ? `${path}.${key}` : key, "Unexpected property.");
    }
  }
}

function readNumber(value, path, issues, { min = -Infinity, max = Infinity, disallowZero = false } = {}) {
  if (typeof value !== "number" || !Number.isFinite(value)) {
    pushIssue(issues, path, "Expected a finite number.");
    return null;
  }

  if (disallowZero && value === 0) {
    pushIssue(issues, path, "Cannot be 0.");
    return null;
  }

  if (value < min) {
    pushIssue(issues, path, `Must be >= ${min}.`);
    return null;
  }

  if (value > max) {
    pushIssue(issues, path, `Must be <= ${max}.`);
    return null;
  }

  return value;
}

function readOptionalNumber(value, path, issues, options) {
  if (value === undefined) {
    return undefined;
  }

  return readNumber(value, path, issues, options);
}

function readBoolean(value, path, issues) {
  if (typeof value !== "boolean") {
    pushIssue(issues, path, "Expected a boolean.");
    return null;
  }

  return value;
}

function readOptionalBoolean(value, path, issues) {
  if (value === undefined) {
    return undefined;
  }

  return readBoolean(value, path, issues);
}

function readOptionalStringArray(value, path, issues) {
  if (value === undefined) {
    return undefined;
  }

  if (!Array.isArray(value)) {
    pushIssue(issues, path, "Expected an array of strings.");
    return undefined;
  }

  const normalized = [];

  for (let index = 0; index < value.length; index += 1) {
    if (typeof value[index] !== "string") {
      pushIssue(issues, `${path}[${index}]`, "Expected a string.");
    } else {
      normalized.push(value[index]);
    }
  }

  return normalized;
}

function readThresholds(value, issues) {
  if (value === undefined) {
    return undefined;
  }

  if (!isPlainObject(value)) {
    pushIssue(issues, "thresholds", "Expected an object.");
    return undefined;
  }

  ensureOnlyAllowedKeys(value, ["minEdge", "minEvRoi", "minKellyFraction"], "thresholds", issues);

  const normalized = {};
  const minEdge = readOptionalNumber(value.minEdge, "thresholds.minEdge", issues, { min: 0, max: 1 });
  const minEvRoi = readOptionalNumber(value.minEvRoi, "thresholds.minEvRoi", issues, { min: 0 });
  const minKellyFraction = readOptionalNumber(value.minKellyFraction, "thresholds.minKellyFraction", issues, {
    min: 0,
    max: 1
  });

  if (minEdge !== undefined && minEdge !== null) {
    normalized.minEdge = minEdge;
  }

  if (minEvRoi !== undefined && minEvRoi !== null) {
    normalized.minEvRoi = minEvRoi;
  }

  if (minKellyFraction !== undefined && minKellyFraction !== null) {
    normalized.minKellyFraction = minKellyFraction;
  }

  return Object.keys(normalized).length > 0 ? normalized : undefined;
}

function readStakePolicy(value, issues) {
  if (value === undefined) {
    return undefined;
  }

  if (!isPlainObject(value)) {
    pushIssue(issues, "stakePolicy", "Expected an object.");
    return undefined;
  }

  ensureOnlyAllowedKeys(
    value,
    ["kellyMultiplier", "maxStake", "maxBankrollFraction", "minStake"],
    "stakePolicy",
    issues
  );

  const normalized = {};
  const kellyMultiplier = readOptionalNumber(value.kellyMultiplier, "stakePolicy.kellyMultiplier", issues, {
    min: 0,
    max: 1
  });
  const maxBankrollFraction = readOptionalNumber(
    value.maxBankrollFraction,
    "stakePolicy.maxBankrollFraction",
    issues,
    { min: 0, max: 1 }
  );
  const minStake = readOptionalNumber(value.minStake, "stakePolicy.minStake", issues, { min: 0 });

  if (kellyMultiplier !== undefined && kellyMultiplier !== null) {
    normalized.kellyMultiplier = kellyMultiplier;
  }

  if (value.maxStake === null) {
    normalized.maxStake = Infinity;
  } else {
    const maxStake = readOptionalNumber(value.maxStake, "stakePolicy.maxStake", issues, { min: Number.EPSILON });

    if (maxStake !== undefined && maxStake !== null) {
      normalized.maxStake = maxStake;
    }
  }

  if (maxBankrollFraction !== undefined && maxBankrollFraction !== null) {
    normalized.maxBankrollFraction = maxBankrollFraction;
  }

  if (minStake !== undefined && minStake !== null) {
    normalized.minStake = minStake;
  }

  return Object.keys(normalized).length > 0 ? normalized : undefined;
}

function validateBetInput(input) {
  const issues = [];

  if (!isPlainObject(input)) {
    throw new BetInputValidationError([{ path: "", message: "Expected a JSON object." }]);
  }

  ensureOnlyAllowedKeys(
    input,
    [
      "selection",
      "marketType",
      "marketOdds",
      "oppositeOdds",
      "modelProbability",
      "bankroll",
      "marketWeight",
      "injuryDataAgeMinutes",
      "maxInjuryAgeMinutes",
      "tiltLocked",
      "isParlay",
      "hasCorrelationRisk",
      "thresholds",
      "stakePolicy",
      "notes"
    ],
    "",
    issues
  );

  const selection = typeof input.selection === "string" ? input.selection.trim() : "";

  if (!selection) {
    pushIssue(issues, "selection", "Expected a non-empty string.");
  }

  const marketOdds = readNumber(input.marketOdds, "marketOdds", issues, { disallowZero: true });
  const oppositeOdds = readNumber(input.oppositeOdds, "oppositeOdds", issues, { disallowZero: true });
  const modelProbability = readNumber(input.modelProbability, "modelProbability", issues, { min: 0, max: 1 });
  const bankroll = readNumber(input.bankroll, "bankroll", issues, { min: Number.EPSILON });
  const marketWeight = readOptionalNumber(input.marketWeight, "marketWeight", issues, { min: 0, max: 1 });
  const maxInjuryAgeMinutes = readOptionalNumber(
    input.maxInjuryAgeMinutes,
    "maxInjuryAgeMinutes",
    issues,
    { min: Number.EPSILON }
  );

  let injuryDataAgeMinutes;

  if (input.injuryDataAgeMinutes === null) {
    injuryDataAgeMinutes = null;
  } else {
    injuryDataAgeMinutes = readOptionalNumber(input.injuryDataAgeMinutes, "injuryDataAgeMinutes", issues, {
      min: 0
    });
  }

  const thresholds = readThresholds(input.thresholds, issues);
  const stakePolicy = readStakePolicy(input.stakePolicy, issues);
  const tiltLocked = readOptionalBoolean(input.tiltLocked, "tiltLocked", issues);
  const isParlay = readOptionalBoolean(input.isParlay, "isParlay", issues);
  const hasCorrelationRisk = readOptionalBoolean(
    input.hasCorrelationRisk,
    "hasCorrelationRisk",
    issues
  );
  const notes = readOptionalStringArray(input.notes, "notes", issues);
  const marketType = input.marketType === undefined ? "straight" : input.marketType;

  if (!["straight", "moneyline", "spread", "total", "prop", "alt-prop"].includes(marketType)) {
    pushIssue(issues, "marketType", "Expected one of: straight, moneyline, spread, total, prop, alt-prop.");
  }

  if (issues.length > 0) {
    throw new BetInputValidationError(issues);
  }

  const normalized = {
    selection,
    marketType,
    marketOdds,
    oppositeOdds,
    modelProbability,
    bankroll
  };

  if (marketWeight !== undefined) {
    normalized.marketWeight = marketWeight;
  } else {
    normalized.marketWeight = DEFAULT_MARKET_WEIGHT;
  }

  if (injuryDataAgeMinutes !== undefined) {
    normalized.injuryDataAgeMinutes = injuryDataAgeMinutes;
  } else {
    normalized.injuryDataAgeMinutes = null;
  }

  if (maxInjuryAgeMinutes !== undefined) {
    normalized.maxInjuryAgeMinutes = maxInjuryAgeMinutes;
  } else {
    normalized.maxInjuryAgeMinutes = DEFAULT_MAX_INJURY_AGE_MINUTES;
  }

  normalized.tiltLocked = tiltLocked ?? false;
  normalized.isParlay = isParlay ?? false;
  normalized.hasCorrelationRisk = hasCorrelationRisk ?? false;

  if (thresholds) {
    normalized.thresholds = thresholds;
  }

  if (stakePolicy) {
    normalized.stakePolicy = stakePolicy;
  }

  if (notes) {
    normalized.notes = notes;
  }

  return normalized;
}

module.exports = {
  BET_INPUT_SCHEMA,
  BetInputValidationError,
  validateBetInput
};
