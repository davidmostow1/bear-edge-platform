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

Legacy records are counted but never converted into calibration evidence. Canonical version `2.0.0` evaluations must contain exact event, participant, market, side, line, two-way price, model probability, model identity, timestamps, and source digests.

## Final Closing-Line Evidence

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

## Promotion Boundary

`ready_for_report` means only that the dataset has enough structurally valid chronological evidence to attempt a calibration report. Production promotion still requires every threshold in `models/registry.json`, including minimum settled observations, reliability-bucket counts, settlement coverage, calibration error, calibration slope and intercept, baseline comparison, uncertainty intervals, and non-negative closing-line-value evidence.

No short winning streak, return-on-investment result, or manually selected sample can bypass those controls.
