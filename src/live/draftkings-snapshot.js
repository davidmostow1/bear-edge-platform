const SECTION_LABELS = new Set(["Today", "Tomorrow"]);
const MARKET_HEADER_LABELS = new Set(["Run Line", "Total", "Moneyline"]);
const STOP_LABELS = new Set(["Futures", "Quick SGP", "GAME LINES", "BATTER PROPS", "PITCHER PROPS", "QUICK HITS", "LIVE BATTER PROPS"]);
const TIME_PATTERN = /^(Today|Tomorrow)\s+\d{1,2}:\d{2}\s?(AM|PM)$/i;
const LIVE_STATUS_PATTERN = /^(\d+(st|nd|rd|th)|Top \d+|Bottom \d+|Final|Suspended|Delayed)$/i;
const ODDS_PATTERN = /^[+\-−]\d{2,5}$/;
const LINE_PATTERN = /^[+\-−]?\d+(?:\.\d+)?$/;
const INTEGER_PATTERN = /^\d+$/;
const ARTICLE_TIMESTAMP_PATTERN = /^\d{1,2}:\d{2}\s?(AM|PM)\s+·\s+[A-Z][a-z]{2}\s+\d{1,2},\s+\d{4}$/;

function normalizeMinus(value) {
  return String(value ?? "").replaceAll("−", "-").trim();
}

function compactLine(line) {
  return normalizeMinus(line).replace(/\s+/g, " ").trim();
}

function expandOcrLine(line) {
  const value = compactLine(line);

  if (!value) {
    return [];
  }

  if (/^Run Line\s+Total\s+Moneyline$/i.test(value)) {
    return ["Run Line", "Total", "Moneyline"];
  }

  const totalMatch = /^(O|U)\s+([+\-−]?\d+(?:\.\d+)?)\s+([+\-−]\d{2,5})$/i.exec(value);

  if (totalMatch) {
    return [totalMatch[1].toUpperCase(), totalMatch[2], totalMatch[3]];
  }

  const lineAndOddsMatch = /^([+\-−]?\d+(?:\.\d+)?)\s+([+\-−]\d{2,5})$/.exec(value);

  if (lineAndOddsMatch) {
    return [lineAndOddsMatch[1], lineAndOddsMatch[2]];
  }

  const twoOddsMatch = /^([+\-−]\d{2,5})\s+([+\-−]\d{2,5})$/.exec(value);

  if (twoOddsMatch) {
    return [twoOddsMatch[1], twoOddsMatch[2]];
  }

  return [value];
}

function splitLines(text) {
  return String(text ?? "")
    .split(/\r?\n/)
    .flatMap(expandOcrLine)
    .filter(Boolean);
}

function isOdds(value) {
  return ODDS_PATTERN.test(normalizeMinus(value));
}

function isNumberLine(value) {
  return LINE_PATTERN.test(normalizeMinus(value));
}

function toNumber(value) {
  return Number(normalizeMinus(value));
}

function isAt(value) {
  return String(value ?? "").toUpperCase() === "AT";
}

function isMarketHeaderStart(lines, index) {
  return MARKET_HEADER_LABELS.has(lines[index]) && MARKET_HEADER_LABELS.has(lines[index + 1]) && MARKET_HEADER_LABELS.has(lines[index + 2]);
}

function isSectionLabel(value) {
  return SECTION_LABELS.has(value);
}

function isGameTerminal(value) {
  return TIME_PATTERN.test(value) || LIVE_STATUS_PATTERN.test(value);
}

function looksLikeTeamName(value) {
  if (!value || isSectionLabel(value) || STOP_LABELS.has(value) || MARKET_HEADER_LABELS.has(value)) {
    return false;
  }

  if (isOdds(value) || isNumberLine(value) || isAt(value) || value === "O" || value === "U" || value === "More Bets") {
    return false;
  }

  return /[A-Za-z]/.test(value);
}

function readCompetitorContext(lines, index) {
  const teamName = lines[index];
  const next = lines[index + 1];
  let cursor = index + 1;
  let pitcher = null;
  let score = null;

  if (INTEGER_PATTERN.test(next ?? "")) {
    score = toNumber(next);
    cursor += 1;
  } else if (next && !isAt(next) && !isNumberLine(next) && !isOdds(next)) {
    pitcher = next;
    cursor += 1;
  }

  return {
    teamName,
    pitcher,
    score,
    nextIndex: cursor
  };
}

function readMarketBlock(lines, index) {
  const awayRunLine = lines[index];
  const awayRunLineOdds = lines[index + 1];
  const overToken = lines[index + 2];
  const totalLine = lines[index + 3];
  const overOdds = lines[index + 4];
  const awayMoneyline = lines[index + 5];
  const homeRunLine = lines[index + 6];
  const homeRunLineOdds = lines[index + 7];
  const underToken = lines[index + 8];
  const underTotalLine = lines[index + 9];
  const underOdds = lines[index + 10];
  const maybeHomeMoneyline = lines[index + 11];
  const maybeTerminal = lines[index + 12];
  const hasHomeMoneyline = isOdds(maybeHomeMoneyline);
  const homeMoneyline = hasHomeMoneyline ? maybeHomeMoneyline : null;
  const terminal = hasHomeMoneyline ? maybeTerminal : maybeHomeMoneyline;

  if (
    !isNumberLine(awayRunLine) ||
    !isOdds(awayRunLineOdds) ||
    overToken !== "O" ||
    !isNumberLine(totalLine) ||
    !isOdds(overOdds) ||
    !isOdds(awayMoneyline) ||
    !isNumberLine(homeRunLine) ||
    !isOdds(homeRunLineOdds) ||
    underToken !== "U" ||
    !isNumberLine(underTotalLine) ||
    !isOdds(underOdds) ||
    !isGameTerminal(terminal)
  ) {
    return null;
  }

  const moneyline = [{ side: "away", odds: toNumber(awayMoneyline) }];
  const warnings = [];

  if (homeMoneyline === null) {
    warnings.push("Missing visible home moneyline in DraftKings row.");
  } else {
    moneyline.push({ side: "home", odds: toNumber(homeMoneyline) });
  }

  return {
    markets: {
      runLine: [
        { side: "away", line: toNumber(awayRunLine), odds: toNumber(awayRunLineOdds) },
        { side: "home", line: toNumber(homeRunLine), odds: toNumber(homeRunLineOdds) }
      ],
      total: [
        { side: "over", line: toNumber(totalLine), odds: toNumber(overOdds) },
        { side: "under", line: toNumber(underTotalLine), odds: toNumber(underOdds) }
      ],
      moneyline
    },
    warnings,
    terminal,
    nextIndex: index + (hasHomeMoneyline ? 13 : 12)
  };
}

function parseEvents(lines) {
  const events = [];
  let currentSection = null;

  for (let index = 0; index < lines.length; index += 1) {
    const line = lines[index];

    if (isSectionLabel(line) && isMarketHeaderStart(lines, index + 1)) {
      currentSection = line.toLowerCase();
      index += 3;
      continue;
    }

    if (!currentSection || !looksLikeTeamName(line)) {
      continue;
    }

    const away = readCompetitorContext(lines, index);

    if (!isAt(lines[away.nextIndex])) {
      continue;
    }

    const home = readCompetitorContext(lines, away.nextIndex + 1);
    const marketBlock = readMarketBlock(lines, home.nextIndex);

    if (!marketBlock) {
      continue;
    }

    const terminal = marketBlock.terminal;
    const isScheduled = TIME_PATTERN.test(terminal);
    const startTime = isScheduled ? terminal : null;
    const status = isScheduled ? null : terminal;

    events.push({
      dateBucket: currentSection,
      away: {
        name: away.teamName,
        probablePitcher: away.pitcher,
        score: away.score
      },
      home: {
        name: home.teamName,
        probablePitcher: home.pitcher,
        score: home.score
      },
      status,
      startTime,
      markets: {
        runLine: marketBlock.markets.runLine.map((market) => ({
          ...market,
          selection: market.side === "away" ? away.teamName : home.teamName
        })),
        total: marketBlock.markets.total.map((market) => ({
          ...market,
          selection: `${market.side === "over" ? "Over" : "Under"} ${market.line}`
        })),
        moneyline: marketBlock.markets.moneyline.map((market) => ({
          ...market,
          selection: market.side === "away" ? away.teamName : home.teamName
        }))
      },
      warnings: marketBlock.warnings
    });

    index = marketBlock.nextIndex;
  }

  return events;
}

function parseMarketTabs(lines) {
  return lines.filter((line, index) => {
    if (line === "Games") {
      return lines.slice(index + 1, index + 7).some((candidate) => STOP_LABELS.has(candidate));
    }

    return STOP_LABELS.has(line);
  });
}

function parseEditorialArticles(lines) {
  const newsIndex = lines.indexOf("MLB Betting News");
  const endIndex = lines.indexOf("MLB Odds and Betting");

  if (newsIndex < 0 || endIndex <= newsIndex) {
    return [];
  }

  const articles = [];
  let index = newsIndex + 1;

  while (index < endIndex) {
    if (!ARTICLE_TIMESTAMP_PATTERN.test(lines[index] ?? "")) {
      index += 1;
      continue;
    }

    const publishedAtLabel = lines[index];
    const title = lines[index + 1] ?? null;
    const summary = lines[index + 2] ?? null;
    const viewArticleLabel = lines[index + 3] ?? null;
    const authorLine = lines[index + 4] ?? "";
    const author = /^Author\(s\):\s*(.*?)\.?$/.exec(authorLine)?.[1] ?? null;

    if (title && summary && viewArticleLabel === "VIEW FULL ARTICLE") {
      articles.push({
        publishedAtLabel,
        title,
        summary,
        author
      });
      index += 5;
      continue;
    }

    index += 1;
  }

  return articles;
}

function parseDraftKingsSnapshot(input, options = {}) {
  const rawText = typeof input === "string" ? input : input?.text;
  const text = String(rawText ?? "");

  if (!text.trim()) {
    throw new Error("DraftKings snapshot text is empty.");
  }

  const lines = splitLines(text);
  const events = parseEvents(lines);
  const articles = parseEditorialArticles(lines);
  const marketTabs = parseMarketTabs(lines);
  const serverTime = lines.find((line) => /^Server Time:/i.test(line)) ?? null;
  const parsedAt = new Date().toISOString();
  const warnings = [
    "Parsed from browser-visible DraftKings page text. Verify the board is current before evaluating.",
    "This parser only accepts explicit game-line rows with side, line, and American odds. It does not place bets or infer hidden markets.",
    "DraftKings Network prediction articles are editorial context only and are not treated as model probability or betting edge."
  ];

  if (events.length === 0) {
    warnings.push("No complete DraftKings game-line rows were parsed from the snapshot.");
  }

  const incompleteEvents = events.filter((event) => Array.isArray(event.warnings) && event.warnings.length > 0).length;

  if (incompleteEvents > 0) {
    warnings.push(`${incompleteEvents} DraftKings event row(s) had incomplete visible markets and require manual verification.`);
  }

  return {
    provider: "DraftKings",
    sourceType: "browser-visible sportsbook board snapshot",
    sourceUrl:
      options.sourceUrl ??
      input?.sourceUrl ??
      "https://sportsbook.draftkings.com/leagues/baseball/mlb?category=games&subcategory=game-lines",
    capturedAt: options.capturedAt ?? input?.capturedAt ?? null,
    parsedAt,
    serverTime,
    marketTabs,
    events,
    articles,
    summary: {
      lines: lines.length,
      events: events.length,
      todayEvents: events.filter((event) => event.dateBucket === "today").length,
      tomorrowEvents: events.filter((event) => event.dateBucket === "tomorrow").length,
      liveEvents: events.filter((event) => Boolean(event.status)).length,
      scheduledEvents: events.filter((event) => Boolean(event.startTime)).length,
      incompleteEvents,
      articleCount: articles.length,
      predictionArticleCount: articles.filter((article) => /prediction|pick|best bet|prop/i.test(article.title)).length,
      marketTabs: marketTabs.join(", "),
      moneylineMarkets: events.reduce((total, event) => total + event.markets.moneyline.length, 0),
      runLineMarkets: events.reduce((total, event) => total + event.markets.runLine.length, 0),
      totalMarkets: events.reduce((total, event) => total + event.markets.total.length, 0)
    },
    warnings
  };
}

module.exports = {
  parseDraftKingsSnapshot
};
