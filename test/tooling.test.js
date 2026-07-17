const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
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
const { saveOddsApiKey, upsertEnvValue, validateOddsApiKey } = require("../src/config/odds-key-settings.js");
const { parseArgs: parseLaunchArgs } = require("../src/cli/launch.js");
const { parseArgs: parseServeArgs } = require("../src/cli/serve.js");
const { parseArgs: parseEvaluateArgs } = require("../src/cli/evaluate.js");

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

test("appendDecisionLog writes JSONL output to the requested path", async () => {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "bear-edge-log-"));
  const logPath = path.join(tempDir, "decision_log.jsonl");
  const payload = { selection: "Knicks ML", verdict: "BET" };

  const resolvedPath = await appendDecisionLog(payload, { logPath });
  const contents = fs.readFileSync(logPath, "utf8").trim();

  assert.equal(resolvedPath, logPath);
  assert.deepEqual(JSON.parse(contents), payload);
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
  assert.equal(JSON.parse(logLines[0]).schemaVersion, "2.0.0");
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
