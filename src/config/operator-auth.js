const crypto = require("node:crypto");

const OPERATOR_TOKEN_BYTES = 32;

function envFlagEnabled(value) {
  return ["1", "true", "yes", "on"].includes(String(value ?? "").trim().toLowerCase());
}

function generateOperatorToken() {
  return crypto.randomBytes(OPERATOR_TOKEN_BYTES).toString("base64url");
}

function digestOperatorToken(token) {
  return crypto.createHash("sha256").update(String(token), "utf8").digest();
}

function extractBearerToken(authorization) {
  if (typeof authorization !== "string" || authorization.trim() === "") {
    return { reason: "missing_bearer_token", token: null };
  }

  const match = authorization.match(/^Bearer\s+([^\s]+)$/i);

  if (!match) {
    return { reason: "malformed_bearer_token", token: null };
  }

  return { reason: null, token: match[1] };
}

function createOperatorAuth(options = {}) {
  const lanMode = Boolean(options.lanMode);
  const required = options.requireToken === undefined
    ? lanMode || envFlagEnabled(process.env.BEAR_EDGE_REQUIRE_OPERATOR_TOKEN)
    : Boolean(options.requireToken);
  const configuredToken = String(options.token ?? process.env.BEAR_EDGE_OPERATOR_TOKEN ?? "").trim();
  let launchToken = null;
  let tokenSource = "not_required";
  let tokenDigest = null;

  if (required) {
    const token = configuredToken || generateOperatorToken();

    tokenSource = configuredToken ? "configured" : "generated";
    tokenDigest = digestOperatorToken(token);
    launchToken = configuredToken ? null : token;
  }

  function authorizeRequest(request) {
    if (!required) {
      return {
        authorized: true,
        reason: "token_not_required",
        statusCode: 200
      };
    }

    const authorization = request?.headers?.authorization;
    const extracted = extractBearerToken(authorization);

    if (!extracted.token) {
      return {
        authorized: false,
        reason: extracted.reason,
        statusCode: 401
      };
    }

    const candidateDigest = digestOperatorToken(extracted.token);
    const authorized = tokenDigest !== null
      && candidateDigest.length === tokenDigest.length
      && crypto.timingSafeEqual(candidateDigest, tokenDigest);

    return {
      authorized,
      reason: authorized ? "verified_bearer_token" : "invalid_bearer_token",
      statusCode: authorized ? 200 : 401
    };
  }

  function createLaunchToken() {
    const token = launchToken;
    launchToken = null;
    return token;
  }

  function getStatus() {
    return {
      provider: "bear_edge_operator_auth",
      required,
      lanMode,
      mode: required ? "bearer_token" : "local_open",
      tokenSource,
      digestAlgorithm: required ? "sha256" : null,
      generatedEntropyBytes: tokenSource === "generated" ? OPERATOR_TOKEN_BYTES : null,
      secretReturned: false
    };
  }

  return {
    authorizeRequest,
    createLaunchToken,
    getStatus
  };
}

module.exports = {
  OPERATOR_TOKEN_BYTES,
  createOperatorAuth,
  digestOperatorToken,
  envFlagEnabled,
  extractBearerToken,
  generateOperatorToken
};
