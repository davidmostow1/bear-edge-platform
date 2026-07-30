const test = require("node:test");
const assert = require("node:assert/strict");

const { getBestMlbTargets } = require("../src/live/best-mlb-targets.js");
const {
  fetchOddsApiMarkets,
  resetOddsApiRuntimeState,
  verifyOddsApiReadiness
} = require("../src/live/odds-api.js");
const { fetchJson: fixtureFetchJson, fetchText: fixtureFetchText } = require("../src/live/fixture-fetch.js");
const { getSourceStatusDashboard } = require("../src/live/source-status.js");

const API_KEY = "quota-protection-test-key";

function responseWithQuota(remaining, used, last) {
  return {
    headers: new Headers({
      "x-requests-remaining": String(remaining),
      "x-requests-used": String(used),
      "x-requests-last": String(last)
    })
  };
}

function quotaError() {
  const error = /** @type {Error & {providerCode: string, providerMessage: string, httpStatus: number}} */ (
    new Error("Usage quota has been reached.")
  );
  error.providerCode = "OUT_OF_USAGE_CREDITS";
  error.providerMessage = "Usage quota has been reached.";
  error.httpStatus = 401;
  return error;
}

function hasErrorFields(error, expected) {
  if (!(error instanceof Error)) {
    return false;
  }

  const actual = /** @type {Error & {providerCode?: string, localCircuit?: boolean}} */ (error);
  return actual.providerCode === expected.providerCode &&
    (expected.localCircuit === undefined || actual.localCircuit === expected.localCircuit);
}

test.beforeEach(() => {
  resetOddsApiRuntimeState();
});

test("paid odds requests capture provider quota headers without returning the key", async () => {
  const result = await fetchOddsApiMarkets({
    oddsApiKey: API_KEY,
    markets: "h2h",
    fetchJsonImpl: async (_url, options) => {
      options.onResponse(responseWithQuota(42, 58, 1));
      return [];
    }
  });

  assert.equal(result.quota.remainingCredits, 42);
  assert.equal(result.quota.usedCredits, 58);
  assert.equal(result.quota.lastRequestCost, 1);
  assert.equal(result.quota.circuitOpen, false);
  assert.equal(JSON.stringify(result).includes(API_KEY), false);
});

test("duplicate paid odds requests reuse the short-lived cache", async () => {
  let networkCalls = 0;
  const fetchJsonImpl = async (_url, options) => {
    networkCalls += 1;
    options.onResponse(responseWithQuota(99, 1, 1));
    return [];
  };
  const request = {
    oddsApiKey: API_KEY,
    sportKey: "baseball_mlb",
    markets: "h2h",
    bookmakers: "draftkings",
    fetchJsonImpl
  };

  const first = await fetchOddsApiMarkets(request);
  const second = await fetchOddsApiMarkets(request);

  assert.equal(networkCalls, 1);
  assert.equal(first.cache.hit, false);
  assert.equal(second.cache.hit, true);
});

test("paid response caches do not cross injected provider transports", async () => {
  const first = await fetchOddsApiMarkets({
    oddsApiKey: API_KEY,
    markets: "h2h",
    fetchJsonImpl: async () => []
  });
  let secondTransportCalls = 0;
  const second = await fetchOddsApiMarkets({
    oddsApiKey: API_KEY,
    markets: "h2h",
    fetchJsonImpl: async () => {
      secondTransportCalls += 1;
      return [{
        id: "event-1",
        sport_key: "baseball_mlb",
        commence_time: "2026-07-17T23:00:00Z",
        home_team: "Home",
        away_team: "Away",
        bookmakers: []
      }];
    }
  });

  assert.equal(first.eventCount, 0);
  assert.equal(second.eventCount, 1);
  assert.equal(secondTransportCalls, 1);
});

test("quota exhaustion opens a circuit that blocks repeated paid requests", async () => {
  let networkCalls = 0;
  const failingFetch = async () => {
    networkCalls += 1;
    throw quotaError();
  };

  await assert.rejects(
    fetchOddsApiMarkets({ oddsApiKey: API_KEY, markets: "h2h", fetchJsonImpl: failingFetch }),
    (error) => hasErrorFields(error, { providerCode: "OUT_OF_USAGE_CREDITS" })
  );
  await assert.rejects(
    fetchOddsApiMarkets({ oddsApiKey: API_KEY, markets: "h2h", fetchJsonImpl: failingFetch }),
    (error) => hasErrorFields(error, { providerCode: "OUT_OF_USAGE_CREDITS", localCircuit: true })
  );

  assert.equal(networkCalls, 1);
});

test("readiness uses free catalog quota headers and skips a paid probe at zero credits", async () => {
  const urls = [];
  const result = await verifyOddsApiReadiness({
    oddsApiKey: API_KEY,
    fetchJsonImpl: async (url, options) => {
      urls.push(url);
      options.onResponse(responseWithQuota(0, 500, 0));
      return [{ key: "baseball_mlb", title: "MLB", active: true }];
    }
  });

  assert.equal(result.status, "quota_exhausted");
  assert.equal(result.authenticated, true);
  assert.equal(result.marketAccess, false);
  assert.equal(result.quota.remainingCredits, 0);
  assert.equal(urls.length, 1);
  assert.match(urls[0], /\/v4\/sports\/\?apiKey=/);
});

test("source status spends zero odds credits even when a key is configured", async () => {
  const urls = [];
  await getSourceStatusDashboard({
    date: "2026-06-17",
    days: 1,
    maxRosterTeams: 2,
    oddsApiKey: API_KEY,
    fetchJsonImpl: async (url) => {
      urls.push(url);
      return fixtureFetchJson(url);
    },
    fetchTextImpl: async (url) => {
      urls.push(url);
      return fixtureFetchText(url);
    }
  });

  assert.equal(urls.some((url) => url.includes("api.the-odds-api.com")), false);
});

test("best-target discovery requires explicit permission before paid odds requests", async () => {
  const urls = [];
  const result = await getBestMlbTargets({
    date: "2026-06-17",
    days: 1,
    limit: 3,
    maxCandidates: 20,
    oddsApiKey: API_KEY,
    allowPaidOdds: false,
    fetchJsonImpl: async (url) => {
      urls.push(url);
      return fixtureFetchJson(url);
    }
  });

  assert.equal(result.status, "odds_refresh_required");
  assert.equal(result.summary.oddsApiConfigured, true);
  assert.equal(result.summary.paidOddsRequested, false);
  assert.equal(urls.some((url) => url.includes("api.the-odds-api.com")), false);
  assert.ok(result.warnings.some((warning) => /manual refresh/i.test(warning)));
});

test("manual best-target pricing preserves the configured credit reserve before event fan-out", async () => {
  let eventOddsCalls = 0;
  const result = await getBestMlbTargets({
    date: "2026-06-17",
    days: 1,
    limit: 3,
    maxCandidates: 20,
    oddsApiKey: API_KEY,
    allowPaidOdds: true,
    fetchJsonImpl: async (url, options) => {
      if (url.includes("/events/") && url.includes("/odds")) {
        eventOddsCalls += 1;
      }
      if (url.includes("/v4/sports/baseball_mlb/odds")) {
        options.onResponse(responseWithQuota(5, 495, 1));
      }
      return fixtureFetchJson(url);
    }
  });

  assert.equal(eventOddsCalls, 0);
  assert.equal(result.status, "odds_unmatched");
  assert.equal(result.oddsUsageBudget.reserveCredits, 5);
  assert.equal(result.oddsUsageBudget.eventsRequested, 0);
  assert.equal(result.oddsUsageBudget.maximumEstimatedCost, 1);
  assert.ok(result.warnings.some((warning) => /credit budget limited/i.test(warning)));
});
