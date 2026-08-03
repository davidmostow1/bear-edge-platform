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

function betEvaluationRecord(sequence = 90) {
  return createEvaluationRecord({
    origin: { channel: "test", actorType: "operator" },
    event: {
      sport: "mlb",
      league: "MLB",
      eventId: `event-${sequence}`,
      startTime: "2026-07-17T23:00:00.000Z",
      homeTeam: "Home",
      awayTeam: "Away"
    },
    market: {
      marketFamily: "moneyline",
      marketType: "moneyline",
      selection: "Verified test moneyline"
    },
    price: {
      sportsbook: "draftkings",
      marketOdds: 120,
      oppositeOdds: -135,
      priceCapturedAt: "2026-07-17T11:59:00.000Z",
      priceSourceTime: "2026-07-17T11:58:30.000Z"
    },
    sources: [{
      provider: "the_odds_api",
      sourceType: "sportsbook_price",
      sourceLocator: "https://api.the-odds-api.com/v4/sports/baseball_mlb/odds",
      parserVersion: "test_v1",
      capturedAt: "2026-07-17T11:59:00.000Z",
      sourceTime: "2026-07-17T11:58:30.000Z",
      digest: "a".repeat(64),
      freshness: "fresh",
      verificationStatus: "verified_provider_capture"
    }],
    model: {
      modelId: "validated_moneyline",
      modelVersion: "1.0.0",
      probabilityMethod: "calibrated_logistic",
      modelStatus: "validated",
      calibrationReportId: "calibration-report-001",
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
    stake: { recommendedStake: 10, bankroll: 1000, stakePolicyVersion: "test_v1" },
    decision: {
      verdict: "BET",
      permission: "VERIFIED_BETS_ALLOWED",
      reasons: ["All test gates passed."],
      riskFlags: [],
      gateResults: [{ gate: "authorization", passed: true }]
    },
    audit: {
      codeVersion: "test",
      configurationDigest: "b".repeat(64),
      calculationVersion: "test_v1",
      evidenceCompleteness: "verified",
      warnings: []
    }
  }, {
    clientEventId: uuidFor(sequence),
    createdAt: "2026-07-17T12:00:00.000Z"
  });
}

test("appendAuthoritativeRecord appends once and treats the same id and digest as idempotent", async (t) => {
  const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), "bear-edge-ledger-"));
  const ledgerPath = path.join(tempDir, "decision_log.jsonl");
  const outboxPath = path.join(tempDir, "sync_outbox.jsonl");
  const record = evaluationRecord();
  t.after(() => fs.rm(tempDir, { recursive: true, force: true }));

  const first = await appendAuthoritativeRecord(record, { ledgerPath, outboxPath });
  const second = await appendAuthoritativeRecord(record, { ledgerPath, outboxPath });
  const lines = (await fs.readFile(ledgerPath, "utf8")).trim().split("\n");
  const outboxLines = (await fs.readFile(outboxPath, "utf8")).trim().split("\n");

  assert.equal(first.appended, true);
  assert.equal(second.appended, false);
  assert.equal(first.ledgerPath, ledgerPath);
  assert.equal(first.syncState, "pending");
  assert.equal(second.syncState, "pending");
  assert.equal(lines.length, 1);
  assert.equal(outboxLines.length, 1);
});

test("appendAuthoritativeRecord keeps the local record when outbox persistence fails", async (t) => {
  const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), "bear-edge-ledger-"));
  const ledgerPath = path.join(tempDir, "decision_log.jsonl");
  const outboxPath = path.join(tempDir, "missing", "sync_outbox.jsonl");
  const record = evaluationRecord();
  const fsImpl = {
    ...fs,
    mkdir: async (directory, options) => {
      if (path.resolve(directory) === path.resolve(path.dirname(outboxPath))) {
        throw Object.assign(new Error("outbox unavailable"), { code: "EACCES" });
      }
      return fs.mkdir(directory, options);
    }
  };
  t.after(() => fs.rm(tempDir, { recursive: true, force: true }));

  const result = await appendAuthoritativeRecord(record, {
    ledgerPath,
    outboxPath,
    fsImpl
  });

  assert.equal(result.appended, true);
  assert.equal(result.syncState, "terminal_failure");
  assert.equal(result.syncError.code, "OUTBOX_OPEN_FAILED");
  assert.match(result.syncError.message, /authoritative record remains available/i);
  assert.equal((await fs.readFile(ledgerPath, "utf8")).trim().split("\n").length, 1);
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

test("appendAuthoritativeRecord blocks new writes when the existing ledger has integrity failures", async (t) => {
  const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), "bear-edge-ledger-integrity-"));
  const ledgerPath = path.join(tempDir, "decision_log.jsonl");
  const record = evaluationRecord();
  t.after(() => fs.rm(tempDir, { recursive: true, force: true }));

  await fs.writeFile(ledgerPath, '{"incomplete":\n', "utf8");

  await assert.rejects(
    appendAuthoritativeRecord(record, { ledgerPath }),
    (error) => error instanceof Error && Reflect.get(error, "code") === "LEDGER_INTEGRITY_BLOCKED"
  );
  assert.equal((await fs.readFile(ledgerPath, "utf8")).trim(), '{"incomplete":');
});

test("appendAuthoritativeRecord blocks new writes after an identical duplicate identifier", async (t) => {
  const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), "bear-edge-ledger-duplicate-"));
  const ledgerPath = path.join(tempDir, "decision_log.jsonl");
  const duplicate = evaluationRecord();
  const nextRecord = evaluationRecord(2);
  t.after(() => fs.rm(tempDir, { recursive: true, force: true }));

  await fs.writeFile(
    ledgerPath,
    `${JSON.stringify(duplicate)}\n${JSON.stringify(duplicate)}\n`,
    "utf8"
  );

  await assert.rejects(
    appendAuthoritativeRecord(nextRecord, { ledgerPath }),
    (error) => error instanceof Error && Reflect.get(error, "code") === "LEDGER_INTEGRITY_BLOCKED"
  );
  assert.equal((await readAuthoritativeLedger({ ledgerPath })).records.length, 2);
});

test("appendAuthoritativeRecord verifies BET model authority against the registry", async (t) => {
  const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), "bear-edge-ledger-model-"));
  const blockedLedgerPath = path.join(tempDir, "blocked.jsonl");
  const acceptedLedgerPath = path.join(tempDir, "accepted.jsonl");
  const record = betEvaluationRecord();
  t.after(() => fs.rm(tempDir, { recursive: true, force: true }));

  await assert.rejects(
    appendAuthoritativeRecord(record, { ledgerPath: blockedLedgerPath }),
    (error) => error instanceof Error && Reflect.get(error, "code") === "LEDGER_MODEL_AUTHORITY_BLOCKED"
  );

  const result = await appendAuthoritativeRecord(record, {
    ledgerPath: acceptedLedgerPath,
    resolveModelEvidenceImpl: (identity) => ({
      ...identity,
      calibrationReportId: "calibration-report-001",
      validated: true
    })
  });

  assert.equal(result.appended, true);
  assert.equal((await readAuthoritativeLedger({ ledgerPath: acceptedLedgerPath })).records.length, 1);
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

test("readAuthoritativeLedger identifies pre-schema rows as legacy evidence", async (t) => {
  const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), "bear-edge-ledger-legacy-"));
  const ledgerPath = path.join(tempDir, "decision_log.jsonl");
  t.after(() => fs.rm(tempDir, { recursive: true, force: true }));

  await fs.writeFile(
    ledgerPath,
    `${JSON.stringify({ timestamp: "2026-07-17T12:00:00.000Z", verdict: "BET" })}\n`,
    "utf8"
  );
  const inspection = await readAuthoritativeLedger({ ledgerPath });

  assert.equal(inspection.records.length, 1);
  assert.equal(inspection.legacyRecords.length, 1);
  assert.equal(inspection.legacyRecords[0].lineNumber, 1);
  assert.equal(inspection.invalidRecords.length, 0);
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
