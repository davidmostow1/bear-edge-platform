const crypto = require("node:crypto");

const {
  americanToDecimal,
  getTwoWayNoVigProbabilities
} = require("../odds-math.js");
const { SUPPORTED_SCHEMA_VERSION, MARKET_BASELINE_MODEL_KEY } = require("./records.js");

const DEVIG_METHOD = "multiplicative";
const MARKET_BASELINE_MODEL_ID = "market_devig_two_way_v1";
const MARKET_BASELINE_MODEL_VERSION = "1.0.0";
const PROBABILITY_GUARD = 1e-9;

/**
 * Multiplicative (proportional) devig. It is the standard baseline and matches
 * the convention already used elsewhere in this repository. It is known to
 * under-price heavy favorites and over-price longshots relative to Shin or
 * power devig, so a market_baseline built this way is a fair benchmark in the
 * middle of the distribution and a slightly soft one at the tails.
 *
 * @param {{
 *   comparisonKey: string,
 *   eventId: string,
 *   marketFamily: string,
 *   selectionKey: string,
 *   selectionAmericanOdds: number,
 *   oppositeAmericanOdds: number,
 *   eventStartAt: string,
 *   evidenceCutoffAt: string,
 *   predictedAt: string,
 *   priceSource: string,
 *   priceObservedAt: string
 * }} input
 * @returns {object} a prediction record shaped exactly like a model prediction
 */
function buildMarketBaselineRecord(input) {
  if (!input || typeof input !== "object" || Array.isArray(input)) {
    throw new TypeError("Market baseline input must be an object");
  }

  const {
    selectionAmericanOdds,
    oppositeAmericanOdds,
    priceSource,
    priceObservedAt
  } = input;

  if (typeof priceSource !== "string" || priceSource.trim().length === 0) {
    throw new TypeError(
      "priceSource is required; a market baseline without an attributable price is not evidence"
    );
  }

  const devig = getTwoWayNoVigProbabilities(
    selectionAmericanOdds,
    oppositeAmericanOdds
  );

  if (devig.marketVig < 0) {
    throw new RangeError(
      `Negative vig (${devig.marketVig.toFixed(6)}) implies an arbitrage or a mismatched pair of prices; refusing to build a baseline`
    );
  }

  const probability = Math.min(
    1 - PROBABILITY_GUARD,
    Math.max(PROBABILITY_GUARD, devig.noVigA)
  );

  const implementationDigest = crypto
    .createHash("sha256")
    .update(
      JSON.stringify({
        method: DEVIG_METHOD,
        modelId: MARKET_BASELINE_MODEL_ID,
        modelVersion: MARKET_BASELINE_MODEL_VERSION,
        comparisonKey: input.comparisonKey,
        selectionAmericanOdds,
        oppositeAmericanOdds,
        priceSource,
        priceObservedAt
      })
    )
    .digest("hex");

  return {
    schemaVersion: SUPPORTED_SCHEMA_VERSION,
    predictionId: `market-${implementationDigest.slice(0, 24)}`,
    modelKey: MARKET_BASELINE_MODEL_KEY,
    modelId: MARKET_BASELINE_MODEL_ID,
    modelVersion: MARKET_BASELINE_MODEL_VERSION,
    implementationDigest,
    comparisonKey: input.comparisonKey,
    eventId: input.eventId,
    marketFamily: input.marketFamily,
    selectionKey: input.selectionKey,
    probability,
    eventStartAt: input.eventStartAt,
    evidenceCutoffAt: input.evidenceCutoffAt,
    predictedAt: input.predictedAt,
    priceSource,
    priceObservedAt,
    devigMethod: DEVIG_METHOD,
    selectionAmericanOdds,
    oppositeAmericanOdds,
    impliedProbability: devig.impliedA,
    marketVig: devig.marketVig
  };
}

/**
 * Closing line value in devigged probability points.
 *
 * Positive CLV means the market moved toward the side that was taken: the
 * closing no-vig probability exceeds the entry no-vig probability, so the entry
 * price was better than the market's final answer. CLV resolves far faster than
 * binary outcomes because it does not wait on realized variance, which makes it
 * the right early-warning signal while the Brier gate is still far away.
 *
 * @param {{
 *   entryAmericanOdds: number,
 *   entryOppositeAmericanOdds: number,
 *   closingAmericanOdds: number,
 *   closingOppositeAmericanOdds: number
 * }} input
 * @returns {{
 *   entryNoVigProbability: number,
 *   closingNoVigProbability: number,
 *   clvProbabilityPoints: number,
 *   entryDecimalOdds: number,
 *   closingDecimalOdds: number,
 *   clvDecimalPercent: number,
 *   beatClose: boolean
 * }}
 */
function computeClosingLineValue(input) {
  if (!input || typeof input !== "object" || Array.isArray(input)) {
    throw new TypeError("Closing line value input must be an object");
  }

  const entry = getTwoWayNoVigProbabilities(
    input.entryAmericanOdds,
    input.entryOppositeAmericanOdds
  );
  const closing = getTwoWayNoVigProbabilities(
    input.closingAmericanOdds,
    input.closingOppositeAmericanOdds
  );

  const entryDecimalOdds = americanToDecimal(input.entryAmericanOdds);
  const closingDecimalOdds = americanToDecimal(input.closingAmericanOdds);
  const clvProbabilityPoints = closing.noVigA - entry.noVigA;

  return {
    entryNoVigProbability: entry.noVigA,
    closingNoVigProbability: closing.noVigA,
    clvProbabilityPoints,
    entryDecimalOdds,
    closingDecimalOdds,
    clvDecimalPercent: ((entryDecimalOdds / closingDecimalOdds) - 1) * 100,
    beatClose: clvProbabilityPoints > 0
  };
}

/**
 * Mean CLV across a set of priced predictions, reported separately per model.
 * A model whose mean CLV is not reliably positive has no demonstrated edge
 * regardless of how it scores against the other model.
 *
 * @param {Array<{ clvProbabilityPoints: number }>} rows
 * @returns {{ count: number, meanClvProbabilityPoints: number, beatCloseRate: number } | null}
 */
function summarizeClosingLineValue(rows) {
  if (!Array.isArray(rows) || rows.length === 0) {
    return null;
  }

  const total = rows.reduce((sum, row) => sum + row.clvProbabilityPoints, 0);
  const beatCount = rows.filter((row) => row.clvProbabilityPoints > 0).length;

  return {
    count: rows.length,
    meanClvProbabilityPoints: total / rows.length,
    beatCloseRate: beatCount / rows.length
  };
}

module.exports = {
  DEVIG_METHOD,
  MARKET_BASELINE_MODEL_ID,
  MARKET_BASELINE_MODEL_VERSION,
  buildMarketBaselineRecord,
  computeClosingLineValue,
  summarizeClosingLineValue
};
