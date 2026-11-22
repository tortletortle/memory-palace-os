# Memory Palace OS V0.5 — independent robustness report

## Scope

This report evaluates three new engineering components: Bayesian model averaging (BMA) over three forgetting families, separation of visual and semantic interference channels, and an online change-point detector. It uses deterministic synthetic observations, 32 seeds per scenario, six scenarios (192 runs total). It is not evidence of improved human learning.

## BMA versus fixed exponential baseline

Metric: mean absolute error between predicted next-period recall and the observed rate in the final ten synthetic observations. Lower is better.

| Scenario | BMA MAE | Fixed exponential MAE | Result |
|---|---:|---:|---|
| Stable exponential | 0.1350 | 0.2309 | BMA better |
| Stable power-law | 0.1338 | 0.2171 | BMA better |
| Two-phase | 0.1024 | 0.1609 | BMA better |
| Abrupt decay shift | 0.1852 | 0.1165 | BMA worse |
| Visual-dominant | 0.1459 | 0.2640 | BMA better |
| Semantic-dominant | 0.1400 | 0.1235 | BMA worse |

BMA improved this metric in four of six synthetic conditions and regressed in two. In particular, it lagged after an abrupt regime shift and under the semantic-dominant generator. Therefore it does not resolve all V0.4 prediction degradation; model averaging reduces dependence on a single decay family but can still be slow to adapt or misspecify the observation process.

## Online change-point detector

Default threshold: posterior probability 0.95 that the recent Bernoulli success rate is at least 0.20 below the historical rate. Detection rates across 32 seeds:

| Scenario | Detection rate |
|---|---:|
| Stable exponential | 6.25% |
| Stable power-law | 0% |
| Two-phase | 3.13% |
| Abrupt decay shift | 18.75% |
| Visual-dominant | 3.13% |
| Semantic-dominant | 3.13% |

The conservative detector has low false-alert rates in stable synthetic cases, but only detects 18.75% of abrupt-shift runs. This is insufficient for autonomous intervention. It is advisory-only and requires further calibration, better observation streams, and power/false-alarm analysis.

## Interference separation

`splitInterference` returns independent visual, semantic, observed-confusion, and combined fields. Unit tests verify that a semantic-heavy confusion can outweigh low perceptual similarity. Semantic similarity is an input signal and is not automatically inferred; future integration should add a separately validated semantic encoder or human labels.

## Test and verification

- Full regression suite: 67/67 tests passed (57 inherited + 10 new).
- Focused TypeScript check: `tsc --noEmit --target ES2022 --module NodeNext --moduleResolution NodeNext src/model-selection.ts` passed.
- Full-project typecheck was not completed because dependency installation timed out; the project requires the declared Node type definitions.
- Experiment command: `npm run robustness:v05`.

## Decision

V0.5 is an experimental module release, not an automatic optimizer. Keep BMA predictions and change-point alerts in shadow/advisory mode. Do not automatically reschedule or rewrite memory scenes based on these outputs until calibration and prospective human validation are completed.
