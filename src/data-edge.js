const path = require("node:path");

const { getDecisionLogDashboard } = require("./analytics.js");
const { getProviderSetupStatus } = require("./config/provider-requirements.js");
const { safeErrorMessage } = require("./config/secrets.js");
const { getBestMlbTargets } = require("./live/best-mlb-targets.js");
const { getLiveDataHealth } = require("./live/live-data-health.js");

function findProvider(providerSetup, providerId) {
  return providerSetup.providers.find((provider) => provider.id === providerId) ?? null;
}

function compactWarnings(warnings) {
  return Array.from(new Set(
    Array.isArray(warnings) ? warnings.map((warning) => safeErrorMessage(warning)) : []
  )).slice(0, 5);
}

function classifyOddsReadiness({ oddsProvider, liveData, bestTargets }) {
  const pricedCandidates = Number(bestTargets?.summary?.pricedCandidates ?? 0);

  if (!oddsProvider?.configured && !oddsProvider?.savedLocally) {
    return "missing";
  }

  if (!oddsProvider?.configured && oddsProvider?.savedLocally) {
    return "restart_needed";
  }

  if (bestTargets?.status === "priced" && pricedCandidates > 0 && liveData?.requirements?.verifiedOdds) {
    return "verified";
  }

  if (bestTargets?.status === "odds_error") {
    return "provider_error";
  }

  if (bestTargets?.status === "odds_unmatched") {
    return "unmatched";
  }

  return "price_check_only";
}

function resolveBetCallPermission({ oddsStatus, liveData, bestTargets }) {
  if (!liveData?.requirements?.officialScoreboards) {
    return "WAIT";
  }

  if (oddsStatus === "verified") {
    const candidates = [
      ...(Array.isArray(bestTargets?.best) ? bestTargets.best : []),
      ...(Array.isArray(bestTargets?.calibrationCandidates) ? bestTargets.calibrationCandidates : [])
    ];
    const qualifiedBet = candidates.some((candidate) =>
      candidate?.status === "priced" &&
      candidate?.modelEvidence?.validated === true &&
      candidate?.evaluation?.verdict === "BET"
    );

    return qualifiedBet ? "VERIFIED_BETS_ALLOWED" : "WAIT";
  }

  if (Number(bestTargets?.summary?.candidates ?? 0) > 0 || (Array.isArray(bestTargets?.best) && bestTargets.best.length > 0)) {
    return "PRICE_CHECK_ONLY";
  }

  return "WAIT";
}

function dataEdgeStatus({ permission, oddsStatus, liveData }) {
  if (permission === "VERIFIED_BETS_ALLOWED") {
    return "verified";
  }

  if (!liveData?.requirements?.officialScoreboards || oddsStatus === "missing") {
    return "blocked";
  }

  return "needs-work";
}

function dataEdgeActions({ oddsStatus, liveData, bestTargets, decisionLog }) {
  const actions = [...(Array.isArray(liveData?.actions) ? liveData.actions : [])];
  const providerWarning = (bestTargets?.warnings ?? []).join(" ");
  const quotaExhausted = bestTargets?.quota?.circuitReason === "OUT_OF_USAGE_CREDITS" ||
    /OUT_OF_USAGE_CREDITS|usage quota|credits? (?:has been )?reached/i.test(providerWarning);

  if (oddsStatus === "provider_error") {
    actions.unshift(quotaExhausted
      ? "The Odds API key is valid but its usage quota is exhausted; upgrade the plan or wait for the monthly reset before automatic priced bets can run."
      : "Fix or replace the verified odds API key; the current key exists but live pricing is failing.");
  } else if (oddsStatus === "unmatched") {
    actions.unshift("Keep using manual price checks until provider prop names, player names, and lines match generated candidates.");
  } else if (oddsStatus === "missing") {
    actions.unshift("Add and verify THE_ODDS_API_KEY before expecting automatic priced bets.");
  } else if (oddsStatus === "restart_needed") {
    actions.unshift("Restart Bear Edge or save the key through the dashboard so the running server can use it.");
  }

  if (decisionLog?.dataQuality?.status !== "ok") {
    actions.push("Settle logged BET calls with result, closing line, and false-positive notes.");
  }

  return Array.from(new Set(actions)).slice(0, 8);
}

function timestampAgeMinutes(value, now = new Date()) {
  const timestamp = Date.parse(value ?? "");

  if (!Number.isFinite(timestamp)) {
    return null;
  }

  return (now.getTime() - timestamp) / 60000;
}

/**
 * @param {{liveData?: any, bestTargets?: any, now?: Date, requiredBookmaker?: string, maxAgeMinutes?: number}} [options]
 */
function assessOddsEvidence({
  liveData,
  bestTargets,
  now = new Date(),
  requiredBookmaker = "draftkings",
  maxAgeMinutes = 10
} = {}) {
  const reasonCodes = [];
  const best = Array.isArray(bestTargets?.best) ? bestTargets.best : [];
  const pricedCandidates = Number(bestTargets?.summary?.pricedCandidates ?? 0);
  const normalizedBookmaker = String(requiredBookmaker ?? "").trim().toLowerCase();
  const bookmakerRows = best.filter((candidate) => {
    const bookmaker = String(candidate?.odds?.bookmaker?.key ?? "").trim().toLowerCase();
    return bookmaker && bookmaker === normalizedBookmaker;
  });
  const timestampedRows = bookmakerRows
    .map((candidate) => ({
      candidate,
      ageMinutes: timestampAgeMinutes(candidate?.odds?.marketLastUpdate, now)
    }));
  const freshRows = timestampedRows.filter(({ ageMinutes }) =>
    ageMinutes !== null && ageMinutes >= 0 && ageMinutes <= maxAgeMinutes
  );

  if (liveData?.requirements?.verifiedOdds !== true) {
    reasonCodes.push("ODDS_PROVIDER_UNVERIFIED");
  }

  if (pricedCandidates <= 0 || best.length === 0) {
    reasonCodes.push("NO_PRICED_CANDIDATES");
  }

  if (best.length > 0 && bookmakerRows.length === 0) {
    reasonCodes.push("BOOKMAKER_MISMATCH");
  }

  if (timestampedRows.some(({ ageMinutes }) => ageMinutes === null)) {
    reasonCodes.push("ODDS_TIMESTAMP_MISSING");
  }

  if (timestampedRows.some(({ ageMinutes }) => ageMinutes !== null && ageMinutes > maxAgeMinutes)) {
    reasonCodes.push("ODDS_PRICE_STALE");
  }

  if (timestampedRows.some(({ ageMinutes }) => ageMinutes !== null && ageMinutes < 0)) {
    reasonCodes.push("ODDS_TIMESTAMP_FUTURE");
  }

  const ages = timestampedRows.map(({ ageMinutes }) => ageMinutes).filter((ageMinutes) => ageMinutes !== null);
  const oldestPriceAgeMinutes = ages.length > 0 ? Math.max(...ages) : null;
  const verified = reasonCodes.length === 0 && freshRows.length > 0;

  return {
    status: verified ? "verified" : "blocked",
    permission: verified ? "VERIFIED_BETS_ALLOWED" : "PRICE_CHECK_ONLY",
    reasonCodes,
    requiredBookmaker: normalizedBookmaker || null,
    maxAgeMinutes,
    pricedCandidates,
    bookmakerMatches: bookmakerRows.length,
    freshPricedCandidates: freshRows.length,
    oldestPriceAgeMinutes
  };
}

async function getDataEdgeAudit(options = {}) {
  const rootDir = path.resolve(options.rootDir ?? process.cwd());
  const days = Number.isInteger(options.days) && options.days > 0 ? Math.min(options.days, 7) : 1;
  const providerSetup = getProviderSetupStatus({ rootDir });
  const [liveData, bestTargets, decisionLog] = await Promise.all([
    getLiveDataHealth({
      date: options.date ?? "today",
      days,
      maxRosterTeams: options.maxRosterTeams,
      fetchJsonImpl: options.fetchJsonImpl,
      fetchTextImpl: options.fetchTextImpl,
      oddsApiKey: options.oddsApiKey,
      autoUpdateStatus: options.autoUpdateStatus ?? null,
      autoUpdateSnapshotPath: options.autoUpdateSnapshotPath
    }),
    getBestMlbTargets({
      date: options.date ?? "today",
      days,
      limit: Number.isInteger(options.limit) ? options.limit : 3,
      maxCandidates: Number.isInteger(options.maxCandidates) ? options.maxCandidates : 80,
      maxEventsToPrice: Number.isInteger(options.maxEventsToPrice) ? options.maxEventsToPrice : 10,
      bankroll: Number.isFinite(options.bankroll) ? options.bankroll : 1000,
      bookmakers: options.bookmakers ?? "draftkings",
      regions: options.regions ?? "us",
      fetchJsonImpl: options.fetchJsonImpl,
      oddsApiKey: options.oddsApiKey,
      allowPaidOdds: options.allowPaidOdds === true
    }),
    getDecisionLogDashboard({
      logPath: options.logPath
    })
  ]);
  const oddsProvider = findProvider(providerSetup, "the-odds-api");
  const sportsDataProvider = findProvider(providerSetup, "sportsdataio");
  const tennisProvider = findProvider(providerSetup, "tennis-stats");
  const oddsStatus = classifyOddsReadiness({ oddsProvider, liveData, bestTargets });
  const oddsEvidence = assessOddsEvidence({
    liveData,
    bestTargets,
    requiredBookmaker: options.bookmakers ?? "draftkings"
  });
  const permission = oddsEvidence.permission === "VERIFIED_BETS_ALLOWED"
    ? resolveBetCallPermission({ oddsStatus, liveData, bestTargets })
    : oddsEvidence.permission;

  return {
    generatedAt: new Date().toISOString(),
    status: dataEdgeStatus({ permission, oddsStatus, liveData }),
    betCallPermission: permission,
    odds: {
      status: oddsStatus,
      provider: oddsProvider
        ? {
            id: oddsProvider.id,
            name: oddsProvider.name,
            configured: oddsProvider.configured,
            savedLocally: oddsProvider.savedLocally,
            secretReturned: false
          }
        : null,
      liveVerifiedOdds: Boolean(liveData?.requirements?.verifiedOdds),
      manualOddsRequired: Boolean(liveData?.summary?.manualOddsRequired),
      candidates: Number(bestTargets?.summary?.candidates ?? 0),
      pricedCandidates: Number(bestTargets?.summary?.pricedCandidates ?? 0),
      eventsMatched: Number(bestTargets?.summary?.eventsMatched ?? 0),
      eventsPriced: Number(bestTargets?.summary?.eventsPriced ?? 0),
      evidence: oddsEvidence
    },
    bestTargets: {
      status: bestTargets?.status ?? "unknown",
      sourceMode: bestTargets?.sourceMode ?? null,
      fetchedAt: bestTargets?.fetchedAt ?? null,
      summary: bestTargets?.summary ?? {},
      warnings: compactWarnings(bestTargets?.warnings)
    },
    liveData: {
      status: liveData?.status ?? "unknown",
      generatedAt: liveData?.generatedAt ?? null,
      requirements: liveData?.requirements ?? {},
      summary: liveData?.summary ?? {},
      coverage: liveData?.coverage ?? {}
    },
    providers: {
      requiredReady: Boolean(providerSetup.summary.requiredReady),
      recommendedReady: Boolean(providerSetup.summary.recommendedReady),
      configured: providerSetup.summary.configured,
      sportsData: sportsDataProvider
        ? {
            id: sportsDataProvider.id,
            status: sportsDataProvider.status,
            configured: sportsDataProvider.configured,
            secretReturned: false
          }
        : null,
      tennis: tennisProvider
        ? {
            id: tennisProvider.id,
            status: tennisProvider.status,
            configured: tennisProvider.configured,
            secretReturned: false
          }
        : null
    },
    analytics: {
      dataQualityStatus: decisionLog.dataQuality?.status ?? "unknown",
      betCalls: decisionLog.summary?.verdictCounts?.BET ?? 0,
      validationGate: decisionLog.validationGate ?? null
    },
    actions: dataEdgeActions({ oddsStatus, liveData, bestTargets, decisionLog })
  };
}

module.exports = {
  assessOddsEvidence,
  getDataEdgeAudit,
  classifyOddsReadiness,
  resolveBetCallPermission
};
