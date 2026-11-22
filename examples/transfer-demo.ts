import { defaultTransferGenome, buildSkillDependencyGraph } from '../src/cognition/transfer-graph.ts';
import { selectTransferSkills } from '../src/cognition/transfer-engine.ts';
import type { FeatureVector, TransferTask } from '../src/cognition/transfer-types.ts';

const features: FeatureVector = {
  spatial: 0.15, symbolic: 0.92, causal: 0.86, sequential: 0.2,
  hierarchical: 0.68, contrastive: 0.18, analogical: 0.12,
  dynamic: 0.88, retrieval: 0.32, semantic: 0.08
};
const task: TransferTask = {
  id: 'demo-cmos-inverter', domain: 'digital_logic', features, difficulty: 0.4,
  hidden: { skillUtility: {}, synergyPairs: [] }, split: 'target_domain_holdout'
};
const genome = defaultTransferGenome();
const selection = selectTransferSkills(task, genome, 18);
console.log(JSON.stringify({
  title: 'Memory Palace OS V0.7 cross-domain transfer demo',
  genome,
  dependencyGraph: buildSkillDependencyGraph(genome.geneIds),
  selection
}, null, 2));
