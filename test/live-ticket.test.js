const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { spawnSync } = require("node:child_process");

const { evaluateLiveTicket } = require("../src/live/evaluate-live-ticket.js");
const { LiveDataCache } = require("../src/live/cache.js");
const { fetchJson } = require("../src/live/fixture-fetch.js");
const { validateLiveTicket } = require("../src/validate-live-ticket.js");

test("validateLiveTicket accepts a 2-leg alt-prop parlay", () => {
  const ticket = validateLiveTicket({
    kind: "parlay",
    selection: "2-leg alt parlay",
    bankroll: 1000,
    legs: [
      {
        id: "leg-a",
        provider: "mlb",
        marketType: "alt-prop",
        side: "over",
        line: 1.5,
        marketOdds: 120,
        modelProbabilityOverride: 0.58,
        source: { playerId: 1, statGroup: "hitting", statKey: "totalBases" }
      },
      {
        id: "leg-b",
        provider: "nhl",
        marketType: "alt-prop",
        side: "over",
        line: 1.5,
        marketOdds: 125,
        source: { playerId: 2, statKey: "points" }
      }
    ]
  });

  assert.equal(ticket.kind, "parlay");
  assert.equal(ticket.legs.length, 2);
  assert.equal(ticket.legs[0].modelProbabilityOverride, 0.58);
});

test("evaluateLiveTicket prices a cross-sport live parlay from official-source snapshots", async () => {
  const ticket = validateLiveTicket({
    kind: "parlay",
    selection: "Cross-sport live parlay",
    bankroll: 1000,
    legs: [
      {
        id: "leg-a",
        label: "Sample hitter over 1.5 total bases",
        provider: "mlb",
        marketType: "alt-prop",
        side: "over",
        line: 1.5,
        marketOdds: 120,
        source: { playerId: 1, statGroup: "hitting", statKey: "totalBases", recentLimit: 10 }
      },
      {
        id: "leg-b",
        label: "Sample skater over 1.5 points",
        provider: "nhl",
        marketType: "alt-prop",
        side: "over",
        line: 1.5,
        marketOdds: 125,
        source: { playerId: 2, statKey: "points", recentLimit: 5 }
      }
    ]
  });

  const result = await evaluateLiveTicket(ticket, {
    fetchJsonImpl: fetchJson
  });
  const parlayResult = /** @type {any} */ (result);

  assert.equal(parlayResult.kind, "parlay");
  assert.equal(parlayResult.legs.length, 2);
  assert.equal(parlayResult.verdict, "BET");
  assert.ok(parlayResult.combined.probability > 0);
  assert.equal(parlayResult.researchPacket.ticketKind, "parlay");
  assert.equal(parlayResult.researchPacket.sources.length, 2);
});

test("evaluateLiveTicket carries contextual leg risk flags into parlay output", async () => {
  const ticket = validateLiveTicket({
    kind: "parlay",
    selection: "Risk-visible parlay",
    bankroll: 1000,
    legs: [
      {
        id: "leg-a",
        label: "Sample hitter over 1.5 total bases",
        provider: "mlb",
        marketType: "prop",
        side: "over",
        line: 1.5,
        marketOdds: 120,
        riskFlags: [
          {
            code: "LINEUP_NOT_CONFIRMED",
            severity: "medium",
            message: "Lineup must be confirmed before betting."
          }
        ],
        source: { playerId: 1, statGroup: "hitting", statKey: "totalBases", recentLimit: 10 }
      },
      {
        id: "leg-b",
        label: "Sample skater over 1.5 points",
        provider: "nhl",
        marketType: "prop",
        side: "over",
        line: 1.5,
        marketOdds: 125,
        source: { playerId: 2, statKey: "points", recentLimit: 5 }
      }
    ]
  });

  const result = await evaluateLiveTicket(ticket, {
    fetchJsonImpl: fetchJson
  });
  const parlayResult = /** @type {any} */ (result);

  assert.equal(parlayResult.kind, "parlay");
  assert.equal(parlayResult.verdict, "BET");
  assert.ok(parlayResult.legs[0].riskFlags.some((flag) => flag.code === "LINEUP_NOT_CONFIRMED"));
  assert.ok(parlayResult.riskFlags.some((flag) => flag.code === "LEG_LINEUP_NOT_CONFIRMED"));
});

test("evaluateLiveTicket uses official current-game MLB stats when gamePk is supplied", async () => {
  const ticket = validateLiveTicket({
    kind: "single",
    selection: "Live hitter total bases",
    bankroll: 1000,
    legs: [
      {
        id: "live-hitter-total-bases",
        label: "Sample hitter over 1.5 total bases",
        provider: "mlb",
        marketType: "alt-prop",
        side: "over",
        line: 1.5,
        marketOdds: -110,
        source: {
          playerId: 1,
          statGroup: "hitting",
          statKey: "totalBases",
          recentLimit: 10,
          gamePk: 1
        }
      }
    ]
  });

  const result = await evaluateLiveTicket(ticket, {
    fetchJsonImpl: fetchJson
  });

  assert.equal(result.kind, "single");
  assert.equal(result.verdict, "BET");
  const singleResult = /** @type {any} */ (result);
  assert.equal(singleResult.derived.currentGameValue, 2);
  assert.equal(singleResult.derived.liveDeterministicOutcome, true);
  assert.equal(singleResult.derived.adjustedProbability, 1);
  assert.equal(result.researchPacket.sources[0].gamePk, 1);
  assert.equal(result.researchPacket.sources[0].currentGameValue, 2);
});

test("evaluateLiveTicket rejects correlated parlays by default", async () => {
  const ticket = validateLiveTicket({
    kind: "parlay",
    selection: "Correlated live parlay",
    bankroll: 1000,
    legs: [
      {
        id: "leg-a",
        provider: "mlb",
        marketType: "prop",
        side: "over",
        line: 0.5,
        marketOdds: -105,
        correlationKey: "same-game",
        source: { playerId: 1, statGroup: "hitting", statKey: "runs" }
      },
      {
        id: "leg-b",
        provider: "mlb",
        marketType: "alt-prop",
        side: "over",
        line: 1.5,
        marketOdds: 120,
        correlationKey: "same-game",
        source: { playerId: 1, statGroup: "hitting", statKey: "totalBases" }
      }
    ]
  });

  const result = await evaluateLiveTicket(ticket, {
    fetchJsonImpl: fetchJson
  });

  assert.equal(result.verdict, "PASS");
  assert.ok(result.riskFlags.some((flag) => flag.code === "CORRELATION_RISK"));
});

test("evaluateLiveTicket uses multi-book market intelligence for consensus shrinkage", async () => {
  const ticket = validateLiveTicket({
    kind: "single",
    selection: "Consensus-aware prop",
    bankroll: 1000,
    legs: [
      {
        id: "consensus-leg",
        label: "Sample hitter over 0.5 runs",
        provider: "mlb",
        marketType: "prop",
        side: "over",
        line: 0.5,
        marketOdds: 120,
        oppositeOdds: -140,
        modelProbabilityOverride: 0.68,
        marketContext: {
          offeredLastUpdate: new Date().toISOString(),
          consensus: [
            {
              bookmaker: "sharp-reference",
              marketOdds: 115,
              oppositeOdds: -125,
              isSharp: true,
              lastUpdate: new Date().toISOString()
            },
            {
              bookmaker: "public-book",
              marketOdds: 105,
              oppositeOdds: -130,
              lastUpdate: new Date().toISOString()
            }
          ]
        },
        source: { playerId: 1, statGroup: "hitting", statKey: "runs" }
      }
    ]
  });

  const result = await evaluateLiveTicket(ticket, {
    fetchJsonImpl: fetchJson
  });
  const singleResult = /** @type {any} */ (result);
  const marketIntelligence = singleResult.derived.marketIntelligence;

  assert.equal(singleResult.kind, "single");
  assert.equal(marketIntelligence.consensus.bookCount, 2);
  assert.equal(marketIntelligence.consensus.sharpBookCount, 1);
  assert.equal(singleResult.derived.marketReferenceProbability, marketIntelligence.referenceProbability);
  assert.ok(singleResult.derived.adjustedProbability < 0.68);
  assert.ok(singleResult.riskFlags.some((flag) => flag.code === "MARKET_CONSENSUS"));
});

test("evaluateLiveTicket waits when the offered sportsbook price is stale", async () => {
  const ticket = validateLiveTicket({
    kind: "single",
    selection: "Stale market prop",
    bankroll: 1000,
    legs: [
      {
        id: "stale-market-leg",
        label: "Sample hitter over 0.5 runs",
        provider: "mlb",
        marketType: "prop",
        side: "over",
        line: 0.5,
        marketOdds: 120,
        oppositeOdds: -135,
        modelProbabilityOverride: 0.68,
        marketContext: {
          offeredLastUpdate: "2026-01-01T00:00:00.000Z"
        },
        maxMarketAgeMinutes: 1,
        source: { playerId: 1, statGroup: "hitting", statKey: "runs" }
      }
    ]
  });

  const result = await evaluateLiveTicket(ticket, {
    fetchJsonImpl: fetchJson
  });

  assert.equal(result.verdict, "WAIT");
  assert.ok(result.riskFlags.some((flag) => flag.code === "STALE_MARKET_PRICE"));
});

test("evaluateLiveTicket applies longshot tax when no sharp confirmation exists", async () => {
  const ticket = validateLiveTicket({
    kind: "single",
    selection: "Unsupported longshot prop",
    bankroll: 1000,
    legs: [
      {
        id: "longshot-leg",
        label: "Sample hitter over 1.5 hits",
        provider: "mlb",
        marketType: "alt-prop",
        side: "over",
        line: 1.5,
        marketOdds: 500,
        oppositeOdds: -700,
        modelProbabilityOverride: 0.26,
        source: { playerId: 1, statGroup: "hitting", statKey: "hits" }
      }
    ]
  });

  const result = await evaluateLiveTicket(ticket, {
    fetchJsonImpl: fetchJson
  });
  const singleResult = /** @type {any} */ (result);

  assert.ok(singleResult.derived.marketIntelligence.adjustments.some((entry) => entry.code === "FAVORITE_LONGSHOT_BIAS"));
  assert.ok(singleResult.derived.adjustedProbability < singleResult.derived.baseProbability);
  assert.ok(singleResult.riskFlags.some((flag) => flag.code === "FAVORITE_LONGSHOT_BIAS"));
});

test("evaluateLiveTicket waits when books disagree too much on the fair probability", async () => {
  const ticket = validateLiveTicket({
    kind: "single",
    selection: "Dispersed market prop",
    bankroll: 1000,
    legs: [
      {
        id: "dispersed-market-leg",
        label: "Sample hitter over 0.5 runs",
        provider: "mlb",
        marketType: "prop",
        side: "over",
        line: 0.5,
        marketOdds: 120,
        oppositeOdds: -140,
        modelProbabilityOverride: 0.68,
        marketContext: {
          consensus: [
            { bookmaker: "book-a", marketOdds: -160, oppositeOdds: 140 },
            { bookmaker: "book-b", marketOdds: 180, oppositeOdds: -220 }
          ]
        },
        source: { playerId: 1, statGroup: "hitting", statKey: "runs" }
      }
    ]
  });

  const result = await evaluateLiveTicket(ticket, {
    fetchJsonImpl: fetchJson
  });

  assert.equal(result.verdict, "WAIT");
  assert.ok(result.riskFlags.some((flag) => flag.code === "MARKET_DISAGREEMENT"));
});

test("LiveDataCache reuses a provider response within the refresh window", async () => {
  const ticket = validateLiveTicket({
    kind: "single",
    bankroll: 1000,
    legs: [
      {
        id: "leg-a",
        provider: "mlb",
        marketType: "prop",
        side: "over",
        line: 0.5,
        marketOdds: -105,
        source: { playerId: 1, statGroup: "hitting", statKey: "runs" }
      }
    ]
  });
  const cache = new LiveDataCache({
    refreshIntervalMs: 60_000
  });
  let callCount = 0;

  async function countingFetch(url) {
    callCount += 1;
    return fetchJson(url);
  }

  const firstResult = await evaluateLiveTicket(ticket, {
    cache,
    fetchJsonImpl: countingFetch
  });
  const secondResult = await evaluateLiveTicket(ticket, {
    cache,
    fetchJsonImpl: countingFetch
  });

  assert.equal(callCount, 1);
  assert.equal(firstResult.researchPacket.sources[0].cache.hit, false);
  assert.equal(secondResult.researchPacket.sources[0].cache.hit, true);
});

test("live CLI can evaluate a ticket from stdin without logging", () => {
  const env = {
    ...process.env,
    BEAR_EDGE_TEST_MODE: "1"
  };
  const command = spawnSync(
    process.execPath,
    [path.resolve(__dirname, "../src/cli/evaluate-live.js"), "--stdin", "--no-log", "--compact"],
    {
      cwd: path.resolve(__dirname, ".."),
      encoding: "utf8",
      env,
      input: JSON.stringify({
        kind: "parlay",
        selection: "stdin live parlay",
        bankroll: 1000,
        legs: [
          {
            id: "leg-a",
            provider: "mlb",
            marketType: "alt-prop",
            side: "over",
            line: 1.5,
            marketOdds: 120,
            source: { playerId: 1, statGroup: "hitting", statKey: "totalBases" }
          },
          {
            id: "leg-b",
            provider: "nhl",
            marketType: "alt-prop",
            side: "over",
            line: 1.5,
            marketOdds: 125,
            source: { playerId: 2, statKey: "points" }
          }
        ]
      })
    }
  );

  assert.equal(command.status, 0, command.stderr);
  const output = JSON.parse(command.stdout);
  assert.equal(output.kind, "parlay");
  assert.equal(output.logPath, null);
});

test("watch CLI can run a single evaluation iteration", () => {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "bear-edge-watch-"));
  const logPath = path.join(tempDir, "decision_log.jsonl");
  const env = {
    ...process.env,
    BEAR_EDGE_TEST_MODE: "1"
  };
  const command = spawnSync(
    process.execPath,
    [
      path.resolve(__dirname, "../src/cli/watch-live.js"),
      path.resolve(__dirname, "../examples/live-2-leg-alt-props.json"),
      "--iterations",
      "1",
      "--log-path",
      logPath
    ],
    {
      cwd: path.resolve(__dirname, ".."),
      encoding: "utf8",
      env
    }
  );

  assert.equal(command.status, 0, command.stderr);
  const output = JSON.parse(command.stdout.trim());
  assert.equal(output.kind, "parlay");
});
