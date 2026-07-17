const { fetchGamesForWindow } = require("./schedule.js");
const { estimateCountProbability } = require("./estimate-prop.js");
const { fetchMlbPlayerPropSnapshot, fetchMlbRoster } = require("./providers/mlb.js");
const { fetchNhlPlayerPropSnapshot, fetchNhlRoster } = require("./providers/nhl.js");

const ACTIONABLE_MLB_STATUSES = new Set(["Scheduled", "Pre-Game", "Warmup", "Preview"]);
const ACTIONABLE_NHL_STATUSES = new Set(["FUT", "PRE", "Scheduled", "Pre-Game", "Preview"]);
const MLB_BATTER_PROP_CONFIGS = Object.freeze([
  {
    statKey: "totalBases",
    statLabel: "total bases",
    recentWeight: 0.5
  },
  {
    statKey: "hits",
    statLabel: "hits",
    recentWeight: 0.45
  },
  {
    statKey: "runs",
    statLabel: "runs",
    recentWeight: 0.42
  }
]);

function roundToHalf(value) {
  return Math.max(0.5, Math.floor(value) + 0.5);
}

function makeCandidateId(game, side, playerId, statKey) {
  return `${game.sport}-${game.id}-${side}-${playerId}-${statKey}`.toLowerCase();
}

function isActionableMlbGame(game) {
  return game.sport === "mlb" && ACTIONABLE_MLB_STATUSES.has(game.status);
}

function isActionableNhlGame(game) {
  return game.sport === "nhl" && ACTIONABLE_NHL_STATUSES.has(game.status);
}

function probabilityToAmericanOdds(probability) {
  const bounded = Math.min(0.99, Math.max(0.01, probability));

  if (bounded >= 0.5) {
    return Math.round(-100 * bounded / (1 - bounded));
  }

  return Math.round(100 * (1 - bounded) / bounded);
}

function pitcherEntriesForGame(game) {
  return [
    {
      side: "away",
      team: game.away,
      opponent: game.home
    },
    {
      side: "home",
      team: game.home,
      opponent: game.away
    }
  ].filter((entry) => entry.team?.probablePitcher?.id && entry.team?.probablePitcher?.name);
}

async function batterEntriesForGame(game, options = {}) {
  const maxBattersPerTeam = Number.isInteger(options.maxMlbBattersPerTeam) && options.maxMlbBattersPerTeam > 0
    ? Math.min(options.maxMlbBattersPerTeam, 4)
    : 1;
  const teams = [
    {
      side: "away",
      team: game.away,
      opponent: game.home
    },
    {
      side: "home",
      team: game.home,
      opponent: game.away
    }
  ].filter((entry) => entry.team?.id);
  const entries = [];

  for (const teamEntry of teams) {
    const roster = await fetchMlbRoster(teamEntry.team.id, options);
    const batters = roster.batters.slice(0, maxBattersPerTeam);

    for (const player of batters) {
      entries.push({
        ...teamEntry,
        player,
        rosterSourceUrl: roster.sourceUrl,
        rosterFetchedAt: roster.fetchedAt
      });
    }
  }

  return entries;
}

async function skaterEntriesForGame(game, options = {}) {
  const maxSkatersPerTeam = Number.isInteger(options.maxNhlSkatersPerTeam) && options.maxNhlSkatersPerTeam > 0
    ? Math.min(options.maxNhlSkatersPerTeam, 8)
    : 2;
  const teams = [
    {
      side: "away",
      team: game.away,
      opponent: game.home
    },
    {
      side: "home",
      team: game.home,
      opponent: game.away
    }
  ].filter((entry) => entry.team?.abbreviation);
  const entries = [];

  for (const teamEntry of teams) {
    const roster = await fetchNhlRoster(teamEntry.team.abbreviation, options);
    const skaters = roster.players
      .filter((player) => player.positionGroup !== "goalie")
      .slice(0, maxSkatersPerTeam);

    for (const player of skaters) {
      entries.push({
        ...teamEntry,
        player,
        rosterSourceUrl: roster.sourceUrl,
        rosterFetchedAt: roster.fetchedAt
      });
    }
  }

  return entries;
}

async function buildMlbBatterPropCandidate(game, batterEntry, propConfig, options = {}) {
  const batter = batterEntry.player;
  const recentLimit = options.batterRecentLimit ?? 10;
  const snapshot = await fetchMlbPlayerPropSnapshot(
    {
      playerId: batter.id,
      statGroup: "hitting",
      statKey: propConfig.statKey,
      recentLimit
    },
    options
  );
  const recentWeight = propConfig.recentWeight;
  const blendedMean = snapshot.season.perGame * (1 - recentWeight) + snapshot.recent.perGame * recentWeight;
  const line = roundToHalf(blendedMean);
  const lean = snapshot.recent.perGame >= snapshot.season.perGame ? "over" : "under";
  const selection = `${batter.name} ${lean} ${line} ${propConfig.statLabel}`;
  const modelProbability = estimateCountProbability({
    mean: blendedMean,
    line,
    side: lean
  });
  const fairAmericanOdds = probabilityToAmericanOdds(modelProbability);

  return {
    id: makeCandidateId(game, batterEntry.side, batter.id, propConfig.statKey),
    sport: "mlb",
    provider: "mlb",
    gameId: game.id,
    gameDate: game.gameDate,
    status: game.status,
    venue: game.venue,
    matchup: `${game.away?.name ?? "Away"} at ${game.home?.name ?? "Home"}`,
    player: {
      id: batter.id,
      name: batter.name,
      teamName: batterEntry.team?.name ?? null,
      opponentName: batterEntry.opponent?.name ?? null,
      positionName: batter.positionName,
      positionAbbreviation: batter.positionAbbreviation
    },
    marketType: "prop",
    statGroup: "hitting",
    statKey: propConfig.statKey,
    statLabel: propConfig.statLabel,
    line,
    lean,
    requiresManualOdds: true,
    verdict: "ODDS_NEEDED",
    riskFlags: [
      {
        code: "MISSING_MARKET_ODDS",
        severity: "high",
        message: "Enter real sportsbook odds before evaluating this candidate."
      },
      {
        code: "LINEUP_NOT_CONFIRMED",
        severity: "medium",
        message: "Batter candidate uses active roster order, not confirmed lineup spot or batting order."
      },
      {
        code: "HITTING_CONTEXT_LIMITED",
        severity: "medium",
        message: "Hitting estimate does not yet model handedness splits, opposing bullpen, weather, park adjustment, or umpire context."
      }
    ],
    stats: {
      seasonPerGame: snapshot.season.perGame,
      recentPerGame: snapshot.recent.perGame,
      blendedMean,
      recentLimit,
      sourceUrl: snapshot.sourceUrl,
      fetchedAt: snapshot.fetchedAt,
      rosterSourceUrl: batterEntry.rosterSourceUrl,
      rosterFetchedAt: batterEntry.rosterFetchedAt
    },
    prediction: {
      model: "poisson_count_v1",
      calibrationStatus: "research_only",
      side: lean,
      line,
      modelProbability,
      fairAmericanOdds,
      fairDecimalOdds: 1 / modelProbability,
      notes: [
        "Research probability only; final EV and Kelly require sportsbook odds.",
        "Uses official MLB season/recent hitter rates plus active roster data; confirmed lineup and batting order still required."
      ]
    },
    audit: {
      generatedFrom: "official_mlb_statsapi",
      oddsSource: "manual_required",
      evaluationReadiness: "blocked_until_market_odds",
      sourceUrl: snapshot.sourceUrl,
      sourceFetchedAt: snapshot.fetchedAt
    },
    ticketDraft: {
      kind: "single",
      selection,
      bankroll: options.bankroll ?? 1000,
      legs: [
        {
          id: `${batter.id}-${propConfig.statKey}`,
          label: selection,
          provider: "mlb",
          marketType: "prop",
          side: lean,
          line,
          marketOdds: null,
          source: {
            playerId: batter.id,
            statGroup: "hitting",
            statKey: propConfig.statKey,
            recentLimit
          }
        }
      ],
      livePolicy: {
        marketWeight: 0.35,
        recentWeight,
        maxSourceAgeMinutes: 20,
        kellyMultiplier: 0.12,
        maxBankrollFraction: 0.015,
        minStake: 5
      }
    }
  };
}

async function buildPitcherStrikeoutCandidate(game, pitcherEntry, options = {}) {
  const pitcher = pitcherEntry.team.probablePitcher;
  const recentLimit = options.recentLimit ?? 10;
  const snapshot = await fetchMlbPlayerPropSnapshot(
    {
      playerId: pitcher.id,
      statGroup: "pitching",
      statKey: "strikeOuts",
      recentLimit
    },
    options
  );
  const recentWeight = 0.45;
  const blendedMean = snapshot.season.perGame * (1 - recentWeight) + snapshot.recent.perGame * recentWeight;
  const line = roundToHalf(blendedMean);
  const lean = snapshot.recent.perGame >= snapshot.season.perGame ? "over" : "under";
  const selection = `${pitcher.name} ${lean} ${line} strikeouts`;
  const modelProbability = estimateCountProbability({
    mean: blendedMean,
    line,
    side: lean
  });
  const fairAmericanOdds = probabilityToAmericanOdds(modelProbability);

  return {
    id: makeCandidateId(game, pitcherEntry.side, pitcher.id, "strikeOuts"),
    sport: "mlb",
    provider: "mlb",
    gameId: game.id,
    gameDate: game.gameDate,
    status: game.status,
    venue: game.venue,
    matchup: `${game.away?.name ?? "Away"} at ${game.home?.name ?? "Home"}`,
    player: {
      id: pitcher.id,
      name: pitcher.name,
      teamName: pitcherEntry.team?.name ?? null,
      opponentName: pitcherEntry.opponent?.name ?? null
    },
    marketType: "prop",
    statKey: "strikeOuts",
    line,
    lean,
    requiresManualOdds: true,
    verdict: "ODDS_NEEDED",
    riskFlags: [
      {
        code: "MISSING_MARKET_ODDS",
        severity: "high",
        message: "Enter real sportsbook odds before evaluating this candidate."
      }
    ],
    stats: {
      seasonPerGame: snapshot.season.perGame,
      recentPerGame: snapshot.recent.perGame,
      blendedMean,
      recentLimit,
      sourceUrl: snapshot.sourceUrl,
      fetchedAt: snapshot.fetchedAt
    },
    prediction: {
      model: "poisson_count_v1",
      calibrationStatus: "research_only",
      side: lean,
      line,
      modelProbability,
      fairAmericanOdds,
      fairDecimalOdds: 1 / modelProbability,
      notes: [
        "Research probability only; final EV and Kelly require sportsbook odds.",
        "Uses season/recent pitcher strikeout rates without full umpire, lineup, weather, or bullpen context."
      ]
    },
    audit: {
      generatedFrom: "official_mlb_statsapi",
      oddsSource: "manual_required",
      evaluationReadiness: "blocked_until_market_odds",
      sourceUrl: snapshot.sourceUrl,
      sourceFetchedAt: snapshot.fetchedAt
    },
    ticketDraft: {
      kind: "single",
      selection,
      bankroll: options.bankroll ?? 1000,
      legs: [
        {
          id: `${pitcher.id}-strikeouts`,
          label: selection,
          provider: "mlb",
          marketType: "prop",
          side: lean,
          line,
          marketOdds: null,
          source: {
            playerId: pitcher.id,
            statGroup: "pitching",
            statKey: "strikeOuts",
            recentLimit
          }
        }
      ],
      livePolicy: {
        marketWeight: 0.4,
        recentWeight,
        maxSourceAgeMinutes: 20,
        kellyMultiplier: 0.15,
        maxBankrollFraction: 0.02,
        minStake: 5
      }
    }
  };
}

async function buildNhlShotsCandidate(game, skaterEntry, options = {}) {
  const skater = skaterEntry.player;
  const recentLimit = options.nhlRecentLimit ?? 5;
  const snapshot = await fetchNhlPlayerPropSnapshot(
    {
      playerId: skater.id,
      statKey: "shots",
      recentLimit
    },
    options
  );
  const recentWeight = 0.55;
  const blendedMean = snapshot.season.perGame * (1 - recentWeight) + snapshot.recent.perGame * recentWeight;
  const line = roundToHalf(blendedMean);
  const lean = snapshot.recent.perGame >= snapshot.season.perGame ? "over" : "under";
  const statLabel = "shots on goal";
  const selection = `${skater.name} ${lean} ${line} ${statLabel}`;
  const modelProbability = estimateCountProbability({
    mean: blendedMean,
    line,
    side: lean
  });
  const fairAmericanOdds = probabilityToAmericanOdds(modelProbability);

  return {
    id: makeCandidateId(game, skaterEntry.side, skater.id, "shots"),
    sport: "nhl",
    provider: "nhl",
    gameId: game.id,
    gameDate: game.gameDate,
    status: game.status,
    venue: game.venue,
    matchup: `${game.away?.name ?? "Away"} at ${game.home?.name ?? "Home"}`,
    player: {
      id: skater.id,
      name: skater.name,
      teamName: skaterEntry.team?.name ?? null,
      opponentName: skaterEntry.opponent?.name ?? null,
      positionGroup: skater.positionGroup,
      positionCode: skater.positionCode
    },
    marketType: "prop",
    statKey: "shots",
    statLabel,
    line,
    lean,
    requiresManualOdds: true,
    verdict: "ODDS_NEEDED",
    riskFlags: [
      {
        code: "MISSING_MARKET_ODDS",
        severity: "high",
        message: "Enter real sportsbook odds before evaluating this candidate."
      },
      {
        code: "NHL_CONTEXT_LIMITED",
        severity: "medium",
        message: "NHL shot estimate does not yet model line assignment, opponent goalie, power-play role, or scratches."
      }
    ],
    stats: {
      seasonPerGame: snapshot.season.perGame,
      recentPerGame: snapshot.recent.perGame,
      blendedMean,
      recentLimit,
      sourceUrl: snapshot.sourceUrl,
      fetchedAt: snapshot.fetchedAt,
      rosterSourceUrl: skaterEntry.rosterSourceUrl,
      rosterFetchedAt: skaterEntry.rosterFetchedAt
    },
    prediction: {
      model: "poisson_count_v1",
      calibrationStatus: "research_only",
      side: lean,
      line,
      modelProbability,
      fairAmericanOdds,
      fairDecimalOdds: 1 / modelProbability,
      notes: [
        "Research probability only; final EV and Kelly require sportsbook odds.",
        "Uses official NHL season/recent skater shot rates without full lineup, goalie, special-teams, or injury context."
      ]
    },
    audit: {
      generatedFrom: "official_nhl_api",
      oddsSource: "manual_required",
      evaluationReadiness: "blocked_until_market_odds",
      sourceUrl: snapshot.sourceUrl,
      sourceFetchedAt: snapshot.fetchedAt
    },
    ticketDraft: {
      kind: "single",
      selection,
      bankroll: options.bankroll ?? 1000,
      legs: [
        {
          id: `${skater.id}-shots`,
          label: selection,
          provider: "nhl",
          marketType: "prop",
          side: lean,
          line,
          marketOdds: null,
          source: {
            playerId: skater.id,
            statKey: "shots",
            recentLimit
          }
        }
      ],
      livePolicy: {
        marketWeight: 0.4,
        recentWeight,
        maxSourceAgeMinutes: 20,
        kellyMultiplier: 0.15,
        maxBankrollFraction: 0.02,
        minStake: 5
      }
    }
  };
}

async function generateResearchCandidates(options = {}) {
  const gameWindow = await fetchGamesForWindow(options);
  const candidates = [];
  const skipped = [];
  const maxCandidates = Number.isInteger(options.maxCandidates) && options.maxCandidates > 0
    ? options.maxCandidates
    : 20;

  for (const game of gameWindow.games) {
    if (candidates.length >= maxCandidates) {
      break;
    }

    if (game.sport === "mlb") {
      if (!isActionableMlbGame(game)) {
        skipped.push({
          gameId: game.id,
          sport: game.sport,
          status: game.status,
          reason: "Game is not in a pregame actionable state."
        });
        continue;
      }

      for (const pitcherEntry of pitcherEntriesForGame(game)) {
        if (candidates.length >= maxCandidates) {
          break;
        }

        try {
          candidates.push(await buildPitcherStrikeoutCandidate(game, pitcherEntry, options));
        } catch (error) {
          skipped.push({
            gameId: game.id,
            sport: game.sport,
            playerId: pitcherEntry.team?.probablePitcher?.id,
            reason: error.message
          });
        }
      }

      let batterEntries = [];

      try {
        batterEntries = await batterEntriesForGame(game, options);
      } catch (error) {
        skipped.push({
          gameId: game.id,
          sport: game.sport,
          reason: error.message
        });
        continue;
      }

      for (const batterEntry of batterEntries) {
        for (const propConfig of MLB_BATTER_PROP_CONFIGS) {
          if (candidates.length >= maxCandidates) {
            break;
          }

          try {
            candidates.push(await buildMlbBatterPropCandidate(game, batterEntry, propConfig, options));
          } catch (error) {
            skipped.push({
              gameId: game.id,
              sport: game.sport,
              playerId: batterEntry.player?.id,
              statKey: propConfig.statKey,
              reason: error.message
            });
          }
        }
      }

      continue;
    }

    if (game.sport === "nhl") {
      if (!isActionableNhlGame(game)) {
        skipped.push({
          gameId: game.id,
          sport: game.sport,
          status: game.status,
          reason: "Game is not in a pregame actionable state."
        });
        continue;
      }

      let skaterEntries = [];

      try {
        skaterEntries = await skaterEntriesForGame(game, options);
      } catch (error) {
        skipped.push({
          gameId: game.id,
          sport: game.sport,
          reason: error.message
        });
        continue;
      }

      for (const skaterEntry of skaterEntries) {
        if (candidates.length >= maxCandidates) {
          break;
        }

        try {
          candidates.push(await buildNhlShotsCandidate(game, skaterEntry, options));
        } catch (error) {
          skipped.push({
            gameId: game.id,
            sport: game.sport,
            playerId: skaterEntry.player?.id,
            reason: error.message
          });
        }
      }

      continue;
    }

    if (game.sport === "tennis") {
      skipped.push({
        gameId: game.id,
        sport: game.sport,
        reason: "Tennis candidate generation requires a configured verified tennis stats and odds feed."
      });
      continue;
    }

    skipped.push({
      gameId: game.id,
      sport: game.sport,
      reason: "Candidate generation currently supports MLB pitcher props, MLB batter props, and NHL skater shot props."
    });
  }

  return {
    fetchedAt: new Date().toISOString(),
    gameWindow,
    candidates,
    skipped,
    notes: [
      "Candidates are research drafts only.",
      "Real sportsbook odds are required before EV, Kelly, and BET/PASS/WAIT evaluation.",
      "MLB batter props use active roster data and must be confirmed against lineups before betting.",
      "Tennis remains manual-only until a verified tennis stats and odds provider is configured."
    ]
  };
}

module.exports = {
  generateResearchCandidates
};
