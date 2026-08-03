const crypto = require("node:crypto");

const {
  appendAuthoritativeRecord
} = require("./authoritative-ledger.js");
const {
  canonicalStringify,
  contentDigest
} = require("./canonical-json.js");
const {
  createEvaluationRecord
} = require("./record-contract.js");
const {
  estimateCountProbability
} = require("../live/estimate-prop.js");

const SHADOW_COHORT_SCHEMA_VERSION = "1.0.0";
const SHADOW_CALCULATION_VERSION = "side_normalized_shadow_cohort_v1";
const ACTIONABLE_MLB_STATUSES = new Set(["Scheduled", "Pre-Game", "Warmup", "Preview"]);
const MARKET_FAMILIES = Object.freeze({
  hits: Object.freeze({
    marketFamily: "batter_hits",
    marketType: "hits",
    statLabel: "hits",
    recentWeight: 0.45
  }),
  runs: Object.freeze({
    marketFamily: "batter_runs_scored",
    marketType: "runs",
    statLabel: "runs",
    recentWeight: 0.42
  }),
  strikeOuts: Object.freeze({
    marketFamily: "pitcher_strikeouts",
    marketType: "strikeOuts",
    statLabel: "strikeouts",
    recentWeight: 0.45
  }),
  totalBases: Object.freeze({
    marketFamily: "batter_total_bases",
    marketType: "totalBases",
    statLabel: "total bases",
    recentWeight: 0.5
  })
});
const DIGEST_PATTERN = /^[a-f0-9]{64}$/;

class ShadowCohortError extends Error {
  constructor(code, message, options = {}) {
    super(message, options);
    this.name = "ShadowCohortError";
    this.code = code;
  }
}

function cloneJson(value) {
  return JSON.parse(canonicalStringify(value));
}

function requireTimestamp(value, field) {
  if (typeof value !== "string" || !Number.isFinite(Date.parse(value))) {
    throw new ShadowCohortError(
      "INVALID_TIMESTAMP",
      `${field} must be a valid ISO timestamp.`
    );
  }

  return new Date(value).toISOString();
}

function requireIdentity(value, field) {
  const normalized = String(value ?? "").trim();

  if (!normalized) {
    throw new ShadowCohortError(
      "MISSING_IDENTITY",
      `${field} must be a non-empty identity.`
    );
  }

  return normalized;
}

function requireFinite(value, field) {
  if (typeof value !== "number" || !Number.isFinite(value)) {
    throw new ShadowCohortError(
      "INVALID_NUMBER",
      `${field} must be a finite number.`
    );
  }

  return value;
}

function deterministicUuid(value) {
  const bytes = crypto
    .createHash("sha256")
    .update(canonicalStringify(value))
    .digest()
    .subarray(0, 16);
  bytes[6] = (bytes[6] & 0x0f) | 0x50;
  bytes[8] = (bytes[8] & 0x3f) | 0x80;
  const hex = bytes.toString("hex");

  return [
    hex.slice(0, 8),
    hex.slice(8, 12),
    hex.slice(12, 16),
    hex.slice(16, 20),
    hex.slice(20)
  ].join("-");
}

function canonicalOverProbability(prediction) {
  const side = String(prediction?.side ?? "").toLowerCase();
  const probability = requireFinite(
    prediction?.modelProbability,
    "candidate.prediction.modelProbability"
  );

  if (!["over", "under"].includes(side)) {
    throw new ShadowCohortError(
      "INVALID_SIDE",
      "candidate.prediction.side must be over or under."
    );
  }
  if (probability < 0 || probability > 1) {
    throw new ShadowCohortError(
      "INVALID_PROBABILITY",
      "candidate.prediction.modelProbability must be between zero and one."
    );
  }

  return side === "over" ? probability : 1 - probability;
}

function verifiedCanonicalOverProbability(candidate) {
  const descriptor = MARKET_FAMILIES[candidate?.statKey];

  if (!descriptor) {
    throw new ShadowCohortError(
      "UNSUPPORTED_MARKET",
      `Unsupported MLB shadow market: ${candidate?.statKey ?? "unknown"}.`
    );
  }
  if (candidate?.prediction?.model !== "poisson_count_v1") {
    throw new ShadowCohortError(
      "MODEL_ID_MISMATCH",
      "candidate.prediction.model must equal the registered poisson_count_v1 model."
    );
  }
  if (candidate?.prediction?.calibrationStatus !== "research_only") {
    throw new ShadowCohortError(
      "MODEL_STATUS_MISMATCH",
      "candidate.prediction.calibrationStatus must remain research_only."
    );
  }

  const reportedMean = requireFinite(
    candidate?.stats?.blendedMean,
    "candidate.stats.blendedMean"
  );
  const seasonPerGame = requireFinite(
    candidate?.stats?.seasonPerGame,
    "candidate.stats.seasonPerGame"
  );
  const recentPerGame = requireFinite(
    candidate?.stats?.recentPerGame,
    "candidate.stats.recentPerGame"
  );
  const recentGamesPlayed = requireFinite(
    candidate?.stats?.recentGamesPlayed,
    "candidate.stats.recentGamesPlayed"
  );
  const recentTotal = requireFinite(
    candidate?.stats?.recentTotal,
    "candidate.stats.recentTotal"
  );
  const line = requireFinite(candidate?.line, "candidate.line");
  const side = String(candidate?.prediction?.side ?? "").toLowerCase();
  const reported = requireFinite(
    candidate?.prediction?.modelProbability,
    "candidate.prediction.modelProbability"
  );

  if (
    seasonPerGame < 0
    || recentPerGame < 0
    || reportedMean < 0
    || !Number.isSafeInteger(recentGamesPlayed)
    || recentGamesPlayed < 1
    || !Number.isSafeInteger(recentTotal)
    || recentTotal < 0
  ) {
    throw new ShadowCohortError(
      "INVALID_MODEL_INPUT",
      "Registered Poisson inputs must be non-negative and recent counts must be positive integer evidence."
    );
  }
  if (!["over", "under"].includes(side)) {
    throw new ShadowCohortError(
      "INVALID_SIDE",
      "candidate.prediction.side must be over or under."
    );
  }
  if (reported < 0 || reported > 1) {
    throw new ShadowCohortError(
      "INVALID_PROBABILITY",
      "candidate.prediction.modelProbability must be between zero and one."
    );
  }

  const expectedMean = (
    seasonPerGame * (1 - descriptor.recentWeight)
    + recentPerGame * descriptor.recentWeight
  );
  const expectedLine = Math.max(0.5, Math.floor(expectedMean) + 0.5);
  const expectedSide = recentPerGame >= seasonPerGame ? "over" : "under";

  if (Math.abs(recentPerGame - (recentTotal / recentGamesPlayed)) > 1e-12) {
    throw new ShadowCohortError(
      "RECENT_RATE_MISMATCH",
      "candidate.stats.recentPerGame does not match recentTotal / recentGamesPlayed."
    );
  }
  if (Math.abs(reportedMean - expectedMean) > 1e-12) {
    throw new ShadowCohortError(
      "BLENDED_MEAN_MISMATCH",
      "candidate.stats.blendedMean does not match the registered recent-weight calculation."
    );
  }
  if (line !== expectedLine || candidate?.prediction?.line !== expectedLine) {
    throw new ShadowCohortError(
      "MODEL_LINE_MISMATCH",
      "Candidate threshold does not match the registered half-unit line rule."
    );
  }
  if (side !== expectedSide) {
    throw new ShadowCohortError(
      "MODEL_SIDE_MISMATCH",
      "Candidate source side does not match the registered season-versus-recent rule."
    );
  }

  const recomputedSourceSide = estimateCountProbability({
    mean: expectedMean,
    line: expectedLine,
    side: expectedSide
  });

  if (Math.abs(recomputedSourceSide - reported) > 1e-12) {
    throw new ShadowCohortError(
      "MODEL_PROBABILITY_MISMATCH",
      "Reported model probability does not match the registered Poisson count calculation."
    );
  }

  return estimateCountProbability({
    mean: expectedMean,
    line: expectedLine,
    side: "over"
  });
}

function sanitizeTeam(team) {
  return {
    id: team?.id ?? null,
    name: team?.name ?? null,
    score: team?.score ?? null,
    wins: team?.wins ?? null,
    losses: team?.losses ?? null,
    probablePitcher: team?.probablePitcher
      ? {
          id: team.probablePitcher.id ?? null,
          name: team.probablePitcher.name ?? null
        }
      : null
  };
}

function sanitizeGame(game) {
  return {
    id: game?.id ?? null,
    sport: game?.sport ?? null,
    date: game?.date ?? null,
    gameDate: game?.gameDate ?? null,
    status: game?.status ?? null,
    state: game?.state ?? null,
    venue: game?.venue ?? null,
    away: sanitizeTeam(game?.away),
    home: sanitizeTeam(game?.home),
    sourceUrl: game?.sourceUrl ?? null,
    official: game?.official ?? null
  };
}

function sanitizeCandidate(candidate) {
  const uncertainty = candidate?.prediction?.uncertainty ?? {};

  return {
    id: candidate?.id ?? null,
    sport: candidate?.sport ?? null,
    provider: candidate?.provider ?? null,
    gameId: candidate?.gameId ?? null,
    gameDate: candidate?.gameDate ?? null,
    status: candidate?.status ?? null,
    venue: candidate?.venue ?? null,
    matchup: candidate?.matchup ?? null,
    player: {
      id: candidate?.player?.id ?? null,
      name: candidate?.player?.name ?? null,
      teamName: candidate?.player?.teamName ?? null,
      opponentName: candidate?.player?.opponentName ?? null,
      positionName: candidate?.player?.positionName ?? null,
      positionAbbreviation: candidate?.player?.positionAbbreviation ?? null
    },
    marketType: candidate?.marketType ?? null,
    statGroup: candidate?.statGroup ?? (
      candidate?.statKey === "strikeOuts" ? "pitching" : "hitting"
    ),
    statKey: candidate?.statKey ?? null,
    statLabel: candidate?.statLabel ?? null,
    line: candidate?.line ?? null,
    stats: {
      seasonPerGame: candidate?.stats?.seasonPerGame ?? null,
      recentPerGame: candidate?.stats?.recentPerGame ?? null,
      seasonGamesPlayed: candidate?.stats?.seasonGamesPlayed ?? null,
      recentGamesPlayed: candidate?.stats?.recentGamesPlayed ?? null,
      recentTotal: candidate?.stats?.recentTotal ?? null,
      blendedMean: candidate?.stats?.blendedMean ?? null,
      recentLimit: candidate?.stats?.recentLimit ?? null,
      sourceUrl: candidate?.stats?.sourceUrl ?? null,
      fetchedAt: candidate?.stats?.fetchedAt ?? null,
      rosterSourceUrl: candidate?.stats?.rosterSourceUrl ?? null,
      rosterFetchedAt: candidate?.stats?.rosterFetchedAt ?? null
    },
    prediction: {
      model: candidate?.prediction?.model ?? null,
      calibrationStatus: candidate?.prediction?.calibrationStatus ?? null,
      side: candidate?.prediction?.side ?? null,
      line: candidate?.prediction?.line ?? null,
      modelProbability: candidate?.prediction?.modelProbability ?? null,
      sampleSize: candidate?.prediction?.sampleSize ?? null,
      uncertainty: {
        method: uncertainty?.method ?? null,
        confidenceLevel: uncertainty?.confidenceLevel ?? null,
        sampleSize: uncertainty?.sampleSize ?? null,
        intervalBasis: uncertainty?.intervalBasis ?? null,
        observedTotal: uncertainty?.observedTotal ?? null,
        observedMean: uncertainty?.observedMean ?? null,
        pointMean: uncertainty?.pointMean ?? null,
        lowerMean: uncertainty?.lowerMean ?? null,
        upperMean: uncertainty?.upperMean ?? null,
        pointProbability: uncertainty?.pointProbability ?? null,
        lowerProbability: uncertainty?.lowerProbability ?? null,
        upperProbability: uncertainty?.upperProbability ?? null,
        width: uncertainty?.width ?? null,
        decisionProbability: uncertainty?.decisionProbability ?? null,
        limitations: cloneJson(uncertainty?.limitations ?? [])
      }
    },
    audit: {
      generatedFrom: candidate?.audit?.generatedFrom ?? null,
      oddsSource: candidate?.audit?.oddsSource ?? null,
      evaluationReadiness: candidate?.audit?.evaluationReadiness ?? null,
      sourceUrl: candidate?.audit?.sourceUrl ?? null,
      sourceFetchedAt: candidate?.audit?.sourceFetchedAt ?? null
    },
    riskFlags: (Array.isArray(candidate?.riskFlags) ? candidate.riskFlags : []).map((flag) => ({
      code: flag?.code ?? null,
      severity: flag?.severity ?? null,
      message: flag?.message ?? null
    }))
  };
}

function createShadowCohortArtifact(candidatePayload, context = {}) {
  if (!candidatePayload || typeof candidatePayload !== "object" || Array.isArray(candidatePayload)) {
    throw new ShadowCohortError(
      "INVALID_PAYLOAD",
      "Candidate payload must be an object."
    );
  }

  const capturedAt = requireTimestamp(candidatePayload.fetchedAt, "candidatePayload.fetchedAt");

  if (
    context.capturedAt !== undefined
    && requireTimestamp(context.capturedAt, "capturedAt") !== capturedAt
  ) {
    throw new ShadowCohortError(
      "CAPTURE_TIME_MISMATCH",
      "capturedAt cannot replace or relabel candidatePayload.fetchedAt."
    );
  }
  const games = Array.isArray(candidatePayload.gameWindow?.games)
    ? candidatePayload.gameWindow.games.filter((game) => game?.sport === "mlb")
    : [];
  const candidates = Array.isArray(candidatePayload.candidates)
    ? candidatePayload.candidates
        .filter((candidate) => candidate?.sport === "mlb")
        .map(sanitizeCandidate)
    : [];

  return {
    schemaVersion: SHADOW_COHORT_SCHEMA_VERSION,
    artifactType: "mlb_side_normalized_shadow_cohort",
    capturedAt,
    cohortDefinition: "every_mlb_candidate_returned_by_generateResearchCandidates",
    restrictions: {
      researchOnly: true,
      sportsbookPricesIncluded: false,
      rankedCandidateSubset: false,
      stakeIncluded: false,
      unattendedPollingAuthorized: false
    },
    gameWindow: {
      dates: cloneJson(candidatePayload.gameWindow?.dates ?? []),
      sports: ["mlb"],
      sources: (
        Array.isArray(candidatePayload.gameWindow?.sources)
          ? candidatePayload.gameWindow.sources
          : []
      ).map((source) => ({
        sport: source?.sport ?? null,
        date: source?.date ?? null,
        official: source?.official ?? null,
        sourceUrl: source?.sourceUrl ?? null,
        games: source?.games ?? null,
        warning: source?.warning ?? null
      })),
      games: games.map(sanitizeGame),
      totals: {
        games: candidatePayload.gameWindow?.totals?.games ?? null,
        inProgress: candidatePayload.gameWindow?.totals?.inProgress ?? null,
        final: candidatePayload.gameWindow?.totals?.final ?? null,
        scheduled: candidatePayload.gameWindow?.totals?.scheduled ?? null
      }
    },
    candidates,
    generationMissingness: (
      Array.isArray(candidatePayload.skipped) ? candidatePayload.skipped : []
    ).map((entry) => ({
      gameId: entry?.gameId ?? null,
      sport: entry?.sport ?? null,
      status: entry?.status ?? null,
      playerId: entry?.playerId ?? null,
      statKey: entry?.statKey ?? null,
      reason: entry?.reason ?? null
    })),
    notes: [
      "This retained artifact is a research-only model-input snapshot, not a bet card.",
      "Candidate source sides are retained only to reconstruct one canonical over probability.",
      "No sportsbook price, edge, Kelly value, bankroll, ticket draft, stake, or bet authorization is retained.",
      "This artifact is complete only for the generator output it received.",
      "Current batter candidates come from capped active-roster slices, not confirmed full lineups."
    ]
  };
}

function assertArtifactContext(artifact, context) {
  if (!artifact || artifact.schemaVersion !== SHADOW_COHORT_SCHEMA_VERSION) {
    throw new ShadowCohortError(
      "INVALID_ARTIFACT",
      `Shadow cohort artifact must use schema ${SHADOW_COHORT_SCHEMA_VERSION}.`
    );
  }
  if (artifact.artifactType !== "mlb_side_normalized_shadow_cohort") {
    throw new ShadowCohortError(
      "INVALID_ARTIFACT",
      "Shadow cohort artifact has an unsupported artifact type."
    );
  }

  const digest = requireIdentity(context?.artifactDigest, "artifactDigest");

  if (!DIGEST_PATTERN.test(digest)) {
    throw new ShadowCohortError(
      "INVALID_ARTIFACT_DIGEST",
      "artifactDigest must be a lowercase SHA-256 digest."
    );
  }
  if (digest !== contentDigest(artifact)) {
    throw new ShadowCohortError(
      "ARTIFACT_DIGEST_MISMATCH",
      "artifactDigest does not match the canonical retained artifact."
    );
  }

  return {
    digest,
    locator: requireIdentity(context?.artifactLocator, "artifactLocator"),
    capturedAt: requireTimestamp(artifact.capturedAt, "artifact.capturedAt")
  };
}

function candidateIdentity(candidate, descriptor) {
  const line = requireFinite(candidate?.line, "candidate.line");

  if (line < 0 || !Number.isInteger(line * 2) || Number.isInteger(line)) {
    throw new ShadowCohortError(
      "INVALID_LINE",
      "candidate.line must be a non-negative half-unit threshold."
    );
  }

  const eventId = requireIdentity(candidate?.gameId, "candidate.gameId");
  const participantId = requireIdentity(candidate?.player?.id, "candidate.player.id");

  if (!/^\d+$/.test(eventId)) {
    throw new ShadowCohortError(
      "INVALID_MLB_EVENT_ID",
      "candidate.gameId must be a numeric MLB game identifier."
    );
  }
  if (!/^\d+$/.test(participantId)) {
    throw new ShadowCohortError(
      "INVALID_MLB_PARTICIPANT_ID",
      "candidate.player.id must be a numeric MLB player identifier."
    );
  }

  return {
    identityVersion: "mlb_shadow_evaluation_v1",
    eventId,
    marketFamily: descriptor.marketFamily,
    participantId,
    side: "over",
    line,
    modelId: requireIdentity(candidate?.prediction?.model, "candidate.prediction.model"),
    modelVersion: "1.0.0"
  };
}

function matchupTeams(game, candidate) {
  return {
    homeTeam: game?.home?.name ?? (
      candidate?.player?.teamName === candidate?.matchup?.split(" at ")?.[1]
        ? candidate.player.teamName
        : null
    ),
    awayTeam: game?.away?.name ?? (
      candidate?.player?.teamName === candidate?.matchup?.split(" at ")?.[0]
        ? candidate.player.teamName
        : null
    )
  };
}

function riskFlags(candidate) {
  const inherited = Array.isArray(candidate?.riskFlags)
    ? candidate.riskFlags.map((flag) => cloneJson(flag))
    : [];

  return [
    ...inherited,
    {
      code: "NO_SPORTSBOOK_PRICE",
      severity: "high",
      message: "This cohort intentionally contains no sportsbook price or opposite price."
    },
    {
      code: "MODEL_DERIVED_THRESHOLD",
      severity: "medium",
      message: "The half-unit outcome threshold was generated from the model mean, not captured from a sportsbook."
    },
    {
      code: "RESEARCH_ONLY_NO_STAKE",
      severity: "high",
      message: "This record cannot authorize a wager and contains no stake."
    }
  ];
}

function buildShadowEvaluationRecord(candidate, game, artifact, context = {}) {
  if (candidate?.sport !== "mlb") {
    throw new ShadowCohortError(
      "UNSUPPORTED_SPORT",
      "Shadow cohort capture currently accepts MLB candidates only."
    );
  }

  const descriptor = MARKET_FAMILIES[candidate?.statKey];

  if (!descriptor) {
    throw new ShadowCohortError(
      "UNSUPPORTED_MARKET",
      `Unsupported MLB shadow market: ${candidate?.statKey ?? "unknown"}.`
    );
  }
  if (candidate.statKey === "strikeOuts" && candidate.statGroup !== "pitching") {
    throw new ShadowCohortError(
      "UNSUPPORTED_MARKET",
      "Only pitcher strikeout candidates are supported by this cohort schema."
    );
  }

  const artifactContext = assertArtifactContext(artifact, context);
  const identity = candidateIdentity(candidate, descriptor);
  const captureIdentity = {
    ...identity,
    artifactCapturedAt: artifactContext.capturedAt,
    artifactDigest: artifactContext.digest,
    calculationVersion: SHADOW_CALCULATION_VERSION,
    codeVersion: context.codeVersion ?? null
  };
  const clientEventId = deterministicUuid(captureIdentity);
  const eventStart = requireTimestamp(candidate.gameDate, "candidate.gameDate");

  if (!game) {
    throw new ShadowCohortError(
      "MISSING_SCHEDULE_GAME",
      `Candidate ${candidate.id ?? identity.participantId} has no matching retained schedule game.`
    );
  }

  const gameStart = requireTimestamp(game?.gameDate, "game.gameDate");
  const sourceTime = requireTimestamp(
    candidate?.stats?.fetchedAt ?? candidate?.audit?.sourceFetchedAt,
    "candidate.stats.fetchedAt"
  );

  if (
    game?.sport !== "mlb"
    || String(game?.id ?? "") !== identity.eventId
    || gameStart !== eventStart
    || game?.status !== candidate.status
  ) {
    throw new ShadowCohortError(
      "CANDIDATE_GAME_MISMATCH",
      `Candidate ${candidate.id ?? identity.participantId} does not match its retained schedule game.`
    );
  }
  if (!ACTIONABLE_MLB_STATUSES.has(game.status)) {
    throw new ShadowCohortError(
      "GAME_NOT_ACTIONABLE",
      `Candidate ${candidate.id ?? identity.participantId} is not in an actionable pregame status.`
    );
  }
  if (candidate?.prediction?.line !== candidate.line) {
    throw new ShadowCohortError(
      "CANDIDATE_LINE_MISMATCH",
      `Candidate ${candidate.id ?? identity.participantId} has inconsistent model and market thresholds.`
    );
  }

  if (Date.parse(artifactContext.capturedAt) >= Date.parse(eventStart)) {
    throw new ShadowCohortError(
      "CAPTURE_NOT_PRESTART",
      `Candidate ${candidate.id ?? identity.participantId} was not frozen before event start.`
    );
  }
  if (Date.parse(sourceTime) > Date.parse(artifactContext.capturedAt)) {
    throw new ShadowCohortError(
      "SOURCE_AFTER_CAPTURE",
      `Candidate ${candidate.id ?? identity.participantId} has source evidence after capture time.`
    );
  }

  const probability = verifiedCanonicalOverProbability(candidate);
  const teams = matchupTeams(game, candidate);
  const participantName = requireIdentity(
    candidate?.player?.name,
    "candidate.player.name"
  );
  const sourceSide = String(candidate.prediction.side).toLowerCase();
  const configurationDigest = contentDigest({
    calculationVersion: SHADOW_CALCULATION_VERSION,
    canonicalSide: "over",
    cohortDefinition: artifact.cohortDefinition,
    identity,
    recentWeight: descriptor.recentWeight,
    captureIdentity,
    sourceSide,
    thresholdOrigin: "model_derived_half_unit",
    thresholdRule: "max_0_5_floor_blended_mean_plus_0_5"
  });

  return createEvaluationRecord({
    origin: {
      channel: "shadow_capture_cli",
      actorType: "operator",
      sessionId: `shadow_cohort_${artifactContext.digest.slice(0, 16)}`,
      requestId: candidate.id ?? clientEventId
    },
    event: {
      sport: "mlb",
      league: "MLB",
      eventId: identity.eventId,
      startTime: eventStart,
      homeTeam: teams.homeTeam,
      awayTeam: teams.awayTeam
    },
    market: {
      marketFamily: identity.marketFamily,
      marketType: descriptor.marketType,
      participantId: identity.participantId,
      participantName,
      selection: `${participantName} over ${identity.line} ${descriptor.statLabel} — shadow outcome label`,
      side: "over",
      line: identity.line
    },
    price: {
      sportsbook: null,
      marketOdds: null,
      oppositeOdds: null,
      priceCapturedAt: null,
      priceSourceTime: null
    },
    sources: [{
      provider: "mlb_official_derived",
      sourceType: "retained_shadow_cohort_artifact",
      sourceLocator: artifactContext.locator,
      parserVersion: SHADOW_CALCULATION_VERSION,
      capturedAt: artifactContext.capturedAt,
      sourceTime,
      digest: artifactContext.digest,
      freshness: "prestart",
      verificationStatus: "official_context_only"
    }],
    model: {
      modelId: identity.modelId,
      modelVersion: identity.modelVersion,
      probabilityMethod: "poisson_count",
      modelStatus: "research_only",
      calibrationReportId: null,
      trainingCutoff: null,
      sampleSize: null
    },
    probability: {
      rawModelProbability: probability,
      adjustedProbability: null,
      marketImpliedProbability: null,
      marketNoVigProbability: null
    },
    edge: {
      fairEdge: null,
      priceEdge: null,
      expectedValueRoi: null,
      kellyFraction: null
    },
    stake: {
      recommendedStake: null,
      bankroll: null,
      stakePolicyVersion: null
    },
    decision: {
      verdict: "WAIT",
      permission: "PRICE_CHECK_ONLY",
      reasons: [
        "Side-normalized prospective outcome capture only.",
        "Canonical over probability retained for later official-result scoring.",
        "No sportsbook price, edge, stake, or betting authorization exists."
      ],
      riskFlags: riskFlags(candidate),
      gateResults: [
        {
          gate: "prestart_capture",
          passed: true,
          reasonCode: null
        },
        {
          gate: "side_normalized_to_over",
          passed: true,
          reasonCode: null
        },
        {
          gate: "sportsbook_price",
          passed: false,
          reasonCode: "SPORTSBOOK_PRICE_INTENTIONALLY_ABSENT"
        },
        {
          gate: "bet_authorization",
          passed: false,
          reasonCode: "RESEARCH_ONLY"
        }
      ]
    },
    audit: {
      codeVersion: context.codeVersion ?? null,
      configurationDigest,
      calculationVersion: SHADOW_CALCULATION_VERSION,
      evidenceCompleteness: "official_context_projection_no_market_price",
      warnings: [
        "This row can support outcome-only diagnostics after official settlement.",
        "It cannot enter full calibration or promotion without exact verified closing-price evidence.",
        "The threshold is model-derived and must not be represented as a sportsbook market line.",
        "The current generator uses capped active-roster batter inputs rather than confirmed full lineups."
      ]
    }
  }, {
    clientEventId,
    createdAt: artifactContext.capturedAt
  });
}

function preflightShadowCohort(artifact, context = {}) {
  assertArtifactContext(artifact, context);
  const games = new Map(
    (Array.isArray(artifact.gameWindow?.games) ? artifact.gameWindow.games : [])
      .filter((game) => game?.sport === "mlb")
      .map((game) => [String(game.id), game])
  );
  const candidates = Array.isArray(artifact.candidates) ? artifact.candidates : [];
  const records = candidates.map((candidate) => (
    buildShadowEvaluationRecord(
      candidate,
      games.get(String(candidate?.gameId)) ?? null,
      artifact,
      context
    )
  ));
  const recordIds = new Set();

  for (const record of records) {
    if (recordIds.has(record.id)) {
      throw new ShadowCohortError(
        "DUPLICATE_CANDIDATE_IDENTITY",
        `Shadow cohort contains duplicate candidate identity ${record.id}.`
      );
    }
    recordIds.add(record.id);
  }
  const eligibleEventIds = [...games.values()]
    .filter((game) => ACTIONABLE_MLB_STATUSES.has(game.status))
    .map((game) => String(game.id))
    .sort();
  const representedEventIds = [...new Set(records.map((record) => record.event.eventId))].sort();
  const represented = new Set(representedEventIds);

  return {
    records,
    coverage: {
      eligibleEventIds,
      representedEventIds,
      missingEventIds: eligibleEventIds.filter((eventId) => !represented.has(eventId)),
      allEligibleEventsRepresented: (
        eligibleEventIds.length > 0
        && eligibleEventIds.every((eventId) => represented.has(eventId))
      )
    },
    generationMissingness: cloneJson(artifact.generationMissingness ?? [])
  };
}

async function captureShadowCohort(artifact, options = {}) {
  const preflight = preflightShadowCohort(artifact, options);
  const results = [];

  if (options.dryRun === true) {
    return {
      artifactDigest: options.artifactDigest,
      artifactLocator: options.artifactLocator,
      dryRun: true,
      candidates: preflight.records.length,
      appended: 0,
      existing: 0,
      coverage: preflight.coverage,
      generationMissingness: preflight.generationMissingness,
      recordReferences: preflight.records.map((record) => ({
        id: record.id,
        contentDigest: record.contentDigest
      }))
    };
  }

  const appendRecordImpl = options.appendRecordImpl ?? appendAuthoritativeRecord;

  for (const record of preflight.records) {
    const result = await appendRecordImpl(record, {
      ledgerPath: options.ledgerPath ?? options.logPath,
      outboxPath: options.outboxPath,
      fsImpl: options.fsImpl,
      outboxFsImpl: options.outboxFsImpl
    });
    results.push(result);
  }

  return {
    artifactDigest: options.artifactDigest,
    artifactLocator: options.artifactLocator,
    dryRun: false,
    candidates: preflight.records.length,
    appended: results.filter((result) => result.appended === true).length,
    existing: results.filter((result) => result.appended === false).length,
    coverage: preflight.coverage,
    generationMissingness: preflight.generationMissingness,
    syncFailures: results.filter((result) => result.syncError).map((result) => ({
      id: result.id,
      syncError: cloneJson(result.syncError)
    }))
  };
}

module.exports = {
  MARKET_FAMILIES,
  SHADOW_CALCULATION_VERSION,
  SHADOW_COHORT_SCHEMA_VERSION,
  ShadowCohortError,
  buildShadowEvaluationRecord,
  canonicalOverProbability,
  captureShadowCohort,
  createShadowCohortArtifact,
  deterministicUuid,
  preflightShadowCohort,
  verifiedCanonicalOverProbability
};
