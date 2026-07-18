const crypto = require("node:crypto");

const { canonicalStringify, contentDigest } = require("./canonical-json.js");

const AUDIT_RECORD_SCHEMA_VERSION = "2.0.0";
const EVALUATION_VERDICTS = Object.freeze(["PASS", "WAIT", "BET"]);
const OPERATIONAL_PERMISSIONS = Object.freeze(["WAIT", "PRICE_CHECK_ONLY", "VERIFIED_BETS_ALLOWED"]);
const MODEL_STATUSES = Object.freeze(["research_only", "shadow", "validated", "retired"]);
const SETTLEMENT_OUTCOMES = Object.freeze(["pending", "win", "loss", "push", "void"]);
const RECORD_TYPES = Object.freeze([
  "evaluation",
  "settlement",
  "amendment",
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
    schemaVersion: { const: AUDIT_RECORD_SCHEMA_VERSION },
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

  if (record.schemaVersion !== AUDIT_RECORD_SCHEMA_VERSION) {
    addIssue("schemaVersion", `must equal ${AUDIT_RECORD_SCHEMA_VERSION}.`);
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
    amendment: "amend"
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
    }

    if (isPlainObject(record.audit)) {
      if (record.audit.configurationDigest !== null && !DIGEST_PATTERN.test(record.audit.configurationDigest ?? "")) {
        addIssue("audit.configurationDigest", "must be a 64-character lowercase SHA-256 digest or null.");
      }

      if (!Array.isArray(record.audit.warnings)) {
        addIssue("audit.warnings", "must be an array.");
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
  RECORD_TYPES,
  SETTLEMENT_OUTCOMES,
  createAmendmentRecord,
  createEvaluationRecord,
  createSettlementAuditRecord,
  validateAuditRecord
};
