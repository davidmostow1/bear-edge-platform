const http = require("node:http");
const fs = require("node:fs/promises");
const path = require("node:path");

const { appendAuthoritativeRecord } = require("./audit/authoritative-ledger.js");
const { persistDisplayedTargets } = require("./audit/recommendation-service.js");
const {
  appendSettlement,
  getDecisionLogDashboard
} = require("./analytics.js");
const { evaluateLiveTicketAndLog } = require("./live/evaluate-live-ticket.js");
const {
  readAutoUpdateHistory,
  readAutoUpdateSnapshot
} = require("./live/auto-update.js");
const { generateResearchCandidates } = require("./live/candidates.js");
const { getBestMlbTargets } = require("./live/best-mlb-targets.js");
const { matchCandidateOdds } = require("./live/candidate-odds-import.js");
const { fetchGamesForWindow } = require("./live/schedule.js");
const { getLiveDataHealth } = require("./live/live-data-health.js");
const { getSourceStatusDashboard } = require("./live/source-status.js");
const { parseDraftKingsSnapshot } = require("./live/draftkings-snapshot.js");
const { parseDkPredictionsBoardSnapshot } = require("./live/dk-predictions-board-snapshot.js");
const { simulateBetCard } = require("./live/probability-causality.js");
const { compareRecordingPropsWithCurrentBoard } = require("./live/recording-prop-compare.js");
const { fetchOnlineOpportunities } = require("./live/online-opportunities.js");
const { recognizeTextFromImage } = require("./live/image-ocr.js");
const { parseEspnSnapshot } = require("./live/espn-snapshot.js");
const { createManualSnapshotConfirmation } = require("./live/snapshot-confirmation.js");
const { parseStatMuseSnapshot } = require("./live/statmuse-snapshot.js");
const { parseWorldCupGoalscorerSnapshot } = require("./live/worldcup-goalscorer-snapshot.js");
const { fetchOddsApiMarkets, fetchOddsApiSports } = require("./live/odds-api.js");
const { fetchJson, fetchText } = require("./live/fixture-fetch.js");
const { getSystemAudit } = require("./system-audit.js");
const { getReleaseReadiness } = require("./release-readiness.js");
const { getDataEdgeAudit } = require("./data-edge.js");
const { getOddsKeyStatus, saveOddsApiKey, validateOddsApiKey } = require("./config/odds-key-settings.js");
const { getProviderSetupStatus } = require("./config/provider-requirements.js");
const { saveProviderApiKey } = require("./config/provider-key-settings.js");
const { safeErrorMessage } = require("./config/secrets.js");
const {
  AUDIT_RECORD_SCHEMA,
  BET_DECISION_SCHEMA,
  BET_INPUT_SCHEMA,
  LIVE_DECISION_SCHEMA,
  LIVE_TICKET_SCHEMA,
  RESEARCH_PACKET_SCHEMA
} = require("./schemas.js");
const { BetInputValidationError, validateBetInput } = require("./validate-bet-input.js");
const { LiveTicketValidationError, validateLiveTicket } = require("./validate-live-ticket.js");

const PROJECT_ROOT = path.resolve(__dirname, "..");
const OCR_PARSER_ALIASES = Object.freeze({
  draftkings: "draftkings",
  espn: "espn",
  statmuse: "statmuse",
  "worldcup-goalscorer": "worldcup-goalscorer",
  "dk-predictions": "dk-predictions",
  predictions: "dk-predictions",
  pick6: "dk-predictions"
});

function jsonResponse(response, statusCode, payload) {
  response.writeHead(statusCode, {
    "content-type": "application/json; charset=utf-8"
  });
  response.end(`${JSON.stringify(payload)}\n`);
}

function redirectResponse(response, location) {
  response.writeHead(302, {
    location
  });
  response.end();
}

async function staticResponse(response, fileName, contentType) {
  const filePath = path.resolve(__dirname, "dashboard", fileName);
  const contents = await fs.readFile(filePath);

  response.writeHead(200, {
    "content-type": contentType
  });
  response.end(contents);
}

async function readJsonBody(request) {
  const chunks = [];

  for await (const chunk of request) {
    chunks.push(chunk);
  }

  return JSON.parse(Buffer.concat(chunks).toString("utf8"));
}

function createServer(options = {}) {
  return http.createServer(async (request, response) => {
    try {
      const url = new URL(request.url ?? "/", "http://127.0.0.1");

      if (request.method === "GET" && url.pathname === "/") {
        return redirectResponse(response, "/dashboard");
      }

      if (request.method === "GET" && (url.pathname === "/dashboard" || url.pathname === "/dashboard/")) {
        return staticResponse(response, "index.html", "text/html; charset=utf-8");
      }

      if (request.method === "GET" && url.pathname === "/dashboard/styles.css") {
        return staticResponse(response, "styles.css", "text/css; charset=utf-8");
      }

      if (request.method === "GET" && url.pathname === "/dashboard/app.js") {
        return staticResponse(response, "app.js", "text/javascript; charset=utf-8");
      }

      if (request.method === "GET" && url.pathname === "/dashboard/manifest.json") {
        return staticResponse(response, "manifest.json", "application/manifest+json; charset=utf-8");
      }

      if (request.method === "GET" && url.pathname === "/dashboard/icon.svg") {
        return staticResponse(response, "icon.svg", "image/svg+xml; charset=utf-8");
      }

      if (request.method === "GET" && url.pathname === "/dashboard/sw.js") {
        return staticResponse(response, "sw.js", "text/javascript; charset=utf-8");
      }

      if (request.method === "GET" && url.pathname === "/health") {
        return jsonResponse(response, 200, { ok: true });
      }

      if (request.method === "GET" && url.pathname === "/api/system-audit") {
        const result = await getSystemAudit();

        return jsonResponse(response, 200, result);
      }

      if (request.method === "GET" && url.pathname === "/api/release-readiness") {
        const result = await getReleaseReadiness({
          rootDir: options.settingsRootDir ?? PROJECT_ROOT,
          fetchJsonImpl: process.env.BEAR_EDGE_TEST_MODE ? fetchJson : options.fetchJsonImpl,
          fetchTextImpl: process.env.BEAR_EDGE_TEST_MODE ? fetchText : options.fetchTextImpl,
          oddsApiKey: process.env.THE_ODDS_API_KEY ?? process.env.ODDS_API_KEY,
          autoUpdateStatus: typeof options.autoUpdateService?.getStatus === "function"
            ? options.autoUpdateService.getStatus()
            : null,
          autoUpdateSnapshotPath: options.autoUpdateSnapshotPath,
          logPath: options.logPath
        });

        return jsonResponse(response, 200, result);
      }

      if (request.method === "GET" && url.pathname === "/api/data-edge-audit") {
        const result = await getDataEdgeAudit({
          rootDir: options.settingsRootDir ?? PROJECT_ROOT,
          date: url.searchParams.get("date") ?? "today",
          days: Number(url.searchParams.get("days") ?? 1),
          limit: Number(url.searchParams.get("limit") ?? 3),
          maxCandidates: Number(url.searchParams.get("maxCandidates") ?? 80),
          maxEventsToPrice: Number(url.searchParams.get("maxEventsToPrice") ?? 10),
          bankroll: Number(url.searchParams.get("bankroll") ?? 1000),
          bookmakers: url.searchParams.get("bookmakers") ?? "draftkings",
          regions: url.searchParams.get("regions") ?? "us",
          fetchJsonImpl: process.env.BEAR_EDGE_TEST_MODE ? fetchJson : options.fetchJsonImpl,
          fetchTextImpl: process.env.BEAR_EDGE_TEST_MODE ? fetchText : options.fetchTextImpl,
          oddsApiKey: process.env.THE_ODDS_API_KEY ?? process.env.ODDS_API_KEY,
          autoUpdateStatus: typeof options.autoUpdateService?.getStatus === "function"
            ? options.autoUpdateService.getStatus()
            : null,
          autoUpdateSnapshotPath: options.autoUpdateSnapshotPath,
          logPath: options.logPath
        });

        return jsonResponse(response, 200, result);
      }

      if (request.method === "GET" && url.pathname === "/api/settings/odds-key") {
        return jsonResponse(response, 200, getOddsKeyStatus());
      }

      if (request.method === "GET" && url.pathname === "/api/provider-requirements") {
        return jsonResponse(response, 200, getProviderSetupStatus({
          rootDir: options.settingsRootDir ?? PROJECT_ROOT
        }));
      }

      if (request.method === "POST" && url.pathname === "/api/provider-requirements/key") {
        const body = await readJsonBody(request);

        try {
          const result = await saveProviderApiKey(body, {
            rootDir: options.settingsRootDir ?? PROJECT_ROOT,
            envPath: options.envPath,
            fetchJsonImpl: process.env.BEAR_EDGE_TEST_MODE ? fetchJson : options.fetchJsonImpl
          });

          if (body.providerId === "the-odds-api" && typeof options.autoUpdateService?.setOddsApiKey === "function") {
            options.autoUpdateService.setOddsApiKey(process.env[result.envKey]);
          }

          return jsonResponse(response, 200, result);
        } catch (error) {
          return jsonResponse(response, 400, {
            configured: false,
            secretReturned: false,
            verification: {
              status: "failed",
              message: safeErrorMessage(error)
            }
          });
        }
      }

      if (request.method === "POST" && url.pathname === "/api/settings/odds-key/test") {
        const oddsApiKey = process.env.THE_ODDS_API_KEY ?? process.env.ODDS_API_KEY;

        if (!oddsApiKey) {
          return jsonResponse(response, 428, {
            ...getOddsKeyStatus(),
            verification: {
              status: "blocked",
              message: "No THE_ODDS_API_KEY or ODDS_API_KEY is configured."
            }
          });
        }

        try {
          const verification = await fetchOddsApiSports({
            fetchJsonImpl: process.env.BEAR_EDGE_TEST_MODE ? fetchJson : options.fetchJsonImpl,
            oddsApiKey
          });

          return jsonResponse(response, 200, {
            ...getOddsKeyStatus(),
            verification: {
              status: verification.status,
              sports: verification.sports.length,
              sample: verification.sports.slice(0, 5).map((sport) => ({
                key: sport.key,
                title: sport.title,
                active: sport.active
              }))
            }
          });
        } catch (error) {
          return jsonResponse(response, 502, {
            ...getOddsKeyStatus(),
            verification: {
              status: "failed",
              message: safeErrorMessage(error)
            }
          });
        }
      }

      if (request.method === "POST" && url.pathname === "/api/settings/odds-key") {
        const body = await readJsonBody(request);
        let oddsApiKey;

        try {
          oddsApiKey = validateOddsApiKey(body.apiKey);
        } catch (error) {
          return jsonResponse(response, 400, {
            ...getOddsKeyStatus(),
            verification: {
              status: "invalid",
              message: safeErrorMessage(error)
            }
          });
        }

        let verification;

        try {
          verification = await fetchOddsApiSports({
            fetchJsonImpl: process.env.BEAR_EDGE_TEST_MODE ? fetchJson : options.fetchJsonImpl,
            oddsApiKey
          });
        } catch (error) {
          return jsonResponse(response, 502, {
            ...getOddsKeyStatus(),
            configured: false,
            verification: {
              status: "failed",
              message: safeErrorMessage(error)
            }
          });
        }

        const saved = await saveOddsApiKey(oddsApiKey, {
          rootDir: options.settingsRootDir ?? PROJECT_ROOT,
          envPath: options.envPath
        });

        if (typeof options.autoUpdateService?.setOddsApiKey === "function") {
          options.autoUpdateService.setOddsApiKey(oddsApiKey);
        }

        return jsonResponse(response, 200, {
          ...getOddsKeyStatus(),
          ...saved,
          verification: {
            status: verification.status,
            sports: verification.sports.length,
            sample: verification.sports.slice(0, 5).map((sport) => ({
              key: sport.key,
              title: sport.title,
              active: sport.active
            }))
          }
        });
      }

      if (request.method === "GET" && url.pathname === "/schemas") {
        return jsonResponse(response, 200, {
          auditRecord: AUDIT_RECORD_SCHEMA,
          betInput: BET_INPUT_SCHEMA,
          betDecision: BET_DECISION_SCHEMA,
          liveTicket: LIVE_TICKET_SCHEMA,
          liveDecision: LIVE_DECISION_SCHEMA,
          researchPacket: RESEARCH_PACKET_SCHEMA
        });
      }

      if (request.method === "GET" && url.pathname === "/api/decision-log") {
        const result = await getDecisionLogDashboard({
          logPath: options.logPath
        });

        return jsonResponse(response, 200, result);
      }

      if (request.method === "GET" && url.pathname === "/api/games") {
        const sportsParam = url.searchParams.get("sports");
        const result = await fetchGamesForWindow({
          date: url.searchParams.get("date") ?? "today",
          days: Number(url.searchParams.get("days") ?? 2),
          sports: sportsParam ? sportsParam.split(",").map((sport) => sport.trim()).filter(Boolean) : undefined,
          fetchJsonImpl: process.env.BEAR_EDGE_TEST_MODE ? fetchJson : options.fetchJsonImpl
        });

        return jsonResponse(response, 200, result);
      }

      if (request.method === "GET" && url.pathname === "/api/candidates") {
        const sportsParam = url.searchParams.get("sports");
        const result = await generateResearchCandidates({
          date: url.searchParams.get("date") ?? "today",
          days: Number(url.searchParams.get("days") ?? 2),
          sports: sportsParam ? sportsParam.split(",").map((sport) => sport.trim()).filter(Boolean) : undefined,
          maxCandidates: Number(url.searchParams.get("maxCandidates") ?? 20),
          fetchJsonImpl: process.env.BEAR_EDGE_TEST_MODE ? fetchJson : options.fetchJsonImpl
        });

        return jsonResponse(response, 200, result);
      }

      if (request.method === "GET" && url.pathname === "/api/best-mlb-targets") {
        const result = await getBestMlbTargets({
          date: url.searchParams.get("date") ?? "today",
          days: Number(url.searchParams.get("days") ?? 2),
          limit: Number(url.searchParams.get("limit") ?? 3),
          maxCandidates: Number(url.searchParams.get("maxCandidates") ?? 80),
          maxEventsToPrice: Number(url.searchParams.get("maxEventsToPrice") ?? 10),
          bankroll: Number(url.searchParams.get("bankroll") ?? 1000),
          bookmakers: url.searchParams.get("bookmakers") ?? "draftkings",
          regions: url.searchParams.get("regions") ?? "us",
          fetchJsonImpl: process.env.BEAR_EDGE_TEST_MODE ? fetchJson : options.fetchJsonImpl,
          oddsApiKey: process.env.THE_ODDS_API_KEY ?? process.env.ODDS_API_KEY
        });
        const persistedResult = await persistDisplayedTargets(result, {
          logPath: options.logPath,
          requestId: typeof request.headers["x-request-id"] === "string"
            ? request.headers["x-request-id"]
            : null,
          appendRecordImpl: options.appendAuthoritativeRecordImpl
        });

        return jsonResponse(response, 200, persistedResult);
      }

      if (request.method === "GET" && url.pathname === "/api/online-opportunities") {
        const sportsParam = url.searchParams.get("sports");
        const result = await fetchOnlineOpportunities({
          date: url.searchParams.get("date") ?? "today",
          days: Number(url.searchParams.get("days") ?? 2),
          sports: sportsParam ? sportsParam.split(",").map((sport) => sport.trim()).filter(Boolean) : undefined,
          maxProps: Number(url.searchParams.get("maxProps") ?? 200),
          fetchJsonImpl: process.env.BEAR_EDGE_TEST_MODE ? fetchJson : options.fetchJsonImpl,
          fetchTextImpl: process.env.BEAR_EDGE_TEST_MODE ? fetchText : options.fetchTextImpl
        });

        return jsonResponse(response, 200, result);
      }

      if (request.method === "GET" && url.pathname === "/api/source-status") {
        const result = await getSourceStatusDashboard({
          date: url.searchParams.get("date") ?? "today",
          days: Number(url.searchParams.get("days") ?? 2),
          maxRosterTeams: Number(url.searchParams.get("maxRosterTeams") ?? 6),
          fetchJsonImpl: process.env.BEAR_EDGE_TEST_MODE ? fetchJson : options.fetchJsonImpl,
          fetchTextImpl: process.env.BEAR_EDGE_TEST_MODE ? fetchText : options.fetchTextImpl,
          oddsApiKey: process.env.THE_ODDS_API_KEY ?? process.env.ODDS_API_KEY
        });

        return jsonResponse(response, 200, result);
      }

      if (request.method === "GET" && url.pathname === "/api/live-data-health") {
        const result = await getLiveDataHealth({
          date: url.searchParams.get("date") ?? "today",
          days: Number(url.searchParams.get("days") ?? 2),
          maxRosterTeams: Number(url.searchParams.get("maxRosterTeams") ?? 6),
          fetchJsonImpl: process.env.BEAR_EDGE_TEST_MODE ? fetchJson : options.fetchJsonImpl,
          fetchTextImpl: process.env.BEAR_EDGE_TEST_MODE ? fetchText : options.fetchTextImpl,
          oddsApiKey: process.env.THE_ODDS_API_KEY ?? process.env.ODDS_API_KEY,
          autoUpdateStatus: typeof options.autoUpdateService?.getStatus === "function"
            ? options.autoUpdateService.getStatus()
            : null,
          autoUpdateSnapshotPath: options.autoUpdateSnapshotPath
        });

        return jsonResponse(response, 200, result);
      }

      if (request.method === "GET" && url.pathname === "/api/odds/sports") {
        const result = await fetchOddsApiSports({
          fetchJsonImpl: process.env.BEAR_EDGE_TEST_MODE ? fetchJson : options.fetchJsonImpl,
          oddsApiKey: process.env.THE_ODDS_API_KEY ?? process.env.ODDS_API_KEY
        });

        return jsonResponse(response, result.status === "blocked" ? 428 : 200, result);
      }

      if (request.method === "GET" && url.pathname === "/api/odds/markets") {
        const result = await fetchOddsApiMarkets({
          sportKey: url.searchParams.get("sportKey") ?? url.searchParams.get("sport") ?? "mlb",
          markets: url.searchParams.get("markets") ?? "h2h,spreads,totals",
          bookmakers: url.searchParams.get("bookmakers") ?? "draftkings",
          regions: url.searchParams.get("regions") ?? "us",
          oddsFormat: url.searchParams.get("oddsFormat") ?? "american",
          fetchJsonImpl: process.env.BEAR_EDGE_TEST_MODE ? fetchJson : options.fetchJsonImpl,
          oddsApiKey: process.env.THE_ODDS_API_KEY ?? process.env.ODDS_API_KEY
        });

        return jsonResponse(response, result.status === "blocked" ? 428 : 200, result);
      }

      if (request.method === "GET" && url.pathname === "/api/auto-update") {
        const result = options.autoUpdateService
          ? options.autoUpdateService.getStatus()
          : {
              enabled: false,
              started: false,
              running: false,
              lastResult: null,
              warning: "Auto-update service is not attached to this server."
            };

        return jsonResponse(response, 200, result);
      }

      if (request.method === "GET" && url.pathname === "/api/auto-update/history") {
        const result = await readAutoUpdateHistory({
          autoUpdateLogPath: options.autoUpdateLogPath,
          autoUpdateLatestPath: options.autoUpdateLatestPath,
          limit: Number(url.searchParams.get("limit") ?? 25)
        });

        return jsonResponse(response, 200, result);
      }

      if (request.method === "GET" && url.pathname === "/api/auto-update/snapshot") {
        const result = await readAutoUpdateSnapshot({
          autoUpdateSnapshotPath: options.autoUpdateSnapshotPath
        });

        return jsonResponse(response, result.exists ? 200 : 404, result);
      }

      if (request.method === "POST" && url.pathname === "/api/auto-update/run") {
        if (!options.autoUpdateService) {
          return jsonResponse(response, 503, {
            error: "Auto-update service is not attached to this server."
          });
        }

        const result = await options.autoUpdateService.runNow({
          reason: "manual_api"
        });

        return jsonResponse(response, 200, result);
      }

      if (request.method === "POST" && url.pathname === "/api/settle") {
        const body = await readJsonBody(request);
        const result = await appendSettlement(body, {
          logPath: options.logPath
        });
        const dashboard = await getDecisionLogDashboard({
          logPath: options.logPath
        });

        return jsonResponse(response, 200, {
          ...result,
          dashboard
        });
      }

      if (request.method === "POST" && url.pathname === "/api/statmuse-snapshot") {
        const body = await readJsonBody(request);
        const result = parseStatMuseSnapshot(body);

        return jsonResponse(response, 200, result);
      }

      if (request.method === "POST" && url.pathname === "/api/espn-snapshot") {
        const body = await readJsonBody(request);
        const result = parseEspnSnapshot(body);

        return jsonResponse(response, 200, result);
      }

      if (request.method === "POST" && url.pathname === "/api/snapshot-confirmation") {
        const body = await readJsonBody(request);
        const result = createManualSnapshotConfirmation(body);

        return jsonResponse(response, 200, result);
      }

      if (request.method === "POST" && url.pathname === "/api/draftkings-snapshot") {
        const body = await readJsonBody(request);
        const result = parseDraftKingsSnapshot(body);

        return jsonResponse(response, 200, result);
      }

      if (request.method === "POST" && url.pathname === "/api/dk-predictions-board-snapshot") {
        const body = await readJsonBody(request);
        const result = parseDkPredictionsBoardSnapshot(body);

        return jsonResponse(response, 200, result);
      }

      if (request.method === "POST" && url.pathname === "/api/simulate-card") {
        const body = await readJsonBody(request);
        const result = simulateBetCard(body);

        return jsonResponse(response, 200, result);
      }

      if (request.method === "POST" && url.pathname === "/api/worldcup-goalscorer-snapshot") {
        const body = await readJsonBody(request);
        const result = parseWorldCupGoalscorerSnapshot(body);

        return jsonResponse(response, 200, result);
      }

      if (request.method === "POST" && url.pathname === "/api/recording-props-compare") {
        const body = await readJsonBody(request);

        const result = await compareRecordingPropsWithCurrentBoard(
          {
            recordingCsvText: body.recordingCsvText,
            currentBoardPayload: body.currentBoardPayload ?? body.currentBoardText,
            bankroll: Number(body.bankroll ?? 1000)
          },
          {
            fetchJsonImpl: process.env.BEAR_EDGE_TEST_MODE ? fetchJson : options.fetchJsonImpl
          }
        );

        return jsonResponse(response, 200, result);
      }

      if (request.method === "POST" && url.pathname === "/api/ocr-snapshot") {
        const body = await readJsonBody(request);
        const requestedParser = String(body.parser ?? "").toLowerCase();
        const parser = OCR_PARSER_ALIASES[requestedParser];

        if (!parser) {
          return jsonResponse(response, 400, {
            error: "parser must be draftkings, espn, dk-predictions, statmuse, or worldcup-goalscorer."
          });
        }

        const ocr = await (options.recognizeTextFromImageImpl ?? recognizeTextFromImage)(body, options.ocrOptions);
        const parseInput = {
          text: ocr.text,
          sourceUrl: body.sourceUrl,
          capturedAt: body.capturedAt ?? new Date().toISOString(),
          sourceFile: body.fileName ?? ocr.fileName ?? null
        };
        const parsed = parser === "draftkings"
          ? parseDraftKingsSnapshot(parseInput)
          : parser === "espn"
            ? parseEspnSnapshot(parseInput)
          : parser === "statmuse"
            ? parseStatMuseSnapshot(parseInput)
            : parser === "dk-predictions"
              ? parseDkPredictionsBoardSnapshot(parseInput)
              : parseWorldCupGoalscorerSnapshot({
                  ...parseInput,
                  sourceUrl: body.sourceUrl ?? "https://sportsbook.draftkings.com/",
                  event: body.event
                });

        return jsonResponse(response, 200, {
          ...parsed,
          inputType: "image",
          parser,
          extractedText: ocr.text,
          ocr: {
            engine: ocr.engine,
            fileName: ocr.fileName ?? body.fileName ?? null,
            mimeType: ocr.mimeType ?? body.mimeType ?? null,
            bytes: ocr.bytes ?? null,
            characters: ocr.text.length,
            lines: Array.isArray(ocr.lines) ? ocr.lines.length : 0,
            compiledHelper: Boolean(ocr.compiledHelper),
            warnings: ocr.warnings ?? []
          },
          warnings: [
            ...((parsed.warnings ?? [])),
            "Parsed from OCR text extracted from a screenshot. Verify every team, line, and price before evaluating."
          ]
        });
      }

      if (request.method === "POST" && url.pathname === "/api/candidate-odds-import") {
        const body = await readJsonBody(request);
        const result = matchCandidateOdds(body);

        return jsonResponse(response, 200, result);
      }

      if (request.method === "POST" && url.pathname === "/evaluate") {
        const body = await readJsonBody(request);
        const { writeLog = true, logPath, ...inputBody } = body;

        if (writeLog === false) {
          return jsonResponse(response, 400, {
            error: "Authoritative logging cannot be disabled."
          });
        }

        const input = validateBetInput(inputBody);
        const {
          createStraightEvaluationAuditRecord,
          evaluateBetDecision
        } = require("./index.js");
        const result = evaluateBetDecision(input);
        const auditRecord = createStraightEvaluationAuditRecord(input, result, {
          origin: {
            channel: "http_api",
            actorType: "operator",
            sessionId: null,
            requestId: typeof request.headers["x-request-id"] === "string"
              ? request.headers["x-request-id"]
              : null
          },
          sourceLocator: "/evaluate"
        });
        const persistence = await appendAuthoritativeRecord(auditRecord, {
          logPath: logPath ?? options.logPath
        });

        return jsonResponse(response, 200, {
          ...result,
          verdict: auditRecord.verdict,
          reasons: auditRecord.reasons,
          riskFlags: auditRecord.riskFlags,
          decisionLog: auditRecord,
          recordId: auditRecord.id,
          clientEventId: auditRecord.clientEventId,
          contentDigest: auditRecord.contentDigest,
          persistedAt: persistence.persistedAt,
          logPath: persistence.ledgerPath,
          ledgerPath: persistence.ledgerPath
        });
      }

      if (request.method === "POST" && url.pathname === "/evaluate/live") {
        const body = await readJsonBody(request);
        const { writeLog = true, logPath, ...ticketBody } = body;

        if (writeLog === false) {
          return jsonResponse(response, 400, {
            error: "Authoritative logging cannot be disabled."
          });
        }

        const ticket = validateLiveTicket(ticketBody);
        const result = await evaluateLiveTicketAndLog(ticket, {
          logPath: logPath ?? options.logPath,
          auditContext: {
            origin: {
              channel: "http_api",
              actorType: "operator",
              sessionId: null,
              requestId: typeof request.headers["x-request-id"] === "string"
                ? request.headers["x-request-id"]
                : null
            }
          },
          fetchJsonImpl: process.env.BEAR_EDGE_TEST_MODE ? fetchJson : options.fetchJsonImpl
        });

        return jsonResponse(response, 200, result);
      }

      return jsonResponse(response, 404, {
        error: "Not found."
      });
    } catch (error) {
      if (error instanceof BetInputValidationError || error instanceof LiveTicketValidationError) {
        return jsonResponse(response, 400, {
          error: error.message,
          issues: error.issues
        });
      }

      if (error instanceof SyntaxError) {
        return jsonResponse(response, 400, {
          error: `Invalid JSON: ${error.message}`
        });
      }

      return jsonResponse(response, 500, {
        error: safeErrorMessage(error)
      });
    }
  });
}

module.exports = {
  createServer
};
