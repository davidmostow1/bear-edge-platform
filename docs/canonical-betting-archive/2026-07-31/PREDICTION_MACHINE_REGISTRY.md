# Canonical Prediction Machine Registry

As of 2026-07-31. This is an evidence and governance index, not an execution registry.

| Machine | Owner | Status | Exact source binding | Validation |
|---|---|---|---|---|
| Sweet Bear Pitcher Strikeout Machine v1 | Sweet Bear | Implemented research candidate, uncalibrated | `davidmostow1/bear-edge-platform`, branch `codex/sweet-bear-pitcher-strikeout-machine-v1`, commit `a5b422bf0f98a10593bb5c52377d78ff28e456f0` | Not validated; independent reproduction pending |
| KBO Live Poisson v0.1 Shadow | Sweet Bear | Legacy identity; source not recovered | None recovered | Not established |
| KBO Live Poisson v0.2 | Sweet Bear | Legacy identity; source not recovered | None recovered | Not established |
| Sweet Bear vs Bear Edge Showdown | Shared research harness | Implementation reported; source binding pending | Remote repository/commit unresolved | Clean-checkout reproduction pending |
| `sweetbear-edge` statistical substrate | Research validation | Validation package, not a prediction model | Remote repository/commit unresolved | Simulation claims reported; market validation absent |
| Starter-only batter outcome extension | Sweet Bear | Specified, not implemented | Parent branch/commit identified; extension absent from base commit | Not validated |
| Bear Edge total-bases simulator | Bear Edge | Shadow experiment | Commit `c0f0c3c4e81809ec131193e7b6a3126755b0de93`; exact PR head branch still to reconcile | Not validated |
| Sweet Bear unified MLB v1 | Sweet Bear | Failed data-build gate | PR #8 lineage; exact head commit to reconcile | Not validated |
| Sweet Bear unified MLB v2 probe | Sweet Bear | Noncanonical probe / do-not-create lineage | PR #9 lineage; exact head commit to reconcile | Not validated |
| Sweet Bear Kalishi LoL winner model | Sweet Bear Kalishi Predicts | Planned, not implemented | Proposed separate repository not verified | Not validated |

## Status vocabulary

- `IMPLEMENTED_RESEARCH_CANDIDATE`: executable implementation exists, but predictive validity is unproven.
- `SOURCE_NOT_RECOVERED`: model label exists in history, but reproducible implementation evidence is missing.
- `SPECIFIED_NOT_IMPLEMENTED`: requirements exist, but no accepted implementation exists.
- `SHADOW_EXPERIMENT`: software may run for research but is not an operationally validated model.
- `FAILED_DATA_BUILD_GATE`: the pipeline failed a declared build or coverage gate.
- `VALIDATION_SUBSTRATE_ONLY`: statistical judging tools, not a sport-specific prediction model.
- `PLANNED_NOT_IMPLEMENTED`: architecture or planning exists without production or research implementation.

## Evidence records

- `machines/mlb_pitcher_strikeout_joint_outing_v1.md`
- `machines/kbo_live_poisson_legacy_models.md`
- `machines/sweet_bear_vs_bear_edge_showdown.md`
- `machines/sweetbear_edge_validation_substrate.md`
- `GITHUB_REF_MAP.md`
- `CURRENT_STATE.md`
- `PLATE_APPEARANCE_SHORTFALL_DIAGNOSIS.md`
- `SYSTEM_MAP.md`
- `SOURCE_INVENTORY.md`

## Mandatory source-binding fields

A machine cannot be upgraded to reproducibly implemented in this registry unless the following are known:

- repository
- branch
- exact commit
- implementation paths
- model artifact hash
- feature schema
- training cutoff
- test command
- verification result

Documentation, completion messages, screenshots, and ledger labels do not satisfy those fields by themselves.
