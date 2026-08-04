const test = require("node:test");
const assert = require("node:assert/strict");

const {
  findDuplicatePredictions,
  parseOutcomeRecord,
  parsePredictionRecord
} = require("../src/showdown/records.js");

const DIGEST = "a".repeat(64);

function basePrediction(overrides = {}) {
  return {
    schemaVersion: "1.0.0",
    predictionId: "pred-1",
    modelKey: "sweet_bear",
    modelId: "pitcher_strikeouts_poisson_v1",
    modelVersion: "1.0.0",
    implementationDigest: DIGEST,
    comparisonKey: "mlb-event|pitcher|strikeouts|over|5.5",
    eventId: "event-1",
    marketFamily: "pitcher_strikeouts",
    selectionKey: "pitcher|over|5.5",
    probability: 0.54,
    eventStartAt: "2026-07-28T23:10:00Z",
    evidenceCutoffAt: "2026-07-28T21:10:00Z",
    predictedAt: "2026-07-28T21:11:00Z",
    ...overrides
  };
}

function baseOutcome(overrides = {}) {
  return {
    schemaVersion: "1.0.0",
    comparisonKey: "mlb-event|pitcher|strikeouts|over|5.5",
    eventId: "event-1",
    eventStartAt: "2026-07-28T23:10:00Z",
    result: 1,
    officialSource: "official_mlb",
    officialSourceUrl: "https://www.mlb.com/gameday/1",
    settledAt: "2026-07-29T02:30:00Z",
    ...overrides
  };
}

test("parsePredictionRecord accepts a well-formed record", () => {
  const parsed = parsePredictionRecord(basePrediction());

  assert.equal(parsed.modelKey, "sweet_bear");
  assert.equal(parsed.probability, 0.54);
  assert.ok(parsed.evidenceCutoffAtMs <= parsed.predictedAtMs);
  assert.ok(parsed.predictedAtMs <= parsed.eventStartAtMs);
});

test("parsePredictionRecord rejects a prediction made after first pitch", () => {
  assert.throws(
    () => parsePredictionRecord(basePrediction({
      predictedAt: "2026-07-28T23:40:00Z"
    })),
    /predictedAt must not follow eventStartAt/
  );
});

test("parsePredictionRecord rejects evidence gathered after the prediction", () => {
  assert.throws(
    () => parsePredictionRecord(basePrediction({
      evidenceCutoffAt: "2026-07-28T22:00:00Z",
      predictedAt: "2026-07-28T21:11:00Z"
    })),
    /evidenceCutoffAt must not follow predictedAt/
  );
});

test("parsePredictionRecord rejects probabilities at the boundaries", () => {
  assert.throws(
    () => parsePredictionRecord(basePrediction({ probability: 0 })),
    /strictly between zero and one/
  );
  assert.throws(
    () => parsePredictionRecord(basePrediction({ probability: 1 })),
    /strictly between zero and one/
  );
});

test("parsePredictionRecord rejects a malformed implementation digest", () => {
  assert.throws(
    () => parsePredictionRecord(basePrediction({ implementationDigest: "abc" })),
    /64-character lowercase sha256/
  );
});

test("parsePredictionRecord rejects an underspecified comparison key", () => {
  assert.throws(
    () => parsePredictionRecord(basePrediction({ comparisonKey: "event|over" })),
    /event, subject, market, selection, and line/
  );
});

test("parsePredictionRecord rejects an unknown model key", () => {
  assert.throws(
    () => parsePredictionRecord(basePrediction({ modelKey: "mystery_model" })),
    /modelKey must be one of/
  );
});

test("parseOutcomeRecord rejects pushes and non-binary results", () => {
  assert.throws(
    () => parseOutcomeRecord(baseOutcome({ result: 0.5 })),
    /pushes, voids, and unresolved corrections/
  );
  assert.throws(
    () => parseOutcomeRecord(baseOutcome({ result: "push" })),
    /pushes, voids, and unresolved corrections/
  );
});

test("parseOutcomeRecord rejects unofficial settlement sources", () => {
  assert.throws(
    () => parseOutcomeRecord(baseOutcome({ officialSource: "draftkings" })),
    /officialSource must be official_mlb/
  );
});

test("parseOutcomeRecord rejects settlement before the event started", () => {
  assert.throws(
    () => parseOutcomeRecord(baseOutcome({ settledAt: "2026-07-28T20:00:00Z" })),
    /settledAt must not precede eventStartAt/
  );
});

test("findDuplicatePredictions catches restated comparisons", () => {
  const predictions = [
    parsePredictionRecord(basePrediction()),
    parsePredictionRecord(basePrediction({
      predictionId: "pred-2",
      probability: 0.61
    }))
  ];

  const duplicates = findDuplicatePredictions(predictions);

  assert.equal(duplicates.length, 1);
  assert.match(duplicates[0].reason, /append-only/);
});

test("findDuplicatePredictions catches reused prediction identifiers", () => {
  const predictions = [
    parsePredictionRecord(basePrediction()),
    parsePredictionRecord(basePrediction({
      comparisonKey: "mlb-event|pitcher|strikeouts|over|6.5"
    }))
  ];

  const duplicates = findDuplicatePredictions(predictions);

  assert.equal(duplicates.length, 1);
  assert.match(duplicates[0].reason, /duplicate predictionId/);
});
