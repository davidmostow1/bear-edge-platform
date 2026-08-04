const test = require("node:test");
const assert = require("node:assert/strict");

const {
  createAmendmentRecord,
  createClosingPriceRecord,
  createEvaluationRecord,
  createPredictionOutcomeRecord,
  createSettlementAuditRecord,
  projectCalibrationLedger
} = require("../src/index.js");
const {
  buildCalibrationReadiness,
  renderCalibrationReadinessMarkdown
} = require("../src/calibration/ledger-projection.js");
const { contentDigest } = require("../src/audit/canonical-json.js");

const PREDICTION_AT = "2026-07-17T12:00:01.000Z";
const FEATURE_AT = "2026-07-17T12:00:00.000Z";
const EVENT_AT = "2026-07-17T19:10:00.000Z";
const MARKET_CLOSED_AT = "2026-07-17T19:10:00.000Z";
const CLOSING_CAPTURED_AT = "2026-07-17T19:10:05.000Z";
const SETTLED_AT = "2026-07-17T22:30:00.000Z";

function evaluation(overrides = {}, context = {}) {
  return createEvaluationRecord({
    origin: {
      channel: "best_targets_api",
      actorType: "system",
      sessionId: null,
      requestId: "request_1"
    },
    event: {
      sport: "mlb",
      league: "MLB",
      eventId: "401816143",
      startTime: EVENT_AT,
      homeTeam: "Philadelphia Phillies",
      awayTeam: "New York Mets"
    },
    market: {
      marketFamily: "pitcher_strikeouts",
      marketType: "player_prop",
      participantId: "4414215",
      participantName: "Christian Scott",
      selection: "Christian Scott over 5.5 strikeouts",
      side: "over",
      line: 5.5
    },
    price: {
      sportsbook: "draftkings",
      marketOdds: 103,
      oppositeOdds: -131,
      priceCapturedAt: FEATURE_AT,
      priceSourceTime: FEATURE_AT
    },
    sources: [{
      provider: "mlb",
      sourceType: "official_context_only",
      sourceLocator: "https://statsapi.mlb.com/example",
      parserVersion: "candidate_serializer_v1",
      capturedAt: FEATURE_AT,
      sourceTime: FEATURE_AT,
      digest: "a".repeat(64),
      freshness: "fresh",
      verificationStatus: "official_context_only"
    }],
    model: {
      modelId: "poisson_count_v1",
      modelVersion: "1.0.0",
      probabilityMethod: "poisson_count",
      modelStatus: "research_only",
      calibrationReportId: null,
      trainingCutoff: "2026-07-16T00:00:00.000Z",
      sampleSize: 54
    },
    probability: {
      rawModelProbability: 0.55,
      adjustedProbability: 0.53,
      marketImpliedProbability: 0.49261083743842365,
      marketNoVigProbability: 0.512
    },
    edge: {
      fairEdge: 0.038,
      priceEdge: 0.03738916256157638,
      expectedValueRoi: 0.0759,
      kellyFraction: 0.0364
    },
    stake: {
      recommendedStake: 0,
      bankroll: 1000,
      stakePolicyVersion: "best_target_policy_v1"
    },
    decision: {
      verdict: "WAIT",
      permission: "PRICE_CHECK_ONLY",
      reasons: ["Research-only model."],
      riskFlags: [],
      gateResults: []
    },
    audit: {
      codeVersion: "test",
      configurationDigest: "b".repeat(64),
      calculationVersion: "displayed_target_v1",
      evidenceCompleteness: "official_context_plus_provider_price",
      warnings: []
    },
    ...overrides
  }, {
    clientEventId: context.clientEventId ?? "11111111-1111-4111-8111-111111111111",
    createdAt: context.createdAt ?? PREDICTION_AT
  });
}

function closingLineEvidence(overrides = {}) {
  return {
    sportsbook: "draftkings",
    capturedAt: CLOSING_CAPTURED_AT,
    marketClosedAt: MARKET_CLOSED_AT,
    isFinal: true,
    sourceLocator: "file:///verified-closing-line.png",
    sourceDigest: "c".repeat(64),
    ...overrides
  };
}

function settlement(evaluationId, overrides = {}, context = {}) {
  return createSettlementAuditRecord({
    evaluationId,
    settledAt: SETTLED_AT,
    outcome: "win",
    closingOdds: -125,
    closingOppositeOdds: 105,
    closingLineEvidence: closingLineEvidence(),
    stake: 10,
    profit: 8,
    notes: ["Official result confirmed."],
    ...overrides
  }, {
    clientEventId: context.clientEventId ?? "22222222-2222-4222-8222-222222222222",
    createdAt: context.createdAt ?? "2026-07-17T22:31:00.000Z"
  });
}

function predictionOutcome(evaluationId, overrides = {}, context = {}) {
  return createPredictionOutcomeRecord({
    evaluationId,
    supersedesId: null,
    outcome: "loss",
    resolvedAt: SETTLED_AT,
    eventResult: { status: "final", homeScore: 2, awayScore: 1 },
    marketResult: { observedValue: 4, unit: "strikeouts" },
    source: {
      provider: "mlb_official",
      sourceType: "official_box_score",
      sourceLocator: "https://www.mlb.com/gameday/401816143/final/box",
      capturedAt: "2026-07-17T22:35:00.000Z",
      sourceTime: SETTLED_AT,
      digest: "d".repeat(64),
      verificationStatus: "verified_official_result"
    },
    notes: [],
    ...overrides
  }, {
    clientEventId: context.clientEventId ?? "66666666-6666-4666-8666-666666666666",
    createdAt: context.createdAt ?? "2026-07-17T22:36:00.000Z"
  });
}

function closingPrice(evaluationId, overrides = {}, context = {}) {
  return createClosingPriceRecord({
    evaluationId,
    supersedesId: null,
    price: {
      sportsbook: "draftkings",
      marketOdds: -125,
      oppositeOdds: 105,
      marketClosedAt: MARKET_CLOSED_AT,
      isFinal: true
    },
    source: {
      provider: "licensed_odds_feed",
      sourceType: "sportsbook_closing_price",
      sourceLocator: "https://provider.example/events/401816143/closing",
      capturedAt: CLOSING_CAPTURED_AT,
      sourceTime: MARKET_CLOSED_AT,
      digest: "e".repeat(64),
      verificationStatus: "verified_provider_capture"
    },
    notes: [],
    ...overrides
  }, {
    clientEventId: context.clientEventId ?? "77777777-7777-4777-8777-777777777777",
    createdAt: context.createdAt ?? "2026-07-17T19:11:00.000Z"
  });
}

function closingPriceAcceptedUpstreamButWeakerAtConsumption(evaluationId, context = {}) {
  const verified = closingPrice(evaluationId, {}, context);
  const source = { ...verified.source };

  Object.defineProperty(source, "verificationStatus", {
    enumerable: true,
    get() {
      const immediateCaller = String(new Error().stack).split("\n")[2] ?? "";
      const accessedByClosingPriceConsumer = immediateCaller.includes("validShadowClosingPrice");
      return accessedByClosingPriceConsumer
        ? "operator_attested_close"
        : "verified_provider_capture";
    }
  });

  const { contentDigest: ignoredDigest, ...unsigned } = verified;
  const record = { ...unsigned, source };

  return {
    ...record,
    contentDigest: contentDigest(record)
  };
}

test("projectCalibrationLedger is part of the public API", () => {
  assert.equal(typeof projectCalibrationLedger, "function");
});

test("projectCalibrationLedger keeps financial settlements out of primary calibration rows", () => {
  const prediction = evaluation();
  const result = projectCalibrationLedger([prediction, settlement(prediction.id)]);

  assert.equal(result.rows.length, 1);
  assert.equal(result.summary.eligiblePredictionCount, 1);
  assert.equal(result.summary.settledPredictionCount, 0);
  assert.equal(result.summary.pendingPredictionCount, 1);
  assert.equal(result.summary.blockerCount, 0);
  assert.deepEqual(result.rows[0], {
    predictionId: prediction.id,
    eventId: "401816143",
    marketFamily: "pitcher_strikeouts",
    participantId: "4414215",
    side: "over",
    line: 5.5,
    price: 103,
    oppositePrice: -131,
    predictedProbability: 0.55,
    predictionAt: PREDICTION_AT,
    featureCutoffAt: FEATURE_AT,
    eventStartAt: EVENT_AT,
    settledAt: null,
    outcome: null,
    closingPrice: null,
    modelId: "poisson_count_v1",
    modelVersion: "1.0.0",
    sourceDigests: ["a".repeat(64)],
    sourceEvidence: [{
      sourceIdentifier: `mlb:official_context_only:${"a".repeat(64)}:${FEATURE_AT}`,
      capturedAt: FEATURE_AT,
      contentDigest: "a".repeat(64)
    }]
  });
});

test("projectCalibrationLedger settles a WAIT prediction from separate shadow evidence", () => {
  const prediction = evaluation();
  const outcome = predictionOutcome(prediction.id);
  const close = closingPrice(prediction.id);
  const result = projectCalibrationLedger([prediction, close, outcome]);

  assert.equal(result.rows.length, 1);
  assert.equal(result.rows[0].outcome, 0, JSON.stringify(result, null, 2));
  assert.equal(result.rows[0].settledAt, SETTLED_AT);
  assert.deepEqual(result.rows[0].closingPrice, {
    price: -125,
    oppositePrice: 105,
    capturedAt: CLOSING_CAPTURED_AT,
    marketClosedAt: MARKET_CLOSED_AT,
    isFinal: true
  });
  assert.equal(result.summary.settledPredictionCount, 1);
  assert.equal(result.summary.predictionOutcomeCount, 1);
  assert.equal(result.summary.closingPriceCount, 1);
  assert.equal(result.summary.invalidEvidenceReferenceCount, 0);
  assert.equal(result.summary.blockerCount, 0);
});

test("shadow closing-price consumption independently requires verified provider capture", () => {
  const prediction = evaluation();
  const outcome = predictionOutcome(prediction.id);
  const close = closingPriceAcceptedUpstreamButWeakerAtConsumption(prediction.id);
  const result = projectCalibrationLedger([prediction, close, outcome]);

  assert.equal(result.rows.length, 1);
  assert.equal(result.rows[0].outcome, null);
  assert.equal(result.rows[0].closingPrice, null);
  assert.equal(result.summary.settledPredictionCount, 0);
  assert.ok(result.blockers.some((blocker) => (
    blocker.code === "INVALID_SHADOW_EVIDENCE"
    && blocker.evaluationId === prediction.id
  )));
});

test("weaker shadow closes cannot settle rows or satisfy ledger report readiness", () => {
  const records = [];

  for (let index = 0; index < 3; index += 1) {
    const suffix = String(index + 1);
    const prediction = evaluation({
      event: {
        sport: "mlb",
        league: "MLB",
        eventId: `40181614${suffix}`,
        startTime: EVENT_AT,
        homeTeam: "Philadelphia Phillies",
        awayTeam: "New York Mets"
      }
    }, {
      clientEventId: `21111111-1111-4111-8111-11111111111${suffix}`,
      createdAt: `2026-07-17T12:0${index}:01.000Z`
    });
    records.push(
      prediction,
      closingPriceAcceptedUpstreamButWeakerAtConsumption(prediction.id, {
        clientEventId: `31111111-1111-4111-8111-11111111111${suffix}`
      }),
      predictionOutcome(prediction.id, {}, {
        clientEventId: `41111111-1111-4111-8111-11111111111${suffix}`
      })
    );
  }

  const projection = projectCalibrationLedger(records);
  const readiness = buildCalibrationReadiness(projection);

  assert.equal(projection.summary.eligiblePredictionCount, 3);
  assert.equal(projection.summary.settledPredictionCount, 0);
  assert.equal(projection.summary.blockerCount, 3);
  assert.equal(readiness.readyToBuildReport, false);
  assert.equal(readiness.readyForPromotion, false);
  assert.equal(projection.probabilityMetrics.promotionEligible, false);
});

test("projectCalibrationLedger requires both outcome and closing evidence for shadow settlement", () => {
  const prediction = evaluation();
  const outcomeOnly = projectCalibrationLedger([prediction, predictionOutcome(prediction.id)]);
  const closingOnly = projectCalibrationLedger([prediction, closingPrice(prediction.id)]);

  assert.equal(outcomeOnly.rows[0].outcome, null);
  assert.equal(outcomeOnly.rows[0].closingPrice, null);
  assert.ok(outcomeOnly.blockers.some((blocker) => blocker.code === "MISSING_FINAL_CLOSING_PRICE"));
  assert.equal(closingOnly.rows[0].outcome, null);
  assert.equal(closingOnly.rows[0].closingPrice, null);
  assert.ok(closingOnly.blockers.some((blocker) => blocker.code === "MISSING_PREDICTION_OUTCOME"));
});

test("projectCalibrationLedger scores outcome-only shadow probabilities without weakening priced promotion rows", () => {
  const prediction = evaluation({
    price: {
      sportsbook: "draftkings_predictions",
      marketOdds: 103,
      oppositeOdds: null,
      priceCapturedAt: FEATURE_AT,
      priceSourceTime: FEATURE_AT
    }
  });
  const result = projectCalibrationLedger([
    prediction,
    predictionOutcome(prediction.id)
  ]);

  assert.equal(result.rows.length, 0);
  assert.ok(result.exclusions.some((entry) => (
    entry.evaluationId === prediction.id
    && entry.codes.includes("MISSING_OPPOSITE_PRICE")
  )));
  assert.equal(result.probabilityRows.length, 1);
  assert.deepEqual(result.probabilityRows[0], {
    predictionId: prediction.id,
    eventId: "401816143",
    marketFamily: "pitcher_strikeouts",
    participantId: "4414215",
    side: "over",
    line: 5.5,
    predictedProbability: 0.55,
    predictionAt: PREDICTION_AT,
    featureCutoffAt: FEATURE_AT,
    eventStartAt: EVENT_AT,
    resolvedAt: SETTLED_AT,
    outcome: 0,
    modelId: "poisson_count_v1",
    modelVersion: "1.0.0",
    sourceDigests: ["a".repeat(64)],
    sourceEvidence: [{
      sourceIdentifier: `mlb:official_context_only:${"a".repeat(64)}:${FEATURE_AT}`,
      capturedAt: FEATURE_AT,
      contentDigest: "a".repeat(64)
    }]
  });
  assert.equal(result.summary.probabilityEligiblePredictionCount, 1);
  assert.equal(result.summary.probabilitySettledPredictionCount, 1);
  assert.equal(result.summary.probabilityPendingPredictionCount, 0);
  assert.equal(result.summary.settledPredictionCount, 0);
  assert.equal(result.probabilityMetrics.observationCount, 1);
  assert.equal(result.probabilityMetrics.brierScore, 0.30250000000000005);
  assert.ok(Math.abs(result.probabilityMetrics.logLoss - (-Math.log(0.45))) < 1e-15);
  assert.equal(result.probabilityMetrics.promotionEligible, false);

  const markdown = renderCalibrationReadinessMarkdown({
    generatedAt: "2026-07-17T23:00:00.000Z",
    projection: result,
    readiness: {
      status: "blocked",
      readyToBuildReport: false,
      reasonCodes: ["NO_ELIGIBLE_PREDICTIONS"]
    }
  });

  assert.match(markdown, /Outcome-only shadow predictions \| 1/);
  assert.match(markdown, /Outcome-only shadow results \| 1/);
  assert.match(markdown, /Outcome-only Brier score \| 0\.302500/);
  assert.match(markdown, /Outcome-only log loss \| 0\.798508/);
  assert.match(markdown, /Outcome-only metrics are diagnostic and never satisfy price\/CLV promotion gates\./);
});

test("outcome-only metrics exclude repeated market snapshots and separate exact model cohorts", () => {
  const first = evaluation({
    probability: {
      rawModelProbability: 0.2,
      adjustedProbability: 0.2,
      marketImpliedProbability: 0.49261083743842365,
      marketNoVigProbability: 0.512
    }
  }, {
    clientEventId: "12111111-1111-4111-8111-111111111111",
    createdAt: "2026-07-17T12:00:01.000Z"
  });
  const repeated = evaluation({
    probability: {
      rawModelProbability: 0.8,
      adjustedProbability: 0.8,
      marketImpliedProbability: 0.49261083743842365,
      marketNoVigProbability: 0.512
    }
  }, {
    clientEventId: "13111111-1111-4111-8111-111111111111",
    createdAt: "2026-07-17T12:05:01.000Z"
  });
  const otherModel = evaluation({
    model: {
      modelId: "negative_binomial_count_v1",
      modelVersion: "2.0.0",
      probabilityMethod: "negative_binomial_count",
      modelStatus: "research_only",
      calibrationReportId: null,
      trainingCutoff: "2026-07-16T00:00:00.000Z",
      sampleSize: 54
    },
    probability: {
      rawModelProbability: 0.7,
      adjustedProbability: 0.7,
      marketImpliedProbability: 0.49261083743842365,
      marketNoVigProbability: 0.512
    }
  }, {
    clientEventId: "14111111-1111-4111-8111-111111111111",
    createdAt: "2026-07-17T12:10:01.000Z"
  });
  const result = projectCalibrationLedger([
    repeated,
    predictionOutcome(repeated.id, {}, {
      clientEventId: "16111111-1111-4111-8111-111111111111"
    }),
    otherModel,
    predictionOutcome(otherModel.id, {}, {
      clientEventId: "17111111-1111-4111-8111-111111111111"
    }),
    first,
    predictionOutcome(first.id, {}, {
      clientEventId: "15111111-1111-4111-8111-111111111111"
    })
  ]);

  assert.equal(result.probabilityRows.length, 3);
  assert.equal(result.probabilityMetrics.rawObservationCount, 3);
  assert.equal(result.probabilityMetrics.observationCount, 2);
  assert.equal(result.probabilityMetrics.distinctMarketOutcomeCount, 1);
  assert.equal(result.probabilityMetrics.repeatedObservationCount, 1);
  assert.equal(result.probabilityMetrics.cohortCount, 2);
  assert.equal(
    result.probabilityMetrics.selectionPolicy,
    "earliest_prediction_per_event_market_participant_side_line_model"
  );
  assert.deepEqual(result.probabilityMetrics.metricPredictionIds, [first.id, otherModel.id]);
  assert.deepEqual(result.probabilityMetrics.repeatedPredictionIds, [repeated.id]);
  assert.ok(Math.abs(result.probabilityMetrics.brierScore - 0.265) < 1e-15);
  assert.ok(Math.abs(
    result.probabilityMetrics.logLoss - ((-Math.log(0.8) - Math.log(0.3)) / 2)
  ) < 1e-15);
  assert.deepEqual(result.probabilityMetrics.cohorts.map((cohort) => ({
    marketFamily: cohort.marketFamily,
    modelId: cohort.modelId,
    modelVersion: cohort.modelVersion,
    rawObservationCount: cohort.rawObservationCount,
    observationCount: cohort.observationCount,
    repeatedObservationCount: cohort.repeatedObservationCount
  })), [
    {
      marketFamily: "pitcher_strikeouts",
      modelId: "negative_binomial_count_v1",
      modelVersion: "2.0.0",
      rawObservationCount: 1,
      observationCount: 1,
      repeatedObservationCount: 0
    },
    {
      marketFamily: "pitcher_strikeouts",
      modelId: "poisson_count_v1",
      modelVersion: "1.0.0",
      rawObservationCount: 2,
      observationCount: 1,
      repeatedObservationCount: 1
    }
  ]);

  const markdown = renderCalibrationReadinessMarkdown({
    generatedAt: "2026-07-17T23:00:00.000Z",
    projection: result,
    readiness: {
      status: "blocked",
      readyToBuildReport: false,
      reasonCodes: ["NO_ELIGIBLE_PREDICTIONS"]
    }
  });

  assert.match(markdown, /Raw settled outcome snapshots \| 3/);
  assert.match(markdown, /Unique model-outcome observations used \| 2/);
  assert.match(markdown, /Distinct market outcomes represented \| 1/);
  assert.match(markdown, /Repeated snapshots excluded \| 1/);
  assert.match(markdown, /negative_binomial_count_v1 \| 2\.0\.0 \| 1 \| 1 \| 0/);
  assert.match(markdown, /poisson_count_v1 \| 1\.0\.0 \| 2 \| 1 \| 1/);
  assert.match(markdown, /earliest preregistered prediction/i);
});

test("outcome-only metrics benchmark forecasts with event-cluster uncertainty", () => {
  const first = evaluation({
    probability: {
      rawModelProbability: 0.9,
      adjustedProbability: 0.9,
      marketImpliedProbability: 0.49261083743842365,
      marketNoVigProbability: 0.512
    }
  }, {
    clientEventId: "18111111-1111-4111-8111-111111111111",
    createdAt: "2026-07-17T12:00:01.000Z"
  });
  const second = evaluation({
    event: {
      sport: "mlb",
      league: "MLB",
      eventId: "401816144",
      startTime: EVENT_AT,
      homeTeam: "Boston Red Sox",
      awayTeam: "Chicago Cubs"
    },
    probability: {
      rawModelProbability: 0.6,
      adjustedProbability: 0.6,
      marketImpliedProbability: 0.49261083743842365,
      marketNoVigProbability: 0.512
    }
  }, {
    clientEventId: "19111111-1111-4111-8111-111111111111",
    createdAt: "2026-07-17T12:05:01.000Z"
  });
  const result = projectCalibrationLedger([
    first,
    predictionOutcome(first.id, {
      outcome: "win",
      marketResult: { observedValue: 7, unit: "strikeouts" }
    }, {
      clientEventId: "1a111111-1111-4111-8111-111111111111"
    }),
    second,
    predictionOutcome(second.id, {}, {
      clientEventId: "1b111111-1111-4111-8111-111111111111"
    })
  ]);
  const metrics = result.probabilityMetrics;
  const expectedBrier = (0.01 + 0.36) / 2;
  const expectedLogLoss = (-Math.log(0.9) - Math.log(0.4)) / 2;

  assert.ok(Math.abs(metrics.brierScore - expectedBrier) < 1e-15);
  assert.ok(Math.abs(metrics.logLoss - expectedLogLoss) < 1e-15);
  assert.deepEqual(metrics.diagnosticBenchmark, {
    benchmarkId: "fixed_binary_probability_0_5",
    probability: 0.5,
    brierScore: 0.25,
    logLoss: Math.log(2),
    role: "diagnostic_only_not_promotion_baseline"
  });
  assert.ok(Math.abs(metrics.comparison.brierScoreDelta - (expectedBrier - 0.25)) < 1e-15);
  assert.ok(Math.abs(metrics.comparison.logLossDelta - (expectedLogLoss - Math.log(2))) < 1e-15);
  assert.ok(Math.abs(metrics.comparison.brierSkillScore - 0.26) < 1e-15);
  assert.equal(metrics.comparison.negativeDeltaFavorsModel, true);
  assert.equal(metrics.comparison.conclusivelyBetterAtConfidence, false);
  assert.equal(metrics.uncertainty.status, "available");
  assert.equal(metrics.uncertainty.method, "event_cluster_percentile_bootstrap");
  assert.equal(metrics.uncertainty.eventClusterCount, 2);
  assert.equal(metrics.uncertainty.resamples, 2000);
  assert.equal(metrics.uncertainty.confidenceLevel, 0.95);
  assert.ok(metrics.uncertainty.intervals.brierScoreDelta.lower < 0);
  assert.ok(metrics.uncertainty.intervals.brierScoreDelta.upper > 0);
  assert.equal(metrics.cohorts[0].uncertainty.eventClusterCount, 2);
  assert.equal(metrics.cohorts[0].comparison.conclusivelyBetterAtConfidence, false);

  const markdown = renderCalibrationReadinessMarkdown({
    generatedAt: "2026-07-17T23:00:00.000Z",
    projection: result,
    readiness: {
      status: "blocked",
      readyToBuildReport: false,
      reasonCodes: ["NO_ELIGIBLE_PREDICTIONS"]
    }
  });

  assert.match(markdown, /Diagnostic 50\/50 Brier benchmark \| 0\.250000/);
  assert.match(markdown, /Brier delta vs 50\/50 \| -0\.065000/);
  assert.match(markdown, /Event clusters used for uncertainty \| 2/);
  assert.match(markdown, /Conclusive improvement at 95% \| No/);
  assert.match(markdown, /not the required no-vig market promotion baseline/i);
});

test("projectCalibrationLedger applies the latest linear shadow evidence corrections", () => {
  const prediction = evaluation();
  const firstOutcome = predictionOutcome(prediction.id);
  const correctedOutcome = predictionOutcome(prediction.id, {
    supersedesId: firstOutcome.id,
    outcome: "win",
    marketResult: { observedValue: 6, unit: "strikeouts" }
  }, {
    clientEventId: "88888888-8888-4888-8888-888888888888",
    createdAt: "2026-07-17T22:37:00.000Z"
  });
  const firstClose = closingPrice(prediction.id);
  const correctedClose = closingPrice(prediction.id, {
    supersedesId: firstClose.id,
    price: {
      sportsbook: "draftkings",
      marketOdds: -118,
      oppositeOdds: 100,
      marketClosedAt: MARKET_CLOSED_AT,
      isFinal: true
    },
    source: {
      ...firstClose.source,
      capturedAt: "2026-07-17T19:10:10.000Z",
      digest: "f".repeat(64)
    }
  }, {
    clientEventId: "99999999-9999-4999-8999-999999999999",
    createdAt: "2026-07-17T19:12:00.000Z"
  });
  const result = projectCalibrationLedger([
    prediction,
    firstClose,
    correctedClose,
    firstOutcome,
    correctedOutcome
  ]);

  assert.equal(result.rows[0].outcome, 1, JSON.stringify(result, null, 2));
  assert.equal(result.rows[0].closingPrice.price, -118);
  assert.equal(result.summary.predictionOutcomeCount, 2);
  assert.equal(result.summary.closingPriceCount, 2);
});

test("projectCalibrationLedger blocks non-linear shadow evidence histories", () => {
  const prediction = evaluation();
  const first = predictionOutcome(prediction.id);
  const branch = predictionOutcome(prediction.id, {
    supersedesId: null
  }, {
    clientEventId: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
    createdAt: "2026-07-17T22:37:00.000Z"
  });
  const result = projectCalibrationLedger([prediction, closingPrice(prediction.id), first, branch]);

  assert.equal(result.summary.invalidEvidenceReferenceCount, 1);
  assert.equal(result.summary.settledPredictionCount, 0);
  assert.ok(result.blockers.some((blocker) => blocker.code === "INVALID_EVIDENCE_REFERENCE"));
});

test("projectCalibrationLedger gives repeated content captures distinct source identities", () => {
  const first = evaluation();
  const secondFeatureAt = "2026-07-17T12:05:00.000Z";
  const second = evaluation({
    event: {
      sport: "mlb",
      league: "MLB",
      eventId: "401816144",
      startTime: EVENT_AT,
      homeTeam: "Atlanta Braves",
      awayTeam: "Miami Marlins"
    },
    sources: [{
      provider: "mlb",
      sourceType: "official_context_only",
      sourceLocator: "https://statsapi.mlb.com/example",
      parserVersion: "candidate_serializer_v1",
      capturedAt: secondFeatureAt,
      sourceTime: secondFeatureAt,
      digest: "a".repeat(64),
      freshness: "fresh",
      verificationStatus: "official_context_only"
    }]
  }, {
    clientEventId: "55555555-5555-4555-8555-555555555555",
    createdAt: "2026-07-17T12:05:01.000Z"
  });
  const result = projectCalibrationLedger([first, second]);

  assert.equal(result.rows.length, 2);
  assert.notEqual(
    result.rows[0].sourceEvidence[0].sourceIdentifier,
    result.rows[1].sourceEvidence[0].sourceIdentifier
  );
});

test("projectCalibrationLedger ignores incomplete financial closing evidence", () => {
  const prediction = evaluation();
  const incomplete = settlement(prediction.id, { closingLineEvidence: null });
  const result = projectCalibrationLedger([prediction, incomplete]);

  assert.equal(result.rows.length, 1);
  assert.equal(result.rows[0].outcome, null);
  assert.equal(result.rows[0].settledAt, null);
  assert.equal(result.rows[0].closingPrice, null);
  assert.equal(result.summary.settledPredictionCount, 0);
  assert.equal(result.summary.blockerCount, 0);
});

test("settlement amendments remain bookkeeping-only in calibration projection", () => {
  const prediction = evaluation();
  const original = settlement(prediction.id);
  const amendment = createAmendmentRecord({
    evaluationId: prediction.id,
    settlementId: original.id,
    reason: "Official scoring correction",
    patch: {
      outcome: "loss",
      profit: -10,
      closingOdds: -118,
      closingOppositeOdds: 100,
      closingLineEvidence: closingLineEvidence({
        capturedAt: "2026-07-17T19:10:10.000Z",
        sourceDigest: "d".repeat(64)
      })
    }
  }, {
    clientEventId: "33333333-3333-4333-8333-333333333333",
    createdAt: "2026-07-17T23:00:00.000Z"
  });
  const result = projectCalibrationLedger([prediction, original, amendment]);

  assert.equal(result.rows[0].outcome, null);
  assert.equal(result.rows[0].settledAt, null);
  assert.equal(result.rows[0].closingPrice, null);
  assert.equal(result.summary.settledPredictionCount, 0);
  assert.equal(result.summary.amendmentCount, 1);
});

test("projectCalibrationLedger excludes legacy and malformed evidence without inventing rows", () => {
  const prediction = evaluation({
    event: {
      sport: "mlb",
      league: "MLB",
      eventId: null,
      startTime: EVENT_AT,
      homeTeam: "Philadelphia Phillies",
      awayTeam: "New York Mets"
    }
  }, {
    clientEventId: "44444444-4444-4444-8444-444444444444"
  });
  const result = projectCalibrationLedger([
    { timestamp: PREDICTION_AT, selection: "Legacy prediction", verdict: "BET" },
    prediction
  ]);

  assert.equal(result.rows.length, 0);
  assert.equal(result.summary.legacyRecordCount, 1);
  assert.equal(result.summary.excludedEvaluationCount, 1);
  assert.ok(result.exclusions.some((entry) => entry.codes.includes("MISSING_EVENT_ID")));
});
