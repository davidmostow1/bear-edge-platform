# Sweet Bear Pitcher Strikeout Machine v1

## Canonical identity

- System owner: Sweet Bear
- Model ID: `mlb_pitcher_strikeout_joint_outing_v1`
- Model version: `1.0.0-research`
- Repository: `davidmostow1/bear-edge-platform`
- Branch: `codex/sweet-bear-pitcher-strikeout-machine-v1`
- Candidate commit: `a5b422bf0f98a10593bb5c52377d78ff28e456f0`
- Implementation status: `RESEARCH_ONLY_IMPLEMENTED_UNCALIBRATED`
- Validation status: `NOT_VALIDATED`
- Market-edge status: `NOT_MEASURED`
- Execution authorization: `RESEARCH_ONLY_ZERO_STAKE`
- Authorized stake: `0`
- `validatedModels`: `0`

## What exists

The candidate is an implemented research engine for MLB starting-pitcher strikeout count distributions. It sequentially simulates plate appearances against a supplied nine-man lineup, combines pitcher and batter strikeout skill against a league baseline using log5, applies times-through-order and context adjustments, draws one shared outing-quality term, simulates pitch consumption, updates a removal hazard after each batter, and accumulates one coherent pitcher strikeout PMF.

The implementation also includes count-line pricing with whole-line push handling, batch prediction, Statcast row preparation, model training, immutable content-addressed research artifacts, examples, tests, and a standalone executable build.

## Canonical implementation files at the candidate branch

- `sweet-bear-pitcher-strikeout-machine-v1/src/math.mjs`
- `sweet-bear-pitcher-strikeout-machine-v1/src/random.mjs`
- `sweet-bear-pitcher-strikeout-machine-v1/src/simulator.mjs`
- `sweet-bear-pitcher-strikeout-machine-v1/src/trainer.mjs`
- `sweet-bear-pitcher-strikeout-machine-v1/src/statcast.mjs`
- `sweet-bear-pitcher-strikeout-machine-v1/src/market.mjs`
- `sweet-bear-pitcher-strikeout-machine-v1/src/artifact.mjs`
- `sweet-bear-pitcher-strikeout-machine-v1/src/batch.mjs`
- `sweet-bear-pitcher-strikeout-machine-v1/src/index.mjs`
- `sweet-bear-pitcher-strikeout-machine-v1/src/io.mjs`
- `sweet-bear-pitcher-strikeout-machine-v1/dist/sweet-bear-strikeout-machine.mjs`
- `sweet-bear-pitcher-strikeout-machine-v1/models/research-prior-v1.json`
- `sweet-bear-pitcher-strikeout-machine-v1/models/registry.json`
- `sweet-bear-pitcher-strikeout-machine-v1/examples/demo-input.json`
- `sweet-bear-pitcher-strikeout-machine-v1/examples/demo-output.json`
- `sweet-bear-pitcher-strikeout-machine-v1/examples/demo-batch.json`
- `sweet-bear-pitcher-strikeout-machine-v1/examples/demo-batch-output.json`
- `sweet-bear-pitcher-strikeout-machine-v1/test/simulator.test.mjs`
- `sweet-bear-pitcher-strikeout-machine-v1/test/math.test.mjs`
- `sweet-bear-pitcher-strikeout-machine-v1/test/cli.test.mjs`
- `sweet-bear-pitcher-strikeout-machine-v1/test/batch.test.mjs`
- `sweet-bear-pitcher-strikeout-machine-v1/test/training.test.mjs`
- `sweet-bear-pitcher-strikeout-machine-v1/test/support.mjs`

## Recorded SHA-256 evidence

The preserved checksum manifest records, among others:

- `README.md`: `89cce1c5f1996aa7b4b3c18fc72edfc6edc1db7dae079fee3a74a802ee173020`
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

The historical checksum manifest uses absolute `/mnt/data/...` paths and is therefore not directly portable without path rewriting. The digest values remain useful as an integrity inventory.

## Builder-reported verification

The builder reported:

- 16 tests passed
- 0 failed
- 0 cancelled
- 0 skipped

The builder also reported a deterministic 100,000-iteration synthetic demonstration with:

- mean strikeouts: `5.85232`
- strikeout SD: `2.28829`
- mean batters faced: `25.00688`
- mean pitches: `90.33058`
- `P(Over 5.5)`: `53.817%`
- fair American price: `-117`
- EV at offered `-115`: `+0.614%`
- reported prediction artifact: `sha256:0a2d0787cb61cee9eae3eab0c94e8a1149c8e468357b07b43e0dd8b07ce7ba8a`

These are builder-reported results, not an independently reproduced clean-checkout verification. The synthetic EV is demonstration-only, not a forecast or evidence of market edge.

## Independent audit status

Current independent status:

- source implementation presence: supported
- exact candidate commit identity: recorded in GitHub history
- clean-checkout reproduction: pending
- checksum recomputation for every package file: pending
- test reproduction: pending
- demonstration reproduction: pending
- modular versus standalone byte equivalence: pending
- calibration against real outcomes: absent
- comparison against timestamp-matched market prices: absent

## Known audit risks

1. Prediction artifacts are content-frozen but pre-event existence is not externally time-bound.
2. `sourceEvidenceIds` may not bind actual evidence bytes.
3. Statcast preparation may label every pitcher-game final observed PA as a removal without distinguishing starter removal, complete games, natural endings, relievers, or truncated inputs.
4. Shared outing-state training may use whole-outing information when fitting earlier removal decisions.
5. The checksum manifest contains nonportable absolute builder paths.

## Operational boundary

This machine may produce research probabilities and immutable research artifacts. It may not authorize recommendations, stakes, wagers, registry promotion, or direct Bear Edge ledger writes.

Passing software tests proves only the tested software behavior. It does not prove calibration, predictive validity, profitability, market superiority, or safe wagering authority.
