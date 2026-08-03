const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs/promises");
const os = require("node:os");
const path = require("node:path");

const publicApi = require("../src/index.js");

function uuid(sequence) {
  return `81000000-0000-4000-8000-${String(sequence).padStart(12, "0")}`;
}

function evaluation() {
  return publicApi.createEvaluationRecord({
    origin: {
      channel: "test",
      actorType: "system",
      sessionId: "official-outcome-test",
      requestId: "official-outcome-test"
    },
    event: {
      sport: "mlb",
      league: "MLB",
      eventId: "401816143",
      startTime: "2026-07-16T23:00:00.000Z",
      homeTeam: "New York Yankees",
      awayTeam: "Los Angeles Dodgers"
    },
    market: {
      marketFamily: "pitcher_strikeouts",
      marketType: "strikeOuts",
      participantId: "543037",
      participantName: "Gerrit Cole",
      selection: "Gerrit Cole over 5.5 strikeouts",
      side: "over",
      line: 5.5
    },
    price: {
      sportsbook: "draftkings_predictions",
      marketOdds: 110,
      oppositeOdds: null,
      priceCapturedAt: "2026-07-16T17:45:00.000Z",
      priceSourceTime: "2026-07-16T17:45:00.000Z"
    },
    sources: [{
      provider: "mlb",
      sourceType: "official_context_only",
      sourceLocator: "https://statsapi.mlb.com/api/v1/people/543037/stats",
      parserVersion: "test_v1",
      capturedAt: "2026-07-16T17:45:00.000Z",
      sourceTime: "2026-07-16T17:45:00.000Z",
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
      trainingCutoff: "2026-07-15T00:00:00.000Z",
      sampleSize: 54
    },
    probability: {
      rawModelProbability: 0.55,
      adjustedProbability: 0.53,
      marketImpliedProbability: 100 / 210,
      marketNoVigProbability: null
    },
    edge: {
      fairEdge: null,
      priceEdge: null,
      expectedValueRoi: null,
      kellyFraction: null
    },
    stake: {
      recommendedStake: 0,
      bankroll: 1000,
      stakePolicyVersion: "shadow_only"
    },
    decision: {
      verdict: "WAIT",
      permission: "PRICE_CHECK_ONLY",
      reasons: ["Shadow validation only."],
      riskFlags: [],
      gateResults: []
    },
    audit: {
      codeVersion: "test",
      configurationDigest: "b".repeat(64),
      calculationVersion: "test_v1",
      evidenceCompleteness: "one_sided_shadow",
      warnings: []
    }
  }, {
    clientEventId: uuid(1),
    createdAt: "2026-07-16T17:45:01.000Z"
  });
}

function finalFeed() {
  return {
    gamePk: 401816143,
    gameData: {
      status: {
        abstractGameState: "Final",
        detailedState: "Final"
      }
    },
    liveData: {
      linescore: {
        teams: {
          away: { runs: 2 },
          home: { runs: 4 }
        }
      },
      boxscore: {
        teams: {
          away: { players: {} },
          home: {
            players: {
              ID543037: {
                person: { id: 543037, fullName: "Gerrit Cole" },
                stats: {
                  batting: {},
                  pitching: { strikeOuts: 7 }
                }
              }
            }
          }
        }
      }
    }
  };
}

test("official MLB final scores append an immutable outcome for an unresolved shadow prediction", async (t) => {
  assert.equal(typeof publicApi.resolveOfficialMlbOutcomes, "function");
  const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), "bear-edge-official-outcomes-"));
  const ledgerPath = path.join(tempDir, "decision_log.jsonl");
  const outboxPath = path.join(tempDir, "sync_outbox.jsonl");
  const record = evaluation();
  t.after(() => fs.rm(tempDir, { recursive: true, force: true }));
  await publicApi.appendAuthoritativeRecord(record, { ledgerPath, outboxPath });

  const result = await publicApi.resolveOfficialMlbOutcomes({
    logPath: ledgerPath,
    outboxPath,
    now: "2026-07-17T03:10:00.000Z",
    fetchJsonImpl: async (url) => {
      assert.equal(
        url,
        "https://statsapi.mlb.com/api/v1.1/game/401816143/feed/live"
      );
      return finalFeed();
    }
  });
  const inspection = await publicApi.readDecisionLogEntries({ logPath: ledgerPath });
  const outcome = inspection.records.find((entry) => entry.recordType === "prediction_outcome");

  assert.deepEqual(result, {
    inspected: 1,
    appended: 1,
    alreadyResolved: 0,
    awaitingFinal: 0,
    unsupported: 0,
    failed: 0,
    failures: []
  });
  assert.equal(outcome.evaluationId, record.id);
  assert.equal(outcome.outcome, "win");
  assert.equal(outcome.marketResult.observedValue, 7);
  assert.equal(outcome.marketResult.unit, "strikeouts");
  assert.deepEqual(outcome.eventResult, {
    status: "final",
    homeScore: 4,
    awayScore: 2
  });
  assert.equal(outcome.source.provider, "mlb_official");
  assert.equal(outcome.source.verificationStatus, "verified_official_result");
  assert.equal(publicApi.validateAuditRecord(outcome).valid, true);

  const repeated = await publicApi.resolveOfficialMlbOutcomes({
    logPath: ledgerPath,
    outboxPath,
    now: "2026-07-17T03:11:00.000Z",
    fetchJsonImpl: async () => {
      throw new Error("Already-resolved outcomes must not refetch the official feed.");
    }
  });
  const repeatedInspection = await publicApi.readDecisionLogEntries({ logPath: ledgerPath });

  assert.deepEqual(repeated, {
    inspected: 1,
    appended: 0,
    alreadyResolved: 1,
    awaitingFinal: 0,
    unsupported: 0,
    failed: 0,
    failures: []
  });
  assert.equal(
    repeatedInspection.records.filter((entry) => entry.recordType === "prediction_outcome").length,
    1
  );
});

test("official MLB outcome resolution waits for a terminal game state", async (t) => {
  const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), "bear-edge-official-pending-"));
  const ledgerPath = path.join(tempDir, "decision_log.jsonl");
  const outboxPath = path.join(tempDir, "sync_outbox.jsonl");
  t.after(() => fs.rm(tempDir, { recursive: true, force: true }));
  await publicApi.appendAuthoritativeRecord(evaluation(), { ledgerPath, outboxPath });
  const feed = finalFeed();
  feed.gameData.status = {
    abstractGameState: "Live",
    detailedState: "In Progress"
  };

  const result = await publicApi.resolveOfficialMlbOutcomes({
    logPath: ledgerPath,
    outboxPath,
    now: "2026-07-17T02:10:00.000Z",
    fetchJsonImpl: async () => feed
  });
  const inspection = await publicApi.readDecisionLogEntries({ logPath: ledgerPath });

  assert.deepEqual(result, {
    inspected: 1,
    appended: 0,
    alreadyResolved: 0,
    awaitingFinal: 1,
    unsupported: 0,
    failed: 0,
    failures: []
  });
  assert.equal(
    inspection.records.some((entry) => entry.recordType === "prediction_outcome"),
    false
  );
});
