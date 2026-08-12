# Bear Edge bounded repair audit trail

**Run date:** 2026-07-30
**Repository:** `/Users/davidbearmostow/Documents/Codex/2026-06-17-documents-openai-developers-google-drive-google`
**Branch:** `codex/bear-edge-release-candidate`
**Starting commit:** `2ca03a24fc1af20a3c03086757cd1dfb85c43d1e`
**Merge/deploy/paid calls/wagers:** none
**Codex credit telemetry:** unavailable to the repository; consumption not claimed

## Entry containment

Before this repair added repository artifacts, `git status --short` reported:

- 75 tracked entries modified or staged;
- 63 untracked entries;
- branch tracking `origin/codex/bear-edge-release-candidate`.

Those entries were pre-existing and were not cleaned, reset, stashed, rebased, or
merged. This repair intentionally touched only its named new files plus the two
script entries in `package.json`.

The pre-mutation Prompt Mastery receipt is:

```text
reports/plugin-runs/2026-07-30/prompt-mastery-e3b57cb057e840f9bb02db0e0a6f405d-begin.json
```

It fixes these boundaries:

```text
predictiveImprovement=NOT_EVALUATED
modelValidation=NOT_ESTABLISHED
wageringAuthority=UNCHANGED
```

## Evidence timeline

### 1. Checkout and current-state inspection

Inspected:

- `AGENTS.md`;
- `package.json`;
- `models/registry.json`;
- authoritative-ledger defaults;
- DraftKings Predictions evidence and contract-economics code;
- showdown comparison code;
- current calibration and release reports;
- separate Sweet Bear / model-showdown / Kalshi paths.

Observed:

- 4 Bear Edge models, all `research_only`;
- 0 validated models;
- 129 authoritative decision-log rows;
- 0 calibration-eligible and 0 fully settled priced predictions;
- 51 outcome-only shadow probability rows, of which 48 were settled;
- 0 closing-price records;
- 79 discovered candidates and 0 priced candidates in the refreshed release
  report;
- operational permission `PRICE_CHECK_ONLY`.

### 2. Pre-change focused baseline

Command:

```sh
PATH="$PWD/.tools/node/bin:$PATH" node --test \
  test/model-registry.test.js \
  test/probability-causality.test.js \
  test/showdown-records.test.js \
  test/showdown-compare.test.js \
  test/authoritative-ledger.test.js \
  test/shadow-cohort.test.js \
  test/predictions-contract-economics.test.js
```

Result: **PASS — 166/166 tests**.

`git diff --check` also passed.

### 3. Canonical design and boundary policy

Created:

- `docs/BEAR_EDGE_BOUNDED_REPAIR_PROGRAM_2026-07-30.md`;
- `governance/system-boundaries.json`.

The manifest gives Bear Edge sole ownership of its repository registry, ledgers,
evidence roots, and `bearEdge.bankroll` setting. Sweet Bear DraftKings
Predictions and Sweet Bear Kalshi are external research lanes with no Bear Edge
write, registry, ledger, bankroll, promotion, or authorization ownership.

### 4. Enforcement implementation

Created:

- `governance/system-boundaries.js`;
- `script/check_system_boundaries.js`;
- `test/system-boundaries.test.js`.

Changed `package.json`:

```text
verify = npm run typecheck && npm test && npm run audit:boundaries
audit:boundaries = node ./script/check_system_boundaries.js
```

The audit fails closed on:

- lane-set or fixed-authorization changes;
- duplicate or external ownership of Bear Edge paths and bankroll keys;
- cross-lane ledger writes, bankroll reads, promotion, or authority transfer;
- DraftKings Predictions contract price substituted for sportsbook American
  odds;
- any Bear Edge model leaving `research_only`;
- Sweet Bear or Kalshi model identity in the Bear Edge registry;
- Kalshi production source in Bear Edge executable source;
- missing, redirected, empty, or symlinked production scan surfaces;
- a shared or renamed literal bankroll namespace in executable source;
- unknown policy fields or widened import modes.

### 5. Focused post-change verification

Command:

```sh
PATH="$PWD/.tools/node/bin:$PATH" node --test \
  test/system-boundaries.test.js \
  test/model-registry.test.js \
  test/probability-causality.test.js \
  test/showdown-records.test.js \
  test/showdown-compare.test.js \
  test/authoritative-ledger.test.js \
  test/shadow-cohort.test.js \
  test/predictions-contract-economics.test.js \
```

Result: **PASS — 183/183 tests**.

This is the comparable command: it contains the same seven pre-change files
that produced 166/166, plus the new 17-test boundary file. The earlier 128/128
post-change command used a narrower selector (four of the seven old files plus
the boundary file); no test had been removed. The 183 result resolves that
selector discrepancy.

The focused command passed in the restricted sandbox without loopback or
network escalation. The full suite contains HTTP integration tests that open
local sockets and was run separately with loopback permission.

Type checking passed.

Direct boundary audit result:

```json
{
  "status": "PASS",
  "repoRoot": "/Users/davidbearmostow/Documents/Codex/2026-06-17-documents-openai-developers-google-drive-google",
  "manifestDigest": "58978495978e6294730036e1416bc791758c31428f5308ea8921fd80b5047b63",
  "laneIds": [
    "bear_edge_core",
    "sweet_bear_draftkings_predictions",
    "sweet_bear_kalshi"
  ],
  "modelCount": 4,
  "researchOnlyModelCount": 4,
  "scannedSourceFiles": 107,
  "bankrollStorageKeys": ["bearEdge.bankroll"],
  "authorization": "PRICE_CHECK_ONLY"
}
```

### 6. Full verification

The first sandboxed `npm run verify` attempt failed because the sandbox denied
loopback `listen` calls and access to the local npm cache. The failures were
`EPERM`, not assertion failures in the boundary change. No code or tests were
changed to bypass them.

The exact same command was rerun with permission for loopback test sockets and
the local npm cache:

```sh
PATH="$PWD/.tools/node/bin:$PATH" npm run verify
```

Result:

- type checking: **PASS**;
- tests: **718/718 PASS**;
- boundary audit: **PASS**.

`git diff --check`: **PASS**.

### 7. Bear Edge doctor

Command:

```sh
PATH="$PWD/.tools/node/bin:$PATH" node \
  /Users/davidbearmostow/.codex/plugins/cache/personal/bear-edge-operator/0.1.0+codex.20260730065217/scripts/bear-edge-doctor.mjs \
  --repo /Users/davidbearmostow/Documents/Codex/2026-06-17-documents-openai-developers-google-drive-google
```

Result:

- profile: `canonical-app`;
- status: `CHECKS_COMPLETE`;
- native verify: **PASS**;
- release audit: **PASS**;
- release report: `shippable-with-warnings`, 75/100;
- server: not running / unreachable during doctor;
- bet-call permission: `PRICE_CHECK_ONLY`;
- receipt run ID: `c0d51d6a-4f93-4661-9b75-2890841f1886`.

Receipt:

```text
reports/plugin-runs/2026-07-30/bear-edge-operator-2026-07-30T10-29-41.925Z-c0d51d6a-4f93-4661-9b75-2890841f1886.json
```

### 8. Pickup package

Created:

```text
docs/CODEX_PICKUP_BEAR_EDGE_2026-07-30.md
```

It contains exact read, focused-test, full-verification, doctor, next-milestone,
credit-control, and hard-stop instructions.

## Revised artifact digests submitted for final review

```text
99765f0e0ffcc45e018a2a435d7b94aa1a4339695c08acf778c134e0a4f44bdb  docs/BEAR_EDGE_BOUNDED_REPAIR_PROGRAM_2026-07-30.md
58978495978e6294730036e1416bc791758c31428f5308ea8921fd80b5047b63  governance/system-boundaries.json
bb8bdc1e9481504587d5dfe7daf107cd863421b7d55b35b068de823b06cff1ec  governance/system-boundaries.js
671ef0d5924a8a87541072a0e7960f81248d40dae38926dd98548186ee7c8081  script/check_system_boundaries.js
c0dd26ee6b53dadf5480159ce9513110629d0d99e3acf0df34697fa42b2789d5  test/system-boundaries.test.js
53ca1cb2cb090b69e173fd577ed3b9d624a5521403c2779f28ecc9985027c21d  package.json
8564aa8cd74cfb9c9e8bc5c99223f9d739f5c339980ffd3c68d1d20b8c5538bc  data/reports/bear_edge_operator_doctor.json
fbbe40da8833399fbbe2cadd43d5f36e6da993a776e3580aa2b69c46a6288a5d  data/reports/release_readiness.json
```

## Independent review status

| Reviewer | Checkpoint | Status | What was actually verified |
|---|---|---|---|
| Claude | Initial architecture / implementation | `PASS_WITH_FINDINGS` | Read four pasted artifacts as text; did not clone, hash, or run tests. Exact response retained. |
| Gemini | Initial architecture / implementation | `FAIL` | Read pasted artifacts as text; did not run the repository. Exact response retained. |
| Claude | Revised architecture checkpoint | `PASS_WITH_FINDINGS` | Read five exact revised artifacts as text; explicitly did not clone, hash, or execute. Exact response retained. |
| Gemini | Revised architecture checkpoint | `PASS_WITH_FINDINGS` | Read five exact revised artifacts as text; explicitly did not execute. Exact response retained. |
| Claude | Finding disposition | `PASS` / `RESOLVED_IN_TEXT` | Reviewed the described bankroll and scan-superset fixes only; execution `NOT_VERIFIED`. Exact response retained. |
| Gemini | Finding disposition | `PASS` / `RESOLVED_IN_TEXT` | Reviewed the described bankroll and scan-superset fixes only; execution `NOT_VERIFIED`. Exact response retained. |
| Claude | Exact final-state acknowledgement | `PASS` / `RESOLVED_IN_TEXT` | Latest suffix-aware hashes reviewed as text; nothing executed or hashed by reviewer. Exact response retained. |
| Gemini | Exact final-state acknowledgement | `PASS` / `RESOLVED_IN_TEXT` | Latest suffix-aware hashes reviewed as text; nothing executed or hashed by reviewer. Exact response retained. |

Language-model review cannot establish statistical calibration, security
certification, market edge, or wagering authority.

Initial reviewer findings led to concrete changes: executable extension
coverage; Windows path rejection; fail-closed missing/empty/symlinked scan
surfaces; an explicit audited root and manifest digest; a validator outside the
production scan surface; computed research-only counts; registry-provenance
field inspection; literal bankroll scanning across production source; strict
policy fields and import modes; fixed-boundary and real-checkout tests; and an
explicit enforced/partial/declared scope matrix.

The second checkpoint found that arbitrary `*.bankroll` literals were silently
discarded, and Claude separately found backtick and suffix literal gaps. The
final implementation captures single-quoted, double-quoted, and backtick
bankroll-like literals, including suffix variants such as
`sweetBear.bankrollCents`, and rejects every observed key except the exact
`bearEdge.bankroll` setting. Multiple rejection cases are iterations inside one
top-level `node:test`, so the top-level totals remain 183 focused and 718 full.
This intentionally rejects future derived names such as
`bearEdge.bankrollHistory`; that is fail-closed policy and requires an explicit
manifest/design change, not an automatic exception.

Reviewer venues:

```text
Claude: https://claude.ai/chat/f9aae25e-a3df-4629-b97a-0c39c9cb19b4
Gemini: https://gemini.google.com/app/cd7064646653c605
Final disposition submitted: 2026-07-30 06:27 EDT
Exact final-state acknowledgement: 2026-07-30 06:32 EDT
```

Not all reviewer suggestions were adopted. A new `lane` field and non-null
evidence digests were not fabricated in the pre-existing strict model registry:
research-only models legitimately have null training/evidence fields, while the
native registry requires them before promotion. Sweet Bear source tokens were
not globally prohibited because Bear Edge intentionally contains read-only
DraftKings Predictions evidence parsers; native contract-economics tests reject
American-odds substitution. Static scanning remains a documented guardrail,
not a runtime security sandbox.

## Honest completion boundary

Completed:

- canonical design/spec;
- implementation plan and milestone checklist;
- machine-readable separation policy;
- executable fail-closed boundary audit;
- adversarial local tests;
- native verification integration;
- audit trail;
- Codex pickup package.

Not completed and not claimed:

- prospective exact-book closing-price collection;
- a preregistered upstream feature/model implementation;
- 500 eligible settled predictions;
- calibration or market-superiority evidence;
- independent statistical or security certification;
- model promotion;
- real-money readiness;
- merge or deployment.
