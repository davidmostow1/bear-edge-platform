# Shadow Operator Completion Implementation Plan

**Goal:** Add an authenticated dashboard workflow that completes official outcomes and exact-book closing-price evidence for shadow predictions without changing betting permission, model behavior, or append-only history.

**Architecture:** Build a dedicated evidence-queue read model over the authoritative ledger, expose it through an authenticated zero-credit API, reuse the existing evidence append endpoints for writes, and add a dashboard panel that submits complete source evidence. Keep decision-log analytics isolated from new evidence record types.

**Tech stack:** Node.js CommonJS, built-in `node:test`, existing HTTP server, dependency-free browser JavaScript, HTML, CSS, JSONL authoritative ledger, optional Supabase outbox projection.

**Constraints:** Preserve all unrelated dirty-worktree changes. Do not weaken `PRICE_CHECK_ONLY`. Do not classify browser-visible or manually transcribed odds as provider-verified. Do not add bet-placement controls. Do not store operator tokens or source evidence in browser storage.

---

## Task 1: Evidence Queue Read Model

**Files:**

- Create: `src/audit/evidence-queue.js`
- Create: `test/evidence-queue.test.js`
- Modify: `src/index.js`

1. Write fixtures for canonical pre-event and completed-event evaluations plus outcome and closing-price correction chains.
2. Write failing tests for evaluation-only accounting, missing-evidence statuses, latest linear correction resolution, invalid history, integrity blocking, registry sample progress, ordering, limits, and input immutability.
3. Run `node --test test/evidence-queue.test.js` and confirm the missing module or exports fail.
4. Implement a pure `buildEvidenceQueue(records, options)` function and an async `getEvidenceQueue(options)` authoritative-ledger reader.
5. Reuse `resolveEvidenceRecords` and canonical record validation. Do not duplicate append validation.
6. Export the queue functions through `src/index.js`.
7. Run the focused test until it passes.

## Task 2: Decision Analytics Record-Type Isolation

**Files:**

- Modify: `src/analytics.js`
- Modify: `test/analytics.test.js`

1. Add a failing regression test that appends `prediction_outcome` and `closing_price` records after one evaluation.
2. Assert evaluation count, verdict count, market grouping, and quality denominators remain unchanged.
3. Update `summarizeDecisionLogRecords` to route only `evaluation` or supported legacy evaluation-shaped rows through `extractEvaluation`.
4. Exclude shadow evidence from wager analytics while preserving it in the authoritative ledger for the dedicated queue and calibration projection.
5. Run `node --test test/analytics.test.js`.

## Task 3: Authenticated Evidence Queue API

**Files:**

- Modify: `src/server.js`
- Modify: `src/release-readiness.js`
- Modify: `test/shadow-evidence-api.test.js`
- Modify: `test/api.test.js`

1. Add failing API tests for `GET /api/evidence-queue`, authentication, status filters, limit validation, zero provider calls, integrity findings, and correction identifiers.
2. Add failing tests that successful outcome and close writes return the refreshed queue item.
3. Add a route that validates `status` and `limit`, calls the queue reader, and returns canonical client errors.
4. Refresh one queue item after existing evidence writes without changing the appended record or synchronization result.
5. Add the queue endpoint to release-readiness API-surface accounting.
6. Run the two focused API test files.

## Task 4: Dashboard Shadow Evidence Panel

**Files:**

- Modify: `src/dashboard/index.html`
- Modify: `src/dashboard/app.js`
- Modify: `src/dashboard/styles.css`
- Modify: `src/dashboard/sw.js` only if the static cache version must change
- Modify: `test/tooling.test.js`

1. Add failing dashboard contract tests for the navigation link, queue container, complete outcome and close source fields, fixed verification labels, correction confirmation, no financial inputs, and no bet-placement action.
2. Add element references, rendering helpers, safe filter state, and `loadEvidenceQueue`.
3. Render summary cards and evaluation cards with escaped provider-controlled values.
4. Add complete official-outcome and verified-closing-price forms.
5. Lock sportsbook to the evaluated sportsbook and set evidence statuses in code rather than editable controls.
6. Submit to the existing write endpoints, disable in-flight forms, surface server errors, require correction confirmation, and refresh queue, decision log, calibration/readiness state after success.
7. Do not write form data to local storage.
8. Add responsive styles consistent with the existing dashboard.
9. Bump the service-worker cache name only if changed static assets otherwise remain pinned by the existing cache strategy.
10. Run `node --test test/tooling.test.js test/shadow-evidence-api.test.js`.

## Task 5: Documentation and Operator Boundaries

**Files:**

- Modify: `README.md`
- Modify: `docs/CALIBRATION_READINESS.md`

1. Document the Shadow Evidence panel and its authenticated read endpoint.
2. State that official-result and verified-provider artifacts must be retained and hashed.
3. State that sportsbook pages, screenshots, aggregators, and browser extensions remain unverified captures.
4. Document correction behavior and the absence of financial fields.
5. Preserve the current `PRICE_CHECK_ONLY` language.

## Task 6: Verification and Controlled Runtime Validation

1. Run focused tests:

   ```bash
   PATH="/Applications/ChatGPT.app/Contents/Resources/cua_node/bin:$PATH" node --test \
     test/evidence-queue.test.js \
     test/analytics.test.js \
     test/shadow-evidence-api.test.js \
     test/api.test.js \
     test/tooling.test.js
   ```

2. Run full verification:

   ```bash
   PATH="/Applications/ChatGPT.app/Contents/Resources/cua_node/bin:$PATH" npm run verify
   ```

3. Run protocol and release audits:

   ```bash
   PATH="/Applications/ChatGPT.app/Contents/Resources/cua_node/bin:$PATH" npm run audit:protocol
   PATH="/Applications/ChatGPT.app/Contents/Resources/cua_node/bin:$PATH" npm run audit:release
   ```

4. Run `git diff --check` and inspect the exact task diff without reverting unrelated work.
5. Record the existing server process and stop it only as part of a controlled restart.
6. Start the current worktree on loopback with operator authentication and no automatic paid refresh.
7. Validate `/health`, authenticated `/api/evidence-queue`, queue rendering, a valid fixture outcome, a valid fixture closing price, and correction confirmation in the browser.
8. Restore or leave the server in the same intended operator state and report the process identifier.
9. Report local correctness separately from external blockers: licensed price feed, current provider verification, remote Supabase migration, settled sample size, calibration promotion, and commercial release.
