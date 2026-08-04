# Sweet Bear vs Bear Edge Showdown — Context Handoff

**Date:** 2026-07-28
**Repo:** `betting-decision-engine` (local, `~/Documents/Codex/2026-06-17-documents-openai-developers-google-drive-google`)
**Purpose:** Everything a fresh assistant needs to continue this work. Written to be pasted or uploaded into another model with no prior context.

---

## 0. Read this first

The operator (David, also "Bear") has a **zero dollar budget**. Any suggestion that costs money is not actionable right now. This constraint shaped every design decision below and should shape yours.

He also asks to be treated as a serious collaborator: separate established fact from inference, challenge weak premises directly, and do not call work good without evidence. He pushed back correctly twice in this session and was right both times. Do that too.

---

## 1. What this project is

Two prediction models — **Sweet Bear** and **Bear Edge** — are supposed to be compared head-to-head on MLB player props to determine which is more accurate.

The comparison is scored on **mean Brier score** (lower is better), with mean log loss and classification accuracy as secondary diagnostics. Only predictions that both models made independently for the *exact same* event, market, line, selection, and evidence cutoff are eligible.

A winner is not declared until three conditions all hold:

1. At least 500 paired, settled predictions
2. At least 100 distinct MLB events
3. The event-clustered 95% bootstrap interval for the paired Brier difference excludes zero

Negative paired Brier delta favors Sweet Bear; positive favors Bear Edge.

---

## 2. The correction that reframed the session

The operator shared two documents — a README describing the harness and a report showing `INSUFFICIENT_SAMPLE`. On first read I assessed the *design* and said the harness was finished and well-built. **That was wrong, and it was wrong because I judged a document without verifying the code existed.**

Verification showed:

- `package.json` had no `compare` script (only `compare:recording`, an unrelated tool)
- The strings `showdown`, `sweet bear`, and `sweet_bear` appeared in **zero** files
- There was no `reports/` directory and no `data/2026-07-28/`

The documents were a **specification**, not documentation of working code. The design assessment held; the "you're done building, go get data" conclusion did not.

**Lesson to carry forward: verify before assessing. In this repo, documents describe intent, not necessarily reality.**

---

## 3. Established facts (verified this session)

### 3.1 From the codebase — read directly

| Claim | Evidence |
|---|---|
| Brier, log loss, and a **seeded event-clustered bootstrap** already existed | `src/calibration/metrics.js` exports `brierScore`, `logLoss`, `bootstrapClusterMeanInterval` |
| Two-way devig already existed | `src/odds-math.js` exports `getTwoWayNoVigProbabilities` (multiplicative) |
| The paid odds cache is **memory-only** | `src/live/odds-quota.js` has zero `fs` usage; `paidResponseCache` is a plain `Map` |
| `watch:live` polled every **60s** against a **2-minute** cache TTL | `src/cli/watch-live.js`, `src/live/odds-quota.js` |
| Only The Odds API is actually wired | No fetch implementation exists for OpticOdds, SportsGameOdds, SportsDataIO, or Sportradar |
| Bear Edge's server was **not** broken | `data/logs/server-error.log` empty; `server.log` shows clean starts on ports 58047, 50463, 51415 — a different random port each launch |

The "Bear Edge unreachable" blocker in the original report is almost certainly a **stale URL pointing at a previous session's port**, not a crash. `serve.js` defaults to `PORT ?? 3000` and `.env.local` sets no `PORT`. **Pinning `PORT` likely fixes it outright. This has not yet been confirmed by the operator.**

### 3.2 From The Odds API — primary sources

- Free "Starter" plan: **500 credits/month**, reset on the 1st. Next tier is $30/mo for 20,000.
- Free tier advertises **"Most bookmakers"**, not "All". **Whether DraftKings is included on free is unverified** — this is the single most important open question.
- Event-odds endpoint (serves player props): `cost = unique markets returned × regions`. One market, one region = **1 credit per game**.
- **Empty responses do not count against quota.**
- `/sports` and `/events` endpoints are **free** — the slate can be enumerated at no cost.
- `GET event markets` costs 1 credit.
- Player prop response shape: `bookmakers[].markets[].outcomes[]` with `{name: "Over"|"Under", description: <player>, price: <american>, point: <line>}`.
- The docs' own example shows **two books quoting the same player at different lines** in one response. Cross-book blending is a real hazard, not hypothetical.

Sources: [pricing](https://the-odds-api.com/), [v4 docs](https://the-odds-api.com/liveapi/guides/v4/), [FAQs](https://the-odds-api.com/manage/faqs.html)

### 3.3 Other providers — verified viability

| Provider | Verdict | Basis |
|---|---|---|
| **SportsGameOdds** | **Viable.** Real free tier, MLB pitcher strikeouts + batter hits, 85+ books including DraftKings | [MLB Odds API](https://sportsgameodds.com/leagues/mlb-odds-api) |
| SportsDataIO | Not viable. Free **trial**, league-limited | [free trial](https://sportsdata.io/free-trial) |
| Sportradar | Not viable. 30-day trial, then B2B contract est. $500–1,000+/mo | [comparison](https://www.lsports.eu/blog/sportradar-vs-sportsdataio/) |
| OpticOdds | **Unverified** — do not assume | — |
| SportDevs | **Unverified** — do not assume | — |

The reason to skip trial-only providers is **statistical, not budgetary**: a source that dies mid-season creates asymmetric missingness, so the surviving paired sample stops being a random sample of games.

---

## 4. What was built

All new code is CommonJS, matches repo conventions (`node:test`, `node:assert/strict`, JSDoc types, defensive `TypeError`/`RangeError` validation).

### `src/showdown/`

| Module | Responsibility |
|---|---|
| `records.js` | Parse/validate prediction + outcome JSONL. Enforces `evidenceCutoffAt <= predictedAt <= eventStartAt`, strict `0 < p < 1`, 64-hex `implementationDigest`, 5-segment `comparisonKey`, `officialSource === "official_mlb"`, and append-only immutability (no restated comparisons, no reused IDs) |
| `pairing.js` | Pair models on identical comparison key + event + cutoff; join to settled outcomes; retain **every** exclusion with a reason; summarize per-model missingness |
| `compare.js` | Score each model; per-pair Brier deltas; event-clustered bootstrap; apply the three-condition gate. Statuses: `INSUFFICIENT_SAMPLE`, `NO_SEPARATION`, `WINNER_AUTHORIZED` |
| `market-baseline.js` | Devigged market as a third model + closing line value (CLV) |
| `report.js` | Markdown report renderer |
| `snapshot-store.js` | Permanent, content-addressed, immutable on-disk store of every paid API response |
| `credit-budget.js` | Hard monthly credit ceiling with append-only ledger |
| `ingest-props.js` | Strikeouts-only ingestion: free slate call, then 1 credit per selected game |

### CLI

```sh
npm run compare -- --sweet <f> --bear <f> --outcomes <f> --output-dir <d> [--market <f>] [--strict]
npm run ingest:props -- --output <f> [--games N] [--dry-run] [--monthly-cap N]
npm run budget
```

### Two design decisions that go beyond the original spec

**1. The market is scored as a third model.** The original spec compared the two models only to each other. That can crown a winner with no practical value — a model can win the head-to-head while losing to the devigged market. `market_baseline` records are scored on the same comparison keys, and the report has a "Versus the market" section. **This is the test that actually matters.**

**2. CLV is tracked alongside Brier.** CLV resolves far faster than binary outcomes because it doesn't wait on realized variance. It's the early-warning signal while the 500-prediction gate is still distant.

**One deviation from spec worth flagging:** the report still names a provisional leader at any sample size, as specified, but now prints "The provisional leader is a diagnostic only. Do not quote it as a result before the gate closes" whenever the gate is open. This is a guardrail against narrative outrunning evidence. Remove it if unwanted.

---

## 5. The cost model (critical — zero dollar budget)

| Action | Cost |
|---|---|
| Enumerate the day's slate (`/events`) | **0** |
| Price one game, strikeouts only, US region | **1 credit** |
| Game with no props on the board | **0** (not charged) |
| Re-read anything already captured | **0** (served from disk, forever) |
| `--dry-run` of the entire path | **0** |

Practical budget: 5 games/day × 2 snapshots (evidence cutoff + close for CLV) = 10 credits/day ≈ 300/month. **Fits inside the 500 free tier.**

Guards in place:

- **Snapshot store** — every response permanently on disk, API key redacted before write, immutable on rewrite. A second identical run costs nothing (test-proven: 1 paid call across 2 full runs).
- **Credit budget** — hard cap defaults to **450, not 500**, leaving headroom against counter drift. Exhausted budget means the network is never touched. `reconcile()` compares the local ledger against the provider's `x-requests-remaining` header and warns on drift.
- **`watch:live` default raised 60s → 150s**, past the cache TTL, so it stops re-buying prices it already holds. This was the likeliest source of past credit burn.

---

## 6. Verification status

- **658 tests pass, 0 fail** (`node --test`) — 51 of them new
- **Typecheck clean** (`tsc`, `checkJs: true`)
- End-to-end CLI verified at day zero (reproduces the documented `INSUFFICIENT_SAMPLE` report exactly) and against a 600-prediction / 120-event synthetic fixture
- **All ingestion tests use an injected fake fetch. No real API credits were spent building or testing any of this.**

Gate behavior proven by test:

- 600 predictions from a **single event** → still `INSUFFICIENT_SAMPLE` (event count fails)
- Two identical models across 120 events → `NO_SEPARATION`, no winner
- Only all three conditions together → `WINNER_AUTHORIZED`

One real bug was caught by these tests: the provisional leader was returning `unavailable` on single-event samples because the point estimate was being discarded along with the (correctly) unavailable interval. Fixed — the mean is computed independently of the bootstrap.

---

## 7. Open questions / what to do next

**Immediate, costs nothing:**

1. Pin `PORT` in `.env.local` and confirm Bear Edge is reachable. **Unconfirmed inference — verify before building on it.**
2. `npm run budget` — see the ledger state.
3. `npm run ingest:props -- --output <f> --games 3 --dry-run` — verify wiring at zero cost.

**First real spend (1 credit, or 0 if empty):**

4. Drop `--dry-run` on a single game. This answers the DraftKings-on-free-tier question.

**Then:**

5. Wire **SportsGameOdds** as a second provider. Each provider needs its own normalizer into `comparisonKey` format, and a wrong mapping silently corrupts the ledger. Record `priceSource` on every record; **never blend providers into a single baseline.**
6. Get both models actually producing predictions into their ledgers. This is still the real bottleneck — the harness is finished, the data pipeline is not.

**Known unresolved risks:**

- At ~15 MLB games/day, single-market, both-models-live, the realistic rate is 10–15 paired predictions/day. Reaching 500 paired predictions across 100 events takes **35–50 days of clean operation**. The season may end first. A decision is needed: carry into next season, or state an honest interim standard.
- Multiplicative devig under-prices heavy favorites and over-prices longshots. Fine mid-distribution, soft at the tails. If results hinge on longshot props, switch to Shin or power devig.
- The credit ledger lives in `data/logs/` which is gitignored. A fresh clone resets the local cap. The `reconcile()` check against the provider's own counter is the backstop.
- Bear Edge server reliability is unproven over time. If it drops out intermittently, the missingness report in the showdown output is the instrument that will detect it. **Watch that table.**

---

## 8. What has NOT been done

- No live API call has ever been made. Zero credits spent.
- No real prediction from either model exists in any ledger. **The paired sample is still zero.**
- SportsGameOdds is not implemented.
- OpticOdds and SportDevs viability is unverified.
- The DraftKings free-tier question is unanswered.
- No betting recommendation, authorization, or wager has been made or should be inferred from any of this.
