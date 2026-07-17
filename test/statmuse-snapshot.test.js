const test = require("node:test");
const assert = require("node:assert/strict");

const { parseStatMuseSnapshot } = require("../src/live/statmuse-snapshot.js");

const GAME_PAGE_TEXT = `
ESPN Today 7:10 PM
Mets
40-57
2-3 in Last 5
Phillies
54-43
3-2 in Last 5
Mets Phillies Predictions Notes
Odds
New York Mets NYM
Philadelphia Phillies PHI
+122 Money
-125 Money
o9.5 -106
u9.5 +102
+1.5 -163
-1.5 +156
o10.0
Open
-145
C. Scott Over 15.5 Outs Recorded +138
A. Nola Over 16.5 Outs Recorded +130
Probable Pitchers
New York Mets NYM
Philadelphia Phillies PHI
Christian Scott
Aaron Nola
Christian Scott
RHP #45
Aaron Nola
RHP #27
2-1
W-L
3-6
3.17
ERA
5.75
65
SO
102
26
BB
31
Team Stats
New York Mets NYM
Philadelphia Phillies PHI
112
HR
124
398
R
424
.234
AVG
.236
Game Info
July 16, 2026
ESPN
Citizens Bank Park Philadelphia, Pennsylvania
101°
9 mph W
Injuries
Bo Bichette SS Day-to-day (Leg)
CF Justin Crawford Day-to-day (Knee)
Marcus Semien 2B 10-Day IL (Hip)
P Tanner Banks 15-Day IL (Forearm)
`;

const PREDICTIONS_PAGE_TEXT = `
ESPN Today 7:10 PM
Mets
40-57
2-3 in Last 5
Phillies
54-43
3-2 in Last 5
Mets Phillies Predictions Notes
Predictions
Home Runs
Line Over Under
[A. Bohm](https://statmuse.com/mlb/player/alec-bohm-93167) [A. Bohm](https://statmuse.com/mlb/player/alec-bohm-93167) 0.5 [+614](https://novig.example/bohm-over) [-1233](https://novig.example/bohm-under)
[B. Harper](https://statmuse.com/mlb/player/bryce-harper-25112) [B. Harper](https://statmuse.com/mlb/player/bryce-harper-25112) 0.5 [+292](https://novig.example/harper-over) [-376](https://novig.example/harper-under)
Pitcher SO
Line Over Under
[A. Nola](https://statmuse.com/mlb/player/aaron-nola-43387) [A. Nola](https://statmuse.com/mlb/player/aaron-nola-43387) 5.5 [+130](https://novig.example/nola-over) [-150](https://novig.example/nola-under)
[C. Scott](https://statmuse.com/mlb/player/christian-scott-95708) [C. Scott](https://statmuse.example/scott) 5.5 [+104](https://novig.example/scott-over)
`;

const NOTES_PAGE_TEXT = `
Mets Phillies Predictions Notes
Notes
Phillies begin 3-game series with the Mets
The Associated Press Jul 16, 2026
New York Mets (40-57, fifth in the NL East) vs. Philadelphia Phillies (54-43, second in the NL East)
Philadelphia; Thursday, 7:10 p.m. EDT
PITCHING PROBABLES: Mets: Christian Scott (2-1, 3.17 ERA, 1.30 WHIP, 65 strikeouts); Phillies: Aaron Nola (3-6, 5.75 ERA, 1.43 WHIP, 102 strikeouts)
LINE: Phillies -131, Mets +108; over/under is 9 1/2 runs
BOTTOM LINE: The Philadelphia Phillies host the New York Mets to begin a three-game series.
LAST 10 GAMES: Phillies: 5-5, .218 batting average, 5.23 ERA, outscored by 20 runs
Mets: 4-6, .269 batting average, 5.60 ERA, outscored by 16 runs
INJURIES: Phillies: Justin Crawford: day-to-day (knee), Tanner Banks: 15-Day IL (forearm)
Mets: Luis Robert: 60-Day IL (back), Bo Bichette: day-to-day (leg)
Players Mentioned
Tanner Banks
Bryce Harper
Get the latest news and updates from StatMuse
`;

const GENERIC_GAME_PAGE_TEXT = `
FOX Today 8:10 PM
Yankees
58-40
4-1 in Last 5
Red Sox
51-47
3-2 in Last 5
Yankees Red Sox Predictions Notes
Odds
New York Yankees NYY
Boston Red Sox BOS
-118 Money
+106 Money
o8.5 -110
u8.5 -108
Probable Pitchers
New York Yankees
Boston Red Sox
Gerrit Cole
Brayan Bello
7-3
W-L
8-5
3.21
ERA
3.88
Injuries
New York Yankees NYY
Aaron Judge RF Day-to-day (Hamstring)
DH Giancarlo Stanton 10-Day IL (Elbow)
Boston Red Sox BOS
Rafael Devers 3B Day-to-day (Back)
Game Info
July 17, 2026
FOX
Fenway Park Boston, Massachusetts
`;

test("StatMuse game-page snapshots preserve structured context without verifying displayed odds", () => {
  const result = parseStatMuseSnapshot({
    text: GAME_PAGE_TEXT,
    sourceUrl: "https://statmuse.com/mlb/game/7-16-2026-nym-at-phi-234836",
    capturedAt: "2026-07-16T15:36:00.000Z"
  });

  assert.ok(result.gamePage);
  assert.equal(result.gamePage.gameDate, "2026-07-16");
  assert.equal(result.gamePage.startTime, "Today 7:10 PM");
  assert.equal(result.gamePage.teams[0].name, "Mets");
  assert.equal(result.gamePage.teams[0].record, "40-57");
  assert.equal(result.gamePage.teams[1].name, "Phillies");
  assert.equal(result.gamePage.teams[1].record, "54-43");
  assert.equal(result.gamePage.odds.moneyline[0].odds, 122);
  assert.equal(result.gamePage.odds.moneyline[0].side, "away");
  assert.equal(result.gamePage.odds.total[0].line, 9.5);
  assert.equal(result.gamePage.odds.total[0].odds, -106);
  assert.equal(result.gamePage.odds.runLine[1].side, "home");
  assert.equal(result.gamePage.odds.openTotals[0].status, "open");
  assert.equal(result.gamePage.odds.props[0].player, "C. Scott");
  assert.equal(result.gamePage.odds.props[0].market, "outs_recorded");
  assert.equal(result.gamePage.probablePitchers[0].name, "Christian Scott");
  assert.equal(result.gamePage.probablePitchers[0].stats.ERA, 3.17);
  assert.equal(result.gamePage.teamStats.away.stats.HR, 112);
  assert.equal(result.gamePage.teamStats.home.stats.R, 424);
  assert.equal(result.gamePage.gameInfo.network, "ESPN");
  assert.equal(result.gamePage.gameInfo.temperature, "101°");
  assert.equal(result.gamePage.injuries.length, 4);
  assert.deepEqual(
    result.gamePage.injuries.map((injury) => ({
      player: injury.player,
      side: injury.side,
      team: injury.team
    })),
    [
      { player: "Bo Bichette", side: null, team: null },
      { player: "Justin Crawford", side: null, team: null },
      { player: "Marcus Semien", side: null, team: null },
      { player: "Tanner Banks", side: null, team: null }
    ]
  );
  assert.equal(result.gamePage.evidence.verifiedOdds, false);
  assert.equal(result.gamePage.evidence.sourceUrl, "https://statmuse.com/mlb/game/7-16-2026-nym-at-phi-234836");
  assert.ok(result.summary.gamePages >= 1);
  assert.ok(result.warnings.some((warning) => warning.includes("not official sportsbook odds")));
});

test("StatMuse Predictions tabs preserve player markets without authorizing evaluation", () => {
  const result = parseStatMuseSnapshot({
    text: PREDICTIONS_PAGE_TEXT,
    sourceUrl: "https://statmuse.com/mlb/game/7-16-2026-nym-at-phi-234836",
    capturedAt: "2026-07-16T15:36:00.000Z"
  });

  assert.ok(result.gamePage);
  assert.equal(result.gamePage.predictions.length, 4);
  assert.equal(result.summary.predictionMarkets, 4);
  assert.equal(result.gamePage.predictions[0].market, "home_runs");
  assert.equal(result.gamePage.predictions[0].player, "A. Bohm");
  assert.equal(result.gamePage.predictions[0].line, 0.5);
  assert.equal(result.gamePage.predictions[0].overOdds, 614);
  assert.equal(result.gamePage.predictions[0].underOdds, -1233);
  assert.equal(result.gamePage.predictions[2].market, "pitcher_so");
  assert.equal(result.gamePage.predictions[2].player, "A. Nola");
  assert.equal(result.gamePage.predictions[2].overOdds, 130);
  assert.equal(result.gamePage.predictions[3].underOdds, null);
  assert.equal(result.gamePage.predictions[3].verified, false);
  assert.ok(result.gamePage.evidence.warnings.some((warning) => warning.toLowerCase().includes("prediction markets")));
});

test("StatMuse Notes tabs preserve article context without authorizing evaluation", () => {
  const result = parseStatMuseSnapshot({
    text: NOTES_PAGE_TEXT,
    sourceUrl: "https://statmuse.com/mlb/game/7-16-2026-nym-at-phi-234836",
    capturedAt: "2026-07-16T15:38:00.000Z"
  });

  assert.ok(result.musings.length >= 1);
  assert.equal(result.summary.musings, result.musings.length);
  const notesText = result.musings.map((musing) => musing.text).join(" / ");
  assert.match(notesText, /PITCHING PROBABLES/);
  assert.match(notesText, /INJURIES/);
  assert.match(notesText, /Associated Press|Phillies/);
  assert.ok(result.warnings.every((warning) => !warning.includes("No StatMuse musings/news snippets")));
});

test("StatMuse game pages parse arbitrary teams and require explicit injury ownership", () => {
  const result = parseStatMuseSnapshot({
    text: GENERIC_GAME_PAGE_TEXT,
    sourceUrl: "https://statmuse.com/mlb/game/7-17-2026-nyy-at-bos-123456",
    capturedAt: "2026-07-17T16:00:00.000Z"
  });

  assert.equal(result.gamePage.game, "Yankees @ Red Sox");
  assert.equal(result.gamePage.teams[0].fullName, "New York Yankees");
  assert.equal(result.gamePage.teams[1].fullName, "Boston Red Sox");
  assert.deepEqual(
    result.gamePage.probablePitchers.map((pitcher) => pitcher.name),
    ["Gerrit Cole", "Brayan Bello"]
  );
  assert.deepEqual(
    result.gamePage.injuries.map((injury) => ({
      player: injury.player,
      side: injury.side,
      team: injury.team
    })),
    [
      { player: "Aaron Judge", side: "away", team: "Yankees" },
      { player: "Giancarlo Stanton", side: "away", team: "Yankees" },
      { player: "Rafael Devers", side: "home", team: "Red Sox" }
    ]
  );
  assert.equal(result.gamePage.evidence.verifiedInjuries, false);
});
