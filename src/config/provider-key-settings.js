const fs = require("node:fs/promises");
const path = require("node:path");

const { fetchOddsApiSports } = require("../live/odds-api.js");
const { PROVIDER_REQUIREMENTS, getProviderSetupStatus } = require("./provider-requirements.js");
const { safeErrorMessage } = require("./secrets.js");

function normalizeApiKey(apiKey) {
  return String(apiKey ?? "").trim();
}

function validateProviderApiKey(apiKey) {
  const normalized = normalizeApiKey(apiKey);

  if (!normalized) {
    throw new Error("Provider API key is required.");
  }

  if (normalized.length < 8) {
    throw new Error("Provider API key is too short to be valid.");
  }

  if (/\s/.test(normalized)) {
    throw new Error("Provider API key cannot contain whitespace.");
  }

  if (/^(your_|YOUR_|placeholder|null|undefined|changeme|change_me)/.test(normalized)) {
    throw new Error("Provider API key looks like a placeholder.");
  }

  return normalized;
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

    output.push(`# ${key} is managed by the Bear Edge local provider setup.`);
    output.push(`${key}=${value}`);
  }

  return `${output.join("\n")}\n`;
}

async function verifyProviderKey(provider, apiKey, options = {}) {
  if (provider.id !== "the-odds-api") {
    return {
      status: "saved_unverified",
      mode: provider.verificationMode ?? "saved",
      message: `${provider.name} key was saved locally. Live verification is not wired for this provider yet.`
    };
  }

  const verification = await fetchOddsApiSports({
    fetchJsonImpl: options.fetchJsonImpl,
    oddsApiKey: apiKey
  });

  return {
    status: verification.status,
    mode: "live",
    sports: verification.sports.length,
    sample: verification.sports.slice(0, 5).map((sport) => ({
      key: sport.key,
      title: sport.title,
      active: sport.active
    }))
  };
}

async function saveProviderApiKey(input, options = {}) {
  const provider = providerForId(String(input?.providerId ?? ""));
  const envKey = writableEnvKeyFor(provider, input?.envKey);
  const normalized = validateProviderApiKey(input?.apiKey);
  const previousValue = process.env[envKey];

  process.env[envKey] = normalized;

  let verification;

  try {
    verification = await verifyProviderKey(provider, normalized, options);
  } catch (error) {
    const message = safeErrorMessage(error);

    if (previousValue === undefined) {
      delete process.env[envKey];
    } else {
      process.env[envKey] = previousValue;
    }

    throw new Error(message);
  }

  const envPath = resolveEnvPath(options);
  const existing = await readEnvFile(envPath);
  const next = upsertEnvValue(existing, envKey, normalized);

  await fs.mkdir(path.dirname(envPath), { recursive: true });
  await fs.writeFile(envPath, next, { mode: 0o600 });
  await fs.chmod(envPath, 0o600).catch(() => undefined);

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
    providerSetup: getProviderSetupStatus({ rootDir: options.rootDir ?? path.resolve(__dirname, "../..") })
  };
}

module.exports = {
  saveProviderApiKey,
  upsertEnvValue,
  validateProviderApiKey,
  verifyProviderKey
};
