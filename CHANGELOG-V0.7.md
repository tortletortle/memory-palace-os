# Changelog — V0.7.0

## Added
- Cross-domain transfer skill library with 13 versioned, deterministic skill genes.
- Feature-driven activation using ten knowledge-structure features across six subject domains.
- Dependency closure and DAG validation for skill compositions.
- Bounded skill-allele mutation and crossover with version lineage.
- Transfer policy evolution under a fixed candidate-search reservation.
- Explicit combinatorial holdout benchmark with unseen feature pairs.
- Target-domain holdout benchmark where all three target domains are excluded from source training.
- Ablation arm that disables allele mutation, to test whether gene-level mutation contributes measurable value.
- Local HTTP API for skill discovery, genome composition/validation and feature-only skill selection.

## Compatibility
- Existing V0.1–V0.6 files, API routes, types and tests are retained.
- New transfer modules are additive; they do not rewrite old memory records or published scenes.

## Verification
- 100/100 automated tests pass.
- V0.7 transfer-core strict TypeScript check passes (`npm run typecheck:v07-core`).
- Full repository `npm run typecheck` remains unverified because `@types/node` could not be installed in this environment (dependency installation timed out).
- 24 independent synthetic train/holdout runs completed with four strategy arms.
