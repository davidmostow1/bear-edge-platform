const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { spawnSync } = require("node:child_process");

const {
  createEvaluationRecord,
  createPredictionOutcomeRecord
} = require("../src/index.js");

const ROOT = path.resolve(__dirname, "..");

test("calibration readiness command audits the ledger without treating legacy rows as evidence", () => {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "bear-edge-calibration-readiness-"));
  const ledgerPath = path.join(tempDir, "decision_log.jsonl");
  const jsonPath = path.join(tempDir, "calibration_readiness.json");
  const jsonlPath = path.join(tempDir, "calibration_dataset.jsonl");
  const probabilityJsonlPath = path.join(tempDir, "shadow_probability_dataset.jsonl");
  const markdownPath = path.join(tempDir, "calibration_readiness.md");
  fs.writeFileSync(ledgerPath, `${JSON.stringify({
    timestamp: "2026-07-17T12:00:00.000Z",
    selection: "Legacy prediction",
    verdict: "BET"
  })}\n`, "utf8");

  const result = spawnSync(process.execPath, [
    path.join(ROOT, "script/build_calibration_readiness.js"),
    "--ledger", ledgerPath,
    "--json", jsonPath,
    "--jsonl", jsonlPath,
    "--probability-jsonl", probabilityJsonlPath,
    "--markdown", markdownPath
  ], {
    cwd: ROOT,
    encoding: "utf8"
  });

  assert.equal(result.status, 0, result.stderr);
  const report = JSON.parse(fs.readFileSync(jsonPath, "utf8"));
  const markdown = fs.readFileSync(markdownPath, "utf8");
  assert.equal(report.readiness.status, "blocked");
  assert.equal(report.projection.summary.legacyRecordCount, 1);
  assert.equal(report.projection.rows.length, 0);
  assert.ok(report.readiness.reasonCodes.includes("NO_ELIGIBLE_PREDICTIONS"));
  assert.equal(fs.readFileSync(jsonlPath, "utf8"), "");
  assert.equal(fs.readFileSync(probabilityJsonlPath, "utf8"), "");
  assert.match(markdown, /Status: blocked/);
  assert.match(markdown, /NO_ELIGIBLE_PREDICTIONS/);
  assert.match(markdown, /Legacy records \| 1/);

  fs.rmSync(tempDir, { recursive: true, force: true });
});

test("calibration readiness command writes outcome-only shadow rows separately from promotion data", () => {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "bear-edge-shadow-probability-"));
  const ledgerPath = path.join(tempDir, "decision_log.jsonl");
  const jsonPath = path.join(tempDir, "calibration_readiness.json");
  const jsonlPath = path.join(tempDir, "calibration_dataset.jsonl");
  const probabilityJsonlPath = path.join(tempDir, "shadow_probability_dataset.jsonl");
  const markdownPath = path.join(tempDir, "calibration_readiness.md");
  const prediction = createEvaluationRecord({
    origin: { channel: "test", actorType: "system", sessionId: null, requestId: null },
    event: {
      sport: "mlb",
      league: "MLB",
      eventId: "game_1",
      startTime: "2026-07-17T19:10:00.000Z",
      homeTeam: "Home",
      awayTeam: "Away"
    },
    market: {
      marketFamily: "pitcher_strikeouts",
      marketType: "strikeOuts",
      participantId: "player_1",
      participantName: "Pitcher One",
      selection: "Pitcher One over 5.5 strikeouts",
      side: "over",
      line: 5.5
    },
    price: {
      sportsbook: "draftkings_predictions",
      marketOdds: 120,
      oppositeOdds: null,
      priceCapturedAt: "2026-07-17T12:00:00.000Z",
      priceSourceTime: "2026-07-17T12:00:00.000Z"
    },
    sources: [{
      provider: "mlb",
      sourceType: "official_context_only",
      sourceLocator: "https://statsapi.mlb.com/example",
      parserVersion: "test",
      capturedAt: "2026-07-17T12:00:00.000Z",
      sourceTime: "2026-07-17T12:00:00.000Z",
      digest: "a".repeat(64),
      freshness: "fresh",
      verificationStatus: "official_context_only"
    }],
    model: {
      modelId: "poisson_count_v1",
      modelVersion: "1.0.0",
      probabilityMethod: "poisson_count",
      modelStatus: "research_only",
      calibrationReportId: null,
      trainingCutoff: null,
      sampleSize: 10
    },
    probability: {
      rawModelProbability: 0.6,
      adjustedProbability: 0.5,
      marketImpliedProbability: 100 / 220,
      marketNoVigProbability: null
    },
    edge: { fairEdge: null, priceEdge: null, expectedValueRoi: null, kellyFraction: null },
    stake: { recommendedStake: null, bankroll: null, stakePolicyVersion: "shadow_only" },
    decision: {
      verdict: "WAIT",
      permission: "PRICE_CHECK_ONLY",
      reasons: ["Shadow observation."],
      riskFlags: [],
      gateResults: []
    },
    audit: {
      codeVersion: "test",
      configurationDigest: "b".repeat(64),
      calculationVersion: "test",
      evidenceCompleteness: "one_sided_shadow",
      warnings: []
    }
  }, {
    clientEventId: "11111111-1111-4111-8111-111111111111",
    createdAt: "2026-07-17T12:00:01.000Z"
  });
  const outcome = createPredictionOutcomeRecord({
    evaluationId: prediction.id,
    supersedesId: null,
    outcome: "win",
    resolvedAt: "2026-07-17T22:30:00.000Z",
    eventResult: { status: "final", homeScore: 4, awayScore: 2 },
    marketResult: { observedValue: 7, unit: "strikeouts" },
    source: {
      provider: "mlb_official",
      sourceType: "official_box_score",
      sourceLocator: "https://www.mlb.com/gameday/game_1/final/box",
      capturedAt: "2026-07-17T22:35:00.000Z",
      sourceTime: "2026-07-17T22:30:00.000Z",
      digest: "c".repeat(64),
      verificationStatus: "verified_official_result"
    },
    notes: []
  }, {
    clientEventId: "22222222-2222-4222-8222-222222222222",
    createdAt: "2026-07-17T22:36:00.000Z"
  });
  fs.writeFileSync(ledgerPath, `${JSON.stringify(prediction)}\n${JSON.stringify(outcome)}\n`, "utf8");

  const result = spawnSync(process.execPath, [
    path.join(ROOT, "script/build_calibration_readiness.js"),
    "--ledger", ledgerPath,
    "--json", jsonPath,
    "--jsonl", jsonlPath,
    "--probability-jsonl", probabilityJsonlPath,
    "--markdown", markdownPath
  ], {
    cwd: ROOT,
    encoding: "utf8"
  });

  assert.equal(result.status, 0, result.stderr);
  assert.equal(fs.readFileSync(jsonlPath, "utf8"), "");
  const probabilityRows = fs.readFileSync(probabilityJsonlPath, "utf8")
    .trim()
    .split("\n")
    .map((line) => JSON.parse(line));
  assert.equal(probabilityRows.length, 1);
  assert.equal(probabilityRows[0].predictionId, prediction.id);
  assert.equal(probabilityRows[0].outcome, 1);
  assert.match(result.stdout, /outcome-only 1; results 1/);

  fs.rmSync(tempDir, { recursive: true, force: true });
});

test("package exposes the calibration readiness audit command", () => {
  const packageJson = JSON.parse(fs.readFileSync(path.join(ROOT, "package.json"), "utf8"));

  assert.equal(
    packageJson.scripts["audit:calibration"],
    "node ./script/build_calibration_readiness.js"
  );
});
