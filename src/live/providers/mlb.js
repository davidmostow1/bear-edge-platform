const { fetchJson } = require("../fetch-json.js");

const LIVE_GAME_STAT_GROUPS = Object.freeze({
  hitting: "batting",
  pitching: "pitching",
  fielding: "fielding"
});

function parseMlbAggregateSplit(splits, statKey) {
  if (!Array.isArray(splits) || splits.length === 0) {
    return null;
  }

  const split = splits[0];
  const rawValue = split?.stat?.[statKey];
  const gamesPlayed = split?.stat?.gamesPlayed;

  if (typeof rawValue !== "number" || typeof gamesPlayed !== "number" || gamesPlayed <= 0) {
    return null;
  }

  return {
    total: rawValue,
    gamesPlayed,
    perGame: rawValue / gamesPlayed
  };
}

function resolveLiveGameStatGroup(statGroup) {
  return LIVE_GAME_STAT_GROUPS[statGroup] ?? statGroup;
}

function readFiniteNumber(value) {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function liveGameTerminalStatus(detail) {
  const value = String(detail ?? "").toLowerCase();

  return value === "final" || value === "game over" || value === "completed early";
}

function liveGameInProgress(detail) {
  const value = String(detail ?? "").toLowerCase();

  return value.includes("in progress") || value.includes("manager challenge") || value.includes("review");
}

function computeRemainingOpportunityFactor(linescore, teamSide, gameStatusDetail) {
  const scheduledInnings = Number(linescore?.scheduledInnings ?? 9);
  const currentInning = Number(linescore?.currentInning ?? 0);
  const outs = Number(linescore?.outs ?? 0);
  const inningHalf = String(linescore?.inningHalf ?? linescore?.inningState ?? "").toLowerCase();

  if (!Number.isFinite(scheduledInnings) || scheduledInnings <= 0) {
    return 1;
  }

  if (liveGameTerminalStatus(gameStatusDetail)) {
    return 0;
  }

  if (!liveGameInProgress(gameStatusDetail) || !Number.isFinite(currentInning) || currentInning <= 0) {
    return 1;
  }

  let completedOffensiveInnings;

  if (teamSide === "away") {
    completedOffensiveInnings =
      inningHalf === "top"
        ? (currentInning - 1) + Math.min(1, Math.max(0, outs / 3))
        : currentInning;
  } else {
    completedOffensiveInnings =
      inningHalf === "bottom"
        ? (currentInning - 1) + Math.min(1, Math.max(0, outs / 3))
        : currentInning - 1;
  }

  const boundedCompleted = Math.min(scheduledInnings, Math.max(0, completedOffensiveInnings));
  return Math.max(0, Math.min(1, 1 - boundedCompleted / scheduledInnings));
}

function findLiveGamePlayer(liveFeedPayload, playerId) {
  const teams = liveFeedPayload?.liveData?.boxscore?.teams;

  for (const side of ["away", "home"]) {
    const player = teams?.[side]?.players?.[`ID${playerId}`];

    if (player) {
      return {
        side,
        player,
        teamName: liveFeedPayload?.gameData?.teams?.[side]?.name ?? null
      };
    }
  }

  return null;
}

function buildLiveGameContext(source, liveFeedPayload, liveSourceUrl) {
  const detail = liveFeedPayload?.gameData?.status?.detailedState ?? liveFeedPayload?.gameData?.status?.abstractGameState ?? null;
  const linescore = liveFeedPayload?.liveData?.linescore ?? null;
  const match = findLiveGamePlayer(liveFeedPayload, source.playerId);

  if (!match) {
    throw new Error(`MLB live feed did not return player ${source.playerId} for game ${source.gamePk}.`);
  }

  const liveStatGroup = resolveLiveGameStatGroup(source.statGroup);
  const currentStatBlock = match.player?.stats?.[liveStatGroup] ?? {};
  const currentValue = readFiniteNumber(currentStatBlock?.[source.statKey]) ?? 0;

  return {
    gamePk: source.gamePk,
    sourceUrl: liveSourceUrl,
    fetchedAt: new Date().toISOString(),
    status: detail,
    isInProgress: liveGameInProgress(detail),
    isFinal: liveGameTerminalStatus(detail),
    playerName: match.player?.person?.fullName ?? null,
    teamName: match.teamName,
    teamSide: match.side,
    statGroup: liveStatGroup,
    statKey: source.statKey,
    currentValue,
    playerGameStatus: match.player?.gameStatus ?? null,
    currentInning: readFiniteNumber(linescore?.currentInning),
    inningHalf: linescore?.inningHalf ?? linescore?.inningState ?? null,
    outs: readFiniteNumber(linescore?.outs),
    scheduledInnings: readFiniteNumber(linescore?.scheduledInnings) ?? 9,
    remainingOpportunityFactor: computeRemainingOpportunityFactor(linescore, match.side, detail)
  };
}

async function fetchMlbPlayerPropSnapshot(source, options = {}) {
  const { playerId, statGroup = "hitting", statKey, recentLimit = 10, gamePk = null } = source;

  if (!playerId || !statKey) {
    throw new Error("MLB source requires playerId and statKey.");
  }

  const fetchJsonImpl = options.fetchJsonImpl ?? fetchJson;
  const sourceUrl =
    `https://statsapi.mlb.com/api/v1/people/${playerId}/stats` +
    `?stats=season,lastXGames&group=${encodeURIComponent(statGroup)}` +
    `&sportId=1&limit=${encodeURIComponent(String(recentLimit))}`;
  const payload = await fetchJsonImpl(sourceUrl);
  const stats = Array.isArray(payload.stats) ? payload.stats : [];
  const seasonBlock = stats.find((entry) => entry?.type?.displayName === "season");
  const recentBlock = stats.find((entry) => entry?.type?.displayName === "lastXGames");
  const season = parseMlbAggregateSplit(seasonBlock?.splits, statKey);
  const recent = parseMlbAggregateSplit(recentBlock?.splits, statKey);
  const split = seasonBlock?.splits?.[0] ?? recentBlock?.splits?.[0] ?? null;
  let liveGame = null;

  if (gamePk) {
    const liveSourceUrl = `https://statsapi.mlb.com/api/v1.1/game/${encodeURIComponent(String(gamePk))}/feed/live`;
    const liveFeedPayload = await fetchJsonImpl(liveSourceUrl);
    liveGame = buildLiveGameContext(
      {
        playerId,
        statGroup,
        statKey,
        gamePk
      },
      liveFeedPayload,
      liveSourceUrl
    );
  }

  if (!split || !season) {
    throw new Error(`MLB source did not return usable ${statKey} stats for player ${playerId}.`);
  }

  return {
    provider: "mlb",
    official: true,
    sourceType: "official-api",
    sourceUrl,
    fetchedAt: new Date().toISOString(),
    playerId,
    playerName: liveGame?.playerName ?? split.player?.fullName ?? null,
    teamName: liveGame?.teamName ?? split.team?.name ?? null,
    statGroup,
    statKey,
    recentLimit,
    season,
    recent: recent ?? season,
    liveGame
  };
}

function normalizeMlbRosterPlayer(entry) {
  const position = entry?.position ?? {};

  return {
    id: entry?.person?.id ?? null,
    name: entry?.person?.fullName ?? null,
    jerseyNumber: entry?.jerseyNumber ?? null,
    positionName: position.name ?? null,
    positionType: position.type ?? null,
    positionAbbreviation: position.abbreviation ?? null,
    status: entry?.status?.description ?? entry?.status?.code ?? null
  };
}

function isMlbBatter(player) {
  return (
    player.id &&
    player.name &&
    player.positionAbbreviation !== "P" &&
    player.positionType !== "Pitcher"
  );
}

async function fetchMlbRoster(teamId, options = {}) {
  if (!teamId) {
    throw new Error("MLB roster source requires teamId.");
  }

  const fetchJsonImpl = options.fetchJsonImpl ?? fetchJson;
  const sourceUrl =
    `https://statsapi.mlb.com/api/v1/teams/${encodeURIComponent(String(teamId))}/roster` +
    "?rosterType=active";
  const payload = await fetchJsonImpl(sourceUrl);
  const players = Array.isArray(payload?.roster) ? payload.roster.map(normalizeMlbRosterPlayer) : [];

  return {
    provider: "mlb",
    official: true,
    sourceType: "official-api",
    sourceUrl,
    fetchedAt: new Date().toISOString(),
    teamId,
    players,
    batters: players.filter(isMlbBatter)
  };
}

module.exports = {
  fetchMlbPlayerPropSnapshot,
  fetchMlbRoster
};
