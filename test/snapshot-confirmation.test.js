const assert = require("node:assert/strict");
const test = require("node:test");

const { createManualSnapshotConfirmation } = require("../src/live/snapshot-confirmation.js");

test("manual snapshot confirmation records review without authorizing provider verification", () => {
  const result = createManualSnapshotConfirmation({
    snapshot: {
      sourceUrl: "https://www.espn.com/mlb/odds/_/gameId/401816143",
      capturedAt: "2026-07-16T16:10:00.000Z",
      event: { eventId: "401816143" }
    },
    checks: {
      event: true,
      odds: true,
      roster: true
    },
    confirmedAt: "2026-07-16T16:15:00.000Z"
  });

  assert.equal(result.status, "manually_confirmed");
  assert.equal(result.confirmationType, "manual_visual_review");
  assert.equal(result.confirmedAt, "2026-07-16T16:15:00.000Z");
  assert.equal(result.capturedAt, "2026-07-16T16:10:00.000Z");
  assert.equal(result.sourceUrl, "https://www.espn.com/mlb/odds/_/gameId/401816143");
  assert.equal(result.eventId, "401816143");
  assert.deepEqual(result.checks, { event: true, odds: true, roster: true });
  assert.equal(result.verifiedOdds, false);
  assert.equal(result.verifiedInjuries, false);
  assert.equal(result.verifiedProbabilities, false);
});

test("manual snapshot confirmation rejects an incomplete checklist", () => {
  assert.throws(
    () => createManualSnapshotConfirmation({
      snapshot: { event: { eventId: "401816143" } },
      checks: { event: true, odds: true, roster: false }
    }),
    /All manual confirmation checks are required/
  );
});
