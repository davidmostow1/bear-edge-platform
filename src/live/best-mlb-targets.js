const { generateResearchCandidates } = require("./candidates.js");
const {
  fetchOddsApiEventMarkets,
  fetchOddsApiMarkets,
  estimateOddsRequestCost,
  quotaSnapshot,
  resolveOddsApiKey
} = require("./odds-api.js");
const {
  analyzeMarketIntelligence,
  applyMarketAdjustments
} = require("./market-intelligence.js");
const { safeErrorMessage } = require("../config/secrets.js");
const {
  prepareModelRegistryOptions,
  resolveCandidateModelEvidence
} = require("../calibration/model-evidence.js");
const { evaluatePortfolioRisk } = require("../risk/portfolio-risk.js");
const { evaluateDrawdownRisk } = require("../risk/drawdown-risk.js");
const { buildPriceDiscipline } = require("./price-discipline.js");
const { evaluateRecommendationLifecycle } = require("./recommendation-lifecycle.js");

const DEFAULT_MLB_BOOKMAKERS = "draftkings,fanduel,betmgm,caesars,fanatics";

const MLB_PROP_MARKETS = Object.freeze({
  strikeOuts: "pitcher_strikeouts",
  hits: "batter_hits",
  runs: "batter_runs_scored",
  totalBases: "batter_total_bases"
});

function normalizeName(value) {
  return String(value ?? "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, " ")
    .replace(/\b(the|fc|club)\b/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function americanToDecimal(americanOdds) {
  const odds = Number(americanOdds);

  if (!Number.isFinite(odds) || odds === 0) {
    throw new Error("American odds must be a non-zero number.");
  }

  return odds > 0 ? 1 + odds / 100 : 1 + 100 / Math.abs(odds);
}

function americanToImpliedProbability(americanOdds) {
  const odds = Number(americanOdds);

  if (!Number.isFinite(odds) || odds === 0) {
    throw new Error("American odds must be a non-zero number.");
  }

  return odds > 0 ? 100 / (odds + 100) : Math.abs(odds) / (Math.abs(odds) + 100);
}

function noVigProbability(marketOdds, oppositeOdds) {
  const implied = americanToImpliedProbability(marketOdds);

  if (!Number.isFinite(Number(oppositeOdds)) || Number(oppositeOdds) === 0) {
    return implied;
  }

  const opposite = americanToImpliedProbability(oppositeOdds);
  const total = implied + opposite;

  return total > 0 ? implied / total : implied;
}

function shrinkProbability(modelProbability, marketProbability, marketWeight) {
  return modelProbability * (1 - marketWeight) + marketProbability * marketWeight;
}

function expectedValueRoi(winProbability, americanOdds) {
  const decimalOdds = americanToDecimal(americanOdds);

  return winProbability * (decimalOdds - 1) - (1 - winProbability);
}

function kellyFraction(winProbability, americanOdds) {
  const decimalOdds = americanToDecimal(americanOdds);
  const netOdds = decimalOdds - 1;
  const raw = (winProbability * netOdds - (1 - winProbability)) / netOdds;

  return Math.max(0, raw);
}

function evaluatePrice(candidate, price, options = {}) {
  const bankroll = options.bankroll ?? candidate.ticketDraft.bankroll ?? 1000;
  const livePolicy = candidate.ticketDraft.livePolicy ?? {};
  const marketWeight = livePolicy.marketWeight ?? 0.35;
  const maxMarketAgeMinutes = options.maxMarketAgeMinutes ?? livePolicy.maxMarketAgeMinutes;
  const marketIntelligence = analyzeMarketIntelligence({
    marketOdds: price.marketOdds,
    oppositeOdds: price.oppositeOdds,
    marketContext: price.marketContext,
    baseMarketWeight: marketWeight,
    now: options.now ?? new Date(),
    policy: maxMarketAgeMinutes === undefined
      ? {}
      : { maxMarketAgeMinutes }
  });
  const marketProbability = marketIntelligence.referenceProbability;
  const rawModelProbability = candidate.prediction.modelProbability;
  const probabilityUncertainty = candidate.prediction?.uncertainty ?? null;
  const hasObservedProbabilityInterval =
    probabilityUncertainty?.intervalBasis === "observed_count" &&
    Number.isFinite(probabilityUncertainty?.decisionProbability);
  const independentModelProbability = hasObservedProbabilityInterval
    ? Math.min(rawModelProbability, probabilityUncertainty.decisionProbability)
    : rawModelProbability;
  const adjustedModelProbability = applyMarketAdjustments(
    independentModelProbability,
    marketIntelligence
  );
  const adjustedProbability = shrinkProbability(
    adjustedModelProbability,
    marketProbability,
    marketIntelligence.marketWeight
  );
  const impliedProbability = americanToImpliedProbability(price.marketOdds);
  const priceEdge = adjustedProbability - impliedProbability;
  const fairEdge = adjustedProbability - marketProbability;
  const roi = expectedValueRoi(adjustedProbability, price.marketOdds);
  const kelly = kellyFraction(adjustedProbability, price.marketOdds);
  const policy = {
    minFairEdge: livePolicy.minFairEdge ?? 0.02,
    minEvRoi: livePolicy.minEvRoi ?? 0.01,
    minKellyFraction: livePolicy.minKellyFraction ?? 0.005,
    requireMarketTimestamp: livePolicy.requireMarketTimestamp ?? true,
    requireCalibratedModel: livePolicy.requireCalibratedModel ?? true,
    kellyMultiplier: livePolicy.kellyMultiplier ?? 0.12,
    maxBankrollFraction: livePolicy.maxBankrollFraction ?? 0.015,
    maxStake: livePolicy.maxStake ?? Math.max(5, bankroll * 0.015),
    minStake: livePolicy.minStake ?? 5,
    prohibitedWindowMinutes: livePolicy.prohibitedWindowMinutes ?? 5,
    requireObservedProbabilityInterval: livePolicy.requireObservedProbabilityInterval ?? true,
    maxProbabilityIntervalWidth: livePolicy.maxProbabilityIntervalWidth ?? 0.5
  };
  const rawStake = bankroll * kelly * policy.kellyMultiplier;
  const proposedStake = Math.min(rawStake, policy.maxStake, bankroll * policy.maxBankrollFraction);
  const drawdownRisk = evaluateDrawdownRisk({
    snapshot: options.drawdownSnapshot,
    proposedStake,
    bankroll
  });
  const recommendedStake = drawdownRisk.approvedStake;
  const priceDiscipline = buildPriceDiscipline({
    currentAmericanOdds: price.marketOdds,
    winProbability: adjustedProbability,
    priceCapturedAt: price.marketContext?.offeredLastUpdate ?? price.marketLastUpdate ?? null,
    eventStartAt: candidate.gameDate ?? null,
    now: options.now ?? new Date(),
    policy: {
      ...policy,
      bankroll,
      kellyMultiplier: policy.kellyMultiplier * drawdownRisk.stakeMultiplier,
      maxMarketAgeMinutes: maxMarketAgeMinutes ?? 10
    }
  });
  const portfolioRisk = evaluatePortfolioRisk({
    candidate: {
      ...candidate,
      marketFamily: mappedMarketKey(candidate),
      selection: candidate.ticketDraft?.selection ?? null
    },
    proposedStake: recommendedStake,
    bankroll,
    snapshot: options.portfolioSnapshot,
    policy: options.portfolioPolicy
  });
  const riskFlags = [];
  const reasons = [];
  const modelEvidence = resolveCandidateModelEvidence(candidate, options.modelRegistryOptions);

  for (const flag of candidate.riskFlags ?? []) {
    if (flag.code !== "MISSING_MARKET_ODDS") {
      riskFlags.push(flag);
    }
  }
  riskFlags.push(...marketIntelligence.riskFlags);
  riskFlags.push(...drawdownRisk.riskFlags);
  riskFlags.push(...portfolioRisk.riskFlags);
  if (policy.requireObservedProbabilityInterval && !hasObservedProbabilityInterval) {
    riskFlags.push({
      code: "PREDICTIVE_UNCERTAINTY_UNAVAILABLE",
      severity: "high",
      message: "An observed-count probability interval is required before this candidate can be actionable."
    });
  } else if (hasObservedProbabilityInterval &&
      probabilityUncertainty.width > policy.maxProbabilityIntervalWidth) {
    riskFlags.push({
      code: "PREDICTIVE_UNCERTAINTY_EXCESSIVE",
      severity: "high",
      message: "The probability interval is wider than the configured decision threshold."
    });
  } else if (hasObservedProbabilityInterval && independentModelProbability < rawModelProbability) {
    riskFlags.push({
      code: "PREDICTIVE_UNCERTAINTY_DISCOUNT",
      severity: "info",
      message: "EV and staking use the lower observed-count probability bound instead of the point estimate."
    });
  }
  if (!priceDiscipline.minimumPrice.feasible) {
    riskFlags.push({
      code: "PRICE_LIMIT_INFEASIBLE",
      severity: "high",
      message: "No offered price can satisfy the configured economic and minimum-stake constraints."
    });
  } else if (priceDiscipline.expired) {
    riskFlags.push({
      code: "PRICE_EXPIRED",
      severity: "high",
      message: "The recommendation passed its market-freshness or event-time validity boundary."
    });
  } else if (!priceDiscipline.clearsMinimumPrice) {
    riskFlags.push({
      code: "PRICE_BELOW_MINIMUM",
      severity: "info",
      message: "The available American odds are worse than the calculated minimum acceptable price."
    });
  }
  if (!modelEvidence.validated) {
    riskFlags.push({
      code: "MODEL_CALIBRATION_REQUIRED",
      severity: "high",
      message: "This candidate lacks an exact validated model-registry entry and calibration report digest."
    });
  }
  let verdict = "BET";

  const marketDataRiskCodes = new Set([
    "MISSING_MARKET_COUNTERPART",
    "MISSING_MARKET_TIMESTAMP",
    "INVALID_MARKET_TIMESTAMP",
    "FUTURE_MARKET_TIMESTAMP",
    "STALE_MARKET_PRICE",
    "MARKET_DISAGREEMENT"
  ]);
  const hasMarketDataRisk = riskFlags.some((flag) => marketDataRiskCodes.has(flag.code));
  const hasManualConfirmationRisk = riskFlags.some((flag) =>
    ["LINEUP_NOT_CONFIRMED", "STALE_INJURY", "INJURY_DATA_STALE", "ROSTER_NOT_CONFIRMED"].includes(flag.code)
  );
  const hasPredictiveUncertaintyRisk = riskFlags.some((flag) =>
    ["PREDICTIVE_UNCERTAINTY_UNAVAILABLE", "PREDICTIVE_UNCERTAINTY_EXCESSIVE"].includes(flag.code)
  );
  const hasDrawdownContextRisk = riskFlags.some((flag) =>
    flag.code === "DRAWDOWN_CONTEXT_UNAVAILABLE"
  );
  const hasDrawdownHalt = riskFlags.some((flag) => flag.code === "MAX_DRAWDOWN_REACHED");

  if (policy.requireMarketTimestamp && hasMarketDataRisk) {
    verdict = "WAIT";
    reasons.push("Market timestamp or market agreement is not safe for a live decision.");
  } else if (hasManualConfirmationRisk) {
    verdict = "WAIT";
    reasons.push("Lineup, roster, or injury evidence requires manual confirmation.");
  } else if (hasPredictiveUncertaintyRisk) {
    verdict = "WAIT";
    reasons.push("Observed predictive uncertainty is missing or exceeds the configured limit.");
  } else if (hasDrawdownContextRisk) {
    verdict = "WAIT";
    reasons.push("Drawdown cannot be verified from the authoritative settlement history.");
  } else if (hasDrawdownHalt) {
    verdict = "PASS";
    reasons.push("Registered drawdown or loss-streak limits halt new exposure.");
  } else if (!modelEvidence.validated) {
    verdict = "WAIT";
    reasons.push("Validated model-registry evidence is required before a BET verdict.");
  } else if (!priceDiscipline.minimumPrice.feasible) {
    verdict = "PASS";
    reasons.push("Configured stake and economic constraints cannot be satisfied at any price.");
  } else if (priceDiscipline.expired) {
    verdict = "WAIT";
    reasons.push("The recommendation expired before evaluation completed.");
  } else if (fairEdge <= policy.minFairEdge) {
    verdict = "PASS";
    reasons.push("Adjusted fair edge versus the no-vig market is below threshold.");
    riskFlags.push({
      code: "EDGE_BELOW_THRESHOLD",
      severity: "info",
      message: "Adjusted fair edge versus the no-vig market does not clear the minimum edge threshold."
    });
  } else if (!priceDiscipline.clearsMinimumPrice) {
    verdict = "PASS";
    reasons.push("Available odds are below the calculated minimum acceptable price.");
  } else if (roi <= policy.minEvRoi) {
    verdict = "PASS";
    reasons.push("Expected value versus offered odds is below threshold.");
    riskFlags.push({
      code: "EV_BELOW_THRESHOLD",
      severity: "info",
      message: "Expected value versus the offered odds does not clear the minimum ROI threshold."
    });
  } else if (kelly <= policy.minKellyFraction) {
    verdict = "PASS";
    reasons.push("Kelly fraction is below threshold.");
    riskFlags.push({
      code: "KELLY_BELOW_THRESHOLD",
      severity: "info",
      message: "Kelly fraction does not clear the minimum staking threshold."
    });
  } else if (recommendedStake <= policy.minStake) {
    verdict = "PASS";
    reasons.push("Recommended stake is below minimum.");
    riskFlags.push({
      code: "STAKE_BELOW_MINIMUM",
      severity: "info",
      message: "Recommended stake is below the configured minimum stake."
    });
  } else if (!portfolioRisk.passed) {
    const contextUnavailable = portfolioRisk.riskFlags.some(
      (flag) => flag.code === "PORTFOLIO_CONTEXT_UNAVAILABLE"
    );

    verdict = contextUnavailable ? "WAIT" : "PASS";
    reasons.push(contextUnavailable
      ? "Portfolio exposure cannot be verified from the authoritative ledger."
      : "Portfolio exposure or duplicate-position limits reject this recommendation.");
  } else if (riskFlags.some((flag) => flag.severity === "high")) {
    verdict = "WAIT";
    reasons.push("High-severity risk flags require manual confirmation.");
  } else {
    reasons.push("Edge, EV, Kelly, and risk gates all pass.");
  }

  return {
    verdict,
    reasons,
    marketIntelligence,
    rawModelProbability,
    independentModelProbability,
    probabilityUncertainty,
    adjustedModelProbability,
    adjustedProbability,
    marketProbability,
    impliedProbability,
    fairEdge,
    priceEdge,
    expectedValueRoi: roi,
    expectedValuePerDollar: roi,
    kellyFraction: kelly,
    recommendedStake,
    stakePolicy: policy,
    priceDiscipline,
    drawdownRisk,
    portfolioRisk,
    riskFlags,
    modelEvidence
  };
}

function parseIsoMs(value) {
  const ms = Date.parse(value ?? "");
  return Number.isFinite(ms) ? ms : null;
}

function sameGame(candidate, event) {
  const home = normalizeName(candidate.matchup.split(" at ").at(1));
  const away = normalizeName(candidate.matchup.split(" at ").at(0));
  const eventHome = normalizeName(event.homeTeam);
  const eventAway = normalizeName(event.awayTeam);
  const candidateStart = parseIsoMs(candidate.gameDate);
  const eventStart = parseIsoMs(event.commenceTime);
  const withinSixHours =
    candidateStart === null ||
    eventStart === null ||
    Math.abs(candidateStart - eventStart) <= 6 * 60 * 60 * 1000;

  return home === eventHome && away === eventAway && withinSixHours;
}

function mappedMarketKey(candidate) {
  return MLB_PROP_MARKETS[candidate.statKey] ?? null;
}

function sideMatches(outcomeName, lean) {
  return normalizeName(outcomeName) === normalizeName(lean);
}

function playerMatchDetail(outcome, playerName) {
  const player = normalizeName(playerName);
  const description = normalizeName(outcome.description);
  const name = normalizeName(outcome.name);

  if (!player) {
    return {
      matches: false,
      confidence: 0,
      method: "missing_player_name"
    };
  }

  if (description) {
    return {
      matches: description === player,
      confidence: description === player ? 1 : 0,
      method: description === player ? "exact_description" : "description_mismatch"
    };
  }

  return {
    matches: name === player,
    confidence: name === player ? 0.9 : 0,
    method: name === player ? "exact_name" : "name_mismatch"
  };
}

function playerMatches(outcome, playerName) {
  return playerMatchDetail(outcome, playerName).matches;
}

function pointMatches(outcomePoint, line) {
  return Number.isFinite(Number(outcomePoint)) && Math.abs(Number(outcomePoint) - Number(line)) < 0.001;
}

function isSharpBookmaker(bookmakerKey) {
  return ["pinnacle", "circa", "bookmaker", "betonlineag"].includes(String(bookmakerKey ?? "").toLowerCase());
}

function findOutcomePair(candidate, bookmaker) {
  const marketKey = mappedMarketKey(candidate);
  const market = bookmaker?.markets?.find((entry) => entry.key === marketKey);

  if (!market) {
    return null;
  }

  const marketOutcome = market.outcomes.find((outcome) => {
    const playerMatch = playerMatchDetail(outcome, candidate.player?.name);

    return sideMatches(outcome.name, candidate.lean) &&
      playerMatch.matches &&
      pointMatches(outcome.point, candidate.line);
  });

  if (!marketOutcome) {
    return null;
  }

  const oppositeOutcome = market.outcomes.find((outcome) =>
    !sideMatches(outcome.name, candidate.lean) &&
    playerMatches(outcome, candidate.player?.name) &&
    pointMatches(outcome.point, candidate.line)
  );
  const playerMatch = playerMatchDetail(marketOutcome, candidate.player?.name);

  return {
    market,
    marketOutcome,
    oppositeOutcome,
    playerMatch
  };
}

function offerTimestampStatus(lastUpdate, nowMs, maxMarketAgeMinutes) {
  if (!lastUpdate) {
    return "missing";
  }

  const updateMs = Date.parse(lastUpdate);

  if (!Number.isFinite(updateMs)) {
    return "invalid";
  }

  const ageMinutes = (nowMs - updateMs) / 60000;

  if (ageMinutes < 0) {
    return "future";
  }

  return ageMinutes <= maxMarketAgeMinutes ? "fresh" : "stale";
}

function findCandidatePrice(candidate, event, options = {}) {
  const marketKey = mappedMarketKey(candidate);
  const candidateBookmakers = Array.isArray(event?.bookmakers) && event.bookmakers.length > 0
    ? event.bookmakers
    : [event?.bookmaker].filter(Boolean);
  const bookmakerPairs = candidateBookmakers
    .map((bookmaker) => ({
      bookmaker,
      pair: findOutcomePair(candidate, bookmaker)
    }))
    .filter((entry) => entry.pair);
  const parsedNow = options.now instanceof Date ? options.now.getTime() : Date.parse(options.now ?? "");
  const nowMs = Number.isFinite(parsedNow) ? parsedNow : Date.now();
  const maxMarketAgeMinutes = Number.isFinite(Number(options.maxMarketAgeMinutes))
    ? Number(options.maxMarketAgeMinutes)
    : 10;
  const availableOffers = bookmakerPairs
    .map(({ bookmaker, pair }) => {
      const lastUpdate = pair.market.lastUpdate ?? bookmaker.lastUpdate ?? null;

      return {
        bookmaker: bookmaker.key,
        title: bookmaker.title,
        marketOdds: pair.marketOutcome.price,
        oppositeOdds: pair.oppositeOutcome?.price ?? null,
        lastUpdate,
        timestampStatus: offerTimestampStatus(lastUpdate, nowMs, maxMarketAgeMinutes),
        isSharp: isSharpBookmaker(bookmaker.key),
        bookmakerRecord: bookmaker,
        pair
      };
    })
    .sort((left, right) => {
      const priceDelta = Number(right.marketOdds) - Number(left.marketOdds);

      if (priceDelta !== 0) {
        return priceDelta;
      }

      return (Date.parse(right.lastUpdate ?? "") || 0) - (Date.parse(left.lastUpdate ?? "") || 0);
    });
  const freshOffers = availableOffers.filter((offer) => offer.timestampStatus === "fresh");
  const requiredBookmaker = typeof options.requiredBookmaker === "string"
    ? options.requiredBookmaker.trim().toLowerCase()
    : "";
  const primaryOffer = requiredBookmaker
    ? availableOffers.find((offer) => String(offer.bookmaker).toLowerCase() === requiredBookmaker) ?? null
    : freshOffers[0] ?? availableOffers[0] ?? null;

  if (!primaryOffer) {
    return null;
  }

  const consensus = availableOffers.map((offer) => ({
    bookmaker: offer.bookmaker,
    title: offer.title,
    marketOdds: offer.marketOdds,
    oppositeOdds: offer.oppositeOdds,
    lastUpdate: offer.lastUpdate,
    isSharp: offer.isSharp
  }));
  const primary = {
    bookmaker: primaryOffer.bookmakerRecord,
    pair: primaryOffer.pair
  };

  return {
    marketKey,
    selectionMethod: requiredBookmaker
      ? "required_bookmaker_price"
      : freshOffers.length > 0
        ? "best_fresh_available_price"
        : "best_available_price_unverified_freshness",
    freshOfferCount: freshOffers.length,
    availableOffers: availableOffers.map((offer) => ({
      bookmaker: offer.bookmaker,
      title: offer.title,
      marketOdds: offer.marketOdds,
      oppositeOdds: offer.oppositeOdds,
      lastUpdate: offer.lastUpdate,
      timestampStatus: offer.timestampStatus,
      isSharp: offer.isSharp
    })),
    bookmaker: primary.bookmaker
      ? {
          key: primary.bookmaker.key,
          title: primary.bookmaker.title,
          lastUpdate: primary.bookmaker.lastUpdate
        }
      : null,
    marketLastUpdate: primary.pair.market.lastUpdate,
    marketOdds: primary.pair.marketOutcome.price,
    oppositeOdds: primary.pair.oppositeOutcome?.price ?? null,
    point: primary.pair.marketOutcome.point,
    outcomeName: primary.pair.marketOutcome.name,
    outcomeDescription: primary.pair.marketOutcome.description,
    marketContext: {
      offeredLastUpdate: primary.pair.market.lastUpdate ?? primary.bookmaker.lastUpdate ?? null,
      consensus
    },
    match: {
      playerName: candidate.player?.name ?? null,
      outcomeDescription: primary.pair.marketOutcome.description ?? null,
      confidence: primary.pair.playerMatch.confidence,
      method: primary.pair.playerMatch.method
    }
  };
}

function riskScore(candidate) {
  const flags = candidate.riskFlags?.map((flag) => flag.code) ?? [];

  return flags.reduce((score, code) => {
    if (code === "MISSING_MARKET_ODDS") {
      return score;
    }

    if (code === "LINEUP_NOT_CONFIRMED") {
      return score + 2;
    }

    if (code === "HITTING_CONTEXT_LIMITED") {
      return score + 1;
    }

    return score + 1;
  }, 0);
}

function unpricedRankValue(candidate) {
  const probability = candidate.prediction?.uncertainty?.decisionProbability ??
    candidate.prediction?.modelProbability ??
    0;
  const pitcherBoost = candidate.statKey === "strikeOuts" ? 0.04 : 0;

  return probability + pitcherBoost - riskScore(candidate) * 0.025;
}

function cloneJson(value) {
  return JSON.parse(JSON.stringify(value));
}

function serializeCandidate(candidate, extra = {}) {
  const modelEvidence = extra.modelEvidence ?? resolveCandidateModelEvidence(
    candidate,
    extra.modelRegistryOptions
  );
  const ticketDraft = cloneJson(extra.ticketDraft ?? candidate.ticketDraft ?? null);
  const draftLeg = ticketDraft?.legs?.[0];

  if (draftLeg) {
    if (modelEvidence.modelId) {
      draftLeg.modelId = modelEvidence.modelId;
    }
    if (modelEvidence.modelVersion) {
      draftLeg.modelVersion = modelEvidence.modelVersion;
    }
    draftLeg.calibrationStatus = modelEvidence.callerCalibrationStatus;
  }

  return {
    id: candidate.id,
    status: extra.status ?? "price_check",
    sport: candidate.sport,
    provider: candidate.provider,
    gameId: candidate.gameId,
    gameDate: candidate.gameDate,
    matchup: candidate.matchup,
    selection: extra.selection ?? candidate.ticketDraft?.selection ?? null,
    player: candidate.player,
    marketType: candidate.marketType,
    statKey: candidate.statKey,
    statLabel: candidate.statLabel ?? candidate.statKey,
    lean: candidate.lean,
    line: candidate.line,
    modelProbability: candidate.prediction?.modelProbability ?? null,
    probabilityUncertainty: candidate.prediction?.uncertainty ?? null,
    fairAmericanOdds: candidate.prediction?.fairAmericanOdds ?? null,
    conservativeFairAmericanOdds: candidate.prediction?.conservativeFairAmericanOdds ?? null,
    impliedFairProbability: candidate.prediction?.fairAmericanOdds
      ? americanToImpliedProbability(candidate.prediction.fairAmericanOdds)
      : null,
    rankValue: extra.rankValue ?? unpricedRankValue(candidate),
    stats: candidate.stats,
    model: {
      modelId: modelEvidence.modelId ?? "unknown",
      modelVersion: modelEvidence.modelVersion ?? "unknown",
      marketFamily: modelEvidence.marketFamily,
      modelStatus: modelEvidence.registryStatus === "unknown"
        ? "research_only"
        : modelEvidence.registryStatus,
      probabilityMethod: candidate.prediction?.model ?? "unknown",
      calibrationReportId: modelEvidence.calibrationReportId,
      calibrationReportDigest: modelEvidence.calibrationReportDigest,
      policyVersion: modelEvidence.policyVersion,
      policyDigest: modelEvidence.policyDigest,
      trainingCutoff: candidate.prediction?.trainingCutoff ?? null,
      sampleSize: candidate.prediction?.sampleSize ?? null
    },
    modelEvidence,
    odds: extra.odds ?? null,
    evaluation: extra.evaluation ?? null,
    ticketDraft,
    riskFlags: extra.riskFlags ?? candidate.riskFlags ?? [],
    notes: extra.notes ?? candidate.prediction?.notes ?? []
  };
}

function rankUnpricedCandidates(candidates, limit, modelRegistryOptions) {
  return candidates
    .filter((candidate) => candidate.sport === "mlb" && mappedMarketKey(candidate))
    .map((candidate) => serializeCandidate(candidate, { modelRegistryOptions }))
    .sort((a, b) => {
      const riskDelta = riskScore({ riskFlags: a.riskFlags }) - riskScore({ riskFlags: b.riskFlags });

      return riskDelta !== 0 ? riskDelta : b.rankValue - a.rankValue;
    })
    .slice(0, limit);
}

async function fetchPricedEventsForCandidates(candidates, options) {
  const sportKey = "baseball_mlb";
  const eventsResult = await fetchOddsApiMarkets({
    sportKey,
    markets: "h2h",
    bookmakers: options.bookmakers,
    regions: options.regions,
    oddsFormat: "american",
    fetchJsonImpl: options.fetchJsonImpl,
    oddsApiKey: options.oddsApiKey
  });

  const candidateEvents = new Map();
  const maxEventsToPrice = Number.isInteger(options.maxEventsToPrice) && options.maxEventsToPrice > 0
    ? Math.min(options.maxEventsToPrice, 20)
    : 10;

  for (const candidate of candidates) {
    const event = eventsResult.events.find((entry) => sameGame(candidate, entry));

    if (event) {
      candidateEvents.set(candidate.gameId, event);
    }

    if (candidateEvents.size >= maxEventsToPrice) {
      break;
    }
  }

  const marketKeys = Array.from(new Set(candidates.map(mappedMarketKey).filter(Boolean))).join(",");
  const pricedEvents = new Map();
  const warnings = [...(eventsResult.warnings ?? [])];
  const maxOddsCreditsPerRefresh = Number.isFinite(options.maxOddsCreditsPerRefresh) && options.maxOddsCreditsPerRefresh > 0
    ? Math.min(Math.floor(options.maxOddsCreditsPerRefresh), 100)
    : 12;
  const reserveCredits = Number.isFinite(options.reserveOddsCredits) && options.reserveOddsCredits >= 0
    ? Math.floor(options.reserveOddsCredits)
    : 5;
  const eventCostEstimate = estimateOddsRequestCost({
    markets: marketKeys,
    bookmakers: options.bookmakers,
    regions: options.regions
  });
  const leagueCostEstimate = eventsResult.cache?.hit ? 0 : 1;
  const requestBudgetAfterLeague = Math.max(0, maxOddsCreditsPerRefresh - leagueCostEstimate);
  const providerCreditsAfterReserve = Number.isFinite(eventsResult.quota?.remainingCredits)
    ? Math.max(0, eventsResult.quota.remainingCredits - reserveCredits)
    : requestBudgetAfterLeague;
  const eventCreditBudget = Math.min(requestBudgetAfterLeague, providerCreditsAfterReserve);
  const maxEventsByBudget = Math.floor(eventCreditBudget / eventCostEstimate);
  const eventsToPrice = Array.from(candidateEvents.values()).slice(0, maxEventsByBudget);

  for (const event of eventsToPrice) {
    try {
      const propsResult = await fetchOddsApiEventMarkets({
        sportKey,
        eventId: event.id,
        markets: marketKeys,
        bookmakers: options.bookmakers,
        regions: options.regions,
        oddsFormat: "american",
        fetchJsonImpl: options.fetchJsonImpl,
        oddsApiKey: options.oddsApiKey
      });

      if (propsResult.event) {
        pricedEvents.set(event.id, propsResult.event);
      }

      warnings.push(...(propsResult.warnings ?? []));
    } catch (error) {
      warnings.push(`Event-level prop odds failed for ${event.awayTeam} at ${event.homeTeam}: ${error.message}`);
    }
  }

  if (candidateEvents.size > eventsToPrice.length) {
    warnings.push(
      `Odds credit budget limited this refresh to ${eventsToPrice.length} of ${candidateEvents.size} matched events.`
    );
  }

  return {
    status: eventsResult.status,
    eventsResult,
    pricedEvents,
    candidateEvents,
    warnings,
    usageBudget: {
      maxCreditsPerRefresh: maxOddsCreditsPerRefresh,
      reserveCredits,
      leagueCostEstimate,
      eventCostEstimate,
      matchedEvents: candidateEvents.size,
      eventsRequested: eventsToPrice.length,
      maximumEstimatedCost: leagueCostEstimate + eventsToPrice.length * eventCostEstimate
    }
  };
}

function evaluatePricedCandidate(candidate, price, options = {}) {
  const evaluation = evaluatePrice(candidate, price, options);
  const lifecycle = evaluateRecommendationLifecycle({
    recommendation: {
      id: candidate.id,
      line: candidate.line,
      odds: price,
      evaluation: {
        priceDiscipline: evaluation.priceDiscipline
      }
    },
    currentOffer: {
      sportsbook: price.bookmaker?.key ?? null,
      line: price.point,
      americanOdds: price.marketOdds,
      capturedAt: price.marketContext?.offeredLastUpdate ?? null,
      sourceVerified: true,
      marketStatus: "open"
    },
    changeSignals: options.changeSignals,
    now: options.now ?? new Date(),
    previousStatus: options.previousLifecycleStatus ?? null
  });
  const ticketDraft = cloneJson(candidate.ticketDraft);
  const leg = ticketDraft.legs[0];
  const legRiskFlags = (candidate.riskFlags ?? []).filter((flag) => flag.code !== "MISSING_MARKET_ODDS");

  leg.marketOdds = price.marketOdds;
  leg.correlationKey = `${candidate.sport}:${candidate.gameId}`;
  leg.riskFlags = legRiskFlags;
  leg.marketContext = price.marketContext;

  if (price.oppositeOdds === null || price.oppositeOdds === undefined) {
    delete leg.oppositeOdds;
  } else {
    leg.oppositeOdds = price.oppositeOdds;
  }

  ticketDraft.selection = `${candidate.ticketDraft.selection} at ${price.marketOdds > 0 ? "+" : ""}${price.marketOdds}`;

  const rankValue =
    (evaluation.verdict === "BET" ? 10 : evaluation.verdict === "WAIT" ? 4 : 0) +
    evaluation.expectedValueRoi +
    evaluation.priceEdge +
    evaluation.independentModelProbability -
    riskScore(candidate) * 0.25;

  return serializeCandidate(candidate, {
    status: "priced",
    selection: ticketDraft.selection,
    rankValue,
    odds: price,
    ticketDraft,
    modelEvidence: evaluation.modelEvidence,
    riskFlags: evaluation.riskFlags,
    evaluation: {
      verdict: evaluation.verdict,
      reasons: evaluation.reasons,
      marketIntelligence: evaluation.marketIntelligence,
      calibrationStatus: evaluation.modelEvidence.registryStatus,
      modelEvidence: evaluation.modelEvidence,
      rawModelProbability: evaluation.rawModelProbability,
      independentModelProbability: evaluation.independentModelProbability,
      probabilityUncertainty: evaluation.probabilityUncertainty,
      adjustedModelProbability: evaluation.adjustedModelProbability,
      adjustedProbability: evaluation.adjustedProbability,
      marketProbability: evaluation.marketProbability,
      impliedProbability: evaluation.impliedProbability,
      fairEdge: evaluation.fairEdge,
      priceEdge: evaluation.priceEdge,
      expectedValueRoi: evaluation.expectedValueRoi,
      expectedValuePerDollar: evaluation.expectedValuePerDollar,
      kellyFraction: evaluation.kellyFraction,
      recommendedStake: evaluation.recommendedStake,
      stakePolicy: evaluation.stakePolicy,
      priceDiscipline: evaluation.priceDiscipline,
      drawdownRisk: evaluation.drawdownRisk,
      portfolioRisk: evaluation.portfolioRisk,
      lifecycle,
      riskFlags: evaluation.riskFlags
    }
  });
}

async function getBestMlbTargets(options = {}) {
  const limit = Number.isInteger(options.limit) && options.limit > 0 ? Math.min(options.limit, 12) : 3;
  const maxCandidates = Number.isInteger(options.maxCandidates) && options.maxCandidates > 0
    ? Math.min(options.maxCandidates, 150)
    : 80;
  const modelRegistryOptions = prepareModelRegistryOptions({
    rootDir: options.rootDir,
    ...(options.modelRegistryOptions ?? {})
  });
  const evaluationOptions = { ...options, modelRegistryOptions };
  const candidatesResult = await generateResearchCandidates({
    date: options.date ?? "today",
    days: options.days ?? 2,
    sports: ["mlb"],
    maxCandidates,
    fetchJsonImpl: options.fetchJsonImpl,
    bankroll: options.bankroll ?? 1000
  });
  const oddsApiKey = resolveOddsApiKey(options);
  const eligibleCandidates = candidatesResult.candidates.filter((candidate) => mappedMarketKey(candidate));

  if (!oddsApiKey) {
    return {
      status: "odds_needed",
      fetchedAt: new Date().toISOString(),
      sourceMode: "official_stats_without_verified_odds",
      summary: {
        candidates: eligibleCandidates.length,
        pricedCandidates: 0,
        bestReturned: Math.min(limit, eligibleCandidates.length),
        oddsApiConfigured: false
      },
      best: rankUnpricedCandidates(eligibleCandidates, limit, modelRegistryOptions),
      candidates: candidatesResult,
      warnings: [
        "No THE_ODDS_API_KEY or ODDS_API_KEY is configured, so these are price-check targets, not BET calls."
      ]
    };
  }

  if (options.allowPaidOdds === false) {
    return {
      status: "odds_refresh_required",
      fetchedAt: new Date().toISOString(),
      sourceMode: "official_stats_awaiting_manual_odds_refresh",
      summary: {
        candidates: eligibleCandidates.length,
        pricedCandidates: 0,
        bestReturned: Math.min(limit, eligibleCandidates.length),
        oddsApiConfigured: true,
        paidOddsRequested: false,
        eventsMatched: 0,
        eventsPriced: 0
      },
      quota: quotaSnapshot(oddsApiKey),
      best: rankUnpricedCandidates(eligibleCandidates, limit, modelRegistryOptions),
      candidates: candidatesResult,
      warnings: [
        "Automatic candidate discovery does not spend odds credits. Use the manual Refresh Market Prices action for current market prices.",
        "These are price-check targets, not BET calls, until exact sportsbook lines and prices are verified."
      ]
    };
  }

  let pricing;

  try {
    pricing = await fetchPricedEventsForCandidates(eligibleCandidates, {
      ...options,
      oddsApiKey,
      bookmakers: options.bookmakers ?? DEFAULT_MLB_BOOKMAKERS,
      regions: options.regions ?? "us"
    });
  } catch (error) {
    return {
      status: "odds_error",
      fetchedAt: new Date().toISOString(),
      sourceMode: "official_stats_with_odds_provider_error",
      summary: {
        candidates: eligibleCandidates.length,
        pricedCandidates: 0,
        bestReturned: Math.min(limit, eligibleCandidates.length),
        oddsApiConfigured: true,
        paidOddsRequested: true,
        eventsMatched: 0,
        eventsPriced: 0
      },
      best: rankUnpricedCandidates(eligibleCandidates, limit, modelRegistryOptions),
      quota: quotaSnapshot(oddsApiKey),
      candidates: candidatesResult,
      warnings: [
        `Verified odds provider failed: ${safeErrorMessage(error)}`,
        "Showing price-check targets from official stats instead of priced BET calls."
      ]
    };
  }
  const priced = [];
  const unmatched = [];

  for (const candidate of eligibleCandidates) {
    const oddsEvent = pricing.candidateEvents.get(candidate.gameId);
    const pricedEvent = oddsEvent ? pricing.pricedEvents.get(oddsEvent.id) : null;
    const price = pricedEvent
      ? findCandidatePrice(candidate, pricedEvent, {
          now: options.now,
          maxMarketAgeMinutes:
            options.maxMarketAgeMinutes ?? candidate.ticketDraft?.livePolicy?.maxMarketAgeMinutes,
          requiredBookmaker: options.requiredBookmaker
        })
      : null;

    if (!price) {
      unmatched.push({
        candidateId: candidate.id,
        selection: candidate.ticketDraft.selection,
        reason: oddsEvent ? "No matching player/side/line in event-level prop odds." : "No matching odds event found."
      });
      continue;
    }

    priced.push(evaluatePricedCandidate(candidate, price, evaluationOptions));
  }

  const best = priced
    .sort((a, b) => b.rankValue - a.rankValue)
    .slice(0, limit);
  const fallbackBest = best.length > 0
    ? best
    : rankUnpricedCandidates(eligibleCandidates, limit, modelRegistryOptions);

  return {
    status: priced.length > 0 ? "priced" : "odds_unmatched",
    fetchedAt: new Date().toISOString(),
    sourceMode: "official_stats_plus_verified_odds",
    summary: {
      candidates: eligibleCandidates.length,
      pricedCandidates: priced.length,
      unmatchedCandidates: unmatched.length,
      bestReturned: fallbackBest.length,
      oddsApiConfigured: true,
      paidOddsRequested: true,
      eventsMatched: pricing.candidateEvents.size,
      eventsPriced: pricing.pricedEvents.size
    },
    best: fallbackBest,
    calibrationCandidates: priced,
    unmatched: unmatched.slice(0, 25),
    oddsSources: {
      eventsSourceUrl: pricing.eventsResult.sourceUrl,
      eventCount: pricing.eventsResult.eventCount,
      bookmaker: options.bookmakers ?? DEFAULT_MLB_BOOKMAKERS,
      bookmakers: options.bookmakers ?? DEFAULT_MLB_BOOKMAKERS
    },
    oddsUsageBudget: pricing.usageBudget,
    quota: quotaSnapshot(oddsApiKey),
    candidates: candidatesResult,
    warnings: Array.from(new Set([
      ...pricing.warnings,
      ...(priced.length === 0 ? ["No exact player/side/line prop prices matched; showing price-check targets instead."] : []),
      "Priced outputs are still decision support; verify live book screen before wagering."
    ]))
  };
}

module.exports = {
  DEFAULT_MLB_BOOKMAKERS,
  evaluatePrice,
  getBestMlbTargets,
  findCandidatePrice,
  mappedMarketKey,
  rankUnpricedCandidates
};
