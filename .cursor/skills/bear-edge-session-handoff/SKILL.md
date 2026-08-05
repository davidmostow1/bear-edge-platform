---
name: bear-edge-session-handoff
description: Save an evidence-backed Bear Edge handoff without promoting memory to authority.
---

# Bear Edge Session Handoff

Use this skill when ending or pausing a productive Bear Edge session, switching to another lane, or when the user asks to save the work for later. The handoff is a continuity packet, not a substitute for committed code, durable records, test evidence, or repository policy.

## Fixed boundary

Every handoff must preserve:

- authorization mode remains `RESEARCH_ONLY`;
- authorized stake is `$0`;
- wager execution remains disabled;
- no model promotion, bankroll change, database write, branch merge, bet placement, installation claim, provider-readiness claim, or profitability claim without direct authoritative evidence;
- no invented odds, lines, lineups, injuries, results, settlements, test results, commits, or identifiers.

## Authority order

1. GitHub is authoritative for committed code and repository, branch, commit, and review identity.
2. Supabase is authoritative for durable append-only events only after remote verification.
3. Local JSONL is the offline write-ahead and replay journal.
4. Repository canonical documentation defines policy when it agrees with verified code and durable records.
5. Create State is continuity memory only.
6. Conversation transcripts are supporting historical evidence only.

## Handoff procedure

### 1. Collect fresh git evidence

Immediately before saving the session, collect fresh repository evidence rather than copying values from an earlier message or handoff:

- repository owner and name;
- local path when local access exists;
- remote URL when local access exists;
- active branch;
- full commit SHA;
- intended base branch and base commit;
- working-tree status when local access exists;
- pull-request number, state, base, and head when applicable;
- branch divergence or unresolved merge state when material.

If any value cannot be checked, write `UNKNOWN`. Do not guess.

### 2. Establish verification status

Read the repository-declared verification command. For the canonical Bear Edge release-candidate lineage, the expected command is:

```bash
npm run verify
```

When command execution is available and safe, run it against the exact recorded commit. Capture:

- command;
- result: `PASS`, `FAIL`, or `NOT_RUN`;
- UTC evidence timestamp;
- exact test count when emitted;
- failing test names or blocker when the result is `FAIL`;
- execution environment, such as local checkout or GitHub Actions.

Use `NOT_RUN` when the command was not executed. A prior run on another commit is historical evidence, not verification of the current commit.

### 3. Collect operational evidence

Record the current verified state of:

- active plan stage and vertical slice;
- model identities and registry status;
- provider readiness and freshness;
- Supabase configuration and remote projection status;
- local JSONL journal and pending replay state;
- Statsig controls when relevant;
- authorization mode, authorized stake, and execution state;
- completed work, blockers, and one next safe action.

Separate the packet into `verified_facts`, `reasonable_inferences`, and `open_questions`. Do not hide contradictions.

### 4. Redact before capture

Never place secrets or sensitive account material in Create State. Exclude:

- API keys;
- access tokens;
- passwords and passphrases;
- session cookies;
- one-time codes;
- private authentication headers;
- private account data not necessary for project continuity;
- unredacted screenshots;
- raw `.env` or `.env.local` contents;
- sportsbook account identifiers, payment details, or personal identity documents.

Record `secret_redaction_confirmed: true` only after reviewing the complete packet. A secret should be represented only as a safe status such as `configured`, `missing`, `invalid`, or `UNKNOWN`.

### 5. Populate the canonical packet

Use `docs/canonical/templates/CREATE_STATE_HANDOFF.yaml`. Replace every evidence-critical placeholder with a verified value, `UNKNOWN`, or `NOT_RUN`. Do not leave ambiguous blanks.

The packet must include:

- exact project and repository identity;
- exact branch, commit, base, and working-tree state;
- verification evidence;
- authority mapping;
- authorization and execution state;
- facts, inferences, questions, blockers, next action, and prohibited actions;
- secret-redaction confirmation.

### 6. Capture the packet first

Call `captureConversationContext` with the complete redacted YAML packet as `context`. Supply the exact Bear Edge `model_id` when it is known and verified. Record the successful tool response.

If this call fails, report the exact sanitized tool, HTTP, authentication, authorization, timeout, transport, or service error. Stop. Do not proceed to handoff creation and do not claim that the packet was saved.

### 7. Create the session handoff second

Only after the context capture succeeds, call `createSessionHandoff` with:

- the same verified `model_id` when available;
- a descriptive `handoff_name` containing the project, lane, and status;
- `include_experimental_thoughts: false` by default unless the user explicitly asks to preserve hypotheses and they are clearly labeled as non-authoritative.

A useful name format is:

```text
Bear Edge | <vertical slice> | <PASS, FAIL, BLOCKED, or IN_PROGRESS> | <YYYY-MM-DD>
```

### 8. Report the result truthfully

The assistant must not claim that context was captured, a handoff was created, an active model was set, or a handoff ID exists without a successful tool response proving that result.

On success, report:

- handoff name and ID;
- world-model ID when returned;
- exact repository, branch, and commit saved;
- verification result;
- next safe action;
- fixed authorization boundary.

On failure, report:

- failed tool;
- sanitized error class and HTTP status when available;
- whether context capture succeeded before the later failure;
- repository-backed fallback location for the same information, if one exists;
- that no successful handoff is being claimed.

## Required handoff result

End with:

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

Create State remains continuity memory. GitHub and verified durable records remain the court of record.