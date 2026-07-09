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
