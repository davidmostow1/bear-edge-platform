const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { spawnSync } = require("node:child_process");

const { contentDigest } = require("../src/audit/canonical-json.js");
const {
  buildDatasetManifest,
  chronologicalSplit
} = require("../src/calibration/dataset.js");
const {
  bootstrapClusterMeanInterval,
  bootstrapMeanInterval,
  brierScore,
  expectedCalibrationError,
  fitCalibrationLine,
  logLoss
} = require("../src/calibration/metrics.js");
const { calculateClosingLineValue } = require("../src/analytics.js");
const {
  americanToImpliedProbability,
  normalizeTwoWayNoVig
} = require("../src/index.js");
const { loadModelRegistry } = require("../src/calibration/model-registry.js");
const {
  resolveCalibrationReportById
} = require("../src/calibration/model-evidence.js");
const { buildCalibrationReport } = require("../src/calibration/report.js");

const ROOT = path.resolve(__dirname, "..");
const SOURCE_DIGEST = "a".repeat(64);
/** @type {{ sourceIdentifier: string, capturedAt: string, contentDigest: string }} */
const SOURCE = Object.freeze({
  sourceIdentifier: "fixture:sportsbook-and-settlement-001",
  capturedAt: "2026-07-31T12:00:00.000Z",
  contentDigest: SOURCE_DIGEST
});
const OPTIONS = Object.freeze({
  marketFamily: "pitcher_strikeouts",
  modelId: "poisson_count_v1",
  modelVersion: "1.0.0"
});
const BUCKETS = [
  { lower: 0, upper: 0.2 },
  { lower: 0.2, upper: 0.4 },
  { lower: 0.4, upper: 0.6 },
  { lower: 0.6, upper: 0.8 },
  { lower: 0.8, upper: 1 }
];

function timestamp(minutes, day = 1, hour = 12) {
  const date = new Date(Date.UTC(2026, 7, day, hour, minutes));
  return date.toISOString();
}

function probabilityAndOutcome(index) {
  if (index < 40) {
    return {
      predictedProbability: index % 2 === 0 ? 0.35 : 0.65,
      outcome: index % 2
    };
  }

  const evaluationIndex = index - 40;
  if (evaluationIndex < 5) {
    return {
      predictedProbability: 0.2,
      outcome: evaluationIndex === 0 ? 1 : 0
    };
  }

  return {
    predictedProbability: 0.8,
    outcome: evaluationIndex === 9 ? 0 : 1
  };
}

function calibrationRow(index, overrides = {}) {
  const predictionAt = timestamp(index);
  const probability = probabilityAndOutcome(index);

  return {
    predictionId: `prediction-${String(index + 1).padStart(3, "0")}`,
    eventId: `event-${String(index + 1).padStart(3, "0")}`,
    marketFamily: OPTIONS.marketFamily,
    participantId: `participant-${String((index % 8) + 1).padStart(2, "0")}`,
    participantRole: index % 2 === 0 ? "starter" : "reliever",
    context: index % 3 === 0 ? "home" : "away",
    side: "over",
    line: index % 2 === 0 ? 5.5 : 7.5,
    price: -110,
    oppositePrice: -110,
    ...probability,
    predictionAt,
    featureCutoffAt: timestamp(index - 1),
    eventStartAt: timestamp(index, 2, 17),
    settledAt: timestamp(index, 2, 21),
    closingPrice: {
      price: -125,
      oppositePrice: 105,
      capturedAt: timestamp(index, 2, 18),
      marketClosedAt: timestamp(index, 2, 18),
      isFinal: true
    },
    modelId: OPTIONS.modelId,
    modelVersion: OPTIONS.modelVersion,
    sourceDigests: [SOURCE_DIGEST],
    sourceEvidence: [{ ...SOURCE }],
    ...overrides
  };
}

function validRows() {
  return Array.from({ length: 50 }, (_unused, index) => calibrationRow(index));
}

function unsigned(report) {
  const { reportDigest, ...value } = report;
  return value;
}

function approximatelyEqual(actual, expected, tolerance = 1e-12) {
  assert.ok(
    Math.abs(actual - expected) <= tolerance,
    `Expected ${actual} to be within ${tolerance} of ${expected}`
  );
}

function clusterValuesByEvent(rows, values) {
  const clusters = new Map();

  rows.forEach((row, index) => {
    const cluster = clusters.get(row.eventId) ?? [];
    cluster.push(values[index]);
    clusters.set(row.eventId, cluster);
  });

  return [...clusters.values()];
}

function calibrationClusterIntervals(rows, metrics, observed) {
  const clusters = clusterValuesByEvent(rows, metrics);
  let state = 271828 >>> 0;
  const random = () => {
    state ^= state << 13;
    state ^= state >>> 17;
    state ^= state << 5;
    state >>>= 0;
    return state / 0x1_0000_0000;
  };
  const eceValues = [];
  const slopeValues = [];
  const interceptValues = [];
  let attempts = 0;

  while (
    (eceValues.length < 2000 || slopeValues.length < 2000)
    && attempts < 20000
  ) {
    const sample = Array.from(
      { length: clusters.length },
      () => clusters[Math.floor(random() * clusters.length)]
    ).flat();
    if (eceValues.length < 2000) {
      eceValues.push(expectedCalibrationError(sample, BUCKETS).value);
    }
    const fit = fitCalibrationLine(sample);
    if (
      slopeValues.length < 2000
      && fit.converged
      && Number.isFinite(fit.slope)
      && Number.isFinite(fit.intercept)
    ) {
      slopeValues.push(fit.slope);
      interceptValues.push(fit.intercept);
    }
    attempts += 1;
  }

  assert.equal(eceValues.length, 2000);
  assert.equal(slopeValues.length, 2000);
  assert.equal(interceptValues.length, 2000);

  const interval = (values, center) => {
    values.sort((left, right) => left - right);
    const valueAt = (probability) => {
      const position = (values.length - 1) * probability;
      const lowerIndex = Math.floor(position);
      const upperIndex = Math.ceil(position);
      const fraction = position - lowerIndex;
      return values[lowerIndex]
        + fraction * (values[upperIndex] - values[lowerIndex]);
    };
    const result = { lower: valueAt(0.025), upper: valueAt(0.975) };
    assert.ok(result.lower <= center);
    assert.ok(result.upper >= center);
    return result;
  };

  return {
    expectedCalibrationError: interval(
      eceValues,
      observed.expectedCalibrationError
    ),
    calibrationSlope: interval(slopeValues, observed.calibrationSlope),
    calibrationIntercept: interval(
      interceptValues,
      observed.calibrationIntercept
    )
  };
}

test("buildCalibrationReport is order-invariant, immutable, and content-addressed", () => {
  const rows = validRows();
  const snapshot = structuredClone(rows);
  const manifest = buildDatasetManifest(rows);
  const first = buildCalibrationReport(rows, OPTIONS);
  const reordered = buildCalibrationReport([...rows].reverse(), OPTIONS);

  assert.deepEqual(reordered, first);
  assert.deepEqual(rows, snapshot);
  assert.equal(Object.isFrozen(first), true);
  assert.equal(Object.isFrozen(first.evaluation.uncertainty.intervals), true);
  assert.equal(first.dataset.datasetDigest, manifest.datasetDigest);
  assert.equal(first.dataset.manifestDigest, contentDigest(manifest));
  assert.equal(first.schemaVersion, "1.1.0");
  assert.equal(
    first.dataset.evidenceCutoffAt,
    splitEvidenceCutoff(first, rows)
  );
  assert.equal(first.reportDigest, contentDigest(unsigned(first)));
  assert.equal(
    first.reportId,
    `calibration-${contentDigest(first.reportEvidence)}`
  );
  assert.deepEqual(first.dataset.sources, [SOURCE]);
  assert.deepEqual(first.dataset.sourceDigests, [SOURCE_DIGEST]);
  assert.deepEqual(
    [first.training.predictionCount, first.calibration.predictionCount, first.evaluation.predictionCount],
    [30, 10, 10]
  );
});

function splitEvidenceCutoff(report, rows) {
  const cutoff = Date.parse(report.dataset.splitCutoffs.evaluation);
  return rows
    .filter((row) => Date.parse(row.predictionAt) >= cutoff)
    .flatMap((row) => [row.settledAt, row.closingPrice.capturedAt])
    .sort()
    .at(-1);
}

test("evaluation evidence uses exact metrics, buckets, baseline observations, and registered bootstrap", () => {
  const rows = validRows();
  const split = chronologicalSplit(rows, {
    training: 0.6,
    calibration: 0.2,
    evaluation: 0.2
  });
  const metricRows = split.evaluation.map((row) => ({
    probability: row.predictedProbability,
    outcome: row.outcome
  }));
  const report = buildCalibrationReport(rows, OPTIONS);
  const expectedEce = expectedCalibrationError(metricRows, BUCKETS);
  const expectedFit = fitCalibrationLine(metricRows);
  const baselineMetrics = split.evaluation.map((row) => {
    const normalized = normalizeTwoWayNoVig(
      americanToImpliedProbability(row.price),
      americanToImpliedProbability(row.oppositePrice)
    );
    return { probability: normalized.sideA, outcome: row.outcome };
  });
  const brierDegradation = metricRows.map((row, index) => (
    brierScore([row]) - brierScore([baselineMetrics[index]])
  ));
  const logLossDegradation = metricRows.map((row, index) => (
    logLoss([row]) - logLoss([baselineMetrics[index]])
  ));
  const expectedBrierComparison = bootstrapMeanInterval(brierDegradation, {
    samples: 2000,
    confidence: 0.95,
    seed: 271828
  });
  const expectedLogLossComparison = bootstrapMeanInterval(logLossDegradation, {
    samples: 2000,
    confidence: 0.95,
    seed: 271828
  });
  const expectedClosingLineValue = bootstrapMeanInterval(
    split.evaluation.map((row) => (
      calculateClosingLineValue(row.price, row.closingPrice.price)
    )),
    { samples: 2000, confidence: 0.95, seed: 271828 }
  );

  approximatelyEqual(report.evaluation.brierScore, brierScore(metricRows));
  approximatelyEqual(report.evaluation.brierScore, 0.16);
  approximatelyEqual(report.evaluation.logLoss, logLoss(metricRows));
  approximatelyEqual(report.evaluation.expectedCalibrationError, 0);
  approximatelyEqual(report.evaluation.calibration.slope, expectedFit.slope);
  approximatelyEqual(report.evaluation.calibration.slope, 1);
  approximatelyEqual(report.evaluation.calibration.intercept, 0);
  assert.deepEqual(report.evaluation.calibration.reliability, expectedEce.reliability);
  assert.deepEqual(
    report.evaluation.calibration.reliability.map((bucket) => bucket.count),
    [0, 5, 0, 0, 5]
  );
  assert.equal(report.evaluation.settledCount, 10);
  assert.equal(report.evaluation.settlementCoverage, 1);
  assert.equal(report.evaluation.baseline.matchedPredictionCount, 10);
  assert.equal(
    report.evaluation.baseline.settledObservationSetDigest,
    report.evaluation.settledObservationSetDigest
  );
  approximatelyEqual(report.evaluation.baseline.brierScore, 0.25);
  approximatelyEqual(report.evaluation.baseline.logLoss, Math.log(2));
  assert.equal(
    report.evaluation.uncertainty.method,
    "event_cluster_percentile_bootstrap"
  );
  assert.equal(report.evaluation.uncertainty.resamples, 2000);
  assert.equal(report.evaluation.uncertainty.confidenceLevel, 0.95);
  assert.equal(report.evaluation.uncertainty.seed, 271828);
  assert.equal(report.evaluation.uncertainty.clusterUnit, "event_id");
  assert.equal(report.evaluation.uncertainty.distinctEventCount, 10);
  assert.equal(report.evaluation.distinctEventCount, 10);
  assert.equal(
    report.dataset.splitMethod,
    "event_atomic_prediction_interval_blocks"
  );
  assert.equal(report.dataset.chronologicalBlockCount, 50);
  assert.deepEqual(report.dataset.distinctEventCounts, {
    training: 30,
    calibration: 10,
    evaluation: 10
  });
  assert.equal(
    report.reportEvidence.splitMethod,
    "event_atomic_prediction_interval_blocks"
  );
  assert.equal(report.reportEvidence.chronologicalBlockCount, 50);
  assert.deepEqual(report.reportEvidence.distinctEventCounts, {
    training: 30,
    calibration: 10,
    evaluation: 10
  });
  assert.equal(
    report.reportId,
    `calibration-${contentDigest(report.reportEvidence)}`
  );
  assert.deepEqual(report.evaluation.uncertainty.successfulResamples, {
    expectedCalibrationError: 2000,
    calibrationSlope: 2000,
    calibrationIntercept: 2000
  });
  assert.ok(report.evaluation.uncertainty.attemptedResamples >= 2000);
  assert.deepEqual(
    Object.keys(report.evaluation.uncertainty.intervals).sort(),
    [
      "brierScore",
      "calibrationIntercept",
      "calibrationSlope",
      "expectedCalibrationError",
      "logLoss"
    ]
  );
  assert.deepEqual(report.evaluation.closingLineValue, {
    mean: expectedClosingLineValue.mean,
    interval: {
      lower: expectedClosingLineValue.lower,
      upper: expectedClosingLineValue.upper
    }
  });
  assert.ok(report.evaluation.roi.interval.lower <= report.evaluation.roi.mean);
  assert.ok(report.evaluation.roi.interval.upper >= report.evaluation.roi.mean);
  approximatelyEqual(
    report.evaluation.brierScore - report.evaluation.baseline.brierScore,
    -0.09
  );
  assert.deepEqual(report.evaluation.baseline.brierScoreDegradationInterval, {
    lower: expectedBrierComparison.lower,
    upper: expectedBrierComparison.upper
  });
  assert.deepEqual(report.evaluation.baseline.logLossDegradationInterval, {
    lower: expectedLogLossComparison.lower,
    upper: expectedLogLossComparison.upper
  });
  assert.deepEqual(report.policy.thresholds, report.reportEvidence.promotionPolicy);
  assert.equal(report.promotion.passed, false);
  assert.ok(report.promotion.checks.every((check) => (
    check.evidencePath === "dataQuality"
    || check.evidencePath === "policy.registeredAt"
    || check.evidencePath === "dataset.splitMethod"
    || check.evidencePath.startsWith("evaluation.")
  )));
});

test("evaluation uncertainty resamples complete event clusters", () => {
  const rows = validRows();

  for (let index = 40; index < rows.length; index += 2) {
    rows[index + 1] = {
      ...rows[index + 1],
      eventId: rows[index].eventId,
      eventStartAt: rows[index].eventStartAt
    };
  }

  const split = chronologicalSplit(rows, {
    training: 0.6,
    calibration: 0.2,
    evaluation: 0.2
  });
  const metricRows = split.evaluation.map((row) => ({
    probability: row.predictedProbability,
    outcome: row.outcome
  }));
  const brierLosses = metricRows.map((row) => brierScore([row]));
  const logLosses = metricRows.map((row) => logLoss([row]));
  const baselineRows = split.evaluation.map((row) => {
    const normalized = normalizeTwoWayNoVig(
      americanToImpliedProbability(row.price),
      americanToImpliedProbability(row.oppositePrice)
    );
    return { probability: normalized.sideA, outcome: row.outcome };
  });
  const brierDegradation = metricRows.map((row, index) => (
    brierScore([row]) - brierScore([baselineRows[index]])
  ));
  const logLossDegradation = metricRows.map((row, index) => (
    logLoss([row]) - logLoss([baselineRows[index]])
  ));
  const closingLineValues = split.evaluation.map((row) => (
    calculateClosingLineValue(row.price, row.closingPrice.price)
  ));
  const roiValues = split.evaluation.map((row) => {
    if (row.outcome === 0) {
      return -1;
    }
    return row.price > 0 ? row.price / 100 : 100 / Math.abs(row.price);
  });
  const expectedBrier = bootstrapClusterMeanInterval(
    clusterValuesByEvent(split.evaluation, brierLosses),
    { samples: 2000, confidence: 0.95, seed: 271828 }
  );
  const expectedLogLoss = bootstrapClusterMeanInterval(
    clusterValuesByEvent(split.evaluation, logLosses),
    { samples: 2000, confidence: 0.95, seed: 271828 }
  );
  const expectedBrierDegradation = bootstrapClusterMeanInterval(
    clusterValuesByEvent(split.evaluation, brierDegradation),
    { samples: 2000, confidence: 0.95, seed: 271828 }
  );
  const expectedLogLossDegradation = bootstrapClusterMeanInterval(
    clusterValuesByEvent(split.evaluation, logLossDegradation),
    { samples: 2000, confidence: 0.95, seed: 271828 }
  );
  const expectedClosingLineValue = bootstrapClusterMeanInterval(
    clusterValuesByEvent(split.evaluation, closingLineValues),
    { samples: 2000, confidence: 0.95, seed: 271828 }
  );
  const expectedRoi = bootstrapClusterMeanInterval(
    clusterValuesByEvent(split.evaluation, roiValues),
    { samples: 2000, confidence: 0.95, seed: 271828 }
  );
  const report = buildCalibrationReport(rows, OPTIONS);
  const expectedCalibration = calibrationClusterIntervals(
    split.evaluation,
    metricRows,
    {
      expectedCalibrationError: report.evaluation.expectedCalibrationError,
      calibrationSlope: report.evaluation.calibration.slope,
      calibrationIntercept: report.evaluation.calibration.intercept
    }
  );

  assert.equal(
    report.evaluation.uncertainty.method,
    "event_cluster_percentile_bootstrap"
  );
  assert.equal(report.evaluation.uncertainty.clusterUnit, "event_id");
  assert.equal(report.evaluation.uncertainty.distinctEventCount, 5);
  assert.equal(report.evaluation.distinctEventCount, 5);
  assert.deepEqual(report.evaluation.uncertainty.intervals.brierScore, {
    lower: expectedBrier.lower,
    upper: expectedBrier.upper
  });
  assert.deepEqual(report.evaluation.uncertainty.intervals.logLoss, {
    lower: expectedLogLoss.lower,
    upper: expectedLogLoss.upper
  });
  assert.deepEqual(
    report.evaluation.uncertainty.intervals.expectedCalibrationError,
    expectedCalibration.expectedCalibrationError
  );
  assert.deepEqual(
    report.evaluation.uncertainty.intervals.calibrationSlope,
    expectedCalibration.calibrationSlope
  );
  assert.deepEqual(
    report.evaluation.uncertainty.intervals.calibrationIntercept,
    expectedCalibration.calibrationIntercept
  );
  assert.deepEqual(report.evaluation.baseline.brierScoreDegradationInterval, {
    lower: expectedBrierDegradation.lower,
    upper: expectedBrierDegradation.upper
  });
  assert.deepEqual(report.evaluation.baseline.logLossDegradationInterval, {
    lower: expectedLogLossDegradation.lower,
    upper: expectedLogLossDegradation.upper
  });
  assert.deepEqual(report.evaluation.closingLineValue, {
    mean: expectedClosingLineValue.mean,
    interval: {
      lower: expectedClosingLineValue.lower,
      upper: expectedClosingLineValue.upper
    }
  });
  assert.deepEqual(report.evaluation.roi, {
    mean: expectedRoi.mean,
    interval: {
      lower: expectedRoi.lower,
      upper: expectedRoi.upper
    }
  });
});

test("evaluation uncertainty refuses multiple rows from only one event", () => {
  const rows = validRows();
  const event = rows[40];

  for (let index = 40; index < rows.length; index += 1) {
    rows[index] = {
      ...rows[index],
      eventId: event.eventId,
      eventStartAt: event.eventStartAt,
      participantId: `single-event-participant-${index}`
    };
  }

  assert.throws(
    () => buildCalibrationReport(rows, OPTIONS),
    /at least two distinct events/i
  );
});

test("generated evidence satisfies the strict Task 3 report contract", () => {
  const report = buildCalibrationReport(validRows(), OPTIONS);
  const tracked = JSON.parse(fs.readFileSync(path.join(ROOT, "models/registry.json"), "utf8"));
  const registered = tracked.models.find((model) => (
    model.modelId === OPTIONS.modelId
    && model.modelVersion === OPTIONS.modelVersion
    && model.marketFamily === OPTIONS.marketFamily
  ));
  const shadow = {
    ...registered,
    featureSet: [...report.identity.featureSet],
    dataSources: [...report.identity.dataSources],
    trainingCutoff: report.identity.trainingCutoff,
    calculationImplementation: structuredClone(report.identity.calculationImplementation),
    modelStatus: "shadow",
    calibrationReportId: report.reportId,
    calibrationReportDigest: report.reportDigest,
    promotionPolicyVersion: tracked.policyVersion,
    promotionPolicyDigest: tracked.policyDigest
  };
  const registryPath = path.join(
    fs.mkdtempSync(path.join(os.tmpdir(), "bear-edge-report-contract-")),
    "registry.json"
  );
  fs.writeFileSync(
    registryPath,
    `${JSON.stringify({ ...tracked, models: [shadow] }, null, 2)}\n`,
    "utf8"
  );

  const loaded = loadModelRegistry({
    registryPath,
    reportsById: { [report.reportId]: report }
  });

  assert.equal(loaded.models[0].modelStatus, "shadow");
  assert.match(
    loaded.models[0].calculationImplementation.implementationDigest,
    /^[a-f0-9]{64}$/
  );
  assert.equal(
    resolveCalibrationReportById(report.reportId, {
      registryPath,
      reportsById: { [report.reportId]: report }
    }),
    report
  );

  const researchRegistry = {
    ...tracked,
    models: [{ ...shadow, modelStatus: "research_only" }]
  };
  fs.writeFileSync(
    registryPath,
    `${JSON.stringify(researchRegistry, null, 2)}\n`,
    "utf8"
  );
  assert.equal(
    resolveCalibrationReportById(report.reportId, {
      registryPath,
      reportsById: { [report.reportId]: report }
    }),
    report
  );

  const missingCutoff = /** @type {Record<string, any>} */ (
    structuredClone(report)
  );
  delete missingCutoff.dataset.evidenceCutoffAt;
  missingCutoff.reportEvidence.datasetEvidenceDigest = contentDigest(
    missingCutoff.dataset
  );
  missingCutoff.reportId = `calibration-${contentDigest(missingCutoff.reportEvidence)}`;
  const { reportDigest: ignoredDigest, ...missingCutoffUnsigned } = missingCutoff;
  void ignoredDigest;
  missingCutoff.reportDigest = contentDigest(missingCutoffUnsigned);
  const missingCutoffRegistry = {
    ...tracked,
    models: [{
      ...shadow,
      calibrationReportId: missingCutoff.reportId,
      calibrationReportDigest: missingCutoff.reportDigest
    }]
  };
  fs.writeFileSync(
    registryPath,
    `${JSON.stringify(missingCutoffRegistry, null, 2)}\n`,
    "utf8"
  );
  assert.throws(
    () => loadModelRegistry({
      registryPath,
      reportsById: { [missingCutoff.reportId]: missingCutoff }
    }),
    /dataset\.evidenceCutoffAt/
  );
});

test("training and calibration changes cannot alter evaluation metrics or promotion checks", () => {
  const rows = validRows();
  const changedTrainingAndCalibration = rows.map((row, index) => index < 40
    ? {
        ...row,
        outcome: row.outcome === 1 ? 0 : 1,
        settledAt: row.settledAt,
        closingPrice: { ...row.closingPrice },
        sourceDigests: [...row.sourceDigests],
        sourceEvidence: row.sourceEvidence.map((source) => ({ ...source }))
      }
    : row);
  const before = buildCalibrationReport(rows, OPTIONS);
  const after = buildCalibrationReport(changedTrainingAndCalibration, OPTIONS);

  assert.notEqual(after.dataset.datasetDigest, before.dataset.datasetDigest);
  assert.notEqual(after.reportDigest, before.reportDigest);
  assert.deepEqual(after.evaluation, before.evaluation);
  assert.deepEqual(after.promotion, before.promotion);
});

test("report construction requires exact row source lineage", () => {
  const missingEvidence = validRows();
  delete missingEvidence[0].sourceEvidence;
  assert.throws(
    () => buildCalibrationReport(missingEvidence, OPTIONS),
    /sourceEvidence/
  );

  const mismatchedDigest = validRows();
  mismatchedDigest[0].sourceEvidence[0].contentDigest = "b".repeat(64);
  assert.throws(
    () => buildCalibrationReport(mismatchedDigest, OPTIONS),
    /exactly match sourceDigests/
  );

  const conflictingIdentifier = validRows();
  conflictingIdentifier[1].sourceEvidence[0].capturedAt = "2026-07-31T12:01:00.000Z";
  assert.throws(
    () => buildCalibrationReport(conflictingIdentifier, OPTIONS),
    /conflicting source evidence/
  );
});

test("every settled evaluation observation requires a final closing price", () => {
  const missingClose = validRows();
  missingClose[49].closingPrice = null;
  assert.throws(
    () => buildCalibrationReport(missingClose, OPTIONS),
    /final closing price.*prediction-050/i
  );

  const preliminaryClose = validRows();
  preliminaryClose[49].closingPrice.isFinal = false;
  assert.throws(
    () => buildCalibrationReport(preliminaryClose, OPTIONS),
    /final closing price.*prediction-050/i
  );
});

test("calibration bootstrap fails closed when it cannot obtain the registered fit count", () => {
  const evaluationOutcomes = [
    { predictedProbability: 0.2, outcome: 0 },
    { predictedProbability: 0.2, outcome: 1 },
    { predictedProbability: 0.8, outcome: 0 },
    { predictedProbability: 0.8, outcome: 1 }
  ];
  const rows = Array.from({ length: 20 }, (_unused, index) => (
    calibrationRow(index, index < 16 ? {} : evaluationOutcomes[index - 16])
  ));

  assert.throws(
    () => buildCalibrationReport(rows, OPTIONS),
    /produced \d+ successful fits from 20000 attempts; 2000 are required/
  );
});

test("invalid, duplicate, and identity-excluded rows retain stable identifiers and reasons", () => {
  const rows = validRows();
  rows.push(calibrationRow(60, {
    predictionId: "invalid-probability",
    predictedProbability: 2
  }));
  rows.push(calibrationRow(61, {
    predictionId: "wrong-model",
    modelId: "different_model"
  }));
  rows.push(calibrationRow(62, {
    predictionId: "duplicate-observation",
    eventId: rows[0].eventId,
    participantId: rows[0].participantId,
    line: rows[0].line,
    predictionAt: timestamp(62)
  }));

  const report = buildCalibrationReport(rows, OPTIONS);
  const invalidDetails = report.dataQuality.invalidRows.map((finding) => finding.detail);
  const excludedDetails = report.dataQuality.excludedRows.map((finding) => finding.detail);

  assert.ok(invalidDetails.some((detail) => (
    detail.includes("invalid-probability") && detail.includes("INVALID_PROBABILITY")
  )));
  assert.ok(excludedDetails.some((detail) => (
    detail.includes("wrong-model") && detail.includes("IDENTITY_MISMATCH")
  )));
  assert.ok(excludedDetails.some((detail) => (
    detail.includes("duplicate-observation") && detail.includes("DUPLICATE_OBSERVATION")
  )));
  assert.ok([
    ...report.dataQuality.invalidRows,
    ...report.dataQuality.excludedRows
  ].every((finding) => finding.count === 1));
});

test("CLI writes formatted deterministic JSON and rejects bad flags or rows", () => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), "bear-edge-calibration-report-"));
  const inputPath = path.join(directory, "input.jsonl");
  const outputPath = path.join(directory, "report.json");
  const registryBefore = fs.readFileSync(path.join(ROOT, "models/registry.json"), "utf8");
  fs.writeFileSync(
    inputPath,
    `${validRows().map((row) => JSON.stringify(row)).join("\n")}\n\n`,
    "utf8"
  );
  const cli = path.join(ROOT, "script/build_calibration_report.js");
  const args = [
    cli,
    "--input", inputPath,
    "--market-family", OPTIONS.marketFamily,
    "--model-id", OPTIONS.modelId,
    "--model-version", OPTIONS.modelVersion,
    "--output", outputPath
  ];
  const success = spawnSync(process.execPath, args, {
    cwd: ROOT,
    encoding: "utf8"
  });

  assert.equal(success.status, 0, success.stderr);
  const formatted = fs.readFileSync(outputPath, "utf8");
  assert.ok(formatted.endsWith("\n"));
  assert.ok(formatted.includes("\n  \"schemaVersion\""));
  assert.equal(JSON.parse(formatted).reportDigest, buildCalibrationReport(validRows(), OPTIONS).reportDigest);
  assert.equal(fs.readFileSync(path.join(ROOT, "models/registry.json"), "utf8"), registryBefore);

  const unknownFlag = spawnSync(process.execPath, [...args, "--promote"], {
    cwd: ROOT,
    encoding: "utf8"
  });
  assert.notEqual(unknownFlag.status, 0);
  assert.match(unknownFlag.stderr, /Unsupported flag.*--promote/);

  const invalidInputPath = path.join(directory, "invalid.jsonl");
  const invalidOutputPath = path.join(directory, "invalid-report.json");
  fs.writeFileSync(invalidInputPath, `${JSON.stringify(calibrationRow(0, { line: null }))}\n`, "utf8");
  const invalidRows = spawnSync(process.execPath, [
    cli,
    "--input", invalidInputPath,
    "--market-family", OPTIONS.marketFamily,
    "--model-id", OPTIONS.modelId,
    "--model-version", OPTIONS.modelVersion,
    "--output", invalidOutputPath
  ], {
    cwd: ROOT,
    encoding: "utf8"
  });
  assert.notEqual(invalidRows.status, 0);
  assert.match(invalidRows.stderr, /invalid calibration row/i);
  assert.equal(fs.existsSync(invalidOutputPath), false);

  const packed = spawnSync("npm", ["pack", "--dry-run", "--json"], {
    cwd: ROOT,
    encoding: "utf8"
  });
  assert.equal(packed.status, 0, packed.stderr);
  const packageFiles = JSON.parse(packed.stdout)[0].files.map((file) => file.path);
  assert.ok(
    packageFiles.includes("script/build_calibration_report.js"),
    "portable package must include the calibrate command target"
  );
});
