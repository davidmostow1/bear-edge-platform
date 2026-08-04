const DEFAULT_MAX_CAPTURE_AGE_MS = 5 * 60 * 1000;

function normalizeIdentity(value) {
  return String(value ?? "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function teamMatchKey(value) {
  const words = normalizeIdentity(value).split(" ").filter(Boolean);
  const nickname = words.at(-1) ?? "";

  if (nickname === "sox" && words.length >= 2) {
    return words.slice(-2).join(" ");
  }

  return nickname;
}

function eventTeamsMatch(candidate, capture) {
  const capturedTeams = [
    teamMatchKey(capture.event?.away),
    teamMatchKey(capture.event?.home)
  ].sort();
  const candidateTeams = [
    teamMatchKey(candidate?.player?.teamName),
    teamMatchKey(candidate?.player?.opponentName)
  ].sort();

  return capturedTeams.every(Boolean)
    && candidateTeams.every(Boolean)
    && capturedTeams.join("|") === candidateTeams.join("|");
}

function eventTimeMatches(candidate, capture) {
  const eventStartMs = Date.parse(candidate?.gameDate);
  const captureMs = Date.parse(capture?.capturedAt);

  if (!Number.isFinite(eventStartMs) || !Number.isFinite(captureMs)) {
    return false;
  }

  const differenceMs = captureMs - eventStartMs;

  return differenceMs >= -3 * 60 * 60 * 1000
    && differenceMs <= 5 * 60 * 60 * 1000;
}

function candidateIdentity(candidate) {
  return {
    sport: normalizeIdentity(candidate?.sport),
    playerName: normalizeIdentity(candidate?.player?.name),
    statKey: String(candidate?.statKey ?? ""),
    line: Number(candidate?.line),
    side: normalizeIdentity(candidate?.lean)
  };
}

function marketMatchesCandidate(market, candidate, capture) {
  const identity = candidateIdentity(candidate);

  return market.marketType === "player_prop"
    && market.period === "game"
    && normalizeIdentity(capture.event?.sport) === identity.sport
    && eventTimeMatches(candidate, capture)
    && eventTeamsMatch(candidate, capture)
    && normalizeIdentity(market.playerName) === identity.playerName
    && market.statKey === identity.statKey
    && market.line === identity.line
    && normalizeIdentity(market.side) === identity.side;
}

function evidenceFields(capture) {
  return {
    captureId: capture.captureId,
    capturedAt: capture.capturedAt,
    sourceUrl: capture.sourceUrl,
    screenshotSha256: capture.evidence?.screenshotSha256 ?? null,
    visibleTextSha256: capture.evidence?.visibleTextSha256 ?? null,
    evidenceStatus: "captured_unverified",
    betCallPermission: "PRICE_CHECK_ONLY",
    authorizedStake: 0
  };
}

function matchDirectScreenCaptureCandidates(input = {}) {
  const capture = input.capture;
  const candidates = Array.isArray(input.candidates) ? input.candidates : [];
  const now = input.now instanceof Date ? input.now : new Date();
  const maxCaptureAgeMs = Number.isFinite(input.maxCaptureAgeMs) && input.maxCaptureAgeMs >= 0
    ? input.maxCaptureAgeMs
    : DEFAULT_MAX_CAPTURE_AGE_MS;

  if (!capture || typeof capture !== "object") {
    throw new Error("capture is required.");
  }
  if (!Number.isFinite(now.getTime())) {
    throw new Error("now must be a valid Date.");
  }

  const capturedAtMs = Date.parse(capture.capturedAt);
  const ageMs = now.getTime() - capturedAtMs;

  if (!Number.isFinite(capturedAtMs) || ageMs < 0 || ageMs > maxCaptureAgeMs) {
    const reasonCode = ageMs < 0 ? "FUTURE_CAPTURE" : "STALE_CAPTURE";

    return {
      captureId: capture.captureId,
      freshness: {
        status: reasonCode === "FUTURE_CAPTURE" ? "clock_error" : "stale",
        ageMs: Number.isFinite(ageMs) ? ageMs : null,
        maxCaptureAgeMs
      },
      summary: {
        candidates: candidates.length,
        matches: 0,
        waitEvidence: 0,
        unmatched: candidates.length
      },
      matches: [],
      waitEvidence: [],
      unmatched: candidates.map((candidate) => ({
        candidateId: candidate.id,
        selection: candidate.ticketDraft?.selection ?? candidate.id,
        reasonCode
      })),
      warnings: [
        reasonCode === "FUTURE_CAPTURE"
          ? "The retained screen timestamp is ahead of the matching clock; no price match is permitted."
          : `The retained screen is stale after ${maxCaptureAgeMs} ms; no price match is permitted.`,
        "Exact screen matches remain captured_unverified and PRICE_CHECK_ONLY."
      ]
    };
  }

  const matches = [];
  const waitEvidence = [];
  const unmatched = [];

  for (const candidate of candidates) {
    const matchingMarkets = (capture.markets ?? []).filter(
      (entry) => marketMatchesCandidate(entry, candidate, capture)
    );

    if (matchingMarkets.length === 0) {
      unmatched.push({
        candidateId: candidate.id,
        selection: candidate.ticketDraft?.selection ?? candidate.id,
        reasonCode: "NO_EXACT_CAPTURE_MATCH"
      });
      continue;
    }
    if (matchingMarkets.length > 1) {
      unmatched.push({
        candidateId: candidate.id,
        selection: candidate.ticketDraft?.selection ?? candidate.id,
        reasonCode: "AMBIGUOUS_EVENT_MATCH"
      });
      continue;
    }

    const [market] = matchingMarkets;

    const matchingCandidates = candidates.filter(
      (entry) => marketMatchesCandidate(market, entry, capture)
    );

    if (matchingCandidates.length > 1) {
      unmatched.push({
        candidateId: candidate.id,
        selection: candidate.ticketDraft?.selection ?? candidate.id,
        reasonCode: "AMBIGUOUS_EVENT_MATCH"
      });
      continue;
    }

    const shared = {
      candidateId: candidate.id,
      selection: candidate.ticketDraft?.selection ?? candidate.id,
      marketOdds: market.americanOdds,
      oppositeOdds: market.oppositeAmericanOdds,
      side: market.side,
      line: market.line,
      playerName: market.playerName,
      statKey: market.statKey,
      ...evidenceFields(capture)
    };

    if (market.pairStatus !== "complete" || market.oppositeAmericanOdds === null) {
      waitEvidence.push({
        ...shared,
        status: "WAIT",
        reasonCode: "MISSING_OPPOSITE_PRICE"
      });
      continue;
    }

    matches.push({
      ...shared,
      status: "PRICE_MATCHED"
    });
  }

  return {
    captureId: capture.captureId,
    freshness: {
      status: "fresh",
      ageMs,
      maxCaptureAgeMs
    },
    summary: {
      candidates: candidates.length,
      matches: matches.length,
      waitEvidence: waitEvidence.length,
      unmatched: unmatched.length
    },
    matches,
    waitEvidence,
    unmatched,
    warnings: [
      "Exact screen matches remain captured_unverified and PRICE_CHECK_ONLY.",
      "Game-line markets are retained as context until an independent registered model supports them."
    ]
  };
}

module.exports = {
  matchDirectScreenCaptureCandidates
};
