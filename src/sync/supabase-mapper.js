const { canonicalStringify } = require("../audit/canonical-json.js");
const { validateAuditRecord } = require("../audit/record-contract.js");

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const REMOTE_SOURCES = new Set([
  "local_engine",
  "live_ui",
  "backup_restore",
  "screenshot_intake",
  "assistant_review"
]);
const REMOTE_MARKET_KINDS = new Set([
  "MONEYLINE",
  "SPREAD",
  "TOTAL",
  "PLAYER_PROP",
  "TEAM_PROP"
]);
const RESEARCH_MARKET_KINDS = Object.freeze({
  batter_hits: "PLAYER_PROP",
  batter_runs_scored: "PLAYER_PROP",
  batter_total_bases: "PLAYER_PROP",
  game_moneyline: "MONEYLINE",
  game_spread: "SPREAD",
  game_total: "TOTAL",
  pitcher_strikeouts: "PLAYER_PROP",
  run_line: "SPREAD",
  team_total: "TEAM_PROP"
});

function clone(value) {
  return JSON.parse(canonicalStringify(value));
}

function requireUuid(value, label) {
  if (!UUID_PATTERN.test(value ?? "")) {
    throw new TypeError(`${label} must be a UUID.`);
  }

  return value;
}

function requireCanonicalRecord(record, recordType, label) {
  const validation = validateAuditRecord(record);

  if (!validation.valid || record?.recordType !== recordType) {
    throw new TypeError(`${label} must be a valid canonical ${recordType} record.`);
  }

  return record;
}

function supersedesClientEventId(record, prefix) {
  if (record.supersedesId === null) {
    return null;
  }

  const expectedPrefix = `${prefix}_`;
  if (typeof record.supersedesId !== "string" || !record.supersedesId.startsWith(expectedPrefix)) {
    throw new TypeError(`Superseded ${prefix} record id has an invalid prefix.`);
  }

  return requireUuid(
    record.supersedesId.slice(expectedPrefix.length),
    `Superseded ${prefix} client event id`
  );
}

function nullableInteger(value, label) {
  if (value === null || value === undefined) {
    return null;
  }

  if (!Number.isSafeInteger(value)) {
    throw new TypeError(`${label} must be an integer or null for the remote schema.`);
  }

  return value;
}

function normalizedText(value, fallback) {
  return typeof value === "string" && value.trim() ? value.trim() : fallback;
}

function remoteSource(record) {
  const channel = normalizedText(record?.origin?.channel, "local_engine").toLowerCase();

  if (REMOTE_SOURCES.has(channel)) {
    return channel;
  }
  if (channel.includes("screenshot")) {
    return "screenshot_intake";
  }
  if (channel.includes("assistant")) {
    return "assistant_review";
  }
  if (channel.includes("backup") || channel.includes("restore")) {
    return "backup_restore";
  }
  if (channel.includes("live") || channel.includes("dashboard")) {
    return "live_ui";
  }

  return "local_engine";
}

function primaryReasonCode(record) {
  const failedGate = record.gateResults.find(
    (gate) => gate && typeof gate === "object" && gate.status !== "pass" && typeof gate.code === "string"
  );

  if (failedGate?.code) {
    return failedGate.code;
  }

  const riskFlag = record.riskFlags[0];

  if (typeof riskFlag === "string" && riskFlag.trim()) {
    return riskFlag.trim();
  }
  if (riskFlag && typeof riskFlag === "object" && typeof riskFlag.code === "string") {
    return riskFlag.code;
  }

  return `${record.verdict}_NO_BLOCKING_REASON`;
}

function eventLabel(record) {
  const away = normalizedText(record.event.awayTeam, null);
  const home = normalizedText(record.event.homeTeam, null);

  if (away && home) {
    return `${away} @ ${home}`;
  }

  return away ?? home;
}

function evidenceReference(record) {
  const source = record.sources.find(
    (entry) => entry && typeof entry.sourceLocator === "string" && entry.sourceLocator.trim()
  );

  return source?.sourceLocator ?? null;
}

function priceIntegrityStatus(record) {
  const failedPriceGate = record.gateResults.some((gate) => (
    gate &&
    typeof gate === "object" &&
    typeof gate.code === "string" &&
    /PRICE|SPORTSBOOK|ODDS/.test(gate.code) &&
    gate.status !== "pass"
  ));

  if (failedPriceGate) {
    return "BLOCK";
  }

  const sourceVerified = record.sources.some((source) => (
    source?.verificationStatus === "verified" && source?.freshness === "fresh"
  ));

  return sourceVerified ? "CLEAR" : "REVIEW";
}

function remoteMarketKind(record) {
  const marketFamily = normalizedText(record?.market?.marketFamily, "");
  const normalizedKind = marketFamily.toUpperCase();

  if (REMOTE_MARKET_KINDS.has(normalizedKind)) {
    return normalizedKind;
  }

  return RESEARCH_MARKET_KINDS[marketFamily.toLowerCase()] ?? null;
}

function marketIdentityStatus(record) {
  const identityGates = record.gateResults.filter((gate) => (
    gate &&
    typeof gate === "object" &&
    typeof gate.code === "string" &&
    /EVENT|PARTICIPANT|MARKET|LINE|SELECTION/.test(gate.code)
  ));

  if (identityGates.some((gate) => gate.status !== "pass")) {
    return "BLOCK";
  }

  const identityComplete = (
    identityGates.length > 0 &&
    record.event.sport &&
    record.event.league &&
    record.event.eventId &&
    record.market.marketFamily &&
    remoteMarketKind(record) &&
    record.market.selection &&
    record.market.marketPeriod &&
    (!["PLAYER_PROP", "TEAM_PROP"].includes(remoteMarketKind(record)) || (
      record.market.participantId || record.market.participantName
    ))
  );

  return identityComplete ? "COMPLETE" : "BLOCK";
}

function remoteMarketType(record) {
  if (record.origin?.channel === "in_game_live") {
    return "Live Bet";
  }

  return {
    MONEYLINE: "Main Side",
    SPREAD: "Main Side",
    TOTAL: "Main Total",
    PLAYER_PROP: "Primary Prop",
    TEAM_PROP: "Derivative Prop"
  }[remoteMarketKind(record)] ?? "Derivative Prop";
}

function remoteProbabilityMethod(record) {
  const method = normalizedText(record.model.probabilityMethod, "").toLowerCase();

  if (record.model.modelStatus === "validated") {
    return method.includes("ensemble") ? "ENSEMBLE" : "CALIBRATED_MODEL";
  }
  if (method.includes("historical") || method.includes("base_rate")) {
    return "HISTORICAL_BASE_RATE";
  }

  return "MANUAL_RESEARCH";
}

function mapDecisionRecord(record, ownerUserId) {
  const evaluation = requireCanonicalRecord(
    record,
    "evaluation",
    "Canonical decision record"
  );
  requireUuid(ownerUserId, "Owner user id");

  const adjustedProbability = evaluation.probability.adjustedProbability;
  const rawProbability = evaluation.probability.rawModelProbability;
  const sampleSize = evaluation.model.sampleSize;

  return {
    user_id: ownerUserId,
    client_event_id: evaluation.clientEventId,
    engine_version: normalizedText(
      evaluation.audit.codeVersion,
      normalizedText(evaluation.model.modelVersion, "unknown")
    ),
    market: normalizedText(
      evaluation.market.marketFamily,
      normalizedText(evaluation.market.marketType, "UNKNOWN")
    ),
    market_type: remoteMarketType(evaluation),
    odds: nullableInteger(evaluation.price.marketOdds, "Market odds"),
    p_user: adjustedProbability ?? rawProbability ?? null,
    tier: null,
    verdict: evaluation.verdict,
    reason_code: primaryReasonCode(evaluation),
    reason: normalizedText(evaluation.reasons[0], "No decision reason recorded."),
    recommended_stake: evaluation.stake.recommendedStake,
    input_snapshot: {
      audit_record: clone(evaluation)
    },
    output_snapshot: {
      verdict: evaluation.verdict,
      permission: evaluation.permission,
      probability: clone(evaluation.probability),
      edge: clone(evaluation.edge),
      stake: clone(evaluation.stake),
      reasons: clone(evaluation.reasons),
      risk_flags: clone(evaluation.riskFlags)
    },
    state_snapshot: {
      gates: clone(evaluation.gateResults),
      model_status: evaluation.model.modelStatus,
      evidence_completeness: evaluation.audit.evidenceCompleteness
    },
    source: remoteSource(evaluation),
    data_quality: evaluation.audit.evidenceCompleteness === "complete"
      ? "complete"
      : "legacy_incomplete",
    created_at: evaluation.createdAt,
    event_label: eventLabel(evaluation),
    sportsbook: evaluation.price.sportsbook,
    selection_label: evaluation.market.selection,
    counterpart_odds: nullableInteger(evaluation.price.oppositeOdds, "Opposite odds"),
    offer_captured_at: evaluation.price.priceCapturedAt,
    is_live: evaluation.origin.channel === "in_game_live",
    live_state: null,
    evidence_ref: evidenceReference(evaluation),
    price_overround: null,
    price_integrity_status: priceIntegrityStatus(evaluation),
    probability_method: remoteProbabilityMethod(evaluation),
    probability_source: evaluation.model.modelId,
    probability_model_version: evaluation.model.modelVersion,
    probability_sample_size: nullableInteger(sampleSize, "Probability sample size"),
    probability_evidence_at: evaluation.model.trainingCutoff,
    probability_notes: evaluation.reasons.join(" ") || null,
    probability_provenance_status: evaluation.model.modelStatus === "validated" ? "COMPLETE" : "BLOCK",
    sport_code: evaluation.event.sport,
    league_code: evaluation.event.league,
    canonical_event_id: evaluation.event.eventId,
    market_kind: remoteMarketKind(evaluation),
    market_period: evaluation.market.marketPeriod,
    market_subject: evaluation.market.participantId ?? evaluation.market.participantName,
    market_selection: evaluation.market.selection,
    line_value: evaluation.market.line,
    market_identity_status: marketIdentityStatus(evaluation),
    market_fingerprint: null,
    schema_version: evaluation.schemaVersion,
    content_digest: evaluation.contentDigest,
    authority: evaluation.authority
  };
}

function mapSettlementRecord(record, ownerUserId, remoteDecisionId, evaluationRecord = null) {
  const settlement = requireCanonicalRecord(
    record,
    "settlement",
    "Canonical settlement record"
  );
  requireUuid(ownerUserId, "Owner user id");
  requireUuid(remoteDecisionId, "Remote decision id");

  let takenOdds = null;

  if (settlement.outcome !== "pending") {
    const evaluation = requireCanonicalRecord(
      evaluationRecord,
      "evaluation",
      "Authoritative evaluation with taken odds"
    );

    if (evaluation.id !== settlement.evaluationId) {
      throw new TypeError("Authoritative evaluation with taken odds must match the settlement evaluation id.");
    }

    takenOdds = nullableInteger(evaluation.price.marketOdds, "Taken odds");

    if (takenOdds === null) {
      throw new TypeError("Authoritative evaluation with taken odds is required for a final settlement.");
    }
  }

  return {
    user_id: ownerUserId,
    decision_id: remoteDecisionId,
    client_event_id: settlement.clientEventId,
    schema_version: settlement.schemaVersion,
    content_digest: settlement.contentDigest,
    authority: settlement.authority,
    source: "local_engine",
    result: settlement.outcome,
    stake: settlement.stake,
    taken_odds: takenOdds,
    closing_odds: nullableInteger(settlement.closingOdds, "Closing odds"),
    profit: settlement.profit,
    clv_delta: null,
    settled_at: settlement.settledAt,
    created_at: settlement.createdAt
  };
}

function mapAmendmentRecord(
  record,
  ownerUserId,
  remoteDecisionId,
  remoteSettlementId
) {
  const amendment = requireCanonicalRecord(
    record,
    "amendment",
    "Canonical amendment record"
  );
  requireUuid(ownerUserId, "Owner user id");
  requireUuid(remoteDecisionId, "Remote decision id");
  requireUuid(remoteSettlementId, "Remote settlement id");

  return {
    user_id: ownerUserId,
    decision_id: remoteDecisionId,
    settlement_id: remoteSettlementId,
    client_event_id: amendment.clientEventId,
    schema_version: amendment.schemaVersion,
    content_digest: amendment.contentDigest,
    authority: amendment.authority,
    source: "local_engine",
    reason: amendment.reason,
    patch: clone(amendment.patch),
    created_at: amendment.createdAt
  };
}

function mapPredictionOutcomeRecord(record, ownerUserId, remoteDecisionId) {
  const outcome = requireCanonicalRecord(
    record,
    "prediction_outcome",
    "Canonical prediction outcome record"
  );
  requireUuid(ownerUserId, "Owner user id");
  requireUuid(remoteDecisionId, "Remote decision id");

  return {
    user_id: ownerUserId,
    decision_id: remoteDecisionId,
    client_event_id: outcome.clientEventId,
    supersedes_client_event_id: supersedesClientEventId(outcome, "outcome"),
    schema_version: outcome.schemaVersion,
    content_digest: outcome.contentDigest,
    authority: outcome.authority,
    outcome: outcome.outcome,
    resolved_at: outcome.resolvedAt,
    event_status: outcome.eventResult.status,
    home_score: nullableInteger(outcome.eventResult.homeScore, "Home score"),
    away_score: nullableInteger(outcome.eventResult.awayScore, "Away score"),
    observed_value: outcome.marketResult.observedValue,
    observed_unit: outcome.marketResult.unit,
    source_provider: outcome.source.provider,
    source_type: outcome.source.sourceType,
    source_locator: outcome.source.sourceLocator,
    source_captured_at: outcome.source.capturedAt,
    source_time: outcome.source.sourceTime,
    source_digest: outcome.source.digest,
    verification_status: outcome.source.verificationStatus,
    record_snapshot: clone(outcome),
    created_at: outcome.createdAt
  };
}

function mapClosingPriceRecord(record, ownerUserId, remoteDecisionId) {
  const closingPrice = requireCanonicalRecord(
    record,
    "closing_price",
    "Canonical closing price record"
  );
  requireUuid(ownerUserId, "Owner user id");
  requireUuid(remoteDecisionId, "Remote decision id");

  return {
    user_id: ownerUserId,
    decision_id: remoteDecisionId,
    client_event_id: closingPrice.clientEventId,
    supersedes_client_event_id: supersedesClientEventId(closingPrice, "close"),
    schema_version: closingPrice.schemaVersion,
    content_digest: closingPrice.contentDigest,
    authority: closingPrice.authority,
    sportsbook: closingPrice.price.sportsbook,
    market_odds: nullableInteger(closingPrice.price.marketOdds, "Closing market odds"),
    opposite_odds: nullableInteger(closingPrice.price.oppositeOdds, "Closing opposite odds"),
    market_closed_at: closingPrice.price.marketClosedAt,
    is_final: closingPrice.price.isFinal,
    source_provider: closingPrice.source.provider,
    source_type: closingPrice.source.sourceType,
    source_locator: closingPrice.source.sourceLocator,
    source_captured_at: closingPrice.source.capturedAt,
    source_time: closingPrice.source.sourceTime,
    source_digest: closingPrice.source.digest,
    verification_status: closingPrice.source.verificationStatus,
    record_snapshot: clone(closingPrice),
    created_at: closingPrice.createdAt
  };
}

module.exports = {
  mapAmendmentRecord,
  mapClosingPriceRecord,
  mapDecisionRecord,
  mapPredictionOutcomeRecord,
  mapSettlementRecord
};
