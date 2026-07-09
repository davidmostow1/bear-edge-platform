const { getProvider } = require("./provider-registry.js");

function createSourceKey(leg) {
  return JSON.stringify({
    provider: leg.provider,
    source: leg.source
  });
}

class LiveDataCache {
  constructor(options = {}) {
    this.refreshIntervalMs = options.refreshIntervalMs ?? 30 * 60 * 1000;
    this.entries = new Map();
  }

  isFresh(entry) {
    return Date.now() - entry.cachedAtMs <= this.refreshIntervalMs;
  }

  async getSnapshotForLeg(leg, options = {}) {
    const key = createSourceKey(leg);
    const existingEntry = this.entries.get(key);

    if (existingEntry && !options.forceRefresh && this.isFresh(existingEntry)) {
      return {
        ...existingEntry.snapshot,
        cache: {
          hit: true,
          stale: false
        }
      };
    }

    const provider = getProvider(leg.provider);
    const snapshot = await provider(leg.source, options);
    const entry = {
      cachedAtMs: Date.now(),
      snapshot
    };

    this.entries.set(key, entry);

    return {
      ...snapshot,
      cache: {
        hit: Boolean(existingEntry),
        stale: Boolean(existingEntry && !this.isFresh(existingEntry))
      }
    };
  }

  clear() {
    this.entries.clear();
  }
}

module.exports = {
  LiveDataCache,
  createSourceKey
};
