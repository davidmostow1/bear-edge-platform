# Bear Edge canonical status

- **External evidence cutoff:** 2026-08-12 08:19 UTC
- **Recovery baseline:** `5f284eb8cf66050f06601087ef04a267441f1958`
- **Canonicalization branch:** `codex/bear-edge-canonicalize-20260812`
- **Candidate lifecycle:** `CONSOLIDATION_CANDIDATE`
- **Release status:** not a release candidate
- **Authorization:** `RESEARCH_ONLY` / `PRICE_CHECK_ONLY` / authorized stake `$0` / execution disabled

SAFETY_INVARIANT: authorization is RESEARCH_ONLY; authorized stake is $0; execution is disabled.

## Bottom line

Bear Edge contains substantial real software for decision gates, audit records, local append-only logging, synchronization, calibration analysis, dashboards, and MLB research. It does **not** contain a validated profitable prediction model. Passing tests establish software behavior; they do not establish predictive accuracy, calibration, closing-line value, profitability, licensed live-data access, or production readiness.

The exact PR #17 head above is the fullest immutable recovered implementation found during the audit. It is the recovery baseline, not yet the canonical release. The default `master` branch is older and its current Python and Deno workflows fail. The consolidation candidate is bound to its complete path set and content digest; its exact commit SHA and GitHub CI result must be recorded externally because a commit cannot contain its own SHA.

## Claim matrix

| Claim | Grade | Evidence-backed result |
|---|---|---|
| Substantial working application code exists | `CONFIRMED` | Recovery baseline CI passed `npm run verify` with 728/728 tests. |
| A single canonical merged branch exists | `FAILED` | `master`, `reconcile`, PR #17, and later work remain fragmented. |
| Default `master` is a verified runnable release | `FAILED` | Its active Python workflow requires a missing `requirements.txt`; current Python and Deno workflows failed. |
| A validated Bear Edge model exists | `FAILED` | Registry policy 1.2.0 contains five models; all five are `research_only`. |
| Predictive edge or profitability has been demonstrated | `UNVERIFIED` | No qualifying calibration report, prospective settled cohort, or closing-line validation exists. |
| An esports prediction model exists | `FAILED` | No game-specific probability generator or historical feature pipeline exists in committed GitHub code. |
| An esports evaluator draft exists | `PARTIAL` | A separate dirty worktree contains an uncommitted evidence/price gate, but it requires an external probability and has release-blocking defects. It was not imported. |
| Bet execution is authorized | `FAILED` | Permission is `PRICE_CHECK_ONLY`; authorized stake is `$0`; execution is disabled. |
| Local audit lifecycle is implemented | `CONFIRMED` | Code and tests implement an append-only local JSONL ledger and synchronization outbox. |
| Supabase is the current operational authority | `FAILED` | Live schema comments and current code define Supabase as a projection from the local authoritative ledger. |
| Supabase projection exists | `PARTIAL` | Live snapshot had 12 decisions, 0 settlements, 0 amendments, and no edge functions. Git and live migration sets differ. |
| The requested personal plugins are usable here | `FAILED` | `prompt-mastery`, `bear-edge-operator`, and `ultimate-plugin` are not callable in this runtime. Historical receipts exist for the first two only. |
| Prompt Perfect was available | `CONFIRMED` | It was used to turn the recovery request into an evidence-first audit and repair contract; it did not supply model evidence. |

Grades mean:

- `CONFIRMED`: directly supported by current inspected evidence.
- `PARTIAL`: a real implementation or artifact exists, but a material part is missing or contradictory.
- `FAILED`: the claimed capability is absent or contradicted by evidence.
- `UNVERIFIED`: available evidence cannot establish the claim.

## What is implemented

- Node 20 application, local/private-LAN dashboard, authenticated write paths, and PWA assets.
- Deterministic odds, expected-value, Kelly, price, exposure, and decision-gate mechanics.
- Canonical evaluation, settlement, amendment, outcome, and closing-price record contracts.
- Append-only local JSONL ledger, integrity checks, outbox, retries, and Supabase projection code.
- Model registry, chronological data controls, calibration metrics, event-cluster bootstrap, promotion gates, and release-readiness reporting.
- Five registered MLB research calculations, including the negative-binomial pitcher-strikeout lane.
- Historical import/backtest, source provenance, shadow evidence, comparison, and manual capture tooling.

These are software capabilities. They are not a validated wagering advantage.

## Selected next research slice

On 2026-08-12 the user explicitly selected Dota 2 pre-match best-of-three series winner as the next bounded vertical slice. That decision fixes product scope only. It does not establish provider rights, point-in-time data availability, a trained model, calibrated probabilities, market evidence, or wagering authority. Until source-purpose rights are approved, Dota work is limited to source contracts, immutable evidence mechanics, dataset validation, and synthetic fixtures.

## What is missing

- A model with immutable implementation identity, training cutoff, passing calibration report, and `validated` registry status.
- A point-in-time, leakage-controlled, licensed or otherwise approved data pipeline covering the selected market.
- A preregistered prospective cohort with complete predictions, official outcomes, exact closing prices, and unsuccessful/unselected rows.
- Evidence that Bear Edge beats the registered no-vig market baseline or has non-negative closing-line-value uncertainty.
- A completed Supabase authority cutover and migration reconciliation.
- A live Supabase schema able to accept the v2.1 records emitted by the recovered application.
- A committed, remotely verified canonicalization commit and protected canonical branch.
- Any committed esports feature generator, training pipeline, calibrated probability model, or operational source adapter.

## Verification ledger

| Artifact | Command or observation | Result | Scope |
|---|---|---|---|
| Recovery baseline `5f284eb8…` | GitHub Actions, `npm run verify` | 728 passed, 0 failed | Exact committed baseline; software behavior only. |
| Clean local checkout of the baseline | `npm run verify` | 727 passed, 1 failed | Failure was `os.networkInterfaces()` throwing in this restricted runtime. |
| Local LAN portability fix | `node --test test/tooling.test.js` | 29 passed, 0 failed | Dirty canonicalization worktree; not a committed SHA. |
| Canonicalization candidate full suite | `npm run verify` | 756 passed, 0 failed | Local candidate content; verification is declared not before 2026-08-12 12:05 UTC. The receipt binds the aggregate baseline diff even while its logical commits are created. Exact-SHA clean-checkout and remote CI evidence are still required. |
| Live Supabase snapshot | catalog, migration, advisor, and aggregate inspection | partial | Runtime schema/row-count snapshot only; not model validation. |

The earlier smaller `reconcile@8f0d6cb…` branch passed 414/414 in GitHub CI. A separate dirty recovery worktree based on that branch passed 415/415 after the same LAN fallback. Those results do not supersede the fuller PR #17 baseline.

## Model state

| Model | Market family | Status | Training cutoff | Calibration report |
|---|---|---|---|---|
| `poisson_count_v1@1.0.0` | pitcher strikeouts | `research_only` | none | none |
| `negative_binomial_pitcher_strikeouts_v1@1.0.0` | pitcher strikeouts | `research_only` | none | none |
| `poisson_count_v1@1.0.0` | batter hits | `research_only` | none | none |
| `poisson_count_v1@1.0.0` | batter runs scored | `research_only` | none | none |
| `poisson_count_v1@1.0.0` | batter total bases | `research_only` | none | none |

The registered promotion policy requires at least 500 settled predictions, 100 distinct events, 100 observations per reliability bucket, 95% settlement coverage, a registered no-vig market baseline, event-atomic chronological splitting, and event-cluster bootstrap uncertainty. Meeting sample counts alone would still not guarantee promotion; every registered calibration, baseline, leakage, and closing-line check must pass.

## Esports quarantine decision

The uncommitted esports draft is not a prediction model. It blends caller-supplied lower/point/upper probabilities with cross-book consensus and classifies `PASS`, `WAIT`, or `LEAN`; operational `BET` authority is hard-disabled. It was not copied into this branch because adversarial review found all of the following:

- a prediction is not cryptographically bound to the evidence and feature timestamps that supposedly produced it;
- caller-computable digests and caller-entered `verified` labels can self-attest a `LEAN`;
- source access method, domain, contract scope, expiry, and upstream lineage are not enforced;
- Riot/GRID lineage could be double-counted, and PandaScore's public terms conflict with odds-product development;
- the Supabase mapper and current market constraints reject the esports record shape;
- the calibration projector excludes the esports record shape and does not quarantine replay mode;
- malformed American odds with absolute values below 100 are accepted;
- research-only `LEAN` records can retain a positive recommended stake, violating the `$0` authority boundary;
- the prediction digest omits material market identity, and map scope can resolve against a series registry tuple;
- the August 12 slate is a manual observation with missing UTC times, provider update times, executable size, and retained quote digests—not source authenticity or prediction evidence.

The safe disposition is `QUARANTINED_NOT_IMPORTED`. Its concepts may be rebuilt only after these defects are closed with targeted tests.

## Supabase snapshot

As observed on 2026-08-12:

- project ref: `anxouzruouyraumgjdju`;
- `decision_records`: 12 rows;
- `settlement_records`: 0 rows;
- `record_amendments`: 0 rows;
- edge functions: 0;
- live migrations: 16;
- recovery-baseline Git migrations: 17;
- current application audit-record schema: v2.1;
- observed live decision/settlement/amendment constraints: v2.0 only;
- current new-record synchronization compatibility: **false**;
- Git contains the deployed LEAN migration, while live Supabase lacks `20260718010000_shadow_evidence_v21.sql`;
- no deployed `market_quote_events`, `prediction_outcomes`, `closing_prices`, model-registry, or promotion tables were observed.
- leaked-password protection was reported disabled by the Supabase security advisor.

This is a timestamped runtime snapshot. It must be refreshed before making a later deployment claim.

The machine audit checks local invariants and consistency with this pinned snapshot. It does not contact GitHub or Supabase and cannot independently refresh or authenticate external facts; those require direct connector evidence before any claim changes. Raw connector responses were not retained as content-addressed receipts in this worktree, so the external snapshot remains `PARTIAL` and that gap is an explicit blocker.

## Immediate state

No bet was placed during the recovery audit. Through the external-evidence cutoff above, no external repository, branch, pull request, database, provider, or plugin was mutated by that audit. This historical statement does not describe later publication actions and does not deny historical wager records. The candidate remains non-canonical until an external receipt names its exact Git SHA, clean-checkout verification, pull request, and remote CI result.
