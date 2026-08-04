const {
  appendAuthoritativeRecord,
  readAuthoritativeLedger
} = require("./authoritative-ledger.js");
const {
  createClosingPriceRecord,
  createPredictionOutcomeRecord,
  validateAuditRecord
} = require("./record-contract.js");
const { resolveEvidenceRecords } = require("./evidence-resolution.js");

class EvidenceIntegrityError extends Error {
  constructor(message) {
    super(message);
    this.name = "EvidenceIntegrityError";
  }
}

function normalizedText(value) {
  return typeof value === "string" ? value.trim().toLowerCase() : "";
}

function rejectProhibitedInputFields(input, fields, label) {
  if (!input || typeof input !== "object" || Array.isArray(input)) {
    return;
  }

  for (const field of fields) {
    if (Object.prototype.hasOwnProperty.call(input, field)) {
      throw new EvidenceIntegrityError(`${label} input field ${field} is prohibited.`);
    }
  }
}

function createEvidenceRecord(factory, input, context, label) {
  try {
    return factory(input, context);
  } catch (error) {
    if (error instanceof TypeError) {
      throw new EvidenceIntegrityError(`Invalid ${label} input: ${error.message}`);
    }
    throw error;
  }
}

function requireEvaluation(inspection, evaluationId) {
  const evaluation = inspection.records.find((record) => (
    record?.recordType === "evaluation" && record.id === evaluationId
  ));

  if (!evaluation) {
    throw new EvidenceIntegrityError(`Referenced evaluation does not exist: ${evaluationId || "<missing>"}.`);
  }

  const validation = validateAuditRecord(evaluation);
  if (!validation.valid) {
    throw new EvidenceIntegrityError(`Referenced evaluation is not canonical: ${evaluationId}.`);
  }

  return evaluation;
}

function requireCleanInspection(inspection) {
  const issueCount = inspection.malformedLines.length
    + inspection.duplicateIds.length
    + inspection.digestConflicts.length
    + inspection.invalidRecords.length;

  if (issueCount > 0) {
    throw new EvidenceIntegrityError(
      `Evidence writes are blocked until ${issueCount} authoritative ledger integrity issue(s) are resolved.`
    );
  }
}

function requireChronology(record, evaluation, latest) {
  const createdAt = Date.parse(record.createdAt);
  const evaluationCreatedAt = Date.parse(evaluation.createdAt);
  const latestCreatedAt = Date.parse(latest?.createdAt ?? "");

  if (!Number.isFinite(createdAt) || !Number.isFinite(evaluationCreatedAt) || createdAt <= evaluationCreatedAt) {
    throw new EvidenceIntegrityError("Evidence must be created after the referenced evaluation.");
  }
  if (latest && (!Number.isFinite(latestCreatedAt) || createdAt <= latestCreatedAt)) {
    throw new EvidenceIntegrityError("A correction must be created after the evidence it supersedes.");
  }
}

function requireLatestLineage(record, latest) {
  const expected = latest?.id ?? null;

  if (record.supersedesId !== expected) {
    throw new EvidenceIntegrityError(
      expected
        ? `Correction must supersede the latest evidence record ${expected}.`
        : "Initial evidence must set supersedesId to null."
    );
  }
}

function expectedOutcome(evaluation, observedValue) {
  const side = normalizedText(evaluation.market?.side);
  const line = evaluation.market?.line;

  if ((side !== "over" && side !== "under") || !Number.isFinite(line) || !Number.isFinite(observedValue)) {
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

async function inspectionFor(options) {
  const inspection = await readAuthoritativeLedger({
    ledgerPath: options.logPath ?? options.ledgerPath,
    fsImpl: options.fsImpl
  });
  requireCleanInspection(inspection);
  return inspection;
}

async function persistEvidence(record, inspection, options) {
  const appendRecordImpl = options.appendRecordImpl ?? appendAuthoritativeRecord;
  const persistence = await appendRecordImpl(record, {
    ledgerPath: inspection.ledgerPath,
    outboxPath: options.outboxPath,
    fsImpl: options.fsImpl,
    outboxFsImpl: options.outboxFsImpl
  });

  return {
    record,
    logPath: persistence.ledgerPath,
    ledgerPath: persistence.ledgerPath,
    persistedAt: persistence.persistedAt,
    syncState: persistence.syncState,
    syncError: persistence.syncError
  };
}

async function appendPredictionOutcome(input, options = {}) {
  const inspection = await inspectionFor(options);
  rejectProhibitedInputFields(
    input,
    ["stake", "profit", "closingOdds", "closingOppositeOdds"],
    "Prediction outcome"
  );
  const evaluationId = typeof input?.evaluationId === "string" ? input.evaluationId.trim() : "";
  const evaluation = requireEvaluation(inspection, evaluationId);
  const resolved = resolveEvidenceRecords(inspection.records);

  if (resolved.invalidReferenceCount > 0) {
    throw new EvidenceIntegrityError("Existing shadow evidence contains an invalid correction history.");
  }

  const latest = resolved.latestOutcomesByEvaluation.get(evaluationId) ?? null;
  const record = createEvidenceRecord(
    createPredictionOutcomeRecord,
    { ...input, evaluationId },
    options.context,
    "prediction outcome"
  );
  requireLatestLineage(record, latest);
  requireChronology(record, evaluation, latest);

  const eventStartAt = Date.parse(evaluation.event?.startTime ?? "");
  const resolvedAt = Date.parse(record.resolvedAt);
  if (!Number.isFinite(eventStartAt) || !Number.isFinite(resolvedAt) || resolvedAt < eventStartAt) {
    throw new EvidenceIntegrityError("Prediction outcome cannot resolve before the event start.");
  }

  if (record.outcome !== "void") {
    const derived = expectedOutcome(evaluation, record.marketResult.observedValue);
    if (derived && derived !== record.outcome) {
      throw new EvidenceIntegrityError(
        `Outcome ${record.outcome} does not match the observed value for the evaluated side and line.`
      );
    }
  }

  return persistEvidence(record, inspection, options);
}

async function appendClosingPrice(input, options = {}) {
  const inspection = await inspectionFor(options);
  rejectProhibitedInputFields(input, ["stake", "profit", "outcome"], "Closing price");
  const evaluationId = typeof input?.evaluationId === "string" ? input.evaluationId.trim() : "";
  const evaluation = requireEvaluation(inspection, evaluationId);
  const resolved = resolveEvidenceRecords(inspection.records);

  if (resolved.invalidReferenceCount > 0) {
    throw new EvidenceIntegrityError("Existing shadow evidence contains an invalid correction history.");
  }

  const latest = resolved.latestClosingPricesByEvaluation.get(evaluationId) ?? null;
  const record = createEvidenceRecord(
    createClosingPriceRecord,
    { ...input, evaluationId },
    options.context,
    "closing price"
  );
  requireLatestLineage(record, latest);
  requireChronology(record, evaluation, latest);

  if (normalizedText(record.price.sportsbook) !== normalizedText(evaluation.price?.sportsbook)) {
    throw new EvidenceIntegrityError("Closing-price sportsbook does not match the evaluated sportsbook.");
  }

  const eventStartAt = Date.parse(evaluation.event?.startTime ?? "");
  const marketClosedAt = Date.parse(record.price.marketClosedAt);
  if (!Number.isFinite(eventStartAt) || !Number.isFinite(marketClosedAt) || marketClosedAt > eventStartAt) {
    throw new EvidenceIntegrityError("Closing-price market close cannot be after the event start.");
  }

  return persistEvidence(record, inspection, options);
}

module.exports = {
  EvidenceIntegrityError,
  appendClosingPrice,
  appendPredictionOutcome
};
