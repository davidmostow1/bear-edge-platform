const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");

const { createServer } = require("../src/server.js");
const { getBestMlbTargets } = require("../src/live/best-mlb-targets.js");
const {
  createAutoUpdateService,
  readAutoUpdateHistory,
  readAutoUpdateSnapshot
} = require("../src/live/auto-update.js");
const { fetchJson, fetchText } = require("../src/live/fixture-fetch.js");

async function withServer(run, options = {}) {
  const server = createServer({
    fetchJsonImpl: fetchJson,
    fetchTextImpl: fetchText,
    ...options
  });

  await new Promise((resolve) => server.listen(0, () => resolve(undefined)));

  try {
    const address = server.address();

    if (!address || typeof address === "string") {
      throw new Error("Expected an AddressInfo server binding.");
    }

    const baseUrl = `http://127.0.0.1:${address.port}`;

    await run(baseUrl);
  } finally {
    await new Promise((resolve, reject) => server.close((error) => (error ? reject(error) : resolve())));
  }
}

test("HTTP API exposes schemas", async () => {
  await withServer(async (baseUrl) => {
    const response = await fetch(`${baseUrl}/schemas`);
    const payload = await response.json();

    assert.equal(response.status, 200);
    assert.equal(payload.auditRecord.title, "Bear Edge Authoritative Audit Record");
    assert.equal(payload.settlementInput.title, "Bear Edge Settlement Input");
    assert.equal(payload.amendmentInput.title, "Bear Edge Amendment Input");
    assert.equal(payload.liveTicket.type, "object");
    assert.equal(payload.researchPacket.type, "object");
  });
});

test("HTTP API exposes safe synchronization health and runs the worker on demand", async () => {
  const secret = "supabase-service-role-secret";
  const previous = process.env.SUPABASE_SERVICE_ROLE_KEY;
  let runs = 0;
  const status = {
    provider: "supabase",
    configured: true,
    enabled: true,
    started: true,
    running: false,
    pending: 1,
    retryableFailures: 0,
    terminalFailures: 0,
    synchronized: 2,
    oldestPendingAgeMs: 5000,
    lastRunAt: null,
    lastSuccessAt: null,
    lastSafeError: null,
    integrityIssues: 0,
    secretReturned: false
  };
  const syncWorker = {
    getStatus: async () => ({ ...status, pending: runs === 0 ? 1 : 0 }),
    runNow: async () => {
      runs += 1;
      return {
        status: "completed",
        processed: 1,
        synchronized: 1,
        retryableFailures: 0,
        terminalFailures: 0,
        runAt: "2026-07-17T15:00:00.000Z"
      };
    }
  };
  process.env.SUPABASE_SERVICE_ROLE_KEY = secret;

  try {
    await withServer(async (baseUrl) => {
      const healthResponse = await fetch(`${baseUrl}/api/sync-health`);
      const health = await healthResponse.json();
      const runResponse = await fetch(`${baseUrl}/api/sync/run`, { method: "POST" });
      const run = await runResponse.json();

      assert.equal(healthResponse.status, 200);
      assert.equal(health.configured, true);
      assert.equal(health.pending, 1);
      assert.equal(runResponse.status, 200);
      assert.equal(run.run.processed, 1);
      assert.equal(run.health.pending, 0);
      assert.equal(runs, 1);
      assert.equal(JSON.stringify([health, run]).includes(secret), false);
      assert.equal("url" in health, false);
      assert.equal("authorization" in health, false);
    }, { syncWorker });
  } finally {
    if (previous === undefined) {
      delete process.env.SUPABASE_SERVICE_ROLE_KEY;
    } else {
      process.env.SUPABASE_SERVICE_ROLE_KEY = previous;
    }
  }
});

test("HTTP API keeps missing synchronization configuration nonfatal", async (t) => {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "bear-edge-sync-api-"));
  t.after(() => fs.rmSync(tempDir, { recursive: true, force: true }));

  await withServer(async (baseUrl) => {
    const healthResponse = await fetch(`${baseUrl}/api/sync-health`);
    const health = await healthResponse.json();
    const runResponse = await fetch(`${baseUrl}/api/sync/run`, { method: "POST" });
    const run = await runResponse.json();

    assert.equal(healthResponse.status, 200);
    assert.equal(health.enabled, false);
    assert.equal(runResponse.status, 503);
    assert.equal(run.error, "Supabase synchronization is disabled.");
    assert.equal(typeof run.health.configured, "boolean");
  }, {
    outboxPath: path.join(tempDir, "sync_outbox.jsonl")
  });
});

test("HTTP API parses DK Predictions visible board snapshots", async () => {
  await withServer(async (baseUrl) => {
    const response = await fetch(`${baseUrl}/api/dk-predictions-board-snapshot`, {
      method: "POST",
      headers: {
        "content-type": "application/json"
      },
      body: JSON.stringify({
        date: "2026-06-27",
        capturedAt: "2026-06-27T12:50:17-04:00",
        bankroll: 206.44,
        events: [
          {
            league: "MLB",
            game: "ARI @ TB",
            startTime: "Today 6:10 PM",
            away: { abbreviation: "ARI", name: "ARI Diamondbacks" },
            home: { abbreviation: "TB", name: "TB Rays" },
            markets: {
              moneyline: [
                { side: "away", odds: 127 },
                { side: "home", odds: -144 }
              ]
            }
          }
        ]
      })
    });
    const payload = await response.json();

    assert.equal(response.status, 200);
    assert.equal(payload.provider, "DraftKings Predictions");
    assert.equal(payload.summary.events, 1);
    assert.equal(payload.summary.moneylineMarkets, 2);
    assert.equal(payload.markets[0].market_type, "MLB_side");
    assert.equal(payload.markets[0].implied_probability, 0.4405);
  });
});

test("HTTP API parses DK Predictions raw OCR prop snapshots", async () => {
  const text = `
Michael Wacha Total Strikeouts
Kansas City Royals @ New York Mets
Over 4.5
Over 5.5
Over 3.5
Sean Manaea Total Strikeouts
Kansas City Royals @ New York Mets
Over 4.5
Over 5.5
Over 3.5
$114.45 +
Starts in: 03:11:03
Today 1:10 PM
Strikeouts
Yes
-133
Yes
+156
Yes
-317
No
+113
No
-300
No
+186
More >
Yes
-150
Yes
+133
Yes
-376
No
+138
No
-186
No
+212
More >
`;

  await withServer(async (baseUrl) => {
    const response = await fetch(`${baseUrl}/api/dk-predictions-board-snapshot`, {
      method: "POST",
      headers: {
        "content-type": "application/json"
      },
      body: JSON.stringify({
        text,
        capturedAt: "2026-07-09T13:58:57.000Z",
        sourceFile: "kc-mets-strikeouts.png"
      })
    });
    const payload = await response.json();

    assert.equal(response.status, 200);
    assert.equal(payload.summary.events, 1);
    assert.equal(payload.summary.playerPropMarkets, 6);
    assert.equal(payload.summary.strikeoutMarkets, 6);
    assert.equal(payload.summary.totalBasesMarkets, 0);
    assert.equal(payload.bankroll, 114.45);

    const wacha = payload.markets.find((market) => market.team_or_player === "Michael Wacha" && market.line === 4.5);
    const manaea = payload.markets.find((market) => market.team_or_player === "Sean Manaea" && market.line === 5.5);

    assert.equal(wacha.market_type, "MLB_pitcher_strikeouts");
    assert.equal(wacha.market_name, "over 4.5 strikeouts");
    assert.equal(wacha.odds, -133);
    assert.equal(wacha.opposite_odds, 113);
    assert.equal(manaea.odds, 133);
    assert.equal(manaea.opposite_odds, -186);
  });
});

test("HTTP API simulates a verified betting card", async () => {
  await withServer(async (baseUrl) => {
    const response = await fetch(`${baseUrl}/api/simulate-card`, {
      method: "POST",
      headers: {
        "content-type": "application/json"
      },
      body: JSON.stringify({
        seed: "api-sim",
        iterations: 3,
        startingBankroll: 206.44,
        bets: [
          {
            selection: "AZ moneyline",
            americanOdds: 127,
            stake: 1.55,
            fairProbability: 0.52313636,
            marketImpliedProbability: 0.4405
          }
        ]
      })
    });
    const payload = await response.json();

    assert.equal(response.status, 200);
    assert.equal(payload.iterations, 3);
    assert.equal(payload.trials.length, 3);
    assert.equal(payload.bets[0].causality.causalClaimAllowed, false);
    assert.equal(payload.amountStakedPerTrial, 1.55);
  });
});

test("HTTP API reports live data health with provider freshness", async () => {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "bear-edge-live-health-"));

  await withServer(
    async (baseUrl) => {
      const response = await fetch(`${baseUrl}/api/live-data-health?date=2026-06-17&days=1`);
      const payload = await response.json();

      assert.equal(response.status, 200);
      assert.ok(["live", "live-with-warnings", "stale", "clock-error", "blocked"].includes(payload.status));
      assert.equal(payload.heartbeatMs, 60000);
      assert.equal(typeof payload.requirements.officialScoreboards, "boolean");
      assert.ok(payload.providers.some((provider) => provider.provider === "ESPN"));
      assert.ok(payload.providers.every((provider) => typeof provider.liveStatus === "string"));
      assert.equal(JSON.stringify(payload).includes("apiKey="), false);
      assert.ok(Array.isArray(payload.actions));
    },
    {
      autoUpdateSnapshotPath: path.join(tempDir, "snapshot.json")
    }
  );
});

test("HTTP API serves the local dashboard", async () => {
  await withServer(async (baseUrl) => {
    const dashboardResponse = await fetch(`${baseUrl}/dashboard`);
    const jsResponse = await fetch(`${baseUrl}/dashboard/app.js`);
    const manifestResponse = await fetch(`${baseUrl}/dashboard/manifest.json`);
    const serviceWorkerResponse = await fetch(`${baseUrl}/dashboard/sw.js`);
    const iconResponse = await fetch(`${baseUrl}/dashboard/icon.svg`);

    assert.equal(dashboardResponse.status, 200);
    const dashboardHtml = await dashboardResponse.text();
    assert.match(dashboardHtml, /Bet Research Desk/);
    assert.match(dashboardHtml, /Operator Board/);
    assert.match(dashboardHtml, /bankrollInput/);
    assert.match(dashboardHtml, /sportsbookMinInput/);
    assert.match(dashboardHtml, /riskModeSelect/);
    assert.match(dashboardHtml, /unitGuardBoard/);
    assert.match(dashboardHtml, /ticketPreflightBoard/);
    assert.match(dashboardHtml, /simulateTicketButton/);
    assert.match(dashboardHtml, /Universal Screenshot Intake/);
    assert.match(dashboardHtml, /globalDropOverlay/);
    assert.match(dashboardHtml, /screenshotImageInput/);
    assert.match(dashboardHtml, /screenshotParserSelect/);
    assert.match(dashboardHtml, /dk-predictions/);
    assert.match(dashboardHtml, /worldcup-goalscorer/);
    assert.match(dashboardHtml, /screenshotDropZone/);
    assert.match(dashboardHtml, /Auto Update/);
    assert.match(dashboardHtml, /Live Data Heartbeat/);
    assert.match(dashboardHtml, /liveDataHealthBoard/);
    assert.match(dashboardHtml, /liveDataHealthRefreshButton/);
    assert.match(dashboardHtml, /System Audit/);
    assert.match(dashboardHtml, /systemAuditRefreshButton/);
    assert.match(dashboardHtml, /Release Readiness/);
    assert.match(dashboardHtml, /releaseReadinessRefreshButton/);
    assert.match(dashboardHtml, /Verified Odds API/);
    assert.match(dashboardHtml, /oddsApiKeyInput/);
    assert.match(dashboardHtml, /Online Opportunities/);
    assert.match(dashboardHtml, /StatMuse Snapshot Intake/);
    assert.match(dashboardHtml, /ESPN Snapshot Intake/);
    assert.match(dashboardHtml, /DraftKings Board Intake/);
    assert.match(dashboardHtml, /Recording Prop Comparison/);
    assert.match(dashboardHtml, /Provider Setup Checklist/);
    assert.match(dashboardHtml, /Apply Odds Text/);
    assert.match(dashboardHtml, /candidateSportFilter/);
    assert.match(dashboardHtml, /candidateMarketFilter/);
    assert.match(dashboardHtml, /candidateSortSelect/);
    assert.match(dashboardHtml, /candidatePricedOnlyInput/);
    assert.match(dashboardHtml, /candidateActionBoard/);
    assert.match(dashboardHtml, /Auto 2-Leg/);
    assert.match(dashboardHtml, /Auto 3-Leg/);
    assert.match(dashboardHtml, /statMuseImageInput/);
    assert.match(dashboardHtml, /statMuseSourceUrlInput/);
    assert.match(dashboardHtml, /espnImageInput/);
    assert.match(dashboardHtml, /espnSourceUrlInput/);
    assert.match(dashboardHtml, /draftKingsImageInput/);
    assert.match(dashboardHtml, /recordingComparisonCsvInput/);
    assert.match(dashboardHtml, /recordingComparisonBoardInput/);
    assert.match(dashboardHtml, /onlineOpportunitiesRefreshButton/);
    assert.match(dashboardHtml, /Upload Screenshot/);
    assert.match(dashboardHtml, /manifest.json/);
    assert.match(dashboardHtml, /installAppButton/);
    assert.equal(jsResponse.status, 200);
    const dashboardScript = await jsResponse.text();

    assert.match(dashboardScript, /loadDashboard/);
    assert.match(dashboardScript, /renderUnitGuard/);
    assert.match(dashboardScript, /renderOperatorStatus/);
    assert.match(dashboardScript, /validateTicketPreflight/);
    assert.match(dashboardScript, /isSingleTicket/);
    assert.match(dashboardScript, /isParlayTicket/);
    assert.match(dashboardScript, /applyBankrollPolicyToTicket/);
    assert.match(dashboardScript, /Ticket preflight blocked evaluation/);
    assert.match(dashboardScript, /loadAutoUpdateStatus/);
    assert.match(dashboardScript, /LIVE_DATA_HEARTBEAT_MS/);
    assert.match(dashboardScript, /loadLiveDataHealth/);
    assert.match(dashboardScript, /renderLiveSourceMatrix/);
    assert.match(dashboardScript, /Source Health Matrix/);
    assert.match(dashboardScript, /live-source-matrix/);
    assert.match(dashboardScript, /\/api\/live-data-health/);
    assert.match(dashboardScript, /loadSystemAudit/);
    assert.match(dashboardScript, /loadReleaseReadiness/);
    assert.match(dashboardScript, /\/api\/release-readiness/);
    assert.match(dashboardScript, /release-lane/);
    assert.match(dashboardScript, /release-evidence/);
    assert.match(dashboardScript, /freshPricedCandidates/);
    assert.match(dashboardScript, /bookmakerMatches/);
    assert.match(dashboardScript, /oldestPriceAgeMinutes/);
    assert.match(dashboardScript, /Odds Evidence/);
    assert.match(dashboardScript, /Evidence Gates/);
    assert.match(dashboardScript, /Next Actions/);
    assert.match(dashboardScript, /loadOddsKeyStatus/);
    assert.match(dashboardScript, /loadProviderSetup/);
    assert.match(dashboardScript, /saveProviderKey/);
    assert.match(dashboardScript, /\/api\/system-audit/);
    assert.match(dashboardScript, /\/api\/settings\/odds-key/);
    assert.match(dashboardScript, /\/api\/provider-requirements/);
    assert.match(dashboardScript, /\/api\/provider-requirements\/key/);
    assert.match(dashboardScript, /Operational Next Actions/);
    assert.match(dashboardScript, /\/api\/auto-update\/history/);
    assert.match(dashboardScript, /\/api\/auto-update\/snapshot/);
    assert.match(dashboardScript, /Recent Auto-Update Runs/);
    assert.match(dashboardScript, /Data Cache/);
    assert.match(dashboardScript, /runAutoUpdateNow/);
    assert.match(dashboardScript, /loadSourceStatus/);
    assert.match(dashboardScript, /parseStatMuseSnapshot/);
    assert.match(dashboardScript, /renderStatMuseGamePage/);
    assert.match(dashboardScript, /\/api\/snapshot-confirmation/);
    assert.match(dashboardScript, /data-espn-confirm/);
    assert.match(dashboardScript, /Mark Manually Confirmed/);
    assert.match(dashboardScript, /parseDraftKingsSnapshot/);
    assert.match(dashboardScript, /runRecordingComparison/);
    assert.match(dashboardScript, /renderRecordingComparison/);
    assert.match(dashboardScript, /loadOnlineOpportunities/);
    assert.match(dashboardScript, /\/api\/online-opportunities/);
    assert.match(dashboardScript, /parseSnapshotImage/);
    assert.match(dashboardScript, /renderScreenshotIntakeResult/);
    assert.match(dashboardScript, /DK Predictions/);
    assert.match(dashboardScript, /selectedScreenshotParser/);
    assert.match(dashboardScript, /\/api\/ocr-snapshot/);
    assert.match(dashboardScript, /importCandidateOddsText/);
    assert.match(dashboardScript, /\/api\/candidate-odds-import/);
    assert.match(dashboardScript, /\/api\/recording-props-compare/);
    assert.match(dashboardScript, /Evaluate Price/);
    assert.match(dashboardScript, /Evaluate Current Price/);
    assert.match(dashboardScript, /global-drop-visible/);
    assert.match(dashboardScript, /drop-active/);
    assert.match(dashboardScript, /DraftKings Network Editorial Context/);
    assert.match(dashboardScript, /Cross-sport 2-leg alt prop parlay/);
    assert.match(dashboardScript, /loadCandidates/);
    assert.match(dashboardScript, /findBestTarget/);
    assert.match(dashboardScript, /load-best-target-button/);
    assert.match(dashboardScript, /evaluate-best-target-button/);
    assert.match(dashboardScript, /add-best-target-to-parlay-button/);
    assert.match(dashboardScript, /best-target-market-odds/);
    assert.match(dashboardScript, /evaluate-best-target-with-odds-button/);
    assert.match(dashboardScript, /buildTicketFromBestTarget/);
    assert.match(dashboardScript, /simulateLoadedTicket/);
    assert.match(dashboardScript, /modelProbabilityOverride/);
    assert.match(dashboardScript, /Load Draft/);
    assert.match(dashboardScript, /Load With Odds/);
    assert.match(dashboardScript, /parseAmericanOddsInput/);
    assert.match(dashboardScript, /updateCandidateEdgePreview/);
    assert.match(dashboardScript, /autoBuildParlayFromPricedCards/);
    assert.match(dashboardScript, /parlayBuilderSummary/);
    assert.match(dashboardScript, /applyCandidateFilters/);
    assert.match(dashboardScript, /renderCandidateActionBoard/);
    assert.match(dashboardScript, /sortCandidateCards/);
    assert.match(dashboardScript, /Best Rough EV/);
    assert.match(dashboardScript, /No-vig edge/);
    assert.match(dashboardScript, /Add real sportsbook marketOdds/);
    assert.match(dashboardScript, /manual sportsbook odds/);
    assert.match(dashboardScript, /loadInitialDashboardPanels/);
    assert.match(dashboardScript, /loadDeferredDashboardPanels/);
    assert.match(dashboardScript, /deferDashboardWork/);
    assert.match(dashboardScript, /serviceWorker.register/);
    assert.match(dashboardScript, /bearEdge.ticketDraft/);
    const startupIndex = dashboardScript.lastIndexOf("loadHealth()\n  .then");
    assert.notEqual(startupIndex, -1);
    const startupBlock = dashboardScript.slice(startupIndex);
    assert.match(startupBlock, /await loadInitialDashboardPanels\(\)/);
    assert.match(startupBlock, /deferDashboardWork\(\(\) => loadDeferredDashboardPanels\(\)\)/);
    assert.doesNotMatch(startupBlock, /loadBestTargets\("today"\)/);
    assert.doesNotMatch(startupBlock, /loadCandidates\("today"\)/);
    assert.equal(manifestResponse.status, 200);
    assert.equal(manifestResponse.headers.get("content-type"), "application/manifest+json; charset=utf-8");
    const manifest = await manifestResponse.json();
    assert.equal(manifest.display, "standalone");
    assert.equal(manifest.start_url, "/dashboard");
    assert.equal(serviceWorkerResponse.status, 200);
    assert.match(await serviceWorkerResponse.text(), /Never cache API responses/);
    assert.equal(iconResponse.status, 200);
    assert.match(await iconResponse.text(), /Bear Edge/);
  });
});

test("HTTP API exposes provider setup requirements without leaking secrets", async () => {
  const previousOddsApiKey = process.env.THE_ODDS_API_KEY;
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "bear-edge-provider-setup-"));

  process.env.THE_ODDS_API_KEY = "test-provider-secret";
  fs.writeFileSync(path.join(tempDir, ".env.local"), "THE_ODDS_API_KEY=\nSPORTSDATAIO_API_KEY=\n", "utf8");

  try {
    await withServer(
      async (baseUrl) => {
        const response = await fetch(`${baseUrl}/api/provider-requirements`);
        const payload = await response.json();

        assert.equal(response.status, 200);
        assert.equal(payload.summary.total >= 5, true);
        assert.equal(payload.summary.requiredReady, true);
        assert.equal(payload.providers.some((provider) => provider.id === "the-odds-api" && provider.status === "configured"), true);
        assert.equal(payload.providers.some((provider) => provider.id === "sportsdataio" && provider.status === "blank"), true);
        assert.equal(JSON.stringify(payload).includes("test-provider-secret"), false);
      },
      { settingsRootDir: tempDir }
    );
  } finally {
    if (previousOddsApiKey === undefined) {
      delete process.env.THE_ODDS_API_KEY;
    } else {
      process.env.THE_ODDS_API_KEY = previousOddsApiKey;
    }
  }
});

test("HTTP API saves generic provider keys without leaking secrets", async () => {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "bear-edge-provider-key-"));
  const previousSportsDataIoKey = process.env.SPORTSDATAIO_API_KEY;
  const previousOddsApiKey = process.env.THE_ODDS_API_KEY;

  delete process.env.SPORTSDATAIO_API_KEY;
  delete process.env.THE_ODDS_API_KEY;
  fs.writeFileSync(path.join(tempDir, ".env.local"), "SPORTSDATAIO_API_KEY=\nTHE_ODDS_API_KEY=\n", "utf8");

  try {
    await withServer(
      async (baseUrl) => {
        const invalidResponse = await fetch(`${baseUrl}/api/provider-requirements/key`, {
          method: "POST",
          headers: {
            "content-type": "application/json"
          },
          body: JSON.stringify({
            providerId: "sportsdataio",
            envKey: "SPORTSDATAIO_API_KEY",
            apiKey: "placeholder-secret-value"
          })
        });
        const invalid = await invalidResponse.json();

        assert.equal(invalidResponse.status, 400);
        assert.equal(JSON.stringify(invalid).includes("placeholder-secret-value"), false);

        const saveResponse = await fetch(`${baseUrl}/api/provider-requirements/key`, {
          method: "POST",
          headers: {
            "content-type": "application/json"
          },
          body: JSON.stringify({
            providerId: "sportsdataio",
            envKey: "SPORTSDATAIO_API_KEY",
            apiKey: "sportsdataio-test-key"
          })
        });
        const saved = await saveResponse.json();

        assert.equal(saveResponse.status, 200);
        assert.equal(saved.configured, true);
        assert.equal(saved.envKey, "SPORTSDATAIO_API_KEY");
        assert.equal(saved.verification.status, "saved_unverified");
        assert.equal(JSON.stringify(saved).includes("sportsdataio-test-key"), false);
        assert.match(fs.readFileSync(path.join(tempDir, ".env.local"), "utf8"), /SPORTSDATAIO_API_KEY=sportsdataio-test-key/);

        const oddsResponse = await fetch(`${baseUrl}/api/provider-requirements/key`, {
          method: "POST",
          headers: {
            "content-type": "application/json"
          },
          body: JSON.stringify({
            providerId: "the-odds-api",
            envKey: "THE_ODDS_API_KEY",
            apiKey: "test-odds-key"
          })
        });
        const oddsSaved = await oddsResponse.json();

        assert.equal(oddsResponse.status, 200);
        assert.equal(oddsSaved.verification.status, "ok");
        assert.equal(oddsSaved.verification.sports > 0, true);
        assert.equal(JSON.stringify(oddsSaved).includes("test-odds-key"), false);
      },
      { settingsRootDir: tempDir }
    );
  } finally {
    if (previousSportsDataIoKey === undefined) {
      delete process.env.SPORTSDATAIO_API_KEY;
    } else {
      process.env.SPORTSDATAIO_API_KEY = previousSportsDataIoKey;
    }

    if (previousOddsApiKey === undefined) {
      delete process.env.THE_ODDS_API_KEY;
    } else {
      process.env.THE_ODDS_API_KEY = previousOddsApiKey;
    }
  }
});

test("HTTP API exposes local system audit without leaking key values", async () => {
  await withServer(async (baseUrl) => {
    const response = await fetch(`${baseUrl}/api/system-audit`);
    const payload = await response.json();

    assert.equal(response.status, 200);
    assert.equal(payload.package.name, "betting-decision-engine");
    assert.equal(payload.rootDir, path.resolve(__dirname, ".."));
    assert.equal(payload.readiness.localFilesOk, true);
    assert.equal(payload.paths.some((entry) => entry.label === "dashboard js" && entry.exists), true);
    assert.equal(payload.commands.some((entry) => entry.command === "git"), true);
    assert.ok(payload.nextActions.some((entry) => entry.area === "Live odds"));
    assert.equal(payload.environment.keys.some((entry) => entry.name === "THE_ODDS_API_KEY" && typeof entry.configured === "boolean"), true);
    assert.equal(JSON.stringify(payload).includes(process.env.THE_ODDS_API_KEY ?? "unlikely-secret-marker"), false);
  });
});

test("HTTP API exposes release readiness checks", async () => {
  await withServer(async (baseUrl) => {
    const response = await fetch(`${baseUrl}/api/release-readiness`);
    const payload = await response.json();

    assert.equal(response.status, 200);
    assert.equal(payload.package.name, "betting-decision-engine");
    assert.equal(["ready", "ready-with-evidence-gates", "shippable-with-warnings", "blocked"].includes(payload.status), true);
    assert.equal(typeof payload.summary.score, "number");
    assert.equal(typeof payload.summary.info, "number");
    assert.equal(payload.lanes.some((entry) => entry.id === "local-app"), true);
    assert.equal(payload.lanes.some((entry) => entry.id === "data-edge"), true);
    assert.equal(payload.evidenceGates.some((entry) => entry.id === "recent-win-streak"), true);
    const calibrationGate = payload.evidenceGates.find(
      (entry) => entry.id === "model-calibration-registry"
    );
    assert.equal(payload.modelCalibration.registryValid, true);
    assert.equal(payload.modelCalibration.registeredModelCount, 4);
    assert.equal(payload.modelCalibration.validatedModelCount, 0);
    assert.deepEqual(
      payload.modelCalibration.models.map((model) => model.marketFamily).sort(),
      ["batter_hits", "batter_runs_scored", "batter_total_bases", "pitcher_strikeouts"]
    );
    assert.equal(payload.modelCalibration.models.every((model) => model.registryStatus === "research_only"), true);
    assert.equal(calibrationGate.status, "blocked");
    assert.equal(calibrationGate.complete, false);
    assert.equal(
      payload.evidenceGates.find((entry) => entry.id === "recent-win-streak").label,
      "Recent win streak (descriptive)"
    );
    assert.equal(payload.checks.some((entry) => /three-win|win streak/i.test(entry.message)), false);
    assert.equal(payload.nextActions.every((entry) => typeof entry.action === "string"), true);
    assert.equal(payload.checks.some((entry) => entry.area === "security"), true);
    assert.equal(payload.checks.some((entry) => entry.message === "GitHub Actions CI workflow exists"), true);
    assert.equal(payload.checks.some((entry) => entry.message === "Local dashboard binds to localhost by default" && entry.status === "pass"), true);
    assert.deepEqual(payload.trackedFiles.blockedMatches, []);
    assert.equal(JSON.stringify(payload).includes(process.env.THE_ODDS_API_KEY ?? "unlikely-secret-marker"), false);
  });
});

test("release readiness blocks on terminal synchronization failures", async () => {
  const syncWorker = {
    getStatus: async () => ({
      provider: "supabase",
      configured: true,
      enabled: true,
      started: true,
      running: false,
      pending: 0,
      retryableFailures: 0,
      terminalFailures: 1,
      synchronized: 4,
      oldestPendingAgeMs: null,
      lastRunAt: "2026-07-17T15:00:00.000Z",
      lastSuccessAt: "2026-07-17T14:59:00.000Z",
      lastSafeError: "A remote record has a different digest",
      integrityIssues: 0,
      secretReturned: false
    })
  };

  await withServer(async (baseUrl) => {
    const response = await fetch(`${baseUrl}/api/release-readiness`);
    const payload = await response.json();
    const projectionGate = payload.evidenceGates.find(
      (entry) => entry.id === "remote-audit-projection"
    );
    const projectionCheck = payload.checks.find(
      (entry) => entry.message === "Remote audit projection has terminal failures"
    );

    assert.equal(response.status, 200);
    assert.equal(payload.status, "blocked");
    assert.equal(projectionGate.status, "blocked");
    assert.equal(projectionGate.complete, false);
    assert.equal(projectionCheck.status, "fail");
    assert.equal(projectionCheck.detail.terminalFailures, 1);
  }, { syncWorker });
});

test("release readiness warns when a configured odds key fails live pricing", async () => {
  const previousOddsApiKey = process.env.THE_ODDS_API_KEY;

  process.env.THE_ODDS_API_KEY = "test-odds-key";

  try {
    await withServer(
      async (baseUrl) => {
        const response = await fetch(`${baseUrl}/api/release-readiness`);
        const payload = await response.json();
        const dataEdge = payload.lanes.find((entry) => entry.id === "data-edge");

        assert.equal(response.status, 200);
        assert.equal(payload.dataEdge.odds.status, "provider_error");
        assert.equal(payload.dataEdge.bestTargets.status, "odds_error");
        assert.equal(payload.dataEdge.betCallPermission, "PRICE_CHECK_ONLY");
        assert.equal(dataEdge.status, "needs-work");
        assert.ok(payload.checks.some((entry) =>
          entry.area === "providers" &&
          entry.status === "warn" &&
          entry.message === "Verified odds provider live pricing is failing"
        ));
        assert.ok(payload.nextActions.some((entry) =>
          entry.area === "providers" &&
          entry.action.includes("Fix or replace the verified odds API key")
        ));
        assert.equal(JSON.stringify(payload).includes("test-odds-key"), false);
      },
      {
        fetchJsonImpl: async (url) => {
          if (String(url).includes("api.the-odds-api.com/v4/sports/baseball_mlb/odds")) {
            throw new Error("Failed to fetch apiKey=test-odds-key: 401 Unauthorized");
          }

          return fetchJson(url);
        },
        fetchTextImpl: fetchText
      }
    );
  } finally {
    if (previousOddsApiKey === undefined) {
      delete process.env.THE_ODDS_API_KEY;
    } else {
      process.env.THE_ODDS_API_KEY = previousOddsApiKey;
    }
  }
});

test("HTTP API exposes auto-update status and manual run", async () => {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "bear-edge-auto-update-api-"));
  const autoUpdateLogPath = path.join(tempDir, "auto_update_log.jsonl");
  const autoUpdateLatestPath = path.join(tempDir, "auto_update_latest.json");
  const autoUpdateSnapshotPath = path.join(tempDir, "auto_update_snapshot.json");
  const persistedRun = {
    id: "auto_test",
    recordType: "auto_update_run",
    status: "ok",
    reason: "test_seed",
    finishedAt: "2026-06-17T12:00:00.000Z",
    durationMs: 42,
    result: {
      games: { gameCount: 2 },
      candidates: { candidateCount: 1 },
      sourceStatus: { blockedProviders: ["DraftKings"] }
    }
  };
  const persistedSnapshot = {
    recordType: "auto_update_snapshot",
    generatedAt: "2026-06-17T12:00:00.000Z",
    games: {
      games: [{ id: "game_1" }]
    },
    candidates: {
      candidates: [{ id: "candidate_1" }]
    }
  };
  const fakeService = {
    getStatus() {
      return {
        enabled: true,
        started: true,
        running: false,
        runCount: 1,
        failureCount: 0,
        lastResult: {
          games: { gameCount: 2 }
        }
      };
    },
    async runNow(context) {
      return {
        enabled: true,
        started: true,
        running: false,
        runCount: 2,
        failureCount: 0,
        lastRunReason: context.reason
      };
    }
  };

  fs.writeFileSync(autoUpdateLogPath, `${JSON.stringify(persistedRun)}\n`);
  fs.writeFileSync(autoUpdateLatestPath, `${JSON.stringify(persistedRun, null, 2)}\n`);
  fs.writeFileSync(autoUpdateSnapshotPath, `${JSON.stringify(persistedSnapshot, null, 2)}\n`);

  await withServer(
    async (baseUrl) => {
      const statusResponse = await fetch(`${baseUrl}/api/auto-update`);
      const status = await statusResponse.json();

      assert.equal(statusResponse.status, 200);
      assert.equal(status.enabled, true);
      assert.equal(status.runCount, 1);
      assert.equal(status.lastResult.games.gameCount, 2);

      const runResponse = await fetch(`${baseUrl}/api/auto-update/run`, {
        method: "POST"
      });
      const run = await runResponse.json();

      assert.equal(runResponse.status, 200);
      assert.equal(run.runCount, 2);
      assert.equal(run.lastRunReason, "manual_api");

      const historyResponse = await fetch(`${baseUrl}/api/auto-update/history?limit=1`);
      const history = await historyResponse.json();

      assert.equal(historyResponse.status, 200);
      assert.equal(history.logPath, autoUpdateLogPath);
      assert.equal(history.latestPath, autoUpdateLatestPath);
      assert.equal(history.totalRecords, 1);
      assert.equal(history.records[0].id, "auto_test");
      assert.equal(history.records[0].result.sourceStatus.blockedProviders[0], "DraftKings");

      const snapshotResponse = await fetch(`${baseUrl}/api/auto-update/snapshot`);
      const snapshot = await snapshotResponse.json();

      assert.equal(snapshotResponse.status, 200);
      assert.equal(snapshot.exists, true);
      assert.equal(snapshot.snapshotPath, autoUpdateSnapshotPath);
      assert.equal(snapshot.snapshot.games.games[0].id, "game_1");
    },
    { autoUpdateService: fakeService, autoUpdateLogPath, autoUpdateLatestPath, autoUpdateSnapshotPath }
  );
});

test("auto-update service refreshes current source, game, candidate, and log summaries", async () => {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "bear-edge-auto-update-"));
  const logPath = path.join(tempDir, "decision_log.jsonl");
  const autoUpdateLogPath = path.join(tempDir, "auto_update_log.jsonl");
  const autoUpdateLatestPath = path.join(tempDir, "auto_update_latest.json");
  const autoUpdateSnapshotPath = path.join(tempDir, "auto_update_snapshot.json");
  const service = createAutoUpdateService({
    intervalMs: 60_000,
    fetchJsonImpl: fetchJson,
    fetchTextImpl: fetchText,
    logPath,
    autoUpdateLogPath,
    autoUpdateLatestPath,
    autoUpdateSnapshotPath,
    maxCandidates: 2
  });

  const status = await service.runNow({ reason: "test" });

  service.stop();
  assert.equal(status.running, false);
  assert.equal(status.runCount, 1);
  assert.equal(status.failureCount, 0);
  assert.equal(status.lastRunReason, "test");
  assert.equal(status.lastResult.sourceStatus.providers.length, 5);
  assert.equal(status.lastResult.games.gameCount, 6);
  assert.equal(status.lastResult.candidates.candidateCount, 2);
  assert.equal(status.lastResult.decisionLog.totalEvaluations, 0);
  assert.equal(status.lastResult.endpoints.games, "/api/games?date=today&days=2");
  assert.equal(status.historyPath, autoUpdateLogPath);
  assert.equal(status.latestPath, autoUpdateLatestPath);
  assert.equal(status.snapshotPath, autoUpdateSnapshotPath);
  assert.match(status.lastPersistedAt, /^\d{4}-\d{2}-\d{2}T/);
  assert.match(status.lastSnapshotPersistedAt, /^\d{4}-\d{2}-\d{2}T/);
  assert.equal(status.lastResult.snapshot.path, autoUpdateSnapshotPath);
  assert.equal(status.lastResult.snapshot.includes[1], "games");

  const history = await readAutoUpdateHistory({
    autoUpdateLogPath,
    autoUpdateLatestPath
  });
  const snapshot = await readAutoUpdateSnapshot({
    autoUpdateSnapshotPath
  });
  const latest = JSON.parse(fs.readFileSync(autoUpdateLatestPath, "utf8"));

  assert.equal(history.totalRecords, 1);
  assert.equal(history.invalidLines, 0);
  assert.equal(history.records[0].recordType, "auto_update_run");
  assert.equal(history.records[0].status, "ok");
  assert.equal(history.records[0].result.games.gameCount, 6);
  assert.equal(latest.id, history.records[0].id);
  assert.equal(snapshot.exists, true);
  assert.equal(snapshot.snapshot.recordType, "auto_update_snapshot");
  assert.equal(snapshot.snapshot.games.games.length, 6);
  assert.equal(snapshot.snapshot.candidates.candidates.length, 2);
});

test("auto-update service persists failed runs without stale successful results", async () => {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "bear-edge-auto-update-fail-"));
  const autoUpdateLogPath = path.join(tempDir, "auto_update_log.jsonl");
  const autoUpdateLatestPath = path.join(tempDir, "auto_update_latest.json");
  const service = createAutoUpdateService({
    intervalMs: 60_000,
    fetchJsonImpl: async (url) => {
      throw new Error(`network unavailable: ${url}`);
    },
    fetchTextImpl: async () => ({
      ok: false,
      status: 503,
      statusText: "Service Unavailable",
      contentType: "text/plain",
      text: ""
    }),
    autoUpdateLogPath,
    autoUpdateLatestPath
  });

  const status = await service.runNow({ reason: "test_failure" });

  service.stop();
  assert.equal(status.running, false);
  assert.equal(status.runCount, 0);
  assert.equal(status.failureCount, 1);
  assert.equal(status.lastRunReason, "test_failure");
  assert.match(status.lastError, /network unavailable/);

  const history = await readAutoUpdateHistory({
    autoUpdateLogPath,
    autoUpdateLatestPath
  });
  const latest = JSON.parse(fs.readFileSync(autoUpdateLatestPath, "utf8"));

  assert.equal(history.totalRecords, 1);
  assert.equal(history.records[0].status, "error");
  assert.equal(history.records[0].result, null);
  assert.match(history.records[0].error, /network unavailable/);
  assert.equal(latest.status, "error");
  assert.equal(latest.result, null);
});

test("HTTP API reports live source freshness and blocked market feeds", async () => {
  await withServer(async (baseUrl) => {
    const response = await fetch(`${baseUrl}/api/source-status?date=2026-06-17&days=1`);
    const payload = await response.json();

    assert.equal(response.status, 200);
    assert.deepEqual(payload.dates, ["2026-06-17"]);
    assert.equal(payload.refreshPolicy.autoRefreshMs, 60000);

    const espn = payload.providers.find((provider) => provider.provider === "ESPN");
    const draftKings = payload.providers.find((provider) => provider.provider === "DraftKings");
    const statNews = payload.providers.find((provider) => provider.provider === "STAT News");
    const statMuse = payload.providers.find((provider) => provider.provider === "StatMuse");
    const tennis = payload.providers.find((provider) => provider.provider === "Tennis");

    assert.equal(espn.status, "ok");
    assert.equal(espn.summary.eventCount, 2);
    assert.equal(espn.summary.bySport.worldcup, 1);
    assert.equal(espn.summary.mlbTeamCount, 30);
    assert.equal(espn.summary.mlbInjuryCount, 1);
    assert.equal(espn.summary.rosterTeamsSampled, 2);
    assert.equal(draftKings.status, "blocked");
    assert.equal(draftKings.summary.directDraftKingsReachable, false);
    assert.equal(statNews.status, "ok");
    assert.equal(statNews.summary.articleCount, 1);
    assert.equal(statMuse.status, "ok");
    assert.equal(statMuse.summary.sportsMenuCount, 8);
    assert.equal(statMuse.summary.dailyQueriesChecked, 5);
    assert.equal(statMuse.summary.answeredQueries, 1);
    assert.equal(statMuse.summary.manualReviewRequired, true);
    assert.ok(statMuse.sources.some((source) => source.name === "StatMuse scores"));
    assert.equal(tennis.status, "blocked");
    assert.equal(tennis.summary.manualOnly, true);
    assert.equal(tennis.summary.oddsApiConfigured, false);
    assert.equal(tennis.summary.tennisStatsApiConfigured, false);
    assert.ok(payload.currentness.blockedProviders.includes("Tennis"));
  });
});

test("HTTP API reports odds provider as blocked until an API key exists", async () => {
  const previousOddsApiKey = process.env.THE_ODDS_API_KEY;
  const previousAltOddsApiKey = process.env.ODDS_API_KEY;

  delete process.env.THE_ODDS_API_KEY;
  delete process.env.ODDS_API_KEY;

  try {
    await withServer(async (baseUrl) => {
      const response = await fetch(`${baseUrl}/api/odds/markets?sport=mlb`);
      const payload = await response.json();

      assert.equal(response.status, 428);
      assert.equal(payload.status, "blocked");
      assert.equal(payload.requiresApiKey, true);
      assert.equal(payload.sportKey, "baseball_mlb");
    });
  } finally {
    if (previousOddsApiKey === undefined) {
      delete process.env.THE_ODDS_API_KEY;
    } else {
      process.env.THE_ODDS_API_KEY = previousOddsApiKey;
    }

    if (previousAltOddsApiKey === undefined) {
      delete process.env.ODDS_API_KEY;
    } else {
      process.env.ODDS_API_KEY = previousAltOddsApiKey;
    }
  }
});

test("HTTP API fetches provider odds when a configured API key exists", async () => {
  const previousOddsApiKey = process.env.THE_ODDS_API_KEY;

  process.env.THE_ODDS_API_KEY = "test-odds-key";

  try {
    await withServer(async (baseUrl) => {
      const sportsResponse = await fetch(`${baseUrl}/api/odds/sports`);
      const sports = await sportsResponse.json();
      const oddsResponse = await fetch(`${baseUrl}/api/odds/markets?sport=mlb&markets=h2h&bookmakers=draftkings`);
      const odds = await oddsResponse.json();

      assert.equal(sportsResponse.status, 200);
      assert.equal(sports.sports.some((sport) => sport.key === "baseball_mlb"), true);
      assert.equal(oddsResponse.status, 200);
      assert.equal(odds.status, "ok");
      assert.equal(odds.eventCount, 1);
      assert.equal(odds.events[0].bookmaker.key, "draftkings");
      assert.equal(odds.events[0].bookmaker.markets[0].outcomes[0].price, -145);
      assert.equal(odds.sourceUrl.includes("apiKey"), false);
      assert.equal(JSON.stringify(odds).includes("test-odds-key"), false);
    });
  } finally {
    if (previousOddsApiKey === undefined) {
      delete process.env.THE_ODDS_API_KEY;
    } else {
      process.env.THE_ODDS_API_KEY = previousOddsApiKey;
    }
  }
});

test("HTTP API ranks best MLB targets as price checks without an odds key", async () => {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "bear-edge-best-targets-"));
  const logPath = path.join(tempDir, "decision_log.jsonl");
  const previousOddsApiKey = process.env.THE_ODDS_API_KEY;
  const previousAltOddsApiKey = process.env.ODDS_API_KEY;

  delete process.env.THE_ODDS_API_KEY;
  delete process.env.ODDS_API_KEY;

  try {
    await withServer(async (baseUrl) => {
      const response = await fetch(`${baseUrl}/api/best-mlb-targets?date=2026-06-17&days=1&limit=3`);
      const payload = await response.json();

      assert.equal(response.status, 200);
      assert.equal(payload.status, "odds_needed");
      assert.equal(payload.summary.oddsApiConfigured, false);
      assert.equal(payload.best.length, 3);
      assert.equal(payload.best[0].status, "price_check");
      assert.equal(payload.best[0].odds, null);
      assert.equal(payload.best[0].evaluation, null);
      assert.equal(payload.best[0].auditRecord.verdict, "WAIT");
      assert.equal(payload.best[0].auditRecord.permission, "PRICE_CHECK_ONLY");
      assert.equal(payload.persistence.persistedCount, payload.best.length);
      assert.equal(fs.readFileSync(logPath, "utf8").trim().split("\n").length, payload.best.length);
      assert.ok(payload.warnings.some((warning) => warning.includes("price-check targets")));
    }, { logPath });
  } finally {
    if (previousOddsApiKey === undefined) {
      delete process.env.THE_ODDS_API_KEY;
    } else {
      process.env.THE_ODDS_API_KEY = previousOddsApiKey;
    }

    if (previousAltOddsApiKey === undefined) {
      delete process.env.ODDS_API_KEY;
    } else {
      process.env.ODDS_API_KEY = previousAltOddsApiKey;
    }
  }
});

test("best-target route returns no recommendations when authoritative persistence fails", async () => {
  const previousOddsApiKey = process.env.THE_ODDS_API_KEY;
  const previousAltOddsApiKey = process.env.ODDS_API_KEY;

  delete process.env.THE_ODDS_API_KEY;
  delete process.env.ODDS_API_KEY;

  try {
    await withServer(async (baseUrl) => {
      const response = await fetch(`${baseUrl}/api/best-mlb-targets?date=2026-06-17&days=1&limit=3`);
      const payload = await response.json();

      assert.equal(response.status, 500);
      assert.equal(Object.prototype.hasOwnProperty.call(payload, "best"), false);
      assert.match(payload.error, /forced recommendation ledger failure/i);
    }, {
      appendAuthoritativeRecordImpl: async () => {
        throw new Error("Forced recommendation ledger failure");
      }
    });
  } finally {
    if (previousOddsApiKey === undefined) {
      delete process.env.THE_ODDS_API_KEY;
    } else {
      process.env.THE_ODDS_API_KEY = previousOddsApiKey;
    }

    if (previousAltOddsApiKey === undefined) {
      delete process.env.ODDS_API_KEY;
    } else {
      process.env.ODDS_API_KEY = previousAltOddsApiKey;
    }
  }
});

test("HTTP API exposes explicit odds evidence and price-check permission", async () => {
  const previousOddsApiKey = process.env.THE_ODDS_API_KEY;
  const previousAltOddsApiKey = process.env.ODDS_API_KEY;

  delete process.env.THE_ODDS_API_KEY;
  delete process.env.ODDS_API_KEY;

  try {
    await withServer(async (baseUrl) => {
      const response = await fetch(`${baseUrl}/api/data-edge-audit?date=2026-06-17&days=1`);
      const payload = await response.json();

      assert.equal(response.status, 200);
      assert.equal(payload.betCallPermission, "PRICE_CHECK_ONLY");
      assert.equal(payload.odds.evidence.status, "blocked");
      assert.equal(payload.odds.evidence.permission, "PRICE_CHECK_ONLY");
      assert.ok(payload.odds.evidence.reasonCodes.includes("ODDS_PROVIDER_UNVERIFIED"));
      assert.equal(payload.odds.evidence.freshPricedCandidates, 0);
    });
  } finally {
    if (previousOddsApiKey === undefined) {
      delete process.env.THE_ODDS_API_KEY;
    } else {
      process.env.THE_ODDS_API_KEY = previousOddsApiKey;
    }

    if (previousAltOddsApiKey === undefined) {
      delete process.env.ODDS_API_KEY;
    } else {
      process.env.ODDS_API_KEY = previousAltOddsApiKey;
    }
  }
});

test("HTTP API prices and evaluates best MLB targets with a configured odds key", async () => {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "bear-edge-best-targets-priced-"));
  const logPath = path.join(tempDir, "decision_log.jsonl");
  const previousOddsApiKey = process.env.THE_ODDS_API_KEY;

  process.env.THE_ODDS_API_KEY = "test-odds-key";

  try {
    await withServer(async (baseUrl) => {
      const response = await fetch(`${baseUrl}/api/best-mlb-targets?date=2026-06-17&days=1&limit=3&bankroll=1000`);
      const payload = await response.json();

      assert.equal(response.status, 200);
      assert.equal(payload.status, "priced");
      assert.equal(payload.summary.oddsApiConfigured, true);
      assert.equal(payload.summary.eventsMatched, 1);
      assert.equal(payload.summary.eventsPriced, 1);
      assert.ok(payload.summary.pricedCandidates >= 1);
      assert.ok(payload.best.length >= 1);
      assert.equal(payload.best[0].status, "priced");
      assert.equal(payload.best[0].odds.bookmaker.key, "draftkings");
      assert.ok(payload.best[0].odds.marketContext.consensus.length >= 2);
      assert.equal(payload.best[0].evaluation.marketIntelligence.consensus.bookCount, 0);
      assert.ok(payload.best[0].evaluation.riskFlags.some((flag) => flag.code === "STALE_MARKET_PRICE"));
      assert.equal(typeof payload.best[0].odds.marketOdds, "number");
      assert.equal(payload.best[0].odds.match.confidence, 1);
      assert.equal(payload.best[0].ticketDraft.legs[0].marketOdds, payload.best[0].odds.marketOdds);
      assert.ok(payload.best[0].ticketDraft.legs[0].marketContext.consensus.length >= 2);
      assert.equal(payload.best[0].riskFlags.some((flag) => flag.code === "MISSING_MARKET_ODDS"), false);
      assert.ok(["BET", "PASS", "WAIT"].includes(payload.best[0].evaluation.verdict));
      assert.equal(payload.best[0].auditRecord.verdict, "WAIT");
      assert.equal(payload.best[0].auditRecord.permission, "VERIFIED_BETS_ALLOWED");
      assert.equal(payload.best[0].auditRecord.model.modelStatus, "research_only");
      assert.equal(payload.best[0].modelEvidence.registryStatus, "research_only");
      assert.equal(payload.best[0].modelEvidence.validated, false);
      assert.equal(payload.best[0].modelEvidence.calibrationReportDigest, null);
      const calibrationGate = payload.best[0].auditRecord.gateResults.find(
        (gate) => gate.gate === "model_calibration"
      );
      assert.equal(calibrationGate.passed, false);
      assert.deepEqual(calibrationGate.evidence, payload.best[0].modelEvidence);
      assert.equal(payload.persistence.persistedCount, payload.best.length);
      assert.equal(typeof payload.best[0].evaluation.expectedValueRoi, "number");
      assert.equal(payload.oddsSources.eventsSourceUrl?.includes("test-odds-key"), false);
      assert.equal(JSON.stringify(payload).includes("test-odds-key"), false);
    }, { logPath });
  } finally {
    if (previousOddsApiKey === undefined) {
      delete process.env.THE_ODDS_API_KEY;
    } else {
      process.env.THE_ODDS_API_KEY = previousOddsApiKey;
    }
  }
});

test("best MLB targets fall back to price checks when verified odds provider fails", async () => {
  const previousOddsApiKey = process.env.THE_ODDS_API_KEY;

  process.env.THE_ODDS_API_KEY = "test-odds-key";

  try {
    const payload = await getBestMlbTargets({
      date: "2026-06-17",
      days: 1,
      limit: 3,
      bankroll: 1000,
      fetchJsonImpl: async (url) => {
        if (String(url).includes("/odds?")) {
          throw new Error("Provider failed for apiKey=test-odds-key");
        }

        return fetchJson(url);
      }
    });

    assert.equal(payload.status, "odds_error");
    assert.equal(payload.summary.pricedCandidates, 0);
    assert.equal(payload.best[0].status, "price_check");
    assert.equal(payload.best[0].odds, null);
    assert.ok(payload.warnings.some((warning) => warning.includes("price-check targets")));
    assert.equal(JSON.stringify(payload).includes("test-odds-key"), false);
  } finally {
    if (previousOddsApiKey === undefined) {
      delete process.env.THE_ODDS_API_KEY;
    } else {
      process.env.THE_ODDS_API_KEY = previousOddsApiKey;
    }
  }
});

test("HTTP API saves and verifies a local odds API key without leaking it", async () => {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "bear-edge-api-odds-key-"));
  const previousOddsApiKey = process.env.THE_ODDS_API_KEY;
  const previousAltOddsApiKey = process.env.ODDS_API_KEY;

  delete process.env.THE_ODDS_API_KEY;
  delete process.env.ODDS_API_KEY;

  try {
    await withServer(
      async (baseUrl) => {
        const initialResponse = await fetch(`${baseUrl}/api/settings/odds-key`);
        const initial = await initialResponse.json();

        assert.equal(initialResponse.status, 200);
        assert.equal(initial.configured, false);
        assert.equal(initial.secretReturned, false);

        const invalidResponse = await fetch(`${baseUrl}/api/settings/odds-key`, {
          method: "POST",
          headers: {
            "content-type": "application/json"
          },
          body: JSON.stringify({ apiKey: "your_api_key" })
        });
        const invalid = await invalidResponse.json();

        assert.equal(invalidResponse.status, 400);
        assert.equal(JSON.stringify(invalid).includes("your_api_key"), false);

        const saveResponse = await fetch(`${baseUrl}/api/settings/odds-key`, {
          method: "POST",
          headers: {
            "content-type": "application/json"
          },
          body: JSON.stringify({ apiKey: "test-odds-key" })
        });
        const saved = await saveResponse.json();

        assert.equal(saveResponse.status, 200);
        assert.equal(saved.configured, true);
        assert.equal(saved.envKey, "THE_ODDS_API_KEY");
        assert.equal(saved.verification.status, "ok");
        assert.equal(saved.verification.sports > 0, true);
        assert.equal(JSON.stringify(saved).includes("test-odds-key"), false);
        assert.match(fs.readFileSync(path.join(tempDir, ".env.local"), "utf8"), /THE_ODDS_API_KEY=test-odds-key/);

        const testResponse = await fetch(`${baseUrl}/api/settings/odds-key/test`, {
          method: "POST"
        });
        const tested = await testResponse.json();

        assert.equal(testResponse.status, 200);
        assert.equal(tested.verification.status, "ok");
        assert.equal(JSON.stringify(tested).includes("test-odds-key"), false);

        const oddsResponse = await fetch(`${baseUrl}/api/odds/markets?sport=mlb&markets=h2h&bookmakers=draftkings`);
        const odds = await oddsResponse.json();

        assert.equal(oddsResponse.status, 200);
        assert.equal(odds.status, "ok");
        assert.equal(odds.events[0].bookmaker.key, "draftkings");
      },
      { settingsRootDir: tempDir }
    );
  } finally {
    if (previousOddsApiKey === undefined) {
      delete process.env.THE_ODDS_API_KEY;
    } else {
      process.env.THE_ODDS_API_KEY = previousOddsApiKey;
    }

    if (previousAltOddsApiKey === undefined) {
      delete process.env.ODDS_API_KEY;
    } else {
      process.env.ODDS_API_KEY = previousAltOddsApiKey;
    }
  }
});

test("HTTP API parses pasted StatMuse score snapshots without treating odds as verified", async () => {
  await withServer(async (baseUrl) => {
    const text = `
Sign in
All
NBA
NHL
MLB
Money
Tampa Bay Rays
TBR
4
Los Angeles Dodgers
LAD
5
Top 9
Toronto Blue Jays
TOR
Boston Red Sox
BOS
6:45 PM
-130
More Scores
Stats
Musings
News

 Justin Wrobleski vs Rays:

6.0 IP
3 H
0 R

He has a 2.51 ERA in 12 starts this season.
Justin Wrobleski vs Rays:

6.0 IP
3 H
0 R

He has a 2.51 ERA in 12 starts this season.
Get the latest news and updates from StatMuse
`;
    const response = await fetch(`${baseUrl}/api/statmuse-snapshot`, {
      method: "POST",
      headers: {
        "content-type": "application/json"
      },
      body: JSON.stringify({ text, capturedAt: "2026-06-17T21:00:00.000Z" })
    });
    const payload = await response.json();

    assert.equal(response.status, 200);
    assert.equal(payload.provider, "StatMuse");
    assert.equal(payload.summary.games, 2);
    assert.equal(payload.summary.liveGames, 1);
    assert.equal(payload.summary.scheduledGames, 1);
    assert.equal(payload.summary.displayedOdds, 1);
    assert.equal(payload.games[1].displayedMoneylineOdds, -130);
    assert.equal(payload.games[1].oddsSide, "unknown_from_paste");
    assert.ok(payload.summary.musings > 0);
    assert.ok(payload.warnings.some((warning) => warning.includes("not an official structured API")));
  });
});

test("HTTP API parses ESPN odds-page snapshots and keeps them unverified", async () => {
  await withServer(async (baseUrl) => {
    const text = [
      "New York Mets @ Philadelphia Phillies",
      "New York Mets",
      "40-57",
      "Philadelphia Phillies",
      "54-43",
      "7:00 PM",
      "Game Odds",
      "NYM",
      "\x2b112",
      "o9.5 -111",
      "\x2b1.5 -181",
      "PHI",
      "-147",
      "u9.5 -109",
      "-1.5 +149",
      "Matchup Predictor",
      "51.5",
      "%",
      "48.5",
      "%",
      "Hitting Props",
      "Bo Bichette",
      "NYM SS",
      "o1.5",
      "\x2b193",
      "u1.5",
      "-262",
      "Injury Report",
      "New York Mets",
      "Bo Bichette",
      "SS",
      "Day-To-Day"
    ].join("\n");
    const response = await fetch(`${baseUrl}/api/espn-snapshot`, {
      method: "POST",
      headers: {
        "content-type": "application/json"
      },
      body: JSON.stringify({
        sourceUrl: "https://www.espn.com/mlb/odds/_/gameId/401816143",
        capturedAt: "2026-07-16T16:10:00.000Z",
        text
      })
    });
    const payload = await response.json();

    assert.equal(response.status, 200);
    assert.equal(payload.provider, "ESPN");
    assert.equal(payload.event.eventId, "401816143");
    assert.equal(payload.summary.moneylineMarkets, 2);
    assert.equal(payload.summary.totalMarkets, 2);
    assert.equal(payload.summary.runLineMarkets, 2);
    assert.equal(payload.summary.propMarkets, 1);
    assert.equal(payload.summary.injuryRecords, 1);
    assert.equal(payload.event.odds.moneyline[0].verified, false);
    assert.ok(payload.warnings.some((warning) => warning.includes("browser-visible ESPN")));
  });
});

test("HTTP API records manual ESPN snapshot confirmation separately from provider verification", async () => {
  await withServer(async (baseUrl) => {
    const response = await fetch(`${baseUrl}/api/snapshot-confirmation`, {
      method: "POST",
      headers: {
        "content-type": "application/json"
      },
      body: JSON.stringify({
        snapshot: {
          sourceUrl: "https://www.espn.com/mlb/odds/_/gameId/401816143",
          capturedAt: "2026-07-16T16:10:00.000Z",
          event: { eventId: "401816143" }
        },
        checks: {
          event: true,
          odds: true,
          roster: true
        },
        confirmedAt: "2026-07-16T16:15:00.000Z"
      })
    });
    const payload = await response.json();

    assert.equal(response.status, 200);
    assert.equal(payload.status, "manually_confirmed");
    assert.equal(payload.confirmationType, "manual_visual_review");
    assert.equal(payload.eventId, "401816143");
    assert.equal(payload.verifiedOdds, false);
    assert.equal(payload.verifiedInjuries, false);
    assert.equal(payload.verifiedProbabilities, false);
  });
});

test("HTTP API OCR endpoint dispatches ESPN screenshots to the ESPN parser", async () => {
  const ocrText = [
    "New York Mets @ Philadelphia Phillies",
    "New York Mets",
    "40-57",
    "Philadelphia Phillies",
    "54-43",
    "Game Odds",
    "NYM",
    "\x2b112",
    "o9.5 -111",
    "\x2b1.5 -181",
    "PHI",
    "-147",
    "u9.5 -109",
    "-1.5 +149"
  ].join("\n");

  await withServer(
    async (baseUrl) => {
      const response = await fetch(`${baseUrl}/api/ocr-snapshot`, {
        method: "POST",
        headers: {
          "content-type": "application/json"
        },
        body: JSON.stringify({
          parser: "espn",
          imageBase64: "data:image/png;base64,ZmFrZS1pbWFnZQ==",
          mimeType: "image/png",
          fileName: "espn-mets-phillies.png",
          sourceUrl: "https://www.espn.com/mlb/odds/_/gameId/401816143"
        })
      });
      const payload = await response.json();

      assert.equal(response.status, 200);
      assert.equal(payload.inputType, "image");
      assert.equal(payload.parser, "espn");
      assert.equal(payload.ocr.engine, "fake_ocr");
      assert.equal(payload.event.odds.moneyline.length, 2);
      assert.ok(payload.warnings.some((warning) => warning.includes("Parsed from OCR text")));
    },
    {
      recognizeTextFromImageImpl: async () => ({
        engine: "fake_ocr",
        fileName: "espn-mets-phillies.png",
        mimeType: "image/png",
        bytes: 10,
        text: ocrText,
        lines: ocrText.split(/\r?\n/),
        warnings: []
      })
    }
  );
});

test("HTTP API parses visible DraftKings game-line snapshots with explicit sides", async () => {
  await withServer(async (baseUrl) => {
    const text = `
Log In
A-Z Sports
Sportsbook / Baseball Odds / MLB Odds
Games
GAME LINES
Today
Run Line
Total
Moneyline
LA Angels
1
AT
ARI Diamondbacks
8
+6.5
+297
O
9.5
+297
+10000
-6.5
−433
U
9.5
−433
9th
More Bets
TOR Blue Jays
Braydon Fisher
AT
BOS Red Sox
Jake Bennett
+1.5
−193
O
10
−107
+104
-1.5
+158
U
10
−112
−125
Today 6:45 PM
More Bets
Tomorrow
Run Line
Total
Moneyline
TOR Blue Jays
Trey Yesavage
AT
BOS Red Sox
Sonny Gray
-1.5
+149
O
8.5
−110
−110
+1.5
−181
U
8.5
−110
−110
Tomorrow 1:35 PM
More Bets
MLB Betting News
5:27 PM · Jun 17, 2026
Baltimore Orioles vs. Seattle Mariners prediction, pick for Wednesday 6/17/26
Check out a betting preview, prediction and pick for today's game between the Baltimore Orioles and Seattle Mariners on Wednesday's MLB slate.
VIEW FULL ARTICLE
Author(s): Keagan Smith.
3:54 PM · Jun 17, 2026
Cleveland Guardians vs. Milwaukee Brewers prediction, pick for Wednesday 6/17/26
Check out a betting preview, prediction and pick for today's game between the Cleveland Guardians and Milwaukee Brewers on Wednesday's MLB slate.
VIEW FULL ARTICLE
Author(s): Keagan Smith.
MLB Odds and Betting
`;
    const response = await fetch(`${baseUrl}/api/draftkings-snapshot`, {
      method: "POST",
      headers: {
        "content-type": "application/json"
      },
      body: JSON.stringify({ text, capturedAt: "2026-06-17T22:05:00.000Z" })
    });
    const payload = await response.json();

    assert.equal(response.status, 200);
    assert.equal(payload.provider, "DraftKings");
    assert.equal(payload.sourceType, "browser-visible sportsbook board snapshot");
    assert.equal(payload.summary.events, 3);
    assert.equal(payload.summary.todayEvents, 2);
    assert.equal(payload.summary.tomorrowEvents, 1);
    assert.equal(payload.summary.liveEvents, 1);
    assert.equal(payload.summary.incompleteEvents, 1);
    assert.equal(payload.summary.articleCount, 2);
    assert.equal(payload.summary.predictionArticleCount, 2);
    assert.equal(payload.summary.moneylineMarkets, 5);
    assert.match(payload.summary.marketTabs, /GAME LINES/);
    assert.equal(payload.events[0].away.score, 1);
    assert.equal(payload.events[0].home.score, 8);
    assert.equal(payload.events[0].markets.moneyline[0].selection, "LA Angels");
    assert.equal(payload.events[0].markets.moneyline[0].odds, 10000);
    assert.equal(payload.events[0].markets.moneyline.length, 1);
    assert.ok(payload.events[0].warnings.some((warning) => warning.includes("Missing visible home moneyline")));
    assert.equal(payload.events[1].away.probablePitcher, "Braydon Fisher");
    assert.equal(payload.events[1].home.probablePitcher, "Jake Bennett");
    assert.equal(payload.events[1].markets.runLine[0].line, 1.5);
    assert.equal(payload.events[1].markets.total[0].selection, "Over 10");
    assert.equal(payload.articles[0].title, "Baltimore Orioles vs. Seattle Mariners prediction, pick for Wednesday 6/17/26");
    assert.equal(payload.articles[0].author, "Keagan Smith");
    assert.ok(payload.warnings.some((warning) => warning.includes("browser-visible DraftKings page text")));
    assert.ok(payload.warnings.some((warning) => warning.includes("editorial context only")));
  });
});

test("HTTP API OCR endpoint extracts screenshot text before parsing snapshots", async () => {
  const ocrText = `
Games
GAME LINES
Today
Run Line
Total
Moneyline
TOR Blue Jays
Trey Yesavage
AT
BOS Red Sox
Sonny Gray
-1.5 +149
O 8.5 −110
−110
+1.5 −181
U 8.5 −110
−110
Today 1:35 PM
More Bets
`;

  await withServer(
    async (baseUrl) => {
      const response = await fetch(`${baseUrl}/api/ocr-snapshot`, {
        method: "POST",
        headers: {
          "content-type": "application/json"
        },
        body: JSON.stringify({
          parser: "draftkings",
          imageBase64: "data:image/png;base64,ZmFrZS1pbWFnZQ==",
          mimeType: "image/png",
          fileName: "draftkings-board.png",
          capturedAt: "2026-06-18T16:00:00.000Z"
        })
      });
      const payload = await response.json();

      assert.equal(response.status, 200);
      assert.equal(payload.inputType, "image");
      assert.equal(payload.parser, "draftkings");
      assert.equal(payload.extractedText, ocrText.trim());
      assert.equal(payload.ocr.engine, "fake_ocr");
      assert.equal(payload.ocr.fileName, "draftkings-board.png");
      assert.equal(payload.ocr.lines, 19);
      assert.equal(payload.summary.events, 1);
      assert.equal(payload.summary.moneylineMarkets, 2);
      assert.equal(payload.events[0].away.name, "TOR Blue Jays");
      assert.ok(payload.warnings.some((warning) => warning.includes("Parsed from OCR text")));
    },
    {
      recognizeTextFromImageImpl: async () => ({
        engine: "fake_ocr",
        fileName: "draftkings-board.png",
        mimeType: "image/png",
        bytes: 10,
        text: ocrText.trim(),
        lines: ocrText.trim().split(/\r?\n/),
        warnings: []
      })
    }
  );
});

test("HTTP API OCR endpoint extracts DK Predictions prop screenshots", async () => {
  const ocrText = `
Jac Caglianone Total Bases
Kansas City Royals @ New York Mets
Over 1.5
Over 2.5
Over 3.5
$114.45 +
Today 1:10 PM
Total Bases
Yes
+122
Yes
+194
Yes
+212
No
-194
No
No
More >
`;

  await withServer(
    async (baseUrl) => {
      const response = await fetch(`${baseUrl}/api/ocr-snapshot`, {
        method: "POST",
        headers: {
          "content-type": "application/json"
        },
        body: JSON.stringify({
          parser: "dk-predictions",
          imageBase64: "data:image/png;base64,ZmFrZS1pbWFnZQ==",
          mimeType: "image/png",
          fileName: "kc-mets-total-bases.png",
          capturedAt: "2026-07-09T13:59:00.000Z"
        })
      });
      const payload = await response.json();

      assert.equal(response.status, 200);
      assert.equal(payload.inputType, "image");
      assert.equal(payload.parser, "dk-predictions");
      assert.equal(payload.provider, "DraftKings Predictions");
      assert.equal(payload.summary.playerPropMarkets, 3);
      assert.equal(payload.summary.totalBasesMarkets, 3);
      assert.equal(payload.bankroll, 114.45);
      assert.equal(payload.ocr.fileName, "kc-mets-total-bases.png");
      assert.equal(payload.markets[0].team_or_player, "Jac Caglianone");
      assert.equal(payload.markets[0].odds, 122);
      assert.equal(payload.markets[0].opposite_odds, -194);
      assert.ok(payload.warnings.some((warning) => warning.includes("Parsed from OCR text")));
    },
    {
      recognizeTextFromImageImpl: async () => ({
        engine: "fake_ocr",
        fileName: "kc-mets-total-bases.png",
        mimeType: "image/png",
        bytes: 10,
        text: ocrText.trim(),
        lines: ocrText.trim().split(/\r?\n/),
        warnings: []
      })
    }
  );
});

test("HTTP API imports pasted odds text into matching research candidates", async () => {
  const candidates = [
    {
      id: "joe-ryan-k",
      line: 6.5,
      lean: "over",
      statKey: "strikeOuts",
      player: { name: "Joe Ryan" },
      ticketDraft: { selection: "Joe Ryan over 6.5 strikeouts" }
    },
    {
      id: "sonny-gray-k",
      line: 4.5,
      lean: "over",
      statKey: "strikeOuts",
      player: { name: "Sonny Gray" },
      ticketDraft: { selection: "Sonny Gray over 4.5 strikeouts" }
    },
    {
      id: "pete-alonso-tb",
      line: 1.5,
      lean: "over",
      statKey: "totalBases",
      player: { name: "Pete Alonso" },
      ticketDraft: { selection: "Pete Alonso over 1.5 total bases" }
    },
    {
      id: "francisco-lindor-hits",
      line: 1.5,
      lean: "over",
      statKey: "hits",
      player: { name: "Francisco Lindor" },
      ticketDraft: { selection: "Francisco Lindor over 1.5 hits" }
    }
  ];
  const text = `
Joe Ryan
7+ Strikeouts
-113

Sonny Gray over 4.5 strikeouts +136

Pete Alonso
2+ Total Bases
+145

Francisco Lindor over 1.5 hits +180
`;

  await withServer(async (baseUrl) => {
    const response = await fetch(`${baseUrl}/api/candidate-odds-import`, {
      method: "POST",
      headers: {
        "content-type": "application/json"
      },
      body: JSON.stringify({ text, candidates })
    });
    const payload = await response.json();

    assert.equal(response.status, 200);
    assert.equal(payload.summary.matches, 4);
    assert.equal(payload.summary.unmatched, 0);
    assert.equal(payload.matches.find((match) => match.candidateId === "joe-ryan-k").marketOdds, -113);
    assert.equal(payload.matches.find((match) => match.candidateId === "sonny-gray-k").marketOdds, 136);
    assert.equal(payload.matches.find((match) => match.candidateId === "pete-alonso-tb").marketOdds, 145);
    assert.equal(payload.matches.find((match) => match.candidateId === "francisco-lindor-hits").marketOdds, 180);
    assert.ok(payload.matches.every((match) => match.confidence > 0.7));
    assert.ok(payload.warnings.some((warning) => warning.includes("Verify each matched price")));
  });
});

test("HTTP API compares recording props against a current DraftKings board", async () => {
  const recordingCsvText = [
    "rank,cluster,player_name,api_player_name,current_team,opponent_team,game_date_utc,display_prop,recording_odds_american,player_id",
    "1,alpha,Sample Hitter,Sample Hitter,New York Mets,Cincinnati Reds,2026-06-17T23:05:00.000Z,2+ TB,+110,1"
  ].join("\n");
  const currentBoardPayload = {
    capturedAt: "2026-06-17T22:30:00.000Z",
    regularBoard: {
      boardKey: "regular_total_bases",
      capturedAt: "2026-06-17T22:20:00.000Z",
      events: []
    },
    liveBoard: {
      boardKey: "live_total_bases",
      capturedAt: "2026-06-17T22:30:00.000Z",
      events: [
        {
          eventId: "game_1",
          decodedSlug: "new-york-mets-at-cincinnati-reds",
          awaySlug: "new-york-mets",
          homeSlug: "cincinnati-reds",
          statusText: "Top 7",
          players: [
            {
              playerName: "Sample Hitter",
              playerHref: "/players/baseball/sample-hitter-odds-1",
              offers: [
                {
                  americanOdds: 169,
                  label: "Select 2+ at +169",
                  threshold: 2
                }
              ]
            }
          ]
        }
      ]
    }
  };

  await withServer(async (baseUrl) => {
    const response = await fetch(`${baseUrl}/api/recording-props-compare`, {
      method: "POST",
      headers: {
        "content-type": "application/json"
      },
      body: JSON.stringify({
        recordingCsvText,
        currentBoardPayload,
        bankroll: 1000
      })
    });
    const payload = await response.json();

    assert.equal(response.status, 200);
    assert.equal(payload.summary.totalRecordingProps, 1);
    assert.equal(payload.summary.matchedCurrentLines, 1);
    assert.equal(payload.summary.matchedLiveLines, 1);
    assert.equal(payload.rows[0].current_line_match_status, "matched");
    assert.equal(payload.rows[0].current_odds_american, 169);
    assert.equal(payload.rows[0].resolved_game_pk, 1);
    assert.equal(payload.rows[0].app_current_game_tb, 2);
    assert.equal(payload.rows[0].app_verdict, "WAIT");
    assert.match(payload.rows[0].app_risk_flags, /STALE_MARKET_PRICE/);
    assert.equal(payload.rows[0].ticketDraft.legs[0].source.gamePk, 1);
    assert.equal(payload.rows[0].ticketDraft.legs[0].marketContext.offeredLastUpdate, "2026-06-17T22:30:00.000Z");
    assert.ok(payload.notes.some((note) => note.includes("gamePk")));
  });
});

test("HTTP API finds online MLB and World Cup opportunities from separate sources", async () => {
  await withServer(async (baseUrl) => {
    const response = await fetch(`${baseUrl}/api/online-opportunities?date=2026-06-17&days=1&sports=mlb,worldcup&maxProps=10`);
    const payload = await response.json();

    assert.equal(response.status, 200);
    assert.equal(payload.summary.mlbGames, 1);
    assert.equal(payload.summary.worldCupGames, 1);
    assert.ok(payload.summary.pricedOpportunities >= 1);
    assert.ok(payload.summary.oddsNeededOpportunities >= 1);
    assert.ok(payload.sources.some((source) => source.provider === "Covers"));
    assert.ok(payload.sources.some((source) => source.provider === "Hard Rock Bet" && source.sport === "worldcup"));
    assert.ok(payload.sources.some((source) => source.provider === "StatMuse" && source.sport === "mlb"));

    const pricedProp = payload.opportunities.find((entry) => entry.status === "priced_online");
    const worldCupMarket = payload.opportunities.find((entry) => entry.sport === "worldcup" && entry.marketType === "three_way_moneyline");

    assert.equal(pricedProp.marketLabel, "TOTAL BASES");
    assert.equal(pricedProp.bestPrice.americanOdds, 125);
    assert.equal(pricedProp.bestPrice.sportsbook, "BetMGM");
    assert.equal(pricedProp.bestPrice.decimalOdds, 2.25);
    assert.equal(pricedProp.bestPrice.payoutOn100Stake.profit, 125);
    assert.equal(pricedProp.bestPrice.payoutOn100Stake.totalReturn, 225);
    assert.equal(pricedProp.draftKingsPrice.americanOdds, 113);
    assert.equal(pricedProp.bestVsDraftKings.americanOddsDelta, 12);
    assert.ok(Math.abs(pricedProp.bestVsDraftKings.profitOn100Delta - 12) < 0.001);
    assert.equal(pricedProp.edgeTier, "bet_candidate");
    assert.ok(pricedProp.bestPrice.impliedProbability > 0.44 && pricedProp.bestPrice.impliedProbability < 0.45);
    assert.ok(pricedProp.bestVsDraftKings.impliedProbabilitySavings > 0.02);
    assert.equal(worldCupMarket.matchup, "Ghana @ Croatia");
    assert.deepEqual(worldCupMarket.selections, ["home win", "draw", "away win"]);
    assert.ok(payload.warnings.some((warning) => warning.includes("priced_online")));
  });
});

test("HTTP API parses World Cup goalscorer snapshot rows with payout math", async () => {
  await withServer(async (baseUrl) => {
    const response = await fetch(`${baseUrl}/api/worldcup-goalscorer-snapshot`, {
      method: "POST",
      headers: {
        "content-type": "application/json"
      },
      body: JSON.stringify({
        event: {
          home: "Egypt",
          away: "Iran",
          matchup: "Egypt vs Iran",
          startTime: "Today 11:10 PM"
        },
        rows: [
          {
            player: "Mohamed Salah",
            team: "Egypt",
            firstGoalscorer: "+488",
            anytimeGoalscorer: "+223",
            twoPlusGoalscorer: "+1150"
          },
          {
            player: "Mehdi Taremi",
            team: "Iran",
            firstGoalscorer: "+733",
            anytimeGoalscorer: "+426",
            twoPlusGoalscorer: "+3233"
          },
          {
            player: "Ali Alipour",
            team: "Iran",
            firstGoalscorer: "locked",
            anytimeGoalscorer: "+355",
            twoPlusGoalscorer: "-122"
          }
        ]
      })
    });
    const payload = await response.json();
    const salahAnytime = payload.markets.find((market) => market.player === "Mohamed Salah" && market.marketType === "anytime_goalscorer");
    const alipourFirst = payload.markets.find((market) => market.player === "Ali Alipour" && market.marketType === "first_goalscorer");
    const alipourTwoPlus = payload.markets.find((market) => market.player === "Ali Alipour" && market.marketType === "two_plus_goalscorer");

    assert.equal(response.status, 200);
    assert.equal(payload.summary.players, 3);
    assert.equal(payload.summary.pricedMarkets, 8);
    assert.equal(payload.summary.lockedMarkets, 1);
    assert.equal(payload.summary.anomalyRows, 1);
    assert.equal(salahAnytime.americanOdds, 223);
    assert.equal(salahAnytime.payoutOn100Stake.profit, 223);
    assert.equal(salahAnytime.payoutOn100Stake.totalReturn, 323);
    assert.ok(salahAnytime.impliedProbability > 0.30 && salahAnytime.impliedProbability < 0.31);
    assert.equal(alipourFirst.status, "locked");
    assert.equal(alipourTwoPlus.americanOdds, -122);
    assert.ok(alipourTwoPlus.impliedProbability > 0.54 && alipourTwoPlus.impliedProbability < 0.55);
    assert.ok(payload.warnings.some((warning) => warning.includes("2+ goals is priced as more likely")));
  });
});

test("HTTP API persists straight evaluations and summarizes attached settlements", async () => {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "bear-edge-api-log-"));
  const logPath = path.join(tempDir, "decision_log.jsonl");

  await withServer(
    async (baseUrl) => {
      const evaluationResponse = await fetch(`${baseUrl}/evaluate`, {
        method: "POST",
        headers: {
          "content-type": "application/json"
        },
        body: JSON.stringify({
          selection: "API moneyline",
          marketType: "moneyline",
          marketOdds: 120,
          oppositeOdds: -135,
          modelProbability: 0.59,
          bankroll: 1000,
          thresholds: {
            minEdge: 0.01,
            minEvRoi: 0.01,
            minKellyFraction: 0.01
          }
        })
      });
      const evaluation = await evaluationResponse.json();

      assert.equal(evaluationResponse.status, 200);
      assert.equal(evaluation.verdict, "WAIT");
      assert.equal(evaluation.logPath, logPath);
      assert.equal(evaluation.decisionLog.schemaVersion, "2.0.0");
      assert.equal(evaluation.recordId, evaluation.decisionLog.id);
      assert.equal(evaluation.clientEventId, evaluation.decisionLog.clientEventId);
      assert.equal(evaluation.contentDigest, evaluation.decisionLog.contentDigest);
      assert.match(evaluation.decisionLog.id, /^eval_/);

      const settlementResponse = await fetch(`${baseUrl}/api/settle`, {
        method: "POST",
        headers: {
          "content-type": "application/json"
        },
        body: JSON.stringify({
          evaluationId: evaluation.decisionLog.id,
          outcome: "loss",
          closingOdds: 100
        })
      });
      const settlementPayload = await settlementResponse.json();

      assert.equal(settlementResponse.status, 200);

      const amendmentResponse = await fetch(`${baseUrl}/api/amend`, {
        method: "POST",
        headers: {
          "content-type": "application/json"
        },
        body: JSON.stringify({
          evaluationId: evaluation.decisionLog.id,
          settlementId: settlementPayload.settlement.id,
          reason: "Official scoring correction",
          patch: { outcome: "push", profit: 0 }
        })
      });
      const amendmentPayload = await amendmentResponse.json();

      assert.equal(amendmentResponse.status, 200);
      assert.equal(amendmentPayload.record.recordType, "amendment");

      const dashboardResponse = await fetch(`${baseUrl}/api/decision-log`);
      const dashboard = await dashboardResponse.json();

      assert.equal(dashboardResponse.status, 200);
      assert.equal(dashboard.summary.totalEvaluations, 1);
      assert.equal(dashboard.summary.falsePositiveBetCalls, 0);
      assert.equal(dashboard.summary.hitRate, null);
      assert.equal(dashboard.byMarketType[0].marketType, "moneyline");
      assert.ok(Math.abs(dashboard.evaluations[0].closingLineValue - 0.1) < 1e-12);
      assert.equal(dashboard.settlements[0].outcome, "push");
      assert.equal(dashboard.amendments.length, 1);
      assert.equal(fs.readFileSync(logPath, "utf8").trim().split("\n").length, 3);
    },
    { logPath }
  );
});

test("settlement API rejects an orphan evaluation reference", async () => {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "bear-edge-orphan-settlement-"));
  const logPath = path.join(tempDir, "decision_log.jsonl");

  await withServer(async (baseUrl) => {
    const response = await fetch(`${baseUrl}/api/settle`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ evaluationId: "eval_missing", outcome: "win" })
    });
    const payload = await response.json();

    assert.equal(response.status, 400);
    assert.match(payload.error, /evaluation does not exist/i);
  }, { logPath });
});

test("POST /evaluate rejects writeLog false", async () => {
  await withServer(async (baseUrl) => {
    const response = await fetch(`${baseUrl}/evaluate`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        selection: "No-log attempt",
        marketOdds: 120,
        oppositeOdds: -135,
        modelProbability: 0.59,
        bankroll: 1000,
        writeLog: false
      })
    });
    const payload = await response.json();

    assert.equal(response.status, 400);
    assert.match(payload.error, /logging cannot be disabled/i);
  });
});

test("HTTP API pulls official games for a date window", async () => {
  await withServer(async (baseUrl) => {
    const response = await fetch(`${baseUrl}/api/games?date=2026-06-17&days=2`);
    const payload = await response.json();

    assert.equal(response.status, 200);
    assert.equal(payload.dates.length, 2);
    assert.equal(payload.sources.length, 8);
    assert.equal(payload.games.length, 6);
    assert.ok(payload.games.some((game) => game.sport === "mlb"));
    assert.ok(payload.games.some((game) => game.sport === "nhl"));
    assert.ok(payload.games.some((game) => game.sport === "worldcup"));
    assert.ok(payload.sources.some((source) => source.sport === "tennis" && source.warning));
    assert.equal(payload.games.find((game) => game.sport === "mlb").away.probablePitcher.name, "Nolan McLean");
  });
});

test("HTTP API generates odds-needed research candidates from official game stats", async () => {
  await withServer(async (baseUrl) => {
    const response = await fetch(`${baseUrl}/api/candidates?date=2026-06-17&days=1`);
    const payload = await response.json();
    const mlbCandidate = payload.candidates.find((candidate) => candidate.sport === "mlb");
    const batterCandidate = payload.candidates.find((candidate) => candidate.sport === "mlb" && candidate.statKey === "totalBases");
    const runsCandidate = payload.candidates.find((candidate) => candidate.sport === "mlb" && candidate.statKey === "runs");
    const nhlCandidate = payload.candidates.find((candidate) => candidate.sport === "nhl");

    assert.equal(response.status, 200);
    assert.equal(payload.candidates.length, 12);
    assert.equal(mlbCandidate.verdict, "ODDS_NEEDED");
    assert.equal(mlbCandidate.requiresManualOdds, true);
    assert.equal(mlbCandidate.ticketDraft.legs[0].marketOdds, null);
    assert.ok(mlbCandidate.riskFlags.some((flag) => flag.code === "MISSING_MARKET_ODDS"));
    assert.equal(mlbCandidate.audit.generatedFrom, "official_mlb_statsapi");
    assert.equal(mlbCandidate.audit.oddsSource, "manual_required");
    assert.equal(mlbCandidate.audit.evaluationReadiness, "blocked_until_market_odds");
    assert.equal(mlbCandidate.prediction.model, "poisson_count_v1");
    assert.equal(mlbCandidate.prediction.calibrationStatus, "research_only");
    assert.equal(typeof mlbCandidate.prediction.modelProbability, "number");
    assert.equal(typeof mlbCandidate.prediction.fairAmericanOdds, "number");
    assert.ok(mlbCandidate.prediction.notes.some((note) => note.includes("sportsbook odds")));
    assert.equal(mlbCandidate.stats.seasonPerGame, 1.2);
    assert.equal(mlbCandidate.stats.recentPerGame, 1.8);
    assert.equal(batterCandidate.statGroup, "hitting");
    assert.equal(batterCandidate.statLabel, "total bases");
    assert.equal(batterCandidate.ticketDraft.legs[0].source.statGroup, "hitting");
    assert.equal(batterCandidate.ticketDraft.legs[0].source.statKey, "totalBases");
    assert.ok(batterCandidate.riskFlags.some((flag) => flag.code === "LINEUP_NOT_CONFIRMED"));
    assert.ok(batterCandidate.riskFlags.some((flag) => flag.code === "HITTING_CONTEXT_LIMITED"));
    assert.equal(batterCandidate.stats.seasonPerGame, 1.8);
    assert.equal(batterCandidate.stats.recentPerGame, 2.2);
    assert.equal(runsCandidate.statGroup, "hitting");
    assert.equal(runsCandidate.statLabel, "runs");
    assert.equal(runsCandidate.ticketDraft.legs[0].source.statKey, "runs");
    assert.equal(nhlCandidate.provider, "nhl");
    assert.equal(nhlCandidate.prediction.calibrationStatus, "research_only");
    assert.equal(nhlCandidate.audit.generatedFrom, "official_nhl_api");
    assert.equal(nhlCandidate.statKey, "shots");
    assert.equal(nhlCandidate.statLabel, "shots on goal");
    assert.equal(nhlCandidate.ticketDraft.legs[0].provider, "nhl");
    assert.ok(nhlCandidate.riskFlags.some((flag) => flag.code === "NHL_CONTEXT_LIMITED"));
    assert.equal(nhlCandidate.stats.seasonPerGame, 300 / 82);
    assert.equal(nhlCandidate.stats.recentPerGame, 4.4);
    assert.ok(payload.notes.some((note) => note.includes("Tennis remains manual-only")));
  });
});

test("HTTP API evaluates a live ticket only after authoritative persistence", async () => {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "bear-edge-live-api-"));
  const logPath = path.join(tempDir, "decision_log.jsonl");

  await withServer(async (baseUrl) => {
    const response = await fetch(`${baseUrl}/evaluate/live`, {
      method: "POST",
      headers: {
        "content-type": "application/json"
      },
      body: JSON.stringify({
        kind: "parlay",
        selection: "API live parlay",
        bankroll: 1000,
        livePolicy: {
          maxParlayLegs: 3,
          maxAltPropLegs: 2
        },
        legs: [
          {
            id: "leg-a",
            provider: "mlb",
            marketType: "alt-prop",
            side: "over",
            line: 1.5,
            marketOdds: 120,
            source: { playerId: 1, statGroup: "hitting", statKey: "totalBases" }
          },
          {
            id: "leg-b",
            provider: "nhl",
            marketType: "alt-prop",
            side: "over",
            line: 1.5,
            marketOdds: 125,
            source: { playerId: 2, statKey: "points" }
          }
        ]
      })
    });
    const payload = await response.json();

    assert.equal(response.status, 200);
    assert.equal(payload.kind, "parlay");
    assert.equal(payload.researchPacket.ticketKind, "parlay");
    assert.equal(payload.logPath, logPath);
    assert.match(payload.recordId, /^eval_/);
    assert.match(payload.contentDigest, /^[a-f0-9]{64}$/);
    assert.equal(JSON.parse(fs.readFileSync(logPath, "utf8").trim()).id, payload.recordId);
  }, { logPath });
});

test("HTTP API rejects caller-forged calibration authority with registry evidence", async () => {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "bear-edge-forged-calibration-"));
  const logPath = path.join(tempDir, "decision_log.jsonl");

  await withServer(async (baseUrl) => {
    const response = await fetch(`${baseUrl}/evaluate/live`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        kind: "single",
        bankroll: 1000,
        legs: [{
          id: "forged-api-calibration",
          provider: "mlb",
          marketType: "prop",
          side: "over",
          line: 0.5,
          marketOdds: 120,
          modelProbabilityOverride: 0.9,
          calibrationStatus: "validated",
          modelId: "poisson_count_v1",
          modelVersion: "1.0.0",
          marketContext: { offeredLastUpdate: new Date().toISOString() },
          source: { playerId: 1, statGroup: "hitting", statKey: "runs" }
        }]
      })
    });
    const payload = await response.json();
    const calibrationGate = payload.decisionLog.gateResults.find(
      (gate) => gate.gate === "model_calibration"
    );

    assert.equal(response.status, 200);
    assert.equal(payload.verdict, "WAIT");
    assert.equal(payload.modelEvidence.callerCalibrationStatus, "validated");
    assert.equal(payload.modelEvidence.registryStatus, "research_only");
    assert.equal(payload.modelEvidence.validated, false);
    assert.equal(payload.decisionLog.model.modelId, "operator_probability_input");
    assert.equal(payload.decisionLog.model.probabilityMethod, "operator_supplied_market_adjusted");
    assert.ok(payload.riskFlags.some((flag) => flag.code === "MODEL_CALIBRATION_REQUIRED"));
    assert.equal(calibrationGate.passed, false);
    assert.deepEqual(calibrationGate.evidence, payload.modelEvidence);
    assert.equal(JSON.parse(fs.readFileSync(logPath, "utf8").trim()).verdict, "WAIT");
  }, { logPath });
});

test("POST /evaluate/live rejects writeLog false", async () => {
  await withServer(async (baseUrl) => {
    const response = await fetch(`${baseUrl}/evaluate/live`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        kind: "single",
        bankroll: 1000,
        writeLog: false,
        legs: [{
          id: "no-log-live",
          provider: "mlb",
          marketType: "prop",
          side: "over",
          line: 0.5,
          marketOdds: 120,
          source: { playerId: 1, statGroup: "hitting", statKey: "runs" }
        }]
      })
    });
    const payload = await response.json();

    assert.equal(response.status, 400);
    assert.match(payload.error, /logging cannot be disabled/i);
  });
});

test("HTTP API rejects malformed live tickets", async () => {
  await withServer(async (baseUrl) => {
    const response = await fetch(`${baseUrl}/evaluate/live`, {
      method: "POST",
      headers: {
        "content-type": "application/json"
      },
      body: JSON.stringify({
        bankroll: 0,
        legs: []
      })
    });
    const payload = await response.json();

    assert.equal(response.status, 400);
    assert.match(payload.error, /Live ticket validation failed/);
    assert.ok(Array.isArray(payload.issues));
  });
});
