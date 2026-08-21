# System Map and Separation Boundaries

## 1. Bear Edge

**Intended role:** decision engine, exact-price discipline, risk controls, recommendation evaluation, audit ledger, settlement handling, synchronization, and operator dashboard.

**Strongest inspected code base:** PR #3, `codex/bear-edge-release-candidate`, locked at commit `2ca03a24fc1af20a3c03086757cd1dfb85c43d1e`.

**Verified release-candidate claims from the PR:** 414 tests and type checking passed; append-only local ledger; optional Supabase projection; risk, calibration, CLV, uncertainty, quota, portfolio, drawdown, provider-readiness, and operator-auth controls.

**Authority state:** `PRICE_CHECK_ONLY` / research-only. Four registered models were described as research-only, with zero eligible settled out-of-sample predictions and zero closing-line evidence at the inspected checkpoint.

**Historical baseline:** the v10.1 JSX artifact is preserved as a prototype/history source, not assumed to be the running application.

## 2. Sweet Bear DraftKings Predictions

**Intended role:** independent prediction research, recommendation lifecycle, evidence capture, actual-wager ledger, settlement, and model evaluation for DraftKings Predictions.

**Verified data footprint:**

- Airtable `Sweet Bear Betting Intelligence` contains 15 recommendation records.
- It contains 9 records explicitly classified as actual DraftKings Predictions wagers.
- It contains 14 settlement records, including KBO shadow outcomes and July 29 settled wager-linked records.
- Several July 29 records identify the model only as `Sweet Bear algorithm; exact version unresolved`.
- KBO records reference `KBO-LIVE-POISSON-v0.2` and `kbo-live-poisson-v0.1-shadow`.

**Critical limitation:** version identity, feature provenance, exact line snapshots, calibration eligibility, and model reproducibility are not complete enough to treat the settled records as validated model evidence.

## 3. Sweet Bear MLB Machines

### Pitcher strikeout machine

A dedicated branch and packaged machine exist. The branch is substantially ahead of the early master history and contains simulator, Statcast, training, validation, artifact, registry, tests, and a packaged tarball.

### Batter-history machine

A Retrosheet acquisition branch and PR exist. It is source-acquisition work, not proof of a complete validated batter model.

### Unified MLB machine v1

PR #8 materialized a unified research machine and attempted to build 2024-2025 history. Tests passed, the history build completed, and the integrity validator passed its hashes/schema checks. The coverage gate then failed at 787 batters.

Reported build summary:

- 341,183 plate appearances
- 787 batters
- 1,108 pitchers
- 30 teams
- 4,858 games

The data are not accepted as complete.

### Unified MLB machine v2

A separate branch exists with direct MLB modules and history-source code. It remains separate from v1 and is not declared canonical by this archive.

### MLB total-bases simulator

PR #4 is a deterministic Monte Carlo experiment. It remains shadow-only, was not wired into the authoritative ledger at the inspected checkpoint, and does not establish a trained or calibrated edge.

## 4. Sweet Bear vs Bear Edge Showdown

The Drive handoff describes a paired comparison system requiring identical event, market, line, selection, and evidence cutoff. Its stated winner gate is:

- at least 500 paired settled predictions,
- at least 100 distinct events,
- event-clustered 95% bootstrap interval excluding zero.

The handoff also says a local implementation had 658 passing tests. That code was not independently located in the inspected GitHub master or the canonical release-candidate PR. Treat it as an external implementation claim until the exact repository, commit, and files are reconciled.

## 5. sweetbear-edge statistical substrate

The Drive verification package describes a Python engine for de-vigging, calibration, Kelly sizing, walk-forward testing, and cluster-aware inference. It explicitly states that no sport-specific model exists in that repository.

This is evaluation infrastructure, not a prediction machine.

## 6. Sweet Bear Kalishi Predicts

A complete design, handoff, independent audit, amendments, schemas, validation plan, and proposed skills exist.

It is intentionally separate from DraftKings Predictions.

Verified non-implementation boundary:

- no Kalshi credentials used,
- no orders placed,
- no production ledger or bankroll created,
- no model trained,
- no production probability generated,
- no recommendation inferred from screenshots.

## 7. Screenshot-to-ledger

The design and implementation plan define a Python 3.12 local CLI using immutable SQLite records, SHA-256 and perceptual-hash evidence identity, fixture-driven OCR tests, DraftKings ticket normalization, deduplication, ticket-level P&L, model matching, separate model/execution grades, and append-only corrections.

The documents are preserved as design/plan evidence. They are not automatically treated as proof of a completed deployed application.

## 8. Neutral infrastructure allowed across systems

Only deterministic, stateless primitives may be shared, such as canonical JSON, SHA-256, UUIDs, timestamp parsing, odds conversion, Brier/log-loss calculations, bootstrap utilities, parameterized fee calculators, and append-only file primitives.

Learned parameters, bankroll state, recommendations, performance histories, platform credentials, and authorization decisions may not be shared.
