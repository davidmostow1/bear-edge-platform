// @ts-nocheck
const fs = require("node:fs/promises");
const path = require("node:path");
const zlib = require("node:zlib");
const { promisify } = require("node:util");
const { stableHash } = require("../math.js");
const { fetchSeasonSchedule, fetchGameFeed } = require("./mlb-stats-api.js");
const { normalizeGameFeed } = require("./normalize.js");

const gzip = promisify(zlib.gzip);
const gunzip = promisify(zlib.gunzip);

async function atomicWrite(filePath, data) {
  await fs.mkdir(path.dirname(filePath), { recursive: true });
  const temp = `${filePath}.${process.pid}.${Date.now()}.tmp`;
  await fs.writeFile(temp, data);
  await fs.rename(temp, filePath);
}

async function mapLimit(items, concurrency, worker) {
  let index = 0;
  const results = new Array(items.length);
  async function run() {
    while (true) {
      const current = index;
      index += 1;
      if (current >= items.length) return;
      results[current] = await worker(items[current], current);
    }
  }
  await Promise.all(Array.from({ length: Math.max(1, Math.min(concurrency, items.length || 1)) }, run));
  return results;
}

async function readJsonGzip(filePath) {
  return JSON.parse((await gunzip(await fs.readFile(filePath))).toString("utf8"));
}

async function rebuildSeasonTables(seasonDir) {
  const recordsDir = path.join(seasonDir, "records");
  let names = [];
  try {
    names = (await fs.readdir(recordsDir)).filter((name) => name.endsWith(".json.gz")).sort();
  } catch {
    names = [];
  }
  const tables = { games: [], batting: [], pitching: [] };
  for (const name of names) {
    const record = await readJsonGzip(path.join(recordsDir, name));
    tables.games.push(record.game);
    tables.batting.push(...record.batting);
    tables.pitching.push(...record.pitching);
  }
  for (const [name, rows] of Object.entries(tables)) {
    const text = rows.map((row) => JSON.stringify(row)).join("\n") + (rows.length ? "\n" : "");
    await atomicWrite(path.join(seasonDir, `${name}.jsonl`), text);
  }
  return { games: tables.games.length, battingRows: tables.batting.length, pitchingRows: tables.pitching.length };
}

async function buildHistoryLibrary(options = {}) {
  const seasons = options.seasons ?? [2024, 2025];
  const outputDir = path.resolve(options.outputDir ?? path.join("data", "history", "mlb"));
  const concurrency = Math.max(1, Number(options.concurrency ?? 6));
  const fetchImpl = options.fetchImpl ?? fetch;
  const keepRaw = options.keepRaw !== false;
  const seasonManifests = [];
  for (const season of seasons) {
    const seasonDir = path.join(outputDir, String(season));
    const recordsDir = path.join(seasonDir, "records");
    const rawDir = path.join(seasonDir, "raw");
    await fs.mkdir(recordsDir, { recursive: true });
    if (keepRaw) await fs.mkdir(rawDir, { recursive: true });
    const schedule = await fetchSeasonSchedule(season, fetchImpl);
    const eligible = schedule.filter((game) => !/Postponed|Cancelled/i.test(game.status ?? ""));
    await mapLimit(eligible, concurrency, async ({ gamePk }) => {
      const recordPath = path.join(recordsDir, `${gamePk}.json.gz`);
      try {
        await fs.access(recordPath);
        return;
      } catch {}
      const feed = await fetchGameFeed(gamePk, fetchImpl);
      const sourceSha256 = stableHash(feed);
      if (keepRaw) await atomicWrite(path.join(rawDir, `${gamePk}.json.gz`), await gzip(JSON.stringify(feed)));
      const normalized = normalizeGameFeed(feed, sourceSha256);
      await atomicWrite(recordPath, await gzip(JSON.stringify(normalized)));
    });
    const counts = await rebuildSeasonTables(seasonDir);
    const manifest = {
      schemaVersion: "1.0.0",
      season,
      source: "MLB Stats API",
      scheduledGames: eligible.length,
      completedRecords: counts.games,
      ...counts,
      builtAt: new Date().toISOString()
    };
    await atomicWrite(path.join(seasonDir, "manifest.json"), JSON.stringify(manifest, null, 2) + "\n");
    seasonManifests.push(manifest);
  }
  const manifest = {
    schemaVersion: "1.0.0",
    seasons,
    source: "MLB Stats API",
    builtAt: new Date().toISOString(),
    seasonManifests
  };
  await atomicWrite(path.join(outputDir, "manifest.json"), JSON.stringify(manifest, null, 2) + "\n");
  return manifest;
}

class HistoryLibrary {
  constructor(outputDir = path.join("data", "history", "mlb")) {
    this.outputDir = path.resolve(outputDir);
  }
  async build(options = {}) {
    return buildHistoryLibrary({ ...options, outputDir: this.outputDir });
  }
  async manifest() {
    return JSON.parse(await fs.readFile(path.join(this.outputDir, "manifest.json"), "utf8"));
  }
}

module.exports = { buildHistoryLibrary, HistoryLibrary, rebuildSeasonTables, atomicWrite, mapLimit };
