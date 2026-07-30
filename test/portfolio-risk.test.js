const test = require("node:test");
const assert = require("node:assert/strict");

const {
  buildPortfolioSnapshot,
  evaluatePortfolioRisk
} = require("../src/risk/portfolio-risk.js");

function evaluationRecord(overrides = {}) {
  return {
    id: overrides.id ?? "eval-1",
    recordType: "evaluation",
    createdAt: overrides.createdAt ?? "2026-07-17T14:00:00.000Z",
    verdict: overrides.verdict ?? "BET",
    event: {
      eventId: overrides.eventId ?? "game-1",
      startTime: overrides.startTime ?? "2026-07-17T23:00:00.000Z",
      sport: "mlb"
    },
    market: {
      marketFamily: overrides.marketFamily ?? "pitcher_strikeouts",
      participantId: overrides.participantId ?? "pitcher-1",
      selection: overrides.selection ?? "Sample Pitcher over 5.5",
      line: overrides.line ?? 5.5,
      side: overrides.side ?? "Over"
    },
    stake: {
      recommendedStake: overrides.stake ?? 10,
      bankroll: overrides.bankroll ?? 1000
    }
  };
}

function settlementRecord(overrides = {}) {
  return {
    id: overrides.id ?? "settle-1",
    recordType: "settlement",
    evaluationId: overrides.evaluationId ?? "eval-1",
    outcome: overrides.outcome ?? "loss",
    settledAt: overrides.settledAt ?? "2026-07-17T15:00:00.000Z"
  };
}

test("buildPortfolioSnapshot separates current-day turnover from all open BET exposure", () => {
  const first = evaluationRecord();
  const snapshot = buildPortfolioSnapshot({
    records: [
      first,
      { ...first },
      evaluationRecord({ id: "eval-2", verdict: "WAIT", stake: 50 }),
      evaluationRecord({ id: "eval-3", createdAt: "2026-07-16T14:00:00.000Z", stake: 20 }),
      evaluationRecord({ id: "eval-4", eventId: "game-2", participantId: "pitcher-2", stake: 12 })
    ],
    malformedLines: [],
    digestConflicts: [],
    invalidRecords: []
  }, {
    now: "2026-07-17T15:00:00.000Z",
    timeZone: "America/New_York"
  });

  assert.equal(snapshot.available, true);
  assert.equal(snapshot.riskDate, "2026-07-17");
  assert.equal(snapshot.positions.length, 3);
  assert.equal(snapshot.totalStake, 22);
  assert.equal(snapshot.openStake, 42);
  assert.equal(snapshot.duplicateRecordCount, 1);
});

test("portfolio risk passes a diversified position below every cap", () => {
  const snapshot = buildPortfolioSnapshot({
    records: [evaluationRecord({ stake: 10 })],
    malformedLines: [],
    digestConflicts: [],
    invalidRecords: []
  }, {
    now: "2026-07-17T15:00:00.000Z",
    timeZone: "America/New_York"
  });
  const result = evaluatePortfolioRisk({
    candidate: {
      id: "candidate-2",
      sport: "mlb",
      gameId: "game-2",
      player: { id: "pitcher-2" },
      marketFamily: "pitcher_strikeouts",
      selection: "Other Pitcher over 6.5",
      line: 6.5,
      lean: "Over"
    },
    proposedStake: 10,
    bankroll: 1000,
    snapshot
  });

  assert.equal(result.passed, true);
  assert.equal(result.riskFlags.length, 0);
  assert.equal(result.projected.dailyStake, 20);
});

test("portfolio risk rejects a position that breaches the daily bankroll cap", () => {
  const snapshot = buildPortfolioSnapshot({
    records: [
      evaluationRecord({ id: "eval-1", eventId: "game-1", participantId: "pitcher-1", stake: 20 }),
      evaluationRecord({ id: "eval-2", eventId: "game-2", participantId: "pitcher-2", stake: 20 })
    ],
    malformedLines: [],
    digestConflicts: [],
    invalidRecords: []
  }, {
    now: "2026-07-17T15:00:00.000Z",
    timeZone: "America/New_York"
  });
  const result = evaluatePortfolioRisk({
    candidate: {
      id: "candidate-3",
      sport: "mlb",
      gameId: "game-3",
      player: { id: "pitcher-3" },
      marketFamily: "pitcher_strikeouts",
      selection: "Third Pitcher over 4.5",
      line: 4.5,
      lean: "Over"
    },
    proposedStake: 15,
    bankroll: 1000,
    snapshot,
    policy: { maxDailyBankrollFraction: 0.05 }
  });

  assert.equal(result.passed, false);
  assert.ok(result.riskFlags.some((flag) => flag.code === "MAX_DAILY_RISK_REACHED"));
  assert.equal(result.projected.dailyStake, 55);
});

test("portfolio risk rejects duplicate and correlated recommendations", () => {
  const snapshot = buildPortfolioSnapshot({
    records: [evaluationRecord({ stake: 10 })],
    malformedLines: [],
    digestConflicts: [],
    invalidRecords: []
  }, {
    now: "2026-07-17T15:00:00.000Z",
    timeZone: "America/New_York"
  });
  const result = evaluatePortfolioRisk({
    candidate: {
      id: "candidate-1",
      sport: "mlb",
      gameId: "game-1",
      player: { id: "pitcher-1" },
      marketFamily: "pitcher_strikeouts",
      selection: "Sample Pitcher over 5.5",
      line: 5.5,
      lean: "Over"
    },
    proposedStake: 10,
    bankroll: 1000,
    snapshot,
    policy: { maxEventBankrollFraction: 0.015 }
  });

  assert.equal(result.passed, false);
  assert.ok(result.riskFlags.some((flag) => flag.code === "DUPLICATE_EXPOSURE"));
  assert.ok(result.riskFlags.some((flag) => flag.code === "MAX_EVENT_RISK_REACHED"));
});

test("portfolio risk fails closed when ledger integrity is unavailable", () => {
  const snapshot = buildPortfolioSnapshot({
    records: [],
    malformedLines: [{ lineNumber: 1 }],
    digestConflicts: [],
    invalidRecords: []
  }, {
    now: "2026-07-17T15:00:00.000Z",
    timeZone: "America/New_York"
  });
  const result = evaluatePortfolioRisk({
    candidate: {
      id: "candidate-1",
      sport: "mlb",
      gameId: "game-1",
      player: { id: "pitcher-1" },
      marketFamily: "pitcher_strikeouts",
      selection: "Sample Pitcher over 5.5",
      line: 5.5,
      lean: "Over"
    },
    proposedStake: 10,
    bankroll: 1000,
    snapshot
  });

  assert.equal(snapshot.available, false);
  assert.equal(result.passed, false);
  assert.ok(result.riskFlags.some((flag) => flag.code === "PORTFOLIO_CONTEXT_UNAVAILABLE"));
});

test("portfolio risk fails closed when the authoritative ledger reports a duplicate id", () => {
  const snapshot = buildPortfolioSnapshot({
    records: [evaluationRecord()],
    malformedLines: [],
    duplicateIds: [{ id: "eval-1", firstLine: 1, duplicateLine: 2 }],
    digestConflicts: [],
    invalidRecords: []
  }, {
    now: "2026-07-17T15:00:00.000Z",
    timeZone: "America/New_York"
  });

  assert.equal(snapshot.available, false);
  assert.equal(snapshot.integrityIssueCount, 1);
});

test("portfolio snapshot fails closed without throwing on an invalid exposure timestamp", () => {
  const snapshot = buildPortfolioSnapshot({
    records: [evaluationRecord({ createdAt: "not-a-timestamp" })],
    malformedLines: [],
    digestConflicts: [],
    invalidRecords: []
  }, {
    now: "2026-07-17T15:00:00.000Z",
    timeZone: "America/New_York"
  });

  assert.equal(snapshot.available, false);
  assert.equal(snapshot.positions.length, 0);
  assert.equal(snapshot.invalidExposureRecordCount, 1);
  assert.equal(snapshot.integrityIssueCount, 1);
});

test("settled bets count toward daily turnover but not open portfolio exposure", () => {
  const snapshot = buildPortfolioSnapshot({
    records: [
      evaluationRecord({ id: "eval-1", eventId: "game-1", participantId: "pitcher-1", stake: 20 }),
      evaluationRecord({ id: "eval-2", eventId: "game-2", participantId: "pitcher-2", stake: 20 }),
      settlementRecord({ evaluationId: "eval-1", outcome: "win" })
    ],
    malformedLines: [],
    digestConflicts: [],
    invalidRecords: []
  }, {
    now: "2026-07-17T16:00:00.000Z",
    timeZone: "America/New_York"
  });

  assert.equal(snapshot.available, true);
  assert.equal(snapshot.totalStake, 40);
  assert.equal(snapshot.openStake, 20);
  assert.equal(snapshot.positions.length, 1);
  assert.equal(snapshot.positions[0].recordId, "eval-2");
  assert.equal(snapshot.closedPositionCount, 1);
  assert.equal(snapshot.byEvent["game-1"], undefined);
  assert.equal(snapshot.byEvent["game-2"], 20);

  const result = evaluatePortfolioRisk({
    candidate: {
      sport: "mlb",
      gameId: "game-1",
      player: { id: "pitcher-1" },
      marketFamily: "pitcher_strikeouts",
      selection: "Sample Pitcher over 5.5",
      line: 5.5,
      lean: "Over"
    },
    proposedStake: 10,
    bankroll: 1000,
    snapshot
  });

  assert.equal(result.duplicate, false);
  assert.equal(result.projected.dailyStake, 50);
  assert.equal(result.projected.eventStake, 10);
});

test("a valid amendment from final to pending reopens portfolio exposure", () => {
  const snapshot = buildPortfolioSnapshot({
    records: [
      evaluationRecord({ id: "eval-1", stake: 20 }),
      settlementRecord({ evaluationId: "eval-1", outcome: "loss" }),
      {
        id: "amend-1",
        recordType: "amendment",
        evaluationId: "eval-1",
        settlementId: "settle-1",
        patch: { outcome: "pending" }
      }
    ],
    malformedLines: [],
    digestConflicts: [],
    invalidRecords: []
  }, {
    now: "2026-07-17T16:00:00.000Z",
    timeZone: "America/New_York"
  });

  assert.equal(snapshot.available, true);
  assert.equal(snapshot.totalStake, 20);
  assert.equal(snapshot.openStake, 20);
  assert.equal(snapshot.positions.length, 1);
  assert.equal(snapshot.closedPositionCount, 0);
  assert.equal(snapshot.amendmentCount, 1);
});

test("an orphan settlement makes portfolio authority unavailable", () => {
  const snapshot = buildPortfolioSnapshot({
    records: [settlementRecord({ evaluationId: "missing-evaluation" })],
    malformedLines: [],
    digestConflicts: [],
    invalidRecords: []
  }, {
    now: "2026-07-17T16:00:00.000Z",
    timeZone: "America/New_York"
  });

  assert.equal(snapshot.available, false);
  assert.equal(snapshot.invalidSettlementReferenceCount, 1);
  assert.equal(snapshot.integrityIssueCount, 1);
});

test("a prior-day unresolved position counts against open event exposure but not daily turnover", () => {
  const snapshot = buildPortfolioSnapshot({
    records: [
      evaluationRecord({
        id: "eval-prior-day",
        createdAt: "2026-07-16T14:00:00.000Z",
        eventId: "game-1",
        participantId: "pitcher-1",
        stake: 20
      })
    ],
    malformedLines: [],
    digestConflicts: [],
    invalidRecords: []
  }, {
    now: "2026-07-17T16:00:00.000Z",
    timeZone: "America/New_York"
  });

  assert.equal(snapshot.totalStake, 0);
  assert.equal(snapshot.openStake, 20);
  assert.equal(snapshot.positions.length, 1);
  assert.equal(snapshot.byEvent["game-1"], 20);
});

test("duplicate detection is stable when only the displayed sportsbook price changes", () => {
  const snapshot = buildPortfolioSnapshot({
    records: [evaluationRecord({ selection: "Sample Pitcher over 5.5 at -110" })],
    malformedLines: [],
    digestConflicts: [],
    invalidRecords: []
  }, {
    now: "2026-07-17T16:00:00.000Z",
    timeZone: "America/New_York"
  });
  const result = evaluatePortfolioRisk({
    candidate: {
      sport: "mlb",
      gameId: "game-1",
      player: { id: "pitcher-1" },
      marketFamily: "pitcher_strikeouts",
      selection: "Sample Pitcher over 5.5 at -105",
      line: 5.5,
      lean: "Over"
    },
    proposedStake: 5,
    bankroll: 1000,
    snapshot
  });

  assert.equal(result.duplicate, true);
  assert.ok(result.riskFlags.some((flag) => flag.code === "DUPLICATE_EXPOSURE"));
});
