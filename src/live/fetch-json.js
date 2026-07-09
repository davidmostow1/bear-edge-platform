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
    throw new Error(`Failed to fetch ${url}: ${response.status} ${response.statusText}`);
  }

  return response.json();
}

module.exports = {
  fetchJson
};
