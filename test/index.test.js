const test = require("node:test");
const assert = require("node:assert/strict");

const {
  americanToDecimal,
  americanToImpliedProbability,
  normalizeTwoWayNoVig,
  getTwoWayNoVigProbabilities,
  shrinkProbabilityTowardMarket,
  calculateExpectedValue,
  calculateKellyFraction,
  applyStakeCaps,
  createDecisionLogTemplate,
  evaluateBetDecision,
  validateBetInput
} = require("../src/index.js");

function almostEqual(actual, expected, epsilon = 1e-9) {
  assert.ok(Math.abs(actual - expected) <= epsilon, `Expected ${actual} to be close to ${expected}`);
}

test("american odds convert to decimal odds", () => {
  almostEqual(americanToDecimal(+150), 2.5);
  almostEqual(americanToDecimal(-120), 1.8333333333333335);
});

test("american odds convert to implied probability", () => {
  almostEqual(americanToImpliedProbability(+150), 0.4);
  almostEqual(americanToImpliedProbability(-120), 0.5454545454545454);
});

test("american odds handle extreme favorites and longshots", () => {
  almostEqual(americanToDecimal(+10000), 101);
  almostEqual(americanToDecimal(-10000), 1.01);
  almostEqual(americanToImpliedProbability(+10000), 0.009900990099009901);
  almostEqual(americanToImpliedProbability(-10000), 0.9900990099009901);
});

test("two-way no-vig normalization sums to one", () => {
  const normalized = normalizeTwoWayNoVig(0.55, 0.5);

  almostEqual(normalized.sideA + normalized.sideB, 1);
  almostEqual(normalized.sideA, 0.5238095238095238);
});

test("two-way no-vig probabilities can be derived from market odds", () => {
  const market = getTwoWayNoVigProbabilities(-110, -110);

  almostEqual(market.impliedA, 0.5238095238095238);
  almostEqual(market.noVigA, 0.5);
  almostEqual(market.noVigB, 0.5);
});

test("asymmetric two-way market reports fair probabilities and vig", () => {
  const market = getTwoWayNoVigProbabilities(-120, +110);

  almostEqual(market.impliedA, 0.5454545454545454);
  almostEqual(market.impliedB, 0.47619047619047616);
  almostEqual(market.marketVig, 0.021645021645021578);
  almostEqual(market.noVigA + market.noVigB, 1);
  almostEqual(market.noVigA, 0.5338983050847458);
  almostEqual(market.noVigB, 0.4661016949152542);
});

test("probability shrinkage blends model and market views", () => {
  almostEqual(shrinkProbabilityTowardMarket(0.6, 0.5, 0.25), 0.575);
});

test("expected value returns roi and expected profit", () => {
  const result = calculateExpectedValue({
    winProbability: 0.55,
    americanOdds: +120,
    stake: 50
  });

  almostEqual(result.decimalOdds, 2.2);
  almostEqual(result.expectedProfit, 10.5);
  almostEqual(result.roi, 0.21);
});

test("expected value and Kelly reject invalid decimal odds", () => {
  assert.throws(
    () => calculateExpectedValue({ winProbability: 0.5, decimalOdds: 1 }),
    /decimalOdds must be greater than 1/
  );
  assert.throws(
    () => calculateKellyFraction({ winProbability: 0.5, decimalOdds: 0.5 }),
    /decimalOdds must be greater than 1/
  );
});

test("kelly returns zero for negative edge and positive value for good edge", () => {
  const noEdge = calculateKellyFraction({
    winProbability: 0.45,
    americanOdds: -110
  });
  const plusEdge = calculateKellyFraction({
    winProbability: 0.55,
    americanOdds: +120
  });

  assert.equal(noEdge.fraction, 0);
  almostEqual(plusEdge.rawFraction, 0.175);
  almostEqual(plusEdge.fraction, 0.175);
});

test("stake caps shrink Kelly stake to configured limits", () => {
  const result = applyStakeCaps({
    bankroll: 1000,
    kellyFraction: 0.2,
    kellyMultiplier: 0.5,
    maxStake: 60,
    maxBankrollFraction: 0.04
  });

  almostEqual(result.uncappedStake, 100);
  almostEqual(result.recommendedStake, 40);
  assert.deepEqual(result.cappedBy, ["maxStake", "maxBankrollFraction"]);
});

test("decision log template is clone-safe", () => {
  const templateA = createDecisionLogTemplate();
  const templateB = createDecisionLogTemplate();

  templateA.reasons.push("A");

  assert.equal(templateB.reasons.length, 0);
});

test("verdict is WAIT when injury information is stale", () => {
  const result = evaluateBetDecision({
    selection: "Knicks ML",
    marketOdds: +140,
    oppositeOdds: -155,
    modelProbability: 0.5,
    bankroll: 1000,
    injuryDataAgeMinutes: 200,
    maxInjuryAgeMinutes: 90
  });

  assert.equal(result.verdict, "WAIT");
  assert.ok(result.riskFlags.some((flag) => flag.code === "STALE_INJURY"));
});

test("stale injury WAIT gate blocks an otherwise bettable setup", () => {
  const result = evaluateBetDecision({
    selection: "Healthy line but stale news",
    marketOdds: +120,
    oppositeOdds: -135,
    modelProbability: 0.59,
    bankroll: 2500,
    injuryDataAgeMinutes: 120,
    maxInjuryAgeMinutes: 90,
    marketWeight: 0.2,
    thresholds: {
      minEdge: 0.01,
      minEvRoi: 0.01,
      minKellyFraction: 0.01
    },
    stakePolicy: {
      kellyMultiplier: 0.25,
      maxStake: 150,
      maxBankrollFraction: 0.05,
      minStake: 5
    }
  });

  assert.equal(result.verdict, "WAIT");
  assert.ok(result.edge > 0.01);
  assert.ok(result.expectedValue.roi > 0.01);
});

test("fresh injury information can be 0 minutes old", () => {
  const result = evaluateBetDecision({
    selection: "Immediate update",
    marketOdds: +120,
    oppositeOdds: -135,
    modelProbability: 0.59,
    bankroll: 2500,
    injuryDataAgeMinutes: 0,
    maxInjuryAgeMinutes: 90,
    marketWeight: 0.2,
    thresholds: {
      minEdge: 0.01,
      minEvRoi: 0.01,
      minKellyFraction: 0.01
    },
    stakePolicy: {
      kellyMultiplier: 0.25,
      maxStake: 150,
      maxBankrollFraction: 0.05,
      minStake: 5
    }
  });

  assert.equal(result.verdict, "BET");
});

test("verdict is PASS when tilt lock is active", () => {
  const result = evaluateBetDecision({
    selection: "Celtics -3.5",
    marketOdds: -110,
    oppositeOdds: -110,
    modelProbability: 0.56,
    bankroll: 1000,
    tiltLocked: true
  });

  assert.equal(result.verdict, "PASS");
  assert.ok(result.riskFlags.some((flag) => flag.code === "TILT_LOCK"));
});

test("tilt lock PASS gate takes priority over stale injury WAIT", () => {
  const result = evaluateBetDecision({
    selection: "Tilt lock precedence",
    marketOdds: +120,
    oppositeOdds: -135,
    modelProbability: 0.59,
    bankroll: 2500,
    injuryDataAgeMinutes: 300,
    maxInjuryAgeMinutes: 90,
    tiltLocked: true,
    marketWeight: 0.2,
    thresholds: {
      minEdge: 0.01,
      minEvRoi: 0.01,
      minKellyFraction: 0.01
    },
    stakePolicy: {
      kellyMultiplier: 0.25,
      maxStake: 150,
      maxBankrollFraction: 0.05,
      minStake: 5
    }
  });

  assert.equal(result.verdict, "PASS");
  assert.ok(result.riskFlags.some((flag) => flag.code === "TILT_LOCK"));
  assert.ok(result.riskFlags.some((flag) => flag.code === "STALE_INJURY"));
});

test("verdict is PASS when parlay is requested", () => {
  const result = evaluateBetDecision({
    selection: "Two-leg parlay",
    marketOdds: +220,
    oppositeOdds: -260,
    modelProbability: 0.4,
    bankroll: 1000,
    isParlay: true
  });

  assert.equal(result.verdict, "PASS");
  assert.ok(result.riskFlags.some((flag) => flag.code === "PARLAY_REJECTED"));
});

test("parlay rejection blocks an otherwise profitable setup", () => {
  const result = evaluateBetDecision({
    selection: "Profitable parlay",
    marketOdds: +120,
    oppositeOdds: -135,
    modelProbability: 0.59,
    bankroll: 2500,
    isParlay: true,
    marketWeight: 0.2,
    thresholds: {
      minEdge: 0.01,
      minEvRoi: 0.01,
      minKellyFraction: 0.01
    },
    stakePolicy: {
      kellyMultiplier: 0.25,
      maxStake: 150,
      maxBankrollFraction: 0.05,
      minStake: 5
    }
  });

  assert.equal(result.verdict, "PASS");
  assert.ok(result.edge > 0.01);
  assert.ok(result.expectedValue.roi > 0.01);
  assert.ok(result.riskFlags.some((flag) => flag.code === "PARLAY_REJECTED"));
});

test("verdict is PASS when correlation risk is detected", () => {
  const result = evaluateBetDecision({
    selection: "Same-game side and team total",
    marketOdds: +135,
    oppositeOdds: -150,
    modelProbability: 0.5,
    bankroll: 1000,
    hasCorrelationRisk: true
  });

  assert.equal(result.verdict, "PASS");
  assert.ok(result.riskFlags.some((flag) => flag.code === "CORRELATION_RISK"));
});

test("negative EV is rejected even when fair edge versus no-vig market is positive", () => {
  const result = evaluateBetDecision({
    selection: "Vig trap favorite",
    marketOdds: -120,
    oppositeOdds: +110,
    modelProbability: 0.542,
    bankroll: 1000,
    marketWeight: 0,
    thresholds: {
      minEdge: 0.005,
      minEvRoi: 0,
      minKellyFraction: 0
    },
    stakePolicy: {
      kellyMultiplier: 0.25,
      maxStake: 100,
      maxBankrollFraction: 0.05,
      minStake: 1
    }
  });

  assert.equal(result.verdict, "PASS");
  assert.ok(result.fairEdge > 0);
  assert.ok(result.priceEdge < 0);
  assert.ok(result.expectedValue.roi < 0);
  assert.ok(result.riskFlags.some((flag) => flag.code === "EV_BELOW_THRESHOLD"));
  assert.equal(result.decisionLog.metrics.fairEdge, result.fairEdge);
  assert.equal(result.decisionLog.metrics.priceEdge, result.priceEdge);
});

test("negative EV thresholds cannot be configured to permit negative-EV bets", () => {
  assert.throws(() => validateBetInput({
    selection: "Invalid negative threshold",
    marketOdds: -110,
    oppositeOdds: -110,
    modelProbability: 0.5,
    bankroll: 1000,
    thresholds: { minEvRoi: -0.01 }
  }), (error) => /** @type {any} */ (error).issues.some((issue) =>
    issue.path === "thresholds.minEvRoi" && issue.message === "Must be >= 0."
  ));

  assert.throws(
    () => evaluateBetDecision({
      selection: "Invalid negative threshold",
      marketOdds: -110,
      oppositeOdds: -110,
      modelProbability: 0.5,
      bankroll: 1000,
      thresholds: { minEvRoi: -0.01 }
    }),
    /thresholds\.minEvRoi must be 0 or greater/
  );
});

test("zero edge, zero EV, and zero Kelly never qualify as a bet at the boundary", () => {
  const result = evaluateBetDecision({
    selection: "Exact break-even boundary",
    marketOdds: -110,
    oppositeOdds: -110,
    modelProbability: 0.5,
    bankroll: 1000,
    marketWeight: 1,
    thresholds: {
      minEdge: 0,
      minEvRoi: 0,
      minKellyFraction: 0
    },
    stakePolicy: {
      kellyMultiplier: 0.25,
      maxStake: 100,
      maxBankrollFraction: 0.05,
      minStake: 0
    }
  });

  assert.equal(result.verdict, "PASS");
  assert.ok(result.riskFlags.some((flag) => flag.code === "EDGE_BELOW_THRESHOLD"));
});

test("zero recommended stake never qualifies as a bet", () => {
  const result = evaluateBetDecision({
    selection: "Zero stake guard",
    marketOdds: 120,
    oppositeOdds: -135,
    modelProbability: 0.75,
    bankroll: 1000,
    marketWeight: 0,
    thresholds: {
      minEdge: 0,
      minEvRoi: 0,
      minKellyFraction: 0
    },
    stakePolicy: {
      kellyMultiplier: 0.25,
      maxBankrollFraction: 0,
      minStake: 0
    }
  });

  assert.equal(result.verdict, "PASS");
  assert.equal(result.stakeRecommendation.recommendedStake, 0);
  assert.ok(result.riskFlags.some((flag) => flag.code === "STAKE_BELOW_MINIMUM"));
});

test("verdict is BET when edge, EV, and Kelly all clear thresholds", () => {
  const result = evaluateBetDecision({
    selection: "Lakers ML",
    marketOdds: +120,
    oppositeOdds: -135,
    modelProbability: 0.59,
    bankroll: 2500,
    marketWeight: 0.2,
    thresholds: {
      minEdge: 0.01,
      minEvRoi: 0.01,
      minKellyFraction: 0.01
    },
    stakePolicy: {
      kellyMultiplier: 0.25,
      maxStake: 150,
      maxBankrollFraction: 0.05,
      minStake: 5
    }
  });

  assert.equal(result.verdict, "BET");
  assert.ok(result.edge > 0.01);
  assert.ok(result.expectedValue.roi > 0.01);
  assert.ok(result.kelly.fraction > 0.01);
  assert.ok(result.stakeRecommendation.recommendedStake >= 5);
  almostEqual(
    result.decisionLog.metrics.appliedKellyFraction,
    result.stakeRecommendation.recommendedStake / 2500
  );
  assert.equal(result.decisionLog.verdict, "BET");
});

test("verdict is PASS when edge does not clear threshold", () => {
  const result = evaluateBetDecision({
    selection: "Marginal edge",
    marketOdds: -110,
    oppositeOdds: -110,
    modelProbability: 0.515,
    bankroll: 1000
  });

  assert.equal(result.verdict, "PASS");
  assert.ok(result.riskFlags.some((flag) => flag.code === "EDGE_BELOW_THRESHOLD"));
});
