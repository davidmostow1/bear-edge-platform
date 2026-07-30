const fs = require("node:fs/promises");
const path = require("node:path");
const { execFile } = require("node:child_process");

const { getDecisionLogDashboard } = require("./analytics.js");
const { getProviderSetupStatus } = require("./config/provider-requirements.js");
const { getSupabaseSyncStatus } = require("./config/supabase-settings.js");
const { getDataEdgeAudit } = require("./data-edge.js");
const { readOutboxState } = require("./sync/outbox.js");
const { getSystemAudit } = require("./system-audit.js");
const { loadRegisteredModels } = require("./calibration/model-evidence.js");

function execFileSafe(command, args = [], options = {}) {
  return new Promise((resolve) => {
    execFile(
      command,
      args,
      {
        cwd: options.cwd,
        env: options.env ?? process.env,
        timeout: options.timeoutMs ?? 4000,
        shell: false
      },
      (error, stdout, stderr) => {
        resolve({
          ok: !error,
          stdout: stdout.trim(),
          stderr: stderr.trim(),
          error: error ? error.message : null
        });
      }
    );
  });
}

async function readJsonFile(filePath, fallback = null) {
  try {
    return JSON.parse(await fs.readFile(filePath, "utf8"));
  } catch {
    return fallback;
  }
}

async function readTextFile(filePath, fallback = "") {
  try {
    return await fs.readFile(filePath, "utf8");
  } catch {
    return fallback;
  }
}

async function fileExists(filePath) {
  try {
    await fs.access(filePath);
    return true;
  } catch {
    return false;
  }
}

async function trackedFiles(rootDir) {
  const result = await execFileSafe("git", ["ls-files"], { cwd: rootDir });

  if (!result.ok || !result.stdout) {
    return [];
  }

  return result.stdout.split(/\r?\n/).filter(Boolean);
}

function trackedSecretFindings(files) {
  const blockedPatterns = [
    /^\.env$/,
    /^\.env\.local$/,
    /^\.env\..*\.local$/,
    /^\.tools\//,
    /^\.codex\//,
    /^node_modules\//,
    /^data\/cache\//,
    /^data\/logs\/.*\.(json|jsonl|log)$/
  ];

  return files.filter((file) => blockedPatterns.some((pattern) => pattern.test(file)));
}

async function gitReadiness(rootDir) {
  const [branch, status, remote, lastCommit, upstream] = await Promise.all([
    execFileSafe("git", ["branch", "--show-current"], { cwd: rootDir }),
    execFileSafe("git", ["status", "--short"], { cwd: rootDir }),
    execFileSafe("git", ["remote", "-v"], { cwd: rootDir }),
    execFileSafe("git", ["log", "--oneline", "-1"], { cwd: rootDir }),
    execFileSafe("git", ["rev-parse", "--abbrev-ref", "--symbolic-full-name", "@{u}"], { cwd: rootDir })
  ]);
  const statusLines = status.stdout ? status.stdout.split(/\r?\n/).filter(Boolean) : [];
  const remoteLines = remote.stdout ? remote.stdout.split(/\r?\n/).filter(Boolean) : [];

  return {
    available: branch.ok || status.ok,
    branch: branch.stdout || null,
    upstream: upstream.ok ? upstream.stdout : null,
    clean: statusLines.length === 0,
    uncommittedEntries: statusLines.length,
    hasRemote: remoteLines.length > 0,
    remotes: remoteLines,
    lastCommit: lastCommit.stdout || null
  };
}

function scoreChecks(checks) {
  const scoreableChecks = checks.filter((check) => check.status !== "info");
  const passed = checks.filter((check) => check.status === "pass").length;
  const warnings = checks.filter((check) => check.status === "warn").length;
  const failed = checks.filter((check) => check.status === "fail").length;
  const info = checks.filter((check) => check.status === "info").length;
  const scoreablePassed = scoreableChecks.filter((check) => check.status === "pass").length;
  const score = Math.max(0, Math.round((scoreablePassed / Math.max(scoreableChecks.length, 1)) * 100) - failed * 12 - warnings * 2);

  return {
    score,
    passed,
    warnings,
    failed,
    info,
    total: checks.length
  };
}

function check(status, area, message, detail = null, nextAction = null) {
  return {
    status,
    area,
    message,
    detail,
    nextAction: status === "pass" ? null : nextAction
  };
}

function getModelCalibrationReadiness(rootDir, options = {}) {
  try {
    const registry = loadRegisteredModels({
      rootDir,
      ...(options.modelRegistryOptions ?? {})
    });
    const validatedModels = registry.models.filter((model) => model.validated);

    return {
      status: validatedModels.length > 0 ? "validated" : "blocked",
      registryValid: true,
      registryPath: registry.registryPath,
      schemaVersion: registry.schemaVersion,
      policyVersion: registry.policyVersion,
      policyDigest: registry.policyDigest,
      policyRegisteredAt: registry.policyRegisteredAt,
      registeredModelCount: registry.models.length,
      validatedModelCount: validatedModels.length,
      models: registry.models,
      error: null
    };
  } catch (error) {
    return {
      status: "invalid",
      registryValid: false,
      registryPath: path.join(rootDir, "models", "registry.json"),
      schemaVersion: null,
      policyVersion: null,
      policyDigest: null,
      policyRegisteredAt: null,
      registeredModelCount: 0,
      validatedModelCount: 0,
      models: [],
      error: error instanceof Error ? error.message : String(error)
    };
  }
}

function laneStatus(summary) {
  if (summary.failed > 0) {
    return "blocked";
  }

  if (summary.warnings > 0) {
    return "needs-work";
  }

  if (summary.info > 0) {
    return "needs-evidence";
  }

  return "ready";
}

function summarizeLane(id, label, description, areas, checks) {
  const areaSet = new Set(areas);
  const laneChecks = checks.filter((entry) => areaSet.has(entry.area));
  const summary = scoreChecks(laneChecks);

  return {
    id,
    label,
    description,
    status: laneStatus(summary),
    summary,
    checks: laneChecks.map((entry) => ({
      status: entry.status,
      area: entry.area,
      message: entry.message
    }))
  };
}

function readinessStatus(summary) {
  if (summary.failed > 0) {
    return "blocked";
  }

  if (summary.warnings > 0) {
    return "shippable-with-warnings";
  }

  if (summary.info > 0) {
    return "ready-with-evidence-gates";
  }

  return "ready";
}

async function resolveSyncHealth(options = {}) {
  if (options.syncHealth && typeof options.syncHealth === "object") {
    return {
      configured: Boolean(options.syncHealth.configured),
      enabled: Boolean(options.syncHealth.enabled),
      pending: Number(options.syncHealth.pending) || 0,
      retryableFailures: Number(options.syncHealth.retryableFailures) || 0,
      terminalFailures: Number(options.syncHealth.terminalFailures) || 0,
      synchronized: Number(options.syncHealth.synchronized) || 0,
      integrityIssues: Number(options.syncHealth.integrityIssues) || 0,
      secretReturned: false
    };
  }

  const configuration = getSupabaseSyncStatus();

  try {
    const outbox = await readOutboxState({
      outboxPath: options.outboxPath,
      ledgerPath: options.logPath
    });

    return {
      configured: configuration.configured,
      enabled: false,
      pending: outbox.pending.length,
      retryableFailures: outbox.summary.retryableFailures,
      terminalFailures: outbox.summary.terminalFailures,
      synchronized: outbox.summary.synchronized,
      integrityIssues: outbox.malformedLines.length + outbox.invalidEvents.length,
      secretReturned: false
    };
  } catch (_error) {
    return {
      configured: configuration.configured,
      enabled: false,
      pending: 0,
      retryableFailures: 0,
      terminalFailures: 0,
      synchronized: 0,
      integrityIssues: 1,
      secretReturned: false
    };
  }
}

async function getReleaseReadiness(options = {}) {
  const rootDir = path.resolve(options.rootDir ?? process.cwd());
  const packageJson = await readJsonFile(path.join(rootDir, "package.json"), {});
  const syncHealth = await resolveSyncHealth(options);
  const [
    ciExists,
    docsExists,
    providerDocsExists,
    dashboardHtmlExists,
    dashboardJsExists,
    dashboardCssExists,
    serveCliExists,
    launchCliExists,
    releaseScriptExists,
    publicMlbProviderExists,
    publicNhlProviderExists,
    serverText,
    serveText
  ] = await Promise.all([
    fileExists(path.join(rootDir, ".github", "workflows", "ci.yml")),
    fileExists(path.join(rootDir, "docs", "PRODUCTION_READINESS.md")),
    fileExists(path.join(rootDir, "docs", "API_PROVIDER_REQUIREMENTS.md")),
    fileExists(path.join(rootDir, "src", "dashboard", "index.html")),
    fileExists(path.join(rootDir, "src", "dashboard", "app.js")),
    fileExists(path.join(rootDir, "src", "dashboard", "styles.css")),
    fileExists(path.join(rootDir, "src", "cli", "serve.js")),
    fileExists(path.join(rootDir, "src", "cli", "launch.js")),
    fileExists(path.join(rootDir, "script", "build_release_readiness.js")),
    fileExists(path.join(rootDir, "src", "live", "providers", "mlb.js")),
    fileExists(path.join(rootDir, "src", "live", "providers", "nhl.js")),
    readTextFile(path.join(rootDir, "src", "server.js")),
    readTextFile(path.join(rootDir, "src", "cli", "serve.js"))
  ]);
  const files = await trackedFiles(rootDir);
  const trackedSecrets = trackedSecretFindings(files);
  const git = await gitReadiness(rootDir);
  const providerSetup = getProviderSetupStatus({ rootDir });
  const systemAudit = await getSystemAudit({
    rootDir,
    operatorAuthStatus: options.operatorAuthStatus,
    statsigStatus: options.statsigStatus
  });
  const decisionLog = await getDecisionLogDashboard({
    logPath: options.logPath
  });
  const dataEdge = options.dataEdge ?? await getDataEdgeAudit({
    rootDir,
    date: options.date ?? "today",
    days: Number.isInteger(options.days) ? options.days : 1,
    limit: Number.isInteger(options.limit) ? options.limit : 3,
    maxCandidates: Number.isInteger(options.maxCandidates) ? options.maxCandidates : 80,
    maxEventsToPrice: Number.isInteger(options.maxEventsToPrice) ? options.maxEventsToPrice : 10,
    bankroll: Number.isFinite(options.bankroll) ? options.bankroll : 1000,
    bookmakers: options.bookmakers ?? "draftkings",
    regions: options.regions ?? "us",
    fetchJsonImpl: options.fetchJsonImpl,
    fetchTextImpl: options.fetchTextImpl,
    oddsApiKey: options.oddsApiKey,
    autoUpdateStatus: options.autoUpdateStatus ?? null,
    autoUpdateSnapshotPath: options.autoUpdateSnapshotPath,
    logPath: options.logPath
  });
  const modelCalibration = getModelCalibrationReadiness(rootDir, options);
  const oddsProvider = providerSetup.providers.find((provider) => provider.id === "the-odds-api") ?? null;
  const statsProvider = providerSetup.providers.find((provider) => provider.id === "sportsdataio") ?? null;
  const tennisProvider = providerSetup.providers.find((provider) => provider.id === "tennis-stats") ?? null;
  const oddsReady = dataEdge.odds?.status === "verified";
  const oddsRuntimeConfigured = Boolean(oddsProvider?.configured);
  const oddsSaved = Boolean(oddsProvider?.savedLocally);
  const statsReady = Boolean(statsProvider?.configured);
  const tennisReady = Boolean(tennisProvider?.configured);
  const validationGate = decisionLog.validationGate ?? {
    complete: false,
    currentWinStreak: 0,
    requiredWinStreak: 3
  };
  const dataQualityStatus = decisionLog.dataQuality?.status ?? "unknown";
  const dashboardReady = dashboardHtmlExists && dashboardJsExists && dashboardCssExists;
  const runtimeControls = systemAudit.runtimeControls;
  const operatorWriteBoundaryReady = runtimeControls.operatorAuth.writeBoundaryReady;
  const statsigFailClosed = runtimeControls.statsig.failClosed;
  const localLedgerIntegrityIssues = (decisionLog.malformedLines?.length ?? 0)
    + (decisionLog.duplicateIds?.length ?? 0)
    + (decisionLog.digestConflicts?.length ?? 0)
    + (decisionLog.invalidRecords?.length ?? 0);
  const localhostBound = serveText.includes('let host = process.env.BEAR_EDGE_HOST ?? "127.0.0.1"') && serveText.includes("server.listen(port, host");
  const apiSurfaceReady = [
    "/api/release-readiness",
    "/api/system-audit",
    "/api/data-edge-audit",
    "/api/provider-requirements",
    "/api/ocr-snapshot",
    "/api/candidates",
    "/api/best-mlb-targets",
    "/api/amend",
    "/api/auto-update",
    "/api/sync-health",
    "/api/sync/run"
  ].every((endpoint) => serverText.includes(endpoint));
  const oddsCheckMessage = oddsReady
    ? "Verified odds provider live pricing is usable"
    : dataEdge.odds?.status === "provider_error"
      ? "Verified odds provider live pricing is failing"
      : dataEdge.odds?.status === "unmatched"
        ? "Verified odds provider is connected but candidate props are unmatched"
        : oddsRuntimeConfigured
          ? "Verified odds provider is configured but live pricing is not verified"
          : oddsSaved
          ? "Verified odds provider key is saved locally but live pricing is not verified"
          : "Verified odds provider is not configured";
  const oddsNextAction = dataEdge.odds?.status === "provider_error"
    ? "Fix or replace the verified odds API key before expecting automatic priced DraftKings bets."
    : dataEdge.odds?.status === "unmatched"
      ? "Use manual price checks or improve prop-name/line matching until provider props match generated candidates."
      : oddsRuntimeConfigured
        ? "Test the configured key and explicitly refresh market prices before expecting automatic priced DraftKings bets."
        : oddsSaved
        ? "Restart the Bear Edge server or test the saved key from the dashboard so live pricing can be verified."
        : "Add and verify THE_ODDS_API_KEY in the dashboard or .env.local.";
  const projectionState = syncHealth.integrityIssues > 0
    ? {
        status: "fail",
        message: "Remote audit projection state is invalid",
        gateStatus: "blocked",
        action: "Repair the append-only synchronization outbox before relying on remote audit records."
      }
    : syncHealth.terminalFailures > 0
      ? {
          status: "fail",
          message: "Remote audit projection has terminal failures",
          gateStatus: "blocked",
          action: "Resolve every terminal digest, schema, authentication, or reference failure before release."
        }
      : !syncHealth.configured
        ? {
            status: "warn",
            message: "Supabase audit projection is not configured",
            gateStatus: "not_configured",
            action: "Configure the optional Supabase projection for centralized audit retention; local records remain authoritative."
          }
        : syncHealth.pending > 0 || syncHealth.retryableFailures > 0
          ? {
              status: "warn",
              message: "Remote audit projection has pending retries",
              gateStatus: "degraded",
              action: "Allow the retry worker to drain pending records and investigate persistent provider availability failures."
            }
          : {
              status: "pass",
              message: "Remote audit projection is current",
              gateStatus: "current",
              action: null
            };
  const evidenceGates = [
    {
      id: "model-calibration-registry",
      label: "Validated model calibration",
      status: modelCalibration.status,
      complete: modelCalibration.validatedModelCount > 0,
      registeredModelCount: modelCalibration.registeredModelCount,
      validatedModelCount: modelCalibration.validatedModelCount,
      models: modelCalibration.models,
      action: modelCalibration.registryValid
        ? "Promote a model only after its immutable calibration report passes every registered policy threshold."
        : "Repair the model registry or its referenced calibration reports before evaluating production probabilities."
    },
    {
      id: "remote-audit-projection",
      label: "Remote audit projection",
      status: projectionState.gateStatus,
      complete: projectionState.status === "pass",
      pending: syncHealth.pending,
      retryableFailures: syncHealth.retryableFailures,
      terminalFailures: syncHealth.terminalFailures,
      action: projectionState.action ?? "Continue monitoring append-only synchronization health."
    },
    {
      id: "decision-log-quality",
      label: "Decision-log quality",
      status: dataQualityStatus,
      complete: dataQualityStatus === "ok",
      action: "Settle every logged BET call with result, closing line, and false-positive notes."
    },
    {
      id: "recent-win-streak",
      label: "Recent win streak (descriptive)",
      status: validationGate.complete ? "complete" : "incomplete",
      complete: Boolean(validationGate.complete),
      current: validationGate.currentWinStreak ?? 0,
      required: validationGate.requiredWinStreak ?? 3,
      action: "Use this streak as descriptive history only; model calibration and out-of-sample validation control production eligibility."
    },
    {
      id: "licensed-stats-provider",
      label: "Licensed injury/stat feed",
      status: statsReady ? "configured" : "not_configured",
      complete: statsReady,
      action: "Add SportsDataIO, Sportradar, or another licensed stats/injury feed before commercial injury automation."
    },
    {
      id: "tennis-provider",
      label: "Verified tennis feed",
      status: tennisReady ? "configured" : "manual_only",
      complete: tennisReady,
      action: "Add a verified tennis provider before automated tennis picks are enabled."
    }
  ];
  const checks = [
    check(packageJson.scripts?.verify ? "pass" : "fail", "verification", "npm run verify script exists"),
    check(packageJson.scripts?.typecheck ? "pass" : "fail", "verification", "TypeScript typecheck script exists"),
    check(packageJson.scripts?.test ? "pass" : "fail", "verification", "Unit test script exists"),
    check(ciExists ? "pass" : "warn", "verification", "GitHub Actions CI workflow exists", null, "Refresh GitHub auth with workflow scope, then add .github/workflows/ci.yml running npm ci and npm run verify."),
    check(git.hasRemote ? "pass" : "fail", "github", "Git remote is configured", git.remotes, "Create or connect a GitHub remote before treating this as a shareable product."),
    check(git.clean ? "pass" : "warn", "github", git.clean ? "Working tree is clean" : "Working tree has uncommitted entries", git.uncommittedEntries, "Commit reviewed product changes, then rerun the release audit."),
    check(trackedSecrets.length === 0 ? "pass" : "fail", "security", "No local secrets/log/cache paths are tracked", trackedSecrets, "Remove tracked secrets/logs/cache from git and rotate any leaked credential."),
    check(localhostBound ? "pass" : "fail", "security", "Local dashboard binds to localhost by default", null, "Bind the local server to 127.0.0.1 unless an explicit host override is supplied."),
    check(
      operatorWriteBoundaryReady ? "pass" : "fail",
      "security",
      runtimeControls.operatorAuth.lanMode
        ? "LAN write operations require operator authentication"
        : "Localhost write policy is explicit",
      runtimeControls.operatorAuth,
      "Require a generated or configured operator bearer token before binding Bear Edge to a LAN interface."
    ),
    check(
      statsigFailClosed ? "pass" : "fail",
      "security",
      "Statsig controls are presentation-only and fail closed",
      runtimeControls.statsig,
      "Disable remote controls and restore deterministic control fallback before release."
    ),
    check(dashboardReady ? "pass" : "fail", "runtime", "Dashboard static assets exist"),
    check(systemAudit.readiness?.localFilesOk ? "pass" : "fail", "runtime", "Required local files exist"),
    check(systemAudit.readiness?.nodeAvailable || systemAudit.paths?.some((entry) => entry.label === "bundled node" && entry.exists) ? "pass" : "warn", "runtime", "Node runtime is available"),
    check(serveCliExists && launchCliExists ? "pass" : "fail", "runtime", "Serve and launch CLIs exist"),
    check(apiSurfaceReady ? "pass" : "fail", "runtime", "Operational API surface exists"),
    check(
      projectionState.status,
      "analytics",
      projectionState.message,
      syncHealth,
      projectionState.action
    ),
    check(
      localLedgerIntegrityIssues === 0 ? "pass" : "fail",
      "analytics",
      localLedgerIntegrityIssues === 0
        ? "Authoritative local ledger passes integrity inspection"
        : "Authoritative local ledger has integrity failures",
      {
        malformedLines: decisionLog.malformedLines?.length ?? 0,
        duplicateIds: decisionLog.duplicateIds?.length ?? 0,
        digestConflicts: decisionLog.digestConflicts?.length ?? 0,
        invalidRecords: decisionLog.invalidRecords?.length ?? 0
      },
      "Repair malformed, duplicate, conflicting, or schema-invalid ledger records before release."
    ),
    check(releaseScriptExists ? "pass" : "warn", "runtime", "Release-readiness audit script exists"),
    check(publicMlbProviderExists && publicNhlProviderExists ? "pass" : "warn", "providers", "Official public MLB/NHL stat adapters exist", null, "Restore src/live/providers/mlb.js and src/live/providers/nhl.js before generating sport stat candidates."),
    check(oddsReady ? "pass" : "warn", "providers", oddsCheckMessage, dataEdge.odds, oddsNextAction),
    check(statsReady ? "pass" : "info", "providers", statsReady ? "Licensed stats/injury provider is configured" : "Licensed stats/injury provider is an evidence gate, not a local app blocker", statsProvider ? { id: statsProvider.id, status: statsProvider.status, secretReturned: false } : null, "Add SportsDataIO, Sportradar, or another licensed stats/injury feed before relying on automated injury gates commercially."),
    check(tennisReady ? "pass" : "info", "providers", tennisReady ? "Verified tennis stats provider is configured" : "Tennis automation is locked until a verified provider is configured", tennisProvider ? { id: tennisProvider.id, status: tennisProvider.status, secretReturned: false } : null, "Add a verified tennis data provider before allowing automated tennis picks."),
    check(dataQualityStatus === "ok" ? "pass" : "info", "analytics", `Decision-log data quality is ${dataQualityStatus}`, null, "Settle logged BET calls with result, closing line, and false-positive notes until analytics quality is ok."),
    check(
      !modelCalibration.registryValid
        ? "fail"
        : modelCalibration.validatedModelCount > 0 ? "pass" : "info",
      "analytics",
      !modelCalibration.registryValid
        ? "Model calibration registry or report evidence is invalid"
        : modelCalibration.validatedModelCount > 0
          ? `${modelCalibration.validatedModelCount} registered model calibration entries are validated`
          : "No registered model calibration entry is validated for BET decisions",
      modelCalibration,
      modelCalibration.registryValid
        ? "Build out-of-sample calibration evidence and promote only entries that pass the registered policy."
        : "Repair the model registry and every referenced report digest before release."
    ),
    check(docsExists ? "pass" : "warn", "documentation", "Production-readiness documentation exists"),
    check(providerDocsExists ? "pass" : "warn", "documentation", "API provider requirements documentation exists")
  ];
  const summary = scoreChecks(checks);
  const status = readinessStatus(summary);
  const lanes = [
    summarizeLane("local-app", "Local App", "Can a user run the local product safely and use the dashboard?", ["verification", "runtime", "security"], checks),
    summarizeLane("data-edge", "Data Edge", "Are odds, injuries, source freshness, and validation data strong enough to trust?", ["providers", "analytics"], checks),
    summarizeLane("commercial", "Commercial Readiness", "Is this clean enough for GitHub review, CI, documentation, and buyer-grade diligence?", ["github", "verification", "security", "documentation", "analytics"], checks)
  ];

  return {
    generatedAt: new Date().toISOString(),
    status,
    summary,
    package: {
      name: packageJson.name ?? null,
      version: packageJson.version ?? null
    },
    git,
    providerSummary: providerSetup.summary,
    syncHealth,
    runtimeControls,
    operationalEvidence: {
      localLedger: {
        integrityStatus: localLedgerIntegrityIssues === 0 ? "valid" : "invalid",
        integrityIssues: localLedgerIntegrityIssues,
        malformedLines: decisionLog.malformedLines?.length ?? 0,
        duplicateIds: decisionLog.duplicateIds?.length ?? 0,
        digestConflicts: decisionLog.digestConflicts?.length ?? 0,
        invalidRecords: decisionLog.invalidRecords?.length ?? 0,
        totalEvaluations: decisionLog.summary?.totalEvaluations ?? 0
      },
      outbox: {
        configured: syncHealth.configured,
        enabled: syncHealth.enabled,
        pending: syncHealth.pending,
        retryableFailures: syncHealth.retryableFailures,
        terminalFailures: syncHealth.terminalFailures,
        synchronized: syncHealth.synchronized,
        integrityIssues: syncHealth.integrityIssues,
        secretReturned: false
      },
      modelRegistry: {
        status: modelCalibration.status,
        registryValid: modelCalibration.registryValid,
        registeredModelCount: modelCalibration.registeredModelCount,
        validatedModelCount: modelCalibration.validatedModelCount,
        policyVersion: modelCalibration.policyVersion,
        policyDigest: modelCalibration.policyDigest
      }
    },
    dataEdge,
    modelCalibration,
    lanes,
    evidenceGates,
    nextActions: checks
      .filter((entry) => entry.status !== "pass")
      .map((entry) => ({
        area: entry.area,
        status: entry.status,
        check: entry.message,
        action: entry.nextAction ?? entry.message
      })),
    decisionLog: {
      totalEvaluations: decisionLog.summary?.totalEvaluations ?? 0,
      betCalls: decisionLog.summary?.verdictCounts?.BET ?? 0,
      dataQualityStatus,
      validationGate
    },
    checks,
    trackedFiles: {
      count: files.length,
      blockedMatches: trackedSecrets
    }
  };
}

function renderReleaseReadinessMarkdown(report) {
  const lines = [
    "# Bear Edge Release Readiness",
    "",
    `Generated: ${report.generatedAt}`,
    `Status: ${report.status}`,
    `Score: ${report.summary.score}/100`,
    "",
    "## Summary",
    "",
    `- Package: ${report.package.name ?? "-"} ${report.package.version ?? ""}`.trim(),
    `- Git branch: ${report.git.branch ?? "-"}`,
    `- Git upstream: ${report.git.upstream ?? "-"}`,
    `- Last commit: ${report.git.lastCommit ?? "-"}`,
    `- Decision evaluations: ${report.decisionLog.totalEvaluations}`,
    `- BET calls: ${report.decisionLog.betCalls}`,
    `- Data quality: ${report.decisionLog.dataQualityStatus}`,
    `- Recent win streak (descriptive): ${report.decisionLog.validationGate.currentWinStreak ?? 0}/${report.decisionLog.validationGate.requiredWinStreak ?? 3}`,
    `- Data-edge status: ${report.dataEdge?.status ?? "-"}`,
    `- Bet-call permission: ${report.dataEdge?.betCallPermission ?? "-"}`,
    `- Odds status: ${report.dataEdge?.odds?.status ?? "-"}`,
    `- Odds evidence: ${report.dataEdge?.odds?.evidence?.status ?? "-"}`,
    `- Odds evidence reasons: ${(report.dataEdge?.odds?.evidence?.reasonCodes ?? []).join(", ") || "none"}`,
    `- Validated calibration entries: ${report.modelCalibration?.validatedModelCount ?? 0}/${report.modelCalibration?.registeredModelCount ?? 0}`,
    "",
    "## Readiness Lanes",
    "",
    "| Lane | Status | Score | Passed | Warnings | Failed |",
    "| --- | --- | --- | --- | --- | --- |",
    ...report.lanes.map((lane) => `| ${lane.label} | ${lane.status} | ${lane.summary.score}/100 | ${lane.summary.passed} | ${lane.summary.warnings} | ${lane.summary.failed} |`),
    "",
    "## Evidence Gates",
    "",
    "These gates measure betting proof and licensed data coverage. They remain visible but do not count as local software-release failures.",
    "",
    "| Gate | Status | Complete | Action |",
    "| --- | --- | --- | --- |",
    ...report.evidenceGates.map((gate) => `| ${gate.label} | ${gate.status} | ${gate.complete ? "yes" : "no"} | ${gate.action} |`),
    "",
    "## Data Edge",
    "",
    "| Field | Value |",
    "| --- | --- |",
    `| Status | ${report.dataEdge?.status ?? "-"} |`,
    `| Bet-call permission | ${report.dataEdge?.betCallPermission ?? "-"} |`,
    `| Odds status | ${report.dataEdge?.odds?.status ?? "-"} |`,
    `| Odds evidence | ${report.dataEdge?.odds?.evidence?.status ?? "-"} |`,
    `| Evidence permission | ${report.dataEdge?.odds?.evidence?.permission ?? "-"} |`,
    `| Fresh priced candidates | ${report.dataEdge?.odds?.evidence?.freshPricedCandidates ?? 0} |`,
    `| Exact bookmaker matches | ${report.dataEdge?.odds?.evidence?.bookmakerMatches ?? 0} |`,
    `| Evidence reasons | ${(report.dataEdge?.odds?.evidence?.reasonCodes ?? []).join(", ") || "none"} |`,
    `| Candidates | ${report.dataEdge?.odds?.candidates ?? 0} |`,
    `| Priced candidates | ${report.dataEdge?.odds?.pricedCandidates ?? 0} |`,
    `| Live data | ${report.dataEdge?.liveData?.status ?? "-"} |`,
    `| Data quality | ${report.dataEdge?.analytics?.dataQualityStatus ?? "-"} |`,
    "",
    "## Model Calibration Registry",
    "",
    `- Registry status: ${report.modelCalibration?.status ?? "invalid"}`,
    `- Policy version: ${report.modelCalibration?.policyVersion ?? "-"}`,
    `- Policy digest: ${report.modelCalibration?.policyDigest ?? "-"}`,
    `- Validated entries: ${report.modelCalibration?.validatedModelCount ?? 0}/${report.modelCalibration?.registeredModelCount ?? 0}`,
    "",
    "| Market Family | Model | Version | Registry Status | Report ID | Report Digest |",
    "| --- | --- | --- | --- | --- | --- |",
    ...(report.modelCalibration?.models?.length > 0
      ? report.modelCalibration.models.map((model) => `| ${model.marketFamily} | ${model.modelId} | ${model.modelVersion} | ${model.registryStatus} | ${model.calibrationReportId ?? "-"} | ${model.calibrationReportDigest ?? "-"} |`)
      : [`| - | - | - | invalid | - | ${report.modelCalibration?.error ?? "Registry unavailable"} |`]),
    "",
    "## Checks",
    "",
    "| Status | Area | Check | Detail |",
    "| --- | --- | --- | --- |",
    ...report.checks.map((entry) => `| ${entry.status} | ${entry.area} | ${entry.message} | ${Array.isArray(entry.detail) ? entry.detail.join("<br>") : typeof entry.detail === "object" && entry.detail !== null ? JSON.stringify(entry.detail) : entry.detail ?? ""} |`),
    "",
    "## Next Actions",
    "",
    ...(report.nextActions.length > 0
      ? report.nextActions.map((entry) => `- ${entry.status.toUpperCase()} ${entry.area}: ${entry.action}`)
      : ["- No release-readiness actions remain."])
  ];

  return `${lines.join("\n")}\n`;
}

module.exports = {
  getReleaseReadiness,
  renderReleaseReadinessMarkdown
};
