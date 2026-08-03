const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");

const {
  createOperatorAuth,
  generateOperatorToken
} = require("../src/config/operator-auth.js");
let rotateOperatorToken;

try {
  ({ rotateOperatorToken } = require("../src/config/operator-token-settings.js"));
} catch (error) {
  if (error.code !== "MODULE_NOT_FOUND") {
    throw error;
  }
}

function requestWithAuthorization(authorization) {
  return {
    headers: authorization ? { authorization } : {}
  };
}

test("LAN operator auth generates a one-time 256-bit launch token and exposes only safe status", () => {
  const auth = createOperatorAuth({ lanMode: true });
  const token = auth.createLaunchToken();
  const status = auth.getStatus();

  assert.match(token, /^[A-Za-z0-9_-]{43}$/);
  assert.equal(auth.createLaunchToken(), null);
  assert.equal(status.required, true);
  assert.equal(status.lanMode, true);
  assert.equal(status.mode, "bearer_token");
  assert.equal(status.tokenSource, "generated");
  assert.equal(status.digestAlgorithm, "sha256");
  assert.equal(status.secretReturned, false);
  assert.equal(JSON.stringify(status).includes(token), false);
});

test("operator auth rejects missing, malformed, and incorrect bearer credentials", () => {
  const token = generateOperatorToken();
  const auth = createOperatorAuth({ lanMode: true, token });

  assert.deepEqual(auth.authorizeRequest(requestWithAuthorization()), {
    authorized: false,
    reason: "missing_bearer_token",
    statusCode: 401
  });
  assert.deepEqual(auth.authorizeRequest(requestWithAuthorization(`Basic ${token}`)), {
    authorized: false,
    reason: "malformed_bearer_token",
    statusCode: 401
  });
  assert.deepEqual(auth.authorizeRequest(requestWithAuthorization("Bearer wrong-token")), {
    authorized: false,
    reason: "invalid_bearer_token",
    statusCode: 401
  });
  assert.deepEqual(auth.authorizeRequest(requestWithAuthorization(`Bearer ${token}`)), {
    authorized: true,
    reason: "verified_bearer_token",
    statusCode: 200
  });
});

test("localhost remains open unless operator authentication is explicitly required", () => {
  const local = createOperatorAuth({ lanMode: false });
  const hardenedLocal = createOperatorAuth({ lanMode: false, requireToken: true });

  assert.equal(local.getStatus().required, false);
  assert.equal(local.authorizeRequest(requestWithAuthorization()).authorized, true);
  assert.equal(hardenedLocal.getStatus().required, true);
  assert.equal(hardenedLocal.authorizeRequest(requestWithAuthorization()).authorized, false);
  assert.match(hardenedLocal.createLaunchToken(), /^[A-Za-z0-9_-]{43}$/);
});

test("operator auth ignores ambient process settings unless the caller passes them explicitly", () => {
  const previousToken = process.env.BEAR_EDGE_OPERATOR_TOKEN;
  const previousRequireToken = process.env.BEAR_EDGE_REQUIRE_OPERATOR_TOKEN;
  process.env.BEAR_EDGE_OPERATOR_TOKEN = "ambient-token-must-not-be-consumed";
  process.env.BEAR_EDGE_REQUIRE_OPERATOR_TOKEN = "true";

  try {
    const local = createOperatorAuth({ lanMode: false });
    const generated = createOperatorAuth({ lanMode: true });
    const explicit = createOperatorAuth({
      lanMode: true,
      token: process.env.BEAR_EDGE_OPERATOR_TOKEN
    });

    assert.equal(local.getStatus().required, false);
    assert.equal(generated.getStatus().tokenSource, "generated");
    assert.match(generated.createLaunchToken(), /^[A-Za-z0-9_-]{43}$/);
    assert.equal(explicit.getStatus().tokenSource, "configured");
    assert.equal(explicit.createLaunchToken(), null);
  } finally {
    if (previousToken === undefined) {
      delete process.env.BEAR_EDGE_OPERATOR_TOKEN;
    } else {
      process.env.BEAR_EDGE_OPERATOR_TOKEN = previousToken;
    }
    if (previousRequireToken === undefined) {
      delete process.env.BEAR_EDGE_REQUIRE_OPERATOR_TOKEN;
    } else {
      process.env.BEAR_EDGE_REQUIRE_OPERATOR_TOKEN = previousRequireToken;
    }
  }
});

test("operator auth implementation uses SHA-256 digests and constant-time comparison", () => {
  const source = fs.readFileSync(
    path.resolve(__dirname, "../src/config/operator-auth.js"),
    "utf8"
  );

  assert.match(source, /createHash\("sha256"\)/);
  assert.match(source, /timingSafeEqual/);
  assert.doesNotMatch(source, /status[^\n]*token\s*:/i);
});

test("operator token rotation persists a new credential and rejects the old credential", async () => {
  assert.equal(typeof rotateOperatorToken, "function");

  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "bear-edge-operator-token-"));
  const envPath = path.join(tempDir, ".env.local");
  const oldToken = generateOperatorToken();
  fs.writeFileSync(envPath, `BEAR_EDGE_OPERATOR_TOKEN=${oldToken}\n`, { mode: 0o600 });

  const result = await rotateOperatorToken({ envPath });
  const contents = fs.readFileSync(envPath, "utf8");
  const newToken = contents.match(/^BEAR_EDGE_OPERATOR_TOKEN=(.+)$/m)?.[1];
  const auth = createOperatorAuth({
    lanMode: true,
    requireToken: true,
    token: newToken
  });

  assert.ok(newToken);
  assert.notEqual(newToken, oldToken);
  assert.equal(auth.authorizeRequest(requestWithAuthorization(`Bearer ${oldToken}`)).authorized, false);
  assert.equal(auth.authorizeRequest(requestWithAuthorization(`Bearer ${newToken}`)).authorized, true);
  assert.equal(fs.statSync(envPath).mode & 0o777, 0o600);
  assert.deepEqual(result, {
    configured: true,
    envFile: ".env.local",
    newTokenAccepted: true,
    oldTokenRejected: true,
    secretReturned: false
  });
  assert.equal(JSON.stringify(result).includes(oldToken), false);
  assert.equal(JSON.stringify(result).includes(newToken), false);
});
