const { fetchJson } = require("../fetch-json.js");

function playerName(player) {
  return [player?.firstName?.default, player?.lastName?.default].filter(Boolean).join(" ") || null;
}

function computeAverageFromGames(games, statKey, limit) {
  if (!Array.isArray(games) || games.length === 0) {
    return null;
  }

  const filtered = games.slice(0, limit).filter((game) => typeof game?.[statKey] === "number");

  if (filtered.length === 0) {
    return null;
  }

  const total = filtered.reduce((sum, game) => sum + game[statKey], 0);

  return {
    total,
    gamesPlayed: filtered.length,
    perGame: total / filtered.length
  };
}

async function fetchNhlRoster(teamAbbreviation, options = {}) {
  if (!teamAbbreviation) {
    throw new Error("NHL roster source requires teamAbbreviation.");
  }

  const fetchJsonImpl = options.fetchJsonImpl ?? fetchJson;
  const normalizedTeam = String(teamAbbreviation).trim().toUpperCase();
  const sourceUrl = `https://api-web.nhle.com/v1/roster/${encodeURIComponent(normalizedTeam)}/current`;
  const payload = await fetchJsonImpl(sourceUrl);
  const groups = [
    ["forwards", "forward"],
    ["defensemen", "defense"],
    ["goalies", "goalie"]
  ];
  const players = [];

  for (const [payloadKey, groupName] of groups) {
    const items = Array.isArray(payload?.[payloadKey]) ? payload[payloadKey] : [];

    for (const player of items) {
      players.push({
        id: player?.id ?? null,
        name: playerName(player),
        teamAbbreviation: normalizedTeam,
        positionGroup: groupName,
        positionCode: player?.positionCode ?? null,
        sweaterNumber: player?.sweaterNumber ?? null
      });
    }
  }

  return {
    provider: "nhl",
    official: true,
    sourceType: "official-api",
    sourceUrl,
    fetchedAt: new Date().toISOString(),
    teamAbbreviation: normalizedTeam,
    players: players.filter((player) => player.id && player.name)
  };
}

async function fetchNhlPlayerPropSnapshot(source, options = {}) {
  const { playerId, statKey, recentLimit = 5 } = source;

  if (!playerId || !statKey) {
    throw new Error("NHL source requires playerId and statKey.");
  }

  const fetchJsonImpl = options.fetchJsonImpl ?? fetchJson;
  const sourceUrl = `https://api-web.nhle.com/v1/player/${playerId}/landing`;
  const payload = await fetchJsonImpl(sourceUrl);
  const seasonStats = payload?.featuredStats?.regularSeason?.subSeason;
  const seasonGamesPlayed = seasonStats?.gamesPlayed;
  const seasonValue = seasonStats?.[statKey];

  if (typeof seasonValue !== "number" || typeof seasonGamesPlayed !== "number" || seasonGamesPlayed <= 0) {
    throw new Error(`NHL source did not return usable ${statKey} stats for player ${playerId}.`);
  }

  const season = {
    total: seasonValue,
    gamesPlayed: seasonGamesPlayed,
    perGame: seasonValue / seasonGamesPlayed
  };
  const recent = computeAverageFromGames(payload?.last5Games, statKey, recentLimit) ?? season;

  return {
    provider: "nhl",
    official: true,
    sourceType: "official-api",
    sourceUrl,
    fetchedAt: new Date().toISOString(),
    playerId,
    playerName: [payload?.firstName?.default, payload?.lastName?.default].filter(Boolean).join(" ") || null,
    teamName: payload?.fullTeamName?.default ?? null,
    statKey,
    recentLimit,
    season,
    recent
  };
}

module.exports = {
  fetchNhlRoster,
  fetchNhlPlayerPropSnapshot
};
