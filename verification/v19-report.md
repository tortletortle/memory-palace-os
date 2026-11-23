# V1.9.0 development report — unit-aware simulation

## Change set

- Added explicit `unit(variable)=...` declarations to the evidence-bound simulation compiler.
- Added a bounded SI dimensional algebra for seven base dimensions and selected derived units.
- Added dimensional propagation for arithmetic, integer/constant powers, square root, absolute value, and dimensionless transcendental functions.
- Added fail-closed behavior for mismatched dimensions, unsupported symbols, malformed declarations, duplicate declarations, and declarations for unknown variables.
- Added `not_provided`, `incomplete`, and `verified` analysis states. Partial declarations never produce a verification claim.
- Included unit declarations in the simulation revision identity.
- Exposed verified units in input/output metadata and the simulation UI.
- Preserved the V1.8 numeric-only behavior when no unit declarations are present.

## Verification plan

The new `test/v19-units.test.ts` contains 11 focused cases covering:
1. kinetic energy with kg, m/s, and J;
2. multi-equation kinematics, dimensional consistency of both terms, and a non-negative time bound;
3. electrical resistance, voltage, and power derived units;
4. explicitly annotated dimensional constants;
5. addition/subtraction and trigonometric dimension errors;
6. square-root dimensions and radian handling;
7. variable-exponent restrictions;
8. incomplete and absent declarations;
9. unknown, duplicate, malformed, unsupported, overlong, and trailing-operator unit declarations;
10. revision invalidation when unit declarations change.

**Execution status:** not run. This environment has not executed `npm test` or `npm run typecheck` against the candidate branch. The code is a development candidate, not a verified release.

## Known limitations

- No scale conversion (for example cm to m or min to s), offset units, prefixes, uncertainty propagation, or tolerance arithmetic.
- The unit table is deliberately small and case-sensitive.
- A pure numeric equation with an explicit unit declaration is interpreted as a user-assigned dimensional constant.
- Constraint bounds remain raw numbers interpreted in the variable's declared unit; constraint syntax has no independent unit token.
- Dimensional consistency cannot establish physical truth, causality, model applicability, or correct source transcription.
- AI-assisted equation extraction, causal state transitions, and 3D apparatus binding are not implemented in this change set.

## Next action

Run the full inherited and new test suite plus TypeScript type-checking in a supported Node.js 22.16+ environment. Fix all failures before merging. Then add the causal state-machine contract as a separate reviewed increment.
