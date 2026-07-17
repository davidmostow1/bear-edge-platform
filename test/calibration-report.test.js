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
  brierScore,
  expectedCalibrationError,
  fitCalibrationLine,
  logLoss
} = require("../src/calibration/metrics.js");
const { loadModelRegistry } = require("../src/calibration/model-registry.js");
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
  assert.equal(report.evaluation.uncertainty.method, "percentile_bootstrap");
  assert.equal(report.evaluation.uncertainty.resamples, 2000);
  assert.equal(report.evaluation.uncertainty.confidenceLevel, 0.95);
  assert.equal(report.evaluation.uncertainty.seed, 271828);
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
  assert.ok(report.evaluation.closingLineValue.interval.lower > 0);
  assert.ok(report.evaluation.roi.interval.lower <= report.evaluation.roi.mean);
  assert.ok(report.evaluation.roi.interval.upper >= report.evaluation.roi.mean);
  approximatelyEqual(
    report.evaluation.brierScore - report.evaluation.baseline.brierScore,
    -0.09
  );
  assert.ok(
    report.evaluation.baseline.brierScoreDegradationInterval.lower <= -0.09
  );
  assert.ok(
    report.evaluation.baseline.brierScoreDegradationInterval.upper >= -0.09
  );
  assert.ok(
    report.evaluation.baseline.logLossDegradationInterval.lower
      <= report.evaluation.logLoss - report.evaluation.baseline.logLoss
  );
  assert.ok(
    report.evaluation.baseline.logLossDegradationInterval.upper
      >= report.evaluation.logLoss - report.evaluation.baseline.logLoss
  );
  assert.deepEqual(report.policy.thresholds, report.reportEvidence.promotionPolicy);
  assert.equal(report.promotion.passed, false);
  assert.ok(report.promotion.checks.every((check) => (
    check.evidencePath === "dataQuality"
    || check.evidencePath === "policy.registeredAt"
    || check.evidencePath.startsWith("evaluation.")
  )));
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
});

test("training changes cannot alter evaluation metrics or promotion checks", () => {
  const rows = validRows();
  const changedTraining = rows.map((row, index) => index < 30
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
  const after = buildCalibrationReport(changedTraining, OPTIONS);

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
});
