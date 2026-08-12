const test = require("node:test");
const assert = require("node:assert/strict");

const {
  describeCausalEvidence,
  simulateBetCard
} = require("../src/live/probability-causality.js");

test("simulateBetCard returns deterministic full trial output", () => {
  const resultA = simulateBetCard({
    seed: "deterministic",
    iterations: 5,
    startingBankroll: 100,
    bets: [
      {
        id: "az",
        selection: "AZ moneyline",
        americanOdds: 127,
        stake: 1.55,
        fairProbability: 0.52313636,
        marketImpliedProbability: 0.4405
      },
      {
        id: "chc",
        selection: "CHC moneyline",
        americanOdds: 150,
        stake: 1.03,
        fairProbability: 0.472625,
        marketImpliedProbability: 0.4
      }
    ]
  });
  const resultB = simulateBetCard({
    seed: "deterministic",
    iterations: 5,
    startingBankroll: 100,
    bets: [
      {
        id: "az",
        selection: "AZ moneyline",
        americanOdds: 127,
        stake: 1.55,
        fairProbability: 0.52313636,
        marketImpliedProbability: 0.4405
      },
      {
        id: "chc",
        selection: "CHC moneyline",
        americanOdds: 150,
        stake: 1.03,
        fairProbability: 0.472625,
        marketImpliedProbability: 0.4
      }
    ]
  });

  assert.equal(resultA.trials.length, 5);
  assert.deepEqual(resultA.trials, resultB.trials);
  assert.equal(resultA.bets.length, 2);
  assert.equal(resultA.bets[0].causality.causalClaimAllowed, false);
  assert.equal(resultA.assumptions.causality.includes("not causal evidence"), true);
});

test("simulateBetCard stress scenarios reduce optimistic edge", () => {
  const fair = simulateBetCard({
    seed: "stress",
    iterations: 10,
    scenario: "fair",
    startingBankroll: 100,
    bets: [
      {
        selection: "Edge bet",
        americanOdds: 150,
        stake: 10,
        fairProbability: 0.5,
        marketImpliedProbability: 0.4
      }
    ]
  });
  const market = simulateBetCard({
    seed: "stress",
    iterations: 10,
    scenario: "market",
    startingBankroll: 100,
    bets: [
      {
        selection: "Edge bet",
        americanOdds: 150,
        stake: 10,
        fairProbability: 0.5,
        marketImpliedProbability: 0.4
      }
    ]
  });

  assert.ok(fair.expectedNetProfitPerTrial > market.expectedNetProfitPerTrial);
  assert.equal(market.bets[0].simulationProbability, 0.4);
});

test("describeCausalEvidence blocks unsupported causal claims", () => {
  const audit = describeCausalEvidence({
    selection: "AZ moneyline"
  });

  assert.equal(audit.causalClaimAllowed, false);
  assert.equal(audit.causalEvidenceGrade, "D_observational_predictive_only");
  assert.ok(audit.requiredForUpgrade.some((item) => item.includes("Backtest")));
});

test("an unmanifested simulation is explicitly excluded from Bear Edge evidence", () => {
  const result = simulateBetCard({
    seed: "unmanifested",
    iterations: 5,
    startingBankroll: 100,
    bets: [{
      selection: "Research-only moneyline",
      americanOdds: 105,
      stake: 1,
      fairProbability: 0.51,
      marketImpliedProbability: 0.4878
    }]
  });

  assert.deepEqual(result.evidenceClassification, {
    auditStatus: "UNLOGGED_RESEARCH_SIMULATION",
    mayCountAsBearEdgeEvidence: false,
    executionGrade: false,
    betCallPermission: "PRICE_CHECK_ONLY",
    authorizedStake: 0,
    executionVenue: null,
    reasons: [
      "A complete run manifest is required before a simulation can count as Bear Edge research evidence."
    ]
  });
});

test("a reproducible sportsbook simulation requires exact paired quote evidence", () => {
  assert.throws(
    () => simulateBetCard({
      seed: "paired-quote",
      iterations: 5,
      runManifest: {
        runId: "BE-TEST-PAIRED-QUOTE",
        executionVenue: "draftkings_sportsbook",
        codeVersion: "test-commit",
        inputSnapshotDigest: `sha256:${"a".repeat(64)}`,
        startedAt: "2026-07-22T23:14:48.000Z",
        seed: "paired-quote",
        model: {
          id: "joint_poisson_run_model",
          version: "1.0.0",
          calibrationStatus: "research_only"
        }
      },
      bets: [{
        selection: "Detroit moneyline",
        americanOdds: 105,
        stake: 1,
        fairProbability: 0.4904,
        marketImpliedProbability: 0.4878,
        source: {
          sportsbook: "draftkings",
          capturedAt: "2026-07-22T23:14:00.000Z"
        }
      }]
    }),
    /oppositeAmericanOdds is required/i
  );
});

test("DraftKings Predictions cannot use sportsbook American-odds payout math", () => {
  assert.throws(
    () => simulateBetCard({
      seed: "wrong-venue",
      iterations: 5,
      runManifest: {
        runId: "BE-TEST-WRONG-VENUE",
        executionVenue: "draftkings_predictions",
        codeVersion: "test-commit",
        inputSnapshotDigest: `sha256:${"b".repeat(64)}`,
        startedAt: "2026-07-22T23:14:48.000Z",
        seed: "wrong-venue",
        model: {
          id: "joint_poisson_run_model",
          version: "1.0.0",
          calibrationStatus: "research_only"
        }
      },
      bets: [{
        selection: "Detroit YES contract",
        americanOdds: 105,
        oppositeAmericanOdds: -120,
        stake: 1,
        fairProbability: 0.4904,
        marketImpliedProbability: 0.4878,
        source: {
          sportsbook: "draftkings",
          capturedAt: "2026-07-22T23:14:00.000Z"
        }
      }]
    }),
    /Predictions contracts require contract-price and fee-aware settlement math/i
  );
});

test("sportsbook evidence rejects a caller probability that contradicts the exact paired market", () => {
  assert.throws(
    () => simulateBetCard({
      seed: "contradictory-market",
      iterations: 5,
      runManifest: {
        runId: "BE-TEST-CONTRADICTORY-MARKET",
        executionVenue: "draftkings_sportsbook",
        codeVersion: "test-commit",
        inputSnapshotDigest: `sha256:${"e".repeat(64)}`,
        startedAt: "2026-07-22T23:14:48.000Z",
        seed: "contradictory-market",
        model: {
          id: "joint_poisson_run_model",
          version: "1.0.0",
          calibrationStatus: "research_only"
        }
      },
      bets: [{
        selection: "Detroit moneyline",
        americanOdds: 105,
        oppositeAmericanOdds: -120,
        stake: 1,
        fairProbability: 0.4904,
        marketImpliedProbability: 0.4878,
        source: {
          sportsbook: "draftkings",
          capturedAt: "2026-07-22T23:14:00.000Z"
        }
      }]
    }),
    /marketImpliedProbability must match the no-vig probability derived from the exact paired odds/i
  );
});

test("a complete sportsbook manifest is reproducible research but never bet authorization", () => {
  const result = simulateBetCard({
    seed: "reproducible",
    iterations: 5,
    startingBankroll: 100,
    runManifest: {
      runId: "BE-TEST-REPRODUCIBLE",
      executionVenue: "draftkings_sportsbook",
      codeVersion: "test-commit",
      inputSnapshotDigest: `sha256:${"c".repeat(64)}`,
      startedAt: "2026-07-22T23:14:48.000Z",
      seed: "reproducible",
      model: {
        id: "joint_poisson_run_model",
        version: "1.0.0",
        calibrationStatus: "research_only"
      }
    },
    bets: [{
      selection: "Detroit moneyline",
      americanOdds: 105,
      oppositeAmericanOdds: -120,
      stake: 1,
      fairProbability: 0.4904,
      source: {
        sportsbook: "draftkings",
        capturedAt: "2026-07-22T23:14:00.000Z"
      }
    }]
  });

  assert.equal(result.runManifest.runId, "BE-TEST-REPRODUCIBLE");
  assert.equal(result.bets[0].oppositeAmericanOdds, -120);
  assert.ok(Math.abs(result.bets[0].marketImpliedProbability - 0.4721) < 0.0001);
  assert.deepEqual(result.evidenceClassification, {
    auditStatus: "REPRODUCIBLE_RESEARCH_SIMULATION",
    mayCountAsBearEdgeEvidence: true,
    executionGrade: false,
    betCallPermission: "PRICE_CHECK_ONLY",
    authorizedStake: 0,
    executionVenue: "draftkings_sportsbook",
    reasons: [
      "Simulation evidence is reproducible research only; it cannot authorize a wager.",
      "The attached model is not validated."
    ]
  });
});

test("a historical research fixture can be reproducible without pretending to be a sportsbook quote", () => {
  const result = simulateBetCard({
    seed: "fixture-seed",
    iterations: 3,
    runManifest: {
      runId: "BE-HISTORICAL-FIXTURE",
      executionVenue: "research_fixture",
      codeVersion: "test-commit",
      inputSnapshotDigest: `sha256:${"d".repeat(64)}`,
      startedAt: "2026-07-22T23:14:48.000Z",
      seed: "fixture-seed",
      model: {
        id: "operator_probability_input",
        version: "1.0.0",
        calibrationStatus: "research_only"
      }
    },
    bets: [{
      selection: "Historical fixture",
      americanOdds: 127,
      stake: 1,
      fairProbability: 0.52,
      marketImpliedProbability: 0.44
    }]
  });

  assert.equal(result.evidenceClassification.executionVenue, "research_fixture");
  assert.equal(result.evidenceClassification.mayCountAsBearEdgeEvidence, true);
  assert.equal(result.evidenceClassification.executionGrade, false);
  assert.equal(result.evidenceClassification.authorizedStake, 0);
});
