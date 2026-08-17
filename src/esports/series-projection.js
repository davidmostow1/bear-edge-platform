const { contentDigest } = require("../audit/canonical-json.js");

const OUTPUT_SCHEMA = "bear-edge.independent-projection.v1";
const SERIES_PROJECTION_CONFIGS = Object.freeze({
  CS2: Object.freeze({
    modelId: "cs2_elo_series_v1",
    modelVersion: "1.0.0",
    marketFamily: "cs2_match_winner",
    inputSchema: "bear-edge.cs2-series-projection-input.v1"
  }),
  DOTA2: Object.freeze({
    modelId: "dota_elo_series_v1",
    modelVersion: "1.0.0",
    marketFamily: "dota2_match_winner",
    inputSchema: "bear-edge.dota2-series-projection-input.v1"
  }),
  LOL: Object.freeze({
    modelId: "lol_elo_series_v1",
    modelVersion: "1.0.0",
    marketFamily: "lol_match_winner",
    inputSchema: "bear-edge.lol-series-projection-input.v1"
  }),
  VALORANT: Object.freeze({
    modelId: "valorant_elo_series_v1",
    modelVersion: "1.0.0",
    marketFamily: "valorant_match_winner",
    inputSchema: "bear-edge.valorant-series-projection-input.v1"
  })
});

function isObject(value) {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function requireString(value, field) {
  if (typeof value !== "string" || value.trim() === "") throw new TypeError(`${field} must be a non-empty string.`);
  return value.trim();
}

function requireTimestamp(value, field) {
  const milliseconds = Date.parse(value ?? "");
  if (!Number.isFinite(milliseconds)) throw new TypeError(`${field} must be a valid timestamp.`);
  return milliseconds;
}

function withoutDigest(object, field) {
  const payload = { ...object };
  delete payload[field];
  return payload;
}

function validatePolicy(policy, generatedAtMs) {
  if (!isObject(policy)) throw new TypeError("policy is required.");
  if (contentDigest(withoutDigest(policy, "policyDigest")) !== policy.policyDigest) {
    throw new Error("policyDigest does not match the retained policy.");
  }
  if (requireTimestamp(policy.registeredAt, "policy.registeredAt") >= generatedAtMs) {
    throw new RangeError("policy.registeredAt must be before generatedAt.");
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
  if (contentDigest(withoutDigest(snapshot, "featureSnapshotDigest")) !== snapshot.featureSnapshotDigest) {
    throw new Error("featureSnapshotDigest does not match the retained feature snapshot.");
  }
  if (requireTimestamp(snapshot.capturedAt, "featureSnapshot.capturedAt") > generatedAtMs) {
    throw new RangeError("featureSnapshot.capturedAt cannot be after generatedAt.");
  }
  const teamA = requireString(snapshot.teamA, "featureSnapshot.teamA");
  const teamB = requireString(snapshot.teamB, "featureSnapshot.teamB");
  const contextKey = requireString(snapshot.contextKey, "featureSnapshot.contextKey");
  if (teamA === teamB) throw new RangeError("featureSnapshot teams must be distinct.");
  if (![1, 3, 5].includes(snapshot.bestOf)) throw new RangeError("featureSnapshot.bestOf must be 1, 3, or 5.");
  if (!Array.isArray(snapshot.matches) || snapshot.matches.length === 0) {
    throw new RangeError("featureSnapshot.matches must contain retained history.");
  }

  const ids = new Set();
  const counts = new Map([[teamA, 0], [teamB, 0]]);
  const matches = snapshot.matches.map((match, index) => {
    if (!isObject(match)) throw new TypeError(`match ${index} must be an object.`);
    const eventId = requireString(match.eventId, `match ${index}.eventId`);
    if (ids.has(eventId)) throw new RangeError(`duplicate historical eventId: ${eventId}.`);
    ids.add(eventId);
    const startedAtMs = requireTimestamp(match.startedAt, `match ${index}.startedAt`);
    if (startedAtMs >= generatedAtMs) throw new RangeError("Every historical match must start before generatedAt.");
    const historicalA = requireString(match.teamA, `match ${index}.teamA`);
    const historicalB = requireString(match.teamB, `match ${index}.teamB`);
    if (historicalA === historicalB || ![historicalA, historicalB].includes(match.winner)) {
      throw new RangeError(`match ${index} has invalid teams or winner.`);
    }
    if (match.bestOf !== snapshot.bestOf) throw new RangeError("Historical bestOf must match the candidate series format.");
    if (match.contextKey !== contextKey) throw new RangeError("Historical contextKey must match the feature snapshot contextKey.");
    if (counts.has(historicalA)) counts.set(historicalA, counts.get(historicalA) + 1);
    if (counts.has(historicalB)) counts.set(historicalB, counts.get(historicalB) + 1);
    return { eventId, startedAtMs, teamA: historicalA, teamB: historicalB, winner: match.winner };
  }).sort((left, right) => left.startedAtMs - right.startedAtMs || left.eventId.localeCompare(right.eventId));

  for (const team of [teamA, teamB]) {
    if (counts.get(team) < policy.minimumMatchesPerTeam) {
      throw new RangeError(`${team} does not satisfy minimumMatchesPerTeam.`);
    }
  }
  return { teamA, teamB, contextKey, matches };
}

function probability(ratingA, ratingB) {
  return 1 / (1 + (10 ** ((ratingB - ratingA) / 400)));
}

function ratingsFor(matches, policy) {
  const ratings = new Map();
  const get = (team) => ratings.get(team) ?? policy.initialRating;
  for (const match of matches) {
    const ratingA = get(match.teamA);
    const ratingB = get(match.teamB);
    const expectedA = probability(ratingA, ratingB);
    const actualA = match.winner === match.teamA ? 1 : 0;
    ratings.set(match.teamA, ratingA + policy.kFactor * (actualA - expectedA));
    ratings.set(match.teamB, ratingB + policy.kFactor * ((1 - actualA) - (1 - expectedA)));
  }
  return ratings;
}

function randomFrom(seed) {
  let state = Number.parseInt(seed.slice(0, 8), 16) || 1;
  return () => {
    state = (1664525 * state + 1013904223) >>> 0;
    return state / 0x100000000;
  };
}

function quantile(sorted, fraction) {
  const position = (sorted.length - 1) * fraction;
  const lower = Math.floor(position);
  const upper = Math.ceil(position);
  return lower === upper
    ? sorted[lower]
    : sorted[lower] + (sorted[upper] - sorted[lower]) * (position - lower);
}

function interval(features, policy, seed) {
  const random = randomFrom(seed);
  const values = [];
  for (let sampleIndex = 0; sampleIndex < policy.bootstrapResamples; sampleIndex += 1) {
    const sample = Array.from(
      { length: features.matches.length },
      () => features.matches[Math.floor(random() * features.matches.length)]
    ).sort((left, right) => left.startedAtMs - right.startedAtMs || left.eventId.localeCompare(right.eventId));
    const ratings = ratingsFor(sample, policy);
    values.push(probability(
      ratings.get(features.teamA) ?? policy.initialRating,
      ratings.get(features.teamB) ?? policy.initialRating
    ));
  }
  values.sort((left, right) => left - right);
  const tail = (1 - policy.confidenceLevel) / 2;
  return [quantile(values, tail), quantile(values, 1 - tail)];
}

function implementationDigest(game, config) {
  return contentDigest({
    game,
    ...config,
    algorithm: "chronological_series_elo_with_event_bootstrap",
    supportedBestOf: [1, 3, 5],
    probabilityTransform: "base10_logistic_400",
    uncertaintyMethod: "deterministic_event_bootstrap_percentile"
  });
}

function buildEsportsSeriesProjection(game, input) {
  const config = SERIES_PROJECTION_CONFIGS[game];
  if (!config) throw new RangeError("game must be CS2, DOTA2, LOL, or VALORANT.");
  if (!isObject(input)) throw new TypeError("projection input is required.");
  if (input.schemaVersion !== config.inputSchema) throw new RangeError(`schemaVersion must be ${config.inputSchema}.`);
  if (input.marketFamily !== config.marketFamily) throw new RangeError(`marketFamily must be ${config.marketFamily}.`);
  if (!["team_a", "team_b"].includes(input.side)) throw new RangeError("side must be team_a or team_b.");
  const generatedAtMs = requireTimestamp(input.generatedAt, "generatedAt");
  requireString(input.eventId, "eventId");
  requireString(input.selection, "selection");
  requireString(input.predictionArtifactLocator, "predictionArtifactLocator");
  validatePolicy(input.policy, generatedAtMs);
  const features = validateFeatures(input.featureSnapshot, generatedAtMs, input.policy);
  const expectedSelection = input.side === "team_a" ? features.teamA : features.teamB;
  if (input.selection !== expectedSelection) throw new RangeError("selection does not match side and feature teams.");

  const digest = implementationDigest(game, config);
  const ratings = ratingsFor(features.matches, input.policy);
  const pointA = probability(
    ratings.get(features.teamA) ?? input.policy.initialRating,
    ratings.get(features.teamB) ?? input.policy.initialRating
  );
  const seed = contentDigest({
    implementationDigest: digest,
    policyDigest: input.policy.policyDigest,
    featureSnapshotDigest: input.featureSnapshot.featureSnapshotDigest,
    eventId: input.eventId
  });
  const [lowerA, upperA] = interval(features, input.policy, seed);
  const selectA = input.side === "team_a";
  const projection = {
    schemaVersion: OUTPUT_SCHEMA,
    independentModelId: config.modelId,
    independentModelVersion: config.modelVersion,
    independentImplementationDigest: digest,
    featureSnapshotDigest: input.featureSnapshot.featureSnapshotDigest,
    eventId: input.eventId,
    marketFamily: input.marketFamily,
    selection: input.selection,
    side: input.side,
    generatedAt: input.generatedAt,
    pointProbability: selectA ? pointA : 1 - pointA,
    lowerProbability: selectA ? lowerA : 1 - upperA,
    upperProbability: selectA ? upperA : 1 - lowerA,
    predictionArtifactLocator: input.predictionArtifactLocator,
    verificationStatus: "verified"
  };
  return { ...projection, predictionDigest: contentDigest(projection) };
}

module.exports = { SERIES_PROJECTION_CONFIGS, buildEsportsSeriesProjection };
