# V1.6.0 — Independent knowledge assessment

- Added standalone `/assessment.html` and navigation link from the palace.
- Added free recall and authored transfer task bank; references are revealed after persisted submission. Grade is an immutable self-report, not automated grading.
- Versioned question identity based on source evidence and concept metadata; stale transfer questions cannot be issued, existing attempts retain snapshots.
- Added separate first-submission and all-attempt summaries; uncertain and ungraded reported separately.
- No changes to V1.5 scheduling defaults or spatial recall model. Independent results are not used to train the spatial predictor.
- 146/146 regression tests; full TypeScript and JS syntax checks passed. Chromium navigation was blocked by environment policy; no browser acceptance claimed.
