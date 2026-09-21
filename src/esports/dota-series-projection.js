const { contentDigest } = require("../audit/canonical-json.js");

const MODEL_ID = "dota_elo_series_v1";
const MODEL_VERSION = "1.0.0";
const INPUT_SCHEMA = "bear-edge.dota-series-projection-input.v1";
const OUTPUT_SCHEMA = "bear-edge.independent-projection.v1";
const IMPLEMENTATION_CONTRACT = Object.freeze({
  modelId: MODEL_ID,
  modelVersion: MODEL_VERSION,
  algorithm: "chronological_series_elo_with_event_bootstrap",
  supportedGame: "DOTA2",
  supportedMarketFamily: "dota2_match_winner",
  supportedBestOf: 3,
  probabilityTransform: "base10_logistic_400",
  uncertaintyMethod: "deterministic_event_bootstrap_percentile"
});
const DOTA_PROJECTION_IMPLEMENTATION_DIGEST = contentDigest(IMPLEMENTATION_CONTRACT);

function isObject(value) {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function requireString(value, field) {
  if (typeof value !== "string" || value.trim() === "") {
    throw new TypeError(`${field} must be a non-empty string.`);
  }
  return value.trim();
}

function requireTimestamp(value, field) {
  const parsed = Date.parse(value ?? "");
  if (!Number.isFinite(parsed)) {
    throw new TypeError(`${field} must be a valid timestamp.`);
  }
  return parsed;
}

function digestPayload(object, digestField) {
  const payload = { ...object };
  delete payload[digestField];
  return payload;
}

function validatePolicy(policy, generatedAtMs) {
  if (!isObject(policy)) throw new TypeError("policy is required.");
  const registeredAtMs = requireTimestamp(policy.registeredAt, "policy.registeredAt");
  if (registeredAtMs >= generatedAtMs) {
    throw new RangeError("policy.registeredAt must be before generatedAt.");
  }
  if (contentDigest(digestPayload(policy, "policyDigest")) !== policy.policyDigest) {
    throw new Error("policyDigest does not match the retained policy.");
  }
  for (const field of ["initialRating", "kFactor", "minimumMatchesPerTeam", "bootstrapResamples", "confidenceLevel"]) {
    if (typeof policy[field] !== "number" || !Number.isFinite(policy[field])) {
      throw new TypeError(`policy.${field} must be finite.`);
    }
  }
  if (policy.initialRating <= 0 || policy.kFactor <= 0) throw new RangeError("Elo parameters must be positive.");
  if (!Number.isInteger(policy.minimumMatchesPerTeam) || policy.minimumMatchesPerTeam < 1) {
    throw new RangeError("policy.minimumMatchesPerTeam must be a positive integer.");
  }
  if (!Number.isInteger(policy.bootstrapResamples) || policy.bootstrapResamples < 1000) {
    throw new RangeError("policy.bootstrapResamples must be an integer of at least 1000.");
  }
  if (policy.confidenceLevel <= 0 || policy.confidenceLevel >= 1) {
    throw new RangeError("policy.confidenceLevel must be between zero and one.");
  }
}

function validateFeatures(snapshot, generatedAtMs, policy) {
  if (!isObject(snapshot)) throw new TypeError("featureSnapshot is required.");
  if (contentDigest(digestPayload(snapshot, "featureSnapshotDigest")) !== snapshot.featureSnapshotDigest) {
    throw new Error("featureSnapshotDigest does not match the retained feature snapshot.");
  }
  const capturedAtMs = requireTimestamp(snapshot.capturedAt, "featureSnapshot.capturedAt");
  if (capturedAtMs > generatedAtMs) throw new RangeError("featureSnapshot.capturedAt cannot be after generatedAt.");
  const teamA = requireString(snapshot.teamA, "featureSnapshot.teamA");
  const teamB = requireString(snapshot.teamB, "featureSnapshot.teamB");
  if (teamA === teamB) throw new RangeError("featureSnapshot teams must be distinct.");
  const patch = requireString(snapshot.patch, "featureSnapshot.patch");
  if (!Array.isArray(snapshot.matches) || snapshot.matches.length === 0) {
    throw new RangeError("featureSnapshot.matches must contain retained history.");
  }

  const eventIds = new Set();
  const counts = new Map([[teamA, 0], [teamB, 0]]);
  const matches = snapshot.matches.map((match, index) => {
    if (!isObject(match)) throw new TypeError(`match ${index} must be an object.`);
    const eventId = requireString(match.eventId, `match ${index}.eventId`);
    if (eventIds.has(eventId)) throw new RangeError(`duplicate historical eventId: ${eventId}.`);
    eventIds.add(eventId);
    const startedAtMs = requireTimestamp(match.startedAt, `match ${index}.startedAt`);
    if (startedAtMs >= generatedAtMs) throw new RangeError("Every historical match must start before generatedAt.");
    const historicalTeamA = requireString(match.teamA, `match ${index}.teamA`);
    const historicalTeamB = requireString(match.teamB, `match ${index}.teamB`);
    if (historicalTeamA === historicalTeamB) throw new RangeError("Historical match teams must be distinct.");
    if (![historicalTeamA, historicalTeamB].includes(match.winner)) {
      throw new RangeError(`match ${index}.winner must equal one of its teams.`);
    }
    if (match.bestOf !== 3) throw new RangeError("Only best-of-three historical series are accepted.");
    if (match.patch !== patch) throw new RangeError("Historical match patch must equal the feature snapshot patch.");
    if (counts.has(historicalTeamA)) counts.set(historicalTeamA, counts.get(historicalTeamA) + 1);
    if (counts.has(historicalTeamB)) counts.set(historicalTeamB, counts.get(historicalTeamB) + 1);
    return { eventId, startedAtMs, teamA: historicalTeamA, teamB: historicalTeamB, winner: match.winner };
  }).sort((left, right) => left.startedAtMs - right.startedAtMs || left.eventId.localeCompare(right.eventId));

  for (const team of [teamA, teamB]) {
    if (counts.get(team) < policy.minimumMatchesPerTeam) {
      throw new RangeError(`${team} does not satisfy minimumMatchesPerTeam.`);
    }
  }
  return { teamA, teamB, patch, matches, counts };
}

function winProbability(ratingA, ratingB) {
  return 1 / (1 + (10 ** ((ratingB - ratingA) / 400)));
}

function rate(matches, initialRating, kFactor) {
  const ratings = new Map();
  const get = (team) => ratings.get(team) ?? initialRating;
  for (const match of matches) {
    const ratingA = get(match.teamA);
    const ratingB = get(match.teamB);
    const expectedA = winProbability(ratingA, ratingB);
    const scoreA = match.winner === match.teamA ? 1 : 0;
    ratings.set(match.teamA, ratingA + kFactor * (scoreA - expectedA));
    ratings.set(match.teamB, ratingB + kFactor * ((1 - scoreA) - (1 - expectedA)));
  }
  return ratings;
}

function seededRandom(seedHex) {
  let state = Number.parseInt(seedHex.slice(0, 8), 16) || 1;
  return () => {
    state = (1664525 * state + 1013904223) >>> 0;
    return state / 0x100000000;
  };
}

function quantile(sorted, probability) {
  const position = (sorted.length - 1) * probability;
  const lower = Math.floor(position);
  const upper = Math.ceil(position);
  if (lower === upper) return sorted[lower];
  return sorted[lower] + (sorted[upper] - sorted[lower]) * (position - lower);
}

function bootstrapInterval(features, policy, seed) {
  const random = seededRandom(seed);
  const probabilities = [];
  for (let sampleIndex = 0; sampleIndex < policy.bootstrapResamples; sampleIndex += 1) {
    const sample = [];
    for (let index = 0; index < features.matches.length; index += 1) {
      sample.push(features.matches[Math.floor(random() * features.matches.length)]);
    }
    sample.sort((left, right) => left.startedAtMs - right.startedAtMs || left.eventId.localeCompare(right.eventId));
    const ratings = rate(sample, policy.initialRating, policy.kFactor);
    probabilities.push(winProbability(
      ratings.get(features.teamA) ?? policy.initialRating,
      ratings.get(features.teamB) ?? policy.initialRating
    ));
  }
  probabilities.sort((left, right) => left - right);
  const tail = (1 - policy.confidenceLevel) / 2;
  return [quantile(probabilities, tail), quantile(probabilities, 1 - tail)];
}

function buildDotaSeriesProjection(input) {
  if (!isObject(input)) throw new TypeError("projection input is required.");
  if (input.schemaVersion !== INPUT_SCHEMA) throw new RangeError(`schemaVersion must be ${INPUT_SCHEMA}.`);
  const generatedAtMs = requireTimestamp(input.generatedAt, "generatedAt");
  if (input.marketFamily !== "dota2_match_winner") throw new RangeError("marketFamily must be dota2_match_winner.");
  if (!['team_a', 'team_b'].includes(input.side)) throw new RangeError("side must be team_a or team_b.");
  requireString(input.eventId, "eventId");
  requireString(input.selection, "selection");
  requireString(input.predictionArtifactLocator, "predictionArtifactLocator");
  validatePolicy(input.policy, generatedAtMs);
  const features = validateFeatures(input.featureSnapshot, generatedAtMs, input.policy);
  const expectedSelection = input.side === "team_a" ? features.teamA : features.teamB;
  if (input.selection !== expectedSelection) throw new RangeError("selection does not match side and feature teams.");

  const ratings = rate(features.matches, input.policy.initialRating, input.policy.kFactor);
  const teamAProbability = winProbability(
    ratings.get(features.teamA) ?? input.policy.initialRating,
    ratings.get(features.teamB) ?? input.policy.initialRating
  );
  const seed = contentDigest({
    implementationDigest: DOTA_PROJECTION_IMPLEMENTATION_DIGEST,
    policyDigest: input.policy.policyDigest,
    featureSnapshotDigest: input.featureSnapshot.featureSnapshotDigest,
    eventId: input.eventId
  });
  const [teamALower, teamAUpper] = bootstrapInterval(features, input.policy, seed);
  const teamASelected = input.side === "team_a";
  const projection = {
    schemaVersion: OUTPUT_SCHEMA,
    independentModelId: MODEL_ID,
    independentModelVersion: MODEL_VERSION,
    independentImplementationDigest: DOTA_PROJECTION_IMPLEMENTATION_DIGEST,
    featureSnapshotDigest: input.featureSnapshot.featureSnapshotDigest,
    eventId: input.eventId,
    marketFamily: input.marketFamily,
    selection: input.selection,
    side: input.side,
    generatedAt: input.generatedAt,
    pointProbability: teamASelected ? teamAProbability : 1 - teamAProbability,
    lowerProbability: teamASelected ? teamALower : 1 - teamAUpper,
    upperProbability: teamASelected ? teamAUpper : 1 - teamALower,
    predictionArtifactLocator: input.predictionArtifactLocator,
    verificationStatus: "verified"
  };
  return { ...projection, predictionDigest: contentDigest(projection) };
}

module.exports = {
  DOTA_PROJECTION_IMPLEMENTATION_DIGEST,
  buildDotaSeriesProjection
};
