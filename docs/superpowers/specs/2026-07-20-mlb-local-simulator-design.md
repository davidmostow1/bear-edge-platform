# MLB Local Simulator Architecture

## Purpose

Build a free, reproducible MLB simulation pipeline inside the existing Bear Edge Node.js repository. The pipeline replaces Deepnote with local execution while preserving the existing immutable decision ledger, DraftKings execution discipline, and audit-first verdict gates.

## Scope

The first production slice implements player total-bases markets end to end. The common math, validation, snapshot, and ledger contracts are deliberately reusable by pitcher strikeouts, hits, RBI, moneylines, run lines, and game totals.

The system does not scrape authenticated sportsbook sessions, invent unavailable prices, or issue a BET without a timestamped DraftKings offer. Cross-book prices are evidence and calibration inputs only.

## Architecture

1. **Source observations** hold timestamped facts from MLB, official clubs, weather providers, air-quality providers, and sportsbooks.
2. **Validated market snapshots** identify the event, player, market family, threshold, DraftKings price, paired opposite price when available, and data-completeness state.
3. **Local simulator modules** consume only pregame observations whose timestamps precede the offer evaluation time.
4. **Math audit functions** calculate implied probability, paired no-vig probability, fair American odds, expected value, and fractional Kelly using deterministic formulas.
5. **Risk gates** return BET, LEAN, WAIT, or PASS based on price integrity, data completeness, minimum expected value, uncertainty, and correlation.
6. **Supabase append-only tables** preserve observations, market snapshots, simulation runs, candidates, closing prices, and outcomes.
7. **Local JSON and CSV output** remains available when Supabase credentials are absent, so the engine never depends on a paid notebook or cloud runtime.
8. **GitHub Actions** runs type checking and tests for every feature-branch change.

## Total-Bases Model

### Input contract

A total-bases simulation input contains:

- canonical event ID and scheduled start time
- player and team identifiers
- confirmed lineup status and batting-order slot
- opposing starting pitcher and handedness
- expected plate appearances
- per-plate-appearance probabilities for out/walk-or-HBP, single, double, triple, and home run
- optional uncertainty scenarios
- exact DraftKings threshold and American price
- paired opposite price when available
- offer capture timestamp
- source references and data-quality flags

The outcome probabilities must be finite, non-negative, and sum to one within a strict tolerance. A walk or hit-by-pitch produces zero total bases but consumes a plate appearance.

### Simulation

The simulator uses a deterministic seeded pseudo-random generator. For each trial it samples the requested number of plate appearances, maps the categorical outcome to 0, 1, 2, 3, or 4 total bases, and records the player total.

Every exact threshold is evaluated independently. For a standard over/under line such as 1.5, the output includes win and loss probabilities. For a whole-number line, the output also includes push probability. Alternate ladders are separate market evaluations and cannot inherit another threshold's probability.

### Market calibration

When both sides are present, the market prior is the paired no-vig probability. When only one side is present, no no-vig probability is created. The model may still report its raw baseball probability, but the candidate is blocked from BET status.

The final model probability is a configurable convex combination of the baseball simulation and the paired no-vig prior. The default shrinkage weight is conservative and rises when data is incomplete.

## Verdict gates

- **BET:** exact DraftKings price verified; paired market available; confirmed lineup; complete critical data; positive EV at or above the configured gate; Kelly stake above zero; no portfolio block.
- **LEAN:** verified price and positive estimated EV, but below the full BET gate or with moderate uncertainty.
- **WAIT:** missing lineup, stale source, missing paired price, unresolved injury/platoon status, or DraftKings execution price not verified.
- **PASS:** verified market is negative EV, exceeds maximum acceptable price, or fails a hard risk gate.

Only one official total-bases wager per day is allowed unless two candidates are demonstrably independent and both clear every gate.

## Supabase data model

Additive tables:

- `source_observations`: immutable timestamped source facts and payload digests
- `market_snapshots`: immutable sportsbook offers and opposite-side prices
- `simulation_runs`: model version, seed, iterations, inputs, output distribution, and data-completeness score
- `simulation_candidates`: candidate metrics, fair price, EV, Kelly, maximum acceptable price, verdict, and risk flags
- `closing_market_snapshots`: closing prices linked to the original offer
- `calibration_events`: settled binary/push outcomes and scoring metrics

All tables use row-level security and authenticated-user ownership. Old rows are never updated to rewrite a prior prediction. Corrections are new records or amendments.

## Failure behavior

The engine fails closed. Invalid probability vectors, missing event identity, stale offer timestamps, impossible American odds, unsupported thresholds, or absent DraftKings execution prices produce explicit validation errors or WAIT/BLOCK verdicts. No fallback silently invents data.

Supabase write failures do not change the mathematical result. They are reported separately and the local output is retained for retry.

## Testing

Tests cover:

- exact American-odds conversions
- paired-side de-vigging
- fair-price conversion
- EV and fractional Kelly
- deterministic total-bases trials
- push handling on whole-number thresholds
- independent ladder evaluation
- validation failures
- market shrinkage
- verdict gates
- Supabase payload construction without transmitting secrets

GitHub Actions runs `npm run verify` on pushes and pull requests.

## Security and cost constraints

- No new paid service is required.
- No sportsbook credentials are stored in Git.
- Supabase keys and user JWTs come from environment variables.
- The local engine works without Supabase and emits files instead.
- No service-role key is required by the CLI.
- Existing `master` is not modified directly; work occurs on `feat/mlb-simulator-v1` and is reviewed through a pull request.
