const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs/promises");
const os = require("node:os");
const path = require("node:path");

const {
  normalizeDirectScreenCapture
} = require("../src/live/direct-screen-capture.js");
const {
  persistDirectScreenCapture,
  readLatestDirectScreenCapture
} = require("../src/live/direct-screen-capture-store.js");
const {
  matchDirectScreenCaptureCandidates
} = require("../src/live/direct-screen-candidate-match.js");

const TEST_PNG_BYTES = Buffer.concat([
  Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
  Buffer.from("retained-test-pixels")
]);

function captureInput(overrides = {}) {
  const visibleText = [
    "KC Royals @ DET Tigers",
    "KC Royals",
    "+1.5 −127",
    "+203",
    "DET Tigers",
    "-1.5 +122",
    "−212",
    "Over 4.5 −117",
    "Under 4.5 +113"
  ].join("\n");

  return {
    capturedAt: "2026-07-23T23:41:00.000Z",
    sourceUrl: "https://predictions.draftkings.com/en/event/kc-royals-%40-det-tigers/34425631?category=all-odds&subcategory=game-lines",
    pageTitle: "KC Royals @ DET Tigers Predictions: All Odds - Game Lines | DraftKings Predictions",
    mimeType: "image/png",
    fileName: "kc-det-live.png",
    imageBase64: `data:image/png;base64,${TEST_PNG_BYTES.toString("base64")}`,
    visibleText,
    event: {
      sport: "mlb",
      league: "MLB",
      eventId: "34425631",
      away: "KC Royals",
      home: "DET Tigers",
      status: "live"
    },
    markets: [
      {
        period: "game",
        marketType: "moneyline",
        selection: "KC Royals",
        side: "away",
        line: null,
        americanOdds: 203
      },
      {
        period: "game",
        marketType: "moneyline",
        selection: "DET Tigers",
        side: "home",
        line: null,
        americanOdds: -212
      },
      {
        period: "game",
        marketType: "run_line",
        selection: "KC Royals",
        side: "away",
        line: 1.5,
        americanOdds: -127
      },
      {
        period: "game",
        marketType: "run_line",
        selection: "DET Tigers",
        side: "home",
        line: -1.5,
        americanOdds: 122
      },
      {
        period: "game",
        marketType: "total",
        selection: "Over 4.5",
        side: "over",
        line: 4.5,
        americanOdds: -117
      },
      {
        period: "game",
        marketType: "total",
        selection: "Under 4.5",
        side: "under",
        line: 4.5,
        americanOdds: 113
      }
    ],
    ...overrides
  };
}

test("direct screen capture computes evidence digests and pairs exact visible markets", () => {
  const { capture, image } = normalizeDirectScreenCapture(captureInput(), {
    now: new Date("2026-07-23T23:41:10.000Z")
  });

  assert.match(capture.captureId, /^dsc_[a-f0-9]{24}$/);
  assert.match(capture.evidence.screenshotSha256, /^sha256:[a-f0-9]{64}$/);
  assert.match(capture.evidence.visibleTextSha256, /^sha256:[a-f0-9]{64}$/);
  assert.equal(capture.schemaVersion, "1.0.0");
  assert.equal(capture.provider, "DraftKings Predictions");
  assert.equal(capture.sourceType, "chrome_visible_page_capture");
  assert.equal(capture.evidenceStatus, "captured_unverified");
  assert.equal(capture.betCallPermission, "PRICE_CHECK_ONLY");
  assert.equal(capture.authorizedStake, 0);
  assert.equal(capture.summary.markets, 6);
  assert.equal(capture.summary.completeMarkets, 3);
  assert.equal(capture.summary.incompleteMarkets, 0);
  assert.equal(capture.markets[0].oppositeAmericanOdds, -212);
  assert.equal(capture.markets[0].oppositeSide, "home");
  assert.equal(capture.markets[2].oppositeAmericanOdds, 122);
  assert.equal(capture.markets[4].oppositeAmericanOdds, 113);
  assert.equal("imageBase64" in capture, false);
  assert.ok(Buffer.isBuffer(image.buffer));
  assert.deepEqual(image.buffer, TEST_PNG_BYTES);
  assert.equal(image.visibleText, captureInput().visibleText);
});

test("direct screen capture keeps a visibly single-sided prop incomplete", () => {
  const input = captureInput({
    visibleText: [
      captureInput().visibleText,
      "Riley Greene",
      "Over 1.5 Hits",
      "+121"
    ].join("\n")
  });

  input.markets.push({
    period: "game",
    marketType: "player_prop",
    selection: "Riley Greene Over 1.5 Hits",
    side: "over",
    line: 1.5,
    americanOdds: 121,
    playerName: "Riley Greene",
    statKey: "hits"
  });

  const { capture } = normalizeDirectScreenCapture(input, {
    now: new Date("2026-07-23T23:41:10.000Z")
  });
  const prop = capture.markets.at(-1);

  assert.equal(prop.pairStatus, "incomplete");
  assert.equal(prop.oppositeAmericanOdds, null);
  assert.equal(prop.oppositeSide, "under");
  assert.equal(capture.summary.completeMarkets, 3);
  assert.equal(capture.summary.incompleteMarkets, 1);
  assert.ok(capture.warnings.some((warning) => warning.includes("Riley Greene")));
});

test("direct screen capture accepts an exact visible N+ prop threshold without inventing a decimal display", () => {
  const input = captureInput({
    visibleText: [
      captureInput().visibleText,
      "Michael Massey Home Runs",
      "1+ +2400"
    ].join("\n")
  });

  input.markets.push(/** @type {any} */ ({
    period: "game",
    marketType: "player_prop",
    selection: "Michael Massey 1+ Home Runs",
    side: "over",
    threshold: 1,
    americanOdds: 2400,
    playerName: "Michael Massey",
    statKey: "homeRuns"
  }));

  const { capture } = normalizeDirectScreenCapture(input, {
    now: new Date("2026-07-23T23:41:10.000Z")
  });
  const prop = capture.markets.at(-1);

  assert.equal(prop.threshold, 1);
  assert.equal(prop.line, 0.5);
  assert.equal(prop.statLabel, "Home Runs");
  assert.equal(prop.pairStatus, "incomplete");
  assert.equal(prop.americanOdds, 2400);
  assert.ok(capture.warnings.some((warning) => warning.includes("Michael Massey")));
});

test("direct screen capture keeps opposite run-line orientations at the same magnitude separate", () => {
  const input = captureInput({
    visibleText: [
      captureInput().visibleText,
      "KC Royals -1.5 -150",
      "DET Tigers +1.5 +144"
    ].join("\n")
  });

  input.markets.push(
    {
      period: "game",
      marketType: "run_line",
      selection: "KC Royals -1.5",
      side: "away",
      line: -1.5,
      americanOdds: -150
    },
    {
      period: "game",
      marketType: "run_line",
      selection: "DET Tigers +1.5",
      side: "home",
      line: 1.5,
      americanOdds: 144
    }
  );

  const { capture } = normalizeDirectScreenCapture(input, {
    now: new Date("2026-07-23T23:41:10.000Z")
  });

  assert.equal(capture.summary.completeMarkets, 4);
  assert.equal(capture.summary.incompleteMarkets, 0);
  assert.equal(capture.markets[2].oppositeAmericanOdds, 122);
  assert.equal(capture.markets[6].oppositeAmericanOdds, 144);
});

test("direct screen capture rejects unsupported or fictional sources", () => {
  assert.throws(
    () => normalizeDirectScreenCapture(captureInput({
      sourceUrl: "https://example.com/fake-odds"
    })),
    /predictions\.draftkings\.com/
  );
});

test("direct screen capture rejects bytes that do not match the declared image type", () => {
  assert.throws(
    () => normalizeDirectScreenCapture(captureInput({
      imageBase64: `data:image/png;base64,${Buffer.from("not-a-png").toString("base64")}`
    })),
    /PNG signature/
  );
});

test("direct screen capture requires the exact displayed American-odds sign", () => {
  const input = captureInput();
  const adjacentSign = captureInput();

  input.visibleText = input.visibleText.replace("+203", "-203");
  adjacentSign.visibleText = adjacentSign.visibleText.replace("+203", "-+203");

  assert.throws(
    () => normalizeDirectScreenCapture(input),
    /visible page text/
  );
  assert.throws(
    () => normalizeDirectScreenCapture(adjacentSign),
    /visible page text/
  );
});

test("direct screen capture rejects a negative total line", () => {
  const input = captureInput();

  input.markets[4].line = -4.5;
  input.markets[4].selection = "Over -4.5";
  input.visibleText += "\nOver -4.5 -117";

  assert.throws(
    () => normalizeDirectScreenCapture(input),
    /total line/
  );
});

test("direct screen capture rejects a future timestamp", () => {
  assert.throws(
    () => normalizeDirectScreenCapture(captureInput({
      capturedAt: "2026-07-23T23:42:00.000Z"
    }), {
      now: new Date("2026-07-23T23:41:10.000Z")
    }),
    /future/
  );
});

test("direct screen capture retains a closed board with zero rows but rejects an empty live board", () => {
  const unavailable = captureInput({
    visibleText: "KC Royals @ DET Tigers",
    markets: [],
    event: {
      ...captureInput().event,
      status: "market_unavailable"
    }
  });
  const live = captureInput({
    visibleText: "KC Royals @ DET Tigers",
    markets: []
  });
  const { capture } = normalizeDirectScreenCapture(unavailable, {
    now: new Date("2026-07-23T23:41:10.000Z")
  });

  assert.equal(capture.summary.markets, 0);
  assert.equal(capture.summary.completeMarkets, 0);
  assert.equal(capture.summary.incompleteMarkets, 0);
  assert.ok(capture.warnings.some((warning) => warning.includes("no visible market rows")));
  assert.throws(
    () => normalizeDirectScreenCapture(live),
    /at least one visible market row/
  );
});

test("direct screen capture retains an explicit conflicting-price omission", () => {
  const input = captureInput({
    visibleText: [
      captureInput().visibleText,
      "Under 7.5 +100",
      "Under 7.5 -104"
    ].join("\n"),
    omissions: [
      {
        period: "game",
        marketType: "total",
        selection: "Under 7.5",
        side: "under",
        line: 7.5,
        reason: "conflicting_visible_prices",
        visibleRows: [
          {
            label: "Under 7.5",
            americanOdds: 100
          },
          {
            label: "Under 7.5",
            americanOdds: -104
          }
        ]
      }
    ]
  });
  const { capture } = normalizeDirectScreenCapture(input, {
    now: new Date("2026-07-23T23:41:10.000Z")
  });

  assert.equal(capture.summary.omissions, 1);
  assert.deepEqual(capture.omissions[0].visibleAmericanOdds, [100, -104]);
  assert.deepEqual(
    capture.omissions[0].visibleRows.map((row) => row.label),
    ["Under 7.5", "Under 7.5"]
  );
  assert.ok(capture.warnings.some((warning) => warning.includes("Under 7.5")));
});

test("direct screen capture rejects a priced row for an omitted market identity", () => {
  const input = captureInput({
    visibleText: [
      captureInput().visibleText,
      "U 7.5 +100",
      "Under 7.5 -104"
    ].join("\n"),
    omissions: [
      {
        period: "game",
        marketType: "total",
        selection: "Under 7.5",
        side: "under",
        line: 7.5,
        reason: "conflicting_visible_prices",
        visibleRows: [
          { label: "U 7.5", americanOdds: 100 },
          { label: "Under 7.5", americanOdds: -104 }
        ]
      }
    ]
  });

  input.markets.push({
    period: "game",
    marketType: "total",
    selection: "Under 7.5",
    side: "under",
    line: 7.5,
    americanOdds: 100
  });

  assert.throws(
    () => normalizeDirectScreenCapture(input),
    /duplicates an omitted conflicting market/
  );

  input.markets.pop();
  input.markets.push({
    period: "game",
    marketType: "total",
    selection: "Over 7.5",
    side: "over",
    line: 7.5,
    americanOdds: -104
  });
  input.visibleText += "\nOver 7.5 -104";

  assert.throws(
    () => normalizeDirectScreenCapture(input),
    /duplicates an omitted conflicting market/
  );
});

test("direct screen capture binds every omitted price to the same visible market row", () => {
  const input = captureInput({
    omissions: [
      {
        period: "game",
        marketType: "total",
        selection: "Under 4.5",
        side: "under",
        line: 4.5,
        reason: "conflicting_visible_prices",
        visibleRows: [
          { label: "Under 4.5", americanOdds: 113 },
          { label: "Under 4.5", americanOdds: -117 }
        ]
      }
    ]
  });

  assert.throws(
    () => normalizeDirectScreenCapture(input),
    /own retained row/
  );
});

test("direct screen capture reports omission price errors at the exact input path", () => {
  const input = captureInput({
    omissions: [
      {
        period: "game",
        marketType: "total",
        selection: "Under 4.5",
        side: "under",
        line: 4.5,
        reason: "conflicting_visible_prices",
        visibleRows: [
          { label: "Under 4.5", americanOdds: 0 },
          { label: "Under 4.5", americanOdds: 113 }
        ]
      }
    ]
  });

  assert.throws(
    () => normalizeDirectScreenCapture(input),
    /omissions\[0\]\.visibleRows\[0\]\.americanOdds/
  );
});

test("direct screen capture requires separate retained rows for conflicting prices", () => {
  const input = captureInput({
    visibleText: [
      captureInput().visibleText,
      "Under 7.5 +100 -104"
    ].join("\n"),
    omissions: [
      {
        period: "game",
        marketType: "total",
        selection: "Under 7.5",
        side: "under",
        line: 7.5,
        reason: "conflicting_visible_prices",
        visibleRows: [
          { label: "Under 7.5", americanOdds: 100 },
          { label: "Under 7.5", americanOdds: -104 }
        ]
      }
    ]
  });

  assert.throws(
    () => normalizeDirectScreenCapture(input),
    /own retained row/
  );
});

test("direct screen capture binds total omissions to the Game Lines page", () => {
  const input = captureInput({
    sourceUrl: "https://predictions.draftkings.com/en/event/kc-royals-%40-det-tigers/34425631?category=all-odds&subcategory=1st-x-innings",
    pageTitle: "KC Royals @ DET Tigers Predictions: All Odds - 1st X Innings | DraftKings Predictions",
    visibleText: [
      captureInput().visibleText,
      "1st 5 Innings U 7.5 +100",
      "1st 5 Innings Under 7.5 -104"
    ].join("\n"),
    omissions: [
      {
        period: "game",
        marketType: "total",
        selection: "Under 7.5",
        side: "under",
        line: 7.5,
        reason: "conflicting_visible_prices",
        visibleRows: [
          { label: "U 7.5", americanOdds: 100 },
          { label: "Under 7.5", americanOdds: -104 }
        ]
      }
    ]
  });

  assert.throws(
    () => normalizeDirectScreenCapture(input),
    /Game Lines page/
  );
});

test("direct screen capture rejects unsupported total omission increments", () => {
  const input = captureInput({
    visibleText: [
      captureInput().visibleText,
      "Under 7.3 +100",
      "Under 7.3 -104"
    ].join("\n"),
    omissions: [
      {
        period: "game",
        marketType: "total",
        selection: "Under 7.3",
        side: "under",
        line: 7.3,
        reason: "conflicting_visible_prices",
        visibleRows: [
          { label: "Under 7.3", americanOdds: 100 },
          { label: "Under 7.3", americanOdds: -104 }
        ]
      }
    ]
  });

  assert.throws(
    () => normalizeDirectScreenCapture(input),
    /whole or half total line/
  );
});

test("direct screen capture rejects missing visible evidence tokens", () => {
  assert.throws(
    () => normalizeDirectScreenCapture(captureInput({
      visibleText: "KC Royals @ DET Tigers"
    })),
    /visible page text/
  );
});

test("direct screen capture rejects zero and non-integer American odds", () => {
  const zero = captureInput();
  zero.markets[0].americanOdds = 0;
  const decimal = captureInput();
  decimal.markets[0].americanOdds = 203.5;

  assert.throws(() => normalizeDirectScreenCapture(zero), /American odds/);
  assert.throws(() => normalizeDirectScreenCapture(decimal), /American odds/);
});

test("direct screen capture rejects duplicate or overfilled market pairs", () => {
  const duplicate = captureInput();
  duplicate.markets.push({ ...duplicate.markets[0] });
  const overfilled = captureInput();
  overfilled.markets.push({
    ...overfilled.markets[0],
    selection: "Another Away",
    americanOdds: 204
  });
  overfilled.visibleText += "\nAnother Away\n+204";

  assert.throws(() => normalizeDirectScreenCapture(duplicate), /duplicate side/i);
  assert.throws(() => normalizeDirectScreenCapture(overfilled), /duplicate side|more than two/i);
});

test("direct screen capture identifies N+ and decimal duplicate representations", () => {
  const input = captureInput({
    visibleText: [
      captureInput().visibleText,
      "Michael Massey Home Runs",
      "1+ +2400",
      "Over 0.5 Home Runs +2300"
    ].join("\n")
  });

  input.markets.push(
    /** @type {any} */ ({
      period: "game",
      marketType: "player_prop",
      selection: "Michael Massey 1+ Home Runs",
      side: "over",
      threshold: 1,
      americanOdds: 2400,
      playerName: "Michael Massey",
      statKey: "homeRuns"
    }),
    /** @type {any} */ ({
      period: "game",
      marketType: "player_prop",
      selection: "Michael Massey Over 0.5 Home Runs",
      side: "over",
      line: 0.5,
      americanOdds: 2300,
      playerName: "Michael Massey",
      statKey: "homeRuns"
    })
  );

  assert.throws(
    () => normalizeDirectScreenCapture(input),
    /both N\+ and decimal representations/
  );

  input.markets.at(-1).side = "under";
  input.markets.at(-1).selection = "Michael Massey Under 0.5 Home Runs";
  input.visibleText += "\nUnder 0.5 Home Runs +2300";

  assert.throws(
    () => normalizeDirectScreenCapture(input),
    /both N\+ and decimal representations/
  );
});

test("direct screen capture rejects unsupported yes-no player prop sides", () => {
  const input = captureInput();

  input.markets.push(/** @type {any} */ ({
    period: "game",
    marketType: "player_prop",
    selection: "Riley Greene to record a hit",
    side: "yes",
    line: 0.5,
    americanOdds: 120,
    playerName: "Riley Greene",
    statKey: "hits"
  }));
  input.visibleText += "\nRiley Greene to record a hit Yes +120";

  assert.throws(
    () => normalizeDirectScreenCapture(input),
    /side is not valid/
  );
});

test("direct screen capture requires full displayed team names", () => {
  for (const away of ["KC", "Reds"]) {
    assert.throws(
      () => normalizeDirectScreenCapture(captureInput({
        event: {
          ...captureInput().event,
          away
        }
      })),
      /full team name/
    );
  }
});

test("direct screen capture store retains one digest-addressed image and one idempotent envelope", async (t) => {
  const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), "bear-edge-direct-capture-"));
  const ledgerPath = path.join(tempDir, "direct_screen_captures.jsonl");
  const artifactDir = path.join(tempDir, "screenshots");

  t.after(() => fs.rm(tempDir, { recursive: true, force: true }));

  const normalized = normalizeDirectScreenCapture(captureInput(), {
    now: new Date("2026-07-23T23:41:10.000Z")
  });
  const first = await persistDirectScreenCapture(normalized.capture, normalized.image, {
    ledgerPath,
    artifactDir
  });
  const second = await persistDirectScreenCapture(normalized.capture, normalized.image, {
    ledgerPath,
    artifactDir
  });
  const contents = await fs.readFile(ledgerPath, "utf8");
  const lines = contents.trim().split(/\r?\n/);
  const retained = JSON.parse(lines[0]);
  const artifactBytes = await fs.readFile(first.artifactPath);

  assert.equal(first.idempotent, false);
  assert.equal(second.idempotent, true);
  assert.equal(lines.length, 1);
  assert.equal(retained.captureId, normalized.capture.captureId);
  assert.equal(retained.evidence.screenshotArtifact, "screenshots/" + path.basename(first.artifactPath));
  assert.equal(
    retained.evidence.visibleTextArtifact,
    "screenshots/" + path.basename(first.visibleTextArtifactPath)
  );
  assert.equal(JSON.stringify(retained).includes("imageBase64"), false);
  assert.deepEqual(artifactBytes, TEST_PNG_BYTES);
  assert.equal(
    await fs.readFile(first.visibleTextArtifactPath, "utf8"),
    captureInput().visibleText
  );

  const latest = await readLatestDirectScreenCapture({ ledgerPath });

  assert.equal(latest.latest.captureId, normalized.capture.captureId);
  assert.equal(latest.summary.records, 1);
  assert.equal(latest.malformedLines.length, 0);
});

test("direct screen capture store reports malformed retained lines without hiding the latest valid capture", async (t) => {
  const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), "bear-edge-direct-capture-malformed-"));
  const ledgerPath = path.join(tempDir, "direct_screen_captures.jsonl");
  const artifactDir = path.join(tempDir, "screenshots");

  t.after(() => fs.rm(tempDir, { recursive: true, force: true }));

  const normalized = normalizeDirectScreenCapture(captureInput(), {
    now: new Date("2026-07-23T23:41:10.000Z")
  });

  await persistDirectScreenCapture(normalized.capture, normalized.image, {
    ledgerPath,
    artifactDir
  });
  await fs.appendFile(ledgerPath, "{malformed\n", "utf8");

  const latest = await readLatestDirectScreenCapture({ ledgerPath });

  assert.equal(latest.latest.captureId, normalized.capture.captureId);
  assert.equal(latest.summary.records, 1);
  assert.equal(latest.malformedLines.length, 1);
  assert.equal(latest.malformedLines[0].lineNumber, 2);
});

test("direct screen capture store rejects a capture id that does not match its full digest", async (t) => {
  const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), "bear-edge-direct-capture-id-"));
  const ledgerPath = path.join(tempDir, "direct_screen_captures.jsonl");
  const artifactDir = path.join(tempDir, "screenshots");

  t.after(() => fs.rm(tempDir, { recursive: true, force: true }));

  const normalized = normalizeDirectScreenCapture(captureInput(), {
    now: new Date("2026-07-23T23:41:10.000Z")
  });

  await assert.rejects(
    persistDirectScreenCapture({
      ...normalized.capture,
      captureId: "dsc_000000000000000000000000"
    }, normalized.image, {
      ledgerPath,
      artifactDir
    }),
    /captureId/
  );
});

test("direct screen capture store appends concurrent records as complete JSON lines", async (t) => {
  const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), "bear-edge-direct-capture-concurrent-"));
  const ledgerPath = path.join(tempDir, "direct_screen_captures.jsonl");
  const artifactDir = path.join(tempDir, "screenshots");

  t.after(() => fs.rm(tempDir, { recursive: true, force: true }));

  const captures = [0, 1, 2].map((offset) => normalizeDirectScreenCapture(captureInput({
    capturedAt: `2026-07-23T23:41:0${offset}.000Z`,
    imageBase64: `data:image/png;base64,${Buffer.concat([
      TEST_PNG_BYTES,
      Buffer.from(String(offset))
    ]).toString("base64")}`
  }), {
    now: new Date("2026-07-23T23:41:10.000Z")
  }));

  await Promise.all(captures.map((entry) => persistDirectScreenCapture(
    entry.capture,
    entry.image,
    { ledgerPath, artifactDir }
  )));

  const lines = (await fs.readFile(ledgerPath, "utf8")).trim().split(/\r?\n/);

  assert.equal(lines.length, 3);
  assert.equal(lines.map((line) => JSON.parse(line).captureId).length, 3);
});

function playerPropCapture({ paired = true } = {}) {
  const base = captureInput();
  const propText = [
    "Riley Greene",
    "Over 1.5 Hits",
    "+121",
    ...(paired ? ["Under 1.5 Hits", "-131"] : [])
  ];
  const markets = [
    ...base.markets,
    {
      period: "game",
      marketType: "player_prop",
      selection: "Riley Greene Over 1.5 Hits",
      side: "over",
      line: 1.5,
      americanOdds: 121,
      playerName: "Riley Greene",
      statKey: "hits"
    }
  ];

  if (paired) {
    markets.push({
      period: "game",
      marketType: "player_prop",
      selection: "Riley Greene Under 1.5 Hits",
      side: "under",
      line: 1.5,
      americanOdds: -131,
      playerName: "Riley Greene",
      statKey: "hits"
    });
  }

  return normalizeDirectScreenCapture({
    ...base,
    visibleText: [base.visibleText, ...propText].join("\n"),
    markets
  }, {
    now: new Date("2026-07-23T23:41:10.000Z")
  }).capture;
}

function researchCandidate(overrides = {}) {
  return {
    id: "mlb-745926-away-682985-hits",
    sport: "mlb",
    gameDate: "2026-07-23T22:40:00.000Z",
    player: {
      name: "Riley Greene",
      teamName: "Detroit Tigers",
      opponentName: "Kansas City Royals"
    },
    statKey: "hits",
    line: 1.5,
    lean: "over",
    ticketDraft: {
      selection: "Riley Greene over 1.5 hits"
    },
    ...overrides
  };
}

test("direct screen capture matcher prices only an exact complete player-prop candidate", () => {
  const capture = playerPropCapture();
  const result = matchDirectScreenCaptureCandidates({
    capture,
    now: new Date("2026-07-23T23:41:10.000Z"),
    candidates: [
      researchCandidate(),
      researchCandidate({ id: "surname-only", player: { name: "Joe Greene" } }),
      researchCandidate({ id: "wrong-line", line: 2.5 }),
      researchCandidate({ id: "wrong-side", lean: "yes" }),
      researchCandidate({ id: "wrong-date", gameDate: "2026-07-24T22:40:00.000Z" }),
      researchCandidate({
        id: "wrong-event",
        player: {
          name: "Riley Greene",
          teamName: "Detroit Tigers",
          opponentName: "Baltimore Orioles"
        }
      })
    ]
  });

  assert.equal(result.summary.candidates, 6);
  assert.equal(result.summary.matches, 1);
  assert.equal(result.summary.waitEvidence, 0);
  assert.equal(result.summary.unmatched, 5);
  assert.equal(result.matches[0].candidateId, "mlb-745926-away-682985-hits");
  assert.equal(result.matches[0].marketOdds, 121);
  assert.equal(result.matches[0].oppositeOdds, -131);
  assert.equal(result.matches[0].captureId, capture.captureId);
  assert.equal(result.matches[0].evidenceStatus, "captured_unverified");
  assert.equal(result.matches[0].betCallPermission, "PRICE_CHECK_ONLY");
  assert.equal(result.matches[0].authorizedStake, 0);
});

test("direct screen capture matcher retains an exact single-sided prop as WAIT evidence", () => {
  const capture = playerPropCapture({ paired: false });
  const result = matchDirectScreenCaptureCandidates({
    capture,
    now: new Date("2026-07-23T23:41:10.000Z"),
    candidates: [researchCandidate()]
  });

  assert.equal(result.summary.matches, 0);
  assert.equal(result.summary.waitEvidence, 1);
  assert.equal(result.summary.unmatched, 0);
  assert.equal(result.waitEvidence[0].candidateId, "mlb-745926-away-682985-hits");
  assert.equal(result.waitEvidence[0].marketOdds, 121);
  assert.equal(result.waitEvidence[0].oppositeOdds, null);
  assert.equal(result.waitEvidence[0].status, "WAIT");
  assert.equal(result.waitEvidence[0].reasonCode, "MISSING_OPPOSITE_PRICE");
});

test("direct screen capture matcher uses the scheduled event window across UTC midnight", () => {
  const capture = {
    ...playerPropCapture(),
    capturedAt: "2026-07-24T00:35:38.586Z"
  };
  const result = matchDirectScreenCaptureCandidates({
    capture,
    candidates: [researchCandidate()],
    now: new Date("2026-07-24T00:36:00.000Z")
  });

  assert.equal(result.summary.matches, 1);
  assert.equal(result.matches[0].candidateId, "mlb-745926-away-682985-hits");
});

test("direct screen capture matcher refuses to price a stale retained screen", () => {
  const capture = playerPropCapture();
  const result = matchDirectScreenCaptureCandidates({
    capture,
    candidates: [researchCandidate()],
    now: new Date("2026-07-23T23:47:00.001Z")
  });

  assert.equal(result.summary.matches, 0);
  assert.equal(result.summary.waitEvidence, 0);
  assert.equal(result.summary.unmatched, 1);
  assert.equal(result.unmatched[0].reasonCode, "STALE_CAPTURE");
  assert.ok(result.warnings.some((warning) => warning.includes("stale")));
});

test("direct screen capture matcher refuses duplicate matching candidates", () => {
  const capture = playerPropCapture();
  const result = matchDirectScreenCaptureCandidates({
    capture,
    candidates: [
      researchCandidate(),
      researchCandidate({ id: "doubleheader-second-game", gameId: "second-game" })
    ],
    now: new Date("2026-07-23T23:41:10.000Z")
  });

  assert.equal(result.summary.matches, 0);
  assert.equal(result.summary.waitEvidence, 0);
  assert.equal(result.summary.unmatched, 2);
  assert.ok(result.unmatched.every((item) => item.reasonCode === "AMBIGUOUS_EVENT_MATCH"));
});

test("direct screen capture matcher separates split-doubleheader candidates by scheduled start", () => {
  const capture = {
    ...playerPropCapture(),
    capturedAt: "2026-07-24T04:41:00.000Z"
  };
  const result = matchDirectScreenCaptureCandidates({
    capture,
    candidates: [
      researchCandidate({ id: "first-game" }),
      researchCandidate({
        id: "second-game",
        gameDate: "2026-07-24T04:40:00.000Z"
      })
    ],
    now: new Date("2026-07-24T04:42:00.000Z")
  });

  assert.equal(result.summary.matches, 1);
  assert.equal(result.summary.unmatched, 1);
  assert.equal(result.matches[0].candidateId, "second-game");
  assert.equal(result.unmatched[0].candidateId, "first-game");
});

test("direct screen capture matcher refuses one candidate matching multiple retained markets", () => {
  const capture = playerPropCapture();
  const duplicatedMarket = {
    ...capture.markets.at(-2),
    americanOdds: 122,
    oppositeAmericanOdds: -132
  };
  const result = matchDirectScreenCaptureCandidates({
    capture: {
      ...capture,
      markets: [...capture.markets, duplicatedMarket]
    },
    candidates: [researchCandidate()],
    now: new Date("2026-07-23T23:41:10.000Z")
  });

  assert.equal(result.summary.matches, 0);
  assert.equal(result.summary.unmatched, 1);
  assert.equal(result.unmatched[0].reasonCode, "AMBIGUOUS_EVENT_MATCH");
});

test("direct screen capture matcher distinguishes Boston and Chicago Sox identities", () => {
  const capture = {
    ...playerPropCapture(),
    event: {
      ...playerPropCapture().event,
      away: "Boston Red Sox",
      home: "Baltimore Orioles"
    }
  };
  const result = matchDirectScreenCaptureCandidates({
    capture,
    candidates: [researchCandidate({
      player: {
        name: "Riley Greene",
        teamName: "Chicago White Sox",
        opponentName: "Baltimore Orioles"
      }
    })],
    now: new Date("2026-07-23T23:41:10.000Z")
  });

  assert.equal(result.summary.matches, 0);
  assert.equal(result.unmatched[0].reasonCode, "NO_EXACT_CAPTURE_MATCH");
});

test("direct screen capture matcher permits four hours after start and rejects six hours", () => {
  const capture = {
    ...playerPropCapture(),
    capturedAt: "2026-07-24T02:40:00.000Z"
  };
  const withinWindow = matchDirectScreenCaptureCandidates({
    capture,
    candidates: [researchCandidate()],
    now: new Date("2026-07-24T02:41:00.000Z")
  });
  const outsideWindow = matchDirectScreenCaptureCandidates({
    capture: {
      ...capture,
      capturedAt: "2026-07-24T04:40:00.001Z"
    },
    candidates: [researchCandidate()],
    now: new Date("2026-07-24T04:41:00.000Z")
  });

  assert.equal(withinWindow.summary.matches, 1);
  assert.equal(outsideWindow.summary.matches, 0);
});

module.exports = {
  captureInput,
  playerPropCapture,
  researchCandidate
};
