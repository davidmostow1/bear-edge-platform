const test = require("node:test");
const assert = require("node:assert/strict");

const {
  buildDotaSeriesProjection,
  DOTA_PROJECTION_IMPLEMENTATION_DIGEST
} = require("../src/esports/dota-series-projection.js");
const { contentDigest } = require("../src/audit/canonical-json.js");
const { prepareCandidateInput } = require("../src/cli/evaluate-esports.js");

function fixture(overrides = {}) {
  const generatedAt = "2026-08-17T12:00:00.000Z";
  const policy = {
    policyVersion: "dota-series-projection-1",
    registeredAt: "2026-08-01T00:00:00.000Z",
    initialRating: 1500,
    kFactor: 24,
    minimumMatchesPerTeam: 3,
    bootstrapResamples: 2000,
    confidenceLevel: 0.95
  };
  const matches = [
    ["m1", "2026-08-01T12:00:00.000Z", "Alpha", "Gamma", "Alpha"],
    ["m2", "2026-08-02T12:00:00.000Z", "Beta", "Gamma", "Gamma"],
    ["m3", "2026-08-03T12:00:00.000Z", "Alpha", "Delta", "Alpha"],
    ["m4", "2026-08-04T12:00:00.000Z", "Beta", "Delta", "Beta"],
    ["m5", "2026-08-05T12:00:00.000Z", "Alpha", "Beta", "Alpha"],
    ["m6", "2026-08-06T12:00:00.000Z", "Gamma", "Beta", "Beta"]
  ].map(([eventId, startedAt, teamA, teamB, winner]) => ({
    eventId,
    startedAt,
    teamA,
    teamB,
    winner,
    bestOf: 3,
    patch: "7.40"
  }));
  const featureSnapshot = {
    capturedAt: "2026-08-17T11:55:00.000Z",
    patch: "7.40",
    teamA: "Alpha",
    teamB: "Beta",
    matches
  };
  return {
    schemaVersion: "bear-edge.dota-series-projection-input.v1",
    eventId: "dota-event-1",
    marketFamily: "dota2_match_winner",
    selection: "Alpha",
    side: "team_a",
    generatedAt,
    predictionArtifactLocator: "file:///retained/dota-event-1-projection.json",
    policy: { ...policy, policyDigest: contentDigest(policy) },
    featureSnapshot: {
      ...featureSnapshot,
      featureSnapshotDigest: contentDigest(featureSnapshot)
    },
    ...overrides
  };
}

test("Dota projection deterministically creates a bound independent artifact", () => {
  const first = buildDotaSeriesProjection(fixture());
  const second = buildDotaSeriesProjection(fixture());

  assert.deepEqual(first, second);
  assert.equal(first.independentModelId, "dota_elo_series_v1");
  assert.equal(first.independentImplementationDigest, DOTA_PROJECTION_IMPLEMENTATION_DIGEST);
  assert.equal(first.verificationStatus, "verified");
  assert.ok(first.pointProbability > 0.5);
  assert.ok(first.lowerProbability <= first.pointProbability);
  assert.ok(first.pointProbability <= first.upperProbability);
  assert.match(first.predictionDigest, /^[a-f0-9]{64}$/);
});

test("Dota projection fails closed on future matches and insufficient history", () => {
  const future = fixture();
  future.featureSnapshot.matches[0].startedAt = "2026-08-18T12:00:00.000Z";
  future.featureSnapshot.featureSnapshotDigest = contentDigest({
    capturedAt: future.featureSnapshot.capturedAt,
    patch: future.featureSnapshot.patch,
    teamA: future.featureSnapshot.teamA,
    teamB: future.featureSnapshot.teamB,
    matches: future.featureSnapshot.matches
  });
  assert.throws(() => buildDotaSeriesProjection(future), /before generatedAt/);

  const insufficient = fixture();
  insufficient.featureSnapshot.matches = insufficient.featureSnapshot.matches.slice(0, 2);
  insufficient.featureSnapshot.featureSnapshotDigest = contentDigest({
    capturedAt: insufficient.featureSnapshot.capturedAt,
    patch: insufficient.featureSnapshot.patch,
    teamA: insufficient.featureSnapshot.teamA,
    teamB: insufficient.featureSnapshot.teamB,
    matches: insufficient.featureSnapshot.matches
  });
  assert.throws(() => buildDotaSeriesProjection(insufficient), /minimumMatchesPerTeam/);
});

test("Dota projection rejects altered policy and feature payloads", () => {
  const alteredPolicy = fixture();
  alteredPolicy.policy.kFactor = 40;
  assert.throws(() => buildDotaSeriesProjection(alteredPolicy), /policyDigest/);

  const alteredFeatures = fixture();
  alteredFeatures.featureSnapshot.matches[0].winner = "Gamma";
  assert.throws(() => buildDotaSeriesProjection(alteredFeatures), /featureSnapshotDigest/);
});

test("operational esports CLI replaces no caller probability with generated Dota projection", () => {
  const prepared = prepareCandidateInput({
    game: "DOTA2",
    model: {
      modelId: "esports_bear_stack_v1",
      modelVersion: "1.0.0"
    },
    projectionInput: fixture()
  });

  assert.equal(Object.hasOwn(prepared, "projectionInput"), false);
  assert.equal(prepared.model.independentModelId, "dota_elo_series_v1");
  assert.ok(prepared.model.pointProbability > 0.5);
  assert.match(prepared.model.predictionDigest, /^[a-f0-9]{64}$/);
});

test("operational esports CLI rejects caller probabilities when generation is requested", () => {
  assert.throws(() => prepareCandidateInput({
    game: "DOTA2",
    model: {
      modelId: "esports_bear_stack_v1",
      modelVersion: "1.0.0",
      pointProbability: 0.99
    },
    projectionInput: fixture()
  }), /conflicts with caller-supplied model fields/);
});
