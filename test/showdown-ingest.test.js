const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");

const {
  SnapshotStore,
  redactUrl,
  snapshotDigest
} = require("../src/showdown/snapshot-store.js");
const { CreditBudget, billingPeriod } = require("../src/showdown/credit-budget.js");
const {
  buildEventOddsUrl,
  buildKeys,
  extractTwoSidedProps,
  ingestStrikeoutProps
} = require("../src/showdown/ingest-props.js");
const { parsePredictionRecord } = require("../src/showdown/records.js");

function tempDir(label) {
  return fs.mkdtempSync(path.join(os.tmpdir(), `showdown-${label}-`));
}

function eventPayload(overrides = {}) {
  return {
    id: "evt-1",
    sport_key: "baseball_mlb",
    commence_time: "2026-07-28T23:10:00Z",
    home_team: "Home",
    away_team: "Away",
    bookmakers: [
      {
        key: "draftkings",
        title: "DraftKings",
        markets: [
          {
            key: "pitcher_strikeouts",
            last_update: "2026-07-28T21:09:00Z",
            outcomes: [
              { name: "Over", description: "Ace Pitcher", price: -115, point: 5.5 },
              { name: "Under", description: "Ace Pitcher", price: -105, point: 5.5 },
              { name: "Over", description: "Other Pitcher", price: 100, point: 4.5 },
              { name: "Under", description: "Other Pitcher", price: -120, point: 4.5 }
            ]
          }
        ]
      }
    ],
    ...overrides
  };
}

test("redactUrl removes the API key and stabilises parameter order", () => {
  const redacted = redactUrl(
    "https://api.the-odds-api.com/v4/sports/baseball_mlb/events?markets=pitcher_strikeouts&apiKey=SECRET123&regions=us"
  );

  assert.ok(!redacted.includes("SECRET123"));
  assert.ok(redacted.includes("apiKey=REDACTED"));
  assert.ok(redacted.indexOf("markets") < redacted.indexOf("regions"));
});

test("two requests differing only by API key resolve to the same snapshot", () => {
  const left = redactUrl("https://api.the-odds-api.com/v4/x?apiKey=AAA&regions=us");
  const right = redactUrl("https://api.the-odds-api.com/v4/x?apiKey=BBB&regions=us");

  assert.equal(snapshotDigest(left), snapshotDigest(right));
});

test("snapshot store round-trips a payload and never stores the key", () => {
  const root = tempDir("store");
  const store = new SnapshotStore({ root });
  const requestUrl = "https://api.the-odds-api.com/v4/x?apiKey=SECRET123&regions=us";

  store.write({
    provider: "the_odds_api",
    requestUrl,
    payload: { hello: "world" },
    creditCost: 1,
    capturedAt: "2026-07-28T21:10:00Z"
  });

  const read = store.read("the_odds_api", requestUrl);

  assert.deepEqual(read.payload, { hello: "world" });
  assert.equal(read.creditCost, 1);

  const onDisk = fs.readFileSync(read.path, "utf8");
  assert.ok(!onDisk.includes("SECRET123"));
});

test("snapshot store is immutable on rewrite", () => {
  const root = tempDir("immutable");
  const store = new SnapshotStore({ root });
  const requestUrl = "https://api.the-odds-api.com/v4/x?apiKey=K&regions=us";

  store.write({
    provider: "the_odds_api",
    requestUrl,
    payload: { version: "first" },
    capturedAt: "2026-07-28T21:10:00Z"
  });
  store.write({
    provider: "the_odds_api",
    requestUrl,
    payload: { version: "second" },
    capturedAt: "2026-07-28T21:10:00Z"
  });

  assert.deepEqual(
    store.read("the_odds_api", requestUrl).payload,
    { version: "first" }
  );
});

test("credit budget refuses a spend that would breach the cap", () => {
  const dir = tempDir("budget");
  const budget = new CreditBudget({
    ledgerPath: path.join(dir, "ledger.jsonl"),
    monthlyCap: 3
  });

  budget.spend({ credits: 2, reason: "test" });

  assert.equal(budget.remaining(), 1);
  assert.equal(budget.check(1).allowed, true);
  assert.equal(budget.check(2).allowed, false);
  assert.throws(() => budget.spend({ credits: 2, reason: "test" }), /would exceed/);
  assert.equal(budget.remaining(), 1);
});

test("credit budget isolates spending by billing period", () => {
  const dir = tempDir("period");
  const ledgerPath = path.join(dir, "ledger.jsonl");
  const july = new CreditBudget({
    ledgerPath,
    monthlyCap: 5,
    now: () => new Date("2026-07-15T00:00:00Z")
  });

  july.spend({ credits: 5, reason: "july" });
  assert.equal(july.remaining(), 0);

  const august = new CreditBudget({
    ledgerPath,
    monthlyCap: 5,
    now: () => new Date("2026-08-01T00:00:00Z")
  });

  assert.equal(august.remaining(), 5);
  assert.equal(billingPeriod(new Date("2026-08-01T00:00:00Z")), "2026-08");
});

test("credit budget flags drift against the provider counter", () => {
  const dir = tempDir("drift");
  const budget = new CreditBudget({
    ledgerPath: path.join(dir, "ledger.jsonl"),
    monthlyCap: 450
  });

  budget.spend({ credits: 10, reason: "test" });

  const clean = budget.reconcile(490);
  assert.equal(clean.drift, 0);
  assert.equal(clean.warning, null);

  const drifted = budget.reconcile(400);
  assert.equal(drifted.drift, 90);
  assert.match(drifted.warning, /outside the budget guard/);
});

test("extractTwoSidedProps pairs over and under at the same line", () => {
  const props = extractTwoSidedProps(eventPayload());

  assert.equal(props.length, 2);
  const ace = props.find((prop) => prop.player === "Ace Pitcher");
  assert.equal(ace.line, 5.5);
  assert.equal(ace.overAmericanOdds, -115);
  assert.equal(ace.underAmericanOdds, -105);
});

test("extractTwoSidedProps drops a one-sided price", () => {
  const payload = eventPayload({
    bookmakers: [
      {
        key: "draftkings",
        markets: [
          {
            key: "pitcher_strikeouts",
            outcomes: [
              { name: "Over", description: "Lonely Pitcher", price: -115, point: 5.5 }
            ]
          }
        ]
      }
    ]
  });

  assert.equal(extractTwoSidedProps(payload).length, 0);
});

test("extractTwoSidedProps never pairs across different lines", () => {
  const payload = eventPayload({
    bookmakers: [
      {
        key: "draftkings",
        markets: [
          {
            key: "pitcher_strikeouts",
            outcomes: [
              { name: "Over", description: "Split Pitcher", price: -115, point: 5.5 },
              { name: "Under", description: "Split Pitcher", price: -105, point: 6.5 }
            ]
          }
        ]
      }
    ]
  });

  assert.equal(extractTwoSidedProps(payload).length, 0);
});

test("buildEventOddsUrl requests exactly one market and one region", () => {
  const url = buildEventOddsUrl({ apiKey: "K", eventId: "evt-1" });

  assert.ok(url.includes("markets=pitcher_strikeouts"));
  assert.ok(url.includes("regions=us"));
  assert.ok(url.includes("bookmakers=draftkings"));
  assert.equal(url.split("markets=").length - 1, 1);
});

test("buildKeys escapes pipe characters so the comparison key stays parseable", () => {
  const keys = buildKeys({ eventId: "evt", player: "Odd|Name", line: 5.5 });

  assert.equal(keys.comparisonKey, "evt|Odd/Name|strikeouts|over|5.5");
  assert.equal(keys.comparisonKey.split("|").length, 5);
});

test("a dry run walks the whole path and spends nothing", async () => {
  const dir = tempDir("dryrun");
  let paidCalls = 0;

  const result = await ingestStrikeoutProps({
    apiKey: "K",
    now: () => new Date("2026-07-28T21:00:00Z"),
    store: new SnapshotStore({ root: path.join(dir, "snapshots") }),
    budget: new CreditBudget({
      ledgerPath: path.join(dir, "ledger.jsonl"),
      monthlyCap: 450
    }),
    dryRun: true,
    fetchJsonImpl: async (url) => {
      if (url.includes("/events?")) {
        return { data: [eventPayload()] };
      }
      paidCalls += 1;
      return { data: eventPayload() };
    }
  });

  assert.equal(paidCalls, 0);
  assert.equal(result.creditsSpent, 0);
  assert.equal(result.records.length, 0);
  assert.equal(result.skipped[0].reason, "dry_run_would_spend_1_credit");
});

test("ingestion spends one credit per game and emits valid baseline records", async () => {
  const dir = tempDir("ingest");
  const store = new SnapshotStore({ root: path.join(dir, "snapshots") });
  const budget = new CreditBudget({
    ledgerPath: path.join(dir, "ledger.jsonl"),
    monthlyCap: 450
  });

  const result = await ingestStrikeoutProps({
    apiKey: "K",
    now: () => new Date("2026-07-28T21:00:00Z"),
    store,
    budget,
    fetchJsonImpl: async (url) => (
      url.includes("/events?")
        ? { data: [eventPayload()] }
        : { data: eventPayload() }
    )
  });

  assert.equal(result.creditsSpent, 1);
  assert.equal(result.records.length, 2);
  assert.equal(result.creditsRemaining, 449);

  result.records.forEach((record) => {
    parsePredictionRecord(record);
    assert.equal(record.modelKey, "market_baseline");
    assert.match(record.priceSource, /^the_odds_api:draftkings$/);
  });
});

test("a second identical run costs nothing and is served from disk", async () => {
  const dir = tempDir("replay");
  const store = new SnapshotStore({ root: path.join(dir, "snapshots") });
  const budget = new CreditBudget({
    ledgerPath: path.join(dir, "ledger.jsonl"),
    monthlyCap: 450
  });
  let paidCalls = 0;

  const options = {
    apiKey: "K",
    now: () => new Date("2026-07-28T21:00:00Z"),
    store,
    budget,
    fetchJsonImpl: async (url) => {
      if (url.includes("/events?")) {
        return { data: [eventPayload()] };
      }
      paidCalls += 1;
      return { data: eventPayload() };
    }
  };

  const first = await ingestStrikeoutProps(options);
  const second = await ingestStrikeoutProps(options);

  assert.equal(paidCalls, 1);
  assert.equal(first.creditsSpent, 1);
  assert.equal(second.creditsSpent, 0);
  assert.equal(second.cacheHits, 1);
  assert.equal(second.records.length, first.records.length);
  assert.equal(budget.spentInPeriod(), 1);
});

test("an exhausted budget stops the network rather than overspending", async () => {
  const dir = tempDir("exhausted");
  let paidCalls = 0;

  const result = await ingestStrikeoutProps({
    apiKey: "K",
    now: () => new Date("2026-07-28T21:00:00Z"),
    store: new SnapshotStore({ root: path.join(dir, "snapshots") }),
    budget: new CreditBudget({
      ledgerPath: path.join(dir, "ledger.jsonl"),
      monthlyCap: 0
    }),
    fetchJsonImpl: async (url) => {
      if (url.includes("/events?")) {
        return { data: [eventPayload()] };
      }
      paidCalls += 1;
      return { data: eventPayload() };
    }
  });

  assert.equal(paidCalls, 0);
  assert.equal(result.creditsSpent, 0);
  assert.equal(result.records.length, 0);
  assert.match(result.skipped[0].reason, /would exceed/);
});

test("an event with no props on the board is not charged", async () => {
  const dir = tempDir("empty");
  const budget = new CreditBudget({
    ledgerPath: path.join(dir, "ledger.jsonl"),
    monthlyCap: 450
  });

  const result = await ingestStrikeoutProps({
    apiKey: "K",
    now: () => new Date("2026-07-28T21:00:00Z"),
    store: new SnapshotStore({ root: path.join(dir, "snapshots") }),
    budget,
    fetchJsonImpl: async (url) => (
      url.includes("/events?")
        ? { data: [eventPayload()] }
        : { data: { ...eventPayload(), bookmakers: [] } }
    )
  });

  assert.equal(result.creditsSpent, 0);
  assert.equal(budget.spentInPeriod(), 0);
  assert.match(result.skipped[0].reason, /no_two_sided_props_returned/);
});

test("games already started are not priced", async () => {
  const dir = tempDir("started");

  const result = await ingestStrikeoutProps({
    apiKey: "K",
    now: () => new Date("2026-07-29T02:00:00Z"),
    store: new SnapshotStore({ root: path.join(dir, "snapshots") }),
    budget: new CreditBudget({
      ledgerPath: path.join(dir, "ledger.jsonl"),
      monthlyCap: 450
    }),
    fetchJsonImpl: async () => ({ data: [eventPayload()] })
  });

  assert.equal(result.eventsConsidered, 0);
  assert.equal(result.creditsSpent, 0);
});

test("the games cap bounds the maximum spend per run", async () => {
  const dir = tempDir("cap");
  const slate = Array.from({ length: 12 }, (unused, index) => eventPayload({
    id: `evt-${index}`
  }));

  const result = await ingestStrikeoutProps({
    apiKey: "K",
    now: () => new Date("2026-07-28T21:00:00Z"),
    maxGames: 3,
    store: new SnapshotStore({ root: path.join(dir, "snapshots") }),
    budget: new CreditBudget({
      ledgerPath: path.join(dir, "ledger.jsonl"),
      monthlyCap: 450
    }),
    fetchJsonImpl: async (url) => {
      if (url.includes("/events?")) {
        return { data: slate };
      }
      const eventId = url.match(/events\/([^/]+)\/odds/)[1];
      return { data: eventPayload({ id: eventId }) };
    }
  });

  assert.equal(result.slateSize, 12);
  assert.equal(result.eventsConsidered, 3);
  assert.equal(result.creditsSpent, 3);
});
