const fs = require("node:fs/promises");
const path = require("node:path");

function normalizeApiKey(apiKey) {
  return String(apiKey ?? "").trim();
}

function validateApiKey(apiKey, options = {}) {
  const normalized = normalizeApiKey(apiKey);
  const label = options.label ?? "API key";
  const placeholderPattern = options.placeholderPattern ?? /^(your_|YOUR_|placeholder|null|undefined|changeme|change_me)/;

  if (!normalized) {
    throw new Error(`${label} is required.`);
  }

  if (normalized.length < 8) {
    throw new Error(`${label} is too short to be valid.`);
  }

  if (/\s/.test(normalized)) {
    throw new Error(`${label} cannot contain whitespace.`);
  }

  if (placeholderPattern.test(normalized)) {
    throw new Error(`${label} looks like a placeholder.`);
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

function upsertEnvValue(contents, key, value, options = {}) {
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

    output.push(options.comment ?? `# ${key} is managed by the Bear Edge local provider setup.`);
    output.push(`${key}=${value}`);
  }

  return `${output.join("\n")}\n`;
}

module.exports = {
  normalizeApiKey,
  readEnvFile,
  resolveEnvPath,
  upsertEnvValue,
  validateApiKey
};
