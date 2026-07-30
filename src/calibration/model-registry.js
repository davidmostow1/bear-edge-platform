const fs = require("node:fs");
const path = require("node:path");

const { contentDigest } = require("../audit/canonical-json.js");

const REGISTRY_SCHEMA_VERSION = "1.0.0";
const REPORT_SCHEMA_VERSION = "1.0.0";
const MODEL_STATUSES = Object.freeze([
  "research_only",
  "shadow",
  "validated",
  "retired"
]);
const DIGEST_PATTERN = /^[a-f0-9]{64}$/;
const ISO_UTC_PATTERN = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{3})?Z$/;
const PACKAGE_ROOT = path.resolve(__dirname, "../..");
const DEFAULT_REGISTRY_PATH = path.join(PACKAGE_ROOT, "models/registry.json");
const REGISTRY_FIELDS = new Set([
  "schemaVersion",
  "policyVersion",
  "policyRegisteredAt",
  "policyDigest",
  "promotionPolicy",
  "models"
]);
const POLICY_FIELDS = new Set([
  "minimumSettledPredictions",
  "minimumBucketObservations",
  "minimumSettlementCoverage",
  "maximumExpectedCalibrationError",
  "minimumCalibrationSlope",
  "maximumCalibrationSlope",
  "maximumAbsoluteCalibrationIntercept",
  "requireNoMaterialBaselineDegradation",
  "requireNonNegativeClosingLineValueInterval",
  "reliabilityBucketBoundaries",
  "requiredBaseline",
  "requiredUncertaintyMethod",
  "minimumBootstrapResamples",
  "minimumConfidenceLevel"
]);
const REQUIRED_BASELINE_FIELDS = new Set([
  "baselineId",
  "method",
  "methodVersion"
]);
const MODEL_FIELDS = new Set([
  "modelId",
  "modelVersion",
  "marketFamily",
  "featureSet",
  "dataSources",
  "trainingCutoff",
  "calculationImplementation",
  "modelStatus",
  "calibrationReportId",
  "calibrationReportDigest",
  "promotionPolicyVersion",
  "promotionPolicyDigest",
  "promotedAt"
]);
const CALCULATION_IMPLEMENTATION_FIELDS = new Set([
  "modules",
  "probabilityExport",
  "version",
  "implementationDigest"
]);
const DATASET_SOURCE_FIELDS = new Set([
  "sourceIdentifier",
  "capturedAt",
  "contentDigest"
]);
const DATA_QUALITY_FIELDS = new Set([
  "invalidRows",
  "excludedRows",
  "leakageFindings",
  "blockers"
]);
const DATA_QUALITY_FINDING_FIELDS = new Set([
  "code",
  "count",
  "disposition",
  "detail"
]);
const DATA_QUALITY_DISPOSITIONS = new Set([
  "resolved",
  "excluded",
  "unresolved"
]);
const CORE_UNCERTAINTY_METRICS = Object.freeze([
  "brierScore",
  "logLoss",
  "expectedCalibrationError",
  "calibrationSlope",
  "calibrationIntercept"
]);
const NON_RESEARCH_STATUSES = new Set(["shadow", "validated", "retired"]);

function isPlainObject(value) {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function hasOwn(object, property) {
  return Object.prototype.hasOwnProperty.call(object, property);
}

function validIdentity(value) {
  return (
    typeof value === "string"
    && value.length > 0
    && value === value.trim()
  );
}

function finiteNumber(value) {
  return typeof value === "number" && Number.isFinite(value);
}

function finiteInteger(value) {
  return finiteNumber(value) && Number.isInteger(value);
}

function timestampMilliseconds(value) {
  if (typeof value !== "string" || !ISO_UTC_PATTERN.test(value)) {
    return null;
  }

  const milliseconds = Date.parse(value);
  if (!Number.isFinite(milliseconds)) {
    return null;
  }

  const canonical = value.includes(".")
    ? value
    : value.replace("Z", ".000Z");

  return new Date(milliseconds).toISOString() === canonical
    ? milliseconds
    : null;
}

function assertSupportedFields(value, supported, label) {
  for (const field of Object.keys(value)) {
    if (!supported.has(field)) {
      throw new TypeError(`Unsupported ${label} field: ${field}`);
    }
  }
}

function assertDigest(value, field) {
  if (typeof value !== "string" || !DIGEST_PATTERN.test(value)) {
    throw new TypeError(`${field} must be a 64-character lowercase SHA-256 digest.`);
  }
}

function assertTimestamp(value, field) {
  if (timestampMilliseconds(value) === null) {
    throw new TypeError(`${field} must be a valid ISO-8601 UTC timestamp.`);
  }
}

function assertIdentityArray(value, field) {
  if (!Array.isArray(value) || value.length === 0) {
    throw new TypeError(`${field} must be a non-empty array.`);
  }

  const seen = new Set();
  for (let index = 0; index < value.length; index += 1) {
    if (!validIdentity(value[index])) {
      throw new TypeError(`${field}[${index}] must be a non-empty trimmed string.`);
    }
    if (seen.has(value[index])) {
      throw new TypeError(`${field} must not contain duplicate entries.`);
    }
    seen.add(value[index]);
  }

  const sorted = [...value].sort();
  if (value.some((entry, index) => entry !== sorted[index])) {
    throw new TypeError(`${field} must be sorted for deterministic identity.`);
  }
}

function validateRequiredBaseline(value) {
  if (!isPlainObject(value)) {
    throw new TypeError("promotionPolicy.requiredBaseline must be an object.");
  }
  assertSupportedFields(value, REQUIRED_BASELINE_FIELDS, "required baseline");

  for (const field of REQUIRED_BASELINE_FIELDS) {
    if (!validIdentity(value[field])) {
      throw new TypeError(
        `promotionPolicy.requiredBaseline.${field} must be a non-empty trimmed string.`
      );
    }
  }
}

function validatePromotionPolicy(policy) {
  if (!isPlainObject(policy)) {
    throw new TypeError("promotionPolicy must be an object.");
  }

  assertSupportedFields(policy, POLICY_FIELDS, "promotion policy");

  for (const field of POLICY_FIELDS) {
    if (!hasOwn(policy, field)) {
      throw new TypeError(`promotionPolicy.${field} is required.`);
    }
  }

  for (const field of ["minimumSettledPredictions", "minimumBucketObservations"]) {
    if (!finiteInteger(policy[field]) || policy[field] < 1) {
      throw new TypeError(`promotionPolicy.${field} must be a positive integer.`);
    }
  }

  if (
    !finiteNumber(policy.minimumSettlementCoverage)
    || policy.minimumSettlementCoverage < 0
    || policy.minimumSettlementCoverage > 1
  ) {
    throw new TypeError(
      "promotionPolicy.minimumSettlementCoverage must be between zero and one."
    );
  }

  if (
    !finiteNumber(policy.maximumExpectedCalibrationError)
    || policy.maximumExpectedCalibrationError < 0
    || policy.maximumExpectedCalibrationError > 1
  ) {
    throw new TypeError(
      "promotionPolicy.maximumExpectedCalibrationError must be between zero and one."
    );
  }

  if (
    !finiteNumber(policy.minimumCalibrationSlope)
    || !finiteNumber(policy.maximumCalibrationSlope)
    || policy.minimumCalibrationSlope > policy.maximumCalibrationSlope
  ) {
    throw new TypeError(
      "Promotion policy calibration slope minimum must not exceed its maximum."
    );
  }

  if (
    !finiteNumber(policy.maximumAbsoluteCalibrationIntercept)
    || policy.maximumAbsoluteCalibrationIntercept < 0
  ) {
    throw new TypeError(
      "promotionPolicy.maximumAbsoluteCalibrationIntercept must be a non-negative number."
    );
  }

  for (const field of [
    "requireNoMaterialBaselineDegradation",
    "requireNonNegativeClosingLineValueInterval"
  ]) {
    if (typeof policy[field] !== "boolean") {
      throw new TypeError(`promotionPolicy.${field} must be a boolean.`);
    }
  }

  const boundaries = policy.reliabilityBucketBoundaries;
  if (!Array.isArray(boundaries) || boundaries.length < 6) {
    throw new TypeError(
      "promotionPolicy.reliabilityBucketBoundaries must define at least five buckets."
    );
  }
  for (let index = 0; index < boundaries.length; index += 1) {
    if (!finiteNumber(boundaries[index]) || boundaries[index] < 0 || boundaries[index] > 1) {
      throw new TypeError(
        "promotionPolicy.reliabilityBucketBoundaries must contain finite values from zero through one."
      );
    }
    if (index > 0 && boundaries[index] <= boundaries[index - 1]) {
      throw new TypeError(
        "promotionPolicy.reliabilityBucketBoundaries must be strictly increasing."
      );
    }
  }
  if (boundaries[0] !== 0 || boundaries.at(-1) !== 1) {
    throw new TypeError(
      "promotionPolicy.reliabilityBucketBoundaries must start at zero and end at one."
    );
  }

  validateRequiredBaseline(policy.requiredBaseline);

  if (!validIdentity(policy.requiredUncertaintyMethod)) {
    throw new TypeError(
      "promotionPolicy.requiredUncertaintyMethod must be a non-empty trimmed string."
    );
  }
  if (
    !finiteInteger(policy.minimumBootstrapResamples)
    || policy.minimumBootstrapResamples < 1000
  ) {
    throw new TypeError(
      "promotionPolicy.minimumBootstrapResamples must be an integer of at least 1000."
    );
  }
  if (
    !finiteNumber(policy.minimumConfidenceLevel)
    || policy.minimumConfidenceLevel <= 0
    || policy.minimumConfidenceLevel >= 1
  ) {
    throw new TypeError(
      "promotionPolicy.minimumConfidenceLevel must be greater than zero and less than one."
    );
  }
}

function finiteInterval(value) {
  return (
    isPlainObject(value)
    && finiteNumber(value.lower)
    && finiteNumber(value.upper)
    && value.lower <= value.upper
  );
}

function nullableFinite(value) {
  return finiteNumber(value) ? value : null;
}

function matchesReliabilityBoundaries(reliability, boundaries) {
  if (
    !Array.isArray(reliability)
    || reliability.length !== boundaries.length - 1
  ) {
    return false;
  }

  return reliability.every((bucket, index) => (
    isPlainObject(bucket)
    && finiteNumber(bucket.lower)
    && finiteNumber(bucket.upper)
    && Math.abs(bucket.lower - boundaries[index]) <= 1e-12
    && Math.abs(bucket.upper - boundaries[index + 1]) <= 1e-12
  ));
}

function dataQualityDispositionAllowed(collection, disposition) {
  if (!DATA_QUALITY_DISPOSITIONS.has(disposition)) {
    return false;
  }
  if (collection === "blockers") {
    return disposition === "unresolved";
  }
  if (collection === "excludedRows") {
    return disposition === "excluded";
  }
  return true;
}

function validDataQualityFinding(finding, collection) {
  return (
    isPlainObject(finding)
    && Object.keys(finding).length === DATA_QUALITY_FINDING_FIELDS.size
    && [...DATA_QUALITY_FINDING_FIELDS].every((field) => hasOwn(finding, field))
    && validIdentity(finding.code)
    && finiteInteger(finding.count)
    && finding.count >= 1
    && dataQualityDispositionAllowed(collection, finding.disposition)
    && validIdentity(finding.detail)
  );
}

function summarizeDataQuality(dataQuality) {
  if (
    !isPlainObject(dataQuality)
    || Object.keys(dataQuality).some((field) => !DATA_QUALITY_FIELDS.has(field))
  ) {
    return { valid: false, unresolvedCount: null };
  }

  let unresolvedCount = 0;
  for (const collection of DATA_QUALITY_FIELDS) {
    const findings = dataQuality[collection];
    if (!Array.isArray(findings)) {
      return { valid: false, unresolvedCount: null };
    }
    for (const finding of findings) {
      if (!validDataQualityFinding(finding, collection)) {
        return { valid: false, unresolvedCount: null };
      }
      if (finding.disposition === "unresolved") {
        unresolvedCount += finding.count;
      }
    }
  }

  return { valid: true, unresolvedCount };
}

/**
 * @param {Record<string, any>} report
 * @param {Record<string, any>} policy
 * @returns {{ passed: boolean, checks: Array<Record<string, any>> }}
 */
function evaluatePromotion(report, policy) {
  validatePromotionPolicy(policy);

  const source = isPlainObject(report) ? report : {};
  const evaluation = isPlainObject(source.evaluation) ? source.evaluation : {};
  const calibration = isPlainObject(evaluation.calibration)
    ? evaluation.calibration
    : {};
  const reliability = Array.isArray(calibration.reliability)
    ? calibration.reliability
    : [];
  const bucketPartitionMatches = matchesReliabilityBoundaries(
    reliability,
    policy.reliabilityBucketBoundaries
  );
  const bucketCounts = reliability.map((bucket) =>
    isPlainObject(bucket) && finiteInteger(bucket.count) && bucket.count >= 0
      ? bucket.count
      : null
  );
  const minimumBucketObservations = (
    bucketPartitionMatches
    && bucketCounts.length > 0
    && bucketCounts.every((count) => count !== null)
  )
    ? Math.min(...bucketCounts)
    : null;
  const reliabilityObservationCount = minimumBucketObservations === null
    ? null
    : bucketCounts.reduce((sum, count) => sum + count, 0);
  const baseline = isPlainObject(evaluation.baseline) ? evaluation.baseline : {};
  const brierDegradation = baseline.brierScoreDegradationInterval;
  const logLossDegradation = baseline.logLossDegradationInterval;
  const baselineIntervalsValid = (
    finiteInterval(brierDegradation)
    && finiteInterval(logLossDegradation)
  );
  const reportIdentity = isPlainObject(source.identity) ? source.identity : {};
  const requiredBaseline = policy.requiredBaseline;
  const baselineIdentityMatches = (
    baseline.baselineId === requiredBaseline.baselineId
    && baseline.method === requiredBaseline.method
    && baseline.methodVersion === requiredBaseline.methodVersion
    && baseline.marketFamily === reportIdentity.marketFamily
    && baseline.matchedPredictionCount === evaluation.settledCount
    && typeof baseline.marketDataDigest === "string"
    && DIGEST_PATTERN.test(baseline.marketDataDigest)
    && typeof evaluation.settledObservationSetDigest === "string"
    && DIGEST_PATTERN.test(evaluation.settledObservationSetDigest)
    && baseline.settledObservationSetDigest === evaluation.settledObservationSetDigest
  );
  const baselinePassed = !policy.requireNoMaterialBaselineDegradation || (
    baselineIdentityMatches
    && baselineIntervalsValid
    && brierDegradation.upper <= 0
    && logLossDegradation.upper <= 0
  );
  const closingLineValue = isPlainObject(evaluation.closingLineValue)
    ? evaluation.closingLineValue
    : {};
  const closingLineValueInterval = closingLineValue.interval;
  const closingLineValuePassed = !policy.requireNonNegativeClosingLineValueInterval || (
    finiteInterval(closingLineValueInterval)
    && closingLineValueInterval.lower >= 0
  );
  const dataQuality = isPlainObject(source.dataQuality) ? source.dataQuality : {};
  const dataQualitySummary = summarizeDataQuality(dataQuality);
  const policyMetadata = isPlainObject(source.policy) ? source.policy : {};
  const policyRegisteredAt = timestampMilliseconds(policyMetadata.registeredAt);
  const evaluationStartedAt = timestampMilliseconds(source.evaluationStartedAt);
  const datasetEvaluationStartedAt = timestampMilliseconds(
    source.dataset?.splitCutoffs?.evaluation
  );
  const registrationPassed = (
    policyRegisteredAt !== null
    && evaluationStartedAt !== null
    && datasetEvaluationStartedAt !== null
    && evaluationStartedAt === datasetEvaluationStartedAt
    && policyRegisteredAt < evaluationStartedAt
  );
  const predictionCount = finiteInteger(evaluation.predictionCount)
    ? evaluation.predictionCount
    : null;
  const settledCount = finiteInteger(evaluation.settledCount)
    ? evaluation.settledCount
    : null;
  const reportedSettlementCoverage = nullableFinite(evaluation.settlementCoverage);
  const countsAreConsistent = (
    predictionCount !== null
    && predictionCount > 0
    && settledCount !== null
    && settledCount >= 0
    && settledCount <= predictionCount
  );
  const derivedSettlementCoverage = countsAreConsistent
    ? settledCount / predictionCount
    : null;
  const settlementCoverageIsConsistent = (
    derivedSettlementCoverage !== null
    && reportedSettlementCoverage !== null
    && Math.abs(derivedSettlementCoverage - reportedSettlementCoverage) <= 1e-12
  );
  const expectedCalibrationError = nullableFinite(evaluation.expectedCalibrationError);
  const calibrationSlope = nullableFinite(calibration.slope);
  const calibrationIntercept = nullableFinite(calibration.intercept);

  const checks = [
    {
      id: "minimumSettledPredictions",
      passed: (
        countsAreConsistent
        && settledCount >= policy.minimumSettledPredictions
      ),
      actual: settledCount,
      operator: ">=",
      threshold: policy.minimumSettledPredictions,
      evidencePath: "evaluation.settledCount"
    },
    {
      id: "minimumBucketObservations",
      passed: (
        minimumBucketObservations !== null
        && minimumBucketObservations >= policy.minimumBucketObservations
        && reliabilityObservationCount === settledCount
      ),
      actual: minimumBucketObservations,
      operator: ">=",
      threshold: policy.minimumBucketObservations,
      evidencePath: "evaluation.calibration.reliability[].count"
    },
    {
      id: "minimumSettlementCoverage",
      passed: (
        settlementCoverageIsConsistent
        && derivedSettlementCoverage >= policy.minimumSettlementCoverage
      ),
      actual: derivedSettlementCoverage,
      operator: ">=",
      threshold: policy.minimumSettlementCoverage,
      evidencePath: "evaluation.settlementCoverage"
    },
    {
      id: "maximumExpectedCalibrationError",
      passed: (
        expectedCalibrationError !== null
        && expectedCalibrationError >= 0
        && expectedCalibrationError <= policy.maximumExpectedCalibrationError
      ),
      actual: expectedCalibrationError,
      operator: "<=",
      threshold: policy.maximumExpectedCalibrationError,
      evidencePath: "evaluation.expectedCalibrationError"
    },
    {
      id: "calibrationSlopeRange",
      passed: (
        calibrationSlope !== null
        && calibrationSlope >= policy.minimumCalibrationSlope
        && calibrationSlope <= policy.maximumCalibrationSlope
      ),
      actual: calibrationSlope,
      operator: "between_inclusive",
      threshold: {
        minimum: policy.minimumCalibrationSlope,
        maximum: policy.maximumCalibrationSlope
      },
      evidencePath: "evaluation.calibration.slope"
    },
    {
      id: "maximumAbsoluteCalibrationIntercept",
      passed: (
        calibrationIntercept !== null
        && Math.abs(calibrationIntercept) <= policy.maximumAbsoluteCalibrationIntercept
      ),
      actual: calibrationIntercept === null ? null : Math.abs(calibrationIntercept),
      operator: "absolute_value_<=",
      threshold: policy.maximumAbsoluteCalibrationIntercept,
      evidencePath: "evaluation.calibration.intercept"
    },
    {
      id: "noMaterialBaselineDegradation",
      passed: baselinePassed,
      actual: {
        brierScoreUpper: finiteInterval(brierDegradation)
          ? brierDegradation.upper
          : null,
        logLossUpper: finiteInterval(logLossDegradation)
          ? logLossDegradation.upper
          : null
      },
      operator: "both_upper_bounds_<=",
      threshold: policy.requireNoMaterialBaselineDegradation ? 0 : null,
      evidencePath: "evaluation.baseline"
    },
    {
      id: "nonNegativeClosingLineValueInterval",
      passed: closingLineValuePassed,
      actual: finiteInterval(closingLineValueInterval)
        ? closingLineValueInterval.lower
        : null,
      operator: ">=",
      threshold: policy.requireNonNegativeClosingLineValueInterval ? 0 : null,
      evidencePath: "evaluation.closingLineValue.interval.lower"
    },
    {
      id: "noUnresolvedDataQualityFindings",
      passed: (
        dataQualitySummary.valid
        && dataQualitySummary.unresolvedCount === 0
      ),
      actual: dataQualitySummary,
      operator: "===",
      threshold: 0,
      evidencePath: "dataQuality"
    },
    {
      id: "policyRegisteredBeforeEvaluation",
      passed: registrationPassed,
      actual: {
        policyRegisteredAt: policyRegisteredAt === null
          ? null
          : policyMetadata.registeredAt,
        evaluationStartedAt: evaluationStartedAt === null
          ? null
          : source.evaluationStartedAt,
        datasetEvaluationStartedAt: datasetEvaluationStartedAt === null
          ? null
          : source.dataset.splitCutoffs.evaluation
      },
      operator: "<",
      threshold: "evaluationStartedAt",
      evidencePath: "policy.registeredAt"
    }
  ];

  return {
    passed: checks.every((check) => check.passed),
    checks
  };
}

function reportById(reportsById, reportId) {
  if (reportsById instanceof Map) {
    return reportsById.get(reportId);
  }

  if (isPlainObject(reportsById)) {
    return reportsById[reportId];
  }

  return undefined;
}

function verifyReportDigest(report, expectedDigest) {
  assertDigest(report.reportDigest, "report.reportDigest");

  if (report.reportDigest !== expectedDigest) {
    throw new TypeError(
      "Calibration report digest does not match the digest registered for the model."
    );
  }

  const { reportDigest, ...unsignedReport } = report;
  let recomputedDigest;
  try {
    recomputedDigest = contentDigest(unsignedReport);
  } catch (error) {
    throw new TypeError(
      `Calibration report digest could not be verified: ${error instanceof Error ? error.message : String(error)}`
    );
  }

  if (reportDigest !== recomputedDigest) {
    throw new TypeError(
      "Calibration report digest does not match its canonical report content."
    );
  }
}

function assertFiniteMetric(value, field, options = {}) {
  if (!finiteNumber(value)) {
    throw new TypeError(`${field} must be a finite number.`);
  }
  if (options.minimum !== undefined && value < options.minimum) {
    throw new TypeError(`${field} must be at least ${options.minimum}.`);
  }
  if (options.maximum !== undefined && value > options.maximum) {
    throw new TypeError(`${field} must be no greater than ${options.maximum}.`);
  }
}

function assertCount(value, field, options = {}) {
  const minimum = options.minimum ?? 0;
  if (!finiteInteger(value) || value < minimum) {
    throw new TypeError(`${field} must be an integer of at least ${minimum}.`);
  }
}

function assertArray(value, field, options = {}) {
  if (!Array.isArray(value)) {
    throw new TypeError(`${field} must be an array.`);
  }
  if (options.nonEmpty === true && value.length === 0) {
    throw new TypeError(`${field} must contain at least one entry.`);
  }
}

function assertFiniteInterval(value, field) {
  if (!finiteInterval(value)) {
    throw new TypeError(
      `${field} must contain finite lower and upper values in ascending order.`
    );
  }
}

function approximatelyEqual(left, right, tolerance = 1e-10) {
  return Math.abs(left - right) <= tolerance;
}

function assertIntervalContains(interval, value, field) {
  assertFiniteInterval(interval, field);
  if (value < interval.lower - 1e-10 || value > interval.upper + 1e-10) {
    throw new TypeError(`${field} must contain its reported mean or observed delta.`);
  }
}

function validateCalculationImplementation(value, modelVersion, field) {
  if (!isPlainObject(value)) {
    throw new TypeError(`${field} must be an object.`);
  }
  assertSupportedFields(
    value,
    CALCULATION_IMPLEMENTATION_FIELDS,
    "calculation implementation"
  );

  assertIdentityArray(value.modules, `${field}.modules`);
  for (const modulePath of value.modules) {
    if (
      !/^src\/[A-Za-z0-9_./-]+\.js$/.test(modulePath)
      || modulePath.split("/").includes("..")
    ) {
      throw new TypeError(`${field}.modules must contain package-relative src JavaScript paths.`);
    }
  }
  if (!validIdentity(value.probabilityExport)) {
    throw new TypeError(`${field}.probabilityExport must be a non-empty trimmed string.`);
  }
  if (value.version !== modelVersion) {
    throw new TypeError(`${field}.version must match the model version.`);
  }
  if (value.implementationDigest !== null) {
    assertDigest(value.implementationDigest, `${field}.implementationDigest`);

    let recomputedDigest;
    try {
      recomputedDigest = contentDigest({
        version: value.version,
        probabilityExport: value.probabilityExport,
        modules: value.modules.map((modulePath) => ({
          modulePath,
          source: fs.readFileSync(path.join(PACKAGE_ROOT, modulePath), "utf8")
        }))
      });
    } catch (error) {
      throw new TypeError(
        `${field}.implementationDigest could not be verified: ${error instanceof Error ? error.message : String(error)}`
      );
    }

    if (value.implementationDigest !== recomputedDigest) {
      throw new TypeError(
        `${field}.implementationDigest does not match the declared implementation modules.`
      );
    }
  }
}

function validateUncertaintyEvidence(evaluation, policy) {
  const uncertainty = evaluation.uncertainty;
  if (!isPlainObject(uncertainty)) {
    throw new TypeError("report.evaluation.uncertainty is required and must be an object.");
  }
  if (uncertainty.method !== policy.requiredUncertaintyMethod) {
    throw new TypeError(
      "report.evaluation.uncertainty.method must match the registered policy."
    );
  }
  assertFiniteMetric(
    uncertainty.confidenceLevel,
    "report.evaluation.uncertainty.confidenceLevel",
    { minimum: policy.minimumConfidenceLevel, maximum: 1 }
  );
  if (uncertainty.confidenceLevel >= 1) {
    throw new TypeError(
      "report.evaluation.uncertainty.confidenceLevel must be less than one."
    );
  }
  assertCount(
    uncertainty.resamples,
    "report.evaluation.uncertainty.resamples",
    { minimum: policy.minimumBootstrapResamples }
  );
  assertCount(uncertainty.seed, "report.evaluation.uncertainty.seed");

  if (!isPlainObject(uncertainty.intervals)) {
    throw new TypeError(
      "report.evaluation.uncertainty.intervals is required and must be an object."
    );
  }
  assertSupportedFields(
    uncertainty.intervals,
    new Set(CORE_UNCERTAINTY_METRICS),
    "uncertainty interval"
  );

  const observedValues = {
    brierScore: evaluation.brierScore,
    logLoss: evaluation.logLoss,
    expectedCalibrationError: evaluation.expectedCalibrationError,
    calibrationSlope: evaluation.calibration.slope,
    calibrationIntercept: evaluation.calibration.intercept
  };
  for (const metric of CORE_UNCERTAINTY_METRICS) {
    assertIntervalContains(
      uncertainty.intervals[metric],
      observedValues[metric],
      `report.evaluation.uncertainty.intervals.${metric}`
    );
  }
}

function validateDatasetEvidence(dataset, evaluationStartedAt, trainingCutoff) {
  if (!isPlainObject(dataset)) {
    throw new TypeError("report.dataset is required and must be an object.");
  }

  assertDigest(dataset.manifestDigest, "report.dataset.manifestDigest");
  assertDigest(dataset.datasetDigest, "report.dataset.datasetDigest");
  assertArray(dataset.sourceDigests, "report.dataset.sourceDigests", { nonEmpty: true });
  const uniqueSourceDigests = new Set();
  dataset.sourceDigests.forEach((digest, index) => {
    assertDigest(digest, `report.dataset.sourceDigests[${index}]`);
    if (uniqueSourceDigests.has(digest)) {
      throw new TypeError("report.dataset.sourceDigests must not contain duplicates.");
    }
    uniqueSourceDigests.add(digest);
  });
  const sortedSourceDigests = [...dataset.sourceDigests].sort();
  if (dataset.sourceDigests.some((digest, index) => digest !== sortedSourceDigests[index])) {
    throw new TypeError("report.dataset.sourceDigests must be sorted.");
  }

  assertArray(dataset.sources, "report.dataset.sources", { nonEmpty: true });
  const sourceIdentifiers = new Set();
  let previousSourceIdentifier = null;
  const lineageDigests = new Set();
  dataset.sources.forEach((source, index) => {
    const field = `report.dataset.sources[${index}]`;
    if (!isPlainObject(source)) {
      throw new TypeError(`${field} must be an object.`);
    }
    assertSupportedFields(source, DATASET_SOURCE_FIELDS, "dataset source");
    for (const requiredField of DATASET_SOURCE_FIELDS) {
      if (!hasOwn(source, requiredField)) {
        throw new TypeError(`${field}.${requiredField} is required.`);
      }
    }
    if (!validIdentity(source.sourceIdentifier)) {
      throw new TypeError(`${field}.sourceIdentifier must be a non-empty trimmed string.`);
    }
    if (sourceIdentifiers.has(source.sourceIdentifier)) {
      throw new TypeError("report.dataset.sources must not repeat sourceIdentifier values.");
    }
    if (
      previousSourceIdentifier !== null
      && source.sourceIdentifier.localeCompare(previousSourceIdentifier) <= 0
    ) {
      throw new TypeError("report.dataset.sources must be sorted by sourceIdentifier.");
    }
    sourceIdentifiers.add(source.sourceIdentifier);
    previousSourceIdentifier = source.sourceIdentifier;
    assertTimestamp(source.capturedAt, `${field}.capturedAt`);
    assertDigest(source.contentDigest, `${field}.contentDigest`);
    lineageDigests.add(source.contentDigest);
  });

  const sortedLineageDigests = [...lineageDigests].sort();
  if (
    sortedLineageDigests.length !== dataset.sourceDigests.length
    || sortedLineageDigests.some(
      (digest, index) => digest !== dataset.sourceDigests[index]
    )
  ) {
    throw new TypeError(
      "report.dataset.sources content digests must exactly match report.dataset.sourceDigests."
    );
  }

  if (!isPlainObject(dataset.splitCutoffs)) {
    throw new TypeError("report.dataset.splitCutoffs is required and must be an object.");
  }

  const training = timestampMilliseconds(dataset.splitCutoffs.training);
  const calibration = timestampMilliseconds(dataset.splitCutoffs.calibration);
  const evaluation = timestampMilliseconds(dataset.splitCutoffs.evaluation);
  if (
    training === null
    || calibration === null
    || evaluation === null
    || training >= calibration
    || calibration >= evaluation
  ) {
    throw new TypeError(
      "report.dataset.splitCutoffs must be valid and strictly chronological."
    );
  }

  if (evaluation !== timestampMilliseconds(evaluationStartedAt)) {
    throw new TypeError(
      "report.evaluationStartedAt must equal report.dataset.splitCutoffs.evaluation."
    );
  }
  if (training !== timestampMilliseconds(trainingCutoff)) {
    throw new TypeError(
      "Model trainingCutoff must equal report.dataset.splitCutoffs.training."
    );
  }

  if (dataset.chronological !== true) {
    throw new TypeError("report.dataset.chronological must be true.");
  }
  if (dataset.outOfSample !== true) {
    throw new TypeError("report.dataset.outOfSample must be true.");
  }
}

function validateReliability(
  reliability,
  settledCount,
  expectedCalibrationError,
  registeredBoundaries
) {
  assertArray(
    reliability,
    "report.evaluation.calibration.reliability",
    { nonEmpty: true }
  );

  if (!matchesReliabilityBoundaries(reliability, registeredBoundaries)) {
    throw new TypeError(
      "report.evaluation.calibration.reliability must use the registered bucket boundaries."
    );
  }

  let previousUpper = 0;
  let totalCount = 0;
  let totalWeightedGap = 0;

  reliability.forEach((bucket, index) => {
    const field = `report.evaluation.calibration.reliability[${index}]`;
    if (!isPlainObject(bucket)) {
      throw new TypeError(`${field} must be an object.`);
    }

    assertFiniteMetric(bucket.lower, `${field}.lower`, { minimum: 0, maximum: 1 });
    assertFiniteMetric(bucket.upper, `${field}.upper`, { minimum: 0, maximum: 1 });
    if (bucket.lower >= bucket.upper || !approximatelyEqual(bucket.lower, previousUpper)) {
      throw new TypeError(
        "report.evaluation.calibration.reliability buckets must be sorted, contiguous, and non-overlapping."
      );
    }
    assertCount(bucket.count, `${field}.count`);
    assertFiniteMetric(
      bucket.weightedAbsoluteGap,
      `${field}.weightedAbsoluteGap`,
      { minimum: 0 }
    );

    if (bucket.count === 0) {
      if (
        bucket.meanProbability !== null
        || bucket.observedRate !== null
        || bucket.weightedAbsoluteGap !== 0
      ) {
        throw new TypeError(`${field} empty bucket statistics must be null, null, and zero.`);
      }
    } else {
      assertFiniteMetric(
        bucket.meanProbability,
        `${field}.meanProbability`,
        { minimum: bucket.lower, maximum: bucket.upper }
      );
      assertFiniteMetric(
        bucket.observedRate,
        `${field}.observedRate`,
        { minimum: 0, maximum: 1 }
      );
      const recomputedGap = (
        bucket.count / settledCount
        * Math.abs(bucket.meanProbability - bucket.observedRate)
      );
      if (!approximatelyEqual(bucket.weightedAbsoluteGap, recomputedGap)) {
        throw new TypeError(
          `${field}.weightedAbsoluteGap does not match count, meanProbability, and observedRate.`
        );
      }
    }

    previousUpper = bucket.upper;
    totalCount += bucket.count;
    totalWeightedGap += bucket.weightedAbsoluteGap;
  });

  if (!approximatelyEqual(previousUpper, 1)) {
    throw new TypeError(
      "report.evaluation.calibration.reliability buckets must cover zero through one."
    );
  }
  if (totalCount !== settledCount) {
    throw new TypeError(
      "report.evaluation.calibration.reliability counts must equal evaluation.settledCount."
    );
  }
  if (!approximatelyEqual(totalWeightedGap, expectedCalibrationError)) {
    throw new TypeError(
      "report.evaluation.expectedCalibrationError does not match reliability weighted gaps."
    );
  }
}

function validatePerformanceBreakdown(value, field) {
  assertArray(value, field, { nonEmpty: true });

  value.forEach((row, index) => {
    const rowField = `${field}[${index}]`;
    if (!isPlainObject(row)) {
      throw new TypeError(`${rowField} must be an object.`);
    }
    if (!validIdentity(row.key)) {
      throw new TypeError(`${rowField}.key must be a non-empty trimmed string.`);
    }
    assertCount(row.count, `${rowField}.count`, { minimum: 1 });
    assertFiniteMetric(row.brierScore, `${rowField}.brierScore`, {
      minimum: 0,
      maximum: 1
    });
    assertFiniteMetric(row.logLoss, `${rowField}.logLoss`, { minimum: 0 });
    assertFiniteMetric(row.roi, `${rowField}.roi`);
  });
}

function validateEvaluationEvidence(evaluation, identity, policy) {
  if (!isPlainObject(evaluation)) {
    throw new TypeError("report.evaluation is required and must be an object.");
  }

  assertCount(evaluation.predictionCount, "report.evaluation.predictionCount", { minimum: 1 });
  assertCount(evaluation.settledCount, "report.evaluation.settledCount");
  assertDigest(
    evaluation.settledObservationSetDigest,
    "report.evaluation.settledObservationSetDigest"
  );
  if (evaluation.settledCount > evaluation.predictionCount) {
    throw new TypeError(
      "report.evaluation.settledCount cannot exceed predictionCount."
    );
  }
  assertFiniteMetric(
    evaluation.settlementCoverage,
    "report.evaluation.settlementCoverage",
    { minimum: 0, maximum: 1 }
  );
  const derivedCoverage = evaluation.settledCount / evaluation.predictionCount;
  if (!approximatelyEqual(evaluation.settlementCoverage, derivedCoverage, 1e-12)) {
    throw new TypeError(
      "report.evaluation.settlementCoverage must equal settledCount divided by predictionCount."
    );
  }
  assertFiniteMetric(
    evaluation.brierScore,
    "report.evaluation.brierScore",
    { minimum: 0, maximum: 1 }
  );
  assertFiniteMetric(evaluation.logLoss, "report.evaluation.logLoss", { minimum: 0 });
  assertFiniteMetric(
    evaluation.expectedCalibrationError,
    "report.evaluation.expectedCalibrationError",
    { minimum: 0, maximum: 1 }
  );

  if (!isPlainObject(evaluation.calibration)) {
    throw new TypeError("report.evaluation.calibration is required and must be an object.");
  }
  assertFiniteMetric(
    evaluation.calibration.slope,
    "report.evaluation.calibration.slope"
  );
  assertFiniteMetric(
    evaluation.calibration.intercept,
    "report.evaluation.calibration.intercept"
  );
  validateReliability(
    evaluation.calibration.reliability,
    evaluation.settledCount,
    evaluation.expectedCalibrationError,
    policy.reliabilityBucketBoundaries
  );

  validatePerformanceBreakdown(
    evaluation.byLineRange,
    "report.evaluation.byLineRange"
  );
  validatePerformanceBreakdown(
    evaluation.byParticipantRole,
    "report.evaluation.byParticipantRole"
  );
  validatePerformanceBreakdown(
    evaluation.byContext,
    "report.evaluation.byContext"
  );

  if (!isPlainObject(evaluation.closingLineValue)) {
    throw new TypeError("report.evaluation.closingLineValue is required and must be an object.");
  }
  assertFiniteMetric(
    evaluation.closingLineValue.mean,
    "report.evaluation.closingLineValue.mean"
  );
  assertIntervalContains(
    evaluation.closingLineValue.interval,
    evaluation.closingLineValue.mean,
    "report.evaluation.closingLineValue.interval"
  );

  if (!isPlainObject(evaluation.roi)) {
    throw new TypeError("report.evaluation.roi is required and must be an object.");
  }
  assertFiniteMetric(evaluation.roi.mean, "report.evaluation.roi.mean");
  assertIntervalContains(
    evaluation.roi.interval,
    evaluation.roi.mean,
    "report.evaluation.roi.interval"
  );

  if (!isPlainObject(evaluation.baseline)) {
    throw new TypeError("report.evaluation.baseline is required and must be an object.");
  }
  const baseline = evaluation.baseline;
  if (
    baseline.baselineId !== policy.requiredBaseline.baselineId
    || baseline.method !== policy.requiredBaseline.method
    || baseline.methodVersion !== policy.requiredBaseline.methodVersion
    || baseline.marketFamily !== identity.marketFamily
  ) {
    throw new TypeError(
      "report.evaluation.baseline must match the registered no-vig baseline and report market family."
    );
  }
  assertDigest(baseline.marketDataDigest, "report.evaluation.baseline.marketDataDigest");
  assertDigest(
    baseline.settledObservationSetDigest,
    "report.evaluation.baseline.settledObservationSetDigest"
  );
  if (
    baseline.settledObservationSetDigest
    !== evaluation.settledObservationSetDigest
  ) {
    throw new TypeError(
      "report.evaluation.baseline.settledObservationSetDigest must match the evaluated settled observation set."
    );
  }
  assertCount(
    baseline.matchedPredictionCount,
    "report.evaluation.baseline.matchedPredictionCount"
  );
  if (baseline.matchedPredictionCount !== evaluation.settledCount) {
    throw new TypeError(
      "report.evaluation.baseline.matchedPredictionCount must equal evaluation.settledCount."
    );
  }
  assertFiniteMetric(
    baseline.brierScore,
    "report.evaluation.baseline.brierScore",
    { minimum: 0, maximum: 1 }
  );
  assertFiniteMetric(
    baseline.logLoss,
    "report.evaluation.baseline.logLoss",
    { minimum: 0 }
  );
  assertIntervalContains(
    baseline.brierScoreDegradationInterval,
    evaluation.brierScore - baseline.brierScore,
    "report.evaluation.baseline.brierScoreDegradationInterval"
  );
  assertIntervalContains(
    baseline.logLossDegradationInterval,
    evaluation.logLoss - baseline.logLoss,
    "report.evaluation.baseline.logLossDegradationInterval"
  );

  validateUncertaintyEvidence(evaluation, policy);
}

function validateDataQualityEvidence(dataQuality) {
  if (!isPlainObject(dataQuality)) {
    throw new TypeError("report.dataQuality is required and must be an object.");
  }

  assertSupportedFields(dataQuality, DATA_QUALITY_FIELDS, "data-quality evidence");

  for (const collection of DATA_QUALITY_FIELDS) {
    const findings = dataQuality[collection];
    assertArray(findings, `report.dataQuality.${collection}`);

    findings.forEach((finding, index) => {
      const field = `report.dataQuality.${collection}[${index}]`;
      if (!isPlainObject(finding)) {
        throw new TypeError(`${field} must be an object.`);
      }
      assertSupportedFields(
        finding,
        DATA_QUALITY_FINDING_FIELDS,
        "data-quality finding"
      );
      for (const requiredField of DATA_QUALITY_FINDING_FIELDS) {
        if (!hasOwn(finding, requiredField)) {
          throw new TypeError(`${field}.${requiredField} is required.`);
        }
      }
      if (!validIdentity(finding.code)) {
        throw new TypeError(`${field}.code must be a non-empty trimmed string.`);
      }
      assertCount(finding.count, `${field}.count`, { minimum: 1 });
      if (!dataQualityDispositionAllowed(collection, finding.disposition)) {
        throw new TypeError(
          `${field}.disposition is invalid for ${collection}.`
        );
      }
      if (!validIdentity(finding.detail)) {
        throw new TypeError(`${field}.detail must be a non-empty trimmed string.`);
      }
    });
  }
}

function validateReportStructure(report, model, registry) {
  assertTimestamp(report.evaluationStartedAt, "report.evaluationStartedAt");
  validateDatasetEvidence(
    report.dataset,
    report.evaluationStartedAt,
    model.trainingCutoff
  );
  validateEvaluationEvidence(report.evaluation, report.identity, registry.promotionPolicy);
  validateDataQualityEvidence(report.dataQuality);
}

function validateStoredPromotion(report, promotion) {
  if (!isPlainObject(report.promotion)) {
    throw new TypeError("report.promotion is required and must be an object.");
  }

  if (contentDigest(report.promotion) !== contentDigest(promotion)) {
    throw new TypeError(
      "report.promotion must match the promotion result recomputed from report evidence."
    );
  }
}

function verifyReportEvidence(model, report, registry) {
  if (!isPlainObject(report)) {
    throw new TypeError(
      `Calibration report ${model.calibrationReportId} is required for ${model.modelStatus} model evidence.`
    );
  }

  if (report.schemaVersion !== REPORT_SCHEMA_VERSION) {
    throw new TypeError(
      `Calibration report schemaVersion must be ${REPORT_SCHEMA_VERSION}.`
    );
  }

  if (report.reportId !== model.calibrationReportId) {
    throw new TypeError(
      `Calibration reportId expected ${model.calibrationReportId} but received ${String(report.reportId)}.`
    );
  }

  verifyReportDigest(report, model.calibrationReportDigest);

  if (!isPlainObject(report.identity)) {
    throw new TypeError("Calibration report identity is required.");
  }

  for (const field of ["modelId", "modelVersion", "marketFamily"]) {
    if (report.identity[field] !== model[field]) {
      throw new TypeError(
        `Calibration report identity ${field} expected ${model[field]} but received ${String(report.identity[field])}.`
      );
    }
  }

  for (const field of [
    "featureSet",
    "dataSources",
    "trainingCutoff",
    "calculationImplementation"
  ]) {
    if (
      !hasOwn(report.identity, field)
      || contentDigest(report.identity[field]) !== contentDigest(model[field])
    ) {
      throw new TypeError(
        `Calibration report identity ${field} does not match the registered model provenance.`
      );
    }
  }

  if (!isPlainObject(report.policy)) {
    throw new TypeError("Calibration report policy evidence is required.");
  }

  if (report.policy.policyVersion !== registry.policyVersion) {
    throw new TypeError("Calibration report policyVersion does not match the registry policy.");
  }
  if (report.policy.policyDigest !== registry.policyDigest) {
    throw new TypeError("Calibration report policyDigest does not match the registry policy.");
  }
  if (report.policy.registeredAt !== registry.policyRegisteredAt) {
    throw new TypeError("Calibration report policy registration time does not match the registry policy.");
  }

  validateReportStructure(report, model, registry);
  const promotion = evaluatePromotion(report, registry.promotionPolicy);
  validateStoredPromotion(report, promotion);
  return promotion;
}

function verifyValidatedReport(model, report, registry) {
  const promotion = verifyReportEvidence(model, report, registry);
  if (!promotion.passed) {
    const failedChecks = promotion.checks
      .filter((check) => !check.passed)
      .map((check) => check.id)
      .join(", ");
    throw new TypeError(
      `Validated model report does not pass promotion policy: ${failedChecks}.`
    );
  }

  const promotedAt = timestampMilliseconds(model.promotedAt);
  const evaluationStartedAt = timestampMilliseconds(report.evaluationStartedAt);
  if (
    promotedAt === null
    || evaluationStartedAt === null
    || promotedAt < evaluationStartedAt
  ) {
    throw new TypeError(
      "Validated model promotedAt must be at or after the report evaluation start."
    );
  }
}

function validateModelEntry(model, index, registry, reportsById, seenKeys) {
  if (!isPlainObject(model)) {
    throw new TypeError(`models[${index}] must be an object.`);
  }

  assertSupportedFields(model, MODEL_FIELDS, "model");

  for (const field of ["modelId", "modelVersion", "marketFamily"]) {
    if (!validIdentity(model[field])) {
      throw new TypeError(`models[${index}].${field} must be a non-empty trimmed string.`);
    }
  }

  for (const field of [
    "featureSet",
    "dataSources",
    "trainingCutoff",
    "calculationImplementation"
  ]) {
    if (!hasOwn(model, field)) {
      throw new TypeError(`models[${index}].${field} is required.`);
    }
  }
  assertIdentityArray(model.featureSet, `models[${index}].featureSet`);
  assertIdentityArray(model.dataSources, `models[${index}].dataSources`);
  if (model.trainingCutoff !== null) {
    assertTimestamp(model.trainingCutoff, `models[${index}].trainingCutoff`);
  }
  validateCalculationImplementation(
    model.calculationImplementation,
    model.modelVersion,
    `models[${index}].calculationImplementation`
  );

  if (!MODEL_STATUSES.includes(model.modelStatus)) {
    throw new TypeError(
      `models[${index}].modelStatus must be one of: ${MODEL_STATUSES.join(", ")}.`
    );
  }

  for (const field of ["calibrationReportId", "calibrationReportDigest"]) {
    if (!hasOwn(model, field)) {
      throw new TypeError(`models[${index}].${field} is required and may be null.`);
    }
  }

  if (
    model.calibrationReportId !== null
    && !validIdentity(model.calibrationReportId)
  ) {
    throw new TypeError(
      `models[${index}].calibrationReportId must be a non-empty trimmed string or null.`
    );
  }
  if (model.calibrationReportDigest !== null) {
    assertDigest(
      model.calibrationReportDigest,
      `models[${index}].calibrationReportDigest`
    );
  }

  const key = `${model.modelId}\u0000${model.modelVersion}\u0000${model.marketFamily}`;
  if (seenKeys.has(key)) {
    throw new TypeError(
      `Duplicate model registry key: ${model.modelId} ${model.modelVersion} ${model.marketFamily}.`
    );
  }
  seenKeys.add(key);

  if (NON_RESEARCH_STATUSES.has(model.modelStatus)) {
    if (!validIdentity(model.calibrationReportId)) {
      throw new TypeError(
        `models[${index}].calibrationReportId is required for ${model.modelStatus} models.`
      );
    }
    assertDigest(
      model.calibrationReportDigest,
      `models[${index}].calibrationReportDigest`
    );
    assertTimestamp(model.trainingCutoff, `models[${index}].trainingCutoff`);
    assertDigest(
      model.calculationImplementation.implementationDigest,
      `models[${index}].calculationImplementation.implementationDigest`
    );

    if (model.promotionPolicyVersion !== registry.policyVersion) {
      throw new TypeError(
        `models[${index}].promotionPolicyVersion must match registry policyVersion.`
      );
    }
    if (model.promotionPolicyDigest !== registry.policyDigest) {
      throw new TypeError(
        `models[${index}].promotionPolicyDigest must match registry policyDigest.`
      );
    }

    const report = reportById(reportsById, model.calibrationReportId);
    if (model.modelStatus !== "validated") {
      verifyReportEvidence(model, report, registry);
      return;
    }

    assertTimestamp(model.promotedAt, `models[${index}].promotedAt`);
    verifyValidatedReport(model, report, registry);
    return;
  }
}

function deepFreeze(value) {
  if (value === null || typeof value !== "object" || Object.isFrozen(value)) {
    return value;
  }

  for (const child of Object.values(value)) {
    deepFreeze(child);
  }

  return Object.freeze(value);
}

function validateRegistry(registry, reportsById) {
  if (!isPlainObject(registry)) {
    throw new TypeError("Model registry must be an object.");
  }

  assertSupportedFields(registry, REGISTRY_FIELDS, "registry");

  if (registry.schemaVersion !== REGISTRY_SCHEMA_VERSION) {
    throw new TypeError(
      `Model registry schemaVersion must be ${REGISTRY_SCHEMA_VERSION}.`
    );
  }
  if (!validIdentity(registry.policyVersion)) {
    throw new TypeError("Model registry policyVersion must be a non-empty trimmed string.");
  }
  assertTimestamp(registry.policyRegisteredAt, "Model registry policyRegisteredAt");
  validatePromotionPolicy(registry.promotionPolicy);
  assertDigest(registry.policyDigest, "Model registry policyDigest");

  const recomputedPolicyDigest = contentDigest(registry.promotionPolicy);
  if (registry.policyDigest !== recomputedPolicyDigest) {
    throw new TypeError(
      "Model registry policyDigest does not match promotionPolicy content."
    );
  }

  if (!Array.isArray(registry.models)) {
    throw new TypeError("Model registry models must be an array.");
  }

  const seenKeys = new Set();
  registry.models.forEach((model, index) => {
    validateModelEntry(model, index, registry, reportsById, seenKeys);
  });
}

/**
 * @param {{ registryPath?: string, reportsById?: Record<string, any> | Map<string, any> }} [options]
 * @returns {Record<string, any>}
 */
function loadModelRegistry(options = {}) {
  if (!isPlainObject(options)) {
    throw new TypeError("Model registry options must be an object.");
  }

  const registryPath = options.registryPath ?? DEFAULT_REGISTRY_PATH;
  if (!validIdentity(registryPath)) {
    throw new TypeError("registryPath must be a non-empty trimmed string.");
  }

  const resolvedPath = path.resolve(registryPath);
  let source;
  try {
    source = fs.readFileSync(resolvedPath, "utf8");
  } catch (error) {
    throw new Error(
      `Unable to read model registry at ${resolvedPath}: ${error instanceof Error ? error.message : String(error)}`
    );
  }

  let registry;
  try {
    registry = JSON.parse(source);
  } catch (error) {
    throw new TypeError(
      `Model registry at ${resolvedPath} is not valid JSON: ${error instanceof Error ? error.message : String(error)}`
    );
  }

  validateRegistry(registry, options.reportsById);
  return deepFreeze(registry);
}

/**
 * @param {string} modelId
 * @param {string} modelVersion
 * @param {string} marketFamily
 * @param {{ registryPath?: string, reportsById?: Record<string, any> | Map<string, any> }} [options]
 * @returns {Record<string, any> | null}
 */
function resolveModelStatus(modelId, modelVersion, marketFamily, options = {}) {
  const registry = loadModelRegistry(options);

  return registry.models.find((model) => (
    model.modelId === modelId
    && model.modelVersion === modelVersion
    && model.marketFamily === marketFamily
  )) ?? null;
}

module.exports = {
  evaluatePromotion,
  loadModelRegistry,
  resolveModelStatus
};
