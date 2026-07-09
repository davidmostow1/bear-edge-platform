function toConfidenceTier(score) {
  if (score >= 0.8) {
    return "high";
  }

  if (score >= 0.55) {
    return "medium";
  }

  return "low";
}

function buildResearchPacket(ticket, legResults) {
  const sources = legResults.map((leg) => ({
    legId: leg.id,
    provider: leg.source.provider,
    official: leg.source.official,
    sourceUrl: leg.source.sourceUrl,
    fetchedAt: leg.source.fetchedAt,
    sourceAgeMinutes: leg.derived.sourceAgeMinutes,
    playerName: leg.source.playerName,
    teamName: leg.source.teamName,
    statKey: leg.source.statKey,
    seasonPerGame: leg.source.season.perGame,
    recentPerGame: leg.source.recent.perGame,
    currentGameValue: leg.derived.currentGameValue,
    remainingOpportunityFactor: leg.derived.remainingOpportunityFactor,
    liveGameStatus: leg.derived.liveGameStatus,
    gamePk: leg.source.liveGame?.gamePk ?? null,
    cache: leg.source.cache ?? {
      hit: false,
      stale: false
    }
  }));
  const staleCount = sources.filter((source) => source.sourceAgeMinutes > ticket.livePolicy.maxSourceAgeMinutes).length;
  const cacheHitCount = sources.filter((source) => source.cache.hit).length;
  const officialCount = sources.filter((source) => source.official).length;
  let confidenceScore = 1;

  confidenceScore -= staleCount * 0.35;
  confidenceScore -= (sources.length - officialCount) * 0.15;
  confidenceScore -= cacheHitCount > 0 ? 0 : 0.05;
  confidenceScore = Math.max(0, Math.min(1, confidenceScore));

  const notes = [];

  if (staleCount > 0) {
    notes.push("One or more source snapshots exceeded the configured freshness window.");
  }

  if (officialCount !== sources.length) {
    notes.push("One or more sources are not marked official.");
  }

  if (ticket.kind === "parlay") {
    notes.push("Parlay confidence includes multiplicative variance across legs.");
  }

  if (sources.some((source) => source.gamePk !== null)) {
    notes.push("One or more MLB legs used official current-game stats to adjust the remaining distribution.");
  }

  return {
    generatedAt: new Date().toISOString(),
    ticketKind: ticket.kind,
    confidence: {
      score: confidenceScore,
      tier: toConfidenceTier(confidenceScore)
    },
    sources,
    notes
  };
}

module.exports = {
  buildResearchPacket
};
