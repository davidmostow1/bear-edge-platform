const test = require("node:test");
const assert = require("node:assert/strict");

const {
  analyzeMarketIntelligence
} = require("../src/live/market-intelligence.js");

test("one-sided offers are flagged and excluded from de-vigged consensus", () => {
  const result = analyzeMarketIntelligence({
    marketOdds: -110,
    oppositeOdds: null,
    marketContext: {
      offeredLastUpdate: "2026-07-17T15:59:00.000Z",
      consensus: [
        {
          bookmaker: "one-sided-book",
          marketOdds: -115,
          oppositeOdds: null,
          lastUpdate: "2026-07-17T15:59:00.000Z"
        },
        {
          bookmaker: "two-sided-book",
          marketOdds: -120,
          oppositeOdds: 100,
          lastUpdate: "2026-07-17T15:59:00.000Z"
        }
      ]
    },
    now: new Date("2026-07-17T16:00:00.000Z")
  });

  assert.ok(result.riskFlags.some((flag) =>
    flag.code === "MISSING_MARKET_COUNTERPART" && flag.severity === "high"
  ));
  assert.ok(result.riskFlags.some((flag) =>
    flag.code === "MISSING_CONSENSUS_COUNTERPART"
  ));
  assert.equal(result.consensus.bookCount, 1);
  assert.deepEqual(result.consensus.books.map((book) => book.bookmaker), ["two-sided-book"]);
  assert.equal(result.consensus.missingCounterpartCount, 1);
});
