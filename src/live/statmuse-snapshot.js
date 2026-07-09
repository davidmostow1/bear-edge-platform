const GAME_STATUS_PATTERN = /^(Final|Top \d+|Bottom \d+|Mid \d+|End \d+|Suspended|Delayed)$/i;
const GAME_TIME_PATTERN = /^\d{1,2}:\d{2}\s?(AM|PM)$/i;
const MONEYLINE_PATTERN = /^[+-]\d{2,4}$/;
const INTEGER_PATTERN = /^\d+$/;
const SPORTS = new Set(["All", "NBA", "NHL", "MLB", "WNBA", "FC", "NFL", "CFB", "PGA", "Money"]);
const FOOTER_STARTS = new Set(["Get the latest news and updates from StatMuse", "Subscribe", "Home"]);

function compactLine(line) {
  return String(line ?? "").replace(/\s+/g, " ").trim();
}

function splitLines(text) {
  return String(text ?? "")
    .split(/\r?\n/)
    .map(compactLine)
    .filter(Boolean);
}

function readGame(tokens, startIndex) {
  let index = startIndex;
  const awayName = tokens[index++];
  const awayAbbr = tokens[index++];

  if (!awayName || !awayAbbr) {
    return null;
  }

  let awayScore = null;

  if (INTEGER_PATTERN.test(tokens[index] ?? "")) {
    awayScore = Number(tokens[index++]);
  }

  const homeName = tokens[index++];
  const homeAbbr = tokens[index++];

  if (!homeName || !homeAbbr) {
    return null;
  }

  let homeScore = null;
  let status = null;
  let startTime = null;
  let displayedMoneylineOdds = null;

  if (INTEGER_PATTERN.test(tokens[index] ?? "")) {
    homeScore = Number(tokens[index++]);
    status = tokens[index++] ?? null;
  } else if (GAME_TIME_PATTERN.test(tokens[index] ?? "")) {
    startTime = tokens[index++];

    if (MONEYLINE_PATTERN.test(tokens[index] ?? "")) {
      displayedMoneylineOdds = Number(tokens[index++]);
    }
  }

  if (!status && !startTime) {
    return null;
  }

  return {
    game: {
      away: {
        name: awayName,
        abbreviation: awayAbbr,
        score: awayScore
      },
      home: {
        name: homeName,
        abbreviation: homeAbbr,
        score: homeScore
      },
      status,
      startTime,
      displayedMoneylineOdds,
      oddsSide: displayedMoneylineOdds === null ? null : "unknown_from_paste"
    },
    nextIndex: index
  };
}

function parseGames(lines) {
  const moneyIndex = lines.indexOf("Money");
  const moreScoresIndex = lines.indexOf("More Scores");

  if (moneyIndex < 0 || moreScoresIndex < 0 || moreScoresIndex <= moneyIndex) {
    return [];
  }

  const tokens = lines.slice(moneyIndex + 1, moreScoresIndex);
  const games = [];
  let index = 0;

  while (index < tokens.length) {
    const parsed = readGame(tokens, index);

    if (!parsed) {
      index += 1;
      continue;
    }

    games.push(parsed.game);
    index = parsed.nextIndex;
  }

  return games;
}

function parseSportsTabs(lines) {
  const tabs = [];

  for (const line of lines) {
    if (SPORTS.has(line) && !tabs.includes(line)) {
      tabs.push(line);
    }

    if (line === "Tampa Bay Rays" || line === "Stats") {
      break;
    }
  }

  return tabs;
}

function parseMusingBlocks(text) {
  const newsIndex = text.indexOf("\nNews");
  const startIndex = newsIndex >= 0 ? newsIndex + "\nNews".length : text.indexOf("Stats");
  const footerIndex = text.indexOf("Get the latest news and updates from StatMuse");

  if (startIndex < 0 || footerIndex <= startIndex) {
    return [];
  }

  const sectionLines = text
    .slice(startIndex, footerIndex)
    .split(/\r?\n/)
    .map(compactLine)
    .filter(Boolean)
    .filter((line) => !["Stats", "Musings", "News"].includes(line));
  const groups = [];
  let current = [];

  for (const line of sectionLines) {
    if (isLikelyMusingStart(line) && current.length > 0) {
      groups.push(current.join(" / "));
      current = [];
    }

    current.push(line);
  }

  if (current.length > 0) {
    groups.push(current.join(" / "));
  }

  const mergedGroups = [];

  for (const group of groups) {
    const firstLine = group.split(" / ")[0];

    if (!isLikelyMusingStart(firstLine) && mergedGroups.length > 0) {
      mergedGroups[mergedGroups.length - 1] = `${mergedGroups[mergedGroups.length - 1]} / ${group}`;
    } else {
      mergedGroups.push(group);
    }
  }

  const seen = new Set();

  return mergedGroups
    .filter((group) => {
      const key = group.toLowerCase();

      if (seen.has(key)) {
        return false;
      }

      seen.add(key);
      return true;
    })
    .map((textBlock) => ({
      text: textBlock
    }));
}

function isLikelyMusingStart(line) {
  if (!line) {
    return false;
  }

  if (/^(The only|First|Second|One of|Hit |His |He has|She has|That player)\b/i.test(line)) {
    return false;
  }

  if (line.endsWith(":")) {
    return true;
  }

  if (/\bvs\b/i.test(line) && !/^\d/.test(line)) {
    return true;
  }

  if (/^There is\b/i.test(line)) {
    return true;
  }

  if (/^[A-Z][A-Za-z'.-]+(?:\s[A-Z][A-Za-z'.-]+){0,3}(?:\s\(\d+\))?\s+is\b/.test(line)) {
    return true;
  }

  if (/^[A-Z][A-Za-z'. -]+\slast\s/i.test(line)) {
    return true;
  }

  return false;
}

function parseStatMuseSnapshot(input, options = {}) {
  const rawText = typeof input === "string" ? input : input?.text;
  const text = String(rawText ?? "");

  if (!text.trim()) {
    throw new Error("StatMuse snapshot text is empty.");
  }

  const lines = splitLines(text);
  const games = parseGames(lines);
  const musings = parseMusingBlocks(text);
  const sportsTabs = parseSportsTabs(lines);
  const parsedAt = new Date().toISOString();
  const warnings = [
    "Parsed from pasted StatMuse page text, not an official structured API.",
    "Displayed moneyline odds do not identify the priced side in the paste and must be manually verified before evaluation."
  ];

  if (games.length === 0) {
    warnings.push("No games were parsed from the pasted score board.");
  }

  if (musings.length === 0) {
    warnings.push("No StatMuse musings/news snippets were parsed.");
  }

  return {
    provider: "StatMuse",
    sourceType: "pasted page snapshot",
    sourceUrl: options.sourceUrl ?? input?.sourceUrl ?? "https://www.statmuse.com/",
    capturedAt: options.capturedAt ?? input?.capturedAt ?? null,
    parsedAt,
    sportsTabs,
    games,
    musings,
    summary: {
      lines: lines.length,
      games: games.length,
      liveGames: games.filter((game) => game.status && GAME_STATUS_PATTERN.test(game.status) && game.status !== "Final").length,
      finalGames: games.filter((game) => game.status === "Final").length,
      scheduledGames: games.filter((game) => game.startTime).length,
      displayedOdds: games.filter((game) => typeof game.displayedMoneylineOdds === "number").length,
      musings: musings.length
    },
    warnings
  };
}

module.exports = {
  parseStatMuseSnapshot
};
