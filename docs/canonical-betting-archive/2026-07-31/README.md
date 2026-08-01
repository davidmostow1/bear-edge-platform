# Canonical Betting Systems Archive

**Snapshot date:** 2026-07-31  
**Repository:** `davidmostow1/bear-edge-platform`  
**Archive branch:** `archive/canonical-betting-state-2026-07-31`  
**Scope:** Documentation, evidence inventories, reconciled state, and archive-integrity automation. No application or model implementation code was modified.

## Executive verdict

This archive preserves the current state of the betting-related work without pretending the pieces form one finished or validated machine.

The ecosystem contains:

1. **Bear Edge**, the decision-control, risk, audit, and operator application.
2. **Sweet Bear DraftKings Predictions**, a separate research and prediction lineage.
3. **Sweet Bear MLB machines and experiments**, including pitcher strikeouts, batter outcomes, unified MLB, and total bases.
4. **Sweet Bear vs Bear Edge Showdown**, a paired prospective comparison harness whose exact canonical Git binding remains unresolved.
5. **`sweetbear-edge`**, a Python statistical-validation substrate with no sport-specific model.
6. **Sweet Bear Kalishi Predicts**, a fully separate sports and esports research architecture that remains planned rather than implemented.
7. **Screenshot-to-ledger and prospective evidence systems**, including connected ledgers and audit records.

## Non-negotiable boundaries

- Recommendations, later recommendation changes, actual entries, and settlements are separate record classes.
- DraftKings Predictions and Kalishi remain separate in models, datasets, calibration, ledgers, accounting, authorization, and performance claims.
- Screenshots are evidence, not self-authenticating records.
- Passing unit tests establishes tested software behavior, not predictive validity.
- Current operating authority remains research-only, shadow, or `PRICE_CHECK_ONLY` unless a specific artifact proves otherwise.
- No profitability claim is authorized.

## Core state and governance

- [`SYSTEM_MAP.md`](SYSTEM_MAP.md)
- [`CURRENT_STATE.md`](CURRENT_STATE.md)
- [`AUTHORITY_AND_CONTRADICTION_REGISTER.md`](AUTHORITY_AND_CONTRADICTION_REGISTER.md)
- [`DATA_LEDGER_AUDIT.md`](DATA_LEDGER_AUDIT.md)
- [`VALIDATION_AND_PROMOTION.md`](VALIDATION_AND_PROMOTION.md)
- [`MODEL_EVIDENCE_COMPLETENESS.md`](MODEL_EVIDENCE_COMPLETENESS.md)
- [`OPEN_RISKS_AND_NEXT_ACTIONS.md`](OPEN_RISKS_AND_NEXT_ACTIONS.md)

## Machine and lineage records

- [`PREDICTION_MACHINE_REGISTRY.md`](PREDICTION_MACHINE_REGISTRY.md)
- [`machines/mlb_pitcher_strikeout_joint_outing_v1.md`](machines/mlb_pitcher_strikeout_joint_outing_v1.md)
- [`machines/mlb_starter_batter_outcomes_joint_outing_v1.md`](machines/mlb_starter_batter_outcomes_joint_outing_v1.md)
- [`machines/kbo_live_poisson_legacy_models.md`](machines/kbo_live_poisson_legacy_models.md)
- [`machines/sweet_bear_vs_bear_edge_showdown.md`](machines/sweet_bear_vs_bear_edge_showdown.md)
- [`machines/sweetbear_edge_validation_substrate.md`](machines/sweetbear_edge_validation_substrate.md)
- [`machines/unified_mlb_and_total_bases_lineage.md`](machines/unified_mlb_and_total_bases_lineage.md)

## Source, transcript, and diagnosis records

- [`TRANSCRIPT_INDEX.md`](TRANSCRIPT_INDEX.md)
- [`SOURCE_INVENTORY.md`](SOURCE_INVENTORY.md)
- [`GITHUB_REF_MAP.md`](GITHUB_REF_MAP.md)
- [`PLATE_APPEARANCE_SHORTFALL_DIAGNOSIS.md`](PLATE_APPEARANCE_SHORTFALL_DIAGNOSIS.md)
- [`SENSITIVE_DATA_EXCLUSIONS.md`](SENSITIVE_DATA_EXCLUSIONS.md)
- [`AUDIT_REPORT.md`](AUDIT_REPORT.md)
- [`CONNECTED_SYSTEM_STATE.json`](CONNECTED_SYSTEM_STATE.json)

## Integrity metadata and automation

- [`manifest.json`](manifest.json)
- [`GIT_BLOB_SHAS.txt`](GIT_BLOB_SHAS.txt)
- [`validate_archive.py`](validate_archive.py)
- Workflow: `.github/workflows/canonical-archive-integrity.yml`

## Verification contract

The archive is merge-ready only when:

- every archived path can be refetched from GitHub,
- every committed archive content file appears in `manifest.json` and `GIT_BLOB_SHAS.txt`,
- every recorded Git blob SHA matches the current file bytes,
- all archive JSON parses,
- all local Markdown links resolve,
- every machine evidence file is referenced by the prediction-machine registry,
- the branch diff contains only the archive directory plus the dedicated archive-integrity workflow,
- no application or model implementation path is changed,
- no secret, OTP, credential, or raw account evidence is committed,
- the automated archive-integrity validator passes.
