# Bear Edge canonical status

- **External evidence cutoff:** 2026-08-12 21:06:21 UTC
- **Recovery baseline:** `5f284eb8cf66050f06601087ef04a267441f1958`
- **Merged canonical research baseline:** `3698869087ab95dc2890079d7b7c615a32cfc8c3`
- **Baseline lifecycle:** `MERGED_RESEARCH_BASELINE`
- **P0 status:** consolidation and projection hardening closed; repository-admin branch protection remains open
- **Release status:** not a release candidate
- **Authorization:** `RESEARCH_ONLY` / `PRICE_CHECK_ONLY` / authorized stake `$0` / execution disabled

SAFETY_INVARIANT: authorization is RESEARCH_ONLY; authorized stake is $0; execution is disabled.

## Bottom line

PR #31 was reviewed and merged normally as the ancestry anchor. PR #32 then merged the reviewed projection hardening normally as `b6c19292…`, tree `09b55d0…`; that exact merge passed 776/776 tests locally and in GitHub Actions. The installed Supabase catalog and a transaction-scoped hosted PostgreSQL smoke test now confirm the intended fail-closed controls with all retained row counts preserved.

The remaining P0 gate is repository administration: GitHub reports `master` is unprotected with no repository ruleset, and the available integration cannot configure it. Synchronization also remains disabled as a separate compatibility gate. All 12 retained decisions are v2.0 and cannot parent v2.1 shadow evidence; true multi-session races and hosted PostgREST/Auth behavior are not yet proven. Deployment of hardening does not make Supabase operational authority.

Passing tests establish software behavior; they do not establish predictive accuracy, calibration, closing-line value, profitability, source rights, or production readiness.

## Exact baseline receipt

| Evidence | Result |
|---|---|
| Pull request | PR #31, head `257ec7d…`, tree `3eda1f4…` |
| Merge | `3698869…`, normal merge, reviewed tree preserved |
| Clean local verification | `npm run verify`: 756 passed, 0 failed |
| Remote verification | GitHub Actions run 31633987337: success on `3698869…` |
| Package smoke | pass in a separate temporary install on the identical tree |
| Projection hardening | PR #32 merge `b6c1929…`, tree `09b55d0…`; 776/776 local and Actions run 31639833629 |
| Hosted projection check | PostgreSQL 17.6 catalog audit plus rollback smoke passed; counts remained 12/0/0/0/0 |
| Branch governance | `master` unprotected; 0 repository rulesets |

The normalized deployment receipt is retained at `docs/canonical/receipts/p0-hardening-deployment-20260812.json`, chained to the original baseline receipt, and bound by the machine audit. Raw connector payloads and a provider-signed attestation were not retained, so it is evidence of observed state, not an independently signed external audit.

## Capability claims

| Claim | Grade | Evidence-backed result |
|---|---|---|
| One merged reproducible research baseline exists | `CONFIRMED` | Exact merge/tree, local verification, package smoke, and remote CI receipts exist. |
| Canonical branch governance is complete | `FAILED` | `master` is not protected and no repository ruleset exists. |
| A validated Bear Edge model exists | `FAILED` | All nine registered models remain `research_only`; 0 calibration reports exist. |
| Predictive edge or profitability is demonstrated | `UNVERIFIED` | No qualifying prospective cohort, market comparison, or closing-line validation exists. |
| Independent esports probability generation exists | `PARTIAL` | Game-scoped Elo generators now cover pre-match series winners for CS2, Dota 2, LoL, and VALORANT. They deterministically generate content-bound research projections from retained format/context-matched history and fail closed on invalid chronology, digests, or sample size. They are not prospectively calibrated or authorized for BET. |
| Bet execution is authorized | `FAILED` | Permission is `PRICE_CHECK_ONLY`; authorized stake is `$0`; execution is disabled. |
| Local audit lifecycle is implemented | `CONFIRMED` | The authoritative local JSONL ledger and outbox are implemented and tested. |
| Supabase is operational authority | `FAILED` | Supabase remains a remote projection; cutover is incomplete. |
| Supabase v2.1 synchronization is safe to enable | `FAILED` | Integrity hardening is deployed, but retained-parent compatibility, multi-session concurrency, and hosted gateway behavior remain unproven. |

Grades are `CONFIRMED`, `PARTIAL`, `FAILED`, or `UNVERIFIED`; they describe the available evidence, not intent.

## Supabase deployment snapshot

At `2026-08-12T21:06:21.958Z`, project `anxouzruouyraumgjdju` reported all 18 tracked migrations, including versioned hardening migration `20260812195952_harden_authoritative_projections`.

| Table | Rows |
|---|---:|
| `decision_records` | 12 |
| `settlement_records` | 0 |
| `record_amendments` | 0 |
| `prediction_outcomes` | 0 |
| `closing_prices` | 0 |

All 12 decisions remain schema v2.0. None contains the canonical parent snapshot, event start, and sportsbook fields required by the shadow-evidence trigger. The deployed hardening has forced RLS, authenticated owner reads only, service-role inserts only, no insert policies, fail-closed snapshot constraints, numeric-`NaN`/finite guards, hardened trigger functions, conflict-safe identical replay, linear lineage indexes, and account-deletion cascade support. All expected constraints, functions, triggers, and eight new indexes were present and validated live.

A hosted transaction exercised service writes, database-derived identity, denied authenticated writes, identical retries, digest conflicts, tampered snapshots, correction branches, numeric `NaN`, direct-delete rejection, and auth-user cascade, then explicitly rolled back and reconciled counts. PGlite also executes all 18 migrations and their invariant suite. Neither test establishes true concurrent-session behavior or the hosted PostgREST/Auth gateway. Do not enable `SUPABASE_AUDIT_SCHEMA_VERSION=2.1.0`; current records remain incompatible.

## Selected Dota research slice

The user selected Dota 2 pre-match best-of-three series winner. Work may begin on contracts, immutable evidence mechanics, leakage validation, and synthetic fixtures. No OpenDota, Valve, GRID, organizer, or sportsbook data may be retained for a training corpus until the exact betting/model-development purpose is approved and upstream lineage is recorded. A present-day historical download is retrospective reconstruction; `capturedAt` today cannot masquerade as historical `availableAt`.

The first proof must contain no odds, probability, recommendation, stake, Supabase projection, or execution path. A synthetic deterministic dataset proof is not a historical dataset, trained model, calibration result, or source-rights approval.

## Open blockers

- Configure branch protection or a repository ruleset for `master`; the available GitHub integration can observe but cannot mutate this setting.
- Keep synchronization disabled until current-record parent compatibility, true multi-session behavior, and hosted PostgREST/Auth behavior are proven.
- Retain a stronger externally attested audit receipt if one becomes available.
- Resolve Dota source-purpose rights, upstream lineage, and point-in-time availability before any real corpus.
- Build a genuine pre-cutoff dataset, model, prospective cohort, and calibration evidence before any model promotion.
- Complete Supabase authority cutover only in its separately gated later phase.

No bet was placed, no nonzero stake was authorized, and execution remains disabled by this work.
