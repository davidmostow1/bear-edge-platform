const crypto = require("node:crypto");
const fs = require("node:fs/promises");
const path = require("node:path");

const { getDecisionLogDashboard } = require("../analytics.js");
const { safeErrorMessage } = require("../config/secrets.js");
const { generateResearchCandidates } = require("./candidates.js");
const { fetchGamesForWindow } = require("./schedule.js");
const { AUTO_REFRESH_MS, getSourceStatusDashboard } = require("./source-status.js");

const DEFAULT_AUTO_UPDATE_LOG_PATH = path.resolve(process.cwd(), "data/logs/auto_update_log.jsonl");
const DEFAULT_AUTO_UPDATE_LATEST_PATH = path.resolve(process.cwd(), "data/logs/auto_update_latest.json");
const DEFAULT_AUTO_UPDATE_SNAPSHOT_PATH = path.resolve(process.cwd(), "data/cache/auto_update_snapshot.json");

function resolveAutoUpdateLogPath(logPath) {
  if (typeof logPath === "string" && logPath.trim()) {
    return path.resolve(logPath);
  }

  if (typeof process.env.BEAR_EDGE_AUTO_UPDATE_LOG_PATH === "string" && process.env.BEAR_EDGE_AUTO_UPDATE_LOG_PATH.trim()) {
    return path.resolve(process.env.BEAR_EDGE_AUTO_UPDATE_LOG_PATH);
  }

  return DEFAULT_AUTO_UPDATE_LOG_PATH;
}

function resolveAutoUpdateLatestPath(latestPath) {
  if (typeof latestPath === "string" && latestPath.trim()) {
    return path.resolve(latestPath);
  }

  if (typeof process.env.BEAR_EDGE_AUTO_UPDATE_LATEST_PATH === "string" && process.env.BEAR_EDGE_AUTO_UPDATE_LATEST_PATH.trim()) {
    return path.resolve(process.env.BEAR_EDGE_AUTO_UPDATE_LATEST_PATH);
  }

  return DEFAULT_AUTO_UPDATE_LATEST_PATH;
}

function resolveAutoUpdateSnapshotPath(snapshotPath) {
  if (typeof snapshotPath === "string" && snapshotPath.trim()) {
    return path.resolve(snapshotPath);
  }

  if (typeof process.env.BEAR_EDGE_AUTO_UPDATE_SNAPSHOT_PATH === "string" && process.env.BEAR_EDGE_AUTO_UPDATE_SNAPSHOT_PATH.trim()) {
    return path.resolve(process.env.BEAR_EDGE_AUTO_UPDATE_SNAPSHOT_PATH);
  }

  return DEFAULT_AUTO_UPDATE_SNAPSHOT_PATH;
}

function safeError(error) {
  return safeErrorMessage(error);
}

function providerSnapshot(provider) {
  return {
    provider: provider.provider,
    status: provider.status,
    sourceType: provider.sourceType,
    fetchedAt: provider.fetchedAt,
    warnings: Array.isArray(provider.warnings) ? provider.warnings.slice(0, 5) : [],
    summary: provider.summary ?? {}
  };
}

function compactDecisionLogSummary(dashboard) {
  return {
    logPath: dashboard.logPath,
    totalEvaluations: dashboard.summary?.totalEvaluations ?? 0,
    betCalls: dashboard.summary?.verdictCounts?.BET ?? 0,
    hitRate: dashboard.summary?.hitRate ?? null,
    falsePositiveBetCalls: dashboard.summary?.falsePositiveBetCalls ?? 0,
    validationGate: dashboard.validationGate ?? null
  };
}

function createRunRecord(state) {
  return {
    id: `auto_${crypto.randomUUID()}`,
    recordType: "auto_update_run",
    status: state.lastError ? "error" : "ok",
    reason: state.lastRunReason,
    startedAt: state.lastRunStartedAt,
    finishedAt: state.lastRunFinishedAt,
    durationMs: state.lastRunDurationMs,
    error: state.lastError,
    result: state.lastError ? null : state.lastResult,
    nextRunAt: state.nextRunAt
  };
}

async function persistAutoUpdateRun(record, options = {}) {
  const logPath = resolveAutoUpdateLogPath(options.autoUpdateLogPath);
  const latestPath = resolveAutoUpdateLatestPath(options.autoUpdateLatestPath);

  await fs.mkdir(path.dirname(logPath), { recursive: true });
  await fs.appendFile(logPath, `${JSON.stringify(record)}\n`, "utf8");
  await fs.mkdir(path.dirname(latestPath), { recursive: true });
  await fs.writeFile(latestPath, `${JSON.stringify(record, null, 2)}\n`, "utf8");

  return {
    logPath,
    latestPath
  };
}

async function persistAutoUpdateSnapshot(snapshot, options = {}) {
  const snapshotPath = resolveAutoUpdateSnapshotPath(options.autoUpdateSnapshotPath);

  await fs.mkdir(path.dirname(snapshotPath), { recursive: true });
  await fs.writeFile(snapshotPath, `${JSON.stringify(snapshot, null, 2)}\n`, "utf8");

  return {
    snapshotPath
  };
}

async function readAutoUpdateSnapshot(options = {}) {
  const snapshotPath = resolveAutoUpdateSnapshotPath(options.autoUpdateSnapshotPath);

  try {
    const snapshot = JSON.parse(await fs.readFile(snapshotPath, "utf8"));

    return {
      snapshotPath,
      exists: true,
      snapshot
    };
  } catch (error) {
    if (error?.code === "ENOENT") {
      return {
        snapshotPath,
        exists: false,
        snapshot: null
      };
    }

    throw error;
  }
}

async function readAutoUpdateHistory(options = {}) {
  const logPath = resolveAutoUpdateLogPath(options.autoUpdateLogPath);
  const latestPath = resolveAutoUpdateLatestPath(options.autoUpdateLatestPath);
  const limit = Number.isInteger(options.limit) && options.limit > 0 ? Math.min(options.limit, 500) : 25;
  let contents = "";

  try {
    contents = await fs.readFile(logPath, "utf8");
  } catch (error) {
    if (error?.code !== "ENOENT") {
      throw error;
    }
  }

  const records = [];
  let invalidLines = 0;

  for (const line of contents.split(/\r?\n/)) {
    if (!line.trim()) {
      continue;
    }

    try {
      records.push(JSON.parse(line));
    } catch {
      invalidLines += 1;
    }
  }

  return {
    logPath,
    latestPath,
    limit,
    totalRecords: records.length,
    invalidLines,
    records: records.slice(-limit).reverse()
  };
}

function createAutoUpdateService(options = {}) {
  const intervalMs = Number.isInteger(options.intervalMs) && options.intervalMs > 0 ? options.intervalMs : AUTO_REFRESH_MS;
  const days = Number.isInteger(options.days) && options.days > 0 ? Math.min(options.days, 7) : 2;
  const maxRosterTeams = Number.isInteger(options.maxRosterTeams) ? options.maxRosterTeams : 6;
  const maxCandidates = Number.isInteger(options.maxCandidates) && options.maxCandidates > 0 ? options.maxCandidates : 20;
  const state = {
    enabled: true,
    intervalMs,
    days,
    maxRosterTeams,
    maxCandidates,
    oddsPolicy: {
      backgroundPaidRequests: false,
      sourceHealthUsageCreditsPerRun: 0,
      manualPricingRequired: true
    },
    running: false,
    started: false,
    lastRunReason: null,
    lastRunStartedAt: null,
    lastRunFinishedAt: null,
    lastRunDurationMs: null,
    nextRunAt: null,
    runCount: 0,
    failureCount: 0,
    lastError: null,
    persistenceError: null,
    lastPersistedAt: null,
    historyPath: resolveAutoUpdateLogPath(options.autoUpdateLogPath),
    latestPath: resolveAutoUpdateLatestPath(options.autoUpdateLatestPath),
    snapshotPath: resolveAutoUpdateSnapshotPath(options.autoUpdateSnapshotPath),
    lastSnapshotPersistedAt: null,
    lastResult: null
  };
  let timer = null;
  let stopped = true;

  function getStatus() {
    return JSON.parse(JSON.stringify(state));
  }

  function clearTimer() {
    if (timer) {
      clearTimeout(timer);
      timer = null;
    }
  }

  function scheduleNext() {
    clearTimer();

    if (stopped || !state.started) {
      state.nextRunAt = null;
      return;
    }

    const nextRunAt = new Date(Date.now() + intervalMs);
    state.nextRunAt = nextRunAt.toISOString();
    timer = setTimeout(() => {
      runNow({ reason: "interval" }).catch(() => undefined);
    }, intervalMs);

    if (typeof timer.unref === "function") {
      timer.unref();
    }
  }

  async function runNow(context = {}) {
    if (state.running) {
      return {
        ...getStatus(),
        skipped: true,
        skipReason: "Auto-update already running."
      };
    }

    clearTimer();

    const startedAt = Date.now();
    state.running = true;
    state.lastRunReason = context.reason ?? "manual";
    state.lastRunStartedAt = new Date(startedAt).toISOString();
    state.lastRunFinishedAt = null;
    state.lastRunDurationMs = null;
    state.lastError = null;
    state.persistenceError = null;

    try {
      const sourceStatus = await getSourceStatusDashboard({
        date: "today",
        days,
        maxRosterTeams,
        fetchJsonImpl: options.fetchJsonImpl,
        fetchTextImpl: options.fetchTextImpl,
        oddsApiKey: options.oddsApiKey
      });
      const [games, candidates, decisionLog] = await Promise.all([
        fetchGamesForWindow({
          date: "today",
          days,
          fetchJsonImpl: options.fetchJsonImpl
        }),
        generateResearchCandidates({
          date: "today",
          days,
          maxCandidates,
          fetchJsonImpl: options.fetchJsonImpl
        }),
        getDecisionLogDashboard({
          logPath: options.logPath
        })
      ]);

      state.runCount += 1;
      const endpoints = {
        sourceStatus: `/api/source-status?date=today&days=${days}`,
        games: `/api/games?date=today&days=${days}`,
        candidates: `/api/candidates?date=today&days=${days}`,
        decisionLog: "/api/decision-log",
        snapshot: "/api/auto-update/snapshot"
      };
      state.lastResult = {
        sourceStatus: {
          fetchedAt: sourceStatus.fetchedAt,
          dates: sourceStatus.dates,
          providers: sourceStatus.providers.map(providerSnapshot),
          blockedProviders: sourceStatus.currentness.blockedProviders,
          degradedProviders: sourceStatus.currentness.degradedProviders
        },
        games: {
          fetchedAt: games.fetchedAt,
          dates: games.dates,
          sports: games.sports,
          totals: games.totals,
          sourceCount: games.sources.length,
          gameCount: games.games.length
        },
        candidates: {
          fetchedAt: candidates.fetchedAt,
          candidateCount: candidates.candidates.length,
          skippedCount: candidates.skipped.length,
          notes: candidates.notes
        },
        decisionLog: compactDecisionLogSummary(decisionLog),
        endpoints,
        snapshot: {
          path: state.snapshotPath,
          updatedAt: null,
          includes: ["sourceStatus", "games", "candidates", "decisionLog"]
        }
      };

      const fullSnapshot = {
        recordType: "auto_update_snapshot",
        generatedAt: new Date().toISOString(),
        reason: state.lastRunReason,
        sourceStatus,
        games,
        candidates,
        decisionLog: compactDecisionLogSummary(decisionLog),
        endpoints
      };
      const snapshotPaths = await persistAutoUpdateSnapshot(fullSnapshot, options);
      state.snapshotPath = snapshotPaths.snapshotPath;
      state.lastSnapshotPersistedAt = fullSnapshot.generatedAt;
      state.lastResult.snapshot.path = snapshotPaths.snapshotPath;
      state.lastResult.snapshot.updatedAt = fullSnapshot.generatedAt;
    } catch (error) {
      state.failureCount += 1;
      state.lastError = safeError(error);
    } finally {
      const finishedAt = Date.now();
      state.running = false;
      state.lastRunFinishedAt = new Date(finishedAt).toISOString();
      state.lastRunDurationMs = finishedAt - startedAt;
      const record = createRunRecord(state);

      try {
        const paths = await persistAutoUpdateRun(record, options);
        state.historyPath = paths.logPath;
        state.latestPath = paths.latestPath;
        state.lastPersistedAt = new Date().toISOString();
      } catch (error) {
        state.persistenceError = safeError(error);
      }

      scheduleNext();
    }

    return getStatus();
  }

  function start() {
    if (state.started) {
      return getStatus();
    }

    stopped = false;
    state.started = true;
    runNow({ reason: "startup" }).catch(() => undefined);
    return getStatus();
  }

  function stop() {
    stopped = true;
    state.started = false;
    clearTimer();
    state.nextRunAt = null;
    return getStatus();
  }

  function setOddsApiKey(oddsApiKey) {
    options.oddsApiKey = oddsApiKey;
    return getStatus();
  }

  return {
    getStatus,
    runNow,
    setOddsApiKey,
    start,
    stop
  };
}

module.exports = {
  DEFAULT_AUTO_UPDATE_LATEST_PATH,
  DEFAULT_AUTO_UPDATE_LOG_PATH,
  DEFAULT_AUTO_UPDATE_SNAPSHOT_PATH,
  createAutoUpdateService,
  persistAutoUpdateRun,
  persistAutoUpdateSnapshot,
  readAutoUpdateSnapshot,
  readAutoUpdateHistory,
  resolveAutoUpdateLatestPath,
  resolveAutoUpdateLogPath,
  resolveAutoUpdateSnapshotPath
};
