# Bear Edge pitcher-strikeout preregistration

Status: `RESEARCH_ONLY`  
Market family: `pitcher_strikeouts`  
Prospective cohort start: `2026-08-17T04:00:00.000Z` (midnight America/New_York)  
Wagering permission: `PRICE_CHECK_ONLY`  
Authorized stake: `$0`

This contract makes data completeness measurable. It does not assert that the
required historical or live data exists, that the candidate model is accurate,
or that an edge exists.

## Frozen inputs

Every eligible feature record requires:

- event identifier, scheduled start time, venue, prediction time, and confirmed
  starting-pitcher identity;
- pitcher handedness, days rest, prior starts, season strikeouts per batter
  faced, rolling five- and ten-start strikeouts per batter faced, and rolling
  five- and ten-start batters faced;
- exactly nine confirmed lineup players in batting order, their batting sides,
  prior strikeout rates, and prior strikeout rates against the pitcher's hand;
- the aggregate confirmed-lineup strikeout rates and a positive half-unit
  strikeout line;
- schedule, pitcher, lineup, and market source envelopes containing provider,
  source locator, capture time, source time, SHA-256 content digest, license
  identifier, freshness, and verification status.

Weather and umpire inputs are frozen as `NOT_IMPLEMENTED` for v1. They cannot
be added silently or represented as zero.

## Source contract

- Retrosheet supplies attributable delayed historical reconstruction only. The
  original ZIP and the matching `gameinfo.csv`, `batting.csv`, `pitching.csv`,
  and `allplayers.csv` bytes for 2021 through 2025 must be retained.
- Retrosheet pitcher rows lack the complete preregistered batters-faced,
  confirmed-lineup, handedness, and pregame source state. The training adapter
  therefore records missing-feature rows unless separately licensed,
  timestamped historical enrichment is supplied.
- The SportsDataIO adapter accepts explicitly synthetic, zero-network test
  fixtures only. Live fetch throws `LIVE_PROVIDER_NOT_AUTHORIZED` until licensed
  access and a separate call-specific approval exist.
- The Odds API remains a separate price source. Exact DraftKings sportsbook
  event, participant, market, line, both sides, and pre-start capture time are
  required for a no-vig market comparison.

Public pages, screenshots, search results, model prose, fixture data, and
manually inferred values cannot satisfy a verified-provider source envelope.

## Missing-data and leakage rules

- Reject prediction at or after event start.
- Reject source capture after prediction, source time after capture, stale
  evidence, invalid digest, missing license, unconfirmed starter, unconfirmed
  or incomplete lineup, integer line, duplicate lineup player, or contradictory
  event time.
- Retain eligible observations or explicit missing reasons; do not backfill a
  prediction after the event begins.
- Split unique events chronologically: earliest 70% training, next 15%
  calibration, and latest 15% untouched evaluation. All rows from one event
  remain in one partition.

## Candidate model and baselines

The candidate is `negative_binomial_pitcher_strikeouts_v1` version `1.0.0`, a
deterministic regularized negative-binomial log-link count model. It remains
`research_only`. It is compared with:

1. registered `poisson_count_v1`;
2. exact two-sided same-book no-vig market probability when verified prices
   exist.

No model may be promoted until the registered prospective evidence policy,
calibration, non-degradation, uncertainty, coverage, and independent review
requirements pass. Historical reconstruction cannot satisfy prospective or
closing-price requirements.

## Operational limits

David reported `98%` of the displayed Codex allowance remaining on 2026-08-01.
The implementation stops at `90%`. Absolute credits are unverified and the
repository cannot enforce the percentage meter.

Fixed provenance boundaries:

- `predictiveImprovement=NOT_EVALUATED`
- `modelValidation=NOT_ESTABLISHED`
- `wageringAuthority=UNCHANGED`
