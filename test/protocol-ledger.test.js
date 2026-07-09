const test = require("node:test");
const assert = require("node:assert/strict");

const {
  buildAuditReport,
  buildLedger,
  buildLedgerCsv,
  buildMarkdownReport,
  summarizeRoiByMarketType
} = require("../src/audit/protocol-ledger.js");

test("protocol ledger normalizes settled thread examples and flags missing evidence", () => {
  const ledger = buildLedger();
  const torkelson = ledger.find((entry) => entry.id === "thread-006");
  const dinglerSafe = ledger.find((entry) => entry.id === "thread-008");
  const marlins = ledger.find((entry) => entry.id === "thread-001");

  assert.equal(ledger.length, 19);
  assert.equal(torkelson.net_profit, -9.28);
  assert.ok(torkelson.mistake_tags.includes("oversized_stake"));
  assert.ok(torkelson.mistake_tags.includes("bad_ladder"));
  assert.equal(dinglerSafe.net_profit, 4.41);
  assert.ok(dinglerSafe.implied_probability > 0.49 && dinglerSafe.implied_probability < 0.50);
  assert.equal(marlins.net_profit, null);
  assert.ok(marlins.audit.missingEvidence.includes("stake"));
});

test("protocol audit summarizes ROI, process grades, leaks, and repeatable edges", () => {
  const report = buildAuditReport(buildLedger());
  const soccerTotal = report.roiByMarketType.find((entry) => entry.market_type === "soccer_total");
  const totalBases = report.roiByMarketType.find((entry) => entry.market_type === "MLB_total_bases");
  const badLadder = report.leakReport.find((entry) => entry.leak === "bad_ladder");
  const repeatableTotalBases = report.repeatableEdges.find((entry) => entry.market_type === "MLB_total_bases");

  assert.equal(report.summary.ledgerRows, 19);
  assert.equal(report.summary.rowsMissingStake, 12);
  assert.equal(report.summary.rowsWithCalculatedNet, 7);
  assert.equal(report.summary.knownStake.toFixed(2), "39.67");
  assert.equal(report.summary.knownNetProfit.toFixed(2), "-30.67");
  assert.equal(soccerTotal.calculable_bets, 2);
  assert.equal(soccerTotal.net_profit.toFixed(2), "-17.15");
  assert.ok(soccerTotal.roi < -0.99);
  assert.equal(totalBases.wins, 4);
  assert.ok(badLadder.count >= 4);
  assert.ok(repeatableTotalBases.examples.some((example) => example.includes("Kyle Schwarber")));
  assert.ok(report.ruleChanges.some((rule) => rule.includes("Settled tickets are audit evidence only")));
});

test("protocol audit renders CSV and markdown artifacts", () => {
  const ledger = buildLedger();
  const report = buildAuditReport(ledger);
  const csv = buildLedgerCsv(ledger);
  const markdown = buildMarkdownReport(report);
  const roiSummary = summarizeRoiByMarketType(ledger);

  assert.match(csv, /id,date,time,sport,league,game/);
  assert.match(csv, /thread-005/);
  assert.match(markdown, /# Bear Edge Protocol Betting Audit/);
  assert.match(markdown, /## Do Not Bet Conditions/);
  assert.match(markdown, /BET:/);
  assert.ok(roiSummary.some((entry) => entry.market_type === "parlay"));
});
