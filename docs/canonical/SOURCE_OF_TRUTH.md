# Bear Edge source-of-truth rules

There is no honest single global source of truth. Authority is assigned by domain and exact artifact identity.

The fixed recovery boundary is `RESEARCH_ONLY`, authorized stake `$0`, and wager execution disabled.

SAFETY_INVARIANT: authorization is RESEARCH_ONLY; authorized stake is $0; execution is disabled.

## Current authority by domain

| Domain | Authority | Required identity |
|---|---|---|
| Committed code and tests | exact Git commit | repository plus full SHA |
| Branch and pull-request state | current GitHub refs and metadata | repository, ref, head SHA, observation time |
| Model identity and promotion policy | registry on the evaluated Git commit | model ID, version, market family, registry/policy digest |
| Deployed database shape | live Supabase catalog and applied migration history | project ref and observation time |
| Current decision/settlement lifecycle | local append-only JSONL ledger | record ID, client event ID, schema version, content digest |
| Current Supabase decision tables | remote projection of the local ledger | remote row identity plus local content digest |
| Raw evidence | retained content-addressed artifact | source locator, capture/source times, SHA-256 digest, access provenance |
| Canonical project status | this directory plus direct runtime checks | exact Git commit and evidence cutoff |
| Drive documents | plans, evidence, and historical archive | immutable document ID and content/version evidence |
| Plugin or agent output | non-authoritative analysis | tool identity, invocation receipt, and independently checked claim evidence |
| Conversation or continuity memory | navigation context only | never sufficient for a completion claim |

## Target authority after cutover

After the cutover gate in `ARCHITECTURE.md` passes, Supabase becomes authority for durable operational events and local JSONL becomes write-ahead/replay storage. That is a target state, not the current state.

## Evidence grades

Every material status claim must use one of these labels:

- `CONFIRMED`: current direct evidence supports the claim.
- `PARTIAL`: a real artifact or implementation exists but a material requirement is missing, contradictory, or unverified.
- `FAILED`: direct evidence contradicts the claimed capability or shows it is absent.
- `UNVERIFIED`: available evidence cannot establish the claim.

Use `NOT_RUN` for a verification command that was not executed. A historical pass on another commit is not a current pass.

## Claim rules

1. **Exact identity first.** Every code claim names the full commit. Every runtime claim names the environment and observation time.
2. **Plans are not completion proof.** A roadmap, prompt, handoff, migration file, SQL draft, or plugin receipt describes intent or historical work unless the claimed result is independently verified.
3. **Tests are scoped evidence.** A test pass proves the tested behavior on the tested artifact. It does not prove predictive edge, source authenticity, legal access, complete adversarial coverage, deployment, or profit.
4. **Model language is registry-bound.** `validated`, `shadow`, or `retired` may be used only when the exact registry tuple and immutable report evidence satisfy code-enforced policy.
5. **A hash is not authentication.** A caller-computed digest proves self-consistency only. Source authenticity requires an authenticated capture path or independently retained provenance.
6. **No silent freshness.** External facts such as branch heads, database rows, migrations, source terms, prices, rosters, and schedules must carry an observation time and be refreshed before reuse.
7. **No missing-data invention.** Missing price, roster, feature, timestamp, outcome, or close stays missing and fails closed.
8. **No cross-lane substitution.** Sweet Bear, Showdown, machine archives, MLB research, and esports work remain distinct until an explicit schema-bound integration is reviewed and verified.
9. **No authority by confidence.** Newer, longer, or more confident prose never outranks narrower direct evidence.
10. **No money-path implication.** A calculated Kelly fraction or hypothetical stake is not wagering authority. Authorized stake remains `$0` unless an explicit future release changes the policy after validation.

## Conflict resolution

When evidence conflicts:

1. stop the affected change;
2. identify the narrow domain in dispute;
3. compare exact artifacts at the same authority level;
4. prefer direct current evidence over historical summaries;
5. retain both observations and explain the conflict;
6. mark the claim `PARTIAL` or `UNVERIFIED` until resolved;
7. never edit data or history merely to make the sources agree.

Examples from this recovery:

- The August 1 plan says Supabase should be the sole durable authority, while deployed comments and current code say local JSONL is authoritative. The correct status is `CURRENT local / TARGET Supabase`, not a silent choice between documents.
- `reconcile@8f0d6cb…` is green but smaller; PR #17 head `5f284eb8…` contains the fuller recovered implementation and also has green CI. The former is not promoted merely because its branch name says “canonical.”
- PR #31 merged the reviewed recovery tree as `3698869…`; that exact merge commit is now the canonical research baseline. Its name does not make it a release, and the unprotected default branch remains a P0 governance blocker.
- Supabase migration history says the v2.1 shadow-evidence migration is deployed, but deployment does not prove safe compatibility. Live constraints, grants, triggers, row shape, retry behavior, and retained parent data all remain independently reviewable facts.
- Historical plugin receipts prove earlier invocations of `prompt-mastery` and `bear-edge-operator`; they do not make those plugins callable in the current runtime.
- The August 12 esports slate proves that a manual JSON observation exists. It does not prove source authenticity, an independent prediction, a model edge, or an executable price.

## Required completion receipt

No work item may be called complete without a receipt containing:

```text
CLAIM: <one exact claim>
GRADE: CONFIRMED | PARTIAL | FAILED | UNVERIFIED
ARTIFACT: <repository/file/runtime object>
IDENTITY: <full commit, digest, project ref, or immutable ID>
VERIFICATION: <exact command or observation>
RESULT: <PASS, FAIL, NOT_RUN, or measured value>
OBSERVED_AT: <UTC>
LIMITATION: <what this evidence does not establish>
```

If the receipt cannot be completed, the claim is not complete.

## Mutation boundary

Through the external-evidence cutoff of the recovery audit, no branch was pushed, no pull request was created or merged, no migration was deployed, no Supabase data was changed, no provider or plugin was activated, and no bet was placed by that audit. This historical boundary does not describe later authorized publication actions and does not erase or deny historical wagers recorded elsewhere. Every later mutation requires its own exact-SHA/runtime receipt.
