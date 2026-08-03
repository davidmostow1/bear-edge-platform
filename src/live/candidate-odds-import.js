function normalizeMinus(value) {
  return String(value ?? "").replaceAll("−", "-");
}

function normalizeText(value) {
  return normalizeMinus(value)
    .toLowerCase()
    .replace(/[^a-z0-9+.\-\s']/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function splitLines(text) {
  return String(text ?? "")
    .split(/\r?\n/)
    .map((line) => normalizeMinus(line).replace(/\s+/g, " ").trim())
    .filter(Boolean);
}

function playerNeedles(name) {
  const parts = normalizeText(name).split(" ").filter(Boolean);
  const lastName = parts.at(-1);
  const firstInitial = parts[0]?.[0];
  const needles = new Set();

  if (parts.length > 0) {
    needles.add(parts.join(" "));
  }

  if (firstInitial && lastName) {
    needles.add(`${firstInitial} ${lastName}`);
    needles.add(`${firstInitial}. ${lastName}`);
  }

  return Array.from(needles).filter((needle) => needle.length >= 3);
}

function statNeedles(statKey) {
  if (statKey === "strikeOuts") {
    return ["strikeouts", "strikeout", "k's", "ks", " k "];
  }

  if (statKey === "totalBases") {
    return ["total bases", "total base", "bases", "tb", " tb "];
  }

  if (statKey === "hits") {
    return ["hits", "hit", " h "];
  }

  if (statKey === "runs") {
    return ["runs", "run", "runs scored", "run scored"];
  }

  return [normalizeText(statKey)];
}

function sideNeedles(side) {
  if (side === "over") {
    return ["over"];
  }

  if (side === "under") {
    return ["under"];
  }

  return [];
}

function americanOddsFromText(text) {
  const matches = Array.from(normalizeMinus(text).matchAll(/(?:^|[\s(])([+\-]\d{2,5})(?=$|[\s)])/g))
    .map((match) => Number(match[1]))
    .filter((value) => Number.isFinite(value) && value !== 0);

  return matches;
}

function firstOddsAfterPlayer(text, candidate) {
  const lines = splitLines(text);
  const names = playerNeedles(candidate.player?.name ?? "");
  const playerLineIndex = lines.findIndex((line) => containsAnyPhrase(` ${normalizeText(line)} `, names));

  if (playerLineIndex >= 0) {
    return americanOddsFromText(lines.slice(playerLineIndex).join("\n"))[0] ?? null;
  }

  return null;
}

function containsPhrase(haystack, needle) {
  const normalizedNeedle = normalizeText(needle);

  return Boolean(normalizedNeedle) && haystack.includes(` ${normalizedNeedle} `);
}

function containsAnyPhrase(haystack, needles) {
  return needles.some((needle) => containsPhrase(haystack, needle));
}

function escapeRegExp(value) {
  return String(value).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function containsExactNumber(haystack, value) {
  const escaped = escapeRegExp(value);

  return new RegExp(`(?:^|[^0-9.])${escaped}(?![0-9.])`).test(haystack);
}

function containsExactThreshold(haystack, value) {
  const escaped = escapeRegExp(value);

  return new RegExp(`(?:^|[^0-9.])${escaped}\\+(?![0-9+])`).test(haystack);
}

function hasAbbreviatedSide(haystack, side, line) {
  const prefix = side === "over" ? "o" : side === "under" ? "u" : null;

  if (!prefix) {
    return false;
  }

  return new RegExp(`(?:^|\\s)${prefix}\\s*${escapeRegExp(line)}(?=\\s|$)`).test(haystack);
}

function buildWindows(lines) {
  const windows = [];

  for (let index = 0; index < lines.length; index += 1) {
    const start = Math.max(0, index - 2);
    const end = Math.min(lines.length, index + 6);
    const raw = lines.slice(start, end).join("\n");

    windows.push({
      index,
      raw,
      normalized: ` ${normalizeText(raw)} `
    });
  }

  return windows;
}

function scoreWindow(candidate, window) {
  const names = playerNeedles(candidate.player?.name ?? "");
  const stats = statNeedles(candidate.statKey);
  const sides = sideNeedles(candidate.lean);
  const odds = americanOddsFromText(window.raw);
  const line = Number(candidate.line);

  if (odds.length === 0 || !Number.isFinite(line) || !containsAnyPhrase(window.normalized, names)) {
    return null;
  }

  const hasStat = containsAnyPhrase(window.normalized, stats);
  const hasExactLine = containsExactNumber(window.normalized, String(line));
  const hasAlternateThreshold = candidate.lean === "over"
    && containsExactThreshold(window.normalized, String(Math.floor(line) + 1));
  const hasLine = hasExactLine || hasAlternateThreshold;
  const hasExplicitSide = containsAnyPhrase(window.normalized, sides)
    || hasAbbreviatedSide(window.normalized, candidate.lean, String(line));
  const hasSide = hasExplicitSide || hasAlternateThreshold;
  const marketOdds = firstOddsAfterPlayer(window.raw, candidate);

  if (marketOdds === null || !hasStat || !hasLine || !hasSide) {
    return null;
  }

  let confidence = 0.58;

  if (containsAnyPhrase(window.normalized, [normalizeText(candidate.player?.name ?? "")])) {
    confidence += 0.15;
  }

  if (hasStat) {
    confidence += 0.12;
  }

  if (hasSide) {
    confidence += 0.1;
  }

  if (hasLine) {
    confidence += 0.05;
  }

  return {
    confidence: Math.min(0.99, confidence),
    marketOdds,
    matchedText: window.raw,
    matchedSignals: {
      player: true,
      stat: hasStat,
      line: hasLine,
      side: hasSide,
      sideExplicit: hasExplicitSide,
      alternateThreshold: hasAlternateThreshold
    }
  };
}

function matchCandidateOdds(input = {}) {
  const candidates = Array.isArray(input.candidates) ? input.candidates : [];
  const text = String(input.text ?? "");
  const lines = splitLines(text);
  const windows = buildWindows(lines);
  const matches = [];
  const unmatched = [];

  for (const candidate of candidates) {
    const scored = windows
      .map((window) => scoreWindow(candidate, window))
      .filter(Boolean)
      .sort((a, b) => b.confidence - a.confidence);

    const best = scored[0];

    if (!best) {
      unmatched.push({
        candidateId: candidate.id,
        selection: candidate.ticketDraft?.selection ?? candidate.id,
        reason: "No matching player, line, stat/side, and American odds were found in the pasted text."
      });
      continue;
    }

    matches.push({
      candidateId: candidate.id,
      selection: candidate.ticketDraft?.selection ?? candidate.id,
      marketOdds: best.marketOdds,
      confidence: best.confidence,
      matchedText: best.matchedText,
      matchedSignals: best.matchedSignals
    });
  }

  return {
    parsedAt: new Date().toISOString(),
    summary: {
      candidates: candidates.length,
      textLines: lines.length,
      matches: matches.length,
      unmatched: unmatched.length
    },
    matches,
    unmatched,
    warnings: [
      "Bulk odds import only fills market-odds fields. Verify each matched price before evaluating.",
      "OCR text can merge or misread prices; the matched text is shown for audit."
    ]
  };
}

module.exports = {
  matchCandidateOdds
};
