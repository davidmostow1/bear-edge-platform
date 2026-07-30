const { redactSecrets } = require("../config/secrets.js");

async function fetchJson(url, options = {}) {
  const { onResponse, ...fetchOptions } = options;
  const response = await fetch(url, {
    method: "GET",
    headers: {
      "accept": "application/json",
      "user-agent": "bear-edge-betting-engine/1.0"
    },
    ...fetchOptions
  });

  if (typeof onResponse === "function") {
    onResponse(response);
  }

  if (!response.ok) {
    const body = typeof response.text === "function"
      ? await response.text().catch(() => "")
      : "";
    let providerError = null;

    try {
      providerError = JSON.parse(body);
    } catch {
      // Some providers return an HTML or empty error body.
    }

    const code = providerError?.error_code ?? providerError?.code ?? null;
    const detail = providerError?.message ?? providerError?.error ?? null;
    const suffix = code || detail
      ? ` (${[code, detail].filter(Boolean).join(": ")})`
      : "";
    /** @type {Error & {providerCode?: string|null, providerMessage?: string|null, httpStatus?: number, responseMetadata?: {headers: Headers, status: number}}} */
    const error = new Error(redactSecrets(`Failed to fetch ${url}: ${response.status} ${response.statusText}${suffix}`));
    error.providerCode = code;
    error.providerMessage = detail;
    error.httpStatus = response.status;
    error.responseMetadata = {
      headers: response.headers,
      status: response.status
    };
    throw error;
  }

  return response.json();
}

module.exports = {
  fetchJson
};
