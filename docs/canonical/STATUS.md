# Bear Edge canonical status

- **External evidence cutoff:** 2026-08-12 19:56:11 UTC
- **Recovery baseline:** `5f284eb8cf66050f06601087ef04a267441f1958`
- **Merged canonical research baseline:** `3698869087ab95dc2890079d7b7c615a32cfc8c3`
- **Baseline lifecycle:** `MERGED_RESEARCH_BASELINE`
- **P0 status:** consolidation closed; branch-protection and Supabase-hardening gates open
- **Release status:** not a release candidate
- **Authorization:** `RESEARCH_ONLY` / `PRICE_CHECK_ONLY` / authorized stake `$0` / execution disabled

SAFETY_INVARIANT: authorization is RESEARCH_ONLY; authorized stake is $0; execution is disabled.

## Bottom line

PR #31 was reviewed, verified, and merged with a normal merge commit. The merge commit has the reviewed tree, preserves recovery commit `5f284eb8…` as an ancestor, passed 756/756 tests in a clean local checkout, and has green GitHub Actions on the same SHA. The same tree also passed a separate temporary-install package smoke test. This closes the P0 consolidation and reproducibility work.

P0 is not fully closed. GitHub reports `master` is unprotected with no repository ruleset, and the available integration cannot configure branch protection. A fresh Supabase review found that migration `20260718010000_shadow_evidence_v21` was applied and preserved all existing row counts, but the deployed projection still permits authenticated evidence forgery, accepts missing snapshot identity fields, breaks duplicate retry before conflict handling, and remains incompatible with lower-case research market families. Synchronization must stay disabled until a reviewed hardening migration is deployed and tested.

Passing tests establish software behavior; they do not establish predictive accuracy, calibration, closing-line value, profitability, source rights, or production readiness.

## Exact baseline receipt

| Evidence | Result |
|---|---|
| Pull request | PR #31, head `257ec7d…`, tree `3eda1f4…` |
| Merge | `3698869…`, normal merge, reviewed tree preserved |
| Clean local verification | `npm run verify`: 756 passed, 0 failed |
| Remote verification | GitHub Actions run 31633987337: success on `3698869…` |
| Package smoke | pass in a separate temporary install on the identical tree |
| Branch governance | `master` unprotected; 0 repository rulesets |

The normalized external receipt is retained at `docs/canonical/receipts/p0-baseline-20260812.json` and bound by the machine audit. Raw connector payloads and a provider-signed attestation were not retained, so the receipt is evidence of observed state, not an independently signed external audit.

## Capability claims

| Claim | Grade | Evidence-backed result |
|---|---|---|
| One merged reproducible research baseline exists | `CONFIRMED` | Exact merge/tree, local verification, package smoke, and remote CI receipts exist. |
| Canonical branch governance is complete | `FAILED` | `master` is not protected and no repository ruleset exists. |
| A validated Bear Edge model exists | `FAILED` | All five registered models remain `research_only`; 0 calibration reports exist. |
| Predictive edge or profitability is demonstrated | `UNVERIFIED` | No qualifying prospective cohort, market comparison, or closing-line validation exists. |
| An esports probability generator exists | `FAILED` | No committed game-specific generator or trained model exists. |
| Bet execution is authorized | `FAILED` | Permission is `PRICE_CHECK_ONLY`; authorized stake is `$0`; execution is disabled. |
| Local audit lifecycle is implemented | `CONFIRMED` | The authoritative local JSONL ledger and outbox are implemented and tested. |
| Supabase is operational authority | `FAILED` | Supabase remains a remote projection; cutover is incomplete. |
| Supabase v2.1 projection is safe to enable | `FAILED` | Live schema integrity, retry, mapper, and parent-compatibility blockers remain. |

Grades are `CONFIRMED`, `PARTIAL`, `FAILED`, or `UNVERIFIED`; they describe the available evidence, not intent.

## Supabase deployment snapshot

At `2026-08-12T19:56:11.035Z`, project `anxouzruouyraumgjdju` reported 17 migrations. Migration `20260718010000_shadow_evidence_v21` was present even though this workstream did not apply it.

| Table | Rows |
|---|---:|
| `decision_records` | 12 |
| `settlement_records` | 0 |
| `record_amendments` | 0 |
| `prediction_outcomes` | 0 |
| `closing_prices` | 0 |

All 12 decisions remain schema v2.0. None contains the canonical parent snapshot, event start, and sportsbook fields required by the new shadow-evidence trigger. The new tables have forced RLS and no anonymous grants, but authenticated users retain direct `INSERT`, `{}` can pass both snapshot checks through SQL `NULL`, and the insert trigger rejects normal replay before `ON CONFLICT DO NOTHING`. Current `market_kind` also rejects model-family values such as `pitcher_strikeouts` that the mapper can emit.

The safe response is a new versioned hardening migration plus mapper correction, followed by real PostgreSQL checks. Do not edit or rewrite the already-applied migration. Do not enable `SUPABASE_AUDIT_SCHEMA_VERSION=2.1.0` merely because the version constraint now accepts it.

## Selected Dota research slice

The user selected Dota 2 pre-match best-of-three series winner. Work may begin on contracts, immutable evidence mechanics, leakage validation, and synthetic fixtures. No OpenDota, Valve, GRID, organizer, or sportsbook data may be retained for a training corpus until the exact betting/model-development purpose is approved and upstream lineage is recorded. A present-day historical download is retrospective reconstruction; `capturedAt` today cannot masquerade as historical `availableAt`.

The first proof must contain no odds, probability, recommendation, stake, Supabase projection, or execution path. A synthetic deterministic dataset proof is not a historical dataset, trained model, calibration result, or source-rights approval.

## Open blockers

- Configure branch protection or a repository ruleset for `master`; the available GitHub integration can observe but cannot mutate this setting.
- Review, merge, deploy, and exercise the versioned Supabase projection-hardening migration; keep synchronization disabled until then.
- Retain a stronger externally attested audit receipt if one becomes available.
- Resolve Dota source-purpose rights, upstream lineage, and point-in-time availability before any real corpus.
- Build a genuine pre-cutoff dataset, model, prospective cohort, and calibration evidence before any model promotion.
- Complete Supabase authority cutover only in its separately gated later phase.

No bet was placed, no nonzero stake was authorized, and execution remains disabled by this work.
