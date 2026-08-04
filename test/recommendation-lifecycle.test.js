const test = require("node:test");
const assert = require("node:assert/strict");

const {
  evaluateRecommendationLifecycle
} = require("../src/live/recommendation-lifecycle.js");

function recommendation(overrides = {}) {
  return {
    id: "target-1",
    status: "priced",
    line: 5.5,
    odds: {
      bookmaker: { key: "draftkings" },
      marketOdds: 120
    },
    evaluation: {
      priceDiscipline: {
        status: "active",
        minimumAcceptableAmericanOdds: 105,
        validUntil: "2026-07-17T15:10:00.000Z",
        invalidationConditions: [
          "price_below_minimum",
          "line_changed",
          "lineup_changed",
          "injury_status_changed",
          "market_stale",
          "event_time_cutoff_reached",
          "source_verification_lost"
        ]
      }
    },
    ...overrides
  };
}

function currentOffer(overrides = {}) {
  return {
    sportsbook: "draftkings",
    line: 5.5,
    americanOdds: 120,
    capturedAt: "2026-07-17T15:04:00.000Z",
    sourceVerified: true,
    marketStatus: "open",
    ...overrides
  };
}

test("lifecycle keeps an exact fresh offer active", () => {
  const result = evaluateRecommendationLifecycle({
    recommendation: recommendation(),
    currentOffer: currentOffer(),
    now: "2026-07-17T15:05:00.000Z",
    previousStatus: "active"
  });

  assert.equal(result.status, "active");
  assert.equal(result.actionable, true);
  assert.deepEqual(result.reasonCodes, []);
  assert.deepEqual(result.alerts, []);
});

test("lifecycle expires at validUntil and emits a transition alert", () => {
  const result = evaluateRecommendationLifecycle({
    recommendation: recommendation(),
    currentOffer: currentOffer(),
    now: "2026-07-17T15:10:00.000Z",
    previousStatus: "active"
  });

  assert.equal(result.status, "expired");
  assert.equal(result.actionable, false);
  assert.ok(result.reasonCodes.includes("RECOMMENDATION_EXPIRED"));
  assert.equal(result.alerts[0].type, "recommendation_withdrawn");
  assert.equal(result.alerts[0].sportsbook, "draftkings");
  assert.equal(result.alerts[0].line, 5.5);
  assert.equal(result.alerts[0].americanOdds, 120);
  assert.equal(result.alerts[0].minimumAcceptableAmericanOdds, 105);
  assert.equal(result.alerts[0].priceCapturedAt, "2026-07-17T15:04:00.000Z");
  assert.equal(result.alerts[0].validUntil, "2026-07-17T15:10:00.000Z");
  assert.match(result.alerts[0].message, /draftkings/);
  assert.match(result.alerts[0].message, /5\.5/);
  assert.match(result.alerts[0].message, /minimum 105/);
});

test("lifecycle withdraws when current price falls below the minimum", () => {
  const result = evaluateRecommendationLifecycle({
    recommendation: recommendation(),
    currentOffer: currentOffer({ americanOdds: 100 }),
    now: "2026-07-17T15:05:00.000Z",
    previousStatus: "active"
  });

  assert.equal(result.status, "withdrawn");
  assert.ok(result.reasonCodes.includes("PRICE_BELOW_MINIMUM"));
});

test("lifecycle withdraws on exact line, book, source, lineup, or injury invalidation", () => {
  const result = evaluateRecommendationLifecycle({
    recommendation: recommendation(),
    currentOffer: currentOffer({
      sportsbook: "fanduel",
      line: 6.5,
      sourceVerified: false,
      marketStatus: "suspended"
    }),
    changeSignals: {
      lineupChanged: true,
      injuryStatusChanged: true
    },
    now: "2026-07-17T15:05:00.000Z",
    previousStatus: "active"
  });

  assert.equal(result.status, "withdrawn");
  assert.deepEqual(result.reasonCodes, [
    "SPORTSBOOK_CHANGED",
    "LINE_CHANGED",
    "SOURCE_VERIFICATION_LOST",
    "MARKET_NOT_OPEN",
    "LINEUP_CHANGED",
    "INJURY_STATUS_CHANGED"
  ]);
});

test("lifecycle evaluation does not mutate the recommendation or current offer", () => {
  const target = recommendation();
  const offer = currentOffer({ americanOdds: 100 });
  const before = JSON.stringify({ target, offer });

  evaluateRecommendationLifecycle({
    recommendation: target,
    currentOffer: offer,
    now: "2026-07-17T15:05:00.000Z"
  });

  assert.equal(JSON.stringify({ target, offer }), before);
});
