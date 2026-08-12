const test = require("node:test");
const assert = require("node:assert/strict");

const {
  mapAmendmentRecord,
  mapDecisionRecord,
  mapSettlementRecord
} = require("../src/sync/supabase-mapper.js");
const {
  createAmendmentRecord,
  createEvaluationRecord,
  createSettlementAuditRecord
} = require("../src/audit/record-contract.js");

const OWNER_USER_ID = "90000000-0000-4000-8000-000000000001";
const REMOTE_DECISION_ID = "90000000-0000-4000-8000-000000000002";
const REMOTE_SETTLEMENT_ID = "90000000-0000-4000-8000-000000000003";
const EVALUATION_EVENT_ID = "90000000-0000-4000-8000-000000000004";
const SETTLEMENT_EVENT_ID = "90000000-0000-4000-8000-000000000005";
const AMENDMENT_EVENT_ID = "90000000-0000-4000-8000-000000000006";
const CREATED_AT = "2026-07-17T13:00:00.000Z";

function evaluationRecord(modelStatus = "shadow") {
  return createEvaluationRecord({
    origin: {
      channel: "live_ui",
      actorType: "operator",
      sessionId: "session-1",
      requestId: "request-1"
    },
    event: {
      sport: "baseball",
      league: "mlb",
      eventId: "401816143",
      startTime: "2026-07-17T23:00:00.000Z",
      homeTeam: "Philadelphia Phillies",
      awayTeam: "New York Mets"
    },
    market: {
      marketFamily: "PLAYER_PROP",
      marketType: "PITCHER_STRIKEOUTS",
      marketPeriod: "full_game",
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
      priceCapturedAt: "2026-07-17T12:59:00.000Z",
      priceSourceTime: "2026-07-17T12:58:30.000Z"
    },
    sources: [{
      provider: "espn",
      sourceType: "screenshot",
      sourceLocator: "espn://game/401816143",
      parserVersion: "2.0.0",
      capturedAt: "2026-07-17T12:59:00.000Z",
      sourceTime: "2026-07-17T12:58:30.000Z",
      digest: "a".repeat(64),
      freshness: "fresh",
      verificationStatus: "manual_confirmed"
    }],
    model: {
      modelId: "mlb-pitcher-k",
      modelVersion: "0.4.0",
      probabilityMethod: "calibrated_logistic",
      modelStatus,
      calibrationReportId: null,
      trainingCutoff: "2026-07-01T00:00:00.000Z",
      sampleSize: 420
    },
    probability: {
      rawModelProbability: 0.58,
      adjustedProbability: 0.55,
      marketImpliedProbability: 0.4926,
      marketNoVigProbability: 0.51
    },
    edge: {
      fairEdge: 0.04,
      priceEdge: 0.0574,
      expectedValueRoi: 0.1165,
      kellyFraction: 0.055
    },
    stake: {
      recommendedStake: 10,
      bankroll: 1000,
      stakePolicyVersion: "1.0.0"
    },
    decision: {
      verdict: "WAIT",
      permission: "PRICE_CHECK_ONLY",
      reasons: ["Model calibration is incomplete."],
      riskFlags: ["MODEL_NOT_VALIDATED"],
      gateResults: [{
        code: "MODEL_CALIBRATION_REQUIRED",
        status: "fail",
        message: "The model is not validated."
      }]
    },
    audit: {
      codeVersion: "10.1",
      configurationDigest: "b".repeat(64),
      calculationVersion: "2.0.0",
      evidenceCompleteness: "blocked",
      warnings: []
    }
  }, {
    clientEventId: EVALUATION_EVENT_ID,
    createdAt: CREATED_AT
  });
}

test("mapDecisionRecord preserves canonical identity and complete snapshots", () => {
  const evaluation = evaluationRecord();
  const row = mapDecisionRecord(evaluation, OWNER_USER_ID);

  assert.equal(row.user_id, OWNER_USER_ID);
  assert.equal(row.client_event_id, evaluation.clientEventId);
  assert.equal(row.verdict, "WAIT");
  assert.equal(row.source, "live_ui");
  assert.equal(row.schema_version, "2.1.0");
  assert.equal(row.content_digest, evaluation.contentDigest);
  assert.equal(row.authority, "local");
  assert.equal(row.canonical_event_id, "401816143");
  assert.equal(row.market_kind, "PLAYER_PROP");
  assert.equal(row.market_type, "Primary Prop");
  assert.equal(row.line_value, 5.5);
  assert.equal(row.odds, 103);
  assert.equal(row.counterpart_odds, -131);
  assert.equal(row.p_user, 0.55);
  assert.equal(row.probability_provenance_status, "BLOCK");
  assert.equal(row.probability_method, "MANUAL_RESEARCH");
  assert.equal(row.price_integrity_status, "REVIEW");
  assert.equal(row.market_identity_status, "BLOCK");
  assert.equal(row.data_quality, "legacy_incomplete");
  assert.equal(row.is_live, false);
  assert.equal(row.reason_code, "MODEL_CALIBRATION_REQUIRED");
  assert.equal(row.reason, "Model calibration is incomplete.");
  assert.equal(row.created_at, CREATED_AT);
  assert.equal("synchronized_at" in row, false);
  assert.deepEqual(row.input_snapshot.audit_record, evaluation);
  assert.deepEqual(row.state_snapshot.gates, evaluation.gateResults);
  assert.deepEqual(row.output_snapshot.edge, evaluation.edge);
  assert.equal(row.output_snapshot.permission, "PRICE_CHECK_ONLY");
  assert.equal(row.recommended_stake, 0);
  assert.equal(row.market_period, evaluation.market.marketPeriod);
});

test("mapDecisionRecord maps lower-case research families to allowed remote market kinds", () => {
  const evaluation = evaluationRecord();
  const families = new Map([
    ["pitcher_strikeouts", "PLAYER_PROP"],
    ["batter_hits", "PLAYER_PROP"],
    ["batter_runs_scored", "PLAYER_PROP"],
    ["batter_total_bases", "PLAYER_PROP"],
    ["moneyline", "MONEYLINE"]
  ]);

  for (const [marketFamily, expectedMarketKind] of families) {
    const researchEvaluation = createEvaluationRecord({
      ...evaluation,
      market: {
        ...evaluation.market,
        marketFamily,
        marketType: expectedMarketKind === "PLAYER_PROP" ? "player_prop" : marketFamily
      },
      decision: {
        verdict: evaluation.verdict,
        permission: evaluation.permission,
        reasons: evaluation.reasons,
        riskFlags: evaluation.riskFlags,
        gateResults: evaluation.gateResults
      }
    }, {
      clientEventId: EVALUATION_EVENT_ID,
      createdAt: CREATED_AT
    });
    const row = mapDecisionRecord(researchEvaluation, OWNER_USER_ID);

    assert.equal(row.market, marketFamily);
    assert.equal(row.market_kind, expectedMarketKind);
    assert.equal(
      row.market_type,
      expectedMarketKind === "PLAYER_PROP" ? "Primary Prop" : "Main Side"
    );
    assert.equal(row.output_snapshot.permission, "PRICE_CHECK_ONLY");
    assert.equal(row.recommended_stake, 0);
  }

  const unknownEvaluation = createEvaluationRecord({
    ...evaluation,
    market: {
      ...evaluation.market,
      marketFamily: "unregistered_research_family",
      marketType: "research_market"
    },
    decision: {
      verdict: evaluation.verdict,
      permission: evaluation.permission,
      reasons: evaluation.reasons,
      riskFlags: evaluation.riskFlags,
      gateResults: evaluation.gateResults
    }
  }, {
    clientEventId: EVALUATION_EVENT_ID,
    createdAt: CREATED_AT
  });
  const unknownRow = mapDecisionRecord(unknownEvaluation, OWNER_USER_ID);

  assert.equal(unknownRow.market_kind, null);
  assert.notEqual(unknownRow.market_kind, unknownEvaluation.market.marketFamily);
  assert.equal(unknownRow.market_identity_status, "BLOCK");
});

test("mapDecisionRecord blocks provenance for every model status except validated", () => {
  const evaluation = evaluationRecord();

  assert.equal(
    mapDecisionRecord(evaluation, OWNER_USER_ID).probability_provenance_status,
    "BLOCK"
  );

  const validated = evaluationRecord("validated");

  assert.equal(
    mapDecisionRecord(validated, OWNER_USER_ID).probability_provenance_status,
    "COMPLETE"
  );
  assert.equal(
    mapDecisionRecord(validated, OWNER_USER_ID).probability_method,
    "CALIBRATED_MODEL"
  );
});

test("mapDecisionRecord completes identity only with a source-supplied period and passing gates", () => {
  const evaluation = evaluationRecord();
  const withPassingIdentityGates = createEvaluationRecord({
    ...evaluation,
    decision: {
      verdict: evaluation.verdict,
      permission: evaluation.permission,
      reasons: evaluation.reasons,
      riskFlags: evaluation.riskFlags,
      gateResults: [
        { code: "EVENT_MATCH", status: "pass" },
        { code: "PARTICIPANT_MATCH", status: "pass" },
        { code: "MARKET_MATCH", status: "pass" },
        { code: "LINE_MATCH", status: "pass" }
      ]
    }
  }, {
    clientEventId: EVALUATION_EVENT_ID,
    createdAt: CREATED_AT
  });

  const row = mapDecisionRecord(withPassingIdentityGates, OWNER_USER_ID);
  assert.equal(row.market_period, "full_game");
  assert.equal(row.market_identity_status, "COMPLETE");
  assert.equal(row.market_fingerprint, null);

  const { marketPeriod: _marketPeriod, ...marketWithoutPeriod } = evaluation.market;
  const withoutPeriod = createEvaluationRecord({
    ...evaluation,
    market: marketWithoutPeriod,
    decision: {
      verdict: evaluation.verdict,
      permission: evaluation.permission,
      reasons: evaluation.reasons,
      riskFlags: evaluation.riskFlags,
      gateResults: withPassingIdentityGates.gateResults
    }
  }, {
    clientEventId: EVALUATION_EVENT_ID,
    createdAt: CREATED_AT
  });
  assert.equal(mapDecisionRecord(withoutPeriod, OWNER_USER_ID).market_identity_status, "BLOCK");
});

test("mapSettlementRecord uses the referenced authoritative evaluation for taken odds", () => {
  const evaluation = evaluationRecord();
  const settlement = createSettlementAuditRecord({
    evaluationId: evaluation.id,
    settledAt: "2026-07-18T02:30:00.000Z",
    outcome: "win",
    closingOdds: -110,
    closingOppositeOdds: -110,
    stake: 10,
    profit: 10.3,
    notes: ["Official final box score reviewed."]
  }, {
    clientEventId: SETTLEMENT_EVENT_ID,
    createdAt: "2026-07-18T02:31:00.000Z"
  });

  const row = mapSettlementRecord(
    settlement,
    OWNER_USER_ID,
    REMOTE_DECISION_ID,
    evaluation
  );

  assert.deepEqual(row, {
    user_id: OWNER_USER_ID,
    decision_id: REMOTE_DECISION_ID,
    client_event_id: settlement.clientEventId,
    schema_version: settlement.schemaVersion,
    content_digest: settlement.contentDigest,
    authority: "local",
    source: "local_engine",
    result: "win",
    stake: 10,
    taken_odds: 103,
    closing_odds: -110,
    profit: 10.3,
    clv_delta: null,
    settled_at: "2026-07-18T02:30:00.000Z",
    created_at: "2026-07-18T02:31:00.000Z"
  });
});

test("mapSettlementRecord permits a pending record without invented financial values", () => {
  const evaluation = evaluationRecord();
  const pending = createSettlementAuditRecord({
    evaluationId: evaluation.id,
    settledAt: "2026-07-17T13:05:00.000Z",
    outcome: "pending",
    closingOdds: null,
    closingOppositeOdds: null,
    stake: null,
    profit: null,
    notes: []
  }, {
    clientEventId: SETTLEMENT_EVENT_ID,
    createdAt: "2026-07-17T13:05:00.000Z"
  });

  const row = mapSettlementRecord(pending, OWNER_USER_ID, REMOTE_DECISION_ID);

  assert.equal(row.result, "pending");
  assert.equal(row.stake, null);
  assert.equal(row.taken_odds, null);
  assert.equal(row.closing_odds, null);
  assert.equal(row.profit, null);
});

test("mapSettlementRecord refuses a final result without its authoritative evaluation price", () => {
  const evaluation = evaluationRecord();
  const settlement = createSettlementAuditRecord({
    evaluationId: evaluation.id,
    settledAt: "2026-07-18T02:30:00.000Z",
    outcome: "loss",
    closingOdds: -110,
    stake: 10,
    profit: -10,
    notes: []
  }, {
    clientEventId: SETTLEMENT_EVENT_ID,
    createdAt: "2026-07-18T02:31:00.000Z"
  });

  assert.throws(
    () => mapSettlementRecord(settlement, OWNER_USER_ID, REMOTE_DECISION_ID),
    /authoritative evaluation with taken odds/i
  );
});

test("mapAmendmentRecord preserves immutable references, reason, and patch", () => {
  const evaluation = evaluationRecord();
  const settlementId = `settle_${SETTLEMENT_EVENT_ID}`;
  const amendment = createAmendmentRecord({
    evaluationId: evaluation.id,
    settlementId,
    reason: "Corrected official closing price.",
    patch: { closingOdds: -108 }
  }, {
    clientEventId: AMENDMENT_EVENT_ID,
    createdAt: "2026-07-18T03:00:00.000Z"
  });

  assert.deepEqual(
    mapAmendmentRecord(
      amendment,
      OWNER_USER_ID,
      REMOTE_DECISION_ID,
      REMOTE_SETTLEMENT_ID
    ),
    {
      user_id: OWNER_USER_ID,
      decision_id: REMOTE_DECISION_ID,
      settlement_id: REMOTE_SETTLEMENT_ID,
      client_event_id: amendment.clientEventId,
      schema_version: amendment.schemaVersion,
      content_digest: amendment.contentDigest,
      authority: "local",
      source: "local_engine",
      reason: "Corrected official closing price.",
      patch: { closingOdds: -108 },
      created_at: "2026-07-18T03:00:00.000Z"
    }
  );
});

test("all mapping functions reject malformed owner and remote identifiers", () => {
  const evaluation = evaluationRecord();

  assert.throws(() => mapDecisionRecord(evaluation, "bad"), /owner user id/i);
  assert.throws(
    () => mapSettlementRecord({}, OWNER_USER_ID, "bad"),
    /canonical settlement record/i
  );
  assert.throws(
    () => mapAmendmentRecord({}, OWNER_USER_ID, REMOTE_DECISION_ID, "bad"),
    /canonical amendment record/i
  );
});
