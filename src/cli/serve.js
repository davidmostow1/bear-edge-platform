#!/usr/bin/env node

const path = require("node:path");

const { loadEnvFiles } = require("../config/env.js");
const {
  getSupabaseSyncStatus,
  resolveSupabaseSettings
} = require("../config/supabase-settings.js");
const { safeErrorMessage } = require("../config/secrets.js");
const { createOperatorAuth } = require("../config/operator-auth.js");
const { createServer } = require("../server.js");
const { createAutoUpdateService } = require("../live/auto-update.js");
const { createStatsigControl } = require("../integrations/statsig-control.js");
const { createSupabaseClient } = require("../sync/supabase-client.js");
const { createSyncWorker } = require("../sync/sync-worker.js");

const PROJECT_ROOT = path.resolve(__dirname, "../..");
loadEnvFiles({ rootDir: PROJECT_ROOT });

function parseArgs(argv) {
  const args = [...argv];
  let port = Number(process.env.PORT ?? 3000);
  let host = process.env.BEAR_EDGE_HOST ?? "127.0.0.1";
  let autoUpdate = process.env.BEAR_EDGE_AUTO_UPDATE === "0" ? false : true;
  let autoUpdateIntervalMs = Number(process.env.BEAR_EDGE_AUTO_UPDATE_INTERVAL_MS ?? 60 * 1000);

  for (let index = 0; index < args.length; index += 1) {
    const value = args[index];

    if (value === "--port") {
      port = Number(args[index + 1]);
      index += 1;
      continue;
    }

    if (value === "--host") {
      host = String(args[index + 1] ?? "").trim();
      index += 1;
      continue;
    }

    if (value === "--lan") {
      host = "0.0.0.0";
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

  if (!host) {
    throw new Error("Host must be a non-empty string.");
  }

  if (!Number.isFinite(autoUpdateIntervalMs) || autoUpdateIntervalMs <= 0) {
    throw new Error("Auto-update interval must be a positive number of milliseconds.");
  }

  return { autoUpdate, autoUpdateIntervalMs, host, port };
}

function createRuntimeSyncWorker() {
  const configuration = getSupabaseSyncStatus();

  if (!configuration.configured) {
    return {
      worker: createSyncWorker({ configured: false, enabled: false }),
      configurationError: null
    };
  }

  try {
    const settings = resolveSupabaseSettings();
    const client = createSupabaseClient(settings);

    return {
      worker: createSyncWorker({
        client,
        ownerUserId: settings.ownerUserId,
        configured: true,
        enabled: true
      }),
      configurationError: null
    };
  } catch (error) {
    return {
      worker: createSyncWorker({ configured: false, enabled: false }),
      configurationError: safeErrorMessage(error)
    };
  }
}

async function main(argv = process.argv.slice(2)) {
  const { autoUpdate, autoUpdateIntervalMs, host, port } = parseArgs(argv);
  const lanMode = !["127.0.0.1", "localhost", "::1"].includes(host);
  const configuredOperatorToken = process.env.BEAR_EDGE_OPERATOR_TOKEN;
  const operatorAuth = createOperatorAuth({
    lanMode,
    requireToken: true,
    token: configuredOperatorToken
  });
  const generatedOperatorToken = operatorAuth.createLaunchToken();

  delete process.env.BEAR_EDGE_OPERATOR_TOKEN;
  const autoUpdateService = autoUpdate
    ? createAutoUpdateService({
        intervalMs: autoUpdateIntervalMs,
        oddsApiKey: process.env.THE_ODDS_API_KEY ?? process.env.ODDS_API_KEY
      })
    : null;
  const { worker: syncWorker, configurationError } = createRuntimeSyncWorker();
  const statsigControl = createStatsigControl();
  const statsigStatus = await statsigControl.initialize();
  const server = createServer({
    autoUpdateService,
    operatorAuth,
    statsigControl,
    syncWorker
  });

  await new Promise((resolve) => server.listen(port, host, () => resolve(undefined)));
  process.stdout.write(`Bear Edge server listening on http://${host}:${port}\n`);
  if (operatorAuth.getStatus().required) {
    process.stdout.write("Operator authentication required for protected operations.\n");
  }
  if (generatedOperatorToken) {
    process.stdout.write(
      `Operator bootstrap (shown once): http://${host}:${port}/dashboard#operatorToken=${encodeURIComponent(generatedOperatorToken)}\n`
    );
  }
  if (autoUpdateService) {
    autoUpdateService.start();
    process.stdout.write(`Auto-update enabled every ${Math.round(autoUpdateIntervalMs / 1000)} seconds.\n`);
  } else {
    process.stdout.write("Auto-update disabled.\n");
  }
  if (syncWorker.start()) {
    process.stdout.write("Supabase audit synchronization enabled.\n");
  } else if (configurationError) {
    process.stderr.write(`Supabase audit synchronization disabled: ${configurationError}\n`);
  } else {
    process.stdout.write("Supabase audit synchronization not configured; the local ledger remains authoritative.\n");
  }
  if (statsigStatus.initialized) {
    process.stdout.write("Statsig presentation controls enabled.\n");
  } else if (statsigStatus.configured) {
    process.stderr.write(`Statsig presentation controls using safe fallback: ${statsigStatus.lastSafeError ?? "initialization unavailable"}\n`);
  } else {
    process.stdout.write("Statsig not configured; presentation controls remain off.\n");
  }

  const shutdown = async () => {
    if (autoUpdateService) {
      autoUpdateService.stop();
    }
    await syncWorker.stop();
    await statsigControl.shutdown();
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
  createRuntimeSyncWorker,
  main,
  parseArgs
};
