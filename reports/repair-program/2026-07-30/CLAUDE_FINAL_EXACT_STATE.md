**FINAL_EXACT_STATE: PASS**

**Suffix finding: RESOLVED_IN_TEXT.** The added `[a-zA-Z0-9_]*` after `.bankroll` captures suffix variants, and since every match now enters `observedBankrollKeys` against an exact `bearEdge.bankroll` allowlist, `sweetBear.bankrollCents` is rejected rather than ignored. The explicit adversarial case is the right one.

**Handoff-blocking regression: none visible in this change.** One thing to watch, not a blocker: the widened suffix class means `bearEdge.bankrollHistory` or similar legitimate derived keys would now also be rejected — correct fail-closed behavior, but it will surface as an audit failure the first time someone adds one. Note that in the audit trail so the failure reads as policy rather than bug.

Unchanged: text-only review, nothing executed or hashed; builder claims remain claims. Bounded internal guardrail only. Milestone 2 closed. No predictive, statistical, security, profitability, or wagering validation.
