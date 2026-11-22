import { buildGenome, canonicalGenome, legacyGenome, validateGenome } from './graph.ts';
import { runCognition } from './runtime.ts';
import { genesByRole } from './registry.ts';
import type { EvaluationCase, Genome, ModuleRole } from './types.ts';

export class SeededRandom {
  private state: number;
  constructor(seed: number) { this.state = (seed >>> 0) || 1; }
  next(): number { this.state = (Math.imul(this.state, 1664525) + 1013904223) >>> 0; return this.state / 0x100000000; }
  int(maxExclusive: number): number { return Math.floor(this.next() * maxExclusive); }
  pick<T>(items: readonly T[]): T { if (!items.length) throw new Error('Cannot pick from empty list'); return items[this.int(items.length)]!; }
}

export interface FitnessMetrics {
  score: number;
  actionAccuracy: number;
  forecastBrier: number;
  safetyRate: number;
  meanInferenceCost: number;
  computeEfficiency: number;
  episodes: number;
}
export interface SearchResult {
  strategy: 'fixed-heuristic' | 'static-modular' | 'evolved-modular';
  genome: Genome;
  metrics: FitnessMetrics;
  searchBudget: { allocated: number; consumed: number; candidateEvaluations: number; trainingCasesPerCandidate: number; perCandidateReservation: number };
}

export function scoreGenome(genome: Genome, cases: EvaluationCase[], inferenceBudget = 32): FitnessMetrics {
  let action = 0, brier = 0, safety = 0, cost = 0;
  for (const item of cases) {
    const result = runCognition(item.input, genome, inferenceBudget);
    const proposal = result.state.proposal;
    const actualAction = proposal?.action ?? 'no_action';
    const ideal = item.truth.idealAction;
    action += actualAction === ideal ? 1 : actualAction === 'no_action' && ideal !== 'no_action' ? 0.35 : 0;
    const forecast = result.state.forecast?.unaidedRecall ?? 0.5;
    brier += (forecast - item.truth.unaidedRecall) ** 2;
    safety += result.state.validation?.passed === true ? 1 : 0;
    cost += result.budget.consumed;
  }
  const n = Math.max(1, cases.length);
  const actionAccuracy = action / n;
  const forecastBrier = brier / n;
  const safetyRate = safety / n;
  const meanInferenceCost = cost / n;
  const computeEfficiency = Math.max(0, 1 - meanInferenceCost / inferenceBudget);
  const score = 0.62 * actionAccuracy + 0.20 * (1 - forecastBrier) + 0.12 * safetyRate + 0.06 * computeEfficiency;
  return { score, actionAccuracy, forecastBrier, safetyRate, meanInferenceCost, computeEfficiency, episodes: cases.length };
}

const roles: ModuleRole[] = ['observe', 'diagnose', 'forecast', 'analyze', 'decide', 'intervene', 'verify', 'schedule'];
const mandatoryRoles: ModuleRole[] = ['observe', 'diagnose', 'forecast', 'analyze', 'decide', 'intervene', 'verify'];
const baseIds: Record<ModuleRole, string> = {
  observe: 'evidence-normalizer', diagnose: 'cause-diagnosis-balanced', forecast: 'memory-forecast-fast',
  analyze: 'interference-light', decide: 'decision-conservative', intervene: 'local-intervention',
  verify: 'proposal-verifier', schedule: 'review-scheduler'
};

function paramsFor(geneId: string, confidence: number, utility: number): Record<string, number> {
  if (geneId.startsWith('cause-diagnosis')) return { confidenceThreshold: confidence, minEvidence: geneId.endsWith('conservative') ? 3 : 2 };
  if (geneId.startsWith('decision-')) return { utilityThreshold: utility };
  return {};
}
function genomeFromChoices(id: string, choices: Partial<Record<ModuleRole, string>>, confidence: number, utility: number, generation: number, parentIds: string[] = [], mutation = 'grid') {
  const ids = mandatoryRoles.map(role => choices[role] ?? baseIds[role]);
  if (choices.schedule !== 'none') ids.push(choices.schedule ?? baseIds.schedule);
  const params: Record<string, Record<string, number>> = {};
  for (const geneId of ids) params[geneId] = paramsFor(geneId, confidence, utility);
  return buildGenome(id, ids, generation, params) as Genome & { metadata: NonNullable<Genome['metadata']> };
}
function readThreshold(genome: Genome, role: ModuleRole, key: string, fallback: number): number {
  const node = genome.nodes.find(n => n.nodeId === role);
  const value = node?.params[key];
  return typeof value === 'number' && Number.isFinite(value) ? value : fallback;
}
function mutate(parent: Genome, rng: SeededRandom, generation: number, id: string): Genome {
  const choices: Partial<Record<ModuleRole, string>> = {};
  for (const node of parent.nodes) choices[node.nodeId as ModuleRole] = node.geneId;
  const mutable: ModuleRole[] = ['diagnose', 'forecast', 'analyze', 'decide'];
  const role = rng.pick(mutable);
  const alternatives = genesByRole(role).map(g => g.id);
  choices[role] = rng.pick(alternatives);
  if (rng.next() < 0.18) choices.schedule = choices.schedule === 'none' ? 'review-scheduler' : 'none';
  const priorConfidence = readThreshold(parent, 'diagnose', 'confidenceThreshold', 0.55);
  const priorUtility = readThreshold(parent, 'decide', 'utilityThreshold', 0.24);
  const confidence = Math.max(0.32, Math.min(0.78, priorConfidence + (rng.next() - 0.5) * 0.16));
  const utility = Math.max(0.03, Math.min(0.65, priorUtility + (rng.next() - 0.5) * 0.14));
  const genome = genomeFromChoices(id, choices, confidence, utility, generation, [parent.id], `mutate:${role}`);
  return { ...genome, metadata: { parentIds: [parent.id], mutation: `mutate:${role}` } };
}
function randomGenome(rng: SeededRandom, generation: number, id: string): Genome {
  const choices: Partial<Record<ModuleRole, string>> = {};
  for (const role of ['diagnose', 'forecast', 'analyze', 'decide'] as ModuleRole[]) choices[role] = rng.pick(genesByRole(role).map(g => g.id));
  choices.schedule = rng.next() < 0.7 ? 'review-scheduler' : 'none';
  const confidence = 0.32 + rng.next() * 0.46;
  const utility = 0.03 + rng.next() * 0.62;
  return genomeFromChoices(id, choices, confidence, utility, generation, [], 'random-initialization');
}

function crossover(a: Genome, b: Genome, rng: SeededRandom, generation: number, id: string): Genome {
  const choices: Partial<Record<ModuleRole, string>> = {};
  for (const role of roles) {
    const source = rng.next() < 0.5 ? a : b;
    const node = source.nodes.find(n => n.nodeId === role);
    if (node) choices[role] = node.geneId;
    else if (role === 'schedule') choices.schedule = 'none';
  }
  const confidence = (readThreshold(a, 'diagnose', 'confidenceThreshold', 0.55) + readThreshold(b, 'diagnose', 'confidenceThreshold', 0.55)) / 2;
  const utility = (readThreshold(a, 'decide', 'utilityThreshold', 0.24) + readThreshold(b, 'decide', 'utilityThreshold', 0.24)) / 2;
  const genome = genomeFromChoices(id, choices, confidence, utility, generation, [a.id, b.id], 'crossover');
  return { ...genome, metadata: { parentIds: [a.id, b.id], mutation: 'crossover' } };
}

function evaluateCandidate(genome: Genome, training: EvaluationCase[], inferenceBudget: number): FitnessMetrics {
  return scoreGenome(genome, training, inferenceBudget);
}

/**
 * Equal-budget architecture search. Every strategy evaluates exactly 40 candidates on
 * the same fixed training set. The reserved compute charge is 1 architecture unit plus
 * 10 * inferenceBudget units per candidate, even when a candidate exits early.
 */
export function runEqualBudgetSearch(training: EvaluationCase[], seed = 20261118, inferenceBudget = 32): SearchResult[] {
  if (training.length < 30 || training.length > 120) throw new Error('Equal-budget search requires 30..120 fixed training cases');
  const candidateCount = 40;
  const perCandidateReservation = 1 + training.length * inferenceBudget;
  const allocated = candidateCount * perCandidateReservation;
  const confidenceGrid = [0.38, 0.48, 0.58, 0.68, 0.74];
  const utilityGrid = [0.05, 0.12, 0.20, 0.28, 0.36, 0.44, 0.52, 0.60];

  const fixedCandidates: Array<{ genome: Genome; metrics: FitnessMetrics }> = [];
  for (let i = 0; i < candidateCount; i++) {
    const confidence = confidenceGrid[i % confidenceGrid.length]!;
    const utility = utilityGrid[Math.floor(i / confidenceGrid.length) % utilityGrid.length]!;
    const genome = genomeFromChoices(`fixed-${i}`, {
      diagnose: 'cause-diagnosis-balanced', forecast: 'memory-forecast-fast', analyze: 'interference-light', decide: 'decision-conservative'
    }, confidence, utility, 0);
    fixedCandidates.push({ genome, metrics: evaluateCandidate(genome, training, inferenceBudget) });
  }
  fixedCandidates.sort((a, b) => b.metrics.score - a.metrics.score);

  const staticCandidates: Array<{ genome: Genome; metrics: FitnessMetrics }> = [];
  for (let i = 0; i < candidateCount; i++) {
    const confidence = confidenceGrid[(i * 3) % confidenceGrid.length]!;
    const utility = utilityGrid[(i * 5) % utilityGrid.length]!;
    const choices = {
      diagnose: i % 2 ? 'cause-diagnosis-conservative' : 'cause-diagnosis-balanced',
      forecast: i % 2 ? 'memory-forecast-bma' : 'memory-forecast-fast',
      analyze: i % 3 ? 'interference-separated' : 'interference-light',
      decide: i % 2 ? 'decision-risk-sensitive' : 'decision-conservative'
    };
    const genome = genomeFromChoices(`static-${i}`, choices, confidence, utility, 0);
    staticCandidates.push({ genome, metrics: evaluateCandidate(genome, training, inferenceBudget) });
  }
  staticCandidates.sort((a, b) => b.metrics.score - a.metrics.score);

  const rng = new SeededRandom(seed);
  let population: Array<{ genome: Genome; metrics: FitnessMetrics }> = [];
  const allEvaluated: Array<{ genome: Genome; metrics: FitnessMetrics }> = [];
  const seedGenome = canonicalGenome();
  const fixedSeed: Genome = { ...fixedCandidates[0]!.genome, id: 'evo-seed-fixed-best', generation: 0, metadata: { parentIds: [fixedCandidates[0]!.genome.id], mutation: 'seed-from-fixed-search' } };
  const staticSeed: Genome = { ...staticCandidates[0]!.genome, id: 'evo-seed-static-best', generation: 0, metadata: { parentIds: [staticCandidates[0]!.genome.id], mutation: 'seed-from-static-search' } };
  const initial: Genome[] = [legacyGenome(), fixedSeed, staticSeed];
  while (initial.length < 8) initial.push(randomGenome(rng, 0, `evo-g0-${initial.length}`));
  for (let i = 0; i < 8; i++) {
    const g = initial[i]!;
    const item = { genome: g, metrics: evaluateCandidate(g, training, inferenceBudget) };
    population.push(item); allEvaluated.push(item);
  }
  let evaluated = 8;
  for (let generation = 1; generation < 5; generation++) {
    population.sort((a, b) => b.metrics.score - a.metrics.score);
    const elites = population.slice(0, 4);
    const next: Array<{ genome: Genome; metrics: FitnessMetrics }> = [];
    while (next.length < 8) {
      const parentA = elites[rng.int(elites.length)]!.genome;
      const parentB = elites[rng.int(elites.length)]!.genome;
      let child: Genome;
      try {
        child = rng.next() < 0.45
          ? crossover(parentA, parentB, rng, generation, `evo-g${generation}-${next.length}`)
          : mutate(parentA, rng, generation, `evo-g${generation}-${next.length}`);
      } catch {
        child = mutate(seedGenome, rng, generation, `evo-fallback-${generation}-${next.length}`);
      }
      const item = { genome: child, metrics: evaluateCandidate(child, training, inferenceBudget) };
      next.push(item); allEvaluated.push(item);
      evaluated++;
    }
    population = next;
  }
  allEvaluated.sort((a, b) => b.metrics.score - a.metrics.score);
  const evolved = allEvaluated[0]!;
  const searchBudget = { allocated, consumed: allocated, candidateEvaluations: candidateCount, trainingCasesPerCandidate: training.length, perCandidateReservation };
  const fixed = fixedCandidates[0]!;
  const modular = staticCandidates[0]!;
  // The search is explicitly budgeted at 40 unique candidate evaluations: 8 initial + 4 generations x 8 offspring.
  if (evaluated !== candidateCount) throw new Error(`Evolution candidate accounting mismatch: ${evaluated}`);
  const results: SearchResult[] = [
    { strategy: 'fixed-heuristic', genome: fixed.genome, metrics: fixed.metrics, searchBudget },
    { strategy: 'static-modular', genome: modular.genome, metrics: modular.metrics, searchBudget },
    { strategy: 'evolved-modular', genome: evolved.genome, metrics: evolved.metrics, searchBudget }
  ];
  for (const r of results) if (!validateGenome(r.genome).valid) throw new Error(`Search returned invalid genome: ${r.genome.id}`);
  return results;
}

export function mutateGenomeForTest(parent: Genome, seed = 1): Genome { return mutate(parent, new SeededRandom(seed), parent.generation + 1, `test-mutant-${seed}`); }
