const { contentDigest } = require("../audit/canonical-json.js");
const { appendPredictionOutcome } = require("../audit/evidence-ledger.js");
const { getEvidenceQueue } = require("../audit/evidence-queue.js");
const { safeErrorMessage } = require("../config/secrets.js");
const { fetchJson } = require("./fetch-json.js");

const MLB_LIVE_FEED_ROOT = "https://statsapi.mlb.com/api/v1.1/game";

function normalizedToken(value) {
  return typeof value === "string"
    ? value.toLowerCase().replace(/[^a-z0-9]/g, "")
    : "";
}

function validTimestamp(value) {
  const date = new Date(value ?? Date.now());
  if (!Number.isFinite(date.getTime())) {
    throw new TypeError("Official outcome resolution requires a valid now timestamp.");
  }
  return date.toISOString();
}

function terminalGameStatus(feed) {
  const status = feed?.gameData?.status ?? {};
  const values = [
    status.abstractGameState,
    status.detailedState,
    status.codedGameState
  ].map(normalizedToken);

  return values.some((value) => [
    "final",
    "gameover",
    "completedearly",
    "f"
  ].includes(value));
}

function numericStat(value) {
  if (typeof value === "number" && Number.isFinite(value)) {
    return value;
  }
  if (typeof value === "string" && value.trim() && Number.isFinite(Number(value))) {
    return Number(value);
  }
  return null;
}

function marketStatDescriptor(market = {}) {
  const family = normalizedToken(market.marketFamily);
  const type = normalizedToken(market.marketType);

  if (family === "pitcherstrikeouts" || (!family && type === "strikeouts")) {
    return { statGroup: "pitching", statKey: "strikeOuts", unit: "strikeouts" };
  }
  if (family === "batterstrikeouts") {
    return { statGroup: "batting", statKey: "strikeOuts", unit: "strikeouts" };
  }
  if (family === "pitcherearnedruns" || (!family && type === "earnedruns")) {
    return { statGroup: "pitching", statKey: "earnedRuns", unit: "earned_runs" };
  }
  if (family === "pitcherwalks" || (!family && type === "baseonballs")) {
    return { statGroup: "pitching", statKey: "baseOnBalls", unit: "walks" };
  }
  if (family === "pitcherhitsallowed") {
    return { statGroup: "pitching", statKey: "hits", unit: "hits_allowed" };
  }
  if (family === "batterhits" || (!family && type === "hits")) {
    return { statGroup: "batting", statKey: "hits", unit: "hits" };
  }
  if (family === "battertotalbases" || (!family && type === "totalbases")) {
    return { statGroup: "batting", statKey: "totalBases", unit: "total_bases" };
  }
  if (family === "batterrunsscored" || (!family && type === "runs")) {
    return { statGroup: "batting", statKey: "runs", unit: "runs" };
  }
  if (family === "batterrbis" || (!family && (type === "rbi" || type === "rbis"))) {
    return { statGroup: "batting", statKey: "rbi", unit: "rbis" };
  }

  return null;
}

function findPlayer(feed, participantId) {
  const teams = feed?.liveData?.boxscore?.teams ?? {};
  const expectedId = String(participantId);

  for (const side of ["away", "home"]) {
    const players = teams?.[side]?.players ?? {};
    const direct = players[`ID${expectedId}`];
    if (direct) {
      return direct;
    }

    const fallback = Object.values(players).find((player) => (
      String(player?.person?.id ?? "") === expectedId
    ));
    if (fallback) {
      return fallback;
    }
  }

  return null;
}

function finalScores(feed) {
  const homeScore = feed?.liveData?.linescore?.teams?.home?.runs;
  const awayScore = feed?.liveData?.linescore?.teams?.away?.runs;

  if (!Number.isSafeInteger(homeScore) || homeScore < 0) {
    return null;
  }
  if (!Number.isSafeInteger(awayScore) || awayScore < 0) {
    return null;
  }

  return { homeScore, awayScore };
}

function outcomeForMarket(market, observedValue) {
  const side = normalizedToken(market?.side);
  const line = numericStat(market?.line);

  if (!Number.isFinite(line) || !["over", "under"].includes(side)) {
    return null;
  }
  if (observedValue === line) {
    return "push";
  }
  if (side === "over") {
    return observedValue > line ? "win" : "loss";
  }
  return observedValue < line ? "win" : "loss";
}

function emptySummary() {
  return {
    inspected: 0,
    appended: 0,
    alreadyResolved: 0,
    awaitingFinal: 0,
    unsupported: 0,
    failed: 0,
    failures: []
  };
}

function recordFailure(summary, item, error) {
  summary.failed += 1;
  summary.failures.push({
    evaluationId: item?.evaluationId ?? null,
    eventId: item?.event?.eventId ?? null,
    message: safeErrorMessage(error)
  });
}

async function resolveOfficialMlbOutcomes(options = {}) {
  const now = validTimestamp(options.now);
  const nowMs = Date.parse(now);
  const fetchJsonImpl = options.fetchJsonImpl ?? fetchJson;
  const appendOutcomeImpl = options.appendPredictionOutcomeImpl ?? appendPredictionOutcome;
  const queue = await getEvidenceQueue({
    logPath: options.logPath,
    ledgerPath: options.ledgerPath,
    registryPath: options.registryPath,
    fsImpl: options.fsImpl,
    status: "all",
    limit: 500,
    now
  });
  const summary = emptySummary();
  const feeds = new Map();

  if (queue.writeBlocked) {
    recordFailure(summary, null, new Error(
      "Official outcome resolution is blocked by an active authoritative-ledger integrity failure."
    ));
    return summary;
  }

  for (const item of queue.items) {
    const sport = normalizedToken(item.event?.sport);
    const league = normalizedToken(item.event?.league);
    const eventStartMs = Date.parse(item.event?.startTime ?? "");

    if (sport !== "mlb" && league !== "mlb") {
      continue;
    }
    if (!Number.isFinite(eventStartMs) || eventStartMs > nowMs) {
      continue;
    }

    summary.inspected += 1;
    if (item.latestOutcome) {
      summary.alreadyResolved += 1;
      continue;
    }

    const eventId = String(item.event?.eventId ?? "").trim();
    const participantId = String(item.market?.participantId ?? "").trim();
    const descriptor = marketStatDescriptor(item.market);
    const side = normalizedToken(item.market?.side);
    const line = numericStat(item.market?.line);

    if (
      !/^\d+$/.test(eventId)
      || !/^\d+$/.test(participantId)
      || !descriptor
      || !["over", "under"].includes(side)
      || line === null
    ) {
      summary.unsupported += 1;
      continue;
    }

    const sourceLocator = `${MLB_LIVE_FEED_ROOT}/${eventId}/feed/live`;

    try {
      if (!feeds.has(eventId)) {
        feeds.set(eventId, Promise.resolve(fetchJsonImpl(sourceLocator)));
      }
      const feed = await feeds.get(eventId);

      if (!terminalGameStatus(feed)) {
        summary.awaitingFinal += 1;
        continue;
      }

      const scores = finalScores(feed);
      const player = findPlayer(feed, participantId);
      const observedValue = numericStat(
        player?.stats?.[descriptor.statGroup]?.[descriptor.statKey]
      );
      const resolvedOutcome = outcomeForMarket(item.market, observedValue);

      if (!scores || observedValue === null || !resolvedOutcome) {
        summary.unsupported += 1;
        continue;
      }

      const artifact = {
        eventId,
        gamePk: feed?.gamePk ?? null,
        status: feed?.gameData?.status ?? null,
        scores,
        participant: {
          id: player?.person?.id ?? participantId,
          name: player?.person?.fullName ?? item.market?.participantName ?? null
        },
        statistic: {
          group: descriptor.statGroup,
          key: descriptor.statKey,
          unit: descriptor.unit,
          value: observedValue
        }
      };

      await appendOutcomeImpl({
        evaluationId: item.evaluationId,
        supersedesId: item.outcomeSupersedesId ?? null,
        outcome: resolvedOutcome,
        resolvedAt: now,
        eventResult: {
          status: "final",
          homeScore: scores.homeScore,
          awayScore: scores.awayScore
        },
        marketResult: {
          observedValue,
          unit: descriptor.unit
        },
        source: {
          provider: "mlb_official",
          sourceType: "official_box_score",
          sourceLocator,
          capturedAt: now,
          sourceTime: now,
          digest: contentDigest(artifact),
          verificationStatus: "verified_official_result"
        },
        notes: ["Automatically resolved from the official MLB final box score."]
      }, {
        logPath: options.logPath,
        ledgerPath: options.ledgerPath,
        outboxPath: options.outboxPath,
        fsImpl: options.fsImpl,
        outboxFsImpl: options.outboxFsImpl,
        appendRecordImpl: options.appendRecordImpl,
        context: { createdAt: now }
      });
      summary.appended += 1;
    } catch (error) {
      feeds.delete(eventId);
      recordFailure(summary, item, error);
    }
  }

  return summary;
}

module.exports = {
  resolveOfficialMlbOutcomes
};
