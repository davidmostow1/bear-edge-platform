# Shadow Operator Completion Design

Date: 2026-07-20
Status: Approved continuation scope
Base branch: `codex/bear-edge-release-candidate`
Base commit: `2ca03a24fc1af20a3c03086757cd1dfb85c43d1e`

## 1. Purpose

Bear Edge already writes immutable evaluation records and has separate authenticated write endpoints for official prediction outcomes and final closing prices. Those endpoints are tested, but the local dashboard does not expose a safe workflow for completing shadow evidence. The only supported operator path is a long `curl` payload, which makes prospective calibration evidence difficult to collect consistently.

This change adds an authenticated Shadow Evidence Queue to the existing dashboard. It must make unresolved predictions visible, show exactly which evidence is missing, accept complete official-result and verified closing-price records, preserve append-only corrections, and show progress toward the registered calibration sample requirement.

This is an evidence-collection upgrade. It does not change prediction models, create betting recommendations, place bets, weaken validation, or change the current `PRICE_CHECK_ONLY` permission.

## 2. Non-Negotiable Trust Boundary

The operator interface must preserve the current evidence classes.

- A visible sportsbook page, screenshot, optical-character-recognition result, pasted text, ESPN page, ScoresAndOdds page, StatMuse page, or browser extension output is `captured_unverified` unless it is independently matched to an accepted provider record.
- An official outcome requires a retained official result artifact, a source locator, timestamps, a real SHA-256 digest, and `verified_official_result` status.
- A closing price requires the exact evaluated sportsbook, both sides of the market, the final market-close time, a retained source artifact, a real SHA-256 digest, and `verified_provider_capture` status.
- The interface must not offer a control that converts manual screen data into verified evidence by assertion.
- The interface must never fabricate a digest, infer a hidden opposite price, or silently substitute a different sportsbook.
- Shadow outcome and closing-price records contain no stake, profit, wager result, or bet-placement fields.
- Completing shadow evidence does not authorize a `BET` and does not change the evaluation's historical verdict or permission.

## 3. Architectural Decision

Add a dedicated shadow-evidence read model rather than extending the general decision-log analytics response.

The general decision-log summarizer was originally organized around evaluations, settlements, and amendments. New canonical record types must not be interpreted as evaluations. A dedicated module will read the authoritative ledger, validate its integrity, resolve the latest linear outcome and closing-price correction chains, and build a queue of actual evaluation records.

The existing append paths remain the only write authority:

- `POST /api/prediction-outcomes`
- `POST /api/closing-prices`

The dashboard will call those endpoints. It will not duplicate record construction, digest calculation, chronology validation, sportsbook matching, or append logic in browser code.

## 4. Server Read Model

Add `src/audit/evidence-queue.js` with a pure queue builder and an authoritative-ledger reader.

### 4.1 Input

The builder receives the complete inspected ledger records plus the inspection findings. Only canonical records whose `recordType` is `evaluation` may become queue items.

### 4.2 Integrity behavior

The queue fails closed for writes when the authoritative ledger contains malformed lines, duplicate identifiers, digest conflicts, invalid canonical records, or invalid evidence correction references. Read output still reports the exact blocking findings so the operator can distinguish an empty queue from an invalid ledger.

### 4.3 Queue item

Each item contains only the fields needed to identify and complete evidence:

- evaluation identifier and creation time;
- historical verdict and operational permission;
- event identifier, sport, league, start time, home team, and away team;
- market family, type, participant, selection, side, and line;
- evaluated sportsbook, market price, opposite price, and price timestamp;
- model identifier, version, and status;
- latest valid prediction outcome or `null`;
- latest valid closing price or `null`;
- outcome correction identifier and closing-price correction identifier;
- evidence status: `awaiting_event`, `missing_outcome_and_close`, `missing_outcome`, `missing_close`, `complete`, or `blocked`;
- explicit missing-evidence codes;
- whether outcome and closing-price forms are currently eligible to submit.

Eligibility is descriptive only. Server-side append functions remain authoritative.

### 4.4 Summary

The response summary contains:

- total canonical evaluations;
- complete shadow observations;
- evaluations missing outcomes;
- evaluations missing closing prices;
- evaluations waiting for event start;
- invalid correction references;
- ledger integrity status;
- registered minimum settled predictions;
- completion count and remaining count toward that minimum.

The sample target is read from the model-registry promotion policy rather than hard-coded in the dashboard.

## 5. HTTP API

Add authenticated `GET /api/evidence-queue`.

The endpoint uses the same bearer-token boundary as other sensitive API routes and returns:

```json
{
  "generatedAt": "ISO-8601 timestamp",
  "ledgerPath": "local authoritative path",
  "writeBlocked": false,
  "summary": {},
  "findings": [],
  "items": []
}
```

Query parameters:

- `status=unresolved|complete|all`, default `unresolved`;
- `limit`, default 100 and capped at 500.

Unknown query values are rejected with a client error. This endpoint performs no paid provider call and no external network request.

Successful outcome or closing-price writes return the appended record and a refreshed queue item for the referenced evaluation. The server may add this response field without changing the canonical record.

## 6. Dashboard Workflow

Add a `Shadow Evidence` destination to the dashboard navigation and a dedicated panel after the Decision Quality Gate.

### 6.1 Queue overview

The panel displays:

- current permission, which remains `PRICE_CHECK_ONLY` unless separately proven otherwise;
- complete observations and progress toward the registered minimum;
- missing-outcome and missing-close counts;
- ledger-integrity blocking state;
- a filter for unresolved, complete, or all items;
- a manual refresh button.

### 6.2 Evaluation cards

Each card displays the immutable prediction identity before any form fields:

- event and scheduled start;
- selection, side, and line;
- evaluated sportsbook and both offered prices;
- model status and historical verdict;
- existing outcome and close evidence, including correction identifiers;
- exact missing-evidence reasons.

The card does not display a `BET` action, stake action, or bet-slip link.

### 6.3 Official outcome form

The form includes every required API field:

- outcome;
- resolution time;
- final home and away scores, both supplied or both blank;
- observed market value and unit;
- provider;
- source type;
- source locator;
- artifact capture time;
- source time;
- artifact SHA-256 digest;
- notes.

The verification status is fixed to `verified_official_result` and clearly labeled. The operator must confirm that the retained artifact and digest are real. For a correction, the dashboard submits the latest outcome record identifier as `supersedesId`.

### 6.4 Closing-price form

The form includes every required API field:

- sportsbook, locked to the evaluated sportsbook;
- final market price;
- final opposite price;
- market-close time;
- provider;
- source type;
- source locator;
- artifact capture time;
- source time;
- artifact SHA-256 digest;
- notes.

`isFinal` and `verified_provider_capture` are fixed and clearly labeled. The form states that a browser screenshot or public aggregator is not sufficient verification. For a correction, the dashboard submits the latest closing-price record identifier as `supersedesId`.

### 6.5 Submission behavior

- Disable duplicate submission while a request is in flight.
- Show server validation errors without replacing them with a generic success message.
- On success, refresh the queue and calibration/readiness panels.
- Do not retain source digests, provider locators, or result details in local storage.
- Do not optimistically mark an item complete before the append succeeds.
- Require explicit confirmation before appending a correction that supersedes existing evidence.

## 7. General Decision-Log Compatibility

Update the general decision-log summarizer so `prediction_outcome` and `closing_price` records are not passed through `extractEvaluation`. They remain available through the dedicated queue and calibration projection.

This compatibility fix prevents evidence rows from inflating evaluation counts, verdict counts, hit-rate denominators, or data-quality findings.

## 8. Error Handling

The queue and forms must expose precise failures for:

- unknown or non-canonical evaluation identifiers;
- dirty or invalid authoritative ledger state;
- non-linear correction history;
- event not started for an outcome;
- outcome inconsistent with the evaluated side, line, and observed value;
- closing sportsbook mismatch;
- missing opposite price;
- close time after event start;
- source time after market close;
- source capture before market close;
- source capture after record creation;
- malformed or placeholder digest;
- prohibited financial fields;
- authentication failure;
- persistence or synchronization failure.

The local authoritative append result remains successful if optional Supabase projection is pending or retryable. The interface must display the returned synchronization state rather than claiming remote completion.

## 9. Security and Privacy

- All queue reads and evidence writes use the existing operator authorization policy.
- The dashboard relies on the existing fragment-to-memory bearer bootstrap and must not put the token in query strings, forms, logs, or local storage.
- Provider keys and service-role credentials are never returned.
- Source locators are rendered as escaped text or validated HTTP links only.
- All provider-controlled strings are escaped before rendering.
- Content Security Policy remains unchanged.
- No browser extension is part of the trust chain.

## 10. Testing Strategy

### 10.1 Unit tests

Add queue-builder tests for:

- evaluation-only accounting;
- unresolved, partial, complete, and pre-event statuses;
- latest linear correction resolution;
- invalid correction history;
- integrity findings;
- registered minimum progress;
- stable ordering and result limits;
- no input mutation.

### 10.2 API tests

Add tests for:

- authenticated queue access;
- unauthorized queue rejection in LAN mode;
- status filters and limit bounds;
- zero external-provider calls;
- refreshed queue state after outcome and close writes;
- canonical error responses.

### 10.3 Analytics regression tests

Append outcome and closing-price records to an evaluation fixture and assert that decision-log evaluation and verdict counts do not change.

### 10.4 Dashboard contract tests

Assert that the dashboard contains the queue panel, complete source fields, locked evidence-status language, correction confirmation, safe rendering, no financial inputs, and no bet-placement controls.

### 10.5 End-to-end verification

Run focused tests first, then:

- TypeScript type checking;
- all repository tests;
- protocol audit;
- release-readiness audit;
- `git diff --check`;
- controlled restart of the local server from the current worktree;
- authenticated browser validation of unresolved and completed fixtures.

Release readiness may remain blocked after this change because provider licensing, live exact-book prices, settled sample size, model validation, and remote deployment are external or later gates. A blocked release is an expected truthful result, not a failed implementation.

## 11. Completion Criteria

The task is complete only when:

1. The queue is built from the authoritative ledger without contaminating decision analytics.
2. An authenticated operator can append a valid official outcome through the dashboard.
3. An authenticated operator can append a valid exact-book closing price through the dashboard.
4. Corrections create linear append-only history and never mutate prior evidence.
5. Manual or browser-visible odds cannot be mislabeled as provider-verified evidence.
6. The calibration projection recognizes a completed shadow observation after both records exist.
7. Focused tests and the full verification suite pass.
8. The current worktree is validated through a controlled server restart and browser check.
9. Unrelated pre-existing changes remain intact.
