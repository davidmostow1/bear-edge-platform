const fs = require("node:fs");

const SUPPORTED_SCHEMA_VERSION = "1.0.0";
const SWEET_BEAR_MODEL_KEY = "sweet_bear";
const BEAR_EDGE_MODEL_KEY = "bear_edge";
const MARKET_BASELINE_MODEL_KEY = "market_baseline";
const KNOWN_MODEL_KEYS = Object.freeze([
  SWEET_BEAR_MODEL_KEY,
  BEAR_EDGE_MODEL_KEY,
  MARKET_BASELINE_MODEL_KEY
]);
const IMPLEMENTATION_DIGEST_PATTERN = /^[0-9a-f]{64}$/;
const SHARED_MARKET_FAMILIES = Object.freeze([
  "pitcher_strikeouts",
  "batter_hits",
  "batter_runs",
  "batter_total_bases"
]);

/**
 * @param {unknown} value
 * @returns {value is Record<string, unknown>}
 */
function isPlainObject(value) {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

/**
 * @param {unknown} value
 * @returns {value is string}
 */
function isNonEmptyString(value) {
  return typeof value === "string" && value.trim().length > 0;
}

/**
 * Parses an ISO-8601 instant and rejects anything lossy or ambiguous.
 *
 * @param {unknown} value
 * @param {string} label
 * @returns {number} epoch milliseconds
 */
function parseInstant(value, label) {
  if (!isNonEmptyString(value)) {
    throw new TypeError(`${label} must be a non-empty ISO-8601 string`);
  }

  const parsed = Date.parse(value);

  if (!Number.isFinite(parsed)) {
    throw new TypeError(`${label} must be a valid ISO-8601 instant`);
  }

  return parsed;
}

/**
 * @param {unknown} value
 * @param {string} label
 * @returns {string}
 */
function requireString(value, label) {
  if (!isNonEmptyString(value)) {
    throw new TypeError(`${label} must be a non-empty string`);
  }

  return value;
}

/**
 * The comparison key is the join surface for the entire harness. It must encode
 * event, subject, market, side, and line so that two models cannot be paired
 * unless they answered the identical question.
 *
 * @param {unknown} value
 * @returns {string}
 */
function requireComparisonKey(value) {
  const comparisonKey = requireString(value, "comparisonKey");
  const segments = comparisonKey.split("|");

  if (segments.length < 5) {
    throw new TypeError(
      "comparisonKey must contain event, subject, market, selection, and line segments"
    );
  }
  if (segments.some((segment) => segment.trim().length === 0)) {
    throw new TypeError("comparisonKey segments must not be empty");
  }

  return comparisonKey;
}

/**
 * @param {unknown} value
 * @returns {number}
 */
function requireStrictProbability(value) {
  if (typeof value !== "number" || !Number.isFinite(value)) {
    throw new TypeError("probability must be a finite number");
  }
  if (value <= 0 || value >= 1) {
    throw new RangeError("probability must be strictly between zero and one");
  }

  return value;
}

/**
 * @param {unknown} value
 * @returns {string}
 */
function requireImplementationDigest(value) {
  const digest = requireString(value, "implementationDigest");

  if (!IMPLEMENTATION_DIGEST_PATTERN.test(digest)) {
    throw new TypeError(
      "implementationDigest must be a 64-character lowercase sha256 hex digest"
    );
  }

  return digest;
}

/**
 * @param {unknown} value
 * @returns {string}
 */
function requireSchemaVersion(value) {
  const schemaVersion = requireString(value, "schemaVersion");

  if (schemaVersion !== SUPPORTED_SCHEMA_VERSION) {
    throw new TypeError(
      `schemaVersion must be ${SUPPORTED_SCHEMA_VERSION}, received ${schemaVersion}`
    );
  }

  return schemaVersion;
}

/**
 * Enforces evidenceCutoffAt <= predictedAt <= eventStartAt. This is the single
 * constraint that prevents hindsight from entering the ledger.
 *
 * @param {{
 *   evidenceCutoffAt: number,
 *   predictedAt: number,
 *   eventStartAt: number
 * }} instants
 */
function assertChronology(instants) {
  if (instants.evidenceCutoffAt > instants.predictedAt) {
    throw new RangeError(
      "chronology violation: evidenceCutoffAt must not follow predictedAt"
    );
  }
  if (instants.predictedAt > instants.eventStartAt) {
    throw new RangeError(
      "chronology violation: predictedAt must not follow eventStartAt"
    );
  }
}

/**
 * @param {unknown} value
 * @returns {{
 *   schemaVersion: string,
 *   predictionId: string,
 *   modelKey: string,
 *   modelId: string,
 *   modelVersion: string,
 *   implementationDigest: string,
 *   comparisonKey: string,
 *   eventId: string,
 *   marketFamily: string,
 *   selectionKey: string,
 *   probability: number,
 *   eventStartAt: string,
 *   evidenceCutoffAt: string,
 *   predictedAt: string,
 *   eventStartAtMs: number,
 *   evidenceCutoffAtMs: number,
 *   predictedAtMs: number
 * }}
 */
function parsePredictionRecord(value) {
  if (!isPlainObject(value)) {
    throw new TypeError("Prediction record must be a JSON object");
  }

  const modelKey = requireString(value.modelKey, "modelKey");

  if (!KNOWN_MODEL_KEYS.includes(modelKey)) {
    throw new TypeError(
      `modelKey must be one of ${KNOWN_MODEL_KEYS.join(", ")}, received ${modelKey}`
    );
  }

  const eventStartAt = requireString(value.eventStartAt, "eventStartAt");
  const evidenceCutoffAt = requireString(value.evidenceCutoffAt, "evidenceCutoffAt");
  const predictedAt = requireString(value.predictedAt, "predictedAt");
  const eventStartAtMs = parseInstant(eventStartAt, "eventStartAt");
  const evidenceCutoffAtMs = parseInstant(evidenceCutoffAt, "evidenceCutoffAt");
  const predictedAtMs = parseInstant(predictedAt, "predictedAt");

  assertChronology({
    evidenceCutoffAt: evidenceCutoffAtMs,
    predictedAt: predictedAtMs,
    eventStartAt: eventStartAtMs
  });

  return {
    schemaVersion: requireSchemaVersion(value.schemaVersion),
    predictionId: requireString(value.predictionId, "predictionId"),
    modelKey,
    modelId: requireString(value.modelId, "modelId"),
    modelVersion: requireString(value.modelVersion, "modelVersion"),
    implementationDigest: requireImplementationDigest(value.implementationDigest),
    comparisonKey: requireComparisonKey(value.comparisonKey),
    eventId: requireString(value.eventId, "eventId"),
    marketFamily: requireString(value.marketFamily, "marketFamily"),
    selectionKey: requireString(value.selectionKey, "selectionKey"),
    probability: requireStrictProbability(value.probability),
    eventStartAt,
    evidenceCutoffAt,
    predictedAt,
    eventStartAtMs,
    evidenceCutoffAtMs,
    predictedAtMs
  };
}

/**
 * @param {unknown} value
 * @returns {{
 *   schemaVersion: string,
 *   comparisonKey: string,
 *   eventId: string,
 *   eventStartAt: string,
 *   result: number,
 *   officialSource: string,
 *   officialSourceUrl: string,
 *   settledAt: string,
 *   eventStartAtMs: number,
 *   settledAtMs: number
 * }}
 */
function parseOutcomeRecord(value) {
  if (!isPlainObject(value)) {
    throw new TypeError("Outcome record must be a JSON object");
  }
  if (value.result !== 0 && value.result !== 1) {
    throw new TypeError(
      "result must be exactly 0 or 1; pushes, voids, and unresolved corrections stay out of the settled ledger"
    );
  }

  const officialSource = requireString(value.officialSource, "officialSource");

  if (officialSource !== "official_mlb") {
    throw new TypeError(
      `officialSource must be official_mlb, received ${officialSource}`
    );
  }

  const eventStartAt = requireString(value.eventStartAt, "eventStartAt");
  const settledAt = requireString(value.settledAt, "settledAt");
  const eventStartAtMs = parseInstant(eventStartAt, "eventStartAt");
  const settledAtMs = parseInstant(settledAt, "settledAt");

  if (settledAtMs < eventStartAtMs) {
    throw new RangeError("chronology violation: settledAt must not precede eventStartAt");
  }

  return {
    schemaVersion: requireSchemaVersion(value.schemaVersion),
    comparisonKey: requireComparisonKey(value.comparisonKey),
    eventId: requireString(value.eventId, "eventId"),
    eventStartAt,
    result: value.result,
    officialSource,
    officialSourceUrl: requireString(value.officialSourceUrl, "officialSourceUrl"),
    settledAt,
    eventStartAtMs,
    settledAtMs
  };
}

/**
 * Reads a JSONL ledger. Malformed lines are collected rather than thrown so a
 * single bad append cannot silently drop an entire day of otherwise valid
 * records; the caller decides whether to proceed.
 *
 * @param {string} filePath
 * @param {(value: unknown) => object} parser
 * @returns {{ records: object[], rejects: Array<{ line: number, reason: string, raw: string }> }}
 */
function readJsonlLedger(filePath, parser) {
  if (!isNonEmptyString(filePath)) {
    throw new TypeError("Ledger path must be a non-empty string");
  }
  if (!fs.existsSync(filePath)) {
    return { records: [], rejects: [] };
  }

  const contents = fs.readFileSync(filePath, "utf8");
  const records = [];
  const rejects = [];

  contents.split("\n").forEach((rawLine, index) => {
    const line = rawLine.trim();

    if (line.length === 0) {
      return;
    }

    try {
      records.push(parser(JSON.parse(line)));
    } catch (error) {
      rejects.push({
        line: index + 1,
        reason: error instanceof Error ? error.message : String(error),
        raw: line.slice(0, 200)
      });
    }
  });

  return { records, rejects };
}

/**
 * Enforces append-only immutability at read time: one record per model per
 * comparison key, and globally unique prediction identifiers.
 *
 * @param {object[]} predictions
 * @returns {Array<{ line: number, reason: string, raw: string }>}
 */
function findDuplicatePredictions(predictions) {
  const seenPredictionIds = new Map();
  const seenModelComparison = new Map();
  const duplicates = [];

  predictions.forEach((prediction, index) => {
    if (seenPredictionIds.has(prediction.predictionId)) {
      duplicates.push({
        line: index + 1,
        reason: `duplicate predictionId ${prediction.predictionId}`,
        raw: prediction.predictionId
      });
    } else {
      seenPredictionIds.set(prediction.predictionId, index);
    }

    const modelComparison = `${prediction.modelKey}::${prediction.comparisonKey}`;

    if (seenModelComparison.has(modelComparison)) {
      duplicates.push({
        line: index + 1,
        reason: `duplicate prediction for ${modelComparison}; the ledger is append-only and must not restate a comparison`,
        raw: prediction.predictionId
      });
    } else {
      seenModelComparison.set(modelComparison, index);
    }
  });

  return duplicates;
}

module.exports = {
  BEAR_EDGE_MODEL_KEY,
  IMPLEMENTATION_DIGEST_PATTERN,
  KNOWN_MODEL_KEYS,
  MARKET_BASELINE_MODEL_KEY,
  SHARED_MARKET_FAMILIES,
  SUPPORTED_SCHEMA_VERSION,
  SWEET_BEAR_MODEL_KEY,
  assertChronology,
  findDuplicatePredictions,
  parseOutcomeRecord,
  parsePredictionRecord,
  readJsonlLedger
};
