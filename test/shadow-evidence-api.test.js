const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs/promises");
const os = require("node:os");
const path = require("node:path");

const {
  appendAuthoritativeRecord,
  createEvaluationRecord,
  projectCalibrationLedger
} = require("../src/index.js");
const { readAuthoritativeLedger } = require("../src/audit/authoritative-ledger.js");
const { createOperatorAuth } = require("../src/config/operator-auth.js");
const { createServer } = require("../src/server.js");
const { readOutboxState } = require("../src/sync/outbox.js");

async function withServer(options, run) {
  const server = createServer({
    ...options,
    operatorAuth: createOperatorAuth({ lanMode: false, requireToken: false })
  });

  await new Promise((resolve) => server.listen(0, () => resolve(undefined)));

  try {
    const address = server.address();

    if (!address || typeof address === "string") {
      throw new Error("Expected an AddressInfo server binding.");
    }

    await run(`http://127.0.0.1:${address.port}`);
  } finally {
    await new Promise((resolve, reject) => {
      server.close((error) => (error ? reject(error) : resolve()));
    });
  }
}

function shadowEvaluation() {
  return createEvaluationRecord({
    origin: {
      channel: "best_targets_api",
      actorType: "system",
      sessionId: null,
      requestId: "shadow-api-test"
    },
    event: {
      sport: "mlb",
      league: "MLB",
      eventId: "shadow-event-1",
      startTime: "2026-07-16T23:00:00.000Z",
      homeTeam: "Home",
      awayTeam: "Away"
    },
    market: {
      marketFamily: "pitcher_strikeouts",
      marketType: "player_prop",
      participantId: "pitcher-1",
      participantName: "Test Pitcher",
      selection: "Test Pitcher over 5.5 strikeouts",
      side: "over",
      line: 5.5
    },
    price: {
      sportsbook: "draftkings",
      marketOdds: 105,
      oppositeOdds: -135,
      priceCapturedAt: "2026-07-16T13:00:00.000Z",
      priceSourceTime: "2026-07-16T12:59:30.000Z"
    },
    sources: [{
      provider: "licensed_odds_feed",
      sourceType: "sportsbook_price",
      sourceLocator: "https://provider.example/open",
      parserVersion: "test_v1",
      capturedAt: "2026-07-16T13:00:00.000Z",
      sourceTime: "2026-07-16T12:59:30.000Z",
      digest: "a".repeat(64),
      freshness: "fresh",
      verificationStatus: "verified_provider_capture"
    }],
    model: {
      modelId: "poisson_count_v1",
      modelVersion: "1.0.0",
      probabilityMethod: "poisson_count",
      modelStatus: "research_only",
      calibrationReportId: null,
      trainingCutoff: "2026-07-15T00:00:00.000Z",
      sampleSize: 50
    },
    probability: {
      rawModelProbability: 0.55,
      adjustedProbability: 0.53,
      marketImpliedProbability: 0.4878,
      marketNoVigProbability: 0.51
    },
    edge: {
      fairEdge: 0.02,
      priceEdge: 0.0422,
      expectedValueRoi: 0.08,
      kellyFraction: 0.03
    },
    stake: {
      recommendedStake: 0,
      bankroll: 1000,
      stakePolicyVersion: "test_v1"
    },
    decision: {
      verdict: "WAIT",
      permission: "PRICE_CHECK_ONLY",
      reasons: ["Shadow evaluation only."],
      riskFlags: [],
      gateResults: []
    },
    audit: {
      codeVersion: "test",
      configurationDigest: "b".repeat(64),
      calculationVersion: "test_v1",
      evidenceCompleteness: "verified_price_research_model",
      warnings: []
    }
  }, {
    clientEventId: "11111111-1111-4111-8111-111111111111",
    createdAt: "2026-07-16T13:00:01.000Z"
  });
}

function outcomeBody(evaluationId) {
  return {
    evaluationId,
    supersedesId: null,
    outcome: "loss",
    resolvedAt: "2026-07-17T02:30:00.000Z",
    eventResult: { status: "final", homeScore: 2, awayScore: 1 },
    marketResult: { observedValue: 4, unit: "strikeouts" },
    source: {
      provider: "mlb_official",
      sourceType: "official_box_score",
      sourceLocator: "https://www.mlb.com/gameday/shadow-event-1/final/box",
      capturedAt: "2026-07-17T02:35:00.000Z",
      sourceTime: "2026-07-17T02:30:00.000Z",
      digest: "c".repeat(64),
      verificationStatus: "verified_official_result"
    },
    notes: []
  };
}

function closingPriceBody(evaluationId, sportsbook = "draftkings") {
  return {
    evaluationId,
    supersedesId: null,
    price: {
      sportsbook,
      marketOdds: -120,
      oppositeOdds: 100,
      marketClosedAt: "2026-07-16T23:00:00.000Z",
      isFinal: true
    },
    source: {
      provider: "licensed_odds_feed",
      sourceType: "sportsbook_closing_price",
      sourceLocator: "https://provider.example/close",
      capturedAt: "2026-07-16T23:00:05.000Z",
      sourceTime: "2026-07-16T23:00:00.000Z",
      digest: "d".repeat(64),
      verificationStatus: "verified_provider_capture"
    },
    notes: []
  };
}

test("schemas expose dedicated non-financial outcome and closing-price inputs", async () => {
  await withServer({}, async (baseUrl) => {
    const response = await fetch(`${baseUrl}/schemas`);
    const payload = await response.json();

    assert.equal(response.status, 200);
    assert.equal(payload.predictionOutcomeInput.title, "Bear Edge Prediction Outcome Input");
    assert.equal(payload.closingPriceInput.title, "Bear Edge Closing Price Input");
    assert.equal("stake" in payload.predictionOutcomeInput.properties, false);
    assert.equal("profit" in payload.predictionOutcomeInput.properties, false);
    assert.equal(payload.predictionOutcomeInput.properties.eventResult.properties.status.const, "final");
    assert.equal(payload.predictionOutcomeInput.properties.eventResult.properties.homeScore.type[0], "integer");
    assert.equal(payload.closingPriceInput.properties.price.properties.marketOdds.type, "integer");
  });
});

test("API exposes a zero-credit evidence queue with validated filters", async (t) => {
  const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), "bear-edge-evidence-queue-api-"));
  const logPath = path.join(tempDir, "decision_log.jsonl");
  const evaluation = shadowEvaluation();
  let providerCalls = 0;

  t.after(() => fs.rm(tempDir, { recursive: true, force: true }));
  await appendAuthoritativeRecord(evaluation, { ledgerPath: logPath });

  await withServer({
    logPath,
    fetchJsonImpl: async () => {
      providerCalls += 1;
      throw new Error("Evidence queue must not call a provider.");
    }
  }, async (baseUrl) => {
    const response = await fetch(`${baseUrl}/api/evidence-queue?status=all&limit=25`);
    const payload = await response.json();
    const invalidStatusResponse = await fetch(`${baseUrl}/api/evidence-queue?status=unknown`);
    const invalidStatus = await invalidStatusResponse.json();
    const invalidLimitResponse = await fetch(`${baseUrl}/api/evidence-queue?limit=501`);
    const invalidLimit = await invalidLimitResponse.json();

    assert.equal(response.status, 200);
    assert.equal(payload.writeBlocked, false);
    assert.equal(payload.summary.totalEvaluations, 1);
    assert.equal(payload.summary.minimumSettledPredictions, 500);
    assert.equal(payload.items[0].evaluationId, evaluation.id);
    assert.equal(payload.items[0].evidenceStatus, "missing_outcome_and_close");
    assert.equal(providerCalls, 0);
    assert.equal(invalidStatusResponse.status, 400);
    assert.equal(invalidStatus.code, "INVALID_EVIDENCE_QUEUE_QUERY");
    assert.match(invalidStatus.error, /status/i);
    assert.equal(invalidLimitResponse.status, 400);
    assert.equal(invalidLimit.code, "INVALID_EVIDENCE_QUEUE_QUERY");
    assert.match(invalidLimit.error, /limit/i);
  });
});

test("API appends shadow evidence for WAIT evaluations and queues both records for sync", async (t) => {
  const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), "bear-edge-shadow-api-"));
  const logPath = path.join(tempDir, "decision_log.jsonl");
  const outboxPath = path.join(tempDir, "sync_outbox.jsonl");
  const evaluation = shadowEvaluation();

  t.after(() => fs.rm(tempDir, { recursive: true, force: true }));
  await appendAuthoritativeRecord(evaluation, { ledgerPath: logPath, outboxPath });

  await withServer({ logPath, outboxPath }, async (baseUrl) => {
    const outcomeResponse = await fetch(`${baseUrl}/api/prediction-outcomes`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(outcomeBody(evaluation.id))
    });
    const outcome = await outcomeResponse.json();
    const closeResponse = await fetch(`${baseUrl}/api/closing-prices`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(closingPriceBody(evaluation.id))
    });
    const close = await closeResponse.json();

    assert.equal(outcomeResponse.status, 200);
    assert.equal(closeResponse.status, 200);
    assert.equal(outcome.record.recordType, "prediction_outcome");
    assert.equal(close.record.recordType, "closing_price");
    assert.equal(outcome.queueItem.evaluationId, evaluation.id);
    assert.equal(outcome.queueItem.evidenceStatus, "missing_close");
    assert.equal(close.queueItem.evaluationId, evaluation.id);
    assert.equal(close.queueItem.evidenceStatus, "complete");
    assert.equal(outcome.syncState, "pending");
    assert.equal(close.syncState, "pending");
    assert.equal("stake" in outcome.record, false);
    assert.equal("profit" in outcome.record, false);

    const inspection = await readAuthoritativeLedger({ ledgerPath: logPath });
    const projection = projectCalibrationLedger(inspection.records);
    const outbox = await readOutboxState({ outboxPath });

    assert.equal(inspection.records.length, 3);
    assert.equal(projection.summary.settledPredictionCount, 1);
    assert.equal(projection.rows[0].outcome, 0);
    assert.equal(outbox.summary.pending, 3);
  });
});

test("closing-price API rejects sportsbook identity drift as a client error", async (t) => {
  const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), "bear-edge-shadow-api-drift-"));
  const logPath = path.join(tempDir, "decision_log.jsonl");
  const evaluation = shadowEvaluation();

  t.after(() => fs.rm(tempDir, { recursive: true, force: true }));
  await appendAuthoritativeRecord(evaluation, { ledgerPath: logPath });

  await withServer({ logPath }, async (baseUrl) => {
    const response = await fetch(`${baseUrl}/api/closing-prices`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(closingPriceBody(evaluation.id, "fanduel"))
    });
    const payload = await response.json();

    assert.equal(response.status, 400);
    assert.match(payload.error, /sportsbook does not match/i);
  });
});

test("shadow-evidence APIs reject malformed and financially contaminated inputs as client errors", async (t) => {
  const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), "bear-edge-shadow-api-invalid-"));
  const logPath = path.join(tempDir, "decision_log.jsonl");
  const evaluation = shadowEvaluation();

  t.after(() => fs.rm(tempDir, { recursive: true, force: true }));
  await appendAuthoritativeRecord(evaluation, { ledgerPath: logPath });

  await withServer({ logPath }, async (baseUrl) => {
    const malformed = outcomeBody(evaluation.id);
    delete malformed.source;
    const malformedResponse = await fetch(`${baseUrl}/api/prediction-outcomes`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(malformed)
    });
    const malformedPayload = await malformedResponse.json();

    const contaminatedResponse = await fetch(`${baseUrl}/api/prediction-outcomes`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ ...outcomeBody(evaluation.id), stake: 10 })
    });
    const contaminatedPayload = await contaminatedResponse.json();

    assert.equal(malformedResponse.status, 400);
    assert.match(malformedPayload.error, /invalid prediction outcome input/i);
    assert.equal(contaminatedResponse.status, 400);
    assert.match(contaminatedPayload.error, /stake.*prohibited/i);
  });
});

test("closing-price API rejects a source timestamp after the market close", async (t) => {
  const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), "bear-edge-shadow-api-chronology-"));
  const logPath = path.join(tempDir, "decision_log.jsonl");
  const evaluation = shadowEvaluation();

  t.after(() => fs.rm(tempDir, { recursive: true, force: true }));
  await appendAuthoritativeRecord(evaluation, { ledgerPath: logPath });

  await withServer({ logPath }, async (baseUrl) => {
    const input = closingPriceBody(evaluation.id);
    input.source.sourceTime = "2026-07-16T23:00:01.000Z";
    const response = await fetch(`${baseUrl}/api/closing-prices`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(input)
    });
    const payload = await response.json();

    assert.equal(response.status, 400);
    assert.match(payload.error, /source\.sourceTime.*marketClosedAt/i);
  });
});
