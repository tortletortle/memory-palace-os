# Memory Palace OS V1.2.0 — Evidence-Driven Memory Loop

## Release summary

V1.2 connects the V1.1 procedural 3D palace to persistent recall evidence and a read-only adaptation report. The user can switch between cue-assisted matching and no-label spatial-location recall. Each response is stored per concept; the report estimates cued and unaided memory separately and offers conservative review or intervention advice.

## Implemented

1. `PalaceRecall` event schema and append-only `palaceRecalls` storage, backward-compatible with earlier state files.
2. `POST /api/palaces/:id/recalls` with strict concept, grade, mode, reveal, confusion, response-time and confidence validation.
3. `GET /api/palaces/:id/learning` with per-concept empirical accuracy, joint memory estimates, review timing, confusion pairs and recommendations.
4. Reuse of the joint K/V half-life model and visual interference matrix.
5. A no-label spatial recall mode that hides anchor labels while retaining room context.
6. Workspace learning summary showing empirical accuracy, recorded training days, event count, next suggested review and top recommendations.
7. Advisory-only guard: the learning report never changes anchor coordinates, room topology or source knowledge.

## Verification

- Full automated suite: **127/127 passed**.
- New V1.2 coverage: 5 backend/model/API tests plus 1 frontend contract test.
- V1.1 spatial smoke regression: passed with unchanged fixture metrics.
- 40-concept geometry stress regression: passed with zero isolated concepts, object overlaps or room overlaps.
- Frontend JS syntax: passed.
- Full TypeScript typecheck: blocked by missing `@types/node`; not claimed as passed.
- Real browser/WebGL E2E: not run.

## Important interpretation limits

- `eventCount` counts all stored responses; `independentAttempts` counts time-spaced per-mode attempts; `modelObservations` counts observations accepted by the joint model. They intentionally differ. An immediate recall attempt shortly after palace creation is saved but may not enter the model because the existing model suppresses observations closer than 0.05 days to the assumed exposure/previous observation.
- Palace creation time is only a proxy for first exposure. The app does not yet record actual first-view time.
- The dual-memory model is an engineering heuristic, not a validated human-memory predictor.
- A wrong selection is observed behavior, not proof of semantic or visual confusion. Repeated pairs are surfaced for manual inspection.
- Response time and optional confidence are recorded but not used for prediction.
- No human prospective efficacy study was performed.

## Release decision

V1.2 is a functional evidence-capture and advisory adaptation slice. It closes the product loop from 3D spatial recall to persistent data and model-backed suggestions, but it is not yet an autonomously optimizing or human-validated learning system.
