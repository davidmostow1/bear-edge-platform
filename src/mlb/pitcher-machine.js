// @ts-nocheck
const { createRng, clamp, combineLog5, logistic, sampleCategorical } = require("./math.js");
const { createCountAccumulator, summarizePmf, buildCountLadder } = require("./distributions.js");
const { DEFAULT_LEAGUE, normalizeBatter, normalizePitcher } = require("./profiles.js");

function matchupProbabilities(pitcher, batter, league, trip, outingState) {
  const ttoMultiplier = pitcher.timesThroughOrderKMultipliers[Math.min(trip - 1, pitcher.timesThroughOrderKMultipliers.length - 1)] ?? 0.8;
  const handedness = pitcher.throwSide === batter.batSide ? 1.035 : 0.975;
  const k = clamp(combineLog5(pitcher.kRate, batter.kRate, league.kRate) * ttoMultiplier * handedness * Math.exp(0.14 * outingState), 0.03, 0.6);
  const walk = clamp(combineLog5(pitcher.walkRate, batter.walkRate, league.walkRate) * Math.exp(-0.05 * outingState), 0.015, 0.25);
  const hr = clamp(combineLog5(pitcher.hrRate, batter.hrRate, league.hrRate) * Math.exp(-0.06 * outingState), 0.003, 0.15);
  const hit = clamp(combineLog5(pitcher.hitRate, batter.hitRate, league.hitRate) * Math.exp(-0.045 * outingState), hr + 0.03, 0.48);
  const nonHrHit = Math.max(0.005, hit - hr);
  const total = k + walk + hr + nonHrHit;
  const scale = total > 0.91 ? 0.91 / total : 1;
  return { k: k * scale, walk: walk * scale, hr: hr * scale, nonHrHit: nonHrHit * scale };
}

function advanceRunners(state, outcome, hitType, rng) {
  let runs = 0;
  if (outcome === "BB") {
    if (state.first && state.second && state.third) runs += 1;
    state.third = state.third || (state.first && state.second);
    state.second = state.second || state.first;
    state.first = true;
  } else if (outcome === "HR") {
    runs += 1 + Number(state.first) + Number(state.second) + Number(state.third);
    state.first = false;
    state.second = false;
    state.third = false;
  } else if (outcome === "H") {
    if (hitType === 1) {
      runs += Number(state.third);
      const secondWasOccupied = state.second;
      const firstWasOccupied = state.first;
      state.third = secondWasOccupied && rng.uniform() >= 0.58;
      if (secondWasOccupied && !state.third) runs += 1;
      if (firstWasOccupied && rng.uniform() < 0.33) state.third = true;
      state.second = firstWasOccupied && !state.third;
      state.first = true;
    } else if (hitType === 2) {
      runs += Number(state.third) + Number(state.second);
      const firstScores = state.first && rng.uniform() < 0.55;
      if (firstScores) runs += 1;
      state.third = state.first && !firstScores;
      state.second = true;
      state.first = false;
    } else {
      runs += Number(state.first) + Number(state.second) + Number(state.third);
      state.first = false;
      state.second = false;
      state.third = true;
    }
  }
  return runs;
}

function simulateOuting({ rng, pitcher, lineup, league }) {
  const outingState = rng.normal();
  const bases = { first: false, second: false, third: false };
  let strikeouts = 0;
  let walks = 0;
  let hits = 0;
  let earnedRuns = 0;
  let outs = 0;
  let battersFaced = 0;
  let pitches = 0;
  let removed = false;
  while (!removed && outs < 27 && battersFaced < 45) {
    const batter = lineup[battersFaced % lineup.length];
    const trip = Math.floor(battersFaced / lineup.length) + 1;
    const probabilities = matchupProbabilities(pitcher, batter, league, trip, outingState);
    const outcome = sampleCategorical(rng, [
      { value: "K", weight: probabilities.k },
      { value: "BB", weight: probabilities.walk },
      { value: "HR", weight: probabilities.hr },
      { value: "H", weight: probabilities.nonHrHit },
      { value: "OUT", weight: Math.max(0.001, 1 - probabilities.k - probabilities.walk - probabilities.hr - probabilities.nonHrHit) }
    ]);
    battersFaced += 1;
    let hitType = 0;
    if (outcome === "K") {
      strikeouts += 1;
      outs += 1;
    } else if (outcome === "OUT") {
      outs += 1;
    } else if (outcome === "BB") {
      walks += 1;
    } else if (outcome === "HR") {
      hits += 1;
      hitType = 4;
    } else {
      hits += 1;
      const draw = rng.uniform();
      hitType = draw < batter.triplePerHit ? 3 : draw < batter.triplePerHit + batter.doublePerHit ? 2 : 1;
    }
    earnedRuns += advanceRunners(bases, outcome, hitType, rng);
    const pitchAdjustment = outcome === "K" ? 0.9 : outcome === "BB" ? 1.15 : outcome === "OUT" ? -0.2 : 0.15;
    pitches += Math.max(1, Math.round(pitcher.pitchesPerPa + pitchAdjustment + 0.85 * rng.normal()));
    const pitchRatio = pitches / pitcher.pitchLimit;
    const ttoPressure = Math.max(0, trip - 1);
    const inningBoundary = outs > 0 && outs % 3 === 0 ? 0.65 : 0;
    const hazardLogit = -8.2 + 8.4 * pitchRatio + 0.58 * ttoPressure + 0.26 * earnedRuns + inningBoundary - 0.72 * outingState;
    const forced = pitches >= pitcher.pitchLimit * 1.08 || (outs >= 9 && earnedRuns >= 7);
    removed = forced || (outs >= 6 && rng.uniform() < logistic(hazardLogit));
  }
  return { strikeouts, walks, hitsAllowed: hits, earnedRuns, outsRecorded: outs, battersFaced, pitches };
}

function predictPitcherStart(input) {
  const league = { ...DEFAULT_LEAGUE, ...(input.league ?? {}) };
  const pitcher = normalizePitcher(input.pitcher, league);
  const lineup = (input.lineup ?? []).map((batter) => normalizeBatter(batter, league));
  if (lineup.length < 9) throw new RangeError("pitcher prediction requires a nine-player opposing lineup");
  const simulations = Math.max(100, Math.floor(input.simulations ?? 10000));
  const rng = createRng(input.seed ?? `${pitcher.playerId}-pitcher`);
  const acc = {
    strikeouts: createCountAccumulator(20),
    outsRecorded: createCountAccumulator(27),
    hitsAllowed: createCountAccumulator(20),
    walks: createCountAccumulator(15),
    earnedRuns: createCountAccumulator(15),
    battersFaced: createCountAccumulator(45),
    pitches: createCountAccumulator(140)
  };
  for (let i = 0; i < simulations; i += 1) {
    const result = simulateOuting({ rng, pitcher, lineup, league });
    for (const key of Object.keys(acc)) acc[key].add(result[key]);
  }
  const pmfs = Object.fromEntries(Object.entries(acc).map(([key, value]) => [key, value.finalize()]));
  const defaultLines = {
    strikeouts: [3.5, 4.5, 5.5, 6.5, 7.5],
    outsRecorded: [14.5, 15.5, 16.5, 17.5],
    hitsAllowed: [3.5, 4.5, 5.5],
    walks: [1.5, 2.5],
    earnedRuns: [1.5, 2.5, 3.5]
  };
  const lines = { ...defaultLines, ...(input.lines ?? {}) };
  return {
    modelId: "sweet_bear_pitcher_outing_mc_v1",
    authorization: "RESEARCH_ONLY",
    pitcher: { playerId: pitcher.playerId, name: pitcher.name },
    simulations,
    pmfs,
    summaries: Object.fromEntries(Object.entries(pmfs).map(([key, pmf]) => [key, summarizePmf(pmf)])),
    markets: Object.fromEntries(Object.entries(lines).filter(([key]) => pmfs[key]).map(([key, values]) => [key, buildCountLadder(pmfs[key], values)]))
  };
}

module.exports = { predictPitcherStart, simulateOuting, matchupProbabilities };
