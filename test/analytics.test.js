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
  createEvaluationRecord,
  createSettlementRecord,
  readDecisionLogEntries,
  summarizeDecisionLogRecords
} = require("../src/index.js");

function canonicalEvaluation(sequence = 1) {
  const clientEventId = `00000000-0000-4000-8000-${String(sequence).padStart(12, "0")}`;

  return createEvaluationRecord({
    origin: {},
    event: {},
    market: { marketType: "moneyline", selection: `Evaluation ${sequence}` },
    price: { marketOdds: 120 },
    sources: [],
    model: { modelStatus: "research_only" },
    probability: {},
    edge: {},
    stake: { recommendedStake: 10, bankroll: 1000 },
    decision: {
      verdict: "WAIT",
      permission: "PRICE_CHECK_ONLY",
      reasons: ["Research-only evaluation."],
      riskFlags: [],
      gateResults: []
    },
    audit: { warnings: [] }
  }, {
    clientEventId,
    createdAt: `2026-07-17T12:${String(sequence).padStart(2, "0")}:00.000Z`
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
    notes: "Closed shorter than entry."
  });

  assert.equal(settlement.recordType, "settlement");
  assert.equal(settlement.evaluationId, "eval_123");
  assert.equal(settlement.outcome, "win");
  assert.equal(settlement.closingOdds, -125);
  assert.equal(settlement.closingLineEvidence.sportsbook, "draftkings");
  assert.equal(settlement.closingLineEvidence.sourceDigest, "c".repeat(64));
  assert.deepEqual(settlement.notes, ["Closed shorter than entry."]);

  assert.throws(
    () =>
      createSettlementRecord({
        evaluationId: "eval_123",
        outcome: "bad"
      }),
    /outcome must be one of/
  );
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
      settledAt: "2026-06-17T10:00:00.000Z"
    },
    {
      recordType: "settlement",
      evaluationId: "eval_2",
      outcome: "win",
      settledAt: "2026-06-17T11:00:00.000Z"
    },
    {
      recordType: "settlement",
      evaluationId: "eval_3",
      outcome: "win",
      settledAt: "2026-06-17T12:00:00.000Z"
    }
  ];

  const dashboard = summarizeDecisionLogRecords(records);

  assert.equal(dashboard.validationGate.complete, true);
  assert.equal(dashboard.validationGate.currentWinStreak, 3);
  assert.equal(dashboard.validationGate.remainingWins, 0);
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

test("appendSettlement rejects an unknown evaluation id", async (t) => {
  const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), "bear-edge-settlement-"));
  const logPath = path.join(tempDir, "decision_log.jsonl");
  t.after(() => fs.rm(tempDir, { recursive: true, force: true }));

  await assert.rejects(
    appendSettlement({ evaluationId: "eval_missing", outcome: "win", stake: 10 }, { logPath }),
    /evaluation does not exist/i
  );
});

test("appendSettlement requires corrections to use immutable amendments", async (t) => {
  const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), "bear-edge-settlement-"));
  const logPath = path.join(tempDir, "decision_log.jsonl");
  const evaluation = canonicalEvaluation(1);
  t.after(() => fs.rm(tempDir, { recursive: true, force: true }));

  await appendAuthoritativeRecord(evaluation, { logPath });
  await appendSettlement({ evaluationId: evaluation.id, outcome: "loss" }, { logPath });

  await assert.rejects(
    appendSettlement({ evaluationId: evaluation.id, outcome: "win" }, { logPath }),
    /already has a settlement.*amendment/i
  );
});

test("a settlement correction is an amendment and preserves every record", async (t) => {
  const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), "bear-edge-amendment-"));
  const logPath = path.join(tempDir, "decision_log.jsonl");
  const evaluation = canonicalEvaluation(2);
  t.after(() => fs.rm(tempDir, { recursive: true, force: true }));

  await appendAuthoritativeRecord(evaluation, { logPath });
  const settlementResult = await appendSettlement({
    evaluationId: evaluation.id,
    outcome: "loss",
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

test("appendAmendment rejects unknown settlements and reference-changing patches", async (t) => {
  const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), "bear-edge-amendment-"));
  const logPath = path.join(tempDir, "decision_log.jsonl");
  const evaluation = canonicalEvaluation(3);
  t.after(() => fs.rm(tempDir, { recursive: true, force: true }));

  await appendAuthoritativeRecord(evaluation, { logPath });

  await assert.rejects(
    appendAmendment({
      evaluationId: evaluation.id,
      settlementId: "settle_missing",
      reason: "Unknown correction",
      patch: { outcome: "void" }
    }, { logPath }),
    /settlement does not exist/i
  );

  const settlement = await appendSettlement({ evaluationId: evaluation.id, outcome: "loss" }, { logPath });

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
