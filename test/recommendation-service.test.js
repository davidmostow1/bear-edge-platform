const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs/promises");
const os = require("node:os");
const path = require("node:path");

const {
  persistDisplayedTargets
} = require("../src/audit/recommendation-service.js");
const {
  readAuthoritativeLedger
} = require("../src/audit/authoritative-ledger.js");

const FETCHED_AT = "2026-07-17T12:00:00.000Z";

function researchTarget(overrides = {}) {
  return {
    id: "mlb-123-pitcher-strikeouts",
    status: "price_check",
    sport: "mlb",
    provider: "mlb",
    gameId: "123",
    gameDate: "2026-07-17T19:10:00.000Z",
    matchup: "New York Mets at Philadelphia Phillies",
    selection: "Christian Scott over 5.5 strikeouts",
    player: { id: 4414215, name: "Christian Scott" },
    marketType: "prop",
    statKey: "strikeOuts",
    statLabel: "strikeouts",
    lean: "over",
    line: 5.5,
    modelProbability: 0.62,
    fairAmericanOdds: -163,
    rankValue: 0.62,
    stats: {
      seasonPerGame: 6.2,
      recentPerGame: 6.8,
      sourceUrl: "https://statsapi.mlb.com/example",
      fetchedAt: FETCHED_AT
    },
    odds: null,
    evaluation: null,
    model: {
      modelId: "poisson_count_v1",
      modelVersion: "1.0.0",
      modelStatus: "research_only",
      probabilityMethod: "poisson_count"
    },
    ticketDraft: {
      bankroll: 1000,
      legs: [{ source: { playerId: 4414215 } }]
    },
    riskFlags: [{
      code: "MISSING_MARKET_ODDS",
      severity: "high",
      message: "Verified sportsbook odds are required."
    }],
    notes: ["Research target only."],
    ...overrides
  };
}

function researchResult(overrides = {}) {
  return {
    status: "odds_needed",
    fetchedAt: FETCHED_AT,
    sourceMode: "official_stats_without_verified_odds",
    summary: { candidates: 1, pricedCandidates: 0, bestReturned: 1 },
    best: [researchTarget()],
    warnings: [],
    ...overrides
  };
}

test("persistDisplayedTargets logs every returned row before returning", async (t) => {
  const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), "bear-edge-recommendations-"));
  const ledgerPath = path.join(tempDir, "decision_log.jsonl");
  t.after(() => fs.rm(tempDir, { recursive: true, force: true }));

  const persisted = await persistDisplayedTargets(researchResult(), {
    ledgerPath,
    requestId: "request_1"
  });
  const inspection = await readAuthoritativeLedger({ ledgerPath });

  assert.equal(persisted.best.length, 1);
  assert.equal(persisted.best[0].auditRecord.verdict, "WAIT");
  assert.equal(persisted.best[0].auditRecord.permission, "PRICE_CHECK_ONLY");
  assert.equal(persisted.persistence.persistedCount, 1);
  assert.deepEqual(persisted.persistence.recordIds, [persisted.best[0].auditRecord.id]);
  assert.equal(inspection.records.length, 1);
});

test("persistDisplayedTargets logs the complete priced calibration pool without returning it", async (t) => {
  const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), "bear-edge-recommendations-"));
  const ledgerPath = path.join(tempDir, "decision_log.jsonl");
  t.after(() => fs.rm(tempDir, { recursive: true, force: true }));
  const first = researchTarget({
    status: "priced",
    odds: {
      bookmaker: { key: "draftkings" },
      marketOdds: -110,
      oppositeOdds: -110,
      marketContext: { offeredLastUpdate: FETCHED_AT }
    }
  });
  const second = researchTarget({
    id: "mlb-123-second-pitcher-strikeouts",
    selection: "Aaron Nola over 5.5 strikeouts",
    player: { id: 33709, name: "Aaron Nola" },
    odds: {
      bookmaker: { key: "fanduel" },
      marketOdds: 105,
      oppositeOdds: -135,
      marketContext: { offeredLastUpdate: FETCHED_AT }
    },
    status: "priced"
  });
  const result = researchResult({
    best: [first],
    calibrationCandidates: [first, second]
  });

  const persisted = await persistDisplayedTargets(result, {
    ledgerPath,
    requestId: "request_calibration_pool"
  });
  const inspection = await readAuthoritativeLedger({ ledgerPath });

  assert.equal(inspection.records.length, 2);
  assert.equal(persisted.persistence.persistedCount, 2);
  assert.equal(persisted.persistence.displayedCount, 1);
  assert.equal(persisted.persistence.calibrationPoolCount, 2);
  assert.equal(Object.hasOwn(persisted, "calibrationCandidates"), false);
  assert.equal(persisted.best[0].auditRecord.market.participantId, "4414215");
  assert.deepEqual(
    inspection.records.map((record) => record.market.participantId).sort(),
    ["33709", "4414215"]
  );
});

test("persistDisplayedTargets never labels research-only output BET", async (t) => {
  const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), "bear-edge-recommendations-"));
  const ledgerPath = path.join(tempDir, "decision_log.jsonl");
  t.after(() => fs.rm(tempDir, { recursive: true, force: true }));
  const target = researchTarget({
    status: "priced",
    odds: {
      bookmaker: { key: "draftkings" },
      marketOdds: -110,
      oppositeOdds: -110,
      marketContext: { offeredLastUpdate: FETCHED_AT }
    },
    evaluation: {
      verdict: "BET",
      reasons: ["Legacy nested evaluation passed."],
      adjustedProbability: 0.62,
      priceEdge: 0.0962,
      expectedValueRoi: 0.1836,
      kellyFraction: 0.174,
      recommendedStake: 20,
      riskFlags: []
    }
  });

  const persisted = await persistDisplayedTargets(researchResult({ best: [target] }), {
    ledgerPath,
    requestId: "request_2"
  });

  assert.notEqual(persisted.best[0].auditRecord.verdict, "BET");
  assert.equal(persisted.best[0].auditRecord.verdict, "WAIT");
  assert.equal(persisted.best[0].auditRecord.model.modelStatus, "research_only");
});

test("persistDisplayedTargets keeps stale verified prices in PRICE_CHECK_ONLY mode", async (t) => {
  const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), "bear-edge-recommendations-"));
  const ledgerPath = path.join(tempDir, "decision_log.jsonl");
  t.after(() => fs.rm(tempDir, { recursive: true, force: true }));
  const target = researchTarget({
    status: "priced",
    odds: {
      bookmaker: { key: "draftkings" },
      marketOdds: -110,
      oppositeOdds: -110,
      selectionMethod: "required_bookmaker_price",
      marketContext: { offeredLastUpdate: FETCHED_AT }
    },
    evaluation: {
      verdict: "WAIT",
      reasons: ["The captured market price is stale."],
      riskFlags: [{
        code: "STALE_MARKET_PRICE",
        severity: "high",
        message: "The captured market price is older than the permitted freshness window."
      }]
    }
  });
  const result = researchResult({
    sourceMode: "official_stats_plus_verified_odds",
    executionBookmaker: "draftkings",
    best: [target]
  });

  const persisted = await persistDisplayedTargets(result, {
    ledgerPath,
    requestId: "request_stale_price",
    permission: "VERIFIED_BETS_ALLOWED"
  });

  assert.equal(persisted.best[0].auditRecord.permission, "PRICE_CHECK_ONLY");
  assert.equal(
    persisted.best[0].auditRecord.gateResults.find((gate) => gate.gate === "operational_permission").passed,
    false
  );
});

test("persistDisplayedTargets allows a fresh exact execution-book price", async (t) => {
  const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), "bear-edge-recommendations-"));
  const ledgerPath = path.join(tempDir, "decision_log.jsonl");
  t.after(() => fs.rm(tempDir, { recursive: true, force: true }));
  const target = researchTarget({
    status: "priced",
    odds: {
      bookmaker: { key: "draftkings" },
      marketOdds: -110,
      oppositeOdds: -110,
      selectionMethod: "required_bookmaker_price",
      marketContext: { offeredLastUpdate: FETCHED_AT }
    },
    evaluation: {
      verdict: "WAIT",
      reasons: ["The model remains research-only."],
      riskFlags: [],
      stakePolicy: { maxMarketAgeMinutes: 10 }
    },
    riskFlags: []
  });
  const result = researchResult({
    sourceMode: "official_stats_plus_verified_odds",
    executionBookmaker: "draftkings",
    best: [target]
  });

  const persisted = await persistDisplayedTargets(result, {
    ledgerPath,
    requestId: "request_fresh_execution_price"
  });

  assert.equal(persisted.best[0].auditRecord.permission, "VERIFIED_BETS_ALLOWED");
  assert.equal(
    persisted.best[0].auditRecord.gateResults.find((gate) => gate.gate === "operational_permission").passed,
    true
  );
  assert.equal(persisted.best[0].auditRecord.verdict, "WAIT");
});

test("persistDisplayedTargets uses stable ids for the same capture and new ids for new captures", async (t) => {
  const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), "bear-edge-recommendations-"));
  const ledgerPath = path.join(tempDir, "decision_log.jsonl");
  t.after(() => fs.rm(tempDir, { recursive: true, force: true }));

  const first = await persistDisplayedTargets(researchResult(), { ledgerPath, requestId: "request_3" });
  const repeated = await persistDisplayedTargets(researchResult(), { ledgerPath, requestId: "request_4" });
  const changed = await persistDisplayedTargets(researchResult({
    fetchedAt: "2026-07-17T12:01:00.000Z"
  }), { ledgerPath, requestId: "request_5" });
  const inspection = await readAuthoritativeLedger({ ledgerPath });

  assert.equal(first.best[0].auditRecord.clientEventId, repeated.best[0].auditRecord.clientEventId);
  assert.notEqual(first.best[0].auditRecord.clientEventId, changed.best[0].auditRecord.clientEventId);
  assert.equal(inspection.records.length, 2);
});

test("persistDisplayedTargets fails without returning a partial target result", async () => {
  await assert.rejects(
    persistDisplayedTargets(researchResult(), {
      ledgerPath: "/virtual/decision_log.jsonl",
      appendRecordImpl: async () => {
        throw new Error("forced ledger failure");
      }
    }),
    /forced ledger failure/
  );
});

test("predictive uncertainty gate fails closed when interval width is missing", async (t) => {
  const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), "bear-edge-recommendations-"));
  const ledgerPath = path.join(tempDir, "decision_log.jsonl");
  t.after(() => fs.rm(tempDir, { recursive: true, force: true }));
  const target = researchTarget({
    status: "priced",
    odds: {
      bookmaker: { key: "draftkings" },
      marketOdds: -110,
      oppositeOdds: -110,
      marketContext: { offeredLastUpdate: FETCHED_AT }
    },
    evaluation: {
      verdict: "WAIT",
      reasons: ["Incomplete uncertainty evidence."],
      probabilityUncertainty: {
        intervalBasis: "observed_count",
        decisionProbability: 0.55
      },
      stakePolicy: { maxProbabilityIntervalWidth: 0.5 },
      riskFlags: []
    }
  });
  const persisted = await persistDisplayedTargets(researchResult({ best: [target] }), {
    ledgerPath,
    requestId: "request_uncertainty"
  });
  const gate = persisted.best[0].auditRecord.gateResults.find(
    (entry) => entry.gate === "predictive_uncertainty"
  );

  assert.equal(gate.passed, false);
  assert.equal(gate.reasonCode, "PREDICTIVE_UNCERTAINTY_UNAVAILABLE");
});
