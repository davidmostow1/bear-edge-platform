# Current Canonical State

## Status table

| System | Code status | Data status | Validation status | Operational authority |
|---|---|---|---|---|
| Bear Edge release candidate | Substantial tested branch, not merged to master | Local ledger architecture; Supabase projection empty | Engineering tests strong; model evidence absent | PRICE_CHECK_ONLY |
| Sweet Bear DraftKings Predictions | Multiple research lineages; exact current model unresolved | Airtable has recommendations, wagers, settlements | Not reproducibly calibrated | Research/shadow |
| Pitcher strikeout machine | Dedicated branch and package | Research inputs/examples | Tests exist; no approved production evidence | Research-only |
| Unified MLB v1 | PR and bootstrap package | 2024-2025 history build produced incomplete coverage | Failed 1,000-batter gate | Rejected for promotion |
| Unified MLB v2 | Direct MLB modules on separate branch | History code present | Not declared canonical/validated here | Research-only |
| MLB total-bases simulator | Draft PR, deterministic simulation | Hand-supplied/experimental inputs | Not trained or calibrated | Shadow-only |
| Showdown harness | External handoff claims implementation | No paired settled production sample established | Gate not met | Diagnostic only |
| sweetbear-edge Python substrate | External statistical package | Simulation-validation artifacts | No sport model or market validation | Evaluation infrastructure |
| Kalishi Predicts | Complete architecture and audit package | No production records | No trained model | Private noncommercial shadow design |
| Screenshot ledger | Design and implementation plan | Evidence fixtures/design | Deployment not proven | Local audit tooling plan |

## Connected-system state

### Airtable

`Sweet Bear Betting Intelligence` has ten structured tables.

Record counts observed:

- EVENTS: 10
- RECOMMENDATIONS: 15
- ACTUAL WAGERS: 9
- LINE SNAPSHOTS: 0
- ANALYTICS INPUTS: 0
- RESULTS AND SETTLEMENTS: 14
- MODEL VERSIONS: 0
- CALIBRATION RUNS: 0
- BANKROLL LEDGER: 0
- AUDIT LOG: 3

This is a meaningful operational record trail, but it cannot support calibration or CLV claims while line snapshots, analytics inputs, model versions, and calibration runs are empty.

A second Airtable base named `sweet bear ` contains only an unused generic `Table 1`.

### Supabase

Project is active and healthy. Public tables:

- `profiles`
- `record_amendments`
- `settlement_records`
- `user_app_state`
- `decision_records`

All five tables have RLS enabled and zero rows. Supabase is therefore a deployed empty projection surface, not the current source of operational truth.

### Statsig

Two gates exist:

- `bear_edge_shadow_model`
- `bear_edge_provenance_ui`

Both are disabled. There are no dynamic configs and no experiments. Statsig currently cannot be described as an active model-control or champion/challenger system.

### Google Drive prospective ledger

The inspected workbook contains:

- Decisions: 25 nonblank records
- Snapshots: 75 nonblank records
- Outcomes: 12 nonblank records
- Calibration: 0 records

Most listed outcomes are zero-unit passes or monitoring results, correctly excluded from betting ROI and calibration. The empty calibration sheet is material.

## Repository visibility

The repository remained private during this snapshot. An earlier mandated CLI attempt to make it public failed because the runtime did not contain the `gh` executable. No alternative visibility mutation was attempted.
