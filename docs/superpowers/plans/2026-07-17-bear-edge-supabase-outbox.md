# Bear Edge Supabase Outbox Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Synchronize authoritative local audit records to Supabase reliably, idempotently, and without making remote availability part of the evaluation transaction.

**Architecture:** An append-only local outbox records pending and terminal synchronization events. A server-side worker maps canonical local records to the existing Supabase tables, uses `client_event_id` plus `content_digest` for idempotency, retries transient failures, and exposes health without exposing secrets.

**Tech Stack:** Node.js CommonJS, built-in `fetch`, filesystem JSONL, PostgreSQL 17, Supabase REST, Supabase migrations, and built-in `node:test`.

## Global Constraints

- Local evaluation remains usable when Supabase is missing or unavailable.
- The remote database is a projection, not the authority.
- `SUPABASE_SERVICE_ROLE_KEY` must remain server-side and must never appear in responses or logs.
- Remote conflicts cannot overwrite local records.
- Every remote migration must preserve existing rows or stop safely.
- The observed remote tables contain zero rows as of the 2026-07-17 planning query; recheck immediately before migration.
- Preserve unrelated worktree changes.

---

## File Map

| File | Responsibility |
| --- | --- |
| `src/sync/outbox.js` | Append and reconstruct synchronization state |
| `src/sync/supabase-mapper.js` | Map canonical local records to exact remote columns |
| `src/sync/supabase-client.js` | Authenticated REST insert and digest verification |
| `src/sync/sync-worker.js` | Retry scheduling, startup recovery, and health |
| `src/config/supabase-settings.js` | Safe configuration status without secret output |
| `supabase/migrations/202607170001_align_audit_records.sql` | Enum, integrity, idempotency, and immutable projection migration |
| `src/server.js` | Sync-health endpoint and worker lifecycle hooks |
| `src/cli/serve.js` | Start and stop the worker with the server |
| `src/release-readiness.js` | Remote projection evidence gate |
| `test/outbox.test.js` | State reconstruction and retry tests |
| `test/supabase-mapper.test.js` | Exact remote payload tests |
| `test/supabase-client.test.js` | HTTP, duplicate, conflict, timeout, and redaction tests |
| `test/sync-worker.test.js` | Recovery and bounded retry tests |
| `test/api.test.js` | Sync-health endpoint tests |

### Task 1: Append-Only Outbox State Machine

**Files:**
- Create: `src/sync/outbox.js`
- Create: `test/outbox.test.js`
- Modify: `src/audit/authoritative-ledger.js`

**Interfaces:**
- Produces: `enqueueRecord(record, options) -> outbox event`
- Produces: `appendSyncEvent(event, options) -> persisted event`
- Produces: `readOutboxState(options) -> { items, pending, retryableFailures, terminalFailures, summary }`
- Produces: `OUTBOX_STATES = ["pending", "in_flight", "synchronized", "retryable_failure", "terminal_failure"]`

- [x] **Step 1: Write failing state reconstruction tests**

```js
test("readOutboxState selects the latest event for each client event id", async () => {
  await appendSyncEvent({ clientEventId: eventId, state: "pending", attempt: 0, occurredAt: t1 }, { outboxPath });
  await appendSyncEvent({ clientEventId: eventId, state: "retryable_failure", attempt: 1, occurredAt: t2, nextAttemptAt: t3, errorCode: "NETWORK_ERROR" }, { outboxPath });
  const state = await readOutboxState({ outboxPath });
  assert.equal(state.items[0].state, "retryable_failure");
  assert.equal(state.summary.retryableFailures, 1);
  assert.equal(state.summary.oldestPendingAt, t1);
});

test("appendSyncEvent rejects decreasing attempt numbers", async () => {
  await appendSyncEvent({ clientEventId: eventId, state: "retryable_failure", attempt: 2, occurredAt: t2 }, { outboxPath });
  await assert.rejects(
    appendSyncEvent({ clientEventId: eventId, state: "pending", attempt: 1, occurredAt: t3 }, { outboxPath }),
    /attempt cannot decrease/i
  );
});
```

- [x] **Step 2: Confirm tests fail**

```bash
PATH="/Applications/ChatGPT.app/Contents/Resources/cua_node/bin:$PATH" node --test test/outbox.test.js
```

Expected: FAIL because `src/sync/outbox.js` does not exist.

- [x] **Step 3: Implement the outbox event contract**

Each event contains `schemaVersion`, `eventId`, `clientEventId`, `recordId`, `recordType`, `contentDigest`, `state`, `attempt`, `occurredAt`, `nextAttemptAt`, `errorCode`, and `safeError`. Validate UUID, digest, state, attempt, and timestamps before append.

- [x] **Step 4: Enqueue after authoritative append**

After the ledger flush succeeds, append one deterministic `pending` outbox event. If outbox append fails, keep the authoritative record and return `syncState: "terminal_failure"` with an explicit operator-visible error; do not erase or hide the local record.

- [x] **Step 5: Run tests and commit**

```bash
PATH="/Applications/ChatGPT.app/Contents/Resources/cua_node/bin:$PATH" node --test test/outbox.test.js test/authoritative-ledger.test.js
git add src/sync/outbox.js src/audit/authoritative-ledger.js test/outbox.test.js test/authoritative-ledger.test.js
git diff --cached --check
git commit -m "Add append-only synchronization outbox"
```

### Task 2: Exact Supabase Record Mapping

**Files:**
- Create: `src/sync/supabase-mapper.js`
- Create: `test/supabase-mapper.test.js`

**Interfaces:**
- Produces: `mapDecisionRecord(record, ownerUserId) -> public.decision_records row`
- Produces: `mapSettlementRecord(record, ownerUserId, remoteDecisionId) -> public.settlement_records row`
- Produces: `mapAmendmentRecord(record, ownerUserId, remoteDecisionId, remoteSettlementId) -> public.record_amendments row`

- [x] **Step 1: Write exact mapping tests**

```js
test("mapDecisionRecord preserves canonical identity and complete snapshots", () => {
  const row = mapDecisionRecord(evaluation, ownerUserId);
  assert.equal(row.user_id, ownerUserId);
  assert.equal(row.client_event_id, evaluation.clientEventId);
  assert.equal(row.verdict, "WAIT");
  assert.equal(row.source, "local_engine");
  assert.equal(row.schema_version, "2.0.0");
  assert.equal(row.content_digest, evaluation.contentDigest);
  assert.equal(row.canonical_event_id, "401816143");
  assert.equal(row.market_kind, "PLAYER_PROP");
  assert.equal(row.line_value, 5.5);
  assert.equal(row.probability_provenance_status, "BLOCK");
  assert.deepEqual(row.input_snapshot.audit_record, evaluation);
});
```

- [x] **Step 2: Confirm tests fail**

```bash
PATH="/Applications/ChatGPT.app/Contents/Resources/cua_node/bin:$PATH" node --test test/supabase-mapper.test.js
```

- [x] **Step 3: Implement decision mapping**

Use the exact existing columns observed on 2026-07-17. Store the complete canonical record under `input_snapshot.audit_record`, deterministic gate results under `state_snapshot.gates`, and compact computed output under `output_snapshot`. Map local `WAIT` directly after the migration. Map model statuses other than `validated` to `probability_provenance_status = "BLOCK"`.

- [x] **Step 4: Implement settlement and amendment mapping**

Map canonical `win`, `loss`, `push`, `void`, and `pending` without renaming. Preserve local record identifiers in `client_event_id`, `schema_version`, and `content_digest`. Compute no new profit or closing-line value in the mapper; use values already independently validated in the local record.

- [x] **Step 5: Run tests and commit**

```bash
PATH="/Applications/ChatGPT.app/Contents/Resources/cua_node/bin:$PATH" node --test test/supabase-mapper.test.js
git add src/sync/supabase-mapper.js test/supabase-mapper.test.js
git commit -m "Map canonical records to Supabase projection"
```

### Task 3: Safe Supabase Migration

**Files:**
- Create: `supabase/migrations/202607170001_align_audit_records.sql`
- Create: `test/supabase-migration.test.js`

**Interfaces:**
- Produces: remote constraints aligned with local canonical values
- Produces: unique `(user_id, client_event_id)` identifiers and digest columns on all three tables

- [x] **Step 1: Recheck remote row counts and schema**

Use the Supabase SQL connector to query the three table counts, columns, constraints, policies, and triggers. Expected before migration: all three counts remain zero. If any count is nonzero, export and validate every row before proceeding.

- [x] **Step 2: Write migration contract tests**

Read the SQL file as text and assert it contains explicit changes for `decision_records_verdict_check`, `decision_records_source_check`, `settlement_records_result_check`, `schema_version`, `content_digest`, `authority`, settlement nullability, final-settlement completeness, and unique client event constraints.

- [x] **Step 3: Write the migration**

The migration must execute these exact semantic changes in one transaction:

```sql
alter table public.decision_records
  add column if not exists schema_version text not null default '2.0.0',
  add column if not exists content_digest text,
  add column if not exists authority text not null default 'local';

alter table public.decision_records drop constraint if exists decision_records_verdict_check;
alter table public.decision_records add constraint decision_records_verdict_check
  check (verdict = any (array['BET'::text, 'PASS'::text, 'WAIT'::text]));

alter table public.decision_records drop constraint if exists decision_records_source_check;
alter table public.decision_records add constraint decision_records_source_check
  check (source = any (array['local_engine'::text, 'live_ui'::text, 'backup_restore'::text, 'screenshot_intake'::text, 'assistant_review'::text]));

alter table public.decision_records add constraint decision_records_content_digest_check
  check (content_digest ~ '^[a-f0-9]{64}$');

alter table public.decision_records alter column content_digest set not null;

alter table public.decision_records add constraint decision_records_authority_check
  check (authority = 'local');

alter table public.settlement_records
  add column if not exists client_event_id uuid,
  add column if not exists schema_version text not null default '2.0.0',
  add column if not exists content_digest text,
  add column if not exists authority text not null default 'local',
  alter column stake drop not null,
  alter column taken_odds drop not null,
  alter column profit drop not null;

alter table public.settlement_records drop constraint if exists settlement_records_result_check;
alter table public.settlement_records add constraint settlement_records_result_check
  check (result = any (array['pending'::text, 'win'::text, 'loss'::text, 'push'::text, 'void'::text]));

alter table public.settlement_records drop constraint if exists settlement_records_one_per_decision;

alter table public.settlement_records add constraint settlement_records_final_fields_check
  check (
    result = 'pending'
    or (stake is not null and stake > 0 and taken_odds is not null and profit is not null)
  );

create unique index if not exists settlement_records_client_event_unique
  on public.settlement_records (user_id, client_event_id)
  where client_event_id is not null;

create index if not exists settlement_records_decision_history
  on public.settlement_records (decision_id, settled_at desc, created_at desc);

alter table public.record_amendments
  add column if not exists client_event_id uuid,
  add column if not exists schema_version text not null default '2.0.0',
  add column if not exists content_digest text,
  add column if not exists authority text not null default 'local';

create unique index if not exists record_amendments_client_event_unique
  on public.record_amendments (user_id, client_event_id)
  where client_event_id is not null;
```

Add named non-null digest and authority checks for settlement and amendment tables after confirming all three tables remain empty. If rows appear before migration, stop and backfill only from independently verified source records before setting non-null constraints. Add comments describing the local-authority projection. Do not drop immutable mutation triggers, ownership foreign keys, or row-level-security policies. Removing `settlement_records_one_per_decision` is required because pending and corrected settlement events are append-only; current state is selected by ordered history rather than mutation.

- [x] **Step 4: Run local migration-contract tests**

```bash
PATH="/Applications/ChatGPT.app/Contents/Resources/cua_node/bin:$PATH" node --test test/supabase-migration.test.js
```

- [x] **Step 5: Apply through the Supabase migration connector**

Use migration name `align_audit_records_20260717`. Do not use raw SQL execution for the DDL. Capture the migration identifier and complete result.

- [x] **Step 6: Verify database behavior**

Query constraints, indexes, triggers, policies, and counts. Insert representative records inside a transaction and roll the transaction back. Verify `WAIT`, `pending`, `win`, `loss`, `push`, and `void` satisfy constraints; verify `NO BET`, `won`, and `lost` fail.

- [x] **Step 7: Run Supabase advisors**

Run security and performance advisors. Resolve every error and classify warnings in the audit ledger.

- [x] **Step 8: Commit Task 3**

```bash
git add supabase/migrations/202607170001_align_audit_records.sql test/supabase-migration.test.js
git diff --cached --check
git commit -m "Align Supabase audit record contracts"
```

### Task 4: Supabase Client and Conflict Verification

**Files:**
- Create: `src/config/supabase-settings.js`
- Create: `src/sync/supabase-client.js`
- Create: `test/supabase-client.test.js`
- Modify: `src/config/secrets.js`

**Interfaces:**
- Produces: `getSupabaseSyncStatus() -> safe status object`
- Produces: `createSupabaseClient(options) -> { insertRecord, findByClientEventId }`
- Consumes environment: `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`, `SUPABASE_OWNER_USER_ID`

- [x] **Step 1: Write safe-configuration tests**

Assert missing settings return `configured: false`, complete settings return `configured: true`, and no returned object or error contains the service-role key.

- [x] **Step 2: Write HTTP behavior tests**

Use an injected `fetchImpl`. Assert headers include `apikey`, `authorization: Bearer <key>`, `content-type`, and `Prefer: resolution=ignore-duplicates,return=representation`. Assert timeout becomes `retryable_failure`, 401 becomes `terminal_failure`, 400 schema rejection becomes `terminal_failure`, and a duplicate triggers a digest lookup.

- [x] **Step 3: Implement the client**

Use `AbortSignal.timeout(10000)` by default. Build table-specific REST paths, URL-encode filters, and return stable error codes. Never include request headers or raw remote bodies in user-facing errors.

- [x] **Step 4: Verify duplicate digest semantics**

After an ignored duplicate, query by `user_id` and `client_event_id`. A matching digest returns `already_synchronized`; a different digest returns terminal `REMOTE_DIGEST_CONFLICT`.

- [x] **Step 5: Run tests and commit**

```bash
PATH="/Applications/ChatGPT.app/Contents/Resources/cua_node/bin:$PATH" node --test test/supabase-client.test.js
git add src/config/supabase-settings.js src/config/secrets.js src/sync/supabase-client.js test/supabase-client.test.js
git commit -m "Add safe Supabase synchronization client"
```

### Task 5: Retry Worker and Operational Health

**Files:**
- Create: `src/sync/sync-worker.js`
- Create: `test/sync-worker.test.js`
- Modify: `src/cli/serve.js`
- Modify: `src/server.js`
- Modify: `src/release-readiness.js`
- Modify: `test/api.test.js`

**Interfaces:**
- Produces: `createSyncWorker(options) -> { start, stop, runNow, getStatus }`
- Produces: `GET /api/sync-health`
- Produces: `POST /api/sync/run`

- [x] **Step 1: Write retry and restart tests**

Test the schedule `min(300000, 1000 * 2 ** attempt) + deterministic jitter`, startup recovery of pending items, no retry for terminal failures, one active run at a time, and clean stop.

- [x] **Step 2: Confirm tests fail**

```bash
PATH="/Applications/ChatGPT.app/Contents/Resources/cua_node/bin:$PATH" node --test test/sync-worker.test.js
```

- [x] **Step 3: Implement worker lifecycle**

Default to disabled when configuration is incomplete. When enabled, process due items in created order, cap each run at 100 items, append `in_flight` before remote work, and append the exact final state afterward.

- [x] **Step 4: Expose safe health**

Return enabled, configured, running, pending count, retryable count, terminal count, oldest pending age, last success, and last safe error. Do not return URLs containing credentials, authorization headers, or record snapshots.

- [x] **Step 5: Add release evidence**

Release readiness treats missing Supabase as an optional warning, terminal synchronization failures as a high-severity data-integrity blocker, and pending retryable work as degraded rather than lost.

- [x] **Step 6: Run Plan 2 verification and commit**

```bash
PATH="/Applications/ChatGPT.app/Contents/Resources/cua_node/bin:$PATH" node --test test/outbox.test.js test/supabase-mapper.test.js test/supabase-client.test.js test/sync-worker.test.js test/api.test.js
PATH="/Applications/ChatGPT.app/Contents/Resources/cua_node/bin:$PATH" npm run verify
git add src/sync/sync-worker.js src/cli/serve.js src/server.js src/release-readiness.js test/sync-worker.test.js test/api.test.js
git diff --cached --check
git commit -m "Add resilient Supabase synchronization worker"
```

## Completion Result

- The append-only outbox was committed in `b33b194`.
- The canonical remote mapper was committed in `7f16067` and aligned with the live schema in `39297dd`.
- The database contract and three applied migrations were committed through `1d85b21`.
- The secret-safe REST client was committed in `214ae9c`.
- The retry worker, server lifecycle, safe health endpoints, and release gate were completed after 107 focused tests and 211 full repository tests passed with zero failures.
- Applied migration identifiers: `20260717075523`, `20260717075721`, and `20260717080017`.
- Transactional behavior checks accepted `WAIT`, `BET`, `pending`, `win`, `loss`, `push`, `void`, and amendment rows; rejected legacy `NO BET`, `won`, and `lost`; and confirmed immutable update and delete failures before rollback.
- The final Supabase security advisor returned no findings. The remaining performance notice is the intentionally retained settlement chronology index on an empty table.
- As of the final 2026-07-17 check, `decision_records`, `settlement_records`, `record_amendments`, and `auth.users` each contain zero rows.
- Runtime synchronization remains intentionally disabled because `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`, and `SUPABASE_OWNER_USER_ID` are not configured and no Supabase Auth owner exists. Local authoritative evaluation remains fully usable; no credential or owner identity was fabricated.
