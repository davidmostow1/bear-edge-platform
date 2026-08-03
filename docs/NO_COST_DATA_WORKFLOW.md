# Bear Edge no-cost research data workflow

This workflow grows legitimate model-evaluation data without selecting, recommending, or placing a bet. It has two strictly separate lanes.

## 1. Prospective shadow capture

Use this lane only with a local candidate payload obtained manually, from a licensed source, or from another source whose terms permit the use.

```sh
npm run shadow:capture -- \
  --input /absolute/path/to/candidate-payload.json \
  --dry-run
```

After the dry run reports every eligible event represented and no generator missingness:

```sh
npm run shadow:capture -- \
  --input /absolute/path/to/candidate-payload.json
```

The command:

- performs no network requests and schedules no polling;
- sanitizes the retained cohort artifact;
- removes ticket, fair-odds, bankroll, Kelly, price, edge, and stake fields;
- recomputes the registered Poisson model chain from retained features;
- converts every binary count target to one canonical `over` probability;
- requires a half-unit line and a capture timestamp before first pitch;
- appends deterministic `WAIT` / `PRICE_CHECK_ONLY` records;
- reports unrepresented events and generator omissions instead of hiding them.

These records may enter outcome-only diagnostics after official settlement. They cannot enter full calibration or promotion without exact, verified same-book closing-price evidence.

The current generator is not a full-lineup collector. Its batter population is a capped active-roster slice. Therefore, this command proves completeness only for the supplied generator output and reports event representation separately. It must not be described as a complete confirmed-lineup cohort.

## 2. Retrosheet historical reconstruction

Retrosheet expressly permits reuse of its data with attribution. Download a season bundle from the [Retrosheet CSV downloads page](https://www.retrosheet.org/downloads/csvdownloads.html), retain the original ZIP, and extract `gameinfo.csv`, `batting.csv`, `pitching.csv`, and optionally `allplayers.csv`.

Run a dry reconstruction first:

```sh
npm run backtest:retrosheet -- \
  --season 2025 \
  --bundle /absolute/path/to/2025csvs.zip \
  --gameinfo /absolute/path/to/2025gameinfo.csv \
  --batting /absolute/path/to/2025batting.csv \
  --pitching /absolute/path/to/2025pitching.csv \
  --players /absolute/path/to/2025allplayers.csv \
  --output-dir /absolute/path/to/output \
  --source-url https://www.retrosheet.org/downloads/2025/2025csvs.zip \
  --dry-run
```

Remove `--dry-run` to retain a digest-named JSONL artifact and manifest.

The reconstruction:

- accepts exactly one declared season and rejects mixed-season input;
- verifies that each supplied CSV is byte-for-byte identical to exactly one matching member in the retained ZIP;
- rejects duplicate games, duplicate player `value` rows, orphan rows, cross-file identity mismatches, and conflicting pitcher-starter indicators;
- uses `stattype=value`, while retaining flags for `official`, `lower`, or `upper` discrepancy rows;
- requires completed box-score evidence;
- uses all prior player appearances as features, including nonstarter batting appearances;
- creates targets only for completed-game starting batters and starting pitchers;
- freezes every game on a date from history through the previous date, so one doubleheader result cannot leak into the other;
- excludes suspended games until completion-date handling is implemented;
- produces hits, runs, total bases, and starting-pitcher strikeout observations;
- records the verified ZIP-member names plus archive and source-file SHA-256 digests.

Every output remains `historical_reconstruction`, `prospective: false`, `promotionEligible: false`, and `betAuthorization: false`. The model is identified as a Retrosheet replica of `poisson_count_v1`, not an exact replay of the live candidate lifecycle. Completed-game starter identity is postgame information, and equivalence between Retrosheet appearance history and MLB `gamesPlayed` has not been established.

Required attribution:

> The information used here was obtained free of charge from and is copyrighted by Retrosheet. Interested parties may contact Retrosheet at "www.retrosheet.org".

## Source-rights boundary

Public reachability is not permission. MLB's current Terms of Use prohibit automated scripts that collect information from or interact with MLB digital properties. This implementation therefore does not add a StatsAPI fetch command or unattended MLB poller. Written MLB permission or a separately licensed source is required before automating that acquisition path.

Retrosheet is delayed historical data. It can immediately support backtesting and can settle prospective rows after a future Retrosheet release, but it is not a same-day confirmed-lineup or prompt-results feed.

## Interpretation boundary

Passing tests proves that the data path is internally consistent. It does not prove predictive skill, profitability, live readiness, sportsbook evidence, or authorization to bet. Treat game IDs—not individual player-market rows—as the primary dependence clusters; the raw observation count is not an independent-sample count.
