const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const net = require("node:net");
const os = require("node:os");
const path = require("node:path");
const { spawnSync } = require("node:child_process");

const {
  BetInputValidationError,
  appendDecisionLog,
  validateBetInput
} = require("../src/index.js");
const { loadEnvFiles, parseEnv } = require("../src/config/env.js");
const { redactSecrets } = require("../src/config/secrets.js");
const { fetchJson: liveFetchJson } = require("../src/live/fetch-json.js");
const { fetchStatMuseStatus } = require("../src/live/source-status.js");
const { saveOddsApiKey, upsertEnvValue, validateOddsApiKey } = require("../src/config/odds-key-settings.js");
const {
  buildDashboardUrl,
  displayHost,
  preferredLanAddress,
  parseArgs: parseLaunchArgs
} = require("../src/cli/launch.js");
const { parseArgs: parseServeArgs } = require("../src/cli/serve.js");
const { parseArgs: parseEvaluateArgs } = require("../src/cli/evaluate.js");

function listFilesRecursively(directory) {
  const files = [];

  for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
    const entryPath = path.join(directory, entry.name);

    if (entry.isDirectory()) {
      files.push(...listFilesRecursively(entryPath));
    } else if (entry.isFile()) {
      files.push(entryPath);
    }
  }

  return files;
}

test("validateBetInput normalizes a valid CLI payload", () => {
  const normalized = validateBetInput({
    selection: "Lakers ML",
    marketOdds: 120,
    oppositeOdds: -135,
    modelProbability: 0.59,
    bankroll: 2500,
    stakePolicy: {
      maxStake: null
    },
    notes: ["Local backtest"]
  });

  assert.equal(normalized.selection, "Lakers ML");
  assert.equal(normalized.marketWeight, 0.35);
  assert.equal(normalized.maxInjuryAgeMinutes, 90);
  assert.equal(normalized.stakePolicy.maxStake, Infinity);
  assert.deepEqual(normalized.notes, ["Local backtest"]);
});

test("validateBetInput rejects unknown fields and invalid odds", () => {
  assert.throws(
    () =>
      validateBetInput({
        selection: "Bad input",
        marketOdds: 0,
        oppositeOdds: -110,
        modelProbability: 0.5,
        bankroll: 1000,
        unexpected: true
      }),
    (error) => {
      assert.ok(error instanceof BetInputValidationError);
      assert.ok(error.issues.some((issue) => issue.path === "unexpected"));
      assert.ok(error.issues.some((issue) => issue.path === "marketOdds"));
      return true;
    }
  );
});

test("serve CLI parses auto-update controls", () => {
  const originalAutoUpdate = process.env.BEAR_EDGE_AUTO_UPDATE;
  const originalInterval = process.env.BEAR_EDGE_AUTO_UPDATE_INTERVAL_MS;
  const originalHost = process.env.BEAR_EDGE_HOST;

  try {
    delete process.env.BEAR_EDGE_AUTO_UPDATE;
    delete process.env.BEAR_EDGE_AUTO_UPDATE_INTERVAL_MS;
    delete process.env.BEAR_EDGE_HOST;

    assert.deepEqual(parseServeArgs(["--port", "3030"]), {
      autoUpdate: true,
      autoUpdateIntervalMs: 60000,
      host: "127.0.0.1",
      port: 3030
    });
    assert.deepEqual(parseServeArgs(["--port", "3031", "--host", "localhost", "--no-auto-update", "--auto-update-interval-ms", "60000"]), {
      autoUpdate: false,
      autoUpdateIntervalMs: 60000,
      host: "localhost",
      port: 3031
    });
    assert.equal(parseServeArgs(["--lan", "--no-auto-update"]).host, "0.0.0.0");
  } finally {
    if (originalAutoUpdate === undefined) {
      delete process.env.BEAR_EDGE_AUTO_UPDATE;
    } else {
      process.env.BEAR_EDGE_AUTO_UPDATE = originalAutoUpdate;
    }

    if (originalInterval === undefined) {
      delete process.env.BEAR_EDGE_AUTO_UPDATE_INTERVAL_MS;
    } else {
      process.env.BEAR_EDGE_AUTO_UPDATE_INTERVAL_MS = originalInterval;
    }

    if (originalHost === undefined) {
      delete process.env.BEAR_EDGE_HOST;
    } else {
      process.env.BEAR_EDGE_HOST = originalHost;
    }
  }
});

test("launch CLI parses local app controls", () => {
  const originalPort = process.env.PORT;
  const originalAutoUpdate = process.env.BEAR_EDGE_AUTO_UPDATE;
  const originalInterval = process.env.BEAR_EDGE_AUTO_UPDATE_INTERVAL_MS;
  const originalHost = process.env.BEAR_EDGE_HOST;

  try {
    delete process.env.PORT;
    delete process.env.BEAR_EDGE_AUTO_UPDATE;
    delete process.env.BEAR_EDGE_AUTO_UPDATE_INTERVAL_MS;
    delete process.env.BEAR_EDGE_HOST;

    assert.deepEqual(parseLaunchArgs([]), {
      autoUpdate: true,
      autoUpdateIntervalMs: 60000,
      host: "127.0.0.1",
      openBrowser: true,
      port: 3000,
      timeoutMs: 20000
    });
    assert.deepEqual(
      parseLaunchArgs([
        "--port",
        "3032",
        "--host",
        "localhost",
        "--timeout-ms",
        "5000",
        "--no-open",
        "--no-auto-update",
        "--auto-update-interval-ms",
        "60000"
      ]),
      {
        autoUpdate: false,
        autoUpdateIntervalMs: 60000,
        host: "localhost",
        openBrowser: false,
        port: 3032,
        timeoutMs: 5000
      }
    );
    assert.equal(parseLaunchArgs(["--lan", "--no-open"]).host, "0.0.0.0");
  } finally {
    if (originalPort === undefined) {
      delete process.env.PORT;
    } else {
      process.env.PORT = originalPort;
    }

    if (originalAutoUpdate === undefined) {
      delete process.env.BEAR_EDGE_AUTO_UPDATE;
    } else {
      process.env.BEAR_EDGE_AUTO_UPDATE = originalAutoUpdate;
    }

    if (originalInterval === undefined) {
      delete process.env.BEAR_EDGE_AUTO_UPDATE_INTERVAL_MS;
    } else {
      process.env.BEAR_EDGE_AUTO_UPDATE_INTERVAL_MS = originalInterval;
    }

    if (originalHost === undefined) {
      delete process.env.BEAR_EDGE_HOST;
    } else {
      process.env.BEAR_EDGE_HOST = originalHost;
    }
  }
});

test("LAN dashboard bootstrap keeps the operator token in the URL fragment only", () => {
  const token = "private/operator+token";
  const lanUrl = buildDashboardUrl(3000, "0.0.0.0", token);
  const localUrl = buildDashboardUrl(3000, "127.0.0.1");

  assert.equal(
    lanUrl,
    `http://${displayHost("0.0.0.0")}:3000/dashboard#operatorToken=private%2Foperator%2Btoken`
  );
  assert.equal(lanUrl.includes("?"), false);
  assert.equal(localUrl, "http://127.0.0.1:3000/dashboard");
});

test("LAN address discovery falls back safely when interface enumeration is unavailable", () => {
  const originalNetworkInterfaces = os.networkInterfaces;

  try {
    os.networkInterfaces = () => {
      throw new Error("interface enumeration unavailable");
    };

    assert.equal(preferredLanAddress(), "127.0.0.1");
    assert.equal(buildDashboardUrl(3000, "0.0.0.0"), "http://127.0.0.1:3000/dashboard");
  } finally {
    os.networkInterfaces = originalNetworkInterfaces;
  }
});

test("full launcher run never emits a configured operator token", async (t) => {
  const projectRoot = path.resolve(__dirname, "..");
  const configuredToken = `configured-token-must-stay-private-${process.pid}-${Date.now()}`;
  const port = await new Promise((resolve, reject) => {
    const probe = net.createServer();
    probe.once("error", reject);
    probe.listen(0, "127.0.0.1", () => {
      const address = probe.address();
      const selectedPort = typeof address === "object" && address ? address.port : null;
      probe.close((error) => error ? reject(error) : resolve(selectedPort));
    });
  });
  let serverPid = null;

  t.after(() => {
    if (serverPid) {
      try {
        process.kill(serverPid, "SIGTERM");
      } catch (error) {
        if (error.code !== "ESRCH") {
          throw error;
        }
      }
    }
  });

  const command = spawnSync(
    process.execPath,
    [
      path.join(projectRoot, "src/cli/launch.js"),
      "--port",
      String(port),
      "--host",
      "127.0.0.1",
      "--timeout-ms",
      "10000",
      "--no-open",
      "--no-auto-update"
    ],
    {
      cwd: projectRoot,
      encoding: "utf8",
      env: {
        ...process.env,
        BEAR_EDGE_OPERATOR_TOKEN: configuredToken
      }
    }
  );

  const pidMatch = command.stdout.match(/with pid (\d+)/);
  serverPid = pidMatch ? Number(pidMatch[1]) : null;

  assert.equal(command.status, 0, command.stderr);
  assert.equal(command.stdout.includes(configuredToken), false, command.stdout);
  assert.equal(command.stderr.includes(configuredToken), false, command.stderr);

  for (const relativeDir of ["data/logs", "data/reports"]) {
    const targetDir = path.join(projectRoot, relativeDir);

    if (!fs.existsSync(targetDir)) {
      continue;
    }

    for (const filePath of listFilesRecursively(targetDir)) {
      const contents = fs.readFileSync(filePath);
      assert.equal(
        contents.includes(Buffer.from(configuredToken)),
        false,
        `${configuredToken.length}-character configured token leaked into ${filePath}`
      );
    }
  }
});

test("dashboard consumes the operator fragment, clears it, and authorizes write requests", () => {
  const source = fs.readFileSync(path.resolve(__dirname, "../src/dashboard/app.js"), "utf8");

  assert.match(source, /sessionStorage/);
  assert.match(source, /history\.replaceState/);
  assert.match(source, /operatorToken/);
  assert.match(source, /addEventListener\("hashchange"/);
  assert.match(source, /window\.location\.reload\(\)/);
  assert.match(source, /Authorization/);
  assert.match(source, /Bearer/);
});

test("serve CLI requires operator authentication even on loopback", () => {
  const source = fs.readFileSync(path.resolve(__dirname, "../src/cli/serve.js"), "utf8");

  assert.match(source, /createOperatorAuth\(\{[\s\S]*requireToken:\s*true/);
  assert.match(source, /Operator authentication required for protected operations/);
});

test("desktop launcher always bootstraps the authenticated server policy", () => {
  const source = fs.readFileSync(path.resolve(__dirname, "../src/cli/launch.js"), "utf8");

  assert.match(source, /const tokenRequired = true/);
  assert.match(source, /createOperatorAuth\(\{ lanMode, requireToken: true \}\)/);
  assert.doesNotMatch(source, /BEAR_EDGE_REQUIRE_OPERATOR_TOKEN/);
});

test("operator documentation and phone launcher match the authenticated detached runtime", () => {
  const operations = fs.readFileSync(
    path.resolve(__dirname, "../docs/ELITE_AUDIT_OPERATIONS.md"),
    "utf8"
  );
  const phoneLauncher = fs.readFileSync(
    path.resolve(__dirname, "../Open Bear Edge On Phone.command"),
    "utf8"
  );

  assert.match(operations, /Localhost and private-LAN API boundary: bearer authentication required/);
  assert.doesNotMatch(operations, /Localhost write boundary: `local_open` by design/);
  assert.match(phoneLauncher, /detached background process/);
  assert.doesNotMatch(phoneLauncher, /Press Ctrl-C to stop the server/);
});

test("dashboard labels public publisher prices as unverified price checks", () => {
  const source = fs.readFileSync(path.resolve(__dirname, "../src/dashboard/app.js"), "utf8");

  assert.match(source, /Unverified Public Price Snapshots/);
  assert.match(source, /Source EV/);
  assert.match(source, /PRICE_CHECK_ONLY/);
  assert.doesNotMatch(source, /return "bet candidate"/);
});

test("dashboard exposes a non-financial shadow evidence workflow with fixed trust labels", () => {
  const html = fs.readFileSync(path.resolve(__dirname, "../src/dashboard/index.html"), "utf8");
  const source = fs.readFileSync(path.resolve(__dirname, "../src/dashboard/app.js"), "utf8");

  assert.match(html, /href="#shadow-evidence"/);
  assert.match(html, /id="shadow-evidence"/);
  assert.match(html, /id="evidenceQueueFilter"/);
  assert.match(html, /id="evidenceQueueRefreshButton"/);
  assert.match(html, /id="evidenceQueueBoard"/);
  assert.match(html, /Closing prices require exact-book, two-sided, timestamped provider evidence/);
  assert.match(html, /Time fields use this device's local timezone and are stored as UTC/);
  assert.match(source, /\/api\/evidence-queue/);
  assert.match(source, /\/api\/prediction-outcomes/);
  assert.match(source, /\/api\/closing-prices/);
  assert.match(source, /verified_official_result/);
  assert.match(source, /verified_provider_capture/);
  assert.match(source, /window\.confirm/);
  assert.match(source, /Artifact SHA-256 digest/);
  assert.match(source, /Final opposite price/);
  assert.match(source, /Resolved at \(local time\)/);
  assert.match(source, /Artifact captured at \(local time\)/);
  assert.match(source, /Source time \(local time\)/);
  assert.match(source, /Market closed at \(local time\)/);
  assert.doesNotMatch(source, /name="(?:stake|profit)"/);
  assert.doesNotMatch(source, /Place Bet/);
  assert.doesNotMatch(source, /localStorage\.setItem\([^\n]*(?:digest|sourceLocator|marketResult)/i);
});

test("dashboard exposes direct screen captures without a wager action", () => {
  const html = fs.readFileSync(path.resolve(__dirname, "../src/dashboard/index.html"), "utf8");
  const source = fs.readFileSync(path.resolve(__dirname, "../src/dashboard/app.js"), "utf8");

  assert.match(html, /href="#directScreenCapturePanel"/);
  assert.match(html, /id="directScreenCapturePanel"/);
  assert.match(html, /id="directScreenCaptureStatus"/);
  assert.match(html, /id="directScreenCaptureTimestamp"/);
  assert.match(html, /id="directScreenCaptureResult"/);
  assert.match(html, /Captured unverified/);
  assert.match(html, /PRICE_CHECK_ONLY/);
  assert.match(html, /\$0 authorized/);
  assert.match(source, /\/api\/direct-screen-captures\/latest/);
  assert.match(source, /screenshotSha256/);
  assert.match(source, /visibleTextSha256/);
  assert.match(source, /completeMarkets/);
  assert.match(source, /incompleteMarkets/);
  assert.doesNotMatch(html, /Place bet|Submit trade|BET now/i);
});

test("dashboard permits only HTTP external links and escapes provider-controlled scores", () => {
  const source = fs.readFileSync(path.resolve(__dirname, "../src/dashboard/app.js"), "utf8");

  assert.match(source, /function safeExternalUrl/);
  assert.match(source, /parsed\.protocol === "http:" \|\| parsed\.protocol === "https:"/);
  assert.match(source, /rel="noopener noreferrer"/);
  assert.doesNotMatch(
    source,
    /href="\$\{escapeHtml\((?:article\.url|source\.sourceUrl|payload\?\.docsUrl|provider\.(?:signupUrl|docsUrl))/
  );
  assert.match(source, /escapeHtml\(game\.away\.score \?\? ""\)/);
  assert.match(source, /escapeHtml\(game\.home\?\.score \?\? "-"\)/);
});

test("release evidence cards wrap long audit details on narrow screens", () => {
  const source = fs.readFileSync(path.resolve(__dirname, "../src/dashboard/styles.css"), "utf8");
  const anchorOffsetIndex = source.indexOf("section[id] {\n  scroll-margin-top: 72px;\n}");
  const mobileBreakpointIndex = source.indexOf("@media (max-width: 720px)");

  assert.match(source, /\.release-check[^}]*min-width:\s*0/s);
  assert.match(source, /\.release-check p[^}]*overflow-wrap:\s*anywhere/s);
  assert.match(source, /\.release-actions article,[\s\S]*\.release-check\s*\{\s*grid-template-columns:\s*1fr;/);
  assert.match(source, /\.system-audit-grid article[^}]*min-width:\s*0/s);
  assert.match(source, /\.auto-update-detail p,[\s\S]*overflow-wrap:\s*anywhere;/);
  assert.match(source, /\.provider-card-grid[^}]*minmax\(min\(360px, 100%\), 1fr\)/s);
  assert.match(source, /section\[id\][^}]*scroll-margin-top:\s*72px/s);
  assert.ok(anchorOffsetIndex >= 0 && anchorOffsetIndex < mobileBreakpointIndex);
  assert.match(source, /\.quick-nav[^}]*flex-wrap:\s*nowrap[^}]*overflow-x:\s*auto/s);
});

test("operator tokens are redacted from diagnostics", () => {
  const previous = process.env.BEAR_EDGE_OPERATOR_TOKEN;
  process.env.BEAR_EDGE_OPERATOR_TOKEN = "private-operator-token";

  try {
    assert.equal(
      redactSecrets("Authorization: Bearer private-operator-token"),
      "Authorization: Bearer [REDACTED]"
    );
    assert.equal(
      redactSecrets("operator=private-operator-token"),
      "operator=[REDACTED]"
    );
  } finally {
    if (previous === undefined) {
      delete process.env.BEAR_EDGE_OPERATOR_TOKEN;
    } else {
      process.env.BEAR_EDGE_OPERATOR_TOKEN = previous;
    }
  }
});

test("local env loader reads .env.local without overwriting existing process values", () => {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "bear-edge-env-"));
  const originalOddsApiKey = process.env.THE_ODDS_API_KEY;
  const originalTennisApiKey = process.env.TENNIS_API_KEY;

  fs.writeFileSync(
    path.join(tempDir, ".env.local"),
    [
      "# Bear Edge local config",
      "THE_ODDS_API_KEY=from-file",
      "TENNIS_API_KEY='tennis-file'",
      "QUOTED_VALUE=\"quoted value\""
    ].join("\n")
  );

  try {
    process.env.THE_ODDS_API_KEY = "already-set";
    delete process.env.TENNIS_API_KEY;

    assert.deepEqual(parseEnv("A=1\nB='two words'\n# ignored"), {
      A: "1",
      B: "two words"
    });

    const result = loadEnvFiles({ rootDir: tempDir });

    assert.equal(process.env.THE_ODDS_API_KEY, "already-set");
    assert.equal(process.env.TENNIS_API_KEY, "tennis-file");
    assert.equal(process.env.QUOTED_VALUE, "quoted value");
    assert.equal(result.loaded.length, 1);
    assert.deepEqual(result.keys.sort(), ["QUOTED_VALUE", "TENNIS_API_KEY"]);
  } finally {
    if (originalOddsApiKey === undefined) {
      delete process.env.THE_ODDS_API_KEY;
    } else {
      process.env.THE_ODDS_API_KEY = originalOddsApiKey;
    }

    if (originalTennisApiKey === undefined) {
      delete process.env.TENNIS_API_KEY;
    } else {
      process.env.TENNIS_API_KEY = originalTennisApiKey;
    }

    delete process.env.QUOTED_VALUE;
  }
});

test("odds API key settings update local env without exposing secrets", async () => {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "bear-edge-odds-key-"));
  const envPath = path.join(tempDir, ".env.local");
  const originalOddsApiKey = process.env.THE_ODDS_API_KEY;

  fs.writeFileSync(envPath, "TENNIS_API_KEY=tennis-existing\nTHE_ODDS_API_KEY=old-key\n");

  try {
    const saved = await saveOddsApiKey("test-odds-key", { envPath });
    const contents = fs.readFileSync(envPath, "utf8");

    assert.equal(saved.configured, true);
    assert.equal(process.env.THE_ODDS_API_KEY, "test-odds-key");
    assert.match(contents, /TENNIS_API_KEY=tennis-existing/);
    assert.match(contents, /THE_ODDS_API_KEY=test-odds-key/);
    assert.equal((contents.match(/THE_ODDS_API_KEY=/g) ?? []).length, 1);
    assert.equal(fs.statSync(envPath).mode & 0o777, 0o600);
    assert.equal(redactSecrets("Failed https://example.test/?apiKey=test-odds-key"), "Failed https://example.test/?apiKey=[REDACTED]");
  } finally {
    if (originalOddsApiKey === undefined) {
      delete process.env.THE_ODDS_API_KEY;
    } else {
      process.env.THE_ODDS_API_KEY = originalOddsApiKey;
    }
  }
});

test("odds API key validation rejects placeholders and env upsert preserves comments", () => {
  assert.throws(() => validateOddsApiKey("your_api_key"), /placeholder/);
  assert.throws(() => validateOddsApiKey("short"), /too short/);
  assert.equal(validateOddsApiKey("  abcdefghijk  "), "abcdefghijk");

  const updated = upsertEnvValue("# config\nTHE_ODDS_API_KEY=old\nODDS_API_KEY=alias\n", "THE_ODDS_API_KEY", "new-key");

  assert.match(updated, /^# config/m);
  assert.match(updated, /^THE_ODDS_API_KEY=new-key/m);
  assert.match(updated, /^ODDS_API_KEY=alias/m);
});

test("live fetch errors redact API keys from URLs", async () => {
  const originalFetch = globalThis.fetch;

  globalThis.fetch = /** @type {any} */ (async () => ({
    ok: false,
    status: 401,
    statusText: "Unauthorized"
  }));

  try {
    await assert.rejects(
      () => liveFetchJson("https://example.test/v1?apiKey=super-secret-provider-key&market=mlb"),
      (error) => {
        const message = error instanceof Error ? error.message : String(error);

        assert.match(message, /apiKey=\[REDACTED\]/);
        assert.equal(message.includes("super-secret-provider-key"), false);
        return true;
      }
    );
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("live fetch errors preserve provider quota codes without secrets", async () => {
  const originalFetch = globalThis.fetch;

  globalThis.fetch = /** @type {any} */ (async () => ({
    ok: false,
    status: 401,
    statusText: "Unauthorized",
    text: async () => JSON.stringify({
      error_code: "OUT_OF_USAGE_CREDITS",
      message: "Usage quota has been reached."
    })
  }));

  try {
    await assert.rejects(
      () => liveFetchJson("https://example.test/v1?apiKey=super-secret-provider-key"),
      (error) => {
        const message = error instanceof Error ? error.message : String(error);

        assert.match(message, /OUT_OF_USAGE_CREDITS/);
        assert.match(message, /Usage quota has been reached/);
        assert.equal(message.includes("super-secret-provider-key"), false);
        return true;
      }
    );
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("live fetch installs a bounded timeout signal without forwarding timeoutMs", async () => {
  const originalFetch = globalThis.fetch;
  let capturedOptions;

  globalThis.fetch = /** @type {any} */ (async (_url, options) => {
    capturedOptions = options;

    return {
      ok: true,
      json: async () => ({ ok: true })
    };
  });

  try {
    const result = await liveFetchJson("https://example.test/live", { timeoutMs: 250 });
    const actualOptions = /** @type {RequestInit} */ (capturedOptions);

    assert.deepEqual(result, { ok: true });
    assert.ok(actualOptions.signal instanceof AbortSignal);
    assert.equal(Object.prototype.hasOwnProperty.call(actualOptions, "timeoutMs"), false);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("live text source checks install bounded timeout signals", async () => {
  const originalFetch = globalThis.fetch;
  const capturedOptions = [];

  globalThis.fetch = /** @type {any} */ (async (_url, options) => {
    capturedOptions.push(options);

    return {
      ok: true,
      status: 200,
      statusText: "OK",
      headers: new Headers({ "content-type": "text/html" }),
      text: async () => '<title>StatMuse</title><a href="/mlb">MLB</a>'
    };
  });

  try {
    const result = await fetchStatMuseStatus();

    assert.equal(result.provider, "StatMuse");
    assert.ok(capturedOptions.length > 0);
    assert.ok(capturedOptions.every((options) => options.signal instanceof AbortSignal));
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("appendDecisionLog rejects legacy payloads instead of contaminating the authoritative ledger", async () => {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "bear-edge-log-"));
  const logPath = path.join(tempDir, "decision_log.jsonl");
  const payload = { selection: "Knicks ML", verdict: "BET" };

  await assert.rejects(
    appendDecisionLog(payload, { logPath }),
    (error) => error instanceof Error && Reflect.get(error, "code") === "LEDGER_INVALID_RECORD"
  );
  assert.equal(fs.existsSync(logPath), false);
});

test("CLI evaluates valid input and appends a log line", () => {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "bear-edge-cli-"));
  const inputPath = path.join(tempDir, "bet.json");
  const logPath = path.join(tempDir, "decision_log.jsonl");

  fs.writeFileSync(
    inputPath,
    JSON.stringify({
      selection: "Lakers ML",
      marketOdds: 120,
      oppositeOdds: -135,
      modelProbability: 0.59,
      bankroll: 2500,
      marketWeight: 0.2,
      thresholds: {
        minEdge: 0.01,
        minEvRoi: 0.01,
        minKellyFraction: 0.01
      },
      stakePolicy: {
        kellyMultiplier: 0.25,
        maxStake: 150,
        maxBankrollFraction: 0.05,
        minStake: 5
      }
    })
  );

  const command = spawnSync(
    process.execPath,
    [path.resolve(__dirname, "../src/cli/evaluate.js"), inputPath, "--log-path", logPath],
    {
      cwd: path.resolve(__dirname, ".."),
      encoding: "utf8"
    }
  );

  assert.equal(command.status, 0, command.stderr);

  const output = JSON.parse(command.stdout);
  const logLines = fs.readFileSync(logPath, "utf8").trim().split("\n");

  assert.equal(output.verdict, "WAIT");
  assert.equal(output.logPath, logPath);
  assert.match(output.recordId, /^eval_/);
  assert.match(output.clientEventId, /^[0-9a-f-]{36}$/);
  assert.match(output.contentDigest, /^[a-f0-9]{64}$/);
  assert.equal(typeof output.persistedAt, "string");
  assert.equal(logLines.length, 1);
  assert.equal(JSON.parse(logLines[0]).schemaVersion, "2.1.0");
  assert.equal(JSON.parse(logLines[0]).verdict, "WAIT");
});

test("parseArgs rejects the removed --no-log option", () => {
  assert.throws(
    () => parseEvaluateArgs(["example.json", "--no-log"]),
    /Unexpected argument: --no-log/
  );
});

test("CLI can print the input schema", () => {
  const command = spawnSync(process.execPath, [path.resolve(__dirname, "../src/cli/evaluate.js"), "--schema"], {
    cwd: path.resolve(__dirname, ".."),
    encoding: "utf8"
  });

  assert.equal(command.status, 0, command.stderr);

  const output = JSON.parse(command.stdout);

  assert.equal(output.type, "object");
  assert.ok(Array.isArray(output.required));
  assert.ok(output.required.includes("selection"));
});

test("CLI fails fast on invalid input", () => {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "bear-edge-cli-invalid-"));
  const inputPath = path.join(tempDir, "bet.json");

  fs.writeFileSync(
    inputPath,
    JSON.stringify({
      selection: "",
      marketOdds: 0,
      oppositeOdds: -110,
      modelProbability: 1.2,
      bankroll: -5
    })
  );

  const command = spawnSync(process.execPath, [path.resolve(__dirname, "../src/cli/evaluate.js"), inputPath], {
    cwd: path.resolve(__dirname, ".."),
    encoding: "utf8"
  });

  assert.equal(command.status, 1);
  assert.match(command.stderr, /Bet input validation failed/);
  assert.match(command.stderr, /selection/);
});
