# Unified MLB and Total-Bases Experimental Lineage

## Bear Edge Total-Bases Simulator

- repository: `davidmostow1/bear-edge-platform`
- pull request: #4
- recorded commit: `c0f0c3c4e81809ec131193e7b6a3126755b0de93`
- status: `SHADOW_EXPERIMENT`
- calibration: not established
- validation: not established
- operational promotion: none

This simulator must remain distinct from any later unified MLB total-bases implementation. A working Monte Carlo output or passing software test does not establish a trained or calibrated market edge.

Evidence still required:

- exact PR #4 head branch
- base commit
- complete changed-file list
- test-first failing commit or captured red transcript
- final passing commit and test transcript
- sample shadow card and input hash
- model assumptions and parameter provenance
- any CI failure and rerun history

## Sweet Bear Unified MLB v1

- pull request: #8
- status: `FAILED_DATA_BUILD_GATE`
- reported history build: 4,858 games, 341,183 plate appearances, 787 batters, 1,108 pitchers
- failure: expected at least 1,000 batters, received 787
- validation: not reached
- promotion: none

Independent MLB Stats API reconciliation found approximately:

- 2024: 182,449 PAs, 651 batters with a PA
- 2025: 182,926 PAs, 673 batters with a PA
- combined: 365,375 PAs, 788 unique player IDs

The build is therefore short approximately 24,192 PAs, but its 787 unique batters is very close to the official two-season combined count of 788. The >1,000 batter gate appears to be based on a faulty premise and must not be silently changed without a separate reviewed decision.

A Baseball Savant weekly query returning exactly 25,000 pitch rows across 91 games and 6,416 distinct PAs strongly indicates endpoint truncation in week-sized extraction chunks. This is evidence of likely data-source truncation, not a completed root-cause repair.

Evidence still required:

- exact PR #8 head branch and commit
- workflow run IDs
- raw build logs
- generated history artifact inventory
- chunk request parameters
- per-chunk row counts
- missing-game/PA reconciliation report
- explicit decision on the 1,000-batter threshold
- rebuilt history and rerun only after review

## Sweet Bear Unified MLB v2 Probe

- pull request: #9
- title/history includes `DO NOT CREATE`
- status: `NONCANONICAL_PROBE_OR_ABANDONED_EXPERIMENT`
- validation: not established
- promotion: none

The v2 probe must not supersede v1 merely because its version number is higher. Its exact purpose, base, head commit, and relationship to the failed v1 build remain to be reconciled.

Evidence still required:

- exact PR #9 head branch and commit
- why it was marked `DO NOT CREATE`
- whether any artifacts differ from v1
- formal abandonment, diagnostic-only, or supersession decision

## Shared governance boundary

These lineages are preserved for forensic continuity. None is authorized as a validated prediction machine. Failed workflows, shadow simulations, and probes must remain visible rather than being overwritten by later success claims.
