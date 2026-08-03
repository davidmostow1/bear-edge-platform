function resolveEvidenceRecords(records = []) {
  const evaluationSequence = new Map();
  const latestOutcomesByEvaluation = new Map();
  const latestClosingPricesByEvaluation = new Map();
  const evidenceById = new Map();
  const invalidReferences = [];

  records.forEach((record, sequence) => {
    if (record?.recordType === "evaluation" && typeof record.id === "string") {
      evaluationSequence.set(record.id, sequence);
    }
  });

  for (let sequence = 0; sequence < records.length; sequence += 1) {
    const record = records[sequence];
    const isOutcome = record?.recordType === "prediction_outcome";
    const isClosingPrice = record?.recordType === "closing_price";

    if (!isOutcome && !isClosingPrice) {
      continue;
    }

    const evaluationAt = evaluationSequence.get(record.evaluationId);
    const latestByEvaluation = isOutcome
      ? latestOutcomesByEvaluation
      : latestClosingPricesByEvaluation;
    const latest = latestByEvaluation.get(record.evaluationId) ?? null;
    const superseded = record.supersedesId === null
      ? null
      : evidenceById.get(record.supersedesId) ?? null;
    let code = null;

    if (!Number.isSafeInteger(evaluationAt) || evaluationAt >= sequence) {
      code = "INVALID_EVALUATION_REFERENCE";
    } else if (latest === null && record.supersedesId !== null) {
      code = "INVALID_INITIAL_SUPERSEDES_REFERENCE";
    } else if (latest !== null && record.supersedesId !== latest.id) {
      code = "NON_LINEAR_EVIDENCE_HISTORY";
    } else if (superseded && (
      superseded.record.recordType !== record.recordType
      || superseded.record.evaluationId !== record.evaluationId
      || superseded.sequence >= sequence
    )) {
      code = "INVALID_SUPERSEDED_RECORD";
    }

    if (code) {
      invalidReferences.push({
        code,
        recordId: record.id ?? null,
        recordType: record.recordType,
        evaluationId: record.evaluationId ?? null,
        supersedesId: record.supersedesId ?? null
      });
      continue;
    }

    evidenceById.set(record.id, { record, sequence });
    latestByEvaluation.set(record.evaluationId, record);
  }

  return {
    latestOutcomesByEvaluation,
    latestClosingPricesByEvaluation,
    invalidReferences,
    invalidReferenceCount: invalidReferences.length,
    predictionOutcomeCount: records.filter((record) => record?.recordType === "prediction_outcome").length,
    closingPriceCount: records.filter((record) => record?.recordType === "closing_price").length
  };
}

module.exports = {
  resolveEvidenceRecords
};
