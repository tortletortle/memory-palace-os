# V1.3 Prospective Human Study Protocol (Design Only)

## Research question
Does model-guided review timing improve delayed unaided recall compared with a fixed review schedule when both conditions receive the same number and duration of reviews inside the same Memory Palace system?

This protocol is a proposal. No participant data, prospective experiment, or efficacy result is included in V1.3.

## Design

- **Design:** randomized, matched-concept, within-participant comparison.
- **Unit of randomization:** concept clusters, not individual words that share a direct prerequisite or are likely to cue one another. Match clusters on knowledge type, source length, and a baseline difficulty probe, then randomize one cluster per pair to each arm.
- **Arm A — fixed schedule:** reviews at pre-registered fixed delays after the first instrumented exposure (for example, day 1, 3, 7 and 14).
- **Arm B — model-guided schedule:** reviews at the model's pre-registered threshold-crossing times, with the same maximum number of review opportunities and the same per-review time budget as Arm A.
- **Shared conditions:** same source content, same initial learning time, same 3D palace interface, same recall task, and no answer feedback before the primary delayed probe.

The example fixed delays are protocol candidates, not established optimal intervals. They must be frozen before data collection and not tuned against the confirmatory test set.

## Outcomes

- **Primary:** first-attempt unaided recall accuracy at day 28, before feedback or answer reveal.
- **Secondary:** day-7 unaided accuracy, response time, confidence Brier score, total study time, review count, missingness and task completion.
- **Exploratory:** cued-versus-unaided gap, error-pair recurrence and concept-kind interactions.

The primary analysis is intention-to-treat. Use a mixed-effects logistic model with treatment arm as a fixed effect and participant plus concept-cluster random intercepts. Report the effect estimate, 95% confidence interval, raw counts and missing-data pattern. Do not replace missing responses with failures without a pre-registered sensitivity analysis.

## Sample-size procedure

Run a small feasibility pilot first to estimate within-participant correlation, matched-pair variance, completion rate and baseline accuracy. Use those estimates to perform a prospective power calculation for the smallest educationally meaningful absolute accuracy difference. Do not choose a confirmatory sample size from the pilot's observed treatment effect alone. Freeze the sample size, exclusions, outcome definitions and analysis code before confirmatory enrollment.

## Data integrity and safeguards

1. Use instrumented per-concept exposure timestamps; do not use palace creation time as the exposure origin when a real event is available.
2. Preserve event-level timestamps, session IDs, mode, response time and pre-answer confidence in the CSV export.
3. Enforce identical review-count and time budgets across arms; log deviations rather than silently correcting them.
4. Randomize concept clusters with a recorded seed and retain the assignment table before outcomes are observed.
5. Prevent answer reveal before the day-28 primary probe; record any protocol violation.
6. Keep all spatial changes advisory and human-approved. Do not let an unvalidated memory model modify the treatment scene during the study.
7. Obtain informed consent, minimize identifiers, store data locally or under an approved research data policy, and provide a deletion procedure.

## Interpretation boundary

V1.3 instrumentation can support data collection and auditing. It does not establish that browser dwell equals attention, that confidence equals calibrated probability, or that model-guided scheduling improves learning. A positive result would require replication and a separate analysis of generalization across subjects, subjects/domains, and delayed intervals.
