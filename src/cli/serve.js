#!/usr/bin/env node

const path = require("node:path");

const { loadEnvFiles } = require("../config/env.js");
const { createServer } = require("../server.js");
const { createAutoUpdateService } = require("../live/auto-update.js");

const PROJECT_ROOT = path.resolve(__dirname, "../..");
loadEnvFiles({ rootDir: PROJECT_ROOT });

function parseArgs(argv) {
  const args = [...argv];
  let port = Number(process.env.PORT ?? 3000);
  let autoUpdate = process.env.BEAR_EDGE_AUTO_UPDATE === "0" ? false : true;
  let autoUpdateIntervalMs = Number(process.env.BEAR_EDGE_AUTO_UPDATE_INTERVAL_MS ?? 5 * 60 * 1000);

  for (let index = 0; index < args.length; index += 1) {
    const value = args[index];

    if (value === "--port") {
      port = Number(args[index + 1]);
      index += 1;
      continue;
    }

    if (value === "--no-auto-update") {
      autoUpdate = false;
      continue;
    }

    if (value === "--auto-update-interval-ms") {
      autoUpdateIntervalMs = Number(args[index + 1]);
      index += 1;
      continue;
    }

    throw new Error(`Unexpected argument: ${value}`);
  }

  if (!Number.isFinite(port) || port <= 0) {
    throw new Error("Port must be a positive number.");
  }

  if (!Number.isFinite(autoUpdateIntervalMs) || autoUpdateIntervalMs <= 0) {
    throw new Error("Auto-update interval must be a positive number of milliseconds.");
  }

  return { autoUpdate, autoUpdateIntervalMs, port };
}

async function main(argv = process.argv.slice(2)) {
  const { autoUpdate, autoUpdateIntervalMs, port } = parseArgs(argv);
  const autoUpdateService = autoUpdate
    ? createAutoUpdateService({
        intervalMs: autoUpdateIntervalMs,
        oddsApiKey: process.env.THE_ODDS_API_KEY ?? process.env.ODDS_API_KEY
      })
    : null;
  const server = createServer({
    autoUpdateService
  });

  await new Promise((resolve) => server.listen(port, () => resolve(undefined)));
  process.stdout.write(`Bear Edge server listening on http://127.0.0.1:${port}\n`);
  if (autoUpdateService) {
    autoUpdateService.start();
    process.stdout.write(`Auto-update enabled every ${Math.round(autoUpdateIntervalMs / 1000)} seconds.\n`);
  } else {
    process.stdout.write("Auto-update disabled.\n");
  }

  const shutdown = async () => {
    if (autoUpdateService) {
      autoUpdateService.stop();
    }
    await new Promise((resolve, reject) => server.close((error) => (error ? reject(error) : resolve())));
    process.exit(0);
  };

  process.on("SIGINT", shutdown);
  process.on("SIGTERM", shutdown);

  return server;
}

if (require.main === module) {
  main().catch((error) => {
    console.error(error.message);
    process.exitCode = 1;
  });
}

module.exports = {
  main,
  parseArgs
};
