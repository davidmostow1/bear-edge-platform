const { LiveDataCache } = require("./cache.js");
const { evaluateLiveTicket } = require("./evaluate-live-ticket.js");
const { fetchMlbGamesForDate } = require("./schedule.js");
const { validateLiveTicket } = require("../validate-live-ticket.js");

function splitCsvLine(line) {
  const values = [];
  let current = "";
  let inQuotes = false;

  for (let index = 0; index < line.length; index += 1) {
    const character = line[index];
    const nextCharacter = line[index + 1];

    if (character === "\"") {
      if (inQuotes && nextCharacter === "\"") {
        current += "\"";
        index += 1;
      } else {
        inQuotes = !inQuotes;
      }
      continue;
    }

    if (character === "," && !inQuotes) {
      values.push(current);
      current = "";
      continue;
    }

    current += character;
  }

  values.push(current);
  return values;
}

function parseCsv(text) {
  const lines = String(text ?? "")
    .split(/\r?\n/)
    .filter((line) => line.trim().length > 0);

  if (lines.length === 0) {
    return [];
  }

  const headers = splitCsvLine(lines[0]);

  return lines.slice(1).map((line) => {
    const values = splitCsvLine(line);
    const row = {};

    for (let index = 0; index < headers.length; index += 1) {
      row[headers[index]] = values[index] ?? "";
    }

    return row;
  });
}

function csvEscape(value) {
  const resolved = value === null || value === undefined ? "" : String(value);

  if (/[",\n]/.test(resolved)) {
    return `"${resolved.replaceAll("\"", "\"\"")}"`;
  }

  return resolved;
}

function normalizeMinus(value) {
  return String(value ?? "").replaceAll("−", "-").trim();
}

function americanToImpliedProbability(odds) {
  const americanOdds = Number(odds);

  if (!Number.isFinite(americanOdds) || americanOdds === 0) {
    return null;
  }

  if (americanOdds > 0) {
    return 100 / (americanOdds + 100);
  }

  return Math.abs(americanOdds) / (Math.abs(americanOdds) + 100);
}

function americanToDecimal(odds) {
  const americanOdds = Number(odds);

  if (!Number.isFinite(americanOdds) || americanOdds === 0) {
    return null;
  }

  if (americanOdds > 0) {
    return 1 + americanOdds / 100;
  }

  return 1 + 100 / Math.abs(americanOdds);
}

function normalizeKey(value) {
  return String(value ?? "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/\b(jr|sr|ii|iii|iv|v)\b/g, "")
    .replace(/[^a-z0-9]+/g, " ")
    .trim()
    .replace(/\s+/g, " ");
}

function parseThreshold(displayProp) {
  const match = /(\d+)\+\s*TB/i.exec(String(displayProp ?? ""));
  return match ? Number(match[1]) : null;
}

function parseNumber(value) {
  const numeric = Number(normalizeMinus(value));
  return Number.isFinite(numeric) ? numeric : null;
}

function formatFloat(value, digits = 6) {
  return Number.isFinite(value) ? value.toFixed(digits) : "";
}

function formatPercentPoints(value) {
  return Number.isFinite(value) ? `${(value * 100).toFixed(2)}` : "";
}

function resolveGameDate(row) {
  const value = row.game_date_utc;

  if (!value) {
    return null;
  }

  const parsed = new Date(value);

  if (Number.isNaN(parsed.getTime())) {
    return null;
  }

  return parsed.toISOString().slice(0, 10);
}

function teamPairKey(teamA, teamB) {
  return [normalizeKey(teamA), normalizeKey(teamB)].sort().join("|");
}

async function buildScheduleIndex(rows, options = {}) {
  const dates = Array.from(new Set(rows.map(resolveGameDate).filter(Boolean)));
  const index = new Map();
  const fetchScheduleForDate = options.fetchScheduleForDate ?? fetchMlbGamesForDate;

  for (const date of dates) {
    const payload = await fetchScheduleForDate(date, options);

    for (const game of payload.games ?? []) {
      index.set(`${date}|${teamPairKey(game.away?.name, game.home?.name)}`, game);
    }
  }

  return index;
}

function resolveGamePk(row, currentOffer, scheduleIndex) {
  const date = resolveGameDate(row);

  if (!date) {
    return null;
  }

  const directMatch = scheduleIndex.get(`${date}|${teamPairKey(row.current_team, row.opponent_team)}`);

  if (directMatch?.id) {
    return parseNumber(directMatch.id);
  }

  if (!currentOffer) {
    return null;
  }

  const slugAway = currentOffer.awaySlug?.replaceAll("-", " ");
  const slugHome = currentOffer.homeSlug?.replaceAll("-", " ");
  const slugMatch = scheduleIndex.get(`${date}|${teamPairKey(slugAway, slugHome)}`);

  return slugMatch?.id ? parseNumber(slugMatch.id) : null;
}

function flattenCurrentBoard(boardPayload) {
  const offers = [];

  for (const board of [boardPayload.regularBoard, boardPayload.liveBoard]) {
    const boardStatus = board === boardPayload.liveBoard ? "live" : "pregame";

    for (const event of board?.events ?? []) {
      for (const player of event.players ?? []) {
        for (const offer of player.offers ?? []) {
          offers.push({
            boardKey: board.boardKey,
            boardStatus,
            capturedAt: board.capturedAt,
            eventId: event.eventId ?? null,
            eventHref: event.eventHref ?? null,
            eventSlug: event.decodedSlug ?? event.rawSlug ?? null,
            awaySlug: event.awaySlug ?? null,
            homeSlug: event.homeSlug ?? null,
            statusText: event.statusText ?? null,
            playerName: player.playerName,
            playerHref: player.playerHref ?? null,
            playerKey: normalizeKey(player.playerName),
            threshold: offer.threshold,
            americanOdds: offer.americanOdds,
            offerLabel: offer.label ?? null
          });
        }
      }
    }
  }

  return offers;
}

function chooseCurrentOffer(candidates, row) {
  if (candidates.length <= 1) {
    return candidates[0] ?? null;
  }

  const currentTeamKey = normalizeKey(row.current_team);
  const opponentTeamKey = normalizeKey(row.opponent_team);

  const withTeamMatch = candidates.find((candidate) => {
    const away = normalizeKey(candidate.awaySlug?.replaceAll("-", " "));
    const home = normalizeKey(candidate.homeSlug?.replaceAll("-", " "));
    const candidateTeams = [away, home];
    return candidateTeams.includes(currentTeamKey) || candidateTeams.includes(opponentTeamKey);
  });

  if (withTeamMatch) {
    return withTeamMatch;
  }

  const liveCandidate = candidates.find((candidate) => candidate.boardStatus === "live");

  return liveCandidate ?? candidates[0];
}

function buildReasonSummary(evaluation) {
  if (!evaluation) {
    return "";
  }

  return (evaluation.reasons ?? []).join(" | ");
}

function buildRiskFlagSummary(evaluation) {
  if (!evaluation) {
    return "";
  }

  return (evaluation.riskFlags ?? [])
    .map((flag) => `${flag.code}:${flag.severity}`)
    .join(" | ");
}

function summarizeCurrentOffer(offer) {
  if (!offer) {
    return "No current DraftKings total-bases line matched from the live browser board.";
  }

  return `${offer.boardStatus} ${offer.eventSlug ?? ""} ${offer.playerName} ${offer.threshold}+ TB ${offer.americanOdds > 0 ? "+" : ""}${offer.americanOdds}`.trim();
}

function buildComparisonTicket(currentOffer, playerId, resolvedGamePk, bankroll) {
  if (!currentOffer || !Number.isFinite(playerId)) {
    return null;
  }

  return validateLiveTicket({
    kind: "single",
    selection: `${currentOffer.playerName} ${currentOffer.threshold}+ total bases`,
    bankroll,
    legs: [
      {
        id: `${normalizeKey(currentOffer.playerName).replaceAll(" ", "-")}-${currentOffer.threshold}-plus-tb`,
        label: `${currentOffer.playerName} over ${(currentOffer.threshold - 0.5).toFixed(1)} total bases`,
        provider: "mlb",
        marketType: currentOffer.threshold <= 1 ? "prop" : "alt-prop",
        side: "over",
        line: currentOffer.threshold - 0.5,
        marketOdds: currentOffer.americanOdds,
        source: {
          playerId,
          statGroup: "hitting",
          statKey: "totalBases",
          recentLimit: 10,
          gamePk: resolvedGamePk
        }
      }
    ]
  });
}

function buildOfferMap(flattenedOffers) {
  const offerMap = new Map();

  for (const offer of flattenedOffers) {
    const key = `${offer.playerKey}|${offer.threshold}`;

    if (!offerMap.has(key)) {
      offerMap.set(key, []);
    }

    offerMap.get(key).push(offer);
  }

  return offerMap;
}

async function compareRecordingPropsWithCurrentBoard(input = {}, options = {}) {
  const recordingRows = Array.isArray(input.recordingRows)
    ? input.recordingRows
    : parseCsv(input.recordingCsvText);
  const boardPayload = typeof input.currentBoardPayload === "string"
    ? JSON.parse(input.currentBoardPayload)
    : input.currentBoardPayload;
  const bankroll = Number.isFinite(input.bankroll) ? input.bankroll : 1000;

  if (!Array.isArray(recordingRows) || recordingRows.length === 0) {
    throw new Error("Recording CSV did not contain any props.");
  }

  if (!boardPayload || typeof boardPayload !== "object") {
    throw new Error("Current board JSON is required.");
  }

  const flattenedOffers = flattenCurrentBoard(boardPayload);
  const scheduleIndex = await buildScheduleIndex(recordingRows, options);
  const offerMap = buildOfferMap(flattenedOffers);
  const cache = options.cache ?? new LiveDataCache({
    refreshIntervalMs: options.refreshIntervalMs ?? 30 * 60 * 1000
  });
  const comparisonRows = [];

  for (const row of recordingRows) {
    const threshold = parseThreshold(row.display_prop);
    const playerKey = normalizeKey(row.player_name);
    const currentOffer = threshold === null ? null : chooseCurrentOffer(offerMap.get(`${playerKey}|${threshold}`) ?? [], row);
    const recordingOdds = parseNumber(row.recording_odds_american);
    const currentOdds = currentOffer?.americanOdds ?? null;
    const currentImplied = americanToImpliedProbability(currentOdds);
    const recordingImplied = americanToImpliedProbability(recordingOdds);
    const playerId = parseNumber(row.player_id);
    const resolvedGamePk = resolveGamePk(row, currentOffer, scheduleIndex);
    const ticketDraft = buildComparisonTicket(currentOffer, playerId, resolvedGamePk, bankroll);
    let evaluation = null;
    let evaluationError = "";

    if (ticketDraft) {
      try {
        evaluation = await evaluateLiveTicket(ticketDraft, {
          cache,
          fetchJsonImpl: options.fetchJsonImpl
        });
      } catch (error) {
        evaluationError = error instanceof Error ? error.message : String(error);
      }
    }

    const evaluationDetails = /** @type {any} */ (evaluation ?? {});

    comparisonRows.push({
      rank: parseNumber(row.rank),
      cluster: row.cluster,
      player_name: row.player_name,
      api_player_name: row.api_player_name,
      current_team: row.current_team,
      opponent_team: row.opponent_team,
      game_date_utc: row.game_date_utc,
      display_prop: row.display_prop,
      threshold,
      recording_odds_american: recordingOdds,
      recording_implied_probability: recordingImplied,
      current_board_key: currentOffer?.boardKey ?? "",
      current_board_status: currentOffer?.boardStatus ?? "",
      current_event_id: currentOffer?.eventId ?? "",
      current_event_slug: currentOffer?.eventSlug ?? "",
      current_event_status_text: currentOffer?.statusText ?? "",
      current_player_href: currentOffer?.playerHref ?? "",
      resolved_game_pk: resolvedGamePk,
      current_odds_american: currentOdds,
      current_implied_probability: currentImplied,
      current_decimal_odds: americanToDecimal(currentOdds),
      current_gross_return_per_1: americanToDecimal(currentOdds),
      odds_move: Number.isFinite(recordingOdds) && Number.isFinite(currentOdds) ? currentOdds - recordingOdds : null,
      implied_probability_move_points:
        Number.isFinite(recordingImplied) && Number.isFinite(currentImplied) ? currentImplied - recordingImplied : null,
      current_line_match_status: currentOffer ? "matched" : "not_found",
      matched_offer_summary: summarizeCurrentOffer(currentOffer),
      app_verdict: evaluation?.verdict ?? "",
      app_reasons: buildReasonSummary(evaluation),
      app_risk_flags: buildRiskFlagSummary(evaluation),
      app_adjusted_probability: evaluationDetails.derived?.adjustedProbability ?? null,
      app_market_reference_probability: evaluationDetails.derived?.marketReferenceProbability ?? null,
      app_fair_edge_points: evaluationDetails.derived?.fairEdge ?? null,
      app_price_edge_points: evaluationDetails.derived?.priceEdge ?? null,
      app_expected_value_roi: evaluation?.expectedValue?.roi ?? null,
      app_profit_per_1_if_win: evaluation?.expectedValue?.profitIfWin ?? null,
      app_recommended_stake: evaluation?.stakeRecommendation?.recommendedStake ?? null,
      app_season_tb_per_game: evaluationDetails.source?.season?.perGame ?? null,
      app_recent10_tb_per_game: evaluationDetails.source?.recent?.perGame ?? null,
      app_blended_tb_per_game: evaluationDetails.derived?.blendedMean ?? null,
      app_current_game_tb: evaluationDetails.derived?.currentGameValue ?? null,
      app_remaining_opportunity_factor: evaluationDetails.derived?.remainingOpportunityFactor ?? null,
      evaluation_error: evaluationError,
      ticketDraft
    });
  }

  const matchedRows = comparisonRows.filter((row) => row.current_line_match_status === "matched");
  const liveMatchedRows = matchedRows.filter((row) => row.current_board_status === "live");
  const pregameMatchedRows = matchedRows.filter((row) => row.current_board_status === "pregame");
  const evaluableRows = matchedRows.filter((row) => row.app_verdict && !row.evaluation_error);
  const evaluableLiveRows = evaluableRows.filter((row) => row.current_board_status === "live");
  const evaluablePregameRows = evaluableRows.filter((row) => row.current_board_status === "pregame");
  const betRows = evaluableRows
    .filter((row) => row.app_verdict === "BET")
    .sort((a, b) => (b.app_price_edge_points ?? -Infinity) - (a.app_price_edge_points ?? -Infinity));
  const biggestMoves = matchedRows
    .filter((row) => Number.isFinite(row.odds_move))
    .sort((a, b) => Math.abs(b.odds_move) - Math.abs(a.odds_move))
    .slice(0, 15);

  return {
    comparedAt: new Date().toISOString(),
    boardCapturedAt: boardPayload.capturedAt ?? null,
    summary: {
      totalRecordingProps: comparisonRows.length,
      matchedCurrentLines: matchedRows.length,
      matchedLiveLines: liveMatchedRows.length,
      matchedPregameLines: pregameMatchedRows.length,
      unmatchedCurrentLines: comparisonRows.length - matchedRows.length,
      evaluableLiveRows: evaluableLiveRows.length,
      evaluablePregameRows: evaluablePregameRows.length,
      betVerdicts: betRows.length
    },
    notes: [
      "Current DraftKings pregame total-bases pages often start at 2+ TB, so many recorded 1+ TB props may not still be publicly visible.",
      "When an MLB gamePk can be resolved from the matchup and date, Bear Edge uses official current-game stats to adjust live total-bases probabilities.",
      "Each matched row includes implied probability, gross payout per 1 unit staked, and a ticket draft for loading into the evaluator."
    ],
    rows: comparisonRows,
    topBetRows: betRows.slice(0, 20),
    biggestMoves
  };
}

function buildComparisonCsv(result) {
  const csvHeaders = [
    "rank",
    "cluster",
    "player_name",
    "api_player_name",
    "current_team",
    "opponent_team",
    "game_date_utc",
    "display_prop",
    "threshold",
    "recording_odds_american",
    "recording_implied_probability",
    "current_board_key",
    "current_board_status",
    "current_event_id",
    "current_event_slug",
    "current_event_status_text",
    "current_player_href",
    "resolved_game_pk",
    "current_odds_american",
    "current_implied_probability",
    "current_decimal_odds",
    "current_gross_return_per_1",
    "odds_move",
    "implied_probability_move_points",
    "current_line_match_status",
    "matched_offer_summary",
    "app_verdict",
    "app_reasons",
    "app_risk_flags",
    "app_adjusted_probability",
    "app_market_reference_probability",
    "app_fair_edge_points",
    "app_price_edge_points",
    "app_expected_value_roi",
    "app_profit_per_1_if_win",
    "app_recommended_stake",
    "app_season_tb_per_game",
    "app_recent10_tb_per_game",
    "app_blended_tb_per_game",
    "app_current_game_tb",
    "app_remaining_opportunity_factor",
    "evaluation_error"
  ];

  const csvLines = [
    csvHeaders.join(","),
    ...result.rows.map((row) =>
      csvHeaders
        .map((header) => {
          const value = row[header];
          if (typeof value === "number" && Number.isFinite(value)) {
            return csvEscape(value);
          }
          return csvEscape(value ?? "");
        })
        .join(",")
    )
  ];

  return `${csvLines.join("\n")}\n`;
}

function buildComparisonMarkdown(result, context = {}) {
  const markdownLines = [
    "# Current DraftKings Comparison",
    "",
    `Recording CSV: \`${context.recordingCsvPath ?? "inline input"}\``,
    `Current board: \`${context.currentBoardPath ?? "inline input"}\``,
    `Board captured at: \`${result.boardCapturedAt}\``,
    "",
    `Total recording props checked: \`${result.summary.totalRecordingProps}\``,
    `Matched to current DraftKings board: \`${result.summary.matchedCurrentLines}\``,
    `Matched on live board: \`${result.summary.matchedLiveLines}\``,
    `Matched on pregame board: \`${result.summary.matchedPregameLines}\``,
    `Current unmatched props: \`${result.summary.unmatchedCurrentLines}\``,
    `Bear Edge-evaluable matched live rows: \`${result.summary.evaluableLiveRows}\``,
    `Bear Edge-evaluable matched pregame rows: \`${result.summary.evaluablePregameRows}\``,
    `Bear Edge BET verdicts on all current matched rows: \`${result.summary.betVerdicts}\``,
    "",
    "Notes:",
    "- Current DraftKings pregame total-bases pages often start at `2+ TB`, so many recorded `1+ TB` props are now unavailable on the public browser board.",
    "- Live games were checked from `Live Batter > Total Bases`; unstarted games were checked from `Batter > Total Bases`.",
    "- When an MLB `gamePk` could be resolved from the matchup and date, Bear Edge used official current-game stats to adjust live total-bases probabilities.",
    "",
    "## Top Bear Edge BETs On Current DK Prices",
    "",
    "| Player | Prop | Board | Current Odds | Recording Odds | Price Edge | EV ROI | Verdict |",
    "|---|---:|---|---:|---:|---:|---:|---|"
  ];

  for (const row of result.topBetRows) {
    markdownLines.push(
      `| ${row.player_name} | ${row.display_prop} | ${row.current_board_status} | ${row.current_odds_american > 0 ? "+" : ""}${row.current_odds_american} | ${row.recording_odds_american > 0 ? "+" : ""}${row.recording_odds_american} | ${formatPercentPoints(row.app_price_edge_points)} pts | ${formatPercentPoints(row.app_expected_value_roi)}% | ${row.app_verdict} |`
    );
  }

  markdownLines.push("");
  markdownLines.push("## Biggest Current-vs-Recording Odds Moves");
  markdownLines.push("");
  markdownLines.push("| Player | Prop | Board | Recording Odds | Current Odds | Move |");
  markdownLines.push("|---|---:|---|---:|---:|---:|");

  for (const row of result.biggestMoves) {
    markdownLines.push(
      `| ${row.player_name} | ${row.display_prop} | ${row.current_board_status} | ${row.recording_odds_american > 0 ? "+" : ""}${row.recording_odds_american} | ${row.current_odds_american > 0 ? "+" : ""}${row.current_odds_american} | ${row.odds_move > 0 ? "+" : ""}${row.odds_move} |`
    );
  }

  return `${markdownLines.join("\n")}\n`;
}

module.exports = {
  americanToDecimal,
  americanToImpliedProbability,
  buildComparisonCsv,
  buildComparisonMarkdown,
  compareRecordingPropsWithCurrentBoard,
  csvEscape,
  formatFloat,
  normalizeKey,
  parseCsv
};
