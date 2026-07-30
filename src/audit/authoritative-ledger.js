const fs = require("node:fs/promises");
const path = require("node:path");

const { canonicalStringify } = require("./canonical-json.js");
const {
  AUDIT_RECORD_SCHEMA_VERSION,
  validateAuditRecord
} = require("./record-contract.js");
const { enqueueRecord } = require("../sync/outbox.js");

const DEFAULT_AUTHORITATIVE_LEDGER_PATH = path.resolve(
  process.cwd(),
  "data/logs/decision_log.jsonl"
);
const appendQueues = new Map();

class AuthoritativeLedgerError extends Error {
  constructor(code, message, options = {}) {
    super(message, options);
    this.name = "AuthoritativeLedgerError";
    this.code = code;
  }
}

function safeErrorMessage(error) {
  if (error && typeof error.message === "string" && error.message.trim()) {
    return error.message.trim();
  }

  return "Unknown ledger error.";
}

function ledgerError(code, action, error) {
  return new AuthoritativeLedgerError(
    code,
    `${action}: ${safeErrorMessage(error)}`,
    error instanceof Error ? { cause: error } : {}
  );
}

function resolveAuthoritativeLedgerPath(ledgerPath) {
  if (typeof ledgerPath === "string" && ledgerPath.trim()) {
    return path.resolve(ledgerPath);
  }

  if (
    typeof process.env.BEAR_EDGE_DECISION_LOG_PATH === "string" &&
    process.env.BEAR_EDGE_DECISION_LOG_PATH.trim()
  ) {
    return path.resolve(process.env.BEAR_EDGE_DECISION_LOG_PATH);
  }

  return DEFAULT_AUTHORITATIVE_LEDGER_PATH;
}

function enqueueAppend(ledgerPath, operation) {
  const previous = appendQueues.get(ledgerPath) ?? Promise.resolve();
  const run = previous.then(operation, operation);
  const tail = run.catch(() => {});

  appendQueues.set(ledgerPath, tail);

  return run.finally(() => {
    if (appendQueues.get(ledgerPath) === tail) {
      appendQueues.delete(ledgerPath);
    }
  });
}

async function readAuthoritativeLedger(options = {}) {
  const ledgerPath = resolveAuthoritativeLedgerPath(options.ledgerPath ?? options.logPath);
  const fsImpl = options.fsImpl ?? fs;
  let contents;

  try {
    contents = await fsImpl.readFile(ledgerPath, "utf8");
  } catch (error) {
    if (error?.code === "ENOENT") {
      return {
        ledgerPath,
        records: [],
        malformedLines: [],
        duplicateIds: [],
        digestConflicts: [],
        invalidRecords: []
      };
    }

    throw ledgerError("LEDGER_READ_FAILED", "Could not read authoritative ledger", error);
  }

  const records = [];
  const malformedLines = [];
  const duplicateIds = [];
  const digestConflicts = [];
  const invalidRecords = [];
  const firstById = new Map();

  contents.split(/\r?\n/).forEach((line, index) => {
    if (!line.trim()) {
      return;
    }

    const lineNumber = index + 1;
    let record;

    try {
      record = JSON.parse(line);
    } catch (error) {
      malformedLines.push({
        lineNumber,
        error: safeErrorMessage(error)
      });
      return;
    }

    records.push(record);

    if (record?.schemaVersion === AUDIT_RECORD_SCHEMA_VERSION) {
      const validation = validateAuditRecord(record);

      if (!validation.valid) {
        invalidRecords.push({
          lineNumber,
          id: typeof record.id === "string" ? record.id : null,
          issues: validation.issues
        });
      }
    }

    if (typeof record?.id !== "string" || !record.id.trim()) {
      return;
    }

    const existing = firstById.get(record.id);

    if (!existing) {
      firstById.set(record.id, {
        lineNumber,
        contentDigest: record.contentDigest ?? null
      });
      return;
    }

    if (existing.contentDigest === (record.contentDigest ?? null)) {
      duplicateIds.push({
        id: record.id,
        firstLine: existing.lineNumber,
        duplicateLine: lineNumber,
        contentDigest: record.contentDigest ?? null
      });
      return;
    }

    digestConflicts.push({
      id: record.id,
      firstLine: existing.lineNumber,
      conflictLine: lineNumber,
      firstDigest: existing.contentDigest,
      conflictDigest: record.contentDigest ?? null
    });
  });

  return {
    ledgerPath,
    records,
    malformedLines,
    duplicateIds,
    digestConflicts,
    invalidRecords
  };
}

async function appendAuthoritativeRecord(record, options = {}) {
  const ledgerPath = resolveAuthoritativeLedgerPath(options.ledgerPath ?? options.logPath);
  const fsImpl = options.fsImpl ?? fs;

  const persistence = await enqueueAppend(ledgerPath, async () => {
    const inspection = await readAuthoritativeLedger({ ledgerPath, fsImpl });
    const sameId = inspection.records.filter((existing) => existing?.id === record?.id);
    const conflicting = sameId.find(
      (existing) => existing?.contentDigest !== record?.contentDigest
    );

    if (conflicting) {
      throw new AuthoritativeLedgerError(
        "LEDGER_DIGEST_CONFLICT",
        `Record ${record?.id ?? "unknown"} already exists with a different content digest.`
      );
    }

    const idempotent = sameId.find(
      (existing) => existing?.contentDigest === record?.contentDigest
    );

    if (idempotent) {
      return {
        ledgerPath,
        id: record.id,
        contentDigest: record.contentDigest,
        appended: false,
        persistedAt: new Date().toISOString()
      };
    }

    const validation = validateAuditRecord(record);

    if (!validation.valid) {
      throw new AuthoritativeLedgerError(
        "LEDGER_INVALID_RECORD",
        `Audit record validation failed: ${validation.issues
          .map((issue) => `${issue.path}: ${issue.message}`)
          .join("; ")}`
      );
    }

    try {
      await fsImpl.mkdir(path.dirname(ledgerPath), { recursive: true });
    } catch (error) {
      throw ledgerError("LEDGER_OPEN_FAILED", "Could not create ledger directory", error);
    }

    let handle;

    try {
      handle = await fsImpl.open(ledgerPath, "a");
    } catch (error) {
      throw ledgerError("LEDGER_OPEN_FAILED", "Could not open authoritative ledger", error);
    }

    let failure = null;

    try {
      await handle.writeFile(`${canonicalStringify(record)}\n`, "utf8");
    } catch (error) {
      failure = ledgerError("LEDGER_WRITE_FAILED", "Could not append authoritative record", error);
    }

    if (!failure) {
      try {
        await handle.sync();
      } catch (error) {
        failure = ledgerError("LEDGER_FLUSH_FAILED", "Could not flush authoritative ledger", error);
      }
    }

    try {
      await handle.close();
    } catch (error) {
      if (!failure) {
        failure = ledgerError("LEDGER_CLOSE_FAILED", "Could not close authoritative ledger", error);
      }
    }

    if (failure) {
      throw failure;
    }

    return {
      ledgerPath,
      id: record.id,
      contentDigest: record.contentDigest,
      appended: true,
      persistedAt: new Date().toISOString()
    };
  });

  try {
    const sync = await enqueueRecord(record, {
      outboxPath: options.outboxPath,
      ledgerPath,
      fsImpl: options.outboxFsImpl ?? fsImpl
    });

    return {
      ...persistence,
      outboxPath: sync.outboxPath,
      syncEventId: sync.event.eventId,
      syncState: sync.event.state,
      syncError: null
    };
  } catch (error) {
    return {
      ...persistence,
      outboxPath: options.outboxPath ?? null,
      syncEventId: null,
      syncState: "terminal_failure",
      syncError: {
        code: typeof error?.code === "string" ? error.code : "OUTBOX_ENQUEUE_FAILED",
        message: "The authoritative record remains available locally, but remote synchronization could not be queued."
      }
    };
  }
}

module.exports = {
  AuthoritativeLedgerError,
  DEFAULT_AUTHORITATIVE_LEDGER_PATH,
  appendAuthoritativeRecord,
  readAuthoritativeLedger,
  resolveAuthoritativeLedgerPath
};
