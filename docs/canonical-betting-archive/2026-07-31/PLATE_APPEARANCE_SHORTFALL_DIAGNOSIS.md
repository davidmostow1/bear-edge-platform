# Plate Appearance Shortfall Diagnosis

## Observed failed build

Unified MLB v1 reported:

- 4,858 games
- 341,183 plate appearances
- 787 batters
- 1,108 pitchers

The coverage gate failed with:

`Error: expected at least 1000 batters, received 787`

## Independent league totals

Official MLB Stats API season hitting totals queried separately:

| Season | PA | Unique batters with PA |
|---|---:|---:|
| 2024 | 182,449 | 651 |
| 2025 | 182,926 | 673 |
| Combined player IDs | 365,375 | 788 |

The combined true PA total is 24,192 higher than the generated 341,183.

The combined unique-player count of 788 is nearly identical to the build's 787. Therefore, the expectation that two seasons must contain more than 1,000 unique MLB batter IDs is not supported by the official season-stat query. The 1,000-batter gate may itself be too high for unique MLB batters, but the PA total is still materially incomplete.

## Root-cause evidence

A Baseball Savant weekly query corresponding to one source chunk returned exactly 25,000 pitch rows. It covered 91 games and only 6,416 distinct plate appearances. Exact equality to 25,000 is strong evidence of a source-response cap or truncation.

The build requested week-long Statcast pitch-level chunks. High-volume weeks can exceed 25,000 pitches. If the endpoint returns only the first 25,000 rows without pagination, later pitches and completed PAs disappear while the separately fetched game schedule remains nearly complete.

## Current conclusion

- The game pull is effectively complete.
- Plate appearances are incomplete by 24,192 versus official season totals.
- The likely root cause is 25,000-row truncation in weekly Baseball Savant pitch-level responses.
- The 787-batter count is not evidence of hundreds of missing MLB players; official combined unique IDs are about 788.
- The 1,000-batter threshold was not changed during this operation. It should be reconsidered only through a separate approved change using an authoritative expected-count definition.
- No history rebuild was rerun during this diagnosis.
