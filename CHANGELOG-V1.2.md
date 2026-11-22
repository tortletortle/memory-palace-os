# Changelog V1.2.0

- Added persistent per-concept palace recall events in `palaceRecalls`.
- Added cued matching and no-label spatial-location recall modes.
- Added `POST /api/palaces/:id/recalls` with strict concept, grade, mode, confusion, response-time and confidence validation.
- Added `GET /api/palaces/:id/learning` with separate cued/unaided memory estimates, visual-interference diagnostics, review timing and advisory recommendations.
- Reused the joint knowledge/visual half-life posterior and interference matrix; kept all scene changes advisory-only.
- Added a learning summary to the workspace and persisted recall results from the 3D interaction.
- Preserved legacy state compatibility and all V1.1 architecture behavior.
