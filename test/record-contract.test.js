const test = require("node:test");
const assert = require("node:assert/strict");

const {
  canonicalStringify,
  contentDigest
} = require("../src/audit/canonical-json.js");
const {
  AUDIT_RECORD_SCHEMA_VERSION,
  createAmendmentRecord,
  createEvaluationRecord,
  createSettlementAuditRecord,
  validateAuditRecord
} = require("../src/audit/record-contract.js");

const VALID_EVALUATION_INPUT = {
  origin: {
    channel: "http",
    actorType: "operator",
    sessionId: "session_1",
    requestId: "request_1"
  },
  event: {
    sport: "mlb",
    league: "MLB",
    eventId: "401816143",
    startTime: "2026-07-16T23:00:00.000Z",
    homeTeam: "Philadelphia Phillies",
    awayTeam: "New York Mets"
  },
  market: {
    marketFamily: "pitcher_strikeouts",
    marketType: "Primary Prop",
    participantId: "4414215",
    participantName: "Christian Scott",
    selection: "Christian Scott over 5.5 strikeouts",
    side: "Over",
    line: 5.5
  },
  price: {
    sportsbook: "draftkings",
    marketOdds: 103,
    oppositeOdds: -131,
    priceCapturedAt: "2026-07-16T17:45:00.000Z",
    priceSourceTime: "2026-07-16T17:44:00.000Z"
  },
  sources: [{
    provider: "espn_manual_snapshot",
    sourceType: "manual_snapshot",
    sourceLocator: "espn.com/mlb/odds/_/gameId/401816143",
    parserVersion: "1.0.0",
    capturedAt: "2026-07-16T17:45:00.000Z",
    sourceTime: "2026-07-16T17:44:00.000Z",
    digest: "a".repeat(64),
    freshness: "fresh",
    verificationStatus: "manually_confirmed"
  }],
  model: {
    modelId: "poisson_count_v1",
    modelVersion: "1.0.0",
    probabilityMethod: "poisson_count",
    modelStatus: "research_only",
    calibrationReportId: null,
    trainingCutoff: "2026-07-15T00:00:00.000Z",
    sampleSize: 54
  },
  probability: {
    rawModelProbability: 0.55,
    adjustedProbability: 0.53,
    marketImpliedProbability: 0.49261083743842365,
    marketNoVigProbability: 0.512
  },
  edge: {
    fairEdge: 0.018,
    priceEdge: 0.03738916256157638,
    expectedValueRoi: 0.0759,
    kellyFraction: 0.0364
  },
  stake: {
    recommendedStake: 0,
    bankroll: 1000,
    stakePolicyVersion: "1.0.0"
  },
  decision: {
    verdict: "WAIT",
    permission: "PRICE_CHECK_ONLY",
    reasons: ["The research model is not calibrated for production betting."],
    riskFlags: [{
      code: "MODEL_CALIBRATION_REQUIRED",
      severity: "high",
      message: "Model is research-only."
    }],
    gateResults: [{
      gate: "calibration",
      passed: false,
      reasonCode: "MODEL_CALIBRATION_REQUIRED"
    }]
  },
  audit: {
    codeVersion: "0290140",
    configurationDigest: "b".repeat(64),
    calculationVersion: "1.0.0",
    evidenceCompleteness: "manual_confirmed",
    warnings: []
  }
};

const EVALUATION_CONTEXT = {
  clientEventId: "11111111-1111-4111-8111-111111111111",
  createdAt: "2026-07-16T17:45:01.000Z"
};

test("canonicalStringify sorts object keys recursively without reordering arrays", () => {
  const left = { z: 1, a: { y: 2, x: 3 }, rows: [{ b: 2, a: 1 }] };
  const right = { rows: [{ a: 1, b: 2 }], a: { x: 3, y: 2 }, z: 1 };

  assert.equal(canonicalStringify(left), canonicalStringify(right));
  assert.equal(contentDigest(left), contentDigest(right));
  assert.match(contentDigest(left), /^[a-f0-9]{64}$/);
});

test("canonicalStringify rejects non-finite numbers", () => {
  assert.throws(() => canonicalStringify({ probability: Number.NaN }), /finite/);
  assert.throws(() => canonicalStringify({ probability: Number.POSITIVE_INFINITY }), /finite/);
});

test("createEvaluationRecord emits stable identifiers and excludes digest from its own digest input", () => {
  const record = createEvaluationRecord(VALID_EVALUATION_INPUT, EVALUATION_CONTEXT);
  const { contentDigest: digest, ...digestInput } = record;

  assert.equal(AUDIT_RECORD_SCHEMA_VERSION, "2.0.0");
  assert.equal(record.schemaVersion, "2.0.0");
  assert.equal(record.id, "eval_11111111-1111-4111-8111-111111111111");
  assert.equal(record.clientEventId, "11111111-1111-4111-8111-111111111111");
  assert.equal(record.verdict, "WAIT");
  assert.equal(record.permission, "PRICE_CHECK_ONLY");
  assert.equal(record.authority, "local");
  assert.equal(digest, contentDigest(digestInput));
  assert.match(digest, /^[a-f0-9]{64}$/);
  assert.deepEqual(validateAuditRecord(record), { valid: true, issues: [] });
});

test("validateAuditRecord rejects digest changes, unsupported verdicts, and research-only BET records", () => {
  const valid = createEvaluationRecord(VALID_EVALUATION_INPUT, EVALUATION_CONTEXT);
  const changed = { ...valid, verdict: "PASS" };
  const unsupported = { ...valid, verdict: "NO BET" };
  const researchBet = { ...valid, verdict: "BET" };

  assert.ok(validateAuditRecord(changed).issues.some((issue) => issue.path === "contentDigest"));
  assert.ok(validateAuditRecord(unsupported).issues.some((issue) => issue.path === "verdict"));
  assert.ok(validateAuditRecord(researchBet).issues.some((issue) => issue.path === "model.modelStatus"));
});

test("validateAuditRecord rejects missing groups, malformed UUIDs, invalid timestamps, and probability bounds", () => {
  const valid = createEvaluationRecord(VALID_EVALUATION_INPUT, EVALUATION_CONTEXT);
  const invalid = {
    ...valid,
    clientEventId: "not-a-uuid",
    createdAt: "not-a-timestamp",
    probability: {
      ...valid.probability,
      adjustedProbability: 1.1
    }
  };
  delete invalid.market;

  const paths = validateAuditRecord(invalid).issues.map((issue) => issue.path);

  assert.ok(paths.includes("clientEventId"));
  assert.ok(paths.includes("createdAt"));
  assert.ok(paths.includes("market"));
  assert.ok(paths.includes("probability.adjustedProbability"));
});

test("createSettlementAuditRecord emits canonical settlement fields and a verifiable digest", () => {
  const record = createSettlementAuditRecord({
    evaluationId: "eval_11111111-1111-4111-8111-111111111111",
    outcome: "win",
    settledAt: "2026-07-17T02:30:00.000Z",
    closingOdds: -125,
    closingOppositeOdds: 105,
    closingLineEvidence: {
      sportsbook: "draftkings",
      capturedAt: "2026-07-16T23:00:05.000Z",
      marketClosedAt: "2026-07-16T23:00:00.000Z",
      isFinal: true,
      sourceLocator: "file:///verified-closing-line.png",
      sourceDigest: "c".repeat(64)
    },
    stake: 10,
    profit: 8,
    notes: ["Official result confirmed."]
  }, {
    clientEventId: "22222222-2222-4222-8222-222222222222",
    createdAt: "2026-07-17T02:31:00.000Z"
  });

  assert.equal(record.id, "settle_22222222-2222-4222-8222-222222222222");
  assert.equal(record.recordType, "settlement");
  assert.equal(record.outcome, "win");
  assert.equal(record.profit, 8);
  assert.equal(record.closingLineEvidence.sportsbook, "draftkings");
  assert.equal(record.closingLineEvidence.isFinal, true);
  assert.deepEqual(validateAuditRecord(record), { valid: true, issues: [] });
});

test("createAmendmentRecord preserves references and patch content without mutating prior records", () => {
  const patch = { outcome: "push", profit: 0 };
  const record = createAmendmentRecord({
    evaluationId: "eval_11111111-1111-4111-8111-111111111111",
    settlementId: "settle_22222222-2222-4222-8222-222222222222",
    reason: "Official scoring correction",
    patch
  }, {
    clientEventId: "33333333-3333-4333-8333-333333333333",
    createdAt: "2026-07-17T03:00:00.000Z"
  });

  patch.outcome = "loss";

  assert.equal(record.id, "amend_33333333-3333-4333-8333-333333333333");
  assert.equal(record.recordType, "amendment");
  assert.deepEqual(record.patch, { outcome: "push", profit: 0 });
  assert.deepEqual(validateAuditRecord(record), { valid: true, issues: [] });
});

test("the public API and schema registry expose the canonical audit contract", () => {
  const publicApi = require("../src/index.js");
  const schemas = require("../src/schemas.js");

  assert.equal(publicApi.AUDIT_RECORD_SCHEMA_VERSION, "2.0.0");
  assert.equal(publicApi.createEvaluationRecord, createEvaluationRecord);
  assert.equal(publicApi.createSettlementAuditRecord, createSettlementAuditRecord);
  assert.equal(publicApi.createAmendmentRecord, createAmendmentRecord);
  assert.equal(publicApi.validateAuditRecord, validateAuditRecord);
  assert.equal(schemas.AUDIT_RECORD_SCHEMA.title, "Bear Edge Authoritative Audit Record");
  assert.deepEqual(schemas.AUDIT_RECORD_SCHEMA.properties.verdict.enum, ["PASS", "WAIT", "BET"]);
  assert.equal(schemas.SETTLEMENT_INPUT_SCHEMA.properties.closingLineEvidence.type, "object");
});
