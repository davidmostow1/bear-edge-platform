const { contentDigest } = require("../audit/canonical-json.js");
const { validateAuditRecord } = require("../audit/record-contract.js");
const { resolveSettlements } = require("../audit/settlement-resolution.js");
const { validatePredictionRow } = require("./dataset.js");

const PROJECTION_SCHEMA_VERSION = "1.0.0";
const AUDIT_SCHEMA_VERSION = "2.0.0";
const DIGEST_PATTERN = /^[a-f0-9]{64}$/;

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
  const codes = [];
  const predictionAt = Date.parse(record.createdAt ?? "");
  const eventStartAt = Date.parse(record.event?.startTime ?? "");
  const side = typeof record.market?.side === "string"
    ? record.market.side.toLowerCase()
    : null;

  if (!isIdentity(record.event?.eventId)) codes.push("MISSING_EVENT_ID");
  if (!isValidTimestamp(record.event?.startTime)) codes.push("MISSING_EVENT_START");
  if (!isIdentity(record.market?.marketFamily)) codes.push("MISSING_MARKET_FAMILY");
  if (!isIdentity(record.market?.participantId)) codes.push("MISSING_PARTICIPANT_ID");
  if (side !== "over" && side !== "under") codes.push("INVALID_MARKET_SIDE");
  if (!isFiniteNumber(record.market?.line)) codes.push("MISSING_MARKET_LINE");
  if (!isValidPrice(record.price?.marketOdds)) codes.push("MISSING_MARKET_PRICE");
  if (!isValidPrice(record.price?.oppositeOdds)) codes.push("MISSING_OPPOSITE_PRICE");
  if (!isFiniteNumber(record.probability?.rawModelProbability) ||
      record.probability.rawModelProbability < 0 ||
      record.probability.rawModelProbability > 1) {
    codes.push("MISSING_MODEL_PROBABILITY");
  }
  if (!isIdentity(record.model?.modelId)) codes.push("MISSING_MODEL_ID");
  if (!isIdentity(record.model?.modelVersion)) codes.push("MISSING_MODEL_VERSION");
  if (!Number.isFinite(predictionAt)) codes.push("MISSING_PREDICTION_TIME");
  if (Number.isFinite(predictionAt) && Number.isFinite(eventStartAt) && predictionAt >= eventStartAt) {
    codes.push("PREDICTION_NOT_BEFORE_EVENT");
  }
  if (!Array.isArray(record.sources) || record.sources.length === 0) {
    codes.push("MISSING_SOURCE_EVIDENCE");
  }

  return { codes, predictionAt, eventStartAt, side };
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

function projectCalibrationLedger(records = []) {
  if (!Array.isArray(records)) {
    throw new TypeError("Authoritative ledger records must be an array.");
  }

  const canonicalRecords = records.filter((record) => record?.schemaVersion === AUDIT_SCHEMA_VERSION);
  const legacyRecordCount = records.length - canonicalRecords.length;
  const resolved = resolveSettlements(canonicalRecords);
  const rows = [];
  const exclusions = [];
  const blockers = [];
  let evaluationCount = 0;

  if (resolved.invalidReferenceCount > 0) {
    blockers.push({
      code: "INVALID_SETTLEMENT_REFERENCE",
      evaluationId: null,
      count: resolved.invalidReferenceCount
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
    const codes = [
      ...(validation.valid ? [] : ["INVALID_AUDIT_RECORD"]),
      ...inspection.codes,
      ...sources.codes
    ];

    if (codes.length > 0) {
      exclusions.push(exclusion(record.id ?? null, codes));
      continue;
    }

    const settlement = resolved.latestByEvaluation.get(record.id) ?? null;
    const closing = closingProjection(settlement, record);
    if (closing.excludeCode) {
      exclusions.push(exclusion(record.id, [closing.excludeCode]));
      continue;
    }
    if (closing.blocker) {
      blockers.push({
        code: closing.blocker,
        evaluationId: record.id,
        settlementId: settlement?.id ?? null,
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
  exclusions.sort((left, right) => compareStrings(left.evaluationId ?? "", right.evaluationId ?? ""));
  blockers.sort((left, right) => (
    compareStrings(left.code, right.code)
    || compareStrings(left.evaluationId ?? "", right.evaluationId ?? "")
  ));
  const settledPredictionCount = rows.filter((row) => row.outcome === 0 || row.outcome === 1).length;
  const summary = {
    recordCount: records.length,
    canonicalRecordCount: canonicalRecords.length,
    legacyRecordCount,
    evaluationCount,
    eligiblePredictionCount: rows.length,
    settledPredictionCount,
    pendingPredictionCount: rows.length - settledPredictionCount,
    excludedEvaluationCount: exclusions.length,
    blockerCount: blockers.reduce((sum, blocker) => sum + blocker.count, 0),
    amendmentCount: resolved.amendmentCount,
    invalidReferenceCount: resolved.invalidReferenceCount
  };

  return {
    schemaVersion: PROJECTION_SCHEMA_VERSION,
    summary,
    rows,
    exclusions,
    blockers,
    projectionDigest: contentDigest({ summary, rows, exclusions, blockers })
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
  if (projection.summary.invalidReferenceCount > 0) reasonCodes.add("INVALID_SETTLEMENT_REFERENCE");

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

function renderCalibrationReadinessMarkdown(report) {
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
    `| Excluded evaluations | ${report.projection.summary.excludedEvaluationCount} |`,
    `| Unresolved blockers | ${report.projection.summary.blockerCount} |`,
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
