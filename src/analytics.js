const crypto = require("node:crypto");

const {
  resolveDecisionLogPath
} = require("./decision-log.js");
const {
  appendAuthoritativeRecord,
  readAuthoritativeLedger
} = require("./audit/authoritative-ledger.js");
const {
  createAmendmentRecord,
  createSettlementAuditRecord
} = require("./audit/record-contract.js");

const SETTLEMENT_OUTCOMES = Object.freeze(["pending", "win", "loss", "push", "void"]);
const AMENDMENT_PATCH_FIELDS = Object.freeze([
  "outcome",
  "settledAt",
  "closingOdds",
  "closingOppositeOdds",
  "closingLineEvidence",
  "stake",
  "profit",
  "notes"
]);

class AuditIntegrityError extends Error {
  constructor(message) {
    super(message);
    this.name = "AuditIntegrityError";
  }
}

function createId(prefix = "rec") {
  return `${prefix}_${crypto.randomUUID()}`;
}

function stableHash(value) {
  return crypto.createHash("sha256").update(value).digest("hex").slice(0, 16);
}

function isPlainObject(value) {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function isFiniteNumber(value) {
  return typeof value === "number" && Number.isFinite(value);
}

function normalizeClosingLineEvidence(value) {
  if (value === undefined || value === null) {
    return null;
  }
  if (!isPlainObject(value)) {
    throw new AuditIntegrityError("closingLineEvidence must be an object or null.");
  }

  const fields = [
    "sportsbook",
    "capturedAt",
    "marketClosedAt",
    "isFinal",
    "sourceLocator",
    "sourceDigest"
  ];
  const unknown = Object.keys(value).filter((field) => !fields.includes(field));
  if (unknown.length > 0) {
    throw new AuditIntegrityError(`Unsupported closingLineEvidence fields: ${unknown.join(", ")}.`);
  }

  return Object.fromEntries(fields.map((field) => [field, value[field] ?? null]));
}

function americanToDecimal(americanOdds) {
  if (!isFiniteNumber(americanOdds) || americanOdds === 0) {
    return null;
  }

  if (americanOdds > 0) {
    return 1 + americanOdds / 100;
  }

  return 1 + 100 / Math.abs(americanOdds);
}

function average(values) {
  const finiteValues = values.filter(isFiniteNumber);

  if (finiteValues.length === 0) {
    return null;
  }

  return finiteValues.reduce((sum, value) => sum + value, 0) / finiteValues.length;
}

function sum(values) {
  return values.filter(isFiniteNumber).reduce((total, value) => total + value, 0);
}

function uniqueRiskFlags(...flagSets) {
  const seen = new Set();
  const flags = [];

  for (const flagSet of flagSets) {
    if (!Array.isArray(flagSet)) {
      continue;
    }

    for (const flag of flagSet) {
      const code = typeof flag?.code === "string" && flag.code.trim() ? flag.code : "UNKNOWN";

      if (!seen.has(code)) {
        seen.add(code);
        flags.push({
          code,
          severity: typeof flag?.severity === "string" ? flag.severity : "info",
          message: typeof flag?.message === "string" ? flag.message : code
        });
      }
    }
  }

  return flags;
}

function normalizeRecordType(record) {
  if (record?.recordType === "settlement") {
    return "settlement";
  }

  if (record?.recordType === "amendment") {
    return "amendment";
  }

  return "evaluation";
}

function getEvaluationId(record, sequence) {
  if (typeof record?.id === "string" && record.id.trim()) {
    return record.id;
  }

  const seed = JSON.stringify({
    timestamp: record?.timestamp ?? null,
    kind: record?.kind ?? record?.result?.kind ?? null,
    selection: record?.selection ?? record?.result?.selection ?? null,
    sequence
  });

  return `eval_${stableHash(seed)}`;
}

function getSettlementId(record, sequence) {
  if (typeof record?.id === "string" && record.id.trim()) {
    return record.id;
  }

  const seed = JSON.stringify({
    timestamp: record?.timestamp ?? null,
    evaluationId: record?.evaluationId ?? null,
    sequence
  });

  return `settle_${stableHash(seed)}`;
}

function getResult(record) {
  return isPlainObject(record?.result) ? record.result : record;
}

function getKind(record) {
  if (record?.market?.marketFamily === "parlay") {
    return "parlay";
  }

  const result = getResult(record);

  if (typeof result?.kind === "string") {
    return result.kind;
  }

  if (typeof record?.kind === "string") {
    return record.kind;
  }

  if (record?.inputs?.isParlay) {
    return "parlay";
  }

  return "single";
}

function getMarketType(record) {
  if (typeof record?.market?.marketType === "string") {
    return record.market.marketType;
  }

  const result = getResult(record);
  const kind = getKind(record);

  if (kind === "parlay") {
    return "parlay";
  }

  if (typeof result?.marketType === "string") {
    return result.marketType;
  }

  if (typeof record?.inputs?.marketType === "string") {
    return record.inputs.marketType;
  }

  if (typeof record?.ticket?.legs?.[0]?.marketType === "string") {
    return record.ticket.legs[0].marketType;
  }

  return "straight";
}

function getMarketOdds(record) {
  if (isFiniteNumber(record?.price?.marketOdds)) {
    return record.price.marketOdds;
  }

  const result = getResult(record);

  if (isFiniteNumber(result?.combined?.americanOdds)) {
    return result.combined.americanOdds;
  }

  if (isFiniteNumber(result?.marketOdds)) {
    return result.marketOdds;
  }

  if (isFiniteNumber(record?.inputs?.marketOdds)) {
    return record.inputs.marketOdds;
  }

  return null;
}

function getExpectedValueRoi(record) {
  if (isFiniteNumber(record?.edge?.expectedValueRoi)) {
    return record.edge.expectedValueRoi;
  }

  const result = getResult(record);

  if (isFiniteNumber(result?.expectedValue?.roi)) {
    return result.expectedValue.roi;
  }

  if (isFiniteNumber(record?.metrics?.expectedValueRoi)) {
    return record.metrics.expectedValueRoi;
  }

  return null;
}

function getRecommendedStake(record) {
  if (isFiniteNumber(record?.stake?.recommendedStake)) {
    return record.stake.recommendedStake;
  }

  const result = getResult(record);

  if (isFiniteNumber(result?.stakeRecommendation?.recommendedStake)) {
    return result.stakeRecommendation.recommendedStake;
  }

  if (isFiniteNumber(record?.stakeRecommendation?.recommendedStake)) {
    return record.stakeRecommendation.recommendedStake;
  }

  if (isFiniteNumber(record?.metrics?.recommendedStake)) {
    return record.metrics.recommendedStake;
  }

  return 0;
}

function getExpectedProfitAtStake(record) {
  if (isFiniteNumber(record?.metrics?.expectedProfitAtRecommendedStake)) {
    return record.metrics.expectedProfitAtRecommendedStake;
  }

  const roi = getExpectedValueRoi(record);
  const stake = getRecommendedStake(record);

  if (!isFiniteNumber(roi) || !isFiniteNumber(stake)) {
    return null;
  }

  return roi * stake;
}

function getKellyFraction(record) {
  if (isFiniteNumber(record?.edge?.kellyFraction)) {
    return record.edge.kellyFraction;
  }

  const result = getResult(record);

  if (isFiniteNumber(result?.kelly?.fraction)) {
    return result.kelly.fraction;
  }

  if (isFiniteNumber(record?.metrics?.rawKellyFraction)) {
    return Math.max(0, record.metrics.rawKellyFraction);
  }

  return null;
}

function getLegRiskFlags(record) {
  const result = getResult(record);

  if (!Array.isArray(result?.legs)) {
    return [];
  }

  return result.legs.flatMap((leg) => (Array.isArray(leg.riskFlags) ? leg.riskFlags : []));
}

function getSourceTimestamps(record) {
  if (Array.isArray(record?.sources)) {
    return record.sources
      .flatMap((source) => [source?.sourceTime, source?.capturedAt])
      .filter((timestamp) => typeof timestamp === "string" && timestamp.trim());
  }

  const sources = Array.isArray(record?.researchPacket?.sources) ? record.researchPacket.sources : [];

  return sources
    .map((source) => source?.fetchedAt)
    .filter((fetchedAt) => typeof fetchedAt === "string" && fetchedAt.trim());
}

function getSourceAgeMinutes(record) {
  if (Array.isArray(record?.sources)) {
    const evaluationTime = Date.parse(record.createdAt ?? "");

    if (!Number.isFinite(evaluationTime)) {
      return [];
    }

    return record.sources
      .map((source) => Date.parse(source?.sourceTime ?? source?.capturedAt ?? ""))
      .filter(Number.isFinite)
      .map((sourceTime) => Math.max(0, (evaluationTime - sourceTime) / 60000));
  }

  const sources = Array.isArray(record?.researchPacket?.sources) ? record.researchPacket.sources : [];

  return sources
    .map((source) => source?.sourceAgeMinutes)
    .filter(isFiniteNumber);
}

function getStaleDataStatus(record, riskFlags) {
  if (riskFlags.some((flag) => flag.code.includes("STALE"))) {
    return "stale";
  }

  if (Array.isArray(record?.sources)) {
    if (record.sources.some((source) => source?.freshness === "stale")) {
      return "stale";
    }

    return record.sources.length > 0 ? "fresh" : "not_tracked";
  }

  const sources = Array.isArray(record?.researchPacket?.sources) ? record.researchPacket.sources : [];

  if (sources.some((source) => source?.cache?.stale === true)) {
    return "stale";
  }

  if (sources.length > 0) {
    return "fresh";
  }

  if (record?.inputs?.injuryDataAgeMinutes === null || record?.inputs?.injuryDataAgeMinutes === undefined) {
    return "not_tracked";
  }

  return "fresh";
}

function calculateClosingLineValue(initialOdds, closingOdds) {
  const initialDecimal = americanToDecimal(initialOdds);
  const closingDecimal = americanToDecimal(closingOdds);

  if (initialDecimal === null || closingDecimal === null) {
    return null;
  }

  return initialDecimal / closingDecimal - 1;
}

function calculateActualProfit(evaluation, settlement) {
  if (!settlement || evaluation.verdict !== "BET") {
    return null;
  }

  if (settlement.outcome === "pending") {
    return null;
  }

  if (isFiniteNumber(settlement.profit)) {
    return settlement.profit;
  }

  if (settlement.outcome === "push" || settlement.outcome === "void") {
    return 0;
  }

  const stake = isFiniteNumber(settlement.stake) ? settlement.stake : evaluation.recommendedStake;
  const decimalOdds = americanToDecimal(evaluation.marketOdds);

  if (!isFiniteNumber(stake) || decimalOdds === null) {
    return null;
  }

  if (settlement.outcome === "win") {
    return stake * (decimalOdds - 1);
  }

  if (settlement.outcome === "loss") {
    return -stake;
  }

  return null;
}

function extractEvaluation(record, sequence) {
  const result = getResult(record);
  const riskFlags = uniqueRiskFlags(record?.riskFlags, result?.riskFlags, getLegRiskFlags(record));
  const sourceTimestamps = getSourceTimestamps(record);
  const hasOriginalId = typeof record?.id === "string" && record.id.trim().length > 0;

  return {
    id: getEvaluationId(record, sequence),
    hasOriginalId,
    sequence,
    timestamp: typeof record?.createdAt === "string"
      ? record.createdAt
      : typeof record?.timestamp === "string" ? record.timestamp : null,
    kind: getKind(record),
    selection: typeof record?.market?.selection === "string"
      ? record.market.selection
      : typeof result?.selection === "string" ? result.selection : record?.selection ?? "",
    verdict: typeof result?.verdict === "string" ? result.verdict : record?.verdict ?? "UNKNOWN",
    marketType: getMarketType(record),
    marketOdds: getMarketOdds(record),
    expectedValueRoi: getExpectedValueRoi(record),
    expectedProfitAtRecommendedStake: getExpectedProfitAtStake(record),
    kellyFraction: getKellyFraction(record),
    recommendedStake: getRecommendedStake(record),
    riskFlags,
    riskFlagCodes: riskFlags.map((flag) => flag.code),
    staleDataStatus: getStaleDataStatus(record, riskFlags),
    sourceTimestamps,
    sourceAgeMinutes: getSourceAgeMinutes(record),
    raw: record
  };
}

function extractSettlement(record, sequence) {
  const outcome = typeof record?.outcome === "string" ? record.outcome : "pending";

  return {
    id: getSettlementId(record, sequence),
    sequence,
    timestamp: typeof record?.createdAt === "string"
      ? record.createdAt
      : typeof record?.timestamp === "string" ? record.timestamp : null,
    evaluationId: typeof record?.evaluationId === "string" ? record.evaluationId : "",
    settledAt: typeof record?.settledAt === "string" ? record.settledAt : record?.timestamp ?? null,
    outcome: SETTLEMENT_OUTCOMES.includes(outcome) ? outcome : "pending",
    closingOdds: isFiniteNumber(record?.closingOdds) ? record.closingOdds : null,
    closingOppositeOdds: isFiniteNumber(record?.closingOppositeOdds) ? record.closingOppositeOdds : null,
    closingLineEvidence: isPlainObject(record?.closingLineEvidence)
      ? structuredClone(record.closingLineEvidence)
      : null,
    stake: isFiniteNumber(record?.stake) ? record.stake : null,
    profit: isFiniteNumber(record?.profit) ? record.profit : null,
    notes: Array.isArray(record?.notes) ? record.notes : [],
    amendmentIds: [],
    effectiveSequence: sequence,
    raw: record
  };
}

function extractAmendment(record, sequence) {
  return {
    id: typeof record?.id === "string" && record.id.trim()
      ? record.id
      : `amend_${stableHash(JSON.stringify({ sequence, record }))}`,
    sequence,
    timestamp: typeof record?.createdAt === "string"
      ? record.createdAt
      : typeof record?.timestamp === "string" ? record.timestamp : null,
    evaluationId: typeof record?.evaluationId === "string" ? record.evaluationId : "",
    settlementId: typeof record?.settlementId === "string" ? record.settlementId : "",
    reason: typeof record?.reason === "string" ? record.reason : "",
    patch: isPlainObject(record?.patch) ? record.patch : {},
    applied: false,
    rejectionReason: null,
    raw: record
  };
}

function resolveSettlementAmendments(settlements, amendments) {
  const byId = new Map(settlements.map((settlement) => [settlement.id, { ...settlement }]));

  for (const amendment of amendments.sort((a, b) => a.sequence - b.sequence)) {
    const settlement = byId.get(amendment.settlementId);

    if (!settlement) {
      amendment.rejectionReason = "Unknown settlement reference.";
      continue;
    }

    if (settlement.evaluationId !== amendment.evaluationId) {
      amendment.rejectionReason = "Evaluation and settlement references do not match.";
      continue;
    }

    const patch = amendment.patch;

    if (patch.outcome !== undefined && SETTLEMENT_OUTCOMES.includes(patch.outcome)) {
      settlement.outcome = patch.outcome;
    }

    if (typeof patch.settledAt === "string" && Number.isFinite(Date.parse(patch.settledAt))) {
      settlement.settledAt = patch.settledAt;
    }

    for (const field of ["closingOdds", "closingOppositeOdds", "stake", "profit"]) {
      if (patch[field] === null || isFiniteNumber(patch[field])) {
        settlement[field] = patch[field];
      }
    }

    if (patch.closingLineEvidence === null || isPlainObject(patch.closingLineEvidence)) {
      settlement.closingLineEvidence = patch.closingLineEvidence === null
        ? null
        : structuredClone(patch.closingLineEvidence);
    }

    if (Array.isArray(patch.notes)) {
      settlement.notes = patch.notes.filter((note) => typeof note === "string");
    }

    settlement.amendmentIds = [...settlement.amendmentIds, amendment.id];
    settlement.effectiveSequence = amendment.sequence;
    amendment.applied = true;
  }

  return settlements.map((settlement) => byId.get(settlement.id) ?? settlement);
}

function latestSettlementsByEvaluation(settlements) {
  const byEvaluation = new Map();

  for (const settlement of settlements) {
    const existing = byEvaluation.get(settlement.evaluationId);

    if (!existing || settlement.effectiveSequence > existing.effectiveSequence) {
      byEvaluation.set(settlement.evaluationId, settlement);
    }
  }

  return byEvaluation;
}

function attachSettlementMetrics(evaluations, settlements) {
  const latestByEvaluation = latestSettlementsByEvaluation(settlements);

  return evaluations.map((evaluation) => {
    const settlement = latestByEvaluation.get(evaluation.id) ?? null;
    const clv = settlement ? calculateClosingLineValue(evaluation.marketOdds, settlement.closingOdds) : null;
    const actualProfit = calculateActualProfit(evaluation, settlement);
    const isFalsePositiveBet = evaluation.verdict === "BET" && settlement?.outcome === "loss";

    return {
      ...evaluation,
      settlement,
      closingLineValue: clv,
      actualProfit,
      isFalsePositiveBet
    };
  });
}

function summarizeGroup(evaluations) {
  const betCalls = evaluations.filter((evaluation) => evaluation.verdict === "BET");
  const settledBetCalls = betCalls.filter((evaluation) => ["win", "loss", "push"].includes(evaluation.settlement?.outcome));
  const gradedBetCalls = betCalls.filter((evaluation) => ["win", "loss"].includes(evaluation.settlement?.outcome));
  const wins = gradedBetCalls.filter((evaluation) => evaluation.settlement?.outcome === "win").length;
  const losses = gradedBetCalls.filter((evaluation) => evaluation.settlement?.outcome === "loss").length;

  return {
    evaluations: evaluations.length,
    betCalls: betCalls.length,
    settledBetCalls: settledBetCalls.length,
    wins,
    losses,
    pushes: settledBetCalls.filter((evaluation) => evaluation.settlement?.outcome === "push").length,
    hitRate: wins + losses > 0 ? wins / (wins + losses) : null,
    falsePositiveBetCalls: losses,
    falsePositiveRate: wins + losses > 0 ? losses / (wins + losses) : null,
    averageEvRoi: average(evaluations.map((evaluation) => evaluation.expectedValueRoi)),
    averageClosingLineValue: average(evaluations.map((evaluation) => evaluation.closingLineValue)),
    expectedProfitAtRecommendedStake: sum(evaluations.map((evaluation) => evaluation.expectedProfitAtRecommendedStake)),
    actualProfit: sum(evaluations.map((evaluation) => evaluation.actualProfit))
  };
}

function summarizeByMarketType(evaluations) {
  const groups = new Map();

  for (const evaluation of evaluations) {
    const marketType = evaluation.marketType || "unknown";

    if (!groups.has(marketType)) {
      groups.set(marketType, []);
    }

    groups.get(marketType).push(evaluation);
  }

  return [...groups.entries()]
    .map(([marketType, groupEvaluations]) => ({
      marketType,
      ...summarizeGroup(groupEvaluations)
    }))
    .sort((a, b) => b.evaluations - a.evaluations || a.marketType.localeCompare(b.marketType));
}

function summarizeRiskFlags(evaluations) {
  const counts = new Map();

  for (const evaluation of evaluations) {
    for (const code of evaluation.riskFlagCodes) {
      counts.set(code, (counts.get(code) ?? 0) + 1);
    }
  }

  return [...counts.entries()]
    .map(([code, count]) => ({ code, count }))
    .sort((a, b) => b.count - a.count || a.code.localeCompare(b.code));
}

function buildValidationGate(evaluations, requiredWinStreak = 3) {
  const settledBetCalls = evaluations
    .filter((evaluation) => evaluation.verdict === "BET")
    .filter((evaluation) => ["win", "loss"].includes(evaluation.settlement?.outcome))
    .sort((a, b) => {
      const aTime = Date.parse(a.settlement?.settledAt ?? a.timestamp ?? "") || a.sequence;
      const bTime = Date.parse(b.settlement?.settledAt ?? b.timestamp ?? "") || b.sequence;

      return aTime - bTime || a.sequence - b.sequence;
    });
  const eligibleSettledBetCalls = settledBetCalls.filter((evaluation) =>
    isFiniteNumber(evaluation.settlement?.closingOdds)
  );
  let currentWinStreak = 0;
  let bestWinStreak = 0;

  for (const evaluation of settledBetCalls) {
    if (evaluation.settlement?.outcome === "win" && isFiniteNumber(evaluation.settlement?.closingOdds)) {
      currentWinStreak += 1;
      bestWinStreak = Math.max(bestWinStreak, currentWinStreak);
    } else {
      currentWinStreak = 0;
    }
  }

  return {
    requiredWinStreak,
    currentWinStreak,
    bestWinStreak,
    complete: currentWinStreak >= requiredWinStreak,
    remainingWins: Math.max(0, requiredWinStreak - currentWinStreak),
    settledBetCalls: settledBetCalls.length,
    eligibleSettledBetCalls: eligibleSettledBetCalls.length,
    ineligibleSettledBetCalls: settledBetCalls.length - eligibleSettledBetCalls.length,
    lastSettledBet:
      settledBetCalls.length > 0
        ? {
            evaluationId: settledBetCalls[settledBetCalls.length - 1].id,
            selection: settledBetCalls[settledBetCalls.length - 1].selection,
            outcome: settledBetCalls[settledBetCalls.length - 1].settlement?.outcome,
            closingOdds: settledBetCalls[settledBetCalls.length - 1].settlement?.closingOdds,
            settledAt: settledBetCalls[settledBetCalls.length - 1].settlement?.settledAt
          }
        : null
  };
}

function qualityCheck(code, severity, message, details = {}) {
  return {
    code,
    severity,
    message,
    ...details
  };
}

function buildDataQualityReport(evaluations, settlements, malformedLines, validationGate) {
  const evaluationIds = new Set(evaluations.map((evaluation) => evaluation.id));
  const betCalls = evaluations.filter((evaluation) => evaluation.verdict === "BET");
  const settledBetCalls = betCalls.filter((evaluation) => ["win", "loss", "push"].includes(evaluation.settlement?.outcome));
  const gradedBetCalls = betCalls.filter((evaluation) => ["win", "loss"].includes(evaluation.settlement?.outcome));
  const missingClosingOddsBetCalls = settledBetCalls.filter(
    (evaluation) => !isFiniteNumber(evaluation.settlement?.closingOdds)
  );
  const parlayBetCalls = betCalls.filter((evaluation) => evaluation.kind === "parlay");
  const settledParlayBetCalls = parlayBetCalls.filter((evaluation) =>
    ["win", "loss", "push"].includes(evaluation.settlement?.outcome)
  );
  const checks = [];
  const orphanSettlements = settlements.filter((settlement) => !evaluationIds.has(settlement.evaluationId));
  const missingMarketOddsBetCalls = betCalls.filter((evaluation) => !isFiniteNumber(evaluation.marketOdds));
  const missingExpectedValueBetCalls = betCalls.filter((evaluation) => !isFiniteNumber(evaluation.expectedValueRoi));
  const zeroStakeBetCalls = betCalls.filter((evaluation) => !isFiniteNumber(evaluation.recommendedStake) || evaluation.recommendedStake <= 0);
  const staleBetCalls = betCalls.filter((evaluation) => evaluation.staleDataStatus === "stale");
  const noSourceTimestampBetCalls = betCalls.filter((evaluation) => evaluation.sourceTimestamps.length === 0);

  if (malformedLines.length > 0) {
    checks.push(
      qualityCheck("MALFORMED_LOG_LINES", "critical", "Decision log contains malformed JSONL rows; analytics may be incomplete.", {
        count: malformedLines.length
      })
    );
  }

  if (evaluations.length === 0) {
    checks.push(qualityCheck("NO_EVALUATIONS", "medium", "No evaluations have been logged yet."));
  }

  if (betCalls.length === 0 && evaluations.length > 0) {
    checks.push(qualityCheck("NO_BET_CALLS", "medium", "No BET verdicts have been logged yet; performance metrics are not meaningful."));
  }

  if (betCalls.length > 0 && settledBetCalls.length === 0) {
    checks.push(
      qualityCheck("NO_SETTLED_BET_CALLS", "high", "No settled BET calls exist yet; hit rate, ROI, and false-positive metrics are not decision-grade.", {
        betCalls: betCalls.length
      })
    );
  } else if (betCalls.length > 0 && settledBetCalls.length / betCalls.length < 0.8) {
    checks.push(
      qualityCheck("LOW_SETTLEMENT_COVERAGE", "medium", "Less than 80% of BET calls are settled; performance metrics are provisional.", {
        betCalls: betCalls.length,
        settledBetCalls: settledBetCalls.length
      })
    );
  }

  if (betCalls.length > 0 && gradedBetCalls.length === 0) {
    checks.push(
      qualityCheck("NO_GRADED_BET_CALLS", "high", "No win/loss BET calls are graded yet; hit rate and false positives cannot be trusted.", {
        betCalls: betCalls.length
      })
    );
  }

  if (missingClosingOddsBetCalls.length > 0) {
    checks.push(
      qualityCheck("MISSING_CLOSING_ODDS", "high", "Some settled BET calls are missing closing odds; CLV and validation evidence are incomplete.", {
        count: missingClosingOddsBetCalls.length
      })
    );
  }

  if (missingMarketOddsBetCalls.length > 0) {
    checks.push(
      qualityCheck("MISSING_BET_MARKET_ODDS", "high", "Some BET calls are missing market odds; CLV and payout math are incomplete.", {
        count: missingMarketOddsBetCalls.length
      })
    );
  }

  if (missingExpectedValueBetCalls.length > 0) {
    checks.push(
      qualityCheck("MISSING_BET_EV", "high", "Some BET calls are missing EV; they should not be treated as model-backed calls.", {
        count: missingExpectedValueBetCalls.length
      })
    );
  }

  if (zeroStakeBetCalls.length > 0) {
    checks.push(
      qualityCheck("MISSING_BET_STAKE", "medium", "Some BET calls have no positive recommended stake; stake discipline cannot be audited.", {
        count: zeroStakeBetCalls.length
      })
    );
  }

  if (staleBetCalls.length > 0) {
    checks.push(
      qualityCheck("STALE_BET_CALLS", "high", "Some BET calls were logged with stale data flags; stale-data bets require manual audit.", {
        count: staleBetCalls.length
      })
    );
  }

  if (noSourceTimestampBetCalls.length > 0) {
    checks.push(
      qualityCheck("MISSING_SOURCE_TIMESTAMPS", "medium", "Some BET calls have no source timestamps; freshness cannot be independently checked.", {
        count: noSourceTimestampBetCalls.length
      })
    );
  }

  if (orphanSettlements.length > 0) {
    checks.push(
      qualityCheck("ORPHAN_SETTLEMENTS", "medium", "Some settlements do not match any evaluation id and are ignored by performance metrics.", {
        count: orphanSettlements.length
      })
    );
  }

  if (parlayBetCalls.length > 0 && settledParlayBetCalls.length === 0) {
    checks.push(
      qualityCheck("UNSETTLED_PARLAY_PERFORMANCE", "medium", "Parlay BET calls exist but no parlay outcomes are settled yet.", {
        parlayBetCalls: parlayBetCalls.length
      })
    );
  }

  const blockingSeverities = new Set(["critical", "high"]);
  const status =
    evaluations.length === 0
      ? "empty"
      : checks.some((check) => blockingSeverities.has(check.severity))
        ? "blocked"
        : checks.length > 0
          ? "limited"
          : "ok";

  return {
    status,
    checks,
    warnings: checks.map((check) => check.message),
    metrics: {
      totalEvaluations: evaluations.length,
      totalSettlements: settlements.length,
      betCalls: betCalls.length,
      settledBetCalls: settledBetCalls.length,
      gradedBetCalls: gradedBetCalls.length,
      settlementCoverageForBetCalls: betCalls.length > 0 ? settledBetCalls.length / betCalls.length : null,
      gradedCoverageForBetCalls: betCalls.length > 0 ? gradedBetCalls.length / betCalls.length : null,
      malformedLineCount: malformedLines.length,
      orphanSettlementCount: orphanSettlements.length,
      missingOriginalEvaluationIds: evaluations.filter((evaluation) => !evaluation.hasOriginalId).length,
      missingClosingOddsBetCalls: missingClosingOddsBetCalls.length,
      missingMarketOddsBetCalls: missingMarketOddsBetCalls.length,
      missingExpectedValueBetCalls: missingExpectedValueBetCalls.length,
      missingStakeBetCalls: zeroStakeBetCalls.length,
      staleBetCalls: staleBetCalls.length,
      missingSourceTimestampBetCalls: noSourceTimestampBetCalls.length
    }
  };
}

function summarizeDecisionLogRecords(records, malformedLines = []) {
  const evaluations = [];
  const settlements = [];
  const amendments = [];

  records.forEach((record, index) => {
    const recordType = normalizeRecordType(record);

    if (recordType === "settlement") {
      settlements.push(extractSettlement(record, index));
    } else if (recordType === "amendment") {
      amendments.push(extractAmendment(record, index));
    } else {
      evaluations.push(extractEvaluation(record, index));
    }
  });

  const resolvedSettlements = resolveSettlementAmendments(settlements, amendments);
  const hydratedEvaluations = attachSettlementMetrics(evaluations, resolvedSettlements);
  const validationGate = buildValidationGate(hydratedEvaluations);
  const summary = {
    generatedAt: new Date().toISOString(),
    totalEvaluations: hydratedEvaluations.length,
    verdictCounts: {
      BET: hydratedEvaluations.filter((evaluation) => evaluation.verdict === "BET").length,
      WAIT: hydratedEvaluations.filter((evaluation) => evaluation.verdict === "WAIT").length,
      PASS: hydratedEvaluations.filter((evaluation) => evaluation.verdict === "PASS").length
    },
    staleDataCount: hydratedEvaluations.filter((evaluation) => evaluation.staleDataStatus === "stale").length,
    ...summarizeGroup(hydratedEvaluations)
  };

  return {
    summary,
    validationGate,
    dataQuality: buildDataQualityReport(hydratedEvaluations, resolvedSettlements, malformedLines, validationGate),
    byMarketType: summarizeByMarketType(hydratedEvaluations),
    parlayPerformance: summarizeGroup(hydratedEvaluations.filter((evaluation) => evaluation.kind === "parlay")),
    riskFlagCounts: summarizeRiskFlags(hydratedEvaluations),
    evaluations: hydratedEvaluations.sort((a, b) => b.sequence - a.sequence),
    settlements: resolvedSettlements.sort((a, b) => b.effectiveSequence - a.effectiveSequence),
    amendments: amendments.sort((a, b) => b.sequence - a.sequence),
    malformedLines
  };
}

async function readDecisionLogEntries(options = {}) {
  const logPath = resolveDecisionLogPath(options.logPath);
  const inspection = await readAuthoritativeLedger({
    ledgerPath: logPath,
    fsImpl: options.fsImpl
  });

  return {
    logPath: inspection.ledgerPath,
    records: inspection.records,
    malformedLines: inspection.malformedLines,
    duplicateIds: inspection.duplicateIds,
    digestConflicts: inspection.digestConflicts,
    invalidRecords: inspection.invalidRecords
  };
}

async function getDecisionLogDashboard(options = {}) {
  const {
    logPath,
    records,
    malformedLines,
    duplicateIds,
    digestConflicts,
    invalidRecords
  } = await readDecisionLogEntries(options);
  const dashboard = summarizeDecisionLogRecords(records, malformedLines);

  return {
    logPath,
    duplicateIds,
    digestConflicts,
    invalidRecords,
    ...dashboard
  };
}

function createSettlementRecord(input, context = {}) {
  if (!isPlainObject(input)) {
    throw new AuditIntegrityError("Settlement input must be an object.");
  }

  const evaluationId = typeof input.evaluationId === "string" ? input.evaluationId.trim() : "";

  if (!evaluationId) {
    throw new AuditIntegrityError("evaluationId is required.");
  }

  const outcome = typeof input.outcome === "string" ? input.outcome : "pending";

  if (!SETTLEMENT_OUTCOMES.includes(outcome)) {
    throw new AuditIntegrityError(`outcome must be one of: ${SETTLEMENT_OUTCOMES.join(", ")}.`);
  }

  if (input.closingOdds !== undefined && (!isFiniteNumber(input.closingOdds) || input.closingOdds === 0)) {
    throw new AuditIntegrityError("closingOdds must be a non-zero finite number when supplied.");
  }

  if (
    input.closingOppositeOdds !== undefined &&
    (!isFiniteNumber(input.closingOppositeOdds) || input.closingOppositeOdds === 0)
  ) {
    throw new AuditIntegrityError("closingOppositeOdds must be a non-zero finite number when supplied.");
  }

  if (input.stake !== undefined && (!isFiniteNumber(input.stake) || input.stake < 0)) {
    throw new AuditIntegrityError("stake must be a non-negative finite number when supplied.");
  }

  if (input.profit !== undefined && !isFiniteNumber(input.profit)) {
    throw new AuditIntegrityError("profit must be a finite number when supplied.");
  }

  const notes = Array.isArray(input.notes)
    ? input.notes.filter((note) => typeof note === "string")
    : typeof input.notes === "string"
      ? [input.notes]
      : [];

  const settledAt = typeof input.settledAt === "string" && input.settledAt.trim()
    ? input.settledAt
    : new Date().toISOString();

  if (!Number.isFinite(Date.parse(settledAt))) {
    throw new AuditIntegrityError("settledAt must be a valid timestamp when supplied.");
  }

  return createSettlementAuditRecord({
    evaluationId,
    settledAt,
    outcome,
    closingOdds: input.closingOdds ?? null,
    closingOppositeOdds: input.closingOppositeOdds ?? null,
    closingLineEvidence: normalizeClosingLineEvidence(input.closingLineEvidence),
    stake: input.stake ?? null,
    profit: input.profit ?? null,
    notes
  }, context);
}

async function appendSettlement(input, options = {}) {
  const entries = await readDecisionLogEntries(options);
  const evaluationId = typeof input?.evaluationId === "string" ? input.evaluationId.trim() : "";
  const evaluationExists = entries.records.some(
    (record) => normalizeRecordType(record) === "evaluation" && record?.id === evaluationId
  );

  if (!evaluationExists) {
    throw new AuditIntegrityError(`Referenced evaluation does not exist: ${evaluationId || "<missing>"}.`);
  }

  const existingSettlement = entries.records.find(
    (record) => normalizeRecordType(record) === "settlement" && record?.evaluationId === evaluationId
  );

  if (existingSettlement) {
    throw new AuditIntegrityError(
      `Evaluation ${evaluationId} already has a settlement; corrections must be recorded as an amendment.`
    );
  }

  const settlement = createSettlementRecord(input, options.context);
  const appendRecordImpl = options.appendRecordImpl ?? appendAuthoritativeRecord;
  const persistence = await appendRecordImpl(settlement, {
    ledgerPath: entries.logPath,
    fsImpl: options.fsImpl
  });

  return {
    settlement,
    record: settlement,
    logPath: persistence.ledgerPath,
    ledgerPath: persistence.ledgerPath,
    persistedAt: persistence.persistedAt
  };
}

function normalizeAmendmentPatch(patch) {
  if (!isPlainObject(patch) || Object.keys(patch).length === 0) {
    throw new AuditIntegrityError("Amendment patch must be a non-empty object.");
  }

  const unknownFields = Object.keys(patch).filter((field) => !AMENDMENT_PATCH_FIELDS.includes(field));

  if (unknownFields.some((field) => ["evaluationId", "settlementId", "id", "clientEventId"].includes(field))) {
    throw new AuditIntegrityError("Amendments cannot change record references or identifiers.");
  }

  if (unknownFields.length > 0) {
    throw new AuditIntegrityError(`Unsupported amendment fields: ${unknownFields.join(", ")}.`);
  }

  const normalized = {};

  if (patch.outcome !== undefined) {
    if (!SETTLEMENT_OUTCOMES.includes(patch.outcome)) {
      throw new AuditIntegrityError(`outcome must be one of: ${SETTLEMENT_OUTCOMES.join(", ")}.`);
    }
    normalized.outcome = patch.outcome;
  }

  if (patch.settledAt !== undefined) {
    if (typeof patch.settledAt !== "string" || !Number.isFinite(Date.parse(patch.settledAt))) {
      throw new AuditIntegrityError("settledAt must be a valid timestamp when supplied.");
    }
    normalized.settledAt = patch.settledAt;
  }

  for (const field of ["closingOdds", "closingOppositeOdds"]) {
    if (patch[field] !== undefined) {
      if (patch[field] !== null && (!isFiniteNumber(patch[field]) || patch[field] === 0)) {
        throw new AuditIntegrityError(`${field} must be a non-zero finite number or null.`);
      }
      normalized[field] = patch[field];
    }
  }


  if (patch.closingLineEvidence !== undefined) {
    normalized.closingLineEvidence = normalizeClosingLineEvidence(patch.closingLineEvidence);
  }

  if (patch.stake !== undefined) {
    if (patch.stake !== null && (!isFiniteNumber(patch.stake) || patch.stake < 0)) {
      throw new AuditIntegrityError("stake must be a non-negative finite number or null.");
    }
    normalized.stake = patch.stake;
  }

  if (patch.profit !== undefined) {
    if (patch.profit !== null && !isFiniteNumber(patch.profit)) {
      throw new AuditIntegrityError("profit must be a finite number or null.");
    }
    normalized.profit = patch.profit;
  }

  if (patch.notes !== undefined) {
    const notes = typeof patch.notes === "string" ? [patch.notes] : patch.notes;

    if (!Array.isArray(notes) || notes.some((note) => typeof note !== "string")) {
      throw new AuditIntegrityError("notes must be a string or an array of strings.");
    }
    normalized.notes = notes;
  }

  return normalized;
}

async function appendAmendment(input, options = {}) {
  if (!isPlainObject(input)) {
    throw new AuditIntegrityError("Amendment input must be an object.");
  }

  const evaluationId = typeof input.evaluationId === "string" ? input.evaluationId.trim() : "";
  const settlementId = typeof input.settlementId === "string" ? input.settlementId.trim() : "";
  const reason = typeof input.reason === "string" ? input.reason.trim() : "";

  if (!evaluationId) {
    throw new AuditIntegrityError("evaluationId is required.");
  }
  if (!settlementId) {
    throw new AuditIntegrityError("settlementId is required.");
  }
  if (!reason) {
    throw new AuditIntegrityError("reason is required.");
  }

  const patch = normalizeAmendmentPatch(input.patch);
  const entries = await readDecisionLogEntries(options);
  const evaluationExists = entries.records.some(
    (record) => normalizeRecordType(record) === "evaluation" && record?.id === evaluationId
  );

  if (!evaluationExists) {
    throw new AuditIntegrityError(`Referenced evaluation does not exist: ${evaluationId}.`);
  }

  const settlement = entries.records.find(
    (record) => normalizeRecordType(record) === "settlement" && record?.id === settlementId
  );

  if (!settlement) {
    throw new AuditIntegrityError(`Referenced settlement does not exist: ${settlementId}.`);
  }

  if (settlement.evaluationId !== evaluationId) {
    throw new AuditIntegrityError("Settlement does not belong to the referenced evaluation.");
  }

  const record = createAmendmentRecord({
    evaluationId,
    settlementId,
    reason,
    patch
  }, options.context);
  const appendRecordImpl = options.appendRecordImpl ?? appendAuthoritativeRecord;
  const persistence = await appendRecordImpl(record, {
    ledgerPath: entries.logPath,
    fsImpl: options.fsImpl
  });

  return {
    record,
    amendment: record,
    logPath: persistence.ledgerPath,
    ledgerPath: persistence.ledgerPath,
    persistedAt: persistence.persistedAt
  };
}

module.exports = {
  AMENDMENT_PATCH_FIELDS,
  AuditIntegrityError,
  SETTLEMENT_OUTCOMES,
  appendAmendment,
  appendSettlement,
  buildValidationGate,
  calculateClosingLineValue,
  createId,
  createSettlementRecord,
  getDecisionLogDashboard,
  readDecisionLogEntries,
  summarizeDecisionLogRecords
};
