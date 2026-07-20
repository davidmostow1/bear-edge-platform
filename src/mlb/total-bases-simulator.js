const {
  createSeededRandom
} = require("../live/probability-causality.js");

const MODEL_VERSION = "mlb-total-bases-v1";
const PROBABILITY_TOLERANCE = 1e-9;

function assertFiniteNumber(value, name) {
  if (typeof value !== "number" || !Number.isFinite(value)) {
    throw new TypeError(`${name} must be a finite number.`);
  }
}

function assertProbability(value, name) {
  assertFiniteNumber(value, name);

  if (value < 0 || value > 1) {
    throw new RangeError(`${name} must be between 0 and 1.`);
  }
}

function assertNormalizedDistribution(entries, label) {
  const total = entries.reduce((sum, entry) => sum + entry.probability, 0);

  if (Math.abs(total - 1) > PROBABILITY_TOLERANCE) {
    throw new RangeError(`${label} must sum to 1.`);
  }
}

function normalizePlateAppearances(input) {
  if (!Array.isArray(input) || input.length === 0) {
    throw new TypeError("plateAppearances must be a non-empty array.");
  }

  const entries = input.map((entry, index) => {
    if (!entry || typeof entry !== "object") {
      throw new TypeError(`plateAppearances[${index}] must be an object.`);
    }

    const value = Number(entry.value);
    const probability = Number(entry.probability);

    if (!Number.isInteger(value) || value <= 0) {
      throw new RangeError(`plateAppearances[${index}].value must be a positive integer.`);
    }

    assertProbability(probability, `plateAppearances[${index}].probability`);

    return { value, probability };
  });

  assertNormalizedDistribution(entries, "plateAppearances probabilities");
  return entries;
}

function normalizeOutcomeProbabilities(input) {
  if (!input || typeof input !== "object" || Array.isArray(input)) {
    throw new TypeError("outcomeProbabilities must be an object.");
  }

  const entries = [0, 1, 2, 3, 4].map((value) => {
    const probability = Number(input[value]);
    assertProbability(probability, `outcomeProbabilities[${value}]`);
    return { value, probability };
  });

  assertNormalizedDistribution(entries, "outcomeProbabilities");
  return entries;
}

function normalizeThresholds(input) {
  if (!Array.isArray(input) || input.length === 0) {
    throw new TypeError("thresholds must be a non-empty array.");
  }

  const thresholds = input.map((value, index) => {
    const threshold = Number(value);
    assertFiniteNumber(threshold, `thresholds[${index}]`);

    if (threshold < 0 || Math.abs(threshold * 2 - Math.round(threshold * 2)) > PROBABILITY_TOLERANCE || Math.round(threshold * 2) % 2 === 0) {
      throw new RangeError(`thresholds[${index}] must be a non-negative half-run line such as 0.5, 1.5, or 2.5.`);
    }

    return threshold;
  });

  return [...new Set(thresholds)].sort((left, right) => left - right);
}

function sampleDistribution(entries, random) {
  const draw = random();
  let cumulative = 0;

  for (const entry of entries) {
    cumulative += entry.probability;
    if (draw < cumulative) {
      return entry.value;
    }
  }

  return entries[entries.length - 1].value;
}

function round(value, digits = 8) {
  const factor = 10 ** digits;
  return Math.round(value * factor) / factor;
}

function simulateTotalBasesMarket(input = {}) {
  const seed = String(input.seed ?? "bear-edge-total-bases");
  const iterations = Number(input.iterations ?? 100000);
  const plateAppearances = normalizePlateAppearances(input.plateAppearances);
  const outcomeProbabilities = normalizeOutcomeProbabilities(input.outcomeProbabilities);
  const thresholds = normalizeThresholds(input.thresholds ?? [0.5, 1.5, 2.5]);

  if (!Number.isInteger(iterations) || iterations <= 0) {
    throw new RangeError("iterations must be a positive integer.");
  }

  const random = createSeededRandom(seed);
  const overCounts = new Map(thresholds.map((threshold) => [threshold, 0]));
  let totalBasesSum = 0;

  for (let iteration = 0; iteration < iterations; iteration += 1) {
    const appearances = sampleDistribution(plateAppearances, random);
    let totalBases = 0;

    for (let appearance = 0; appearance < appearances; appearance += 1) {
      totalBases += sampleDistribution(outcomeProbabilities, random);
    }

    totalBasesSum += totalBases;

    for (const threshold of thresholds) {
      if (totalBases > threshold) {
        overCounts.set(threshold, overCounts.get(threshold) + 1);
      }
    }
  }

  return {
    modelVersion: MODEL_VERSION,
    seed,
    iterations,
    meanTotalBases: round(totalBasesSum / iterations),
    thresholds: thresholds.map((threshold) => {
      const overProbability = overCounts.get(threshold) / iterations;
      return {
        threshold,
        overProbability: round(overProbability),
        underProbability: round(1 - overProbability)
      };
    })
  };
}

module.exports = {
  MODEL_VERSION,
  simulateTotalBasesMarket
};
