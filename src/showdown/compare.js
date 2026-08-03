const {
  bootstrapClusterMeanInterval,
  brierScore,
  logLoss
} = require("../calibration/metrics.js");
const {
  BEAR_EDGE_MODEL_KEY,
  MARKET_BASELINE_MODEL_KEY,
  SWEET_BEAR_MODEL_KEY
} = require("./records.js");

const DEFAULT_MIN_PAIRED_PREDICTIONS = 500;
const DEFAULT_MIN_DISTINCT_EVENTS = 100;
const DEFAULT_BOOTSTRAP_SAMPLES = 2000;
const DEFAULT_BOOTSTRAP_SEED = 0x9e3779b9;
const DEFAULT_CONFIDENCE = 0.95;

const STATUS_INSUFFICIENT_SAMPLE = "INSUFFICIENT_SAMPLE";
const STATUS_WINNER_AUTHORIZED = "WINNER_AUTHORIZED";
const STATUS_NO_SEPARATION = "NO_SEPARATION";

/**
 * @param {number} probability
 * @param {number} outcome
 * @returns {number} 1 for a correct call, 0 for an incorrect call, 0.5 for an
 *   exact coin flip which asserts nothing and is scored as neither.
 */
function classificationCredit(probability, outcome) {
  if (probability === 0.5) {
    return 0.5;
  }

  return (probability > 0.5 ? 1 : 0) === outcome ? 1 : 0;
}

/**
 * @param {Array<{ probability: number, outcome: number }>} rows
 * @returns {{
 *   meanBrier: number,
 *   meanLogLoss: number,
 *   classificationAccuracy: number,
 *   count: number
 * } | null}
 */
function scoreRows(rows) {
  if (!Array.isArray(rows) || rows.length === 0) {
    return null;
  }

  const credit = rows.reduce(
    (sum, row) => sum + classificationCredit(row.probability, row.outcome),
    0
  );

  return {
    meanBrier: brierScore(rows),
    meanLogLoss: logLoss(rows),
    classificationAccuracy: credit / rows.length,
    count: rows.length
  };
}

/**
 * Groups per-pair differences into event clusters so the bootstrap resamples
 * whole games. Two strikeout props from the same start are not independent
 * observations; treating them as independent would shrink the interval and
 * manufacture significance that is not there.
 *
 * @param {Array<{ eventId: string, delta: number }>} deltas
 * @returns {number[][]}
 */
function clusterDeltasByEvent(deltas) {
  const clusters = new Map();

  deltas.forEach((entry) => {
    if (!clusters.has(entry.eventId)) {
      clusters.set(entry.eventId, []);
    }
    clusters.get(entry.eventId).push(entry.delta);
  });

  return Array.from(clusters.values());
}

/**
 * @param {Array<{ eventId: string, delta: number }>} deltas
 * @param {{ samples: number, seed: number, confidence: number }} options
 * @returns {{
 *   mean: number | null,
 *   lower: number | null,
 *   upper: number | null,
 *   clusterCount: number,
 *   excludesZero: boolean
 * }}
 */
function intervalForDeltas(deltas, options) {
  const clusters = clusterDeltasByEvent(deltas);

  if (deltas.length === 0) {
    return {
      mean: null,
      lower: null,
      upper: null,
      clusterCount: 0,
      excludesZero: false
    };
  }

  const observedMean = deltas.reduce((sum, entry) => sum + entry.delta, 0)
    / deltas.length;

  // The point estimate exists with a single event; the interval does not.
  // Reporting the mean without an interval is what lets the report name a
  // provisional leader while still refusing to authorize a winner.
  if (clusters.length < 2) {
    return {
      mean: observedMean,
      lower: null,
      upper: null,
      clusterCount: clusters.length,
      excludesZero: false
    };
  }

  const interval = bootstrapClusterMeanInterval(clusters, {
    samples: options.samples,
    seed: options.seed,
    confidence: options.confidence
  });

  return {
    mean: interval.mean,
    lower: interval.lower,
    upper: interval.upper,
    clusterCount: interval.clusterCount,
    excludesZero: (interval.lower > 0 && interval.upper > 0)
      || (interval.lower < 0 && interval.upper < 0)
  };
}

/**
 * @param {object[]} pairs
 * @param {string} modelKey
 * @returns {Array<{ probability: number, outcome: number }>}
 */
function rowsForModel(pairs, modelKey) {
  return pairs
    .filter((pair) => Boolean(pair.predictionsByModel[modelKey]))
    .map((pair) => ({
      probability: pair.predictionsByModel[modelKey].probability,
      outcome: pair.result
    }));
}

/**
 * Per-pair Brier difference between two models, retained with its event id so
 * the bootstrap can cluster correctly. Only pairs where both models answered
 * contribute.
 *
 * @param {object[]} pairs
 * @param {string} leftModelKey
 * @param {string} rightModelKey
 * @returns {Array<{ eventId: string, delta: number }>}
 */
function pairedBrierDeltas(pairs, leftModelKey, rightModelKey) {
  return pairs
    .filter((pair) => (
      Boolean(pair.predictionsByModel[leftModelKey])
      && Boolean(pair.predictionsByModel[rightModelKey])
    ))
    .map((pair) => {
      const left = pair.predictionsByModel[leftModelKey].probability;
      const right = pair.predictionsByModel[rightModelKey].probability;

      return {
        eventId: pair.eventId,
        delta: ((left - pair.result) ** 2) - ((right - pair.result) ** 2)
      };
    });
}

/**
 * Runs the full comparison and applies the winner gate.
 *
 * The gate is deliberately conservative: a provisional leader may be named at
 * any sample size, but no accuracy winner is authorized until the paired
 * sample, the event count, and the event-clustered interval all clear. The
 * provisional leader is reported as a diagnostic and must not be quoted as a
 * result before the gate closes.
 *
 * @param {{
 *   pairs: object[],
 *   minPairedPredictions?: number,
 *   minDistinctEvents?: number,
 *   bootstrapSamples?: number,
 *   bootstrapSeed?: number,
 *   confidence?: number
 * }} input
 */
function compareModels(input) {
  if (!input || typeof input !== "object" || Array.isArray(input)) {
    throw new TypeError("Comparison input must be an object");
  }

  const pairs = Array.isArray(input.pairs) ? input.pairs : [];
  const minPairedPredictions = input.minPairedPredictions ?? DEFAULT_MIN_PAIRED_PREDICTIONS;
  const minDistinctEvents = input.minDistinctEvents ?? DEFAULT_MIN_DISTINCT_EVENTS;
  const bootstrapOptions = {
    samples: input.bootstrapSamples ?? DEFAULT_BOOTSTRAP_SAMPLES,
    seed: input.bootstrapSeed ?? DEFAULT_BOOTSTRAP_SEED,
    confidence: input.confidence ?? DEFAULT_CONFIDENCE
  };

  const distinctEvents = new Set(pairs.map((pair) => pair.eventId));
  const scores = {
    [SWEET_BEAR_MODEL_KEY]: scoreRows(rowsForModel(pairs, SWEET_BEAR_MODEL_KEY)),
    [BEAR_EDGE_MODEL_KEY]: scoreRows(rowsForModel(pairs, BEAR_EDGE_MODEL_KEY)),
    [MARKET_BASELINE_MODEL_KEY]: scoreRows(
      rowsForModel(pairs, MARKET_BASELINE_MODEL_KEY)
    )
  };

  const headToHead = intervalForDeltas(
    pairedBrierDeltas(pairs, SWEET_BEAR_MODEL_KEY, BEAR_EDGE_MODEL_KEY),
    bootstrapOptions
  );
  const versusMarket = {
    [SWEET_BEAR_MODEL_KEY]: intervalForDeltas(
      pairedBrierDeltas(pairs, SWEET_BEAR_MODEL_KEY, MARKET_BASELINE_MODEL_KEY),
      bootstrapOptions
    ),
    [BEAR_EDGE_MODEL_KEY]: intervalForDeltas(
      pairedBrierDeltas(pairs, BEAR_EDGE_MODEL_KEY, MARKET_BASELINE_MODEL_KEY),
      bootstrapOptions
    )
  };

  const gate = {
    minPairedPredictions,
    minDistinctEvents,
    bootstrapSamples: bootstrapOptions.samples,
    pairedPredictionsMet: pairs.length >= minPairedPredictions,
    distinctEventsMet: distinctEvents.size >= minDistinctEvents,
    intervalExcludesZero: headToHead.excludesZero
  };

  const gateClosed = gate.pairedPredictionsMet
    && gate.distinctEventsMet
    && gate.intervalExcludesZero;

  let provisionalLeader = "unavailable";

  if (headToHead.mean !== null && headToHead.mean !== 0) {
    provisionalLeader = headToHead.mean < 0
      ? SWEET_BEAR_MODEL_KEY
      : BEAR_EDGE_MODEL_KEY;
  }

  let status = STATUS_INSUFFICIENT_SAMPLE;

  if (gateClosed) {
    status = STATUS_WINNER_AUTHORIZED;
  } else if (gate.pairedPredictionsMet && gate.distinctEventsMet) {
    status = STATUS_NO_SEPARATION;
  }

  return {
    status,
    provisionalLeader,
    authorizedWinner: gateClosed ? provisionalLeader : null,
    pairedPredictions: pairs.length,
    distinctEvents: distinctEvents.size,
    scores,
    headToHead,
    versusMarket,
    gate
  };
}

module.exports = {
  DEFAULT_BOOTSTRAP_SAMPLES,
  DEFAULT_BOOTSTRAP_SEED,
  DEFAULT_MIN_DISTINCT_EVENTS,
  DEFAULT_MIN_PAIRED_PREDICTIONS,
  STATUS_INSUFFICIENT_SAMPLE,
  STATUS_NO_SEPARATION,
  STATUS_WINNER_AUTHORIZED,
  classificationCredit,
  clusterDeltasByEvent,
  compareModels,
  pairedBrierDeltas,
  rowsForModel,
  scoreRows
};
