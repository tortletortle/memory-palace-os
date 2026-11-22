import test from 'node:test';
import assert from 'node:assert/strict';
import { buildGenome, canonicalGenome, capabilityDependencies, topologicalCapabilities, validateGenome } from '../src/cognition/graph.ts';
import { skillGeneLibrary } from '../src/cognition/registry.ts';
import { runCognition, validateCognitionInput } from '../src/cognition/runtime.ts';
import { mutateGenomeForTest, runEqualBudgetSearch, SeededRandom } from '../src/cognition/evolution.ts';
import type { CognitionInput, Genome } from '../src/cognition/types.ts';
import { makeEvaluationCase } from '../eval/v06-budget.ts';

const input: CognitionInput = {
  nowDay: 20, targetId: 'poisson-001', sourceRevision: 'rev-7', estimatedReplacementCost: 0.15,
  observations: Array.from({ length: 12 }, (_, i) => ({
    id: `obs-${i}`, day: i + 1, mode: i % 2 ? 'cued' as const : 'unaided' as const,
    outcome: i % 3 ? 'missed' as const : 'correct' as const,
    cause: i % 3 ? 'visual_confusion' as const : 'none' as const,
    visualSimilarity: i % 3 ? 0.9 : 0.1, semanticSimilarity: 0.1
  }))
};

test('skill gene library has unique ids, positive costs and deterministic handlers', () => {
  assert.equal(new Set(skillGeneLibrary.map(g => g.id)).size, skillGeneLibrary.length);
  for (const gene of skillGeneLibrary) {
    assert.equal(gene.deterministic, true);
    assert.ok(gene.cost.base > 0);
    assert.ok(gene.cost.perObservation >= 0);
  }
});

test('capability dependency graph is acyclic and complete', () => {
  const order = topologicalCapabilities();
  assert.equal(order.length, capabilityDependencies.length);
  assert.ok(order.indexOf('normalized_evidence') > order.indexOf('raw_observations'));
  assert.ok(order.indexOf('validated_proposal') > order.indexOf('intervention_proposal'));
});

test('canonical genome validates and compiles into a dependency-respecting DAG', () => {
  const genome = canonicalGenome();
  const result = validateGenome(genome);
  assert.equal(result.valid, true, result.errors.join('; '));
  assert.equal(result.order.length, genome.nodes.length);
  assert.ok(result.capabilities.includes('validated_proposal'));
});

test('genome validator fails closed on malformed JSON structures', () => {
  assert.equal(validateGenome(null as unknown as Genome).valid, false);
  assert.equal(validateGenome({ id: 'bad', generation: 0, nodes: [null], edges: [] } as unknown as Genome).valid, false);
  assert.equal(validateGenome({ id: 'bad', generation: 0, nodes: [], edges: [null] } as unknown as Genome).valid, false);
});

test('genome rejects unsupported or out-of-range strategy parameters', () => {
  const bad = canonicalGenome();
  bad.nodes.find(n => n.nodeId === 'decide')!.params.utilityThreshold = 9;
  assert.equal(validateGenome(bad).valid, false);
  const extra = canonicalGenome();
  extra.nodes.find(n => n.nodeId === 'diagnose')!.params.shell = 'rm -rf';
  assert.equal(validateGenome(extra).valid, false);
});

test('genome rejects missing capability dependencies and cycles', () => {
  const incomplete: Genome = { id: 'bad', generation: 0, nodes: [{ nodeId: 'decide', geneId: 'decision-risk-sensitive', enabled: true, params: {} }], edges: [] };
  assert.equal(validateGenome(incomplete).valid, false);
  const cycle = canonicalGenome();
  cycle.edges.push({ from: 'verify', to: 'observe' });
  assert.equal(validateGenome(cycle).valid, false);
});

test('runtime obeys exact inference budget and does not mutate source revision', () => {
  const genome = canonicalGenome();
  const result = runCognition(input, genome, 40);
  assert.equal(result.validGenome, true);
  assert.ok(result.budget.consumed <= 40);
  assert.equal(result.budget.allocated, 40);
  assert.equal(result.state.proposal?.sourceRevision, 'rev-7');
  assert.equal(result.state.proposal?.requiresUserConfirmation, true);
});

test('runtime safely skips downstream modules when budget is insufficient', () => {
  const result = runCognition(input, canonicalGenome(), 2);
  assert.ok(result.budget.consumed <= 2);
  assert.ok(result.trace.some(t => t.status === 'skipped_budget'));
  assert.equal(result.state.validation, undefined);
});

test('input validation fails closed on malformed payloads', () => {
  assert.ok(validateCognitionInput(null as unknown as CognitionInput).length > 0);
  assert.ok(validateCognitionInput({ ...input, observations: 'bad' } as unknown as CognitionInput).length > 0);
  assert.ok(validateCognitionInput({ ...input, observations: [null] } as unknown as CognitionInput).length > 0);
});

test('input validation rejects duplicate observation identifiers', () => {
  const duplicate = { ...input, observations: [input.observations[0]!, input.observations[0]!] };
  assert.ok(validateCognitionInput(duplicate).some(e => e.includes('duplicate observation')));
});

test('input validation rejects out-of-range similarity and future observations', () => {
  const bad = { ...input, observations: [{ id: 'bad', day: 21, mode: 'cued', outcome: 'missed', visualSimilarity: 1.4 }] } as unknown as CognitionInput;
  assert.ok(validateCognitionInput(bad).length >= 1);
});

test('mutation preserves valid typed architecture', () => {
  const mutant = mutateGenomeForTest(canonicalGenome(), 55);
  assert.equal(validateGenome(mutant).valid, true);
  assert.ok(mutant.metadata?.parentIds?.includes('static-modular-v06'));
});

test('equal-budget search charges all strategies the same reservation', () => {
  const envs = ['balanced', 'visual-heavy', 'semantic-heavy', 'knowledge-gap', 'forgetting-heavy', 'ambiguous-drift'] as const;
  const train = Array.from({ length: 60 }, (_, i) => makeEvaluationCase(61001 + (i % 10) * 31, envs[Math.floor(i / 10)]!, i % 10));
  const results = runEqualBudgetSearch(train, 99, 32);
  assert.equal(results.length, 3);
  assert.equal(new Set(results.map(r => r.searchBudget.allocated)).size, 1);
  for (const r of results) {
    assert.equal(r.searchBudget.candidateEvaluations, 40);
    assert.equal(r.searchBudget.trainingCasesPerCandidate, 60);
    assert.equal(r.searchBudget.perCandidateReservation, 1 + 60 * 32);
    assert.equal(r.searchBudget.consumed, r.searchBudget.allocated);
    assert.equal(validateGenome(r.genome).valid, true);
  }
});

test('seeded random generator is reproducible', () => {
  const a = new SeededRandom(123), b = new SeededRandom(123);
  assert.deepEqual(Array.from({ length: 8 }, () => a.next()), Array.from({ length: 8 }, () => b.next()));
});

test('cognition API exposes skill catalog and executes a validated genome over HTTP', async () => {
  const { api } = await import('../src/server.ts');
  const { Engine } = await import('../src/service.ts');
  const { Store } = await import('../src/store.ts');
  const { OfflineModel } = await import('../src/model.ts');
  const { mkdtemp, rm } = await import('node:fs/promises');
  const { tmpdir } = await import('node:os');
  const { join } = await import('node:path');
  const dir = await mkdtemp(join(tmpdir(), 'mp-cognition-api-'));
  const server = api(new Engine(new Store(join(dir, 'state.json')), new OfflineModel()));
  try {
    await new Promise<void>(resolve => server.listen(0, '127.0.0.1', resolve));
    const address = server.address();
    assert.ok(address && typeof address === 'object');
    const base = `http://127.0.0.1:${address.port}`;
    const capabilities = await fetch(`${base}/api/cognition/capabilities`);
    assert.equal(capabilities.status, 200);
    const defaultGenome = await fetch(`${base}/api/cognition/default-genome`);
    assert.equal(defaultGenome.status, 200);
    const defaultBody = await defaultGenome.json() as Genome;
    assert.equal(validateGenome(defaultBody).valid, true);
    const genes = await fetch(`${base}/api/cognition/genes`);
    assert.equal(genes.status, 200);
    assert.ok((await genes.json() as unknown[]).length >= 10);
    const composed = await fetch(`${base}/api/cognition/compose`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ geneIds: canonicalGenome().nodes.map(n => n.geneId) }) });
    assert.equal(composed.status, 201);
    const composedGenome = await composed.json() as Genome;
    assert.equal(validateGenome(composedGenome).valid, true);
    const validation = await fetch(`${base}/api/cognition/validate-genome`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ genome: canonicalGenome() }) });
    assert.equal(validation.status, 200);
    const run = await fetch(`${base}/api/cognition/run`, {
      method: 'POST', headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ input, budgetUnits: 40 })
    });
    assert.equal(run.status, 200);
    const result = await run.json() as { validGenome: boolean; budget: { consumed: number; allocated: number }; state: { validation?: { passed: boolean } } };
    assert.equal(result.validGenome, true);
    assert.ok(result.budget.consumed <= result.budget.allocated);
    assert.equal(result.state.validation?.passed, true);
  } finally {
    await new Promise<void>(resolve => server.close(() => resolve()));
    await rm(dir, { recursive: true, force: true });
  }
});
