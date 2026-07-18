const { isAmericanOddsAtLeast } = require("./price-discipline.js");

/**
 * @typedef {object} RecommendationChangeSignals
 * @property {boolean} [lineupChanged]
 * @property {boolean} [injuryStatusChanged]
 */

function parseDate(value, name) {
  const parsed = value instanceof Date ? value.getTime() : Date.parse(value ?? "");

  if (!Number.isFinite(parsed)) {
    throw new TypeError(`${name} must be a valid date or ISO timestamp.`);
  }

  return parsed;
}

function normalizedBook(value) {
  return String(value ?? "").trim().toLowerCase();
}

function addReason(reasonCodes, code) {
  if (!reasonCodes.includes(code)) {
    reasonCodes.push(code);
  }
}

/**
 * @param {{
 *   recommendation: Record<string, any>,
 *   currentOffer?: Record<string, any> | null,
 *   changeSignals?: RecommendationChangeSignals,
 *   now?: Date | string,
 *   previousStatus?: string | null
 * }} input
 */
function evaluateRecommendationLifecycle({
  recommendation,
  currentOffer,
  changeSignals = {},
  now = new Date(),
  previousStatus = null
}) {
  if (!recommendation || typeof recommendation !== "object" || Array.isArray(recommendation)) {
    throw new TypeError("recommendation must be an object.");
  }

  const nowMs = parseDate(now, "now");
  const discipline = recommendation.evaluation?.priceDiscipline ?? recommendation.priceDiscipline;

  if (!discipline || typeof discipline !== "object") {
    throw new TypeError("recommendation must include priceDiscipline evidence.");
  }

  const reasonCodes = [];
  const validUntilMs = Date.parse(discipline.validUntil ?? "");

  if (!Number.isFinite(validUntilMs)) {
    addReason(reasonCodes, "VALIDITY_BOUNDARY_UNAVAILABLE");
  } else if (nowMs >= validUntilMs) {
    addReason(reasonCodes, "RECOMMENDATION_EXPIRED");
  }

  if (!currentOffer || typeof currentOffer !== "object" || Array.isArray(currentOffer)) {
    addReason(reasonCodes, "CURRENT_OFFER_UNAVAILABLE");
  } else {
    const expectedBook = normalizedBook(recommendation.odds?.bookmaker?.key);
    const actualBook = normalizedBook(currentOffer.sportsbook);

    if (!expectedBook || !actualBook || actualBook !== expectedBook) {
      addReason(reasonCodes, "SPORTSBOOK_CHANGED");
    }

    const expectedLine = Number(recommendation.line);
    const actualLine = Number(currentOffer.line);

    if (!Number.isFinite(expectedLine) || !Number.isFinite(actualLine) || Math.abs(actualLine - expectedLine) > 1e-9) {
      addReason(reasonCodes, "LINE_CHANGED");
    }

    if (currentOffer.sourceVerified !== true) {
      addReason(reasonCodes, "SOURCE_VERIFICATION_LOST");
    }

    if (String(currentOffer.marketStatus ?? "").toLowerCase() !== "open") {
      addReason(reasonCodes, "MARKET_NOT_OPEN");
    }

    const minimumPrice = discipline.minimumAcceptableAmericanOdds;
    const currentPrice = Number(currentOffer.americanOdds);

    if (!Number.isFinite(minimumPrice) || !Number.isFinite(currentPrice) || currentPrice === 0) {
      addReason(reasonCodes, "MINIMUM_PRICE_UNAVAILABLE");
    } else if (!isAmericanOddsAtLeast(currentPrice, minimumPrice)) {
      addReason(reasonCodes, "PRICE_BELOW_MINIMUM");
    }
  }

  if (changeSignals.lineupChanged === true) {
    addReason(reasonCodes, "LINEUP_CHANGED");
  }
  if (changeSignals.injuryStatusChanged === true) {
    addReason(reasonCodes, "INJURY_STATUS_CHANGED");
  }

  const status = reasonCodes.includes("RECOMMENDATION_EXPIRED")
    ? "expired"
    : reasonCodes.length > 0
      ? "withdrawn"
      : "active";
  const evaluatedAt = new Date(nowMs).toISOString();
  const transitionedFromActive = previousStatus === "active" && status !== "active";
  const alertSportsbook = currentOffer?.sportsbook ?? recommendation.odds?.bookmaker?.key ?? null;
  const alertLine = currentOffer?.line ?? recommendation.line ?? null;
  const alertAmericanOdds = currentOffer?.americanOdds ?? recommendation.odds?.marketOdds ?? null;
  const alertCapturedAt = currentOffer?.capturedAt ?? null;
  const minimumAcceptableAmericanOdds = discipline.minimumAcceptableAmericanOdds ?? null;
  const validUntil = discipline.validUntil ?? null;
  const alerts = transitionedFromActive
    ? [{
        type: "recommendation_withdrawn",
        severity: "high",
        recommendationId: recommendation.id ?? null,
        previousStatus,
        status,
        occurredAt: evaluatedAt,
        sportsbook: alertSportsbook,
        line: alertLine,
        americanOdds: alertAmericanOdds,
        minimumAcceptableAmericanOdds,
        priceCapturedAt: alertCapturedAt,
        validUntil,
        reasonCodes: [...reasonCodes],
        message:
          `Recommendation ${recommendation.id ?? "unknown"} is no longer actionable at ` +
          `${alertSportsbook ?? "unknown sportsbook"}, line ${alertLine ?? "unknown"}, ` +
          `price ${alertAmericanOdds ?? "unknown"}, minimum ${minimumAcceptableAmericanOdds ?? "unknown"}, ` +
          `captured ${alertCapturedAt ?? "unknown"}, valid until ${validUntil ?? "unknown"}: ` +
          `${reasonCodes.join(", ")}.`
      }]
    : [];

  return {
    status,
    actionable: status === "active",
    evaluatedAt,
    validUntil,
    minimumAcceptableAmericanOdds,
    currentOffer: currentOffer
      ? {
          sportsbook: currentOffer.sportsbook ?? null,
          line: currentOffer.line ?? null,
          americanOdds: currentOffer.americanOdds ?? null,
          capturedAt: currentOffer.capturedAt ?? null,
          sourceVerified: currentOffer.sourceVerified === true,
          marketStatus: currentOffer.marketStatus ?? null
        }
      : null,
    changeSignals: {
      lineupChanged: changeSignals.lineupChanged === true,
      injuryStatusChanged: changeSignals.injuryStatusChanged === true
    },
    reasonCodes,
    alerts
  };
}

module.exports = {
  evaluateRecommendationLifecycle
};
