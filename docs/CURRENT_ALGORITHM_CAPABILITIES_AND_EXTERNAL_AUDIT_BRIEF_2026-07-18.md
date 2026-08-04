# Bear Edge Current Algorithm Capabilities And External Code Audit Brief

## Document Purpose

This document is the audit brief for the current Bear Edge checkout. It is not a product pitch, a profitability claim, or a substitute for source review. It describes what the software currently implements, what it refuses to do, what has been verified locally, what remains unverified, and what an external code reviewer must examine.

The requested review target is the actual repository code, including committed changes relative to `origin/master`, current uncommitted modifications, and current untracked source and test files. The reviewer must not limit the review to this document.

## Exact Checkout Under Review

- Repository: `davidmostow1/bear-edge-platform`
- Local root: `/Users/davidbearmostow/Documents/Codex/2026-06-17-documents-openai-developers-google-drive-google`
- Current branch: `codex/bear-edge-release-candidate`
- Current committed head: `2ca03a2 Make simulation workflow portable`
- Commits beyond `origin/master`: 47
- Current working tree: dirty
- Current modified or untracked entries after preparation of the independent-audit procurement package: 53
- Runtime: Node.js CommonJS application with JavaScript source and TypeScript checking through `checkJs`
- Implementation inventory: 81 implementation files and 36,623 source lines under `src/`
- Test inventory: 45 test files and 15,459 test lines under `test/`
- Script inventory: 7 JavaScript scripts and 916 lines under `script/`
- Database inventory: 16 PostgreSQL migrations and 1,224 lines under `supabase/migrations/`
- Current automated test count: 473

Because the working tree is dirty, the committed branch alone is not the complete review target. A review of only GitHub's current branch head would omit material code.

## Current Operating Verdict

The only accurate operating permission is:

`PRICE_CHECK_ONLY`

The software is a locally runnable betting research, price analysis, decision-control, and evidence-ledger system. It is not currently a validated profitable betting algorithm. It must not issue production-authorized betting recommendations while current provider, pricing, calibration, and evidence gates remain blocked.

Current measured state:

- Release readiness: `blocked`
- Release readiness score: 64 out of 100
- Local application lane: ready
- Data-edge lane: blocked
- Commercial-readiness lane: blocked
- Registered models: 4
- Validated models: 0
- Eligible calibration predictions: 0
- Settled calibration predictions: 0
- Official prediction-outcome records: 0
- Exact-book closing-price records: 0
- Current research candidates: 32
- Current priced candidates: 0
- Current exact DraftKings bookmaker matches: 0
- Current fresh priced candidates: 0
- Current synchronized remote records: 0
- Current pending synchronization records: 20
- Current legacy local ledger rows excluded from authoritative analytics: 17

## Product Boundary

Bear Edge currently supports five distinct activities:

1. Collect and normalize source-backed sports research.
2. Analyze an explicitly supplied two-sided market price.
3. Evaluate deterministic decision and staking gates.
4. Persist immutable-style local audit records and optional remote projections.
5. Build future calibration evidence from pre-event predictions, official outcomes, and exact-book closing prices.

Bear Edge does not currently prove:

- profitable expected value in live betting;
- positive realized return on investment;
- positive closing-line value;
- calibrated probabilities;
- superiority to the no-vig market baseline;
- complete licensed injury or lineup coverage;
- verified current DraftKings pricing;
- safe public internet deployment;
- production legal or responsible-gambling compliance;
- consumer subscription readiness;
- enterprise application programming interface readiness.

## End-To-End Decision Flow

The intended authoritative flow is:

1. Load official schedule, roster, and player-stat context.
2. Build a research candidate with explicit event, participant, market family, side, line, timestamps, and provenance.
3. Obtain an exact sportsbook offer and its opposite-side price when required.
4. Verify sportsbook identity, market identity, line identity, source time, capture time, freshness, and event cutoff.
5. Resolve the registered model identity and status.
6. Calculate market implied probability and two-way no-vig probability.
7. Calculate or accept a model probability only within the registered authority boundary.
8. Apply model-to-market shrinkage and market-intelligence adjustments.
9. Calculate fair edge, offered-price edge, expected value, Kelly fraction, and capped stake.
10. Apply hard risk, data-quality, price, provider, correlation, drawdown, portfolio, and model-status gates.
11. Return `PASS`, `WAIT`, or `BET` as a decision verdict.
12. Return `WAIT`, `PRICE_CHECK_ONLY`, or `VERIFIED_BETS_ALLOWED` as the separate operational permission.
13. Persist the complete canonical evaluation before returning an authoritative result.
14. Record financial settlement only for a canonical `BET` evaluation.
15. Record non-financial official outcome and closing-price evidence separately for research and shadow evaluations.
16. Project eligible observations into a chronological calibration dataset.
17. Promote a model only after every registered statistical and evidence threshold passes.

The external audit must verify that no alternate path bypasses this sequence.

## Deterministic Market Mathematics

Implemented in `src/index.js`, `src/live/estimate-prop.js`, `src/live/market-intelligence.js`, and `src/live/price-discipline.js`:

- American odds to decimal odds conversion.
- American odds to implied probability conversion.
- Two-way proportional no-vig normalization.
- Market hold calculation.
- Model probability shrinkage toward the no-vig market probability.
- Offered-price expected profit and expected return on stake.
- Full Kelly fraction calculation with negative Kelly clamped to zero for staking.
- Fractional-Kelly application.
- Absolute stake cap.
- Maximum bankroll-fraction cap.
- Minimum acceptable sportsbook price calculation.
- Price validity deadline derived from source freshness and event start.
- Exact-book price matching.
- Best fresh price selection across returned books.
- Consensus market probability across usable books.
- Market disagreement measurement.
- Line-movement analysis.
- Longshot-tax and sharp-confirmation controls.

Default straight-decision thresholds:

- Minimum fair edge over the no-vig market: strictly greater than 0.02.
- Minimum expected-value return on stake: strictly greater than 0.01.
- Minimum Kelly fraction: strictly greater than 0.005.
- Default market weight in probability shrinkage: 0.35.
- Default Kelly multiplier: 0.25.
- Default maximum bankroll fraction: 0.03.
- Default minimum stake: 1 currency unit.
- Default maximum injury-data age: 90 minutes.

Boundary behavior is intentionally strict. Equality at a minimum threshold does not pass.

## Predictive Modeling

The registered model family is `poisson_count_v1`, version `1.0.0`.

Registered market families:

1. Pitcher strikeouts.
2. Batter hits.
3. Batter runs scored.
4. Batter total bases.

Registered input features:

- market line;
- recent per-game rate;
- recent sample limit;
- recent weight;
- season per-game rate;
- over or under side.

Current source inputs are official Major League Baseball schedule, roster, and player-stat endpoints as applicable to each market family.

The current model blends recent and season per-game rates and applies a Poisson count distribution for non-integer lines. Integer count lines are rejected because push-aware probability and expected-value handling are not yet implemented.

All four model entries are `research_only` because:

- no training cutoff is registered;
- no implementation digest is registered;
- no content-addressed, digest-verified calibration report is attached;
- no model has 500 eligible settled out-of-sample predictions;
- no reliability bucket has the required evidence;
- no baseline comparison has passed;
- no non-negative closing-line-value confidence interval exists.

Caller-provided `validated` flags are not authoritative. The model registry is the authority. Research-only models must not create canonical `BET` records.

## Live Sports And Research Data

Implemented official or structured adapters include:

- Major League Baseball schedules.
- Major League Baseball rosters.
- Major League Baseball player season and recent statistics.
- Major League Baseball game status and current-game statistics when an official game identifier is supplied.
- National Hockey League schedules, rosters, and player statistics.
- ESPN public scoreboards for Major League Baseball and FIFA World Cup context.

Implemented contextual or manually reviewed surfaces include:

- StatMuse score, game, Notes, and Predictions page snapshots.
- ESPN odds-page snapshots.
- DraftKings browser-visible game-line text.
- DraftKings Predictions screenshot and optical-character-recognition rows.
- DraftKings Network editorial cards.
- Covers public Major League Baseball prop listings.
- Hard Rock Bet public market-page availability.
- STAT News editorial search context.
- World Cup goalscorer screenshot rows.

Contextual and screenshot-derived data is explicitly not equivalent to a licensed sportsbook, roster, lineup, injury, or official result feed. Manual confirmation records operator review but does not upgrade provider verification or authorize a bet.

Current live source state:

- ESPN: reachable research and scoreboard source.
- StatMuse: reachable research surface.
- STAT News: reachable editorial surface.
- DraftKings: degraded as a verified market source.
- Tennis: blocked from automation and manual-only.
- Licensed injury and lineup provider: not configured.

## Odds Provider And Quota Controls

The Odds API integration implements:

- local secret storage in `.env.local`;
- secret redaction from responses and diagnostics;
- a no-cost sports-catalog authentication check;
- an explicit paid Major League Baseball DraftKings market probe;
- quota-header capture for remaining, used, and last-call usage;
- a shared quota-exhaustion circuit breaker;
- two-minute duplicate paid-response caching;
- estimated request-cost limits;
- a five-credit reserve;
- a manual paid refresh boundary;
- zero-credit recurring health and release checks.

A configured key is not considered ready merely because catalog authentication succeeds. Market access, exact bookmaker coverage, freshness, and matching are separately required.

Current provider condition is configured but not live-verified for usable exact-book pricing. Therefore current output remains `PRICE_CHECK_ONLY`.

## Decision Verdicts And Operational Permissions

Decision verdicts:

- `PASS`: the market or setup fails a decision gate.
- `WAIT`: the decision lacks timely evidence or model authority.
- `BET`: all deterministic decision gates pass and the evaluation is authorized to persist as a canonical bet.

Operational permissions:

- `WAIT`: no price-check or betting authority is available.
- `PRICE_CHECK_ONLY`: research and price comparison are allowed, but no verified bet call is authorized.
- `VERIFIED_BETS_ALLOWED`: exact-book price, provider, model, calibration, and risk authority are all present.

The reviewer must check that verdict and permission cannot be conflated. A mathematically favorable research row must not become an authorized bet when permission is only `PRICE_CHECK_ONLY`.

## Hard Decision And Risk Gates

Implemented hard or fail-closed gates include:

- active tilt lock;
- parlay rejection in the straight-bet evaluator;
- declared or derived correlation risk;
- stale injury evidence;
- stale lineup evidence;
- missing market timestamp;
- future-dated source timestamp;
- stale sportsbook offer;
- sportsbook mismatch;
- participant mismatch;
- market-family mismatch;
- side mismatch;
- exact-line mismatch;
- incomplete two-sided market where no-vig calculation is required;
- negative expected value;
- fair edge below threshold;
- expected-value return below threshold;
- Kelly fraction below threshold;
- recommended stake at or below minimum;
- zero recommended stake;
- unvalidated model authority;
- unresolved live outcome;
- excessive multi-book disagreement;
- missing sharp confirmation for configured longshot treatment;
- integer count line with an unresolved push outcome;
- drawdown authority unavailable;
- hard drawdown limit exceeded;
- portfolio authority unavailable;
- daily exposure cap exceeded;
- event exposure cap exceeded;
- duplicate recommendation;
- correlated portfolio position;
- ledger integrity defect;
- failure to persist the authoritative record.

## Parlay Support

The live-ticket evaluator supports research evaluation of:

- two-leg and three-leg tickets;
- no more than two alternate-prop legs;
- declared and derived shared-event correlation keys;
- explicit correlated-leg allowance only when configured;
- an applied probability penalty when correlation is allowed;
- parlay-level expected value and staking controls.

Missing or stale evidence produces `WAIT`. The straight-bet evaluator rejects parlays by default. Current research-only model status prevents production-authorized parlay betting.

## Portfolio And Drawdown Controls

Portfolio controls include:

- current-day turnover tracking;
- open-position exposure tracking;
- event-level exposure tracking;
- market-level exposure tracking;
- duplicate-position detection;
- correlation-key aggregation;
- settlement and amendment resolution;
- release blocking when ledger authority is unavailable.

Drawdown controls include:

- equity high-water-mark calculation;
- current drawdown calculation;
- stake reduction across configured drawdown bands;
- hard drawdown stop;
- reopening exposure when a final settlement is validly amended to pending;
- fail-closed behavior for orphan settlements, malformed values, and ledger defects.

The current historical data is insufficient to validate the economic effectiveness of these controls.

## Canonical Audit Record System

Current audit schema version: `2.1.0`.

Readable schema versions: `2.0.0` and `2.1.0`.

Canonical record types:

- evaluation;
- settlement;
- prediction outcome;
- closing price;
- amendment.

Implemented record properties include:

- stable typed identifiers;
- canonical JSON serialization;
- SHA-256 content digests;
- complete market identity;
- source provenance;
- capture and event timestamps;
- model identity and registry status;
- permission and verdict;
- decision-gate evidence;
- price evidence;
- risk flags;
- recommended stake evidence;
- append-only corrections.

The local JSON Lines ledger is authoritative. It serializes concurrent appends, rejects identifier reuse with a different digest, treats identical retries as idempotent, detects malformed lines, reports duplicate identifiers and digest conflicts, and blocks new authoritative writes when integrity defects exist.

Important limitation: local SHA-256 digests detect accidental or unsophisticated modification but do not provide cryptographic immutability against an attacker who can rewrite both content and digest. There is no external signature, trusted timestamp, write-once storage, or independent hash anchor.

## Financial Settlements

Financial settlement is restricted to an existing canonical `BET` evaluation.

A final settlement requires:

- outcome;
- closing odds;
- stake;
- profit;
- settlement timestamp;
- authoritative evaluation linkage.

`WAIT` and `PASS` evaluations cannot be represented as wager settlements. Corrections are append-only amendments rather than mutation of prior records.

## Shadow And Research Evidence

Schema version `2.1.0` adds non-financial evidence for research and shadow evaluations:

- `prediction_outcome` records official final event and market results.
- `closing_price` records the exact evaluated sportsbook's final two-sided closing market.

Implemented constraints include:

- the parent evaluation must exist;
- evidence must match the evaluation owner and market identity;
- the closing sportsbook must exactly match the evaluated sportsbook;
- official result and market-close chronology must be valid;
- final event scores must be safe integers;
- American odds must be safe integers with supported magnitude;
- source digests must be genuine 64-character lowercase SHA-256 values;
- financial stake and profit fields are prohibited;
- correction identifiers must use the expected typed identifier;
- each correction must supersede the latest record;
- correction histories must remain one linear chain;
- stale branches are rejected.

Calibration can join an eligible evaluation to the latest valid outcome and closing-price pair without inventing a wager.

The local code, tests, application programming interface, outbox mapper, synchronization worker, and migration exist. The new remote tables are not deployed and no real outcome or closing-price evidence has been recorded.

## Analytics

Implemented analytics include:

- closing-line value;
- hit rate;
- expected value by market type;
- actual profit and loss;
- return on investment where stake evidence is complete;
- parlay performance;
- false-positive bet calls;
- three-consecutive-win validation display;
- data-quality classification;
- malformed row detection;
- duplicate identifier detection;
- digest conflict detection;
- orphan settlement detection;
- missing source-time detection;
- legacy-record exclusion;
- settlement coverage;
- graded settlement coverage.

The system does not report incomplete data as complete performance. Current metrics are not statistically meaningful because there are no eligible settled predictions and 17 legacy rows are excluded.

The three-win display is a process gate only. It is not a model-validation standard and must not be interpreted as proof of edge.

## Calibration And Model Promotion

Implemented dataset controls include:

- required canonical fields;
- pre-event prediction enforcement;
- source-time validation;
- no post-event feature inclusion;
- duplicate identifier detection;
- duplicate observation-key detection;
- deterministic manifests and digests;
- chronological train, calibration, and evaluation splits;
- content-addressed evaluation metrics;
- source-lineage accounting.

Implemented metrics include:

- Brier score;
- logarithmic loss;
- expected calibration error;
- reliability buckets;
- logistic calibration slope and intercept;
- percentile-bootstrap confidence intervals;
- closing-line-value mean and confidence interval;
- return-on-investment interval;
- line-range, participant-role, and context breakdowns;
- comparison with the registered two-way no-vig market baseline.

Registered promotion requirements:

- at least 500 settled predictions;
- at least 100 observations in every registered reliability bucket;
- at least 95 percent settlement coverage;
- expected calibration error no greater than 0.03;
- calibration slope from 0.8 through 1.2;
- absolute calibration intercept no greater than 0.05;
- no material Brier-score or log-loss degradation versus the matching no-vig baseline;
- a non-negative closing-line-value confidence interval;
- percentile bootstrap with at least 2,000 resamples;
- confidence level of at least 0.95;
- resolved data-quality and leakage findings;
- policy registration before the evaluation period;
- registered report and implementation digests.

Current calibration readiness is blocked with zero eligible predictions, zero settled predictions, and zero distinct eligible prediction times.

Known statistical limitations requiring review:

- event-cluster percentile bootstrap does not yet model dependence shared across an entire slate, sportsbook, season, or data regime;
- event-atomic prediction-interval splitting prevents one event from crossing partitions, but season-aware or week-aware walk-forward validation and independently frozen preprocessing remain open;
- the Poisson baseline does not model opponent, venue, weather, umpire, pitch count, bullpen, projected playing time, lineup slot, handedness interaction, or overdispersion comprehensively;
- feature and outcome availability has not been proven with a licensed historical dataset.

## Application Programming Interface

Public bootstrap routes:

- `GET /health`
- `GET /schemas`
- `GET /dashboard`
- static dashboard assets
- `GET /api/operator-auth`

Protected operational routes include:

- `GET /api/statsig-control`
- `POST /api/statsig-control/exposure`
- `GET /api/sync-health`
- `POST /api/sync/run`
- `GET /api/system-audit`
- `GET /api/release-readiness`
- `GET /api/data-edge-audit`
- `GET /api/settings/odds-key`
- `POST /api/settings/odds-key`
- `POST /api/settings/odds-key/test`
- `GET /api/decision-log`
- `GET /api/source-status`
- `GET /api/odds/sports`
- `GET /api/odds/markets`
- `GET /api/auto-update`
- `GET /api/auto-update/history`
- `POST /api/auto-update/run`
- `GET /api/games`
- `GET /api/candidates`
- `GET /api/best-mlb-targets`
- `GET /api/online-opportunities`
- `POST /api/statmuse-snapshot`
- `POST /api/espn-snapshot`
- `POST /api/snapshot-confirmation`
- `POST /api/draftkings-snapshot`
- `POST /api/dk-predictions-board-snapshot`
- `POST /api/worldcup-goalscorer-snapshot`
- `POST /api/recording-props-compare`
- `POST /api/simulate-card`
- `POST /evaluate`
- `POST /evaluate/live`
- `POST /api/settle`
- `POST /api/prediction-outcomes`
- `POST /api/closing-prices`

Server controls include an explicit body-size limit, request error normalization, browser security headers, no-store controls for sensitive responses, external-source timeouts, and operator-token redaction.

The server is local-grade. It does not currently provide production internet identity, durable sessions, account recovery, multi-tenant authorization, distributed rate limiting, distributed job coordination, or production observability.

## Operator Authentication And Browser Security

Implemented local and private-network protections include:

- 32-byte random operator bearer tokens;
- SHA-256 token digest storage;
- constant-time token comparison;
- authentication required on localhost and private-network launch modes;
- one-time URL-fragment bootstrap;
- immediate fragment removal;
- tab-session storage of the token;
- no raw token in readiness or authentication responses;
- no secret values in diagnostics;
- local binding to `127.0.0.1` by default;
- explicit private-network launch path;
- browser hardening headers;
- external link scheme restriction to HTTP and HTTPS;
- escaping of provider-controlled displayed values.

Known limitations:

- private-network mode uses plain HTTP;
- generated-token recovery requires process restart if the token is lost;
- content security policy permits inline styles;
- there is no production user identity or authorization system;
- there is no public-internet deployment boundary;
- there is no comprehensive abuse prevention or distributed rate limiting.

## Optional Supabase Projection

The local ledger remains authoritative. Supabase is a secondary retention projection.

Implemented synchronization behavior includes:

- append-only local outbox events;
- deterministic pending events;
- pending, retryable-failure, terminal-failure, and synchronized states;
- exponential backoff with deterministic jitter;
- terminal conflict detection;
- dependency-aware ordering for evaluation, settlement, amendment, prediction outcome, and closing price;
- resolution of remote parent and superseded record identifiers;
- idempotent handling of matching remote duplicates;
- terminal handling of digest conflicts;
- release blocking for terminal failures or outbox integrity defects;
- secret-safe error reporting.

Existing deployed remote tables were previously verified as row-level-security enabled and forced, with owner-scoped policies and no current security-advisor findings. Existing remote tables were empty at that verification point.

The version-controlled `20260718010000_shadow_evidence_v21.sql` migration is not deployed. Remote `prediction_outcomes` and `closing_prices` tables do not currently exist. Local synchronization is not configured, 20 records are pending, and zero records are synchronized.

The external audit must examine:

- row-level-security correctness;
- grant and revoke order;
- service-role claim handling;
- owner isolation;
- `SECURITY DEFINER` search path;
- trigger serialization;
- advisory-lock scope;
- correction-chain races;
- REST mapper completeness;
- retry and idempotency behavior;
- disaster recovery and reconciliation.

## Optional Statsig Controls

Statsig is intentionally restricted to presentation and shadow-assignment controls. It cannot alter probability, verdict, permission, stake, model status, or operator authorization.

Missing configuration, initialization failure, and gate errors produce a fail-closed control fallback.

## Dashboard And Command-Line Interfaces

Implemented interfaces include:

- local authenticated web dashboard;
- installable phone-shell presentation over a trusted private network;
- straight evaluation command;
- live-ticket evaluation command;
- watch loop;
- local launcher;
- private-network launcher;
- source and auto-update panels;
- system and release audit panels;
- screenshot intake and optical character recognition;
- decision board;
- candidate cards and manual odds entry;
- ticket builder;
- settlement entry;
- decision-log history;
- synchronization health and manual synchronization;
- provider-key configuration and test;
- calibration and release report generation;
- deterministic simulation;
- portable package creation.

The dashboard was smoke-tested on a desktop viewport and a 340-pixel mobile viewport with no horizontal overflow or browser console warnings. The bootstrap token was removed from the address bar after session initialization. Protected access returned HTTP 401 without credentials and HTTP 200 with the operator credential.

## Automated Verification And Packaging

Current verified commands:

- `npm run typecheck`
- `npm test`
- `npm run verify`
- `npm audit --audit-level=high`
- `npm pack --dry-run --json`
- `npm run audit:calibration`
- `npm run audit:release`
- `npm run audit:protocol`

Current results:

- Type checking passed.
- 473 of 473 tests passed.
- Dependency audit reported zero vulnerabilities.
- Package dry-run succeeded with 127 files.
- Package dry-run size was 349,182 compressed bytes and 1,546,411 unpacked bytes.
- No runtime environment-secret file appeared in the package inventory.
- Calibration audit correctly exited blocked.
- Release audit correctly exited nonzero at blocked 64 out of 100.
- Protocol audit completed and generated JSON, comma-separated-values, and Markdown outputs.

Continuous integration currently runs on Ubuntu with Node.js 20, installs with `npm ci`, and executes `npm run verify` for pushes to `master`, pushes to `codex/**`, and pull requests.

Continuous integration limitations:

- no macOS matrix;
- no Windows matrix;
- no Node.js 22 or 24 matrix;
- no database integration job;
- no browser end-to-end job;
- no migration application against a disposable PostgreSQL or Supabase instance;
- no CodeQL workflow;
- no secret-scanning workflow beyond repository and packaging checks;
- no mutation testing;
- no performance or load testing;
- no production deployment test.

## Independent Local Static-Audit Preflight

The following checks were run in addition to the repository's normal verification commands. These results are audit inputs, not substitutes for external review.

### Node.js 20 compatibility

- Node.js version used: 20.20.2.
- Type checking passed under Node.js 20.
- All 473 tests passed under Node.js 20.

This confirms the current uncommitted checkout runs on the same major Node.js version used by continuous integration. It does not confirm macOS, Windows, database, or browser portability.

### Loaded-module test coverage

Node.js experimental test coverage reported:

- line coverage: 89.19 percent;
- branch coverage: 71.61 percent;
- function coverage: 93.48 percent.

This report covers JavaScript modules loaded by the test run. It does not count unimported browser assets, native Swift code, SQL behavior, or source files that no test loaded. It must not be presented as full-repository coverage.

Notable low-coverage loaded modules include:

- `src/live/image-ocr.js`: 18.85 percent line coverage and 0 percent function coverage;
- `src/cli/serve.js`: 39.18 percent line coverage and 25 percent function coverage;
- `src/cli/launch.js`: 44.04 percent line coverage and 28.57 percent function coverage;
- `src/live/recording-prop-compare.js`: 68.69 percent line coverage and 34.17 percent branch coverage;
- `src/release-readiness.js`: 76.42 percent line coverage and 34.84 percent branch coverage;
- `src/sync/sync-worker.js`: 78.60 percent line coverage and 69.70 percent branch coverage.

### Circular dependency analysis

Madge version 8 processed 80 JavaScript files and found one circular dependency:

`src/index.js -> src/server.js -> src/index.js`

`src/index.js` imports `createServer` from `src/server.js`. The server's straight-evaluation route later performs a runtime `require("./index.js")` to obtain `evaluateBetDecision`. The late require reduces immediate initialization failure in the tested path, but the cycle remains an architectural and maintainability risk. The external reviewer must determine whether partial CommonJS exports, test order, packaging, or future refactoring can make the cycle behaviorally unsafe.

### Duplication analysis

JavaScript Copy/Paste Detector version 4.0.5 scanned 115 source and test files using a minimum of 10 lines and 75 tokens. It reported:

- 12 clone groups;
- 284 duplicated lines;
- 2,367 duplicated tokens;
- 0.86 percent duplicated lines;
- 0.80 percent duplicated tokens.

Six clone groups are in implementation code:

1. Source-fetch normalization shared by `src/live/online-opportunities.js` and `src/live/source-status.js`.
2. Odds and payout normalization shared by `src/live/online-opportunities.js` and `src/live/worldcup-goalscorer-snapshot.js`.
3. Repeated response handling inside `src/live/odds-api.js`.
4. Digest-safe value normalization shared by `src/calibration/dataset.js` and `src/calibration/report.js`.
5. Numeric validation shared by `src/validate-bet-input.js` and `src/validate-live-ticket.js`.
6. Stake-cap and probability logic shared by `src/index.js` and `src/live/estimate-prop.js`.

Overall duplication is low, but duplicated betting mathematics and validation are higher-risk than ordinary presentation duplication because behavioral drift can change verdicts, stakes, and audit records.

### Secret and dependency checks

- Secretlint quick-start version 13.0.2 completed without reporting a secret finding.
- `npm audit --audit-level=high` reported zero known vulnerabilities.
- `npm audit signatures` verified registry signatures for 24 packages.
- `npm audit signatures` verified attestations for 12 packages.
- The package dry-run did not include `.env.local` or another runtime secret file.

These checks do not prove the absence of secrets from Git history, external systems, screenshots, logs outside the repository, or runtime memory.

### Dependency currency

The application has one declared runtime dependency: `@statsig/statsig-node-core` version 0.20.1.

The only packages reported by `npm outdated` were development dependencies:

- `@types/node` current 24.13.2, wanted 24.13.3, latest major 26.1.1;
- `typescript` current and wanted 5.9.3, latest major 7.0.2.

These version differences are not current vulnerability findings. Major upgrades require compatibility review and are not part of this audit submission.

### Large-file maintainability hotspots

Largest JavaScript implementation files by line count:

- `src/dashboard/app.js`: 6,022 lines;
- `src/calibration/model-registry.js`: 1,582 lines;
- `src/analytics.js`: 1,234 lines;
- `src/server.js`: 1,093 lines;
- `src/audit/protocol-ledger.js`: 1,075 lines;
- `src/live/best-mlb-targets.js`: 1,056 lines;
- `src/audit/record-contract.js`: 1,013 lines.

File size alone is not a defect, but these files deserve focused review for mixed responsibilities, hidden coupling, inconsistent validation, and regression risk.

## Current Data Quality

Current authoritative ledger summary:

- total records inspected: 37;
- canonical records: 20;
- legacy records: 17;
- canonical evaluations: 20;
- eligible predictions: 0;
- settled predictions: 0;
- excluded evaluations: 20;
- malformed lines: 0;
- duplicate identifiers: 0;
- digest conflicts: 0;
- schema-invalid canonical records: 0;
- invalid settlement references: 0;
- invalid shadow-evidence references: 0.

Most canonical evaluations are excluded because they lack complete two-sided verified market-price evidence. One older evaluation lacks complete canonical market identity.

## Governance Requirements

The professional betting factory manifest contains 142 atomic requirements:

- 90 implemented locally;
- 29 partially implemented locally;
- 12 blocked by external providers, evidence, deployment, licensing, or operations;
- 11 prohibited by design;
- 0 unknown;
- 0 duplicate identifiers;
- 0 invalid requirements;
- 0 missing declared evidence references.

An implemented-local classification means code or a local control exists. It does not mean production evidence, statistical effectiveness, licensing, or commercial readiness exists.

## Known Critical And High Risks

1. No demonstrated betting edge exists.
2. Shadow outcome and closing-price infrastructure is not deployed or populated.
3. Local digest checking is not cryptographic immutability.
4. Row-level bootstrap does not account for event or participant dependence.
5. Chronological splitting does not guarantee event-group isolation.
6. Predictive models are simple Poisson research baselines.
7. Verified current sportsbook pricing is unavailable.
8. Licensed injury and lineup evidence is unavailable.
9. Public deployment identity, abuse controls, and observability are incomplete.
10. Responsible-gambling and legal systems are not production complete.
11. Seventeen legacy records block a clean authoritative-history claim.
12. The new remote shadow-evidence migration is not deployed.
13. The current working tree is not reproducibly frozen in a reviewed commit.

## Explicit Non-Capabilities

The reviewer and any downstream system must not describe Bear Edge as currently capable of:

- autonomously placing bets;
- guaranteeing or reliably predicting winners;
- generating production-authorized best bets from the current slate;
- proving a profitable historical strategy;
- providing complete live DraftKings odds;
- providing licensed injury or lineup truth;
- supporting automated tennis recommendations;
- operating as a secure public multi-user software-as-a-service product;
- satisfying gaming law in any jurisdiction;
- providing individualized financial or gambling advice;
- replacing independent sportsbook, data-provider, legal, security, or statistical validation.

## Primary Code Review Map

Core decision mathematics and persistence:

- `src/index.js`
- `src/validate-bet-input.js`
- `src/decision-log.js`
- `src/audit/record-contract.js`
- `src/audit/authoritative-ledger.js`

Live probability and market evaluation:

- `src/validate-live-ticket.js`
- `src/live/estimate-prop.js`
- `src/live/evaluate-live-ticket.js`
- `src/live/market-intelligence.js`
- `src/live/price-discipline.js`
- `src/live/probability-uncertainty.js`
- `src/live/probability-causality.js`

Candidate and provider pipelines:

- `src/live/candidates.js`
- `src/live/best-mlb-targets.js`
- `src/live/odds-api.js`
- `src/live/odds-quota.js`
- `src/live/source-status.js`
- `src/live/online-opportunities.js`
- `src/live/providers/mlb.js`
- `src/live/providers/nhl.js`

Risk controls:

- `src/risk/portfolio-risk.js`
- `src/risk/drawdown-risk.js`
- `src/live/recommendation-lifecycle.js`

Evidence and calibration:

- `src/audit/evidence-ledger.js`
- `src/audit/evidence-resolution.js`
- `src/calibration/ledger-projection.js`
- `src/calibration/dataset.js`
- `src/calibration/metrics.js`
- `src/calibration/report.js`
- `src/calibration/model-registry.js`
- `models/registry.json`

Application programming interface and browser:

- `src/server.js`
- `src/schemas.js`
- `src/config/operator-auth.js`
- `src/dashboard/app.js`
- `src/dashboard/index.html`
- `src/dashboard/styles.css`

Remote projection:

- `src/sync/outbox.js`
- `src/sync/supabase-client.js`
- `src/sync/supabase-mapper.js`
- `src/sync/sync-worker.js`
- `supabase/migrations/*.sql`

Operational and release authority:

- `src/release-readiness.js`
- `src/data-edge.js`
- `src/system-audit.js`
- `script/build_release_readiness.js`
- `script/build_calibration_readiness.js`
- `.github/workflows/ci.yml`

## Required External Audit Questions

The external reviewer must answer all of the following from code, not documentation alone.

### Correctness

1. Are American-odds, no-vig, expected-value, Kelly, stake, and closing-line-value calculations correct at positive, negative, extreme, and boundary prices?
2. Can floating-point behavior or integer coercion change a verdict at a threshold?
3. Can any rejected, missing, stale, future-dated, or mismatched market input reach a canonical bet record?
4. Can a caller forge model status, permission, provenance, calibration, or authoritative paths?
5. Are all asynchronous failures propagated before success is returned?
6. Can concurrent writes corrupt the ledger, outbox, correction chain, or remote projection?
7. Can idempotency accept different content under one identity?
8. Can amendment or evidence resolution select a stale or branched record?

### Statistical Integrity

9. Does the calibration pipeline prevent post-event leakage in every feature and source timestamp?
10. Can the same event, participant, or correlated observation cross training, calibration, and evaluation partitions?
11. Are Brier score, logarithmic loss, expected calibration error, reliability buckets, calibration fit, bootstrap intervals, closing-line value, and return-on-investment intervals computed correctly?
12. Does the promotion registry recompute rather than trust stored promotion claims?
13. Can an invalid, missing, contradictory, or non-finite report value pass promotion?
14. Are the registered minimum sample and coverage gates enforceable and fixed before evaluation begins?

### Security

15. Can secrets appear in responses, errors, logs, URLs, browser state, package output, or provider requests?
16. Are authentication checks present on every sensitive read and every state-changing route, including state-changing GET routes?
17. Are request-size, timeout, cache, content-security-policy, cross-origin, and external-link controls sufficient for the stated local boundary?
18. Can provider-controlled text create cross-site scripting, unsafe links, log injection, or parser confusion?
19. Are Supabase grants, row-level-security policies, owner checks, service-role checks, triggers, and `SECURITY DEFINER` functions correct?
20. Can a malicious or compromised client create, mutate, branch, or read another user's audit evidence?

### Reliability And Operations

21. Can paid odds calls exceed the stated reserve or request-cost limit under concurrency, restart, retry, or cache races?
22. Can retries create duplicates or hide terminal conflicts?
23. Can local success be reported when durable local append, outbox append, or remote projection has failed?
24. Can a stale last-good snapshot be displayed as live?
25. Can the launcher attach to a stale process, expose a token, or misreport readiness?
26. What failure modes are not exercised by the current 473 tests?

### Architecture And Maintainability

27. Which modules have excessive responsibility or hidden coupling?
28. Which duplicated calculation implementations can drift?
29. Are schema definitions duplicated across validators, records, application programming interfaces, mappers, and PostgreSQL constraints?
30. Which source files are too large to review or maintain safely?
31. Are CommonJS boundaries, mutable global caches, and injected transports safe under test and production concurrency?
32. Which interfaces require explicit types, generated schemas, or a migration to TypeScript?
33. Does the package expose unsupported internal behavior or omit required runtime assets?

### Product And Commercial Safety

34. Can any user interface language be mistaken for a verified betting recommendation?
35. Are data provenance, licensing, retention, and deletion obligations represented in code and operations?
36. What must be added before public deployment, consumer subscriptions, or an enterprise application programming interface?
37. What claims could a buyer reasonably verify today, and which claims would be false confidence?

## Required Finding Format

Every external finding should include:

- severity: critical, high, medium, or low;
- exact file and line;
- affected execution path;
- concrete failure or exploit scenario;
- why existing validation or tests do not prevent it;
- smallest correct fix;
- required regression test;
- whether the issue blocks local research, shadow evaluation, verified betting, remote deployment, or commercial release.

The review should prioritize defects and false confidence over style preferences. It should not recommend replacing working architecture merely to create activity.

## Acceptance Boundary

An external audit is not considered complete merely because it reports no issues. A credible audit must state its reviewed diff or commit range, whether untracked files were included, what tools and models were used, what source areas were omitted, and what residual risk remains.

Until code review, controlled migration deployment, licensed providers, shadow evidence, and registered model-promotion evidence are complete, the release status remains `PRICE_CHECK_ONLY`.
