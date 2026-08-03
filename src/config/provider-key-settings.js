const fs = require("node:fs/promises");
const path = require("node:path");

const { verifyOddsApiReadiness } = require("../live/odds-api.js");
const { PROVIDER_REQUIREMENTS, getProviderSetupStatus } = require("./provider-requirements.js");
const {
  readEnvFile,
  resolveEnvPath,
  upsertEnvValue,
  validateApiKey
} = require("./key-settings-utils.js");
const { safeErrorMessage } = require("./secrets.js");

function validateProviderApiKey(apiKey) {
  return validateApiKey(apiKey, { label: "Provider API key" });
}

function providerForId(providerId) {
  const provider = PROVIDER_REQUIREMENTS.find((entry) => entry.id === providerId);

  if (!provider) {
    throw new Error(`Unknown provider: ${providerId}`);
  }

  return provider;
}

function writableEnvKeyFor(provider, requestedEnvKey) {
  const envKey = String(requestedEnvKey ?? provider.writableEnvKey ?? provider.envKeys[0] ?? "").trim();

  if (!provider.envKeys.includes(envKey)) {
    throw new Error(`${envKey || "Env key"} is not allowed for ${provider.name}.`);
  }

  return envKey;
}

async function verifyProviderKey(provider, apiKey, options = {}) {
  if (provider.id !== "the-odds-api") {
    return {
      status: "saved_unverified",
      mode: provider.verificationMode ?? "saved",
      message: `${provider.name} key was saved locally. Live verification is not wired for this provider yet.`
    };
  }

  return verifyOddsApiReadiness({
    fetchJsonImpl: options.fetchJsonImpl,
    oddsApiKey: apiKey
  });
}

async function saveProviderApiKey(input, options = {}) {
  const provider = providerForId(String(input?.providerId ?? ""));
  const envKey = writableEnvKeyFor(provider, input?.envKey);
  const normalized = validateProviderApiKey(input?.apiKey);

  let verification;

  try {
    verification = await verifyProviderKey(provider, normalized, options);

    if (
      provider.id === "the-odds-api" &&
      (!("authenticated" in verification) || verification.authenticated !== true)
    ) {
      throw new Error(verification.message);
    }
  } catch (error) {
    const message = safeErrorMessage(error, [normalized]);
    throw new Error(message);
  }

  const envPath = resolveEnvPath(options);
  const existing = await readEnvFile(envPath);
  const next = upsertEnvValue(existing, envKey, normalized);

  await fs.mkdir(path.dirname(envPath), { recursive: true });
  await fs.writeFile(envPath, next, { mode: 0o600 });
  await fs.chmod(envPath, 0o600).catch(() => undefined);

  // A key is activated only after its durable local write succeeds.
  process.env[envKey] = normalized;

  return {
    configured: true,
    envKey,
    envFile: path.basename(envPath),
    provider: {
      id: provider.id,
      name: provider.name,
      tier: provider.tier
    },
    secretReturned: false,
    verification,
    providerSetup: getProviderSetupStatus({
      rootDir: options.rootDir ?? path.resolve(__dirname, "../.."),
      providerReadiness: {
        [provider.id]: {
          status: verification.status,
          usableNow: (
            provider.id === "the-odds-api" &&
            "marketAccess" in verification &&
            verification.marketAccess === true
          )
        }
      }
    })
  };
}

module.exports = {
  saveProviderApiKey,
  upsertEnvValue,
  validateProviderApiKey,
  verifyProviderKey
};
