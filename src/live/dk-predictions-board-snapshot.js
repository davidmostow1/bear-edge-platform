const MARKET_TYPE_BY_LEAGUE = Object.freeze({
  MLB: Object.freeze({
    moneyline: "MLB_side",
    total: "MLB_total",
    runLine: "MLB_runline"
  }),
  "World Cup": Object.freeze({
    moneyline: "soccer_moneyline"
  })
});

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

function marketTypeFor(event, kind) {
  const league = event.league ?? event.sport ?? "MLB";
  const normalizedKind = kind === "runLine" ? "runLine" : kind;
  return MARKET_TYPE_BY_LEAGUE[league]?.[normalizedKind] ?? kind;
}

function normalizeMarket(event, kind, market, context) {
  const odds = toAmericanOdds(market.odds);
  const line = toNumber(market.line);
  const decimalOdds = americanToDecimal(odds);
  const impliedProbability = americanToImpliedProbability(odds);
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
    market_type: marketTypeFor(event, kind),
    market_name: marketName(kind, { ...market, line }),
    side: market.side ?? null,
    line,
    odds,
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
    decimal_odds: decimalOdds === null ? null : Math.round(decimalOdds * 10000) / 10000,
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
  const events = Array.isArray(input.events) ? input.events : [];
  const capturedAt = options.capturedAt ?? input.capturedAt ?? null;
  const bankroll = toNumber(options.bankroll ?? input.bankroll);
  const defaultStake = toNumber(options.defaultStake ?? input.defaultStake ?? 1) ?? 1;
  const sourceFiles = Array.isArray(input.sourceFiles) ? input.sourceFiles : [];
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
  const warnings = [
    "DraftKings Predictions app rows are normalized from visible screenshot/manual rows. Do not infer hidden markets.",
    "Status is current_at_capture only; re-check the board before betting if time has passed."
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
      totalMarkets: markets.filter((market) => market.market_type === "MLB_total").length,
      mlbEvents: events.filter((event) => (event.league ?? "MLB") === "MLB").length,
      worldCupEvents: events.filter((event) => event.league === "World Cup").length,
      sourceFiles: sourceFiles.length
    },
    warnings
  };
}

module.exports = {
  americanToDecimal,
  americanToImpliedProbability,
  parseDkPredictionsBoardSnapshot
};
