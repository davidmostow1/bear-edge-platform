// @ts-nocheck
const test = require("node:test");
const assert = require("node:assert/strict");
const { createRng, combineLog5 } = require("../../src/mlb/math.js");
const { createCountAccumulator, settleCountLine } = require("../../src/mlb/distributions.js");
const { predictPitcherStart } = require("../../src/mlb/pitcher-machine.js");
const { predictBatterGame } = require("../../src/mlb/batter-machine.js");
const { predictGameLines } = require("../../src/mlb/game-machine.js");
const { predictMlbGame } = require("../../src/mlb/unified-machine.js");

function lineup(prefix) {
  return Array.from({ length: 9 }, (_, index) => ({
    playerId: `${prefix}${index + 1}`,
    name: `${prefix} Batter ${index + 1}`,
    battingOrder: index + 1,
    batSide: index % 3 === 0 ? "L" : "R",
    kRate: 0.2 + index * 0.005,
    walkRate: 0.08,
    hitRate: 0.25,
    hrRate: 0.03
  }));
}

function team(name, prefix, runsPerGame = 4.5) {
  return {
    team: name,
    offense: { runsPerGame, plateAppearancesPerGame: 38 },
    starter: {
      playerId: `${name}-SP`,
      kRate: 0.25,
      walkRate: 0.08,
      hitRate: 0.24,
      hrRate: 0.03,
      pitchLimit: 95,
      expectedBattersFaced: 23,
      expectedInnings: 5.5,
      runsAllowedPerNine: 4.1
    },
    bullpen: {
      kRate: 0.24,
      walkRate: 0.09,
      hitRate: 0.24,
      hrRate: 0.032,
      runsAllowedPerNine: 4.3
    },
    lineup: lineup(prefix)
  };
}

test("seeded random generator is reproducible", () => {
  const first = createRng("bear");
  const second = createRng("bear");
  assert.deepEqual(Array.from({ length: 5 }, () => first.uniform()), Array.from({ length: 5 }, () => second.uniform()));
});

test("log5 preserves the league rate when both participants equal league", () => {
  assert.ok(Math.abs(combineLog5(0.23, 0.23, 0.23) - 0.23) < 1e-12);
});

test("count PMFs normalize and whole-number lines preserve pushes", () => {
  const accumulator = createCountAccumulator(5);
  [0, 1, 1, 2].forEach((value) => accumulator.add(value));
  const pmf = accumulator.finalize();
  assert.ok(Math.abs(pmf.reduce((sum, value) => sum + value, 0) - 1) < 1e-12);
  const market = settleCountLine(pmf, 1, "over");
  assert.equal(market.winProbability, 0.25);
  assert.equal(market.pushProbability, 0.5);
  assert.equal(market.lossProbability, 0.25);
});

test("pitcher engine produces coherent stat distributions", () => {
  const result = predictPitcherStart({
    pitcher: team("AWY", "A").starter,
    lineup: lineup("H"),
    simulations: 1600,
    seed: "pitcher"
  });
  for (const pmf of Object.values(result.pmfs)) {
    assert.ok(Math.abs(pmf.reduce((sum, value) => sum + value, 0) - 1) < 1e-9);
  }
  assert.equal(result.authorization, "RESEARCH_ONLY");
  assert.ok(result.markets.strikeouts.length > 0);
});

test("higher pitcher strikeout skill raises expected strikeouts", () => {
  const common = { lineup: lineup("H"), simulations: 1800, seed: "skill" };
  const low = predictPitcherStart({ ...common, pitcher: { ...team("A", "A").starter, kRate: 0.17 } });
  const high = predictPitcherStart({ ...common, pitcher: { ...team("A", "A").starter, kRate: 0.35 } });
  assert.ok(high.summaries.strikeouts.mean > low.summaries.strikeouts.mean + 1);
});

test("lower pitch limits reduce projected workload", () => {
  const common = { lineup: lineup("H"), simulations: 1800, seed: "workload" };
  const low = predictPitcherStart({ ...common, pitcher: { ...team("A", "A").starter, pitchLimit: 68 } });
  const high = predictPitcherStart({ ...common, pitcher: { ...team("A", "A").starter, pitchLimit: 106 } });
  assert.ok(high.summaries.battersFaced.mean > low.summaries.battersFaced.mean);
});

test("batter engine produces every requested prop distribution", () => {
  const opponent = team("H", "H");
  const result = predictBatterGame({
    batter: lineup("A")[1],
    opposingStarter: opponent.starter,
    opposingBullpen: opponent.bullpen,
    teamContext: { plateAppearancesPerGame: 39, runsPerGame: 4.8 },
    simulations: 1800,
    seed: "batter"
  });
  for (const key of ["hits", "totalBases", "homeRuns", "strikeouts", "walks", "singles", "doubles", "triples", "runs", "rbis"]) {
    assert.ok(result.pmfs[key]);
    assert.ok(Math.abs(result.pmfs[key].reduce((sum, value) => sum + value, 0) - 1) < 1e-9);
    assert.ok(result.markets[key].length > 0);
  }
});

test("game engine returns coherent full-game and first-five markets", () => {
  const result = predictGameLines({
    away: team("AWY", "A", 4.4),
    home: team("HME", "H", 4.7),
    simulations: 3500,
    seed: "game"
  });
  assert.ok(Math.abs(result.moneyline.away + result.moneyline.home - 1) < 1e-12);
  assert.ok(Math.abs(result.firstFiveMoneyline.away + result.firstFiveMoneyline.home + result.firstFiveMoneyline.push - 1) < 1e-12);
  assert.ok(Object.keys(result.markets).some((key) => key.includes("runline")));
  assert.ok(Object.keys(result.markets).some((key) => key.includes("total")));
});

test("unified engine returns two pitchers eighteen batters and game lines", () => {
  const output = predictMlbGame({
    gameId: "test-game",
    seed: "unified",
    simulations: { pitcher: 600, batter: 600, game: 1200 },
    away: team("AWY", "A"),
    home: team("HME", "H")
  });
  assert.equal(output.authorization, "RESEARCH_ONLY");
  assert.equal(output.authorizedStake, 0);
  assert.equal(output.validated, false);
  assert.ok(output.pitchers.away.pmfs.strikeouts);
  assert.ok(output.pitchers.home.pmfs.strikeouts);
  assert.equal(output.batters.length, 18);
  assert.match(output.inputDigest, /^[a-f0-9]{64}$/);
});
