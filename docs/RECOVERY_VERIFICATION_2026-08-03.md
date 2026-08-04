# Bear Edge Recovery Verification — 2026-08-03

## Verified locally

- The original dirty worktree was preserved before Git mutation in a private local savepoint whose SHA-256 is `6502a527a36fbdec140762e0752336f748869a53810c68080ef20af8c93e3482`.
- The recovered work was organized on `codex/pitcher-strikeout-complete-data-research` and pushed to GitHub draft PR #17 without rebasing, merging, or changing wagering authority.
- A clean dependency installation completed with zero reported npm vulnerabilities.
- TypeScript typecheck passed.
- All 727 repository tests passed on commit `1addb1dd5017fa2e3f8aaa57013343395743986b` before this report-only commit.
- The system-boundary audit passed with 5 of 5 models classified `research_only` and authorization `PRICE_CHECK_ONLY`.
- The release audit reported `shippable-with-warnings` at 81/100 before the final documentation-only commits.
- Bear Edge Operator reported `CHECKS_COMPLETE`; its tracked receipt records the exact commit and verification provenance.
- A package dry run included `docs/INTEGRATION_INVENTORY.md` and did not include `.env.local` or private runtime captures.

These results establish only the exercised local software behavior. They do not establish predictive validity, profitability, production readiness, or correct installation on a physical Mac or phone.

## Source recovery boundary

The verified repository contains the responsive PWA, authenticated local/private-LAN launchers, Statsig control integration, Supabase synchronization code and migrations, tests, governance manifests, operator documentation, and rollback-capable Git history/savepoint. No prior standalone `RUN_BEAR_EDGE_STATSIG_INSTALL.command`, `apply-statsig-pwa.mjs`, or `rollback-last-install.mjs` source was present in the actual checkout. Those filenames were therefore not recreated from memory or fabricated. The supported source-based setup remains `npm ci`, followed by the tracked Mac or phone launcher.

## Not verified or activated

- No installation or launch was completed on the user's physical phone.
- The final operator check found no running local server.
- Statsig was not configured or initialized and remained in safe `control_fallback`.
- Supabase was not configured; remote project identity, migration deployment, row-level security, and advisors were not verified in this recovery.
- The Odds API had a key saved only in the untracked local environment; it was not active in the verification process and did not pass a live capability check.
- Tailscale is not an implemented repository connector; device installation, authentication, policy, and reachability were not verified.
- GitHub reported draft PR #17 as non-mergeable against the current `master`; the branch was 14 commits behind and the divergence was intentionally left unreconciled.
- No pull-request-triggered GitHub Actions run was visible at final read-back.

## Fixed authority

Authorized stake is $0. Bet execution is disabled. No bets were placed. Statsig, Supabase, public pages, screenshots, OCR, plugins, and remote services cannot broaden `PRICE_CHECK_ONLY` authority.
