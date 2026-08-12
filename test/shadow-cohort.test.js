const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs/promises");
const os = require("node:os");
const path = require("node:path");

const {
  readAuthoritativeLedger
} = require("../src/audit/authoritative-ledger.js");
const {
  canonicalStringify,
  contentDigest
} = require("../src/audit/canonical-json.js");
const {
  ShadowCohortError,
  buildShadowEvaluationRecord,
  canonicalOverProbability,
  captureShadowCohort,
  createShadowCohortArtifact,
  preflightShadowCohort
} = require("../src/audit/shadow-cohort.js");
const {
  validateAuditRecord
} = require("../src/audit/record-contract.js");
const {
  projectCalibrationLedger
} = require("../src/calibration/ledger-projection.js");
const {
  resolveOfficialMlbOutcomes
} = require("../src/live/official-mlb-outcomes.js");
const {
  estimateCountProbability
} = require("../src/live/estimate-prop.js");

const CAPTURED_AT = "2026-07-29T16:00:00.000Z";
const SOURCE_AT = "2026-07-29T15:59:00.000Z";
const EVENT_AT = "2026-07-29T23:00:00.000Z";

function game(overrides = {}) {
  return {
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
    official: true,
    ...overrides
  };
}

function candidate(overrides = {}) {
  const blendedMean = 5.02;
  const line = 5.5;
  const sourceSide = "under";

  return {
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
    lean: "under",
    requiresManualOdds: true,
    verdict: "ODDS_NEEDED",
    riskFlags: [{
      code: "MISSING_MARKET_ODDS",
      severity: "high",
      message: "No market price."
    }],
    stats: {
      seasonPerGame: 5.2,
      recentPerGame: 4.8,
      seasonGamesPlayed: 20,
      recentGamesPlayed: 10,
      recentTotal: 48,
      blendedMean,
      recentLimit: 10,
      sourceUrl: "https://statsapi.mlb.com/api/v1/people/101/stats",
      fetchedAt: SOURCE_AT
    },
    prediction: {
      model: "poisson_count_v1",
      calibrationStatus: "research_only",
      side: sourceSide,
      line,
      modelProbability: estimateCountProbability({
        mean: blendedMean,
        line,
        side: sourceSide
      }),
      sampleSize: 10,
      uncertainty: {
        confidenceLevel: 0.95,
        lowerProbability: 0.51,
        upperProbability: 0.71,
        decisionFairAmericanOdds: -105,
        decisionFairDecimalOdds: 1.95
      },
      fairAmericanOdds: -163
    },
    audit: {
      generatedFrom: "official_mlb_statsapi",
      oddsSource: "manual_required",
      sourceUrl: "https://statsapi.mlb.com/api/v1/people/101/stats",
      sourceFetchedAt: SOURCE_AT
    },
    ticketDraft: {
      bankroll: 1000,
      selection: "Away Pitcher under 5.5 strikeouts"
    },
    ...overrides
  };
}

function candidateForStat({
  statKey,
  statLabel,
  seasonPerGame,
  recentPerGame,
  recentTotal,
  playerId = 101
}) {
  const recentWeight = {
    hits: 0.45,
    runs: 0.42,
    strikeOuts: 0.45,
    totalBases: 0.5
  }[statKey];
  const blendedMean = seasonPerGame * (1 - recentWeight) + recentPerGame * recentWeight;
  const line = Math.max(0.5, Math.floor(blendedMean) + 0.5);
  const side = recentPerGame >= seasonPerGame ? "over" : "under";
  const base = candidate();

  return {
    ...base,
    id: `mlb-777001-away-${playerId}-${statKey}`,
    player: {
      ...base.player,
      id: playerId,
      name: `Player ${playerId}`
    },
    statGroup: statKey === "strikeOuts" ? "pitching" : "hitting",
    statKey,
    statLabel,
    line,
    stats: {
      ...base.stats,
      seasonPerGame,
      recentPerGame,
      recentTotal,
      blendedMean
    },
    prediction: {
      ...base.prediction,
      side,
      line,
      modelProbability: estimateCountProbability({
        mean: blendedMean,
        line,
        side
      })
    }
  };
}

function payload(overrides = {}) {
  const firstGame = game();

  return {
    fetchedAt: CAPTURED_AT,
    gameWindow: {
      fetchedAt: "2026-07-29T15:58:30.000Z",
      dates: ["2026-07-29"],
      sports: ["mlb"],
      sources: [{
        sport: "mlb",
        date: "2026-07-29",
        official: true,
        sourceUrl: firstGame.sourceUrl,
        games: 1,
        warning: null
      }],
      games: [firstGame],
      totals: {
        games: 1,
        inProgress: 0,
        final: 0,
        scheduled: 1
      }
    },
    candidates: [candidate()],
    skipped: [],
    notes: ["Research only."],
    ...overrides
  };
}

function artifactContext(artifact, artifactLocator = "/tmp/shadow-cohort.json") {
  return {
    artifactDigest: contentDigest(artifact),
    artifactLocator,
    codeVersion: "test",
    sessionId: "shadow-cohort-test",
    requestId: "shadow-cohort-test"
  };
}

function finalFeed() {
  return {
    gamePk: 777001,
    gameData: {
      status: {
        abstractGameState: "Final",
        detailedState: "Final",
        codedGameState: "F"
      }
    },
    liveData: {
      linescore: {
        teams: {
          away: { runs: 4 },
          home: { runs: 2 }
        }
      },
      boxscore: {
        teams: {
          away: {
            players: {
              ID101: {
                person: { id: 101, fullName: "Away Pitcher" },
                stats: {
                  batting: {},
                  pitching: { strikeOuts: 7 }
                }
              }
            }
          },
          home: { players: {} }
        }
      }
    }
  };
}

test("canonicalOverProbability removes source-side selection while preserving the binary forecast", () => {
  assert.equal(canonicalOverProbability({ side: "over", modelProbability: 0.62 }), 0.62);
  assert.equal(canonicalOverProbability({ side: "over", modelProbability: 0 }), 0);
  assert.equal(canonicalOverProbability({ side: "under", modelProbability: 1 }), 0);
  assert.ok(
    Math.abs(canonicalOverProbability({ side: "under", modelProbability: 0.62 }) - 0.38)
      < Number.EPSILON
  );
  assert.throws(
    () => canonicalOverProbability({ side: "lean", modelProbability: 0.62 }),
    (error) => error instanceof ShadowCohortError && error.code === "INVALID_SIDE"
  );
});

test("a legitimate zero-mean Poisson endpoint remains a research-only shadow probability", () => {
  const zeroCandidate = candidateForStat({
    statKey: "runs",
    statLabel: "runs",
    seasonPerGame: 0,
    recentPerGame: 0,
    recentTotal: 0
  });
  const zeroPayload = payload({ candidates: [zeroCandidate] });
  const artifact = createShadowCohortArtifact(zeroPayload);
  const result = preflightShadowCohort(artifact, artifactContext(artifact));

  assert.equal(result.records.length, 1);
  assert.equal(result.records[0].probability.rawModelProbability, 0);
  assert.equal(result.records[0].verdict, "WAIT");
  assert.equal(result.records[0].permission, "PRICE_CHECK_ONLY");
  assert.equal(validateAuditRecord(result.records[0]).valid, true);
});

test("shadow artifact strips ticket, price, bankroll, and selected-lean fields", () => {
  const artifact = createShadowCohortArtifact(payload());
  const retained = artifact.candidates[0];
  const serialized = JSON.stringify(artifact);

  assert.equal(artifact.restrictions.researchOnly, true);
  assert.equal(artifact.restrictions.sportsbookPricesIncluded, false);
  assert.equal(artifact.restrictions.rankedCandidateSubset, false);
  assert.equal(artifact.restrictions.stakeIncluded, false);
  assert.equal(Object.hasOwn(retained, "ticketDraft"), false);
  assert.equal(Object.hasOwn(retained, "lean"), false);
  assert.equal(Object.hasOwn(retained, "requiresManualOdds"), false);
  assert.equal(Object.hasOwn(retained.prediction, "fairAmericanOdds"), false);
  for (const forbiddenKey of [
    "bankroll",
    "decisionFairAmericanOdds",
    "decisionFairDecimalOdds",
    "fairAmericanOdds",
    "kellyFraction",
    "marketOdds",
    "recommendedStake",
    "ticketDraft"
  ]) {
    assert.equal(
      serialized.includes(`"${forbiddenKey}"`),
      false,
      `artifact retained forbidden key ${forbiddenKey}`
    );
  }
});

test("shadow evaluation is stable, canonical-over, prestart, and incapable of authorizing a bet", () => {
  const artifact = createShadowCohortArtifact(payload());
  const context = artifactContext(artifact);
  const first = buildShadowEvaluationRecord(
    artifact.candidates[0],
    artifact.gameWindow.games[0],
    artifact,
    context
  );
  const second = buildShadowEvaluationRecord(
    artifact.candidates[0],
    artifact.gameWindow.games[0],
    artifact,
    context
  );

  assert.deepEqual(first, second);
  assert.equal(validateAuditRecord(first).valid, true);
  assert.equal(first.createdAt, CAPTURED_AT);
  assert.ok(Date.parse(first.createdAt) < Date.parse(first.event.startTime));
  assert.equal(first.market.side, "over");
  assert.equal(first.market.line, 5.5);
  assert.equal(
    first.probability.rawModelProbability,
    estimateCountProbability({ mean: 5.02, line: 5.5, side: "over" })
  );
  assert.equal(first.probability.adjustedProbability, null);
  assert.equal(first.price.sportsbook, null);
  assert.equal(first.price.marketOdds, null);
  assert.equal(first.price.oppositeOdds, null);
  assert.deepEqual(first.edge, {
    fairEdge: null,
    priceEdge: null,
    expectedValueRoi: null,
    kellyFraction: null
  });
  assert.deepEqual(first.stake, {
    recommendedStake: 0,
    bankroll: null,
    stakePolicyVersion: null
  });
  assert.equal(first.model.modelStatus, "research_only");
  assert.equal(first.verdict, "WAIT");
  assert.equal(first.permission, "PRICE_CHECK_ONLY");
  assert.equal(
    first.gateResults.find((gate) => gate.gate === "bet_authorization").passed,
    false
  );
});

test("preflight rejects a candidate probability that does not match the registered model calculation", () => {
  const tamperedPayload = payload();
  tamperedPayload.candidates[0].prediction.modelProbability = 0.99;
  const artifact = createShadowCohortArtifact(tamperedPayload);

  assert.throws(
    () => preflightShadowCohort(artifact, artifactContext(artifact)),
    (error) => (
      error instanceof ShadowCohortError
      && error.code === "MODEL_PROBABILITY_MISMATCH"
    )
  );
});

test("preflight verifies the registered model inputs, weight, line, model id, and status", () => {
  const cases = [
    {
      expectedCode: "BLENDED_MEAN_MISMATCH",
      mutate(candidateValue) {
        candidateValue.stats.blendedMean += 0.1;
      }
    },
    {
      expectedCode: "RECENT_RATE_MISMATCH",
      mutate(candidateValue) {
        candidateValue.stats.recentTotal = 47;
      }
    },
    {
      expectedCode: "MODEL_LINE_MISMATCH",
      mutate(candidateValue) {
        candidateValue.line = 6.5;
        candidateValue.prediction.line = 6.5;
      }
    },
    {
      expectedCode: "MODEL_ID_MISMATCH",
      mutate(candidateValue) {
        candidateValue.prediction.model = "unregistered_model";
      }
    },
    {
      expectedCode: "MODEL_STATUS_MISMATCH",
      mutate(candidateValue) {
        candidateValue.prediction.calibrationStatus = "validated";
      }
    }
  ];

  for (const fixture of cases) {
    const tamperedPayload = payload();
    fixture.mutate(tamperedPayload.candidates[0]);
    const artifact = createShadowCohortArtifact(tamperedPayload);

    assert.throws(
      () => preflightShadowCohort(artifact, artifactContext(artifact)),
      (error) => error instanceof ShadowCohortError && error.code === fixture.expectedCode,
      fixture.expectedCode
    );
  }
});

test("preflight fails closed when the artifact was captured at or after first pitch", () => {
  const latePayload = payload({ fetchedAt: EVENT_AT });
  latePayload.candidates[0].stats.fetchedAt = EVENT_AT;
  const artifact = createShadowCohortArtifact(latePayload);

  assert.throws(
    () => preflightShadowCohort(artifact, artifactContext(artifact)),
    (error) => error instanceof ShadowCohortError && error.code === "CAPTURE_NOT_PRESTART"
  );
});

test("artifact creation cannot relabel the generator capture timestamp", () => {
  assert.throws(
    () => createShadowCohortArtifact(payload(), {
      capturedAt: "2026-07-29T15:00:00.000Z"
    }),
    (error) => error instanceof ShadowCohortError && error.code === "CAPTURE_TIME_MISMATCH"
  );
});

test("preflight rejects invalid MLB identities and schedule, status, line, and source mismatches", () => {
  const cases = [
    {
      expectedCode: "INVALID_MLB_EVENT_ID",
      mutate(value) {
        value.candidates[0].gameId = "event-not-mlb";
      }
    },
    {
      expectedCode: "INVALID_MLB_PARTICIPANT_ID",
      mutate(value) {
        value.candidates[0].player.id = "player-not-mlb";
      }
    },
    {
      expectedCode: "MISSING_SCHEDULE_GAME",
      mutate(value) {
        value.candidates[0].gameId = "777999";
      }
    },
    {
      expectedCode: "CANDIDATE_GAME_MISMATCH",
      mutate(value) {
        value.candidates[0].status = "Scheduled";
      }
    },
    {
      expectedCode: "CANDIDATE_LINE_MISMATCH",
      mutate(value) {
        value.candidates[0].prediction.line = 6.5;
      }
    },
    {
      expectedCode: "SOURCE_AFTER_CAPTURE",
      mutate(value) {
        value.candidates[0].stats.fetchedAt = "2026-07-29T16:01:00.000Z";
      }
    },
    {
      expectedCode: "GAME_NOT_ACTIONABLE",
      mutate(value) {
        value.gameWindow.games[0].status = "Final";
        value.candidates[0].status = "Final";
      }
    }
  ];

  for (const fixture of cases) {
    const candidatePayload = payload();
    fixture.mutate(candidatePayload);
    const artifact = createShadowCohortArtifact(candidatePayload);

    assert.throws(
      () => preflightShadowCohort(artifact, artifactContext(artifact)),
      (error) => error instanceof ShadowCohortError && error.code === fixture.expectedCode,
      fixture.expectedCode
    );
  }
});

test("duplicate candidate identities fail before the first ledger append", async () => {
  const candidatePayload = payload();
  candidatePayload.candidates.push(structuredClone(candidatePayload.candidates[0]));
  const artifact = createShadowCohortArtifact(candidatePayload);
  let appendCalls = 0;

  await assert.rejects(
    captureShadowCohort(artifact, {
      ...artifactContext(artifact),
      appendRecordImpl: async () => {
        appendCalls += 1;
        return { appended: true };
      }
    }),
    (error) => (
      error instanceof ShadowCohortError
      && error.code === "DUPLICATE_CANDIDATE_IDENTITY"
    )
  );
  assert.equal(appendCalls, 0);
});

test("an exact artifact replay is stable while a later prestart snapshot has a distinct identity", () => {
  const firstArtifact = createShadowCohortArtifact(payload());
  const laterPayload = payload({ fetchedAt: "2026-07-29T16:01:00.000Z" });
  laterPayload.candidates[0].stats.fetchedAt = "2026-07-29T16:00:30.000Z";
  laterPayload.candidates[0].audit.sourceFetchedAt = "2026-07-29T16:00:30.000Z";
  const laterArtifact = createShadowCohortArtifact(laterPayload);
  const firstRecord = preflightShadowCohort(
    firstArtifact,
    artifactContext(firstArtifact)
  ).records[0];
  const replayRecord = preflightShadowCohort(
    firstArtifact,
    artifactContext(firstArtifact)
  ).records[0];
  const laterRecord = preflightShadowCohort(
    laterArtifact,
    artifactContext(laterArtifact)
  ).records[0];

  assert.deepEqual(firstRecord, replayRecord);
  assert.notEqual(firstRecord.id, laterRecord.id);
  assert.notEqual(firstRecord.contentDigest, laterRecord.contentDigest);
});

test("preflight reports every uncovered eligible event instead of hiding missingness", () => {
  const secondGame = game({
    id: "777002",
    gameDate: "2026-07-30T00:00:00.000Z"
  });
  const twoGamePayload = payload();
  twoGamePayload.gameWindow.games.push(secondGame);
  twoGamePayload.gameWindow.totals.games = 2;
  twoGamePayload.gameWindow.totals.scheduled = 2;
  const artifact = createShadowCohortArtifact(twoGamePayload);
  const result = preflightShadowCohort(artifact, artifactContext(artifact));

  assert.deepEqual(result.coverage.eligibleEventIds, ["777001", "777002"]);
  assert.deepEqual(result.coverage.representedEventIds, ["777001"]);
  assert.deepEqual(result.coverage.missingEventIds, ["777002"]);
  assert.equal(result.coverage.allEligibleEventsRepresented, false);
});

test("capture is append-only and idempotent, then official settlement enables outcome-only diagnostics only", async (t) => {
  const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), "bear-edge-shadow-cohort-"));
  const ledgerPath = path.join(tempDir, "decision_log.jsonl");
  const outboxPath = path.join(tempDir, "sync_outbox.jsonl");
  const artifact = createShadowCohortArtifact(payload());
  const artifactDigest = contentDigest(artifact);
  const artifactLocator = path.join(tempDir, `${artifactDigest}.json`);
  const context = {
    ...artifactContext(artifact, artifactLocator),
    ledgerPath,
    outboxPath
  };
  t.after(() => fs.rm(tempDir, { recursive: true, force: true }));
  await fs.writeFile(artifactLocator, canonicalStringify(artifact), {
    encoding: "utf8",
    flag: "wx"
  });

  const first = await captureShadowCohort(artifact, context);
  const repeated = await captureShadowCohort(artifact, context);
  let inspection = await readAuthoritativeLedger({ ledgerPath });

  assert.equal(first.candidates, 1);
  assert.equal(first.appended, 1);
  assert.equal(first.existing, 0);
  assert.equal(first.coverage.allEligibleEventsRepresented, true);
  assert.equal(repeated.appended, 0);
  assert.equal(repeated.existing, 1);
  assert.equal(inspection.records.length, 1);
  assert.equal(
    contentDigest(JSON.parse(await fs.readFile(artifactLocator, "utf8"))),
    artifactDigest
  );

  const settlement = await resolveOfficialMlbOutcomes({
    logPath: ledgerPath,
    outboxPath,
    now: "2026-07-30T03:00:00.000Z",
    fetchJsonImpl: async (url) => {
      assert.equal(url, "https://statsapi.mlb.com/api/v1.1/game/777001/feed/live");
      return finalFeed();
    }
  });
  inspection = await readAuthoritativeLedger({ ledgerPath });
  const projection = projectCalibrationLedger(inspection.records);

  assert.equal(settlement.appended, 1);
  assert.equal(inspection.records.length, 2);
  assert.equal(projection.probabilityRows.length, 1);
  assert.equal(projection.probabilityRows[0].outcome, 1);
  assert.equal(
    projection.probabilityRows[0].predictedProbability,
    estimateCountProbability({ mean: 5.02, line: 5.5, side: "over" })
  );
  assert.equal(projection.rows.length, 0);
  assert.equal(projection.summary.settledPredictionCount, 0);
  assert.equal(projection.probabilityMetrics.promotionEligible, false);
});

test("all four registered MLB market families settle only into outcome diagnostics without prices", async (t) => {
  const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), "bear-edge-shadow-markets-"));
  const ledgerPath = path.join(tempDir, "decision_log.jsonl");
  const outboxPath = path.join(tempDir, "sync_outbox.jsonl");
  const candidatePayload = payload({
    candidates: [
      candidateForStat({
        statKey: "strikeOuts",
        statLabel: "strikeouts",
        seasonPerGame: 5.2,
        recentPerGame: 4.8,
        recentTotal: 48
      }),
      candidateForStat({
        statKey: "hits",
        statLabel: "hits",
        seasonPerGame: 1.1,
        recentPerGame: 1.3,
        recentTotal: 13
      }),
      candidateForStat({
        statKey: "runs",
        statLabel: "runs",
        seasonPerGame: 0.6,
        recentPerGame: 0.7,
        recentTotal: 7
      }),
      candidateForStat({
        statKey: "totalBases",
        statLabel: "total bases",
        seasonPerGame: 1.8,
        recentPerGame: 2.2,
        recentTotal: 22
      })
    ]
  });
  const artifact = createShadowCohortArtifact(candidatePayload);
  const artifactDigest = contentDigest(artifact);
  const artifactLocator = path.join(tempDir, `${artifactDigest}.json`);
  t.after(() => fs.rm(tempDir, { recursive: true, force: true }));
  await fs.writeFile(artifactLocator, canonicalStringify(artifact), "utf8");
  await captureShadowCohort(artifact, {
    ...artifactContext(artifact, artifactLocator),
    ledgerPath,
    outboxPath
  });

  const feed = finalFeed();
  feed.liveData.boxscore.teams.away.players.ID101.stats.batting = {
    hits: 3,
    runs: 2,
    totalBases: 5
  };
  const result = await resolveOfficialMlbOutcomes({
    logPath: ledgerPath,
    outboxPath,
    now: "2026-07-30T03:00:00.000Z",
    fetchJsonImpl: async () => feed
  });
  const inspection = await readAuthoritativeLedger({ ledgerPath });
  const projection = projectCalibrationLedger(inspection.records);

  assert.equal(result.appended, 4);
  assert.equal(projection.probabilityRows.length, 4);
  assert.equal(projection.rows.length, 0);
  assert.equal(projection.summary.settledPredictionCount, 0);
  assert.deepEqual(
    [...new Set(projection.probabilityRows.map((row) => row.marketFamily))].sort(),
    [
      "batter_hits",
      "batter_runs_scored",
      "batter_total_bases",
      "pitcher_strikeouts"
    ]
  );
  assert.equal(projection.probabilityMetrics.promotionEligible, false);
});
