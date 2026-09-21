// @ts-nocheck
const { clamp, shrinkRate } = require("./math.js");

const DEFAULT_LEAGUE = Object.freeze({
  kRate: 0.225,
  walkRate: 0.085,
  hitRate: 0.242,
  hrRate: 0.031,
  doublePerHit: 0.205,
  triplePerHit: 0.018,
  pitchesPerPa: 3.89,
  runsPerGame: 4.45,
  runsAllowedPerNine: 4.45,
  bullpenRunsAllowedPerNine: 4.35
});

function observedRate(profile, key, countKey, opportunityKey, fallback, priorStrength) {
  const direct = Number(profile?.[key]);
  const successes = Number(profile?.sample?.[countKey]);
  const opportunities = Number(profile?.sample?.[opportunityKey]);
  if (Number.isFinite(successes) && Number.isFinite(opportunities) && opportunities > 0) {
    return shrinkRate(successes, opportunities, fallback, priorStrength);
  }
  if (Number.isFinite(direct)) return clamp(direct, 0.001, 0.95);
  return fallback;
}

function normalizeBatter(profile = {}, league = DEFAULT_LEAGUE) {
  return {
    playerId: String(profile.playerId ?? profile.id ?? profile.name ?? "unknown-batter"),
    name: String(profile.name ?? profile.playerId ?? "Unknown Batter"),
    batSide: String(profile.batSide ?? profile.hand ?? "R").toUpperCase(),
    battingOrder: Math.max(1, Math.min(9, Number(profile.battingOrder) || 5)),
    kRate: observedRate(profile, "kRate", "strikeouts", "plateAppearances", league.kRate, 180),
    walkRate: observedRate(profile, "walkRate", "walks", "plateAppearances", league.walkRate, 220),
    hitRate: observedRate(profile, "hitRate", "hits", "atBats", league.hitRate, 260),
    hrRate: observedRate(profile, "hrRate", "homeRuns", "plateAppearances", league.hrRate, 300),
    doublePerHit: clamp(Number(profile.doublePerHit ?? league.doublePerHit), 0.02, 0.5),
    triplePerHit: clamp(Number(profile.triplePerHit ?? league.triplePerHit), 0, 0.12),
    runRateOnReach: clamp(Number(profile.runRateOnReach ?? 0.31), 0.05, 0.75),
    rbiRateOnContact: clamp(Number(profile.rbiRateOnContact ?? 0.13), 0.01, 0.6)
  };
}

function normalizePitcher(profile = {}, league = DEFAULT_LEAGUE) {
  return {
    playerId: String(profile.playerId ?? profile.id ?? profile.name ?? "unknown-pitcher"),
    name: String(profile.name ?? profile.playerId ?? "Unknown Pitcher"),
    throwSide: String(profile.throwSide ?? profile.hand ?? "R").toUpperCase(),
    kRate: observedRate(profile, "kRate", "strikeouts", "battersFaced", league.kRate, 220),
    walkRate: observedRate(profile, "walkRate", "walks", "battersFaced", league.walkRate, 260),
    hitRate: observedRate(profile, "hitRate", "hits", "battersFaced", league.hitRate, 300),
    hrRate: observedRate(profile, "hrRate", "homeRuns", "battersFaced", league.hrRate, 340),
    pitchesPerPa: clamp(Number(profile.pitchesPerPa ?? league.pitchesPerPa), 2.7, 5.2),
    pitchLimit: clamp(Number(profile.pitchLimit ?? 95), 45, 125),
    expectedBattersFaced: clamp(Number(profile.expectedBattersFaced ?? 23), 8, 36),
    expectedInnings: clamp(Number(profile.expectedInnings ?? 5.4), 1, 9),
    runsAllowedPerNine: clamp(Number(profile.runsAllowedPerNine ?? league.runsAllowedPerNine), 1.5, 8),
    timesThroughOrderKMultipliers: Array.isArray(profile.timesThroughOrderKMultipliers)
      ? profile.timesThroughOrderKMultipliers.map((value) => clamp(Number(value) || 1, 0.65, 1.25))
      : [1, 0.94, 0.86, 0.8]
  };
}

function normalizeBullpen(profile = {}, league = DEFAULT_LEAGUE) {
  return {
    kRate: clamp(Number(profile.kRate ?? league.kRate), 0.08, 0.4),
    walkRate: clamp(Number(profile.walkRate ?? league.walkRate), 0.03, 0.2),
    hitRate: clamp(Number(profile.hitRate ?? league.hitRate), 0.15, 0.35),
    hrRate: clamp(Number(profile.hrRate ?? league.hrRate), 0.01, 0.08),
    runsAllowedPerNine: clamp(Number(profile.runsAllowedPerNine ?? league.bullpenRunsAllowedPerNine), 2, 7)
  };
}

module.exports = { DEFAULT_LEAGUE, normalizeBatter, normalizePitcher, normalizeBullpen };
