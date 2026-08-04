const DIGEST_PATTERN = /^[a-f0-9]{64}$/;

function finite(value) {
  return typeof value === "number" && Number.isFinite(value);
}

function enrichmentKey(record) {
  return `${record?.event?.retrosheetGameId ?? ""}|${record?.market?.participantId ?? ""}`;
}

function missingReasons(enrichment) {
  const reasons = [];
  if (!enrichment || !finite(enrichment.seasonStrikeoutsPerBatterFaced)
    || !finite(enrichment.rolling5StrikeoutsPerBatterFaced)
    || !finite(enrichment.rolling10StrikeoutsPerBatterFaced)
    || !finite(enrichment.rolling5BattersFaced)
    || !finite(enrichment.rolling10BattersFaced)) {
    reasons.push("RETROSHEET_BATTERS_FACED_UNAVAILABLE");
  }
  if (enrichment?.confirmedLineup !== true
    || !finite(enrichment?.opponentLineupStrikeoutsPerPlateAppearance)
    || !finite(enrichment?.opponentLineupStrikeoutsPerPlateAppearanceVsPitcherHand)) {
    reasons.push("PREGAME_CONFIRMED_LINEUP_UNAVAILABLE");
  }
  if (!["L", "R"].includes(enrichment?.pitcherThrows)) {
    reasons.push("PITCHER_HANDEDNESS_UNAVAILABLE");
  }
  if (!Number.isFinite(Date.parse(enrichment?.eventStartTime))) {
    reasons.push("EVENT_START_TIME_UNAVAILABLE");
  }
  if (!Number.isInteger(enrichment?.daysRest) || enrichment.daysRest < 0) {
    reasons.push("DAYS_REST_UNAVAILABLE");
  }
  if (!Number.isFinite(Date.parse(enrichment?.capturedAt))
    || !DIGEST_PATTERN.test(enrichment?.contentDigest ?? "")
    || typeof enrichment?.licenseIdentifier !== "string"
    || enrichment.licenseIdentifier.length === 0) {
    reasons.push("ATTRIBUTED_ENRICHMENT_UNAVAILABLE");
  }
  return reasons;
}

function validateHistoricalRecord(record, index) {
  if (record?.mode !== "historical_reconstruction") {
    throw new TypeError(`records[${index}] must be historical_reconstruction evidence.`);
  }
  if (record?.market?.marketFamily !== "pitcher_strikeouts") {
    throw new TypeError(`records[${index}] must be a pitcher_strikeouts observation.`);
  }
  if (!Number.isInteger(record?.outcome?.observedValue) || record.outcome.observedValue < 0) {
    throw new TypeError(`records[${index}] must contain a non-negative strikeout outcome.`);
  }
  if (!Number.isInteger(record?.features?.historyGames) || record.features.historyGames < 1) {
    throw new TypeError(`records[${index}] must contain prior-only historyGames.`);
  }
}

function buildPitcherStrikeoutTrainingRows(records, options = {}) {
  if (!Array.isArray(records)) {
    throw new TypeError("records must be an array.");
  }
  const enrichmentByEventPitcher = options.enrichmentByEventPitcher ?? {};
  const rows = [];
  const missing = [];

  records.forEach((record, index) => {
    validateHistoricalRecord(record, index);
    const key = enrichmentKey(record);
    const enrichment = enrichmentByEventPitcher[key] ?? null;
    const reasons = missingReasons(enrichment);
    if (reasons.length > 0) {
      missing.push({
        eventId: record.event.retrosheetGameId,
        pitcherId: record.market.participantId,
        status: "missing",
        reasons,
        retainedOutcome: record.outcome.observedValue,
        trainingEligible: false,
        authorization: "RESEARCH_ONLY"
      });
      return;
    }

    const eventStart = Date.parse(enrichment.eventStartTime);
    const capturedAt = Date.parse(enrichment.capturedAt);
    if (capturedAt >= eventStart) {
      missing.push({
        eventId: record.event.retrosheetGameId,
        pitcherId: record.market.participantId,
        status: "missing",
        reasons: ["POST_START_ENRICHMENT_REJECTED"],
        retainedOutcome: record.outcome.observedValue,
        trainingEligible: false,
        authorization: "RESEARCH_ONLY"
      });
      return;
    }

    rows.push({
      eventId: record.event.retrosheetGameId,
      eventStartTime: new Date(eventStart).toISOString(),
      pitcherId: record.market.participantId,
      outcome: record.outcome.observedValue,
      features: [
        1,
        record.features.historyGames,
        enrichment.daysRest,
        enrichment.seasonStrikeoutsPerBatterFaced,
        enrichment.rolling5StrikeoutsPerBatterFaced,
        enrichment.rolling10StrikeoutsPerBatterFaced,
        enrichment.rolling5BattersFaced,
        enrichment.rolling10BattersFaced,
        enrichment.opponentLineupStrikeoutsPerPlateAppearance,
        enrichment.opponentLineupStrikeoutsPerPlateAppearanceVsPitcherHand
      ],
      featureNames: [
        "intercept",
        "prior_starts",
        "days_rest",
        "season_strikeouts_per_batter_faced",
        "rolling_5_strikeouts_per_batter_faced",
        "rolling_10_strikeouts_per_batter_faced",
        "rolling_5_batters_faced",
        "rolling_10_batters_faced",
        "opponent_lineup_strikeouts_per_plate_appearance",
        "opponent_lineup_strikeouts_per_plate_appearance_vs_pitcher_hand"
      ],
      source: {
        retrosheetArchiveDigest: record.source.suppliedArchiveDigest,
        enrichmentCapturedAt: new Date(capturedAt).toISOString(),
        enrichmentDigest: enrichment.contentDigest,
        enrichmentLicenseIdentifier: enrichment.licenseIdentifier
      },
      trainingEligible: true,
      authorization: "RESEARCH_ONLY"
    });
  });

  return {
    schemaVersion: "1.0.0",
    marketFamily: "pitcher_strikeouts",
    rows,
    missing,
    summary: {
      suppliedHistoricalRecords: records.length,
      trainingEligibleRows: rows.length,
      missingFeatureRows: missing.length
    },
    promotionEligible: false,
    modelValidation: "NOT_ESTABLISHED",
    wageringAuthority: "UNCHANGED"
  };
}

module.exports = {
  buildPitcherStrikeoutTrainingRows
};
