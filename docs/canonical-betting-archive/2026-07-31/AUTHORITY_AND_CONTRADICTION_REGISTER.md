# Authority and Contradiction Register

This register preserves conflicts rather than selecting whichever statement sounds strongest.

## Authority order

1. Most recent explicit user instruction.
2. Explicit user choice among alternatives.
3. Locked canonical decision records.
4. Verified current repository/connected-system facts.
5. Audited source artifacts with reproducible evidence.
6. Assistant proposals and historical drafts.
7. Inference, always labeled.

## C-001: One system versus separate systems

**Conflict:** Earlier coordination material sometimes describes Sweet Bear as the operating/research layer around Bear Edge. Later explicit instructions require Kalishi and DraftKings Predictions to remain fully separate.

**Resolution:** Bear Edge may provide neutral application/audit infrastructure to DraftKings Predictions. Kalishi remains separately modeled, calibrated, bankrolled, permissioned, and recorded.

## C-002: DraftKings execution surface

**Conflict:** Older code accepts generic sportsbook input and older notes mention multiple books. Later authority says DraftKings Predictions is the only execution surface; public sportsbooks are comparison-only.

**Resolution:** DraftKings Predictions is the only approved execution surface for the DraftKings system. Every other book is market evidence only.

## C-003: Recommendations versus actual wagers

**Conflict:** Older records and schemas could allow a recommendation to be settled as though it were a wager.

**Resolution:** Recommendations, changes/withdrawals, actual wagers, and settlements are distinct lifecycles. Financial P&L requires an actual-wager record.

## C-004: The 500-observation gate

**Conflict:** The Showdown handoff proposes 500 paired settled predictions and 100 events. The later `sweetbear-edge` verification package argues that hundreds of correlated observations have very low power for small edges and cites roughly 8,700 even-money observations for a 3% edge under its assumptions.

**Resolution:** 500 is a review checkpoint, not universal production proof. Promotion requires an effect-size-specific prospective power analysis, clustered inference, market-relative evidence, and predeclared thresholds.

## C-005: Test-count claims

**Conflict:** Different branches and external packages report 131, 414, and 658 passing tests.

**Resolution:** These counts refer to different repositories, branches, or packages and cannot be added together or treated as one system-wide proof.

## C-006: Showdown implementation status

**Conflict:** The handoff says the showdown code was built and verified. It also records an earlier mistake where documentation was mistaken for implemented code, and the inspected central GitHub repo did not independently establish the claimed showdown path.

**Resolution:** Treat the handoff as evidence of an external implementation claim. Require repository URL, commit SHA, tracked-file list, and clean-run output before declaring it canonical.

## C-007: Sweet Bear model identity

**Conflict:** Airtable records include named KBO Poisson versions, but several July 29 records say `Sweet Bear algorithm; exact version unresolved`.

**Resolution:** Those records remain historical evidence but are ineligible for model calibration or promotion until linked to an immutable model version, commit, artifact hash, and feature schema.

## C-008: Complete MLB history

**Conflict:** Unified MLB v1 marked its generated history status as complete while the 1,000-batter gate failed.

**Resolution:** Structural generation completed; data coverage did not. The gate remains authoritative for that build. The history is incomplete for promotion.

## C-009: Plate-appearance source completeness

**Conflict:** 4,858 games appear nearly complete, yet 341,183 PAs are materially low.

**Resolution:** Current evidence supports source-response truncation during weekly Statcast extraction, not a missing game schedule. See `PLATE_APPEARANCE_SHORTFALL_DIAGNOSIS.md`.

## C-010: Supabase authority

**Conflict:** Design documents designate Supabase as a remote projection, while some operational language implies database authority.

**Resolution:** The append-only local ledger is authoritative where implemented; Supabase is a remote projection. At snapshot time it contains zero decision, settlement, or amendment rows.

## C-011: Airtable authority

**Conflict:** Airtable contains real records, but source-of-truth plans prefer a normalized immutable local ledger.

**Resolution:** Airtable is operational evidence and a useful structured workspace, not proof of complete immutable provenance. It must not silently overwrite or replace the canonical append-only ledger.
