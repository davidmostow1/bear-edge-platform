const crypto = require("node:crypto");

const { canonicalStringify, contentDigest } = require("./canonical-json.js");
const { getSettlementEconomicsIssue } = require("./settlement-economics.js");

const AUDIT_RECORD_SCHEMA_VERSION = "2.1.0";
const SUPPORTED_AUDIT_RECORD_SCHEMA_VERSIONS = Object.freeze(["2.0.0", AUDIT_RECORD_SCHEMA_VERSION]);
const EVALUATION_VERDICTS = Object.freeze(["PASS", "WAIT", "BET"]);
const OPERATIONAL_PERMISSIONS = Object.freeze(["WAIT", "PRICE_CHECK_ONLY", "VERIFIED_BETS_ALLOWED"]);
const MODEL_STATUSES = Object.freeze(["research_only", "shadow", "validated", "retired"]);
const SETTLEMENT_OUTCOMES = Object.freeze(["pending", "win", "loss", "push", "void"]);
const PREDICTION_OUTCOMES = Object.freeze(["win", "loss", "push", "void"]);
const RECORD_TYPES = Object.freeze([
  "evaluation",
  "settlement",
  "amendment",
  "prediction_outcome",
  "closing_price",
  "sync_event",
  "model_promotion"
]);
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const DIGEST_PATTERN = /^[a-f0-9]{64}$/;

const AUDIT_RECORD_SCHEMA = Object.freeze({
  $schema: "https://json-schema.org/draft/2020-12/schema",
  title: "Bear Edge Authoritative Audit Record",
  type: "object",
  required: [
    "schemaVersion",
    "id",
    "clientEventId",
    "recordType",
    "createdAt",
    "authority",
    "contentDigest"
  ],
  properties: {
    schemaVersion: { enum: SUPPORTED_AUDIT_RECORD_SCHEMA_VERSIONS },
    id: { type: "string" },
    clientEventId: { type: "string", format: "uuid" },
    recordType: { enum: RECORD_TYPES },
    createdAt: { type: "string", format: "date-time" },
    authority: { const: "local" },
    contentDigest: { type: "string", pattern: "^[a-f0-9]{64}$" },
    verdict: { enum: EVALUATION_VERDICTS },
    permission: { enum: OPERATIONAL_PERMISSIONS },
    outcome: { enum: SETTLEMENT_OUTCOMES }
  }
});

function isPlainObject(value) {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function isNonEmptyString(value) {
  return typeof value === "string" && value.trim().length > 0;
}

function isSupportedAuditRecordSchemaVersion(value) {
  return SUPPORTED_AUDIT_RECORD_SCHEMA_VERSIONS.includes(value);
}

function cloneJson(value) {
  return JSON.parse(canonicalStringify(value));
}

function valueOrNull(value) {
  return value === undefined ? null : value;
}

function arrayOrEmpty(value) {
  return Array.isArray(value) ? cloneJson(value) : [];
}

function objectWithFields(value, fields) {
  const source = isPlainObject(value) ? value : {};

  return Object.fromEntries(fields.map((field) => [field, valueOrNull(source[field])]));
}

function resolveIdentity(context, prefix) {
  const clientEventId = context?.clientEventId ?? crypto.randomUUID();
  const createdAt = context?.createdAt ?? new Date().toISOString();

  return {
    schemaVersion: AUDIT_RECORD_SCHEMA_VERSION,
    id: `${prefix}_${clientEventId}`,
    clientEventId,
    createdAt,
    authority: "local"
  };
}

function finalizeRecord(record) {
  const finalized = {
    ...record,
    contentDigest: contentDigest(record)
  };
  const validation = validateAuditRecord(finalized);

  if (!validation.valid) {
    const details = validation.issues.map((issue) => `${issue.path}: ${issue.message}`).join("; ");
    throw new TypeError(`Invalid audit record: ${details}`);
  }

  return finalized;
}

function createEvaluationRecord(input, context = {}) {
  if (!isPlainObject(input)) {
    throw new TypeError("Evaluation input must be an object.");
  }

  const decision = isPlainObject(input.decision) ? input.decision : {};
  const record = {
    ...resolveIdentity(context, "eval"),
    recordType: "evaluation",
    origin: objectWithFields(input.origin, ["channel", "actorType", "sessionId", "requestId"]),
    event: objectWithFields(input.event, [
      "sport",
      "league",
      "eventId",
      "startTime",
      "homeTeam",
      "awayTeam"
    ]),
    market: objectWithFields(input.market, [
      "marketFamily",
      "marketType",
      "participantId",
      "participantName",
      "selection",
      "side",
      "line"
    ]),
    price: objectWithFields(input.price, [
      "sportsbook",
      "marketOdds",
      "oppositeOdds",
      "priceCapturedAt",
      "priceSourceTime"
    ]),
    sources: Array.isArray(input.sources)
      ? input.sources.map((source) => objectWithFields(source, [
          "provider",
          "sourceType",
          "sourceLocator",
          "parserVersion",
          "capturedAt",
          "sourceTime",
          "digest",
          "freshness",
          "verificationStatus"
        ]))
      : [],
    model: objectWithFields(input.model, [
      "modelId",
      "modelVersion",
      "probabilityMethod",
      "modelStatus",
      "calibrationReportId",
      "trainingCutoff",
      "sampleSize"
    ]),
    probability: objectWithFields(input.probability, [
      "rawModelProbability",
      "adjustedProbability",
      "marketImpliedProbability",
      "marketNoVigProbability"
    ]),
    edge: objectWithFields(input.edge, ["fairEdge", "priceEdge", "expectedValueRoi", "kellyFraction"]),
    stake: objectWithFields(input.stake, ["recommendedStake", "bankroll", "stakePolicyVersion"]),
    verdict: valueOrNull(decision.verdict),
    permission: valueOrNull(decision.permission),
    reasons: arrayOrEmpty(decision.reasons),
    riskFlags: arrayOrEmpty(decision.riskFlags),
    gateResults: arrayOrEmpty(decision.gateResults),
    audit: objectWithFields(input.audit, [
      "codeVersion",
      "configurationDigest",
      "calculationVersion",
      "evidenceCompleteness",
      "warnings"
    ])
  };

  if (!Array.isArray(record.audit.warnings)) {
    record.audit.warnings = [];
  } else {
    record.audit.warnings = cloneJson(record.audit.warnings);
  }

  if (record.verdict !== "BET" || record.permission !== "VERIFIED_BETS_ALLOWED") {
    record.stake.recommendedStake = 0;
  }

  return finalizeRecord(record);
}

function createSettlementAuditRecord(input, context = {}) {
  if (!isPlainObject(input)) {
    throw new TypeError("Settlement input must be an object.");
  }

  return finalizeRecord({
    ...resolveIdentity(context, "settle"),
    recordType: "settlement",
    evaluationId: valueOrNull(input.evaluationId),
    settledAt: valueOrNull(input.settledAt ?? context.createdAt ?? new Date().toISOString()),
    outcome: valueOrNull(input.outcome ?? "pending"),
    closingOdds: valueOrNull(input.closingOdds),
    closingOppositeOdds: valueOrNull(input.closingOppositeOdds),
    closingLineEvidence: isPlainObject(input.closingLineEvidence)
      ? objectWithFields(input.closingLineEvidence, [
          "sportsbook",
          "capturedAt",
          "marketClosedAt",
          "isFinal",
          "sourceLocator",
          "sourceDigest"
        ])
      : null,
    stake: valueOrNull(input.stake),
    profit: valueOrNull(input.profit),
    notes: arrayOrEmpty(
      typeof input.notes === "string" ? [input.notes] : input.notes
    )
  });
}

function createPredictionOutcomeRecord(input, context = {}) {
  if (!isPlainObject(input)) {
    throw new TypeError("Prediction outcome input must be an object.");
  }

  return finalizeRecord({
    ...resolveIdentity(context, "outcome"),
    recordType: "prediction_outcome",
    evaluationId: valueOrNull(input.evaluationId),
    supersedesId: valueOrNull(input.supersedesId),
    outcome: valueOrNull(input.outcome),
    resolvedAt: valueOrNull(input.resolvedAt),
    eventResult: objectWithFields(input.eventResult, ["status", "homeScore", "awayScore"]),
    marketResult: objectWithFields(input.marketResult, ["observedValue", "unit"]),
    source: objectWithFields(input.source, [
      "provider",
      "sourceType",
      "sourceLocator",
      "capturedAt",
      "sourceTime",
      "digest",
      "verificationStatus"
    ]),
    notes: arrayOrEmpty(typeof input.notes === "string" ? [input.notes] : input.notes)
  });
}

function createClosingPriceRecord(input, context = {}) {
  if (!isPlainObject(input)) {
    throw new TypeError("Closing price input must be an object.");
  }

  return finalizeRecord({
    ...resolveIdentity(context, "close"),
    recordType: "closing_price",
    evaluationId: valueOrNull(input.evaluationId),
    supersedesId: valueOrNull(input.supersedesId),
    price: objectWithFields(input.price, [
      "sportsbook",
      "marketOdds",
      "oppositeOdds",
      "marketClosedAt",
      "isFinal"
    ]),
    source: objectWithFields(input.source, [
      "provider",
      "sourceType",
      "sourceLocator",
      "capturedAt",
      "sourceTime",
      "digest",
      "verificationStatus"
    ]),
    notes: arrayOrEmpty(typeof input.notes === "string" ? [input.notes] : input.notes)
  });
}

function createAmendmentRecord(input, context = {}) {
  if (!isPlainObject(input)) {
    throw new TypeError("Amendment input must be an object.");
  }

  return finalizeRecord({
    ...resolveIdentity(context, "amend"),
    recordType: "amendment",
    evaluationId: valueOrNull(input.evaluationId),
    settlementId: valueOrNull(input.settlementId),
    reason: valueOrNull(input.reason),
    patch: isPlainObject(input.patch) ? cloneJson(input.patch) : valueOrNull(input.patch)
  });
}

function validateAuditRecord(record) {
  const issues = [];
  const addIssue = (path, message) => issues.push({ path, message });
  const requireProperty = (object, property, path = property) => {
    if (!Object.prototype.hasOwnProperty.call(object, property)) {
      addIssue(path, "is required.");
      return false;
    }

    return true;
  };
  const validateObjectFields = (object, path, fields) => {
    if (!isPlainObject(object)) {
      addIssue(path, "must be an object.");
      return;
    }

    for (const field of fields) {
      requireProperty(object, field, `${path}.${field}`);
    }
  };
  const validateIsoTimestamp = (value, path, nullable = true) => {
    if (value === null && nullable) {
      return;
    }

    if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{3})?Z$/.test(value) || !Number.isFinite(Date.parse(value))) {
      addIssue(path, "must be a valid ISO-8601 UTC timestamp.");
    }
  };
  const validateFinite = (value, path, options = {}) => {
    if (value === null && options.nullable !== false) {
      return;
    }

    if (typeof value !== "number" || !Number.isFinite(value)) {
      addIssue(path, "must be a finite number or null.");
      return;
    }

    if (options.min !== undefined && value < options.min) {
      addIssue(path, `must be at least ${options.min}.`);
    }

    if (options.max !== undefined && value > options.max) {
      addIssue(path, `must be at most ${options.max}.`);
    }
  };
  const validateSafeInteger = (value, path, options = {}) => {
    if (value === null && options.nullable !== false) {
      return;
    }

    if (!Number.isSafeInteger(value)) {
      addIssue(path, "must be a safe integer or null.");
      return;
    }

    if (options.min !== undefined && value < options.min) {
      addIssue(path, `must be at least ${options.min}.`);
    }

    if (options.max !== undefined && value > options.max) {
      addIssue(path, `must be at most ${options.max}.`);
    }
  };
  const validateSourceEvidence = (source, path, requiredVerificationStatus) => {
    validateObjectFields(source, path, [
      "provider",
      "sourceType",
      "sourceLocator",
      "capturedAt",
      "sourceTime",
      "digest",
      "verificationStatus"
    ]);

    if (!isPlainObject(source)) {
      return;
    }

    for (const field of ["provider", "sourceType", "sourceLocator"]) {
      if (!isNonEmptyString(source[field])) {
        addIssue(`${path}.${field}`, "must be a non-empty string.");
      }
    }
    validateIsoTimestamp(source.capturedAt, `${path}.capturedAt`, false);
    validateIsoTimestamp(source.sourceTime, `${path}.sourceTime`, false);
    if (!DIGEST_PATTERN.test(source.digest ?? "")) {
      addIssue(`${path}.digest`, "must be a 64-character lowercase SHA-256 digest.");
    }
    if (source.verificationStatus !== requiredVerificationStatus) {
      addIssue(`${path}.verificationStatus`, `must equal ${requiredVerificationStatus}.`);
    }

    const capturedAt = Date.parse(source.capturedAt ?? "");
    const sourceTime = Date.parse(source.sourceTime ?? "");
    if (Number.isFinite(capturedAt) && Number.isFinite(sourceTime) && sourceTime > capturedAt) {
      addIssue(`${path}.sourceTime`, "cannot be after capturedAt.");
    }
  };
  const validateSupersedesId = (value, path, prefix) => {
    const uuid = typeof value === "string" ? value.slice(prefix.length + 1) : "";
    if (value !== null && (
      !isNonEmptyString(value)
      || !value.startsWith(`${prefix}_`)
      || !UUID_PATTERN.test(uuid)
      || value !== `${prefix}_${uuid}`
    )) {
      addIssue(path, `must be null or a ${prefix}_ record id.`);
    }
  };
  const validateNotes = (value, path = "notes") => {
    if (!Array.isArray(value) || value.some((note) => typeof note !== "string")) {
      addIssue(path, "must be an array of strings.");
    }
  };

  if (!isPlainObject(record)) {
    return { valid: false, issues: [{ path: "$", message: "must be an object." }] };
  }

  for (const property of [
    "schemaVersion",
    "id",
    "clientEventId",
    "recordType",
    "createdAt",
    "authority",
    "contentDigest"
  ]) {
    requireProperty(record, property);
  }

  if (!isSupportedAuditRecordSchemaVersion(record.schemaVersion)) {
    addIssue("schemaVersion", `must be one of: ${SUPPORTED_AUDIT_RECORD_SCHEMA_VERSIONS.join(", ")}.`);
  }

  if (
    ["prediction_outcome", "closing_price"].includes(record.recordType)
    && record.schemaVersion !== AUDIT_RECORD_SCHEMA_VERSION
  ) {
    addIssue("schemaVersion", `${record.recordType} records require ${AUDIT_RECORD_SCHEMA_VERSION}.`);
  }

  if (!RECORD_TYPES.includes(record.recordType)) {
    addIssue("recordType", `must be one of: ${RECORD_TYPES.join(", ")}.`);
  }

  if (!UUID_PATTERN.test(record.clientEventId ?? "")) {
    addIssue("clientEventId", "must be a UUID.");
  }

  const expectedPrefix = {
    evaluation: "eval",
    settlement: "settle",
    amendment: "amend",
    prediction_outcome: "outcome",
    closing_price: "close"
  }[record.recordType];

  if (expectedPrefix && record.id !== `${expectedPrefix}_${record.clientEventId}`) {
    addIssue("id", `must equal ${expectedPrefix}_ plus clientEventId.`);
  }

  validateIsoTimestamp(record.createdAt, "createdAt", false);

  if (record.authority !== "local") {
    addIssue("authority", "must equal local.");
  }

  if (!DIGEST_PATTERN.test(record.contentDigest ?? "")) {
    addIssue("contentDigest", "must be a 64-character lowercase SHA-256 digest.");
  } else {
    const { contentDigest: recordedDigest, ...digestInput } = record;

    try {
      if (contentDigest(digestInput) !== recordedDigest) {
        addIssue("contentDigest", "does not match the canonical record content.");
      }
    } catch (error) {
      addIssue("contentDigest", `cannot be verified: ${error.message}`);
    }
  }

  if (record.recordType === "evaluation") {
    validateObjectFields(record.origin, "origin", ["channel", "actorType", "sessionId", "requestId"]);
    validateObjectFields(record.event, "event", [
      "sport",
      "league",
      "eventId",
      "startTime",
      "homeTeam",
      "awayTeam"
    ]);
    validateObjectFields(record.market, "market", [
      "marketFamily",
      "marketType",
      "participantId",
      "participantName",
      "selection",
      "side",
      "line"
    ]);
    validateObjectFields(record.price, "price", [
      "sportsbook",
      "marketOdds",
      "oppositeOdds",
      "priceCapturedAt",
      "priceSourceTime"
    ]);
    validateObjectFields(record.model, "model", [
      "modelId",
      "modelVersion",
      "probabilityMethod",
      "modelStatus",
      "calibrationReportId",
      "trainingCutoff",
      "sampleSize"
    ]);
    validateObjectFields(record.probability, "probability", [
      "rawModelProbability",
      "adjustedProbability",
      "marketImpliedProbability",
      "marketNoVigProbability"
    ]);
    validateObjectFields(record.edge, "edge", ["fairEdge", "priceEdge", "expectedValueRoi", "kellyFraction"]);
    validateObjectFields(record.stake, "stake", ["recommendedStake", "bankroll", "stakePolicyVersion"]);
    validateObjectFields(record.audit, "audit", [
      "codeVersion",
      "configurationDigest",
      "calculationVersion",
      "evidenceCompleteness",
      "warnings"
    ]);

    if (!Array.isArray(record.sources)) {
      addIssue("sources", "must be an array.");
    } else {
      record.sources.forEach((source, index) => {
        const path = `sources[${index}]`;
        validateObjectFields(source, path, [
          "provider",
          "sourceType",
          "sourceLocator",
          "parserVersion",
          "capturedAt",
          "sourceTime",
          "digest",
          "freshness",
          "verificationStatus"
        ]);

        if (isPlainObject(source)) {
          validateIsoTimestamp(source.capturedAt, `${path}.capturedAt`);
          validateIsoTimestamp(source.sourceTime, `${path}.sourceTime`);

          if (source.digest !== null && !DIGEST_PATTERN.test(source.digest ?? "")) {
            addIssue(`${path}.digest`, "must be a 64-character lowercase SHA-256 digest or null.");
          }
        }
      });
    }

    if (!EVALUATION_VERDICTS.includes(record.verdict)) {
      addIssue("verdict", `must be one of: ${EVALUATION_VERDICTS.join(", ")}.`);
    }

    if (!OPERATIONAL_PERMISSIONS.includes(record.permission)) {
      addIssue("permission", `must be one of: ${OPERATIONAL_PERMISSIONS.join(", ")}.`);
    }

    if (record.verdict === "BET" && record.permission !== "VERIFIED_BETS_ALLOWED") {
      addIssue("permission", "must be VERIFIED_BETS_ALLOWED for a BET verdict.");
    }

    for (const field of ["reasons", "riskFlags", "gateResults"]) {
      if (!Array.isArray(record[field])) {
        addIssue(field, "must be an array.");
      }
    }

    if (isPlainObject(record.event)) {
      validateIsoTimestamp(record.event.startTime, "event.startTime");
    }

    if (isPlainObject(record.price)) {
      validateFinite(record.price.marketOdds, "price.marketOdds");
      validateFinite(record.price.oppositeOdds, "price.oppositeOdds");
      validateIsoTimestamp(record.price.priceCapturedAt, "price.priceCapturedAt");
      validateIsoTimestamp(record.price.priceSourceTime, "price.priceSourceTime");
    }

    if (isPlainObject(record.market)) {
      validateFinite(record.market.line, "market.line");
    }

    if (isPlainObject(record.model)) {
      if (!MODEL_STATUSES.includes(record.model.modelStatus)) {
        addIssue("model.modelStatus", `must be one of: ${MODEL_STATUSES.join(", ")}.`);
      }

      validateIsoTimestamp(record.model.trainingCutoff, "model.trainingCutoff");
      validateFinite(record.model.sampleSize, "model.sampleSize", { min: 0 });

      if (record.verdict === "BET" && record.model.modelStatus !== "validated") {
        addIssue("model.modelStatus", "must be validated for a BET verdict.");
      }

      if (
        record.verdict === "BET"
        && (typeof record.model.calibrationReportId !== "string" || !record.model.calibrationReportId.trim())
      ) {
        addIssue("model.calibrationReportId", "must identify the verified calibration report for a BET verdict.");
      }
    }

    if (isPlainObject(record.probability)) {
      for (const field of [
        "rawModelProbability",
        "adjustedProbability",
        "marketImpliedProbability",
        "marketNoVigProbability"
      ]) {
        validateFinite(record.probability[field], `probability.${field}`, { min: 0, max: 1 });
      }
    }

    if (isPlainObject(record.edge)) {
      for (const field of ["fairEdge", "priceEdge", "expectedValueRoi"]) {
        validateFinite(record.edge[field], `edge.${field}`);
      }
      validateFinite(record.edge.kellyFraction, "edge.kellyFraction", { min: 0, max: 1 });
    }

    if (isPlainObject(record.stake)) {
      validateFinite(record.stake.recommendedStake, "stake.recommendedStake", { min: 0 });
      validateFinite(record.stake.bankroll, "stake.bankroll", { min: 0 });

      if (
        (record.verdict !== "BET" || record.permission !== "VERIFIED_BETS_ALLOWED")
        && record.stake.recommendedStake !== 0
      ) {
        addIssue(
          "stake.recommendedStake",
          "must equal zero unless verdict is BET and permission is VERIFIED_BETS_ALLOWED."
        );
      }
    }

    if (isPlainObject(record.audit)) {
      if (record.audit.configurationDigest !== null && !DIGEST_PATTERN.test(record.audit.configurationDigest ?? "")) {
        addIssue("audit.configurationDigest", "must be a 64-character lowercase SHA-256 digest or null.");
      }

      if (!Array.isArray(record.audit.warnings)) {
        addIssue("audit.warnings", "must be an array.");
      }
    }

    if (record.verdict === "BET") {
      const createdAtMs = Date.parse(record.createdAt ?? "");
      const requireString = (value, path) => {
        if (!isNonEmptyString(value)) {
          addIssue(path, "must be a non-empty string for a BET verdict.");
        }
      };
      const requirePositive = (value, path) => {
        if (typeof value !== "number" || !Number.isFinite(value) || value <= 0) {
          addIssue(path, "must be greater than zero for a BET verdict.");
        }
      };
      const requirePrice = (value, path) => {
        if (typeof value !== "number" || !Number.isFinite(value) || value === 0) {
          addIssue(path, "must be a non-zero finite price for a BET verdict.");
        }
      };

      requireString(record.origin?.channel, "origin.channel");
      requireString(record.origin?.actorType, "origin.actorType");
      requireString(record.event?.sport, "event.sport");
      requireString(record.event?.league, "event.league");
      requireString(record.event?.eventId, "event.eventId");
      requireString(record.event?.startTime, "event.startTime");
      requireString(record.market?.marketFamily, "market.marketFamily");
      requireString(record.market?.marketType, "market.marketType");
      requireString(record.market?.selection, "market.selection");
      requireString(record.price?.sportsbook, "price.sportsbook");
      requirePrice(record.price?.marketOdds, "price.marketOdds");
      requirePrice(record.price?.oppositeOdds, "price.oppositeOdds");
      requireString(record.price?.priceCapturedAt, "price.priceCapturedAt");
      requireString(record.price?.priceSourceTime, "price.priceSourceTime");
      requireString(record.model?.modelId, "model.modelId");
      requireString(record.model?.modelVersion, "model.modelVersion");
      requireString(record.model?.probabilityMethod, "model.probabilityMethod");
      requirePositive(record.model?.sampleSize, "model.sampleSize");
      requirePositive(record.edge?.expectedValueRoi, "edge.expectedValueRoi");
      requirePositive(record.edge?.kellyFraction, "edge.kellyFraction");
      requirePositive(record.stake?.recommendedStake, "stake.recommendedStake");
      requirePositive(record.stake?.bankroll, "stake.bankroll");
      requireString(record.stake?.stakePolicyVersion, "stake.stakePolicyVersion");
      requireString(record.audit?.codeVersion, "audit.codeVersion");
      requireString(record.audit?.calculationVersion, "audit.calculationVersion");
      requireString(record.audit?.evidenceCompleteness, "audit.evidenceCompleteness");

      for (const field of ["rawModelProbability", "adjustedProbability"]) {
        const value = record.probability?.[field];
        if (typeof value !== "number" || !Number.isFinite(value) || value <= 0 || value >= 1) {
          addIssue(`probability.${field}`, "must be strictly between zero and one for a BET verdict.");
        }
      }

      if (!Array.isArray(record.reasons) || record.reasons.length === 0) {
        addIssue("reasons", "must include at least one reason for a BET verdict.");
      }

      if (!Array.isArray(record.gateResults) || record.gateResults.length === 0) {
        addIssue("gateResults", "must include passing authorization gates for a BET verdict.");
      } else if (record.gateResults.some((gate) => !isPlainObject(gate) || gate.passed !== true)) {
        addIssue("gateResults", "every authorization gate must explicitly pass for a BET verdict.");
      }

      if (Array.isArray(record.riskFlags) && record.riskFlags.some((flag) => (
        isPlainObject(flag) && ["high", "critical"].includes(String(flag.severity).toLowerCase())
      ))) {
        addIssue("riskFlags", "cannot contain high or critical risk flags for a BET verdict.");
      }

      const verifiedPriceSources = Array.isArray(record.sources)
        ? record.sources.filter((source) => (
            isPlainObject(source)
            && source.verificationStatus === "verified_provider_capture"
            && isNonEmptyString(source.provider)
            && isNonEmptyString(source.sourceLocator)
            && DIGEST_PATTERN.test(source.digest ?? "")
            && isNonEmptyString(source.capturedAt)
            && isNonEmptyString(source.sourceTime)
          ))
        : [];

      if (verifiedPriceSources.length === 0) {
        addIssue("sources", "must include a timestamped verified provider price capture for a BET verdict.");
      }

      const eventStartMs = Date.parse(record.event?.startTime ?? "");
      if (Number.isFinite(createdAtMs) && Number.isFinite(eventStartMs) && eventStartMs <= createdAtMs) {
        addIssue("event.startTime", "must be after the decision timestamp for a BET verdict.");
      }

      const priceCapturedAtMs = Date.parse(record.price?.priceCapturedAt ?? "");
      const priceSourceTimeMs = Date.parse(record.price?.priceSourceTime ?? "");
      if (Number.isFinite(createdAtMs) && Number.isFinite(priceCapturedAtMs) && priceCapturedAtMs > createdAtMs) {
        addIssue("price.priceCapturedAt", "cannot be after the decision timestamp.");
      }
      if (
        Number.isFinite(priceCapturedAtMs)
        && Number.isFinite(priceSourceTimeMs)
        && priceSourceTimeMs > priceCapturedAtMs
      ) {
        addIssue("price.priceSourceTime", "cannot be after priceCapturedAt.");
      }

      for (const source of verifiedPriceSources) {
        const sourceCapturedAtMs = Date.parse(source.capturedAt);
        const sourceTimeMs = Date.parse(source.sourceTime);
        if (Number.isFinite(createdAtMs) && Number.isFinite(sourceCapturedAtMs) && sourceCapturedAtMs > createdAtMs) {
          addIssue("sources", "verified provider capture cannot be after the decision timestamp.");
          break;
        }
        if (Number.isFinite(sourceCapturedAtMs) && Number.isFinite(sourceTimeMs) && sourceTimeMs > sourceCapturedAtMs) {
          addIssue("sources", "verified provider sourceTime cannot be after capturedAt.");
          break;
        }
      }
    }
  }

  if (record.recordType === "settlement") {
    for (const property of [
      "evaluationId",
      "settledAt",
      "outcome",
      "closingOdds",
      "closingOppositeOdds",
      "stake",
      "profit",
      "notes"
    ]) {
      requireProperty(record, property);
    }

    if (typeof record.evaluationId !== "string" || !record.evaluationId.trim()) {
      addIssue("evaluationId", "must be a non-empty string.");
    }
    if (!SETTLEMENT_OUTCOMES.includes(record.outcome)) {
      addIssue("outcome", `must be one of: ${SETTLEMENT_OUTCOMES.join(", ")}.`);
    }
    validateIsoTimestamp(record.settledAt, "settledAt", false);
    validateFinite(record.closingOdds, "closingOdds");
    validateFinite(record.closingOppositeOdds, "closingOppositeOdds");
    validateFinite(record.stake, "stake", { min: 0 });
    validateFinite(record.profit, "profit");

    if (record.outcome !== "pending") {
      if (typeof record.stake !== "number" || !Number.isFinite(record.stake) || record.stake <= 0) {
        addIssue("stake", "must be greater than zero for a final settlement.");
      }
      if (typeof record.profit !== "number" || !Number.isFinite(record.profit)) {
        addIssue("profit", "must be finite for a final settlement.");
      }
    }

    const economicsIssue = getSettlementEconomicsIssue(record);

    if (economicsIssue) {
      addIssue("profit", economicsIssue);
    }

    if (!Array.isArray(record.notes)) {
      addIssue("notes", "must be an array.");
    }

    if (record.closingLineEvidence !== undefined && record.closingLineEvidence !== null) {
      const evidence = record.closingLineEvidence;
      validateObjectFields(evidence, "closingLineEvidence", [
        "sportsbook",
        "capturedAt",
        "marketClosedAt",
        "isFinal",
        "sourceLocator",
        "sourceDigest"
      ]);
      if (isPlainObject(evidence)) {
        if (typeof evidence.sportsbook !== "string" || !evidence.sportsbook.trim()) {
          addIssue("closingLineEvidence.sportsbook", "must be a non-empty string.");
        }
        validateIsoTimestamp(evidence.capturedAt, "closingLineEvidence.capturedAt", false);
        validateIsoTimestamp(evidence.marketClosedAt, "closingLineEvidence.marketClosedAt", false);
        if (typeof evidence.isFinal !== "boolean") {
          addIssue("closingLineEvidence.isFinal", "must be a boolean.");
        }
        if (typeof evidence.sourceLocator !== "string" || !evidence.sourceLocator.trim()) {
          addIssue("closingLineEvidence.sourceLocator", "must be a non-empty string.");
        }
        if (!DIGEST_PATTERN.test(evidence.sourceDigest ?? "")) {
          addIssue("closingLineEvidence.sourceDigest", "must be a 64-character lowercase SHA-256 digest.");
        }
        if (
          typeof evidence.capturedAt === "string"
          && typeof evidence.marketClosedAt === "string"
          && Number.isFinite(Date.parse(evidence.capturedAt))
          && Number.isFinite(Date.parse(evidence.marketClosedAt))
          && Date.parse(evidence.capturedAt) < Date.parse(evidence.marketClosedAt)
        ) {
          addIssue("closingLineEvidence.capturedAt", "cannot be before marketClosedAt.");
        }
      }
    }
  }

  if (record.recordType === "prediction_outcome") {
    for (const property of [
      "evaluationId",
      "supersedesId",
      "outcome",
      "resolvedAt",
      "eventResult",
      "marketResult",
      "source",
      "notes"
    ]) {
      requireProperty(record, property);
    }

    if (!isNonEmptyString(record.evaluationId)) {
      addIssue("evaluationId", "must be a non-empty string.");
    }
    validateSupersedesId(record.supersedesId, "supersedesId", "outcome");
    if (!PREDICTION_OUTCOMES.includes(record.outcome)) {
      addIssue("outcome", `must be one of: ${PREDICTION_OUTCOMES.join(", ")}.`);
    }
    validateIsoTimestamp(record.resolvedAt, "resolvedAt", false);
    validateObjectFields(record.eventResult, "eventResult", ["status", "homeScore", "awayScore"]);
    if (isPlainObject(record.eventResult)) {
      if (record.eventResult.status !== "final") {
        addIssue("eventResult.status", "must equal final.");
      }
      validateSafeInteger(record.eventResult.homeScore, "eventResult.homeScore", {
        min: 0,
        max: 2147483647
      });
      validateSafeInteger(record.eventResult.awayScore, "eventResult.awayScore", {
        min: 0,
        max: 2147483647
      });
      const hasHomeScore = record.eventResult.homeScore !== null;
      const hasAwayScore = record.eventResult.awayScore !== null;
      if (hasHomeScore !== hasAwayScore) {
        addIssue("eventResult", "homeScore and awayScore must both be supplied or both be null.");
      }
    }
    validateObjectFields(record.marketResult, "marketResult", ["observedValue", "unit"]);
    if (isPlainObject(record.marketResult)) {
      validateFinite(record.marketResult.observedValue, "marketResult.observedValue");
      if (record.outcome !== "void" && record.marketResult.observedValue === null) {
        addIssue("marketResult.observedValue", "must be finite unless the outcome is void.");
      }
      if (!isNonEmptyString(record.marketResult.unit)) {
        addIssue("marketResult.unit", "must be a non-empty string.");
      }
    }
    validateSourceEvidence(record.source, "source", "verified_official_result");
    validateNotes(record.notes);

    const createdAt = Date.parse(record.createdAt ?? "");
    const resolvedAt = Date.parse(record.resolvedAt ?? "");
    const capturedAt = Date.parse(record.source?.capturedAt ?? "");
    const sourceTime = Date.parse(record.source?.sourceTime ?? "");
    if (Number.isFinite(resolvedAt) && Number.isFinite(sourceTime) && sourceTime < resolvedAt) {
      addIssue("source.sourceTime", "cannot be before resolvedAt.");
    }
    if (Number.isFinite(createdAt) && Number.isFinite(capturedAt) && capturedAt > createdAt) {
      addIssue("source.capturedAt", "cannot be after the record creation time.");
    }
    for (const field of ["stake", "profit", "closingOdds", "closingOppositeOdds"] ) {
      if (Object.prototype.hasOwnProperty.call(record, field)) {
        addIssue(field, "is prohibited on a non-financial prediction outcome.");
      }
    }
  }

  if (record.recordType === "closing_price") {
    for (const property of ["evaluationId", "supersedesId", "price", "source", "notes"]) {
      requireProperty(record, property);
    }

    if (!isNonEmptyString(record.evaluationId)) {
      addIssue("evaluationId", "must be a non-empty string.");
    }
    validateSupersedesId(record.supersedesId, "supersedesId", "close");
    validateObjectFields(record.price, "price", [
      "sportsbook",
      "marketOdds",
      "oppositeOdds",
      "marketClosedAt",
      "isFinal"
    ]);
    if (isPlainObject(record.price)) {
      if (!isNonEmptyString(record.price.sportsbook)) {
        addIssue("price.sportsbook", "must be a non-empty string.");
      }
      for (const field of ["marketOdds", "oppositeOdds"]) {
        validateSafeInteger(record.price[field], `price.${field}`, { nullable: false });
        if (
          Number.isSafeInteger(record.price[field])
          && (Math.abs(record.price[field]) < 100 || Math.abs(record.price[field]) > 100000)
        ) {
          addIssue(`price.${field}`, "must have an absolute value from 100 through 100000.");
        }
      }
      validateIsoTimestamp(record.price.marketClosedAt, "price.marketClosedAt", false);
      if (record.price.isFinal !== true) {
        addIssue("price.isFinal", "must equal true.");
      }
    }
    validateSourceEvidence(record.source, "source", "verified_provider_capture");
    validateNotes(record.notes);

    const createdAt = Date.parse(record.createdAt ?? "");
    const marketClosedAt = Date.parse(record.price?.marketClosedAt ?? "");
    const capturedAt = Date.parse(record.source?.capturedAt ?? "");
    const sourceTime = Date.parse(record.source?.sourceTime ?? "");
    if (Number.isFinite(marketClosedAt) && Number.isFinite(sourceTime) && sourceTime > marketClosedAt) {
      addIssue("source.sourceTime", "cannot be after price.marketClosedAt.");
    }
    if (Number.isFinite(marketClosedAt) && Number.isFinite(capturedAt) && capturedAt < marketClosedAt) {
      addIssue("source.capturedAt", "cannot be before price.marketClosedAt.");
    }
    if (Number.isFinite(createdAt) && Number.isFinite(capturedAt) && capturedAt > createdAt) {
      addIssue("source.capturedAt", "cannot be after the record creation time.");
    }
    for (const field of ["stake", "profit", "outcome"]) {
      if (Object.prototype.hasOwnProperty.call(record, field)) {
        addIssue(field, "is prohibited on closing-price evidence.");
      }
    }
  }

  if (record.recordType === "amendment") {
    for (const property of ["evaluationId", "settlementId", "reason", "patch"]) {
      requireProperty(record, property);
    }

    if (typeof record.evaluationId !== "string" || !record.evaluationId.trim()) {
      addIssue("evaluationId", "must be a non-empty string.");
    }
    if (typeof record.settlementId !== "string" || !record.settlementId.trim()) {
      addIssue("settlementId", "must be a non-empty string.");
    }
    if (typeof record.reason !== "string" || !record.reason.trim()) {
      addIssue("reason", "must be a non-empty string.");
    }
    if (!isPlainObject(record.patch)) {
      addIssue("patch", "must be an object.");
    }
  }

  return {
    valid: issues.length === 0,
    issues
  };
}

module.exports = {
  AUDIT_RECORD_SCHEMA,
  AUDIT_RECORD_SCHEMA_VERSION,
  EVALUATION_VERDICTS,
  MODEL_STATUSES,
  OPERATIONAL_PERMISSIONS,
  PREDICTION_OUTCOMES,
  RECORD_TYPES,
  SETTLEMENT_OUTCOMES,
  SUPPORTED_AUDIT_RECORD_SCHEMA_VERSIONS,
  createAmendmentRecord,
  createClosingPriceRecord,
  createEvaluationRecord,
  createPredictionOutcomeRecord,
  createSettlementAuditRecord,
  isSupportedAuditRecordSchemaVersion,
  validateAuditRecord
};
