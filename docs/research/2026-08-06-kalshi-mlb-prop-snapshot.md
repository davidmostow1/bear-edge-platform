# Kalshi MLB Prop Snapshot — 2026-08-06

**Snapshot ID:** `5e2403b3-b359-56c5-8e6c-39d2c15b18e6`  
**Frozen at:** `2026-08-06T13:05:27-04:00`  
**Operational status:** `RESEARCH_ONLY`  
**Authorized stake:** `$0`

## Preserved evidence

- 316 normalized quote observations
- 62 series/event inventory records
- 11 MLB schedule and probable-pitcher records
- 170 strikeout observations
- 134 home-run observations
- 8 RBI observations
- 3 stolen-base observations
- 1 outs-recorded contract identity

Source surfaces:

- 218 public Kalshi API observations
- 97 exact odds transcribed from user-provided Kalshi screenshots
- 1 contract identity preserved from the user's open position

## Raw evidence location

Google Drive folder: `Bear Edge Research / MLB Prop Snapshots / 2026-08-06`

- Folder ID: `17O_ewgQGylm6j46JSie3hUqVB8DefCAH`
- Evidence ZIP ID: `1Hf9R-tpzgw4vxCKf0MOTJM28klxjhSih`
- CSV ID: `14FPK6siGPpjMh-8cmJxKNDeeR_yADn2Q`
- JSONL ID: `1v0kx8P2ifYz44GyT8jQj2BRfwpANzQwF`
- README ID: `1qQHXgb-o_9oo9Ip-GswadOuPopdJteHh`
- SQL proposal ID: `1PgwsNgB9VhrFv9vG9JSZE-zfijd9Fj0H`
- Checksum file ID: `1owrsexEMaM1cRXlY6t286Y_KcxYSrvD7`

## Source hierarchy

1. Kalshi public Trade API for contract identity, status, YES bid/ask, volume and open interest.
2. MLB official schedule/probable-pitcher data for game identity, timing and probable pitchers.
3. Baseball Savant for Statcast enrichment.
4. FanGraphs for independent advanced-stat enrichment.
5. FanDuel Research for external comparison context only.

## Status gates

At the freeze time:

- Los Angeles A at Baltimore was live.
- A's at Cincinnati was live.
- New York M at Cleveland was in warmup immediately before the scheduled start.
- Remaining listed games were pregame.

Live, warmup and pregame observations are deliberately preserved as separate states. They must not be pooled as though they were captured under the same information set.

## Governance decision

The existing Supabase project did not contain a dedicated raw quote-event table. The snapshot was not forced into `decision_records`, because a quote observation is not a model decision. This branch proposes `public.market_quote_events` as an append-only ledger. Deployment and ingestion should occur only after review and merge through the canonical GitHub branch.

## Limitations

- This is a timestamped snapshot, not a claim that prices remain available.
- The screenshots cover only part of the visible app board.
- API and app odds are separate observations and may differ because of bid/ask side, combo pricing, spread, update time or market status.
- No recommendation is created merely because a quote was captured.
- A few Kalshi event timestamps conflicted with the official MLB schedule. The evidence pack retains source fields and uses the MLB schedule for the normalized game-time field.
