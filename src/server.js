const http = require("node:http");
const fs = require("node:fs/promises");
const path = require("node:path");

const {
  appendAuthoritativeRecord,
  readAuthoritativeLedger
} = require("./audit/authoritative-ledger.js");
const { persistDisplayedTargets } = require("./audit/recommendation-service.js");
const {
  EvidenceIntegrityError,
  appendClosingPrice,
  appendPredictionOutcome
} = require("./audit/evidence-ledger.js");
const { getEvidenceQueue } = require("./audit/evidence-queue.js");
const {
  AuditIntegrityError,
  appendAmendment,
  appendSettlement,
  getDecisionLogDashboard
} = require("./analytics.js");
const { evaluateLiveTicketAndLog } = require("./live/evaluate-live-ticket.js");
const {
  readAutoUpdateHistory,
  readAutoUpdateSnapshot
} = require("./live/auto-update.js");
const { generateResearchCandidates } = require("./live/candidates.js");
const {
  DEFAULT_EXECUTION_BOOKMAKER,
  DEFAULT_MLB_BOOKMAKERS,
  getBestMlbTargets
} = require("./live/best-mlb-targets.js");
const { matchCandidateOdds } = require("./live/candidate-odds-import.js");
const {
  addCalendarDays,
  dateStringForInstant
} = require("./live/date-window.js");
const { normalizeDirectScreenCapture } = require("./live/direct-screen-capture.js");
const {
  persistDirectScreenCapture,
  readLatestDirectScreenCapture
} = require("./live/direct-screen-capture-store.js");
const {
  matchDirectScreenCaptureCandidates
} = require("./live/direct-screen-candidate-match.js");
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
const {
  fetchOddsApiMarkets,
  fetchOddsApiSports,
  quotaSnapshot,
  verifyOddsApiReadiness
} = require("./live/odds-api.js");
const { getSystemAudit } = require("./system-audit.js");
const { getReleaseReadiness } = require("./release-readiness.js");
const { getDataEdgeAudit } = require("./data-edge.js");
const {
  buildPitcherStrikeoutResearchReadiness,
  readPitcherStrikeoutCohort
} = require("./research/pitcher-strikeout-readiness.js");
const { getOddsKeyStatus, saveOddsApiKey, validateOddsApiKey } = require("./config/odds-key-settings.js");
const { getProviderSetupStatus } = require("./config/provider-requirements.js");
const { saveProviderApiKey } = require("./config/provider-key-settings.js");
const { safeErrorMessage } = require("./config/secrets.js");
const { getSupabaseSyncStatus } = require("./config/supabase-settings.js");
const {
  PRESENTATION_GATE,
  SHADOW_GATE
} = require("./integrations/statsig-control.js");
const { buildPortfolioSnapshot } = require("./risk/portfolio-risk.js");
const { buildDrawdownSnapshot } = require("./risk/drawdown-risk.js");
const { readOutboxState } = require("./sync/outbox.js");
const {
  AMENDMENT_INPUT_SCHEMA,
  AUDIT_RECORD_SCHEMA,
  BET_DECISION_SCHEMA,
  BET_INPUT_SCHEMA,
  CLOSING_PRICE_INPUT_SCHEMA,
  LIVE_DECISION_SCHEMA,
  LIVE_TICKET_SCHEMA,
  PREDICTION_OUTCOME_INPUT_SCHEMA,
  RESEARCH_PACKET_SCHEMA,
  SETTLEMENT_INPUT_SCHEMA
} = require("./schemas.js");
const { BetInputValidationError, validateBetInput } = require("./validate-bet-input.js");
const { LiveTicketValidationError, validateLiveTicket } = require("./validate-live-ticket.js");

const PROJECT_ROOT = path.resolve(__dirname, "..");
// A 12 MiB screenshot expands to roughly 16 MiB when Base64-encoded in JSON.
const DEFAULT_MAX_REQUEST_BODY_BYTES = 20 * 1024 * 1024;
const SECURITY_HEADERS = Object.freeze({
  "content-security-policy": [
    "default-src 'self'",
    "base-uri 'none'",
    "connect-src 'self'",
    "font-src 'self'",
    "form-action 'self'",
    "frame-ancestors 'none'",
    "img-src 'self' data:",
    "manifest-src 'self'",
    "object-src 'none'",
    "script-src 'self'",
    "style-src 'self' 'unsafe-inline'",
    "worker-src 'self'"
  ].join("; "),
  "cross-origin-opener-policy": "same-origin",
  "cross-origin-resource-policy": "same-origin",
  "permissions-policy": "camera=(), geolocation=(), microphone=(), payment=(), usb=()",
  "referrer-policy": "no-referrer",
  "x-content-type-options": "nosniff",
  "x-frame-options": "DENY"
});
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
    ...SECURITY_HEADERS,
    "cache-control": "no-store",
    "content-type": "application/json; charset=utf-8"
  });
  response.end(`${JSON.stringify(payload)}\n`);
}

function redirectResponse(response, location) {
  response.writeHead(302, {
    ...SECURITY_HEADERS,
    "cache-control": "no-store",
    location
  });
  response.end();
}

async function staticResponse(response, fileName, contentType) {
  const filePath = path.resolve(__dirname, "dashboard", fileName);
  const contents = await fs.readFile(filePath);

  response.writeHead(200, {
    ...SECURITY_HEADERS,
    "cache-control": "no-cache",
    "content-type": contentType
  });
  response.end(contents);
}

class RequestBodyTooLargeError extends Error {
  constructor(maxBytes) {
    super(`Request body exceeds the ${maxBytes}-byte limit.`);
    this.name = "RequestBodyTooLargeError";
    this.code = "REQUEST_BODY_TOO_LARGE";
    this.maxBytes = maxBytes;
  }
}

async function readJsonBody(request, options = {}) {
  const maxBytes = Number.isInteger(options.maxBytes) && options.maxBytes > 0
    ? options.maxBytes
    : DEFAULT_MAX_REQUEST_BODY_BYTES;
  const contentLength = Number(request.headers["content-length"]);

  if (Number.isFinite(contentLength) && contentLength > maxBytes) {
    request.resume();
    throw new RequestBodyTooLargeError(maxBytes);
  }

  const chunks = [];
  let totalBytes = 0;
  let tooLarge = false;

  for await (const chunk of request) {
    totalBytes += chunk.length;

    if (totalBytes > maxBytes) {
      tooLarge = true;
      chunks.length = 0;
    } else if (!tooLarge) {
      chunks.push(chunk);
    }
  }

  if (tooLarge) {
    throw new RequestBodyTooLargeError(maxBytes);
  }

  return JSON.parse(Buffer.concat(chunks).toString("utf8"));
}

function isLoopbackAddress(address) {
  return address === "127.0.0.1"
    || address === "::1"
    || address === "::ffff:127.0.0.1";
}

function requiresOperatorAuthorization(request, url) {
  const method = request.method ?? "GET";

  if (!["GET", "HEAD", "OPTIONS"].includes(method)) {
    return true;
  }

  if (method !== "GET") {
    return false;
  }

  return url.pathname.startsWith("/api/") && url.pathname !== "/api/operator-auth";
}

function parseEvidenceQueueQuery(url) {
  const supported = new Set(["status", "limit"]);
  const unknown = [...url.searchParams.keys()].filter((name) => !supported.has(name));
  const status = url.searchParams.get("status") ?? "unresolved";
  const limitText = url.searchParams.get("limit") ?? "100";
  const limit = Number(limitText);

  if (unknown.length > 0) {
    return {
      error: `Unsupported evidence queue query parameter: ${unknown[0]}.`
    };
  }
  if (!new Set(["unresolved", "complete", "all"]).has(status)) {
    return {
      error: "Evidence queue status must be unresolved, complete, or all."
    };
  }
  if (!/^\d+$/.test(limitText) || !Number.isSafeInteger(limit) || limit < 1 || limit > 500) {
    return {
      error: "Evidence queue limit must be an integer from 1 through 500."
    };
  }

  return { status, limit };
}

function directCaptureCandidateDate(capture, timeZone) {
  const capturedAt = new Date(capture.capturedAt);
  const localDate = dateStringForInstant(capturedAt, timeZone);

  if (capture.event?.status !== "live") {
    return localDate;
  }

  const hourPart = new Intl.DateTimeFormat("en-US", {
    timeZone,
    hour: "2-digit",
    hourCycle: "h23"
  }).formatToParts(capturedAt).find((part) => part.type === "hour");
  const localHour = Number(hourPart?.value);

  return Number.isInteger(localHour) && localHour < 6
    ? addCalendarDays(localDate, -1)
    : localDate;
}

async function refreshedEvidenceQueueItem(evaluationId, options) {
  const queue = await getEvidenceQueue({
    logPath: options.logPath,
    registryPath: options.registryPath,
    status: "all",
    limit: 1,
    targetEvaluationId: evaluationId
  });

  return queue.items.find((item) => item.evaluationId === evaluationId) ?? null;
}

async function getSyncHealth(options = {}) {
  if (typeof options.syncWorker?.getStatus === "function") {
    return options.syncWorker.getStatus();
  }

  const configuration = getSupabaseSyncStatus();
  const outbox = await readOutboxState({
    outboxPath: options.outboxPath,
    ledgerPath: options.logPath
  });

  return {
    provider: "supabase",
    configured: configuration.configured,
    enabled: false,
    started: false,
    running: false,
    pending: outbox.pending.length,
    retryableFailures: outbox.summary.retryableFailures,
    terminalFailures: outbox.summary.terminalFailures,
    synchronized: outbox.summary.synchronized,
    oldestPendingAgeMs: outbox.summary.oldestPendingAt
      ? Math.max(0, Date.now() - Date.parse(outbox.summary.oldestPendingAt))
      : null,
    lastRunAt: null,
    lastSuccessAt: null,
    lastSafeError: null,
    integrityIssues: outbox.malformedLines.length + outbox.invalidEvents.length,
    secretReturned: false
  };
}

function createServer(options = {}) {
  if (typeof options.operatorAuth?.authorizeRequest !== "function"
    || typeof options.operatorAuth?.getStatus !== "function") {
    throw new TypeError("createServer requires an explicit operatorAuth policy.");
  }

  const readRequestJsonBody = (request) => readJsonBody(request, {
    maxBytes: options.maxRequestBodyBytes
  });

  return http.createServer(async (request, response) => {
    try {
      const url = new URL(request.url ?? "/", "http://127.0.0.1");
      if (requiresOperatorAuthorization(request, url)) {
        const authorization = options.operatorAuth.authorizeRequest(request);

        if (!authorization.authorized) {
          return jsonResponse(response, authorization.statusCode, {
            error: "Operator authorization is required for protected operations.",
            code: authorization.reason
          });
        }
      }

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

      if (request.method === "GET" && url.pathname === "/api/operator-auth") {
        return jsonResponse(response, 200, options.operatorAuth.getStatus());
      }

      if (request.method === "GET" && url.pathname === "/api/statsig-control") {
        const operatorId = options.operatorId ?? process.env.BEAR_EDGE_OPERATOR_ID ?? "local_operator";
        const control = options.statsigControl;

        return jsonResponse(response, 200, {
          presentationProvenance: control?.checkPresentationGate(operatorId) ?? false,
          shadowAssignment: control?.getShadowAssignment(operatorId) ?? "control",
          status: control?.getStatus() ?? {
            provider: "statsig",
            configured: false,
            initialized: false,
            mode: "control_fallback",
            secretReturned: false
          }
        });
      }

      if (request.method === "POST" && url.pathname === "/api/statsig-control/exposure") {
        const input = await readRequestJsonBody(request);
        const gateName = String(input?.gateName ?? "");

        if (![PRESENTATION_GATE, SHADOW_GATE].includes(gateName)) {
          return jsonResponse(response, 400, {
            error: "Unknown control-only gate."
          });
        }

        const operatorId = options.operatorId ?? process.env.BEAR_EDGE_OPERATOR_ID ?? "local_operator";
        const exposure = options.statsigControl?.recordExposure(gateName, operatorId) ?? {
          gateName,
          value: false,
          ruleId: null,
          controlReason: "control_fallback",
          exposedAt: new Date().toISOString()
        };

        return jsonResponse(response, 200, { exposure });
      }

      if (request.method === "GET" && url.pathname === "/api/sync-health") {
        return jsonResponse(response, 200, await getSyncHealth(options));
      }

      if (request.method === "POST" && url.pathname === "/api/sync/run") {
        const health = await getSyncHealth(options);

        if (!health.enabled || typeof options.syncWorker?.runNow !== "function") {
          return jsonResponse(response, 503, {
            error: "Supabase synchronization is disabled.",
            health
          });
        }
        if (!isLoopbackAddress(request.socket.remoteAddress)
          && !options.operatorAuth.getStatus().required) {
          return jsonResponse(response, 403, {
            error: "Manual synchronization is restricted to the local machine."
          });
        }

        const run = await options.syncWorker.runNow();
        const updatedHealth = await getSyncHealth(options);

        return jsonResponse(response, run.status === "failed" ? 502 : 200, {
          run,
          health: updatedHealth
        });
      }

      if (request.method === "GET" && url.pathname === "/api/system-audit") {
        const result = await getSystemAudit({
          rootDir: options.settingsRootDir ?? PROJECT_ROOT,
          operatorAuthStatus: options.operatorAuth?.getStatus(),
          statsigStatus: options.statsigControl?.getStatus()
        });

        return jsonResponse(response, 200, result);
      }

      if (request.method === "GET" && url.pathname === "/api/release-readiness") {
        const syncHealth = await getSyncHealth(options);
        const result = await getReleaseReadiness({
          rootDir: options.settingsRootDir ?? PROJECT_ROOT,
          fetchJsonImpl: options.fetchJsonImpl,
          fetchTextImpl: options.fetchTextImpl,
          oddsApiKey: process.env.THE_ODDS_API_KEY ?? process.env.ODDS_API_KEY,
          autoUpdateStatus: typeof options.autoUpdateService?.getStatus === "function"
            ? options.autoUpdateService.getStatus()
            : null,
          autoUpdateSnapshotPath: options.autoUpdateSnapshotPath,
          logPath: options.logPath,
          outboxPath: options.outboxPath,
          syncHealth,
          operatorAuthStatus: options.operatorAuth?.getStatus(),
          statsigStatus: options.statsigControl?.getStatus()
        });

        return jsonResponse(response, 200, result);
      }

      if (request.method === "GET" && url.pathname === "/api/research/pitcher-strikeouts/readiness") {
        const rootDir = options.settingsRootDir ?? PROJECT_ROOT;
        const cohortState = Array.isArray(options.pitcherStrikeoutCohortRecords)
          ? {
              records: options.pitcherStrikeoutCohortRecords,
              malformedLines: []
            }
          : readPitcherStrikeoutCohort(rootDir);
        const result = buildPitcherStrikeoutResearchReadiness({
          rootDir,
          providerSetup: getProviderSetupStatus({ rootDir }),
          cohortRecords: cohortState.records,
          cohortMalformedLines: cohortState.malformedLines
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
          fetchJsonImpl: options.fetchJsonImpl,
          fetchTextImpl: options.fetchTextImpl,
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
        const oddsApiKey = process.env.THE_ODDS_API_KEY ?? process.env.ODDS_API_KEY;
        let quotaRefresh = {
          status: oddsApiKey ? "not_checked" : "not_configured",
          message: oddsApiKey
            ? "Quota headers have not been refreshed."
            : "No odds API key is configured."
        };

        if (oddsApiKey) {
          try {
            const catalog = await fetchOddsApiSports({
              fetchJsonImpl: options.fetchJsonImpl,
              oddsApiKey
            });
            quotaRefresh = {
              status: "ok",
              message: "Quota telemetry refreshed through the provider's zero-credit sports catalog.",
              sports: catalog.sports.length
            };
          } catch (error) {
            quotaRefresh = {
              status: "error",
              message: safeErrorMessage(error)
            };
          }
        }

        return jsonResponse(response, 200, {
          ...getOddsKeyStatus(),
          quota: quotaSnapshot(oddsApiKey),
          quotaRefresh
        });
      }

      if (request.method === "GET" && url.pathname === "/api/provider-requirements") {
        return jsonResponse(response, 200, getProviderSetupStatus({
          rootDir: options.settingsRootDir ?? PROJECT_ROOT
        }));
      }

      if (request.method === "POST" && url.pathname === "/api/provider-requirements/key") {
        const body = await readRequestJsonBody(request);

        try {
          const result = await saveProviderApiKey(body, {
            rootDir: options.settingsRootDir ?? PROJECT_ROOT,
            envPath: options.envPath,
            fetchJsonImpl: options.fetchJsonImpl
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

        const verification = await verifyOddsApiReadiness({
          fetchJsonImpl: options.fetchJsonImpl,
          oddsApiKey
        });

        return jsonResponse(response, 200, {
          ...getOddsKeyStatus(),
          verification
        });
      }

      if (request.method === "POST" && url.pathname === "/api/settings/odds-key") {
        const body = await readRequestJsonBody(request);
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
          verification = await verifyOddsApiReadiness({
            fetchJsonImpl: options.fetchJsonImpl,
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

        if (verification.authenticated !== true) {
          return jsonResponse(response, 502, {
            ...getOddsKeyStatus(),
            configured: false,
            verification
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
          verification
        });
      }

      if (request.method === "GET" && url.pathname === "/schemas") {
        return jsonResponse(response, 200, {
          amendmentInput: AMENDMENT_INPUT_SCHEMA,
          auditRecord: AUDIT_RECORD_SCHEMA,
          betInput: BET_INPUT_SCHEMA,
          closingPriceInput: CLOSING_PRICE_INPUT_SCHEMA,
          betDecision: BET_DECISION_SCHEMA,
          liveTicket: LIVE_TICKET_SCHEMA,
          liveDecision: LIVE_DECISION_SCHEMA,
          predictionOutcomeInput: PREDICTION_OUTCOME_INPUT_SCHEMA,
          researchPacket: RESEARCH_PACKET_SCHEMA,
          settlementInput: SETTLEMENT_INPUT_SCHEMA
        });
      }

      if (request.method === "GET" && url.pathname === "/api/decision-log") {
        const result = await getDecisionLogDashboard({
          logPath: options.logPath
        });

        return jsonResponse(response, 200, result);
      }

      if (request.method === "GET" && url.pathname === "/api/evidence-queue") {
        const query = parseEvidenceQueueQuery(url);
        if (query.error) {
          return jsonResponse(response, 400, {
            error: query.error,
            code: "INVALID_EVIDENCE_QUEUE_QUERY"
          });
        }

        const result = await getEvidenceQueue({
          logPath: options.logPath,
          registryPath: options.registryPath,
          status: query.status,
          limit: query.limit
        });

        return jsonResponse(response, 200, result);
      }

      if (request.method === "GET" && url.pathname === "/api/games") {
        const sportsParam = url.searchParams.get("sports");
        const result = await fetchGamesForWindow({
          date: url.searchParams.get("date") ?? "today",
          days: Number(url.searchParams.get("days") ?? 2),
          sports: sportsParam ? sportsParam.split(",").map((sport) => sport.trim()).filter(Boolean) : undefined,
          fetchJsonImpl: options.fetchJsonImpl
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
          fetchJsonImpl: options.fetchJsonImpl
        });

        return jsonResponse(response, 200, result);
      }

      if (request.method === "GET" && url.pathname === "/api/direct-screen-captures/latest") {
        const readCapture = options.readLatestDirectScreenCaptureImpl
          ?? readLatestDirectScreenCapture;
        let result;

        try {
          result = await readCapture({
            ledgerPath: options.directScreenCaptureLedgerPath,
            artifactDir: options.directScreenCaptureArtifactDir
          });
        } catch {
          return jsonResponse(response, 500, {
            error: "Direct screen capture read failed.",
            code: "DIRECT_SCREEN_CAPTURE_READ_FAILED"
          });
        }
        let matching = null;

        if (result.latest) {
          const generateCandidates = options.generateResearchCandidatesImpl ?? generateResearchCandidates;

          try {
            const candidatePayload = await generateCandidates({
              date: directCaptureCandidateDate(
                result.latest,
                process.env.BEAR_EDGE_TIME_ZONE ?? "America/New_York"
              ),
              days: 1,
              sports: [result.latest.event.sport],
              maxCandidates: 20,
              fetchJsonImpl: options.fetchJsonImpl
            });

            matching = matchDirectScreenCaptureCandidates({
              capture: result.latest,
              candidates: candidatePayload.candidates,
              now: options.directScreenCaptureNow
            });
          } catch (error) {
            matching = {
              captureId: result.latest.captureId,
              summary: {
                candidates: 0,
                matches: 0,
                waitEvidence: 0,
                unmatched: 0
              },
              matches: [],
              waitEvidence: [],
              unmatched: [],
              warnings: [
                `The retained screenshot is available, but current research candidates could not be generated: ${safeErrorMessage(error)}`
              ]
            };
          }
        }

        return jsonResponse(response, 200, {
          ...result,
          matching
        });
      }

      if (request.method === "GET" && url.pathname === "/api/best-mlb-targets") {
        const bankroll = Number(url.searchParams.get("bankroll") ?? 1000);
        const paidRefreshRequested = url.searchParams.get("refresh") === "1";
        const portfolioInspection = await readAuthoritativeLedger({
          logPath: options.logPath
        });
        const portfolioSnapshot = buildPortfolioSnapshot(portfolioInspection, {
          timeZone: process.env.BEAR_EDGE_TIME_ZONE ?? "America/New_York"
        });
        const drawdownSnapshot = buildDrawdownSnapshot(portfolioInspection, {
          startingBankroll: Number(process.env.BEAR_EDGE_STARTING_BANKROLL ?? bankroll)
        });
        const result = await getBestMlbTargets({
          date: url.searchParams.get("date") ?? "today",
          days: Number(url.searchParams.get("days") ?? 2),
          limit: Number(url.searchParams.get("limit") ?? 3),
          maxCandidates: Number(url.searchParams.get("maxCandidates") ?? 80),
          maxEventsToPrice: Number(url.searchParams.get("maxEventsToPrice") ?? 10),
          maxOddsCreditsPerRefresh: Number(url.searchParams.get("maxOddsCreditsPerRefresh") ?? 12),
          bankroll,
          bookmakers: url.searchParams.get("bookmakers") ?? DEFAULT_MLB_BOOKMAKERS,
          requiredBookmaker: url.searchParams.get("requiredBookmaker") ?? DEFAULT_EXECUTION_BOOKMAKER,
          regions: url.searchParams.get("regions") ?? "us",
          fetchJsonImpl: options.fetchJsonImpl,
          oddsApiKey: process.env.THE_ODDS_API_KEY ?? process.env.ODDS_API_KEY,
          allowPaidOdds: paidRefreshRequested,
          forceRefresh: paidRefreshRequested,
          portfolioSnapshot,
          drawdownSnapshot
        });
        const persistedResult = paidRefreshRequested
          ? await persistDisplayedTargets(result, {
              logPath: options.logPath,
              requestId: typeof request.headers["x-request-id"] === "string"
                ? request.headers["x-request-id"]
                : null,
              appendRecordImpl: options.appendAuthoritativeRecordImpl
            })
          : {
              ...result,
              persistence: {
                status: "skipped",
                reason: "BACKGROUND_DISCOVERY",
                displayedCount: Array.isArray(result.best) ? result.best.length : 0,
                calibrationPoolCount: 0,
                persistedCount: 0
              }
            };

        return jsonResponse(response, 200, persistedResult);
      }

      if (request.method === "GET" && url.pathname === "/api/online-opportunities") {
        const sportsParam = url.searchParams.get("sports");
        const result = await fetchOnlineOpportunities({
          date: url.searchParams.get("date") ?? "today",
          days: Number(url.searchParams.get("days") ?? 2),
          sports: sportsParam ? sportsParam.split(",").map((sport) => sport.trim()).filter(Boolean) : undefined,
          maxProps: Number(url.searchParams.get("maxProps") ?? 200),
          fetchJsonImpl: options.fetchJsonImpl,
          fetchTextImpl: options.fetchTextImpl
        });

        return jsonResponse(response, 200, result);
      }

      if (request.method === "GET" && url.pathname === "/api/source-status") {
        const result = await getSourceStatusDashboard({
          date: url.searchParams.get("date") ?? "today",
          days: Number(url.searchParams.get("days") ?? 2),
          maxRosterTeams: Number(url.searchParams.get("maxRosterTeams") ?? 6),
          fetchJsonImpl: options.fetchJsonImpl,
          fetchTextImpl: options.fetchTextImpl,
          oddsApiKey: process.env.THE_ODDS_API_KEY ?? process.env.ODDS_API_KEY
        });

        return jsonResponse(response, 200, result);
      }

      if (request.method === "GET" && url.pathname === "/api/live-data-health") {
        const result = await getLiveDataHealth({
          date: url.searchParams.get("date") ?? "today",
          days: Number(url.searchParams.get("days") ?? 2),
          maxRosterTeams: Number(url.searchParams.get("maxRosterTeams") ?? 6),
          fetchJsonImpl: options.fetchJsonImpl,
          fetchTextImpl: options.fetchTextImpl,
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
          fetchJsonImpl: options.fetchJsonImpl,
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
          fetchJsonImpl: options.fetchJsonImpl,
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
        const body = await readRequestJsonBody(request);
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

      if (request.method === "POST" && url.pathname === "/api/prediction-outcomes") {
        const body = await readRequestJsonBody(request);
        const result = await appendPredictionOutcome(body, {
          logPath: options.logPath,
          outboxPath: options.outboxPath
        });
        const queueItem = await refreshedEvidenceQueueItem(body.evaluationId, options);

        return jsonResponse(response, 200, { ...result, queueItem });
      }

      if (request.method === "POST" && url.pathname === "/api/closing-prices") {
        const body = await readRequestJsonBody(request);
        const result = await appendClosingPrice(body, {
          logPath: options.logPath,
          outboxPath: options.outboxPath
        });
        const queueItem = await refreshedEvidenceQueueItem(body.evaluationId, options);

        return jsonResponse(response, 200, { ...result, queueItem });
      }

      if (request.method === "POST" && url.pathname === "/api/amend") {
        const body = await readRequestJsonBody(request);
        const result = await appendAmendment(body, {
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
        const body = await readRequestJsonBody(request);
        const result = parseStatMuseSnapshot(body);

        return jsonResponse(response, 200, result);
      }

      if (request.method === "POST" && url.pathname === "/api/espn-snapshot") {
        const body = await readRequestJsonBody(request);
        const result = parseEspnSnapshot(body);

        return jsonResponse(response, 200, result);
      }

      if (request.method === "POST" && url.pathname === "/api/snapshot-confirmation") {
        const body = await readRequestJsonBody(request);
        const result = createManualSnapshotConfirmation(body);

        return jsonResponse(response, 200, result);
      }

      if (request.method === "POST" && url.pathname === "/api/draftkings-snapshot") {
        const body = await readRequestJsonBody(request);
        const result = parseDraftKingsSnapshot(body);

        return jsonResponse(response, 200, result);
      }

      if (request.method === "POST" && url.pathname === "/api/dk-predictions-board-snapshot") {
        const body = await readRequestJsonBody(request);
        const result = parseDkPredictionsBoardSnapshot(body);

        return jsonResponse(response, 200, result);
      }

      if (request.method === "POST" && url.pathname === "/api/direct-screen-captures") {
        const body = await readRequestJsonBody(request);
        let normalized;

        try {
          normalized = normalizeDirectScreenCapture(body, {
            now: options.directScreenCaptureNow
          });
        } catch (error) {
          return jsonResponse(response, 400, {
            error: safeErrorMessage(error),
            code: "DIRECT_SCREEN_CAPTURE_INVALID"
          });
        }

        const persistCapture = options.persistDirectScreenCaptureImpl
          ?? persistDirectScreenCapture;
        let persistence;

        try {
          persistence = await persistCapture(
            normalized.capture,
            normalized.image,
            {
              ledgerPath: options.directScreenCaptureLedgerPath,
              artifactDir: options.directScreenCaptureArtifactDir
            }
          );
        } catch {
          return jsonResponse(response, 500, {
            error: "Direct screen capture persistence failed.",
            code: "DIRECT_SCREEN_CAPTURE_PERSIST_FAILED"
          });
        }
        const generateCandidates = options.generateResearchCandidatesImpl ?? generateResearchCandidates;
        let matching;

        try {
          const candidatePayload = await generateCandidates({
            date: directCaptureCandidateDate(
              normalized.capture,
              process.env.BEAR_EDGE_TIME_ZONE ?? "America/New_York"
            ),
            days: 1,
            sports: [normalized.capture.event.sport],
            maxCandidates: 20,
            fetchJsonImpl: options.fetchJsonImpl
          });

          matching = matchDirectScreenCaptureCandidates({
            capture: persistence.record,
            candidates: candidatePayload.candidates,
            now: options.directScreenCaptureNow
          });
        } catch (error) {
          matching = {
            captureId: persistence.record.captureId,
            summary: {
              candidates: 0,
              matches: 0,
              waitEvidence: 0,
              unmatched: 0
            },
            matches: [],
            waitEvidence: [],
            unmatched: [],
            warnings: [
              `The screenshot was retained, but current research candidates could not be generated: ${safeErrorMessage(error)}`
            ]
          };
        }

        return jsonResponse(response, 200, {
          capture: persistence.record,
          persistence: {
            idempotent: persistence.idempotent,
            persistedAt: persistence.persistedAt,
            screenshotArtifact: persistence.record.evidence.screenshotArtifact
          },
          matching
        });
      }

      if (request.method === "POST" && url.pathname === "/api/simulate-card") {
        const body = await readRequestJsonBody(request);
        const result = simulateBetCard(body);

        return jsonResponse(response, 200, result);
      }

      if (request.method === "POST" && url.pathname === "/api/worldcup-goalscorer-snapshot") {
        const body = await readRequestJsonBody(request);
        const result = parseWorldCupGoalscorerSnapshot(body);

        return jsonResponse(response, 200, result);
      }

      if (request.method === "POST" && url.pathname === "/api/recording-props-compare") {
        const body = await readRequestJsonBody(request);

        const result = await compareRecordingPropsWithCurrentBoard(
          {
            recordingCsvText: body.recordingCsvText,
            currentBoardPayload: body.currentBoardPayload ?? body.currentBoardText,
            bankroll: Number(body.bankroll ?? 1000)
          },
          {
            fetchJsonImpl: options.fetchJsonImpl
          }
        );

        return jsonResponse(response, 200, result);
      }

      if (request.method === "POST" && url.pathname === "/api/ocr-snapshot") {
        const body = await readRequestJsonBody(request);
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
        const body = await readRequestJsonBody(request);
        const result = matchCandidateOdds(body);

        return jsonResponse(response, 200, result);
      }

      if (request.method === "POST" && url.pathname === "/evaluate") {
        const body = await readRequestJsonBody(request);
        const { writeLog = true, ...inputBody } = body;

        if (Object.prototype.hasOwnProperty.call(body, "logPath")) {
          return jsonResponse(response, 400, {
            error: "The authoritative ledger path is controlled by server configuration.",
            code: "SERVER_CONTROLLED_LEDGER_PATH"
          });
        }

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
          logPath: options.logPath
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
        const body = await readRequestJsonBody(request);
        const { writeLog = true, ...ticketBody } = body;

        if (Object.prototype.hasOwnProperty.call(body, "logPath")) {
          return jsonResponse(response, 400, {
            error: "The authoritative ledger path is controlled by server configuration.",
            code: "SERVER_CONTROLLED_LEDGER_PATH"
          });
        }

        if (writeLog === false) {
          return jsonResponse(response, 400, {
            error: "Authoritative logging cannot be disabled."
          });
        }

        const ticket = validateLiveTicket(ticketBody);
        const result = await evaluateLiveTicketAndLog(ticket, {
          logPath: options.logPath,
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
          fetchJsonImpl: options.fetchJsonImpl
        });

        return jsonResponse(response, 200, result);
      }

      return jsonResponse(response, 404, {
        error: "Not found."
      });
    } catch (error) {
      if (error instanceof RequestBodyTooLargeError) {
        return jsonResponse(response, 413, {
          error: error.message,
          code: error.code,
          maxBytes: error.maxBytes
        });
      }

      if (error instanceof AuditIntegrityError || error instanceof EvidenceIntegrityError) {
        return jsonResponse(response, 400, {
          error: error.message
        });
      }

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
