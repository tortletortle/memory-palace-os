# V1.9 causal state-machine increment — verification report

## Implementation

- Added `src/spatial/causal-state-machine.ts`.
- Added GET compile and POST trace-run endpoints under each palace knowledge anchor.
- Added nine regression tests covering deterministic traces, guard thresholds, invariants, disjoint and overlapping guards, input validation, unknown events, malformed models, stale revisions, trace limits, and HTTP integration.
- Execution is stateless and does not mutate palace learning data.
- No AI-generated state machine or arbitrary code is executed.

## Verification status

Pending automated CI on the candidate branch. No test pass, TypeScript pass, browser, or WebGL claim is made until the workflow reports its actual result.

## Known limitations

- Discrete finite-state transitions only; no continuous-time dynamics, differential equations, numeric state updates, or probabilistic transitions.
- Unit labels are metadata; the module does not convert units or prove dimensional consistency.
- Guard and invariant grammar is a single variable-to-constant comparison; no boolean conjunction, disjunction, or compound expression.
- Multiple simultaneously eligible transitions are rejected rather than prioritized.
- The API is stateless; it returns a trace but does not persist sessions or learning evidence.
- No dedicated interactive front-end has been added in this increment.
