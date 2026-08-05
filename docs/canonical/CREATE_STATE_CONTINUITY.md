# Bear Edge Create State Continuity Protocol

**Status:** Repository policy for Cursor session continuity  
**Scope:** Restore, capture, and handoff only  
**Authorization:** `RESEARCH_ONLY`  
**Authorized stake:** `$0`  
**Execution:** disabled

## Purpose

Create State is continuity memory only. It may preserve project summaries, decisions, hypotheses, priorities, blockers, and pending work between AI sessions. It is not the authority for committed code, durable event records, model validity, authorization, wager execution, provider readiness, physical installation, or completed verification.

A restored handoff is a bundle of claims. Those claims become trusted working context only after the appropriate authority confirms them.

This protocol exists to prevent a new session from resuming the wrong repository, branch, commit, model, world model, or safety state simply because a handoff is recent.

## Authority hierarchy

Use this order whenever sources disagree:

1. **GitHub is the code authority.** It establishes committed files, repository identity, branch identity, exact commit SHA, pull-request state, and review history.
2. **Supabase is the durable append-only event journal.** A local or remembered record is not remotely durable until its presence in the intended Supabase project is verified.
3. **Local JSONL is the write-ahead and replay journal.** It protects offline capture and replay, but it does not prove that remote projection succeeded.
4. **Repository canonical documentation** defines architecture, policy, source-of-truth rules, and operating boundaries when it agrees with verified code and durable records.
5. **Create State is continuity memory only.** It helps the next session find the road, but it does not redraw the map.
6. **Conversation transcripts** are supporting historical evidence. They may explain intent, but they do not prove repository or runtime state.

When two sources at the same authority level conflict, stop and gather narrower evidence. Never settle the conflict by choosing the newer or more confident wording.

## Fixed safety boundary

Every restore and handoff must preserve these rules unless a stricter verified repository rule applies:

- authorization mode remains `RESEARCH_ONLY`;
- authorized stake remains `$0`;
- wager execution remains disabled;
- no bet placement, cancellation, bankroll movement, model promotion, branch merge, Supabase mutation, Statsig activation, or provider activation is authorized by Create State;
- no invented odds, lines, lineups, injuries, results, settlements, credentials, test results, commits, installations, or device proof;
- no claim of predictive validity, profitability, production readiness, or completed physical installation without direct evidence;
- no silent combination of handoffs, world models, branches, or experimental lanes.

Any restored statement that conflicts with this boundary is rejected before files are changed.

## Start of session

### 1. Identify the intended project

Establish the expected project and repository before looking at recency. For Bear Edge, record the expected owner/repository, the intended work lane, and any governing plan or branch named by the user.

Project match comes before recency. A newer handoff for another repository or experimental branch is not safer than an older exact match.

### 2. Run the project-local restore skill

Use:

```text
Use the Bear Edge session restore skill.
Identify the intended repository and project before selecting a handoff.
Restore only one uniquely matching handoff, then verify every material claim
against GitHub, local git when available, Supabase when relevant, repository
canonical documentation, and the fixed RESEARCH_ONLY / $0 / execution-disabled
boundary. Do not combine handoffs. Classify the result as ESTABLISHED_FACT,
REASONABLE_INFERENCE, or OPEN_QUESTION. Stop before edits if evidence conflicts.
```

The skill lives at:

```text
.cursor/skills/bear-edge-session-restore/SKILL.md
```

### 3. Evaluate candidate handoffs

The restore pass must:

1. call `listHandoffPackages`;
2. rank exact project and repository match before timestamp;
3. reject ambiguous or conflicting candidates;
4. call `restoreFromHandoff` only for one uniquely matched handoff;
5. fall back to `listUserWorldModels` and `getProjectWorldModel` only for an exact Bear Edge match;
6. verify repository, branch, commit, working-tree state when available, verification command, test evidence, model status, Supabase status, authorization, stake, and execution state.

Never merge or blend multiple handoffs automatically.

### 4. Accept, limit, or reject restored context

Use these labels:

- `ESTABLISHED_FACT`: current authoritative evidence supports the statement.
- `REASONABLE_INFERENCE`: evidence supports the conclusion indirectly, and the inference is named.
- `OPEN_QUESTION`: evidence is missing, contradictory, stale, or unavailable.

Valid start results are:

- `RESTORED_AND_VERIFIED`
- `RESTORED_WITH_CONFLICTS`
- `WORLD_MODEL_LOADED`
- `REPOSITORY_ONLY`
- `BLOCKED`

Implementation may continue only when the result and authoritative evidence permit it.

## During the session

Capture only information that will materially improve continuity:

- architectural decisions and their rationale;
- exact branch and commit transitions;
- test failures and verified fixes;
- model identity and status changes supported by repository evidence;
- durable ledger or projection outcomes supported by Supabase evidence;
- blockers and the next safe action;
- explicit distinctions among facts, inferences, and open questions.

Do not capture routine chatter, secrets, raw account material, speculative completion claims, or copied logs whose provenance is unclear.

After a significant commit, record:

```text
Repository: <owner/repository>
Branch: <exact branch>
Commit: <full SHA>
Change: <what changed>
Verification: <PASS, FAIL, NOT_RUN, or UNKNOWN>
Evidence timestamp: <UTC>
Safety boundary: RESEARCH_ONLY, authorized stake $0, execution disabled
```

Create State capture does not replace the commit, pull request, Supabase event, or local JSONL record.

## End of session

### 1. Gather fresh evidence

Do not reuse an earlier status block without rechecking it. Collect the exact repository, remote, branch, commit, base, working-tree status when available, pull-request state, model status, ledger status, authorization state, and current blockers.

Read the verification command from the repository. For this lineage, the expected command is:

```bash
npm run verify
```

Run it when execution is available and safe. Otherwise record `NOT_RUN`. Never treat an old passing run on another commit as proof for the current commit.

### 2. Populate the canonical packet

Copy:

```text
docs/canonical/templates/CREATE_STATE_HANDOFF.yaml
```

Replace every evidence-critical placeholder with a verified value, `UNKNOWN`, or `NOT_RUN`. Do not leave ambiguous blanks.

### 3. Redact secrets

Exclude API keys, access tokens, passwords, cookies, one-time codes, private authentication headers, `.env` contents, payment details, identity documents, private sportsbook identifiers, and unredacted screenshots.

Set `secret_redaction_confirmed: true` only after reviewing the complete packet.

### 4. Run the project-local handoff skill

Use:

```text
Use the Bear Edge session handoff skill.
Collect fresh repository and verification evidence, populate the canonical
CREATE_STATE_HANDOFF.yaml packet, redact all secrets, and preserve the
RESEARCH_ONLY / $0 / execution-disabled boundary. Call
captureConversationContext first. Only after that succeeds, call
createSessionHandoff. Report the exact tool result and never claim a handoff
exists without a successful response.
```

The skill lives at:

```text
.cursor/skills/bear-edge-session-handoff/SKILL.md
```

### 5. Save in the required order

1. Call `captureConversationContext` with the complete redacted packet.
2. Confirm that tool call succeeded.
3. Call `createSessionHandoff` with the same verified world-model ID when known.
4. Record the returned handoff ID and name only if the call succeeds.

A failed context capture means no handoff creation should be attempted. A successful context capture followed by a failed handoff must be reported as `CONTEXT_CAPTURED_HANDOFF_FAILED`, not `CREATED`.

## Restore rejection conditions

Reject automatic restoration and stop before edits when any of these conditions exists:

- the handoff belongs to another repository or world model;
- multiple candidates disagree about branch, commit, model, plan stage, authorization, or execution state;
- GitHub reports a different repository, branch, commit, pull-request state, or divergence;
- local working-tree changes are present but absent from the handoff;
- the handoff claims verification passed on a different or unknown commit;
- Supabase durability is claimed without remote evidence;
- local JSONL is presented as proof of remote synchronization;
- the handoff claims a model is validated or promoted without immutable registry and report evidence;
- the handoff weakens `RESEARCH_ONLY`, authorized stake `$0`, or disabled execution;
- the user requested one lane but the handoff belongs to another experimental lane;
- required tool failures make project identity or task authority uncertain.

## Service and authentication failures

When Create State returns an HTTP, authentication, authorization, timeout, transport, or service failure:

1. record the exact tool and sanitized status;
2. do not retry indefinitely;
3. do not claim a restore, capture, world-model load, or handoff succeeded;
4. continue only with repository-backed context when that is sufficient and safe;
5. mark unavailable evidence `UNKNOWN` and unrun checks `NOT_RUN`;
6. stop before changes if the missing Create State context is material to repository identity or task authority.

During implementation of this protocol on August 5, 2026, the Create State connector available to ChatGPT returned **HTTP 403** from its CloudFront transport. That observation proves only that this ChatGPT connector attempt was blocked. It does not prove that the user's local Cursor plugin will fail in the same way.

## Cursor installation and authentication boundary

The repository now contains the project-local skills and operating policy. That does not install or authenticate the upstream Create State MCP plugin on the user's computer.

The physical Cursor environment is not verified by this repository change. Installation, sign-in, MCP connection, and a successful handoff listing must be demonstrated inside the user's actual Cursor environment before Create State can be treated as operational there.

A safe local validation sequence is:

1. install the upstream Create State plugin using its current official instructions;
2. authenticate through the method appropriate to the local or remote Cursor setup;
3. confirm `create-state` appears in Cursor's MCP server list;
4. ask Cursor: `Check whether we have any recent session handoffs`;
5. require an actual successful `listHandoffPackages` response;
6. run the Bear Edge restore prompt above;
7. confirm the report names the correct repository, branch, commit, authorization mode, stake, and execution state.

Never place an API key in this repository or in a handoff packet.

## Minimum start report

```text
RESTORE_RESULT: <allowed result>
REPOSITORY: <owner/repository or UNKNOWN>
BRANCH: <branch or UNKNOWN>
COMMIT: <full SHA or UNKNOWN>
WORKING_TREE: <clean, modified, UNKNOWN>
VERIFICATION_COMMAND: <command or UNKNOWN>
VERIFICATION_RESULT: <PASS, FAIL, NOT_RUN, UNKNOWN>
AUTHORIZATION_MODE: RESEARCH_ONLY
AUTHORIZED_STAKE: $0
EXECUTION: disabled
NEXT_SAFE_ACTION: <one concrete action>
```

## Minimum end report

```text
HANDOFF_RESULT: CREATED | CONTEXT_CAPTURED_HANDOFF_FAILED | FAILED | NOT_RUN
HANDOFF_ID: <ID or UNKNOWN>
WORLD_MODEL_ID: <ID or UNKNOWN>
REPOSITORY: <owner/repository or UNKNOWN>
BRANCH: <branch or UNKNOWN>
COMMIT: <full SHA or UNKNOWN>
WORKING_TREE: <clean, modified, UNKNOWN>
VERIFICATION_COMMAND: npm run verify
VERIFICATION_RESULT: <PASS, FAIL, NOT_RUN, UNKNOWN>
AUTHORIZATION_MODE: RESEARCH_ONLY
AUTHORIZED_STAKE: $0
EXECUTION: disabled
NEXT_SAFE_ACTION: <one concrete action>
```

## What success means

Repository success means the skills, protocol, template, and tests are committed and verified on their exact commit.

Operational Create State success means the user's actual Cursor environment can authenticate, list the intended world model or handoff, restore one exact project match, pass the repository evidence gate, capture a redacted packet, and return a real handoff ID.

Those are separate claims. Never collapse them into one.