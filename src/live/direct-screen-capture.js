const crypto = require("node:crypto");

const { canonicalStringify } = require("../audit/canonical-json.js");
const { decodeImagePayload } = require("./image-ocr.js");

const ALLOWED_MARKET_SIDES = Object.freeze({
  moneyline: new Set(["away", "home"]),
  run_line: new Set(["away", "home"]),
  total: new Set(["over", "under"]),
  player_prop: new Set(["over", "under"])
});
const OPPOSITE_SIDES = Object.freeze({
  away: "home",
  home: "away",
  over: "under",
  under: "over"
});
const EMPTY_BOARD_STATUSES = new Set(["closed", "final", "market_unavailable"]);

function requiredString(value, name) {
  if (typeof value !== "string" || !value.trim()) {
    throw new Error(`${name} is required.`);
  }

  return value.trim();
}

function requiredTimestamp(value, name) {
  const normalized = requiredString(value, name);

  if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{3})?Z$/.test(normalized)
    || !Number.isFinite(Date.parse(normalized))) {
    throw new Error(`${name} must be an ISO-8601 UTC timestamp.`);
  }

  return normalized;
}

function normalizeText(value) {
  return String(value ?? "")
    .replaceAll("−", "-")
    .toLowerCase()
    .replace(/\s+/g, " ")
    .trim();
}

function escapeRegExp(value) {
  return String(value).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function containsExactToken(text, value) {
  const token = normalizeText(value);

  if (!token) {
    return false;
  }

  return new RegExp(`(?:^|[^a-z0-9.])${escapeRegExp(token)}(?=$|[^a-z0-9.])`).test(text);
}

function containsExactSignedToken(text, value) {
  const token = normalizeText(value);

  if (!token) {
    return false;
  }

  return new RegExp(`(?:^|[^a-z0-9.+-])${escapeRegExp(token)}(?=$|[^a-z0-9.+-])`).test(text);
}

function sha256(bufferOrText) {
  return `sha256:${crypto.createHash("sha256").update(bufferOrText).digest("hex")}`;
}

function assertImageSignature(image) {
  const buffer = image.buffer;
  const startsWith = (...bytes) => bytes.every((byte, index) => buffer[index] === byte);
  let valid = false;
  let label = image.mimeType;

  switch (image.mimeType) {
    case "image/png":
      label = "PNG";
      valid = startsWith(0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a);
      break;
    case "image/jpeg":
    case "image/jpg":
      label = "JPEG";
      valid = startsWith(0xff, 0xd8, 0xff);
      break;
    case "image/webp":
      label = "WebP";
      valid = buffer.length >= 12
        && buffer.subarray(0, 4).toString("ascii") === "RIFF"
        && buffer.subarray(8, 12).toString("ascii") === "WEBP";
      break;
    case "image/tiff":
      label = "TIFF";
      valid = startsWith(0x49, 0x49, 0x2a, 0x00)
        || startsWith(0x4d, 0x4d, 0x00, 0x2a);
      break;
    case "image/heic":
    case "image/heif":
      label = image.mimeType === "image/heic" ? "HEIC" : "HEIF";
      valid = buffer.length >= 12 && buffer.subarray(4, 8).toString("ascii") === "ftyp";
      break;
    default:
      valid = false;
  }

  if (!valid) {
    throw new Error(`Screenshot bytes do not contain the declared ${label} signature.`);
  }
}

function normalizeSourceUrl(value) {
  let url;

  try {
    url = new URL(requiredString(value, "sourceUrl"));
  } catch {
    throw new Error("sourceUrl must be a valid DraftKings Predictions URL.");
  }

  if (url.protocol !== "https:" || url.hostname !== "predictions.draftkings.com") {
    throw new Error("sourceUrl must use https://predictions.draftkings.com.");
  }

  return url.toString();
}

function normalizeEvent(input) {
  if (!input || typeof input !== "object" || Array.isArray(input)) {
    throw new Error("event is required.");
  }

  const away = requiredString(input.away, "event.away");
  const home = requiredString(input.home, "event.home");

  for (const [name, team] of [["event.away", away], ["event.home", home]]) {
    const normalized = normalizeText(team);

    if (!normalized.includes(" ")) {
      throw new Error(`${name} must be a full team name as displayed.`);
    }
  }

  return {
    sport: requiredString(input.sport, "event.sport").toLowerCase(),
    league: requiredString(input.league, "event.league"),
    eventId: requiredString(input.eventId, "event.eventId"),
    away,
    home,
    status: requiredString(input.status, "event.status").toLowerCase()
  };
}

function normalizeLine(value, marketType, index) {
  if (marketType === "moneyline") {
    if (value !== null && value !== undefined) {
      throw new Error(`markets[${index}].line must be null for a moneyline.`);
    }

    return null;
  }

  if (typeof value !== "number" || !Number.isFinite(value)) {
    throw new Error(`markets[${index}].line must be a finite number.`);
  }
  if (marketType === "total" && value < 0) {
    throw new Error(`markets[${index}].total line cannot be negative.`);
  }

  return value;
}

function normalizeAmericanOdds(value, index) {
  if (!Number.isSafeInteger(value) || value === 0) {
    throw new Error(`markets[${index}].americanOdds must be non-zero integer American odds.`);
  }

  return value;
}

function normalizeVisibleThreshold(value, marketType, side, line, index) {
  if (value === null || value === undefined) {
    return null;
  }

  if (marketType !== "player_prop") {
    throw new Error(`markets[${index}].threshold is supported only for a player prop.`);
  }

  if (!Number.isSafeInteger(value) || value < 1) {
    throw new Error(`markets[${index}].threshold must be a positive integer.`);
  }

  if (side !== "over") {
    throw new Error(`markets[${index}].threshold requires the over side.`);
  }

  const canonicalLine = value - 0.5;

  if (line !== null && line !== undefined && line !== canonicalLine) {
    throw new Error(
      `markets[${index}].line must equal threshold - 0.5 when both values are supplied.`
    );
  }

  return value;
}

function statLabelFromKey(value) {
  return value
    .replace(/[_-]+/g, " ")
    .replace(/([a-z0-9])([A-Z])/g, "$1 $2")
    .replace(/\s+/g, " ")
    .trim()
    .replace(/\b\w/g, (character) => character.toUpperCase());
}

function marketPairKey(market) {
  const parts = [market.period, market.marketType];

  if (market.marketType === "run_line") {
    const canonicalAwayLine = market.side === "away" ? market.line : -market.line;

    parts.push(String(canonicalAwayLine));
  } else if (market.marketType === "total") {
    parts.push(String(market.line));
  } else if (market.marketType === "player_prop") {
    parts.push(
      normalizeText(market.playerName),
      market.statKey,
      String(market.line)
    );
  }

  return parts.join("|");
}

function assertVisibleMarketEvidence(market, visibleText, index) {
  const displayedAmericanOdds = market.americanOdds > 0
    ? `+${market.americanOdds}`
    : String(market.americanOdds);
  const requiredTokens = [];

  if (!containsExactSignedToken(visibleText, displayedAmericanOdds)) {
    throw new Error(
      `markets[${index}] contains values not found in the retained visible page text: ${displayedAmericanOdds}.`
    );
  }

  if (market.marketType === "player_prop") {
    requiredTokens.push(market.playerName, market.statLabel);

    if (market.threshold !== null) {
      requiredTokens.push(`${market.threshold}+`);
    } else {
      requiredTokens.push(market.line, market.side);
    }
  } else {
    requiredTokens.push(market.line, market.selection);
  }

  const missing = requiredTokens
    .filter((value) => value !== null && value !== undefined)
    .filter((token) => !containsExactToken(visibleText, token));

  if (missing.length > 0) {
    throw new Error(
      `markets[${index}] contains values not found in the retained visible page text: ${missing.join(", ")}.`
    );
  }
}

function normalizeMarket(input, index, visibleText) {
  if (!input || typeof input !== "object" || Array.isArray(input)) {
    throw new Error(`markets[${index}] must be an object.`);
  }

  const marketType = requiredString(input.marketType, `markets[${index}].marketType`).toLowerCase();
  const supportedSides = ALLOWED_MARKET_SIDES[marketType];

  if (!supportedSides) {
    throw new Error(`markets[${index}].marketType is not supported.`);
  }

  const side = requiredString(input.side, `markets[${index}].side`).toLowerCase();

  if (!supportedSides.has(side)) {
    throw new Error(`markets[${index}].side is not valid for ${marketType}.`);
  }

  const threshold = normalizeVisibleThreshold(
    input.threshold,
    marketType,
    side,
    input.line,
    index
  );
  const lineInput = threshold === null ? input.line : threshold - 0.5;
  const statKey = marketType === "player_prop"
    ? requiredString(input.statKey, `markets[${index}].statKey`)
    : null;
  const normalized = {
    period: requiredString(input.period, `markets[${index}].period`).toLowerCase(),
    marketType,
    selection: requiredString(input.selection, `markets[${index}].selection`),
    side,
    line: normalizeLine(lineInput, marketType, index),
    threshold,
    americanOdds: normalizeAmericanOdds(input.americanOdds, index),
    playerName: marketType === "player_prop"
      ? requiredString(input.playerName, `markets[${index}].playerName`)
      : null,
    statKey,
    statLabel: statKey === null
      ? null
      : requiredString(input.statLabel ?? statLabelFromKey(statKey), `markets[${index}].statLabel`),
    oppositeSide: OPPOSITE_SIDES[side],
    oppositeAmericanOdds: null,
    pairStatus: "incomplete"
  };

  assertVisibleMarketEvidence(normalized, visibleText, index);

  return normalized;
}

function normalizeOmissionOdds(value, omissionIndex, rowIndex) {
  if (!Number.isSafeInteger(value) || value === 0) {
    throw new Error(
      `omissions[${omissionIndex}].visibleRows[${rowIndex}].americanOdds must be non-zero integer American odds.`
    );
  }

  return value;
}

function normalizeTotalOmissionIdentity(input, index) {
  const side = requiredString(input.side, `omissions[${index}].side`).toLowerCase();

  if (!ALLOWED_MARKET_SIDES.total.has(side)) {
    throw new Error(`omissions[${index}].side is not valid for a total.`);
  }
  if (typeof input.line !== "number" || !Number.isFinite(input.line) || input.line < 0) {
    throw new Error(`omissions[${index}].line must be a non-negative finite total line.`);
  }
  if (!Number.isInteger(input.line * 2)) {
    throw new Error(`omissions[${index}].line must be a whole or half total line.`);
  }

  const canonicalSelection = `${side === "over" ? "Over" : "Under"} ${input.line}`;
  const selection = requiredString(input.selection, `omissions[${index}].selection`);

  if (normalizeText(selection) !== normalizeText(canonicalSelection)) {
    throw new Error(
      `omissions[${index}].selection must equal the structured total identity ${canonicalSelection}.`
    );
  }

  return {
    selection: canonicalSelection,
    side,
    line: input.line,
    allowedVisibleLabels: new Set([
      normalizeText(canonicalSelection),
      normalizeText(`${side[0].toUpperCase()} ${input.line}`)
    ])
  };
}

function normalizeOmissions(value, visibleText, { sourceUrl, pageTitle }) {
  if (value === null || value === undefined) {
    return [];
  }
  if (!Array.isArray(value)) {
    throw new Error("omissions must be an array.");
  }

  return value.map((input, index) => {
    if (!input || typeof input !== "object" || Array.isArray(input)) {
      throw new Error(`omissions[${index}] must be an object.`);
    }

    const period = requiredString(input.period, `omissions[${index}].period`).toLowerCase();
    const marketType = requiredString(
      input.marketType,
      `omissions[${index}].marketType`
    ).toLowerCase();
    const reason = requiredString(input.reason, `omissions[${index}].reason`).toLowerCase();

    if (!ALLOWED_MARKET_SIDES[marketType]) {
      throw new Error(`omissions[${index}].marketType is not supported.`);
    }
    if (period !== "game"
      || new URL(sourceUrl).searchParams.get("subcategory") !== "game-lines"
      || !containsExactToken(normalizeText(pageTitle), "game lines")) {
      throw new Error(
        `omissions[${index}] must be retained from the event Game Lines page.`
      );
    }
    if (marketType !== "total") {
      throw new Error(
        `omissions[${index}].marketType supports explicit conflicting-price evidence only for totals.`
      );
    }
    if (reason !== "conflicting_visible_prices") {
      throw new Error(`omissions[${index}].reason is not supported.`);
    }
    if (!Array.isArray(input.visibleRows) || input.visibleRows.length < 2) {
      throw new Error(`omissions[${index}].visibleRows requires at least two rows.`);
    }

    const identity = normalizeTotalOmissionIdentity(input, index);
    const visibleTextLines = visibleText.split(/\r?\n/);
    const usedLineIndices = new Set();
    const visibleRows = input.visibleRows.map((row, rowIndex) => {
      if (!row || typeof row !== "object" || Array.isArray(row)) {
        throw new Error(`omissions[${index}].visibleRows[${rowIndex}] must be an object.`);
      }

      const label = requiredString(
        row.label,
        `omissions[${index}].visibleRows[${rowIndex}].label`
      );
      const normalizedLabel = normalizeText(label);
      const americanOdds = normalizeOmissionOdds(row.americanOdds, index, rowIndex);

      if (!identity.allowedVisibleLabels.has(normalizedLabel)) {
        throw new Error(
          `omissions[${index}].visibleRows[${rowIndex}].label does not identify ${identity.selection}.`
        );
      }

      const displayed = americanOdds > 0 ? `+${americanOdds}` : String(americanOdds);
      const matchingLineIndex = visibleTextLines.findIndex((line, lineIndex) => {
        if (usedLineIndices.has(lineIndex)) {
          return false;
        }

        const normalizedLine = normalizeText(line);
        const hasConflictingPeriodMarker = /\b(?:1st|first)\s+(?:5|five|x)\b.*\b(?:innings?|half)\b/.test(
          normalizedLine
        );

        return !hasConflictingPeriodMarker
          && containsExactToken(normalizedLine, normalizedLabel)
          && containsExactSignedToken(normalizedLine, displayed);
      });

      if (matchingLineIndex === -1) {
        throw new Error(
          `omissions[${index}].visibleRows[${rowIndex}] does not appear on its own retained row.`
        );
      }
      usedLineIndices.add(matchingLineIndex);

      return {
        label,
        americanOdds
      };
    });
    const visibleAmericanOdds = visibleRows.map((row) => row.americanOdds);

    if (new Set(visibleAmericanOdds).size !== visibleAmericanOdds.length) {
      throw new Error(`omissions[${index}].visibleRows prices must be distinct.`);
    }

    return {
      period,
      marketType,
      selection: identity.selection,
      side: identity.side,
      line: identity.line,
      reason,
      visibleRows,
      visibleAmericanOdds
    };
  });
}

function marketOmissionIdentityKey(market) {
  return [
    market.period,
    market.marketType,
    market.line === null ? "moneyline" : String(market.line)
  ].join("|");
}

function assertOmissionsDoNotPriceMarkets(markets, omissions) {
  const omissionKeys = new Set(omissions.map(marketOmissionIdentityKey));

  for (const [index, market] of markets.entries()) {
    if (omissionKeys.has(marketOmissionIdentityKey(market))) {
      throw new Error(
        `markets[${index}] duplicates an omitted conflicting market: ${market.selection}.`
      );
    }
  }
}

function pairMarkets(markets) {
  const groups = new Map();

  for (const market of markets) {
    const key = marketPairKey(market);
    const group = groups.get(key) ?? [];

    group.push(market);
    groups.set(key, group);
  }

  let completeMarkets = 0;
  let incompleteMarkets = 0;
  const warnings = [];

  for (const group of groups.values()) {
    const representationKinds = new Set(
      group.map((market) => market.threshold === null ? "decimal" : "threshold")
    );

    if (group.length > 1
      && group[0].marketType === "player_prop"
      && representationKinds.size > 1) {
      throw new Error(
        `A visible market appears in both N+ and decimal representations: ${group[0].selection}.`
      );
    }

    if (new Set(group.map((market) => market.side)).size !== group.length) {
      throw new Error(`A visible market pair contains a duplicate side: ${group[0].side}.`);
    }

    if (group.length > 2) {
      throw new Error(`A visible market pair contains more than two sides: ${group[0].selection}.`);
    }

    if (group.length === 1) {
      incompleteMarkets += 1;
      warnings.push(
        `${group[0].selection} is single-sided at capture; the opposite price remains unavailable.`
      );
      continue;
    }

    const [first, second] = group;

    if (first.oppositeSide !== second.side || second.oppositeSide !== first.side) {
      throw new Error(`Visible market sides are not an exact opposing pair: ${first.side}/${second.side}.`);
    }

    first.oppositeAmericanOdds = second.americanOdds;
    first.pairStatus = "complete";
    second.oppositeAmericanOdds = first.americanOdds;
    second.pairStatus = "complete";
    completeMarkets += 1;
  }

  return {
    completeMarkets,
    incompleteMarkets,
    warnings
  };
}

function normalizeDirectScreenCapture(input = {}, options = {}) {
  const capturedAt = requiredTimestamp(input.capturedAt, "capturedAt");
  const now = options.now instanceof Date ? options.now : new Date();

  if (!Number.isFinite(now.getTime())) {
    throw new Error("options.now must be a valid Date.");
  }

  if (Date.parse(capturedAt) > now.getTime()) {
    throw new Error("capturedAt cannot be in the future.");
  }

  const sourceUrl = normalizeSourceUrl(input.sourceUrl);
  const pageTitle = requiredString(input.pageTitle, "pageTitle");
  const visibleText = requiredString(input.visibleText, "visibleText");
  const normalizedVisibleText = normalizeText(visibleText);
  const event = normalizeEvent(input.event);
  const image = decodeImagePayload(input);

  assertImageSignature(image);

  if (!containsExactToken(normalizedVisibleText, event.away)
    || !containsExactToken(normalizedVisibleText, event.home)) {
    throw new Error("The retained visible page text must contain both event teams.");
  }

  if (!Array.isArray(input.markets)) {
    throw new Error("markets must be an array.");
  }
  if (input.markets.length === 0 && !EMPTY_BOARD_STATUSES.has(event.status)) {
    throw new Error(
      "markets must contain at least one visible market row unless the board is closed, final, or market_unavailable."
    );
  }

  const markets = input.markets.map(
    (market, index) => normalizeMarket(market, index, normalizedVisibleText)
  );
  const omissions = normalizeOmissions(input.omissions, visibleText, {
    sourceUrl,
    pageTitle
  });

  assertOmissionsDoNotPriceMarkets(markets, omissions);

  const pairing = pairMarkets(markets);
  const screenshotSha256 = sha256(image.buffer);
  const visibleTextSha256 = sha256(Buffer.from(visibleText, "utf8"));
  const captureIdentity = {
    capturedAt,
    sourceUrl,
    pageTitle,
    event,
    markets,
    omissions,
    screenshotSha256,
    visibleTextSha256
  };
  const captureDigest = sha256(Buffer.from(canonicalStringify(captureIdentity), "utf8"));
  const capture = {
    schemaVersion: "1.0.0",
    captureId: `dsc_${captureDigest.slice("sha256:".length, "sha256:".length + 24)}`,
    provider: "DraftKings Predictions",
    sourceType: "chrome_visible_page_capture",
    sourceUrl,
    pageTitle,
    capturedAt,
    event,
    markets,
    omissions,
    evidence: {
      screenshotSha256,
      screenshotBytes: image.buffer.length,
      screenshotMimeType: image.mimeType,
      visibleTextSha256,
      visibleTextCharacters: visibleText.length,
      captureDigest
    },
    evidenceStatus: "captured_unverified",
    betCallPermission: "PRICE_CHECK_ONLY",
    authorizedStake: 0,
    summary: {
      markets: markets.length,
      completeMarkets: pairing.completeMarkets,
      incompleteMarkets: pairing.incompleteMarkets,
      omissions: omissions.length
    },
    warnings: [
      "Direct browser capture is real retained screen evidence, not verified provider closing evidence.",
      "DraftKings Predictions contracts require exact fee-aware trade-slip economics before research EV can be calculated.",
      ...(markets.length === 0
        ? ["The retained board has no visible market rows; no price is available for matching."]
        : []),
      ...omissions.map(
        (omission) => `${omission.selection} was omitted because the retained page showed conflicting visible prices: ${omission.visibleAmericanOdds.map((odds) => odds > 0 ? `+${odds}` : String(odds)).join(", ")}.`
      ),
      ...pairing.warnings
    ]
  };

  return {
    capture,
    image: {
      ...image,
      visibleText
    }
  };
}

module.exports = {
  normalizeDirectScreenCapture
};
