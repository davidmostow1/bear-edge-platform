// @ts-nocheck

const els = {
  globalDropOverlay: document.querySelector("#globalDropOverlay"),
  healthDot: document.querySelector("#healthDot"),
  logPath: document.querySelector("#logPath"),
  bankrollInput: document.querySelector("#bankrollInput"),
  sportsbookMinInput: document.querySelector("#sportsbookMinInput"),
  riskModeSelect: document.querySelector("#riskModeSelect"),
  unitGuardBoard: document.querySelector("#unitGuardBoard"),
  operatorStatusBoard: document.querySelector("#operatorStatusBoard"),
  summaryCards: document.querySelector("#summaryCards"),
  decisionQualityBoard: document.querySelector("#decisionQualityBoard"),
  screenshotIntakePanel: document.querySelector("#screenshotIntakePanel"),
  screenshotDropZone: document.querySelector("#screenshotDropZone"),
  screenshotImageInput: document.querySelector("#screenshotImageInput"),
  screenshotParserSelect: document.querySelector("#screenshotParserSelect"),
  screenshotIntakeStatus: document.querySelector("#screenshotIntakeStatus"),
  screenshotIntakeResult: document.querySelector("#screenshotIntakeResult"),
  ticketForm: document.querySelector("#ticketForm"),
  ticketInput: document.querySelector("#ticketInput"),
  ticketPreflightBoard: document.querySelector("#ticketPreflightBoard"),
  fileInput: document.querySelector("#fileInput"),
  clearButton: document.querySelector("#clearButton"),
  refreshButton: document.querySelector("#refreshButton"),
  autoUpdateBoard: document.querySelector("#autoUpdateBoard"),
  autoUpdateRunButton: document.querySelector("#autoUpdateRunButton"),
  autoUpdateTimestamp: document.querySelector("#autoUpdateTimestamp"),
  systemAuditBoard: document.querySelector("#systemAuditBoard"),
  systemAuditRefreshButton: document.querySelector("#systemAuditRefreshButton"),
  systemAuditTimestamp: document.querySelector("#systemAuditTimestamp"),
  releaseReadinessBoard: document.querySelector("#releaseReadinessBoard"),
  releaseReadinessRefreshButton: document.querySelector("#releaseReadinessRefreshButton"),
  releaseReadinessTimestamp: document.querySelector("#releaseReadinessTimestamp"),
  oddsKeyForm: document.querySelector("#oddsKeyForm"),
  oddsApiKeyInput: document.querySelector("#oddsApiKeyInput"),
  oddsKeyStatus: document.querySelector("#oddsKeyStatus"),
  oddsKeyStatusBoard: document.querySelector("#oddsKeyStatusBoard"),
  oddsKeyTestButton: document.querySelector("#oddsKeyTestButton"),
  providerSetupBoard: document.querySelector("#providerSetupBoard"),
  providerSetupRefreshButton: document.querySelector("#providerSetupRefreshButton"),
  providerSetupTimestamp: document.querySelector("#providerSetupTimestamp"),
  sourceStatusBoard: document.querySelector("#sourceStatusBoard"),
  sourceStatusRefreshButton: document.querySelector("#sourceStatusRefreshButton"),
  sourceStatusTimestamp: document.querySelector("#sourceStatusTimestamp"),
  onlineOpportunitiesBoard: document.querySelector("#onlineOpportunitiesBoard"),
  onlineOpportunitiesRefreshButton: document.querySelector("#onlineOpportunitiesRefreshButton"),
  onlineOpportunitiesSportsSelect: document.querySelector("#onlineOpportunitiesSportsSelect"),
  onlineOpportunitiesTimestamp: document.querySelector("#onlineOpportunitiesTimestamp"),
  statMuseSnapshotInput: document.querySelector("#statMuseSnapshotInput"),
  statMuseImageInput: document.querySelector("#statMuseImageInput"),
  statMuseSnapshotParseButton: document.querySelector("#statMuseSnapshotParseButton"),
  statMuseSnapshotClearButton: document.querySelector("#statMuseSnapshotClearButton"),
  statMuseSnapshotStatus: document.querySelector("#statMuseSnapshotStatus"),
  statMuseSnapshotResult: document.querySelector("#statMuseSnapshotResult"),
  draftKingsSnapshotInput: document.querySelector("#draftKingsSnapshotInput"),
  draftKingsImageInput: document.querySelector("#draftKingsImageInput"),
  draftKingsSnapshotParseButton: document.querySelector("#draftKingsSnapshotParseButton"),
  draftKingsSnapshotClearButton: document.querySelector("#draftKingsSnapshotClearButton"),
  draftKingsSnapshotStatus: document.querySelector("#draftKingsSnapshotStatus"),
  draftKingsSnapshotResult: document.querySelector("#draftKingsSnapshotResult"),
  recordingComparisonCsvInput: document.querySelector("#recordingComparisonCsvInput"),
  recordingComparisonBoardInput: document.querySelector("#recordingComparisonBoardInput"),
  recordingComparisonBankrollInput: document.querySelector("#recordingComparisonBankrollInput"),
  recordingComparisonRunButton: document.querySelector("#recordingComparisonRunButton"),
  recordingComparisonClearButton: document.querySelector("#recordingComparisonClearButton"),
  recordingComparisonStatus: document.querySelector("#recordingComparisonStatus"),
  recordingComparisonResult: document.querySelector("#recordingComparisonResult"),
  candidateBoard: document.querySelector("#candidateBoard"),
  candidateSportFilter: document.querySelector("#candidateSportFilter"),
  candidateMarketFilter: document.querySelector("#candidateMarketFilter"),
  candidateSortSelect: document.querySelector("#candidateSortSelect"),
  candidateSearchInput: document.querySelector("#candidateSearchInput"),
  candidatePricedOnlyInput: document.querySelector("#candidatePricedOnlyInput"),
  candidateFilterStatus: document.querySelector("#candidateFilterStatus"),
  candidateActionBoard: document.querySelector("#candidateActionBoard"),
  bestTargetsBoard: document.querySelector("#bestTargetsBoard"),
  bestTargetsRefreshButton: document.querySelector("#bestTargetsRefreshButton"),
  bestTargetsTimestamp: document.querySelector("#bestTargetsTimestamp"),
  candidatesRefreshButton: document.querySelector("#candidatesRefreshButton"),
  candidateOddsImportInput: document.querySelector("#candidateOddsImportInput"),
  candidateOddsImportButton: document.querySelector("#candidateOddsImportButton"),
  candidateOddsImportClearButton: document.querySelector("#candidateOddsImportClearButton"),
  candidateOddsImportStatus: document.querySelector("#candidateOddsImportStatus"),
  parlayBuilderBankrollInput: document.querySelector("#parlayBuilderBankrollInput"),
  parlayBuilderBoard: document.querySelector("#parlayBuilderBoard"),
  parlayBuilderAutoTwoButton: document.querySelector("#parlayBuilderAutoTwoButton"),
  parlayBuilderAutoThreeButton: document.querySelector("#parlayBuilderAutoThreeButton"),
  parlayBuilderClearButton: document.querySelector("#parlayBuilderClearButton"),
  parlayBuilderEvaluateButton: document.querySelector("#parlayBuilderEvaluateButton"),
  parlayBuilderLoadButton: document.querySelector("#parlayBuilderLoadButton"),
  formStatus: document.querySelector("#formStatus"),
  latestDecision: document.querySelector("#latestDecision"),
  latestTimestamp: document.querySelector("#latestTimestamp"),
  generatedAt: document.querySelector("#generatedAt"),
  gameBoard: document.querySelector("#gameBoard"),
  gamesTodayButton: document.querySelector("#gamesTodayButton"),
  gamesTomorrowButton: document.querySelector("#gamesTomorrowButton"),
  marketBreakdown: document.querySelector("#marketBreakdown"),
  historyCount: document.querySelector("#historyCount"),
  historyBody: document.querySelector("#historyBody")
};

const AUTO_REFRESH_MS = 5 * 60 * 1000;

const percentFormatter = new Intl.NumberFormat(undefined, {
  style: "percent",
  minimumFractionDigits: 1,
  maximumFractionDigits: 1
});

const moneyFormatter = new Intl.NumberFormat(undefined, {
  style: "currency",
  currency: "USD",
  minimumFractionDigits: 2,
  maximumFractionDigits: 2
});

const templates = Object.freeze({
  straight: {
    selection: "Sample moneyline edge",
    marketType: "moneyline",
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
    },
    notes: ["Dashboard template"]
  },
  alt2: {
    kind: "parlay",
    selection: "Cross-sport 2-leg alt prop parlay",
    bankroll: 2500,
    livePolicy: {
      marketWeight: 0.4,
      recentWeight: 0.5,
      maxParlayLegs: 3,
      maxAltPropLegs: 2,
      maxSourceAgeMinutes: 30,
      correlationPenalty: 0.92,
      allowCorrelatedLegs: false,
      kellyMultiplier: 0.15,
      maxBankrollFraction: 0.02,
      minStake: 5
    },
    legs: [
      {
        id: "ohtani-total-bases-alt",
        label: "Shohei Ohtani over 1.5 total bases",
        provider: "mlb",
        marketType: "alt-prop",
        side: "over",
        line: 1.5,
        marketOdds: 130,
        source: {
          playerId: 660271,
          statGroup: "hitting",
          statKey: "totalBases",
          recentLimit: 10
        }
      },
      {
        id: "mcdavid-points-alt",
        label: "Connor McDavid over 1.5 points",
        provider: "nhl",
        marketType: "alt-prop",
        side: "over",
        line: 1.5,
        marketOdds: 125,
        source: {
          playerId: 8478402,
          statKey: "points",
          recentLimit: 5
        }
      }
    ]
  },
  parlay3: {
    kind: "parlay",
    selection: "Three-leg mixed prop parlay",
    bankroll: 2500,
    livePolicy: {
      marketWeight: 0.4,
      recentWeight: 0.45,
      maxParlayLegs: 3,
      maxAltPropLegs: 2,
      maxSourceAgeMinutes: 30,
      correlationPenalty: 0.92,
      allowCorrelatedLegs: false,
      kellyMultiplier: 0.12,
      maxBankrollFraction: 0.015,
      minStake: 5
    },
    legs: [
      {
        id: "ohtani-total-bases",
        label: "Shohei Ohtani over 1.5 total bases",
        provider: "mlb",
        marketType: "alt-prop",
        side: "over",
        line: 1.5,
        marketOdds: 130,
        source: {
          playerId: 660271,
          statGroup: "hitting",
          statKey: "totalBases",
          recentLimit: 10
        }
      },
      {
        id: "mcdavid-points",
        label: "Connor McDavid over 0.5 points",
        provider: "nhl",
        marketType: "prop",
        side: "over",
        line: 0.5,
        marketOdds: -160,
        source: {
          playerId: 8478402,
          statKey: "points",
          recentLimit: 5
        }
      },
      {
        id: "sample-hitter-runs",
        label: "Sample hitter over 0.5 runs",
        provider: "mlb",
        marketType: "prop",
        side: "over",
        line: 0.5,
        marketOdds: -105,
        source: {
          playerId: 1,
          statGroup: "hitting",
          statKey: "runs",
          recentLimit: 10
        }
      }
    ]
  }
});

window.__bearEdgeCandidates = [];
window.__bearEdgeComparisonRows = [];
window.__bearEdgeParlayLegs = [];
window.__bearEdgeLoadedSummary = null;
window.__bearEdgeSourceStatus = null;
window.__bearEdgeAutoUpdate = null;

const storageKeys = Object.freeze({
  bankroll: "bearEdge.bankroll",
  sportsbookMinimum: "bearEdge.sportsbookMinimum",
  riskMode: "bearEdge.riskMode"
});

function escapeHtml(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function formatPercent(value) {
  return typeof value === "number" && Number.isFinite(value) ? percentFormatter.format(value) : "-";
}

function formatMoney(value) {
  return typeof value === "number" && Number.isFinite(value) ? moneyFormatter.format(value) : "-";
}

function formatSignedMoney(value) {
  if (typeof value !== "number" || !Number.isFinite(value)) {
    return "-";
  }

  const formatted = moneyFormatter.format(Math.abs(value));
  return value > 0 ? `+${formatted}` : value < 0 ? `-${formatted}` : formatted;
}

function formatOdds(value) {
  if (typeof value !== "number" || !Number.isFinite(value)) {
    return "-";
  }

  return value > 0 ? `+${value}` : String(value);
}

function readStoredNumber(key, fallback) {
  const raw = window.localStorage.getItem(key);
  const parsed = Number(raw);

  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

function writeStoredNumber(key, value) {
  if (Number.isFinite(value) && value > 0) {
    window.localStorage.setItem(key, String(value));
  }
}

function getBankrollSettings() {
  const bankroll = Number(els.bankrollInput?.value ?? 1000);
  const sportsbookMinimum = Number(els.sportsbookMinInput?.value ?? 1);
  const riskMode = els.riskModeSelect?.value ?? "standard";

  return {
    bankroll: Number.isFinite(bankroll) && bankroll > 0 ? bankroll : 1000,
    sportsbookMinimum: Number.isFinite(sportsbookMinimum) && sportsbookMinimum >= 0 ? sportsbookMinimum : 1,
    riskMode
  };
}

function riskModePolicy(mode) {
  if (mode === "training") {
    return {
      label: "Training",
      singleUnitFraction: 0.005,
      maxSingleFraction: 0.01,
      parlayFraction: 0.0015,
      kellyMultiplier: 0.08,
      maxBankrollFraction: 0.01
    };
  }

  if (mode === "aggressive") {
    return {
      label: "Aggressive capped",
      singleUnitFraction: 0.01,
      maxSingleFraction: 0.02,
      parlayFraction: 0.0035,
      kellyMultiplier: 0.18,
      maxBankrollFraction: 0.02
    };
  }

  return {
    label: "Standard",
    singleUnitFraction: 0.0075,
    maxSingleFraction: 0.015,
    parlayFraction: 0.0025,
    kellyMultiplier: 0.12,
    maxBankrollFraction: 0.015
  };
}

function applyBankrollPolicyToTicket(ticket) {
  const settings = getBankrollSettings();
  const policy = riskModePolicy(settings.riskMode);
  const updated = cloneJson(ticket);

  updated.bankroll = settings.bankroll;

  if (Array.isArray(updated.legs)) {
    updated.livePolicy = {
      ...(updated.livePolicy ?? {}),
      kellyMultiplier: policy.kellyMultiplier,
      maxBankrollFraction: Math.min(updated.livePolicy?.maxBankrollFraction ?? policy.maxBankrollFraction, policy.maxBankrollFraction),
      minStake: Math.max(0, settings.sportsbookMinimum)
    };
  } else {
    updated.stakePolicy = {
      ...(updated.stakePolicy ?? {}),
      kellyMultiplier: policy.kellyMultiplier,
      maxBankrollFraction: Math.min(updated.stakePolicy?.maxBankrollFraction ?? policy.maxBankrollFraction, policy.maxBankrollFraction),
      minStake: Math.max(0, settings.sportsbookMinimum)
    };
  }

  return updated;
}

function initializeBankrollControls() {
  const savedBankroll = readStoredNumber(storageKeys.bankroll, Number(els.bankrollInput?.value ?? 1000));
  const savedMinimum = readStoredNumber(storageKeys.sportsbookMinimum, Number(els.sportsbookMinInput?.value ?? 1));
  const savedMode = window.localStorage.getItem(storageKeys.riskMode) || els.riskModeSelect?.value || "standard";

  if (els.bankrollInput) {
    els.bankrollInput.value = String(savedBankroll);
  }

  if (els.sportsbookMinInput) {
    els.sportsbookMinInput.value = String(savedMinimum);
  }

  if (els.riskModeSelect) {
    els.riskModeSelect.value = savedMode;
  }

  if (els.parlayBuilderBankrollInput) {
    els.parlayBuilderBankrollInput.value = String(savedBankroll);
  }
}

function renderUnitGuard() {
  if (!els.unitGuardBoard) {
    return;
  }

  const settings = getBankrollSettings();
  const policy = riskModePolicy(settings.riskMode);
  const unit = settings.bankroll * policy.singleUnitFraction;
  const maxSingle = settings.bankroll * policy.maxSingleFraction;
  const parlayUnit = settings.bankroll * policy.parlayFraction;
  const minimumFraction = settings.sportsbookMinimum / settings.bankroll;
  const pressure = settings.sportsbookMinimum > maxSingle
    ? { className: "high", label: "min bet too high", message: "Sportsbook minimum is above the max disciplined single size. Most bets should be PASS until bankroll grows or minimum drops." }
    : settings.sportsbookMinimum > unit
      ? { className: "medium", label: "min bet pressure", message: "Sportsbook minimum is larger than one unit. Be selective and avoid parlays unless every leg clears EV alone." }
      : { className: "ok", label: "unit safe", message: "Sportsbook minimum is inside the selected bankroll discipline range." };

  els.unitGuardBoard.innerHTML = `
    <div class="unit-grid">
      ${[
        ["Mode", policy.label],
        ["0.25u", formatMoney(unit * 0.25)],
        ["1u", formatMoney(unit)],
        ["Max single", formatMoney(maxSingle)],
        ["Parlay nibble", formatMoney(parlayUnit)],
        ["Book min", `${formatMoney(settings.sportsbookMinimum)} / ${formatPercent(minimumFraction)}`]
      ]
        .map(([label, value]) => `<article class="metric compact"><span>${escapeHtml(label)}</span><strong>${escapeHtml(value)}</strong></article>`)
        .join("")}
    </div>
    <div class="unit-pressure edge-${pressure.className}">
      <span class="tag ${pressure.className}">${escapeHtml(pressure.label)}</span>
      <p>${escapeHtml(pressure.message)}</p>
    </div>
  `;
}

function renderOperatorStatus() {
  if (!els.operatorStatusBoard) {
    return;
  }

  const candidateRows = candidateRowsFromCards();
  const pricedRows = candidateRows.filter((row) => row.priced && !row.preview?.error);
  const positiveRows = pricedRows.filter((row) => typeof row.evRoi === "number" && row.evRoi > 0);
  const bestEv = positiveRows.reduce((best, row) => Math.max(best, row.evRoi), -Infinity);
  const summary = window.__bearEdgeLoadedSummary ?? {};
  const sourceProviders = Array.isArray(window.__bearEdgeSourceStatus?.providers) ? window.__bearEdgeSourceStatus.providers : [];
  const blockedSources = sourceProviders.filter((provider) => provider.status === "blocked" || provider.status === "error");
  const gate = window.__bearEdgeValidationGate ?? {};
  const parlayLegs = window.__bearEdgeParlayLegs?.length ?? 0;
  const operatorState = blockedSources.length > 0
    ? { className: "medium", label: "source gaps", message: "Some live providers are blocked or unavailable. Manual odds and screenshots can still be used, but verify timestamps." }
    : positiveRows.length > 0
      ? { className: "ok", label: "actionable", message: "At least one priced candidate has positive rough EV. Use preflight and the engine before betting." }
      : pricedRows.length > 0
        ? { className: "medium", label: "priced, no edge", message: "Prices are entered, but none currently show positive rough EV. Passing is a valid result." }
        : { className: "medium", label: "needs odds", message: "Load odds through API, screenshot/OCR, paste text, or manual entry before evaluating." };

  els.operatorStatusBoard.innerHTML = `
    <div class="operator-state-card edge-${operatorState.className}">
      <div>
        <strong>Slate state</strong>
        <p>${escapeHtml(operatorState.message)}</p>
      </div>
      <span class="tag ${operatorState.className}">${escapeHtml(operatorState.label)}</span>
    </div>
    <div class="operator-metrics">
      ${[
        ["Candidates", candidateRows.length],
        ["Priced", pricedRows.length],
        ["Positive rough EV", positiveRows.length],
        ["Best rough EV", bestEv === -Infinity ? "-" : formatPercent(bestEv)],
        ["Parlay legs", `${parlayLegs}/3`],
        ["BET calls logged", summary.verdictCounts?.BET ?? 0],
        ["3-win gate", gate.complete ? "complete" : `${gate.currentWinStreak ?? 0}/${gate.requiredWinStreak ?? 3}`],
        ["Source gaps", blockedSources.length]
      ]
        .map(([label, value]) => `<article class="metric compact"><span>${escapeHtml(label)}</span><strong>${escapeHtml(value)}</strong></article>`)
        .join("")}
    </div>
  `;
}

function renderOperatorBoards() {
  renderUnitGuard();
  renderOperatorStatus();
  renderTicketPreflightFromText();
}

function parseAmericanOddsInput(value) {
  const text = String(value ?? "").trim();

  if (!text) {
    return null;
  }

  const parsed = Number(text.replace(/^\+/, ""));

  if (!Number.isFinite(parsed) || parsed === 0) {
    throw new Error("American odds must be a non-zero number, for example -115 or +140.");
  }

  return parsed;
}

function americanToDecimal(odds) {
  return odds > 0 ? 1 + odds / 100 : 1 + 100 / Math.abs(odds);
}

function americanToImpliedProbability(odds) {
  return odds > 0 ? 100 / (odds + 100) : Math.abs(odds) / (Math.abs(odds) + 100);
}

function probabilityToAmerican(probability) {
  const bounded = Math.min(0.99, Math.max(0.01, probability));

  if (bounded >= 0.5) {
    return Math.round(-100 * bounded / (1 - bounded));
  }

  return Math.round(100 * (1 - bounded) / bounded);
}

function decimalToAmerican(decimalOdds) {
  if (typeof decimalOdds !== "number" || !Number.isFinite(decimalOdds) || decimalOdds <= 1) {
    return null;
  }

  if (decimalOdds >= 2) {
    return Math.round((decimalOdds - 1) * 100);
  }

  return Math.round(-100 / (decimalOdds - 1));
}

function expectedValueRoiFromOdds(probability, americanOdds) {
  if (typeof probability !== "number" || !Number.isFinite(probability)) {
    return null;
  }

  const decimalOdds = americanToDecimal(americanOdds);
  return probability * decimalOdds - 1;
}

function noVigProbabilityFromOdds(marketOdds, oppositeOdds) {
  if (oppositeOdds === null || oppositeOdds === undefined) {
    return null;
  }

  const marketImplied = americanToImpliedProbability(marketOdds);
  const oppositeImplied = americanToImpliedProbability(oppositeOdds);
  const total = marketImplied + oppositeImplied;

  return total > 0 ? marketImplied / total : null;
}

function edgePreviewTone(evRoi) {
  if (typeof evRoi !== "number" || !Number.isFinite(evRoi)) {
    return { className: "medium", label: "needs odds", message: "Enter market odds to price this candidate." };
  }

  if (evRoi < 0) {
    return { className: "high", label: "pass preview", message: "Typed price is worse than the research fair price." };
  }

  if (evRoi < 0.015) {
    return { className: "medium", label: "thin edge", message: "Edge is too thin for comfort before full engine gates." };
  }

  return { className: "ok", label: "evaluate", message: "Price clears the rough preview. Use Evaluate for the real verdict." };
}

function marketExplainer(candidate) {
  const statKey = candidate?.statKey;

  if (statKey === "totalBases") {
    return "Total bases: single 1, double 2, triple 3, HR 4. Walks do not count.";
  }

  if (statKey === "hits") {
    return "Hits: official hits only. Walks, errors, HBP, and sacrifices do not count.";
  }

  if (statKey === "runs") {
    return "Runs: player must score. Lineup slot and teammate quality matter a lot.";
  }

  if (statKey === "strikeOuts") {
    return "Pitcher Ks: strikeouts recorded by the pitcher. Opposing lineup and umpire context remain risk flags.";
  }

  if (statKey === "shots") {
    return "Shots on goal: official NHL shots. Line assignment, PP role, goalie, and scratches remain risk flags.";
  }

  return "Candidate uses official stats and still needs current sportsbook odds.";
}

function isImageFile(file) {
  if (!file) {
    return false;
  }

  if (String(file.type ?? "").startsWith("image/")) {
    return true;
  }

  return /\.(png|jpe?g|webp|tiff?|heic|heif)$/i.test(file.name ?? "");
}

function imageFilesFromEvent(event) {
  return Array.from(event.dataTransfer?.files ?? []).filter(isImageFile);
}

function hasFileDrag(event) {
  return Array.from(event.dataTransfer?.types ?? []).includes("Files") || imageFilesFromEvent(event).length > 0;
}

function readFileAsDataUrl(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();

    reader.addEventListener("load", () => resolve(String(reader.result ?? "")));
    reader.addEventListener("error", () => reject(reader.error ?? new Error("Unable to read screenshot file.")));
    reader.readAsDataURL(file);
  });
}

function cloneJson(value) {
  return JSON.parse(JSON.stringify(value));
}

function formatDate(value) {
  if (!value) {
    return "-";
  }

  const date = new Date(value);

  if (Number.isNaN(date.getTime())) {
    return value;
  }

  return date.toLocaleString(undefined, {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit"
  });
}

function shortTimestamp(value) {
  if (!value) {
    return "-";
  }

  const date = new Date(value);

  if (Number.isNaN(date.getTime())) {
    return value;
  }

  return date.toLocaleTimeString(undefined, {
    hour: "numeric",
    minute: "2-digit",
    second: "2-digit"
  });
}

function setStatus(message, isError = false) {
  els.formStatus.textContent = message;
  els.formStatus.style.color = isError ? "var(--red)" : "var(--muted)";
}

function setCandidateImportStatus(message, isError = false) {
  els.candidateOddsImportStatus.textContent = message;
  els.candidateOddsImportStatus.style.color = isError ? "var(--red)" : "var(--muted)";
}

function setScreenshotIntakeStatus(message, isError = false) {
  els.screenshotIntakeStatus.textContent = message;
  els.screenshotIntakeStatus.style.color = isError ? "var(--red)" : "var(--muted)";
}

function hasMissingOdds(value) {
  if (Array.isArray(value)) {
    return value.some(hasMissingOdds);
  }

  if (!value || typeof value !== "object") {
    return false;
  }

  if (Object.prototype.hasOwnProperty.call(value, "marketOdds") && value.marketOdds === null) {
    return true;
  }

  return Object.values(value).some(hasMissingOdds);
}

function ticketLegs(ticket) {
  return Array.isArray(ticket?.legs) ? ticket.legs : ticket?.marketOdds !== undefined ? [ticket] : [];
}

function validateTicketPreflight(ticket) {
  const settings = getBankrollSettings();
  const policy = riskModePolicy(settings.riskMode);
  const findings = [];
  const bankroll = Number(ticket?.bankroll ?? settings.bankroll);
  const legs = ticketLegs(ticket);

  if (!ticket || typeof ticket !== "object") {
    findings.push({ severity: "blocker", code: "INVALID_TICKET", message: "Ticket must be a JSON object." });
    return { status: "blocked", findings, legs: 0, bankroll: null };
  }

  if (!Number.isFinite(bankroll) || bankroll <= 0) {
    findings.push({ severity: "blocker", code: "INVALID_BANKROLL", message: "Ticket bankroll must be a positive number." });
  }

  if (hasMissingOdds(ticket)) {
    findings.push({ severity: "blocker", code: "MISSING_ODDS", message: "Every leg needs real sportsbook marketOdds before evaluation." });
  }

  if (legs.length === 0) {
    findings.push({ severity: "blocker", code: "NO_LEGS", message: "Ticket needs at least one priced market or leg." });
  }

  if (Array.isArray(ticket?.legs)) {
    if (legs.length < 2) {
      findings.push({ severity: "blocker", code: "PARLAY_TOO_SHORT", message: "A parlay ticket needs at least 2 legs." });
    }

    if (legs.length > 3) {
      findings.push({ severity: "blocker", code: "PARLAY_TOO_LONG", message: "Parlays are capped at 3 legs." });
    }

    const altPropLegs = legs.filter((leg) => leg.marketType === "alt-prop").length;

    if (altPropLegs > 2) {
      findings.push({ severity: "blocker", code: "ALT_PROP_CAP", message: "Parlays allow a maximum of 2 alt-prop legs." });
    }

    const correlationCounts = legs.reduce((counts, leg) => {
      const key = leg.correlationKey ?? `${leg.provider ?? "unknown"}:${leg.source?.gamePk ?? leg.source?.eventId ?? leg.source?.playerId ?? leg.id ?? "unknown"}`;
      counts.set(key, (counts.get(key) ?? 0) + 1);
      return counts;
    }, new Map());
    const correlatedKeys = Array.from(correlationCounts.entries())
      .filter(([, count]) => count > 1)
      .map(([key]) => key);

    if (correlatedKeys.length > 0) {
      findings.push({ severity: "blocker", code: "CORRELATION_RISK", message: `Correlated parlay legs detected: ${correlatedKeys.join(", ")}.` });
    }
  }

  if (settings.sportsbookMinimum > settings.bankroll * policy.maxSingleFraction) {
    findings.push({ severity: "warning", code: "BOOK_MIN_TOO_HIGH", message: "Sportsbook minimum is above the selected max single size. Treat most possible bets as PASS." });
  } else if (settings.sportsbookMinimum > settings.bankroll * policy.singleUnitFraction) {
    findings.push({ severity: "warning", code: "BOOK_MIN_PRESSURE", message: "Sportsbook minimum is larger than one selected unit. Only evaluate clearly priced edges." });
  }

  const pricedLegs = legs.filter((leg) => typeof leg.marketOdds === "number" && Number.isFinite(leg.marketOdds)).length;
  const blockers = findings.filter((finding) => finding.severity === "blocker").length;
  const warnings = findings.filter((finding) => finding.severity === "warning").length;

  return {
    status: blockers > 0 ? "blocked" : warnings > 0 ? "warning" : "ready",
    findings,
    legs: legs.length,
    pricedLegs,
    bankroll
  };
}

function renderTicketPreflightFromText() {
  if (!els.ticketPreflightBoard) {
    return;
  }

  const text = els.ticketInput.value.trim();

  if (!text) {
    els.ticketPreflightBoard.innerHTML = '<p class="muted">Ticket preflight will appear here when JSON is loaded.</p>';
    return;
  }

  let ticket;

  try {
    ticket = JSON.parse(text);
  } catch (error) {
    els.ticketPreflightBoard.innerHTML = `
      <div class="preflight-head">
        <strong>Ticket Preflight</strong>
        <span class="tag high">invalid json</span>
      </div>
      <p class="preflight-finding blocker">${escapeHtml(error.message)}</p>
    `;
    return;
  }

  const preflight = validateTicketPreflight(ticket);
  const tagClass = preflight.status === "ready" ? "ok" : preflight.status === "warning" ? "medium" : "high";

  els.ticketPreflightBoard.innerHTML = `
    <div class="preflight-head">
      <strong>Ticket Preflight</strong>
      <span class="tag ${tagClass}">${escapeHtml(preflight.status)}</span>
    </div>
    <div class="preflight-grid">
      ${[
        ["Legs", preflight.legs],
        ["Priced", preflight.pricedLegs],
        ["Bankroll", formatMoney(preflight.bankroll)],
        ["Book min", formatMoney(getBankrollSettings().sportsbookMinimum)]
      ]
        .map(([label, value]) => `<div><span>${escapeHtml(label)}</span><strong>${escapeHtml(value)}</strong></div>`)
        .join("")}
    </div>
    ${
      preflight.findings.length > 0
        ? `<div class="preflight-findings">${preflight.findings
            .map((finding) => `<p class="preflight-finding ${escapeHtml(finding.severity)}"><strong>${escapeHtml(finding.code)}</strong>: ${escapeHtml(finding.message)}</p>`)
            .join("")}</div>`
        : '<p class="sources">Preflight clear. Final engine gates still decide BET/PASS/WAIT.</p>'
    }
  `;
}

function setTicketInputValue(value) {
  els.ticketInput.value = typeof value === "string" ? value : JSON.stringify(value, null, 2);
  renderTicketPreflightFromText();
}

function riskFlagsFromResult(result) {
  const flags = Array.isArray(result?.riskFlags) ? [...result.riskFlags] : [];

  if (Array.isArray(result?.legs)) {
    for (const leg of result.legs) {
      if (Array.isArray(leg.riskFlags)) {
        flags.push(...leg.riskFlags);
      }
    }
  }

  const seen = new Set();

  return flags.filter((flag) => {
    const code = flag?.code ?? "UNKNOWN";

    if (seen.has(code)) {
      return false;
    }

    seen.add(code);
    return true;
  });
}

function sourceTimestampsFromResult(result) {
  const sources = Array.isArray(result?.researchPacket?.sources) ? result.researchPacket.sources : [];

  return sources
    .map((source) => source.fetchedAt)
    .filter(Boolean);
}

function staleStatusFromResult(result) {
  const flags = riskFlagsFromResult(result);

  if (flags.some((flag) => String(flag.code).includes("STALE"))) {
    return "stale";
  }

  const sources = Array.isArray(result?.researchPacket?.sources) ? result.researchPacket.sources : [];

  if (sources.some((source) => source?.cache?.stale === true)) {
    return "stale";
  }

  return sources.length > 0 ? "fresh" : "not tracked";
}

function metricFromResult(result) {
  return {
    verdict: result?.verdict ?? "UNKNOWN",
    selection: result?.selection ?? result?.decisionLog?.selection ?? "",
    timestamp: result?.decisionLog?.timestamp ?? new Date().toISOString(),
    ev: result?.expectedValue?.roi ?? result?.decisionLog?.metrics?.expectedValueRoi ?? null,
    kelly: result?.kelly?.fraction ?? result?.decisionLog?.metrics?.rawKellyFraction ?? null,
    stake:
      result?.stakeRecommendation?.recommendedStake ??
      result?.decisionLog?.stakeRecommendation?.recommendedStake ??
      result?.decisionLog?.metrics?.recommendedStake ??
      null,
    odds: result?.combined?.americanOdds ?? result?.marketOdds ?? result?.decisionLog?.inputs?.marketOdds ?? null,
    kind: result?.kind ?? result?.decisionLog?.kind ?? "single",
    marketType: result?.marketType ?? result?.decisionLog?.inputs?.marketType ?? (result?.kind === "parlay" ? "parlay" : "straight"),
    riskFlags: riskFlagsFromResult(result),
    staleDataStatus: staleStatusFromResult(result),
    sourceTimestamps: sourceTimestampsFromResult(result)
  };
}

function renderRiskFlags(flags) {
  if (!Array.isArray(flags) || flags.length === 0) {
    return '<span class="muted">None</span>';
  }

  return `<div class="tag-row">${flags
    .map((flag) => `<span class="tag ${escapeHtml(flag.severity)}">${escapeHtml(flag.code)}</span>`)
    .join("")}</div>`;
}

function providerStatusClass(status) {
  if (status === "ok") {
    return "ok";
  }

  if (status === "degraded") {
    return "medium";
  }

  return "high";
}

function renderSourceSummary(summary) {
  const entries = Object.entries(summary ?? {}).filter(([, value]) => value !== null && value !== undefined);

  if (entries.length === 0) {
    return '<p class="muted">No summary fields returned.</p>';
  }

  return `
    <div class="source-summary">
      ${entries
        .filter(([key]) => key !== "articles" && key !== "bySport")
        .map(([key, value]) => `<div><span>${escapeHtml(key)}</span><strong>${escapeHtml(value)}</strong></div>`)
        .join("")}
    </div>
    ${
      summary.bySport
        ? `<p class="sources">By sport: ${Object.entries(summary.bySport)
            .map(([sport, count]) => `${sport.toUpperCase()} ${count}`)
            .join(", ")}</p>`
        : ""
    }
    ${
      Array.isArray(summary.articles) && summary.articles.length > 0
        ? `<ul class="source-links">${summary.articles
            .slice(0, 3)
            .map((article) =>
              article.url
                ? `<li><a href="${escapeHtml(article.url)}" target="_blank" rel="noreferrer">${escapeHtml(article.title ?? article.url)}</a></li>`
                : `<li>${escapeHtml(article.title ?? "Untitled")}</li>`
            )
            .join("")}</ul>`
        : ""
    }
  `;
}

function renderSourceStatus(payload) {
  window.__bearEdgeSourceStatus = payload;
  const providers = Array.isArray(payload?.providers) ? payload.providers : [];
  els.sourceStatusTimestamp.textContent = `Checked ${formatDate(payload?.fetchedAt)}`;

  if (providers.length === 0) {
    els.sourceStatusBoard.innerHTML = '<p class="muted">No source checks returned.</p>';
    renderOperatorBoards();
    return;
  }

  els.sourceStatusBoard.innerHTML = providers
    .map((provider) => {
      const sources = Array.isArray(provider.sources) ? provider.sources : [];
      const warnings = Array.isArray(provider.warnings) ? provider.warnings : [];

      return `
        <article class="source-card">
          <header>
            <div>
              <h3>${escapeHtml(provider.provider)}</h3>
              <p class="sources">${escapeHtml(provider.sourceType)} / ${escapeHtml(shortTimestamp(provider.fetchedAt))}</p>
            </div>
            <span class="tag ${providerStatusClass(provider.status)}">${escapeHtml(provider.status)}</span>
          </header>
          ${renderSourceSummary(provider.summary)}
          <p class="sources">Sources checked: ${sources.length}</p>
          ${
            sources.length > 0
              ? `<ul class="source-links">${sources
                  .slice(0, 4)
                  .map(
                    (source) =>
                      `<li><a href="${escapeHtml(source.sourceUrl)}" target="_blank" rel="noreferrer">${escapeHtml(source.name ?? "source")}</a>${
                        typeof source.count === "number" ? ` <span class="muted">(${source.count})</span>` : ""
                      }${source.status ? ` <span class="muted">HTTP ${escapeHtml(source.status)}</span>` : ""}</li>`
                  )
                  .join("")}</ul>`
              : ""
          }
          ${
            warnings.length > 0
              ? `<div class="warning-list">${warnings
                  .slice(0, 4)
                  .map((warning) => `<p>${escapeHtml(warning)}</p>`)
                  .join("")}</div>`
              : ""
          }
        </article>
      `;
    })
    .join("");
  renderOperatorBoards();
}

function renderBookPrices(prices) {
  if (!Array.isArray(prices) || prices.length === 0) {
    return '<p class="sources">No visible book prices parsed.</p>';
  }

  return `
    <div class="book-price-row">
      ${prices
        .slice(0, 6)
        .map(
          (price) => `
            <span class="book-price">
              <strong>${escapeHtml(price.sportsbook)}</strong>
              <b>${formatOdds(price.americanOdds)}</b>
              <em>${escapeHtml(price.label ?? "")}</em>
              <small>${formatPercent(price.impliedProbability)} imp / ${formatMoney(price.payoutOn100Stake?.profit)} profit on $100</small>
            </span>
          `
        )
        .join("")}
    </div>
  `;
}

function edgeTierClass(edgeTier) {
  if (edgeTier === "bet_candidate") {
    return "ok";
  }

  if (edgeTier === "lean") {
    return "medium";
  }

  if (edgeTier === "pass") {
    return "high";
  }

  return "medium";
}

function edgeTierLabel(edgeTier) {
  if (edgeTier === "bet_candidate") {
    return "bet candidate";
  }

  if (edgeTier === "lean") {
    return "lean";
  }

  if (edgeTier === "pass") {
    return "pass";
  }

  return "priced";
}

function renderOnlineOpportunities(payload) {
  const opportunities = Array.isArray(payload?.opportunities) ? payload.opportunities : [];
  const sources = Array.isArray(payload?.sources) ? payload.sources : [];
  const warnings = Array.isArray(payload?.warnings) ? payload.warnings : [];
  const summary = payload?.summary ?? {};
  const priced = opportunities
    .filter((entry) => entry.status === "priced_online")
    .sort((left, right) => (right.evPercent ?? -Infinity) - (left.evPercent ?? -Infinity))
    .slice(0, 24);
  const marketFamilies = opportunities.filter((entry) => entry.status === "odds_needed").slice(0, 18);

  els.onlineOpportunitiesTimestamp.textContent = `Checked ${formatDate(payload?.fetchedAt)}`;
  els.onlineOpportunitiesBoard.innerHTML = `
    <div class="snapshot-summary">
      ${[
        ["Games", summary.games ?? 0],
        ["MLB", summary.mlbGames ?? 0],
        ["World Cup", summary.worldCupGames ?? 0],
        ["Priced", summary.pricedOpportunities ?? 0],
        ["Need Odds", summary.oddsNeededOpportunities ?? 0],
        ["Sources", summary.sources ?? 0]
      ]
        .map(([label, value]) => `<article class="metric compact"><span>${escapeHtml(label)}</span><strong>${escapeHtml(value)}</strong></article>`)
        .join("")}
    </div>
    ${
      sources.length > 0
        ? `<div class="online-source-strip">${sources
            .map(
              (source) => `
                <a href="${escapeHtml(source.sourceUrl)}" target="_blank" rel="noreferrer">
                  <strong>${escapeHtml(source.provider)}</strong>
                  <span>${escapeHtml(source.sport?.toUpperCase() ?? "")} / ${escapeHtml(source.sourceType)}</span>
                </a>
              `
            )
            .join("")}</div>`
        : ""
    }
    ${
      warnings.length > 0
        ? `<div class="warning-list">${warnings.slice(0, 6).map((warning) => `<p>${escapeHtml(warning)}</p>`).join("")}</div>`
        : ""
    }
    <section class="online-section">
      <div class="panel-title comparison-subtitle">
        <div>
          <h3>Visible Online Prices</h3>
          <p class="panel-subtitle">These rows came from a public odds/projection page and include book prices.</p>
        </div>
      </div>
      ${
        priced.length > 0
          ? `<div class="online-card-grid">${priced
              .map(
                (entry) => `
                  <article class="online-card priced">
                    <header>
                      <div>
                        <h3>${escapeHtml(entry.player ?? entry.participant ?? entry.matchup)}</h3>
                        <p class="sources">${escapeHtml(entry.marketLabel)} / ${escapeHtml(entry.matchup)}</p>
                      </div>
                      <span class="tag ${edgeTierClass(entry.edgeTier)}">${edgeTierLabel(entry.edgeTier)}</span>
                    </header>
                    <div class="candidate-stats">
                      <div><span>Prediction</span><strong>${escapeHtml(entry.prediction ?? "-")}</strong></div>
                      <div><span>Projection</span><strong>${typeof entry.projection === "number" ? entry.projection.toFixed(2) : "-"}</strong></div>
                      <div><span>Diff</span><strong>${typeof entry.difference === "number" ? entry.difference.toFixed(2) : "-"}</strong></div>
                      <div><span>EV</span><strong>${typeof entry.evPercent === "number" ? `${entry.evPercent.toFixed(2)}%` : "-"}</strong></div>
                      <div><span>Best</span><strong>${formatOdds(entry.bestPrice?.americanOdds)}</strong></div>
                      <div><span>Book</span><strong>${escapeHtml(entry.bestPrice?.sportsbook ?? "-")}</strong></div>
                      <div><span>Best Imp.</span><strong>${formatPercent(entry.bestPrice?.impliedProbability)}</strong></div>
                      <div><span>$100 Profit</span><strong>${formatMoney(entry.bestPrice?.payoutOn100Stake?.profit)}</strong></div>
                      <div><span>DraftKings</span><strong>${formatOdds(entry.draftKingsPrice?.americanOdds)}</strong></div>
                      <div><span>DK Gap</span><strong>${formatSignedMoney(entry.bestVsDraftKings?.profitOn100Delta)}</strong></div>
                    </div>
                    ${renderBookPrices(entry.bookPrices)}
                  </article>
                `
              )
              .join("")}</div>`
          : '<p class="muted">No visible priced opportunities came back from the online props source.</p>'
      }
    </section>
    <section class="online-section">
      <div class="panel-title comparison-subtitle">
        <div>
          <h3>Possible Market Families</h3>
          <p class="panel-subtitle">These are available bet types for scheduled games, but they still need a verified current price.</p>
        </div>
      </div>
      ${
        marketFamilies.length > 0
          ? `<div class="online-card-grid">${marketFamilies
              .map(
                (entry) => `
                  <article class="online-card">
                    <header>
                      <div>
                        <h3>${escapeHtml(entry.marketLabel)}</h3>
                        <p class="sources">${escapeHtml(entry.sport.toUpperCase())} / ${escapeHtml(entry.matchup)}</p>
                      </div>
                      <span class="tag medium">odds needed</span>
                    </header>
                    <p>${escapeHtml((entry.selections ?? []).join(" / "))}</p>
                    <p class="sources">${escapeHtml(formatDate(entry.gameDate))}${entry.venue ? ` / ${escapeHtml(entry.venue)}` : ""}${entry.group ? ` / ${escapeHtml(entry.group)}` : ""}</p>
                  </article>
                `
              )
              .join("")}</div>`
          : '<p class="muted">No schedule-based market families returned.</p>'
      }
    </section>
  `;
}

async function loadOnlineOpportunities() {
  const sports = els.onlineOpportunitiesSportsSelect.value || "mlb,worldcup";

  els.onlineOpportunitiesBoard.innerHTML = '<p class="muted auto-update-empty">Checking online opportunities...</p>';

  try {
    const response = await fetch(`/api/online-opportunities?sports=${encodeURIComponent(sports)}&date=today&days=2&maxProps=200`);
    const payload = await response.json();

    if (!response.ok) {
      throw new Error(payload.error ?? "Unable to load online opportunities.");
    }

    renderOnlineOpportunities(payload);
  } catch (error) {
    els.onlineOpportunitiesBoard.innerHTML = `<p class="muted auto-update-empty">${escapeHtml(error.message)}</p>`;
    els.onlineOpportunitiesTimestamp.textContent = "Online check failed";
  }
}

function formatDurationMs(value) {
  if (typeof value !== "number" || !Number.isFinite(value)) {
    return "-";
  }

  if (value < 1000) {
    return `${Math.round(value)}ms`;
  }

  return `${(value / 1000).toFixed(1)}s`;
}

function renderAutoUpdateStatus(payload, history = null, snapshotPayload = null) {
  window.__bearEdgeAutoUpdate = payload;
  const result = payload?.lastResult ?? null;
  const historyRecords = Array.isArray(history?.records) ? history.records : [];
  const snapshot = snapshotPayload?.snapshot ?? null;
  const providers = Array.isArray(result?.sourceStatus?.providers) ? result.sourceStatus.providers : [];
  const providerSummary = providers.length > 0
    ? providers.map((provider) => `${provider.provider}: ${provider.status}`).join(" / ")
    : "No provider snapshot yet.";

  els.autoUpdateTimestamp.textContent = payload?.lastRunFinishedAt
    ? `Last ${formatDate(payload.lastRunFinishedAt)}`
    : payload?.enabled === false
      ? "Disabled"
      : "Waiting for first run";

  els.autoUpdateBoard.innerHTML = `
    <div class="auto-update-grid">
      ${[
        ["Enabled", payload?.enabled === false ? "No" : "Yes"],
        ["Started", payload?.started ? "Yes" : "No"],
        ["Running", payload?.running ? "Yes" : "No"],
        ["Runs", payload?.runCount ?? 0],
        ["Failures", payload?.failureCount ?? 0],
        ["Interval", formatDurationMs(payload?.intervalMs)],
        ["Last Duration", formatDurationMs(payload?.lastRunDurationMs)],
        ["Next Run", payload?.nextRunAt ? formatDate(payload.nextRunAt) : "-"]
      ]
        .map(([label, value]) => `<article class="metric compact"><span>${escapeHtml(label)}</span><strong>${escapeHtml(value)}</strong></article>`)
        .join("")}
    </div>
    ${
      payload?.lastError
        ? `<div class="warning-list"><p>${escapeHtml(payload.lastError)}</p></div>`
        : ""
    }
    ${
      result
        ? `<div class="auto-update-detail">
            <article>
              <h3>Sources</h3>
              <p>${escapeHtml(providerSummary)}</p>
              <p class="sources">Dates: ${escapeHtml((result.sourceStatus?.dates ?? []).join(", "))}</p>
              ${
                Array.isArray(result.sourceStatus?.blockedProviders) && result.sourceStatus.blockedProviders.length > 0
                  ? `<p class="sources">Blocked: ${escapeHtml(result.sourceStatus.blockedProviders.join(", "))}</p>`
                  : ""
              }
            </article>
            <article>
              <h3>Games</h3>
              <p>${escapeHtml(result.games?.gameCount ?? 0)} games / ${escapeHtml(result.games?.totals?.scheduled ?? 0)} scheduled / ${escapeHtml(result.games?.totals?.inProgress ?? 0)} live / ${escapeHtml(result.games?.totals?.final ?? 0)} final</p>
              <p class="sources">Sports: ${escapeHtml((result.games?.sports ?? []).join(", "))}</p>
            </article>
            <article>
              <h3>Candidates</h3>
              <p>${escapeHtml(result.candidates?.candidateCount ?? 0)} research drafts / ${escapeHtml(result.candidates?.skippedCount ?? 0)} skipped</p>
              <p class="sources">Odds still require verified market input.</p>
            </article>
            <article>
              <h3>Log</h3>
              <p>${escapeHtml(result.decisionLog?.totalEvaluations ?? 0)} evaluations / ${escapeHtml(result.decisionLog?.betCalls ?? 0)} BET calls</p>
              <p class="sources">3-win gate: ${escapeHtml(result.decisionLog?.validationGate?.currentWinStreak ?? 0)}/${escapeHtml(result.decisionLog?.validationGate?.requiredWinStreak ?? 3)}</p>
            </article>
            <article>
              <h3>Data Cache</h3>
              <p>${snapshot ? "Full stats snapshot saved" : "No full stats snapshot yet"}</p>
              <p class="sources">${escapeHtml(snapshotPayload?.snapshotPath ?? result.snapshot?.path ?? "data/cache/auto_update_snapshot.json")}</p>
              ${
                snapshot
                  ? `<p class="sources">${escapeHtml(snapshot.games?.games?.length ?? 0)} cached games / ${escapeHtml(snapshot.candidates?.candidates?.length ?? 0)} cached candidates</p>`
                  : ""
              }
            </article>
          </div>`
        : '<p class="muted auto-update-empty">No completed auto-update run yet.</p>'
    }
    ${
      historyRecords.length > 0
        ? `<section class="auto-update-history">
            <h3>Recent Auto-Update Runs</h3>
            <div class="history-run-grid">
              ${historyRecords
                .slice(0, 8)
                .map(
                  (record) => `
                    <article class="history-run-card">
                      <header>
                        <strong>${escapeHtml(record.status ?? "unknown")}</strong>
                        <span class="sources">${escapeHtml(formatDate(record.finishedAt))}</span>
                      </header>
                      <p>${escapeHtml(record.reason ?? "unknown")} / ${escapeHtml(formatDurationMs(record.durationMs))}</p>
                      <p class="sources">
                        ${escapeHtml(record.result?.games?.gameCount ?? 0)} games,
                        ${escapeHtml(record.result?.candidates?.candidateCount ?? 0)} candidates,
                        ${(record.result?.sourceStatus?.blockedProviders ?? []).length > 0
                          ? `blocked: ${escapeHtml(record.result.sourceStatus.blockedProviders.join(", "))}`
                          : "no blocked providers"}
                      </p>
                    </article>
                  `
                )
                .join("")}
            </div>
            <p class="sources">Persisted at ${escapeHtml(history.logPath ?? "auto_update_log.jsonl")}</p>
          </section>`
        : '<p class="muted auto-update-empty">No persisted auto-update history yet.</p>'
    }
  `;
  renderOperatorBoards();
}

async function loadAutoUpdateStatus() {
  els.autoUpdateBoard.innerHTML = '<p class="muted auto-update-empty">Loading auto-update status...</p>';

  try {
    const [statusResponse, historyResponse, snapshotResponse] = await Promise.all([
      fetch("/api/auto-update"),
      fetch("/api/auto-update/history?limit=8"),
      fetch("/api/auto-update/snapshot")
    ]);
    const payload = await statusResponse.json();
    const history = await historyResponse.json();
    const snapshot = await snapshotResponse.json();

    if (!statusResponse.ok) {
      throw new Error(payload.error ?? "Unable to load auto-update status.");
    }

    if (!historyResponse.ok) {
      throw new Error(history.error ?? "Unable to load auto-update history.");
    }

    renderAutoUpdateStatus(payload, history, snapshotResponse.ok ? snapshot : null);
  } catch (error) {
    els.autoUpdateBoard.innerHTML = `<p class="muted auto-update-empty">${escapeHtml(error.message)}</p>`;
    els.autoUpdateTimestamp.textContent = "Auto-update check failed";
  }
}

function auditBadge(label, ok) {
  const className = ok ? "tag ok" : "tag high";
  const text = ok ? "OK" : "BLOCKED";

  return `<span class="${className}">${escapeHtml(label)} ${text}</span>`;
}

function renderSystemAudit(payload) {
  const readiness = payload?.readiness ?? {};
  const commands = Array.isArray(payload?.commands) ? payload.commands : [];
  const paths = Array.isArray(payload?.paths) ? payload.paths : [];
  const keys = Array.isArray(payload?.environment?.keys) ? payload.environment.keys : [];
  const warnings = Array.isArray(payload?.warnings) ? payload.warnings : [];
  const nextActions = Array.isArray(payload?.nextActions) ? payload.nextActions : [];
  const keyText = keys
    .map((key) => `${key.name}: ${key.configured ? "set" : "missing"}`)
    .join(" / ");

  els.systemAuditTimestamp.textContent = payload?.generatedAt ? `Checked ${shortTimestamp(payload.generatedAt)}` : "Checked";
  els.systemAuditBoard.innerHTML = `
    <div class="system-audit-badges">
      ${auditBadge("Files", readiness.localFilesOk)}
      ${auditBadge("Node", readiness.nodeAvailable)}
      ${auditBadge("npm", readiness.npmAvailable)}
      ${auditBadge("Git", readiness.gitAvailable)}
      ${auditBadge("GitHub", readiness.githubReady)}
      ${auditBadge("Odds API", readiness.sportsbookOddsReady)}
      ${auditBadge("Tennis", readiness.tennisReady)}
    </div>
    <div class="auto-update-detail">
      <article>
        <h3>Runtime</h3>
        <p>${escapeHtml(payload?.process?.node ?? "-")} / ${escapeHtml(payload?.process?.platform ?? "-")}</p>
        <p class="sources">${escapeHtml(payload?.process?.execPath ?? "-")}</p>
      </article>
      <article>
        <h3>Project</h3>
        <p>${escapeHtml(payload?.package?.name ?? "-")} ${escapeHtml(payload?.package?.version ?? "")}</p>
        <p class="sources">${escapeHtml(payload?.rootDir ?? "-")}</p>
      </article>
      <article>
        <h3>Git</h3>
        <p>${escapeHtml(payload?.git?.branch ?? "no branch")} / ${escapeHtml(payload?.git?.uncommittedEntries ?? 0)} status entries</p>
        <p class="sources">${payload?.git?.hasRemote ? escapeHtml(payload.git.remotes.join(" / ")) : "No remote configured"}</p>
      </article>
      <article>
        <h3>Provider Keys</h3>
        <p>${escapeHtml(keyText || "No key status available")}</p>
        <p class="sources">Values are never displayed.</p>
      </article>
    </div>
    <div class="system-audit-grid">
      <article>
        <h3>Commands</h3>
        ${commands
          .map((command) => `
            <p><strong>${escapeHtml(command.command)}</strong>: ${escapeHtml(command.available ? command.version ?? command.path : command.error ?? "missing")}</p>
          `)
          .join("")}
      </article>
      <article>
        <h3>Files</h3>
        ${paths
          .map((entry) => `
            <p><strong>${escapeHtml(entry.label)}</strong>: ${escapeHtml(entry.exists ? entry.type : "missing")}</p>
          `)
          .join("")}
      </article>
    </div>
    ${
      nextActions.length > 0
        ? `<section class="system-action-list">
            <h3>Operational Next Actions</h3>
            ${nextActions
              .map((item) => `
                <p><strong>${escapeHtml(item.area)}</strong> <span class="tag medium">${escapeHtml(item.status)}</span> ${escapeHtml(item.action)}</p>
              `)
              .join("")}
          </section>`
        : ""
    }
    ${
      warnings.length > 0
        ? `<div class="warning-list">${warnings.map((warning) => `<p>${escapeHtml(warning)}</p>`).join("")}</div>`
        : ""
    }
  `;
}

async function loadSystemAudit() {
  els.systemAuditBoard.innerHTML = '<p class="muted auto-update-empty">Checking local app system state...</p>';

  try {
    const response = await fetch("/api/system-audit");
    const payload = await response.json();

    if (!response.ok) {
      throw new Error(payload.error ?? "Unable to load system audit.");
    }

    renderSystemAudit(payload);
  } catch (error) {
    els.systemAuditBoard.innerHTML = `<p class="muted auto-update-empty">${escapeHtml(error.message)}</p>`;
    els.systemAuditTimestamp.textContent = "Audit failed";
  }
}

function releaseStatusClass(status) {
  if (status === "ready") {
    return "ok";
  }

  if (status === "shippable-with-warnings" || status === "needs-work" || status === "needs-evidence" || status === "ready-with-evidence-gates") {
    return "medium";
  }

  return "high";
}

function renderReleaseReadiness(payload) {
  const checks = Array.isArray(payload?.checks) ? payload.checks : [];
  const lanes = Array.isArray(payload?.lanes) ? payload.lanes : [];
  const nextActions = Array.isArray(payload?.nextActions) ? payload.nextActions : [];
  const evidenceGates = Array.isArray(payload?.evidenceGates) ? payload.evidenceGates : [];
  const importantChecks = checks
    .filter((entry) => entry.status !== "pass")
    .concat(checks.filter((entry) => entry.status === "pass").slice(0, 5));
  const summary = payload?.summary ?? {};
  const formatDetail = (detail) => {
    if (Array.isArray(detail)) {
      return detail.join(" / ");
    }

    if (detail && typeof detail === "object") {
      return JSON.stringify(detail);
    }

    return detail ?? "";
  };

  els.releaseReadinessTimestamp.textContent = payload?.generatedAt
    ? `Checked ${shortTimestamp(payload.generatedAt)}`
    : "Checked";

  els.releaseReadinessBoard.innerHTML = `
    <div class="release-hero edge-${releaseStatusClass(payload?.status)}">
      <div>
        <h3>${escapeHtml(payload?.status ?? "unknown")}</h3>
        <p>${escapeHtml(payload?.package?.name ?? "package")} ${escapeHtml(payload?.package?.version ?? "")} / ${escapeHtml(payload?.git?.branch ?? "no branch")} / ${escapeHtml(payload?.git?.upstream ?? "no upstream")}</p>
      </div>
      <strong>${escapeHtml(summary.score ?? 0)}/100</strong>
    </div>
    <div class="release-summary-grid">
      ${[
        ["Passed", summary.passed ?? 0],
        ["Warnings", summary.warnings ?? 0],
        ["Failed", summary.failed ?? 0],
        ["Info gates", summary.info ?? 0],
        ["Tracked files", payload?.trackedFiles?.count ?? 0],
        ["BET calls", payload?.decisionLog?.betCalls ?? 0],
        ["3-win gate", payload?.decisionLog?.validationGate?.complete ? "complete" : `${payload?.decisionLog?.validationGate?.currentWinStreak ?? 0}/${payload?.decisionLog?.validationGate?.requiredWinStreak ?? 3}`]
      ]
        .map(([label, value]) => `<article class="metric compact"><span>${escapeHtml(label)}</span><strong>${escapeHtml(value)}</strong></article>`)
        .join("")}
    </div>
    ${lanes.length > 0
      ? `<div class="release-lane-grid">
          ${lanes
            .map((lane) => `
              <article class="release-lane edge-${releaseStatusClass(lane.status)}">
                <span>${escapeHtml(lane.label)}</span>
                <strong>${escapeHtml(lane.status)}</strong>
                <p>${escapeHtml(lane.description ?? "")}</p>
                <small>${escapeHtml(lane.summary?.score ?? 0)}/100 / ${escapeHtml(lane.summary?.warnings ?? 0)} warnings / ${escapeHtml(lane.summary?.failed ?? 0)} failed</small>
              </article>
            `)
            .join("")}
        </div>`
      : ""}
    ${evidenceGates.length > 0
      ? `<div class="release-evidence">
          <h3>Evidence Gates</h3>
          <p>These are betting-proof and licensed-data gates. They stay visible, but they do not count as local software-release failures.</p>
          <div class="release-evidence-grid">
            ${evidenceGates
              .map((gate) => `
                <article class="${gate.complete ? "complete" : "incomplete"}">
                  <span class="tag ${gate.complete ? "ok" : "medium"}">${gate.complete ? "complete" : "needed"}</span>
                  <strong>${escapeHtml(gate.label)}</strong>
                  <small>${escapeHtml(gate.status)}${gate.current !== undefined ? ` / ${escapeHtml(gate.current)}/${escapeHtml(gate.required)}` : ""}</small>
                  <p>${escapeHtml(gate.action)}</p>
                </article>
              `)
              .join("")}
          </div>
        </div>`
      : ""}
    ${nextActions.length > 0
      ? `<div class="release-actions">
          <h3>Next Actions</h3>
          ${nextActions
            .slice(0, 6)
            .map((entry) => `
              <article>
                <span class="tag ${entry.status === "fail" ? "high" : entry.status === "info" ? "low" : "medium"}">${escapeHtml(entry.status)}</span>
                <div>
                  <strong>${escapeHtml(entry.area)}: ${escapeHtml(entry.check)}</strong>
                  <p>${escapeHtml(entry.action)}</p>
                </div>
              </article>
            `)
            .join("")}
        </div>`
      : ""}
    <div class="release-check-list">
      ${importantChecks
        .map((entry) => `
          <article class="release-check ${escapeHtml(entry.status)}">
            <span class="tag ${entry.status === "pass" ? "ok" : entry.status === "warn" ? "medium" : entry.status === "info" ? "low" : "high"}">${escapeHtml(entry.status)}</span>
            <div>
              <strong>${escapeHtml(entry.area)}</strong>
              <p>${escapeHtml(entry.message)}</p>
              ${entry.detail ? `<p class="sources">${escapeHtml(formatDetail(entry.detail))}</p>` : ""}
            </div>
          </article>
        `)
        .join("")}
    </div>
  `;
}

async function loadReleaseReadiness() {
  els.releaseReadinessBoard.innerHTML = '<p class="muted auto-update-empty">Checking release readiness...</p>';

  try {
    const response = await fetch("/api/release-readiness");
    const payload = await response.json();

    if (!response.ok) {
      throw new Error(payload.error ?? "Unable to load release readiness.");
    }

    renderReleaseReadiness(payload);
  } catch (error) {
    els.releaseReadinessBoard.innerHTML = `<p class="muted auto-update-empty">${escapeHtml(error.message)}</p>`;
    els.releaseReadinessTimestamp.textContent = "Release check failed";
  }
}

function renderOddsKeyStatus(payload) {
  const verification = payload?.verification ?? null;
  const sample = Array.isArray(verification?.sample) ? verification.sample : [];
  const configuredText = payload?.configured ? `Configured via ${payload.envKey ?? payload.writableEnvKey ?? "environment"}` : "Missing";

  els.oddsKeyStatusBoard.innerHTML = `
    <div class="auto-update-detail odds-key-detail">
      <article>
        <h3>Provider</h3>
        <p>${escapeHtml(payload?.provider ?? "The Odds API")}</p>
        <p class="sources">${payload?.docsUrl ? `<a href="${escapeHtml(payload.docsUrl)}" target="_blank" rel="noreferrer">Provider docs</a>` : "Provider docs unavailable"}</p>
      </article>
      <article>
        <h3>Key Status</h3>
        <p>${escapeHtml(configuredText)}</p>
        <p class="sources">Secret returned: ${payload?.secretReturned ? "yes" : "no"}</p>
      </article>
      <article>
        <h3>Verification</h3>
        <p>${escapeHtml(verification?.status ?? "not checked")}</p>
        <p class="sources">${verification?.sports !== undefined ? `${verification.sports} sports returned by provider` : "Save or test a key to verify."}</p>
      </article>
    </div>
    ${
      sample.length > 0
        ? `<div class="source-summary odds-key-sample">
            ${sample
              .map((sport) => `<span>${escapeHtml(sport.key)}: ${escapeHtml(sport.title ?? "")}${sport.active === false ? " (inactive)" : ""}</span>`)
              .join("")}
          </div>`
        : ""
    }
  `;
}

async function loadOddsKeyStatus() {
  els.oddsKeyStatusBoard.innerHTML = '<p class="muted auto-update-empty">Checking odds key status...</p>';

  try {
    const response = await fetch("/api/settings/odds-key");
    const payload = await response.json();

    if (!response.ok) {
      throw new Error(payload.error ?? "Unable to load odds key status.");
    }

    renderOddsKeyStatus(payload);
  } catch (error) {
    els.oddsKeyStatusBoard.innerHTML = `<p class="muted auto-update-empty">${escapeHtml(error.message)}</p>`;
  }
}

async function saveOddsApiKey(event) {
  event.preventDefault();
  const apiKey = els.oddsApiKeyInput.value.trim();

  if (!apiKey) {
    els.oddsKeyStatus.textContent = "Paste the provider key into the local password field first.";
    els.oddsKeyStatus.classList.add("error");
    return;
  }

  els.oddsKeyStatus.textContent = "Verifying key with provider...";
  els.oddsKeyStatus.classList.remove("error");

  try {
    const response = await fetch("/api/settings/odds-key", {
      method: "POST",
      headers: {
        "content-type": "application/json"
      },
      body: JSON.stringify({ apiKey })
    });
    const payload = await response.json();

    if (!response.ok) {
      throw new Error(payload.verification?.message ?? payload.error ?? "Odds key verification failed.");
    }

    els.oddsApiKeyInput.value = "";
    renderOddsKeyStatus(payload);
    els.oddsKeyStatus.textContent = `Verified and saved. ${payload.verification?.sports ?? 0} sports returned.`;
    await Promise.all([loadSystemAudit(), loadProviderSetup(), loadSourceStatus("today"), loadAutoUpdateStatus()]);
  } catch (error) {
    els.oddsKeyStatus.textContent = error.message;
    els.oddsKeyStatus.classList.add("error");
  }
}

async function testSavedOddsApiKey() {
  els.oddsKeyTestButton.disabled = true;
  els.oddsKeyTestButton.textContent = "Testing...";
  els.oddsKeyStatus.textContent = "Testing saved key...";
  els.oddsKeyStatus.classList.remove("error");

  try {
    const response = await fetch("/api/settings/odds-key/test", {
      method: "POST"
    });
    const payload = await response.json();

    if (!response.ok) {
      throw new Error(payload.verification?.message ?? payload.error ?? "Saved odds key test failed.");
    }

    renderOddsKeyStatus(payload);
    els.oddsKeyStatus.textContent = `Saved key verified. ${payload.verification?.sports ?? 0} sports returned.`;
    await Promise.all([loadSystemAudit(), loadProviderSetup(), loadSourceStatus("today")]);
  } catch (error) {
    els.oddsKeyStatus.textContent = error.message;
    els.oddsKeyStatus.classList.add("error");
  } finally {
    els.oddsKeyTestButton.disabled = false;
    els.oddsKeyTestButton.textContent = "Test Saved Key";
  }
}

function setupStatusClass(status) {
  if (status === "configured") {
    return "ok";
  }

  if (status === "restart_needed") {
    return "medium";
  }

  return "high";
}

function setupStatusLabel(status) {
  if (status === "restart_needed") {
    return "restart needed";
  }

  return status ?? "unknown";
}

function renderProviderSetup(payload) {
  const providers = Array.isArray(payload?.providers) ? payload.providers : [];
  const summary = payload?.summary ?? {};

  els.providerSetupTimestamp.textContent = payload?.generatedAt
    ? `Checked ${formatDate(payload.generatedAt)}`
    : "Checked";

  if (providers.length === 0) {
    els.providerSetupBoard.innerHTML = '<p class="muted auto-update-empty">No provider requirements returned.</p>';
    return;
  }

  els.providerSetupBoard.innerHTML = `
    <div class="provider-summary">
      ${[
        ["Configured", summary.configured ?? 0],
        ["Blank slots", summary.blank ?? 0],
        ["Missing", summary.missing ?? 0],
        ["Restart needed", summary.savedButNeedsRestart ?? 0]
      ]
        .map(([label, value]) => `<article class="metric compact"><span>${escapeHtml(label)}</span><strong>${escapeHtml(value)}</strong></article>`)
        .join("")}
    </div>
    <div class="provider-card-grid">
      ${providers
        .map((provider) => {
          const keySummary = (provider.keyStatuses ?? [])
            .map((key) => {
              const state = key.configured
                ? "active"
                : key.savedLocally
                  ? "saved"
                  : key.blankInLocalFile
                    ? "blank"
                    : "missing";
              return `${key.name}: ${state}`;
            })
            .join(" / ");
          const links = [
            provider.signupUrl ? `<a href="${escapeHtml(provider.signupUrl)}" target="_blank" rel="noreferrer">Get key</a>` : "",
            provider.docsUrl ? `<a href="${escapeHtml(provider.docsUrl)}" target="_blank" rel="noreferrer">Docs</a>` : ""
          ].filter(Boolean).join(" ");
          const envKeyOptions = (provider.envKeys ?? [provider.writableEnvKey])
            .filter(Boolean)
            .map((envKey) => `<option value="${escapeHtml(envKey)}" ${envKey === provider.writableEnvKey ? "selected" : ""}>${escapeHtml(envKey)}</option>`)
            .join("");

          return `
            <article class="provider-card">
              <header>
                <div>
                  <h3>${escapeHtml(provider.name)}</h3>
                  <p class="sources">${escapeHtml(provider.tier)} / ${escapeHtml(keySummary || "no key required")}</p>
                </div>
                <span class="tag ${setupStatusClass(provider.status)}">${escapeHtml(setupStatusLabel(provider.status))}</span>
              </header>
              <ul>
                ${(provider.unlocks ?? []).slice(0, 4).map((item) => `<li>${escapeHtml(item)}</li>`).join("")}
              </ul>
              <form class="provider-key-form" data-provider-id="${escapeHtml(provider.id)}">
                <label>
                  <span>Env key</span>
                  <select name="envKey" aria-label="${escapeHtml(provider.name)} environment key">${envKeyOptions}</select>
                </label>
                <label>
                  <span>API key</span>
                  <input name="apiKey" type="password" autocomplete="off" placeholder="Paste key locally">
                </label>
                <button type="submit">Save Key</button>
                <p class="provider-key-status sources" role="status"></p>
              </form>
              ${provider.noKeyAlternative ? `<p class="sources">${escapeHtml(provider.noKeyAlternative)}</p>` : ""}
              <p class="sources">${links}</p>
            </article>
          `;
        })
        .join("")}
    </div>
    <p class="sources">Secrets are never displayed. If a key was manually edited into .env.local while the app was running, restart Bear Edge or save it through the dashboard.</p>
  `;
}

async function loadProviderSetup() {
  els.providerSetupBoard.innerHTML = '<p class="muted auto-update-empty">Checking provider setup...</p>';

  try {
    const response = await fetch("/api/provider-requirements");
    const payload = await response.json();

    if (!response.ok) {
      throw new Error(payload.error ?? "Unable to load provider setup.");
    }

    renderProviderSetup(payload);
  } catch (error) {
    els.providerSetupBoard.innerHTML = `<p class="muted auto-update-empty">${escapeHtml(error.message)}</p>`;
    els.providerSetupTimestamp.textContent = "Provider check failed";
  }
}

async function saveProviderKey(event) {
  const form = event.target.closest(".provider-key-form");

  if (!form) {
    return;
  }

  event.preventDefault();
  const status = form.querySelector(".provider-key-status");
  const button = form.querySelector("button[type='submit']");
  const apiKeyInput = form.querySelector("input[name='apiKey']");
  const envKeyInput = form.querySelector("select[name='envKey']");
  const apiKey = apiKeyInput?.value.trim() ?? "";

  if (!apiKey) {
    status.textContent = "Paste a real provider key first.";
    status.classList.add("error");
    return;
  }

  button.disabled = true;
  button.textContent = "Saving...";
  status.textContent = "Saving key locally...";
  status.classList.remove("error");

  try {
    const response = await fetch("/api/provider-requirements/key", {
      method: "POST",
      headers: {
        "content-type": "application/json"
      },
      body: JSON.stringify({
        providerId: form.dataset.providerId,
        envKey: envKeyInput?.value,
        apiKey
      })
    });
    const payload = await response.json();

    if (!response.ok) {
      throw new Error(payload.verification?.message ?? payload.error ?? "Provider key save failed.");
    }

    apiKeyInput.value = "";
    status.textContent = payload.verification?.status === "ok"
      ? `Saved and verified. ${payload.verification?.sports ?? 0} sports returned.`
      : `Saved locally as ${payload.envKey}. ${payload.verification?.message ?? "Restart is not required when saved through this page."}`;
    await Promise.all([loadProviderSetup(), loadSystemAudit(), loadSourceStatus("today"), loadOddsKeyStatus(), loadAutoUpdateStatus()]);
  } catch (error) {
    status.textContent = error.message;
    status.classList.add("error");
  } finally {
    button.disabled = false;
    button.textContent = "Save Key";
  }
}

async function runAutoUpdateNow() {
  els.autoUpdateRunButton.disabled = true;
  els.autoUpdateRunButton.textContent = "Running...";

  try {
    const response = await fetch("/api/auto-update/run", {
      method: "POST"
    });
    const payload = await response.json();

    if (!response.ok) {
      throw new Error(payload.error ?? "Auto-update run failed.");
    }

    await Promise.all([loadDashboard(), loadAutoUpdateStatus(), loadSystemAudit(), loadSourceStatus("today"), loadGames("today"), loadCandidates("today")]);
    setStatus("Auto-update run completed.");
  } catch (error) {
    setStatus(error.message, true);
    await loadAutoUpdateStatus();
  } finally {
    els.autoUpdateRunButton.disabled = false;
    els.autoUpdateRunButton.textContent = "Run Auto Update Now";
  }
}

function setSnapshotStatus(message, isError = false) {
  els.statMuseSnapshotStatus.textContent = message;
  els.statMuseSnapshotStatus.style.color = isError ? "var(--red)" : "var(--muted)";
}

function renderStatMuseSnapshot(payload) {
  const games = Array.isArray(payload?.games) ? payload.games : [];
  const musings = Array.isArray(payload?.musings) ? payload.musings : [];
  const warnings = Array.isArray(payload?.warnings) ? payload.warnings : [];
  const summary = payload?.summary ?? {};

  els.statMuseSnapshotResult.innerHTML = `
    <div class="snapshot-summary">
      ${[
        ["Games", summary.games ?? 0],
        ["Live", summary.liveGames ?? 0],
        ["Final", summary.finalGames ?? 0],
        ["Scheduled", summary.scheduledGames ?? 0],
        ["Displayed Odds", summary.displayedOdds ?? 0],
        ["Musings", summary.musings ?? 0]
      ]
        .map(([label, value]) => `<article class="metric compact"><span>${escapeHtml(label)}</span><strong>${escapeHtml(value)}</strong></article>`)
        .join("")}
    </div>
    ${
      warnings.length > 0
        ? `<div class="warning-list snapshot-warnings">${warnings.map((warning) => `<p>${escapeHtml(warning)}</p>`).join("")}</div>`
        : ""
    }
    ${
      games.length > 0
        ? `<div class="snapshot-games">${games
            .map(
              (game) => `
              <article class="snapshot-game">
                <strong>${escapeHtml(game.away.abbreviation)} ${game.away.score ?? ""} @ ${escapeHtml(game.home.abbreviation)} ${game.home.score ?? ""}</strong>
                <span>${escapeHtml(game.status ?? game.startTime ?? "unknown")}</span>
                ${
                  typeof game.displayedMoneylineOdds === "number"
                    ? `<span class="tag medium">${formatOdds(game.displayedMoneylineOdds)} side unverified</span>`
                    : '<span class="muted">no displayed odds</span>'
                }
                <p class="sources">${escapeHtml(game.away.name)} at ${escapeHtml(game.home.name)}</p>
              </article>
            `
            )
            .join("")}</div>`
        : '<p class="muted">No games parsed from this snapshot.</p>'
    }
    ${
      musings.length > 0
        ? `<div class="snapshot-musings">${musings
            .slice(0, 14)
            .map((musing) => `<article><p>${escapeHtml(musing.text)}</p></article>`)
            .join("")}</div>`
        : '<p class="muted">No StatMuse musings parsed from this snapshot.</p>'
    }
  `;
}

async function parseStatMuseSnapshot() {
  const text = els.statMuseSnapshotInput.value.trim();

  if (!text) {
    setSnapshotStatus("Paste StatMuse page text first.", true);
    return;
  }

  setSnapshotStatus("Parsing StatMuse snapshot...");

  try {
    const response = await fetch("/api/statmuse-snapshot", {
      method: "POST",
      headers: {
        "content-type": "application/json"
      },
      body: JSON.stringify({
        text,
        sourceUrl: "https://www.statmuse.com/",
        capturedAt: new Date().toISOString()
      })
    });
    const payload = await response.json();

    if (!response.ok) {
      throw new Error(payload.error ?? "Unable to parse StatMuse snapshot.");
    }

    renderStatMuseSnapshot(payload);
    setSnapshotStatus(`Parsed ${payload.summary.games} games and ${payload.summary.musings} StatMuse notes.`);
  } catch (error) {
    setSnapshotStatus(error.message, true);
  }
}

function setDraftKingsSnapshotStatus(message, isError = false) {
  els.draftKingsSnapshotStatus.textContent = message;
  els.draftKingsSnapshotStatus.style.color = isError ? "var(--red)" : "var(--muted)";
}

function setRecordingComparisonStatus(message, isError = false) {
  els.recordingComparisonStatus.textContent = message;
  els.recordingComparisonStatus.style.color = isError ? "var(--red)" : "var(--muted)";
}

function formatPercentPoints(value) {
  return typeof value === "number" && Number.isFinite(value) ? `${(value * 100).toFixed(2)} pts` : "-";
}

function formatUnits(value) {
  return typeof value === "number" && Number.isFinite(value) ? `${value.toFixed(2)}u` : "-";
}

function verdictTagClass(verdict) {
  if (verdict === "BET") {
    return "ok";
  }

  if (verdict === "PASS") {
    return "high";
  }

  if (verdict === "WAIT") {
    return "medium";
  }

  return "";
}

function comparisonRowsSorted(rows) {
  return [...rows].sort((left, right) => {
    const verdictRank = {
      BET: 0,
      WAIT: 1,
      PASS: 2,
      "": 3
    };
    const leftVerdict = verdictRank[left.app_verdict] ?? 9;
    const rightVerdict = verdictRank[right.app_verdict] ?? 9;

    if (leftVerdict !== rightVerdict) {
      return leftVerdict - rightVerdict;
    }

    const rightEdge = typeof right.app_price_edge_points === "number" ? right.app_price_edge_points : -Infinity;
    const leftEdge = typeof left.app_price_edge_points === "number" ? left.app_price_edge_points : -Infinity;
    return rightEdge - leftEdge;
  });
}

function comparisonRowByIndex(index) {
  return window.__bearEdgeComparisonRows[Number(index)] ?? null;
}

function renderComparisonCards(rows) {
  if (!Array.isArray(rows) || rows.length === 0) {
    return '<p class="muted">No matched rows returned.</p>';
  }

  return `
    <div class="comparison-grid">
      ${rows
        .map((row) => {
          const rowIndex = window.__bearEdgeComparisonRows.indexOf(row);

          return `
            <article class="comparison-card">
              <header>
                <div>
                  <h3>${escapeHtml(row.player_name)}</h3>
                  <p class="sources">${escapeHtml(row.display_prop)} / ${escapeHtml(row.current_board_status || "unmatched")}</p>
                </div>
                <span class="tag ${verdictTagClass(row.app_verdict)}">${escapeHtml(row.app_verdict || row.current_line_match_status)}</span>
              </header>
              <div class="candidate-stats">
                <div><span>Current</span><strong>${formatOdds(row.current_odds_american)}</strong></div>
                <div><span>Recorded</span><strong>${formatOdds(row.recording_odds_american)}</strong></div>
                <div><span>Edge</span><strong>${escapeHtml(formatPercentPoints(row.app_price_edge_points))}</strong></div>
                <div><span>EV ROI</span><strong>${formatPercent(row.app_expected_value_roi)}</strong></div>
                <div><span>Recent TB</span><strong>${typeof row.app_recent10_tb_per_game === "number" ? row.app_recent10_tb_per_game.toFixed(2) : "-"}</strong></div>
                <div><span>Live TB</span><strong>${typeof row.app_current_game_tb === "number" ? row.app_current_game_tb : "-"}</strong></div>
              </div>
              <p class="sources">${escapeHtml(row.matched_offer_summary)}</p>
              ${
                row.app_reasons
                  ? `<p class="sources">${escapeHtml(row.app_reasons)}</p>`
                  : ""
              }
              <footer class="comparison-actions">
                <button type="button" class="secondary load-comparison-ticket-button" data-row-index="${escapeHtml(rowIndex)}" ${row.ticketDraft ? "" : "disabled"}>Load Ticket</button>
                <button type="button" class="evaluate-comparison-ticket-button" data-row-index="${escapeHtml(rowIndex)}" ${row.ticketDraft ? "" : "disabled"}>Evaluate Current Price</button>
              </footer>
            </article>
          `;
        })
        .join("")}
    </div>
  `;
}

function renderComparisonTable(rows) {
  if (!Array.isArray(rows) || rows.length === 0) {
    return '<p class="muted">No props matched the current public DraftKings total-bases board.</p>';
  }

  return `
    <div class="comparison-table-wrap">
      <table class="comparison-table">
        <thead>
          <tr>
            <th>Player</th>
            <th>Prop</th>
            <th>Board</th>
            <th>Current</th>
            <th>Recorded</th>
            <th>Move</th>
            <th>Verdict</th>
            <th>Edge</th>
            <th>EV</th>
            <th>TB Context</th>
            <th>Stake</th>
          </tr>
        </thead>
        <tbody>
          ${rows
            .map((row) => `
              <tr>
                <td>
                  <strong>${escapeHtml(row.player_name)}</strong>
                  <div class="sources">${escapeHtml(row.current_team)} vs ${escapeHtml(row.opponent_team)}</div>
                </td>
                <td>${escapeHtml(row.display_prop)}</td>
                <td>${escapeHtml(row.current_board_status || row.current_line_match_status)}</td>
                <td>${formatOdds(row.current_odds_american)}</td>
                <td>${formatOdds(row.recording_odds_american)}</td>
                <td>${typeof row.odds_move === "number" ? escapeHtml(formatOdds(row.odds_move)) : "-"}</td>
                <td><span class="tag ${verdictTagClass(row.app_verdict)}">${escapeHtml(row.app_verdict || "-")}</span></td>
                <td>${escapeHtml(formatPercentPoints(row.app_price_edge_points))}</td>
                <td>${formatPercent(row.app_expected_value_roi)}</td>
                <td>${typeof row.app_current_game_tb === "number" ? `${row.app_current_game_tb} now / ` : ""}${typeof row.app_recent10_tb_per_game === "number" ? `${row.app_recent10_tb_per_game.toFixed(2)} recent` : "-"}</td>
                <td>${escapeHtml(formatUnits(row.app_recommended_stake))}</td>
              </tr>
            `)
            .join("")}
        </tbody>
      </table>
    </div>
  `;
}

function renderRecordingComparison(payload) {
  const rows = Array.isArray(payload?.rows) ? payload.rows : [];
  const summary = payload?.summary ?? {};
  const notes = Array.isArray(payload?.notes) ? payload.notes : [];
  const matchedRows = comparisonRowsSorted(rows.filter((row) => row.current_line_match_status === "matched"));
  const topRows = matchedRows.slice(0, 12);

  window.__bearEdgeComparisonRows = rows;
  els.recordingComparisonResult.innerHTML = `
    <div class="snapshot-summary">
      ${[
        ["Checked", summary.totalRecordingProps ?? 0],
        ["Matched", summary.matchedCurrentLines ?? 0],
        ["Live", summary.matchedLiveLines ?? 0],
        ["Pregame", summary.matchedPregameLines ?? 0],
        ["BET", summary.betVerdicts ?? 0],
        ["Compared", formatDate(payload?.comparedAt)]
      ]
        .map(([label, value]) => `<article class="metric compact"><span>${escapeHtml(label)}</span><strong>${escapeHtml(value)}</strong></article>`)
        .join("")}
    </div>
    ${
      notes.length > 0
        ? `<div class="warning-list">${notes.map((note) => `<p>${escapeHtml(note)}</p>`).join("")}</div>`
        : ""
    }
    <section class="comparison-section">
      <div class="panel-title comparison-subtitle">
        <div>
          <h3>Best Current Matches</h3>
          <p class="panel-subtitle">Load or evaluate the matched current price directly.</p>
        </div>
      </div>
      ${renderComparisonCards(topRows)}
    </section>
    <section class="comparison-section">
      <div class="panel-title comparison-subtitle">
        <div>
          <h3>All Matched Props</h3>
          <p class="panel-subtitle">Sorted by Bear Edge verdict and current price edge.</p>
        </div>
      </div>
      ${renderComparisonTable(matchedRows)}
    </section>
  `;
}

async function runRecordingComparison() {
  const recordingFile = els.recordingComparisonCsvInput.files?.[0];
  const boardFile = els.recordingComparisonBoardInput.files?.[0];
  const bankroll = Number(els.recordingComparisonBankrollInput.value ?? 1000);

  if (!recordingFile) {
    setRecordingComparisonStatus("Choose the extracted recording CSV first.", true);
    return;
  }

  if (!boardFile) {
    setRecordingComparisonStatus("Choose the current DraftKings board JSON export first.", true);
    return;
  }

  if (!Number.isFinite(bankroll) || bankroll <= 0) {
    setRecordingComparisonStatus("Bankroll must be a positive number.", true);
    return;
  }

  setRecordingComparisonStatus("Comparing recording props against the current DraftKings board...");

  try {
    const [recordingCsvText, currentBoardText] = await Promise.all([
      recordingFile.text(),
      boardFile.text()
    ]);
    const response = await fetch("/api/recording-props-compare", {
      method: "POST",
      headers: {
        "content-type": "application/json"
      },
      body: JSON.stringify({
        recordingCsvText,
        currentBoardText,
        bankroll
      })
    });
    const payload = await response.json();

    if (!response.ok) {
      throw new Error(payload.error ?? "Unable to compare recording props.");
    }

    renderRecordingComparison(payload);
    setRecordingComparisonStatus(`Compared ${payload.summary.totalRecordingProps} props and matched ${payload.summary.matchedCurrentLines} current DraftKings lines.`);
  } catch (error) {
    setRecordingComparisonStatus(error.message, true);
  }
}

function renderDraftKingsMarket(label, markets) {
  if (!Array.isArray(markets) || markets.length === 0) {
    return "";
  }

  return `
    <div class="dk-market-row">
      <span class="dk-market-label">${escapeHtml(label)}</span>
      <div class="dk-market-prices">
        ${markets
          .map(
            (market) => `
              <span class="dk-price">
                <strong>${escapeHtml(market.selection)}</strong>
                ${typeof market.line === "number" ? `<em>${market.side === "over" || market.side === "under" ? market.line : market.line > 0 ? `+${market.line}` : market.line}</em>` : ""}
                <b>${formatOdds(market.odds)}</b>
              </span>
            `
          )
          .join("")}
      </div>
    </div>
  `;
}

function renderDraftKingsSnapshot(payload) {
  const events = Array.isArray(payload?.events) ? payload.events : [];
  const articles = Array.isArray(payload?.articles) ? payload.articles : [];
  const warnings = Array.isArray(payload?.warnings) ? payload.warnings : [];
  const summary = payload?.summary ?? {};

  els.draftKingsSnapshotResult.innerHTML = `
    <div class="snapshot-summary">
      ${[
        ["Events", summary.events ?? 0],
        ["Today", summary.todayEvents ?? 0],
        ["Tomorrow", summary.tomorrowEvents ?? 0],
        ["Live", summary.liveEvents ?? 0],
        ["Scheduled", summary.scheduledEvents ?? 0],
        ["Incomplete", summary.incompleteEvents ?? 0],
        ["Articles", summary.articleCount ?? 0],
        ["Predictions", summary.predictionArticleCount ?? 0],
        ["ML", summary.moneylineMarkets ?? 0],
        ["Run Line", summary.runLineMarkets ?? 0],
        ["Totals", summary.totalMarkets ?? 0]
      ]
        .map(([label, value]) => `<article class="metric compact"><span>${escapeHtml(label)}</span><strong>${escapeHtml(value)}</strong></article>`)
        .join("")}
    </div>
    ${
      warnings.length > 0
        ? `<div class="warning-list draftkings-warnings">${warnings.map((warning) => `<p>${escapeHtml(warning)}</p>`).join("")}</div>`
        : ""
    }
    ${
      events.length > 0
        ? `<div class="draftkings-events">${events
            .map((event) => {
              const awayMeta = event.away.score !== null && event.away.score !== undefined ? `Score ${event.away.score}` : event.away.probablePitcher ?? "Pitcher/player context unavailable";
              const homeMeta = event.home.score !== null && event.home.score !== undefined ? `Score ${event.home.score}` : event.home.probablePitcher ?? "Pitcher/player context unavailable";

              return `
                <article class="draftkings-event">
                  <header>
                    <div>
                      <strong>${escapeHtml(event.away.name)} @ ${escapeHtml(event.home.name)}</strong>
                      <p class="sources">${escapeHtml(event.dateBucket)} / ${escapeHtml(event.status ?? event.startTime ?? "unknown time")}</p>
                    </div>
                    <span class="tag ok">sides explicit</span>
                  </header>
                  <div class="dk-teams">
                    <span>${escapeHtml(event.away.name)} <em>${escapeHtml(awayMeta)}</em></span>
                    <span>${escapeHtml(event.home.name)} <em>${escapeHtml(homeMeta)}</em></span>
                  </div>
                  ${
                    Array.isArray(event.warnings) && event.warnings.length > 0
                      ? `<div class="warning-list">${event.warnings.map((warning) => `<p>${escapeHtml(warning)}</p>`).join("")}</div>`
                      : ""
                  }
                  ${renderDraftKingsMarket("Moneyline", event.markets?.moneyline)}
                  ${renderDraftKingsMarket("Run Line", event.markets?.runLine)}
                  ${renderDraftKingsMarket("Total", event.markets?.total)}
                </article>
              `;
            })
            .join("")}</div>`
        : '<p class="muted">No complete DraftKings game-line rows parsed from this snapshot.</p>'
    }
    ${
      articles.length > 0
        ? `<section class="draftkings-articles">
            <h3>DraftKings Network Editorial Context</h3>
            <p class="sources">Context only. These articles do not become model probabilities, EV, or BET calls.</p>
            <div class="article-grid">
              ${articles
                .slice(0, 8)
                .map(
                  (article) => `
                    <article class="article-card">
                      <span class="sources">${escapeHtml(article.publishedAtLabel ?? "time unavailable")}</span>
                      <strong>${escapeHtml(article.title)}</strong>
                      <p>${escapeHtml(article.summary)}</p>
                      ${article.author ? `<em>${escapeHtml(article.author)}</em>` : ""}
                    </article>
                  `
                )
                .join("")}
            </div>
          </section>`
        : '<p class="muted">No DraftKings Network article cards parsed from this snapshot.</p>'
    }
  `;
}

function renderScreenshotIntakeResult(payload) {
  const warnings = Array.isArray(payload?.warnings) ? payload.warnings : [];
  const ocrWarnings = Array.isArray(payload?.ocr?.warnings) ? payload.ocr.warnings : [];
  const text = payload?.extractedText ?? "";
  const summary = payload?.summary ?? {};
  const parserLabel = payload?.parser === "statmuse"
    ? "StatMuse"
    : payload?.parser === "worldcup-goalscorer"
      ? "World Cup Goalscorer"
      : "DraftKings";
  const parsedCount = payload?.parser === "statmuse"
    ? summary.games ?? 0
    : payload?.parser === "worldcup-goalscorer"
      ? summary.players ?? 0
      : summary.events ?? 0;
  const priceCount = payload?.parser === "statmuse"
    ? summary.displayedOdds ?? 0
    : payload?.parser === "worldcup-goalscorer"
      ? summary.pricedMarkets ?? 0
      : summary.moneylineMarkets ?? 0;

  els.screenshotIntakeResult.innerHTML = `
    <div class="snapshot-summary">
      ${[
        ["Parser", parserLabel],
        ["OCR Lines", payload?.ocr?.lines ?? 0],
        ["Characters", payload?.ocr?.characters ?? 0],
        ["Parsed Rows", parsedCount],
        ["Prices", priceCount],
        ["File", payload?.ocr?.fileName ?? "-"]
      ]
        .map(([label, value]) => `<article class="metric compact"><span>${escapeHtml(label)}</span><strong>${escapeHtml(value)}</strong></article>`)
        .join("")}
    </div>
    ${
      [...ocrWarnings, ...warnings].length > 0
        ? `<div class="warning-list">${[...ocrWarnings, ...warnings]
            .slice(0, 8)
            .map((warning) => `<p>${escapeHtml(warning)}</p>`)
            .join("")}</div>`
        : ""
    }
    <details class="ocr-text-preview">
      <summary>Extracted OCR Text</summary>
      <pre>${escapeHtml(text || "No text extracted.")}</pre>
    </details>
  `;
}

async function parseDraftKingsSnapshot() {
  const text = els.draftKingsSnapshotInput.value.trim();

  if (!text) {
    setDraftKingsSnapshotStatus("Paste visible DraftKings board text first.", true);
    return;
  }

  setDraftKingsSnapshotStatus("Parsing DraftKings board...");

  try {
    const response = await fetch("/api/draftkings-snapshot", {
      method: "POST",
      headers: {
        "content-type": "application/json"
      },
      body: JSON.stringify({
        text,
        sourceUrl: "https://sportsbook.draftkings.com/leagues/baseball/mlb?category=games&subcategory=game-lines",
        capturedAt: new Date().toISOString()
      })
    });
    const payload = await response.json();

    if (!response.ok) {
      throw new Error(payload.error ?? "Unable to parse DraftKings board.");
    }

    renderDraftKingsSnapshot(payload);
    setDraftKingsSnapshotStatus(`Parsed ${payload.summary.events} DraftKings events and ${payload.summary.moneylineMarkets} moneyline prices.`);
    els.candidateOddsImportInput.value = text;
    await importCandidateOddsText();
  } catch (error) {
    setDraftKingsSnapshotStatus(error.message, true);
  }
}

function snapshotConfig(parser) {
  if (parser === "statmuse") {
    return {
      input: els.statMuseSnapshotInput,
      resultRenderer: renderStatMuseSnapshot,
      setStatus: setSnapshotStatus,
      sourceUrl: "https://www.statmuse.com/",
      successMessage(payload) {
        return `OCR parsed ${payload.summary.games} StatMuse games from ${payload.ocr.lines} text lines. Verify extracted text before using it.`;
      }
    };
  }

  return {
    input: els.draftKingsSnapshotInput,
    resultRenderer: renderDraftKingsSnapshot,
    setStatus: setDraftKingsSnapshotStatus,
    sourceUrl: "https://sportsbook.draftkings.com/leagues/baseball/mlb?category=games&subcategory=game-lines",
    successMessage(payload) {
      return `OCR parsed ${payload.summary.events} DraftKings events and ${payload.summary.moneylineMarkets} moneyline prices from ${payload.ocr.lines} text lines. Verify every price.`;
    }
  };
}

async function parseSnapshotImage(file, parser = "draftkings") {
  if (!isImageFile(file)) {
    throw new Error("Drop or upload a PNG, JPG, TIFF, HEIC, or WebP screenshot.");
  }

  const config = snapshotConfig(parser);
  const message = `Reading ${file.name} with local OCR...`;

  setScreenshotIntakeStatus(message);
  config.setStatus(`Reading ${file.name} with local OCR...`);

  try {
    const dataUrl = await readFileAsDataUrl(file);
    const response = await fetch("/api/ocr-snapshot", {
      method: "POST",
      headers: {
        "content-type": "application/json"
      },
      body: JSON.stringify({
        parser,
        imageBase64: dataUrl,
        mimeType: file.type,
        fileName: file.name,
        sourceUrl: config.sourceUrl,
        capturedAt: new Date().toISOString()
      })
    });
    const payload = await response.json();

    if (!response.ok) {
      throw new Error(payload.error ?? "Unable to OCR screenshot.");
    }

    config.input.value = payload.extractedText ?? "";
    config.resultRenderer(payload);
    renderScreenshotIntakeResult(payload);
    config.setStatus(config.successMessage(payload));
    setScreenshotIntakeStatus(config.successMessage(payload));

    if (parser === "draftkings") {
      els.candidateOddsImportInput.value = payload.extractedText ?? "";
      await importCandidateOddsText();
    }
    els.screenshotIntakePanel.scrollIntoView({ behavior: "smooth", block: "start" });
  } catch (error) {
    config.setStatus(error.message, true);
    setScreenshotIntakeStatus(error.message, true);
  }
}

function renderLatestDecision(result) {
  const metric = metricFromResult(result);

  els.latestTimestamp.textContent = formatDate(metric.timestamp);
  els.latestDecision.className = "latest-content";
  els.latestDecision.innerHTML = `
    <div class="decision-head">
      <div class="verdict ${escapeHtml(metric.verdict)}">${escapeHtml(metric.verdict)}</div>
      <div class="selection-box">
        <strong>${escapeHtml(metric.selection)}</strong>
        <span class="muted">${escapeHtml(metric.kind)} / ${escapeHtml(metric.marketType)} / ${formatOdds(metric.odds)}</span>
      </div>
    </div>
    <div class="detail-grid">
      <div class="detail"><span>EV</span><strong>${formatPercent(metric.ev)}</strong></div>
      <div class="detail"><span>Kelly</span><strong>${formatPercent(metric.kelly)}</strong></div>
      <div class="detail"><span>Stake</span><strong>${formatMoney(metric.stake)}</strong></div>
      <div class="detail"><span>Stale Data</span><strong>${escapeHtml(metric.staleDataStatus)}</strong></div>
    </div>
    ${renderRiskFlags(metric.riskFlags)}
    <p class="sources">Source timestamps: ${
      metric.sourceTimestamps.length > 0
        ? metric.sourceTimestamps.map((timestamp) => escapeHtml(shortTimestamp(timestamp))).join(", ")
        : "none"
    }</p>
  `;
}

function renderSummary(summary) {
  window.__bearEdgeLoadedSummary = summary;
  const gate = window.__bearEdgeValidationGate ?? {};
  const cards = [
    ["Evaluations", summary.totalEvaluations ?? 0],
    ["BET Calls", summary.verdictCounts?.BET ?? 0],
    ["3-Win Gate", gate.complete ? "Complete" : `${gate.currentWinStreak ?? 0}/${gate.requiredWinStreak ?? 3}`],
    ["Hit Rate", formatPercent(summary.hitRate)],
    ["Avg CLV", formatPercent(summary.averageClosingLineValue)],
    ["False Positives", summary.falsePositiveBetCalls ?? 0],
    ["Actual P/L", formatMoney(summary.actualProfit)]
  ];

  els.summaryCards.innerHTML = cards
    .map(([label, value]) => `<article class="metric"><span>${escapeHtml(label)}</span><strong>${escapeHtml(value)}</strong></article>`)
    .join("");
  renderOperatorBoards();
}

function renderDataQuality(dataQuality) {
  const status = dataQuality?.status ?? "unknown";
  const metrics = dataQuality?.metrics ?? {};
  const checks = Array.isArray(dataQuality?.checks) ? dataQuality.checks : [];
  const cards = [
    ["Status", status.toUpperCase()],
    ["Settled BET Coverage", formatPercent(metrics.settlementCoverageForBetCalls)],
    ["Graded BET Coverage", formatPercent(metrics.gradedCoverageForBetCalls)],
    ["Malformed Rows", metrics.malformedLineCount ?? 0],
    ["Orphan Settlements", metrics.orphanSettlementCount ?? 0],
    ["Missing Source Times", metrics.missingSourceTimestampBetCalls ?? 0]
  ];

  els.decisionQualityBoard.innerHTML = `
    <div class="summary-grid compact-grid">
      ${cards
        .map(([label, value]) => `<article class="metric compact"><span>${escapeHtml(label)}</span><strong>${escapeHtml(value)}</strong></article>`)
        .join("")}
    </div>
    ${
      checks.length > 0
        ? `<div class="warning-list data-quality-warnings">${checks
            .map((check) => `<p><strong>${escapeHtml(check.severity.toUpperCase())} / ${escapeHtml(check.code)}</strong>: ${escapeHtml(check.message)}</p>`)
            .join("")}</div>`
        : '<p class="sources">Decision log quality checks passed for the currently logged data.</p>'
    }
  `;
}

function renderGames(payload) {
  const games = Array.isArray(payload?.games) ? payload.games : [];

  if (games.length === 0) {
    const sourceText = Array.isArray(payload?.sources)
      ? payload.sources.map((source) => `${source.sport.toUpperCase()} ${source.date}: ${source.games}`).join(" / ")
      : "No source data.";

    els.gameBoard.innerHTML = `<p class="muted">No official games found for this window. ${escapeHtml(sourceText)}</p>`;
    return;
  }

  els.gameBoard.innerHTML = games
    .map((game) => {
      const awayPitcher = game.away?.probablePitcher?.name ? `Probable: ${game.away.probablePitcher.name}` : "";
      const homePitcher = game.home?.probablePitcher?.name ? `Probable: ${game.home.probablePitcher.name}` : "";

      return `
        <article class="game-card">
          <header>
            <h3>${escapeHtml(game.sport.toUpperCase())} ${escapeHtml(formatDate(game.gameDate ?? game.date))}</h3>
            <span class="game-status">${escapeHtml(game.status)}</span>
          </header>
          <div class="teams">
            <div class="team-row">
              <div>
                <strong>${escapeHtml(game.away?.name ?? "Away")}</strong>
                <div class="probable">${escapeHtml(awayPitcher)}</div>
              </div>
              <span>${game.away?.score ?? "-"}</span>
            </div>
            <div class="team-row">
              <div>
                <strong>${escapeHtml(game.home?.name ?? "Home")}</strong>
                <div class="probable">${escapeHtml(homePitcher)}</div>
              </div>
              <span>${game.home?.score ?? "-"}</span>
            </div>
          </div>
          <p class="sources">${escapeHtml(game.venue ?? "Venue TBD")} / official source</p>
        </article>
      `;
    })
    .join("");
}

async function loadGames(date = "today") {
  els.gameBoard.innerHTML = '<p class="muted">Loading official games...</p>';

  try {
    const days = date === "today" ? 2 : 1;
    const response = await fetch(`/api/games?date=${encodeURIComponent(date)}&days=${days}`);
    const payload = await response.json();

    if (!response.ok) {
      throw new Error(payload.error ?? "Unable to load official games.");
    }

    renderGames(payload);
  } catch (error) {
    els.gameBoard.innerHTML = `<p class="muted">${escapeHtml(error.message)}</p>`;
  }
}

async function loadSourceStatus(date = "today") {
  els.sourceStatusBoard.innerHTML = '<p class="muted">Checking live sources...</p>';

  try {
    const response = await fetch(`/api/source-status?date=${encodeURIComponent(date)}&days=2`);
    const payload = await response.json();

    if (!response.ok) {
      throw new Error(payload.error ?? "Unable to check live sources.");
    }

    renderSourceStatus(payload);
  } catch (error) {
    els.sourceStatusBoard.innerHTML = `<p class="muted">${escapeHtml(error.message)}</p>`;
    els.sourceStatusTimestamp.textContent = "Source check failed";
  }
}

function parseCandidateOddsField(card, selector) {
  const input = card?.querySelector(selector);
  const raw = input?.value ?? "";

  if (!String(raw).trim()) {
    return { input, raw, value: null, error: null };
  }

  try {
    return { input, raw, value: parseAmericanOddsInput(raw), error: null };
  } catch (error) {
    return { input, raw, value: null, error: error.message };
  }
}

function candidatePreviewFromCard(card) {
  const candidate = findCandidate(card?.dataset?.candidateId);

  if (!candidate) {
    return null;
  }

  const market = parseCandidateOddsField(card, ".candidate-market-odds");
  const opposite = parseCandidateOddsField(card, ".candidate-opposite-odds");

  if (market.error || opposite.error || market.value === null) {
    return {
      candidate,
      marketOdds: market.value,
      oppositeOdds: opposite.value,
      error: market.error ?? opposite.error ?? null,
      evRoi: null,
      modelProbability: candidate.prediction?.modelProbability ?? null
    };
  }

  const modelProbability = candidate.prediction?.modelProbability ?? null;
  const breakEven = americanToImpliedProbability(market.value);
  const evRoi = expectedValueRoiFromOdds(modelProbability, market.value);
  const noVigProbability = noVigProbabilityFromOdds(market.value, opposite.value);

  return {
    candidate,
    marketOdds: market.value,
    oppositeOdds: opposite.value,
    modelProbability,
    breakEven,
    evRoi,
    noVigProbability,
    noVigEdge: typeof noVigProbability === "number" && typeof modelProbability === "number"
      ? modelProbability - noVigProbability
      : null,
    fairAmericanOdds: candidate.prediction?.fairAmericanOdds ?? probabilityToAmerican(modelProbability),
    error: null
  };
}

function updateCandidateEdgePreview(card) {
  const preview = card?.querySelector(".candidate-edge-preview");
  const data = candidatePreviewFromCard(card);

  if (!preview || !data) {
    return;
  }

  if (data.error) {
    card.dataset.priced = "false";
    preview.className = "candidate-edge-preview edge-high";
    preview.innerHTML = `
      <div class="edge-preview-head">
        <strong>Price check</strong>
        <span class="tag high">invalid odds</span>
      </div>
      <p>${escapeHtml(data.error)}</p>
    `;
    return;
  }

  if (data.marketOdds === null) {
    card.dataset.priced = "false";
    preview.className = "candidate-edge-preview";
    preview.innerHTML = `
      <div class="edge-preview-head">
        <strong>Price check</strong>
        <span class="tag medium">odds needed</span>
      </div>
      <p>Type the sportsbook price to see break-even probability, rough EV, and whether this is worth evaluating.</p>
    `;
    return;
  }

  const tone = edgePreviewTone(data.evRoi);
  card.dataset.priced = "true";
  preview.className = `candidate-edge-preview edge-${tone.className}`;
  preview.innerHTML = `
    <div class="edge-preview-head">
      <strong>Price check</strong>
      <span class="tag ${tone.className}">${escapeHtml(tone.label)}</span>
    </div>
    <div class="edge-preview-grid">
      <div><span>Break-even</span><strong>${formatPercent(data.breakEven)}</strong></div>
      <div><span>Model</span><strong>${formatPercent(data.modelProbability)}</strong></div>
      <div><span>Rough EV</span><strong>${formatPercent(data.evRoi)}</strong></div>
      <div><span>Fair line</span><strong>${formatOdds(data.fairAmericanOdds)}</strong></div>
      <div><span>No-vig prob</span><strong>${data.noVigProbability === null ? "add opposite" : formatPercent(data.noVigProbability)}</strong></div>
      <div><span>No-vig edge</span><strong>${data.noVigEdge === null ? "-" : formatPercent(data.noVigEdge)}</strong></div>
    </div>
    <p>${escapeHtml(tone.message)} This preview is not the final verdict; the engine still checks stale data, EV, Kelly, caps, and parlay rules.</p>
  `;
}

function updateAllCandidateEdgePreviews() {
  els.candidateBoard.querySelectorAll(".candidate-card").forEach(updateCandidateEdgePreview);
}

function candidateRowsFromCards() {
  return Array.from(els.candidateBoard.querySelectorAll(".candidate-card")).map((card, index) => {
    const preview = candidatePreviewFromCard(card);
    const candidate = preview?.candidate ?? findCandidate(card.dataset.candidateId);

    return {
      card,
      index,
      candidate,
      preview,
      candidateId: card.dataset.candidateId,
      visible: !card.hidden,
      priced: card.dataset.priced === "true",
      evRoi: preview?.evRoi,
      modelProbability: preview?.modelProbability ?? candidate?.prediction?.modelProbability,
      marketOdds: preview?.marketOdds,
      statLabel: candidate?.statLabel ?? candidate?.statKey ?? "prop"
    };
  });
}

function sortCandidateCards() {
  const sort = els.candidateSortSelect?.value ?? "default";
  const rows = candidateRowsFromCards();

  if (rows.length === 0 || sort === "default") {
    return;
  }

  const valueOr = (value, fallback) => typeof value === "number" && Number.isFinite(value) ? value : fallback;
  const sorted = [...rows].sort((left, right) => {
    if (sort === "ev-desc") {
      return valueOr(right.evRoi, -Infinity) - valueOr(left.evRoi, -Infinity);
    }

    if (sort === "ev-asc") {
      return valueOr(left.evRoi, Infinity) - valueOr(right.evRoi, Infinity);
    }

    if (sort === "priced-first") {
      if (left.priced !== right.priced) {
        return left.priced ? -1 : 1;
      }

      return valueOr(right.evRoi, -Infinity) - valueOr(left.evRoi, -Infinity);
    }

    if (sort === "model-desc") {
      return valueOr(right.modelProbability, -Infinity) - valueOr(left.modelProbability, -Infinity);
    }

    return left.index - right.index;
  });

  for (const row of sorted) {
    els.candidateBoard.append(row.card);
  }
}

function renderCandidateActionBoard() {
  if (!els.candidateActionBoard) {
    return;
  }

  const rows = candidateRowsFromCards();

  if (rows.length === 0) {
    els.candidateActionBoard.innerHTML = '<p class="muted">Load candidates and enter odds to see the best priced singles here.</p>';
    renderOperatorStatus();
    return;
  }

  const visibleRows = rows.filter((row) => row.visible);
  const pricedRows = rows.filter((row) => row.priced && !row.preview?.error);
  const visiblePricedRows = visibleRows.filter((row) => row.priced && !row.preview?.error);
  const positiveRows = pricedRows.filter((row) => typeof row.evRoi === "number" && row.evRoi > 0);
  const negativeRows = pricedRows.filter((row) => typeof row.evRoi === "number" && row.evRoi < 0);
  const topRows = [...visiblePricedRows]
    .filter((row) => typeof row.evRoi === "number" && Number.isFinite(row.evRoi))
    .sort((left, right) => right.evRoi - left.evRoi)
    .slice(0, 5);
  const nextAction = pricedRows.length === 0
    ? "Paste odds text, upload a screenshot, or type sportsbook odds on candidate cards."
    : positiveRows.length === 0
      ? "No positive rough-EV prices are entered yet. Do not force a bet."
      : "Review the top rough-EV singles, then use Evaluate for the real engine verdict.";

  els.candidateActionBoard.innerHTML = `
    <div class="candidate-action-summary">
      ${[
        ["Visible", `${visibleRows.length}/${rows.length}`],
        ["Priced", pricedRows.length],
        ["Positive", positiveRows.length],
        ["Negative", negativeRows.length],
        ["Best Rough EV", topRows[0] ? formatPercent(topRows[0].evRoi) : "-"]
      ]
        .map(([label, value]) => `<article class="metric compact"><span>${escapeHtml(label)}</span><strong>${escapeHtml(value)}</strong></article>`)
        .join("")}
    </div>
    <div class="candidate-next-action">
      <strong>Next action</strong>
      <p>${escapeHtml(nextAction)}</p>
    </div>
    ${
      topRows.length > 0
        ? `<div class="candidate-action-list">
            ${topRows
              .map((row, index) => {
                const candidate = row.candidate;
                const tone = edgePreviewTone(row.evRoi);

                return `
                  <article class="candidate-action-card">
                    <header>
                      <span class="rank-pill">#${index + 1}</span>
                      <div>
                        <strong>${escapeHtml(candidate?.ticketDraft?.selection ?? candidate?.player?.name ?? "Candidate")}</strong>
                        <p class="sources">${escapeHtml(candidate?.player?.teamName ?? "Team unknown")} vs ${escapeHtml(candidate?.player?.opponentName ?? "opponent unknown")} / ${escapeHtml(row.statLabel)}</p>
                      </div>
                      <span class="tag ${tone.className}">${escapeHtml(tone.label)}</span>
                    </header>
                    <div class="edge-preview-grid">
                      <div><span>Market</span><strong>${formatOdds(row.marketOdds)}</strong></div>
                      <div><span>Fair</span><strong>${formatOdds(row.preview?.fairAmericanOdds)}</strong></div>
                      <div><span>Rough EV</span><strong>${formatPercent(row.evRoi)}</strong></div>
                      <div><span>Break-even</span><strong>${formatPercent(row.preview?.breakEven)}</strong></div>
                      <div><span>Model</span><strong>${formatPercent(row.modelProbability)}</strong></div>
                      <div><span>No-vig edge</span><strong>${row.preview?.noVigEdge === null ? "-" : formatPercent(row.preview?.noVigEdge)}</strong></div>
                    </div>
                    <footer>
                      <button type="button" class="secondary focus-action-candidate-button" data-candidate-id="${escapeHtml(row.candidateId)}">Show Card</button>
                      <button type="button" class="secondary load-action-candidate-button" data-candidate-id="${escapeHtml(row.candidateId)}">Load Single</button>
                      <button type="button" class="evaluate-action-candidate-button" data-candidate-id="${escapeHtml(row.candidateId)}">Evaluate</button>
                    </footer>
                  </article>
                `;
              })
              .join("")}
          </div>`
        : '<p class="muted">No visible priced candidates yet. Enter odds on cards or apply OCR/pasted sportsbook text.</p>'
    }
  `;
  renderOperatorStatus();
}

function applyCandidateFilters() {
  const cards = Array.from(els.candidateBoard.querySelectorAll(".candidate-card"));

  if (cards.length === 0) {
    if (els.candidateFilterStatus) {
      els.candidateFilterStatus.textContent = "No candidates loaded.";
    }
    renderCandidateActionBoard();
    return;
  }

  const sport = els.candidateSportFilter?.value ?? "all";
  const market = els.candidateMarketFilter?.value ?? "all";
  const search = String(els.candidateSearchInput?.value ?? "").trim().toLowerCase();
  const pricedOnly = Boolean(els.candidatePricedOnlyInput?.checked);
  let visible = 0;

  for (const card of cards) {
    const matchesSport = sport === "all" || card.dataset.sport === sport;
    const matchesMarket = market === "all" || card.dataset.statKey === market;
    const matchesSearch = !search || String(card.dataset.search ?? "").includes(search);
    const matchesPriced = !pricedOnly || card.dataset.priced === "true";
    const show = matchesSport && matchesMarket && matchesSearch && matchesPriced;

    card.hidden = !show;
    if (show) {
      visible += 1;
    }
  }

  if (els.candidateFilterStatus) {
    els.candidateFilterStatus.textContent = `${visible}/${cards.length} candidates shown`;
  }

  renderCandidateActionBoard();
}

function renderCandidates(payload) {
  const candidates = Array.isArray(payload?.candidates) ? payload.candidates : [];
  window.__bearEdgeCandidates = candidates;
  renderParlayBuilder();

  if (candidates.length === 0) {
    const skipped = Array.isArray(payload?.skipped) ? payload.skipped.length : 0;

    els.candidateBoard.innerHTML = `<p class="muted">No pregame research candidates found. Skipped ${skipped} games because they were final, live, unsupported, missing stats, or tennis/manual-only.</p>`;
    if (els.candidateFilterStatus) {
      els.candidateFilterStatus.textContent = "No candidates available.";
    }
    renderCandidateActionBoard();
    return;
  }

  els.candidateBoard.innerHTML = candidates
    .map((candidate) => {
      const searchText = [
        candidate.player?.name,
        candidate.player?.teamName,
        candidate.player?.opponentName,
        candidate.matchup,
        candidate.statLabel,
        candidate.statKey,
        candidate.sport
      ].filter(Boolean).join(" ").toLowerCase();

      return `
      <article class="candidate-card" data-candidate-id="${escapeHtml(candidate.id)}" data-sport="${escapeHtml(candidate.sport)}" data-stat-key="${escapeHtml(candidate.statKey)}" data-priced="false" data-search="${escapeHtml(searchText)}">
        <header>
          <div>
            <h3>${escapeHtml(candidate.player.name)}</h3>
            <p class="sources">${escapeHtml(candidate.player.teamName ?? "Team unknown")} vs ${escapeHtml(candidate.player.opponentName ?? "opponent unknown")}</p>
          </div>
          <span class="tag high">${escapeHtml((candidate.statLabel ?? candidate.statKey ?? "prop").toUpperCase())}</span>
        </header>
        <p><strong>${escapeHtml(candidate.lean.toUpperCase())} ${escapeHtml(candidate.line)} ${escapeHtml(candidate.statLabel ?? candidate.statKey)}</strong></p>
        <p class="muted">${escapeHtml(candidate.matchup)} / ${escapeHtml(formatDate(candidate.gameDate))}</p>
        <div class="candidate-read">
          <span>Actual data</span>
          <strong>Season + recent ${escapeHtml(candidate.stats?.recentLimit ?? "-")} games</strong>
          <span>Source</span>
          <strong>${escapeHtml(candidate.audit?.generatedFrom ?? "official source")}</strong>
        </div>
        <div class="candidate-stats">
          <div><span>Season</span><strong>${candidate.stats.seasonPerGame.toFixed(2)}</strong></div>
          <div><span>Recent</span><strong>${candidate.stats.recentPerGame.toFixed(2)}</strong></div>
          <div><span>Blend</span><strong>${candidate.stats.blendedMean.toFixed(2)}</strong></div>
          <div><span>Model Prob</span><strong>${formatPercent(candidate.prediction?.modelProbability)}</strong></div>
          <div><span>Fair Odds</span><strong>${formatOdds(candidate.prediction?.fairAmericanOdds)}</strong></div>
        </div>
        <div class="market-explainer">${escapeHtml(marketExplainer(candidate))}</div>
        <div class="candidate-edge-preview">
          <div class="edge-preview-head">
            <strong>Price check</strong>
            <span class="tag medium">odds needed</span>
          </div>
          <p>Type the sportsbook price to see break-even probability, rough EV, and whether this is worth evaluating.</p>
        </div>
        <p class="sources">Provider: ${escapeHtml(candidate.provider ?? "unknown")} / Prediction: ${escapeHtml(candidate.prediction?.model ?? "research_model")} / Odds source: ${escapeHtml(candidate.audit?.oddsSource ?? "manual_required")}</p>
        ${renderRiskFlags(candidate.riskFlags)}
        <footer>
          <span class="sources">Official stats / ${escapeHtml(shortTimestamp(candidate.stats.fetchedAt))}</span>
          <button type="button" class="secondary load-candidate-button" data-candidate-id="${escapeHtml(candidate.id)}">Load Draft</button>
        </footer>
        <div class="candidate-odds">
          <label>
            <span>Market odds</span>
            <input class="candidate-market-odds" inputmode="numeric" placeholder="-115 or +140" aria-label="Market odds for ${escapeHtml(candidate.player.name)}">
          </label>
          <label>
            <span>Opposite odds</span>
            <input class="candidate-opposite-odds" inputmode="numeric" placeholder="optional" aria-label="Opposite odds for no-vig normalization">
          </label>
          <label>
            <span>Leg type</span>
            <select class="candidate-market-type" aria-label="Leg type for ${escapeHtml(candidate.player.name)}">
              <option value="prop" ${candidate.marketType === "alt-prop" ? "" : "selected"}>Standard</option>
              <option value="alt-prop" ${candidate.marketType === "alt-prop" ? "selected" : ""}>Alt prop</option>
            </select>
          </label>
          <button type="button" class="load-candidate-with-odds-button" data-candidate-id="${escapeHtml(candidate.id)}">Load With Odds</button>
          <button type="button" class="evaluate-candidate-button" data-candidate-id="${escapeHtml(candidate.id)}">Evaluate Price</button>
          <button type="button" class="add-candidate-to-parlay-button secondary" data-candidate-id="${escapeHtml(candidate.id)}">Add To Parlay</button>
        </div>
        <p class="candidate-match-audit sources"></p>
      </article>
    `;
    })
    .join("");

  updateAllCandidateEdgePreviews();
  sortCandidateCards();
  applyCandidateFilters();
}

function renderBestTargets(payload) {
  const targets = Array.isArray(payload?.best) ? payload.best : [];
  const modeLabel = payload?.status === "priced" ? "priced" : "price check";
  const summary = payload?.summary ?? {};

  els.bestTargetsTimestamp.textContent = payload?.fetchedAt
    ? `Updated ${shortTimestamp(payload.fetchedAt)}`
    : "Updated";

  if (targets.length === 0) {
    els.bestTargetsBoard.innerHTML = '<p class="muted">No MLB targets returned yet.</p>';
    return;
  }

  els.bestTargetsBoard.innerHTML = `
    <div class="best-targets-summary">
      <span class="tag ${payload.status === "priced" ? "low" : "medium"}">${escapeHtml(modeLabel)}</span>
      <span>${escapeHtml(summary.pricedCandidates ?? 0)} priced / ${escapeHtml(summary.candidates ?? 0)} candidates</span>
      <span>${escapeHtml(summary.oddsApiConfigured ? "odds key connected" : "odds key missing")}</span>
    </div>
    <div class="best-targets-grid">
      ${targets.map((target, index) => {
        const evaluation = target.evaluation;
        const odds = target.odds;
        return `
          <article class="best-target-card">
            <header>
              <span class="rank-pill">#${index + 1}</span>
              <div>
                <h3>${escapeHtml(target.player?.name ?? "Unknown player")}</h3>
                <p>${escapeHtml(target.matchup)} / ${escapeHtml(formatDate(target.gameDate))}</p>
              </div>
              <span class="tag ${evaluation?.verdict === "BET" ? "low" : evaluation?.verdict === "WAIT" ? "medium" : "high"}">${escapeHtml(evaluation?.verdict ?? target.status ?? "TARGET")}</span>
            </header>
            <p><strong>${escapeHtml(target.lean.toUpperCase())} ${escapeHtml(target.line)} ${escapeHtml(target.statLabel)}</strong></p>
            <div class="candidate-stats">
              <div><span>Model</span><strong>${formatPercent(target.modelProbability)}</strong></div>
              <div><span>Fair</span><strong>${formatOdds(target.fairAmericanOdds)}</strong></div>
              <div><span>Market</span><strong>${formatOdds(odds?.marketOdds)}</strong></div>
              <div><span>EV</span><strong>${formatPercent(evaluation?.expectedValueRoi)}</strong></div>
              <div><span>Kelly</span><strong>${formatPercent(evaluation?.kellyFraction)}</strong></div>
              <div><span>Stake</span><strong>${formatMoney(evaluation?.recommendedStake)}</strong></div>
            </div>
            <p class="sources">${escapeHtml(odds?.bookmaker?.title ?? "No verified odds yet")} ${odds?.bookmaker?.lastUpdate ? `/ ${escapeHtml(shortTimestamp(odds.bookmaker.lastUpdate))}` : ""}</p>
            ${renderRiskFlags(evaluation?.riskFlags ?? target.riskFlags)}
          </article>
        `;
      }).join("")}
    </div>
    ${Array.isArray(payload?.warnings) && payload.warnings.length > 0
      ? `<ul class="warning-list">${payload.warnings.slice(0, 4).map((warning) => `<li>${escapeHtml(warning)}</li>`).join("")}</ul>`
      : ""}
  `;
}

async function loadBestTargets(date = "today") {
  els.bestTargetsBoard.innerHTML = '<p class="muted">Ranking current MLB targets...</p>';

  try {
    const response = await fetch(`/api/best-mlb-targets?date=${encodeURIComponent(date)}&days=2&limit=3&maxCandidates=80`);
    const payload = await response.json();

    if (!response.ok) {
      throw new Error(payload.error ?? "Unable to load best targets.");
    }

    renderBestTargets(payload);
  } catch (error) {
    els.bestTargetsBoard.innerHTML = `<p class="muted">${escapeHtml(error.message)}</p>`;
    els.bestTargetsTimestamp.textContent = "Best target check failed";
  }
}

async function loadCandidates(date = "today") {
  els.candidateBoard.innerHTML = '<p class="muted">Building research candidates from official data...</p>';

  try {
    const days = date === "today" ? 2 : 1;
    const response = await fetch(`/api/candidates?date=${encodeURIComponent(date)}&days=${days}`);
    const payload = await response.json();

    if (!response.ok) {
      throw new Error(payload.error ?? "Unable to load research candidates.");
    }

    renderCandidates(payload);
  } catch (error) {
    els.candidateBoard.innerHTML = `<p class="muted">${escapeHtml(error.message)}</p>`;
  }
}

function applyCandidateOddsMatches(matches) {
  let applied = 0;

  for (const match of matches) {
    const card = els.candidateBoard.querySelector(`[data-candidate-id="${CSS.escape(match.candidateId)}"]`);
    const input = card?.querySelector(".candidate-market-odds");
    const audit = card?.querySelector(".candidate-match-audit");

    if (!input) {
      continue;
    }

    input.value = formatOdds(match.marketOdds);
    input.dataset.importMatched = "true";
    input.classList.add("matched");

    if (audit) {
      audit.innerHTML = `Matched ${formatOdds(match.marketOdds)} / confidence ${formatPercent(match.confidence)}<br>${escapeHtml(match.matchedText).replaceAll("\n", "<br>")}`;
    }

    updateCandidateEdgePreview(card);
    applied += 1;
  }

  sortCandidateCards();
  applyCandidateFilters();

  return applied;
}

async function importCandidateOddsText() {
  const text = els.candidateOddsImportInput.value.trim();

  if (!text) {
    setCandidateImportStatus("Paste sportsbook/OCR prop text first.", true);
    return;
  }

  if (window.__bearEdgeCandidates.length === 0) {
    setCandidateImportStatus("Load research candidates before applying odds text.", true);
    return;
  }

  setCandidateImportStatus("Matching odds text to visible candidates...");

  try {
    const response = await fetch("/api/candidate-odds-import", {
      method: "POST",
      headers: {
        "content-type": "application/json"
      },
      body: JSON.stringify({
        text,
        candidates: window.__bearEdgeCandidates
      })
    });
    const payload = await response.json();

    if (!response.ok) {
      throw new Error(payload.error ?? "Unable to import candidate odds.");
    }

    const applied = applyCandidateOddsMatches(payload.matches ?? []);
    setCandidateImportStatus(`Applied ${applied} odds match(es). Verify each matched price, then click Evaluate Price.`);
  } catch (error) {
    setCandidateImportStatus(error.message, true);
  }
}

function renderMarketBreakdown(markets) {
  if (!Array.isArray(markets) || markets.length === 0) {
    els.marketBreakdown.innerHTML = '<p class="muted">No market data logged yet.</p>';
    return;
  }

  const maxEvaluations = Math.max(...markets.map((market) => market.evaluations), 1);

  els.marketBreakdown.innerHTML = markets
    .map((market) => {
      const width = Math.max(4, Math.round((market.evaluations / maxEvaluations) * 100));

      return `
        <article class="market-tile">
          <h3>${escapeHtml(market.marketType)}</h3>
          <div class="bar"><span style="width: ${width}%"></span></div>
          <div class="tile-stats">
            <span>Runs: ${market.evaluations}</span>
            <span>BET: ${market.betCalls}</span>
            <span>EV: ${formatPercent(market.averageEvRoi)}</span>
            <span>CLV: ${formatPercent(market.averageClosingLineValue)}</span>
            <span>Hit: ${formatPercent(market.hitRate)}</span>
            <span>P/L: ${formatMoney(market.actualProfit)}</span>
          </div>
        </article>
      `;
    })
    .join("");
}

function renderHistory(evaluations) {
  els.historyCount.textContent = `${evaluations.length} evaluations`;

  if (!Array.isArray(evaluations) || evaluations.length === 0) {
    els.historyBody.innerHTML = '<tr><td colspan="11" class="muted">No decisions logged yet.</td></tr>';
    return;
  }

  els.historyBody.innerHTML = evaluations
    .map((evaluation) => {
      const sourceText =
        evaluation.sourceTimestamps.length > 0
          ? evaluation.sourceTimestamps.map(shortTimestamp).join(", ")
          : "none";
      const flags =
        evaluation.riskFlagCodes.length > 0
          ? evaluation.riskFlagCodes.map((code) => `<span class="tag">${escapeHtml(code)}</span>`).join("")
          : '<span class="muted">None</span>';
      const outcome = evaluation.settlement?.outcome ?? "pending";
      const closingOdds = evaluation.settlement?.closingOdds ?? "";

      return `
        <tr>
          <td>${escapeHtml(formatDate(evaluation.timestamp))}</td>
          <td><span class="verdict-pill ${escapeHtml(evaluation.verdict)}">${escapeHtml(evaluation.verdict)}</span></td>
          <td>
            <strong>${escapeHtml(evaluation.selection)}</strong>
            <div class="muted">${escapeHtml(evaluation.id)}</div>
          </td>
          <td>${escapeHtml(evaluation.marketType)}</td>
          <td>${formatPercent(evaluation.expectedValueRoi)}</td>
          <td>${formatMoney(evaluation.recommendedStake)}</td>
          <td><div class="tag-row">${flags}</div></td>
          <td>${escapeHtml(evaluation.staleDataStatus)}</td>
          <td class="sources">${escapeHtml(sourceText)}</td>
          <td>${formatPercent(evaluation.closingLineValue)}</td>
          <td>
            <form class="settle-form" data-id="${escapeHtml(evaluation.id)}">
              <select name="outcome" aria-label="Outcome">
                ${["pending", "win", "loss", "push", "void"]
                  .map((value) => `<option value="${value}" ${value === outcome ? "selected" : ""}>${value}</option>`)
                  .join("")}
              </select>
              <input name="closingOdds" inputmode="numeric" placeholder="Close" value="${escapeHtml(closingOdds)}" aria-label="Closing odds">
              <button type="submit">Save</button>
            </form>
          </td>
        </tr>
      `;
    })
    .join("");
}

async function loadHealth() {
  const response = await fetch("/health");

  if (!response.ok) {
    throw new Error("Health check failed.");
  }

  els.healthDot.classList.add("ok");
}

async function loadDashboard() {
  const response = await fetch("/api/decision-log");
  const payload = await response.json();

  if (!response.ok) {
    throw new Error(payload.error ?? "Unable to load decision log.");
  }

  els.logPath.textContent = payload.logPath;
  window.__bearEdgeValidationGate = payload.validationGate;
  els.generatedAt.textContent = `Generated ${formatDate(payload.summary.generatedAt)}`;
  renderSummary(payload.summary);
  renderDataQuality(payload.dataQuality);
  renderMarketBreakdown(payload.byMarketType);
  renderHistory(payload.evaluations);
}

function parseTicket() {
  const text = els.ticketInput.value.trim();

  if (!text) {
    throw new Error("Ticket JSON is empty.");
  }

  return JSON.parse(text);
}

function endpointForTicket(ticket) {
  return Array.isArray(ticket?.legs) ? "/evaluate/live" : "/evaluate";
}

function findCandidate(candidateId) {
  return window.__bearEdgeCandidates.find((entry) => entry.id === candidateId);
}

function buildLegFromCandidate(candidate, card) {
  const marketOdds = parseAmericanOddsInput(card.querySelector(".candidate-market-odds")?.value);
  const oppositeOdds = parseAmericanOddsInput(card.querySelector(".candidate-opposite-odds")?.value);
  const marketType = card.querySelector(".candidate-market-type")?.value || candidate.marketType || "prop";

  if (marketOdds === null) {
    throw new Error("Enter real sportsbook marketOdds before loading this candidate.");
  }

  const leg = cloneJson(candidate.ticketDraft.legs[0]);
  leg.marketOdds = marketOdds;
  leg.marketType = marketType;
  leg.correlationKey = `${candidate.sport}:${candidate.gameId}`;

  if (oppositeOdds === null) {
    delete leg.oppositeOdds;
  } else {
    leg.oppositeOdds = oppositeOdds;
  }

  return leg;
}

function buildTicketFromCandidate(candidate, card) {
  const ticket = cloneJson(candidate.ticketDraft);
  const leg = buildLegFromCandidate(candidate, card);

  ticket.legs[0] = leg;
  ticket.selection = `${candidate.ticketDraft.selection} at ${formatOdds(leg.marketOdds)}`;

  return applyBankrollPolicyToTicket(ticket);
}

function parlayEntryFromCandidate(candidate, card) {
  const leg = buildLegFromCandidate(candidate, card);

  return {
    candidateId: candidate.id,
    leg,
    label: leg.label,
    matchup: candidate.matchup,
    sport: candidate.sport,
    statLabel: candidate.statLabel ?? candidate.statKey,
    modelProbability: candidate.prediction?.modelProbability ?? null,
    evRoi: expectedValueRoiFromOdds(candidate.prediction?.modelProbability, leg.marketOdds),
    correlationKey: leg.correlationKey
  };
}

function addCandidateToParlay(candidate, card) {
  const entry = parlayEntryFromCandidate(candidate, card);
  const existingIndex = window.__bearEdgeParlayLegs.findIndex((item) => item.candidateId === candidate.id);

  if (existingIndex >= 0) {
    window.__bearEdgeParlayLegs[existingIndex] = entry;
  } else {
    if (window.__bearEdgeParlayLegs.length >= 3) {
      throw new Error("Parlay builder supports a maximum of 3 legs.");
    }

    window.__bearEdgeParlayLegs.push(entry);
  }

  renderParlayBuilder();
}

function parlayBuilderSummary(entries) {
  if (!Array.isArray(entries) || entries.length === 0) {
    return null;
  }

  const combinedDecimal = entries.reduce((total, entry) => total * americanToDecimal(entry.leg.marketOdds), 1);
  const combinedAmerican = decimalToAmerican(combinedDecimal);
  const modelProbability = entries.every((entry) => typeof entry.modelProbability === "number" && Number.isFinite(entry.modelProbability))
    ? entries.reduce((total, entry) => total * entry.modelProbability, 1)
    : null;
  const breakEven = 1 / combinedDecimal;
  const evRoi = typeof modelProbability === "number" ? modelProbability * combinedDecimal - 1 : null;
  const altPropLegs = entries.filter((entry) => entry.leg.marketType === "alt-prop").length;
  const correlationCounts = entries.reduce((counts, entry) => {
    const key = entry.correlationKey ?? entry.leg.correlationKey ?? entry.candidateId;
    counts.set(key, (counts.get(key) ?? 0) + 1);
    return counts;
  }, new Map());
  const correlatedKeys = Array.from(correlationCounts.entries())
    .filter(([, count]) => count > 1)
    .map(([key]) => key);

  return {
    combinedDecimal,
    combinedAmerican,
    modelProbability,
    breakEven,
    evRoi,
    profitOn10: 10 * (combinedDecimal - 1),
    altPropLegs,
    correlatedKeys
  };
}

function renderParlayBuilderSummary(entries) {
  const summary = parlayBuilderSummary(entries);

  if (!summary) {
    return "";
  }

  const tone = summary.correlatedKeys.length > 0 || summary.altPropLegs > 2
    ? { className: "high", label: "blocked risk" }
    : entries.length < 2
      ? { className: "medium", label: "needs 2 legs" }
      : edgePreviewTone(summary.evRoi);

  return `
    <div class="parlay-summary">
      <div class="edge-preview-head">
        <strong>Parlay preview</strong>
        <span class="tag ${tone.className}">${escapeHtml(tone.label)}</span>
      </div>
      <div class="edge-preview-grid">
        <div><span>Legs</span><strong>${entries.length}/3</strong></div>
        <div><span>Alt props</span><strong>${summary.altPropLegs}/2</strong></div>
        <div><span>Combined odds</span><strong>${formatOdds(summary.combinedAmerican)}</strong></div>
        <div><span>Break-even</span><strong>${formatPercent(summary.breakEven)}</strong></div>
        <div><span>Model probability</span><strong>${summary.modelProbability === null ? "-" : formatPercent(summary.modelProbability)}</strong></div>
        <div><span>Rough EV</span><strong>${summary.evRoi === null ? "-" : formatPercent(summary.evRoi)}</strong></div>
        <div><span>$10 profit</span><strong>${formatMoney(summary.profitOn10)}</strong></div>
        <div><span>Correlation</span><strong>${summary.correlatedKeys.length > 0 ? "blocked" : "clear"}</strong></div>
      </div>
      ${
        summary.correlatedKeys.length > 0
          ? `<p class="parlay-warning">Correlation risk: ${escapeHtml(summary.correlatedKeys.join(", "))}. The engine will reject same-game/same-source parlay clusters by default.</p>`
          : entries.length < 2
            ? '<p class="sources">Add one more priced, independent leg before loading or evaluating a parlay.</p>'
            : '<p class="sources">Preview assumes independent legs. Final engine gates still apply EV, Kelly, stale-source, max-leg, and correlation rules.</p>'
      }
    </div>
  `;
}

function renderParlayBuilder() {
  const entries = window.__bearEdgeParlayLegs ?? [];

  if (!els.parlayBuilderBoard) {
    return;
  }

  if (entries.length === 0) {
    els.parlayBuilderBoard.innerHTML = '<p class="muted">No parlay legs yet. Add priced candidate cards here.</p>';
    renderOperatorStatus();
    return;
  }

  els.parlayBuilderBoard.innerHTML = `
    ${renderParlayBuilderSummary(entries)}
    <div class="parlay-leg-list">
      ${entries
        .map((entry, index) => `
          <article>
            <span class="rank-pill">${index + 1}</span>
            <div>
              <strong>${escapeHtml(entry.label)}</strong>
              <p class="sources">${escapeHtml(entry.matchup)} / ${escapeHtml(entry.statLabel)} / ${escapeHtml(entry.leg.marketType)} / ${formatOdds(entry.leg.marketOdds)}</p>
            </div>
            <button type="button" class="secondary remove-parlay-leg-button" data-index="${index}">Remove</button>
          </article>
        `)
        .join("")}
    </div>
  `;
  renderOperatorStatus();
}

function buildParlayTicketFromBuilder() {
  const entries = window.__bearEdgeParlayLegs ?? [];
  const settings = getBankrollSettings();
  const policy = riskModePolicy(settings.riskMode);
  const bankroll = Number(els.parlayBuilderBankrollInput.value || settings.bankroll);
  const summary = parlayBuilderSummary(entries);

  if (entries.length < 2) {
    throw new Error("Add at least 2 priced legs before building a parlay.");
  }

  if (entries.length > 3) {
    throw new Error("Parlays are capped at 3 legs.");
  }

  if (!Number.isFinite(bankroll) || bankroll <= 0) {
    throw new Error("Enter a positive bankroll for the parlay.");
  }

  if (summary?.altPropLegs > 2) {
    throw new Error("Parlay blocked: maximum 2 alt-prop legs.");
  }

  if ((summary?.correlatedKeys ?? []).length > 0) {
    throw new Error(`Parlay blocked by correlation risk: ${summary.correlatedKeys.join(", ")}.`);
  }

  return {
    kind: "parlay",
    selection: entries.map((entry) => entry.label).join(" + "),
    bankroll,
    livePolicy: {
      marketWeight: 0.4,
      recentWeight: 0.45,
      maxParlayLegs: 3,
      maxAltPropLegs: 2,
      maxSourceAgeMinutes: 20,
      correlationPenalty: 0.92,
      allowCorrelatedLegs: false,
      kellyMultiplier: policy.kellyMultiplier,
      maxBankrollFraction: policy.maxBankrollFraction,
      minStake: Math.max(0, settings.sportsbookMinimum)
    },
    legs: entries.map((entry) => entry.leg)
  };
}

function autoBuildParlayFromPricedCards(maxLegs) {
  const cards = Array.from(els.candidateBoard.querySelectorAll(".candidate-card"));
  const pricedEntries = cards
    .map((card) => {
      const preview = candidatePreviewFromCard(card);

      if (!preview || preview.error || preview.marketOdds === null || typeof preview.evRoi !== "number") {
        return null;
      }

      return {
        card,
        preview,
        candidate: preview.candidate,
        evRoi: preview.evRoi
      };
    })
    .filter(Boolean)
    .filter((entry) => entry.evRoi > 0)
    .sort((left, right) => right.evRoi - left.evRoi);
  const selected = [];
  const usedCorrelationKeys = new Set();
  let altPropLegs = 0;

  for (const priced of pricedEntries) {
    if (selected.length >= maxLegs) {
      break;
    }

    const entry = parlayEntryFromCandidate(priced.candidate, priced.card);
    const key = entry.correlationKey ?? entry.leg.correlationKey ?? entry.candidateId;

    if (usedCorrelationKeys.has(key)) {
      continue;
    }

    if (entry.leg.marketType === "alt-prop" && altPropLegs >= 2) {
      continue;
    }

    if (entry.leg.marketType === "alt-prop") {
      altPropLegs += 1;
    }

    usedCorrelationKeys.add(key);
    selected.push(entry);
  }

  if (selected.length < 2) {
    throw new Error("Auto parlay needs at least two positive-EV, priced, independent candidate cards.");
  }

  window.__bearEdgeParlayLegs = selected;
  renderParlayBuilder();
  setStatus(`Auto-built a ${selected.length}-leg parlay from the best priced independent candidates.`);
}

async function loadParlayBuilderTicket({ evaluate = false } = {}) {
  try {
    const ticket = buildParlayTicketFromBuilder();
    setTicketInputValue(ticket);
    setStatus(evaluate ? "Evaluating parlay..." : "Parlay ticket loaded. Review it, then evaluate.");
    document.querySelector("#ticket")?.scrollIntoView({ behavior: "smooth", block: "start" });

    if (evaluate) {
      await submitTicket(ticket);
    }
  } catch (error) {
    setStatus(error.message, true);
  }
}

async function evaluateTicket(event) {
  event.preventDefault();
  setStatus("Evaluating...");

  try {
    const ticket = parseTicket();
    await submitTicket(ticket);
  } catch (error) {
    setStatus(error.message, true);
  }
}

async function submitTicket(ticket) {
  const preflight = validateTicketPreflight(ticket);
  const blocker = preflight.findings.find((finding) => finding.severity === "blocker");

  if (blocker) {
    renderTicketPreflightFromText();
    throw new Error(`Ticket preflight blocked evaluation: ${blocker.code}.`);
  }

  if (hasMissingOdds(ticket)) {
    throw new Error("Add real sportsbook marketOdds before evaluating this draft.");
  }

  const response = await fetch(endpointForTicket(ticket), {
    method: "POST",
    headers: {
      "content-type": "application/json"
    },
    body: JSON.stringify(ticket)
  });
  const payload = await response.json();

  if (!response.ok) {
    throw new Error(payload.error ?? "Evaluation failed.");
  }

  renderLatestDecision(payload);
  await loadDashboard();
  setStatus(`Logged to ${payload.logPath ?? "no log"}.`);

  return payload;
}

async function settleEvaluation(event) {
  const form = event.target.closest(".settle-form");

  if (!form) {
    return;
  }

  event.preventDefault();

  const formData = new FormData(form);
  const closingOddsText = String(formData.get("closingOdds") ?? "").trim();
  const payload = {
    evaluationId: form.dataset.id,
    outcome: String(formData.get("outcome") ?? "pending")
  };

  if (closingOddsText) {
    payload.closingOdds = Number(closingOddsText);
  }

  try {
    const response = await fetch("/api/settle", {
      method: "POST",
      headers: {
        "content-type": "application/json"
      },
      body: JSON.stringify(payload)
    });
    const result = await response.json();

    if (!response.ok) {
      throw new Error(result.error ?? "Settlement failed.");
    }

    await loadDashboard();
    setStatus("Settlement saved.");
  } catch (error) {
    setStatus(error.message, true);
  }
}

els.ticketForm.addEventListener("submit", evaluateTicket);
els.ticketInput.addEventListener("input", renderTicketPreflightFromText);
[
  els.bankrollInput,
  els.sportsbookMinInput,
  els.riskModeSelect
].forEach((control) => {
  control?.addEventListener("input", () => {
    const settings = getBankrollSettings();

    writeStoredNumber(storageKeys.bankroll, settings.bankroll);
    writeStoredNumber(storageKeys.sportsbookMinimum, Math.max(settings.sportsbookMinimum, 0.01));
    window.localStorage.setItem(storageKeys.riskMode, settings.riskMode);

    if (els.parlayBuilderBankrollInput && document.activeElement !== els.parlayBuilderBankrollInput) {
      els.parlayBuilderBankrollInput.value = String(settings.bankroll);
    }

    renderOperatorBoards();
    renderParlayBuilder();
  });
  control?.addEventListener("change", () => {
    const settings = getBankrollSettings();

    writeStoredNumber(storageKeys.bankroll, settings.bankroll);
    writeStoredNumber(storageKeys.sportsbookMinimum, Math.max(settings.sportsbookMinimum, 0.01));
    window.localStorage.setItem(storageKeys.riskMode, settings.riskMode);
    renderOperatorBoards();
    renderParlayBuilder();
  });
});
els.historyBody.addEventListener("submit", settleEvaluation);
els.recordingComparisonResult.addEventListener("click", async (event) => {
  const loadButton = event.target.closest(".load-comparison-ticket-button");
  const evaluateButton = event.target.closest(".evaluate-comparison-ticket-button");
  const button = loadButton ?? evaluateButton;

  if (!button) {
    return;
  }

  const row = comparisonRowByIndex(button.dataset.rowIndex);

  if (!row?.ticketDraft) {
    setStatus("This comparison row does not have a reusable ticket draft.", true);
    return;
  }

  const ticket = cloneJson(row.ticketDraft);
  setTicketInputValue(applyBankrollPolicyToTicket(ticket));
  setStatus("Comparison ticket loaded from the current DraftKings match.");

  if (evaluateButton) {
    try {
      setStatus("Evaluating comparison ticket...");
      await submitTicket(ticket);
    } catch (error) {
      setStatus(error.message, true);
    }
  }
});
els.candidateBoard.addEventListener("click", async (event) => {
  const draftButton = event.target.closest(".load-candidate-button");
  const oddsButton = event.target.closest(".load-candidate-with-odds-button");
  const evaluateButton = event.target.closest(".evaluate-candidate-button");
  const addParlayButton = event.target.closest(".add-candidate-to-parlay-button");
  const button = draftButton ?? oddsButton ?? evaluateButton ?? addParlayButton;

  if (!button) {
    return;
  }

  const candidate = findCandidate(button.dataset.candidateId);

  if (!candidate) {
    setStatus("Candidate is no longer available. Refresh candidates.", true);
    return;
  }

  if (draftButton) {
    setTicketInputValue(applyBankrollPolicyToTicket(candidate.ticketDraft));
    setStatus("Candidate draft loaded. Replace null marketOdds with real sportsbook odds before evaluating.");
    return;
  }

  try {
    const card = button.closest(".candidate-card");

    if (addParlayButton) {
      addCandidateToParlay(candidate, card);
      setStatus("Candidate added to the parlay builder.");
      return;
    }

    const ticket = buildTicketFromCandidate(candidate, card);

    setTicketInputValue(ticket);
    setStatus("Candidate loaded with manual sportsbook odds. Review the ticket, then evaluate.");

    if (evaluateButton) {
      setStatus("Evaluating candidate price...");
      await submitTicket(ticket);
    }
  } catch (error) {
    setStatus(error.message, true);
  }
});
els.candidateBoard.addEventListener("input", (event) => {
  if (!event.target.matches(".candidate-market-odds, .candidate-opposite-odds")) {
    return;
  }

  const card = event.target.closest(".candidate-card");

  updateCandidateEdgePreview(card);
  sortCandidateCards();
  applyCandidateFilters();
});
els.candidateBoard.addEventListener("change", (event) => {
  if (!event.target.matches(".candidate-market-type")) {
    return;
  }

  const card = event.target.closest(".candidate-card");

  updateCandidateEdgePreview(card);
  renderCandidateActionBoard();
});
[
  els.candidateSportFilter,
  els.candidateMarketFilter,
  els.candidateSortSelect,
  els.candidateSearchInput,
  els.candidatePricedOnlyInput
].forEach((control) => {
  control?.addEventListener("input", () => {
    sortCandidateCards();
    applyCandidateFilters();
  });
  control?.addEventListener("change", () => {
    sortCandidateCards();
    applyCandidateFilters();
  });
});
els.candidateActionBoard.addEventListener("click", async (event) => {
  const focusButton = event.target.closest(".focus-action-candidate-button");
  const loadButton = event.target.closest(".load-action-candidate-button");
  const evaluateButton = event.target.closest(".evaluate-action-candidate-button");
  const button = focusButton ?? loadButton ?? evaluateButton;

  if (!button) {
    return;
  }

  const candidate = findCandidate(button.dataset.candidateId);
  const card = els.candidateBoard.querySelector(`[data-candidate-id="${CSS.escape(button.dataset.candidateId)}"]`);

  if (!candidate || !card) {
    setStatus("Candidate is no longer available. Refresh candidates.", true);
    return;
  }

  card.scrollIntoView({ behavior: "smooth", block: "center" });
  card.classList.add("candidate-focused");
  window.setTimeout(() => card.classList.remove("candidate-focused"), 1600);

  if (focusButton) {
    return;
  }

  try {
    const ticket = buildTicketFromCandidate(candidate, card);

    setTicketInputValue(ticket);
    setStatus("Top priced single loaded from the Action Board.");

    if (evaluateButton) {
      setStatus("Evaluating Action Board single...");
      await submitTicket(ticket);
    }
  } catch (error) {
    setStatus(error.message, true);
  }
});
els.parlayBuilderBoard.addEventListener("click", (event) => {
  const removeButton = event.target.closest(".remove-parlay-leg-button");

  if (!removeButton) {
    return;
  }

  window.__bearEdgeParlayLegs.splice(Number(removeButton.dataset.index), 1);
  renderParlayBuilder();
  setStatus("Parlay leg removed.");
});
els.sourceStatusRefreshButton.addEventListener("click", () => {
  loadSourceStatus("today");
});
els.oddsKeyForm.addEventListener("submit", saveOddsApiKey);
els.oddsKeyTestButton.addEventListener("click", testSavedOddsApiKey);
els.onlineOpportunitiesRefreshButton.addEventListener("click", () => {
  loadOnlineOpportunities();
});
els.onlineOpportunitiesSportsSelect.addEventListener("change", () => {
  loadOnlineOpportunities();
});
els.autoUpdateRunButton.addEventListener("click", () => {
  runAutoUpdateNow();
});
els.statMuseSnapshotParseButton.addEventListener("click", () => {
  parseStatMuseSnapshot();
});
els.statMuseImageInput.addEventListener("change", async () => {
  const file = els.statMuseImageInput.files?.[0];

  if (file) {
    await parseSnapshotImage(file, "statmuse");
    els.statMuseImageInput.value = "";
  }
});
els.statMuseSnapshotClearButton.addEventListener("click", () => {
  els.statMuseSnapshotInput.value = "";
  els.statMuseSnapshotResult.innerHTML = "";
  setSnapshotStatus("");
});
els.draftKingsSnapshotParseButton.addEventListener("click", () => {
  parseDraftKingsSnapshot();
});
els.draftKingsImageInput.addEventListener("change", async () => {
  const file = els.draftKingsImageInput.files?.[0];

  if (file) {
    await parseSnapshotImage(file, "draftkings");
    els.draftKingsImageInput.value = "";
  }
});
els.draftKingsSnapshotClearButton.addEventListener("click", () => {
  els.draftKingsSnapshotInput.value = "";
  els.draftKingsSnapshotResult.innerHTML = "";
  setDraftKingsSnapshotStatus("");
});
els.recordingComparisonRunButton.addEventListener("click", () => {
  runRecordingComparison();
});
els.recordingComparisonClearButton.addEventListener("click", () => {
  els.recordingComparisonCsvInput.value = "";
  els.recordingComparisonBoardInput.value = "";
  els.recordingComparisonResult.innerHTML = "";
  window.__bearEdgeComparisonRows = [];
  setRecordingComparisonStatus("");
});
els.refreshButton.addEventListener("click", () => {
  loadDashboard().catch((error) => setStatus(error.message, true));
});
els.systemAuditRefreshButton.addEventListener("click", () => {
  loadSystemAudit();
});
els.releaseReadinessRefreshButton.addEventListener("click", () => {
  loadReleaseReadiness();
});
els.providerSetupRefreshButton.addEventListener("click", () => {
  loadProviderSetup();
});
els.providerSetupBoard.addEventListener("submit", saveProviderKey);
els.candidatesRefreshButton.addEventListener("click", () => {
  loadCandidates("today");
});
els.bestTargetsRefreshButton.addEventListener("click", () => {
  loadBestTargets("today");
});
els.candidateOddsImportButton.addEventListener("click", () => {
  importCandidateOddsText();
});
els.candidateOddsImportClearButton.addEventListener("click", () => {
  els.candidateOddsImportInput.value = "";
  setCandidateImportStatus("");
});
els.parlayBuilderClearButton.addEventListener("click", () => {
  window.__bearEdgeParlayLegs = [];
  renderParlayBuilder();
  setStatus("Parlay builder cleared.");
});
els.parlayBuilderBankrollInput.addEventListener("input", () => {
  const bankroll = Number(els.parlayBuilderBankrollInput.value);

  if (Number.isFinite(bankroll) && bankroll > 0) {
    els.bankrollInput.value = String(bankroll);
    writeStoredNumber(storageKeys.bankroll, bankroll);
  }

  renderOperatorBoards();
  renderParlayBuilder();
});
els.parlayBuilderAutoTwoButton.addEventListener("click", () => {
  try {
    autoBuildParlayFromPricedCards(2);
  } catch (error) {
    setStatus(error.message, true);
  }
});
els.parlayBuilderAutoThreeButton.addEventListener("click", () => {
  try {
    autoBuildParlayFromPricedCards(3);
  } catch (error) {
    setStatus(error.message, true);
  }
});
els.parlayBuilderLoadButton.addEventListener("click", () => {
  loadParlayBuilderTicket();
});
els.parlayBuilderEvaluateButton.addEventListener("click", () => {
  loadParlayBuilderTicket({ evaluate: true });
});
els.gamesTodayButton.addEventListener("click", () => {
  loadGames("today");
});
els.gamesTomorrowButton.addEventListener("click", () => {
  loadGames("tomorrow");
});
els.clearButton.addEventListener("click", () => {
  setTicketInputValue("");
  setStatus("");
});
document.querySelectorAll(".template-button").forEach((button) => {
  button.addEventListener("click", () => {
    const template = templates[button.dataset.template];

    setTicketInputValue(applyBankrollPolicyToTicket(template));
    setStatus(`${button.textContent.trim()} template loaded.`);
  });
});
els.fileInput.addEventListener("change", async () => {
  const file = els.fileInput.files?.[0];

  if (!file) {
    return;
  }

  setTicketInputValue(await file.text());
  setStatus(`Loaded ${file.name}.`);
});

function selectedScreenshotParser() {
  return els.screenshotParserSelect.value || "draftkings";
}

els.screenshotImageInput.addEventListener("change", async () => {
  const file = els.screenshotImageInput.files?.[0];

  if (file) {
    await parseSnapshotImage(file, selectedScreenshotParser());
    els.screenshotImageInput.value = "";
  }
});

function resolveParser(parserOrGetter) {
  return typeof parserOrGetter === "function" ? parserOrGetter() : parserOrGetter;
}

function setupSnapshotDropZone(selector, parserOrGetter) {
  const panel = document.querySelector(selector);

  if (!panel) {
    return;
  }

  panel.addEventListener("dragover", (event) => {
    if (!hasFileDrag(event)) {
      return;
    }

    event.preventDefault();
    panel.classList.add("drop-active");
  });

  panel.addEventListener("dragleave", () => {
    panel.classList.remove("drop-active");
  });

  panel.addEventListener("drop", async (event) => {
    const [file] = imageFilesFromEvent(event);

    if (!file) {
      return;
    }

    event.preventDefault();
    event.stopPropagation();
    panel.classList.remove("drop-active");
    await parseSnapshotImage(file, resolveParser(parserOrGetter));
  });
}

setupSnapshotDropZone("#screenshotIntakePanel", selectedScreenshotParser);
setupSnapshotDropZone(".statmuse-panel", "statmuse");
setupSnapshotDropZone(".draftkings-panel", "draftkings");

let fileDragDepth = 0;

function showGlobalDropOverlay() {
  els.globalDropOverlay.classList.add("global-drop-visible");
}

function hideGlobalDropOverlay() {
  fileDragDepth = 0;
  els.globalDropOverlay.classList.remove("global-drop-visible");
}

document.addEventListener("dragenter", (event) => {
  if (!hasFileDrag(event)) {
    return;
  }

  fileDragDepth += 1;
  event.preventDefault();
  showGlobalDropOverlay();
});

document.addEventListener("dragover", (event) => {
  if (hasFileDrag(event)) {
    event.preventDefault();
    showGlobalDropOverlay();
  }
});

document.addEventListener("dragleave", (event) => {
  if (!hasFileDrag(event)) {
    return;
  }

  fileDragDepth = Math.max(0, fileDragDepth - 1);

  if (fileDragDepth === 0) {
    els.globalDropOverlay.classList.remove("global-drop-visible");
  }
});

document.addEventListener("dragend", hideGlobalDropOverlay);

document.addEventListener("drop", async (event) => {
  const [file] = imageFilesFromEvent(event);

  hideGlobalDropOverlay();

  if (!file) {
    return;
  }

  event.preventDefault();
  await parseSnapshotImage(file, selectedScreenshotParser());
});

initializeBankrollControls();
renderOperatorBoards();

loadHealth()
  .then(async () => {
    await Promise.all([loadDashboard(), loadAutoUpdateStatus(), loadSystemAudit(), loadReleaseReadiness(), loadProviderSetup(), loadOddsKeyStatus(), loadSourceStatus("today"), loadOnlineOpportunities(), loadGames("today"), loadBestTargets("today"), loadCandidates("today")]);
    window.setInterval(() => {
      Promise.all([loadDashboard(), loadAutoUpdateStatus(), loadSystemAudit(), loadReleaseReadiness(), loadProviderSetup(), loadOddsKeyStatus(), loadSourceStatus("today"), loadOnlineOpportunities(), loadGames("today"), loadBestTargets("today"), loadCandidates("today")]).catch(
        (error) => setStatus(error.message, true)
      );
    }, AUTO_REFRESH_MS);
  })
  .catch((error) => {
    els.healthDot.classList.remove("ok");
    setStatus(error.message, true);
  });
