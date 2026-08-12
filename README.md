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
- Tracks The Odds API `x-requests-remaining`, `x-requests-used`, and `x-requests-last` headers without exposing the key
- Opens a shared local circuit after quota exhaustion, caches duplicate paid responses for two minutes, and keeps recurring health/release checks on zero-credit endpoints
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
- Parses pasted StatMuse score boards and game pages, including Notes-tab article context and Predictions-tab player markets, into games, displayed odds, probable pitchers, team stats, injuries, and game conditions while preserving source timestamps and unverified-evidence gates
- Parses browser-visible ESPN odds-page snapshots into displayed DraftKings game lines, prop tabs, recent schedule, injury context, and ESPN Analytics predictor percentages while preserving unverified-evidence gates
- Records a timestamped manual review of an ESPN snapshot after the operator confirms the event, displayed lines, and roster/injury context, without changing provider/API verification flags
- Emits a research packet with source URLs, timestamps, freshness, and confidence
- Exposes an HTTP API for evaluation and schema discovery
- Serves a local web dashboard for paste/upload evaluation, latest verdict review, settlement entry, and decision-log history
- Separates research candidates, price checks, evidence waits, passed markets, and qualified persisted BET calls on the Decision Board
- Requires a process-scoped bearer token for every LAN write while keeping read-only health and audit routes available
- Keeps optional Statsig controls presentation-only and optional Supabase synchronization secondary to the authoritative local ledger

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
SUPABASE_URL=          # optional remote audit projection
SUPABASE_SERVICE_ROLE_KEY=
SUPABASE_OWNER_USER_ID=
STATSIG_SERVER_SDK_SECRET=  # optional presentation/shadow controls only
STATSIG_ENVIRONMENT=development
BEAR_EDGE_OPERATOR_ID=local_operator
```

`SUPABASE_SERVICE_ROLE_KEY`, `STATSIG_SERVER_SDK_SECRET`, and operator tokens are server-side secrets. Never put them in browser code, query strings, screenshots, logs, or tracked files. The generated local or LAN bootstrap URL is the one exception for the process-scoped generated bootstrap: it uses a URL fragment that is not sent in the HTTP request, and the dashboard immediately moves the token into session storage and removes the fragment.

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

### Use It On Your Phone

The no-cost local setup runs on the Mac and is opened from the phone over the same Wi-Fi network. It does not expose the app to the public internet.

```bash
npm run launch:lan -- --no-open
```

Open the printed LAN URL in Safari on the phone, then use `Share -> Add to Home Screen` if you want a home-screen shortcut. The included `Open Bear Edge On Phone.command` file runs the same mode. The Mac must remain awake and on the same network while the phone uses live local-server features. Plain LAN HTTP is intentionally reported as phone-browser mode; a true offline service-worker shell requires HTTPS. The ticket draft is still preserved in browser storage, but live games, odds, injuries, and evaluation requests require the Mac server.

If the normal local dashboard is already running on port `3000`, use `npm run launch:lan -- --no-open --port 3001` or stop the local server first. LAN mode checks the Mac's actual Wi-Fi address before reporting success.

Every supported launch mode generates a 32-byte random operator token unless `BEAR_EDGE_OPERATOR_TOKEN` is already configured. A configured credential is passed only to the browser-opening process and is never returned in launcher output; `--no-open` prints only the unauthenticated base URL. The phone launcher deliberately suppresses the configured credential and prints a process-scoped generated bootstrap URL instead. The dashboard stores a bootstrap token for that tab session, immediately removes it from the address bar, and sends it as `Authorization: Bearer ...` for every protected API request. Only `/health`, `/schemas`, static dashboard assets, and `/api/operator-auth` remain public; unauthenticated protected reads and writes return HTTP `401`. If a generated token is lost, restart the process to generate a new one. Raw credentials are never returned by `/api/operator-auth` or readiness APIs.

Localhost and LAN launch paths both require operator authentication. LAN HTTP is still not a public deployment: use it only on a trusted private network, stop it when finished, and never forward the port. Public access requires HTTPS, durable identity and session management, rate limiting, encrypted secret handling, and a security review.

Use a different port:

```bash
npm run launch -- --port 3030
```

The local server binds to `127.0.0.1` by default. Use the supported `launch:lan` path rather than overriding `--host` directly because the launcher provisions the operator token and prints the correct private-network URL.

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
npm run audit:boundaries
npm run audit:canonical-status
```

The canonical-status audit checks local safety invariants and consistency with a pinned evidence snapshot. It does not query GitHub or Supabase and cannot certify a committed or remote-green lifecycle.

## Release Readiness

Generate a product-readiness audit for GitHub/CI/secrets/provider/data-quality checks:

```bash
npm run audit:release
```

The local dashboard also includes a `Release Readiness` panel. The report is split into `Local App`, `Data Edge`, and `Commercial Readiness` lanes, with exact next actions for each warning or blocker. It also reports local-ledger integrity, outbox state, model-registry authority, operator-write protection, and Statsig fail-closed state. Betting-proof items such as settled-bet quality, three-win history, model calibration, and licensed tennis/injury feeds are shown as `Evidence Gates` instead of being hidden or mislabeled as app-build failures. Generated reports are written to `data/reports/`.

For the complete operator runbook and exact status vocabulary, see [`docs/ELITE_AUDIT_OPERATIONS.md`](docs/ELITE_AUDIT_OPERATIONS.md).

## Live Ticket Verification

```bash
npm run verify
npm run evaluate:live -- examples/live-2-leg-alt-props.json --log-path /tmp/bear-edge-live-verification.jsonl
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

Use an isolated audit log for a disposable command check:

```bash
npm run evaluate -- examples/sample-bet.json --log-path /tmp/bear-edge-example-decision-log.jsonl
```

The CLI intentionally has no `--no-log` mode. Every evaluation is persisted either to the authoritative default ledger or to the explicit isolated path supplied by `--log-path`.

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
cat examples/live-2-leg-alt-props.json | npm run evaluate:live -- --stdin --log-path /tmp/bear-edge-live-stdin.jsonl
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
- the live model's Poisson stat-rate heuristic is research-only; it produces `WAIT` until a calibrated player-specific probability is supplied
- live player markets with missing timestamps, stale consensus, unconfirmed lineups, or stale injury evidence produce `WAIT` rather than a wager

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

The server starts the auto-update loop by default. It refreshes current source status, today/tomorrow games, research candidates, and decision-log summaries every minute while the local process is running. These recurring health checks do not call paid odds-market endpoints.

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
- `GET /api/operator-auth`
- `GET /api/statsig-control`
- `POST /api/statsig-control/exposure`
- `GET /api/sync-health`
- `POST /api/sync/run`
- `GET /api/system-audit`
- `GET /api/release-readiness`
- `GET /api/data-edge-audit`
- `GET /api/settings/odds-key`
- `POST /api/settings/odds-key`
- `POST /api/settings/odds-key/test`
- `GET /api/decision-log`
- `GET /api/evidence-queue?status=unresolved&limit=100`
- `GET /api/source-status?date=today&days=2`
- `GET /api/odds/sports`
- `GET /api/odds/markets?sport=mlb&markets=h2h,spreads,totals&bookmakers=draftkings`
- `GET /api/auto-update`
- `GET /api/auto-update/history?limit=25`
- `POST /api/auto-update/run`
- `GET /api/games?date=today&days=2`
- `GET /api/candidates?date=today&days=2`
- `GET /api/direct-screen-captures/latest`
- `POST /api/direct-screen-captures`
- `GET /api/best-mlb-targets?date=today&days=2&limit=3` for zero-credit candidate discovery
- `GET /api/best-mlb-targets?date=today&days=2&limit=3&refresh=1` for an explicit paid market refresh
- `GET /api/online-opportunities?sports=mlb,worldcup&date=today&days=2`
- `POST /api/statmuse-snapshot`
- `POST /api/espn-snapshot`
- `POST /api/snapshot-confirmation`
- `POST /api/draftkings-snapshot`
- `POST /api/worldcup-goalscorer-snapshot`
- `POST /api/recording-props-compare`
- `POST /evaluate`
- `POST /evaluate/live`
- `POST /api/settle`
- `POST /api/prediction-outcomes`
- `POST /api/closing-prices`

The direct-screen capture routes are the no-paid-API bridge for a page that is
actually visible in the logged-in Chrome session. The POST retains the
screenshot bytes, visible page text digest, URL, title, timestamp, event, and
only the supplied visible market rows. Bear Edge computes both SHA-256 digests
server-side, pairs only exact opposing rows, and stores both the image and
visible accessibility snapshot under their digests. The GET route exposes the
latest retained envelope and current exact candidate-match summary without
returning screenshot or visible-text contents.

Candidate pricing fails closed once a retained screen is more than five
minutes old, while the immutable capture remains available for audit.
If the same visible selection carries contradictory signed prices, the row is
excluded from pricing and retained as an explicit
`conflicting_visible_prices` omission with a structured total side and line.
Every observed price must occur on its own retained accessibility row beside
an exact `Over`/`O` or `Under`/`U` line label. These omissions are accepted
only for whole- or half-run totals retained from the event's `Game Lines`
page. Once either side conflicts, neither side at that period and total line
can be submitted as a priced row. A zero-row capture is accepted only when the
event status is `closed`, `final`, or `market_unavailable`; an empty live board
is rejected.

This evidence is labeled `captured_unverified`, remains
`PRICE_CHECK_ONLY`, and has `$0` authorized stake. Hidden, locked, ambiguous,
or opposite prices are never inferred. DraftKings Predictions contract
economics require the exact visible contract cost, gross payout, and fee; its
displayed American-style price must not be substituted into sportsbook payout
math. One Predictions contract must use its exact $1 settlement value. Neither
route submits or authorizes a wager.

The saved-key test first calls the provider's no-cost sports catalog. That response refreshes exact remaining, used, and last-call quota telemetry. If the catalog reports zero remaining credits, Bear Edge opens its local circuit and skips the paid probe. Otherwise, the explicit test performs one MLB DraftKings moneyline request for actual market access. A catalog response alone is not treated as verified odds readiness. The probe can report `ready`, `quota_exhausted`, `invalid_key`, `rate_limited`, or `provider_error`; when successful and not cached, it uses one provider usage credit. `quota_exhausted` keeps the app in `PRICE_CHECK_ONLY` until credits are replenished or the subscription is upgraded.

Automatic Decision Board discovery ranks official-stat candidates without requesting odds and does not write repeated discovery rows to the authoritative ledger. The dashboard button labeled `Refresh Market Prices (uses odds credits)` is the paid boundary. A manual refresh is capped at an estimated 12 credits, preserves five provider-reported credits, and reuses identical paid responses for two minutes. The provider bills standard odds by market and bookmaker-region group, so the cap may limit how many matched events receive prop-board requests. See [The Odds API usage quota documentation](https://the-odds-api.com/liveapi/guides/v4/#usage-quota-costs-1).

`GET /api/odds/markets` is also a paid market endpoint. Do not poll it as a health check. Use `/api/settings/odds-key`, `/api/source-status`, or `/api/release-readiness` for zero-credit diagnostics.

Example:

```bash
curl -X POST http://127.0.0.1:3000/evaluate/live \
  -H 'content-type: application/json' \
  --data @examples/live-2-leg-alt-props.json
```

Settle an evaluated bet with an outcome and closing price:

```bash
curl -X POST http://127.0.0.1:3000/api/settle \
  -H "authorization: Bearer ${BEAR_EDGE_OPERATOR_TOKEN:?set BEAR_EDGE_OPERATOR_TOKEN before launch}" \
  -H 'content-type: application/json' \
  --data '{"evaluationId":"eval_id_from_decision_log","outcome":"win","closingOdds":100,"stake":10,"profit":10}'
```

Settlement records are appended to the same JSONL log instead of mutating old evaluations. The dashboard uses the latest settlement for each evaluation to compute CLV, hit rate, profit/loss, parlay performance, and false-positive BET calls.

`/api/settle` is financial wager history and accepts only an existing canonical `BET` evaluation. A `WAIT` or `PASS` evaluation must never be represented as a wager settlement. Use the separate non-financial evidence endpoints for shadow and research evaluations.

The authenticated dashboard includes a `Shadow Evidence` queue backed by `GET /api/evidence-queue`. It lists only canonical evaluations, reports missing official outcomes and exact-book closing prices, resolves the latest linear correction history, and shows progress toward the registered minimum settled sample. The queue is a zero-credit local ledger read and does not call an odds provider. Its forms submit to the two non-financial endpoints below and refresh the queue only after the authoritative append succeeds.

Append an official final prediction outcome:

```bash
curl -X POST http://127.0.0.1:3000/api/prediction-outcomes \
  -H "authorization: Bearer ${BEAR_EDGE_OPERATOR_TOKEN:?set BEAR_EDGE_OPERATOR_TOKEN before launch}" \
  -H 'content-type: application/json' \
  --data '{
    "evaluationId":"eval_id_from_decision_log",
    "supersedesId":null,
    "outcome":"loss",
    "resolvedAt":"2026-07-18T02:30:00.000Z",
    "eventResult":{"status":"final","homeScore":2,"awayScore":1},
    "marketResult":{"observedValue":4,"unit":"strikeouts"},
    "source":{
      "provider":"mlb_official",
      "sourceType":"official_box_score",
      "sourceLocator":"https://www.mlb.com/gameday/event-id/final/box",
      "capturedAt":"2026-07-18T02:35:00.000Z",
      "sourceTime":"2026-07-18T02:30:00.000Z",
      "digest":"replace-with-64-lowercase-hex-sha256-of-retained-artifact",
      "verificationStatus":"verified_official_result"
    },
    "notes":[]
  }'
```

Append the exact evaluated sportsbook's final two-sided closing price:

```bash
curl -X POST http://127.0.0.1:3000/api/closing-prices \
  -H "authorization: Bearer ${BEAR_EDGE_OPERATOR_TOKEN:?set BEAR_EDGE_OPERATOR_TOKEN before launch}" \
  -H 'content-type: application/json' \
  --data '{
    "evaluationId":"eval_id_from_decision_log",
    "supersedesId":null,
    "price":{
      "sportsbook":"draftkings",
      "marketOdds":-120,
      "oppositeOdds":100,
      "marketClosedAt":"2026-07-17T23:00:00.000Z",
      "isFinal":true
    },
    "source":{
      "provider":"licensed_odds_feed",
      "sourceType":"sportsbook_closing_price",
      "sourceLocator":"https://licensed-provider.example/event-id/closing",
      "capturedAt":"2026-07-17T23:00:05.000Z",
      "sourceTime":"2026-07-17T23:00:00.000Z",
      "digest":"replace-with-64-lowercase-hex-sha256-of-retained-artifact",
      "verificationStatus":"verified_provider_capture"
    },
    "notes":[]
  }'
```

The digest placeholders above are intentionally invalid. Replace each with the genuine 64-character lowercase SHA-256 digest of the retained source artifact; never fabricate one merely to satisfy validation. Outcome source time cannot precede resolution. Closing-price source time cannot follow market close, the close cannot follow event start, and the closing sportsbook must exactly match the evaluated sportsbook. Corrections append a new record whose `supersedesId` is the latest `outcome_<uuid>` or `close_<uuid>` identifier. Branches, stale corrections, stake, profit, and wager outcome fields are rejected. A sportsbook page, screenshot, public aggregator, optical-character-recognition result, or browser extension is not `verified_provider_capture` evidence by itself.

Calibration joins an eligible pre-event evaluation with its latest valid `prediction_outcome` and `closing_price`. These records can grade a shadow prediction, but they do not create a wager, authorize a bet, or prove an edge.

On an authenticated LAN session, the dashboard adds the bearer token automatically. A direct LAN `curl` write must add `-H "Authorization: Bearer $BEAR_EDGE_OPERATOR_TOKEN"`. Do not put a real token in shell history; load it from a protected environment or use the dashboard bootstrap URL.

The dashboard also shows a `3-Win Gate`. It is intentionally conservative: only settled `BET` calls with a `win` advance the streak, and any settled `loss` resets it. Pending, void, and push records do not complete the gate.

## Optional Supabase Audit Projection

The append-only local ledger is authoritative. Supabase is an optional secondary projection for centralized retention and must never be used to rewrite or silently repair local history.

The version-controlled migration `supabase/migrations/20260718010000_shadow_evidence_v21.sql` adds the remote `prediction_outcomes` and `closing_prices` projections. Deploy and verify it in a controlled Supabase environment before synchronizing either new record type. A local migration file or static test does not prove that the remote schema has been upgraded.

Configure all three server-side values in `.env.local`:

```text
SUPABASE_URL=https://your-project.supabase.co
SUPABASE_SERVICE_ROLE_KEY=server-side-secret
SUPABASE_OWNER_USER_ID=00000000-0000-4000-8000-000000000000
```

Restart the server, then inspect health without causing a remote write:

```bash
curl -fsS http://127.0.0.1:3000/api/sync-health
```

Run an explicit synchronization only after the health response reports `configured: true` and `enabled: true`:

```bash
curl -fsS -X POST http://127.0.0.1:3000/api/sync/run
```

`pending` and `retryable_failure` records remain retained locally. A `terminal_failure` or any outbox integrity issue blocks release readiness and requires operator investigation; it must not be discarded to make the dashboard green.

## Optional Statsig Controls

Statsig controls only whether provenance details are expanded and whether a shadow assignment is recorded. It cannot alter model probability, verdict, permission, stake, or operator authorization. Configure `STATSIG_SERVER_SDK_SECRET`, optional `STATSIG_ENVIRONMENT`, and optional `BEAR_EDGE_OPERATOR_ID` in `.env.local`, then restart. Missing configuration, initialization failure, or gate failure produces `control_fallback` and fails closed. The safe state is visible at:

```bash
curl -fsS http://127.0.0.1:3000/api/statsig-control
```

## Calibration Workflow

Project the authoritative ledger into a canonical calibration dataset and readiness report:

```bash
npm run audit:calibration
```

Only after `data/calibration/calibration_dataset.jsonl` contains eligible, chronologically valid observations with final closing-line evidence, generate a market-family report:

```bash
npm run calibrate -- \
  --input data/calibration/calibration_dataset.jsonl \
  --market-family pitcher_strikeouts \
  --model-id poisson_count_v1 \
  --model-version 1.0.0 \
  --output data/reports/pitcher_strikeouts_calibration.json
```

Generating a report does not promote a model. Registered policy `1.2.0` assigns each `eventId` to exactly one chronological partition, merges interleaving event prediction intervals into indivisible time blocks, resamples complete event clusters for every promotion uncertainty metric, and requires at least 100 distinct settled events in addition to 500 settled observations. `models/registry.json` must retain content-addressed, digest-verified passing report evidence and satisfy every registered promotion threshold before the model can become `validated`.

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

This endpoint uses actual online sources instead of app connectors. `unverified_public_price` rows preserve visible prices and publisher projection context from the public Covers MLB props page, including decimal odds, implied probability, $100-stake payout, a listed DraftKings price when present, and listed-price deltas. They always carry `PRICE_CHECK_ONLY` and are not verified sportsbook authorization or Bear Edge model output. `odds_needed` rows identify possible MLB and World Cup market families from official schedules plus Hard Rock Bet market pages, but still require a verified sportsbook price before evaluation.

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

The dashboard has a `StatMuse Snapshot Intake` panel for the same workflow. Paste OCR/accessibility text from a StatMuse game page, optionally enter that page's URL, and use `Parse Snapshot`. The panel shows captured game context, Notes-tab article text, displayed prices, and Predictions-tab player markets, but marks them as contextual and unverified. StatMuse page data does not authorize a `BET` verdict or replace a licensed odds, injury, or lineup provider.

Parse a browser-visible ESPN odds-page snapshot:

```bash
curl -X POST http://127.0.0.1:3000/api/espn-snapshot \
  -H 'content-type: application/json' \
  --data '{"text":"paste ESPN odds-page text here","sourceUrl":"https://www.espn.com/mlb/odds/_/gameId/401816143","capturedAt":"2026-07-16T16:10:00.000Z"}'
```

The dashboard has an `ESPN Snapshot Intake` panel for the same workflow. It preserves displayed DraftKings game odds, hitting/pitching/team props, recent schedule rows, injuries, and ESPN Analytics matchup percentages as contextual evidence. These values are not verified sportsbook, roster, lineup, or Bear Edge model inputs and must be checked manually before evaluation.

After reviewing the parsed capture, check the three review boxes and select `Mark Manually Confirmed`. The dashboard records the confirmation time and capture identity separately from provider verification. A manual confirmation does not authorize a `BET` verdict, and it should be repeated when the displayed odds or player status changes.

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

The same parser accepts visible NBA/NBA Summer League, WNBA, NHL, and tennis game rows. Compact spread, total, and moneyline rows are normalized when both sides are visible; tennis rows remain manual-only and do not unlock automated picks.

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
  --input examples/historical-verified-card.json \
  --output-dir data/reports \
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

Use [examples/sample-bet.json](examples/sample-bet.json) as a starting point.
