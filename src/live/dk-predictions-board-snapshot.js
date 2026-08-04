const MARKET_TYPE_BY_LEAGUE = Object.freeze({
  MLB: Object.freeze({
    moneyline: "MLB_side",
    total: "MLB_total",
    runLine: "MLB_runline",
    totalBases: "MLB_total_bases",
    strikeouts: "MLB_pitcher_strikeouts"
  }),
  "World Cup": Object.freeze({
    moneyline: "soccer_moneyline"
  }),
  NBASL: Object.freeze({
    moneyline: "NBA_side",
    total: "NBA_total",
    runLine: "NBA_spread"
  }),
  NBA: Object.freeze({
    moneyline: "NBA_side",
    total: "NBA_total",
    runLine: "NBA_spread"
  }),
  WNBA: Object.freeze({
    moneyline: "WNBA_side",
    total: "WNBA_total",
    runLine: "WNBA_spread"
  }),
  NHL: Object.freeze({
    moneyline: "NHL_side",
    total: "NHL_total",
    runLine: "NHL_puckline"
  }),
  Tennis: Object.freeze({
    moneyline: "tennis_moneyline"
  })
});

const GAME_LINE_CONFIG = Object.freeze({
  NBASL: Object.freeze({ league: "NBASL", sport: "basketball" }),
  NBA: Object.freeze({ league: "NBA", sport: "basketball" }),
  WNBA: Object.freeze({ league: "WNBA", sport: "basketball" }),
  NHL: Object.freeze({ league: "NHL", sport: "hockey" }),
  TENNIS: Object.freeze({ league: "Tennis", sport: "tennis" })
});

const PROP_TITLE_PATTERN = /^(.+?)\s+(Total Bases|Total Strikeouts)$/i;
const MATCHUP_PATTERN = /^(.+?)\s+@\s+(.+)$/;
const OVER_LINE_PATTERN = /^Over\s+([+\-−]?\d+(?:\.\d+)?)$/i;
const TOTAL_SIDE_PATTERN = /^([OU0])\s+([+\-−]?\d+(?:\.\d+)?)$/i;
const ODDS_PATTERN = /^[+\-−]\d{2,5}$/;
const START_TIME_PATTERN = /^(?:(Today|Tomorrow|Mon(?:day)?|Tue(?:sday)?|Wed(?:nesday)?|Thu(?:rsday)?|Fri(?:day)?|Sat(?:urday)?|Sun(?:day)?)\s+)?\d{1,2}:\d{2}\s?(AM|PM)$/i;
const MARKET_LABELS = new Set(["Run Line", "Spread", "Total", "To Win"]);
const NON_TEAM_LABELS = new Set([
  "Games",
  "Points",
  "Threes",
  "Rebounds",
  "Assists",
  "Futures",
  "Summer League",
  "LeBron James",
  "Live",
  "1st Set",
  "2nd Set",
  "3rd Set",
  "Final Set",
  "More",
  "Home",
  "Search",
  "My Trades",
  "Pick6",
  "Rewards"
]);

function normalizeMinus(value) {
  return String(value ?? "").replaceAll("−", "-").trim();
}

function toNumber(value) {
  if (value === null || value === undefined || value === "") {
    return null;
  }

  const normalized = normalizeMinus(value).replace(/^\+/, "");
  const number = Number(normalized);
  return Number.isFinite(number) ? number : null;
}

function toAmericanOdds(value) {
  const number = toNumber(value);

  if (!Number.isFinite(number) || number === 0) {
    return null;
  }

  return number;
}

function isAmericanOddsToken(value) {
  return ODDS_PATTERN.test(normalizeMinus(value));
}

function americanToDecimal(americanOdds) {
  if (!Number.isFinite(americanOdds) || americanOdds === 0) {
    return null;
  }

  return americanOdds > 0 ? 1 + americanOdds / 100 : 1 + 100 / Math.abs(americanOdds);
}

function americanToImpliedProbability(americanOdds) {
  if (!Number.isFinite(americanOdds) || americanOdds === 0) {
    return null;
  }

  return americanOdds > 0 ? 100 / (americanOdds + 100) : Math.abs(americanOdds) / (Math.abs(americanOdds) + 100);
}

function formatAmericanOdds(americanOdds) {
  if (!Number.isFinite(americanOdds)) {
    return "";
  }

  return americanOdds > 0 ? `+${americanOdds}` : String(americanOdds);
}

function roundMoney(value) {
  return Number.isFinite(value) ? Math.round(value * 100) / 100 : null;
}

function roundProbability(value) {
  return Number.isFinite(value) ? Math.round(value * 10000) / 10000 : null;
}

function slug(value) {
  return String(value ?? "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "");
}

function splitOcrLines(text) {
  return String(text ?? "")
    .split(/\r?\n/)
    .flatMap((line) => {
      const value = normalizeMinus(line).replace(/\s+/g, " ").trim();

      if (!value) {
        return [];
      }

      const yesNoOddsMatch = /^(Yes|No)\s+([+\-−]\d{2,5})$/i.exec(value);

      if (yesNoOddsMatch) {
        return [yesNoOddsMatch[1], yesNoOddsMatch[2]];
      }

      return [value];
    })
    .filter(Boolean);
}

function extractBankrollFromText(text) {
  const match = /\$\s*([0-9][0-9,]*(?:\.\d{1,2})?)\s*\+?/.exec(String(text ?? ""));

  if (!match) {
    return null;
  }

  return toNumber(match[1].replaceAll(",", ""));
}

function findStartTime(lines) {
  return lines.find((line) => START_TIME_PATTERN.test(line)) ?? null;
}

function normalizeLeagueKey(value) {
  return String(value ?? "").toUpperCase().replace(/\s+/g, "");
}

function gameLineConfig(value) {
  return GAME_LINE_CONFIG[normalizeLeagueKey(value)] ?? null;
}

function statConfig(statLabel) {
  if (/strikeouts/i.test(statLabel)) {
    return {
      key: "strikeouts",
      marketType: "MLB_pitcher_strikeouts",
      marketNameSuffix: "strikeouts"
    };
  }

  return {
    key: "totalBases",
    marketType: "MLB_total_bases",
    marketNameSuffix: "total bases"
  };
}

function isPropTitle(line) {
  return PROP_TITLE_PATTERN.test(line);
}

function isStartTime(line) {
  return START_TIME_PATTERN.test(normalizeMinus(line).replace(/\s*(AM|PM)$/i, " $1"));
}

function looksLikeTeamName(line) {
  const value = String(line ?? "").trim();

  if (
    !value ||
    MARKET_LABELS.has(value) ||
    NON_TEAM_LABELS.has(value) ||
    gameLineConfig(value) ||
    isPropTitle(value) ||
    isAmericanOddsToken(value) ||
    isStartTime(value) ||
    /^[OU]\s*[+\-]?\d+(?:\.\d+)?(?:\s+[+\-]\d{2,5})?$/i.test(value) ||
    /^[+\-]?\d+(?:\.\d+)?\s+[+\-]\d{2,5}$/.test(value)
  ) {
    return false;
  }

  if (/^(More|Home|Search|Details|Claim|Opt-In|View Leaderboard|Rewards|Pick6|My Trades)\b/i.test(value)) {
    return false;
  }

  return /[A-Za-z]/.test(value);
}

function readPropCards(lines, sourceFile) {
  const cards = [];

  for (let index = 0; index < lines.length; index += 1) {
    const titleMatch = PROP_TITLE_PATTERN.exec(lines[index]);

    if (!titleMatch) {
      continue;
    }

    const matchupLine = lines[index + 1] ?? "";
    const matchupMatch = MATCHUP_PATTERN.exec(matchupLine);

    if (!matchupMatch) {
      continue;
    }

    const overLines = [];
    let cursor = index + 2;

    while (cursor < lines.length && !isPropTitle(lines[cursor])) {
      const overMatch = OVER_LINE_PATTERN.exec(lines[cursor]);

      if (overMatch) {
        overLines.push({
          line: toNumber(overMatch[1]),
          raw: lines[cursor]
        });
      }

      cursor += 1;
    }

    if (overLines.length === 0) {
      continue;
    }

    cards.push({
      playerName: titleMatch[1].trim(),
      statLabel: titleMatch[2].trim(),
      matchup: matchupLine,
      away: matchupMatch[1].trim(),
      home: matchupMatch[2].trim(),
      overLines,
      startIndex: index,
      sourceFile
    });
  }

  return cards;
}

function readNextOdds(lines, index) {
  const next = lines[index];

  if (!isAmericanOddsToken(next)) {
    return {
      odds: null,
      nextIndex: index - 1
    };
  }

  return {
    odds: toAmericanOdds(next),
    nextIndex: index
  };
}

function readPriceBlocks(lines) {
  const blocks = [];
  let current = null;

  function ensureCurrent(startIndex) {
    if (!current) {
      current = {
        startIndex,
        yesOdds: [],
        noOdds: []
      };
    }

    return current;
  }

  function flushCurrent() {
    if (!current) {
      return;
    }

    if (current.yesOdds.length > 0 || current.noOdds.length > 0) {
      blocks.push(current);
    }

    current = null;
  }

  for (let index = 0; index < lines.length; index += 1) {
    const line = lines[index];

    if (/^Yes$/i.test(line)) {
      const block = ensureCurrent(index);
      const next = readNextOdds(lines, index + 1);
      block.yesOdds.push(next.odds);
      index = next.nextIndex;
      continue;
    }

    if (/^No$/i.test(line)) {
      const block = ensureCurrent(index);
      const next = readNextOdds(lines, index + 1);
      block.noOdds.push(next.odds);
      index = next.nextIndex;
      continue;
    }

    if (/^More\b/i.test(line)) {
      flushCurrent();
    }
  }

  flushCurrent();

  return blocks.filter((block) => block.yesOdds.some((odds) => odds !== null));
}

function parseTotalSideLine(value) {
  const match = TOTAL_SIDE_PATTERN.exec(value);

  if (!match) {
    return null;
  }

  return {
    side: match[1].toUpperCase() === "U" ? "under" : "over",
    line: toNumber(match[2])
  };
}

function readGameLineEvents(lines, sourceFile) {
  const eventHeaders = [];
  const runTotalBlocks = [];
  const moneylineBlocks = [];

  for (let index = 0; index < lines.length; index += 1) {
    if (lines[index] !== "MLB") {
      continue;
    }

    const away = lines[index + 1];
    const home = lines[index + 2];
    const startTime = lines[index + 3];

    if (!looksLikeTeamName(away) || !looksLikeTeamName(home) || !isStartTime(startTime)) {
      continue;
    }

    eventHeaders.push({
      league: "MLB",
      sport: "baseball",
      game: `${away} @ ${home}`,
      startTime,
      away: { name: away },
      home: { name: home },
      sourceFile,
      markets: {
        moneyline: [],
        runLine: [],
        total: []
      }
    });
  }

  for (let index = 0; index < lines.length; index += 1) {
    if (lines[index] === "Run Line") {
      const awayRunLine = toNumber(lines[index + 1]);
      const awayRunLineOdds = toAmericanOdds(lines[index + 2]);
      const homeRunLine = toNumber(lines[index + 3]);
      const homeRunLineOdds = toAmericanOdds(lines[index + 4]);
      const totalLabel = lines[index + 5];
      const over = parseTotalSideLine(lines[index + 6] ?? "");
      const overOdds = toAmericanOdds(lines[index + 7]);
      const under = parseTotalSideLine(lines[index + 8] ?? "");
      const underOdds = toAmericanOdds(lines[index + 9]);

      if (
        Number.isFinite(awayRunLine) &&
        Number.isFinite(awayRunLineOdds) &&
        Number.isFinite(homeRunLine) &&
        Number.isFinite(homeRunLineOdds) &&
        totalLabel === "Total" &&
        over?.side === "over" &&
        Number.isFinite(overOdds) &&
        under?.side === "under" &&
        Number.isFinite(underOdds)
      ) {
        runTotalBlocks.push({
          runLine: [
            { side: "away", line: awayRunLine, odds: awayRunLineOdds },
            { side: "home", line: homeRunLine, odds: homeRunLineOdds }
          ],
          total: [
            { side: "over", line: over.line, odds: overOdds },
            { side: "under", line: under.line, odds: underOdds }
          ]
        });
      }
    }

    if (lines[index] === "To Win") {
      const awayOdds = toAmericanOdds(lines[index + 1]);
      const homeOdds = toAmericanOdds(lines[index + 2]);

      if (Number.isFinite(awayOdds) && Number.isFinite(homeOdds)) {
        moneylineBlocks.push([
          { side: "away", odds: awayOdds },
          { side: "home", odds: homeOdds }
        ]);
      }
    }
  }

  return eventHeaders.map((event, index) => {
    const runTotalBlock = runTotalBlocks[index];
    const moneylineBlock = moneylineBlocks[index];

    if (runTotalBlock) {
      event.markets.runLine = runTotalBlock.runLine;
      event.markets.total = runTotalBlock.total;
    }

    if (moneylineBlock) {
      event.markets.moneyline = moneylineBlock;
    }

    return event;
  });
}

function parseCompactSpread(value) {
  const match = /^([+\-]?\d+(?:\.\d+)?)\s+([+\-]\d{2,5})$/.exec(String(value ?? "").trim());

  if (!match) {
    return null;
  }

  return {
    line: toNumber(match[1]),
    odds: toAmericanOdds(match[2])
  };
}

function parseCompactTotal(value) {
  const match = /^([OU])\s*([+\-]?\d+(?:\.\d+)?)\s+([+\-]\d{2,5})$/i.exec(String(value ?? "").trim());

  if (!match) {
    return null;
  }

  return {
    side: match[1].toUpperCase() === "U" ? "under" : "over",
    line: toNumber(match[2]),
    odds: toAmericanOdds(match[3])
  };
}

function parseExpandedSpread(value) {
  const match = /^[+\-]?\d+(?:\.\d+)?$/.test(String(value ?? "").trim());

  return match ? toNumber(value) : null;
}

function parseExpandedTotal(value) {
  const match = /^([OU])\s*([+\-]?\d+(?:\.\d+)?)$/i.exec(String(value ?? "").trim());

  if (!match) {
    return null;
  }

  return {
    side: match[1].toUpperCase() === "U" ? "under" : "over",
    line: toNumber(match[2])
  };
}

function readCompactGameMarkets(block) {
  const spreads = [];
  const totals = [];
  const standaloneOdds = [];
  const consumedIndexes = new Set();

  block.forEach((line, index) => {
    if (consumedIndexes.has(index)) {
      return;
    }

    const spread = parseCompactSpread(line);
    const total = parseCompactTotal(line);

    if (spread) {
      spreads.push(spread);
      return;
    }

    if (total) {
      totals.push(total);
      return;
    }

    const nextOdds = block[index + 1];
    const nextOddsValue = isAmericanOddsToken(nextOdds) ? toAmericanOdds(nextOdds) : null;
    const expandedSpread = parseExpandedSpread(line);
    const expandedTotal = parseExpandedTotal(line);

    if (expandedSpread !== null && nextOddsValue !== null) {
      spreads.push({ line: expandedSpread, odds: nextOddsValue });
      consumedIndexes.add(index + 1);
      return;
    }

    if (expandedTotal && nextOddsValue !== null) {
      totals.push({ ...expandedTotal, odds: nextOddsValue });
      consumedIndexes.add(index + 1);
      return;
    }

    if (isAmericanOddsToken(line)) {
      standaloneOdds.push(toAmericanOdds(line));
    }
  });

  return {
    spread: spreads.slice(0, 2).map((market, index) => ({
      side: index === 0 ? "away" : "home",
      line: market.line,
      odds: market.odds
    })),
    total: totals.slice(0, 2),
    moneyline: standaloneOdds.slice(0, 2).map((odds, index) => ({
      side: index === 0 ? "away" : "home",
      odds
    }))
  };
}

function readGenericGameLineEvents(lines, sourceFile) {
  const headerIndexes = lines
    .map((line, index) => ({ line, index, config: gameLineConfig(line) }))
    .filter((entry) => entry.config);

  return headerIndexes.flatMap((header, headerIndex) => {
    const endIndex = headerIndexes[headerIndex + 1]?.index ?? lines.length;
    const block = lines.slice(header.index + 1, endIndex);
    const teamNames = block.filter(looksLikeTeamName).slice(0, 2);

    if (teamNames.length < 2) {
      return [];
    }

    const config = header.config;
    const compactMarkets = readCompactGameMarkets(block);
    const live = config.sport === "tennis" && block.some((line) => /^Live$/i.test(line));
    const markets = {
      moneyline: compactMarkets.moneyline,
      runLine: compactMarkets.spread.map((market) => ({ ...market, marketName: "spread" })),
      total: compactMarkets.total
    };

    return [{
      league: config.league,
      sport: config.sport,
      game: `${teamNames[0]} @ ${teamNames[1]}`,
      startTime: findStartTime(block),
      status: live ? "live" : "current_at_capture",
      pregameOrLive: live ? "live" : "pregame",
      away: { name: teamNames[0] },
      home: { name: teamNames[1] },
      sourceFile,
      markets
    }];
  });
}

function parseDkPredictionsText(input = {}) {
  const text = String(input.text ?? "");
  const lines = splitOcrLines(text);
  const sourceFile = input.sourceFile ?? null;
  const cards = readPropCards(lines, sourceFile);
  const gameLineEvents = [
    ...readGameLineEvents(lines, sourceFile),
    ...readGenericGameLineEvents(lines, sourceFile)
  ];
  const allPriceBlocks = readPriceBlocks(lines);
  const firstCardIndex = cards[0]?.startIndex ?? 0;
  const priceBlocks = allPriceBlocks.filter((block) => block.startIndex > firstCardIndex);
  const startTime = findStartTime(lines);
  const eventsByGame = new Map();
  const warnings = [];

  cards.forEach((card, cardIndex) => {
    const priceBlock = priceBlocks[cardIndex] ?? { yesOdds: [], noOdds: [] };
    const stat = statConfig(card.statLabel);
    const game = card.matchup;

    if (!eventsByGame.has(game)) {
      eventsByGame.set(game, {
        league: "MLB",
        sport: "baseball",
        game,
        startTime,
        away: { name: card.away },
        home: { name: card.home },
        sourceFile,
        markets: {
          playerProp: []
        }
      });
    }

    if (priceBlock.yesOdds.length < card.overLines.length) {
      warnings.push(`Only ${priceBlock.yesOdds.length} Yes prices were found for ${card.playerName} ${card.statLabel}.`);
    }

    const event = eventsByGame.get(game);

    card.overLines.forEach((overLine, lineIndex) => {
      const yesOdds = priceBlock.yesOdds[lineIndex] ?? null;

      if (yesOdds === null) {
        return;
      }

      const noOdds = priceBlock.noOdds[lineIndex] ?? null;

      event.markets.playerProp.push({
        selection: card.playerName,
        playerName: card.playerName,
        statKey: stat.key,
        statLabel: card.statLabel,
        marketType: stat.marketType,
        marketName: `over ${overLine.line} ${stat.marketNameSuffix}`,
        side: "over",
        line: overLine.line,
        odds: yesOdds,
        oppositeOdds: noOdds,
        oppositeSide: "under",
        matchup: game,
        sourceFile,
        sourceFrameOrScreenshot: sourceFile,
        notes: noOdds === null ? "No/under price was locked or not visible in the screenshot." : ""
      });
    });
  });

  if (cards.length > 0 && priceBlocks.length < cards.length) {
    warnings.push(`Only ${priceBlocks.length} visible Yes/No price blocks were found for ${cards.length} prop cards.`);
  }

  return {
    lines,
    bankroll: extractBankrollFromText(text),
    events: cards.length > 0 ? Array.from(eventsByGame.values()) : gameLineEvents,
    propCards: cards,
    priceBlocks,
    warnings
  };
}

function datePart(value) {
  const match = /^\d{4}-\d{2}-\d{2}/.exec(String(value ?? ""));
  return match?.[0] ?? null;
}

function eventGame(event) {
  if (event.game) {
    return String(event.game);
  }

  const away = event.away?.abbreviation ?? event.away?.name ?? "AWAY";
  const home = event.home?.abbreviation ?? event.home?.name ?? "HOME";
  return `${away} @ ${home}`;
}

function marketSelection(event, market) {
  if (market.selection) {
    return String(market.selection);
  }

  if (market.side === "away") {
    return event.away?.name ?? event.away?.abbreviation ?? "Away";
  }

  if (market.side === "home") {
    return event.home?.name ?? event.home?.abbreviation ?? "Home";
  }

  if (market.side === "draw") {
    return "Draw";
  }

  if (market.side === "over" || market.side === "under") {
    return `${market.side === "over" ? "Over" : "Under"} ${market.line}`;
  }

  return String(market.side ?? "selection");
}

function marketName(kind, market) {
  if (market.marketName) {
    return market.marketName;
  }

  if (kind === "moneyline") {
    return "moneyline";
  }

  if (kind === "runLine") {
    return "runline";
  }

  if (kind === "total") {
    return `${market.side === "under" ? "under" : "over"} ${market.line}`;
  }

  return kind;
}

function marketTypeFor(event, kind, market = {}) {
  if (market.marketType) {
    return market.marketType;
  }

  const league = event.league ?? event.sport ?? "MLB";
  const normalizedKind = kind === "runLine" ? "runLine" : kind;
  return MARKET_TYPE_BY_LEAGUE[league]?.[normalizedKind] ?? kind;
}

function normalizeMarket(event, kind, market, context) {
  const odds = toAmericanOdds(market.odds);
  const oppositeOdds = toAmericanOdds(market.oppositeOdds);
  const line = toNumber(market.line);
  const decimalOdds = americanToDecimal(odds);
  const impliedProbability = americanToImpliedProbability(odds);
  const oppositeImpliedProbability = americanToImpliedProbability(oppositeOdds);
  const stake = Number.isFinite(context.defaultStake) ? context.defaultStake : 1;
  const payout = decimalOdds === null ? null : stake * decimalOdds;
  const selection = marketSelection(event, { ...market, line });
  const game = eventGame(event);
  const sourceFile = market.sourceFile ?? event.sourceFile ?? context.sourceFile ?? null;
  const sourceFrameOrScreenshot = market.sourceFrameOrScreenshot ?? event.sourceFrameOrScreenshot ?? sourceFile;

  return {
    id: slug([
      context.snapshotDate ?? "snapshot",
      game,
      selection,
      kind,
      line ?? "",
      formatAmericanOdds(odds)
    ].join(" ")),
    date: context.snapshotDate,
    time: event.startTime ?? event.time ?? null,
    sport: event.sport ?? (event.league === "World Cup" ? "soccer" : "baseball"),
    league: event.league ?? "MLB",
    game,
    team_or_player: selection,
    market_type: marketTypeFor(event, kind, market),
    market_name: marketName(kind, { ...market, line }),
    side: market.side ?? null,
    line,
    odds,
    opposite_odds: oppositeOdds,
    opposite_side: market.oppositeSide ?? null,
    stake,
    payout: roundMoney(payout),
    net_profit: roundMoney(payout === null ? null : payout - stake),
    status: event.status ?? context.status,
    pregame_or_live: event.pregameOrLive ?? "pregame",
    source_type: context.sourceType,
    source_file: sourceFile,
    source_frame_or_screenshot: sourceFrameOrScreenshot,
    captured_at: event.capturedAt ?? context.capturedAt,
    bankroll_at_time: context.bankroll,
    implied_probability: roundProbability(impliedProbability),
    opposite_implied_probability: roundProbability(oppositeImpliedProbability),
    decimal_odds: decimalOdds === null ? null : Math.round(decimalOdds * 10000) / 10000,
    player_name: market.playerName ?? null,
    stat_key: market.statKey ?? null,
    stat_label: market.statLabel ?? null,
    matchup: market.matchup ?? game,
    source_market_kind: kind,
    notes: market.notes ?? event.notes ?? ""
  };
}

function flattenEventMarkets(event, context) {
  const rows = [];
  const markets = event.markets ?? {};

  for (const [kind, values] of Object.entries(markets)) {
    if (!Array.isArray(values)) {
      continue;
    }

    for (const market of values) {
      const normalized = normalizeMarket(event, kind, market, context);

      if (normalized.odds !== null) {
        rows.push(normalized);
      }
    }
  }

  return rows;
}

function parseDkPredictionsBoardSnapshot(input = {}, options = {}) {
  const parsedText = parseDkPredictionsText(input);
  const suppliedEvents = Array.isArray(input.events) ? input.events : [];
  const events = suppliedEvents.length > 0 ? suppliedEvents : parsedText.events;
  const capturedAt = options.capturedAt ?? input.capturedAt ?? null;
  const suppliedBankroll = toNumber(options.bankroll ?? input.bankroll);
  const bankroll = suppliedBankroll ?? parsedText.bankroll;
  const defaultStake = toNumber(options.defaultStake ?? input.defaultStake ?? 1) ?? 1;
  const sourceFiles = Array.isArray(input.sourceFiles)
    ? input.sourceFiles
    : input.sourceFile
      ? [input.sourceFile]
      : [];
  const context = {
    bankroll,
    capturedAt,
    defaultStake,
    sourceFile: input.sourceFile ?? null,
    snapshotDate: options.date ?? input.date ?? datePart(capturedAt),
    sourceType: input.sourceType ?? "dk_predictions_visible_screenshot",
    status: input.status ?? "current_at_capture"
  };
  const markets = events.flatMap((event) => flattenEventMarkets(event, context));
  const playerPropMarkets = markets.filter((market) => market.source_market_kind === "playerProp");
  const warnings = [
    "DraftKings Predictions app rows are normalized from visible screenshot/manual rows. Do not infer hidden markets.",
    "Status is current_at_capture only; re-check the board before betting if time has passed.",
    ...parsedText.warnings
  ];

  if (events.length === 0) {
    warnings.push("No events were supplied. Paste normalized DK Predictions app rows or extract them from screenshots first.");
  }

  if (!Number.isFinite(bankroll)) {
    warnings.push("Visible bankroll was not supplied or could not be parsed.");
  }

  return {
    provider: "DraftKings Predictions",
    sourceType: context.sourceType,
    capturedAt,
    parsedAt: new Date().toISOString(),
    bankroll,
    sourceFiles,
    events,
    markets,
    summary: {
      events: events.length,
      markets: markets.length,
      moneylineMarkets: markets.filter((market) => market.market_name === "moneyline").length,
      runLineMarkets: markets.filter((market) => market.market_type === "MLB_runline").length,
      spreadMarkets: markets.filter((market) => market.source_market_kind === "runLine" && market.market_type !== "MLB_runline").length,
      totalMarkets: markets.filter((market) => market.source_market_kind === "total").length,
      playerPropMarkets: playerPropMarkets.length,
      totalBasesMarkets: playerPropMarkets.filter((market) => market.market_type === "MLB_total_bases").length,
      strikeoutMarkets: playerPropMarkets.filter((market) => market.market_type === "MLB_pitcher_strikeouts").length,
      rawPropCards: parsedText.propCards.length,
      visiblePriceBlocks: parsedText.priceBlocks.length,
      lockedOrMissingNoPrices: playerPropMarkets.filter((market) => market.opposite_odds === null).length,
      mlbEvents: events.filter((event) => (event.league ?? "MLB") === "MLB").length,
      basketballEvents: events.filter((event) => event.sport === "basketball").length,
      hockeyEvents: events.filter((event) => event.sport === "hockey").length,
      tennisEvents: events.filter((event) => event.sport === "tennis").length,
      liveEvents: events.filter((event) => event.pregameOrLive === "live" || event.status === "live").length,
      worldCupEvents: events.filter((event) => event.league === "World Cup").length,
      sourceFiles: sourceFiles.length
    },
    warnings
  };
}

module.exports = {
  americanToDecimal,
  americanToImpliedProbability,
  parseDkPredictionsText,
  parseDkPredictionsBoardSnapshot
};
