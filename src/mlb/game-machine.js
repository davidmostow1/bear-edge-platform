// @ts-nocheck
const { createRng, clamp, samplePoisson } = require("./math.js");
const { createCountAccumulator, summarizePmf } = require("./distributions.js");
const { DEFAULT_LEAGUE, normalizePitcher, normalizeBullpen } = require("./profiles.js");

function expectedRuns(team, opponent, league, innings) {
  const offense = clamp(Number(team.offense?.runsPerGame ?? league.runsPerGame), 2.5, 7);
  const starter = normalizePitcher(opponent.starter, league);
  const bullpen = normalizeBullpen(opponent.bullpen, league);
  const starterInnings = Math.min(innings, starter.expectedInnings);
  const bullpenInnings = Math.max(0, innings - starterInnings);
  const prevention = (starter.runsAllowedPerNine * starterInnings + bullpen.runsAllowedPerNine * bullpenInnings) / Math.max(1, innings);
  const park = clamp(Number(team.parkRunFactor ?? 1), 0.8, 1.25);
  return clamp((offense / 9) * innings * (prevention / league.runsAllowedPerNine) * park, 0.2, 12);
}

function settleScalar(value, line, side) {
  if (value === line) return "push";
  return side === "over" ? (value > line ? "win" : "loss") : (value < line ? "win" : "loss");
}

function resultFromCounts(counts, total) {
  const winProbability = counts.win / total;
  const pushProbability = counts.push / total;
  const lossProbability = counts.loss / total;
  const resolved = winProbability + lossProbability;
  return { winProbability, pushProbability, lossProbability, fairWinProbability: resolved ? winProbability / resolved : 0.5 };
}

function predictGameLines(input) {
  const league = { ...DEFAULT_LEAGUE, ...(input.league ?? {}) };
  const simulations = Math.max(500, Math.floor(input.simulations ?? 25000));
  const rng = createRng(input.seed ?? `${input.away?.team}-${input.home?.team}-game`);
  const means = {
    awayF5: expectedRuns(input.away, input.home, league, 5),
    homeF5: expectedRuns(input.home, input.away, league, 5),
    awayFull: expectedRuns(input.away, input.home, league, 9),
    homeFull: expectedRuns(input.home, input.away, league, 9)
  };
  const awayRuns = createCountAccumulator(20);
  const homeRuns = createCountAccumulator(20);
  const awayF5Runs = createCountAccumulator(15);
  const homeF5Runs = createCountAccumulator(15);
  const fullMoneyline = { away: 0, home: 0 };
  const f5Moneyline = { away: 0, home: 0, push: 0 };
  const requested = {
    runLines: input.lines?.runLines ?? [-2.5, -1.5, 1.5, 2.5],
    totals: input.lines?.totals ?? [6.5, 7.5, 8.5, 9.5, 10.5],
    teamTotals: input.lines?.teamTotals ?? [2.5, 3.5, 4.5, 5.5],
    firstFiveRunLines: input.lines?.firstFiveRunLines ?? [-1.5, 1.5],
    firstFiveTotals: input.lines?.firstFiveTotals ?? [3.5, 4.5, 5.5]
  };
  const buckets = {};
  const bucket = (key) => {
    if (!buckets[key]) buckets[key] = { win: 0, push: 0, loss: 0 };
    return buckets[key];
  };
  for (let i = 0; i < simulations; i += 1) {
    const shared = Math.exp(0.16 * rng.normal() - 0.5 * 0.16 ** 2);
    const awayTeamNoise = Math.exp(0.1 * rng.normal() - 0.5 * 0.1 ** 2);
    const homeTeamNoise = Math.exp(0.1 * rng.normal() - 0.5 * 0.1 ** 2);
    const af5 = samplePoisson(rng, means.awayF5 * shared * awayTeamNoise);
    const hf5 = samplePoisson(rng, means.homeF5 * shared * homeTeamNoise);
    let away = af5 + samplePoisson(rng, Math.max(0, means.awayFull - means.awayF5) * shared * awayTeamNoise);
    let home = hf5 + samplePoisson(rng, Math.max(0, means.homeFull - means.homeF5) * shared * homeTeamNoise);
    if (away === home) {
      for (let inning = 0; inning < 6 && away === home; inning += 1) {
        away += samplePoisson(rng, 0.48 * awayTeamNoise);
        home += samplePoisson(rng, 0.5 * homeTeamNoise);
      }
      if (away === home) {
        if (rng.uniform() < means.homeFull / (means.awayFull + means.homeFull)) home += 1;
        else away += 1;
      }
    }
    awayRuns.add(away);
    homeRuns.add(home);
    awayF5Runs.add(af5);
    homeF5Runs.add(hf5);
    if (away > home) fullMoneyline.away += 1;
    else fullMoneyline.home += 1;
    if (af5 > hf5) f5Moneyline.away += 1;
    else if (hf5 > af5) f5Moneyline.home += 1;
    else f5Moneyline.push += 1;

    for (const line of requested.runLines) {
      for (const team of ["away", "home"]) {
        const margin = team === "away" ? away - home : home - away;
        bucket(`full:runline:${team}:${line}`)[settleScalar(margin, -line, "over")] += 1;
      }
    }
    for (const line of requested.totals) {
      for (const side of ["over", "under"]) bucket(`full:total:${side}:${line}`)[settleScalar(away + home, line, side)] += 1;
    }
    for (const line of requested.teamTotals) {
      for (const team of ["away", "home"]) {
        for (const side of ["over", "under"]) {
          const value = team === "away" ? away : home;
          bucket(`full:teamTotal:${team}:${side}:${line}`)[settleScalar(value, line, side)] += 1;
        }
      }
    }
    for (const line of requested.firstFiveRunLines) {
      for (const team of ["away", "home"]) {
        const margin = team === "away" ? af5 - hf5 : hf5 - af5;
        bucket(`f5:runline:${team}:${line}`)[settleScalar(margin, -line, "over")] += 1;
      }
    }
    for (const line of requested.firstFiveTotals) {
      for (const side of ["over", "under"]) bucket(`f5:total:${side}:${line}`)[settleScalar(af5 + hf5, line, side)] += 1;
    }
  }
  const pmfs = {
    awayRuns: awayRuns.finalize(),
    homeRuns: homeRuns.finalize(),
    awayFirstFiveRuns: awayF5Runs.finalize(),
    homeFirstFiveRuns: homeF5Runs.finalize()
  };
  return {
    modelId: "sweet_bear_joint_game_score_mc_v1",
    authorization: "RESEARCH_ONLY",
    simulations,
    expectedRuns: means,
    pmfs,
    summaries: Object.fromEntries(Object.entries(pmfs).map(([key, pmf]) => [key, summarizePmf(pmf)])),
    moneyline: { away: fullMoneyline.away / simulations, home: fullMoneyline.home / simulations },
    firstFiveMoneyline: { away: f5Moneyline.away / simulations, home: f5Moneyline.home / simulations, push: f5Moneyline.push / simulations },
    markets: Object.fromEntries(Object.entries(buckets).map(([key, counts]) => [key, resultFromCounts(counts, simulations)]))
  };
}

module.exports = { predictGameLines, expectedRuns };
