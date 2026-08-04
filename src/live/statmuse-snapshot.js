const GAME_STATUS_PATTERN = /^(Final|Top \d+|Bottom \d+|Mid \d+|End \d+|Suspended|Delayed)$/i;
const GAME_TIME_PATTERN = /^\d{1,2}:\d{2}\s?(AM|PM)$/i;
const MONEYLINE_PATTERN = /^[+-]\d{2,4}$/;
const INTEGER_PATTERN = /^\d+$/;
const SPORTS = new Set(["All", "NBA", "NHL", "MLB", "WNBA", "FC", "NFL", "CFB", "PGA", "Money"]);
const FOOTER_STARTS = new Set(["Get the latest news and updates from StatMuse", "Subscribe", "Home"]);
const GAME_PAGE_SECTIONS = ["Odds", "Probable Pitchers", "Team Stats", "Injuries", "Game Info"];
const PREDICTION_SECTIONS = [
  "Home Runs",
  "Hits",
  "Runs",
  "RBIs",
  "H+R+RBIs",
  "Total Bases",
  "Stolen Bases",
  "Pitcher SO",
  "Outs Recorded",
  "Hits Allowed",
  "Earned Runs"
];
const ALL_GAME_PAGE_SECTIONS = [...GAME_PAGE_SECTIONS, ...PREDICTION_SECTIONS];
const PITCHER_STAT_LABELS = ["W-L", "ERA", "SO", "BB", "WHIP", "H", "HR", "IP"];
const TEAM_STAT_LABELS = ["HR", "R", "H", "AVG", "OBP", "SLG", "ERA", "SO", "BB"];
const MONTHS = new Map([
  ["January", 0],
  ["February", 1],
  ["March", 2],
  ["April", 3],
  ["May", 4],
  ["June", 5],
  ["July", 6],
  ["August", 7],
  ["September", 8],
  ["October", 9],
  ["November", 10],
  ["December", 11]
]);

function compactLine(line) {
  return String(line ?? "").replace(/\s+/g, " ").trim();
}

function normalizeAccessibilityLine(line) {
  const compact = compactLine(line);
  const headingMatch = compact.match(/^heading\s+(.+?),\s*Value:\s*\d+$/i);
  return headingMatch ? compactLine(headingMatch[1]) : compact;
}

function splitLines(text) {
  return String(text ?? "")
    .split(/\r?\n/)
    .map(normalizeAccessibilityLine)
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

    if (line === "Stats") {
      break;
    }
  }

  return tabs;
}

function parseMusingBlocks(text) {
  const sectionMarkers = ["News", "Notes", "Musings", "Stats"];
  let activeMarker = null;

  for (const marker of sectionMarkers) {
    const pattern = new RegExp(`\\n(?:${marker}(?=\\s|$)|[^\\n]*\\b${marker},\\s*Value:\\s*\\d+)`, "gi");

    for (const match of text.matchAll(pattern)) {
      if (!activeMarker || match.index > activeMarker.index) {
        activeMarker = {
          index: match.index,
          end: match.index + match[0].length,
          marker
        };
      }
    }
  }

  const startIndex = activeMarker?.end ?? -1;
  const footerMarkers = [
    "\nGet the latest news and updates from StatMuse",
    "\nPlayers Mentioned",
    "\ncontent list",
    "\ncookieconsent",
    "\nStatMuse uses cookies",
    "\nHome"
  ];
  const footerIndex = footerMarkers
    .map((marker) => text.indexOf(marker, Math.max(startIndex, 0)))
    .filter((index) => index >= 0)
    .sort((left, right) => left - right)[0] ?? text.length;

  if (startIndex < 0 || footerIndex <= startIndex) {
    return [];
  }

  const sectionLines = text
    .slice(startIndex, footerIndex)
    .split(/\r?\n/)
    .map(compactLine)
    .filter(Boolean)
    .filter((line) => !["Stats", "Musings", "News", "Notes"].includes(line));
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
      text: textBlock,
      sourceSection: activeMarker?.marker === "Notes" ? "Notes" : "Musings"
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

function sectionLines(lines, sectionName) {
  const start = lines.indexOf(sectionName);

  if (start < 0) {
    return [];
  }

  const endCandidates = ALL_GAME_PAGE_SECTIONS
    .filter((name) => name !== sectionName)
    .map((name) => lines.indexOf(name, start + 1))
    .filter((index) => index >= 0);
  const end = endCandidates.length > 0 ? Math.min(...endCandidates) : lines.length;

  return lines.slice(start + 1, end);
}

function parseStatValue(value) {
  const normalized = compactLine(value).replace(/,/g, "");

  if (/^\d+-\d+$/.test(normalized)) {
    return normalized;
  }

  if (/^[+-]?(?:\d+(?:\.\d+)?|\.\d+)$/.test(normalized)) {
    return Number(normalized);
  }

  return null;
}

function parseDateOnly(value) {
  const match = compactLine(value).match(/^([A-Z][a-z]+) (\d{1,2}), (\d{4})$/);

  if (!match || !MONTHS.has(match[1])) {
    return null;
  }

  const month = String(MONTHS.get(match[1]) + 1).padStart(2, "0");
  const day = String(Number(match[2])).padStart(2, "0");
  return `${match[3]}-${month}-${day}`;
}

function parseGamePageHeader(lines) {
  const predictionsIndex = lines.findIndex((line) => /Predictions Notes$/i.test(line));
  const headerEnd = predictionsIndex >= 0 ? predictionsIndex : Math.min(lines.length, 40);
  const headerLines = lines.slice(0, headerEnd);
  const teams = [];

  for (let index = 0; index < headerLines.length; index += 1) {
    if (!/^\d{1,3}-\d{1,3}$/.test(headerLines[index])) {
      continue;
    }

    const name = headerLines[index - 1];
    const lastFive = headerLines[index + 1]?.match(/^\d+-\d+ in Last 5$/i)?.[0] ?? null;

    if (name && !teams.some((team) => team.name === name)) {
      teams.push({
        name,
        record: headerLines[index],
        lastFive,
        fullName: null,
        abbreviation: null
      });
    }
  }

  const explicitTeamRefs = lines
    .map((line) => line.match(/^(.+?)\s+([A-Z]{2,4})$/))
    .filter(Boolean)
    .map((match) => ({ name: match[1], abbreviation: match[2] }));

  for (const team of teams) {
    const ref = explicitTeamRefs.find((candidate) => candidate.name.toLowerCase().includes(team.name.toLowerCase()));

    if (ref) {
      team.fullName = ref.name;
      team.abbreviation = ref.abbreviation;
    }
  }

  const timeLine = lines.find((line) => /\b(?:Today|Tomorrow|Mon|Tue|Wed|Thu|Fri|Sat|Sun)\s+\d{1,2}:\d{2}\s?(?:AM|PM)\b/i.test(line));
  const timeMatch = timeLine?.match(/\b((?:Today|Tomorrow|Mon|Tue|Wed|Thu|Fri|Sat|Sun)\s+\d{1,2}:\d{2}\s?(?:AM|PM))\b/i);
  const gameDateLine = lines.find((line) => parseDateOnly(line));
  const network = lines.find((line) => /^(ESPN|TBS|FOX|FS1|MLB Network|Apple TV+)$/i.test(line)) ?? null;

  return {
    teams: teams.slice(0, 2),
    startTime: timeMatch ? compactLine(timeMatch[1]) : null,
    gameDate: gameDateLine ? parseDateOnly(gameDateLine) : null,
    network,
    game: teams.length >= 2 ? `${teams[0].name} @ ${teams[1].name}` : null
  };
}

function sideForIndex(index, teams) {
  return index === 0 ? "away" : "home";
}

function teamAliases(team) {
  return [
    team?.name,
    team?.fullName,
    team?.abbreviation,
    team?.fullName && team?.abbreviation ? `${team.fullName} ${team.abbreviation}` : null
  ]
    .filter(Boolean)
    .map((value) => compactLine(value).toLowerCase());
}

function teamIndexForLine(line, teams) {
  const normalized = compactLine(line).toLowerCase();
  return teams.findIndex((team) => teamAliases(team).includes(normalized));
}

function unverifiedMarket(fields) {
  return {
    ...fields,
    verified: false,
    verificationStatus: "unverified_display",
    sourceType: "statmuse_page_display"
  };
}

function parseGamePageOdds(lines, teams) {
  const oddsLines = sectionLines(lines, "Odds");
  const odds = {
    moneyline: [],
    total: [],
    runLine: [],
    openTotals: [],
    props: []
  };
  let moneylineIndex = 0;
  let runLineIndex = 0;

  for (let index = 0; index < oddsLines.length; index += 1) {
    const line = oddsLines[index].replace(/−/g, "-");
    const moneylineMatch = line.match(/^([+-]\d{2,4})\s+Money$/i);
    const totalMatch = line.match(/^([ou])\s*(\d+(?:\.\d+)?)\s+([+-]\d{2,4})$/i);
    const runLineMatch = line.match(/^([+-]?\d+(?:\.\d+)?)\s+([+-]\d{2,4})$/);
    const propMatch = line.match(/^(.+?)\s+(Over|Under)\s+(\d+(?:\.\d+)?)\s+(.+?)\s+([+-]\d{2,4})$/i);
    const openTotalMatch = line.match(/^o\s*(\d+(?:\.\d+)?)$/i);

    if (moneylineMatch) {
      const side = sideForIndex(moneylineIndex, teams);
      odds.moneyline.push(unverifiedMarket({
        market: "moneyline",
        side,
        team: teams[side === "away" ? 0 : 1]?.name ?? null,
        odds: Number(moneylineMatch[1])
      }));
      moneylineIndex += 1;
      continue;
    }

    if (totalMatch) {
      odds.total.push(unverifiedMarket({
        market: "total",
        side: totalMatch[1].toLowerCase() === "o" ? "over" : "under",
        line: Number(totalMatch[2]),
        odds: Number(totalMatch[3])
      }));
      continue;
    }

    if (propMatch) {
      const marketName = propMatch[4].toLowerCase().replace(/\s+/g, "_");
      odds.props.push(unverifiedMarket({
        market: marketName,
        player: compactLine(propMatch[1]),
        side: propMatch[2].toLowerCase(),
        line: Number(propMatch[3]),
        odds: Number(propMatch[5])
      }));
      continue;
    }

    if (openTotalMatch && oddsLines[index + 1]?.toLowerCase() === "open") {
      const openOdds = oddsLines[index + 2]?.replace(/−/g, "-").match(/^([+-]\d{2,4})$/);

      if (openOdds) {
        odds.openTotals.push(unverifiedMarket({
          market: "total",
          line: Number(openTotalMatch[1]),
          odds: Number(openOdds[1]),
          status: "open"
        }));
      }
      continue;
    }

    if (runLineMatch && !/^\d+$/.test(runLineMatch[1])) {
      const side = sideForIndex(runLineIndex, teams);
      odds.runLine.push(unverifiedMarket({
        market: "run_line",
        side,
        team: teams[side === "away" ? 0 : 1]?.name ?? null,
        line: Number(runLineMatch[1]),
        odds: Number(runLineMatch[2])
      }));
      runLineIndex += 1;
    }
  }

  return odds;
}

function personNameLines(lines, teams) {
  const excluded = new Set([
    "Probable Pitchers",
    "Team Stats",
    "Injuries",
    "Game Info"
  ].map((value) => value.toLowerCase()));

  for (const team of teams) {
    for (const alias of teamAliases(team)) {
      excluded.add(alias);
    }
  }

  return lines.filter((line) => {
    if (excluded.has(line.toLowerCase()) || /\s[A-Z]{2,4}$/.test(line) || /^(?:RHP|LHP|SS|2B|CF|P)\b/.test(line)) {
      return false;
    }

    return /^[A-Z][A-Za-z'.-]+(?:\s+[A-Z][A-Za-z'.-]+){1,3}$/.test(line);
  });
}

function parsePairedStats(lines, labels) {
  const stats = [Object.create(null), Object.create(null)];

  for (const label of labels) {
    const index = lines.indexOf(label);

    if (index < 1 || index + 1 >= lines.length) {
      continue;
    }

    const awayValue = parseStatValue(lines[index - 1]);
    const homeValue = parseStatValue(lines[index + 1]);

    if (awayValue !== null && homeValue !== null) {
      stats[0][label] = awayValue;
      stats[1][label] = homeValue;
    }
  }

  return stats;
}

function parseProbablePitchers(lines, teams) {
  const pitcherLines = sectionLines(lines, "Probable Pitchers");
  const names = [...new Set(personNameLines(pitcherLines, teams))].slice(0, 2);

  if (names.length === 0) {
    return [];
  }

  const stats = parsePairedStats(pitcherLines, PITCHER_STAT_LABELS);

  return names.map((name, index) => ({
    name,
    side: sideForIndex(index, teams),
    team: teams[index]?.name ?? null,
    stats: stats[index]
  }));
}

function parseTeamStats(lines, teams) {
  const teamStatLines = sectionLines(lines, "Team Stats");
  const stats = parsePairedStats(teamStatLines, TEAM_STAT_LABELS);

  return {
    away: { team: teams[0]?.name ?? null, stats: stats[0] },
    home: { team: teams[1]?.name ?? null, stats: stats[1] }
  };
}

function parseInjuries(lines, teams) {
  const injuryLines = sectionLines(lines, "Injuries");
  const injuries = [];
  let currentTeamIndex = null;

  for (const line of injuryLines) {
    const explicitTeamIndex = teamIndexForLine(line, teams);

    if (explicitTeamIndex >= 0) {
      currentTeamIndex = explicitTeamIndex;
      continue;
    }

    const match = line.match(/^(.*?)\s+((?:Day-to-day|(?:10|15|60)-Day IL))\s*\(([^)]+)\)$/i);

    if (!match) {
      continue;
    }

    const player = match[1]
      .replace(/^(?:C|P|SP|RP|RHP|LHP|1B|2B|3B|SS|LF|CF|RF|OF|IF|DH)\s+/i, "")
      .replace(/\s+(?:C|P|SP|RP|RHP|LHP|1B|2B|3B|SS|LF|CF|RF|OF|IF|DH)$/i, "")
      .trim();
    const side = currentTeamIndex === 0 ? "away" : currentTeamIndex === 1 ? "home" : null;

    injuries.push({
      player,
      raw: line,
      status: match[2],
      detail: match[3],
      side,
      team: currentTeamIndex === null ? null : teams[currentTeamIndex]?.name ?? null
    });
  }

  return injuries;
}

function parseGameInfo(lines) {
  const infoLines = sectionLines(lines, "Game Info");
  const temperature = infoLines.find((line) => /^-?\d+(?:\.\d+)?°$/.test(line)) ?? null;
  const wind = infoLines.find((line) => /^\d+\s+mph\s+.+$/i.test(line)) ?? null;
  const network = infoLines.find((line) => /^(ESPN|TBS|FOX|FS1|MLB Network|Apple TV+)$/i.test(line)) ?? null;
  const venue = infoLines.find((line) => line !== network && line !== temperature && line !== wind && !parseDateOnly(line)) ?? null;
  const dateLine = infoLines.find((line) => parseDateOnly(line));

  return {
    date: dateLine ? parseDateOnly(dateLine) : null,
    network,
    venue,
    temperature,
    wind
  };
}

function normalizePredictionMarketName(name) {
  return compactLine(name)
    .toLowerCase()
    .replace(/\+/g, "_")
    .replace(/\s+/g, "_")
    .replace(/[^a-z0-9_]/g, "")
    .replace(/_+/g, "_")
    .replace(/^_|_$/g, "");
}

function stripMarkdownLinks(text) {
  return String(text ?? "").replace(/\[([^\]]+)\]\([^)]*\)/g, "$1");
}

function parsePredictionRows(sectionText, marketName) {
  const normalizedText = String(sectionText ?? "").replace(/−/g, "-");
  const market = normalizePredictionMarketName(marketName);
  const rows = [];
  const linkedRowPattern = /\[([^\]]+)\]\([^)]*\)\s+\[\1\]\([^)]*\)\s+(\d+(?:\.\d+)?)\s+\[([+-]\d{2,4})\]\([^)]*\)(?:\s+\[([+-]\d{2,4})\]\([^)]*\))?/g;

  for (const match of normalizedText.matchAll(linkedRowPattern)) {
    rows.push({
      market,
      player: compactLine(match[1]),
      line: Number(match[2]),
      overOdds: Number(match[3]),
      underOdds: match[4] ? Number(match[4]) : null
    });
  }

  if (rows.length === 0) {
    const plainText = stripMarkdownLinks(normalizedText);
    const plainRowPattern = /([A-Z][A-Za-z.'-]*(?:\s+[A-Z][A-Za-z.'-]*){0,3})\s+\1\s+(\d+(?:\.\d+)?)\s+([+-]\d{2,4})(?:\s+([+-]\d{2,4}))?/g;

    for (const match of plainText.matchAll(plainRowPattern)) {
      rows.push({
        market,
        player: compactLine(match[1]),
        line: Number(match[2]),
        overOdds: Number(match[3]),
        underOdds: match[4] ? Number(match[4]) : null
      });
    }
  }

  const seen = new Set();

  return rows
    .map((row) => unverifiedMarket({
      ...row,
      sourceSection: marketName
    }))
    .filter((row) => {
      const key = [row.market, row.player, row.line, row.overOdds, row.underOdds].join("|");

      if (seen.has(key)) {
        return false;
      }

      seen.add(key);
      return true;
    });
}

function parsePredictions(lines) {
  return PREDICTION_SECTIONS.flatMap((section) => parsePredictionRows(sectionLines(lines, section).join(" "), section));
}

function parseGamePage(lines, sourceUrl, capturedAt) {
  const detectedSections = GAME_PAGE_SECTIONS.filter((section) => lines.includes(section));
  const predictionSectionCount = PREDICTION_SECTIONS.filter((section) => lines.includes(section)).length;

  if ((!lines.includes("Odds") && predictionSectionCount === 0) || (detectedSections.length < 2 && predictionSectionCount === 0)) {
    return null;
  }

  const header = parseGamePageHeader(lines);
  const teams = header.teams;
  const gameInfo = parseGameInfo(lines);
  const gameDate = header.gameDate ?? gameInfo.date;
  const predictions = parsePredictions(lines);
  const warnings = [
    "Displayed StatMuse/Novig prices are contextual page data, not verified sportsbook odds.",
    "StatMuse page injuries and probable pitchers are research context and must be confirmed against a current provider before evaluation."
  ];

  if (predictions.length > 0) {
    warnings.push("Prediction markets shown in the Predictions tab are StatMuse/Novig context, not verified sportsbook prices or model probabilities.");
  }

  return {
    game: header.game,
    gameDate,
    startTime: header.startTime,
    network: header.network ?? gameInfo.network,
    teams,
    odds: parseGamePageOdds(lines, teams),
    predictions,
    probablePitchers: parseProbablePitchers(lines, teams),
    teamStats: parseTeamStats(lines, teams),
    injuries: parseInjuries(lines, teams),
    gameInfo,
    evidence: {
      sourceUrl,
      capturedAt,
      verifiedOdds: false,
      verifiedInjuries: false,
      verifiedPredictions: false,
      sourceType: "statmuse_game_page_display",
      warnings
    }
  };
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
  const sourceUrl = options.sourceUrl ?? input?.sourceUrl ?? "https://www.statmuse.com/";
  const capturedAt = options.capturedAt ?? input?.capturedAt ?? null;
  const gamePage = parseGamePage(lines, sourceUrl, capturedAt);
  const sportsTabs = parseSportsTabs(lines);
  const parsedAt = new Date().toISOString();
  const warnings = [
    "Parsed from pasted StatMuse page text, not an official structured API."
  ];

  warnings.push(
    gamePage
      ? "Displayed StatMuse/Novig prices are contextual page data, not official sportsbook odds and must be manually verified before evaluation."
      : "Displayed moneyline odds do not identify the priced side in the paste and must be manually verified before evaluation."
  );

  if (games.length === 0 && !gamePage) {
    warnings.push("No games were parsed from the pasted score board.");
  }

  if (musings.length === 0) {
    warnings.push("No StatMuse musings/news snippets were parsed.");
  }

  return {
    provider: "StatMuse",
    sourceType: gamePage ? "pasted StatMuse game-page snapshot" : "pasted page snapshot",
    sourceUrl,
    capturedAt,
    parsedAt,
    sportsTabs,
    games,
    musings,
    ...(gamePage ? { gamePage } : {}),
    summary: {
      lines: lines.length,
      games: games.length,
      liveGames: games.filter((game) => game.status && GAME_STATUS_PATTERN.test(game.status) && game.status !== "Final").length,
      finalGames: games.filter((game) => game.status === "Final").length,
      scheduledGames: games.filter((game) => game.startTime).length,
      displayedOdds: games.filter((game) => typeof game.displayedMoneylineOdds === "number").length,
      musings: musings.length,
      gamePages: gamePage ? 1 : 0,
      predictionMarkets: gamePage?.predictions?.length ?? 0,
      gamePageMarkets: gamePage
        ? Object.values(gamePage.odds).reduce((count, markets) => count + markets.length, 0) + (gamePage.predictions?.length ?? 0)
        : 0
    },
    warnings
  };
}

module.exports = {
  parseStatMuseSnapshot
};
