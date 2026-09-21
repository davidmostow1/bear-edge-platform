# Model Evidence Completeness Requirements

## Current gap

Historical recommendation, transaction, and result records exist, but several supporting evidence tables were empty when inspected, including line snapshots, analytics inputs, registered model versions, and calibration runs.

This prevents the archive from proving:

- the exact model implementation used for a historical record
- the prediction-time feature values
- the exact displayed market information at the evidence cutoff
- reproducibility from frozen inputs
- closing-line comparison
- calibration by model version

## Required record separation

Keep these as distinct lifecycles:

1. model output or recommendation
2. later change or withdrawal
3. user-entered transaction record
4. outcome and settlement record
5. amendment or correction

One record type must never be silently inferred from another.

## Required model binding

Every future model output should bind:

- machine ID
- model version
- repository
- exact commit
- implementation digest
- feature-schema version
- model-artifact hash
- training-data cutoff
- prediction timestamp
- evidence cutoff
- source-evidence hashes

A free-text model label alone is incomplete evidence.

## Required market snapshot binding

Every recorded market observation should bind:

- platform
- event ID
- market family
- selection
- line
- displayed price
- capture timestamp
- source artifact hash
- availability status
- closing observation when available
- applicable settlement-rule version

DraftKings Predictions, Kalshi, and public sportsbooks remain separate systems with separate source and settlement semantics.

## Required analytics-input evidence

A frozen input record should contain or reference every feature supplied to the model, including null and unavailable values.

Required metadata:

- source name
- source record ID
- capture timestamp
- validity window
- raw-content hash
- normalized-content hash
- normalizer version
- missing-data flags
- manual-override record, if any

Later enrichment must not overwrite the original prediction-time input.

## Required calibration-run evidence

Every calibration run should bind:

- machine ID and version
- chronological training, calibration, and test windows
- included and excluded prediction IDs
- event-cluster key
- sample and distinct-event counts
- Brier score
- log loss
- calibration intercept and slope
- expected calibration error
- count-distribution metrics where applicable
- de-vigging method
- comparison-market source
- multiplicity handling
- review decision

Alternate lines from the same event do not create independent event samples.

## Identity normalization

Preserve raw identifiers exactly. Use a separate canonical mapping to resolve duplicates such as uppercase and lowercase KBO event IDs. Never overwrite the original source value.

## Fail-closed classification

A record missing exact model version, market timestamp, or source evidence should be labeled `INCOMPLETE_EVIDENCE`.

It may remain in historical records, but it should be excluded from:

- calibration claims
- closing-line-comparison claims
- model-version performance claims
- promotion decisions

## Current conclusion

The historical records are useful for audit continuity. Until these evidence layers are populated and reconciled, they do not independently establish predictive validity or market advantage.
