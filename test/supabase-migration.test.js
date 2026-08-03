const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const migrationDir = path.resolve(__dirname, "../supabase/migrations");
const migrationPath = path.resolve(
  __dirname,
  "../supabase/migrations/20260717075523_align_audit_records_20260717.sql"
);
const serviceProjectionMigrationPath = path.resolve(
  __dirname,
  "../supabase/migrations/20260717075721_allow_service_projection_20260717.sql"
);
const indexCleanupMigrationPath = path.resolve(
  __dirname,
  "../supabase/migrations/20260717080017_remove_duplicate_client_event_index_20260717.sql"
);
const shadowEvidenceMigrationPath = path.resolve(
  __dirname,
  "../supabase/migrations/20260718010000_shadow_evidence_v21.sql"
);

const versionControlledMigrationFiles = [
  "20260711021059_auth_user_state.sql",
  "20260711023920_audit_journal.sql",
  "20260711024403_allow_auth_user_cascade.sql",
  "20260711024518_audit_foreign_key_indexes.sql",
  "20260711024913_enforce_amendment_link.sql",
  "20260711035024_structured_market_context.sql",
  "20260711043301_probability_provenance.sql",
  "20260711043655_strengthen_probability_provenance.sql",
  "20260711201314_canonical_market_identity.sql",
  "20260711201609_fix_identity_trigger_permissions.sql",
  "20260711204856_decision_journal_indexes.sql",
  "20260711215305_decision_journal_indexes_v10.sql",
  "20260717075523_align_audit_records_20260717.sql",
  "20260717075721_allow_service_projection_20260717.sql",
  "20260717080017_remove_duplicate_client_event_index_20260717.sql",
  "20260718010000_shadow_evidence_v21.sql"
];

function migrationSql() {
  return fs.readFileSync(migrationPath, "utf8");
}

function serviceProjectionMigrationSql() {
  return fs.readFileSync(serviceProjectionMigrationPath, "utf8");
}

function indexCleanupMigrationSql() {
  return fs.readFileSync(indexCleanupMigrationPath, "utf8");
}

function shadowEvidenceMigrationSql() {
  return fs.readFileSync(shadowEvidenceMigrationPath, "utf8");
}

test("repository contains the complete version-controlled migration ledger", () => {
  const migrationFiles = fs.readdirSync(migrationDir)
    .filter((file) => file.endsWith(".sql"))
    .sort();

  assert.deepEqual(migrationFiles, versionControlledMigrationFiles);
});

test("migration stops unless all projection tables are empty", () => {
  const sql = migrationSql();

  for (const table of ["decision_records", "settlement_records", "record_amendments"]) {
    assert.match(sql, new RegExp(`exists\\s*\\(\\s*select 1 from public\\.${table}`, "i"));
  }
  assert.match(sql, /raise exception[\s\S]*independently validated/i);
});

test("migration aligns canonical verdict, source, and settlement outcome values", () => {
  const sql = migrationSql();

  assert.match(sql, /decision_records_verdict_check[\s\S]*'BET'[\s\S]*'PASS'[\s\S]*'WAIT'/i);
  assert.match(sql, /decision_records_source_check[\s\S]*'local_engine'[\s\S]*'live_ui'[\s\S]*'backup_restore'[\s\S]*'screenshot_intake'[\s\S]*'assistant_review'/i);
  assert.match(sql, /settlement_records_result_check[\s\S]*'pending'[\s\S]*'win'[\s\S]*'loss'[\s\S]*'push'[\s\S]*'void'/i);
  assert.doesNotMatch(sql, /'NO BET'/i);
  assert.doesNotMatch(sql, /'won'/i);
  assert.doesNotMatch(sql, /'lost'/i);
});

test("migration adds immutable projection metadata to all three tables", () => {
  const sql = migrationSql();

  for (const table of ["decision_records", "settlement_records", "record_amendments"]) {
    const tableBlock = new RegExp(
      `alter table public\\.${table}[\\s\\S]*?schema_version[\\s\\S]*?content_digest[\\s\\S]*?authority[\\s\\S]*?synchronized_at`,
      "i"
    );
    assert.match(sql, tableBlock);
  }

  assert.match(sql, /decision_records_content_digest_check[\s\S]*\{64\}/i);
  assert.match(sql, /settlement_records_content_digest_check[\s\S]*\{64\}/i);
  assert.match(sql, /record_amendments_content_digest_check[\s\S]*\{64\}/i);
  assert.match(sql, /decision_records_authority_check[\s\S]*authority = 'local'/i);
  assert.match(sql, /settlement_records_authority_check[\s\S]*authority = 'local'/i);
  assert.match(sql, /record_amendments_authority_check[\s\S]*authority = 'local'/i);
});

test("migration creates complete idempotency keys and append-only settlement history", () => {
  const sql = migrationSql();

  assert.match(sql, /settlement_records[\s\S]*client_event_id uuid not null/i);
  assert.match(sql, /record_amendments[\s\S]*client_event_id uuid not null/i);
  assert.match(sql, /settlement_records_client_event_unique[\s\S]*user_id, client_event_id/i);
  assert.match(sql, /record_amendments_client_event_unique[\s\S]*user_id, client_event_id/i);
  assert.match(sql, /drop constraint if exists settlement_records_one_per_decision/i);
  assert.match(sql, /settlement_records_decision_history[\s\S]*decision_id[\s\S]*settled_at desc[\s\S]*created_at desc/i);
});

test("migration permits pending settlement nulls without weakening final settlement completeness", () => {
  const sql = migrationSql();

  assert.match(sql, /alter column stake drop not null/i);
  assert.match(sql, /alter column taken_odds drop not null/i);
  assert.match(sql, /alter column profit drop not null/i);
  assert.match(sql, /settlement_records_final_fields_check[\s\S]*result = 'pending'[\s\S]*stake is not null[\s\S]*taken_odds is not null[\s\S]*profit is not null/i);
});

test("migration allows independently retained closing odds without fabricating CLV", () => {
  const sql = migrationSql();

  assert.match(sql, /drop constraint if exists settlement_records_clv_pair/i);
  assert.match(sql, /settlement_records_clv_requires_closing_odds[\s\S]*clv_delta is null or closing_odds is not null/i);
});

test("migration preserves RLS and grants only immutable operations to Data API roles", () => {
  const sql = migrationSql();

  for (const table of ["decision_records", "settlement_records", "record_amendments"]) {
    assert.match(sql, new RegExp(`alter table public\\.${table} enable row level security`, "i"));
    assert.match(sql, new RegExp(`grant select, insert on table public\\.${table} to authenticated`, "i"));
    assert.match(sql, new RegExp(`grant select, insert on table public\\.${table} to service_role`, "i"));
    assert.match(sql, new RegExp(`revoke update, delete, truncate on table public\\.${table}`, "i"));
  }

  assert.doesNotMatch(sql, /grant[\s\S]*to anon/i);
  assert.doesNotMatch(sql, /drop trigger/i);
  assert.doesNotMatch(sql, /drop policy/i);
});

test("migration is transactional and documents local authority", () => {
  const sql = migrationSql().trim();

  assert.match(sql, /^begin;/i);
  assert.match(sql, /comment on table public\.decision_records[\s\S]*local authoritative ledger/i);
  assert.match(sql, /comment on table public\.settlement_records[\s\S]*local authoritative ledger/i);
  assert.match(sql, /comment on table public\.record_amendments[\s\S]*local authoritative ledger/i);
  assert.match(sql, /commit;$/i);
});

test("service projection migration preserves owner checks and permits only the service role claim", () => {
  const sql = serviceProjectionMigrationSql().trim();

  assert.match(sql, /^begin;/i);
  assert.match(sql, /create or replace function private\.enforce_market_identity_and_duplicate/i);
  assert.match(sql, /security definer/i);
  assert.match(sql, /set search_path = ''/i);
  assert.match(sql, /new\.user_id <> \(select auth\.uid\(\)\)/i);
  assert.match(sql, /select auth\.jwt\(\)->>'role'/i);
  assert.match(sql, /is distinct from 'service_role'/i);
  assert.doesNotMatch(sql, /user_metadata/i);
  assert.doesNotMatch(sql, /raw_user_meta_data/i);
  assert.match(sql, /commit;$/i);
});

test("advisor cleanup removes only the redundant client event index", () => {
  const sql = indexCleanupMigrationSql().trim();

  assert.match(sql, /^begin;/i);
  assert.match(sql, /drop index if exists public\.decision_records_user_client_event_uidx/i);
  assert.doesNotMatch(sql, /drop index[\s\S]*decision_records_client_event_unique/i);
  assert.doesNotMatch(sql, /settlement_records_user_settled_idx/i);
  assert.match(sql, /commit;$/i);
});

test("shadow evidence migration creates non-financial outcome and exact-book closing projections", () => {
  const sql = shadowEvidenceMigrationSql().trim();

  assert.match(sql, /^begin;/i);
  assert.match(sql, /create table public\.prediction_outcomes/i);
  assert.match(sql, /create table public\.closing_prices/i);
  assert.match(sql, /event_status text not null check \(event_status = 'final'\)/i);
  assert.match(sql, /market_odds integer not null check \(market_odds <> 0 and abs\(market_odds\) between 100 and 100000\)/i);
  assert.match(sql, /opposite_odds integer not null check \(opposite_odds <> 0 and abs\(opposite_odds\) between 100 and 100000\)/i);
  assert.match(sql, /prediction_outcomes_owned_decision[\s\S]*decision_id, user_id[\s\S]*decision_records \(id, user_id\)/i);
  assert.match(sql, /closing_prices_owned_decision[\s\S]*decision_id, user_id[\s\S]*decision_records \(id, user_id\)/i);
  assert.match(sql, /prediction_outcomes_supersedes_owned[\s\S]*supersedes_client_event_id[\s\S]*prediction_outcomes/i);
  assert.match(sql, /closing_prices_supersedes_owned[\s\S]*supersedes_client_event_id[\s\S]*closing_prices/i);
  assert.doesNotMatch(sql, /\bstake\b/i);
  assert.doesNotMatch(sql, /\bprofit\b/i);
  assert.match(sql, /commit;$/i);
});

test("shadow evidence migration aligns source chronology with the canonical local contract", () => {
  const sql = shadowEvidenceMigrationSql();

  assert.match(sql, /prediction_outcomes_source_chronology[\s\S]*resolved_at <= source_time[\s\S]*source_time <= source_captured_at[\s\S]*source_captured_at <= created_at/i);
  assert.match(sql, /closing_prices_source_chronology[\s\S]*source_time <= market_closed_at[\s\S]*market_closed_at <= source_captured_at[\s\S]*source_captured_at <= created_at/i);
  assert.match(sql, /new\.resolved_at < event_start_at/i);
  assert.match(sql, /new\.market_closed_at > event_start_at/i);
  assert.match(sql, /lower\(new\.sportsbook\) is distinct from lower\(parent_sportsbook\)/i);
});

test("shadow evidence migration is append-only, owner-scoped, and explicit about Data API grants", () => {
  const sql = shadowEvidenceMigrationSql();

  for (const table of ["prediction_outcomes", "closing_prices"]) {
    assert.match(sql, new RegExp(`alter table public\\.${table} enable row level security`, "i"));
    assert.match(sql, new RegExp(`alter table public\\.${table} force row level security`, "i"));
    assert.match(sql, new RegExp(`grant select, insert on table public\\.${table} to authenticated, service_role`, "i"));
    assert.match(sql, new RegExp(`revoke update, delete, truncate on table public\\.${table} from authenticated, service_role`, "i"));
    assert.match(sql, new RegExp(`${table}_select_own[\\s\\S]*auth\\.uid\\(\\)[\\s\\S]*user_id`, "i"));
    assert.match(sql, new RegExp(`${table}_insert_own[\\s\\S]*auth\\.uid\\(\\)[\\s\\S]*user_id`, "i"));
    assert.match(sql, new RegExp(`${table}_reject_mutation[\\s\\S]*private\\.reject_audit_mutation`, "i"));
  }

  assert.doesNotMatch(sql, /grant[\s\S]*to anon/i);
});

test("shadow evidence lineage trigger is private, claim-aware, serialized, and branch-safe", () => {
  const sql = shadowEvidenceMigrationSql();

  assert.match(sql, /create or replace function private\.enforce_shadow_evidence_lineage/i);
  assert.match(sql, /security definer/i);
  assert.match(sql, /set search_path = ''/i);
  assert.match(sql, /new\.user_id <> \(select auth\.uid\(\)\)/i);
  assert.match(sql, /select auth\.jwt\(\)->>'role'/i);
  assert.match(sql, /is distinct from 'service_role'/i);
  assert.match(sql, /pg_advisory_xact_lock/i);
  assert.match(sql, /correction history cannot branch/i);
  assert.match(sql, /correction must supersede the latest record/i);
  assert.match(sql, /revoke all on function private\.enforce_shadow_evidence_lineage\(\) from public, anon, authenticated/i);
  assert.doesNotMatch(sql, /user_metadata/i);
  assert.doesNotMatch(sql, /raw_user_meta_data/i);
});
