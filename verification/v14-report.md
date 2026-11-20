# Memory Palace OS V1.4.0 — Budgeted Review Planning

## Scope and decision
The exact V1.3.0 archive is the base. Added a read-only review planner, UI integration, validation, and simulated comparison. Existing learning report and storage contracts remain unchanged. No automatic relocation or recoding has been enabled. The existing unaided mode is label-hidden **spatial localization**, not free recall of knowledge, and the plan labels it accordingly. 

## Implementation
- `src/spatial/review-planner.ts`: deterministic integer-seconds 0/1 knapsack, one task per concept, 24-hour exclusion since latest attempt, evidence collection for <3 valid unaided observations, and two elapsed-interval / estimated-risk policies. Fixed prioritizes older items with a 3-day reference interval; it is not a rigid due-date rule. Adaptive prioritizes model risk plus a small recency term, or cold-start evidence collection. The score is a heuristic, not learned utility. No duplicate task IDs; estimated cost is median observed response time + 10 s bounded to 15–120 s (30 s cold start). The plan is read-only and recomputed on request; it is a per-session estimated budget, not a hard daily quota or actual wall-clock cap.
- Added GET `/api/palaces/:id/review-plan?budgetSeconds=300&policy=fixed`; accepts 0–3600 integer seconds and `fixed` or `adaptive`. Default fixed. Existing API payloads are unchanged.
- Frontend adds 2/5/10-minute budget and policy selection, planned queue, locked spatial-localization mode, exit at queue exhaustion, and no advancing while the current recall POST is pending. Prior random training is preserved. Unsaved changes or failed recall persistence can affect plan completion; no durable plan/session log or enforced time cap is claimed.

## Reproducible synthetic experiment
`npm run review:experiment` runs 24 paired seeds in each of three scenario families. 24 concepts are exposed at day 0, 21 days of 6 reviews/day at a constant 30 s/task; delayed probe on day 28. Both policies use the production planner and dual-memory posterior. The simulator's latent half-lives are hidden from both policies; the generated outcome uses seed/concept/day common random draws. Each arm receives 126 reviews per run. No policy tuning was performed after evaluation. Terminal expected recall averages the simulator's latent probabilities; observed recall is sampled from them. Approximate paired t intervals quantify Monte Carlo uncertainty, not human population effects.

|Scenario|Fixed expected|Adaptive expected|Paired delta (pp)|Approx. 95% interval (pp)|Fixed observed|Adaptive observed|
|---|---:|---:|---:|---:|---:|---:|
|Heterogeneous|49.83%|45.44%|-4.39|[-6.05,-2.73]|51.04%|44.62%|
|Homogeneous|59.83%|57.37%|-2.46|[-3.80,-1.12]|60.42%|56.08%|
|Abrupt shift|41.68%|35.00%|-6.68|[-8.28,-5.07]|42.53%|34.72%|

All 72 paired runs matched review counts. Risk priority regressed in all three. The results are not evidence of human learning efficacy; the synthetic model is structurally similar to the forgetting predictor, and the scenarios and parameters are author-selected. One possible explanation is misalignment between current risk and terminal utility; causal explanation requires ablations and untouched test seeds. Default fixed is a conservative engineering decision, not a clinical or educational recommendation.

## Acceptance
- Full suite: 136/136 passed (132 inherited + 4 new).
- Full strict TypeScript `tsc --noEmit` passed with available installed Node declarations temporarily linked locally. The link is excluded from release; install devDependencies normally.
- Frontend JS syntax and inherited DOM-selector contracts passed; actual browser/WebGL E2E unexecuted.
- V1.1 spatial smoke unchanged; 40-concept fixture zero object/room overlaps.
- No real remote-model call, human study, or transfer/free-recall outcome experiment conducted.

## Follow-up
Derive a marginal benefit objective (counterfactual delayed retention with versus without review), enforce coverage and fairness, and evaluate on new held-out synthetic conditions. Add actual answer-production tasks outside the palace and persist plan, policy, and outcome provenance before a prospective human study. Keep geometry adaptation advisory until matched recoding cost data exists.
