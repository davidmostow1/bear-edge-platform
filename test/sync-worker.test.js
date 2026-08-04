const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs/promises");
const os = require("node:os");
const path = require("node:path");

const {
  calculateRetryDelay,
  createSyncWorker
} = require("../src/sync/sync-worker.js");
const {
  appendSyncEvent,
  readOutboxState
} = require("../src/sync/outbox.js");
const { appendAuthoritativeRecord } = require("../src/audit/authoritative-ledger.js");
const {
  createAmendmentRecord,
  createEvaluationRecord,
  createSettlementAuditRecord
} = require("../src/audit/record-contract.js");

const OWNER_USER_ID = "90000000-0000-4000-8000-000000000001";
const CLIENT_EVENT_ID = "90000000-0000-4000-8000-000000000002";
const CREATED_AT = "2026-07-17T14:00:00.000Z";
const RUN_AT = "2026-07-17T14:01:00.000Z";

function evaluationRecord(clientEventId = CLIENT_EVENT_ID) {
  return createEvaluationRecord({
    origin: { channel: "local_engine" },
    event: {
      sport: "baseball",
      league: "mlb",
      eventId: "401816143",
      startTime: "2026-07-17T23:00:00.000Z",
      homeTeam: "Philadelphia Phillies",
      awayTeam: "New York Mets"
    },
    market: {
      marketFamily: "PLAYER_PROP",
      marketType: "PITCHER_STRIKEOUTS",
      participantId: "4414215",
      participantName: "Christian Scott",
      selection: "Christian Scott over 5.5 strikeouts",
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
    clientEventId,
    createdAt: CREATED_AT
  });
}

async function createFixture(t) {
  const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), "bear-edge-sync-worker-"));
  const ledgerPath = path.join(tempDir, "decision_log.jsonl");
  const outboxPath = path.join(tempDir, "sync_outbox.jsonl");
  const record = evaluationRecord();

  t.after(() => fs.rm(tempDir, { recursive: true, force: true }));
  await appendAuthoritativeRecord(record, { ledgerPath, outboxPath });

  return { ledgerPath, outboxPath, record };
}

function workerOptions(fixture, client, overrides = {}) {
  return {
    client,
    ownerUserId: OWNER_USER_ID,
    configured: true,
    enabled: true,
    ledgerPath: fixture.ledgerPath,
    outboxPath: fixture.outboxPath,
    clock: () => new Date(RUN_AT),
    ...overrides
  };
}

test("retry delay uses capped exponential backoff plus deterministic jitter", () => {
  const first = calculateRetryDelay(1, CLIENT_EVENT_ID);
  const repeated = calculateRetryDelay(1, CLIENT_EVENT_ID);
  const capped = calculateRetryDelay(30, CLIENT_EVENT_ID);

  assert.equal(first, repeated);
  assert.equal(first >= 2_000 && first < 3_000, true);
  assert.equal(capped >= 300_000 && capped < 301_000, true);
});

test("a retryable remote failure is retained with its exact next attempt", async (t) => {
  const fixture = await createFixture(t);
  const client = {
    insertRecord: async () => ({
      status: "retryable_failure",
      errorCode: "REMOTE_UNAVAILABLE",
      safeError: "Supabase is temporarily unavailable"
    })
  };
  const worker = createSyncWorker(workerOptions(fixture, client));

  const result = await worker.runNow();
  const state = await readOutboxState({ outboxPath: fixture.outboxPath });
  const expectedDelay = calculateRetryDelay(1, CLIENT_EVENT_ID);

  assert.equal(result.processed, 1);
  assert.equal(result.retryableFailures, 1);
  assert.equal(state.summary.retryableFailures, 1);
  assert.equal(state.items[0].attempt, 1);
  assert.equal(
    state.items[0].nextAttemptAt,
    new Date(Date.parse(RUN_AT) + expectedDelay).toISOString()
  );
  assert.equal(state.items[0].errorCode, "REMOTE_UNAVAILABLE");
});

test("an unexpected remote client exception is retryable and secret-safe", async (t) => {
  const fixture = await createFixture(t);
  const secret = "worker-service-role-secret";
  const previous = process.env.SUPABASE_SERVICE_ROLE_KEY;
  process.env.SUPABASE_SERVICE_ROLE_KEY = secret;

  try {
    const worker = createSyncWorker(workerOptions(fixture, {
      insertRecord: async () => {
        throw new Error(`socket closed ${secret}`);
      }
    }));

    const result = await worker.runNow();
    const state = await readOutboxState({ outboxPath: fixture.outboxPath });

    assert.equal(result.retryableFailures, 1);
    assert.equal(state.items[0].state, "retryable_failure");
    assert.equal(state.items[0].errorCode, "REMOTE_CLIENT_ERROR");
    assert.equal(JSON.stringify(state.items[0]).includes(secret), false);
  } finally {
    if (previous === undefined) {
      delete process.env.SUPABASE_SERVICE_ROLE_KEY;
    } else {
      process.env.SUPABASE_SERVICE_ROLE_KEY = previous;
    }
  }
});

test("start recovers pending work and stop clears the polling timer", async (t) => {
  const fixture = await createFixture(t);
  const timer = { id: "timer" };
  let cleared = null;
  const client = {
    insertRecord: async () => ({
      status: "synchronized",
      remoteId: "90000000-0000-4000-8000-000000000003",
      contentDigest: fixture.record.contentDigest
    })
  };
  const worker = createSyncWorker(workerOptions(fixture, client, {
    setIntervalImpl: () => timer,
    clearIntervalImpl: (value) => {
      cleared = value;
    }
  }));

  worker.start();
  await worker.runNow();
  await worker.stop();

  const state = await readOutboxState({ outboxPath: fixture.outboxPath });
  const status = await worker.getStatus();

  assert.equal(state.summary.synchronized, 1);
  assert.equal(cleared, timer);
  assert.equal(status.started, false);
  assert.equal(status.running, false);
  assert.equal(status.lastSuccessAt, RUN_AT);
});

test("terminal failures are never retried", async (t) => {
  const fixture = await createFixture(t);
  const initial = (await readOutboxState({ outboxPath: fixture.outboxPath })).items[0];
  await appendSyncEvent({
    schemaVersion: "1.0.0",
    eventId: "90000000-0000-4000-8000-000000000004",
    clientEventId: initial.clientEventId,
    recordId: initial.recordId,
    recordType: initial.recordType,
    contentDigest: initial.contentDigest,
    state: "terminal_failure",
    attempt: 1,
    occurredAt: RUN_AT,
    nextAttemptAt: null,
    errorCode: "REMOTE_DIGEST_CONFLICT",
    safeError: "Remote digest conflict"
  }, { outboxPath: fixture.outboxPath });

  let calls = 0;
  const worker = createSyncWorker(workerOptions(fixture, {
    insertRecord: async () => {
      calls += 1;
      return { status: "synchronized", remoteId: "unexpected" };
    }
  }));

  const result = await worker.runNow();

  assert.equal(result.processed, 0);
  assert.equal(calls, 0);
});

test("concurrent run requests share one active worker run", async (t) => {
  const fixture = await createFixture(t);
  let release = () => {};
  let calls = 0;
  const blocker = new Promise((resolve) => {
    release = () => resolve(undefined);
  });
  const worker = createSyncWorker(workerOptions(fixture, {
    insertRecord: async () => {
      calls += 1;
      await blocker;
      return {
        status: "synchronized",
        remoteId: "90000000-0000-4000-8000-000000000005",
        contentDigest: fixture.record.contentDigest
      };
    }
  }));

  const first = worker.runNow();
  const second = worker.runNow();

  assert.equal(first, second);
  release();
  const [firstResult, secondResult] = await Promise.all([first, second]);

  assert.deepEqual(firstResult, secondResult);
  assert.equal(calls, 1);
});

test("incomplete configuration keeps the worker disabled without touching records", async (t) => {
  const fixture = await createFixture(t);
  let calls = 0;
  const worker = createSyncWorker(workerOptions(fixture, {
    insertRecord: async () => {
      calls += 1;
    }
  }, {
    configured: false,
    enabled: false
  }));

  const result = await worker.runNow();
  const status = await worker.getStatus();

  assert.equal(result.status, "disabled");
  assert.equal(status.enabled, false);
  assert.equal(status.configured, false);
  assert.equal(status.pending, 1);
  assert.equal(calls, 0);
});

test("evaluation, settlement, and amendment synchronize in dependency order", async (t) => {
  const fixture = await createFixture(t);
  const settlement = createSettlementAuditRecord({
    evaluationId: fixture.record.id,
    outcome: "win",
    settledAt: "2026-07-17T14:00:10.000Z",
    closingOdds: -125,
    closingOppositeOdds: 105,
    stake: 10,
    profit: 10.3,
    notes: ["Official result confirmed."]
  }, {
    clientEventId: "90000000-0000-4000-8000-000000000006",
    createdAt: "2026-07-17T14:00:11.000Z"
  });
  const amendment = createAmendmentRecord({
    evaluationId: fixture.record.id,
    settlementId: settlement.id,
    reason: "Official scoring correction",
    patch: { outcome: "push", profit: 0 }
  }, {
    clientEventId: "90000000-0000-4000-8000-000000000007",
    createdAt: "2026-07-17T14:00:20.000Z"
  });
  await appendAuthoritativeRecord(settlement, {
    ledgerPath: fixture.ledgerPath,
    outboxPath: fixture.outboxPath
  });
  await appendAuthoritativeRecord(amendment, {
    ledgerPath: fixture.ledgerPath,
    outboxPath: fixture.outboxPath
  });

  const remoteIds = new Map();
  const tableOrder = [];
  const localByClientId = new Map([
    [fixture.record.clientEventId, fixture.record],
    [settlement.clientEventId, settlement],
    [amendment.clientEventId, amendment]
  ]);
  const projectedIds = [
    "90000000-0000-4000-8000-000000000008",
    "90000000-0000-4000-8000-000000000009",
    "90000000-0000-4000-8000-00000000000a"
  ];
  const client = {
    findByClientEventId: async (_table, _ownerUserId, clientEventId) => {
      const record = localByClientId.get(clientEventId);
      const remoteId = remoteIds.get(clientEventId);

      return remoteId
        ? { status: "found", remoteId, contentDigest: record.contentDigest }
        : { status: "not_found" };
    },
    insertRecord: async (table, row) => {
      tableOrder.push(table);
      const remoteId = projectedIds[tableOrder.length - 1];
      remoteIds.set(row.client_event_id, remoteId);
      return {
        status: "synchronized",
        remoteId,
        contentDigest: row.content_digest
      };
    }
  };
  const worker = createSyncWorker(workerOptions(fixture, client));

  const result = await worker.runNow();
  const state = await readOutboxState({ outboxPath: fixture.outboxPath });

  assert.equal(result.processed, 3);
  assert.equal(result.synchronized, 3);
  assert.deepEqual(tableOrder, [
    "decision_records",
    "settlement_records",
    "record_amendments"
  ]);
  assert.equal(state.summary.synchronized, 3);
});
