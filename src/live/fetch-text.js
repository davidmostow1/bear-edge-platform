const DEFAULT_FETCH_TIMEOUT_MS = 15000;

/**
 * @param {string | URL} url
 * @param {RequestInit & {timeoutMs?: number}} [options]
 */
async function fetchText(url, options = {}) {
  const { timeoutMs, ...fetchOptions } = options;
  const resolvedTimeoutMs = Number.isFinite(timeoutMs) && timeoutMs > 0
    ? Math.ceil(timeoutMs)
    : DEFAULT_FETCH_TIMEOUT_MS;
  const response = await fetch(url, {
    method: "GET",
    ...fetchOptions,
    signal: fetchOptions.signal ?? AbortSignal.timeout(resolvedTimeoutMs)
  });
  const text = await response.text();

  return {
    ok: response.ok,
    status: response.status,
    statusText: response.statusText,
    contentType: response.headers.get("content-type") ?? "",
    text
  };
}

module.exports = {
  fetchText
};
