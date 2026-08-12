#!/usr/bin/env node

const fs = require("node:fs");
const http = require("node:http");
const os = require("node:os");
const path = require("node:path");
const { spawn } = require("node:child_process");

const { loadEnvFiles } = require("../config/env.js");
const { createOperatorAuth } = require("../config/operator-auth.js");

const PROJECT_ROOT = path.resolve(__dirname, "../..");
const DEFAULT_PORT = 3000;
const DEFAULT_HEALTH_TIMEOUT_MS = 20_000;
const DEFAULT_AUTO_UPDATE_INTERVAL_MS = 60 * 1000;

loadEnvFiles({ rootDir: PROJECT_ROOT });

function parseArgs(argv) {
  const args = [...argv];
  const options = {
    autoUpdate: process.env.BEAR_EDGE_AUTO_UPDATE === "0" ? false : true,
    autoUpdateIntervalMs: Number(process.env.BEAR_EDGE_AUTO_UPDATE_INTERVAL_MS ?? DEFAULT_AUTO_UPDATE_INTERVAL_MS),
    host: process.env.BEAR_EDGE_HOST ?? "127.0.0.1",
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

    if (value === "--host") {
      options.host = String(args[index + 1] ?? "").trim();
      index += 1;
      continue;
    }

    if (value === "--lan") {
      options.host = "0.0.0.0";
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

  if (!options.host) {
    throw new Error("Host must be a non-empty string.");
  }

  if (!Number.isFinite(options.timeoutMs) || options.timeoutMs <= 0) {
    throw new Error("Health timeout must be a positive number of milliseconds.");
  }

  if (!Number.isFinite(options.autoUpdateIntervalMs) || options.autoUpdateIntervalMs <= 0) {
    throw new Error("Auto-update interval must be a positive number of milliseconds.");
  }

  return options;
}

function urlHost(host) {
  return host === "0.0.0.0" ? "127.0.0.1" : host;
}

function preferredLanAddress() {
  let interfaces;

  try {
    interfaces = os.networkInterfaces();
  } catch {
    return "127.0.0.1";
  }

  for (const entries of Object.values(interfaces)) {
    for (const entry of entries ?? []) {
      if (entry.family === "IPv4" && !entry.internal) {
        return entry.address;
      }
    }
  }

  return "127.0.0.1";
}

function displayHost(host) {
  return host === "0.0.0.0" ? preferredLanAddress() : host;
}

function healthHost(host) {
  return host === "0.0.0.0" ? preferredLanAddress() : urlHost(host);
}

function healthCheck(port, host = "127.0.0.1") {
  return new Promise((resolve) => {
    const request = http.get(
      {
        hostname: healthHost(host),
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

async function waitForHealth(port, timeoutMs = DEFAULT_HEALTH_TIMEOUT_MS, host = "127.0.0.1") {
  const startedAt = Date.now();

  while (Date.now() - startedAt < timeoutMs) {
    if (await healthCheck(port, host)) {
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
  const serveArgs = [servePath, "--port", String(options.port), "--host", options.host];

  if (!options.autoUpdate) {
    serveArgs.push("--no-auto-update");
  } else {
    serveArgs.push("--auto-update-interval-ms", String(options.autoUpdateIntervalMs));
  }

  const logs = createLogStreams();
  const child = spawn(process.execPath, serveArgs, {
    cwd: PROJECT_ROOT,
    detached: true,
    env: {
      ...process.env,
      ...(options.operatorToken ? { BEAR_EDGE_OPERATOR_TOKEN: options.operatorToken } : {})
    },
    stdio: ["ignore", logs.stdout, logs.stderr]
  });

  child.unref();

  return child.pid;
}

function buildDashboardUrl(port, host = "127.0.0.1", operatorToken = null) {
  const baseUrl = `http://${displayHost(host)}:${port}/dashboard`;

  return operatorToken
    ? `${baseUrl}#operatorToken=${encodeURIComponent(operatorToken)}`
    : baseUrl;
}

function openDashboard(port, host = "127.0.0.1", operatorToken = null) {
  const privateUrl = buildDashboardUrl(port, host, operatorToken);
  const publicUrl = buildDashboardUrl(port, host);

  if (process.platform === "darwin") {
    const child = spawn("open", [privateUrl], {
      detached: true,
      stdio: "ignore"
    });
    child.unref();
    return publicUrl;
  }

  process.stdout.write(`Open ${publicUrl}\n`);
  return publicUrl;
}

async function launch(options) {
  const alreadyRunning = await healthCheck(options.port, options.host);
  let startedPid = null;
  const lanMode = !["127.0.0.1", "localhost", "::1"].includes(options.host);
  const tokenRequired = true;
  const configuredOperatorToken = String(process.env.BEAR_EDGE_OPERATOR_TOKEN ?? "").trim() || null;
  let operatorToken = configuredOperatorToken;

  if (alreadyRunning && tokenRequired && !operatorToken) {
    throw new Error(
      "An authenticated Bear Edge server is already running, but its one-time operator token is unavailable. Restart it with the LAN launcher or set BEAR_EDGE_OPERATOR_TOKEN."
    );
  }

  if (!alreadyRunning) {
    if (options.host === "0.0.0.0" && await healthCheck(options.port, "127.0.0.1")) {
      throw new Error(
        `Port ${options.port} is already used by a local-only Bear Edge server. Stop it or choose another port for LAN mode.`
      );
    }
    if (tokenRequired && !operatorToken) {
      const bootstrapAuth = createOperatorAuth({ lanMode, requireToken: true });
      operatorToken = bootstrapAuth.createLaunchToken();
    }

    startedPid = startServer({ ...options, operatorToken });
  }

  const healthy = await waitForHealth(options.port, options.timeoutMs, options.host);

  if (!healthy) {
    throw new Error(
      `Bear Edge did not become healthy on port ${options.port}. Check data/logs/server-error.log.`
    );
  }

  const url = options.openBrowser
    ? openDashboard(options.port, options.host, operatorToken)
    : buildDashboardUrl(
        options.port,
        options.host,
        configuredOperatorToken ? null : operatorToken
      );

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
  buildDashboardUrl,
  DEFAULT_HEALTH_TIMEOUT_MS,
  DEFAULT_PORT,
  healthCheck,
  launch,
  main,
  openDashboard,
  parseArgs,
  preferredLanAddress,
  startServer,
  displayHost,
  healthHost,
  urlHost,
  waitForHealth
};
