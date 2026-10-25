'use strict';

// Additive, self-contained proposal. Not registered in the live decision engine.
// The output is ALWAYS research-only. Never use this as an execution service.
const PLAYER_STATS = Object.freeze({
  player_points: ['points'],
  player_rebounds: ['rebounds'],
  player_assists: ['assists'],
  player_threes: ['threes'],
  player_steals: ['steals'],
  player_blocks: ['blocks'],
  player_turnovers: ['turnovers'],
  player_points_rebounds: ['points', 'rebounds'],
  player_points_assists: ['points', 'assists'],
  player_rebounds_assists: ['rebounds', 'assists'],
  player_points_rebounds_assists: ['points', 'rebounds', 'assists'],
  player_steals_blocks: ['steals', 'blocks']
});
const PERIODS = Object.freeze(['full_game', 'first_half', 'first_quarter', 'second_half', 'second_quarter', 'third_quarter', 'fourth_quarter']);
const SPECIAL_PLAYER_MARKETS = Object.freeze(['player_double_double', 'player_triple_double']);
const GAME_MARKETS = Object.freeze(['game_total', 'team_total', 'game_spread', 'moneyline']);
const ALL_MARKETS = Object.freeze([...Object.keys(PLAYER_STATS), ...SPECIAL_PLAYER_MARKETS, ...GAME_MARKETS]);

function assert(condition, message) {
  if (!condition) throw new Error(message);
}
function requireCount(value, name) {
  assert(Number.isSafeInteger(value) && value >= 0, `${name} must be a nonnegative safe integer`);
  return value;
}
function requireIso(value, name) {
  // Date.parse silently normalizes impossible dates (e.g. February 31).
  const parts = typeof value === 'string'
    ? /^(\d{4})-(\d{2})-(\d{2})T([01]\d|2[0-3]):([0-5]\d):([0-5]\d)(?:\.\d{1,3})?(Z|[+-](?:0\d|1[0-4]):[0-5]\d)$/.exec(value)
    : null;
  assert(parts, `${name} must be a valid explicit-timezone ISO datetime`);
  const year = Number(parts[1]);
  const month = Number(parts[2]);
  const day = Number(parts[3]);
  const calendarDate = new Date(Date.UTC(year, month - 1, day));
  assert(calendarDate.getUTCFullYear() === year &&
    calendarDate.getUTCMonth() === month - 1 &&
    calendarDate.getUTCDate() === day, `${name} must be a real calendar date`);
  const timestamp = Date.parse(value);
  assert(Number.isFinite(timestamp), `${name} must have a valid timestamp`);
  return timestamp;
}
function validateMarket(market) {
  assert(market && typeof market === 'object', 'market required');
  assert(typeof market.eventId === 'string' && market.eventId.trim(), 'eventId required');
  assert(ALL_MARKETS.includes(market.marketType), 'unsupported marketType; no inferred provider coverage');
  assert(PERIODS.includes(market.period), 'explicit period required');
  assert(typeof market.overtimeIncluded === 'boolean', 'explicit overtimeIncluded required from exact contract rules');
  assert(market.period === 'full_game' || !market.overtimeIncluded, 'partial periods cannot include overtime');
  assert(typeof market.contractRuleId === 'string' && market.contractRuleId.trim(), 'contractRuleId required');
  const player = Object.hasOwn(PLAYER_STATS, market.marketType) || SPECIAL_PLAYER_MARKETS.includes(market.marketType);
  if (player) assert(typeof market.playerId === 'string' && market.playerId.trim(), 'playerId required');
  if (market.marketType === 'team_total') assert(['home', 'away'].includes(market.team), 'team_total requires team');
  if (market.marketType === 'moneyline' || market.marketType === 'game_spread') {
    assert(['home', 'away'].includes(market.side), 'game side must be home or away');
    if (market.marketType === 'moneyline') assert(market.period === 'full_game' && market.overtimeIncluded, 'only full-game including-OT moneyline supported');
    if (market.marketType === 'game_spread') assert(typeof market.line === 'number' && Number.isFinite(market.line), 'signed handicap line required');
  } else if (SPECIAL_PLAYER_MARKETS.includes(market.marketType)) {
    assert(['yes','no'].includes(market.side), 'double/triple-double requires yes or no');
  } else {
    assert(['over', 'under'].includes(market.side), 'total props require over or under');
    assert(typeof market.line === 'number' && Number.isFinite(market.line) && market.line >= 0, 'finite nonnegative line required');
  }
  return player;
}
function selectStats(path, market) {
  assert(path && typeof path === 'object', 'simulation path required');
  const root = market.period === 'full_game' ? path : path.periods?.[market.period];
  assert(root && typeof root === 'object', `missing ${market.period} simulation segment`);
  if (Object.hasOwn(PLAYER_STATS, market.marketType) || SPECIAL_PLAYER_MARKETS.includes(market.marketType)) {
    assert(root.players && Object.hasOwn(root.players, market.playerId), `missing simulated player ${market.playerId}`);
    const stats = root.players[market.playerId];
    assert(stats && typeof stats === 'object', `missing simulated player ${market.playerId}`);
    return stats;
  }
  assert(root.game && Object.hasOwn(root, 'game') && typeof root.game === 'object', 'missing simulated game scores');
  return root.game;
}
function resolveValue(path, market) {
  const stats = selectStats(path, market);
  if (Object.hasOwn(PLAYER_STATS, market.marketType)) {
    return PLAYER_STATS[market.marketType].reduce((total, key) =>
      total + requireCount(Object.hasOwn(stats, key) ? stats[key] : undefined, key), 0);
  }
  if (SPECIAL_PLAYER_MARKETS.includes(market.marketType)) {
    const doubles = ['points', 'rebounds', 'assists', 'steals', 'blocks']
      .filter(key => requireCount(Object.hasOwn(stats, key) ? stats[key] : undefined, key) >= 10).length;
    return doubles >= (market.marketType === 'player_double_double' ? 2 : 3) ? 1 : 0;
  }
  const home = requireCount(Object.hasOwn(stats, 'homePoints') ? stats.homePoints : undefined, 'homePoints');
  const away = requireCount(Object.hasOwn(stats, 'awayPoints') ? stats.awayPoints : undefined, 'awayPoints');
  if (market.marketType === 'game_total') return home + away;
  if (market.marketType === 'team_total') return market.team === 'home' ? home : away;
  return market.side === 'home' ? home - away : away - home;
}
function grade(value, market) {
  if (SPECIAL_PLAYER_MARKETS.includes(market.marketType)) return Boolean(value) === (market.side === 'yes') ? 'win' : 'loss';
  if (market.marketType === 'moneyline') {
    assert(value !== 0, 'full-game moneyline simulation ended tied; invalid path');
    return value > 0 ? 'win' : 'loss';
  }
  let margin;
  if (market.marketType === 'game_spread') margin = value + market.line;
  else margin = market.side === 'over' ? value - market.line : market.line - value;
  return margin > 0 ? 'win' : margin < 0 ? 'loss' : 'push';
}
function wilsonInterval(wins, trials, z=1.959963984540054) {
  // Interval is simulation sampling error only. It excludes all model/feature uncertainty.
  const p = wins / trials;
  const zz = z*z;
  const denom = 1+zz/trials;
  const mid = (p + zz/(2*trials))/denom;
  const half = z*Math.sqrt(p*(1-p)/trials+zz/(4*trials*trials))/denom;
  return [Math.max(0,mid-half),Math.min(1,mid+half)];
}
function evaluateShadowPaths({market, paths, provenance}) {
  validateMarket(market);
  assert(provenance && typeof provenance === 'object', 'provenance required');
  const cutoff = requireIso(provenance.featureAvailableAt, 'featureAvailableAt');
  const prediction = requireIso(provenance.predictionAt, 'predictionAt');
  const start = requireIso(provenance.eventStartAt, 'eventStartAt');
  assert(cutoff <= prediction && prediction < start, 'point-in-time ordering violated');
  assert(typeof provenance.modelId === 'string' && provenance.modelId.trim(), 'modelId required');
  assert(['synthetic_fixture','frozen_model'].includes(provenance.sampleOrigin), 'sampleOrigin required');
  assert(Array.isArray(paths) && paths.length > 0 && paths.length <= 100000, '1..100000 paired simulation paths required');
  if (provenance.sampleOrigin === 'frozen_model') {
    // Caller-supplied digests are required for traceability, not authenticated here.
    for (const field of ['implementationDigest', 'featureSnapshotDigest']) {
      assert(typeof provenance[field] === 'string' && /^[a-f0-9]{64}$/i.test(provenance[field]),
        `frozen_model requires ${field} SHA-256`);
    }
    for (const path of paths) {
      assert(path && path.eventId === market.eventId, 'frozen_model simulation eventId mismatch');
      assert(path.overtimeIncluded === market.overtimeIncluded, 'frozen_model overtime inclusion is missing or mismatched');
      if (market.period !== 'full_game') {
        assert(path.periods?.[market.period]?.period === market.period, 'frozen_model period tag missing or mismatched');
      }
    }
  }
  const counts = {win:0, loss:0, push:0};
  for (const path of paths) counts[grade(resolveValue(path, market), market)]++;
  const n = paths.length;
  const pWin = counts.win/n;
  const pPush = counts.push/n;
  const pLoss = counts.loss/n;
  return Object.freeze({
    authorization:'RESEARCH_ONLY', verdict:'NO_WAGER_AUTHORITY', authorizedStakeUsd:0,
    executionEnabled:false, modelStatus:'research_only',
    eventId:market.eventId, marketType:market.marketType, period:market.period,
    contractRuleId:market.contractRuleId, sampleOrigin:provenance.sampleOrigin,
    modelId:provenance.modelId, nSimulationPaths:n, counts,
    rawSimulationWinProbability:pWin, rawSimulationPushProbability:pPush,
    rawSimulationLossProbability:pLoss,
    mcOnlyWinInterval95:wilsonInterval(counts.win,n),
    warnings:[
      'Simulation output is not calibrated probability or demonstrated model edge.',
      'Monte Carlo interval excludes injury, lineup, model, source and parameter uncertainty.',
      'No price, quote authentication, order-book fees, staking or execution path is provided.'
    ]
  });
}
module.exports={PLAYER_STATS,PERIODS,SPECIAL_PLAYER_MARKETS,GAME_MARKETS,ALL_MARKETS,validateMarket,evaluateShadowPaths};
