const MODEL_ID = "SBKP-LOL-FMW-GPR-BT-0.1.0";
const MODEL_VERSION = "0.1.0";
const MODEL_STATUS = "research_only";
const RATING_SCALE = 400;

function assertFinite(value, field) {
  if (typeof value !== "number" || !Number.isFinite(value)) {
    throw new TypeError(`${field} must be finite.`);
  }
}

function assertIsoTimestamp(value, field) {
  if (typeof value !== "string" || !Number.isFinite(Date.parse(value))) {
    throw new TypeError(`${field} must be a valid timestamp.`);
  }
}

function gameWinProbability(ratingA, ratingB, scale = RATING_SCALE) {
  assertFinite(ratingA, "ratingA");
  assertFinite(ratingB, "ratingB");
  assertFinite(scale, "scale");
  if (scale <= 0) throw new RangeError("scale must be greater than zero.");
  return 1 / (1 + 10 ** ((ratingB - ratingA) / scale));
}

function seriesWinProbability(gameProbability, bestOf) {
  assertFinite(gameProbability, "gameProbability");
  if (gameProbability < 0 || gameProbability > 1) {
    throw new RangeError("gameProbability must be between 0 and 1.");
  }
  if (!Number.isInteger(bestOf) || bestOf <= 0 || bestOf % 2 === 0) {
    throw new RangeError("bestOf must be a positive odd integer.");
  }

  const winsNeeded = Math.floor(bestOf / 2) + 1;
  let probability = 0;
  for (let wins = winsNeeded; wins <= bestOf; wins += 1) {
    let combinations = 1;
    for (let i = 1; i <= wins; i += 1) {
      combinations = combinations * (bestOf - wins + i) / i;
    }
    probability += combinations * (gameProbability ** wins) * ((1 - gameProbability) ** (bestOf - wins));
  }
  return probability;
}

function predictFullMatch({
  teamA,
  teamB,
  gprA,
  gprB,
  bestOf,
  generatedAt,
  evidenceCutoffAt
}) {
  if (typeof teamA !== "string" || !teamA.trim()) throw new TypeError("teamA is required.");
  if (typeof teamB !== "string" || !teamB.trim()) throw new TypeError("teamB is required.");
  assertIsoTimestamp(generatedAt, "generatedAt");
  assertIsoTimestamp(evidenceCutoffAt, "evidenceCutoffAt");
  if (Date.parse(evidenceCutoffAt) > Date.parse(generatedAt)) {
    throw new RangeError("evidenceCutoffAt must not be after generatedAt.");
  }

  const rawGameProbabilityA = gameWinProbability(gprA, gprB);
  const rawProbabilityA = seriesWinProbability(rawGameProbabilityA, bestOf);

  return Object.freeze({
    modelId: MODEL_ID,
    modelVersion: MODEL_VERSION,
    modelStatus: MODEL_STATUS,
    marketFamily: "full_match_winner",
    teamA: teamA.trim(),
    teamB: teamB.trim(),
    gprA,
    gprB,
    bestOf,
    generatedAt,
    evidenceCutoffAt,
    rawGameProbabilityA,
    rawProbabilityA,
    rawProbabilityB: 1 - rawProbabilityA,
    calibratedProbabilityA: null,
    uncertaintyLowA: null,
    uncertaintyHighA: null,
    marketOddsUsed: false
  });
}

module.exports = {
  MODEL_ID,
  MODEL_VERSION,
  MODEL_STATUS,
  RATING_SCALE,
  gameWinProbability,
  seriesWinProbability,
  predictFullMatch
};
