const { fetchGamesForWindow } = require("./schedule.js");

const COVERS_MLB_PROPS_URL = "https://www.covers.com/sport/baseball/mlb/player-props";
const HARD_ROCK_MLB_URL = "https://www.hardrock.bet/sportsbook/baseball/mlb/";
const HARD_ROCK_WORLD_CUP_URL = "https://www.hardrock.bet/sportsbook/soccer/world-cup-odds/";
const STATMUSE_MLB_QUERY_URL = "https://www.statmuse.com/mlb/ask?q=mlb+games+today";
const STATMUSE_WORLD_CUP_QUERY_URL = "https://www.statmuse.com/fc/ask?q=world+cup+games+today";

const MLB_MARKET_FAMILIES = Object.freeze([
  {
    marketType: "moneyline",
    label: "Winner / moneyline",
    selections: ["away winner", "home winner"]
  },
  {
    marketType: "run_line",
    label: "Run line",
    selections: ["away run line", "home run line"]
  },
  {
    marketType: "game_total",
    label: "Game total",
    selections: ["over total runs", "under total runs"]
  },
  {
    marketType: "player_props",
    label: "Player props",
    selections: ["total bases", "hits", "runs", "RBIs", "home runs", "pitcher strikeouts"]
  },
  {
    marketType: "same_game_parlay",
    label: "Same-game parlay",
    selections: ["combined game and player legs"]
  },
  {
    marketType: "live_betting",
    label: "Live betting",
    selections: ["in-game winner", "in-game total", "in-game props"]
  }
]);

const WORLD_CUP_MARKET_FAMILIES = Object.freeze([
  {
    marketType: "three_way_moneyline",
    label: "Three-way moneyline",
    selections: ["home win", "draw", "away win"]
  },
  {
    marketType: "draw_no_bet",
    label: "Draw no bet",
    selections: ["home draw no bet", "away draw no bet"]
  },
  {
    marketType: "double_chance",
    label: "Double chance",
    selections: ["home or draw", "away or draw", "home or away"]
  },
  {
    marketType: "goal_handicap",
    label: "Goal handicap / spread",
    selections: ["home handicap", "away handicap"]
  },
  {
    marketType: "total_goals",
    label: "Total goals",
    selections: ["over total goals", "under total goals"]
  },
  {
    marketType: "both_teams_to_score",
    label: "Both teams to score",
    selections: ["yes", "no"]
  },
  {
    marketType: "player_props",
    label: "Player props",
    selections: ["first goalscorer", "anytime goalscorer", "player shots", "player shots on target"]
  },
  {
    marketType: "futures",
    label: "Tournament futures",
    selections: ["lift trophy", "group winner", "golden boot", "advance from group"]
  }
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

function formatDate(date) {
  return `${date.getFullYear()}-${pad2(date.getMonth() + 1)}-${pad2(date.getDate())}`;
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

async function defaultFetchText(url) {
  const response = await fetch(url, {
    headers: {
      accept: "text/html,application/json;q=0.9,*/*;q=0.8",
      "user-agent": "Mozilla/5.0 bear-edge-betting-engine/1.0"
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

function htmlDecode(value) {
  return String(value ?? "")
    .replaceAll("&#x2B;", "+")
    .replaceAll("&#43;", "+")
    .replaceAll("&amp;", "&")
    .replaceAll("&nbsp;", " ")
    .replaceAll("&#x27;", "'")
    .replaceAll("&quot;", "\"")
    .replace(/&#(\d+);/g, (_, code) => String.fromCharCode(Number(code)));
}

function stripTags(value) {
  return htmlDecode(String(value ?? "").replace(/<[^>]*>/g, " "))
    .replace(/\s+/g, " ")
    .trim();
}

function parseAmericanOdds(value) {
  const match = /([+-]\d{2,5})/.exec(htmlDecode(value));
  return match ? Number(match[1]) : null;
}

function americanToDecimal(americanOdds) {
  if (typeof americanOdds !== "number" || !Number.isFinite(americanOdds) || americanOdds === 0) {
    return null;
  }

  return americanOdds > 0 ? 1 + americanOdds / 100 : 1 + 100 / Math.abs(americanOdds);
}

function americanToImpliedProbability(americanOdds) {
  if (typeof americanOdds !== "number" || !Number.isFinite(americanOdds) || americanOdds === 0) {
    return null;
  }

  return americanOdds > 0 ? 100 / (americanOdds + 100) : Math.abs(americanOdds) / (Math.abs(americanOdds) + 100);
}

function payoutForStake(americanOdds, stake = 100) {
  const decimalOdds = americanToDecimal(americanOdds);

  if (decimalOdds === null) {
    return null;
  }

  const profit = americanOdds > 0 ? stake * (americanOdds / 100) : stake * (100 / Math.abs(americanOdds));

  return {
    stake,
    profit,
    totalReturn: stake + profit,
    decimalOdds
  };
}

function parseNumber(value) {
  const number = Number(htmlDecode(value).replace(/[^+\-\d.]/g, ""));
  return Number.isFinite(number) ? number : null;
}

function normalizeBookName(value) {
  return stripTags(value)
    .replace(/\s+logo$/i, "")
    .replace(/\s+/g, " ")
    .trim();
}

function splitCoversPropBlocks(html) {
  const blocks = [];
  const pattern = /<section[^>]*class="[^"]*picks-card game-projections-container[^"]*"[\s\S]*?<\/section>/gi;

  for (const match of html.matchAll(pattern)) {
    blocks.push(match[0]);
  }

  return blocks;
}

function parseCoversBookPrices(block) {
  const prices = [];
  const columnPattern = /<div class="compare-odds-column[\s\S]*?<\/div>\s*<\/div>/gi;

  for (const columnMatch of block.matchAll(columnPattern)) {
    const column = columnMatch[0];
    const book = normalizeBookName(/<img[^>]*alt="([^"]+)"/i.exec(column)?.[1] ?? "");
    const oddsHtml = /<a[^>]*class="[^"]*book-odds[^"]*"[^>]*>([\s\S]*?)<\/a>/i.exec(column)?.[1] ?? "";
    const oddsText = stripTags(oddsHtml);
    const odds = parseAmericanOdds(oddsText);
    const sideLine = /^([ou])\s*([+-]?\d+(?:\.\d+)?)/i.exec(oddsText.replace(/\s+/g, ""));

    if (!book || odds === null) {
      continue;
    }

    prices.push({
      sportsbook: book,
      selection: sideLine ? sideLine[1].toLowerCase() : null,
      line: sideLine ? Number(sideLine[2]) : null,
      americanOdds: odds,
      decimalOdds: americanToDecimal(odds),
      impliedProbability: americanToImpliedProbability(odds),
      payoutOn100Stake: payoutForStake(odds, 100),
      label: oddsText
    });
  }

  return prices;
}

function findDraftKingsPrice(bookPrices) {
  return bookPrices.find((price) => /draft\s*kings/i.test(price.sportsbook)) ?? null;
}

function compareBestToDraftKings(bestPrice, draftKingsPrice) {
  if (!bestPrice || !draftKingsPrice) {
    return null;
  }

  const bestProfit = bestPrice.payoutOn100Stake?.profit;
  const draftKingsProfit = draftKingsPrice.payoutOn100Stake?.profit;
  const bestImplied = bestPrice.impliedProbability;
  const draftKingsImplied = draftKingsPrice.impliedProbability;

  return {
    americanOddsDelta: bestPrice.americanOdds - draftKingsPrice.americanOdds,
    impliedProbabilitySavings:
      typeof bestImplied === "number" && typeof draftKingsImplied === "number"
        ? draftKingsImplied - bestImplied
        : null,
    profitOn100Delta:
      typeof bestProfit === "number" && typeof draftKingsProfit === "number"
        ? bestProfit - draftKingsProfit
        : null,
    bestSportsbook: bestPrice.sportsbook,
    draftKingsSportsbook: draftKingsPrice.sportsbook
  };
}

function classifyEdgeTier(evPercent) {
  if (typeof evPercent !== "number" || !Number.isFinite(evPercent)) {
    return "unknown";
  }

  if (evPercent >= 15) {
    return "bet_candidate";
  }

  if (evPercent >= 12) {
    return "lean";
  }

  return "pass";
}

function parseCoversMlbProps(html, options = {}) {
  const maxProps = Number.isInteger(options.maxProps) && options.maxProps > 0 ? options.maxProps : 150;
  const props = [];
  const seen = new Set();

  for (const block of splitCoversPropBlocks(html)) {
    if (props.length >= maxProps) {
      break;
    }

    const marketLabel = stripTags(/badge-style-primary-subtle[^>]*>([\s\S]*?)<\/span>/i.exec(block)?.[1] ?? "");
    const matchup = stripTags(/projection-game-link[^>]*>([\s\S]*?)<\/a>/i.exec(block)?.[1] ?? "");
    const category = stripTags(/class="category[^"]*"[^>]*>([\s\S]*?)<\/span>/i.exec(block)?.[1] ?? "");
    const player = stripTags(/class="player-link"[^>]*>([\s\S]*?)<\/a>/i.exec(block)?.[1] ?? "");
    const position = stripTags(/class="player-position"[^>]*>\s*\(([^)]*)\)\s*<\/span>/i.exec(block)?.[1] ?? "");
    const prediction = stripTags(/class="prediction[^"]*"[^>]*>([\s\S]*?)<\/span>/i.exec(block)?.[1] ?? "");
    const projection = parseNumber(/<span class="fs-11">([^<]+)<\/span>\s*<span[^>]*>PROJECTION<\/span>/i.exec(block)?.[1] ?? "");
    const diff = parseNumber(/data-diff="([^"]+)"/i.exec(block)?.[1] ?? "");
    const ev = parseNumber(/data-ev="([^"]+)"/i.exec(block)?.[1] ?? "");
    const rating = parseNumber(/data-rating="([^"]+)"/i.exec(block)?.[1] ?? "");
    const marketId = /data-market-id="([^"]+)"/i.exec(block)?.[1] ?? null;
    const dataId = /data-id="([^"]+)"/i.exec(block)?.[1] ?? null;
    const bookPrices = parseCoversBookPrices(block);
    const bestPrice = bookPrices
      .filter((price) => Number.isFinite(price.americanOdds))
      .sort((left, right) => right.americanOdds - left.americanOdds)[0] ?? null;
    const draftKingsPrice = findDraftKingsPrice(bookPrices);

    const participant = player || category || null;
    const uniqueKey = [marketLabel, matchup, participant, prediction, bestPrice?.sportsbook, bestPrice?.americanOdds].join("|");

    if (!marketLabel || !participant || bookPrices.length === 0 || seen.has(uniqueKey)) {
      continue;
    }

    seen.add(uniqueKey);
    props.push({
      id: `covers_mlb_${dataId ?? props.length}`,
      sport: "mlb",
      opportunityType: player ? "priced_prop" : "priced_game_market",
      source: "Covers",
      sourceUrl: COVERS_MLB_PROPS_URL,
      marketLabel,
      marketType: marketLabel.toLowerCase().replace(/[^a-z0-9]+/g, "_").replace(/^_|_$/g, ""),
      matchup,
      player: player || null,
      participant,
      position: position || null,
      prediction,
      projection,
      difference: diff,
      evPercent: ev,
      rating,
      marketId,
      bookPrices,
      bestPrice,
      draftKingsPrice,
      bestVsDraftKings: compareBestToDraftKings(bestPrice, draftKingsPrice),
      edgeTier: classifyEdgeTier(ev),
      status: "priced_online"
    });
  }

  return props;
}

function marketOpportunityFromGame(game, family, index) {
  return {
    id: `${game.sport}_${game.id}_${family.marketType}_${index}`.toLowerCase(),
    sport: game.sport,
    opportunityType: "market_family",
    source: game.sport === "worldcup" ? "ESPN World Cup schedule + Hard Rock market guide" : "Official MLB schedule + Hard Rock market guide",
    sourceUrl: game.sourceUrl,
    marketType: family.marketType,
    marketLabel: family.label,
    selections: family.selections,
    matchup: `${game.away?.name ?? "Away"} @ ${game.home?.name ?? "Home"}`,
    gameId: game.id,
    gameDate: game.gameDate,
    status: "odds_needed",
    venue: game.venue ?? null,
    group: game.group ?? null,
    notes: ["Market is available as an online market family, but no verified current price was exposed by this source."]
  };
}

function buildMarketFamilyOpportunities(games, sport) {
  const families = sport === "worldcup" ? WORLD_CUP_MARKET_FAMILIES : MLB_MARKET_FAMILIES;
  const opportunities = [];

  for (const game of games.filter((entry) => entry.sport === sport)) {
    families.forEach((family, index) => {
      opportunities.push(marketOpportunityFromGame(game, family, index));
    });
  }

  return opportunities;
}

function extractHardRockMarketContext(text, sport) {
  const candidates = sport === "worldcup"
    ? [
        "World Cup futures",
        "Individual match betting",
        "World Cup props and specials",
        "Live betting on the World Cup",
        "World Cup SGPs",
        "three-way moneyline",
        "Total Goals",
        "First Goalscorer",
        "Anytime Goalscorer"
      ]
    : [
        "MLB moneyline bets",
        "MLB totals",
        "MLB run lines",
        "MLB futures",
        "MLB props",
        "MLB parlays",
        "MLB SGPs",
        "MLB live betting"
      ];

  return candidates.filter((candidate) => text.toLowerCase().includes(candidate.toLowerCase()));
}

async function fetchHardRockContext(options = {}) {
  const fetchTextImpl = options.fetchTextImpl ?? defaultFetchText;
  const sources = [];
  const warnings = [];

  for (const [sport, sourceUrl] of [["mlb", HARD_ROCK_MLB_URL], ["worldcup", HARD_ROCK_WORLD_CUP_URL]]) {
    try {
      const response = await fetchTextImpl(sourceUrl);
      const text = typeof response === "string" ? response : response.text;

      if (response.ok === false) {
        throw new Error(`${response.status} ${response.statusText ?? ""}`.trim());
      }

      sources.push({
        provider: "Hard Rock Bet",
        sport,
        sourceType: "public sportsbook market guide page",
        sourceUrl,
        status: typeof response === "string" ? 200 : response.status,
        contentType: typeof response === "string" ? "text/html" : response.contentType,
        marketFamilies: extractHardRockMarketContext(text, sport)
      });
    } catch (error) {
      warnings.push(`Hard Rock ${sport} page failed: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  return { sources, warnings };
}

async function fetchStatMuseContext(options = {}) {
  const fetchTextImpl = options.fetchTextImpl ?? defaultFetchText;
  const sources = [];
  const warnings = [];

  for (const [sport, sourceUrl] of [["mlb", STATMUSE_MLB_QUERY_URL], ["worldcup", STATMUSE_WORLD_CUP_QUERY_URL]]) {
    try {
      const response = await fetchTextImpl(sourceUrl);
      const text = typeof response === "string" ? response : response.text;

      sources.push({
        provider: "StatMuse",
        sport,
        sourceType: "public sports search page",
        sourceUrl,
        status: typeof response === "string" ? 200 : response.status,
        contentType: typeof response === "string" ? "text/html" : response.contentType,
        title: stripTags(/<title[^>]*>([\s\S]*?)<\/title>/i.exec(text)?.[1] ?? ""),
        description: stripTags(/meta name="description" content="([^"]*)"/i.exec(text)?.[1] ?? "")
      });
    } catch (error) {
      warnings.push(`StatMuse ${sport} query failed: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  return { sources, warnings };
}

async function fetchCoversMlbProps(options = {}) {
  const fetchTextImpl = options.fetchTextImpl ?? defaultFetchText;
  const response = await fetchTextImpl(COVERS_MLB_PROPS_URL);
  const text = typeof response === "string" ? response : response.text;

  if (response.ok === false) {
    throw new Error(`${response.status} ${response.statusText ?? ""}`.trim());
  }

  return {
    source: {
      provider: "Covers",
      sport: "mlb",
      sourceType: "public MLB props page",
      sourceUrl: COVERS_MLB_PROPS_URL,
      status: typeof response === "string" ? 200 : response.status,
      contentType: typeof response === "string" ? "text/html" : response.contentType
    },
    opportunities: parseCoversMlbProps(text, options)
  };
}

async function fetchOnlineOpportunities(options = {}) {
  const startDate = resolveStartDate(options.date);
  const days = Number.isInteger(options.days) && options.days > 0 ? Math.min(options.days, 7) : 2;
  const dates = Array.from({ length: days }, (_, index) => formatDate(addDays(startDate, index)));
  const requestedSports = Array.isArray(options.sports) && options.sports.length > 0
    ? options.sports
    : ["mlb", "worldcup"];
  const sports = requestedSports.filter((sport) => ["mlb", "worldcup"].includes(sport));
  const fetchedAt = new Date().toISOString();
  const warnings = [];
  const sourceRecords = [];
  const opportunities = [];
  const gameWindow = await fetchGamesForWindow({
    ...options,
    sports,
    date: options.date ?? "today",
    days
  });

  if (sports.includes("mlb")) {
    try {
      const covers = await fetchCoversMlbProps(options);
      sourceRecords.push(covers.source);
      opportunities.push(...covers.opportunities);
    } catch (error) {
      warnings.push(`Covers MLB props failed: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  const hardRock = await fetchHardRockContext(options);
  const statMuse = await fetchStatMuseContext(options);
  sourceRecords.push(...hardRock.sources, ...statMuse.sources);
  warnings.push(...hardRock.warnings, ...statMuse.warnings);

  for (const sport of sports) {
    opportunities.push(...buildMarketFamilyOpportunities(gameWindow.games, sport));
  }

  const pricedOpportunities = opportunities.filter((entry) => entry.status === "priced_online");
  const oddsNeededOpportunities = opportunities.filter((entry) => entry.status === "odds_needed");

  return {
    fetchedAt,
    dates,
    sports,
    gameWindow,
    sources: sourceRecords,
    opportunities,
    summary: {
      games: gameWindow.games.length,
      mlbGames: gameWindow.games.filter((game) => game.sport === "mlb").length,
      worldCupGames: gameWindow.games.filter((game) => game.sport === "worldcup").length,
      opportunities: opportunities.length,
      pricedOpportunities: pricedOpportunities.length,
      oddsNeededOpportunities: oddsNeededOpportunities.length,
      sources: sourceRecords.length
    },
    warnings: [
      ...warnings,
      "Only rows with status priced_online include current visible odds. Market-family rows identify possible bet types but still require a verified sportsbook price."
    ]
  };
}

module.exports = {
  COVERS_MLB_PROPS_URL,
  HARD_ROCK_MLB_URL,
  HARD_ROCK_WORLD_CUP_URL,
  fetchOnlineOpportunities,
  parseCoversMlbProps
};
