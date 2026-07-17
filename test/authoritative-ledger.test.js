const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs/promises");
const os = require("node:os");
const path = require("node:path");

const {
  appendAuthoritativeRecord,
  readAuthoritativeLedger
} = require("../src/audit/authoritative-ledger.js");
const {
  createEvaluationRecord
} = require("../src/audit/record-contract.js");
const { appendDecisionLog } = require("../src/decision-log.js");

function uuidFor(sequence) {
  return `00000000-0000-4000-8000-${String(sequence).padStart(12, "0")}`;
}

function evaluationRecord(sequence = 1) {
  return createEvaluationRecord({
    origin: {},
    event: {},
    market: { selection: `Research target ${sequence}` },
    price: {},
    sources: [],
    model: { modelStatus: "research_only" },
    probability: {},
    edge: {},
    stake: {},
    decision: {
      verdict: "WAIT",
      permission: "PRICE_CHECK_ONLY",
      reasons: ["Research-only record."],
      riskFlags: [],
      gateResults: []
    },
    audit: { warnings: [] }
  }, {
    clientEventId: uuidFor(sequence),
    createdAt: `2026-07-17T04:${String(sequence).padStart(2, "0")}:00.000Z`
  });
}

test("appendAuthoritativeRecord appends once and treats the same id and digest as idempotent", async (t) => {
  const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), "bear-edge-ledger-"));
  const ledgerPath = path.join(tempDir, "decision_log.jsonl");
  const record = evaluationRecord();
  t.after(() => fs.rm(tempDir, { recursive: true, force: true }));

  const first = await appendAuthoritativeRecord(record, { ledgerPath });
  const second = await appendAuthoritativeRecord(record, { ledgerPath });
  const lines = (await fs.readFile(ledgerPath, "utf8")).trim().split("\n");

  assert.equal(first.appended, true);
  assert.equal(second.appended, false);
  assert.equal(first.ledgerPath, ledgerPath);
  assert.equal(lines.length, 1);
});

test("appendAuthoritativeRecord rejects the same id with a different digest", async (t) => {
  const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), "bear-edge-ledger-"));
  const ledgerPath = path.join(tempDir, "decision_log.jsonl");
  const record = evaluationRecord();
  t.after(() => fs.rm(tempDir, { recursive: true, force: true }));

  await appendAuthoritativeRecord(record, { ledgerPath });
  const conflicting = { ...record, contentDigest: "f".repeat(64) };

  await assert.rejects(
    appendAuthoritativeRecord(conflicting, { ledgerPath }),
    (error) => error instanceof Error && Reflect.get(error, "code") === "LEDGER_DIGEST_CONFLICT"
  );
});

test("appendAuthoritativeRecord serializes concurrent writes to one complete line per record", async (t) => {
  const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), "bear-edge-ledger-"));
  const ledgerPath = path.join(tempDir, "decision_log.jsonl");
  const records = Array.from({ length: 12 }, (_, index) => evaluationRecord(index + 1));
  t.after(() => fs.rm(tempDir, { recursive: true, force: true }));

  await Promise.all(records.map((record) => appendAuthoritativeRecord(record, { ledgerPath })));
  const inspection = await readAuthoritativeLedger({ ledgerPath });

  assert.equal(inspection.records.length, records.length);
  assert.deepEqual(inspection.malformedLines, []);
  assert.deepEqual(inspection.duplicateIds, []);
  assert.deepEqual(inspection.digestConflicts, []);
});

test("readAuthoritativeLedger reports malformed lines, duplicate identifiers, and digest conflicts", async (t) => {
  const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), "bear-edge-ledger-"));
  const ledgerPath = path.join(tempDir, "decision_log.jsonl");
  const record = evaluationRecord();
  const conflict = { ...record, contentDigest: "f".repeat(64) };
  t.after(() => fs.rm(tempDir, { recursive: true, force: true }));

  await fs.writeFile(
    ledgerPath,
    `${JSON.stringify(record)}\nnot-json\n${JSON.stringify(record)}\n${JSON.stringify(conflict)}\n`,
    "utf8"
  );
  const inspection = await readAuthoritativeLedger({ ledgerPath });

  assert.equal(inspection.records.length, 3);
  assert.equal(inspection.malformedLines.length, 1);
  assert.equal(inspection.duplicateIds.length, 1);
  assert.equal(inspection.digestConflicts.length, 1);
  assert.equal(inspection.digestConflicts[0].id, record.id);
});

test("appendAuthoritativeRecord exposes a flush failure and leaves no success result", async () => {
  const record = evaluationRecord();
  const fsImpl = {
    mkdir: async () => {},
    readFile: async () => {
      throw Object.assign(new Error("missing"), { code: "ENOENT" });
    },
    open: async () => ({
      writeFile: async () => {},
      sync: async () => {
        throw new Error("flush failed");
      },
      close: async () => {}
    })
  };

  await assert.rejects(
    appendAuthoritativeRecord(record, { ledgerPath: "/virtual/log.jsonl", fsImpl }),
    (error) =>
      error instanceof Error &&
      Reflect.get(error, "code") === "LEDGER_FLUSH_FAILED" &&
      /flush failed/.test(error.message)
  );
});

test("appendDecisionLog routes schema-version-2 records through authoritative idempotency", async (t) => {
  const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), "bear-edge-ledger-"));
  const logPath = path.join(tempDir, "decision_log.jsonl");
  const record = evaluationRecord();
  t.after(() => fs.rm(tempDir, { recursive: true, force: true }));

  assert.equal(await appendDecisionLog(record, { logPath }), logPath);
  assert.equal(await appendDecisionLog(record, { logPath }), logPath);
  assert.equal((await fs.readFile(logPath, "utf8")).trim().split("\n").length, 1);
});
