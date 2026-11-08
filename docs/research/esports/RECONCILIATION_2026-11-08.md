# Esports branch reconciliation, phase 0 (2026-11-08)

**Status:** Research-only reconciliation, not an implementation merge, forecast validation, or source-rights approval.

**Issue:** #37. **Base:** `master@b25a3c67c9a7862196f31cf75f004abcdac0ccd0`.

## Ground truth inspected

| Artifact | Observed evidence | Decision |
| --- | --- | --- |
| `fix/esports-automatic-protocol-20260817@df95262bd8142f67e04401ca03343dc8293d0307` | `src/esports/index.js` declares `SUPPORTED_GAMES = ["CS2", "DOTA2", "LOL", "VALORANT"]`, common evidence gates and a shared stack model identifier. | **Do not wholesale merge**. Preserve reusable audit/provenance logic only after independent compatibility and permission-path review. |
| Same branch | `src/esports/series-projection.js` declares separate `dota_elo_series_v1` and `lol_elo_series_v1` model identifiers; `src/esports/dota-series-projection.js` exists. | Reconcile exact interfaces and tests before choosing a canonical implementation. Distinct IDs alone do not prove independent features, training or calibration. |
| Same branch | `docs/ESPORTS_ZERO_BS_OPERATIONS.md` states no esports tuple is validated and no independent game-specific projection generator is implemented in that slice. | Treat this as a documented limitation requiring code-to-doc reconciliation, not a validation certificate. |
| `p1-dota-source-contract-20260815@851b9d4981d657019a226d99845e46eb563e5d4a` | `docs/research/dota/DOTA_SOURCE_RIGHTS_REGISTER_2026-08-15.md` records zero approved real-corpus sources. | No ingestion or training corpus. Manual event/source discovery only, subject to review. |
| `master` | `AGENTS.md` mandates ground truth → one change → verify → log → next; research-only, price-check-only, $0 authorized stake, no execution. | Preserve existing authorization, money-path and canonical-ledger boundaries. |
| PR #36 | NBA shadow grader remains open/draft. | Do not modify or merge as part of esports reconciliation. |

## Explicit separation required

1. LoL: champion draft, lanes, Fearless Draft when applicable, patch and tournament rules, objectives, side, team/roster and game-format features.
2. Dota 2: hero draft, positions 1–5, economy, Roshan and objectives, patch, team/roster and game-format features.
3. Shared: provenance, identity, known-at/available-at chronology, exact settlement contract, quote freshness, independent-source lineage, immutable audit, and calibration reporting.
4. Keep independent model IDs, datasets, parameters, evaluation windows, and calibration reports. Do not infer calibration from source code, a test count, or a backtest.
5. The historical Dota source-rights register scopes only pre-match BO3 series winner. Expanding to live, draft-informed, player props, or other formats requires a separate source-rights and statistical review.

## Stop conditions before implementation import

- No real historical training ingestion without purpose-specific rights evidence and an approved source contract.
- No use of historical market snapshots as executable quotes; no inferred prices, order books, fees or settlement rules.
- No cross-game feature sharing by implicit defaults.
- No probability uplift by floors/priors when evidence is missing or observed support is zero.
- No production import or status promotion without exact-head tests, chronology/adversarial tests, source-rights review, and independent review.
- No authorization changes, real-money paths, stake changes, Supabase mutations, or canonical-ledger changes.

## Next one-file review action

Review `src/esports/series-projection.js` from the historical esports branch against the Dota-specific projection and existing registry contracts. Produce a precise function/interface comparison and adversarial test plan before any source code is copied into the canonical branch. Do not claim this reconciliation alone proves the engine's predictions.

## Questions for Claude

1. Independently compare `series-projection.js`, `dota-series-projection.js`, and `model-registry.js`: do any game-specific features or priors leak across LoL and Dota 2?
2. Verify whether the August source-rights register remains accurate against current, retained purpose-specific terms; do not infer permission from public access or open-source code licenses.
3. Inspect the actual evaluator call graph for any execution or authorized-stake path despite the `OPERATIONAL_BET_AUTHORITY_IMPLEMENTED = false` declaration.
4. Check that this change is documentation-only and that no model registry, money path, database migration, or existing application import was modified.

**Verification limit:** This record is based on connector-fetched repository artifacts and selected source files, not a full local checkout or a full CI run. No claim of production validation is made.
