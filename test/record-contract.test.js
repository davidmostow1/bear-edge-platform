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

function validBetInput() {
  const input = structuredClone(VALID_EVALUATION_INPUT);
  input.sources.push({
    provider: "the_odds_api",
    sourceType: "sportsbook_price",
    sourceLocator: "https://api.the-odds-api.com/v4/sports/baseball_mlb/events/example/odds",
    parserVersion: "odds_provider_adapter_v1",
    capturedAt: "2026-07-16T17:45:00.000Z",
    sourceTime: "2026-07-16T17:44:30.000Z",
    digest: "c".repeat(64),
    freshness: "fresh",
    verificationStatus: "verified_provider_capture"
  });
  input.model = {
    ...input.model,
    modelId: "validated_pitcher_k",
    modelVersion: "2.0.0",
    probabilityMethod: "calibrated_logistic",
    modelStatus: "validated",
    calibrationReportId: "calibration-report-001",
    sampleSize: 500
  };
  input.stake = {
    ...input.stake,
    recommendedStake: 10
  };
  input.decision = {
    verdict: "BET",
    permission: "VERIFIED_BETS_ALLOWED",
    reasons: ["Every authorization gate passed with verified evidence."],
    riskFlags: [],
    gateResults: [{ gate: "authorization", passed: true, reasonCode: null }]
  };
  input.audit = {
    ...input.audit,
    evidenceCompleteness: "verified"
  };
  return input;
}

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

  assert.equal(AUDIT_RECORD_SCHEMA_VERSION, "2.1.0");
  assert.equal(record.schemaVersion, "2.1.0");
  assert.equal(record.id, "eval_11111111-1111-4111-8111-111111111111");
  assert.equal(record.clientEventId, "11111111-1111-4111-8111-111111111111");
  assert.equal(record.verdict, "WAIT");
  assert.equal(record.permission, "PRICE_CHECK_ONLY");
  assert.equal(record.authority, "local");
  assert.equal(digest, contentDigest(digestInput));
  assert.match(digest, /^[a-f0-9]{64}$/);
  assert.deepEqual(validateAuditRecord(record), { valid: true, issues: [] });
});

test("canonical evaluation optionally binds a source-supplied market period", () => {
  const legacyRecord = createEvaluationRecord(VALID_EVALUATION_INPUT, EVALUATION_CONTEXT);
  const periodInput = structuredClone(VALID_EVALUATION_INPUT);
  periodInput.market.marketPeriod = "full_game";
  const periodRecord = createEvaluationRecord(periodInput, EVALUATION_CONTEXT);

  assert.equal(Object.hasOwn(legacyRecord.market, "marketPeriod"), false);
  assert.equal(periodRecord.market.marketPeriod, "full_game");
  assert.notEqual(periodRecord.contentDigest, legacyRecord.contentDigest);
  assert.deepEqual(validateAuditRecord(periodRecord), { valid: true, issues: [] });

  for (const invalidPeriod of [null, "", "x".repeat(81)]) {
    const invalidInput = structuredClone(VALID_EVALUATION_INPUT);
    invalidInput.market.marketPeriod = invalidPeriod;
    assert.throws(
      () => createEvaluationRecord(invalidInput, EVALUATION_CONTEXT),
      /market\.marketPeriod/
    );
  }
});

test("canonical non-BET records zero counterfactual recommended stake", () => {
  const input = structuredClone(VALID_EVALUATION_INPUT);
  input.stake.recommendedStake = 121.23;

  const record = createEvaluationRecord(input, EVALUATION_CONTEXT);
  assert.equal(record.verdict, "WAIT");
  assert.equal(record.permission, "PRICE_CHECK_ONLY");
  assert.equal(record.stake.recommendedStake, 0);

  const tampered = {
    ...record,
    stake: { ...record.stake, recommendedStake: 121.23 }
  };
  assert.ok(
    validateAuditRecord(tampered).issues.some((issue) => (
      issue.path === "stake.recommendedStake"
      && /must equal zero/.test(issue.message)
    ))
  );

  for (const unauthorizedStake of [null, "0", undefined]) {
    const invalid = {
      ...record,
      stake: { ...record.stake, recommendedStake: unauthorizedStake }
    };

    assert.ok(
      validateAuditRecord(invalid).issues.some((issue) => (
        issue.path === "stake.recommendedStake"
        && /must equal zero/.test(issue.message)
      )),
      `unauthorized recommended stake ${String(unauthorizedStake)} must fail closed`
    );
  }
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

test("validateAuditRecord requires verified permission and calibration evidence for BET records", () => {
  const valid = createEvaluationRecord(VALID_EVALUATION_INPUT, EVALUATION_CONTEXT);
  const priceCheckBet = {
    ...valid,
    verdict: "BET",
    model: {
      ...valid.model,
      modelStatus: "validated",
      calibrationReportId: "calibration-report-001"
    }
  };
  const reportlessBet = {
    ...priceCheckBet,
    permission: "VERIFIED_BETS_ALLOWED",
    model: {
      ...priceCheckBet.model,
      calibrationReportId: null
    }
  };

  assert.ok(validateAuditRecord(priceCheckBet).issues.some((issue) => issue.path === "permission"));
  assert.ok(validateAuditRecord(reportlessBet).issues.some((issue) => issue.path === "model.calibrationReportId"));
});

test("a canonical BET requires complete price, provenance, gate, model, and stake evidence", () => {
  const record = createEvaluationRecord(validBetInput(), EVALUATION_CONTEXT);
  const sparseBet = {
    ...record,
    event: { ...record.event, eventId: null },
    sources: [],
    gateResults: [],
    price: { ...record.price, sportsbook: null },
    stake: { ...record.stake, recommendedStake: 0 }
  };
  const validation = validateAuditRecord(sparseBet);

  assert.deepEqual(validateAuditRecord(record), { valid: true, issues: [] });
  assert.ok(validation.issues.some((issue) => issue.path === "event.eventId"));
  assert.ok(validation.issues.some((issue) => issue.path === "sources"));
  assert.ok(validation.issues.some((issue) => issue.path === "gateResults"));
  assert.ok(validation.issues.some((issue) => issue.path === "price.sportsbook"));
  assert.ok(validation.issues.some((issue) => issue.path === "stake.recommendedStake"));
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

test("settlement records require financial evidence for every final outcome", () => {
  assert.throws(
    () => createSettlementAuditRecord({
      evaluationId: "eval_11111111-1111-4111-8111-111111111111",
      outcome: "loss",
      settledAt: "2026-07-17T02:30:00.000Z"
    }),
    /stake.*greater than zero|profit.*finite/i
  );

  assert.throws(
    () => createSettlementAuditRecord({
      evaluationId: "eval_11111111-1111-4111-8111-111111111111",
      outcome: "win",
      settledAt: "2026-07-17T02:30:00.000Z",
      stake: 10,
      profit: -10
    }),
    /win.*positive profit/i
  );
  assert.throws(
    () => createSettlementAuditRecord({
      evaluationId: "eval_11111111-1111-4111-8111-111111111111",
      outcome: "loss",
      settledAt: "2026-07-17T02:30:00.000Z",
      stake: 10,
      profit: 5
    }),
    /loss.*negative profit/i
  );
  assert.throws(
    () => createSettlementAuditRecord({
      evaluationId: "eval_11111111-1111-4111-8111-111111111111",
      outcome: "pending",
      settledAt: "2026-07-17T02:30:00.000Z",
      stake: 10,
      profit: 1
    }),
    /pending.*cannot include profit/i
  );
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

  assert.equal(publicApi.AUDIT_RECORD_SCHEMA_VERSION, "2.1.0");
  assert.equal(publicApi.createEvaluationRecord, createEvaluationRecord);
  assert.equal(publicApi.createSettlementAuditRecord, createSettlementAuditRecord);
  assert.equal(publicApi.createAmendmentRecord, createAmendmentRecord);
  assert.equal(publicApi.validateAuditRecord, validateAuditRecord);
  assert.equal(schemas.AUDIT_RECORD_SCHEMA.title, "Bear Edge Authoritative Audit Record");
  assert.deepEqual(schemas.AUDIT_RECORD_SCHEMA.properties.verdict.enum, ["PASS", "WAIT", "BET"]);
  assert.equal(schemas.SETTLEMENT_INPUT_SCHEMA.properties.closingLineEvidence.type, "object");
});
