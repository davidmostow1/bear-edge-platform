const fs = require("node:fs");
const path = require("node:path");

function unquoteEnvValue(value) {
  const trimmed = value.trim();
  const quote = trimmed[0];

  if ((quote === "\"" || quote === "'") && trimmed.endsWith(quote)) {
    return trimmed.slice(1, -1);
  }

  return trimmed;
}

function parseEnv(contents) {
  const parsed = {};

  for (const rawLine of String(contents ?? "").split(/\r?\n/)) {
    const line = rawLine.trim();

    if (!line || line.startsWith("#")) {
      continue;
    }

    const match = /^([A-Za-z_][A-Za-z0-9_]*)=(.*)$/.exec(line);

    if (!match) {
      continue;
    }

    const [, key, value] = match;
    parsed[key] = unquoteEnvValue(value);
  }

  return parsed;
}

function loadEnvFiles(options = {}) {
  const rootDir = path.resolve(options.rootDir ?? process.cwd());
  const fileNames = Array.isArray(options.fileNames) && options.fileNames.length > 0
    ? options.fileNames
    : [".env.local", ".env"];
  const loaded = [];
  const keys = [];

  for (const fileName of fileNames) {
    const filePath = path.resolve(rootDir, fileName);
    const relativePath = path.relative(rootDir, filePath);
    if (relativePath.startsWith("..") || path.isAbsolute(relativePath)) {
      throw new Error("Invalid file path");
    }

    if (!fs.existsSync(filePath)) {
      continue;
    }

    const parsed = parseEnv(fs.readFileSync(filePath, "utf8"));
    const loadedKeys = [];

    for (const [key, value] of Object.entries(parsed)) {
      if (process.env[key] === undefined) {
        process.env[key] = value;
        loadedKeys.push(key);
      }
    }

    loaded.push({
      path: filePath,
      keys: loadedKeys
    });
    keys.push(...loadedKeys);
  }

  return {
    rootDir,
    loaded,
    keys
  };
}

module.exports = {
  loadEnvFiles,
  parseEnv
};
