# Bear Edge Full Evidence Audit Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Prove the implemented Bear Edge release against every approved requirement using retained source, data, database, mathematics, failure, security, and runtime evidence without converting unknowns into passes.

**Architecture:** Dependency-free audit modules generate deterministic manifests and evidence records, a traceability definition maps requirements to implementation and checks, and one orchestrator writes complete machine-readable and Markdown artifacts under `data/reports/elite-audit/`.

**Tech Stack:** Node.js CommonJS, built-in `node:test`, built-in Node.js test coverage, Git, npm, JSON, JSONL, Markdown, Supabase connector evidence, Statsig connector evidence, and optional browser/runtime controllers.

## Global Constraints

- Every claim uses one of `PROVEN_STATIC`, `PROVEN_TEST`, `PROVEN_RUNTIME`, `PROVEN_EXTERNAL`, `ASSUMPTION`, `BLOCKED_EXTERNAL`, or `FAILED`.
- Every relevant first-party file and line is classified.
- Every accessible relevant local data row is validated or explicitly quarantined and explained.
- Every formula has local tests and independent golden evidence.
- Every required failure mode is exercised.
- Secrets are acknowledged only through safe metadata and never read into reports.
- Generated reports may be summarized in chat but may not be truncated on disk.
- Preserve unrelated worktree changes.

---

## File Map

| File | Responsibility |
| --- | --- |
| `src/audit/evidence.js` | Evidence-class records, command result digests, and redaction |
| `src/audit/source-manifest.js` | First-party file inventory and line classification |
| `src/audit/data-manifest.js` | JSON, JSONL, CSV, fixture, snapshot, and report validation |
| `src/audit/math-verification.js` | Independent formulas and golden comparison |
| `src/audit/failure-audit.js` | Required failure matrix execution and results |
| `src/audit/traceability.js` | Requirement definitions, evidence linking, and completion checks |
| `src/audit/integration-inventory.js` | Provider, Supabase, Statsig, and external-state evidence |
| `src/audit/security-audit.js` | Secret, HTTP boundary, dependency, and portable-package checks |
| `src/audit/elite-audit.js` | Full orchestration and artifact writing |
| `script/run_elite_audit.js` | Command-line entry point |
| `audit/requirements.json` | Stable requirement identifiers and exact approved text |
| `audit/manual-line-review.json` | Explicit manual review classifications for lines not covered by tests or runtime |
| `test/evidence.test.js` | Evidence and redaction tests |
| `test/source-manifest.test.js` | Source and line inventory tests |
| `test/data-manifest.test.js` | Row validation and secret exclusion tests |
| `test/math-verification.test.js` | Independent formula tests |
| `test/failure-audit.test.js` | Failure matrix contract tests |
| `test/traceability.test.js` | No-gap completion tests |
| `test/security-audit.test.js` | Security and package exclusion tests |
| `test/elite-audit.test.js` | Deterministic orchestration tests |
| `package.json` | `audit:elite` script |

### Task 1: Evidence Records and Secret Redaction

**Files:**
- Create: `src/audit/evidence.js`
- Create: `test/evidence.test.js`

**Interfaces:**
- Produces: `createEvidence(input) -> immutable evidence record`
- Produces: `runAndCapture(command, args, options) -> command evidence`
- Produces: `redactSecrets(value, secretValues) -> safe value`
- Produces: `EVIDENCE_CLASSES`

- [ ] **Step 1: Write failing evidence tests**

```js
test("createEvidence rejects unsupported evidence classes", () => {
  assert.throws(() => createEvidence({ id: "e1", evidenceClass: "PROBABLY", result: "passed" }), /evidence class/);
});

test("redactSecrets removes exact and bearer-token forms", () => {
  const secret = "service-role-secret-value";
  const safe = redactSecrets({ message: `Bearer ${secret}`, nested: [secret] }, [secret]);
  assert.deepEqual(safe, { message: "Bearer [REDACTED]", nested: ["[REDACTED]"] });
});

test("runAndCapture retains command, timing, exit code, and output digest", async () => {
  const result = await runAndCapture(process.execPath, ["-e", "process.stdout.write('ok')"]);
  assert.equal(result.exitCode, 0);
  assert.equal(result.stdout, "ok");
  assert.match(result.stdoutDigest, /^[a-f0-9]{64}$/);
  assert.ok(Date.parse(result.startedAt) <= Date.parse(result.finishedAt));
});
```

- [ ] **Step 2: Confirm tests fail**

```bash
PATH="/Applications/ChatGPT.app/Contents/Resources/cua_node/bin:$PATH" node --test test/evidence.test.js
```

- [ ] **Step 3: Implement immutable evidence records**

Require `id`, `requirementIds`, `evidenceClass`, `result`, `observedAt`, `source`, `summary`, and `digest`. Freeze nested output before return. Allowed result values are `passed`, `failed`, `blocked`, and `not_applicable`.

- [ ] **Step 4: Implement command capture safely**

Use `child_process.spawn`, explicit argument arrays, no shell by default, output-size caps of 10 MiB per stream, timeout, exit-code capture, and secret redaction before persistence.

- [ ] **Step 5: Run tests and commit**

```bash
PATH="/Applications/ChatGPT.app/Contents/Resources/cua_node/bin:$PATH" node --test test/evidence.test.js
git add src/audit/evidence.js test/evidence.test.js
git commit -m "Add retained audit evidence records"
```

### Task 2: Complete Source and Line Inventory

**Files:**
- Create: `src/audit/source-manifest.js`
- Create: `audit/manual-line-review.json`
- Create: `test/source-manifest.test.js`

**Interfaces:**
- Produces: `buildSourceManifest(options) -> { files, summary, unclassifiedLines }`
- Consumes V8 coverage output and manual review entries

- [ ] **Step 1: Write manifest tests**

Use a temporary fixture repository with a covered line, uncovered executable line, blank line, comment line, and manual-review entry. Assert each physical line receives exactly one classification: `test_covered`, `runtime_covered`, `manual_reviewed`, `non_executable`, or `generated_excluded`.

- [ ] **Step 2: Confirm tests fail**

```bash
PATH="/Applications/ChatGPT.app/Contents/Resources/cua_node/bin:$PATH" node --test test/source-manifest.test.js
```

- [ ] **Step 3: Implement file inventory**

Inventory tracked and untracked first-party files under `src`, `test`, `script`, `docs`, `examples`, `models`, `supabase`, `audit`, root command files, `package.json`, and `tsconfig.json`. Record path, bytes, physical lines, nonblank lines, SHA-256 digest, Git status, and classification.

Exclude `.git`, `node_modules`, `.tools`, `dist`, caches, secret files, and runtime reports from first-party source coverage. Record exclusions with reason and safe path only.

- [ ] **Step 4: Generate test coverage**

Run:

```bash
PATH="/Applications/ChatGPT.app/Contents/Resources/cua_node/bin:$PATH" node --test --experimental-test-coverage
```

If the installed Node.js version emits only summary coverage, also run with `NODE_V8_COVERAGE=data/reports/elite-audit/v8-coverage` and parse the JSON ranges.

- [ ] **Step 5: Classify uncovered first-party lines**

Populate `audit/manual-line-review.json` with exact path, start line, end line, reviewer, reviewed commit, classification reason, and finding. Do not use broad whole-file entries when only specific lines are uncovered. Any unexplained uncovered executable line remains in `unclassifiedLines` and fails the completion gate.

- [ ] **Step 6: Run tests and commit**

```bash
PATH="/Applications/ChatGPT.app/Contents/Resources/cua_node/bin:$PATH" node --test test/source-manifest.test.js
git add src/audit/source-manifest.js audit/manual-line-review.json test/source-manifest.test.js
git commit -m "Add complete source audit manifest"
```

### Task 3: Complete Local Data Inventory

**Files:**
- Create: `src/audit/data-manifest.js`
- Create: `test/data-manifest.test.js`

**Interfaces:**
- Produces: `buildDataManifest(options) -> { files, summary, failures }`
- Produces: per-file digest, row count, schema versions, timestamp range, duplicate count, malformed count, and orphan count

- [ ] **Step 1: Write JSONL and secret-exclusion tests**

Test valid rows, blank lines, malformed JSON, duplicate identifiers, digest conflicts, settlement orphans, amendments with missing links, CSV header mismatches, and `.env.local` exclusion. Assert no secret file contents are read into the manifest.

- [ ] **Step 2: Confirm tests fail**

```bash
PATH="/Applications/ChatGPT.app/Contents/Resources/cua_node/bin:$PATH" node --test test/data-manifest.test.js
```

- [ ] **Step 3: Implement format readers**

Support `.json`, `.jsonl`, and `.csv` files under `data`, `examples`, `models`, `audit`, and test fixture directories. Use canonical record validation for audit records and file-specific validators for snapshots and calibration rows.

- [ ] **Step 4: Recompute derived audit-record fields**

Where source values exist, recompute content digest, implied probability, no-vig probability, fair edge, price edge, expected-value return, Kelly fraction, closing-line value, and actual profit. Record numeric tolerance and any mismatch by file and row number.

- [ ] **Step 5: Quarantine without mutation**

Write quarantine reports under `data/reports/elite-audit/quarantine/`. Do not rewrite source data. Completion fails until every quarantined row is explained, amended, or explicitly classified as legacy invalid.

- [ ] **Step 6: Run tests and commit**

```bash
PATH="/Applications/ChatGPT.app/Contents/Resources/cua_node/bin:$PATH" node --test test/data-manifest.test.js
git add src/audit/data-manifest.js test/data-manifest.test.js
git commit -m "Add complete local data audit"
```

### Task 4: Independent Betting Mathematics Verification

**Files:**
- Create: `src/audit/math-verification.js`
- Create: `test/math-verification.test.js`

**Interfaces:**
- Produces: `verifyBettingMath(cases) -> { cases, summary }`
- Must not import production calculation helpers

- [ ] **Step 1: Write source-independence test**

Read `src/audit/math-verification.js` and assert it does not import `src/index.js`, `src/live/market-intelligence.js`, `src/live/best-mlb-targets.js`, `src/analytics.js`, or `src/calibration/metrics.js`.

- [ ] **Step 2: Add exact golden cases**

Cover positive and negative American odds, paired no-vig markets, probability shrinkage, `fairEdge`, `priceEdge`, expected-value return, Kelly fraction, stake caps, closing-line value, settlement profit, Brier score, log loss, expected calibration error, calibration line, and bootstrap interval.

- [ ] **Step 3: Confirm tests fail**

```bash
PATH="/Applications/ChatGPT.app/Contents/Resources/cua_node/bin:$PATH" node --test test/math-verification.test.js
```

- [ ] **Step 4: Implement independent equations**

Use equations written directly in the audit module and compare with production outputs through injected case results. Report absolute error, relative error, tolerance, and pass/fail for each case.

- [ ] **Step 5: Retain Wolfram evidence**

Run the registered golden queries through Wolfram. Store input expression, returned numeric result, retrieval time, and source label in `data/reports/elite-audit/wolfram-golden.json`. If Wolfram is unavailable, mark external verification blocked while retaining independent local verification.

- [ ] **Step 6: Run tests and commit**

```bash
PATH="/Applications/ChatGPT.app/Contents/Resources/cua_node/bin:$PATH" node --test test/math-verification.test.js
git add src/audit/math-verification.js test/math-verification.test.js
git commit -m "Add independent betting math verification"
```

### Task 5: Failure-Injection Audit

**Files:**
- Create: `src/audit/failure-audit.js`
- Create: `test/failure-audit.test.js`

**Interfaces:**
- Produces: `runFailureAudit(options) -> one result for every Section 16 failure`

- [ ] **Step 1: Encode the required matrix**

Use stable identifiers for all failures listed in Section 16 of the approved specification: ledger unavailable, malformed line, duplicate same digest, duplicate conflict, Supabase unavailable, Supabase authentication failure, Statsig unavailable, odds unavailable, missing/stale/future timestamps, sportsbook mismatch, participant mismatch, line mismatch, stale injury or lineup, uncalibrated model, non-finite input, threshold tie, orphan settlement, and conflicting settlement.

- [ ] **Step 2: Write no-gap and expected-result tests**

Assert every required identifier appears exactly once and each runner verifies the exact fail-closed result, not merely that an error occurred.

- [ ] **Step 3: Implement isolated runners**

Use temporary directories, injected fetch implementations, injected clocks, and fixture providers. Do not modify the real authoritative ledger or remote database during automated failure injection.

- [ ] **Step 4: Run tests and commit**

```bash
PATH="/Applications/ChatGPT.app/Contents/Resources/cua_node/bin:$PATH" node --test test/failure-audit.test.js
git add src/audit/failure-audit.js test/failure-audit.test.js
git commit -m "Add fail-closed injection audit"
```

### Task 6: Requirements and Traceability Matrix

**Files:**
- Create: `audit/requirements.json`
- Create: `src/audit/traceability.js`
- Create: `test/traceability.test.js`

**Interfaces:**
- Produces: `buildTraceabilityMatrix(requirements, evidence) -> matrix`
- Produces: `evaluateCompletion(matrix) -> { complete, failures, blockers }`

- [ ] **Step 1: Extract stable requirements**

Assign identifiers `BEAR-001` onward to every normative statement in the approved specification. Each entry contains exact text, design section, severity, implementation symbols, test identifiers, runtime checks, data evidence, and allowed result classes.

- [ ] **Step 2: Write no-gap tests**

Assert unique identifiers, nonempty exact text, valid section references, at least one implementation mapping, and at least one test or runtime mapping for every applicable requirement. Assert a missing evidence record makes completion false.

- [ ] **Step 3: Implement matrix generation**

Join by stable identifiers only. Never infer pass from a file existing or a test suite's aggregate exit code. A requirement passes only when all required evidence records pass and no linked critical/high defect remains.

- [ ] **Step 4: Run tests and commit**

```bash
PATH="/Applications/ChatGPT.app/Contents/Resources/cua_node/bin:$PATH" node --test test/traceability.test.js
git add audit/requirements.json src/audit/traceability.js test/traceability.test.js
git commit -m "Add complete requirement traceability"
```

### Task 7: Integration and Database Inventory

**Files:**
- Create: `src/audit/integration-inventory.js`
- Create: `test/integration-inventory.test.js`

**Interfaces:**
- Produces one safe record for each official scoreboard, odds provider, licensed injury provider, Supabase, Statsig, ESPN snapshot, DraftKings snapshot, StatMuse snapshot, optical-character-recognition path, and Deepnote status

- [ ] **Step 1: Write secret-redaction and status tests**

Assert each inventory record contains purpose, authentication state, request contract, response contract, timeout, retry, freshness, failure behavior, secret boundary, live result, and blocker. Assert no credential values appear.

- [ ] **Step 2: Implement local inventory**

Use provider configuration status and injected safe health responses. Never call a remote service from a unit test.

- [ ] **Step 3: Capture live external evidence**

Use Supabase tools to capture tables, columns, constraints, indexes, triggers, policies, row counts, migrations, security advisors, and performance advisors. Use Statsig tools to capture the two approved gates and audit log. Use Deepnote only if reauthentication succeeds; otherwise classify it `BLOCKED_EXTERNAL` because it is not required for local operation.

- [ ] **Step 4: Run tests and commit**

```bash
PATH="/Applications/ChatGPT.app/Contents/Resources/cua_node/bin:$PATH" node --test test/integration-inventory.test.js
git add src/audit/integration-inventory.js test/integration-inventory.test.js
git commit -m "Add external integration inventory"
```

### Task 8: Security and Portable-Package Audit

**Files:**
- Create: `src/audit/security-audit.js`
- Create: `test/security-audit.test.js`
- Modify: `src/server.js`
- Modify: `package.json`

**Interfaces:**
- Produces: `runSecurityAudit(options) -> { checks, summary }`
- Produces checks for tracked secrets, response redaction, request limits, origin policy, write authorization, dependency audit, and package contents

- [ ] **Step 1: Write failing HTTP-boundary tests**

Assert JSON requests over 1 MiB return 413, unsupported content types return 415, malformed JSON returns 400, LAN write requests require authorization, unexpected cross-origin write requests are rejected, and error responses do not include configured secret values.

- [ ] **Step 2: Add bounded body parsing and origin checks**

Update `readJsonBody` to count bytes while streaming and stop at 1 MiB. Require `application/json` for JSON write routes. In local mode allow absent origin and exact localhost origins; in LAN mode allow absent origin for command-line clients and the exact configured dashboard origin. Reject other browser origins for write requests.

- [ ] **Step 3: Write package-content tests**

Run `npm pack --dry-run --json`, parse the file list, and assert it excludes `.env`, `.env.local`, `data/logs/*.jsonl`, `data/cache`, `data/reports`, outbox state, service-worker runtime caches, and local credentials. Assert it includes required source, dashboard, model registry, migrations, examples, and documentation.

- [ ] **Step 4: Implement security audit checks**

Scan tracked paths and rendered artifacts for known secret values using in-memory comparison without writing the values. Run `npm audit --json` and classify tool/network failure separately from discovered vulnerabilities. Record severity counts and fail on unresolved critical or high vulnerabilities.

- [ ] **Step 5: Run focused tests and package checks**

```bash
PATH="/Applications/ChatGPT.app/Contents/Resources/cua_node/bin:$PATH" node --test test/security-audit.test.js test/api.test.js
PATH="/Applications/ChatGPT.app/Contents/Resources/cua_node/bin:$PATH" npm audit --json
PATH="/Applications/ChatGPT.app/Contents/Resources/cua_node/bin:$PATH" npm pack --dry-run --json
```

- [ ] **Step 6: Commit Task 8**

```bash
git add src/audit/security-audit.js src/server.js package.json test/security-audit.test.js test/api.test.js
git diff --cached --check
git commit -m "Add security and package audit"
```

### Task 9: Elite Audit Orchestrator and End-to-End Replay

**Files:**
- Create: `src/audit/elite-audit.js`
- Create: `script/run_elite_audit.js`
- Create: `test/elite-audit.test.js`
- Modify: `package.json`
- Modify: `README.md`
- Modify: `docs/PRODUCTION_READINESS.md`

**Interfaces:**
- Produces command: `npm run audit:elite`
- Writes: `data/reports/elite-audit/audit.json`
- Writes: `data/reports/elite-audit/audit.md`
- Writes: `data/reports/elite-audit/source-manifest.json`
- Writes: `data/reports/elite-audit/data-manifest.json`
- Writes: `data/reports/elite-audit/database-inventory.json`
- Writes: `data/reports/elite-audit/integration-inventory.json`
- Writes: `data/reports/elite-audit/security-audit.json`
- Writes: `data/reports/elite-audit/math-verification.json`
- Writes: `data/reports/elite-audit/failure-matrix.json`
- Writes: `data/reports/elite-audit/traceability-matrix.json`

- [ ] **Step 1: Write deterministic orchestration tests**

Inject temporary paths, fake command evidence, fake external evidence, and a fixed clock. Assert all artifact paths, digests, evidence counts, completion status, failures, blockers, and Markdown links are deterministic.

- [ ] **Step 2: Confirm tests fail**

```bash
PATH="/Applications/ChatGPT.app/Contents/Resources/cua_node/bin:$PATH" node --test test/elite-audit.test.js
```

- [ ] **Step 3: Implement the orchestrator**

Run source inventory, data inventory, math verification, failure audit, integration inventory, security audit, command evidence, and traceability in a fixed order. Write artifacts atomically through temporary files and rename. A failed sub-audit remains in the final report and makes completion false.

- [ ] **Step 4: Add the package command**

```json
"audit:elite": "node ./script/run_elite_audit.js"
```

- [ ] **Step 5: Execute complete local verification**

```bash
PATH="/Applications/ChatGPT.app/Contents/Resources/cua_node/bin:$PATH" npm run verify
PATH="/Applications/ChatGPT.app/Contents/Resources/cua_node/bin:$PATH" npm run audit:release
PATH="/Applications/ChatGPT.app/Contents/Resources/cua_node/bin:$PATH" npm run audit:elite
PATH="/Applications/ChatGPT.app/Contents/Resources/cua_node/bin:$PATH" node /Users/davidbearmostow/.codex/plugins/cache/personal/bear-edge-operator/0.1.0/scripts/bear-edge-doctor.mjs
```

- [ ] **Step 6: Execute end-to-end recommendation replay**

Use deterministic fixtures to capture source evidence, evaluate a research-only player prop, persist `WAIT`, queue and synchronize or visibly defer it, restart, settle a separate validated fixture evaluation, append an amendment, and verify analytics plus dashboard reconstruction. Confirm no unpersisted recommendation is returned at any step.

- [ ] **Step 7: Execute every supported runtime path**

Exercise command-line straight evaluation, command-line live evaluation, local dashboard launch, `/health`, `/schemas`, `/api/candidates`, `/api/best-mlb-targets`, `/api/decision-log`, `/api/settle`, `/api/release-readiness`, `/api/data-edge-audit`, `/api/sync-health`, ESPN snapshot intake, DraftKings snapshot intake, StatMuse snapshot intake, screenshot and optical-character-recognition intake when the local OCR prerequisites are available, auto-update status, auto-update snapshot, restart recovery, and private-LAN launch.

- [ ] **Step 8: Execute real local and LAN checks**

Run the documented local launch and all supported endpoints. Run LAN launch with authorization and independently addressed access where available. Record exact blockers instead of passing unavailable checks.

- [ ] **Step 9: Inspect final artifacts manually**

Confirm no secret values, no truncated matrices, no unclassified requirements, no unclassified first-party lines, no unexplained malformed data, no unresolved critical/high defects, and no unsupported predictive claim.

- [ ] **Step 10: Commit Task 9**

```bash
git add src/audit/elite-audit.js script/run_elite_audit.js test/elite-audit.test.js package.json README.md docs/PRODUCTION_READINESS.md
git diff --cached --check
git commit -m "Add complete elite evidence audit"
```

- [ ] **Step 11: Produce the final implementation report**

Report every changed file, commit, command, result, assumption, external blocker, residual risk, and evidence artifact. Link the complete on-disk matrices rather than shortening them. State clearly whether predictive validation remains blocked by insufficient settled out-of-sample data.
