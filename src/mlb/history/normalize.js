// @ts-nocheck
function number(value) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

function inningsToOuts(value) {
  const text = String(value ?? "0.0");
  const [wholeText, fractionText = "0"] = text.split(".");
  const whole = Number(wholeText) || 0;
  const fraction = Number(fractionText) || 0;
  return whole * 3 + Math.min(2, Math.max(0, fraction));
}

function teamRows(gamePk, side, teamBox, sourceSha256) {
  const batting = [];
  const pitching = [];
  for (const entry of Object.values(teamBox?.players ?? {})) {
    const person = entry.person ?? {};
    if (entry.stats?.batting && (number(entry.stats.batting.plateAppearances) > 0 || number(entry.stats.batting.atBats) > 0)) {
      const stats = entry.stats.batting;
      batting.push({
        gamePk,
        side,
        playerId: person.id,
        playerName: person.fullName,
        battingOrder: entry.battingOrder ? number(entry.battingOrder) / 100 : null,
        plateAppearances: number(stats.plateAppearances),
        atBats: number(stats.atBats),
        hits: number(stats.hits),
        doubles: number(stats.doubles),
        triples: number(stats.triples),
        homeRuns: number(stats.homeRuns),
        strikeouts: number(stats.strikeOuts),
        walks: number(stats.baseOnBalls),
        runs: number(stats.runs),
        rbis: number(stats.rbi),
        totalBases: number(stats.totalBases),
        sourceSha256
      });
    }
    if (entry.stats?.pitching && number(entry.stats.pitching.battersFaced) > 0) {
      const stats = entry.stats.pitching;
      pitching.push({
        gamePk,
        side,
        playerId: person.id,
        playerName: person.fullName,
        starter: number(stats.gamesStarted) > 0,
        battersFaced: number(stats.battersFaced),
        pitches: number(stats.numberOfPitches),
        outs: inningsToOuts(stats.inningsPitched),
        strikeouts: number(stats.strikeOuts),
        walks: number(stats.baseOnBalls),
        hits: number(stats.hits),
        homeRuns: number(stats.homeRuns),
        earnedRuns: number(stats.earnedRuns),
        sourceSha256
      });
    }
  }
  return { batting, pitching };
}

function normalizeGameFeed(feed, sourceSha256) {
  const gamePk = feed.gamePk ?? feed.gameData?.game?.pk;
  if (!gamePk) throw new TypeError("game feed is missing gamePk");
  const away = feed.gameData?.teams?.away ?? {};
  const home = feed.gameData?.teams?.home ?? {};
  const linescore = feed.liveData?.linescore ?? {};
  const game = {
    gamePk,
    officialDate: feed.gameData?.datetime?.officialDate ?? null,
    gameDate: feed.gameData?.datetime?.dateTime ?? null,
    venueId: feed.gameData?.venue?.id ?? null,
    venueName: feed.gameData?.venue?.name ?? null,
    awayTeamId: away.id ?? null,
    awayTeamName: away.name ?? null,
    homeTeamId: home.id ?? null,
    homeTeamName: home.name ?? null,
    awayRuns: number(linescore.teams?.away?.runs),
    homeRuns: number(linescore.teams?.home?.runs),
    innings: (linescore.innings ?? []).length,
    status: feed.gameData?.status?.detailedState ?? null,
    sourceSha256
  };
  const awayRows = teamRows(gamePk, "away", feed.liveData?.boxscore?.teams?.away, sourceSha256);
  const homeRows = teamRows(gamePk, "home", feed.liveData?.boxscore?.teams?.home, sourceSha256);
  return {
    game,
    batting: [...awayRows.batting, ...homeRows.batting],
    pitching: [...awayRows.pitching, ...homeRows.pitching]
  };
}

module.exports = { normalizeGameFeed, inningsToOuts };
