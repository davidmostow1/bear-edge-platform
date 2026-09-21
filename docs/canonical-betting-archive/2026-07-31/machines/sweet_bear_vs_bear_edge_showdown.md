# Sweet Bear vs Bear Edge Showdown

## Canonical purpose

Compare Sweet Bear and Bear Edge head-to-head on identical MLB player-prop predictions using proper scoring rules and event-clustered inference.

## Comparison law

A prediction pair is eligible only when both models independently predicted the exact same:

- event
- market
- line
- selection
- evidence cutoff

Primary metric: mean Brier score, lower is better.

Secondary diagnostics:

- mean log loss
- classification accuracy
- devigged market baseline
- closing-line value where valid closing observations exist

The documented winner gate requires all three:

1. at least 500 paired settled predictions
2. at least 100 distinct MLB events
3. event-clustered 95% bootstrap interval for paired Brier difference excludes zero

The 500-prediction threshold is a governance floor, not universal proof of superiority.

## Historical correction

The first Showdown documents were specifications rather than evidence of working code. Inspection found no `compare` script, no Showdown strings, and no expected reports/data directories in the initially inspected repository state. Later work reported that the harness was implemented. This history must remain visible so documents do not certify themselves.

## Reported implemented components

Reported source modules under `src/showdown/`:

- `records.js`: immutable prediction/outcome JSONL parsing and chronology validation
- `pairing.js`: exact pairing, settlement joins, exclusion reasons, missingness summaries
- `compare.js`: scoring, paired Brier deltas, event-clustered bootstrap, promotion gate
- `market-baseline.js`: devigged market as a third model and CLV
- `report.js`: Markdown report rendering
- `snapshot-store.js`: immutable content-addressed paid-response store
- `credit-budget.js`: hard monthly provider-credit ceiling and append-only ledger
- `ingest-props.js`: free slate enumeration and selected-game strikeout ingestion

Reported CLI surfaces:

- `npm run compare`
- `npm run ingest:props`
- `npm run budget`

## Reported verification

The later handoff reports:

- 658 tests passed, 0 failed
- typecheck clean
- end-to-end day-zero report reproduction
- synthetic 600-prediction / 120-event gate verification
- no real provider credits spent during tests

These remain reported results until the exact repository, branch, commit, clean checkout, and complete test transcript are independently bound.

## Current canonical status

- implementation status: `IMPLEMENTATION_REPORTED_SOURCE_BINDING_PENDING`
- clean-checkout reproduction: `PENDING`
- paired real predictions: reported as `0` at handoff time
- predictive winner: `NONE`
- calibration claim: `NONE`
- market-edge claim: `NONE`
- authorization: `RESEARCH_ONLY`
- authorized stake: `0`

## Exact source binding still required

The handoff names a local project context related to `betting-decision-engine`, but the canonical remote repository, branch, commit, and tree have not been reconciled into this archive.

Required evidence:

- repository full name
- branch
- exact 40-character commit
- complete tracked-file inventory
- source-tree hashes
- `package.json` scripts
- full test transcript
- typecheck transcript
- synthetic fixture hashes
- sample prediction/outcome/market JSONL schemas
- immutable snapshot-store location
- credit-ledger location and current balance

## Operating boundary

The Showdown judges models; it does not create betting authority. A provisional leader is diagnostic only. No winner, recommendation, stake, or promotion may be inferred before the declared gate and independent review are satisfied.
