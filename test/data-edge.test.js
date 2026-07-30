const test = require("node:test");
const assert = require("node:assert/strict");

const { assessOddsEvidence } = require("../src/data-edge.js");
const { summarizeLiveDataHealth } = require("../src/live/live-data-health.js");

const NOW = new Date("2026-07-13T12:00:00.000Z");

function pricedTarget({ bookmaker = "draftkings", marketLastUpdate = "2026-07-13T11:58:00.000Z" } = {}) {
  return {
    odds: {
      bookmaker: { key: bookmaker },
      marketLastUpdate
    }
  };
}

test("assessOddsEvidence blocks an unauthorized provider", () => {
  const result = assessOddsEvidence({
    liveData: { requirements: { verifiedOdds: false } },
    bestTargets: { summary: { pricedCandidates: 0 }, best: [] },
    now: NOW
  });

  assert.equal(result.status, "blocked");
  assert.equal(result.permission, "PRICE_CHECK_ONLY");
  assert.ok(result.reasonCodes.includes("ODDS_PROVIDER_UNVERIFIED"));
});

test("assessOddsEvidence verifies a fresh exact-bookmaker candidate", () => {
  const result = assessOddsEvidence({
    liveData: { requirements: { verifiedOdds: true } },
    bestTargets: {
      summary: { pricedCandidates: 1 },
      best: [pricedTarget()]
    },
    requiredBookmaker: "draftkings",
    now: NOW,
    maxAgeMinutes: 10
  });

  assert.equal(result.status, "verified");
  assert.equal(result.permission, "VERIFIED_BETS_ALLOWED");
  assert.equal(result.freshPricedCandidates, 1);
  assert.equal(result.bookmakerMatches, 1);
  assert.equal(result.oldestPriceAgeMinutes, 2);
});

test("assessOddsEvidence blocks stale prices", () => {
  const result = assessOddsEvidence({
    liveData: { requirements: { verifiedOdds: true } },
    bestTargets: {
      summary: { pricedCandidates: 1 },
      best: [pricedTarget({ marketLastUpdate: "2026-07-13T11:30:00.000Z" })]
    },
    now: NOW,
    maxAgeMinutes: 10
  });

  assert.equal(result.status, "blocked");
  assert.equal(result.permission, "PRICE_CHECK_ONLY");
  assert.ok(result.reasonCodes.includes("ODDS_PRICE_STALE"));
});

test("assessOddsEvidence blocks an unexpected bookmaker", () => {
  const result = assessOddsEvidence({
    liveData: { requirements: { verifiedOdds: true } },
    bestTargets: {
      summary: { pricedCandidates: 1 },
      best: [pricedTarget({ bookmaker: "fanduel" })]
    },
    requiredBookmaker: "draftkings",
    now: NOW
  });

  assert.equal(result.status, "blocked");
  assert.equal(result.permission, "PRICE_CHECK_ONLY");
  assert.ok(result.reasonCodes.includes("BOOKMAKER_MISMATCH"));
});

test("assessOddsEvidence blocks a price without a timestamp", () => {
  const result = assessOddsEvidence({
    liveData: { requirements: { verifiedOdds: true } },
    bestTargets: {
      summary: { pricedCandidates: 1 },
      best: [pricedTarget({ marketLastUpdate: null })]
    },
    now: NOW
  });

  assert.equal(result.status, "blocked");
  assert.equal(result.permission, "PRICE_CHECK_ONLY");
  assert.ok(result.reasonCodes.includes("ODDS_TIMESTAMP_MISSING"));
});

test("assessOddsEvidence blocks a future-dated price", () => {
  const result = assessOddsEvidence({
    liveData: { requirements: { verifiedOdds: true } },
    bestTargets: {
      summary: { pricedCandidates: 1 },
      best: [pricedTarget({ marketLastUpdate: "2026-07-13T12:05:00.000Z" })]
    },
    now: NOW
  });

  assert.equal(result.status, "blocked");
  assert.equal(result.permission, "PRICE_CHECK_ONLY");
  assert.ok(result.reasonCodes.includes("ODDS_TIMESTAMP_FUTURE"));
  assert.equal(result.freshPricedCandidates, 0);
});

test("live data health marks a future source-status timestamp as a clock error", () => {
  const result = summarizeLiveDataHealth({
    sourceStatus: {
      fetchedAt: "2026-07-13T12:05:00.000Z",
      providers: [
        {
          provider: "ESPN",
          status: "ok",
          sourceType: "official-api",
          fetchedAt: "2026-07-13T11:59:00.000Z",
          summary: { bySport: { mlb: 1 } }
        }
      ]
    },
    snapshotInfo: {
      exists: true,
      snapshot: { generatedAt: "2026-07-13T11:59:00.000Z" }
    },
    now: NOW
  });

  assert.equal(result.status, "clock-error");
  assert.ok(result.actions.some((action) => action.includes("future")));
});

test("live data health marks a future persisted snapshot as a clock error", () => {
  const result = summarizeLiveDataHealth({
    sourceStatus: {
      fetchedAt: "2026-07-13T11:59:00.000Z",
      providers: [
        {
          provider: "ESPN",
          status: "ok",
          sourceType: "official-api",
          fetchedAt: "2026-07-13T11:59:00.000Z",
          summary: { bySport: { mlb: 1 } }
        }
      ]
    },
    snapshotInfo: {
      exists: true,
      snapshot: { generatedAt: "2026-07-13T12:05:00.000Z" }
    },
    now: NOW
  });

  assert.equal(result.status, "clock-error");
  assert.equal(result.snapshot.stale, true);
  assert.ok(result.actions.some((action) => action.includes("future")));
});
