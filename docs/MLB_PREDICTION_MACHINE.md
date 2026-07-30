# Sweet Bear Unified MLB Prediction Machine

This repository contains an executable, research-only probability engine for pitcher props, batter props, game lines, first-five markets, and alternate lines. It does not claim a validated betting edge: `validatedModels` remains `0`, every output is `RESEARCH_ONLY`, and authorized stake is `$0`.

## Run a complete game prediction

```bash
npm run mlb:predict -- --input examples/mlb-unified-input.json --output data/mlb-prediction.json
```

The output includes:

- Pitcher PMFs for strikeouts, outs, hits allowed, walks, and earned runs.
- Batter PMFs for hits, total bases, home runs, strikeouts, walks, singles, doubles, triples, runs, and RBIs.
- Full-game and first-five moneylines, run lines, totals, team totals, and alternate lines.
- Whole-number push probabilities.
- A SHA-256 digest of the exact input.

Every market is derived from a coherent underlying count or score distribution rather than a separate threshold classifier.

## Build the 2024–2025 history library

```bash
npm run mlb:history -- --seasons 2024,2025 --output-dir data/history/mlb --concurrency 6
```

The resumable builder uses the free MLB Stats API, checkpoints each game atomically, preserves source SHA-256 values, and rebuilds normalized `games.jsonl`, `batting.jsonl`, and `pitching.jsonl` tables without duplicate rows. The GitHub Actions workflow can produce the full two-season library as a downloadable build artifact so large generated data does not pollute Git history.

## Scientific status

The software executes and is covered by deterministic and fixture-based tests. Predictive parameters are still research priors until trained and evaluated with strict out-of-time, point-in-time-safe data and compared prospectively against devigged market prices.
