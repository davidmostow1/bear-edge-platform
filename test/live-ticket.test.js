const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { spawnSync } = require("node:child_process");

const { evaluateLiveTicket } = require("../src/live/evaluate-live-ticket.js");
const { parseArgs: parseEvaluateLiveArgs } = require("../src/cli/evaluate-live.js");
const { LiveDataCache } = require("../src/live/cache.js");
const { fetchJson } = require("../src/live/fixture-fetch.js");
const { evaluateLiveLeg } = require("../src/live/estimate-prop.js");
const { validateLiveTicket } = require("../src/validate-live-ticket.js");

function freshMarketContext() {
  return {
    offeredLastUpdate: new Date().toISOString()
  };
}

test("validateLiveTicket accepts a 2-leg alt-prop parlay", () => {
  const ticket = /** @type {any} */ (validateLiveTicket({
    kind: "parlay",
    selection: "2-leg alt parlay",
    bankroll: 1000,
    legs: [
      {
        id: "leg-a",
        provider: "mlb",
        marketType: "alt-prop",
        side: "over",
        line: 1.5,
        marketOdds: 120,
        modelProbabilityOverride: 0.58,
        source: { playerId: 1, statGroup: "hitting", statKey: "totalBases" }
      },
      {
        id: "leg-b",
        provider: "nhl",
        marketType: "alt-prop",
        side: "over",
        line: 1.5,
        marketOdds: 125,
        source: { playerId: 2, statKey: "points" }
      }
    ]
  }));

  assert.equal(ticket.kind, "parlay");
  assert.equal(ticket.legs.length, 2);
  assert.equal(ticket.legs[0].modelProbabilityOverride, 0.58);
  assert.equal(ticket.legs[0].calibrationStatus, "research_only");
});

test("validateLiveTicket preserves and validates parlay-level staking controls", () => {
  const ticket = /** @type {any} */ (validateLiveTicket({
    kind: "parlay",
    bankroll: 1000,
    minEvRoi: 0.02,
    minKellyFraction: 0.01,
    minStake: 2,
    kellyMultiplier: 0.15,
    maxStake: 25,
    maxBankrollFraction: 0.01,
    legs: [
      {
        id: "leg-a",
        provider: "mlb",
        marketType: "prop",
        side: "over",
        line: 0.5,
        marketOdds: 120,
        source: { playerId: 1, statGroup: "hitting", statKey: "runs" }
      },
      {
        id: "leg-b",
        provider: "nhl",
        marketType: "prop",
        side: "over",
        line: 0.5,
        marketOdds: 120,
        source: { playerId: 2, statKey: "points" }
      }
    ]
  }));

  assert.equal(ticket.minEvRoi, 0.02);
  assert.equal(ticket.minKellyFraction, 0.01);
  assert.equal(ticket.minStake, 2);
  assert.equal(ticket.kellyMultiplier, 0.15);
  assert.equal(ticket.maxStake, 25);
  assert.equal(ticket.maxBankrollFraction, 0.01);
  assert.equal(ticket.livePolicy.minEvRoi, 0.02);
  assert.equal(ticket.livePolicy.minKellyFraction, 0.01);
  assert.equal(ticket.livePolicy.minStake, 2);
  assert.equal(ticket.livePolicy.kellyMultiplier, 0.15);
  assert.equal(ticket.livePolicy.maxStake, 25);
  assert.equal(ticket.livePolicy.maxBankrollFraction, 0.01);
});

test("evaluateLiveTicket waits for an unvalidated probability override", async () => {
  const ticket = validateLiveTicket({
    kind: "single",
    bankroll: 1000,
    legs: [
      {
        id: "unvalidated-override",
        provider: "mlb",
        marketType: "prop",
        side: "over",
        line: 0.5,
        marketOdds: 120,
        modelProbabilityOverride: 0.7,
        marketContext: freshMarketContext(),
        source: { playerId: 1, statGroup: "hitting", statKey: "runs" }
      }
    ]
  });

  const result = await evaluateLiveTicket(ticket, { fetchJsonImpl: fetchJson });

  assert.equal(result.verdict, "WAIT");
  assert.ok(result.riskFlags.some((flag) => flag.code === "MODEL_CALIBRATION_REQUIRED"));
});

test("caller-supplied validated status cannot override a research-only registry entry", async () => {
  const ticket = validateLiveTicket({
    kind: "single",
    bankroll: 1000,
    legs: [
      {
        id: "forged-calibration-status",
        provider: "mlb",
        marketType: "prop",
        side: "over",
        line: 0.5,
        marketOdds: 120,
        modelProbabilityOverride: 0.9,
        calibrationStatus: "validated",
        modelId: "poisson_count_v1",
        modelVersion: "1.0.0",
        marketContext: freshMarketContext(),
        source: { playerId: 1, statGroup: "hitting", statKey: "runs" }
      }
    ]
  });

  const result = await evaluateLiveTicket(ticket, { fetchJsonImpl: fetchJson });
  const calibrationGate = result.decisionLog.gateResults.find((gate) => (
    gate.gate === "model_calibration"
  ));

  assert.equal(result.verdict, "WAIT");
  assert.ok(result.riskFlags.some((flag) => flag.code === "MODEL_CALIBRATION_REQUIRED"));
  assert.deepEqual(result.modelEvidence, {
    modelId: "poisson_count_v1",
    modelVersion: "1.0.0",
    marketFamily: "batter_runs_scored",
    callerCalibrationStatus: "validated",
    probabilitySource: "caller_probability_override",
    registryStatus: "research_only",
    policyVersion: "1.0.0",
    policyDigest: "bb8f5bd702648894e8e21be04d6d08024645821d83c4bbacb40c872657830df7",
    calibrationReportId: null,
    calibrationReportDigest: null,
    validated: false
  });
  assert.equal(calibrationGate.passed, false);
  assert.equal(calibrationGate.reasonCode, "MODEL_CALIBRATION_REQUIRED");
  assert.deepEqual(calibrationGate.evidence, result.modelEvidence);
  assert.equal(result.decisionLog.model.modelId, "operator_probability_input");
  assert.equal(result.decisionLog.model.probabilityMethod, "operator_supplied_market_adjusted");
});

test("internal probability calculations ignore caller-supplied model identity", async () => {
  const ticket = validateLiveTicket({
    kind: "single",
    bankroll: 1000,
    legs: [{
      id: "forged-internal-model-identity",
      provider: "mlb",
      marketType: "prop",
      side: "over",
      line: 0.5,
      marketOdds: 120,
      calibrationStatus: "validated",
      modelId: "caller_selected_model",
      modelVersion: "999.0.0",
      marketContext: freshMarketContext(),
      source: { playerId: 1, statGroup: "hitting", statKey: "runs" }
    }]
  });

  const result = /** @type {any} */ (await evaluateLiveTicket(ticket, { fetchJsonImpl: fetchJson }));

  assert.equal(result.verdict, "WAIT");
  assert.equal(result.modelEvidence.modelId, "poisson_count_v1");
  assert.equal(result.modelEvidence.modelVersion, "1.0.0");
  assert.equal(result.modelEvidence.probabilitySource, "registered_internal_implementation");
  assert.equal(result.modelEvidence.registryStatus, "research_only");
  assert.equal(result.modelEvidence.validated, false);
});

test("evaluateLiveLeg waits for a future statistics timestamp", () => {
  const ticket = validateLiveTicket({
    kind: "single",
    bankroll: 1000,
    legs: [
      {
        id: "future-source",
        provider: "mlb",
        marketType: "prop",
        side: "over",
        line: 0.5,
        marketOdds: 120,
        calibrationStatus: "validated",
        modelProbabilityOverride: 0.7,
        marketContext: freshMarketContext(),
        source: { playerId: 1, statGroup: "hitting", statKey: "runs" }
      }
    ]
  });
  const snapshot = {
    fetchedAt: new Date(Date.now() + 60_000).toISOString(),
    season: { perGame: 1 },
    recent: { perGame: 1 },
    liveGame: null
  };

  const result = evaluateLiveLeg(ticket.legs[0], snapshot, {
    bankroll: ticket.bankroll,
    livePolicy: ticket.livePolicy
  });

  assert.equal(result.verdict, "WAIT");
  assert.ok(result.riskFlags.some((flag) => flag.code === "FUTURE_SOURCE_TIMESTAMP"));
});

test("validateLiveTicket rejects attempts to disable model calibration", () => {
  assert.throws(
    () => validateLiveTicket({
      kind: "single",
      bankroll: 1000,
      livePolicy: { requireCalibratedModel: false },
      legs: [{
        id: "calibration-bypass",
        provider: "mlb",
        marketType: "prop",
        side: "over",
        line: 0.5,
        marketOdds: 120,
        source: { playerId: 1, statGroup: "hitting", statKey: "runs" }
      }]
    }),
    (error) => /** @type {any} */ (error).issues.some((issue) => (
      issue.path === "livePolicy.requireCalibratedModel"
    ))
  );
});

test("validateLiveTicket rejects unsafe policy overrides and invalid leg counts", () => {
  assert.throws(
    () => validateLiveTicket({
      kind: "parlay",
      bankroll: 1000,
      livePolicy: {
        maxParlayLegs: 4,
        allowCorrelatedLegs: "yes"
      },
      legs: [
        {
          id: "leg-a",
          provider: "mlb",
          marketType: "prop",
          side: "over",
          line: 0.5,
          marketOdds: 120,
          source: { playerId: 1, statGroup: "hitting", statKey: "runs" }
        },
        {
          id: "leg-b",
          provider: "nhl",
          marketType: "prop",
          side: "over",
          line: 0.5,
          marketOdds: 120,
          source: { playerId: 2, statKey: "points" }
        }
      ]
    }),
    (error) => {
      const issues = /** @type {any} */ (error).issues;
      return issues.some((issue) => issue.path === "livePolicy.maxParlayLegs") &&
        issues.some((issue) => issue.path === "livePolicy.allowCorrelatedLegs");
    }
  );

  assert.throws(
    () => validateLiveTicket({
      kind: "single",
      bankroll: 1000,
      legs: [
        {
          id: "leg-a",
          provider: "mlb",
          marketType: "prop",
          side: "over",
          line: 0.5,
          marketOdds: 120,
          source: { playerId: 1, statGroup: "hitting", statKey: "runs" }
        },
        {
          id: "leg-b",
          provider: "nhl",
          marketType: "prop",
          side: "over",
          line: 0.5,
          marketOdds: 120,
          source: { playerId: 2, statKey: "points" }
        }
      ]
    }),
    (error) => /** @type {any} */ (error).issues.some((issue) => issue.message.includes("exactly one leg"))
  );
});

test("evaluateLiveTicket prices a cross-sport parlay but waits for registered calibration", async () => {
  const ticket = validateLiveTicket({
    kind: "parlay",
    selection: "Cross-sport live parlay",
    bankroll: 1000,
    legs: [
      {
        id: "leg-a",
        label: "Sample hitter over 1.5 total bases",
        provider: "mlb",
        marketType: "alt-prop",
        side: "over",
        line: 1.5,
        marketOdds: 120,
        modelProbabilityOverride: 0.7,
        calibrationStatus: "validated",
        marketContext: freshMarketContext(),
        source: { playerId: 1, statGroup: "hitting", statKey: "totalBases", recentLimit: 10 }
      },
      {
        id: "leg-b",
        label: "Sample skater over 1.5 points",
        provider: "nhl",
        marketType: "alt-prop",
        side: "over",
        line: 1.5,
        marketOdds: 125,
        modelProbabilityOverride: 0.7,
        calibrationStatus: "validated",
        marketContext: freshMarketContext(),
        source: { playerId: 2, statKey: "points", recentLimit: 5 }
      }
    ]
  });

  const result = await evaluateLiveTicket(ticket, {
    fetchJsonImpl: fetchJson
  });
  const parlayResult = /** @type {any} */ (result);

  assert.equal(parlayResult.kind, "parlay");
  assert.equal(parlayResult.legs.length, 2);
  assert.equal(parlayResult.verdict, "WAIT");
  assert.equal(parlayResult.modelEvidence.validated, false);
  assert.equal(parlayResult.modelEvidence.models[0].registryStatus, "unknown");
  assert.equal(parlayResult.modelEvidence.models[1].registryStatus, "unknown");
  assert.ok(parlayResult.riskFlags.some((flag) => flag.code === "LEG_MODEL_CALIBRATION_REQUIRED"));
  assert.ok(parlayResult.combined.probability > 0);
  assert.equal(parlayResult.researchPacket.ticketKind, "parlay");
  assert.equal(parlayResult.researchPacket.sources.length, 2);
});

test("evaluateLiveTicket carries contextual leg risk flags into parlay output", async () => {
  const ticket = validateLiveTicket({
    kind: "parlay",
    selection: "Risk-visible parlay",
    bankroll: 1000,
    legs: [
      {
        id: "leg-a",
        label: "Sample hitter over 1.5 total bases",
        provider: "mlb",
        marketType: "prop",
        side: "over",
        line: 1.5,
        marketOdds: 120,
        modelProbabilityOverride: 0.7,
        calibrationStatus: "validated",
        marketContext: freshMarketContext(),
        riskFlags: [
          {
            code: "LINEUP_NOT_CONFIRMED",
            severity: "medium",
            message: "Lineup must be confirmed before betting."
          }
        ],
        source: { playerId: 1, statGroup: "hitting", statKey: "totalBases", recentLimit: 10 }
      },
      {
        id: "leg-b",
        label: "Sample skater over 1.5 points",
        provider: "nhl",
        marketType: "prop",
        side: "over",
        line: 1.5,
        marketOdds: 125,
        modelProbabilityOverride: 0.7,
        calibrationStatus: "validated",
        marketContext: freshMarketContext(),
        source: { playerId: 2, statKey: "points", recentLimit: 5 }
      }
    ]
  });

  const result = await evaluateLiveTicket(ticket, {
    fetchJsonImpl: fetchJson
  });
  const parlayResult = /** @type {any} */ (result);

  assert.equal(parlayResult.kind, "parlay");
  assert.equal(parlayResult.verdict, "WAIT");
  assert.ok(parlayResult.legs[0].riskFlags.some((flag) => flag.code === "LINEUP_NOT_CONFIRMED"));
  assert.ok(parlayResult.riskFlags.some((flag) => flag.code === "LEG_LINEUP_NOT_CONFIRMED"));
});

test("evaluateLiveTicket uses official current-game MLB stats when gamePk is supplied", async () => {
  const ticket = validateLiveTicket({
    kind: "single",
    selection: "Live hitter total bases",
    bankroll: 1000,
    legs: [
      {
        id: "live-hitter-total-bases",
        label: "Sample hitter over 1.5 total bases",
        provider: "mlb",
        marketType: "alt-prop",
        side: "over",
        line: 1.5,
        marketOdds: -110,
        marketContext: freshMarketContext(),
        source: {
          playerId: 1,
          statGroup: "hitting",
          statKey: "totalBases",
          recentLimit: 10,
          gamePk: 1
        }
      }
    ]
  });

  const result = await evaluateLiveTicket(ticket, {
    fetchJsonImpl: fetchJson
  });

  assert.equal(result.kind, "single");
  assert.equal(result.verdict, "PASS");
  const singleResult = /** @type {any} */ (result);
  assert.equal(singleResult.derived.currentGameValue, 2);
  assert.equal(singleResult.derived.liveDeterministicOutcome, true);
  assert.equal(singleResult.derived.adjustedProbability, 1);
  assert.equal(result.researchPacket.sources[0].gamePk, 1);
  assert.equal(result.researchPacket.sources[0].currentGameValue, 2);
});

test("resolved live outcome cannot be bypassed by a validated probability override", () => {
  const ticket = validateLiveTicket({
    kind: "single",
    selection: "Resolved override guard",
    bankroll: 1000,
    legs: [
      {
        id: "resolved-override",
        provider: "mlb",
        marketType: "prop",
        side: "over",
        line: 1.5,
        marketOdds: 120,
        modelProbabilityOverride: 0.7,
        calibrationStatus: "validated",
        marketContext: freshMarketContext(),
        source: { playerId: 1, statGroup: "hitting", statKey: "totalBases" }
      }
    ]
  });
  const snapshot = {
    fetchedAt: new Date().toISOString(),
    season: { perGame: 1 },
    recent: { perGame: 1 },
    liveGame: {
      status: "in_progress",
      currentValue: 2,
      remainingOpportunityFactor: 1
    }
  };

  const result = evaluateLiveLeg(ticket.legs[0], snapshot, {
    bankroll: ticket.bankroll,
    livePolicy: ticket.livePolicy
  });

  assert.equal(result.verdict, "PASS");
  assert.equal(result.derived.liveDeterministicOutcome, true);
  assert.ok(result.riskFlags.some((flag) => flag.code === "MARKET_OUTCOME_RESOLVED"));
});

test("evaluateLiveTicket waits on stale injury or lineup evidence", async () => {
  const ticket = validateLiveTicket({
    kind: "single",
    bankroll: 1000,
    legs: [
      {
        id: "stale-injury-leg",
        provider: "mlb",
        marketType: "prop",
        side: "over",
        line: 0.5,
        marketOdds: 120,
        modelProbabilityOverride: 0.7,
        calibrationStatus: "validated",
        marketContext: freshMarketContext(),
        riskFlags: [
          {
            code: "STALE_INJURY",
            severity: "medium",
            message: "Injury report is older than the allowed window."
          }
        ],
        source: { playerId: 1, statGroup: "hitting", statKey: "runs" }
      }
    ]
  });

  const result = await evaluateLiveTicket(ticket, { fetchJsonImpl: fetchJson });

  assert.equal(result.verdict, "WAIT");
  assert.ok(result.reasons.some((reason) => reason.includes("manual confirmation")));
});

test("evaluateLiveTicket rejects correlated parlays by default", async () => {
  const ticket = validateLiveTicket({
    kind: "parlay",
    selection: "Correlated live parlay",
    bankroll: 1000,
    legs: [
      {
        id: "leg-a",
        provider: "mlb",
        marketType: "prop",
        side: "over",
        line: 0.5,
        marketOdds: -105,
        correlationKey: "same-game",
        source: { playerId: 1, statGroup: "hitting", statKey: "runs" }
      },
      {
        id: "leg-b",
        provider: "mlb",
        marketType: "alt-prop",
        side: "over",
        line: 1.5,
        marketOdds: 120,
        correlationKey: "same-game",
        source: { playerId: 1, statGroup: "hitting", statKey: "totalBases" }
      }
    ]
  });

  const result = await evaluateLiveTicket(ticket, {
    fetchJsonImpl: fetchJson
  });

  assert.equal(result.verdict, "PASS");
  assert.ok(result.riskFlags.some((flag) => flag.code === "CORRELATION_RISK"));
});

test("live ticket derives correlation risk from shared source event IDs", async () => {
  const ticket = validateLiveTicket({
    kind: "parlay",
    selection: "Implicit same-game correlation",
    bankroll: 1000,
    legs: [
      {
        id: "implicit-a",
        provider: "mlb",
        marketType: "prop",
        side: "over",
        line: 0.5,
        marketOdds: -105,
        source: { playerId: 1, gameId: 123, statGroup: "hitting", statKey: "runs" }
      },
      {
        id: "implicit-b",
        provider: "mlb",
        marketType: "alt-prop",
        side: "over",
        line: 1.5,
        marketOdds: 120,
        source: { playerId: 2, gameId: 123, statGroup: "hitting", statKey: "totalBases" }
      }
    ]
  });

  const result = await evaluateLiveTicket(ticket, { fetchJsonImpl: fetchJson });

  assert.equal(ticket.legs[0].correlationKey, "mlb:event:123");
  assert.equal(result.verdict, "PASS");
  assert.ok(result.riskFlags.some((flag) => flag.code === "CORRELATION_RISK"));
});

test("parlay correlation penalties cannot inflate combined probability", async () => {
  const ticket = validateLiveTicket({
    kind: "parlay",
    selection: "Bounded correlation penalty",
    bankroll: 1000,
    livePolicy: { correlationPenalty: 0.75 },
    legs: [
      {
        id: "bounded-a",
        provider: "mlb",
        marketType: "prop",
        side: "over",
        line: 0.5,
        marketOdds: -105,
        correlationKey: "same-game",
        source: { playerId: 1, statGroup: "hitting", statKey: "runs" }
      },
      {
        id: "bounded-b",
        provider: "mlb",
        marketType: "alt-prop",
        side: "over",
        line: 1.5,
        marketOdds: 120,
        correlationKey: "same-game",
        source: { playerId: 1, statGroup: "hitting", statKey: "totalBases" }
      }
    ]
  });

  const result = /** @type {any} */ (await evaluateLiveTicket(ticket, { fetchJsonImpl: fetchJson }));

  assert.ok(result.combined.probability >= 0);
  assert.ok(result.combined.probability <= 1);
  assert.equal(result.combined.correlationPenaltyFactor, 0.75);
});

test("explicit correlated-leg allowance still applies a penalty and records the override", async () => {
  const ticket = validateLiveTicket({
    kind: "parlay",
    bankroll: 1000,
    livePolicy: { allowCorrelatedLegs: true, correlationPenalty: 0.8 },
    legs: [
      {
        id: "correlated-a",
        provider: "mlb",
        marketType: "prop",
        side: "over",
        line: 0.5,
        marketOdds: 120,
        modelProbabilityOverride: 0.7,
        calibrationStatus: "validated",
        marketContext: freshMarketContext(),
        correlationKey: "same-game",
        source: { playerId: 1, statGroup: "hitting", statKey: "runs" }
      },
      {
        id: "correlated-b",
        provider: "mlb",
        marketType: "alt-prop",
        side: "over",
        line: 1.5,
        marketOdds: 120,
        modelProbabilityOverride: 0.7,
        calibrationStatus: "validated",
        marketContext: freshMarketContext(),
        correlationKey: "same-game",
        source: { playerId: 2, statGroup: "hitting", statKey: "totalBases" }
      }
    ]
  });

  const result = /** @type {any} */ (await evaluateLiveTicket(ticket, { fetchJsonImpl: fetchJson }));

  assert.equal(result.combined.correlationPenaltyFactor, 0.8);
  assert.ok(result.riskFlags.some((flag) => flag.code === "CORRELATION_OVERRIDE"));
});

test("evaluateLiveTicket waits on missing market timestamps", async () => {
  const ticket = validateLiveTicket({
    kind: "single",
    bankroll: 1000,
    legs: [
      {
        id: "missing-market-timestamp",
        provider: "mlb",
        marketType: "prop",
        side: "over",
        line: 0.5,
        marketOdds: 120,
        modelProbabilityOverride: 0.7,
        calibrationStatus: "validated",
        source: { playerId: 1, statGroup: "hitting", statKey: "runs" }
      }
    ]
  });

  const result = await evaluateLiveTicket(ticket, { fetchJsonImpl: fetchJson });

  assert.equal(result.verdict, "WAIT");
  assert.ok(result.riskFlags.some((flag) => flag.code === "MISSING_MARKET_TIMESTAMP"));
});

test("evaluateLiveTicket waits instead of betting an uncalibrated Poisson baseline", async () => {
  const ticket = validateLiveTicket({
    kind: "single",
    bankroll: 1000,
    legs: [
      {
        id: "uncalibrated-baseline",
        provider: "mlb",
        marketType: "prop",
        side: "over",
        line: 0.5,
        marketOdds: 120,
        marketContext: freshMarketContext(),
        source: { playerId: 1, statGroup: "hitting", statKey: "runs" }
      }
    ]
  });

  const result = await evaluateLiveTicket(ticket, { fetchJsonImpl: fetchJson });

  assert.equal(result.verdict, "WAIT");
  assert.ok(result.riskFlags.some((flag) => flag.code === "MODEL_CALIBRATION_REQUIRED"));
});

test("evaluateLiveTicket uses multi-book market intelligence for consensus shrinkage", async () => {
  const ticket = validateLiveTicket({
    kind: "single",
    selection: "Consensus-aware prop",
    bankroll: 1000,
    legs: [
      {
        id: "consensus-leg",
        label: "Sample hitter over 0.5 runs",
        provider: "mlb",
        marketType: "prop",
        side: "over",
        line: 0.5,
        marketOdds: 120,
        oppositeOdds: -140,
        modelProbabilityOverride: 0.68,
        calibrationStatus: "validated",
        marketContext: {
          offeredLastUpdate: new Date().toISOString(),
          consensus: [
            {
              bookmaker: "sharp-reference",
              marketOdds: 115,
              oppositeOdds: -125,
              isSharp: true,
              lastUpdate: new Date().toISOString()
            },
            {
              bookmaker: "public-book",
              marketOdds: 105,
              oppositeOdds: -130,
              lastUpdate: new Date().toISOString()
            }
          ]
        },
        source: { playerId: 1, statGroup: "hitting", statKey: "runs" }
      }
    ]
  });

  const result = await evaluateLiveTicket(ticket, {
    fetchJsonImpl: fetchJson
  });
  const singleResult = /** @type {any} */ (result);
  const marketIntelligence = singleResult.derived.marketIntelligence;

  assert.equal(singleResult.kind, "single");
  assert.equal(marketIntelligence.consensus.bookCount, 2);
  assert.equal(marketIntelligence.consensus.sharpBookCount, 1);
  assert.equal(singleResult.derived.marketReferenceProbability, marketIntelligence.referenceProbability);
  assert.ok(singleResult.derived.adjustedProbability < 0.68);
  assert.ok(singleResult.riskFlags.some((flag) => flag.code === "MARKET_CONSENSUS"));
});

test("evaluateLiveTicket waits when the offered sportsbook price is stale", async () => {
  const ticket = validateLiveTicket({
    kind: "single",
    selection: "Stale market prop",
    bankroll: 1000,
    legs: [
      {
        id: "stale-market-leg",
        label: "Sample hitter over 0.5 runs",
        provider: "mlb",
        marketType: "prop",
        side: "over",
        line: 0.5,
        marketOdds: 120,
        oppositeOdds: -135,
        modelProbabilityOverride: 0.68,
        calibrationStatus: "validated",
        marketContext: {
          offeredLastUpdate: "2026-01-01T00:00:00.000Z"
        },
        maxMarketAgeMinutes: 1,
        source: { playerId: 1, statGroup: "hitting", statKey: "runs" }
      }
    ]
  });

  const result = await evaluateLiveTicket(ticket, {
    fetchJsonImpl: fetchJson
  });

  assert.equal(result.verdict, "WAIT");
  assert.ok(result.riskFlags.some((flag) => flag.code === "STALE_MARKET_PRICE"));
});

test("evaluateLiveTicket applies longshot tax when no sharp confirmation exists", async () => {
  const ticket = validateLiveTicket({
    kind: "single",
    selection: "Unsupported longshot prop",
    bankroll: 1000,
    legs: [
      {
        id: "longshot-leg",
        label: "Sample hitter over 1.5 hits",
        provider: "mlb",
        marketType: "alt-prop",
        side: "over",
        line: 1.5,
        marketOdds: 500,
        oppositeOdds: -700,
        modelProbabilityOverride: 0.26,
        calibrationStatus: "validated",
        source: { playerId: 1, statGroup: "hitting", statKey: "hits" }
      }
    ]
  });

  const result = await evaluateLiveTicket(ticket, {
    fetchJsonImpl: fetchJson
  });
  const singleResult = /** @type {any} */ (result);

  assert.ok(singleResult.derived.marketIntelligence.adjustments.some((entry) => entry.code === "FAVORITE_LONGSHOT_BIAS"));
  assert.ok(singleResult.derived.adjustedProbability < singleResult.derived.baseProbability);
  assert.ok(singleResult.riskFlags.some((flag) => flag.code === "FAVORITE_LONGSHOT_BIAS"));
});

test("evaluateLiveTicket waits when books disagree too much on the fair probability", async () => {
  const ticket = validateLiveTicket({
    kind: "single",
    selection: "Dispersed market prop",
    bankroll: 1000,
    legs: [
      {
        id: "dispersed-market-leg",
        label: "Sample hitter over 0.5 runs",
        provider: "mlb",
        marketType: "prop",
        side: "over",
        line: 0.5,
        marketOdds: 120,
        oppositeOdds: -140,
        modelProbabilityOverride: 0.68,
        calibrationStatus: "validated",
        marketContext: {
          offeredLastUpdate: new Date().toISOString(),
          consensus: [
            { bookmaker: "book-a", marketOdds: -160, oppositeOdds: 140, lastUpdate: new Date().toISOString() },
            { bookmaker: "book-b", marketOdds: 180, oppositeOdds: -220, lastUpdate: new Date().toISOString() }
          ]
        },
        source: { playerId: 1, statGroup: "hitting", statKey: "runs" }
      }
    ]
  });

  const result = await evaluateLiveTicket(ticket, {
    fetchJsonImpl: fetchJson
  });

  assert.equal(result.verdict, "WAIT");
  assert.ok(result.riskFlags.some((flag) => flag.code === "MARKET_DISAGREEMENT"));
});

test("LiveDataCache reuses a provider response within the refresh window", async () => {
  const ticket = validateLiveTicket({
    kind: "single",
    bankroll: 1000,
    legs: [
      {
        id: "leg-a",
        provider: "mlb",
        marketType: "prop",
        side: "over",
        line: 0.5,
        marketOdds: -105,
        source: { playerId: 1, statGroup: "hitting", statKey: "runs" }
      }
    ]
  });
  const cache = new LiveDataCache({
    refreshIntervalMs: 60_000
  });
  let callCount = 0;

  async function countingFetch(url) {
    callCount += 1;
    return fetchJson(url);
  }

  const firstResult = await evaluateLiveTicket(ticket, {
    cache,
    fetchJsonImpl: countingFetch
  });
  const secondResult = await evaluateLiveTicket(ticket, {
    cache,
    fetchJsonImpl: countingFetch
  });

  assert.equal(callCount, 1);
  assert.equal(firstResult.researchPacket.sources[0].cache.hit, false);
  assert.equal(secondResult.researchPacket.sources[0].cache.hit, true);
});

test("live CLI evaluates stdin and persists an authoritative record", () => {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "bear-edge-live-cli-"));
  const logPath = path.join(tempDir, "decision_log.jsonl");
  const env = {
    ...process.env,
    BEAR_EDGE_TEST_MODE: "1"
  };
  const command = spawnSync(
    process.execPath,
    [
      path.resolve(__dirname, "../src/cli/evaluate-live.js"),
      "--stdin",
      "--log-path",
      logPath,
      "--compact"
    ],
    {
      cwd: path.resolve(__dirname, ".."),
      encoding: "utf8",
      env,
      input: JSON.stringify({
        kind: "parlay",
        selection: "stdin live parlay",
        bankroll: 1000,
        legs: [
          {
            id: "leg-a",
            provider: "mlb",
            marketType: "alt-prop",
            side: "over",
            line: 1.5,
            marketOdds: 120,
            source: { playerId: 1, statGroup: "hitting", statKey: "totalBases" }
          },
          {
            id: "leg-b",
            provider: "nhl",
            marketType: "alt-prop",
            side: "over",
            line: 1.5,
            marketOdds: 125,
            source: { playerId: 2, statKey: "points" }
          }
        ]
      })
    }
  );

  assert.equal(command.status, 0, command.stderr);
  const output = JSON.parse(command.stdout);
  const persisted = JSON.parse(fs.readFileSync(logPath, "utf8").trim());

  assert.equal(output.kind, "parlay");
  assert.equal(output.logPath, logPath);
  assert.match(output.recordId, /^eval_/);
  assert.match(output.contentDigest, /^[a-f0-9]{64}$/);
  assert.equal(persisted.schemaVersion, "2.0.0");
  assert.equal(persisted.id, output.recordId);
});

test("live CLI rejects the removed --no-log option", () => {
  assert.throws(
    () => parseEvaluateLiveArgs(["ticket.json", "--no-log"]),
    /Unexpected argument: --no-log/
  );
});

test("watch CLI can run a single evaluation iteration", () => {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "bear-edge-watch-"));
  const logPath = path.join(tempDir, "decision_log.jsonl");
  const env = {
    ...process.env,
    BEAR_EDGE_TEST_MODE: "1"
  };
  const command = spawnSync(
    process.execPath,
    [
      path.resolve(__dirname, "../src/cli/watch-live.js"),
      path.resolve(__dirname, "../examples/live-2-leg-alt-props.json"),
      "--iterations",
      "1",
      "--log-path",
      logPath
    ],
    {
      cwd: path.resolve(__dirname, ".."),
      encoding: "utf8",
      env
    }
  );

  assert.equal(command.status, 0, command.stderr);
  const output = JSON.parse(command.stdout.trim());
  assert.equal(output.kind, "parlay");
});
