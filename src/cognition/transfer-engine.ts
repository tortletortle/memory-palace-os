import { getTransferGene, transferGenes } from './transfer-library.ts';
import { buildSkillDependencyGraph, validateTransferGenome } from './transfer-graph.ts';
import type { FeatureVector, TransferFeature, TransferGenome, TransferMetrics, TransferSelection, TransferTask } from './transfer-types.ts';

const clamp = (x: number, lo = 0, hi = 1) => Math.max(lo, Math.min(hi, x));

export function geneActivation(features: FeatureVector, domain: TransferTask['domain'], geneId: string, genome?: TransferGenome): number {
  const gene = getTransferGene(geneId);
  if (!gene) return 0;
  const allele = genome?.alleles?.find(a => a.geneId === geneId);
  const affinityMap = allele ? { ...gene.featureAffinity, ...allele.featureAffinity } : gene.featureAffinity;
  const transferability = allele?.transferability ?? gene.transferability;
  const entries = Object.entries(affinityMap) as Array<[keyof FeatureVector, number]>;
  const weightSum = entries.reduce((sum, [, weight]) => sum + weight, 0) || 1;
  const affinity = entries.reduce((sum, [feature, weight]) => sum + features[feature] * weight, 0) / weightSum;
  const domainPrior = gene.sourceDomains.includes(domain) ? 0.045 : 0;
  return clamp(affinity * transferability + domainPrior);
}

export function selectTransferSkills(task: TransferTask, genome: TransferGenome, budgetUnits = 18): TransferSelection {
  const validation = validateTransferGenome(genome);
  if (!validation.valid) throw new Error(`Cannot execute invalid transfer genome: ${validation.errors.join('; ')}`);
  if (!Number.isInteger(budgetUnits) || budgetUnits < 1 || budgetUnits > 1000) throw new Error('budgetUnits must be an integer in [1,1000]');
  const root = getTransferGene('atom-chunking')!;
  const optional = genome.geneIds.filter(id => id !== 'atom-chunking').map(geneId => ({
    geneId,
    activation: geneActivation(task.features, task.domain, geneId, genome)
  })).filter(x => x.activation >= genome.activationThreshold).sort((a, b) => b.activation - a.activation || a.geneId.localeCompare(b.geneId));
  const chosen = optional.slice(0, genome.maxActiveGenes);
  const active = new Set<string>(['atom-chunking']);
  let totalCost = root.costUnits;
  const selected: TransferSelection['activeGenes'] = [{ geneId: root.id, activation: 1, costUnits: root.costUnits, reason: 'mandatory knowledge atomization root' }];
  for (const candidate of chosen) {
    const closure = dependencyClosureForCandidate(candidate.geneId, genome.geneIds);
    const missing = closure.filter(id => !active.has(id));
    const incrementalCost = missing.reduce((sum, id) => {
      const base = getTransferGene(id)?.costUnits ?? 0;
      const allele = genome.alleles?.find(a => a.geneId === id);
      return sum + Math.ceil(base * (allele?.costMultiplier ?? 1));
    }, 0);
    if (totalCost + incrementalCost > budgetUnits) continue;
    for (const id of missing) {
      active.add(id);
      const gene = getTransferGene(id)!;
      const activation = id === candidate.geneId ? candidate.activation : geneActivation(task.features, task.domain, id, genome);
      const allele = genome.alleles?.find(a => a.geneId === id);
      selected.push({ geneId: id, activation, costUnits: Math.ceil(gene.costUnits * (allele?.costMultiplier ?? 1)), reason: id === candidate.geneId ? 'feature-affinity transfer match' : `dependency of ${candidate.geneId}` });
      totalCost += gene.costUnits;
    }
  }
  selected.sort((a, b) => validation.graph.topologicalOrder.indexOf(a.geneId) - validation.graph.topologicalOrder.indexOf(b.geneId));
  const expectedFeatureFit = selected.length <= 1 ? 0 : selected.slice(1).reduce((sum, item) => sum + item.activation, 0) / (selected.length - 1);
  return {
    genomeId: genome.id,
    domain: task.domain,
    activeGenes: selected,
    totalCostUnits: totalCost,
    budgetUnits,
    budgetRespected: totalCost <= budgetUnits,
    dependencyGraph: buildSkillDependencyGraph(selected.map(x => x.geneId)),
    expectedFeatureFit
  };
}

function dependencyClosureForCandidate(geneId: string, allowed: readonly string[]): string[] {
  const allowedSet = new Set(allowed);
  const result = new Set<string>();
  const visit = (id: string) => {
    if (result.has(id)) return;
    const gene = getTransferGene(id);
    if (!gene) throw new Error(`Unknown gene ${id}`);
    for (const dependency of gene.requires) {
      if (!allowedSet.has(dependency)) throw new Error(`Genome lacks dependency ${dependency} for ${id}`);
      visit(dependency);
    }
    result.add(id);
  };
  visit(geneId);
  return [...result];
}

function pairKey(a: string, b: string): string { return [a, b].sort().join('+'); }

export function evaluateTransferTask(task: TransferTask, genome: TransferGenome, budgetUnits = 18): {
  reward: number; featureFit: number; combinationCovered: boolean; activeOptionalGenes: number; computeUnits: number; selection: TransferSelection;
} {
  const selection = selectTransferSkills(task, genome, budgetUnits);
  const active = selection.activeGenes.map(x => x.geneId);
  const activeSet = new Set(active);
  let benefit = 0;
  for (const id of active) benefit += task.hidden.skillUtility[id] ?? 0;
  let synergyBenefit = 0;
  for (const pair of genome.synergyPairs) {
    const [a, b] = pair.split('+');
    if (a && b && activeSet.has(a) && activeSet.has(b) && task.hidden.synergyPairs.includes(pair)) synergyBenefit += 0.075;
  }
  benefit += synergyBenefit;
  const allGenes = transferGenes().filter(g => g.id !== 'atom-chunking');
  const oracleValues = allGenes.map(g => ({ id: g.id, value: task.hidden.skillUtility[g.id] ?? 0 })).sort((a, b) => b.value - a.value);
  const oracle = oracleValues.slice(0, 5).reduce((sum, x) => sum + x.value, 0) + task.hidden.synergyPairs.length * 0.075;
  const reward = clamp(benefit / Math.max(0.01, oracle));
  const featureFit = selection.expectedFeatureFit;
  const activeOptionalGenes = active.filter(id => id !== 'atom-chunking').length;
  const combinationCovered = activeOptionalGenes >= 2;
  return { reward, featureFit, combinationCovered, activeOptionalGenes, computeUnits: selection.totalCostUnits, selection };
}

export function scoreTransferGenome(genome: TransferGenome, tasks: TransferTask[], inferenceBudget = 18, seenPairs?: ReadonlySet<string>): TransferMetrics {
  if (!tasks.length) throw new Error('Cannot score transfer genome on an empty task set');
  let utility = 0, fit = 0, combination = 0, novelCombination = 0, active = 0, cost = 0;
  for (const task of tasks) {
    const result = evaluateTransferTask(task, genome, inferenceBudget);
    utility += result.reward;
    fit += result.featureFit;
    combination += result.combinationCovered ? 1 : 0;
    if (seenPairs && result.activeOptionalGenes >= 2) {
      const ids = result.selection.activeGenes.map(x => x.geneId).filter(id => id !== 'atom-chunking');
      const pairs: string[] = [];
      for (let i = 0; i < ids.length; i++) for (let j = i + 1; j < ids.length; j++) pairs.push([ids[i]!, ids[j]!].sort().join('+'));
      if (pairs.some(pair => !seenPairs.has(pair))) novelCombination += 1;
    }
    active += result.activeOptionalGenes;
    cost += result.computeUnits;
  }
  const n = tasks.length;
  return {
    normalizedUtility: utility / n,
    featureFit: fit / n,
    combinationCoverage: combination / n,
    novelCombinationCoverage: seenPairs ? novelCombination / n : 0,
    meanActiveOptionalGenes: active / n,
    meanComputeUnits: cost / n,
    budgetUtilization: cost / (n * inferenceBudget),
    episodes: n
  };
}

export function transferFitness(metrics: TransferMetrics): number {
  return 0.72 * metrics.normalizedUtility + 0.12 * metrics.featureFit + 0.10 * metrics.combinationCoverage + 0.06 * (1 - metrics.budgetUtilization);
}
