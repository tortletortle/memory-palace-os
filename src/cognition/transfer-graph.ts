import { getTransferGene } from './transfer-library.ts';
import type { SkillDependencyGraph, TransferGeneAllele, TransferGenome, TransferFeature } from './transfer-types.ts';

export function dependencyClosure(geneIds: readonly string[]): string[] {
  const result = new Set<string>();
  const visiting = new Set<string>();
  const visit = (id: string) => {
    const gene = getTransferGene(id);
    if (!gene) throw new Error(`Unknown transfer skill gene: ${id}`);
    if (visiting.has(id)) throw new Error(`Skill dependency cycle at ${id}`);
    if (result.has(id)) return;
    visiting.add(id);
    for (const dependency of gene.requires) visit(dependency);
    visiting.delete(id);
    result.add(id);
  };
  for (const id of geneIds) visit(id);
  return [...result];
}

export function buildSkillDependencyGraph(geneIds: readonly string[]): SkillDependencyGraph {
  const errors: string[] = [];
  const nodes = [...new Set(geneIds)];
  if (nodes.length !== geneIds.length) errors.push('duplicate_gene_id');
  for (const id of nodes) if (!getTransferGene(id)) errors.push(`unknown_gene:${id}`);
  const nodeSet = new Set(nodes);
  const edges: SkillDependencyGraph['edges'] = [];
  const capabilities = new Set<string>();
  for (const id of nodes) {
    const gene = getTransferGene(id);
    if (!gene) continue;
    for (const dependency of gene.requires) {
      if (!nodeSet.has(dependency)) errors.push(`missing_dependency:${id}:${dependency}`);
      else edges.push({ from: dependency, to: id });
    }
    for (const capability of gene.provides) capabilities.add(capability);
  }
  const indegree = new Map(nodes.map(id => [id, 0]));
  const adjacency = new Map<string, string[]>();
  for (const edge of edges) {
    adjacency.set(edge.from, [...(adjacency.get(edge.from) ?? []), edge.to]);
    indegree.set(edge.to, (indegree.get(edge.to) ?? 0) + 1);
  }
  const queue = nodes.filter(id => indegree.get(id) === 0).sort();
  const order: string[] = [];
  while (queue.length) {
    const id = queue.shift()!;
    order.push(id);
    for (const next of adjacency.get(id) ?? []) {
      const d = (indegree.get(next) ?? 1) - 1;
      indegree.set(next, d);
      if (d === 0) { queue.push(next); queue.sort(); }
    }
  }
  if (order.length !== nodes.length) errors.push('dependency_cycle');
  return { nodes, edges, topologicalOrder: order, capabilities: [...capabilities].sort(), valid: errors.length === 0, errors };
}

export function createTransferGenome(
  id: string,
  geneIds: readonly string[],
  options: { generation?: number; activationThreshold?: number; maxActiveGenes?: number; synergyPairs?: string[]; alleles?: TransferGeneAllele[]; parentIds?: string[]; mutation?: string } = {}
): TransferGenome {
  const closed = dependencyClosure(['atom-chunking', ...geneIds]);
  const genome: TransferGenome = {
    id,
    generation: options.generation ?? 0,
    geneIds: closed,
    activationThreshold: options.activationThreshold ?? 0.24,
    maxActiveGenes: options.maxActiveGenes ?? 5,
    synergyPairs: [...new Set(options.synergyPairs ?? [])].sort(),
    ...(options.alleles?.length ? { alleles: options.alleles.map(a => ({ ...a, featureAffinity: { ...a.featureAffinity } })) } : {}),
    metadata: {
      ...(options.parentIds ? { parentIds: options.parentIds } : {}),
      ...(options.mutation ? { mutation: options.mutation } : {})
    }
  };
  const validation = validateTransferGenome(genome);
  if (!validation.valid) throw new Error(`Invalid transfer genome: ${validation.errors.join('; ')}`);
  return genome;
}

export function validateTransferGenome(genome: TransferGenome): { valid: boolean; errors: string[]; graph: SkillDependencyGraph } {
  const errors: string[] = [];
  if (!genome || typeof genome !== 'object' || typeof genome.id !== 'string' || !genome.id || genome.id.length > 120 ||
      !Number.isInteger(genome.generation) || genome.generation < 0 || !Array.isArray(genome.geneIds) || genome.geneIds.length > 20 ||
      !Array.isArray(genome.synergyPairs) || genome.synergyPairs.length > 30 ||
      !Number.isFinite(genome.activationThreshold) || genome.activationThreshold < 0 || genome.activationThreshold > 1 ||
      !Number.isInteger(genome.maxActiveGenes) || genome.maxActiveGenes < 1 || genome.maxActiveGenes > 8) {
    const graph = buildSkillDependencyGraph([]);
    return { valid: false, errors: ['malformed_or_oversized_genome'], graph };
  }
  if (!genome.geneIds.includes('atom-chunking')) errors.push('root_gene_missing:atom-chunking');
  const graph = buildSkillDependencyGraph(genome.geneIds);
  errors.push(...graph.errors);
  const alleleIds = new Set<string>();
  for (const allele of genome.alleles ?? []) {
    const base = getTransferGene(allele.geneId);
    if (!base || !genome.geneIds.includes(allele.geneId)) errors.push(`invalid_allele_gene:${allele.geneId}`);
    if (alleleIds.has(allele.geneId)) errors.push(`duplicate_allele:${allele.geneId}`);
    alleleIds.add(allele.geneId);
    if (!Number.isInteger(allele.version) || allele.version < 1 || !Number.isInteger(allele.parentVersion) || allele.parentVersion < 1) errors.push(`invalid_allele_version:${allele.geneId}`);
    if (!Number.isFinite(allele.transferability) || allele.transferability < 0.4 || allele.transferability > 1) errors.push(`invalid_allele_transferability:${allele.geneId}`);
    if (!Number.isFinite(allele.costMultiplier) || allele.costMultiplier < 0.75 || allele.costMultiplier > 1.5) errors.push(`invalid_allele_cost:${allele.geneId}`);
    for (const [feature, value] of Object.entries(allele.featureAffinity)) {
      if (!['spatial','symbolic','causal','sequential','hierarchical','contrastive','analogical','dynamic','retrieval','semantic'].includes(feature) || !Number.isFinite(value) || value < 0 || value > 1.2) errors.push(`invalid_allele_affinity:${allele.geneId}:${feature}`);
    }
  }
  for (const pair of genome.synergyPairs) {
    const parts = pair.split('+');
    if (parts.length !== 2 || parts[0] === parts[1] || !parts.every(id => genome.geneIds.includes(id))) errors.push(`invalid_synergy_pair:${pair}`);
  }
  if (new Set(genome.synergyPairs).size !== genome.synergyPairs.length) errors.push('duplicate_synergy_pair');
  return { valid: errors.length === 0, errors, graph };
}

export function defaultTransferGenome(): TransferGenome {
  return createTransferGenome('default-transfer-v07', [
    'spatial-route', 'symbol-anchor', 'causal-chain', 'contrastive-pair',
    'timeline-sequence', 'hierarchy-chunk', 'dual-code', 'analogy-bridge',
    'mechanism-simulation', 'retrieval-cue', 'interleaved-retrieval', 'semantic-boundary'
  ], { activationThreshold: 0.25, maxActiveGenes: 6, synergyPairs: [
    'causal-chain+timeline-sequence', 'spatial-route+retrieval-cue',
    'symbol-anchor+contrastive-pair', 'analogy-bridge+dual-code',
    'causal-chain+mechanism-simulation'
  ] });
}
