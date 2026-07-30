const POSITION_PATTERN = /^(SS|1B|2B|3B|C|CF|RF|LF|DH|SP|RP|P)$/i;
const TEAM_POSITION_PATTERN = /^(NYM|PHI|[A-Z]{2,3})\s+(SS|1B|2B|3B|C|CF|RF|LF|DH|SP|RP|P)$/i;
const ODDS_PATTERN = /^[+-]\d{2,4}$/;
const LINE_PATTERN = /^([ou]|over|under)\s*([+-]?\d+(?:\.\d+)?)$/i;
const COMPOSITE_PROP_PATTERN = /^([ou]|over|under)\s*([+-]?\d+(?:\.\d+)?)\s*([+-]\d{2,4})$/i;
const STATUS_PATTERN = /^(Day[- ]To[- ]Day|(?:10|15|60)[- ]Day IL)$/i;
const PROP_SECTION_NAMES = ["Hitting Props", "More Hitting Props", "Pitching Props", "Game Props"];
const SECTION_NAMES = ["Game Odds", "Recent Schedule", "Matchup Predictor", ...PROP_SECTION_NAMES, "Injury Report", "World Series", "Top Betting Headlines"];

function compactLine(value) {
  return String(value ?? "").replace(/\s+/g, " ").trim();
}

function normalizeLine(value) {
  let line = compactLine(value).replace(/−/g, "-");

  const headingMatch = line.match(/^heading\s+(.+?),\s*Value:\s*\d+$/i);
  if (headingMatch) {
    line = compactLine(headingMatch[1]);
  }

  const descriptionMatch = line.match(/^(?:link\s+)?Description:\s*(.+?)(?:,\s*Value:|,\s*Help:|$)/i);
  if (descriptionMatch) {
    line = compactLine(descriptionMatch[1]);
  }

  line = line.replace(/^(?:text|container|image)\s+/i, "");
  line = line.replace(/^radio button\s*/i, "");

  if (/^(?:button|image|container|content list|column|cell|row|tab|selected)$/i.test(line)) {
    return "";
  }

  return compactLine(line);
}

function splitLines(text) {
  return String(text ?? "")
    .split(/\r?\n/)
    .map(normalizeLine)
    .filter(Boolean);
}

function numberFrom(value) {
  const parsed = Number(String(value ?? "").replace(/,/g, ""));
  return Number.isFinite(parsed) ? parsed : null;
}

function signedOdds(value) {
  const normalized = compactLine(value).replace(/−/g, "-");
  return ODDS_PATTERN.test(normalized) ? Number(normalized) : null;
}

function sectionStart(lines, name) {
  const target = name.toLowerCase();
  return lines.findIndex((line) => line.toLowerCase() === target || line.toLowerCase().startsWith(`${target} `));
}

function sectionLines(lines, name) {
  const start = sectionStart(lines, name);

  if (start < 0) {
    return [];
  }

  const end = SECTION_NAMES
    .filter((candidate) => candidate !== name)
    .map((candidate) => sectionStart(lines, candidate))
    .filter((index) => index > start)
    .sort((left, right) => left - right)[0] ?? lines.length;

  return lines.slice(start + 1, end);
}

function findTeamRecord(lines, teamName, startIndex = 0) {
  const index = lines.findIndex((line, lineIndex) => lineIndex >= startIndex && line.toLowerCase() === teamName.toLowerCase());

  if (index < 0) {
    return { record: null, venueRecord: null };
  }

  const nearby = lines.slice(index + 1, index + 8);
  return {
    record: nearby.find((line) => /^\d{1,3}-\d{1,3}$/.test(line)) ?? null,
    venueRecord: nearby.find((line) => /^\d{1,3}-\d{1,3}\s+(?:Away|Home)$/i.test(line)) ?? null
  };
}

function parseTeams(lines) {
  const matchup = lines
    .map((line) => line.match(/^(.+?)\s+@\s+(.+?)$/))
    .find((candidate) => candidate && compactLine(candidate[1]) && compactLine(candidate[2]));

  if (!matchup) {
    throw new Error("Unable to identify an away and home team matchup from the ESPN snapshot.");
  }

  const awayName = compactLine(matchup[1]);
  const homeName = compactLine(matchup[2]);
  const away = findTeamRecord(lines, awayName);
  const home = findTeamRecord(lines, homeName, Math.max(0, lines.indexOf(homeName)));
  const abbreviationLines = lines.slice(0, Math.min(lines.length, 160));

  function findAbbreviation(name, excludedAbbreviations = new Set()) {
    const nameIndex = abbreviationLines.findIndex((line) => line.toLowerCase() === name.toLowerCase());
    if (nameIndex < 0) {
      return null;
    }

    const excluded = new Set(["ESPN", "MLB", "GAME", "ODDS", "OPEN", "TOTAL"]);
    const nearby = abbreviationLines
      .map((line, index) => ({ line, distance: Math.abs(index - nameIndex) }))
      .filter(({ line }) => (
        /^[A-Z]{2,4}$/.test(line) &&
        !excluded.has(line) &&
        !excludedAbbreviations.has(line)
      ))
      .sort((left, right) => left.distance - right.distance);

    return nearby[0]?.line ?? null;
  }

  const awayAbbreviation = findAbbreviation(awayName);
  const usedAbbreviations = new Set(awayAbbreviation ? [awayAbbreviation] : []);
  const homeAbbreviation = findAbbreviation(homeName, usedAbbreviations);

  return [
    {
      side: "away",
      name: awayName,
      abbreviation: awayAbbreviation,
      record: away.record,
      venueRecord: away.venueRecord
    },
    {
      side: "home",
      name: homeName,
      abbreviation: homeAbbreviation,
      record: home.record,
      venueRecord: home.venueRecord
    }
  ];
}

function unverified(fields, sourceType = "espn_page_display") {
  return {
    ...fields,
    verified: false,
    verificationStatus: "unverified_display",
    sourceType
  };
}

function parsePairAt(lines, index) {
  const line = compactLine(lines[index]);
  const composite = line.match(COMPOSITE_PROP_PATTERN);
  if (composite) {
    return {
      side: /^(?:o|over)$/i.test(composite[1]) ? "over" : "under",
      line: Number(composite[2]),
      odds: Number(composite[3]),
      nextIndex: index + 1
    };
  }

  const marker = line.match(LINE_PATTERN);
  if (!marker) {
    return null;
  }

  const odds = signedOdds(lines[index + 1]);
  if (odds === null) {
    return null;
  }

  return {
    side: /^(?:o|over)$/i.test(marker[1]) ? "over" : "under",
    line: Number(marker[2]),
    odds,
    nextIndex: index + 2
  };
}

function parseGameOdds(lines, teams) {
  const oddsLines = sectionLines(lines, "Game Odds");
  const totals = [];
  const runLine = [];
  const pairedOddsIndexes = new Set();

  for (let index = 0; index < oddsLines.length; index += 1) {
    const parsed = parsePairAt(oddsLines, index);
    if (!parsed) {
      continue;
    }

    pairedOddsIndexes.add(index);
    if (!COMPOSITE_PROP_PATTERN.test(oddsLines[index]) && index + 1 < oddsLines.length) {
      pairedOddsIndexes.add(index + 1);
    }

    if (parsed.side === "over" || parsed.side === "under") {
      totals.push(unverified({
        market: "total",
        side: parsed.side,
        line: parsed.line,
        odds: parsed.odds
      }));
    }
  }

  for (let index = 0; index < oddsLines.length; index += 1) {
    const line = compactLine(oddsLines[index]);
    const composite = line.match(/^([+-]?\d+(?:\.\d+)?)\s+([+-]\d{2,4})$/);
    let parsed = composite
      ? { line: Number(composite[1]), odds: Number(composite[2]), nextIndex: index + 1 }
      : null;

    if (!parsed && /^[+-]?\d+(?:\.\d+)?$/.test(line)) {
      const odds = signedOdds(oddsLines[index + 1]);
      if (odds !== null && line.includes(".")) {
        parsed = { line: Number(line), odds, nextIndex: index + 2 };
      }
    }

    if (!parsed || pairedOddsIndexes.has(index)) {
      continue;
    }

    if (parsed.line !== 0 && String(parsed.line).includes(".")) {
      pairedOddsIndexes.add(index);
      if (!composite && index + 1 < oddsLines.length) {
        pairedOddsIndexes.add(index + 1);
      }
      runLine.push(unverified({
        market: "run_line",
        side: parsed.line > 0 ? "away" : "home",
        team: parsed.line > 0 ? teams[0]?.name ?? null : teams[1]?.name ?? null,
        line: parsed.line,
        odds: parsed.odds
      }));
    }
  }

  const moneyline = [];
  const teamMarkers = teams.map((team) => ({
    team,
    index: oddsLines.findIndex((line) => line === team.abbreviation || line === team.name)
  }));

  for (const [teamIndex, marker] of teamMarkers.entries()) {
    if (marker.index < 0) {
      continue;
    }

    const end = teamMarkers[teamIndex + 1]?.index >= 0 ? teamMarkers[teamIndex + 1].index : oddsLines.length;
    const candidate = oddsLines.slice(marker.index + 1, end).find((line, index, slice) => {
      if (signedOdds(line) === null) {
        return false;
      }
      const previous = slice[index - 1] ?? "";
      return !LINE_PATTERN.test(previous) && !/^([+-]?\d+(?:\.\d+)?)$/.test(previous);
    });

    if (candidate) {
      moneyline.push(unverified({
        market: "moneyline",
        side: marker.team.side,
        team: marker.team.name,
        odds: signedOdds(candidate)
      }));
    }
  }

  if (moneyline.length < 2) {
    const bareOdds = oddsLines.filter((line, index) => signedOdds(line) !== null && !pairedOddsIndexes.has(index));
    for (const [index, rawOdds] of bareOdds.slice(0, 2).entries()) {
      const odds = signedOdds(rawOdds);
      if (!moneyline.some((market) => market.odds === odds)) {
        moneyline.push(unverified({
          market: "moneyline",
          side: index === 0 ? "away" : "home",
          team: teams[index]?.name ?? null,
          odds
        }));
      }
    }
  }

  const uniqueMarkets = (markets, keyFields) => {
    const latest = new Map();
    for (const market of markets) {
      latest.set(keyFields.map((field) => market[field]).join("|"), market);
    }
    return [...latest.values()];
  };

  return {
    moneyline: uniqueMarkets(moneyline, ["side"]).sort((left, right) => left.side === right.side ? 0 : left.side === "away" ? -1 : 1),
    total: uniqueMarkets(totals, ["side", "line"]),
    runLine: uniqueMarkets(runLine, ["side", "line"])
  };
}

function isTeamPositionLine(line) {
  return TEAM_POSITION_PATTERN.test(line);
}

function positionFromLine(line) {
  const teamPosition = line.match(TEAM_POSITION_PATTERN);
  if (teamPosition) {
    return { abbreviation: teamPosition[1].toUpperCase(), position: teamPosition[2].toUpperCase() };
  }

  return POSITION_PATTERN.test(line) ? { abbreviation: null, position: line.toUpperCase() } : null;
}

function propMarketFromSection(sectionName, lines) {
  const known = ["Hits/Runs/RBIs", "Total Bases", "RBIs", "Hits"];
  const selected = lines.find((line) => known.some((candidate) => line.toLowerCase() === candidate.toLowerCase()));

  if (selected) {
    return selected.toLowerCase().replace(/[+/]/g, "_").replace(/\s+/g, "_");
  }

  if (sectionName === "More Hitting Props") {
    return "more_hitting_props";
  }
  if (sectionName === "Pitching Props") {
    return "pitching_props";
  }
  return "hits";
}

function previousNonHeader(lines, index) {
  for (let cursor = index - 1; cursor >= 0; cursor -= 1) {
    const candidate = compactLine(lines[cursor]);
    if (candidate && !/^(?:Line|Over|Under|Yes|No)$/i.test(candidate)) {
      return candidate;
    }
  }
  return null;
}

function parsePlayerProps(lines, sectionName) {
  const section = sectionLines(lines, sectionName);
  const market = propMarketFromSection(sectionName, section);
  const playerRows = [];
  const pairs = [];

  for (let index = 0; index < section.length; index += 1) {
    const position = positionFromLine(section[index]);
    if (!position || !position.abbreviation) {
      continue;
    }

    const player = previousNonHeader(section, index);
    if (!player || /^(?:Hitting Props|More Hitting Props|Pitching Props|Game Props|Line|Over|Under)$/i.test(player)) {
      continue;
    }

    playerRows.push({
      player,
      team: position.abbreviation,
      position: position.position
    });
  }

  for (let index = 0; index < section.length; index += 1) {
    const pair = parsePairAt(section, index);
    if (pair) {
      pairs.push(pair);
    }
  }

  const rows = [];
  for (const [index, playerRow] of playerRows.entries()) {
    const rowPairs = pairs.slice(index * 2, index * 2 + 2);
    const over = rowPairs.find((pair) => pair.side === "over");
    const under = rowPairs.find((pair) => pair.side === "under");
    if (!over) {
      continue;
    }

    rows.push(unverified({
      market,
      ...playerRow,
      line: over.line,
      overOdds: over.odds,
      underOdds: under?.odds ?? null,
      sourceSection: sectionName
    }, "espn_prop_display"));
  }

  return dedupeProps(rows);
}

function parseTeamProps(lines, teams) {
  const section = sectionLines(lines, "Game Props");
  const teamRows = [];
  const pairs = [];

  for (const line of section) {
    const team = teams.find((candidate) => line.toLowerCase() === candidate.name.toLowerCase() || line === candidate.abbreviation);
    if (!team) {
      continue;
    }

    teamRows.push(team);
  }

  for (let index = 0; index < section.length; index += 1) {
    const pair = parsePairAt(section, index);
    if (pair) {
      pairs.push(pair);
    }
  }

  return dedupeProps(teamRows.map((team, index) => {
    const rowPairs = pairs.slice(index * 2, index * 2 + 2);
    const over = rowPairs.find((pair) => pair.side === "over");
    const under = rowPairs.find((pair) => pair.side === "under");
    return over ? unverified({
        market: "team_total_runs",
        player: team.name,
        team: team.abbreviation,
        line: over.line,
        overOdds: over.odds,
        underOdds: under?.odds ?? null,
        sourceSection: "Game Props"
      }, "espn_team_prop_display") : null;
  }).filter(Boolean));
}

function dedupeProps(rows) {
  const seen = new Set();
  return rows.filter((row) => {
    const key = [row.market, row.player, row.line, row.overOdds, row.underOdds].join("|");
    if (seen.has(key)) {
      return false;
    }
    seen.add(key);
    return true;
  });
}

function parseInjuries(lines, teams) {
  const injurySection = sectionLines(lines, "Injury Report");
  const injuries = [];
  let currentTeam = null;

  for (let index = 0; index < injurySection.length; index += 1) {
    const line = injurySection[index];
    const team = teams.find((candidate) => line.toLowerCase() === candidate.name.toLowerCase());
    if (team) {
      currentTeam = team;
      continue;
    }

    const inline = line.match(/^(.+?)\s+(SS|1B|2B|3B|C|CF|RF|LF|DH|SP|RP|P)\s+(Day[- ]To[- ]Day|(?:10|15|60)[- ]Day IL)$/i);
    if (inline && currentTeam) {
      injuries.push(unverified({
        player: inline[1],
        position: inline[2].toUpperCase(),
        status: inline[3],
        team: currentTeam.abbreviation,
        side: currentTeam.side
      }, "espn_injury_report"));
      continue;
    }

    if (!POSITION_PATTERN.test(line) || !currentTeam) {
      continue;
    }

    const player = previousNonHeader(injurySection, index);
    const status = injurySection[index + 1];
    if (player && STATUS_PATTERN.test(status ?? "")) {
      injuries.push(unverified({
        player,
        position: line.toUpperCase(),
        status,
        team: currentTeam.abbreviation,
        side: currentTeam.side
      }, "espn_injury_report"));
    }
  }

  const seen = new Set();
  return injuries.filter((injury) => {
    const key = [injury.team, injury.player, injury.status].join("|");
    if (seen.has(key)) {
      return false;
    }
    seen.add(key);
    return true;
  });
}

function parseRecentSchedule(lines) {
  const scheduleSection = sectionLines(lines, "Recent Schedule");
  const rows = [];

  for (let index = 0; index < scheduleSection.length; index += 1) {
    const dateMatch = scheduleSection[index].match(/^(\d{1,2}\/\d{1,2})(?:\s+(.+))?$/);
    if (!dateMatch) {
      continue;
    }

    const values = [];
    if (dateMatch[2]) {
      values.push(dateMatch[2]);
    }
    for (let cursor = index + 1; cursor < Math.min(scheduleSection.length, index + 7) && values.length < 4; cursor += 1) {
      if (!/^(?:DATE|OPP|RESULT|SPREAD|TOTAL|column|cell)$/i.test(scheduleSection[cursor])) {
        values.push(scheduleSection[cursor]);
      }
    }

    const opponent = values.find((value) => /^(?:at|vs)\s+/i.test(value)) ?? null;
    const result = values.find((value) => /^[WL]\s*(?:\[?\d+-\d+\]?)/i.test(value)) ?? null;
    const spread = values.find((value) => /^[+-]\d+(?:\.\d+)?$/.test(value)) ?? null;
    const total = values.find((value) => /^\d+(?:\.\d+)?$/.test(value)) ?? null;
    if (!opponent || !result) {
      continue;
    }

    rows.push({
      date: dateMatch[1],
      opponent,
      result: result.replace(/[\[\]]/g, ""),
      spread,
      total: total === null ? null : Number(total),
      verified: false,
      sourceType: "espn_recent_schedule"
    });
  }

  const seen = new Set();
  return rows.filter((row) => {
    const key = [row.date, row.opponent, row.result].join("|");
    if (seen.has(key)) {
      return false;
    }
    seen.add(key);
    return true;
  });
}

function parsePredictor(lines, teams) {
  const section = sectionLines(lines, "Matchup Predictor");
  const percentages = [];
  for (let index = 0; index < section.length; index += 1) {
    const line = section[index];
    const inline = line.match(/(\d+(?:\.\d+)?)\s*%/);
    if (inline) {
      percentages.push(Number(inline[1]) / 100);
      continue;
    }
    if (/^\d+(?:\.\d+)?$/.test(line) && section[index + 1] === "%") {
      percentages.push(Number(line) / 100);
    }
  }

  if (percentages.length < 2) {
    return null;
  }

  return {
    provider: "ESPN Analytics",
    awayTeam: teams[0]?.name ?? null,
    homeTeam: teams[1]?.name ?? null,
    awayProbability: percentages[0],
    homeProbability: percentages[1],
    verified: false,
    verificationStatus: "context_only_not_bear_edge_model"
  };
}

function eventIdFromUrl(sourceUrl) {
  const explicitMatch = String(sourceUrl ?? "").match(/gameId\/(\d+)|gameId=(\d+)/i);
  return explicitMatch?.[1] ?? explicitMatch?.[2] ?? String(sourceUrl ?? "").match(/(?:^|\D)(\d{6,})(?:\D|$)/)?.[1] ?? null;
}

function parseEspnSnapshot(input, options = {}) {
  const rawText = typeof input === "string" ? input : input?.text;
  const text = String(rawText ?? "");
  if (!text.trim()) {
    throw new Error("ESPN snapshot text is empty.");
  }

  const lines = splitLines(text);
  const teams = parseTeams(lines);
  const sourceUrl = options.sourceUrl ?? input?.sourceUrl ?? "https://www.espn.com/mlb/odds/";
  const capturedAt = options.capturedAt ?? input?.capturedAt ?? null;
  const props = [
    ...PROP_SECTION_NAMES.slice(0, 3).flatMap((section) => parsePlayerProps(lines, section)),
    ...parseTeamProps(lines, teams)
  ];
  const injuries = parseInjuries(lines, teams);
  const recentSchedule = parseRecentSchedule(lines);
  const predictor = parsePredictor(lines, teams);
  const odds = parseGameOdds(lines, teams);
  const matchupLine = `${teams[0].name} @ ${teams[1].name}`;
  const startTime = lines.find((line) => /^\d{1,2}:\d{2}\s?(?:AM|PM)$/i.test(line)) ?? lines.find((line) => /\b\d{1,2}:\d{2}\s?(?:AM|PM)\b/i.test(line)) ?? null;
  const warnings = [
    "Parsed from browser-visible ESPN page text, not a verified sportsbook or roster API.",
    "Displayed DraftKings prices, ESPN Analytics probabilities, injuries, and lineups are contextual and must be manually verified before evaluation.",
    "This snapshot does not authorize a BET verdict or replace a licensed odds, injury, or lineup provider."
  ];

  if (odds.moneyline.length < 2 || odds.total.length < 2 || odds.runLine.length < 2) {
    warnings.push("One or more game-odds markets could not be mapped unambiguously from the ESPN accessibility/OCR order.");
  }
  if (predictor) {
    warnings.push("The ESPN Analytics matchup predictor is not a Bear Edge model probability and must not be used as fair probability.");
  }

  const event = {
    eventId: eventIdFromUrl(sourceUrl),
    game: matchupLine,
    startTime,
    away: teams[0],
    home: teams[1],
    odds,
    matchupPredictor: predictor,
    recentSchedule,
    props,
    injuries,
    evidence: {
      sourceUrl,
      capturedAt,
      sourceType: "espn_odds_page_display",
      verifiedOdds: false,
      verifiedInjuries: false,
      verifiedProbabilities: false,
      warnings
    }
  };

  return {
    provider: "ESPN",
    sourceType: "browser-visible ESPN odds page snapshot",
    sourceUrl,
    capturedAt,
    parsedAt: new Date().toISOString(),
    event,
    warnings,
    summary: {
      lines: lines.length,
      events: 1,
      moneylineMarkets: odds.moneyline.length,
      totalMarkets: odds.total.length,
      runLineMarkets: odds.runLine.length,
      propMarkets: props.length,
      injuryRecords: injuries.length,
      recentGames: recentSchedule.length,
      predictorMarkets: predictor ? 1 : 0
    }
  };
}

module.exports = {
  parseEspnSnapshot
};
