const {
  canonicalStringify,
  contentDigest
} = require("../audit/canonical-json.js");

const DATASET_SCHEMA_VERSION = "1.0.0";
const DIGEST_PATTERN = /^[a-f0-9]{64}$/;
const ISO_UTC_PATTERN = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{3})?Z$/;
const REQUIRED_FIELDS = Object.freeze([
  "predictionId",
  "eventId",
  "marketFamily",
  "participantId",
  "side",
  "line",
  "price",
  "oppositePrice",
  "predictedProbability",
  "predictionAt",
  "featureCutoffAt",
  "eventStartAt",
  "settledAt",
  "outcome",
  "closingPrice",
  "modelId",
  "modelVersion"
]);
const POLICY = Object.freeze({
  training: 0.6,
  calibration: 0.2,
  evaluation: 0.2
});

/**
 * @param {unknown} value
 * @returns {value is Record<string, any>}
 */
function isPlainObject(value) {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function hasOwn(object, property) {
  return Object.prototype.hasOwnProperty.call(object, property);
}

function cloneJson(value) {
  return JSON.parse(canonicalStringify(value));
}

function digestSafeValue(value) {
  if (typeof value === "number" && !Number.isFinite(value)) {
    return {
      $bearEdgeInvalidType: "non_finite_number",
      value: String(value)
    };
  }

  if (value === undefined) {
    return { $bearEdgeInvalidType: "undefined" };
  }

  if (typeof value === "bigint") {
    return {
      $bearEdgeInvalidType: "bigint",
      value: value.toString()
    };
  }

  if (typeof value === "function" || typeof value === "symbol") {
    return {
      $bearEdgeInvalidType: typeof value,
      value: String(value)
    };
  }

  if (Array.isArray(value)) {
    return value.map(digestSafeValue);
  }

  if (value !== null && typeof value === "object") {
    return Object.fromEntries(
      Object.keys(value)
        .sort()
        .map((key) => [key, digestSafeValue(value[key])])
    );
  }

  return value;
}

function auditContentDigest(value) {
  return contentDigest(digestSafeValue(value));
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

function validIdentity(value) {
  return (
    typeof value === "string"
    && value.length > 0
    && value === value.trim()
  );
}

function validPrice(value) {
  return typeof value === "number" && Number.isFinite(value) && value !== 0;
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

/**
 * @param {unknown} row
 * @returns {Array<{ code: string, path: string, message: string }>}
 */
function validatePredictionRow(row) {
  /** @type {Array<{ code: string, path: string, message: string }>} */
  const issues = [];
  const addIssue = (code, path, message) => issues.push({ code, path, message });

  if (!isPlainObject(row)) {
    addIssue("ROW_NOT_OBJECT", "$", "Prediction row must be an object");
    return issues;
  }

  for (const field of REQUIRED_FIELDS) {
    if (!hasOwn(row, field)) {
      addIssue("MISSING_FIELD", field, `${field} is required`);
    }
  }

  for (const field of [
    "predictionId",
    "eventId",
    "marketFamily",
    "participantId",
    "modelId",
    "modelVersion"
  ]) {
    if (hasOwn(row, field) && !validIdentity(row[field])) {
      addIssue(
        "INVALID_IDENTITY",
        field,
        `${field} must be a non-empty string without surrounding whitespace`
      );
    }
  }

  if (hasOwn(row, "side") && row.side !== "over" && row.side !== "under") {
    addIssue("INVALID_SIDE", "side", "side must be over or under");
  }

  if (hasOwn(row, "line") && (
    typeof row.line !== "number" || !Number.isFinite(row.line)
  )) {
    addIssue("INVALID_NUMBER", "line", "line must be a finite number");
  }

  for (const field of ["price", "oppositePrice"]) {
    if (hasOwn(row, field) && !validPrice(row[field])) {
      addIssue("INVALID_PRICE", field, `${field} must be a finite non-zero number`);
    }
  }

  if (hasOwn(row, "predictedProbability") && (
    typeof row.predictedProbability !== "number"
    || !Number.isFinite(row.predictedProbability)
    || row.predictedProbability < 0
    || row.predictedProbability > 1
  )) {
    addIssue(
      "INVALID_PROBABILITY",
      "predictedProbability",
      "predictedProbability must be between zero and one"
    );
  }

  /** @type {Record<string, number | null>} */
  const times = {};
  for (const field of ["predictionAt", "featureCutoffAt", "eventStartAt"]) {
    if (!hasOwn(row, field)) {
      times[field] = null;
      continue;
    }

    times[field] = timestampMilliseconds(row[field]);
    if (times[field] === null) {
      addIssue(
        "INVALID_TIMESTAMP",
        field,
        `${field} must be a valid ISO-8601 UTC timestamp`
      );
    }
  }

  if (
    times.featureCutoffAt !== null
    && times.predictionAt !== null
    && times.featureCutoffAt > times.predictionAt
  ) {
    addIssue(
      "FEATURE_AFTER_PREDICTION",
      "featureCutoffAt",
      "Feature cutoff cannot be after prediction time"
    );
  }

  if (
    times.predictionAt !== null
    && times.eventStartAt !== null
    && times.predictionAt >= times.eventStartAt
  ) {
    addIssue(
      "PREDICTION_NOT_BEFORE_EVENT",
      "predictionAt",
      "Prediction time must be before event start"
    );
  }

  const settledAt = hasOwn(row, "settledAt") ? row.settledAt : undefined;
  const outcome = hasOwn(row, "outcome") ? row.outcome : undefined;
  const hasSettlementTime = settledAt !== null && settledAt !== undefined;
  const hasOutcome = outcome !== null && outcome !== undefined;

  if (hasSettlementTime !== hasOutcome) {
    addIssue(
      "INCOMPLETE_SETTLEMENT",
      "settledAt",
      "settledAt and outcome must either both be set or both be null"
    );
  }

  if (hasOutcome && outcome !== 0 && outcome !== 1) {
    addIssue("INVALID_OUTCOME", "outcome", "outcome must be zero, one, or null");
  }

  if (hasSettlementTime) {
    const settlementTime = timestampMilliseconds(settledAt);
    if (settlementTime === null) {
      addIssue(
        "INVALID_TIMESTAMP",
        "settledAt",
        "settledAt must be a valid ISO-8601 UTC timestamp or null"
      );
    } else if (
      times.eventStartAt !== null
      && settlementTime < times.eventStartAt
    ) {
      addIssue(
        "SETTLEMENT_BEFORE_EVENT",
        "settledAt",
        "Settlement cannot occur before event start"
      );
    }
  }

  if (hasOwn(row, "closingPrice") && row.closingPrice !== null) {
    const closingPrice = row.closingPrice;
    if (!isPlainObject(closingPrice)) {
      addIssue(
        "INVALID_CLOSING_PRICE",
        "closingPrice",
        "closingPrice must be an object or null"
      );
    } else {
      for (const field of [
        "price",
        "oppositePrice",
        "capturedAt",
        "marketClosedAt",
        "isFinal"
      ]) {
        if (!hasOwn(closingPrice, field)) {
          addIssue(
            "INVALID_CLOSING_PRICE",
            `closingPrice.${field}`,
            `closingPrice.${field} is required`
          );
        }
      }

      for (const field of ["price", "oppositePrice"]) {
        if (hasOwn(closingPrice, field) && !validPrice(closingPrice[field])) {
          addIssue(
            "INVALID_CLOSING_PRICE",
            `closingPrice.${field}`,
            `closingPrice.${field} must be a finite non-zero number`
          );
        }
      }

      const capturedAt = timestampMilliseconds(closingPrice.capturedAt);
      const marketClosedAt = timestampMilliseconds(closingPrice.marketClosedAt);

      if (capturedAt === null) {
        addIssue(
          "INVALID_CLOSING_PRICE",
          "closingPrice.capturedAt",
          "closingPrice.capturedAt must be a valid ISO-8601 UTC timestamp"
        );
      }
      if (marketClosedAt === null) {
        addIssue(
          "INVALID_CLOSING_PRICE",
          "closingPrice.marketClosedAt",
          "closingPrice.marketClosedAt must be a valid ISO-8601 UTC timestamp"
        );
      }
      if (typeof closingPrice.isFinal !== "boolean") {
        addIssue(
          "INVALID_CLOSING_PRICE",
          "closingPrice.isFinal",
          "closingPrice.isFinal must be boolean"
        );
      } else if (
        closingPrice.isFinal
        && capturedAt !== null
        && marketClosedAt !== null
        && capturedAt < marketClosedAt
      ) {
        addIssue(
          "FINAL_PRICE_BEFORE_MARKET_CLOSE",
          "closingPrice.capturedAt",
          "A final closing price cannot be captured before market close"
        );
      }
    }
  }

  if (hasOwn(row, "sourceDigests")) {
    if (!Array.isArray(row.sourceDigests)) {
      addIssue(
        "INVALID_SOURCE_DIGEST",
        "sourceDigests",
        "sourceDigests must be an array"
      );
    } else {
      row.sourceDigests.forEach((digest, index) => {
        if (typeof digest !== "string" || !DIGEST_PATTERN.test(digest)) {
          addIssue(
            "INVALID_SOURCE_DIGEST",
            `sourceDigests[${index}]`,
            "Each source digest must be a lowercase SHA-256 digest"
          );
        }
      });
    }
  }

  return issues;
}

function observationKey(row) {
  if (!isPlainObject(row)) {
    return null;
  }

  const values = [
    row.eventId,
    row.marketFamily,
    row.participantId,
    row.side,
    row.line,
    row.modelId,
    row.modelVersion
  ];

  if (
    !values.slice(0, 3).every(validIdentity)
    || (row.side !== "over" && row.side !== "under")
    || typeof row.line !== "number"
    || !Number.isFinite(row.line)
    || !values.slice(5).every(validIdentity)
  ) {
    return null;
  }

  return canonicalStringify(values);
}

/**
 * @param {unknown[]} rows
 * @returns {Array<{
 *   code: string,
 *   path: string,
 *   message: string,
 *   rowIndex: number,
 *   predictionId: string | null,
 *   firstRowIndex?: number
 * }>}
 */
function detectLeakage(rows) {
  if (!Array.isArray(rows)) {
    throw new TypeError("Calibration dataset must be an array");
  }

  /** @type {Array<{
   *   code: string,
   *   path: string,
   *   message: string,
   *   rowIndex: number,
   *   predictionId: string | null,
   *   firstRowIndex?: number
   * }>} */
  const findings = [];
  const predictionIds = new Map();
  const observationKeys = new Map();

  rows.forEach((row, rowIndex) => {
    const predictionId = isPlainObject(row) && typeof row.predictionId === "string"
      ? row.predictionId
      : null;

    validatePredictionRow(row).forEach((issue) => {
      findings.push({ ...issue, rowIndex, predictionId });
    });

    if (predictionId && predictionIds.has(predictionId)) {
      findings.push({
        code: "DUPLICATE_PREDICTION_ID",
        path: "predictionId",
        message: "predictionId duplicates an earlier row",
        rowIndex,
        predictionId,
        firstRowIndex: predictionIds.get(predictionId)
      });
    } else if (predictionId) {
      predictionIds.set(predictionId, rowIndex);
    }

    const key = observationKey(row);
    if (key && observationKeys.has(key)) {
      findings.push({
        code: "DUPLICATE_OBSERVATION",
        path: "$",
        message: "Event, market, participant, side, line, and model key duplicates an earlier row",
        rowIndex,
        predictionId,
        firstRowIndex: observationKeys.get(key)
      });
    } else if (key) {
      observationKeys.set(key, rowIndex);
    }
  });

  return findings;
}

function rowSortKey(row) {
  if (!isPlainObject(row)) {
    return ["", "", canonicalStringify(digestSafeValue(row))];
  }

  const predictionAt = typeof row.predictionAt === "string" ? row.predictionAt : "";
  const predictionId = typeof row.predictionId === "string" ? row.predictionId : "";
  return [
    predictionAt,
    predictionId,
    canonicalStringify(digestSafeValue(row))
  ];
}

function compareRows(left, right) {
  const leftKey = rowSortKey(left);
  const rightKey = rowSortKey(right);

  for (let index = 0; index < leftKey.length; index += 1) {
    const comparison = compareStrings(leftKey[index], rightKey[index]);
    if (comparison !== 0) {
      return comparison;
    }
  }

  return 0;
}

function predictionFeatureView(row) {
  return {
    predictionId: row.predictionId,
    eventId: row.eventId,
    marketFamily: row.marketFamily,
    participantId: row.participantId,
    side: row.side,
    line: row.line,
    price: row.price,
    oppositePrice: row.oppositePrice,
    predictedProbability: row.predictedProbability,
    predictionAt: row.predictionAt,
    featureCutoffAt: row.featureCutoffAt,
    eventStartAt: row.eventStartAt,
    modelId: row.modelId,
    modelVersion: row.modelVersion,
    sourceDigests: Array.isArray(row.sourceDigests)
      ? [...row.sourceDigests].sort(compareStrings)
      : []
  };
}

function incrementCount(counts, key) {
  counts[key] = (counts[key] ?? 0) + 1;
}

function sortedCounts(counts) {
  return Object.fromEntries(
    Object.entries(counts).sort(([left], [right]) => compareStrings(left, right))
  );
}

/**
 * @param {unknown[]} rows
 * @returns {object}
 */
function buildDatasetManifest(rows) {
  if (!Array.isArray(rows)) {
    throw new TypeError("Calibration dataset must be an array");
  }

  const sortedRows = [...rows].sort(compareRows);
  const findings = detectLeakage(sortedRows);
  const invalidIndexes = new Set(findings.map((finding) => finding.rowIndex));
  const duplicateIndexes = new Set(
    findings
      .filter((finding) => finding.code.startsWith("DUPLICATE_"))
      .map((finding) => finding.rowIndex)
  );
  const validRows = /** @type {Record<string, any>[]} */ (
    sortedRows.filter((_row, index) => !invalidIndexes.has(index))
  );
  const marketFamilyCounts = {};
  const modelVersionCounts = {};
  const sourceDigests = new Set();

  for (const row of validRows) {
    incrementCount(marketFamilyCounts, row.marketFamily);
    incrementCount(modelVersionCounts, `${row.modelId}@${row.modelVersion}`);
    if (Array.isArray(row.sourceDigests)) {
      row.sourceDigests.forEach((digest) => sourceDigests.add(digest));
    }
  }

  const predictionTimes = validRows.map((row) => row.predictionAt);
  const settledCount = validRows.filter(
    (row) => row.settledAt !== null && (row.outcome === 0 || row.outcome === 1)
  ).length;

  return {
    schemaVersion: DATASET_SCHEMA_VERSION,
    countBasis: "valid_unique_rows",
    rowCount: rows.length,
    validCount: validRows.length,
    invalidCount: rows.length - validRows.length,
    duplicateCount: duplicateIndexes.size,
    marketFamilyCounts: sortedCounts(marketFamilyCounts),
    modelVersionCounts: sortedCounts(modelVersionCounts),
    minimumPredictionTime: predictionTimes[0] ?? null,
    maximumPredictionTime: predictionTimes[predictionTimes.length - 1] ?? null,
    settledCount,
    settlementCoverage: validRows.length === 0
      ? 0
      : settledCount / validRows.length,
    sourceDigests: [...sourceDigests].sort(compareStrings),
    predictionFeatureDigest: contentDigest(validRows.map(predictionFeatureView)),
    datasetDigestEncoding: "canonical_json_with_invalid_scalar_tags_v1",
    datasetDigest: auditContentDigest(sortedRows),
    findings
  };
}

function validateSplitPolicy(policy) {
  if (
    !isPlainObject(policy)
    || policy.training !== POLICY.training
    || policy.calibration !== POLICY.calibration
    || policy.evaluation !== POLICY.evaluation
    || Object.keys(policy).length !== 3
  ) {
    throw new TypeError(
      "Chronological split fractions must be exactly 0.6, 0.2, and 0.2"
    );
  }
}

function nearestBoundary(cumulativeCounts, target, minimumIndex, maximumIndex) {
  let selectedIndex = minimumIndex;
  let selectedDistance = Number.POSITIVE_INFINITY;

  for (let index = minimumIndex; index <= maximumIndex; index += 1) {
    const distance = Math.abs(cumulativeCounts[index] - target);
    if (distance < selectedDistance) {
      selectedDistance = distance;
      selectedIndex = index;
    }
  }

  return selectedIndex;
}

/**
 * @param {unknown[]} rows
 * @param {{ training: number, calibration: number, evaluation: number }} policy
 * @returns {{
 *   training: object[],
 *   calibration: object[],
 *   evaluation: object[],
 *   cutoffs: { training: string, calibration: string, evaluation: string },
 *   actualFractions: { training: number, calibration: number, evaluation: number }
 * }}
 */
function chronologicalSplit(rows, policy) {
  if (!Array.isArray(rows)) {
    throw new TypeError("Calibration dataset must be an array");
  }
  validateSplitPolicy(policy);

  const findings = detectLeakage(rows);
  if (findings.length > 0) {
    throw new TypeError(
      `Chronological split refuses ${findings.length} invalid or duplicate finding(s)`
    );
  }

  const sortedRows = rows.map(cloneJson).sort(compareRows);
  const groups = [];

  for (const row of sortedRows) {
    const previous = groups[groups.length - 1];
    if (previous && previous.predictionAt === row.predictionAt) {
      previous.rows.push(row);
    } else {
      groups.push({ predictionAt: row.predictionAt, rows: [row] });
    }
  }

  if (groups.length < 3) {
    throw new TypeError(
      "Chronological split requires at least three distinct prediction timestamps"
    );
  }

  const cumulativeCounts = [];
  let cumulative = 0;
  for (const group of groups) {
    cumulative += group.rows.length;
    cumulativeCounts.push(cumulative);
  }

  const trainingEnd = nearestBoundary(
    cumulativeCounts,
    sortedRows.length * POLICY.training,
    0,
    groups.length - 3
  );
  const calibrationEnd = nearestBoundary(
    cumulativeCounts,
    sortedRows.length * (POLICY.training + POLICY.calibration),
    trainingEnd + 1,
    groups.length - 2
  );
  const training = groups
    .slice(0, trainingEnd + 1)
    .flatMap((group) => group.rows);
  const calibration = groups
    .slice(trainingEnd + 1, calibrationEnd + 1)
    .flatMap((group) => group.rows);
  const evaluation = groups
    .slice(calibrationEnd + 1)
    .flatMap((group) => group.rows);

  return {
    training,
    calibration,
    evaluation,
    cutoffs: {
      training: training[training.length - 1].predictionAt,
      calibration: calibration[calibration.length - 1].predictionAt,
      evaluation: evaluation[0].predictionAt
    },
    actualFractions: {
      training: training.length / sortedRows.length,
      calibration: calibration.length / sortedRows.length,
      evaluation: evaluation.length / sortedRows.length
    }
  };
}

module.exports = {
  buildDatasetManifest,
  chronologicalSplit,
  detectLeakage,
  validatePredictionRow
};
