const test = require("node:test");
const assert = require("node:assert/strict");

const {
  probabilityPriceToAmericanOdds,
  projectLolCalibrationRow
} = require("../src/calibration/lol-binary-projection.js");

test("binary contract ask maps to payout-equivalent American odds", () => {
  assert.ok(Math.abs(probabilityPriceToAmericanOdds(0.8) - (-400)) < 1e-12);
  assert.ok(Math.abs(probabilityPriceToAmericanOdds(0.2) - 400) < 1e-12);
  assert.equal(probabilityPriceToAmericanOdds(0.5), 100);
});

test("LoL scored row projects into canonical calibration row without market leakage", () => {
  const row = projectLolCalibrationRow({
    prediction_id: "ecaf8ef9-9d7b-4f03-9929-854f738b777d",
    model_id: "SBKP-LOL-FMW-GPR-BT-0.1.0",
    canonical_event_id: "RIOT:LCK:2026-08-19:GEN-KT",
    market_family: "FULL_MATCH_WINNER",
    team_a: "Gen.G Esports",
    team_b: "kt Rolster",
    raw_probability_a: 0.777555408598894,
    generated_at: "2026-08-17T19:03:20.000Z",
    evidence_cutoff_at: "2026-08-17T19:03:20.000Z",
    scheduled_start_at: "2026-08-19T08:00:00.000Z",
    prediction_source_digest: "a".repeat(64),
    decision_team_a_yes_ask: 0.79,
    decision_team_b_yes_ask: 0.22,
    decision_captured_at: "2026-08-17T19:02:32.000Z",
    decision_source_digest: "b".repeat(64),
    outcome_a: 1,
    outcome_resolved_at: "2026-08-19T10:00:00.000Z",
    closing_team_a_yes_ask: 0.99,
    closing_team_b_yes_ask: 0.01,
    closing_captured_at: "2026-08-19T10:00:01.000Z",
    closing_source_time: "2026-08-19T09:59:59.000Z",
    closing_source_digest: "c".repeat(64),
    closing_is_final: true
  }, { modelVersion: "0.1.0" });

  assert.equal(row.predictionId, "ecaf8ef9-9d7b-4f03-9929-854f738b777d");
  assert.equal(row.eventId, "RIOT:LCK:2026-08-19:GEN-KT");
  assert.equal(row.marketFamily, "full_match_winner");
  assert.equal(row.participantId, "Gen.G Esports");
  assert.equal(row.side, "over");
  assert.equal(row.line, 0.5);
  assert.equal(row.predictedProbability, 0.777555408598894);
  assert.equal(row.outcome, 1);
  assert.equal(row.sourceDigests.length, 2);
  assert.equal(row.sourceEvidence.length, 2);
  assert.equal(row.closingPrice.isFinal, true);
  assert.ok(row.price < 0);
  assert.ok(row.oppositePrice > 0);
});

test("unsettled rows remain prospective without fabricated closing evidence", () => {
  const row = projectLolCalibrationRow({
    prediction_id: "10000000-0000-4000-8000-000000000001",
    model_id: "SBKP-LOL-FMW-GPR-BT-0.1.0",
    canonical_event_id: "event-2",
    market_family: "FULL_MATCH_WINNER",
    team_a: "A",
    team_b: "B",
    raw_probability_a: 0.6,
    generated_at: "2026-08-17T10:00:00.000Z",
    evidence_cutoff_at: "2026-08-17T10:00:00.000Z",
    scheduled_start_at: "2026-08-18T10:00:00.000Z",
    prediction_source_digest: "a".repeat(64),
    decision_team_a_yes_ask: 0.6,
    decision_team_b_yes_ask: 0.41,
    decision_captured_at: "2026-08-17T09:59:00.000Z",
    decision_source_digest: "b".repeat(64),
    outcome_a: null,
    outcome_resolved_at: null,
    closing_team_a_yes_ask: null,
    closing_team_b_yes_ask: null,
    closing_captured_at: null,
    closing_source_digest: null,
    closing_is_final: null
  }, { modelVersion: "0.1.0" });

  assert.equal(row.settledAt, null);
  assert.equal(row.outcome, null);
  assert.equal(row.closingPrice, null);
});
