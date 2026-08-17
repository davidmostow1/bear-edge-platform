const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs/promises");
const os = require("node:os");
const path = require("node:path");

const {
  deriveActionableProbability,
  deriveConsensusProbability,
  evaluateEsportsCandidate,
  evaluateEsportsCandidateAndLog,
  getRequiredClaimKeys,
  normalizeTwoWayOffer
} = require("../src/esports/index.js");
const {
  createEvaluationRecord,
  validateAuditRecord
} = require("../src/audit/record-contract.js");
const {
  readAuthoritativeLedger
} = require("../src/audit/authoritative-ledger.js");
const { contentDigest } = require("../src/audit/canonical-json.js");
const { parseArgs } = require("../src/cli/evaluate-esports.js");

const NOW = "2026-08-12T12:00:00.000Z";
const EVENT_START = "2026-08-12T18:00:00.000Z";

const SOURCE_REGISTRY = Object.freeze({
  official_event: {
    status: "approved",
    tier: 1,
    independenceFamily: "event_organizer",
    games: ["CS2", "DOTA2", "LOL", "VALORANT"],
    roles: ["event_identity", "schedule", "format", "rosters", "live_state", "match_data"]
  },
  official_game: {
    status: "approved",
    tier: 1,
    independenceFamily: "game_publisher",
    games: ["CS2", "DOTA2", "LOL", "VALORANT"],
    roles: ["event_identity", "schedule", "format", "rosters", "live_state", "match_data"]
  },
  specialist_stats: {
    status: "approved",
    tier: 2,
    independenceFamily: "specialist_stats",
    games: ["CS2", "DOTA2", "LOL", "VALORANT"],
    roles: ["event_identity", "schedule", "format", "rosters", "live_state", "match_data"]
  }
});

const RESEARCH_MODEL = Object.freeze({
  modelId: "esports_bear_stack_v1",
  modelVersion: "1.0.0",
  marketFamily: "cs2_match_winner",
  modelStatus: "research_only",
  calibrationReportId: null,
  calibrationReportDigest: null,
  trainingCutoff: null,
  calculationImplementation: {
    version: "1.0.0"
  }
});

const VALIDATED_MODEL = Object.freeze({
  ...RESEARCH_MODEL,
  modelStatus: "validated",
  calibrationReportId: "calibration-cs2-001",
  calibrationReportDigest: "a".repeat(64),
  trainingCutoff: "2026-08-01T00:00:00.000Z"
});

function policy(overrides = {}) {
  const value = {
    policyVersion: "esports-test-1",
    registeredAt: "2026-08-01T00:00:00.000Z",
    bankroll: 1000,
    minIndependentSources: 2,
    minConsensusBooks: 2,
    maxEvidenceAgeMinutes: 120,
    maxModelAgeMinutes: 30,
    maxPriceAgeMinutes: 10,
    eventCutoffMinutes: 5,
    maxConsensusRange: 0.05,
    marketWeight: 0.35,
    minPriceEdge: 0.02,
    minEvRoi: 0.01,
    minKellyFraction: 0.005,
    kellyMultiplier: 0.25,
    maxBankrollFraction: 0.03,
    maxStake: 30,
    minStake: 1,
    ...overrides
  };
  return {
    ...value,
    policyDigest: contentDigest(value)
  };
}

function evidence(claimKey, value) {
  return [
    {
      claimKey,
      provider: "official_event",
      sourceUrl: `https://event.example/${claimKey}`,
      capturedAt: "2026-08-12T11:58:00.000Z",
      sourceTime: "2026-08-12T11:57:00.000Z",
      verificationStatus: "verified",
      value
    },
    {
      claimKey,
      provider: "specialist_stats",
      sourceUrl: `https://stats.example/${claimKey}`,
      capturedAt: "2026-08-12T11:59:00.000Z",
      sourceTime: "2026-08-12T11:58:00.000Z",
      verificationStatus: "verified",
      value
    }
  ].map((entry) => {
    entry.rawPayload = {
      provider: entry.provider,
      claimKey: entry.claimKey,
      sourceUrl: entry.sourceUrl,
      parserVersion: entry.parserVersion ?? null,
      capturedAt: entry.capturedAt,
      sourceTime: entry.sourceTime,
      verificationStatus: entry.verificationStatus,
      value: entry.value
    };
    entry.digest = contentDigest(entry.rawPayload);
    return entry;
  });
}

function requiredEvidence(game = "CS2", scope = "series") {
  return getRequiredClaimKeys(game, scope).flatMap((claimKey) => {
    const values = {
      "event.identity": { eventId: "event-1", teamA: "Team Alpha", teamB: "Team Beta" },
      "event.start_time": EVENT_START,
      "event.format": "best_of_3",
      "roster.team_a": ["alpha-1", "alpha-2", "alpha-3", "alpha-4", "alpha-5"],
      "roster.team_b": ["beta-1", "beta-2", "beta-3", "beta-4", "beta-5"],
      "context.map_pool": ["map-1", "map-2", "map-3"],
      "context.patch": "verified-patch-id",
      "roster.starting_lineup.team_a": ["alpha-1", "alpha-2", "alpha-3", "alpha-4", "alpha-5"],
      "roster.starting_lineup.team_b": ["beta-1", "beta-2", "beta-3", "beta-4", "beta-5"]
    };
    return evidence(claimKey, values[claimKey] ?? `verified-${claimKey}`);
  });
}

function refreshEvidenceDigest(entry) {
  entry.rawPayload = {
    provider: entry.provider,
    claimKey: entry.claimKey,
    sourceUrl: entry.sourceUrl,
    parserVersion: entry.parserVersion ?? null,
    capturedAt: entry.capturedAt,
    sourceTime: entry.sourceTime,
    verificationStatus: entry.verificationStatus,
    value: entry.value
  };
  entry.digest = contentDigest(entry.rawPayload);
  return entry;
}

function refreshQuoteDigest(offer) {
  offer.rawSnapshot = {
    bookmaker: offer.bookmaker,
    independenceFamily: offer.independenceFamily,
    jurisdiction: offer.jurisdiction,
    marketId: offer.marketId,
    eventId: offer.eventId,
    marketFamily: offer.marketFamily,
    marketType: offer.marketType,
    scope: offer.scope,
    selection: offer.selection,
    oppositeSelection: offer.oppositeSelection,
    side: offer.side,
    line: offer.line,
    settlementRuleDigest: offer.settlementRuleDigest,
    selectionAmericanOdds: offer.selectionAmericanOdds,
    oppositeAmericanOdds: offer.oppositeAmericanOdds,
    capturedAt: offer.capturedAt,
    sourceUrl: offer.sourceUrl,
    parserVersion: offer.parserVersion ?? null,
    verificationStatus: offer.verificationStatus,
    priceType: offer.priceType,
    priceStatus: offer.priceStatus,
    executable: offer.executable,
    maxExecutableStake: offer.maxExecutableStake,
    executionCostRate: offer.executionCostRate
  };
  offer.rawSnapshotDigest = contentDigest(offer.rawSnapshot);
  return offer;
}

function quote(bookmaker, selectionAmericanOdds, oppositeAmericanOdds, minute) {
  const offer = {
    bookmaker,
    independenceFamily: `${bookmaker}_operator`,
    jurisdiction: "test-jurisdiction",
    marketId: `event-1-${bookmaker}`,
    eventId: "event-1",
    marketFamily: "cs2_match_winner",
    marketType: "match_winner",
    scope: "series",
    selection: "Team Alpha",
    oppositeSelection: "Team Beta",
    side: "team_a",
    line: null,
    settlementRuleDigest: "2".repeat(64),
    selectionAmericanOdds,
    oppositeAmericanOdds,
    capturedAt: `2026-08-12T11:${minute}:00.000Z`,
    sourceUrl: `https://${bookmaker}.example/market/event-1`,
    verificationStatus: "verified",
    priceType: "american_two_way",
    priceStatus: "open",
    executable: true,
    maxExecutableStake: 100,
    executionCostRate: 0
  };
  return refreshQuoteDigest(offer);
}

function refreshPredictionDigest(input) {
  input.model.predictionDigest = contentDigest({
    schemaVersion: "bear-edge.independent-projection.v1",
    independentModelId: input.model.independentModelId,
    independentModelVersion: input.model.independentModelVersion,
    independentImplementationDigest: input.model.independentImplementationDigest,
    featureSnapshotDigest: input.model.featureSnapshotDigest,
    eventId: input.model.eventId,
    marketFamily: input.model.marketFamily,
    selection: input.model.selection,
    side: input.model.side,
    generatedAt: input.model.generatedAt,
    pointProbability: input.model.pointProbability,
    lowerProbability: input.model.lowerProbability,
    upperProbability: input.model.upperProbability,
    predictionArtifactLocator: input.model.predictionArtifactLocator,
    verificationStatus: input.model.verificationStatus
  });
  return input;
}

function candidate(overrides = {}) {
  const input = {
    observedAt: NOW,
    game: "CS2",
    event: {
      eventId: "event-1",
      league: "Verified League",
      startTime: EVENT_START,
      teamA: "Team Alpha",
      teamB: "Team Beta",
      format: "best_of_3"
    },
    market: {
      marketFamily: "cs2_match_winner",
      marketType: "match_winner",
      scope: "series",
      selection: "Team Alpha",
      side: "team_a",
      line: null,
      settlementRuleDigest: "2".repeat(64),
      targetOffer: quote("targetbook", 115, -135, "59"),
      consensusOffers: [
        quote("referencebook1", -125, 105, "57"),
        quote("referencebook2", -120, 100, "58")
      ]
    },
    model: {
      modelId: "esports_bear_stack_v1",
      modelVersion: "1.0.0",
      independentModelId: "verified-test-independent-model",
      independentModelVersion: "1.0.0",
      independentImplementationDigest: "f".repeat(64),
      featureSnapshotDigest: "1".repeat(64),
      eventId: "event-1",
      marketFamily: "cs2_match_winner",
      selection: "Team Alpha",
      side: "team_a",
      generatedAt: "2026-08-12T11:56:00.000Z",
      predictionDigest: null,
      predictionArtifactLocator: "file:///retained-model-prediction.json",
      verificationStatus: "verified",
      pointProbability: 0.57,
      lowerProbability: 0.55,
      upperProbability: 0.59
    },
    evidence: requiredEvidence(),
    policy: policy(),
    risk: {
      tiltLocked: false,
      exposureConflict: false,
      ledgerIntegrityValid: true
    },
    ...overrides
  };
  return refreshPredictionDigest(input);
}

/**
 * @param {any} input
 * @param {any} [model]
 * @param {any} [options]
 */
function evaluate(input, model = RESEARCH_MODEL, options = {}) {
  return evaluateEsportsCandidate(input, {
    now: NOW,
    sourceRegistry: SOURCE_REGISTRY,
    modelResolver: () => model,
    ...options
  });
}

test("two-way offer normalization independently removes the overround", () => {
  const result = normalizeTwoWayOffer(-125, 105);
  const impliedSelection = 125 / 225;
  const impliedOpposite = 100 / 205;
  const expected = impliedSelection / (impliedSelection + impliedOpposite);

  assert.ok(Math.abs(result.noVigSelectionProbability - expected) < 1e-12);
  assert.ok(Math.abs(
    result.noVigSelectionProbability + result.noVigOppositeProbability - 1
  ) < 1e-12);
  assert.ok(result.hold > 0);
});

test("registered Bear shrinkage combines independent projection and market without replacing either", () => {
  const result = deriveActionableProbability({
    modelPointProbability: 0.6,
    modelLowerProbability: 0.55,
    modelUpperProbability: 0.65,
    marketPointProbability: 0.5,
    marketLowerProbability: 0.48,
    marketUpperProbability: 0.52,
    marketWeight: 0.35
  });

  assert.equal(result.pointProbability, 0.6 * 0.65 + 0.5 * 0.35);
  assert.equal(result.lowerProbability, 0.55 * 0.65 + 0.48 * 0.35);
  assert.equal(result.upperProbability, 0.65 * 0.65 + 0.52 * 0.35);
  assert.equal(result.modelWeight, 0.65);
});

test("consensus excludes the target book and uses the observed median and range", () => {
  const result = deriveConsensusProbability(
    [
      quote("targetbook", 115, -135, "59"),
      quote("referencebook1", -125, 105, "57"),
      quote("referencebook2", -120, 100, "58")
    ],
    { targetBookmaker: "targetbook", now: NOW, maxPriceAgeMinutes: 10 }
  );

  assert.equal(result.books.length, 2);
  assert.equal(result.books.some((book) => book.bookmaker === "targetbook"), false);
  assert.equal(result.lowerProbability, Math.min(...result.books.map((book) => book.noVigProbability)));
  assert.equal(result.upperProbability, Math.max(...result.books.map((book) => book.noVigProbability)));
  assert.ok(result.pointProbability >= result.lowerProbability);
  assert.ok(result.pointProbability <= result.upperProbability);
});

test("sport-specific requirements cover real pre-match context instead of generic labels", () => {
  assert.deepEqual(getRequiredClaimKeys("CS2", "series"), [
    "event.identity",
    "event.start_time",
    "event.format",
    "roster.team_a",
    "roster.team_b",
    "context.map_pool"
  ]);
  assert.ok(getRequiredClaimKeys("DOTA2", "series").includes("context.patch"));
  assert.ok(getRequiredClaimKeys("LOL", "series").includes("roster.starting_lineup.team_a"));
  assert.ok(getRequiredClaimKeys("VALORANT", "series").includes("context.map_pool"));
  assert.ok(getRequiredClaimKeys("CS2", "map").includes("series.map_veto"));
  assert.ok(getRequiredClaimKeys("DOTA2", "live_map").includes("draft.team_a"));
  assert.ok(getRequiredClaimKeys("VALORANT", "live_map").includes("agents.team_b"));
});

test("live-map inputs remain fail-closed until a live execution path exists", () => {
  const input = candidate();
  input.market.scope = "live_map";
  input.market.targetOffer.scope = "live_map";
  refreshQuoteDigest(input.market.targetOffer);
  for (const offer of input.market.consensusOffers) {
    offer.scope = "live_map";
    refreshQuoteDigest(offer);
  }
  input.evidence = requiredEvidence("CS2", "live_map");

  const result = evaluate(input, VALIDATED_MODEL);

  assert.equal(result.verdict, "WAIT");
  assert.ok(result.riskFlags.some((flag) => flag.code === "LIVE_SCOPE_UNAVAILABLE"));
  assert.ok(result.gateResults.some((gate) => (
    gate.code === "LIVE_SCOPE_IMPLEMENTED" && gate.status === "fail"
  )));
});

test("CLI rejects operational clock injection and labels --as-of as replay", () => {
  assert.throws(
    () => parseArgs(["candidate.json", "--now", NOW]),
    /Unknown option: --now/
  );
  assert.deepEqual(
    parseArgs(["candidate.json", "--as-of", NOW, "--compact"]),
    {
      compact: true,
      help: false,
      inputPath: "candidate.json",
      ledgerPath: undefined,
      asOf: NOW,
      readFromStdin: false,
      sourceRegistryPath: undefined
    }
  );
});

test("a material claim backed by only one independent source is WAIT", () => {
  const input = candidate();
  input.evidence = input.evidence.filter((entry) => !(
    entry.claimKey === "event.format" && entry.provider === "specialist_stats"
  ));

  const result = evaluate(input);

  assert.equal(result.verdict, "WAIT");
  assert.ok(result.riskFlags.some((flag) => flag.code === "INSUFFICIENT_INDEPENDENT_SOURCES"));
});

test("conflicting verified values fail closed to WAIT", () => {
  const input = candidate();
  const conflicting = input.evidence.find((entry) => (
    entry.claimKey === "event.start_time" && entry.provider === "specialist_stats"
  ));
  conflicting.value = "2026-08-12T19:00:00.000Z";
  refreshEvidenceDigest(conflicting);

  const result = evaluate(input);

  assert.equal(result.verdict, "WAIT");
  assert.ok(result.riskFlags.some((flag) => flag.code === "SOURCE_CONFLICT"));
});

test("null or empty roster evidence fails semantic completeness", () => {
  const input = candidate();
  for (const entry of input.evidence.filter((item) => item.claimKey === "roster.team_a")) {
    entry.value = [];
    refreshEvidenceDigest(entry);
  }

  const result = evaluate(input);
  assert.equal(result.verdict, "WAIT");
  assert.ok(result.riskFlags.some((flag) => flag.code === "INVALID_CLAIM_VALUE"));
});

test("a cross-event reference quote is excluded instead of contaminating consensus", () => {
  const input = candidate();
  input.market.consensusOffers[0].eventId = "different-event";
  refreshQuoteDigest(input.market.consensusOffers[0]);

  const result = evaluate(input);
  assert.equal(result.verdict, "WAIT");
  assert.equal(result.market.consensusBookCount, 1);
  assert.ok(result.market.excludedConsensusOffers.some((entry) => (
    entry.reasonCodes.includes("MARKET_FINGERPRINT_MISMATCH:eventId")
  )));
  const auditSource = result.auditRecord.sources.find((source) => (
    source.provider === "referencebook1"
  ));
  assert.equal(auditSource.eventId, "different-event");
  assert.equal(auditSource.disposition, "excluded");
  assert.equal(auditSource.freshness, "unverified");
  assert.equal(auditSource.verificationStatus, "unverified");
  assert.ok(auditSource.reasonCodes.includes("MARKET_FINGERPRINT_MISMATCH:eventId"));
});

test("quote and model mutations without matching retained-payload digests fail closed", () => {
  const quoteMutation = candidate();
  quoteMutation.market.targetOffer.selectionAmericanOdds = 250;
  assert.equal(evaluate(quoteMutation).verdict, "WAIT");

  const modelMutation = candidate();
  modelMutation.model.pointProbability = 0.9;
  const result = evaluate(modelMutation);
  assert.equal(result.verdict, "WAIT");
  assert.ok(result.gateResults.some((gate) => (
    gate.code === "INDEPENDENT_PROJECTION"
    && gate.message.includes("MODEL_PREDICTION_DIGEST_MISMATCH")
  )));
});

test("verification-status flips are bound to retained quote, evidence, and prediction payloads", () => {
  const quoteStatus = candidate();
  quoteStatus.market.targetOffer.verificationStatus = "unverified";
  const quoteResult = evaluate(quoteStatus);
  assert.equal(quoteResult.verdict, "WAIT");
  assert.ok(quoteResult.gateResults.some((gate) => (
    gate.code === "TARGET_PRICE"
    && gate.message.includes("RAW_PRICE_SNAPSHOT_FIELD_MISMATCH")
  )));

  const evidenceStatus = candidate();
  evidenceStatus.evidence[0].verificationStatus = "unverified";
  const evidenceResult = evaluate(evidenceStatus);
  assert.equal(evidenceResult.verdict, "WAIT");
  assert.ok(evidenceResult.riskFlags.some((flag) => (
    flag.code === "INSUFFICIENT_INDEPENDENT_SOURCES"
  )));

  const predictionStatus = candidate();
  predictionStatus.model.verificationStatus = "unverified";
  const predictionResult = evaluate(predictionStatus);
  assert.equal(predictionResult.verdict, "WAIT");
  assert.ok(predictionResult.gateResults.some((gate) => (
    gate.code === "INDEPENDENT_PROJECTION"
    && gate.message.includes("MODEL_PREDICTION_DIGEST_MISMATCH")
  )));
});

test("post-hoc policy registration fails even when its digest is internally consistent", () => {
  const input = candidate();
  input.policy = policy({ registeredAt: "2026-08-12T11:57:00.000Z" });

  const result = evaluate(input);
  assert.equal(result.verdict, "WAIT");
  assert.ok(result.riskFlags.some((flag) => flag.code === "POLICY_NOT_PREDECLARED"));
});

test("stale evidence and a future price both fail closed to WAIT", () => {
  const stale = candidate();
  stale.evidence[0].sourceTime = "2026-08-12T08:00:00.000Z";
  refreshEvidenceDigest(stale.evidence[0]);
  assert.equal(evaluate(stale).verdict, "WAIT");

  const future = candidate();
  future.market.targetOffer.capturedAt = "2026-08-12T12:01:00.000Z";
  refreshQuoteDigest(future.market.targetOffer);
  const result = evaluate(future);
  assert.equal(result.verdict, "WAIT");
  assert.ok(result.riskFlags.some((flag) => flag.code === "FUTURE_MARKET_PRICE"));
});

test("missing exact target price is WAIT and never receives invented math", () => {
  const input = candidate();
  input.market.targetOffer = null;

  const result = evaluate(input);

  assert.equal(result.verdict, "WAIT");
  assert.equal(result.metrics.expectedValueRoi, null);
  assert.equal(result.auditRecord.price.marketOdds, null);
  assert.ok(result.riskFlags.some((flag) => flag.code === "MISSING_TARGET_PRICE"));
});

test("a research-only model returns LEAN plus a counterfactual validation gate", () => {
  const result = evaluate(candidate());

  assert.equal(result.verdict, "LEAN");
  assert.equal(result.shadowVerdict, "BET_IF_VALIDATED");
  assert.ok(result.metrics.priceEdge > 0.02);
  assert.ok(result.metrics.expectedValueRoi > 0.01);
  assert.equal(result.auditRecord.model.modelStatus, "research_only");
  assert.equal(validateAuditRecord(result.auditRecord).valid, true);
});

test("a validated injected model remains LEAN because replay has no operational authority", () => {
  const result = evaluate(candidate(), VALIDATED_MODEL);

  assert.equal(result.verdict, "LEAN");
  assert.equal(result.shadowVerdict, "BET_IF_OPERATIONAL_AUTHORITY_VERIFIED");
  assert.equal(result.auditRecord.permission, "PRICE_CHECK_ONLY");
  assert.equal(result.auditRecord.model.calibrationReportId, "calibration-cs2-001");
  assert.equal(result.auditRecord.model.calibrationReportDigest, "a".repeat(64));
  assert.ok(result.riskFlags.some((flag) => flag.code === "OPERATIONAL_BET_AUTHORITY_UNAVAILABLE"));
  assert.equal(result.auditRecord.audit.asOf, NOW);
  assert.notEqual(result.auditRecord.createdAt, NOW);
});

test("a dynamically fresh operational evaluation still cannot issue BET without trusted authority", () => {
  const input = candidate();
  const currentMs = Date.now();
  const eventStart = new Date(currentMs + 6 * 60 * 60 * 1000).toISOString();
  const evidenceCapture = new Date(currentMs - 30 * 1000).toISOString();
  const evidenceSourceTime = new Date(currentMs - 60 * 1000).toISOString();
  const priceCapture = new Date(currentMs - 20 * 1000).toISOString();
  const predictionTime = new Date(currentMs - 90 * 1000).toISOString();

  input.observedAt = new Date(currentMs).toISOString();
  input.event.startTime = eventStart;
  for (const item of input.evidence) {
    item.capturedAt = evidenceCapture;
    item.sourceTime = evidenceSourceTime;
    if (item.claimKey === "event.start_time") {
      item.value = eventStart;
    }
    refreshEvidenceDigest(item);
  }
  input.market.targetOffer.capturedAt = priceCapture;
  refreshQuoteDigest(input.market.targetOffer);
  for (const offer of input.market.consensusOffers) {
    offer.capturedAt = priceCapture;
    refreshQuoteDigest(offer);
  }
  input.model.generatedAt = predictionTime;
  refreshPredictionDigest(input);
  input.policy = policy({
    registeredAt: new Date(currentMs - 24 * 60 * 60 * 1000).toISOString()
  });

  const result = evaluateEsportsCandidate(input, {
    sourceRegistry: SOURCE_REGISTRY,
    modelResolver: () => VALIDATED_MODEL
  });

  assert.equal(result.evaluationMode, "operational");
  assert.equal(result.verdict, "LEAN");
  assert.equal(result.shadowVerdict, "BET_IF_OPERATIONAL_AUTHORITY_VERIFIED");
  assert.ok(result.gateResults.some((gate) => (
    gate.code === "OPERATIONAL_BET_AUTHORITY" && gate.status === "fail"
  )));
});

test("recorded execution cost reduces EV and Kelly before classification", () => {
  const withoutCost = evaluate(candidate());
  const input = candidate();
  input.market.targetOffer.executionCostRate = 0.02;
  refreshQuoteDigest(input.market.targetOffer);
  const withCost = evaluate(input);

  assert.ok(Math.abs(
    (withoutCost.metrics.expectedValueRoi - withCost.metrics.expectedValueRoi) - 0.02
  ) < 1e-12);
  assert.ok(withCost.metrics.kellyFraction < withoutCost.metrics.kellyFraction);
});

test("point edge that disappears at the conservative Bear bound is LEAN, not BET", () => {
  const input = candidate();
  input.model.lowerProbability = 0.45;
  refreshPredictionDigest(input);
  const result = evaluate(input, VALIDATED_MODEL);

  assert.equal(result.verdict, "LEAN");
  assert.equal(result.shadowVerdict, "BET_IF_PRICE_OR_UNCERTAINTY_IMPROVES");
  assert.ok(result.metrics.pointPriceEdge > input.policy.minPriceEdge);
  assert.ok(result.metrics.priceEdge <= input.policy.minPriceEdge);
});

test("negative or insufficient point-value math is PASS", () => {
  const input = candidate();
  input.market.targetOffer.selectionAmericanOdds = -180;
  input.market.targetOffer.oppositeAmericanOdds = 150;
  refreshQuoteDigest(input.market.targetOffer);

  const result = evaluate(input, VALIDATED_MODEL);

  assert.equal(result.verdict, "PASS");
  assert.ok(result.metrics.pointExpectedValueRoi < 0);
});

test("hard bankroll or exposure integrity gates are PASS", () => {
  const input = candidate();
  input.risk.exposureConflict = true;

  const result = evaluate(input, VALIDATED_MODEL);

  assert.equal(result.verdict, "PASS");
  assert.ok(result.riskFlags.some((flag) => flag.code === "EXPOSURE_CONFLICT"));
});

test("LEAN is part of the canonical audit contract", () => {
  const record = createEvaluationRecord({
    origin: {},
    event: {},
    market: {},
    price: {},
    sources: [],
    model: { modelStatus: "research_only" },
    probability: {},
    edge: {},
    stake: {},
    decision: {
      verdict: "LEAN",
      permission: "PRICE_CHECK_ONLY",
      reasons: ["Positive shadow edge; model not validated."],
      riskFlags: [],
      gateResults: []
    },
    audit: { warnings: [] }
  }, {
    clientEventId: "10000000-0000-4000-8000-000000000001",
    createdAt: NOW
  });

  assert.equal(validateAuditRecord(record).valid, true);
});

test("every classification is append-only logged through the authoritative ledger", async () => {
  const tempDirectory = await fs.mkdtemp(path.join(os.tmpdir(), "bear-edge-esports-"));
  const ledgerPath = path.join(tempDirectory, "decisions.jsonl");
  const result = await evaluateEsportsCandidateAndLog(candidate(), {
    now: NOW,
    sourceRegistry: SOURCE_REGISTRY,
    modelResolver: () => RESEARCH_MODEL,
    ledgerPath,
    clientEventId: "20000000-0000-4000-8000-000000000001"
  });
  const inspection = await readAuthoritativeLedger({ ledgerPath });

  assert.equal(result.verdict, "LEAN");
  assert.equal(result.persistence.appended, true);
  assert.equal(inspection.records.length, 1);
  assert.equal(inspection.records[0].verdict, "LEAN");
  assert.equal(inspection.invalidRecords.length, 0);
  assert.equal(inspection.malformedLines.length, 0);
});
