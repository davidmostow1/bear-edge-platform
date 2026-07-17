const test = require("node:test");
const assert = require("node:assert/strict");

const {
  buildDatasetManifest,
  chronologicalSplit,
  detectLeakage,
  validatePredictionRow
} = require("../src/calibration/dataset.js");

const SOURCE_DIGEST_A = "a".repeat(64);
const SOURCE_DIGEST_B = "b".repeat(64);

const BASE_ROW = Object.freeze({
  predictionId: "prediction-001",
  eventId: "event-001",
  marketFamily: "pitcher_strikeouts",
  participantId: "player-001",
  side: "over",
  line: 5.5,
  price: 103,
  oppositePrice: -131,
  predictedProbability: 0.54,
  predictionAt: "2026-07-17T18:00:00.000Z",
  featureCutoffAt: "2026-07-17T17:59:00.000Z",
  eventStartAt: "2026-07-17T23:00:00.000Z",
  settledAt: "2026-07-18T02:30:00.000Z",
  outcome: 1,
  closingPrice: Object.freeze({
    price: -105,
    oppositePrice: -115,
    capturedAt: "2026-07-17T23:00:00.000Z",
    marketClosedAt: "2026-07-17T22:59:00.000Z",
    isFinal: true
  }),
  modelId: "poisson_count_v1",
  modelVersion: "1.0.0",
  sourceDigests: Object.freeze([SOURCE_DIGEST_A])
});

/**
 * @param {Record<string, any>} [overrides]
 * @returns {Record<string, any>}
 */
function predictionRow(overrides = {}) {
  return {
    ...BASE_ROW,
    closingPrice: { ...BASE_ROW.closingPrice },
    sourceDigests: [...BASE_ROW.sourceDigests],
    ...overrides
  };
}

function issueCodes(row) {
  return validatePredictionRow(row).map((issue) => issue.code);
}

function timestampFor(day) {
  return `2026-07-${String(day).padStart(2, "0")}T18:00:00.000Z`;
}

/**
 * @param {number} index
 * @param {string} [predictionAt]
 * @returns {Record<string, any>}
 */
function chronologicalRow(index, predictionAt = timestampFor(index + 1)) {
  const eventDay = index + 2;
  const settledDay = index + 3;

  return predictionRow({
    predictionId: `prediction-${String(index + 1).padStart(3, "0")}`,
    eventId: `event-${String(index + 1).padStart(3, "0")}`,
    participantId: `player-${String(index + 1).padStart(3, "0")}`,
    line: 5.5 + index,
    predictionAt,
    featureCutoffAt: predictionAt.replace("18:00:00.000Z", "17:59:00.000Z"),
    eventStartAt: timestampFor(eventDay).replace("18:00:00.000Z", "23:00:00.000Z"),
    settledAt: timestampFor(settledDay).replace("18:00:00.000Z", "02:30:00.000Z"),
    closingPrice: {
      price: -105,
      oppositePrice: -115,
      capturedAt: timestampFor(eventDay).replace("18:00:00.000Z", "23:00:00.000Z"),
      marketClosedAt: timestampFor(eventDay).replace("18:00:00.000Z", "22:59:00.000Z"),
      isFinal: true
    }
  });
}

test("validatePredictionRow accepts a complete timestamp-safe row", () => {
  const row = predictionRow();

  assert.deepEqual(validatePredictionRow(row), []);
  assert.deepEqual(row, predictionRow());
});

test("validatePredictionRow rejects missing and malformed canonical fields", () => {
  const missing = predictionRow();
  delete missing.modelVersion;

  assert.ok(issueCodes(missing).includes("MISSING_FIELD"));
  assert.ok(issueCodes(predictionRow({ line: Number.NaN })).includes("INVALID_NUMBER"));
  assert.ok(issueCodes(predictionRow({ price: 0 })).includes("INVALID_PRICE"));
  assert.ok(
    issueCodes(predictionRow({ predictedProbability: 1.01 }))
      .includes("INVALID_PROBABILITY")
  );
  assert.ok(
    issueCodes(predictionRow({ predictionAt: "July 17" }))
      .includes("INVALID_TIMESTAMP")
  );
  assert.ok(
    issueCodes(predictionRow({ sourceDigests: ["not-a-digest"] }))
      .includes("INVALID_SOURCE_DIGEST")
  );
  assert.ok(
    issueCodes(predictionRow({ side: "higher" })).includes("INVALID_SIDE")
  );
  assert.ok(
    issueCodes(predictionRow({ predictionId: " prediction-001" }))
      .includes("INVALID_IDENTITY")
  );
});

test("validatePredictionRow blocks features captured after prediction", () => {
  const codes = issueCodes(predictionRow({
    featureCutoffAt: "2026-07-17T18:00:01.000Z"
  }));

  assert.ok(codes.includes("FEATURE_AFTER_PREDICTION"));
});

test("validatePredictionRow requires a prediction before event start", () => {
  const atStart = issueCodes(predictionRow({
    predictionAt: BASE_ROW.eventStartAt,
    featureCutoffAt: BASE_ROW.eventStartAt
  }));
  const afterStart = issueCodes(predictionRow({
    predictionAt: "2026-07-17T23:00:01.000Z",
    featureCutoffAt: "2026-07-17T23:00:00.000Z"
  }));

  assert.ok(atStart.includes("PREDICTION_NOT_BEFORE_EVENT"));
  assert.ok(afterStart.includes("PREDICTION_NOT_BEFORE_EVENT"));
});

test("validatePredictionRow rejects settlement before event start", () => {
  const codes = issueCodes(predictionRow({
    settledAt: "2026-07-17T22:59:59.000Z"
  }));

  assert.ok(codes.includes("SETTLEMENT_BEFORE_EVENT"));
});

test("validatePredictionRow requires settlement time and outcome together", () => {
  assert.ok(
    issueCodes(predictionRow({ settledAt: null })).includes("INCOMPLETE_SETTLEMENT")
  );
  assert.ok(
    issueCodes(predictionRow({ outcome: null })).includes("INCOMPLETE_SETTLEMENT")
  );
  assert.deepEqual(
    validatePredictionRow(predictionRow({ settledAt: null, outcome: null })),
    []
  );
});

test("validatePredictionRow rejects a final close captured before market close", () => {
  const prematureFinal = predictionRow({
    closingPrice: {
      ...BASE_ROW.closingPrice,
      capturedAt: "2026-07-17T22:58:59.000Z"
    }
  });
  const nonFinal = predictionRow({
    closingPrice: {
      ...BASE_ROW.closingPrice,
      capturedAt: "2026-07-17T22:58:59.000Z",
      isFinal: false
    }
  });

  assert.ok(
    issueCodes(prematureFinal).includes("FINAL_PRICE_BEFORE_MARKET_CLOSE")
  );
  assert.equal(
    issueCodes(nonFinal).includes("FINAL_PRICE_BEFORE_MARKET_CLOSE"),
    false
  );
});

test("detectLeakage identifies duplicate identifiers and observation keys", () => {
  const first = predictionRow();
  const duplicateId = predictionRow({
    eventId: "event-002",
    participantId: "player-002"
  });
  const duplicateObservation = predictionRow({
    predictionId: "prediction-002",
    predictionAt: "2026-07-17T18:01:00.000Z",
    featureCutoffAt: "2026-07-17T18:00:30.000Z"
  });
  const findings = detectLeakage([first, duplicateId, duplicateObservation]);

  assert.deepEqual(
    findings.filter((finding) => finding.code === "DUPLICATE_PREDICTION_ID")
      .map((finding) => [finding.firstRowIndex, finding.rowIndex]),
    [[0, 1]]
  );
  assert.deepEqual(
    findings.filter((finding) => finding.code === "DUPLICATE_OBSERVATION")
      .map((finding) => [finding.firstRowIndex, finding.rowIndex]),
    [[0, 2]]
  );
});

test("detectLeakage keeps opposite sides at the same line distinct", () => {
  const over = predictionRow();
  const under = predictionRow({
    predictionId: "prediction-002",
    side: "under",
    predictionAt: "2026-07-17T18:01:00.000Z",
    featureCutoffAt: "2026-07-17T18:00:30.000Z"
  });
  const findings = detectLeakage([over, under]);

  assert.equal(
    findings.some((finding) => finding.code === "DUPLICATE_OBSERVATION"),
    false
  );
});

test("buildDatasetManifest reports valid unique grain and deterministic digests", () => {
  const first = predictionRow({ sourceDigests: [SOURCE_DIGEST_B, SOURCE_DIGEST_A] });
  const second = chronologicalRow(1);
  second.sourceDigests = [SOURCE_DIGEST_A];
  const duplicate = { ...second, predictionId: "prediction-duplicate" };
  const invalid = chronologicalRow(2);
  invalid.featureCutoffAt = "2026-07-03T18:00:01.000Z";
  const rows = [invalid, duplicate, first, second];

  const manifest = buildDatasetManifest(rows);
  const reordered = buildDatasetManifest([second, first, duplicate, invalid]);

  assert.equal(manifest.rowCount, 4);
  assert.equal(manifest.validCount, 2);
  assert.equal(manifest.invalidCount, 2);
  assert.equal(manifest.duplicateCount, 1);
  assert.deepEqual(manifest.marketFamilyCounts, { pitcher_strikeouts: 2 });
  assert.deepEqual(manifest.modelVersionCounts, { "poisson_count_v1@1.0.0": 2 });
  assert.equal(manifest.minimumPredictionTime, second.predictionAt);
  assert.equal(manifest.maximumPredictionTime, first.predictionAt);
  assert.equal(manifest.settledCount, 2);
  assert.equal(manifest.settlementCoverage, 1);
  assert.deepEqual(manifest.sourceDigests, [SOURCE_DIGEST_A, SOURCE_DIGEST_B]);
  assert.match(manifest.predictionFeatureDigest, /^[a-f0-9]{64}$/);
  assert.match(manifest.datasetDigest, /^[a-f0-9]{64}$/);
  assert.equal(reordered.predictionFeatureDigest, manifest.predictionFeatureDigest);
  assert.equal(reordered.datasetDigest, manifest.datasetDigest);
  assert.deepEqual(reordered.findings, manifest.findings);
});

test("buildDatasetManifest excludes post-event values from its feature digest", () => {
  const original = predictionRow();
  const revisedOutcome = predictionRow({
    settledAt: "2026-07-18T03:00:00.000Z",
    outcome: 0,
    closingPrice: {
      ...BASE_ROW.closingPrice,
      price: -125,
      capturedAt: "2026-07-17T23:05:00.000Z"
    }
  });

  const before = buildDatasetManifest([original]);
  const after = buildDatasetManifest([revisedOutcome]);

  assert.equal(after.predictionFeatureDigest, before.predictionFeatureDigest);
  assert.notEqual(after.datasetDigest, before.datasetDigest);
});

test("buildDatasetManifest handles an empty dataset without claiming coverage", () => {
  const manifest = buildDatasetManifest([]);

  assert.equal(manifest.rowCount, 0);
  assert.equal(manifest.validCount, 0);
  assert.equal(manifest.minimumPredictionTime, null);
  assert.equal(manifest.maximumPredictionTime, null);
  assert.equal(manifest.settlementCoverage, 0);
  assert.deepEqual(manifest.findings, []);
});

test("buildDatasetManifest retains an audit digest for non-finite invalid rows", () => {
  const manifest = buildDatasetManifest([
    predictionRow({ line: Number.NaN })
  ]);

  assert.equal(manifest.rowCount, 1);
  assert.equal(manifest.validCount, 0);
  assert.equal(manifest.invalidCount, 1);
  assert.ok(manifest.findings.some((finding) => finding.code === "INVALID_NUMBER"));
  assert.match(manifest.datasetDigest, /^[a-f0-9]{64}$/);
});

test("chronologicalSplit produces exact 60/20/20 partitions for ten rows", () => {
  const rows = Array.from({ length: 10 }, (_, index) => chronologicalRow(index));
  const originalOrder = [...rows].reverse();

  const split = chronologicalSplit(originalOrder, {
    training: 0.6,
    calibration: 0.2,
    evaluation: 0.2
  });

  assert.deepEqual(
    [split.training.length, split.calibration.length, split.evaluation.length],
    [6, 2, 2]
  );
  assert.equal(split.cutoffs.training, rows[5].predictionAt);
  assert.equal(split.cutoffs.calibration, rows[7].predictionAt);
  assert.equal(split.cutoffs.evaluation, rows[8].predictionAt);
  assert.equal(
    split.training.every((row) => row.predictionAt <= split.cutoffs.training),
    true
  );
  assert.equal(
    split.evaluation.every((row) => row.predictionAt > split.cutoffs.calibration),
    true
  );
  assert.deepEqual(originalOrder, [...rows].reverse());
});

test("chronologicalSplit never separates rows with the same prediction time", () => {
  const timestamps = [1, 1, 2, 2, 3, 3, 4, 4, 5, 5].map(timestampFor);
  const rows = timestamps.map((timestamp, index) => chronologicalRow(index, timestamp));
  const split = chronologicalSplit(rows, {
    training: 0.6,
    calibration: 0.2,
    evaluation: 0.2
  });
  const memberships = new Map();

  for (const [name, partition] of Object.entries({
    training: split.training,
    calibration: split.calibration,
    evaluation: split.evaluation
  })) {
    for (const row of partition) {
      const prior = memberships.get(row.predictionAt);
      assert.ok(prior === undefined || prior === name);
      memberships.set(row.predictionAt, name);
    }
  }

  assert.deepEqual(
    [split.training.length, split.calibration.length, split.evaluation.length],
    [6, 2, 2]
  );
});

test("chronologicalSplit rejects altered policy fractions and unsafe rows", () => {
  const rows = Array.from({ length: 5 }, (_, index) => chronologicalRow(index));

  assert.throws(
    () => chronologicalSplit(rows, {
      training: 0.5,
      calibration: 0.25,
      evaluation: 0.25
    }),
    /exactly 0.6, 0.2, and 0.2/
  );
  assert.throws(
    () => chronologicalSplit([...rows, { ...rows[0] }], {
      training: 0.6,
      calibration: 0.2,
      evaluation: 0.2
    }),
    /invalid or duplicate/
  );
  assert.throws(
    () => chronologicalSplit(rows.slice(0, 2), {
      training: 0.6,
      calibration: 0.2,
      evaluation: 0.2
    }),
    /three distinct prediction timestamps/
  );
});
