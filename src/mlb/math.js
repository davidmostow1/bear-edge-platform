// @ts-nocheck
const crypto = require("node:crypto");

function clamp(value, minimum, maximum) {
  return Math.min(maximum, Math.max(minimum, value));
}

function logistic(value) {
  if (value >= 0) {
    const z = Math.exp(-value);
    return 1 / (1 + z);
  }
  const z = Math.exp(value);
  return z / (1 + z);
}

function logit(probability) {
  const p = clamp(probability, 1e-9, 1 - 1e-9);
  return Math.log(p / (1 - p));
}

function combineLog5(rateA, rateB, leagueRate) {
  return logistic(logit(rateA) + logit(rateB) - logit(leagueRate));
}

function shrinkRate(successes, trials, priorMean, priorStrength) {
  const n = Number.isFinite(trials) && trials > 0 ? trials : 0;
  const y = Number.isFinite(successes) && successes >= 0 ? successes : 0;
  const kappa = Number.isFinite(priorStrength) && priorStrength > 0 ? priorStrength : 0;
  if (n + kappa === 0) return priorMean;
  return clamp((y + priorMean * kappa) / (n + kappa), 1e-6, 1 - 1e-6);
}

function xmur3(text) {
  let h = 1779033703 ^ text.length;
  for (let i = 0; i < text.length; i += 1) {
    h = Math.imul(h ^ text.charCodeAt(i), 3432918353);
    h = (h << 13) | (h >>> 19);
  }
  return function nextHash() {
    h = Math.imul(h ^ (h >>> 16), 2246822507);
    h = Math.imul(h ^ (h >>> 13), 3266489909);
    return (h ^= h >>> 16) >>> 0;
  };
}

function mulberry32(seed) {
  let state = seed >>> 0;
  return function random() {
    state += 0x6d2b79f5;
    let value = state;
    value = Math.imul(value ^ (value >>> 15), value | 1);
    value ^= value + Math.imul(value ^ (value >>> 7), value | 61);
    return ((value ^ (value >>> 14)) >>> 0) / 4294967296;
  };
}

function createRng(seed = "sweet-bear") {
  const seedFactory = xmur3(String(seed));
  const uniform = mulberry32(seedFactory());
  let spare = null;
  return {
    uniform,
    normal() {
      if (spare !== null) {
        const value = spare;
        spare = null;
        return value;
      }
      let u = 0;
      let v = 0;
      while (u <= Number.EPSILON) u = uniform();
      while (v <= Number.EPSILON) v = uniform();
      const magnitude = Math.sqrt(-2 * Math.log(u));
      const angle = 2 * Math.PI * v;
      spare = magnitude * Math.sin(angle);
      return magnitude * Math.cos(angle);
    }
  };
}

function samplePoisson(rng, lambda) {
  const mean = Math.max(0, Number(lambda) || 0);
  if (mean === 0) return 0;
  if (mean < 35) {
    const limit = Math.exp(-mean);
    let product = 1;
    let count = 0;
    do {
      count += 1;
      product *= rng.uniform();
    } while (product > limit);
    return count - 1;
  }
  return Math.max(0, Math.round(mean + Math.sqrt(mean) * rng.normal()));
}

function sampleCategorical(rng, entries) {
  const total = entries.reduce((sum, entry) => sum + Math.max(0, entry.weight), 0);
  if (!(total > 0)) throw new RangeError("categorical weights must sum to a positive value");
  let cursor = rng.uniform() * total;
  for (const entry of entries) {
    cursor -= Math.max(0, entry.weight);
    if (cursor <= 0) return entry.value;
  }
  return entries[entries.length - 1].value;
}

function canonicalize(value) {
  if (Array.isArray(value)) return value.map(canonicalize);
  if (value && typeof value === "object") {
    return Object.fromEntries(Object.keys(value).sort().map((key) => [key, canonicalize(value[key])]));
  }
  return value;
}

function stableHash(value) {
  return crypto.createHash("sha256").update(JSON.stringify(canonicalize(value))).digest("hex");
}

module.exports = {
  clamp,
  logistic,
  logit,
  combineLog5,
  shrinkRate,
  createRng,
  samplePoisson,
  sampleCategorical,
  stableHash
};
