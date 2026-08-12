const { SnapshotStore } = require("./snapshot-store.js");
const { CreditBudget } = require("./credit-budget.js");
const { buildMarketBaselineRecord } = require("./market-baseline.js");

const THE_ODDS_API_BASE = "https://api.the-odds-api.com/v4";
const DEFAULT_SPORT_KEY = "baseball_mlb";
const DEFAULT_MARKET = "pitcher_strikeouts";
const DEFAULT_REGION = "us";
const DEFAULT_BOOKMAKER = "draftkings";
const PROVIDER = "the_odds_api";

/**
 * @param {Record<string, string>} params
 * @returns {string}
 */
function queryString(params) {
  return Object.entries(params)
    .map(([key, value]) => `${encodeURIComponent(key)}=${encodeURIComponent(value)}`)
    .join("&");
}

/**
 * The /events endpoint returns the slate without odds and does not count
 * against the usage quota. Enumerating the day's games is therefore free, and
 * only the games actually selected for the ledger cost anything.
 *
 * @param {{ apiKey: string, sportKey?: string, fetchJsonImpl: Function }} input
 * @returns {Promise<{ events: Array<object>, creditCost: number, requestUrl: string }>}
 */
async function fetchSlate(input) {
  const sportKey = input.sportKey ?? DEFAULT_SPORT_KEY;
  const requestUrl = `${THE_ODDS_API_BASE}/sports/${encodeURIComponent(sportKey)}/events?`
    + queryString({ apiKey: input.apiKey });

  const response = await input.fetchJsonImpl(requestUrl);
  const events = Array.isArray(response?.data) ? response.data : response;

  return {
    events: Array.isArray(events) ? events : [],
    creditCost: 0,
    requestUrl
  };
}

/**
 * @param {{
 *   apiKey: string,
 *   eventId: string,
 *   sportKey?: string,
 *   market?: string,
 *   region?: string,
 *   bookmaker?: string
 * }} input
 * @returns {string}
 */
function buildEventOddsUrl(input) {
  const sportKey = input.sportKey ?? DEFAULT_SPORT_KEY;

  return `${THE_ODDS_API_BASE}/sports/${encodeURIComponent(sportKey)}`
    + `/events/${encodeURIComponent(input.eventId)}/odds?`
    + queryString({
      regions: input.region ?? DEFAULT_REGION,
      markets: input.market ?? DEFAULT_MARKET,
      bookmakers: input.bookmaker ?? DEFAULT_BOOKMAKER,
      oddsFormat: "american",
      apiKey: input.apiKey
    });
}

/**
 * Pairs Over and Under outcomes into two-sided prices.
 *
 * Both sides at the identical line are required. A one-sided price cannot be
 * devigged, and pairing across different lines would fabricate a market that
 * never existed. The API's own documentation shows two books quoting the same
 * player at different points in the same response, so this is a real case and
 * not a defensive hypothetical.
 *
 * @param {object} eventPayload
 * @param {{ market?: string, bookmaker?: string }} [options]
 * @returns {Array<{
 *   player: string,
 *   line: number,
 *   overAmericanOdds: number,
 *   underAmericanOdds: number,
 *   bookmaker: string,
 *   lastUpdate: string | null
 * }>}
 */
function extractTwoSidedProps(eventPayload, options = {}) {
  const market = options.market ?? DEFAULT_MARKET;
  const bookmakerKey = options.bookmaker ?? DEFAULT_BOOKMAKER;
  const bookmakers = Array.isArray(eventPayload?.bookmakers)
    ? eventPayload.bookmakers
    : [];
  const results = [];

  bookmakers
    .filter((book) => !bookmakerKey || book?.key === bookmakerKey)
    .forEach((book) => {
      const markets = Array.isArray(book?.markets) ? book.markets : [];

      markets
        .filter((entry) => entry?.key === market)
        .forEach((entry) => {
          const outcomes = Array.isArray(entry?.outcomes) ? entry.outcomes : [];
          const sides = new Map();

          outcomes.forEach((outcome) => {
            const player = typeof outcome?.description === "string"
              ? outcome.description.trim()
              : "";
            const line = Number(outcome?.point);
            const price = Number(outcome?.price);
            const side = String(outcome?.name ?? "").toLowerCase();

            if (
              player.length === 0
              || !Number.isFinite(line)
              || !Number.isFinite(price)
              || (side !== "over" && side !== "under")
            ) {
              return;
            }

            const pairKey = `${player}::${line}`;

            if (!sides.has(pairKey)) {
              sides.set(pairKey, { player, line, over: null, under: null });
            }
            sides.get(pairKey)[side] = price;
          });

          sides.forEach((entryValue) => {
            if (entryValue.over === null || entryValue.under === null) {
              return;
            }

            results.push({
              player: entryValue.player,
              line: entryValue.line,
              overAmericanOdds: entryValue.over,
              underAmericanOdds: entryValue.under,
              bookmaker: book.key,
              lastUpdate: entry.last_update ?? book.last_update ?? null
            });
          });
        });
    });

  return results;
}

/**
 * @param {{ eventId: string, player: string, line: number }} input
 * @returns {{ comparisonKey: string, selectionKey: string }}
 */
function buildKeys(input) {
  const player = input.player.replace(/\|/g, "/");

  return {
    comparisonKey: `${input.eventId}|${player}|strikeouts|over|${input.line}`,
    selectionKey: `${player}|over|${input.line}`
  };
}

/**
 * Captures pitcher strikeout props for a slate of MLB games.
 *
 * Order of operations is deliberate. The free slate call happens first, the
 * snapshot store is consulted before any paid call, and the credit budget must
 * approve a spend before the network is touched. A dry run walks the entire
 * path and spends nothing, which makes it safe to verify wiring on a zero
 * dollar budget.
 *
 * @param {{
 *   apiKey: string,
 *   fetchJsonImpl: Function,
 *   store?: SnapshotStore,
 *   budget?: CreditBudget,
 *   maxGames?: number,
 *   market?: string,
 *   region?: string,
 *   bookmaker?: string,
 *   sportKey?: string,
 *   dryRun?: boolean,
 *   evidenceCutoffAt?: string,
 *   now?: () => Date
 * }} input
 */
async function ingestStrikeoutProps(input) {
  if (!input || typeof input !== "object" || Array.isArray(input)) {
    throw new TypeError("Ingestion input must be an object");
  }
  if (typeof input.apiKey !== "string" || input.apiKey.trim().length === 0) {
    throw new TypeError("An Odds API key is required");
  }

  const store = input.store ?? new SnapshotStore();
  const budget = input.budget ?? new CreditBudget();
  const now = input.now ?? (() => new Date());
  const maxGames = Number.isSafeInteger(input.maxGames) && input.maxGames > 0
    ? input.maxGames
    : 5;
  const dryRun = input.dryRun === true;

  const slate = await fetchSlate({
    apiKey: input.apiKey,
    sportKey: input.sportKey,
    fetchJsonImpl: input.fetchJsonImpl
  });

  const nowInstant = now().toISOString();
  const upcoming = slate.events
    .filter((event) => {
      const commence = Date.parse(event?.commence_time);
      return Number.isFinite(commence) && commence > Date.parse(nowInstant);
    })
    .sort((left, right) => (
      Date.parse(left.commence_time) - Date.parse(right.commence_time)
    ))
    .slice(0, maxGames);

  const records = [];
  const skipped = [];
  let creditsSpent = 0;
  let cacheHits = 0;

  for (const event of upcoming) {
    const requestUrl = buildEventOddsUrl({
      apiKey: input.apiKey,
      eventId: event.id,
      sportKey: input.sportKey,
      market: input.market,
      region: input.region,
      bookmaker: input.bookmaker
    });

    let payload = null;
    const cached = store.read(PROVIDER, requestUrl);

    if (cached) {
      payload = cached.payload;
      cacheHits += 1;
    } else if (dryRun) {
      skipped.push({
        eventId: event.id,
        reason: "dry_run_would_spend_1_credit"
      });
      continue;
    } else {
      const verdict = budget.check(1);

      if (!verdict.allowed) {
        skipped.push({ eventId: event.id, reason: verdict.reason ?? "budget_exhausted" });
        continue;
      }

      const response = await input.fetchJsonImpl(requestUrl);
      payload = response?.data ?? response;

      const props = extractTwoSidedProps(payload, {
        market: input.market,
        bookmaker: input.bookmaker
      });

      // The provider does not charge for empty responses, so an event with no
      // props on the board must not be recorded as a spend.
      if (props.length > 0) {
        budget.spend({ credits: 1, reason: `event_odds:${event.id}` });
        creditsSpent += 1;
        store.write({
          provider: PROVIDER,
          requestUrl,
          payload,
          creditCost: 1,
          capturedAt: nowInstant
        });
      } else {
        skipped.push({ eventId: event.id, reason: "no_two_sided_props_returned" });
        continue;
      }
    }

    const props = extractTwoSidedProps(payload, {
      market: input.market,
      bookmaker: input.bookmaker
    });

    props.forEach((prop) => {
      const keys = buildKeys({
        eventId: event.id,
        player: prop.player,
        line: prop.line
      });

      try {
        records.push(buildMarketBaselineRecord({
          comparisonKey: keys.comparisonKey,
          eventId: event.id,
          marketFamily: "pitcher_strikeouts",
          selectionKey: keys.selectionKey,
          selectionAmericanOdds: prop.overAmericanOdds,
          oppositeAmericanOdds: prop.underAmericanOdds,
          eventStartAt: event.commence_time,
          evidenceCutoffAt: input.evidenceCutoffAt ?? nowInstant,
          predictedAt: nowInstant,
          priceSource: `${PROVIDER}:${prop.bookmaker}`,
          priceObservedAt: prop.lastUpdate ?? nowInstant
        }));
      } catch (error) {
        skipped.push({
          eventId: event.id,
          reason: `baseline_rejected: ${error instanceof Error ? error.message : String(error)}`
        });
      }
    });
  }

  return {
    slateSize: slate.events.length,
    eventsConsidered: upcoming.length,
    records,
    skipped,
    creditsSpent,
    cacheHits,
    creditsRemaining: budget.remaining(),
    dryRun
  };
}

module.exports = {
  DEFAULT_BOOKMAKER,
  DEFAULT_MARKET,
  DEFAULT_REGION,
  DEFAULT_SPORT_KEY,
  PROVIDER,
  buildEventOddsUrl,
  buildKeys,
  extractTwoSidedProps,
  fetchSlate,
  ingestStrikeoutProps
};
