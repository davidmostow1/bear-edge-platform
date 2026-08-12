# Codex pickup — Bear Edge bounded repair

Use this package only in the checkout below. Do not merge, deploy, purchase data,
start paid provider calls, promote a model, place a wager, or alter any bankroll.

## Exact checkout

```sh
cd /Users/davidbearmostow/Documents/Codex/2026-06-17-documents-openai-developers-google-drive-google
git status --short --branch
git rev-parse HEAD
```

Expected branch at handoff: `codex/bear-edge-release-candidate`.

The worktree was already heavily dirty before this repair. Preserve every
unrelated modification and untracked file. Do not clean, reset, stash, rebase,
or checkout over it.

## Read first

```sh
sed -n '1,260p' AGENTS.md
sed -n '1,320p' docs/BEAR_EDGE_BOUNDED_REPAIR_PROGRAM_2026-07-30.md
sed -n '1,260p' governance/system-boundaries.json
sed -n '1,320p' reports/repair-program/2026-07-30/AUDIT_TRAIL.md
```

Fixed boundary:

```text
predictiveImprovement=NOT_EVALUATED
modelValidation=NOT_ESTABLISHED
wageringAuthority=UNCHANGED
betCallPermission=PRICE_CHECK_ONLY
```

## Verify the handed-off milestone

Use the bundled runtime:

```sh
export PATH="$PWD/.tools/node/bin:$PATH"
```

Run the cheapest check first:

```sh
npm run audit:boundaries
```

Then run the focused adversarial tests:

```sh
node --test \
  test/system-boundaries.test.js \
  test/model-registry.test.js \
  test/probability-causality.test.js \
  test/showdown-records.test.js \
  test/showdown-compare.test.js \
  test/shadow-cohort.test.js \
  test/predictions-contract-economics.test.js \
  test/authoritative-ledger.test.js
```

Only after those pass, run:

```sh
npm run verify
git diff --check
```

The full suite opens local test sockets. If an execution sandbox rejects
`listen` with `EPERM`, rerun the same command with permission to open loopback
sockets. Do not change the tests to work around the sandbox.

Run the native operator doctor only after the full suite passes:

```sh
node /Users/davidbearmostow/.codex/plugins/cache/personal/bear-edge-operator/0.1.0+codex.20260730065217/scripts/bear-edge-doctor.mjs \
  --repo /Users/davidbearmostow/Documents/Codex/2026-06-17-documents-openai-developers-google-drive-google
```

Expected handed-off local result:

- the comparable focused set passes 183/183 tests;
- 718 tests pass in the full suite;
- system-boundary audit returns `PASS`;
- three lanes are present;
- 4/4 Bear Edge models remain `research_only`;
- release report remains `shippable-with-warnings` at 75/100;
- doctor remains `CHECKS_COMPLETE`;
- bet-call permission remains `PRICE_CHECK_ONLY`.

Those expectations are regression checks, not predictive-validity claims.

## Files introduced by this bounded milestone

```text
docs/BEAR_EDGE_BOUNDED_REPAIR_PROGRAM_2026-07-30.md
docs/CODEX_PICKUP_BEAR_EDGE_2026-07-30.md
governance/system-boundaries.json
governance/system-boundaries.js
script/check_system_boundaries.js
test/system-boundaries.test.js
reports/repair-program/2026-07-30/AUDIT_TRAIL.md
```

`package.json` was modified only to add `audit:boundaries` and include it in
`verify`. It contained pre-existing uncommitted changes; inspect the narrow diff
before editing it.

## Next allowed milestone

Do not jump directly into a "better algorithm." The next allowed milestone is a
single-market, preregistered upstream-model contract.

Required input from the user before implementation:

1. one market family: `pitcher_strikeouts`, `batter_hits`,
   `batter_runs_scored`, or `batter_total_bases`;
2. approved no-cost or licensed sources for every intended feature;
3. the exact prospective cohort start date;
4. confirmation that the displayed Codex credit balance can cover the milestone
   and its verification.

Once supplied, create a separate spec that freezes:

- feature names, units, and source timestamps;
- missing-data behavior;
- event-atomic train/calibration/evaluation split;
- baselines;
- leakage tests;
- implementation digest;
- no-promotion rule until prospective evidence passes.

Implement one feature group at a time. Add a failing test first, make the
smallest code change, run the targeted test, update the audit trail, and only
then proceed.

## Hard stop conditions

Stop immediately and report the exact evidence if any of these occurs:

- displayed remaining Codex credits cannot be verified or are insufficient to
  finish and test the next milestone;
- any command would spend provider credits or money without explicit approval;
- a source is missing, stale, unlicensed, post-start, or cannot be attributed;
- a price is one-sided, not DraftKings sportsbook, stale, or lacks capture time;
- a cross-lane write, shared bankroll, shared model registry, or model relabeling
  is proposed;
- a Kalshi production or execution path appears in Bear Edge;
- a DraftKings Predictions contract price is substituted for sportsbook
  American odds;
- a model leaves `research_only`;
- any ledger has malformed rows, duplicate IDs, digest conflicts, or invalid
  references;
- a targeted test fails;
- the full suite fails for a reason other than a confirmed sandbox restriction;
- independent review identifies a material unresolved defect;
- work would require merge, deployment, credential change, paid service,
  irreversible production change, or wager authorization.

## Credit discipline

The repository has no access to the Codex account credit meter. Before each new
milestone, record the displayed starting balance in the audit trail. Do not
estimate usage from elapsed time. Do not run parallel agents. Reserve enough
displayed balance for one architecture/model review and one final verification
pass. If the balance cannot be read, stop rather than claim the 1,000-credit
ceiling is being enforced.

## Independent review

Read the audit trail for the actual Claude and Gemini status. A model response
counts only if the exact artifact digest and response were retained. Reviewer
agreement does not establish statistical, security, or wagering validity.

## Completion language

Allowed:

> The separation guard and local verification passed. Predictive improvement was
> not evaluated, model validation is not established, and wagering authority is
> unchanged.

Prohibited:

> The algorithm is viable, validated, profitable, ready to bet, or independently
> certified.
