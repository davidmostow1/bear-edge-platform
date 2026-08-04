const { DEFAULT_LIVE_POLICY } = require("./live/estimate-prop.js");

const LIVE_TICKET_SCHEMA = Object.freeze({
  type: "object",
  additionalProperties: false,
  required: ["bankroll", "legs"],
  properties: {
    kind: { type: "string", enum: ["single", "parlay"] },
    selection: { type: "string" },
    bankroll: { type: "number", exclusiveMinimum: 0 },
    minFairEdge: { type: "number", minimum: 0, maximum: 1 },
    minEvRoi: { type: "number", minimum: 0 },
    minKellyFraction: { type: "number", minimum: 0, maximum: 1 },
    minStake: { type: "number", minimum: 0 },
    kellyMultiplier: { type: "number", minimum: 0, maximum: 1 },
    maxStake: { type: "number", exclusiveMinimum: 0 },
    maxBankrollFraction: { type: "number", minimum: 0, maximum: 1 },
    writeLog: { type: "boolean" },
    logPath: { type: "string" },
    livePolicy: {
      type: "object",
      additionalProperties: false,
      properties: {
        marketWeight: { type: "number", minimum: 0, maximum: 1 },
        recentWeight: { type: "number", minimum: 0, maximum: 1 },
        minFairEdge: { type: "number", minimum: 0, maximum: 1 },
        minEvRoi: { type: "number", minimum: 0 },
        minKellyFraction: { type: "number", minimum: 0, maximum: 1 },
        maxParlayLegs: { type: "integer", minimum: 2, maximum: 3 },
        maxAltPropLegs: { type: "integer", minimum: 0, maximum: 2 },
        maxSourceAgeMinutes: { type: "number", minimum: 0 },
        maxMarketAgeMinutes: { type: "number", minimum: 0 },
        correlationPenalty: { type: "number", minimum: 0, maximum: 1 },
        allowCorrelatedLegs: { type: "boolean" },
        requireMarketTimestamp: { type: "boolean" },
        requireCalibratedModel: { type: "boolean" },
        kellyMultiplier: { type: "number", minimum: 0, maximum: 1 },
        maxStake: { type: "number", exclusiveMinimum: 0 },
        maxBankrollFraction: { type: "number", minimum: 0, maximum: 1 },
        minStake: { type: "number", minimum: 0 }
      }
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
          marketOdds: { type: "number", not: { const: 0 } },
          oppositeOdds: { type: "number", not: { const: 0 } },
          modelProbabilityOverride: { type: "number", minimum: 0, maximum: 1 },
          recentWeight: { type: "number", minimum: 0, maximum: 1 },
          marketWeight: { type: "number", minimum: 0, maximum: 1 },
          minEvRoi: { type: "number", minimum: 0 },
          minFairEdge: { type: "number", minimum: 0, maximum: 1 },
          minKellyFraction: { type: "number", minimum: 0, maximum: 1 },
          calibrationStatus: { type: "string", enum: ["validated", "research_only", "unknown"] },
          modelId: { type: "string", minLength: 1 },
          modelVersion: { type: "string", minLength: 1 },
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
            items: {
              type: "object",
              properties: {
                code: { type: "string" },
                severity: { type: "string", enum: ["info", "medium", "high"] },
                message: { type: "string" }
              }
            }
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

function ensureOnlyAllowedKeys(value, allowedKeys, path, issues) {
  for (const key of Object.keys(value ?? {})) {
    if (!allowedKeys.includes(key)) {
      pushIssue(issues, path ? `${path}.${key}` : key, "Unknown field.");
    }
  }
}

function readBoolean(value, path, issues) {
  if (typeof value !== "boolean") {
    pushIssue(issues, path, "Expected a boolean.");
    return null;
  }

  return value;
}

function readInteger(value, path, issues, { min = -Infinity, max = Infinity } = {}) {
  if (!Number.isInteger(value)) {
    pushIssue(issues, path, "Expected an integer.");
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

function deriveCorrelationKey(leg) {
  if (typeof leg.correlationKey === "string" && leg.correlationKey.trim()) {
    return leg.correlationKey.trim();
  }

  const source = isPlainObject(leg.source) ? leg.source : {};
  const eventId = source.gamePk ?? source.gameId ?? source.eventId;
  const playerId = source.playerId ?? source.athleteId;

  if (eventId !== undefined && eventId !== null) {
    return `${leg.provider}:event:${String(eventId)}`;
  }

  if (playerId !== undefined && playerId !== null) {
    return `${leg.provider}:player:${String(playerId)}`;
  }

  return undefined;
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

  ensureOnlyAllowedKeys(
    leg,
    [
      "id",
      "label",
      "provider",
      "marketType",
      "side",
      "line",
      "marketOdds",
      "oppositeOdds",
      "riskFlags",
      "source",
      "correlationKey",
      "recentWeight",
      "marketWeight",
      "modelProbabilityOverride",
      "calibrationStatus",
      "modelId",
      "modelVersion",
      "minFairEdge",
      "minEvRoi",
      "minKellyFraction",
      "minStake",
      "kellyMultiplier",
      "maxStake",
      "maxBankrollFraction",
      "maxSourceAgeMinutes",
      "maxMarketAgeMinutes",
      "marketContext"
    ],
    `legs[${index}]`,
    issues
  );

  const marketOdds = readNumber(leg.marketOdds, `legs[${index}].marketOdds`, issues, { disallowZero: true });
  const line = readNumber(leg.line, `legs[${index}].line`, issues, { min: 0 });
  const oppositeOdds =
    leg.oppositeOdds === undefined
      ? undefined
      : readNumber(leg.oppositeOdds, `legs[${index}].oppositeOdds`, issues, { disallowZero: true });

  if (line !== null && Number.isInteger(line)) {
    pushIssue(
      issues,
      `legs[${index}].line`,
      "Expected a half-point count line; integer lines require push-aware modeling."
    );
  }

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
  } else {
    ensureOnlyAllowedKeys(
      leg.source,
      ["playerId", "athleteId", "statGroup", "statKey", "recentLimit", "gamePk", "gameId", "eventId"],
      `legs[${index}].source`,
      issues
    );

    if (typeof leg.source.playerId !== "number" || !Number.isFinite(leg.source.playerId) || leg.source.playerId <= 0) {
      pushIssue(issues, `legs[${index}].source.playerId`, "Expected a positive numeric playerId.");
    }

    if (typeof leg.source.statKey !== "string" || !leg.source.statKey.trim()) {
      pushIssue(issues, `legs[${index}].source.statKey`, "Expected a non-empty statKey.");
    }

    if (leg.source.statGroup !== undefined &&
        (typeof leg.source.statGroup !== "string" || !leg.source.statGroup.trim())) {
      pushIssue(issues, `legs[${index}].source.statGroup`, "Expected a non-empty statGroup when supplied.");
    }

    if (leg.source.recentLimit !== undefined &&
        (!Number.isInteger(leg.source.recentLimit) || leg.source.recentLimit < 1 || leg.source.recentLimit > 100)) {
      pushIssue(issues, `legs[${index}].source.recentLimit`, "Expected an integer from 1 through 100.");
    }

    if (leg.source.gamePk !== undefined &&
        (typeof leg.source.gamePk !== "number" || !Number.isFinite(leg.source.gamePk) || leg.source.gamePk <= 0)) {
      pushIssue(issues, `legs[${index}].source.gamePk`, "Expected a positive numeric gamePk when supplied.");
    }
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

  if (leg.marketContext !== undefined && !isPlainObject(leg.marketContext)) {
    pushIssue(issues, `legs[${index}].marketContext`, "Expected an object when supplied.");
  } else if (isPlainObject(leg.marketContext)) {
    ensureOnlyAllowedKeys(
      leg.marketContext,
      ["offeredLastUpdate", "consensus", "history"],
      `legs[${index}].marketContext`,
      issues
    );
  }

  if (leg.riskFlags !== undefined && !Array.isArray(leg.riskFlags)) {
    pushIssue(issues, `legs[${index}].riskFlags`, "Expected an array when supplied.");
  }

  const normalizedRiskFlags = Array.isArray(leg.riskFlags)
    ? leg.riskFlags
        .filter((flag) => isPlainObject(flag))
        .map((flag, flagIndex) => {
          ensureOnlyAllowedKeys(
            flag,
            ["code", "severity", "message"],
            `legs[${index}].riskFlags[${flagIndex}]`,
            issues
          );
          const severity = typeof flag.severity === "string" ? flag.severity : "info";

          if (!["info", "medium", "high"].includes(severity)) {
            pushIssue(issues, `legs[${index}].riskFlags[${flagIndex}].severity`, "Expected one of: info, medium, high.");
          }

          return {
            code: typeof flag.code === "string" && flag.code.trim() ? flag.code : "UNKNOWN",
            severity: ["info", "medium", "high"].includes(severity) ? severity : "high",
            message: typeof flag.message === "string" ? flag.message : String(flag.code ?? "Risk flag")
          };
        })
    : [];

  return {
    id: leg.id,
    label: typeof leg.label === "string" ? leg.label : leg.id,
    provider: leg.provider,
    marketType: leg.marketType,
    side: leg.side,
    line,
    marketOdds,
    oppositeOdds,
    riskFlags: normalizedRiskFlags,
    source: leg.source,
    correlationKey: deriveCorrelationKey(leg),
    recentWeight:
      leg.recentWeight === undefined
        ? undefined
        : readNumber(leg.recentWeight, `legs[${index}].recentWeight`, issues, { min: 0, max: 1 }),
    marketWeight:
      leg.marketWeight === undefined
        ? undefined
        : readNumber(leg.marketWeight, `legs[${index}].marketWeight`, issues, { min: 0, max: 1 }),
    minFairEdge:
      leg.minFairEdge === undefined
        ? undefined
        : readNumber(leg.minFairEdge, `legs[${index}].minFairEdge`, issues, { min: 0, max: 1 }),
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
      leg.minEvRoi === undefined
        ? undefined
        : readNumber(leg.minEvRoi, `legs[${index}].minEvRoi`, issues, { min: 0 }),
    minKellyFraction:
      leg.minKellyFraction === undefined
        ? undefined
        : readNumber(leg.minKellyFraction, `legs[${index}].minKellyFraction`, issues, { min: 0, max: 1 }),
    minStake:
      leg.minStake === undefined ? undefined : readNumber(leg.minStake, `legs[${index}].minStake`, issues, { min: 0 }),
    kellyMultiplier:
      leg.kellyMultiplier === undefined
        ? undefined
        : readNumber(leg.kellyMultiplier, `legs[${index}].kellyMultiplier`, issues, { min: 0, max: 1 }),
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

  ensureOnlyAllowedKeys(
    input,
    [
      "kind",
      "selection",
      "bankroll",
      "legs",
      "livePolicy",
      "minFairEdge",
      "minEvRoi",
      "minKellyFraction",
      "minStake",
      "kellyMultiplier",
      "maxStake",
      "maxBankrollFraction",
      "writeLog",
      "logPath"
    ],
    "",
    issues
  );

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
  const rawPolicy = input.livePolicy === undefined ? {} : input.livePolicy;

  if (!isPlainObject(rawPolicy)) {
    pushIssue(issues, "livePolicy", "Expected an object when supplied.");
  }

  const policyInput = isPlainObject(rawPolicy) ? rawPolicy : {};
  ensureOnlyAllowedKeys(policyInput, Object.keys(DEFAULT_LIVE_POLICY), "livePolicy", issues);
  const livePolicy = { ...DEFAULT_LIVE_POLICY };
  const policyNumberRules = {
    marketWeight: { min: 0, max: 1 },
    recentWeight: { min: 0, max: 1 },
    minFairEdge: { min: 0, max: 1 },
    minEvRoi: { min: 0 },
    minKellyFraction: { min: 0, max: 1 },
    maxSourceAgeMinutes: { min: 0 },
    maxMarketAgeMinutes: { min: 0 },
    correlationPenalty: { min: 0, max: 1 },
    kellyMultiplier: { min: 0, max: 1 },
    maxBankrollFraction: { min: 0, max: 1 },
    minStake: { min: 0 }
  };

  for (const [key, rules] of Object.entries(policyNumberRules)) {
    if (policyInput[key] !== undefined) {
      livePolicy[key] = readNumber(policyInput[key], `livePolicy.${key}`, issues, rules);
    }
  }

  if (policyInput.maxStake !== undefined) {
    livePolicy.maxStake = readNumber(policyInput.maxStake, "livePolicy.maxStake", issues, { min: Number.EPSILON });
  }

  if (policyInput.maxParlayLegs !== undefined) {
    livePolicy.maxParlayLegs = readInteger(policyInput.maxParlayLegs, "livePolicy.maxParlayLegs", issues, { min: 2, max: 3 });
  }

  if (policyInput.maxAltPropLegs !== undefined) {
    livePolicy.maxAltPropLegs = readInteger(policyInput.maxAltPropLegs, "livePolicy.maxAltPropLegs", issues, { min: 0, max: 2 });
  }

  for (const key of ["allowCorrelatedLegs", "requireMarketTimestamp", "requireCalibratedModel"]) {
    if (policyInput[key] !== undefined) {
      livePolicy[key] = readBoolean(policyInput[key], `livePolicy.${key}`, issues);
    }
  }

  if (policyInput.requireCalibratedModel === false) {
    pushIssue(
      issues,
      "livePolicy.requireCalibratedModel",
      "Model calibration enforcement cannot be disabled."
    );
  }

  if (kind === "single" && Array.isArray(input.legs) && input.legs.length !== 1) {
    pushIssue(issues, "legs", "A single ticket requires exactly one leg.");
  }

  if (kind === "parlay" && Array.isArray(input.legs)) {
    if (input.legs.length < 2) {
      pushIssue(issues, "legs", "A parlay requires at least two legs.");
    }

    if (input.legs.length > Math.min(3, livePolicy.maxParlayLegs ?? 3)) {
      pushIssue(issues, "legs", `A parlay supports no more than ${Math.min(3, livePolicy.maxParlayLegs ?? 3)} legs.`);
    }

    const altPropCount = normalizedLegs.filter((leg) => leg.marketType === "alt-prop").length;
    if (altPropCount > (livePolicy.maxAltPropLegs ?? 2)) {
      pushIssue(issues, "legs", `A parlay supports no more than ${livePolicy.maxAltPropLegs ?? 2} alternate prop legs.`);
    }
  }

  const topLevelNumberRules = {
    minFairEdge: { min: 0, max: 1 },
    minEvRoi: { min: 0 },
    minKellyFraction: { min: 0, max: 1 },
    minStake: { min: 0 },
    kellyMultiplier: { min: 0, max: 1 },
    maxStake: { min: Number.EPSILON },
    maxBankrollFraction: { min: 0, max: 1 }
  };
  const normalizedTopLevelControls = {};

  for (const [key, rules] of Object.entries(topLevelNumberRules)) {
    if (input[key] !== undefined) {
      normalizedTopLevelControls[key] = readNumber(input[key], key, issues, rules);
    }
  }

  if (issues.length > 0) {
    throw new LiveTicketValidationError(issues);
  }

  // Top-level controls are a convenience form for single and parlay tickets;
  // copy them into the policy that the evaluator actually consumes.
  Object.assign(livePolicy, normalizedTopLevelControls);

  return {
    kind,
    selection: typeof input.selection === "string" && input.selection.trim() ? input.selection.trim() : `${kind} ticket`,
    bankroll,
    legs: normalizedLegs,
    livePolicy,
    ...normalizedTopLevelControls
  };
}

module.exports = {
  LiveTicketValidationError,
  LIVE_TICKET_SCHEMA,
  validateLiveTicket
};
