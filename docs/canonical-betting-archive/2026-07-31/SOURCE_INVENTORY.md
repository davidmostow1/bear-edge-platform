# Source Inventory

## GitHub

Inspected repository metadata, branches, commits, pull requests, changed-file inventories, workflow runs, jobs, logs, commit contents, and file blobs.

- Repository: `davidmostow1/bear-edge-platform`
- Snapshot master: `e428eae1ebe2b44fbfdd6c3ba2d589405e7f96ef`
- Archive branch: `archive/canonical-betting-state-2026-07-31`
- Pitcher-machine candidate commit: `a5b422bf0f98a10593bb5c52377d78ff28e456f0`

## ChatGPT File Library

Full source and handoff artifacts inspected include:

- `Bear_Edge_Sweet_Bear_Canonical_Coordination_Packet_2026-07-28.md`
- `Sweet_Bear_Kalishi_Predicts_Full_Claude_Handoff.md`
- `Sweet_Bear_Kalishi_Predicts_Claude_Audit_v1.md`
- `2026-07-23-screenshot-ledger-design.md`
- `2026-07-23-screenshot-ledger-implementation.md`
- `sweet-bear-strikeout-machine.mjs`
- `sweet-bear-strikeout-machine-v1.SHA256SUMS.txt`
- `registry.working-v3.json`

### Canonical complete thread transcript

The complete user-visible Sweet Bear prediction-machine thread is preserved at:

`/Prediction machine/Canonical source transcripts/2026-07-31/`

The persistent folder contains Markdown, plain-text, ZIP, and checksum receipts. See [`TRANSCRIPT_INDEX.md`](TRANSCRIPT_INDEX.md) for persistent file identifiers, byte counts, and SHA-256 values.

### Pitcher package checksum distinction

Two separate checksum artifacts exist and must not be conflated:

1. The candidate Git commit contains a portable, relative-path four-entry `SHA256SUMS.txt` bound directly to commit `a5b422bf...`.
2. The File Library contains a larger expanded-package checksum inventory using absolute `/mnt/data/...` paths.

The first is commit-bound. The second describes the expanded modular package but is not yet independently proven byte-for-byte equivalent to the committed tarball.

## Google Drive

Inspected:

- `SHOWDOWN_HANDOFF_2026-07-28.md`
- `VERIFICATION.md` from the `sweetbear-edge` folder
- `Bear Edge Prospective Betting Ledger`

The workbook was read through the approved spreadsheet reader and contained 25 decisions, 75 snapshots, 12 outcomes, and zero calibration rows.

## Notion

Inspected `Bear Edge v10 — Failure Audit and Rebuild Specification`, including its failure diagnosis, risk gates, historical lower-bound ticket audit, and empty Supabase observation.

## Gmail

Read two relevant drafts:

- independent preregistered validation request,
- independent accredited software-audit scope request.

Login emails, OTPs, verification codes, and account alerts were excluded.

## Airtable

Read-only inspection of:

- Base `Sweet Bear Betting Intelligence` (`appa3DhF3tG8zAiLZ`)
- Base `sweet bear ` (`appjqkTKjr1I4H2U1`)

## Supabase

Read-only inspection of project `anxouzruouyraumgjdju`, its public tables, row counts, and RLS state.

## Statsig

Read-only inspection of feature gates, dynamic configs, and experiments.

## Public primary APIs used for the PA diagnosis

- MLB Stats API season hitting totals.
- Baseball Savant Statcast CSV responses.

## Local evidence bundle status

A 30-file local evidence package was generated during the original audit with source copies, CSV conversions, JSON state snapshots, a manifest, and SHA-256 sums. No persistent Library file ID or GitHub artifact was recorded for that package, so it must be treated as potentially ephemeral rather than as a guaranteed recovery source.

The durable sources are the connected systems listed above, the canonical File Library transcript package, and the files committed to this archive branch.
