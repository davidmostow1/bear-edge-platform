const test = require("node:test");
const assert = require("node:assert/strict");

const {
  createAmendmentRecord,
  createEvaluationRecord,
  createSettlementAuditRecord,
  projectCalibrationLedger
} = require("../src/index.js");

const PREDICTION_AT = "2026-07-17T12:00:01.000Z";
const FEATURE_AT = "2026-07-17T12:00:00.000Z";
const EVENT_AT = "2026-07-17T19:10:00.000Z";
const MARKET_CLOSED_AT = "2026-07-17T19:10:00.000Z";
const CLOSING_CAPTURED_AT = "2026-07-17T19:10:05.000Z";
const SETTLED_AT = "2026-07-17T22:30:00.000Z";

function evaluation(overrides = {}, context = {}) {
  return createEvaluationRecord({
    origin: {
      channel: "best_targets_api",
      actorType: "system",
      sessionId: null,
      requestId: "request_1"
    },
    event: {
      sport: "mlb",
      league: "MLB",
      eventId: "401816143",
      startTime: EVENT_AT,
      homeTeam: "Philadelphia Phillies",
      awayTeam: "New York Mets"
    },
    market: {
      marketFamily: "pitcher_strikeouts",
      marketType: "player_prop",
      participantId: "4414215",
      participantName: "Christian Scott",
      selection: "Christian Scott over 5.5 strikeouts",
      side: "over",
      line: 5.5
    },
    price: {
      sportsbook: "draftkings",
      marketOdds: 103,
      oppositeOdds: -131,
      priceCapturedAt: FEATURE_AT,
      priceSourceTime: FEATURE_AT
    },
    sources: [{
      provider: "mlb",
      sourceType: "official_context_only",
      sourceLocator: "https://statsapi.mlb.com/example",
      parserVersion: "candidate_serializer_v1",
      capturedAt: FEATURE_AT,
      sourceTime: FEATURE_AT,
      digest: "a".repeat(64),
      freshness: "fresh",
      verificationStatus: "official_context_only"
    }],
    model: {
      modelId: "poisson_count_v1",
      modelVersion: "1.0.0",
      probabilityMethod: "poisson_count",
      modelStatus: "research_only",
      calibrationReportId: null,
      trainingCutoff: "2026-07-16T00:00:00.000Z",
      sampleSize: 54
    },
    probability: {
      rawModelProbability: 0.55,
      adjustedProbability: 0.53,
      marketImpliedProbability: 0.49261083743842365,
      marketNoVigProbability: 0.512
    },
    edge: {
      fairEdge: 0.038,
      priceEdge: 0.03738916256157638,
      expectedValueRoi: 0.0759,
      kellyFraction: 0.0364
    },
    stake: {
      recommendedStake: 0,
      bankroll: 1000,
      stakePolicyVersion: "best_target_policy_v1"
    },
    decision: {
      verdict: "WAIT",
      permission: "PRICE_CHECK_ONLY",
      reasons: ["Research-only model."],
      riskFlags: [],
      gateResults: []
    },
    audit: {
      codeVersion: "test",
      configurationDigest: "b".repeat(64),
      calculationVersion: "displayed_target_v1",
      evidenceCompleteness: "official_context_plus_provider_price",
      warnings: []
    },
    ...overrides
  }, {
    clientEventId: context.clientEventId ?? "11111111-1111-4111-8111-111111111111",
    createdAt: context.createdAt ?? PREDICTION_AT
  });
}

function closingLineEvidence(overrides = {}) {
  return {
    sportsbook: "draftkings",
    capturedAt: CLOSING_CAPTURED_AT,
    marketClosedAt: MARKET_CLOSED_AT,
    isFinal: true,
    sourceLocator: "file:///verified-closing-line.png",
    sourceDigest: "c".repeat(64),
    ...overrides
  };
}

function settlement(evaluationId, overrides = {}, context = {}) {
  return createSettlementAuditRecord({
    evaluationId,
    settledAt: SETTLED_AT,
    outcome: "win",
    closingOdds: -125,
    closingOppositeOdds: 105,
    closingLineEvidence: closingLineEvidence(),
    stake: 10,
    profit: 8,
    notes: ["Official result confirmed."],
    ...overrides
  }, {
    clientEventId: context.clientEventId ?? "22222222-2222-4222-8222-222222222222",
    createdAt: context.createdAt ?? "2026-07-17T22:31:00.000Z"
  });
}

test("projectCalibrationLedger is part of the public API", () => {
  assert.equal(typeof projectCalibrationLedger, "function");
});

test("projectCalibrationLedger maps canonical prediction and final closing evidence", () => {
  const prediction = evaluation();
  const result = projectCalibrationLedger([prediction, settlement(prediction.id)]);

  assert.equal(result.rows.length, 1);
  assert.equal(result.summary.eligiblePredictionCount, 1);
  assert.equal(result.summary.settledPredictionCount, 1);
  assert.equal(result.summary.blockerCount, 0);
  assert.deepEqual(result.rows[0], {
    predictionId: prediction.id,
    eventId: "401816143",
    marketFamily: "pitcher_strikeouts",
    participantId: "4414215",
    side: "over",
    line: 5.5,
    price: 103,
    oppositePrice: -131,
    predictedProbability: 0.55,
    predictionAt: PREDICTION_AT,
    featureCutoffAt: FEATURE_AT,
    eventStartAt: EVENT_AT,
    settledAt: SETTLED_AT,
    outcome: 1,
    closingPrice: {
      price: -125,
      oppositePrice: 105,
      capturedAt: CLOSING_CAPTURED_AT,
      marketClosedAt: MARKET_CLOSED_AT,
      isFinal: true
    },
    modelId: "poisson_count_v1",
    modelVersion: "1.0.0",
    sourceDigests: ["a".repeat(64)],
    sourceEvidence: [{
      sourceIdentifier: `mlb:official_context_only:${"a".repeat(64)}:${FEATURE_AT}`,
      capturedAt: FEATURE_AT,
      contentDigest: "a".repeat(64)
    }]
  });
});

test("projectCalibrationLedger gives repeated content captures distinct source identities", () => {
  const first = evaluation();
  const secondFeatureAt = "2026-07-17T12:05:00.000Z";
  const second = evaluation({
    event: {
      sport: "mlb",
      league: "MLB",
      eventId: "401816144",
      startTime: EVENT_AT,
      homeTeam: "Atlanta Braves",
      awayTeam: "Miami Marlins"
    },
    sources: [{
      provider: "mlb",
      sourceType: "official_context_only",
      sourceLocator: "https://statsapi.mlb.com/example",
      parserVersion: "candidate_serializer_v1",
      capturedAt: secondFeatureAt,
      sourceTime: secondFeatureAt,
      digest: "a".repeat(64),
      freshness: "fresh",
      verificationStatus: "official_context_only"
    }]
  }, {
    clientEventId: "55555555-5555-4555-8555-555555555555",
    createdAt: "2026-07-17T12:05:01.000Z"
  });
  const result = projectCalibrationLedger([first, second]);

  assert.equal(result.rows.length, 2);
  assert.notEqual(
    result.rows[0].sourceEvidence[0].sourceIdentifier,
    result.rows[1].sourceEvidence[0].sourceIdentifier
  );
});

test("projectCalibrationLedger keeps missing closing provenance unresolved", () => {
  const prediction = evaluation();
  const incomplete = settlement(prediction.id, { closingLineEvidence: null });
  const result = projectCalibrationLedger([prediction, incomplete]);

  assert.equal(result.rows.length, 1);
  assert.equal(result.rows[0].outcome, null);
  assert.equal(result.rows[0].settledAt, null);
  assert.equal(result.rows[0].closingPrice, null);
  assert.equal(result.summary.settledPredictionCount, 0);
  assert.ok(result.blockers.some((blocker) => (
    blocker.code === "MISSING_FINAL_CLOSING_LINE_EVIDENCE"
    && blocker.evaluationId === prediction.id
  )));
});

test("projectCalibrationLedger applies the latest valid settlement amendment", () => {
  const prediction = evaluation();
  const original = settlement(prediction.id);
  const amendment = createAmendmentRecord({
    evaluationId: prediction.id,
    settlementId: original.id,
    reason: "Official scoring correction",
    patch: {
      outcome: "loss",
      profit: -10,
      closingOdds: -118,
      closingOppositeOdds: 100,
      closingLineEvidence: closingLineEvidence({
        capturedAt: "2026-07-17T19:10:10.000Z",
        sourceDigest: "d".repeat(64)
      })
    }
  }, {
    clientEventId: "33333333-3333-4333-8333-333333333333",
    createdAt: "2026-07-17T23:00:00.000Z"
  });
  const result = projectCalibrationLedger([prediction, original, amendment]);

  assert.equal(result.rows[0].outcome, 0);
  assert.equal(result.rows[0].closingPrice.price, -118);
  assert.equal(result.rows[0].closingPrice.capturedAt, "2026-07-17T19:10:10.000Z");
  assert.equal(result.summary.amendmentCount, 1);
});

test("projectCalibrationLedger excludes legacy and malformed evidence without inventing rows", () => {
  const prediction = evaluation({
    event: {
      sport: "mlb",
      league: "MLB",
      eventId: null,
      startTime: EVENT_AT,
      homeTeam: "Philadelphia Phillies",
      awayTeam: "New York Mets"
    }
  }, {
    clientEventId: "44444444-4444-4444-8444-444444444444"
  });
  const result = projectCalibrationLedger([
    { timestamp: PREDICTION_AT, selection: "Legacy prediction", verdict: "BET" },
    prediction
  ]);

  assert.equal(result.rows.length, 0);
  assert.equal(result.summary.legacyRecordCount, 1);
  assert.equal(result.summary.excludedEvaluationCount, 1);
  assert.ok(result.exclusions.some((entry) => entry.codes.includes("MISSING_EVENT_ID")));
});
