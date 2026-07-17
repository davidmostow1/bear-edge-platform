const {
  analyzeMarketIntelligence,
  applyMarketAdjustments
} = require("./market-intelligence.js");
const { resolveLiveLegModelEvidence } = require("../calibration/model-evidence.js");

const DEFAULT_LIVE_POLICY = Object.freeze({
  marketWeight: 0.35,
  recentWeight: 0.45,
  maxParlayLegs: 3,
  maxAltPropLegs: 2,
  maxSourceAgeMinutes: 20,
  maxMarketAgeMinutes: 10,
  correlationPenalty: 0.92,
  allowCorrelatedLegs: false,
  kellyMultiplier: 0.2,
  maxBankrollFraction: 0.02,
  minStake: 1
});

/**
 * @typedef {object} ExpectedValueInput
 * @property {number} winProbability
 * @property {number} [americanOdds]
 * @property {number} [decimalOdds]
 * @property {number} [stake]
 */

/**
 * @typedef {object} KellyInput
 * @property {number} winProbability
 * @property {number} [americanOdds]
 * @property {number} [decimalOdds]
 */

function americanToDecimal(americanOdds) {
  if (americanOdds > 0) {
    return 1 + americanOdds / 100;
  }

  return 1 + 100 / Math.abs(americanOdds);
}

function americanToImpliedProbability(americanOdds) {
  if (americanOdds > 0) {
    return 100 / (americanOdds + 100);
  }

  return Math.abs(americanOdds) / (Math.abs(americanOdds) + 100);
}

/**
 * @param {ExpectedValueInput} param0
 */
function calculateExpectedValue({ winProbability, americanOdds, decimalOdds, stake = 1 }) {
  const resolvedDecimalOdds = decimalOdds ?? americanToDecimal(americanOdds);
  const netWinMultiple = resolvedDecimalOdds - 1;
  const expectedProfit = stake * (winProbability * netWinMultiple - (1 - winProbability));

  return {
    decimalOdds: resolvedDecimalOdds,
    expectedProfit,
    roi: expectedProfit / stake,
    profitIfWin: stake * netWinMultiple,
    lossIfLose: stake
  };
}

/**
 * @param {KellyInput} param0
 */
function calculateKellyFraction({ winProbability, americanOdds, decimalOdds }) {
  const resolvedDecimalOdds = decimalOdds ?? americanToDecimal(americanOdds);
  const netWinMultiple = resolvedDecimalOdds - 1;
  const lossProbability = 1 - winProbability;
  const rawFraction = (netWinMultiple * winProbability - lossProbability) / netWinMultiple;

  return {
    rawFraction,
    fraction: Math.max(0, rawFraction)
  };
}

function applyStakeCaps({
  bankroll,
  kellyFraction,
  kellyMultiplier = DEFAULT_LIVE_POLICY.kellyMultiplier,
  maxStake = Infinity,
  maxBankrollFraction = DEFAULT_LIVE_POLICY.maxBankrollFraction
}) {
  const cappedBy = [];
  const uncappedStake = bankroll * kellyFraction * kellyMultiplier;
  let recommendedStake = uncappedStake;

  if (maxStake < recommendedStake) {
    recommendedStake = maxStake;
    cappedBy.push("maxStake");
  }

  const bankrollCap = bankroll * maxBankrollFraction;

  if (bankrollCap < recommendedStake) {
    recommendedStake = bankrollCap;
    cappedBy.push("maxBankrollFraction");
  }

  return {
    uncappedStake,
    recommendedStake,
    cappedBy
  };
}

function shrinkProbabilityTowardMarket(modelProbability, marketProbability, marketWeight = 0.35) {
  return modelProbability * (1 - marketWeight) + marketProbability * marketWeight;
}

function getTwoWayNoVigProbability(americanOdds, oppositeOdds) {
  const impliedA = americanToImpliedProbability(americanOdds);
  const impliedB = americanToImpliedProbability(oppositeOdds);
  const total = impliedA + impliedB;

  return impliedA / total;
}

function factorial(value) {
  let result = 1;

  for (let index = 2; index <= value; index += 1) {
    result *= index;
  }

  return result;
}

function poissonCdf(k, mean) {
  if (k < 0) {
    return 0;
  }

  let sum = 0;

  for (let index = 0; index <= k; index += 1) {
    sum += Math.exp(-mean) * mean ** index / factorial(index);
  }

  return Math.min(1, Math.max(0, sum));
}

function estimateCountProbability({ mean, line, side }) {
  const flooredLine = Math.floor(line);

  if (side === "over") {
    return 1 - poissonCdf(flooredLine, mean);
  }

  if (side === "under") {
    return poissonCdf(flooredLine, mean);
  }

  throw new Error(`Unsupported prop side: ${side}`);
}

function estimateLiveCountProbability(snapshot, blendedMean, line, side) {
  const liveGame = snapshot?.liveGame;

  if (!liveGame || !Number.isFinite(liveGame.currentValue)) {
    return null;
  }

  const currentValue = liveGame.currentValue;
  const remainingOpportunityFactor =
    typeof liveGame.remainingOpportunityFactor === "number" && Number.isFinite(liveGame.remainingOpportunityFactor)
      ? Math.max(0, Math.min(1, liveGame.remainingOpportunityFactor))
      : 1;
  const remainingMean = blendedMean * remainingOpportunityFactor;
  const flooredLine = Math.floor(line);

  if (side === "over") {
    const targetTotal = flooredLine + 1;
    const additionalNeeded = targetTotal - currentValue;

    if (additionalNeeded <= 0) {
      return {
        probability: 1,
        currentValue,
        remainingMean,
        remainingOpportunityFactor,
        resolved: true
      };
    }

    return {
      probability: 1 - poissonCdf(additionalNeeded - 1, remainingMean),
      currentValue,
      remainingMean,
      remainingOpportunityFactor,
      resolved: false
    };
  }

  if (side === "under") {
    const maxFinalTotal = flooredLine;
    const maxAdditionalAllowed = maxFinalTotal - currentValue;

    if (maxAdditionalAllowed < 0) {
      return {
        probability: 0,
        currentValue,
        remainingMean,
        remainingOpportunityFactor,
        resolved: true
      };
    }

    return {
      probability: poissonCdf(maxAdditionalAllowed, remainingMean),
      currentValue,
      remainingMean,
      remainingOpportunityFactor,
      resolved: false
    };
  }

  throw new Error(`Unsupported prop side: ${side}`);
}

function computeSourceAgeMinutes(snapshot) {
  const fetchedAtMs = Date.parse(snapshot.fetchedAt);

  if (!Number.isFinite(fetchedAtMs)) {
    return Infinity;
  }

  return Math.max(0, (Date.now() - fetchedAtMs) / 60000);
}

function evaluateLiveLeg(leg, snapshot, context = {}) {
  const policy = {
    ...DEFAULT_LIVE_POLICY,
    ...(context.livePolicy ?? {})
  };
  const bankroll = context.bankroll;
  const modelEvidence = resolveLiveLegModelEvidence(leg, context.modelRegistryOptions);
  const selection = leg.label || leg.selection || leg.id;
  const marketOdds = leg.marketOdds;
  const oppositeOdds = leg.oppositeOdds ?? null;
  const marketIntelligence = analyzeMarketIntelligence({
    marketOdds,
    oppositeOdds,
    marketContext: leg.marketContext,
    baseMarketWeight: leg.marketWeight ?? policy.marketWeight,
    policy: {
      maxMarketAgeMinutes: leg.maxMarketAgeMinutes ?? policy.maxMarketAgeMinutes
    }
  });
  const marketReferenceProbability = marketIntelligence.referenceProbability;
  const recentWeight = leg.recentWeight ?? policy.recentWeight;
  const blendedMean = snapshot.season.perGame * (1 - recentWeight) + snapshot.recent.perGame * recentWeight;
  const liveEstimate = leg.modelProbabilityOverride === undefined
    ? estimateLiveCountProbability(snapshot, blendedMean, leg.line, leg.side)
    : null;
  const baseProbability = leg.modelProbabilityOverride ?? liveEstimate?.probability ?? estimateCountProbability({
    mean: blendedMean,
      line: leg.line,
      side: leg.side
    });
  const marketAdjustedBaseProbability = applyMarketAdjustments(baseProbability, marketIntelligence);
  const adjustedProbability =
    liveEstimate?.resolved
      ? baseProbability
      : shrinkProbabilityTowardMarket(
          marketAdjustedBaseProbability,
          marketReferenceProbability,
          marketIntelligence.marketWeight
        );
  const expectedValue = calculateExpectedValue({
    winProbability: adjustedProbability,
    americanOdds: marketOdds,
    stake: 1
  });
  const kelly = calculateKellyFraction({
    winProbability: adjustedProbability,
    americanOdds: marketOdds
  });
  const stakeRecommendation = applyStakeCaps({
    bankroll,
    kellyFraction: kelly.fraction,
    kellyMultiplier: leg.kellyMultiplier ?? policy.kellyMultiplier,
    maxStake: leg.maxStake ?? Infinity,
    maxBankrollFraction: leg.maxBankrollFraction ?? policy.maxBankrollFraction
  });
  const fairEdge = adjustedProbability - marketReferenceProbability;
  const priceEdge = adjustedProbability - americanToImpliedProbability(marketOdds);
  const sourceAgeMinutes = computeSourceAgeMinutes(snapshot);
  const riskFlags = Array.isArray(leg.riskFlags)
    ? leg.riskFlags.map((flag) => ({
        code: flag.code,
        severity: flag.severity ?? "info",
        message: flag.message ?? flag.code
      }))
    : [];
  riskFlags.push(...marketIntelligence.riskFlags);
  const usesUncalibratedBaseline = leg.modelProbabilityOverride === undefined && !liveEstimate?.resolved;
  const usesUnvalidatedOverride = leg.modelProbabilityOverride !== undefined && !modelEvidence.validated;
  const requiresRegisteredModel = !liveEstimate?.resolved && !modelEvidence.validated;

  if (requiresRegisteredModel) {
    riskFlags.push({
      code: "MODEL_CALIBRATION_REQUIRED",
      severity: "high",
      message: usesUnvalidatedOverride
        ? "The supplied probability is not backed by an exact validated model-registry entry and report digest."
        : "The prop probability uses a Poisson baseline without an exact validated model-registry entry and report digest."
    });
  }

  if (usesUncalibratedBaseline) {
    riskFlags.push({
      code: "POISSON_BASELINE_MODEL",
      severity: "info",
      message: "The research baseline does not model player-specific overdispersion, role, lineup, opponent, or venue uncertainty."
    });
  }
  const reasons = [];
  let verdict = "BET";

  if (sourceAgeMinutes > (leg.maxSourceAgeMinutes ?? policy.maxSourceAgeMinutes)) {
    verdict = "WAIT";
    riskFlags.push({
      code: "STALE_SOURCE",
      severity: "medium",
      message: "Live stat source is older than the configured freshness threshold."
    });
    reasons.push("Live stat source is stale.");
  } else if (requiresRegisteredModel) {
    verdict = "WAIT";
    reasons.push("Validated model-registry evidence is required before a BET verdict.");
  } else if (expectedValue.roi < (leg.minEvRoi ?? 0)) {
    verdict = "PASS";
    riskFlags.push({
      code: "NEGATIVE_EV",
      severity: "info",
      message: "Leg EV is negative at the offered odds."
    });
    reasons.push("Leg EV is negative.");
  } else if (stakeRecommendation.recommendedStake < (leg.minStake ?? policy.minStake)) {
    verdict = "PASS";
    riskFlags.push({
      code: "STAKE_BELOW_MINIMUM",
      severity: "info",
      message: "Leg stake falls below the configured minimum."
    });
    reasons.push("Leg stake is below minimum.");
  } else if (riskFlags.some((flag) => flag.severity === "high")) {
    verdict = "WAIT";
    reasons.push("High-severity carried leg risk flags require manual confirmation.");
  } else {
    reasons.push("Live stats, EV, and stake sizing pass.");
  }

  if (leg.marketType === "alt-prop") {
    riskFlags.push({
      code: "ALT_PROP",
      severity: "info",
      message: "Alternate prop leg detected; market shrinkage is applied conservatively."
    });
  }

  if (oppositeOdds === null) {
    riskFlags.push({
      code: "NO_VIG_UNAVAILABLE",
      severity: "info",
      message: "Opposite odds were not supplied, so the market reference uses implied probability."
    });
  }

  if (liveEstimate) {
    riskFlags.push({
      code: "LIVE_GAME_CONTEXT",
      severity: "info",
      message: "Current in-game production was included when estimating the final stat distribution."
    });
  }

  return {
    id: leg.id,
    selection,
    verdict,
    reasons,
    riskFlags,
    marketOdds,
    oppositeOdds,
    marketType: leg.marketType,
    side: leg.side,
    line: leg.line,
    source: snapshot,
    modelEvidence,
    derived: {
      recentWeight,
      blendedMean,
      baseProbability,
      marketAdjustedBaseProbability,
      adjustedProbability,
      marketReferenceProbability,
      fairEdge,
      priceEdge,
      marketIntelligence,
      sourceAgeMinutes,
      currentGameValue: liveEstimate?.currentValue ?? null,
      remainingMean: liveEstimate?.remainingMean ?? null,
      remainingOpportunityFactor: liveEstimate?.remainingOpportunityFactor ?? null,
      liveDeterministicOutcome: liveEstimate?.resolved ?? false,
      liveGameStatus: snapshot.liveGame?.status ?? null
    },
    expectedValue,
    kelly,
    stakeRecommendation
  };
}

function combineParlayLegs(ticket, legResults) {
  const livePolicy = {
    ...DEFAULT_LIVE_POLICY,
    ...(ticket.livePolicy ?? {})
  };
  const altPropLegs = legResults.filter((leg) => leg.marketType === "alt-prop").length;
  const duplicateCorrelationKeys = new Set();
  const correlationKeys = new Set();

  for (const leg of ticket.legs) {
    if (leg.correlationKey) {
      if (correlationKeys.has(leg.correlationKey)) {
        duplicateCorrelationKeys.add(leg.correlationKey);
      }

      correlationKeys.add(leg.correlationKey);
    }
  }

  const hasPassLeg = legResults.some((leg) => leg.verdict === "PASS");
  const hasWaitLeg = legResults.some((leg) => leg.verdict === "WAIT");
  const combinedDecimalOdds = legResults.reduce(
    (product, leg) => product * americanToDecimal(leg.marketOdds),
    1
  );
  const combinedAmericanOdds = Math.round((combinedDecimalOdds - 1) * 100);
  const baseProbabilityProduct = legResults.reduce(
    (product, leg) => product * leg.derived.adjustedProbability,
    1
  );
  const correlationPenaltyFactor =
    duplicateCorrelationKeys.size > 0 && !livePolicy.allowCorrelatedLegs ? livePolicy.correlationPenalty : 1;
  const combinedProbability = baseProbabilityProduct * correlationPenaltyFactor;
  const combinedMarketProbability = legResults.reduce(
    (product, leg) => product * leg.derived.marketReferenceProbability,
    1
  );
  const expectedValue = calculateExpectedValue({
    winProbability: combinedProbability,
    decimalOdds: combinedDecimalOdds,
    stake: 1
  });
  const kelly = calculateKellyFraction({
    winProbability: combinedProbability,
    decimalOdds: combinedDecimalOdds
  });
  const stakeRecommendation = applyStakeCaps({
    bankroll: ticket.bankroll,
    kellyFraction: kelly.fraction,
    kellyMultiplier: ticket.kellyMultiplier ?? livePolicy.kellyMultiplier,
    maxStake: ticket.maxStake ?? Infinity,
    maxBankrollFraction: ticket.maxBankrollFraction ?? livePolicy.maxBankrollFraction
  });
  const carriedLegRiskFlags = legResults.flatMap((leg) =>
    (leg.riskFlags ?? []).map((flag) => ({
      code: `LEG_${flag.code}`,
      severity: flag.severity ?? "info",
      message: `${leg.selection}: ${flag.message ?? flag.code}`,
      legId: leg.id,
      originalCode: flag.code
    }))
  );
  const riskFlags = [...carriedLegRiskFlags];
  const reasons = [];
  let verdict = "BET";

  if (ticket.legs.length < 2 || ticket.legs.length > livePolicy.maxParlayLegs) {
    verdict = "PASS";
    riskFlags.push({
      code: "PARLAY_LEG_LIMIT",
      severity: "high",
      message: `Parlays are limited to ${livePolicy.maxParlayLegs} legs.`
    });
    reasons.push("Parlay leg count is outside the supported range.");
  } else if (altPropLegs > livePolicy.maxAltPropLegs) {
    verdict = "PASS";
    riskFlags.push({
      code: "ALT_PROP_LIMIT",
      severity: "high",
      message: `Parlays are limited to ${livePolicy.maxAltPropLegs} alternate prop legs.`
    });
    reasons.push("Too many alternate props are included in the parlay.");
  } else if (duplicateCorrelationKeys.size > 0 && !livePolicy.allowCorrelatedLegs) {
    verdict = "PASS";
    riskFlags.push({
      code: "CORRELATION_RISK",
      severity: "high",
      message: "Correlated legs were detected and correlation overrides are disabled."
    });
    reasons.push("Correlated legs were detected.");
  } else if (hasPassLeg) {
    verdict = "PASS";
    riskFlags.push({
      code: "PARLAY_LEG_PASS",
      severity: "high",
      message: "At least one parlay leg failed its own gate."
    });
    reasons.push("At least one leg failed its own gate.");
  } else if (hasWaitLeg) {
    verdict = "WAIT";
    riskFlags.push({
      code: "PARLAY_LEG_WAIT",
      severity: "medium",
      message: "At least one parlay leg is waiting on fresher or safer data."
    });
    reasons.push("At least one leg is waiting on fresher live data.");
  } else if (expectedValue.roi < (ticket.minEvRoi ?? 0)) {
    verdict = "PASS";
    riskFlags.push({
      code: "NEGATIVE_EV",
      severity: "info",
      message: "Parlay EV is negative at the combined offered price."
    });
    reasons.push("Parlay EV is negative.");
  } else if (stakeRecommendation.recommendedStake < (ticket.minStake ?? livePolicy.minStake)) {
    verdict = "PASS";
    riskFlags.push({
      code: "STAKE_BELOW_MINIMUM",
      severity: "info",
      message: "Parlay stake falls below the configured minimum."
    });
    reasons.push("Parlay stake is below minimum.");
  } else {
    reasons.push("All live legs pass and the combined parlay clears EV and staking gates.");
  }

  return {
    kind: "parlay",
    selection: ticket.selection,
    verdict,
    reasons,
    riskFlags,
    legs: legResults,
    combined: {
      decimalOdds: combinedDecimalOdds,
      americanOdds: combinedAmericanOdds,
      probability: combinedProbability,
      marketReferenceProbability: combinedMarketProbability,
      correlationPenaltyFactor
    },
    expectedValue,
    kelly,
    stakeRecommendation
  };
}

module.exports = {
  DEFAULT_LIVE_POLICY,
  combineParlayLegs,
  estimateCountProbability,
  evaluateLiveLeg
};
