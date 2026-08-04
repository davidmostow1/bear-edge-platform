# Direct Screen Capture Bridge Design

Date: 2026-07-23
Status: Approved
Base branch: `codex/bear-edge-release-candidate`

## 1. Purpose

Bear Edge must operate without a paid odds API. Its admissible current-market
inputs are limited to information visibly available on this computer:

- a logged-in sportsbook or event-contract page;
- a screenshot captured from that page;
- visible page text captured at the same time;
- public web pages opened on this computer; and
- local calculations over those retained inputs.

The bridge must move a live visible DraftKings Predictions screen into Bear
Edge without manual transcription while preserving a non-fictional,
fail-closed evidence trail.

## 2. Non-Negotiable Evidence Boundary

- Every accepted capture includes the screenshot bytes, visible page text,
  source URL, page title, capture time, event identity, and visible market
  rows.
- Bear Edge computes the screenshot and visible-text SHA-256 digests. It never
  accepts a caller's digest as proof.
- Only prices visibly present in the retained evidence may be normalized.
- Hidden, locked, stale, ambiguous, or single-sided prices are never inferred.
- Two sides are paired only when event, period, market family, participant,
  stat, and line identify the same market at the same capture time.
- Direct browser capture is `captured_unverified`. It is real screen evidence,
  but it is not silently upgraded to `verified_provider_capture`.
- A direct screen capture may price research candidates and create shadow
  analysis. It may not weaken model validation or turn `PRICE_CHECK_ONLY` into
  `VERIFIED_BETS_ALLOWED`.
- DraftKings Predictions is an event-contract venue. Its prices must not be
  passed to the American-odds sportsbook simulator as though it were
  DraftKings Sportsbook.
- A Predictions EV calculation requires the exact visible contract cost,
  gross payout, and fee. Missing trade-slip economics yields `WAIT`.
- A real-money order is outside this bridge. No browser action may submit an
  order merely because a capture was imported.

## 3. Capture Contract

The authenticated capture endpoint accepts:

```json
{
  "capturedAt": "2026-07-23T23:41:00.000Z",
  "sourceUrl": "https://predictions.draftkings.com/en/event/...",
  "pageTitle": "KC Royals @ DET Tigers Predictions",
  "mimeType": "image/png",
  "imageBase64": "data:image/png;base64,...",
  "visibleText": "retained accessible page snapshot",
  "event": {
    "sport": "mlb",
    "league": "MLB",
    "eventId": "34425631",
    "away": "KC Royals",
    "home": "DET Tigers",
    "status": "live"
  },
  "markets": [
    {
      "period": "game",
      "marketType": "moneyline",
      "selection": "KC Royals",
      "side": "away",
      "line": null,
      "americanOdds": 203
    }
  ]
}
```

The server validates the source host, timestamp, image, text, event, market
shape, and visible tokens. It computes a deterministic capture identifier and
content digests, groups exact opposing sides, records incomplete markets, and
persists the screenshot plus an append-only JSONL envelope.

Contradictory visible signed prices for one selection are not resolved or
silently discarded. The client supplies an explicit omission with reason
`conflicting_visible_prices` and a structured total side and line. Each
reported price includes its exact visible row label; the server requires that
the label identify the same whole- or half-run total and that each signed price
occur beside it on a different retained accessibility row. Explicit omissions
are accepted only for the event's `Game Lines` page. Once either side of a
total conflicts, neither side at that period and line can appear in `markets`.
The immutable envelope records the canonical identity, visible row labels,
and prices. A capture may contain zero market rows only when the event status
is `closed`, `final`, or `market_unavailable`; a live empty board is invalid.

## 4. Exact Candidate Matching

Only structured player-prop rows are eligible to fill generated candidate
odds. A match requires:

- the same sport and a capture from three hours before through five hours
  after the scheduled event start;
- the same captured team/opponent identity;
- exact normalized full player name;
- exact stat key;
- exact numeric line;
- exact side; and
- a visible American price.

An opposite price is attached only when the capture contains the exact paired
side. The API uses the configured market timezone to select the relevant slate,
including the prior slate for a live event after local midnight. Candidate
pricing fails closed after five minutes. Missing pairs remain `WAIT` evidence,
and either one candidate matching multiple retained markets or one market
matching multiple candidates is an ambiguous event match. Game moneylines, run
lines, and totals remain captured context until Bear Edge has an independent
registered model for those market families.

## 5. Persistence

Default paths:

- envelopes: `data/evidence/direct_screen_captures.jsonl`;
- screenshots: `data/evidence/direct-screen-captures/<sha256>.<ext>`.
- visible accessibility snapshots:
  `data/evidence/direct-screen-captures/<visible-text-sha256>.txt`.

Artifact filenames are derived only from server-computed digests and validated
content. The JSONL record stores relative artifact locators, never the Base64
payload or raw visible-text contents. Repeated identical capture content is
idempotent by its full capture digest. The short display ID must match the full
digest, and each envelope is appended in one checked buffer write.

## 6. HTTP API

Add authenticated endpoints:

- `POST /api/direct-screen-captures` — validate, persist, pair, and return the
  capture plus exact candidate matches;
- `GET /api/direct-screen-captures/latest` — return the latest retained
  envelope and summary without returning image bytes.

Both endpoints use the existing operator-authorization policy. The POST does
not call a paid provider, evaluate a ticket, append a BET, or place a trade.

## 7. Dashboard

Add a compact Direct Screen Capture panel showing:

- provider, page title, source URL, and capture time;
- screenshot and visible-text digests;
- complete paired markets and incomplete single-sided markets;
- explicit conflicting-price omissions and every retained visible price;
- exact candidate matches;
- explicit `captured_unverified`, `PRICE_CHECK_ONLY`, and `$0 authorized`
  labels.

The panel must not contain a wager-submit control.

## 8. Predictions Contract Economics

Add a pure calculator that accepts only an exact visible quote:

```json
{
  "contractCost": 0.43,
  "grossPayout": 1.00,
  "fee": 0.02,
  "winProbability": 0.50
}
```

It returns win profit, loss amount, expected profit, ROI, and a research-only
fractional-Kelly shadow stake. All fields must be finite and economically
consistent, and one contract must settle at exactly $1. The result always
carries `PRICE_CHECK_ONLY` until the existing model registry and candidate gate
independently authorize more.

## 9. Verification

- Unit tests cover malformed sources, future timestamps, invalid images,
  absent visible tokens, exact two-sided pairing, incomplete props,
  idempotent persistence, exact candidate matching, and contract economics.
- API tests cover authorization, persistence, GET-latest behavior, and
  absence of Base64 image data in responses.
- Dashboard tests verify the evidence labels and lack of a wager action.
- A live Chrome capture is posted to the running local app and visibly
  reconciled against the retained screenshot, URL, timestamp, and prices.
- Full typecheck and test verification must pass before completion.
