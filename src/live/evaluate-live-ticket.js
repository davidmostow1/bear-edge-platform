const { appendAuthoritativeRecord } = require("../audit/authoritative-ledger.js");
const { contentDigest } = require("../audit/canonical-json.js");
const { createEvaluationRecord } = require("../audit/record-contract.js");
const { LiveDataCache } = require("./cache.js");
const { getProvider } = require("./provider-registry.js");
const { buildResearchPacket } = require("./research-packet.js");
const { fetchMlbPlayerPropSnapshot } = require("./providers/mlb.js");
const { fetchNhlPlayerPropSnapshot } = require("./providers/nhl.js");
const { combineParlayLegs, evaluateLiveLeg } = require("./estimate-prop.js");

const PROVIDERS = Object.freeze({
  mlb: fetchMlbPlayerPropSnapshot,
  nhl: fetchNhlPlayerPropSnapshot
});

function addRiskFlag(riskFlags, code, severity, message) {
  if (!riskFlags.some((flag) => flag.code === code)) {
    riskFlags.push({ code, severity, message });
  }
}

function finiteOrNull(value) {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function modelEvidenceForResult(result) {
  if (result.kind === "parlay") {
    return result.legs.map((leg) => leg.modelEvidence);
  }

  return [result.modelEvidence];
}

function auditModelFromEvidence(evidenceList) {
  const evidence = evidenceList.filter(Boolean);
  const primary = evidence[0] ?? {};
  const allValidated = evidence.length > 0 && evidence.every((entry) => entry.validated === true);
  const modelIds = new Set(evidence.map((entry) => entry.modelId).filter(Boolean));
  const modelVersions = new Set(evidence.map((entry) => entry.modelVersion).filter(Boolean));
  const hasCallerOverride = evidence.some((entry) => (
    entry.probabilitySource === "caller_probability_override"
  ));
  const hasInternalProbability = evidence.some((entry) => (
    entry.probabilitySource !== "caller_probability_override"
  ));
  const registryStatuses = new Set(evidence.map((entry) => entry.registryStatus).filter((status) => (
    ["research_only", "shadow", "validated", "retired"].includes(status)
  )));

  return {
    allValidated,
    modelId: hasCallerOverride
      ? hasInternalProbability ? "multiple_models" : "operator_probability_input"
      : modelIds.size === 1 ? [...modelIds][0] : modelIds.size > 1 ? "multiple_models" : "unregistered_model",
    modelVersion:
      hasCallerOverride
        ? hasInternalProbability ? "multiple_versions" : "1.0.0"
        : modelVersions.size === 1
        ? [...modelVersions][0]
        : modelVersions.size > 1 ? "multiple_versions" : "unknown",
    modelStatus:
      allValidated
        ? "validated"
        : registryStatuses.size === 1 && !registryStatuses.has("validated")
          ? [...registryStatuses][0]
          : "research_only",
    calibrationReportId: allValidated && evidence.length === 1
      ? primary.calibrationReportId ?? null
      : null
  };
}

function createLiveEvaluationAuditRecord(ticket, result, context = {}) {
  const createdAt = context.createdAt ?? new Date().toISOString();
  const primaryLeg = result.legs?.[0] ?? result;
  const primaryTicketLeg = ticket.legs[0];
  const isParlay = result.kind === "parlay";
  const modelEvidence = modelEvidenceForResult(result);
  const auditModel = auditModelFromEvidence(modelEvidence);
  const modelStatus = auditModel.modelStatus;
  const permission = context.permission ?? "PRICE_CHECK_ONLY";
  const reasons = [...result.reasons];
  const riskFlags = result.riskFlags.map((flag) => ({ ...flag }));
  let verdict = result.verdict;

  if (modelStatus !== "validated") {
    addRiskFlag(
      riskFlags,
      "MODEL_CALIBRATION_REQUIRED",
      "high",
      "Every displayed live probability must be backed by a validated calibration report before a BET verdict is authorized."
    );
  }

  if (permission !== "VERIFIED_BETS_ALLOWED") {
    addRiskFlag(
      riskFlags,
      "ODDS_PROVIDER_UNVERIFIED",
      "high",
      "Official statistics provide context only; the offered sportsbook price is not verified betting evidence."
    );
  }

  if (verdict === "BET" && (modelStatus !== "validated" || permission !== "VERIFIED_BETS_ALLOWED")) {
    verdict = "WAIT";

    if (modelStatus !== "validated") {
      reasons.push("Model calibration is required before a BET verdict.");
    }

    if (permission !== "VERIFIED_BETS_ALLOWED") {
      reasons.push("Verified sportsbook evidence is required before a BET verdict.");
    }
  }

  const probability = isParlay ? result.combined?.probability : primaryLeg.derived?.adjustedProbability;
  const marketReferenceProbability = isParlay
    ? result.combined?.marketReferenceProbability
    : primaryLeg.derived?.marketReferenceProbability;
  const marketOdds = isParlay ? result.combined?.americanOdds : primaryLeg.marketOdds;
  const priceCapturedAt = primaryTicketLeg.marketContext?.offeredLastUpdate ?? null;
  const configurationDigest = contentDigest({
    allowCorrelatedLegs: ticket.livePolicy.allowCorrelatedLegs,
    correlationPenalty: ticket.livePolicy.correlationPenalty,
    kellyMultiplier: ticket.livePolicy.kellyMultiplier,
    marketWeight: ticket.livePolicy.marketWeight,
    maxAltPropLegs: ticket.livePolicy.maxAltPropLegs,
    maxBankrollFraction: ticket.livePolicy.maxBankrollFraction,
    maxMarketAgeMinutes: ticket.livePolicy.maxMarketAgeMinutes,
    maxParlayLegs: ticket.livePolicy.maxParlayLegs,
    maxSourceAgeMinutes: ticket.livePolicy.maxSourceAgeMinutes,
    maxStake: finiteOrNull(ticket.livePolicy.maxStake),
    minEvRoi: ticket.livePolicy.minEvRoi,
    minFairEdge: ticket.livePolicy.minFairEdge,
    minKellyFraction: ticket.livePolicy.minKellyFraction,
    minStake: ticket.livePolicy.minStake,
    recentWeight: ticket.livePolicy.recentWeight,
    requireCalibratedModel: ticket.livePolicy.requireCalibratedModel,
    requireMarketTimestamp: ticket.livePolicy.requireMarketTimestamp,
    modelEvidence
  });

  return createEvaluationRecord({
    origin: {
      channel: context.origin?.channel ?? "internal",
      actorType: context.origin?.actorType ?? "operator",
      sessionId: context.origin?.sessionId ?? null,
      requestId: context.origin?.requestId ?? null
    },
    event: {
      sport: isParlay ? "multi" : primaryTicketLeg.provider,
      league: isParlay ? "multi" : primaryTicketLeg.provider.toUpperCase(),
      eventId: isParlay
        ? null
        : String(primaryTicketLeg.source.gamePk ?? primaryTicketLeg.source.gameId ?? primaryTicketLeg.source.eventId ?? "") || null,
      startTime: null,
      homeTeam: null,
      awayTeam: null
    },
    market: {
      marketFamily: isParlay
        ? "parlay"
        : primaryLeg.modelEvidence?.marketFamily ?? primaryLeg.marketType,
      marketType: isParlay ? "parlay" : primaryLeg.marketType,
      participantId: isParlay ? null : String(primaryLeg.source?.playerId ?? "") || null,
      participantName: isParlay ? null : primaryLeg.source?.playerName ?? null,
      selection: result.selection,
      side: isParlay ? null : primaryLeg.side,
      line: isParlay ? null : primaryLeg.line
    },
    price: {
      sportsbook: context.sportsbook ?? null,
      marketOdds: finiteOrNull(marketOdds),
      oppositeOdds: isParlay ? null : finiteOrNull(primaryLeg.oppositeOdds),
      priceCapturedAt,
      priceSourceTime: priceCapturedAt
    },
    sources: result.researchPacket.sources.map((source) => ({
      provider: source.provider,
      sourceType: "official_context_only",
      sourceLocator: source.sourceUrl ?? null,
      parserVersion: "provider_adapter_v1",
      capturedAt: source.fetchedAt ?? createdAt,
      sourceTime: source.fetchedAt ?? null,
      digest: contentDigest({
        currentGameValue: finiteOrNull(source.currentGameValue),
        playerName: source.playerName ?? null,
        provider: source.provider,
        recentPerGame: finiteOrNull(source.recentPerGame),
        seasonPerGame: finiteOrNull(source.seasonPerGame),
        statKey: source.statKey ?? null,
        teamName: source.teamName ?? null
      }),
      freshness: source.cache?.stale ? "stale" : "fresh",
      verificationStatus: "official_context_only"
    })),
    model: {
      modelId: auditModel.modelId,
      modelVersion: auditModel.modelVersion,
      probabilityMethod: isParlay
        ? "leg_probability_product"
        : primaryLeg.modelEvidence?.probabilitySource === "caller_probability_override"
          ? "operator_supplied_market_adjusted"
          : "poisson_market_adjusted",
      modelStatus,
      calibrationReportId: auditModel.calibrationReportId,
      trainingCutoff: null,
      sampleSize: result.researchPacket.sources.reduce((total, source) => {
        return total + (finiteOrNull(source.recentPerGame) === null ? 0 : 1);
      }, 0)
    },
    probability: {
      rawModelProbability: finiteOrNull(probability),
      adjustedProbability: finiteOrNull(probability),
      marketImpliedProbability: finiteOrNull(marketReferenceProbability),
      marketNoVigProbability: finiteOrNull(marketReferenceProbability)
    },
    edge: {
      fairEdge: finiteOrNull(
        isParlay
          ? probability - marketReferenceProbability
          : primaryLeg.derived?.fairEdge
      ),
      priceEdge: finiteOrNull(
        isParlay
          ? probability - marketReferenceProbability
          : primaryLeg.derived?.priceEdge
      ),
      expectedValueRoi: finiteOrNull(result.expectedValue?.roi),
      kellyFraction: finiteOrNull(result.kelly?.fraction)
    },
    stake: {
      recommendedStake: finiteOrNull(result.stakeRecommendation?.recommendedStake),
      bankroll: ticket.bankroll,
      stakePolicyVersion: "live_policy_v1"
    },
    decision: {
      verdict,
      permission,
      reasons,
      riskFlags,
      gateResults: [
        {
          gate: "model_calibration",
          passed: auditModel.allValidated,
          reasonCode: auditModel.allValidated ? null : "MODEL_CALIBRATION_REQUIRED",
          evidence: modelEvidence.length === 1 ? modelEvidence[0] : modelEvidence
        },
        {
          gate: "operational_permission",
          passed: permission === "VERIFIED_BETS_ALLOWED",
          reasonCode: permission === "VERIFIED_BETS_ALLOWED" ? null : "ODDS_PROVIDER_UNVERIFIED"
        },
        {
          gate: "underlying_live_evaluation",
          passed: result.verdict === "BET",
          reasonCode: result.verdict === "BET" ? null : `UNDERLYING_${result.verdict}`
        }
      ]
    },
    audit: {
      codeVersion: context.codeVersion ?? null,
      configurationDigest,
      calculationVersion: "live_evaluation_v2",
      evidenceCompleteness: permission === "VERIFIED_BETS_ALLOWED" ? "verified" : "official_context_price_unverified",
      warnings: permission === "VERIFIED_BETS_ALLOWED"
        ? []
        : ["Official league data does not verify the offered sportsbook line or price."]
    }
  }, {
    clientEventId: context.clientEventId,
    createdAt
  });
}

async function fetchLegSnapshot(leg, options = {}) {
  const cache = options.cache ?? new LiveDataCache({
    refreshIntervalMs: options.refreshIntervalMs
  });

  if (options.disableCache) {
    const provider = getProvider(leg.provider);
    return provider(leg.source, options);
  }

  return cache.getSnapshotForLeg(leg, options);
}

async function evaluateLiveTicket(ticket, options = {}) {
  const legResults = [];

  for (const leg of ticket.legs) {
    const snapshot = await fetchLegSnapshot(leg, options);
    legResults.push(
      evaluateLiveLeg(leg, snapshot, {
        bankroll: ticket.bankroll,
        livePolicy: ticket.livePolicy,
        modelRegistryOptions: options.modelRegistryOptions
      })
    );
  }
  const researchPacket = buildResearchPacket(ticket, legResults);

  const result =
    ticket.kind === "parlay"
      ? combineParlayLegs(ticket, legResults)
      : {
          kind: "single",
          selection: ticket.selection ?? legResults[0].selection,
          ...legResults[0]
        };

  const resultWithEvidence = {
    ...result,
    researchPacket,
    modelEvidence: ticket.kind === "parlay"
      ? {
          validated: legResults.length > 0 && legResults.every((leg) => leg.modelEvidence.validated),
          models: legResults.map((leg) => leg.modelEvidence)
        }
      : legResults[0].modelEvidence
  };
  const decisionLog = createLiveEvaluationAuditRecord(ticket, resultWithEvidence, options.auditContext);

  return {
    ...resultWithEvidence,
    decisionLog
  };
}

async function evaluateLiveTicketAndLog(ticket, options = {}) {
  if (options.writeLog === false) {
    throw new TypeError("Authoritative logging cannot be disabled.");
  }

  const result = await evaluateLiveTicket(ticket, options);
  const persistence = await appendAuthoritativeRecord(result.decisionLog, options);

  return {
    ...result,
    verdict: result.decisionLog.verdict,
    reasons: result.decisionLog.reasons,
    riskFlags: result.decisionLog.riskFlags,
    recordId: result.decisionLog.id,
    clientEventId: result.decisionLog.clientEventId,
    contentDigest: result.decisionLog.contentDigest,
    persistedAt: persistence.persistedAt,
    logPath: persistence.ledgerPath,
    ledgerPath: persistence.ledgerPath
  };
}

module.exports = {
  createLiveEvaluationAuditRecord,
  evaluateLiveTicket,
  evaluateLiveTicketAndLog
};
