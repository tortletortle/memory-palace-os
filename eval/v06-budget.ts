import { mkdir, writeFile } from 'node:fs/promises';
import { pathToFileURL } from 'node:url';
import { canonicalGenome } from '../src/cognition/graph.ts';
import { runCognition } from '../src/cognition/runtime.ts';
import { runEqualBudgetSearch, SeededRandom, scoreGenome } from '../src/cognition/evolution.ts';
import type { CognitiveCause, CognitiveObservation, EvaluationCase } from '../src/cognition/types.ts';

const environments = ['balanced', 'visual-heavy', 'semantic-heavy', 'knowledge-gap', 'forgetting-heavy', 'ambiguous-drift'] as const;
type Environment = typeof environments[number];
const actionFor = (cause: Exclude<CognitiveCause, 'unknown'>) => ({
  knowledge_gap: 'relearn_concept', forgetting: 'schedule_review', visual_confusion: 'replace_visual_cue',
  semantic_confusion: 'clarify_semantics', none: 'no_action'
} as const)[cause];

function chooseCause(rng: SeededRandom, env: Environment): Exclude<CognitiveCause, 'unknown'> {
  if (env === 'visual-heavy') return rng.next() < 0.82 ? 'visual_confusion' : rng.pick(['forgetting', 'knowledge_gap', 'semantic_confusion'] as const);
  if (env === 'semantic-heavy') return rng.next() < 0.82 ? 'semantic_confusion' : rng.pick(['forgetting', 'knowledge_gap', 'visual_confusion'] as const);
  if (env === 'knowledge-gap') return rng.next() < 0.82 ? 'knowledge_gap' : rng.pick(['forgetting', 'visual_confusion', 'semantic_confusion'] as const);
  if (env === 'forgetting-heavy') return rng.next() < 0.82 ? 'forgetting' : rng.pick(['knowledge_gap', 'visual_confusion', 'semantic_confusion'] as const);
  if (env === 'ambiguous-drift') return rng.next() < 0.5 ? 'none' : 'forgetting';
  return rng.pick(['knowledge_gap', 'forgetting', 'visual_confusion', 'semantic_confusion', 'none'] as const);
}
function successProbability(cause: Exclude<CognitiveCause, 'unknown'>, mode: 'cued' | 'unaided', index: number, env: Environment): number {
  if (cause === 'knowledge_gap') return mode === 'unaided' ? 0.30 : 0.38;
  if (cause === 'forgetting') return Math.max(0.18, 0.82 - index * (env === 'ambiguous-drift' ? 0.055 : 0.035));
  if (cause === 'visual_confusion') return mode === 'unaided' ? 0.84 : 0.38;
  if (cause === 'semantic_confusion') return mode === 'unaided' ? 0.82 : 0.42;
  return mode === 'unaided' ? 0.91 : 0.88;
}
export function makeEvaluationCase(seed: number, env: Environment, caseIndex: number): EvaluationCase {
  const rng = new SeededRandom(seed * 1009 + caseIndex * 9176 + environments.indexOf(env) * 7919);
  const cause = chooseCause(rng, env);
  const observations: CognitiveObservation[] = [];
  const labelRate = env === 'ambiguous-drift' ? 0.38 : 0.78;
  const labelNoise = env === 'ambiguous-drift' ? 0.22 : 0.08;
  for (let i = 0; i < 12; i++) {
    const mode = i % 2 === 0 ? 'unaided' : 'cued';
    const success = rng.next() < successProbability(cause, mode, i, env);
    let observedCause: CognitiveCause = 'unknown';
    if (success) observedCause = 'none';
    else if (rng.next() < labelRate) {
      observedCause = rng.next() < labelNoise
        ? rng.pick(['knowledge_gap', 'forgetting', 'visual_confusion', 'semantic_confusion'] as const)
        : cause;
    }
    observations.push({
      id: `${seed}-${env}-${caseIndex}-${i}`,
      day: i * 1.4,
      mode,
      outcome: success ? 'correct' : 'missed',
      cause: observedCause,
      visualSimilarity: cause === 'visual_confusion' ? 0.72 + rng.next() * 0.25 : 0.08 + rng.next() * 0.25,
      semanticSimilarity: cause === 'semantic_confusion' ? 0.72 + rng.next() * 0.25 : 0.08 + rng.next() * 0.25,
      cueHelped: mode === 'cued' && success
    });
  }
  const recall: Record<Exclude<CognitiveCause, 'unknown'>, number> = {
    knowledge_gap: 0.31, forgetting: 0.34, visual_confusion: 0.83, semantic_confusion: 0.81, none: 0.90
  };
  return {
    input: { nowDay: 18, targetId: `knowledge-${caseIndex}`, sourceRevision: 'rev-1', estimatedReplacementCost: env === 'forgetting-heavy' ? 0.48 : 0.24, observations },
    truth: { cause, unaidedRecall: recall[cause], idealAction: actionFor(cause) }
  };
}

function summarize(cases: EvaluationCase[], genome: import('../src/cognition/types.ts').Genome, budget: number) {
  let action = 0, brier = 0, safety = 0, consumed = 0;
  for (const item of cases) {
    const result = runCognition(item.input, genome, budget);
    const actual = result.state.proposal?.action ?? 'no_action';
    action += actual === item.truth.idealAction ? 1 : actual === 'no_action' && item.truth.idealAction !== 'no_action' ? 0.35 : 0;
    brier += ((result.state.forecast?.unaidedRecall ?? 0.5) - item.truth.unaidedRecall) ** 2;
    safety += result.state.validation?.passed === true ? 1 : 0;
    consumed += result.budget.consumed;
  }
  const n = Math.max(1, cases.length);
  return { episodes: n, actionScore: action / n, forecastBrier: brier / n, safetyRate: safety / n, meanInferenceUnits: consumed / n };
}

async function main() {
  const train: EvaluationCase[] = [];
  // 10 training cases per environment, generated from seeds disjoint from the holdout set.
  for (let e = 0; e < environments.length; e++) for (let i = 0; i < 10; i++) {
    train.push(makeEvaluationCase(61001 + i * 31, environments[e]!, i));
  }
  const inferenceBudget = 40;
  const searches = runEqualBudgetSearch(train, 20261118, inferenceBudget);
  const baselineGenome = canonicalGenome();
  const heldout: Record<Environment, EvaluationCase[]> = Object.fromEntries(environments.map(env => [env, []])) as unknown as Record<Environment, EvaluationCase[]>;
  const heldoutBySeed: Array<{ seed: number; byEnvironment: Record<Environment, EvaluationCase[]> }> = [];
  // 32 independent seeds x 10 cases per environment = 1,920 held-out episodes per strategy.
  for (let seed = 0; seed < 32; seed++) {
    const byEnvironment = Object.fromEntries(environments.map(env => [env, []])) as unknown as Record<Environment, EvaluationCase[]>;
    for (const env of environments) for (let c = 0; c < 10; c++) {
      const item = makeEvaluationCase(900000 + seed * 101 + c, env, c);
      heldout[env].push(item); byEnvironment[env].push(item);
    }
    heldoutBySeed.push({ seed, byEnvironment });
  }
  const strategies = [
    ...searches,
    { strategy: 'untuned-static-reference' as const, genome: baselineGenome, metrics: scoreGenome(baselineGenome, train, inferenceBudget), searchBudget: { allocated: 0, consumed: 0, candidateEvaluations: 0, trainingCasesPerCandidate: train.length, perCandidateReservation: 0 } }
  ];
  const report = strategies.map(strategy => ({
    strategy: strategy.strategy,
    genomeId: strategy.genome.id,
    selectedGenes: strategy.genome.nodes.map(n => ({ role: n.nodeId, geneId: n.geneId, params: n.params })),
    searchBudget: strategy.searchBudget,
    trainingMetrics: strategy.metrics,
    heldout: Object.fromEntries(environments.map(env => [env, summarize(heldout[env], strategy.genome, inferenceBudget)])),
    aggregate: summarize(environments.flatMap(env => heldout[env]), strategy.genome, inferenceBudget),
    perSeed: heldoutBySeed.map(batch => ({ seed: batch.seed, aggregate: summarize(environments.flatMap(env => batch.byEnvironment[env]), strategy.genome, inferenceBudget), byEnvironment: Object.fromEntries(environments.map(env => [env, summarize(batch.byEnvironment[env], strategy.genome, inferenceBudget)])) })),
    inferenceBudgetPerEpisode: inferenceBudget,
    heldoutEpisodes: environments.reduce((s, env) => s + heldout[env].length, 0)
  }));
  const paired = (a: number[], b: number[]) => {
    const diffs = a.map((x, i) => x - b[i]!);
    const m = diffs.reduce((s, x) => s + x, 0) / Math.max(1, diffs.length);
    const variance = diffs.length > 1 ? diffs.reduce((s, x) => s + (x - m) ** 2, 0) / (diffs.length - 1) : 0;
    const half = 1.96 * Math.sqrt(variance / Math.max(1, diffs.length));
    return { n: diffs.length, meanDifference: m, ci95: [m - half, m + half] };
  };
  const findStrategy = (name: string) => report.find(r => r.strategy === name)!;
  const fixedSeeds = findStrategy('fixed-heuristic').perSeed;
  const pairedComparisons = ['static-modular', 'evolved-modular'].map(name => {
    const current = findStrategy(name).perSeed;
    return {
      comparison: `${name} minus fixed-heuristic`,
      aggregate: {
        actionScore: paired(current.map(x => x.aggregate.actionScore), fixedSeeds.map(x => x.aggregate.actionScore)),
        forecastBrier: paired(current.map(x => x.aggregate.forecastBrier), fixedSeeds.map(x => x.aggregate.forecastBrier)),
        meanInferenceUnits: paired(current.map(x => x.aggregate.meanInferenceUnits), fixedSeeds.map(x => x.aggregate.meanInferenceUnits))
      },
      byEnvironment: Object.fromEntries(environments.map(env => [env, {
        actionScore: paired(current.map(x => x.byEnvironment[env].actionScore), fixedSeeds.map(x => x.byEnvironment[env].actionScore)),
        forecastBrier: paired(current.map(x => x.byEnvironment[env].forecastBrier), fixedSeeds.map(x => x.byEnvironment[env].forecastBrier))
      }]))
    };
  });
  const output = {
    title: 'Memory Palace OS V0.6 equal-compute-budget architecture experiment',
    generatedAt: new Date().toISOString(),
    protocol: {
      trainingSeeds: '61001 + 31*i, i=0..9 (per environment)', trainingCases: 60, heldoutSeedCount: 32, environments,
      casesPerEnvironment: 320, heldoutEpisodesPerStrategy: 1920,
      candidatesPerSearch: 40, searchBudgetUnitsPerStrategy: searches[0]!.searchBudget.allocated,
      inferenceBudgetUnitsPerEpisode: inferenceBudget,
      budgetDefinition: 'Equal reserved deterministic compute units: one architecture-search unit per candidate plus the full per-case inference budget reserved for each training case. Inference uses an identical per-episode cap; actual consumed units are reported separately.',
      limitations: ['Synthetic learner and labelled-cause simulator only; not human memory evidence.', 'Search budget units are deterministic accounting units, not CPU seconds or energy.', 'The untuned reference is reported for context and is not part of the equal-search-budget comparison.']
    },
    results: report,
    pairedComparisons
  };
  const dir = new URL('../verification/', import.meta.url);
  await mkdir(dir, { recursive: true });
  await writeFile(new URL('v06-equal-budget.json', dir), JSON.stringify(output, null, 2));
  const lines = [
    '# V0.6 Equal-Compute-Budget Experiment', '',
    `Generated: ${output.generatedAt}`, '',
    `Search budget per tuned strategy: ${searches[0]!.searchBudget.allocated} deterministic units (${train.length} train cases x 40 candidates x ${inferenceBudget} reserved inference units, plus one architecture unit per candidate).`,
    `Inference budget: ${inferenceBudget} units per held-out episode.`,
    `Held-out episodes per strategy: 1,920.`, '',
    '| Strategy | Action score | Forecast Brier ↓ | Safety | Mean inference units | Efficiency |',
    '|---|---:|---:|---:|---:|---:|',
    ...report.map(r => `| ${r.strategy} | ${r.aggregate.actionScore.toFixed(4)} | ${r.aggregate.forecastBrier.toFixed(4)} | ${r.aggregate.safetyRate.toFixed(4)} | ${r.aggregate.meanInferenceUnits.toFixed(2)} | ${(1-r.aggregate.meanInferenceUnits/inferenceBudget).toFixed(3)} |`),
    '', '## Environment breakdown', ''
  ];
  for (const env of environments) {
    lines.push(`### ${env}`, '', '| Strategy | Action score | Brier ↓ | Safety | Mean units |', '|---|---:|---:|---:|---:|');
    for (const r of report) {
      const x = (r.heldout as Record<string, ReturnType<typeof summarize>>)[env]!;
      lines.push(`| ${r.strategy} | ${x.actionScore.toFixed(4)} | ${x.forecastBrier.toFixed(4)} | ${x.safetyRate.toFixed(4)} | ${x.meanInferenceUnits.toFixed(2)} |`);
    }
    lines.push('');
  }
  lines.push('## Interpretation', '', 'These are synthetic benchmark results, not a study of human memory. Compare strategies using the held-out scenarios and report the environment breakdown; do not infer universal superiority from the aggregate alone.', '');
  lines.push('## Paired seed-level comparisons vs fixed heuristic', '', 'Positive action-score difference is better; negative Brier difference is better. Confidence intervals use a normal approximation over 32 paired seeds.', '');
  for (const comparison of pairedComparisons) {
    const a = comparison.aggregate.actionScore; const b = comparison.aggregate.forecastBrier;
    lines.push(`### ${comparison.comparison}`, '', `- Action score difference: ${a.meanDifference.toFixed(4)} (95% CI ${a.ci95[0].toFixed(4)} to ${a.ci95[1].toFixed(4)}; n=${a.n})`, `- Forecast Brier difference: ${b.meanDifference.toFixed(4)} (95% CI ${b.ci95[0].toFixed(4)} to ${b.ci95[1].toFixed(4)}; n=${b.n})`, '');
  }
  await writeFile(new URL('v06-equal-budget-report.md', dir), lines.join('\n'));
  const csv = ['strategy,seed,environment,episodes,action_score,forecast_brier,safety_rate,mean_inference_units', ...report.flatMap(r => r.perSeed.flatMap(seed => environments.map(env => { const x = seed.byEnvironment[env]; return `${r.strategy},${seed.seed},${env},${x.episodes},${x.actionScore},${x.forecastBrier},${x.safetyRate},${x.meanInferenceUnits}`; })))].join('\n');
  await writeFile(new URL('v06-seed-results.csv', dir), csv + '\n');
  console.log(lines.join('\n'));
}
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch(error => { console.error(error); process.exitCode = 1; });
}
