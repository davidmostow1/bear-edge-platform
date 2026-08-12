# Bear Edge Elite Audit and Decision Integrity Design

**Date:** 2026-07-17
**Status:** Approved architecture, implementation pending specification review
**Authority decision:** The append-only local ledger is authoritative. Supabase is an idempotently synchronized remote projection.

## 1. Purpose

This specification defines the production-hardening update for Bear Edge. The update is intended to make every displayed evaluation traceable, fail-closed, mathematically reproducible, locally durable, remotely auditable, and operational in real-world local and private-LAN workflows.

This design does not promise winning wagers or perfect future predictions. No software can truthfully guarantee either. In this specification, complete accuracy means that every accessible requirement, source file, calculation, schema object, local data record, migration, integration contract, and supported runtime workflow is included in the audit inventory and receives reproducible evidence or an explicit unresolved classification.

The final audit may report `verified`, `failed`, `blocked`, or `not externally verifiable`. It must never convert an unknown into a pass.

## 2. Objectives

1. Prevent any unlogged recommendation from appearing in the API, dashboard, command-line output, or an assistant-facing workflow.
2. Preserve the existing distinction between `fairEdge` and `priceEdge`.
3. Preserve the canonical evaluation verdicts `PASS`, `WAIT`, and `BET`.
4. Preserve `PRICE_CHECK_ONLY` as an operational permission rather than a recommendation verdict.
5. Make the local append-only ledger the source of truth for evaluations, settlements, amendments, synchronization events, and model-promotion events.
6. Synchronize immutable records to Supabase without making evaluation dependent on Supabase availability.
7. Prevent research-only models from producing or being displayed as qualified `BET` calls.
8. Add versioned, market-specific, time-ordered calibration and backtesting.
9. Make recommendation, settlement, and model-performance evidence queryable without rewriting historical records.
10. Verify real local and private-LAN operation under normal and degraded conditions.
11. Produce a requirements-to-code-to-test-to-runtime traceability matrix with no unclassified requirement.
12. Produce a file and data manifest proving the scope that was actually inspected.

## 3. Non-Goals

1. The system will not place wagers automatically.
2. The system will not bypass a sportsbook's terms, access controls, or technical protections.
3. The system will not treat screenshots, optical character recognition, editorial pages, or conversation text as verified live odds.
4. The system will not claim predictive superiority until sufficient settled, out-of-sample evidence exists.
5. The system will not use a short winning streak as proof of calibration.
6. The system will not make Supabase, Statsig, Deepnote, or any other remote service mandatory for local evaluation.
7. The system will not silently repair malformed records, coerce incompatible enums, or discard synchronization failures.

## 4. Truth and Evidence Standard

Every final claim must be assigned one of the following evidence classes:

| Evidence class | Meaning |
| --- | --- |
| `PROVEN_STATIC` | Established by direct inspection of the exact committed source, schema, configuration, or data artifact. |
| `PROVEN_TEST` | Established by a deterministic automated test with the command and result retained. |
| `PROVEN_RUNTIME` | Established by executing the supported runtime path and retaining the observed response or artifact. |
| `PROVEN_EXTERNAL` | Established from an authoritative external system during the audit, with timestamp and source identity. |
| `ASSUMPTION` | A design input that has not yet been independently verified. It cannot satisfy a release gate. |
| `BLOCKED_EXTERNAL` | Verification requires credentials, service availability, provider access, or real production history that is not available. |
| `FAILED` | The requirement or check was exercised and did not pass. |

The final report must contain no unqualified words such as "complete," "production-ready," "accurate," or "validated." Each such conclusion must identify its evidence class and scope.

## 5. Baseline Observed Before Implementation

The following facts were observed during design discovery and must be reverified before implementation begins and again before completion:

1. The repository is a CommonJS Node.js application with no runtime package dependencies declared.
2. The verification command passed 138 tests during the design audit.
3. The release audit reported `shippable-with-warnings` with a score of 85 out of 100 during the design audit.
4. The local server was not running during the Bear Edge doctor check.
5. No configured provider was available to the doctor check.
6. The live best-target count was zero and bet-call permission was `PRICE_CHECK_ONLY`.
7. The current best-target endpoint can return ranked research candidates without first appending recommendation records.
8. The straight and live evaluation paths permit callers to disable logging with `writeLog: false`.
9. The current three-win gate is descriptive performance history, not statistically sufficient model validation.
10. The current Poisson count estimator is marked `research_only` and protected code returns `WAIT` when calibration is required.
11. The current worktree contains substantial pre-existing tracked and untracked changes. Implementation must preserve and integrate those changes rather than reverting them.
12. The observed Supabase project contained append-oriented decision, settlement, and amendment tables with row-level security enabled, but its verdict and settlement enums did not fully match local canonical values.
13. The observed Statsig project contained no Bear Edge-specific feature gates or experiments.

These are baseline observations, not permanent truths. Their revalidation results belong in the final audit matrix.

## 6. Architecture

### 6.1 End-to-End Flow

1. A source adapter captures an event, market, participant, line, price, sportsbook, and timestamp.
2. The source adapter emits a provenance envelope containing the source type, source locator, capture time, source time, parser version, and content digest.
3. A research model emits a versioned probability estimate and model-status record.
4. The decision gate validates event matching, player matching, market matching, line matching, price matching, freshness, source completeness, calibration status, risk context, expected value, Kelly fraction, and stake constraints.
5. The system creates a complete immutable evaluation record.
6. The local ledger appends and durably flushes the evaluation record.
7. Only after the append succeeds may the API, dashboard, command-line tool, or assistant-facing workflow display the result.
8. A local outbox record schedules remote synchronization.
9. The synchronization worker sends the immutable record to Supabase using the stable local identifier as the idempotency key.
10. Supabase accepts an insert once, treats a duplicate as already synchronized, and rejects conflicting content.
11. Settlement and amendment records follow the same local-first sequence.
12. Analytics reconstruct current state from immutable events without rewriting the original evaluation.

### 6.2 Failure Boundary

The local append is part of the recommendation transaction. The remote synchronization is not.

If the local append fails, the recommendation must not be returned. If Supabase fails, the recommendation remains locally available, the outbox retains the pending item, and the dashboard reports degraded synchronization.

### 6.3 Canonical Status Vocabulary

| Concept | Canonical values |
| --- | --- |
| Evaluation verdict | `PASS`, `WAIT`, `BET` |
| Operational permission | `WAIT`, `PRICE_CHECK_ONLY`, `VERIFIED_BETS_ALLOWED` |
| Model status | `research_only`, `shadow`, `validated`, `retired` |
| Settlement outcome | `pending`, `win`, `loss`, `push`, `void` |
| Synchronization state | `pending`, `in_flight`, `synchronized`, `retryable_failure`, `terminal_failure` |
| Record type | `evaluation`, `settlement`, `amendment`, `sync_event`, `model_promotion` |

No transport, database, or interface may substitute `NO BET` for `PASS` or silently map `WAIT` to another value.

## 7. Immutable Record Contract

Every evaluation record must include the following fields. Optional fields must be explicitly `null`; they must not disappear in a way that makes absence ambiguous.

| Group | Required fields |
| --- | --- |
| Identity | `schemaVersion`, `id`, `recordType`, `createdAt`, `authority`, `contentDigest` |
| Origin | `origin.channel`, `origin.actorType`, `origin.sessionId`, `origin.requestId` |
| Event | `sport`, `league`, `eventId`, `startTime`, `homeTeam`, `awayTeam` |
| Market | `marketFamily`, `marketType`, `participantId`, `participantName`, `selection`, `side`, `line` |
| Price | `sportsbook`, `marketOdds`, `oppositeOdds`, `priceCapturedAt`, `priceSourceTime` |
| Source | `sources[]` with locator, provider, source type, parser version, capture time, source time, digest, freshness, and verification status |
| Model | `modelId`, `modelVersion`, `probabilityMethod`, `modelStatus`, `calibrationReportId`, `trainingCutoff`, `sampleSize` |
| Probability | `rawModelProbability`, `adjustedProbability`, `marketImpliedProbability`, `marketNoVigProbability` |
| Edge | `fairEdge`, `priceEdge`, `expectedValueRoi`, `kellyFraction` |
| Stake | `recommendedStake`, `bankroll`, `stakePolicyVersion` |
| Decision | `verdict`, `permission`, `reasons[]`, `riskFlags[]`, `gateResults[]` |
| Audit | `codeVersion`, `configurationDigest`, `calculationVersion`, `evidenceCompleteness`, `warnings[]` |

The content digest must cover the canonical serialized record excluding synchronization metadata. Supabase must reject an existing identifier with a different content digest.

## 8. Local Ledger and Outbox

### 8.1 Ledger Requirements

1. The ledger remains newline-delimited JSON under the existing configurable data path.
2. Appends must use one complete serialized record followed by one newline.
3. The append path must create the parent directory when needed.
4. The implementation must use a write strategy that detects open, write, and flush failures.
5. Concurrent append behavior must be serialized inside one process.
6. Startup validation must detect malformed lines, duplicate identifiers, digest conflicts, unsupported schema versions, and orphan references.
7. Invalid records must be reported and quarantined without changing the original file.
8. Log rotation, if added later, must preserve an ordered manifest and chain integrity.

### 8.2 Outbox Requirements

1. The outbox is local and append-oriented.
2. Every authoritative record creates or deterministically implies one outbox item.
3. Retry uses bounded exponential backoff with jitter.
4. A process restart resumes unsynchronized items.
5. Successful duplicate delivery is treated as synchronized only when the remote digest matches.
6. Authentication failure, schema rejection, and digest conflict are terminal until operator action.
7. Network failure, timeout, and service unavailability are retryable.
8. Dashboard and API status include pending count, oldest pending age, last success, last error class, and terminal failure count without exposing credentials.

## 9. Supabase Projection

### 9.1 Schema Alignment

The Supabase migration must:

1. Align decision verdict constraints with `BET`, `PASS`, and `WAIT`.
2. Align settlement outcomes with `pending`, `win`, `loss`, `push`, and `void`.
3. Add stable local identifiers and unique constraints where absent.
4. Add `schema_version`, `content_digest`, `authority`, `synchronized_at`, and source-origin fields required by the immutable contract.
5. Preserve existing rows through explicit compatibility transformations.
6. Reject destructive conversion when an existing value cannot be mapped without ambiguity.
7. Provide a reversible down migration when reversal does not destroy new data.
8. Record migration version and execution evidence.

### 9.2 Security

1. Row-level security remains enabled on every exposed table.
2. Authenticated users may insert and select only their own records.
3. Update and delete access remains unavailable for immutable records.
4. Service-role credentials remain server-side and are not required for the local client design.
5. The migration must be followed by Supabase security and performance advisor checks.
6. Security findings must be resolved or classified as blockers.

### 9.3 Remote Failure Semantics

Supabase availability must never change a `PASS`, `WAIT`, or `BET` result. Remote status may change only synchronization metadata and operator-visible health.

## 10. Model Registry, Backtesting, and Calibration

### 10.1 Registry

Every probability model must have:

1. A stable model identifier and immutable version.
2. A documented feature set and data-source list.
3. A training cutoff timestamp.
4. A market-family scope.
5. A versioned calculation implementation.
6. A status of `research_only`, `shadow`, `validated`, or `retired`.
7. A linked calibration report for any status beyond `research_only`.

### 10.2 Time Integrity

1. Training, calibration, and evaluation splits must be chronological.
2. No feature may use information published after the recorded prediction time.
3. Closing odds may be used for evaluation but not as an input to an earlier prediction.
4. Dataset construction must retain source and capture timestamps.
5. Duplicate games, players, and market observations must be detected before splitting.

### 10.3 Required Metrics

Each market-family report must include:

1. Prediction count and settled count.
2. Settlement coverage.
3. Brier score.
4. Logarithmic loss.
5. Expected calibration error.
6. Calibration slope and intercept.
7. Reliability table by probability bucket.
8. Performance by line range.
9. Performance by participant role and relevant context.
10. Closing-line value.
11. Return on investment after recorded price.
12. Confidence intervals or bootstrap intervals for unstable metrics.
13. Comparison with a no-vig market baseline where matching market data exists.

### 10.4 Initial Promotion Thresholds

A market-family model cannot become `validated` unless all of the following are true:

1. At least 500 settled out-of-sample predictions exist for the market family.
2. At least 100 observations exist in every probability bucket used to support promotion.
3. Settlement coverage is at least 95 percent.
4. Expected calibration error is no greater than 0.03.
5. Calibration slope is between 0.80 and 1.20.
6. Absolute calibration intercept is no greater than 0.05.
7. Brier score and logarithmic loss show no material out-of-sample degradation against the registered comparison baseline.
8. Mean closing-line value is not materially negative under the registered confidence rule.
9. No unresolved data-leakage, source-integrity, or schema-quality blocker exists.
10. The thresholds were registered before the promotion dataset was evaluated.

These thresholds are conservative initial policy, not universal scientific constants. Any change requires a new policy version and cannot be applied retroactively to rescue a failing model.

### 10.5 Three-Win History

The existing three-consecutive-win display may remain as descriptive history. It cannot change model status, bet-call permission, stake limits, or release readiness.

## 11. Decision Gate

The decision gate evaluates all checks in a deterministic order and retains every result, not only the first failure.

### 11.1 Mandatory Identity Checks

1. Exact or explicitly approved event match.
2. Exact participant identifier or documented deterministic name match.
3. Exact market-family and market-type match.
4. Exact side match.
5. Exact line match within the registered numeric tolerance.
6. Exact required sportsbook match.
7. Valid market and source timestamps.

### 11.2 Mandatory Evidence Checks

1. Price is within the configured freshness window.
2. Source evidence is complete and digest-verifiable.
3. Opposite price or documented market-reference method exists when no-vig probability is required.
4. Lineup, roster, injury, probable-starter, and game-status evidence satisfy the market policy.
5. Conflicting sources are resolved or produce `WAIT`.
6. Manual screenshot and optical-character-recognition evidence remains explicitly unverified until operator confirmation.

### 11.3 Mandatory Model Checks

1. Model status is `validated` for the exact market family.
2. Calibration report identifier resolves to a passing registered report.
3. Prediction time is later than the model training cutoff.
4. Input features are available as of prediction time.
5. Model output is finite and between zero and one.

### 11.4 Mandatory Economic Checks

1. `fairEdge` exceeds its strict threshold.
2. `priceEdge` is positive and separately retained.
3. Expected-value return exceeds its strict threshold.
4. Kelly fraction exceeds its strict threshold.
5. Recommended stake exceeds the sportsbook minimum and remains below all bankroll caps.
6. No exact threshold tie qualifies as a bet.

### 11.5 Verdict Rules

1. Missing, stale, conflicting, future-dated, or unverified required evidence produces `WAIT`.
2. A research-only, shadow, unknown, or retired model produces `WAIT` when a production probability is required.
3. Complete evidence with insufficient edge, expected value, Kelly fraction, or stake produces `PASS`.
4. `BET` is possible only when every mandatory gate passes and operational permission is `VERIFIED_BETS_ALLOWED`.
5. Any high-severity risk flag produces `WAIT` unless the flag's registered policy explicitly defines a safe deterministic resolution.

## 12. Statsig Use

Statsig may be used for controlled rollout and shadow-model observation only.

1. A Statsig gate may choose whether a user sees a new dashboard presentation.
2. A Statsig experiment may choose which validated model runs in shadow mode.
3. Statsig cannot convert `WAIT` or `PASS` into `BET`.
4. Statsig cannot override calibration, freshness, identity, source, bankroll, or risk gates.
5. Missing Statsig configuration or network failure selects the registered control behavior.
6. Exposure records must be included in the local audit record when an experiment affects a displayed result.

## 13. Settlement and Amendments

1. Settlement records reference an existing evaluation identifier.
2. Outcome, closing odds, stake, settled time, source, and notes are retained.
3. Orphan settlements are rejected from operator submission and reported during legacy-log audit.
4. Conflicting settlements are never overwritten.
5. A correction is an amendment referencing both the evaluation and the superseded settlement.
6. Analytics select the latest valid amendment chain while retaining complete history.
7. Settlement coverage is calculated separately for all evaluations and `BET` evaluations.
8. `void` and `push` remain distinct from `win` and `loss` in performance metrics.

## 14. API and Interface Contract

1. Evaluation endpoints may not expose `writeLog: false` in production operation.
2. A dedicated research-only function may return unpersisted internal calculations only to tests and offline backtest code, never to a user-facing endpoint.
3. The best-target endpoint must persist every displayed candidate classification or return an error.
4. API responses include authoritative record identifier, ledger timestamp, synchronization state, model status, evidence completeness, and gate results.
5. Dashboard headings distinguish `Research Candidates`, `Price-Check Targets`, `Waiting for Evidence`, `Passed Markets`, and `Qualified BET Calls`.
6. The phrase `Best Bets` is reserved for qualified, persisted `BET` records and remains hidden while none exist.
7. Every card displays source time, price time, sportsbook, line, model version, model status, primary blocking reason, and synchronization status.
8. The dashboard must remain usable on desktop and phone-sized screens.
9. Secret values must never appear in API responses, rendered markup, logs, error messages, or audit artifacts.

## 15. Local and Private-LAN Operation

### 15.1 Local Mode

1. The default bind address remains `127.0.0.1`.
2. Startup verifies required directories, writable ledger paths, and schema compatibility.
3. A healthy local start must not require Supabase, Statsig, or a live data provider.
4. Missing providers keep the system in `WAIT` or `PRICE_CHECK_ONLY` rather than making the dashboard unusable.

### 15.2 LAN Mode

1. LAN binding remains explicit and opt-in.
2. The launcher reports the exact private-network URL.
3. Provider keys and remote credentials remain server-side.
4. The interface clearly states that private-network HTTP is not equivalent to secure public deployment.
5. Any new write-capable LAN endpoint must require an operator authorization mechanism or remain disabled until one is configured.
6. LAN verification must use a second device or an independently addressed network request when the environment permits it.

## 16. Failure-Injection Matrix

The automated and runtime audit must exercise at least the following failures:

| Failure | Required result |
| --- | --- |
| Ledger directory unavailable | No recommendation returned; explicit server error; no false success. |
| Partial or malformed ledger line | Startup or audit reports the exact line; original file remains unchanged. |
| Duplicate local identifier with same digest | Treated as idempotent only in the registered replay path. |
| Duplicate local identifier with different digest | Terminal integrity failure. |
| Supabase unavailable | Local recommendation remains available; outbox stays pending; degraded status visible. |
| Supabase authentication rejected | Terminal synchronization failure requiring operator action. |
| Statsig unavailable | Registered control behavior; no safety-gate change. |
| Odds provider unavailable | `PRICE_CHECK_ONLY` or `WAIT`; no `BET`. |
| Odds timestamp missing | `WAIT`; timestamp risk retained. |
| Odds stale or future-dated | `WAIT`; no stake. |
| Sportsbook mismatch | `PRICE_CHECK_ONLY` or `WAIT`; no `BET`. |
| Participant or line mismatch | Candidate remains unmatched; no evaluation as a priced bet. |
| Injury or lineup evidence stale | `WAIT`. |
| Model uncalibrated | `WAIT`; `MODEL_CALIBRATION_REQUIRED`. |
| Numeric input not finite | Validation error before calculation. |
| Exact threshold tie | `PASS`, not `BET`. |
| Settlement references missing evaluation | Rejected or classified as legacy orphan; excluded from performance. |
| Conflicting settlement | Amendment required; original retained. |

## 17. Independent Mathematical Verification

Every implemented formula must have:

1. A written equation in documentation.
2. A primary production implementation.
3. An independent recomputation path that does not call the production helper.
4. Boundary tests.
5. Randomized invariant tests over registered valid ranges.
6. Golden examples with exact expected results and stated rounding policy.

The audit covers at least:

1. American-to-decimal conversion.
2. American implied probability.
3. No-vig normalization.
4. Probability shrinkage.
5. Market adjustment.
6. `fairEdge`.
7. `priceEdge`.
8. Expected-value return.
9. Kelly fraction.
10. Stake caps and minimums.
11. Closing-line value.
12. Actual settlement profit.
13. Brier score.
14. Logarithmic loss.
15. Expected calibration error.
16. Calibration slope and intercept.
17. Confidence-interval calculation.

Independent verification may use Wolfram or another trusted calculation engine for golden examples, but automated local tests must remain reproducible without that remote service.

## 18. Complete Audit Protocol

### 18.1 Requirement Inventory

1. Assign a stable requirement identifier to every normative statement in this specification.
2. Map every requirement to implementation files and exact symbols.
3. Map every requirement to one or more automated tests or an explicit manual-runtime check.
4. Map every requirement to retained evidence.
5. Classify every requirement as passed, failed, blocked, or not applicable with rationale.
6. Reject completion if any requirement is absent from the matrix.

### 18.2 Source Inventory

1. Inventory all tracked and untracked project source, test, script, schema, migration, configuration, documentation, and dashboard files.
2. Record path, size, line count, and content digest.
3. Classify generated files, runtime data, secrets, caches, and third-party artifacts separately.
4. For every first-party source line, record whether it is executed by a test, exercised by a runtime check, or manually reviewed with a reason automated execution is impractical.
5. Report unreachable, duplicate, dead, or unsupported code.
6. Reject completion if a first-party file or line remains unclassified.

This is an audit-coverage requirement. It is not a claim that executing every line proves the absence of every possible defect.

### 18.3 Data Inventory

1. Inventory every accessible local JSON, JSONL, comma-separated-value, snapshot, fixture, and generated report file used by the system.
2. Record path, digest, row count, schema version, minimum timestamp, maximum timestamp, duplicate count, malformed count, and orphan-reference count.
3. Validate every accessible row against its registered schema.
4. Recompute derived fields where the source fields are available.
5. Classify stale, future-dated, incomplete, contradictory, and manually confirmed evidence.
6. Never expose secret files or secret values in the audit output.
7. Reject completion when malformed or contradictory rows remain unexplained.

### 18.4 Database Inventory

1. Capture the Supabase project identity and schema timestamp without exposing credentials.
2. Inventory relevant tables, columns, constraints, indexes, triggers, policies, functions, and row counts.
3. Export pre-migration and post-migration schema evidence.
4. Validate all existing relevant rows before and after migration.
5. Verify row-level security with positive and negative access tests.
6. Run security and performance advisors.
7. Retain migration command results and rollback evidence.

### 18.5 Integration Inventory

For each provider and plugin, record:

1. Purpose.
2. Authentication state.
3. Request contract.
4. Response contract.
5. Timeout and retry policy.
6. Freshness policy.
7. Failure behavior.
8. Secret-handling boundary.
9. Live verification result.
10. External blocker when verification cannot be completed.

### 18.6 Runtime Inventory

The audit must exercise:

1. Command-line straight evaluation.
2. Command-line live evaluation.
3. Local dashboard launch.
4. Health endpoint.
5. Schema endpoint.
6. Candidate endpoint.
7. Best-target endpoint.
8. Decision-log endpoint.
9. Settlement endpoint.
10. Release-readiness endpoint.
11. Data-edge endpoint.
12. Screenshot and optical-character-recognition intake paths available in the environment.
13. ESPN snapshot intake.
14. DraftKings snapshot intake.
15. Auto-update status and snapshot path.
16. LAN launch and independently addressed access where possible.
17. Restart recovery of ledger, outbox, and dashboard state.

## 19. Traceability Matrix Structure

The final matrix must include the following columns:

| Column | Required content |
| --- | --- |
| Requirement | Stable identifier and exact requirement text. |
| Design section | Section number in this specification. |
| Implementation | File path and exact symbol or schema object. |
| Test evidence | Test file, test name, and command. |
| Runtime evidence | Endpoint, command, or external-system check. |
| Data evidence | Dataset, row range or manifest entry, and digest. |
| Result | `passed`, `failed`, `blocked`, or `not_applicable`. |
| Evidence class | One of the evidence classes in Section 4. |
| Notes | Assumption, limitation, or corrective action. |

The final report must provide the complete matrix as a retained artifact. A concise summary may link to it, but the artifact itself may not be truncated.

## 20. Test Strategy

### 20.1 Unit Tests

Unit tests cover validation, canonicalization, formulas, gates, record creation, content digests, settlement logic, calibration metrics, and synchronization-state transitions.

### 20.2 Property and Invariant Tests

Property tests verify probability bounds, no-vig sums, monotonic price relationships, non-negative stake caps, strict threshold behavior, idempotency, and deterministic canonical serialization.

### 20.3 Integration Tests

Integration tests cover API persistence-before-response, process restart, outbox replay, Supabase duplicate handling, Statsig fallback, schema compatibility, source-adapter provenance, and dashboard contracts.

### 20.4 Migration Tests

Migration tests use representative legacy rows for every observed enum and nullable field. They verify forward migration, invalid-row rejection, row preservation, constraints, indexes, triggers, and row-level-security behavior.

### 20.5 End-to-End Tests

End-to-end verification runs a recommendation from source capture through decision, local persistence, remote synchronization or queued degradation, settlement, analytics, restart, and dashboard display.

### 20.6 Regression Tests

The existing verification suite must continue passing. Any intentional behavior change requires an explicit updated contract test and migration note.

## 21. Security and Privacy

1. Secret material remains in environment or approved local secret storage.
2. Errors use secret-redacting messages.
3. Audit manifests exclude secret contents and use only safe metadata when a secret file must be acknowledged.
4. Local logs do not store authentication tokens.
5. LAN mode is private-network only and is not presented as internet-safe deployment.
6. Cross-origin, request-size, body-parsing, and write-endpoint protections must be reviewed as part of the line audit.
7. Dependencies, including development dependencies, receive a vulnerability audit where the environment supports it.
8. Generated portable packages exclude logs, caches, credentials, local environment files, and remote synchronization state that identifies a user.

## 22. Rollout

### Phase 1: Contract and Ledger

Add canonical record contracts, persistence-before-response, immutable settlements and amendments, integrity checks, and compatibility readers.

### Phase 2: Outbox and Supabase

Add local outbox behavior, Supabase migration, row-level-security verification, synchronization health, retries, and conflict handling.

### Phase 3: Calibration System

Add dataset manifests, time-ordered backtesting, calibration metrics, model registry, promotion policy, and research-only enforcement.

### Phase 4: Interface and Operations

Update API and dashboard terminology, provenance display, synchronization health, calibration status, local launch, LAN authorization boundary, and operator documentation.

### Phase 5: Full Audit

Generate the source manifest, data manifest, schema inventory, integration inventory, mathematical verification, failure-injection results, traceability matrix, release report, and real-world workflow evidence.

No phase may silently weaken fail-closed behavior to make a later phase pass.

## 23. Completion Gate

The update is complete only when all of the following are true:

1. Every requirement in this specification appears in the traceability matrix.
2. Every first-party source file and line is classified by test execution, runtime execution, or manual review.
3. Every accessible relevant local data row is schema-validated or explicitly quarantined and explained.
4. Every implemented formula has independent golden verification and automated local tests.
5. Every supported write path persists before display.
6. Every required failure mode has fail-closed evidence.
7. Supabase migrations and row-level security pass verification, or Supabase is explicitly classified as a blocked external integration without weakening local operation.
8. Statsig failure demonstrably preserves control behavior and cannot override safety gates.
9. The complete existing and new test suite passes.
10. Type checking passes.
11. Release audit and Bear Edge doctor complete with retained reports.
12. Local launch, restart recovery, and supported runtime endpoints pass.
13. LAN behavior is verified where the environment permits independent access; otherwise it is marked `BLOCKED_EXTERNAL`.
14. No secret appears in tracked files, logs, responses, packages, or audit artifacts.
15. No unresolved critical or high-severity defect remains.
16. Every remaining external dependency, insufficient dataset, missing credential, or unverifiable claim is listed as a blocker or residual risk.
17. The final report does not claim validated predictive accuracy unless the registered promotion thresholds have actually passed on sufficient out-of-sample data.

## 24. Known Residual Limits

Even after every accessible artifact passes, the following cannot be guaranteed solely by repository inspection:

1. Future sportsbook prices, rules, limits, or settlement behavior.
2. Future provider uptime, correctness, latency, quota, or contract stability.
3. Future athlete availability, lineup changes, injuries, weather, or game conditions.
4. The absence of every possible software defect.
5. Profitability in future betting markets.
6. Statistical validity before sufficient settled out-of-sample observations exist.
7. Public-internet security, because this design supports local and private-LAN operation rather than a hardened public deployment.

These limits must remain visible. They are not reasons to weaken the audit; they define the boundary between verified engineering and unknowable future outcomes.

## 25. Implementation Authorization Boundary

This document authorizes implementation only after the user reviews the written specification. Implementation must then follow a separate task-by-task plan, use tests before production changes, preserve unrelated worktree changes, and stop rather than fabricate evidence when an external verification cannot be completed.
