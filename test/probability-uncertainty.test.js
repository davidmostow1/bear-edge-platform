const test = require("node:test");
const assert = require("node:assert/strict");

const {
  estimatePoissonMeanInterval,
  estimatePoissonProbabilityInterval
} = require("../src/live/probability-uncertainty.js");

test("Poisson probability interval contains the point estimate", () => {
  const result = estimatePoissonProbabilityInterval({
    mean: 6.2,
    observedTotal: 62,
    line: 5.5,
    side: "over",
    sampleSize: 10,
    confidenceLevel: 0.95
  });

  assert.equal(result.method, "garwood_wilson_hilferty_approximation");
  assert.equal(result.observedTotal, 62);
  assert.equal(result.observedMean, 6.2);
  assert.ok(result.lowerProbability < result.pointProbability);
  assert.ok(result.upperProbability > result.pointProbability);
  assert.ok(result.lowerProbability >= 0);
  assert.ok(result.upperProbability <= 1);
});

test("Wilson-Hilferty bounds closely match independently computed exact references", () => {
  const result = estimatePoissonProbabilityInterval({
    mean: 6.2,
    observedTotal: 62,
    line: 5.5,
    side: "over",
    sampleSize: 10,
    confidenceLevel: 0.95
  });

  // Exact values independently computed with Wolfram Language chi-square quantiles.
  assert.ok(Math.abs(result.lowerMean - 4.753504448617262) < 0.0003);
  assert.ok(Math.abs(result.upperMean - 7.948120187574624) < 0.0003);
  assert.ok(Math.abs(result.lowerProbability - 0.34087707550475344) < 0.00005);
  assert.ok(Math.abs(result.pointProbability - 0.5858869614156224) < 1e-12);
  assert.ok(Math.abs(result.upperProbability - 0.8039651968125778) < 0.00005);
});

test("observed integer count controls the sampling interval instead of the projection mean", () => {
  const result = estimatePoissonProbabilityInterval({
    mean: 6.2,
    observedTotal: 20,
    line: 5.5,
    side: "over",
    sampleSize: 10
  });
  const observedInterval = estimatePoissonMeanInterval({
    mean: 6.2,
    observedTotal: 20,
    sampleSize: 10,
    confidenceLevel: 0.95
  });

  assert.equal(result.pointMean, 6.2);
  assert.equal(result.observedMean, 2);
  assert.equal(result.observedTotal, 20);
  assert.deepEqual(observedInterval, {
    lower: result.lowerMean,
    upper: result.upperMean,
    observedTotal: 20,
    observedMean: 2
  });
  assert.ok(result.upperMean < result.pointMean);
  assert.equal(result.decisionProbability, result.lowerProbability);
});

test("larger samples produce a narrower probability interval", () => {
  const small = estimatePoissonProbabilityInterval({
    mean: 6.2,
    line: 5.5,
    side: "over",
    sampleSize: 10
  });
  const large = estimatePoissonProbabilityInterval({
    mean: 6.2,
    line: 5.5,
    side: "over",
    sampleSize: 100
  });

  assert.ok(large.width < small.width);
});

test("under probability bounds preserve monotonic ordering", () => {
  const result = estimatePoissonProbabilityInterval({
    mean: 2.4,
    line: 2.5,
    side: "under",
    sampleSize: 20
  });

  assert.ok(result.lowerProbability < result.pointProbability);
  assert.ok(result.upperProbability > result.pointProbability);
  assert.ok(result.lowerMean < result.pointMean);
  assert.ok(result.upperMean > result.pointMean);
});

test("probability interval rejects missing or invalid sample evidence", () => {
  assert.throws(() => estimatePoissonProbabilityInterval({
    mean: 2,
    line: 1.5,
    side: "over",
    sampleSize: 0
  }), /sampleSize/);
  assert.throws(() => estimatePoissonProbabilityInterval({
    mean: 2,
    line: 1.5,
    side: "push",
    sampleSize: 10
  }), /side/);
  assert.throws(() => estimatePoissonProbabilityInterval({
    mean: 2,
    observedTotal: 2.5,
    line: 1.5,
    side: "over",
    sampleSize: 10
  }), /observedTotal/);
});
