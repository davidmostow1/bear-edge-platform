const { canonicalStringify, contentDigest } = require("../audit/canonical-json.js");
const {
  isSupportedAuditRecordSchemaVersion,
  validateAuditRecord
} = require("../audit/record-contract.js");
const { resolveEvidenceRecords } = require("../audit/evidence-resolution.js");
const { resolveSettlements } = require("../audit/settlement-resolution.js");
const { validatePredictionRow } = require("./dataset.js");
const {
  bootstrapClusterMeanInterval,
  brierScore,
  logLoss
} = require("./metrics.js");

const PROJECTION_SCHEMA_VERSION = "1.0.0";
const DIGEST_PATTERN = /^[a-f0-9]{64}$/;
const OUTCOME_ONLY_BOOTSTRAP_SAMPLES = 2_000;
const OUTCOME_ONLY_BOOTSTRAP_CONFIDENCE = 0.95;
const OUTCOME_ONLY_BOOTSTRAP_SEED = 0x6d2b79f5;
const DIAGNOSTIC_BENCHMARK = Object.freeze({
  benchmarkId: "fixed_binary_probability_0_5",
  probability: 0.5,
  brierScore: 0.25,
  logLoss: Math.log(2),
  role: "diagnostic_only_not_promotion_baseline"
});

function isPlainObject(value) {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function isFiniteNumber(value) {
  return typeof value === "number" && Number.isFinite(value);
}

function isValidPrice(value) {
  return isFiniteNumber(value) && value !== 0;
}

function isValidTimestamp(value) {
  return typeof value === "string" && Number.isFinite(Date.parse(value));
}

function isIdentity(value) {
  return typeof value === "string" && value.trim().length > 0;
}

function compareStrings(left, right) {
  return left < right ? -1 : left > right ? 1 : 0;
}

function exclusion(evaluationId, codes) {
  return {
    evaluationId,
    codes: [...new Set(codes)].sort(compareStrings)
  };
}

function evaluationIssues(record) {
  const probabilityCodes = [];
  const priceCodes = [];
  const predictionAt = Date.parse(record.createdAt ?? "");
  const eventStartAt = Date.parse(record.event?.startTime ?? "");
  const side = typeof record.market?.side === "string"
    ? record.market.side.toLowerCase()
    : null;

  if (!isIdentity(record.event?.eventId)) probabilityCodes.push("MISSING_EVENT_ID");
  if (!isValidTimestamp(record.event?.startTime)) probabilityCodes.push("MISSING_EVENT_START");
  if (!isIdentity(record.market?.marketFamily)) probabilityCodes.push("MISSING_MARKET_FAMILY");
  if (!isIdentity(record.market?.participantId)) probabilityCodes.push("MISSING_PARTICIPANT_ID");
  if (side !== "over" && side !== "under") probabilityCodes.push("INVALID_MARKET_SIDE");
  if (!isFiniteNumber(record.market?.line)) probabilityCodes.push("MISSING_MARKET_LINE");
  if (!isValidPrice(record.price?.marketOdds)) priceCodes.push("MISSING_MARKET_PRICE");
  if (!isValidPrice(record.price?.oppositeOdds)) priceCodes.push("MISSING_OPPOSITE_PRICE");
  if (!isFiniteNumber(record.probability?.rawModelProbability) ||
      record.probability.rawModelProbability < 0 ||
      record.probability.rawModelProbability > 1) {
    probabilityCodes.push("MISSING_MODEL_PROBABILITY");
  }
  if (!isIdentity(record.model?.modelId)) probabilityCodes.push("MISSING_MODEL_ID");
  if (!isIdentity(record.model?.modelVersion)) probabilityCodes.push("MISSING_MODEL_VERSION");
  if (!Number.isFinite(predictionAt)) probabilityCodes.push("MISSING_PREDICTION_TIME");
  if (Number.isFinite(predictionAt) && Number.isFinite(eventStartAt) && predictionAt >= eventStartAt) {
    probabilityCodes.push("PREDICTION_NOT_BEFORE_EVENT");
  }
  if (!Array.isArray(record.sources) || record.sources.length === 0) {
    probabilityCodes.push("MISSING_SOURCE_EVIDENCE");
  }

  return {
    codes: [...probabilityCodes, ...priceCodes],
    probabilityCodes,
    priceCodes,
    predictionAt,
    eventStartAt,
    side
  };
}

function projectSources(record, predictionAt) {
  const byDigest = new Map();
  const codes = [];

  for (const source of record.sources ?? []) {
    if (!isPlainObject(source) || !DIGEST_PATTERN.test(source.digest ?? "")) {
      codes.push("INVALID_SOURCE_DIGEST");
      continue;
    }
    const capturedAt = isValidTimestamp(source.capturedAt) ? source.capturedAt : null;
    const featureAt = isValidTimestamp(source.sourceTime) ? source.sourceTime : capturedAt;

    if (!capturedAt || !featureAt) {
      codes.push("INVALID_SOURCE_TIMESTAMP");
      continue;
    }
    if (Date.parse(capturedAt) > predictionAt || Date.parse(featureAt) > predictionAt) {
      codes.push("SOURCE_AFTER_PREDICTION");
      continue;
    }

    if (!byDigest.has(source.digest)) {
      byDigest.set(source.digest, {
        featureAt,
        evidence: {
          sourceIdentifier: `${source.provider ?? "unknown"}:${source.sourceType ?? "unknown"}:${source.digest}:${capturedAt}`,
          capturedAt,
          contentDigest: source.digest
        }
      });
    }
  }

  if (byDigest.size === 0) {
    codes.push("MISSING_SOURCE_EVIDENCE");
  }

  const projected = [...byDigest.values()].sort((left, right) => (
    compareStrings(left.evidence.sourceIdentifier, right.evidence.sourceIdentifier)
  ));
  const featureTimes = projected.map((entry) => entry.featureAt).sort(compareStrings);

  return {
    codes,
    featureCutoffAt: featureTimes.at(-1) ?? null,
    sourceDigests: projected.map((entry) => entry.evidence.contentDigest).sort(compareStrings),
    sourceEvidence: projected.map((entry) => entry.evidence)
  };
}

function validClosingLineEvidence(settlement, evaluation) {
  const evidence = settlement?.closingLineEvidence;
  const capturedAt = Date.parse(evidence?.capturedAt ?? "");
  const marketClosedAt = Date.parse(evidence?.marketClosedAt ?? "");
  const settledAt = Date.parse(settlement?.settledAt ?? "");
  const eventStartAt = Date.parse(evaluation.event.startTime);

  return (
    isValidPrice(settlement?.closingOdds)
    && isValidPrice(settlement?.closingOppositeOdds)
    && isPlainObject(evidence)
    && isIdentity(evidence.sportsbook)
    && evidence.sportsbook === evaluation.price.sportsbook
    && Number.isFinite(capturedAt)
    && Number.isFinite(marketClosedAt)
    && capturedAt >= marketClosedAt
    && evidence.isFinal === true
    && isIdentity(evidence.sourceLocator)
    && DIGEST_PATTERN.test(evidence.sourceDigest ?? "")
    && Number.isFinite(settledAt)
    && Number.isFinite(eventStartAt)
    && settledAt >= eventStartAt
  );
}

function closingProjection(settlement, evaluation) {
  if (!settlement || settlement.outcome === "pending") {
    return { settledAt: null, outcome: null, closingPrice: null, blocker: null };
  }
  if (settlement.outcome === "push" || settlement.outcome === "void") {
    return {
      excludeCode: `NON_BINARY_SETTLEMENT_${settlement.outcome.toUpperCase()}`
    };
  }
  if ((settlement.outcome !== "win" && settlement.outcome !== "loss") ||
      !validClosingLineEvidence(settlement, evaluation)) {
    return {
      settledAt: null,
      outcome: null,
      closingPrice: null,
      blocker: "MISSING_FINAL_CLOSING_LINE_EVIDENCE"
    };
  }

  return {
    settledAt: settlement.settledAt,
    outcome: settlement.outcome === "win" ? 1 : 0,
    closingPrice: {
      price: settlement.closingOdds,
      oppositePrice: settlement.closingOppositeOdds,
      capturedAt: settlement.closingLineEvidence.capturedAt,
      marketClosedAt: settlement.closingLineEvidence.marketClosedAt,
      isFinal: true
    },
    blocker: null
  };
}

function expectedOutcome(evaluation, observedValue) {
  const side = typeof evaluation.market?.side === "string"
    ? evaluation.market.side.toLowerCase()
    : null;
  const line = evaluation.market?.line;

  if ((side !== "over" && side !== "under") || !isFiniteNumber(line) || !isFiniteNumber(observedValue)) {
    return null;
  }
  if (observedValue === line) {
    return "push";
  }

  const overWon = observedValue > line;
  return side === "over"
    ? (overWon ? "win" : "loss")
    : (overWon ? "loss" : "win");
}

function validShadowOutcome(outcome, evaluation) {
  const validation = outcome ? validateAuditRecord(outcome) : { valid: false };
  const resolvedAt = Date.parse(outcome?.resolvedAt ?? "");
  const eventStartAt = Date.parse(evaluation.event?.startTime ?? "");
  const derived = expectedOutcome(evaluation, outcome?.marketResult?.observedValue);

  return (
    validation.valid
    && outcome.recordType === "prediction_outcome"
    && outcome.evaluationId === evaluation.id
    && Number.isFinite(resolvedAt)
    && Number.isFinite(eventStartAt)
    && resolvedAt >= eventStartAt
    && (outcome.outcome === "void" || derived === null || derived === outcome.outcome)
  );
}

function validShadowClosingPrice(closingPrice, evaluation) {
  const validation = closingPrice ? validateAuditRecord(closingPrice) : { valid: false };
  const marketClosedAt = Date.parse(closingPrice?.price?.marketClosedAt ?? "");
  const eventStartAt = Date.parse(evaluation.event?.startTime ?? "");

  return (
    validation.valid
    && closingPrice.recordType === "closing_price"
    && closingPrice.evaluationId === evaluation.id
    && closingPrice.source.verificationStatus === "verified_provider_capture"
    && closingPrice.price.sportsbook === evaluation.price.sportsbook
    && Number.isFinite(marketClosedAt)
    && Number.isFinite(eventStartAt)
    && marketClosedAt <= eventStartAt
  );
}

function shadowProjection(outcome, closingPrice, evaluation) {
  if (!outcome && !closingPrice) {
    return null;
  }
  if (!outcome) {
    return {
      settledAt: null,
      outcome: null,
      closingPrice: null,
      blocker: "MISSING_PREDICTION_OUTCOME"
    };
  }
  if (!closingPrice) {
    return {
      settledAt: null,
      outcome: null,
      closingPrice: null,
      blocker: "MISSING_FINAL_CLOSING_PRICE"
    };
  }
  if (!validShadowOutcome(outcome, evaluation) || !validShadowClosingPrice(closingPrice, evaluation)) {
    return {
      settledAt: null,
      outcome: null,
      closingPrice: null,
      blocker: "INVALID_SHADOW_EVIDENCE"
    };
  }
  if (outcome.outcome === "push" || outcome.outcome === "void") {
    return {
      excludeCode: `NON_BINARY_PREDICTION_OUTCOME_${outcome.outcome.toUpperCase()}`
    };
  }

  return {
    settledAt: outcome.resolvedAt,
    outcome: outcome.outcome === "win" ? 1 : 0,
    closingPrice: {
      price: closingPrice.price.marketOdds,
      oppositePrice: closingPrice.price.oppositeOdds,
      capturedAt: closingPrice.source.capturedAt,
      marketClosedAt: closingPrice.price.marketClosedAt,
      isFinal: true
    },
    blocker: null
  };
}

function buildRow(evaluation, sources, closing, side) {
  return {
    predictionId: evaluation.id,
    eventId: evaluation.event.eventId,
    marketFamily: evaluation.market.marketFamily,
    participantId: evaluation.market.participantId,
    side,
    line: evaluation.market.line,
    price: evaluation.price.marketOdds,
    oppositePrice: evaluation.price.oppositeOdds,
    predictedProbability: evaluation.probability.rawModelProbability,
    predictionAt: evaluation.createdAt,
    featureCutoffAt: sources.featureCutoffAt,
    eventStartAt: evaluation.event.startTime,
    settledAt: closing.settledAt,
    outcome: closing.outcome,
    closingPrice: closing.closingPrice,
    modelId: evaluation.model.modelId,
    modelVersion: evaluation.model.modelVersion,
    sourceDigests: sources.sourceDigests,
    sourceEvidence: sources.sourceEvidence
  };
}

function outcomeOnlyProjection(outcome, evaluation) {
  if (!outcome) {
    return { resolvedAt: null, outcome: null, excludeCode: null, blocker: null };
  }

  if (!validShadowOutcome(outcome, evaluation)) {
    return { resolvedAt: null, outcome: null, excludeCode: null, blocker: "INVALID_SHADOW_OUTCOME" };
  }

  if (outcome.outcome === "push" || outcome.outcome === "void") {
    return {
      resolvedAt: null,
      outcome: null,
      excludeCode: `NON_BINARY_PREDICTION_OUTCOME_${outcome.outcome.toUpperCase()}`,
      blocker: null
    };
  }

  return {
    resolvedAt: outcome.resolvedAt,
    outcome: outcome.outcome === "win" ? 1 : 0,
    excludeCode: null,
    blocker: null
  };
}

function buildProbabilityRow(evaluation, sources, outcome, side) {
  return {
    predictionId: evaluation.id,
    eventId: evaluation.event.eventId,
    marketFamily: evaluation.market.marketFamily,
    participantId: evaluation.market.participantId,
    side,
    line: evaluation.market.line,
    predictedProbability: evaluation.probability.rawModelProbability,
    predictionAt: evaluation.createdAt,
    featureCutoffAt: sources.featureCutoffAt,
    eventStartAt: evaluation.event.startTime,
    resolvedAt: outcome.resolvedAt,
    outcome: outcome.outcome,
    modelId: evaluation.model.modelId,
    modelVersion: evaluation.model.modelVersion,
    sourceDigests: sources.sourceDigests,
    sourceEvidence: sources.sourceEvidence
  };
}

function probabilityObservationKey(row, includeModel) {
  const values = [
    row.eventId,
    row.marketFamily,
    row.participantId,
    row.side,
    row.line
  ];
  if (includeModel) {
    values.push(row.modelId, row.modelVersion);
  }
  return canonicalStringify(values);
}

function probabilityCohortKey(row) {
  return canonicalStringify([
    row.marketFamily,
    row.modelId,
    row.modelVersion
  ]);
}

function clusterValuesByEvent(rows, values) {
  const clustersByEvent = new Map();

  rows.forEach((row, index) => {
    const cluster = clustersByEvent.get(row.eventId) ?? [];
    cluster.push(values[index]);
    clustersByEvent.set(row.eventId, cluster);
  });

  return [...clustersByEvent.values()];
}

function intervalBounds(interval) {
  return {
    lower: interval.lower,
    upper: interval.upper
  };
}

function probabilityUncertainty(rows, losses) {
  const brierClusters = clusterValuesByEvent(
    rows,
    losses.map((loss) => loss.brierScore)
  );
  const eventClusterCount = brierClusters.length;
  const base = {
    method: "event_cluster_percentile_bootstrap",
    eventClusterCount,
    resamples: OUTCOME_ONLY_BOOTSTRAP_SAMPLES,
    confidenceLevel: OUTCOME_ONLY_BOOTSTRAP_CONFIDENCE,
    seed: OUTCOME_ONLY_BOOTSTRAP_SEED
  };

  if (eventClusterCount < 2) {
    return {
      status: "insufficient_event_clusters",
      ...base,
      intervals: {
        brierScore: null,
        logLoss: null,
        brierScoreDelta: null,
        logLossDelta: null
      }
    };
  }

  const options = {
    samples: OUTCOME_ONLY_BOOTSTRAP_SAMPLES,
    confidence: OUTCOME_ONLY_BOOTSTRAP_CONFIDENCE,
    seed: OUTCOME_ONLY_BOOTSTRAP_SEED
  };
  const logLossClusters = clusterValuesByEvent(
    rows,
    losses.map((loss) => loss.logLoss)
  );
  const brierDeltaClusters = clusterValuesByEvent(
    rows,
    losses.map((loss) => loss.brierScore - DIAGNOSTIC_BENCHMARK.brierScore)
  );
  const logLossDeltaClusters = clusterValuesByEvent(
    rows,
    losses.map((loss) => loss.logLoss - DIAGNOSTIC_BENCHMARK.logLoss)
  );

  return {
    status: "available",
    ...base,
    intervals: {
      brierScore: intervalBounds(
        bootstrapClusterMeanInterval(brierClusters, options)
      ),
      logLoss: intervalBounds(
        bootstrapClusterMeanInterval(logLossClusters, options)
      ),
      brierScoreDelta: intervalBounds(
        bootstrapClusterMeanInterval(brierDeltaClusters, options)
      ),
      logLossDelta: intervalBounds(
        bootstrapClusterMeanInterval(logLossDeltaClusters, options)
      )
    }
  };
}

function probabilityScores(rows) {
  const metricRows = rows.map((row) => ({
    probability: row.predictedProbability,
    outcome: row.outcome
  }));
  const losses = metricRows.map((row) => ({
    brierScore: (row.probability - row.outcome) ** 2,
    logLoss: logLoss([row])
  }));
  const modelBrierScore = brierScore(metricRows);
  const modelLogLoss = logLoss(metricRows);
  const uncertainty = probabilityUncertainty(rows, losses);
  const comparison = {
    brierScoreDelta: modelBrierScore - DIAGNOSTIC_BENCHMARK.brierScore,
    logLossDelta: modelLogLoss - DIAGNOSTIC_BENCHMARK.logLoss,
    brierSkillScore: 1 - (modelBrierScore / DIAGNOSTIC_BENCHMARK.brierScore),
    negativeDeltaFavorsModel: true,
    conclusivelyBetterAtConfidence: false
  };

  comparison.conclusivelyBetterAtConfidence = (
    uncertainty.status === "available"
    && uncertainty.intervals.brierScoreDelta.upper < 0
    && uncertainty.intervals.logLossDelta.upper < 0
  );

  return {
    brierScore: modelBrierScore,
    logLoss: modelLogLoss,
    diagnosticBenchmark: { ...DIAGNOSTIC_BENCHMARK },
    comparison,
    uncertainty
  };
}

function buildProbabilityMetrics(probabilityRows) {
  const settledRows = probabilityRows.filter((row) => row.outcome === 0 || row.outcome === 1);
  const selectedByObservation = new Map();
  const repeatedRows = [];

  for (const row of settledRows) {
    const key = probabilityObservationKey(row, true);
    if (selectedByObservation.has(key)) {
      repeatedRows.push(row);
    } else {
      selectedByObservation.set(key, row);
    }
  }

  const selectedRows = [...selectedByObservation.values()];
  const distinctMarketOutcomeCount = new Set(
    selectedRows.map((row) => probabilityObservationKey(row, false))
  ).size;
  const rawCohorts = new Map();
  const selectedCohorts = new Map();

  for (const row of settledRows) {
    const key = probabilityCohortKey(row);
    const rows = rawCohorts.get(key) ?? [];
    rows.push(row);
    rawCohorts.set(key, rows);
  }
  for (const row of selectedRows) {
    const key = probabilityCohortKey(row);
    const rows = selectedCohorts.get(key) ?? [];
    rows.push(row);
    selectedCohorts.set(key, rows);
  }

  const cohorts = [...selectedCohorts.entries()]
    .map(([key, rows]) => {
      const rawRows = rawCohorts.get(key) ?? [];
      return {
        marketFamily: rows[0].marketFamily,
        modelId: rows[0].modelId,
        modelVersion: rows[0].modelVersion,
        rawObservationCount: rawRows.length,
        observationCount: rows.length,
        repeatedObservationCount: rawRows.length - rows.length,
        metricPredictionIds: rows.map((row) => row.predictionId),
        ...probabilityScores(rows)
      };
    })
    .sort((left, right) => (
      compareStrings(left.marketFamily, right.marketFamily)
      || compareStrings(left.modelId, right.modelId)
      || compareStrings(left.modelVersion, right.modelVersion)
    ));

  if (selectedRows.length === 0) {
    return {
      status: "pending_outcomes",
      rawObservationCount: 0,
      observationCount: 0,
      distinctMarketOutcomeCount: 0,
      repeatedObservationCount: 0,
      cohortCount: 0,
      selectionPolicy: "earliest_prediction_per_event_market_participant_side_line_model",
      metricPredictionIds: [],
      repeatedPredictionIds: [],
      brierScore: null,
      logLoss: null,
      diagnosticBenchmark: { ...DIAGNOSTIC_BENCHMARK },
      comparison: {
        brierScoreDelta: null,
        logLossDelta: null,
        brierSkillScore: null,
        negativeDeltaFavorsModel: true,
        conclusivelyBetterAtConfidence: false
      },
      uncertainty: {
        status: "insufficient_event_clusters",
        method: "event_cluster_percentile_bootstrap",
        eventClusterCount: 0,
        resamples: OUTCOME_ONLY_BOOTSTRAP_SAMPLES,
        confidenceLevel: OUTCOME_ONLY_BOOTSTRAP_CONFIDENCE,
        seed: OUTCOME_ONLY_BOOTSTRAP_SEED,
        intervals: {
          brierScore: null,
          logLoss: null,
          brierScoreDelta: null,
          logLossDelta: null
        }
      },
      cohorts: [],
      promotionEligible: false
    };
  }

  return {
    status: "available",
    rawObservationCount: settledRows.length,
    observationCount: selectedRows.length,
    distinctMarketOutcomeCount,
    repeatedObservationCount: repeatedRows.length,
    cohortCount: cohorts.length,
    selectionPolicy: "earliest_prediction_per_event_market_participant_side_line_model",
    metricPredictionIds: selectedRows.map((row) => row.predictionId),
    repeatedPredictionIds: repeatedRows.map((row) => row.predictionId),
    ...probabilityScores(selectedRows),
    cohorts,
    promotionEligible: false
  };
}

function projectCalibrationLedger(records = []) {
  if (!Array.isArray(records)) {
    throw new TypeError("Authoritative ledger records must be an array.");
  }

  const canonicalRecords = records.filter((record) => (
    isSupportedAuditRecordSchemaVersion(record?.schemaVersion)
  ));
  const legacyRecordCount = records.length - canonicalRecords.length;
  const resolved = resolveSettlements(canonicalRecords);
  const evidence = resolveEvidenceRecords(canonicalRecords);
  const invalidEvidenceEvaluationIds = new Set(
    evidence.invalidReferences.map((entry) => entry.evaluationId).filter(Boolean)
  );
  const rows = [];
  const probabilityRows = [];
  const exclusions = [];
  const probabilityExclusions = [];
  const blockers = [];
  const probabilityBlockers = [];
  let evaluationCount = 0;

  if (resolved.invalidReferenceCount > 0) {
    blockers.push({
      code: "INVALID_SETTLEMENT_REFERENCE",
      evaluationId: null,
      count: resolved.invalidReferenceCount
    });
  }

  if (evidence.invalidReferenceCount > 0) {
    blockers.push({
      code: "INVALID_EVIDENCE_REFERENCE",
      evaluationId: null,
      settlementId: null,
      count: evidence.invalidReferenceCount
    });
  }

  for (const record of canonicalRecords) {
    if (record?.recordType !== "evaluation") {
      continue;
    }
    evaluationCount += 1;
    const validation = validateAuditRecord(record);
    const inspection = evaluationIssues(record);
    const sources = projectSources(record, inspection.predictionAt);
    const probabilityCodes = [
      ...(validation.valid ? [] : ["INVALID_AUDIT_RECORD"]),
      ...inspection.probabilityCodes,
      ...sources.codes
    ];
    const codes = [
      ...(validation.valid ? [] : ["INVALID_AUDIT_RECORD"]),
      ...inspection.codes,
      ...sources.codes
    ];
    const outcomeEvidence = evidence.latestOutcomesByEvaluation.get(record.id) ?? null;

    if (probabilityCodes.length > 0) {
      probabilityExclusions.push(exclusion(record.id ?? null, probabilityCodes));
    } else {
      const probabilityOutcome = invalidEvidenceEvaluationIds.has(record.id)
        ? { resolvedAt: null, outcome: null, excludeCode: null, blocker: null }
        : outcomeOnlyProjection(outcomeEvidence, record);

      if (probabilityOutcome.excludeCode) {
        probabilityExclusions.push(exclusion(record.id, [probabilityOutcome.excludeCode]));
      } else {
        if (probabilityOutcome.blocker) {
          probabilityBlockers.push({
            code: probabilityOutcome.blocker,
            evaluationId: record.id,
            settlementId: outcomeEvidence?.id ?? null,
            count: 1
          });
        }
        probabilityRows.push(buildProbabilityRow(record, sources, probabilityOutcome, inspection.side));
      }
    }

    if (codes.length > 0) {
      exclusions.push(exclusion(record.id ?? null, codes));
      continue;
    }

    const closingEvidence = evidence.latestClosingPricesByEvaluation.get(record.id) ?? null;
    const shadow = shadowProjection(outcomeEvidence, closingEvidence, record);
    const closing = invalidEvidenceEvaluationIds.has(record.id)
      ? { settledAt: null, outcome: null, closingPrice: null, blocker: null }
      : (shadow ?? { settledAt: null, outcome: null, closingPrice: null, blocker: null });
    if (closing.excludeCode) {
      exclusions.push(exclusion(record.id, [closing.excludeCode]));
      continue;
    }
    if (closing.blocker) {
      blockers.push({
        code: closing.blocker,
        evaluationId: record.id,
        settlementId: outcomeEvidence?.id ?? closingEvidence?.id ?? null,
        count: 1
      });
    }

    const row = buildRow(record, sources, closing, inspection.side);
    const rowIssues = validatePredictionRow(row);
    if (rowIssues.length > 0) {
      exclusions.push(exclusion(record.id, rowIssues.map((issue) => issue.code)));
      continue;
    }
    rows.push(row);
  }

  rows.sort((left, right) => (
    compareStrings(left.predictionAt, right.predictionAt)
    || compareStrings(left.predictionId, right.predictionId)
  ));
  probabilityRows.sort((left, right) => (
    compareStrings(left.predictionAt, right.predictionAt)
    || compareStrings(left.predictionId, right.predictionId)
  ));
  exclusions.sort((left, right) => compareStrings(left.evaluationId ?? "", right.evaluationId ?? ""));
  probabilityExclusions.sort((left, right) => compareStrings(left.evaluationId ?? "", right.evaluationId ?? ""));
  blockers.sort((left, right) => (
    compareStrings(left.code, right.code)
    || compareStrings(left.evaluationId ?? "", right.evaluationId ?? "")
  ));
  probabilityBlockers.sort((left, right) => (
    compareStrings(left.code, right.code)
    || compareStrings(left.evaluationId ?? "", right.evaluationId ?? "")
  ));
  const settledPredictionCount = rows.filter((row) => row.outcome === 0 || row.outcome === 1).length;
  const probabilitySettledPredictionCount = probabilityRows.filter(
    (row) => row.outcome === 0 || row.outcome === 1
  ).length;
  const probabilityMetrics = buildProbabilityMetrics(probabilityRows);
  const summary = {
    recordCount: records.length,
    canonicalRecordCount: canonicalRecords.length,
    legacyRecordCount,
    evaluationCount,
    eligiblePredictionCount: rows.length,
    settledPredictionCount,
    pendingPredictionCount: rows.length - settledPredictionCount,
    probabilityEligiblePredictionCount: probabilityRows.length,
    probabilitySettledPredictionCount,
    probabilityPendingPredictionCount: probabilityRows.length - probabilitySettledPredictionCount,
    probabilityExcludedEvaluationCount: probabilityExclusions.length,
    probabilityBlockerCount: probabilityBlockers.reduce((sum, blocker) => sum + blocker.count, 0),
    excludedEvaluationCount: exclusions.length,
    blockerCount: blockers.reduce((sum, blocker) => sum + blocker.count, 0),
    amendmentCount: resolved.amendmentCount,
    predictionOutcomeCount: evidence.predictionOutcomeCount,
    closingPriceCount: evidence.closingPriceCount,
    invalidSettlementReferenceCount: resolved.invalidReferenceCount,
    invalidEvidenceReferenceCount: evidence.invalidReferenceCount,
    invalidReferenceCount: resolved.invalidReferenceCount + evidence.invalidReferenceCount
  };

  return {
    schemaVersion: PROJECTION_SCHEMA_VERSION,
    summary,
    rows,
    probabilityRows,
    probabilityMetrics,
    exclusions,
    probabilityExclusions,
    blockers,
    probabilityBlockers,
    projectionDigest: contentDigest({
      summary,
      rows,
      probabilityRows,
      probabilityMetrics,
      exclusions,
      probabilityExclusions,
      blockers,
      probabilityBlockers
    })
  };
}

function buildCalibrationReadiness(projection) {
  if (!isPlainObject(projection) || !isPlainObject(projection.summary) || !Array.isArray(projection.rows)) {
    throw new TypeError("Calibration projection is required.");
  }

  const reasonCodes = new Set(projection.blockers.map((blocker) => blocker.code));
  const distinctPredictionTimes = new Set(projection.rows.map((row) => row.predictionAt)).size;
  if (projection.rows.length === 0) reasonCodes.add("NO_ELIGIBLE_PREDICTIONS");
  if (projection.summary.settledPredictionCount === 0) reasonCodes.add("NO_SETTLED_PREDICTIONS");
  if (distinctPredictionTimes < 3) reasonCodes.add("INSUFFICIENT_DISTINCT_PREDICTION_TIMES");
  if (projection.summary.invalidSettlementReferenceCount > 0) reasonCodes.add("INVALID_SETTLEMENT_REFERENCE");
  if (projection.summary.invalidEvidenceReferenceCount > 0) reasonCodes.add("INVALID_EVIDENCE_REFERENCE");

  const readyToBuildReport = (
    projection.rows.length > 0
    && projection.summary.settledPredictionCount >= 2
    && distinctPredictionTimes >= 3
    && projection.summary.blockerCount === 0
  );

  return {
    status: readyToBuildReport ? "ready_for_report" : "blocked",
    readyToBuildReport,
    readyForPromotion: false,
    distinctPredictionTimes,
    reasonCodes: [...reasonCodes].sort(compareStrings)
  };
}

function markdownCell(value) {
  return String(value ?? "").replaceAll("|", "\\|").replaceAll("\n", " ");
}

function fixedMetric(value) {
  return Number.isFinite(value) ? value.toFixed(6) : "pending";
}

function intervalMetric(interval) {
  if (!Number.isFinite(interval?.lower) || !Number.isFinite(interval?.upper)) {
    return "pending";
  }
  return `[${interval.lower.toFixed(6)}, ${interval.upper.toFixed(6)}]`;
}

function renderCalibrationReadinessMarkdown(report) {
  const probabilityMetrics = report.projection.probabilityMetrics;
  const confidencePercent = Number.isFinite(
    probabilityMetrics?.uncertainty?.confidenceLevel
  )
    ? probabilityMetrics.uncertainty.confidenceLevel * 100
    : 95;
  const lines = [
    "# Bear Edge Calibration Readiness",
    "",
    `Generated: ${report.generatedAt}`,
    `Status: ${report.readiness.status}`,
    "",
    "## Ledger Accounting",
    "",
    "| Measure | Count |",
    "| --- | ---: |",
    `| Ledger records | ${report.projection.summary.recordCount} |`,
    `| Canonical records | ${report.projection.summary.canonicalRecordCount} |`,
    `| Legacy records | ${report.projection.summary.legacyRecordCount} |`,
    `| Canonical evaluations | ${report.projection.summary.evaluationCount} |`,
    `| Eligible predictions | ${report.projection.summary.eligiblePredictionCount} |`,
    `| Settled predictions | ${report.projection.summary.settledPredictionCount} |`,
    `| Pending predictions | ${report.projection.summary.pendingPredictionCount} |`,
    `| Outcome-only shadow predictions | ${report.projection.summary.probabilityEligiblePredictionCount ?? 0} |`,
    `| Outcome-only shadow results | ${report.projection.summary.probabilitySettledPredictionCount ?? 0} |`,
    `| Outcome-only shadow pending | ${report.projection.summary.probabilityPendingPredictionCount ?? 0} |`,
    `| Prediction outcome records | ${report.projection.summary.predictionOutcomeCount} |`,
    `| Closing price records | ${report.projection.summary.closingPriceCount} |`,
    `| Excluded evaluations | ${report.projection.summary.excludedEvaluationCount} |`,
    `| Unresolved blockers | ${report.projection.summary.blockerCount} |`,
    "",
    "## Outcome-Only Shadow Metrics",
    "",
    "| Measure | Value |",
    "| --- | ---: |",
    `| Raw settled outcome snapshots | ${probabilityMetrics?.rawObservationCount ?? 0} |`,
    `| Unique model-outcome observations used | ${probabilityMetrics?.observationCount ?? 0} |`,
    `| Distinct market outcomes represented | ${probabilityMetrics?.distinctMarketOutcomeCount ?? 0} |`,
    `| Repeated snapshots excluded | ${probabilityMetrics?.repeatedObservationCount ?? 0} |`,
    `| Exact model cohorts | ${probabilityMetrics?.cohortCount ?? 0} |`,
    `| Outcome-only Brier score | ${fixedMetric(probabilityMetrics?.brierScore)} |`,
    `| Outcome-only log loss | ${fixedMetric(probabilityMetrics?.logLoss)} |`,
    `| Diagnostic 50/50 Brier benchmark | ${fixedMetric(
      probabilityMetrics?.diagnosticBenchmark?.brierScore
    )} |`,
    `| Diagnostic 50/50 log-loss benchmark | ${fixedMetric(
      probabilityMetrics?.diagnosticBenchmark?.logLoss
    )} |`,
    `| Brier delta vs 50/50 | ${fixedMetric(
      probabilityMetrics?.comparison?.brierScoreDelta
    )} |`,
    `| Log-loss delta vs 50/50 | ${fixedMetric(
      probabilityMetrics?.comparison?.logLossDelta
    )} |`,
    `| Brier skill vs 50/50 | ${fixedMetric(
      probabilityMetrics?.comparison?.brierSkillScore
    )} |`,
    `| Event clusters used for uncertainty | ${probabilityMetrics?.uncertainty?.eventClusterCount ?? 0} |`,
    `| Brier ${confidencePercent}% event-cluster interval | ${intervalMetric(
      probabilityMetrics?.uncertainty?.intervals?.brierScore
    )} |`,
    `| Log-loss ${confidencePercent}% event-cluster interval | ${intervalMetric(
      probabilityMetrics?.uncertainty?.intervals?.logLoss
    )} |`,
    `| Brier delta ${confidencePercent}% event-cluster interval | ${intervalMetric(
      probabilityMetrics?.uncertainty?.intervals?.brierScoreDelta
    )} |`,
    `| Log-loss delta ${confidencePercent}% event-cluster interval | ${intervalMetric(
      probabilityMetrics?.uncertainty?.intervals?.logLossDelta
    )} |`,
    `| Conclusive improvement at ${confidencePercent}% | ${
      probabilityMetrics?.comparison?.conclusivelyBetterAtConfidence ? "Yes" : "No"
    } |`,
    "",
    "Metric selection uses the earliest preregistered prediction for each event, market, participant, side, line, and exact model version. Later snapshots of the same model-outcome are retained in the ledger but excluded from metric sample size.",
    "",
    "Top-level scores pool the unique observations across cohorts for orientation only. Exact model cohorts must be evaluated separately.",
    "",
    "Negative benchmark deltas favor the model. The confidence intervals resample complete event clusters, preserving dependence among multiple observations from the same game.",
    "",
    "The fixed 50/50 forecast is a diagnostic reference only. It is not the required no-vig market promotion baseline and cannot authorize model promotion or a bet call.",
    "",
    "### Exact Model Cohorts",
    "",
    "| Market family | Model | Version | Raw | Used | Repeated | Brier | Log loss | Events | Brier delta | Log-loss delta | Conclusive |",
    "| --- | --- | --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | --- |",
    ...(probabilityMetrics?.cohorts?.length > 0
      ? probabilityMetrics.cohorts.map((cohort) => (
          `| ${markdownCell(cohort.marketFamily)} | ${markdownCell(cohort.modelId)} | ${markdownCell(cohort.modelVersion)} | ${cohort.rawObservationCount} | ${cohort.observationCount} | ${cohort.repeatedObservationCount} | ${fixedMetric(cohort.brierScore)} | ${fixedMetric(cohort.logLoss)} | ${cohort.uncertainty.eventClusterCount} | ${fixedMetric(cohort.comparison.brierScoreDelta)} | ${fixedMetric(cohort.comparison.logLossDelta)} | ${cohort.comparison.conclusivelyBetterAtConfidence ? "Yes" : "No"} |`
        ))
      : ["| None |  |  | 0 | 0 | 0 |  |  | 0 |  |  | No |"]),
    "",
    "Outcome-only metrics are diagnostic and never satisfy price/CLV promotion gates.",
    "",
    "## Readiness Reasons",
    ""
  ];

  if (report.readiness.reasonCodes.length === 0) {
    lines.push("- None.");
  } else {
    report.readiness.reasonCodes.forEach((code) => lines.push(`- \`${code}\``));
  }

  lines.push("", "## Blockers", "", "| Code | Evaluation | Settlement | Count |", "| --- | --- | --- | ---: |");
  if (report.projection.blockers.length === 0) {
    lines.push("| None |  |  | 0 |");
  } else {
    report.projection.blockers.forEach((blocker) => lines.push(
      `| ${markdownCell(blocker.code)} | ${markdownCell(blocker.evaluationId)} | ${markdownCell(blocker.settlementId)} | ${blocker.count} |`
    ));
  }

  lines.push("", "## Exclusions", "", "| Evaluation | Codes |", "| --- | --- |");
  if (report.projection.exclusions.length === 0) {
    lines.push("| None |  |");
  } else {
    report.projection.exclusions.forEach((entry) => lines.push(
      `| ${markdownCell(entry.evaluationId)} | ${markdownCell(entry.codes.join(", "))} |`
    ));
  }

  lines.push(
    "",
    "## Interpretation",
    "",
    report.readiness.readyToBuildReport
      ? "The projected rows satisfy the minimum structural requirements to build a calibration report. Promotion still requires every registered policy threshold to pass."
      : "The ledger does not yet satisfy the minimum structural requirements for a calibration report. No model may be promoted from this evidence.",
    ""
  );
  return lines.join("\n");
}

module.exports = {
  PROJECTION_SCHEMA_VERSION,
  buildCalibrationReadiness,
  renderCalibrationReadinessMarkdown,
  projectCalibrationLedger
};
