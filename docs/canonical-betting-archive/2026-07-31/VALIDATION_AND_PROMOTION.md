# Validation and Promotion Standard

## Current verdict

No inspected prediction lineage has enough complete prospective evidence to authorize a profitability claim or production model promotion.

## Required evaluation

- Train on past data.
- Calibrate on later data.
- Test on still later data.
- Use walk-forward or expanding-window evaluation.
- Group correlated observations by event, series, game, market ladder, or shared outcome as appropriate.
- Compare against executable, timestamp-matched market baselines.
- Preserve excluded observations and missingness reasons.
- Never optimize thresholds on the final test set.

## Primary metrics

- Brier score
- Log loss
- Calibration intercept
- Calibration slope
- Expected calibration error
- Reliability bands with counts and uncertainty
- Difference versus market Brier and log loss
- Prospective CLV, with its limitations declared
- Fill-adjusted economic simulation
- Maximum drawdown and exposure concentration

Accuracy and raw win rate are secondary.

## Promotion gates

A model cannot be promoted until all of the following are predeclared and passed:

1. Model, version, commit, and artifact identity.
2. Complete eligible data contract.
3. Minimum observation and effective-cluster counts based on power analysis.
4. Calibration thresholds.
5. Improvement versus the matching market baseline with uncertainty.
6. No material leakage or hindsight.
7. Stable results across chronological periods and relevant regimes.
8. Realistic fees, liquidity, slippage, and partial-fill assumptions.
9. Independent calculation verification.
10. Written approval and rollback plan.

## Interpretation of current checkpoints

- The 1,000-batter history gate is a data-completeness control for the failed build and must not be weakened merely to make CI pass.
- A 500-paired-prediction showdown gate can support a formal review, but is not automatically powered for small edges.
- Unit tests prove software behavior, not market profitability.
- Backtest ROI without prospective timestamps and market baselines is not promotion evidence.
- A small batch of settled wagers is operational evidence, not validation.
