# Sweet Bear MLB Pitcher Strikeout Machine v1

This is a runnable probability engine, not another specification.

The source archive in this directory contains:

- `sweet-bear-strikeout-machine.mjs`, a zero-dependency Node.js 20+ executable
- `models/research-prior-v1.json`, the explicit research-only starting model
- `examples/demo-input.json`, an explicitly synthetic end-to-end input
- the complete operating README

## Install and verify the archive

```bash
mkdir sweet-bear-machine
cd sweet-bear-machine
tar -xzf ../sweet-bear-pitcher-strikeout-machine-v1.tar.gz
node --check sweet-bear-strikeout-machine.mjs
node sweet-bear-strikeout-machine.mjs predict \
  --input examples/demo-input.json \
  --model models/research-prior-v1.json \
  --output demo-output.json
```

## What it does

For each simulated start, the engine:

1. shrinks raw pitcher and batter strikeout rates with empirical-Bayes priors;
2. combines matchup rates using log5 odds ratios;
3. draws a shared outing state;
4. walks the confirmed nine-man batting order and times through order;
5. simulates strikeouts, non-strikeouts, pitch consumption, and damage;
6. updates cumulative pitches, batters faced, and removal hazard after every plate appearance;
7. returns one coherent strikeout-count PMF;
8. derives half-line and whole-line win, push, and loss probabilities from that PMF;
9. computes fair odds, expected value, and power-devigged market comparison when prices exist;
10. emits an immutable, content-addressed Sweet Bear research artifact.

The shared outing state enters both strikeout probability and removal hazard, so workload and strikeouts are not modeled independently.

## Commands

```text
node sweet-bear-strikeout-machine.mjs predict <arguments>
node sweet-bear-strikeout-machine.mjs batch <arguments>
node sweet-bear-strikeout-machine.mjs prepare-statcast <arguments>
node sweet-bear-strikeout-machine.mjs train <arguments>
```

## Verified local build

Before this commit, the complete modular source package passed its fresh verification command with 16 tests, 0 failures. The tests cover deterministic simulation, PMF coherence, workload sensitivity, skill sensitivity, whole-line pushes, batch fail-closed behavior, Statcast normalization, model training, immutable hashes, and CLI execution.

The included demo is synthetic. Passing tests proves that the declared mechanics run coherently. It does not establish calibration or market edge.

## Boundary

- Owner: Sweet Bear
- Authorization: `RESEARCH_ONLY`
- Validated models: `0`
- Authorized stake: `0`
- Direct Bear Edge registry or ledger writes: prohibited
- Bear Edge transfer: content-addressed research artifact only
- DraftKings Predictions: sole configured execution surface after validation
