import { getGene, skillGeneLibrary } from './registry.ts';
import type { Capability, GeneInstance, Genome, SkillGene } from './types.ts';

export const capabilityDependencies: ReadonlyArray<{ capability: Capability; requires: Capability[] }> = [
  { capability: 'raw_observations', requires: [] },
  { capability: 'normalized_evidence', requires: ['raw_observations'] },
  { capability: 'cause_diagnosis', requires: ['normalized_evidence'] },
  { capability: 'memory_forecast', requires: ['normalized_evidence'] },
  { capability: 'interference_profile', requires: ['normalized_evidence', 'cause_diagnosis'] },
  { capability: 'intervention_decision', requires: ['cause_diagnosis', 'memory_forecast', 'interference_profile'] },
  { capability: 'intervention_proposal', requires: ['intervention_decision'] },
  { capability: 'validated_proposal', requires: ['intervention_proposal'] },
  { capability: 'review_schedule', requires: ['memory_forecast'] }
];

export function topologicalCapabilities(): Capability[] {
  const pending = new Map(capabilityDependencies.map(x => [x.capability, new Set(x.requires)]));
  const ordered: Capability[] = [];
  while (pending.size) {
    const ready = [...pending].filter(([, deps]) => [...deps].every(d => ordered.includes(d))).map(([cap]) => cap);
    if (!ready.length) throw new Error('Capability dependency graph contains a cycle or missing node');
    for (const cap of ready) { ordered.push(cap); pending.delete(cap); }
  }
  return ordered;
}

export function buildGenome(id: string, geneIds: string[], generation = 0, params: Record<string, Record<string, number | string | boolean>> = {}): Genome {
  const genes = geneIds.map(geneId => {
    const gene = getGene(geneId);
    if (!gene) throw new Error(`Unknown skill gene: ${geneId}`);
    return gene.spec;
  });
  const roles = genes.map(g => g.role);
  if (new Set(roles).size !== roles.length) throw new Error('Genome may contain at most one gene per role');
  const nodes: GeneInstance[] = genes.map(g => ({ nodeId: g.role, geneId: g.id, enabled: true, params: params[g.id] ?? {} }));
  const edges: Genome['edges'] = [];
  const providerByCapability = new Map<Capability, string>();
  for (const gene of genes) for (const capability of gene.provides) providerByCapability.set(capability, gene.role);
  for (const gene of genes) {
    for (const required of gene.requires) {
      if (required === 'raw_observations') continue;
      const provider = providerByCapability.get(required);
      if (!provider) continue;
      if (provider !== gene.role) edges.push({ from: provider, to: gene.role });
    }
  }
  const uniqueEdges = [...new Map(edges.map(e => [`${e.from}->${e.to}`, e])).values()];
  const genome: Genome = { id, generation, nodes, edges: uniqueEdges };
  const validation = validateGenome(genome);
  if (!validation.valid) throw new Error(`Invalid genome: ${validation.errors.join('; ')}`);
  return genome;
}

export function validateGenome(genome: Genome): { valid: boolean; errors: string[]; order: string[]; capabilities: Capability[] } {
  const errors: string[] = [];
  if (!genome || typeof genome !== 'object' || typeof genome.id !== 'string' || !genome.id || genome.id.length > 120 || !Number.isInteger(genome.generation) || genome.generation < 0 || !Array.isArray(genome.nodes) || genome.nodes.length > 16 || genome.nodes.some(n => !n || typeof n !== 'object') || !Array.isArray(genome.edges) || genome.edges.length > 64 || genome.edges.some(e => !e || typeof e !== 'object')) return { valid: false, errors: ['Malformed or oversized genome'], order: [], capabilities: [] };
  const byId = new Map(genome.nodes.map(n => [n.nodeId, n]));
  if (byId.size !== genome.nodes.length) errors.push('Duplicate nodeId');
  const roles = new Set<string>();
  for (const node of genome.nodes) {
    if (typeof node.nodeId !== 'string' || !node.nodeId || typeof node.geneId !== 'string' || typeof node.enabled !== 'boolean') { errors.push('Malformed genome node'); continue; }
    const gene = getGene(node.geneId);
    if (!gene) { errors.push(`Unknown gene ${node.geneId}`); continue; }
    if (roles.has(gene.spec.role)) errors.push(`Duplicate role ${gene.spec.role}`);
    roles.add(gene.spec.role);
    if (!node.enabled) errors.push(`Disabled gene ${node.nodeId} is not executable in V0.6`);
    if (!node.params || typeof node.params !== 'object' || Array.isArray(node.params)) errors.push(`Invalid params for ${node.nodeId}`);
    else {
      const allowed = gene.spec.role === 'diagnose' ? ['confidenceThreshold', 'minEvidence'] : gene.spec.role === 'decide' ? ['utilityThreshold'] : [];
      for (const key of Object.keys(node.params)) if (!allowed.includes(key)) errors.push(`Unsupported parameter ${key} for ${node.nodeId}`);
      for (const [key, value] of Object.entries(node.params)) {
        if (typeof value !== 'number' || !Number.isFinite(value)) errors.push(`Parameter ${key} for ${node.nodeId} must be finite number`);
        else if (key === 'confidenceThreshold' && (value < 0.2 || value > 0.9)) errors.push(`confidenceThreshold out of range at ${node.nodeId}`);
        else if (key === 'utilityThreshold' && (value < 0 || value > 1)) errors.push(`utilityThreshold out of range at ${node.nodeId}`);
        else if (key === 'minEvidence' && (!Number.isInteger(value) || value < 1 || value > 100)) errors.push(`minEvidence out of range at ${node.nodeId}`);
      }
    }
  }
  const adjacency = new Map<string, string[]>();
  const indegree = new Map<string, number>(genome.nodes.map(n => [n.nodeId, 0]));
  const edgeSet = new Set<string>();
  for (const edge of genome.edges) {
    if (typeof edge.from !== 'string' || typeof edge.to !== 'string') { errors.push('Malformed genome edge'); continue; }
    if (!byId.has(edge.from) || !byId.has(edge.to)) { errors.push(`Dangling edge ${edge.from}->${edge.to}`); continue; }
    if (edge.from === edge.to) { errors.push(`Self cycle at ${edge.from}`); continue; }
    const key = `${edge.from}->${edge.to}`;
    if (edgeSet.has(key)) { errors.push(`Duplicate edge ${key}`); continue; }
    edgeSet.add(key);
    adjacency.set(edge.from, [...(adjacency.get(edge.from) ?? []), edge.to]);
    indegree.set(edge.to, (indegree.get(edge.to) ?? 0) + 1);
  }
  const queue = [...indegree].filter(([, d]) => d === 0).map(([id]) => id);
  const order: string[] = [];
  while (queue.length) {
    const id = queue.shift()!;
    order.push(id);
    for (const next of adjacency.get(id) ?? []) {
      const d = (indegree.get(next) ?? 1) - 1;
      indegree.set(next, d);
      if (d === 0) queue.push(next);
    }
  }
  if (order.length !== genome.nodes.length) errors.push('Genome composition graph contains a cycle');
  const available = new Map<string, Set<Capability>>();
  for (const id of order) {
    const node = byId.get(id)!;
    const gene = getGene(node.geneId)?.spec;
    if (!gene) continue;
    const caps = new Set<Capability>(['raw_observations']);
    for (const edge of genome.edges.filter(e => e.to === id)) for (const c of available.get(edge.from) ?? []) caps.add(c);
    const missing = gene.requires.filter(c => !caps.has(c));
    if (missing.length) errors.push(`${id} missing upstream capabilities: ${missing.join(', ')}`);
    for (const c of gene.provides) caps.add(c);
    available.set(id, caps);
  }
  const allCapabilities = new Set<Capability>(['raw_observations']);
  for (const caps of available.values()) for (const c of caps) allCapabilities.add(c);
  return { valid: errors.length === 0, errors, order, capabilities: [...allCapabilities] };
}

export function canonicalGenome(): Genome {
  return buildGenome('static-modular-v06', [
    'evidence-normalizer', 'cause-diagnosis-conservative', 'memory-forecast-bma',
    'interference-separated', 'decision-risk-sensitive', 'local-intervention',
    'proposal-verifier', 'review-scheduler'
  ]);
}
export function legacyGenome(): Genome {
  return buildGenome('legacy-v051-baseline', [
    'evidence-normalizer', 'cause-diagnosis-balanced', 'memory-forecast-fast',
    'interference-light', 'decision-conservative', 'local-intervention',
    'proposal-verifier', 'review-scheduler'
  ]);
}
export function geneSpec(geneId: string): SkillGene | undefined { return skillGeneLibrary.find(g => g.id === geneId); }
