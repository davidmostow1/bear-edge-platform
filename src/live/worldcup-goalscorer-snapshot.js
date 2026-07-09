const ODDS_PATTERN = /^[+\-−]\d{2,5}$/;

const MARKET_FIELDS = Object.freeze([
  {
    key: "firstGoalscorer",
    marketType: "first_goalscorer",
    label: "1st Goalscorer"
  },
  {
    key: "anytimeGoalscorer",
    marketType: "anytime_goalscorer",
    label: "Anytime Goalscorer"
  },
  {
    key: "twoPlusGoalscorer",
    marketType: "two_plus_goalscorer",
    label: "To Score 2 or More Goalscorer"
  }
]);

function normalizeMinus(value) {
  return String(value ?? "").replaceAll("−", "-").trim();
}

function parseAmericanOdds(value) {
  const normalized = normalizeMinus(value);

  if (!ODDS_PATTERN.test(normalized)) {
    return null;
  }

  return Number(normalized);
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

function formatOdds(americanOdds) {
  return americanOdds > 0 ? `+${americanOdds}` : String(americanOdds);
}

function parsePrice(value, market) {
  const text = normalizeMinus(value);

  if (!text || /^(-|locked|lock|n\/a|na)$/i.test(text)) {
    return {
      marketType: market.marketType,
      marketLabel: market.label,
      status: "locked",
      americanOdds: null,
      label: text || "locked"
    };
  }

  const americanOdds = parseAmericanOdds(text);

  if (americanOdds === null) {
    return {
      marketType: market.marketType,
      marketLabel: market.label,
      status: "unparsed",
      americanOdds: null,
      label: text
    };
  }

  return {
    marketType: market.marketType,
    marketLabel: market.label,
    status: "priced",
    americanOdds,
    decimalOdds: americanToDecimal(americanOdds),
    impliedProbability: americanToImpliedProbability(americanOdds),
    payoutOn100Stake: payoutForStake(americanOdds, 100),
    label: formatOdds(americanOdds)
  };
}

function normalizeEvent(input = {}) {
  const event = input.event && typeof input.event === "object" ? input.event : {};

  return {
    home: event.home ?? input.home ?? "Egypt",
    away: event.away ?? input.away ?? "Iran",
    matchup: event.matchup ?? input.matchup ?? `${event.home ?? input.home ?? "Egypt"} vs ${event.away ?? input.away ?? "Iran"}`,
    startTime: event.startTime ?? input.startTime ?? null,
    capturedAtLabel: event.capturedAtLabel ?? input.capturedAtLabel ?? null
  };
}

function marketByType(markets, marketType) {
  return markets.find((market) => market.marketType === marketType && market.status === "priced") ?? null;
}

function oddsOrderWarnings(player, markets) {
  const warnings = [];
  const first = marketByType(markets, "first_goalscorer");
  const anytime = marketByType(markets, "anytime_goalscorer");
  const twoPlus = marketByType(markets, "two_plus_goalscorer");
  const tolerance = 0.005;

  if (
    first &&
    anytime &&
    typeof first.impliedProbability === "number" &&
    typeof anytime.impliedProbability === "number" &&
    first.impliedProbability > anytime.impliedProbability + tolerance
  ) {
    warnings.push(`${player}: 1st goalscorer is priced as more likely than anytime goalscorer; verify column alignment.`);
  }

  if (
    twoPlus &&
    anytime &&
    typeof twoPlus.impliedProbability === "number" &&
    typeof anytime.impliedProbability === "number" &&
    twoPlus.impliedProbability > anytime.impliedProbability + tolerance
  ) {
    warnings.push(`${player}: 2+ goals is priced as more likely than anytime goalscorer; verify market/column alignment.`);
  }

  return warnings;
}

function rowFromArray(parts) {
  if (parts.length >= 5) {
    return {
      player: parts[0],
      team: parts[1],
      firstGoalscorer: parts[2],
      anytimeGoalscorer: parts[3],
      twoPlusGoalscorer: parts[4]
    };
  }

  return {
    player: parts[0],
    firstGoalscorer: parts[1],
    anytimeGoalscorer: parts[2],
    twoPlusGoalscorer: parts[3]
  };
}

function parseTextRows(text) {
  const rows = [];

  for (const rawLine of String(text ?? "").split(/\r?\n/)) {
    const line = rawLine.trim();

    if (!line || /^(player|name)\s*[,|\t]/i.test(line) || /^#/.test(line)) {
      continue;
    }

    const delimiter = line.includes("|") ? "|" : line.includes("\t") ? "\t" : line.includes(",") ? "," : null;

    if (!delimiter) {
      continue;
    }

    const parts = line.split(delimiter).map((part) => part.trim());

    if (parts.length >= 4) {
      rows.push(rowFromArray(parts));
    }
  }

  return rows;
}

function sourceRowsFromInput(input = {}) {
  if (Array.isArray(input.rows)) {
    return input.rows;
  }

  return parseTextRows(input.text);
}

function normalizeGoalscorerRow(rawRow, event, index) {
  const row = Array.isArray(rawRow) ? rowFromArray(rawRow.map((value) => String(value ?? ""))) : rawRow;
  const player = String(row.player ?? row.name ?? "").trim();

  if (!player) {
    return null;
  }

  const markets = MARKET_FIELDS.map((market) => parsePrice(row[market.key], market));
  const warnings = oddsOrderWarnings(player, markets);

  return {
    id: `worldcup_goalscorer_${index + 1}`,
    sport: "worldcup",
    provider: "DraftKings",
    source: "DraftKings screenshot",
    event,
    player,
    team: row.team ? String(row.team).trim() : null,
    markets,
    warnings
  };
}

function flattenMarkets(rows) {
  return rows.flatMap((row) =>
    row.markets.map((market) => ({
      id: `${row.id}_${market.marketType}`,
      sport: row.sport,
      provider: row.provider,
      source: row.source,
      event: row.event,
      player: row.player,
      team: row.team,
      ...market
    }))
  );
}

function summarize(rows, markets) {
  const priced = markets.filter((market) => market.status === "priced");
  const locked = markets.filter((market) => market.status === "locked");
  const unparsed = markets.filter((market) => market.status === "unparsed");

  return {
    players: rows.length,
    markets: markets.length,
    pricedMarkets: priced.length,
    lockedMarkets: locked.length,
    unparsedMarkets: unparsed.length,
    anomalyRows: rows.filter((row) => Array.isArray(row.warnings) && row.warnings.length > 0).length,
    firstGoalscorerPrices: priced.filter((market) => market.marketType === "first_goalscorer").length,
    anytimeGoalscorerPrices: priced.filter((market) => market.marketType === "anytime_goalscorer").length,
    twoPlusGoalscorerPrices: priced.filter((market) => market.marketType === "two_plus_goalscorer").length
  };
}

function parseWorldCupGoalscorerSnapshot(input = {}) {
  const event = normalizeEvent(input);
  const rows = sourceRowsFromInput(input)
    .map((row, index) => normalizeGoalscorerRow(row, event, index))
    .filter(Boolean);
  const markets = flattenMarkets(rows);
  const warnings = [
    "Parsed from a screenshot or normalized text. Verify every player, team, market, and price before evaluating."
  ];

  if (rows.length === 0) {
    warnings.push("No goalscorer rows parsed. Use rows or pipe-delimited text: Player | Team | First | Anytime | 2+.");
  }

  if (markets.some((market) => market.status === "unparsed")) {
    warnings.push("Some visible cells did not parse as American odds and were not treated as prices.");
  }

  const rowWarnings = rows.flatMap((row) => row.warnings ?? []);

  if (rowWarnings.length > 0) {
    warnings.push(...rowWarnings);
  }

  return {
    provider: "DraftKings",
    sport: "worldcup",
    marketGroup: "goalscorer",
    capturedAt: input.capturedAt ?? new Date().toISOString(),
    sourceUrl: input.sourceUrl ?? "https://sportsbook.draftkings.com/",
    event,
    rows,
    markets,
    summary: summarize(rows, markets),
    warnings
  };
}

module.exports = {
  americanToDecimal,
  americanToImpliedProbability,
  parseWorldCupGoalscorerSnapshot,
  payoutForStake
};
