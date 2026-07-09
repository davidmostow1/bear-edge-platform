const { generateResearchCandidates } = require("./candidates.js");
const { fetchOddsApiEventMarkets, fetchOddsApiMarkets, resolveOddsApiKey } = require("./odds-api.js");

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
  const marketWeight = candidate.ticketDraft.livePolicy?.marketWeight ?? 0.35;
  const marketProbability = noVigProbability(price.marketOdds, price.oppositeOdds);
  const adjustedProbability = shrinkProbability(
    candidate.prediction.modelProbability,
    marketProbability,
    marketWeight
  );
  const impliedProbability = americanToImpliedProbability(price.marketOdds);
  const priceEdge = adjustedProbability - impliedProbability;
  const fairEdge = adjustedProbability - marketProbability;
  const roi = expectedValueRoi(adjustedProbability, price.marketOdds);
  const kelly = kellyFraction(adjustedProbability, price.marketOdds);
  const policy = {
    kellyMultiplier: candidate.ticketDraft.livePolicy?.kellyMultiplier ?? 0.12,
    maxBankrollFraction: candidate.ticketDraft.livePolicy?.maxBankrollFraction ?? 0.015,
    maxStake: Math.max(5, bankroll * 0.015),
    minStake: candidate.ticketDraft.livePolicy?.minStake ?? 5
  };
  const rawStake = bankroll * kelly * policy.kellyMultiplier;
  const recommendedStake = Math.min(rawStake, policy.maxStake, bankroll * policy.maxBankrollFraction);
  const riskFlags = [];
  const reasons = [];

  for (const flag of candidate.riskFlags ?? []) {
    if (flag.code !== "MISSING_MARKET_ODDS") {
      riskFlags.push(flag);
    }
  }

  let verdict = "BET";

  if (fairEdge < 0.01) {
    verdict = "PASS";
    reasons.push("Adjusted fair edge versus the no-vig market is below threshold.");
    riskFlags.push({
      code: "EDGE_BELOW_THRESHOLD",
      severity: "info",
      message: "Adjusted fair edge versus the no-vig market does not clear the minimum edge threshold."
    });
  } else if (roi < 0.01) {
    verdict = "PASS";
    reasons.push("Expected value versus offered odds is below threshold.");
    riskFlags.push({
      code: "EV_BELOW_THRESHOLD",
      severity: "info",
      message: "Expected value versus the offered odds does not clear the minimum ROI threshold."
    });
  } else if (kelly < 0.001) {
    verdict = "PASS";
    reasons.push("Kelly fraction is below threshold.");
    riskFlags.push({
      code: "KELLY_BELOW_THRESHOLD",
      severity: "info",
      message: "Kelly fraction does not clear the minimum staking threshold."
    });
  } else if (recommendedStake < policy.minStake) {
    verdict = "PASS";
    reasons.push("Recommended stake is below minimum.");
    riskFlags.push({
      code: "STAKE_BELOW_MINIMUM",
      severity: "info",
      message: "Recommended stake is below the configured minimum stake."
    });
  } else if (riskFlags.some((flag) => flag.severity === "high")) {
    verdict = "WAIT";
    reasons.push("High-severity risk flags require manual confirmation.");
  } else {
    reasons.push("Edge, EV, Kelly, and risk gates all pass.");
  }

  return {
    verdict,
    reasons,
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
    riskFlags
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

function playerMatches(outcome, playerName) {
  const player = normalizeName(playerName);
  const description = normalizeName(outcome.description);
  const name = normalizeName(outcome.name);

  return description === player || name === player || description.includes(player) || name.includes(player);
}

function pointMatches(outcomePoint, line) {
  return Number.isFinite(Number(outcomePoint)) && Math.abs(Number(outcomePoint) - Number(line)) < 0.001;
}

function findCandidatePrice(candidate, event) {
  const marketKey = mappedMarketKey(candidate);
  const bookmaker = event?.bookmaker;
  const market = bookmaker?.markets?.find((entry) => entry.key === marketKey);

  if (!market) {
    return null;
  }

  const marketOutcome = market.outcomes.find((outcome) =>
    sideMatches(outcome.name, candidate.lean) &&
    playerMatches(outcome, candidate.player?.name) &&
    pointMatches(outcome.point, candidate.line)
  );

  if (!marketOutcome) {
    return null;
  }

  const oppositeOutcome = market.outcomes.find((outcome) =>
    !sideMatches(outcome.name, candidate.lean) &&
    playerMatches(outcome, candidate.player?.name) &&
    pointMatches(outcome.point, candidate.line)
  );

  return {
    marketKey,
    bookmaker: bookmaker
      ? {
          key: bookmaker.key,
          title: bookmaker.title,
          lastUpdate: bookmaker.lastUpdate
        }
      : null,
    marketLastUpdate: market.lastUpdate,
    marketOdds: marketOutcome.price,
    oppositeOdds: oppositeOutcome?.price ?? null,
    point: marketOutcome.point,
    outcomeName: marketOutcome.name,
    outcomeDescription: marketOutcome.description
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
  const probability = candidate.prediction?.modelProbability ?? 0;
  const pitcherBoost = candidate.statKey === "strikeOuts" ? 0.04 : 0;

  return probability + pitcherBoost - riskScore(candidate) * 0.025;
}

function serializeCandidate(candidate, extra = {}) {
  return {
    id: candidate.id,
    status: extra.status ?? "price_check",
    matchup: candidate.matchup,
    gameDate: candidate.gameDate,
    player: candidate.player,
    marketType: candidate.marketType,
    statKey: candidate.statKey,
    statLabel: candidate.statLabel ?? candidate.statKey,
    lean: candidate.lean,
    line: candidate.line,
    modelProbability: candidate.prediction?.modelProbability ?? null,
    fairAmericanOdds: candidate.prediction?.fairAmericanOdds ?? null,
    impliedFairProbability: candidate.prediction?.fairAmericanOdds
      ? americanToImpliedProbability(candidate.prediction.fairAmericanOdds)
      : null,
    rankValue: extra.rankValue ?? unpricedRankValue(candidate),
    riskFlags: candidate.riskFlags ?? [],
    stats: candidate.stats,
    odds: extra.odds ?? null,
    evaluation: extra.evaluation ?? null,
    notes: extra.notes ?? candidate.prediction?.notes ?? []
  };
}

function rankUnpricedCandidates(candidates, limit) {
  return candidates
    .filter((candidate) => candidate.sport === "mlb" && mappedMarketKey(candidate))
    .map((candidate) => serializeCandidate(candidate))
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

  for (const event of candidateEvents.values()) {
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

  return {
    status: eventsResult.status,
    eventsResult,
    pricedEvents,
    candidateEvents,
    warnings
  };
}

function evaluatePricedCandidate(candidate, price, options = {}) {
  const evaluation = evaluatePrice(candidate, price, options);

  const rankValue =
    (evaluation.verdict === "BET" ? 10 : evaluation.verdict === "WAIT" ? 4 : 0) +
    evaluation.expectedValueRoi +
    evaluation.priceEdge +
    candidate.prediction.modelProbability -
    riskScore(candidate) * 0.25;

  return serializeCandidate(candidate, {
    status: "priced",
    rankValue,
    odds: price,
    evaluation: {
      verdict: evaluation.verdict,
      reasons: evaluation.reasons,
      adjustedProbability: evaluation.adjustedProbability,
      priceEdge: evaluation.priceEdge,
      expectedValueRoi: evaluation.expectedValueRoi,
      expectedValuePerDollar: evaluation.expectedValuePerDollar,
      kellyFraction: evaluation.kellyFraction,
      recommendedStake: evaluation.recommendedStake,
      stakePolicy: evaluation.stakePolicy,
      riskFlags: evaluation.riskFlags
    }
  });
}

async function getBestMlbTargets(options = {}) {
  const limit = Number.isInteger(options.limit) && options.limit > 0 ? Math.min(options.limit, 12) : 3;
  const maxCandidates = Number.isInteger(options.maxCandidates) && options.maxCandidates > 0
    ? Math.min(options.maxCandidates, 150)
    : 80;
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
      best: rankUnpricedCandidates(eligibleCandidates, limit),
      candidates: candidatesResult,
      warnings: [
        "No THE_ODDS_API_KEY or ODDS_API_KEY is configured, so these are price-check targets, not BET calls."
      ]
    };
  }

  const pricing = await fetchPricedEventsForCandidates(eligibleCandidates, {
    ...options,
    oddsApiKey,
    bookmakers: options.bookmakers ?? "draftkings",
    regions: options.regions ?? "us"
  });
  const priced = [];
  const unmatched = [];

  for (const candidate of eligibleCandidates) {
    const oddsEvent = pricing.candidateEvents.get(candidate.gameId);
    const pricedEvent = oddsEvent ? pricing.pricedEvents.get(oddsEvent.id) : null;
    const price = pricedEvent ? findCandidatePrice(candidate, pricedEvent) : null;

    if (!price) {
      unmatched.push({
        candidateId: candidate.id,
        selection: candidate.ticketDraft.selection,
        reason: oddsEvent ? "No matching player/side/line in event-level prop odds." : "No matching odds event found."
      });
      continue;
    }

    priced.push(evaluatePricedCandidate(candidate, price, options));
  }

  const best = priced
    .sort((a, b) => b.rankValue - a.rankValue)
    .slice(0, limit);

  return {
    status: priced.length > 0 ? "priced" : "odds_unmatched",
    fetchedAt: new Date().toISOString(),
    sourceMode: "official_stats_plus_verified_odds",
    summary: {
      candidates: eligibleCandidates.length,
      pricedCandidates: priced.length,
      unmatchedCandidates: unmatched.length,
      bestReturned: best.length,
      oddsApiConfigured: true,
      eventsMatched: pricing.candidateEvents.size,
      eventsPriced: pricing.pricedEvents.size
    },
    best,
    unmatched: unmatched.slice(0, 25),
    oddsSources: {
      eventsSourceUrl: pricing.eventsResult.sourceUrl,
      eventCount: pricing.eventsResult.eventCount,
      bookmaker: options.bookmakers ?? "draftkings"
    },
    candidates: candidatesResult,
    warnings: Array.from(new Set([
      ...pricing.warnings,
      "Priced outputs are still decision support; verify live book screen before wagering."
    ]))
  };
}

module.exports = {
  getBestMlbTargets,
  findCandidatePrice,
  mappedMarketKey,
  rankUnpricedCandidates
};
