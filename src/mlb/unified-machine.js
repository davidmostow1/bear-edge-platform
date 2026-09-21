// @ts-nocheck
const { stableHash } = require("./math.js");
const { predictPitcherStart } = require("./pitcher-machine.js");
const { predictBatterGame } = require("./batter-machine.js");
const { predictGameLines } = require("./game-machine.js");

function predictMlbGame(input) {
  if (!input?.away?.starter || !input?.home?.starter) throw new TypeError("away and home starters are required");
  if (!Array.isArray(input.away.lineup) || input.away.lineup.length < 9 || !Array.isArray(input.home.lineup) || input.home.lineup.length < 9) {
    throw new RangeError("both teams require nine-player lineups");
  }
  const inputDigest = stableHash(input);
  const seed = input.seed ?? inputDigest;
  const pitcherSimulations = input.simulations?.pitcher ?? 10000;
  const batterSimulations = input.simulations?.batter ?? 10000;
  const gameSimulations = input.simulations?.game ?? 25000;
  const awayPitcher = predictPitcherStart({
    pitcher: input.away.starter,
    lineup: input.home.lineup,
    league: input.league,
    simulations: pitcherSimulations,
    seed: `${seed}:away-pitcher`,
    lines: input.pitcherLines
  });
  const homePitcher = predictPitcherStart({
    pitcher: input.home.starter,
    lineup: input.away.lineup,
    league: input.league,
    simulations: pitcherSimulations,
    seed: `${seed}:home-pitcher`,
    lines: input.pitcherLines
  });
  const batterPredictions = [];
  for (const [side, team, opponent] of [["away", input.away, input.home], ["home", input.home, input.away]]) {
    for (const batter of team.lineup) {
      batterPredictions.push({
        side,
        ...predictBatterGame({
          batter,
          opposingStarter: opponent.starter,
          opposingBullpen: opponent.bullpen,
          teamContext: team.offense,
          league: input.league,
          simulations: batterSimulations,
          seed: `${seed}:${side}:${batter.playerId ?? batter.name}`,
          lines: input.batterLines
        })
      });
    }
  }
  const game = predictGameLines({
    away: input.away,
    home: input.home,
    league: input.league,
    simulations: gameSimulations,
    seed: `${seed}:game`,
    lines: input.gameLines
  });
  return {
    schemaVersion: "1.0.0",
    authorization: "RESEARCH_ONLY",
    authorizedStake: 0,
    validated: false,
    gameId: input.gameId ?? null,
    eventStartAt: input.eventStartAt ?? null,
    generatedAt: new Date().toISOString(),
    inputDigest,
    models: [awayPitcher.modelId, batterPredictions[0]?.modelId, game.modelId],
    pitchers: { away: awayPitcher, home: homePitcher },
    batters: batterPredictions,
    game,
    warnings: [
      "Executable software is not equivalent to a validated market edge.",
      "All outputs remain research-only until prospective calibration and market comparison pass."
    ]
  };
}

module.exports = { predictMlbGame };
