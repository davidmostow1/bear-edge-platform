#!/usr/bin/env node

const fs = require("node:fs");
const http = require("node:http");
const path = require("node:path");
const { spawn } = require("node:child_process");

const { loadEnvFiles } = require("../config/env.js");

const PROJECT_ROOT = path.resolve(__dirname, "../..");
const DEFAULT_PORT = 3000;
const DEFAULT_HEALTH_TIMEOUT_MS = 20_000;
const DEFAULT_AUTO_UPDATE_INTERVAL_MS = 5 * 60 * 1000;

loadEnvFiles({ rootDir: PROJECT_ROOT });

function parseArgs(argv) {
  const args = [...argv];
  const options = {
    autoUpdate: process.env.BEAR_EDGE_AUTO_UPDATE === "0" ? false : true,
    autoUpdateIntervalMs: Number(process.env.BEAR_EDGE_AUTO_UPDATE_INTERVAL_MS ?? DEFAULT_AUTO_UPDATE_INTERVAL_MS),
    openBrowser: true,
    port: Number(process.env.PORT ?? DEFAULT_PORT),
    timeoutMs: DEFAULT_HEALTH_TIMEOUT_MS
  };

  for (let index = 0; index < args.length; index += 1) {
    const value = args[index];

    if (value === "--port") {
      options.port = Number(args[index + 1]);
      index += 1;
      continue;
    }

    if (value === "--timeout-ms") {
      options.timeoutMs = Number(args[index + 1]);
      index += 1;
      continue;
    }

    if (value === "--auto-update-interval-ms") {
      options.autoUpdateIntervalMs = Number(args[index + 1]);
      index += 1;
      continue;
    }

    if (value === "--no-auto-update") {
      options.autoUpdate = false;
      continue;
    }

    if (value === "--no-open") {
      options.openBrowser = false;
      continue;
    }

    throw new Error(`Unexpected argument: ${value}`);
  }

  if (!Number.isFinite(options.port) || options.port <= 0) {
    throw new Error("Port must be a positive number.");
  }

  if (!Number.isFinite(options.timeoutMs) || options.timeoutMs <= 0) {
    throw new Error("Health timeout must be a positive number of milliseconds.");
  }

  if (!Number.isFinite(options.autoUpdateIntervalMs) || options.autoUpdateIntervalMs <= 0) {
    throw new Error("Auto-update interval must be a positive number of milliseconds.");
  }

  return options;
}

function healthCheck(port) {
  return new Promise((resolve) => {
    const request = http.get(
      {
        hostname: "127.0.0.1",
        path: "/health",
        port,
        timeout: 1500
      },
      (response) => {
        response.resume();
        resolve(response.statusCode === 200);
      }
    );

    request.on("error", () => resolve(false));
    request.on("timeout", () => {
      request.destroy();
      resolve(false);
    });
  });
}

async function waitForHealth(port, timeoutMs = DEFAULT_HEALTH_TIMEOUT_MS) {
  const startedAt = Date.now();

  while (Date.now() - startedAt < timeoutMs) {
    if (await healthCheck(port)) {
      return true;
    }

    await new Promise((resolve) => setTimeout(resolve, 500));
  }

  return false;
}

function createLogStreams() {
  const logDir = path.join(PROJECT_ROOT, "data/logs");
  fs.mkdirSync(logDir, { recursive: true });

  return {
    stderr: fs.openSync(path.join(logDir, "server-error.log"), "a"),
    stdout: fs.openSync(path.join(logDir, "server.log"), "a")
  };
}

function startServer(options) {
  const servePath = path.join(PROJECT_ROOT, "src/cli/serve.js");
  const serveArgs = [servePath, "--port", String(options.port)];

  if (!options.autoUpdate) {
    serveArgs.push("--no-auto-update");
  } else {
    serveArgs.push("--auto-update-interval-ms", String(options.autoUpdateIntervalMs));
  }

  const logs = createLogStreams();
  const child = spawn(process.execPath, serveArgs, {
    cwd: PROJECT_ROOT,
    detached: true,
    env: process.env,
    stdio: ["ignore", logs.stdout, logs.stderr]
  });

  child.unref();

  return child.pid;
}

function openDashboard(port) {
  const url = `http://127.0.0.1:${port}/dashboard`;

  if (process.platform === "darwin") {
    const child = spawn("open", [url], {
      detached: true,
      stdio: "ignore"
    });
    child.unref();
    return url;
  }

  process.stdout.write(`Open ${url}\n`);
  return url;
}

async function launch(options) {
  const alreadyRunning = await healthCheck(options.port);
  let startedPid = null;

  if (!alreadyRunning) {
    startedPid = startServer(options);
  }

  const healthy = await waitForHealth(options.port, options.timeoutMs);

  if (!healthy) {
    throw new Error(
      `Bear Edge did not become healthy on port ${options.port}. Check data/logs/server-error.log.`
    );
  }

  const url = options.openBrowser ? openDashboard(options.port) : `http://127.0.0.1:${options.port}/dashboard`;

  return {
    alreadyRunning,
    healthy,
    startedPid,
    url
  };
}

async function main(argv = process.argv.slice(2)) {
  const options = parseArgs(argv);
  const result = await launch(options);

  if (result.alreadyRunning) {
    process.stdout.write(`Bear Edge is already running at ${result.url}\n`);
  } else {
    process.stdout.write(`Bear Edge started${result.startedPid ? ` with pid ${result.startedPid}` : ""}.\n`);
    process.stdout.write(`Dashboard: ${result.url}\n`);
  }

  process.stdout.write("Server logs: data/logs/server.log and data/logs/server-error.log\n");
  return result;
}

if (require.main === module) {
  main().catch((error) => {
    console.error(error.message);
    process.exitCode = 1;
  });
}

module.exports = {
  DEFAULT_HEALTH_TIMEOUT_MS,
  DEFAULT_PORT,
  healthCheck,
  launch,
  main,
  openDashboard,
  parseArgs,
  startServer,
  waitForHealth
};
