const { safeErrorMessage } = require("./secrets.js");

const REQUIRED_ENV_KEYS = Object.freeze([
  "SUPABASE_URL",
  "SUPABASE_SERVICE_ROLE_KEY",
  "SUPABASE_OWNER_USER_ID"
]);

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function hasValue(value) {
  return typeof value === "string" && value.trim().length > 0;
}

function getSupabaseSyncStatus(env = process.env) {
  const missing = REQUIRED_ENV_KEYS.filter((key) => !hasValue(env[key]));

  return {
    configured: missing.length === 0,
    provider: "supabase",
    missing,
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

  const missing = [];
  if (!hasValue(supabaseUrl)) missing.push("SUPABASE_URL");
  if (!hasValue(serviceRoleKey)) missing.push("SUPABASE_SERVICE_ROLE_KEY");
  if (!hasValue(ownerUserId)) missing.push("SUPABASE_OWNER_USER_ID");

  if (missing.length > 0) {
    throw new Error(`Supabase synchronization is not configured; missing ${missing.join(", ")}`);
  }

  if (!UUID_PATTERN.test(ownerUserId)) {
    throw new Error("SUPABASE_OWNER_USER_ID must be a UUID");
  }

  return Object.freeze({
    supabaseUrl: normalizeSupabaseUrl(supabaseUrl),
    serviceRoleKey,
    ownerUserId: ownerUserId.toLowerCase()
  });
}

module.exports = {
  REQUIRED_ENV_KEYS,
  UUID_PATTERN,
  getSupabaseSyncStatus,
  resolveSupabaseSettings
};
