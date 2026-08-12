# Bear Edge Authoritative Ledger Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make every user-facing evaluation durable, immutable, schema-versioned, digest-verifiable, and locally persisted before display.

**Architecture:** Add focused record-contract and ledger modules, keep compatibility readers for existing JSONL records, and route command-line, HTTP, live-ticket, best-target, settlement, and amendment writes through one local authority service. Repeated display requests use stable client event UUIDs and content digests to avoid duplicate authoritative records.

**Tech Stack:** Node.js CommonJS, `node:crypto`, `node:fs/promises`, built-in `node:test`, existing JSONL analytics, and existing HTTP server.

## Global Constraints

- The local append must complete and flush before a user-facing response is returned.
- Canonical verdicts are exactly `PASS`, `WAIT`, and `BET`.
- Settlement outcomes are exactly `pending`, `win`, `loss`, `push`, and `void`.
- Existing legacy records remain readable.
- User-facing evaluation paths cannot disable logging.
- Internal pure functions may remain unpersisted only when they are not exposed by a user-facing route or command.
- Preserve unrelated worktree changes.

---

## File Map

| File | Responsibility |
| --- | --- |
| `src/audit/canonical-json.js` | Deterministic JSON serialization and SHA-256 content digests |
| `src/audit/record-contract.js` | Canonical enums, schema version, record builders, and validation |
| `src/audit/authoritative-ledger.js` | Serialized append, flush, idempotency, conflict detection, and ledger inspection |
| `src/audit/recommendation-service.js` | Convert displayed best-target rows into persisted evaluation records |
| `src/decision-log.js` | Compatibility facade over the authoritative ledger |
| `src/analytics.js` | Settlement and amendment reconstruction while preserving legacy analytics |
| `src/live/evaluate-live-ticket.js` | Persist live decisions unconditionally in the user-facing wrapper |
| `src/live/best-mlb-targets.js` | Return model and evidence fields required to persist displayed classifications |
| `src/cli/evaluate.js` | Remove `--no-log` from the user-facing command |
| `src/cli/evaluate-live.js` | Remove user-facing no-log behavior |
| `src/server.js` | Persist before responding and reject `writeLog: false` |
| `src/schemas.js` | Expose the canonical audit-record schema |
| `test/record-contract.test.js` | Contract and digest tests |
| `test/authoritative-ledger.test.js` | Durability, idempotency, conflict, and write-failure tests |
| `test/recommendation-service.test.js` | Best-target classification persistence tests |
| `test/analytics.test.js` | Settlement and amendment compatibility tests |
| `test/api.test.js` | HTTP persistence-before-response tests |
| `test/tooling.test.js` | Command-line logging contract tests |

### Task 1: Canonical Serialization and Record Contract

**Files:**
- Create: `src/audit/canonical-json.js`
- Create: `src/audit/record-contract.js`
- Create: `test/record-contract.test.js`
- Modify: `src/schemas.js`
- Modify: `src/index.js`

**Interfaces:**
- Produces: `canonicalStringify(value) -> string`
- Produces: `contentDigest(value) -> 64-character lowercase hexadecimal string`
- Produces: `createEvaluationRecord(input, context) -> canonical evaluation object`
- Produces: `createSettlementAuditRecord(input, context) -> canonical settlement object`
- Produces: `createAmendmentRecord(input, context) -> canonical amendment object`
- Produces: `validateAuditRecord(record) -> { valid: boolean, issues: Array<{ path, message }> }`
- Produces: `AUDIT_RECORD_SCHEMA_VERSION = "2.0.0"`

- [x] **Step 1: Write deterministic serialization tests**

```js
const test = require("node:test");
const assert = require("node:assert/strict");
const { canonicalStringify, contentDigest } = require("../src/audit/canonical-json.js");

test("canonicalStringify sorts object keys recursively without reordering arrays", () => {
  const left = { z: 1, a: { y: 2, x: 3 }, rows: [{ b: 2, a: 1 }] };
  const right = { rows: [{ a: 1, b: 2 }], a: { x: 3, y: 2 }, z: 1 };
  assert.equal(canonicalStringify(left), canonicalStringify(right));
  assert.equal(contentDigest(left), contentDigest(right));
  assert.match(contentDigest(left), /^[a-f0-9]{64}$/);
});

test("canonicalStringify rejects non-finite numbers", () => {
  assert.throws(() => canonicalStringify({ probability: Number.NaN }), /finite/);
  assert.throws(() => canonicalStringify({ probability: Number.POSITIVE_INFINITY }), /finite/);
});
```

- [x] **Step 2: Run the focused test and confirm failure**

Run:

```bash
PATH="/Applications/ChatGPT.app/Contents/Resources/cua_node/bin:$PATH" node --test test/record-contract.test.js
```

Expected: FAIL because `src/audit/canonical-json.js` does not exist.

- [x] **Step 3: Implement canonical serialization**

```js
const crypto = require("node:crypto");

function normalize(value) {
  if (typeof value === "number" && !Number.isFinite(value)) {
    throw new TypeError("Canonical JSON numbers must be finite.");
  }
  if (Array.isArray(value)) {
    return value.map(normalize);
  }
  if (value !== null && typeof value === "object") {
    return Object.fromEntries(
      Object.keys(value).sort().map((key) => [key, normalize(value[key])])
    );
  }
  return value;
}

function canonicalStringify(value) {
  return JSON.stringify(normalize(value));
}

function contentDigest(value) {
  return crypto.createHash("sha256").update(canonicalStringify(value)).digest("hex");
}

module.exports = { canonicalStringify, contentDigest };
```

- [x] **Step 4: Add complete record-builder tests**

Use this exact valid evaluation fixture in `test/record-contract.test.js`:

```js
const VALID_EVALUATION_INPUT = {
  origin: { channel: "http", actorType: "operator", sessionId: "session_1", requestId: "request_1" },
  event: {
    sport: "mlb",
    league: "MLB",
    eventId: "401816143",
    startTime: "2026-07-16T23:00:00.000Z",
    homeTeam: "Philadelphia Phillies",
    awayTeam: "New York Mets"
  },
  market: {
    marketFamily: "pitcher_strikeouts",
    marketType: "Primary Prop",
    participantId: "4414215",
    participantName: "Christian Scott",
    selection: "Christian Scott over 5.5 strikeouts",
    side: "Over",
    line: 5.5
  },
  price: {
    sportsbook: "draftkings",
    marketOdds: 103,
    oppositeOdds: -131,
    priceCapturedAt: "2026-07-16T17:45:00.000Z",
    priceSourceTime: "2026-07-16T17:44:00.000Z"
  },
  sources: [{
    provider: "espn_manual_snapshot",
    sourceType: "manual_snapshot",
    sourceLocator: "espn.com/mlb/odds/_/gameId/401816143",
    parserVersion: "1.0.0",
    capturedAt: "2026-07-16T17:45:00.000Z",
    sourceTime: "2026-07-16T17:44:00.000Z",
    digest: "a".repeat(64),
    freshness: "fresh",
    verificationStatus: "manually_confirmed"
  }],
  model: {
    modelId: "poisson_count_v1",
    modelVersion: "1.0.0",
    probabilityMethod: "poisson_count",
    modelStatus: "research_only",
    calibrationReportId: null,
    trainingCutoff: "2026-07-15T00:00:00.000Z",
    sampleSize: 54
  },
  probability: {
    rawModelProbability: 0.55,
    adjustedProbability: 0.53,
    marketImpliedProbability: 0.49261083743842365,
    marketNoVigProbability: 0.512
  },
  edge: { fairEdge: 0.018, priceEdge: 0.03738916256157638, expectedValueRoi: 0.0759, kellyFraction: 0.0364 },
  stake: { recommendedStake: 0, bankroll: 1000, stakePolicyVersion: "1.0.0" },
  decision: {
    verdict: "WAIT",
    permission: "PRICE_CHECK_ONLY",
    reasons: ["The research model is not calibrated for production betting."],
    riskFlags: [{ code: "MODEL_CALIBRATION_REQUIRED", severity: "high", message: "Model is research-only." }],
    gateResults: [{ gate: "calibration", passed: false, reasonCode: "MODEL_CALIBRATION_REQUIRED" }]
  },
  audit: {
    codeVersion: "0290140",
    configurationDigest: "b".repeat(64),
    calculationVersion: "1.0.0",
    evidenceCompleteness: "manual_confirmed",
    warnings: []
  }
};

test("createEvaluationRecord emits stable identifiers and excludes digest from its own digest input", () => {
  const record = createEvaluationRecord(VALID_EVALUATION_INPUT, {
    clientEventId: "11111111-1111-4111-8111-111111111111",
    createdAt: "2026-07-16T17:45:01.000Z"
  });
  assert.equal(record.schemaVersion, "2.0.0");
  assert.equal(record.id, "eval_11111111-1111-4111-8111-111111111111");
  assert.equal(record.clientEventId, "11111111-1111-4111-8111-111111111111");
  assert.equal(record.verdict, "WAIT");
  assert.match(record.contentDigest, /^[a-f0-9]{64}$/);
  assert.deepEqual(validateAuditRecord(record), { valid: true, issues: [] });
});
```

- [x] **Step 5: Implement builders and validation**

Implement the exact canonical enum sets and field groups from Sections 6.3 and 7 of the approved specification. Generate `clientEventId` with `crypto.randomUUID()` when context does not provide one, generate `id` with the record prefix plus UUID, set `authority` to `local`, and compute `contentDigest` after omitting only the `contentDigest` property.

The validator must reject missing required groups, invalid ISO timestamps, invalid UUIDs, non-finite probabilities, probabilities outside zero through one, unsupported verdicts, unsupported settlement outcomes, and a `BET` record whose model status is not `validated`.

- [x] **Step 6: Export the audit schema and public functions**

Add `AUDIT_RECORD_SCHEMA` to `/schemas` through `src/schemas.js` and export the builders and validator from `src/index.js`.

- [x] **Step 7: Run focused tests and type checking**

```bash
PATH="/Applications/ChatGPT.app/Contents/Resources/cua_node/bin:$PATH" node --test test/record-contract.test.js
PATH="/Applications/ChatGPT.app/Contents/Resources/cua_node/bin:$PATH" npm run typecheck
```

Expected: all focused tests pass and type checking exits zero.

- [x] **Step 8: Commit Task 1**

```bash
git add src/audit/canonical-json.js src/audit/record-contract.js src/schemas.js src/index.js test/record-contract.test.js
git diff --cached --check
git commit -m "Add canonical audit record contract"
```

### Task 2: Durable Idempotent Local Ledger

**Files:**
- Create: `src/audit/authoritative-ledger.js`
- Create: `test/authoritative-ledger.test.js`
- Modify: `src/decision-log.js`
- Modify: `src/analytics.js`

**Interfaces:**
- Consumes: `validateAuditRecord(record)`, `canonicalStringify(record)`
- Produces: `appendAuthoritativeRecord(record, options) -> { ledgerPath, id, contentDigest, appended, persistedAt }`
- Produces: `readAuthoritativeLedger(options) -> { records, malformedLines, duplicateIds, digestConflicts }`
- Produces: `AuthoritativeLedgerError` with stable `code`

- [x] **Step 1: Write ledger durability and integrity tests**

```js
test("appendAuthoritativeRecord appends once and treats the same id and digest as idempotent", async () => {
  const ledgerPath = path.join(tempDir, "decision_log.jsonl");
  const first = await appendAuthoritativeRecord(record, { ledgerPath });
  const second = await appendAuthoritativeRecord(record, { ledgerPath });
  const lines = (await fs.readFile(ledgerPath, "utf8")).trim().split("\n");
  assert.equal(first.appended, true);
  assert.equal(second.appended, false);
  assert.equal(lines.length, 1);
});

test("appendAuthoritativeRecord rejects the same id with a different digest", async () => {
  await appendAuthoritativeRecord(record, { ledgerPath });
  const conflicting = { ...record, contentDigest: "f".repeat(64) };
  await assert.rejects(
    appendAuthoritativeRecord(conflicting, { ledgerPath }),
    (error) => error.code === "LEDGER_DIGEST_CONFLICT"
  );
});

test("appendAuthoritativeRecord exposes a flush failure and leaves no success result", async () => {
  const fsImpl = {
    mkdir: async () => {},
    readFile: async () => { throw Object.assign(new Error("missing"), { code: "ENOENT" }); },
    open: async () => ({
      writeFile: async () => {},
      sync: async () => { throw new Error("flush failed"); },
      close: async () => {}
    })
  };
  await assert.rejects(
    appendAuthoritativeRecord(record, { ledgerPath: "/virtual/log.jsonl", fsImpl }),
    (error) => error.code === "LEDGER_FLUSH_FAILED"
  );
});
```

- [x] **Step 2: Confirm the tests fail before implementation**

```bash
PATH="/Applications/ChatGPT.app/Contents/Resources/cua_node/bin:$PATH" node --test test/authoritative-ledger.test.js
```

Expected: FAIL because the module does not exist.

- [x] **Step 3: Implement serialized append and flush**

Use a module-level promise queue keyed by resolved ledger path. For each append, inspect existing identifiers, reject conflicts, open with `"a"`, write one canonical line, call `sync()`, and always call `close()` in `finally`. Wrap failures with codes `LEDGER_OPEN_FAILED`, `LEDGER_WRITE_FAILED`, `LEDGER_FLUSH_FAILED`, and `LEDGER_CLOSE_FAILED` while retaining the safe original message.

- [x] **Step 4: Keep legacy compatibility**

Change `appendDecisionLog` to detect schema version 2 records and call `appendAuthoritativeRecord`. Existing legacy records continue through the current append path until Tasks 3 through 5 convert every user-facing producer. Extend analytics reading to report duplicate identifiers and digest conflicts without mutating the file.

- [x] **Step 5: Run focused and analytics tests**

```bash
PATH="/Applications/ChatGPT.app/Contents/Resources/cua_node/bin:$PATH" node --test test/authoritative-ledger.test.js test/analytics.test.js
```

Expected: all tests pass.

- [x] **Step 6: Commit Task 2**

```bash
git add src/audit/authoritative-ledger.js src/decision-log.js src/analytics.js test/authoritative-ledger.test.js test/analytics.test.js
git diff --cached --check
git commit -m "Add durable authoritative decision ledger"
```

### Task 3: Enforce Persistence on Straight and Live Evaluation Paths

**Files:**
- Modify: `src/cli/evaluate.js`
- Modify: `src/cli/evaluate-live.js`
- Modify: `src/live/evaluate-live-ticket.js`
- Modify: `src/server.js`
- Modify: `src/index.js`
- Modify: `test/tooling.test.js`
- Modify: `test/api.test.js`
- Modify: `test/live-ticket.test.js`

**Interfaces:**
- Consumes: `createEvaluationRecord`, `appendAuthoritativeRecord`
- Produces: user-facing evaluation responses with `recordId`, `clientEventId`, `contentDigest`, `ledgerPath`, and `persistedAt`

- [x] **Step 1: Add failing command-line tests**

```js
test("parseArgs rejects the removed --no-log option", () => {
  assert.throws(() => parseArgs(["example.json", "--no-log"]), /Unexpected argument: --no-log/);
});
```

Update the existing command execution test to assert `output.recordId`, `output.contentDigest`, and one persisted schema-version-2 line.

- [x] **Step 2: Add failing API tests**

```js
test("POST /evaluate rejects writeLog false", async () => {
  const response = await fetch(`${baseUrl}/evaluate`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ ...validInput, writeLog: false })
  });
  assert.equal(response.status, 400);
  assert.match((await response.json()).error, /logging cannot be disabled/i);
});
```

Add equivalent coverage for `/evaluate/live`.

- [x] **Step 3: Confirm tests fail for current behavior**

```bash
PATH="/Applications/ChatGPT.app/Contents/Resources/cua_node/bin:$PATH" node --test test/tooling.test.js test/api.test.js test/live-ticket.test.js
```

Expected: the new tests fail because no-log behavior is still accepted and records use the legacy shape.

- [x] **Step 4: Remove user-facing no-log behavior**

Remove `--no-log` from CLI usage and argument handling. In HTTP routes, return status 400 when `writeLog === false`. Keep `evaluateBetDecision` and `evaluateLiveTicket` pure for tests and backtests, but make `evaluateLiveTicketAndLog` always append.

- [x] **Step 5: Build canonical records before append**

Map the current decision result, ticket, research packet, source timestamps, market context, model status, edge values, stake values, and risk flags into `createEvaluationRecord`. Do not infer verified source status from screenshots or manual text.

- [x] **Step 6: Persist before output**

Await `appendAuthoritativeRecord` before writing command-line output or calling `jsonResponse`. If append fails, return an explicit 500 response with the safe ledger error and no decision payload.

- [x] **Step 7: Run focused tests and commit**

```bash
PATH="/Applications/ChatGPT.app/Contents/Resources/cua_node/bin:$PATH" node --test test/tooling.test.js test/api.test.js test/live-ticket.test.js
PATH="/Applications/ChatGPT.app/Contents/Resources/cua_node/bin:$PATH" npm run typecheck
git add src/cli/evaluate.js src/cli/evaluate-live.js src/live/evaluate-live-ticket.js src/server.js src/index.js test/tooling.test.js test/api.test.js test/live-ticket.test.js
git diff --cached --check
git commit -m "Require persistence for user-facing evaluations"
```

### Task 4: Persist Displayed Best-Target Classifications

**Files:**
- Create: `src/audit/recommendation-service.js`
- Create: `test/recommendation-service.test.js`
- Modify: `src/live/best-mlb-targets.js`
- Modify: `src/server.js`
- Modify: `test/api.test.js`

**Interfaces:**
- Consumes: `getBestMlbTargets(options)`, `createEvaluationRecord`, `appendAuthoritativeRecord`
- Produces: `persistDisplayedTargets(result, context) -> { ...result, best: Array<target with auditRecord>, persistence }`

- [x] **Step 1: Write failing recommendation persistence tests**

```js
test("persistDisplayedTargets logs every returned row before returning", async () => {
  const result = { status: "odds_needed", fetchedAt, sourceMode: "official_stats_without_verified_odds", summary: { candidates: 1, pricedCandidates: 0 }, best: [researchTarget], warnings: [] };
  const persisted = await persistDisplayedTargets(result, { ledgerPath, requestId: "request_1" });
  assert.equal(persisted.best.length, 1);
  assert.equal(persisted.best[0].auditRecord.verdict, "WAIT");
  assert.equal(persisted.best[0].auditRecord.permission, "PRICE_CHECK_ONLY");
  assert.equal(persisted.persistence.persistedCount, 1);
});

test("persistDisplayedTargets never labels research-only output BET", async () => {
  const persisted = await persistDisplayedTargets(researchOnlyResult, { ledgerPath, requestId: "request_2" });
  assert.notEqual(persisted.best[0].auditRecord.verdict, "BET");
  assert.equal(persisted.best[0].auditRecord.model.modelStatus, "research_only");
});
```

- [x] **Step 2: Confirm tests fail**

```bash
PATH="/Applications/ChatGPT.app/Contents/Resources/cua_node/bin:$PATH" node --test test/recommendation-service.test.js
```

Expected: FAIL because the service does not exist.

- [x] **Step 3: Implement stable displayed-record identity**

Derive a UUIDv5-compatible deterministic 128-bit identifier from the SHA-256 digest of `sourceMode`, `fetchedAt`, event identifier, market family, participant identifier, side, line, sportsbook, price timestamp, model identifier, and model version. Set UUID version and variant bits before formatting. Repeated rendering of the exact same captured target must resolve to the same `clientEventId`; a new source or price timestamp must produce a new identifier.

- [x] **Step 4: Map classification safely**

Use the priced evaluation verdict only when present. Unpriced targets and provider failures become `WAIT` with `PRICE_CHECK_ONLY`. Any model status other than `validated` becomes `WAIT` even when a nested legacy evaluation says `BET`.

- [x] **Step 5: Integrate the best-target route**

The route must await `persistDisplayedTargets` and return no target list if any required append fails. Include persistence count and record identifiers in the response.

- [x] **Step 6: Run focused and API tests, then commit**

```bash
PATH="/Applications/ChatGPT.app/Contents/Resources/cua_node/bin:$PATH" node --test test/recommendation-service.test.js test/api.test.js
git add src/audit/recommendation-service.js src/live/best-mlb-targets.js src/server.js test/recommendation-service.test.js test/api.test.js
git diff --cached --check
git commit -m "Persist displayed best-target classifications"
```

### Task 5: Settlement and Amendment Integrity

**Files:**
- Modify: `src/analytics.js`
- Modify: `src/server.js`
- Modify: `src/schemas.js`
- Modify: `src/index.js`
- Modify: `test/analytics.test.js`
- Modify: `test/api.test.js`

**Interfaces:**
- Produces: `appendSettlement(input, options)` that verifies the referenced evaluation
- Produces: `appendAmendment(input, options)` that preserves the original record
- Produces: analytics that resolve the latest valid amendment chain

- [x] **Step 1: Write failing orphan and conflict tests**

```js
test("appendSettlement rejects an unknown evaluation id", async () => {
  await assert.rejects(
    appendSettlement({ evaluationId: "eval_missing", outcome: "win", stake: 10 }, { logPath }),
    /evaluation does not exist/i
  );
});

test("a settlement correction is an amendment and preserves both records", async () => {
  const amendment = await appendAmendment({
    evaluationId: evaluation.id,
    settlementId: settlement.id,
    reason: "Official scoring correction",
    patch: { outcome: "push", profit: 0 }
  }, { logPath });
  assert.equal(amendment.record.recordType, "amendment");
  assert.equal((await readDecisionLogEntries({ logPath })).records.length, 3);
});
```

- [x] **Step 2: Confirm focused tests fail**

```bash
PATH="/Applications/ChatGPT.app/Contents/Resources/cua_node/bin:$PATH" node --test test/analytics.test.js test/api.test.js
```

- [x] **Step 3: Implement reference validation and amendments**

Read the authoritative ledger before accepting settlement or amendment writes. Reject unknown evaluations, unknown settlements, and amendment loops. Preserve the existing legacy-orphan reporting for old files, but reject new orphan writes.

- [x] **Step 4: Remove the three-win gate from release qualification**

Keep `validationGate` in analytics as descriptive history. Rename its release-readiness label to `Recent win streak (descriptive)` and ensure `complete` does not affect model status, bet-call permission, or release score.

- [x] **Step 5: Run the full Plan 1 verification**

```bash
PATH="/Applications/ChatGPT.app/Contents/Resources/cua_node/bin:$PATH" npm run verify
PATH="/Applications/ChatGPT.app/Contents/Resources/cua_node/bin:$PATH" npm run audit:release
```

Expected: all tests pass; release output remains blocked from predictive claims unless real calibration evidence exists.

- [x] **Step 6: Commit Task 5**

```bash
git add src/analytics.js src/server.js src/schemas.js src/index.js src/release-readiness.js test/analytics.test.js test/api.test.js
git diff --cached --check
git commit -m "Enforce settlement and amendment integrity"
```

## Phase 1 Completion Result

- Completed on branch `codex/product-hardening-ci` through commit `79e3eee85bd6a3b5cfa5612116acd425a68d3851`.
- Task commits: `c3ae915`, `0fb132e`, `09752d2`, `0bc6164`, and `79e3eee`.
- `npm run verify` passed TypeScript checking and 166 of 166 tests with zero failures.
- `npm run audit:release` completed with `shippable-with-warnings`, score 85 of 100, and `PRICE_CHECK_ONLY` betting permission.
- The release audit no longer scores the three-win streak. `Recent win streak (descriptive)` remains visible as historical context only.
- Current odds evidence remains blocked by `ODDS_PROVIDER_UNVERIFIED`, `NO_PRICED_CANDIDATES`, and `BOOKMAKER_MISMATCH`; this correctly prevents production bet authorization.
- Retained release evidence: `data/reports/release_readiness.json`, SHA-256 `0842c6ae8dd65baf2f4984a028ac50211893537689d6079696835fd58d796ad0`.
- Retained release summary: `data/reports/release_readiness.md`, SHA-256 `35cf51a12ac3e608345cf9d41722341a5074ea50292ca5a751f37828c66411be`.
