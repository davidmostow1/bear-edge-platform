// @ts-nocheck
const MLB_STATS_API = "https://statsapi.mlb.com";

async function fetchJson(url, fetchImpl = fetch) {
  const response = await fetchImpl(url, {
    headers: {
      accept: "application/json",
      "user-agent": "sweet-bear-mlb-research/1.0"
    }
  });
  if (!response.ok) throw new Error(`MLB Stats API ${response.status} for ${url}`);
  return response.json();
}

async function fetchSeasonSchedule(season, fetchImpl = fetch) {
  const url = `${MLB_STATS_API}/api/v1/schedule?sportId=1&season=${season}&gameTypes=R`;
  const payload = await fetchJson(url, fetchImpl);
  return (payload.dates ?? [])
    .flatMap((date) => date.games ?? [])
    .map((game) => ({
      gamePk: game.gamePk,
      gameDate: game.gameDate,
      status: game.status?.detailedState ?? null
    }));
}

async function fetchGameFeed(gamePk, fetchImpl = fetch) {
  return fetchJson(`${MLB_STATS_API}/api/v1.1/game/${gamePk}/feed/live`, fetchImpl);
}

module.exports = { MLB_STATS_API, fetchJson, fetchSeasonSchedule, fetchGameFeed };
