# Bear Edge bounded repair program

**Status:** canonical design and execution contract
**Date:** 2026-07-30
**Target:** `betting-decision-engine` on `codex/bear-edge-release-candidate`
**Authority:** local, reversible work only; no merge, deployment, model promotion,
paid provider call, wager, bankroll transfer, or production mutation

## 1. Decision

Bear Edge remains a research and decision-control system. It is not a validated
predictive algorithm and is not authorized to make real-money bet calls.

This repair program does not try to manufacture an edge. It first makes system
identity and evidence boundaries executable, then advances data and modeling
only when the prior milestone has direct evidence.

The fixed provenance boundary for every milestone is:

- `predictiveImprovement=NOT_EVALUATED`
- `modelValidation=NOT_ESTABLISHED`
- `wageringAuthority=UNCHANGED`
- operational permission remains `PRICE_CHECK_ONLY`

## 2. Ground truth at entry

The following facts were read from the checkout and its 2026-07-30 native
reports before this document was written:

| Item | Observed state |
|---|---|
| Branch / commit | `codex/bear-edge-release-candidate` / `2ca03a2` |
| Existing worktree | 75 tracked entries modified and 63 untracked entries before this repair program |
| Focused baseline | 166 model, ledger, separation, and market-economics tests passed |
| Full native baseline | 701 tests passed in the 2026-07-30 Bear Edge doctor report |
| Release report | `shippable-with-warnings`, 75/100; worktree not clean |
| Registered models | 4; every model is `research_only`; 0 validated |
| Authoritative ledger | 129 rows; integrity report valid; 17 legacy rows quarantined |
| Calibration-eligible predictions | 0 |
| Outcome-only shadow probabilities | 51 rows; 48 settled and 3 pending |
| Closing-price records | 0 |
| Current candidates | 79 discovered; 0 priced |
| Live/provider state | live snapshot stale; required odds not verified; DraftKings degraded |
| Bet-call permission | `PRICE_CHECK_ONLY` |

Passing software checks establishes local behavior under those checks. It does
not establish calibration, market superiority, profitability, portability, or
external authorization.

## 3. Non-negotiable system separation

Three product identities must remain separate even when a comparison harness
reads artifacts from more than one:

| Lane | Owns | May provide to Bear Edge | Must never share |
|---|---|---|---|
| Bear Edge core | Bear Edge model registry, authoritative decision ledger, sync outbox, Bear Edge bankroll setting, sportsbook research controls | Content-addressed research exports | Sweet Bear model identity, Sweet Bear bankroll, Kalshi orders or settlement ledger |
| Sweet Bear DraftKings Predictions | Its own model versions, contract evidence, fee-aware trade research, ledger, and bankroll | Read-only, attributed, content-addressed evidence | Bear Edge decision-log writes, sportsbook American-odds substitution, Bear Edge bankroll |
| Sweet Bear Kalshi | Its own model versions, market/orderbook/decision/settlement ledgers, credentials, and bankroll | Read-only, attributed, content-addressed research exports | Bear Edge or DraftKings Predictions ledgers, model registry, credentials, bankroll, or authorization |

Rules:

1. No lane may append to another lane's ledger.
2. No lane may read or size from another lane's bankroll.
3. A registered-model identity is the tuple of lane, model ID, version, market
   family, training cutoff, implementation digest, implementation modules, and
   calibration-report digest. A forecast artifact adds its source lane, feature
   cutoff, prediction time, and evidence digest. Neither tuple can be relabeled
   into another lane.
4. DraftKings Predictions contract prices and Kalshi contract prices never use
   sportsbook American-odds payout math.
5. Comparison code is read-only. It cannot promote models, authorize wagers, or
   write into a source lane.
6. Cross-lane imports are immutable research artifacts with explicit schema,
   source lane, capture time, and SHA-256 digest. Missing identity fails closed.
7. Bear Edge production source must not acquire a Kalshi execution path. Any
   future adapter requires a separate approved design and repository boundary.

Milestone 1 does not make every rule a runtime security boundary:

| Rule | Milestone 1 status | Direct evidence |
|---|---|---|
| Fixed authorization and three-lane ownership | `ENFORCED_CHECK` | immutable expected values in validator plus adversarial mutations |
| No cross-lane ledger append | `DECLARED_ONLY` for external apps | manifest gives external lanes no Bear Edge ledger root; their separate runtimes were not inspected here |
| No cross-lane bankroll read | `PARTIAL_CHECK` | external lanes own no key and literal product bankroll keys in Bear Edge executable source are scanned; computed/runtime reads are not proven absent |
| Registered-model identity | `PARTIAL_CHECK` | Bear Edge owns the only registry; native registry validation and this audit inspect status and available provenance fields; research-only null evidence fields are not invented |
| Contract price versus sportsbook odds math | `ENFORCED_NATIVE_TEST` | existing contract-economics code and targeted test reject sportsbook American-odds substitution |
| Comparison code is read-only | `ENFORCED_NATIVE_TEST` for the current showdown harness | existing comparison/record tests; this does not cover unknown external comparison code |
| Content-addressed imports | `DECLARED_ONLY` as a generic cross-lane rule | existing evidence paths have native digest tests, but no universal importer exists |
| No Kalshi production path | `PARTIAL_CHECK` | static scan of literal tokens in production executable source; runtime/dependency behavior is outside this check |

`ENFORCED_CHECK` means the named repository mutation is rejected. It is not a
security certification. `PARTIAL_CHECK` and `DECLARED_ONLY` are explicit stop
labels, not completed controls.

## 4. Bounded execution plan

### Milestone 0 — baseline and containment

- [x] Resolve the canonical checkout and branch.
- [x] Preserve the pre-existing dirty worktree.
- [x] Run focused model/ledger/market-economics tests.
- [x] Confirm every registered Bear Edge model remains `research_only`.
- [x] Confirm current permission remains `PRICE_CHECK_ONLY`.

**Stop condition:** any malformed ledger, digest conflict, unexpected validated
model, or real-money authorization. None was observed.

### Milestone 1 — executable product boundary

- [x] Add a machine-readable system-boundary manifest.
- [x] Add a validator that fails on duplicate ownership, cross-lane bankroll or
  registry ownership, Kalshi production code in Bear Edge, or non-research
  Bear Edge models.
- [x] Add adversarial tests.
- [x] Include the boundary audit in native verification.

**Acceptance:** focused boundary tests pass, then the full native verification
and Bear Edge doctor pass without changing model or wagering authorization.

The validator lives outside `src` and statically scans literal tokens and
literal bankroll storage keys
in `.cjs`, `.js`, `.jsx`, `.mjs`, `.ts`, and `.tsx` files under declared scan
roots. Missing or symlinked scan roots, empty scan surfaces, unknown policy
fields, and weakened scan declarations fail closed. This catches accidental
product integration and the reviewed extension bypass. It is not a tamper-proof
sandbox: computed strings, generated code, a malicious dependency, or runtime
network behavior require separate runtime and dependency controls. Passing this
guard establishes only the checked repository boundary.

### Milestone 2 — prospective evidence continuity

Existing code already supports deterministic, pre-start, outcome-only shadow
capture and settlement. The next legitimate operation is evidence collection,
not model promotion.

- [ ] Record every eligible pre-start prediction for a preregistered cohort.
- [ ] Record source cutoffs and missingness, including failed or absent inputs.
- [ ] Capture exact two-sided execution-book offered and closing prices when
  legally and technically available.
- [ ] Settle outcomes from the official source.
- [ ] Preserve raw evidence and hashes.

**Stop condition:** missing player statistic, started event, bookmaker mismatch,
one-sided or stale price, missing source timestamp, nonzero paid call without
approval, or attempted financial-field insertion into the outcome-only shadow
ledger.

### Milestone 3 — upstream probability model

The current Poisson baselines do not justify a model promotion. Before adding
features, write a preregistered feature contract for one market family only.
Candidate inputs include opponent/pitcher quality, handedness, park, weather,
lineup role, projected opportunities, bullpen exposure, rest, and batted-ball
quality, but each requires a reproducible source and timestamp.

- [ ] Choose one market family.
- [ ] Freeze an event-atomic train/calibration/evaluation split.
- [ ] Freeze the feature schema and missing-data behavior.
- [ ] Create a reproducible implementation digest.
- [ ] Compare against the no-vig market baseline and the existing Poisson
  baseline.

**Stop condition:** no source license/provenance, insufficient event coverage,
post-start feature leakage, a feature computed from future data, or no untouched
evaluation set. This milestone must not begin merely because software tests pass.

### Milestone 4 — prospective validation

- [ ] Accumulate at least the registered sample floor without cherry-picking.
- [ ] Compute Brier score, log loss, calibration, event-clustered uncertainty,
  coverage, missingness, and exact-book closing-line value.
- [ ] Require the registry's complete promotion gate and a separate statistical
  review.

**Stop condition:** any threshold failure, unresolved leakage, negative
closing-line-value interval, material baseline degradation, insufficient
coverage, or missing independent statistical review.

### Milestone 5 — controlled release decision

No real-money release is part of this program. A later release decision requires
explicit human approval after Milestone 4 and a clean, reproducible package
verification in a separate environment.

## 5. 1,000-credit ceiling

The repository cannot read or verify the Codex account's credit balance, and no
conversion from credits to hours or tokens is assumed. The ceiling is therefore
operator discipline, not a repository-enforced control:

1. Record the displayed balance before starting a new milestone.
2. Do not run parallel coding agents.
3. Use the focused commands in the pickup package before full verification.
4. Stop at the first missing-data or external-authority condition.
5. Reserve the final account balance for one architecture/model review and one
   final verification pass.
6. If the displayed balance or a user-chosen reserve floor is unavailable, do
   not start a new milestone.

This document does not claim how many credits the current work consumed because
that telemetry is not available in the checkout. No balance was supplied, so no
credit-log entry was fabricated.

## 6. Independent review checkpoints

Claude and Gemini are reviewers, not sources of truth. A review counts only when
the exact reviewed artifact digest, reviewer venue, submission time, response,
and disposition are retained.

1. **Architecture checkpoint:** review this spec and the boundary manifest.
2. **Model checkpoint:** review the preregistered feature/split contract before
   implementation.
3. **Final checkpoint:** review the final diff, focused-test evidence, full
   verification, and remaining blockers.

If a reviewer is unavailable, unauthenticated, refuses the payload, or returns
only general prose, record `NOT_VERIFIED` and continue only where local evidence
is sufficient. Agreement between language models is not independent statistical,
security, or market validation.

## 7. Completion definition

This bounded repair program is complete only when:

- the requested repository artifacts exist and read back correctly;
- Milestone 1 is enforced by tests and native verification;
- the audit trail identifies every actual command and result;
- the pickup package contains exact commands and stop conditions;
- Claude/Gemini review status is recorded without fabrication; and
- model validation and wagering authority remain unchanged.

Milestones 2–5 are not claimed complete until their time-dependent or external
evidence exists.
