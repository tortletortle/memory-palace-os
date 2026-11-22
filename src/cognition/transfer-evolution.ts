import { SeededRandom } from './evolution.ts';
import { createTransferGenome, validateTransferGenome } from './transfer-graph.ts';
import { scoreTransferGenome, transferFitness } from './transfer-engine.ts';
import { getTransferGene, optionalTransferGenes, supportedSynergyPairs } from './transfer-library.ts';
import type { TransferFeature, TransferGeneAllele, TransferGenome, TransferSearchResult, TransferTask } from './transfer-types.ts';

const rootId = 'atom-chunking';
const optionalIds = optionalTransferGenes().map(g => g.id);
const synergyPairs = [...supportedSynergyPairs()];

function unique<T>(items: T[]): T[] { return [...new Set(items)]; }
function withCompatiblePairs(geneIds: string[], pairs: string[]): string[] {
  const set = new Set(geneIds);
  return pairs.filter(pair => pair.split('+').every(id => set.has(id)));
}

function makeRandomGenome(rng: SeededRandom, generation: number, id: string): TransferGenome {
  const shuffled = [...optionalIds].sort(() => rng.next() - 0.5);
  const count = 3 + rng.int(5);
  const genes = shuffled.slice(0, count);
  const closed = createTransferGenome(id, genes, {
    generation,
    activationThreshold: 0.14 + rng.next() * 0.42,
    maxActiveGenes: 2 + rng.int(5),
    synergyPairs: withCompatiblePairs(genes, synergyPairs.filter(() => rng.next() < 0.4)),
    mutation: 'random-initialization'
  });
  return closed;
}

function mutateGenome(parent: TransferGenome, rng: SeededRandom, generation: number, id: string, allowAlleleMutation = true): TransferGenome {
  const genes = new Set(parent.geneIds.filter(g => g !== rootId));
  const action = rng.int(allowAlleleMutation ? 5 : 4);
  let alleles = (parent.alleles ?? []).map(a => ({ ...a, featureAffinity: { ...a.featureAffinity } }));
  if (action === 4 && genes.size > 0) {
    const geneId = rng.pick([...genes]);
    const base = getTransferGene(geneId)!;
    const current = alleles.find(a => a.geneId === geneId);
    const currentAffinity = { ...base.featureAffinity, ...(current?.featureAffinity ?? {}) };
    const featureKeys = Object.keys(base.featureAffinity) as TransferFeature[];
    const feature = rng.pick(featureKeys);
    const nextAffinity = Math.max(0, Math.min(1.2, (currentAffinity[feature] ?? 0) + (rng.next() - 0.5) * 0.22));
    const allele: TransferGeneAllele = {
      geneId,
      version: (current?.version ?? base.version) + 1,
      featureAffinity: { ...(current?.featureAffinity ?? {}), [feature]: nextAffinity },
      transferability: Math.max(0.4, Math.min(1, (current?.transferability ?? base.transferability) + (rng.next() - 0.5) * 0.08)),
      costMultiplier: Math.max(0.75, Math.min(1.5, (current?.costMultiplier ?? 1) + (rng.next() - 0.5) * 0.10)),
      parentVersion: current?.version ?? base.version,
      mutation: `affinity:${feature}`
    };
    alleles = [...alleles.filter(a => a.geneId !== geneId), allele];
  }
  if (action === 0 && genes.size < 9) {
    const available = optionalIds.filter(g => !genes.has(g));
    if (available.length) genes.add(rng.pick(available));
  } else if (action === 1 && genes.size > 2) {
    genes.delete(rng.pick([...genes]));
  } else if (action === 2) {
    const available = optionalIds.filter(g => !genes.has(g));
    if (available.length) {
      const old = rng.pick([...genes]);
      genes.delete(old);
      genes.add(rng.pick(available));
    }
  }
  const threshold = Math.max(0.08, Math.min(0.72, parent.activationThreshold + (rng.next() - 0.5) * 0.16));
  const maxActiveGenes = Math.max(1, Math.min(8, parent.maxActiveGenes + (rng.next() < 0.5 ? -1 : 1)));
  const geneList = [...genes];
  alleles = alleles.filter(a => geneList.includes(a.geneId));
  let pairs = parent.synergyPairs.filter(pair => pair.split('+').every(g => genes.has(g)));
  if (rng.next() < 0.35) {
    const available = withCompatiblePairs(geneList, synergyPairs).filter(p => !pairs.includes(p));
    if (available.length) pairs = [...pairs, rng.pick(available)];
  }
  return createTransferGenome(id, geneList, {
    generation, activationThreshold: threshold, maxActiveGenes,
    synergyPairs: unique(pairs), alleles, parentIds: [parent.id], mutation: `mutate:${action}`
  });
}

function crossoverGenome(a: TransferGenome, b: TransferGenome, rng: SeededRandom, generation: number, id: string): TransferGenome {
  const aSet = new Set(a.geneIds), bSet = new Set(b.geneIds);
  const genes = optionalIds.filter(g => {
    const inA = aSet.has(g), inB = bSet.has(g);
    if (inA && inB) return true;
    if (inA || inB) return rng.next() < 0.5;
    return false;
  });
  if (genes.length < 2) genes.push(...optionalIds.filter(g => !genes.includes(g)).slice(0, 2 - genes.length));
  const pairs = unique([...a.synergyPairs, ...b.synergyPairs]).filter(p => p.split('+').every(g => genes.includes(g)));
  const alleleById = new Map<string, TransferGeneAllele>();
  for (const geneId of genes) {
    const aa = a.alleles?.find(x => x.geneId === geneId);
    const bb = b.alleles?.find(x => x.geneId === geneId);
    const chosen = aa && bb
      ? {
          ...aa,
          version: Math.max(aa.version, bb.version) + 1,
          featureAffinity: Object.fromEntries([...new Set([...Object.keys(aa.featureAffinity), ...Object.keys(bb.featureAffinity)])].map(k => [k, (((aa.featureAffinity as Record<string, number>)[k] ?? (getTransferGene(geneId)!.featureAffinity as Record<string, number>)[k] ?? 0) + ((bb.featureAffinity as Record<string, number>)[k] ?? (getTransferGene(geneId)!.featureAffinity as Record<string, number>)[k] ?? 0)) / 2])),
          transferability: (aa.transferability + bb.transferability) / 2,
          costMultiplier: (aa.costMultiplier + bb.costMultiplier) / 2,
          mutation: 'crossover-allele'
        }
      : (aa ?? bb);
    if (chosen) alleleById.set(geneId, chosen);
  }
  return createTransferGenome(id, genes, {
    generation,
    activationThreshold: (a.activationThreshold + b.activationThreshold) / 2,
    maxActiveGenes: Math.round((a.maxActiveGenes + b.maxActiveGenes) / 2),
    synergyPairs: pairs,
    alleles: [...alleleById.values()],
    parentIds: [a.id, b.id],
    mutation: 'crossover'
  });
}

function evaluate(genome: TransferGenome, tasks: TransferTask[], inferenceBudget: number) {
  const metrics = scoreTransferGenome(genome, tasks, inferenceBudget);
  return { genome, metrics, fitness: transferFitness(metrics) };
}

function searchBudget(trainingCases: number, inferenceBudget: number) {
  const candidateEvaluations = 40;
  const perCandidateReservation = 1 + trainingCases * inferenceBudget;
  const allocated = candidateEvaluations * perCandidateReservation;
  return { candidateEvaluations, trainingCases, inferenceBudgetPerCase: inferenceBudget, perCandidateReservation, allocated, consumed: allocated };
}

/**
 * All three search arms evaluate exactly 40 candidates against the same training cases.
 * Reservations are charged equally even if a candidate uses fewer inference units.
 */
export function runEqualBudgetTransferSearch(training: TransferTask[], seed = 20261119, inferenceBudget = 18): TransferSearchResult[] {
  if (training.length < 24 || training.length > 500) throw new Error('Transfer search requires 24..500 source-domain training tasks');
  if (!Number.isInteger(inferenceBudget) || inferenceBudget < 6 || inferenceBudget > 100) throw new Error('inferenceBudget must be an integer in [6,100]');
  if (training.some(t => t.split !== 'source_train')) throw new Error('Search data must contain source_train tasks only');
  const budget = searchBudget(training.length, inferenceBudget);
  const fixedResults: ReturnType<typeof evaluate>[] = [];
  const fixedGenes = ['spatial-route', 'symbol-anchor', 'causal-chain', 'contrastive-pair', 'timeline-sequence', 'hierarchy-chunk', 'retrieval-cue'];
  for (let i = 0; i < 40; i++) {
    const genome = createTransferGenome(`fixed-${i}`, fixedGenes, {
      activationThreshold: [0.18, 0.24, 0.30, 0.36, 0.42][i % 5]!,
      maxActiveGenes: 2 + (Math.floor(i / 5) % 6),
      synergyPairs: withCompatiblePairs(fixedGenes, synergyPairs.slice(0, Math.floor(i / 8) + 1))
    });
    fixedResults.push(evaluate(genome, training, inferenceBudget));
  }
  fixedResults.sort((a, b) => b.fitness - a.fitness);

  const bundles = [
    ['spatial-route', 'retrieval-cue'],
    ['symbol-anchor', 'hierarchy-chunk'],
    ['causal-chain', 'timeline-sequence'],
    ['contrastive-pair', 'interleaved-retrieval'],
    ['analogy-bridge', 'dual-code'],
    ['causal-chain', 'mechanism-simulation'],
    ['symbol-anchor', 'contrastive-pair', 'retrieval-cue'],
    ['spatial-route', 'timeline-sequence', 'hierarchy-chunk']
  ];
  const staticResults: ReturnType<typeof evaluate>[] = [];
  for (let i = 0; i < 40; i++) {
    const bundle = bundles[i % bundles.length]!;
    const expanded = [...bundle];
    if (i % 3 === 0) expanded.push('retrieval-cue');
    if (i % 4 === 0) expanded.push('analogy-bridge');
    const genes = unique(expanded);
    staticResults.push(evaluate(createTransferGenome(`static-${i}`, genes, {
      activationThreshold: [0.16, 0.25, 0.34, 0.43][i % 4]!,
      maxActiveGenes: 2 + (Math.floor(i / 4) % 6),
      synergyPairs: withCompatiblePairs(genes, synergyPairs.filter((_, j) => (i + j) % 2 === 0))
    }), training, inferenceBudget));
  }
  staticResults.sort((a, b) => b.fitness - a.fitness);

  const runEvolution = (allowAlleleMutation: boolean, runSeed: number, label: string) => {
    const rng = new SeededRandom(runSeed);
    const initial: TransferGenome[] = [
      { ...fixedResults[0]!.genome, id: `${label}-seed-fixed`, metadata: { parentIds: [fixedResults[0]!.genome.id], mutation: 'seed-fixed-best' } },
      { ...staticResults[0]!.genome, id: `${label}-seed-static`, metadata: { parentIds: [staticResults[0]!.genome.id], mutation: 'seed-static-best' } }
    ];
    while (initial.length < 8) initial.push(makeRandomGenome(rng, 0, `${label}-g0-${initial.length}`));
    let population = initial.map(g => evaluate(g, training, inferenceBudget));
    const allEvaluated = [...population];
    for (let generation = 1; generation <= 4; generation++) {
      population.sort((a, b) => b.fitness - a.fitness);
      const elites = population.slice(0, 4);
      const next: ReturnType<typeof evaluate>[] = [];
      while (next.length < 8) {
        const a = rng.pick(elites).genome;
        const b = rng.pick(elites).genome;
        const id = `${label}-g${generation}-${next.length}`;
        const child = rng.next() < 0.45
          ? crossoverGenome(a, b, rng, generation, id)
          : mutateGenome(a, rng, generation, id, allowAlleleMutation);
        next.push(evaluate(child, training, inferenceBudget));
      }
      population = next;
      allEvaluated.push(...next);
    }
    if (allEvaluated.length !== 40) throw new Error(`Expected 40 candidates for ${label}, got ${allEvaluated.length}`);
    allEvaluated.sort((a, b) => b.fitness - a.fitness);
    const candidatesWithAlleles = allEvaluated.filter(x => (x.genome.alleles?.length ?? 0) > 0).length;
    const alleleVariantsEvaluated = allEvaluated.reduce((sum, x) => sum + (x.genome.alleles?.length ?? 0), 0);
    return {
      winner: allEvaluated[0]!,
      audit: { candidatesWithAlleles, alleleVariantsEvaluated, selectedAlleleCount: allEvaluated[0]!.genome.alleles?.length ?? 0 }
    };
  };

  const evolved = runEvolution(true, seed, 'evolved');
  const noAllele = runEvolution(false, seed, 'evolved-no-allele');
  const winners = [
    { strategy: 'fixed-heuristic' as const, item: fixedResults[0]!, audit: undefined },
    { strategy: 'static-modular' as const, item: staticResults[0]!, audit: undefined },
    { strategy: 'evolved-modular' as const, item: evolved.winner, audit: evolved.audit },
    { strategy: 'evolved-no-allele' as const, item: noAllele.winner, audit: noAllele.audit }
  ];
  return winners.map(({ strategy, item, audit }) => {
    const validation = validateTransferGenome(item.genome);
    if (!validation.valid) throw new Error(`Search returned invalid genome: ${validation.errors.join('; ')}`);
    return { strategy, genome: item.genome, metrics: item.metrics, ...(audit ? { evolutionAudit: audit } : {}), searchBudget: budget };
  });
}

export function mutateTransferGenomeForTest(parent: TransferGenome, seed = 1): TransferGenome {
  return mutateGenome(parent, new SeededRandom(seed), parent.generation + 1, `test-mutant-${seed}`);
}
