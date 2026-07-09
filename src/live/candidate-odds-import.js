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

  if (lastName) {
    needles.add(lastName);
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

function lineNeedles(candidate) {
  const line = Number(candidate.line);

  if (!Number.isFinite(line)) {
    return [];
  }

  const values = new Set([String(line)]);

  if (candidate.lean === "over") {
    values.add(`${Math.floor(line) + 1}+`);
  }

  return Array.from(values);
}

function sideNeedles(side) {
  if (side === "over") {
    return ["over", " o "];
  }

  if (side === "under") {
    return ["under", " u "];
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
  const normalized = normalizeMinus(text);
  const lowered = normalized.toLowerCase();
  const indexes = playerNeedles(candidate.player?.name ?? "")
    .map((needle) => lowered.indexOf(needle.replace(/\./g, "")))
    .filter((index) => index >= 0);

  if (indexes.length > 0) {
    const sliced = normalized.slice(Math.min(...indexes));
    return americanOddsFromText(sliced)[0] ?? null;
  }

  return americanOddsFromText(normalized)[0] ?? null;
}

function containsAny(haystack, needles) {
  return needles.some((needle) => haystack.includes(needle));
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
  const lines = lineNeedles(candidate);
  const sides = sideNeedles(candidate.lean);
  const odds = americanOddsFromText(window.raw);

  if (odds.length === 0 || !containsAny(window.normalized, names)) {
    return null;
  }

  const hasStat = containsAny(window.normalized, stats);
  const hasLine = containsAny(window.normalized, lines);
  const hasSide = containsAny(window.normalized, sides);
  const marketOdds = firstOddsAfterPlayer(window.raw, candidate);

  if (marketOdds === null || !hasLine || (!hasStat && !hasSide)) {
    return null;
  }

  let confidence = 0.58;

  if (containsAny(window.normalized, [normalizeText(candidate.player?.name ?? "")])) {
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
      side: hasSide
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
