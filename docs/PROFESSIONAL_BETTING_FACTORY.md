# Bear Edge Professional Betting Factory

## Purpose

This document is the human-readable operating contract for the 600-line source specification identified by SHA-256 `2263a4f1900c2a5458404daf0d1df9850e13045cf0b1e7c4dba7f005837381f5`. The complete atomic inventory is `governance/professional-betting-factory.requirements.json`; the executable verifier is `src/audit/professional-betting-factory.js`.

The source does not describe a guaranteed winning formula. It describes a factory for manufacturing small, evidence-backed decisions through multiple independent controls. Bear Edge therefore must not call itself predictively validated or commercially production-ready until the external data, settled-history, legal, capital, and operational blockers in the ledger are closed with retained evidence.

## Three Engines

### Market Consensus Engine

`src/live/market-intelligence.js` converts exact two-way offers to implied and no-vig probabilities, excludes unusable timestamps, calculates weighted consensus, measures dispersion and movement, and records sharp-book participation. `src/live/best-mlb-targets.js` now requests multiple books by default and selects the best fresh available price rather than a preferred first price.

The remaining market-engine gaps are historically learned sportsbook weights, a licensed minute-level movement archive, and provider-native suspension semantics.

### Independent Probability Engine

`src/live/candidates.js` and `src/live/estimate-prop.js` produce sport-specific research probabilities before market prices are attached. `src/live/probability-uncertainty.js` creates an observed-count 95 percent probability interval for MLB count candidates, and the decision layer uses its lower bound rather than the point estimate. `models/registry.json` keeps every current model in a governed market-family scope, and research-only status prevents those models from authorizing a qualified `BET`.

The remaining probability-engine gaps are licensed contextual features, sufficient real settled observations, and a production recalibration transform. The current interval is an explicitly labeled approximation based on recent observed counts; it is not a substitute for out-of-sample calibration evidence.

### Decision And Risk Engine

`src/live/best-mlb-targets.js` combines model and market evidence while preserving `fairEdge` and `priceEdge`. `src/live/price-discipline.js` calculates the minimum acceptable odds and explicit expiry. `src/risk/portfolio-risk.js` reconstructs current-day turnover and every unresolved cross-day position from the authoritative ledger, then separately caps daily, event, participant, market-family, and correlated risk. Final settlements close liability without erasing daily turnover; a valid amendment back to `pending` reopens it. `src/risk/drawdown-risk.js` reconstructs the same amended settlement history, computes equity high-water-mark drawdown and loss streaks, and reduces or halts staking under a registered policy. `src/live/recommendation-lifecycle.js` withdraws changed or expired offers and emits a complete structured alert. `src/audit/recommendation-service.js` records every gate and persists the result before it can be returned.

This engine remains decision support. It does not place wagers.

## Calibration Evidence Pipeline

`src/audit/recommendation-service.js` persists every exactly priced candidate used for calibration, not only the top selections returned to the dashboard. This prevents the ranked display limit from becoming a selection-biased historical sample. `src/calibration/ledger-projection.js` then converts canonical evaluations, settlements, and amendments into deterministic calibration rows. Legacy records and incomplete identities are excluded explicitly; final wins and losses remain unresolved unless same-sportsbook closing prices, finality, capture time, market-close time, source locator, and retained source digest are complete.

Run `npm run audit:calibration` to write the complete calibration-readiness JSON, Markdown, and JSON Lines outputs. This command audits evidence only. It cannot alter `models/registry.json` or promote a model. See `docs/CALIBRATION_READINESS.md` for the complete operator contract.

## Truthful Completion Semantics

`dispositionComplete` means every source facet has an atomic classification and evidence or blocker record. It does not mean every facet is implemented.

`localImplementationComplete` can be true only when no requirement remains `partial_local`.

`productionEvidenceComplete` can be true only when no requirement remains `blocked_external`.

`prohibited_by_design` means the behavior is intentionally forbidden and must not be implemented. These controls include automatic wagering, concealed identities, account sharing, line manipulation, unlicensed data, inside information, retrospective insertion, deleting losses, unproven win-rate advertising, betting every discrepancy, and optimizing only for historical return.

## Operator Rule

A recommendation is actionable only when the exact event, participant, market, side, line, sportsbook, price, and timestamps match; the price is fresh and at or better than the calculated minimum; the model has registered calibration authority; all evidence and portfolio gates pass; and the immutable local append succeeds. Otherwise the result must remain `PASS`, `WAIT`, or `PRICE_CHECK_ONLY` as applicable.

Set `BEAR_EDGE_STARTING_BANKROLL` to the equity baseline from which authoritative settlement profit should be accumulated. If it is absent, the request bankroll is used as the baseline. That fallback is suitable for local simulation but must be replaced with an operationally reconciled bankroll before production use.
