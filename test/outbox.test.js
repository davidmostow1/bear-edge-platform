const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs/promises");
const os = require("node:os");
const path = require("node:path");

const {
  OUTBOX_STATES,
  appendSyncEvent,
  enqueueRecord,
  readOutboxState
} = require("../src/sync/outbox.js");
const { createEvaluationRecord } = require("../src/audit/record-contract.js");

const EVENT_ID = "10000000-0000-4000-8000-000000000001";
const CLIENT_EVENT_ID = "20000000-0000-4000-8000-000000000001";
const RECORD_ID = `eval_${CLIENT_EVENT_ID}`;
const DIGEST = "a".repeat(64);
const T1 = "2026-07-17T12:00:00.000Z";
const T2 = "2026-07-17T12:01:00.000Z";
const T3 = "2026-07-17T12:02:00.000Z";

function syncEvent(overrides = {}) {
  return {
    schemaVersion: "1.0.0",
    eventId: EVENT_ID,
    clientEventId: CLIENT_EVENT_ID,
    recordId: RECORD_ID,
    recordType: "evaluation",
    contentDigest: DIGEST,
    state: "pending",
    attempt: 0,
    occurredAt: T1,
    nextAttemptAt: null,
    errorCode: null,
    safeError: null,
    ...overrides
  };
}

function evaluationRecord() {
  return createEvaluationRecord({
    origin: {},
    event: {},
    market: { selection: "Research target" },
    price: {},
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
    clientEventId: CLIENT_EVENT_ID,
    createdAt: T1
  });
}

test("outbox exposes the complete closed state vocabulary", () => {
  assert.deepEqual(OUTBOX_STATES, [
    "pending",
    "in_flight",
    "synchronized",
    "retryable_failure",
    "terminal_failure"
  ]);
});

test("readOutboxState selects the latest event and retains the first pending time", async (t) => {
  const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), "bear-edge-outbox-"));
  const outboxPath = path.join(tempDir, "sync_outbox.jsonl");
  t.after(() => fs.rm(tempDir, { recursive: true, force: true }));

  await appendSyncEvent(syncEvent(), { outboxPath });
  await appendSyncEvent(syncEvent({
    eventId: "10000000-0000-4000-8000-000000000002",
    state: "retryable_failure",
    attempt: 1,
    occurredAt: T2,
    nextAttemptAt: T3,
    errorCode: "NETWORK_ERROR",
    safeError: "Remote synchronization is temporarily unavailable."
  }), { outboxPath });

  const state = await readOutboxState({ outboxPath });

  assert.equal(state.items.length, 1);
  assert.equal(state.items[0].state, "retryable_failure");
  assert.equal(state.items[0].firstPendingAt, T1);
  assert.equal(state.summary.retryableFailures, 1);
  assert.equal(state.summary.oldestPendingAt, T1);
  assert.deepEqual(state.malformedLines, []);
  assert.deepEqual(state.invalidEvents, []);
});

test("appendSyncEvent rejects decreasing attempt numbers", async (t) => {
  const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), "bear-edge-outbox-"));
  const outboxPath = path.join(tempDir, "sync_outbox.jsonl");
  t.after(() => fs.rm(tempDir, { recursive: true, force: true }));

  await appendSyncEvent(syncEvent({
    state: "retryable_failure",
    attempt: 2,
    occurredAt: T2,
    errorCode: "NETWORK_ERROR",
    safeError: "Remote synchronization is temporarily unavailable."
  }), { outboxPath });

  await assert.rejects(
    appendSyncEvent(syncEvent({
      eventId: "10000000-0000-4000-8000-000000000003",
      attempt: 1,
      occurredAt: T3
    }), { outboxPath }),
    /attempt cannot decrease/i
  );
});

test("appendSyncEvent validates identity, digest, state, attempt, and timestamps", async (t) => {
  const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), "bear-edge-outbox-"));
  const outboxPath = path.join(tempDir, "sync_outbox.jsonl");
  t.after(() => fs.rm(tempDir, { recursive: true, force: true }));

  await assert.rejects(
    appendSyncEvent(syncEvent({
      eventId: "not-a-uuid",
      contentDigest: "bad",
      state: "unknown",
      attempt: -1,
      occurredAt: "yesterday"
    }), { outboxPath }),
    /invalid synchronization event/i
  );
});

test("enqueueRecord creates one deterministic pending event per canonical record", async (t) => {
  const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), "bear-edge-outbox-"));
  const outboxPath = path.join(tempDir, "sync_outbox.jsonl");
  const record = evaluationRecord();
  t.after(() => fs.rm(tempDir, { recursive: true, force: true }));

  const first = await enqueueRecord(record, { outboxPath });
  const second = await enqueueRecord(record, { outboxPath });
  const state = await readOutboxState({ outboxPath });
  const lines = (await fs.readFile(outboxPath, "utf8")).trim().split("\n");

  assert.equal(first.appended, true);
  assert.equal(second.appended, false);
  assert.equal(first.event.eventId, second.event.eventId);
  assert.equal(first.event.clientEventId, record.clientEventId);
  assert.equal(first.event.recordId, record.id);
  assert.equal(first.event.contentDigest, record.contentDigest);
  assert.equal(first.event.state, "pending");
  assert.equal(state.summary.pending, 1);
  assert.equal(lines.length, 1);
});

test("readOutboxState reports malformed and invalid retained events without hiding valid items", async (t) => {
  const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), "bear-edge-outbox-"));
  const outboxPath = path.join(tempDir, "sync_outbox.jsonl");
  t.after(() => fs.rm(tempDir, { recursive: true, force: true }));

  await fs.writeFile(
    outboxPath,
    `${JSON.stringify(syncEvent())}\nnot-json\n${JSON.stringify(syncEvent({ eventId: "bad" }))}\n`,
    "utf8"
  );

  const state = await readOutboxState({ outboxPath });

  assert.equal(state.items.length, 1);
  assert.equal(state.malformedLines.length, 1);
  assert.equal(state.invalidEvents.length, 1);
});
