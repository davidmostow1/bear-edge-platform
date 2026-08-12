# Bear Edge Operations and Interface Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make Bear Edge's interface, feature rollout, local runtime, and private-LAN operation reflect the authoritative records and fail-closed evidence model accurately.

**Architecture:** API responses expose persisted provenance and synchronization state, the dashboard separates research from qualified bets, Statsig can affect only presentation or shadow selection with an off-by-default fallback, and LAN write endpoints require an operator token while local read access remains straightforward.

**Tech Stack:** Node.js CommonJS, existing HTTP server, HTML, CSS, browser JavaScript, optional `@statsig/statsig-node-core`, built-in `node:test`, and existing launch scripts.

## Global Constraints

- The phrase `Best Bets` appears only when at least one persisted qualified `BET` exists.
- A feature flag cannot override identity, freshness, calibration, bankroll, or risk gates.
- Statsig missing or failed initialization returns control behavior with gates off.
- Server SDK secrets and provider keys never reach the browser.
- LAN mode is explicit, private-network only, and not represented as public-internet secure.
- Every LAN write endpoint requires operator authorization.
- Preserve desktop and phone-sized usability.
- Preserve unrelated worktree changes.

---

## File Map

| File | Responsibility |
| --- | --- |
| `src/integrations/statsig-control.js` | Optional Statsig initialization, off-by-default evaluation, and safe status |
| `src/config/operator-auth.js` | Operator token generation, hashing, comparison, and safe status |
| `src/server.js` | Provenance responses, sync endpoints, Statsig status, and write authorization |
| `src/cli/serve.js` | Initialize and shut down optional integrations |
| `src/cli/launch.js` | Generate and display private LAN operator URL safely |
| `src/dashboard/index.html` | Honest section names and status containers |
| `src/dashboard/app.js` | Render provenance, gates, calibration, and synchronization |
| `src/dashboard/styles.css` | Responsive layouts and status hierarchy |
| `src/dashboard/sw.js` | Cache-version update for changed assets only |
| `README.md` | Operator paths, limitations, and evidence vocabulary |
| `docs/PRODUCTION_READINESS.md` | Real release and external-blocker requirements |
| `test/statsig-control.test.js` | Off-by-default and allowed-use tests |
| `test/operator-auth.test.js` | Token and authorization tests |
| `test/api.test.js` | Response, authorization, and static dashboard contracts |
| `test/tooling.test.js` | Local and LAN launcher output tests |

### Task 1: Honest API and Dashboard Terminology

**Files:**
- Modify: `src/server.js`
- Modify: `src/schemas.js`
- Modify: `src/dashboard/index.html`
- Modify: `src/dashboard/app.js`
- Modify: `src/dashboard/styles.css`
- Modify: `src/dashboard/sw.js`
- Modify: `test/api.test.js`

**Interfaces:**
- Consumes persisted `auditRecord`, calibration status, gate results, and synchronization status
- Produces dashboard sections `Research Candidates`, `Price-Check Targets`, `Waiting for Evidence`, `Passed Markets`, and `Qualified BET Calls`

- [ ] **Step 1: Write failing dashboard contract tests**

```js
test("dashboard reserves Best Bets for qualified persisted BET records", async () => {
  const html = await fs.readFile(path.join(root, "src/dashboard/index.html"), "utf8");
  const app = await fs.readFile(path.join(root, "src/dashboard/app.js"), "utf8");
  assert.match(html, /Research Candidates/);
  assert.match(html, /Qualified BET Calls/);
  assert.match(app, /auditRecord\.contentDigest/);
  assert.match(app, /modelStatus/);
  assert.match(app, /syncState/);
});
```

Add API assertions for `recordId`, `contentDigest`, `modelStatus`, `calibrationReportId`, `permission`, `gateResults`, `source timestamps`, and `syncState`.

- [ ] **Step 2: Confirm tests fail**

```bash
PATH="/Applications/ChatGPT.app/Contents/Resources/cua_node/bin:$PATH" node --test test/api.test.js
```

- [ ] **Step 3: Add response presenters**

Create pure presenter functions inside `src/dashboard/app.js` for classification label, evidence age, calibration label, blocking reason, and synchronization label. Render text through the existing escape helper and do not inject untrusted HTML.

- [ ] **Step 4: Split the existing best-target collection by persisted verdict and permission**

Research-only rows go to `Research Candidates`; unpriced rows go to `Price-Check Targets`; `WAIT` rows go to `Waiting for Evidence`; `PASS` rows go to `Passed Markets`; only persisted `BET` rows with `VERIFIED_BETS_ALLOWED` go to `Qualified BET Calls` and may display a `Best Bets` subheading.

- [ ] **Step 5: Add responsive provenance details**

Each card displays sportsbook, line, odds, source time, capture time, model identifier and version, model status, report identifier, primary reason, record identifier, and sync state. At widths below 720 pixels, use one column with no horizontal overflow and tap targets at least 44 pixels high.

- [ ] **Step 6: Update the service-worker cache version**

Change the cache name once after assets are finalized and keep network-first behavior for API requests.

- [ ] **Step 7: Run API tests and commit**

```bash
PATH="/Applications/ChatGPT.app/Contents/Resources/cua_node/bin:$PATH" node --test test/api.test.js
git add src/server.js src/schemas.js src/dashboard/index.html src/dashboard/app.js src/dashboard/styles.css src/dashboard/sw.js test/api.test.js
git diff --cached --check
git commit -m "Show honest recommendation provenance"
```

### Task 2: Statsig Control-Only Integration

**Files:**
- Create: `src/integrations/statsig-control.js`
- Create: `test/statsig-control.test.js`
- Modify: `src/cli/serve.js`
- Modify: `src/server.js`
- Modify: `package.json`
- Modify: `package-lock.json`

**Interfaces:**
- Produces: `createStatsigControl(options) -> { initialize, shutdown, checkPresentationGate, getShadowAssignment, getStatus }`
- Consumes environment: `STATSIG_SERVER_SDK_SECRET`, `STATSIG_ENVIRONMENT`, `BEAR_EDGE_OPERATOR_ID`
- Uses gates: `bear_edge_provenance_ui` and `bear_edge_shadow_model`

- [ ] **Step 1: Verify the current package version before installation**

Run:

```bash
PATH="/Applications/ChatGPT.app/Contents/Resources/cua_node/bin:$PATH" npm view @statsig/statsig-node-core version
```

Expected: one semantic version. Record it in the dependency change evidence. The official CommonJS contract is `const { Statsig, StatsigUser } = require('@statsig/statsig-node-core')`, `await statsig.initialize()`, and `statsig.checkGate(user, gateName)`. Source: `https://docs.statsig.com/server-core/node-core`.

- [ ] **Step 2: Install the exact returned version**

```bash
PATH="/Applications/ChatGPT.app/Contents/Resources/cua_node/bin:$PATH" npm install --save-exact @statsig/statsig-node-core@$(PATH="/Applications/ChatGPT.app/Contents/Resources/cua_node/bin:$PATH" npm view @statsig/statsig-node-core version)
```

- [ ] **Step 3: Write failing off-by-default tests**

```js
test("missing Statsig secret keeps every gate off", async () => {
  const control = createStatsigControl({ secret: "" });
  await control.initialize();
  assert.equal(control.checkPresentationGate("operator_1"), false);
  assert.equal(control.getShadowAssignment("operator_1"), "control");
  assert.equal(control.getStatus().mode, "control_fallback");
});

test("Statsig cannot authorize a betting verdict", () => {
  const source = fs.readFileSync(require.resolve("../src/integrations/statsig-control.js"), "utf8");
  assert.doesNotMatch(source, /VERIFIED_BETS_ALLOWED|verdict\s*=|recommendedStake/);
});
```

- [ ] **Step 4: Confirm tests fail**

```bash
PATH="/Applications/ChatGPT.app/Contents/Resources/cua_node/bin:$PATH" node --test test/statsig-control.test.js
```

- [ ] **Step 5: Implement optional initialization**

When the secret is absent, do not construct the SDK. When initialization throws or times out, retain control fallback and a redacted safe error. Gate checks are synchronous only after successful initialization. Use `StatsigUser` with operator identifier and no personal attributes.

- [ ] **Step 6: Create remote gates through the Statsig connector**

Create `bear_edge_provenance_ui` and `bear_edge_shadow_model`, both disabled by default. Do not create any gate named or described as enabling bets. Capture the created gate identifiers and audit log.

- [ ] **Step 7: Record exposure only after display**

Use disabled automatic exposure during pre-render checks when supported, and log an exposure only after the flagged presentation is actually returned. Include the gate name, boolean value, rule identifier when available, and control reason in the local evaluation audit metadata.

- [ ] **Step 8: Run tests and commit**

```bash
PATH="/Applications/ChatGPT.app/Contents/Resources/cua_node/bin:$PATH" node --test test/statsig-control.test.js test/api.test.js
git add src/integrations/statsig-control.js src/cli/serve.js src/server.js test/statsig-control.test.js package.json package-lock.json
git diff --cached --check
git commit -m "Add control-only Statsig rollout"
```

### Task 3: Operator Authorization for LAN Writes

**Files:**
- Create: `src/config/operator-auth.js`
- Create: `test/operator-auth.test.js`
- Modify: `src/server.js`
- Modify: `src/cli/launch.js`
- Modify: `src/cli/serve.js`
- Modify: `test/api.test.js`
- Modify: `test/tooling.test.js`

**Interfaces:**
- Produces: `createOperatorAuth(options) -> { authorizeRequest, getStatus, createLaunchToken }`
- Consumes header: `authorization: Bearer <operator-token>`
- Consumes optional query token only for the initial LAN dashboard bootstrap; the browser must remove it from the visible URL after storing it in session storage

- [ ] **Step 1: Write constant-time token tests**

Test SHA-256 token digests, `crypto.timingSafeEqual`, missing header rejection, malformed bearer rejection, valid token acceptance, and no raw token in status output.

- [ ] **Step 2: Write route authorization tests**

Classify `POST /evaluate`, `/evaluate/live`, `/api/settle`, `/api/sync/run`, provider-key writes, snapshot-confirmation writes, and screenshot ingestion as write endpoints. In LAN mode, missing authorization returns 401. In localhost mode, preserve existing local operation unless `BEAR_EDGE_REQUIRE_OPERATOR_TOKEN=1`.

- [ ] **Step 3: Confirm tests fail**

```bash
PATH="/Applications/ChatGPT.app/Contents/Resources/cua_node/bin:$PATH" node --test test/operator-auth.test.js test/api.test.js test/tooling.test.js
```

- [ ] **Step 4: Implement token generation and comparison**

Generate 32 random bytes encoded as base64url when LAN mode starts without a configured token. Store only the digest in server memory. Print the initial private LAN URL once. Never write the raw token to JSONL logs, release reports, or API responses.

- [ ] **Step 5: Add browser bootstrap**

On initial dashboard load, read the token from the URL fragment, store it in `sessionStorage`, remove the fragment with `history.replaceState`, and send it only in authorization headers for write requests. Fragments are preferred because browsers do not send them to the server in HTTP requests.

- [ ] **Step 6: Run tests and commit**

```bash
PATH="/Applications/ChatGPT.app/Contents/Resources/cua_node/bin:$PATH" node --test test/operator-auth.test.js test/api.test.js test/tooling.test.js
git add src/config/operator-auth.js src/server.js src/cli/launch.js src/cli/serve.js src/dashboard/app.js test/operator-auth.test.js test/api.test.js test/tooling.test.js
git commit -m "Protect private LAN write operations"
```

### Task 4: Runtime, Restart, and Mobile Verification

**Files:**
- Modify: `src/system-audit.js`
- Modify: `src/release-readiness.js`
- Modify: `test/system-audit.test.js`
- Modify: `test/api.test.js`

**Interfaces:**
- Produces release checks for ledger writability, outbox recovery, sync status, model registry, operator authorization, and truthful permission

- [ ] **Step 1: Add failing readiness tests**

Assert a terminal ledger or sync integrity failure blocks readiness; missing optional remote settings create warnings; a research-only registry blocks `BET`; LAN mode without authorization fails its safety check.

- [ ] **Step 2: Implement runtime checks**

Probe directories without altering authoritative data, inspect outbox state, load the model registry, inspect operator-auth mode, and include safe Statsig status. Do not report secrets or raw record content.

- [ ] **Step 3: Start and restart locally**

```bash
PATH="/Applications/ChatGPT.app/Contents/Resources/cua_node/bin:$PATH" npm run launch -- --no-open --timeout-ms 20000
curl -fsS http://127.0.0.1:3000/health
curl -fsS http://127.0.0.1:3000/api/release-readiness
curl -fsS http://127.0.0.1:3000/api/sync-health
```

Stop and restart the process, then confirm ledger, outbox, and dashboard state are recovered.

- [ ] **Step 4: Verify responsive rendering**

Use the browser controller at desktop width 1440 by 900 and phone width 390 by 844. Confirm no horizontal overflow, all classification sections remain readable, and write actions remain at least 44 pixels high.

- [ ] **Step 5: Verify LAN behavior**

Start `npm run launch:lan`, use an independently addressed private-network URL where the environment permits, verify read access, verify unauthorized writes return 401, and verify an authorized write succeeds and persists. If a second-device or independent network check is unavailable, classify it `BLOCKED_EXTERNAL` rather than passing it.

- [ ] **Step 6: Run Plan 4 verification and commit**

```bash
PATH="/Applications/ChatGPT.app/Contents/Resources/cua_node/bin:$PATH" npm run verify
PATH="/Applications/ChatGPT.app/Contents/Resources/cua_node/bin:$PATH" npm run audit:release
git add src/system-audit.js src/release-readiness.js test/system-audit.test.js test/api.test.js
git diff --cached --check
git commit -m "Verify secure local and LAN operations"
```

### Task 5: Operator Documentation

**Files:**
- Modify: `README.md`
- Modify: `docs/PRODUCTION_READINESS.md`
- Create: `docs/ELITE_AUDIT_OPERATIONS.md`

**Interfaces:**
- Produces exact local, LAN, provider, Supabase, Statsig, calibration, settlement, and audit procedures

- [ ] **Step 1: Document the supported paths**

Include exact commands for local launch, LAN launch, evaluation, settlement, sync health, manual sync, calibration report generation, release audit, complete verification, and portable packaging.

- [ ] **Step 2: Document status vocabulary**

Define every verdict, permission, model status, synchronization state, evidence class, and failure class exactly as implemented.

- [ ] **Step 3: Document limitations prominently**

State that screenshots are manual evidence, research estimates are not best bets, LAN HTTP is not public deployment, remote providers may fail, and future profitability is not guaranteed.

- [ ] **Step 4: Validate commands against package scripts**

Run every non-destructive command exactly as documented. Mark commands requiring external credentials with explicit prerequisites.

- [ ] **Step 5: Commit Task 5**

```bash
git add README.md docs/PRODUCTION_READINESS.md docs/ELITE_AUDIT_OPERATIONS.md
git diff --cached --check
git commit -m "Document elite Bear Edge operations"
```
