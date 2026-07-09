const { fetchMlbPlayerPropSnapshot } = require("./providers/mlb.js");
const { fetchNhlPlayerPropSnapshot } = require("./providers/nhl.js");

const PROVIDERS = Object.freeze({
  mlb: fetchMlbPlayerPropSnapshot,
  nhl: fetchNhlPlayerPropSnapshot
});

function getProvider(providerName) {
  const provider = PROVIDERS[providerName];

  if (!provider) {
    throw new Error(`Unsupported live provider: ${providerName}`);
  }

  return provider;
}

module.exports = {
  PROVIDERS,
  getProvider
};
