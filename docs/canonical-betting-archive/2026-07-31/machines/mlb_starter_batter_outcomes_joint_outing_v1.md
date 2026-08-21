# Sweet Bear Starter-Only Batter Outcome Extension

## Canonical identity

- proposed model ID: `mlb_starter_batter_outcomes_joint_outing_v1`
- parent model: `mlb_pitcher_strikeout_joint_outing_v1`
- scope: plate appearances against the named starting pitcher only
- implementation status: `SPECIFIED_NOT_IMPLEMENTED`
- calibration status: `UNCALIBRATED`
- validation status: `NOT_VALIDATED`
- full-game batter-prop completeness: `INCOMPLETE`

## Governing architecture

There must be one simulated outing and one shared plate-appearance draw history.

For every simulation:

```text
sum of all nine batters' strikeouts against the starter
must exactly equal
the starter's strikeout total
```

This is exact integer equality per simulation. It is not an average or tolerance comparison.

No batter calculation may rerun the outing, create a second strikeout draw, use a separate random generator, or estimate the number of plate appearances against the starter independently.

## Required external PA taxonomy

Every starter-facing PA must resolve to exactly one category:

- `K`
- `BB`
- `HBP`
- `other_pa`
- `1B`
- `2B`
- `3B`
- `HR`

`other_pa` is required because residual completed PAs can include field errors, catcher interference, sacrifices, fielder's choices, and other events that are not accurately described as outs in play.

## Required per-batter distributions

Across simulations, each batter must receive a full integer PMF for:

- hits
- total bases
- home runs
- strikeouts
- walks
- singles
- doubles

The number of plate appearances against the starter remains random and arises only from the shared outing simulation.

## Protected legacy behavior

The existing pitcher prediction command and serialized artifact must remain byte-identical for the preflight fixture.

The extension must not:

- alter the existing strikeout probability calculation
- alter random-draw order
- add a random draw before existing pitch, reached-base, damage, or removal draws
- change the pitch trajectory
- change the damage-proxy trajectory
- change the removal trajectory
- add batter fields to the existing pitcher artifact

The batter extension requires a separate research artifact.

## Latent outing state

The parent engine's `sharedEta` remains where it already exists:

- pitcher strikeout logit
- starter removal hazard

For the proposed extension, non-strikeout outcome mass inherits changes through `1 - pK`. No category-specific latent loading may be invented without fitting and separate authorization.

## Prohibited outputs

The specified extension must not emit or imply:

- runs
- RBIs
- bullpen outcomes
- full-game batter-prop completeness
- sportsbook edge
- market EV
- wager
- stake
- recommendation authorization

## Required labels

Every future batter artifact must state:

```text
scope: STARTER_ONLY
completeness: INCOMPLETE_FOR_FULL_GAME_BATTER_PROPS
authorization: RESEARCH_ONLY
validationStatus: NOT_VALIDATED
calibrationStatus: UNCALIBRATED
marketComparisonAllowed: false
```

Required warning:

> This distribution covers plate appearances against the named starting pitcher only. It excludes bullpen plate appearances and is not a complete full-game batter-prop probability.

## Required acceptance tests

1. exact per-simulation pitcher-to-batter strikeout coherence
2. eight-category PA probabilities sum to one
3. every batter PMF sums to one
4. total bases equals singles plus twice doubles plus three times triples plus four times home runs in every simulated batter state
5. whole-line push handling
6. half-line no-push handling
7. batting-order exposure: first hitter PA count is never below ninth hitter PA count in the same simulation
8. complete event mapping with unknown events failing closed
9. legacy pitcher artifact byte identity
10. every pre-existing test still passes
11. starter-only warning labels present
12. prohibited output fields absent

## Current evidence status

A detailed read-only preflight and implementation specification exist in the preserved full-thread transcript. No accepted implementation commit, passing coherence test, passing byte-regression test, fitted outcome-specific priors, or batter artifact exists in the canonical record.

Do not promote this record based on specification detail alone.
