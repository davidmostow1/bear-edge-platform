const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs/promises");
const os = require("node:os");
const path = require("node:path");

const {
  appendAmendment,
  appendAuthoritativeRecord,
  appendSettlement,
  calculateClosingLineValue,
  createClosingPriceRecord,
  createEvaluationRecord,
  createPredictionOutcomeRecord,
  createSettlementRecord,
  getDecisionLogDashboard,
  readDecisionLogEntries,
  summarizeDecisionLogRecords
} = require("../src/index.js");

function canonicalEvaluation(sequence = 1, options = {}) {
  const clientEventId = `00000000-0000-4000-8000-${String(sequence).padStart(12, "0")}`;
  const createdAt = `2026-07-17T12:${String(sequence).padStart(2, "0")}:00.000Z`;
  const verdict = options.verdict ?? "BET";
  const isBet = verdict === "BET";

  return createEvaluationRecord({
    origin: { channel: "test", actorType: "operator" },
    event: {
      sport: "mlb",
      league: "MLB",
      eventId: `event-${sequence}`,
      startTime: "2026-07-17T23:00:00.000Z",
      homeTeam: "Home",
      awayTeam: "Away"
    },
    market: {
      marketFamily: "moneyline",
      marketType: "moneyline",
      selection: `Evaluation ${sequence}`
    },
    price: {
      sportsbook: isBet ? "draftkings" : null,
      marketOdds: 120,
      oppositeOdds: isBet ? -135 : null,
      priceCapturedAt: isBet ? "2026-07-17T11:59:00.000Z" : null,
      priceSourceTime: isBet ? "2026-07-17T11:58:30.000Z" : null
    },
    sources: isBet ? [{
      provider: "the_odds_api",
      sourceType: "sportsbook_price",
      sourceLocator: "https://api.the-odds-api.com/v4/sports/baseball_mlb/odds",
      parserVersion: "test_v1",
      capturedAt: "2026-07-17T11:59:00.000Z",
      sourceTime: "2026-07-17T11:58:30.000Z",
      digest: "a".repeat(64),
      freshness: "fresh",
      verificationStatus: "verified_provider_capture"
    }] : [],
    model: {
      modelId: isBet ? "validated_moneyline" : "research_moneyline",
      modelVersion: "1.0.0",
      probabilityMethod: "calibrated_logistic",
      modelStatus: isBet ? "validated" : "research_only",
      calibrationReportId: isBet ? "calibration-report-001" : null,
      sampleSize: isBet ? 500 : null
    },
    probability: {
      rawModelProbability: 0.59,
      adjustedProbability: 0.58,
      marketImpliedProbability: 0.4545,
      marketNoVigProbability: 0.47
    },
    edge: {
      fairEdge: 0.11,
      priceEdge: 0.1255,
      expectedValueRoi: 0.276,
      kellyFraction: 0.12
    },
    stake: {
      recommendedStake: isBet ? 10 : 0,
      bankroll: 1000,
      stakePolicyVersion: "test_v1"
    },
    decision: {
      verdict,
      permission: isBet ? "VERIFIED_BETS_ALLOWED" : "PRICE_CHECK_ONLY",
      reasons: [isBet ? "Verified test evaluation." : "Research-only evaluation."],
      riskFlags: [],
      gateResults: isBet ? [{ gate: "authorization", passed: true }] : []
    },
    audit: {
      codeVersion: "test",
      configurationDigest: "b".repeat(64),
      calculationVersion: "test_v1",
      evidenceCompleteness: isBet ? "verified" : "research_only",
      warnings: []
    }
  }, {
    clientEventId,
    createdAt
  });
}

test("calculateClosingLineValue rewards beating the closing price", () => {
  assert.ok(Math.abs(calculateClosingLineValue(120, 100) - 0.1) < 1e-12);
  assert.ok(calculateClosingLineValue(-110, -140) > 0);
  assert.ok(calculateClosingLineValue(100, 120) < 0);
});

test("createSettlementRecord validates append-only outcome records", () => {
  const settlement = createSettlementRecord({
    evaluationId: "eval_123",
    outcome: "win",
    closingOdds: -125,
    closingOppositeOdds: 105,
    closingLineEvidence: {
      sportsbook: "draftkings",
      capturedAt: "2026-07-17T19:10:05.000Z",
      marketClosedAt: "2026-07-17T19:10:00.000Z",
      isFinal: true,
      sourceLocator: "file:///verified-closing-line.png",
      sourceDigest: "c".repeat(64)
    },
    stake: 10,
    profit: 8,
    notes: "Closed shorter than entry."
  });

  assert.equal(settlement.recordType, "settlement");
  assert.equal(settlement.evaluationId, "eval_123");
  assert.equal(settlement.outcome, "win");
  assert.equal(settlement.closingOdds, -125);
  assert.equal(settlement.closingLineEvidence.sportsbook, "draftkings");
  assert.equal(settlement.closingLineEvidence.sourceDigest, "c".repeat(64));
  assert.equal(settlement.stake, 10);
  assert.equal(settlement.profit, 8);
  assert.deepEqual(settlement.notes, ["Closed shorter than entry."]);

  assert.throws(
    () =>
      createSettlementRecord({
        evaluationId: "eval_123",
        outcome: "bad"
      }),
    /outcome must be one of/
  );
  assert.throws(
    () => createSettlementRecord({ evaluationId: "eval_123", outcome: "loss" }),
    /final settlement requires a positive stake and explicit profit/i
  );
  assert.throws(
    () => createSettlementRecord({ evaluationId: "eval_123", outcome: "win", stake: 10, profit: -10 }),
    /win.*positive profit/i
  );
  assert.throws(
    () => createSettlementRecord({ evaluationId: "eval_123", outcome: "loss", stake: 10, profit: 5 }),
    /loss.*negative profit/i
  );
  assert.throws(
    () => createSettlementRecord({ evaluationId: "eval_123", outcome: "push", stake: 10, profit: 1 }),
    /push.*zero profit/i
  );
  assert.throws(
    () => createSettlementRecord({ evaluationId: "eval_123", outcome: "pending", stake: 10, profit: 1 }),
    /pending.*cannot include profit/i
  );
});

test("decision analytics quarantine economically contradictory settlements", () => {
  const evaluation = canonicalEvaluation(20);
  const dashboard = summarizeDecisionLogRecords([
    evaluation,
    {
      id: "settle_contradictory",
      recordType: "settlement",
      evaluationId: evaluation.id,
      outcome: "win",
      stake: 10,
      profit: -10,
      settledAt: "2026-07-17T20:00:00.000Z"
    }
  ]);

  assert.equal(dashboard.summary.settledBetCalls, 0);
  assert.equal(dashboard.dataQuality.status, "blocked");
  assert.equal(dashboard.dataQuality.metrics.economicallyInvalidSettlementCount, 1);
  assert.ok(
    dashboard.dataQuality.checks.some((check) => check.code === "INVALID_SETTLEMENT_ECONOMICS")
  );
});

test("shadow outcome and closing-price evidence do not inflate decision analytics", () => {
  const target = canonicalEvaluation(1, { verdict: "WAIT" });
  const outcome = createPredictionOutcomeRecord({
    evaluationId: target.id,
    supersedesId: null,
    outcome: "loss",
    resolvedAt: "2026-07-18T02:30:00.000Z",
    eventResult: { status: "final", homeScore: 2, awayScore: 1 },
    marketResult: { observedValue: 0, unit: "wins" },
    source: {
      provider: "mlb_official",
      sourceType: "official_box_score",
      sourceLocator: "https://www.mlb.com/gameday/event-1/final/box",
      capturedAt: "2026-07-18T02:35:00.000Z",
      sourceTime: "2026-07-18T02:30:00.000Z",
      digest: "c".repeat(64),
      verificationStatus: "verified_official_result"
    },
    notes: []
  }, {
    clientEventId: "40000000-0000-4000-8000-000000000001",
    createdAt: "2026-07-18T02:36:00.000Z"
  });
  const close = createClosingPriceRecord({
    evaluationId: target.id,
    supersedesId: null,
    price: {
      sportsbook: "draftkings",
      marketOdds: -120,
      oppositeOdds: 100,
      marketClosedAt: "2026-07-17T23:00:00.000Z",
      isFinal: true
    },
    source: {
      provider: "licensed_odds_feed",
      sourceType: "sportsbook_closing_price",
      sourceLocator: "https://provider.example/event-1/close",
      capturedAt: "2026-07-17T23:00:05.000Z",
      sourceTime: "2026-07-17T23:00:00.000Z",
      digest: "d".repeat(64),
      verificationStatus: "verified_provider_capture"
    },
    notes: []
  }, {
    clientEventId: "50000000-0000-4000-8000-000000000001",
    createdAt: "2026-07-18T02:37:00.000Z"
  });

  const dashboard = summarizeDecisionLogRecords([target, outcome, close]);

  assert.equal(dashboard.summary.totalEvaluations, 1);
  assert.deepEqual(dashboard.summary.verdictCounts, { BET: 0, WAIT: 1, PASS: 0 });
  assert.equal(dashboard.evaluations.length, 1);
  assert.equal(dashboard.evaluations[0].id, target.id);
  assert.equal(dashboard.dataQuality.metrics.totalEvaluations, 1);
});

test("decision-log analytics track CLV, hit rate, EV by market type, parlays, and false positives", () => {
  const records = [
    {
      id: "eval_moneyline",
      recordType: "evaluation",
      timestamp: "2026-06-17T10:00:00.000Z",
      selection: "Sample ML",
      verdict: "BET",
      inputs: {
        marketOdds: 120,
        marketType: "moneyline"
      },
      metrics: {
        expectedValueRoi: 0.12,
        expectedProfitAtRecommendedStake: 12,
        rawKellyFraction: 0.05,
        recommendedStake: 100
      },
      riskFlags: []
    },
    {
      id: "eval_parlay",
      recordType: "evaluation",
      timestamp: "2026-06-17T10:01:00.000Z",
      kind: "parlay",
      selection: "Two-leg parlay",
      verdict: "BET",
      riskFlags: [],
      result: {
        kind: "parlay",
        selection: "Two-leg parlay",
        verdict: "BET",
        riskFlags: [],
        combined: {
          americanOdds: 300
        },
        expectedValue: {
          roi: 0.2
        },
        kelly: {
          fraction: 0.04
        },
        stakeRecommendation: {
          recommendedStake: 20
        },
        legs: []
      }
    },
    {
      recordType: "settlement",
      timestamp: "2026-06-17T11:00:00.000Z",
      evaluationId: "eval_moneyline",
      outcome: "loss",
      closingOdds: 100
    },
    {
      recordType: "settlement",
      timestamp: "2026-06-17T11:01:00.000Z",
      evaluationId: "eval_parlay",
      outcome: "win",
      closingOdds: 250
    }
  ];

  const dashboard = summarizeDecisionLogRecords(records);
  const moneyline = dashboard.byMarketType.find((group) => group.marketType === "moneyline");
  const parlay = dashboard.byMarketType.find((group) => group.marketType === "parlay");

  assert.equal(dashboard.summary.totalEvaluations, 2);
  assert.equal(dashboard.summary.hitRate, 0.5);
  assert.equal(dashboard.summary.falsePositiveBetCalls, 1);
  assert.equal(moneyline.averageEvRoi, 0.12);
  assert.equal(moneyline.falsePositiveBetCalls, 1);
  assert.equal(parlay.hitRate, 1);
  assert.equal(dashboard.parlayPerformance.betCalls, 1);
  assert.equal(dashboard.parlayPerformance.wins, 1);
  assert.ok(
    Math.abs(dashboard.evaluations.find((evaluation) => evaluation.id === "eval_moneyline").closingLineValue - 0.1) <
      1e-12
  );
  assert.equal(dashboard.validationGate.currentWinStreak, 1);
  assert.equal(dashboard.validationGate.remainingWins, 2);
});

test("validation gate requires three settled BET wins in a row", () => {
  const records = [
    {
      id: "eval_1",
      recordType: "evaluation",
      selection: "Bet 1",
      verdict: "BET",
      inputs: { marketOdds: -110, marketType: "straight" },
      metrics: { expectedValueRoi: 0.05, recommendedStake: 10 }
    },
    {
      id: "eval_2",
      recordType: "evaluation",
      selection: "Bet 2",
      verdict: "BET",
      inputs: { marketOdds: -110, marketType: "straight" },
      metrics: { expectedValueRoi: 0.05, recommendedStake: 10 }
    },
    {
      id: "eval_3",
      recordType: "evaluation",
      selection: "Bet 3",
      verdict: "BET",
      inputs: { marketOdds: -110, marketType: "straight" },
      metrics: { expectedValueRoi: 0.05, recommendedStake: 10 }
    },
    {
      recordType: "settlement",
      evaluationId: "eval_1",
      outcome: "win",
      closingOdds: -115,
      settledAt: "2026-06-17T10:00:00.000Z"
    },
    {
      recordType: "settlement",
      evaluationId: "eval_2",
      outcome: "win",
      closingOdds: -120,
      settledAt: "2026-06-17T11:00:00.000Z"
    },
    {
      recordType: "settlement",
      evaluationId: "eval_3",
      outcome: "win",
      closingOdds: -125,
      settledAt: "2026-06-17T12:00:00.000Z"
    }
  ];

  const dashboard = summarizeDecisionLogRecords(records);

  assert.equal(dashboard.validationGate.complete, true);
  assert.equal(dashboard.validationGate.currentWinStreak, 3);
  assert.equal(dashboard.validationGate.remainingWins, 0);
});

test("validation gate rejects settled wins without closing-line evidence", () => {
  const records = [1, 2, 3].flatMap((number) => [
    {
      id: `eval_${number}`,
      recordType: "evaluation",
      timestamp: `2026-06-17T0${number}:00:00.000Z`,
      selection: `Bet ${number}`,
      verdict: "BET",
      inputs: { marketOdds: -110, marketType: "straight" },
      metrics: { expectedValueRoi: 0.05, recommendedStake: 10 },
      sourceTimestamps: [`2026-06-17T0${number}:00:00.000Z`]
    },
    {
      recordType: "settlement",
      evaluationId: `eval_${number}`,
      outcome: "win",
      settledAt: `2026-06-17T1${number}:00:00.000Z`
    }
  ]);

  const dashboard = summarizeDecisionLogRecords(records);

  assert.equal(dashboard.validationGate.complete, false);
  assert.equal(dashboard.validationGate.currentWinStreak, 0);
  assert.equal(dashboard.validationGate.remainingWins, 3);
  assert.equal(dashboard.validationGate.ineligibleSettledBetCalls, 3);
  assert.ok(dashboard.dataQuality.checks.some((check) => check.code === "MISSING_CLOSING_ODDS"));
});

test("decision-log data quality blocks ungraded BET history", () => {
  const dashboard = summarizeDecisionLogRecords([
    {
      id: "eval_unsettled",
      recordType: "evaluation",
      timestamp: "2026-06-17T10:00:00.000Z",
      selection: "Unsettled model call",
      verdict: "BET",
      inputs: {
        marketOdds: -110,
        marketType: "moneyline"
      },
      metrics: {
        expectedValueRoi: 0.04,
        recommendedStake: 5
      }
    }
  ]);

  assert.equal(dashboard.dataQuality.status, "blocked");
  assert.equal(dashboard.dataQuality.metrics.betCalls, 1);
  assert.equal(dashboard.dataQuality.metrics.settledBetCalls, 0);
  assert.equal(dashboard.dataQuality.metrics.settlementCoverageForBetCalls, 0);
  assert.ok(dashboard.dataQuality.checks.some((check) => check.code === "NO_SETTLED_BET_CALLS"));
  assert.ok(dashboard.dataQuality.warnings.some((warning) => warning.includes("not decision-grade")));
});

test("decision-log data quality flags malformed rows and orphan settlements", () => {
  const dashboard = summarizeDecisionLogRecords(
    [
      {
        id: "eval_pass",
        recordType: "evaluation",
        selection: "Pass example",
        verdict: "PASS",
        inputs: {
          marketOdds: 120,
          marketType: "straight"
        }
      },
      {
        recordType: "settlement",
        evaluationId: "missing_eval",
        outcome: "win"
      }
    ],
    [{ lineNumber: 3, error: "Unexpected token" }]
  );

  assert.equal(dashboard.dataQuality.status, "blocked");
  assert.equal(dashboard.dataQuality.metrics.malformedLineCount, 1);
  assert.equal(dashboard.dataQuality.metrics.orphanSettlementCount, 1);
  assert.ok(dashboard.dataQuality.checks.some((check) => check.code === "MALFORMED_LOG_LINES"));
  assert.ok(dashboard.dataQuality.checks.some((check) => check.code === "ORPHAN_SETTLEMENTS"));
});

test("decision-log reading reports duplicate identifiers and digest conflicts without changing records", async (t) => {
  const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), "bear-edge-analytics-"));
  const logPath = path.join(tempDir, "decision_log.jsonl");
  const first = { id: "eval_duplicate", contentDigest: "a".repeat(64), verdict: "WAIT" };
  const conflict = { ...first, contentDigest: "b".repeat(64) };
  t.after(() => fs.rm(tempDir, { recursive: true, force: true }));

  await fs.writeFile(
    logPath,
    `${JSON.stringify(first)}\n${JSON.stringify(first)}\n${JSON.stringify(conflict)}\n`,
    "utf8"
  );
  const result = await readDecisionLogEntries({ logPath });

  assert.equal(result.records.length, 3);
  assert.equal(result.duplicateIds.length, 1);
  assert.equal(result.digestConflicts.length, 1);
  assert.deepEqual(result.records[0], first);
});

test("authoritative dashboard metrics exclude legacy decision rows", async (t) => {
  const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), "bear-edge-analytics-authority-"));
  const logPath = path.join(tempDir, "decision_log.jsonl");
  const canonical = canonicalEvaluation(8, { verdict: "WAIT" });
  t.after(() => fs.rm(tempDir, { recursive: true, force: true }));

  await appendAuthoritativeRecord(canonical, { logPath });
  await fs.appendFile(
    logPath,
    `${JSON.stringify({ timestamp: "2026-07-17T12:00:00.000Z", verdict: "BET", selection: "Legacy bet" })}\n`,
    "utf8"
  );
  const dashboard = await getDecisionLogDashboard({ logPath });

  assert.equal(dashboard.summary.totalEvaluations, 1);
  assert.equal(dashboard.summary.verdictCounts.BET, 0);
  assert.equal(dashboard.legacyRecordCount, 1);
  assert.equal(dashboard.dataQuality.status, "blocked");
  assert.ok(dashboard.dataQuality.checks.some((check) => check.code === "LEGACY_RECORDS_EXCLUDED"));
});

test("appendSettlement rejects an unknown evaluation id", async (t) => {
  const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), "bear-edge-settlement-"));
  const logPath = path.join(tempDir, "decision_log.jsonl");
  t.after(() => fs.rm(tempDir, { recursive: true, force: true }));

  await assert.rejects(
    appendSettlement({ evaluationId: "eval_missing", outcome: "win", stake: 10 }, { logPath }),
    /evaluation does not exist/i
  );
});

test("appendSettlement rejects a WAIT or PASS evaluation", async (t) => {
  const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), "bear-edge-settlement-"));
  const logPath = path.join(tempDir, "decision_log.jsonl");
  const evaluation = canonicalEvaluation(9, { verdict: "WAIT" });
  t.after(() => fs.rm(tempDir, { recursive: true, force: true }));

  await appendAuthoritativeRecord(evaluation, {
    logPath,
    resolveModelEvidenceImpl: (identity) => ({
      ...identity,
      calibrationReportId: evaluation.model.calibrationReportId,
      validated: true
    })
  });

  await assert.rejects(
    appendSettlement({ evaluationId: evaluation.id, outcome: "loss" }, { logPath }),
    /only a BET evaluation can be settled/i
  );
});

test("appendSettlement requires corrections to use immutable amendments", async (t) => {
  const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), "bear-edge-settlement-"));
  const logPath = path.join(tempDir, "decision_log.jsonl");
  const evaluation = canonicalEvaluation(1);
  t.after(() => fs.rm(tempDir, { recursive: true, force: true }));

  await appendAuthoritativeRecord(evaluation, {
    logPath,
    resolveModelEvidenceImpl: (identity) => ({
      ...identity,
      calibrationReportId: evaluation.model.calibrationReportId,
      validated: true
    })
  });
  await appendSettlement({ evaluationId: evaluation.id, outcome: "loss", stake: 10, profit: -10 }, { logPath });

  await assert.rejects(
    appendSettlement({ evaluationId: evaluation.id, outcome: "win", stake: 10, profit: 8 }, { logPath }),
    /already has a settlement.*amendment/i
  );
});

test("a settlement correction is an amendment and preserves every record", async (t) => {
  const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), "bear-edge-amendment-"));
  const logPath = path.join(tempDir, "decision_log.jsonl");
  const evaluation = canonicalEvaluation(2);
  t.after(() => fs.rm(tempDir, { recursive: true, force: true }));

  await appendAuthoritativeRecord(evaluation, {
    logPath,
    resolveModelEvidenceImpl: (identity) => ({
      ...identity,
      calibrationReportId: evaluation.model.calibrationReportId,
      validated: true
    })
  });
  const settlementResult = await appendSettlement({
    evaluationId: evaluation.id,
    outcome: "loss",
    stake: 10,
    profit: -10,
    closingOdds: 100
  }, { logPath });
  const amendment = await appendAmendment({
    evaluationId: evaluation.id,
    settlementId: settlementResult.settlement.id,
    reason: "Official scoring correction",
    patch: { outcome: "push", profit: 0 }
  }, { logPath });
  const entries = await readDecisionLogEntries({ logPath });
  const dashboard = summarizeDecisionLogRecords(entries.records);

  assert.equal(amendment.record.recordType, "amendment");
  assert.equal(entries.records.length, 3);
  assert.equal(dashboard.evaluations.length, 1);
  assert.equal(dashboard.settlements.length, 1);
  assert.equal(dashboard.settlements[0].outcome, "push");
  assert.equal(dashboard.amendments.length, 1);
  assert.equal(dashboard.amendments[0].reason, "Official scoring correction");
});

test("appendAmendment rejects an economically contradictory effective settlement", async (t) => {
  const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), "bear-edge-amendment-economics-"));
  const logPath = path.join(tempDir, "decision_log.jsonl");
  const evaluation = canonicalEvaluation(12);
  t.after(() => fs.rm(tempDir, { recursive: true, force: true }));

  await appendAuthoritativeRecord(evaluation, {
    logPath,
    resolveModelEvidenceImpl: (identity) => ({
      ...identity,
      calibrationReportId: evaluation.model.calibrationReportId,
      validated: true
    })
  });
  const settlement = await appendSettlement({
    evaluationId: evaluation.id,
    outcome: "loss",
    stake: 10,
    profit: -10
  }, { logPath });

  await assert.rejects(
    appendAmendment({
      evaluationId: evaluation.id,
      settlementId: settlement.settlement.id,
      reason: "Contradictory correction",
      patch: { outcome: "win" }
    }, { logPath }),
    /win.*positive profit/i
  );
});

test("appendAmendment rejects unknown settlements and reference-changing patches", async (t) => {
  const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), "bear-edge-amendment-"));
  const logPath = path.join(tempDir, "decision_log.jsonl");
  const evaluation = canonicalEvaluation(3);
  t.after(() => fs.rm(tempDir, { recursive: true, force: true }));

  await appendAuthoritativeRecord(evaluation, {
    logPath,
    resolveModelEvidenceImpl: (identity) => ({
      ...identity,
      calibrationReportId: evaluation.model.calibrationReportId,
      validated: true
    })
  });

  await assert.rejects(
    appendAmendment({
      evaluationId: evaluation.id,
      settlementId: "settle_missing",
      reason: "Unknown correction",
      patch: { outcome: "void" }
    }, { logPath }),
    /settlement does not exist/i
  );

  const settlement = await appendSettlement({
    evaluationId: evaluation.id,
    outcome: "loss",
    stake: 10,
    profit: -10
  }, { logPath });

  await assert.rejects(
    appendAmendment({
      evaluationId: evaluation.id,
      settlementId: settlement.settlement.id,
      reason: "Invalid reference rewrite",
      patch: { settlementId: "settle_other" }
    }, { logPath }),
    /cannot change record references/i
  );
});
