# Direct Screen Capture Bridge Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Import an actual logged-in DraftKings Predictions screenshot and visible page state into Bear Edge as retained, exact, research-only market evidence without a paid odds API or manual transcription.

**Execution status:** Completed and independently audited on 2026-07-23; the
checkboxes below preserve the original TDD execution script rather than current
completion state.

**Architecture:** A strict capture contract computes its own evidence digests and normalizes only visible side-level prices. A separate store retains screenshots and append-only envelopes, an exact matcher prices only identical research candidates, and authenticated API/dashboard surfaces expose the latest capture without weakening the existing authorization gates.

**Tech Stack:** Node.js 20+, CommonJS, `node:test`, local JSONL evidence storage, SHA-256, existing Bear Edge HTTP server and vanilla dashboard.

## Global Constraints

- Inputs are limited to screenshots, visible page text, and public/logged-in pages actually accessible on this computer.
- Compute SHA-256 digests server-side; never trust caller-supplied digests.
- Never infer hidden, locked, ambiguous, opposite, or stale prices.
- Direct browser evidence is `captured_unverified`, `PRICE_CHECK_ONLY`, and `$0 authorized`.
- Never pass DraftKings Predictions rows to the American-odds sportsbook simulator.
- Predictions economics require exact visible contract cost, gross payout, and fee.
- Preserve every existing user modification in the dirty worktree.
- Add focused files and make only narrow edits to existing server/dashboard files.
- Use TDD for every production behavior.

---

## File Map

### Create

- `src/live/direct-screen-capture.js` — validate and normalize capture inputs, compute digests, and pair exact sides.
- `src/live/direct-screen-capture-store.js` — persist screenshots/envelopes and read the latest capture.
- `src/live/direct-screen-candidate-match.js` — match structured player-prop rows to research candidates.
- `src/live/predictions-contract-economics.js` — calculate fee-aware event-contract research economics.
- `test/direct-screen-capture.test.js` — capture, pairing, persistence, and matching tests.
- `test/predictions-contract-economics.test.js` — fee-aware calculation and fail-closed validation tests.

### Modify

- `src/server.js` — add authenticated POST/GET capture routes and injectable store paths.
- `test/api.test.js` — cover authorization, persistence, latest reads, and response redaction.
- `src/dashboard/index.html` — add a Direct Screen Capture status panel.
- `src/dashboard/app.js` — fetch and render latest capture state.
- `src/dashboard/styles.css` — reuse current cards with minimal capture-specific layout.
- `test/tooling.test.js` — verify evidence labels and absence of a wager action.
- `README.md` — document the no-paid-API capture workflow and trust boundary.

---

### Task 1: Strict direct-screen capture contract

**Files:**
- Create: `test/direct-screen-capture.test.js`
- Create: `src/live/direct-screen-capture.js`

**Interfaces:**
- Consumes: `normalizeDirectScreenCapture(input, { now })`.
- Produces: `{ capture, image }`, where `capture` is a canonical envelope with
  `captureId`, server-computed digests, normalized markets, paired prices,
  warnings, `evidenceStatus`, `betCallPermission`, and `authorizedStake`, and
  `image` contains the validated decoded bytes needed by the store.

- [ ] **Step 1: Write the failing happy-path and pairing tests**

Create a fixture with PNG Base64 bytes, DraftKings Predictions URL, visible
page text, event identity, and six side-level game-market rows. Assert:

```js
const { capture, image } = normalizeDirectScreenCapture(input, {
  now: new Date("2026-07-23T23:41:10.000Z")
});

assert.match(capture.captureId, /^dsc_[a-f0-9]{24}$/);
assert.match(capture.evidence.screenshotSha256, /^sha256:[a-f0-9]{64}$/);
assert.match(capture.evidence.visibleTextSha256, /^sha256:[a-f0-9]{64}$/);
assert.equal(capture.markets[0].oppositeAmericanOdds, -212);
assert.equal(capture.evidenceStatus, "captured_unverified");
assert.equal(capture.betCallPermission, "PRICE_CHECK_ONLY");
assert.equal(capture.authorizedStake, 0);
assert.equal("imageBase64" in capture, false);
assert.ok(Buffer.isBuffer(image.buffer));
```

- [ ] **Step 2: Run the focused test and observe failure**

Run:

```bash
PATH="$PWD/.tools/node/bin:$PATH" node --test test/direct-screen-capture.test.js
```

Expected: FAIL because `src/live/direct-screen-capture.js` does not exist.

- [ ] **Step 3: Implement capture validation and digest computation**

Use `decodeImagePayload` from `src/live/image-ocr.js`,
`crypto.createHash("sha256")`, strict URL/timestamp/string/odds validators, and
a stable JSON projection for `captureId`. Accept only HTTPS
`predictions.draftkings.com` sources in version 1.

- [ ] **Step 4: Add failing negative tests**

Cover unsupported hosts, future capture time, empty visible text, invalid
image, zero/non-integer American odds, missing event identity, missing market
tokens in visible text, duplicate side rows, and more than two rows for one
pair key.

- [ ] **Step 5: Implement exact pair keys and fail-closed warnings**

Derive keys from period, market type, participant/stat identity, and line.
Moneyline pairs use no line; totals use the identical line; spreads use the
away-side signed orientation so opposite orientations at the same magnitude
cannot merge; player props require player name, stat key, and identical line.
Attach an opposite price only for a unique valid opposing row.

- [ ] **Step 6: Rerun the focused tests**

Run:

```bash
PATH="$PWD/.tools/node/bin:$PATH" node --test test/direct-screen-capture.test.js
```

Expected: PASS.

---

### Task 2: Retained evidence store and exact candidate matching

**Files:**
- Modify: `test/direct-screen-capture.test.js`
- Create: `src/live/direct-screen-capture-store.js`
- Create: `src/live/direct-screen-candidate-match.js`

**Interfaces:**
- Consumes:
  - `persistDirectScreenCapture(capture, decodedImage, options)`
  - `readLatestDirectScreenCapture(options)`
  - `matchDirectScreenCaptureCandidates({ capture, candidates })`
- Produces: idempotent retained evidence and exact structured prop matches.

- [ ] **Step 1: Add failing persistence tests**

Use a temporary directory and assert the image is stored under its digest,
the JSONL record excludes Base64 bytes, a repeated identical capture is
idempotent, and latest returns the newest valid line while reporting malformed
lines.

- [ ] **Step 2: Run the tests and observe failure**

Run the same focused command. Expected: FAIL because the store module does not
exist.

- [ ] **Step 3: Implement queued append and digest-derived artifact paths**

Use `fs.mkdir`, exclusive digest-derived filenames, append-only JSONL, and an
in-process promise queue keyed by ledger path. Do not accept a caller-supplied
artifact path.

- [ ] **Step 4: Add failing exact-match tests**

Assert a player prop matches only when normalized full player name, stat key,
line, side, sport, and capture date agree. Assert surname-only, opposite-side,
different-line, game-market, and single-sided rows do not create priced
candidates.

- [ ] **Step 5: Implement exact candidate matching**

Return `matches`, `waitEvidence`, and `unmatched` arrays. A match exposes
`marketOdds`, `oppositeOdds`, capture timestamp, source URL, capture ID, and
both evidence digests. It never evaluates or logs a ticket.

- [ ] **Step 6: Rerun the focused tests**

Expected: PASS.

---

### Task 3: Authenticated capture HTTP API

**Files:**
- Modify: `test/api.test.js`
- Modify: `src/server.js`

**Interfaces:**
- Consumes the Task 1 and Task 2 modules.
- Produces:
  - `POST /api/direct-screen-captures`
  - `GET /api/direct-screen-captures/latest`

- [ ] **Step 1: Add failing API tests**

POST a fixture capture to an isolated evidence directory. Assert status 200,
retained artifact metadata, exact paired counts, candidate-match summary,
`PRICE_CHECK_ONLY`, `$0`, and absence of `imageBase64`. GET latest and assert
the same capture ID. Add LAN-auth tests for missing/valid bearer tokens.

- [ ] **Step 2: Run focused API tests and observe failure**

Run:

```bash
PATH="$PWD/.tools/node/bin:$PATH" node --test --test-name-pattern="direct screen capture" test/api.test.js
```

Expected: FAIL with 404 responses.

- [ ] **Step 3: Add narrow server imports and routes**

POST flow:

```js
const normalized = normalizeDirectScreenCapture(body);
const persistence = await persistDirectScreenCapture(
  normalized.capture,
  normalized.image,
  captureStoreOptions
);
const candidates = await generateResearchCandidates(candidateOptions);
const matching = matchDirectScreenCaptureCandidates({
  capture: normalized.capture,
  candidates: candidates.candidates
});
```

Return capture, persistence metadata, and matching summary. GET reads only the
latest envelope. Rely on the existing authorization middleware for both
routes.

- [ ] **Step 4: Rerun focused capture and authorization tests**

Expected: PASS.

---

### Task 4: Fee-aware Predictions research economics

**Files:**
- Create: `test/predictions-contract-economics.test.js`
- Create: `src/live/predictions-contract-economics.js`

**Interfaces:**
- Produces:
  - `calculatePredictionsContractEconomics(input)`

- [ ] **Step 1: Write failing economics tests**

For `contractCost: 0.43`, `grossPayout: 1`, `fee: 0.02`, and
`winProbability: 0.50`, assert:

```js
assert.equal(result.profitIfWin, 0.55);
assert.equal(result.lossIfLose, 0.45);
assert.equal(result.expectedProfit, 0.05);
assert.equal(result.roi, 0.05 / 0.45);
assert.equal(result.betCallPermission, "PRICE_CHECK_ONLY");
assert.equal(result.authorizedStake, 0);
```

Also reject missing fees, payout not exceeding total cost, probabilities
outside `[0, 1]`, non-finite fields, and sportsbook-American-odds input.

- [ ] **Step 2: Run the focused test and observe failure**

Run:

```bash
PATH="$PWD/.tools/node/bin:$PATH" node --test test/predictions-contract-economics.test.js
```

Expected: FAIL because the module does not exist.

- [ ] **Step 3: Implement exact quote economics**

Calculate:

```js
const totalCost = contractCost + fee;
const profitIfWin = grossPayout - totalCost;
const lossIfLose = totalCost;
const expectedProfit =
  winProbability * profitIfWin - (1 - winProbability) * lossIfLose;
const roi = expectedProfit / totalCost;
```

Expose a research Kelly fraction but keep `authorizedStake: 0`. Do not accept
or convert American odds.

- [ ] **Step 4: Rerun the focused tests**

Expected: PASS.

---

### Task 5: Visible dashboard status

**Files:**
- Modify: `src/dashboard/index.html`
- Modify: `src/dashboard/app.js`
- Modify: `src/dashboard/styles.css`
- Modify: `test/tooling.test.js`
- Modify: `README.md`

**Interfaces:**
- Consumes `GET /api/direct-screen-captures/latest`.
- Produces a read-only Direct Screen Capture panel.

- [ ] **Step 1: Add failing dashboard markup tests**

Assert the HTML includes `directScreenCapturePanel`,
`directScreenCaptureStatus`, and `directScreenCaptureResult`, plus the visible
labels `Captured unverified`, `PRICE_CHECK_ONLY`, and `$0 authorized`. Assert
the panel does not contain `Place bet`, `Submit trade`, or `BET now`.

- [ ] **Step 2: Run the focused tooling test and observe failure**

Run:

```bash
PATH="$PWD/.tools/node/bin:$PATH" node --test --test-name-pattern="direct screen capture" test/tooling.test.js
```

Expected: FAIL because the panel is absent.

- [ ] **Step 3: Add the read-only panel and renderer**

Fetch latest through the existing authenticated `apiFetch` helper. Render
provider, page title, source URL, capture time, digests, complete/incomplete
market counts, and exact-match counts using the existing escaping helpers.
Render no wager action and store no capture data in browser storage.

- [ ] **Step 4: Add concise README workflow**

Document that the operator/agent captures the current Chrome page and posts
the retained screenshot/text payload; the result is real captured evidence
but does not authorize a wager.

- [ ] **Step 5: Rerun focused tooling tests**

Expected: PASS.

---

### Task 6: Live end-to-end capture and complete verification

**Files:**
- Runtime evidence only under `data/evidence/`
- User-facing report under `/Users/davidbearmostow/Documents/Codex/2026-07-23/i/outputs/`

**Interfaces:**
- Consumes the running Chrome DraftKings Predictions tab and local Bear Edge.
- Produces one retained live capture visible in the dashboard.

- [ ] **Step 1: Run focused feature tests**

```bash
PATH="$PWD/.tools/node/bin:$PATH" node --test \
  test/direct-screen-capture.test.js \
  test/predictions-contract-economics.test.js
```

Expected: PASS.

- [ ] **Step 2: Run full verification**

```bash
PATH="$PWD/.tools/node/bin:$PATH" npm run verify
```

Expected: typecheck and all tests PASS.

- [ ] **Step 3: Restart Bear Edge and verify health**

Use the existing launcher, then verify `GET /health` returns `{"ok":true}`.

- [ ] **Step 4: Capture the live Chrome page**

Retain a fresh viewport screenshot and visible DOM snapshot from the actual
logged-in DraftKings Predictions tab. Construct only the visible event and
market rows, then POST the payload to `/api/direct-screen-captures` using the
existing local operator authorization.

- [ ] **Step 5: Verify the retained record**

Confirm screenshot digest, visible-text digest, source URL, capture time,
event, both visible sides, complete/incomplete market counts, exact candidate
matches, `captured_unverified`, `PRICE_CHECK_ONLY`, and `$0 authorized.

- [ ] **Step 6: Verify the dashboard visually**

Reload the local dashboard, inspect the Direct Screen Capture panel, and take
a screenshot showing the retained live capture and fail-closed labels.

- [ ] **Step 7: Write the evidence report**

Record exact test counts, live capture ID, artifact locator, captured markets,
unmatched/locked rows, and remaining external/model blockers. Do not call any
row a BET unless the pre-existing authorization gates independently support
it.
