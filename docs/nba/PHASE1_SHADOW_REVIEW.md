# NBA Shadow Markets | Isolated Integration Review

**Status:** RESEARCH_ONLY. This branch is not a production model or executable recommendation source.

## Baseline and scope

- Base commit: `b25a3c67c9a7862196f31cf75f004abcdac0ccd0` on `master`.
- New module: `src/research/nba/shadow-props.js`.
- Adversarial fixtures: `test/nba-shadow-props.test.js`.
- Provides deterministic grading of supplied *joint simulation paths* for 18 theoretical market families across full-game and seven listed period labels (including full game); period-specific paths must actually exist.
- Preserves push probability; rejects empty paths, unsupported markets, malformed dates, prototype-only statistical data, mismatched frozen-model event and overtime flags, missing player scores, and missing provenance.
- No NBA data ingestion, injury feed, trained model, authenticated provider price, sportsbook execution, DraftKings Predictions order book, fees or real-money recommendation.
- Inputs labeled `frozen_model` contain caller-provided digests; this is **not** third-party authentication, proof of model registration, calibration, source rights, or preserved point-in-time capture.
- The Wilson interval covers finite Monte Carlo sampling variation only, not model uncertainty.

## Authority and security

The canonical research boundary remains `RESEARCH_ONLY`, `PRICE_CHECK_ONLY`, `authorizedStakeUsd=0`, `executionEnabled=false`. Nothing is wired into `src/index.js`, the provider adapters, operator wallet or payout logic. Neither the existing model registry nor the Supabase authority cutover is modified.

The `contractRuleId` input is an asserted reference, *not* authenticated settlement evidence. Named markets are illustrative and may not exist on the intended execution venue. Cross-platform price comparisons must never be passed off as DraftKings Predictions executable quotes.

## Prerequisites before model design

1. Confirm an approved and documented source-purpose license for NBA historical stats, play-by-play, lineups, and retained injury/availability snapshots. Public URL accessibility is not evidence of permissible commercial or betting-model reuse.
   **Verified legal gate:** NBA.com Terms of Use, section 9 (https://www.nba.com/termsofuse), restrict use of NBA Statistics in gambling activity, fantasy/commercial products, and regularly updated databases without appropriate permission. Do NOT build a betting-model training dataset from NBA.com or its publicly accessible endpoints on the assumption that accessibility grants usage rights. Obtain express NBA permission or a separately licensed data supplier with documented rights for this purpose.
2. Establish pregame `availableAt` timestamps for each actual fact, not merely a timestamp assigned when historical data was downloaded. Record source lineage and content digests.
3. Obtain and test exact price and settlement contracts for the *execution* platform. DraftKings Predictions and DraftKings Sportsbook are not the same quote class.
4. Verify current Supabase migration state, local journal identities and synchronization compatibility once database health is proven. No data backfill or authority cutover in this branch.
5. Review branch rules and repo public visibility with an administrator. No secrets or real-user betting records in this PR.

## Quantitative model plan

Implement versioned minutes/opportunity priors using injury-dependent rotations and role uncertainty. Then generate coherent possession-based team and player joint paths conditional on usage, field-goal attempts, 3PA, potential assists, rebound chances, pace, travel/rest and opponent scheme. The initial model families will be points, rebounds and assists; additional props and first-half/quarter markets require their own distribution validation. Fit and test only with chronological event-atomic partitions and zero data leakage.

The full-gate prospective cohort must include ALL eligible events and PASS/WAIT outcomes as well as apparent positive-EV signals. Current registry promotion minima include 500 settled predictions, 100 distinct events, 95% settlement coverage, 100 observations per reliability bucket, ECE <=0.03 and specified calibration/cluster-bootstrap gates. Passing those thresholds does not establish profit.

## Verification checklist

- [x] Standalone local Node test invocation passed 20/20 on the hardened module before branch publication.
- [ ] Confirm GitHub Actions `npm run verify` passes on the **exact branch head** after the PR is opened.
- [ ] Independently compare implementation and tests to committed blob identities.
- [ ] Confirm historical data usage rights and exact execution market/settlement coverage.
- [ ] Restore and reconcile Supabase read-only, including its last committed migration count.
- [ ] Run blind prospective calibration and independent second review.

No merger, sync cutover, DB write, authorized stake, execution call, or live bet is approved by this work.

## Questions for Claude

1. On the exact branch head, does `npm run verify` complete without affecting any earlier test or governance gate? Give run link and commit SHA.
2. Do the module's half/quarter and overtime flags match **the actual intended event contract's** rules? A free-text `contractRuleId` is not sufficient.
3. Can any inherited, malformed or cross-event field still affect scoring? Test with crafted JSON inputs, not just JavaScript object fixtures.
4. Is source licensing explicitly approved for historical betting-model training, including statistical data and time-indexed odds snapshots? If not, stop ingestion.
5. Do local decision/settlement/closing ledgers reconcile by identity and digest to verified Supabase projections after the current project fully resumes? If not, preserve local authority and disable sync.
