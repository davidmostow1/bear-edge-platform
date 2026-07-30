const { readAutoUpdateSnapshot } = require("./auto-update.js");
const { getSourceStatusDashboard } = require("./source-status.js");

const LIVE_DATA_HEARTBEAT_MS = 60 * 1000;
const DEFAULT_STALE_AFTER_MS = 2 * LIVE_DATA_HEARTBEAT_MS;

function parseTimeMs(value) {
  const parsed = Date.parse(value ?? "");

  return Number.isFinite(parsed) ? parsed : null;
}

function ageMs(value, nowMs = Date.now()) {
  const parsed = parseTimeMs(value);

  return parsed === null ? null : Math.max(0, nowMs - parsed);
}

function providerClass(provider, staleAfterMs, nowMs) {
  const providerAgeMs = ageMs(provider?.fetchedAt, nowMs);

  if (providerAgeMs !== null && providerAgeMs > staleAfterMs) {
    return "stale";
  }

  if (provider?.status === "ok") {
    return "live";
  }

  if (provider?.status === "degraded") {
    return "degraded";
  }

  if (provider?.status === "blocked") {
    return "blocked";
  }

  return "unavailable";
}

function summarizeProvider(provider, staleAfterMs, nowMs) {
  return {
    provider: provider.provider,
    status: provider.status,
    liveStatus: providerClass(provider, staleAfterMs, nowMs),
    sourceType: provider.sourceType,
    fetchedAt: provider.fetchedAt,
    ageMs: ageMs(provider.fetchedAt, nowMs),
    staleAfterMs,
    stale: ageMs(provider.fetchedAt, nowMs) !== null && ageMs(provider.fetchedAt, nowMs) > staleAfterMs,
    warnings: Array.isArray(provider.warnings) ? provider.warnings.slice(0, 5) : [],
    summary: provider.summary ?? {}
  };
}

function byProvider(providers, name) {
  return providers.find((provider) => provider.provider === name) ?? null;
}

function sourceCoverage(providers) {
  const espn = byProvider(providers, "ESPN");
  const bySport = espn?.summary?.bySport && typeof espn.summary.bySport === "object" ? espn.summary.bySport : {};

  return {
    officialScoreboardSports: Object.entries(bySport)
      .filter(([, count]) => Number(count) > 0)
      .map(([sport]) => sport.toUpperCase()),
    eventCount: Number(espn?.summary?.eventCount ?? 0),
    mlbInjuryCount: espn?.summary?.mlbInjuryCount ?? null,
    mlbTeamCount: espn?.summary?.mlbTeamCount ?? null
  };
}

function actionList({ providers, autoUpdateStatus, snapshotAgeMs, staleAfterMs }) {
  const actions = [];
  const draftKings = byProvider(providers, "DraftKings");
  const tennis = byProvider(providers, "Tennis");

  if (!autoUpdateStatus?.started) {
    actions.push("Start the local app with auto-update enabled so source snapshots refresh without manual clicks.");
  }

  if (snapshotAgeMs === null) {
    actions.push("Run Auto Update Now once to persist a last-good live data snapshot.");
  } else if (snapshotAgeMs > staleAfterMs) {
    actions.push("Run Auto Update Now; the persisted live snapshot is stale.");
  }

  if (draftKings?.status !== "ok") {
    actions.push("Fix or replace the verified odds API key before expecting automatic priced DraftKings bets.");
  }

  if (tennis?.status !== "ok") {
    actions.push("Keep tennis manual-only until a verified tennis stats and odds provider is configured.");
  }

  return actions;
}

function summarizeLiveDataHealth({
  sourceStatus,
  autoUpdateStatus = null,
  snapshotInfo = null,
  heartbeatMs = LIVE_DATA_HEARTBEAT_MS,
  staleAfterMs = DEFAULT_STALE_AFTER_MS,
  now = new Date()
}) {
  const nowMs = now.getTime();
  const providers = Array.isArray(sourceStatus?.providers) ? sourceStatus.providers : [];
  const providerHealth = providers.map((provider) => summarizeProvider(provider, staleAfterMs, nowMs));
  const blockedProviders = providerHealth.filter((provider) => provider.liveStatus === "blocked").map((provider) => provider.provider);
  const degradedProviders = providerHealth.filter((provider) => provider.liveStatus === "degraded").map((provider) => provider.provider);
  const staleProviders = providerHealth.filter((provider) => provider.liveStatus === "stale").map((provider) => provider.provider);
  const liveProviders = providerHealth.filter((provider) => provider.liveStatus === "live").map((provider) => provider.provider);
  const espn = byProvider(providerHealth, "ESPN");
  const draftKings = byProvider(providerHealth, "DraftKings");
  const statMuse = byProvider(providerHealth, "StatMuse");
  const tennis = byProvider(providerHealth, "Tennis");
  const snapshotGeneratedAt = snapshotInfo?.snapshot?.generatedAt ?? snapshotInfo?.snapshot?.sourceStatus?.fetchedAt ?? null;
  const snapshotAgeMs = ageMs(snapshotGeneratedAt, nowMs);
  const scoreboardsUsable = ["live", "degraded"].includes(espn?.liveStatus);
  const researchUsable = ["live", "degraded"].includes(statMuse?.liveStatus);
  const oddsUsable = draftKings?.liveStatus === "live";
  const tennisAutomated = tennis?.liveStatus === "live";
  const sourceStatusAgeMs = ageMs(sourceStatus?.fetchedAt, nowMs);
  const dataFresh = staleProviders.length === 0 && sourceStatusAgeMs !== null && sourceStatusAgeMs <= staleAfterMs;
  const status =
    !scoreboardsUsable
      ? "blocked"
      : !dataFresh
        ? "stale"
        : blockedProviders.length > 0 || degradedProviders.length > 0 || !oddsUsable
          ? "live-with-warnings"
          : "live";

  return {
    generatedAt: now.toISOString(),
    status,
    heartbeatMs,
    staleAfterMs,
    sourceStatusFetchedAt: sourceStatus?.fetchedAt ?? null,
    sourceStatusAgeMs,
    autoUpdate: autoUpdateStatus
      ? {
          enabled: autoUpdateStatus.enabled,
          started: autoUpdateStatus.started,
          running: autoUpdateStatus.running,
          intervalMs: autoUpdateStatus.intervalMs,
          lastRunStartedAt: autoUpdateStatus.lastRunStartedAt,
          lastRunFinishedAt: autoUpdateStatus.lastRunFinishedAt,
          lastRunDurationMs: autoUpdateStatus.lastRunDurationMs,
          lastError: autoUpdateStatus.lastError,
          nextRunAt: autoUpdateStatus.nextRunAt,
          runCount: autoUpdateStatus.runCount,
          failureCount: autoUpdateStatus.failureCount
        }
      : {
          enabled: false,
          started: false,
          running: false,
          warning: "Auto-update service is not attached."
        },
    snapshot: {
      exists: Boolean(snapshotInfo?.exists),
      path: snapshotInfo?.snapshotPath ?? null,
      generatedAt: snapshotGeneratedAt,
      ageMs: snapshotAgeMs,
      stale: snapshotAgeMs === null ? true : snapshotAgeMs > staleAfterMs
    },
    coverage: sourceCoverage(providerHealth),
    requirements: {
      officialScoreboards: scoreboardsUsable,
      researchPages: researchUsable,
      verifiedOdds: oddsUsable,
      tennisAutomation: tennisAutomated
    },
    providers: providerHealth,
    summary: {
      liveProviders,
      degradedProviders,
      blockedProviders,
      staleProviders,
      allLiveDataReady: status === "live",
      manualOddsRequired: !oddsUsable,
      manualTennisRequired: !tennisAutomated
    },
    actions: actionList({ providers: providerHealth, autoUpdateStatus, snapshotAgeMs, staleAfterMs })
  };
}

async function getLiveDataHealth(options = {}) {
  const sourceStatus = options.sourceStatus ?? await getSourceStatusDashboard({
    date: options.date ?? "today",
    days: Number.isInteger(options.days) ? options.days : 2,
    maxRosterTeams: options.maxRosterTeams,
    fetchJsonImpl: options.fetchJsonImpl,
    fetchTextImpl: options.fetchTextImpl,
    oddsApiKey: options.oddsApiKey
  });
  const snapshotInfo = options.snapshotInfo ?? await readAutoUpdateSnapshot({
    autoUpdateSnapshotPath: options.autoUpdateSnapshotPath
  });

  return summarizeLiveDataHealth({
    sourceStatus,
    autoUpdateStatus: options.autoUpdateStatus ?? null,
    snapshotInfo,
    heartbeatMs: options.heartbeatMs ?? LIVE_DATA_HEARTBEAT_MS,
    staleAfterMs: options.staleAfterMs ?? DEFAULT_STALE_AFTER_MS,
    now: options.now ?? new Date()
  });
}

module.exports = {
  DEFAULT_STALE_AFTER_MS,
  LIVE_DATA_HEARTBEAT_MS,
  getLiveDataHealth,
  summarizeLiveDataHealth
};
