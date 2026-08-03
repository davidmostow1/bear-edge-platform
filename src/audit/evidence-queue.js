const { readAuthoritativeLedger } = require("./authoritative-ledger.js");
const { resolveEvidenceRecords } = require("./evidence-resolution.js");
const { validateAuditRecord } = require("./record-contract.js");
const { loadModelRegistry } = require("../calibration/model-registry.js");

const QUEUE_STATUSES = new Set(["unresolved", "complete", "all"]);

function asArray(value) {
  return Array.isArray(value) ? value : [];
}

function clone(value) {
  return value === null || value === undefined ? value : structuredClone(value);
}

function requireOptions(options) {
  if (!options || typeof options !== "object" || Array.isArray(options)) {
    throw new TypeError("Evidence queue options must be an object.");
  }

  const status = options.status ?? "unresolved";
  if (!QUEUE_STATUSES.has(status)) {
    throw new TypeError("Evidence queue status must be unresolved, complete, or all.");
  }

  const limit = options.limit ?? 100;
  if (!Number.isSafeInteger(limit) || limit < 1 || limit > 500) {
    throw new TypeError("Evidence queue limit must be an integer from 1 through 500.");
  }

  const minimumSettledPredictions = options.minimumSettledPredictions ?? 500;
  if (!Number.isSafeInteger(minimumSettledPredictions) || minimumSettledPredictions < 1) {
    throw new TypeError("minimumSettledPredictions must be a positive integer.");
  }

  const targetEvaluationId = options.targetEvaluationId ?? null;
  if (targetEvaluationId !== null && (
    typeof targetEvaluationId !== "string"
    || targetEvaluationId.trim().length === 0
  )) {
    throw new TypeError("targetEvaluationId must be a non-empty string or null.");
  }

  const now = new Date(options.now ?? Date.now());
  if (!Number.isFinite(now.getTime())) {
    throw new TypeError("Evidence queue now must be a valid timestamp.");
  }

  return {
    status,
    limit,
    minimumSettledPredictions,
    targetEvaluationId,
    now
  };
}

function finding(code, count, message, details = []) {
  return {
    code,
    count,
    message,
    details: clone(details)
  };
}

function inspectionFindings(inspection = {}) {
  const definitions = [
    {
      code: "MALFORMED_LEDGER_LINES",
      values: asArray(inspection.malformedLines),
      message: "The authoritative ledger contains malformed lines."
    },
    {
      code: "DUPLICATE_LEDGER_IDS",
      values: asArray(inspection.duplicateIds),
      message: "The authoritative ledger contains duplicate record identifiers."
    },
    {
      code: "LEDGER_DIGEST_CONFLICTS",
      values: asArray(inspection.digestConflicts),
      message: "The authoritative ledger contains content-digest conflicts."
    },
    {
      code: "INVALID_CANONICAL_RECORDS",
      values: asArray(inspection.invalidRecords),
      message: "The authoritative ledger contains invalid canonical records."
    }
  ];

  return definitions
    .filter(({ values }) => values.length > 0)
    .map(({ code, values, message }) => finding(code, values.length, message, values));
}

function evidenceStatus({ eventStarted, latestOutcome, latestClosingPrice, writeBlocked }) {
  if (writeBlocked) {
    return "blocked";
  }
  if (!eventStarted) {
    return "awaiting_event";
  }
  if (!latestOutcome && !latestClosingPrice) {
    return "missing_outcome_and_close";
  }
  if (!latestOutcome) {
    return "missing_outcome";
  }
  if (!latestClosingPrice) {
    return "missing_close";
  }
  return "complete";
}

function missingEvidence(latestOutcome, latestClosingPrice) {
  const missing = [];
  if (!latestOutcome) {
    missing.push("MISSING_PREDICTION_OUTCOME");
  }
  if (!latestClosingPrice) {
    missing.push("MISSING_CLOSING_PRICE");
  }
  return missing;
}

function queueItem(evaluation, sequence, resolved, now, writeBlocked) {
  const latestOutcome = resolved.latestOutcomesByEvaluation.get(evaluation.id) ?? null;
  const latestClosingPrice = resolved.latestClosingPricesByEvaluation.get(evaluation.id) ?? null;
  const eventStart = Date.parse(evaluation.event?.startTime ?? "");
  const eventStarted = Number.isFinite(eventStart) && eventStart <= now.getTime();
  const status = evidenceStatus({
    eventStarted,
    latestOutcome,
    latestClosingPrice,
    writeBlocked
  });

  return {
    evaluationId: evaluation.id,
    createdAt: evaluation.createdAt,
    sequence,
    verdict: evaluation.decision?.verdict ?? evaluation.verdict ?? null,
    permission: evaluation.decision?.permission ?? evaluation.permission ?? null,
    event: clone(evaluation.event),
    market: clone(evaluation.market),
    price: clone(evaluation.price),
    model: clone(evaluation.model),
    latestOutcome: clone(latestOutcome),
    latestClosingPrice: clone(latestClosingPrice),
    outcomeSupersedesId: latestOutcome?.id ?? null,
    closingPriceSupersedesId: latestClosingPrice?.id ?? null,
    evidenceStatus: status,
    missingEvidence: missingEvidence(latestOutcome, latestClosingPrice),
    canRecordOutcome: !writeBlocked && eventStarted,
    canRecordClosingPrice: !writeBlocked
  };
}

function filterItems(items, status) {
  if (status === "all") {
    return items;
  }
  if (status === "complete") {
    return items.filter((item) => item.evidenceStatus === "complete");
  }
  return items.filter((item) => item.evidenceStatus !== "complete");
}

function buildEvidenceQueue(records = [], options = {}) {
  if (!Array.isArray(records)) {
    throw new TypeError("Evidence queue records must be an array.");
  }

  const normalized = requireOptions(options);
  const inspection = options.inspection ?? {};
  const findings = inspectionFindings(inspection);
  const resolved = resolveEvidenceRecords(records);

  if (resolved.invalidReferenceCount > 0) {
    findings.push(finding(
      "INVALID_EVIDENCE_HISTORY",
      resolved.invalidReferenceCount,
      "Shadow evidence contains invalid or non-linear correction references.",
      resolved.invalidReferences
    ));
  }

  const writeBlocked = findings.length > 0;
  const evaluations = records
    .map((record, sequence) => ({ record, sequence }))
    .filter(({ record }) => (
      record?.recordType === "evaluation"
      && typeof record.id === "string"
      && validateAuditRecord(record).valid
    ));
  const allItems = evaluations
    .map(({ record, sequence }) => queueItem(
      record,
      sequence,
      resolved,
      normalized.now,
      writeBlocked
    ))
    .sort((left, right) => {
      const timeDifference = Date.parse(right.createdAt ?? "") - Date.parse(left.createdAt ?? "");
      return Number.isFinite(timeDifference) && timeDifference !== 0
        ? timeDifference
        : right.sequence - left.sequence;
    });
  const completeObservations = allItems.filter((item) => item.evidenceStatus === "complete").length;
  const targetedItems = normalized.targetEvaluationId === null
    ? allItems
    : allItems.filter((item) => item.evaluationId === normalized.targetEvaluationId);
  const filteredItems = filterItems(targetedItems, normalized.status).slice(0, normalized.limit);

  return {
    generatedAt: normalized.now.toISOString(),
    ledgerPath: options.ledgerPath ?? inspection.ledgerPath ?? null,
    writeBlocked,
    summary: {
      totalEvaluations: allItems.length,
      completeObservations,
      missingOutcomes: allItems.filter((item) => !item.latestOutcome).length,
      missingClosingPrices: allItems.filter((item) => !item.latestClosingPrice).length,
      awaitingEvent: allItems.filter((item) => item.evidenceStatus === "awaiting_event").length,
      invalidCorrectionReferences: resolved.invalidReferenceCount,
      ledgerIntegrityStatus: writeBlocked ? "blocked" : "valid",
      minimumSettledPredictions: normalized.minimumSettledPredictions,
      remainingToMinimum: Math.max(0, normalized.minimumSettledPredictions - completeObservations),
      returnedItems: filteredItems.length,
      statusFilter: normalized.status
    },
    findings,
    items: filteredItems
  };
}

async function getEvidenceQueue(options = {}) {
  const inspection = await readAuthoritativeLedger({
    ledgerPath: options.logPath ?? options.ledgerPath,
    fsImpl: options.fsImpl
  });
  const registry = loadModelRegistry({
    registryPath: options.registryPath
  });

  return buildEvidenceQueue(inspection.records, {
    ...options,
    ledgerPath: inspection.ledgerPath,
    inspection,
    minimumSettledPredictions: registry.promotionPolicy.minimumSettledPredictions
  });
}

module.exports = {
  buildEvidenceQueue,
  getEvidenceQueue
};
