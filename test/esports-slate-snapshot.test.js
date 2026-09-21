const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const SNAPSHOT_PATH = path.join(
  __dirname,
  "..",
  "data",
  "esports",
  "observations",
  "2026-08-12-live-slate.json"
);

function loadSnapshot() {
  return JSON.parse(fs.readFileSync(SNAPSHOT_PATH, "utf8"));
}

function countBy(rows, key) {
  return rows.reduce((counts, row) => {
    counts[row[key]] = (counts[row[key]] ?? 0) + 1;
    return counts;
  }, {});
}

test("live esports slate summary is computed from the captured rows", () => {
  const snapshot = loadSnapshot();
  const { events, summary } = snapshot;

  assert.equal(summary.rowCount, events.length);
  assert.deepEqual(
    summary.verdictCounts,
    {
      PASS: countBy(events, "verdict").PASS ?? 0,
      WAIT: countBy(events, "verdict").WAIT ?? 0,
      LEAN: countBy(events, "verdict").LEAN ?? 0,
      BET: countBy(events, "verdict").BET ?? 0
    }
  );
  assert.deepEqual(summary.gameCounts, countBy(events, "game"));
  assert.equal(
    summary.rowsWithNumericQuotes,
    events.filter((event) => event.market.quotes.length > 0).length
  );
  assert.equal(summary.moneyAtRisk, 0);
  assert.equal(summary.operationalResult, "NO_BET");
});

test("snapshot is fail-closed: exactly 17 WAIT, one PASS, and no LEAN or BET", () => {
  const snapshot = loadSnapshot();
  const verdicts = countBy(snapshot.events, "verdict");

  assert.equal(verdicts.WAIT, 17);
  assert.equal(verdicts.PASS, 1);
  assert.equal(verdicts.LEAN ?? 0, 0);
  assert.equal(verdicts.BET ?? 0, 0);
  assert.equal(
    snapshot.events.some((event) => ["LEAN", "BET"].includes(event.verdict)),
    false
  );

  const pass = snapshot.events.find((event) => event.verdict === "PASS");
  assert.equal(pass.eventId, "dota2-epl-masters-i-navi-grand-final-2026-08-12");
  assert.deepEqual(pass.participants, ["NAVI", null]);
  assert.ok(pass.blockers.includes("opponent unknown"));
});

test("every row retains audit fields and event-contract cents are not converted", () => {
  const snapshot = loadSnapshot();
  const ids = new Set();

  for (const event of snapshot.events) {
    assert.equal(typeof event.eventId, "string");
    assert.equal(ids.has(event.eventId), false, `duplicate eventId: ${event.eventId}`);
    ids.add(event.eventId);

    assert.equal(typeof event.game, "string");
    assert.equal(typeof event.league, "string");
    assert.equal(typeof event.start.reported, "string");
    assert.ok(event.format === null || typeof event.format === "string");
    assert.ok(Array.isArray(event.market.quotes));
    assert.ok(Array.isArray(event.corroborationUrls));
    assert.ok(event.corroborationUrls.length > 0);
    assert.ok(Array.isArray(event.blockers));
    assert.ok(event.blockers.length > 0);

    for (const quote of event.market.quotes) {
      for (const price of quote.prices ?? []) {
        if (price.unit !== "USD_cents_per_1_USD_event_contract") {
          continue;
        }

        assert.equal(Number.isInteger(price.value), true);
        assert.ok(price.value >= 0 && price.value <= 100);
        assert.match(price.raw, /¢/u);
        assert.equal(Object.hasOwn(price, "americanOdds"), false);
        assert.equal(Object.hasOwn(price, "decimalOdds"), false);
        assert.equal(Object.hasOwn(price, "impliedProbability"), false);
      }
    }
  }

  assert.equal(snapshot.observationWindow.providerUpdatedAt, null);
  assert.equal(snapshot.quoteSemantics.globalProviderUpdatedAt, null);
});
