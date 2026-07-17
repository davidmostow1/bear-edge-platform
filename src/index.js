const {
  BET_INPUT_SCHEMA,
  BetInputValidationError,
  validateBetInput
} = require("./validate-bet-input.js");
const {
  AUDIT_RECORD_SCHEMA_VERSION,
  createAmendmentRecord,
  createEvaluationRecord,
  createSettlementAuditRecord,
  validateAuditRecord
} = require("./audit/record-contract.js");
const {
  appendAuthoritativeRecord
} = require("./audit/authoritative-ledger.js");
const { contentDigest } = require("./audit/canonical-json.js");
const {
  DEFAULT_DECISION_LOG_PATH,
  appendDecisionLog,
  resolveDecisionLogPath
} = require("./decision-log.js");
const {
  appendSettlement,
  buildValidationGate,
  calculateClosingLineValue,
  createId,
  createSettlementRecord,
  getDecisionLogDashboard,
  readDecisionLogEntries,
  summarizeDecisionLogRecords
} = require("./analytics.js");
const { createServer } = require("./server.js");
const {
  evaluateLiveTicket,
  evaluateLiveTicketAndLog
} = require("./live/evaluate-live-ticket.js");
const { LiveDataCache } = require("./live/cache.js");
const { generateResearchCandidates } = require("./live/candidates.js");
const {
  fetchGamesForWindow,
  fetchMlbGamesForDate,
  fetchNhlGamesForDate
} = require("./live/schedule.js");
const {
  describeCausalEvidence,
  simulateBetCard
} = require("./live/probability-causality.js");
const {
  LiveTicketValidationError,
  LIVE_TICKET_SCHEMA,
  validateLiveTicket
} = require("./validate-live-ticket.js");
const {
  BET_DECISION_SCHEMA,
  LIVE_DECISION_SCHEMA,
  RESEARCH_PACKET_SCHEMA
} = require("./schemas.js");

/**
 * @typedef {object} ExpectedValueInput
 * @property {number} winProbability
 * @property {number} [americanOdds]
 * @property {number} [decimalOdds]
 * @property {number} [stake]
 */

/**
 * @typedef {object} KellyInput
 * @property {number} winProbability
 * @property {number} [americanOdds]
 * @property {number} [decimalOdds]
 */

/**
 * @typedef {object} StakeCapsInput
 * @property {number} bankroll
 * @property {number} kellyFraction
 * @property {number} [kellyMultiplier]
 * @property {number} [maxStake]
 * @property {number} [maxBankrollFraction]
 */

const DEFAULT_THRESHOLDS = Object.freeze({
  minEdge: 0.02,
  minEvRoi: 0.01,
  minKellyFraction: 0.005
});

const DEFAULT_STAKE_POLICY = Object.freeze({
  kellyMultiplier: 0.25,
  maxStake: Infinity,
  maxBankrollFraction: 0.03,
  minStake: 1
});

const DEFAULT_DECISION_LOG_TEMPLATE = Object.freeze({
  id: "",
  recordType: "evaluation",
  timestamp: "",
  selection: "",
  verdict: "PASS",
  reasons: [],
  inputs: {
    marketOdds: null,
    oppositeOdds: null,
    marketType: "straight",
    modelProbability: null,
    bankroll: null,
    marketWeight: null,
    injuryDataAgeMinutes: null,
    maxInjuryAgeMinutes: null,
    tiltLocked: false,
    isParlay: false,
    hasCorrelationRisk: false,
    thresholds: { ...DEFAULT_THRESHOLDS },
    stakePolicy: {
      kellyMultiplier: DEFAULT_STAKE_POLICY.kellyMultiplier,
      maxStake: null,
      maxBankrollFraction: DEFAULT_STAKE_POLICY.maxBankrollFraction,
      minStake: DEFAULT_STAKE_POLICY.minStake
    }
  },
  metrics: {
    marketImpliedProbability: null,
    marketNoVigProbability: null,
    marketVig: null,
    adjustedProbability: null,
    edge: null,
    fairEdge: null,
    priceEdge: null,
    decimalOdds: null,
    expectedValueRoi: null,
    expectedProfitAtRecommendedStake: null,
    rawKellyFraction: null,
    appliedKellyFraction: null,
    recommendedStake: null
  },
  riskFlags: [],
  stakeRecommendation: {
    uncappedStake: null,
    recommendedStake: null,
    cappedBy: []
  },
  notes: []
});

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

function assertPositiveNumber(value, name) {
  assertFiniteNumber(value, name);

  if (value <= 0) {
    throw new RangeError(`${name} must be greater than 0.`);
  }
}

function assertDecimalOdds(value, name) {
  assertFiniteNumber(value, name);

  if (value <= 1) {
    throw new RangeError(`${name} must be greater than 1.`);
  }
}

function assertNonNegativeNumber(value, name) {
  assertFiniteNumber(value, name);

  if (value < 0) {
    throw new RangeError(`${name} must be 0 or greater.`);
  }
}

function clone(value) {
  return JSON.parse(JSON.stringify(value));
}

function addRiskFlag(flags, code, severity, message) {
  if (!flags.some((flag) => flag.code === code)) {
    flags.push({ code, severity, message });
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

function shrinkProbabilityTowardMarket(modelProbability, marketProbability, marketWeight = 0.35) {
  assertProbability(modelProbability, "modelProbability");
  assertProbability(marketProbability, "marketProbability");
  assertProbability(marketWeight, "marketWeight");

  return modelProbability * (1 - marketWeight) + marketProbability * marketWeight;
}

/**
 * @param {ExpectedValueInput} param0
 */
function calculateExpectedValue({ winProbability, americanOdds, decimalOdds, stake = 1 }) {
  assertProbability(winProbability, "winProbability");
  assertPositiveNumber(stake, "stake");

  const resolvedDecimalOdds = decimalOdds ?? americanToDecimal(americanOdds);
  assertDecimalOdds(resolvedDecimalOdds, "decimalOdds");

  const netWinMultiple = resolvedDecimalOdds - 1;
  const expectedProfit = stake * (winProbability * netWinMultiple - (1 - winProbability));

  return {
    decimalOdds: resolvedDecimalOdds,
    expectedProfit,
    roi: expectedProfit / stake,
    profitIfWin: stake * netWinMultiple,
    lossIfLose: stake
  };
}

/**
 * @param {KellyInput} param0
 */
function calculateKellyFraction({ winProbability, americanOdds, decimalOdds }) {
  assertProbability(winProbability, "winProbability");

  const resolvedDecimalOdds = decimalOdds ?? americanToDecimal(americanOdds);
  assertDecimalOdds(resolvedDecimalOdds, "decimalOdds");

  const netWinMultiple = resolvedDecimalOdds - 1;
  const lossProbability = 1 - winProbability;
  const rawFraction = (netWinMultiple * winProbability - lossProbability) / netWinMultiple;

  return {
    rawFraction,
    fraction: Math.max(0, rawFraction)
  };
}

/**
 * @param {StakeCapsInput} param0
 */
function applyStakeCaps({
  bankroll,
  kellyFraction,
  kellyMultiplier = DEFAULT_STAKE_POLICY.kellyMultiplier,
  maxStake = DEFAULT_STAKE_POLICY.maxStake,
  maxBankrollFraction = DEFAULT_STAKE_POLICY.maxBankrollFraction
}) {
  assertPositiveNumber(bankroll, "bankroll");
  assertProbability(kellyFraction, "kellyFraction");
  assertProbability(kellyMultiplier, "kellyMultiplier");

  if (maxStake !== Infinity) {
    assertPositiveNumber(maxStake, "maxStake");
  }

  if (maxBankrollFraction !== Infinity) {
    assertProbability(maxBankrollFraction, "maxBankrollFraction");
  }

  const cappedBy = [];
  const uncappedStake = bankroll * kellyFraction * kellyMultiplier;
  let recommendedStake = uncappedStake;

  if (maxStake < recommendedStake) {
    recommendedStake = maxStake;
    cappedBy.push("maxStake");
  }

  const bankrollCap = bankroll * maxBankrollFraction;

  if (bankrollCap < recommendedStake) {
    recommendedStake = bankrollCap;
    cappedBy.push("maxBankrollFraction");
  }

  return {
    uncappedStake,
    recommendedStake,
    cappedBy
  };
}

function createDecisionLogTemplate() {
  return clone(DEFAULT_DECISION_LOG_TEMPLATE);
}

function evaluateBetDecision(input) {
  const {
    selection = "",
    marketOdds,
    oppositeOdds,
    marketType = "straight",
    modelProbability,
    bankroll,
    marketWeight = 0.35,
    injuryDataAgeMinutes = null,
    maxInjuryAgeMinutes = 90,
    tiltLocked = false,
    isParlay = false,
    hasCorrelationRisk = false,
    thresholds = {},
    stakePolicy = {},
    notes = []
  } = input;

  assertFiniteNumber(marketOdds, "marketOdds");
  assertFiniteNumber(oppositeOdds, "oppositeOdds");
  assertProbability(modelProbability, "modelProbability");
  assertPositiveNumber(bankroll, "bankroll");
  assertProbability(marketWeight, "marketWeight");

  if (injuryDataAgeMinutes !== null) {
    assertNonNegativeNumber(injuryDataAgeMinutes, "injuryDataAgeMinutes");
  }

  assertPositiveNumber(maxInjuryAgeMinutes, "maxInjuryAgeMinutes");

  const resolvedThresholds = {
    ...DEFAULT_THRESHOLDS,
    ...thresholds
  };
  const resolvedStakePolicy = {
    ...DEFAULT_STAKE_POLICY,
    ...stakePolicy
  };

  assertProbability(resolvedThresholds.minEdge, "thresholds.minEdge");
  assertNonNegativeNumber(resolvedThresholds.minEvRoi, "thresholds.minEvRoi");
  assertProbability(resolvedThresholds.minKellyFraction, "thresholds.minKellyFraction");
  assertNonNegativeNumber(resolvedStakePolicy.minStake, "stakePolicy.minStake");

  const riskFlags = [];
  const reasons = [];

  if (tiltLocked) {
    addRiskFlag(riskFlags, "TILT_LOCK", "high", "Tilt lock is active, so this play is an automatic PASS.");
    reasons.push("Tilt lock is active.");
  }

  if (isParlay) {
    addRiskFlag(riskFlags, "PARLAY_REJECTED", "high", "Parlays are rejected by default.");
    reasons.push("Parlays are rejected by default.");
  }

  if (hasCorrelationRisk) {
    addRiskFlag(
      riskFlags,
      "CORRELATION_RISK",
      "high",
      "Correlation risk was detected, so the position is rejected."
    );
    reasons.push("Correlation risk detected.");
  }

  if (injuryDataAgeMinutes !== null && injuryDataAgeMinutes > maxInjuryAgeMinutes) {
    addRiskFlag(
      riskFlags,
      "STALE_INJURY",
      "medium",
      "Injury information is stale, so the play should wait for an update."
    );
    reasons.push("Injury information is stale.");
  }

  const marketSnapshot = getTwoWayNoVigProbabilities(marketOdds, oppositeOdds);
  const adjustedProbability = shrinkProbabilityTowardMarket(
    modelProbability,
    marketSnapshot.noVigA,
    marketWeight
  );
  const fairEdge = adjustedProbability - marketSnapshot.noVigA;
  const priceEdge = adjustedProbability - marketSnapshot.impliedA;
  const edge = fairEdge;
  const unitEv = calculateExpectedValue({
    winProbability: adjustedProbability,
    americanOdds: marketOdds,
    stake: 1
  });
  const kelly = calculateKellyFraction({
    winProbability: adjustedProbability,
    americanOdds: marketOdds
  });
  const stakeRecommendation = applyStakeCaps({
    bankroll,
    kellyFraction: kelly.fraction,
    kellyMultiplier: resolvedStakePolicy.kellyMultiplier,
    maxStake: resolvedStakePolicy.maxStake,
    maxBankrollFraction: resolvedStakePolicy.maxBankrollFraction
  });

  if (stakeRecommendation.cappedBy.includes("maxStake")) {
    addRiskFlag(
      riskFlags,
      "STAKE_CAPPED_MAX_STAKE",
      "info",
      "Recommended stake was reduced by the max stake cap."
    );
  }

  if (stakeRecommendation.cappedBy.includes("maxBankrollFraction")) {
    addRiskFlag(
      riskFlags,
      "STAKE_CAPPED_BANKROLL",
      "info",
      "Recommended stake was reduced by the bankroll exposure cap."
    );
  }

  const hasHardPassGate = tiltLocked || isParlay || hasCorrelationRisk;
  const hasStaleInjuryGate =
    injuryDataAgeMinutes !== null && injuryDataAgeMinutes > maxInjuryAgeMinutes;

  let verdict = "BET";

  if (hasHardPassGate) {
    verdict = "PASS";
  } else if (hasStaleInjuryGate) {
    verdict = "WAIT";
  } else if (edge <= resolvedThresholds.minEdge) {
    verdict = "PASS";
    addRiskFlag(
      riskFlags,
      "EDGE_BELOW_THRESHOLD",
      "info",
      "Adjusted fair edge versus the no-vig market does not clear the minimum edge threshold."
    );
    reasons.push("Adjusted fair edge versus the no-vig market is below threshold.");
  } else if (unitEv.roi <= resolvedThresholds.minEvRoi) {
    verdict = "PASS";
    addRiskFlag(
      riskFlags,
      "EV_BELOW_THRESHOLD",
      "info",
      "Expected value versus the offered odds does not clear the minimum ROI threshold."
    );
    reasons.push("Expected value versus the offered odds is below threshold.");
  } else if (kelly.fraction <= resolvedThresholds.minKellyFraction) {
    verdict = "PASS";
    addRiskFlag(
      riskFlags,
      "KELLY_BELOW_THRESHOLD",
      "info",
      "Kelly fraction does not clear the minimum staking threshold."
    );
    reasons.push("Kelly fraction is below threshold.");
  } else if (stakeRecommendation.recommendedStake <= resolvedStakePolicy.minStake) {
    verdict = "PASS";
    addRiskFlag(
      riskFlags,
      "STAKE_BELOW_MINIMUM",
      "info",
      "Recommended stake is below the configured minimum stake."
    );
    reasons.push("Recommended stake is below minimum.");
  } else {
    reasons.push("Edge, EV, Kelly, and risk gates all pass.");
  }

  const stakeEv = calculateExpectedValue({
    winProbability: adjustedProbability,
    americanOdds: marketOdds,
    stake: Math.max(stakeRecommendation.recommendedStake, 1e-9)
  });

  const decisionLog = createDecisionLogTemplate();
  decisionLog.timestamp = new Date().toISOString();
  decisionLog.id = createId("eval");
  decisionLog.recordType = "evaluation";
  decisionLog.selection = selection;
  decisionLog.verdict = verdict;
  decisionLog.reasons = [...reasons];
  decisionLog.inputs = {
    marketOdds,
    oppositeOdds,
    marketType,
    modelProbability,
    bankroll,
    marketWeight,
    injuryDataAgeMinutes,
    maxInjuryAgeMinutes,
    tiltLocked,
    isParlay,
    hasCorrelationRisk,
    thresholds: { ...resolvedThresholds },
    stakePolicy: {
      kellyMultiplier: resolvedStakePolicy.kellyMultiplier,
      maxStake: Number.isFinite(resolvedStakePolicy.maxStake) ? resolvedStakePolicy.maxStake : null,
      maxBankrollFraction: resolvedStakePolicy.maxBankrollFraction,
      minStake: resolvedStakePolicy.minStake
    }
  };
  decisionLog.metrics = {
    marketImpliedProbability: marketSnapshot.impliedA,
    marketNoVigProbability: marketSnapshot.noVigA,
    marketVig: marketSnapshot.marketVig,
    adjustedProbability,
    edge,
    fairEdge,
    priceEdge,
    decimalOdds: unitEv.decimalOdds,
    expectedValueRoi: unitEv.roi,
    expectedProfitAtRecommendedStake: stakeRecommendation.recommendedStake > 0 ? stakeEv.expectedProfit : 0,
    rawKellyFraction: kelly.rawFraction,
    appliedKellyFraction: stakeRecommendation.recommendedStake / bankroll,
    recommendedStake: stakeRecommendation.recommendedStake
  };
  decisionLog.riskFlags = [...riskFlags];
  decisionLog.stakeRecommendation = {
    ...stakeRecommendation
  };
  decisionLog.notes = [...notes];

  return {
    verdict,
    reasons,
    riskFlags,
    market: marketSnapshot,
    adjustedProbability,
    edge,
    fairEdge,
    priceEdge,
    expectedValue: unitEv,
    kelly,
    stakeRecommendation,
    decisionLog
  };
}

function createStraightEvaluationAuditRecord(input, result, context = {}) {
  const createdAt = context.createdAt ?? new Date().toISOString();
  const modelStatus = context.model?.modelStatus ?? "research_only";
  const permission = context.permission ?? "PRICE_CHECK_ONLY";
  const reasons = [...result.reasons];
  const riskFlags = result.riskFlags.map((flag) => ({ ...flag }));
  let verdict = result.verdict;

  if (modelStatus !== "validated") {
    addRiskFlag(
      riskFlags,
      "MODEL_CALIBRATION_REQUIRED",
      "high",
      "The supplied probability is not linked to a validated model and calibration report."
    );
  }

  if (permission !== "VERIFIED_BETS_ALLOWED") {
    addRiskFlag(
      riskFlags,
      "ODDS_PROVIDER_UNVERIFIED",
      "high",
      "The offered price was entered manually and is not authorized as verified sportsbook evidence."
    );
  }

  if (verdict === "BET" && (modelStatus !== "validated" || permission !== "VERIFIED_BETS_ALLOWED")) {
    verdict = "WAIT";

    if (modelStatus !== "validated" && !reasons.includes("Model calibration is required before a BET verdict.")) {
      reasons.push("Model calibration is required before a BET verdict.");
    }

    if (permission !== "VERIFIED_BETS_ALLOWED" && !reasons.includes("Verified sportsbook evidence is required before a BET verdict.")) {
      reasons.push("Verified sportsbook evidence is required before a BET verdict.");
    }
  }

  const sourceDigest = contentDigest({
    selection: input.selection,
    marketType: input.marketType,
    marketOdds: input.marketOdds,
    oppositeOdds: input.oppositeOdds,
    modelProbability: input.modelProbability,
    bankroll: input.bankroll
  });
  const configurationDigest = contentDigest({
    marketWeight: result.decisionLog.inputs.marketWeight,
    thresholds: result.decisionLog.inputs.thresholds,
    stakePolicy: result.decisionLog.inputs.stakePolicy
  });

  return createEvaluationRecord({
    origin: {
      channel: context.origin?.channel ?? "internal",
      actorType: context.origin?.actorType ?? "operator",
      sessionId: context.origin?.sessionId ?? null,
      requestId: context.origin?.requestId ?? null
    },
    event: context.event ?? {},
    market: {
      marketFamily: context.market?.marketFamily ?? input.marketType,
      marketType: context.market?.marketType ?? input.marketType,
      participantId: context.market?.participantId ?? null,
      participantName: context.market?.participantName ?? null,
      selection: input.selection,
      side: context.market?.side ?? null,
      line: context.market?.line ?? null
    },
    price: {
      sportsbook: context.price?.sportsbook ?? null,
      marketOdds: input.marketOdds,
      oppositeOdds: input.oppositeOdds,
      priceCapturedAt: context.price?.priceCapturedAt ?? createdAt,
      priceSourceTime: context.price?.priceSourceTime ?? null
    },
    sources: context.sources ?? [{
      provider: "operator_input",
      sourceType: "manual_input",
      sourceLocator: context.sourceLocator ?? null,
      parserVersion: "1.0.0",
      capturedAt: createdAt,
      sourceTime: null,
      digest: sourceDigest,
      freshness: "unknown",
      verificationStatus: "unverified"
    }],
    model: {
      modelId: context.model?.modelId ?? "operator_probability_input",
      modelVersion: context.model?.modelVersion ?? "1.0.0",
      probabilityMethod: context.model?.probabilityMethod ?? "operator_supplied",
      modelStatus,
      calibrationReportId: context.model?.calibrationReportId ?? null,
      trainingCutoff: context.model?.trainingCutoff ?? null,
      sampleSize: context.model?.sampleSize ?? null
    },
    probability: {
      rawModelProbability: input.modelProbability,
      adjustedProbability: result.adjustedProbability,
      marketImpliedProbability: result.market.impliedA,
      marketNoVigProbability: result.market.noVigA
    },
    edge: {
      fairEdge: result.fairEdge,
      priceEdge: result.priceEdge,
      expectedValueRoi: result.expectedValue.roi,
      kellyFraction: result.kelly.fraction
    },
    stake: {
      recommendedStake: result.stakeRecommendation.recommendedStake,
      bankroll: input.bankroll,
      stakePolicyVersion: "1.0.0"
    },
    decision: {
      verdict,
      permission,
      reasons,
      riskFlags,
      gateResults: [
        {
          gate: "model_calibration",
          passed: modelStatus === "validated",
          reasonCode: modelStatus === "validated" ? null : "MODEL_CALIBRATION_REQUIRED"
        },
        {
          gate: "operational_permission",
          passed: permission === "VERIFIED_BETS_ALLOWED",
          reasonCode: permission === "VERIFIED_BETS_ALLOWED" ? null : "ODDS_PROVIDER_UNVERIFIED"
        }
      ]
    },
    audit: {
      codeVersion: context.codeVersion ?? null,
      configurationDigest,
      calculationVersion: "straight_evaluation_v2",
      evidenceCompleteness: permission === "VERIFIED_BETS_ALLOWED" ? "verified" : "operator_input_unverified",
      warnings: permission === "VERIFIED_BETS_ALLOWED"
        ? []
        : ["Manual odds input is retained as research evidence, not verified sportsbook authorization."]
    }
  }, {
    clientEventId: context.clientEventId,
    createdAt
  });
}

module.exports = {
  AUDIT_RECORD_SCHEMA_VERSION,
  appendAuthoritativeRecord,
  appendDecisionLog,
  appendSettlement,
  BET_DECISION_SCHEMA,
  BET_INPUT_SCHEMA,
  BetInputValidationError,
  createServer,
  DEFAULT_DECISION_LOG_TEMPLATE,
  DEFAULT_DECISION_LOG_PATH,
  DEFAULT_STAKE_POLICY,
  DEFAULT_THRESHOLDS,
  LIVE_DECISION_SCHEMA,
  LiveDataCache,
  LIVE_TICKET_SCHEMA,
  americanToDecimal,
  americanToImpliedProbability,
  normalizeTwoWayNoVig,
  getTwoWayNoVigProbabilities,
  shrinkProbabilityTowardMarket,
  calculateExpectedValue,
  buildValidationGate,
  calculateClosingLineValue,
  calculateKellyFraction,
  applyStakeCaps,
  createDecisionLogTemplate,
  createAmendmentRecord,
  createEvaluationRecord,
  createStraightEvaluationAuditRecord,
  createId,
  createSettlementAuditRecord,
  createSettlementRecord,
  evaluateBetDecision,
  generateResearchCandidates,
  fetchGamesForWindow,
  fetchMlbGamesForDate,
  fetchNhlGamesForDate,
  evaluateLiveTicket,
  evaluateLiveTicketAndLog,
  getDecisionLogDashboard,
  LiveTicketValidationError,
  RESEARCH_PACKET_SCHEMA,
  readDecisionLogEntries,
  resolveDecisionLogPath,
  describeCausalEvidence,
  simulateBetCard,
  summarizeDecisionLogRecords,
  validateLiveTicket,
  validateAuditRecord,
  validateBetInput
};
