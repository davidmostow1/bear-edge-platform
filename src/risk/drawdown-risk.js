const {
  FINAL_SETTLEMENT_OUTCOMES,
  resolveSettlements
} = require("../audit/settlement-resolution.js");

const DEFAULT_DRAWDOWN_POLICY = Object.freeze({
  reductionDrawdownFraction: 0.1,
  haltDrawdownFraction: 0.2,
  reductionLossStreak: 3,
  haltLossStreak: 6,
  reducedStakeMultiplier: 0.5
});

function isFiniteNumber(value) {
  return typeof value === "number" && Number.isFinite(value);
}

function validateFraction(value, name, { allowOne = false } = {}) {
  if (!isFiniteNumber(value) || value < 0 || (allowOne ? value > 1 : value >= 1)) {
    throw new RangeError(`${name} must be a finite fraction between 0 and ${allowOne ? "1 inclusive" : "1 exclusive"}.`);
  }
}

function resolvePolicy(policy = {}) {
  const resolved = { ...DEFAULT_DRAWDOWN_POLICY, ...policy };

  validateFraction(resolved.reductionDrawdownFraction, "reductionDrawdownFraction");
  validateFraction(resolved.haltDrawdownFraction, "haltDrawdownFraction");
  validateFraction(resolved.reducedStakeMultiplier, "reducedStakeMultiplier", { allowOne: true });

  if (resolved.haltDrawdownFraction <= resolved.reductionDrawdownFraction) {
    throw new RangeError("haltDrawdownFraction must be greater than reductionDrawdownFraction.");
  }
  for (const field of ["reductionLossStreak", "haltLossStreak"]) {
    if (!Number.isInteger(resolved[field]) || resolved[field] <= 0) {
      throw new RangeError(`${field} must be a positive integer.`);
    }
  }
  if (resolved.haltLossStreak <= resolved.reductionLossStreak) {
    throw new RangeError("haltLossStreak must be greater than reductionLossStreak.");
  }

  return resolved;
}

function americanToDecimal(odds) {
  if (!isFiniteNumber(odds) || odds === 0) {
    return null;
  }

  return odds > 0 ? 1 + odds / 100 : 1 + 100 / Math.abs(odds);
}

function calculatedProfit(settlement, evaluation) {
  if (isFiniteNumber(settlement.profit)) {
    return settlement.profit;
  }

  const stake = isFiniteNumber(settlement.stake)
    ? settlement.stake
    : evaluation?.stake?.recommendedStake;

  if (!isFiniteNumber(stake) || stake < 0) {
    return null;
  }
  if (settlement.outcome === "loss") {
    return -stake;
  }
  if (settlement.outcome === "push" || settlement.outcome === "void") {
    return 0;
  }
  if (settlement.outcome !== "win") {
    return null;
  }

  const decimalOdds = americanToDecimal(evaluation?.price?.marketOdds);
  return decimalOdds === null ? null : stake * (decimalOdds - 1);
}

function buildDrawdownSnapshot(inspection, options = {}) {
  const startingBankroll = Number(options.startingBankroll ?? options.bankroll);

  if (!isFiniteNumber(startingBankroll) || startingBankroll <= 0) {
    throw new RangeError("startingBankroll must be a finite positive number.");
  }

  const policy = resolvePolicy(options.policy);
  const records = Array.isArray(inspection?.records) ? inspection.records : [];
  const reportedIntegrityIssueCount = [
    ...(inspection?.malformedLines ?? []),
    ...(inspection?.duplicateIds ?? []),
    ...(inspection?.digestConflicts ?? []),
    ...(inspection?.invalidRecords ?? [])
  ].length;
  const resolved = resolveSettlements(records);
  const integrityIssueCount = reportedIntegrityIssueCount + resolved.invalidReferenceCount;
  const graded = [];
  let incompleteProfitCount = 0;

  for (const settlement of resolved.settlements) {
    const evaluation = resolved.evaluations.get(settlement.evaluationId);

    if (!evaluation || evaluation.verdict !== "BET" ||
        !FINAL_SETTLEMENT_OUTCOMES.has(settlement.outcome)) {
      continue;
    }

    const profit = calculatedProfit(settlement, evaluation);
    const settledMs = Date.parse(settlement.settledAt ?? settlement.createdAt ?? "");

    if (!isFiniteNumber(profit) || !Number.isFinite(settledMs)) {
      incompleteProfitCount += 1;
      continue;
    }

    graded.push({
      evaluationId: settlement.evaluationId,
      settlementId: settlement.id,
      outcome: settlement.outcome,
      profit,
      settledAt: new Date(settledMs).toISOString(),
      settledMs,
      sequence: settlement.effectiveSequence
    });
  }

  graded.sort((left, right) => left.settledMs - right.settledMs || left.sequence - right.sequence);

  let equity = startingBankroll;
  let peakEquity = startingBankroll;
  let maximumDrawdownFraction = 0;
  let currentLossStreak = 0;
  let maximumLossStreak = 0;

  for (const result of graded) {
    equity += result.profit;
    peakEquity = Math.max(peakEquity, equity);
    maximumDrawdownFraction = Math.max(
      maximumDrawdownFraction,
      peakEquity > 0 ? (peakEquity - equity) / peakEquity : 1
    );

    if (result.outcome === "loss" || result.profit < 0) {
      currentLossStreak += 1;
      maximumLossStreak = Math.max(maximumLossStreak, currentLossStreak);
    } else if (result.outcome === "win" || result.profit > 0) {
      currentLossStreak = 0;
    }
  }

  const currentDrawdownFraction = peakEquity > 0 ? (peakEquity - equity) / peakEquity : 1;
  const available = inspection !== null && inspection !== undefined &&
    integrityIssueCount === 0 && incompleteProfitCount === 0;
  const state = !available
    ? "unavailable"
    : currentDrawdownFraction >= policy.haltDrawdownFraction ||
        currentLossStreak >= policy.haltLossStreak
      ? "halted"
      : currentDrawdownFraction >= policy.reductionDrawdownFraction ||
          currentLossStreak >= policy.reductionLossStreak
        ? "reduced"
        : "normal";

  return {
    available,
    state,
    startingBankroll,
    currentEquity: equity,
    peakEquity,
    cumulativeProfit: equity - startingBankroll,
    currentDrawdownFraction,
    maximumDrawdownFraction,
    currentLossStreak,
    maximumLossStreak,
    gradedSettlementCount: graded.length,
    amendmentCount: resolved.amendmentCount,
    invalidReferenceCount: resolved.invalidReferenceCount,
    incompleteProfitCount,
    integrityIssueCount,
    policy,
    history: graded.map(({ settledMs, sequence, ...entry }) => entry)
  };
}

function riskFlag(code, severity, message) {
  return { code, severity, message };
}

function summarizeSnapshot(snapshot) {
  if (!snapshot) {
    return null;
  }

  const { history, ...summary } = snapshot;
  return {
    ...summary,
    historyCount: Array.isArray(history) ? history.length : 0
  };
}

function evaluateDrawdownRisk({ snapshot, proposedStake, bankroll }) {
  if (!isFiniteNumber(proposedStake) || proposedStake < 0) {
    throw new RangeError("proposedStake must be a finite non-negative number.");
  }
  if (!isFiniteNumber(bankroll) || bankroll <= 0) {
    throw new RangeError("bankroll must be a finite positive number.");
  }

  if (!snapshot?.available) {
    return {
      passed: false,
      state: "unavailable",
      stakeMultiplier: 0,
      proposedStake,
      approvedStake: 0,
      snapshot: summarizeSnapshot(snapshot),
      riskFlags: [riskFlag(
        "DRAWDOWN_CONTEXT_UNAVAILABLE",
        "high",
        "Drawdown cannot be verified from a complete, integrity-clean settlement history."
      )]
    };
  }

  if (snapshot.state === "halted") {
    return {
      passed: false,
      state: snapshot.state,
      stakeMultiplier: 0,
      proposedStake,
      approvedStake: 0,
      snapshot: summarizeSnapshot(snapshot),
      riskFlags: [riskFlag(
        "MAX_DRAWDOWN_REACHED",
        "high",
        "Drawdown or consecutive-loss policy has halted new betting exposure."
      )]
    };
  }

  const stakeMultiplier = snapshot.state === "reduced"
    ? snapshot.policy.reducedStakeMultiplier
    : 1;
  const approvedStake = Math.min(bankroll, proposedStake * stakeMultiplier);
  const riskFlags = snapshot.state === "reduced"
    ? [riskFlag(
        "DRAWDOWN_STAKE_REDUCTION",
        "medium",
        "The approved stake was reduced under the registered drawdown and loss-streak policy."
      )]
    : [];

  return {
    passed: true,
    state: snapshot.state,
    stakeMultiplier,
    proposedStake,
    approvedStake,
    snapshot: summarizeSnapshot(snapshot),
    riskFlags
  };
}

module.exports = {
  DEFAULT_DRAWDOWN_POLICY,
  buildDrawdownSnapshot,
  evaluateDrawdownRisk
};
