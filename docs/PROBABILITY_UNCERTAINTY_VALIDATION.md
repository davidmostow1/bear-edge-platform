# Probability Uncertainty Validation

## Scope

This validation covers `src/live/probability-uncertainty.js`. The module uses the Wilson-Hilferty approximation to construct chi-square quantiles for an approximate Garwood interval around an observed Poisson count. It then maps the lower and upper mean bounds through the count model to produce a probability interval.

The decision layer uses the lower probability bound. It does not use the point estimate for expected value, Kelly sizing, or minimum-price authority when observed-count evidence is available.

## Independent Reference

On July 17, 2026, the following Wolfram Language expression was evaluated independently of the repository implementation:

```wolfram
N[{
  Quantile[ChiSquareDistribution[124], 0.025]/20,
  Quantile[ChiSquareDistribution[126], 0.975]/20,
  SurvivalFunction[PoissonDistribution[Quantile[ChiSquareDistribution[124], 0.025]/20], 5],
  SurvivalFunction[PoissonDistribution[6.2], 5],
  SurvivalFunction[PoissonDistribution[Quantile[ChiSquareDistribution[126], 0.975]/20], 5]
}, 12]
```

The reference models 62 observed events over 10 games and the probability of at least 6 events in the next game.

| Quantity | Wolfram exact reference | Local approximation | Absolute error |
| --- | ---: | ---: | ---: |
| Lower mean | 4.753504448617262 | 4.753253355914046 | 0.000251092703216 |
| Upper mean | 7.948120187574624 | 7.948252114208093 | 0.000131926633469 |
| Lower probability | 0.34087707550475344 | 0.3408332931828735 | 0.000043782321880 |
| Point probability | 0.5858869614156224 | 0.5858869614156225 | 0.0000000000000001 |
| Upper probability | 0.8039651968125778 | 0.8039775175867521 | 0.000012320774174 |

`test/probability-uncertainty.test.js` retains these reference values and tolerances so future changes cannot silently weaken the approximation.

## Limits

This is a sampling interval around a recent observed count, not a calibrated posterior probability interval. It assumes Poisson dispersion. It does not by itself account for lineup, role, opponent, weather, park, umpire, injury, bullpen, or other contextual uncertainty. Those omissions remain explicit risk gates, and every current model remains `research_only` until the model registry has sufficient settled, out-of-sample calibration evidence.
