# MLB Local Simulator Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a free local player total-bases simulator, DraftKings market evaluator, immutable Supabase projection, and command-line runner to the existing Bear Edge release candidate.

**Architecture:** A deterministic seeded Monte Carlo module generates threshold-specific total-bases probabilities from validated plate-appearance and per-PA outcome distributions. A market adapter applies paired no-vig normalization and existing Bear Edge EV/Kelly verdict math. Local JSON output remains authoritative; Supabase stores append-only projections.

**Tech Stack:** Node.js 20 CommonJS, native `node:test`, existing Bear Edge decision engine, PostgreSQL 17/Supabase, GitHub Actions.

## Global Constraints

- No paid Deepnote dependency.
- DraftKings is the only execution book.
- No official recommendation without exact current DraftKings line and price.
- No no-vig probability from a one-sided market.
- No live-game recommendation in this first slice.
- Each total-bases threshold is evaluated independently.
- Existing global evidence and calibration gates remain authoritative.
- Local append-only records remain the source of truth.

---

### Task 1: Total-Bases Simulation Contract

**Files:**
- Create: `test/mlb-total-bases-simulator.test.js`
- Create: `src/mlb/total-bases-simulator.js`

**Interfaces:**
- Produces: `simulateTotalBasesMarket(input)`
- Input: validated object with `seed`, `iterations`, `plateAppearances`, `outcomeProbabilities`, and `thresholds`
- Output: deterministic threshold probabilities and simulation metadata

- [ ] Write tests proving deterministic seeded output, independent 0.5/1.5/2.5 settlement, monotonic ladder probabilities, and rejection of invalid distributions.
- [ ] Push tests without implementation and confirm GitHub Actions fails because the module is missing.
- [ ] Implement the smallest simulator satisfying the tests.
- [ ] Run the pull-request CI and confirm the full repository verification passes.

### Task 2: DraftKings Market Evaluation

**Files:**
- Create: `test/mlb-total-bases-market.test.js`
- Create: `src/mlb/total-bases-market.js`
- Modify: `src/index.js`

**Interfaces:**
- Consumes: `simulateTotalBasesMarket(input)`
- Produces: `evaluateTotalBasesCandidate(input)`
- Uses existing `getTwoWayNoVigProbabilities`, `shrinkProbabilityTowardMarket`, `calculateExpectedValue`, `calculateKellyFraction`, and `applyStakeCaps`

- [ ] Write tests for paired no-vig probability, market shrinkage, fair price, EV, quarter-Kelly, maximum acceptable price, and fail-closed rejection when DraftKings or opposite price is absent.
- [ ] Confirm tests fail before implementation.
- [ ] Implement evaluator and exports.
- [ ] Confirm all tests pass.

### Task 3: CLI and Example Input

**Files:**
- Create: `test/simulate-mlb-total-bases-cli.test.js`
- Create: `script/simulate_mlb_total_bases.js`
- Create: `examples/mlb-total-bases-shadow-card.json`
- Modify: `package.json`

**Interfaces:**
- Produces command: `npm run simulate:mlb:tb -- --input <path> --output <path>`

- [ ] Write failing CLI tests for deterministic JSON output and blocked official recommendation when lineup or prices are incomplete.
- [ ] Implement CLI and example fixture.
- [ ] Confirm CLI and repository tests pass.

### Task 4: Supabase Append-Only Projection

**Files:**
- Create: `supabase/migrations/20260720150000_mlb_simulation_projection.sql`
- Create: `test/supabase-mlb-simulation-migration.test.js`

**Interfaces:**
- Produces tables: `market_snapshots` and `simulation_runs`
- Both tables are immutable, user-owned, RLS-protected, and append-only

- [ ] Write migration-structure tests for required columns, constraints, RLS, ownership, and mutation denial.
- [ ] Add migration SQL.
- [ ] Apply migration to the connected Supabase project.
- [ ] Run Supabase security and performance advisors.

### Task 5: Pull Request and Verification

**Files:**
- Modify: `README.md`

- [ ] Document the free local workflow and exact limitations.
- [ ] Run `npm run verify` in GitHub Actions.
- [ ] Confirm Supabase tables and advisors.
- [ ] Open a reviewable pull request against `codex/bear-edge-release-candidate`.
- [ ] Record unresolved external gates: exact DraftKings price intake, confirmed lineup feed, and prospective calibration sample.
