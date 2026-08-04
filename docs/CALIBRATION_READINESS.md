# Bear Edge Calibration Readiness

## Purpose

Bear Edge must evaluate the predictions it actually generated, including unsuccessful and unselected predictions. It must not calibrate only the recommendations displayed at the top of a ranked list. When verified odds are available, the best-target workflow therefore persists every exactly priced candidate in the calibration pool while returning only the requested display limit.

The calibration workflow does not promote a model automatically. It converts authoritative evidence into a deterministic dataset, reports every exclusion and unresolved blocker, and leaves model authority at `research_only` until the registered promotion policy passes.

## Run The Audit

```bash
npm run audit:calibration
```

The command reads the authoritative local ledger and writes:

- `data/reports/calibration_readiness.json`: complete machine-readable accounting, exclusions, blockers, and projected rows.
- `data/reports/calibration_readiness.md`: complete operator-readable accounting without abbreviated findings.
- `data/calibration/calibration_dataset.jsonl`: canonical eligible prediction rows for `npm run calibrate`.

Legacy records are counted but never converted into calibration evidence. Supported canonical version `2.0.0` and `2.1.0` evaluations must contain exact event, participant, market, side, line, two-way price, model probability, model identity, timestamps, and source digests.

## Wager Settlement Closing-Line Evidence

A win or loss remains unresolved for calibration until its settlement contains both closing prices and the following retained evidence:

```json
{
  "closingOdds": -125,
  "closingOppositeOdds": 105,
  "closingLineEvidence": {
    "sportsbook": "draftkings",
    "capturedAt": "2026-07-17T19:10:05.000Z",
    "marketClosedAt": "2026-07-17T19:10:00.000Z",
    "isFinal": true,
    "sourceLocator": "file:///retained-evidence/closing-line.png",
    "sourceDigest": "64-character-lowercase-sha256-digest"
  }
}
```

The closing sportsbook must match the originally offered sportsbook. `sourceDigest` must be the SHA-256 digest of the retained screenshot, provider response, or other genuine closing-line artifact. It must not be fabricated from manually typed odds. The capture time cannot precede the recorded market-close time.

Pushes and voids are explicitly excluded from binary calibration. Missing final closing evidence leaves the prediction in the dataset as unresolved, lowers settlement coverage, and blocks report readiness rather than silently inferring a close.

## Shadow Evaluation Evidence

Financial `settlement` records remain restricted to canonical `BET` evaluations. Grade an eligible `WAIT`, `PASS`, research, or shadow evaluation without fabricating a wager by appending both of these schema-version-2.1 records:

- `prediction_outcome`: official final event scores, observed market value, binary outcome or void, resolution time, official source identity, source time, capture time, retained-artifact digest, and correction lineage.
- `closing_price`: exact evaluated sportsbook, final market and opposite American odds, market-close time, provider source identity, source time, capture time, retained-artifact digest, and correction lineage.

The calibration projection resolves each history to its latest valid linear successor. It excludes the observation if either record is missing, malformed, branched, points to a different evaluation, has invalid chronology, or lacks required provenance. A shadow outcome and closing price do not add stake, profit, wager settlement, or betting authorization.

Use the authenticated dashboard's `Shadow Evidence` panel to inspect unresolved evaluations and append complete records, or call authenticated `POST /api/prediction-outcomes` and `POST /api/closing-prices` directly. `GET /api/evidence-queue` is a zero-credit authoritative-ledger read that shows missing evidence, latest correction identifiers, integrity blockers, and progress toward the registered minimum. Use `GET /schemas` for the exact contracts and `README.md` for complete request templates.

The panel never converts manual sportsbook screens, screenshots, public aggregators, optical-character-recognition output, or browser-extension output into verified provider evidence. Official outcomes require retained official artifacts. Closing prices require the exact evaluated sportsbook, both final prices, provider timestamps, and a retained provider artifact with its genuine SHA-256 digest. Migration `20260718010000_shadow_evidence_v21.sql` must be deployed before optional Supabase synchronization can project these record types; the local ledger remains authoritative.

Outcome-only diagnostics retain every settled forecast snapshot but do not count repeated evaluations of the same event, market, participant, side, line, and exact model version as independent metric observations. The earliest preregistered forecast is used, later snapshots remain visible as excluded repeats, and Brier score and log loss are reported separately for each exact market-family/model/version cohort. Aggregate scores are orientation only and cannot promote a model.

Each outcome-only report compares model loss with a fixed 50/50 binary forecast. Negative Brier-score and log-loss deltas favor the model, and Brier skill reports proportional improvement over that fixed diagnostic reference. This is a sanity check, not the required no-vig market promotion baseline.

Uncertainty uses a deterministic 95% percentile bootstrap with 2,000 resamples at the event-cluster level. All observations from the same event are resampled together so multiple correlated player or game markets are not treated as independent games. The report labels improvement conclusive only when the upper bounds of both paired model-minus-50/50 loss intervals are below zero. Fewer than two event clusters produces no interval and no conclusive claim. Even a conclusive diagnostic result cannot authorize promotion or a bet.

Registered promotion policy `1.2.0` first groups every prediction by `eventId`, represents each event as its complete prediction-time interval, and merges overlapping intervals into indivisible chronological blocks. A game therefore cannot cross training, calibration, and evaluation partitions, even when its predictions were captured at different times. The report records `event_atomic_prediction_interval_blocks`, the number of chronological blocks, and distinct-event counts for every partition.

The registry loader independently verifies the exact registered thresholds, validates the training and calibration split summaries, reconstructs every report-evidence digest from the report body, and requires `reportId` to be the SHA-256 content address of that evidence. A body-only rewrite or canonical re-sign after relabeling split, policy, lineage, partition, summary, evaluation, or data-quality evidence cannot satisfy the registry contract. A local administrator who can rewrite the report, every digest, and the registry pointers can still replace the evidence set; external signed roots or write-once retention remain required under adversarial-audit finding H-1.

The same policy applies event-cluster uncertainty to Brier score, logarithmic loss, calibration error, calibration slope and intercept, no-vig market comparison, closing-line value, and return on investment. A promotion report records `event_id` as its uncertainty cluster unit, must contain at least two distinct evaluation events to calculate uncertainty, and cannot pass promotion with fewer than 100 distinct settled events. This prevents a large number of correlated props from a small number of games from satisfying the sample requirement.

## Promotion Boundary

`ready_for_report` means only that the dataset has enough structurally valid chronological evidence to attempt a calibration report. Production promotion still requires every threshold in `models/registry.json`, including minimum settled observations, minimum distinct events, reliability-bucket counts, settlement coverage, calibration error, calibration slope and intercept, comparison with the matching no-vig market baseline, registered uncertainty intervals, and non-negative closing-line-value evidence.

No short winning streak, return-on-investment result, or manually selected sample can bypass those controls.
