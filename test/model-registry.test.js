const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");

const { contentDigest } = require("../src/audit/canonical-json.js");
const {
  evaluatePromotion,
  loadModelRegistry,
  resolveModelStatus
} = require("../src/calibration/model-registry.js");

const POLICY_REGISTERED_AT = "2026-06-30T12:00:00.000Z";
const EVALUATION_STARTED_AT = "2026-07-01T12:00:00.000Z";
const TRAINING_CUTOFF = "2026-06-01T12:00:00.000Z";
const MANIFEST_DIGEST = "c".repeat(64);
const DATASET_DIGEST = "d".repeat(64);
const SOURCE_DIGEST = "e".repeat(64);
const MARKET_DATA_DIGEST = "f".repeat(64);
const SETTLED_OBSERVATION_SET_DIGEST = "a".repeat(64);
const SOURCE_CAPTURED_AT = "2026-06-30T11:00:00.000Z";
const RELIABILITY_BUCKET_BOUNDARIES = Object.freeze([0, 0.2, 0.4, 0.6, 0.8, 1]);
const REQUIRED_BASELINE = Object.freeze({
  baselineId: "no_vig_market",
  method: "two_way_proportional_normalization",
  methodVersion: "1.0.0"
});
const MODEL_FEATURE_SET = Object.freeze([
  "line",
  "recent_per_game",
  "recent_sample_limit",
  "recent_weight",
  "season_per_game",
  "side"
]);
const MODEL_DATA_SOURCES = Object.freeze([
  "official_mlb_statsapi_player_stats",
  "official_mlb_statsapi_schedule"
]);
const MODEL_MODULES = Object.freeze([
  "src/live/candidates.js",
  "src/live/estimate-prop.js"
]);
const IMPLEMENTATION_DIGEST = contentDigest({
  version: "1.0.0",
  probabilityExport: "estimateCountProbability",
  modules: MODEL_MODULES.map((modulePath) => ({
    modulePath,
    source: fs.readFileSync(path.join(__dirname, "..", modulePath), "utf8")
  }))
});
const MODEL_IMPLEMENTATION = Object.freeze({
  modules: MODEL_MODULES,
  probabilityExport: "estimateCountProbability",
  version: "1.0.0",
  implementationDigest: IMPLEMENTATION_DIGEST
});
const PROMOTION_POLICY = Object.freeze({
  minimumSettledPredictions: 500,
  minimumBucketObservations: 100,
  minimumSettlementCoverage: 0.95,
  maximumExpectedCalibrationError: 0.03,
  minimumCalibrationSlope: 0.8,
  maximumCalibrationSlope: 1.2,
  maximumAbsoluteCalibrationIntercept: 0.05,
  requireNoMaterialBaselineDegradation: true,
  requireNonNegativeClosingLineValueInterval: true,
  reliabilityBucketBoundaries: RELIABILITY_BUCKET_BOUNDARIES,
  requiredBaseline: REQUIRED_BASELINE,
  requiredUncertaintyMethod: "percentile_bootstrap",
  minimumBootstrapResamples: 2000,
  minimumConfidenceLevel: 0.95
});
const POLICY_DIGEST = contentDigest(PROMOTION_POLICY);
const BASE_EVALUATION = Object.freeze({
  predictionCount: 600,
  settledCount: 570,
  settledObservationSetDigest: SETTLED_OBSERVATION_SET_DIGEST,
  settlementCoverage: 0.95,
  expectedCalibrationError: 0.03,
  brierScore: 0.2,
  logLoss: 0.6,
  calibration: Object.freeze({
    slope: 0.8,
    intercept: 0.05,
    reliability: Object.freeze([
      Object.freeze({ lower: 0, upper: 0.2, count: 100 }),
      Object.freeze({ lower: 0.2, upper: 0.4, count: 100 }),
      Object.freeze({ lower: 0.4, upper: 0.6, count: 100 }),
      Object.freeze({ lower: 0.6, upper: 0.8, count: 100 }),
      Object.freeze({ lower: 0.8, upper: 1, count: 170 })
    ])
  }),
  baseline: Object.freeze({
    baselineId: "no_vig_market",
    method: "two_way_proportional_normalization",
    methodVersion: "1.0.0",
    marketFamily: "pitcher_strikeouts",
    marketDataDigest: MARKET_DATA_DIGEST,
    matchedPredictionCount: 570,
    settledObservationSetDigest: SETTLED_OBSERVATION_SET_DIGEST,
    brierScore: 0.21,
    logLoss: 0.61,
    brierScoreDegradationInterval: Object.freeze({ lower: -0.01, upper: 0 }),
    logLossDegradationInterval: Object.freeze({ lower: -0.01, upper: 0 })
  }),
  closingLineValue: Object.freeze({
    mean: 0.01,
    interval: Object.freeze({ lower: 0, upper: 0.02 })
  }),
  roi: Object.freeze({
    mean: 0.02,
    interval: Object.freeze({ lower: 0.01, upper: 0.03 })
  }),
  uncertainty: Object.freeze({
    method: "percentile_bootstrap",
    confidenceLevel: 0.95,
    resamples: 2000,
    seed: 271828,
    intervals: Object.freeze({
      brierScore: Object.freeze({ lower: 0.19, upper: 0.21 }),
      logLoss: Object.freeze({ lower: 0.58, upper: 0.62 }),
      expectedCalibrationError: Object.freeze({ lower: 0.02, upper: 0.04 }),
      calibrationSlope: Object.freeze({ lower: 0.75, upper: 1.25 }),
      calibrationIntercept: Object.freeze({ lower: -0.06, upper: 0.06 })
    })
  }),
  byLineRange: Object.freeze([
    Object.freeze({ key: "all", count: 570, brierScore: 0.2, logLoss: 0.6, roi: 0.02 })
  ]),
  byParticipantRole: Object.freeze([
    Object.freeze({ key: "all", count: 570, brierScore: 0.2, logLoss: 0.6, roi: 0.02 })
  ]),
  byContext: Object.freeze([
    Object.freeze({ key: "all", count: 570, brierScore: 0.2, logLoss: 0.6, roi: 0.02 })
  ])
});

function completeReliability(reliability, expectedCalibrationError) {
  const total = reliability.reduce((sum, bucket) => sum + bucket.count, 0);
  const gapPerBucket = expectedCalibrationError / reliability.length;

  return reliability.map((bucket) => {
    const meanProbability = (bucket.lower + bucket.upper) / 2;
    const absoluteGap = gapPerBucket * total / bucket.count;

    return {
      ...bucket,
      meanProbability,
      observedRate: meanProbability - absoluteGap,
      weightedAbsoluteGap: gapPerBucket
    };
  });
}

/**
 * @param {Record<string, any>} [overrides]
 * @returns {Record<string, any>}
 */
function calibrationReport(overrides = {}) {
  const {
    dataQuality: dataQualityOverrides = {},
    evaluation: evaluationOverrides = {},
    identity: identityOverrides = {},
    policy: policyOverrides = {},
    promotion: promotionOverride,
    reportDigest: ignoredReportDigest,
    ...topLevelOverrides
  } = overrides;
  void ignoredReportDigest;
  const expectedCalibrationError = evaluationOverrides.expectedCalibrationError
    ?? BASE_EVALUATION.expectedCalibrationError;
  const reliability = evaluationOverrides.calibration?.reliability
    ?? BASE_EVALUATION.calibration.reliability.map((bucket) => ({ ...bucket }));
  const reportWithoutPromotion = {
    schemaVersion: "1.0.0",
    reportId: "calibration-report-001",
    identity: {
      modelId: "poisson_count_v1",
      modelVersion: "1.0.0",
      marketFamily: "pitcher_strikeouts",
      featureSet: [...MODEL_FEATURE_SET],
      dataSources: [...MODEL_DATA_SOURCES],
      trainingCutoff: TRAINING_CUTOFF,
      calculationImplementation: structuredClone(MODEL_IMPLEMENTATION),
      ...identityOverrides
    },
    policy: {
      policyVersion: "1.0.0",
      policyDigest: POLICY_DIGEST,
      registeredAt: POLICY_REGISTERED_AT,
      ...policyOverrides
    },
    evaluationStartedAt: EVALUATION_STARTED_AT,
    evaluation: {
      ...BASE_EVALUATION,
      ...evaluationOverrides,
      calibration: {
        ...BASE_EVALUATION.calibration,
        ...(evaluationOverrides.calibration ?? {}),
        reliability: completeReliability(reliability, expectedCalibrationError)
      },
      baseline: {
        ...BASE_EVALUATION.baseline,
        marketFamily: identityOverrides.marketFamily ?? "pitcher_strikeouts",
        matchedPredictionCount: evaluationOverrides.settledCount
          ?? BASE_EVALUATION.settledCount,
        settledObservationSetDigest: evaluationOverrides.settledObservationSetDigest
          ?? BASE_EVALUATION.settledObservationSetDigest,
        ...(evaluationOverrides.baseline ?? {}),
        brierScoreDegradationInterval: {
          ...BASE_EVALUATION.baseline.brierScoreDegradationInterval,
          ...(evaluationOverrides.baseline?.brierScoreDegradationInterval ?? {})
        },
        logLossDegradationInterval: {
          ...BASE_EVALUATION.baseline.logLossDegradationInterval,
          ...(evaluationOverrides.baseline?.logLossDegradationInterval ?? {})
        }
      },
      closingLineValue: {
        ...BASE_EVALUATION.closingLineValue,
        ...(evaluationOverrides.closingLineValue ?? {}),
        interval: {
          ...BASE_EVALUATION.closingLineValue.interval,
          ...(evaluationOverrides.closingLineValue?.interval ?? {})
        }
      },
      roi: {
        ...BASE_EVALUATION.roi,
        ...(evaluationOverrides.roi ?? {}),
        interval: {
          ...BASE_EVALUATION.roi.interval,
          ...(evaluationOverrides.roi?.interval ?? {})
        }
      },
      uncertainty: {
        ...BASE_EVALUATION.uncertainty,
        ...(evaluationOverrides.uncertainty ?? {}),
        intervals: {
          ...BASE_EVALUATION.uncertainty.intervals,
          ...(evaluationOverrides.uncertainty?.intervals ?? {})
        }
      }
    },
    dataQuality: {
      invalidRows: [],
      excludedRows: [],
      leakageFindings: [],
      blockers: [],
      ...dataQualityOverrides
    },
    ...topLevelOverrides,
    dataset: {
      manifestDigest: MANIFEST_DIGEST,
      datasetDigest: DATASET_DIGEST,
      sourceDigests: [SOURCE_DIGEST],
      sources: [
        {
          sourceIdentifier: "official_mlb_statsapi:fixture-001",
          capturedAt: SOURCE_CAPTURED_AT,
          contentDigest: SOURCE_DIGEST
        }
      ],
      splitCutoffs: {
        training: "2026-06-01T12:00:00.000Z",
        calibration: "2026-06-15T12:00:00.000Z",
        evaluation: "2026-07-01T12:00:00.000Z"
      },
      chronological: true,
      outOfSample: true,
      ...(topLevelOverrides.dataset ?? {})
    }
  };
  const unsigned = {
    ...reportWithoutPromotion,
    promotion: promotionOverride
      ?? evaluatePromotion(reportWithoutPromotion, PROMOTION_POLICY)
  };

  return {
    ...unsigned,
    reportDigest: contentDigest(unsigned)
  };
}

/**
 * @param {Array<Record<string, any>>} [models]
 * @param {Record<string, any>} [overrides]
 * @returns {Record<string, any>}
 */
function registry(models = [], overrides = {}) {
  return {
    schemaVersion: "1.0.0",
    policyVersion: "1.0.0",
    policyRegisteredAt: POLICY_REGISTERED_AT,
    policyDigest: POLICY_DIGEST,
    promotionPolicy: { ...PROMOTION_POLICY },
    models,
    ...overrides
  };
}

/**
 * @param {string} modelStatus
 * @param {Record<string, any>} [overrides]
 * @returns {Record<string, any>}
 */
function modelEntry(modelStatus = "research_only", overrides = {}) {
  return {
    modelId: "poisson_count_v1",
    modelVersion: "1.0.0",
    marketFamily: "pitcher_strikeouts",
    featureSet: [...MODEL_FEATURE_SET],
    dataSources: [...MODEL_DATA_SOURCES],
    trainingCutoff: null,
    calculationImplementation: {
      ...structuredClone(MODEL_IMPLEMENTATION),
      implementationDigest: modelStatus === "research_only"
        ? null
        : IMPLEMENTATION_DIGEST
    },
    modelStatus,
    calibrationReportId: null,
    calibrationReportDigest: null,
    ...overrides
  };
}

/**
 * @param {Record<string, any>} value
 * @returns {string}
 */
function writeRegistry(value) {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), "bear-edge-registry-"));
  const registryPath = path.join(directory, "registry.json");
  fs.writeFileSync(registryPath, `${JSON.stringify(value, null, 2)}\n`, "utf8");
  return registryPath;
}

function resignReport(report) {
  const copy = structuredClone(report);
  delete copy.reportDigest;

  return {
    ...copy,
    reportDigest: contentDigest(copy)
  };
}

function modelWithEvidence(modelStatus, report, overrides = {}) {
  return modelEntry(modelStatus, {
    featureSet: [...report.identity.featureSet],
    dataSources: [...report.identity.dataSources],
    trainingCutoff: report.identity.trainingCutoff,
    calculationImplementation: structuredClone(
      report.identity.calculationImplementation
    ),
    calibrationReportId: report.reportId,
    calibrationReportDigest: report.reportDigest,
    promotionPolicyVersion: "1.0.0",
    promotionPolicyDigest: POLICY_DIGEST,
    ...(modelStatus === "validated"
      ? { promotedAt: "2026-07-17T14:00:00.000Z" }
      : {}),
    ...overrides
  });
}

function checkById(result, id) {
  const check = result.checks.find((candidate) => candidate.id === id);
  assert.ok(check, `Missing promotion check: ${id}`);
  return check;
}

test("evaluatePromotion passes exact inclusive promotion boundaries", () => {
  const result = evaluatePromotion(calibrationReport(), PROMOTION_POLICY);
  const settledCountBoundary = evaluatePromotion(calibrationReport({
    evaluation: {
      predictionCount: 500,
      settledCount: 500,
      settlementCoverage: 1,
      calibration: {
        reliability: [
          { lower: 0, upper: 0.2, count: 100 },
          { lower: 0.2, upper: 0.4, count: 100 },
          { lower: 0.4, upper: 0.6, count: 100 },
          { lower: 0.6, upper: 0.8, count: 100 },
          { lower: 0.8, upper: 1, count: 100 }
        ]
      }
    }
  }), PROMOTION_POLICY);

  assert.equal(result.passed, true);
  assert.equal(settledCountBoundary.passed, true);
  assert.equal(result.checks.length, 10);
  for (const check of result.checks) {
    assert.equal(check.passed, true, check.id);
  }
  assert.equal(checkById(settledCountBoundary, "minimumSettledPredictions").actual, 500);
  assert.equal(checkById(result, "minimumBucketObservations").actual, 100);
  assert.equal(checkById(result, "minimumSettlementCoverage").actual, 0.95);
  assert.equal(checkById(result, "maximumExpectedCalibrationError").actual, 0.03);
  assert.equal(checkById(result, "calibrationSlopeRange").actual, 0.8);
  assert.equal(checkById(result, "maximumAbsoluteCalibrationIntercept").actual, 0.05);
  assert.equal(checkById(result, "nonNegativeClosingLineValueInterval").actual, 0);
});

test("evaluatePromotion accepts the inclusive upper slope and negative intercept boundaries", () => {
  const result = evaluatePromotion(calibrationReport({
    evaluation: {
      calibration: {
        slope: 1.2,
        intercept: -0.05
      }
    }
  }), PROMOTION_POLICY);

  assert.equal(result.passed, true);
  assert.equal(checkById(result, "calibrationSlopeRange").passed, true);
  assert.equal(checkById(result, "maximumAbsoluteCalibrationIntercept").passed, true);
});

const FAILING_PROMOTION_CASES = [
  {
    name: "settled predictions below minimum",
    checkId: "minimumSettledPredictions",
    overrides: {
      evaluation: {
        predictionCount: 499,
        settledCount: 499,
        settlementCoverage: 1,
        calibration: {
          reliability: [{ lower: 0, upper: 1, count: 499 }]
        }
      }
    }
  },
  {
    name: "one reliability bucket below minimum",
    checkId: "minimumBucketObservations",
    overrides: {
      evaluation: {
        calibration: {
          reliability: [
            { lower: 0, upper: 0.2, count: 99 },
            { lower: 0.2, upper: 0.4, count: 100 },
            { lower: 0.4, upper: 0.6, count: 100 },
            { lower: 0.6, upper: 0.8, count: 100 },
            { lower: 0.8, upper: 1, count: 171 }
          ]
        }
      }
    }
  },
  {
    name: "settlement coverage below minimum",
    checkId: "minimumSettlementCoverage",
    overrides: {
      evaluation: {
        predictionCount: 1000000,
        settledCount: 949999,
        settlementCoverage: 0.949999,
        calibration: {
          reliability: [
            { lower: 0, upper: 0.2, count: 100 },
            { lower: 0.2, upper: 0.4, count: 100 },
            { lower: 0.4, upper: 0.6, count: 100 },
            { lower: 0.6, upper: 0.8, count: 100 },
            { lower: 0.8, upper: 1, count: 949599 }
          ]
        }
      }
    }
  },
  {
    name: "expected calibration error above maximum",
    checkId: "maximumExpectedCalibrationError",
    overrides: { evaluation: { expectedCalibrationError: 0.030001 } }
  },
  {
    name: "calibration slope below minimum",
    checkId: "calibrationSlopeRange",
    overrides: { evaluation: { calibration: { slope: 0.799999 } } }
  },
  {
    name: "calibration slope above maximum",
    checkId: "calibrationSlopeRange",
    overrides: { evaluation: { calibration: { slope: 1.200001 } } }
  },
  {
    name: "positive calibration intercept above absolute maximum",
    checkId: "maximumAbsoluteCalibrationIntercept",
    overrides: { evaluation: { calibration: { intercept: 0.050001 } } }
  },
  {
    name: "negative calibration intercept above absolute maximum",
    checkId: "maximumAbsoluteCalibrationIntercept",
    overrides: { evaluation: { calibration: { intercept: -0.050001 } } }
  },
  {
    name: "material Brier-score baseline degradation",
    checkId: "noMaterialBaselineDegradation",
    overrides: {
      evaluation: {
        baseline: {
          brierScoreDegradationInterval: { upper: 0.000001 }
        }
      }
    }
  },
  {
    name: "material log-loss baseline degradation",
    checkId: "noMaterialBaselineDegradation",
    overrides: {
      evaluation: {
        baseline: {
          logLossDegradationInterval: { upper: 0.000001 }
        }
      }
    }
  },
  {
    name: "negative closing-line-value confidence bound",
    checkId: "nonNegativeClosingLineValueInterval",
    overrides: {
      evaluation: {
        closingLineValue: { interval: { lower: -0.000001 } }
      }
    }
  },
  {
    name: "unresolved data-quality blocker",
    checkId: "noUnresolvedDataQualityFindings",
    overrides: {
      dataQuality: {
        blockers: [{
          code: "DATA_LEAKAGE",
          count: 1,
          disposition: "unresolved",
          detail: "A post-prediction feature remains in the evaluation set."
        }]
      }
    }
  },
  {
    name: "unresolved leakage finding without a duplicate blocker",
    checkId: "noUnresolvedDataQualityFindings",
    overrides: {
      dataQuality: {
        leakageFindings: [{
          code: "DUPLICATE_OBSERVATION",
          count: 2,
          disposition: "unresolved",
          detail: "Two evaluation rows share the same observation identity."
        }]
      }
    }
  }
];

for (const fixture of FAILING_PROMOTION_CASES) {
  test(`evaluatePromotion fails when ${fixture.name}`, () => {
    const result = evaluatePromotion(calibrationReport(fixture.overrides), PROMOTION_POLICY);

    assert.equal(result.passed, false);
    assert.equal(checkById(result, fixture.checkId).passed, false);
  });
}

test("evaluatePromotion fails closed for missing and non-finite report evidence", () => {
  const missingBuckets = evaluatePromotion(calibrationReport({
    evaluation: { calibration: { reliability: [] } }
  }), PROMOTION_POLICY);
  const nonFiniteReport = calibrationReport();
  nonFiniteReport.evaluation.expectedCalibrationError = Number.NaN;
  const nonFiniteMetric = evaluatePromotion(nonFiniteReport, PROMOTION_POLICY);
  const missingReport = evaluatePromotion({}, PROMOTION_POLICY);

  assert.equal(missingBuckets.passed, false);
  assert.equal(checkById(missingBuckets, "minimumBucketObservations").passed, false);
  assert.equal(nonFiniteMetric.passed, false);
  assert.equal(checkById(nonFiniteMetric, "maximumExpectedCalibrationError").passed, false);
  assert.equal(missingReport.passed, false);
  assert.equal(missingReport.checks.every((check) => check.passed === false), true);
});

test("evaluatePromotion rejects contradictory coverage and reliability counts", () => {
  const wrongCoverage = evaluatePromotion(calibrationReport({
    evaluation: { settlementCoverage: 0.99 }
  }), PROMOTION_POLICY);
  const wrongBucketTotal = evaluatePromotion(calibrationReport({
    evaluation: {
      calibration: {
        reliability: [
          { lower: 0, upper: 0.5, count: 285 },
          { lower: 0.5, upper: 1, count: 284 }
        ]
      }
    }
  }), PROMOTION_POLICY);

  assert.equal(wrongCoverage.passed, false);
  assert.equal(checkById(wrongCoverage, "minimumSettlementCoverage").passed, false);
  assert.equal(wrongBucketTotal.passed, false);
  assert.equal(checkById(wrongBucketTotal, "minimumBucketObservations").passed, false);
});

test("evaluatePromotion rejects a report-selected single reliability bucket", () => {
  const result = evaluatePromotion(calibrationReport({
    evaluation: {
      calibration: {
        reliability: [{ lower: 0, upper: 1, count: 570 }]
      }
    }
  }), PROMOTION_POLICY);

  assert.equal(result.passed, false);
  assert.equal(checkById(result, "minimumBucketObservations").passed, false);
});

test("evaluatePromotion requires the registered matching no-vig baseline", () => {
  const arbitraryBaseline = evaluatePromotion(calibrationReport({
    evaluation: {
      baseline: { baselineId: "easy_internal_baseline" }
    }
  }), PROMOTION_POLICY);
  const wrongMarket = evaluatePromotion(calibrationReport({
    evaluation: {
      baseline: { marketFamily: "batter_hits" }
    }
  }), PROMOTION_POLICY);
  const wrongObservationSet = evaluatePromotion(calibrationReport({
    evaluation: {
      baseline: { settledObservationSetDigest: "b".repeat(64) }
    }
  }), PROMOTION_POLICY);

  assert.equal(arbitraryBaseline.passed, false);
  assert.equal(
    checkById(arbitraryBaseline, "noMaterialBaselineDegradation").passed,
    false
  );
  assert.equal(wrongMarket.passed, false);
  assert.equal(checkById(wrongMarket, "noMaterialBaselineDegradation").passed, false);
  assert.equal(wrongObservationSet.passed, false);
  assert.equal(
    checkById(wrongObservationSet, "noMaterialBaselineDegradation").passed,
    false
  );
});

test("evaluatePromotion accepts explicitly resolved and excluded quality findings", () => {
  const result = evaluatePromotion(calibrationReport({
    dataQuality: {
      invalidRows: [{
        code: "INVALID_PROBABILITY",
        count: 1,
        disposition: "excluded",
        detail: "The malformed row was removed before splitting."
      }],
      excludedRows: [{
        code: "MISSING_SETTLEMENT",
        count: 3,
        disposition: "excluded",
        detail: "Unsettled rows are excluded from settled-metric calculations."
      }],
      leakageFindings: [{
        code: "DUPLICATE_OBSERVATION",
        count: 2,
        disposition: "resolved",
        detail: "The duplicate rows were deduplicated before splitting."
      }]
    }
  }), PROMOTION_POLICY);

  assert.equal(result.passed, true);
  assert.equal(
    checkById(result, "noUnresolvedDataQualityFindings").passed,
    true
  );
});

test("evaluatePromotion passes values on the favorable side of every boundary", () => {
  const result = evaluatePromotion(calibrationReport({
    evaluation: {
      predictionCount: 1000000,
      settledCount: 950001,
      settlementCoverage: 0.950001,
      expectedCalibrationError: 0.029999,
      calibration: {
        slope: 1,
        intercept: 0,
        reliability: [
          { lower: 0, upper: 0.2, count: 101 },
          { lower: 0.2, upper: 0.4, count: 101 },
          { lower: 0.4, upper: 0.6, count: 101 },
          { lower: 0.6, upper: 0.8, count: 101 },
          { lower: 0.8, upper: 1, count: 949597 }
        ]
      },
      baseline: {
        brierScoreDegradationInterval: { lower: -0.02, upper: -0.000001 },
        logLossDegradationInterval: { lower: -0.02, upper: -0.000001 }
      },
      closingLineValue: {
        interval: { lower: 0.000001, upper: 0.02 }
      }
    }
  }), PROMOTION_POLICY);

  assert.equal(result.passed, true);
  for (const check of result.checks) {
    assert.equal(check.passed, true, check.id);
  }
});

test("evaluatePromotion requires policy registration strictly before evaluation start", () => {
  const equalTimestamp = evaluatePromotion(calibrationReport({
    evaluationStartedAt: POLICY_REGISTERED_AT
  }), PROMOTION_POLICY);
  const lateRegistration = evaluatePromotion(calibrationReport({
    policy: { registeredAt: "2026-07-17T13:00:00.001Z" },
    evaluationStartedAt: EVALUATION_STARTED_AT
  }), PROMOTION_POLICY);
  const relabeledEvaluationStart = evaluatePromotion(calibrationReport({
    evaluationStartedAt: "2026-07-02T12:00:00.000Z"
  }), PROMOTION_POLICY);

  assert.equal(equalTimestamp.passed, false);
  assert.equal(checkById(equalTimestamp, "policyRegisteredBeforeEvaluation").passed, false);
  assert.equal(lateRegistration.passed, false);
  assert.equal(checkById(lateRegistration, "policyRegisteredBeforeEvaluation").passed, false);
  assert.equal(relabeledEvaluationStart.passed, false);
  assert.equal(
    checkById(relabeledEvaluationStart, "policyRegisteredBeforeEvaluation").passed,
    false
  );
});

test("evaluatePromotion rejects malformed promotion policies", () => {
  assert.throws(
    () => evaluatePromotion(calibrationReport(), {
      ...PROMOTION_POLICY,
      minimumSettledPredictions: 0
    }),
    /minimumSettledPredictions/
  );
  assert.throws(
    () => evaluatePromotion(calibrationReport(), {
      ...PROMOTION_POLICY,
      requireNoMaterialBaselineDegradation: "yes"
    }),
    /requireNoMaterialBaselineDegradation/
  );
  assert.throws(
    () => evaluatePromotion(calibrationReport(), {
      ...PROMOTION_POLICY,
      minimumCalibrationSlope: 1.3,
      maximumCalibrationSlope: 1.2
    }),
    /calibration slope/
  );
  assert.throws(
    () => evaluatePromotion(calibrationReport(), {
      ...PROMOTION_POLICY,
      reliabilityBucketBoundaries: [0, 1]
    }),
    /reliabilityBucketBoundaries.*five buckets/
  );
  assert.throws(
    () => evaluatePromotion(calibrationReport(), {
      ...PROMOTION_POLICY,
      requiredBaseline: {
        ...REQUIRED_BASELINE,
        baselineId: ""
      }
    }),
    /requiredBaseline\.baselineId/
  );
  assert.throws(
    () => evaluatePromotion(calibrationReport(), {
      ...PROMOTION_POLICY,
      minimumBootstrapResamples: 999
    }),
    /minimumBootstrapResamples.*1000/
  );
});

test("loadModelRegistry loads a valid research-only registry", () => {
  const registryPath = writeRegistry(registry([modelEntry()]));
  const loaded = loadModelRegistry({ registryPath });

  assert.equal(loaded.schemaVersion, "1.0.0");
  assert.equal(loaded.policyVersion, "1.0.0");
  assert.equal(loaded.policyDigest, POLICY_DIGEST);
  assert.deepEqual(loaded.models, [modelEntry()]);
});

test("resolveModelStatus performs an exact three-part key lookup", () => {
  const registryPath = writeRegistry(registry([modelEntry()]));

  assert.deepEqual(
    resolveModelStatus(
      "poisson_count_v1",
      "1.0.0",
      "pitcher_strikeouts",
      { registryPath }
    ),
    modelEntry()
  );
  assert.equal(
    resolveModelStatus(
      "poisson_count_v1",
      "1.0.0",
      "batter_hits",
      { registryPath }
    ),
    null
  );
});

test("loadModelRegistry rejects duplicate model-version-market keys", () => {
  const registryPath = writeRegistry(registry([
    modelEntry(),
    modelEntry("retired")
  ]));

  assert.throws(
    () => loadModelRegistry({ registryPath }),
    /duplicate.*poisson_count_v1.*1\.0\.0.*pitcher_strikeouts/i
  );
});

test("loadModelRegistry rejects unsupported model statuses", () => {
  const registryPath = writeRegistry(registry([modelEntry("production")]));

  assert.throws(
    () => loadModelRegistry({ registryPath }),
    /modelStatus.*research_only.*shadow.*validated.*retired/
  );
});

test("loadModelRegistry verifies the registered policy digest", () => {
  const registryPath = writeRegistry(registry([modelEntry()], {
    policyDigest: "b".repeat(64)
  }));

  assert.throws(
    () => loadModelRegistry({ registryPath }),
    /policyDigest.*promotionPolicy/i
  );
});

test("loadModelRegistry rejects unknown registry and model fields", () => {
  assert.throws(
    () => loadModelRegistry({
      registryPath: writeRegistry(registry([modelEntry()], { surprise: true }))
    }),
    /unsupported registry field.*surprise/i
  );
  assert.throws(
    () => loadModelRegistry({
      registryPath: writeRegistry(registry([modelEntry("research_only", {
        calibrationStatus: "validated"
      })]))
    }),
    /unsupported model field.*calibrationStatus/i
  );
});

test("loadModelRegistry requires explicit model provenance", () => {
  for (const field of [
    "featureSet",
    "dataSources",
    "trainingCutoff",
    "calculationImplementation"
  ]) {
    const model = modelEntry();
    delete model[field];

    assert.throws(
      () => loadModelRegistry({
        registryPath: writeRegistry(registry([model]))
      }),
      new RegExp(field)
    );
  }
});

test("loadModelRegistry blocks promotion without a training cutoff", () => {
  const report = calibrationReport();
  const validated = modelWithEvidence("validated", report, {
    trainingCutoff: null
  });

  assert.throws(
    () => loadModelRegistry({
      registryPath: writeRegistry(registry([validated])),
      reportsById: { [report.reportId]: report }
    }),
    /trainingCutoff/
  );
});

test("loadModelRegistry blocks promotion without an implementation digest", () => {
  const report = calibrationReport();
  const validated = modelWithEvidence("validated", report, {
    calculationImplementation: {
      ...structuredClone(report.identity.calculationImplementation),
      implementationDigest: null
    }
  });

  assert.throws(
    () => loadModelRegistry({
      registryPath: writeRegistry(registry([validated])),
      reportsById: { [report.reportId]: report }
    }),
    /implementationDigest/
  );
});

test("loadModelRegistry detects implementation code drift", () => {
  const report = calibrationReport();
  const validated = modelWithEvidence("validated", report, {
    calculationImplementation: {
      ...structuredClone(report.identity.calculationImplementation),
      implementationDigest: "b".repeat(64)
    }
  });

  assert.throws(
    () => loadModelRegistry({
      registryPath: writeRegistry(registry([validated])),
      reportsById: { [report.reportId]: report }
    }),
    /implementationDigest.*declared implementation modules/
  );
});

for (const modelStatus of ["shadow", "validated", "retired"]) {
  test(`loadModelRegistry requires report identity and digest for ${modelStatus} models`, () => {
    const registryPath = writeRegistry(registry([modelEntry(modelStatus)]));

    assert.throws(
      () => loadModelRegistry({ registryPath }),
      /calibrationReportId/
    );
    assert.throws(
      () => loadModelRegistry({
        registryPath: writeRegistry(registry([modelEntry(modelStatus, {
          calibrationReportId: "calibration-report-001",
          calibrationReportDigest: "not-a-digest"
        })]))
      }),
      /calibrationReportDigest/
    );
  });
}

for (const modelStatus of ["shadow", "validated", "retired"]) {
  test(`loadModelRegistry requires complete policy binding for ${modelStatus} models`, () => {
    const report = calibrationReport();
    const withoutPolicyBinding = modelEntry(modelStatus, {
      trainingCutoff: TRAINING_CUTOFF,
      calibrationReportId: report.reportId,
      calibrationReportDigest: report.reportDigest,
      ...(modelStatus === "validated"
        ? { promotedAt: "2026-07-17T14:00:00.000Z" }
        : {})
    });

    assert.throws(
      () => loadModelRegistry({
        registryPath: writeRegistry(registry([withoutPolicyBinding])),
        reportsById: { [report.reportId]: report }
      }),
      /promotionPolicyVersion/
    );
    assert.throws(
      () => loadModelRegistry({
        registryPath: writeRegistry(registry([modelEntry(modelStatus, {
          ...withoutPolicyBinding,
          promotionPolicyVersion: "1.0.0"
        })])),
        reportsById: { [report.reportId]: report }
      }),
      /promotionPolicyDigest/
    );
  });
}

test("loadModelRegistry accepts a validated model only with passing immutable evidence", () => {
  const report = calibrationReport();
  const validated = modelWithEvidence("validated", report);
  const registryPath = writeRegistry(registry([validated]));
  const loaded = loadModelRegistry({
    registryPath,
    reportsById: { [report.reportId]: report }
  });

  assert.deepEqual(loaded.models, [validated]);
});

const INCOMPLETE_REPORT_CASES = [
  {
    name: "Brier score",
    pattern: /brierScore/,
    mutate(report) {
      delete report.evaluation.brierScore;
    }
  },
  {
    name: "logarithmic loss",
    pattern: /logLoss/,
    mutate(report) {
      delete report.evaluation.logLoss;
    }
  },
  {
    name: "line-range performance",
    pattern: /byLineRange/,
    mutate(report) {
      report.evaluation.byLineRange = [];
    }
  },
  {
    name: "participant-role performance",
    pattern: /byParticipantRole/,
    mutate(report) {
      report.evaluation.byParticipantRole = [];
    }
  },
  {
    name: "context performance",
    pattern: /byContext/,
    mutate(report) {
      report.evaluation.byContext = [];
    }
  },
  {
    name: "closing-line-value mean",
    pattern: /closingLineValue\.mean/,
    mutate(report) {
      delete report.evaluation.closingLineValue.mean;
    }
  },
  {
    name: "return-on-investment interval",
    pattern: /evaluation\.roi/,
    mutate(report) {
      delete report.evaluation.roi;
    }
  },
  {
    name: "core-metric uncertainty intervals",
    pattern: /evaluation\.uncertainty/,
    mutate(report) {
      delete report.evaluation.uncertainty;
    }
  },
  {
    name: "dataset digest",
    pattern: /dataset\.datasetDigest/,
    mutate(report) {
      delete report.dataset.datasetDigest;
    }
  },
  {
    name: "source lineage",
    pattern: /dataset\.sources/,
    mutate(report) {
      delete report.dataset.sources;
    }
  },
  {
    name: "out-of-sample declaration",
    pattern: /dataset\.outOfSample/,
    mutate(report) {
      report.dataset.outOfSample = false;
    }
  },
  {
    name: "data-quality leakage inventory",
    pattern: /dataQuality\.leakageFindings/,
    mutate(report) {
      report.dataQuality.leakageFindings = null;
    }
  },
  {
    name: "recomputed promotion result",
    pattern: /report\.promotion/,
    mutate(report) {
      delete report.promotion;
    }
  }
];

for (const fixture of INCOMPLETE_REPORT_CASES) {
  test(`loadModelRegistry rejects a signed report missing ${fixture.name}`, () => {
    const draft = calibrationReport();
    fixture.mutate(draft);
    const report = resignReport(draft);
    const validated = modelWithEvidence("validated", report);

    assert.throws(
      () => loadModelRegistry({
        registryPath: writeRegistry(registry([validated])),
        reportsById: { [report.reportId]: report }
      }),
      fixture.pattern
    );
  });
}

const INCONSISTENT_REPORT_CASES = [
  {
    name: "closing-line mean outside its interval",
    pattern: /closingLineValue.*interval/,
    mutate(report) {
      report.evaluation.closingLineValue.mean = 0.03;
    }
  },
  {
    name: "expected calibration error inconsistent with reliability buckets",
    pattern: /expectedCalibrationError.*reliability/,
    mutate(report) {
      report.evaluation.expectedCalibrationError = 0.02;
    }
  },
  {
    name: "baseline delta outside its registered interval",
    pattern: /baseline.*brierScore/i,
    mutate(report) {
      report.evaluation.baseline.brierScore = 0.1;
    }
  },
  {
    name: "nonchronological dataset cutoffs",
    pattern: /splitCutoffs.*chronological/,
    mutate(report) {
      report.dataset.splitCutoffs.calibration = report.dataset.splitCutoffs.training;
    }
  },
  {
    name: "evaluation start relabeled after the dataset cutoff",
    pattern: /evaluationStartedAt.*splitCutoffs\.evaluation/,
    mutate(report) {
      report.evaluationStartedAt = "2026-07-02T12:00:00.000Z";
    }
  },
  {
    name: "arbitrary comparison baseline",
    pattern: /baseline.*registered no-vig/i,
    mutate(report) {
      report.evaluation.baseline.baselineId = "easy_internal_baseline";
    }
  },
  {
    name: "baseline observation set different from the evaluated set",
    pattern: /baseline.*settledObservationSetDigest/i,
    mutate(report) {
      report.evaluation.baseline.settledObservationSetDigest = "b".repeat(64);
    }
  },
  {
    name: "source lineage digest absent from the dataset inventory",
    pattern: /dataset\.sources.*sourceDigests/i,
    mutate(report) {
      report.dataset.sources[0].contentDigest = "b".repeat(64);
    }
  },
  {
    name: "source lineage with an invalid capture timestamp",
    pattern: /dataset\.sources\[0\]\.capturedAt/,
    mutate(report) {
      report.dataset.sources[0].capturedAt = "not-a-timestamp";
    }
  },
  {
    name: "Brier score outside its uncertainty interval",
    pattern: /uncertainty.*brierScore/i,
    mutate(report) {
      report.evaluation.uncertainty.intervals.brierScore = {
        lower: 0.1,
        upper: 0.15
      };
    }
  },
  {
    name: "stored promotion checks different from recomputation",
    pattern: /report\.promotion.*recomputed/,
    mutate(report) {
      report.promotion.passed = false;
    }
  }
];

for (const fixture of INCONSISTENT_REPORT_CASES) {
  test(`loadModelRegistry rejects ${fixture.name}`, () => {
    const draft = calibrationReport();
    fixture.mutate(draft);
    const report = resignReport(draft);
    const validated = modelWithEvidence("validated", report);

    assert.throws(
      () => loadModelRegistry({
        registryPath: writeRegistry(registry([validated])),
        reportsById: { [report.reportId]: report }
      }),
      fixture.pattern
    );
  });
}

test("loadModelRegistry rejects non-numeric required report metrics", () => {
  const draft = calibrationReport();
  draft.evaluation.brierScore = "0.2";
  const report = resignReport(draft);
  const validated = modelWithEvidence("validated", report);

  assert.throws(
    () => loadModelRegistry({
      registryPath: writeRegistry(registry([validated])),
      reportsById: { [report.reportId]: report }
    }),
    /brierScore.*finite number/
  );
});

test("loadModelRegistry verifies shadow report content without requiring promotion", () => {
  const report = calibrationReport({
    evaluation: {
      predictionCount: 499,
      settledCount: 499,
      settlementCoverage: 1,
      calibration: {
        reliability: [
          { lower: 0, upper: 0.2, count: 80 },
          { lower: 0.2, upper: 0.4, count: 80 },
          { lower: 0.4, upper: 0.6, count: 80 },
          { lower: 0.6, upper: 0.8, count: 80 },
          { lower: 0.8, upper: 1, count: 179 }
        ]
      }
    }
  });
  const shadow = modelWithEvidence("shadow", report);

  assert.equal(report.promotion.passed, false);
  assert.deepEqual(
    loadModelRegistry({
      registryPath: writeRegistry(registry([shadow])),
      reportsById: { [report.reportId]: report }
    }).models,
    [shadow]
  );
});

test("loadModelRegistry rejects missing and tuple-mismatched shadow reports", () => {
  const report = calibrationReport();
  const shadow = modelWithEvidence("shadow", report);

  assert.throws(
    () => loadModelRegistry({
      registryPath: writeRegistry(registry([shadow]))
    }),
    /report.*calibration-report-001.*required/i
  );

  const wrongTupleReport = calibrationReport({
    identity: { marketFamily: "batter_hits" }
  });
  const wrongTupleShadow = modelWithEvidence("shadow", wrongTupleReport, {
    marketFamily: "pitcher_strikeouts"
  });
  assert.throws(
    () => loadModelRegistry({
      registryPath: writeRegistry(registry([wrongTupleShadow])),
      reportsById: { [wrongTupleReport.reportId]: wrongTupleReport }
    }),
    /marketFamily.*pitcher_strikeouts.*batter_hits/i
  );
});

test("loadModelRegistry rejects validated models with missing or mismatched reports", () => {
  const report = calibrationReport();
  const validated = modelEntry("validated", {
    trainingCutoff: TRAINING_CUTOFF,
    calibrationReportId: report.reportId,
    calibrationReportDigest: report.reportDigest,
    promotionPolicyVersion: "1.0.0",
    promotionPolicyDigest: POLICY_DIGEST,
    promotedAt: "2026-07-17T14:00:00.000Z"
  });
  const registryPath = writeRegistry(registry([validated]));

  assert.throws(
    () => loadModelRegistry({ registryPath }),
    /report.*calibration-report-001.*required/i
  );
  assert.throws(
    () => loadModelRegistry({
      registryPath,
      reportsById: {
        [report.reportId]: {
          ...report,
          reportDigest: "b".repeat(64)
        }
      }
    }),
    /report digest/i
  );
});

test("loadModelRegistry detects report content changed without a new digest", () => {
  const report = calibrationReport();
  const validated = modelEntry("validated", {
    trainingCutoff: TRAINING_CUTOFF,
    calibrationReportId: report.reportId,
    calibrationReportDigest: report.reportDigest,
    promotionPolicyVersion: "1.0.0",
    promotionPolicyDigest: POLICY_DIGEST,
    promotedAt: "2026-07-17T14:00:00.000Z"
  });
  const registryPath = writeRegistry(registry([validated]));
  const tampered = {
    ...report,
    evaluation: {
      ...report.evaluation,
      settledCount: 999999
    }
  };

  assert.throws(
    () => loadModelRegistry({
      registryPath,
      reportsById: { [report.reportId]: tampered }
    }),
    /report digest/i
  );
});

test("loadModelRegistry rejects a correctly signed report that fails promotion", () => {
  const report = calibrationReport({
    evaluation: {
      predictionCount: 499,
      settledCount: 499,
      settlementCoverage: 1,
      calibration: {
        reliability: [
          { lower: 0, upper: 0.2, count: 80 },
          { lower: 0.2, upper: 0.4, count: 80 },
          { lower: 0.4, upper: 0.6, count: 80 },
          { lower: 0.6, upper: 0.8, count: 80 },
          { lower: 0.8, upper: 1, count: 179 }
        ]
      }
    }
  });
  const validated = modelEntry("validated", {
    trainingCutoff: TRAINING_CUTOFF,
    calibrationReportId: report.reportId,
    calibrationReportDigest: report.reportDigest,
    promotionPolicyVersion: "1.0.0",
    promotionPolicyDigest: POLICY_DIGEST,
    promotedAt: "2026-07-17T14:00:00.000Z"
  });
  const registryPath = writeRegistry(registry([validated]));

  assert.throws(
    () => loadModelRegistry({
      registryPath,
      reportsById: { [report.reportId]: report }
    }),
    /minimumSettledPredictions/
  );
});

test("loadModelRegistry rejects a signed unresolved leakage finding even without blockers", () => {
  const report = calibrationReport({
    dataQuality: {
      leakageFindings: [{
        code: "POST_PREDICTION_FEATURE",
        count: 4,
        disposition: "unresolved",
        detail: "Four rows contain a feature timestamped after prediction."
      }]
    }
  });
  const validated = modelWithEvidence("validated", report);

  assert.equal(report.dataQuality.blockers.length, 0);
  assert.equal(report.promotion.passed, false);
  assert.throws(
    () => loadModelRegistry({
      registryPath: writeRegistry(registry([validated])),
      reportsById: { [report.reportId]: report }
    }),
    /noUnresolvedDataQualityFindings/
  );
});

test("loadModelRegistry rejects policy-version and registration-time mismatches", () => {
  const wrongPolicyVersion = calibrationReport({
    policy: { policyVersion: "0.9.0" }
  });
  const wrongRegistrationTime = calibrationReport({
    policy: { registeredAt: "2026-07-17T12:00:00.001Z" }
  });
  const wrongPolicyDigest = calibrationReport({
    policy: { policyDigest: "b".repeat(64) }
  });

  for (const report of [wrongPolicyVersion, wrongRegistrationTime, wrongPolicyDigest]) {
    const validated = modelEntry("validated", {
      trainingCutoff: TRAINING_CUTOFF,
      calibrationReportId: report.reportId,
      calibrationReportDigest: report.reportDigest,
      promotionPolicyVersion: "1.0.0",
      promotionPolicyDigest: POLICY_DIGEST,
      promotedAt: "2026-07-17T14:00:00.000Z"
    });
    const registryPath = writeRegistry(registry([validated]));

    assert.throws(
      () => loadModelRegistry({
        registryPath,
        reportsById: { [report.reportId]: report }
      }),
      /policy/i
    );
  }
});

test("loadModelRegistry rejects a report bound to a different model tuple", () => {
  const report = calibrationReport({
    identity: { marketFamily: "batter_hits" }
  });
  const validated = modelEntry("validated", {
    trainingCutoff: TRAINING_CUTOFF,
    calibrationReportId: report.reportId,
    calibrationReportDigest: report.reportDigest,
    promotionPolicyVersion: "1.0.0",
    promotionPolicyDigest: POLICY_DIGEST,
    promotedAt: "2026-07-17T14:00:00.000Z"
  });
  const registryPath = writeRegistry(registry([validated]));

  assert.throws(
    () => loadModelRegistry({
      registryPath,
      reportsById: { [report.reportId]: report }
    }),
    /marketFamily.*pitcher_strikeouts.*batter_hits/i
  );
});

test("loadModelRegistry rejects a report bound to different model provenance", () => {
  const report = calibrationReport();
  const validated = modelWithEvidence("validated", report, {
    featureSet: [...report.identity.featureSet, "opponent_handedness"].sort()
  });

  assert.throws(
    () => loadModelRegistry({
      registryPath: writeRegistry(registry([validated])),
      reportsById: { [report.reportId]: report }
    }),
    /report identity.*featureSet.*registered model provenance/i
  );
});

test("loadModelRegistry accepts retired models only with immutable report evidence", () => {
  const report = calibrationReport({
    evaluation: {
      predictionCount: 499,
      settledCount: 499,
      settlementCoverage: 1,
      calibration: {
        reliability: [
          { lower: 0, upper: 0.2, count: 80 },
          { lower: 0.2, upper: 0.4, count: 80 },
          { lower: 0.4, upper: 0.6, count: 80 },
          { lower: 0.6, upper: 0.8, count: 80 },
          { lower: 0.8, upper: 1, count: 179 }
        ]
      }
    }
  });
  const retired = modelWithEvidence("retired", report);

  assert.equal(report.promotion.passed, false);
  assert.deepEqual(
    loadModelRegistry({
      registryPath: writeRegistry(registry([retired])),
      reportsById: { [report.reportId]: report }
    }).models,
    [retired]
  );
});

test("tracked registry keeps all existing MLB Poisson models research-only", () => {
  const loaded = loadModelRegistry();
  const poissonModels = loaded.models.filter((model) => model.modelId === "poisson_count_v1");
  const expectedMarketFamilies = [
    "batter_hits",
    "batter_runs_scored",
    "batter_total_bases",
    "pitcher_strikeouts"
  ];

  assert.deepEqual(
    poissonModels.map((model) => model.marketFamily).sort(),
    expectedMarketFamilies
  );
  assert.equal(loaded.policyDigest, contentDigest(loaded.promotionPolicy));
  for (const model of poissonModels) {
    assert.equal(model.modelId, "poisson_count_v1");
    assert.equal(model.modelVersion, "1.0.0");
    assert.equal(model.modelStatus, "research_only");
    assert.deepEqual(model.featureSet, [...MODEL_FEATURE_SET]);
    assert.ok(model.dataSources.includes("official_mlb_statsapi_player_stats"));
    assert.ok(model.dataSources.includes("official_mlb_statsapi_schedule"));
    assert.equal(model.trainingCutoff, null);
    assert.deepEqual(
      model.calculationImplementation,
      {
        ...structuredClone(MODEL_IMPLEMENTATION),
        implementationDigest: null
      }
    );
    assert.equal(model.calibrationReportId, null);
    assert.equal(model.calibrationReportDigest, null);
    assert.equal(Object.hasOwn(model, "promotedAt"), false);
  }

  const pitcherStrikeoutCandidate = loaded.models.find(
    (model) => model.modelId === "negative_binomial_pitcher_strikeouts_v1"
  );
  assert.equal(pitcherStrikeoutCandidate.marketFamily, "pitcher_strikeouts");
  assert.equal(pitcherStrikeoutCandidate.modelVersion, "1.0.0");
  assert.equal(pitcherStrikeoutCandidate.modelStatus, "research_only");
  assert.equal(pitcherStrikeoutCandidate.trainingCutoff, null);
  assert.equal(pitcherStrikeoutCandidate.calibrationReportId, null);
  assert.match(
    pitcherStrikeoutCandidate.calculationImplementation.implementationDigest,
    /^[a-f0-9]{64}$/
  );
});

test("portable package includes the model and operations assets", () => {
  const packageJson = JSON.parse(fs.readFileSync(
    path.join(__dirname, "..", "package.json"),
    "utf8"
  ));

  assert.ok(packageJson.files.includes("models/**/*.json"));
  assert.ok(packageJson.files.includes(".env.example"));
  assert.ok(packageJson.files.includes("docs/ELITE_AUDIT_OPERATIONS.md"));
  assert.ok(packageJson.files.includes("supabase/migrations/**/*.sql"));
});
