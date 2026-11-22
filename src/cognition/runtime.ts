import { getGene } from './registry.ts';
import { validateGenome } from './graph.ts';
import type { CognitionInput, CognitionRunResult, CognitionState, Genome } from './types.ts';

export function validateCognitionInput(input: CognitionInput): string[] {
  const errors: string[] = [];
  if (!input || typeof input !== 'object' || Array.isArray(input)) return ['input must be an object'];
  if (!Number.isFinite(input.nowDay) || input.nowDay < 0) errors.push('nowDay must be non-negative');
  if (typeof input.targetId !== 'string' || !input.targetId || input.targetId.length > 160) errors.push('targetId must be 1..160 characters');
  if (typeof input.sourceRevision !== 'string' || !input.sourceRevision || input.sourceRevision.length > 160) errors.push('sourceRevision must be 1..160 characters');
  if (!Array.isArray(input.observations) || input.observations.length > 2000) errors.push('observations must contain at most 2000 items');
  const observations = Array.isArray(input.observations) ? input.observations : [];
  const observationIds = new Set<string>();
  for (const [i, raw] of observations.entries()) {
    if (!raw || typeof raw !== 'object' || Array.isArray(raw)) { errors.push(`invalid observation ${i}`); continue; }
    const o = raw as CognitionInput['observations'][number];
    if (typeof o.id !== 'string' || !o.id || !Number.isFinite(o.day) || o.day < 0 || o.day > input.nowDay || !['cued', 'unaided'].includes(o.mode) || !['correct', 'missed', 'uncertain'].includes(o.outcome)) { errors.push(`invalid observation ${i}`); continue; }
    if (observationIds.has(o.id)) errors.push(`duplicate observation id at ${i}`);
    observationIds.add(o.id);
    if (o.cause !== undefined && !['knowledge_gap', 'forgetting', 'visual_confusion', 'semantic_confusion', 'none', 'unknown'].includes(o.cause)) errors.push(`invalid cause at ${i}`);
    if (o.visualSimilarity !== undefined && (!Number.isFinite(o.visualSimilarity) || o.visualSimilarity < 0 || o.visualSimilarity > 1)) errors.push(`invalid visualSimilarity at ${i}`);
    if (o.semanticSimilarity !== undefined && (!Number.isFinite(o.semanticSimilarity) || o.semanticSimilarity < 0 || o.semanticSimilarity > 1)) errors.push(`invalid semanticSimilarity at ${i}`);
    if (o.cueHelped !== undefined && typeof o.cueHelped !== 'boolean') errors.push(`invalid cueHelped at ${i}`);
  }
  if (input.estimatedReplacementCost !== undefined && (!Number.isFinite(input.estimatedReplacementCost) || input.estimatedReplacementCost < 0 || input.estimatedReplacementCost > 1)) errors.push('estimatedReplacementCost must be in [0,1]');
  return errors;
}

export function runCognition(input: CognitionInput, genome: Genome, budgetUnits = 32): CognitionRunResult {
  const inputErrors = validateCognitionInput(input);
  if (inputErrors.length) throw new Error(`Invalid cognition input: ${inputErrors.join('; ')}`);
  if (!Number.isInteger(budgetUnits) || budgetUnits < 1 || budgetUnits > 10000) throw new Error('budgetUnits must be an integer in [1,10000]');
  const validation = validateGenome(genome);
  if (!validation.valid) return { genomeId: genome.id, budget: { allocated: budgetUnits, consumed: 0, remaining: budgetUnits, utilization: 0 }, trace: [], state: {}, validGenome: false };
  const state: CognitionState = { input };
  const nodes = new Map(genome.nodes.map(n => [n.nodeId, n]));
  let consumed = 0;
  const trace: CognitionRunResult['trace'] = [];
  for (const nodeId of validation.order) {
    const node = nodes.get(nodeId)!;
    const registered = getGene(node.geneId);
    if (!registered) { trace.push({ nodeId, geneId: node.geneId, status: 'skipped_dependency', costUnits: 0, detail: 'gene_not_registered' }); continue; }
    const cost = Math.ceil(registered.spec.cost.base + registered.spec.cost.perObservation * input.observations.length);
    if (consumed + cost > budgetUnits) {
      trace.push({ nodeId, geneId: node.geneId, status: 'skipped_budget', costUnits: cost, detail: 'budget_exhausted' });
      continue;
    }
    const requiredSatisfied = registered.spec.requires.every(cap => {
      if (cap === 'raw_observations') return true;
      if (cap === 'normalized_evidence') return !!state.normalized;
      if (cap === 'cause_diagnosis') return !!state.diagnosis;
      if (cap === 'memory_forecast') return !!state.forecast;
      if (cap === 'interference_profile') return !!state.interference;
      if (cap === 'intervention_decision') return !!state.decision;
      if (cap === 'intervention_proposal') return !!state.proposal;
      return false;
    });
    if (!requiredSatisfied) { trace.push({ nodeId, geneId: node.geneId, status: 'skipped_dependency', costUnits: cost, detail: 'runtime_dependency_missing' }); continue; }
    registered.handler(state, node.params);
    consumed += cost;
    trace.push({ nodeId, geneId: node.geneId, status: 'executed', costUnits: cost });
  }
  const remaining = budgetUnits - consumed;
  const { input: _input, normalized: _normalized, ...publicState } = state;
  return { genomeId: genome.id, budget: { allocated: budgetUnits, consumed, remaining, utilization: consumed / budgetUnits }, trace, state: publicState, validGenome: true };
}
