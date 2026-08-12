const { americanToDecimal } = require("../odds-math.js");

const CLV_DIRECTIONS = Object.freeze([
  "BETTER_THAN_CLOSE",
  "AT_CLOSE",
  "WORSE_THAN_CLOSE"
]);
const SETTLED_OUTCOMES = Object.freeze(["win", "loss", "push", "void"]);
const ISO_UTC_PATTERN = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{3})?Z$/;
const EXECUTION_CALIBRATION_SCHEMA_VERSION = "1.1.0";
const EVIDENCE_CHECK_IDS = Object.freeze([
  "minimumSettledPredictions",
  "minimumDistinctEvents",
  "registeredSplitMethod",
  "minimumBucketObservations",
  "minimumSettlementCoverage",
  "policyRegisteredBeforeEvaluation"
]);
const CALIBRATION_CHECK_IDS = Object.freeze([
  "maximumExpectedCalibrationError",
  "calibrationSlopeRange",
  "maximumAbsoluteCalibrationIntercept"
]);

function assertAmericanOdds(value, label) {
  if (typeof value !== "number" || !Number.isFinite(value)) {
    throw new TypeError(`${label} must be a finite number.`);
  }
  if (value === 0) {
    throw new RangeError(`${label} cannot be 0.`);
  }
}

function timestampMilliseconds(value, label) {
  if (
    typeof value !== "string"
    || !ISO_UTC_PATTERN.test(value)
    || !Number.isFinite(Date.parse(value))
  ) {
    throw new TypeError(`${label} must be a valid ISO-8601 UTC timestamp.`);
  }

  return Date.parse(value);
}

function calculateExecutionClv({
  priceTakenAmerican,
  closingPriceAmerican
}) {
  assertAmericanOdds(priceTakenAmerican, "priceTakenAmerican");
  assertAmericanOdds(closingPriceAmerican, "closingPriceAmerican");

  const priceTakenDecimal = americanToDecimal(priceTakenAmerican);
  const closingPriceDecimal = americanToDecimal(closingPriceAmerican);
  const value = priceTakenDecimal / closingPriceDecimal - 1;

  return {
    status: "RATED",
    value,
    direction: value > 0
      ? "BETTER_THAN_CLOSE"
      : value < 0
        ? "WORSE_THAN_CLOSE"
        : "AT_CLOSE",
    priceTakenDecimal,
    closingPriceDecimal,
    reasonCodes: []
  };
}

function calculateExecutionTiming({
  betPlacedAt,
  eventStartTime
}) {
  const betPlacedAtMs = timestampMilliseconds(betPlacedAt, "betPlacedAt");
  const eventStartTimeMs = timestampMilliseconds(eventStartTime, "eventStartTime");
  const leadTimeSeconds = (eventStartTimeMs - betPlacedAtMs) / 1000;

  return {
    status: "RATED",
    leadTimeSeconds,
    leadTimeMinutes: leadTimeSeconds / 60,
    phase: leadTimeSeconds > 0
      ? "PREGAME"
      : leadTimeSeconds < 0
        ? "LIVE_OR_POST_START"
        : "AT_EVENT_START",
    reasonCodes: []
  };
}

function unratedCalibration(reasonCode, inputs, report) {
  const identity = inputs.identity ?? {};
  return {
    status: "UNRATED",
    evidenceAssessment: reasonCode,
    policyAssessment: "NOT_ASSESSED",
    reasonCodes: [reasonCode],
    exactCohort: {
      modelId: identity.modelId,
      modelVersion: identity.modelVersion,
      marketFamily: identity.marketFamily,
      probabilityBucket: null
    },
    evidence: report === null || report === undefined
      ? null
      : {
          predictionCount: report.evaluation?.predictionCount ?? null,
          settledCount: report.evaluation?.settledCount ?? null,
          distinctEventCount: report.evaluation?.distinctEventCount ?? null,
          settlementCoverage: report.evaluation?.settlementCoverage ?? null,
          settledObservationSetDigest:
            report.evaluation?.settledObservationSetDigest ?? null,
          evidenceCutoffAt: report.dataset?.evidenceCutoffAt ?? null,
          requirementsSatisfied: false
        },
    metrics: null,
    broaderContext: []
  };
}

function reportCheckMap(report) {
  if (!Array.isArray(report?.promotion?.checks)) {
    return null;
  }
  return new Map(report.promotion.checks.map((check) => [check?.id, check]));
}

function matchingProbabilityBucket(reliability, probability) {
  if (!Array.isArray(reliability)) {
    return null;
  }

  return reliability.find((bucket, index) => (
    bucket !== null
    && typeof bucket === "object"
    && typeof bucket.lower === "number"
    && typeof bucket.upper === "number"
    && probability >= bucket.lower
    && (
      probability < bucket.upper
      || (index === reliability.length - 1 && probability === bucket.upper)
    )
  )) ?? null;
}

function finiteCalibrationEvidence(report, bucket) {
  const evaluation = report?.evaluation;
  const calibration = evaluation?.calibration;
  const intervals = evaluation?.uncertainty?.intervals;
  const values = [
    evaluation?.brierScore,
    evaluation?.logLoss,
    evaluation?.expectedCalibrationError,
    calibration?.slope,
    calibration?.intercept,
    bucket?.count,
    bucket?.meanProbability,
    bucket?.observedRate
  ];
  const intervalNames = [
    "brierScore",
    "logLoss",
    "expectedCalibrationError",
    "calibrationSlope",
    "calibrationIntercept"
  ];

  return (
    calibration?.converged === true
    && values.every((value) => typeof value === "number" && Number.isFinite(value))
    && intervalNames.every((name) => (
      typeof intervals?.[name]?.lower === "number"
      && Number.isFinite(intervals[name].lower)
      && typeof intervals[name].upper === "number"
      && Number.isFinite(intervals[name].upper)
    ))
  );
}

function resolveExecutionCalibration(inputs) {
  const {
    identity,
    probability,
    betPlacedAt,
    report
  } = inputs;
  const { modelId, modelVersion, marketFamily } = identity ?? {};
  for (const [label, value] of Object.entries({ modelId, modelVersion, marketFamily })) {
    if (typeof value !== "string" || value.length === 0 || value !== value.trim()) {
      throw new TypeError(`${label} must be a non-empty trimmed string.`);
    }
  }
  if (
    typeof probability !== "number"
    || !Number.isFinite(probability)
    || probability < 0
    || probability > 1
  ) {
    throw new RangeError("probability must be between 0 and 1.");
  }
  const betPlacedAtMs = timestampMilliseconds(betPlacedAt, "betPlacedAt");

  if (report === null || report === undefined) {
    return unratedCalibration("NO_EXACT_COHORT_REPORT", inputs, report);
  }
  if (
    (identity.calibrationReportId !== undefined
      && report.reportId !== identity.calibrationReportId)
    || (identity.calibrationReportDigest !== undefined
      && report.reportDigest !== identity.calibrationReportDigest)
  ) {
    return unratedCalibration("REPORT_LINEAGE_MISMATCH", inputs, report);
  }
  if (report?.schemaVersion !== EXECUTION_CALIBRATION_SCHEMA_VERSION) {
    return unratedCalibration("REPORT_LACKS_EVIDENCE_CUTOFF", inputs, report);
  }
  if (
    report?.identity?.modelId !== modelId
    || report?.identity?.modelVersion !== modelVersion
    || report?.identity?.marketFamily !== marketFamily
  ) {
    return unratedCalibration("EXACT_COHORT_MISMATCH", inputs, report);
  }

  let evidenceCutoffAtMs;
  try {
    evidenceCutoffAtMs = timestampMilliseconds(
      report.dataset?.evidenceCutoffAt,
      "report.dataset.evidenceCutoffAt"
    );
  } catch {
    return unratedCalibration("REPORT_LACKS_EVIDENCE_CUTOFF", inputs, report);
  }
  if (evidenceCutoffAtMs > betPlacedAtMs) {
    return unratedCalibration("EVIDENCE_NOT_AVAILABLE_AT_BET_TIME", inputs, report);
  }

  const checks = reportCheckMap(report);
  if (
    checks === null
    || EVIDENCE_CHECK_IDS.some((id) => checks.get(id)?.passed !== true)
  ) {
    return unratedCalibration("INSUFFICIENT_EXACT_COHORT_EVIDENCE", inputs, report);
  }

  const bucket = matchingProbabilityBucket(
    report.evaluation?.calibration?.reliability,
    probability
  );
  if (!finiteCalibrationEvidence(report, bucket)) {
    return unratedCalibration("INVALID_EXACT_COHORT_REPORT", inputs, report);
  }
  if (CALIBRATION_CHECK_IDS.some((id) => !checks.has(id))) {
    return unratedCalibration("INVALID_EXACT_COHORT_REPORT", inputs, report);
  }

  const evaluation = report.evaluation;
  const calibration = evaluation.calibration;
  const uncertainty = evaluation.uncertainty;
  const policyPassed = CALIBRATION_CHECK_IDS.every(
    (id) => checks.get(id).passed === true
  );

  return {
    status: "RATED",
    evidenceAssessment: "SUFFICIENT_EXACT_COHORT_EVIDENCE",
    policyAssessment: policyPassed
      ? "WITHIN_REGISTERED_CALIBRATION_BOUNDS"
      : "OUTSIDE_REGISTERED_CALIBRATION_BOUNDS",
    reasonCodes: [],
    exactCohort: {
      modelId,
      modelVersion,
      marketFamily,
      probabilityBucket: {
        lower: bucket.lower,
        upper: bucket.upper
      }
    },
    evidence: {
      predictionCount: evaluation.predictionCount,
      settledCount: evaluation.settledCount,
      distinctEventCount: evaluation.distinctEventCount,
      settlementCoverage: evaluation.settlementCoverage,
      settledObservationSetDigest: evaluation.settledObservationSetDigest,
      evidenceCutoffAt: report.dataset.evidenceCutoffAt,
      requirementsSatisfied: true
    },
    metrics: {
      brierScore: evaluation.brierScore,
      logLoss: evaluation.logLoss,
      expectedCalibrationError: evaluation.expectedCalibrationError,
      calibrationSlope: calibration.slope,
      calibrationIntercept: calibration.intercept,
      reliabilityBucket: structuredClone(bucket),
      uncertainty: {
        method: uncertainty.method,
        confidenceLevel: uncertainty.confidenceLevel,
        resamples: uncertainty.resamples,
        clusterUnit: uncertainty.clusterUnit,
        intervals: {
          brierScore: { ...uncertainty.intervals.brierScore },
          logLoss: { ...uncertainty.intervals.logLoss },
          expectedCalibrationError: {
            ...uncertainty.intervals.expectedCalibrationError
          },
          calibrationSlope: { ...uncertainty.intervals.calibrationSlope },
          calibrationIntercept: {
            ...uncertainty.intervals.calibrationIntercept
          }
        },
      }
    },
    broaderContext: []
  };
}

function classifyExecutionOutcome({
  clvDirection,
  outcome
}) {
  if (!CLV_DIRECTIONS.includes(clvDirection)) {
    throw new TypeError(`clvDirection must be one of: ${CLV_DIRECTIONS.join(", ")}.`);
  }
  if (!SETTLED_OUTCOMES.includes(outcome)) {
    throw new TypeError(`outcome must be one of: ${SETTLED_OUTCOMES.join(", ")}.`);
  }

  const priceLabel = {
    BETTER_THAN_CLOSE: "GOOD_PRICE",
    AT_CLOSE: "NEUTRAL_PRICE",
    WORSE_THAN_CLOSE: "BAD_PRICE"
  }[clvDirection];
  const resultLabel = {
    win: "GOOD_RESULT",
    loss: "BAD_RESULT",
    push: "PUSH",
    void: "VOID"
  }[outcome];

  return {
    result: outcome.toUpperCase(),
    clvOutcomePattern: `${priceLabel}_${resultLabel}`
  };
}

module.exports = {
  CLV_DIRECTIONS,
  SETTLED_OUTCOMES,
  calculateExecutionClv,
  calculateExecutionTiming,
  classifyExecutionOutcome,
  resolveExecutionCalibration
};
