const DEFAULT_ITERATIONS = 100;
const DEFAULT_SCENARIO = "fair";
const DEFAULT_SEED = "bear-edge";
const SUPPORTED_SCENARIOS = new Set(["fair", "half_edge", "adverse_three_points", "market"]);
const SUPPORTED_EXECUTION_VENUES = new Set([
  "draftkings_sportsbook",
  "draftkings_predictions",
  "research_fixture"
]);
const SUPPORTED_CALIBRATION_STATUSES = new Set(["research_only", "shadow", "validated", "retired"]);

function isFiniteNumber(value) {
  return typeof value === "number" && Number.isFinite(value);
}

function assertProbability(value, name) {
  if (!isFiniteNumber(value) || value < 0 || value > 1) {
    throw new RangeError(`${name} must be a number between 0 and 1.`);
  }
}

function assertPositiveNumber(value, name) {
  if (!isFiniteNumber(value) || value <= 0) {
    throw new RangeError(`${name} must be a positive number.`);
  }
}

function isPlainObject(value) {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function requiredString(value, name) {
  if (typeof value !== "string" || !value.trim()) {
    throw new Error(`${name} is required.`);
  }

  return value.trim();
}

function requiredTimestamp(value, name) {
  const normalized = requiredString(value, name);

  if (!Number.isFinite(Date.parse(normalized))) {
    throw new Error(`${name} must be a valid timestamp.`);
  }

  return normalized;
}

function normalizeRunManifest(input, seed) {
  if (input === undefined || input === null) {
    return null;
  }

  if (!isPlainObject(input)) {
    throw new TypeError("runManifest must be an object.");
  }

  const executionVenue = requiredString(input.executionVenue, "runManifest.executionVenue");

  if (!SUPPORTED_EXECUTION_VENUES.has(executionVenue)) {
    throw new Error(
      `runManifest.executionVenue must be one of: ${Array.from(SUPPORTED_EXECUTION_VENUES).join(", ")}.`
    );
  }

  if (executionVenue === "draftkings_predictions") {
    throw new Error(
      "DraftKings Predictions contracts require contract-price and fee-aware settlement math; " +
      "the American-odds sportsbook simulator cannot evaluate them."
    );
  }

  const manifestSeed = requiredString(input.seed, "runManifest.seed");

  if (manifestSeed !== String(seed)) {
    throw new Error("runManifest.seed must match the simulation seed.");
  }

  const inputSnapshotDigest = requiredString(
    input.inputSnapshotDigest,
    "runManifest.inputSnapshotDigest"
  );

  if (!/^sha256:[a-f0-9]{64}$/i.test(inputSnapshotDigest)) {
    throw new Error("runManifest.inputSnapshotDigest must be a sha256 digest.");
  }

  if (!isPlainObject(input.model)) {
    throw new TypeError("runManifest.model must be an object.");
  }

  const calibrationStatus = requiredString(
    input.model.calibrationStatus,
    "runManifest.model.calibrationStatus"
  );

  if (!SUPPORTED_CALIBRATION_STATUSES.has(calibrationStatus)) {
    throw new Error(
      `runManifest.model.calibrationStatus must be one of: ${Array.from(SUPPORTED_CALIBRATION_STATUSES).join(", ")}.`
    );
  }

  return {
    runId: requiredString(input.runId, "runManifest.runId"),
    executionVenue,
    codeVersion: requiredString(input.codeVersion, "runManifest.codeVersion"),
    inputSnapshotDigest: inputSnapshotDigest.toLowerCase(),
    startedAt: requiredTimestamp(input.startedAt, "runManifest.startedAt"),
    seed: manifestSeed,
    model: {
      id: requiredString(input.model.id, "runManifest.model.id"),
      version: requiredString(input.model.version, "runManifest.model.version"),
      calibrationStatus
    }
  };
}

function validateSportsbookEvidence(input, index, runManifest) {
  if (!runManifest || runManifest.executionVenue !== "draftkings_sportsbook") {
    return;
  }

  const oppositeAmericanOdds = Number(input.oppositeAmericanOdds);

  if (!isFiniteNumber(oppositeAmericanOdds) || oppositeAmericanOdds === 0) {
    throw new Error(`bets[${index}].oppositeAmericanOdds is required for reproducible sportsbook evidence.`);
  }

  if (!isPlainObject(input.source)) {
    throw new Error(`bets[${index}].source is required for reproducible sportsbook evidence.`);
  }

  const sportsbook = requiredString(input.source.sportsbook, `bets[${index}].source.sportsbook`).toLowerCase();

  if (sportsbook !== "draftkings") {
    throw new Error(`bets[${index}].source.sportsbook must be draftkings for this execution venue.`);
  }

  const capturedAt = requiredTimestamp(input.source.capturedAt, `bets[${index}].source.capturedAt`);

  if (Date.parse(capturedAt) > Date.parse(runManifest.startedAt)) {
    throw new Error(`bets[${index}].source.capturedAt cannot be after runManifest.startedAt.`);
  }
}

function classifySimulationEvidence(runManifest) {
  if (!runManifest) {
    return {
      auditStatus: "UNLOGGED_RESEARCH_SIMULATION",
      mayCountAsBearEdgeEvidence: false,
      executionGrade: false,
      betCallPermission: "PRICE_CHECK_ONLY",
      authorizedStake: 0,
      executionVenue: null,
      reasons: [
        "A complete run manifest is required before a simulation can count as Bear Edge research evidence."
      ]
    };
  }

  const reasons = [
    "Simulation evidence is reproducible research only; it cannot authorize a wager."
  ];

  if (runManifest.model.calibrationStatus !== "validated") {
    reasons.push("The attached model is not validated.");
  }

  return {
    auditStatus: "REPRODUCIBLE_RESEARCH_SIMULATION",
    mayCountAsBearEdgeEvidence: true,
    executionGrade: false,
    betCallPermission: "PRICE_CHECK_ONLY",
    authorizedStake: 0,
    executionVenue: runManifest.executionVenue,
    reasons
  };
}

function americanToDecimal(americanOdds) {
  if (!isFiniteNumber(americanOdds) || americanOdds === 0) {
    throw new RangeError("americanOdds must be a non-zero finite number.");
  }

  return americanOdds > 0 ? 1 + americanOdds / 100 : 1 + 100 / Math.abs(americanOdds);
}

function americanToImpliedProbability(americanOdds) {
  if (!isFiniteNumber(americanOdds) || americanOdds === 0) {
    throw new RangeError("americanOdds must be a non-zero finite number.");
  }

  return americanOdds > 0 ? 100 / (americanOdds + 100) : Math.abs(americanOdds) / (Math.abs(americanOdds) + 100);
}

function pairedNoVigProbability(americanOdds, oppositeAmericanOdds) {
  const selectedProbability = americanToImpliedProbability(americanOdds);
  const oppositeProbability = americanToImpliedProbability(oppositeAmericanOdds);

  return selectedProbability / (selectedProbability + oppositeProbability);
}

function round(value, digits = 6) {
  if (!isFiniteNumber(value)) {
    return null;
  }

  const factor = 10 ** digits;
  return Math.round(value * factor) / factor;
}

function hashSeed(seed) {
  let hash = 2166136261;
  const value = String(seed ?? DEFAULT_SEED);

  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }

  return hash >>> 0;
}

function createSeededRandom(seed = DEFAULT_SEED) {
  let state = hashSeed(seed);

  return function random() {
    state += 0x6d2b79f5;
    let value = state;
    value = Math.imul(value ^ (value >>> 15), value | 1);
    value ^= value + Math.imul(value ^ (value >>> 7), value | 61);
    return ((value ^ (value >>> 14)) >>> 0) / 4294967296;
  };
}

function normalizeBet(input, index, runManifest) {
  if (!input || typeof input !== "object") {
    throw new TypeError(`bets[${index}] must be an object.`);
  }

  const selection = String(input.selection ?? input.name ?? "").trim();
  const americanOdds = Number(input.americanOdds ?? input.odds);
  const stake = Number(input.stake);
  const fairProbability = Number(input.fairProbability ?? input.estimatedFairProbability);

  if (!selection) {
    throw new Error(`bets[${index}].selection is required.`);
  }

  if (!isFiniteNumber(americanOdds) || americanOdds === 0) {
    throw new RangeError(`bets[${index}].americanOdds must be a non-zero finite number.`);
  }

  assertPositiveNumber(stake, `bets[${index}].stake`);
  assertProbability(fairProbability, `bets[${index}].fairProbability`);
  validateSportsbookEvidence(input, index, runManifest);

  let marketImpliedProbability;

  if (runManifest?.executionVenue === "draftkings_sportsbook") {
    const pairedProbability = pairedNoVigProbability(americanOdds, Number(input.oppositeAmericanOdds));

    if (input.marketImpliedProbability !== undefined) {
      const suppliedProbability = Number(input.marketImpliedProbability);
      assertProbability(suppliedProbability, `bets[${index}].marketImpliedProbability`);

      if (Math.abs(suppliedProbability - pairedProbability) > 0.0001) {
        throw new Error(
          `bets[${index}].marketImpliedProbability must match the no-vig probability derived from the exact paired odds.`
        );
      }
    }

    marketImpliedProbability = pairedProbability;
  } else {
    marketImpliedProbability = input.marketImpliedProbability === undefined
      ? americanToImpliedProbability(americanOdds)
      : Number(input.marketImpliedProbability);
    assertProbability(marketImpliedProbability, `bets[${index}].marketImpliedProbability`);
  }

  const decimalOdds = americanToDecimal(americanOdds);
  const profitIfWin = stake * (decimalOdds - 1);
  const expectedNetProfit = fairProbability * profitIfWin - (1 - fairProbability) * stake;
  const edge = fairProbability - marketImpliedProbability;

  return {
    id: String(input.id ?? `bet_${index + 1}`),
    selection,
    matchup: input.matchup ?? null,
    marketType: input.marketType ?? input.market_type ?? null,
    marketName: input.marketName ?? input.market_name ?? null,
    americanOdds,
    oppositeAmericanOdds: input.oppositeAmericanOdds === undefined
      ? null
      : Number(input.oppositeAmericanOdds),
    decimalOdds,
    stake,
    fairProbability,
    marketImpliedProbability,
    probabilityEdge: edge,
    expectedNetProfit,
    expectedRoiOnStake: expectedNetProfit / stake,
    profitIfWin,
    lossIfLose: stake,
    source: input.source ?? null,
    evidence: input.evidence ?? null
  };
}

function scenarioProbability(bet, scenario) {
  if (scenario === "fair") {
    return bet.fairProbability;
  }

  if (scenario === "half_edge") {
    return bet.marketImpliedProbability + (bet.fairProbability - bet.marketImpliedProbability) * 0.5;
  }

  if (scenario === "adverse_three_points") {
    return Math.max(0, bet.fairProbability - 0.03);
  }

  if (scenario === "market") {
    return bet.marketImpliedProbability;
  }

  throw new Error(`Unsupported probability scenario: ${scenario}`);
}

function describeCausalEvidence(bet) {
  const warnings = [
    "No randomized assignment or natural experiment is attached to this bet.",
    "A positive edge is a predictive claim, not proof that the selected features caused the result.",
    "Outcome evaluation must avoid look-ahead bias by using only information timestamped before the wager."
  ];
  const requiredForUpgrade = [
    "Store every board snapshot before the bet with timestamp, sportsbook, market, line, price, and bankroll.",
    "Store ex-ante features only: starting pitchers, lineup confirmation, weather, park, bullpen usage, rest, travel, injuries, and closing line.",
    "Backtest the same rule on out-of-sample historical slates before increasing stake caps.",
    "Track closing-line value separately from win/loss because single-game outcomes are noisy.",
    "Run calibration checks by probability bucket and market type before trusting fair probabilities."
  ];

  return {
    selection: bet.selection,
    causalClaimAllowed: false,
    causalEvidenceGrade: "D_observational_predictive_only",
    identificationStrategy: "observational_market_plus_model_snapshot",
    warnings,
    requiredForUpgrade
  };
}

function summarize(values) {
  const sorted = [...values].sort((left, right) => left - right);
  const total = values.reduce((sum, value) => sum + value, 0);
  const mean = total / values.length;
  const variance = values.reduce((sum, value) => sum + (value - mean) ** 2, 0) / values.length;
  const percentile = (p) => {
    const position = (sorted.length - 1) * p;
    const lower = Math.floor(position);
    const upper = Math.ceil(position);

    if (lower === upper) {
      return sorted[lower];
    }

    return sorted[lower] + (sorted[upper] - sorted[lower]) * (position - lower);
  };

  return {
    mean,
    median: percentile(0.5),
    standardDeviation: Math.sqrt(variance),
    minimum: sorted[0],
    maximum: sorted[sorted.length - 1],
    p05: percentile(0.05),
    p25: percentile(0.25),
    p75: percentile(0.75),
    p95: percentile(0.95)
  };
}

function simulateBetCard(input = {}) {
  const iterations = Number(input.iterations ?? DEFAULT_ITERATIONS);
  const seed = input.seed ?? DEFAULT_SEED;
  const scenario = String(input.scenario ?? DEFAULT_SCENARIO);
  const startingBankroll = Number(input.startingBankroll ?? input.bankroll ?? 0);
  const runManifest = normalizeRunManifest(input.runManifest, seed);
  const bets = (Array.isArray(input.bets) ? input.bets : []).map((bet, index) => (
    normalizeBet(bet, index, runManifest)
  ));

  if (bets.length === 0) {
    throw new Error("At least one bet is required.");
  }

  if (!Number.isInteger(iterations) || iterations <= 0) {
    throw new RangeError("iterations must be a positive integer.");
  }

  if (!SUPPORTED_SCENARIOS.has(scenario)) {
    throw new Error(`scenario must be one of: ${Array.from(SUPPORTED_SCENARIOS).join(", ")}.`);
  }

  if (!isFiniteNumber(startingBankroll) || startingBankroll < 0) {
    throw new RangeError("startingBankroll must be a non-negative finite number.");
  }

  const random = createSeededRandom(seed);
  const scenarioBets = bets.map((bet) => ({
    ...bet,
    simulationProbability: scenarioProbability(bet, scenario)
  }));
  const trials = [];

  for (let trialNumber = 1; trialNumber <= iterations; trialNumber += 1) {
    const outcomes = [];
    let netProfit = 0;
    let amountStaked = 0;

    for (const bet of scenarioBets) {
      const randomDraw = random();
      const won = randomDraw < bet.simulationProbability;
      const betNetProfit = won ? bet.profitIfWin : -bet.lossIfLose;

      amountStaked += bet.stake;
      netProfit += betNetProfit;
      outcomes.push({
        betId: bet.id,
        selection: bet.selection,
        randomDraw: round(randomDraw, 12),
        simulationProbability: round(bet.simulationProbability, 8),
        won,
        stake: round(bet.stake, 2),
        netProfit: round(betNetProfit, 2)
      });
    }

    trials.push({
      trialNumber,
      amountStaked: round(amountStaked, 2),
      netProfit: round(netProfit, 2),
      returnOnStake: round(netProfit / amountStaked, 6),
      endingBankroll: round(startingBankroll + netProfit, 2),
      outcomes
    });
  }

  const netProfits = trials.map((trial) => trial.netProfit);
  const trialSummary = summarize(netProfits);
  const amountStakedPerTrial = scenarioBets.reduce((sum, bet) => sum + bet.stake, 0);
  const expectedNetProfitPerTrial = scenarioBets.reduce(
    (sum, bet) => sum + (bet.simulationProbability * bet.profitIfWin - (1 - bet.simulationProbability) * bet.lossIfLose),
    0
  );
  const betSummaries = scenarioBets.map((bet) => {
    const outcomes = trials.map((trial) => trial.outcomes.find((outcome) => outcome.betId === bet.id)).filter(Boolean);
    const wins = outcomes.filter((outcome) => outcome.won).length;
    const losses = outcomes.length - wins;
    const netProfit = outcomes.reduce((sum, outcome) => sum + outcome.netProfit, 0);

    return {
      id: bet.id,
      selection: bet.selection,
      americanOdds: bet.americanOdds,
      oppositeAmericanOdds: bet.oppositeAmericanOdds,
      stake: round(bet.stake, 2),
      fairProbability: round(bet.fairProbability, 8),
      marketImpliedProbability: round(bet.marketImpliedProbability, 8),
      simulationProbability: round(bet.simulationProbability, 8),
      probabilityEdge: round(bet.probabilityEdge, 8),
      expectedNetProfit: round(
        bet.simulationProbability * bet.profitIfWin - (1 - bet.simulationProbability) * bet.lossIfLose,
        4
      ),
      expectedRoiOnStake: round(
        (bet.simulationProbability * bet.profitIfWin - (1 - bet.simulationProbability) * bet.lossIfLose) / bet.stake,
        6
      ),
      simulatedWins: wins,
      simulatedLosses: losses,
      simulatedWinRate: round(wins / outcomes.length, 6),
      simulatedNetProfit: round(netProfit, 2),
      causality: describeCausalEvidence(bet)
    };
  });

  return {
    generatedAt: new Date().toISOString(),
    runManifest,
    evidenceClassification: classifySimulationEvidence(runManifest),
    seed: String(seed),
    iterations,
    scenario,
    startingBankroll: round(startingBankroll, 2),
    amountStakedPerTrial: round(amountStakedPerTrial, 2),
    expectedNetProfitPerTrial: round(expectedNetProfitPerTrial, 4),
    expectedReturnOnStake: round(expectedNetProfitPerTrial / amountStakedPerTrial, 6),
    probabilityOfPositiveTrial: round(trials.filter((trial) => trial.netProfit > 0).length / trials.length, 6),
    probabilityOfLosingTrial: round(trials.filter((trial) => trial.netProfit < 0).length / trials.length, 6),
    summary: {
      meanNetProfit: round(trialSummary.mean, 4),
      medianNetProfit: round(trialSummary.median, 4),
      standardDeviationNetProfit: round(trialSummary.standardDeviation, 4),
      minimumNetProfit: round(trialSummary.minimum, 2),
      maximumNetProfit: round(trialSummary.maximum, 2),
      percentile05NetProfit: round(trialSummary.p05, 2),
      percentile25NetProfit: round(trialSummary.p25, 2),
      percentile75NetProfit: round(trialSummary.p75, 2),
      percentile95NetProfit: round(trialSummary.p95, 2)
    },
    bets: betSummaries,
    assumptions: {
      independence: "Each bet outcome is sampled independently because no empirical cross-game correlation matrix is attached.",
      probabilitySource: "Simulation probabilities come from ex-ante Bear Edge fair probability fields, with optional stress scenarios.",
      causality: "Simulation is predictive risk analysis. It is not causal evidence that any factor caused a win or loss.",
      stakeSizing: "Stake and payout math use sportsbook American odds only. DraftKings Predictions contract fees and settlement are not modeled here."
    },
    trials
  };
}

module.exports = {
  americanToDecimal,
  americanToImpliedProbability,
  createSeededRandom,
  describeCausalEvidence,
  simulateBetCard
};
