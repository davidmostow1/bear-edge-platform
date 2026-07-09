const test = require("node:test");
const assert = require("node:assert/strict");

const {
  americanToImpliedProbability,
  parseDkPredictionsBoardSnapshot
} = require("../src/live/dk-predictions-board-snapshot.js");

function almostEqual(actual, expected, epsilon = 1e-9) {
  assert.ok(Math.abs(actual - expected) <= epsilon, `Expected ${actual} to be close to ${expected}`);
}

test("DK Predictions board snapshot normalizes visible odds to audit rows", () => {
  const result = parseDkPredictionsBoardSnapshot({
    date: "2026-06-27",
    capturedAt: "2026-06-27T12:50:17-04:00",
    bankroll: 206.44,
    sourceFiles: ["/tmp/yankees-red-sox.png"],
    events: [
      {
        league: "MLB",
        game: "NYY @ BOS",
        startTime: "Today 1:10 PM",
        sourceFile: "/tmp/yankees-red-sox.png",
        away: { abbreviation: "NYY", name: "NYY Yankees" },
        home: { abbreviation: "BOS", name: "BOS Red Sox" },
        markets: {
          moneyline: [
            { side: "away", odds: -108 },
            { side: "home", odds: 104 }
          ],
          runLine: [
            { side: "away", line: -1.5, odds: 156 },
            { side: "home", line: 1.5, odds: -163 }
          ],
          total: [
            { side: "over", line: 8.5, odds: 108 },
            { side: "under", line: 8.5, odds: -113 }
          ]
        }
      }
    ]
  });

  assert.equal(result.provider, "DraftKings Predictions");
  assert.equal(result.summary.events, 1);
  assert.equal(result.summary.markets, 6);
  assert.equal(result.summary.moneylineMarkets, 2);
  assert.equal(result.summary.runLineMarkets, 2);
  assert.equal(result.summary.totalMarkets, 2);

  const redSoxMoneyline = result.markets.find((market) => market.team_or_player === "BOS Red Sox" && market.market_name === "moneyline");

  assert.equal(redSoxMoneyline.market_type, "MLB_side");
  assert.equal(redSoxMoneyline.odds, 104);
  assert.equal(redSoxMoneyline.bankroll_at_time, 206.44);
  assert.equal(redSoxMoneyline.payout, 2.04);
  assert.equal(redSoxMoneyline.net_profit, 1.04);
  assert.equal(redSoxMoneyline.source_file, "/tmp/yankees-red-sox.png");
  almostEqual(redSoxMoneyline.implied_probability, 0.4902, 0.0001);
});

test("DK Predictions helper converts American odds to implied probability", () => {
  almostEqual(americanToImpliedProbability(150), 0.4);
  almostEqual(americanToImpliedProbability(-150), 0.6);
});
