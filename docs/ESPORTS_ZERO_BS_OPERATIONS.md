# Bear Edge Esports: Zero-Bullshit Operations

## Scope and truth boundary

This slice evaluates two-way match-winner prices for CS2, Dota 2, League of Legends, and VALORANT. It implements evidence gates, cross-book price normalization, deterministic value and stake math, canonical verdicts, and append-only audit logging.

It does **not** yet implement an independent team-strength, player, draft, map, or patch prediction generator. The registered `esports_bear_stack_v1` calculation accepts a retained independent projection with lower, point, and upper probabilities, then combines it with eligible reference-book consensus using a predeclared market weight. All four esports registry entries are currently `research_only`, with no calibration report, calibration-report digest, or training cutoff. Calling this slice a trained game-specific Bear esports model or a validated betting advantage would be false.

The market component's lower and upper probabilities are the minimum and maximum observed across eligible books. They are not a calibrated confidence interval. The independent-model interval must be retained and timestamped, but this evaluator does not create it. The audit record states both limitations explicitly.

## Supported registered markets

| Game | Canonical game value | Registered market family | Current registry status |
|---|---|---|---|
| Counter-Strike 2 | `CS2` | `cs2_match_winner` | `research_only` |
| Dota 2 | `DOTA2` | `dota2_match_winner` | `research_only` |
| League of Legends | `LOL` | `lol_match_winner` | `research_only` |
| VALORANT | `VALORANT` | `valorant_match_winner` | `research_only` |

The claim contract describes `series`, `map`, and `live_map`, but this slice implements pre-match evaluation only. `live_map` always fails the implementation gate and cannot issue an actionable decision. The registered market families above are match-winner families. A new market family is not authorized merely because its fields fit the input shape; it needs an exact model-registry tuple and an implemented calculation path.

## Material context gates

Every evaluation requires the following common claims:

- `event.identity`: canonical event ID and both canonical team names
- `event.start_time`: the exact UTC event start time
- `event.format`: the verified series format
- `roster.team_a`
- `roster.team_b`

Game and scope add the following claims:

| Game | Series adds | Map adds | Live map adds |
|---|---|---|---|
| CS2 | `context.map_pool` | `series.map_veto`, `series.map_order` | `series.map_veto`, `series.map_order` |
| Dota 2 | `context.patch` | `side.team_a`, `side.team_b` | both sides plus `draft.team_a`, `draft.team_b` |
| LoL | `context.patch`, both `roster.starting_lineup.*` claims | `side.team_a`, `side.team_b` | both sides plus `draft.team_a`, `draft.team_b` |
| VALORANT | `context.patch`, `context.map_pool` | `series.map_veto`, `series.map_order` | veto and order plus `agents.team_a`, `agents.team_b` |

The common and game-level claims remain required when map or live-map claims are added. For example, a CS2 map evaluation still needs verified team rosters and map pool; a LoL series evaluation already needs both starting lineups.

For each material claim, the engine requires all of the following:

1. At least the operator-registered `minIndependentSources`, which the validator requires to be an integer of at least two.
2. Distinct `independenceFamily` values. Two pages backed by the same family count once.
3. At least one eligible tier-1 source.
4. Provider status exactly `approved` and provider tier 1 or 2.
5. `verificationStatus` exactly `verified`, a non-empty source URL, and valid capture and source timestamps.
6. Capture time not in the future, source time not after capture, and source age within the operator-registered evidence-age limit.
7. Canonically identical values across all counted source families.
8. For identity, start time, and format, an exact match between evidence and the candidate input.

Missing evidence, stale evidence, future timestamps, source conflicts, or candidate/source mismatch fail closed to `WAIT`. The engine never fills a missing claim from a team name, URL slug, search snippet, or prior match.

The evaluator enforces provider `status`, `tier`, `independenceFamily`, declared game, and declared evidence role. It does not scrape a provider or convert `automatedUse: false` into automation permission. Official organizer pages marked `automatedUse: false` require manually retained evidence unless separate feed rights are recorded. Valve regional standings remain a periodic CS2 strength prior, not a match-win probability or live-state feed.

## Source and legal registry

The default registry is `src/esports/source-registry.json`. Its statuses have operational meaning:

| Status | Eligible for a material engine claim now? | Required treatment |
|---|---:|---|
| `approved` | Yes, if tier 1 or 2 and every evidence check passes | Use only for its declared role, game, and access method |
| `approved_research` | No | Research corroboration only; it cannot clear the current evidence gate |
| `contract_required` | No | Record and verify the applicable data agreement before changing status |
| `terms_review_required` | No | Complete legal/operator review of the intended access pattern |
| `blocked_policy` | No | Do not use for betting functionality without separate written authorization |
| `manual_only` | No | Manual citation only; no automated ingestion approval is recorded |
| `local_only` | No | Use only from an authorized local client/observer, not as a public pro feed |

Verified registry findings include:

- [GRID Open Access](https://grid.gg/open-access/), Riot's [LoL esports data service](https://riotesportsdata.com/en-us/league-of-legends/), and Riot's [VALORANT esports data service](https://riotesportsdata.com/en-us/valorant/) are tier 1 but `contract_required`.
- [Riot's general developer policy](https://developer.riotgames.com/policies/general) is registered `blocked_policy` for betting functionality. The public Riot developer API must not be substituted for separately authorized Riot esports data.
- [PandaScore plan coverage](https://developers.pandascore.co/docs/plan-reference) is `contract_required`; titles, fields, and latency must match the active plan and must not be generalized across games.
- [Steam Web API](https://developer.valvesoftware.com/wiki/Steam_Web_API) and [Liquipedia API terms](https://liquipedia.net/api-terms-of-use) require terms review for this use.
- [Valve CS2 GSI](https://developer.valvesoftware.com/wiki/Counter-Strike%3A_Global_Offensive_Game_State_Integration) is local-observer integration, not a public professional feed.
- [OpenDota](https://docs.opendota.com/), [STRATZ](https://stratz.com/api), and [Oracle's Elixir](https://oracleselixir.com/tools/downloads) are registered for research, not authoritative BET clearance.
- [HLTV terms](https://www.hltv.org/terms) and public [VLR results](https://www.vlr.gg/matches/results) are registered `manual_only`; no production scraping or supported ingestion right is assumed.
- [BLAST](https://blast.tv/cs/tournaments), [ESL](https://pro.eslgaming.com/tour/cs/), [LoL Esports](https://lolesports.com/), and the [Esports World Cup](https://esportsworldcup.com/en/competitions/2026/cs2) are approved tier-1 organizer/publisher pages for their declared manual evidence roles.

No statistics source substitutes for an exact sportsbook quote. Conversely, a sportsbook quote does not verify rosters, patch, map veto, draft, or event identity.

## Price evidence and consensus

The target offer and every reference offer must include:

- a non-empty bookmaker name;
- a canonical market ID and jurisdiction;
- an independence family, so related venues cannot be double counted;
- non-zero finite American odds for the selection and its opposite;
- an exact capture timestamp;
- a non-empty source URL or retained locator; and
- a SHA-256 digest of the retained raw quote artifact;
- `priceType: "american_two_way"`; and
- `verificationStatus: "verified"` only after the exact price has actually been verified.

The target offer additionally requires `priceStatus: "open"`, `executable: true`, a positive recorded `maxExecutableStake`, and a non-negative `executionCostRate` that includes the execution costs the operator has chosen to model. The capture must not be in the future and must be within the operator-registered price-age limit. The target bookmaker and its independence family are excluded from reference consensus. A repeated independence family is also excluded, so related or duplicate venues do not increase the book count. The policy validator requires at least two eligible reference families; the operator may register a higher minimum.

The evaluator records jurisdiction, market identity, size, status, cost, and raw-artifact digest. Quote parser version and verification status are inside the canonical retained snapshot; evidence verification status and parser version are inside the evidence payload; model verification status and artifact locator are inside the prediction digest. Changing any of those fields without regenerating the bound payload digest fails closed. The evaluator still does not independently prove operator licensing, account eligibility, settlement-rule equivalence, or that a caller-computed digest came from the named page. Retain the original response or screenshot and independently review those controls. A digest proves integrity only after it has been matched to the genuine retained artifact.

## Exact calculation

Let American odds be \(A\), decimal odds be \(D\), and probability be \(p\).

### Odds conversion

\[
D =
\begin{cases}
1 + A/100, & A > 0 \\
1 + 100/|A|, & A < 0
\end{cases}
\]

\[
p_{implied}=\frac{1}{D}
\]

Zero American odds are invalid.

### Two-way no-vig normalization

Each book is normalized independently. If \(p_s\) and \(p_o\) are the raw implied probabilities for the selection and opposite side:

\[
p_{s,no\ vig}=\frac{p_s}{p_s+p_o},\qquad
p_{o,no\ vig}=\frac{p_o}{p_s+p_o}
\]

\[
hold=p_s+p_o-1
\]

The eligible reference-book no-vig selection probabilities produce the market component:

- point probability: median;
- lower probability: minimum observed probability;
- upper probability: maximum observed probability; and
- observed range: maximum minus minimum.

### Bear stacked probability

Let the retained independent projection be \(p_{model,lower}\), \(p_{model,point}\), and \(p_{model,upper}\). Let the corresponding market values be \(p_{market,lower}\), \(p_{market,point}\), and \(p_{market,upper}\). With predeclared market weight \(w\):

\[
p_{Bear,x}=(1-w)p_{model,x}+wp_{market,x},\qquad x\in\{lower,point,upper\}
\]

The independent interval must contain its point probability. The retained prediction requires an artifact locator, SHA-256 digest, generation timestamp, and verified status; it must be fresh under `maxModelAgeMinutes` and cannot be generated after the target-price capture. The conservative decision probability is \(p_{Bear,lower}\). The target book's raw implied probability, not its no-vig target probability, is used for the price-edge test.

### Value and stake

Using the conservative decision probability and recorded execution-cost rate \(c\):

\[
priceEdge=p_{decision}-p_{target,implied}
\]

\[
EV_{ROI}=p_{decision}D-1-c
\]

With \(b=D-1-c\) and \(L=1+c\):

\[
Kelly=\max\left(0,\frac{bp_{decision}-L(1-p_{decision})}{bL}\right)
\]

\[
stake=\min(bankroll\times Kelly\times kellyMultiplier,\ maxStake,\ bankroll\times maxBankrollFraction)
\]

The engine also calculates the same edge, net EV, Kelly, and stake values at the Bear point probability. Both point and conservative values must be strictly greater than their corresponding registered minimums; equality does not clear a threshold. The recorded `fairEdge` is `Bear point probability - market-consensus point probability`. The conservative recommended stake must not exceed the recorded target-offer executable size.

Every numeric decision-policy value is operator-registered and versioned. The engine supplies no esports threshold defaults. The required fields are:

- `policyVersion`, `registeredAt`, `policyDigest`, `bankroll`
- `minIndependentSources`, `minConsensusBooks`
- `maxEvidenceAgeMinutes`, `maxModelAgeMinutes`, `maxPriceAgeMinutes`, `eventCutoffMinutes`
- `maxConsensusRange`, `marketWeight`
- `minPriceEdge`, `minEvRoi`, `minKellyFraction`
- `kellyMultiplier`, `maxBankrollFraction`, `maxStake`, `minStake`

Do not choose these values after seeing the candidate. Register them before evaluation, retain their rationale, and use the resulting configuration digest in the audit record.

## Verdict semantics and precedence

Verdicts are deterministic and evaluated in this order:

| Verdict | Exact operational meaning |
|---|---|
| `PASS` | A hard conduct/exposure/bankroll-integrity gate is active, the pre-match event already started, or complete Bear point math does not clear every registered value threshold. It is a rejection, not missing research. |
| `WAIT` | Required policy, source, identity, timing, ledger, independent projection, executable price/size/cost, or model evidence is missing, stale, conflicting, outside range, or inside the configured pre-match cutoff. Wait for new evidence; do not infer it. |
| `LEAN` | Complete Bear point math clears but the conservative Bear probability does not (`BET_IF_PRICE_OR_UNCERTAINTY_IMPROVES`), or both math layers clear but the model is not validated (`BET_IF_VALIDATED`). It permits price checking, not a qualified bet. |
| `BET` | Every identity, evidence, timing, price, book-count, range, conservative-value, model-calibration, and risk gate passes. The audit permission is `VERIFIED_BETS_ALLOWED`. |

Hard `PASS` controls are tilt lock, exposure conflict, an existing correlated position, explicitly failed ledger integrity, and an already-started pre-match event. Ledger integrity that was not explicitly verified is `WAIT`. Reaching the operator's pre-match cutoff is also `WAIT`.

A `BET` label is a narrow system classification. It is not a guarantee of profit and does not replace legal, jurisdictional, account, market-limit, or responsible-wagering controls.

## Model validation and promotion

Current reality: no esports registry tuple is validated, and no independent game-specific projection generator is implemented in this slice. Therefore the default authoritative path cannot issue an esports `BET` today.

Promotion must use predictions generated before outcomes were known, including unsuccessful and unselected predictions. It must not use a hand-picked winning sample. The append-only evaluation and settlement records must preserve event and market identity, exact two-way prices, prediction timestamps, model identity, source digests, outcomes, and genuine final closing-line evidence.

The registered promotion process checks, among other controls:

- sufficient settled predictions and observations in every reliability bucket;
- settlement coverage;
- Brier score, log loss, expected calibration error, calibration slope, and calibration intercept;
- no material degradation against the registered two-way no-vig market baseline;
- uncertainty evidence from the registered method and confidence level;
- a non-negative closing-line-value interval when required;
- no unresolved data-quality findings; and
- policy registration before the evaluation period.

Run the ledger projection first:

```bash
npm run audit:calibration
```

Then build a report only from the resulting eligible JSONL rows, using the exact market family and model tuple:

```bash
npm run calibrate -- \
  --input data/calibration/calibration_dataset.jsonl \
  --market-family REQUIRED_REGISTERED_MARKET_FAMILY \
  --model-id esports_bear_stack_v1 \
  --model-version 1.0.0 \
  --output REQUIRED_RETAINED_REPORT_PATH
```

Promotion is a governed registry change, not an evaluator side effect. A non-research registry entry requires a training cutoff, implementation digest, immutable calibration report ID and digest, matching promotion-policy version and digest, and verified report evidence. `validated` also requires a promotion timestamp and a report that passes every registered check.

The current esports CLI does not expose a calibration-report bundle argument. The default model registry loader requires report evidence for non-research statuses, so that evidence-loading path must be wired and verified before any registry promotion can become operational through this CLI. Without it, model resolution fails closed.

## CLI and append-only logging

Start from `examples/esports_match_winner.template.json`, but do not execute it unchanged. It intentionally contains null values and placeholders so it cannot create a synthetic recommendation.

```bash
npm run evaluate:esports -- REQUIRED_FILLED_CANDIDATE.json \
  --ledger-path data/logs/esports_decisions.jsonl \
  --source-registry src/esports/source-registry.json
```

The CLI also supports `--stdin` instead of a file and `--compact` for compact JSON output. Operational evaluation always uses the system clock. `--as-of REQUIRED_ISO_UTC` is available only for replay; replay records the actual creation time and can never issue `BET`.

The CLI calls `evaluateEsportsCandidateAndLog`, so `PASS`, `LEAN`, `WAIT`, and `BET` are all appended to the authoritative JSONL ledger. The pure `evaluateEsportsCandidate` function does not persist and should not be used as the operational entry point.

The default ledger is `data/logs/decision_log.jsonl`, overridable by `BEAR_EDGE_DECISION_LOG_PATH` or `--ledger-path`. Records use canonical JSON, a content digest, append-and-flush persistence, idempotency for the same ID and digest, and a hard conflict for the same ID with different content. A synchronization outbox is also queued. If outbox queueing fails after the local append, the result records terminal synchronization failure while retaining the local authoritative record. While authenticated esports operational authority is unimplemented, canonical validation and ledger append also reject every `BET` whose sport, market family, or model identifies this esports slice. A caller cannot bypass the evaluator by constructing a populated esports `BET` record directly.

Logging does not cure bad evidence. A logged `WAIT` remains a wait, a logged `LEAN` remains unvalidated, and a content digest proves the stored record has not changed; it does not prove that a manually entered source fact was true.

## Point-in-time slate result: 2026-08-12

The slate review conducted around 06:03-06:09 UTC on 2026-08-12 produced **no `BET` and no `LEAN`**. Exact prices existed for portions of the slate, but no candidate had a completed Bear probability evaluation plus all required lineup, roster, patch, map-veto/draft, timing, source-agreement, and model-validation gates.

The reviewed LoL schedule had independent fixture corroboration, but official rendered schedule views were inconsistent across locale/cache and starting-five confirmation remained unresolved. Those candidates stayed `WAIT` pending official stream or lobby confirmation. Anonymous-source, unknown-opponent, or zero-volume offerings could not be upgraded with assumptions. No probability, edge, stake, or bet was invented.

This is a timestamped observation, not a permanent view. Re-evaluate only from new retained evidence and new exact prices; never carry the classification forward by memory.

## Operator checklist

Before accepting any output, confirm:

- The game, event, teams, format, scope, and market family are canonical and mutually consistent.
- Every required claim has enough eligible independent families, including tier 1, with exactly agreeing values.
- Source roles, game coverage, access rights, and manual/automated restrictions were checked outside the limited code gate.
- The target and reference quotes are exact two-way prices, fresh under a pre-registered policy, uniquely attributed, and backed by retained raw evidence.
- Jurisdiction, operator eligibility, limits, settlement rules, and canonical market identity were independently checked.
- Ledger integrity is explicitly true and exposure, correlation, and tilt controls are current.
- The exact model tuple resolves from the registry. Do not substitute a different market family or call market consensus an independent sport model.
- A `LEAN` is not presented as a `BET`, and no `BET` is accepted without validated immutable calibration evidence and successful persistence.
