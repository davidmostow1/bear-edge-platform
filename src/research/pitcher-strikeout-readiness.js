const fs = require("node:fs");
const path = require("node:path");

const { COHORT_START_AT } = require("./pitcher-strikeout-contract.js");
const { MODEL_ID, MODEL_VERSION } = require("./pitcher-strikeout-model.js");

const REQUIRED_RETROSHEET_SEASONS = Object.freeze([2021, 2022, 2023, 2024, 2025]);
const REQUIRED_RETROSHEET_FILES = Object.freeze([
  "archive",
  "gameinfo",
  "batting",
  "pitching",
  "allplayers"
]);
const DEFAULT_COHORT_PATH = path.join(
  "data",
  "research",
  "pitcher-strikeouts",
  "prospective-cohort.jsonl"
);

function retrosheetSeasonFiles(rootDir, season) {
  const seasonDir = path.join(rootDir, "data", "research", "retrosheet", String(season));
  return {
    archive: path.join(seasonDir, `${season}csvs.zip`),
    gameinfo: path.join(seasonDir, `${season}gameinfo.csv`),
    batting: path.join(seasonDir, `${season}batting.csv`),
    pitching: path.join(seasonDir, `${season}pitching.csv`),
    allplayers: path.join(seasonDir, `${season}allplayers.csv`)
  };
}

function historicalCoverage(rootDir) {
  const seasons = REQUIRED_RETROSHEET_SEASONS.map((season) => {
    const files = retrosheetSeasonFiles(rootDir, season);
    const present = Object.fromEntries(
      Object.entries(files).map(([name, filePath]) => [name, fs.existsSync(filePath)])
    );
    const missingFiles = REQUIRED_RETROSHEET_FILES.filter((name) => !present[name]);
    return {
      season,
      complete: missingFiles.length === 0,
      present,
      missingFiles
    };
  });
  const completeSeasons = seasons.filter((entry) => entry.complete).length;
  return {
    status: completeSeasons === REQUIRED_RETROSHEET_SEASONS.length ? "complete" : "missing",
    attributionRequired: true,
    automationAuthorized: false,
    requiredSeasons: REQUIRED_RETROSHEET_SEASONS,
    completeSeasons,
    seasons
  };
}

function providerById(providerSetup, id) {
  return Array.isArray(providerSetup?.providers)
    ? providerSetup.providers.find((provider) => provider.id === id) ?? null
    : null;
}

function providerCoverage(provider, options = {}) {
  if (provider?.usableNow === true) {
    return {
      status: "verified_live",
      configured: true,
      usableNow: true,
      freshness: "not_checked_by_readiness_summary"
    };
  }
  if (provider?.configured === true) {
    return {
      status: "configured_unverified",
      configured: true,
      usableNow: false,
      freshness: "unverified"
    };
  }
  return {
    status: options.missingStatus ?? "blocked",
    configured: false,
    usableNow: false,
    freshness: "unavailable"
  };
}

function cohortSummary(records) {
  const safeRecords = Array.isArray(records) ? records : [];
  const observations = safeRecords.filter((record) => record?.status === "observation");
  const missing = safeRecords.filter((record) => record?.status === "missing");
  const settled = observations.filter((record) => record?.settled === true);
  const eventIds = new Set(
    safeRecords
      .map((record) => record?.eventId)
      .filter((eventId) => typeof eventId === "string" && eventId.length > 0)
  );
  const missingReasons = {};
  for (const record of missing) {
    const reason = typeof record.missingReason === "string" && record.missingReason.length > 0
      ? record.missingReason
      : "UNSPECIFIED_MISSING_REASON";
    missingReasons[reason] = (missingReasons[reason] ?? 0) + 1;
  }
  return {
    startAt: COHORT_START_AT,
    eligibleRecords: safeRecords.length,
    observations: observations.length,
    missing: missing.length,
    distinctEvents: eventIds.size,
    settled: settled.length,
    settlementCoverage: observations.length > 0 ? settled.length / observations.length : null,
    missingReasons
  };
}

function readPitcherStrikeoutCohort(rootDir) {
  const cohortPath = path.join(path.resolve(rootDir), DEFAULT_COHORT_PATH);
  if (!fs.existsSync(cohortPath)) {
    return {
      cohortPath: DEFAULT_COHORT_PATH,
      exists: false,
      records: [],
      malformedLines: []
    };
  }

  const records = [];
  const malformedLines = [];
  const lines = fs.readFileSync(cohortPath, "utf8").split(/\r?\n/);
  lines.forEach((line, index) => {
    if (line.trim() === "") return;
    try {
      const record = JSON.parse(line);
      if (!["observation", "missing"].includes(record?.status)) {
        throw new TypeError("status must be observation or missing");
      }
      records.push(record);
    } catch (error) {
      malformedLines.push({
        line: index + 1,
        error: error instanceof Error ? error.message : String(error)
      });
    }
  });
  return {
    cohortPath: DEFAULT_COHORT_PATH,
    exists: true,
    records,
    malformedLines
  };
}

function buildPitcherStrikeoutResearchReadiness(options = {}) {
  const rootDir = path.resolve(options.rootDir ?? process.cwd());
  const historical = historicalCoverage(rootDir);
  const liveLineup = providerCoverage(providerById(options.providerSetup, "sportsdataio"));
  const price = providerCoverage(providerById(options.providerSetup, "the-odds-api"));
  const cohort = cohortSummary(options.cohortRecords);
  const blockers = [];

  if (historical.status !== "complete") blockers.push("RETROSHEET_2021_2025_MISSING");
  if (liveLineup.status !== "verified_live") blockers.push("SPORTSDATAIO_LIVE_NOT_VERIFIED");
  if (price.status !== "verified_live") blockers.push("DRAFTKINGS_PRICE_FEED_NOT_VERIFIED");
  if (cohort.observations === 0) blockers.push("PROSPECTIVE_COHORT_EMPTY");
  if ((options.cohortMalformedLines ?? []).length > 0) blockers.push("PROSPECTIVE_COHORT_MALFORMED");

  return {
    schemaVersion: "1.0.0",
    generatedAt: options.generatedAt ?? new Date().toISOString(),
    marketFamily: "pitcher_strikeouts",
    status: blockers.length === 0 ? "data_ready_research_only" : "blocked",
    label: liveLineup.status === "verified_live"
      ? "LIVE DATA VERIFIED — MODEL REMAINS RESEARCH ONLY"
      : "LIVE DATA BLOCKED — ADAPTER TESTED WITH FIXTURES ONLY",
    historical,
    liveLineup,
    price,
    cohort,
    model: {
      modelId: MODEL_ID,
      modelVersion: MODEL_VERSION,
      status: "research_only",
      trainingCutoff: null,
      calibrationReportId: null,
      baselines: ["poisson_count_v1", "no_vig_market"]
    },
    credit: {
      reportedBy: "David",
      reportedAt: "2026-08-01",
      reportedRemainingPercent: 98,
      stopAtPercent: 90,
      absoluteCredits: "unverified",
      repositoryEnforced: false
    },
    contextImplementation: {
      weather: "NOT_IMPLEMENTED",
      umpire: "NOT_IMPLEMENTED"
    },
    blockers,
    permission: "PRICE_CHECK_ONLY",
    authorizedStake: 0,
    boundaries: {
      predictiveImprovement: "NOT_EVALUATED",
      modelValidation: "NOT_ESTABLISHED",
      wageringAuthority: "UNCHANGED"
    }
  };
}

module.exports = {
  DEFAULT_COHORT_PATH,
  REQUIRED_RETROSHEET_FILES,
  REQUIRED_RETROSHEET_SEASONS,
  buildPitcherStrikeoutResearchReadiness,
  cohortSummary,
  historicalCoverage,
  readPitcherStrikeoutCohort,
  retrosheetSeasonFiles
};
