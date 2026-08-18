const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs/promises");
const path = require("node:path");
const { PGlite } = require("@electric-sql/pglite");

const MIGRATION = path.resolve(
  __dirname,
  "../supabase/migrations/20260818004500_lol_model_promotion_pipeline.sql"
);

async function applyMigration() {
  const db = new PGlite();
  await db.exec(await fs.readFile(MIGRATION, "utf8"));
  return db;
}

test("LoL promotion migration creates immutable evidence pipeline", async () => {
  const db = await applyMigration();
  const expectedTables = [
    "model_calibrator_artifacts",
    "model_event_outcomes",
    "model_market_snapshots",
    "model_prediction_context",
    "model_prediction_status_events",
    "model_probability_intervals",
    "model_promotion_evaluations",
    "model_promotion_policies"
  ];
  const result = await db.query(`
    select table_name
    from information_schema.tables
    where table_schema = 'public' and table_name = any($1)
    order by table_name
  `, [expectedTables]);
  assert.deepEqual(result.rows.map((row) => row.table_name), expectedTables);

  const policy = await db.query(`
    select policy_version, policy_digest, policy
    from public.model_promotion_policies
  `);
  assert.equal(policy.rows.length, 1);
  assert.equal(policy.rows[0].policy_version, "1.2.0");
  assert.equal(
    policy.rows[0].policy_digest,
    "ee24c6dc23dfa5cf9384d0bb595193b41903024e4e5959e54694800a2cb4226a"
  );
  assert.equal(policy.rows[0].policy.minimumSettledPredictions, 500);
  assert.equal(policy.rows[0].policy.minimumDistinctEvents, 100);
  assert.equal(policy.rows[0].policy.minimumBootstrapResamples, 2000);

  await db.close();
});

test("database LoL probability matches registered model fixture", async () => {
  const db = await applyMigration();
  const result = await db.query(`
    select public.sbkp_lol_gpr_bt_probability(1527, 1384, 3) as probability
  `);
  assert.ok(Math.abs(result.rows[0].probability - 0.777555408598894) < 1e-12);
  await db.close();
});

test("only the latest explicitly valid prospective prediction scores", async () => {
  const db = await applyMigration();
  await db.exec(`
    insert into public.model_registry (
      model_id, model_name, version, sport_code, game_code, market_family,
      model_status, probability_method, artifact_sha256, code_sha256,
      feature_schema_sha256, manifest, retrospective_validation,
      prospective_calibration_status, uncertainty_status, bet_authority,
      immutable, content_digest
    ) values (
      'test-lol-model', 'Test LoL Model', '1.0.0', 'LOL', 'LOL', 'FULL_MATCH_WINNER',
      'SHADOW', 'TEST', repeat('a',64), repeat('b',64), repeat('c',64), '{}'::jsonb,
      null, 'PENDING', 'PENDING', false, true, repeat('d',64)
    );

    insert into public.model_predictions (
      id, model_id, canonical_event_id, market_family, team_a, team_b, best_of,
      raw_probability_a, generated_at, evidence_cutoff_at, is_prospective,
      input_snapshot, output_snapshot, content_digest, outcome_status
    ) values
      ('10000000-0000-4000-8000-000000000001','test-lol-model','event-1','FULL_MATCH_WINNER','A','B',3,0.60,
       '2026-08-17T10:00:00Z','2026-08-17T10:00:00Z',true,'{}','{}',repeat('1',64),'PENDING'),
      ('10000000-0000-4000-8000-000000000002','test-lol-model','event-1','FULL_MATCH_WINNER','A','B',3,0.70,
       '2026-08-17T11:00:00Z','2026-08-17T11:00:00Z',true,'{}','{}',repeat('2',64),'PENDING');

    insert into public.model_prediction_context (
      prediction_id, scheduled_start_at, event_identity_status, roster_status,
      patch_status, source_snapshot, source_digest, content_digest
    ) values
      ('10000000-0000-4000-8000-000000000001','2026-08-17T15:00:00Z','VERIFIED','UNVERIFIED','UNVERIFIED','{}',repeat('3',64),repeat('4',64)),
      ('10000000-0000-4000-8000-000000000002','2026-08-17T15:00:00Z','VERIFIED','UNVERIFIED','UNVERIFIED','{}',repeat('5',64),repeat('6',64));

    insert into public.model_prediction_status_events (
      prediction_id, status, replacement_prediction_id, reason, effective_at, content_digest
    ) values
      ('10000000-0000-4000-8000-000000000001','VALID',null,'initial','2026-08-17T10:00:01Z',repeat('7',64)),
      ('10000000-0000-4000-8000-000000000001','SUPERSEDED','10000000-0000-4000-8000-000000000002','new evidence','2026-08-17T11:00:01Z',repeat('8',64)),
      ('10000000-0000-4000-8000-000000000002','VALID',null,'corrected','2026-08-17T11:00:02Z',repeat('9',64));
  `);

  const active = await db.query(`
    select id, raw_probability_a
    from public.v_active_model_predictions
    where canonical_event_id = 'event-1'
  `);
  assert.equal(active.rows.length, 1);
  assert.equal(active.rows[0].id, "10000000-0000-4000-8000-000000000002");
  assert.equal(active.rows[0].raw_probability_a, 0.70);

  await assert.rejects(
    db.exec(`update public.model_prediction_status_events set reason = 'tamper'`),
    /append-only/i
  );
  await db.close();
});

test("promotion function fails closed without canonical prospective evidence", async () => {
  const db = await applyMigration();
  await db.exec(`
    insert into public.model_registry (
      model_id, model_name, version, sport_code, game_code, market_family,
      model_status, probability_method, artifact_sha256, code_sha256,
      feature_schema_sha256, manifest, retrospective_validation,
      prospective_calibration_status, uncertainty_status, bet_authority,
      immutable, content_digest
    ) values (
      'test-shadow', 'Test Shadow', '1.0.0', 'LOL', 'LOL', 'FULL_MATCH_WINNER',
      'SHADOW', 'TEST', repeat('a',64), repeat('b',64), repeat('c',64), '{}'::jsonb,
      null, 'PENDING', 'PENDING', false, true, repeat('d',64)
    );
  `);
  const result = await db.query(`select public.sbkp_promote_model_if_eligible('test-shadow') as promoted`);
  assert.equal(result.rows[0].promoted, false);
  const registry = await db.query(`select model_status, bet_authority from public.model_registry where model_id='test-shadow'`);
  assert.equal(registry.rows[0].model_status, "SHADOW");
  assert.equal(registry.rows[0].bet_authority, false);
  await db.close();
});
