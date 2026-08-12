const test = require("node:test");
const assert = require("node:assert/strict");

const {
  getSupabaseSyncStatus
} = require("../src/config/supabase-settings.js");
const {
  createSupabaseClient
} = require("../src/sync/supabase-client.js");
const { redactSecrets } = require("../src/config/secrets.js");

const SUPABASE_URL = "https://project-ref.supabase.co";
const SERVICE_ROLE_KEY = "service-role-secret-value";
const OWNER_USER_ID = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const CLIENT_EVENT_ID = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";
const CONTENT_DIGEST = "a".repeat(64);

function response(status, body, statusText = "") {
  return {
    ok: status >= 200 && status < 300,
    status,
    statusText,
    json: async () => body,
    text: async () => typeof body === "string" ? body : JSON.stringify(body)
  };
}

function decisionRow(overrides = {}) {
  return {
    user_id: OWNER_USER_ID,
    client_event_id: CLIENT_EVENT_ID,
    content_digest: CONTENT_DIGEST,
    verdict: "WAIT",
    ...overrides
  };
}

test("Supabase status reports missing configuration without returning values", () => {
  const status = getSupabaseSyncStatus({
    SUPABASE_URL: "",
    SUPABASE_SERVICE_ROLE_KEY: "",
    SUPABASE_OWNER_USER_ID: ""
  });

  assert.deepEqual(status, {
    configured: false,
    provider: "supabase",
    missing: [
      "SUPABASE_URL",
      "SUPABASE_SERVICE_ROLE_KEY",
      "SUPABASE_OWNER_USER_ID",
      "SUPABASE_AUDIT_SCHEMA_VERSION"
    ],
    requiredAuditSchemaVersion: "2.1.0",
    schemaCompatible: false,
    secretReturned: false
  });
});

test("Supabase status reports complete configuration without leaking the service key", () => {
  const env = {
    SUPABASE_URL,
    SUPABASE_SERVICE_ROLE_KEY: SERVICE_ROLE_KEY,
    SUPABASE_OWNER_USER_ID: OWNER_USER_ID,
    SUPABASE_AUDIT_SCHEMA_VERSION: "2.1.0"
  };
  const status = getSupabaseSyncStatus(env);

  assert.equal(status.configured, true);
  assert.deepEqual(status.missing, []);
  assert.equal(status.schemaCompatible, true);
  assert.equal(status.secretReturned, false);
  assert.equal(JSON.stringify(status).includes(SERVICE_ROLE_KEY), false);
  assert.equal(JSON.stringify(status).includes(SUPABASE_URL), false);
  assert.equal(JSON.stringify(status).includes(OWNER_USER_ID), false);
});

test("Supabase status blocks configured credentials when live v2.1 support is not attested", () => {
  const status = getSupabaseSyncStatus({
    SUPABASE_URL,
    SUPABASE_SERVICE_ROLE_KEY: SERVICE_ROLE_KEY,
    SUPABASE_OWNER_USER_ID: OWNER_USER_ID,
    SUPABASE_AUDIT_SCHEMA_VERSION: "2.0.0"
  });

  assert.equal(status.configured, false);
  assert.equal(status.schemaCompatible, false);
  assert.deepEqual(status.missing, []);
});

test("Supabase service-role values are redacted by shared error handling", () => {
  const previous = process.env.SUPABASE_SERVICE_ROLE_KEY;
  process.env.SUPABASE_SERVICE_ROLE_KEY = SERVICE_ROLE_KEY;

  try {
    const redacted = redactSecrets(`Authorization: Bearer ${SERVICE_ROLE_KEY}; key=${SERVICE_ROLE_KEY}`);
    assert.equal(redacted.includes(SERVICE_ROLE_KEY), false);
    assert.match(redacted, /\[REDACTED\]/);
  } finally {
    if (previous === undefined) {
      delete process.env.SUPABASE_SERVICE_ROLE_KEY;
    } else {
      process.env.SUPABASE_SERVICE_ROLE_KEY = previous;
    }
  }
});

test("insertRecord sends the required server-side REST headers", async () => {
  const calls = [];
  const fetchImpl = async (url, options) => {
    calls.push({ url, options });
    return response(201, [{ id: "remote-id", content_digest: CONTENT_DIGEST }]);
  };
  const client = createSupabaseClient({
    auditSchemaVersion: "2.1.0",
    supabaseUrl: SUPABASE_URL,
    serviceRoleKey: SERVICE_ROLE_KEY,
    ownerUserId: OWNER_USER_ID,
    fetchImpl
  });

  const result = await client.insertRecord("decision_records", decisionRow());

  assert.equal(result.status, "synchronized");
  assert.equal(result.remoteId, "remote-id");
  assert.equal(calls.length, 1);
  assert.equal(calls[0].url, `${SUPABASE_URL}/rest/v1/decision_records?on_conflict=user_id%2Cclient_event_id`);
  assert.equal(calls[0].options.method, "POST");
  assert.equal(calls[0].options.headers.apikey, SERVICE_ROLE_KEY);
  assert.equal(calls[0].options.headers.authorization, `Bearer ${SERVICE_ROLE_KEY}`);
  assert.equal(calls[0].options.headers["content-type"], "application/json");
  assert.equal(
    calls[0].options.headers.Prefer,
    "resolution=ignore-duplicates,return=representation"
  );
  assert.deepEqual(JSON.parse(calls[0].options.body), decisionRow());
  assert.ok(calls[0].options.signal);
});

test("an ignored duplicate with a matching digest is already synchronized", async () => {
  const calls = [];
  const fetchImpl = async (url, options) => {
    calls.push({ url, options });

    if (options.method === "POST") {
      return response(201, []);
    }

    return response(200, [{
      id: "remote-id",
      client_event_id: CLIENT_EVENT_ID,
      content_digest: CONTENT_DIGEST
    }]);
  };
  const client = createSupabaseClient({
    auditSchemaVersion: "2.1.0",
    supabaseUrl: SUPABASE_URL,
    serviceRoleKey: SERVICE_ROLE_KEY,
    ownerUserId: OWNER_USER_ID,
    fetchImpl
  });

  const result = await client.insertRecord("decision_records", decisionRow());

  assert.deepEqual(result, {
    status: "already_synchronized",
    remoteId: "remote-id",
    contentDigest: CONTENT_DIGEST
  });
  assert.equal(calls.length, 2);
  assert.match(calls[1].url, /user_id=eq\.aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa/);
  assert.match(calls[1].url, /client_event_id=eq\.bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb/);
  assert.match(calls[1].url, /select=id%2Cclient_event_id%2Ccontent_digest/);
  assert.equal(calls[1].options.method, "GET");
});

test("an ignored duplicate with a different digest is a terminal conflict", async () => {
  const fetchImpl = async (_url, options) => {
    if (options.method === "POST") {
      return response(201, []);
    }

    return response(200, [{
      id: "remote-id",
      client_event_id: CLIENT_EVENT_ID,
      content_digest: "f".repeat(64)
    }]);
  };
  const client = createSupabaseClient({
    auditSchemaVersion: "2.1.0",
    supabaseUrl: SUPABASE_URL,
    serviceRoleKey: SERVICE_ROLE_KEY,
    ownerUserId: OWNER_USER_ID,
    fetchImpl
  });

  const result = await client.insertRecord("decision_records", decisionRow());

  assert.equal(result.status, "terminal_failure");
  assert.equal(result.errorCode, "REMOTE_DIGEST_CONFLICT");
  assert.equal(JSON.stringify(result).includes("f".repeat(64)), false);
});

test("timeouts and service failures are retryable without leaking secrets", async () => {
  const timeoutFetch = async () => {
    throw Object.assign(new Error(`timeout ${SERVICE_ROLE_KEY}`), { name: "AbortError" });
  };
  const unavailableFetch = async () => response(503, { message: SERVICE_ROLE_KEY }, "Unavailable");
  const timeoutClient = createSupabaseClient({
    auditSchemaVersion: "2.1.0",
    supabaseUrl: SUPABASE_URL,
    serviceRoleKey: SERVICE_ROLE_KEY,
    ownerUserId: OWNER_USER_ID,
    fetchImpl: timeoutFetch
  });
  const unavailableClient = createSupabaseClient({
    auditSchemaVersion: "2.1.0",
    supabaseUrl: SUPABASE_URL,
    serviceRoleKey: SERVICE_ROLE_KEY,
    ownerUserId: OWNER_USER_ID,
    fetchImpl: unavailableFetch
  });

  const timeout = await timeoutClient.insertRecord("decision_records", decisionRow());
  const unavailable = await unavailableClient.insertRecord("decision_records", decisionRow());

  assert.equal(timeout.status, "retryable_failure");
  assert.equal(timeout.errorCode, "REMOTE_TIMEOUT");
  assert.equal(unavailable.status, "retryable_failure");
  assert.equal(unavailable.errorCode, "REMOTE_UNAVAILABLE");
  assert.equal(JSON.stringify([timeout, unavailable]).includes(SERVICE_ROLE_KEY), false);
});

test("authentication and schema rejections are terminal and body-safe", async () => {
  const authClient = createSupabaseClient({
    auditSchemaVersion: "2.1.0",
    supabaseUrl: SUPABASE_URL,
    serviceRoleKey: SERVICE_ROLE_KEY,
    ownerUserId: OWNER_USER_ID,
    fetchImpl: async () => response(401, { message: SERVICE_ROLE_KEY }, "Unauthorized")
  });
  const schemaClient = createSupabaseClient({
    auditSchemaVersion: "2.1.0",
    supabaseUrl: SUPABASE_URL,
    serviceRoleKey: SERVICE_ROLE_KEY,
    ownerUserId: OWNER_USER_ID,
    fetchImpl: async () => response(400, { details: SERVICE_ROLE_KEY }, "Bad Request")
  });

  const auth = await authClient.insertRecord("decision_records", decisionRow());
  const schema = await schemaClient.insertRecord("decision_records", decisionRow());

  assert.equal(auth.status, "terminal_failure");
  assert.equal(auth.errorCode, "REMOTE_AUTH_REJECTED");
  assert.equal(schema.status, "terminal_failure");
  assert.equal(schema.errorCode, "REMOTE_SCHEMA_REJECTED");
  assert.equal(JSON.stringify([auth, schema]).includes(SERVICE_ROLE_KEY), false);
});

test("client rejects unknown tables and rows outside the configured owner", async () => {
  const client = createSupabaseClient({
    auditSchemaVersion: "2.1.0",
    supabaseUrl: SUPABASE_URL,
    serviceRoleKey: SERVICE_ROLE_KEY,
    ownerUserId: OWNER_USER_ID,
    fetchImpl: async () => response(201, [])
  });

  await assert.rejects(
    client.insertRecord("unknown_table", decisionRow()),
    /unsupported Supabase projection table/i
  );
  await assert.rejects(
    client.insertRecord("decision_records", decisionRow({
      user_id: "cccccccc-cccc-4ccc-8ccc-cccccccccccc"
    })),
    /configured owner/i
  );
});
