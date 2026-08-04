const test = require("node:test");
const assert = require("node:assert/strict");

const { parseEspnSnapshot } = require("../src/live/espn-snapshot.js");

const ESPN_TEXT = `
New York Mets @ Philadelphia Phillies
NYM
New York Mets
40-57
19-29 Away
PHI
Philadelphia Phillies
54-43
25-21 Home
7:00 PM
Game Odds
Odds by DraftKings
NYM
+112
o9.5 -111
+1.5 -181
PHI
-147
u9.5 -109
-1.5 +149
Recent Schedule
DATE
OPP
RESULT
SPREAD
TOTAL
7/12
vs BOS
L 3-2
+1.5
8.0
7/11
vs BOS
L 4-0
-1.5
7.5
Matchup Predictor
NYM
51.5
%
PHI
48.5
%
Hitting Props
Hits
Line Over Under
Bo Bichette
NYM SS
o1.5
+193
u1.5
-262
Bryce Harper
PHI 1B
o0.5
-252
u0.5
+186
More Hitting Props
Alec Bohm
PHI 3B
o0.5 -104
u0.5 -133
Pitching Props
Christian Scott
NYM SP
o5.5
+106
u5.5
-135
Game Props
Philadelphia Phillies
o4.5
-130
u4.5
+100
New York Mets
o4.5
-110
u4.5
-120
Injury Report
New York Mets
Bo Bichette
SS
Day-To-Day
Luis Robert Jr.
CF
60-Day IL
Philadelphia Phillies
Justin Crawford
CF
Day-To-Day
World Series
`;

test("ESPN snapshots preserve displayed odds and contextual research evidence", () => {
  const result = parseEspnSnapshot({
    text: ESPN_TEXT,
    sourceUrl: "https://www.espn.com/mlb/odds/_/gameId/401816143",
    capturedAt: "2026-07-16T16:10:00.000Z"
  });

  assert.equal(result.provider, "ESPN");
  assert.equal(result.event.eventId, "401816143");
  assert.equal(result.event.away.abbreviation, "NYM");
  assert.equal(result.event.home.abbreviation, "PHI");
  assert.equal(result.event.away.record, "40-57");
  assert.equal(result.event.home.record, "54-43");
  assert.equal(result.event.odds.moneyline[0].odds, 112);
  assert.equal(result.event.odds.moneyline[1].odds, -147);
  assert.equal(result.event.odds.total.length, 2);
  assert.equal(result.event.odds.runLine.length, 2);
  assert.equal(result.event.props.length, 6);
  assert.equal(result.event.props[0].market, "hits");
  assert.equal(result.event.props[0].underOdds, -262);
  assert.equal(result.event.injuries.length, 3);
  assert.equal(result.event.recentSchedule.length, 2);
  assert.equal(result.event.matchupPredictor.awayProbability, 0.515);
  assert.equal(result.event.matchupPredictor.homeProbability, 0.485);
  assert.equal(result.event.matchupPredictor.verified, false);
  assert.equal(result.event.odds.moneyline[0].verified, false);
  assert.equal(result.event.injuries[0].verified, false);
  assert.equal(result.event.evidence.sourceUrl, "https://www.espn.com/mlb/odds/_/gameId/401816143");
  assert.ok(result.warnings.some((warning) => warning.includes("browser-visible ESPN")));
  assert.ok(result.warnings.some((warning) => warning.includes("not a Bear Edge model probability")));
});

test("ESPN accessibility-style labels are normalized without authorizing prices", () => {
  const result = parseEspnSnapshot({
    text: `
heading New York Mets @ Philadelphia Phillies, Value: 1
link Description: NYM, Value: espn.com/mlb/team/_/name/nym/new-york-mets
link Description: New York Mets, Value: espn.com/mlb/team/_/name/nym/new-york-mets
text 40-57
text 19-29 Away
link Description: PHI, Value: espn.com/mlb/team/_/name/phi/philadelphia-phillies
link Description: Philadelphia Phillies, Value: espn.com/mlb/team/_/name/phi/philadelphia-phillies
text 54-43
text 25-21 Home
text 7:00 PM
heading Game Odds Odds by, Value: 2
text NYM
text +112
text o9.5 -111
text +1.5 -181
text PHI
text -147
text u9.5 -109
text -1.5 +149
heading Recent Schedule, Value: 2
text 7/12
text vs BOS
text L [3-2]
text +1.5
text 8.0
heading Matchup Predictor, Value: 3
text 51.5
text %
text 48.5
text %
heading Hitting Props, Value: 2
text Hits
link Description: Bo Bichette, Value: espn.com/mlb/player/_/id/38904
text NYM SS
text o1.5
text +193
text u1.5
text -262
heading Injury Report, Value: 3
text New York Mets
link Description: Bo Bichette, Value: espn.com/mlb/player/_/id/38904
text SS
text Day-To-Day
text Philadelphia Phillies
link Description: Justin Crawford, Value: espn.com/mlb/player/_/id/5080642
text CF
text Day-To-Day
`,
    sourceUrl: "https://www.espn.com/mlb/odds/_/gameId/401816143"
  });

  assert.equal(result.event.odds.moneyline.length, 2);
  assert.equal(result.event.odds.total[0].odds, -111);
  assert.equal(result.event.props[0].player, "Bo Bichette");
  assert.equal(result.event.injuries.length, 2);
  assert.equal(result.event.away.name, "New York Mets");
  assert.equal(result.event.home.name, "Philadelphia Phillies");
});

test("ESPN grouped accessibility prop rows align players with later price pairs", () => {
  const result = parseEspnSnapshot({
    text: [
      "New York Mets @ Philadelphia Phillies",
      "New York Mets",
      "40-57",
      "Philadelphia Phillies",
      "54-43",
      "Hitting Props",
      "Bo Bichette",
      "NYM SS",
      "Bryce Harper",
      "PHI 1B",
      "o1.5",
      "\x2b193",
      "u1.5",
      "-262",
      "o0.5",
      "-252",
      "u0.5",
      "\x2b186",
      "Game Props",
      "Philadelphia Phillies",
      "54-43",
      "New York Mets",
      "40-57",
      "o4.5",
      "-130",
      "u4.5",
      "\x2b100",
      "o4.5",
      "-110",
      "u4.5",
      "-120"
    ].join("\n")
  });

  assert.equal(result.event.props.length, 4);
  assert.equal(result.event.props[0].player, "Bo Bichette");
  assert.equal(result.event.props[0].market, "hits");
  assert.equal(result.event.props[1].player, "Bryce Harper");
  assert.equal(result.event.props[2].player, "Philadelphia Phillies");
  assert.equal(result.event.props[2].market, "team_total_runs");
  assert.equal(result.event.props[3].player, "New York Mets");
});

test("ESPN snapshots identify arbitrary MLB matchups without Mets-Phillies fallbacks", () => {
  const result = parseEspnSnapshot({
    text: `
New York Yankees @ Boston Red Sox
NYY
New York Yankees
51-42
BOS
Boston Red Sox
49-44
7:10 PM
Game Odds
NYY
+105
o8.5 -110
+1.5 -190
BOS
-115
u8.5 -110
-1.5 +165
Injury Report
`,
    sourceUrl: "https://www.espn.com/mlb/odds/_/gameId/999999999"
  });

  assert.equal(result.event.game, "New York Yankees @ Boston Red Sox");
  assert.equal(result.event.away.name, "New York Yankees");
  assert.equal(result.event.away.abbreviation, "NYY");
  assert.equal(result.event.home.name, "Boston Red Sox");
  assert.equal(result.event.home.abbreviation, "BOS");
  assert.equal(result.event.odds.moneyline[0].team, "New York Yankees");
  assert.equal(result.event.odds.moneyline[1].team, "Boston Red Sox");
});

test("ESPN snapshots reject text without an identifiable matchup", () => {
  assert.throws(
    () => parseEspnSnapshot({ text: "Game Odds\nNYY\n+105\nBOS\n-115" }),
    /identify an away and home team matchup/i
  );
});
