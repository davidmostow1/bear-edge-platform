const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs/promises");
const os = require("node:os");
const path = require("node:path");

const {
  contentDigest
} = require("../src/audit/canonical-json.js");
const {
  createShadowCohortArtifact
} = require("../src/audit/shadow-cohort.js");
const {
  loadArtifact,
  main,
  parseArgs
} = require("../src/cli/shadow-capture.js");
const {
  estimateCountProbability
} = require("../src/live/estimate-prop.js");

const CAPTURED_AT = "2026-07-29T16:00:00.000Z";
const EVENT_AT = "2026-07-29T23:00:00.000Z";

function candidatePayload(overrides = {}) {
  const seasonPerGame = 5.2;
  const recentPerGame = 4.8;
  const recentWeight = 0.45;
  const blendedMean = seasonPerGame * (1 - recentWeight) + recentPerGame * recentWeight;
  const line = Math.max(0.5, Math.floor(blendedMean) + 0.5);
  const side = "under";
  const game = {
    id: "777001",
    sport: "mlb",
    date: "2026-07-29",
    gameDate: EVENT_AT,
    status: "Preview",
    state: "Preview",
    venue: "Test Park",
    away: {
      id: 10,
      name: "Away Bears",
      probablePitcher: { id: 101, name: "Away Pitcher" }
    },
    home: {
      id: 20,
      name: "Home Bears",
      probablePitcher: { id: 202, name: "Home Pitcher" }
    },
    sourceUrl: "https://statsapi.mlb.com/api/v1/schedule?sportId=1&date=2026-07-29",
    official: true
  };

  return {
    fetchedAt: CAPTURED_AT,
    gameWindow: {
      dates: ["2026-07-29"],
      sports: ["mlb"],
      sources: [{
        sport: "mlb",
        date: "2026-07-29",
        official: true,
        sourceUrl: game.sourceUrl,
        games: 1,
        warning: null
      }],
      games: [game],
      totals: { games: 1, inProgress: 0, final: 0, scheduled: 1 }
    },
    candidates: [{
      id: "mlb-777001-away-101-strikeouts",
      sport: "mlb",
      provider: "mlb",
      gameId: "777001",
      gameDate: EVENT_AT,
      status: "Preview",
      venue: "Test Park",
      matchup: "Away Bears at Home Bears",
      player: {
        id: 101,
        name: "Away Pitcher",
        teamName: "Away Bears",
        opponentName: "Home Bears"
      },
      marketType: "prop",
      statGroup: "pitching",
      statKey: "strikeOuts",
      statLabel: "strikeouts",
      line,
      lean: side,
      stats: {
        seasonPerGame,
        recentPerGame,
        seasonGamesPlayed: 20,
        recentGamesPlayed: 10,
        recentTotal: 48,
        blendedMean,
        recentLimit: 10,
        sourceUrl: "https://statsapi.mlb.com/api/v1/people/101/stats",
        fetchedAt: "2026-07-29T15:59:00.000Z"
      },
      prediction: {
        model: "poisson_count_v1",
        calibrationStatus: "research_only",
        side,
        line,
        modelProbability: estimateCountProbability({ mean: blendedMean, line, side }),
        sampleSize: 10,
        uncertainty: {
          decisionFairAmericanOdds: -105,
          decisionFairDecimalOdds: 1.95
        },
        fairAmericanOdds: -120
      },
      ticketDraft: {
        selection: "Away Pitcher under 5.5 strikeouts",
        bankroll: 1000
      },
      audit: {
        generatedFrom: "official_mlb_statsapi",
        oddsSource: "manual_required",
        evaluationReadiness: "blocked_until_market_odds",
        sourceUrl: "https://statsapi.mlb.com/api/v1/people/101/stats",
        sourceFetchedAt: "2026-07-29T15:59:00.000Z"
      }
    }],
    skipped: [],
    ...overrides
  };
}

async function writeInput(tempDir, payload, name = "input.json") {
  const inputPath = path.join(tempDir, name);
  await fs.writeFile(inputPath, JSON.stringify(payload), "utf8");
  return inputPath;
}

async function exists(filePath) {
  try {
    await fs.access(filePath);
    return true;
  } catch (error) {
    if (error?.code === "ENOENT") {
      return false;
    }
    throw error;
  }
}

test("CLI accepts local input only and exposes no live-fetch workaround", () => {
  assert.equal(parseArgs(["--input", "payload.json"]).input, "payload.json");
  assert.throws(() => parseArgs([]), /--input is required/);
  assert.throws(() => parseArgs(["--date", "2026-07-29"]), /Unknown argument/);
  assert.throws(
    () => parseArgs(["--input", "payload.json", "--max-candidates", "5000"]),
    /Unknown argument/
  );
});

test("dry run validates the whole path but writes no artifact, ledger, or outbox", async (t) => {
  const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), "bear-edge-shadow-cli-dry-"));
  const inputPath = await writeInput(tempDir, candidatePayload());
  const artifactDir = path.join(tempDir, "artifacts");
  const ledgerPath = path.join(tempDir, "decision_log.jsonl");
  const outboxPath = path.join(tempDir, "sync_outbox.jsonl");
  const output = [];
  t.after(() => fs.rm(tempDir, { recursive: true, force: true }));

  const code = await main([
    "--input", inputPath,
    "--artifact-dir", artifactDir,
    "--ledger", ledgerPath,
    "--outbox", outboxPath,
    "--dry-run"
  ], {
    writeOutput: (value) => output.push(value),
    writeError: (value) => output.push(`ERROR:${value}`)
  });
  const summary = JSON.parse(output.at(-1));
  const serialized = JSON.stringify(summary);

  assert.equal(code, 0);
  assert.equal(summary.status, "dry_run_complete");
  assert.equal(summary.researchOnly, true);
  assert.equal(summary.betAuthorization, false);
  assert.equal(summary.artifact.retained, false);
  assert.equal(summary.ledgerPath, null);
  assert.equal(summary.candidateRecords, 1);
  assert.equal(await exists(artifactDir), false);
  assert.equal(await exists(ledgerPath), false);
  assert.equal(await exists(outboxPath), false);
  for (const forbidden of [
    "Away Pitcher",
    "bankroll",
    "fairAmericanOdds",
    "modelProbability",
    "ticketDraft"
  ]) {
    assert.equal(serialized.includes(forbidden), false);
  }
});

test("retained artifact input is re-sanitized instead of trusted by artifactType", async (t) => {
  const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), "bear-edge-shadow-cli-sanitize-"));
  const artifact = createShadowCohortArtifact(candidatePayload());
  artifact.candidates[0].ticketDraft = { bankroll: 5000 };
  artifact.candidates[0].prediction.uncertainty.decisionFairAmericanOdds = -130;
  artifact.gameWindow.games[0].marketOdds = -110;
  const inputPath = await writeInput(tempDir, artifact, "artifact.json");
  t.after(() => fs.rm(tempDir, { recursive: true, force: true }));

  const sanitized = await loadArtifact({ input: inputPath }, {});
  const serialized = JSON.stringify(sanitized);

  assert.equal(sanitized.artifactType, "mlb_side_normalized_shadow_cohort");
  assert.equal(serialized.includes('"ticketDraft"'), false);
  assert.equal(serialized.includes('"bankroll"'), false);
  assert.equal(serialized.includes('"decisionFairAmericanOdds"'), false);
  assert.equal(serialized.includes('"marketOdds"'), false);
});

test("capture retains one sanitized artifact and replays the same ledger record idempotently", async (t) => {
  const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), "bear-edge-shadow-cli-write-"));
  const inputPath = await writeInput(tempDir, candidatePayload());
  const artifactDir = path.join(tempDir, "artifacts");
  const ledgerPath = path.join(tempDir, "decision_log.jsonl");
  const outboxPath = path.join(tempDir, "sync_outbox.jsonl");
  const firstOutput = [];
  const repeatedOutput = [];
  t.after(() => fs.rm(tempDir, { recursive: true, force: true }));
  const args = [
    "--input", inputPath,
    "--artifact-dir", artifactDir,
    "--ledger", ledgerPath,
    "--outbox", outboxPath
  ];

  const firstCode = await main(args, {
    writeOutput: (value) => firstOutput.push(value),
    writeError: (value) => firstOutput.push(`ERROR:${value}`)
  });
  const repeatedCode = await main(args, {
    writeOutput: (value) => repeatedOutput.push(value),
    writeError: (value) => repeatedOutput.push(`ERROR:${value}`)
  });
  const first = JSON.parse(firstOutput.at(-1));
  const repeated = JSON.parse(repeatedOutput.at(-1));
  const artifactPath = path.join(artifactDir, `${first.artifact.digest}.json`);
  const retained = JSON.parse(await fs.readFile(artifactPath, "utf8"));
  const ledgerLines = (await fs.readFile(ledgerPath, "utf8")).trim().split("\n");

  assert.equal(firstCode, 0);
  assert.equal(repeatedCode, 0);
  assert.equal(first.appended, 1);
  assert.equal(first.existing, 0);
  assert.equal(repeated.appended, 0);
  assert.equal(repeated.existing, 1);
  assert.equal(repeated.artifact.alreadyExisted, true);
  assert.equal(ledgerLines.length, 1);
  assert.equal(contentDigest(retained), first.artifact.digest);
  assert.equal(JSON.stringify(retained).includes('"ticketDraft"'), false);
  assert.equal(JSON.stringify(retained).includes('"bankroll"'), false);
});

test("zero events and visible generator missingness return non-success status", async (t) => {
  const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), "bear-edge-shadow-cli-gaps-"));
  const zeroPayload = candidatePayload({
    gameWindow: {
      dates: ["2026-07-29"],
      sports: ["mlb"],
      sources: [],
      games: [],
      totals: { games: 0, inProgress: 0, final: 0, scheduled: 0 }
    },
    candidates: []
  });
  const missingPayload = candidatePayload({
    skipped: [{
      gameId: "777001",
      sport: "mlb",
      playerId: 999,
      statKey: "hits",
      reason: "Source evidence missing."
    }]
  });
  const zeroInput = await writeInput(tempDir, zeroPayload, "zero.json");
  const missingInput = await writeInput(tempDir, missingPayload, "missing.json");
  const zeroOutput = [];
  const missingOutput = [];
  t.after(() => fs.rm(tempDir, { recursive: true, force: true }));

  const zeroCode = await main([
    "--input", zeroInput,
    "--artifact-dir", path.join(tempDir, "zero-artifacts"),
    "--ledger", path.join(tempDir, "zero-ledger.jsonl"),
    "--dry-run"
  ], {
    writeOutput: (value) => zeroOutput.push(value),
    writeError: (value) => zeroOutput.push(`ERROR:${value}`)
  });
  const missingCode = await main([
    "--input", missingInput,
    "--artifact-dir", path.join(tempDir, "missing-artifacts"),
    "--ledger", path.join(tempDir, "missing-ledger.jsonl"),
    "--dry-run"
  ], {
    writeOutput: (value) => missingOutput.push(value),
    writeError: (value) => missingOutput.push(`ERROR:${value}`)
  });
  const zeroSummary = JSON.parse(zeroOutput.at(-1));
  const missingSummary = JSON.parse(missingOutput.at(-1));

  assert.equal(zeroCode, 3);
  assert.equal(zeroSummary.status, "dry_run_no_eligible_events");
  assert.equal(zeroSummary.candidateRecords, 0);
  assert.equal(missingCode, 3);
  assert.equal(missingSummary.status, "dry_run_incomplete");
  assert.equal(missingSummary.generatorMissingness.length, 1);
});
