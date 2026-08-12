# Bear Edge Execution-Quality Grading Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add an immutable, independently reproducible `execution_grade` record that reports numeric CLV, descriptive timing, exact-cohort calibration evidence, and outcome interpretation without blending them into a composite grade.

**Architecture:** Add a pure calculation module that consumes already-validated evaluation, effective settlement, final closing-price, and calibration-report records. Extend the canonical audit contract to schema `2.2.0`, then add an append service, local history resolution, and Supabase projection. The source records remain authoritative facts; an execution grade is a derived, content-addressed record with explicit lineage and `supersedesId`.

**Tech Stack:** Node.js 20+, CommonJS, `node:test`, canonical JSON/SHA-256 audit records, JSONL authoritative ledger, PostgreSQL/Supabase projection.

## Global Constraints

- Ship canonical audit schema `2.2.0`; continue accepting legacy canonical schemas `2.0.0` and `2.1.0`.
- Ship calibration-report schema `1.1.0` with `dataset.evidenceCutoffAt`; continue reading `1.0.0` reports for existing model-registry behavior, but never use a `1.0.0` report to produce a `RATED` execution-calibration readout.
- Ship execution grading policy `bear_edge_execution_quality@1.0.0`.
- Never modify an evaluation, settlement, prediction outcome, or closing-price record while grading it.
- Keep CLV, timing, calibration, and outcome as separate readouts; do not create a composite letter or numeric grade.
- CLV is `takenDecimal / closingDecimal - 1`; positive is `BETTER_THAN_CLOSE`, zero is `AT_CLOSE`, and negative is `WORSE_THAN_CLOSE`.
- Timing reports exact lead seconds/minutes and `PREGAME`, `AT_EVENT_START`, or `LIVE_OR_POST_START`; it never infers execution quality.
- Calibration is `UNRATED` unless the exact model ID, model version, and market-family report has sufficient registered evidence.
- A `RATED` calibration readout copies verified fields from the existing calibration report; it does not recompute Brier score, log loss, ECE, calibration fit, reliability, or bootstrap intervals.
- Broader-cohort calibration is context only and is never included in the actual readout assessment.
- A correction appends a successor `execution_grade` with `supersedesId`; no prior record is overwritten.
- All probability, price, time, identity, digest, and lineage failures fail closed to validation failure or an explicit `UNRATED` component.

---

## File Map

### Create

- `src/audit/execution-grade.js` — pure CLV, timing, exact-cohort calibration selection, outcome interpretation, and complete readout assembly.
- `src/audit/execution-grade-ledger.js` — resolve immutable source lineage, build the canonical record, append it, and resolve successor history.
- `test/execution-grade.test.js` — unit tests for formulas, calibration selection, missing evidence, and outcome separation.
- `test/execution-grade-ledger.test.js` — integration tests for source resolution, append-only persistence, and corrections.
- `supabase/migrations/20260723090000_execution_grades_v22.sql` — owner-scoped immutable remote projection.

### Modify

- `src/audit/record-contract.js` — add schema `2.2.0`, `execution_grade`, constructor, and strict validation.
- `src/audit/authoritative-ledger.js` — no calculation changes; confirm the generic append path accepts the new validated record.
- `src/calibration/report.js` — add the maximum evaluation-evidence availability timestamp required to prevent future-data leakage.
- `src/calibration/model-registry.js` — validate calibration-report schema `1.1.0` and its evidence cutoff while retaining explicit `1.0.0` read compatibility.
- `src/calibration/model-evidence.js` — export a report-by-ID resolver that uses the existing verified report directory and registry validation path.
- `src/sync/outbox.js` — allow `execution_grade` synchronization.
- `src/sync/supabase-mapper.js` — map the canonical grade record without recomputation.
- `src/sync/supabase-client.js` — allow the `execution_grades` table.
- `src/sync/sync-worker.js` — enforce remote dependencies and project the new record type.
- `src/index.js` — export the public grade/read/append interfaces.
- `test/record-contract.test.js` — schema compatibility, validation, and tamper tests.
- `test/outbox.test.js` — new syncable type coverage.
- `test/supabase-mapper.test.js` — exact remote row projection.
- `test/supabase-client.test.js` — allowlisted table behavior.
- `test/sync-worker.test.js` — dependency ordering and successor synchronization.
- `test/supabase-migration.test.js` — table, RLS, immutability, and foreign-key checks.
- `docs/CALIBRATION_READINESS.md` — document that execution grading references verified report metrics and cannot promote a model.
- `README.md` — document the programmatic execution-grading interface after the code exists.

---

### Task 1: Pure CLV and timing readouts

**Files:**
- Create: `src/audit/execution-grade.js`
- Create: `test/execution-grade.test.js`

**Interfaces:**
- Consumes: validated American odds and UTC timestamps.
- Produces:
  - `calculateExecutionClv({ priceTakenAmerican, closingPriceAmerican }): ClvReadout`
  - `calculateExecutionTiming({ betPlacedAt, eventStartTime }): TimingReadout`
  - `classifyExecutionOutcome({ clvDirection, outcome }): OutcomeReadout`

- [ ] **Step 1: Write failing CLV tests**

Cover:

```js
test("CLV reports a better price than close", () => {
  assert.deepEqual(calculateExecutionClv({
    priceTakenAmerican: -110,
    closingPriceAmerican: -125
  }), {
    status: "RATED",
    value: 1.9090909090909092 / 1.8 - 1,
    direction: "BETTER_THAN_CLOSE",
    priceTakenDecimal: 1.9090909090909092,
    closingPriceDecimal: 1.8,
    reasonCodes: []
  });
});

test("CLV direction does not depend on outcome", () => {
  const win = calculateExecutionClv({ priceTakenAmerican: 120, closingPriceAmerican: 105 });
  const loss = calculateExecutionClv({ priceTakenAmerican: 120, closingPriceAmerican: 105 });
  assert.deepEqual(win, loss);
});
```

Also test exact equality, worse-than-close, positive American odds, invalid zero odds, and non-finite odds.

- [ ] **Step 2: Run the focused tests and verify failure**

Run:

```bash
PATH="$PWD/.tools/node/bin:$PATH" node --test test/execution-grade.test.js
```

Expected: FAIL because `src/audit/execution-grade.js` does not exist.

- [ ] **Step 3: Implement the CLV calculation**

Reuse `americanToDecimal` and preserve the current Bear Edge formula:

```js
function calculateExecutionClv({ priceTakenAmerican, closingPriceAmerican }) {
  const priceTakenDecimal = americanToDecimal(priceTakenAmerican);
  const closingPriceDecimal = americanToDecimal(closingPriceAmerican);
  const value = priceTakenDecimal / closingPriceDecimal - 1;
  return {
    status: "RATED",
    value,
    direction: value > 0
      ? "BETTER_THAN_CLOSE"
      : value < 0
        ? "WORSE_THAN_CLOSE"
        : "AT_CLOSE",
    priceTakenDecimal,
    closingPriceDecimal,
    reasonCodes: []
  };
}
```

Do not add probability-point comparisons or A–F thresholds.

- [ ] **Step 4: Write failing timing tests**

Cover positive, zero, and negative lead time:

```js
test("timing reports exact pregame lead without a quality judgment", () => {
  assert.deepEqual(calculateExecutionTiming({
    betPlacedAt: "2026-07-23T16:37:00.000Z",
    eventStartTime: "2026-07-23T19:00:00.000Z"
  }), {
    status: "RATED",
    leadTimeSeconds: 8580,
    leadTimeMinutes: 143,
    phase: "PREGAME",
    reasonCodes: []
  });
});
```

Also reject malformed timestamps and preserve a negative lead for `LIVE_OR_POST_START`.

- [ ] **Step 5: Implement timing and rerun the focused tests**

Calculate:

```js
const leadTimeSeconds = (Date.parse(eventStartTime) - Date.parse(betPlacedAt)) / 1000;
```

Do not introduce early/middle/late buckets.

- [ ] **Step 6: Add outcome-separation tests and implementation**

Use outcome only to name the intersection between price quality and result:

```js
function classifyExecutionOutcome({ clvDirection, outcome }) {
  const price = {
    BETTER_THAN_CLOSE: "GOOD_PRICE",
    AT_CLOSE: "NEUTRAL_PRICE",
    WORSE_THAN_CLOSE: "BAD_PRICE"
  }[clvDirection];
  const result = {
    win: "GOOD_RESULT",
    loss: "BAD_RESULT",
    push: "PUSH",
    void: "VOID"
  }[outcome];
  return {
    result: outcome.toUpperCase(),
    clvOutcomePattern: `${price}_${result}`
  };
}
```

Test all twelve direction/outcome combinations. Assert that changing outcome changes only `OutcomeReadout`, never CLV, timing, or calibration.

- [ ] **Step 7: Rerun Task 1 tests**

```bash
PATH="$PWD/.tools/node/bin:$PATH" node --test test/execution-grade.test.js
```

Expected: PASS.

- [ ] **Step 8: Commit Task 1**

```bash
git add src/audit/execution-grade.js test/execution-grade.test.js
git commit -m "feat: add execution CLV and timing readouts"
```

---

### Task 2: Exact-cohort calibration readout

**Files:**
- Modify: `src/audit/execution-grade.js`
- Modify: `src/calibration/report.js`
- Modify: `src/calibration/model-registry.js`
- Modify: `src/calibration/model-evidence.js`
- Modify: `test/execution-grade.test.js`
- Modify: `test/calibration-report.test.js`
- Modify: `test/model-registry.test.js`

**Interfaces:**
- Consumes:
  - `{ modelId, modelVersion, marketFamily, modelProbabilityAtBet }`
  - a registry-verified calibration report and registered promotion policy.
- Produces:
  - `resolveExecutionCalibration({ identity, probability, report, policy }): CalibrationReadout`
  - `resolveCalibrationReportById(reportId, options): verified report | null`

- [ ] **Step 1: Write the RATED calibration test**

Create a fixture with exact report identity and these existing report paths:

```js
const expectedFields = {
  brierScore: report.evaluation.brierScore,
  logLoss: report.evaluation.logLoss,
  expectedCalibrationError: report.evaluation.expectedCalibrationError,
  slope: report.evaluation.calibration.slope,
  intercept: report.evaluation.calibration.intercept,
  brierInterval: report.evaluation.uncertainty.intervals.brierScore,
  logLossInterval: report.evaluation.uncertainty.intervals.logLoss,
  expectedCalibrationErrorInterval:
    report.evaluation.uncertainty.intervals.expectedCalibrationError,
  calibrationSlopeInterval:
    report.evaluation.uncertainty.intervals.calibrationSlope,
  calibrationInterceptInterval:
    report.evaluation.uncertainty.intervals.calibrationIntercept
};
```

Assert that the reliability bucket containing `modelProbabilityAtBet` is copied from:

```js
report.evaluation.calibration.reliability
```

The upper boundary is exclusive except for the final bucket, whose upper boundary includes `1`.

- [ ] **Step 2: Write fail-closed calibration tests**

Assert `status: "UNRATED"` for:

- no report;
- report ID or digest mismatch;
- model ID mismatch;
- model version mismatch;
- market-family mismatch;
- evidence cutoff after `betPlacedAt`;
- legacy report schema `1.0.0`, which has no trustworthy evidence-availability cutoff;
- insufficient settled predictions;
- insufficient distinct events;
- insufficient observations in any registered reliability bucket;
- insufficient settlement coverage;
- missing or non-finite bootstrap intervals;
- non-converged calibration fit.

No failure may substitute a pooled, neutral, or broader-cohort value.

- [ ] **Step 3: Run focused tests and verify failure**

```bash
PATH="$PWD/.tools/node/bin:$PATH" node --test test/execution-grade.test.js
```

Expected: FAIL because calibration selection is not implemented.

- [ ] **Step 4: Add a report evidence-availability cutoff**

Bump the calibration-report writer to schema `1.1.0`. Calculate:

```js
const evidenceCutoffAt = settledEvaluationRows
  .flatMap((row) => [row.settledAt, row.closingPrice?.capturedAt])
  .filter((value) => typeof value === "string")
  .sort()
  .at(-1);
```

Write the result to `report.dataset.evidenceCutoffAt`. It represents the latest time at which any outcome or closing-price evidence used by the evaluation metrics became available. Add it to the content-addressed report evidence and require it to be a valid UTC timestamp.

Update the registry loader to accept existing report schema `1.0.0` for backward-compatible inspection and schema `1.1.0` for new reports. Only schema `1.1.0` is eligible for a `RATED` execution-calibration readout.

- [ ] **Step 5: Implement report reuse without metric recomputation**

`RATED` means evidence sufficiency, not that calibration performance is good. Require the existing promotion checks:

```js
const REQUIRED_EVIDENCE_CHECKS = new Set([
  "minimumSettledPredictions",
  "minimumDistinctEvents",
  "registeredSplitMethod",
  "minimumBucketObservations",
  "minimumSettlementCoverage",
  "policyRegisteredBeforeEvaluation"
]);
```

Also require finite existing metric and uncertainty fields. Populate:

```js
{
  status: "RATED",
  evidenceAssessment: "SUFFICIENT_EXACT_COHORT_EVIDENCE",
  policyAssessment: calibrationChecksPass
    ? "WITHIN_REGISTERED_CALIBRATION_BOUNDS"
    : "OUTSIDE_REGISTERED_CALIBRATION_BOUNDS",
  exactCohort: {
    modelId,
    modelVersion,
    marketFamily,
    probabilityBucket: {
      lower: bucket.lower,
      upper: bucket.upper
    }
  },
  evidence: {
    predictionCount: report.evaluation.predictionCount,
    settledCount: report.evaluation.settledCount,
    distinctEventCount: report.evaluation.distinctEventCount,
    settlementCoverage: report.evaluation.settlementCoverage,
    settledObservationSetDigest: report.evaluation.settledObservationSetDigest,
    evidenceCutoffAt: report.dataset.evidenceCutoffAt,
    requirementsSatisfied: true
  },
  metrics: {
    brierScore: report.evaluation.brierScore,
    logLoss: report.evaluation.logLoss,
    expectedCalibrationError: report.evaluation.expectedCalibrationError,
    calibrationSlope: report.evaluation.calibration.slope,
    calibrationIntercept: report.evaluation.calibration.intercept,
    reliabilityBucket: structuredClone(bucket),
    uncertainty: {
      method: report.evaluation.uncertainty.method,
      confidenceLevel: report.evaluation.uncertainty.confidenceLevel,
      resamples: report.evaluation.uncertainty.resamples,
      clusterUnit: report.evaluation.uncertainty.clusterUnit,
      intervals: structuredClone(report.evaluation.uncertainty.intervals)
    }
  },
  broaderContext: []
}
```

`calibrationChecksPass` uses only:

- `maximumExpectedCalibrationError`
- `calibrationSlopeRange`
- `maximumAbsoluteCalibrationIntercept`

Do not use CLV, ROI, outcome, or baseline checks to label calibration quality.

- [ ] **Step 6: Add the report resolver**

Export a narrow resolver from `src/calibration/model-evidence.js` that:

1. loads reports through the existing report-directory path;
2. returns only the requested report ID;
3. relies on `loadModelRegistry` to verify report digest, identity, policy, and registry linkage;
4. returns `null` rather than synthesizing evidence when the model has no registered report.

- [ ] **Step 7: Rerun focused calibration and registry tests**

```bash
PATH="$PWD/.tools/node/bin:$PATH" node --test \
  test/execution-grade.test.js \
  test/calibration-report.test.js \
  test/model-registry.test.js
```

Expected: PASS.

- [ ] **Step 8: Commit Task 2**

```bash
git add \
  src/audit/execution-grade.js \
  src/calibration/report.js \
  src/calibration/model-registry.js \
  src/calibration/model-evidence.js \
  test/execution-grade.test.js \
  test/calibration-report.test.js \
  test/model-registry.test.js
git commit -m "feat: reuse exact-cohort calibration evidence"
```

---

### Task 3: Canonical schema 2.2.0 execution-grade record

**Files:**
- Modify: `src/audit/record-contract.js`
- Modify: `test/record-contract.test.js`

**Interfaces:**
- Consumes: complete source snapshots and readouts from Tasks 1–2.
- Produces:
  - `createExecutionGradeRecord(input, context): canonical execution_grade`
  - validation support for `recordType: "execution_grade"`.

- [ ] **Step 1: Write schema-version compatibility tests**

Assert:

```js
assert.equal(AUDIT_RECORD_SCHEMA_VERSION, "2.2.0");
assert.deepEqual(
  SUPPORTED_AUDIT_RECORD_SCHEMA_VERSIONS,
  ["2.0.0", "2.1.0", "2.2.0"]
);
```

Ensure existing `2.1.0` prediction outcomes and closing prices remain valid. Replace the current “must equal latest schema” rule with an explicit minimum-supported-version rule for those record types.

- [ ] **Step 2: Write execution-grade contract tests**

Test:

- required identity and SHA-256 content digest;
- `grade_<uuid>` ID;
- exact lineage IDs and digests;
- nullable calibration report ID/digest only when calibration is `UNRATED`;
- required calibration report ID/digest when calibration is `RATED`;
- `supersedesId` must reference `grade_<uuid>`;
- no composite grade field;
- no `clvProbabilityPoints`;
- immutable source snapshots;
- finite CLV and timestamp values;
- allowed enums for all component statuses and directions;
- rejection of unknown neighbor fields.

- [ ] **Step 3: Run contract tests and verify failure**

```bash
PATH="$PWD/.tools/node/bin:$PATH" node --test test/record-contract.test.js
```

Expected: FAIL because schema `2.2.0` and `execution_grade` are absent.

- [ ] **Step 4: Extend the canonical contract**

Add:

```js
const AUDIT_RECORD_SCHEMA_VERSION = "2.2.0";
const SUPPORTED_AUDIT_RECORD_SCHEMA_VERSIONS =
  Object.freeze(["2.0.0", "2.1.0", AUDIT_RECORD_SCHEMA_VERSION]);
```

Add `execution_grade` to `RECORD_TYPES`, `grade` to the ID-prefix map, a constructor that calls `finalizeRecord`, and strict nested-field validation.

- [ ] **Step 5: Run record and authoritative-ledger tests**

```bash
PATH="$PWD/.tools/node/bin:$PATH" node --test \
  test/record-contract.test.js \
  test/authoritative-ledger.test.js
```

Expected: PASS.

- [ ] **Step 6: Commit Task 3**

```bash
git add src/audit/record-contract.js test/record-contract.test.js
git commit -m "feat: add execution grade audit contract v2.2"
```

---

### Task 4: Append service and correction resolution

**Files:**
- Create: `src/audit/execution-grade-ledger.js`
- Create: `test/execution-grade-ledger.test.js`
- Modify: `src/index.js`

**Interfaces:**
- Consumes: authoritative ledger path, evaluation ID, optional prior grade ID, registry/report options.
- Produces:
  - `appendExecutionGrade(evaluationId, options)`
  - `resolveExecutionGradeHistory(records)`
  - `getLatestExecutionGrade(evaluationId, options)`

- [ ] **Step 1: Write failing integration tests**

Test:

- missing evaluation fails;
- unresolved or pending settlement fails;
- effective amended settlement is used;
- final closing-price identity must match the evaluation;
- calibration lineage is null for `UNRATED`;
- `RATED` calibration lineage exactly matches the verified report;
- first append creates one grade;
- identical repeat is idempotent;
- corrected evidence requires `supersedesId`;
- branching successors fail closed;
- a successor cannot cross evaluation IDs;
- old grades remain readable.

- [ ] **Step 2: Run tests and verify failure**

```bash
PATH="$PWD/.tools/node/bin:$PATH" node --test test/execution-grade-ledger.test.js
```

Expected: FAIL because the ledger service does not exist.

- [ ] **Step 3: Implement source resolution**

Use existing ledger readers and settlement/evidence resolution. Validate the source digests before calculation. Build readouts only after all required source identities agree.

For `UNRATED` calibration:

```js
lineage.calibrationReportId = null;
lineage.calibrationReportDigest = null;
```

For `RATED` calibration, copy the exact verified report identifiers.

- [ ] **Step 4: Implement append and successor resolution**

Call `appendAuthoritativeRecord` only with a canonical record from `createExecutionGradeRecord`. Resolve a linear correction history with the same fail-closed rules used by closing-price evidence.

- [ ] **Step 5: Export the public API**

Add the three interfaces to `src/index.js`; do not add an HTTP route or dashboard UI in this version.

- [ ] **Step 6: Run focused integration tests**

```bash
PATH="$PWD/.tools/node/bin:$PATH" node --test \
  test/execution-grade.test.js \
  test/execution-grade-ledger.test.js \
  test/authoritative-ledger.test.js \
  test/index.test.js
```

Expected: PASS.

- [ ] **Step 7: Commit Task 4**

```bash
git add src/audit/execution-grade-ledger.js test/execution-grade-ledger.test.js src/index.js
git commit -m "feat: append immutable execution grades"
```

---

### Task 5: Supabase projection and synchronization

**Files:**
- Create: `supabase/migrations/20260723090000_execution_grades_v22.sql`
- Modify: `src/sync/outbox.js`
- Modify: `src/sync/supabase-mapper.js`
- Modify: `src/sync/supabase-client.js`
- Modify: `src/sync/sync-worker.js`
- Modify: `test/outbox.test.js`
- Modify: `test/supabase-mapper.test.js`
- Modify: `test/supabase-client.test.js`
- Modify: `test/sync-worker.test.js`
- Modify: `test/supabase-migration.test.js`

**Interfaces:**
- Consumes: canonical `execution_grade` and resolved remote decision/settlement/closing-price dependencies.
- Produces: immutable owner-scoped `execution_grades` row.

- [ ] **Step 1: Write migration contract tests**

Require:

- `user_id`, `client_event_id`, and canonical content digest;
- foreign keys to the owner’s decision, settlement, and closing-price rows;
- nullable calibration report identity columns;
- owner-scoped self-reference for `supersedes_client_event_id`;
- unique `(user_id, client_event_id)`;
- RLS select/insert for `auth.uid()`;
- no update or delete policy;
- trigger rejection when a successor crosses decision ownership.

- [ ] **Step 2: Write mapper and worker tests**

Assert exact snapshot preservation, no metric recomputation, dependency-first synchronization, idempotent insert, and terminal failure for invalid lineage.

- [ ] **Step 3: Run focused sync tests and verify failure**

```bash
PATH="$PWD/.tools/node/bin:$PATH" node --test \
  test/outbox.test.js \
  test/supabase-mapper.test.js \
  test/supabase-client.test.js \
  test/sync-worker.test.js \
  test/supabase-migration.test.js
```

Expected: FAIL because the new type and table are unsupported.

- [ ] **Step 4: Add the migration and projection**

Store the complete canonical record in `record_snapshot jsonb` plus indexed lineage columns. Add `execution_grade` to the outbox type list and `execution_grades` to the client allowlist. Map values by copying from the canonical record.

- [ ] **Step 5: Rerun focused sync tests**

Use the command from Step 3.

Expected: PASS.

- [ ] **Step 6: Commit Task 5**

```bash
git add \
  supabase/migrations/20260723090000_execution_grades_v22.sql \
  src/sync/outbox.js \
  src/sync/supabase-mapper.js \
  src/sync/supabase-client.js \
  src/sync/sync-worker.js \
  test/outbox.test.js \
  test/supabase-mapper.test.js \
  test/supabase-client.test.js \
  test/sync-worker.test.js \
  test/supabase-migration.test.js
git commit -m "feat: synchronize execution grade records"
```

---

### Task 6: Documentation and full verification

**Files:**
- Modify: `docs/CALIBRATION_READINESS.md`
- Modify: `README.md`

**Interfaces:**
- Consumes: the shipped public interfaces and canonical schema.
- Produces: operator documentation that describes implemented behavior without claiming a composite grade or validated model.

- [ ] **Step 1: Add documentation assertions**

Extend an existing tooling/documentation test to require:

- audit schema `2.2.0`;
- `execution_grade`;
- numeric CLV formula;
- descriptive timing;
- exact-cohort `RATED`/`UNRATED` behavior;
- no composite grade;
- correction via `supersedesId`.

- [ ] **Step 2: Update documentation**

Document the public programmatic call and explicitly state:

- calibration metrics are copied from the verified report;
- `RATED` means sufficient evidence exists, not that calibration passed;
- `policyAssessment` reports whether ECE, slope, and intercept satisfy registered bounds;
- CLV and timing remain available when calibration is `UNRATED`;
- outcome never modifies any component readout.

- [ ] **Step 3: Run the complete verification suite**

```bash
PATH="$PWD/.tools/node/bin:$PATH" npm run verify
```

Expected: typecheck succeeds and every test passes.

- [ ] **Step 4: Run release and calibration audits**

```bash
PATH="$PWD/.tools/node/bin:$PATH" npm run audit:calibration
PATH="$PWD/.tools/node/bin:$PATH" npm run audit:release
```

Expected:

- calibration remains blocked unless genuine evidence now satisfies existing policy;
- permission remains `PRICE_CHECK_ONLY` unless separately earned;
- no execution-grade change may promote a model or authorize a bet.

- [ ] **Step 5: Verify a clean packaged artifact in a separate environment**

After all approved changes are committed:

```bash
PATH="$PWD/.tools/node/bin:$PATH" npm run package:portable
```

Install the resulting tarball in a fresh temporary directory, require the package, and smoke-test the exported pure grading functions. Do not treat an in-tree test as portability evidence.

- [ ] **Step 6: Commit Task 6**

```bash
git add docs/CALIBRATION_READINESS.md README.md
git commit -m "docs: describe execution quality grading"
```

---

## Acceptance Criteria

- One resolved bet can produce one immutable canonical `execution_grade`.
- CLV matches the existing Bear Edge decimal-return formula and never consumes model probability or outcome.
- Timing reports exact lead time and phase without quality inference.
- Calibration is `UNRATED` when exact-cohort evidence is insufficient, missing, mismatched, post-dated, or unverifiable.
- `RATED` calibration copies the verified report’s evaluation metrics and matching reliability bucket without recalculation.
- `RATED` calibration requires report schema `1.1.0` and `dataset.evidenceCutoffAt <= betPlacedAt`, preventing the graded bet or later evidence from entering its own historical calibration context.
- Broader cohorts remain context-only.
- Outcome interpretation can say `GOOD_PRICE_BAD_RESULT` or `BAD_PRICE_GOOD_RESULT` without altering component values.
- No composite A–F or numeric grade exists.
- Corrections form a single append-only successor chain.
- Local and remote persistence are owner-scoped, content-addressed, and idempotent.
- Schema `2.0.0` and `2.1.0` records continue to validate under code shipping schema `2.2.0`.
- Calibration-report schema `1.0.0` remains readable, while only schema `1.1.0` can support a time-safe `RATED` execution-calibration readout.
- The full first-party suite, release audit, calibration audit, and separate-environment package smoke test complete before release-candidate status is claimed.
