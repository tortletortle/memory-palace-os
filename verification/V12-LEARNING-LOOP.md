# V1.2 Evidence-Driven Memory Loop

## Goal
Connect V1.1's spatial palace to persistent recall evidence without allowing weak model predictions to mutate the user's scene.

## Data flow

`3D recall task -> POST /api/palaces/:id/recalls -> append-only palaceRecalls -> per-concept trial history -> visual interference matrix -> joint K/V posterior -> review and intervention advice`

## Recall task semantics

- `cued`: show source evidence and object labels; the task measures cue-assisted matching to a spatial anchor.
- `unaided`: show the concept name, hide anchor labels, and ask the learner to locate the anchor; this measures spatial-location recall without visible object labels.
- A wrong click is stored as `confusedWith` because the selected alternative is observable. It is not automatically interpreted as a semantic or visual cause.
- `revealed` records whether the correct target was exposed after the response.

## Stored event

`PalaceRecall` includes `palaceId`, `sessionId`, `conceptId`, `createdAt`, `mode`, `grade`, `revealed`, optional `confusedWith`, optional `responseMs`, and optional self-reported `confidence`.

## Estimation

- Reuses `dualMemory` from V0.4: a joint 8x8 knowledge/visual half-life posterior.
- The unaided estimate uses the knowledge trace; the cued estimate combines knowledge and visual traces with an attenuation derived from the visual interference load.
- The visual interference matrix uses anchor kind, color, position, and explicitly reported cued wrong selections.
- A candidate next-review time is the first 80% posterior-predictive threshold crossing within a 90-day horizon. It is shown only when that mode has at least three observations accepted by the model.
- `eventCount` counts stored events; `independentAttempts` counts time-spaced per-mode records; `modelObservations` counts observations actually used by the joint model. They can differ, especially for immediate post-creation recall.

## Diagnostics and safeguards

1. `insufficient_evidence`: do not personalize yet.
2. `cue_dependent`: cued results are stronger than no-label spatial recall; recommend unaided practice.
3. `knowledge_risk`: both modes show repeated misses; revisit the source before changing the anchor.
4. `repeated_wrong_selection`: the same alternative was selected repeatedly; inspect the pair manually. High visual similarity suggests considering separation/contrast; low similarity suggests checking semantic boundaries first.
5. `review_due`: model threshold has been reached; show a reminder.

Every recommendation has `status: advisory_only`. The report is read-only and never changes coordinates, room topology, source knowledge, or scene history.

## API

- `POST /api/palaces/:id/recalls`
- `GET /api/palaces/:id/learning`

The event API validates that both the tested concept and any selected alternative exist in the target palace. It bounds response time to 600,000 ms, confidence to integer 1–5, and stored events to 20,000 per palace.

## Limitations

- Palace creation time is a proxy for first exposure, not a verified first-view timestamp.
- The model is not calibrated on human longitudinal data.
- A wrong click is observed behavior, not proof of cognitive confusion.
- Response time and confidence are stored but are not model inputs yet.
- No prospective human efficacy experiment or real-browser WebGL E2E was performed in this release.
