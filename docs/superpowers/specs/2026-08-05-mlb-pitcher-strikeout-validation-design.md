# MLB Pitcher Strikeout Validation Design

Date: 2026-08-05
Status: Approved scope, design awaiting final user review
Repository: `davidmostow1/bear-edge-platform`
Branch: `design/mlb-pitcher-strikeout-validation`

## 1. Purpose

Build one narrow, reproducible MLB pitcher-strikeout pipeline that can eventually produce a prospectively validated and calibrated probability tied to an exact pregame market price.

The first production slice covers only:

- MLB starting pitchers
- Pregame pitcher strikeout over/under markets
- Exact half-strikeout lines such as 4.5, 5.5, or 6.5
- Single selections only
- One exact price source captured with both sides and a timestamp
- Manual execution only after every authorization gate passes

This work does not promise immediate betting authorization. It creates the evidence required to decide whether authorization is justified.

## 2. Non-goals

The first slice excludes:

- Live betting
- Alternate strikeout ladders such as 5+ or 6+
- Pitcher outs recorded
- Batter props
- Game lines
- Parlays and combinations
- Automated account access or wager placement
- Market price as a predictive feature
- Artificial intelligence language models inside the statistical engine
- League of Legends, tennis, cricket, soccer, or other sports

## 3. Existing project context

The repository already contains:

- American-odds conversion
- Implied and no-vig probability calculations
- Expected-value and Kelly calculations
- Capped stake sizing
- A Poisson count-probability implementation
- Official MLB schedule and player-stat ingestion
- Manual sportsbook-price intake
- JSONL decision and settlement logging
- A Node 20 verification command: `npm run verify`

The current pitcher-strikeout logic is not sufficient for promotion because:

- It blends season and recent per-game rates without a full workload or opponent model.
- It can shrink its probability toward the market, so the output is not fully independent of price.
- It has no registered calibration report.
- It has no uncertainty interval.
- It has no completed prospective prediction history.
- It is marked `research_only` in the model registry.

The existing Poisson model remains a baseline challenger. It will not be silently relabeled as validated.

## 4. Approaches considered

### Approach A: Keep the current Poisson heuristic and add thresholds

Advantages:

- Fastest implementation
- Minimal code change
- Easy to explain

Disadvantages:

- Assumes a count distribution that may understate variance
- Does not model pitcher workload separately
- Does not adequately account for opponent lineup composition
- Would create a cosmetic validation layer around an incomplete probability model

Decision: rejected as the promoted model. Retained as a transparent baseline.

### Approach B: Direct binary classifier for over or under

Train a classifier separately for every posted line.

Advantages:

- Directly optimizes the market decision
- Can incorporate nonlinear interactions

Disadvantages:

- Fragments the data by line
- Produces inconsistent probabilities across adjacent lines
- Makes alternate thresholds difficult to reconcile
- Is more vulnerable to overfitting and silent leakage

Decision: rejected for the first promoted model.

### Approach C: Two-stage probabilistic count model

Model expected pitcher opportunity first, then strikeout probability per batter faced, and combine them into a full strikeout distribution.

Advantages:

- Matches the baseball process
- Separates workload from strikeout skill
- Produces coherent probabilities for every half-strikeout line
- Supports uncertainty propagation
- Is interpretable and easier to audit

Disadvantages:

- Requires more data engineering
- Requires careful handling of probable pitchers, lineups, and timestamps

Decision: recommended and approved for design.

## 5. Architecture

The system is divided into seven isolated components.

### 5.1 Historical data builder

Build one immutable pitcher-start dataset. Each row represents one starting-pitcher appearance and contains only information available before first pitch.

Required sources:

- Official MLB schedule and game identifiers
- Official probable and actual starting pitchers
- Official box scores and pitcher game logs
- Official roster and lineup data when available
- Baseball Savant or another documented pitch-level source for swinging-strike and pitch-quality features when legally and technically available

Every source record must include:

- Source URL or endpoint
- Fetch timestamp
- Event timestamp
- Source-specific entity identifier
- Raw-payload digest
- Parser version

Historical outcomes include:

- Strikeouts
- Batters faced
- Outs recorded
- Pitch count
- Innings pitched

Outcome fields must never be present in the feature snapshot used for the same game.

### 5.2 Feature snapshot builder

Create a pregame feature snapshot for each pitcher start.

Core pitcher features:

- Season strikeouts per batter faced
- Rolling 3, 5, and 10 start strikeout rates
- Rolling batters faced, outs, and pitch counts
- Days of rest
- Pitcher handedness
- Recent velocity or swinging-strike indicators when available
- Home or away context

Core opponent features:

- Confirmed lineup when available
- Expected lineup only for shadow predictions, never for authorized BET decisions
- Batter strikeout rates versus pitcher handedness
- Lineup-weighted strikeout propensity
- Team rolling strikeout rate
- Number of confirmed starting batters

Context features:

- Park identifier
- Scheduled start time
- Weather and umpire only when a timestamped, verified source is available
- Market line is excluded from model features
- Market price is excluded from model features

Missing critical features create a failed feature snapshot, not silent imputation. Noncritical missing values use a documented training-set imputation rule plus a missingness indicator.

### 5.3 Independent probability model

The promoted candidate is a two-stage model:

1. Opportunity model predicts the distribution of batters faced.
2. Strikeout-rate model predicts the probability of a strikeout for each expected batter faced.
3. The two distributions are combined to generate a full predictive distribution for total strikeouts.

Recommended implementation:

- Python for training, walk-forward validation, calibration, and artifact export
- JSON model artifact with coefficients, transforms, feature schema, calibrator, and digests
- Node inference adapter for the existing Bear Edge runtime

The model must produce:

- Raw probability for over and under at the exact line
- Expected strikeout count
- Predictive variance
- Central uncertainty interval
- Model version
- Feature-schema version
- Training-data cutoff
- Artifact digest

The model output is frozen before the market-price comparison.

### 5.4 Calibration layer

Calibration uses only chronologically later data than model fitting.

The default calibrator is beta calibration. Isotonic regression is retained as a challenger when the calibration sample is large enough.

Calibration is evaluated with:

- Brier score
- Log loss
- Calibration intercept
- Calibration slope
- Reliability bins
- Expected calibration error
- Maximum calibration error

The calibrator must be fitted without market odds. Market probabilities are a benchmark, not a calibration target for the independent model.

### 5.5 Exact market quote capture

Every evaluated market requires one immutable quote record containing:

- Book or prediction-market product
- Exact event identifier
- Exact pitcher identifier
- Exact line
- Over price
- Under price
- Capture timestamp
- Scheduled first pitch
- Quote age
- Market status
- Source screenshot or payload digest
- Contract or house-rule version
- Fee model when applicable

A quote is rejected when:

- Only one side is visible
- The line does not exactly match the model evaluation
- Product identity is ambiguous
- Event or pitcher identity is ambiguous
- The quote is stale
- The game has started
- The market is suspended
- Settlement rules cannot be established

The prediction record is created before attaching the market quote. This preserves independence and prevents accidental price leakage.

### 5.6 Decision gate

A candidate may receive `BET` only when every gate passes.

Identity gates:

- Event, pitcher, opponent, and market family match exactly
- Pitcher is confirmed as the starter
- Confirmed lineup satisfies the configured completeness rule

Model gates:

- Model status is `validated`
- Model artifact and calibration digests match the registry
- Feature schema matches the model artifact
- All critical inputs are fresh
- The selected-side probability has a valid uncertainty interval

Price gates:

- Two-sided quote captured
- Quote age is no more than 10 minutes and no older than any critical lineup update
- Conservative selected-side probability exceeds raw break-even by at least 4 percentage points
- Conservative expected ROI is at least 5 percent after fees and modeled slippage
- Price is at or better than the model's maximum acceptable price

Risk gates:

- Single only
- No duplicate pitcher exposure
- No more than one active pitcher-strikeout position per game
- No chase sizing
- Manual execution only
- Portfolio and daily-loss limits must be configured before dollar recommendations are enabled

The conservative decision probability is the lower bound of the selected side's uncertainty interval. This deliberately makes promotion difficult.

### 5.7 Append-only evidence journal

Create immutable events for:

- HistoricalDataBuilt
- FeatureSnapshotBuilt
- ModelTrained
- CalibrationCompleted
- ModelRegistered
- MarketQuoteCaptured
- PredictionGenerated
- RecommendationQualified
- RecommendationRevised
- RecommendationWithdrawn
- ActualWagerRecorded
- ClosingPriceCaptured
- SettlementRecorded
- AuditEvent

Local JSONL remains the write-ahead journal. Supabase is the durable append-only projection. MotherDuck is the analytical mirror. No historical prediction or recommendation is overwritten.

## 6. Validation protocol

Validation has three distinct stages.

### Stage A: Historical walk-forward validation

Use rolling-origin splits. For every test date, all training and calibration data must precede that date.

Minimum historical requirements:

- At least 1,000 eligible starting-pitcher appearances across multiple seasons
- At least 200 test appearances in the final untouched holdout
- No pitcher-start row may appear in more than one split
- Feature computation must be reproducible from source data and cutoff timestamp

Promotion from historical development to prospective shadow requires:

- Better Brier score and log loss than the existing Poisson baseline
- Calibration slope between 0.85 and 1.15
- Absolute calibration intercept no greater than 0.05
- Expected calibration error no greater than 0.04
- No material degradation in high and low probability bins
- All bootstrap confidence intervals and metric definitions included in the report

Failure of any threshold keeps the model in `research_only`.

### Stage B: Prospective shadow validation

The model runs before first pitch and records predictions and exact quotes without recommending wagers.

Minimum shadow sample:

- 50 settled exact-line predictions
- At least 20 predictions that would have cleared the proposed price gate
- At least 14 calendar days
- Closing prices captured for at least 90 percent of records

Required evidence:

- Prospective Brier score and log loss
- Calibration table
- Mean closing-line value
- Price-qualified expected ROI
- Realized ROI with bootstrap interval
- Withdrawal and revision counts
- Source-freshness failure rate

The model may move to limited authorization only when:

- No severe calibration failure appears
- Mean closing-line value is positive
- The qualifying policy remains positive under conservative probability stress
- The complete report and model artifact are registered with digests

### Stage C: Limited authorization

Initial authorized recommendations use:

- Maximum 0.25 percent of bankroll per selection
- Maximum 0.75 percent total open exposure
- Maximum 1 percent daily loss limit
- Singles only

With a $1,000 bankroll, the initial maximum is $2.50 per verified selection. This is a validation stake, not a normal staking level.

Expansion to a 0.5 percent or 1 percent cap requires a later governance decision based on at least 100 settled qualified recommendations, sustained calibration, and positive closing-line value.

## 7. Testing strategy

### Unit tests

- Odds and break-even calculations
- Count-distribution probabilities
- Feature cutoff enforcement
- Missing-data gates
- Quote freshness
- Maximum acceptable price
- Uncertainty-bound selection
- Artifact and digest verification

### Data tests

- Unique game and pitcher-start keys
- No postgame fields in feature snapshots
- No future timestamps in rolling features
- Confirmed starter and lineup identity
- Reproducible raw-payload digests
- Stable feature schema

### Model tests

- Walk-forward split integrity
- Baseline comparison
- Calibration metrics
- Bootstrap interval reproducibility
- Probability monotonicity across adjacent strikeout lines
- Over and under probabilities sum to one for half-lines

### Integration tests

- Historical row to prediction artifact
- Prediction frozen before quote attachment
- Quote to decision result
- Decision to JSONL and Supabase projection
- Closing quote and settlement append without mutation

### Verification command

`npm run verify` remains the project-wide command. A separate deterministic model-validation command will produce the calibration report and artifact digests, then be called by the project verification workflow when model artifacts change.

## 8. Failure handling

The system fails closed.

Examples:

- Unconfirmed starter: `WAIT`
- Incomplete confirmed lineup: `WAIT`
- Stale quote: `WAIT`
- Missing opposite price: `PASS`
- Model or schema digest mismatch: `PASS`
- Calibration report absent or expired: `PASS`
- Game started: `PASS`
- Data-source outage: `WAIT` or `PASS`, depending on whether the last valid snapshot remains within policy

No fallback model may silently replace the registered model.

## 9. Success criteria

The first slice is complete when:

1. A reproducible historical pitcher-start dataset exists.
2. The independent two-stage model and Poisson baseline can be trained and compared.
3. Walk-forward and untouched-holdout reports are generated.
4. Calibration and uncertainty artifacts are registered with digests.
5. Exact two-sided market quotes can be attached after prediction generation.
6. Prospective predictions and settlements append without mutation.
7. The system can truthfully issue `BET`, `LEAN`, `WAIT`, or `PASS` from locked gates.
8. Dollar staking remains disabled until Stage C and a configured risk policy.
9. No automated wager placement is implemented.

## 10. Recommended implementation sequence

1. Freeze schemas and event contracts.
2. Build the historical dataset with leakage tests.
3. Reproduce the current Poisson baseline.
4. Train the two-stage count model.
5. Add walk-forward validation and calibration.
6. Export and register immutable model artifacts.
7. Implement pre-price prediction freezing.
8. Implement exact quote attachment and decision gates.
9. Begin prospective shadow collection.
10. Produce the promotion report after the minimum sample is reached.

Implementation must not begin until this design is reviewed and approved.