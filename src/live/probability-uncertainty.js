const { estimateCountProbability } = require("./estimate-prop.js");

function assertFinite(value, name) {
  if (typeof value !== "number" || !Number.isFinite(value)) {
    throw new TypeError(`${name} must be a finite number.`);
  }
}

// Peter J. Acklam's rational approximation, accurate enough for interval construction.
function inverseStandardNormal(probability) {
  assertFinite(probability, "probability");

  if (probability <= 0 || probability >= 1) {
    throw new RangeError("probability must be greater than 0 and less than 1.");
  }

  const a = [
    -3.969683028665376e1,
    2.209460984245205e2,
    -2.759285104469687e2,
    1.38357751867269e2,
    -3.066479806614716e1,
    2.506628277459239
  ];
  const b = [
    -5.447609879822406e1,
    1.615858368580409e2,
    -1.556989798598866e2,
    6.680131188771972e1,
    -1.328068155288572e1
  ];
  const c = [
    -7.784894002430293e-3,
    -3.223964580411365e-1,
    -2.400758277161838,
    -2.549732539343734,
    4.374664141464968,
    2.938163982698783
  ];
  const d = [
    7.784695709041462e-3,
    3.224671290700398e-1,
    2.445134137142996,
    3.754408661907416
  ];
  const lowerTail = 0.02425;
  const upperTail = 1 - lowerTail;

  if (probability < lowerTail) {
    const q = Math.sqrt(-2 * Math.log(probability));
    return (((((c[0] * q + c[1]) * q + c[2]) * q + c[3]) * q + c[4]) * q + c[5]) /
      ((((d[0] * q + d[1]) * q + d[2]) * q + d[3]) * q + 1);
  }

  if (probability > upperTail) {
    const q = Math.sqrt(-2 * Math.log(1 - probability));
    return -(((((c[0] * q + c[1]) * q + c[2]) * q + c[3]) * q + c[4]) * q + c[5]) /
      ((((d[0] * q + d[1]) * q + d[2]) * q + d[3]) * q + 1);
  }

  const q = probability - 0.5;
  const r = q * q;
  return (((((a[0] * r + a[1]) * r + a[2]) * r + a[3]) * r + a[4]) * r + a[5]) * q /
    (((((b[0] * r + b[1]) * r + b[2]) * r + b[3]) * r + b[4]) * r + 1);
}

function approximateChiSquareQuantile(probability, degreesOfFreedom) {
  assertFinite(degreesOfFreedom, "degreesOfFreedom");

  if (degreesOfFreedom <= 0) {
    throw new RangeError("degreesOfFreedom must be greater than 0.");
  }

  const z = inverseStandardNormal(probability);
  const adjustment = 1 - 2 / (9 * degreesOfFreedom) + z * Math.sqrt(2 / (9 * degreesOfFreedom));

  return degreesOfFreedom * Math.max(0, adjustment) ** 3;
}

function estimatePoissonMeanInterval({ mean, sampleSize, confidenceLevel, observedTotal = null }) {
  assertFinite(mean, "mean");
  assertFinite(sampleSize, "sampleSize");
  assertFinite(confidenceLevel, "confidenceLevel");

  if (mean < 0) {
    throw new RangeError("mean must be zero or greater.");
  }
  if (sampleSize <= 0) {
    throw new RangeError("sampleSize must be greater than 0.");
  }
  if (confidenceLevel <= 0 || confidenceLevel >= 1) {
    throw new RangeError("confidenceLevel must be greater than 0 and less than 1.");
  }
  if (observedTotal !== null &&
      (!Number.isInteger(observedTotal) || observedTotal < 0)) {
    throw new RangeError("observedTotal must be a non-negative integer when provided.");
  }

  const totalCount = observedTotal ?? mean * sampleSize;
  const alpha = 1 - confidenceLevel;
  const lower = totalCount === 0
    ? 0
    : 0.5 * approximateChiSquareQuantile(alpha / 2, 2 * totalCount) / sampleSize;
  const upper = 0.5 * approximateChiSquareQuantile(1 - alpha / 2, 2 * (totalCount + 1)) / sampleSize;

  return {
    lower,
    upper,
    observedTotal,
    observedMean: observedTotal === null ? null : observedTotal / sampleSize
  };
}

function estimatePoissonProbabilityInterval({
  mean,
  line,
  side,
  sampleSize,
  observedTotal = null,
  confidenceLevel = 0.95
}) {
  assertFinite(line, "line");

  if (side !== "over" && side !== "under") {
    throw new RangeError("side must be over or under.");
  }

  const meanInterval = estimatePoissonMeanInterval({
    mean,
    sampleSize,
    confidenceLevel,
    observedTotal
  });
  const pointProbability = estimateCountProbability({ mean, line, side });
  const probabilityAtLowerMean = estimateCountProbability({ mean: meanInterval.lower, line, side });
  const probabilityAtUpperMean = estimateCountProbability({ mean: meanInterval.upper, line, side });
  const lowerProbability = Math.min(probabilityAtLowerMean, probabilityAtUpperMean, pointProbability);
  const upperProbability = Math.max(probabilityAtLowerMean, probabilityAtUpperMean, pointProbability);

  return {
    method: "garwood_wilson_hilferty_approximation",
    confidenceLevel,
    sampleSize,
    intervalBasis: observedTotal === null ? "projected_pseudo_count" : "observed_count",
    observedTotal: meanInterval.observedTotal,
    observedMean: meanInterval.observedMean,
    pointMean: mean,
    lowerMean: meanInterval.lower,
    upperMean: meanInterval.upper,
    pointProbability,
    lowerProbability,
    upperProbability,
    width: upperProbability - lowerProbability,
    decisionProbability: lowerProbability,
    limitations: [
      "The mean interval uses the Wilson-Hilferty chi-square approximation rather than an exact special-function quantile.",
      observedTotal === null
        ? "No observed count was supplied, so the interval treats the projection mean times sample size as a pseudo-count."
        : "The sampling interval reflects the supplied observed count; it does not quantify every source of model uncertainty.",
      "The count model assumes Poisson dispersion and does not capture opponent, lineup, weather, role, or other omitted context."
    ]
  };
}

module.exports = {
  approximateChiSquareQuantile,
  estimatePoissonMeanInterval,
  estimatePoissonProbabilityInterval,
  inverseStandardNormal
};
