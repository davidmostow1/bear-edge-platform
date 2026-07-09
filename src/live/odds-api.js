const { fetchJson } = require("./fetch-json.js");

const DEFAULT_ODDS_REGION = "us";
const DEFAULT_BOOKMAKER = "draftkings";
const DEFAULT_ODDS_FORMAT = "american";

const SPORT_KEYS = Object.freeze({
  mlb: "baseball_mlb",
  nhl: "icehockey_nhl",
  nba: "basketball_nba",
  nfl: "americanfootball_nfl",
  tennis: "tennis_atp_wimbledon"
});

function resolveOddsApiKey(options = {}) {
  return options.oddsApiKey ?? process.env.THE_ODDS_API_KEY ?? process.env.ODDS_API_KEY ?? null;
}

function publicSourceUrl(url) {
  const parsed = new URL(url);
  parsed.searchParams.delete("apiKey");
  return parsed.toString();
}

function normalizeMarkets(value) {
  const markets = Array.isArray(value)
    ? value
    : String(value ?? "h2h,spreads,totals").split(",");

  return markets
    .map((market) => market.trim())
    .filter(Boolean)
    .join(",");
}

function sportKeyFor(value) {
  const key = String(value ?? "mlb").trim().toLowerCase();
  return SPORT_KEYS[key] ?? key;
}

function redactBookmakerEvent(event, bookmakerKey = DEFAULT_BOOKMAKER) {
  const bookmaker = (event.bookmakers ?? []).find((entry) => entry.key === bookmakerKey) ?? event.bookmakers?.[0] ?? null;

  return {
    id: event.id,
    sportKey: event.sport_key,
    commenceTime: event.commence_time,
    homeTeam: event.home_team,
    awayTeam: event.away_team,
    bookmaker: bookmaker
      ? {
          key: bookmaker.key,
          title: bookmaker.title,
          lastUpdate: bookmaker.last_update,
          markets: (bookmaker.markets ?? []).map((market) => ({
            key: market.key,
            lastUpdate: market.last_update,
            outcomes: (market.outcomes ?? []).map((outcome) => ({
              name: outcome.name,
              description: outcome.description ?? null,
              price: outcome.price,
              point: outcome.point ?? null
            }))
          }))
        }
      : null
  };
}

async function fetchOddsApiSports(options = {}) {
  const apiKey = resolveOddsApiKey(options);

  if (!apiKey) {
    return {
      status: "blocked",
      requiresApiKey: true,
      sports: [],
      warnings: ["No THE_ODDS_API_KEY or ODDS_API_KEY is configured."]
    };
  }

  const fetchJsonImpl = options.fetchJsonImpl ?? fetchJson;
  const sourceUrl = `https://api.the-odds-api.com/v4/sports/?apiKey=${encodeURIComponent(apiKey)}`;
  const sports = await fetchJsonImpl(sourceUrl);

  return {
    status: "ok",
    requiresApiKey: true,
    sourceUrl: publicSourceUrl(sourceUrl),
    sports: Array.isArray(sports) ? sports : []
  };
}

async function fetchOddsApiMarkets(options = {}) {
  const apiKey = resolveOddsApiKey(options);
  const sportKey = sportKeyFor(options.sportKey ?? options.sport ?? "mlb");
  const regions = options.regions ?? DEFAULT_ODDS_REGION;
  const bookmakers = options.bookmakers ?? DEFAULT_BOOKMAKER;
  const oddsFormat = options.oddsFormat ?? DEFAULT_ODDS_FORMAT;
  const markets = normalizeMarkets(options.markets);

  if (!apiKey) {
    return {
      status: "blocked",
      requiresApiKey: true,
      sportKey,
      events: [],
      warnings: ["No THE_ODDS_API_KEY or ODDS_API_KEY is configured."]
    };
  }

  const fetchJsonImpl = options.fetchJsonImpl ?? fetchJson;
  const sourceUrl =
    `https://api.the-odds-api.com/v4/sports/${encodeURIComponent(sportKey)}/odds` +
    `?regions=${encodeURIComponent(regions)}` +
    `&markets=${encodeURIComponent(markets)}` +
    `&bookmakers=${encodeURIComponent(bookmakers)}` +
    `&oddsFormat=${encodeURIComponent(oddsFormat)}` +
    `&apiKey=${encodeURIComponent(apiKey)}`;
  const events = await fetchJsonImpl(sourceUrl);

  return {
    status: "ok",
    requiresApiKey: true,
    fetchedAt: new Date().toISOString(),
    sportKey,
    regions,
    bookmakers,
    markets: markets.split(","),
    oddsFormat,
    sourceUrl: publicSourceUrl(sourceUrl),
    eventCount: Array.isArray(events) ? events.length : 0,
    events: Array.isArray(events) ? events.map((event) => redactBookmakerEvent(event, bookmakers)) : [],
    warnings: [
      "Odds are provider-supplied sportsbook prices. They still require final user verification before wagering."
    ]
  };
}

async function fetchOddsApiEventMarkets(options = {}) {
  const apiKey = resolveOddsApiKey(options);
  const sportKey = sportKeyFor(options.sportKey ?? options.sport ?? "mlb");
  const eventId = String(options.eventId ?? "").trim();
  const regions = options.regions ?? DEFAULT_ODDS_REGION;
  const bookmakers = options.bookmakers ?? DEFAULT_BOOKMAKER;
  const oddsFormat = options.oddsFormat ?? DEFAULT_ODDS_FORMAT;
  const markets = normalizeMarkets(options.markets);

  if (!eventId) {
    throw new Error("eventId is required for event-level odds.");
  }

  if (!apiKey) {
    return {
      status: "blocked",
      requiresApiKey: true,
      sportKey,
      eventId,
      event: null,
      warnings: ["No THE_ODDS_API_KEY or ODDS_API_KEY is configured."]
    };
  }

  const fetchJsonImpl = options.fetchJsonImpl ?? fetchJson;
  const sourceUrl =
    `https://api.the-odds-api.com/v4/sports/${encodeURIComponent(sportKey)}` +
    `/events/${encodeURIComponent(eventId)}/odds` +
    `?regions=${encodeURIComponent(regions)}` +
    `&markets=${encodeURIComponent(markets)}` +
    `&bookmakers=${encodeURIComponent(bookmakers)}` +
    `&oddsFormat=${encodeURIComponent(oddsFormat)}` +
    `&apiKey=${encodeURIComponent(apiKey)}`;
  const event = await fetchJsonImpl(sourceUrl);

  return {
    status: "ok",
    requiresApiKey: true,
    fetchedAt: new Date().toISOString(),
    sportKey,
    eventId,
    regions,
    bookmakers,
    markets: markets.split(","),
    oddsFormat,
    sourceUrl: publicSourceUrl(sourceUrl),
    event: event ? redactBookmakerEvent(event, bookmakers) : null,
    warnings: [
      "Event-level props are provider-supplied sportsbook prices. Verify every line and price before wagering."
    ]
  };
}

module.exports = {
  SPORT_KEYS,
  fetchOddsApiEventMarkets,
  fetchOddsApiMarkets,
  fetchOddsApiSports,
  resolveOddsApiKey,
  sportKeyFor
};
