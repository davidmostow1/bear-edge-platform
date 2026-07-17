const crypto = require("node:crypto");

const { readAuthoritativeLedger } = require("../audit/authoritative-ledger.js");
const { safeErrorMessage } = require("../config/secrets.js");
const {
  appendSyncEvent,
  readOutboxState
} = require("./outbox.js");
const {
  mapAmendmentRecord,
  mapDecisionRecord,
  mapSettlementRecord
} = require("./supabase-mapper.js");

const DEFAULT_BATCH_SIZE = 100;
const DEFAULT_POLL_INTERVAL_MS = 30_000;

class SyncWorkerFailure extends Error {
  constructor(state, code, message) {
    super(message);
    this.name = "SyncWorkerFailure";
    this.state = state;
    this.code = code;
  }
}

function calculateRetryDelay(attempt, clientEventId) {
  if (!Number.isSafeInteger(attempt) || attempt < 0) {
    throw new TypeError("Retry attempt must be a non-negative safe integer");
  }

  const base = Math.min(300_000, 1_000 * (2 ** Math.min(attempt, 30)));
  const jitterBytes = crypto
    .createHash("sha256")
    .update(`${clientEventId}:${attempt}`)
    .digest();
  const jitter = jitterBytes.readUInt32BE(0) % 1_000;

  return base + jitter;
}

function eventFor(item, state, attempt, occurredAt, details = {}) {
  return {
    schemaVersion: "1.0.0",
    eventId: crypto.randomUUID(),
    clientEventId: item.clientEventId,
    recordId: item.recordId,
    recordType: item.recordType,
    contentDigest: item.contentDigest,
    state,
    attempt,
    occurredAt,
    nextAttemptAt: details.nextAttemptAt ?? null,
    errorCode: details.errorCode ?? null,
    safeError: details.safeError ?? null
  };
}

function normalizeRemoteFailure(result) {
  if (result?.status === "synchronized" || result?.status === "already_synchronized") {
    return result;
  }

  if (result?.status === "retryable_failure" || result?.status === "terminal_failure") {
    return result;
  }

  return {
    status: "terminal_failure",
    errorCode: "REMOTE_RESPONSE_INVALID",
    safeError: "The remote projection client returned an invalid result"
  };
}

function createSyncWorker(options = {}) {
  const client = options.client ?? null;
  const ownerUserId = options.ownerUserId ?? null;
  const configured = options.configured ?? Boolean(client && ownerUserId);
  const enabled = options.enabled ?? configured;
  const batchSize = options.batchSize ?? DEFAULT_BATCH_SIZE;
  const pollIntervalMs = options.pollIntervalMs ?? DEFAULT_POLL_INTERVAL_MS;
  const clock = options.clock ?? (() => new Date());
  const setIntervalImpl = options.setIntervalImpl ?? setInterval;
  const clearIntervalImpl = options.clearIntervalImpl ?? clearInterval;

  if (!Number.isSafeInteger(batchSize) || batchSize < 1 || batchSize > DEFAULT_BATCH_SIZE) {
    throw new TypeError(`Sync worker batchSize must be from 1 through ${DEFAULT_BATCH_SIZE}`);
  }
  if (!Number.isSafeInteger(pollIntervalMs) || pollIntervalMs < 1) {
    throw new TypeError("Sync worker pollIntervalMs must be a positive safe integer");
  }
  if (enabled && (!client || typeof client.insertRecord !== "function" || !ownerUserId)) {
    throw new TypeError("An enabled sync worker requires a client and owner user id");
  }

  let activeRun = null;
  let timer = null;
  let started = false;
  let lastRunAt = null;
  let lastSuccessAt = null;
  let lastSafeError = null;

  function nowIso() {
    const value = clock();
    const date = value instanceof Date ? value : new Date(value);

    if (!Number.isFinite(date.getTime())) {
      throw new Error("Sync worker clock returned an invalid time");
    }

    return date.toISOString();
  }

  async function findRemoteDependency(table, record) {
    if (typeof client.findByClientEventId !== "function") {
      throw new SyncWorkerFailure(
        "terminal_failure",
        "REMOTE_CLIENT_INVALID",
        "The remote projection client cannot resolve dependencies"
      );
    }

    let result;

    try {
      result = await client.findByClientEventId(
        table,
        ownerUserId,
        record.clientEventId
      );
    } catch (_error) {
      throw new SyncWorkerFailure(
        "retryable_failure",
        "REMOTE_CLIENT_ERROR",
        "The remote projection client failed unexpectedly"
      );
    }

    if (
      (result?.status === "found" || result?.status === "already_synchronized")
      && result.contentDigest === record.contentDigest
      && typeof result.remoteId === "string"
    ) {
      return result.remoteId;
    }

    if (result?.status === "found" || result?.status === "already_synchronized") {
      throw new SyncWorkerFailure(
        "terminal_failure",
        "REMOTE_DIGEST_CONFLICT",
        "A remote dependency has a different content digest"
      );
    }

    if (result?.status === "not_found") {
      throw new SyncWorkerFailure(
        "retryable_failure",
        "REMOTE_DEPENDENCY_PENDING",
        "A parent record has not synchronized yet"
      );
    }

    const failure = normalizeRemoteFailure(result);
    throw new SyncWorkerFailure(failure.status, failure.errorCode, failure.safeError);
  }

  function findLocalRecord(records, recordId, expectedType = null) {
    const matches = records.filter((record) => record?.id === recordId);

    if (matches.length === 0) {
      throw new SyncWorkerFailure(
        "terminal_failure",
        "LOCAL_RECORD_MISSING",
        "The authoritative local record could not be found"
      );
    }

    const record = matches[0];
    const conflicting = matches.some(
      (candidate) => candidate?.contentDigest !== record?.contentDigest
    );

    if (conflicting) {
      throw new SyncWorkerFailure(
        "terminal_failure",
        "LOCAL_DIGEST_CONFLICT",
        "The authoritative ledger contains conflicting record digests"
      );
    }
    if (expectedType && record.recordType !== expectedType) {
      throw new SyncWorkerFailure(
        "terminal_failure",
        "LOCAL_REFERENCE_INVALID",
        "An authoritative record reference has the wrong type"
      );
    }

    return record;
  }

  async function projectRecord(item, records) {
    const record = findLocalRecord(records, item.recordId, item.recordType);

    if (
      record.clientEventId !== item.clientEventId
      || record.contentDigest !== item.contentDigest
    ) {
      throw new SyncWorkerFailure(
        "terminal_failure",
        "LOCAL_OUTBOX_CONFLICT",
        "The outbox identity does not match its authoritative record"
      );
    }

    if (record.recordType === "evaluation") {
      return {
        table: "decision_records",
        row: mapDecisionRecord(record, ownerUserId)
      };
    }

    const evaluation = findLocalRecord(records, record.evaluationId, "evaluation");
    const remoteDecisionId = await findRemoteDependency("decision_records", evaluation);

    if (record.recordType === "settlement") {
      return {
        table: "settlement_records",
        row: mapSettlementRecord(record, ownerUserId, remoteDecisionId, evaluation)
      };
    }

    if (record.recordType === "amendment") {
      const settlement = findLocalRecord(records, record.settlementId, "settlement");
      const remoteSettlementId = await findRemoteDependency("settlement_records", settlement);

      return {
        table: "record_amendments",
        row: mapAmendmentRecord(
          record,
          ownerUserId,
          remoteDecisionId,
          remoteSettlementId
        )
      };
    }

    throw new SyncWorkerFailure(
      "terminal_failure",
      "LOCAL_RECORD_TYPE_UNSUPPORTED",
      "The authoritative record type cannot be synchronized"
    );
  }

  function isDue(item, runAtMs) {
    if (item.state === "pending" || item.state === "in_flight") {
      return true;
    }

    return item.state === "retryable_failure"
      && (!item.nextAttemptAt || Date.parse(item.nextAttemptAt) <= runAtMs);
  }

  async function appendFinal(item, attempt, occurredAt, result) {
    const finalState = result.status === "synchronized" || result.status === "already_synchronized"
      ? "synchronized"
      : result.status;
    let nextAttemptAt = null;

    if (finalState === "retryable_failure") {
      nextAttemptAt = new Date(
        Date.parse(occurredAt) + calculateRetryDelay(attempt, item.clientEventId)
      ).toISOString();
    }

    await appendSyncEvent(eventFor(item, finalState, attempt, occurredAt, {
      nextAttemptAt,
      errorCode: finalState === "synchronized" ? null : result.errorCode,
      safeError: finalState === "synchronized" ? null : result.safeError
    }), {
      outboxPath: options.outboxPath,
      ledgerPath: options.ledgerPath
    });

    return finalState;
  }

  async function executeRun() {
    const runAt = nowIso();
    lastRunAt = runAt;

    if (!enabled || !configured) {
      return {
        status: "disabled",
        processed: 0,
        synchronized: 0,
        retryableFailures: 0,
        terminalFailures: 0,
        runAt
      };
    }

    const [outbox, ledger] = await Promise.all([
      readOutboxState({
        outboxPath: options.outboxPath,
        ledgerPath: options.ledgerPath
      }),
      readAuthoritativeLedger({ ledgerPath: options.ledgerPath })
    ]);
    const due = outbox.items
      .filter((item) => isDue(item, Date.parse(runAt)))
      .slice(0, batchSize);
    const summary = {
      status: "completed",
      processed: 0,
      synchronized: 0,
      retryableFailures: 0,
      terminalFailures: 0,
      runAt
    };

    for (const item of due) {
      const attempt = item.attempt + 1;
      await appendSyncEvent(eventFor(item, "in_flight", attempt, runAt), {
        outboxPath: options.outboxPath,
        ledgerPath: options.ledgerPath
      });

      let remoteResult;
      let projection = null;

      try {
        projection = await projectRecord(item, ledger.records);
      } catch (error) {
        if (error instanceof SyncWorkerFailure) {
          remoteResult = {
            status: error.state,
            errorCode: error.code,
            safeError: error.message
          };
        } else {
          remoteResult = {
            status: "terminal_failure",
            errorCode: "LOCAL_MAPPING_FAILED",
            safeError: safeErrorMessage(error) || "Local projection mapping failed"
          };
        }
      }

      if (projection) {
        try {
          remoteResult = normalizeRemoteFailure(
            await client.insertRecord(projection.table, projection.row)
          );

          if (
            remoteResult.status !== "retryable_failure"
            && remoteResult.status !== "terminal_failure"
          ) {
            remoteResult = {
              status: "synchronized",
              remoteId: remoteResult.remoteId,
              contentDigest: remoteResult.contentDigest
            };
          }
        } catch (_error) {
          remoteResult = {
            status: "retryable_failure",
            errorCode: "REMOTE_CLIENT_ERROR",
            safeError: "The remote projection client failed unexpectedly"
          };
        }
      }

      const finalState = await appendFinal(item, attempt, runAt, remoteResult);
      summary.processed += 1;

      if (finalState === "synchronized") {
        summary.synchronized += 1;
        lastSuccessAt = runAt;
        lastSafeError = null;
      } else if (finalState === "retryable_failure") {
        summary.retryableFailures += 1;
        lastSafeError = remoteResult.safeError;
      } else {
        summary.terminalFailures += 1;
        lastSafeError = remoteResult.safeError;
      }
    }

    return summary;
  }

  function runNow() {
    if (activeRun) {
      return activeRun;
    }

    activeRun = executeRun()
      .catch((error) => {
        lastSafeError = safeErrorMessage(error);
        return {
          status: "failed",
          processed: 0,
          synchronized: 0,
          retryableFailures: 0,
          terminalFailures: 0,
          runAt: lastRunAt,
          errorCode: "SYNC_WORKER_RUN_FAILED",
          safeError: lastSafeError
        };
      })
      .finally(() => {
        activeRun = null;
      });

    return activeRun;
  }

  function start() {
    if (started || !enabled || !configured) {
      return false;
    }

    started = true;
    timer = setIntervalImpl(() => {
      void runNow();
    }, pollIntervalMs);
    void runNow();

    return true;
  }

  async function stop() {
    started = false;

    if (timer !== null) {
      clearIntervalImpl(timer);
      timer = null;
    }

    if (activeRun) {
      await activeRun;
    }
  }

  async function getStatus() {
    const outbox = await readOutboxState({
      outboxPath: options.outboxPath,
      ledgerPath: options.ledgerPath
    });
    const oldestPendingAgeMs = outbox.summary.oldestPendingAt
      ? Math.max(0, Date.parse(nowIso()) - Date.parse(outbox.summary.oldestPendingAt))
      : null;

    return {
      provider: "supabase",
      configured: Boolean(configured),
      enabled: Boolean(enabled && configured),
      started,
      running: Boolean(activeRun),
      pending: outbox.pending.length,
      retryableFailures: outbox.summary.retryableFailures,
      terminalFailures: outbox.summary.terminalFailures,
      synchronized: outbox.summary.synchronized,
      oldestPendingAgeMs,
      lastRunAt,
      lastSuccessAt,
      lastSafeError,
      integrityIssues: outbox.malformedLines.length + outbox.invalidEvents.length,
      secretReturned: false
    };
  }

  return Object.freeze({
    getStatus,
    runNow,
    start,
    stop
  });
}

module.exports = {
  DEFAULT_BATCH_SIZE,
  DEFAULT_POLL_INTERVAL_MS,
  calculateRetryDelay,
  createSyncWorker
};
