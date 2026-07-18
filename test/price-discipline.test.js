const test = require("node:test");
const assert = require("node:assert/strict");

const {
  buildPriceDiscipline,
  calculateMinimumAcceptablePrice,
  decimalToAmerican,
  isAmericanOddsAtLeast
} = require("../src/live/price-discipline.js");
const { findCandidatePrice } = require("../src/live/best-mlb-targets.js");

function almostEqual(actual, expected, epsilon = 1e-9) {
  assert.ok(Math.abs(actual - expected) <= epsilon, `Expected ${actual} to be close to ${expected}`);
}

function candidateFixture() {
  return {
    sport: "mlb",
    gameId: "game-1",
    gameDate: "2026-07-17T14:30:00.000Z",
    statKey: "strikeOuts",
    lean: "Over",
    line: 5.5,
    player: { id: "pitcher-1", name: "Sample Pitcher" }
  };
}

function bookmakerFixture(key, price, lastUpdate) {
  return {
    key,
    title: key,
    lastUpdate,
    markets: [{
      key: "pitcher_strikeouts",
      lastUpdate,
      outcomes: [
        { name: "Over", description: "Sample Pitcher", price, point: 5.5 },
        { name: "Under", description: "Sample Pitcher", price: -135, point: 5.5 }
      ]
    }]
  };
}

test("decimalToAmerican preserves favorite and underdog price boundaries", () => {
  almostEqual(decimalToAmerican(2.2), 120);
  almostEqual(decimalToAmerican(1.8333333333333335), -120);
  assert.throws(() => decimalToAmerican(1), /greater than 1/);
});

test("minimum acceptable price satisfies EV, Kelly, and minimum-stake gates strictly", () => {
  const result = calculateMinimumAcceptablePrice({
    winProbability: 0.555,
    minEvRoi: 0.01,
    minKellyFraction: 0.005,
    bankroll: 1000,
    kellyMultiplier: 0.12,
    minStake: 5,
    maxStake: 15,
    maxBankrollFraction: 0.015
  });

  assert.equal(result.feasible, true);
  assert.equal(result.bindingConstraint, "minimum_stake");
  assert.equal(result.minimumAcceptableAmericanOdds, -115);
  assert.ok(result.constraints.every((constraint) => Number.isFinite(constraint.decimalOddsBoundary)));
  assert.equal(isAmericanOddsAtLeast(-115, result.minimumAcceptableAmericanOdds), true);
  assert.equal(isAmericanOddsAtLeast(-116, result.minimumAcceptableAmericanOdds), false);
});

test("minimum acceptable price fails closed when stake caps cannot clear the minimum", () => {
  const result = calculateMinimumAcceptablePrice({
    winProbability: 0.6,
    minEvRoi: 0.01,
    minKellyFraction: 0.005,
    bankroll: 1000,
    kellyMultiplier: 0.12,
    minStake: 5,
    maxStake: 5,
    maxBankrollFraction: 0.015
  });

  assert.equal(result.feasible, false);
  assert.equal(result.minimumAcceptableAmericanOdds, null);
  assert.ok(result.reasonCodes.includes("STAKE_CAP_CANNOT_CLEAR_MINIMUM"));
});

test("price discipline expires at the earliest freshness or event cutoff", () => {
  const result = buildPriceDiscipline({
    currentAmericanOdds: 120,
    winProbability: 0.555,
    priceCapturedAt: "2026-07-17T14:00:00.000Z",
    eventStartAt: "2026-07-17T14:12:00.000Z",
    now: "2026-07-17T14:08:00.000Z",
    policy: {
      minEvRoi: 0.01,
      minKellyFraction: 0.005,
      bankroll: 1000,
      kellyMultiplier: 0.12,
      minStake: 5,
      maxStake: 15,
      maxBankrollFraction: 0.015,
      maxMarketAgeMinutes: 10,
      prohibitedWindowMinutes: 5
    }
  });

  assert.equal(result.validUntil, "2026-07-17T14:07:00.000Z");
  assert.equal(result.status, "expired");
  assert.equal(result.expired, true);
  assert.equal(result.clearsMinimumPrice, true);
  assert.deepEqual(result.invalidationConditions, [
    "price_below_minimum",
    "line_changed",
    "lineup_changed",
    "injury_status_changed",
    "market_stale",
    "event_time_cutoff_reached",
    "source_verification_lost"
  ]);
});

test("findCandidatePrice chooses the best fresh number across returned books", () => {
  const event = {
    bookmaker: bookmakerFixture("draftkings", 105, "2026-07-17T14:00:00.000Z"),
    bookmakers: [
      bookmakerFixture("draftkings", 105, "2026-07-17T14:00:00.000Z"),
      bookmakerFixture("fanduel", 115, "2026-07-17T14:01:00.000Z"),
      bookmakerFixture("betmgm", 130, "2026-07-17T13:00:00.000Z")
    ]
  };
  const price = findCandidatePrice(candidateFixture(), event, {
    now: "2026-07-17T14:05:00.000Z",
    maxMarketAgeMinutes: 10
  });

  assert.equal(price.bookmaker.key, "fanduel");
  assert.equal(price.marketOdds, 115);
  assert.equal(price.selectionMethod, "best_fresh_available_price");
  assert.equal(price.availableOffers.length, 3);
  assert.equal(price.freshOfferCount, 2);
  assert.deepEqual(price.availableOffers.map((offer) => offer.bookmaker), [
    "betmgm",
    "fanduel",
    "draftkings"
  ]);
});

test("findCandidatePrice can enforce an exact required sportsbook", () => {
  const event = {
    bookmaker: bookmakerFixture("draftkings", 105, "2026-07-17T14:00:00.000Z"),
    bookmakers: [
      bookmakerFixture("draftkings", 105, "2026-07-17T14:00:00.000Z"),
      bookmakerFixture("fanduel", 115, "2026-07-17T14:01:00.000Z")
    ]
  };
  const price = findCandidatePrice(candidateFixture(), event, {
    requiredBookmaker: "draftkings",
    now: "2026-07-17T14:05:00.000Z",
    maxMarketAgeMinutes: 10
  });

  assert.equal(price.bookmaker.key, "draftkings");
  assert.equal(price.marketOdds, 105);
  assert.equal(price.selectionMethod, "required_bookmaker_price");
});
