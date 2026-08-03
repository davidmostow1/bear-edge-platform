const test = require("node:test");
const assert = require("node:assert/strict");

const {
  buildEvidenceQueue,
  createClosingPriceRecord,
  createEvaluationRecord,
  createPredictionOutcomeRecord
} = require("../src/index.js");

function evaluation(sequence, overrides = {}) {
  const startTime = overrides.startTime ?? "2026-07-16T23:00:00.000Z";

  return createEvaluationRecord({
    origin: {
      channel: "evidence_queue_test",
      actorType: "system",
      sessionId: null,
      requestId: `queue-${sequence}`
    },
    event: {
      sport: "mlb",
      league: "MLB",
      eventId: `event-${sequence}`,
      startTime,
      homeTeam: `Home ${sequence}`,
      awayTeam: `Away ${sequence}`
    },
    market: {
      marketFamily: "pitcher_strikeouts",
      marketType: "player_prop",
      participantId: `pitcher-${sequence}`,
      participantName: `Pitcher ${sequence}`,
      selection: `Pitcher ${sequence} over 5.5 strikeouts`,
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
      sourceLocator: `https://provider.example/open/${sequence}`,
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
    clientEventId: `10000000-0000-4000-8000-${String(sequence).padStart(12, "0")}`,
    createdAt: `2026-07-16T13:${String(sequence).padStart(2, "0")}:00.000Z`
  });
}

function outcome(target, sequence, overrides = {}) {
  return createPredictionOutcomeRecord({
    evaluationId: target.id,
    supersedesId: overrides.supersedesId ?? null,
    outcome: overrides.outcome ?? "loss",
    resolvedAt: "2026-07-17T02:30:00.000Z",
    eventResult: { status: "final", homeScore: 2, awayScore: 1 },
    marketResult: { observedValue: overrides.observedValue ?? 4, unit: "strikeouts" },
    source: {
      provider: "mlb_official",
      sourceType: "official_box_score",
      sourceLocator: `https://www.mlb.com/gameday/${target.event.eventId}/final/box`,
      capturedAt: `2026-07-17T02:${String(35 + sequence).padStart(2, "0")}:00.000Z`,
      sourceTime: "2026-07-17T02:30:00.000Z",
      digest: "c".repeat(64),
      verificationStatus: "verified_official_result"
    },
    notes: []
  }, {
    clientEventId: `20000000-0000-4000-8000-${String(sequence).padStart(12, "0")}`,
    createdAt: `2026-07-17T02:${String(40 + sequence).padStart(2, "0")}:00.000Z`
  });
}

function closingPrice(target, sequence, overrides = {}) {
  return createClosingPriceRecord({
    evaluationId: target.id,
    supersedesId: overrides.supersedesId ?? null,
    price: {
      sportsbook: "draftkings",
      marketOdds: overrides.marketOdds ?? -120,
      oppositeOdds: overrides.oppositeOdds ?? 100,
      marketClosedAt: "2026-07-16T23:00:00.000Z",
      isFinal: true
    },
    source: {
      provider: "licensed_odds_feed",
      sourceType: "sportsbook_closing_price",
      sourceLocator: `https://provider.example/close/${target.event.eventId}`,
      capturedAt: `2026-07-16T23:00:${String(5 + sequence).padStart(2, "0")}.000Z`,
      sourceTime: "2026-07-16T23:00:00.000Z",
      digest: "d".repeat(64),
      verificationStatus: "verified_provider_capture"
    },
    notes: []
  }, {
    clientEventId: `30000000-0000-4000-8000-${String(sequence).padStart(12, "0")}`,
    createdAt: `2026-07-17T03:${String(sequence).padStart(2, "0")}:00.000Z`
  });
}

test("buildEvidenceQueue classifies pre-event, unresolved, partial, and complete evaluations", () => {
  const waiting = evaluation(1, { startTime: "2026-07-18T23:00:00.000Z" });
  const unresolved = evaluation(2);
  const partial = evaluation(3);
  const complete = evaluation(4);
  const partialOutcome = outcome(partial, 1);
  const completeOutcome = outcome(complete, 2);
  const completeClose = closingPrice(complete, 1);

  const queue = buildEvidenceQueue([
    waiting,
    unresolved,
    partial,
    partialOutcome,
    complete,
    completeOutcome,
    completeClose
  ], {
    now: "2026-07-17T12:00:00.000Z",
    minimumSettledPredictions: 500,
    status: "all"
  });

  const byId = new Map(queue.items.map((item) => [item.evaluationId, item]));

  assert.equal(byId.get(waiting.id).evidenceStatus, "awaiting_event");
  assert.equal(byId.get(unresolved.id).evidenceStatus, "missing_outcome_and_close");
  assert.equal(byId.get(unresolved.id).permission, "PRICE_CHECK_ONLY");
  assert.equal(byId.get(partial.id).evidenceStatus, "missing_close");
  assert.equal(byId.get(complete.id).evidenceStatus, "complete");
  assert.deepEqual(byId.get(unresolved.id).missingEvidence, [
    "MISSING_PREDICTION_OUTCOME",
    "MISSING_CLOSING_PRICE"
  ]);
  assert.equal(queue.summary.totalEvaluations, 4);
  assert.equal(queue.summary.completeObservations, 1);
  assert.equal(queue.summary.minimumSettledPredictions, 500);
  assert.equal(queue.summary.remainingToMinimum, 499);
  assert.equal(queue.writeBlocked, false);
});

test("buildEvidenceQueue applies only the latest linear evidence correction", () => {
  const target = evaluation(5);
  const firstOutcome = outcome(target, 1);
  const correctedOutcome = outcome(target, 2, {
    supersedesId: firstOutcome.id,
    outcome: "win",
    observedValue: 7
  });
  const firstClose = closingPrice(target, 1);
  const correctedClose = closingPrice(target, 2, {
    supersedesId: firstClose.id,
    marketOdds: -130,
    oppositeOdds: 110
  });

  const queue = buildEvidenceQueue([
    target,
    firstOutcome,
    firstClose,
    correctedOutcome,
    correctedClose
  ], {
    now: "2026-07-17T12:00:00.000Z",
    minimumSettledPredictions: 500,
    status: "all"
  });
  const item = queue.items[0];

  assert.equal(item.latestOutcome.id, correctedOutcome.id);
  assert.equal(item.latestOutcome.outcome, "win");
  assert.equal(item.outcomeSupersedesId, correctedOutcome.id);
  assert.equal(item.latestClosingPrice.id, correctedClose.id);
  assert.equal(item.latestClosingPrice.price.marketOdds, -130);
  assert.equal(item.closingPriceSupersedesId, correctedClose.id);
  assert.equal(item.evidenceStatus, "complete");
});

test("buildEvidenceQueue blocks invalid correction history and reports ledger findings", () => {
  const target = evaluation(6);
  const first = outcome(target, 1);
  const branch = outcome(target, 2, { supersedesId: null });
  const records = [target, first, branch];
  const snapshot = structuredClone(records);

  const queue = buildEvidenceQueue(records, {
    now: "2026-07-17T12:00:00.000Z",
    minimumSettledPredictions: 500,
    status: "unresolved",
    inspection: {
      malformedLines: [{ lineNumber: 9 }],
      duplicateIds: [],
      digestConflicts: [],
      invalidRecords: []
    }
  });

  assert.equal(queue.writeBlocked, true);
  assert.equal(queue.summary.invalidCorrectionReferences, 1);
  assert.equal(queue.items[0].evidenceStatus, "blocked");
  assert.ok(queue.findings.some((finding) => finding.code === "MALFORMED_LEDGER_LINES"));
  assert.ok(queue.findings.some((finding) => finding.code === "INVALID_EVIDENCE_HISTORY"));
  assert.deepEqual(records, snapshot);
});

test("buildEvidenceQueue filters and limits stable newest-first results", () => {
  const older = evaluation(7);
  const newer = evaluation(8);
  const completedOutcome = outcome(older, 1);
  const completedClose = closingPrice(older, 1);

  const unresolved = buildEvidenceQueue([
    older,
    completedOutcome,
    completedClose,
    newer
  ], {
    now: "2026-07-17T12:00:00.000Z",
    minimumSettledPredictions: 500,
    status: "unresolved",
    limit: 1
  });
  const complete = buildEvidenceQueue([
    older,
    completedOutcome,
    completedClose,
    newer
  ], {
    now: "2026-07-17T12:00:00.000Z",
    minimumSettledPredictions: 500,
    status: "complete"
  });

  assert.equal(unresolved.items.length, 1);
  assert.equal(unresolved.items[0].evaluationId, newer.id);
  assert.equal(complete.items.length, 1);
  assert.equal(complete.items[0].evaluationId, older.id);
});

test("buildEvidenceQueue selects an exact evaluation before pagination", () => {
  const older = evaluation(9);
  const newer = evaluation(10);

  const queue = buildEvidenceQueue([older, newer], {
    now: "2026-07-17T12:00:00.000Z",
    minimumSettledPredictions: 500,
    status: "all",
    limit: 1,
    targetEvaluationId: older.id
  });

  assert.equal(queue.items.length, 1);
  assert.equal(queue.items[0].evaluationId, older.id);
  assert.equal(queue.summary.totalEvaluations, 2);
});
