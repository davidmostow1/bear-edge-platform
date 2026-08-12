# Production Readiness

Bear Edge is designed as a local betting research and decision engine. The app should never pretend to guarantee winning picks. Its product value is repeatable math, strict risk gates, transparent source timestamps, and a decision log that can be audited against closing-line value and settled results.

## Current Hard Gates

- Deterministic `PASS` / `WAIT` / `BET` logic in code, not model-generated verdicts.
- Real sportsbook odds are required before evaluation.
- Missing odds block evaluation.
- Automatic bet permission requires fresh, timestamped odds from the requested bookmaker with an exact candidate match.
- Untimestamped, invalid, future-dated, stale, or materially disagreeing market prices force `WAIT`.
- Timestamped consensus entries are filtered for freshness and deduplicated by bookmaker before fair-price weighting.
- Stale injury/source data can force `WAIT`.
- Unconfirmed lineups, rosters, and carried stale-injury flags force `WAIT` for live player markets.
- Tilt-lock can force `PASS`.
- Parlays are capped at 3 legs.
- Alt props are capped at 2 legs.
- Correlated parlay legs are rejected by default.
- Bankroll and sportsbook-minimum pressure are surfaced before submission.
- Exact threshold ties are not bets; positive fair edge, positive EV buffer, Kelly, and stake gates must all clear strictly.
- Research-only Poisson count estimates are never production `BET` probabilities; a calibrated model probability or a resolved live outcome gate is required.
- Decision-log quality blocks blind trust in hit rate and ROI when bets are not settled.
- A persisted `BET` requires both `VERIFIED_BETS_ALLOWED` and an exact `validated` model-registry entry with immutable calibration-report evidence.
- Financial settlement remains restricted to canonical `BET` evaluations; shadow and research evaluations use separate non-financial `prediction_outcome` and `closing_price` records.
- A shadow observation is calibration-eligible only after an official final outcome and exact-book final two-sided close are both present with valid provenance and linear correction history.
- Every non-read HTTP request requires a process-scoped bearer token in LAN mode; missing, malformed, or invalid authorization returns HTTP `401`.
- The optional Supabase projection is secondary to the append-only local ledger; remote failure cannot erase or rewrite local evidence.
- Statsig is limited to presentation and shadow-assignment controls and fails closed to control. It has no verdict, probability, stake, or authorization authority.

## Operational Checks

Run the core verification suite:

```bash
npm run verify
```

Run the release-readiness audit:

```bash
npm run audit:release
```

That writes:

```text
data/reports/release_readiness.json
data/reports/release_readiness.md
```

These files are generated local artifacts and should not contain API secrets.

The release audit loads `.env.local` so saved provider keys are recognized without printing the secret. The top-level score is a software/product readiness score: runtime, local safety, tests, docs, provider wiring, and release hygiene.

The odds-key readiness check must verify both credential authentication and an actual MLB market request. The provider sports catalog does not consume usage credits and can remain available after the account's odds quota is exhausted, so catalog access alone must never authorize verified odds or `BET` output. The one-market probe reports quota exhaustion separately and keeps the application fail-closed.

Quota protection is an operational gate, not just a dashboard warning:

- Recurring source health, live-data health, data-edge, auto-update, and release-readiness paths do not call paid odds endpoints.
- Automatic Decision Board discovery is zero-credit and does not persist duplicate recommendation rows.
- Only an explicit `refresh=1` Decision Board request may fetch paid league and event markets.
- Paid responses are cached for two minutes, and `OUT_OF_USAGE_CREDITS` opens a shared in-process circuit that blocks repeat network calls.
- The free sports catalog refreshes provider quota headers and can close the circuit only after it reports replenished credits.
- One manual `Refresh Market Prices` action has a 12-credit estimated ceiling and preserves a five-credit reserve when the provider reports a remaining balance.

These controls prevent background polling from consuming a monthly quota. They do not create new provider credits, guarantee prop coverage, or turn `PRICE_CHECK_ONLY` output into verified betting permission.

It deliberately separates betting proof into `Evidence Gates`. Missing settled-bet evidence, missing licensed injury feeds, or locked tennis automation must stay visible, but they should not make the local software look broken.

The dashboard version reports three separate lanes:

- `Local App`: runtime, verification, dashboard assets, localhost binding, and tracked-secret safety.
- `Data Edge`: verified odds, stats/injury feeds, tennis data gates, decision-log quality, and validation status.
- `Commercial Readiness`: GitHub, CI, docs, validation evidence, and buyer-grade diligence blockers.

The same report includes operational evidence that must be interpreted separately from its top-level software score:

- `localLedger`: append-only ledger integrity, malformed lines, duplicate identifiers, digest conflicts, invalid records, and evaluation count.
- `outbox`: Supabase configuration, pending/retryable/terminal counts, synchronization count, and integrity issues.
- `modelRegistry`: registry validity, registered and validated model counts, and policy identity.
- `runtimeControls`: operator-write boundary status and Statsig fail-closed status without returning secrets.

A top-level `shippable-with-warnings` result means the local software checks passed with disclosed warnings. It does not mean verified bets are authorized, providers are commercially licensed, remote synchronization is complete, model profitability is proven, or a public deployment is safe.

## Local And LAN Security Boundary

The supported local launch is `npm run launch`, which binds to `127.0.0.1` and requires a one-time operator token for every protected API read and write.

The supported private-network phone launch is `Open Bear Edge On Phone.command`. It suppresses any configured long-lived operator credential, generates a process-scoped random 32-byte bootstrap token, passes only its SHA-256 digest into the request verifier, and prints the bootstrap URL with that generated token in the URL fragment. A configured credential used by the desktop launcher is opened directly in the browser process and never returned through normal launcher output; `--no-open` prints only the unauthenticated base URL. The dashboard stores the active token in session storage and removes the fragment immediately. Read-only routes remain public to the trusted LAN; all write routes require `Authorization: Bearer <token>`.

The safe status route `/api/operator-auth` never returns the token. Losing the generated token requires restarting the LAN process. Plain HTTP on a private LAN is not a public or commercial deployment and must never be port-forwarded.

## Remote Controls And Projection

Supabase synchronization requires `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`, and a UUID `SUPABASE_OWNER_USER_ID`. Until all three values are valid, `/api/sync-health` reports disabled and `/api/sync/run` returns HTTP `503`. Pending events stay in `data/logs/sync_outbox.jsonl`; terminal failures and integrity issues are release blockers.

Statsig requires `STATSIG_SERVER_SDK_SECRET` only when remote presentation or shadow controls are desired. Missing configuration and initialization errors return a secret-safe `control_fallback`. The gates `bear_edge_provenance_ui` and `bear_edge_shadow_model` must never be wired into deterministic betting authority.

## GitHub / CI

GitHub Actions CI is present at:

```text
.github/workflows/ci.yml
```

The current GitHub CLI token must include the `workflow` scope before workflow changes can be pushed. The workflow runs:

```bash
npm ci
npm run verify
```

## Secret Handling

Real credentials stay local in `.env.local`, which is ignored by git.

The local web server binds to `127.0.0.1` by default. The authenticated LAN launcher protects writes, but it does not add HTTPS or durable user identity. Do not expose it publicly without HTTPS, durable authentication/session management, rate limiting, encrypted secret storage, and a security review.

Ignored local paths include:

- `.env.local`
- `.tools/`
- `.codex/`
- `node_modules/`
- `data/cache/`
- runtime logs and JSONL decision logs under `data/logs/`

## Data Integrity Limits

Bear Edge is not production-complete until these are improved:

- More verified odds providers beyond The Odds API.
- Verified tennis schedule, roster, and stat provider before automated tennis candidates.
- More robust injury and lineup feeds.
- Historical backtesting dataset large enough to measure edge by market type.
- Routine wager settlement plus separate shadow outcome and exact-book closing-price capture with retained source digests.
- Sufficient chronological out-of-sample evidence to validate exact model, version, and market-family registry entries.
- Optional remote audit projection configured and reconciled if centralized retention is required; migration `20260718010000_shadow_evidence_v21.sql` is version-controlled but must be deployed and post-deployment-audited before new evidence records can synchronize.
- Security review before any public exposure; authenticated private-LAN HTTP is not public deployment.

Screenshots, screen recordings, optical-character-recognition text, ESPN pages, and manually confirmed captures are useful operator evidence but are not equivalent to licensed, timestamped sportsbook or lineup providers. Research estimates and ranked candidates are not “best bets.” External providers can be stale, blocked, quota-exhausted, rate-limited, or wrong. No test suite, short winning streak, backtest, model, or product-readiness score guarantees future profitability.

## Buyer-Grade Direction

The path from local tool to sellable product is:

- Keep deterministic engine gates separate from research text.
- Expand verified provider coverage.
- Prove positive CLV before claiming predictive value.
- Add repeatable backtests and market-level calibration reports.
- Package deployment with authentication, encrypted secret storage, and access controls.
