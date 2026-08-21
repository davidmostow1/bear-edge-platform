const assert = require("node:assert/strict");
const test = require("node:test");

const {
  applyProbabilityDeployment,
  fitCalibrationArtifact
} = require("../src/calibration/binary-probability-deployment.js");
const {
  buildFeeSchedule,
  evaluateBinaryContract,
  maximumAcceptablePrice,
  tradingFeeCents
} = require("../src/research/binary-contract-economics.js");

const DIGEST = "a".repeat(64);

function calibrationRows() {
  return Array.from({ length: 60 }, (_, index) => {
    const raw = 0.15 + (index % 10) * 0.07;
    const threshold = ((index * 7) % 10) / 10;
    return {
      eventId: `event-${index}`,
      predictedProbability: raw,
      outcome: threshold < raw ? 1 : 0
    };
  });
}

function rawPrediction() {
  return {
    modelId: "SBKP-LOL-FMW-GPR-BT-0.1.0",
    modelVersion: "0.1.0",
    marketFamily: "full_match_winner",
    rawProbabilityA: 0.62,
    rawProbabilityB: 0.38
  };
}

test("missing calibration evidence leaves deployable probability fields null", () => {
  const output = applyProbabilityDeployment(rawPrediction(), null);

  assert.equal(output.rawProbabilityA, 0.62);
  assert.equal(output.calibratedProbabilityA, null);
  assert.equal(output.conservativeProbabilityA, null);
  assert.equal(output.uncertaintyLowA, null);
  assert.equal(output.uncertaintyHighA, null);
  assert.equal(output.probabilityDeployment.status, "UNAVAILABLE");
  assert.equal(output.probabilityDeployment.reason, "CALIBRATION_ARTIFACT_REQUIRED");
});

test("calibration artifact is deterministic, calibration-only, and produces conservative intervals", () => {
  const options = {
    modelId: "SBKP-LOL-FMW-GPR-BT-0.1.0",
    modelVersion: "0.1.0",
    marketFamily: "full_match_winner",
    calibrationReportId: "lol-report-fixture",
    calibrationReportDigest: DIGEST,
    calibrationSplitDigest: "b".repeat(64),
    splitMethod: "event_atomic_prediction_interval_blocks",
    confidenceLevel: 0.95,
    bootstrapResamples: 1000,
    seed: 20260818
  };
  const artifactA = fitCalibrationArtifact(calibrationRows(), options);
  const artifactB = fitCalibrationArtifact(calibrationRows(), options);

  assert.deepEqual(artifactA, artifactB);
  assert.match(artifactA.artifactDigest, /^[a-f0-9]{64}$/);
  assert.equal(artifactA.method, "platt_logit");
  assert.equal(artifactA.evidenceBoundary.fitRole, "calibration_split_only");
  assert.equal(artifactA.evidenceBoundary.evaluationDataUsed, false);
  assert.equal(artifactA.evidenceBoundary.marketDataUsed, false);
  assert.equal(artifactA.uncertainty.method, "event_cluster_percentile_bootstrap");
  assert.equal(artifactA.uncertainty.clusterUnit, "event_id");
  assert.equal(artifactA.uncertainty.resamples, 1000);
  assert.equal(artifactA.uncertainty.coefficientDraws.length, 1000);

  const output = applyProbabilityDeployment(rawPrediction(), artifactA, {
    minimumBootstrapResamples: 1000,
    minimumConfidenceLevel: 0.95
  });

  assert.equal(Number.isFinite(output.calibratedProbabilityA), true);
  assert.equal(output.calibratedProbabilityB, 1 - output.calibratedProbabilityA);
  assert.equal(output.uncertaintyLowA <= output.uncertaintyHighA, true);
  assert.equal(output.conservativeProbabilityA, output.uncertaintyLowA);
  assert.equal(output.conservativeProbabilityB, 1 - output.uncertaintyHighA);
  assert.equal(output.probabilityDeployment.status, "EVIDENCE_BOUND");
  assert.equal(output.probabilityDeployment.artifactDigest, artifactA.artifactDigest);
});

test("tampered calibration artifacts fail closed", () => {
  const artifact = fitCalibrationArtifact(calibrationRows(), {
    modelId: "SBKP-LOL-FMW-GPR-BT-0.1.0",
    modelVersion: "0.1.0",
    marketFamily: "full_match_winner",
    calibrationReportId: "lol-report-fixture",
    calibrationReportDigest: DIGEST,
    calibrationSplitDigest: "b".repeat(64),
    splitMethod: "event_atomic_prediction_interval_blocks",
    confidenceLevel: 0.95,
    bootstrapResamples: 1000,
    seed: 20260818
  });

  artifact.parameters.slope += 0.01;
  assert.throws(
    () => applyProbabilityDeployment(rawPrediction(), artifact),
    /artifactDigest does not match/
  );
});

test("binary trading fees round the whole order up to the next cent", () => {
  const schedule = buildFeeSchedule({
    scheduleId: "official-general-2026-08-05",
    sourceDigest: DIGEST,
    effectiveAt: "2026-08-05T00:00:00.000Z",
    rounding: "ceil_cent_per_order",
    roles: {
      taker: { numerator: 7, denominator: 100 },
      maker: { numerator: 7, denominator: 400 }
    }
  });

  assert.equal(tradingFeeCents({ priceCents: 50, contracts: 1, role: "taker", feeSchedule: schedule }), 2);
  assert.equal(tradingFeeCents({ priceCents: 50, contracts: 1, role: "maker", feeSchedule: schedule }), 1);
  assert.equal(tradingFeeCents({ priceCents: 50, contracts: 100, role: "taker", feeSchedule: schedule }), 175);
});

test("fee-adjusted edge and expected ROI use total cash outlay", () => {
  const schedule = buildFeeSchedule({
    scheduleId: "official-general-2026-08-05",
    sourceDigest: DIGEST,
    effectiveAt: "2026-08-05T00:00:00.000Z",
    rounding: "ceil_cent_per_order",
    roles: {
      taker: { numerator: 7, denominator: 100 },
      maker: { numerator: 7, denominator: 400 }
    }
  });
  const result = evaluateBinaryContract({
    winProbability: 0.60,
    priceCents: 50,
    contracts: 1,
    role: "taker",
    feeSchedule: schedule
  });

  assert.equal(result.feeCents, 2);
  assert.equal(result.totalCostCents, 52);
  assert.equal(result.breakEvenProbability, 0.52);
  assert.ok(Math.abs(result.feeAdjustedEdge - 0.08) < 1e-12);
  assert.ok(Math.abs(result.expectedProfitCents - 8) < 1e-12);
  assert.ok(Math.abs(result.expectedRoi - (8 / 52)) < 1e-12);
});

test("maximum acceptable price enumerates executable cent ticks with fee rounding", () => {
  const schedule = buildFeeSchedule({
    scheduleId: "official-general-2026-08-05",
    sourceDigest: DIGEST,
    effectiveAt: "2026-08-05T00:00:00.000Z",
    rounding: "ceil_cent_per_order",
    roles: {
      taker: { numerator: 7, denominator: 100 },
      maker: { numerator: 7, denominator: 400 }
    }
  });
  const limit = maximumAcceptablePrice({
    winProbability: 0.60,
    contracts: 1,
    role: "taker",
    feeSchedule: schedule,
    minFeeAdjustedEdge: 0.03,
    minExpectedRoi: 0.05
  });

  assert.equal(limit.feasible, true);
  assert.equal(limit.maxPriceCents, 55);
  assert.equal(limit.economics.feeAdjustedEdge >= 0.03, true);
  assert.equal(limit.economics.expectedRoi >= 0.05, true);
});
