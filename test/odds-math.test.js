const assert = require("node:assert/strict");
const test = require("node:test");

const {
  americanToDecimal,
  americanToImpliedProbability,
  getTwoWayNoVigProbabilities,
  normalizeTwoWayNoVig
} = require("../src/odds-math.js");

function almostEqual(actual, expected, epsilon = 1e-12) {
  assert.ok(
    Math.abs(actual - expected) <= epsilon,
    `expected ${actual} to be within ${epsilon} of ${expected}`
  );
}

test("shared odds math converts positive and negative American prices", () => {
  almostEqual(americanToDecimal(150), 2.5);
  almostEqual(americanToDecimal(-120), 1.8333333333333335);
  almostEqual(americanToImpliedProbability(150), 0.4);
  almostEqual(americanToImpliedProbability(-120), 0.5454545454545454);
});

test("shared odds math rejects zero and non-finite American prices", () => {
  assert.throws(() => americanToDecimal(0), /americanOdds cannot be 0/);
  assert.throws(
    () => americanToImpliedProbability(Number.NaN),
    /americanOdds must be a finite number/
  );
});

test("shared odds math normalizes two-way probability without vig", () => {
  assert.deepEqual(normalizeTwoWayNoVig(0.55, 0.5), {
    sideA: 0.55 / 1.05,
    sideB: 0.5 / 1.05
  });

  const market = getTwoWayNoVigProbabilities(-110, -110);
  almostEqual(market.impliedA, 110 / 210);
  almostEqual(market.impliedB, 110 / 210);
  almostEqual(market.marketVig, 10 / 210);
  almostEqual(market.noVigA, 0.5);
  almostEqual(market.noVigB, 0.5);
});

test("shared no-vig math rejects invalid probabilities", () => {
  assert.throws(
    () => normalizeTwoWayNoVig(-0.1, 0.5),
    /probabilityA must be between 0 and 1/
  );
  assert.throws(
    () => normalizeTwoWayNoVig(0, 0),
    /probabilityA and probabilityB cannot both be 0/
  );
});
