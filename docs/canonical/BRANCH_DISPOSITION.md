# Bear Edge branch disposition

- **Decision date:** 2026-08-12
- **Recovery baseline:** `5f284eb8cf66050f06601087ef04a267441f1958`
- **Canonicalization branch:** `codex/bear-edge-canonicalize-20260812`

SAFETY_INVARIANT: authorization is RESEARCH_ONLY; authorized stake is $0; execution is disabled.

Branch names are labels, not authority. Disposition is based on ancestry, exact tree contents, current checks, and scope.

## Active disposition

| Ref or lane | Exact observed state | Disposition | Reason |
|---|---|---|---|
| `master` | `738b3e462dd1e46264240006f72a843a04cc17cf` | `FREEZE_AS_DEFAULT_ONLY` | Older implementation surface; its current Python and Deno workflows fail. PR #17 already incorporates this commit. |
| `reconcile/bear-edge-canonical-v1` | `8f0d6cb7052db8ee3d6b29dc5994100956b09766` | `SUPERSEDED_INTEGRATION_BASELINE` | Green and useful, but diverged from the fuller recovery head: 1 commit ahead and 27 behind. It also lacks the promised canonical documents. |
| PR #17 / `codex/pitcher-strikeout-complete-data-research` | `5f284eb8cf66050f06601087ef04a267441f1958` | `IMMUTABLE_RECOVERY_BASELINE` | Incorporates `master`, has the fullest recovered tree, and passed 728/728 in GitHub CI. Still draft, research-only, and not a release. |
| `codex/reconcile-pr17-master` | same `5f284eb8…` | `DUPLICATE_POINTER` | Byte-identical branch head; preserve lineage, then archive after consolidation. |
| `codex/bear-edge-canonicalize-20260812` | aggregate candidate content from `5f284eb8…` | `CANONICALIZATION_CANDIDATE` | Contains four separately committed recovery concerns in one consolidation PR. It is not canonical until exact-SHA clean-checkout verification, remote CI, review, and selection. |
| PR #19 / `codex/fix-unified-mlb-history-integrity` | `169f9acc…`, draft, non-mergeable | `QUARANTINE_RESEARCH` | Preserve history-repair work; do not merge into the canonicalization lane without a narrow reviewed extraction. |
| PR #29 / `chore/bear-edge-create-state-continuity` | `3e6684e…`, 7 ahead of `reconcile`, CI green | `SELECTIVE_PORT_ONLY` | Continuity assets are useful, but their Supabase-authority wording contradicts current implementation and must be corrected before use. |
| PR #30 / `data/kalshi-mlb-props-2026-08-06` | `8ffa8d5…`, CI failed | `PRESERVE_EVIDENCE_REDESIGN_SCHEMA` | Keep report/manifest evidence; do not import the undeployed quote migration until inventory, RLS, ingestion, and authority design are resolved. |
| `archive/canonical-betting-state-2026-07-31` | `c02672c…` | `READ_ONLY_HISTORICAL_SNAPSHOT` | Useful governance snapshot; not a runnable current system. |
| `codex/sweet-bear-pitcher-strikeout-machine-v1` | `a5b422…` | `QUARANTINE_CORRUPT_PACKAGE` | Committed tarball is truncated and fails its recorded checksum. |
| `codex/sweet-bear-unified-mlb-machine-v1` | `b6ddc74…` | `RESEARCH_ARCHIVE` | Bootstrap decodes, but materialization missed its coverage gate and registry authorizes `$0`. |
| `codex/sweet-bear-unified-mlb-machine-v2` | `c5fca1f…` | `RESEARCH_ARCHIVE` | Implemented-unvalidated modules; zero validated models and no tracked generated history library. |
| Other simulator/design/security branches | multiple divergent refs | `FREEZE_AND_INVENTORY` | No branch becomes canonical by name or recency. Port only an identified requirement with targeted tests. |
| Dirty local esports worktree | based on `8f0d6cb…` | `QUARANTINED_NOT_IMPORTED` | Not committed; not a probability generator; adversarial review found chronology, provenance, stake, schema, calibration, source-rights, and replay defects. |

## Separate repositories

| Repository | Disposition | Boundary |
|---|---|---|
| `davidmostow1/sweetbear-edge` | `SEPARATE_MEASUREMENT_LIBRARY` | Statistical and distribution substrate; no complete ingestion/live-odds/execution/persistence system. |
| `davidmostow1/sweet-bear-model-showdown` | `SEPARATE_EVIDENCE_EVALUATOR` | Frozen MLB comparison/evaluation work; outcome and exact closing-line validation remain incomplete. |
| `davidmostow1/chatbot` | `OUT_OF_SCOPE` | Generic Vercel template with no verified Bear Edge integration. |

No code is copied across these repository boundaries merely because names overlap.

## Consolidation rules

1. New implementation work targets only `codex/bear-edge-canonicalize-20260812` until a reviewed successor is chosen.
2. Do not merge the giant PR #17 directly into `master`; use its exact head as the recovery baseline and create a narrowly documented consolidation PR.
3. Do not fast-forward or rewrite `master` during forensic recovery.
4. Every imported branch artifact needs a claim, exact source SHA, scope, targeted tests, and an independent review note.
5. Never import a stale report as current status; historical documents retain their original dates and claims.
6. No branch may promote a model, enable wager execution, or authorize stake without the registry and calibration gates.
7. Once consolidation is remotely green and selected, protect the canonical branch and stop direct work on `master`.

The one-consolidation-PR decision is an explicit recovery exception to ordinary
single-change delivery. The implementation remains split into logical commits:
LAN portability, authoritative-stake safety, Supabase schema gating, and the
truth/audit bundle. The final aggregate tree receives the full verification gate.

## Exit receipt for canonical selection

The candidate becomes canonical only when all fields below are filled with direct evidence:

```text
REPOSITORY: davidmostow1/bear-edge-platform
BRANCH: <exact remote branch>
COMMIT: <full SHA>
WORKING_TREE_AT_BUILD: clean
INSTALL: npm ci -> PASS
VERIFY: npm run verify -> PASS on the same SHA
PACKAGE/SMOKE: PASS in a separate clean environment
REMOTE_CI: PASS on the same SHA
MODEL_STATUS: 0 validated unless independently promoted under policy
AUTHORIZATION: RESEARCH_ONLY / PRICE_CHECK_ONLY
AUTHORIZED_STAKE: $0
EXECUTION: disabled
REVIEW: no unresolved P0 finding
```

Until then, use the phrase **canonicalization candidate**, not **canonical release**.
