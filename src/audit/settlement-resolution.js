const { getSettlementEconomicsIssue } = require("./settlement-economics.js");

const SETTLEMENT_OUTCOMES = new Set(["pending", "win", "loss", "push", "void"]);
const FINAL_SETTLEMENT_OUTCOMES = new Set(["win", "loss", "push", "void"]);
const AMENDABLE_SETTLEMENT_FIELDS = new Set([
  "outcome",
  "settledAt",
  "closingOdds",
  "closingOppositeOdds",
  "closingLineEvidence",
  "stake",
  "profit",
  "notes"
]);

function isFiniteNumber(value) {
  return typeof value === "number" && Number.isFinite(value);
}

function isValidAmendmentPatch(patch) {
  if (!patch || typeof patch !== "object" || Array.isArray(patch) ||
      Object.keys(patch).some((field) => !AMENDABLE_SETTLEMENT_FIELDS.has(field))) {
    return false;
  }
  if (patch.outcome !== undefined && !SETTLEMENT_OUTCOMES.has(patch.outcome)) {
    return false;
  }
  if (patch.settledAt !== undefined &&
      (typeof patch.settledAt !== "string" || !Number.isFinite(Date.parse(patch.settledAt)))) {
    return false;
  }
  for (const field of ["closingOdds", "closingOppositeOdds", "stake", "profit"]) {
    if (patch[field] !== undefined && patch[field] !== null && !isFiniteNumber(patch[field])) {
      return false;
    }
  }
  if (patch.closingLineEvidence !== undefined && patch.closingLineEvidence !== null &&
      (typeof patch.closingLineEvidence !== "object" || Array.isArray(patch.closingLineEvidence))) {
    return false;
  }
  if (patch.notes !== undefined &&
      (!Array.isArray(patch.notes) || patch.notes.some((note) => typeof note !== "string"))) {
    return false;
  }

  return true;
}

function resolveSettlements(records = []) {
  const evaluationsWithSequence = new Map();

  records.forEach((record, sequence) => {
    if (record?.recordType === "evaluation" && typeof record.id === "string") {
      evaluationsWithSequence.set(record.id, { record, sequence });
    }
  });

  const settlements = new Map();
  const settlementOrder = [];
  let invalidSettlementReferenceCount = 0;
  let invalidAmendmentCount = 0;
  let amendmentCount = 0;

  records.forEach((record, sequence) => {
    if (record?.recordType === "settlement") {
      const evaluation = evaluationsWithSequence.get(record.evaluationId);
      const validIdentity = typeof record.id === "string" && record.id.length > 0 &&
        typeof record.evaluationId === "string" && record.evaluationId.length > 0;
      const economicsIssue = getSettlementEconomicsIssue(record);

      if (!validIdentity || !SETTLEMENT_OUTCOMES.has(record.outcome) ||
          !evaluation || evaluation.sequence >= sequence || economicsIssue) {
        invalidSettlementReferenceCount += 1;
        return;
      }

      settlements.set(record.id, { ...record, sequence, effectiveSequence: sequence });
      settlementOrder.push(record.id);
      return;
    }

    if (record?.recordType !== "amendment") {
      return;
    }

    const settlement = settlements.get(record.settlementId);

    if (!settlement || settlement.sequence >= sequence ||
        settlement.evaluationId !== record.evaluationId ||
        !isValidAmendmentPatch(record.patch)) {
      invalidAmendmentCount += 1;
      return;
    }

    const amendedSettlement = { ...settlement, ...record.patch };

    if (getSettlementEconomicsIssue(amendedSettlement)) {
      invalidAmendmentCount += 1;
      return;
    }

    Object.assign(settlement, record.patch, { effectiveSequence: sequence });
    amendmentCount += 1;
  });

  const latestByEvaluation = new Map();

  for (const settlementId of settlementOrder) {
    const settlement = settlements.get(settlementId);
    const existing = latestByEvaluation.get(settlement.evaluationId);

    if (!existing || settlement.effectiveSequence > existing.effectiveSequence) {
      latestByEvaluation.set(settlement.evaluationId, settlement);
    }
  }

  return {
    evaluations: new Map(
      Array.from(evaluationsWithSequence, ([id, entry]) => [id, entry.record])
    ),
    settlements: Array.from(latestByEvaluation.values()),
    latestByEvaluation,
    invalidSettlementReferenceCount,
    invalidAmendmentCount,
    invalidReferenceCount: invalidSettlementReferenceCount + invalidAmendmentCount,
    amendmentCount
  };
}

module.exports = {
  FINAL_SETTLEMENT_OUTCOMES,
  SETTLEMENT_OUTCOMES,
  isValidAmendmentPatch,
  resolveSettlements
};
