# Production Readiness

Bear Edge is designed as a local betting research and decision engine. The app should never pretend to guarantee winning picks. Its product value is repeatable math, strict risk gates, transparent source timestamps, and a decision log that can be audited against closing-line value and settled results.

## Current Hard Gates

- Deterministic `PASS` / `WAIT` / `BET` logic in code, not model-generated verdicts.
- Real sportsbook odds are required before evaluation.
- Missing odds block evaluation.
- Stale injury/source data can force `WAIT`.
- Tilt-lock can force `PASS`.
- Parlays are capped at 3 legs.
- Alt props are capped at 2 legs.
- Correlated parlay legs are rejected by default.
- Bankroll and sportsbook-minimum pressure are surfaced before submission.
- Decision-log quality blocks blind trust in hit rate and ROI when bets are not settled.

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

It deliberately separates betting proof into `Evidence Gates`. Missing settled-bet evidence, missing licensed injury feeds, or locked tennis automation must stay visible, but they should not make the local software look broken.

The dashboard version reports three separate lanes:

- `Local App`: runtime, verification, dashboard assets, localhost binding, and tracked-secret safety.
- `Data Edge`: verified odds, stats/injury feeds, tennis data gates, decision-log quality, and validation status.
- `Commercial Readiness`: GitHub, CI, docs, validation evidence, and buyer-grade diligence blockers.

## GitHub / CI

GitHub Actions CI should be added at:

```text
.github/workflows/ci.yml
```

The current GitHub CLI token must include the `workflow` scope before that file can be pushed. Once enabled, CI should run:

```bash
npm ci
npm run verify
```

## Secret Handling

Real credentials stay local in `.env.local`, which is ignored by git.

The local web server binds to `127.0.0.1` by default. Do not expose it on a public interface without adding authentication, encrypted secret storage, HTTPS, and a security review.

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
- Settlement workflow with routine closing-line capture.
- Security review before exposing the app outside localhost.

## Buyer-Grade Direction

The path from local tool to sellable product is:

- Keep deterministic engine gates separate from research text.
- Expand verified provider coverage.
- Prove positive CLV before claiming predictive value.
- Add repeatable backtests and market-level calibration reports.
- Package deployment with authentication, encrypted secret storage, and access controls.
