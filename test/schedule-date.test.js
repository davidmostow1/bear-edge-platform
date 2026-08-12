const test = require("node:test");
const assert = require("node:assert/strict");

const { fetchGamesForWindow } = require("../src/live/schedule.js");
const { getSourceStatusDashboard } = require("../src/live/source-status.js");
const { fetchOnlineOpportunities } = require("../src/live/online-opportunities.js");
const { fetchJson, fetchText } = require("../src/live/fixture-fetch.js");

const EASTERN_BOUNDARY_INSTANT = new Date("2030-01-01T02:30:00.000Z");

test("today resolves from the configured timezone instead of the host calendar", async () => {
  const requestedUrls = [];
  const result = await fetchGamesForWindow({
    date: "today",
    days: 1,
    sports: ["mlb"],
    now: EASTERN_BOUNDARY_INSTANT,
    timeZone: "America/New_York",
    fetchJsonImpl: async (url) => {
      requestedUrls.push(url);
      return { dates: [], totalGames: 0 };
    }
  });

  assert.deepEqual(result.dates, ["2029-12-31"]);
  assert.match(requestedUrls[0], /date=2029-12-31/);
});

test("source status uses the same configured-timezone date window as game discovery", async () => {
  const result = await getSourceStatusDashboard({
    date: "today",
    days: 1,
    maxRosterTeams: 0,
    now: EASTERN_BOUNDARY_INSTANT,
    timeZone: "America/New_York",
    fetchJsonImpl: fetchJson,
    fetchTextImpl: fetchText
  });

  assert.deepEqual(result.dates, ["2029-12-31"]);
});

test("online opportunities use the same configured-timezone date window", async () => {
  const result = await fetchOnlineOpportunities({
    date: "today",
    days: 1,
    sports: ["mlb"],
    now: EASTERN_BOUNDARY_INSTANT,
    timeZone: "America/New_York",
    fetchJsonImpl: fetchJson,
    fetchTextImpl: fetchText
  });

  assert.deepEqual(result.dates, ["2029-12-31"]);
});

test("an explicit slate date does not depend on the runtime clock or timezone", async () => {
  const result = await fetchGamesForWindow({
    date: "2026-07-22",
    days: 1,
    sports: ["mlb"],
    now: "not-a-timestamp",
    timeZone: "not-a-timezone",
    fetchJsonImpl: async () => ({ dates: [], totalGames: 0 })
  });

  assert.deepEqual(result.dates, ["2026-07-22"]);
});
