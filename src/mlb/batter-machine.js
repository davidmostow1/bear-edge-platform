// @ts-nocheck
const { createRng, clamp, combineLog5, sampleCategorical, samplePoisson } = require("./math.js");
const { createCountAccumulator, summarizePmf, buildCountLadder } = require("./distributions.js");
const { DEFAULT_LEAGUE, normalizeBatter, normalizePitcher, normalizeBullpen } = require("./profiles.js");

function outcomeProbabilities(batter, pitcher, league) {
  const k = clamp(combineLog5(batter.kRate, pitcher.kRate, league.kRate), 0.025, 0.62);
  const walk = clamp(combineLog5(batter.walkRate, pitcher.walkRate, league.walkRate), 0.01, 0.25);
  const hr = clamp(combineLog5(batter.hrRate, pitcher.hrRate, league.hrRate), 0.002, 0.16);
  const hit = clamp(combineLog5(batter.hitRate, pitcher.hitRate, league.hitRate), hr + 0.02, 0.48);
  const single = Math.max(0.005, (hit - hr) * (1 - batter.doublePerHit - batter.triplePerHit));
  const double = Math.max(0.001, (hit - hr) * batter.doublePerHit);
  const triple = Math.max(0, (hit - hr) * batter.triplePerHit);
  const subtotal = k + walk + hr + single + double + triple;
  const scale = subtotal > 0.94 ? 0.94 / subtotal : 1;
  return { k: k * scale, walk: walk * scale, hr: hr * scale, single: single * scale, double: double * scale, triple: triple * scale };
}

function simulateBatterGame({ rng, batter, starter, bullpen, league, teamContext }) {
  const basePa = clamp((teamContext.plateAppearancesPerGame ?? 38.2) / 9 + (5 - batter.battingOrder) * 0.11, 2.8, 5.2);
  const plateAppearances = clamp(2 + samplePoisson(rng, Math.max(0.2, basePa - 2)), 1, 7);
  const starterShare = clamp(starter.expectedBattersFaced / Math.max(30, teamContext.plateAppearancesPerGame ?? 38.2), 0.3, 0.82);
  const result = { hits: 0, totalBases: 0, homeRuns: 0, strikeouts: 0, walks: 0, singles: 0, doubles: 0, triples: 0, runs: 0, rbis: 0, plateAppearances };
  for (let pa = 0; pa < plateAppearances; pa += 1) {
    const useStarter = rng.uniform() < clamp(starterShare - pa * 0.035, 0.05, 0.9);
    const opponent = useStarter ? starter : bullpen;
    const p = outcomeProbabilities(batter, opponent, league);
    const outcome = sampleCategorical(rng, [
      { value: "K", weight: p.k },
      { value: "BB", weight: p.walk },
      { value: "HR", weight: p.hr },
      { value: "1B", weight: p.single },
      { value: "2B", weight: p.double },
      { value: "3B", weight: p.triple },
      { value: "OUT", weight: Math.max(0.001, 1 - p.k - p.walk - p.hr - p.single - p.double - p.triple) }
    ]);
    if (outcome === "K") result.strikeouts += 1;
    if (outcome === "BB") result.walks += 1;
    if (["1B", "2B", "3B", "HR"].includes(outcome)) {
      result.hits += 1;
      const bases = outcome === "1B" ? 1 : outcome === "2B" ? 2 : outcome === "3B" ? 3 : 4;
      result.totalBases += bases;
      if (outcome === "1B") result.singles += 1;
      if (outcome === "2B") result.doubles += 1;
      if (outcome === "3B") result.triples += 1;
      if (outcome === "HR") {
        result.homeRuns += 1;
        result.runs += 1;
        result.rbis += 1;
      } else {
        if (rng.uniform() < batter.rbiRateOnContact * (1 + 0.05 * Math.max(0, 5 - batter.battingOrder))) result.rbis += 1;
        if (rng.uniform() < batter.runRateOnReach * clamp((teamContext.runsPerGame ?? 4.45) / 4.45, 0.65, 1.4)) result.runs += 1;
      }
    } else if (outcome === "BB" && rng.uniform() < batter.runRateOnReach * 0.85) {
      result.runs += 1;
    }
  }
  return result;
}

function predictBatterGame(input) {
  const league = { ...DEFAULT_LEAGUE, ...(input.league ?? {}) };
  const batter = normalizeBatter(input.batter, league);
  const starter = normalizePitcher(input.opposingStarter, league);
  const bullpenRaw = normalizeBullpen(input.opposingBullpen, league);
  const bullpen = { ...starter, ...bullpenRaw, playerId: "bullpen", expectedBattersFaced: 18 };
  const teamContext = { plateAppearancesPerGame: 38.2, runsPerGame: league.runsPerGame, ...(input.teamContext ?? {}) };
  const simulations = Math.max(100, Math.floor(input.simulations ?? 10000));
  const rng = createRng(input.seed ?? `${batter.playerId}-batter`);
  const keys = ["hits", "totalBases", "homeRuns", "strikeouts", "walks", "singles", "doubles", "triples", "runs", "rbis", "plateAppearances"];
  const acc = Object.fromEntries(keys.map((key) => [key, createCountAccumulator(key === "totalBases" ? 24 : 8)]));
  for (let i = 0; i < simulations; i += 1) {
    const result = simulateBatterGame({ rng, batter, starter, bullpen, league, teamContext });
    for (const key of keys) acc[key].add(result[key]);
  }
  const pmfs = Object.fromEntries(Object.entries(acc).map(([key, value]) => [key, value.finalize()]));
  const defaults = {
    hits: [0.5, 1.5, 2.5],
    totalBases: [0.5, 1.5, 2.5, 3.5],
    homeRuns: [0.5],
    strikeouts: [0.5, 1.5, 2.5],
    walks: [0.5, 1.5],
    singles: [0.5, 1.5],
    doubles: [0.5],
    triples: [0.5],
    runs: [0.5, 1.5],
    rbis: [0.5, 1.5]
  };
  const lines = { ...defaults, ...(input.lines ?? {}) };
  return {
    modelId: "sweet_bear_batter_game_mc_v1",
    authorization: "RESEARCH_ONLY",
    batter: { playerId: batter.playerId, name: batter.name, battingOrder: batter.battingOrder },
    simulations,
    pmfs,
    summaries: Object.fromEntries(Object.entries(pmfs).map(([key, pmf]) => [key, summarizePmf(pmf)])),
    markets: Object.fromEntries(Object.entries(lines).map(([key, values]) => [key, buildCountLadder(pmfs[key], values)])),
    limitations: ["Runs and RBIs are sequencing approximations until lineup-wide event simulation is validated."]
  };
}

module.exports = { predictBatterGame, simulateBatterGame, outcomeProbabilities };
