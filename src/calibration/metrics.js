const DEFAULT_LOG_LOSS_EPSILON = 1e-15;
const CALIBRATION_PROBABILITY_EPSILON = 1e-12;
const CALIBRATION_TOLERANCE = 1e-10;
const MAX_CALIBRATION_ITERATIONS = 100;
const DEFAULT_BOOTSTRAP_SAMPLES = 10_000;
const DEFAULT_BOOTSTRAP_CONFIDENCE = 0.95;
const DEFAULT_BOOTSTRAP_SEED = 0x9e3779b9;

/**
 * @typedef {{ probability: number, outcome: number }} CalibrationRow
 * @typedef {{ lower: number, upper: number }} ReliabilityBucket
 */

/**
 * @param {CalibrationRow[]} rows
 * @returns {CalibrationRow[]}
 */
function validateRows(rows) {
  if (!Array.isArray(rows) || rows.length === 0) {
    throw new TypeError("Calibration metrics require at least one row");
  }

  rows.forEach((row, index) => {
    if (!row || typeof row !== "object" || Array.isArray(row)) {
      throw new TypeError(`Calibration row ${index} must be an object`);
    }
    if (typeof row.probability !== "number" || !Number.isFinite(row.probability)) {
      throw new TypeError(`Calibration row ${index} probability must be finite`);
    }
    if (row.probability < 0 || row.probability > 1) {
      throw new RangeError(
        `Calibration row ${index} probability must be between 0 and 1`
      );
    }
    if (row.outcome !== 0 && row.outcome !== 1) {
      throw new TypeError(`Calibration row ${index} outcome must be zero or one`);
    }
  });

  return rows;
}

/**
 * @param {CalibrationRow[]} rows
 * @returns {number}
 */
function brierScore(rows) {
  const validated = validateRows(rows);
  const total = validated.reduce(
    (sum, row) => sum + ((row.probability - row.outcome) ** 2),
    0
  );

  return total / validated.length;
}

/**
 * @param {CalibrationRow[]} rows
 * @param {number} [epsilon]
 * @returns {number}
 */
function logLoss(rows, epsilon = DEFAULT_LOG_LOSS_EPSILON) {
  const validated = validateRows(rows);

  if (
    typeof epsilon !== "number"
    || !Number.isFinite(epsilon)
    || epsilon <= 0
    || epsilon >= 0.5
  ) {
    throw new RangeError("Log loss epsilon must be finite and between zero and 0.5");
  }

  const total = validated.reduce((sum, row) => {
    const probability = Math.min(
      1 - epsilon,
      Math.max(epsilon, row.probability)
    );
    return sum - (
      (row.outcome * Math.log(probability))
      + ((1 - row.outcome) * Math.log(1 - probability))
    );
  }, 0);

  return total / validated.length;
}

/**
 * @param {ReliabilityBucket[]} buckets
 * @returns {ReliabilityBucket[]}
 */
function validateBuckets(buckets) {
  if (!Array.isArray(buckets) || buckets.length === 0) {
    throw new TypeError("Reliability buckets must contain at least one bucket");
  }

  buckets.forEach((bucket, index) => {
    if (!bucket || typeof bucket !== "object" || Array.isArray(bucket)) {
      throw new TypeError(`Reliability bucket ${index} must be an object`);
    }
    if (
      typeof bucket.lower !== "number"
      || !Number.isFinite(bucket.lower)
      || typeof bucket.upper !== "number"
      || !Number.isFinite(bucket.upper)
    ) {
      throw new TypeError(`Reliability bucket ${index} bounds must be finite`);
    }
    if (bucket.lower < 0 || bucket.upper > 1 || bucket.lower >= bucket.upper) {
      throw new RangeError(
        `Reliability bucket ${index} must have increasing bounds between zero and one`
      );
    }
  });

  if (buckets[0].lower !== 0) {
    throw new RangeError("Reliability buckets must start at zero and be sorted");
  }

  for (let index = 1; index < buckets.length; index += 1) {
    const previous = buckets[index - 1];
    const current = buckets[index];

    if (current.lower < previous.upper) {
      throw new RangeError("Reliability buckets must not overlap");
    }
    if (current.lower > previous.upper) {
      throw new RangeError("Reliability buckets must not contain a gap");
    }
  }

  if (buckets[buckets.length - 1].upper !== 1) {
    throw new RangeError("Reliability buckets must end at one");
  }

  return buckets;
}

/**
 * @param {CalibrationRow[]} rows
 * @param {ReliabilityBucket[]} buckets
 * @returns {{
 *   value: number,
 *   reliability: Array<{
 *     lower: number,
 *     upper: number,
 *     count: number,
 *     meanProbability: number | null,
 *     observedRate: number | null,
 *     weightedAbsoluteGap: number
 *   }>
 * }}
 */
function expectedCalibrationError(rows, buckets) {
  const validatedRows = validateRows(rows);
  const validatedBuckets = validateBuckets(buckets);
  const lastIndex = validatedBuckets.length - 1;

  const reliability = validatedBuckets.map((bucket, bucketIndex) => {
    const members = validatedRows.filter((row) => (
      row.probability >= bucket.lower
      && (
        row.probability < bucket.upper
        || (bucketIndex === lastIndex && row.probability <= bucket.upper)
      )
    ));

    if (members.length === 0) {
      return {
        lower: bucket.lower,
        upper: bucket.upper,
        count: 0,
        meanProbability: null,
        observedRate: null,
        weightedAbsoluteGap: 0
      };
    }

    const meanProbability = members.reduce(
      (sum, row) => sum + row.probability,
      0
    ) / members.length;
    const observedRate = members.reduce(
      (sum, row) => sum + row.outcome,
      0
    ) / members.length;
    const weightedAbsoluteGap = (
      (members.length / validatedRows.length)
      * Math.abs(meanProbability - observedRate)
    );

    return {
      lower: bucket.lower,
      upper: bucket.upper,
      count: members.length,
      meanProbability,
      observedRate,
      weightedAbsoluteGap
    };
  });

  return {
    value: reliability.reduce(
      (sum, bucket) => sum + bucket.weightedAbsoluteGap,
      0
    ),
    reliability
  };
}

/**
 * @param {number} value
 * @returns {number}
 */
function logistic(value) {
  if (value >= 0) {
    const exponential = Math.exp(-value);
    return 1 / (1 + exponential);
  }

  const exponential = Math.exp(value);
  return exponential / (1 + exponential);
}

/**
 * @returns {{
 *   intercept: null,
 *   slope: null,
 *   converged: false,
 *   iterations: number
 * }}
 */
function failedCalibrationFit(iterations) {
  return {
    intercept: null,
    slope: null,
    converged: false,
    iterations
  };
}

/**
 * @param {CalibrationRow[]} rows
 * @returns {{
 *   intercept: number | null,
 *   slope: number | null,
 *   converged: boolean,
 *   iterations: number
 * }}
 */
function fitCalibrationLine(rows) {
  const validated = validateRows(rows);
  const observations = validated.map((row) => {
    const probability = Math.min(
      1 - CALIBRATION_PROBABILITY_EPSILON,
      Math.max(CALIBRATION_PROBABILITY_EPSILON, row.probability)
    );
    return {
      x: Math.log(probability / (1 - probability)),
      y: row.outcome
    };
  });
  const firstX = observations[0].x;
  const firstY = observations[0].y;

  if (
    observations.every((observation) => observation.x === firstX)
    || observations.every((observation) => observation.y === firstY)
  ) {
    return failedCalibrationFit(0);
  }

  let intercept = 0;
  let slope = 1;

  for (let iteration = 1; iteration <= MAX_CALIBRATION_ITERATIONS; iteration += 1) {
    let scoreIntercept = 0;
    let scoreSlope = 0;
    let informationIntercept = 0;
    let informationCross = 0;
    let informationSlope = 0;

    observations.forEach((observation) => {
      const fitted = logistic(intercept + (slope * observation.x));
      const residual = observation.y - fitted;
      const weight = fitted * (1 - fitted);

      scoreIntercept += residual;
      scoreSlope += residual * observation.x;
      informationIntercept += weight;
      informationCross += weight * observation.x;
      informationSlope += weight * observation.x * observation.x;
    });

    const determinant = (
      (informationIntercept * informationSlope)
      - (informationCross * informationCross)
    );
    const singularThreshold = 16 * Number.EPSILON * Math.max(
      1,
      Math.abs(informationIntercept * informationSlope),
      Math.abs(informationCross * informationCross)
    );

    if (!Number.isFinite(determinant) || Math.abs(determinant) <= singularThreshold) {
      return failedCalibrationFit(iteration - 1);
    }

    const interceptChange = (
      (scoreIntercept * informationSlope)
      - (scoreSlope * informationCross)
    ) / determinant;
    const slopeChange = (
      (informationIntercept * scoreSlope)
      - (informationCross * scoreIntercept)
    ) / determinant;

    if (!Number.isFinite(interceptChange) || !Number.isFinite(slopeChange)) {
      return failedCalibrationFit(iteration - 1);
    }

    intercept += interceptChange;
    slope += slopeChange;

    if (
      Math.abs(interceptChange) < CALIBRATION_TOLERANCE
      && Math.abs(slopeChange) < CALIBRATION_TOLERANCE
    ) {
      return { intercept, slope, converged: true, iterations: iteration };
    }
  }

  return failedCalibrationFit(MAX_CALIBRATION_ITERATIONS);
}

/**
 * @param {number} seed
 * @returns {() => number}
 */
function createXorshift32(seed) {
  let state = seed >>> 0;

  return () => {
    state ^= state << 13;
    state ^= state >>> 17;
    state ^= state << 5;
    state >>>= 0;
    return state / 0x1_0000_0000;
  };
}

/**
 * @param {number[]} sortedValues
 * @param {number} probability
 * @returns {number}
 */
function percentile(sortedValues, probability) {
  const position = (sortedValues.length - 1) * probability;
  const lowerIndex = Math.floor(position);
  const upperIndex = Math.ceil(position);

  if (lowerIndex === upperIndex) {
    return sortedValues[lowerIndex];
  }

  const fraction = position - lowerIndex;
  return (
    sortedValues[lowerIndex]
    + (fraction * (sortedValues[upperIndex] - sortedValues[lowerIndex]))
  );
}

/**
 * @param {number[]} values
 * @param {{ samples?: number, confidence?: number, seed?: number }} [options]
 * @returns {{
 *   mean: number,
 *   lower: number,
 *   upper: number,
 *   samples: number,
 *   confidence: number
 * }}
 */
function bootstrapMeanInterval(values, options = {}) {
  if (!Array.isArray(values) || values.length < 2) {
    throw new TypeError("Bootstrap intervals require at least two values");
  }
  values.forEach((value, index) => {
    if (typeof value !== "number" || !Number.isFinite(value)) {
      throw new TypeError(`Bootstrap value ${index} must be finite`);
    }
  });
  if (!options || typeof options !== "object" || Array.isArray(options)) {
    throw new TypeError("Bootstrap options must be an object");
  }

  const samples = options.samples ?? DEFAULT_BOOTSTRAP_SAMPLES;
  const confidence = options.confidence ?? DEFAULT_BOOTSTRAP_CONFIDENCE;
  const seed = options.seed ?? DEFAULT_BOOTSTRAP_SEED;

  if (!Number.isSafeInteger(samples) || samples < 1) {
    throw new RangeError("Bootstrap samples must be a positive safe integer");
  }
  if (
    typeof confidence !== "number"
    || !Number.isFinite(confidence)
    || confidence <= 0
    || confidence >= 1
  ) {
    throw new RangeError("Bootstrap confidence must be between zero and one");
  }
  if (!Number.isSafeInteger(seed) || seed < 1 || seed > 0xffff_ffff) {
    throw new RangeError("Bootstrap seed must be a non-zero unsigned 32-bit integer");
  }

  const random = createXorshift32(seed);
  const bootstrapMeans = [];

  for (let sampleIndex = 0; sampleIndex < samples; sampleIndex += 1) {
    let sum = 0;
    for (let valueIndex = 0; valueIndex < values.length; valueIndex += 1) {
      sum += values[Math.floor(random() * values.length)];
    }
    bootstrapMeans.push(sum / values.length);
  }

  bootstrapMeans.sort((left, right) => left - right);
  const tailProbability = (1 - confidence) / 2;

  return {
    mean: values.reduce((sum, value) => sum + value, 0) / values.length,
    lower: percentile(bootstrapMeans, tailProbability),
    upper: percentile(bootstrapMeans, 1 - tailProbability),
    samples,
    confidence
  };
}

module.exports = {
  bootstrapMeanInterval,
  brierScore,
  expectedCalibrationError,
  fitCalibrationLine,
  logLoss
};
