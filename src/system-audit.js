const fs = require("node:fs/promises");
const path = require("node:path");
const { execFile } = require("node:child_process");

const { getProviderSetupStatus } = require("./config/provider-requirements.js");

function execFileSafe(command, args = [], options = {}) {
  return new Promise((resolve) => {
    execFile(
      command,
      args,
      {
        cwd: options.cwd,
        env: options.env ?? process.env,
        timeout: options.timeoutMs ?? 3000,
        shell: false
      },
      (error, stdout, stderr) => {
        resolve({
          ok: !error,
          command,
          args,
          stdout: stdout.trim(),
          stderr: stderr.trim(),
          error: error ? error.message : null
        });
      }
    );
  });
}

async function pathStatus(label, targetPath, options = {}) {
  const absolutePath = path.resolve(options.rootDir ?? process.cwd(), targetPath);

  try {
    const stat = await fs.stat(absolutePath);

    return {
      label,
      path: absolutePath,
      exists: true,
      type: stat.isDirectory() ? "directory" : stat.isFile() ? "file" : "other",
      sizeBytes: stat.isFile() ? stat.size : null,
      modifiedAt: stat.mtime.toISOString()
    };
  } catch (error) {
    return {
      label,
      path: absolutePath,
      exists: false,
      type: null,
      sizeBytes: null,
      modifiedAt: null,
      error: error?.code === "ENOENT" ? null : error.message
    };
  }
}

async function commandStatus(command, args = ["--version"], options = {}) {
  const which = await execFileSafe("sh", ["-lc", `command -v ${command}`], options);
  const version = which.ok && which.stdout
    ? await execFileSafe(command, args, options)
    : {
        ok: false,
        stdout: "",
        stderr: "",
        error: `${command} was not found on PATH.`
      };

  return {
    command,
    path: which.stdout || null,
    available: Boolean(which.ok && which.stdout),
    version: version.stdout || null,
    error: version.ok ? null : version.error || version.stderr || null
  };
}

function envFlag(name) {
  return {
    name,
    configured: Boolean(process.env[name])
  };
}

async function readPackage(rootDir) {
  try {
    const packageJson = JSON.parse(await fs.readFile(path.join(rootDir, "package.json"), "utf8"));

    return {
      name: packageJson.name ?? null,
      version: packageJson.version ?? null,
      scripts: Object.keys(packageJson.scripts ?? {}).sort()
    };
  } catch (error) {
    return {
      name: null,
      version: null,
      scripts: [],
      error: error.message
    };
  }
}

async function gitStatus(rootDir, options = {}) {
  const branch = await execFileSafe("git", ["branch", "--show-current"], { ...options, cwd: rootDir });
  const status = await execFileSafe("git", ["status", "--short"], { ...options, cwd: rootDir });
  const remotes = await execFileSafe("git", ["remote", "-v"], { ...options, cwd: rootDir });
  const statusLines = status.stdout ? status.stdout.split(/\r?\n/).filter(Boolean) : [];
  const remoteLines = remotes.stdout ? remotes.stdout.split(/\r?\n/).filter(Boolean) : [];

  return {
    available: branch.ok || status.ok,
    branch: branch.stdout || null,
    uncommittedEntries: statusLines.length,
    hasRemote: remoteLines.length > 0,
    remotes: remoteLines,
    warning: remoteLines.length > 0 ? null : "No GitHub remote is configured for this local repository."
  };
}

async function getSystemAudit(options = {}) {
  const rootDir = path.resolve(options.rootDir ?? process.cwd());
  const paths = await Promise.all([
    pathStatus("package.json", "package.json", { rootDir }),
    pathStatus("tsconfig.json", "tsconfig.json", { rootDir }),
    pathStatus("server", "src/server.js", { rootDir }),
    pathStatus("dashboard html", "src/dashboard/index.html", { rootDir }),
    pathStatus("dashboard js", "src/dashboard/app.js", { rootDir }),
    pathStatus("dashboard css", "src/dashboard/styles.css", { rootDir }),
    pathStatus("env example", ".env.example", { rootDir }),
    pathStatus("env local", ".env.local", { rootDir }),
    pathStatus("decision log", "data/logs/decision_log.jsonl", { rootDir }),
    pathStatus("auto-update latest", "data/logs/auto_update_latest.json", { rootDir }),
    pathStatus("auto-update snapshot", "data/cache/auto_update_snapshot.json", { rootDir }),
    pathStatus("bundled node", ".tools/node/bin/node", { rootDir }),
    pathStatus("bundled npm", ".tools/node/bin/npm", { rootDir })
  ]);
  const commands = await Promise.all([
    commandStatus("node", ["--version"], options),
    commandStatus("npm", ["--version"], options),
    commandStatus("git", ["--version"], options),
    commandStatus("gh", ["--version"], options)
  ]);
  const requiredPathLabels = new Set([
    "package.json",
    "tsconfig.json",
    "server",
    "dashboard html",
    "dashboard js",
    "dashboard css"
  ]);
  const requiredPathsOk = paths
    .filter((entry) => requiredPathLabels.has(entry.label))
    .every((entry) => entry.exists);
  const bundledNodeAvailable = paths.some((entry) => entry.label === "bundled node" && entry.exists);
  const bundledNpmAvailable = paths.some((entry) => entry.label === "bundled npm" && entry.exists);
  const packageInfo = await readPackage(rootDir);
  const git = await gitStatus(rootDir, options);
  const providerSetup = getProviderSetupStatus({ rootDir });
  const configuredKeys = [
    envFlag("THE_ODDS_API_KEY"),
    envFlag("ODDS_API_KEY"),
    envFlag("TENNIS_API_KEY"),
    envFlag("SPORTDEVS_API_KEY"),
    envFlag("EXA_API_KEY"),
    envFlag("OPENAI_API_KEY")
  ];
  const warnings = [];
  const nextActions = [];

  if (!commands.find((command) => command.command === "gh")?.available) {
    warnings.push("GitHub connector is available in Codex, but the local gh CLI is not installed on PATH.");
    nextActions.push({
      area: "GitHub",
      status: "blocked",
      action: "Install the GitHub CLI if you want local branch, push, and PR automation from this project."
    });
  }

  if (!git.hasRemote) {
    warnings.push("Local repo has no GitHub remote; publishing requires a target repository.");
    nextActions.push({
      area: "GitHub",
      status: "blocked",
      action: "Create or choose a GitHub repository, then add it as this repo's remote origin."
    });
  }

  if (!configuredKeys.some((key) => ["THE_ODDS_API_KEY", "ODDS_API_KEY"].includes(key.name) && key.configured)) {
    const oddsProvider = providerSetup.providers.find((provider) => provider.id === "the-odds-api");
    const blankText = oddsProvider?.blankInLocalFile ? " Blank key slots exist in .env.local; they still need real values." : "";
    warnings.push(`No odds API key is configured, so DraftKings/live odds remain manual or blocked.${blankText}`);
    nextActions.push({
      area: "Live odds",
      status: "manual",
      action: "Add THE_ODDS_API_KEY or ODDS_API_KEY to enable verified sportsbook odds ingestion."
    });
  }

  if (!configuredKeys.some((key) => ["TENNIS_API_KEY", "SPORTDEVS_API_KEY"].includes(key.name) && key.configured)) {
    warnings.push("No verified tennis stats API key is configured; tennis remains manual-only.");
    nextActions.push({
      area: "Tennis",
      status: "manual",
      action: "Add a verified tennis stats provider key before allowing automated tennis candidates."
    });
  }

  return {
    generatedAt: new Date().toISOString(),
    rootDir,
    process: {
      node: process.version,
      execPath: process.execPath,
      platform: process.platform,
      pid: process.pid
    },
    package: packageInfo,
    paths,
    commands,
    git,
    environment: {
      keys: configuredKeys
    },
    providerSetup,
    readiness: {
      localFilesOk: requiredPathsOk,
      bundledNodeAvailable,
      bundledNpmAvailable,
      nodeAvailable: commands.find((command) => command.command === "node")?.available ?? false,
      npmAvailable: commands.find((command) => command.command === "npm")?.available ?? false,
      gitAvailable: commands.find((command) => command.command === "git")?.available ?? false,
      githubReady: git.hasRemote && (commands.find((command) => command.command === "gh")?.available ?? false),
      sportsbookOddsReady: configuredKeys.some((key) => ["THE_ODDS_API_KEY", "ODDS_API_KEY"].includes(key.name) && key.configured),
      tennisReady: configuredKeys.some((key) => ["TENNIS_API_KEY", "SPORTDEVS_API_KEY"].includes(key.name) && key.configured)
    },
    nextActions,
    warnings
  };
}

module.exports = {
  getSystemAudit
};
