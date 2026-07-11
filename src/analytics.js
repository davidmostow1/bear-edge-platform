const crypto = require("node:crypto");
const fs = require("node:fs/promises");

const {
  appendDecisionLog,
  resolveDecisionLogPath
} = require("./decision-log.js");

const SETTLEMENT_OUTCOMES = Object.freeze(["pending", "win", "loss", "push", "void"]);

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
  const sources = Array.isArray(record?.researchPacket?.sources) ? record.researchPacket.sources : [];

  return sources
    .map((source) => source?.fetchedAt)
    .filter((fetchedAt) => typeof fetchedAt === "string" && fetchedAt.trim());
}

function getSourceAgeMinutes(record) {
  const sources = Array.isArray(record?.researchPacket?.sources) ? record.researchPacket.sources : [];

  return sources
    .map((source) => source?.sourceAgeMinutes)
    .filter(isFiniteNumber);
}

function getStaleDataStatus(record, riskFlags) {
  if (riskFlags.some((flag) => flag.code.includes("STALE"))) {
    return "stale";
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
    timestamp: typeof record?.timestamp === "string" ? record.timestamp : null,
    kind: getKind(record),
    selection: typeof result?.selection === "string" ? result.selection : record?.selection ?? "",
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
    timestamp: typeof record?.timestamp === "string" ? record.timestamp : null,
    evaluationId: typeof record?.evaluationId === "string" ? record.evaluationId : "",
    settledAt: typeof record?.settledAt === "string" ? record.settledAt : record?.timestamp ?? null,
    outcome: SETTLEMENT_OUTCOMES.includes(outcome) ? outcome : "pending",
    closingOdds: isFiniteNumber(record?.closingOdds) ? record.closingOdds : null,
    closingOppositeOdds: isFiniteNumber(record?.closingOppositeOdds) ? record.closingOppositeOdds : null,
    stake: isFiniteNumber(record?.stake) ? record.stake : null,
    notes: Array.isArray(record?.notes) ? record.notes : []
  };
}

function latestSettlementsByEvaluation(settlements) {
  const byEvaluation = new Map();

  for (const settlement of settlements) {
    const existing = byEvaluation.get(settlement.evaluationId);

    if (!existing || settlement.sequence > existing.sequence) {
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

  if (!validationGate.complete) {
    checks.push(
      qualityCheck("THREE_WIN_GATE_INCOMPLETE", "medium", "The three consecutive settled BET wins gate is not complete.", {
        currentWinStreak: validationGate.currentWinStreak,
        requiredWinStreak: validationGate.requiredWinStreak
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

  records.forEach((record, index) => {
    if (normalizeRecordType(record) === "settlement") {
      settlements.push(extractSettlement(record, index));
    } else {
      evaluations.push(extractEvaluation(record, index));
    }
  });

  const hydratedEvaluations = attachSettlementMetrics(evaluations, settlements);
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
    dataQuality: buildDataQualityReport(hydratedEvaluations, settlements, malformedLines, validationGate),
    byMarketType: summarizeByMarketType(hydratedEvaluations),
    parlayPerformance: summarizeGroup(hydratedEvaluations.filter((evaluation) => evaluation.kind === "parlay")),
    riskFlagCounts: summarizeRiskFlags(hydratedEvaluations),
    evaluations: hydratedEvaluations.sort((a, b) => b.sequence - a.sequence),
    settlements: settlements.sort((a, b) => b.sequence - a.sequence),
    malformedLines
  };
}

async function readDecisionLogEntries(options = {}) {
  const logPath = resolveDecisionLogPath(options.logPath);

  try {
    const contents = await fs.readFile(logPath, "utf8");
    const records = [];
    const malformedLines = [];

    contents.split(/\r?\n/).forEach((line, index) => {
      if (!line.trim()) {
        return;
      }

      try {
        records.push(JSON.parse(line));
      } catch (error) {
        malformedLines.push({
          lineNumber: index + 1,
          error: error.message
        });
      }
    });

    return {
      logPath,
      records,
      malformedLines
    };
  } catch (error) {
    if (error.code === "ENOENT") {
      return {
        logPath,
        records: [],
        malformedLines: []
      };
    }

    throw error;
  }
}

async function getDecisionLogDashboard(options = {}) {
  const { logPath, records, malformedLines } = await readDecisionLogEntries(options);
  const dashboard = summarizeDecisionLogRecords(records, malformedLines);

  return {
    logPath,
    ...dashboard
  };
}

function createSettlementRecord(input) {
  if (!isPlainObject(input)) {
    throw new TypeError("Settlement input must be an object.");
  }

  const evaluationId = typeof input.evaluationId === "string" ? input.evaluationId.trim() : "";

  if (!evaluationId) {
    throw new Error("evaluationId is required.");
  }

  const outcome = typeof input.outcome === "string" ? input.outcome : "pending";

  if (!SETTLEMENT_OUTCOMES.includes(outcome)) {
    throw new Error(`outcome must be one of: ${SETTLEMENT_OUTCOMES.join(", ")}.`);
  }

  if (input.closingOdds !== undefined && (!isFiniteNumber(input.closingOdds) || input.closingOdds === 0)) {
    throw new Error("closingOdds must be a non-zero finite number when supplied.");
  }

  if (
    input.closingOppositeOdds !== undefined &&
    (!isFiniteNumber(input.closingOppositeOdds) || input.closingOppositeOdds === 0)
  ) {
    throw new Error("closingOppositeOdds must be a non-zero finite number when supplied.");
  }

  if (input.stake !== undefined && (!isFiniteNumber(input.stake) || input.stake < 0)) {
    throw new Error("stake must be a non-negative finite number when supplied.");
  }

  const notes = Array.isArray(input.notes)
    ? input.notes.filter((note) => typeof note === "string")
    : typeof input.notes === "string"
      ? [input.notes]
      : [];

  return {
    id: createId("settle"),
    recordType: "settlement",
    timestamp: new Date().toISOString(),
    evaluationId,
    settledAt: typeof input.settledAt === "string" && input.settledAt.trim() ? input.settledAt : new Date().toISOString(),
    outcome,
    closingOdds: input.closingOdds ?? null,
    closingOppositeOdds: input.closingOppositeOdds ?? null,
    stake: input.stake ?? null,
    notes
  };
}

async function appendSettlement(input, options = {}) {
  const settlement = createSettlementRecord(input);
  const logPath = await appendDecisionLog(settlement, options);

  return {
    settlement,
    logPath
  };
}

module.exports = {
  SETTLEMENT_OUTCOMES,
  appendSettlement,
  buildValidationGate,
  calculateClosingLineValue,
  createId,
  createSettlementRecord,
  getDecisionLogDashboard,
  readDecisionLogEntries,
  summarizeDecisionLogRecords
};
