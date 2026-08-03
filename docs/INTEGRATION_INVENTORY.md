# Bear Edge Integration Inventory

Verified from the repository and secret-safe local status checks on 2026-08-03. This inventory separates shipped code from local configuration and from documentation-only references. It does not prove remote account state, paid entitlement, phone installation, or provider availability.

## Runtime integrations

| Integration | Repository status | Local status on 2026-08-03 | Authority and exact remaining activation |
| --- | --- | --- | --- |
| Local Node.js server and responsive PWA | Implemented in `src/server.js`, `src/dashboard/`, and the local/LAN launchers; dependencies installed successfully with `npm ci` | Verified by typecheck and 727 tests; no server was running during the final operator check | Run `npm run launch` for the Mac or `npm run launch:lan` for a trusted private network. Physical Mac and phone behavior still require on-device verification. |
| Private-LAN phone access | Implemented by `Open Bear Edge On Phone.command`, `src/cli/launch.js`, and bearer-token write protection | Code and automated authentication tests passed; no physical phone was tested | Keep the Mac awake on a trusted private network, run the phone launcher, open its printed URL on the phone, and optionally add the PWA to the Home Screen. Never port-forward this HTTP service. |
| Tailscale | Not a repository dependency or implemented connector; it is optional operator-managed networking outside Bear Edge | Installation, sign-in, tailnet policy, and cross-device reachability were not verified | If Tailscale is desired, the user must install and authenticate it on both devices and independently validate the Bear Edge LAN endpoint over the tailnet. Do not treat this as supported until that device test passes. |
| Statsig | Implemented with installed package `@statsig/statsig-node-core` in `src/integrations/statsig-control.js` | Not configured or initialized; verified `control_fallback` | Enter `STATSIG_SERVER_SDK_SECRET` in untracked `.env.local`, optionally set environment/operator ID, restart, and read `/api/statsig-control`. Only the two documented presentation/shadow gates are allowed; Statsig cannot authorize or size a wager. |
| Supabase | Implemented as a secondary REST projection in `src/sync/` with version-controlled migrations in `supabase/migrations/` | Not configured; the live project and migration state were not verified in this recovery | Authenticate privately, deploy and review the tracked migrations in a controlled project, enter `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`, and `SUPABASE_OWNER_USER_ID` in `.env.local`, restart, inspect `/api/sync-health`, then explicitly run `/api/sync/run`. The local ledger remains authoritative. |
| The Odds API | Implemented in `src/live/odds-api.js` and related quota/snapshot code | A non-empty key is saved locally but was not active in the verification process and no live capability check passed | Restart the server so the untracked local value enters the process, then use the secret-safe provider check. Do not claim verified odds until `usableNow` is true. |
| MLB and NHL public data | Implemented adapters in `src/live/providers/mlb.js`, `src/live/providers/nhl.js`, official-outcome, schedule, and source-status modules | Exercised with fixtures and automated tests; current external availability was not established | Start the app and inspect source health/freshness. Retain source timestamps and artifacts; public responses do not supply sportsbook authorization. |
| SportsDataIO | Implemented MLB source adapter in `src/live/providers/sportsdataio.js`; also listed as a provider requirement | Blank and not live-verified | Obtain entitlement and enter `SPORTSDATAIO_API_KEY` privately, restart, and complete the capability check before relying on it. |
| ESPN, StatMuse, DraftKings visible-board intake | Implemented as snapshot/OCR parsers in `src/live/espn-snapshot.js`, `statmuse-snapshot.js`, `draftkings-snapshot.js`, and `dk-predictions-board-snapshot.js` | Parser and safety tests passed; no authenticated sportsbook connector is installed | Paste or capture current visible evidence through the local dashboard. These sources remain contextual/manual evidence and never become verified provider prices or wager authority by themselves. |
| Covers and Hard Rock Bet public pages | Implemented as public research-page fetch/parsing in `src/live/online-opportunities.js` | Parser behavior tested; live availability was not established | Start the app and inspect source status. All extracted prices remain `unverified_public_price` or `odds_needed` and `PRICE_CHECK_ONLY`. |
| Retrosheet | Implemented as local, digest-checked historical ZIP import and backtest tooling in `src/historical/` | Local fixture and provenance tests passed; no new external dataset was downloaded during recovery | Supply an authentic local Retrosheet archive and run the documented dry run before write mode. Historical reconstruction is not prospective validation. |
| Apple Vision OCR | Implemented locally in `src/native/vision-ocr.swift` with a Node wrapper path | Automated contract paths passed; a live screen/OCR run was not part of final verification | Run on a compatible Mac and verify the actual image path. OCR output remains manual evidence, not a credentialed feed. |

## Referenced but not implemented as active provider connectors

`OPTICODDS_API_KEY`, `SPORTS_GAME_ODDS_API_KEY`, `SPORTRADAR_API_KEY`, `TENNIS_API_KEY`/`SPORTDEVS_API_KEY`, `OPENWEATHER_API_KEY`, `EXA_API_KEY`, and `OPENAI_API_KEY` appear in `.env.example` and provider setup metadata. In the verified checkout they are blank, not live-verified, and do not establish an active runtime integration. Some entries unlock only planned or supporting research capabilities. Activation requires the user's own account, entitlement, private key entry, a server restart, and a successful capability check. Do not add or purchase them merely to make a readiness panel green.

## Development and operator plugins used for this recovery

These tools helped inspect, verify, preserve, and publish the repository; they are not Bear Edge runtime dependencies:

- Bear Edge Operator: ran the canonical local doctor and wrote a tracked, secret-safe receipt.
- Prompt Mastery: recorded the BEAR benefit/no-degradation beginning and ending receipts.
- Codex Engineering Guardrails and Superpowers: governed scoped commits and verification; no runtime package was added.
- GitHub connector and local Git: pushed the existing research branch and opened draft PR #17.

The named Build macOS Apps, Supabase, Statsig, Google Drive, Browser, Computer, memory, search, weather, analytics, Airtable, Coralogix, and other ChatGPT plugins/connectors were not installed into the Bear Edge application by this recovery. The project is a Node.js/PWA workflow, not a signed native macOS application. Supabase and Statsig runtime support comes from the repository code described above, not from requiring their ChatGPT plugins.

## Fixed safety boundary

Every registered model remains `research_only`; authorization remains `PRICE_CHECK_ONLY`; authorized stake remains $0; bet execution remains disabled. Configuration or authentication of any integration above must not broaden that authority.
