# Changelog V1.3.0

- Added append-only per-concept inspector exposure events with bounded dwell time and idempotent event IDs.
- Added recall-task start timestamps; confidence is captured before the learner submits an answer.
- Added per-concept first-interaction provenance, inspector dwell summaries, response-time summaries and descriptive confidence Brier diagnostics.
- Kept passive viewing, response time and confidence out of the forgetting model; they remain descriptive until prospective calibration.
- Added CSV export for recall and exposure events with spreadsheet-formula injection protection.
- Preserved V1.2 legacy state and API compatibility; legacy timestamps are explicitly labelled as proxies.
- Added prospective randomized experiment protocol; no human efficacy results are claimed.
