const { buildCalibrationReport } = require("./report.js");

const DIGEST_PATTERN = /^[a-f0-9]{64}$/;

function assertProbability(value, field) {
  if (typeof value !== "number" || !Number.isFinite(value) || value <= 0 || value >= 1) {
    throw new TypeError(`${field} must be strictly between zero and one.`);
  }
}

function assertDigest(value, field) {
  if (typeof value !== "string" || !DIGEST_PATTERN.test(value)) {
    throw new TypeError(`${field} must be a lowercase SHA-256 digest.`);
  }
}

function toIso(value, field) {
  if (typeof value !== "string" || !Number.isFinite(Date.parse(value))) {
    throw new TypeError(`${field} must be a valid timestamp.`);
  }
  return new Date(value).toISOString();
}

function probabilityPriceToAmericanOdds(probabilityPrice) {
  assertProbability(probabilityPrice, "probabilityPrice");
  if (probabilityPrice === 0.5) return 100;
  return probabilityPrice > 0.5
    ? -100 * probabilityPrice / (1 - probabilityPrice)
    : 100 * (1 - probabilityPrice) / probabilityPrice;
}

function sourceEvidence(sourceIdentifier, capturedAt, contentDigest) {
  assertDigest(contentDigest, `${sourceIdentifier}.contentDigest`);
  return {
    sourceIdentifier,
    capturedAt: toIso(capturedAt, `${sourceIdentifier}.capturedAt`),
    contentDigest
  };
}

function projectLolCalibrationRow(row, { modelVersion }) {
  if (!row || typeof row !== "object") throw new TypeError("row is required.");
  if (typeof modelVersion !== "string" || !modelVersion.trim()) {
    throw new TypeError("modelVersion is required.");
  }
  assertProbability(row.raw_probability_a, "raw_probability_a");
  assertProbability(row.decision_team_a_yes_ask, "decision_team_a_yes_ask");
  assertProbability(row.decision_team_b_yes_ask, "decision_team_b_yes_ask");
  assertDigest(row.prediction_source_digest, "prediction_source_digest");
  assertDigest(row.decision_source_digest, "decision_source_digest");

  const predictionAt = toIso(row.generated_at, "generated_at");
  const featureCutoffAt = toIso(row.evidence_cutoff_at, "evidence_cutoff_at");
  const eventStartAt = toIso(row.scheduled_start_at, "scheduled_start_at");
  const decisionCapturedAt = toIso(row.decision_captured_at, "decision_captured_at");
  if (Date.parse(decisionCapturedAt) > Date.parse(predictionAt)) {
    throw new RangeError("decision market snapshot must not be after the prediction.");
  }

  const evidence = [
    sourceEvidence(
      `prediction-context:${row.prediction_source_digest}`,
      featureCutoffAt,
      row.prediction_source_digest
    ),
    sourceEvidence(
      `decision-market:${row.decision_source_digest}`,
      decisionCapturedAt,
      row.decision_source_digest
    )
  ];

  let settledAt = null;
  let outcome = null;
  let closingPrice = null;
  if (row.outcome_a === 0 || row.outcome_a === 1) {
    settledAt = toIso(row.outcome_resolved_at, "outcome_resolved_at");
    assertProbability(row.closing_team_a_yes_ask, "closing_team_a_yes_ask");
    assertProbability(row.closing_team_b_yes_ask, "closing_team_b_yes_ask");
    assertDigest(row.closing_source_digest, "closing_source_digest");
    if (row.closing_is_final !== true) {
      throw new TypeError("settled rows require a final closing market snapshot.");
    }
    const closingCapturedAt = toIso(row.closing_captured_at, "closing_captured_at");
    const marketClosedAt = row.closing_source_time
      ? toIso(row.closing_source_time, "closing_source_time")
      : closingCapturedAt;
    outcome = row.outcome_a;
    closingPrice = {
      price: probabilityPriceToAmericanOdds(row.closing_team_a_yes_ask),
      oppositePrice: probabilityPriceToAmericanOdds(row.closing_team_b_yes_ask),
      capturedAt: closingCapturedAt,
      marketClosedAt,
      isFinal: true
    };
  }

  return {
    predictionId: row.prediction_id,
    eventId: row.canonical_event_id,
    marketFamily: "full_match_winner",
    participantId: row.team_a,
    // Existing calibration engine models a two-sided wager as over/under + line.
    // For binary full-match winners this is a schema adapter only: Team A YES is
    // represented as over 0.5. No player-prop semantics or market data enter the model.
    side: "over",
    line: 0.5,
    price: probabilityPriceToAmericanOdds(row.decision_team_a_yes_ask),
    oppositePrice: probabilityPriceToAmericanOdds(row.decision_team_b_yes_ask),
    predictedProbability: row.raw_probability_a,
    predictionAt,
    featureCutoffAt,
    eventStartAt,
    settledAt,
    outcome,
    closingPrice,
    modelId: row.model_id,
    modelVersion,
    sourceDigests: evidence.map((entry) => entry.contentDigest).sort(),
    sourceEvidence: evidence
  };
}

function buildLolCalibrationReport(scoredRows, options) {
  if (!Array.isArray(scoredRows)) throw new TypeError("scoredRows must be an array.");
  const projected = scoredRows.map((row) => projectLolCalibrationRow(row, {
    modelVersion: options.modelVersion
  }));
  return buildCalibrationReport(projected, {
    marketFamily: "full_match_winner",
    modelId: options.modelId,
    modelVersion: options.modelVersion,
    ...(options.registryPath ? { registryPath: options.registryPath } : {})
  });
}

module.exports = {
  probabilityPriceToAmericanOdds,
  projectLolCalibrationRow,
  buildLolCalibrationReport
};
