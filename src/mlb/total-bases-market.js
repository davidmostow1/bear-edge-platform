const {
  applyStakeCaps,
  calculateExpectedValue,
  calculateKellyFraction,
  getTwoWayNoVigProbabilities,
  shrinkProbabilityTowardMarket
} = require("../index.js");
const {
  simulateTotalBasesMarket
} = require("./total-bases-simulator.js");

const EXECUTION_BOOK = "DraftKings";
const DEFAULT_MARKET_WEIGHT = 0.75;
const DEFAULT_REQUIRED_EV_ROI = 0.04;

function assertFiniteNumber(value, name) {
  if (typeof value !== "number" || !Number.isFinite(value)) {
    throw new TypeError(`${name} must be a finite number.`);
  }
}

function assertAmericanOdds(value, name) {
  assertFiniteNumber(value, name);
  if (value === 0 || Math.abs(value) < 100) {
    throw new RangeError(`${name} must be valid American odds.`);
  }
}

function probabilityToAmerican(probability) {
  assertFiniteNumber(probability, "probability");
  if (probability <= 0 || probability >= 1) {
    throw new RangeError("probability must be greater than 0 and less than 1.");
  }

  const odds = probability >= 0.5
    ? -100 * probability / (1 - probability)
    : 100 * (1 - probability) / probability;
  return Math.round(odds);
}

function decimalToAmerican(decimalOdds) {
  assertFiniteNumber(decimalOdds, "decimalOdds");
  if (decimalOdds <= 1) {
    throw new RangeError("decimalOdds must be greater than 1.");
  }

  const odds = decimalOdds >= 2
    ? (decimalOdds - 1) * 100
    : -100 / (decimalOdds - 1);
  return Math.round(odds);
}

function selectThreshold(simulation, threshold) {
  const row = simulation.thresholds.find((candidate) => candidate.threshold === threshold);
  if (!row) {
    throw new Error(`Simulation did not produce threshold ${threshold}.`);
  }
  return row;
}

function deriveVerdict({ lineupConfirmed, expectedValueRoi, requiredEvRoi }) {
  if (!lineupConfirmed) {
    return "WAIT";
  }
  if (expectedValueRoi >= requiredEvRoi) {
    return "BET";
  }
  if (expectedValueRoi > 0) {
    return "LEAN";
  }
  return "PASS";
}

function evaluateTotalBasesCandidate(input = {}) {
  if (input.gameStatus !== "pregame") {
    throw new Error("Total-bases evaluator supports pregame markets only.");
  }
  if (input.sportsbook !== EXECUTION_BOOK) {
    throw new Error(`sportsbook must be ${EXECUTION_BOOK}.`);
  }
  if (input.draftKingsOdds === null || input.draftKingsOdds === undefined) {
    throw new Error("draftKingsOdds is required.");
  }
  if (input.oppositeOdds === null || input.oppositeOdds === undefined) {
    throw new Error("oppositeOdds is required for paired no-vig evaluation.");
  }

  const threshold = Number(input.threshold);
  const side = String(input.side ?? "").toLowerCase();
  const draftKingsOdds = Number(input.draftKingsOdds);
  const oppositeOdds = Number(input.oppositeOdds);
  const bankroll = Number(input.bankroll);
  const marketWeight = Number(input.marketWeight ?? DEFAULT_MARKET_WEIGHT);
  const requiredEvRoi = Number(input.requiredEvRoi ?? DEFAULT_REQUIRED_EV_ROI);

  assertFiniteNumber(threshold, "threshold");
  if (side !== "over" && side !== "under") {
    throw new Error("side must be over or under.");
  }
  assertAmericanOdds(draftKingsOdds, "draftKingsOdds");
  assertAmericanOdds(oppositeOdds, "oppositeOdds");
  assertFiniteNumber(bankroll, "bankroll");
  if (bankroll <= 0) {
    throw new RangeError("bankroll must be greater than 0.");
  }
  assertFiniteNumber(marketWeight, "marketWeight");
  if (marketWeight < 0 || marketWeight > 1) {
    throw new RangeError("marketWeight must be between 0 and 1.");
  }
  assertFiniteNumber(requiredEvRoi, "requiredEvRoi");
  if (requiredEvRoi < 0) {
    throw new RangeError("requiredEvRoi must be non-negative.");
  }

  const simulation = simulateTotalBasesMarket({
    seed: input.seed,
    iterations: input.iterations,
    plateAppearances: input.plateAppearances,
    outcomeProbabilities: input.outcomeProbabilities,
    thresholds: [threshold]
  });
  const thresholdResult = selectThreshold(simulation, threshold);
  const rawModelProbability = side === "over"
    ? thresholdResult.overProbability
    : thresholdResult.underProbability;
  const pairedMarket = getTwoWayNoVigProbabilities(draftKingsOdds, oppositeOdds);
  const noVigMarketProbability = pairedMarket.noVigA;
  const adjustedProbability = shrinkProbabilityTowardMarket(
    rawModelProbability,
    noVigMarketProbability,
    marketWeight
  );
  const expectedValue = calculateExpectedValue({
    winProbability: adjustedProbability,
    americanOdds: draftKingsOdds,
    stake: 1
  });
  const kelly = calculateKellyFraction({
    winProbability: adjustedProbability,
    americanOdds: draftKingsOdds
  });
  const stakeDiagnostic = applyStakeCaps({
    bankroll,
    kellyFraction: kelly.fraction,
    kellyMultiplier: 0.25,
    maxBankrollFraction: 0.01
  });
  const minimumDecimalForRequiredEv = (1 + requiredEvRoi) / adjustedProbability;
  const maximumAcceptableAmericanOdds = decimalToAmerican(minimumDecimalForRequiredEv);
  const fairAmericanOdds = probabilityToAmerican(adjustedProbability);
  const lineupConfirmed = input.lineupConfirmed === true;
  const riskFlags = [];

  if (!lineupConfirmed) {
    riskFlags.push("LINEUP_UNCONFIRMED");
  }
  riskFlags.push("SHADOW_MODE_ONLY");

  return {
    modelVersion: simulation.modelVersion,
    executionBook: EXECUTION_BOOK,
    eventId: input.eventId ?? null,
    playerId: input.playerId ?? null,
    playerName: input.playerName ?? null,
    matchup: input.matchup ?? null,
    capturedAt: input.capturedAt ?? null,
    gameStatus: input.gameStatus,
    lineupConfirmed,
    battingOrderSlot: input.battingOrderSlot ?? null,
    threshold,
    side,
    draftKingsOdds,
    oppositeOdds,
    simulation,
    rawModelProbability,
    noVigMarketProbability,
    adjustedProbability,
    marketVig: pairedMarket.marketVig,
    fairAmericanOdds,
    probabilityEdge: adjustedProbability - noVigMarketProbability,
    expectedValueRoi: expectedValue.roi,
    rawKellyFraction: kelly.fraction,
    quarterKellyFraction: kelly.fraction * 0.25,
    diagnosticStake: stakeDiagnostic.recommendedStake,
    authorizedStake: 0,
    maximumAcceptableAmericanOdds,
    requiredEvRoi,
    verdict: deriveVerdict({
      lineupConfirmed,
      expectedValueRoi: expectedValue.roi,
      requiredEvRoi
    }),
    riskFlags,
    authorization: "PRICE_CHECK_ONLY"
  };
}

module.exports = {
  EXECUTION_BOOK,
  evaluateTotalBasesCandidate,
  probabilityToAmerican
};
