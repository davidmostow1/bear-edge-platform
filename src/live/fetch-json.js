const { redactSecrets } = require("../config/secrets.js");

async function fetchJson(url, options = {}) {
  const response = await fetch(url, {
    method: "GET",
    headers: {
      "accept": "application/json",
      "user-agent": "bear-edge-betting-engine/1.0"
    },
    ...options
  });

  if (!response.ok) {
    throw new Error(redactSecrets(`Failed to fetch ${url}: ${response.status} ${response.statusText}`));
  }

  return response.json();
}

module.exports = {
  fetchJson
};
