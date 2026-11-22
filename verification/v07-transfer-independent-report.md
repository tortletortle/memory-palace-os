# Memory Palace OS V0.7 Independent Transfer Experiment

Generated: 2026-11-18T12:59:30.495Z

## Protocol
- Independent runs: 24
- Source training domains: probability, programming, history
- Target-domain holdout: digital_logic, language, biology
- Composition holdout feature pairs: causal+symbolic; analogical+retrieval; hierarchical+spatial; contrastive+sequential
- Per run: 72 source training tasks, 72 target-domain holdout tasks, 48 composition holdout tasks.
- Search: 40 candidates per strategy, 18 inference units per task, identical reserved compute budget; includes an allele-mutation ablation arm.
- The policy sees public features and domain only. Hidden per-skill utility and synergy truth are evaluator-only.
- Novel combination coverage counts active skill pairs that did not co-occur for that genome on source training tasks.

## Aggregate held-out results (mean across independent runs)

| Strategy | Target utility ↑ | Composition utility ↑ | Combined utility ↑ | Novel combo coverage ↑ | Mean compute units | Candidates with gene variants | Selected variants |
|---|---:|---:|---:|---:|---:|---:|---:|
| fixed-heuristic | 0.7757 | 0.9570 | 0.8482 | 0.4042 | 9.69 | 0.0 | 0.00 |
| static-modular | 0.3883 | 0.7008 | 0.5133 | 0.1972 | 4.76 | 0.0 | 0.00 |
| evolved-modular | 0.7966 | 0.9649 | 0.8639 | 0.5250 | 10.25 | 8.3 | 0.17 |
| evolved-no-allele | 0.8075 | 0.9649 | 0.8705 | 0.5500 | 10.39 | 0.0 | 0.00 |

## Paired run-level comparisons against fixed heuristic

### static-modular minus fixed-heuristic

- Target-domain utility difference: -0.3875 (95% normal-approximation CI -0.3886 to -0.3863; n=24)
- Composition utility difference: -0.2561 (95% normal-approximation CI -0.2582 to -0.2541; n=24)
- Combined utility difference: -0.3349 (95% normal-approximation CI -0.3363 to -0.3335; n=24)

### evolved-modular minus fixed-heuristic

- Target-domain utility difference: 0.0209 (95% normal-approximation CI 0.0034 to 0.0383; n=24)
- Composition utility difference: 0.0079 (95% normal-approximation CI 0.0026 to 0.0131; n=24)
- Combined utility difference: 0.0157 (95% normal-approximation CI 0.0035 to 0.0279; n=24)

### evolved-no-allele minus fixed-heuristic

- Target-domain utility difference: 0.0318 (95% normal-approximation CI 0.0124 to 0.0511; n=24)
- Composition utility difference: 0.0079 (95% normal-approximation CI 0.0020 to 0.0137; n=24)
- Combined utility difference: 0.0222 (95% normal-approximation CI 0.0084 to 0.0360; n=24)

## Target-domain breakdown

| Strategy | Digital logic | Language | Biology |
|---|---:|---:|---:|
| fixed-heuristic | 0.9207 | 0.4639 | 0.9426 |
| static-modular | 0.3597 | 0.2722 | 0.5329 |
| evolved-modular | 0.9416 | 0.5024 | 0.9458 |
| evolved-no-allele | 0.9476 | 0.5235 | 0.9514 |

## Composition-holdout breakdown

| Strategy | causal+symbolic | analogical+retrieval | hierarchical+spatial | contrastive+sequential |
|---|---:|---:|---:|---:|
| fixed-heuristic | 0.9682 | 0.9136 | 1.0000 | 0.9462 |
| static-modular | 0.5720 | 0.6624 | 0.9500 | 0.6191 |
| evolved-modular | 0.9740 | 0.9275 | 1.0000 | 0.9580 |
| evolved-no-allele | 0.9753 | 0.9257 | 1.0000 | 0.9585 |

## Gene-allele mutation ablation

Evolved-with-alleles minus evolved-without-alleles, combined utility: -0.0065 (95% normal-approximation CI -0.0198 to 0.0067; n=24).
Target-domain difference: -0.0109; composition difference: -0.0000.
Negative values mean the allele-enabled search scored lower. A gene-level mutation mechanism being implemented does not imply that mutated alleles are useful; this ablation is retained to expose that distinction.

## Interpretation

The experiment is a synthetic engineering benchmark. A gain supports only the claim that the implemented search generalizes within this benchmark generator. It does not establish improved human memory, educational effectiveness, or transfer across real courses.
The feature-affinity library is hand-designed, so a strong result may partly reflect the benchmark sharing assumptions with the library. A genuinely independent next test should use externally authored tasks and blinded human labels.
