const DEFAULT_MARKET_INTELLIGENCE_POLICY = Object.freeze({
  maxMarketAgeMinutes: 10,
  maxConsensusDispersion: 0.055,
  highHoldThreshold: 0.075,
  longshotImpliedThreshold: 0.2,
  longshotModelPenalty: 0.9,
  steamMoveThreshold: 0.018,
  sharpWeightMultiplier: 1.75,
  minHoldForWeighting: 0.015
});

function clamp(value, min, max) {
  return Math.min(max, Math.max(min, value));
}

function americanToImpliedProbability(americanOdds) {
  const odds = Number(americanOdds);

  if (!Number.isFinite(odds) || odds === 0) {
    throw new Error("American odds must be a non-zero number.");
  }

  return odds > 0 ? 100 / (odds + 100) : Math.abs(odds) / (Math.abs(odds) + 100);
}

function normalizeTwoWayMarket(marketOdds, oppositeOdds) {
  const impliedProbability = americanToImpliedProbability(marketOdds);
  const hasOpposite = Number.isFinite(Number(oppositeOdds)) && Number(oppositeOdds) !== 0;

  if (!hasOpposite) {
    return {
      impliedProbability,
      oppositeImpliedProbability: null,
      hold: null,
      noVigProbability: impliedProbability
    };
  }

  const oppositeImpliedProbability = americanToImpliedProbability(oppositeOdds);
  const totalImpliedProbability = impliedProbability + oppositeImpliedProbability;

  return {
    impliedProbability,
    oppositeImpliedProbability,
    hold: totalImpliedProbability - 1,
    noVigProbability: totalImpliedProbability > 0
      ? impliedProbability / totalImpliedProbability
      : impliedProbability
  };
}

function parseAgeMinutes(value, nowMs) {
  const parsed = Date.parse(value ?? "");

  if (!Number.isFinite(parsed)) {
    return null;
  }

  return (nowMs - parsed) / 60000;
}

function weightedAverage(entries) {
  const totalWeight = entries.reduce((sum, entry) => sum + entry.weight, 0);

  if (totalWeight <= 0) {
    return null;
  }

  return entries.reduce((sum, entry) => sum + entry.value * entry.weight, 0) / totalWeight;
}

function standardDeviation(values) {
  if (values.length <= 1) {
    return 0;
  }

  const mean = values.reduce((sum, value) => sum + value, 0) / values.length;
  const variance = values.reduce((sum, value) => sum + (value - mean) ** 2, 0) / values.length;

  return Math.sqrt(variance);
}

function normalizeConsensusEntry(entry, policy, nowMs) {
  if (!entry || !Number.isFinite(Number(entry.marketOdds)) || Number(entry.marketOdds) === 0) {
    return null;
  }

  const bookmaker = typeof entry.bookmaker === "string" && entry.bookmaker.trim()
    ? entry.bookmaker.trim()
    : null;

  if (!bookmaker) {
    return null;
  }

  const normalized = normalizeTwoWayMarket(entry.marketOdds, entry.oppositeOdds);
  const holdForWeight = Math.max(
    policy.minHoldForWeighting,
    Math.abs(normalized.hold ?? policy.minHoldForWeighting)
  );
  const sharpMultiplier = entry.isSharp ? policy.sharpWeightMultiplier : 1;
  const manualWeight = Number(entry.weight);
  const weight = Number.isFinite(manualWeight) && manualWeight > 0
    ? manualWeight
    : sharpMultiplier / holdForWeight;

  return {
    bookmaker,
    isSharp: Boolean(entry.isSharp),
    marketOdds: entry.marketOdds,
    oppositeOdds: entry.oppositeOdds ?? null,
    lastUpdate: entry.lastUpdate ?? null,
    ageMinutes: parseAgeMinutes(entry.lastUpdate, nowMs),
    weight,
    ...normalized
  };
}

function analyzeLineMovement(history, currentProbability, policy) {
  const normalizedHistory = Array.isArray(history)
    ? history
        .map((entry) => {
          if (!Number.isFinite(Number(entry?.marketOdds)) || Number(entry.marketOdds) === 0) {
            return null;
          }

          const at = entry.at ?? entry.lastUpdate ?? null;
          const atMs = Date.parse(at ?? "");

          if (!Number.isFinite(atMs)) {
            return null;
          }

          return {
            at,
            atMs,
            ...normalizeTwoWayMarket(entry.marketOdds, entry.oppositeOdds)
          };
        })
        .filter(Boolean)
        .sort((left, right) => left.atMs - right.atMs)
    : [];

  if (normalizedHistory.length === 0) {
    return {
      available: false,
      openingProbability: null,
      latestProbability: currentProbability,
      probabilityMove: 0,
      direction: "unknown"
    };
  }

  const openingProbability = normalizedHistory[0].noVigProbability;
  const probabilityMove = currentProbability - openingProbability;
  const direction =
    probabilityMove >= policy.steamMoveThreshold
      ? "toward_selection"
      : probabilityMove <= -policy.steamMoveThreshold
        ? "against_selection"
        : "flat";

  return {
    available: true,
    openingProbability,
    latestProbability: currentProbability,
    probabilityMove,
    direction
  };
}

function analyzeMarketIntelligence({
  marketOdds,
  oppositeOdds,
  marketContext = {},
  baseMarketWeight = 0.35,
  now = new Date(),
  policy = {}
}) {
  const resolvedPolicy = {
    ...DEFAULT_MARKET_INTELLIGENCE_POLICY,
    ...policy
  };
  const context = /** @type {any} */ (marketContext ?? {});
  const nowMs = now instanceof Date ? now.getTime() : Date.parse(now);
  const safeNowMs = Number.isFinite(nowMs) ? nowMs : Date.now();
  const offered = normalizeTwoWayMarket(marketOdds, oppositeOdds);
  const rawConsensusEntries = Array.isArray(context.consensus)
    ? context.consensus
        .map((entry) => normalizeConsensusEntry(entry, resolvedPolicy, safeNowMs))
        .filter(Boolean)
    : [];
  const seenBookmakers = new Set();
  const consensusEntries = rawConsensusEntries.filter((entry) => {
    if (seenBookmakers.has(entry.bookmaker)) {
      return false;
    }

    const usable =
      entry.oppositeImpliedProbability !== null &&
      entry.ageMinutes !== null &&
      entry.ageMinutes >= 0 &&
      entry.ageMinutes <= resolvedPolicy.maxMarketAgeMinutes;

    if (usable) {
      seenBookmakers.add(entry.bookmaker);
    }

    return usable;
  });
  const staleConsensusCount = rawConsensusEntries.filter((entry) =>
    entry.ageMinutes !== null && entry.ageMinutes > resolvedPolicy.maxMarketAgeMinutes
  ).length;
  const futureConsensusCount = rawConsensusEntries.filter((entry) =>
    entry.ageMinutes !== null && entry.ageMinutes < 0
  ).length;
  const unverifiedConsensusCount = rawConsensusEntries.filter((entry) => entry.ageMinutes === null).length;
  const missingCounterpartCount = rawConsensusEntries.filter(
    (entry) => entry.oppositeImpliedProbability === null
  ).length;
  const consensusProbability = weightedAverage(
    consensusEntries.map((entry) => ({
      value: entry.noVigProbability,
      weight: entry.weight
    }))
  );
  const consensusValues = consensusEntries.map((entry) => entry.noVigProbability);
  const consensusDispersion = standardDeviation(consensusValues);
  const avgHold = consensusEntries.length > 0
    ? consensusEntries.reduce((sum, entry) => sum + Math.abs(entry.hold ?? 0), 0) / consensusEntries.length
    : null;
  const staleAgeMinutes = parseAgeMinutes(context.offeredLastUpdate, safeNowMs);
  const marketTimestampStatus =
    context.offeredLastUpdate === undefined || context.offeredLastUpdate === null || context.offeredLastUpdate === ""
      ? "missing"
      : staleAgeMinutes === null
        ? "invalid"
        : staleAgeMinutes < 0
          ? "future"
          : staleAgeMinutes > resolvedPolicy.maxMarketAgeMinutes
            ? "stale"
            : "fresh";
  const referenceProbability = consensusProbability ?? offered.noVigProbability;
  const lineMovement = analyzeLineMovement(context.history, referenceProbability, resolvedPolicy);
  const sharpBookCount = consensusEntries.filter((entry) => entry.isSharp).length;
  const riskFlags = [];
  const adjustments = [];

  if (consensusEntries.length > 0) {
    riskFlags.push({
      code: "MARKET_CONSENSUS",
      severity: "info",
      message: "Multi-book market consensus was used as the fair-price reference."
    });
  }

  if (unverifiedConsensusCount > 0) {
    riskFlags.push({
      code: "UNVERIFIED_CONSENSUS_DATA",
      severity: "medium",
      message: "Consensus entries without valid timestamps were excluded from the fair-price reference."
    });
  }

  if (staleConsensusCount > 0 || futureConsensusCount > 0) {
    riskFlags.push({
      code: "STALE_CONSENSUS_DATA",
      severity: "medium",
      message: "Stale or future-dated consensus entries were excluded from the fair-price reference."
    });
  }

  if (missingCounterpartCount > 0) {
    riskFlags.push({
      code: "MISSING_CONSENSUS_COUNTERPART",
      severity: "medium",
      message: "One-sided consensus observations were excluded because their vig cannot be removed."
    });
  }

  if (offered.oppositeImpliedProbability === null) {
    riskFlags.push({
      code: "MISSING_MARKET_COUNTERPART",
      severity: "high",
      message: "The offered market is missing its opposite price, so its vig and fair probability cannot be verified."
    });
  }

  if (Math.abs(offered.hold ?? 0) > resolvedPolicy.highHoldThreshold) {
    riskFlags.push({
      code: "HIGH_HOLD_MARKET",
      severity: "medium",
      message: "The offered two-way market has high hold, so the price is expensive to trust."
    });
  }

  if (consensusDispersion > resolvedPolicy.maxConsensusDispersion) {
    riskFlags.push({
      code: "MARKET_DISAGREEMENT",
      severity: "high",
      message: "Books disagree too much on the fair probability; wait for a cleaner market."
    });
  }

  if (marketTimestampStatus === "missing") {
    riskFlags.push({
      code: "MISSING_MARKET_TIMESTAMP",
      severity: "high",
      message: "The offered sportsbook price has no capture timestamp and cannot pass a live freshness gate."
    });
  } else if (marketTimestampStatus === "invalid") {
    riskFlags.push({
      code: "INVALID_MARKET_TIMESTAMP",
      severity: "high",
      message: "The offered sportsbook price timestamp is invalid and cannot be trusted for a live decision."
    });
  } else if (marketTimestampStatus === "future") {
    riskFlags.push({
      code: "FUTURE_MARKET_TIMESTAMP",
      severity: "high",
      message: "The offered sportsbook price timestamp is in the future and indicates a data or clock error."
    });
  } else if (marketTimestampStatus === "stale") {
    riskFlags.push({
      code: "STALE_MARKET_PRICE",
      severity: "high",
      message: "The offered sportsbook price is older than the configured market freshness threshold."
    });
  }

  if (lineMovement.direction === "against_selection") {
    riskFlags.push({
      code: "STEAM_AGAINST",
      severity: "medium",
      message: "The no-vig market moved against this selection from the first observed price."
    });
  } else if (lineMovement.direction === "toward_selection") {
    riskFlags.push({
      code: "STEAM_WITH",
      severity: "info",
      message: "The no-vig market moved toward this selection from the first observed price."
    });
  }

  if (offered.impliedProbability < resolvedPolicy.longshotImpliedThreshold && sharpBookCount === 0) {
    adjustments.push({
      code: "FAVORITE_LONGSHOT_BIAS",
      multiplier: resolvedPolicy.longshotModelPenalty,
      message: "Longshot prices often carry extra tax; model probability is discounted without sharp confirmation."
    });
    riskFlags.push({
      code: "FAVORITE_LONGSHOT_BIAS",
      severity: "medium",
      message: "Longshot price lacks sharp-book confirmation, so the engine applies a conservative tax."
    });
  }

  const confidence = clamp(
    0.35 +
      (offered.oppositeImpliedProbability === null ? 0 : 0.15) +
      (consensusEntries.length >= 2 ? 0.2 : 0) +
      (sharpBookCount > 0 ? 0.15 : 0) -
      (consensusDispersion > resolvedPolicy.maxConsensusDispersion ? 0.25 : 0) -
      (marketTimestampStatus !== "fresh" ? 0.25 : 0) -
      (Math.abs(offered.hold ?? 0) > resolvedPolicy.highHoldThreshold ? 0.1 : 0),
    0.1,
    0.85
  );
  const marketWeight = clamp(baseMarketWeight + confidence * 0.1, 0, 0.65);

  return {
    offered,
    referenceProbability,
    marketWeight,
    confidence,
    consensus: {
      bookCount: consensusEntries.length,
      sharpBookCount,
      probability: consensusProbability,
      dispersion: consensusDispersion,
      averageHold: avgHold,
      missingCounterpartCount,
      books: consensusEntries.map((entry) => ({
        bookmaker: entry.bookmaker,
        isSharp: entry.isSharp,
        noVigProbability: entry.noVigProbability,
        hold: entry.hold,
        ageMinutes: entry.ageMinutes,
        weight: entry.weight
      }))
    },
    lineMovement,
    staleAgeMinutes,
    marketTimestampStatus,
    adjustments,
    riskFlags
  };
}

function applyMarketAdjustments(modelProbability, marketIntelligence) {
  const adjusted = (marketIntelligence.adjustments ?? []).reduce(
    (probability, adjustment) => probability * (adjustment.multiplier ?? 1),
    modelProbability
  );

  return clamp(adjusted, 0, 1);
}

module.exports = {
  DEFAULT_MARKET_INTELLIGENCE_POLICY,
  analyzeMarketIntelligence,
  applyMarketAdjustments,
  normalizeTwoWayMarket
};
