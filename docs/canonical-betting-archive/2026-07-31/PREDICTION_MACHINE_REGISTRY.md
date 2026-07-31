# Canonical Prediction Machine Registry

As of 2026-07-31. This is an evidence and governance index, not an execution registry.

| Machine or artifact | Artifact class | Owner | Canonical status | Exact source binding | Evaluation status |
|---|---|---|---|---|---|
| Sweet Bear Pitcher Strikeout Machine v1 | `PREDICTION_MODEL` | Sweet Bear | `IMPLEMENTED_RESEARCH_CANDIDATE` | `davidmostow1/bear-edge-platform`, branch `codex/sweet-bear-pitcher-strikeout-machine-v1`, commit `a5b422bf0f98a10593bb5c52377d78ff28e456f0` | `NOT_VALIDATED`; independent reproduction pending |
| KBO Live Poisson v0.1 Shadow | `LEGACY_MODEL_IDENTITY` | Sweet Bear | `SOURCE_NOT_RECOVERED` | None recovered | `NOT_ESTABLISHED` |
| KBO Live Poisson v0.2 | `LEGACY_MODEL_IDENTITY` | Sweet Bear | `SOURCE_NOT_RECOVERED` | None recovered | `NOT_ESTABLISHED` |
| Sweet Bear vs Bear Edge Showdown | `COMPARISON_HARNESS` | Shared research | `SOURCE_BINDING_PENDING` | Remote repository and exact commit unresolved | Clean-checkout reproduction pending |
| `sweetbear-edge` statistical substrate | `VALIDATION_SUBSTRATE` | Research validation | `VALIDATION_SUBSTRATE_ONLY` | Remote repository and exact commit unresolved | Simulation claims reported; real-market evaluation absent |
| Starter-only batter outcome extension | `IMPLEMENTATION_SPECIFICATION` | Sweet Bear | `SPECIFIED_NOT_IMPLEMENTED` | Parent branch and commit identified; extension absent from accepted implementation | `NOT_VALIDATED` |
| Bear Edge total-bases simulator | `PREDICTION_MODEL_EXPERIMENT` | Bear Edge | `SHADOW_EXPERIMENT` | Commit `c0f0c3c4e81809ec131193e7b6a3126755b0de93`; exact PR head branch still to reconcile | `NOT_VALIDATED` |
| Sweet Bear unified MLB v1 | `DATA_AND_MODEL_PIPELINE` | Sweet Bear | `FAILED_DATA_BUILD_GATE` | PR #8 lineage; exact head commit to reconcile | `NOT_VALIDATED` |
| Sweet Bear unified MLB v2 probe | `DATA_AND_MODEL_PIPELINE` | Sweet Bear | `NONCANONICAL_PROBE` | PR #9 lineage; exact head commit to reconcile | `NOT_VALIDATED` |
| Sweet Bear Kalishi LoL winner model | `PLANNED_MODEL` | Sweet Bear Kalishi Predicts | `PLANNED_NOT_IMPLEMENTED` | Proposed separate repository not verified | `NOT_VALIDATED` |

## Artifact-class vocabulary

- `PREDICTION_MODEL`: sport-specific probability implementation.
- `PREDICTION_MODEL_EXPERIMENT`: executable research model that has not passed promotion evidence.
- `COMPARISON_HARNESS`: paired-record evaluation and reporting infrastructure.
- `VALIDATION_SUBSTRATE`: statistical methods used to judge models rather than generate sport-specific forecasts.
- `DATA_AND_MODEL_PIPELINE`: acquisition, training, or unified-build lineage whose status cannot be reduced to one model artifact.
- `IMPLEMENTATION_SPECIFICATION`: requirements and acceptance tests without an accepted implementation.
- `LEGACY_MODEL_IDENTITY`: historical model label present in records without recovered source binding.
- `PLANNED_MODEL`: architecture or roadmap entry without implementation.

## Status vocabulary

- `IMPLEMENTED_RESEARCH_CANDIDATE`: executable implementation exists, but predictive validity is unproven.
- `SOURCE_NOT_RECOVERED`: model label exists in history, but reproducible implementation evidence is missing.
- `SOURCE_BINDING_PENDING`: implementation evidence exists, but canonical repository and commit are unresolved.
- `SPECIFIED_NOT_IMPLEMENTED`: requirements exist, but no accepted implementation exists.
- `SHADOW_EXPERIMENT`: software may run for research but is not an operationally validated model.
- `FAILED_DATA_BUILD_GATE`: the pipeline failed a declared build or coverage gate.
- `NONCANONICAL_PROBE`: exploratory lineage explicitly not accepted as canonical.
- `VALIDATION_SUBSTRATE_ONLY`: statistical judging tools, not a sport-specific prediction model.
- `PLANNED_NOT_IMPLEMENTED`: architecture or planning exists without production or research implementation.

## Evidence records

- `machines/mlb_pitcher_strikeout_joint_outing_v1.md`
- `machines/kbo_live_poisson_legacy_models.md`
- `machines/sweet_bear_vs_bear_edge_showdown.md`
- `machines/sweetbear_edge_validation_substrate.md`
- `machines/mlb_starter_batter_outcomes_joint_outing_v1.md`
- `machines/unified_mlb_and_total_bases_lineage.md`
- `TRANSCRIPT_INDEX.md`
- `MODEL_EVIDENCE_COMPLETENESS.md`
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
- implementation paths or archive path
- model artifact hash
- feature schema
- training cutoff
- test command
- verification result

Documentation, completion messages, screenshots, and historical ledger labels do not satisfy those fields by themselves.
