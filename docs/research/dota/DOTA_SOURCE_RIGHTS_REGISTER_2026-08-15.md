# Dota 2 Source Rights Register — 2026-08-15

> **Status:** P1.1 research artifact. This file is a fail-closed source-eligibility register, not legal advice and not permission to ingest data.
>
> **SAFETY_INVARIANT:** authorization is `RESEARCH_ONLY`; authorized stake is `$0`; execution is disabled.

## Purpose and scope

This register implements the first evidence step of `docs/canonical/ROADMAP.md` P1.1 for the explicitly selected vertical slice: **Dota 2 pre-match best-of-three series winner**.

It answers one narrow question before any real training corpus exists:

> Which candidate data paths are currently eligible, blocked, or still require purpose-specific review for Bear Edge betting/model-development research?

This artifact contains **no odds, model probability, recommendation, stake, Supabase projection, or execution path**. It does not retain a real Dota match corpus.

A source is not approved merely because it is public, free, technically accessible, open-source software, or marketed for esports analytics. Vendor identity and upstream data lineage are tracked separately. If the right to retain and use underlying data for the declared betting/model-development purpose is not explicit, the source fails closed.

## Status vocabulary

| Status | Meaning |
|---|---|
| `APPROVED` | Written evidence explicitly permits the declared purpose, fields, retention, and derived-model use. No candidate source currently has this status. |
| `REVIEW_REQUIRED` | Technical access exists, but purpose/retention/derived-model rights are not explicit enough to admit a training corpus. |
| `CONDITIONAL_WRITTEN_LICENSE_REQUIRED` | The vendor clearly offers a betting/model path, but Bear Edge must obtain and retain the applicable written agreement before ingestion. |
| `BLOCKED_PUBLIC_TERMS` | Current public terms conflict with the declared odds/odds-related model-development purpose. |
| `BLOCKED_UNRESOLVED_DATA_RIGHTS` | Software or an endpoint is accessible, but rights to the underlying data for this purpose are unresolved. |
| `MANUAL_ONLY_PENDING_REVIEW` | May be consulted manually for event/source discovery, but must not feed or be retained in a training corpus until reviewed. |

## Declared Bear Edge purpose

- Product/research project: Bear Edge.
- Game: Dota 2.
- Initial market family: pre-match best-of-three series winner only.
- Intended use under review: retain point-in-time historical match/event/team/roster/context data to build, evaluate, and prospectively validate a statistical probability model used to compare against betting/prediction-market prices.
- Excluded from this phase: live betting, draft/hero information from the target series, props, parlays, wager execution, positive stake, resale of raw source data, or public redistribution of a source corpus.
- Data-use rule: no real training corpus until a source path reaches `APPROVED` with retained evidence and upstream lineage.

## Candidate-source register

### `valve_steam_web_api`

| Field | Current record |
|---|---|
| Vendor / rights-facing entity | Valve Corporation / Steam |
| Upstream lineage | Valve / game and Steam data; downstream sources may also originate here |
| Access method | Steam Web API under an application-specific API key and Steam Web API Terms of Use |
| Allowed host / evidence page | `https://steamcommunity.com/dev/apiterms` |
| Dota coverage | Steam/game data available through the relevant APIs; exact Dota fields are not approved by this register |
| Publicly stated license scope | Access the Steam Web API, implement it in the identified application, and distribute Steam Data to end users for personal use via that application, subject to stated restrictions |
| Declared betting/model-development purpose explicit? | **No explicit grant identified in the reviewed public terms** |
| Retention rights for a betting-model training corpus explicit? | **Not established** |
| Derived-model rights explicit? | **Not established** |
| Redistribution | Restricted to the terms; all rights not explicitly granted are reserved |
| Operational limits noted | API key confidentiality; 100,000 calls/day; Valve can change/suspend/terminate access; other restrictions apply |
| Terms freshness | Public terms page states last updated July 2010; re-review required before any access decision |
| Evidence capture | URL reviewed on 2026-08-15; raw terms artifact/digest not retained in this change |
| Status | `REVIEW_REQUIRED` |

**Decision:** Do not use Valve/Steam API data to build or retain the real P1 training corpus yet. Public access is not being interpreted as an affirmative grant for the declared betting/model-development retention purpose.

---

### `opendota_public_platform`

| Field | Current record |
|---|---|
| Vendor / project | The OpenDota Project |
| Upstream lineage | OpenDota states that raw data comes from Valve WebAPI and automated parsing of Dota 2 replay `.dem` files |
| Access method | Public OpenDota service and open-source OpenDota codebase |
| Evidence pages | `https://github.com/odota/core` and OpenDota public documentation/service |
| Code license | MIT for the OpenDota `core` code repository |
| Underlying data license for this purpose | **Not established by the code license** |
| Declared betting/model-development purpose explicit? | **No purpose-specific data grant identified** |
| Retention rights for underlying match data explicit? | **Unresolved** |
| Derived-model rights explicit? | **Unresolved** |
| Redistribution | Not inferred from the MIT software license for underlying match/replay data |
| Evidence capture | Repository/README reviewed on 2026-08-15; raw external payload/digest not retained in this change |
| Status | `BLOCKED_UNRESOLVED_DATA_RIGHTS` |

**Decision:** The MIT license is evidence about OpenDota software, not proof that all underlying Dota match/replay data may be retained for betting-model development. OpenDota remains blocked for the real corpus until data-purpose rights and upstream lineage are resolved.

---

### `grid_data_platform`

| Field | Current record |
|---|---|
| Vendor | GRID Esports / GRID Data Platform |
| Upstream lineage | GRID states its official esports data is sourced directly from game servers through publisher/tournament-organizer relationships; upstream rights holders vary by competition |
| Access paths identified | Open Access / Non Commercial Access; separate paid Betting & Fantasy / GRID Bet access |
| Evidence pages | `https://grid.gg/get-access/`, `https://grid.gg/open-access/`, `https://grid.gg/live-esports-data/`, `https://grid.gg/bet/`, `https://grid.gg/betting-application-form/` |
| Dota coverage | GRID publicly advertises Dota 2 coverage, including Open Access and paid betting-oriented products |
| Open/free path | GRID advertises free/non-commercial access for eligible developers, researchers, startups, students and fans; Open Access includes Dota 2 |
| Betting path | GRID separately advertises paid Betting & Fantasy / sportsbook and odds-provider products and asks applicants to identify Dota 2 and betting-business use cases |
| Declared Bear Edge purpose covered by current retained agreement? | **No agreement retained** |
| Retention rights | **Must be explicit in the applicable written agreement** |
| Derived-model/odds-model rights | GRID markets data for odds models/betting use cases, but Bear Edge has not retained a contract granting its exact purpose |
| Redistribution | Must follow the applicable agreement; not inferred from marketing pages |
| Evidence capture | Public product/access pages reviewed on 2026-08-15; no executed agreement, raw contract artifact, or digest retained in this change |
| Status | `CONDITIONAL_WRITTEN_LICENSE_REQUIRED` |

**Decision:** GRID is the strongest candidate for an official betting/model-development path, but its existence is not permission. Do not ingest real GRID Dota data until a written agreement specifically covers the declared use, competitions/fields, retention, derived-model rights, permitted hosts, expiration, and any required paid Series Events or other entitlement.

---

### `pandascore_subscription`

| Field | Current record |
|---|---|
| Vendor | PandaScore |
| Upstream lineage | PandaScore database/services; competition-level upstream lineage must be separately recorded if ever reconsidered |
| Access method | PandaScore subscriptions / API |
| Evidence page | `https://www.pandascore.co/terms-and-condition` |
| Relevant public-term restriction | Article 2.8 says subscriptions do not include odds and prohibits developing, attempting to develop, distribute, supply, or commercialize odds or odds-related products/services using subscription data/services; Article 6.4 repeats an odds/odds-related development prohibition |
| Declared Bear Edge purpose compatible with reviewed public subscription terms? | **No** |
| Retention rights | Irrelevant for admission while purpose is blocked; no corpus ingestion permitted under this reviewed path |
| Derived-model rights | Public subscription terms conflict with the declared odds/odds-related purpose |
| Override path | Only a distinct written agreement that expressly authorizes the Bear Edge purpose may supersede this register entry |
| Evidence capture | Public terms reviewed on 2026-08-15; raw terms artifact/digest not retained in this change |
| Status | `BLOCKED_PUBLIC_TERMS` |

**Decision:** PandaScore public subscription data must not be used for Bear Edge odds/edge-model development under the reviewed terms. Do not ingest, cache, or train on PandaScore data for this slice unless a separate written agreement expressly authorizes the declared purpose.

---

### `public_organizer_pages`

| Field | Current record |
|---|---|
| Vendor | Competition organizer / publisher pages, varies by event |
| Upstream lineage | Organizer/publisher first-party publication |
| Access method | Manual browser review only in P1.1 until a specific reuse path is approved |
| Declared betting/model-development retention right | Not assumed |
| Automated scraping | Not approved by this register |
| Corpus retention | Not approved |
| Permitted current use | Manual source discovery, event-identity corroboration, and rights investigation only |
| Status | `MANUAL_ONLY_PENDING_REVIEW` |

**Decision:** A publicly viewable organizer page is not automatically a reusable training-data feed. Record any candidate organizer separately with its own terms/evidence before promoting it beyond manual-only use.

## Upstream-lineage rule

Vendor identities must not be counted as independent evidence when their underlying data originates from the same upstream source.

Examples:

- `opendota_public_platform` may include Valve WebAPI data and replay-derived data; it is not automatically independent of `valve_steam_web_api`.
- `grid_data_platform` may distribute official data under rights-holder/tournament agreements; the specific competition rights holder must be recorded at ingestion time.
- An aggregator that republishes an organizer result does not become an independent upstream fact source solely because it has a different domain.

Each future source contract must include at least:

```text
source_id
vendor_identity
upstream_lineage_id
purpose_id
access_method
allowed_hosts
competition_scope
field_scope
permitted_use
prohibited_use
retention_rule
derived_model_rule
redistribution_rule
effective_at
expires_at_or_review_at
terms_evidence_ref
terms_evidence_digest
parser_version
status
reviewer
```

Unknown required fields fail closed.

## Admission gate for a real Dota corpus

A source must not contribute real training rows unless all of the following are true:

1. Status is `APPROVED` for the exact declared purpose.
2. The governing agreement/terms artifact is retained immutably with a digest.
3. Upstream lineage is identified.
4. Competition and field scope are explicit.
5. Retention and derived-model rights are explicit.
6. Allowed access method and hosts are explicit.
7. Expiration/review date is known.
8. The point-in-time dataset layer can retain evidence-backed `availableAt` / `knownAt`, not merely present-day fetch time.
9. Raw artifact references, content digests, and parser versions can be preserved.
10. No P1.1 stop condition remains unresolved.

## Current source-admission result

| Candidate | Status | Real training corpus admitted? |
|---|---|---|
| Valve / Steam Web API | `REVIEW_REQUIRED` | **NO** |
| OpenDota | `BLOCKED_UNRESOLVED_DATA_RIGHTS` | **NO** |
| GRID | `CONDITIONAL_WRITTEN_LICENSE_REQUIRED` | **NO** |
| PandaScore public subscription | `BLOCKED_PUBLIC_TERMS` | **NO** |
| Public organizer pages | `MANUAL_ONLY_PENDING_REVIEW` | **NO** |

**P1.1 result after this register:** zero approved real-corpus sources. This is a correct fail-closed state, not a failure to make progress.

## Next single change after human review

After this register is reviewed and accepted, the next isolated change should define a machine-readable source-contract schema and synthetic fixtures that encode these status and lineage rules. It must still contain no real Dota match corpus, no odds, no model probability, no recommendation, no stake, and no execution path.

Do not begin P1.2 ingestion until P1.1 has at least one `APPROVED` real-data path with retained purpose-specific evidence.