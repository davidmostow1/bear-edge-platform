const test = require("node:test");
const assert = require("node:assert/strict");

const { contentDigest } = require("../src/audit/canonical-json.js");
const {
  buildEsportsSeriesProjection,
  SERIES_PROJECTION_CONFIGS
} = require("../src/esports/series-projection.js");
const { prepareCandidateInput } = require("../src/cli/evaluate-esports.js");

function projectionInput(game) {
  const config = SERIES_PROJECTION_CONFIGS[game];
  const policyBody = {
    policyVersion: `${game.toLowerCase()}-series-1`,
    registeredAt: "2026-08-01T00:00:00.000Z",
    initialRating: 1500,
    kFactor: 24,
    minimumMatchesPerTeam: 3,
    bootstrapResamples: 2000,
    confidenceLevel: 0.95
  };
  const matches = [
    ["m1", "Alpha", "Gamma", "Alpha"],
    ["m2", "Beta", "Gamma", "Gamma"],
    ["m3", "Alpha", "Delta", "Alpha"],
    ["m4", "Beta", "Delta", "Beta"],
    ["m5", "Alpha", "Beta", "Alpha"],
    ["m6", "Gamma", "Beta", "Beta"]
  ].map(([id, teamA, teamB, winner], index) => ({
    eventId: `${game}-${id}`,
    startedAt: `2026-08-0${index + 1}T12:00:00.000Z`,
    teamA,
    teamB,
    winner,
    bestOf: 3,
    contextKey: `${game}-context-1`
  }));
  const featureBody = {
    capturedAt: "2026-08-17T11:55:00.000Z",
    teamA: "Alpha",
    teamB: "Beta",
    bestOf: 3,
    contextKey: `${game}-context-1`,
    matches
  };
  return {
    schemaVersion: config.inputSchema,
    eventId: `${game}-event-1`,
    marketFamily: config.marketFamily,
    selection: "Alpha",
    side: "team_a",
    generatedAt: "2026-08-17T12:00:00.000Z",
    predictionArtifactLocator: `file:///retained/${game}-event-1.json`,
    policy: { ...policyBody, policyDigest: contentDigest(policyBody) },
    featureSnapshot: { ...featureBody, featureSnapshotDigest: contentDigest(featureBody) }
  };
}

for (const game of ["CS2", "DOTA2", "LOL", "VALORANT"]) {
  test(`${game} produces a deterministic independent series projection`, () => {
    const first = buildEsportsSeriesProjection(game, projectionInput(game));
    const second = buildEsportsSeriesProjection(game, projectionInput(game));
    assert.deepEqual(first, second);
    assert.equal(first.marketFamily, SERIES_PROJECTION_CONFIGS[game].marketFamily);
    assert.equal(first.independentModelId, SERIES_PROJECTION_CONFIGS[game].modelId);
    assert.ok(first.lowerProbability <= first.pointProbability);
    assert.ok(first.pointProbability <= first.upperProbability);
  });

  test(`${game} operational CLI generates rather than accepts its probability`, () => {
    const prepared = prepareCandidateInput({
      game,
      model: { modelId: "esports_bear_stack_v1", modelVersion: "1.0.0" },
      projectionInput: projectionInput(game)
    });
    assert.equal(prepared.model.independentModelId, SERIES_PROJECTION_CONFIGS[game].modelId);
    assert.match(prepared.model.predictionDigest, /^[a-f0-9]{64}$/);
  });
}

test("series projection rejects cross-game schemas and context drift", () => {
  assert.throws(
    () => buildEsportsSeriesProjection("CS2", projectionInput("LOL")),
    /schemaVersion/
  );
  const input = projectionInput("VALORANT");
  input.featureSnapshot.matches[0].contextKey = "different-context";
  input.featureSnapshot.featureSnapshotDigest = contentDigest({
    capturedAt: input.featureSnapshot.capturedAt,
    teamA: input.featureSnapshot.teamA,
    teamB: input.featureSnapshot.teamB,
    bestOf: input.featureSnapshot.bestOf,
    contextKey: input.featureSnapshot.contextKey,
    matches: input.featureSnapshot.matches
  });
  assert.throws(() => buildEsportsSeriesProjection("VALORANT", input), /contextKey/);
});
