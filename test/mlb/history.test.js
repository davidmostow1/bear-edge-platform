// @ts-nocheck
const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs/promises");
const os = require("node:os");
const path = require("node:path");
const { normalizeGameFeed } = require("../../src/mlb/history/normalize.js");
const { buildHistoryLibrary } = require("../../src/mlb/history/library.js");

function feed(gamePk = 1) {
  return {
    gamePk,
    gameData: {
      datetime: { officialDate: "2025-04-01", dateTime: "2025-04-01T17:00:00Z" },
      game: { pk: gamePk },
      venue: { id: 1, name: "Park" },
      teams: { away: { id: 10, name: "Away" }, home: { id: 20, name: "Home" } },
      status: { detailedState: "Final" }
    },
    liveData: {
      linescore: {
        teams: { away: { runs: 3 }, home: { runs: 4 } },
        innings: Array.from({ length: 9 }, () => ({}))
      },
      boxscore: {
        teams: {
          away: {
            players: {
              ID1: {
                person: { id: 1, fullName: "Batter" },
                battingOrder: "100",
                stats: {
                  batting: {
                    plateAppearances: 4,
                    atBats: 4,
                    hits: 2,
                    doubles: 1,
                    triples: 0,
                    homeRuns: 0,
                    strikeOuts: 1,
                    baseOnBalls: 0,
                    runs: 1,
                    rbi: 1,
                    totalBases: 3
                  }
                }
              },
              ID2: {
                person: { id: 2, fullName: "Pitcher" },
                stats: {
                  pitching: {
                    gamesStarted: 1,
                    battersFaced: 24,
                    numberOfPitches: 92,
                    inningsPitched: "6.2",
                    strikeOuts: 7,
                    baseOnBalls: 2,
                    hits: 5,
                    homeRuns: 1,
                    earnedRuns: 2
                  }
                }
              }
            }
          },
          home: { players: {} }
        }
      }
    }
  };
}

test("game feeds normalize into game batter and pitcher tables", () => {
  const result = normalizeGameFeed(feed(), "a".repeat(64));
  assert.equal(result.game.awayRuns, 3);
  assert.equal(result.batting.length, 1);
  assert.equal(result.pitching.length, 1);
  assert.equal(result.pitching[0].strikeouts, 7);
  assert.equal(result.pitching[0].outs, 20);
});

test("history builds resume without duplicate rows", async () => {
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), "sweet-bear-history-"));
  let feedCalls = 0;
  const fakeFetch = async (url) => {
    if (String(url).includes("schedule")) {
      return {
        ok: true,
        json: async () => ({
          dates: [{ games: [{ gamePk: 1, gameDate: "2025-04-01T17:00:00Z", status: { detailedState: "Final" } }] }]
        })
      };
    }
    feedCalls += 1;
    return { ok: true, json: async () => feed(1) };
  };
  await buildHistoryLibrary({ seasons: [2025], outputDir: directory, fetchImpl: fakeFetch, keepRaw: false });
  await buildHistoryLibrary({ seasons: [2025], outputDir: directory, fetchImpl: fakeFetch, keepRaw: false });
  assert.equal(feedCalls, 1);
  const games = (await fs.readFile(path.join(directory, "2025", "games.jsonl"), "utf8")).trim().split("\n");
  const batters = (await fs.readFile(path.join(directory, "2025", "batting.jsonl"), "utf8")).trim().split("\n");
  const pitchers = (await fs.readFile(path.join(directory, "2025", "pitching.jsonl"), "utf8")).trim().split("\n");
  assert.equal(games.length, 1);
  assert.equal(batters.length, 1);
  assert.equal(pitchers.length, 1);
});
