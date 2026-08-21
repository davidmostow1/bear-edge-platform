# `sweetbear-edge` Statistical Validation Substrate

## Classification

- artifact class: `VALIDATION_SUBSTRATE_ONLY`
- sport-specific prediction model: `NO`
- implementation status: `IMPLEMENTED_PACKAGE_REPORTED`
- market validation status: `NOT_MARKET_VALIDATED`
- authorization: `RESEARCH_ONLY`
- authorized stake: `0`

## What it is

A Python statistical package intended to judge prediction models. It includes:

- American-odds conversion
- multiplicative, power, and Shin de-vigging
- Platt and isotonic calibration
- reliability curves
- Brier decomposition
- Kelly staking calculations
- walk-forward backtesting
- correlation-aware significance testing
- cluster-robust inference
- wild-cluster bootstrap logic
- longshot and effective-cluster safeguards

## What it is not

The package explicitly states that it contains no sport-specific model. It does not implement:

- an MLB model
- a pitcher model
- a batter model
- a game-line model

It is the statistical court where those models would be judged, not another contestant.

## Reported executable checks

Documented commands:

```bash
pip install -e ".[dev]"
pytest -q
python validation/coverage_audit.py
python validation/longshot_audit.py
```

Reported unit-test count: 131.

## Key falsifiable claims recorded by the package

- Naive inference can report false significance at extreme rates when bets are correlated.
- Naive 95% intervals can have severe undercoverage under clustered outcomes.
- Under the package's even-money assumptions, detecting a 3% edge may require roughly 8,700 two-sided bets or 6,900 one-sided bets for 80% power.
- A 500-bet sample cannot reliably resolve small edges under those assumptions.
- Plain CR1 standard errors can remain overconfident in longshot markets with few effective clusters.
- A wild-cluster bootstrap plus effective-cluster gate is proposed as a repair.
- At 300 correlated games, a 5% edge may have very low detection power.

These are simulation-based claims tied to the package's assumptions and code. They are not universal betting laws and are not market-validation results.

## Known limitations recorded by the package

- zero-variance samples return a conservative non-rejection
- the effective-cluster threshold of 12 is judgmental
- estimated intracluster correlation can be slightly negative under sampling noise
- caller-supplied cluster labels can be wrong
- multiple-testing deflation is intentionally blunt
- all claims are simulation-validated rather than tested against real closing lines and settlements

## Promotion requirements implied by the package

Before model results touch money:

1. a sport model must exist as executable tested code
2. alternate-line ladders must share correlation groups
3. model probabilities must be compared against de-vigged market probabilities
4. promotion should use prospective market evidence, not backtested profit alone
5. searched model variants must be counted and multiplicity handled

## Missing canonical binding

Still required:

- exact repository full name
- branch
- exact commit
- dependency lock
- complete tracked-file list
- clean-checkout environment
- full `pytest -q` transcript
- raw `coverage_audit.py` output
- raw `longshot_audit.py` output
- independently recomputed reported simulation values

## Operational boundary

This package may define evaluation standards and calculate research diagnostics. It may not be cited as proof that Sweet Bear, Bear Edge, or any other model is profitable, calibrated, superior, or authorized for wagering.
