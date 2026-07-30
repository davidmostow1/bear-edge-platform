# Bear Edge Calibration and Model Registry Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace self-declared calibration status with versioned, chronological, reproducible evidence that controls whether a market-family model may produce `BET`.

**Architecture:** A dependency-free metric library computes calibration and scoring statistics, a dataset module enforces timestamp integrity and chronological splits, a tracked model registry references immutable report digests, and the decision gate resolves model status from that registry rather than trusting request input.

**Tech Stack:** Node.js CommonJS, built-in `node:test`, JSON and JSONL datasets, deterministic seeded bootstrap, existing decision engine, and optional Wolfram golden verification.

## Global Constraints

- Research-only, shadow, unknown, and retired models produce `WAIT` when production probability is required.
- Training, calibration, and evaluation splits are chronological.
- Closing prices are evaluation evidence only and cannot leak into earlier predictions.
- Promotion thresholds are registered before evaluation.
- The three-win streak is descriptive and cannot promote a model.
- No report may claim validation with insufficient observations or settlement coverage.
- Preserve unrelated worktree changes.

---

## File Map

| File | Responsibility |
| --- | --- |
| `src/calibration/metrics.js` | Brier, log loss, expected calibration error, calibration line, intervals, and market comparisons |
| `src/calibration/dataset.js` | Schema validation, duplicate checks, leakage checks, and chronological splits |
| `src/calibration/report.js` | Market-family report generation and content digest |
| `src/calibration/model-registry.js` | Registry loading, status resolution, and promotion policy |
| `models/registry.json` | Tracked initial model and threshold registry |
| `script/build_calibration_report.js` | Reproducible report command |
| `src/live/estimate-prop.js` | Resolve model status from registry |
| `src/live/best-mlb-targets.js` | Include model and report identity in displayed evaluations |
| `src/validate-live-ticket.js` | Stop trusting caller-supplied `validated` without a registry reference |
| `src/release-readiness.js` | Calibration evidence gate |
| `test/calibration-metrics.test.js` | Formula and boundary tests |
| `test/calibration-dataset.test.js` | Leakage, duplicate, and split tests |
| `test/model-registry.test.js` | Promotion and status tests |
| `test/calibration-report.test.js` | Report determinism tests |
| `test/live-ticket.test.js` | End-to-end calibration enforcement tests |

### Task 1: Independent Calibration Metric Library

**Files:**
- Create: `src/calibration/metrics.js`
- Create: `test/calibration-metrics.test.js`

**Interfaces:**
- Produces: `brierScore(rows) -> number`
- Produces: `logLoss(rows, epsilon = 1e-15) -> number`
- Produces: `expectedCalibrationError(rows, buckets) -> { value, reliability }`
- Produces: `fitCalibrationLine(rows) -> { intercept, slope, converged, iterations }`
- Produces: `bootstrapMeanInterval(values, options) -> { mean, lower, upper, samples, confidence }`

- [ ] **Step 1: Write golden formula tests**

```js
const ROWS = [
  { probability: 0.9, outcome: 1 },
  { probability: 0.8, outcome: 1 },
  { probability: 0.4, outcome: 0 },
  { probability: 0.2, outcome: 1 }
];

test("brierScore matches independent arithmetic", () => {
  const expected = ((0.9 - 1) ** 2 + (0.8 - 1) ** 2 + (0.4 - 0) ** 2 + (0.2 - 1) ** 2) / 4;
  assert.ok(Math.abs(brierScore(ROWS) - expected) < 1e-15);
});

test("logLoss matches an independently expanded equation", () => {
  const expected = -(
    Math.log(0.9) + Math.log(0.8) + Math.log(0.6) + Math.log(0.2)
  ) / 4;
  assert.ok(Math.abs(logLoss(ROWS) - expected) < 1e-15);
});

test("metric functions reject empty, non-finite, out-of-range, and non-binary rows", () => {
  assert.throws(() => brierScore([]), /at least one/);
  assert.throws(() => brierScore([{ probability: 1.2, outcome: 1 }]), /between 0 and 1/);
  assert.throws(() => logLoss([{ probability: 0.5, outcome: 2 }]), /zero or one/);
});
```

- [ ] **Step 2: Confirm tests fail**

```bash
PATH="/Applications/ChatGPT.app/Contents/Resources/cua_node/bin:$PATH" node --test test/calibration-metrics.test.js
```

Expected: FAIL because the metric module does not exist.

- [ ] **Step 3: Implement Brier score and log loss**

Use direct finite-number validation and the documented equations. Clamp only inside `logLoss` to `[epsilon, 1 - epsilon]`; do not change stored probabilities.

- [ ] **Step 4: Implement expected calibration error**

Use explicit half-open buckets except for the last inclusive upper bound. Each reliability row contains lower bound, upper bound, count, mean probability, observed rate, and weighted absolute gap. Reject overlapping, gapped, or unsorted bucket definitions.

- [ ] **Step 5: Implement calibration intercept and slope**

Fit `logit(outcome probability) = intercept + slope * logit(predicted probability)` through Newton-Raphson logistic regression. Clamp prediction inputs to `[1e-12, 1 - 1e-12]`, stop when both parameter changes are below `1e-10`, cap at 100 iterations, and return `converged: false` rather than inventing values for singular data.

- [ ] **Step 6: Implement deterministic bootstrap intervals**

Use a seeded `xorshift32` generator, 10,000 samples by default, percentile bounds for the requested confidence, and stable sorting. Reject fewer than two finite values.

- [ ] **Step 7: Independently verify golden values**

Use Wolfram for the four-row Brier and log-loss examples and for one synthetic calibration-line fixture. Retain the query and exact numeric output in `data/reports/elite-audit/math-golden.json`; local tests must not call Wolfram.

- [ ] **Step 8: Run tests and commit**

```bash
PATH="/Applications/ChatGPT.app/Contents/Resources/cua_node/bin:$PATH" node --test test/calibration-metrics.test.js
git add src/calibration/metrics.js test/calibration-metrics.test.js
git diff --cached --check
git commit -m "Add calibration metric library"
```

### Task 2: Timestamp-Safe Dataset and Chronological Splits

**Files:**
- Create: `src/calibration/dataset.js`
- Create: `test/calibration-dataset.test.js`

**Interfaces:**
- Produces: `validatePredictionRow(row) -> issues[]`
- Produces: `buildDatasetManifest(rows) -> manifest`
- Produces: `chronologicalSplit(rows, policy) -> { training, calibration, evaluation, cutoffs }`
- Produces: `detectLeakage(rows) -> findings[]`

- [ ] **Step 1: Write valid and invalid row fixtures**

The canonical row contains `predictionId`, `eventId`, `marketFamily`, `participantId`, `line`, `price`, `oppositePrice`, `predictedProbability`, `predictionAt`, `featureCutoffAt`, `eventStartAt`, `settledAt`, `outcome`, `closingPrice`, `modelId`, and `modelVersion`.

Add tests that reject feature timestamps after `predictionAt`, prediction timestamps after event start, duplicate prediction identifiers, duplicate event-market-participant-line-model observations, settlement before event start, and closing price timestamps before the market is closed when marked final.

- [ ] **Step 2: Confirm tests fail**

```bash
PATH="/Applications/ChatGPT.app/Contents/Resources/cua_node/bin:$PATH" node --test test/calibration-dataset.test.js
```

- [ ] **Step 3: Implement row validation and manifest**

The manifest includes row count, valid count, invalid count, duplicate count, market-family counts, model-version counts, minimum prediction time, maximum prediction time, settlement coverage, source digests, and dataset digest.

- [ ] **Step 4: Implement chronological split**

Accept exact policy fractions `{ training: 0.6, calibration: 0.2, evaluation: 0.2 }`. Sort by `predictionAt`, assign whole timestamp groups to one split so simultaneous observations never cross boundaries, and return actual counts and cutoffs.

- [ ] **Step 5: Add future-information regression tests**

Assert no evaluation row timestamp is at or before the calibration cutoff and no training row timestamp is after the training cutoff. Assert changing a settlement or closing value cannot alter the earlier prediction feature snapshot.

- [ ] **Step 6: Run tests and commit**

```bash
PATH="/Applications/ChatGPT.app/Contents/Resources/cua_node/bin:$PATH" node --test test/calibration-dataset.test.js
git add src/calibration/dataset.js test/calibration-dataset.test.js
git commit -m "Add chronological calibration datasets"
```

### Task 3: Model Registry and Promotion Policy

**Files:**
- Create: `src/calibration/model-registry.js`
- Create: `models/registry.json`
- Create: `test/model-registry.test.js`
- Modify: `package.json`

**Interfaces:**
- Produces: `loadModelRegistry(options) -> registry`
- Produces: `resolveModelStatus(modelId, modelVersion, marketFamily, options) -> model entry`
- Produces: `evaluatePromotion(report, policy) -> { passed, checks }`

- [ ] **Step 1: Create the initial registry fixture in the test**

```json
{
  "schemaVersion": "1.0.0",
  "policyVersion": "1.0.0",
  "promotionPolicy": {
    "minimumSettledPredictions": 500,
    "minimumBucketObservations": 100,
    "minimumSettlementCoverage": 0.95,
    "maximumExpectedCalibrationError": 0.03,
    "minimumCalibrationSlope": 0.8,
    "maximumCalibrationSlope": 1.2,
    "maximumAbsoluteCalibrationIntercept": 0.05,
    "requireNoMaterialBaselineDegradation": true,
    "requireNonNegativeClosingLineValueInterval": true
  },
  "models": []
}
```

- [ ] **Step 2: Write failing promotion tests**

Test each threshold independently at one value below, exactly equal, and one value above where meaningful. Exact equality passes only for inclusive bounds stated in the approved specification.

- [ ] **Step 3: Implement registry validation and promotion checks**

Reject duplicate `(modelId, modelVersion, marketFamily)` keys, unsupported statuses, missing report digests for `shadow` or `validated`, and a `validated` entry whose report does not pass the registered policy.

- [ ] **Step 4: Add the tracked initial registry**

Register the existing `poisson_count_v1` versions for pitcher strikeouts, batter hits, batter runs, and batter total bases as `research_only`, each with `calibrationReportId: null` and no promotion timestamp.

- [ ] **Step 5: Include models in portable packages**

Add `models/**/*.json` to `package.json.files`.

- [ ] **Step 6: Run tests and commit**

```bash
PATH="/Applications/ChatGPT.app/Contents/Resources/cua_node/bin:$PATH" node --test test/model-registry.test.js
git add src/calibration/model-registry.js models/registry.json test/model-registry.test.js package.json
git commit -m "Add versioned model promotion registry"
```

### Task 4: Reproducible Calibration Reports

**Files:**
- Create: `src/calibration/report.js`
- Create: `script/build_calibration_report.js`
- Create: `test/calibration-report.test.js`
- Modify: `package.json`

**Interfaces:**
- Produces: `buildCalibrationReport(rows, options) -> immutable report`
- Produces command: `npm run calibrate -- --input <jsonl> --market-family <name> --model-id <id> --model-version <version> --output <json>`

- [ ] **Step 1: Write deterministic report tests**

Assert stable ordering, exact dataset digest, metric values, reliability buckets, comparison baseline, promotion checks, generated report digest, and no mutation of input rows.

- [ ] **Step 2: Confirm tests fail**

```bash
PATH="/Applications/ChatGPT.app/Contents/Resources/cua_node/bin:$PATH" node --test test/calibration-report.test.js
```

- [ ] **Step 3: Implement report generation**

Build separate training, calibration, and evaluation summaries, but allow promotion checks to use evaluation rows only. Include every invalid or excluded row by identifier and reason. Record policy version and threshold values inside the report.

- [ ] **Step 4: Implement the command-line script**

Validate all required flags, read one JSON object per nonblank line, write formatted JSON, and exit nonzero when rows are invalid or the report cannot be constructed. The command does not promote the model automatically.

- [ ] **Step 5: Add package script and run tests**

Add:

```json
"calibrate": "node ./script/build_calibration_report.js"
```

Run:

```bash
PATH="/Applications/ChatGPT.app/Contents/Resources/cua_node/bin:$PATH" node --test test/calibration-report.test.js
```

- [ ] **Step 6: Commit Task 4**

```bash
git add src/calibration/report.js script/build_calibration_report.js test/calibration-report.test.js package.json
git commit -m "Add reproducible calibration reports"
```

### Task 5: Enforce Registry Status in Decisions

**Files:**
- Modify: `src/validate-live-ticket.js`
- Modify: `src/live/estimate-prop.js`
- Modify: `src/live/best-mlb-targets.js`
- Modify: `src/release-readiness.js`
- Modify: `test/live-ticket.test.js`
- Modify: `test/api.test.js`

**Interfaces:**
- Consumes: `resolveModelStatus(modelId, modelVersion, marketFamily)`
- Produces: gate results with registry evidence and report digest

- [ ] **Step 1: Write caller-forgery regression tests**

```js
test("caller-supplied validated status cannot override a research-only registry entry", async () => {
  const ticket = validateLiveTicket({
    ...validTicket,
    legs: [{ ...validTicket.legs[0], calibrationStatus: "validated", modelId: "poisson_count_v1", modelVersion: "1.0.0" }]
  });
  const result = await evaluateLiveTicket(ticket, fixtureOptions);
  assert.equal(result.verdict, "WAIT");
  assert.ok(result.riskFlags.some((flag) => flag.code === "MODEL_CALIBRATION_REQUIRED"));
});
```

- [ ] **Step 2: Confirm the regression test fails under current trust behavior**

```bash
PATH="/Applications/ChatGPT.app/Contents/Resources/cua_node/bin:$PATH" node --test test/live-ticket.test.js
```

- [ ] **Step 3: Replace caller trust with registry lookup**

Keep `calibrationStatus` as backward-compatible input metadata but never use it as authority. Require model identifier and version for production probability. Resolve the market-family entry and attach registry status, policy version, report identifier, and report digest to gate results.

- [ ] **Step 4: Add release calibration evidence**

Release readiness lists each market family and model version. It reports `validated` only when registry status and report digest pass. An empty validated set keeps `VERIFIED_BETS_ALLOWED` from producing actual `BET` outputs even if odds are live.

- [ ] **Step 5: Run Plan 3 verification and commit**

```bash
PATH="/Applications/ChatGPT.app/Contents/Resources/cua_node/bin:$PATH" node --test test/calibration-metrics.test.js test/calibration-dataset.test.js test/model-registry.test.js test/calibration-report.test.js test/live-ticket.test.js test/api.test.js
PATH="/Applications/ChatGPT.app/Contents/Resources/cua_node/bin:$PATH" npm run verify
git add src/validate-live-ticket.js src/live/estimate-prop.js src/live/best-mlb-targets.js src/release-readiness.js test/live-ticket.test.js test/api.test.js
git diff --cached --check
git commit -m "Enforce registered calibration evidence"
```
