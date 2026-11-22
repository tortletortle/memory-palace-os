import { canonicalGenome, topologicalCapabilities } from '../src/cognition/graph.ts';
import { runCognition } from '../src/cognition/runtime.ts';
import type { CognitionInput } from '../src/cognition/types.ts';

const input: CognitionInput = {
  nowDay: 18,
  targetId: 'poisson-formula-001',
  sourceRevision: 'knowledge-rev-3',
  estimatedReplacementCost: 0.18,
  observations: Array.from({ length: 12 }, (_, i) => ({
    id: `review-${i + 1}`,
    day: i + 1,
    mode: i % 2 === 0 ? 'unaided' as const : 'cued' as const,
    outcome: i % 3 === 0 ? 'correct' as const : 'missed' as const,
    cause: i % 3 === 0 ? 'none' as const : 'semantic_confusion' as const,
    visualSimilarity: 0.16,
    semanticSimilarity: i % 3 === 0 ? 0.12 : 0.88
  }))
};
const genome = canonicalGenome();
const result = runCognition(input, genome, 40);
console.log(JSON.stringify({
  capabilities: topologicalCapabilities(),
  genome: genome.id,
  budget: result.budget,
  trace: result.trace,
  state: result.state
}, null, 2));
