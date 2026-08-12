## VERDICT: PASS_WITH_FINDINGS

**Scope of this review.** I read the four pasted artifacts as text. I did not clone the repo, recompute the four SHA-256 digests, run any test, or observe the doctor/release reports. Every builder-reported number below is treated as a claim. Nothing in this review establishes calibration, security, profitability, or wagering readiness, and nothing here should be read as changing `predictiveImprovement=NOT_EVALUATED`, `modelValidation=NOT_ESTABLISHED`, `wageringAuthority=UNCHANGED`, or `PRICE_CHECK_ONLY`.

---

## Diagnosis

The manifest and validator are a **well-formedness check on a policy document**, not an enforcement mechanism over the running system. `validateBoundaryManifest` is 90% of the code and it validates the manifest against itself plus hardcoded constants. `auditRepositoryBoundaries` adds four thin repository checks: registry status, a registry name regex, a single-token substring scan of `src/**/*.js`, and one literal string check in one dashboard file.

Spec §3 lists seven separation rules. Four of them — no cross-lane ledger appends (1), no cross-lane bankroll reads (2), no sportsbook American-odds math on contract prices (4), read-only comparison code (5) — have **no executable representation anywhere in the supplied artifacts**. Rule 6 (immutable content-addressed imports, fail closed on missing identity) exists only as four booleans the validator confirms are still `true` in a JSON file. Milestone 1's own checklist is narrower than §3 and is substantially met; the problem is that §3 reads like enforcement and the delivered artifact enforces a subset. That gap should be stated in the audit trail rather than left for a reader to infer.

I considered FAIL. I landed short of it because the fixed boundaries *are* hardcoded in `FIXED_BOUNDARIES` rather than read from the manifest, nothing in the artifacts grants wagering authority or promotes a model, and the spec's disclosure discipline (§2 closing paragraph, §5, §6) is the strongest part of the package.

---

## Findings

### High

**BE-01 — Fail-open scan when a scanRoot is absent.** `auditRepositoryBoundaries` → `listJavaScriptFiles` returns `[]` if the directory does not exist. If `scanRoots` is ever wrong (typo, monorepo restructure to `packages/*/src`), the prohibited-token scan inspects zero files and the function still returns `status: "PASS"`. This is the clearest fail-open in the package, and it sits inside a check Milestone 1 explicitly claims. *Fix:* require each entry in `scanRoots` to resolve to an existing directory, and require `sourceFiles.length > 0`, throwing `EMPTY_SCAN_SURFACE` otherwise.

**BE-02 — Audit target is caller-controlled and unreported.** `auditRepositoryBoundaries({ repoRoot, manifestPath })` will audit any directory containing a `package.json` with `name: "betting-decision-engine"` — which the test fixture fabricates in four lines. The returned object includes `manifestPath` but **not** `repoRoot`. A recorded "boundary audit PASS" therefore does not identify which tree was scanned. *Fix:* return `repoRoot` and the manifest's SHA-256 in the result; have the native verification entry point call with no arguments and assert the resolved root equals the git toplevel.

**BE-03 — Token scan misses most of the file surface it implies it covers.** In `listJavaScriptFiles`: only `.js` is matched, so `.mjs`, `.cjs`, `.ts`, `.tsx`, `.json`, and config files pass unscanned. `entry.isDirectory()` / `entry.isFile()` are both false for symlinks, so symlinked files and directories are silently skipped. `scanRoots` is `["src"]` only, so `scripts/`, `lib/`, `tools/`, `server/`, and `bin/` are unscanned. *Fix:* extension allowlist covering the repo's actual source extensions, `fs.lstatSync` symlink handling that either follows-with-realpath or throws, and scanRoots covering every directory that ships.

**BE-04 — The validator exempts itself from the prohibition scan.** `sourceFiles.filter(f => path.resolve(f) !== validatorPath)` creates a permanent blind spot at `src/governance/system-boundaries.js`. Kalshi integration code placed in that one file passes the audit it is supposed to perform. *Fix:* replace the path exemption with a narrow mechanism that cannot cover executable code — move the token list out of the scanned tree entirely (e.g. read tokens from the manifest and store the validator outside `src`), or pin the validator's own SHA-256 in CI so tampering is detected independently.

**BE-05 — Sweet Bear tokens are not prohibited in source at all.** `sourceTokens: ["kalshi"]`. The registry check regexes for `sweet[_ -]?bear|kalshi`, but the source scan does not. A Sweet Bear DraftKings Predictions execution path in `src/` passes cleanly. Given §3 lists DraftKings Predictions as a lane that must never write Bear Edge decision logs or substitute sportsbook odds, this asymmetry is unexplained. *Fix:* add the Sweet Bear tokens to `sourceTokens`, or document in the spec why only Kalshi is source-prohibited.

**BE-06 — Model identity does not implement the spec's tuple.** Spec §3 rule 3 defines identity as *lane, model ID, version, implementation digest, feature cutoff, evidence digest*. The registry check in `auditRepositoryBoundaries` inspects `modelId`, `modelVersion`, `marketFamily`, and `dataSources` — **no lane field, no implementation digest, no feature cutoff, no evidence digest is required to exist**. Relabeling is prevented only by a name regex, so a Sweet Bear model registered as `sb_batter_v1` or `dkp_contract_v2` passes. *Fix:* require a `lane` field equal to `bear_edge_core` on every registry entry, plus non-empty `implementationDigest`, `featureCutoff`, and `evidenceDigest`; throw on any missing field.

**BE-07 — Payout-math separation is unverified.** `allowContractPriceAsSportsbookAmericanOdds` is checked only for being the literal `false` in JSON. No code path is inspected. The supplied artifacts contain no odds or payout module, so a PASS from this audit says nothing about goal 1's payout-math question. *Fix:* state this explicitly in the audit trail as out of scope, and add a targeted check that any American-odds conversion function rejects inputs tagged with a contract-price provenance.

### Medium

**BE-08 — `researchOnlyModelCount` is fabricated, not computed.** `researchOnlyModelCount: models.length`. It is correct today only because an earlier `requireCondition` would have thrown. As a reported figure it is a tautology, and the test `assert.equal(result.researchOnlyModelCount, 1)` is a vacuous assertion. *Fix:* `models.filter(m => m?.modelStatus === "research_only").length`, then assert equality with `modelCount` as a separate invariant.

**BE-09 — Two different regexes for the same concept.** Registry: `/(?:sweet[_ -]?bear|kalshi)/i`. Dashboard: `/(?:sweetBear|kalshi)[^"'\\n]*bankroll/i`. The second does not match `sweet_bear`, `sweet-bear`, or `sweet bear`, so `localStorage.getItem("sweet_bear.bankroll")` in `app.js` passes. The check also only reads `src/dashboard/app.js`; bankroll access from any other module is unexamined. *Fix:* one shared token regex constant; scan all files under the dashboard root for bankroll key literals rather than one file.

**BE-10 — The dashboard positive check is a cargo-cult literal.** `dashboardSource.includes('bankroll: "bearEdge.bankroll"')` requires that exact spacing and quote style. A formatter pass, a single-quote refactor, or extracting the key to a constant breaks the audit — pressuring maintainers to preserve a vestigial string rather than a real property. The fixture in `withFixture` was authored to contain that exact string, so the test proves only that the fixture matches itself. *Fix:* parse the key from the module's exported storage-key map, or assert on a `STORAGE_NAMESPACE` constant.

**BE-11 — `allowedImportMode` is never validated.** A lane could declare `"allowedImportMode": "full_write"` and pass. There is also no strict schema: unknown lane fields are ignored, so a consumer honoring `ledgerRootsAlt` would go unnoticed. *Fix:* enum-validate `allowedImportMode`; add a JSON Schema with `additionalProperties: false` for lanes and for the manifest root.

**BE-12 — The focused test count dropped 166 → 128 without explanation.** Spec §2 records a focused baseline of 166. The builder now reports focused 128/128 *after* adding 8 tests. Full 701 → 709 reconciles exactly with the 8 new `test()` calls in the adversarial file, which corroborates the full-suite claim — and makes the focused delta of −38 (−46 net) conspicuous. Either the focused selector changed scope or tests were removed or skipped. *Fix:* record both exact command lines and the diff of selected test names in the audit trail before this is presented as evidence.

**BE-13 — The test suite is not hermetic.** The EPERM story means the passing run had *more* capability than the failing one: loopback and cache write. For a boundary audit, tests that can reach loopback are tests whose isolation depends on the sandbox rather than on the code. *Fix:* identify which of the 709 require loopback; run the boundary and permission tests in a network-denied lane and assert `PRICE_CHECK_ONLY` holds there.

### Low

**BE-14** — `requireRelativePath` accepts a drive-letter absolute path (`C:/data`), since `path.posix.isAbsolute` returns false for it. Low impact on POSIX CI, but it is a hole in a path-safety guard. **BE-15** — Nothing calls `realpath` on declared roots; `data/logs` could be a symlink into another lane's storage. **BE-16** — `validateBoundaryManifest` returns the caller's mutable object unfrozen; validated-then-mutated is possible in-process. Use `Object.freeze` deeply or return a normalized copy. **BE-17** — Tests index lanes positionally (`manifest.lanes[1]`, `[2]`). Reordering the manifest silently retargets the mutations. Look up by `laneId`.

---

## What the local tests establish — and what they do not

**Establish:** the validator rejects eight specific hand-authored manifest and fixture mutations; the fixed-boundary strings live in code, not only in JSON; a synthetic three-file tree containing the literal token `kalshi` in a `.js` file under `src/` is rejected.

**Do not establish:** that the *real repository* passes (every audit assertion in the suite runs against `withFixture`, and `modelCount === 1` is a fixture fact); that any cross-lane write, bankroll read, promotion, or authority transfer is actually blocked at runtime — no test mutates *code* to attempt one; that the fixed boundaries are enforced — **there is no test that mutating `predictiveImprovement`, `modelValidation`, `wageringAuthority`, or `defaultAuthorization` throws `AUTHORIZATION_BOUNDARY_CHANGED`.** That is the single most important invariant in the program and it is the one untested. Also untested: `LANE_SET_CHANGED`, `WRONG_REPOSITORY`, `UNSAFE_OWNERSHIP_PATH`, `EMPTY_MODEL_REGISTRY`, non-`.js` token evasion, and the BE-01 empty-scan path.

Separately: the four artifact digests were computed over a worktree the spec itself records as dirty (75 modified, 63 untracked at entry). They pin pasted text, not a committed state.

---

## 1,000-credit handling (goal 3)

The **disclosure** is honest and should stay as written — §5 states the repo cannot read the balance, refuses the credits-to-hours conversion, and declines to claim what this work consumed. That is the correct posture.

The **control** is not a control. No artifact contains a credit log, field, or check, so rule 1 ("record the displayed balance") is unauditable after the fact and rule 6 ("never start a milestone if its completion cannot fit inside the remaining balance") requires a per-milestone cost estimate that §5 has just said cannot be derived — it is unexecutable as written. Recommend: (a) add an append-only `governance/credit-log.jsonl` with milestone, ISO timestamp, self-reported balance, and an explicit `SELF_REPORTED_UNVERIFIED` field; (b) rewrite rule 6 as a reserve floor plus hard stop, dropping the prediction requirement; (c) describe §5 as an *operator discipline*, not a system control, so no later reader mistakes it for enforcement.

---

## Recommendation

Ship Milestone 1 as an internal artifact, not as a boundary guarantee. Before the audit trail records Milestone 1 acceptance, close BE-01, BE-02, BE-06, and add the missing `AUTHORIZATION_BOUNDARY_CHANGED` tests — those four are cheap and they are the difference between "the audit can fail to fail" and "the audit fails closed." Then amend the spec so §3 marks each of the seven rules as **ENFORCED** or **DECLARED_ONLY**, and change Milestone 1's acceptance line to name only the subset the validator actually covers.

**Next move:** BE-01 + BE-02 + the four fixed-boundary tests in one commit, then re-run and record both exact focused and full command lines with their selected-test lists to resolve BE-12. Do not open Milestone 2 until the 166→128 discrepancy has a written cause.
