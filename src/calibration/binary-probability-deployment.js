const { contentDigest } = require("../audit/canonical-json.js");

const ARTIFACT_SCHEMA_VERSION = "1.0.0";
const ARTIFACT_TYPE = "binary_probability_calibrator";
const CALIBRATION_METHOD = "platt_logit";
const REQUIRED_SPLIT_METHOD = "event_atomic_prediction_interval_blocks";
const REQUIRED_UNCERTAINTY_METHOD = "event_cluster_percentile_bootstrap";
const REQUIRED_CLUSTER_UNIT = "event_id";
const DIGEST_PATTERN = /^[a-f0-9]{64}$/;
const EPSILON = 1e-9;

function isPlainObject(value) {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function finiteNumber(value) {
  return typeof value === "number" && Number.isFinite(value);
}

function assertIdentity(value, field) {
  if (typeof value !== "string" || !value.trim() || value !== value.trim()) {
    throw new TypeError(`${field} must be a non-empty trimmed string.`);
  }
}

function assertDigest(value, field) {
  if (typeof value !== "string" || !DIGEST_PATTERN.test(value)) {
    throw new TypeError(`${field} must be a lowercase SHA-256 digest.`);
  }
}

function assertProbability(value, field) {
  if (!finiteNumber(value) || value < 0 || value > 1) {
    throw new TypeError(`${field} must be a finite probability from zero through one.`);
  }
}

function boundedProbability(value) {
  return Math.min(1 - EPSILON, Math.max(EPSILON, value));
}

function logit(value) {
  const probability = boundedProbability(value);
  return Math.log(probability / (1 - probability));
}

function logistic(value) {
  if (value >= 0) {
    const exp = Math.exp(-value);
    return 1 / (1 + exp);
  }
  const exp = Math.exp(value);
  return exp / (1 + exp);
}

function transformProbability(rawProbability, parameters) {
  assertProbability(rawProbability, "rawProbability");
  if (!isPlainObject(parameters)
      || !finiteNumber(parameters.intercept)
      || !finiteNumber(parameters.slope)) {
    throw new TypeError("Calibration parameters require finite intercept and slope values.");
  }
  return logistic(parameters.intercept + parameters.slope * logit(rawProbability));
}

function prepareCalibrationRows(rows) {
  if (!Array.isArray(rows) || rows.length < 10) {
    throw new TypeError("Calibration fitting requires at least ten calibration-split rows.");
  }

  const prepared = rows.map((row, index) => {
    if (!isPlainObject(row)) {
      throw new TypeError(`rows[${index}] must be an object.`);
    }
    assertIdentity(row.eventId, `rows[${index}].eventId`);
    assertProbability(row.predictedProbability, `rows[${index}].predictedProbability`);
    if (row.outcome !== 0 && row.outcome !== 1) {
      throw new TypeError(`rows[${index}].outcome must equal zero or one.`);
    }
    return {
      eventId: row.eventId,
      predictedProbability: row.predictedProbability,
      outcome: row.outcome
    };
  });

  const outcomes = new Set(prepared.map((row) => row.outcome));
  if (outcomes.size !== 2) {
    throw new RangeError("Calibration fitting requires both settled outcome classes.");
  }
  if (new Set(prepared.map((row) => row.eventId)).size < 2) {
    throw new RangeError("Calibration fitting requires at least two distinct event clusters.");
  }
  return prepared;
}

function fitPlattLogit(rows) {
  const prepared = prepareCalibrationRows(rows);
  let intercept = 0;
  let slope = 1;
  const ridge = 1e-6;
  const maxIterations = 100;
  let converged = false;
  let iterations = 0;

  for (iterations = 1; iterations <= maxIterations; iterations += 1) {
    let gradientIntercept = -ridge * intercept;
    let gradientSlope = -ridge * slope;
    let hessianIntercept = ridge;
    let hessianCross = 0;
    let hessianSlope = ridge;

    for (const row of prepared) {
      const predictor = logit(row.predictedProbability);
      const probability = logistic(intercept + slope * predictor);
      const residual = row.outcome - probability;
      const weight = Math.max(EPSILON, probability * (1 - probability));
      gradientIntercept += residual;
      gradientSlope += residual * predictor;
      hessianIntercept += weight;
      hessianCross += weight * predictor;
      hessianSlope += weight * predictor * predictor;
    }

    const determinant = hessianIntercept * hessianSlope - hessianCross * hessianCross;
    if (!finiteNumber(determinant) || determinant <= EPSILON) {
      throw new RangeError("Calibration fit is numerically singular.");
    }

    let interceptStep = (
      gradientIntercept * hessianSlope - gradientSlope * hessianCross
    ) / determinant;
    let slopeStep = (
      hessianIntercept * gradientSlope - hessianCross * gradientIntercept
    ) / determinant;

    const largestStep = Math.max(Math.abs(interceptStep), Math.abs(slopeStep));
    if (largestStep > 1) {
      interceptStep /= largestStep;
      slopeStep /= largestStep;
    }

    intercept += interceptStep;
    slope += slopeStep;

    if (Math.max(Math.abs(interceptStep), Math.abs(slopeStep)) < 1e-10) {
      converged = true;
      break;
    }
  }

  if (!converged || !finiteNumber(intercept) || !finiteNumber(slope)) {
    throw new RangeError("Calibration fit did not converge to finite parameters.");
  }

  return Object.freeze({ intercept, slope, converged, iterations });
}

function createPrng(seed) {
  let state = seed >>> 0;
  return () => {
    state += 0x6D2B79F5;
    let value = state;
    value = Math.imul(value ^ (value >>> 15), value | 1);
    value ^= value + Math.imul(value ^ (value >>> 7), value | 61);
    return ((value ^ (value >>> 14)) >>> 0) / 4294967296;
  };
}

function bootstrapCoefficientDraws(rows, resamples, seed) {
  const prepared = prepareCalibrationRows(rows);
  const grouped = new Map();
  for (const row of prepared) {
    if (!grouped.has(row.eventId)) grouped.set(row.eventId, []);
    grouped.get(row.eventId).push(row);
  }
  const eventIds = [...grouped.keys()].sort();
  const random = createPrng(seed);
  const draws = [];

  for (let resample = 0; resample < resamples; resample += 1) {
    const sampledRows = [];
    for (let index = 0; index < eventIds.length; index += 1) {
      const sampledId = eventIds[Math.floor(random() * eventIds.length)];
      sampledRows.push(...grouped.get(sampledId));
    }
    const fit = fitPlattLogit(sampledRows);
    draws.push({ intercept: fit.intercept, slope: fit.slope });
  }
  return draws;
}

function fitCalibrationArtifact(rows, options) {
  if (!isPlainObject(options)) {
    throw new TypeError("Calibration artifact options are required.");
  }
  for (const field of ["modelId", "modelVersion", "marketFamily", "calibrationReportId"]) {
    assertIdentity(options[field], field);
  }
  assertDigest(options.calibrationReportDigest, "calibrationReportDigest");
  assertDigest(options.calibrationSplitDigest, "calibrationSplitDigest");
  if (options.splitMethod !== REQUIRED_SPLIT_METHOD) {
    throw new TypeError(`splitMethod must equal ${REQUIRED_SPLIT_METHOD}.`);
  }
  if (!finiteNumber(options.confidenceLevel)
      || options.confidenceLevel <= 0
      || options.confidenceLevel >= 1) {
    throw new TypeError("confidenceLevel must be greater than zero and less than one.");
  }
  if (!Number.isInteger(options.bootstrapResamples) || options.bootstrapResamples < 1000) {
    throw new TypeError("bootstrapResamples must be an integer of at least 1000.");
  }
  if (!Number.isInteger(options.seed) || options.seed < 0 || options.seed > 0xffffffff) {
    throw new TypeError("seed must be an unsigned 32-bit integer.");
  }

  const prepared = prepareCalibrationRows(rows);
  const fit = fitPlattLogit(prepared);
  const coefficientDraws = bootstrapCoefficientDraws(
    prepared,
    options.bootstrapResamples,
    options.seed
  );
  const baseArtifact = {
    schemaVersion: ARTIFACT_SCHEMA_VERSION,
    artifactType: ARTIFACT_TYPE,
    modelId: options.modelId,
    modelVersion: options.modelVersion,
    marketFamily: options.marketFamily,
    calibrationReportId: options.calibrationReportId,
    calibrationReportDigest: options.calibrationReportDigest,
    calibrationSplitDigest: options.calibrationSplitDigest,
    splitMethod: options.splitMethod,
    method: CALIBRATION_METHOD,
    parameters: {
      intercept: fit.intercept,
      slope: fit.slope
    },
    evidenceBoundary: {
      fitRole: "calibration_split_only",
      evaluationDataUsed: false,
      marketDataUsed: false
    },
    uncertainty: {
      method: REQUIRED_UNCERTAINTY_METHOD,
      clusterUnit: REQUIRED_CLUSTER_UNIT,
      confidenceLevel: options.confidenceLevel,
      resamples: options.bootstrapResamples,
      seed: options.seed,
      coefficientDraws
    }
  };

  return {
    ...baseArtifact,
    artifactDigest: contentDigest(baseArtifact)
  };
}

function artifactIdentity(artifact) {
  const { artifactDigest: _artifactDigest, ...identity } = artifact;
  return identity;
}

function validateCalibrationArtifact(artifact, prediction, policy = {}) {
  if (!isPlainObject(artifact)) {
    throw new TypeError("Calibration artifact must be an object.");
  }
  if (artifact.schemaVersion !== ARTIFACT_SCHEMA_VERSION
      || artifact.artifactType !== ARTIFACT_TYPE
      || artifact.method !== CALIBRATION_METHOD) {
    throw new TypeError("Calibration artifact schema, type, or method is unsupported.");
  }
  for (const field of ["modelId", "modelVersion", "marketFamily", "calibrationReportId"]) {
    assertIdentity(artifact[field], `artifact.${field}`);
  }
  assertDigest(artifact.calibrationReportDigest, "artifact.calibrationReportDigest");
  assertDigest(artifact.calibrationSplitDigest, "artifact.calibrationSplitDigest");
  assertDigest(artifact.artifactDigest, "artifact.artifactDigest");
  if (contentDigest(artifactIdentity(artifact)) !== artifact.artifactDigest) {
    throw new TypeError("artifactDigest does not match the calibration artifact content.");
  }
  if (artifact.splitMethod !== REQUIRED_SPLIT_METHOD) {
    throw new TypeError(`artifact.splitMethod must equal ${REQUIRED_SPLIT_METHOD}.`);
  }
  if (!isPlainObject(artifact.evidenceBoundary)
      || artifact.evidenceBoundary.fitRole !== "calibration_split_only"
      || artifact.evidenceBoundary.evaluationDataUsed !== false
      || artifact.evidenceBoundary.marketDataUsed !== false) {
    throw new TypeError("Calibration artifact must remain calibration-split-only and market-independent.");
  }
  if (!isPlainObject(artifact.parameters)
      || !finiteNumber(artifact.parameters.intercept)
      || !finiteNumber(artifact.parameters.slope)) {
    throw new TypeError("Calibration artifact parameters are invalid.");
  }
  if (!isPlainObject(artifact.uncertainty)
      || artifact.uncertainty.method !== REQUIRED_UNCERTAINTY_METHOD
      || artifact.uncertainty.clusterUnit !== REQUIRED_CLUSTER_UNIT
      || !finiteNumber(artifact.uncertainty.confidenceLevel)
      || !Number.isInteger(artifact.uncertainty.resamples)
      || !Array.isArray(artifact.uncertainty.coefficientDraws)
      || artifact.uncertainty.coefficientDraws.length !== artifact.uncertainty.resamples) {
    throw new TypeError("Calibration artifact uncertainty evidence is invalid.");
  }
  for (const draw of artifact.uncertainty.coefficientDraws) {
    if (!isPlainObject(draw) || !finiteNumber(draw.intercept) || !finiteNumber(draw.slope)) {
      throw new TypeError("Calibration artifact contains an invalid bootstrap coefficient draw.");
    }
  }

  const minimumBootstrapResamples = policy.minimumBootstrapResamples ?? 1000;
  const minimumConfidenceLevel = policy.minimumConfidenceLevel ?? 0.95;
  if (!Number.isInteger(minimumBootstrapResamples) || minimumBootstrapResamples < 1) {
    throw new TypeError("minimumBootstrapResamples must be a positive integer.");
  }
  if (!finiteNumber(minimumConfidenceLevel)
      || minimumConfidenceLevel <= 0
      || minimumConfidenceLevel >= 1) {
    throw new TypeError("minimumConfidenceLevel must be greater than zero and less than one.");
  }
  if (artifact.uncertainty.resamples < minimumBootstrapResamples) {
    throw new RangeError("Calibration artifact has fewer bootstrap resamples than required.");
  }
  if (artifact.uncertainty.confidenceLevel < minimumConfidenceLevel) {
    throw new RangeError("Calibration artifact confidence level is below the required minimum.");
  }

  for (const field of ["modelId", "modelVersion", "marketFamily"]) {
    if (prediction[field] !== artifact[field]) {
      throw new TypeError(`Calibration artifact ${field} does not match the prediction.`);
    }
  }
  return artifact;
}

function quantile(sortedValues, probability) {
  if (!Array.isArray(sortedValues) || sortedValues.length === 0) {
    throw new TypeError("quantile requires a non-empty sorted array.");
  }
  const index = (sortedValues.length - 1) * probability;
  const lowerIndex = Math.floor(index);
  const upperIndex = Math.ceil(index);
  if (lowerIndex === upperIndex) return sortedValues[lowerIndex];
  const weight = index - lowerIndex;
  return sortedValues[lowerIndex] * (1 - weight) + sortedValues[upperIndex] * weight;
}

function nullDeployment(prediction) {
  return {
    ...prediction,
    calibratedProbabilityA: null,
    calibratedProbabilityB: null,
    uncertaintyLowA: null,
    uncertaintyHighA: null,
    uncertaintyLowB: null,
    uncertaintyHighB: null,
    conservativeProbabilityA: null,
    conservativeProbabilityB: null,
    probabilityDeployment: {
      status: "UNAVAILABLE",
      reason: "CALIBRATION_ARTIFACT_REQUIRED"
    }
  };
}

function applyProbabilityDeployment(prediction, artifact, policy = {}) {
  if (!isPlainObject(prediction)) {
    throw new TypeError("prediction must be an object.");
  }
  for (const field of ["modelId", "modelVersion", "marketFamily"]) {
    assertIdentity(prediction[field], `prediction.${field}`);
  }
  assertProbability(prediction.rawProbabilityA, "prediction.rawProbabilityA");
  assertProbability(prediction.rawProbabilityB, "prediction.rawProbabilityB");
  if (Math.abs(prediction.rawProbabilityA + prediction.rawProbabilityB - 1) > 1e-12) {
    throw new RangeError("Raw binary probabilities must sum to one.");
  }
  if (artifact === null || artifact === undefined) {
    return nullDeployment(prediction);
  }

  validateCalibrationArtifact(artifact, prediction, policy);
  const calibratedProbabilityA = transformProbability(
    prediction.rawProbabilityA,
    artifact.parameters
  );
  const draws = artifact.uncertainty.coefficientDraws
    .map((parameters) => transformProbability(prediction.rawProbabilityA, parameters))
    .sort((left, right) => left - right);
  const alpha = 1 - artifact.uncertainty.confidenceLevel;
  const uncertaintyLowA = quantile(draws, alpha / 2);
  const uncertaintyHighA = quantile(draws, 1 - alpha / 2);

  return {
    ...prediction,
    calibratedProbabilityA,
    calibratedProbabilityB: 1 - calibratedProbabilityA,
    uncertaintyLowA,
    uncertaintyHighA,
    uncertaintyLowB: 1 - uncertaintyHighA,
    uncertaintyHighB: 1 - uncertaintyLowA,
    conservativeProbabilityA: uncertaintyLowA,
    conservativeProbabilityB: 1 - uncertaintyHighA,
    probabilityDeployment: {
      status: "EVIDENCE_BOUND",
      method: artifact.method,
      calibrationReportId: artifact.calibrationReportId,
      calibrationReportDigest: artifact.calibrationReportDigest,
      calibrationSplitDigest: artifact.calibrationSplitDigest,
      artifactDigest: artifact.artifactDigest,
      uncertaintyMethod: artifact.uncertainty.method,
      confidenceLevel: artifact.uncertainty.confidenceLevel,
      resamples: artifact.uncertainty.resamples
    }
  };
}

module.exports = {
  ARTIFACT_SCHEMA_VERSION,
  CALIBRATION_METHOD,
  REQUIRED_SPLIT_METHOD,
  REQUIRED_UNCERTAINTY_METHOD,
  applyProbabilityDeployment,
  fitCalibrationArtifact,
  fitPlattLogit,
  transformProbability,
  validateCalibrationArtifact
};
