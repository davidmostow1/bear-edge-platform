# Live Data Provider Evidence Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Make Bear Edge expose a trustworthy, price-specific live-data permission state so automatic bet calls remain blocked unless verified current odds are authenticated, matched to the requested bookmaker, and fresh.

**Architecture:** Keep the deterministic betting engine and existing provider adapters unchanged. Add a pure evidence assessment layer in `src/data-edge.js`, expose its result through the existing `/api/data-edge-audit` and release-readiness payloads, and render the evidence details in the existing dashboard. Manual screenshot/OCR prices remain price-check inputs and never satisfy the verified live-odds gate.

**Tech Stack:** Node.js CommonJS, built-in `node:test`, existing HTTP server, existing dashboard HTML/CSS/JavaScript.

## Global Constraints

- Do not fabricate odds, injuries, lineups, or provider status.
- Do not add a new sportsbook scraper or AI-generated verdict path.
- Do not add Supabase or another persistence service for this slice.
- Keep `BET` permission disabled when odds are missing, unauthorized, unmatched, stale, or from an unexpected bookmaker.
- Preserve existing tests and existing manual screenshot/OCR workflows.
- Run `PATH=\"$PWD/.tools/node/bin:$PATH\" npm run verify` before claiming completion.

### Task 1: Add failing provider-evidence tests

**Files:**
- Create: `test/data-edge.test.js`
- Modify: `src/data-edge.js` only after the tests fail

**Interfaces:**
- Test the new exported function `assessOddsEvidence({ liveData, bestTargets, now, requiredBookmaker, maxAgeMinutes })`.
- It returns `{ status, permission, reasonCodes, freshPricedCandidates, pricedCandidates, bookmakerMatches, oldestPriceAgeMinutes }`.

- [ ] **Step 1: Write tests for blocked and verified evidence**

```js
test("assessOddsEvidence blocks an unauthorized provider", () => {
  const result = assessOddsEvidence({
    liveData: { requirements: { verifiedOdds: false } },
    bestTargets: { summary: { pricedCandidates: 0 }, best: [] },
    now: new Date("2026-07-13T12:00:00.000Z")
  });

  assert.equal(result.status, "blocked");
  assert.equal(result.permission, "PRICE_CHECK_ONLY");
  assert.ok(result.reasonCodes.includes("ODDS_PROVIDER_UNVERIFIED"));
});

test("assessOddsEvidence verifies a fresh exact-bookmaker candidate", () => {
  const result = assessOddsEvidence({
    liveData: { requirements: { verifiedOdds: true } },
    bestTargets: {
      summary: { pricedCandidates: 1 },
      best: [{ odds: { bookmaker: { key: "draftkings" }, marketLastUpdate: "2026-07-13T11:58:00.000Z" } }]
    },
    requiredBookmaker: "draftkings",
    now: new Date("2026-07-13T12:00:00.000Z"),
    maxAgeMinutes: 10
  });

  assert.equal(result.status, "verified");
  assert.equal(result.permission, "VERIFIED_BETS_ALLOWED");
  assert.equal(result.freshPricedCandidates, 1);
  assert.equal(result.bookmakerMatches, 1);
  assert.equal(result.oldestPriceAgeMinutes, 2);
});
```

- [ ] **Step 2: Add tests for stale, unmatched-bookmaker, and missing-timestamp evidence**

```js
test("assessOddsEvidence blocks stale prices", () => {
  const result = assessOddsEvidence({
    liveData: { requirements: { verifiedOdds: true } },
    bestTargets: {
      summary: { pricedCandidates: 1 },
      best: [{ odds: { bookmaker: { key: "draftkings" }, marketLastUpdate: "2026-07-13T11:30:00.000Z" } }]
    },
    now: new Date("2026-07-13T12:00:00.000Z"),
    maxAgeMinutes: 10
  });

  assert.equal(result.status, "blocked");
  assert.ok(result.reasonCodes.includes("ODDS_PRICE_STALE"));
});

test("assessOddsEvidence blocks an unexpected bookmaker", () => {
  const result = assessOddsEvidence({
    liveData: { requirements: { verifiedOdds: true } },
    bestTargets: {
      summary: { pricedCandidates: 1 },
      best: [{ odds: { bookmaker: { key: "fanduel" }, marketLastUpdate: "2026-07-13T11:58:00.000Z" } }]
    },
    requiredBookmaker: "draftkings",
    now: new Date("2026-07-13T12:00:00.000Z")
  });

  assert.equal(result.status, "blocked");
  assert.ok(result.reasonCodes.includes("BOOKMAKER_MISMATCH"));
});
```

- [ ] **Step 3: Run the focused test file and confirm it fails for the missing function**

Run: `PATH="$PWD/.tools/node/bin:$PATH" node --test test/data-edge.test.js`

Expected: FAIL because `assessOddsEvidence` is not exported yet.

### Task 2: Implement the evidence assessment and integrate permission

**Files:**
- Modify: `src/data-edge.js`
- Modify: `test/data-edge.test.js`

**Interfaces:**
- `assessOddsEvidence` accepts provider health, priced candidate rows, a clock, bookmaker key, and age threshold.
- `getDataEdgeAudit` includes `odds.evidence` and derives `betCallPermission` from that evidence.

- [ ] **Step 1: Implement pure timestamp and evidence helpers**

Implement finite timestamp parsing, non-negative age calculation, exact bookmaker matching, and reason codes for:

```text
ODDS_PROVIDER_UNVERIFIED
NO_PRICED_CANDIDATES
BOOKMAKER_MISMATCH
ODDS_TIMESTAMP_MISSING
ODDS_PRICE_STALE
```

The function must treat a missing market timestamp as blocked, count only exact-bookmaker rows as eligible, and return `VERIFIED_BETS_ALLOWED` only when at least one exact-bookmaker row is fresh and `liveData.requirements.verifiedOdds` is true.

- [ ] **Step 2: Run the focused tests and confirm they pass**

Run: `PATH="$PWD/.tools/node/bin:$PATH" node --test test/data-edge.test.js`

Expected: all focused tests pass.

- [ ] **Step 3: Add an integration assertion for `/api/data-edge-audit`**

Use the existing server test harness and deterministic fetch fixtures to assert that the response includes `odds.evidence` and that a provider error produces `PRICE_CHECK_ONLY`, not `VERIFIED_BETS_ALLOWED`.

- [ ] **Step 4: Run the API tests**

Run: `PATH="$PWD/.tools/node/bin:$PATH" node --test test/api.test.js`

Expected: all API tests pass.

### Task 3: Surface the evidence in release readiness and the dashboard

**Files:**
- Modify: `src/release-readiness.js`
- Modify: `src/dashboard/app.js`
- Modify: `test/api.test.js`

**Interfaces:**
- Release readiness includes the evidence status/reason codes in the existing data-edge payload.
- The dashboard renders the provider permission, fresh priced count, bookmaker match count, oldest price age, and reason text without displaying secrets.

- [ ] **Step 1: Add a dashboard contract test**

Assert the static dashboard script contains labels for `freshPricedCandidates`, `bookmakerMatches`, and `oldestPriceAgeMinutes`, and assert the release-readiness response preserves the evidence object.

- [ ] **Step 2: Render a compact evidence card in the existing Release Readiness panel**

Use the existing escaped-rendering helpers. Show `verified`, `blocked`, or `price_check_only`; show source timestamps/age; and show the first evidence reason. Do not add a second data-fetch loop.

- [ ] **Step 3: Run the focused API tests**

Run: `PATH="$PWD/.tools/node/bin:$PATH" node --test test/api.test.js`

Expected: all API tests pass.

### Task 4: Verify the complete repository and runtime entry point

**Files:**
- No production file changes unless a verification failure identifies one.

- [ ] **Step 1: Run the complete verification suite**

Run: `PATH="$PWD/.tools/node/bin:$PATH" npm run verify`

Expected: typecheck exits 0 and all tests pass.

- [ ] **Step 2: Start the local app through the supported launcher**

Run: `PATH="$PWD/.tools/node/bin:$PATH" npm run launch -- --no-open --timeout-ms 20000`

Expected: the launcher reports a healthy dashboard URL and writes server logs under `data/logs/`.

- [ ] **Step 3: Query health and evidence endpoints**

Run:

```bash
curl -fsS http://127.0.0.1:3000/health
curl -fsS http://127.0.0.1:3000/api/data-edge-audit
```

Expected: health returns `{"ok":true}`; evidence returns explicit provider status and a permission of `WAIT`, `PRICE_CHECK_ONLY`, or `VERIFIED_BETS_ALLOWED` based on actual local configuration.

- [ ] **Step 4: Run the Bear Edge doctor**

Run: `PATH="$PWD/.tools/node/bin:$PATH" node /Users/davidbearmostow/.codex/plugins/cache/personal/bear-edge-operator/0.1.0/scripts/bear-edge-doctor.mjs`

Expected: report current provider state without secrets; do not claim verified bets unless the live odds provider actually passes.
