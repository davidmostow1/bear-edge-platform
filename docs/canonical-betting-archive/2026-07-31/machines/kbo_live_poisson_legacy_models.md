# KBO Live Poisson Legacy Models

## Purpose

Preserve the historical KBO model identities found in the operating betting ledger without pretending that their source code, parameters, training data, or validation evidence have been recovered.

## Known model identities

### `kbo-live-poisson-v0.1-shadow`

- System owner: Sweet Bear
- Sport: KBO baseball
- Market context: live-game prediction/recommendation history
- Lifecycle status: `LEGACY_SHADOW_MODEL_IDENTITY`
- Implementation status: `SOURCE_NOT_RECOVERED`
- Calibration status: `UNKNOWN`
- Validation status: `NOT_ESTABLISHED`
- Market-edge status: `NOT_ESTABLISHED`
- Authorization: `RESEARCH_HISTORY_ONLY`
- Authorized future stake: `0`

### `KBO-LIVE-POISSON-v0.2`

- System owner: Sweet Bear
- Sport: KBO baseball
- Market context: live-game prediction/recommendation history
- Lifecycle status: `LEGACY_MODEL_IDENTITY`
- Implementation status: `SOURCE_NOT_RECOVERED`
- Calibration status: `UNKNOWN`
- Validation status: `NOT_ESTABLISHED`
- Market-edge status: `NOT_ESTABLISHED`
- Authorization: `RESEARCH_HISTORY_ONLY`
- Authorized future stake: `0`

## Evidence currently available

The primary Airtable betting ledger contains recommendation, actual-wager, and settlement records carrying these model labels. The labels establish that the identities were used historically. They do not establish the exact implementation, formula, model parameters, input data, or reproducibility of either version.

Observed KBO event identifiers include case variants such as:

- `KBO-20260728-KT-NC`
- `kbo-2026-07-28-kt-nc`

These may represent the same underlying event. Event identity must be normalized before any model-level performance calculation.

## Missing evidence

The following are not currently recovered or verified:

- source repository
- branch and commit
- implementation files
- formula specification
- training dataset and cutoff
- feature schema
- model parameters
- prediction input schema
- market-price inputs
- line-snapshot timestamps
- test command and test transcript
- calibration report
- prospective freeze evidence
- promotion or retirement decision
- proof that v0.2 superseded v0.1

## Required reconciliation rule

No recommendation, wager, or settlement may be assigned to one of these models solely because it occurred during the same period. A record is model-attributable only when its own model/version field names the model or a preserved audit trail establishes the assignment.

Version labels must remain case-sensitive source values in the raw audit trail, while normalized reporting may map them to canonical IDs:

- raw `kbo-live-poisson-v0.1-shadow` -> canonical `kbo_live_poisson_v0_1_shadow`
- raw `KBO-LIVE-POISSON-v0.2` -> canonical `kbo_live_poisson_v0_2`

Raw values must never be overwritten.

## Supersession status

It is a reasonable inference that v0.2 may be later than v0.1-shadow. It is not established that v0.2 formally superseded v0.1, used the same implementation, or was better. Until source evidence is recovered, both remain separate legacy identities.

## Operational boundary

These records preserve historical attribution only. They are not active prediction machines and may not generate new recommendations, authorize stakes, or support profitability claims.
