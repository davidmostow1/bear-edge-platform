const test = require("node:test");
const assert = require("node:assert/strict");

const {
  bootstrapClusterMeanInterval,
  bootstrapMeanInterval,
  brierScore,
  expectedCalibrationError,
  fitCalibrationLine,
  logLoss
} = require("../src/calibration/metrics.js");

const ROWS = [
  { probability: 0.9, outcome: 1 },
  { probability: 0.8, outcome: 1 },
  { probability: 0.4, outcome: 0 },
  { probability: 0.2, outcome: 1 }
];

test("brierScore matches independent arithmetic", () => {
  const expected = (
    ((0.9 - 1) ** 2)
    + ((0.8 - 1) ** 2)
    + ((0.4 - 0) ** 2)
    + ((0.2 - 1) ** 2)
  ) / 4;

  assert.ok(Math.abs(brierScore(ROWS) - expected) < 1e-15);
});

test("logLoss matches an independently expanded equation", () => {
  const expected = -(
    Math.log(0.9)
    + Math.log(0.8)
    + Math.log(0.6)
    + Math.log(0.2)
  ) / 4;

  assert.ok(Math.abs(logLoss(ROWS) - expected) < 1e-15);
});

test("logLoss clamps endpoint probabilities only for its calculation", () => {
  const rows = [
    { probability: 1, outcome: 1 },
    { probability: 0, outcome: 0 }
  ];

  const result = logLoss(rows, 1e-6);

  assert.ok(Math.abs(result - (-Math.log(1 - 1e-6))) < 1e-15);
  assert.deepEqual(rows, [
    { probability: 1, outcome: 1 },
    { probability: 0, outcome: 0 }
  ]);
});

test("metric functions reject invalid rows and epsilon values", () => {
  assert.throws(() => brierScore([]), /at least one/);
  assert.throws(
    () => brierScore([{ probability: Number.NaN, outcome: 1 }]),
    /finite/
  );
  assert.throws(
    () => brierScore([{ probability: 1.2, outcome: 1 }]),
    /between 0 and 1/
  );
  assert.throws(
    () => logLoss([{ probability: 0.5, outcome: 2 }]),
    /zero or one/
  );
  assert.throws(() => logLoss(ROWS, 0), /epsilon/);
  assert.throws(() => logLoss(ROWS, 0.5), /epsilon/);
});

test("expectedCalibrationError reports weighted reliability by bucket", () => {
  const result = expectedCalibrationError(ROWS, [
    { lower: 0, upper: 0.5 },
    { lower: 0.5, upper: 1 }
  ]);

  assert.ok(Math.abs(result.value - 0.175) < 1e-15);
  assert.deepEqual(result.reliability.map((bucket) => bucket.count), [2, 2]);
  assert.ok(Math.abs(result.reliability[0].meanProbability - 0.3) < 1e-15);
  assert.equal(result.reliability[0].observedRate, 0.5);
  assert.ok(
    Math.abs(result.reliability[0].weightedAbsoluteGap - 0.1) < 1e-15
  );
  assert.ok(Math.abs(result.reliability[1].meanProbability - 0.85) < 1e-15);
  assert.equal(result.reliability[1].observedRate, 1);
  assert.ok(
    Math.abs(result.reliability[1].weightedAbsoluteGap - 0.075) < 1e-15
  );
});

test("expectedCalibrationError uses half-open buckets and includes one", () => {
  const result = expectedCalibrationError([
    { probability: 0.5, outcome: 1 },
    { probability: 1, outcome: 1 }
  ], [
    { lower: 0, upper: 0.5 },
    { lower: 0.5, upper: 1 }
  ]);

  assert.deepEqual(result.reliability.map((bucket) => bucket.count), [0, 2]);
  assert.deepEqual(result.reliability[0], {
    lower: 0,
    upper: 0.5,
    count: 0,
    meanProbability: null,
    observedRate: null,
    weightedAbsoluteGap: 0
  });
});

test("expectedCalibrationError rejects invalid bucket partitions", () => {
  assert.throws(
    () => expectedCalibrationError(ROWS, [{ lower: 0.1, upper: 1 }]),
    /start at zero/
  );
  assert.throws(
    () => expectedCalibrationError(ROWS, [
      { lower: 0, upper: 0.4 },
      { lower: 0.5, upper: 1 }
    ]),
    /gap/
  );
  assert.throws(
    () => expectedCalibrationError(ROWS, [
      { lower: 0, upper: 0.6 },
      { lower: 0.5, upper: 1 }
    ]),
    /overlap/
  );
  assert.throws(
    () => expectedCalibrationError(ROWS, [
      { lower: 0.5, upper: 1 },
      { lower: 0, upper: 0.5 }
    ]),
    /start at zero|sorted/
  );
});

test("fitCalibrationLine recovers an analytically calibrated fixture", () => {
  const rows = [
    { probability: 0.2, outcome: 1 },
    { probability: 0.2, outcome: 0 },
    { probability: 0.2, outcome: 0 },
    { probability: 0.2, outcome: 0 },
    { probability: 0.2, outcome: 0 },
    { probability: 0.8, outcome: 1 },
    { probability: 0.8, outcome: 1 },
    { probability: 0.8, outcome: 1 },
    { probability: 0.8, outcome: 1 },
    { probability: 0.8, outcome: 0 }
  ];

  const result = fitCalibrationLine(rows);

  assert.equal(result.converged, true);
  assert.ok(result.iterations > 0 && result.iterations <= 100);
  assert.ok(Math.abs(result.intercept) < 1e-10);
  assert.ok(Math.abs(result.slope - 1) < 1e-10);
});

test("fitCalibrationLine reports singular input without invented parameters", () => {
  const result = fitCalibrationLine([
    { probability: 0.5, outcome: 0 },
    { probability: 0.5, outcome: 1 }
  ]);

  assert.deepEqual(result, {
    intercept: null,
    slope: null,
    converged: false,
    iterations: 0
  });
});

test("bootstrapMeanInterval is deterministic for a fixed xorshift32 seed", () => {
  const options = { samples: 8, confidence: 0.5, seed: 1 };
  const first = bootstrapMeanInterval([1, 3], options);
  const repeated = bootstrapMeanInterval([1, 3], options);

  assert.deepEqual(first, repeated);
  assert.deepEqual(first, {
    mean: 2,
    lower: 1.75,
    upper: 2,
    samples: 8,
    confidence: 0.5
  });
});

test("bootstrapMeanInterval rejects invalid samples and options", () => {
  assert.throws(() => bootstrapMeanInterval([1]), /at least two/);
  assert.throws(() => bootstrapMeanInterval([1, Number.NaN]), /finite/);
  assert.throws(
    () => bootstrapMeanInterval([1, 2], { samples: 0 }),
    /samples/
  );
  assert.throws(
    () => bootstrapMeanInterval([1, 2], { confidence: 1 }),
    /confidence/
  );
  assert.throws(
    () => bootstrapMeanInterval([1, 2], { seed: 1.5 }),
    /seed/
  );
});

test("bootstrapClusterMeanInterval resamples whole event clusters deterministically", () => {
  const options = { samples: 8, confidence: 0.5, seed: 1 };
  const clusters = [[1, 3], [8, 12]];
  const expectedEqualClusterResult = bootstrapMeanInterval([2, 10], options);
  const first = bootstrapClusterMeanInterval(clusters, options);
  const repeated = bootstrapClusterMeanInterval(clusters, options);

  assert.deepEqual(first, repeated);
  assert.deepEqual(first, {
    ...expectedEqualClusterResult,
    clusterCount: 2
  });

  const unequalClusters = bootstrapClusterMeanInterval([[1, 3], [10]], options);
  assert.equal(unequalClusters.mean, 14 / 3);
  assert.equal(unequalClusters.clusterCount, 2);
});

test("bootstrapClusterMeanInterval rejects invalid clusters and options", () => {
  assert.throws(() => bootstrapClusterMeanInterval([[1, 2]]), /at least two clusters/);
  assert.throws(() => bootstrapClusterMeanInterval([[1], []]), /must not be empty/);
  assert.throws(() => bootstrapClusterMeanInterval([[1], [Number.NaN]]), /finite/);
  assert.throws(
    () => bootstrapClusterMeanInterval([[1], [2]], { samples: 0 }),
    /samples/
  );
});
