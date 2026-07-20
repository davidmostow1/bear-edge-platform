const test = require("node:test");
const assert = require("node:assert/strict");

const {
  simulateTotalBasesMarket
} = require("../src/mlb/total-bases-simulator.js");

function baselineInput(overrides = {}) {
  return {
    seed: "bear-edge-tb-v1",
    iterations: 10000,
    plateAppearances: [
      { value: 4, probability: 0.45 },
      { value: 5, probability: 0.55 }
    ],
    outcomeProbabilities: {
      0: 0.67,
      1: 0.21,
      2: 0.07,
      3: 0.01,
      4: 0.04
    },
    thresholds: [0.5, 1.5, 2.5],
    ...overrides
  };
}

test("simulateTotalBasesMarket is deterministic for the same seed", () => {
  const first = simulateTotalBasesMarket(baselineInput());
  const second = simulateTotalBasesMarket(baselineInput());

  assert.deepEqual(first, second);
  assert.equal(first.iterations, 10000);
  assert.equal(first.seed, "bear-edge-tb-v1");
  assert.equal(first.thresholds.length, 3);
});

test("simulateTotalBasesMarket settles each threshold independently", () => {
  const result = simulateTotalBasesMarket(baselineInput({
    iterations: 100,
    plateAppearances: [{ value: 1, probability: 1 }],
    outcomeProbabilities: {
      0: 0,
      1: 1,
      2: 0,
      3: 0,
      4: 0
    }
  }));

  const byThreshold = new Map(result.thresholds.map((row) => [row.threshold, row]));

  assert.equal(byThreshold.get(0.5).overProbability, 1);
  assert.equal(byThreshold.get(0.5).underProbability, 0);
  assert.equal(byThreshold.get(1.5).overProbability, 0);
  assert.equal(byThreshold.get(1.5).underProbability, 1);
  assert.equal(byThreshold.get(2.5).overProbability, 0);
  assert.equal(byThreshold.get(2.5).underProbability, 1);
});

test("simulateTotalBasesMarket produces monotonic over probabilities", () => {
  const result = simulateTotalBasesMarket(baselineInput());
  const probabilities = result.thresholds.map((row) => row.overProbability);

  assert.ok(probabilities[0] >= probabilities[1]);
  assert.ok(probabilities[1] >= probabilities[2]);

  for (const row of result.thresholds) {
    assert.ok(Math.abs(row.overProbability + row.underProbability - 1) < 1e-12);
  }
});

test("simulateTotalBasesMarket rejects non-normalized distributions", () => {
  assert.throws(
    () => simulateTotalBasesMarket(baselineInput({
      outcomeProbabilities: {
        0: 0.7,
        1: 0.3,
        2: 0.1,
        3: 0,
        4: 0
      }
    })),
    /outcomeProbabilities must sum to 1/
  );

  assert.throws(
    () => simulateTotalBasesMarket(baselineInput({
      plateAppearances: [
        { value: 4, probability: 0.6 },
        { value: 5, probability: 0.6 }
      ]
    })),
    /plateAppearances probabilities must sum to 1/
  );
});
