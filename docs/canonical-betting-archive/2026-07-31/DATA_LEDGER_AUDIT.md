# Data and Ledger Audit

## Evidence lanes

The correct ledger architecture has four distinct lanes:

1. Algorithm recommendation at the original timestamp.
2. Later recommendation change, withdrawal, or supersession.
3. Actual wager explicitly confirmed.
4. Official settlement and amendment history.

No lane may be inferred from another.

## Airtable findings

### Present

- 10 KBO event records, including duplicate canonical identities using different capitalization and naming conventions.
- 15 recommendation records.
- 9 actual-wager records, all identified as DraftKings Predictions and settled.
- 14 settlement records.
- 3 batch-level audit-log entries.

### Missing or empty

- 0 line snapshots.
- 0 analytics inputs.
- 0 registered model versions.
- 0 calibration runs.
- 0 bankroll-ledger entries.

### Consequence

The current Airtable state can document that recommendations, wagers, and outcomes were recorded. It cannot prove:

- the exact executable price at recommendation time,
- closing-line value,
- feature availability,
- model reproducibility,
- calibrated probability quality,
- bankroll-relative sizing,
- prospective edge.

### Identity issue

KBO events appear in both uppercase and lowercase identifier forms, such as `KBO-20260728-KT-NC` and `kbo-2026-07-28-kt-nc`. These may represent duplicate event identities unless canonicalization links them.

## Drive prospective ledger findings

The workbook preserves a large prospective state trail:

- 25 decisions,
- 75 snapshots,
- 12 outcomes,
- no calibration rows.

Many records correctly use `NO BET`, `PASS`, `WAIT`, `MONITORING`, or zero units. This is healthy evidence discipline. Monitoring outcomes must not be converted into model wins or losses.

## Supabase findings

The schema and RLS exist, but all records are empty. No claim that Airtable or local records are remotely projected is currently supported.

## Screenshot evidence

Screenshots can establish visible UI text at a capture time. They do not by themselves establish:

- exact contract identity,
- recommendation issuance,
- actual order,
- fill,
- stake,
- settlement,
- user intent,
- model version.

The screenshot-to-ledger design appropriately requires hashes, confidence, deduplication, manual review, ticket-level P&L, and append-only revisions.

## Minimum data contract before calibration

Every eligible prediction needs:

- system ID,
- model ID and version,
- code commit SHA,
- artifact hash,
- feature schema version,
- event, market, line, and selection identity,
- evidence cutoff,
- prediction timestamp,
- raw and calibrated probability,
- executable price and source timestamp,
- closing price at a predeclared convention,
- official outcome,
- exclusion flags,
- correlation group,
- amendment chain.

Actual wager analysis additionally needs confirmed ticket or order identity, stake, fill price, fees, and bankroll state.
