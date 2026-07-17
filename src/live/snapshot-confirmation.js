function createManualSnapshotConfirmation(input = {}) {
  const checks = input.checks ?? {};
  const missingChecks = ["event", "odds", "roster"].filter((check) => checks[check] !== true);

  if (missingChecks.length > 0) {
    throw new Error(`All manual confirmation checks are required: ${missingChecks.join(", ")}.`);
  }

  const snapshot = input.snapshot ?? {};
  const event = snapshot.event ?? {};

  return {
    status: "manually_confirmed",
    confirmationType: "manual_visual_review",
    reviewer: input.reviewer ?? "local_operator",
    confirmedAt: input.confirmedAt ?? new Date().toISOString(),
    capturedAt: snapshot.capturedAt ?? null,
    sourceUrl: snapshot.sourceUrl ?? event.evidence?.sourceUrl ?? null,
    eventId: event.eventId ?? null,
    checks: {
      event: true,
      odds: true,
      roster: true
    },
    verifiedOdds: false,
    verifiedInjuries: false,
    verifiedProbabilities: false,
    note: "Displayed browser evidence was manually reviewed; provider/API verification remains false."
  };
}

module.exports = {
  createManualSnapshotConfirmation
};
