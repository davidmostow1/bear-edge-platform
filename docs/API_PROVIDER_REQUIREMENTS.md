# Bear Edge API Provider Requirements

Last researched: 2026-07-08.

This is the provider map required to turn Bear Edge from a local research app into a production-grade betting research system. Do not scrape sportsbook pages as the primary feed. Use licensed APIs and keep deterministic code in charge of verdicts.

## Minimum Stack To Make The App Operational

1. The Odds API
   - Key: `THE_ODDS_API_KEY`
   - Status in app: partially wired now.
   - Use for: current moneyline/spread/total odds, event-level player props, alternate props where available, scores/results, historical odds snapshots for CLV.
   - Required app work remaining: expand current adapter beyond MLB pitcher/batter props, add NHL and tennis market mapping, persist closing-line snapshots.
   - Docs: https://the-odds-api.com/liveapi/guides/v4/
   - Market list: https://the-odds-api.com/sports-odds-data/betting-markets.html
   - Historical odds: https://the-odds-api.com/historical-odds-data/

2. SportsDataIO or Sportradar
   - Choose one production sports-data provider. Do not rely on public ESPN/StatMuse pages for verdict-critical data.
   - SportsDataIO key: `SPORTSDATAIO_API_KEY`
   - Sportradar key: `SPORTRADAR_API_KEY`
   - Use for: confirmed lineups, injuries, rosters, schedules, stats, play-by-play, results, news/context, tennis data.
   - Current app gap: official MLB StatsAPI/public ESPN are useful, but confirmed lineup/injury production gates need a licensed provider.

3. Weather
   - No-key default: Open-Meteo.
   - Optional commercial key: `OPENWEATHER_API_KEY`.
   - Use for: MLB park weather, wind, temperature, precipitation, historical weather for model backtests.
   - Current app gap: weather is not yet wired into model features or stale-data gates.

## Best Practical Setup

Use this if cost matters and you want to build in phases:

1. `THE_ODDS_API_KEY` for verified sportsbook odds.
2. `SPORTSDATAIO_API_KEY` for multi-sport schedules, injuries, lineups, stats, tennis, news, and historical datasets.
3. Open-Meteo for no-key weather.
4. Keep public MLB StatsAPI as a fallback only.

This is the most realistic next build path because Bear Edge already has The Odds API wiring and can add SportsDataIO endpoints without replacing the whole engine.

## Enterprise Setup

Use this if accuracy, licensing, and uptime matter more than cost:

1. `SPORTRADAR_API_KEY` for official/enterprise sports feeds.
2. The Odds API, OpticOdds, or SportsGameOdds for odds and props.
3. OpenWeather commercial or Open-Meteo commercial plan for weather SLA.

Sportradar MLB docs describe official MLB data normalized into Sportradar format, including schedules, standings, rosters, real-time play-by-play, player/team stats, and Statcast-style advanced data. Sportradar also documents MLB injury feeds and game-specific starting lineups/game rosters.

## All-In-One Alternatives

These can replace or supplement The Odds API plus SportsDataIO:

1. OpticOdds
   - Key: `OPTICODDS_API_KEY`
   - Use for: multi-book odds, live streaming, player props, historical odds, injuries, bet grading, starting lineups, limits where available.
   - Docs: https://developer.opticodds.com/docs/odds-api-getting-started-guide

2. SportsGameOdds
   - Key: `SPORTS_GAME_ODDS_API_KEY`
   - Use for: odds, player props, alternate lines, scores, results, settlement data.
   - Docs/site: https://sportsgameodds.com/

These are worth evaluating if you want a single normalized betting-data provider instead of stitching odds, stats, injuries, and settlements across vendors.

## Sport-Specific Needs

### MLB

Required:
- Odds and props: The Odds API `baseball_mlb`.
- Current lines: `h2h`, `spreads`, `totals`.
- Player props: `pitcher_strikeouts`, `pitcher_outs`, `batter_hits`, `batter_total_bases`, `batter_hits_runs_rbis`, plus alternates like `pitcher_strikeouts_alternate` and `batter_total_bases_alternate`.
- Lineups/injuries: SportsDataIO or Sportradar.
- Weather: Open-Meteo/OpenWeather.

Current Bear Edge status:
- Official MLB schedule/stats are already pulled.
- The Odds API current/event prop path is partially wired.
- Confirmed lineups, weather, and licensed injury feed are not wired yet.

### NHL

Required:
- Odds and props: The Odds API `icehockey_nhl`.
- Player props: `player_shots_on_goal`, `player_points`, `player_assists`, `player_goals`, `player_blocked_shots`, goalie saves, plus alternate shot/point markets.
- Player/team stats, injuries, goalie confirmations, scratches: SportsDataIO or Sportradar.

Current Bear Edge status:
- Public NHL schedule/roster/stat candidates exist.
- Verified NHL odds/player props and goalie/scratch gates are not wired yet.

### Tennis

Required:
- Odds: The Odds API tennis sport keys, OpticOdds, SportsGameOdds, or SportsDataIO Tennis.
- Stats: SportsDataIO Tennis, Sportradar Tennis, API-Tennis, Matchstat, or another verified tennis provider.
- Required model context: surface, tournament, match format, ranking/Elo, serve/return stats, retirement risk, recent workload, injuries/withdrawals.

Current Bear Edge status:
- Tennis is intentionally manual-only.
- Do not auto-generate tennis bets until `TENNIS_API_KEY`, `SPORTSDATAIO_API_KEY`, or `SPORTRADAR_API_KEY` is wired to a real tennis data provider.

## Key Names To Support

Required now:
- `THE_ODDS_API_KEY`

Recommended next:
- `SPORTSDATAIO_API_KEY`
- `SPORTRADAR_API_KEY`

Alternatives:
- `OPTICODDS_API_KEY`
- `SPORTS_GAME_ODDS_API_KEY`

Sport-specific fallback:
- `TENNIS_API_KEY`
- `SPORTDEVS_API_KEY`

Weather:
- `OPENWEATHER_API_KEY` optional
- Open-Meteo requires no key for non-commercial use.

## Build Order

1. Finish The Odds API coverage for MLB/NHL player props and closing-line snapshots.
2. Add SportsDataIO adapter for MLB/NHL/tennis schedules, injuries, lineups, rosters, stats, and news.
3. Add Open-Meteo weather features for MLB parks.
4. Add historical odds ingestion for CLV and model backtesting.
5. Add provider health dashboard for every required feed.
6. Only after 1-5: allow automatic BET verdicts from live priced data.

## Non-Negotiable Rules

- No sportsbook scraping as the production odds source.
- No BET verdict without verified current odds.
- No batter prop BET without confirmed lineup/batting-order status.
- No MLB totals/weather-sensitive BET without weather freshness.
- No tennis automation without a verified tennis stats source.
- No staking escalation until CLV and settlement history prove the model.
