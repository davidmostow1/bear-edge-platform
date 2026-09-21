const fs = require("node:fs");
const path = require("node:path");

const { appendAuthoritativeRecord } = require("../audit/authoritative-ledger.js");
const { canonicalStringify, contentDigest } = require("../audit/canonical-json.js");
const { createEvaluationRecord } = require("../audit/record-contract.js");
const { resolveModelStatus } = require("../calibration/model-registry.js");

const CALCULATION_VERSION = "esports-1.0.0";
const DEFAULT_SOURCE_REGISTRY_PATH = path.join(__dirname, "source-registry.json");
const MODEL_ID = "esports_bear_stack_v1";
const MODEL_VERSION = "1.0.0";
const OPERATIONAL_BET_AUTHORITY_IMPLEMENTED = false;
const SUPPORTED_GAMES = Object.freeze(["CS2", "DOTA2", "LOL", "VALORANT"]);
const MODEL_STATUSES = new Set(["research_only", "shadow", "validated", "retired"]);
const DIGEST_PATTERN = /^[a-f0-9]{64}$/;

const GAME_ALIASES = Object.freeze({
  CS2: "CS2",
  "COUNTER-STRIKE 2": "CS2",
  COUNTERSTRIKE2: "CS2",
  DOTA: "DOTA2",
  DOTA2: "DOTA2",
  "DOTA 2": "DOTA2",
  LOL: "LOL",
  "LEAGUE OF LEGENDS": "LOL",
  LEAGUEOFLEGENDS: "LOL",
  VALORANT: "VALORANT"
});

const BASE_REQUIRED_CLAIMS = Object.freeze([
  "event.identity",
  "event.start_time",
  "event.format",
  "roster.team_a",
  "roster.team_b"
]);

const GAME_REQUIRED_CLAIMS = Object.freeze({
  CS2: Object.freeze(["context.map_pool"]),
  DOTA2: Object.freeze(["context.patch"]),
  LOL: Object.freeze([
    "context.patch",
    "roster.starting_lineup.team_a",
    "roster.starting_lineup.team_b"
  ]),
  VALORANT: Object.freeze(["context.patch", "context.map_pool"])
});

const SCOPE_REQUIRED_CLAIMS = Object.freeze({
  CS2: Object.freeze({
    map: Object.freeze(["series.map_veto", "series.map_order"]),
    live_map: Object.freeze(["series.map_veto", "series.map_order"])
  }),
  DOTA2: Object.freeze({
    map: Object.freeze(["side.team_a", "side.team_b"]),
    live_map: Object.freeze([
      "side.team_a",
      "side.team_b",
      "draft.team_a",
      "draft.team_b"
    ])
  }),
  LOL: Object.freeze({
    map: Object.freeze(["side.team_a", "side.team_b"]),
    live_map: Object.freeze([
      "side.team_a",
      "side.team_b",
      "draft.team_a",
      "draft.team_b"
    ])
  }),
  VALORANT: Object.freeze({
    map: Object.freeze(["series.map_veto", "series.map_order"]),
    live_map: Object.freeze([
      "series.map_veto",
      "series.map_order",
      "agents.team_a",
      "agents.team_b"
    ])
  })
});

const REQUIRED_POLICY_FIELDS = Object.freeze([
  "policyVersion",
  "registeredAt",
  "policyDigest",
  "bankroll",
  "minIndependentSources",
  "minConsensusBooks",
  "maxEvidenceAgeMinutes",
  "maxModelAgeMinutes",
  "maxPriceAgeMinutes",
  "eventCutoffMinutes",
  "maxConsensusRange",
  "marketWeight",
  "minPriceEdge",
  "minEvRoi",
  "minKellyFraction",
  "kellyMultiplier",
  "maxBankrollFraction",
  "maxStake",
  "minStake"
]);

function isPlainObject(value) {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function finiteNumber(value) {
  return typeof value === "number" && Number.isFinite(value);
}

function nonEmptyString(value) {
  return typeof value === "string" && value.trim().length > 0;
}

function normalizeGame(game) {
  const key = typeof game === "string"
    ? game.trim().toUpperCase().replace(/[_-]+/g, " ")
    : "";
  const collapsed = key.replace(/\s+/g, "");
  const normalized = GAME_ALIASES[key] ?? GAME_ALIASES[collapsed] ?? null;

  if (!normalized) {
    throw new RangeError(`game must be one of: ${SUPPORTED_GAMES.join(", ")}.`);
  }

  return normalized;
}

function getRequiredClaimKeys(game, scope = "series") {
  const normalizedGame = normalizeGame(game);
  const normalizedScope = typeof scope === "string" ? scope.trim().toLowerCase() : "series";

  if (!["series", "map", "live_map"].includes(normalizedScope)) {
    throw new RangeError("scope must be series, map, or live_map.");
  }

  return [
    ...BASE_REQUIRED_CLAIMS,
    ...GAME_REQUIRED_CLAIMS[normalizedGame],
    ...(SCOPE_REQUIRED_CLAIMS[normalizedGame][normalizedScope] ?? [])
  ];
}

function americanToDecimal(americanOdds) {
  if (!finiteNumber(americanOdds) || americanOdds === 0) {
    throw new TypeError("American odds must be a finite non-zero number.");
  }

  return americanOdds > 0
    ? 1 + americanOdds / 100
    : 1 + 100 / Math.abs(americanOdds);
}

function americanToImpliedProbability(americanOdds) {
  const decimalOdds = americanToDecimal(americanOdds);
  return 1 / decimalOdds;
}

function normalizeTwoWayOffer(selectionAmericanOdds, oppositeAmericanOdds) {
  const impliedSelectionProbability = americanToImpliedProbability(selectionAmericanOdds);
  const impliedOppositeProbability = americanToImpliedProbability(oppositeAmericanOdds);
  const total = impliedSelectionProbability + impliedOppositeProbability;

  return {
    selectionAmericanOdds,
    oppositeAmericanOdds,
    impliedSelectionProbability,
    impliedOppositeProbability,
    noVigSelectionProbability: impliedSelectionProbability / total,
    noVigOppositeProbability: impliedOppositeProbability / total,
    hold: total - 1
  };
}

function parseTimestamp(value) {
  const milliseconds = Date.parse(value ?? "");
  return Number.isFinite(milliseconds) ? milliseconds : null;
}

function normalizeBookmaker(value) {
  return nonEmptyString(value) ? value.trim().toLowerCase() : null;
}

function quoteSnapshotPayload(offer) {
  return {
    bookmaker: offer?.bookmaker ?? null,
    independenceFamily: offer?.independenceFamily ?? null,
    jurisdiction: offer?.jurisdiction ?? null,
    marketId: offer?.marketId ?? null,
    eventId: offer?.eventId ?? null,
    marketFamily: offer?.marketFamily ?? null,
    marketType: offer?.marketType ?? null,
    scope: offer?.scope ?? null,
    selection: offer?.selection ?? null,
    oppositeSelection: offer?.oppositeSelection ?? null,
    side: offer?.side ?? null,
    line: finiteNumber(offer?.line) ? offer.line : null,
    settlementRuleDigest: offer?.settlementRuleDigest ?? null,
    selectionAmericanOdds: offer?.selectionAmericanOdds ?? null,
    oppositeAmericanOdds: offer?.oppositeAmericanOdds ?? null,
    capturedAt: offer?.capturedAt ?? null,
    sourceUrl: offer?.sourceUrl ?? null,
    parserVersion: offer?.parserVersion ?? null,
    verificationStatus: offer?.verificationStatus ?? null,
    priceType: offer?.priceType ?? null,
    priceStatus: offer?.priceStatus ?? null,
    executable: offer?.executable ?? null,
    maxExecutableStake: offer?.maxExecutableStake ?? null,
    executionCostRate: offer?.executionCostRate ?? null
  };
}

function median(values) {
  if (!Array.isArray(values) || values.length === 0) {
    return null;
  }

  const sorted = [...values].sort((left, right) => left - right);
  const midpoint = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 1
    ? sorted[midpoint]
    : (sorted[midpoint - 1] + sorted[midpoint]) / 2;
}

function inspectQuote(offer, {
  nowMs,
  maxPriceAgeMinutes,
  requireExecution = false,
  marketFingerprint = null
}) {
  const issues = [];
  const capturedAtMs = parseTimestamp(offer?.capturedAt);
  const bookmaker = normalizeBookmaker(offer?.bookmaker);

  if (!isPlainObject(offer)) {
    issues.push("MISSING_QUOTE");
  }
  if (!bookmaker) {
    issues.push("MISSING_BOOKMAKER");
  }
  if (!nonEmptyString(offer?.sourceUrl)) {
    issues.push("MISSING_PRICE_SOURCE");
  }
  if (!nonEmptyString(offer?.marketId)) {
    issues.push("MISSING_MARKET_ID");
  }
  if (!nonEmptyString(offer?.jurisdiction)) {
    issues.push("MISSING_JURISDICTION");
  }
  if (!nonEmptyString(offer?.independenceFamily)) {
    issues.push("MISSING_MARKET_INDEPENDENCE_FAMILY");
  }
  if (!DIGEST_PATTERN.test(offer?.rawSnapshotDigest ?? "")) {
    issues.push("MISSING_RAW_PRICE_DIGEST");
  } else if (!isPlainObject(offer?.rawSnapshot)) {
    issues.push("MISSING_RAW_PRICE_SNAPSHOT");
  } else if (contentDigest(offer.rawSnapshot) !== offer.rawSnapshotDigest) {
    issues.push("RAW_PRICE_DIGEST_MISMATCH");
  } else if (canonicalStringify(offer.rawSnapshot) !== canonicalStringify(quoteSnapshotPayload(offer))) {
    issues.push("RAW_PRICE_SNAPSHOT_FIELD_MISMATCH");
  }
  if (!DIGEST_PATTERN.test(offer?.settlementRuleDigest ?? "")) {
    issues.push("MISSING_SETTLEMENT_RULE_DIGEST");
  }
  if (offer?.verificationStatus !== "verified") {
    issues.push("UNVERIFIED_MARKET_PRICE");
  }
  if (offer?.priceType !== "american_two_way") {
    issues.push("UNSUPPORTED_PRICE_TYPE");
  }
  if (requireExecution && offer?.priceStatus !== "open") {
    issues.push("MARKET_NOT_OPEN");
  }
  if (requireExecution && offer?.executable !== true) {
    issues.push("PRICE_NOT_EXECUTABLE");
  }
  if (requireExecution && (!finiteNumber(offer?.maxExecutableStake) || offer.maxExecutableStake <= 0)) {
    issues.push("MISSING_EXECUTABLE_SIZE");
  }
  if (requireExecution && (!finiteNumber(offer?.executionCostRate) || offer.executionCostRate < 0)) {
    issues.push("MISSING_EXECUTION_COST");
  }
  if (!finiteNumber(offer?.selectionAmericanOdds) || offer.selectionAmericanOdds === 0) {
    issues.push("INVALID_SELECTION_PRICE");
  }
  if (!finiteNumber(offer?.oppositeAmericanOdds) || offer.oppositeAmericanOdds === 0) {
    issues.push("INVALID_OPPOSITE_PRICE");
  }
  if (capturedAtMs === null) {
    issues.push("MISSING_MARKET_TIMESTAMP");
  } else if (capturedAtMs > nowMs) {
    issues.push("FUTURE_MARKET_PRICE");
  } else if ((nowMs - capturedAtMs) / 60000 > maxPriceAgeMinutes) {
    issues.push("STALE_MARKET_PRICE");
  }
  if (isPlainObject(marketFingerprint)) {
    for (const field of [
      "eventId",
      "marketFamily",
      "marketType",
      "scope",
      "selection",
      "oppositeSelection",
      "side",
      "line",
      "settlementRuleDigest"
    ]) {
      if (canonicalStringify(offer?.[field] ?? null) !== canonicalStringify(marketFingerprint[field] ?? null)) {
        issues.push(`MARKET_FINGERPRINT_MISMATCH:${field}`);
      }
    }
  }

  if (issues.length > 0) {
    return { valid: false, bookmaker, issues, normalized: null };
  }

  let normalized;
  try {
    normalized = normalizeTwoWayOffer(
      offer.selectionAmericanOdds,
      offer.oppositeAmericanOdds
    );
  } catch {
    return {
      valid: false,
      bookmaker,
      issues: ["INVALID_MARKET_PRICE"],
      normalized: null
    };
  }

  return {
    valid: true,
    bookmaker,
    issues: [],
    normalized: {
      ...normalized,
      bookmaker,
      independenceFamily: offer.independenceFamily,
      marketId: offer.marketId,
      eventId: offer.eventId,
      marketFamily: offer.marketFamily,
      marketType: offer.marketType,
      scope: offer.scope,
      selection: offer.selection,
      oppositeSelection: offer.oppositeSelection,
      side: offer.side,
      line: offer.line,
      settlementRuleDigest: offer.settlementRuleDigest,
      jurisdiction: offer.jurisdiction,
      capturedAt: new Date(capturedAtMs).toISOString(),
      sourceUrl: offer.sourceUrl,
      rawSnapshotDigest: offer.rawSnapshotDigest,
      maxExecutableStake: requireExecution ? offer.maxExecutableStake : null,
      executionCostRate: requireExecution ? offer.executionCostRate : null,
      noVigProbability: normalized.noVigSelectionProbability
    }
  };
}

function deriveConsensusProbability(offers, options = {}) {
  const nowMs = parseTimestamp(options.now ?? new Date().toISOString());
  const maxPriceAgeMinutes = options.maxPriceAgeMinutes;

  if (nowMs === null) {
    throw new TypeError("now must be a valid timestamp.");
  }
  if (!finiteNumber(maxPriceAgeMinutes) || maxPriceAgeMinutes < 0) {
    throw new TypeError("maxPriceAgeMinutes must be a non-negative finite number.");
  }

  const targetBookmaker = normalizeBookmaker(options.targetBookmaker);
  const targetIndependenceFamily = nonEmptyString(options.targetIndependenceFamily)
    ? options.targetIndependenceFamily.trim()
    : null;
  const books = [];
  const excluded = [];
  const seen = new Set();
  const exclusion = (offer, bookmaker, reasonCodes) => ({
    bookmaker,
    marketId: offer?.marketId ?? null,
    rawSnapshotDigest: DIGEST_PATTERN.test(offer?.rawSnapshotDigest ?? "")
      ? offer.rawSnapshotDigest
      : null,
    reasonCodes
  });

  for (const offer of Array.isArray(offers) ? offers : []) {
    const inspection = inspectQuote(offer, {
      nowMs,
      maxPriceAgeMinutes,
      marketFingerprint: options.marketFingerprint ?? null
    });

    if (inspection.bookmaker && inspection.bookmaker === targetBookmaker) {
      excluded.push(exclusion(offer, inspection.bookmaker, ["TARGET_BOOK_EXCLUDED"]));
      continue;
    }
    if (!inspection.valid) {
      excluded.push(exclusion(offer, inspection.bookmaker, inspection.issues));
      continue;
    }
    if (
      targetIndependenceFamily
      && inspection.normalized.independenceFamily === targetIndependenceFamily
    ) {
      excluded.push(exclusion(
        offer,
        inspection.bookmaker,
        ["TARGET_MARKET_INDEPENDENCE_FAMILY_EXCLUDED"]
      ));
      continue;
    }
    const independenceFamily = inspection.normalized.independenceFamily;
    if (seen.has(independenceFamily)) {
      excluded.push(exclusion(
        offer,
        inspection.bookmaker,
        ["DUPLICATE_MARKET_INDEPENDENCE_FAMILY"]
      ));
      continue;
    }

    seen.add(independenceFamily);
    books.push(inspection.normalized);
  }

  const probabilities = books.map((book) => book.noVigProbability);
  const lowerProbability = probabilities.length > 0 ? Math.min(...probabilities) : null;
  const upperProbability = probabilities.length > 0 ? Math.max(...probabilities) : null;

  return {
    method: "median_cross_book_two_way_no_vig",
    pointProbability: median(probabilities),
    lowerProbability,
    upperProbability,
    observedRange: lowerProbability === null ? null : upperProbability - lowerProbability,
    books,
    excluded
  };
}

function deriveActionableProbability({
  modelPointProbability,
  modelLowerProbability,
  modelUpperProbability,
  marketPointProbability,
  marketLowerProbability,
  marketUpperProbability,
  marketWeight
}) {
  const probabilities = [
    modelPointProbability,
    modelLowerProbability,
    modelUpperProbability,
    marketPointProbability,
    marketLowerProbability,
    marketUpperProbability,
    marketWeight
  ];
  if (probabilities.some((value) => !finiteNumber(value) || value < 0 || value > 1)) {
    throw new TypeError("Every model, market, and weight input must be a probability from zero through one.");
  }
  if (modelLowerProbability > modelPointProbability || modelPointProbability > modelUpperProbability) {
    throw new RangeError("Model probability bounds must contain the model point probability.");
  }
  if (marketLowerProbability > marketPointProbability || marketPointProbability > marketUpperProbability) {
    throw new RangeError("Market probability bounds must contain the market point probability.");
  }

  const modelWeight = 1 - marketWeight;
  return {
    method: "registered_linear_model_market_shrinkage",
    marketWeight,
    modelWeight,
    pointProbability: modelPointProbability * modelWeight + marketPointProbability * marketWeight,
    lowerProbability: modelLowerProbability * modelWeight + marketLowerProbability * marketWeight,
    upperProbability: modelUpperProbability * modelWeight + marketUpperProbability * marketWeight,
    intervalType: "model_interval_blended_with_observed_cross_book_range"
  };
}

function loadEsportsSourceRegistry(registryPath = DEFAULT_SOURCE_REGISTRY_PATH) {
  const source = fs.readFileSync(path.resolve(registryPath), "utf8");
  const registry = JSON.parse(source);

  if (!isPlainObject(registry) || !Array.isArray(registry.providers)) {
    throw new TypeError("Esports source registry must contain a providers array.");
  }

  const providerMap = {};
  for (const provider of registry.providers) {
    if (!nonEmptyString(provider?.id) || providerMap[provider.id]) {
      throw new TypeError("Every esports source provider must have a unique non-empty id.");
    }
    if (![1, 2, 3].includes(provider.tier)) {
      throw new TypeError(`Provider ${provider.id} must have tier 1, 2, or 3.`);
    }
    if (!nonEmptyString(provider.independenceFamily)) {
      throw new TypeError(`Provider ${provider.id} must declare independenceFamily.`);
    }
    providerMap[provider.id] = Object.freeze({ ...provider });
  }

  return Object.freeze(providerMap);
}

function normalizeSourceRegistry(registry) {
  if (!registry) {
    return loadEsportsSourceRegistry();
  }
  if (Array.isArray(registry.providers)) {
    return Object.fromEntries(registry.providers.map((provider) => [provider.id, provider]));
  }
  return registry;
}

function addRiskFlag(riskFlags, code, severity, message) {
  if (!riskFlags.some((flag) => flag.code === code)) {
    riskFlags.push({ code, severity, message });
  }
}

function addGate(gateResults, code, status, message) {
  gateResults.push({ code, status, message });
}

function validatePolicy(policy, gateResults, riskFlags) {
  const issues = [];

  if (!isPlainObject(policy)) {
    issues.push("policy must be an object");
  } else {
    for (const field of REQUIRED_POLICY_FIELDS) {
      if (!Object.prototype.hasOwnProperty.call(policy, field)) {
        issues.push(`${field} is required`);
      }
    }
  }

  if (issues.length === 0) {
    const nonNegativeFields = [
      "maxEvidenceAgeMinutes",
      "maxModelAgeMinutes",
      "maxPriceAgeMinutes",
      "eventCutoffMinutes",
      "maxConsensusRange",
      "marketWeight",
      "minPriceEdge",
      "minEvRoi",
      "minKellyFraction",
      "kellyMultiplier",
      "maxBankrollFraction",
      "minStake"
    ];
    if (!nonEmptyString(policy.policyVersion)) {
      issues.push("policyVersion must be a non-empty string");
    }
    if (parseTimestamp(policy.registeredAt) === null) {
      issues.push("registeredAt must be a valid ISO-8601 timestamp");
    }
    if (!DIGEST_PATTERN.test(policy.policyDigest ?? "")) {
      issues.push("policyDigest must be a 64-character lowercase SHA-256 digest");
    } else {
      const { policyDigest, ...digestInput } = policy;
      if (contentDigest(digestInput) !== policyDigest) {
        issues.push("policyDigest does not match the canonical policy content");
      }
    }
    if (!finiteNumber(policy.bankroll) || policy.bankroll <= 0) {
      issues.push("bankroll must be positive");
    }
    if (!Number.isInteger(policy.minIndependentSources) || policy.minIndependentSources < 2) {
      issues.push("minIndependentSources must be an integer of at least 2");
    }
    if (!Number.isInteger(policy.minConsensusBooks) || policy.minConsensusBooks < 2) {
      issues.push("minConsensusBooks must be an integer of at least 2");
    }
    for (const field of nonNegativeFields) {
      if (!finiteNumber(policy[field]) || policy[field] < 0) {
        issues.push(`${field} must be a non-negative finite number`);
      }
    }
    if (!finiteNumber(policy.maxStake) || policy.maxStake <= 0) {
      issues.push("maxStake must be a positive finite number");
    }
    for (const field of [
      "maxConsensusRange",
      "marketWeight",
      "minPriceEdge",
      "minKellyFraction",
      "kellyMultiplier",
      "maxBankrollFraction"
    ]) {
      if (finiteNumber(policy[field]) && policy[field] > 1) {
        issues.push(`${field} must not exceed 1`);
      }
    }
    if (finiteNumber(policy.marketWeight) && policy.marketWeight >= 1) {
      issues.push("marketWeight must be less than 1 so the independent projection retains positive weight");
    }
    if (finiteNumber(policy.maxBankrollFraction) && policy.maxBankrollFraction >= 1) {
      issues.push("maxBankrollFraction must be less than 1");
    }
    if (
      finiteNumber(policy.bankroll)
      && finiteNumber(policy.maxStake)
      && policy.maxStake > policy.bankroll
    ) {
      issues.push("maxStake must not exceed bankroll");
    }
  }

  if (issues.length > 0) {
    addGate(gateResults, "POLICY_COMPLETE", "fail", issues.join("; "));
    addRiskFlag(
      riskFlags,
      "POLICY_INCOMPLETE",
      "high",
      "The versioned decision policy is missing or invalid."
    );
    return null;
  }

  addGate(gateResults, "POLICY_COMPLETE", "pass", "The versioned policy is complete.");
  return { ...policy };
}

function expectedClaimValue(input, claimKey) {
  if (claimKey === "event.identity") {
    return {
      eventId: input.event?.eventId ?? null,
      teamA: input.event?.teamA ?? null,
      teamB: input.event?.teamB ?? null
    };
  }
  if (claimKey === "event.start_time") {
    return input.event?.startTime ?? null;
  }
  if (claimKey === "event.format") {
    return input.event?.format ?? null;
  }
  return undefined;
}

function inspectEvidenceItem(item, provider, nowMs, maxAgeMinutes) {
  const capturedAtMs = parseTimestamp(item?.capturedAt);
  const sourceTimeMs = parseTimestamp(item?.sourceTime);
  const retainedPayload = {
    provider: item?.provider ?? null,
    claimKey: item?.claimKey ?? null,
    sourceUrl: item?.sourceUrl ?? null,
    parserVersion: item?.parserVersion ?? null,
    capturedAt: item?.capturedAt ?? null,
    sourceTime: item?.sourceTime ?? null,
    verificationStatus: item?.verificationStatus ?? null,
    value: item?.value ?? null
  };
  const valid = (
    isPlainObject(item)
    && provider?.status === "approved"
    && [1, 2].includes(provider?.tier)
    && item.verificationStatus === "verified"
    && nonEmptyString(item.sourceUrl)
    && DIGEST_PATTERN.test(item.digest ?? "")
    && isPlainObject(item.rawPayload)
    && contentDigest(item.rawPayload) === item.digest
    && canonicalStringify(item.rawPayload) === canonicalStringify(retainedPayload)
    && Object.prototype.hasOwnProperty.call(item, "value")
    && item.value !== undefined
    && capturedAtMs !== null
    && sourceTimeMs !== null
    && capturedAtMs <= nowMs
    && sourceTimeMs <= capturedAtMs
    && (nowMs - sourceTimeMs) / 60000 <= maxAgeMinutes
  );

  return {
    valid,
    capturedAtMs,
    sourceTimeMs,
    freshness: valid ? "fresh" : (
      sourceTimeMs !== null && sourceTimeMs > nowMs ? "future" : "stale"
    )
  };
}

function uniqueNonEmptyStrings(value, options = {}) {
  if (!Array.isArray(value)) {
    return false;
  }
  if (options.exactLength !== undefined && value.length !== options.exactLength) {
    return false;
  }
  if (options.minimumLength !== undefined && value.length < options.minimumLength) {
    return false;
  }
  const normalized = value.map((entry) => nonEmptyString(entry) ? entry.trim() : null);
  return normalized.every(Boolean) && new Set(normalized).size === normalized.length;
}

function validClaimValue(game, claimKey, value) {
  if (claimKey === "event.identity") {
    return isPlainObject(value)
      && nonEmptyString(value.eventId)
      && nonEmptyString(value.teamA)
      && nonEmptyString(value.teamB)
      && value.teamA !== value.teamB;
  }
  if (claimKey === "event.start_time") {
    return parseTimestamp(value) !== null;
  }
  if (claimKey === "event.format" || claimKey === "context.patch") {
    return nonEmptyString(value);
  }
  if (claimKey.startsWith("roster.starting_lineup.")) {
    return uniqueNonEmptyStrings(value, { exactLength: 5 });
  }
  if (claimKey.startsWith("roster.")) {
    return uniqueNonEmptyStrings(value, { minimumLength: 5 });
  }
  if (claimKey === "context.map_pool") {
    return uniqueNonEmptyStrings(value, { minimumLength: 1 });
  }
  if (claimKey === "series.map_veto" || claimKey === "series.map_order") {
    return uniqueNonEmptyStrings(value, { minimumLength: 1 });
  }
  if (claimKey.startsWith("side.")) {
    return nonEmptyString(value);
  }
  if (claimKey.startsWith("draft.") || claimKey.startsWith("agents.")) {
    return uniqueNonEmptyStrings(value, { minimumLength: 1 });
  }
  return false;
}

function providerSupportsClaim(provider, game, claimKey) {
  if (!Array.isArray(provider?.games) || !provider.games.includes(game)) {
    return false;
  }
  const roles = Array.isArray(provider.roles) ? provider.roles : [];
  const acceptedRoles = claimKey === "event.identity"
    ? ["event_identity"]
    : claimKey === "event.start_time"
      ? ["schedule"]
      : claimKey === "event.format"
        ? ["format"]
        : claimKey.startsWith("roster.")
          ? ["rosters", "manual_rosters", "live_state"]
          : claimKey === "context.patch"
            ? ["live_state", "match_data", "historical_match_data"]
            : ["live_state", "local_live_state", "match_data"];
  return acceptedRoles.some((role) => roles.includes(role));
}

function evaluateEvidence(input, requiredClaims, policy, sourceRegistry, gateResults, riskFlags, nowMs) {
  const evidence = Array.isArray(input.evidence) ? input.evidence : [];
  const evidenceGame = normalizeGame(input.game);
  let complete = true;

  for (const claimKey of requiredClaims) {
    const claimItems = evidence.filter((item) => item?.claimKey === claimKey);
    const inspected = claimItems.map((item) => {
      const provider = sourceRegistry[item.provider] ?? null;
      const allowedGame = Array.isArray(provider?.games) && provider.games.includes(evidenceGame);
      const allowedRole = providerSupportsClaim(provider, evidenceGame, item.claimKey);
      const semanticValue = validClaimValue(evidenceGame, item.claimKey, item.value);
      return {
        item,
        provider,
        inspection: {
          ...inspectEvidenceItem(item, provider, nowMs, policy.maxEvidenceAgeMinutes),
          allowedGame,
          allowedRole,
          semanticValue
        }
      };
    });
    const eligible = inspected.filter((entry) => (
      entry.inspection.valid
      && entry.inspection.allowedGame
      && entry.inspection.allowedRole
      && entry.inspection.semanticValue
    ));
    if (inspected.some((entry) => entry.inspection.valid && !entry.inspection.semanticValue)) {
      complete = false;
      addGate(
        gateResults,
        `CLAIM_VALUE:${claimKey}`,
        "fail",
        `${claimKey} contains a null, empty, malformed, or semantically incomplete value.`
      );
      addRiskFlag(riskFlags, "INVALID_CLAIM_VALUE", "high", "At least one retained claim value is semantically invalid.");
      continue;
    }

    const groupedByFamily = new Map();
    for (const entry of eligible) {
      const family = entry.provider.independenceFamily;
      if (!groupedByFamily.has(family)) {
        groupedByFamily.set(family, []);
      }
      groupedByFamily.get(family).push(entry);
    }
    const familyConflict = [...groupedByFamily.values()].some((entries) => (
      new Set(entries.map((entry) => canonicalStringify(entry.item.value))).size > 1
    ));
    if (familyConflict) {
      complete = false;
      addGate(
        gateResults,
        `SOURCE_AGREEMENT:${claimKey}`,
        "fail",
        `${claimKey} conflicts within one declared source family.`
      );
      addRiskFlag(riskFlags, "SOURCE_CONFLICT", "high", "A source family contains contradictory retained claim values.");
      continue;
    }

    const independent = new Map();

    for (const [family, entries] of groupedByFamily) {
      entries.sort((left, right) => right.inspection.sourceTimeMs - left.inspection.sourceTimeMs);
      independent.set(family, entries[0]);
    }

    if (independent.size < policy.minIndependentSources) {
      complete = false;
      addGate(
        gateResults,
        `SOURCE_COUNT:${claimKey}`,
        "fail",
        `${claimKey} has ${independent.size} eligible independent source families; ${policy.minIndependentSources} are required.`
      );
      addRiskFlag(
        riskFlags,
        "INSUFFICIENT_INDEPENDENT_SOURCES",
        "high",
        "At least one material claim lacks the required independent source confirmation."
      );
      continue;
    }

    if (![...independent.values()].some((entry) => entry.provider.tier === 1)) {
      complete = false;
      addGate(
        gateResults,
        `TIER_ONE_SOURCE:${claimKey}`,
        "fail",
        `${claimKey} has no approved tier-1 source.`
      );
      addRiskFlag(
        riskFlags,
        "MISSING_TIER_ONE_SOURCE",
        "high",
        "At least one material claim lacks an approved tier-1 source."
      );
      continue;
    }

    const values = new Map();
    for (const entry of independent.values()) {
      const key = canonicalStringify(entry.item.value);
      values.set(key, entry.item.value);
    }

    if (values.size !== 1) {
      complete = false;
      addGate(
        gateResults,
        `SOURCE_AGREEMENT:${claimKey}`,
        "fail",
        `${claimKey} has conflicting values across eligible independent sources.`
      );
      addRiskFlag(
        riskFlags,
        "SOURCE_CONFLICT",
        "high",
        "Verified sources disagree on at least one material claim."
      );
      continue;
    }

    const expected = expectedClaimValue(input, claimKey);
    const actual = [...values.values()][0];
    if (expected !== undefined && canonicalStringify(expected) !== canonicalStringify(actual)) {
      complete = false;
      addGate(
        gateResults,
        `INPUT_SOURCE_MATCH:${claimKey}`,
        "fail",
        `${claimKey} does not match the evaluated candidate input.`
      );
      addRiskFlag(
        riskFlags,
        "INPUT_SOURCE_MISMATCH",
        "high",
        "The evaluated candidate differs from verified source evidence."
      );
      continue;
    }

    addGate(
      gateResults,
      `SOURCE_AGREEMENT:${claimKey}`,
      "pass",
      `${claimKey} agrees across ${independent.size} independent source families.`
    );
  }

  return complete;
}

function buildIndependentPredictionDigest(model) {
  return contentDigest({
    schemaVersion: "bear-edge.independent-projection.v1",
    independentModelId: model?.independentModelId ?? null,
    independentModelVersion: model?.independentModelVersion ?? null,
    independentImplementationDigest: model?.independentImplementationDigest ?? null,
    featureSnapshotDigest: model?.featureSnapshotDigest ?? null,
    eventId: model?.eventId ?? null,
    marketFamily: model?.marketFamily ?? null,
    selection: model?.selection ?? null,
    side: model?.side ?? null,
    generatedAt: model?.generatedAt ?? null,
    pointProbability: model?.pointProbability ?? null,
    lowerProbability: model?.lowerProbability ?? null,
    upperProbability: model?.upperProbability ?? null,
    predictionArtifactLocator: model?.predictionArtifactLocator ?? null,
    verificationStatus: model?.verificationStatus ?? null
  });
}

function inspectIndependentProjection(model, candidate, nowMs, maxModelAgeMinutes, priceCapturedAtMs) {
  const issues = [];
  const generatedAtMs = parseTimestamp(model?.generatedAt);
  const pointProbability = model?.pointProbability;
  const lowerProbability = model?.lowerProbability;
  const upperProbability = model?.upperProbability;

  for (const [field, value] of [
    ["pointProbability", pointProbability],
    ["lowerProbability", lowerProbability],
    ["upperProbability", upperProbability]
  ]) {
    if (!finiteNumber(value) || value < 0 || value > 1) {
      issues.push(`INVALID_MODEL_${field.replace(/([A-Z])/g, "_$1").toUpperCase()}`);
    }
  }
  if (
    finiteNumber(lowerProbability)
    && finiteNumber(pointProbability)
    && finiteNumber(upperProbability)
    && (lowerProbability > pointProbability || pointProbability > upperProbability)
  ) {
    issues.push("INVALID_MODEL_INTERVAL");
  }
  for (const field of ["independentModelId", "independentModelVersion"]) {
    if (!nonEmptyString(model?.[field])) {
      issues.push(`MISSING_${field.replace(/([A-Z])/g, "_$1").toUpperCase()}`);
    }
  }
  for (const field of ["independentImplementationDigest", "featureSnapshotDigest"]) {
    if (!DIGEST_PATTERN.test(model?.[field] ?? "")) {
      issues.push(`MISSING_${field.replace(/([A-Z])/g, "_$1").toUpperCase()}`);
    }
  }
  if (!DIGEST_PATTERN.test(model?.predictionDigest ?? "")) {
    issues.push("MISSING_MODEL_PREDICTION_DIGEST");
  } else if (buildIndependentPredictionDigest(model) !== model.predictionDigest) {
    issues.push("MODEL_PREDICTION_DIGEST_MISMATCH");
  }
  if (!nonEmptyString(model?.predictionArtifactLocator)) {
    issues.push("MISSING_MODEL_PREDICTION_ARTIFACT");
  }
  if (model?.verificationStatus !== "verified") {
    issues.push("UNVERIFIED_MODEL_PREDICTION");
  }
  const bindings = {
    eventId: candidate.event?.eventId ?? null,
    marketFamily: candidate.market?.marketFamily ?? null,
    selection: candidate.market?.selection ?? null,
    side: candidate.market?.side ?? null
  };
  for (const [field, expected] of Object.entries(bindings)) {
    if (model?.[field] !== expected) {
      issues.push(`MODEL_${field.replace(/([A-Z])/g, "_$1").toUpperCase()}_MISMATCH`);
    }
  }
  if (generatedAtMs === null) {
    issues.push("MISSING_MODEL_TIMESTAMP");
  } else if (generatedAtMs > nowMs) {
    issues.push("FUTURE_MODEL_PREDICTION");
  } else if ((nowMs - generatedAtMs) / 60000 > maxModelAgeMinutes) {
    issues.push("STALE_MODEL_PREDICTION");
  }
  if (
    generatedAtMs !== null
    && priceCapturedAtMs !== null
    && generatedAtMs > priceCapturedAtMs
  ) {
    issues.push("MODEL_GENERATED_AFTER_PRICE_CAPTURE");
  }

  return {
    valid: issues.length === 0,
    issues,
    generatedAtMs,
    pointProbability: finiteNumber(pointProbability) ? pointProbability : null,
    lowerProbability: finiteNumber(lowerProbability) ? lowerProbability : null,
    upperProbability: finiteNumber(upperProbability) ? upperProbability : null
  };
}

function calculateExpectedValue(probability, americanOdds, executionCostRate = 0) {
  if (!finiteNumber(probability) || probability < 0 || probability > 1) {
    return null;
  }
  if (!finiteNumber(executionCostRate) || executionCostRate < 0) {
    return null;
  }
  const decimalOdds = americanToDecimal(americanOdds);
  return probability * decimalOdds - 1 - executionCostRate;
}

function calculateKelly(probability, americanOdds, executionCostRate = 0) {
  if (!finiteNumber(probability) || probability < 0 || probability > 1) {
    return null;
  }
  if (!finiteNumber(executionCostRate) || executionCostRate < 0) {
    return null;
  }
  const netWinMultiple = americanToDecimal(americanOdds) - 1 - executionCostRate;
  const lossMultiple = 1 + executionCostRate;
  if (netWinMultiple <= 0) {
    return 0;
  }
  return Math.max(
    0,
    (netWinMultiple * probability - lossMultiple * (1 - probability))
      / (netWinMultiple * lossMultiple)
  );
}

function calculateStake(kellyFraction, policy) {
  if (!finiteNumber(kellyFraction) || !policy) {
    return null;
  }
  const uncappedStake = policy.bankroll * kellyFraction * policy.kellyMultiplier;
  return Math.min(
    uncappedStake,
    policy.maxStake,
    policy.bankroll * policy.maxBankrollFraction
  );
}

function mathClears(metrics, policy, prefix = "") {
  const key = (suffix, unprefixed) => (prefix ? `${prefix}${suffix}` : unprefixed);
  return (
    metrics[key("PriceEdge", "priceEdge")] > policy.minPriceEdge
    && metrics[key("ExpectedValueRoi", "expectedValueRoi")] > policy.minEvRoi
    && metrics[key("KellyFraction", "kellyFraction")] > policy.minKellyFraction
    && metrics[key("RecommendedStake", "recommendedStake")] > policy.minStake
  );
}

function sourceDigest(source) {
  return DIGEST_PATTERN.test(source?.digest ?? "") ? source.digest : null;
}

function buildAuditSources(input, result, sourceRegistry, nowMs, policy) {
  const contextSources = (Array.isArray(input.evidence) ? input.evidence : []).map((source) => {
    const provider = sourceRegistry[source.provider] ?? null;
    const inspection = inspectEvidenceItem(
      source,
      provider,
      nowMs,
      policy?.maxEvidenceAgeMinutes ?? 0
    );
    return {
      provider: source.provider ?? null,
      sourceType: `claim:${source.claimKey ?? "unknown"}`,
      sourceLocator: source.sourceUrl ?? null,
      parserVersion: source.parserVersion ?? null,
      capturedAt: source.capturedAt ?? null,
      sourceTime: source.sourceTime ?? null,
      digest: sourceDigest(source),
      freshness: inspection.freshness,
      verificationStatus: inspection.valid ? "verified" : "unverified",
      eventId: input.event?.eventId ?? null,
      marketFamily: input.market?.marketFamily ?? null,
      marketType: input.market?.marketType ?? null,
      scope: input.market?.scope ?? null,
      selection: input.market?.selection ?? null,
      oppositeSelection: input.market?.side === "team_a"
        ? input.event?.teamB ?? null
        : input.market?.side === "team_b"
          ? input.event?.teamA ?? null
          : null,
      side: input.market?.side ?? null,
      line: finiteNumber(input.market?.line) ? input.market.line : null,
      settlementRuleDigest: input.market?.settlementRuleDigest ?? null,
      disposition: inspection.valid ? "included" : "excluded",
      reasonCodes: inspection.valid ? [] : ["EVIDENCE_ITEM_INVALID"]
    };
  });
  const oppositeSelection = input.market?.side === "team_a"
    ? input.event?.teamB ?? null
    : input.market?.side === "team_b"
      ? input.event?.teamA ?? null
      : null;
  const marketFingerprint = {
    eventId: input.event?.eventId ?? null,
    marketFamily: input.market?.marketFamily ?? null,
    marketType: input.market?.marketType ?? null,
    scope: input.market?.scope ?? null,
    selection: input.market?.selection ?? null,
    oppositeSelection,
    side: input.market?.side ?? null,
    line: finiteNumber(input.market?.line) ? input.market.line : null,
    settlementRuleDigest: input.market?.settlementRuleDigest ?? null
  };
  const quoteSources = [
    input.market?.targetOffer,
    ...(Array.isArray(input.market?.consensusOffers) ? input.market.consensusOffers : [])
  ].filter(Boolean).map((offer, index) => {
    const inspection = inspectQuote(offer, {
      nowMs,
      maxPriceAgeMinutes: policy?.maxPriceAgeMinutes ?? 0,
      requireExecution: index === 0,
      marketFingerprint
    });
    const exclusion = index === 0 ? null : result.market.excludedConsensusOffers.find((entry) => (
      entry.rawSnapshotDigest === offer.rawSnapshotDigest
      && entry.marketId === offer.marketId
    ));
    const included = index === 0
      ? inspection.valid
      : inspection.valid && result.market.consensusBooks.some((book) => (
          book.rawSnapshotDigest === offer.rawSnapshotDigest
          && book.marketId === offer.marketId
        ));
    const reasonCodes = exclusion?.reasonCodes
      ?? (inspection.valid ? (included ? [] : ["REFERENCE_QUOTE_NOT_INCLUDED"]) : inspection.issues);
    return {
      provider: offer.bookmaker ?? null,
      sourceType: "sportsbook_price",
      sourceLocator: offer.sourceUrl ?? null,
      parserVersion: offer.parserVersion ?? null,
      capturedAt: offer.capturedAt ?? null,
      sourceTime: offer.capturedAt ?? null,
      digest: DIGEST_PATTERN.test(offer.rawSnapshotDigest ?? "")
        ? offer.rawSnapshotDigest
        : null,
      freshness: inspection.valid
        && included
        ? "fresh"
        : inspection.issues.some((issue) => issue.includes("STALE") || issue.includes("FUTURE"))
          ? "stale"
          : "unverified",
      verificationStatus: inspection.valid && included ? "verified" : "unverified",
      eventId: offer.eventId ?? null,
      marketFamily: offer.marketFamily ?? null,
      marketType: offer.marketType ?? null,
      scope: offer.scope ?? null,
      selection: offer.selection ?? null,
      oppositeSelection: offer.oppositeSelection ?? null,
      side: offer.side ?? null,
      line: finiteNumber(offer.line) ? offer.line : null,
      settlementRuleDigest: offer.settlementRuleDigest ?? null,
      disposition: included ? (index === 0 ? "target" : "included") : "excluded",
      reasonCodes
    };
  });
  const modelSource = input.model ? [{
    provider: input.model.modelId ?? null,
    sourceType: "independent_model_prediction",
    sourceLocator: input.model.predictionArtifactLocator ?? null,
    parserVersion: input.model.modelVersion ?? null,
    capturedAt: input.model.generatedAt ?? null,
    sourceTime: input.model.generatedAt ?? null,
    digest: DIGEST_PATTERN.test(input.model.predictionDigest ?? "")
      ? input.model.predictionDigest
      : null,
    freshness: result.probability.modelPredictionFresh ? "fresh" : "stale",
    verificationStatus: result.probability.modelPredictionFresh ? "verified" : "unverified",
    eventId: input.model.eventId ?? null,
    marketFamily: input.model.marketFamily ?? null,
    marketType: input.market?.marketType ?? null,
    scope: input.market?.scope ?? null,
    selection: input.model.selection ?? null,
    oppositeSelection: null,
    side: input.model.side ?? null,
    line: finiteNumber(input.market?.line) ? input.market.line : null,
    settlementRuleDigest: input.market?.settlementRuleDigest ?? null,
    disposition: result.probability.modelPredictionFresh ? "included" : "excluded",
    reasonCodes: result.probability.modelPredictionFresh ? [] : ["INDEPENDENT_PROJECTION_INVALID"]
  }] : [];

  return [...contextSources, ...quoteSources, ...modelSource];
}

function buildAuditRecord(input, result, options, sourceRegistry, policy, modelEntry, asOfMs, evaluatedAtMs) {
  const targetOffer = input.market?.targetOffer ?? null;
  const configurationDigest = policy ? contentDigest(policy) : null;
  const createdAt = new Date(evaluatedAtMs).toISOString();
  const evidenceComplete = result.gateResults.every((gate) => (
    gate.status === "pass" || gate.code === "MODEL_VALIDATED"
  ));

  return createEvaluationRecord({
    origin: {
      channel: options.origin?.channel ?? "assistant_review",
      actorType: options.origin?.actorType ?? "operator",
      sessionId: options.origin?.sessionId ?? null,
      requestId: options.origin?.requestId ?? null
    },
    event: {
      sport: result.game,
      league: input.event?.league ?? null,
      eventId: input.event?.eventId ?? null,
      startTime: input.event?.startTime ?? null,
      homeTeam: input.event?.teamB ?? null,
      awayTeam: input.event?.teamA ?? null
    },
    market: {
      marketFamily: input.market?.marketFamily ?? null,
      marketType: input.market?.marketType ?? null,
      scope: input.market?.scope ?? null,
      settlementRuleDigest: input.market?.settlementRuleDigest ?? null,
      participantId: null,
      participantName: input.market?.selection ?? null,
      selection: input.market?.selection ?? null,
      side: input.market?.side ?? null,
      line: finiteNumber(input.market?.line) ? input.market.line : null
    },
    price: {
      sportsbook: targetOffer?.bookmaker ?? null,
      marketId: targetOffer?.marketId ?? null,
      jurisdiction: targetOffer?.jurisdiction ?? null,
      marketOdds: finiteNumber(targetOffer?.selectionAmericanOdds)
        ? targetOffer.selectionAmericanOdds
        : null,
      oppositeOdds: finiteNumber(targetOffer?.oppositeAmericanOdds)
        ? targetOffer.oppositeAmericanOdds
        : null,
      priceCapturedAt: targetOffer?.capturedAt ?? null,
      priceSourceTime: targetOffer?.capturedAt ?? null,
      priceStatus: targetOffer?.priceStatus ?? null,
      maxExecutableStake: targetOffer?.maxExecutableStake ?? null,
      executionCostRate: targetOffer?.executionCostRate ?? null,
      rawSnapshotDigest: targetOffer?.rawSnapshotDigest ?? null
    },
    sources: buildAuditSources(input, result, sourceRegistry, asOfMs, policy),
    model: {
      modelId: modelEntry?.modelId ?? input.model?.modelId ?? null,
      modelVersion: modelEntry?.modelVersion ?? input.model?.modelVersion ?? null,
      probabilityMethod: result.probability.method,
      modelStatus: modelEntry?.modelStatus ?? "research_only",
      calibrationReportId: modelEntry?.calibrationReportId ?? null,
      calibrationReportDigest: modelEntry?.calibrationReportDigest ?? null,
      trainingCutoff: modelEntry?.trainingCutoff ?? null,
      sampleSize: null,
      calculationImplementationDigest: modelEntry?.calculationImplementation?.implementationDigest ?? null,
      independentModelId: input.model?.independentModelId ?? null,
      independentModelVersion: input.model?.independentModelVersion ?? null,
      independentImplementationDigest: input.model?.independentImplementationDigest ?? null,
      featureSnapshotDigest: input.model?.featureSnapshotDigest ?? null,
      predictionDigest: input.model?.predictionDigest ?? null,
      predictionGeneratedAt: input.model?.generatedAt ?? null,
      predictionArtifactLocator: input.model?.predictionArtifactLocator ?? null
    },
    probability: {
      rawModelProbability: result.probability.modelPointProbability,
      rawModelLowerProbability: result.probability.modelLowerProbability,
      rawModelUpperProbability: result.probability.modelUpperProbability,
      adjustedProbability: result.probability.pointProbability,
      adjustedLowerProbability: result.probability.lowerProbability,
      adjustedUpperProbability: result.probability.upperProbability,
      marketImpliedProbability: result.market.targetImpliedProbability,
      marketNoVigProbability: result.market.consensusProbability,
      marketLowerProbability: result.market.consensusLowerProbability,
      marketUpperProbability: result.market.consensusUpperProbability,
      marketWeight: result.probability.marketWeight,
      modelWeight: result.probability.modelWeight
    },
    edge: {
      fairEdge: result.metrics.fairEdge,
      priceEdge: result.metrics.priceEdge,
      expectedValueRoi: result.metrics.expectedValueRoi,
      kellyFraction: result.metrics.kellyFraction
    },
    stake: {
      recommendedStake: result.metrics.recommendedStake,
      bankroll: policy?.bankroll ?? null,
      stakePolicyVersion: policy?.policyVersion ?? null
    },
    decision: {
      verdict: result.verdict,
      permission: result.verdict === "BET"
        ? "VERIFIED_BETS_ALLOWED"
        : result.market.freshPrice
          ? "PRICE_CHECK_ONLY"
          : "WAIT",
      reasons: result.reasons,
      riskFlags: result.riskFlags,
      gateResults: result.gateResults
    },
    audit: {
      codeVersion: CALCULATION_VERSION,
      configurationDigest,
      calculationVersion: CALCULATION_VERSION,
      evidenceCompleteness: evidenceComplete ? "complete" : "blocked",
      evaluationMode: result.evaluationMode,
      asOf: new Date(asOfMs).toISOString(),
      sourceRegistryDigest: contentDigest(sourceRegistry),
      policyDigest: policy?.policyDigest ?? null,
      warnings: [
        "The market component is an observed cross-book range, not a calibrated confidence interval.",
        "The reported independent-model interval is a digest-bound declared input; trusted execution/registry authority is still required for BET.",
        ...(modelEntry?.modelStatus === "validated"
          ? []
          : ["The registered model is not validated and cannot authorize an authoritative BET."])
      ]
    }
  }, {
    clientEventId: options.clientEventId ?? input.clientEventId,
    createdAt
  });
}

function evaluateEsportsCandidate(input, options = {}) {
  if (!isPlainObject(input)) {
    throw new TypeError("Esports candidate input must be an object.");
  }

  const evaluatedAtMs = Date.now();
  const evaluationMode = options.mode === "replay" || options.now !== undefined
    ? "replay"
    : "operational";
  const nowMs = evaluationMode === "replay"
    ? parseTimestamp(options.now ?? input.observedAt)
    : evaluatedAtMs;
  if (nowMs === null) {
    throw new TypeError("now or observedAt must be a valid timestamp.");
  }

  const riskFlags = [];
  const gateResults = [];
  const reasons = [];
  let game;
  try {
    game = normalizeGame(input.game);
    addGate(gateResults, "SUPPORTED_GAME", "pass", `${game} is supported.`);
  } catch (error) {
    game = nonEmptyString(input.game) ? input.game : "UNKNOWN";
    addGate(gateResults, "SUPPORTED_GAME", "fail", error.message);
    addRiskFlag(riskFlags, "UNSUPPORTED_GAME", "high", error.message);
  }

  const policy = validatePolicy(input.policy, gateResults, riskFlags);
  let sourceRegistry = {};
  try {
    sourceRegistry = normalizeSourceRegistry(options.sourceRegistry);
  } catch (error) {
    addGate(gateResults, "SOURCE_REGISTRY", "fail", error.message);
    addRiskFlag(
      riskFlags,
      "SOURCE_REGISTRY_UNAVAILABLE",
      "high",
      "The approved esports source registry could not be loaded."
    );
  }

  let requiredClaims = [];
  const requestedScope = typeof input.market?.scope === "string"
    ? input.market.scope.trim().toLowerCase()
    : "series";
  const liveScopeUnsupported = requestedScope === "live_map";
  if (SUPPORTED_GAMES.includes(game)) {
    try {
      requiredClaims = getRequiredClaimKeys(game, input.market?.scope ?? "series");
    } catch (error) {
      addGate(gateResults, "MARKET_SCOPE", "fail", error.message);
      addRiskFlag(riskFlags, "UNSUPPORTED_MARKET_SCOPE", "high", error.message);
    }
  }
  if (liveScopeUnsupported) {
    addGate(
      gateResults,
      "LIVE_SCOPE_IMPLEMENTED",
      "fail",
      "Live-map execution is not implemented; live-map claim keys are retained only as a future evidence contract."
    );
    addRiskFlag(riskFlags, "LIVE_SCOPE_UNAVAILABLE", "high", "This evaluator cannot issue a live-map decision.");
  }

  const hardPass = (
    input.risk?.tiltLocked === true
    || input.risk?.exposureConflict === true
    || input.risk?.correlatedPosition === true
    || input.risk?.ledgerIntegrityValid === false
  );
  if (input.risk?.tiltLocked === true) {
    addRiskFlag(riskFlags, "TILT_LOCK", "high", "Tilt lock is active.");
  }
  if (input.risk?.exposureConflict === true) {
    addRiskFlag(riskFlags, "EXPOSURE_CONFLICT", "high", "Existing exposure conflicts with this candidate.");
  }
  if (input.risk?.correlatedPosition === true) {
    addRiskFlag(riskFlags, "CORRELATED_POSITION", "high", "A correlated open position is already present.");
  }
  if (input.risk?.ledgerIntegrityValid === false) {
    addRiskFlag(riskFlags, "LEDGER_INTEGRITY_FAILED", "high", "Bankroll authority is unavailable because ledger integrity failed.");
  } else if (input.risk?.ledgerIntegrityValid !== true) {
    addGate(gateResults, "LEDGER_INTEGRITY", "fail", "Ledger integrity was not explicitly verified.");
    addRiskFlag(riskFlags, "LEDGER_INTEGRITY_UNVERIFIED", "high", "Ledger integrity must be verified before sizing a position.");
  } else {
    addGate(gateResults, "LEDGER_INTEGRITY", "pass", "Ledger integrity is verified.");
  }

  const startTimeMs = parseTimestamp(input.event?.startTime);
  let eventStarted = false;
  let eventCutoffReached = false;
  if (liveScopeUnsupported) {
    addGate(gateResults, "EVENT_TIME", "fail", "Live-map timing is not implemented.");
  } else if (startTimeMs === null) {
    addGate(gateResults, "EVENT_TIME", "fail", "Event start time is missing or invalid.");
    addRiskFlag(riskFlags, "INVALID_EVENT_TIME", "high", "Event start time cannot be verified.");
  } else if (nowMs >= startTimeMs) {
    eventStarted = true;
    addGate(gateResults, "EVENT_TIME", "fail", "The pre-match event has already started.");
    addRiskFlag(riskFlags, "EVENT_STARTED", "high", "A pre-match candidate cannot be entered after event start.");
  } else if (
    policy
    && nowMs >= startTimeMs - policy.eventCutoffMinutes * 60000
  ) {
    eventCutoffReached = true;
    addGate(gateResults, "EVENT_TIME", "fail", "The pre-match decision cutoff has been reached.");
    addRiskFlag(riskFlags, "EVENT_CUTOFF_REACHED", "high", "The event is inside the prohibited pre-match entry window.");
  } else {
    addGate(gateResults, "EVENT_TIME", "pass", "The event is before the configured pre-match cutoff.");
  }

  let evidenceComplete = false;
  if (policy && requiredClaims.length > 0 && Object.keys(sourceRegistry).length > 0) {
    evidenceComplete = evaluateEvidence(
      input,
      requiredClaims,
      policy,
      sourceRegistry,
      gateResults,
      riskFlags,
      nowMs
    );
  }

  const expectedSelection = input.market?.side === "team_a"
    ? input.event?.teamA ?? null
    : input.market?.side === "team_b"
      ? input.event?.teamB ?? null
      : null;
  const oppositeSelection = input.market?.side === "team_a"
    ? input.event?.teamB ?? null
    : input.market?.side === "team_b"
      ? input.event?.teamA ?? null
      : null;
  const marketIdentityValid = (
    nonEmptyString(input.event?.eventId)
    && nonEmptyString(input.market?.marketFamily)
    && nonEmptyString(input.market?.marketType)
    && nonEmptyString(input.market?.scope)
    && nonEmptyString(input.market?.selection)
    && input.market.selection === expectedSelection
    && nonEmptyString(oppositeSelection)
    && DIGEST_PATTERN.test(input.market?.settlementRuleDigest ?? "")
  );
  addGate(
    gateResults,
    "MARKET_IDENTITY",
    marketIdentityValid ? "pass" : "fail",
    marketIdentityValid
      ? "The canonical event, selection, side, market, and settlement-rule identity is complete."
      : "Canonical event, selection, side, market, or settlement-rule identity is missing or inconsistent."
  );
  if (!marketIdentityValid) {
    addRiskFlag(riskFlags, "MARKET_IDENTITY_INCOMPLETE", "high", "Exact market identity is required.");
  }
  const marketFingerprint = {
    eventId: input.event?.eventId ?? null,
    marketFamily: input.market?.marketFamily ?? null,
    marketType: input.market?.marketType ?? null,
    scope: input.market?.scope ?? null,
    selection: input.market?.selection ?? null,
    oppositeSelection,
    side: input.market?.side ?? null,
    line: finiteNumber(input.market?.line) ? input.market.line : null,
    settlementRuleDigest: input.market?.settlementRuleDigest ?? null
  };

  let targetInspection = { valid: false, issues: ["MISSING_TARGET_PRICE"], normalized: null };
  if (policy) {
    targetInspection = inspectQuote(input.market?.targetOffer, {
      nowMs,
      maxPriceAgeMinutes: policy.maxPriceAgeMinutes,
      requireExecution: true,
      marketFingerprint
    });
  }
  const freshPrice = targetInspection.valid;
  if (!freshPrice) {
    const issue = targetInspection.issues[0] ?? "MISSING_TARGET_PRICE";
    addGate(gateResults, "TARGET_PRICE", "fail", `Target price failed: ${targetInspection.issues.join(", ")}.`);
    addRiskFlag(
      riskFlags,
      issue === "MISSING_QUOTE" ? "MISSING_TARGET_PRICE" : issue,
      "high",
      "An exact, complete, verified, fresh target price is required."
    );
  } else {
    addGate(gateResults, "TARGET_PRICE", "pass", "Target price is exact, complete, verified, and fresh.");
  }

  let consensus = {
    method: "median_cross_book_two_way_no_vig",
    pointProbability: null,
    lowerProbability: null,
    upperProbability: null,
    observedRange: null,
    books: [],
    excluded: []
  };
  if (policy) {
    consensus = deriveConsensusProbability(input.market?.consensusOffers, {
      targetBookmaker: input.market?.targetOffer?.bookmaker,
      targetIndependenceFamily: input.market?.targetOffer?.independenceFamily,
      marketFingerprint,
      now: new Date(nowMs).toISOString(),
      maxPriceAgeMinutes: policy.maxPriceAgeMinutes
    });
    if (consensus.books.length < policy.minConsensusBooks) {
      addGate(
        gateResults,
        "CONSENSUS_BOOK_COUNT",
        "fail",
        `${consensus.books.length} eligible independent books remain; ${policy.minConsensusBooks} are required.`
      );
      addRiskFlag(riskFlags, "INSUFFICIENT_CONSENSUS_BOOKS", "high", "Cross-book consensus is incomplete.");
    } else {
      addGate(gateResults, "CONSENSUS_BOOK_COUNT", "pass", `${consensus.books.length} eligible books support consensus.`);
    }
    if (
      finiteNumber(consensus.observedRange)
      && consensus.observedRange > policy.maxConsensusRange
    ) {
      addGate(gateResults, "CONSENSUS_RANGE", "fail", "Cross-book probability range exceeds policy.");
      addRiskFlag(riskFlags, "MARKET_DISAGREEMENT", "high", "Books disagree beyond the configured range.");
    } else if (finiteNumber(consensus.observedRange)) {
      addGate(gateResults, "CONSENSUS_RANGE", "pass", "Cross-book probability range is within policy.");
    }
  }

  let modelEntry = null;
  const modelResolver = options.modelResolver ?? resolveModelStatus;
  if (
    nonEmptyString(input.model?.modelId)
    && nonEmptyString(input.model?.modelVersion)
    && nonEmptyString(input.market?.marketFamily)
  ) {
    try {
      modelEntry = modelResolver(
        input.model.modelId,
        input.model.modelVersion,
        input.market.marketFamily,
        options.modelRegistryOptions ?? {}
      );
    } catch (error) {
      addGate(gateResults, "MODEL_REGISTRY", "fail", error.message);
      addRiskFlag(riskFlags, "MODEL_REGISTRY_UNAVAILABLE", "high", "The model registry could not be verified.");
    }
  }

  if (!modelEntry) {
    addGate(gateResults, "MODEL_REGISTERED", "fail", "No exact registered model tuple matches this candidate.");
    addRiskFlag(riskFlags, "MODEL_NOT_REGISTERED", "high", "The model identity is not registered.");
  } else if (
    modelEntry.modelId !== MODEL_ID
    || modelEntry.modelVersion !== MODEL_VERSION
    || modelEntry.marketFamily !== input.market.marketFamily
  ) {
    addGate(gateResults, "MODEL_REGISTERED", "fail", "The registered model is not implemented by this esports slice.");
    addRiskFlag(riskFlags, "MODEL_IMPLEMENTATION_UNSUPPORTED", "high", "The requested registered model implementation is unavailable.");
  } else if (!MODEL_STATUSES.has(modelEntry.modelStatus) || modelEntry.modelStatus === "retired") {
    addGate(gateResults, "MODEL_REGISTERED", "fail", "The registered model status is unavailable for decisions.");
    addRiskFlag(riskFlags, "MODEL_STATUS_BLOCKED", "high", "The model status cannot produce a current decision.");
  } else {
    addGate(gateResults, "MODEL_REGISTERED", "pass", "The exact model tuple is registered.");
  }

  const modelValidated = (
    modelEntry?.modelStatus === "validated"
    && nonEmptyString(modelEntry.calibrationReportId)
    && DIGEST_PATTERN.test(modelEntry.calibrationReportDigest ?? "")
    && parseTimestamp(modelEntry.trainingCutoff) !== null
  );
  addGate(
    gateResults,
    "MODEL_VALIDATED",
    modelValidated ? "pass" : "fail",
    modelValidated
      ? "The model is registry-validated with immutable calibration evidence."
      : "The model lacks registry-validated immutable calibration evidence."
  );
  if (!modelValidated) {
    addRiskFlag(riskFlags, "MODEL_CALIBRATION_REQUIRED", "high", "A validated calibration report is required for BET.");
  }
  const operationalAuthority = (
    evaluationMode === "operational"
    && OPERATIONAL_BET_AUTHORITY_IMPLEMENTED
  );
  addGate(
    gateResults,
    "OPERATIONAL_BET_AUTHORITY",
    operationalAuthority ? "pass" : "fail",
    evaluationMode === "replay"
      ? "Replay/as-of evaluation is non-authoritative and cannot issue BET."
      : "Trusted provider-adapter, policy, risk, and artifact authority is not implemented for esports BET."
  );
  if (!operationalAuthority) {
    addRiskFlag(
      riskFlags,
      "OPERATIONAL_BET_AUTHORITY_UNAVAILABLE",
      "high",
      "The calculation may support research classification but cannot authorize a real BET."
    );
  }

  const priceCapturedAtMs = parseTimestamp(input.market?.targetOffer?.capturedAt);
  const projection = policy
    ? inspectIndependentProjection(
        input.model,
        input,
        nowMs,
        policy.maxModelAgeMinutes,
        priceCapturedAtMs
      )
    : {
        valid: false,
        issues: ["POLICY_INCOMPLETE"],
        pointProbability: null,
        lowerProbability: null,
        upperProbability: null
      };
  addGate(
    gateResults,
    "INDEPENDENT_PROJECTION",
    projection.valid ? "pass" : "fail",
    projection.valid
      ? "The retained independent model prediction and uncertainty interval are complete and fresh."
      : `Independent projection failed: ${projection.issues.join(", ")}.`
  );
  if (!projection.valid) {
    addRiskFlag(
      riskFlags,
      "INDEPENDENT_PROJECTION_INCOMPLETE",
      "high",
      "Bear Edge requires a retained, timestamped, uncertainty-aware independent projection."
    );
  }
  const policyRegisteredAtMs = parseTimestamp(policy?.registeredAt);
  const policyPredeclared = (
    policyRegisteredAtMs !== null
    && projection.generatedAtMs !== null
    && priceCapturedAtMs !== null
    && policyRegisteredAtMs < projection.generatedAtMs
    && policyRegisteredAtMs < priceCapturedAtMs
    && policyRegisteredAtMs < nowMs
  );
  addGate(
    gateResults,
    "POLICY_PREDECLARED",
    policyPredeclared ? "pass" : "fail",
    policyPredeclared
      ? "The digest-bound policy was registered before prediction and price capture."
      : "The decision policy was not demonstrably registered before prediction and price capture."
  );
  if (!policyPredeclared) {
    addRiskFlag(riskFlags, "POLICY_NOT_PREDECLARED", "high", "Post-hoc policy selection is prohibited.");
  }

  let actionableProbability = {
    method: "registered_linear_model_market_shrinkage",
    marketWeight: policy?.marketWeight ?? null,
    modelWeight: policy ? 1 - policy.marketWeight : null,
    pointProbability: null,
    lowerProbability: null,
    upperProbability: null,
    intervalType: "model_interval_blended_with_observed_cross_book_range"
  };
  if (
    policy
    && projection.valid
    && [
      consensus.pointProbability,
      consensus.lowerProbability,
      consensus.upperProbability
    ].every(finiteNumber)
  ) {
    actionableProbability = deriveActionableProbability({
      modelPointProbability: projection.pointProbability,
      modelLowerProbability: projection.lowerProbability,
      modelUpperProbability: projection.upperProbability,
      marketPointProbability: consensus.pointProbability,
      marketLowerProbability: consensus.lowerProbability,
      marketUpperProbability: consensus.upperProbability,
      marketWeight: policy.marketWeight
    });
  }

  const targetImpliedProbability = targetInspection.normalized?.impliedSelectionProbability ?? null;
  const targetNoVigProbability = targetInspection.normalized?.noVigSelectionProbability ?? null;
  const decimalOdds = freshPrice ? americanToDecimal(input.market.targetOffer.selectionAmericanOdds) : null;
  const pointProbability = actionableProbability.pointProbability;
  const decisionProbability = actionableProbability.lowerProbability;
  const executionCostRate = targetInspection.normalized?.executionCostRate ?? null;
  const metrics = {
    fairEdge: finiteNumber(pointProbability) && finiteNumber(consensus.pointProbability)
      ? pointProbability - consensus.pointProbability
      : null,
    priceEdge: finiteNumber(decisionProbability) && finiteNumber(targetImpliedProbability)
      ? decisionProbability - targetImpliedProbability
      : null,
    pointPriceEdge: finiteNumber(pointProbability) && finiteNumber(targetImpliedProbability)
      ? pointProbability - targetImpliedProbability
      : null,
    expectedValueRoi: freshPrice ? calculateExpectedValue(decisionProbability, input.market.targetOffer.selectionAmericanOdds, executionCostRate) : null,
    pointExpectedValueRoi: freshPrice ? calculateExpectedValue(pointProbability, input.market.targetOffer.selectionAmericanOdds, executionCostRate) : null,
    kellyFraction: freshPrice ? calculateKelly(decisionProbability, input.market.targetOffer.selectionAmericanOdds, executionCostRate) : null,
    pointKellyFraction: freshPrice ? calculateKelly(pointProbability, input.market.targetOffer.selectionAmericanOdds, executionCostRate) : null,
    recommendedStake: null,
    pointRecommendedStake: null,
    decimalOdds,
    executionCostRate
  };
  metrics.recommendedStake = calculateStake(metrics.kellyFraction, policy);
  metrics.pointRecommendedStake = calculateStake(metrics.pointKellyFraction, policy);
  const executableSizeClears = (
    finiteNumber(metrics.recommendedStake)
    && finiteNumber(targetInspection.normalized?.maxExecutableStake)
    && metrics.recommendedStake <= targetInspection.normalized.maxExecutableStake
  );
  addGate(
    gateResults,
    "EXECUTABLE_SIZE",
    executableSizeClears ? "pass" : "fail",
    executableSizeClears
      ? "The recorded executable size covers the conservative recommended stake."
      : "The conservative recommended stake exceeds or lacks a recorded executable size."
  );
  if (!executableSizeClears) {
    addRiskFlag(riskFlags, "INSUFFICIENT_EXECUTABLE_SIZE", "high", "Available size must cover the recommended stake.");
  }

  const pointClears = policy && [
    metrics.pointPriceEdge,
    metrics.pointExpectedValueRoi,
    metrics.pointKellyFraction,
    metrics.pointRecommendedStake
  ].every(finiteNumber) && mathClears(metrics, policy, "point");
  const conservativeClears = policy && [
    metrics.priceEdge,
    metrics.expectedValueRoi,
    metrics.kellyFraction,
    metrics.recommendedStake
  ].every(finiteNumber) && mathClears(metrics, policy);

  addGate(
    gateResults,
    "POINT_VALUE",
    pointClears ? "pass" : "fail",
    pointClears ? "The point Bear probability clears edge, net EV, Kelly, and stake policy." : "The point Bear probability does not clear every value threshold."
  );
  addGate(
    gateResults,
    "CONSERVATIVE_VALUE",
    conservativeClears ? "pass" : "fail",
    conservativeClears
      ? "The conservative Bear probability clears every value threshold after recorded execution cost."
      : "The conservative Bear probability does not clear every value threshold."
  );

  const waiting = (
    !policy
    || !SUPPORTED_GAMES.includes(game)
    || liveScopeUnsupported
    || requiredClaims.length === 0
    || !evidenceComplete
    || !marketIdentityValid
    || input.risk?.ledgerIntegrityValid !== true
    || startTimeMs === null
    || eventCutoffReached
    || !freshPrice
    || !projection.valid
    || !policyPredeclared
    || consensus.books.length < (policy?.minConsensusBooks ?? Infinity)
    || !finiteNumber(consensus.observedRange)
    || consensus.observedRange > (policy?.maxConsensusRange ?? -Infinity)
    || !modelEntry
    || modelEntry?.modelId !== MODEL_ID
    || modelEntry?.modelVersion !== MODEL_VERSION
    || modelEntry?.modelStatus === "retired"
    || !executableSizeClears
  );

  let verdict;
  let shadowVerdict = null;
  if (hardPass || eventStarted) {
    verdict = "PASS";
    reasons.push("A hard bankroll, exposure, conduct, or event-state gate failed.");
  } else if (waiting) {
    verdict = "WAIT";
    reasons.push("Required identity, source, model, timing, or price evidence is incomplete.");
  } else if (!pointClears) {
    verdict = "PASS";
    reasons.push("The point Bear probability does not clear edge, net EV, Kelly, and stake thresholds.");
  } else if (!conservativeClears) {
    verdict = "LEAN";
    shadowVerdict = "BET_IF_PRICE_OR_UNCERTAINTY_IMPROVES";
    reasons.push("Point value is positive, but the conservative Bear probability does not clear every threshold.");
  } else if (!modelValidated) {
    verdict = "LEAN";
    shadowVerdict = "BET_IF_VALIDATED";
    reasons.push("The reproducible value calculation clears, but the registered model is not validated.");
  } else if (!operationalAuthority) {
    verdict = "LEAN";
    shadowVerdict = "BET_IF_OPERATIONAL_AUTHORITY_VERIFIED";
    reasons.push("The math clears, but trusted operational evidence and risk authority is unavailable.");
  } else {
    verdict = "BET";
    reasons.push("Identity, source agreement, timing, price, conservative value, calibration, and risk gates all pass.");
  }

  const result = {
    evaluationMode,
    game,
    verdict,
    shadowVerdict,
    reasons,
    riskFlags,
    gateResults,
    requiredClaims,
    market: {
      freshPrice,
      targetBookmaker: targetInspection.bookmaker ?? null,
      targetImpliedProbability,
      targetNoVigProbability,
      consensusProbability: consensus.pointProbability,
      consensusLowerProbability: consensus.lowerProbability,
      consensusUpperProbability: consensus.upperProbability,
      consensusObservedRange: consensus.observedRange,
      consensusBookCount: consensus.books.length,
      consensusBooks: consensus.books,
      excludedConsensusOffers: consensus.excluded
    },
    probability: {
      method: actionableProbability.method,
      marketWeight: actionableProbability.marketWeight,
      modelWeight: actionableProbability.modelWeight,
      modelPredictionFresh: projection.valid,
      modelPointProbability: projection.pointProbability,
      modelLowerProbability: projection.lowerProbability,
      modelUpperProbability: projection.upperProbability,
      pointProbability,
      lowerProbability: actionableProbability.lowerProbability,
      upperProbability: actionableProbability.upperProbability,
      decisionProbability,
      intervalType: actionableProbability.intervalType
    },
    metrics
  };
  result.auditRecord = buildAuditRecord(
    input,
    result,
    options,
    sourceRegistry,
    policy,
    modelEntry,
    nowMs,
    evaluatedAtMs
  );

  return result;
}

async function evaluateEsportsCandidateAndLog(input, options = {}) {
  const result = evaluateEsportsCandidate(input, options);
  const ledgerPath = options.ledgerPath;
  const outboxPath = options.outboxPath ?? (ledgerPath ? `${ledgerPath}.outbox` : undefined);
  const persistence = await appendAuthoritativeRecord(result.auditRecord, {
    ledgerPath,
    outboxPath
  });

  return {
    ...result,
    persistence
  };
}

module.exports = {
  CALCULATION_VERSION,
  DEFAULT_SOURCE_REGISTRY_PATH,
  MODEL_ID,
  MODEL_VERSION,
  SUPPORTED_GAMES,
  americanToDecimal,
  americanToImpliedProbability,
  deriveActionableProbability,
  deriveConsensusProbability,
  evaluateEsportsCandidate,
  evaluateEsportsCandidateAndLog,
  getRequiredClaimKeys,
  loadEsportsSourceRegistry,
  normalizeGame,
  normalizeTwoWayOffer
};
