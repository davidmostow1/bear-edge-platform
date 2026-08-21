# Archive Audit Report

## Scope

This archive was assembled from GitHub, the ChatGPT file library, Google Drive, Notion, Gmail, Airtable, Supabase, Statsig, and primary MLB and Statcast APIs.

## Preservation checks

1. Full text source artifacts were read where materialization or download was available.
2. The prospective ledger workbook was read through the approved spreadsheet reader and reconciled by sheet and nonblank record count.
3. Sensitive credential and account material was excluded.
4. Canonical summaries distinguish verified facts, external claims, proposals, and unresolved contradictions.
5. No application code path was created or modified.
6. Every committed archive content file is listed in `manifest.json` and `GIT_BLOB_SHAS.txt`.
7. GitHub files were refetched after upload and their blob SHAs recorded.
8. The final branch diff is checked to ensure every changed path is under `docs/canonical-betting-archive/2026-07-31/`.

## Source-system audit passes

- **GitHub:** repository, branch, PR, commit, workflow, job, and failure-log inspection.
- **Airtable:** both matching bases inspected; all tables inventoried; all betting-table record counts checked.
- **Supabase:** project status, public tables, RLS, and row counts checked.
- **Statsig:** gates, dynamic configs, and experiments checked.
- **Drive:** showdown handoff, statistical verification package, and prospective ledger checked.
- **Notion:** v10 failure/rebuild audit checked.
- **Gmail:** relevant external-audit drafts checked; sensitive account messages excluded.
- **File library:** canonical coordination, Kalishi handoff and audit, and screenshot-ledger documents checked.
- **Public APIs:** MLB season totals and Baseball Savant row-cap evidence checked for the PA diagnosis.

## Known limits

- Conversation history is not a single exportable canonical file, so this archive relies on preserved handoffs, connected-source records, prior explicit decisions, and current repository evidence.
- External local repositories described in Drive handoffs were not automatically available as GitHub repositories; their claims remain labeled external until reconciled by exact repository and commit.
- Raw sportsbook screenshots and account emails were intentionally excluded for security and privacy.
- No application test suite was rerun because this operation modifies documentation and evidence only.
