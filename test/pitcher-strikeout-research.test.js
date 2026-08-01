const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const { createServer } = require("../src/server.js");
const { createOperatorAuth } = require("../src/config/operator-auth.js");

const {
  COHORT_START_AT,
  validatePitcherStrikeoutFeatureRecord
} = require("../src/research/pitcher-strikeout-contract.js");
const {
  normalizeSportsDataIoPitcherStrikeoutFixture,
  fetchSportsDataIoPitcherStrikeoutContext
} = require("../src/live/providers/sportsdataio.js");
const {
  chronologicalEventSplit,
  fitNegativeBinomialResearchModel,
  predictNegativeBinomialProbability
} = require("../src/research/pitcher-strikeout-model.js");
const {
  buildPitcherStrikeoutResearchReadiness
} = require("../src/research/pitcher-strikeout-readiness.js");
const {
  buildPitcherStrikeoutTrainingRows
} = require("../src/historical/pitcher-strikeout-training.js");

const DIGEST = "a".repeat(64);

function sourceEnvelope(overrides = {}) {
  return {
    provider: "sportsdataio_fixture",
    sourceLocator: "fixture://sportsdataio/synthetic-game-1",
    capturedAt: "2026-08-16T20:00:00.000Z",
    sourceTime: "2026-08-16T19:59:00.000Z",
    contentDigest: DIGEST,
    licenseIdentifier: "synthetic_test_fixture_only",
    freshness: "fresh",
    verificationStatus: "fixture_only",
    ...overrides
  };
}

function featureRecord(overrides = {}) {
  return {
    schemaVersion: "1.0.0",
    marketFamily: "pitcher_strikeouts",
    prospectiveCohortStartAt: COHORT_START_AT,
    predictionTime: "2026-08-16T20:00:00.000Z",
    event: {
      eventId: "synthetic-game-1",
      startTime: "2026-08-16T23:00:00.000Z",
      venueId: "synthetic-park"
    },
    pitcher: {
      pitcherId: "synthetic-pitcher-1",
      throws: "R",
      confirmedStarter: true,
      daysRest: 5,
      priorStarts: 18
    },
    pitcherRates: {
      seasonStrikeoutsPerBatterFaced: 0.27,
      rolling5StrikeoutsPerBatterFaced: 0.29,
      rolling10StrikeoutsPerBatterFaced: 0.28,
      rolling5BattersFaced: 24.2,
      rolling10BattersFaced: 23.8
    },
    opponentLineup: {
      confirmed: true,
      aggregateStrikeoutsPerPlateAppearance: 0.245,
      aggregateStrikeoutsPerPlateAppearanceVsPitcherHand: 0.252,
      players: Array.from({ length: 9 }, (_, index) => ({
        playerId: `synthetic-batter-${index + 1}`,
        battingOrder: index + 1,
        bats: index % 2 === 0 ? "L" : "R",
        priorStrikeoutsPerPlateAppearance: 0.22 + index * 0.005,
        priorStrikeoutsPerPlateAppearanceVsPitcherHand: 0.225 + index * 0.005
      }))
    },
    market: {
      line: 5.5
    },
    context: {
      weather: "NOT_IMPLEMENTED",
      umpire: "NOT_IMPLEMENTED"
    },
    sources: {
      schedule: sourceEnvelope(),
      pitcher: sourceEnvelope(),
      lineup: sourceEnvelope(),
      market: sourceEnvelope({ provider: "the_odds_api_fixture" })
    },
    ...overrides
  };
}

function sportsDataIoFixture() {
  const record = featureRecord();
  return {
    fixtureMetadata: {
      synthetic: true,
      networkCalls: 0,
      licenseIdentifier: "synthetic_test_fixture_only"
    },
    game: {
      gameId: record.event.eventId,
      startTime: record.event.startTime,
      venueId: record.event.venueId
    },
    pitcher: record.pitcher,
    pitcherRates: record.pitcherRates,
    lineup: record.opponentLineup,
    market: record.market,
    source: sourceEnvelope()
  };
}

test("pitcher strikeout feature contract accepts complete attributed pregame evidence", () => {
  const result = validatePitcherStrikeoutFeatureRecord(featureRecord());

  assert.equal(result.marketFamily, "pitcher_strikeouts");
  assert.equal(result.opponentLineup.players.length, 9);
  assert.equal(result.context.weather, "NOT_IMPLEMENTED");
  assert.equal(result.context.umpire, "NOT_IMPLEMENTED");
});

test("pitcher strikeout feature contract rejects missing, stale, post-start, and contradictory evidence", () => {
  assert.throws(
    () => validatePitcherStrikeoutFeatureRecord(featureRecord({
      opponentLineup: { ...featureRecord().opponentLineup, confirmed: false }
    })),
    /confirmed lineup/i
  );
  assert.throws(
    () => validatePitcherStrikeoutFeatureRecord(featureRecord({
      sources: {
        ...featureRecord().sources,
        lineup: sourceEnvelope({ freshness: "stale" })
      }
    })),
    /fresh/i
  );
  assert.throws(
    () => validatePitcherStrikeoutFeatureRecord(featureRecord({
      predictionTime: "2026-08-17T00:00:00.000Z",
      event: { ...featureRecord().event, startTime: "2026-08-16T23:00:00.000Z" }
    })),
    /before event start/i
  );
  assert.throws(
    () => validatePitcherStrikeoutFeatureRecord(featureRecord({
      sources: {
        ...featureRecord().sources,
        lineup: sourceEnvelope({ capturedAt: "2026-08-16T20:01:00.000Z" })
      }
    })),
    /after prediction/i
  );
});

test("SportsDataIO adapter accepts synthetic fixtures only and exposes no live fetch path", async () => {
  const normalized = normalizeSportsDataIoPitcherStrikeoutFixture(sportsDataIoFixture(), {
    predictionTime: "2026-08-16T20:00:00.000Z"
  });

  assert.equal(normalized.sources.lineup.verificationStatus, "fixture_only");
  assert.equal(normalized.sources.lineup.licenseIdentifier, "synthetic_test_fixture_only");
  assert.equal(JSON.stringify(normalized).includes("apiKey"), false);
  assert.throws(
    () => normalizeSportsDataIoPitcherStrikeoutFixture({
      ...sportsDataIoFixture(),
      fixtureMetadata: { synthetic: false, networkCalls: 1 }
    }),
    /synthetic fixture/i
  );
  await assert.rejects(
    fetchSportsDataIoPitcherStrikeoutContext(),
    /LIVE_PROVIDER_NOT_AUTHORIZED/
  );
});

test("70/15/15 split is chronological and event atomic", () => {
  const rows = Array.from({ length: 20 }, (_, index) => ({
    eventId: `event-${String(index + 1).padStart(2, "0")}`,
    eventStartTime: `2025-06-${String(index + 1).padStart(2, "0")}T23:00:00.000Z`,
    outcome: 3 + index % 7,
    features: [1, index / 20]
  }));
  rows.push({ ...rows[0], outcome: 5 });

  const split = chronologicalEventSplit(rows);

  assert.deepEqual(
    [split.training.eventCount, split.calibration.eventCount, split.evaluation.eventCount],
    [14, 3, 3]
  );
  assert.equal(split.training.rows.filter((row) => row.eventId === "event-01").length, 2);
  assert.equal(split.calibration.rows.some((row) => row.eventId === "event-01"), false);
  assert.equal(split.evaluation.rows.some((row) => row.eventId === "event-01"), false);
});

test("negative-binomial research model is deterministic and returns bounded probabilities", () => {
  const rows = Array.from({ length: 30 }, (_, index) => ({
    eventId: `event-${index + 1}`,
    eventStartTime: `2025-${String(1 + Math.floor(index / 28)).padStart(2, "0")}-${String(1 + index % 28).padStart(2, "0")}T23:00:00.000Z`,
    outcome: 3 + index % 8,
    features: [1, index / 30, (index % 5) / 5]
  }));

  const first = fitNegativeBinomialResearchModel(rows, { iterations: 250, learningRate: 0.02 });
  const second = fitNegativeBinomialResearchModel(rows, { iterations: 250, learningRate: 0.02 });
  const probability = predictNegativeBinomialProbability(first, {
    features: [1, 0.5, 0.4],
    line: 5.5,
    side: "over"
  });

  assert.deepEqual(first, second);
  assert.equal(first.modelId, "negative_binomial_pitcher_strikeouts_v1");
  assert.equal(first.modelStatus, "research_only");
  assert.ok(probability > 0 && probability < 1);
});

test("readiness reports explicit historical, live, price, model, cohort, and credit blockers", () => {
  const readiness = buildPitcherStrikeoutResearchReadiness({
    rootDir: "/tmp/does-not-contain-bear-edge-data",
    providerSetup: {
      providers: [
        { id: "sportsdataio", configured: false, usableNow: false },
        { id: "the-odds-api", configured: true, usableNow: false }
      ]
    },
    cohortRecords: []
  });

  assert.equal(readiness.status, "blocked");
  assert.equal(readiness.label, "LIVE DATA BLOCKED — ADAPTER TESTED WITH FIXTURES ONLY");
  assert.equal(readiness.historical.status, "missing");
  assert.equal(readiness.liveLineup.status, "blocked");
  assert.equal(readiness.price.status, "configured_unverified");
  assert.equal(readiness.model.status, "research_only");
  assert.equal(readiness.cohort.observations, 0);
  assert.equal(readiness.credit.reportedRemainingPercent, 98);
  assert.equal(readiness.credit.stopAtPercent, 90);
  assert.equal(readiness.credit.absoluteCredits, "unverified");
  assert.equal(readiness.permission, "PRICE_CHECK_ONLY");
});

test("Retrosheet extension records missing upstream features instead of inventing training values", () => {
  const historicalRecord = {
    mode: "historical_reconstruction",
    event: {
      retrosheetGameId: "SYN202506010",
      date: "20250601",
      site: "SYNTHETIC_SITE"
    },
    market: {
      marketFamily: "pitcher_strikeouts",
      participantId: "synthetic-pitcher-1",
      line: 5.5
    },
    features: {
      historyGames: 12,
      seasonPerGame: 6.1,
      recentPerGame: 6.4
    },
    outcome: {
      observedValue: 7
    },
    source: {
      provider: "retrosheet",
      sourceLocator: "https://www.retrosheet.org/downloads/2025/2025csvs.zip",
      suppliedArchiveDigest: DIGEST
    }
  };

  const blocked = buildPitcherStrikeoutTrainingRows([historicalRecord]);
  assert.equal(blocked.rows.length, 0);
  assert.equal(blocked.missing.length, 1);
  assert.ok(blocked.missing[0].reasons.includes("RETROSHEET_BATTERS_FACED_UNAVAILABLE"));
  assert.ok(blocked.missing[0].reasons.includes("PREGAME_CONFIRMED_LINEUP_UNAVAILABLE"));

  const enriched = buildPitcherStrikeoutTrainingRows([historicalRecord], {
    enrichmentByEventPitcher: {
      "SYN202506010|synthetic-pitcher-1": {
        eventStartTime: "2025-06-01T23:00:00.000Z",
        pitcherThrows: "R",
        daysRest: 5,
        seasonStrikeoutsPerBatterFaced: 0.27,
        rolling5StrikeoutsPerBatterFaced: 0.29,
        rolling10StrikeoutsPerBatterFaced: 0.28,
        rolling5BattersFaced: 24.2,
        rolling10BattersFaced: 23.8,
        confirmedLineup: true,
        opponentLineupStrikeoutsPerPlateAppearance: 0.245,
        opponentLineupStrikeoutsPerPlateAppearanceVsPitcherHand: 0.252,
        capturedAt: "2025-06-01T20:00:00.000Z",
        contentDigest: "b".repeat(64),
        licenseIdentifier: "licensed_historical_enrichment_fixture"
      }
    }
  });

  assert.equal(enriched.missing.length, 0);
  assert.equal(enriched.rows.length, 1);
  assert.equal(enriched.rows[0].features.length, 10);
  assert.equal(enriched.rows[0].outcome, 7);
  assert.equal(enriched.rows[0].authorization, "RESEARCH_ONLY");
});

test("HTTP API exposes pitcher-strikeout completeness without claiming live readiness", async () => {
  const server = createServer({
    operatorAuth: createOperatorAuth({ lanMode: false, requireToken: false }),
    settingsRootDir: "/tmp/does-not-contain-bear-edge-data"
  });
  await new Promise((resolve) => server.listen(0, () => resolve(undefined)));

  try {
    const address = server.address();
    if (!address || typeof address === "string") {
      throw new Error("Expected an AddressInfo server binding.");
    }
    const response = await fetch(
      `http://127.0.0.1:${address.port}/api/research/pitcher-strikeouts/readiness`
    );
    const payload = await response.json();

    assert.equal(response.status, 200);
    assert.equal(payload.status, "blocked");
    assert.equal(payload.model.status, "research_only");
    assert.equal(payload.permission, "PRICE_CHECK_ONLY");
    assert.equal(payload.authorizedStake, 0);
    assert.equal(JSON.stringify(payload).includes("SPORTSDATAIO_API_KEY"), false);
  } finally {
    await new Promise((resolve, reject) => server.close((error) => (
      error ? reject(error) : resolve()
    )));
  }
});

test("dashboard displays the pitcher-strikeout data-completeness boundary", () => {
  const dashboardHtml = fs.readFileSync(
    path.join(__dirname, "..", "src", "dashboard", "index.html"),
    "utf8"
  );
  const dashboardScript = fs.readFileSync(
    path.join(__dirname, "..", "src", "dashboard", "app.js"),
    "utf8"
  );

  assert.match(dashboardHtml, /id="pitcherStrikeoutResearchBoard"/);
  assert.match(dashboardScript, /\/api\/research\/pitcher-strikeouts\/readiness/);
  assert.match(dashboardScript, /LIVE DATA BLOCKED/);
  assert.match(dashboardScript, /Absolute credits.*unverified/is);
  assert.match(dashboardScript, /PRICE_CHECK_ONLY/);
});
