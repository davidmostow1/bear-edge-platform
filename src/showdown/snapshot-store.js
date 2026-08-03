const crypto = require("node:crypto");
const fs = require("node:fs");
const path = require("node:path");

const DEFAULT_SNAPSHOT_ROOT = path.join(
  __dirname,
  "..",
  "..",
  "data",
  "snapshots"
);

const REDACTED = "REDACTED";
const SECRET_QUERY_PARAMETERS = Object.freeze([
  "apiKey",
  "api_key",
  "apikey",
  "key",
  "token",
  "access_token"
]);

/**
 * Strips credentials out of a URL before it is written to disk or used as a
 * cache identity. Snapshots are meant to be long-lived and committable; an
 * API key baked into a stored filename or payload would outlive the reason it
 * was there.
 *
 * @param {string} rawUrl
 * @returns {string}
 */
function redactUrl(rawUrl) {
  if (typeof rawUrl !== "string" || rawUrl.trim().length === 0) {
    throw new TypeError("A request URL is required");
  }

  let parsed;

  try {
    parsed = new URL(rawUrl);
  } catch {
    throw new TypeError(`Request URL is not parseable: ${rawUrl.slice(0, 80)}`);
  }

  SECRET_QUERY_PARAMETERS.forEach((parameter) => {
    if (parsed.searchParams.has(parameter)) {
      parsed.searchParams.set(parameter, REDACTED);
    }
  });

  parsed.searchParams.sort();

  return parsed.toString();
}

/**
 * @param {string} redactedUrl
 * @returns {string}
 */
function snapshotDigest(redactedUrl) {
  return crypto.createHash("sha256").update(redactedUrl).digest("hex");
}

/**
 * @param {string} isoInstant
 * @returns {string} YYYY-MM-DD
 */
function dayPartition(isoInstant) {
  return isoInstant.slice(0, 10);
}

/**
 * @param {{ root?: string, provider: string, capturedAt: string, digest: string }} input
 * @returns {string}
 */
function snapshotPath(input) {
  return path.join(
    input.root ?? DEFAULT_SNAPSHOT_ROOT,
    input.provider,
    dayPartition(input.capturedAt),
    `${input.digest}.json`
  );
}

/**
 * A permanent, content-addressed record of every paid API response.
 *
 * The existing paid response cache in src/live/odds-quota.js is an in-memory
 * Map with a two minute TTL, so it dies with the process. Every restart re-buys
 * data that was already paid for. This store is the opposite: once a price is
 * captured it is on disk forever, and any number of future replays cost
 * nothing. That property is what makes a zero-dollar budget workable, and it is
 * also what makes the showdown reproducible - a report can be rebuilt from the
 * exact bytes the sportsbook returned, months later.
 */
class SnapshotStore {
  /**
   * @param {{ root?: string }} [options]
   */
  constructor(options = {}) {
    this.root = options.root ?? DEFAULT_SNAPSHOT_ROOT;
  }

  /**
   * @param {string} provider
   * @param {string} requestUrl
   * @returns {{
   *   provider: string,
   *   redactedUrl: string,
   *   digest: string,
   *   capturedAt: string,
   *   creditCost: number,
   *   payload: unknown,
   *   path: string
   * } | null}
   */
  read(provider, requestUrl) {
    const redactedUrl = redactUrl(requestUrl);
    const digest = snapshotDigest(redactedUrl);
    const providerRoot = path.join(this.root, provider);

    if (!fs.existsSync(providerRoot)) {
      return null;
    }

    // Snapshots are partitioned by capture day, so a lookup scans day
    // directories newest first and returns the most recent capture of this
    // exact request.
    const days = fs
      .readdirSync(providerRoot)
      .filter((entry) => /^\d{4}-\d{2}-\d{2}$/.test(entry))
      .sort()
      .reverse();

    for (const day of days) {
      const candidate = path.join(providerRoot, day, `${digest}.json`);

      if (fs.existsSync(candidate)) {
        const parsed = JSON.parse(fs.readFileSync(candidate, "utf8"));
        return { ...parsed, path: candidate };
      }
    }

    return null;
  }

  /**
   * @param {{
   *   provider: string,
   *   requestUrl: string,
   *   payload: unknown,
   *   creditCost?: number,
   *   capturedAt?: string
   * }} input
   * @returns {{ path: string, digest: string, redactedUrl: string, capturedAt: string }}
   */
  write(input) {
    if (!input || typeof input !== "object" || Array.isArray(input)) {
      throw new TypeError("Snapshot input must be an object");
    }
    if (typeof input.provider !== "string" || input.provider.trim().length === 0) {
      throw new TypeError("Snapshot provider is required");
    }

    const redactedUrl = redactUrl(input.requestUrl);
    const digest = snapshotDigest(redactedUrl);
    const capturedAt = input.capturedAt ?? new Date().toISOString();
    const target = snapshotPath({
      root: this.root,
      provider: input.provider,
      capturedAt,
      digest
    });

    const record = {
      provider: input.provider,
      redactedUrl,
      digest,
      capturedAt,
      creditCost: Number.isFinite(input.creditCost) ? input.creditCost : 0,
      payload: input.payload
    };

    fs.mkdirSync(path.dirname(target), { recursive: true });

    // Snapshots are immutable. If this exact request was already captured on
    // this day, the first capture wins; overwriting would quietly destroy the
    // evidence a settled prediction was scored against.
    if (!fs.existsSync(target)) {
      fs.writeFileSync(target, `${JSON.stringify(record, null, 2)}\n`, "utf8");
    }

    return { path: target, digest, redactedUrl, capturedAt };
  }

  /**
   * @returns {{ provider: string, captures: number, creditsSpent: number }[]}
   */
  summarize() {
    if (!fs.existsSync(this.root)) {
      return [];
    }

    return fs
      .readdirSync(this.root)
      .filter((provider) => fs.statSync(path.join(this.root, provider)).isDirectory())
      .map((provider) => {
        const providerRoot = path.join(this.root, provider);
        let captures = 0;
        let creditsSpent = 0;

        fs.readdirSync(providerRoot)
          .filter((entry) => /^\d{4}-\d{2}-\d{2}$/.test(entry))
          .forEach((day) => {
            fs.readdirSync(path.join(providerRoot, day))
              .filter((file) => file.endsWith(".json"))
              .forEach((file) => {
                captures += 1;
                try {
                  const parsed = JSON.parse(
                    fs.readFileSync(path.join(providerRoot, day, file), "utf8")
                  );
                  creditsSpent += Number(parsed.creditCost) || 0;
                } catch {
                  // A corrupt snapshot should not break the summary.
                }
              });
          });

        return { provider, captures, creditsSpent };
      });
  }
}

module.exports = {
  DEFAULT_SNAPSHOT_ROOT,
  REDACTED,
  SnapshotStore,
  redactUrl,
  snapshotDigest,
  snapshotPath
};
