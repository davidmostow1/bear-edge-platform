const { fetchJson } = require("./fetch-json.js");
const { safeErrorMessage } = require("../config/secrets.js");
const { formatDate } = require("./schedule.js");

const AUTO_REFRESH_MS = 60 * 1000;
const ESPN_SPORTS = Object.freeze([
  { id: "mlb", label: "MLB", path: "baseball/mlb" },
  { id: "nhl", label: "NHL", path: "hockey/nhl" },
  { id: "worldcup", label: "FIFA World Cup", path: "soccer/fifa.world" },
  { id: "nba", label: "NBA", path: "basketball/nba" },
  { id: "nfl", label: "NFL", path: "football/nfl" }
]);
const DRAFTKINGS_DIRECT_ENDPOINTS = Object.freeze([
  "https://sportsbook-nash.draftkings.com/sites/US-SB/api/v5/eventgroups/84240?format=json",
  "https://sportsbook.draftkings.com/api/odds/v1/leagues/84240/offers/gamelines.json"
]);
const STAT_NEWS_SEARCH_URL =
  "https://www.statnews.com/?rest_route=/wp/v2/search&search=sports%20betting%20injury&per_page=5";
const STATMUSE_HOME_URL = "https://www.statmuse.com/";
const STATMUSE_SCORES_URL = "https://www.statmuse.com/scores";
const STATMUSE_QUERY_SPORTS = Object.freeze(["mlb", "nba", "nhl", "nfl", "wnba"]);
const TENNIS_ODDS_SPORT_KEYS = Object.freeze([
  "tennis_atp_aus_open_singles",
  "tennis_wta_aus_open_singles",
  "tennis_atp_french_open",
  "tennis_wta_french_open",
  "tennis_atp_wimbledon",
  "tennis_wta_wimbledon",
  "tennis_atp_us_open",
  "tennis_wta_us_open"
]);

function pad2(value) {
  return String(value).padStart(2, "0");
}

function addDays(date, days) {
  const nextDate = new Date(date);
  nextDate.setDate(nextDate.getDate() + days);
  return nextDate;
}

function parseDate(value) {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);

  if (!match) {
    throw new Error("Date must use YYYY-MM-DD format.");
  }

  const [, year, month, day] = match;
  return new Date(Number(year), Number(month) - 1, Number(day));
}

function resolveStartDate(value) {
  if (!value || value === "today") {
    return new Date();
  }

  if (value === "tomorrow") {
    return addDays(new Date(), 1);
  }

  return parseDate(value);
}

function formatEspnDate(date) {
  return `${date.getFullYear()}${pad2(date.getMonth() + 1)}${pad2(date.getDate())}`;
}

async function defaultFetchText(url) {
  const response = await fetch(url, {
    headers: {
      accept: "application/json,text/html;q=0.9,*/*;q=0.8",
      "user-agent": "bear-edge-betting-engine/1.0"
    }
  });
  const text = await response.text();

  return {
    ok: response.ok,
    status: response.status,
    statusText: response.statusText,
    contentType: response.headers.get("content-type") ?? "",
    text
  };
}

function sourceRecord({ provider, status, sourceType, fetchedAt, sources = [], summary = {}, warnings = [], error = null }) {
  return {
    provider,
    status,
    sourceType,
    fetchedAt,
    sources,
    summary,
    warnings,
    error
  };
}

function safeError(error) {
  return safeErrorMessage(error);
}

function extractEspnCompetitors(event) {
  const competition = event?.competitions?.[0];
  const competitors = Array.isArray(competition?.competitors) ? competition.competitors : [];

  return competitors
    .map((competitor) => ({
      teamId: competitor?.team?.id ?? null,
      teamName: competitor?.team?.displayName ?? competitor?.team?.name ?? null,
      homeAway: competitor?.homeAway ?? null
    }))
    .filter((team) => team.teamId && team.teamName);
}

function extractRosterAthleteCount(payload) {
  const groups = Array.isArray(payload?.athletes) ? payload.athletes : [];

  return groups.reduce((total, group) => total + (Array.isArray(group?.items) ? group.items.length : 0), 0);
}

function extractInjuryCount(payload) {
  const teams = Array.isArray(payload?.injuries) ? payload.injuries : [];

  return teams.reduce((total, team) => total + (Array.isArray(team?.injuries) ? team.injuries.length : 0), 0);
}

async function fetchEspnStatus(options = {}) {
  const fetchedAt = new Date().toISOString();
  const fetchJsonImpl = options.fetchJsonImpl ?? fetchJson;
  const dates = options.dates;
  const scoreboardSources = [];
  const warnings = [];
  const bySport = {};
  const mlbTeamIds = new Map();
  let eventCount = 0;

  for (const date of dates) {
    const espnDate = formatEspnDate(new Date(`${date}T00:00:00`));

    for (const sport of ESPN_SPORTS) {
      const sourceUrl = `https://site.api.espn.com/apis/site/v2/sports/${sport.path}/scoreboard?dates=${espnDate}`;

      try {
        const payload = await fetchJsonImpl(sourceUrl);
        const events = Array.isArray(payload?.events) ? payload.events : [];
        eventCount += events.length;
        bySport[sport.id] = (bySport[sport.id] ?? 0) + events.length;
        scoreboardSources.push({
          name: `${sport.label} scoreboard`,
          sourceUrl,
          date,
          count: events.length,
          timestamp: payload?.timestamp ?? null
        });

        if (sport.id === "mlb") {
          for (const event of events) {
            for (const team of extractEspnCompetitors(event)) {
              mlbTeamIds.set(team.teamId, team.teamName);
            }
          }
        }
      } catch (error) {
        warnings.push(`${sport.label} ESPN scoreboard failed for ${date}: ${safeError(error)}`);
      }
    }
  }

  let mlbTeamCount = null;
  let mlbInjuryCount = null;
  let rosterTeamsSampled = 0;
  let rosterAthletesSampled = 0;

  try {
    const sourceUrl = "https://site.api.espn.com/apis/site/v2/sports/baseball/mlb/teams";
    const payload = await fetchJsonImpl(sourceUrl);
    const teams = payload?.sports?.[0]?.leagues?.[0]?.teams;
    mlbTeamCount = Array.isArray(teams) ? teams.length : null;
    scoreboardSources.push({
      name: "MLB teams",
      sourceUrl,
      count: mlbTeamCount
    });
  } catch (error) {
    warnings.push(`ESPN MLB teams failed: ${safeError(error)}`);
  }

  try {
    const sourceUrl = "https://site.api.espn.com/apis/site/v2/sports/baseball/mlb/injuries";
    const payload = await fetchJsonImpl(sourceUrl);
    mlbInjuryCount = extractInjuryCount(payload);
    scoreboardSources.push({
      name: "MLB injuries",
      sourceUrl,
      count: mlbInjuryCount,
      timestamp: payload?.timestamp ?? null
    });
  } catch (error) {
    warnings.push(`ESPN MLB injuries failed: ${safeError(error)}`);
  }

  const maxRosterTeams = Number.isInteger(options.maxRosterTeams) ? options.maxRosterTeams : 6;
  const teamsToSample = Array.from(mlbTeamIds.entries()).slice(0, maxRosterTeams);

  for (const [teamId, teamName] of teamsToSample) {
    const sourceUrl = `https://site.api.espn.com/apis/site/v2/sports/baseball/mlb/teams/${encodeURIComponent(teamId)}/roster`;

    try {
      const payload = await fetchJsonImpl(sourceUrl);
      const athleteCount = extractRosterAthleteCount(payload);
      rosterTeamsSampled += 1;
      rosterAthletesSampled += athleteCount;
      scoreboardSources.push({
        name: `${teamName} roster`,
        sourceUrl,
        count: athleteCount,
        timestamp: payload?.timestamp ?? null
      });
    } catch (error) {
      warnings.push(`ESPN ${teamName} roster failed: ${safeError(error)}`);
    }
  }

  return sourceRecord({
    provider: "ESPN",
    status: eventCount > 0 && warnings.length === 0 ? "ok" : eventCount > 0 ? "degraded" : "unavailable",
    sourceType: "public ESPN JSON",
    fetchedAt,
    sources: scoreboardSources,
    summary: {
      eventCount,
      bySport,
      mlbTeamCount,
      mlbInjuryCount,
      rosterTeamsSampled,
      rosterAthletesSampled
    },
    warnings
  });
}

function parseDraftKingsPayload(text) {
  const parsed = JSON.parse(text);
  const eventCount =
    (Array.isArray(parsed?.events) ? parsed.events.length : 0) +
    (Array.isArray(parsed?.eventGroup?.events) ? parsed.eventGroup.events.length : 0);
  const offerCategories = parsed?.eventGroup?.offerCategories;
  const offerCount = Array.isArray(offerCategories)
    ? offerCategories.reduce((total, category) => {
        const offers = Array.isArray(category?.offerSubcategoryDescriptors)
          ? category.offerSubcategoryDescriptors
          : [];
        return total + offers.length;
      }, 0)
    : 0;

  return {
    eventCount,
    offerCount
  };
}

async function fetchDraftKingsStatus(options = {}) {
  const fetchedAt = new Date().toISOString();
  const fetchTextImpl = options.fetchTextImpl ?? defaultFetchText;
  const sources = [];
  const warnings = [];
  const oddsApiKey = options.oddsApiKey ?? process.env.THE_ODDS_API_KEY ?? process.env.ODDS_API_KEY ?? null;

  if (oddsApiKey) {
    const sourceUrl =
      "https://api.the-odds-api.com/v4/sports/baseball_mlb/odds?regions=us&markets=h2h,spreads,totals" +
      "&bookmakers=draftkings&oddsFormat=american";

    try {
      const response = await fetchTextImpl(`${sourceUrl}&apiKey=${encodeURIComponent(oddsApiKey)}`);
      const text = typeof response === "string" ? response : response.text;

      if (response.ok === false) {
        throw new Error(`${response.status} ${response.statusText ?? ""}`.trim());
      }

      const events = JSON.parse(text);

      if (Array.isArray(events)) {
        return sourceRecord({
          provider: "DraftKings",
          status: "ok",
          sourceType: "The Odds API DraftKings bookmaker feed",
          fetchedAt,
          sources: [
            {
              name: "DraftKings odds via The Odds API",
              sourceUrl,
              count: events.length
            }
          ],
          summary: {
            eventCount: events.length,
            requiresApiKey: true,
            directDraftKingsReachable: false
          },
          warnings: ["DraftKings direct public JSON is not stable; odds are routed through a configured odds API key."]
        });
      }
    } catch (error) {
      warnings.push(`Configured odds API DraftKings fetch failed: ${safeError(error)}`);
    }
  }

  for (const sourceUrl of DRAFTKINGS_DIRECT_ENDPOINTS) {
    try {
      const response = await fetchTextImpl(sourceUrl);
      const text = typeof response === "string" ? response : response.text;
      const status = typeof response === "string" ? 200 : response.status;
      const contentType = typeof response === "string" ? "" : response.contentType ?? "";

      sources.push({
        name: "DraftKings direct check",
        sourceUrl,
        status,
        contentType
      });

      if (status >= 400) {
        warnings.push(`DraftKings direct endpoint returned ${status}.`);
        continue;
      }

      if (!contentType.includes("json") && !text.trim().startsWith("{")) {
        warnings.push("DraftKings direct endpoint returned non-JSON content.");
        continue;
      }

      const parsed = parseDraftKingsPayload(text);

      return sourceRecord({
        provider: "DraftKings",
        status: "ok",
        sourceType: "DraftKings direct public JSON",
        fetchedAt,
        sources,
        summary: {
          ...parsed,
          requiresApiKey: false,
          directDraftKingsReachable: true
        },
        warnings
      });
    } catch (error) {
      warnings.push(`DraftKings direct endpoint failed: ${safeError(error)}`);
    }
  }

  return sourceRecord({
    provider: "DraftKings",
    status: oddsApiKey ? "degraded" : "blocked",
    sourceType: "sportsbook odds",
    fetchedAt,
    sources,
    summary: {
      eventCount: 0,
      offerCount: 0,
      requiresApiKey: true,
      directDraftKingsReachable: false
    },
    warnings: [
      ...warnings,
      "No verified DraftKings market board is available from unauthenticated direct endpoints in this environment."
    ]
  });
}

async function fetchStatNewsStatus(options = {}) {
  const fetchedAt = new Date().toISOString();
  const fetchJsonImpl = options.fetchJsonImpl ?? fetchJson;

  try {
    const payload = await fetchJsonImpl(STAT_NEWS_SEARCH_URL);
    const articles = Array.isArray(payload)
      ? payload.map((article) => ({
          title: article?.title ?? null,
          url: article?.url ?? null
        }))
      : [];

    return sourceRecord({
      provider: "STAT News",
      status: "ok",
      sourceType: "editorial news search",
      fetchedAt,
      sources: [
        {
          name: "STAT News sports betting injury search",
          sourceUrl: STAT_NEWS_SEARCH_URL,
          count: articles.length
        }
      ],
      summary: {
        articleCount: articles.length,
        articles
      },
      warnings: ["STAT News is editorial context only; it is not a live roster, injury-report, or sportsbook feed."]
    });
  } catch (error) {
    return sourceRecord({
      provider: "STAT News",
      status: "unavailable",
      sourceType: "editorial news search",
      fetchedAt,
      sources: [
        {
          name: "STAT News sports betting injury search",
          sourceUrl: STAT_NEWS_SEARCH_URL
        }
      ],
      error: safeError(error),
      warnings: ["STAT News could not be checked."]
    });
  }
}

function extractTitle(text) {
  return (/<title[^>]*>(.*?)<\/title>/is.exec(text)?.[1] ?? "").replace(/\s+/g, " ").trim();
}

function extractMetaDescription(text) {
  return (/meta name="description" content="([^"]*)"/i.exec(text)?.[1] ?? "").replace(/\s+/g, " ").trim();
}

function extractStatMuseSports(text) {
  const sports = new Set();

  for (const match of text.matchAll(/href=["']\/(nba|nhl|mlb|wnba|nfl|cfb|pga|fc)(?:["'/?#])/gi)) {
    sports.add(match[1].toUpperCase());
  }

  return Array.from(sports);
}

async function fetchStatMuseStatus(options = {}) {
  const fetchedAt = new Date().toISOString();
  const fetchTextImpl = options.fetchTextImpl ?? defaultFetchText;
  const sources = [];
  const warnings = [
    "StatMuse is monitored as a research/search surface. It is not treated as an official roster, injury, odds, or projections API."
  ];
  let homeTitle = null;
  let sportsMenu = [];
  let scoresReachable = false;
  let answeredQueries = 0;

  try {
    const response = await fetchTextImpl(STATMUSE_HOME_URL);
    const text = typeof response === "string" ? response : response.text;

    if (response.ok === false) {
      throw new Error(`${response.status} ${response.statusText ?? ""}`.trim());
    }

    homeTitle = extractTitle(text);
    sportsMenu = extractStatMuseSports(text);
    sources.push({
      name: "StatMuse home/navigation",
      sourceUrl: STATMUSE_HOME_URL,
      count: sportsMenu.length,
      status: typeof response === "string" ? 200 : response.status,
      contentType: typeof response === "string" ? "text/html" : response.contentType
    });
  } catch (error) {
    warnings.push(`StatMuse home check failed: ${safeError(error)}`);
  }

  try {
    const response = await fetchTextImpl(STATMUSE_SCORES_URL);
    const text = typeof response === "string" ? response : response.text;

    if (response.ok === false) {
      throw new Error(`${response.status} ${response.statusText ?? ""}`.trim());
    }

    scoresReachable = true;
    sources.push({
      name: "StatMuse scores",
      sourceUrl: STATMUSE_SCORES_URL,
      status: typeof response === "string" ? 200 : response.status,
      contentType: typeof response === "string" ? "text/html" : response.contentType,
      title: extractTitle(text),
      description: extractMetaDescription(text)
    });
  } catch (error) {
    warnings.push(`StatMuse scores check failed: ${safeError(error)}`);
  }

  for (const sport of STATMUSE_QUERY_SPORTS) {
    const query = `${sport} games today`;
    const sourceUrl = `https://www.statmuse.com/${sport}/ask?q=${encodeURIComponent(query).replace(/%20/g, "+")}`;

    try {
      const response = await fetchTextImpl(sourceUrl);
      const text = typeof response === "string" ? response : response.text;
      const status = typeof response === "string" ? 200 : response.status;
      const title = extractTitle(text);
      const description = extractMetaDescription(text);
      const answered = status >= 200 && status < 300;

      if (answered) {
        answeredQueries += 1;
      }

      sources.push({
        name: `StatMuse ${sport.toUpperCase()} daily query`,
        sourceUrl,
        status,
        contentType: typeof response === "string" ? "text/html" : response.contentType,
        title,
        description
      });
    } catch (error) {
      warnings.push(`StatMuse ${sport.toUpperCase()} daily query failed: ${safeError(error)}`);
    }
  }

  return sourceRecord({
    provider: "StatMuse",
    status: homeTitle && scoresReachable ? "ok" : homeTitle ? "degraded" : "unavailable",
    sourceType: "public sports search and scores pages",
    fetchedAt,
    sources,
    summary: {
      sportsMenuCount: sportsMenu.length,
      sportsMenu: sportsMenu.join(", "),
      dailyQueriesChecked: STATMUSE_QUERY_SPORTS.length,
      answeredQueries,
      scoresReachable,
      manualReviewRequired: true
    },
    warnings
  });
}

async function fetchTennisStatus(options = {}) {
  const fetchedAt = new Date().toISOString();
  const fetchTextImpl = options.fetchTextImpl ?? defaultFetchText;
  const oddsApiKey = options.oddsApiKey ?? process.env.THE_ODDS_API_KEY ?? process.env.ODDS_API_KEY ?? null;
  const tennisApiKey = options.tennisApiKey ?? process.env.TENNIS_API_KEY ?? process.env.SPORTDEVS_API_KEY ?? null;
  const sources = [];
  const warnings = [
    "Tennis is enabled as a manual-only lane until a verified schedule, roster/injury, player stats, and odds provider is configured."
  ];

  if (!oddsApiKey && !tennisApiKey) {
    return sourceRecord({
      provider: "Tennis",
      status: "blocked",
      sourceType: "provider configuration",
      fetchedAt,
      sources,
      summary: {
        manualOnly: true,
        oddsApiConfigured: false,
        tennisStatsApiConfigured: false,
        supportedInputs: ["manual ticket JSON", "pasted odds text", "screenshot OCR"]
      },
      warnings: [
        ...warnings,
        "No THE_ODDS_API_KEY/ODDS_API_KEY or TENNIS_API_KEY/SPORTDEVS_API_KEY was found."
      ]
    });
  }

  if (oddsApiKey) {
    for (const sportKey of TENNIS_ODDS_SPORT_KEYS.slice(0, 2)) {
      const sourceUrl =
        `https://api.the-odds-api.com/v4/sports/${encodeURIComponent(sportKey)}/odds` +
        "?regions=us&markets=h2h&bookmakers=draftkings&oddsFormat=american";

      try {
        const response = await fetchTextImpl(`${sourceUrl}&apiKey=${encodeURIComponent(oddsApiKey)}`);
        const text = typeof response === "string" ? response : response.text;

        if (response.ok === false) {
          throw new Error(`${response.status} ${response.statusText ?? ""}`.trim());
        }

        const events = JSON.parse(text);
        sources.push({
          name: `Tennis odds ${sportKey}`,
          sourceUrl,
          count: Array.isArray(events) ? events.length : 0
        });
      } catch (error) {
        warnings.push(`Tennis odds check failed for ${sportKey}: ${safeError(error)}`);
      }
    }
  }

  return sourceRecord({
    provider: "Tennis",
    status: tennisApiKey && warnings.length === 1 ? "ok" : sources.length > 0 ? "degraded" : "blocked",
    sourceType: "tennis odds/stat provider configuration",
    fetchedAt,
    sources,
    summary: {
      manualOnly: !tennisApiKey,
      oddsApiConfigured: Boolean(oddsApiKey),
      tennisStatsApiConfigured: Boolean(tennisApiKey),
      oddsSourcesChecked: sources.length,
      supportedInputs: ["manual ticket JSON", "pasted odds text", "screenshot OCR"]
    },
    warnings
  });
}

async function getSourceStatusDashboard(options = {}) {
  const startDate = resolveStartDate(options.date);
  const days = Number.isInteger(options.days) && options.days > 0 ? Math.min(options.days, 7) : 2;
  const dates = Array.from({ length: days }, (_, index) => formatDate(addDays(startDate, index)));
  const fetchedAt = new Date().toISOString();
  const providers = await Promise.all([
    fetchEspnStatus({ ...options, dates }),
    fetchDraftKingsStatus(options),
    fetchStatNewsStatus(options),
    fetchStatMuseStatus(options),
    fetchTennisStatus(options)
  ]);

  return {
    fetchedAt,
    dates,
    refreshPolicy: {
      autoRefreshMs: AUTO_REFRESH_MS,
      defaultDate: "today",
      note: "Dashboard refreshes source status on load and every five minutes while open."
    },
    providers,
    currentness: {
      allRequiredSourcesAvailable: providers.every((provider) => provider.status === "ok"),
      blockedProviders: providers.filter((provider) => provider.status === "blocked").map((provider) => provider.provider),
      degradedProviders: providers.filter((provider) => provider.status === "degraded").map((provider) => provider.provider)
    }
  };
}

module.exports = {
  AUTO_REFRESH_MS,
  getSourceStatusDashboard,
  fetchDraftKingsStatus,
  fetchEspnStatus,
  fetchStatMuseStatus,
  fetchStatNewsStatus,
  fetchTennisStatus
};
