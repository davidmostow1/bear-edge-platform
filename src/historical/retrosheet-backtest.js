const {
  contentDigest
} = require("../audit/canonical-json.js");
const {
  estimateCountProbability
} = require("../live/estimate-prop.js");

const RETROSHEET_BACKTEST_SCHEMA_VERSION = "1.1.0";
const RETROSHEET_ATTRIBUTION = (
  "The information used here was obtained free of charge from and is copyrighted by "
  + "Retrosheet. Interested parties may contact Retrosheet at \"www.retrosheet.org\"."
);
const RETROSHEET_REPLICA_ID = "retrosheet_poisson_count_replica_v1";
const RETROSHEET_REPLICA_VERSION = "1.0.0";
const RETROSHEET_REPLICA_SPEC = Object.freeze({
  replicaOf: Object.freeze({
    modelId: "poisson_count_v1",
    modelVersion: "1.0.0"
  }),
  featureSource: "retrosheet_player_game_value_rows",
  featureCutoff: "strictly_before_event_date",
  historyPopulation: "all_value_player_game_appearances",
  recentWindow: "configured_prior_appearances",
  targetPopulation: "completed_game_starters",
  lineRule: "max_0_5_floor_blended_mean_plus_0_5",
  side: "over",
  probabilityMethod: "poisson_count"
});
const RETROSHEET_REPLICA_IMPLEMENTATION_DIGEST = contentDigest(
  RETROSHEET_REPLICA_SPEC
);
const MARKET_CONFIG = Object.freeze({
  batter_hits: Object.freeze({
    statKey: "b_h",
    recentWeight: 0.45,
    role: "batter"
  }),
  batter_runs_scored: Object.freeze({
    statKey: "b_r",
    recentWeight: 0.42,
    role: "batter"
  }),
  batter_total_bases: Object.freeze({
    statKey: "total_bases",
    recentWeight: 0.5,
    role: "batter"
  }),
  pitcher_strikeouts: Object.freeze({
    statKey: "p_k",
    recentWeight: 0.45,
    role: "pitcher"
  })
});

class RetrosheetBacktestError extends Error {
  constructor(code, message, options = {}) {
    super(message, options);
    this.name = "RetrosheetBacktestError";
    this.code = code;
  }
}

function parseCsv(text) {
  if (typeof text !== "string") {
    throw new RetrosheetBacktestError("INVALID_CSV", "CSV input must be text.");
  }

  const rows = [];
  let row = [];
  let field = "";
  let inQuotes = false;

  for (let index = 0; index < text.length; index += 1) {
    const character = text[index];

    if (character === '"') {
      if (inQuotes && text[index + 1] === '"') {
        field += '"';
        index += 1;
      } else {
        inQuotes = !inQuotes;
      }
      continue;
    }

    if (!inQuotes && character === ",") {
      row.push(field);
      field = "";
      continue;
    }

    if (!inQuotes && (character === "\n" || character === "\r")) {
      if (character === "\r" && text[index + 1] === "\n") {
        index += 1;
      }
      row.push(field);
      field = "";
      if (row.some((value) => value !== "")) {
        rows.push(row);
      }
      row = [];
      continue;
    }

    field += character;
  }

  if (inQuotes) {
    throw new RetrosheetBacktestError(
      "INVALID_CSV",
      "CSV input ends inside a quoted field."
    );
  }
  if (field !== "" || row.length > 0) {
    row.push(field);
    if (row.some((value) => value !== "")) {
      rows.push(row);
    }
  }
  if (rows.length === 0) {
    return [];
  }

  const header = rows[0].map((value, index) => (
    index === 0 ? value.replace(/^\uFEFF/, "") : value
  ));

  return rows.slice(1).map((values, rowIndex) => {
    if (values.length !== header.length) {
      throw new RetrosheetBacktestError(
        "INVALID_CSV_ROW",
        `CSV row ${rowIndex + 2} has ${values.length} fields; expected ${header.length}.`
      );
    }

    return Object.fromEntries(header.map((name, index) => [name, values[index]]));
  });
}

function requireColumns(rows, columns, sourceName) {
  if (rows.length === 0) {
    throw new RetrosheetBacktestError(
      "EMPTY_SOURCE",
      `${sourceName} contains no data rows.`
    );
  }

  const available = new Set(Object.keys(rows[0]));

  for (const column of columns) {
    if (!available.has(column)) {
      throw new RetrosheetBacktestError(
        "MISSING_COLUMN",
        `${sourceName} is missing required column ${column}.`
      );
    }
  }
}

function integerValue(value) {
  if (typeof value !== "string" || !/^-?\d+$/.test(value.trim())) {
    return null;
  }

  const parsed = Number(value);
  return Number.isSafeInteger(parsed) ? parsed : null;
}

function nonNegativeInteger(row, key) {
  const parsed = integerValue(row?.[key]);
  return parsed !== null && parsed >= 0 ? parsed : null;
}

function totalBases(row) {
  const hits = nonNegativeInteger(row, "b_h");
  const doubles = nonNegativeInteger(row, "b_d");
  const triples = nonNegativeInteger(row, "b_t");
  const homeRuns = nonNegativeInteger(row, "b_hr");

  if ([hits, doubles, triples, homeRuns].some((value) => value === null)) {
    return null;
  }

  const singles = hits - doubles - triples - homeRuns;

  if (singles < 0) {
    return null;
  }

  return hits + doubles + 2 * triples + 3 * homeRuns;
}

function valueForMarket(row, marketFamily) {
  const config = MARKET_CONFIG[marketFamily];

  return config.statKey === "total_bases"
    ? totalBases(row)
    : nonNegativeInteger(row, config.statKey);
}

function gameEligibility(game) {
  if (!game) return "missing_gameinfo";
  if (game.gametype !== "regular") return "not_regular_season";
  if (game.box !== "y") return "missing_box_score";
  if (typeof game.suspend === "string" && game.suspend.trim()) return "suspended_game";
  if (!/^\d{8}$/.test(game.date ?? "")) return "invalid_game_date";
  return null;
}

function discrepancyIndex(rows, sourceType) {
  const index = new Map();

  for (const row of rows) {
    if (row.stattype === "value") {
      continue;
    }

    const key = `${sourceType}|${row.gid}|${row.id}`;
    const types = index.get(key) ?? new Set();
    types.add(row.stattype || "unknown");
    index.set(key, types);
  }

  return index;
}

function playerNames(rows) {
  const names = new Map();

  for (const row of rows) {
    if (!names.has(row.id)) {
      const name = [row.first, row.last].filter(Boolean).join(" ").trim();
      names.set(row.id, name || null);
    }
  }

  return names;
}

function declaredSeason(value) {
  if (!Number.isSafeInteger(value) || value < 1871 || value > 9999) {
    throw new RetrosheetBacktestError(
      "INVALID_CONFIGURATION",
      "season must be a four-digit integer no earlier than 1871."
    );
  }

  return String(value);
}

function starterFlag(row) {
  const keys = ["p_gs", "gs"].filter((key) => Object.hasOwn(row, key));
  const values = keys.map((key) => {
    const raw = row[key];

    if (raw === "" || raw === "0") return false;
    if (raw === "1") return true;
    throw new RetrosheetBacktestError(
      "INVALID_STARTER_FLAG",
      `Pitching row ${row.gid}/${row.id} has invalid ${key}=${JSON.stringify(raw)}.`
    );
  });

  if (values.length === 2 && values[0] !== values[1]) {
    throw new RetrosheetBacktestError(
      "STARTER_FLAG_CONFLICT",
      `Pitching row ${row.gid}/${row.id} has conflicting p_gs and gs values.`
    );
  }

  return values[0] ?? false;
}

function validateGameRows(gameinfo, season) {
  const gameById = new Map();

  for (const game of gameinfo) {
    if (!game.gid) {
      throw new RetrosheetBacktestError(
        "INVALID_GAME_ID",
        "gameinfo.csv contains a row without gid."
      );
    }
    if (gameById.has(game.gid)) {
      throw new RetrosheetBacktestError(
        "DUPLICATE_GAME",
        `gameinfo.csv contains duplicate gid ${game.gid}.`
      );
    }
    if (!/^\d{8}$/.test(game.date ?? "") || !game.date.startsWith(season)) {
      throw new RetrosheetBacktestError(
        "SEASON_MISMATCH",
        `Game ${game.gid} date ${JSON.stringify(game.date)} is outside declared season ${season}.`
      );
    }
    if (game.season !== season) {
      throw new RetrosheetBacktestError(
        "SEASON_MISMATCH",
        `Game ${game.gid} declares season ${JSON.stringify(game.season)}; expected ${season}.`
      );
    }

    gameById.set(game.gid, game);
  }

  return gameById;
}

function expectedTeams(game, vishome) {
  if (vishome === "v") {
    return {
      team: game.visteam,
      opponent: game.hometeam
    };
  }
  if (vishome === "h") {
    return {
      team: game.hometeam,
      opponent: game.visteam
    };
  }

  return null;
}

function validatePlayerRows(rows, gameById, sourceType) {
  const valueRows = new Set();

  for (const row of rows) {
    const locator = `${sourceType} row ${row.gid || "(missing gid)"}/${row.id || "(missing id)"}`;
    const game = gameById.get(row.gid);

    if (!row.gid || !row.id) {
      throw new RetrosheetBacktestError(
        "INVALID_PLAYER_ROW_IDENTITY",
        `${locator} lacks gid or id.`
      );
    }
    if (!game) {
      throw new RetrosheetBacktestError(
        "ORPHAN_PLAYER_ROW",
        `${locator} has no matching gameinfo row.`
      );
    }
    for (const key of ["date", "gametype", "box"]) {
      if (row[key] !== game[key]) {
        throw new RetrosheetBacktestError(
          "SOURCE_ROW_MISMATCH",
          `${locator} has ${key}=${JSON.stringify(row[key])}; gameinfo has ${JSON.stringify(game[key])}.`
        );
      }
    }

    const teams = expectedTeams(game, row.vishome);

    if (!teams || row.team !== teams.team || row.opp !== teams.opponent) {
      throw new RetrosheetBacktestError(
        "SOURCE_ROW_MISMATCH",
        `${locator} does not match the gameinfo visitor/home team orientation.`
      );
    }

    if (row.stattype === "value") {
      const key = `${row.gid}|${row.id}`;

      if (valueRows.has(key)) {
        throw new RetrosheetBacktestError(
          "DUPLICATE_VALUE_ROW",
          `${sourceType}.csv contains duplicate value row ${key}.`
        );
      }
      valueRows.add(key);
    }

    if (sourceType === "pitching") {
      const isStarter = starterFlag(row);
      const sequence = integerValue(row.p_seq);

      if (sequence === null || sequence < 1) {
        throw new RetrosheetBacktestError(
          "INVALID_PITCHING_SEQUENCE",
          `${locator} has invalid p_seq=${JSON.stringify(row.p_seq)}.`
        );
      }
      if ((sequence === 1) !== isStarter) {
        throw new RetrosheetBacktestError(
          "STARTER_SEQUENCE_CONFLICT",
          `${locator} has starter flag inconsistent with p_seq=${sequence}.`
        );
      }
    }
  }
}

function baseObservation(row, game, sourceType, discrepancyTypes) {
  return {
    eventId: game.gid,
    date: game.date,
    number: integerValue(game.number),
    homeTeam: game.hometeam,
    awayTeam: game.visteam,
    site: game.site || null,
    suspendedCompletionDate: game.suspend || null,
    participantId: row.id,
    participantTeam: row.team,
    opponentTeam: row.opp,
    homeAway: row.vishome,
    sourceType,
    rowDigest: contentDigest(row),
    discrepancyTypes: [...(discrepancyTypes ?? [])].sort()
  };
}

function buildAppearances(gameRows, gameById, discrepancies, summary) {
  const appearances = [];

  for (const row of gameRows) {
    if (row.stattype !== "value") {
      continue;
    }

    const game = gameById.get(row.gid);
    const exclusion = gameEligibility(game);

    if (exclusion) {
      summary.excludedRows[exclusion] = (summary.excludedRows[exclusion] ?? 0) + 1;
      continue;
    }
    if (row.box !== "y") {
      summary.excludedRows.player_row_missing_box = (
        summary.excludedRows.player_row_missing_box ?? 0
      ) + 1;
      continue;
    }

    const sourceType = Object.hasOwn(row, "b_seq") ? "batting" : "pitching";
    const discrepancyTypes = discrepancies.get(
      `${sourceType}|${row.gid}|${row.id}`
    );
    const base = baseObservation(row, game, sourceType, discrepancyTypes);

    if (sourceType === "batting") {
      for (const marketFamily of [
        "batter_hits",
        "batter_runs_scored",
        "batter_total_bases"
      ]) {
        const observedValue = valueForMarket(row, marketFamily);

        if (observedValue === null) {
          summary.excludedRows.invalid_stat_value = (
            summary.excludedRows.invalid_stat_value ?? 0
          ) + 1;
          continue;
        }

        appearances.push({
          ...base,
          marketFamily,
          observedValue,
          eligibleTarget: row.b_seq === "1"
        });
      }
      continue;
    }

    const observedValue = valueForMarket(row, "pitcher_strikeouts");

    if (observedValue === null) {
      summary.excludedRows.invalid_stat_value = (
        summary.excludedRows.invalid_stat_value ?? 0
      ) + 1;
      continue;
    }

    appearances.push({
      ...base,
      marketFamily: "pitcher_strikeouts",
      observedValue,
      eligibleTarget: starterFlag(row)
    });
  }

  return appearances;
}

function observationKey(observation) {
  return `${observation.marketFamily}|${observation.participantId}`;
}

function dateGroups(appearances) {
  const grouped = new Map();

  for (const appearance of appearances) {
    const rows = grouped.get(appearance.date) ?? [];
    rows.push(appearance);
    grouped.set(appearance.date, rows);
  }

  return [...grouped.entries()]
    .sort(([left], [right]) => left.localeCompare(right))
    .map(([date, rows]) => ({
      date,
      rows: rows.sort((left, right) => (
        left.eventId.localeCompare(right.eventId)
        || left.marketFamily.localeCompare(right.marketFamily)
        || left.participantId.localeCompare(right.participantId)
      ))
    }));
}

function backtestConfiguration({ season, minHistoryGames, recentLimit }) {
  return {
    season: Number(season),
    minHistoryGames,
    recentLimit,
    sameDateHistoryPolicy: "freeze_before_date_then_update",
    suspendedGamePolicy: "excluded",
    regularSeasonOnly: true,
    targetPopulation: "completed_game_starting_lineup_batters_and_starting_pitchers",
    starterIdentitySource: "postgame_boxscore_reconstruction",
    battingFeaturePopulation: "all_value_rows_including_nonstarter_appearances",
    pitchingFeaturePopulation: "all_value_rows_including_relief_appearances",
    dependenceBoundary: "retrosheet_game_id"
  };
}

function historicalRecord(observation, history, context) {
  const config = MARKET_CONFIG[observation.marketFamily];
  const recent = history.slice(-context.recentLimit);
  const seasonTotal = history.reduce((sum, entry) => sum + entry.observedValue, 0);
  const recentTotal = recent.reduce((sum, entry) => sum + entry.observedValue, 0);
  const seasonPerGame = seasonTotal / history.length;
  const recentPerGame = recentTotal / recent.length;
  const blendedMean = (
    seasonPerGame * (1 - config.recentWeight)
    + recentPerGame * config.recentWeight
  );
  const line = Math.max(0.5, Math.floor(blendedMean) + 0.5);
  const probabilityOver = estimateCountProbability({
    mean: blendedMean,
    line,
    side: "over"
  });
  const latestHistory = history.at(-1);
  const identity = {
    schemaVersion: RETROSHEET_BACKTEST_SCHEMA_VERSION,
    eventId: observation.eventId,
    marketFamily: observation.marketFamily,
    participantId: observation.participantId,
    side: "over",
    line,
    modelId: RETROSHEET_REPLICA_ID,
    modelVersion: RETROSHEET_REPLICA_VERSION,
    replicaImplementationDigest: RETROSHEET_REPLICA_IMPLEMENTATION_DIGEST,
    configurationDigest: context.configurationDigest,
    sourceDigests: context.sourceDigests
  };

  return {
    schemaVersion: RETROSHEET_BACKTEST_SCHEMA_VERSION,
    recordType: "historical_backtest_observation",
    id: `retrobacktest_${contentDigest(identity)}`,
    mode: "historical_reconstruction",
    prospective: false,
    promotionEligible: false,
    betAuthorization: false,
    event: {
      retrosheetGameId: observation.eventId,
      date: observation.date,
      number: observation.number,
      homeTeam: observation.homeTeam,
      awayTeam: observation.awayTeam,
      site: observation.site
    },
    market: {
      marketFamily: observation.marketFamily,
      participantId: observation.participantId,
      participantName: context.names.get(observation.participantId) ?? null,
      participantTeam: observation.participantTeam,
      opponentTeam: observation.opponentTeam,
      homeAway: observation.homeAway,
      side: "over",
      line
    },
    model: {
      modelId: RETROSHEET_REPLICA_ID,
      modelVersion: RETROSHEET_REPLICA_VERSION,
      modelStatus: "historical_backtest_only",
      replicaOf: RETROSHEET_REPLICA_SPEC.replicaOf,
      replicaExactness: "approximate_historical_reconstruction",
      replicaImplementationDigest: RETROSHEET_REPLICA_IMPLEMENTATION_DIGEST,
      configurationDigest: context.configurationDigest,
      probabilityMethod: "poisson_count",
      featureRuleVersion: "retrosheet_prior_date_only_v1"
    },
    features: {
      cutoffRule: "strictly_before_event_date",
      featureCutoffDate: latestHistory.date,
      featureCutoffEventId: latestHistory.eventId,
      historyGames: history.length,
      recentGames: recent.length,
      seasonTotal,
      recentTotal,
      seasonPerGame,
      recentPerGame,
      recentWeight: config.recentWeight,
      blendedMean
    },
    prediction: {
      canonicalSide: "over",
      probability: probabilityOver
    },
    outcome: {
      observedValue: observation.observedValue,
      binaryResult: observation.observedValue > line ? 1 : 0
    },
    source: {
      provider: "retrosheet",
      sourceType: observation.sourceType,
      sourceRowDigest: observation.rowDigest,
      sourceFileDigest: context.sourceDigests[observation.sourceType],
      suppliedArchiveDigest: context.sourceDigests.bundle,
      archiveBinding: context.archiveProvenance,
      sourceLocator: context.sourceLocator,
      stattype: "value",
      discrepancyTypes: observation.discrepancyTypes,
      attribution: RETROSHEET_ATTRIBUTION
    },
    warnings: [
      "Historical reconstruction only; this row is not a prospective prediction.",
      "This row cannot count toward live model promotion or betting authorization.",
      "No sportsbook price, edge, stake, closing-line value, or wager result is present.",
      "Same-date games are frozen from history through the prior date to prevent doubleheader leakage.",
      "Starter identity comes from the completed-game box score, not a retained pregame lineup.",
      "This is a Retrosheet replica of the registered model rules, not an exact replay of live candidate selection.",
      "Retrosheet batter history includes value rows for nonstarter appearances; equivalence to MLB gamesPlayed is unverified."
    ]
  };
}

function validateSourceDigests(sourceDigests) {
  const pattern = /^[a-f0-9]{64}$/;

  for (const key of ["bundle", "gameinfo", "batting", "pitching"]) {
    if (!pattern.test(sourceDigests?.[key] ?? "")) {
      throw new RetrosheetBacktestError(
        "INVALID_SOURCE_DIGEST",
        `sourceDigests.${key} must be a lowercase SHA-256 digest.`
      );
    }
  }
}

function normalizedArchiveProvenance(value, sourceDigests, season) {
  if (value === null || value === undefined) {
    return {
      status: "independently_supplied_files_not_bound_to_archive",
      season: Number(season),
      suppliedArchiveDigest: sourceDigests.bundle,
      members: null
    };
  }
  if (
    value.status !== "verified_archive_member_bytes"
    || value.season !== Number(season)
    || value.suppliedArchiveDigest !== sourceDigests.bundle
  ) {
    throw new RetrosheetBacktestError(
      "INVALID_ARCHIVE_PROVENANCE",
      "Verified archive provenance does not match the declared season and archive digest."
    );
  }

  for (const key of ["gameinfo", "batting", "pitching"]) {
    if (value.members?.[key]?.sha256 !== sourceDigests[key]) {
      throw new RetrosheetBacktestError(
        "INVALID_ARCHIVE_PROVENANCE",
        `Verified archive member ${key} does not match sourceDigests.${key}.`
      );
    }
  }

  return value;
}

function buildRetrosheetBacktest(input, options = {}) {
  const gameinfo = parseCsv(input?.gameinfoCsv);
  const batting = parseCsv(input?.battingCsv);
  const pitching = parseCsv(input?.pitchingCsv);
  const players = input?.allplayersCsv ? parseCsv(input.allplayersCsv) : [];
  const season = declaredSeason(options.season);
  const minHistoryGames = options.minHistoryGames ?? 10;
  const recentLimit = options.recentLimit ?? 10;
  const sourceDigests = options.sourceDigests;

  if (!Number.isSafeInteger(minHistoryGames) || minHistoryGames < 1) {
    throw new RetrosheetBacktestError(
      "INVALID_CONFIGURATION",
      "minHistoryGames must be a positive integer."
    );
  }
  if (!Number.isSafeInteger(recentLimit) || recentLimit < 1) {
    throw new RetrosheetBacktestError(
      "INVALID_CONFIGURATION",
      "recentLimit must be a positive integer."
    );
  }
  validateSourceDigests(sourceDigests);
  requireColumns(
    gameinfo,
    [
      "gid", "visteam", "hometeam", "date", "number", "suspend", "gametype",
      "box", "season"
    ],
    "gameinfo.csv"
  );
  requireColumns(
    batting,
    [
      "gid", "id", "team", "b_seq", "stattype", "b_r", "b_h", "b_d", "b_t",
      "b_hr", "date", "vishome", "opp", "gametype", "box"
    ],
    "batting.csv"
  );
  requireColumns(
    pitching,
    [
      "gid", "id", "team", "p_seq", "stattype", "p_k", "date", "vishome",
      "opp", "gametype", "box"
    ],
    "pitching.csv"
  );
  if (!Object.hasOwn(pitching[0], "p_gs") && !Object.hasOwn(pitching[0], "gs")) {
    throw new RetrosheetBacktestError(
      "MISSING_COLUMN",
      "pitching.csv must include p_gs or gs."
    );
  }

  const gameById = validateGameRows(gameinfo, season);
  validatePlayerRows(batting, gameById, "batting");
  validatePlayerRows(pitching, gameById, "pitching");
  const discrepancies = new Map([
    ...discrepancyIndex(batting, "batting"),
    ...discrepancyIndex(pitching, "pitching")
  ]);
  const summary = {
    sourceRows: {
      gameinfo: gameinfo.length,
      batting: batting.length,
      pitching: pitching.length,
      allplayers: players.length
    },
    excludedRows: {},
    targetAppearances: 0,
    insufficientHistory: 0,
    observations: 0,
    distinctEvents: 0,
    distinctParticipants: 0,
    markets: {}
  };
  const appearances = [
    ...buildAppearances(batting, gameById, discrepancies, summary),
    ...buildAppearances(pitching, gameById, discrepancies, summary)
  ];
  const histories = new Map();
  const records = [];
  const configuration = backtestConfiguration({
    season,
    minHistoryGames,
    recentLimit
  });
  const archiveProvenance = normalizedArchiveProvenance(
    options.archiveProvenance,
    sourceDigests,
    season
  );
  const context = {
    minHistoryGames,
    recentLimit,
    sourceDigests,
    configurationDigest: contentDigest(configuration),
    archiveProvenance,
    sourceLocator: options.sourceLocator
      ?? "https://www.retrosheet.org/downloads/csvdownloads.html",
    names: playerNames(players)
  };

  for (const group of dateGroups(appearances)) {
    for (const observation of group.rows) {
      if (!observation.eligibleTarget) {
        continue;
      }

      summary.targetAppearances += 1;
      const history = histories.get(observationKey(observation)) ?? [];

      if (history.length < minHistoryGames) {
        summary.insufficientHistory += 1;
        continue;
      }

      records.push(historicalRecord(observation, history, context));
    }

    for (const observation of group.rows) {
      const key = observationKey(observation);
      const history = histories.get(key) ?? [];
      history.push({
        date: observation.date,
        eventId: observation.eventId,
        observedValue: observation.observedValue
      });
      histories.set(key, history);
    }
  }

  const eventIds = new Set(records.map((record) => record.event.retrosheetGameId));
  const participantIds = new Set(records.map((record) => record.market.participantId));

  summary.observations = records.length;
  summary.distinctEvents = eventIds.size;
  summary.distinctParticipants = participantIds.size;
  for (const marketFamily of Object.keys(MARKET_CONFIG)) {
    summary.markets[marketFamily] = records.filter(
      (record) => record.market.marketFamily === marketFamily
    ).length;
  }

  return {
    manifest: {
      schemaVersion: RETROSHEET_BACKTEST_SCHEMA_VERSION,
      artifactType: "retrosheet_historical_backtest",
      generatedAt: options.generatedAt ?? new Date().toISOString(),
      mode: "historical_reconstruction",
      prospective: false,
      promotionEligible: false,
      betAuthorization: false,
      model: {
        modelId: RETROSHEET_REPLICA_ID,
        modelVersion: RETROSHEET_REPLICA_VERSION,
        replicaOf: RETROSHEET_REPLICA_SPEC.replicaOf,
        replicaExactness: "approximate_historical_reconstruction",
        replicaImplementationDigest: RETROSHEET_REPLICA_IMPLEMENTATION_DIGEST,
        configurationDigest: context.configurationDigest
      },
      configuration,
      source: {
        provider: "retrosheet",
        sourceLocator: context.sourceLocator,
        sourceDigests,
        archiveBinding: context.archiveProvenance,
        attribution: RETROSHEET_ATTRIBUTION,
        correctionPolicy: "rebuild under a new source digest; never overwrite silently"
      },
      summary,
      warnings: [
        "Historical backtest observations are separate from prospective validation.",
        "They cannot satisfy live promotion, closing-price, or bet-authorization gates.",
        "Using completed-game starter identities makes this conditional backtesting, not proof that the same cohort was knowable at a live cutoff.",
        "This artifact is a Retrosheet replica, not an exact replay of the registered live candidate-selection lifecycle.",
        "Raw observation count is not an independent-sample count; cluster analysis by Retrosheet game id.",
        "Retrosheet value rows are best estimates and are not represented here as official MLB statistics.",
        "Archive-member verification proves byte identity, not cryptographic authenticity of the download origin.",
        "Downstream log-loss calculations must clip zero or one probabilities locally without changing stored probabilities."
      ]
    },
    records
  };
}

module.exports = {
  MARKET_CONFIG,
  RETROSHEET_ATTRIBUTION,
  RETROSHEET_BACKTEST_SCHEMA_VERSION,
  RetrosheetBacktestError,
  buildRetrosheetBacktest,
  parseCsv,
  totalBases
};
