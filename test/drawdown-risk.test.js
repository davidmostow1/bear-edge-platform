const test = require("node:test");
const assert = require("node:assert/strict");

const {
  buildDrawdownSnapshot,
  evaluateDrawdownRisk
} = require("../src/risk/drawdown-risk.js");

function evaluation(id, odds = -110, stake = 100) {
  return {
    id,
    recordType: "evaluation",
    verdict: "BET",
    price: { marketOdds: odds },
    stake: { recommendedStake: stake }
  };
}

function settlement(id, evaluationId, outcome, profit, settledAt) {
  return {
    id,
    recordType: "settlement",
    evaluationId,
    outcome,
    profit,
    settledAt
  };
}

function cleanInspection(records = []) {
  return {
    records,
    malformedLines: [],
    duplicateIds: [],
    digestConflicts: [],
    invalidRecords: []
  };
}

test("empty integrity-clean history starts in the normal drawdown state", () => {
  const snapshot = buildDrawdownSnapshot(cleanInspection(), { startingBankroll: 1000 });
  const risk = evaluateDrawdownRisk({ snapshot, proposedStake: 20, bankroll: 1000 });

  assert.equal(snapshot.available, true);
  assert.equal(snapshot.state, "normal");
  assert.equal(snapshot.currentEquity, 1000);
  assert.equal(snapshot.currentDrawdownFraction, 0);
  assert.equal(risk.passed, true);
  assert.equal(risk.approvedStake, 20);
  assert.equal(risk.stakeMultiplier, 1);
  assert.equal(Object.prototype.hasOwnProperty.call(risk.snapshot, "history"), false);
  assert.equal(risk.snapshot.historyCount, 0);
});

test("drawdown from the equity high-water mark reduces approved stake", () => {
  const snapshot = buildDrawdownSnapshot(cleanInspection([
    evaluation("eval_1"),
    evaluation("eval_2"),
    evaluation("eval_3"),
    settlement("settle_1", "eval_1", "win", 100, "2026-07-01T10:00:00.000Z"),
    settlement("settle_2", "eval_2", "loss", -100, "2026-07-02T10:00:00.000Z"),
    settlement("settle_3", "eval_3", "loss", -100, "2026-07-03T10:00:00.000Z")
  ]), {
    startingBankroll: 1000,
    policy: {
      reductionDrawdownFraction: 0.1,
      haltDrawdownFraction: 0.25,
      reducedStakeMultiplier: 0.5
    }
  });
  const risk = evaluateDrawdownRisk({ snapshot, proposedStake: 20, bankroll: 900 });

  assert.equal(snapshot.peakEquity, 1100);
  assert.equal(snapshot.currentEquity, 900);
  assert.ok(Math.abs(snapshot.currentDrawdownFraction - 200 / 1100) < 1e-12);
  assert.equal(snapshot.currentLossStreak, 2);
  assert.equal(snapshot.state, "reduced");
  assert.equal(risk.passed, true);
  assert.equal(risk.approvedStake, 10);
  assert.ok(risk.riskFlags.some((flag) => flag.code === "DRAWDOWN_STAKE_REDUCTION"));
});

test("hard drawdown limit blocks a new stake", () => {
  const snapshot = buildDrawdownSnapshot(cleanInspection([
    evaluation("eval_1"),
    settlement("settle_1", "eval_1", "loss", -300, "2026-07-01T10:00:00.000Z")
  ]), {
    startingBankroll: 1000,
    policy: { haltDrawdownFraction: 0.25 }
  });
  const risk = evaluateDrawdownRisk({ snapshot, proposedStake: 20, bankroll: 700 });

  assert.equal(snapshot.state, "halted");
  assert.equal(risk.passed, false);
  assert.equal(risk.approvedStake, 0);
  assert.ok(risk.riskFlags.some((flag) => flag.code === "MAX_DRAWDOWN_REACHED"));
});

test("a valid amendment replaces the settlement result used for drawdown", () => {
  const snapshot = buildDrawdownSnapshot(cleanInspection([
    evaluation("eval_1"),
    settlement("settle_1", "eval_1", "loss", -100, "2026-07-01T10:00:00.000Z"),
    {
      id: "amend_1",
      recordType: "amendment",
      evaluationId: "eval_1",
      settlementId: "settle_1",
      patch: { outcome: "win", profit: 100 }
    }
  ]), { startingBankroll: 1000 });

  assert.equal(snapshot.available, true);
  assert.equal(snapshot.currentEquity, 1100);
  assert.equal(snapshot.currentLossStreak, 0);
  assert.equal(snapshot.amendmentCount, 1);
});

test("ledger integrity defects make drawdown authority unavailable", () => {
  const inspection = cleanInspection();
  inspection.digestConflicts.push({ id: "eval_conflict" });
  const snapshot = buildDrawdownSnapshot(inspection, { startingBankroll: 1000 });
  const risk = evaluateDrawdownRisk({ snapshot, proposedStake: 20, bankroll: 1000 });

  assert.equal(snapshot.available, false);
  assert.equal(snapshot.state, "unavailable");
  assert.equal(risk.passed, false);
  assert.equal(risk.approvedStake, 0);
  assert.ok(risk.riskFlags.some((flag) => flag.code === "DRAWDOWN_CONTEXT_UNAVAILABLE"));
});

test("an invalid amendment value fails drawdown authority closed", () => {
  const snapshot = buildDrawdownSnapshot(cleanInspection([
    evaluation("eval_1"),
    settlement("settle_1", "eval_1", "loss", -100, "2026-07-01T10:00:00.000Z"),
    {
      id: "amend_bad",
      recordType: "amendment",
      evaluationId: "eval_1",
      settlementId: "settle_1",
      patch: { outcome: "not-a-result" }
    }
  ]), { startingBankroll: 1000 });

  assert.equal(snapshot.available, false);
  assert.equal(snapshot.invalidReferenceCount, 1);
});

test("contradictory settlement economics fail drawdown authority closed", () => {
  const snapshot = buildDrawdownSnapshot(cleanInspection([
    evaluation("eval_1"),
    settlement("settle_bad", "eval_1", "win", -100, "2026-07-01T10:00:00.000Z")
  ]), { startingBankroll: 1000 });

  assert.equal(snapshot.available, false);
  assert.equal(snapshot.invalidReferenceCount, 1);
  assert.equal(snapshot.gradedSettlementCount, 0);
});

test("an orphan settlement fails drawdown authority closed", () => {
  const snapshot = buildDrawdownSnapshot(cleanInspection([
    settlement("settle_orphan", "eval_missing", "loss", -100, "2026-07-01T10:00:00.000Z")
  ]), { startingBankroll: 1000 });

  assert.equal(snapshot.available, false);
  assert.equal(snapshot.invalidReferenceCount, 1);
  assert.equal(snapshot.gradedSettlementCount, 0);
});
