# Sweet Bear Pitcher Strikeout Machine v1

## Canonical identity

- System owner: Sweet Bear
- Model ID: `mlb_pitcher_strikeout_joint_outing_v1`
- Model version: `1.0.0-research`
- Repository: `davidmostow1/bear-edge-platform`
- Branch: `codex/sweet-bear-pitcher-strikeout-machine-v1`
- Candidate commit: `a5b422bf0f98a10593bb5c52377d78ff28e456f0`
- Implementation status: `RESEARCH_ONLY_IMPLEMENTED_UNCALIBRATED`
- Reproduction status: `INDEPENDENT_CLEAN_CHECKOUT_PENDING`
- Validation status: `NOT_VALIDATED`
- Market-evaluation status: `NOT_MEASURED`
- Governance status: `RESEARCH_ONLY`
- `validatedModels`: `0`

## What is directly committed at the candidate commit

Independent GitHub inspection confirms that commit `a5b422bf0f98a10593bb5c52377d78ff28e456f0` directly adds these three repository paths:

- `sweet-bear-pitcher-strikeout-machine-v1/README.md`
- `sweet-bear-pitcher-strikeout-machine-v1/SHA256SUMS.txt`
- `sweet-bear-pitcher-strikeout-machine-v1/sweet-bear-pitcher-strikeout-machine-v1.tar.gz`

The modular source files, model, examples, tests, and standalone executable described below are contents of the committed source archive. They are not separately committed repository paths at this candidate commit.

## What the archived implementation is designed to do

The source archive contains an implemented research engine for MLB starting-pitcher strikeout count distributions. It sequentially simulates plate appearances against a supplied nine-man lineup, combines pitcher and batter strikeout skill against a league baseline using log5, applies times-through-order and context adjustments, draws one shared outing-quality term, simulates pitch consumption, updates a removal hazard after each batter, and accumulates one coherent pitcher strikeout PMF.

The archived implementation also includes count-line derivation with whole-line push handling, batch prediction, Statcast row preparation, model training, content-addressed research artifacts, examples, tests, and a standalone executable build.

## Expected contents of the committed source archive

The full package checksum inventory and standalone-source inspection identify these archive contents:

- `README.md`
- `bin/batch-predict.mjs`
- `bin/predict.mjs`
- `bin/prepare-statcast.mjs`
- `bin/train.mjs`
- `dist/sweet-bear-strikeout-machine.mjs`
- `dist/standalone-demo-output.json`
- `docs/superpowers/plans/2026-07-30-sweet-bear-pitcher-strikeout-machine-v1.md`
- `examples/demo-batch-output.json`
- `examples/demo-batch.json`
- `examples/demo-input.json`
- `examples/demo-output.json`
- `examples/prediction-input.template.json`
- `models/registry.json`
- `models/research-prior-v1.json`
- `package.json`
- `script/build-standalone.mjs`
- `src/artifact.mjs`
- `src/batch.mjs`
- `src/index.mjs`
- `src/io.mjs`
- `src/market.mjs`
- `src/math.mjs`
- `src/random.mjs`
- `src/simulator.mjs`
- `src/statcast.mjs`
- `src/trainer.mjs`
- `src/validation.mjs`
- `test/batch.test.mjs`
- `test/cli.test.mjs`
- `test/math.test.mjs`
- `test/simulator.test.mjs`
- `test/support.mjs`
- `test/training.test.mjs`

This list is package-content evidence. Independent extraction of the committed tarball and byte-for-byte comparison against the full File Library package remain pending.

## Checksum evidence: two distinct manifests

### Manifest A: commit-bound portable manifest

The candidate commit directly contains a portable, relative-path `SHA256SUMS.txt` with four entries:

- source archive: `48ec5c6642750df2e0eb7d1616b78aff520decd3c50c038430d89fdc4b03ba17`
- standalone executable: `c9f9563e7811aa3f827fc0ad68e9fa2a927f51ccc2af3631c2b3215a3eb28e77`
- research prior: `25d39aa2a3beda744cbd8b07fc7f0850538c9bd7f18831a3c5d1545bab026d3f`
- demo input: `47b734553265b7ab92d3846651341d287476e5e07adbf89d2adad5bcbda056b1`

This is the checksum manifest directly bound to commit `a5b422bf...`.

### Manifest B: full-package File Library inventory

A separate File Library artifact, `sweet-bear-strikeout-machine-v1.SHA256SUMS.txt`, inventories the expanded modular package. It contains many more paths and uses absolute builder-environment paths beginning with `/mnt/data/sweet-bear-pitcher-strikeout-machine-v1/`.

Selected entries include:

- package README: `89cce1c5f1996aa7b4b3c18fc72edfc6edc1db7dae079fee3a74a802ee173020`
- standalone executable: `c9f9563e7811aa3f827fc0ad68e9fa2a927f51ccc2af3631c2b3215a3eb28e77`
- demo input: `47b734553265b7ab92d3846651341d287476e5e07adbf89d2adad5bcbda056b1`
- demo output: `8335a9bdf6bb2603dc8b43f38e7db7ddd3ab2fc133c0bb4989bf88c6079d610b`
- package-local registry: `c066378e5472aaad1b87dc604068d8e391295b915d2168fefe57f512ac1fd488`
- research prior: `25d39aa2a3beda744cbd8b07fc7f0850538c9bd7f18831a3c5d1545bab026d3f`
- package.json: `191500030a152240a1b05db0f5ed706ef3198c5cf159e1028b1d7a64b2e3f023`
- simulator: `e7eb5a85635cf8526160bd51c6b56b087c1b73a6d1aecd34b7d112207fc945bd`
- market: `6adb20051ed73f768cf32710afaf34b5f9bd3032028d4be3f9193fb8453e2216`
- trainer: `c06241da5b3334e1e05019504e1a07d0af78d1aef17cc5e7b5b5858ad297f94c`
- Statcast normalizer: `82d25ed682965ce93cc553ea29e8da4975ec5cc45cb79557f762acda2600d6c7`
- simulator tests: `878e61536cc5f2a68e60acc0e1536bdef65ee982d6eca50ce5da6cbfb5b162bd`
- training tests: `1a5f1c233071020d6e821daed5ab1a358eb88e253ae54bf0adc31b8daf34a62d`

Manifest B is not directly portable without path rewriting. Its digest values are an expanded integrity inventory, but it is not itself proven to be the exact file committed as Manifest A.

## Builder-reported verification

The builder reported 16 passing tests with no failures, cancellations, or skips. The builder also reported a deterministic synthetic demonstration and a content-addressed output identifier.

These remain builder-reported results. They are not an independently reproduced clean-checkout verification. The synthetic demonstration is not evidence of real-world predictive validity.

## Independent audit status

- candidate commit existence and identity: independently confirmed
- directly committed path inventory: independently confirmed
- source archive digest recorded by commit-bound manifest: confirmed as a declared checksum entry
- source archive checksum independently recomputed: pending
- archive extraction integrity: pending
- expanded modular-file checksum recomputation: pending
- clean-checkout test reproduction: pending
- demonstration reproduction: pending
- modular versus standalone byte equivalence: pending
- calibration against real outcomes: absent
- comparison against timestamp-matched market data: absent

## Known audit risks

1. Prediction artifacts are content-frozen but pre-event existence is not externally time-bound.
2. `sourceEvidenceIds` may not bind actual evidence bytes.
3. Statcast preparation may label every pitcher-game final observed PA as a removal without distinguishing starter removal, complete games, natural endings, relievers, or truncated inputs.
4. Shared outing-state training may use whole-outing information when fitting earlier removal decisions.
5. The expanded File Library checksum inventory contains nonportable absolute builder paths.
6. The relationship between the commit-bound tarball and the separately preserved expanded File Library package has not been independently reproduced byte for byte.

## Governance boundary

This record remains research-only. Passing software tests proves only the tested software behavior. It does not prove calibration, predictive validity, market superiority, or production readiness.
