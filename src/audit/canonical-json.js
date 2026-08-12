const crypto = require("node:crypto");

function normalize(value) {
  if (typeof value === "number" && !Number.isFinite(value)) {
    throw new TypeError("Canonical JSON numbers must be finite.");
  }

  if (Array.isArray(value)) {
    return value.map(normalize);
  }

  if (value !== null && typeof value === "object") {
    return Object.fromEntries(
      Object.keys(value)
        .sort()
        .map((key) => [key, normalize(value[key])])
    );
  }

  return value;
}

function canonicalStringify(value) {
  return JSON.stringify(normalize(value));
}

function contentDigest(value) {
  return crypto.createHash("sha256").update(canonicalStringify(value)).digest("hex");
}

module.exports = {
  canonicalStringify,
  contentDigest
};
