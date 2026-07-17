const fs = require("node:fs");
const path = require("node:path");

const {
  canonicalStringify,
  contentDigest
} = require("../audit/canonical-json.js");
const {
  buildDatasetManifest,
  chronologicalSplit,
  detectLeakage
} = require("./dataset.js");
const {
  bootstrapMeanInterval,
  brierScore,
  expectedCalibrationError,
  fitCalibrationLine,
  logLoss
} = require("./metrics.js");
const {
  evaluatePromotion,
  loadModelRegistry
} = require("./model-registry.js");

const REPORT_SCHEMA_VERSION = "1.0.0";
const PACKAGE_ROOT = path.resolve(__dirname, "../..");
const SPLIT_POLICY = Object.freeze({
  training: 0.6,
  calibration: 0.2,
  evaluation: 0.2
});
const BOOTSTRAP_SEED = 271828;
const DIGEST_PATTERN = /^[a-f0-9]{64}$/;
const ISO_UTC_PATTERN = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{3})?Z$/;
const OPTION_FIELDS = new Set([
  "marketFamily",
  "modelId",
  "modelVersion",
  "registryPath"
]);

function isPlainObject(value) {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function validIdentity(value) {
  return typeof value === "string" && value.length > 0 && value === value.trim();
}

function compareStrings(left, right) {
  if (left < right) {
    return -1;
  }
  if (left > right) {
    return 1;
  }
  return 0;
}

function digestSafeValue(value) {
  if (typeof value === "number" && !Number.isFinite(value)) {
    return { $bearEdgeInvalidType: "non_finite_number", value: String(value) };
  }
  if (value === undefined) {
    return { $bearEdgeInvalidType: "undefined" };
  }
  if (typeof value === "bigint") {
    return { $bearEdgeInvalidType: "bigint", value: value.toString() };
  }
  if (typeof value === "function" || typeof value === "symbol") {
    return { $bearEdgeInvalidType: typeof value, value: String(value) };
  }
  if (Array.isArray(value)) {
    return value.map(digestSafeValue);
  }
  if (value !== null && typeof value === "object") {
    return Object.fromEntries(
      Object.keys(value)
        .sort(compareStrings)
        .map((key) => [key, digestSafeValue(value[key])])
    );
  }
  return value;
}

function compareRows(left, right) {
  const key = (row) => [
    isPlainObject(row) && typeof row.predictionAt === "string" ? row.predictionAt : "",
    isPlainObject(row) && typeof row.predictionId === "string" ? row.predictionId : "",
    canonicalStringify(digestSafeValue(row))
  ];
  const leftKey = key(left);
  const rightKey = key(right);

  for (let index = 0; index < leftKey.length; index += 1) {
    const comparison = compareStrings(leftKey[index], rightKey[index]);
    if (comparison !== 0) {
      return comparison;
    }
  }
  return 0;
}

function deepFreeze(value) {
  if (value === null || typeof value !== "object" || Object.isFrozen(value)) {
    return value;
  }
  Object.values(value).forEach(deepFreeze);
  return Object.freeze(value);
}

function validateOptions(options) {
  if (!isPlainObject(options)) {
    throw new TypeError("Calibration report options must be an object.");
  }
  for (const field of Object.keys(options)) {
    if (!OPTION_FIELDS.has(field)) {
      throw new TypeError(`Unsupported calibration report option: ${field}`);
    }
  }
  for (const field of ["marketFamily", "modelId", "modelVersion"]) {
    if (!validIdentity(options[field])) {
      throw new TypeError(`${field} must be a non-empty trimmed string.`);
    }
  }
  if (options.registryPath !== undefined && !validIdentity(options.registryPath)) {
    throw new TypeError("registryPath must be a non-empty trimmed string.");
  }
}

function validTimestamp(value) {
  if (typeof value !== "string" || !ISO_UTC_PATTERN.test(value)) {
    return false;
  }
  const milliseconds = Date.parse(value);
  if (!Number.isFinite(milliseconds)) {
    return false;
  }
  const canonical = value.includes(".") ? value : value.replace("Z", ".000Z");
  return new Date(milliseconds).toISOString() === canonical;
}

function stableRowIdentifier(row) {
  const rowDigest = contentDigest(digestSafeValue(row));
  if (isPlainObject(row) && validIdentity(row.predictionId)) {
    return `${row.predictionId}@${rowDigest}`;
  }
  return `row-${rowDigest}`;
}

function dataQualityFinding(row, code, disposition, message) {
  return {
    code,
    count: 1,
    disposition,
    detail: `row ${stableRowIdentifier(row)}; reason ${code}: ${message}`
  };
}

function sortFindings(findings) {
  return findings.sort((left, right) => (
    compareStrings(left.detail, right.detail) || compareStrings(left.code, right.code)
  ));
}

function validateSourceEvidence(row) {
  const identifier = stableRowIdentifier(row);
  if (!Array.isArray(row.sourceDigests) || row.sourceDigests.length === 0) {
    throw new TypeError(`row ${identifier} sourceDigests must be a non-empty array.`);
  }
  if (!Array.isArray(row.sourceEvidence) || row.sourceEvidence.length === 0) {
    throw new TypeError(`row ${identifier} sourceEvidence must be a non-empty array.`);
  }

  const rowDigests = new Set();
  row.sourceDigests.forEach((digest, index) => {
    if (typeof digest !== "string" || !DIGEST_PATTERN.test(digest)) {
      throw new TypeError(`row ${identifier} sourceDigests[${index}] is invalid.`);
    }
    if (rowDigests.has(digest)) {
      throw new TypeError(`row ${identifier} sourceDigests must not contain duplicates.`);
    }
    rowDigests.add(digest);
  });

  const evidenceDigests = new Set();
  const evidenceIdentifiers = new Set();
  row.sourceEvidence.forEach((source, index) => {
    const field = `row ${identifier} sourceEvidence[${index}]`;
    if (!isPlainObject(source)) {
      throw new TypeError(`${field} must be an object.`);
    }
    const supported = ["sourceIdentifier", "capturedAt", "contentDigest"];
    if (
      Object.keys(source).length !== supported.length
      || supported.some((name) => !Object.hasOwn(source, name))
    ) {
      throw new TypeError(`${field} must contain only sourceIdentifier, capturedAt, and contentDigest.`);
    }
    if (!validIdentity(source.sourceIdentifier)) {
      throw new TypeError(`${field}.sourceIdentifier must be a non-empty trimmed string.`);
    }
    if (evidenceIdentifiers.has(source.sourceIdentifier)) {
      throw new TypeError(`row ${identifier} sourceEvidence repeats sourceIdentifier ${source.sourceIdentifier}.`);
    }
    if (!validTimestamp(source.capturedAt)) {
      throw new TypeError(`${field}.capturedAt must be a valid ISO-8601 UTC timestamp.`);
    }
    if (typeof source.contentDigest !== "string" || !DIGEST_PATTERN.test(source.contentDigest)) {
      throw new TypeError(`${field}.contentDigest must be a lowercase SHA-256 digest.`);
    }
    evidenceIdentifiers.add(source.sourceIdentifier);
    evidenceDigests.add(source.contentDigest);
  });

  const expected = [...rowDigests].sort(compareStrings);
  const actual = [...evidenceDigests].sort(compareStrings);
  if (
    expected.length !== actual.length
    || expected.some((digest, index) => digest !== actual[index])
  ) {
    throw new TypeError(`row ${identifier} sourceEvidence content digests must exactly match sourceDigests.`);
  }
}

function collectSources(rows, manifestSourceDigests) {
  const byIdentifier = new Map();

  rows.forEach((row) => {
    validateSourceEvidence(row);
    row.sourceEvidence.forEach((source) => {
      const previous = byIdentifier.get(source.sourceIdentifier);
      if (previous && contentDigest(previous) !== contentDigest(source)) {
        throw new TypeError(
          `conflicting source evidence for sourceIdentifier ${source.sourceIdentifier}.`
        );
      }
      byIdentifier.set(source.sourceIdentifier, { ...source });
    });
  });

  const sources = [...byIdentifier.values()].sort((left, right) => (
    left.sourceIdentifier.localeCompare(right.sourceIdentifier)
  ));
  const sourceDigests = [...new Set(sources.map((source) => source.contentDigest))]
    .sort(compareStrings);
  if (
    sourceDigests.length !== manifestSourceDigests.length
    || sourceDigests.some((digest, index) => digest !== manifestSourceDigests[index])
  ) {
    throw new TypeError(
      "Dataset source evidence content digests must exactly match manifest sourceDigests."
    );
  }

  return { sources, sourceDigests };
}

function metricRows(rows, probabilityField = "predictedProbability") {
  return rows.map((row) => ({
    probability: row[probabilityField],
    outcome: row.outcome
  }));
}

function settledRows(rows) {
  return rows.filter((row) => (
    row.settledAt !== null && (row.outcome === 0 || row.outcome === 1)
  ));
}

function bucketDefinitions(boundaries) {
  return boundaries.slice(0, -1).map((lower, index) => ({
    lower,
    upper: boundaries[index + 1]
  }));
}

function settledObservationSetDigest(rows) {
  return contentDigest(rows.map((row) => ({
    eventId: row.eventId,
    outcome: row.outcome,
    predictionId: row.predictionId,
    settledAt: row.settledAt
  })));
}

function buildSplitSummary(rows, buckets) {
  const settled = settledRows(rows);
  const summary = {
    predictionCount: rows.length,
    settledCount: settled.length,
    settlementCoverage: rows.length === 0 ? 0 : settled.length / rows.length,
    settledObservationSetDigest: settledObservationSetDigest(settled)
  };
  if (settled.length === 0) {
    return {
      ...summary,
      brierScore: null,
      logLoss: null,
      expectedCalibrationError: null,
      calibration: {
        slope: null,
        intercept: null,
        converged: false,
        iterations: 0,
        reliability: buckets.map((bucket) => ({
          ...bucket,
          count: 0,
          meanProbability: null,
          observedRate: null,
          weightedAbsoluteGap: 0
        }))
      }
    };
  }

  const metrics = metricRows(settled);
  const reliability = expectedCalibrationError(metrics, buckets);
  const calibration = fitCalibrationLine(metrics);
  return {
    ...summary,
    brierScore: brierScore(metrics),
    logLoss: logLoss(metrics),
    expectedCalibrationError: reliability.value,
    calibration: {
      slope: calibration.slope,
      intercept: calibration.intercept,
      converged: calibration.converged,
      iterations: calibration.iterations,
      reliability: reliability.reliability
    }
  };
}

function americanImpliedProbability(price) {
  return price > 0 ? 100 / (price + 100) : Math.abs(price) / (Math.abs(price) + 100);
}

function noVigProbability(price, oppositePrice) {
  const selected = americanImpliedProbability(price);
  const opposite = americanImpliedProbability(oppositePrice);
  return selected / (selected + opposite);
}

function unitProfit(row) {
  if (row.outcome === 0) {
    return -1;
  }
  return row.price > 0 ? row.price / 100 : 100 / Math.abs(row.price);
}

function intervalContaining(interval, observed) {
  return {
    lower: Math.min(interval.lower, observed),
    upper: Math.max(interval.upper, observed)
  };
}

function bootstrapMean(values, settings) {
  const result = bootstrapMeanInterval(values, {
    samples: settings.resamples,
    confidence: settings.confidenceLevel,
    seed: settings.seed
  });
  return {
    mean: result.mean,
    interval: intervalContaining({ lower: result.lower, upper: result.upper }, result.mean)
  };
}

function createXorshift32(seed) {
  let state = seed >>> 0;
  return () => {
    state ^= state << 13;
    state ^= state >>> 17;
    state ^= state << 5;
    state >>>= 0;
    return state / 0x1_0000_0000;
  };
}

function percentile(sortedValues, probability) {
  const position = (sortedValues.length - 1) * probability;
  const lowerIndex = Math.floor(position);
  const upperIndex = Math.ceil(position);
  if (lowerIndex === upperIndex) {
    return sortedValues[lowerIndex];
  }
  const fraction = position - lowerIndex;
  return sortedValues[lowerIndex]
    + fraction * (sortedValues[upperIndex] - sortedValues[lowerIndex]);
}

function percentileInterval(values, confidenceLevel, observed) {
  if (values.length < 2) {
    throw new TypeError("Bootstrap metric requires at least two finite resample values.");
  }
  values.sort((left, right) => left - right);
  const tail = (1 - confidenceLevel) / 2;
  return intervalContaining({
    lower: percentile(values, tail),
    upper: percentile(values, 1 - tail)
  }, observed);
}

function bootstrapCalibration(metrics, buckets, observed, settings) {
  const random = createXorshift32(settings.seed);
  const eceValues = [];
  const slopeValues = [];
  const interceptValues = [];

  for (let sampleIndex = 0; sampleIndex < settings.resamples; sampleIndex += 1) {
    const sample = Array.from(
      { length: metrics.length },
      () => metrics[Math.floor(random() * metrics.length)]
    );
    eceValues.push(expectedCalibrationError(sample, buckets).value);
    const fit = fitCalibrationLine(sample);
    if (fit.converged && Number.isFinite(fit.slope) && Number.isFinite(fit.intercept)) {
      slopeValues.push(fit.slope);
      interceptValues.push(fit.intercept);
    }
  }

  return {
    intervals: {
      expectedCalibrationError: percentileInterval(
        eceValues,
        settings.confidenceLevel,
        observed.expectedCalibrationError
      ),
      calibrationSlope: percentileInterval(
        slopeValues,
        settings.confidenceLevel,
        observed.calibrationSlope
      ),
      calibrationIntercept: percentileInterval(
        interceptValues,
        settings.confidenceLevel,
        observed.calibrationIntercept
      )
    },
    successfulResamples: {
      expectedCalibrationError: eceValues.length,
      calibrationSlope: slopeValues.length,
      calibrationIntercept: interceptValues.length
    }
  };
}

function performanceBreakdown(rows, keyForRow) {
  const groups = new Map();
  rows.forEach((row) => {
    const key = keyForRow(row);
    const group = groups.get(key) ?? [];
    group.push(row);
    groups.set(key, group);
  });

  return [...groups.entries()]
    .sort(([left], [right]) => compareStrings(left, right))
    .map(([key, group]) => ({
      key,
      count: group.length,
      brierScore: brierScore(metricRows(group)),
      logLoss: logLoss(metricRows(group)),
      roi: group.reduce((sum, row) => sum + unitProfit(row), 0) / group.length
    }));
}

function lineRangeKey(row) {
  const lower = Math.floor(row.line / 2) * 2;
  return `${lower}_to_under_${lower + 2}`;
}

function optionalGroupKey(value) {
  return validIdentity(value) ? value : "unspecified";
}

function implementationIdentity(model) {
  const calculation = model.calculationImplementation;
  const implementationDigest = contentDigest({
    version: calculation.version,
    probabilityExport: calculation.probabilityExport,
    modules: calculation.modules.map((modulePath) => ({
      modulePath,
      source: fs.readFileSync(path.join(PACKAGE_ROOT, modulePath), "utf8")
    }))
  });
  return {
    modules: [...calculation.modules],
    probabilityExport: calculation.probabilityExport,
    version: calculation.version,
    implementationDigest
  };
}

function buildEvaluation(rows, buckets, policy, settings) {
  const settled = settledRows(rows);
  if (settled.length < 2) {
    throw new TypeError("Evaluation requires at least two settled observations.");
  }
  settled.forEach((row) => {
    if (!isPlainObject(row.closingPrice) || row.closingPrice.isFinal !== true) {
      throw new TypeError(
        `A final closing price is required for settled evaluation row ${row.predictionId}.`
      );
    }
  });

  const summary = buildSplitSummary(rows, buckets);
  if (
    !summary.calibration.converged
    || !Number.isFinite(summary.calibration.slope)
    || !Number.isFinite(summary.calibration.intercept)
  ) {
    throw new TypeError("Evaluation calibration line must converge to finite evidence.");
  }

  const metrics = metricRows(settled);
  const baselineProbabilities = settled.map((row) => noVigProbability(row.price, row.oppositePrice));
  const baselineMetrics = settled.map((row, index) => ({
    probability: baselineProbabilities[index],
    outcome: row.outcome
  }));
  const modelBrierLosses = metrics.map((row) => brierScore([row]));
  const modelLogLosses = metrics.map((row) => logLoss([row]));
  const baselineBrierLosses = baselineMetrics.map((row) => brierScore([row]));
  const baselineLogLosses = baselineMetrics.map((row) => logLoss([row]));
  const brierDegradation = modelBrierLosses.map(
    (value, index) => value - baselineBrierLosses[index]
  );
  const logLossDegradation = modelLogLosses.map(
    (value, index) => value - baselineLogLosses[index]
  );
  const closingLineValues = settled.map((row, index) => (
    noVigProbability(row.closingPrice.price, row.closingPrice.oppositePrice)
    - baselineProbabilities[index]
  ));
  const roiValues = settled.map(unitProfit);
  const observationDigest = settledObservationSetDigest(settled);
  const brierInterval = bootstrapMean(modelBrierLosses, settings);
  const logLossInterval = bootstrapMean(modelLogLosses, settings);
  const calibrationBootstrap = bootstrapCalibration(metrics, buckets, {
    expectedCalibrationError: summary.expectedCalibrationError,
    calibrationSlope: summary.calibration.slope,
    calibrationIntercept: summary.calibration.intercept
  }, settings);
  const closingLineValue = bootstrapMean(closingLineValues, settings);
  const roi = bootstrapMean(roiValues, settings);
  const brierComparison = bootstrapMean(brierDegradation, settings);
  const logLossComparison = bootstrapMean(logLossDegradation, settings);

  return {
    predictionCount: summary.predictionCount,
    settledCount: summary.settledCount,
    settledObservationSetDigest: observationDigest,
    settlementCoverage: summary.settlementCoverage,
    expectedCalibrationError: summary.expectedCalibrationError,
    brierScore: summary.brierScore,
    logLoss: summary.logLoss,
    calibration: summary.calibration,
    baseline: {
      ...policy.requiredBaseline,
      marketFamily: rows[0].marketFamily,
      marketDataDigest: contentDigest(settled.map((row) => ({
        predictionId: row.predictionId,
        price: row.price,
        oppositePrice: row.oppositePrice
      }))),
      matchedPredictionCount: settled.length,
      settledObservationSetDigest: observationDigest,
      brierScore: brierScore(baselineMetrics),
      logLoss: logLoss(baselineMetrics),
      brierScoreDegradationInterval: brierComparison.interval,
      logLossDegradationInterval: logLossComparison.interval
    },
    closingLineValue,
    roi,
    uncertainty: {
      method: policy.requiredUncertaintyMethod,
      confidenceLevel: settings.confidenceLevel,
      resamples: settings.resamples,
      seed: settings.seed,
      intervals: {
        brierScore: brierInterval.interval,
        logLoss: logLossInterval.interval,
        ...calibrationBootstrap.intervals
      },
      successfulResamples: calibrationBootstrap.successfulResamples
    },
    byLineRange: performanceBreakdown(settled, lineRangeKey),
    byParticipantRole: performanceBreakdown(
      settled,
      (row) => optionalGroupKey(row.participantRole)
    ),
    byContext: performanceBreakdown(settled, (row) => optionalGroupKey(row.context))
  };
}

function buildRowSelection(sortedRows, options) {
  const findings = detectLeakage(sortedRows);
  const findingsByIndex = new Map();
  findings.forEach((finding) => {
    const entries = findingsByIndex.get(finding.rowIndex) ?? [];
    entries.push(finding);
    findingsByIndex.set(finding.rowIndex, entries);
  });
  const invalidRows = [];
  const excludedRows = [];
  const includedRows = [];
  const lineageRows = [];

  sortedRows.forEach((row, index) => {
    const rowFindings = findingsByIndex.get(index) ?? [];
    const validationFindings = rowFindings.filter(
      (finding) => !finding.code.startsWith("DUPLICATE_")
    );
    const duplicateFindings = rowFindings.filter(
      (finding) => finding.code.startsWith("DUPLICATE_")
    );

    if (validationFindings.length > 0) {
      validationFindings.forEach((finding) => {
        invalidRows.push(dataQualityFinding(
          row,
          finding.code,
          "excluded",
          finding.message
        ));
      });
      return;
    }
    if (duplicateFindings.length > 0) {
      duplicateFindings.forEach((finding) => {
        excludedRows.push(dataQualityFinding(
          row,
          finding.code,
          "excluded",
          finding.message
        ));
      });
      return;
    }

    lineageRows.push(row);
    const identityMatches = (
      row.marketFamily === options.marketFamily
      && row.modelId === options.modelId
      && row.modelVersion === options.modelVersion
    );
    if (!identityMatches) {
      excludedRows.push(dataQualityFinding(
        row,
        "IDENTITY_MISMATCH",
        "excluded",
        `expected ${options.modelId}@${options.modelVersion} ${options.marketFamily}`
      ));
      return;
    }
    includedRows.push(row);
  });

  return {
    includedRows,
    lineageRows,
    dataQuality: {
      invalidRows: sortFindings(invalidRows),
      excludedRows: sortFindings(excludedRows),
      leakageFindings: [],
      blockers: []
    }
  };
}

function buildReportEvidence(reportParts, promotionPolicy) {
  return {
    manifestDigest: reportParts.dataset.manifestDigest,
    datasetDigest: reportParts.dataset.datasetDigest,
    identityDigest: contentDigest(reportParts.identity),
    policyDigest: reportParts.policy.policyDigest,
    promotionPolicy,
    splitCutoffs: { ...reportParts.dataset.splitCutoffs },
    trainingDigest: contentDigest(reportParts.training),
    calibrationDigest: contentDigest(reportParts.calibration),
    evaluationDigest: contentDigest(reportParts.evaluation),
    dataQualityDigest: contentDigest(reportParts.dataQuality)
  };
}

/**
 * Build immutable, order-invariant calibration evidence for a tracked model.
 *
 * @param {unknown[]} rows
 * @param {{ marketFamily: string, modelId: string, modelVersion: string, registryPath?: string }} options
 * @returns {Readonly<Record<string, any>>}
 */
function buildCalibrationReport(rows, options) {
  if (!Array.isArray(rows)) {
    throw new TypeError("Calibration report rows must be an array.");
  }
  validateOptions(options);

  const registry = loadModelRegistry(
    options.registryPath === undefined ? {} : { registryPath: options.registryPath }
  );
  const model = registry.models.find((entry) => (
    entry.modelId === options.modelId
    && entry.modelVersion === options.modelVersion
    && entry.marketFamily === options.marketFamily
  ));
  if (!model) {
    throw new TypeError(
      `No tracked model matches ${options.modelId}@${options.modelVersion} ${options.marketFamily}.`
    );
  }
  if (registry.promotionPolicy.requiredUncertaintyMethod !== "percentile_bootstrap") {
    throw new TypeError("Calibration reports require the registered percentile_bootstrap method.");
  }

  const sortedRows = structuredClone(rows).sort(compareRows);
  const manifest = buildDatasetManifest(sortedRows);
  const selection = buildRowSelection(sortedRows, options);
  if (selection.includedRows.length === 0) {
    throw new TypeError("No valid rows match the requested tracked model identity.");
  }
  const lineage = collectSources(selection.lineageRows, manifest.sourceDigests);
  const split = chronologicalSplit(selection.includedRows, SPLIT_POLICY);
  const buckets = bucketDefinitions(registry.promotionPolicy.reliabilityBucketBoundaries);
  const settings = {
    resamples: registry.promotionPolicy.minimumBootstrapResamples,
    confidenceLevel: registry.promotionPolicy.minimumConfidenceLevel,
    seed: BOOTSTRAP_SEED
  };
  const training = buildSplitSummary(split.training, buckets);
  const calibration = buildSplitSummary(split.calibration, buckets);
  const evaluation = buildEvaluation(
    split.evaluation,
    buckets,
    registry.promotionPolicy,
    settings
  );
  const identity = {
    modelId: model.modelId,
    modelVersion: model.modelVersion,
    marketFamily: model.marketFamily,
    featureSet: [...model.featureSet],
    dataSources: [...model.dataSources],
    trainingCutoff: split.cutoffs.training,
    calculationImplementation: implementationIdentity(model)
  };
  const policy = {
    policyVersion: registry.policyVersion,
    policyDigest: registry.policyDigest,
    registeredAt: registry.policyRegisteredAt,
    thresholds: structuredClone(registry.promotionPolicy)
  };
  const dataset = {
    manifestDigest: contentDigest(manifest),
    datasetDigest: manifest.datasetDigest,
    sourceDigests: lineage.sourceDigests,
    sources: lineage.sources,
    splitCutoffs: { ...split.cutoffs },
    chronological: true,
    outOfSample: true
  };
  const reportParts = {
    identity,
    policy,
    dataset,
    training,
    calibration,
    evaluation,
    dataQuality: selection.dataQuality
  };
  const reportEvidence = buildReportEvidence(
    reportParts,
    structuredClone(registry.promotionPolicy)
  );
  const reportWithoutPromotion = {
    schemaVersion: REPORT_SCHEMA_VERSION,
    reportId: `calibration-${contentDigest(reportEvidence)}`,
    identity,
    policy,
    evaluationStartedAt: split.cutoffs.evaluation,
    dataset,
    training,
    calibration,
    evaluation,
    dataQuality: selection.dataQuality,
    reportEvidence
  };
  const unsignedReport = {
    ...reportWithoutPromotion,
    promotion: evaluatePromotion(reportWithoutPromotion, registry.promotionPolicy)
  };

  return deepFreeze({
    ...unsignedReport,
    reportDigest: contentDigest(unsignedReport)
  });
}

module.exports = {
  buildCalibrationReport
};
