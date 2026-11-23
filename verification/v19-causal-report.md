# V1.9 counterfactual comparison — verification report

## Implementation

- Added `src/spatial/counterfactual-compare.ts`.
- Added `POST /api/palaces/:palaceId/state-machines/:conceptId/compare`.
- Enforces paired traces with identical event sequences and exactly one changed numeric input at one step.
- Executes baseline and intervention independently against the same source revision.
- Reports changed input metadata, both traces, first observed difference, and structured branch failures.
- Added a UI panel to the state-machine workspace for selecting a step/input and running the paired comparison.
- The SVG graph overlays baseline and intervention paths; the UI labels both paths and shows each final state or branch error.
- The operation is read-only and does not mutate palace or learning data.

## Local verification

A reconstructed integration worktree based on the locally available V1.8.0 Git bundle, with the parent state-machine increment and this comparison increment applied, was tested in Node.js 22.16.0:

- `npm test`: **179/179 passed** (162 V1.8 baseline + 10 state-machine tests + 7 counterfactual tests).
- TypeScript 5.8.3 `tsc --noEmit` with the environment's preinstalled Node type definitions: passed.
- `node --check public/state-machine.js` and `public/app.js`: passed.
- HTTP integration tests exercised the state-machine and paired-comparison routes against a real local Node HTTP server and verified the store remained unchanged.
- Static DOM contract: all frontend selectors resolve; the compare controls exist; no `innerHTML` or `eval` sink is used.

This was a reconstructed local worktree rather than a fresh clone at the exact GitHub PR head SHA. Therefore it is strong local integration evidence, but exact remote-branch checkout parity and GitHub Actions CI remain unverified. Headless Chromium was attempted against the local demo page but timed out with D-Bus connection and zygote termination errors; no screenshot or interactive browser evidence was produced. Chromium/WebGL visual acceptance therefore remains pending.

## Scientific boundary

This feature is a controlled intervention in an explicitly authored deterministic state machine. It does not establish real-world causal effects, validate the source model, convert units, or prove physical laws. Its value is making model assumptions and consequences inspectable and falsifiable.
