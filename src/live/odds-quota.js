const crypto = require("node:crypto");

const DEFAULT_ODDS_CACHE_TTL_MS = 2 * 60 * 1000;

const quotaStates = new Map();
const paidResponseCache = new Map();

function keyFingerprint(apiKey) {
  return crypto.createHash("sha256").update(String(apiKey)).digest("hex");
}

function createQuotaState() {
  return {
    remainingCredits: null,
    usedCredits: null,
    lastRequestCost: null,
    lastObservedAt: null,
    lastFailureAt: null,
    networkRequests: 0,
    paidNetworkRequests: 0,
    cacheHits: 0,
    circuitOpen: false,
    circuitReason: null,
    circuitOpenedAt: null
  };
}

function stateFor(apiKey) {
  const fingerprint = keyFingerprint(apiKey);

  if (!quotaStates.has(fingerprint)) {
    quotaStates.set(fingerprint, createQuotaState());
  }

  return quotaStates.get(fingerprint);
}

function numericHeader(headers, name) {
  if (!headers) {
    return null;
  }

  const value = typeof headers.get === "function"
    ? headers.get(name)
    : headers[name] ?? headers[name.toLowerCase()] ?? null;
  const parsed = Number(value);

  return Number.isFinite(parsed) && parsed >= 0 ? parsed : null;
}

function quotaSnapshot(apiKey) {
  if (!apiKey) {
    return {
      known: false,
      remainingCredits: null,
      usedCredits: null,
      lastRequestCost: null,
      lastObservedAt: null,
      lastFailureAt: null,
      networkRequests: 0,
      paidNetworkRequests: 0,
      cacheHits: 0,
      circuitOpen: false,
      circuitReason: null,
      circuitOpenedAt: null,
      paidRequestsAllowed: false
    };
  }

  const state = stateFor(apiKey);

  return {
    known: state.remainingCredits !== null || state.usedCredits !== null,
    remainingCredits: state.remainingCredits,
    usedCredits: state.usedCredits,
    lastRequestCost: state.lastRequestCost,
    lastObservedAt: state.lastObservedAt,
    lastFailureAt: state.lastFailureAt,
    networkRequests: state.networkRequests,
    paidNetworkRequests: state.paidNetworkRequests,
    cacheHits: state.cacheHits,
    circuitOpen: state.circuitOpen,
    circuitReason: state.circuitReason,
    circuitOpenedAt: state.circuitOpenedAt,
    paidRequestsAllowed: !state.circuitOpen && state.remainingCredits !== 0
  };
}

function recordQuotaHeaders(apiKey, response, options = {}) {
  const state = stateFor(apiKey);
  const headers = response?.headers ?? response;
  const remainingCredits = numericHeader(headers, "x-requests-remaining");
  const usedCredits = numericHeader(headers, "x-requests-used");
  const lastRequestCost = numericHeader(headers, "x-requests-last");
  const observedAt = (options.now ?? new Date()).toISOString();

  state.networkRequests += 1;
  if (options.paid === true) {
    state.paidNetworkRequests += 1;
  }

  if (remainingCredits !== null) {
    state.remainingCredits = remainingCredits;
  }
  if (usedCredits !== null) {
    state.usedCredits = usedCredits;
  }
  if (lastRequestCost !== null) {
    state.lastRequestCost = lastRequestCost;
  }
  if (remainingCredits !== null || usedCredits !== null || lastRequestCost !== null) {
    state.lastObservedAt = observedAt;
  }

  if (remainingCredits === 0) {
    state.circuitOpen = true;
    state.circuitReason = "OUT_OF_USAGE_CREDITS";
    state.circuitOpenedAt ??= observedAt;
  } else if (remainingCredits !== null && remainingCredits > 0 && state.circuitReason === "OUT_OF_USAGE_CREDITS") {
    state.circuitOpen = false;
    state.circuitReason = null;
    state.circuitOpenedAt = null;
  }

  return quotaSnapshot(apiKey);
}

function recordQuotaFailure(apiKey, error, options = {}) {
  const state = stateFor(apiKey);
  const observedAt = (options.now ?? new Date()).toISOString();
  const headers = error?.responseMetadata?.headers ?? error?.responseHeaders ?? null;

  if (options.requestAlreadyRecorded !== true && headers) {
    recordQuotaHeaders(apiKey, headers, { ...options, paid: options.paid === true });
  } else if (options.requestAlreadyRecorded !== true) {
    state.networkRequests += 1;
    if (options.paid === true) {
      state.paidNetworkRequests += 1;
    }
  }

  state.lastFailureAt = observedAt;

  if (String(error?.providerCode ?? "").toUpperCase() === "OUT_OF_USAGE_CREDITS") {
    state.remainingCredits = 0;
    state.circuitOpen = true;
    state.circuitReason = "OUT_OF_USAGE_CREDITS";
    state.circuitOpenedAt ??= observedAt;
    state.lastObservedAt = observedAt;
  }

  return quotaSnapshot(apiKey);
}

function createQuotaCircuitError(state) {
  const error = /** @type {Error & {providerCode: string, providerMessage: string, httpStatus: number, localCircuit: boolean, circuitOpenedAt: string|null}} */ (
    new Error(
      "The local odds quota circuit is open because the provider reported exhausted usage credits. " +
      "Use the explicit saved-key test after credits are replenished."
    )
  );
  error.providerCode = "OUT_OF_USAGE_CREDITS";
  error.providerMessage = "Usage quota is exhausted.";
  error.httpStatus = 429;
  error.localCircuit = true;
  error.circuitOpenedAt = state.circuitOpenedAt;
  return error;
}

function assertPaidRequestAllowed(apiKey, options = {}) {
  const state = stateFor(apiKey);

  if (state.circuitOpen && options.bypassCircuit !== true) {
    throw createQuotaCircuitError(state);
  }

  const estimatedCost = Number.isFinite(options.estimatedCost) && options.estimatedCost > 0
    ? options.estimatedCost
    : 1;

  if (state.remainingCredits !== null && state.remainingCredits < estimatedCost && options.bypassCircuit !== true) {
    state.circuitOpen = true;
    state.circuitReason = "OUT_OF_USAGE_CREDITS";
    state.circuitOpenedAt ??= new Date().toISOString();
    throw createQuotaCircuitError(state);
  }
}

function cacheKey(apiKey, sourceUrl, namespace = "default") {
  return crypto
    .createHash("sha256")
    .update(`${keyFingerprint(apiKey)}:${namespace}:${sourceUrl}`)
    .digest("hex");
}

function readPaidResponseCache(apiKey, sourceUrl, options = {}) {
  const ttlMs = Number.isFinite(options.ttlMs) && options.ttlMs >= 0
    ? options.ttlMs
    : DEFAULT_ODDS_CACHE_TTL_MS;

  if (options.forceRefresh === true || ttlMs === 0) {
    return null;
  }

  const key = cacheKey(apiKey, sourceUrl, options.namespace);
  const entry = paidResponseCache.get(key);

  if (!entry) {
    return null;
  }

  const ageMs = Date.now() - entry.cachedAtMs;

  if (ageMs > ttlMs) {
    paidResponseCache.delete(key);
    return null;
  }

  stateFor(apiKey).cacheHits += 1;
  return {
    data: structuredClone(entry.data),
    ageMs,
    ttlMs
  };
}

function writePaidResponseCache(apiKey, sourceUrl, data, options = {}) {
  paidResponseCache.set(cacheKey(apiKey, sourceUrl, options.namespace), {
    cachedAtMs: Date.now(),
    data: structuredClone(data)
  });
}

function resetOddsApiRuntimeState() {
  quotaStates.clear();
  paidResponseCache.clear();
}

module.exports = {
  DEFAULT_ODDS_CACHE_TTL_MS,
  assertPaidRequestAllowed,
  quotaSnapshot,
  readPaidResponseCache,
  recordQuotaFailure,
  recordQuotaHeaders,
  resetOddsApiRuntimeState,
  writePaidResponseCache
};
