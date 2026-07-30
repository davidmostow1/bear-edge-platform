const crypto = require("node:crypto");
const fs = require("node:fs/promises");
const path = require("node:path");

const { canonicalStringify } = require("../audit/canonical-json.js");
const { validateAuditRecord } = require("../audit/record-contract.js");

const OUTBOX_SCHEMA_VERSION = "1.0.0";
const OUTBOX_STATES = Object.freeze([
  "pending",
  "in_flight",
  "synchronized",
  "retryable_failure",
  "terminal_failure"
]);
const SYNCABLE_RECORD_TYPES = Object.freeze([
  "evaluation",
  "settlement",
  "amendment"
]);
const DEFAULT_OUTBOX_PATH = path.resolve(process.cwd(), "data/logs/sync_outbox.jsonl");
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const DIGEST_PATTERN = /^[a-f0-9]{64}$/;
const appendQueues = new Map();

class OutboxError extends Error {
  constructor(code, message, options = {}) {
    super(message, options);
    this.name = "OutboxError";
    this.code = code;
  }
}

function safeErrorMessage(error) {
  if (error && typeof error.message === "string" && error.message.trim()) {
    return error.message.trim();
  }

  return "Unknown outbox error.";
}

function outboxError(code, action, error) {
  return new OutboxError(
    code,
    `${action}: ${safeErrorMessage(error)}`,
    error instanceof Error ? { cause: error } : {}
  );
}

function resolveOutboxPath(outboxPath, ledgerPath) {
  if (typeof outboxPath === "string" && outboxPath.trim()) {
    return path.resolve(outboxPath);
  }

  if (
    typeof process.env.BEAR_EDGE_SYNC_OUTBOX_PATH === "string" &&
    process.env.BEAR_EDGE_SYNC_OUTBOX_PATH.trim()
  ) {
    return path.resolve(process.env.BEAR_EDGE_SYNC_OUTBOX_PATH);
  }

  if (typeof ledgerPath === "string" && ledgerPath.trim()) {
    return path.join(path.dirname(path.resolve(ledgerPath)), "sync_outbox.jsonl");
  }

  return DEFAULT_OUTBOX_PATH;
}

function enqueueAppend(outboxPath, operation) {
  const previous = appendQueues.get(outboxPath) ?? Promise.resolve();
  const run = previous.then(operation, operation);
  const tail = run.catch(() => {});

  appendQueues.set(outboxPath, tail);

  return run.finally(() => {
    if (appendQueues.get(outboxPath) === tail) {
      appendQueues.delete(outboxPath);
    }
  });
}

function isIsoTimestamp(value) {
  return (
    typeof value === "string" &&
    /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{3})?Z$/.test(value) &&
    Number.isFinite(Date.parse(value))
  );
}

function validateSyncEvent(event) {
  const issues = [];

  if (!event || typeof event !== "object" || Array.isArray(event)) {
    return ["event must be an object"];
  }

  if (event.schemaVersion !== OUTBOX_SCHEMA_VERSION) {
    issues.push(`schemaVersion must equal ${OUTBOX_SCHEMA_VERSION}`);
  }
  if (!UUID_PATTERN.test(event.eventId ?? "")) {
    issues.push("eventId must be a UUID");
  }
  if (!UUID_PATTERN.test(event.clientEventId ?? "")) {
    issues.push("clientEventId must be a UUID");
  }
  if (typeof event.recordId !== "string" || !event.recordId.trim()) {
    issues.push("recordId must be a non-empty string");
  }
  if (!SYNCABLE_RECORD_TYPES.includes(event.recordType)) {
    issues.push(`recordType must be one of: ${SYNCABLE_RECORD_TYPES.join(", ")}`);
  }
  if (!DIGEST_PATTERN.test(event.contentDigest ?? "")) {
    issues.push("contentDigest must be a lowercase SHA-256 digest");
  }
  if (!OUTBOX_STATES.includes(event.state)) {
    issues.push(`state must be one of: ${OUTBOX_STATES.join(", ")}`);
  }
  if (!Number.isSafeInteger(event.attempt) || event.attempt < 0) {
    issues.push("attempt must be a non-negative safe integer");
  }
  if (!isIsoTimestamp(event.occurredAt)) {
    issues.push("occurredAt must be an ISO-8601 UTC timestamp");
  }
  if (event.nextAttemptAt !== null && !isIsoTimestamp(event.nextAttemptAt)) {
    issues.push("nextAttemptAt must be an ISO-8601 UTC timestamp or null");
  }
  if (event.errorCode !== null && (typeof event.errorCode !== "string" || !event.errorCode.trim())) {
    issues.push("errorCode must be a non-empty string or null");
  }
  if (event.safeError !== null && (typeof event.safeError !== "string" || !event.safeError.trim())) {
    issues.push("safeError must be a non-empty string or null");
  }

  return issues;
}

function deterministicUuid(value) {
  const bytes = crypto.createHash("sha1").update(value).digest().subarray(0, 16);
  bytes[6] = (bytes[6] & 0x0f) | 0x50;
  bytes[8] = (bytes[8] & 0x3f) | 0x80;
  const hex = bytes.toString("hex");

  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}

async function readOutboxState(options = {}) {
  const outboxPath = resolveOutboxPath(options.outboxPath, options.ledgerPath);
  const fsImpl = options.fsImpl ?? fs;
  let contents;

  try {
    contents = await fsImpl.readFile(outboxPath, "utf8");
  } catch (error) {
    if (error?.code === "ENOENT") {
      return emptyOutboxState(outboxPath);
    }

    throw outboxError("OUTBOX_READ_FAILED", "Could not read synchronization outbox", error);
  }

  const malformedLines = [];
  const invalidEvents = [];
  const validEvents = [];

  contents.split(/\r?\n/).forEach((line, index) => {
    if (!line.trim()) {
      return;
    }

    const lineNumber = index + 1;
    let event;

    try {
      event = JSON.parse(line);
    } catch (error) {
      malformedLines.push({ lineNumber, error: safeErrorMessage(error) });
      return;
    }

    const issues = validateSyncEvent(event);

    if (issues.length > 0) {
      invalidEvents.push({
        lineNumber,
        eventId: typeof event?.eventId === "string" ? event.eventId : null,
        issues
      });
      return;
    }

    validEvents.push({ ...event, lineNumber });
  });

  const byClientEventId = new Map();

  for (const event of validEvents) {
    const existing = byClientEventId.get(event.clientEventId);
    const firstPendingAt = existing?.firstPendingAt ?? (
      event.state === "pending" ? event.occurredAt : null
    );

    byClientEventId.set(event.clientEventId, {
      ...event,
      firstPendingAt
    });
  }

  const items = [...byClientEventId.values()]
    .map(({ lineNumber, ...item }) => item)
    .sort((left, right) => {
      const leftTime = left.firstPendingAt ?? left.occurredAt;
      const rightTime = right.firstPendingAt ?? right.occurredAt;
      return leftTime.localeCompare(rightTime) || left.clientEventId.localeCompare(right.clientEventId);
    });
  const pending = items.filter((item) => item.state === "pending" || item.state === "in_flight");
  const retryableFailures = items.filter((item) => item.state === "retryable_failure");
  const terminalFailures = items.filter((item) => item.state === "terminal_failure");
  const unsynchronized = [...pending, ...retryableFailures];
  const oldestPendingAt = unsynchronized
    .map((item) => item.firstPendingAt ?? item.occurredAt)
    .sort()[0] ?? null;

  return {
    outboxPath,
    events: validEvents.map(({ lineNumber, ...event }) => event),
    items,
    pending,
    retryableFailures,
    terminalFailures,
    malformedLines,
    invalidEvents,
    summary: {
      total: items.length,
      pending: items.filter((item) => item.state === "pending").length,
      inFlight: items.filter((item) => item.state === "in_flight").length,
      synchronized: items.filter((item) => item.state === "synchronized").length,
      retryableFailures: retryableFailures.length,
      terminalFailures: terminalFailures.length,
      oldestPendingAt
    }
  };
}

function emptyOutboxState(outboxPath) {
  return {
    outboxPath,
    events: [],
    items: [],
    pending: [],
    retryableFailures: [],
    terminalFailures: [],
    malformedLines: [],
    invalidEvents: [],
    summary: {
      total: 0,
      pending: 0,
      inFlight: 0,
      synchronized: 0,
      retryableFailures: 0,
      terminalFailures: 0,
      oldestPendingAt: null
    }
  };
}

async function appendSyncEvent(event, options = {}) {
  const outboxPath = resolveOutboxPath(options.outboxPath, options.ledgerPath);
  const fsImpl = options.fsImpl ?? fs;
  const issues = validateSyncEvent(event);

  if (issues.length > 0) {
    throw new OutboxError(
      "OUTBOX_INVALID_EVENT",
      `Invalid synchronization event: ${issues.join("; ")}.`
    );
  }

  return enqueueAppend(outboxPath, async () => {
    const inspection = await readOutboxState({ outboxPath, fsImpl });
    const sameEventId = inspection.events.find((existing) => existing.eventId === event.eventId);

    if (sameEventId) {
      if (canonicalStringify(sameEventId) !== canonicalStringify(event)) {
        throw new OutboxError(
          "OUTBOX_EVENT_CONFLICT",
          `Synchronization event ${event.eventId} already exists with different content.`
        );
      }

      return {
        outboxPath,
        event: sameEventId,
        appended: false,
        persistedAt: new Date().toISOString()
      };
    }

    const current = inspection.items.find(
      (item) => item.clientEventId === event.clientEventId
    );

    if (current) {
      if (
        current.recordId !== event.recordId ||
        current.recordType !== event.recordType ||
        current.contentDigest !== event.contentDigest
      ) {
        throw new OutboxError(
          "OUTBOX_DIGEST_CONFLICT",
          `Synchronization item ${event.clientEventId} conflicts with its retained record identity or digest.`
        );
      }
      if (event.attempt < current.attempt) {
        throw new OutboxError(
          "OUTBOX_ATTEMPT_REGRESSION",
          `Synchronization attempt cannot decrease from ${current.attempt} to ${event.attempt}.`
        );
      }
      if (Date.parse(event.occurredAt) < Date.parse(current.occurredAt)) {
        throw new OutboxError(
          "OUTBOX_TIME_REGRESSION",
          "Synchronization event time cannot precede the latest retained event."
        );
      }
    }

    try {
      await fsImpl.mkdir(path.dirname(outboxPath), { recursive: true });
    } catch (error) {
      throw outboxError("OUTBOX_OPEN_FAILED", "Could not create outbox directory", error);
    }

    let handle;

    try {
      handle = await fsImpl.open(outboxPath, "a");
    } catch (error) {
      throw outboxError("OUTBOX_OPEN_FAILED", "Could not open synchronization outbox", error);
    }

    let failure = null;

    try {
      await handle.writeFile(`${canonicalStringify(event)}\n`, "utf8");
    } catch (error) {
      failure = outboxError("OUTBOX_WRITE_FAILED", "Could not append synchronization event", error);
    }

    if (!failure) {
      try {
        await handle.sync();
      } catch (error) {
        failure = outboxError("OUTBOX_FLUSH_FAILED", "Could not flush synchronization outbox", error);
      }
    }

    try {
      await handle.close();
    } catch (error) {
      if (!failure) {
        failure = outboxError("OUTBOX_CLOSE_FAILED", "Could not close synchronization outbox", error);
      }
    }

    if (failure) {
      throw failure;
    }

    return {
      outboxPath,
      event: { ...event },
      appended: true,
      persistedAt: new Date().toISOString()
    };
  });
}

async function enqueueRecord(record, options = {}) {
  const validation = validateAuditRecord(record);

  if (!validation.valid || !SYNCABLE_RECORD_TYPES.includes(record?.recordType)) {
    throw new OutboxError(
      "OUTBOX_INVALID_RECORD",
      "Only valid canonical evaluation, settlement, or amendment records can be synchronized."
    );
  }

  const outboxPath = resolveOutboxPath(options.outboxPath, options.ledgerPath);
  const inspection = await readOutboxState({ outboxPath, fsImpl: options.fsImpl });
  const current = inspection.items.find(
    (item) => item.clientEventId === record.clientEventId
  );

  if (current) {
    if (
      current.recordId !== record.id ||
      current.recordType !== record.recordType ||
      current.contentDigest !== record.contentDigest
    ) {
      throw new OutboxError(
        "OUTBOX_DIGEST_CONFLICT",
        `Synchronization item ${record.clientEventId} conflicts with the authoritative record.`
      );
    }

    return {
      outboxPath,
      event: current,
      appended: false,
      persistedAt: new Date().toISOString()
    };
  }

  const event = {
    schemaVersion: OUTBOX_SCHEMA_VERSION,
    eventId: deterministicUuid(`bear-edge:outbox:${record.clientEventId}:${record.contentDigest}:pending`),
    clientEventId: record.clientEventId,
    recordId: record.id,
    recordType: record.recordType,
    contentDigest: record.contentDigest,
    state: "pending",
    attempt: 0,
    occurredAt: record.createdAt,
    nextAttemptAt: null,
    errorCode: null,
    safeError: null
  };

  return appendSyncEvent(event, {
    outboxPath,
    fsImpl: options.fsImpl
  });
}

module.exports = {
  DEFAULT_OUTBOX_PATH,
  OUTBOX_SCHEMA_VERSION,
  OUTBOX_STATES,
  OutboxError,
  appendSyncEvent,
  enqueueRecord,
  readOutboxState,
  resolveOutboxPath,
  validateSyncEvent
};
