const MARKET_TYPES = Object.freeze([
  "MLB_side",
  "MLB_total",
  "MLB_runline",
  "MLB_pitcher_K",
  "MLB_total_bases",
  "MLB_hits",
  "MLB_RBI",
  "MLB_HR",
  "WNBA_side",
  "WNBA_total",
  "soccer_moneyline",
  "soccer_total",
  "soccer_prop",
  "parlay",
  "prediction_market"
]);

const MISTAKE_TAGS = Object.freeze([
  "stale_board",
  "odds_sign_misread",
  "unconfirmed_pitcher",
  "oversized_stake",
  "bad_ladder",
  "duplicate_exposure",
  "longshot_too_large",
  "soccer_total_weak",
  "parlay_unnecessary",
  "live_market_stale",
  "good_process_bad_result",
  "bad_process_good_result"
]);

const LEDGER_FIELDS = Object.freeze([
  "id",
  "date",
  "time",
  "sport",
  "league",
  "game",
  "team_or_player",
  "market_type",
  "market_name",
  "line",
  "odds",
  "stake",
  "payout",
  "net_profit",
  "status",
  "pregame_or_live",
  "source_type",
  "source_file",
  "source_frame_or_screenshot",
  "bankroll_at_time",
  "implied_probability",
  "estimated_fair_probability",
  "edge_percent",
  "confidence",
  "process_grade",
  "result_grade",
  "mistake_tags",
  "notes"
]);

const DEFAULT_VISIBLE_BANKROLL = 104.81;

const STAKE_RULES = Object.freeze({
  A_MLB_SIDE_TOTAL: { label: "A-tier MLB side/total", minPct: 0.0075, maxPct: 0.0125 },
  A_MLB_PROP: { label: "A-tier MLB prop", minPct: 0.005, maxPct: 0.009 },
  B_LEAN: { label: "B-tier lean", minPct: 0.0025, maxPct: 0.005 },
  SOCCER_TOTAL: { label: "Soccer total", minPct: 0.001, maxPct: 0.0035 },
  LONGSHOT_500_PLUS: { label: "Longshot +500 or longer", minPct: 0.001, maxPct: 0.0025 },
  PARLAY: { label: "Parlay", minPct: 0.001, maxPct: 0.003 },
  UNVERIFIED: { label: "Unverified/stale board", minPct: 0, maxPct: 0 }
});

const NEXT_SLATE_CHECKLIST = Object.freeze([
  "Confirm today's date.",
  "Confirm DraftKings board date/time.",
  "Confirm game has not started unless this is a deliberate live analysis.",
  "Confirm pitcher/starters match an official source.",
  "Confirm exact odds sign.",
  "Confirm visible bankroll.",
  "Check existing exposure by player, game, and correlated market.",
  "Choose only A-tier or pass.",
  "Output stake from bankroll percentage, not vibes.",
  "State pass price and what would change the bet."
]);

const DO_NOT_BET_CONDITIONS = Object.freeze([
  "Board date/time is missing, stale, settled, or ambiguous.",
  "Odds sign is not independently confirmed.",
  "Pitcher, starter, lineup, or matchup disagrees with the official source.",
  "Existing exposure already covers the same player bucket or same correlated game angle.",
  "The pick needs a parlay to look attractive.",
  "The bet is a soccer total without a strong independent reason and tiny sizing.",
  "The wager is a +500 or longer longshot above 0.25% bankroll.",
  "The ticket repeats a ladder rung after one meaningful player exposure is already placed.",
  "The market is live but the evidence source is pregame, settled, or from an old screen recording.",
  "The only reason to bet is that another ticket already won or lost."
]);

const BET_CARD_TEMPLATE = Object.freeze({
  BET: "",
  LEAN: "",
  PASS: "",
  WAIT: "",
  fairLine: "",
  stake: "",
  maxPrice: "",
  keyReasons: [],
  riskFlags: [],
  exposureConflicts: [],
  whatWouldChangeTheBet: ""
});

const THREAD_SETTLED_EXAMPLES = Object.freeze([
  {
    id: "thread-001",
    date: "",
    time: "",
    sport: "MLB",
    league: "MLB",
    game: "MIA Marlins @ STL Cardinals",
    team_or_player: "MIA Marlins",
    market_type: "MLB_runline",
    market_name: "Marlins -2.5",
    line: -2.5,
    odds: 355,
    stake: null,
    payout: 7,
    status: "won",
    pregame_or_live: "unknown",
    confidence: "medium",
    process_grade: "B",
    mistake_tags: [],
    notes: "Won, paid $7, final MIA 4 STL 0. Stake not visible, so net cannot be calculated."
  },
  {
    id: "thread-002",
    date: "",
    time: "",
    sport: "Soccer",
    league: "World Cup",
    game: "Uruguay vs Spain",
    team_or_player: "Uruguay/Spain",
    market_type: "soccer_total",
    market_name: "Over 2.5 goals",
    line: 2.5,
    odds: 144,
    stake: 4.73,
    payout: 0,
    status: "lost",
    pregame_or_live: "unknown",
    confidence: "low",
    process_grade: "D",
    mistake_tags: ["soccer_total_weak", "oversized_stake"],
    notes: "Lost, bought $4.73. Soccer totals should be tiny unless independently modeled."
  },
  {
    id: "thread-003",
    date: "",
    time: "",
    sport: "Soccer",
    league: "World Cup",
    game: "Uruguay vs Spain",
    team_or_player: "Uruguay",
    market_type: "soccer_moneyline",
    market_name: "Uruguay ML",
    line: "",
    odds: 525,
    stake: 1.87,
    payout: 0,
    status: "lost",
    pregame_or_live: "unknown",
    confidence: "low",
    process_grade: "D",
    mistake_tags: ["longshot_too_large"],
    notes: "Lost, bought $1.87. +500 or longer longshot was too large for the visible bankroll."
  },
  {
    id: "thread-004",
    date: "",
    time: "",
    sport: "Soccer",
    league: "World Cup",
    game: "Cape Verde vs Saudi Arabia",
    team_or_player: "Cape Verde/Saudi",
    market_type: "soccer_total",
    market_name: "Over 2.5 goals",
    line: 2.5,
    odds: 127,
    stake: 12.42,
    payout: 0,
    status: "lost",
    pregame_or_live: "unknown",
    confidence: "low",
    process_grade: "F",
    mistake_tags: ["soccer_total_weak", "oversized_stake"],
    notes: "Lost, bought $12.42. Major sizing violation for a weak soccer total."
  },
  {
    id: "thread-005",
    date: "",
    time: "",
    sport: "MLB",
    league: "MLB",
    game: "TEX Rangers game",
    team_or_player: "Alejandro Osuna",
    market_type: "MLB_hits",
    market_name: "Over 2.5 hits",
    line: 2.5,
    odds: 1900,
    stake: 1.98,
    payout: 0,
    status: "lost",
    pregame_or_live: "unknown",
    confidence: "low",
    process_grade: "F",
    mistake_tags: ["longshot_too_large"],
    notes: "Lost, bought $1.98. Extreme longshot prop; should be capped at dust size or passed."
  },
  {
    id: "thread-006",
    date: "",
    time: "",
    sport: "MLB",
    league: "MLB",
    game: "HOU Astros @ DET Tigers",
    team_or_player: "Spencer Torkelson",
    market_type: "MLB_total_bases",
    market_name: "Over 2.5 total bases",
    line: 2.5,
    odds: 270,
    stake: 9.28,
    payout: 0,
    status: "lost",
    pregame_or_live: "unknown",
    confidence: "low",
    process_grade: "D",
    mistake_tags: ["oversized_stake", "bad_ladder"],
    notes: "Lost, bought $9.28. User had already identified this as weak versus recent-production context."
  },
  {
    id: "thread-007",
    date: "",
    time: "",
    sport: "MLB",
    league: "MLB",
    game: "HOU Astros @ DET Tigers",
    team_or_player: "Dillon Dingler",
    market_type: "MLB_total_bases",
    market_name: "Over 1.5 total bases",
    line: 1.5,
    odds: 257,
    stake: 4.8,
    payout: 0,
    status: "lost",
    pregame_or_live: "unknown",
    confidence: "medium",
    process_grade: "C",
    mistake_tags: ["bad_ladder", "duplicate_exposure", "oversized_stake"],
    notes: "Lost, bought $4.80. Same-player ladder conflict with Dingler 0.5 TB."
  },
  {
    id: "thread-008",
    date: "",
    time: "",
    sport: "MLB",
    league: "MLB",
    game: "HOU Astros @ DET Tigers",
    team_or_player: "Dillon Dingler",
    market_type: "MLB_total_bases",
    market_name: "Over 0.5 total bases",
    line: 0.5,
    odds: 104,
    stake: 4.59,
    payout: 9,
    status: "won",
    pregame_or_live: "unknown",
    confidence: "medium",
    process_grade: "B",
    mistake_tags: ["duplicate_exposure"],
    notes: "Won, bought $4.59, paid $9. Safer mispriced TB rung was the repeatable part."
  },
  {
    id: "thread-009",
    date: "",
    time: "",
    sport: "MLB",
    league: "MLB",
    game: "NYM Mets @ PHI Phillies",
    team_or_player: "J.T. Realmuto",
    market_type: "MLB_total_bases",
    market_name: "Over 1.5 total bases",
    line: 1.5,
    odds: 144,
    stake: null,
    payout: 11,
    status: "won",
    pregame_or_live: "unknown",
    confidence: "medium",
    process_grade: "B",
    mistake_tags: [],
    notes: "Won, paid $11. Stake not visible."
  },
  {
    id: "thread-010",
    date: "",
    time: "",
    sport: "MLB",
    league: "MLB",
    game: "DET Tigers / PHI Phillies combo",
    team_or_player: "Riley Greene + Kyle Schwarber",
    market_type: "parlay",
    market_name: "Riley Greene 1.5+ TB + Kyle Schwarber 1.5+ TB combo",
    line: "",
    odds: 400,
    stake: null,
    payout: 22,
    status: "won",
    pregame_or_live: "unknown",
    confidence: "low",
    process_grade: "D",
    mistake_tags: ["parlay_unnecessary", "bad_process_good_result", "duplicate_exposure"],
    notes: "Won, paid $22. Good result, but parlay and repeated exposure were not disciplined."
  },
  {
    id: "thread-011",
    date: "",
    time: "",
    sport: "MLB",
    league: "MLB",
    game: "PHI Phillies game",
    team_or_player: "Kyle Schwarber",
    market_type: "MLB_total_bases",
    market_name: "Over 1.5 total bases",
    line: 1.5,
    odds: 108,
    stake: null,
    payout: 10,
    status: "won",
    pregame_or_live: "unknown",
    confidence: "medium",
    process_grade: "B",
    mistake_tags: ["duplicate_exposure"],
    notes: "Won, paid $10. Repeatable as a single; duplicated in combo exposure."
  },
  {
    id: "thread-012",
    date: "",
    time: "",
    sport: "MLB",
    league: "MLB",
    game: "WAS Nationals @ PHI Phillies",
    team_or_player: "PHI Phillies",
    market_type: "MLB_runline",
    market_name: "Phillies -1.5",
    line: -1.5,
    odds: 104,
    stake: null,
    payout: 19,
    status: "won",
    pregame_or_live: "unknown",
    confidence: "high",
    process_grade: "A",
    mistake_tags: [],
    notes: "Won, paid $19, final PHI 10 WAS 5. Good repeatable MLB runline profile when starter/team mismatch is verified."
  },
  {
    id: "thread-013",
    date: "",
    time: "",
    sport: "MLB",
    league: "MLB",
    game: "DET Tigers game",
    team_or_player: "Riley Greene",
    market_type: "MLB_total_bases",
    market_name: "Over 1.5 total bases",
    line: 1.5,
    odds: 133,
    stake: null,
    payout: 22,
    status: "won",
    pregame_or_live: "unknown",
    confidence: "medium",
    process_grade: "B",
    mistake_tags: ["bad_ladder", "duplicate_exposure"],
    notes: "Won, paid $22. Same-player ladder conflict with Riley Greene 2.5 TB."
  },
  {
    id: "thread-014",
    date: "",
    time: "",
    sport: "MLB",
    league: "MLB",
    game: "DET Tigers game",
    team_or_player: "Riley Greene",
    market_type: "MLB_total_bases",
    market_name: "Over 2.5 total bases",
    line: 2.5,
    odds: 233,
    stake: null,
    payout: 0,
    status: "lost",
    pregame_or_live: "unknown",
    confidence: "low",
    process_grade: "D",
    mistake_tags: ["bad_ladder", "duplicate_exposure"],
    notes: "Lost. Higher ladder rung should have been tiny or skipped after the 1.5 TB exposure."
  },
  {
    id: "thread-015",
    date: "",
    time: "",
    sport: "MLB",
    league: "MLB",
    game: "NYY Yankees game",
    team_or_player: "Cam Schlittler",
    market_type: "MLB_pitcher_K",
    market_name: "Over 6.5 strikeouts",
    line: 6.5,
    odds: 104,
    stake: null,
    payout: 9,
    status: "won",
    pregame_or_live: "unknown",
    confidence: "high",
    process_grade: "A",
    mistake_tags: [],
    notes: "Won, paid $9. Repeatable only when pitcher matchup and leash are confirmed."
  },
  {
    id: "thread-016",
    date: "",
    time: "",
    sport: "MLB",
    league: "MLB",
    game: "SEA Mariners @ PIT Pirates",
    team_or_player: "SEA Mariners",
    market_type: "MLB_runline",
    market_name: "Mariners +1.5",
    line: 1.5,
    odds: 133,
    stake: null,
    payout: 0,
    status: "lost",
    pregame_or_live: "unknown",
    confidence: "low",
    process_grade: "C",
    mistake_tags: [],
    notes: "Lost, final SEA 1 PIT 5. Stake not visible."
  },
  {
    id: "thread-017",
    date: "",
    time: "",
    sport: "MLB",
    league: "MLB",
    game: "SEA Mariners @ PIT Pirates",
    team_or_player: "SEA Mariners",
    market_type: "MLB_side",
    market_name: "Mariners ML",
    line: "",
    odds: 329,
    stake: null,
    payout: 3.24,
    status: "verify",
    pregame_or_live: "unknown",
    confidence: "low",
    process_grade: "F",
    mistake_tags: ["stale_board", "live_market_stale"],
    notes: "Appears paid $3.24, but final SEA 1 PIT 5. Verify whether display was sell/cashout/refund/partial, not a win."
  },
  {
    id: "thread-018",
    date: "",
    time: "",
    sport: "MLB",
    league: "MLB",
    game: "NYY + LAD + ATH combo",
    team_or_player: "NYY + LAD + ATH",
    market_type: "parlay",
    market_name: "3 Pick Combo: NYY +1.5, LAD Dodgers, ATH Athletics",
    line: "",
    odds: 376,
    stake: null,
    payout: 0,
    status: "lost",
    pregame_or_live: "unknown",
    confidence: "low",
    process_grade: "D",
    mistake_tags: ["parlay_unnecessary", "duplicate_exposure"],
    notes: "Lost due Athletics. Combo added before single-edge discipline."
  },
  {
    id: "thread-019",
    date: "",
    time: "",
    sport: "MLB",
    league: "MLB",
    game: "ATH Athletics @ SF Giants",
    team_or_player: "ATH Athletics",
    market_type: "MLB_side",
    market_name: "Athletics ML",
    line: "",
    odds: -108,
    stake: null,
    payout: 0,
    status: "lost",
    pregame_or_live: "unknown",
    confidence: "low",
    process_grade: "D",
    mistake_tags: ["duplicate_exposure"],
    notes: "Lost, final ATH 1 SF 2. Duplicated Athletics exposure with the combo."
  }
]);

function isFiniteNumber(value) {
  return typeof value === "number" && Number.isFinite(value);
}

function toNumberOrNull(value) {
  if (value === "" || value === null || value === undefined) {
    return null;
  }

  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function americanToImpliedProbability(americanOdds) {
  if (!isFiniteNumber(americanOdds) || americanOdds === 0) {
    return null;
  }

  return americanOdds > 0
    ? 100 / (americanOdds + 100)
    : Math.abs(americanOdds) / (Math.abs(americanOdds) + 100);
}

function netProfitFrom(entry) {
  const stake = toNumberOrNull(entry.stake);
  const payout = toNumberOrNull(entry.payout);

  if (!isFiniteNumber(stake) || !isFiniteNumber(payout)) {
    return null;
  }

  return payout - stake;
}

function resultGradeFor(entry) {
  if (entry.status === "verify" || entry.status === "pending") {
    return "unresolved";
  }

  const strongProcess = ["A", "B"].includes(entry.process_grade);
  const weakProcess = ["D", "F"].includes(entry.process_grade);

  if (entry.status === "won" && strongProcess) {
    return "good_process_good_result";
  }

  if (entry.status === "lost" && strongProcess) {
    return "good_process_bad_result";
  }

  if (entry.status === "won" && weakProcess) {
    return "bad_process_good_result";
  }

  if (entry.status === "lost" && weakProcess) {
    return "bad_process_bad_result";
  }

  return entry.status === "won" ? "thin_process_good_result" : "thin_process_bad_result";
}

function stakeRuleFor(entry) {
  const odds = toNumberOrNull(entry.odds);

  if (entry.status === "verify" || (entry.mistake_tags ?? []).some((tag) => ["stale_board", "live_market_stale"].includes(tag))) {
    return STAKE_RULES.UNVERIFIED;
  }

  if (entry.market_type === "parlay") {
    return STAKE_RULES.PARLAY;
  }

  if (entry.market_type === "soccer_total") {
    return STAKE_RULES.SOCCER_TOTAL;
  }

  if (isFiniteNumber(odds) && odds >= 500) {
    return STAKE_RULES.LONGSHOT_500_PLUS;
  }

  if (entry.process_grade === "B" || entry.process_grade === "C") {
    return STAKE_RULES.B_LEAN;
  }

  if (entry.process_grade === "A" && ["MLB_side", "MLB_total", "MLB_runline"].includes(entry.market_type)) {
    return STAKE_RULES.A_MLB_SIDE_TOTAL;
  }

  if (entry.process_grade === "A" && /^MLB_/.test(entry.market_type)) {
    return STAKE_RULES.A_MLB_PROP;
  }

  return STAKE_RULES.UNVERIFIED;
}

function missingEvidenceNotes(entry) {
  const missing = [];

  for (const field of ["date", "time", "stake"]) {
    if (entry[field] === "" || entry[field] === null || entry[field] === undefined) {
      missing.push(field);
    }
  }

  if (entry.pregame_or_live === "unknown") {
    missing.push("pregame_or_live");
  }

  return missing;
}

function normalizeLedgerEntry(rawEntry, index = 0, options = {}) {
  const bankroll = toNumberOrNull(rawEntry.bankroll_at_time) ?? options.defaultBankroll ?? DEFAULT_VISIBLE_BANKROLL;
  const odds = toNumberOrNull(rawEntry.odds);
  const stake = toNumberOrNull(rawEntry.stake);
  const payout = toNumberOrNull(rawEntry.payout);
  const netProfit = netProfitFrom({ ...rawEntry, stake, payout });
  const impliedProbability = americanToImpliedProbability(odds);
  const result_grade = rawEntry.result_grade ?? resultGradeFor(rawEntry);
  const source_type = rawEntry.source_type ?? "thread_settled_example";
  const source_file = rawEntry.source_file ?? "user_prompt_thread_results";
  const source_frame_or_screenshot = rawEntry.source_frame_or_screenshot ?? "visible_settled_examples";
  const mistake_tags = Array.from(new Set(rawEntry.mistake_tags ?? []));
  const missingEvidence = missingEvidenceNotes({ ...rawEntry, stake });
  const stakeRule = stakeRuleFor({ ...rawEntry, odds, mistake_tags });
  const stakePct = isFiniteNumber(stake) && isFiniteNumber(bankroll) && bankroll > 0 ? stake / bankroll : null;
  const sizingViolation =
    isFiniteNumber(stakePct) &&
    stakeRule.maxPct >= 0 &&
    stakePct > stakeRule.maxPct + 1e-9;

  if (sizingViolation && !mistake_tags.includes("oversized_stake")) {
    mistake_tags.push("oversized_stake");
  }

  if (result_grade === "good_process_bad_result" && !mistake_tags.includes("good_process_bad_result")) {
    mistake_tags.push("good_process_bad_result");
  }

  if (result_grade === "bad_process_good_result" && !mistake_tags.includes("bad_process_good_result")) {
    mistake_tags.push("bad_process_good_result");
  }

  return {
    id: rawEntry.id ?? `ledger-${String(index + 1).padStart(3, "0")}`,
    date: rawEntry.date ?? "",
    time: rawEntry.time ?? "",
    sport: rawEntry.sport ?? "",
    league: rawEntry.league ?? "",
    game: rawEntry.game ?? "",
    team_or_player: rawEntry.team_or_player ?? "",
    market_type: rawEntry.market_type ?? "prediction_market",
    market_name: rawEntry.market_name ?? "",
    line: rawEntry.line ?? "",
    odds,
    stake,
    payout,
    net_profit: netProfit,
    status: rawEntry.status ?? "pending",
    pregame_or_live: rawEntry.pregame_or_live ?? "unknown",
    source_type,
    source_file,
    source_frame_or_screenshot,
    bankroll_at_time: bankroll,
    implied_probability: impliedProbability,
    estimated_fair_probability: rawEntry.estimated_fair_probability ?? null,
    edge_percent: rawEntry.edge_percent ?? null,
    confidence: rawEntry.confidence ?? "low",
    process_grade: rawEntry.process_grade ?? "C",
    result_grade,
    mistake_tags,
    notes: rawEntry.notes ?? "",
    audit: {
      missingEvidence,
      stakeRule,
      stakePct,
      sizingViolation,
      evidenceClassified:
        missingEvidence.length === 0 &&
        Boolean(rawEntry.sport) &&
        Boolean(rawEntry.league) &&
        Boolean(rawEntry.game) &&
        Boolean(rawEntry.market_type) &&
        isFiniteNumber(odds)
    }
  };
}

function buildLedger(entries = THREAD_SETTLED_EXAMPLES, options = {}) {
  return entries.map((entry, index) => normalizeLedgerEntry(entry, index, options));
}

function groupBy(values, getKey) {
  const groups = new Map();

  for (const value of values) {
    const key = getKey(value);

    if (!groups.has(key)) {
      groups.set(key, []);
    }

    groups.get(key).push(value);
  }

  return groups;
}

function summarizeRoiByMarketType(ledger) {
  const groups = groupBy(ledger, (entry) => entry.market_type);
  const summary = [];

  for (const [marketType, rows] of groups) {
    const calculable = rows.filter((row) => isFiniteNumber(row.stake) && isFiniteNumber(row.net_profit));
    const stakeAtRisk = calculable.reduce((total, row) => total + row.stake, 0);
    const grossPayout = calculable.reduce((total, row) => total + row.payout, 0);
    const netProfit = calculable.reduce((total, row) => total + row.net_profit, 0);

    summary.push({
      market_type: marketType,
      bets: rows.length,
      calculable_bets: calculable.length,
      missing_stake_bets: rows.filter((row) => !isFiniteNumber(row.stake)).length,
      wins: rows.filter((row) => row.status === "won").length,
      losses: rows.filter((row) => row.status === "lost").length,
      verify: rows.filter((row) => row.status === "verify").length,
      stake_at_risk: stakeAtRisk,
      gross_payout: grossPayout,
      net_profit: netProfit,
      roi: stakeAtRisk > 0 ? netProfit / stakeAtRisk : null
    });
  }

  return summary.sort((left, right) => left.market_type.localeCompare(right.market_type));
}

function summarizeProcessByMarketType(ledger) {
  const groups = groupBy(ledger, (entry) => entry.market_type);
  const gradeRank = { A: 5, B: 4, C: 3, D: 2, F: 1 };

  return Array.from(groups, ([marketType, rows]) => {
    const counts = { A: 0, B: 0, C: 0, D: 0, F: 0 };
    let totalRank = 0;
    let ranked = 0;

    for (const row of rows) {
      if (Object.prototype.hasOwnProperty.call(counts, row.process_grade)) {
        counts[row.process_grade] += 1;
        totalRank += gradeRank[row.process_grade];
        ranked += 1;
      }
    }

    return {
      market_type: marketType,
      bets: rows.length,
      grade_counts: counts,
      average_grade_score: ranked > 0 ? totalRank / ranked : null
    };
  }).sort((left, right) => left.market_type.localeCompare(right.market_type));
}

function summarizeMistakeTags(ledger) {
  const tagMap = new Map();

  for (const row of ledger) {
    for (const tag of row.mistake_tags) {
      const current = tagMap.get(tag) ?? {
        tag,
        count: 0,
        calculable_net_profit: 0,
        calculable_stake: 0,
        examples: []
      };

      current.count += 1;

      if (isFiniteNumber(row.net_profit) && isFiniteNumber(row.stake)) {
        current.calculable_net_profit += row.net_profit;
        current.calculable_stake += row.stake;
      }

      if (current.examples.length < 3) {
        current.examples.push(`${row.team_or_player} ${row.market_name}`.trim());
      }

      tagMap.set(tag, current);
    }
  }

  return Array.from(tagMap.values())
    .map((entry) => ({
      ...entry,
      roi: entry.calculable_stake > 0 ? entry.calculable_net_profit / entry.calculable_stake : null
    }))
    .sort((left, right) => right.count - left.count || left.tag.localeCompare(right.tag));
}

function identifyBiggestLeaks(ledger) {
  const tagSummary = summarizeMistakeTags(ledger);
  const roiSummary = summarizeRoiByMarketType(ledger);
  const leaks = [];

  for (const tag of tagSummary.filter((entry) => entry.count > 0)) {
    leaks.push({
      leak: tag.tag,
      count: tag.count,
      net_profit: tag.calculable_net_profit,
      roi: tag.roi,
      examples: tag.examples
    });
  }

  for (const market of roiSummary.filter((entry) => entry.calculable_bets > 0 && entry.net_profit < 0)) {
    leaks.push({
      leak: `${market.market_type}_negative_roi`,
      count: market.calculable_bets,
      net_profit: market.net_profit,
      roi: market.roi,
      examples: [`${market.market_type} went ${market.wins}-${market.losses} on calculable settled rows.`]
    });
  }

  return leaks.sort((left, right) => {
    const leftLoss = Math.min(0, left.net_profit ?? 0);
    const rightLoss = Math.min(0, right.net_profit ?? 0);

    return leftLoss - rightLoss || right.count - left.count;
  });
}

function identifyRepeatableEdges(ledger) {
  const candidates = ledger.filter((row) =>
    row.status === "won" &&
    ["A", "B"].includes(row.process_grade) &&
    !row.mistake_tags.includes("parlay_unnecessary") &&
    !row.mistake_tags.includes("stale_board")
  );

  const groups = groupBy(candidates, (entry) => entry.market_type);

  return Array.from(groups, ([marketType, rows]) => ({
    market_type: marketType,
    count: rows.length,
    examples: rows.slice(0, 5).map((row) => `${row.team_or_player} ${row.market_name} ${row.odds > 0 ? "+" : ""}${row.odds}`),
    rule: repeatableEdgeRule(marketType)
  })).sort((left, right) => right.count - left.count || left.market_type.localeCompare(right.market_type));
}

function repeatableEdgeRule(marketType) {
  switch (marketType) {
    case "MLB_runline":
      return "Only when starter/team mismatch, lineup, and price are verified; stake 0.75%-1.25% for true A-tier.";
    case "MLB_total_bases":
      return "Prefer one 1.5 TB rung at plus money or safer 0.5 TB misprice; avoid same-player ladders.";
    case "MLB_pitcher_K":
      return "Only when pitcher K matchup, leash, opposing strikeout rate, and official starter all align.";
    default:
      return "Repeat only as a single-position edge with verified current board and capped stake.";
  }
}

function generateRuleChanges() {
  return [
    "No recommendation before evidence classification: date, time, sport, league, game, market, current/live/settled/stale, bankroll, odds sign, matchup, and exposure.",
    "Settled tickets are audit evidence only; they are never current board evidence.",
    "One player gets one meaningful exposure bucket. If a ladder is used, only one rung receives a real stake and higher rungs are dust only.",
    "Soccer totals default to PASS unless independently modeled; max stake is 0.35% bankroll.",
    "Longshots +500 or longer are capped at 0.25% bankroll and require an explicit fair-probability reason.",
    "Parlays are blocked unless every leg is independently positive EV and correlation is stated.",
    "If odds sign is not visually confirmed, output WAIT.",
    "If official pitcher/starter/matchup conflicts with the board, output WAIT/PASS.",
    "Any market with stale or ambiguous board evidence has stake 0%.",
    "A-tier only on next slate; B leans are watchlist unless price improves."
  ];
}

function buildAuditReport(ledger = buildLedger()) {
  return {
    generatedAt: new Date().toISOString(),
    protocol: {
      coreRule: "No bet can be recommended until evidence is classified first.",
      ledgerFields: LEDGER_FIELDS,
      marketTypes: MARKET_TYPES,
      mistakeTags: MISTAKE_TAGS,
      stakeRules: STAKE_RULES,
      nextSlateChecklist: NEXT_SLATE_CHECKLIST,
      betCardTemplate: BET_CARD_TEMPLATE,
      doNotBetConditions: DO_NOT_BET_CONDITIONS
    },
    summary: {
      ledgerRows: ledger.length,
      rowsWithCalculatedNet: ledger.filter((row) => isFiniteNumber(row.net_profit)).length,
      rowsMissingStake: ledger.filter((row) => !isFiniteNumber(row.stake)).length,
      wins: ledger.filter((row) => row.status === "won").length,
      losses: ledger.filter((row) => row.status === "lost").length,
      verify: ledger.filter((row) => row.status === "verify").length,
      knownStake: ledger.filter((row) => isFiniteNumber(row.stake)).reduce((total, row) => total + row.stake, 0),
      knownNetProfit: ledger.filter((row) => isFiniteNumber(row.net_profit)).reduce((total, row) => total + row.net_profit, 0)
    },
    roiByMarketType: summarizeRoiByMarketType(ledger),
    processByMarketType: summarizeProcessByMarketType(ledger),
    mistakeTagSummary: summarizeMistakeTags(ledger),
    leakReport: identifyBiggestLeaks(ledger),
    repeatableEdges: identifyRepeatableEdges(ledger),
    ruleChanges: generateRuleChanges(),
    ledger
  };
}

function csvEscape(value) {
  if (Array.isArray(value)) {
    return csvEscape(value.join("|"));
  }

  if (value && typeof value === "object") {
    return csvEscape(JSON.stringify(value));
  }

  const text = value === null || value === undefined ? "" : String(value);

  if (/[",\n\r]/.test(text)) {
    return `"${text.replaceAll("\"", "\"\"")}"`;
  }

  return text;
}

function buildLedgerCsv(ledger) {
  const lines = [LEDGER_FIELDS.join(",")];

  for (const row of ledger) {
    lines.push(LEDGER_FIELDS.map((field) => csvEscape(row[field])).join(","));
  }

  return `${lines.join("\n")}\n`;
}

function formatMoney(value) {
  return isFiniteNumber(value) ? `$${value.toFixed(2)}` : "-";
}

function formatPercent(value) {
  return isFiniteNumber(value) ? `${(value * 100).toFixed(1)}%` : "-";
}

function formatOdds(value) {
  return isFiniteNumber(value) ? `${value > 0 ? "+" : ""}${value}` : "-";
}

function buildMarkdownReport(report) {
  const lines = [
    "# Bear Edge Protocol Betting Audit",
    "",
    `Generated at: \`${report.generatedAt}\``,
    "",
    "## Ledger Summary",
    "",
    `- Rows entered: \`${report.summary.ledgerRows}\``,
    `- Rows with calculable net P/L: \`${report.summary.rowsWithCalculatedNet}\``,
    `- Rows missing stake: \`${report.summary.rowsMissingStake}\``,
    `- Known stake at risk: \`${formatMoney(report.summary.knownStake)}\``,
    `- Known net P/L: \`${formatMoney(report.summary.knownNetProfit)}\``,
    "",
    "## ROI By Market Type",
    "",
    "| Market Type | Bets | Calculable | Missing Stake | W-L-V | Stake | Net | ROI |",
    "|---|---:|---:|---:|---:|---:|---:|---:|",
    ...report.roiByMarketType.map((row) =>
      `| ${row.market_type} | ${row.bets} | ${row.calculable_bets} | ${row.missing_stake_bets} | ${row.wins}-${row.losses}-${row.verify} | ${formatMoney(row.stake_at_risk)} | ${formatMoney(row.net_profit)} | ${formatPercent(row.roi)} |`
    ),
    "",
    "## Process Grade By Market Type",
    "",
    "| Market Type | Bets | A | B | C | D | F | Avg Score |",
    "|---|---:|---:|---:|---:|---:|---:|---:|",
    ...report.processByMarketType.map((row) =>
      `| ${row.market_type} | ${row.bets} | ${row.grade_counts.A} | ${row.grade_counts.B} | ${row.grade_counts.C} | ${row.grade_counts.D} | ${row.grade_counts.F} | ${isFiniteNumber(row.average_grade_score) ? row.average_grade_score.toFixed(2) : "-"} |`
    ),
    "",
    "## Leak Report",
    "",
    "| Leak | Count | Known Net | ROI | Examples |",
    "|---|---:|---:|---:|---|",
    ...report.leakReport.slice(0, 12).map((row) =>
      `| ${row.leak} | ${row.count} | ${formatMoney(row.net_profit)} | ${formatPercent(row.roi)} | ${row.examples.join("; ")} |`
    ),
    "",
    "## Profitable Repeatable Edges",
    "",
    "| Market Type | Count | Rule | Examples |",
    "|---|---:|---|---|",
    ...report.repeatableEdges.map((row) =>
      `| ${row.market_type} | ${row.count} | ${row.rule} | ${row.examples.join("; ")} |`
    ),
    "",
    "## Rule Changes",
    "",
    ...report.ruleChanges.map((rule) => `- ${rule}`),
    "",
    "## Next-Slate Checklist",
    "",
    ...report.protocol.nextSlateChecklist.map((item) => `- ${item}`),
    "",
    "## Bet Card Template",
    "",
    "```text",
    "BET:",
    "LEAN:",
    "PASS:",
    "WAIT:",
    "Fair line:",
    "Stake:",
    "Max price:",
    "Key reasons:",
    "Risk flags:",
    "Exposure conflicts:",
    "What would change the bet:",
    "```",
    "",
    "## Do Not Bet Conditions",
    "",
    ...report.protocol.doNotBetConditions.map((item) => `- ${item}`),
    "",
    "## Ledger",
    "",
    "| ID | Market | Selection | Odds | Stake | Payout | Net | Status | Process | Result | Tags | Notes |",
    "|---|---|---|---:|---:|---:|---:|---|---|---|---|---|",
    ...report.ledger.map((row) =>
      `| ${row.id} | ${row.market_type} | ${row.team_or_player} ${row.market_name} | ${formatOdds(row.odds)} | ${formatMoney(row.stake)} | ${formatMoney(row.payout)} | ${formatMoney(row.net_profit)} | ${row.status} | ${row.process_grade} | ${row.result_grade} | ${row.mistake_tags.join(", ") || "-"} | ${row.notes} |`
    )
  ];

  return `${lines.join("\n")}\n`;
}

module.exports = {
  BET_CARD_TEMPLATE,
  DEFAULT_VISIBLE_BANKROLL,
  DO_NOT_BET_CONDITIONS,
  LEDGER_FIELDS,
  MARKET_TYPES,
  MISTAKE_TAGS,
  NEXT_SLATE_CHECKLIST,
  STAKE_RULES,
  THREAD_SETTLED_EXAMPLES,
  americanToImpliedProbability,
  buildAuditReport,
  buildLedger,
  buildLedgerCsv,
  buildMarkdownReport,
  identifyBiggestLeaks,
  identifyRepeatableEdges,
  normalizeLedgerEntry,
  summarizeProcessByMarketType,
  summarizeRoiByMarketType
};
