# Canonical Betting Systems Archive

**Snapshot date:** 2026-07-31  
**Repository:** `davidmostow1/bear-edge-platform`  
**Archive branch:** `archive/canonical-betting-state-2026-07-31`  
**Scope:** Documentation, evidence inventories, and reconciled state only. No application code was modified.

## Executive verdict

This archive preserves the current truth of the betting work without pretending the pieces are one finished machine.

The ecosystem contains:

1. **Bear Edge**, the decision-control, risk, audit, and operator application.
2. **Sweet Bear DraftKings Predictions**, a separate research/prediction lineage with recommendation, wager, and settlement records.
3. **Sweet Bear MLB machines**, including pitcher-strikeout, batter-history, unified MLB, and total-bases experiments on separate branches.
4. **Sweet Bear vs Bear Edge Showdown**, a paired prospective comparison harness described in an external handoff.
5. **sweetbear-edge**, a Python statistical-validation substrate with no sport-specific model.
6. **Sweet Bear Kalishi Predicts**, a fully separate Kalshi sports/esports research architecture, not an implemented trading system.
7. **Screenshot-to-ledger**, a local-first evidence-ingestion design and implementation plan.
8. **Prospective betting ledgers**, including 25 decisions, 75 line/state snapshots, 12 outcomes, and zero calibration rows in the Drive workbook.
9. **Airtable operational ledgers**, containing recommendations, confirmed wagers, settlements, and a small audit trail, while key evidence tables remain empty.

## Non-negotiable boundaries

- Recommendation history, recommendation changes, actual wagers, and settlements are separate record classes.
- DraftKings Predictions and Kalishi remain separate in models, datasets, calibration, ledgers, bankroll, P&L, authorization, and performance claims.
- Screenshots are evidence, not self-authenticating wager records.
- No model is promoted because it won a small batch, generated attractive simulations, or passed unit tests.
- Current operating authority remains research-only, shadow, or `PRICE_CHECK_ONLY` unless a specific artifact proves otherwise.
- No profitability claim is authorized.

## Archive contents

1. [`SYSTEM_MAP.md`](SYSTEM_MAP.md)
2. [`CURRENT_STATE.md`](CURRENT_STATE.md)
3. [`AUTHORITY_AND_CONTRADICTION_REGISTER.md`](AUTHORITY_AND_CONTRADICTION_REGISTER.md)
4. [`DATA_LEDGER_AUDIT.md`](DATA_LEDGER_AUDIT.md)
5. [`VALIDATION_AND_PROMOTION.md`](VALIDATION_AND_PROMOTION.md)
6. [`GITHUB_REF_MAP.md`](GITHUB_REF_MAP.md)
7. [`PLATE_APPEARANCE_SHORTFALL_DIAGNOSIS.md`](PLATE_APPEARANCE_SHORTFALL_DIAGNOSIS.md)
8. [`OPEN_RISKS_AND_NEXT_ACTIONS.md`](OPEN_RISKS_AND_NEXT_ACTIONS.md)
9. [`SOURCE_INVENTORY.md`](SOURCE_INVENTORY.md)
10. [`SENSITIVE_DATA_EXCLUSIONS.md`](SENSITIVE_DATA_EXCLUSIONS.md)
11. [`AUDIT_REPORT.md`](AUDIT_REPORT.md)
12. [`CONNECTED_SYSTEM_STATE.json`](CONNECTED_SYSTEM_STATE.json)
13. [`manifest.json`](manifest.json)
14. [`GIT_BLOB_SHAS.txt`](GIT_BLOB_SHAS.txt)

## Verification contract

The upload is complete only when:

- each archived path can be refetched from GitHub,
- refetched content matches the intended archive content,
- each committed content file has a recorded Git blob SHA,
- the branch diff contains only `docs/canonical-betting-archive/2026-07-31/`,
- no application-code path is changed,
- no secret, OTP, credential, or raw account evidence is committed.
