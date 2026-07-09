const fs = require("node:fs/promises");
const path = require("node:path");

const { resolveOddsApiKey } = require("../live/odds-api.js");

const ODDS_ENV_KEY = "THE_ODDS_API_KEY";
const ODDS_API_PROVIDER = "The Odds API";
const ODDS_API_DOCS_URL = "https://the-odds-api.com/liveapi/guides/v4/";
const ODDS_API_SIGNUP_URL = "https://the-odds-api.com/";

function normalizeApiKey(apiKey) {
  return String(apiKey ?? "").trim();
}

function validateOddsApiKey(apiKey) {
  const normalized = normalizeApiKey(apiKey);

  if (!normalized) {
    throw new Error("Odds API key is required.");
  }

  if (normalized.length < 8) {
    throw new Error("Odds API key is too short to be valid.");
  }

  if (/\s/.test(normalized)) {
    throw new Error("Odds API key cannot contain whitespace.");
  }

  if (/^(your_|YOUR_|placeholder|null|undefined)/.test(normalized)) {
    throw new Error("Odds API key looks like a placeholder.");
  }

  return normalized;
}

function resolveEnvPath(options = {}) {
  const rootDir = path.resolve(options.rootDir ?? path.resolve(__dirname, "../.."));
  return path.resolve(options.envPath ?? path.join(rootDir, ".env.local"));
}

async function readEnvFile(filePath) {
  try {
    return await fs.readFile(filePath, "utf8");
  } catch (error) {
    if (error.code === "ENOENT") {
      return "";
    }

    throw error;
  }
}

function upsertEnvValue(contents, key, value) {
  const lines = String(contents ?? "").split(/\r?\n/);
  let replaced = false;
  const output = [];

  for (const line of lines) {
    if (new RegExp(`^\\s*${key}\\s*=`).test(line)) {
      if (!replaced) {
        output.push(`${key}=${value}`);
        replaced = true;
      }
      continue;
    }

    output.push(line);
  }

  while (output.length > 0 && output[output.length - 1] === "") {
    output.pop();
  }

  if (!replaced) {
    if (output.length > 0) {
      output.push("");
    }

    output.push("# Enables sportsbook odds ingestion through The Odds API.");
    output.push(`${key}=${value}`);
  }

  return `${output.join("\n")}\n`;
}

async function saveOddsApiKey(apiKey, options = {}) {
  const normalized = validateOddsApiKey(apiKey);
  const envPath = resolveEnvPath(options);
  const existing = await readEnvFile(envPath);
  const next = upsertEnvValue(existing, ODDS_ENV_KEY, normalized);

  await fs.mkdir(path.dirname(envPath), { recursive: true });
  await fs.writeFile(envPath, next, { mode: 0o600 });
  await fs.chmod(envPath, 0o600).catch(() => undefined);

  process.env[ODDS_ENV_KEY] = normalized;

  return {
    configured: true,
    envKey: ODDS_ENV_KEY,
    envFile: path.basename(envPath),
    provider: ODDS_API_PROVIDER
  };
}

function getOddsKeyStatus() {
  const configuredKeyName = process.env.THE_ODDS_API_KEY
    ? "THE_ODDS_API_KEY"
    : process.env.ODDS_API_KEY
      ? "ODDS_API_KEY"
      : null;

  return {
    configured: Boolean(resolveOddsApiKey()),
    envKey: configuredKeyName,
    writableEnvKey: ODDS_ENV_KEY,
    envFile: ".env.local",
    provider: ODDS_API_PROVIDER,
    docsUrl: ODDS_API_DOCS_URL,
    signupUrl: ODDS_API_SIGNUP_URL,
    secretReturned: false
  };
}

module.exports = {
  ODDS_API_DOCS_URL,
  ODDS_API_PROVIDER,
  ODDS_API_SIGNUP_URL,
  ODDS_ENV_KEY,
  getOddsKeyStatus,
  saveOddsApiKey,
  upsertEnvValue,
  validateOddsApiKey
};
