const MODEL_ID = "negative_binomial_pitcher_strikeouts_v1";
const MODEL_VERSION = "1.0.0";

function requireTrainingRow(row, index, featureCount = null) {
  if (!row || typeof row !== "object") {
    throw new TypeError(`rows[${index}] must be an object.`);
  }
  if (typeof row.eventId !== "string" || row.eventId.length === 0) {
    throw new TypeError(`rows[${index}].eventId is required.`);
  }
  const eventTime = Date.parse(row.eventStartTime);
  if (!Number.isFinite(eventTime)) {
    throw new TypeError(`rows[${index}].eventStartTime must be a timestamp.`);
  }
  if (!Number.isInteger(row.outcome) || row.outcome < 0) {
    throw new TypeError(`rows[${index}].outcome must be a non-negative integer count.`);
  }
  if (!Array.isArray(row.features) || row.features.length === 0) {
    throw new TypeError(`rows[${index}].features must be a non-empty array.`);
  }
  if (featureCount !== null && row.features.length !== featureCount) {
    throw new TypeError("Every training row must use the same feature count.");
  }
  for (let column = 0; column < row.features.length; column += 1) {
    if (typeof row.features[column] !== "number" || !Number.isFinite(row.features[column])) {
      throw new TypeError(`rows[${index}].features[${column}] must be finite.`);
    }
  }
  return eventTime;
}

function chronologicalEventSplit(rows) {
  if (!Array.isArray(rows) || rows.length === 0) {
    throw new TypeError("chronologicalEventSplit requires non-empty rows.");
  }

  const events = new Map();
  rows.forEach((row, index) => {
    const eventTime = requireTrainingRow(row, index);
    const existing = events.get(row.eventId);
    if (existing && existing.eventTime !== eventTime) {
      throw new TypeError(`Event ${row.eventId} has contradictory start times.`);
    }
    if (!existing) {
      events.set(row.eventId, { eventId: row.eventId, eventTime, rows: [] });
    }
    events.get(row.eventId).rows.push(row);
  });

  const ordered = [...events.values()].sort((left, right) => (
    left.eventTime - right.eventTime || left.eventId.localeCompare(right.eventId)
  ));
  if (ordered.length < 3) {
    throw new TypeError("At least three distinct events are required for an event-atomic split.");
  }

  const trainingCount = Math.floor(ordered.length * 0.7);
  const calibrationCount = Math.floor(ordered.length * 0.15);
  const evaluationCount = ordered.length - trainingCount - calibrationCount;
  if (trainingCount < 1 || calibrationCount < 1 || evaluationCount < 1) {
    throw new TypeError("70/15/15 split requires enough events for every partition.");
  }

  function partition(eventRows) {
    return {
      eventCount: eventRows.length,
      eventIds: eventRows.map((event) => event.eventId),
      rows: eventRows.flatMap((event) => event.rows)
    };
  }

  return {
    method: "event_atomic_chronological_70_15_15",
    training: partition(ordered.slice(0, trainingCount)),
    calibration: partition(ordered.slice(trainingCount, trainingCount + calibrationCount)),
    evaluation: partition(ordered.slice(trainingCount + calibrationCount))
  };
}

function estimateDispersion(outcomes) {
  const mean = outcomes.reduce((sum, value) => sum + value, 0) / outcomes.length;
  const variance = outcomes.reduce((sum, value) => sum + (value - mean) ** 2, 0) /
    Math.max(1, outcomes.length - 1);
  if (variance <= mean || mean === 0) {
    return 100;
  }
  return Math.max(0.5, Math.min(100, mean * mean / (variance - mean)));
}

function fitNegativeBinomialResearchModel(rows, options = {}) {
  if (!Array.isArray(rows) || rows.length < 3) {
    throw new TypeError("At least three training rows are required.");
  }
  const featureCount = rows[0]?.features?.length ?? null;
  rows.forEach((row, index) => requireTrainingRow(row, index, featureCount));

  const iterations = options.iterations ?? 800;
  const learningRate = options.learningRate ?? 0.01;
  const l2Penalty = options.l2Penalty ?? 0.001;
  if (!Number.isInteger(iterations) || iterations < 1 || iterations > 10000) {
    throw new TypeError("iterations must be an integer from 1 through 10000.");
  }
  if (!(learningRate > 0 && learningRate <= 0.1)) {
    throw new TypeError("learningRate must be greater than zero and at most 0.1.");
  }
  if (!(l2Penalty >= 0 && Number.isFinite(l2Penalty))) {
    throw new TypeError("l2Penalty must be a finite non-negative number.");
  }

  const outcomes = rows.map((row) => row.outcome);
  const outcomeMean = outcomes.reduce((sum, value) => sum + value, 0) / outcomes.length;
  const dispersion = estimateDispersion(outcomes);
  const coefficients = Array(featureCount).fill(0);
  if (featureCount > 0 && rows.every((row) => row.features[0] === 1)) {
    coefficients[0] = Math.log(Math.max(0.01, outcomeMean));
  }

  for (let iteration = 0; iteration < iterations; iteration += 1) {
    const gradient = Array(featureCount).fill(0);
    for (const row of rows) {
      const eta = Math.max(-10, Math.min(10, row.features.reduce(
        (sum, feature, index) => sum + feature * coefficients[index],
        0
      )));
      const mean = Math.exp(eta);
      const etaGradient = dispersion * (row.outcome - mean) / (dispersion + mean);
      for (let index = 0; index < featureCount; index += 1) {
        gradient[index] += etaGradient * row.features[index];
      }
    }
    for (let index = 0; index < featureCount; index += 1) {
      const penalty = index === 0 ? 0 : l2Penalty * coefficients[index];
      coefficients[index] += learningRate * (gradient[index] / rows.length - penalty);
      if (!Number.isFinite(coefficients[index])) {
        throw new Error("Negative-binomial optimization produced a non-finite coefficient.");
      }
    }
  }

  return {
    modelId: MODEL_ID,
    modelVersion: MODEL_VERSION,
    modelStatus: "research_only",
    marketFamily: "pitcher_strikeouts",
    distribution: "negative_binomial_2",
    link: "log",
    dispersion,
    coefficients,
    featureCount,
    trainingRows: rows.length,
    optimizer: {
      method: "deterministic_batch_gradient_ascent",
      iterations,
      learningRate,
      l2Penalty
    }
  };
}

function negativeBinomialCdf(k, mean, dispersion) {
  if (!Number.isInteger(k)) {
    throw new TypeError("Negative-binomial CDF threshold must be an integer.");
  }
  if (k < 0) return 0;
  if (!(mean > 0) || !(dispersion > 0)) {
    throw new TypeError("Negative-binomial mean and dispersion must be positive.");
  }

  const successProbability = dispersion / (dispersion + mean);
  const failureProbability = mean / (dispersion + mean);
  let term = successProbability ** dispersion;
  let sum = term;
  for (let count = 1; count <= k; count += 1) {
    term *= ((count - 1 + dispersion) / count) * failureProbability;
    sum += term;
  }
  return Math.max(0, Math.min(1, sum));
}

function predictNegativeBinomialProbability(model, input) {
  if (model?.modelId !== MODEL_ID || model?.modelStatus !== "research_only") {
    throw new TypeError("Expected the registered research-only negative-binomial model.");
  }
  if (!Array.isArray(input?.features) || input.features.length !== model.featureCount) {
    throw new TypeError("Prediction features must match the trained feature count.");
  }
  const eta = input.features.reduce((sum, feature, index) => {
    if (typeof feature !== "number" || !Number.isFinite(feature)) {
      throw new TypeError(`Prediction feature ${index} must be finite.`);
    }
    return sum + feature * model.coefficients[index];
  }, 0);
  const mean = Math.exp(Math.max(-10, Math.min(10, eta)));
  if (!Number.isFinite(input.line) || Number.isInteger(input.line) || !Number.isInteger(input.line * 2)) {
    throw new TypeError("Prediction line must be a half-unit count line.");
  }
  const cdf = negativeBinomialCdf(Math.floor(input.line), mean, model.dispersion);
  if (input.side === "over") return Math.max(0, Math.min(1, 1 - cdf));
  if (input.side === "under") return cdf;
  throw new TypeError("Prediction side must be over or under.");
}

module.exports = {
  MODEL_ID,
  MODEL_VERSION,
  chronologicalEventSplit,
  fitNegativeBinomialResearchModel,
  negativeBinomialCdf,
  predictNegativeBinomialProbability
};
