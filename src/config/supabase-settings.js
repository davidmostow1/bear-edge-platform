const { safeErrorMessage } = require("./secrets.js");

const REQUIRED_ENV_KEYS = Object.freeze([
  "SUPABASE_URL",
  "SUPABASE_SERVICE_ROLE_KEY",
  "SUPABASE_OWNER_USER_ID",
  "SUPABASE_AUDIT_SCHEMA_VERSION"
]);
const REQUIRED_AUDIT_SCHEMA_VERSION = "2.1.0";

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function hasValue(value) {
  return typeof value === "string" && value.trim().length > 0;
}

function getSupabaseSyncStatus(env = process.env) {
  const missing = REQUIRED_ENV_KEYS.filter((key) => !hasValue(env[key]));
  const schemaCompatible = env.SUPABASE_AUDIT_SCHEMA_VERSION === REQUIRED_AUDIT_SCHEMA_VERSION;

  return {
    configured: missing.length === 0 && schemaCompatible,
    provider: "supabase",
    missing,
    requiredAuditSchemaVersion: REQUIRED_AUDIT_SCHEMA_VERSION,
    schemaCompatible,
    secretReturned: false
  };
}

function normalizeSupabaseUrl(value) {
  let parsed;

  try {
    parsed = new URL(value);
  } catch (error) {
    throw new Error(`SUPABASE_URL must be a valid HTTPS URL: ${safeErrorMessage(error)}`);
  }

  if (
    parsed.protocol !== "https:"
    || parsed.username
    || parsed.password
    || parsed.search
    || parsed.hash
  ) {
    throw new Error("SUPABASE_URL must be a credential-free HTTPS origin");
  }

  return parsed.href.replace(/\/$/, "");
}

function resolveSupabaseSettings(options = {}) {
  const env = options.env || process.env;
  const supabaseUrl = options.supabaseUrl || env.SUPABASE_URL;
  const serviceRoleKey = options.serviceRoleKey || env.SUPABASE_SERVICE_ROLE_KEY;
  const ownerUserId = options.ownerUserId || env.SUPABASE_OWNER_USER_ID;
  const auditSchemaVersion = options.auditSchemaVersion || env.SUPABASE_AUDIT_SCHEMA_VERSION;

  const missing = [];
  if (!hasValue(supabaseUrl)) missing.push("SUPABASE_URL");
  if (!hasValue(serviceRoleKey)) missing.push("SUPABASE_SERVICE_ROLE_KEY");
  if (!hasValue(ownerUserId)) missing.push("SUPABASE_OWNER_USER_ID");
  if (!hasValue(auditSchemaVersion)) missing.push("SUPABASE_AUDIT_SCHEMA_VERSION");

  if (missing.length > 0) {
    throw new Error(`Supabase synchronization is not configured; missing ${missing.join(", ")}`);
  }

  if (!UUID_PATTERN.test(ownerUserId)) {
    throw new Error("SUPABASE_OWNER_USER_ID must be a UUID");
  }
  if (auditSchemaVersion !== REQUIRED_AUDIT_SCHEMA_VERSION) {
    throw new Error(
      `SUPABASE_AUDIT_SCHEMA_VERSION must equal ${REQUIRED_AUDIT_SCHEMA_VERSION}; `
      + "verify the v2.1 migration on the live project before enabling synchronization"
    );
  }

  return Object.freeze({
    auditSchemaVersion,
    supabaseUrl: normalizeSupabaseUrl(supabaseUrl),
    serviceRoleKey,
    ownerUserId: ownerUserId.toLowerCase()
  });
}

module.exports = {
  REQUIRED_ENV_KEYS,
  REQUIRED_AUDIT_SCHEMA_VERSION,
  UUID_PATTERN,
  getSupabaseSyncStatus,
  resolveSupabaseSettings
};
