const test = require("node:test");
const assert = require("node:assert/strict");

const {
  calculateClosingLineValue,
  createSettlementRecord,
  summarizeDecisionLogRecords
} = require("../src/index.js");

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
    notes: "Closed shorter than entry."
  });

  assert.equal(settlement.recordType, "settlement");
  assert.equal(settlement.evaluationId, "eval_123");
  assert.equal(settlement.outcome, "win");
  assert.equal(settlement.closingOdds, -125);
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
