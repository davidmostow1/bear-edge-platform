const crypto = require("node:crypto");

const {
  appendAuthoritativeRecord,
  resolveAuthoritativeLedgerPath
} = require("./authoritative-ledger.js");
const { canonicalStringify, contentDigest } = require("./canonical-json.js");
const { createEvaluationRecord } = require("./record-contract.js");

const MARKET_PERMISSION_BLOCKERS = new Set([
  "FUTURE_MARKET_TIMESTAMP",
  "INVALID_MARKET_TIMESTAMP",
  "MARKET_DISAGREEMENT",
  "MISSING_MARKET_COUNTERPART",
  "MISSING_MARKET_TIMESTAMP",
  "STALE_MARKET_PRICE"
]);

function finiteOrNull(value) {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function impliedProbability(americanOdds) {
  const odds = finiteOrNull(americanOdds);

  if (odds === null || odds === 0) {
    return null;
  }

  return odds > 0 ? 100 / (odds + 100) : Math.abs(odds) / (Math.abs(odds) + 100);
}

function deterministicUuid(value) {
  const bytes = Buffer.from(
    crypto.createHash("sha256").update(canonicalStringify(value)).digest().subarray(0, 16)
  );

  bytes[6] = (bytes[6] & 0x0f) | 0x50;
  bytes[8] = (bytes[8] & 0x3f) | 0x80;

  const hex = bytes.toString("hex");
  return [
    hex.slice(0, 8),
    hex.slice(8, 12),
    hex.slice(12, 16),
    hex.slice(16, 20),
    hex.slice(20)
  ].join("-");
}

function participantId(target) {
  const value = target.player?.id ??
    target.player?.playerId ??
    target.ticketDraft?.legs?.[0]?.source?.playerId ??
    null;

  return value === null || value === undefined ? null : String(value);
}

function resolveModel(target) {
  const evidence = target.modelEvidence;
  const reportedStatus = evidence
    ? evidence.validated
      ? "validated"
      : evidence.registryStatus === "validated"
        ? "research_only"
        : evidence.registryStatus
    : target.model?.modelStatus ?? "research_only";
  const modelStatus = ["research_only", "shadow", "validated", "retired"].includes(reportedStatus)
    ? reportedStatus
    : "research_only";

  return {
    modelId: target.modelEvidence?.modelId ?? target.model?.modelId ?? "poisson_count_v1",
    modelVersion: target.modelEvidence?.modelVersion ?? target.model?.modelVersion ?? "1.0.0",
    probabilityMethod: target.model?.probabilityMethod ?? "poisson_count",
    modelStatus,
    calibrationReportId:
      target.modelEvidence?.calibrationReportId ?? target.model?.calibrationReportId ?? null,
    trainingCutoff: target.model?.trainingCutoff ?? null,
    sampleSize: finiteOrNull(target.model?.sampleSize)
  };
}

function resolvePermission(result, target, context) {
  if (context.permission && context.permission !== "VERIFIED_BETS_ALLOWED") {
    return context.permission;
  }

  const executionBookmaker = String(result.executionBookmaker ?? "").trim().toLowerCase();
  const offeredBookmaker = String(target.odds?.bookmaker?.key ?? "").trim().toLowerCase();
  const priceTimestamp = target.odds?.marketContext?.offeredLastUpdate;
  const priceTimestampMs = Date.parse(priceTimestamp ?? "");
  const capturedAtMs = Date.parse(result.fetchedAt ?? "");
  const maxMarketAgeMinutes = Number(
    target.evaluation?.stakePolicy?.maxMarketAgeMinutes ??
    target.ticketDraft?.livePolicy?.maxMarketAgeMinutes ??
    10
  );
  const marketAgeMinutes = (capturedAtMs - priceTimestampMs) / 60000;
  const riskFlags = [
    ...(target.riskFlags ?? []),
    ...(target.evaluation?.riskFlags ?? [])
  ];
  const hasBlockingRisk = riskFlags.some((flag) => MARKET_PERMISSION_BLOCKERS.has(flag.code));
  const verifiedPrice = result.sourceMode === "official_stats_plus_verified_odds" &&
    target.status === "priced" &&
    executionBookmaker.length > 0 &&
    offeredBookmaker === executionBookmaker &&
    target.odds?.selectionMethod === "required_bookmaker_price" &&
    finiteOrNull(target.odds?.marketOdds) !== null &&
    finiteOrNull(target.odds?.oppositeOdds) !== null &&
    Number.isFinite(priceTimestampMs) &&
    Number.isFinite(capturedAtMs) &&
    Number.isFinite(maxMarketAgeMinutes) &&
    maxMarketAgeMinutes > 0 &&
    marketAgeMinutes >= 0 &&
    marketAgeMinutes <= maxMarketAgeMinutes &&
    !hasBlockingRisk;

  return verifiedPrice ? "VERIFIED_BETS_ALLOWED" : "PRICE_CHECK_ONLY";
}

function addRiskFlag(riskFlags, code, severity, message) {
  if (!riskFlags.some((flag) => flag.code === code)) {
    riskFlags.push({ code, severity, message });
  }
}

function buildIdentity(result, target, model) {
  return {
    sourceMode: result.sourceMode ?? null,
    fetchedAt: result.fetchedAt ?? null,
    eventId: target.gameId ?? null,
    marketFamily: target.modelEvidence?.marketFamily ?? target.marketType ?? "player_prop",
    participantId: participantId(target),
    side: target.lean ?? null,
    line: finiteOrNull(target.line),
    sportsbook: target.odds?.bookmaker?.key ?? null,
    priceTimestamp: target.odds?.marketContext?.offeredLastUpdate ?? null,
    modelId: model.modelId,
    modelVersion: model.modelVersion
  };
}

function buildSources(result, target, createdAt) {
  const sources = [{
    provider: target.provider ?? target.sport ?? "unknown",
    sourceType: "official_context_only",
    sourceLocator: target.stats?.sourceUrl ?? null,
    parserVersion: "candidate_serializer_v1",
    capturedAt: target.stats?.fetchedAt ?? createdAt,
    sourceTime: target.stats?.fetchedAt ?? null,
    digest: contentDigest({
      recentPerGame: finiteOrNull(target.stats?.recentPerGame),
      seasonPerGame: finiteOrNull(target.stats?.seasonPerGame),
      statKey: target.statKey ?? null,
      targetId: target.id ?? null
    }),
    freshness: "unknown",
    verificationStatus: "official_context_only"
  }];

  if (target.odds) {
    sources.push({
      provider: target.odds.bookmaker?.key ?? "odds_provider",
      sourceType: "sportsbook_price",
      sourceLocator: result.oddsSources?.eventsSourceUrl ?? null,
      parserVersion: "odds_provider_adapter_v1",
      capturedAt: target.odds.marketContext?.offeredLastUpdate ?? createdAt,
      sourceTime: target.odds.marketContext?.offeredLastUpdate ?? null,
      digest: contentDigest({
        marketKey: target.odds.marketKey ?? null,
        marketOdds: finiteOrNull(target.odds.marketOdds),
        oppositeOdds: finiteOrNull(target.odds.oppositeOdds),
        point: finiteOrNull(target.odds.point),
        sportsbook: target.odds.bookmaker?.key ?? null
      }),
      freshness: target.evaluation?.riskFlags?.some((flag) => flag.code === "STALE_MARKET_PRICE")
        ? "stale"
        : "fresh",
      verificationStatus: result.sourceMode === "official_stats_plus_verified_odds"
        ? "verified_provider_capture"
        : "unverified"
    });
  }

  return sources;
}

function createDisplayedTargetRecord(result, target, context = {}) {
  const createdAt = result.fetchedAt ?? context.createdAt ?? new Date().toISOString();
  const model = resolveModel(target);
  const permission = resolvePermission(result, target, context);
  const nestedVerdict = ["PASS", "WAIT", "BET"].includes(target.evaluation?.verdict)
    ? target.evaluation.verdict
    : "WAIT";
  const reasons = [...(target.evaluation?.reasons ?? target.notes ?? [])];
  const riskFlags = (target.evaluation?.riskFlags ?? target.riskFlags ?? []).map((flag) => ({ ...flag }));
  let verdict = nestedVerdict;

  if (target.status !== "priced" || !target.odds) {
    verdict = "WAIT";
    reasons.push("A verified sportsbook line and price are required before classification as a bet.");
    addRiskFlag(
      riskFlags,
      "ODDS_PROVIDER_UNVERIFIED",
      "high",
      "This displayed target is a price check and has no verified sportsbook price."
    );
  }

  if (model.modelStatus !== "validated" && verdict === "BET") {
    verdict = "WAIT";
    reasons.push("The research model is not validated for production betting.");
  }

  if (model.modelStatus !== "validated") {
    addRiskFlag(
      riskFlags,
      "MODEL_CALIBRATION_REQUIRED",
      "high",
      "A calibration report is required before this model can authorize a BET verdict."
    );
  }

  if (permission !== "VERIFIED_BETS_ALLOWED" && verdict === "BET") {
    verdict = "WAIT";
    reasons.push("Operational permission is limited to price checking.");
  }

  const clientEventId = deterministicUuid(buildIdentity(result, target, model));
  const matchup = String(target.matchup ?? "").split(" at ");
  const marketOdds = finiteOrNull(target.odds?.marketOdds);
  const marketProbability = finiteOrNull(target.evaluation?.marketProbability) ?? impliedProbability(marketOdds);
  const adjustedProbability = finiteOrNull(target.evaluation?.adjustedProbability) ?? finiteOrNull(target.modelProbability);
  const probabilityUncertainty = target.evaluation?.probabilityUncertainty;
  const maximumProbabilityIntervalWidth =
    target.evaluation?.stakePolicy?.maxProbabilityIntervalWidth ?? 0.5;
  const hasObservedUncertainty = probabilityUncertainty?.intervalBasis === "observed_count" &&
    finiteOrNull(probabilityUncertainty?.decisionProbability) !== null &&
    finiteOrNull(probabilityUncertainty?.width) !== null;
  const predictiveUncertaintyPassed = hasObservedUncertainty &&
    probabilityUncertainty.width <= maximumProbabilityIntervalWidth;
  const predictiveUncertaintyReasonCode = predictiveUncertaintyPassed
    ? null
    : !hasObservedUncertainty
      ? "PREDICTIVE_UNCERTAINTY_UNAVAILABLE"
      : "PREDICTIVE_UNCERTAINTY_EXCESSIVE";

  return createEvaluationRecord({
    origin: {
      channel: "best_targets_api",
      actorType: "system",
      sessionId: null,
      requestId: null
    },
    event: {
      sport: target.sport ?? "mlb",
      league: "MLB",
      eventId: target.gameId === null || target.gameId === undefined ? null : String(target.gameId),
      startTime: target.gameDate ?? null,
      homeTeam: matchup.length === 2 ? matchup[1] : null,
      awayTeam: matchup.length === 2 ? matchup[0] : null
    },
    market: {
      marketFamily: target.modelEvidence?.marketFamily ?? "player_prop",
      marketType: target.marketType ?? "prop",
      participantId: participantId(target),
      participantName: target.player?.name ?? null,
      selection: target.selection ?? null,
      side: target.lean ?? null,
      line: finiteOrNull(target.line)
    },
    price: {
      sportsbook: target.odds?.bookmaker?.key ?? null,
      marketOdds,
      oppositeOdds: finiteOrNull(target.odds?.oppositeOdds),
      priceCapturedAt: target.odds?.marketContext?.offeredLastUpdate ?? null,
      priceSourceTime: target.odds?.marketContext?.offeredLastUpdate ?? null
    },
    sources: buildSources(result, target, createdAt),
    model,
    probability: {
      rawModelProbability: finiteOrNull(target.modelProbability),
      adjustedProbability,
      marketImpliedProbability: impliedProbability(marketOdds),
      marketNoVigProbability: marketProbability
    },
    edge: {
      fairEdge: finiteOrNull(target.evaluation?.fairEdge),
      priceEdge: finiteOrNull(target.evaluation?.priceEdge),
      expectedValueRoi: finiteOrNull(target.evaluation?.expectedValueRoi),
      kellyFraction: finiteOrNull(target.evaluation?.kellyFraction)
    },
    stake: {
      recommendedStake: verdict === "BET" && permission === "VERIFIED_BETS_ALLOWED"
        ? finiteOrNull(target.evaluation?.recommendedStake)
        : 0,
      bankroll: finiteOrNull(target.ticketDraft?.bankroll),
      stakePolicyVersion: "best_target_policy_v1"
    },
    decision: {
      verdict,
      permission,
      reasons: Array.from(new Set(reasons)),
      riskFlags,
      gateResults: [
        {
          gate: "verified_price",
          passed: target.status === "priced" && target.odds !== null,
          reasonCode: target.status === "priced" && target.odds !== null ? null : "ODDS_PROVIDER_UNVERIFIED"
        },
        {
          gate: "model_calibration",
          passed: model.modelStatus === "validated",
          reasonCode: model.modelStatus === "validated" ? null : "MODEL_CALIBRATION_REQUIRED",
          evidence: target.modelEvidence ?? null
        },
        {
          gate: "minimum_acceptable_price",
          passed: target.evaluation?.priceDiscipline?.status === "active",
          reasonCode: target.evaluation?.priceDiscipline?.status === "active"
            ? null
            : target.evaluation?.priceDiscipline?.status === "expired"
              ? "PRICE_EXPIRED"
              : target.evaluation?.priceDiscipline?.status === "below_minimum"
                ? "PRICE_BELOW_MINIMUM"
                : "PRICE_LIMIT_UNAVAILABLE",
          evidence: target.evaluation?.priceDiscipline ?? null
        },
        {
          gate: "drawdown_risk",
          passed: target.evaluation?.drawdownRisk?.passed === true,
          reasonCode: target.evaluation?.drawdownRisk?.passed === true
            ? null
            : target.evaluation?.drawdownRisk?.riskFlags?.[0]?.code ?? "DRAWDOWN_CONTEXT_UNAVAILABLE",
          evidence: target.evaluation?.drawdownRisk ?? null
        },
        {
          gate: "portfolio_risk",
          passed: target.evaluation?.portfolioRisk?.passed === true,
          reasonCode: target.evaluation?.portfolioRisk?.passed === true
            ? null
            : target.evaluation?.portfolioRisk?.riskFlags?.[0]?.code ?? "PORTFOLIO_CONTEXT_UNAVAILABLE",
          evidence: target.evaluation?.portfolioRisk ?? null
        },
        {
          gate: "predictive_uncertainty",
          passed: predictiveUncertaintyPassed,
          reasonCode: predictiveUncertaintyReasonCode,
          evidence: probabilityUncertainty ?? null
        },
        {
          gate: "recommendation_lifecycle",
          passed: target.evaluation?.lifecycle?.actionable === true,
          reasonCode: target.evaluation?.lifecycle?.actionable === true
            ? null
            : target.evaluation?.lifecycle?.reasonCodes?.[0] ?? "RECOMMENDATION_LIFECYCLE_UNAVAILABLE",
          evidence: target.evaluation?.lifecycle ?? null
        },
        {
          gate: "operational_permission",
          passed: permission === "VERIFIED_BETS_ALLOWED",
          reasonCode: permission === "VERIFIED_BETS_ALLOWED" ? null : "PRICE_CHECK_ONLY"
        }
      ]
    },
    audit: {
      codeVersion: context.codeVersion ?? null,
      configurationDigest: contentDigest({
        modelId: model.modelId,
        modelVersion: model.modelVersion,
        modelEvidence: target.modelEvidence ?? null,
        sourceMode: result.sourceMode ?? null,
        stakePolicy: target.evaluation?.stakePolicy ?? null,
        priceDiscipline: target.evaluation?.priceDiscipline ?? null,
        drawdownRisk: target.evaluation?.drawdownRisk ?? null,
        portfolioPolicy: target.evaluation?.portfolioRisk?.policy ?? null,
        probabilityUncertainty: target.evaluation?.probabilityUncertainty ?? null,
        lifecycle: target.evaluation?.lifecycle ?? null
      }),
      calculationVersion: "displayed_target_v1",
      evidenceCompleteness: target.status === "priced"
        ? "official_context_plus_provider_price"
        : "official_context_price_missing",
      warnings: [...(result.warnings ?? [])]
    }
  }, {
    clientEventId,
    createdAt
  });
}

async function persistDisplayedTargets(result, context = {}) {
  if (!result || !Array.isArray(result.best)) {
    throw new TypeError("Displayed target result must include a best array.");
  }

  const appendRecordImpl = context.appendRecordImpl ?? appendAuthoritativeRecord;
  const calibrationCandidates = Array.isArray(result.calibrationCandidates)
    ? result.calibrationCandidates
    : result.best;
  const candidateRecords = [...calibrationCandidates, ...result.best]
    .map((target) => createDisplayedTargetRecord(result, target, context));
  const records = [...new Map(candidateRecords.map((record) => [record.id, record])).values()];
  const recordById = new Map(records.map((record) => [record.id, record]));
  const displayedRecords = result.best.map((target) => {
    const record = createDisplayedTargetRecord(result, target, context);
    return recordById.get(record.id) ?? record;
  });
  const persisted = [];

  for (const record of records) {
    persisted.push(await appendRecordImpl(record, {
      ledgerPath: context.ledgerPath ?? context.logPath,
      fsImpl: context.fsImpl
    }));
  }

  const ledgerPath = persisted[0]?.ledgerPath ?? resolveAuthoritativeLedgerPath(
    context.ledgerPath ?? context.logPath
  );
  const persistenceById = new Map(persisted.map((entry) => [entry.id, entry]));

  const { calibrationCandidates: _calibrationCandidates, ...publicResult } = result;

  return {
    ...publicResult,
    best: result.best.map((target, index) => {
      const auditRecord = displayedRecords[index];
      const persistence = persistenceById.get(auditRecord.id) ?? null;
      const sourceWithTime = auditRecord.sources.find((source) => source.sourceTime) ?? auditRecord.sources[0];

      return {
        ...target,
        auditRecord,
        recordId: auditRecord.id,
        contentDigest: auditRecord.contentDigest,
        modelStatus: auditRecord.model.modelStatus,
        calibrationReportId: auditRecord.model.calibrationReportId,
        permission: auditRecord.permission,
        gateResults: auditRecord.gateResults,
        sourceCapturedAt: sourceWithTime?.capturedAt ?? null,
        sourceTime: sourceWithTime?.sourceTime ?? null,
        syncState: persistence?.syncState ?? "local_only",
        syncError: persistence?.syncError ?? null,
        persistedAt: persistence?.persistedAt ?? null
      };
    }),
    persistence: {
      requestId: context.requestId ?? null,
      ledgerPath,
      persistedCount: records.length,
      displayedCount: result.best.length,
      calibrationPoolCount: calibrationCandidates.length,
      appendedCount: persisted.filter((entry) => entry.appended).length,
      idempotentCount: persisted.filter((entry) => !entry.appended).length,
      recordIds: records.map((record) => record.id),
      contentDigests: records.map((record) => record.contentDigest),
      persistedAt: persisted.at(-1)?.persistedAt ?? null
    }
  };
}

module.exports = {
  createDisplayedTargetRecord,
  deterministicUuid,
  persistDisplayedTargets
};
