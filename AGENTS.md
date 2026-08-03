# Bear Edge — Standing Reviewer Protocol
**Version 1.0 — 2026-07-23**

Purpose: preserve the review discipline developed during Phase 0 / Phase 1 file
classification so it survives independent of any single conversation, AI session,
or reviewer. This document is the standard. If a future session's behavior
conflicts with this document, this document wins until deliberately revised.

---

## 0. Why this exists

The original failure mode was looping: an AI development partner would declare
work "complete" or "verified," the human would discover later it wasn't, and the
cycle would restart with no persistent record of actual state. The fix was not
better prompts. The fix was:

1. A human-held ground truth that does not depend on AI memory.
2. One change at a time, verified before the next begins.
3. Explicit separation between *claimed* and *independently confirmed*.
4. A mandatory self-audit where the builder names its own soft spots.

This document encodes those.

---

## 1. The four-step loop (non-negotiable)

**Ground truth → one change → verify → log → next.**

- **Ground truth first.** Before proposing a fix, establish the actual current
  state: exact file, exact observed behavior, exact expected behavior. If the
  current code isn't in front of you, ask for it. Do not reconstruct from memory
  of earlier messages.
- **One change at a time.** One file or one function per pass. No bundling. No
  "while I'm in here" improvements.
- **State confidence before the human runs it.** Verified (logic traced, high
  confidence) vs. guess (inferred cause, incomplete visibility). Never present a
  guess as a certainty.
- **Human verifies, then it gets logged.** Only after confirmation does an item
  move to done. A failed fix returns to step 1 with new information — it does not
  get a second fix stacked on top of an unverified first one.
- **No silent scope changes.** If a fix reveals a larger architectural problem,
  stop and flag it as a separate decision.

---

## 2. Mandatory self-audit ("Questions for Claude")

Every substantive response ends with a separate section named
**"Questions for Claude."** It must:

1. **Flag over-claimed confidence.** Any use of "verified," "complete,"
   "confirmed," or any specific number — name which parts were inferred or
   assumed rather than independently checked.
2. **Flag what a second reviewer is better positioned to check** — cross-file
   math reconciliation, checksum/hash verification, algorithmic edge cases,
   anything requiring comparison of multiple artifacts against each other.
3. **State what was NOT verified**, not only what was.
4. **Ask specific, answerable questions.** Not "does this look right?" but
   "I claimed these checksums match; independently hash these files and confirm."
5. **Say so explicitly if there is nothing to flag.** A padded or invented
   uncertainty section is worse than none — it destroys the signal value of the
   section.

---

## 3. Standing epistemic boundaries

These get restated every pass, not assumed. Repetition is the point: as passing
test counts accumulate, it becomes psychologically easy to let volume feel like
validation. It isn't.

| Claim | What it actually establishes |
|---|---|
| "536/536 tests passed" | The code does what the test authors expected. Not that the tests are adversarially complete. |
| "Searched the repo, found nothing" | No *static* reference found. Not that no path exists (dynamic key construction, spread config objects). |
| "Filesystem inspection confirms X" | First-party review. Not independent security review. |
| "Model is calibrated" | Only if backed by preregistered predictions at real sample size — never by backtest alone. |

**Never conflate:** first-party testing with independent verification;
documentation consistency with code correspondence; "we couldn't find a hole"
with "someone tried to break it and failed."

---

## 4. Reviewer question bank (by situation)

### When a file is proposed for commit
- Does the documentation describe what the code *does*, or what it's *intended
  to do*? Show the source line, not the prose.
- Are any specific numbers in this file (thresholds, limits, versions) diffed
  against the literal enforced constant in code?
- Does this file's change touch an auth, authorization, or money path? If yes,
  raise the bar: require the search transcript, not the search conclusion.
- Is this edit scoped to exactly what was approved, or did it pick up neighbors?

### When something is claimed "removed" or "disabled"
- Was it removed from the *production path*, or only from documentation/example
  config?
- Show the unrestricted search: literal string, likely variants, and dynamic
  access patterns (`process.env[var]`, spread/destructured config).
- Are the remaining references confined to tests and superseded plans? Name them.

### When integrity artifacts are produced (checksums, manifests, ledgers)
- Was the manifest generated **after** the final edit to every file it covers?
  (Real failure caught this way: SHA256SUMS generated mid-process, then files
  were edited, producing a manifest that didn't match its own artifacts.)
- Independently recompute. Do not accept the manifest as evidence of itself.
- Does the ledger reconcile by a second method? (e.g. stake + realized P&L ==
  payout, computed independently of the summary block.)

### When a probability, model, or edge claim is made
- Is any empirically observed value ever *raised* by a floor, prior, or
  adjustment? (Real failure caught this way: a 0% observed joint hit rate was
  overridden to 21.25%, producing +665% EV on an impossible parlay.)
- What happens on zero-sample, missing-sample, unequal-length, and mutually
  exclusive inputs? Each must fail closed, never return a synthetic estimate.
- Is this backtested, or preregistered? Only the latter supports a calibration
  claim.

### When terminology is used
- Does the word overclaim the property? "One-time" vs. "process-scoped."
  "Validated" vs. "research_only." "Verified" vs. "tested."
- Reserve strong terms for states that have actually been earned by shipped code.

---

## 5. Severity triage

Rank by *blast radius if wrong*, not by how hard it is to fix.

- **Rotate/revoke immediately:** any credential that reached an output sink
  (stdout, stderr, logs, returned URLs, reports). You cannot scrub scrollback,
  screen recordings, synced clipboards, or log aggregators retroactively. The
  only remedy is invalidating the secret.
- **Quarantine immediately:** anything that can *invert* a result rather than
  merely degrade it. A miscalibrated estimate is wrong by a margin; a fabricated
  probability can promote the single worst option as the best.
- **Block release, not safety:** reproducibility gaps (uncommitted tree, stale
  package). Nothing unsafe ships, but "what passed" and "what ships" being
  different artifacts means no audit result is durable.
- **Track, don't block:** residual-lifetime issues, log growth, duplicate
  artifacts. Real, but they don't invert results or leak master credentials.

**Reproducibility standard:** clean tree → tests pass → package built → package
installs and smoke-tests clean *in a separate environment* → only then is it a
release candidate. Testing in the environment you built in proves nothing about
portability.

---

## 6. Follow-up ticket discipline

"Commit with follow-up" is only acceptable if the follow-up has concrete
specifics attached *at the moment of approval*, while context is fresh — the
actual design, the acceptance criteria, the test list. A vague ticket
("improve token lifetime") is how "temporary" quietly becomes permanent.

Good example of the standard: BEAR-SEC-001 specified 60-second maximum lifetime,
atomic first-use invalidation, replay/race rejection, separate session
credentials, redaction requirements, and 11 acceptance tests. That is a
follow-up ticket. Anything less is a deferral.

---

## 7. What must never be waved through

1. An integrity manifest that doesn't match its own files.
2. A credential fix verified only by the same party that wrote the fix.
3. A probability floor, prior, or adjustment that can raise an observed value.
4. A model promoted out of `research_only` on backtest rather than
   preregistered predictions.
5. A commit that bundles an approved change with unapproved neighbors.
6. Documentation whose specific numbers were never diffed against code.

---

## 8. Current standing state (as of 2026-07-23)

Update this section as reality changes; do not let it go stale.

- **Permission level:** `PRICE_CHECK_ONLY`
- **Models validated:** 0/4 — all `research_only`
- **Priced candidates:** 0 (odds provider at zero credits)
- **DraftKings role:** manually verified comparison price only. Never a primary
  automated feed. ToS position: verify the specific retrieval method against
  actual terms; do not assume authorization either way.
- **Simulator ↔ Bear Edge:** no connecting code path. This containment is
  deliberate and must be preserved until the simulator is safe, tested, and
  given a versioned export schema plus a fail-closed shadow importer that cannot
  authorize a bet by construction.
- **Independent validation:** none performed. No external penetration test, no
  independent statistical review, no third-party code review.
