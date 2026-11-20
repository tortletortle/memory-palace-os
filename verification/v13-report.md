# Memory Palace OS V1.3.0 — Longitudinal Learning Instrumentation

## Release objective

Replace the palace-creation-time proxy with per-concept instrumented interaction timestamps where available, capture study-view dwell and pre-answer confidence, and make event data exportable for prospective evaluation. V1.3 does not change the forgetting model's parameterization or automatically modify palace geometry.

## Implemented

1. **Inspector exposure events**
   - `PalaceExposure` records a concept, session, event ID, client start timestamp, server receipt timestamp, duration and fixed `inspector` surface.
   - Frontend starts timing only after a deliberate object selection; automatic initial selection is not counted.
   - Timing closes on concept switch, opening the add-object dialog, starting recall, save, visibility loss and page exit.
   - Server validates concept membership, canonical timestamps, a 1–600 second duration, recent event windows, event caps and idempotent event IDs.

2. **Recall task timing and confidence**
   - Recall records optionally include `startedAt` while preserving old V1.2 payload compatibility.
   - Confidence 1–5 is selected before the answer is submitted.
   - Confidence is mapped descriptively to 0.1/0.3/0.5/0.7/0.9 for a Brier score. This is not yet a calibrated probability model.

3. **Per-concept longitudinal report**
   - Reports first-interaction timestamp and its provenance (`inspector_view`, `recall_task_start`, `legacy_recall_timestamp`, or `palace_creation_proxy`).
   - Reports inspector view count, total and median dwell, response-time median/p90, confidence bins and Brier score.
   - Legacy records without instrumented start times continue using the V1.2 creation-time proxy and are explicitly labelled.
   - Passive viewing, response time and confidence are descriptive only; they are not fed into the forgetting posterior.

4. **Research data export**
   - `GET /api/palaces/:id/learning/export` emits event-level CSV for recall and inspector exposure events.
   - CSV cells beginning with spreadsheet formula characters are escaped to reduce formula-injection risk.

5. **Prospective experiment protocol**
   - Added a matched-concept, within-participant randomized comparison of fixed versus model-guided review timing, with equal review-count/time budgets and delayed unaided recall as the primary endpoint.
   - This is a design protocol only. No human efficacy experiment has been run.

## Verification

- Full automated suite: **132/132 passed**.
- Frontend JavaScript syntax check: passed (`node --check public/app.js`).
- Full TypeScript strict project check: passed (`tsc --noEmit`).
- V1.1 spatial smoke regression: passed with unchanged fixture metrics.
  - 18-concept fixture: mean related distance 16.380 -> 12.953; route length 81.705 -> 88.473; room-overlap violations 0 in both; objective 17.3603 -> 14.0148.
  - 40-concept stress fixture: 7 rooms, 15 inter-room links, 0 isolated concepts, 0 object overlaps and 0 room overlaps.
- New V1.3 tests cover observed exposure baselines, recall-task start timestamps, V1.2 legacy fallback, confidence Brier arithmetic, dwell summaries, event validation, idempotency, CSV export and formula-injection escaping.
- API integration tests exercise the new routes over local HTTP.
- Real browser/WebGL end-to-end testing was not completed in this environment.

## Interpretation limits

- Inspector dwell measures that a card was selected and the page remained foregrounded; it does not prove visual attention, comprehension or encoding.
- Client timestamps can drift or be manipulated. The server bounds event windows but does not cryptographically attest client time.
- The confidence mapping is a fixed descriptive convention, not a learned calibration curve. Sparse confidence data must not be interpreted as reliable calibration.
- Response time is affected by device, reading speed and interaction style; it is not a direct knowledge measure.
- The forgetting model remains an engineering heuristic and is not calibrated on prospective human longitudinal data.
- No causal efficacy claim is made for Memory Palace OS, 3D spatial memory, or model-guided review timing.

## Release decision

V1.3 is a longitudinal instrumentation and research-readiness release. It improves the quality and auditability of the evidence available to future models and experiments, while deliberately keeping passive exposure and self-reported confidence out of automatic memory-state updates.
