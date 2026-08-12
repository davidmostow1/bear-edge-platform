# Bear Edge recovery roadmap

This roadmap is ordered by proof dependency. A later phase cannot compensate for a failed earlier phase.

The fixed recovery boundary is `RESEARCH_ONLY`, authorized stake `$0`, and wager execution disabled.

SAFETY_INVARIANT: authorization is RESEARCH_ONLY; authorized stake is $0; execution is disabled.

## P0 — establish one honest reproducible system

**Current result:** consolidation/reproducibility and fail-closed projection hardening are complete; the repository-admin branch-protection control remains open.

Completed receipt:

1. Recovery baseline `5f284eb8cf66050f06601087ef04a267441f1958` remains in ancestry.
2. PR #31 was reviewed and merged normally as `3698869087ab95dc2890079d7b7c615a32cfc8c3`; its exact tree is `3eda1f4fc2e847d491c8ec2615564eddaed23e73`.
3. LAN launch now binds a verified external IPv4 address or fails closed.
4. Non-authorized decisions require authoritative stake exactly `0`, and permission cannot be promoted beyond `PRICE_CHECK_ONLY`.
5. A clean exact-SHA checkout passed `npm run verify` with 756/756 tests; GitHub Actions passed on the same merge SHA; the identical tree passed a separate-install package smoke test.
6. Canonical documents, machine status, and a normalized external receipt are committed to the audit surface.
7. PR #32 was reviewed and merged normally as `b6c19292f96a0787fa6e198e8b8179db763390fe`, tree `09b55d04f9b4f0bdc13069c5376f8e5e5a2a973f`; its exact tree passed 776/776 locally and in GitHub Actions.
8. Versioned migration `20260812195952_harden_authoritative_projections` is installed. Live catalog checks and a rollback-only hosted PostgreSQL smoke test confirmed service-only projection writes, fail-closed snapshots, retry/conflict handling, finite-value guards, linear lineage, immutability, and account cascade with counts preserved.

Remaining P0 work, in order:

1. Configure branch protection or a repository ruleset for `master`, requiring the CI workflow and pull-request review. The current integration has read access to this state but no administration capability, so this step requires a repository administrator.

P0 exit requires the exact hardened-baseline receipt plus branch governance. Synchronization compatibility remains independently fail-closed: the 12 retained v2.0 rows cannot parent v2.1 evidence, and true multi-session plus hosted PostgREST/Auth behavior is not proven. P0 completion will mean the software state is reproducible and its projection/governance controls fail closed. It will not mean synchronization is enabled or a model predicts well.

## P1 — build one real esports prediction vertical slice

**Explicitly selected lane:** Dota 2 pre-match best-of-three series winner.

Why this lane:

- one game, one timing regime, and one market family keep leakage and identity review tractable;
- a series result has a clear official outcome;
- historical game results can support a deliberately narrow team-strength baseline without using sportsbook prices as model features;
- it can remain shadow-only while data rights and calibration are established.

No CS2, LoL, VALORANT, live game, draft, hero, prop, parlay, or additional series format enters this slice until its full event lifecycle works.

### P1.1 Source and legal contract

Before ingestion:

- record permitted use, access method, allowed hosts, covered competitions/fields, expiration, and immutable agreement/terms evidence;
- model upstream lineage separately from vendor identity so Valve, GRID, OpenDota, or aggregator/shared-source feeds are not double-counted;
- do not treat OpenDota's public endpoint or MIT-licensed code as permission to retain underlying match data for betting-model development;
- if GRID is considered, require written approval for the declared betting/model-development purpose and any paid Series Events entitlement before development with its data;
- block PandaScore's public subscription product for odds-related development unless a distinct written agreement expressly overrides the public restriction;
- keep public organizer pages manual-only until their use path is reviewed;
- retain exact capture timestamps, raw payloads, digests, and parser versions.

Until purpose rights are approved, this phase may implement only contracts, schemas, and synthetic fixtures—not retain a real training corpus. Exit: every training, event, result, and later price field has an approved source path and upstream-lineage identifier.

### P1.2 Point-in-time dataset

Create one canonically oriented row per eligible best-of-three series with:

- stable upstream series, event, tournament, and team identities; best-of-three scope; start time; and settlement rules;
- roster and stand-in state only when evidence proves it was available at the feature cutoff;
- prior completed series/game strength, opponent strength, a prepublished patch timeline, event tier, recency, LAN/online context, and schedule/rest features available at the cutoff;
- raw source artifact references and digests;
- feature cutoff strictly before prediction and event start;
- official result and exact closing quote captured only in post-prediction fields;
- every eligible event, including rows later classified `PASS` or `WAIT`.

The contract must distinguish when a fact occurred from evidence-backed `availableAt`/`knownAt`. A present-day historical download is retrospective reconstruction, not proof that the fact was available at the historical cutoff; strict point-in-time mode must reject it unless original publication time is retained. Leakage checks must also reject target-series draft, hero, side, and postgame participant data; post-cutoff roster changes; results; closes; duplicated series; team aliases that cross partitions; and rows whose source time is unknown.

Exit: deterministic rebuild, content-addressed manifest, zero unresolved leakage findings, and event-atomic chronological train/calibration/test splits.

### P1.3 Independent probability model

Implement a deliberately narrow versioned baseline:

1. time-decayed team and opponent strength using only games and series completed and available before the cutoff;
2. roster-continuity adjustment learned from training data, never hand-tuned after seeing evaluation results;
3. regularized Bradley-Terry/logistic game-win probability with patch, tournament, and pre-match context covariates;
4. best-of-three series composition under a preregistered game-independence or correlation assumption, with no target draft, hero, or side information;
5. uncertainty interval from a registered resampling or posterior method;
6. frozen implementation digest, training cutoff, feature digest, and prediction artifact.

Sportsbook probabilities are comparison baselines and optional registered downstream shrinkage inputs. They are not independent-model features.

Exit: executable code emits a reproducible probability and interval from a retained feature snapshot. No LLM, prompt, prose estimate, or manually typed probability is permitted.

### P1.4 Safe decision integration

Rebuild the quarantined evaluator concepts with these minimum controls:

- bind the prediction digest to full event/market identity, opponent, scope, settlement rules, feature artifact, and evidence chronology;
- authenticate provider and quote metadata instead of trusting caller-entered `verified` flags;
- enforce authoritative source lineage and access scope;
- accept only valid integer American odds with absolute value at least 100, or a separately typed/validated price format;
- make every non-authorized record's authoritative recommended stake exactly `0`;
- isolate replay logs from prospective operational/calibration ledgers;
- add Supabase mappings and constraints for the exact esports market identity;
- teach calibration projection to consume the exact team/series record shape;
- keep `BET` impossible and execution disabled.

Exit: a deterministic end-to-end shadow prediction is captured, evaluated, persisted, remotely projected, later settled, and included in calibration without manual field repair.

## P2 — prospective shadow cohort

**Goal:** measure the frozen slice without money or selection bias.

- register policy before the cohort begins;
- freeze model version and changes into new versions rather than rewriting history;
- predict every eligible event before its cutoff;
- capture `PASS`, `WAIT`, and shadow signals, not just attractive rows;
- retain exact offered and closing two-way prices plus official outcomes;
- settle append-only;
- publish Brier score, log loss, expected calibration error, slope/intercept, market-baseline deltas, closing-line value, coverage, missingness, and performance by probability bucket/context;
- maintain authorized stake `$0` throughout.

Minimum registry gate currently requires:

- 500 settled predictions;
- 100 distinct events;
- 100 observations in every reliability bucket;
- at least 95% settlement coverage;
- no material Brier/log-loss degradation versus the registered no-vig market;
- non-negative closing-line-value interval when required;
- registered event-cluster bootstrap uncertainty;
- no unresolved leakage or data-quality blocker.

These are minimum gates, not promises of promotion.

## P3 — independent validation and possible promotion

Promotion is permitted only if:

1. a separate reviewer reproduces dataset identity, model output, metrics, and promotion checks;
2. the exact report is content-addressed and bound to implementation and policy digests;
3. all registered checks pass on untouched prospective data;
4. there is no unresolved provider, legal, security, ledger, or responsible-wagering blocker;
5. the registry change is reviewed as its own change;
6. authorization remains `$0` until a separate operational decision is made.

A passing backtest, winning streak, one slate, market-beating anecdote, plugin report, or AI recommendation cannot promote a model.

## P4 — operational authority, only after model promotion

This phase is intentionally separate from predictive validation:

- complete Supabase authority cutover and offline replay proof;
- establish authenticated executable price/size/cost evidence;
- implement jurisdiction, account, limit, exposure, settlement, and responsible-wagering controls;
- conduct independent security and statistical review;
- require explicit human authorization for any nonzero stake or execution feature;
- start with a separately approved minimal exposure policy and hard kill switch.

Nothing in P0–P3 authorizes P4.

## Stop conditions

Stop and return to the last verified boundary if:

- source rights or upstream lineage are unclear;
- a feature timestamp is missing or after prediction;
- an artifact digest cannot be reproduced;
- a replay row can enter the prospective cohort;
- a non-`BET` record carries positive authoritative stake;
- code, registry, report, and deployed schema identities disagree;
- a test pass belongs to a different commit;
- any task requires inventing a value to proceed.
