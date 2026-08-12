const assert = require("node:assert/strict");
const test = require("node:test");

const {
  calculateExecutionClv,
  calculateExecutionTiming,
  classifyExecutionOutcome,
  resolveExecutionCalibration
} = require("../src/audit/execution-grade.js");

const DIGEST = "a".repeat(64);

function ratedCalibrationReport(overrides = {}) {
  const evidenceChecks = [
    "minimumSettledPredictions",
    "minimumDistinctEvents",
    "registeredSplitMethod",
    "minimumBucketObservations",
    "minimumSettlementCoverage",
    "policyRegisteredBeforeEvaluation"
  ].map((id) => ({ id, passed: true }));
  const calibrationChecks = [
    { id: "maximumExpectedCalibrationError", passed: true },
    { id: "calibrationSlopeRange", passed: true },
    { id: "maximumAbsoluteCalibrationIntercept", passed: true }
  ];

  return {
    schemaVersion: "1.1.0",
    reportId: "calibration-report-001",
    reportDigest: DIGEST,
    identity: {
      modelId: "model-a",
      modelVersion: "1.0.0",
      marketFamily: "moneyline"
    },
    dataset: {
      evidenceCutoffAt: "2026-07-22T23:00:00.000Z"
    },
    evaluation: {
      predictionCount: 520,
      settledCount: 500,
      distinctEventCount: 180,
      settlementCoverage: 500 / 520,
      settledObservationSetDigest: DIGEST,
      brierScore: 0.19,
      logLoss: 0.56,
      expectedCalibrationError: 0.024,
      calibration: {
        slope: 0.94,
        intercept: 0.01,
        converged: true,
        reliability: [
          {
            lower: 0,
            upper: 0.5,
            count: 240,
            meanProbability: 0.42,
            observedRate: 0.4
          },
          {
            lower: 0.5,
            upper: 1,
            count: 260,
            meanProbability: 0.67,
            observedRate: 0.65
          }
        ]
      },
      uncertainty: {
        method: "event_cluster_percentile_bootstrap",
        confidenceLevel: 0.95,
        resamples: 2000,
        clusterUnit: "event_id",
        intervals: {
          brierScore: { lower: 0.17, upper: 0.21 },
          logLoss: { lower: 0.52, upper: 0.6 },
          expectedCalibrationError: { lower: 0.018, upper: 0.03 },
          calibrationSlope: { lower: 0.85, upper: 1.03 },
          calibrationIntercept: { lower: -0.01, upper: 0.03 }
        }
      }
    },
    promotion: {
      passed: true,
      checks: [...evidenceChecks, ...calibrationChecks]
    },
    ...overrides
  };
}

test("CLV reports a better price than close", () => {
  assert.deepEqual(calculateExecutionClv({
    priceTakenAmerican: -110,
    closingPriceAmerican: -125
  }), {
    status: "RATED",
    value: 1.9090909090909092 / 1.8 - 1,
    direction: "BETTER_THAN_CLOSE",
    priceTakenDecimal: 1.9090909090909092,
    closingPriceDecimal: 1.8,
    reasonCodes: []
  });
});

test("CLV reports the same price at close", () => {
  assert.deepEqual(calculateExecutionClv({
    priceTakenAmerican: 120,
    closingPriceAmerican: 120
  }), {
    status: "RATED",
    value: 0,
    direction: "AT_CLOSE",
    priceTakenDecimal: 2.2,
    closingPriceDecimal: 2.2,
    reasonCodes: []
  });
});

test("CLV reports a worse price than close", () => {
  const readout = calculateExecutionClv({
    priceTakenAmerican: -125,
    closingPriceAmerican: -110
  });

  assert.equal(readout.status, "RATED");
  assert.equal(readout.direction, "WORSE_THAN_CLOSE");
  assert.equal(readout.value, 1.8 / 1.9090909090909092 - 1);
});

test("CLV supports positive American odds", () => {
  const readout = calculateExecutionClv({
    priceTakenAmerican: 120,
    closingPriceAmerican: 105
  });

  assert.equal(readout.priceTakenDecimal, 2.2);
  assert.equal(readout.closingPriceDecimal, 2.05);
  assert.equal(readout.value, 2.2 / 2.05 - 1);
  assert.equal(readout.direction, "BETTER_THAN_CLOSE");
});

test("CLV rejects zero and non-finite American odds", () => {
  assert.throws(
    () => calculateExecutionClv({
      priceTakenAmerican: 0,
      closingPriceAmerican: -110
    }),
    /priceTakenAmerican cannot be 0/
  );
  assert.throws(
    () => calculateExecutionClv({
      priceTakenAmerican: -110,
      closingPriceAmerican: Number.NaN
    }),
    /closingPriceAmerican must be a finite number/
  );
});

test("timing reports exact pregame lead without a quality judgment", () => {
  assert.deepEqual(calculateExecutionTiming({
    betPlacedAt: "2026-07-23T16:37:00.000Z",
    eventStartTime: "2026-07-23T19:00:00.000Z"
  }), {
    status: "RATED",
    leadTimeSeconds: 8580,
    leadTimeMinutes: 143,
    phase: "PREGAME",
    reasonCodes: []
  });
});

test("timing distinguishes event start and live or post-start placement", () => {
  assert.equal(calculateExecutionTiming({
    betPlacedAt: "2026-07-23T19:00:00.000Z",
    eventStartTime: "2026-07-23T19:00:00.000Z"
  }).phase, "AT_EVENT_START");

  assert.deepEqual(calculateExecutionTiming({
    betPlacedAt: "2026-07-23T19:01:30.000Z",
    eventStartTime: "2026-07-23T19:00:00.000Z"
  }), {
    status: "RATED",
    leadTimeSeconds: -90,
    leadTimeMinutes: -1.5,
    phase: "LIVE_OR_POST_START",
    reasonCodes: []
  });
});

test("timing rejects malformed or non-UTC timestamps", () => {
  assert.throws(
    () => calculateExecutionTiming({
      betPlacedAt: "2026-07-23 16:37:00",
      eventStartTime: "2026-07-23T19:00:00.000Z"
    }),
    /betPlacedAt must be a valid ISO-8601 UTC timestamp/
  );
  assert.throws(
    () => calculateExecutionTiming({
      betPlacedAt: "2026-07-23T16:37:00.000Z",
      eventStartTime: "not-a-timestamp"
    }),
    /eventStartTime must be a valid ISO-8601 UTC timestamp/
  );
});

test("outcome intersection classifies price and result without changing the readouts", () => {
  const directions = {
    BETTER_THAN_CLOSE: "GOOD_PRICE",
    AT_CLOSE: "NEUTRAL_PRICE",
    WORSE_THAN_CLOSE: "BAD_PRICE"
  };
  const outcomes = {
    win: "GOOD_RESULT",
    loss: "BAD_RESULT",
    push: "PUSH",
    void: "VOID"
  };
  const clv = calculateExecutionClv({
    priceTakenAmerican: -110,
    closingPriceAmerican: -125
  });
  const timing = calculateExecutionTiming({
    betPlacedAt: "2026-07-23T16:37:00.000Z",
    eventStartTime: "2026-07-23T19:00:00.000Z"
  });

  for (const [direction, priceLabel] of Object.entries(directions)) {
    for (const [outcome, resultLabel] of Object.entries(outcomes)) {
      assert.deepEqual(classifyExecutionOutcome({ clvDirection: direction, outcome }), {
        result: outcome.toUpperCase(),
        clvOutcomePattern: `${priceLabel}_${resultLabel}`
      });
    }
  }

  assert.equal(clv.direction, "BETTER_THAN_CLOSE");
  assert.equal(clv.value, 1.9090909090909092 / 1.8 - 1);
  assert.equal(timing.leadTimeMinutes, 143);
  assert.equal(Object.hasOwn(timing, "qualityGrade"), false);
});

test("outcome intersection rejects unsupported direction and result values", () => {
  assert.throws(
    () => classifyExecutionOutcome({
      clvDirection: "UNKNOWN",
      outcome: "win"
    }),
    /clvDirection must be one of/
  );
  assert.throws(
    () => classifyExecutionOutcome({
      clvDirection: "AT_CLOSE",
      outcome: "pending"
    }),
    /outcome must be one of/
  );
});

test("calibration copies the exact cohort report fields when evidence was available at bet time", () => {
  const readout = resolveExecutionCalibration({
    identity: {
      modelId: "model-a",
      modelVersion: "1.0.0",
      marketFamily: "moneyline",
      calibrationReportId: "calibration-report-001",
      calibrationReportDigest: DIGEST
    },
    probability: 0.62,
    betPlacedAt: "2026-07-23T16:37:00.000Z",
    report: ratedCalibrationReport()
  });

  assert.deepEqual(readout, {
    status: "RATED",
    evidenceAssessment: "SUFFICIENT_EXACT_COHORT_EVIDENCE",
    policyAssessment: "WITHIN_REGISTERED_CALIBRATION_BOUNDS",
    reasonCodes: [],
    exactCohort: {
      modelId: "model-a",
      modelVersion: "1.0.0",
      marketFamily: "moneyline",
      probabilityBucket: {
        lower: 0.5,
        upper: 1
      }
    },
    evidence: {
      predictionCount: 520,
      settledCount: 500,
      distinctEventCount: 180,
      settlementCoverage: 500 / 520,
      settledObservationSetDigest: DIGEST,
      evidenceCutoffAt: "2026-07-22T23:00:00.000Z",
      requirementsSatisfied: true
    },
    metrics: {
      brierScore: 0.19,
      logLoss: 0.56,
      expectedCalibrationError: 0.024,
      calibrationSlope: 0.94,
      calibrationIntercept: 0.01,
      reliabilityBucket: {
        lower: 0.5,
        upper: 1,
        count: 260,
        meanProbability: 0.67,
        observedRate: 0.65
      },
      uncertainty: {
        method: "event_cluster_percentile_bootstrap",
        confidenceLevel: 0.95,
        resamples: 2000,
        clusterUnit: "event_id",
        intervals: {
          brierScore: { lower: 0.17, upper: 0.21 },
          logLoss: { lower: 0.52, upper: 0.6 },
          expectedCalibrationError: { lower: 0.018, upper: 0.03 },
          calibrationSlope: { lower: 0.85, upper: 1.03 },
          calibrationIntercept: { lower: -0.01, upper: 0.03 }
        }
      }
    },
    broaderContext: []
  });
});

test("calibration is UNRATED rather than pooled when exact-cohort evidence is insufficient", () => {
  const report = ratedCalibrationReport();
  report.promotion.checks.find(
    (check) => check.id === "minimumSettledPredictions"
  ).passed = false;

  const readout = resolveExecutionCalibration({
    identity: {
      modelId: "model-a",
      modelVersion: "1.0.0",
      marketFamily: "moneyline"
    },
    probability: 0.62,
    betPlacedAt: "2026-07-23T16:37:00.000Z",
    report
  });

  assert.equal(readout.status, "UNRATED");
  assert.deepEqual(readout.reasonCodes, ["INSUFFICIENT_EXACT_COHORT_EVIDENCE"]);
  assert.equal(readout.metrics, null);
  assert.deepEqual(readout.broaderContext, []);
});

test("calibration is UNRATED when evidence postdates the bet or uses legacy schema", () => {
  const inputs = {
    identity: {
      modelId: "model-a",
      modelVersion: "1.0.0",
      marketFamily: "moneyline"
    },
    probability: 0.62,
    betPlacedAt: "2026-07-23T16:37:00.000Z"
  };

  assert.deepEqual(
    resolveExecutionCalibration({
      ...inputs,
      report: ratedCalibrationReport({
        dataset: { evidenceCutoffAt: "2026-07-24T00:00:00.000Z" }
      })
    }).reasonCodes,
    ["EVIDENCE_NOT_AVAILABLE_AT_BET_TIME"]
  );
  assert.deepEqual(
    resolveExecutionCalibration({
      ...inputs,
      report: ratedCalibrationReport({ schemaVersion: "1.0.0" })
    }).reasonCodes,
    ["REPORT_LACKS_EVIDENCE_CUTOFF"]
  );
});

test("calibration keeps an outside-policy cohort RATED and labels the policy result", () => {
  const report = ratedCalibrationReport();
  report.promotion.passed = false;
  report.promotion.checks.find(
    (check) => check.id === "maximumExpectedCalibrationError"
  ).passed = false;

  const readout = resolveExecutionCalibration({
    identity: {
      modelId: "model-a",
      modelVersion: "1.0.0",
      marketFamily: "moneyline"
    },
    probability: 0.62,
    betPlacedAt: "2026-07-23T16:37:00.000Z",
    report
  });

  assert.equal(readout.status, "RATED");
  assert.equal(readout.policyAssessment, "OUTSIDE_REGISTERED_CALIBRATION_BOUNDS");
  assert.equal(readout.metrics.expectedCalibrationError, 0.024);
});

test("calibration fails closed for absent or mismatched report lineage", () => {
  const inputs = {
    identity: {
      modelId: "model-a",
      modelVersion: "1.0.0",
      marketFamily: "moneyline",
      calibrationReportId: "calibration-report-001",
      calibrationReportDigest: DIGEST
    },
    probability: 0.62,
    betPlacedAt: "2026-07-23T16:37:00.000Z"
  };

  assert.deepEqual(
    resolveExecutionCalibration({ ...inputs, report: null }).reasonCodes,
    ["NO_EXACT_COHORT_REPORT"]
  );
  assert.deepEqual(
    resolveExecutionCalibration({
      ...inputs,
      report: ratedCalibrationReport({ reportDigest: "b".repeat(64) })
    }).reasonCodes,
    ["REPORT_LINEAGE_MISMATCH"]
  );
  assert.deepEqual(
    resolveExecutionCalibration({
      ...inputs,
      report: ratedCalibrationReport({
        identity: {
          modelId: "model-b",
          modelVersion: "1.0.0",
          marketFamily: "moneyline"
        }
      })
    }).reasonCodes,
    ["EXACT_COHORT_MISMATCH"]
  );
});

test("calibration fails closed for invalid metrics or a non-converged fit", () => {
  const inputs = {
    identity: {
      modelId: "model-a",
      modelVersion: "1.0.0",
      marketFamily: "moneyline"
    },
    probability: 0.62,
    betPlacedAt: "2026-07-23T16:37:00.000Z"
  };
  const invalidInterval = ratedCalibrationReport();
  invalidInterval.evaluation.uncertainty.intervals.logLoss.upper = Number.NaN;
  const nonConverged = ratedCalibrationReport();
  nonConverged.evaluation.calibration.converged = false;

  assert.deepEqual(
    resolveExecutionCalibration({ ...inputs, report: invalidInterval }).reasonCodes,
    ["INVALID_EXACT_COHORT_REPORT"]
  );
  assert.deepEqual(
    resolveExecutionCalibration({ ...inputs, report: nonConverged }).reasonCodes,
    ["INVALID_EXACT_COHORT_REPORT"]
  );
});

test("calibration includes probability one in only the final reliability bucket", () => {
  const readout = resolveExecutionCalibration({
    identity: {
      modelId: "model-a",
      modelVersion: "1.0.0",
      marketFamily: "moneyline"
    },
    probability: 1,
    betPlacedAt: "2026-07-23T16:37:00.000Z",
    report: ratedCalibrationReport()
  });

  assert.equal(readout.status, "RATED");
  assert.deepEqual(readout.exactCohort.probabilityBucket, {
    lower: 0.5,
    upper: 1
  });
});
