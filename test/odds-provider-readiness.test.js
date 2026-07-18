const test = require("node:test");
const assert = require("node:assert/strict");

const { verifyOddsApiReadiness } = require("../src/live/odds-api.js");

const API_KEY = "provider-secret-that-must-never-be-returned";

/**
 * @returns {Error & {providerCode: string, providerMessage: string, httpStatus: number}}
 */
function providerError(code, message, httpStatus) {
  const error = /** @type {Error & {providerCode: string, providerMessage: string, httpStatus: number}} */ (
    new Error(`${message} apiKey=${API_KEY}`)
  );
  error.providerCode = code;
  error.providerMessage = message;
  error.httpStatus = httpStatus;
  return error;
}

test("odds readiness requires both catalog authentication and market access", async () => {
  const urls = [];
  const result = await verifyOddsApiReadiness({
    oddsApiKey: API_KEY,
    fetchJsonImpl: async (url) => {
      urls.push(url);

      if (url.includes("/v4/sports/baseball_mlb/odds")) {
        return [];
      }

      return [
        {
          key: "baseball_mlb",
          title: "MLB",
          active: true
        }
      ];
    }
  });

  assert.equal(result.status, "ready");
  assert.equal(result.authenticated, true);
  assert.equal(result.marketAccess, true);
  assert.equal(result.catalog.sports, 1);
  assert.equal(result.marketProbe.events, 0);
  assert.equal(urls.some((url) => url.includes("/v4/sports/?apiKey=")), true);
  assert.equal(urls.some((url) => url.includes("/v4/sports/baseball_mlb/odds")), true);
  assert.equal(JSON.stringify(result).includes(API_KEY), false);
});

test("odds readiness distinguishes authenticated keys with exhausted credits", async () => {
  const result = await verifyOddsApiReadiness({
    oddsApiKey: API_KEY,
    fetchJsonImpl: async (url) => {
      if (url.includes("/v4/sports/baseball_mlb/odds")) {
        throw providerError(
          "OUT_OF_USAGE_CREDITS",
          "Usage quota has been reached.",
          401
        );
      }

      return [
        {
          key: "baseball_mlb",
          title: "MLB",
          active: true
        }
      ];
    }
  });

  assert.equal(result.status, "quota_exhausted");
  assert.equal(result.authenticated, true);
  assert.equal(result.marketAccess, false);
  assert.equal(result.retryable, false);
  assert.equal(result.providerCode, "OUT_OF_USAGE_CREDITS");
  assert.equal(result.operatorAction, "REFILL_OR_UPGRADE_PROVIDER_CREDITS");
  assert.match(result.message, /usage quota/i);
  assert.equal(JSON.stringify(result).includes(API_KEY), false);
});

test("odds readiness rejects invalid credentials before market access", async () => {
  let requests = 0;
  const result = await verifyOddsApiReadiness({
    oddsApiKey: API_KEY,
    fetchJsonImpl: async () => {
      requests += 1;
      throw providerError("INVALID_KEY", "The API key is invalid.", 401);
    }
  });

  assert.equal(result.status, "invalid_key");
  assert.equal(result.authenticated, false);
  assert.equal(result.marketAccess, false);
  assert.equal(result.operatorAction, "REPLACE_PROVIDER_KEY");
  assert.equal(requests, 1);
  assert.equal(JSON.stringify(result).includes(API_KEY), false);
});
