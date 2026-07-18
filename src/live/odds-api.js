const { fetchJson } = require("./fetch-json.js");
const { safeErrorMessage } = require("../config/secrets.js");
const {
  DEFAULT_ODDS_CACHE_TTL_MS,
  assertPaidRequestAllowed,
  quotaSnapshot,
  readPaidResponseCache,
  recordQuotaFailure,
  recordQuotaHeaders,
  resetOddsApiRuntimeState,
  writePaidResponseCache
} = require("./odds-quota.js");

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
let fetchImplementationIds = new WeakMap();
let nextFetchImplementationId = 1;

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

function sportsSample(sports) {
  return sports.slice(0, 5).map((sport) => ({
    key: sport.key,
    title: sport.title,
    active: sport.active
  }));
}

function marketCount(markets) {
  return String(markets ?? "")
    .split(",")
    .map((market) => market.trim())
    .filter(Boolean).length;
}

function bookmakerRegionCount(bookmakers, regions) {
  const bookmakerCount = String(bookmakers ?? "")
    .split(",")
    .map((bookmaker) => bookmaker.trim())
    .filter(Boolean).length;

  if (bookmakerCount > 0) {
    return Math.ceil(bookmakerCount / 10);
  }

  return Math.max(1, String(regions ?? "us").split(",").filter(Boolean).length);
}

function estimateOddsRequestCost({ markets, bookmakers, regions }) {
  return Math.max(1, marketCount(markets)) * bookmakerRegionCount(bookmakers, regions);
}

function fetchImplementationNamespace(fetchJsonImpl) {
  if (!fetchImplementationIds.has(fetchJsonImpl)) {
    fetchImplementationIds.set(fetchJsonImpl, nextFetchImplementationId);
    nextFetchImplementationId += 1;
  }

  return `fetch-${fetchImplementationIds.get(fetchJsonImpl)}`;
}

async function fetchPaidOddsPayload(sourceUrl, options) {
  const fetchJsonImpl = options.fetchJsonImpl ?? fetchJson;
  const cacheNamespace = fetchImplementationNamespace(fetchJsonImpl);
  const cached = readPaidResponseCache(options.oddsApiKey, sourceUrl, {
    ttlMs: options.cacheTtlMs,
    forceRefresh: options.forceRefresh,
    namespace: cacheNamespace
  });

  if (cached) {
    return {
      data: cached.data,
      cache: {
        hit: true,
        ageMs: cached.ageMs,
        ttlMs: cached.ttlMs
      }
    };
  }

  assertPaidRequestAllowed(options.oddsApiKey, {
    estimatedCost: options.estimatedCost,
    bypassCircuit: options.bypassCircuit
  });

  let responseObserved = false;

  try {
    const data = await fetchJsonImpl(sourceUrl, {
      onResponse: (response) => {
        responseObserved = true;
        recordQuotaHeaders(options.oddsApiKey, response, { paid: true });
      }
    });
    writePaidResponseCache(options.oddsApiKey, sourceUrl, data, { namespace: cacheNamespace });

    return {
      data,
      cache: {
        hit: false,
        ageMs: 0,
        ttlMs: Number.isFinite(options.cacheTtlMs) ? options.cacheTtlMs : DEFAULT_ODDS_CACHE_TTL_MS
      }
    };
  } catch (error) {
    recordQuotaFailure(options.oddsApiKey, error, {
      paid: true,
      requestAlreadyRecorded: responseObserved
    });
    throw error;
  }
}

function classifyOddsApiFailure(error, phase) {
  const providerCode = String(error?.providerCode ?? "").trim().toUpperCase() || null;
  const httpStatus = Number.isInteger(error?.httpStatus) ? error.httpStatus : null;
  const authenticated = phase === "market";
  const common = {
    authenticated,
    marketAccess: false,
    providerCode,
    httpStatus
  };

  if (providerCode === "OUT_OF_USAGE_CREDITS") {
    return {
      ...common,
      status: "quota_exhausted",
      retryable: false,
      operatorAction: "REFILL_OR_UPGRADE_PROVIDER_CREDITS",
      message: "The provider accepted this key, but its monthly usage quota has been exhausted."
    };
  }

  if (["INVALID_KEY", "MISSING_KEY", "DEACTIVATED_KEY"].includes(providerCode)) {
    return {
      ...common,
      status: "invalid_key",
      authenticated: false,
      retryable: false,
      operatorAction: "REPLACE_PROVIDER_KEY",
      message: "The provider rejected this API key. Replace it with an active subscription key."
    };
  }

  if (providerCode === "EXCEEDED_FREQ_LIMIT" || httpStatus === 429) {
    return {
      ...common,
      status: "rate_limited",
      retryable: true,
      operatorAction: "RETRY_AFTER_BACKOFF",
      message: "The provider rate-limited the readiness probe. Retry after a short backoff."
    };
  }

  return {
    ...common,
    status: "provider_error",
    retryable: true,
    operatorAction: "CHECK_PROVIDER_STATUS",
    message: safeErrorMessage(error)
  };
}

function redactBookmaker(bookmaker) {
  return {
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
  };
}

function redactBookmakerEvent(event, bookmakerKey = DEFAULT_BOOKMAKER) {
  const preferredBookmakerKeys = String(bookmakerKey ?? DEFAULT_BOOKMAKER)
    .split(",")
    .map((entry) => entry.trim())
    .filter(Boolean);
  const bookmakers = (event.bookmakers ?? []).map(redactBookmaker);
  const bookmaker =
    bookmakers.find((entry) => preferredBookmakerKeys.includes(entry.key)) ?? bookmakers[0] ?? null;

  return {
    id: event.id,
    sportKey: event.sport_key,
    commenceTime: event.commence_time,
    homeTeam: event.home_team,
    awayTeam: event.away_team,
    bookmaker,
    bookmakers
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
  let responseObserved = false;
  let sports;

  try {
    sports = await fetchJsonImpl(sourceUrl, {
      onResponse: (response) => {
        responseObserved = true;
        recordQuotaHeaders(apiKey, response, { paid: false });
      }
    });
  } catch (error) {
    recordQuotaFailure(apiKey, error, {
      paid: false,
      requestAlreadyRecorded: responseObserved
    });
    throw error;
  }

  return {
    status: "ok",
    requiresApiKey: true,
    sourceUrl: publicSourceUrl(sourceUrl),
    sports: Array.isArray(sports) ? sports : [],
    quota: quotaSnapshot(apiKey)
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
  const request = await fetchPaidOddsPayload(sourceUrl, {
    oddsApiKey: apiKey,
    fetchJsonImpl,
    estimatedCost: estimateOddsRequestCost({ markets, bookmakers, regions }),
    cacheTtlMs: options.cacheTtlMs,
    forceRefresh: options.forceRefresh,
    bypassCircuit: options.bypassCircuit
  });
  const events = request.data;

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
    cache: request.cache,
    quota: quotaSnapshot(apiKey),
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
  const request = await fetchPaidOddsPayload(sourceUrl, {
    oddsApiKey: apiKey,
    fetchJsonImpl,
    estimatedCost: estimateOddsRequestCost({ markets, bookmakers, regions }),
    cacheTtlMs: options.cacheTtlMs,
    forceRefresh: options.forceRefresh,
    bypassCircuit: options.bypassCircuit
  });
  const event = request.data;

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
    cache: request.cache,
    quota: quotaSnapshot(apiKey),
    event: event ? redactBookmakerEvent(event, bookmakers) : null,
    warnings: [
      "Event-level props are provider-supplied sportsbook prices. Verify every line and price before wagering."
    ]
  };
}

async function verifyOddsApiReadiness(options = {}) {
  const apiKey = resolveOddsApiKey(options);

  if (!apiKey) {
    return {
      status: "missing_key",
      authenticated: false,
      marketAccess: false,
      retryable: false,
      providerCode: "MISSING_KEY",
      httpStatus: null,
      operatorAction: "CONFIGURE_PROVIDER_KEY",
      message: "No THE_ODDS_API_KEY or ODDS_API_KEY is configured.",
      catalog: {
        sports: 0,
        sample: []
      },
      marketProbe: null
    };
  }

  const checkedAt = new Date().toISOString();
  let catalog;

  try {
    catalog = await fetchOddsApiSports({
      ...options,
      oddsApiKey: apiKey
    });
  } catch (error) {
    return {
      ...classifyOddsApiFailure(error, "catalog"),
      checkedAt,
      catalog: {
        sports: 0,
        sample: []
      },
      marketProbe: null
    };
  }

  const catalogSummary = {
    sports: catalog.sports.length,
    sample: sportsSample(catalog.sports)
  };
  const catalogQuota = quotaSnapshot(apiKey);
  const marketProbe = {
    sportKey: "baseball_mlb",
    bookmaker: DEFAULT_BOOKMAKER,
    markets: ["h2h"],
    estimatedUsageCredits: 1
  };

  if (catalogQuota.remainingCredits === 0) {
    return {
      status: "quota_exhausted",
      authenticated: true,
      marketAccess: false,
      retryable: false,
      providerCode: "OUT_OF_USAGE_CREDITS",
      httpStatus: null,
      operatorAction: "REFILL_OR_UPGRADE_PROVIDER_CREDITS",
      message: "The provider authenticated this key, but reported zero remaining usage credits.",
      checkedAt,
      catalog: catalogSummary,
      quota: catalogQuota,
      marketProbe: {
        ...marketProbe,
        events: null,
        fetchedAt: null,
        skipped: true,
        skipReason: "ZERO_REMAINING_CREDITS"
      }
    };
  }

  try {
    const markets = await fetchOddsApiMarkets({
      ...options,
      sportKey: marketProbe.sportKey,
      bookmakers: marketProbe.bookmaker,
      markets: marketProbe.markets,
      oddsApiKey: apiKey,
      forceRefresh: true,
      bypassCircuit: true
    });

    return {
      status: "ready",
      authenticated: true,
      marketAccess: true,
      retryable: false,
      providerCode: null,
      httpStatus: null,
      operatorAction: "NONE",
      message: "The provider key is authenticated and the MLB market endpoint is accessible.",
      checkedAt,
      catalog: catalogSummary,
      quota: quotaSnapshot(apiKey),
      marketProbe: {
        ...marketProbe,
        events: markets.eventCount,
        fetchedAt: markets.fetchedAt
      }
    };
  } catch (error) {
    return {
      ...classifyOddsApiFailure(error, "market"),
      checkedAt,
      catalog: catalogSummary,
      quota: quotaSnapshot(apiKey),
      marketProbe: {
        ...marketProbe,
        events: null,
        fetchedAt: null
      }
    };
  }
}

module.exports = {
  SPORT_KEYS,
  fetchOddsApiEventMarkets,
  fetchOddsApiMarkets,
  fetchOddsApiSports,
  estimateOddsRequestCost,
  quotaSnapshot,
  resetOddsApiRuntimeState: () => {
    resetOddsApiRuntimeState();
    fetchImplementationIds = new WeakMap();
    nextFetchImplementationId = 1;
  },
  resolveOddsApiKey,
  sportKeyFor,
  verifyOddsApiReadiness
};
