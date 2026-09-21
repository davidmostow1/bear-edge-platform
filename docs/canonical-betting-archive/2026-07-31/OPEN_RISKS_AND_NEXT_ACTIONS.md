# Open Risks and Next Actions

## P0: Establish one authority hierarchy

Create an approved canonical decision register identifying:

- core application branch,
- current DraftKings model lineage,
- each MLB research machine,
- model registry authority,
- ledger authority,
- database projection authority,
- execution surface.

## P0: Repair data provenance before model claims

- Populate immutable line snapshots.
- Populate analytics inputs with source timestamps.
- Register every model version with commit and artifact hash.
- Create reproducible calibration runs.
- Resolve duplicate event identities.
- Link every wager and settlement to the exact original recommendation and model version.

## P0: Fix Statcast extraction

- Reduce query chunk size or paginate.
- Assert no response equals a suspicious hard row cap.
- Reconcile PA totals per season against official MLB hitting totals.
- Add per-game source-versus-stored PA audits.
- Keep the existing failed history artifact as evidence; do not overwrite it.

## P0: Keep authorization closed

Do not enable production stakes while:

- Supabase projections are empty,
- model versions and calibration runs are empty,
- exact line snapshots are missing,
- current model identity is unresolved,
- market-relative prospective evidence is absent.

## P1: Reconcile external packages

- Locate the exact repository and commit for the Showdown implementation.
- Locate the exact repository and commit for `sweetbear-edge`.
- Verify their tracked files and rerun tests from clean checkouts.
- Decide whether to vendor, link, or keep them as external packages.

## P1: Complete recommendation lifecycle

Add distinct records for:

- recommendation issued,
- recommendation improved,
- recommendation downgraded,
- recommendation withdrawn,
- no-bet or pass,
- actual wager,
- partial fill,
- settlement,
- amendment.

## P1: Define promotion power

Replace universal round-number sample gates with predeclared effect-size and correlation-aware power requirements. Keep 50, 100, 200, and 500 as review milestones, not automatic proof.

## P2: Activate neutral controls only after evidence

Statsig may later control shadow assignment, provenance UI, kill switches, and champion/challenger exposure. It must never grant betting authority or mutate historical evidence.
