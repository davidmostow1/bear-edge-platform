const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs/promises");
const os = require("node:os");
const path = require("node:path");

const {
  createClosingPriceRecord,
  createEvaluationRecord,
  createPredictionOutcomeRecord
} = require("../src/audit/record-contract.js");
const { appendAuthoritativeRecord } = require("../src/audit/authoritative-ledger.js");
const { readOutboxState } = require("../src/sync/outbox.js");
const { createSupabaseClient } = require("../src/sync/supabase-client.js");
const {
  mapClosingPriceRecord,
  mapPredictionOutcomeRecord
} = require("../src/sync/supabase-mapper.js");
const { createSyncWorker } = require("../src/sync/sync-worker.js");

const OWNER_USER_ID = "90000000-0000-4000-8000-000000000001";
const REMOTE_DECISION_ID = "90000000-0000-4000-8000-000000000002";
const RUN_AT = "2026-07-18T04:00:00.000Z";

function evaluationRecord() {
  return createEvaluationRecord({
    origin: { channel: "local_engine" },
    event: {
      sport: "mlb",
      league: "MLB",
      eventId: "401816143",
      startTime: "2026-07-17T23:00:00.000Z",
      homeTeam: "Home",
      awayTeam: "Away"
    },
    market: {
      marketFamily: "pitcher_strikeouts",
      marketType: "player_prop",
      participantId: "4414215",
      participantName: "Test Pitcher",
      selection: "Test Pitcher over 5.5 strikeouts",
      side: "over",
      line: 5.5
    },
    price: {
      sportsbook: "draftkings",
      marketOdds: 103,
      oppositeOdds: -131,
      priceCapturedAt: "2026-07-17T13:59:00.000Z",
      priceSourceTime: "2026-07-17T13:58:30.000Z"
    },
    sources: [],
    model: { modelStatus: "research_only" },
    probability: {},
    edge: {},
    stake: {},
    decision: {
      verdict: "WAIT",
      permission: "PRICE_CHECK_ONLY",
      reasons: ["Research only."],
      riskFlags: [],
      gateResults: []
    },
    audit: { warnings: [] }
  }, {
    clientEventId: "90000000-0000-4000-8000-000000000010",
    createdAt: "2026-07-17T14:00:00.000Z"
  });
}

function outcomeRecord(evaluationId, overrides = {}, context = {}) {
  return createPredictionOutcomeRecord({
    evaluationId,
    supersedesId: null,
    outcome: "loss",
    resolvedAt: "2026-07-18T02:30:00.000Z",
    eventResult: { status: "final", homeScore: 2, awayScore: 1 },
    marketResult: { observedValue: 4, unit: "strikeouts" },
    source: {
      provider: "mlb_official",
      sourceType: "official_box_score",
      sourceLocator: "https://www.mlb.com/gameday/401816143/final/box",
      capturedAt: "2026-07-18T02:35:00.000Z",
      sourceTime: "2026-07-18T02:30:00.000Z",
      digest: "a".repeat(64),
      verificationStatus: "verified_official_result"
    },
    notes: [],
    ...overrides
  }, {
    clientEventId: context.clientEventId ?? "90000000-0000-4000-8000-000000000011",
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
      marketClosedAt: "2026-07-17T23:00:00.000Z",
      isFinal: true
    },
    source: {
      provider: "licensed_odds_feed",
      sourceType: "sportsbook_closing_price",
      sourceLocator: "https://provider.example/closing",
      capturedAt: "2026-07-17T23:00:05.000Z",
      sourceTime: "2026-07-17T23:00:00.000Z",
      digest: "b".repeat(64),
      verificationStatus: "verified_provider_capture"
    },
    notes: [],
    ...overrides
  }, {
    clientEventId: context.clientEventId ?? "90000000-0000-4000-8000-000000000012",
    createdAt: context.createdAt ?? "2026-07-17T23:01:00.000Z"
  });
}

test("Supabase mappers preserve complete canonical shadow evidence without financial fields", () => {
  const evaluation = evaluationRecord();
  const outcome = outcomeRecord(evaluation.id);
  const closingPrice = closingPriceRecord(evaluation.id);
  const outcomeRow = mapPredictionOutcomeRecord(outcome, OWNER_USER_ID, REMOTE_DECISION_ID);
  const closeRow = mapClosingPriceRecord(closingPrice, OWNER_USER_ID, REMOTE_DECISION_ID);

  assert.equal(outcomeRow.user_id, OWNER_USER_ID);
  assert.equal(outcomeRow.decision_id, REMOTE_DECISION_ID);
  assert.equal(outcomeRow.client_event_id, outcome.clientEventId);
  assert.equal(outcomeRow.supersedes_client_event_id, null);
  assert.equal(outcomeRow.outcome, "loss");
  assert.equal(outcomeRow.observed_value, 4);
  assert.equal(outcomeRow.verification_status, "verified_official_result");
  assert.deepEqual(outcomeRow.record_snapshot, outcome);
  assert.equal("stake" in outcomeRow, false);
  assert.equal("profit" in outcomeRow, false);

  assert.equal(closeRow.user_id, OWNER_USER_ID);
  assert.equal(closeRow.decision_id, REMOTE_DECISION_ID);
  assert.equal(closeRow.client_event_id, closingPrice.clientEventId);
  assert.equal(closeRow.supersedes_client_event_id, null);
  assert.equal(closeRow.sportsbook, "draftkings");
  assert.equal(closeRow.market_odds, -125);
  assert.equal(closeRow.opposite_odds, 105);
  assert.equal(closeRow.is_final, true);
  assert.deepEqual(closeRow.record_snapshot, closingPrice);
});

test("Supabase mappers encode correction lineage with the superseded client event id", () => {
  const evaluation = evaluationRecord();
  const first = outcomeRecord(evaluation.id);
  const correction = outcomeRecord(evaluation.id, {
    supersedesId: first.id,
    outcome: "win",
    marketResult: { observedValue: 7, unit: "strikeouts" }
  }, {
    clientEventId: "90000000-0000-4000-8000-000000000013",
    createdAt: "2026-07-18T02:40:00.000Z"
  });

  assert.equal(
    mapPredictionOutcomeRecord(correction, OWNER_USER_ID, REMOTE_DECISION_ID).supersedes_client_event_id,
    first.clientEventId
  );
});

test("Supabase client accepts only the two explicit shadow evidence projection tables", async () => {
  const calls = [];
  const client = createSupabaseClient({
    supabaseUrl: "https://project-ref.supabase.co",
    serviceRoleKey: "service-role-secret",
    ownerUserId: OWNER_USER_ID,
    fetchImpl: async (url) => {
      calls.push(url);
      return {
        ok: true,
        status: 201,
        json: async () => [{ id: REMOTE_DECISION_ID, content_digest: "a".repeat(64) }],
        text: async () => ""
      };
    }
  });
  const row = {
    user_id: OWNER_USER_ID,
    client_event_id: "90000000-0000-4000-8000-000000000014",
    content_digest: "a".repeat(64)
  };

  await client.insertRecord("prediction_outcomes", row);
  await client.insertRecord("closing_prices", row);

  assert.match(calls[0], /\/rest\/v1\/prediction_outcomes/);
  assert.match(calls[1], /\/rest\/v1\/closing_prices/);
  await assert.rejects(client.insertRecord("shadow_settlements", row), /unsupported/i);
});

test("sync worker projects evaluation, closing price, and outcome in dependency order", async (t) => {
  const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), "bear-edge-shadow-sync-"));
  const ledgerPath = path.join(tempDir, "decision_log.jsonl");
  const outboxPath = path.join(tempDir, "sync_outbox.jsonl");
  const evaluation = evaluationRecord();
  const closingPrice = closingPriceRecord(evaluation.id);
  const outcome = outcomeRecord(evaluation.id);

  t.after(() => fs.rm(tempDir, { recursive: true, force: true }));
  for (const record of [evaluation, closingPrice, outcome]) {
    await appendAuthoritativeRecord(record, { ledgerPath, outboxPath });
  }

  const localByClientEventId = new Map([
    [evaluation.clientEventId, evaluation],
    [closingPrice.clientEventId, closingPrice],
    [outcome.clientEventId, outcome]
  ]);
  const remoteIds = new Map();
  const tableOrder = [];
  const client = {
    findByClientEventId: async (_table, _ownerUserId, clientEventId) => {
      const remoteId = remoteIds.get(clientEventId);
      const record = localByClientEventId.get(clientEventId);
      return remoteId
        ? { status: "found", remoteId, contentDigest: record.contentDigest }
        : { status: "not_found" };
    },
    insertRecord: async (table, row) => {
      tableOrder.push(table);
      const remoteId = `90000000-0000-4000-8000-${String(tableOrder.length).padStart(12, "0")}`;
      remoteIds.set(row.client_event_id, remoteId);
      return { status: "synchronized", remoteId, contentDigest: row.content_digest };
    }
  };
  const worker = createSyncWorker({
    client,
    ownerUserId: OWNER_USER_ID,
    configured: true,
    enabled: true,
    ledgerPath,
    outboxPath,
    clock: () => new Date(RUN_AT)
  });

  const result = await worker.runNow();
  const outbox = await readOutboxState({ outboxPath });

  assert.equal(result.synchronized, 3);
  assert.deepEqual(tableOrder, [
    "decision_records",
    "closing_prices",
    "prediction_outcomes"
  ]);
  assert.equal(outbox.summary.synchronized, 3);
});

test("sync worker resolves the superseded remote evidence before projecting a correction", async (t) => {
  const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), "bear-edge-shadow-correction-sync-"));
  const ledgerPath = path.join(tempDir, "decision_log.jsonl");
  const outboxPath = path.join(tempDir, "sync_outbox.jsonl");
  const evaluation = evaluationRecord();
  const first = outcomeRecord(evaluation.id);
  const correction = outcomeRecord(evaluation.id, {
    supersedesId: first.id,
    outcome: "win",
    marketResult: { observedValue: 7, unit: "strikeouts" }
  }, {
    clientEventId: "90000000-0000-4000-8000-000000000015",
    createdAt: "2026-07-18T02:40:00.000Z"
  });

  t.after(() => fs.rm(tempDir, { recursive: true, force: true }));
  for (const record of [evaluation, first, correction]) {
    await appendAuthoritativeRecord(record, { ledgerPath, outboxPath });
  }

  const localByClientEventId = new Map([
    [evaluation.clientEventId, evaluation],
    [first.clientEventId, first],
    [correction.clientEventId, correction]
  ]);
  const remoteIds = new Map();
  const findCalls = [];
  const tableOrder = [];
  const client = {
    findByClientEventId: async (table, _ownerUserId, clientEventId) => {
      findCalls.push({ table, clientEventId });
      const remoteId = remoteIds.get(clientEventId);
      const record = localByClientEventId.get(clientEventId);
      return remoteId
        ? { status: "found", remoteId, contentDigest: record.contentDigest }
        : { status: "not_found" };
    },
    insertRecord: async (table, row) => {
      tableOrder.push(table);
      const remoteId = `90000000-0000-4000-8000-${String(tableOrder.length).padStart(12, "0")}`;
      remoteIds.set(row.client_event_id, remoteId);
      return { status: "synchronized", remoteId, contentDigest: row.content_digest };
    }
  };
  const worker = createSyncWorker({
    client,
    ownerUserId: OWNER_USER_ID,
    configured: true,
    enabled: true,
    ledgerPath,
    outboxPath,
    clock: () => new Date(RUN_AT)
  });

  const result = await worker.runNow();

  assert.equal(result.synchronized, 3);
  assert.deepEqual(tableOrder, [
    "decision_records",
    "prediction_outcomes",
    "prediction_outcomes"
  ]);
  assert.ok(findCalls.some((call) => (
    call.table === "prediction_outcomes" && call.clientEventId === first.clientEventId
  )));
});

test("shadow evidence migration is append-only, owner-isolated, and correction-aware", async () => {
  const migrationPath = path.resolve(
    __dirname,
    "../supabase/migrations/20260718010000_shadow_evidence_v21.sql"
  );
  const sql = await fs.readFile(migrationPath, "utf8");

  assert.match(sql.trim(), /^begin;/i);
  assert.match(sql, /decision_records_schema_version_check[\s\S]*'2\.0\.0'[\s\S]*'2\.1\.0'/i);
  assert.match(sql, /settlement_records_schema_version_check[\s\S]*'2\.0\.0'[\s\S]*'2\.1\.0'/i);
  assert.match(sql, /record_amendments_schema_version_check[\s\S]*'2\.0\.0'[\s\S]*'2\.1\.0'/i);

  for (const table of ["prediction_outcomes", "closing_prices"]) {
    assert.match(sql, new RegExp(`create table public\\.${table}`, "i"));
    assert.match(sql, new RegExp(`${table}[\\s\\S]*record_snapshot jsonb not null`, "i"));
    assert.match(sql, new RegExp(`${table}[\\s\\S]*unique \\(user_id, client_event_id\\)`, "i"));
    assert.match(sql, new RegExp(`alter table public\\.${table} enable row level security`, "i"));
    assert.match(sql, new RegExp(`alter table public\\.${table} force row level security`, "i"));
    assert.match(sql, new RegExp(`${table}_select_own[\\s\\S]*auth\\.uid\\(\\)[\\s\\S]*user_id`, "i"));
    assert.match(sql, new RegExp(`${table}_insert_own[\\s\\S]*auth\\.uid\\(\\)[\\s\\S]*user_id`, "i"));
    assert.match(sql, new RegExp(`${table}_reject_mutation[\\s\\S]*private\\.reject_audit_mutation`, "i"));
    assert.match(sql, new RegExp(`revoke update, delete, truncate on table public\\.${table}`, "i"));
  }

  assert.match(sql, /prediction_outcomes_owned_decision[\s\S]*decision_records/i);
  assert.match(sql, /closing_prices_owned_decision[\s\S]*decision_records/i);
  assert.match(sql, /prediction_outcomes_supersedes_owned[\s\S]*supersedes_client_event_id[\s\S]*prediction_outcomes/i);
  assert.match(sql, /closing_prices_supersedes_owned[\s\S]*supersedes_client_event_id[\s\S]*closing_prices/i);
  assert.match(sql, /enforce_shadow_evidence_lineage[\s\S]*service_role/i);
  assert.doesNotMatch(sql, /prediction_outcomes[\s\S]*\bstake\b/i);
  assert.doesNotMatch(sql, /prediction_outcomes[\s\S]*\bprofit\b/i);
  assert.match(sql.trim(), /commit;$/i);
});
