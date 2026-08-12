const {
  COHORT_START_AT,
  validatePitcherStrikeoutFeatureRecord
} = require("../../research/pitcher-strikeout-contract.js");

const FIXTURE_PROVIDER = "sportsdataio_fixture";
const FIXTURE_LICENSE = "synthetic_test_fixture_only";

function requireSyntheticFixture(payload) {
  const metadata = payload?.fixtureMetadata;
  if (metadata?.synthetic !== true || metadata?.networkCalls !== 0) {
    throw new TypeError(
      "SportsDataIO research adapter accepts a clearly labeled synthetic fixture with zero network calls only."
    );
  }
  if (metadata.licenseIdentifier !== FIXTURE_LICENSE) {
    throw new TypeError(`Synthetic fixture license must equal ${FIXTURE_LICENSE}.`);
  }
}

function fixtureSource(source, overrides = {}) {
  return {
    ...source,
    provider: FIXTURE_PROVIDER,
    sourceLocator: source.sourceLocator ?? "fixture://sportsdataio/unspecified",
    licenseIdentifier: FIXTURE_LICENSE,
    verificationStatus: "fixture_only",
    ...overrides
  };
}

function normalizeSportsDataIoPitcherStrikeoutFixture(payload, options = {}) {
  requireSyntheticFixture(payload);

  const predictionTime = options.predictionTime ?? payload?.source?.capturedAt;
  const sportsDataIoSource = fixtureSource(payload.source ?? {});
  const marketSource = fixtureSource(payload.marketSource ?? payload.source ?? {}, {
    provider: "the_odds_api_fixture",
    sourceLocator: payload.marketSource?.sourceLocator ?? "fixture://the-odds-api/synthetic-market"
  });
  const record = {
    schemaVersion: "1.0.0",
    marketFamily: "pitcher_strikeouts",
    prospectiveCohortStartAt: COHORT_START_AT,
    predictionTime,
    event: {
      eventId: String(payload?.game?.gameId ?? ""),
      startTime: payload?.game?.startTime,
      venueId: String(payload?.game?.venueId ?? "")
    },
    pitcher: payload?.pitcher,
    pitcherRates: payload?.pitcherRates,
    opponentLineup: payload?.lineup,
    market: payload?.market,
    context: {
      weather: "NOT_IMPLEMENTED",
      umpire: "NOT_IMPLEMENTED"
    },
    sources: {
      schedule: sportsDataIoSource,
      pitcher: sportsDataIoSource,
      lineup: sportsDataIoSource,
      market: marketSource
    }
  };

  return validatePitcherStrikeoutFeatureRecord(record);
}

async function fetchSportsDataIoPitcherStrikeoutContext() {
  throw new Error(
    "LIVE_PROVIDER_NOT_AUTHORIZED: SportsDataIO live calls are disabled until licensed access and a separate call-specific approval exist."
  );
}

module.exports = {
  FIXTURE_LICENSE,
  FIXTURE_PROVIDER,
  fetchSportsDataIoPitcherStrikeoutContext,
  normalizeSportsDataIoPitcherStrikeoutFixture
};
