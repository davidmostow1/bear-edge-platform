const test = require("node:test");
const assert = require("node:assert/strict");

const {
  compareModels,
  classificationCredit,
  clusterDeltasByEvent,
  pairedBrierDeltas,
  scoreRows
} = require("../src/showdown/compare.js");
const { pairPredictions, summarizeModelMissingness } = require("../src/showdown/pairing.js");
const {
  buildMarketBaselineRecord,
  computeClosingLineValue
} = require("../src/showdown/market-baseline.js");
const { parsePredictionRecord } = require("../src/showdown/records.js");

const DIGEST = "b".repeat(64);

function prediction(modelKey, comparisonKey, probability, overrides = {}) {
  return {
    schemaVersion: "1.0.0",
    predictionId: `${modelKey}-${comparisonKey}`,
    modelKey,
    modelId: `${modelKey}_v1`,
    modelVersion: "1.0.0",
    implementationDigest: DIGEST,
    comparisonKey,
    eventId: overrides.eventId ?? comparisonKey.split("|")[0],
    marketFamily: "pitcher_strikeouts",
    selectionKey: "pitcher|over|5.5",
    probability,
    eventStartAt: "2026-07-28T23:10:00Z",
    evidenceCutoffAt: "2026-07-28T21:10:00Z",
    predictedAt: "2026-07-28T21:11:00Z",
    ...overrides
  };
}

function outcome(comparisonKey, result, eventId) {
  return {
    schemaVersion: "1.0.0",
    comparisonKey,
    eventId: eventId ?? comparisonKey.split("|")[0],
    eventStartAt: "2026-07-28T23:10:00Z",
    result,
    officialSource: "official_mlb",
    officialSourceUrl: "https://www.mlb.com/gameday/1",
    settledAt: "2026-07-29T02:30:00Z",
    eventStartAtMs: Date.parse("2026-07-28T23:10:00Z"),
    settledAtMs: Date.parse("2026-07-29T02:30:00Z")
  };
}

test("scoreRows reproduces Brier and accuracy by hand", () => {
  const scored = scoreRows([
    { probability: 0.8, outcome: 1 },
    { probability: 0.3, outcome: 0 }
  ]);

  const expectedBrier = (((0.8 - 1) ** 2) + ((0.3 - 0) ** 2)) / 2;

  assert.ok(Math.abs(scored.meanBrier - expectedBrier) < 1e-15);
  assert.equal(scored.classificationAccuracy, 1);
});

test("classificationCredit treats an exact coin flip as asserting nothing", () => {
  assert.equal(classificationCredit(0.5, 1), 0.5);
  assert.equal(classificationCredit(0.5, 0), 0.5);
  assert.equal(classificationCredit(0.51, 1), 1);
  assert.equal(classificationCredit(0.51, 0), 0);
});

test("day zero reports INSUFFICIENT_SAMPLE with no leader", () => {
  const comparison = compareModels({ pairs: [] });

  assert.equal(comparison.status, "INSUFFICIENT_SAMPLE");
  assert.equal(comparison.provisionalLeader, "unavailable");
  assert.equal(comparison.authorizedWinner, null);
  assert.equal(comparison.pairedPredictions, 0);
  assert.equal(comparison.distinctEvents, 0);
  assert.equal(comparison.headToHead.lower, null);
  assert.equal(comparison.headToHead.upper, null);
});

test("pairing excludes a comparison only one model answered", () => {
  const predictions = [
    parsePredictionRecord(prediction("sweet_bear", "event-1|p|strikeouts|over|5.5", 0.6)),
    parsePredictionRecord(prediction("sweet_bear", "event-2|p|strikeouts|over|5.5", 0.6)),
    parsePredictionRecord(prediction("bear_edge", "event-1|p|strikeouts|over|5.5", 0.4))
  ];
  const outcomes = [
    outcome("event-1|p|strikeouts|over|5.5", 1),
    outcome("event-2|p|strikeouts|over|5.5", 1)
  ];

  const { pairs, exclusionCounts } = pairPredictions({ predictions, outcomes });

  assert.equal(pairs.length, 1);
  assert.equal(exclusionCounts.missing_model_prediction, 1);
});

test("pairing excludes models given different evidence cutoffs", () => {
  const comparisonKey = "event-1|p|strikeouts|over|5.5";
  const predictions = [
    parsePredictionRecord(prediction("sweet_bear", comparisonKey, 0.6)),
    parsePredictionRecord(prediction("bear_edge", comparisonKey, 0.4, {
      evidenceCutoffAt: "2026-07-28T22:00:00Z",
      predictedAt: "2026-07-28T22:30:00Z"
    }))
  ];

  const { pairs, exclusionCounts } = pairPredictions({
    predictions,
    outcomes: [outcome(comparisonKey, 1)]
  });

  assert.equal(pairs.length, 0);
  assert.equal(exclusionCounts.evidence_cutoff_mismatch, 1);
});

test("pairing excludes comparisons with no official outcome", () => {
  const comparisonKey = "event-1|p|strikeouts|over|5.5";
  const predictions = [
    parsePredictionRecord(prediction("sweet_bear", comparisonKey, 0.6)),
    parsePredictionRecord(prediction("bear_edge", comparisonKey, 0.4))
  ];

  const { pairs, exclusionCounts } = pairPredictions({ predictions, outcomes: [] });

  assert.equal(pairs.length, 0);
  assert.equal(exclusionCounts.no_official_outcome, 1);
});

test("pairing excludes market families outside the configured scope", () => {
  const comparisonKey = "event-1|team|moneyline|home|0";
  const predictions = [
    parsePredictionRecord(prediction("sweet_bear", comparisonKey, 0.6, {
      marketFamily: "game_moneyline",
      selectionKey: "home"
    })),
    parsePredictionRecord(prediction("bear_edge", comparisonKey, 0.4, {
      marketFamily: "game_moneyline",
      selectionKey: "home"
    }))
  ];

  const { pairs, exclusionCounts } = pairPredictions({
    predictions,
    outcomes: [outcome(comparisonKey, 1)],
    marketFamilies: ["pitcher_strikeouts"]
  });

  assert.equal(pairs.length, 0);
  assert.equal(exclusionCounts.out_of_scope_market_family, 1);
});

test("missingness summary records asymmetric absence", () => {
  const predictions = [
    parsePredictionRecord(prediction("sweet_bear", "event-1|p|strikeouts|over|5.5", 0.6)),
    parsePredictionRecord(prediction("sweet_bear", "event-2|p|strikeouts|over|5.5", 0.6)),
    parsePredictionRecord(prediction("sweet_bear", "event-3|p|strikeouts|over|5.5", 0.6)),
    parsePredictionRecord(prediction("bear_edge", "event-1|p|strikeouts|over|5.5", 0.4))
  ];

  const summary = summarizeModelMissingness(predictions);

  assert.equal(summary.sweet_bear.produced, 3);
  assert.equal(summary.sweet_bear.absentWhenOthersProduced, 0);
  assert.equal(summary.bear_edge.produced, 1);
  assert.equal(summary.bear_edge.absentWhenOthersProduced, 2);
});

test("paired Brier delta is negative when Sweet Bear is closer to the truth", () => {
  const pairs = [
    {
      comparisonKey: "k",
      eventId: "event-1",
      result: 1,
      predictionsByModel: {
        sweet_bear: { probability: 0.9 },
        bear_edge: { probability: 0.2 }
      }
    }
  ];

  const deltas = pairedBrierDeltas(pairs, "sweet_bear", "bear_edge");

  assert.equal(deltas.length, 1);
  assert.ok(deltas[0].delta < 0);
});

test("clusterDeltasByEvent keeps same-event observations together", () => {
  const clusters = clusterDeltasByEvent([
    { eventId: "event-1", delta: -0.1 },
    { eventId: "event-1", delta: -0.2 },
    { eventId: "event-2", delta: 0.3 }
  ]);

  assert.equal(clusters.length, 2);
  assert.deepEqual(clusters.find((cluster) => cluster.length === 2), [-0.1, -0.2]);
});

test("the gate refuses a winner on a large but single-event sample", () => {
  const pairs = Array.from({ length: 600 }, (unused, index) => ({
    comparisonKey: `k-${index}`,
    eventId: "event-1",
    result: 1,
    predictionsByModel: {
      sweet_bear: { probability: 0.9 },
      bear_edge: { probability: 0.2 }
    }
  }));

  const comparison = compareModels({ pairs });

  assert.equal(comparison.pairedPredictions, 600);
  assert.equal(comparison.distinctEvents, 1);
  assert.equal(comparison.gate.pairedPredictionsMet, true);
  assert.equal(comparison.gate.distinctEventsMet, false);
  assert.equal(comparison.status, "INSUFFICIENT_SAMPLE");
  assert.equal(comparison.authorizedWinner, null);
  assert.equal(comparison.provisionalLeader, "sweet_bear");
});

test("the gate authorizes a winner only when all three conditions clear", () => {
  const pairs = Array.from({ length: 600 }, (unused, index) => ({
    comparisonKey: `k-${index}`,
    eventId: `event-${index % 120}`,
    result: 1,
    predictionsByModel: {
      sweet_bear: { probability: 0.9 },
      bear_edge: { probability: 0.2 }
    }
  }));

  const comparison = compareModels({ pairs });

  assert.equal(comparison.gate.pairedPredictionsMet, true);
  assert.equal(comparison.gate.distinctEventsMet, true);
  assert.equal(comparison.gate.intervalExcludesZero, true);
  assert.equal(comparison.status, "WINNER_AUTHORIZED");
  assert.equal(comparison.authorizedWinner, "sweet_bear");
});

test("two identical models clear the sample gate but report no separation", () => {
  const pairs = Array.from({ length: 600 }, (unused, index) => ({
    comparisonKey: `k-${index}`,
    eventId: `event-${index % 120}`,
    result: index % 2,
    predictionsByModel: {
      sweet_bear: { probability: 0.55 },
      bear_edge: { probability: 0.55 }
    }
  }));

  const comparison = compareModels({ pairs });

  assert.equal(comparison.gate.pairedPredictionsMet, true);
  assert.equal(comparison.gate.distinctEventsMet, true);
  assert.equal(comparison.gate.intervalExcludesZero, false);
  assert.equal(comparison.status, "NO_SEPARATION");
  assert.equal(comparison.authorizedWinner, null);
});

test("bootstrap results are deterministic under a fixed seed", () => {
  const pairs = Array.from({ length: 600 }, (unused, index) => ({
    comparisonKey: `k-${index}`,
    eventId: `event-${index % 120}`,
    result: index % 3 === 0 ? 0 : 1,
    predictionsByModel: {
      sweet_bear: { probability: 0.7 },
      bear_edge: { probability: 0.45 }
    }
  }));

  const first = compareModels({ pairs, bootstrapSeed: 12345 });
  const second = compareModels({ pairs, bootstrapSeed: 12345 });

  assert.equal(first.headToHead.lower, second.headToHead.lower);
  assert.equal(first.headToHead.upper, second.headToHead.upper);
});

test("market baseline devigs a standard two-way price", () => {
  const record = buildMarketBaselineRecord({
    comparisonKey: "event-1|pitcher|strikeouts|over|5.5",
    eventId: "event-1",
    marketFamily: "pitcher_strikeouts",
    selectionKey: "pitcher|over|5.5",
    selectionAmericanOdds: -110,
    oppositeAmericanOdds: -110,
    eventStartAt: "2026-07-28T23:10:00Z",
    evidenceCutoffAt: "2026-07-28T21:10:00Z",
    predictedAt: "2026-07-28T21:11:00Z",
    priceSource: "the_odds_api",
    priceObservedAt: "2026-07-28T21:09:00Z"
  });

  assert.equal(record.modelKey, "market_baseline");
  assert.ok(Math.abs(record.probability - 0.5) < 1e-12);
  assert.ok(record.marketVig > 0.04 && record.marketVig < 0.05);
  parsePredictionRecord(record);
});

test("market baseline refuses a price pair implying arbitrage", () => {
  assert.throws(
    () => buildMarketBaselineRecord({
      comparisonKey: "event-1|pitcher|strikeouts|over|5.5",
      eventId: "event-1",
      marketFamily: "pitcher_strikeouts",
      selectionKey: "pitcher|over|5.5",
      selectionAmericanOdds: 150,
      oppositeAmericanOdds: 150,
      eventStartAt: "2026-07-28T23:10:00Z",
      evidenceCutoffAt: "2026-07-28T21:10:00Z",
      predictedAt: "2026-07-28T21:11:00Z",
      priceSource: "the_odds_api",
      priceObservedAt: "2026-07-28T21:09:00Z"
    }),
    /Negative vig/
  );
});

test("market baseline refuses an unattributed price", () => {
  assert.throws(
    () => buildMarketBaselineRecord({
      comparisonKey: "event-1|pitcher|strikeouts|over|5.5",
      eventId: "event-1",
      marketFamily: "pitcher_strikeouts",
      selectionKey: "pitcher|over|5.5",
      selectionAmericanOdds: -110,
      oppositeAmericanOdds: -110,
      eventStartAt: "2026-07-28T23:10:00Z",
      evidenceCutoffAt: "2026-07-28T21:10:00Z",
      predictedAt: "2026-07-28T21:11:00Z",
      priceSource: "",
      priceObservedAt: "2026-07-28T21:09:00Z"
    }),
    /priceSource is required/
  );
});

test("closing line value is positive when the market moves toward the taken side", () => {
  const clv = computeClosingLineValue({
    entryAmericanOdds: 100,
    entryOppositeAmericanOdds: -120,
    closingAmericanOdds: -130,
    closingOppositeAmericanOdds: 110
  });

  assert.ok(clv.clvProbabilityPoints > 0);
  assert.equal(clv.beatClose, true);
  assert.ok(clv.clvDecimalPercent > 0);
});

test("closing line value is negative when the market moves away", () => {
  const clv = computeClosingLineValue({
    entryAmericanOdds: -130,
    entryOppositeAmericanOdds: 110,
    closingAmericanOdds: 100,
    closingOppositeAmericanOdds: -120
  });

  assert.ok(clv.clvProbabilityPoints < 0);
  assert.equal(clv.beatClose, false);
});

test("market baseline is scored alongside both models when present", () => {
  const comparisonKey = "event-1|p|strikeouts|over|5.5";
  const predictions = [
    parsePredictionRecord(prediction("sweet_bear", comparisonKey, 0.6)),
    parsePredictionRecord(prediction("bear_edge", comparisonKey, 0.4)),
    parsePredictionRecord(prediction("market_baseline", comparisonKey, 0.52))
  ];

  const { pairs } = pairPredictions({
    predictions,
    outcomes: [outcome(comparisonKey, 1)]
  });
  const comparison = compareModels({ pairs });

  assert.equal(pairs.length, 1);
  assert.ok(comparison.scores.market_baseline);
  assert.equal(comparison.scores.market_baseline.count, 1);
});
