const test = require("node:test");
const assert = require("node:assert/strict");

const { contentDigest } = require("../src/audit/canonical-json.js");
const contract = require("../src/audit/record-contract.js");

const EVALUATION_ID = "eval_11111111-1111-4111-8111-111111111111";

function officialResultSource(overrides = {}) {
  return {
    provider: "mlb_official",
    sourceType: "official_box_score",
    sourceLocator: "https://www.mlb.com/gameday/401816143/final/box",
    capturedAt: "2026-07-17T03:05:00.000Z",
    sourceTime: "2026-07-17T03:00:00.000Z",
    digest: "d".repeat(64),
    verificationStatus: "verified_official_result",
    ...overrides
  };
}

function closingPriceSource(overrides = {}) {
  return {
    provider: "licensed_odds_feed",
    sourceType: "sportsbook_closing_price",
    sourceLocator: "https://provider.example/events/401816143/closing",
    capturedAt: "2026-07-16T23:00:05.000Z",
    sourceTime: "2026-07-16T23:00:00.000Z",
    digest: "e".repeat(64),
    verificationStatus: "verified_provider_capture",
    ...overrides
  };
}

function outcomeRecordInput(overrides = {}) {
  return {
    evaluationId: EVALUATION_ID,
    supersedesId: null,
    outcome: "loss",
    resolvedAt: "2026-07-17T03:00:00.000Z",
    eventResult: { status: "final", homeScore: 1, awayScore: 0 },
    marketResult: { observedValue: 4, unit: "strikeouts" },
    source: officialResultSource(),
    notes: [],
    ...overrides
  };
}

function closingPriceRecordInput(overrides = {}) {
  return {
    evaluationId: EVALUATION_ID,
    supersedesId: null,
    price: {
      sportsbook: "draftkings",
      marketOdds: -125,
      oppositeOdds: 105,
      marketClosedAt: "2026-07-16T23:00:00.000Z",
      isFinal: true
    },
    source: closingPriceSource(),
    notes: [],
    ...overrides
  };
}

test("audit contract introduces schema 2.1.0 without dropping canonical 2.0.0 support", () => {
  assert.equal(contract.AUDIT_RECORD_SCHEMA_VERSION, "2.1.0");
  assert.deepEqual(contract.SUPPORTED_AUDIT_RECORD_SCHEMA_VERSIONS, ["2.0.0", "2.1.0"]);
  assert.equal(contract.isSupportedAuditRecordSchemaVersion("2.0.0"), true);
  assert.equal(contract.isSupportedAuditRecordSchemaVersion("2.1.0"), true);
  assert.equal(contract.isSupportedAuditRecordSchemaVersion("1.0.0"), false);
});

test("prediction outcome records preserve official non-financial shadow results", () => {
  assert.equal(typeof contract.createPredictionOutcomeRecord, "function");

  const record = contract.createPredictionOutcomeRecord({
    evaluationId: EVALUATION_ID,
    supersedesId: null,
    outcome: "loss",
    resolvedAt: "2026-07-17T03:00:00.000Z",
    eventResult: {
      status: "final",
      homeScore: 1,
      awayScore: 0
    },
    marketResult: {
      observedValue: 4,
      unit: "strikeouts"
    },
    source: officialResultSource(),
    notes: ["Official box score finalized."]
  }, {
    clientEventId: "44444444-4444-4444-8444-444444444444",
    createdAt: "2026-07-17T03:06:00.000Z"
  });

  assert.equal(record.schemaVersion, "2.1.0");
  assert.equal(record.id, "outcome_44444444-4444-4444-8444-444444444444");
  assert.equal(record.recordType, "prediction_outcome");
  assert.equal(record.evaluationId, EVALUATION_ID);
  assert.equal(record.outcome, "loss");
  assert.equal(record.marketResult.observedValue, 4);
  assert.equal(record.source.verificationStatus, "verified_official_result");
  assert.equal(Object.hasOwn(record, "stake"), false);
  assert.equal(Object.hasOwn(record, "profit"), false);
  assert.deepEqual(contract.validateAuditRecord(record), { valid: true, issues: [] });
});

test("closing price records preserve a final exact-book two-sided market", () => {
  assert.equal(typeof contract.createClosingPriceRecord, "function");

  const record = contract.createClosingPriceRecord({
    evaluationId: EVALUATION_ID,
    supersedesId: null,
    price: {
      sportsbook: "draftkings",
      marketOdds: -125,
      oppositeOdds: 105,
      marketClosedAt: "2026-07-16T23:00:00.000Z",
      isFinal: true
    },
    source: closingPriceSource(),
    notes: ["Final pregame market captured."]
  }, {
    clientEventId: "55555555-5555-4555-8555-555555555555",
    createdAt: "2026-07-16T23:01:00.000Z"
  });

  assert.equal(record.schemaVersion, "2.1.0");
  assert.equal(record.id, "close_55555555-5555-4555-8555-555555555555");
  assert.equal(record.recordType, "closing_price");
  assert.equal(record.price.sportsbook, "draftkings");
  assert.equal(record.price.marketOdds, -125);
  assert.equal(record.price.oppositeOdds, 105);
  assert.equal(record.source.verificationStatus, "verified_provider_capture");
  assert.deepEqual(contract.validateAuditRecord(record), { valid: true, issues: [] });
});

test("new evidence record types cannot masquerade as schema 2.0.0 records", () => {
  const record = contract.createPredictionOutcomeRecord({
    evaluationId: EVALUATION_ID,
    supersedesId: null,
    outcome: "loss",
    resolvedAt: "2026-07-17T03:00:00.000Z",
    eventResult: { status: "final", homeScore: 1, awayScore: 0 },
    marketResult: { observedValue: 4, unit: "strikeouts" },
    source: officialResultSource(),
    notes: []
  }, {
    clientEventId: "66666666-6666-4666-8666-666666666666",
    createdAt: "2026-07-17T03:06:00.000Z"
  });
  const { contentDigest: _digest, ...downgradedInput } = {
    ...record,
    schemaVersion: "2.0.0"
  };
  const downgraded = {
    ...downgradedInput,
    contentDigest: contentDigest(downgradedInput)
  };

  const validation = contract.validateAuditRecord(downgraded);

  assert.equal(validation.valid, false);
  assert.ok(validation.issues.some((issue) => issue.path === "schemaVersion"));
});

test("prediction outcomes require exact correction ids, integer scores, and a result unit", () => {
  assert.throws(
    () => contract.createPredictionOutcomeRecord(outcomeRecordInput({
      supersedesId: "outcome_not-a-uuid"
    })),
    /supersedesId.*record id/i
  );
  assert.throws(
    () => contract.createPredictionOutcomeRecord(outcomeRecordInput({
      eventResult: { status: "final", homeScore: 1.5, awayScore: 0 }
    })),
    /homeScore.*safe integer/i
  );
  assert.throws(
    () => contract.createPredictionOutcomeRecord(outcomeRecordInput({
      marketResult: { observedValue: 4, unit: " " }
    })),
    /marketResult\.unit.*non-empty string/i
  );
});

test("closing prices require integer American odds and source time at or before close", () => {
  assert.throws(
    () => contract.createClosingPriceRecord(closingPriceRecordInput({
      price: {
        ...closingPriceRecordInput().price,
        marketOdds: -125.5
      }
    })),
    /marketOdds.*safe integer/i
  );
  assert.throws(
    () => contract.createClosingPriceRecord(closingPriceRecordInput({
      price: {
        ...closingPriceRecordInput().price,
        oppositeOdds: 99
      }
    })),
    /oppositeOdds.*absolute value.*100/i
  );
  assert.throws(
    () => contract.createClosingPriceRecord(closingPriceRecordInput({
      source: closingPriceSource({ sourceTime: "2026-07-16T23:00:01.000Z" })
    })),
    /source\.sourceTime.*marketClosedAt/i
  );
});
