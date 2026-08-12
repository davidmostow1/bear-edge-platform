# Bear Edge Audit And Operations Runbook

## Purpose And Authority

This runbook is the supported operating procedure for the local Bear Edge application. The append-only local ledger is the authoritative decision record. Dashboard labels, optional remote projections, manually reviewed screenshots, model estimates, and provider status summaries are subordinate evidence and cannot silently change a deterministic verdict.

The word `BET` has a narrow technical meaning in this application. A qualified persisted BET requires every deterministic gate to pass, exact fresh sportsbook evidence to produce `VERIFIED_BETS_ALLOWED`, an exact `validated` model-registry entry with immutable passing calibration evidence, and a successfully persisted audit record. Anything less must remain research, price check, `WAIT`, or `PASS`.

## Non-Negotiable Limitations

- Screenshots, screen recordings, optical-character-recognition output, ESPN pages, and manual confirmations are operator evidence. They are not licensed sportsbook, roster, injury, or lineup feeds.
- Research estimates, ranked candidates, price-check targets, and shadow-model output are not best bets. The dashboard may display `Best Bets` only when at least one qualified persisted BET exists.
- Private-LAN HTTP with bearer-token write protection is not a public deployment. It has no HTTPS, durable identity provider, multi-user authorization, or public-network hardening.
- Provider requests can fail, return stale or incomplete data, disagree with the visible book, be rate-limited, or exhaust quota. Bear Edge fails closed; it does not infer missing prices.
- A software-readiness score, test pass, backtest, calibration report, winning streak, or short-term return does not guarantee future profitability.
- Never use a manually typed, guessed, stale, or unmatched price to satisfy a provider-evidence gate. Never fabricate source digests or closing-line evidence.

## Runtime Prerequisites

- Node.js 20 or newer.
- npm.
- A private local machine for the authoritative ledger and secrets.
- `.env.local` for real provider credentials. The file is ignored by Git.
- A The Odds API subscription with remaining credits for automatic market pricing.
- A verified licensed provider before commercial injury, lineup, or tennis automation.
- Optional Supabase and Statsig credentials only when those secondary services are intentionally enabled.

Install dependencies from the repository root:

```bash
npm install
```

If the global runtime is unavailable on this Mac, prepend the bundled runtime path used by the application environment before running npm commands.

## Local Launch

Start the supported localhost application and open the dashboard:

```bash
npm run launch
```

Start without opening a browser:

```bash
npm run launch -- --no-open
```

The default address is:

```text
http://127.0.0.1:3000/dashboard
```

Localhost and LAN launches both require operator authentication. Set `BEAR_EDGE_OPERATOR_TOKEN` before launch when command-line API calls need a stable token; otherwise the launcher generates a one-time bootstrap token for the browser session.

## Private-LAN Launch

Start the supported same-Wi-Fi mode:

```bash
npm run launch:lan -- --no-open
```

The launcher checks the Mac's private address, binds the server for LAN access, and requires bearer authorization for every unsafe HTTP method. The phone launcher never prints the configured long-lived credential: it suppresses that value for the child process, generates a process-scoped random 32-byte base64url bootstrap token, and prints the one-time URL containing `#operatorToken=...`.

Open the complete bootstrap URL in the operator browser. The fragment is not sent to the server. Dashboard JavaScript stores the token in session storage, removes the fragment immediately, and adds `Authorization: Bearer <token>` to same-origin write requests. The server stores only a SHA-256 digest and compares candidate digests with a timing-safe comparison.

The safe status endpoint never returns the raw token:

```bash
curl -fsS http://127.0.0.1:3000/api/operator-auth
```

Unauthenticated LAN reads remain available. Missing, malformed, or invalid authorization on a LAN write returns HTTP `401`. If a generated token is lost, stop and restart the LAN process. Do not forward the port or expose it to the public internet.

## Zero-Credit Health And Readiness

These checks do not intentionally call a paid odds endpoint:

```bash
curl -fsS http://127.0.0.1:3000/health
curl -fsS http://127.0.0.1:3000/api/system-audit
curl -fsS http://127.0.0.1:3000/api/release-readiness
curl -fsS http://127.0.0.1:3000/api/sync-health
curl -fsS http://127.0.0.1:3000/api/statsig-control
```

Do not use `/api/odds/markets` as a health check. It is a paid market endpoint. The explicit Decision Board `Refresh Market Prices` action is also a paid boundary.

## Evaluation

Evaluate a checked-in example into an isolated temporary audit ledger:

```bash
npm run evaluate -- examples/sample-bet.json --log-path /tmp/bear-edge-example-decision-log.jsonl
```

Evaluate and persist a real operator-reviewed input to the authoritative default ledger:

```bash
npm run evaluate -- path/to/reviewed-input.json
```

Inspect the current input schema:

```bash
npm run evaluate -- --schema
```

The CLI intentionally has no unlogged evaluation mode. An input file is not automatically verified because it parses. Real sportsbook evidence, model authority, freshness, and every risk gate still apply.

## Settlement

Settlement is financial wager history and is an append-only write. Use the evaluation identifier from the decision log and only a genuine graded outcome from an existing canonical `BET` evaluation:

```bash
curl -fsS -X POST http://127.0.0.1:3000/api/settle \
  -H "authorization: Bearer ${BEAR_EDGE_OPERATOR_TOKEN:?set BEAR_EDGE_OPERATOR_TOKEN before launch}" \
  -H 'content-type: application/json' \
  --data '{"evaluationId":"eval_id_from_decision_log","outcome":"win","closingOdds":100,"stake":10,"profit":10}'
```

For calibration-grade win/loss evidence, include both closing sides and retained final closing-line evidence as documented in `docs/CALIBRATION_READINESS.md`. A source digest must identify the genuine retained artifact; it must not be derived from manually typed odds.

On LAN, use the dashboard bootstrap session or add a protected bearer header. Never paste the raw token into documentation, tracked scripts, screenshots, or shared shell history.

## Shadow Outcome And Closing Evidence

Do not settle `WAIT` or `PASS` evaluations. Grade eligible pre-event research and shadow evaluations with two separate non-financial records:

- `POST /api/prediction-outcomes` records the official final event and market result.
- `POST /api/closing-prices` records the final two-sided price from the exact sportsbook evaluated.

Both writes require the same operator authorization as every other unsafe route. The complete request contracts are exposed by `GET /schemas` as `predictionOutcomeInput` and `closingPriceInput`, and full payload examples are documented in `README.md`.

The outcome source must be an official final result with a retained source locator, capture time, source time, and genuine source digest. The closing source must be a verified provider capture; it must identify the evaluated sportsbook, contain integer American odds for both sides, occur no later than market close, and describe a market that closed no later than event start. Neither record may contain stake, profit, or other financial settlement fields.

Corrections never mutate prior evidence. Append a successor with `supersedesId` equal to the latest record of the same type for that evaluation. Initial records require `supersedesId: null`; skipped predecessors, cross-evaluation references, and branched histories are rejected.

The calibration projection requires both latest valid records before it treats a shadow evaluation as settled. This creates statistical evidence only. It does not create a wager, change a verdict, or grant `VERIFIED_BETS_ALLOWED`.

## Supabase Audit Projection

Supabase is optional and secondary. Configure all values in `.env.local`:

```text
SUPABASE_URL=https://your-project.supabase.co
SUPABASE_SERVICE_ROLE_KEY=server-side-secret
SUPABASE_OWNER_USER_ID=00000000-0000-4000-8000-000000000000
```

`SUPABASE_URL` must be a credential-free HTTPS origin. `SUPABASE_OWNER_USER_ID` must be a UUID. Restart the server after configuration.

Inspect synchronization health without writing remotely:

```bash
curl -fsS http://127.0.0.1:3000/api/sync-health
```

Only when the result reports `configured: true` and `enabled: true`, run an explicit synchronization:

```bash
curl -fsS -X POST http://127.0.0.1:3000/api/sync/run
```

Without valid configuration, manual synchronization returns HTTP `503`. In LAN mode it also requires the operator bearer token. The worker projects immutable records; it does not mutate the authoritative local ledger.

Migration `20260718010000_shadow_evidence_v21.sql` must be deployed before the worker can project `prediction_outcome` or `closing_price` records. After deployment, verify the migration ledger, table grants, forced RLS, owner policies, append-only triggers, correction lineage, and Supabase security and performance advisors before enabling synchronization. The local ledger remains authoritative if remote projection fails.

## Statsig Presentation And Shadow Controls

Statsig is optional. Configure the following only when remote controls are desired:

```text
STATSIG_SERVER_SDK_SECRET=server-side-secret
STATSIG_ENVIRONMENT=development
BEAR_EDGE_OPERATOR_ID=local_operator
```

The only allowed gates are:

- `bear_edge_provenance_ui`: controls whether evidence and provenance details are initially expanded.
- `bear_edge_shadow_model`: records `shadow` versus `control` assignment for non-authoritative comparison.

These gates cannot set or alter a probability, verdict, permission, stake, settlement, provider state, or operator authorization. Missing configuration, initialization timeout, evaluation error, or logging error remains secret-safe and fails to `control_fallback` or a false gate value.

## Calibration

Project the authoritative ledger and inspect all eligibility exclusions:

```bash
npm run audit:calibration
```

This writes the readiness reports and `data/calibration/calibration_dataset.jsonl`. It does not promote a model.

After the dataset contains eligible chronological rows with genuine final closing evidence, generate an exact market-family report:

```bash
npm run calibrate -- \
  --input data/calibration/calibration_dataset.jsonl \
  --market-family pitcher_strikeouts \
  --model-id poisson_count_v1 \
  --model-version 1.0.0 \
  --output data/reports/pitcher_strikeouts_calibration.json
```

The command fails on an empty dataset, malformed rows, duplicate observations, missing flags, or unsupported flags. A generated report still has no production authority until its immutable identifier and digest are registered and every promotion threshold in `models/registry.json` passes.

## Verification, Release Audit, And Packaging

Run complete local type checking and tests:

```bash
npm run verify
```

Generate release-readiness reports:

```bash
npm run audit:release
```

Build a portable package only after verification succeeds:

```bash
npm run package:portable
```

The package command reruns verification and writes a `.tgz` file under `dist/`. Packaging proves that the local artifact can be assembled. It does not prove provider access, remote synchronization, model validation, public-deployment security, or profitability.

## Exact Status Vocabulary

### Verdicts

- `BET`: every deterministic decision gate represented by the evaluation cleared. For a qualified displayed call, the record must also have `VERIFIED_BETS_ALLOWED`, a `validated` model, and successful persistence.
- `PASS`: a disqualifying or non-advantageous condition is present, such as a risk rule, insufficient threshold clearance, tilt lock, prohibited correlation, or invalid portfolio exposure. Do not wager.
- `WAIT`: the opportunity cannot be authorized because required evidence is missing, stale, unmatched, unresolved, or not independently validated. Recheck only when the named evidence changes.

### Operational Permissions

- `WAIT`: official context is unavailable or the engine cannot even support a price-check workflow.
- `PRICE_CHECK_ONLY`: research candidates exist, but verified exact sportsbook evidence is absent or insufficient. No automatic BET authorization.
- `VERIFIED_BETS_ALLOWED`: required official context and exact fresh requested-bookmaker evidence passed the odds-evidence boundary. This permission alone is insufficient; model and risk gates must still pass.

### Model Statuses

- `research_only`: exploratory output with no production probability authority.
- `shadow`: evaluated for comparison without production decision authority.
- `validated`: exact model identifier, version, and market family have immutable passing calibration evidence under the registered policy.
- `retired`: no longer eligible for production decisions.

### Synchronization States

- `pending`: retained locally and waiting for a synchronization attempt.
- `in_flight`: a worker has started the current attempt.
- `synchronized`: the immutable record and digest are confirmed in the remote projection.
- `retryable_failure`: a transient remote failure occurred; the record stays local with a scheduled next attempt.
- `terminal_failure`: a non-retryable authentication, schema, digest-conflict, or equivalent failure requires operator intervention. Release readiness must not ignore it.
- `local_only`: dashboard provenance label for a record intentionally retained only in the authoritative local ledger.
- `not_persisted`: dashboard provenance label for a research display that has no authoritative record.

### Decision Board Evidence Classes

- `Research Candidate`: no persisted audit record exists. The row is discovery context only.
- `Price Check`: an audit context exists, but no exact priced market is attached or the row is not in `priced` status.
- `Waiting for Evidence`: a priced row exists but does not qualify, normally because its verdict, permission, model authority, freshness, or persistence gate is incomplete.
- `Passed Market`: the persisted/evaluated verdict is `PASS`.
- `Qualified BET`: the verdict is `BET`, permission is `VERIFIED_BETS_ALLOWED`, model status is `validated`, and the audit record is persisted with matching identity. Only this class may appear under `Best Bets`.

### Operator Authorization Modes And Failures

- `local_open`: an explicitly embedded or test-only policy that does not require bearer authorization. The shipped server and desktop launchers do not use this mode.
- `bearer_token`: every protected `/api/*` read and every unsafe HTTP method require a verified bearer token. Only static assets, health, schemas, and the safe operator-auth status endpoint remain public.
- `missing_bearer_token`: no Authorization header was supplied; HTTP `401`.
- `malformed_bearer_token`: the header is not exactly a Bearer token; HTTP `401`.
- `invalid_bearer_token`: the supplied token digest does not match; HTTP `401`.
- `verified_bearer_token`: digest comparison succeeded and the write may proceed to normal route validation.

### Odds Provider Readiness And Failures

- `ready`: the key authenticated and an actual MLB market probe succeeded.
- `quota_exhausted`: the key authenticated but zero credits or `OUT_OF_USAGE_CREDITS` blocked paid access; non-retryable until refill or reset.
- `invalid_key`: missing, invalid, or deactivated provider credentials; replace the key.
- `rate_limited`: provider frequency limit or HTTP `429`; retry only after backoff.
- `provider_error`: another provider/network failure; inspect provider status and safe server logs.
- `missing`: no active or saved key is available.
- `restart_needed`: a key is saved locally but not active in the running process.
- `unmatched`: provider markets were reached, but event, participant, market, side, or line did not match generated candidates.
- `price_check_only`: key/configuration state did not produce verified priced candidates.
- `verified`: current candidate pricing and required live evidence passed the data-edge check.

### Release Check Classes

- `pass`: the check completed and its required local condition is satisfied.
- `warn`: the application remains usable with a disclosed operational deficiency that needs action.
- `fail`: a required integrity, security, or runtime condition failed.
- `info`: an external evidence or commercialization gate is incomplete but is not disguised as a local software failure.

HTTP route failures use HTTP `400` for malformed or invalid operator input, `401` for failed operator authorization, `403` for a prohibited nonlocal operation when no secure authorization boundary exists, `404` for unknown routes, `502` for a configured remote synchronization/provider run that failed, and `503` when an optional required service such as Supabase synchronization is disabled. The JSON error body is secret-safe; consult the route response, audit panels, and local logs rather than retrying blindly.

## Current Verified Local Snapshot

The following is a dated operational snapshot, not a permanent guarantee. It was checked on July 18, 2026 in the current local checkout:

- Local dashboard health: available at `http://127.0.0.1:3000`.
- Release result: `blocked`, score 64, 18 pass, 3 warnings, 1 failure, and 4 informational evidence gates.
- Betting permission: `PRICE_CHECK_ONLY`.
- The Odds API: key configured but current verified pricing unavailable; the last readiness evidence reports no usable credit and no priced candidates.
- Decision Board: research candidates only, 0 priced candidates, and no authorized qualified BET output.
- Authoritative ledger: 37 retained rows, including 20 canonical evaluations and 17 legacy rows; 0 malformed lines, 0 duplicate identifiers, 0 digest conflicts, and 0 schema-invalid canonical records. The legacy rows are an explicit release blocker until non-destructively archived or migrated.
- Model registry: valid, 4 registered entries, 0 validated entries; all current entries are `research_only`.
- Supabase: not configured; synchronization disabled; 20 local pending outbox records, 0 retryable failures, 0 terminal failures, and 0 outbox integrity issues.
- Statsig: not configured locally; `control_fallback`, fail closed, presentation/shadow authority only.
- Localhost and private-LAN API boundary: bearer authentication required by both shipped launch paths. The token is bootstrapped in a URL fragment, moved to session storage, removed from the visible URL, and attached only to same-origin requests.
- Private-LAN launcher smoke: generated token present only in URL fragment, unauthenticated write returned `401`, authenticated write returned `200`, token absent from logs, and an isolated authoritative record persisted without containing the token.
- Desktop and phone-width browser checks: no horizontal overflow at 1440 by 900 or 390 by 844; Decision Board classifications and write controls remained readable.
- A physically separate phone/device test was not available in the execution environment and remains `BLOCKED_EXTERNAL`. It is not recorded as passed.

Before any real wagering decision, rerun zero-credit readiness, confirm provider quota and exact market evidence, complete model calibration authority, settle and grade the historical ledger, and independently review the resulting qualified record. Bear Edge is a decision-control system, not a promise of winning bets.
