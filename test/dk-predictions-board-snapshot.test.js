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

test("DK Predictions board snapshot parses raw OCR prop-card text", () => {
  const result = parseDkPredictionsBoardSnapshot({
    capturedAt: "2026-07-09T13:59:00.000Z",
    sourceFile: "/tmp/kc-mets-total-bases.png",
    text: `
- MLB
KC
KC Royals
NYM Mets
Game Lines
1st Inning
HRs Hits
Jac Caglianone Total Bases
Kansas City Royals @ New York Mets
Over 1.5
Over 2.5
Over 3.5
Jared Young Total Bases
Kansas City Royals @ New York Mets
Over 0.5
Over 1.5
Over 2.5
Home
Search
$114.45 +
Starts in: 03:11:00
Today 1:10 PM
Run Line
+1.5
-156
-1.5
+150
Total
O 9.5
+113
U 9.5
-117
NYM
To Win
+133
-127
Total Bases
RBls
Strikeouts Outs Recorded
Yes
+122
Yes
+194
Yes
+212
No
-194
No
No
More >
Yes
-170
Yes
+144
Yes
+270
No
+108
No
No
More >
My Trades
Pick6
Rewards
`
  });

  assert.equal(result.provider, "DraftKings Predictions");
  assert.equal(result.bankroll, 114.45);
  assert.equal(result.summary.events, 1);
  assert.equal(result.summary.playerPropMarkets, 6);
  assert.equal(result.summary.totalBasesMarkets, 6);
  assert.equal(result.summary.strikeoutMarkets, 0);
  assert.equal(result.summary.lockedOrMissingNoPrices, 4);

  const jacOver = result.markets.find((market) => market.team_or_player === "Jac Caglianone" && market.line === 1.5);
  const jaredOver = result.markets.find((market) => market.team_or_player === "Jared Young" && market.line === 0.5);

  assert.equal(jacOver.market_type, "MLB_total_bases");
  assert.equal(jacOver.market_name, "over 1.5 total bases");
  assert.equal(jacOver.odds, 122);
  assert.equal(jacOver.opposite_odds, -194);
  assert.equal(jacOver.game, "Kansas City Royals @ New York Mets");
  assert.equal(jacOver.source_file, "/tmp/kc-mets-total-bases.png");
  assert.equal(jaredOver.odds, -170);
  assert.equal(jaredOver.opposite_odds, 108);
  assert.ok(result.warnings.some((warning) => warning.includes("visible screenshot/manual rows")));
});

test("DK Predictions board snapshot parses raw OCR game-line list text", () => {
  const result = parseDkPredictionsBoardSnapshot({
    capturedAt: "2026-07-09T13:57:42.000Z",
    text: `
MLB
ATL Braves
PIT Pirates
Today 12:35 PM
MLB
KC Royals
NYM Mets
Today 1:10PM
MLB
NYY Yankees
TB Rays
Today 1:10PM
Run Line
-1.5
+138
+1.5
-144
Total
O 9.5
-104
U 9.5
+100
Run Line
+1.5
-156
-1.5
+150
Total
O 9.5
+113
U 9.5
-117
Run Line
+1.5
-144
-1.5
+138
Total
O 7.5
-108
U 7.5
+100
To Win
-113
+108
More
To Win
+133
-127
More >
To Win
+144
-150
More
`
  });

  assert.equal(result.summary.events, 3);
  assert.equal(result.summary.moneylineMarkets, 6);
  assert.equal(result.summary.runLineMarkets, 6);
  assert.equal(result.summary.totalMarkets, 6);

  const braves = result.markets.find((market) => market.team_or_player === "ATL Braves" && market.market_name === "moneyline");
  const raysRunLine = result.markets.find((market) => market.team_or_player === "TB Rays" && market.market_type === "MLB_runline");
  const yankeesOver = result.markets.find((market) => market.game === "NYY Yankees @ TB Rays" && market.market_name === "over 7.5");

  assert.equal(braves.odds, -113);
  assert.equal(raysRunLine.line, -1.5);
  assert.equal(raysRunLine.odds, 138);
  assert.equal(yankeesOver.odds, -108);
});

test("DK Predictions board snapshot parses visible NBA, WNBA, and tennis game rows", () => {
  const result = parseDkPredictionsBoardSnapshot({
    capturedAt: "2026-07-16T15:31:10.954Z",
    sourceFile: "/tmp/predictions-multi-sport.png",
    text: `
NBASL
Spread
Total
To Win
BKN Nets
-1.5 -156
O 179.5 -170
-144
HOU Rockets
+1.5 -133
U 179.5 -127
+127
Today 4:30 PM
WNBA
Games
Points
PDX Fire
+5.5 +104
O 161.5 -127
+223
WAS Mystics
-5.5 -117
U 161.5 +104
-233
Today 7:00 PM
Tennis
N. Borges
+113
L. Darderi
-117
Fri 5:00 AM
`
  });

  assert.equal(result.summary.events, 3);
  assert.equal(result.summary.moneylineMarkets, 6);
  assert.equal(result.summary.runLineMarkets, 0);
  assert.equal(result.summary.spreadMarkets, 4);
  assert.equal(result.summary.totalMarkets, 4);
  assert.equal(result.summary.basketballEvents, 2);
  assert.equal(result.summary.tennisEvents, 1);

  const netsSpread = result.markets.find((market) => market.team_or_player === "BKN Nets" && market.market_type === "NBA_spread");
  const mysticsMoneyline = result.markets.find((market) => market.team_or_player === "WAS Mystics" && market.market_name === "moneyline");
  const borgesMoneyline = result.markets.find((market) => market.team_or_player === "N. Borges" && market.market_name === "moneyline");

  assert.equal(netsSpread.odds, -156);
  assert.equal(netsSpread.line, -1.5);
  assert.equal(netsSpread.market_name, "spread");
  assert.equal(mysticsMoneyline.odds, -233);
  assert.equal(mysticsMoneyline.league, "WNBA");
  assert.equal(borgesMoneyline.odds, 113);
  assert.equal(borgesMoneyline.sport, "tennis");
  assert.equal(borgesMoneyline.pregame_or_live, "pregame");
});

test("DK Predictions board snapshot parses split line and odds OCR rows", () => {
  const result = parseDkPredictionsBoardSnapshot({
    capturedAt: "2026-07-16T15:31:10.954Z",
    text: `
NBASL
BKN Nets
-1.5
-156
O 179.5
-170
-144
HOU Rockets
+1.5
-133
U 179.5
-127
+127
Today 4:30 PM
`
  });

  assert.equal(result.summary.events, 1);
  assert.equal(result.summary.markets, 6);

  const netsSpread = result.markets.find((market) => market.team_or_player === "BKN Nets" && market.market_name === "spread");
  const rocketsMoneyline = result.markets.find((market) => market.team_or_player === "HOU Rockets" && market.market_name === "moneyline");

  assert.equal(netsSpread.odds, -156);
  assert.equal(netsSpread.line, -1.5);
  assert.equal(rocketsMoneyline.odds, 127);
});

test("DK Predictions board snapshot preserves live tennis status without treating scores as odds", () => {
  const result = parseDkPredictionsBoardSnapshot({
    capturedAt: "2026-07-16T15:32:40.082Z",
    text: `
Tennis
1
2
J. Faria
30
2
-
+355
C. Ruud
0
3
-
-376
Live
1st Set
`
  });

  assert.equal(result.summary.events, 1);
  assert.equal(result.summary.moneylineMarkets, 2);
  assert.equal(result.summary.liveEvents, 1);

  const faria = result.markets.find((market) => market.team_or_player === "J. Faria");
  const ruud = result.markets.find((market) => market.team_or_player === "C. Ruud");

  assert.equal(faria.odds, 355);
  assert.equal(ruud.odds, -376);
  assert.equal(faria.status, "live");
  assert.equal(faria.pregame_or_live, "live");
});

test("DK Predictions OCR parser ignores orphan prices before the first full prop card", () => {
  const result = parseDkPredictionsBoardSnapshot({
    capturedAt: "2026-07-09T13:59:03.000Z",
    text: `
Yes
+233
No
-317
More >
Lane Thomas Total Bases
Kansas City Royals @ New York Mets
Over 1.5
Over 2.5
Over 3.5
Nick Loftin Total Bases
Kansas City Royals @ New York Mets
Over 0.5
Over 1.5
Over 3.5
Yes
+127
Yes
+212
Yes
+245
No
-203
No
No
More >
Yes
-186
Yes
+138
Yes
+335
No
+117
No
No
More >
`
  });

  const laneThomas = result.markets.find((market) => market.team_or_player === "Lane Thomas" && market.line === 1.5);
  const nickLoftin = result.markets.find((market) => market.team_or_player === "Nick Loftin" && market.line === 0.5);

  assert.equal(result.summary.playerPropMarkets, 6);
  assert.equal(result.summary.visiblePriceBlocks, 2);
  assert.equal(laneThomas.odds, 127);
  assert.equal(laneThomas.opposite_odds, -203);
  assert.equal(nickLoftin.odds, -186);
  assert.equal(nickLoftin.opposite_odds, 117);
});

test("DK Predictions helper converts American odds to implied probability", () => {
  almostEqual(americanToImpliedProbability(150), 0.4);
  almostEqual(americanToImpliedProbability(-150), 0.6);
});
