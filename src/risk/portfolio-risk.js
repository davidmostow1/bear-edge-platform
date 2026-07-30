const {
  FINAL_SETTLEMENT_OUTCOMES,
  resolveSettlements
} = require("../audit/settlement-resolution.js");

const DEFAULT_PORTFOLIO_POLICY = Object.freeze({
  maxDailyBankrollFraction: 0.05,
  maxEventBankrollFraction: 0.025,
  maxParticipantBankrollFraction: 0.02,
  maxMarketFamilyBankrollFraction: 0.04,
  maxCorrelationBankrollFraction: 0.025
});

function isFiniteNumber(value) {
  return typeof value === "number" && Number.isFinite(value);
}

function riskDateFor(value, timeZone) {
  const date = value instanceof Date ? value : new Date(value);

  if (!Number.isFinite(date.getTime())) {
    throw new TypeError("now must be a valid date or ISO timestamp.");
  }

  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit"
  }).formatToParts(date);
  const values = Object.fromEntries(parts.map((part) => [part.type, part.value]));

  return `${values.year}-${values.month}-${values.day}`;
}

function normalizeText(value) {
  return String(value ?? "")
    .toLowerCase()
    .replace(/[^a-z0-9.]+/g, " ")
    .trim();
}

function positionKey(position) {
  return [
    position.eventId,
    position.participantId,
    normalizeText(position.marketFamily),
    normalizeText(position.side),
    position.line
  ].join("|");
}

function addToMap(map, key, stake) {
  map[key] = (map[key] ?? 0) + stake;
}

function buildPortfolioSnapshot(inspection, options = {}) {
  const timeZone = options.timeZone ?? process.env.BEAR_EDGE_TIME_ZONE ?? "America/New_York";
  const now = options.now ?? new Date();
  const riskDate = riskDateFor(now, timeZone);
  const records = Array.isArray(inspection?.records) ? inspection.records : [];
  const reportedIntegrityIssueCount = [
    ...(inspection?.malformedLines ?? []),
    ...(inspection?.duplicateIds ?? []),
    ...(inspection?.digestConflicts ?? []),
    ...(inspection?.invalidRecords ?? [])
  ].length;
  const seen = new Set();
  let duplicateRecordCount = 0;
  let invalidExposureRecordCount = 0;
  let totalStake = 0;
  let closedPositionCount = 0;
  const positions = [];
  const resolvedSettlements = resolveSettlements(records);

  for (const record of records) {
    if (typeof record?.id === "string" && seen.has(record.id)) {
      duplicateRecordCount += 1;
      continue;
    }

    if (typeof record?.id === "string") {
      seen.add(record.id);
    }

    if (record?.recordType !== "evaluation" || record?.verdict !== "BET") {
      continue;
    }

    let recordRiskDate;

    try {
      recordRiskDate = riskDateFor(record.createdAt, timeZone);
    } catch {
      invalidExposureRecordCount += 1;
      continue;
    }

    const stake = record?.stake?.recommendedStake;

    if (!isFiniteNumber(stake) || stake <= 0) {
      continue;
    }

    if (recordRiskDate === riskDate) {
      totalStake += stake;
    }

    const settlement = resolvedSettlements.latestByEvaluation.get(record.id);

    if (settlement && FINAL_SETTLEMENT_OUTCOMES.has(settlement.outcome)) {
      closedPositionCount += 1;
      continue;
    }

    positions.push({
      recordId: record.id ?? null,
      eventId: String(record.event?.eventId ?? "unknown"),
      participantId: String(record.market?.participantId ?? "unknown"),
      marketFamily: String(record.market?.marketFamily ?? "unknown"),
      correlationKey: `${record.event?.sport ?? "unknown"}:${record.event?.eventId ?? "unknown"}`,
      selection: record.market?.selection ?? null,
      side: record.market?.side ?? null,
      line: record.market?.line ?? null,
      stake
    });
  }

  const byEvent = {};
  const byParticipant = {};
  const byMarketFamily = {};
  const byCorrelation = {};

  for (const position of positions) {
    addToMap(byEvent, position.eventId, position.stake);
    addToMap(byParticipant, position.participantId, position.stake);
    addToMap(byMarketFamily, position.marketFamily, position.stake);
    addToMap(byCorrelation, position.correlationKey, position.stake);
  }

  const openStake = positions.reduce((total, position) => total + position.stake, 0);
  const integrityIssueCount = reportedIntegrityIssueCount + invalidExposureRecordCount +
    resolvedSettlements.invalidReferenceCount;

  return {
    available: inspection !== null && inspection !== undefined && integrityIssueCount === 0,
    asOf: new Date(now).toISOString(),
    riskDate,
    timeZone,
    positions,
    totalStake,
    openStake,
    closedPositionCount,
    byEvent,
    byParticipant,
    byMarketFamily,
    byCorrelation,
    duplicateRecordCount,
    invalidExposureRecordCount,
    invalidSettlementReferenceCount: resolvedSettlements.invalidSettlementReferenceCount,
    invalidAmendmentCount: resolvedSettlements.invalidAmendmentCount,
    amendmentCount: resolvedSettlements.amendmentCount,
    integrityIssueCount
  };
}

function riskFlag(code, message) {
  return { code, severity: "high", message };
}

function evaluatePortfolioRisk({
  candidate,
  proposedStake,
  bankroll,
  snapshot,
  policy = {}
}) {
  if (!isFiniteNumber(proposedStake) || proposedStake < 0) {
    throw new RangeError("proposedStake must be a finite non-negative number.");
  }

  if (!isFiniteNumber(bankroll) || bankroll <= 0) {
    throw new RangeError("bankroll must be a finite positive number.");
  }

  if (!snapshot?.available) {
    return {
      passed: false,
      checks: [],
      projected: null,
      riskFlags: [riskFlag(
        "PORTFOLIO_CONTEXT_UNAVAILABLE",
        "Portfolio exposure cannot be verified from an integrity-clean authoritative ledger."
      )]
    };
  }

  const resolvedPolicy = { ...DEFAULT_PORTFOLIO_POLICY, ...policy };
  const eventId = String(candidate?.gameId ?? candidate?.eventId ?? "unknown");
  const participantId = String(candidate?.player?.id ?? candidate?.participantId ?? "unknown");
  const marketFamily = String(
    candidate?.marketFamily ?? candidate?.modelEvidence?.marketFamily ?? candidate?.marketType ?? "unknown"
  );
  const correlationKey = `${candidate?.sport ?? "unknown"}:${eventId}`;
  const proposedPosition = {
    eventId,
    participantId,
    marketFamily,
    correlationKey,
    selection: candidate?.selection ?? candidate?.ticketDraft?.selection ?? null,
    side: candidate?.lean ?? candidate?.side ?? null,
    line: candidate?.line ?? null
  };
  const duplicate = snapshot.positions.some((position) => positionKey(position) === positionKey(proposedPosition));
  const projected = {
    dailyStake: snapshot.totalStake + proposedStake,
    eventStake: (snapshot.byEvent[eventId] ?? 0) + proposedStake,
    participantStake: (snapshot.byParticipant[participantId] ?? 0) + proposedStake,
    marketFamilyStake: (snapshot.byMarketFamily[marketFamily] ?? 0) + proposedStake,
    correlationStake: (snapshot.byCorrelation[correlationKey] ?? 0) + proposedStake
  };
  const checks = [
    {
      id: "daily_exposure",
      actual: projected.dailyStake,
      maximum: bankroll * resolvedPolicy.maxDailyBankrollFraction,
      reasonCode: "MAX_DAILY_RISK_REACHED"
    },
    {
      id: "event_exposure",
      actual: projected.eventStake,
      maximum: bankroll * resolvedPolicy.maxEventBankrollFraction,
      reasonCode: "MAX_EVENT_RISK_REACHED"
    },
    {
      id: "participant_exposure",
      actual: projected.participantStake,
      maximum: bankroll * resolvedPolicy.maxParticipantBankrollFraction,
      reasonCode: "MAX_PARTICIPANT_RISK_REACHED"
    },
    {
      id: "market_family_exposure",
      actual: projected.marketFamilyStake,
      maximum: bankroll * resolvedPolicy.maxMarketFamilyBankrollFraction,
      reasonCode: "MAX_MARKET_FAMILY_RISK_REACHED"
    },
    {
      id: "correlation_exposure",
      actual: projected.correlationStake,
      maximum: bankroll * resolvedPolicy.maxCorrelationBankrollFraction,
      reasonCode: "MAX_CORRELATED_RISK_REACHED"
    }
  ].map((check) => ({ ...check, passed: check.actual <= check.maximum }));
  const riskFlags = checks
    .filter((check) => !check.passed)
    .map((check) => riskFlag(
      check.reasonCode,
      `${check.id} would be ${check.actual.toFixed(2)}, above the configured maximum ${check.maximum.toFixed(2)}.`
    ));

  if (duplicate) {
    riskFlags.push(riskFlag(
      "DUPLICATE_EXPOSURE",
      "The same event, participant, market family, side, and line already has open BET exposure."
    ));
  }

  return {
    passed: riskFlags.length === 0,
    checks,
    projected,
    duplicate,
    policy: resolvedPolicy,
    riskFlags
  };
}

module.exports = {
  DEFAULT_PORTFOLIO_POLICY,
  buildPortfolioSnapshot,
  evaluatePortfolioRisk
};
