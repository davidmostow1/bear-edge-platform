# Bear Edge Full Adversarial Code and Product Audit

Date: 2026-07-18

Repository: `/Users/davidbearmostow/Documents/Codex/2026-06-17-documents-openai-developers-google-drive-google`

Branch: `codex/bear-edge-release-candidate`

Audited commit: `2ca03a24fc1af20a3c03086757cd1dfb85c43d1e`

Operating decision: `PRICE_CHECK_ONLY`

Production betting authorization: **BLOCKED**

## Executive Verdict

Bear Edge is a strong local research, evidence, and risk-control application. It is not a validated betting algorithm and it does not currently possess verified live sportsbook pricing, a promotable model, or a statistically defensible record of predictive advantage.

The most important verified property is that the product now fails closed. Research-only probabilities, public publisher prices, screenshots, stale evidence, incomplete market pairs, unvalidated models, forged calibration claims, and malformed audit records cannot authorize a canonical `BET` record.

The strongest engineering result is local correctness: the complete verification gate passed 473 tests with zero failures, including TypeScript checking. The strongest product warning is the data-edge result: release readiness is blocked at 64/100, the Data Edge lane is 9/100, all four registered models are `research_only`, and calibration readiness has zero eligible and zero settled predictions.

No software can honestly be declared perfect. This audit separates defects that were fixed from blockers that require data, time, provider contracts, statistical evidence, security infrastructure, legal review, or commercial operations.

## Scope

The audit covered:

- Repository architecture and source-of-truth consistency.
- Prediction construction and probability integrity.
- Market-price identity, odds matching, and sportsbook evidence.
- Data provenance, freshness, and provider limitations.
- Canonical evaluation, settlement, amendment, and audit-record logic.
- Closing-line value, calibration, return on investment, drawdown, Brier score, and logarithmic-loss reporting.
- Model registry and promotion-policy enforcement.
- Local authentication, secrets, API boundaries, browser hardening, and request limits.
- Supabase migrations, row-level security, append-only database controls, and synchronization design.
- Test coverage, continuous integration, packaging, dependency security, failure handling, and deployment readiness.
- Consumer subscription and enterprise application programming interface requirements.
- Responsible-gambling, legal, privacy, licensing, and acquisition-readiness risks.
- The running dashboard in the Codex sidebar at 1440 by 1000 and 340 by 800 viewport sizes.

The audit did not claim to verify:

- Deployment or post-deployment behavior of migration `20260718010000_shadow_evidence_v21.sql`; the connected Supabase baseline was inspected read-only, but the new evidence tables are not deployed.
- A licensed sportsbook or injury provider contract.
- A production deployment, public domain, transport-layer security certificate, payment processor, or identity provider.
- Profitability, because no qualifying out-of-sample calibration population exists.
- Browser console output, because the available in-app browser surface did not expose console capture.

## Severity Definitions

- **Critical**: can invalidate the claimed betting proof or allow unsafe wager authorization.
- **High**: blocks production, commercial deployment, or defensible model promotion.
- **Medium**: materially reduces resilience, statistical confidence, operational clarity, or maintainability.
- **Low**: useful hardening or quality improvement that does not independently block the current local research use case.

## Critical Findings

### C-1: Shadow outcome channel is implemented locally but not deployed or populated

Status: **IMPLEMENTED LOCALLY; REMOTE DEPLOYMENT AND EVIDENCE COLLECTION PENDING**

Impact: The code path that previously blocked shadow grading now exists end to end. Bear Edge still cannot claim calibration progress until the remote migration is deployed where synchronization is required and genuine outcomes and closing prices are collected.

Evidence:

- `src/audit/record-contract.js` defines canonical schema-version-2.1 `prediction_outcome` and `closing_price` records while preserving schema-version-2.0 reads.
- `src/audit/evidence-ledger.js` appends official outcomes and exact-book closes with chronology, source, identity, and linear-correction checks.
- `src/calibration/ledger-projection.js` joins each eligible evaluation to its latest valid outcome and closing-price evidence while retaining wager-settlement compatibility.
- `src/server.js` exposes authenticated `POST /api/prediction-outcomes` and `POST /api/closing-prices` routes.
- `src/sync/supabase-mapper.js` and `src/sync/sync-worker.js` project complete evidence snapshots after resolving evaluation and correction dependencies.
- `supabase/migrations/20260718010000_shadow_evidence_v21.sql` defines non-financial append-only projections with forced RLS, explicit grants, owner policies, parent ownership, and one serialized correction chain.
- `data/reports/calibration_readiness.json` still reports zero outcome records, zero closing-price records, zero eligible predictions, and zero settled predictions.

Why this matters:

The wager-settlement rule remains correct: a `WAIT` or `PASS` record cannot be misrepresented as a wager. The new channel grades a prediction without stake or profit and does not alter its original verdict or permission. This closes the local architecture gap, not the statistical evidence gap.

Remaining correction:

1. Review and deploy migration `20260718010000_shadow_evidence_v21.sql` through a controlled Supabase migration workflow.
2. Re-run security and performance advisors, then test anonymous, authenticated-owner, authenticated-nonowner, and service-role behavior against both new tables.
3. Configure and reconcile remote projection if centralized retention is required.
4. Collect genuine official outcomes and licensed exact-book closing prices for eligible pre-event evaluations.
5. Reach the registered sample, coverage, calibration, baseline, closing-line-value, and uncertainty thresholds before any model promotion.

### C-2: No demonstrated betting edge exists

Status: **OPEN EXTERNAL AND STATISTICAL BLOCKER**

Impact: Any real-money recommendation would be unsupported by current evidence.

Evidence:

- `models/registry.json:33-156` registers four `poisson_count_v1` entries, all `research_only`, with no training cutoff, implementation digest, calibration report identifier, or calibration report digest.
- `data/reports/release_readiness.md:62-74` reports zero validated entries out of four.
- `data/reports/calibration_readiness.json:10-35` reports zero eligible and zero settled predictions.
- `data/reports/bear_edge_protocol_audit.md:5-24` reports 19 historical rows, only 7 with calculable net profit, and known net profit of negative $30.67.
- `data/reports/bear_edge_protocol_audit.md:39-53` identifies oversized staking, weak soccer totals, bad ladders, duplicate exposure, unnecessary parlays, stale live markets, and negative known return on investment.

Required correction:

1. Restore exact-book, two-sided, timestamped, licensed price capture.
2. Collect outcomes and closing prices in shadow mode.
3. Reach at least the registered 500 settled predictions, 95 percent settlement coverage, and 100 observations in every required reliability bucket.
4. Use a frozen policy registered before evaluation begins.
5. Pass calibration, baseline comparison, closing-line-value, data-quality, and uncertainty gates.
6. Promote only an exact model, version, and market-family tuple with a content-addressed passing report.

## High Findings

### H-1: Local records are digest-checked, not cryptographically immutable

Status: **OPEN**

Impact: A local administrator or process with file-system access can rewrite a historical record and recompute its standalone digest. The current file proves internal consistency, not independent immutability.

Evidence:

- `src/audit/record-contract.js:86-99` computes one SHA-256 content digest for each record.
- `src/audit/record-contract.js:327-338` verifies that standalone digest.
- `src/audit/authoritative-ledger.js:102-180` detects malformed lines, invalid records, duplicate identifiers, and digest conflicts.
- `src/audit/authoritative-ledger.js:267-289` appends and flushes records but does not link each record to the previous digest.

Required correction:

1. Add `previousRecordDigest`, sequence number, ledger identifier, and chain digest to every canonical record.
2. Sign periodic ledger roots with a protected signing key outside the application data directory.
3. Anchor roots to independently retained storage or a write-once object store.
4. Store model-registry, policy, implementation, dataset, and calibration-report digests in each authorized `BET` record.
5. Verify the entire chain and all authority bindings during every release audit and before performance reporting.
6. Describe the current format as append-only and digest-verified, not immutable, until those controls exist.

### H-2: Statistical resampling assumes independent rows

Status: **PARTIALLY RESOLVED LOCALLY**

Impact: Multiple props from the same game, player, slate, or capture can be correlated. Row-level bootstrap intervals can therefore be too narrow and make calibration or closing-line-value evidence look stronger than it is.

Evidence:

- `src/calibration/metrics.js:471-535` implements complete-cluster mean resampling.
- `src/calibration/report.js:364-503` groups observations by `eventId` and resamples complete event clusters for mean and calibration-fit intervals.
- `models/registry.json:7-32` requires at least 100 distinct settled events and the registered event-cluster uncertainty method.
- The promotion policy still has no distinct-slate, season, sportsbook, or data-regime minimums.

Required correction:

1. Define an immutable event or slate cluster identifier.
2. Bootstrap whole event clusters, not individual markets.
3. Report distinct events, slates, participants, seasons, and sportsbooks in addition to row count.
4. Require minimum distinct-event and distinct-slate counts in the promotion policy.
5. Add sensitivity analyses by market family, line range, participant role, sportsbook, season, and data regime.

Remediation update, 2026-07-22:

- `src/calibration/report.js` now resamples complete `eventId` clusters for Brier score, logarithmic loss, calibration fit, no-vig baseline degradation, closing-line value, and return on investment.
- Promotion reports now retain `clusterUnit: "event_id"` and `distinctEventCount`, and they reject evaluation uncertainty built from fewer than two distinct events.
- Registered policy `1.2.0` requires `event_cluster_percentile_bootstrap` and at least 100 distinct settled events before promotion.
- Distinct-slate, season, sportsbook, and data-regime sensitivity requirements remain open.

### H-3: Chronological splitting can leak the same event across partitions

Status: **PARTIALLY RESOLVED LOCALLY**

Impact: Predictions from one event captured at different times can enter training, calibration, and evaluation partitions, creating optimistic evidence.

Evidence:

- `src/calibration/dataset.js` groups rows by `eventId`, converts each event into its complete prediction-time interval, merges transitively overlapping intervals, and permits split boundaries only between the resulting chronological blocks.
- `test/calibration-dataset.test.js` includes a regression case where one event has predictions on different days and verifies both event atomicity and strict chronological order.

Required correction:

1. Group every row by source event identifier before partitioning.
2. Assign an entire event to exactly one partition.
3. Use season-aware or week-aware walk-forward validation.
4. Freeze preprocessing, feature engineering, and hyperparameters before the evaluation window.
5. Add explicit leakage tests for different capture times from the same event.

Remediation update, 2026-07-22:

- `src/calibration/dataset.js` now groups every row by `eventId`, calculates each event's complete prediction-time interval, and merges overlapping event intervals into indivisible chronological blocks.
- Split boundaries are selected only between those blocks. Every event remains in exactly one partition and the maximum prediction time in each earlier partition remains strictly before the next partition.
- Calibration reports retain `splitMethod`, `chronologicalBlockCount`, and distinct-event counts for training, calibration, and evaluation.
- Registered policy `1.2.0` requires `event_atomic_prediction_interval_blocks`; the registry reconstructs report evidence and rejects missing, body-only relabeled, or legacy timestamp-only split metadata even when the altered report has a valid canonical digest. This does not close H-1 when an administrator can replace the report, all digests, and registry pointers together.
- `test/calibration-dataset.test.js` reproduces different capture times from one event crossing the former boundary and verifies event atomicity plus strict time order.
- Season-aware or week-aware walk-forward validation and independent freezing of preprocessing, feature engineering, and hyperparameters remain open.

### H-4: The probability model is a simple research baseline

Status: **OPEN BY DESIGN**

Impact: Model output should not be interpreted as professional predictive probability.

Evidence:

- `src/live/estimate-prop.js:272-309` blends season and recent per-game rates, applies a Poisson count calculation, and optionally shrinks toward the market.
- `src/live/estimate-prop.js:338-357` explicitly flags unvalidated and under-specified probability output.
- `models/registry.json:38-45`, `68-75`, `99-106`, and `130-137` show that the feature sets are line, side, recent rate, recent sample limit, recent weight, and season rate.

Missing predictive inputs include opponent quality, handedness or matchup, expected role and workload, pitch count, bullpen state, batting order, confirmed lineup, injuries, park, weather, umpire, travel, rest, platoon effects, distributional overdispersion, and market-specific selection effects.

Required correction:

1. Build a versioned historical feature store with point-in-time correctness.
2. Establish a no-vig market baseline and simple empirical baselines.
3. Evaluate Poisson, negative-binomial, hierarchical, and properly regularized alternatives.
4. Calibrate only on a dedicated calibration window.
5. Preserve a final untouched evaluation window.
6. Reject complexity unless it improves out-of-sample Brier score, logarithmic loss, calibration, and closing-line value without unacceptable instability.

### H-5: Live sportsbook pricing is unavailable

Status: **OPEN EXTERNAL BLOCKER**

Impact: The application cannot compute offered-price expected value or authorize a bet without current exact-book prices.

Evidence:

- `data/reports/release_readiness.md:45-60` reports zero fresh priced candidates and zero exact-bookmaker matches.
- The running dashboard reported zero remaining odds credits, zero priced candidates, and no verified odds.
- DraftKings direct checks returned HTTP 403 or non-JSON content.

Required correction:

1. Obtain an active licensed odds plan that covers the required sportsbook, market families, and historical closing prices.
2. Verify the API key, remaining credit budget, region, bookmaker identity, event identity, market identity, side, line, and source timestamp.
3. Capture both sides of the market and reject one-sided or stale offers.
4. Preserve the offered price seen by the user and the independent closing price.
5. Define quota reserve, retry, circuit-breaker, and stale-cache policy for every paid request path.

### H-6: Licensed injury and lineup evidence is missing

Status: **OPEN EXTERNAL BLOCKER**

Impact: Automated injury and lineup gates cannot be relied on commercially.

Evidence:

- `data/reports/release_readiness.md:38-43` marks the licensed injury/stat feed as not configured.
- The live dashboard describes ESPN and StatMuse as public research surfaces, not licensed injury, roster, or odds authorities.

Required correction:

1. Contract with a licensed sports data provider that includes lineups, injuries, probable starters, status corrections, timestamps, and commercial display rights.
2. Define source precedence and conflict resolution.
3. Persist every source observation with capture time and provider identity.
4. Block affected markets when evidence is stale, missing, or contradictory.

### H-7: Public deployment lacks production identity and abuse controls

Status: **OPEN**

Impact: The current bearer-token local server is appropriate for one operator, not for consumers or enterprise tenants.

Current strengths:

- `src/server.js:188-200` protects every API route except the safe operator-auth status endpoint and requires authorization for every state-changing request.
- `src/server.js:234-257` requires an explicit authorization policy and returns HTTP 401 when authorization is missing.
- `src/server.js:78-99` applies content-security, frame, referrer, permissions, cross-origin, and content-type headers.
- `src/server.js:149-179` enforces a bounded request body.

Missing production controls:

- Transport-layer security termination and secure-cookie policy.
- Durable user sessions, passwordless or federated login, multifactor authentication, recovery, revocation, and device management.
- Tenant identifiers, role-based access control, ownership checks at every service boundary, and administrative separation.
- Rate limiting, request/header timeouts, slow-client protection, distributed denial-of-service protection, and abuse detection.
- Central security logging, alerting, incident response, backup restore testing, and disaster recovery objectives.
- Secret-manager integration, key rotation, environment separation, and production access review.
- Security review of all transitive browser and server dependencies.

### H-8: Responsible-gambling and legal systems are not production complete

Status: **OPEN**

Impact: Consumer launch could create regulatory, contractual, and user-harm exposure even if the model were valid.

Existing safeguards include conservative Kelly sizing, bankroll caps, drawdown gates, correlation checks, stale-data checks, and no automatic wager placement.

Missing controls include:

- Age and jurisdiction eligibility.
- Geolocation policy where required.
- Self-exclusion, cool-off, deposit, loss, stake, and time limits.
- Reality checks, risk disclosures, crisis and support links, and account closure.
- Behavioral-risk detection and human escalation.
- Terms acceptance, privacy consent, records retention, data-subject requests, and deletion policy.
- Affiliate and advertising disclosures.
- Legal analysis of whether recommendations, subscriptions, data display, and enterprise features require licenses in each jurisdiction.
- Written commercial rights for every odds, statistics, injury, lineup, logo, and editorial source.

## Medium Findings

### M-1: Continuous integration covers only Ubuntu and Node.js 20

Status: **OPEN**

Evidence: `.github/workflows/ci.yml:14-32` runs one Ubuntu job on Node.js 20.

Required correction:

- Add supported Node.js versions, including the bundled Node.js 24 runtime used locally.
- Add macOS coverage for launcher and file-system behavior.
- Add dashboard browser tests at desktop and mobile breakpoints.
- Add optical-character-recognition integration tests with pinned fixtures.
- Add dependency, secret, static-analysis, and migration-lint jobs.
- Pin GitHub Actions by immutable commit digest rather than only major version tag.

### M-2: Existing legacy records block authoritative quality

Status: **OPEN DATA MIGRATION**

Evidence:

- `data/reports/calibration_readiness.json:21-35` reports 37 records, 20 canonical records, and 17 legacy records.
- `src/analytics.js:939-957` excludes legacy records and blocks data quality.
- `data/reports/release_readiness.md:95-103` records the release failure.

Required correction:

1. Export the original file and compute a preservation digest.
2. Classify every legacy row as migratable, historical-only, malformed, duplicate, or unverifiable.
3. Create new canonical records only when all required evidence can be reconstructed without invention.
4. Archive unverifiable rows outside authoritative analytics while retaining provenance.
5. Never rewrite or delete the original evidence in place.

### M-3: The remote audit baseline is healthy, but local sync and the shadow-evidence migration are not deployed

Status: **OPEN DEPLOYMENT AND CONFIGURATION**

Read-only verification on July 18, 2026 confirmed one active healthy Supabase project in `us-east-1` on PostgreSQL 17.6.1. Its five public tables have RLS enabled and forced, contain zero rows, and expose owner-scoped authenticated policies. The security advisor returned no findings. The performance advisor returned one informational unused-index finding for `settlement_records_user_settled_idx`.

The deployed migration ledger ends at `20260717080017`. It does not include `20260718010000`, and remote `prediction_outcomes` and `closing_prices` tables do not yet exist. Local release readiness also reports the projection as unconfigured with pending local records. Before production, deploy through a controlled migration workflow, re-run advisors, test anonymous/authenticated-owner/authenticated-nonowner/service-role access, verify backup and restore, and reconcile remote rows to the local authoritative ledger.

### M-4: Local launcher authentication has an operator-recovery limitation

Status: **OPEN USABILITY ISSUE**

If an authenticated server is already running and its generated one-time token is no longer available, a second launcher cannot recover that raw token. This is safer than disclosing it, but operationally requires using the already authenticated tab, setting a protected fixed operator token, or restarting the server.

### M-5: Server resilience is local-grade, not internet-grade

Status: **OPEN**

Network fetches now use bounded abort signals, but the HTTP listener still needs explicit request timeout, headers timeout, keep-alive policy, connection limits, rate limits, and reverse-proxy deployment guidance before exposure to an untrusted network.

### M-6: Browser content security still permits inline styles

Status: **OPEN HARDENING**

`src/server.js:78-99` uses `style-src 'self' 'unsafe-inline'`. This is materially safer than allowing inline scripts, but a public application should migrate to hashed or nonce-based styles where practical.

## Defects Fixed During This Audit

### F-1: Candidate odds text could match the wrong player, side, or line

Resolution: `src/live/candidate-odds-import.js:20-199` now requires player identity, stat identity, exact numeric line or explicit alternate threshold, matching side, and American price inside a bounded text window.

Regression coverage: `test/candidate-odds-import.test.js` covers opposite-side rejection, exact-line identity, surname collision rejection, and valid alternate-threshold matching.

### F-2: Protected read APIs and some state-changing GET routes were insufficiently guarded

Resolution: `src/server.js:188-200` now protects every API path except `/api/operator-auth`, and all non-GET operations require authorization. Both shipped launch paths require bearer authentication.

Regression coverage: `test/api.test.js` verifies sensitive reads, writes, paid requests, state-changing GET routes, and missing bearer tokens.

### F-3: Server construction could silently omit an authorization policy

Resolution: `src/server.js:234-238` rejects construction unless an explicit authorization implementation is supplied. Test-only open behavior must now be explicitly injected.

### F-4: The default request-body limit conflicted with supported screenshots

Resolution: `src/server.js:75-77` sets a 20 MiB default, accounting for Base64 expansion of a 12 MiB image. `src/server.js:149-179` rejects oversized declared and streamed bodies with HTTP 413.

### F-5: Evaluation callers could attempt to select the authoritative log path

Resolution: `src/server.js:939-970` and `:992-1007` reject a client-supplied `logPath` and use the server-controlled path.

### F-6: External source requests could wait indefinitely

Resolution: `src/live/fetch-json.js:7-22` and `src/live/fetch-text.js:5-23` apply bounded abort signals. Source modules use the shared text fetcher.

### F-7: Integer count lines could be priced without push-aware modeling

Resolution: `src/validate-live-ticket.js:231-243` rejects integer count lines until push probability and settlement behavior are modeled explicitly.

### F-8: Public publisher prices could appear too similar to bet recommendations

Resolution: `src/live/online-opportunities.js:276-350` labels source tiers as signal, lean, or pass, marks prices `unverified_public_price`, and forces `PRICE_CHECK_ONLY`. The dashboard labels the section as unverified research context.

### F-9: Canonical BET records were not strict enough

Resolution: `src/audit/record-contract.js:425-557` now requires complete event, market, price, model, source, gate, stake, and audit evidence; a validated model; a future event; exact two-sided price evidence; positive expected value, Kelly fraction, bankroll, and stake; and no high or critical risk flag.

### F-10: Caller-forged model authority could reach persistence

Resolution: `src/audit/authoritative-ledger.js:239-259` resolves the exact model, version, market family, and calibration report against the registry before appending a `BET` record.

### F-11: Settlement completeness was too weak

Resolution: `src/audit/record-contract.js:623-657` requires every final settlement to contain positive stake and explicit finite profit. `src/analytics.js:1044-1065` restricts wager settlement to an existing `BET` and requires corrections to use amendments.

### F-12: Legacy append helpers could contaminate the canonical ledger

Resolution: `src/decision-log.js` routes writes through canonical validation and rejects arbitrary legacy payloads.

### F-13: New writes could continue after detected ledger integrity defects

Resolution: `src/audit/authoritative-ledger.js:184-200` blocks writes after malformed lines, duplicate identifiers, digest conflicts, or invalid canonical records.

### F-14: Legacy rows contaminated authoritative analytics

Resolution: `src/analytics.js:939-967` excludes pre-schema rows, reports their count, and blocks data quality until migration or archival.

### F-15: Dashboard token bootstrap failed when added to an already loaded tab

Resolution: `src/dashboard/app.js:5-30` consumes operator tokens on initial load and hash changes, clears the token from the visible address, and reloads after a same-tab bootstrap.

### F-16: Documentation described obsolete open-localhost behavior

Resolution: `README.md:130-140`, `docs/ELITE_AUDIT_OPERATIONS.md:60-75`, `.env.example`, and the phone launcher now describe mandatory bearer authentication and detached launch behavior.

### F-17: Dynamic external links accepted unsafe URL schemes

Resolution: `src/dashboard/app.js:436-455` permits only absolute HTTP and HTTPS URLs. Dynamic links use that validator plus `noopener noreferrer`; provider-controlled sport and score values are escaped.

Regression coverage: `test/tooling.test.js` fails if direct provider URL interpolation returns.

### F-18: Browser responses lacked a complete hardening baseline

Resolution: `src/server.js:78-137` adds content-security policy, cross-origin opener and resource policy, permissions policy, no-referrer policy, content-type sniffing protection, frame denial, and appropriate cache controls.

## Verified Strengths

- Complete local verification passed 473 tests with zero failures, including TypeScript checking.
- The production dependency audit reported zero known vulnerabilities across 21 production dependencies.
- Package dry-run succeeded with 127 files, 349,182 compressed bytes, and 1,546,411 unpacked bytes.
- The package includes `.env.example` but not `.env.local` or a runtime secret file.
- The tracked-secret and release checks found no tracked local key, log, or cache paths.
- The app binds to loopback by default and both shipped launchers require a 32-byte random bearer token unless a protected fixed token is supplied.
- The server stores only a SHA-256 token digest and uses timing-safe comparison.
- Canonical records are schema-validated, content-digested, identifier-checked, append-only through the supported API, and synchronized through an outbox.
- Amendments preserve correction history rather than replacing settlements.
- Shadow outcomes and closing prices preserve separate non-financial correction histories and cannot contain stake or profit.
- Expected value, market vig, no-vig fair probability, fair edge, offered-price edge, Kelly sizing, drawdown, portfolio exposure, correlation, stale evidence, and price expiration are distinct concepts in code.
- The model registry binds status to an exact model, version, and market family.
- The promotion policy requires 500 settled predictions, 95 percent settlement coverage, calibration quality, baseline comparison, 2,000 bootstrap resamples, and nonnegative closing-line-value confidence evidence.
- Public sources, screenshots, and manual confirmations are retained as research evidence without being upgraded to licensed or verified price authority.
- The app never places a wager automatically.

## False Confidence Risks

The following statements would be false or materially misleading today:

- "Bear Edge has a proven profitable algorithm."
- "A high model probability is a verified bet."
- "A visible price on a public article is a current sportsbook offer."
- "A screenshot proves source freshness or market identity."
- "SHA-256 per-record digests make the local file immutable."
- "Four registered models means four validated models."
- "Passing 473 software tests proves betting edge."
- "Nineteen historical tickets are a statistically meaningful performance sample."
- "A 3-win streak validates a model."
- "The Supabase schema tests prove the live remote database is secure."
- "A configured odds key means live pricing is usable."
- "An escaped URL is safe without protocol validation."
- "The application is commercially ready because the local app lane is 100/100."

## Metrics and Reporting Assessment

### Closing-line value

Implemented with exact arithmetic and evidence checks, but no eligible current prediction population exists. Closing-line value is not demonstrated.

### Calibration

Brier score, logarithmic loss, expected calibration error, calibration slope, calibration intercept, reliability buckets, and event-cluster confidence intervals are implemented. Promotion fails closed. Event-level clustering is covered for model loss, no-vig baseline degradation, closing-line value, and return on investment; distinct-slate and season-level dependence, the shadow-outcome design gap, and licensed real-world evidence remain unresolved.

### Return on investment

Canonical return-on-investment reporting is structurally present, but no canonical settled `BET` population exists. The separate historical protocol ledger has incomplete stake data and negative known profit; it cannot establish a durable edge.

### Drawdown and exposure

Drawdown, daily turnover, open-event exposure, duplicate exposure, and correlated positions are reconstructed from immutable-style records and fail closed on integrity defects. These are meaningful risk controls, not evidence of predictive quality.

### False-positive reporting

The schema can retain false-positive notes, but zero eligible settled `BET` calls means the current metric is not meaningful.

## Data Provenance and Licensing Assessment

| Source class | Current use | Production authority |
| --- | --- | --- |
| Official league public endpoints | Schedule, roster, game, and player-stat research | Requires terms and commercial-rights review |
| The Odds API | Intended current sportsbook pricing | Configured but quota exhausted or otherwise unusable |
| DraftKings direct pages | Reachability and manual board context | Direct endpoints blocked or non-JSON; not a stable licensed feed |
| ESPN | Scoreboard and research context | Not treated as verified sportsbook or injury authority |
| StatMuse | Search and research context | Not treated as official roster, injury, odds, or projection authority |
| Editorial articles | Context and source discovery | Never sportsbook authorization |
| Screenshot and optical-character recognition | Manual evidence intake | Requires human verification; never independently establishes freshness or rights |
| Supabase | Optional remote audit projection | Not configured locally and remote state not verified |

Before commercial use, every provider needs a written inventory of permitted collection, storage, transformation, display, redistribution, model-training, retention, and enterprise resale rights.

## Consumer Subscription Systems Required

The current repository does not contain a production subscription business. Required systems include:

1. Durable consumer identity, account recovery, multifactor authentication, and session revocation.
2. Product plans, entitlements, feature flags, trial rules, grace periods, upgrades, downgrades, cancellations, refunds, and reactivation.
3. Payment-provider customer and subscription records with idempotent signed webhooks.
4. Tax, receipts, failed-payment recovery, chargeback handling, and reconciliation.
5. Jurisdiction, age, responsible-gambling, and consent gates before paid access.
6. Customer support, complaint handling, account closure, data export, and deletion workflows.
7. Clear separation between research information and wager recommendation language.
8. Usage and retention analytics that do not influence wager authorization.
9. Privacy policy, terms, data-processing inventory, retention schedule, and incident notification process.

## Enterprise Application Programming Interface Systems Required

The current local API is not an enterprise platform. Required systems include:

1. Tenant-isolated storage and immutable tenant ownership on every record.
2. Scoped application programming interface keys, rotation, revocation, expiration, and last-used audit evidence.
3. OAuth or signed service identities where customer security policy requires them.
4. Per-tenant rate limits, quotas, metering, idempotency keys, replay protection, and billing events.
5. Versioned public schemas, compatibility policy, deprecation windows, and software-development kits.
6. Webhook signing, retry, ordering, delivery logs, and customer replay tools.
7. Service-level objectives, status page, support tiers, maintenance policy, disaster recovery, and contractual remedies.
8. Single sign-on, Security Assertion Markup Language, System for Cross-domain Identity Management, role provisioning, and access review for larger customers.
9. Data residency, retention, encryption, backup, and customer-managed deletion controls.
10. Provider-license terms that explicitly permit enterprise redistribution.

## Exact Remediation Sequence

### Phase 0: Preserve the current boundary

- Keep `PRICE_CHECK_ONLY` mandatory.
- Do not place or market a real-money recommendation from current output.
- Do not weaken `BET` record validation to manufacture calibration rows.
- Freeze reviewed code in a clean commit only after this audit is accepted.

### Phase 1: Repair evidence collection

- Implement prediction-outcome and closing-price records.
- Add point-in-time event and market identity.
- Add event-grouped splits and cluster bootstrap.
- Add local and remote migration tests.
- Archive or migrate the 17 legacy rows without rewriting the source file.

### Phase 2: Restore licensed live inputs

- Fund or replace the odds provider.
- Contract for exact DraftKings market coverage if DraftKings is required.
- Add licensed lineup, injury, starter, and correction feeds.
- Define source precedence, freshness, and conflict rules.

### Phase 3: Build a defensible model pipeline

- Create a point-in-time historical feature store.
- Register immutable dataset and implementation digests.
- Compare simple and richer models against the no-vig market baseline.
- Use event-grouped walk-forward validation.
- Select once, then freeze an untouched evaluation window.

### Phase 4: Run shadow mode

- Capture every eligible pre-event prediction, exact offered price, independent closing price, and official outcome.
- Do not bet or expose qualified language.
- Monitor missingness, drift, provider outages, identity conflicts, and correction rates.
- Continue until all registered minimum sample and bucket requirements are met.

### Phase 5: Promotion review

- Recompute the report from immutable source evidence.
- Require passing Brier score, logarithmic loss, expected calibration error, slope, intercept, baseline, closing-line value, settlement coverage, leakage, and uncertainty gates.
- Require independent code and statistical review.
- Promote only the exact passing model tuple.

### Phase 6: Production platform

- Add durable identity, tenant isolation, transport-layer security, rate limiting, monitoring, incident response, secret rotation, backup restore, billing, responsible-gambling, and legal controls.
- Complete penetration, privacy, provider-license, and jurisdiction reviews.
- Run a limited non-wagering pilot before any paid recommendation product.

## Verification Evidence

### Commands

- `npm run verify`: passed TypeScript checking and 473 tests; 0 failed, skipped, cancelled, or pending.
- `npm run audit:protocol`: completed; 19 rows, 7 with calculable net, $39.67 known stake, negative $30.67 known net.
- `npm run audit:factory`: completed; 142 requirements, 90 implemented locally, 29 partial locally, 12 externally blocked, 11 prohibited by design.
- `npm run audit:calibration`: completed with blocked status; 0 eligible, 0 settled.
- `npm run audit:release`: correctly exited nonzero with blocked status, 64/100.
- `npm audit --audit-level=high`: 0 known vulnerabilities.
- `npm pack --dry-run --json`: succeeded; 127 files; no runtime environment-secret file included.
- `git diff --check`: passed with no whitespace errors.

### Running server

- `/health` returned HTTP 200.
- Unauthenticated `/api/release-readiness` returned HTTP 401 with `missing_bearer_token`.
- Responses included the expected browser hardening and no-store headers.
- The token bootstrap disappeared from the visible URL after authentication.

### Sidebar dashboard

- Release panel: blocked, 64/100.
- Local App lane: ready, 100/100.
- Data Edge lane: blocked, 9/100.
- Commercial Readiness lane: blocked, 63/100.
- Permission: `PRICE_CHECK_ONLY`.
- Qualified BET calls: 0.
- Fresh prices: 0.
- Exact bookmaker matches: 0.
- Legacy rows excluded: 17.
- Odds credits remaining: 0.
- Desktop 1440 by 1000: no horizontal overflow; blocked release and price-check warning visible.
- Phone 340 by 800: no horizontal overflow; blocked release and price-check warning visible.
- Dynamic new-tab links: no non-HTTP or non-HTTPS targets found.

## Final Acceptance Criteria

Bear Edge must remain `PRICE_CHECK_ONLY` until all of the following are simultaneously true:

- A clean, reviewed, reproducible commit is deployed.
- The authoritative evidence chain and independent retention controls are complete.
- Legacy integrity blockers are resolved without evidence destruction.
- A licensed exact-book odds source is live and fresh.
- Licensed lineup and injury evidence is available where required.
- Prediction outcomes and closing prices are captured for shadow evaluations.
- Event-grouped leakage prevention and cluster-aware uncertainty are implemented.
- At least 500 eligible out-of-sample settled predictions satisfy the registered coverage and bucket requirements.
- The exact model tuple passes calibration, baseline, closing-line-value, data-quality, and uncertainty gates.
- Production authentication, tenancy, abuse controls, monitoring, backup, billing, responsible-gambling, privacy, legal, and provider-license reviews pass.

Until then, the correct description is:

> Bear Edge is a professional-grade local decision-support and risk-control chassis around research-only models. It can organize evidence and reject unsafe action. It cannot yet prove or authorize a profitable betting edge.
