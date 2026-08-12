const {
  BEAR_EDGE_MODEL_KEY,
  MARKET_BASELINE_MODEL_KEY,
  SWEET_BEAR_MODEL_KEY
} = require("./records.js");

const DEFAULT_REQUIRED_MODEL_KEYS = Object.freeze([
  SWEET_BEAR_MODEL_KEY,
  BEAR_EDGE_MODEL_KEY
]);

const EXCLUSION_REASONS = Object.freeze({
  OUT_OF_SCOPE: "out_of_scope_market_family",
  UNSETTLED: "no_official_outcome",
  MISSING_MODEL: "missing_model_prediction",
  EVENT_ID_MISMATCH: "event_id_mismatch",
  EVENT_START_MISMATCH: "event_start_mismatch",
  EVIDENCE_CUTOFF_MISMATCH: "evidence_cutoff_mismatch",
  SELECTION_MISMATCH: "selection_mismatch",
  DUPLICATE_OUTCOME: "duplicate_outcome"
});

/**
 * @param {object[]} outcomes
 * @returns {{ index: Map<string, object>, duplicates: string[] }}
 */
function indexOutcomes(outcomes) {
  const index = new Map();
  const duplicates = [];

  outcomes.forEach((outcome) => {
    if (index.has(outcome.comparisonKey)) {
      duplicates.push(outcome.comparisonKey);
      return;
    }
    index.set(outcome.comparisonKey, outcome);
  });

  return { index, duplicates };
}

/**
 * @param {object[]} predictions
 * @returns {Map<string, Map<string, object>>}
 */
function groupPredictionsByComparisonKey(predictions) {
  const grouped = new Map();

  predictions.forEach((prediction) => {
    if (!grouped.has(prediction.comparisonKey)) {
      grouped.set(prediction.comparisonKey, new Map());
    }
    grouped.get(prediction.comparisonKey).set(prediction.modelKey, prediction);
  });

  return grouped;
}

/**
 * @param {object[]} entries
 * @param {string} field
 * @returns {boolean}
 */
function allAgreeOn(entries, field) {
  if (entries.length === 0) {
    return true;
  }

  const first = entries[0][field];
  return entries.every((entry) => entry[field] === first);
}

/**
 * Pairs predictions across models on the exact same question and joins them to
 * an official settled outcome.
 *
 * Every comparison key that fails to become a pair is retained with a reason.
 * That exclusion ledger is the missingness record: if one model is
 * systematically absent on, say, day games or a particular starter, the
 * surviving sample is not a random sample of games and the headline Brier
 * comparison is biased. Nothing else in the pipeline can detect that.
 *
 * @param {{
 *   predictions: object[],
 *   outcomes: object[],
 *   marketFamilies?: string[] | null,
 *   requiredModelKeys?: string[]
 * }} input
 * @returns {{
 *   pairs: Array<{
 *     comparisonKey: string,
 *     eventId: string,
 *     marketFamily: string,
 *     selectionKey: string,
 *     result: number,
 *     predictionsByModel: Record<string, object>
 *   }>,
 *   exclusions: Array<{ comparisonKey: string, reason: string, detail: string }>,
 *   exclusionCounts: Record<string, number>
 * }}
 */
function pairPredictions(input) {
  if (!input || typeof input !== "object" || Array.isArray(input)) {
    throw new TypeError("Pairing input must be an object");
  }

  const predictions = Array.isArray(input.predictions) ? input.predictions : [];
  const outcomes = Array.isArray(input.outcomes) ? input.outcomes : [];
  const requiredModelKeys = input.requiredModelKeys ?? DEFAULT_REQUIRED_MODEL_KEYS;
  const marketFamilies = input.marketFamilies ?? null;

  const { index: outcomeIndex, duplicates } = indexOutcomes(outcomes);
  const grouped = groupPredictionsByComparisonKey(predictions);
  const pairs = [];
  const exclusions = [];

  duplicates.forEach((comparisonKey) => {
    exclusions.push({
      comparisonKey,
      reason: EXCLUSION_REASONS.DUPLICATE_OUTCOME,
      detail: "more than one official outcome was appended for this comparison"
    });
  });

  Array.from(grouped.keys()).sort().forEach((comparisonKey) => {
    const byModel = grouped.get(comparisonKey);
    const present = Array.from(byModel.values());
    const scoped = present[0];

    if (marketFamilies && !marketFamilies.includes(scoped.marketFamily)) {
      exclusions.push({
        comparisonKey,
        reason: EXCLUSION_REASONS.OUT_OF_SCOPE,
        detail: `marketFamily ${scoped.marketFamily} is not in the configured scope`
      });
      return;
    }

    const missing = requiredModelKeys.filter((modelKey) => !byModel.has(modelKey));

    if (missing.length > 0) {
      exclusions.push({
        comparisonKey,
        reason: EXCLUSION_REASONS.MISSING_MODEL,
        detail: `no prediction from ${missing.join(", ")}`
      });
      return;
    }

    const required = requiredModelKeys.map((modelKey) => byModel.get(modelKey));

    if (!allAgreeOn(required, "eventId")) {
      exclusions.push({
        comparisonKey,
        reason: EXCLUSION_REASONS.EVENT_ID_MISMATCH,
        detail: "models disagree on eventId for the same comparison key"
      });
      return;
    }
    if (!allAgreeOn(required, "eventStartAtMs")) {
      exclusions.push({
        comparisonKey,
        reason: EXCLUSION_REASONS.EVENT_START_MISMATCH,
        detail: "models disagree on eventStartAt for the same comparison key"
      });
      return;
    }
    if (!allAgreeOn(required, "evidenceCutoffAtMs")) {
      exclusions.push({
        comparisonKey,
        reason: EXCLUSION_REASONS.EVIDENCE_CUTOFF_MISMATCH,
        detail: "models were not given the same evidence cutoff"
      });
      return;
    }
    if (
      !allAgreeOn(required, "marketFamily")
      || !allAgreeOn(required, "selectionKey")
    ) {
      exclusions.push({
        comparisonKey,
        reason: EXCLUSION_REASONS.SELECTION_MISMATCH,
        detail: "models disagree on marketFamily or selectionKey"
      });
      return;
    }

    const outcome = outcomeIndex.get(comparisonKey);

    if (!outcome) {
      exclusions.push({
        comparisonKey,
        reason: EXCLUSION_REASONS.UNSETTLED,
        detail: "no official MLB outcome has been appended"
      });
      return;
    }
    if (outcome.eventId !== required[0].eventId) {
      exclusions.push({
        comparisonKey,
        reason: EXCLUSION_REASONS.EVENT_ID_MISMATCH,
        detail: "outcome eventId does not match the prediction eventId"
      });
      return;
    }

    const predictionsByModel = {};

    byModel.forEach((prediction, modelKey) => {
      predictionsByModel[modelKey] = prediction;
    });

    pairs.push({
      comparisonKey,
      eventId: outcome.eventId,
      marketFamily: required[0].marketFamily,
      selectionKey: required[0].selectionKey,
      result: outcome.result,
      predictionsByModel
    });
  });

  const exclusionCounts = exclusions.reduce((counts, exclusion) => {
    counts[exclusion.reason] = (counts[exclusion.reason] ?? 0) + 1;
    return counts;
  }, {});

  return { pairs, exclusions, exclusionCounts };
}

/**
 * Missingness by model: how often each model failed to produce a prediction on
 * a comparison another model answered. A large asymmetry here invalidates the
 * comparison even when the paired sample looks healthy.
 *
 * @param {object[]} predictions
 * @param {string[]} [modelKeys]
 * @returns {Record<string, { produced: number, absentWhenOthersProduced: number }>}
 */
function summarizeModelMissingness(
  predictions,
  modelKeys = [...DEFAULT_REQUIRED_MODEL_KEYS]
) {
  const grouped = groupPredictionsByComparisonKey(predictions);
  /** @type {Record<string, { produced: number, absentWhenOthersProduced: number }>} */
  const summary = {};

  modelKeys.forEach((modelKey) => {
    summary[modelKey] = { produced: 0, absentWhenOthersProduced: 0 };
  });

  grouped.forEach((byModel) => {
    modelKeys.forEach((modelKey) => {
      if (byModel.has(modelKey)) {
        summary[modelKey].produced += 1;
        return;
      }

      const othersProduced = modelKeys.some(
        (otherKey) => otherKey !== modelKey && byModel.has(otherKey)
      );

      if (othersProduced) {
        summary[modelKey].absentWhenOthersProduced += 1;
      }
    });
  });

  return summary;
}

module.exports = {
  DEFAULT_REQUIRED_MODEL_KEYS,
  EXCLUSION_REASONS,
  MARKET_BASELINE_MODEL_KEY,
  groupPredictionsByComparisonKey,
  pairPredictions,
  summarizeModelMissingness
};
