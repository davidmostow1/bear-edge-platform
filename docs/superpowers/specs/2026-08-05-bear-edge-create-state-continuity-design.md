# Bear Edge Create State Continuity Design

**Date:** 2026-08-05  
**Status:** Approved for implementation by the user’s instruction to execute the proposed hardened workflow  
**Target branch lineage:** `reconcile/bear-edge-canonical-v1` at `8f0d6cb7052db8ee3d6b29dc5994100956b09766`

## 1. Purpose

Create a project-local Cursor continuity system that uses Create State as working memory without allowing restored memory to outrank repository evidence.

The system must solve four recurring Bear Edge failures:

1. a new AI session resumes the wrong branch or project;
2. a recent handoff is treated as canonical merely because it is recent;
3. proposed, inferred, or remembered work is reported as completed work;
4. safety boundaries drift between sessions.

This feature does not change prediction logic, model status, database schema, sportsbook behavior, bankroll state, or wager execution.

## 2. Authority Hierarchy

Every restore and handoff must preserve this order of authority:

1. **GitHub repository evidence** is authoritative for committed code, branch identity, commit identity, and review state.
2. **Supabase append-only records** are authoritative for durable event-journal records after their remote presence is verified.
3. **Local JSONL** is an offline write-ahead and replay journal, not proof that remote projection succeeded.
4. **Repository canonical documentation** defines operating policy and architecture when it agrees with verified code and durable records.
5. **Create State** is continuity memory only.
6. **Conversation transcripts** are supporting historical evidence only.

A restored handoff is a claim bundle. It becomes trusted context only after each material claim is checked against the appropriate authority.

## 3. Fixed Safety Boundary

The continuity system must always surface and preserve:

- authorization mode: `RESEARCH_ONLY` or the repository’s stricter verified equivalent;
- authorized stake: `$0`;
- wager execution: disabled;
- no claim of predictive validity, profitability, production readiness, installation, device proof, or provider readiness without direct evidence;
- no invented odds, lines, lineups, injuries, results, settlements, keys, model promotion, or database writes;
- no silent merge, rebase, branch switching, model promotion, or reconciliation of conflicting handoffs.

If restored context conflicts with any fixed safety boundary, restoration fails closed.

## 4. Components

### 4.1 Project-local restore skill

Create `.cursor/skills/bear-edge-session-restore/SKILL.md`.

The skill will:

1. identify the requested repository or project before choosing a handoff;
2. call `listHandoffPackages`;
3. rank candidate handoffs by project match first and recency second;
4. reject ambiguous, expired, cross-project, or conflicting handoffs;
5. call `restoreFromHandoff` only for a uniquely identified candidate;
6. fall back to `listUserWorldModels` and `getProjectWorldModel` when no safe handoff exists;
7. verify repository identity, default branch, active branch, exact commit, working-tree status when locally available, verification command, test evidence, Supabase status, model status, authorization mode, authorized stake, and execution state;
8. classify restored statements as `ESTABLISHED_FACT`, `REASONABLE_INFERENCE`, or `OPEN_QUESTION`;
9. stop before implementation when authoritative evidence contradicts the restored state;
10. report external tool failures exactly, including authentication and HTTP failures.

The skill must never describe hidden model reasoning as literally restored. It may describe saved context, hypotheses, priorities, or externally captured reasoning summaries.

### 4.2 Project-local handoff skill

Create `.cursor/skills/bear-edge-session-handoff/SKILL.md`.

The skill will:

1. collect fresh repository evidence before saving the session;
2. run or verify the repository’s declared verification command when execution is available;
3. build a structured continuity packet using the repository template;
4. save the packet with `captureConversationContext` before calling `createSessionHandoff`;
5. exclude secrets, API keys, access tokens, cookies, one-time codes, private account data, and unredacted screenshots;
6. mark unrun checks as `NOT_RUN`, never as passed;
7. preserve exact blockers and one concrete next safe action;
8. preserve the fixed safety boundary;
9. report a Create State failure without claiming the handoff exists.

### 4.3 Canonical operating protocol

Create `docs/canonical/CREATE_STATE_CONTINUITY.md`.

This document will explain:

- what Create State is and is not;
- the authority hierarchy;
- start-of-session, during-session, and end-of-session procedures;
- the fail-closed restore gate;
- how to respond to tool outages;
- the exact Cursor prompts for restore and handoff;
- the present external limitation that installation/authentication must be completed in the user’s Cursor environment and cannot be proved by repository changes alone.

### 4.4 Handoff template

Create `docs/canonical/templates/CREATE_STATE_HANDOFF.yaml`.

The template will contain explicit fields for:

- project and repository identity;
- local checkout and remote identity;
- branch, commit, base, and working-tree state;
- plan stage and active vertical slice;
- verification command, result, evidence timestamp, and test count;
- code, event-journal, offline-journal, policy, and memory authorities;
- authorization and execution state;
- verified facts, inferences, open questions, blockers, next safe action, and prohibited actions;
- secret-redaction confirmation.

Unknown values must be written as `UNKNOWN` or `NOT_RUN`; blanks are not acceptable for evidence-critical fields.

### 4.5 Repository contract test

Create `test/create-state-continuity.test.js`.

The test will verify that:

- all four required files exist;
- both skills have valid frontmatter names and concise descriptions;
- restore policy contains project-first selection, GitHub verification, conflict rejection, fallback behavior, fact/inference/question classification, and fail-closed safety language;
- handoff policy requires fresh evidence, verification status, context capture before handoff creation, secret exclusion, and truthful failure reporting;
- the operating protocol preserves the authority hierarchy;
- the template contains every required evidence and safety field;
- `RESEARCH_ONLY`, authorized stake `$0`, and disabled execution are present in the durable policy artifacts.

The contract test protects the continuity boundary from future accidental dilution.

## 5. Restore Data Flow

```text
User asks to resume Bear Edge
        |
        v
Identify intended repository/project
        |
        v
List handoffs
        |
        v
Project match? ---- no ----> list/load matching world model
        |
       yes
        |
        v
Unique safe candidate? ---- no ----> stop and report ambiguity
        |
       yes
        |
        v
Restore saved context
        |
        v
Verify GitHub/local/Supabase/safety claims
        |
        +---- contradiction ----> reject restored claim; stop before changes
        |
        +---- evidence agrees --> classify facts/inferences/questions; continue
```

Recency is never the first selection criterion. Repository identity and project identity are first.

## 6. Handoff Data Flow

```text
Session ending
    |
    v
Collect fresh git/repository/test/runtime evidence
    |
    v
Populate structured continuity packet
    |
    v
Redact secrets and classify uncertainty
    |
    v
captureConversationContext(packet)
    |
    v
createSessionHandoff(model_id, handoff_name)
    |
    +---- failure --> report failure; no handoff claim
    |
    +---- success --> report handoff ID/name and exact saved boundary
```

## 7. Error Handling

### Create State unavailable or returns HTTP/authentication failure

- Do not retry indefinitely.
- Record the exact failure class and endpoint status when available.
- Continue only with repository-backed context.
- Do not claim a world model, capture, restore, or handoff exists.
- Give the user the local Cursor connection check from the operating protocol.

### Multiple candidate handoffs

- Reject automatic restoration unless one candidate uniquely matches the intended repository and project.
- Never combine handoffs automatically.

### Repository mismatch

- Stop before edits.
- Report expected and observed repository, branch, and commit.
- Require authoritative reconciliation rather than memory-based guessing.

### Verification unavailable

- Record `NOT_RUN` and the reason.
- Never convert absence of failure into a passing result.

### Supabase unavailable

- Treat local JSONL as pending offline journal evidence only.
- Do not claim remote durability or projection success.

## 8. Testing and Verification

Implementation follows red-green testing:

1. add the contract test before the four required artifacts;
2. verify that CI fails because the artifacts are missing;
3. add the minimal artifacts that satisfy the contract;
4. run the repository verification workflow through GitHub Actions;
5. inspect the final changed-file set and commit status;
6. open a draft pull request against `reconcile/bear-edge-canonical-v1`.

No merge is part of this task.

## 9. Non-goals

This change will not:

- install or authenticate Create State on the user’s physical Mac;
- modify the upstream Create State plugin;
- create or promote a betting model;
- alter Supabase schema or data;
- alter Statsig controls;
- place, authorize, or simulate a wager;
- reconcile unrelated experimental branches;
- claim a restored session succeeded while the Create State service is unavailable.

## 10. Acceptance Criteria

The feature is complete when:

1. the isolated branch contains the design, plan, contract test, two skills, operating protocol, and handoff template;
2. the contract test has been observed failing before implementation;
3. `npm run verify` passes through repository CI on the final commit;
4. the branch remains based on `reconcile/bear-edge-canonical-v1` without merging `master` or experimental branches;
5. a draft pull request is opened against `reconcile/bear-edge-canonical-v1`;
6. the final report distinguishes repository-complete work from the unresolved Create State HTTP 403/authentication blocker.