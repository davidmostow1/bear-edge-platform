const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs/promises");
const path = require("node:path");

const { PGlite } = require("@electric-sql/pglite");
const {
  createClosingPriceRecord,
  createEvaluationRecord,
  createPredictionOutcomeRecord
} = require("../src/audit/record-contract.js");
const {
  mapClosingPriceRecord,
  mapDecisionRecord,
  mapPredictionOutcomeRecord
} = require("../src/sync/supabase-mapper.js");

const MIGRATION_DIR = path.resolve(__dirname, "../supabase/migrations");
const HARDENING_MIGRATION = "20260812195952_harden_authoritative_projections.sql";
const OWNER_USER_ID = "70000000-0000-4000-8000-000000000001";
const OTHER_USER_ID = "70000000-0000-4000-8000-000000000002";

const SUPABASE_PREREQUISITES_SQL = `
  create role anon nologin;
  create role authenticated nologin;
  create role service_role nologin bypassrls;

  create schema auth;
  create table auth.users (
    id uuid primary key
  );

  create function auth.uid()
  returns uuid
  language sql
  stable
  as $$
    select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid
  $$;

  create function auth.jwt()
  returns jsonb
  language sql
  stable
  as $$
    select coalesce(
      nullif(current_setting('request.jwt.claims', true), '')::jsonb,
      '{}'::jsonb
    )
  $$;

  grant usage on schema auth to authenticated, service_role;
  grant execute on function auth.uid() to authenticated, service_role;
  grant execute on function auth.jwt() to authenticated, service_role;
`;

async function applyMigrations(db) {
  const migrationFiles = (await fs.readdir(MIGRATION_DIR))
    .filter((file) => file.endsWith(".sql"))
    .sort();

  for (const migrationFile of migrationFiles) {
    const migrationSql = await fs.readFile(
      path.join(MIGRATION_DIR, migrationFile),
      "utf8"
    );

    try {
      await db.exec(migrationSql);
    } catch (error) {
      error.message = `${migrationFile}: ${error.message}`;
      throw error;
    }
  }

  return migrationFiles;
}

function evaluationRecord() {
  return createEvaluationRecord({
    origin: { channel: "test", actorType: "operator" },
    event: {
      sport: "mlb",
      league: "MLB",
      eventId: "runtime-migration-event",
      startTime: "2026-07-17T23:00:00.000Z",
      homeTeam: "Home",
      awayTeam: "Away"
    },
    market: {
      marketFamily: "moneyline",
      marketType: "moneyline",
      selection: "Home moneyline",
      marketPeriod: "full_game"
    },
    price: {
      sportsbook: "draftkings",
      marketOdds: 120,
      oppositeOdds: -135,
      priceCapturedAt: "2026-07-17T17:59:00.000Z",
      priceSourceTime: "2026-07-17T17:58:30.000Z"
    },
    sources: [{
      provider: "test_odds_provider",
      sourceType: "sportsbook_price",
      sourceLocator: "https://provider.invalid/runtime-price",
      parserVersion: "runtime_test_v1",
      capturedAt: "2026-07-17T17:59:00.000Z",
      sourceTime: "2026-07-17T17:58:30.000Z",
      digest: "a".repeat(64),
      freshness: "fresh",
      verificationStatus: "verified_provider_capture"
    }],
    model: {
      modelId: "runtime_validated_model",
      modelVersion: "1.0.0",
      probabilityMethod: "calibrated_logistic",
      modelStatus: "validated",
      calibrationReportId: "runtime-calibration-report",
      trainingCutoff: "2026-07-01T00:00:00.000Z",
      sampleSize: 500
    },
    probability: {
      rawModelProbability: 0.59,
      adjustedProbability: 0.58,
      marketImpliedProbability: 0.4545,
      marketNoVigProbability: 0.47
    },
    edge: {
      fairEdge: 0.11,
      priceEdge: 0.1255,
      expectedValueRoi: 0.276,
      kellyFraction: 0.12
    },
    stake: {
      recommendedStake: 10,
      bankroll: 1000,
      stakePolicyVersion: "runtime_test_v1"
    },
    decision: {
      verdict: "BET",
      permission: "VERIFIED_BETS_ALLOWED",
      reasons: ["Synthetic migration-runtime fixture with every authorization gate passing."],
      riskFlags: [],
      gateResults: [
        {
          gate: "event_identity",
          code: "EVENT_MATCH",
          status: "pass",
          passed: true
        },
        {
          gate: "market_identity",
          code: "MARKET_MATCH",
          status: "pass",
          passed: true
        },
        {
          gate: "selection_identity",
          code: "SELECTION_MATCH",
          status: "pass",
          passed: true
        }
      ]
    },
    audit: {
      codeVersion: "runtime-test",
      configurationDigest: "b".repeat(64),
      calculationVersion: "runtime_test_v1",
      evidenceCompleteness: "verified",
      warnings: []
    }
  }, {
    clientEventId: "70000000-0000-4000-8000-000000000010",
    createdAt: "2026-07-17T18:00:00.000Z"
  });
}

function outcomeRecord(evaluationId, overrides = {}, context = {}) {
  return createPredictionOutcomeRecord({
    evaluationId,
    supersedesId: null,
    outcome: "loss",
    resolvedAt: "2026-07-18T02:30:00.000Z",
    eventResult: { status: "final", homeScore: 2, awayScore: 1 },
    marketResult: { observedValue: 0, unit: "wins" },
    source: {
      provider: "official_result_provider",
      sourceType: "official_box_score",
      sourceLocator: "https://provider.invalid/runtime-result",
      capturedAt: "2026-07-18T02:35:00.000Z",
      sourceTime: "2026-07-18T02:30:00.000Z",
      digest: "c".repeat(64),
      verificationStatus: "verified_official_result"
    },
    notes: [],
    ...overrides
  }, {
    clientEventId: context.clientEventId
      ?? "70000000-0000-4000-8000-000000000020",
    createdAt: context.createdAt ?? "2026-07-18T02:36:00.000Z"
  });
}

function closingPriceRecord(evaluationId, overrides = {}, context = {}) {
  return createClosingPriceRecord({
    evaluationId,
    supersedesId: null,
    price: {
      sportsbook: "draftkings",
      marketOdds: -125,
      oppositeOdds: 105,
      marketClosedAt: "2026-07-17T22:59:00.000Z",
      isFinal: true
    },
    source: {
      provider: "test_odds_provider",
      sourceType: "sportsbook_closing_price",
      sourceLocator: "https://provider.invalid/runtime-close",
      capturedAt: "2026-07-17T22:59:05.000Z",
      sourceTime: "2026-07-17T22:59:00.000Z",
      digest: "d".repeat(64),
      verificationStatus: "verified_provider_capture"
    },
    notes: [],
    ...overrides
  }, {
    clientEventId: context.clientEventId
      ?? "70000000-0000-4000-8000-000000000030",
    createdAt: context.createdAt ?? "2026-07-17T22:59:10.000Z"
  });
}

function sqlParameter(value) {
  return value !== null && typeof value === "object"
    ? JSON.stringify(value)
    : value;
}

async function insertRow(db, table, row, { ignoreConflict = false } = {}) {
  assert.match(table, /^[a-z_]+$/);
  const columns = Object.keys(row);
  const placeholders = columns.map((_column, index) => `$${index + 1}`);
  const conflictClause = ignoreConflict
    ? "on conflict (user_id, client_event_id) do nothing"
    : "";

  return db.query(
    `insert into public.${table} (${columns.join(", ")})
     values (${placeholders.join(", ")})
     ${conflictClause}
     returning id`,
    Object.values(row).map(sqlParameter)
  );
}

async function asRole(db, role, claims, operation) {
  assert.ok(["authenticated", "service_role"].includes(role));
  const subject = claims.sub ?? "";

  await db.query(
    "select set_config('request.jwt.claim.sub', $1, false), set_config('request.jwt.claims', $2, false)",
    [subject, JSON.stringify(claims)]
  );
  await db.exec(`set role ${role}`);

  try {
    return await operation();
  } finally {
    await db.exec("reset role");
    await db.exec("reset request.jwt.claim.sub; reset request.jwt.claims;");
  }
}

async function expectDatabaseError(operation, { code, message }) {
  await assert.rejects(operation, (error) => {
    assert.ok(error instanceof Error);
    const databaseError = /** @type {Error & { code?: string }} */ (error);

    assert.equal(databaseError.code, code);
    assert.match(databaseError.message, message);
    return true;
  });
}

function conflictingDigest(row, digest) {
  const conflict = { ...row, content_digest: digest };

  if (row.record_snapshot) {
    conflict.record_snapshot = {
      ...row.record_snapshot,
      contentDigest: digest
    };
  }

  return conflict;
}

test("authoritative projection migrations execute and enforce runtime invariants", async (t) => {
  const db = new PGlite();
  t.after(async () => db.close());

  await db.exec(SUPABASE_PREREQUISITES_SQL);
  const migrationFiles = await applyMigrations(db);

  await t.test("applies every tracked migration through the projection hardening migration", async () => {
    assert.ok(migrationFiles.includes(HARDENING_MIGRATION));

    const { rows } = await db.query(`
      select tablename
      from pg_tables
      where schemaname = 'public'
        and tablename in (
          'decision_records',
          'settlement_records',
          'record_amendments',
          'prediction_outcomes',
          'closing_prices'
        )
      order by tablename
    `);

    assert.deepEqual(rows.map((row) => row.tablename), [
      "closing_prices",
      "decision_records",
      "prediction_outcomes",
      "record_amendments",
      "settlement_records"
    ]);
  });

  await db.query("insert into auth.users (id) values ($1), ($2)", [
    OWNER_USER_ID,
    OTHER_USER_ID
  ]);

  const evaluation = evaluationRecord();
  const decisionRow = mapDecisionRecord(evaluation, OWNER_USER_ID);
  assert.equal(decisionRow.market_identity_status, "COMPLETE");
  assert.equal(decisionRow.market_period, "full_game");
  assert.equal(decisionRow.market_fingerprint, null);
  const unauthorisedDecisionRow = {
    ...decisionRow,
    client_event_id: "70000000-0000-4000-8000-000000000011"
  };

  await t.test("reserves projection writes for service_role", async () => {
    await expectDatabaseError(
      () => asRole(
        db,
        "authenticated",
        { role: "authenticated", sub: OWNER_USER_ID },
        () => insertRow(db, "decision_records", unauthorisedDecisionRow)
      ),
      { code: "42501", message: /permission denied for table decision_records/i }
    );
  });

  let decisionId;

  await t.test("accepts service-role decision writes and identical ON CONFLICT retries", async () => {
    const inserted = await asRole(
      db,
      "service_role",
      { role: "service_role" },
      () => insertRow(db, "decision_records", decisionRow)
    );
    decisionId = inserted.rows[0].id;

    const { rows: storedRows } = await db.query(
      "select market_fingerprint from public.decision_records where id = $1",
      [decisionId]
    );
    assert.equal(
      storedRows[0].market_fingerprint,
      "mlb|mlb|runtime_migration_event|moneyline|full_game|-|home_moneyline|-"
    );

    const retried = await asRole(
      db,
      "service_role",
      { role: "service_role" },
      () => insertRow(db, "decision_records", decisionRow, { ignoreConflict: true })
    );

    assert.equal(retried.rows.length, 0);

    await expectDatabaseError(
      () => asRole(
        db,
        "service_role",
        { role: "service_role" },
        () => insertRow(
          db,
          "decision_records",
          conflictingDigest(decisionRow, "e".repeat(64)),
          { ignoreConflict: true }
        )
      ),
      { code: "23505", message: /projection client event digest conflict/i }
    );
  });

  await t.test("rejects PostgreSQL numeric NaN in authoritative money fields", async () => {
    await expectDatabaseError(
      () => asRole(
        db,
        "service_role",
        { role: "service_role" },
        () => insertRow(db, "decision_records", {
          ...decisionRow,
          client_event_id: "70000000-0000-4000-8000-000000000012",
          recommended_stake: "NaN"
        })
      ),
      { code: "23514", message: /decision_records_finite_floats_check/i }
    );

    const settlementBase = {
      user_id: OWNER_USER_ID,
      decision_id: decisionId,
      schema_version: "2.1.0",
      authority: "local",
      source: "local_engine",
      result: "win",
      stake: 1,
      taken_odds: 120,
      closing_odds: null,
      profit: 1,
      clv_delta: null,
      settled_at: "2026-07-18T02:30:00.000Z",
      created_at: "2026-07-18T02:40:00.000Z"
    };
    for (const [field, eventSuffix] of [["stake", "042"], ["profit", "043"]]) {
      await expectDatabaseError(
        () => asRole(
          db,
          "service_role",
          { role: "service_role" },
          () => insertRow(db, "settlement_records", {
            ...settlementBase,
            client_event_id: `70000000-0000-4000-8000-000000000${eventSuffix}`,
            content_digest: eventSuffix[2].repeat(64),
            [field]: "NaN"
          })
        ),
        { code: "23514", message: /settlement_records_finite_values_check/i }
      );
    }
  });

  await asRole(
    db,
    "service_role",
    { role: "service_role" },
    () => insertRow(db, "decision_records", {
      ...decisionRow,
      user_id: OTHER_USER_ID
    })
  );

  await t.test("keeps authenticated reads owner-isolated under RLS", async () => {
    const ownerRows = await asRole(
      db,
      "authenticated",
      { role: "authenticated", sub: OWNER_USER_ID },
      () => db.query("select user_id from public.decision_records order by user_id")
    );
    const otherRows = await asRole(
      db,
      "authenticated",
      { role: "authenticated", sub: OTHER_USER_ID },
      () => db.query("select user_id from public.decision_records order by user_id")
    );

    assert.deepEqual(ownerRows.rows, [{ user_id: OWNER_USER_ID }]);
    assert.deepEqual(otherRows.rows, [{ user_id: OTHER_USER_ID }]);
  });

  const initialOutcome = outcomeRecord(evaluation.id);
  const correctionOutcome = outcomeRecord(evaluation.id, {
    supersedesId: initialOutcome.id,
    outcome: "win",
    marketResult: { observedValue: 1, unit: "wins" }
  }, {
    clientEventId: "70000000-0000-4000-8000-000000000021",
    createdAt: "2026-07-18T02:40:00.000Z"
  });
  const branchOutcome = outcomeRecord(evaluation.id, {
    supersedesId: initialOutcome.id,
    outcome: "push",
    marketResult: { observedValue: 0, unit: "wins" }
  }, {
    clientEventId: "70000000-0000-4000-8000-000000000022",
    createdAt: "2026-07-18T02:45:00.000Z"
  });
  const outcomeRows = [initialOutcome, correctionOutcome]
    .map((record) => mapPredictionOutcomeRecord(record, OWNER_USER_ID, decisionId));
  const branchOutcomeRow = mapPredictionOutcomeRecord(
    branchOutcome,
    OWNER_USER_ID,
    decisionId
  );

  await t.test("permits identical initial and correction outcome retries but rejects conflicts and branches", async () => {
    await expectDatabaseError(
      () => asRole(
        db,
        "service_role",
        { role: "service_role" },
        () => insertRow(db, "prediction_outcomes", {
          ...outcomeRows[0],
          record_snapshot: {}
        })
      ),
      { code: "23514", message: /snapshot must reference its canonical decision/i }
    );

    await expectDatabaseError(
      () => asRole(
        db,
        "service_role",
        { role: "service_role" },
        () => insertRow(db, "prediction_outcomes", {
          ...outcomeRows[0],
          record_snapshot: {
            ...outcomeRows[0].record_snapshot,
            outcome: "win"
          }
        })
      ),
      { code: "23514", message: /prediction_outcomes_snapshot_check/i }
    );

    for (const row of outcomeRows) {
      const inserted = await asRole(
        db,
        "service_role",
        { role: "service_role" },
        () => insertRow(db, "prediction_outcomes", row)
      );
      const retried = await asRole(
        db,
        "service_role",
        { role: "service_role" },
        () => insertRow(db, "prediction_outcomes", row, { ignoreConflict: true })
      );

      assert.equal(inserted.rows.length, 1);
      assert.equal(retried.rows.length, 0);
    }

    await expectDatabaseError(
      () => asRole(
        db,
        "service_role",
        { role: "service_role" },
        () => insertRow(
          db,
          "prediction_outcomes",
          conflictingDigest(outcomeRows[0], "f".repeat(64)),
          { ignoreConflict: true }
        )
      ),
      { code: "23505", message: /shadow evidence client event digest conflict/i }
    );

    await expectDatabaseError(
      () => asRole(
        db,
        "service_role",
        { role: "service_role" },
        () => insertRow(db, "prediction_outcomes", branchOutcomeRow)
      ),
      { code: "23505", message: /correction history cannot branch/i }
    );
  });

  const initialClosing = closingPriceRecord(evaluation.id);
  const correctionClosing = closingPriceRecord(evaluation.id, {
    supersedesId: initialClosing.id,
    price: {
      sportsbook: "draftkings",
      marketOdds: -130,
      oppositeOdds: 110,
      marketClosedAt: "2026-07-17T22:59:00.000Z",
      isFinal: true
    }
  }, {
    clientEventId: "70000000-0000-4000-8000-000000000031",
    createdAt: "2026-07-17T22:59:20.000Z"
  });
  const branchClosing = closingPriceRecord(evaluation.id, {
    supersedesId: initialClosing.id,
    price: {
      sportsbook: "draftkings",
      marketOdds: -135,
      oppositeOdds: 115,
      marketClosedAt: "2026-07-17T22:59:00.000Z",
      isFinal: true
    }
  }, {
    clientEventId: "70000000-0000-4000-8000-000000000032",
    createdAt: "2026-07-17T22:59:30.000Z"
  });
  const closingRows = [initialClosing, correctionClosing]
    .map((record) => mapClosingPriceRecord(record, OWNER_USER_ID, decisionId));
  const branchClosingRow = mapClosingPriceRecord(
    branchClosing,
    OWNER_USER_ID,
    decisionId
  );

  await t.test("permits identical initial and correction closing retries but rejects conflicts and branches", async () => {
    await expectDatabaseError(
      () => asRole(
        db,
        "service_role",
        { role: "service_role" },
        () => insertRow(db, "closing_prices", {
          ...closingRows[0],
          record_snapshot: {}
        })
      ),
      { code: "23514", message: /snapshot must reference its canonical decision/i }
    );

    await expectDatabaseError(
      () => asRole(
        db,
        "service_role",
        { role: "service_role" },
        () => insertRow(db, "closing_prices", {
          ...closingRows[0],
          record_snapshot: {
            ...closingRows[0].record_snapshot,
            price: {
              ...closingRows[0].record_snapshot.price,
              marketOdds: -140
            }
          }
        })
      ),
      { code: "23514", message: /closing_prices_snapshot_check/i }
    );

    for (const row of closingRows) {
      const inserted = await asRole(
        db,
        "service_role",
        { role: "service_role" },
        () => insertRow(db, "closing_prices", row)
      );
      const retried = await asRole(
        db,
        "service_role",
        { role: "service_role" },
        () => insertRow(db, "closing_prices", row, { ignoreConflict: true })
      );

      assert.equal(inserted.rows.length, 1);
      assert.equal(retried.rows.length, 0);
    }

    await expectDatabaseError(
      () => asRole(
        db,
        "service_role",
        { role: "service_role" },
        () => insertRow(
          db,
          "closing_prices",
          conflictingDigest(closingRows[0], "0".repeat(64)),
          { ignoreConflict: true }
        )
      ),
      { code: "23505", message: /shadow evidence client event digest conflict/i }
    );

    await expectDatabaseError(
      () => asRole(
        db,
        "service_role",
        { role: "service_role" },
        () => insertRow(db, "closing_prices", branchClosingRow)
      ),
      { code: "23505", message: /correction history cannot branch/i }
    );
  });

  let settlementId;

  await t.test("allows the service role to populate the remaining projection graph", async () => {
    const settlement = await asRole(
      db,
      "service_role",
      { role: "service_role" },
      () => insertRow(db, "settlement_records", {
        user_id: OWNER_USER_ID,
        decision_id: decisionId,
        client_event_id: "70000000-0000-4000-8000-000000000040",
        schema_version: "2.1.0",
        content_digest: "1".repeat(64),
        authority: "local",
        source: "local_engine",
        result: "pending",
        stake: null,
        taken_odds: null,
        closing_odds: null,
        profit: null,
        clv_delta: null,
        settled_at: "2026-07-18T02:30:00.000Z",
        created_at: "2026-07-18T02:40:00.000Z"
      })
    );
    settlementId = settlement.rows[0].id;

    const amendment = await asRole(
      db,
      "service_role",
      { role: "service_role" },
      () => insertRow(db, "record_amendments", {
        user_id: OWNER_USER_ID,
        decision_id: decisionId,
        settlement_id: settlementId,
        client_event_id: "70000000-0000-4000-8000-000000000041",
        schema_version: "2.1.0",
        content_digest: "2".repeat(64),
        authority: "local",
        source: "local_engine",
        reason: "Synthetic runtime correction note.",
        patch: { notes: ["runtime fixture"] },
        created_at: "2026-07-18T02:41:00.000Z"
      })
    );

    assert.equal(settlement.rows.length, 1);
    assert.equal(amendment.rows.length, 1);
  });

  await t.test("rejects direct child deletion while the owning auth user exists", async () => {
    await expectDatabaseError(
      () => db.query(
        "delete from public.prediction_outcomes where user_id = $1 and client_event_id = $2",
        [OWNER_USER_ID, initialOutcome.clientEventId]
      ),
      { code: "55000", message: /audit records are append-only/i }
    );

    const { rows } = await db.query(
      "select count(*)::integer as count from public.prediction_outcomes where user_id = $1",
      [OWNER_USER_ID]
    );
    assert.equal(rows[0].count, 2);
  });

  await t.test("cascades auth-user deletion through the complete projection graph", async () => {
    await db.query("delete from auth.users where id = $1", [OWNER_USER_ID]);

    for (const table of [
      "decision_records",
      "settlement_records",
      "record_amendments",
      "prediction_outcomes",
      "closing_prices"
    ]) {
      const { rows } = await db.query(
        `select count(*)::integer as count from public.${table} where user_id = $1`,
        [OWNER_USER_ID]
      );
      assert.equal(rows[0].count, 0, `${table} retained an account-owned row`);
    }

    const { rows: authRows } = await db.query(
      "select count(*)::integer as count from auth.users where id = $1",
      [OWNER_USER_ID]
    );
    const { rows: profileRows } = await db.query(
      "select count(*)::integer as count from public.profiles where id = $1",
      [OWNER_USER_ID]
    );
    const { rows: stateRows } = await db.query(
      "select count(*)::integer as count from public.user_app_state where user_id = $1",
      [OWNER_USER_ID]
    );

    assert.equal(authRows[0].count, 0);
    assert.equal(profileRows[0].count, 0);
    assert.equal(stateRows[0].count, 0);
  });
});
