# Memory Palace OS V1.5.0 — Marginal Memory Gain (MMG)

## Changes
Built directly on V1.4.0. New `src/spatial/marginal-gain.ts` integrates the joint-grid posterior over knowledge-channel half-life (the UI actually measures label-hidden spatial localization, not unaided knowledge recall). Given elapsed time e, half-life h and horizon H=7 days, p=2^(-e/h), P0=2^(-(e+H)/h), and P1=p*2^(-H/[h*(1+0.33*ln(1+e))])+(1-p)*2^(-H/[1.08*h]). Average both P1 and P0 over posterior weights, then use max(0,P1-P0). Assumes revealed feedback in both branches. The existing model's latent growth cap and sub-0.05-day update guard are not reproduced in this one-step proxy; intervention effects have not been empirically identified. This is not full multi-step planning.

The existing exact 0/1 integer-second knapsack supports `policy=marginal` via GET review-plan API and UI. Eligible items still exclude attempts within 24 hours. Never-attempted or >=7 days since last attempt receive a lexicographic coverage bonus of N+1, which prioritizes maximum feasible count of such items, then sum of marginal gains. This is not a guaranteed maximum interval when budget is insufficient. The default remains fixed. Planning stays read-only. The learning report adds `marginalReview` (P0, P1, gain, horizon and proxy model); no automatic geometry change. The gain depends on posterior assumptions even for sparse data, so cold-start gains are not empirical probabilities. The learning report continues to use legacy exposure proxies where needed.

## Experiment
New seed schedule 731927+379*i, i=0..23; 6 scenario families x 24 seeds x 4 arms = 576 arm runs (144 paired scenario/seed blocks). 24 items, 21 days, 180 seconds/day, 30 seconds per review; all arms have 126 completed reviews/run. Common random draws per seed/item/day. All items initially exposed. No fitted tuning. Three original generator families and three author-selected stress families: power-law probability, reset-only (no increase in half-life), stronger retrieval growth. Measurements at 1, 7, and 28 days after training. The 7-day expected value is the simulator's latent probability, not human evidence. Paired approximate 95% t intervals are simulation uncertainty and not multiplicity-adjusted. 

| Scenario | Fixed | Risk | MMG protected | MMG unprotected | MMG minus fixed pp [95% CI] | Unprotected mean max gap (days) |
|---|---:|---:|---:|---:|---:|---:|---:|
| heterogeneous | 47.39% | 43.61% | 48.09% | 48.55% | +0.70 [-0.56, +1.97] | 12.58 |
| homogeneous | 58.85% | 56.54% | 55.21% | 54.75% | -3.63 [-4.75, -2.52] | 14.08 |
| abrupt_shift | 39.62% | 32.43% | 41.91% | 42.32% | +2.29 [+0.96, +3.62] | 12.54 |
| power_law | 51.06% | 48.20% | 51.20% | 50.73% | +0.14 [-0.63, +0.92] | 14.33 |
| reset_only | 18.19% | 14.26% | 18.14% | 17.84% | -0.05 [-0.34, +0.25] | 13.29 |
| retrieval_strong | 53.16% | 54.67% | 53.50% | 54.24% | +0.34 [-1.88, +2.57] | 11.96 |

MMG protected beats risk on 5/6 and fixed on 4/6 point estimates, but only abrupt shift has an interval wholly above zero vs fixed; homogeneous is worse and the other four intervals include zero. Coverage ablation: protected max gap is 7 days in all these runs (fixed 4); unprotected mean max gap ranges 11.96–14.33 days. Protection is not uniformly better for retention. The reset-only and retrieval-strong cases challenge the feedback multiplier; other scenarios still share some assumptions with the predictor. All comparisons are synthetic, not claims of causal learning efficacy or external validation. Keep fixed default, MMG experimental. 

## Verification
141/141 automated tests passed (136 inherited and 5 new), full `tsc --noEmit` passed using local installed Node type declarations, front-end `node --check` passed. No actual browser/WebGL, human experiment, cross-palace free answer production, or automated spatial reconstruction test in this release. 

## Reproduce
Node >=22.16.0. `npm install` for dev dependencies, `npm test`, `npm run typecheck`, `npm start`. `npm run review:experiment:v15` runs the whole simulation. To run separately (recommended under short execution limits), run `npm run review:experiment:v15 -- heterogeneous 0 24` and repeat for homogeneous, abrupt_shift, power_law, reset_only, retrieval_strong. Then `npm run review:experiment:v15 -- --merge` checks and combines exact 24-seed batches. The first monolithic run exceeded the environment's execution window; six complete batches succeeded and were merged. Original V1.4 results remain in verification. 

## Next work
Add actual typed-answer or externally graded free recall independent of spatial localization and persistent policy/session/answer provenance before collecting human evidence. Study budget-matched adaptive policy selection with held-out environment families, then reassess autonomous decisions. 
