# Bear Edge Platform V2 Design

Date: 2026-07-10
Status: Approved design
Base: PR #1 head `32bddbf687b15c86a10174c2afff4dbd7f0540a9`

## 1. Purpose

Bear Edge V2 turns the existing local betting decision engine into a secure, evidence-driven platform without discarding its deterministic risk gates. The product must help identify potentially mispriced markets, preserve the exact evidence available before a wager, enforce bankroll discipline, and measure whether the apparent edge survives against closing prices and settled outcomes.

The product must never claim guaranteed winnings or a validated market edge without prospective evidence.

## 2. Architectural Decision

Use a modular platform rather than rewriting the existing engine.

- The current Node.js engine remains the deterministic decision authority.
- A dedicated Supabase project becomes the durable backend for authentication, user-owned records, market snapshots, evaluations, settlements, bankroll history, and audit trails.
- Deepnote becomes the controlled research environment for backtesting, calibration, feature analysis, and model comparison.
- The existing web dashboard remains the primary cross-platform interface.
- A native SwiftUI macOS application becomes the desktop command center and consumes the same authenticated API.
- Provider adapters remain replaceable and isolated from verdict logic.

The current unrelated Supabase project is not reused. A separate Bear Edge project prevents experimental betting data and migrations from contaminating other systems.

## 3. Trust Boundaries

### 3.1 Evidence classes

Every record carries one of these evidence classes:

1. `fixture`: synthetic test data.
2. `simulation`: generated trial output.
3. `captured_unverified`: screenshot, OCR, or manually transcribed sportsbook data.
4. `provider_verified`: matched to an authorized current provider response.
5. `settled_verified`: result and closing price captured from an accepted source.

Fixture and simulation records can never satisfy real-bet validation gates.

### 3.2 Decision authority

Research systems may produce probabilities, diagnostics, or candidate rankings. Only deterministic engine code may issue `BET`, `WAIT`, or `PASS`.

A `BET` verdict requires:

- nonzero current market odds;
- a timestamped source;
- a game and participant match;
- freshness within the market policy;
- required lineup, injury, weather, or goalie evidence for that market;
- no blocking correlation or risk flag;
- positive expected value after configured shrinkage;
- stake within bankroll and sportsbook-minimum constraints.

## 4. Screenshot Market Intake

The five approved DraftKings screenshots form the first real sportsbook-board acceptance fixture. The intake workflow extracts:

- sport and market family;
- slate date and displayed start time;
- away and home teams;
- probable pitchers;
- run-line sides, lines, and prices;
- total sides, totals, and prices;
- moneyline sides and prices;
- screenshot identifier and capture timestamp;
- OCR confidence and field-level review state.

Screenshot odds enter as `captured_unverified`. They may be displayed and analyzed provisionally, but cannot produce an actionable `BET` until matched against current schedule and market data.

Cropped, ambiguous, missing, or conflicting fields remain null and force `WAIT`. The system never infers a hidden price.

## 5. Core Components

### 5.1 Node decision service

Responsibilities:

- validate canonical market and ticket payloads;
- calculate implied probability and two-way no-vig probability;
- apply model-to-market shrinkage;
- calculate EV, Kelly fraction, stake caps, and payout;
- enforce stale-data, tilt, lineup, weather, correlation, and price gates;
- create immutable evaluation records;
- expose versioned HTTP endpoints.

Existing calculation modules remain pure and independently testable.

### 5.2 Provider layer

Each adapter returns a canonical envelope containing provider, source URL or provider event ID, fetched time, event time, sport, participants, market, price, and raw-record hash.

Initial order:

1. The Odds API for current and historical odds.
2. SportsDataIO or Sportradar for licensed lineups, injuries, rosters, results, and sport statistics.
3. Open-Meteo for MLB weather.
4. Public MLB and NHL APIs as labeled fallbacks, never disguised as licensed commercial feeds.
5. Tennis remains manual-only until schedule, surface, player, injury, and current-odds coverage is verified.

Provider keys remain server-side and are never returned to web or macOS clients.

### 5.3 Supabase backend

The dedicated project stores:

- `profiles`;
- `bankroll_accounts`;
- `source_captures`;
- `events`;
- `market_snapshots`;
- `model_runs`;
- `evaluations`;
- `evaluation_evidence`;
- `wagers`;
- `settlements`;
- `closing_lines`;
- `validation_gates`;
- `audit_events`.

All exposed tables use RLS. Authenticated users may access only records owned by their `auth.uid()`. Privileged ingestion uses server-side credentials only. No service-role or secret key is shipped to a browser or macOS application.

Evaluation and evidence records are append-only. Corrections create superseding records rather than silent mutation.

### 5.4 Deepnote research project

The Bear Edge Deepnote project contains separate notebooks for:

1. Data contract and quality audit.
2. Odds normalization and hold analysis.
3. Prospective CLV tracking.
4. Calibration and Brier/log-loss reporting.
5. Market-level backtests with walk-forward splits.
6. Bankroll and drawdown simulations.
7. Model comparison and promotion gates.

Notebooks read de-identified analytical views or exports. They do not own live verdict logic. A model version can be promoted only after passing temporal holdout, calibration, CLV, sample-size, and leakage checks.

Deepnote execution remains blocked until its OAuth connection is reauthenticated.

### 5.5 Web dashboard

Primary surfaces:

- Today: verified slate, market freshness, and ranked candidates.
- Intake: screenshot upload, OCR review, and provider match.
- Decision: evidence, probability, EV, risks, and stake explanation.
- Ledger: evaluations, wagers, settlements, closing lines, and CLV.
- Research: model versions, calibration, and backtest summaries.
- Readiness: providers, data quality, security, and validation gates.
- Settings: bankroll policy and provider status without secret disclosure.

The interface distinguishes `captured`, `verified`, `stale`, `simulated`, and `settled` visually and in accessible text.

### 5.6 Native macOS application

Use SwiftUI with a `WindowGroup`, `NavigationSplitView`, dedicated `Settings` scene, toolbar actions, keyboard commands, and native system materials.

Sidebar destinations mirror the web product: Today, Intake, Decisions, Ledger, Research, and Readiness. State is separated into models, stores, services, views, and support files. The macOS client does not embed provider secrets or duplicate betting math; it calls the authenticated service and presents evidence.

## 6. Data Flow

1. Provider response, screenshot, or manual entry creates a source capture.
2. Parsing produces canonical event and market candidates.
3. Reconciliation matches teams, participants, event time, market type, line, and price.
4. Verified snapshots become immutable decision inputs.
5. The Node engine creates an evaluation with engine version, model version, thresholds, evidence IDs, and verdict.
6. A real wager, if placed, references the evaluation and exact offered price.
7. Settlement and closing-line records are appended later.
8. Supabase analytical views feed Deepnote.
9. Deepnote produces research results and candidate model versions.
10. Promotion requires explicit evidence gates and a versioned engine change.

## 7. Validation and Accuracy

The existing three-win gate is retained only as an onboarding milestone, not proof of an edge. It must require a real `BET`, verified settlement, non-null closing odds, and complete pre-wager evidence.

Commercial or predictive claims require larger prospective samples and reports including:

- settlement coverage;
- average CLV and distribution;
- Brier score and log loss;
- calibration by probability bucket;
- ROI with confidence intervals;
- maximum drawdown;
- results by sport, market, odds band, and model version;
- comparison against closing-market probability;
- documented exclusions and missing-data rates.

No fixture, backfilled pick, or simulated trial counts toward these gates.

## 8. Error Handling

- Provider failure preserves the last-good snapshot but marks it stale.
- Failed reconciliation produces `WAIT` with human-readable reasons.
- OCR uncertainty is stored per field and requires review.
- Duplicate ingestion is prevented with source hashes and provider identifiers.
- Network writes use idempotency keys.
- Database failures do not fall back to unlogged real decisions.
- Secret-bearing errors are redacted before logging or returning responses.

## 9. Security

- Local service remains bound to `127.0.0.1` by default.
- Remote deployment requires HTTPS, authentication, rate limiting, encrypted secret storage, and a security review.
- Supabase uses publishable keys in clients and server-side secret keys only in trusted services.
- Every exposed table has RLS and ownership policies.
- Authorization never relies on user-editable metadata.
- Security-invoker views are used for exposed analytical views.
- Audit events capture authentication, ingestion, evaluation, wager, settlement, and administrative actions.

## 10. Testing

Required test layers:

- unit tests for math, parsing, reconciliation, freshness, staking, and gates;
- contract tests for every provider adapter;
- OCR fixtures using the five approved screenshots;
- API tests for authentication, ownership, idempotency, and redaction;
- Supabase migration and RLS tests;
- Deepnote notebook assertions for leakage and metric correctness;
- web accessibility and workflow tests;
- macOS build, service-mocking, and navigation tests;
- end-to-end paper-bet flow from capture through settlement and CLV.

CI must run on pull requests and pushes to the actual default branch, `master`.

## 11. Delivery Phases

### Phase 1: Integrity foundation

- Correct CI default-branch coverage.
- Correct the three-win/CLV enforcement mismatch.
- Add canonical evidence classes and screenshot fixtures.
- Reproduce release audit from a clean checkout.

### Phase 2: Dedicated backend

- Create the dedicated Supabase project after cost confirmation.
- Add schema, indexes, RLS, analytical views, and generated types.
- Connect the Node API with idempotent persistence.

### Phase 3: Real data and screenshot intake

- Build OCR review and canonical market reconciliation.
- Verify The Odds API coverage.
- Add historical closing-line capture.
- Keep unsupported sports and markets explicitly manual.

### Phase 4: Research laboratory

- Reauthenticate Deepnote.
- Create the Bear Edge project and notebooks.
- Connect de-identified Supabase analytical data.
- Establish calibration, CLV, walk-forward, and promotion reports.

### Phase 5: Product surfaces

- Rebuild the web workflow around verified evidence states.
- Build the SwiftUI macOS command center.
- Add authenticated end-to-end tests.

### Phase 6: Prospective validation

- Run paper mode first.
- Record immutable pre-wager evidence.
- Capture settlements and closing lines routinely.
- Publish model cards only when prospective evidence gates pass.

## 12. Acceptance Criteria

The first launch candidate is acceptable when:

- all CI checks pass on `master`;
- no secret or user data is exposed;
- screenshot ingestion preserves every visible field and uncertainty;
- no unverified screenshot can create an actionable `BET`;
- Supabase ownership and RLS tests pass;
- a paper wager can travel from verified market through settlement and CLV;
- Deepnote reproduces calibration and CLV metrics from the same immutable records;
- web and macOS clients display the same decision evidence;
- every recommendation explains price, probability, EV, stake, freshness, and blocking risks;
- readiness reports distinguish software readiness from provider and real-bet evidence gates.
