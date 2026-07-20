# MLB Local Simulator Design

## Objective

Replace the paid Deepnote layer with a free local Node.js simulation stack inside Bear Edge while preserving the existing immutable ledger, DraftKings execution discipline, calibration gates, and fail-closed behavior.

## First Vertical Slice

Implement player total-bases simulation as the first fully testable market family. The engine accepts only timestamped, pregame inputs and produces threshold-specific probabilities for 0.5, 1.5, and 2.5 total bases without inheriting probabilities across ladders.

## Inputs

- Canonical game and player identifiers
- Captured-at timestamp and pregame status
- Confirmed lineup flag and batting-order slot
- Projected plate-appearance distribution
- Per-plate-appearance probabilities for 0, 1, 2, 3, and 4 total bases
- Exact DraftKings threshold and price
- Exact opposite-side price when available
- Market and source timestamps
- Data-quality and provenance flags

The engine rejects missing or non-normalized probability distributions, live games, absent DraftKings prices, stale captures, unconfirmed lineups for official recommendations, and one-sided markets when no-vig calibration is requested.

## Model

A deterministic seeded Monte Carlo model samples plate appearances and total-base outcomes. Each threshold is settled independently from the simulated game total. The output includes raw model probability, paired no-vig probability, market-shrunk probability, fair American price, edge, expected value, quarter-Kelly diagnostic, maximum acceptable DraftKings price, uncertainty metadata, and simulation count.

## Decision Boundary

The first slice is research and shadow-mode only. It may emit BET, LEAN, WAIT, or PASS classifications for testing, but the existing global evidence gate remains authoritative and prevents real-money promotion until exact-book pricing, prospective settlements, CLV, and calibration thresholds are satisfied.

## Persistence

The local JSONL ledger remains authoritative. Supabase receives immutable projection rows for market snapshots and simulation runs. Existing decision and settlement tables remain unchanged. New tables are append-only, user-owned, RLS-protected, and keyed by canonical market fingerprint.

## Interfaces

- `simulateTotalBasesMarket(input)` returns a deterministic simulation result.
- `evaluateTotalBasesCandidate(input)` combines simulation output with the existing Bear Edge verdict math.
- `npm run simulate:mlb:tb -- --input <file>` runs one local card and writes JSON output.
- Supabase stores raw input snapshots, result snapshots, model version, seed, and captured timestamps.

## Verification

- Unit tests for deterministic output, threshold independence, distribution validation, market pairing, and fail-closed gates
- Property-style tests that probabilities sum to one and ladder probabilities are monotonic
- Existing `npm run verify` remains the release gate
- GitHub Actions records a red test before implementation and a green run after implementation
