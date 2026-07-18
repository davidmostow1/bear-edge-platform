const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const {
  createOperatorAuth,
  generateOperatorToken
} = require("../src/config/operator-auth.js");

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

test("operator auth implementation uses SHA-256 digests and constant-time comparison", () => {
  const source = fs.readFileSync(
    path.resolve(__dirname, "../src/config/operator-auth.js"),
    "utf8"
  );

  assert.match(source, /createHash\("sha256"\)/);
  assert.match(source, /timingSafeEqual/);
  assert.doesNotMatch(source, /status[^\n]*token\s*:/i);
});
