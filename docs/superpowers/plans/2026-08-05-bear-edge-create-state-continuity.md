# Bear Edge Create State Continuity Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a tested, project-local Cursor restore-and-handoff protocol that uses Create State for continuity while keeping GitHub, Supabase, and fixed research-only safety boundaries authoritative.

**Architecture:** Two project-local Cursor skills drive the start-of-session restore gate and end-of-session handoff gate. A canonical operating document and YAML packet template make the policy inspectable, while a Node contract test prevents required authority, evidence, and safety language from silently disappearing.

**Tech Stack:** Cursor Agent Skills (`SKILL.md`), Create State MCP tool names, Markdown, YAML, Node.js 20 `node:test`, GitHub Actions.

## Global Constraints

- Work only on `chore/bear-edge-create-state-continuity`, based on `reconcile/bear-edge-canonical-v1` commit `8f0d6cb7052db8ee3d6b29dc5994100956b09766`.
- Do not merge `master`, PR #17, PR #19, or any experimental branch.
- GitHub is authoritative for committed code and branch/commit identity.
- Supabase is authoritative for durable append-only events only after remote verification.
- Local JSONL is an offline write-ahead and replay journal.
- Create State is continuity memory only.
- Authorization remains `RESEARCH_ONLY` or stricter.
- Authorized stake remains `$0`.
- Wager execution remains disabled.
- Do not install dependencies, change models, modify Supabase, change Statsig, place wagers, or claim physical-device installation.
- Every failed or unrun check must be reported truthfully as `FAILED`, `UNKNOWN`, or `NOT_RUN`.

---

## File Map

- Create: `test/create-state-continuity.test.js` — executable repository contract for continuity artifacts.
- Create: `.cursor/skills/bear-edge-session-restore/SKILL.md` — fail-closed start-of-session restore workflow.
- Create: `.cursor/skills/bear-edge-session-handoff/SKILL.md` — evidence-first end-of-session handoff workflow.
- Create: `docs/canonical/CREATE_STATE_CONTINUITY.md` — human operating protocol and exact prompts.
- Create: `docs/canonical/templates/CREATE_STATE_HANDOFF.yaml` — structured continuity packet.
- Existing: `.github/workflows/ci.yml` — already runs `npm ci` and `npm run verify` for `reconcile/**`; do not modify unless final evidence proves it is required.

### Task 1: Add the failing continuity contract

**Files:**
- Create: `test/create-state-continuity.test.js`

**Interfaces:**
- Consumes: repository files under `.cursor/skills/` and `docs/canonical/`.
- Produces: `node:test` assertions automatically included by `npm test`.

- [ ] **Step 1: Write the failing test**

Create `test/create-state-continuity.test.js` with helpers that read files from the repository root and separate tests for file existence, restore policy, handoff policy, operating authority, template fields, and fixed safety language.

Required test shape:

```javascript
const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const ROOT = path.resolve(__dirname, "..");
const FILES = {
  restore: ".cursor/skills/bear-edge-session-restore/SKILL.md",
  handoff: ".cursor/skills/bear-edge-session-handoff/SKILL.md",
  protocol: "docs/canonical/CREATE_STATE_CONTINUITY.md",
  template: "docs/canonical/templates/CREATE_STATE_HANDOFF.yaml"
};

function readRequired(relativePath) {
  const fullPath = path.join(ROOT, relativePath);
  assert.equal(fs.existsSync(fullPath), true, `missing required continuity artifact: ${relativePath}`);
  return fs.readFileSync(fullPath, "utf8");
}

function assertIncludesAll(content, expected, label) {
  for (const value of expected) {
    assert.match(content, value, `${label} must include ${value}`);
  }
}
```

The individual tests must assert the exact contract specified in the design document, using stable regular expressions rather than brittle full-file snapshots.

- [ ] **Step 2: Commit the test before implementation**

Commit message:

```text
test: define Create State continuity contract
```

- [ ] **Step 3: Verify RED through GitHub Actions**

Check the workflow run for the test commit.

Expected result: `npm run verify` fails because at least `.cursor/skills/bear-edge-session-restore/SKILL.md` is missing. A syntax error, dependency error, or unrelated existing test failure does not count as a valid red phase.

### Task 2: Implement the restore gate

**Files:**
- Create: `.cursor/skills/bear-edge-session-restore/SKILL.md`
- Test: `test/create-state-continuity.test.js`

**Interfaces:**
- Consumes Create State tools: `listHandoffPackages`, `restoreFromHandoff`, `listUserWorldModels`, `getProjectWorldModel`.
- Consumes repository evidence from GitHub/git and, when requested, Supabase durable records.
- Produces a restore report classified as `ESTABLISHED_FACT`, `REASONABLE_INFERENCE`, and `OPEN_QUESTION`.

- [ ] **Step 1: Add concise skill frontmatter**

Use:

```yaml
---
name: bear-edge-session-restore
description: Safely restore Bear Edge context, then verify it against repository evidence.
---
```

- [ ] **Step 2: Implement project-first candidate selection**

Require the agent to identify the intended repository/project before selecting a handoff. Rank exact repository/world-model match before timestamp. Never merge handoffs automatically.

- [ ] **Step 3: Implement the evidence gate**

Require checks for repository, remote, branch, commit, working tree when available, declared verification command, last test evidence, model status, Supabase status, authorization mode, authorized stake, and execution state.

- [ ] **Step 4: Implement failure behavior**

Explicitly reject conflicting claims, report HTTP/authentication/tool failures, mark unverified checks `UNKNOWN` or `NOT_RUN`, and stop before edits when authoritative evidence disagrees.

- [ ] **Step 5: Commit the restore skill**

Commit message:

```text
feat: add Bear Edge session restore gate
```

### Task 3: Implement the handoff gate

**Files:**
- Create: `.cursor/skills/bear-edge-session-handoff/SKILL.md`
- Test: `test/create-state-continuity.test.js`

**Interfaces:**
- Consumes Create State tools: `captureConversationContext`, `createSessionHandoff`.
- Consumes fresh repository, verification, runtime, model, ledger, and authorization evidence.
- Produces a structured continuity packet followed by a Create State handoff only when both calls succeed.

- [ ] **Step 1: Add concise skill frontmatter**

Use:

```yaml
---
name: bear-edge-session-handoff
description: Save an evidence-backed Bear Edge handoff without promoting memory to authority.
---
```

- [ ] **Step 2: Require fresh evidence and verification status**

The skill must collect exact branch/commit/working-tree state and run or verify `npm run verify` when execution is available. Unrun verification must remain `NOT_RUN`.

- [ ] **Step 3: Require secret exclusion and structured capture**

The skill must exclude API keys, tokens, cookies, one-time codes, private account data, and unredacted screenshots. It must populate the canonical YAML fields and call `captureConversationContext` before `createSessionHandoff`.

- [ ] **Step 4: Implement truthful result reporting**

A failed capture or handoff call must be reported as failed. The agent must not claim that a handoff ID, saved state, or active world model exists without a successful tool response.

- [ ] **Step 5: Commit the handoff skill**

Commit message:

```text
feat: add Bear Edge session handoff gate
```

### Task 4: Add the operating protocol and packet template

**Files:**
- Create: `docs/canonical/CREATE_STATE_CONTINUITY.md`
- Create: `docs/canonical/templates/CREATE_STATE_HANDOFF.yaml`
- Test: `test/create-state-continuity.test.js`

**Interfaces:**
- Consumes: the two skill contracts.
- Produces: human-readable operating rules and a machine-readable-enough YAML packet for context capture.

- [ ] **Step 1: Write the canonical operating protocol**

Include:

- purpose and non-authority of Create State;
- the six-level authority hierarchy;
- exact start, during, and end procedures;
- restore rejection conditions;
- HTTP/authentication outage behavior;
- exact user prompts for restore and handoff;
- installation/authentication boundary for the physical Cursor environment;
- the current known external blocker recorded as an observed ChatGPT connector HTTP 403, without asserting Cursor will have the same failure.

- [ ] **Step 2: Write the YAML template**

Use explicit fields and safe defaults such as:

```yaml
schema_version: 1
project:
  name: Bear Edge
  repository: UNKNOWN
repository_state:
  branch: UNKNOWN
  commit: UNKNOWN
  working_tree: UNKNOWN
verification:
  command: npm run verify
  result: NOT_RUN
authorization:
  mode: RESEARCH_ONLY
  authorized_stake_usd: 0
  execution_enabled: false
secret_redaction_confirmed: false
```

Include all design-required evidence lists, blockers, next action, and prohibited actions.

- [ ] **Step 3: Commit the documentation and template**

Commit message:

```text
docs: add Create State continuity protocol
```

### Task 5: Verify GREEN and open the draft pull request

**Files:**
- Verify all files listed in the File Map.

**Interfaces:**
- Consumes: final branch commits and GitHub Actions status.
- Produces: evidence-backed draft PR against `reconcile/bear-edge-canonical-v1`.

- [ ] **Step 1: Verify the final branch head**

Confirm the branch still descends from `8f0d6cb7052db8ee3d6b29dc5994100956b09766` and includes only the planned continuity files plus the design and plan.

- [ ] **Step 2: Verify GREEN through GitHub Actions**

Expected command: `npm run verify`.

Expected result: success. Record the exact final commit SHA and workflow status. Do not claim local execution because this implementation uses GitHub repository APIs.

- [ ] **Step 3: Review the diff**

Confirm there are no changes to model code, Supabase migrations, Statsig, provider configuration, bankroll data, wagering logic, or execution controls.

- [ ] **Step 4: Open a draft pull request**

Base: `reconcile/bear-edge-canonical-v1`  
Head: `chore/bear-edge-create-state-continuity`

PR title:

```text
Harden Bear Edge session restore and handoff continuity
```

The body must distinguish:

- repository implementation and CI evidence;
- unverified physical Cursor installation;
- unresolved Create State service/authentication status;
- unchanged `RESEARCH_ONLY`, `$0`, execution-disabled boundary.

- [ ] **Step 5: Re-attempt the Create State connection once**

Call `listHandoffPackages` after repository work is complete. If it still returns HTTP 403, report that exact blocker and do not claim a handoff was restored or created.

- [ ] **Step 6: Final report**

Report exact branch, commits, PR, CI result, changed files, verified boundaries, and external blockers. Separate established facts, reasonable inferences, and open questions.