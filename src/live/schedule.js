const { fetchJson } = require("./fetch-json.js");
const { resolveDateWindow } = require("./date-window.js");

const SUPPORTED_SPORTS = Object.freeze(["mlb", "nhl", "worldcup", "tennis"]);

function pad2(value) {
  return String(value).padStart(2, "0");
}

function formatDate(date) {
  return `${date.getFullYear()}-${pad2(date.getMonth() + 1)}-${pad2(date.getDate())}`;
}

function normalizeMlbTeam(rawTeam) {
  return {
    id: rawTeam?.team?.id ?? null,
    name: rawTeam?.team?.name ?? null,
    score: typeof rawTeam?.score === "number" ? rawTeam.score : null,
    wins: rawTeam?.leagueRecord?.wins ?? null,
    losses: rawTeam?.leagueRecord?.losses ?? null,
    probablePitcher: rawTeam?.probablePitcher
      ? {
          id: rawTeam.probablePitcher.id ?? null,
          name: rawTeam.probablePitcher.fullName ?? null
        }
      : null
  };
}

function normalizeNhlTeam(rawTeam) {
  return {
    id: rawTeam?.id ?? null,
    name: rawTeam?.name?.default ?? rawTeam?.abbrev ?? null,
    abbreviation: rawTeam?.abbrev ?? null,
    score: typeof rawTeam?.score === "number" ? rawTeam.score : null,
    shotsOnGoal: typeof rawTeam?.sog === "number" ? rawTeam.sog : null
  };
}

function normalizeEspnSoccerTeam(rawCompetitor) {
  const team = rawCompetitor?.team ?? {};

  return {
    id: team.id ?? rawCompetitor?.id ?? null,
    name: team.displayName ?? team.shortDisplayName ?? team.name ?? null,
    abbreviation: team.abbreviation ?? null,
    score: Number.isFinite(Number(rawCompetitor?.score)) ? Number(rawCompetitor.score) : null,
    record: rawCompetitor?.records?.[0]?.summary ?? null,
    form: rawCompetitor?.form ?? null,
    logo: team.logo ?? null
  };
}

async function fetchMlbGamesForDate(date, options = {}) {
  const fetchJsonImpl = options.fetchJsonImpl ?? fetchJson;
  const sourceUrl =
    `https://statsapi.mlb.com/api/v1/schedule?sportId=1&date=${encodeURIComponent(date)}` +
    "&hydrate=probablePitcher";
  const payload = await fetchJsonImpl(sourceUrl);
  const games = Array.isArray(payload?.dates?.[0]?.games) ? payload.dates[0].games : [];

  return {
    sport: "mlb",
    date,
    sourceUrl,
    official: true,
    games: games.map((game) => ({
      id: String(game.gamePk),
      sport: "mlb",
      date,
      gameDate: game.gameDate ?? null,
      status: game.status?.detailedState ?? game.status?.abstractGameState ?? "Unknown",
      state: game.status?.abstractGameState ?? null,
      venue: game.venue?.name ?? null,
      away: normalizeMlbTeam(game.teams?.away),
      home: normalizeMlbTeam(game.teams?.home),
      sourceUrl,
      official: true
    }))
  };
}

async function fetchNhlGamesForDate(date, options = {}) {
  const fetchJsonImpl = options.fetchJsonImpl ?? fetchJson;
  const sourceUrl = `https://api-web.nhle.com/v1/score/${encodeURIComponent(date)}`;
  const payload = await fetchJsonImpl(sourceUrl);
  const games = Array.isArray(payload?.games) ? payload.games : [];

  return {
    sport: "nhl",
    date,
    sourceUrl,
    official: true,
    games: games.map((game) => ({
      id: String(game.id),
      sport: "nhl",
      date: game.gameDate ?? date,
      gameDate: game.startTimeUTC ?? null,
      status: game.gameState ?? "Unknown",
      state: game.gameScheduleState ?? null,
      venue: game.venue?.default ?? null,
      away: normalizeNhlTeam(game.awayTeam),
      home: normalizeNhlTeam(game.homeTeam),
      sourceUrl,
      official: true
    }))
  };
}

async function fetchWorldCupGamesForDate(date, options = {}) {
  const fetchJsonImpl = options.fetchJsonImpl ?? fetchJson;
  const espnDate = date.replaceAll("-", "");
  const sourceUrl = `https://site.api.espn.com/apis/site/v2/sports/soccer/fifa.world/scoreboard?dates=${encodeURIComponent(espnDate)}`;
  const payload = await fetchJsonImpl(sourceUrl);
  const events = Array.isArray(payload?.events) ? payload.events : [];

  return {
    sport: "worldcup",
    date,
    sourceUrl,
    official: true,
    games: events.map((event) => {
      const competition = event?.competitions?.[0] ?? {};
      const competitors = Array.isArray(competition.competitors) ? competition.competitors : [];
      const awayCompetitor = competitors.find((competitor) => competitor.homeAway === "away") ?? competitors[1] ?? null;
      const homeCompetitor = competitors.find((competitor) => competitor.homeAway === "home") ?? competitors[0] ?? null;
      const status = competition.status?.type ?? event.status?.type ?? {};

      return {
        id: String(event.id ?? competition.id),
        sport: "worldcup",
        date,
        gameDate: event.date ?? competition.date ?? competition.startDate ?? null,
        status: status.description ?? status.detail ?? "Unknown",
        state: status.state ?? null,
        venue: competition.venue?.fullName ?? null,
        group: competition.altGameNote ?? null,
        away: normalizeEspnSoccerTeam(awayCompetitor),
        home: normalizeEspnSoccerTeam(homeCompetitor),
        sourceUrl,
        official: true
      };
    })
  };
}

async function fetchTennisGamesForDate(date, options = {}) {
  return {
    sport: "tennis",
    date,
    sourceUrl: null,
    official: false,
    games: [],
    warning: "No verified tennis schedule/stats provider is configured. Tennis remains manual-only until a provider key is added."
  };
}

async function fetchGamesForWindow(options = {}) {
  const days = Number.isInteger(options.days) && options.days > 0 ? Math.min(options.days, 7) : 2;
  const sports = Array.isArray(options.sports) && options.sports.length > 0 ? options.sports : SUPPORTED_SPORTS;
  const fetchedAt = new Date().toISOString();
  const dates = resolveDateWindow({
    date: options.date,
    days,
    now: options.now,
    timeZone: options.timeZone
  });
  const sources = [];
  const games = [];

  for (const date of dates) {
    for (const sport of sports) {
      if (!SUPPORTED_SPORTS.includes(sport)) {
        throw new Error(`Unsupported sport: ${sport}.`);
      }

      const result =
        sport === "mlb"
          ? await fetchMlbGamesForDate(date, options)
          : sport === "worldcup"
            ? await fetchWorldCupGamesForDate(date, options)
            : sport === "tennis"
              ? await fetchTennisGamesForDate(date, options)
              : await fetchNhlGamesForDate(date, options);

      sources.push({
        sport: result.sport,
        date: result.date,
        official: result.official,
        sourceUrl: result.sourceUrl,
        games: result.games.length,
        warning: result.warning ?? null
      });
      games.push(...result.games);
    }
  }

  return {
    fetchedAt,
    dates,
    sports,
    sources,
    games,
    totals: {
      games: games.length,
      inProgress: games.filter((game) => ["Live", "In Progress"].includes(game.status) || game.state === "Live" || game.state === "in").length,
      final: games.filter((game) => ["Final", "OFF"].includes(game.status) || game.state === "Final" || game.state === "post").length,
      scheduled: games.filter((game) => ["Scheduled", "Preview", "FUT"].includes(game.status) || game.state === "Preview" || game.state === "pre").length
    }
  };
}

module.exports = {
  SUPPORTED_SPORTS,
  fetchGamesForWindow,
  fetchMlbGamesForDate,
  fetchNhlGamesForDate,
  fetchTennisGamesForDate,
  fetchWorldCupGamesForDate,
  formatDate
};
