const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs/promises");
const os = require("node:os");
const path = require("node:path");

const publicApi = require("../src/index.js");

function uuid(sequence) {
  return `70000000-0000-4000-8000-${String(sequence).padStart(12, "0")}`;
}

function researchEvaluation() {
  return publicApi.createEvaluationRecord({
    origin: {
      channel: "test",
      actorType: "operator",
      sessionId: "shadow-session",
      requestId: "shadow-request"
    },
    event: {
      sport: "mlb",
      league: "MLB",
      eventId: "401816143",
      startTime: "2026-07-16T23:00:00.000Z",
      homeTeam: "New York Yankees",
      awayTeam: "Los Angeles Dodgers"
    },
    market: {
      marketFamily: "pitcher_strikeouts",
      marketType: "Primary Prop",
      participantId: "543037",
      participantName: "Gerrit Cole",
      selection: "Gerrit Cole over 5.5 strikeouts",
      side: "over",
      line: 5.5
    },
    price: {
      sportsbook: "draftkings",
      marketOdds: 110,
      oppositeOdds: -130,
      priceCapturedAt: "2026-07-16T17:45:00.000Z",
      priceSourceTime: "2026-07-16T17:44:00.000Z"
    },
    sources: [{
      provider: "licensed_odds_feed",
      sourceType: "sportsbook_price",
      sourceLocator: "https://provider.example/events/401816143",
      parserVersion: "test_v1",
      capturedAt: "2026-07-16T17:45:00.000Z",
      sourceTime: "2026-07-16T17:44:00.000Z",
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
      sampleSize: 54
    },
    probability: {
      rawModelProbability: 0.55,
      adjustedProbability: 0.53,
      marketImpliedProbability: 0.476,
      marketNoVigProbability: 0.49
    },
    edge: {
      fairEdge: 0.04,
      priceEdge: 0.054,
      expectedValueRoi: 0.11,
      kellyFraction: 0.05
    },
    stake: {
      recommendedStake: 0,
      bankroll: 1000,
      stakePolicyVersion: "test_v1"
    },
    decision: {
      verdict: "WAIT",
      permission: "PRICE_CHECK_ONLY",
      reasons: ["Research model requires shadow validation."],
      riskFlags: [{ code: "MODEL_CALIBRATION_REQUIRED", severity: "high" }],
      gateResults: [{ gate: "calibration", passed: false }]
    },
    audit: {
      codeVersion: "test",
      configurationDigest: "b".repeat(64),
      calculationVersion: "test_v1",
      evidenceCompleteness: "verified_price_research_model",
      warnings: []
    }
  }, {
    clientEventId: uuid(1),
    createdAt: "2026-07-16T17:45:01.000Z"
  });
}

function outcomeInput(overrides = {}) {
  return {
    evaluationId: researchEvaluation().id,
    supersedesId: null,
    outcome: "loss",
    resolvedAt: "2026-07-17T03:00:00.000Z",
    eventResult: { status: "final", homeScore: 1, awayScore: 0 },
    marketResult: { observedValue: 4, unit: "strikeouts" },
    source: {
      provider: "mlb_official",
      sourceType: "official_box_score",
      sourceLocator: "https://www.mlb.com/gameday/401816143/final/box",
      capturedAt: "2026-07-17T03:05:00.000Z",
      sourceTime: "2026-07-17T03:00:00.000Z",
      digest: "c".repeat(64),
      verificationStatus: "verified_official_result"
    },
    notes: [],
    ...overrides
  };
}

function closingPriceInput(overrides = {}) {
  return {
    evaluationId: researchEvaluation().id,
    supersedesId: null,
    price: {
      sportsbook: "draftkings",
      marketOdds: -125,
      oppositeOdds: 105,
      marketClosedAt: "2026-07-16T23:00:00.000Z",
      isFinal: true
    },
    source: {
      provider: "licensed_odds_feed",
      sourceType: "sportsbook_closing_price",
      sourceLocator: "https://provider.example/events/401816143/closing",
      capturedAt: "2026-07-16T23:00:05.000Z",
      sourceTime: "2026-07-16T23:00:00.000Z",
      digest: "d".repeat(64),
      verificationStatus: "verified_provider_capture"
    },
    notes: [],
    ...overrides
  };
}

async function localLedger(t) {
  const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), "bear-edge-shadow-evidence-"));
  const ledgerPath = path.join(tempDir, "decision_log.jsonl");
  const outboxPath = path.join(tempDir, "sync_outbox.jsonl");
  const evaluation = researchEvaluation();
  t.after(() => fs.rm(tempDir, { recursive: true, force: true }));
  await publicApi.appendAuthoritativeRecord(evaluation, { ledgerPath, outboxPath });

  return { evaluation, ledgerPath, outboxPath };
}

test("a WAIT evaluation accepts official shadow outcome evidence without becoming a settlement", async (t) => {
  assert.equal(typeof publicApi.appendPredictionOutcome, "function");
  const local = await localLedger(t);

  const result = await publicApi.appendPredictionOutcome(outcomeInput(), {
    logPath: local.ledgerPath,
    outboxPath: local.outboxPath,
    context: {
      clientEventId: uuid(2),
      createdAt: "2026-07-17T03:06:00.000Z"
    }
  });
  const inspection = await publicApi.readDecisionLogEntries({ logPath: local.ledgerPath });

  assert.equal(result.record.recordType, "prediction_outcome");
  assert.equal(inspection.records.length, 2);
  assert.equal(inspection.records.some((record) => record.recordType === "settlement"), false);
});

test("shadow outcomes reject orphan, pre-event, and mathematically inconsistent evidence", async (t) => {
  const local = await localLedger(t);
  const baseOptions = {
    logPath: local.ledgerPath,
    outboxPath: local.outboxPath,
    context: { clientEventId: uuid(3), createdAt: "2026-07-17T03:06:00.000Z" }
  };

  await assert.rejects(
    publicApi.appendPredictionOutcome(outcomeInput({ evaluationId: "eval_missing" }), baseOptions),
    /does not exist/i
  );
  await assert.rejects(
    publicApi.appendPredictionOutcome(outcomeInput({
      resolvedAt: "2026-07-16T22:59:00.000Z",
      source: {
        ...outcomeInput().source,
        sourceTime: "2026-07-16T22:59:00.000Z"
      }
    }), baseOptions),
    /before the event start/i
  );
  await assert.rejects(
    publicApi.appendPredictionOutcome(outcomeInput({
      outcome: "loss",
      marketResult: { observedValue: 6, unit: "strikeouts" }
    }), baseOptions),
    /does not match.*observed value/i
  );
});

test("shadow outcome corrections must supersede the latest record in one linear history", async (t) => {
  const local = await localLedger(t);
  const first = await publicApi.appendPredictionOutcome(outcomeInput(), {
    logPath: local.ledgerPath,
    outboxPath: local.outboxPath,
    context: { clientEventId: uuid(4), createdAt: "2026-07-17T03:06:00.000Z" }
  });
  const correctedInput = outcomeInput({
    supersedesId: first.record.id,
    outcome: "win",
    marketResult: { observedValue: 6, unit: "strikeouts" },
    notes: ["Official scoring correction."]
  });

  const correction = await publicApi.appendPredictionOutcome(correctedInput, {
    logPath: local.ledgerPath,
    outboxPath: local.outboxPath,
    context: { clientEventId: uuid(5), createdAt: "2026-07-17T03:07:00.000Z" }
  });

  assert.equal(correction.record.supersedesId, first.record.id);
  await assert.rejects(
    publicApi.appendPredictionOutcome(correctedInput, {
      logPath: local.ledgerPath,
      outboxPath: local.outboxPath,
      context: { clientEventId: uuid(6), createdAt: "2026-07-17T03:08:00.000Z" }
    }),
    /must supersede the latest/i
  );
});

test("a WAIT evaluation accepts exact-book closing evidence and rejects identity drift", async (t) => {
  assert.equal(typeof publicApi.appendClosingPrice, "function");
  const local = await localLedger(t);

  const result = await publicApi.appendClosingPrice(closingPriceInput(), {
    logPath: local.ledgerPath,
    outboxPath: local.outboxPath,
    context: { clientEventId: uuid(7), createdAt: "2026-07-16T23:01:00.000Z" }
  });

  assert.equal(result.record.recordType, "closing_price");
  assert.equal(result.record.price.sportsbook, local.evaluation.price.sportsbook);

  await assert.rejects(
    publicApi.appendClosingPrice(closingPriceInput({
      supersedesId: result.record.id,
      price: { ...closingPriceInput().price, sportsbook: "fanduel" }
    }), {
      logPath: local.ledgerPath,
      outboxPath: local.outboxPath,
      context: { clientEventId: uuid(8), createdAt: "2026-07-16T23:02:00.000Z" }
    }),
    /sportsbook.*does not match/i
  );
});

test("closing-price corrections reject stale branches and post-start market closes", async (t) => {
  const local = await localLedger(t);
  const first = await publicApi.appendClosingPrice(closingPriceInput(), {
    logPath: local.ledgerPath,
    outboxPath: local.outboxPath,
    context: { clientEventId: uuid(9), createdAt: "2026-07-16T23:01:00.000Z" }
  });
  const corrected = closingPriceInput({
    supersedesId: first.record.id,
    price: { ...closingPriceInput().price, marketOdds: -120, oppositeOdds: 100 }
  });
  await publicApi.appendClosingPrice(corrected, {
    logPath: local.ledgerPath,
    outboxPath: local.outboxPath,
    context: { clientEventId: uuid(10), createdAt: "2026-07-16T23:02:00.000Z" }
  });

  await assert.rejects(
    publicApi.appendClosingPrice(corrected, {
      logPath: local.ledgerPath,
      outboxPath: local.outboxPath,
      context: { clientEventId: uuid(11), createdAt: "2026-07-16T23:03:00.000Z" }
    }),
    /must supersede the latest/i
  );
  await assert.rejects(
    publicApi.appendClosingPrice(closingPriceInput({
      supersedesId: "close_70000000-0000-4000-8000-000000000010",
      price: {
        ...closingPriceInput().price,
        marketClosedAt: "2026-07-16T23:00:01.000Z"
      },
      source: {
        ...closingPriceInput().source,
        capturedAt: "2026-07-16T23:00:06.000Z",
        sourceTime: "2026-07-16T23:00:01.000Z"
      }
    }), {
      logPath: local.ledgerPath,
      outboxPath: local.outboxPath,
      context: { clientEventId: uuid(12), createdAt: "2026-07-16T23:03:00.000Z" }
    }),
    /after the event start/i
  );
});

test("shadow evidence rejects financial contamination instead of silently dropping it", async (t) => {
  const local = await localLedger(t);
  const options = {
    logPath: local.ledgerPath,
    outboxPath: local.outboxPath,
    context: { clientEventId: uuid(13), createdAt: "2026-07-17T03:06:00.000Z" }
  };

  await assert.rejects(
    publicApi.appendPredictionOutcome(outcomeInput({ stake: 10 }), options),
    /stake.*prohibited/i
  );
  await assert.rejects(
    publicApi.appendClosingPrice(closingPriceInput({ outcome: "win" }), {
      ...options,
      context: { clientEventId: uuid(14), createdAt: "2026-07-16T23:01:00.000Z" }
    }),
    /outcome.*prohibited/i
  );

  const inspection = await publicApi.readDecisionLogEntries({ logPath: local.ledgerPath });
  assert.equal(inspection.records.length, 1);
});
