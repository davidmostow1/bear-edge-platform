const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const migrationPath = path.resolve(
  "supabase/migrations/20260720150000_mlb_simulation_projection.sql"
);

function readMigration() {
  return fs.readFileSync(migrationPath, "utf8");
}

test("MLB simulation migration creates market snapshots and simulation runs", () => {
  const sql = readMigration();

  assert.match(sql, /create table if not exists public\.market_snapshots/i);
  assert.match(sql, /create table if not exists public\.simulation_runs/i);
  assert.match(sql, /canonical_event_id text not null/i);
  assert.match(sql, /market_fingerprint text not null/i);
  assert.match(sql, /captured_at timestamptz not null/i);
  assert.match(sql, /model_version text not null/i);
  assert.match(sql, /simulation_count integer not null/i);
  assert.match(sql, /input_snapshot jsonb not null/i);
  assert.match(sql, /output_snapshot jsonb not null/i);
});

test("MLB simulation projection is user-owned, RLS protected, and append-only", () => {
  const sql = readMigration();

  assert.match(sql, /enable row level security/i);
  assert.match(sql, /create policy "market_snapshots_select_own"/i);
  assert.match(sql, /create policy "market_snapshots_insert_own"/i);
  assert.match(sql, /create policy "simulation_runs_select_own"/i);
  assert.match(sql, /create policy "simulation_runs_insert_own"/i);
  assert.doesNotMatch(sql, /create policy .*update/i);
  assert.doesNotMatch(sql, /create policy .*delete/i);
  assert.match(sql, /auth\.uid\(\) = user_id/i);
});

test("MLB simulation projection enforces identity and probability constraints", () => {
  const sql = readMigration();

  assert.match(sql, /unique \(user_id, market_fingerprint, captured_at\)/i);
  assert.match(sql, /model_probability > 0 and model_probability < 1/i);
  assert.match(sql, /no_vig_probability is null or \(no_vig_probability > 0 and no_vig_probability < 1\)/i);
  assert.match(sql, /simulation_count > 0/i);
  assert.match(sql, /authorization_status = 'PRICE_CHECK_ONLY'/i);
});
