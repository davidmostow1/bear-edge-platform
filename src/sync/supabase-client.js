const {
  UUID_PATTERN,
  resolveSupabaseSettings
} = require("../config/supabase-settings.js");

const ALLOWED_TABLES = new Set([
  "decision_records",
  "settlement_records",
  "record_amendments",
  "prediction_outcomes",
  "closing_prices"
]);
const DIGEST_PATTERN = /^[a-f0-9]{64}$/;

function validateTable(table) {
  if (!ALLOWED_TABLES.has(table)) {
    throw new Error(`Unsupported Supabase projection table: ${String(table)}`);
  }
}

function validateIdentity(ownerUserId, clientEventId) {
  if (!UUID_PATTERN.test(ownerUserId) || !UUID_PATTERN.test(clientEventId)) {
    throw new Error("Supabase projection identifiers must be UUIDs");
  }
}

function stableFailure(status, errorCode, safeError) {
  return { status, errorCode, safeError };
}

function classifyHttpFailure(status) {
  if (status === 401 || status === 403) {
    return stableFailure(
      "terminal_failure",
      "REMOTE_AUTH_REJECTED",
      "Supabase rejected server-side authentication"
    );
  }

  if (status === 408 || status === 425 || status === 429 || status >= 500) {
    return stableFailure(
      "retryable_failure",
      status === 503 ? "REMOTE_UNAVAILABLE" : "REMOTE_HTTP_RETRYABLE",
      "Supabase is temporarily unavailable"
    );
  }

  return stableFailure(
    "terminal_failure",
    "REMOTE_SCHEMA_REJECTED",
    "Supabase rejected the projection payload"
  );
}

async function readJson(response) {
  try {
    return await response.json();
  } catch (_error) {
    return null;
  }
}

function createSupabaseClient(options = {}) {
  const settings = resolveSupabaseSettings(options);
  const fetchImpl = options.fetchImpl || globalThis.fetch;
  const timeoutMs = options.timeoutMs ?? 10_000;

  if (typeof fetchImpl !== "function") {
    throw new Error("A fetch implementation is required for Supabase synchronization");
  }
  if (!Number.isInteger(timeoutMs) || timeoutMs < 1 || timeoutMs > 120_000) {
    throw new Error("Supabase timeoutMs must be an integer from 1 through 120000");
  }

  const headers = Object.freeze({
    apikey: settings.serviceRoleKey,
    authorization: `Bearer ${settings.serviceRoleKey}`,
    "content-type": "application/json"
  });

  async function request(url, requestOptions) {
    try {
      return await fetchImpl(url, {
        ...requestOptions,
        signal: AbortSignal.timeout(timeoutMs)
      });
    } catch (error) {
      if (error && error.name === "AbortError") {
        return stableFailure(
          "retryable_failure",
          "REMOTE_TIMEOUT",
          "Supabase synchronization timed out"
        );
      }

      return stableFailure(
        "retryable_failure",
        "NETWORK_ERROR",
        "Supabase could not be reached"
      );
    }
  }

  async function findByClientEventId(table, ownerUserId, clientEventId) {
    validateTable(table);
    validateIdentity(ownerUserId, clientEventId);

    if (ownerUserId.toLowerCase() !== settings.ownerUserId) {
      throw new Error("Projection row does not belong to the configured owner");
    }

    const url = new URL(`${settings.supabaseUrl}/rest/v1/${table}`);
    url.searchParams.set("user_id", `eq.${ownerUserId.toLowerCase()}`);
    url.searchParams.set("client_event_id", `eq.${clientEventId.toLowerCase()}`);
    url.searchParams.set("select", "id,client_event_id,content_digest");
    url.searchParams.set("limit", "1");

    const response = await request(url.href, {
      method: "GET",
      headers
    });

    if (!response || typeof response.ok !== "boolean") {
      return response;
    }
    if (!response.ok) {
      return classifyHttpFailure(response.status);
    }

    const body = await readJson(response);
    const row = Array.isArray(body) ? body[0] : null;

    if (!row) {
      return { status: "not_found" };
    }

    if (
      typeof row.id !== "string"
      || row.client_event_id !== clientEventId.toLowerCase()
      || !DIGEST_PATTERN.test(row.content_digest)
    ) {
      return stableFailure(
        "terminal_failure",
        "REMOTE_RESPONSE_INVALID",
        "Supabase returned an invalid projection identity"
      );
    }

    return {
      status: "found",
      remoteId: row.id,
      contentDigest: row.content_digest
    };
  }

  async function verifyExisting(table, row) {
    const existing = await findByClientEventId(table, row.user_id, row.client_event_id);

    if (existing.status === "found" && existing.contentDigest === row.content_digest) {
      return {
        status: "already_synchronized",
        remoteId: existing.remoteId,
        contentDigest: existing.contentDigest
      };
    }

    if (existing.status === "found") {
      return stableFailure(
        "terminal_failure",
        "REMOTE_DIGEST_CONFLICT",
        "Supabase contains a different record for this client event"
      );
    }

    if (existing.status === "not_found") {
      return stableFailure(
        "terminal_failure",
        "REMOTE_DUPLICATE_UNRESOLVED",
        "Supabase ignored the insert but no matching record was found"
      );
    }

    return existing;
  }

  async function insertRecord(table, row) {
    validateTable(table);

    if (!row || typeof row !== "object" || Array.isArray(row)) {
      throw new Error("Supabase projection row must be an object");
    }
    validateIdentity(row.user_id, row.client_event_id);
    if (row.user_id.toLowerCase() !== settings.ownerUserId) {
      throw new Error("Projection row does not belong to the configured owner");
    }
    if (!DIGEST_PATTERN.test(row.content_digest)) {
      throw new Error("Projection row content_digest must be a lowercase SHA-256 digest");
    }

    const url = new URL(`${settings.supabaseUrl}/rest/v1/${table}`);
    url.searchParams.set("on_conflict", "user_id,client_event_id");
    const response = await request(url.href, {
      method: "POST",
      headers: {
        ...headers,
        Prefer: "resolution=ignore-duplicates,return=representation"
      },
      body: JSON.stringify(row)
    });

    if (!response || typeof response.ok !== "boolean") {
      return response;
    }
    if (response.status === 409) {
      return verifyExisting(table, row);
    }
    if (!response.ok) {
      return classifyHttpFailure(response.status);
    }

    const body = await readJson(response);
    const inserted = Array.isArray(body) ? body[0] : null;

    if (!inserted) {
      return verifyExisting(table, row);
    }
    if (typeof inserted.id !== "string") {
      return stableFailure(
        "terminal_failure",
        "REMOTE_RESPONSE_INVALID",
        "Supabase returned an invalid insert response"
      );
    }
    if (inserted.content_digest && inserted.content_digest !== row.content_digest) {
      return stableFailure(
        "terminal_failure",
        "REMOTE_DIGEST_CONFLICT",
        "Supabase returned a conflicting content digest"
      );
    }

    return {
      status: "synchronized",
      remoteId: inserted.id,
      contentDigest: row.content_digest
    };
  }

  return Object.freeze({
    findByClientEventId,
    insertRecord
  });
}

module.exports = {
  ALLOWED_TABLES,
  createSupabaseClient
};
