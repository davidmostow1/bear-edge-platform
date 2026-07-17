# Bear Edge Elite Integrity Program Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Deliver the approved Bear Edge decision-integrity design as five independently testable releases, followed by a complete evidence audit.

**Architecture:** The local append-only ledger is authoritative. User-facing results persist locally before display, remote synchronization is asynchronous and idempotent, model promotion depends on time-ordered calibration evidence, and every completion claim is linked to retained test or runtime evidence.

**Tech Stack:** Node.js 20 or newer, CommonJS, built-in `node:test`, built-in `fetch`, filesystem JSONL, PostgreSQL 17 through Supabase, optional Statsig Node Core SDK, HTML, CSS, and browser JavaScript.

## Global Constraints

- Preserve `fairEdge` and `priceEdge` as separate values.
- Preserve `PASS`, `WAIT`, and `BET` as canonical evaluation verdicts.
- Preserve `PRICE_CHECK_ONLY` as an operational permission, not a verdict.
- The local ledger is authoritative and must succeed before a recommendation is displayed.
- Supabase, Statsig, and live providers must remain optional for local evaluation.
- Research-only models must never produce a qualified `BET` call.
- No code may place a wager automatically.
- No audit may claim future predictive certainty or profitability.
- Preserve unrelated tracked and untracked worktree changes.
- Use tests before production changes and commit each independently reviewable task.
- Use `/Applications/ChatGPT.app/Contents/Resources/cua_node/bin/node` through `PATH` when global Node.js is unavailable.

---

## Plan Set

| Order | Plan | Deliverable | Entry gate | Exit gate |
| --- | --- | --- | --- | --- |
| 1 | `2026-07-17-bear-edge-authoritative-ledger.md` | Canonical records, durable local ledger, persisted recommendations, settlements, and amendments | Approved design commit `0290140` | Every displayed evaluation persists before response and the focused plus full suite passes |
| 2 | `2026-07-17-bear-edge-supabase-outbox.md` | Retryable outbox, Supabase projection, migration, conflict checks, and sync health | Plan 1 complete | Offline behavior passes, migration passes, remote duplicate behavior is idempotent, advisors are reviewed |
| 3 | `2026-07-17-bear-edge-calibration.md` | Metric library, chronological backtests, model registry, promotion policy, and calibrated decision enforcement | Plan 1 complete; Plan 2 may run after its record contract is stable | Research models remain blocked and promotion fixtures pass every registered threshold |
| 4 | `2026-07-17-bear-edge-operations-ui.md` | Honest interface terminology, provenance display, Statsig control fallback, LAN write protection, and operator docs | Plans 1 through 3 complete | Desktop, phone-sized, local, restart, and LAN safety checks pass |
| 5 | `2026-07-17-bear-edge-full-audit.md` | Source, data, database, integration, mathematics, failure, traceability, and end-to-end evidence | Plans 1 through 4 complete | No unclassified requirement, file, relevant row, failure mode, or critical/high defect remains |

## Working-Tree Strategy

The current checkout contains pre-existing uncommitted work that is part of the product state. Do not create a clean worktree from `HEAD`, because that would omit those changes. Execute in the current checkout and use these controls:

1. Capture `git status --short` before each task.
2. Restrict each commit to the exact files listed in that task.
3. Inspect `git diff --cached --name-status` before every commit.
4. Never use `git reset --hard`, `git checkout --`, or broad restoration commands.
5. Stop and ask the user if an unexpected concurrent edit conflicts with the task's files.

## Program Baseline

- [x] **Step 1: Record the pre-implementation baseline**

Run:

```bash
git status --short
git rev-parse HEAD
PATH="/Applications/ChatGPT.app/Contents/Resources/cua_node/bin:$PATH" npm run verify
PATH="/Applications/ChatGPT.app/Contents/Resources/cua_node/bin:$PATH" npm run audit:release
```

Expected: the status lists the known dirty worktree, `HEAD` starts at or descends from `0290140`, verification passes, and release readiness remains truthful about provider and evidence blockers.

- [x] **Step 2: Preserve baseline evidence**

Create `data/reports/elite-audit/baseline.json` through the audit writer introduced in Plan 5, or temporarily retain the complete terminal output until Plan 5 imports it. The evidence must include command, start time, end time, exit code, commit identifier, and output digest.

### Baseline Result

- Recorded at commit `69a0e620ac0de85fd670237587860284d48617f1` on branch `codex/product-hardening-ci`.
- The pre-existing dirty worktree contained 42 tracked or untracked entries and was preserved without restoration or broad staging.
- `npm run verify` passed TypeScript checking and 138 of 138 tests with zero failures.
- `npm run audit:release` completed with `shippable-with-warnings`, score 85 of 100, and `PRICE_CHECK_ONLY` betting permission.
- The release audit reported blocked decision-log quality, zero of three legacy validation wins, provider error for verified odds, zero fresh priced candidates, zero exact DraftKings matches, stale live data, and no configured licensed injury or verified tennis feed.
- The operator doctor independently repeated verification and release audit successfully. The local dashboard server was not running during its API probes, so live API health and best-target responses were unavailable for this baseline.
- Retained release evidence: `data/reports/release_readiness.json`, SHA-256 `96bbc69b7bdab1a3e3a8a5c151411d5df526aa0d556184975c6c3da23961ac85`.
- Retained release summary: `data/reports/release_readiness.md`, SHA-256 `18e939b73b6ecbf4951b822b7d23816ef455caa756cf950d323f75d5f076d1b1`.
- Retained operator evidence: `data/reports/bear_edge_operator_doctor.json`, SHA-256 `b7b3e1fb5b8865e6fb938df95dbd233c2b67e3c9e3a137aae2450ebd8f46fa32`.
- Retained operator summary: `data/reports/bear_edge_operator_doctor.md`, SHA-256 `dc7ece1892685fd56304ceccb85aae361bb305dd564a2936e555fb98fbe0ec78`.
- Plan 5 must import the retained command evidence into `data/reports/elite-audit/baseline.json` without changing the recorded outcomes.

## Execution Rule

Execute each linked plan completely before starting the next dependent plan. After every task:

```bash
PATH="/Applications/ChatGPT.app/Contents/Resources/cua_node/bin:$PATH" npm run typecheck
PATH="/Applications/ChatGPT.app/Contents/Resources/cua_node/bin:$PATH" node --test <focused-test-file>
```

After every linked plan:

```bash
PATH="/Applications/ChatGPT.app/Contents/Resources/cua_node/bin:$PATH" npm run verify
```

Do not weaken a test, threshold, data-quality rule, or fail-closed condition merely to obtain a passing run.

## Final Program Gate

The program is complete only when Plan 5 generates all retained artifacts and the final result satisfies Section 23 of `docs/superpowers/specs/2026-07-17-bear-edge-elite-audit-design.md`.
