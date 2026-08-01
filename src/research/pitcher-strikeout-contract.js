const COHORT_START_AT = "2026-08-17T04:00:00.000Z";
const MARKET_FAMILY = "pitcher_strikeouts";
const SOURCE_KEYS = Object.freeze(["schedule", "pitcher", "lineup", "market"]);
const ALLOWED_VERIFICATION_STATUSES = new Set([
  "fixture_only",
  "historical_reconstruction",
  "verified_provider"
]);
const DIGEST_PATTERN = /^[a-f0-9]{64}$/;

class PitcherStrikeoutContractError extends TypeError {}

function isPlainObject(value) {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function requirePlainObject(value, field) {
  if (!isPlainObject(value)) {
    throw new PitcherStrikeoutContractError(`${field} must be an object.`);
  }
  return value;
}

function requireText(value, field) {
  if (typeof value !== "string" || value.trim() !== value || value.length === 0) {
    throw new PitcherStrikeoutContractError(`${field} must be a non-empty trimmed string.`);
  }
  return value;
}

function requireTimestamp(value, field) {
  requireText(value, field);
  const milliseconds = Date.parse(value);
  if (!Number.isFinite(milliseconds) || new Date(milliseconds).toISOString() !== value) {
    throw new PitcherStrikeoutContractError(`${field} must be a canonical ISO-8601 UTC timestamp.`);
  }
  return milliseconds;
}

function requireFinite(value, field, options = {}) {
  if (typeof value !== "number" || !Number.isFinite(value)) {
    throw new PitcherStrikeoutContractError(`${field} must be a finite number.`);
  }
  if (options.integer && !Number.isInteger(value)) {
    throw new PitcherStrikeoutContractError(`${field} must be an integer.`);
  }
  if (options.minimum !== undefined && value < options.minimum) {
    throw new PitcherStrikeoutContractError(`${field} must be at least ${options.minimum}.`);
  }
  if (options.maximum !== undefined && value > options.maximum) {
    throw new PitcherStrikeoutContractError(`${field} must be at most ${options.maximum}.`);
  }
  return value;
}

function validateSourceEnvelope(value, context) {
  const source = requirePlainObject(value, context.field);
  requireText(source.provider, `${context.field}.provider`);
  const sourceLocator = requireText(source.sourceLocator, `${context.field}.sourceLocator`);
  if (!/^(?:https?|fixture|file):\/\//.test(sourceLocator)) {
    throw new PitcherStrikeoutContractError(
      `${context.field}.sourceLocator must use an attributable http, https, fixture, or file locator.`
    );
  }
  const capturedAt = requireTimestamp(source.capturedAt, `${context.field}.capturedAt`);
  const sourceTime = requireTimestamp(source.sourceTime, `${context.field}.sourceTime`);
  if (sourceTime > capturedAt) {
    throw new PitcherStrikeoutContractError(`${context.field}.sourceTime cannot be after capture.`);
  }
  if (capturedAt > context.predictionTime) {
    throw new PitcherStrikeoutContractError(`${context.field} was captured after prediction time.`);
  }
  if (!DIGEST_PATTERN.test(source.contentDigest)) {
    throw new PitcherStrikeoutContractError(
      `${context.field}.contentDigest must be a lowercase SHA-256 digest.`
    );
  }
  requireText(source.licenseIdentifier, `${context.field}.licenseIdentifier`);
  if (source.freshness !== "fresh") {
    throw new PitcherStrikeoutContractError(`${context.field} must be fresh.`);
  }
  if (!ALLOWED_VERIFICATION_STATUSES.has(source.verificationStatus)) {
    throw new PitcherStrikeoutContractError(
      `${context.field}.verificationStatus is not allowed for the research contract.`
    );
  }
  return source;
}

function validateLineup(value) {
  const lineup = requirePlainObject(value, "opponentLineup");
  if (lineup.confirmed !== true) {
    throw new PitcherStrikeoutContractError("A confirmed lineup is required.");
  }
  requireFinite(
    lineup.aggregateStrikeoutsPerPlateAppearance,
    "opponentLineup.aggregateStrikeoutsPerPlateAppearance",
    { minimum: 0, maximum: 1 }
  );
  requireFinite(
    lineup.aggregateStrikeoutsPerPlateAppearanceVsPitcherHand,
    "opponentLineup.aggregateStrikeoutsPerPlateAppearanceVsPitcherHand",
    { minimum: 0, maximum: 1 }
  );
  if (!Array.isArray(lineup.players) || lineup.players.length !== 9) {
    throw new PitcherStrikeoutContractError("Confirmed lineup must contain exactly nine players.");
  }

  const playerIds = new Set();
  const battingOrders = new Set();
  for (let index = 0; index < lineup.players.length; index += 1) {
    const player = requirePlainObject(lineup.players[index], `opponentLineup.players[${index}]`);
    const playerId = requireText(player.playerId, `opponentLineup.players[${index}].playerId`);
    if (playerIds.has(playerId)) {
      throw new PitcherStrikeoutContractError("Confirmed lineup cannot contain duplicate players.");
    }
    playerIds.add(playerId);
    const battingOrder = requireFinite(
      player.battingOrder,
      `opponentLineup.players[${index}].battingOrder`,
      { integer: true, minimum: 1, maximum: 9 }
    );
    if (battingOrders.has(battingOrder)) {
      throw new PitcherStrikeoutContractError("Confirmed lineup cannot contain duplicate batting order slots.");
    }
    battingOrders.add(battingOrder);
    if (!["L", "R", "S"].includes(player.bats)) {
      throw new PitcherStrikeoutContractError(
        `opponentLineup.players[${index}].bats must be L, R, or S.`
      );
    }
    requireFinite(
      player.priorStrikeoutsPerPlateAppearance,
      `opponentLineup.players[${index}].priorStrikeoutsPerPlateAppearance`,
      { minimum: 0, maximum: 1 }
    );
    requireFinite(
      player.priorStrikeoutsPerPlateAppearanceVsPitcherHand,
      `opponentLineup.players[${index}].priorStrikeoutsPerPlateAppearanceVsPitcherHand`,
      { minimum: 0, maximum: 1 }
    );
  }
  return lineup;
}

function validatePitcherStrikeoutFeatureRecord(value) {
  const record = requirePlainObject(value, "record");
  if (record.schemaVersion !== "1.0.0") {
    throw new PitcherStrikeoutContractError("schemaVersion must equal 1.0.0.");
  }
  if (record.marketFamily !== MARKET_FAMILY) {
    throw new PitcherStrikeoutContractError(`marketFamily must equal ${MARKET_FAMILY}.`);
  }
  if (record.prospectiveCohortStartAt !== COHORT_START_AT) {
    throw new PitcherStrikeoutContractError(
      `prospectiveCohortStartAt must equal the frozen ${COHORT_START_AT} boundary.`
    );
  }

  const predictionTime = requireTimestamp(record.predictionTime, "predictionTime");
  const event = requirePlainObject(record.event, "event");
  requireText(event.eventId, "event.eventId");
  const eventStartTime = requireTimestamp(event.startTime, "event.startTime");
  if (predictionTime >= eventStartTime) {
    throw new PitcherStrikeoutContractError("Prediction time must be before event start.");
  }
  requireText(event.venueId, "event.venueId");

  const pitcher = requirePlainObject(record.pitcher, "pitcher");
  requireText(pitcher.pitcherId, "pitcher.pitcherId");
  if (!["L", "R"].includes(pitcher.throws)) {
    throw new PitcherStrikeoutContractError("pitcher.throws must be L or R.");
  }
  if (pitcher.confirmedStarter !== true) {
    throw new PitcherStrikeoutContractError("A confirmed starting pitcher is required.");
  }
  requireFinite(pitcher.daysRest, "pitcher.daysRest", { integer: true, minimum: 0, maximum: 30 });
  requireFinite(pitcher.priorStarts, "pitcher.priorStarts", { integer: true, minimum: 0 });

  const rates = requirePlainObject(record.pitcherRates, "pitcherRates");
  for (const key of [
    "seasonStrikeoutsPerBatterFaced",
    "rolling5StrikeoutsPerBatterFaced",
    "rolling10StrikeoutsPerBatterFaced"
  ]) {
    requireFinite(rates[key], `pitcherRates.${key}`, { minimum: 0, maximum: 1 });
  }
  for (const key of ["rolling5BattersFaced", "rolling10BattersFaced"]) {
    requireFinite(rates[key], `pitcherRates.${key}`, { minimum: 1 });
  }

  validateLineup(record.opponentLineup);
  const market = requirePlainObject(record.market, "market");
  const line = requireFinite(market.line, "market.line", { minimum: 0.5 });
  if (Number.isInteger(line) || !Number.isInteger(line * 2)) {
    throw new PitcherStrikeoutContractError("market.line must be a positive half-unit line.");
  }

  const context = requirePlainObject(record.context, "context");
  if (context.weather !== "NOT_IMPLEMENTED" || context.umpire !== "NOT_IMPLEMENTED") {
    throw new PitcherStrikeoutContractError(
      "Weather and umpire must remain NOT_IMPLEMENTED in the v1 preregistered contract."
    );
  }

  const sources = requirePlainObject(record.sources, "sources");
  for (const key of SOURCE_KEYS) {
    validateSourceEnvelope(sources[key], {
      field: `sources.${key}`,
      predictionTime
    });
  }

  return record;
}

module.exports = {
  COHORT_START_AT,
  MARKET_FAMILY,
  PitcherStrikeoutContractError,
  validatePitcherStrikeoutFeatureRecord,
  validateSourceEnvelope
};
