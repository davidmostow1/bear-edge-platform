# Bear Edge Betting Engine

A local betting-decision engine with deterministic verdict gates, strict input validation, JSONL decision logging, and a CLI for repeatable backtesting.

## What It Does

- Converts American odds and implied probabilities
- Normalizes two-way no-vig market probabilities
- Shrinks model probability toward the market
- Computes EV, Kelly, and capped stake sizes
- Applies PASS / WAIT / BET verdict gates
- Rejects parlays and correlation-risk setups by default
- Waits on stale injury data
- Appends decision logs to `data/logs/decision_log.jsonl`
- Tracks settlement outcomes, closing line value, hit rate, false-positive BET calls, EV by market type, and parlay performance from the append-only log
- Enforces a visible validation gate that stays incomplete until three settled BET calls win in a row
- Evaluates live 2–3 leg parlays with up to 2 alt-prop legs
- Polls official MLB and NHL live stat sources on demand or on an interval
- Pulls official today/tomorrow MLB and NHL game boards for current status, scores, teams, venues, MLB probable pitchers, and NHL team abbreviations
- Pulls the public ESPN FIFA World Cup scoreboard for current World Cup match windows
- Finds online MLB and World Cup opportunity families from actual web sources: Covers MLB props, Hard Rock Bet market pages, ESPN schedules, and StatMuse research pages
- Generates MLB probable-pitcher strikeout and NHL skater shots-on-goal research candidates from official schedule, roster, and player-stat data
- Treats Tennis as a manual-only lane until a verified tennis schedule/stats/odds provider is configured, instead of inventing lines
- Lets you enter real sportsbook market odds directly on a candidate card before loading it into the evaluator
- Checks current ESPN scoreboards, MLB teams, sampled rosters, and MLB injury reports with source timestamps
- Runs a server-side auto-update loop while the local dashboard server is running
- Exposes last run, next run, provider status, games, candidates, and log summaries in an Auto Update dashboard panel
- Exposes a local System Audit panel for runtime, file, log/cache, Git/GitHub, and provider-key readiness without printing secret values
- Lets you save and verify a real The Odds API key from the local dashboard without echoing the secret back to the browser
- Persists auto-update run history to `data/logs/auto_update_log.jsonl` and the latest run to `data/logs/auto_update_latest.json`
- Checks DraftKings market-board reachability and reports blocked/unavailable odds feeds instead of inventing lines
- Parses browser-visible DraftKings game-line board text into explicit moneyline, run line, total, side, price, and incomplete-market warnings
- Normalizes DraftKings Predictions app screenshot rows into ledger-ready markets with implied probability, payout, bankroll, source screenshot, and no-inference warnings
- Parses DraftKings Network prediction/news cards from the same page as editorial context only
- Compares extracted recording props against a current DraftKings total-bases board export, including implied probability, payout, current-line movement, and live MLB game-state adjustment when available
- Simulates verified bet cards with deterministic 100-trial output, probability stress scenarios, and explicit causality warnings
- Builds a protocol audit ledger from manually classified screenshots, frame notes, and settled tickets, then reports ROI, process grades, leaks, and next-card rules
- Checks STAT News sports-betting/injury search context and labels it as editorial context, not a roster or odds feed
- Checks StatMuse sports navigation, scores, and daily sports query pages as a manual-review research surface
- Parses pasted StatMuse page snapshots into games, displayed odds, and musings while preserving odds-side uncertainty
- Emits a research packet with source URLs, timestamps, freshness, and confidence
- Exposes an HTTP API for evaluation and schema discovery
- Serves a local web dashboard for paste/upload evaluation, latest verdict review, settlement entry, and decision-log history

## Requirements

- Node.js `20+`
- npm

## Install

```bash
npm install
```

If `npm` is not on your shell path, use the bundled runtime from the project root:

```bash
PATH="$PWD/.tools/node/bin:$PATH" npm install
```

## Local Configuration

The dashboard has a `Verified Odds API` panel that can save and verify a The Odds API key locally. It writes only to `.env.local`, updates the running process, and never returns the secret value in API responses.

You can also create the config file manually:

```bash
cp .env.example .env.local
```

Then edit `.env.local`. Real keys are ignored by git and are loaded automatically by `npm run launch` and `npm run serve`.

Useful keys:

```text
THE_ODDS_API_KEY=      # enables verified sportsbook odds through The Odds API
TENNIS_API_KEY=        # reserved for a verified tennis stats provider
```

## Open The Local App

The easiest local launch path on macOS is the root-level command file:

```text
Open Bear Edge.command
```

Double-clicking it starts the local server if it is not already running, waits for `/health`, opens the dashboard, and writes server logs to:

```text
data/logs/server.log
data/logs/server-error.log
```

From Terminal, use:

```bash
npm run launch
```

Open without launching a browser:

```bash
npm run launch -- --no-open
```

Use a different port:

```bash
npm run launch -- --port 3030
```

The local server binds to `127.0.0.1` by default. You can override it for controlled testing with `--host`, but do not expose the app on a public network without authentication, encrypted secret storage, HTTPS, and a security review.

## Verify

```bash
npm run verify
```

If needed, run the same command through the bundled runtime:

```bash
PATH="$PWD/.tools/node/bin:$PATH" npm run verify
```

That runs:

```bash
npm run typecheck
npm test
```

## Release Readiness

Generate a product-readiness audit for GitHub/CI/secrets/provider/data-quality checks:

```bash
npm run audit:release
```

The local dashboard also includes a `Release Readiness` panel. The report is split into `Local App`, `Data Edge`, and `Commercial Readiness` lanes, with exact next actions for each warning or blocker. Betting-proof items such as settled-bet quality, three-win validation, and licensed tennis/injury feeds are shown as `Evidence Gates` instead of being hidden or mislabeled as app-build failures. Generated reports are written to `data/reports/`.

## Live Ticket Verification

```bash
npm run verify
npm run evaluate:live -- examples/live-2-leg-alt-props.json --no-log
```

## Evaluate A Bet

From a JSON file:

```bash
npm run evaluate -- examples/sample-bet.json
```

From stdin:

```bash
cat examples/sample-bet.json | npm run evaluate -- --stdin
```

Without appending a log entry:

```bash
npm run evaluate -- examples/sample-bet.json --no-log
```

Compact JSON output:

```bash
npm run evaluate -- examples/sample-bet.json --compact
```

Print the accepted input schema:

```bash
npm run evaluate -- --schema
```

Override the decision-log path:

```bash
npm run evaluate -- examples/sample-bet.json --log-path ./tmp/decision_log.jsonl
```

You can also set:

```bash
export BEAR_EDGE_DECISION_LOG_PATH=./tmp/decision_log.jsonl
```

## Live Props And Parlays

Evaluate a live ticket from an example file:

```bash
npm run evaluate:live -- examples/live-2-leg-alt-props.json
```

Run the live watch loop once per minute:

```bash
npm run watch:live -- examples/live-2-leg-alt-props.json --interval-seconds 60
```

Read a live ticket from stdin:

```bash
cat examples/live-2-leg-alt-props.json | npm run evaluate:live -- --stdin --no-log
```

Included live examples:

- `examples/live-2-leg-alt-props.json`
- `examples/live-3-leg-parlay.json`

Current live support:

- 2 or 3 legs per parlay
- up to 2 alternate prop legs
- official MLB player stat pulls through `statsapi.mlb.com`
- official NHL player stat pulls through `api-web.nhle.com`

Current practical limits:

- sportsbook odds are still supplied in the ticket JSON
- DraftKings direct unauthenticated market endpoints may block access; set `THE_ODDS_API_KEY` or `ODDS_API_KEY` to use a configured odds feed that includes the DraftKings bookmaker
- browser-visible DraftKings board text can be pasted into the dashboard and parsed for manual review; incomplete visible rows stay blocked until manually verified
- DraftKings Network prediction cards are retained for audit context, but they are not treated as model probability, EV, or a BET signal
- StatMuse is monitored for reachable research/search pages and daily query links, but it is not treated as an official structured API for EV/Kelly decisions
- same-game correlation is rejected when you declare a shared `correlationKey`
- the live model is a stat-rate heuristic, not a bookmaker-grade projection stack

## Research Packets

Live evaluations now include a `researchPacket` with:

- source URLs
- fetch timestamps
- freshness in minutes
- season and recent per-game stat context
- cache-hit metadata
- a confidence tier and score

This is intended to support audit trails and later backtesting review.

## HTTP API

Start the server:

```bash
npm run serve -- --port 3000
```

For normal use, prefer `npm run launch`; it starts the server only when needed and opens the dashboard automatically.

The server starts the auto-update loop by default. It refreshes current source status, today/tomorrow games, research candidates, and decision-log summaries every five minutes while the local process is running.

Each completed auto-update run is appended to:

```text
data/logs/auto_update_log.jsonl
```

The latest run is also written to:

```text
data/logs/auto_update_latest.json
```

Disable server-side auto-update:

```bash
npm run serve -- --port 3000 --no-auto-update
```

Change the interval:

```bash
npm run serve -- --port 3000 --auto-update-interval-ms 60000
```

Open the local dashboard:

```text
http://127.0.0.1:3000/dashboard
```

Available routes:

- `GET /health`
- `GET /schemas`
- `GET /dashboard`
- `GET /api/system-audit`
- `GET /api/settings/odds-key`
- `POST /api/settings/odds-key`
- `POST /api/settings/odds-key/test`
- `GET /api/decision-log`
- `GET /api/source-status?date=today&days=2`
- `GET /api/odds/sports`
- `GET /api/odds/markets?sport=mlb&markets=h2h,spreads,totals&bookmakers=draftkings`
- `GET /api/auto-update`
- `GET /api/auto-update/history?limit=25`
- `POST /api/auto-update/run`
- `GET /api/games?date=today&days=2`
- `GET /api/candidates?date=today&days=2`
- `GET /api/online-opportunities?sports=mlb,worldcup&date=today&days=2`
- `POST /api/statmuse-snapshot`
- `POST /api/draftkings-snapshot`
- `POST /api/worldcup-goalscorer-snapshot`
- `POST /api/recording-props-compare`
- `POST /evaluate`
- `POST /evaluate/live`
- `POST /api/settle`

Example:

```bash
curl -X POST http://127.0.0.1:3000/evaluate/live \
  -H 'content-type: application/json' \
  --data @examples/live-2-leg-alt-props.json
```

Settle an evaluated bet with an outcome and closing price:

```bash
curl -X POST http://127.0.0.1:3000/api/settle \
  -H 'content-type: application/json' \
  --data '{"evaluationId":"eval_id_from_decision_log","outcome":"win","closingOdds":100}'
```

Settlement records are appended to the same JSONL log instead of mutating old evaluations. The dashboard uses the latest settlement for each evaluation to compute CLV, hit rate, profit/loss, parlay performance, and false-positive BET calls.

The dashboard also shows a `3-Win Gate`. It is intentionally conservative: only settled `BET` calls with a `win` advance the streak, and any settled `loss` resets it. Pending, void, and push records do not complete the gate.

Load official current games:

```bash
curl "http://127.0.0.1:3000/api/games?date=today&days=2"
```

Build official-data research candidates:

```bash
curl "http://127.0.0.1:3000/api/candidates?date=today&days=2"
```

Candidate drafts intentionally contain `marketOdds: null`. MLB candidates use official pitcher strikeout stats; NHL candidates use official roster plus skater shots stats. Tennis remains manual-only unless a verified provider key is configured. The dashboard will load candidates into the JSON editor, but it will refuse to evaluate them until you replace null odds with real sportsbook odds.

The dashboard candidate cards also include `Market odds` and optional `Opposite odds` fields. Use `Load With Odds` after entering a real sportsbook price to create an evaluable ticket without hand-editing raw JSON. Opposite odds are optional and are used for no-vig market normalization when available.

Find online MLB and World Cup opportunities:

```bash
curl "http://127.0.0.1:3000/api/online-opportunities?sports=mlb,worldcup&date=today&days=2&maxProps=200"
```

This endpoint uses actual online sources instead of app connectors. `priced_online` rows include visible book prices from the public Covers MLB props page with decimal odds, implied probability, $100-stake payout, the visible DraftKings price when present, and best-book vs DraftKings deltas. `odds_needed` rows identify possible MLB and World Cup market families from official schedules plus Hard Rock Bet market pages, but still require a verified sportsbook price before evaluation.

Check live source freshness:

```bash
curl "http://127.0.0.1:3000/api/source-status?date=today&days=2"
```

The dashboard checks sources on load and every five minutes while open. The source monitor reports ESPN roster/injury freshness, DraftKings market-board availability, STAT News editorial context, and StatMuse daily research-link status with source timestamps and warnings.

The `Auto Update` panel shows whether the server-side loop is enabled, the last completed run, next run, run failures, provider status summaries, current official game counts, candidate counts, decision-log gate status, and recent persisted refresh history. `Run Auto Update Now` triggers the same server-side refresh manually.

Inspect persisted refresh history directly:

```bash
curl "http://127.0.0.1:3000/api/auto-update/history?limit=25"
```

Parse a pasted StatMuse page snapshot:

```bash
curl -X POST http://127.0.0.1:3000/api/statmuse-snapshot \
  -H 'content-type: application/json' \
  --data '{"text":"paste StatMuse page text here","capturedAt":"2026-06-17T21:00:00.000Z"}'
```

The dashboard has a `StatMuse Snapshot Intake` panel for the same workflow. Parsed StatMuse moneyline numbers are marked `side unverified` because the pasted page text does not reliably identify which side the displayed price belongs to.

Parse a visible DraftKings game-lines board snapshot:

```bash
curl -X POST http://127.0.0.1:3000/api/draftkings-snapshot \
  -H 'content-type: application/json' \
  --data '{"text":"paste DraftKings visible board text here","capturedAt":"2026-06-17T22:05:00.000Z"}'
```

The dashboard has a `DraftKings Board Intake` panel for the same workflow. Parsed DraftKings rows preserve explicit sides and prices. If the visible sportsbook page omits a side, the event is still shown but flagged as incomplete and should not be evaluated until manually verified. DraftKings Network prediction/news cards from `MLB Betting News` are shown separately as editorial context only.

Parse normalized DraftKings Predictions app screenshot rows:

```bash
curl -X POST http://127.0.0.1:3000/api/dk-predictions-board-snapshot \
  -H 'content-type: application/json' \
  --data '{
    "date":"2026-06-27",
    "capturedAt":"2026-06-27T12:50:36-04:00",
    "bankroll":206.44,
    "events":[{
      "league":"MLB",
      "game":"AZ @ TB",
      "startTime":"Today 6:10 PM",
      "away":{"abbreviation":"AZ","name":"ARI Diamondbacks"},
      "home":{"abbreviation":"TB","name":"TB Rays"},
      "markets":{"moneyline":[{"side":"away","odds":127},{"side":"home","odds":-144}]}
    }]
  }'
```

This endpoint is for DK Predictions app cards where OCR/manual review has already identified the visible rows. It returns one ledger-ready row per visible market with decimal odds, implied probability, $1 payout/net-profit math, bankroll-at-time, source screenshot fields, and `current_at_capture` status. Cropped or hidden prices should be left out and recorded as WAIT notes rather than inferred.

Parse normalized World Cup goalscorer rows from a screenshot review:

```bash
curl -X POST http://127.0.0.1:3000/api/worldcup-goalscorer-snapshot \
  -H 'content-type: application/json' \
  --data '{"event":{"home":"Egypt","away":"Iran","startTime":"Today 11:10 PM"},"rows":[{"player":"Mohamed Salah","team":"Egypt","firstGoalscorer":"+488","anytimeGoalscorer":"+223","twoPlusGoalscorer":"+1150"}]}'
```

World Cup goalscorer rows return decimal odds, implied probability, and $100-stake payout for each visible price. Locked cells stay locked and are not treated as evaluated prices.

Compare extracted recording props against a current DraftKings total-bases board export:

```bash
curl -X POST http://127.0.0.1:3000/api/recording-props-compare \
  -H 'content-type: application/json' \
  --data @comparison-input.json
```

`comparison-input.json` should include:

- `recordingCsvText`
- `currentBoardText` or `currentBoardPayload`
- optional `bankroll`

The dashboard has a `Recording Prop Comparison` panel for the same workflow. Upload the extracted recording CSV plus a current DraftKings board JSON export and Bear Edge will match visible props, compute implied probabilities and gross payout, resolve MLB `gamePk` values when possible, and load matched tickets directly into the evaluator.

Run the same comparison workflow from the CLI:

```bash
npm run compare:recording -- \
  --recording-csv path/to/recording_props.csv \
  --current-board path/to/current_draftkings_total_bases_board.json \
  --out-csv path/to/comparison_output.csv \
  --out-md path/to/comparison_output.md
```

Build the Bear Edge protocol audit ledger from the seeded thread examples:

```bash
npm run audit:protocol -- \
  --out-json path/to/bear_edge_protocol_audit.json \
  --out-csv path/to/bear_edge_protocol_ledger.csv \
  --out-md path/to/bear_edge_protocol_audit.md \
  --bankroll 104.81
```

The protocol audit is designed for manual screenshot/frame-note ingestion. It keeps missing evidence blank, calculates net P/L only when both stake and payout are visible, summarizes ROI by market type, grades process quality, surfaces mistake tags, and emits next-slate rules/checklists. Settled tickets are audit evidence only, not proof of a current board.

Simulate a verified screenshot-derived card:

```bash
npm run simulate:card -- \
  --input "/Users/davidbearmostow/Documents/BearEdgeBettingSystem/artifacts/dk_predictions_visible_board_2026-06-27_1250.json" \
  --iterations 100 \
  --seed bear-edge-2026-06-27-verified-card
```

Or call the API directly:

```bash
curl -X POST http://127.0.0.1:3000/api/simulate-card \
  -H 'content-type: application/json' \
  --data '{
    "iterations":100,
    "seed":"bear-edge-2026-06-27-verified-card",
    "startingBankroll":206.44,
    "bets":[{
      "selection":"AZ moneyline",
      "americanOdds":127,
      "stake":1.55,
      "fairProbability":0.52313636,
      "marketImpliedProbability":0.4405
    }]
  }'
```

The simulation endpoint returns every trial, every random draw, every bet outcome, and summary statistics. It supports `fair`, `half_edge`, `adverse_three_points`, and `market` scenarios. Its causality layer deliberately marks normal betting-model output as `predictive_not_causal` unless a credible identification strategy and timestamped pre-wager evidence are attached.

## Portable Package

Build a distributable tarball:

```bash
npm run package:portable
```

That writes a `.tgz` package into `dist/` after typecheck and tests pass. Another environment can then run:

```bash
npm install ./dist/betting-decision-engine-1.0.0.tgz
npx bear-edge-evaluate examples/sample-bet.json
```

For the live CLI in another environment:

```bash
npx bear-edge-live-evaluate live-2-leg-alt-props.json
```

## Input Shape

Required fields:

- `selection`
- `marketOdds`
- `oppositeOdds`
- `modelProbability`
- `bankroll`

Optional fields:

- `marketWeight`
- `injuryDataAgeMinutes`
- `maxInjuryAgeMinutes`
- `tiltLocked`
- `isParlay`
- `hasCorrelationRisk`
- `thresholds`
- `stakePolicy`
- `notes`

See:

```bash
npm run evaluate -- --schema
```

## Sample

Use [examples/sample-bet.json](/Users/davidbearmostow/Documents/Codex/2026-06-17-documents-openai-developers-google-drive-google/examples/sample-bet.json:1) as a starting point.
