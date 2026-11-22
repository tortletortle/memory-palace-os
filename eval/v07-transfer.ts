import { mkdir, writeFile } from 'node:fs/promises';
import { pathToFileURL } from 'node:url';
import { transferGenes, supportedSynergyPairs } from '../src/cognition/transfer-library.ts';
import { runEqualBudgetTransferSearch } from '../src/cognition/transfer-evolution.ts';
import { scoreTransferGenome, selectTransferSkills, transferFitness } from '../src/cognition/transfer-engine.ts';
import type { FeatureVector, MemoryDomain, TransferFeature, TransferTask } from '../src/cognition/transfer-types.ts';

class RNG {
  private state: number;
  constructor(seed: number) { this.state = (seed >>> 0) || 1; }
  next(): number { this.state = (Math.imul(this.state, 1664525) + 1013904223) >>> 0; return this.state / 0x100000000; }
  int(n: number): number { return Math.floor(this.next() * n); }
}

const sourceDomains: MemoryDomain[] = ['probability', 'programming', 'history'];
const targetDomains: MemoryDomain[] = ['digital_logic', 'language', 'biology'];
const heldOutPairs = ['causal+symbolic', 'analogical+retrieval', 'hierarchical+spatial', 'contrastive+sequential'];
const domainTemplates: Record<MemoryDomain, Partial<FeatureVector>> = {
  probability: { symbolic: 0.92, hierarchical: 0.72, contrastive: 0.56, retrieval: 0.66 },
  programming: { sequential: 0.90, causal: 0.78, hierarchical: 0.62, dynamic: 0.48 },
  history: { sequential: 0.72, causal: 0.70, spatial: 0.55, retrieval: 0.61 },
  digital_logic: { symbolic: 0.92, causal: 0.78, dynamic: 0.72, hierarchical: 0.58 },
  language: { semantic: 0.92, contrastive: 0.82, analogical: 0.76, retrieval: 0.67 },
  biology: { causal: 0.82, hierarchical: 0.76, spatial: 0.57, analogical: 0.63 }
};
const featureNames = ['spatial', 'symbolic', 'causal', 'sequential', 'hierarchical', 'contrastive', 'analogical', 'dynamic', 'retrieval', 'semantic'] as TransferFeature[];
const pairSynergies = [...supportedSynergyPairs()];

function blankFeatures(): FeatureVector {
  return Object.fromEntries(featureNames.map(f => [f, 0.05])) as FeatureVector;
}
export function topPair(features: FeatureVector): string {
  const top = featureNames.map(f => ({ f, v: features[f] })).sort((a, b) => b.v - a.v).slice(0, 2).map(x => x.f).sort();
  return `${top[0]}+${top[1]}`;
}
function makeTask(seed: number, domain: MemoryDomain, index: number, split: TransferTask['split'], forcePair?: string): TransferTask {
  const rng = new RNG(seed);
  const features = blankFeatures();
  for (const [feature, value] of Object.entries(domainTemplates[domain]) as Array<[TransferFeature, number]>) {
    features[feature] = Math.max(0.05, Math.min(1, value + (rng.next() - 0.5) * 0.20));
  }
  if (forcePair) {
    const [a, b] = forcePair.split('+') as TransferFeature[];
    // Force the held-out pair to be the two dominant features; keep domain context weak.
    for (const f of featureNames) if (f !== a && f !== b) features[f] = Math.min(features[f], 0.52);
    features[a] = 0.97;
    features[b] = 0.94;
  }
  const hiddenUtility: Record<string, number> = {};
  for (const gene of transferGenes()) {
    const entries = Object.entries(gene.featureAffinity) as Array<[TransferFeature, number]>;
    const denom = entries.reduce((s, [, w]) => s + w, 0) || 1;
    const affinity = entries.reduce((s, [f, w]) => s + features[f] * w, 0) / denom;
    const domainHash = [...`${domain}:${gene.id}`].reduce((s, ch) => (s * 31 + ch.charCodeAt(0)) >>> 0, 7);
    const domainShift = ((domainHash % 17) - 8) / 180;
    const noise = (rng.next() - 0.5) * 0.045;
    hiddenUtility[gene.id] = Math.max(0.04, Math.min(1, 0.12 + affinity * gene.transferability * 0.82 + domainShift + noise));
  }
  const synergies: string[] = [];
  const featurePairConditions: Array<{ pair: string; a: TransferFeature; b: TransferFeature }> = [
    { pair: 'causal-chain+timeline-sequence', a: 'causal', b: 'sequential' },
    { pair: 'spatial-route+retrieval-cue', a: 'spatial', b: 'retrieval' },
    { pair: 'symbol-anchor+contrastive-pair', a: 'symbolic', b: 'contrastive' },
    { pair: 'analogy-bridge+dual-code', a: 'analogical', b: 'semantic' },
    { pair: 'causal-chain+mechanism-simulation', a: 'causal', b: 'dynamic' }
  ];
  for (const item of featurePairConditions) if (features[item.a] >= 0.55 && features[item.b] >= 0.55) synergies.push(item.pair);
  return {
    id: `${split}-${domain}-${seed}-${index}`,
    domain,
    features,
    difficulty: 0.2 + rng.next() * 0.7,
    hidden: { skillUtility: hiddenUtility, synergyPairs: synergies },
    split,
    ...(forcePair ? { heldOutPair: forcePair } : {})
  };
}

export function buildTraining(seed: number): TransferTask[] {
  const tasks: TransferTask[] = [];
  let index = 0;
  for (const domain of sourceDomains) {
    let accepted = 0, attempts = 0;
    while (accepted < 24 && attempts < 500) {
      const task = makeTask(seed + attempts * 13 + index * 97, domain, index++, 'source_train');
      if (!heldOutPairs.includes(topPair(task.features))) { tasks.push(task); accepted++; }
      attempts++;
    }
    if (accepted < 24) throw new Error(`Could not construct source tasks for ${domain}`);
  }
  return tasks;
}

export function buildHoldout(seed: number): { targetDomain: TransferTask[]; composition: TransferTask[] } {
  const targetDomain: TransferTask[] = [];
  let index = 0;
  for (const domain of targetDomains) for (let i = 0; i < 24; i++) targetDomain.push(makeTask(seed + index * 101, domain, index++, 'target_domain_holdout'));
  const composition: TransferTask[] = [];
  for (const domain of sourceDomains) for (const pair of heldOutPairs) for (let i = 0; i < 4; i++) {
    composition.push(makeTask(seed + 50000 + index * 73, domain, index++, 'composition_holdout', pair));
  }
  return { targetDomain, composition };
}

function mean(values: number[]): number { return values.reduce((s, x) => s + x, 0) / Math.max(1, values.length); }
function seenSkillPairs(tasks: TransferTask[], genome: import('../src/cognition/transfer-types.ts').TransferGenome, budget: number): Set<string> {
  const seen = new Set<string>();
  for (const task of tasks) {
    const ids = selectTransferSkills(task, genome, budget).activeGenes.map(x => x.geneId).filter(id => id !== 'atom-chunking');
    for (let i = 0; i < ids.length; i++) for (let j = i + 1; j < ids.length; j++) seen.add([ids[i]!, ids[j]!].sort().join('+'));
  }
  return seen;
}
function summarize(tasks: TransferTask[], genome: import('../src/cognition/transfer-types.ts').TransferGenome, budget: number, seenPairs?: ReadonlySet<string>) {
  return scoreTransferGenome(genome, tasks, budget, seenPairs);
}
function paired(a: number[], b: number[]) {
  const d = a.map((x, i) => x - b[i]!);
  const m = mean(d);
  const variance = d.length > 1 ? d.reduce((s, x) => s + (x - m) ** 2, 0) / (d.length - 1) : 0;
  const half = 1.96 * Math.sqrt(variance / Math.max(1, d.length));
  return { n: d.length, meanDifference: m, ci95NormalApprox: [m - half, m + half] };
}

async function main() {
  const runCount = 24;
  const inferenceBudget = 18;
  const perRun: Array<Record<string, unknown>> = [];
  const seedRows: string[] = ['strategy,run_seed,split,episodes,normalized_utility,feature_fit,combination_coverage,novel_combination_coverage,mean_active_optional_genes,mean_compute_units,budget_utilization'];
  for (let run = 0; run < runCount; run++) {
    const training = buildTraining(310000 + run * 1009);
    const holdout = buildHoldout(910000 + run * 2017);
    if (training.some(t => !sourceDomains.includes(t.domain)) || holdout.targetDomain.some(t => !targetDomains.includes(t.domain))) throw new Error('Domain split leakage detected');
    if (training.some(t => heldOutPairs.includes(topPair(t.features)))) throw new Error('Composition split leakage detected');
    const search = runEqualBudgetTransferSearch(training, 710000 + run * 37, inferenceBudget);
    const strategyReports = search.map(result => {
      const seenPairs = seenSkillPairs(training, result.genome, inferenceBudget);
      const targetMetrics = summarize(holdout.targetDomain, result.genome, inferenceBudget, seenPairs);
      const compositionMetrics = summarize(holdout.composition, result.genome, inferenceBudget, seenPairs);
      const combined = summarize([...holdout.targetDomain, ...holdout.composition], result.genome, inferenceBudget, seenPairs);
      const targetByDomain = Object.fromEntries(targetDomains.map(domain => [domain, summarize(holdout.targetDomain.filter(t => t.domain === domain), result.genome, inferenceBudget, seenPairs)]));
      const compositionByPair = Object.fromEntries(heldOutPairs.map(pair => [pair, summarize(holdout.composition.filter(t => t.heldOutPair === pair), result.genome, inferenceBudget, seenPairs)]));
      for (const [split, metrics] of [['target_domain_holdout', targetMetrics], ['composition_holdout', compositionMetrics], ['combined_holdout', combined]] as const) {
        seedRows.push(`${result.strategy},${run},${split},${metrics.episodes},${metrics.normalizedUtility},${metrics.featureFit},${metrics.combinationCoverage},${metrics.novelCombinationCoverage},${metrics.meanActiveOptionalGenes},${metrics.meanComputeUnits},${metrics.budgetUtilization}`);
      }
      return {
        strategy: result.strategy,
        genome: result.genome,
        evolutionAudit: result.evolutionAudit ?? null,
        trainingMetrics: result.metrics,
        searchBudget: result.searchBudget,
        heldout: { targetDomain: targetMetrics, composition: compositionMetrics, combined, targetByDomain, compositionByPair },
        fitness: transferFitness(combined)
      };
    });
    perRun.push({ run, trainingCases: training.length, targetDomainCases: holdout.targetDomain.length, compositionCases: holdout.composition.length, strategies: strategyReports });
  }
  const strategies = ['fixed-heuristic', 'static-modular', 'evolved-modular', 'evolved-no-allele'] as const;
  const aggregate = strategies.map(strategy => {
    const rows = perRun.map(run => (run.strategies as Array<Record<string, any>>).find(s => s.strategy === strategy)!);
    const collect = (split: 'targetDomain' | 'composition' | 'combined', metric: string) => mean(rows.map(r => r.heldout[split][metric] as number));
    return {
      strategy,
      targetDomain: {
        normalizedUtility: collect('targetDomain', 'normalizedUtility'),
        featureFit: collect('targetDomain', 'featureFit'),
        combinationCoverage: collect('targetDomain', 'combinationCoverage'),
        novelCombinationCoverage: collect('targetDomain', 'novelCombinationCoverage'),
        meanComputeUnits: collect('targetDomain', 'meanComputeUnits')
      },
      composition: {
        normalizedUtility: collect('composition', 'normalizedUtility'),
        featureFit: collect('composition', 'featureFit'),
        combinationCoverage: collect('composition', 'combinationCoverage'),
        novelCombinationCoverage: collect('composition', 'novelCombinationCoverage'),
        meanComputeUnits: collect('composition', 'meanComputeUnits')
      },
      combined: {
        normalizedUtility: collect('combined', 'normalizedUtility'),
        featureFit: collect('combined', 'featureFit'),
        combinationCoverage: collect('combined', 'combinationCoverage'),
        novelCombinationCoverage: collect('combined', 'novelCombinationCoverage'),
        meanComputeUnits: collect('combined', 'meanComputeUnits')
      },
      targetDomainBreakdown: Object.fromEntries(targetDomains.map(domain => [domain, mean(rows.map(r => r.heldout.targetByDomain[domain].normalizedUtility as number))])),
      compositionPairBreakdown: Object.fromEntries(heldOutPairs.map(pair => [pair, mean(rows.map(r => r.heldout.compositionByPair[pair].normalizedUtility as number))])),
      evolutionAudit: {
        meanCandidatesWithAlleles: mean(rows.map(r => (r.evolutionAudit?.candidatesWithAlleles ?? 0) as number)),
        meanAlleleVariantsEvaluated: mean(rows.map(r => (r.evolutionAudit?.alleleVariantsEvaluated ?? 0) as number)),
        meanSelectedAlleles: mean(rows.map(r => (r.evolutionAudit?.selectedAlleleCount ?? 0) as number))
      },
      averageSearchBudget: rows[0]!.searchBudget
    };
  });
  const fixedRows = perRun.map(run => (run.strategies as Array<Record<string, any>>).find(s => s.strategy === 'fixed-heuristic')!);
  const pairedComparisons = ['static-modular', 'evolved-modular', 'evolved-no-allele'].map(strategy => {
    const current = perRun.map(run => (run.strategies as Array<Record<string, any>>).find(s => s.strategy === strategy)!);
    return {
      comparison: `${strategy} minus fixed-heuristic`,
      targetDomainUtility: paired(current.map(x => x.heldout.targetDomain.normalizedUtility), fixedRows.map(x => x.heldout.targetDomain.normalizedUtility)),
      compositionUtility: paired(current.map(x => x.heldout.composition.normalizedUtility), fixedRows.map(x => x.heldout.composition.normalizedUtility)),
      combinedUtility: paired(current.map(x => x.heldout.combined.normalizedUtility), fixedRows.map(x => x.heldout.combined.normalizedUtility))
    };
  });
  const alleleAblation = {
    comparison: 'evolved-modular minus evolved-no-allele',
    targetDomainUtility: paired(
      perRun.map(run => (run.strategies as Array<Record<string, any>>).find(x => x.strategy === 'evolved-modular')!.heldout.targetDomain.normalizedUtility),
      perRun.map(run => (run.strategies as Array<Record<string, any>>).find(x => x.strategy === 'evolved-no-allele')!.heldout.targetDomain.normalizedUtility)
    ),
    compositionUtility: paired(
      perRun.map(run => (run.strategies as Array<Record<string, any>>).find(x => x.strategy === 'evolved-modular')!.heldout.composition.normalizedUtility),
      perRun.map(run => (run.strategies as Array<Record<string, any>>).find(x => x.strategy === 'evolved-no-allele')!.heldout.composition.normalizedUtility)
    ),
    combinedUtility: paired(
      perRun.map(run => (run.strategies as Array<Record<string, any>>).find(x => x.strategy === 'evolved-modular')!.heldout.combined.normalizedUtility),
      perRun.map(run => (run.strategies as Array<Record<string, any>>).find(x => x.strategy === 'evolved-no-allele')!.heldout.combined.normalizedUtility)
    )
  };
  const output = {
    title: 'Memory Palace OS V0.7 cross-domain transfer and compositional generalization experiment',
    generatedAt: new Date().toISOString(),
    protocol: {
      runCount,
      sourceTrainingDomains: sourceDomains,
      targetDomainHoldout: targetDomains,
      compositionHoldoutPairs: heldOutPairs,
      sourceTrainingCasesPerRun: 72,
      targetDomainCasesPerRun: 72,
      compositionHoldoutCasesPerRun: 48,
      strategies,
      candidateEvaluationsPerStrategy: 40,
      inferenceBudgetUnitsPerCase: inferenceBudget,
      equalSearchReservation: 'Each search arm evaluates 40 candidates on the same 72 training cases; each candidate reserves 1 + 72 * inferenceBudget deterministic units. The reservation is charged equally regardless of early exit.',
      leakageControls: [
        'Target domains are never included in source training tasks.',
        'The four held-out feature-pair combinations are excluded from source training tasks.',
        'Strategy selection receives task domain and public feature vector only; hidden skill utilities and synergy labels are used only by the evaluator.',
        'Held-out tasks use disjoint seed ranges from training tasks.'
      ],
      limitations: [
        'Synthetic benchmark with hand-designed feature affinities; not human learning evidence.',
        'Domain and feature labels are assumed accurate; no noisy real-world knowledge parser is evaluated.',
        'Equal-budget units are deterministic accounting reservations, not CPU time, energy or token cost.',
        'Normal-approximation paired intervals over 24 runs are descriptive; no multiplicity correction or preregistered human endpoint.',
        'Composition holdout tests feature-pair recombination, not arbitrary compositional reasoning.'
      ]
    },
    aggregate,
    pairedComparisons,
    alleleAblation,
    runs: perRun
  };
  const dir = new URL('../verification/', import.meta.url);
  await mkdir(dir, { recursive: true });
  await writeFile(new URL('v07-transfer-independent.json', dir), JSON.stringify(output, null, 2));
  await writeFile(new URL('v07-transfer-independent.csv', dir), seedRows.join('\n') + '\n');
  const report = [
    '# Memory Palace OS V0.7 Independent Transfer Experiment', '',
    `Generated: ${output.generatedAt}`, '',
    '## Protocol',
    `- Independent runs: ${runCount}`,
    `- Source training domains: ${sourceDomains.join(', ')}`,
    `- Target-domain holdout: ${targetDomains.join(', ')}`,
    `- Composition holdout feature pairs: ${heldOutPairs.join('; ')}`,
    '- Per run: 72 source training tasks, 72 target-domain holdout tasks, 48 composition holdout tasks.',
    `- Search: 40 candidates per strategy, ${inferenceBudget} inference units per task, identical reserved compute budget; includes an allele-mutation ablation arm.`,
    '- The policy sees public features and domain only. Hidden per-skill utility and synergy truth are evaluator-only.',
    '- Novel combination coverage counts active skill pairs that did not co-occur for that genome on source training tasks.', '',
    '## Aggregate held-out results (mean across independent runs)', '',
    '| Strategy | Target utility ↑ | Composition utility ↑ | Combined utility ↑ | Novel combo coverage ↑ | Mean compute units | Candidates with gene variants | Selected variants |',
    '|---|---:|---:|---:|---:|---:|---:|---:|',
    ...aggregate.map(r => `| ${r.strategy} | ${r.targetDomain.normalizedUtility.toFixed(4)} | ${r.composition.normalizedUtility.toFixed(4)} | ${r.combined.normalizedUtility.toFixed(4)} | ${r.combined.novelCombinationCoverage.toFixed(4)} | ${r.combined.meanComputeUnits.toFixed(2)} | ${r.evolutionAudit.meanCandidatesWithAlleles.toFixed(1)} | ${r.evolutionAudit.meanSelectedAlleles.toFixed(2)} |`),
    '', '## Paired run-level comparisons against fixed heuristic', ''
  ];
  for (const comparison of pairedComparisons) {
    report.push(`### ${comparison.comparison}`, '',
      `- Target-domain utility difference: ${comparison.targetDomainUtility.meanDifference.toFixed(4)} (95% normal-approximation CI ${comparison.targetDomainUtility.ci95NormalApprox[0].toFixed(4)} to ${comparison.targetDomainUtility.ci95NormalApprox[1].toFixed(4)}; n=${comparison.targetDomainUtility.n})`,
      `- Composition utility difference: ${comparison.compositionUtility.meanDifference.toFixed(4)} (95% normal-approximation CI ${comparison.compositionUtility.ci95NormalApprox[0].toFixed(4)} to ${comparison.compositionUtility.ci95NormalApprox[1].toFixed(4)}; n=${comparison.compositionUtility.n})`,
      `- Combined utility difference: ${comparison.combinedUtility.meanDifference.toFixed(4)} (95% normal-approximation CI ${comparison.combinedUtility.ci95NormalApprox[0].toFixed(4)} to ${comparison.combinedUtility.ci95NormalApprox[1].toFixed(4)}; n=${comparison.combinedUtility.n})`, '');
  }
  report.push('## Target-domain breakdown', '', '| Strategy | Digital logic | Language | Biology |', '|---|---:|---:|---:|');
  for (const row of aggregate) report.push(`| ${row.strategy} | ${row.targetDomainBreakdown.digital_logic.toFixed(4)} | ${row.targetDomainBreakdown.language.toFixed(4)} | ${row.targetDomainBreakdown.biology.toFixed(4)} |`);
  report.push('', '## Composition-holdout breakdown', '', '| Strategy | causal+symbolic | analogical+retrieval | hierarchical+spatial | contrastive+sequential |', '|---|---:|---:|---:|---:|');
  for (const row of aggregate) report.push(`| ${row.strategy} | ${row.compositionPairBreakdown['causal+symbolic'].toFixed(4)} | ${row.compositionPairBreakdown['analogical+retrieval'].toFixed(4)} | ${row.compositionPairBreakdown['hierarchical+spatial'].toFixed(4)} | ${row.compositionPairBreakdown['contrastive+sequential'].toFixed(4)} |`);
  report.push('', '## Gene-allele mutation ablation', '',
    `Evolved-with-alleles minus evolved-without-alleles, combined utility: ${alleleAblation.combinedUtility.meanDifference.toFixed(4)} (95% normal-approximation CI ${alleleAblation.combinedUtility.ci95NormalApprox[0].toFixed(4)} to ${alleleAblation.combinedUtility.ci95NormalApprox[1].toFixed(4)}; n=${alleleAblation.combinedUtility.n}).`,
    `Target-domain difference: ${alleleAblation.targetDomainUtility.meanDifference.toFixed(4)}; composition difference: ${alleleAblation.compositionUtility.meanDifference.toFixed(4)}.`,
    'Negative values mean the allele-enabled search scored lower. A gene-level mutation mechanism being implemented does not imply that mutated alleles are useful; this ablation is retained to expose that distinction.', '');
  report.push('## Interpretation', '',
    'The experiment is a synthetic engineering benchmark. A gain supports only the claim that the implemented search generalizes within this benchmark generator. It does not establish improved human memory, educational effectiveness, or transfer across real courses.',
    'The feature-affinity library is hand-designed, so a strong result may partly reflect the benchmark sharing assumptions with the library. A genuinely independent next test should use externally authored tasks and blinded human labels.', '');
  await writeFile(new URL('v07-transfer-independent-report.md', dir), report.join('\n'));
  console.log(report.join('\n'));
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch(error => { console.error(error); process.exitCode = 1; });
}
