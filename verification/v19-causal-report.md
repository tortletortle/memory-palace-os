# V1.9 causal state-machine increment — verification report

## Implementation

- Added `src/spatial/causal-state-machine.ts`.
- Added GET compile and POST trace-run endpoints under each palace knowledge anchor.
- Added ten regression tests covering deterministic traces, guard thresholds, invariants, disjoint and overlapping guards, input validation, unknown events, malformed models, stale revisions, trace limits, HTTP integration, and the static UI contract.
- Execution is stateless and does not mutate palace learning data.
- Added a dedicated `state-machine.html` workspace with state pills, an SVG transition graph, transition rows, invariant display, event-sequence builder, and trace output; successful transitions are highlighted. Added navigation from the palace and selected-anchor panel.
- No AI-generated state machine or arbitrary code is executed.

## Local verification

Tested in Node.js 22.16.0 against the locally available V1.8.0 source snapshot (Git bundle commit `9a3caa982bd5b7ab46a0aa471094d9c301f7151c`):

- `npm test`: **172/172 passed** (162 inherited tests + 10 state-machine tests).
- `npm run typecheck -- --typeRoots /opt/nvm/versions/node/v22.16.0/lib/node_modules/ts-node/node_modules/@types`: passed with TypeScript 5.8.3 and the environment's preinstalled Node type definitions.
- `node --check public/simulation.js`, `public/app.js`, and `public/state-machine.js`: passed.
- The locally tested modified source, server, test, and UI files were checked with `git hash-object` against their exact GitHub branch blob SHAs.
- HTTP integration verifies that `state-machine.html`, `state-machine.js`, and `state-machine.css` are served successfully. Static DOM checks confirm every JavaScript selector has a matching element, the palace entry links exist, and the UI does not use `innerHTML` or `eval`.
- The ten new state-machine tests include a real local HTTP server integration check and verify that execution does not mutate palace storage.

The npm registry was unreachable from this environment (DNS `EAI_AGAIN`), so project devDependencies were not freshly installed. The type check used the preinstalled TypeScript and Node type definitions. The local snapshot is the V1.8.0 bundle, not a fresh clone of the current GitHub main commit; exact current-main regression parity therefore remains a separate verification item.

## GitHub Actions status

A CI workflow was briefly added and triggered, but the job ended before any runner steps started; GitHub returned no job steps or retrievable logs. The workflow was removed rather than leaving a permanently failing, uninformative check. This is not evidence of a code failure, but it also is not a successful remote CI result.

## Not yet verified

- Chromium headless could not initialize in this environment (D-Bus/zygote errors and timeout); no browser screenshot or interactive visual acceptance is claimed.
- Responsive layout and real user interaction still need manual browser review.
- No continuous-time dynamics, differential equations, numeric state assignments, or stochastic transitions.

## Known limitations

- Discrete finite-state transitions only.
- Unit labels are metadata; the module does not convert units or prove dimensional consistency.
- Guard and invariant grammar is a single variable-to-constant comparison; no boolean conjunction, disjunction, or compound expression.
- Multiple simultaneously eligible transitions are rejected rather than prioritized.
- The API is stateless; it returns a trace but does not persist sessions or learning evidence.
- A state transition is an explicit intervention rule, not proof that the event is a real-world cause.
