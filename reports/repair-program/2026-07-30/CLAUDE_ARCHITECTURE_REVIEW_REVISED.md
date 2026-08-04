## VERDICT: PASS_WITH_FINDINGS

**Handoff answer up front:** Milestone 1 may be handed off as a bounded internal guardrail. Milestone 2 must stay closed — not because of these findings, but because its own entry conditions are unmet in the spec's own §2 table (stale live snapshot, required odds not verified, DraftKings degraded, 0 closing-price records).

**Scope.** I read the five pasted artifacts as text. I did not clone the repository, execute `npm run verify`, run the boundary audit, or recompute any of the five reported digests. 183/183, 718/718, CHECKS_COMPLETE, and 75/100 remain builder claims. Nothing here establishes calibration, security, profitability, or wagering readiness; `predictiveImprovement=NOT_EVALUATED`, `modelValidation=NOT_ESTABLISHED`, `wageringAuthority=UNCHANGED`, `PRICE_CHECK_ONLY` are unchanged by this review.

---

## Diagnosis

The revision closed the two defects that made the prior package unsafe to hand off. BE-01 (empty scan surface returning PASS) is now `EMPTY_SCAN_SURFACE` with an existence, directory, symlink, and containment check plus `sourceFiles.length > 0`. BE-04 (validator self-exemption) is closed structurally rather than by filter — the validator moved to `governance/`, outside the scanned root, so the exemption line is gone. BE-08 is computed. BE-02 now returns `repoRoot` and `manifestDigest` and pins `manifestPath` to the canonical non-symlinked location.

Three things corroborate the builder's claims from inside the text, which is worth recording since I ran nothing:

- **Test arithmetic reconciles.** The file contains exactly 17 top-level `test()` calls. 166 + 17 = 183; 701 + 17 = 718. Both reported figures follow from the same delta. That is consistent with the selector-drift explanation for 166→128; it does not independently confirm it, since I cannot see which files either command selected.
- **The old validator copy must be gone.** With the self-exemption removed and no exclusion filter, any leftover `src/governance/system-boundaries.js` would contain `sweet_bear_kalshi` and trip `PROHIBITED_PRODUCTION_INTEGRATION`. A passing audit is therefore evidence the file was moved, not copied.
- **The manifest digest is unchanged** (`58978495…`) and the manifest text is byte-identical to round 1. That is internally consistent: the new enforcement (`allowedImportMode`, `requireExactKeys`) reads fields the manifest already carried.

The remaining findings are narrower. None is a fail-open that produces a false PASS on the *checked* surface. Two are gaps in what the surface covers, and they are the ones I would not leave unwritten.

---

## Remaining material findings

### Medium

**BE-18 — Bankroll detector is a four-prefix denylist, and misses backticks.**
`governance/system-boundaries.js` → `auditRepositoryBoundaries`, the `matchAll` loop.

Two independent gaps:

1. The capture regex is `/[\"']([a-zA-Z][a-zA-Z0-9_-]*\\.bankroll)[\"']/g` — single and double quotes only. A template literal, `` const k = `sweetBear.bankroll` ``, is not matched and the key is silently unobserved. The positive requirement (`observedBankrollKeys.has("bearEdge.bankroll")`) would still be satisfied by the legitimate quoted key elsewhere, so the audit returns PASS.
2. The `if` filter admits a key to `observedBankrollKeys` only when it matches `^(?:bearEdge|sweetBear|sweet_bear|kalshi)\\.bankroll$`. Anything else is discarded rather than flagged. `dkp.bankroll`, `predictions.bankroll`, `sb.bankroll`, and `sweet-bear.bankroll` all pass. `sweetBear.bankrollCents` also passes, since the regex anchors on the literal suffix.

The structure is inverted: it should collect *every* `*.bankroll`-shaped literal and require each to be in `allowedBankrollKeys`, rather than collect four known-bad prefixes and check those. *Fix:* add `` ` `` to both quote classes; drop the four-prefix `if` and add all matches to `observedBankrollKeys`; broaden the suffix to `\\.bankroll[a-zA-Z0-9_]*`. The spec's disclosure covers computed strings — it does not cover a literal the regex simply fails to see.

**BE-19 — The scan surface is now frozen at exactly one root and one token, and cannot be widened from the manifest.**
`validateBoundaryManifest`: `scanRoots.length === 1 && scanRoots[0] === "src"` and `sourceTokens.length === 1 && sourceTokens[0].toLowerCase() === "kalshi"`, both `PRODUCTION_PROHIBITION_WEAKENED`.

This correctly blocks the redirect-and-narrow attack the prior round raised. The cost is that any executable code outside `src` — `script/`, `governance/`, `lib/`, `bin/`, `server/`, build config — is permanently unscanned, and the manifest can no longer be amended to cover it. `script/check_system_boundaries.js` is itself production-adjacent executable code in the unscanned set. The blind spot moved from one file to one directory tree's complement.

Making policy require a code change is a defensible tradeoff and I would not reverse it. The problem is the *asymmetry*: the pin rejects both weakening and strengthening with the same error. *Fix:* change the condition to a superset test — `scanRoots` must *include* `"src"` and `sourceTokens` must *include* `"kalshi"`, each entry still passing `requireRelativePath`. That preserves the fail-closed property while allowing coverage to grow. Then add the roots that actually ship. Separately, note in §3's status table that `No Kalshi production path` is `PARTIAL_CHECK` **scoped to `src/`**, not to the repository.

### Low

**BE-20 — Model-identity relabeling protection is still brand-token pattern matching.** `auditRepositoryBoundaries` registry check. The join now covers `trainingCutoff`, `calculationImplementation.implementationDigest`, `.modules`, `calibrationReportDigest`, and `dataSources` — a real widening, and the five adversarial patches exercise it. But detection remains `/(?:sweet[_ -]?bear|kalshi)/i`. A Sweet Bear model registered as `contract_batter_v1` with modules under `src/contracts/` passes every check. Absent fields join as `undefined` and pass, so provenance *completeness* is not required. I accept the builder's rationale — the registry schema has no lane field, and inventing null evidence for research-only models would be worse. The spec labels this `PARTIAL_CHECK`. *Fix (Milestone 3, not now):* when the registry schema next changes, add a required `lane` field rather than extending the regex.

**BE-21 — The native entry's root assertion is self-referential.** `script/check_system_boundaries.js` → `main` compares `result.repoRoot` (derived from `governance/../`) against `path.resolve(__dirname, "..")`. Both derive from the same on-disk layout, so a copied or relocated package satisfies it. It confirms internal consistency, not identity. *Fix:* also compare against `git rev-parse --show-toplevel` and emit the commit SHA alongside `manifestDigest` in the printed result, so the recorded audit line identifies a commit rather than a directory.

**BE-22 — Symlink rejection is absolute; symlink checks elsewhere are absent.** `listExecutableSourceFiles` throws on *any* symlink entry under `src`, including a symlinked `.md` or asset that the extension filter would have skipped anyway. Fail-closed and therefore safe, but it will produce confusing failures in workspaces that symlink legitimately. Conversely, `models/registry.json` and `package.json` are read without an `lstat` symlink check, unlike the manifest. *Fix:* restrict the symlink throw to entries that would otherwise be scanned or descended; apply the manifest's symlink check to the registry and package files for symmetry.

**BE-23 — `deepFreeze` mutates the caller's input.** `validateBoundaryManifest` returns `deepFreeze(manifest)`, freezing the object the caller passed. This closes the validate-then-mutate hole correctly, but a caller holding a shared config object gets it frozen as a side effect. *Fix:* freeze a structured clone and return that; keep the identity assertion in the first test aligned with whichever you choose.

**BE-24 — Two hardcoded pins in the real-checkout test.** `assert.equal(result.modelCount, 4)` / `researchOnlyModelCount, 4` will fail when a fifth research-only model is registered — a legitimate Milestone 3 action. If the pin is intentional (it is a reasonable tripwire), say so in a comment; otherwise assert `modelCount === researchOnlyModelCount && modelCount > 0`.

**BE-25 — Credit ceiling still has no artifact.** §5 is now honestly labeled operator discipline, rule 6 is executable as written, and "no balance was supplied, so no credit-log entry was fabricated" is the correct disclosure. The residual is only that the ceiling leaves no auditable trace. This is honest and I would not block on it.

---

## Executed verification vs. text review

**Established by this review:** the five artifacts are internally consistent; the seven round-1 findings I rated High are addressed in the code as written, four of them structurally; the test file's 17 cases reconcile arithmetically with both reported counts.

**Not established:** that any test passes; that the digests match the pasted text; that the real checkout's `src/` is free of the Kalshi token; that `models/registry.json` holds 4 research-only entries; that the doctor and release reports say what is claimed. The single most valuable new test — `repository audit identifies and passes the real checkout` — is exactly the one whose value depends entirely on execution I did not perform.

**Still outside the audit's reach, regardless of execution:** runtime cross-lane ledger appends, runtime bankroll reads, dependency behavior, generated code, and the separate DraftKings Predictions and Kalshi runtimes. §3's status table now says this. The table is the most important addition in this revision and it should not be softened later.

---

## Recommendation

Hand off Milestone 1 as a bounded internal guardrail, with BE-18 fixed first — it is a ten-line change to a check that currently has a literal-string evasion, and it is the only finding where the audit can return PASS over a condition it claims to detect. BE-19 can follow in the same commit or the next; it does not create a false PASS, it limits scope, and the fix is a two-line inversion from equality to superset. BE-20 through BE-25 are backlog.

Record the disposition as: architecture checkpoint reviewed, `PASS_WITH_FINDINGS`, with the reviewed digests, this venue, and the explicit note that the reviewer executed nothing. Under §6 that is the honest entry — an LLM review agreeing with the builder is not independent security validation, and two rounds of it are still not.

**Next move:** BE-18 and BE-19 in one commit; re-run the comparable focused command and `npm run verify`; append the `check_system_boundaries` stdout (now carrying `repoRoot` and `manifestDigest`) to the audit trail as the Milestone 1 completion record. Do not open Milestone 2 until §2's live-provider row changes state on its own evidence.
