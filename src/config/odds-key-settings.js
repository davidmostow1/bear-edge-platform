const { resolveOddsApiKey } = require("../live/odds-api.js");
const fs = require("node:fs/promises");
const path = require("node:path");
const {
  readEnvFile,
  resolveEnvPath,
  upsertEnvValue,
  validateApiKey
} = require("./key-settings-utils.js");

const ODDS_ENV_KEY = "THE_ODDS_API_KEY";
const ODDS_API_PROVIDER = "The Odds API";
const ODDS_API_DOCS_URL = "https://the-odds-api.com/liveapi/guides/v4/";
const ODDS_API_SIGNUP_URL = "https://the-odds-api.com/";

function validateOddsApiKey(apiKey) {
  return validateApiKey(apiKey, {
    label: "Odds API key",
    placeholderPattern: /^(your_|YOUR_|placeholder|null|undefined)/
  });
}

async function saveOddsApiKey(apiKey, options = {}) {
  const normalized = validateOddsApiKey(apiKey);
  const envPath = resolveEnvPath(options);
  const existing = await readEnvFile(envPath);
  const next = upsertEnvValue(existing, ODDS_ENV_KEY, normalized, {
    comment: "# Enables sportsbook odds ingestion through The Odds API."
  });

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
