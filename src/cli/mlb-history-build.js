#!/usr/bin/env node
// @ts-nocheck
const path = require("node:path");
const { buildHistoryLibrary } = require("../mlb/history/library.js");

function parseArgs(argv) {
  const args = {
    seasons: [2024, 2025],
    outputDir: path.join("data", "history", "mlb"),
    concurrency: 6,
    keepRaw: true
  };
  for (let i = 0; i < argv.length; i += 1) {
    if (argv[i] === "--seasons") args.seasons = argv[++i].split(",").map(Number);
    else if (argv[i] === "--output-dir") args.outputDir = argv[++i];
    else if (argv[i] === "--concurrency") args.concurrency = Number(argv[++i]);
    else if (argv[i] === "--no-raw") args.keepRaw = false;
  }
  return args;
}

async function main(argv = process.argv.slice(2)) {
  const manifest = await buildHistoryLibrary(parseArgs(argv));
  process.stdout.write(`${JSON.stringify(manifest, null, 2)}\n`);
  return manifest;
}

if (require.main === module) {
  main().catch((error) => {
    console.error(error.stack ?? error);
    process.exitCode = 1;
  });
}

module.exports = { main, parseArgs };
