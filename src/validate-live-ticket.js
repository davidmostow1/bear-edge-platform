const { DEFAULT_LIVE_POLICY } = require("./live/estimate-prop.js");

const LIVE_TICKET_SCHEMA = Object.freeze({
  type: "object",
  additionalProperties: false,
  required: ["bankroll", "legs"],
  properties: {
    kind: { type: "string", enum: ["single", "parlay"] },
    selection: { type: "string" },
    bankroll: { type: "number", exclusiveMinimum: 0 },
    livePolicy: {
      type: "object",
      additionalProperties: true
    },
    legs: {
      type: "array",
      minItems: 1,
      items: {
        type: "object",
        required: ["id", "provider", "marketType", "side", "line", "marketOdds", "source"],
        properties: {
          id: { type: "string" },
          label: { type: "string" },
          provider: { type: "string", enum: ["mlb", "nhl"] },
          marketType: { type: "string", enum: ["prop", "alt-prop"] },
          side: { type: "string", enum: ["over", "under"] },
          line: { type: "number", minimum: 0 },
          marketOdds: { type: "number" },
          oppositeOdds: { type: "number" },
          modelProbabilityOverride: { type: "number", minimum: 0, maximum: 1 },
          calibrationStatus: { type: "string", enum: ["validated", "research_only", "unknown"] },
          modelId: { type: "string", minLength: 1 },
          modelVersion: { type: "string", minLength: 1 },
          recentWeight: { type: "number", minimum: 0, maximum: 1 },
          marketWeight: { type: "number", minimum: 0, maximum: 1 },
          minEvRoi: { type: "number" },
          minStake: { type: "number", minimum: 0 },
          maxStake: { type: "number", exclusiveMinimum: 0 },
          maxBankrollFraction: { type: "number", minimum: 0, maximum: 1 },
          maxSourceAgeMinutes: { type: "number", minimum: 0 },
          maxMarketAgeMinutes: { type: "number", minimum: 0 },
          marketContext: {
            type: "object",
            additionalProperties: true
          },
          riskFlags: {
            type: "array",
            items: { type: "object" }
          },
          source: { type: "object" }
        }
      }
    }
  }
});

class LiveTicketValidationError extends Error {
  constructor(issues) {
    super("Live ticket validation failed.");
    this.name = "LiveTicketValidationError";
    this.issues = issues;
  }
}

function isPlainObject(value) {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function pushIssue(issues, path, message) {
  issues.push({ path, message });
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

function validateLiveLeg(leg, index, issues) {
  if (!isPlainObject(leg)) {
    pushIssue(issues, `legs[${index}]`, "Expected an object.");
    return null;
  }

  const marketOdds = readNumber(leg.marketOdds, `legs[${index}].marketOdds`, issues, { disallowZero: true });
  const line = readNumber(leg.line, `legs[${index}].line`, issues, { min: 0 });
  const oppositeOdds =
    leg.oppositeOdds === undefined
      ? undefined
      : readNumber(leg.oppositeOdds, `legs[${index}].oppositeOdds`, issues, { disallowZero: true });

  if (typeof leg.id !== "string" || !leg.id.trim()) {
    pushIssue(issues, `legs[${index}].id`, "Expected a non-empty string.");
  }

  if (!["mlb", "nhl"].includes(leg.provider)) {
    pushIssue(issues, `legs[${index}].provider`, "Expected one of: mlb, nhl.");
  }

  if (!["over", "under"].includes(leg.side)) {
    pushIssue(issues, `legs[${index}].side`, "Expected either 'over' or 'under'.");
  }

  if (!["prop", "alt-prop"].includes(leg.marketType)) {
    pushIssue(issues, `legs[${index}].marketType`, "Expected either 'prop' or 'alt-prop'.");
  }

  if (!isPlainObject(leg.source)) {
    pushIssue(issues, `legs[${index}].source`, "Expected an object.");
  }

  if (leg.calibrationStatus !== undefined &&
      !["validated", "research_only", "unknown"].includes(leg.calibrationStatus)) {
    pushIssue(
      issues,
      `legs[${index}].calibrationStatus`,
      "Expected one of: validated, research_only, unknown."
    );
  }

  for (const field of ["modelId", "modelVersion"]) {
    if (leg[field] !== undefined && (typeof leg[field] !== "string" || !leg[field].trim())) {
      pushIssue(issues, `legs[${index}].${field}`, "Expected a non-empty string when supplied.");
    }
  }

  return {
    id: leg.id,
    label: typeof leg.label === "string" ? leg.label : leg.id,
    provider: leg.provider,
    marketType: leg.marketType,
    side: leg.side,
    line,
    marketOdds,
    oppositeOdds,
    riskFlags: Array.isArray(leg.riskFlags)
      ? leg.riskFlags
          .filter((flag) => isPlainObject(flag))
          .map((flag) => ({
            code: typeof flag.code === "string" && flag.code.trim() ? flag.code : "UNKNOWN",
            severity: typeof flag.severity === "string" ? flag.severity : "info",
            message: typeof flag.message === "string" ? flag.message : String(flag.code ?? "Risk flag")
          }))
      : [],
    source: leg.source,
    correlationKey: typeof leg.correlationKey === "string" ? leg.correlationKey : undefined,
    recentWeight:
      leg.recentWeight === undefined
        ? undefined
        : readNumber(leg.recentWeight, `legs[${index}].recentWeight`, issues, { min: 0, max: 1 }),
    marketWeight:
      leg.marketWeight === undefined
        ? undefined
        : readNumber(leg.marketWeight, `legs[${index}].marketWeight`, issues, { min: 0, max: 1 }),
    calibrationStatus:
      leg.calibrationStatus === undefined
        ? leg.modelProbabilityOverride === undefined ? "unknown" : "research_only"
        : leg.calibrationStatus,
    modelId: typeof leg.modelId === "string" && leg.modelId.trim() ? leg.modelId.trim() : undefined,
    modelVersion:
      typeof leg.modelVersion === "string" && leg.modelVersion.trim()
        ? leg.modelVersion.trim()
        : undefined,
    modelProbabilityOverride:
      leg.modelProbabilityOverride === undefined
        ? undefined
        : readNumber(leg.modelProbabilityOverride, `legs[${index}].modelProbabilityOverride`, issues, {
            min: 0,
            max: 1
          }),
    minEvRoi:
      leg.minEvRoi === undefined ? undefined : readNumber(leg.minEvRoi, `legs[${index}].minEvRoi`, issues),
    minStake:
      leg.minStake === undefined ? undefined : readNumber(leg.minStake, `legs[${index}].minStake`, issues, { min: 0 }),
    maxStake:
      leg.maxStake === undefined
        ? undefined
        : readNumber(leg.maxStake, `legs[${index}].maxStake`, issues, { min: Number.EPSILON }),
    maxBankrollFraction:
      leg.maxBankrollFraction === undefined
        ? undefined
        : readNumber(leg.maxBankrollFraction, `legs[${index}].maxBankrollFraction`, issues, { min: 0, max: 1 }),
    maxSourceAgeMinutes:
      leg.maxSourceAgeMinutes === undefined
        ? undefined
        : readNumber(leg.maxSourceAgeMinutes, `legs[${index}].maxSourceAgeMinutes`, issues, { min: 0 }),
    maxMarketAgeMinutes:
      leg.maxMarketAgeMinutes === undefined
        ? undefined
        : readNumber(leg.maxMarketAgeMinutes, `legs[${index}].maxMarketAgeMinutes`, issues, { min: 0 }),
    marketContext: isPlainObject(leg.marketContext) ? leg.marketContext : undefined
  };
}

function validateLiveTicket(input) {
  const issues = [];

  if (!isPlainObject(input)) {
    throw new LiveTicketValidationError([{ path: "", message: "Expected a JSON object." }]);
  }

  const bankroll = readNumber(input.bankroll, "bankroll", issues, { min: Number.EPSILON });
  const kind = input.kind ?? "single";

  if (!["single", "parlay"].includes(kind)) {
    pushIssue(issues, "kind", "Expected either 'single' or 'parlay'.");
  }

  if (!Array.isArray(input.legs) || input.legs.length === 0) {
    pushIssue(issues, "legs", "Expected at least one leg.");
  }

  const normalizedLegs = Array.isArray(input.legs)
    ? input.legs.map((leg, index) => validateLiveLeg(leg, index, issues)).filter(Boolean)
    : [];
  const livePolicy = {
    ...DEFAULT_LIVE_POLICY,
    ...(isPlainObject(input.livePolicy) ? input.livePolicy : {})
  };

  if (isPlainObject(input.livePolicy) && input.livePolicy.requireCalibratedModel === false) {
    pushIssue(
      issues,
      "livePolicy.requireCalibratedModel",
      "Model calibration enforcement cannot be disabled."
    );
  }

  if (issues.length > 0) {
    throw new LiveTicketValidationError(issues);
  }

  return {
    kind,
    selection: typeof input.selection === "string" && input.selection.trim() ? input.selection.trim() : `${kind} ticket`,
    bankroll,
    legs: normalizedLegs,
    livePolicy
  };
}

module.exports = {
  LiveTicketValidationError,
  LIVE_TICKET_SCHEMA,
  validateLiveTicket
};
