const fs = require("node:fs/promises");
const path = require("node:path");

const { parseEnv } = require("./env.js");
const {
  createOperatorAuth,
  generateOperatorToken
} = require("./operator-auth.js");
const {
  readEnvFile,
  resolveEnvPath,
  upsertEnvValue
} = require("./key-settings-utils.js");

const OPERATOR_ENV_KEY = "BEAR_EDGE_OPERATOR_TOKEN";

function requestWithToken(token) {
  return {
    headers: {
      authorization: `Bearer ${token}`
    }
  };
}

async function rotateOperatorToken(options = {}) {
  const envPath = resolveEnvPath(options);
  const existing = await readEnvFile(envPath);
  const oldToken = String(parseEnv(existing)[OPERATOR_ENV_KEY] ?? "").trim();
  const newToken = generateOperatorToken();
  const next = upsertEnvValue(existing, OPERATOR_ENV_KEY, newToken, {
    comment: "# Bear Edge operator credential. Keep this file private."
  });
  const tempPath = `${envPath}.tmp-${process.pid}-${Date.now()}`;

  await fs.mkdir(path.dirname(envPath), { recursive: true });

  try {
    await fs.writeFile(tempPath, next, { mode: 0o600 });
    await fs.chmod(tempPath, 0o600);
    await fs.rename(tempPath, envPath);
  } catch (error) {
    await fs.rm(tempPath, { force: true }).catch(() => undefined);
    throw error;
  }

  await fs.chmod(envPath, 0o600);
  process.env[OPERATOR_ENV_KEY] = newToken;

  const auth = createOperatorAuth({
    lanMode: true,
    requireToken: true,
    token: newToken
  });
  const oldTokenRejected = !oldToken
    || !auth.authorizeRequest(requestWithToken(oldToken)).authorized;
  const newTokenAccepted = auth.authorizeRequest(requestWithToken(newToken)).authorized;

  if (!oldTokenRejected || !newTokenAccepted) {
    throw new Error("Operator token rotation verification failed.");
  }

  return {
    configured: true,
    envFile: path.basename(envPath),
    newTokenAccepted,
    oldTokenRejected,
    secretReturned: false
  };
}

module.exports = {
  OPERATOR_ENV_KEY,
  rotateOperatorToken
};
