import test from 'node:test';
import assert from 'node:assert/strict';
import { transferSkillLibrary, getTransferGene } from '../src/cognition/transfer-library.ts';
import { buildSkillDependencyGraph, createTransferGenome, defaultTransferGenome, validateTransferGenome } from '../src/cognition/transfer-graph.ts';
import { geneActivation, selectTransferSkills, evaluateTransferTask } from '../src/cognition/transfer-engine.ts';
import { mutateTransferGenomeForTest, runEqualBudgetTransferSearch } from '../src/cognition/transfer-evolution.ts';
import { buildHoldout, buildTraining, topPair } from '../eval/v07-transfer.ts';
import type { FeatureVector, TransferGenome, TransferTask } from '../src/cognition/transfer-types.ts';

const baseFeatures: FeatureVector = {
  spatial: 0.1, symbolic: 0.9, causal: 0.85, sequential: 0.2, hierarchical: 0.7,
  contrastive: 0.1, analogical: 0.1, dynamic: 0.85, retrieval: 0.3, semantic: 0.1
};
const task: TransferTask = {
  id: 't1', domain: 'digital_logic', features: baseFeatures, difficulty: 0.3,
  hidden: { skillUtility: Object.fromEntries(transferSkillLibrary.map(g => [g.id, 0.5])), synergyPairs: ['causal-chain+mechanism-simulation'] },
  split: 'target_domain_holdout'
};

test('transfer skill library has unique versioned genes and bounded transferability', () => {
  assert.ok(transferSkillLibrary.length >= 12);
  assert.equal(new Set(transferSkillLibrary.map(g => g.id)).size, transferSkillLibrary.length);
  for (const gene of transferSkillLibrary) {
    assert.ok(gene.version >= 1);
    assert.ok(gene.transferability > 0 && gene.transferability <= 1);
    assert.ok(gene.costUnits > 0);
    assert.equal(gene.evidenceLevel, 'designed');
  }
});

test('dependency graph is a DAG and dependency closure adds prerequisites', () => {
  const genome = createTransferGenome('deps', ['mechanism-simulation', 'interleaved-retrieval']);
  assert.ok(genome.geneIds.includes('atom-chunking'));
  assert.ok(genome.geneIds.includes('causal-chain'));
  assert.ok(genome.geneIds.includes('retrieval-cue'));
  assert.ok(genome.geneIds.includes('contrastive-pair'));
  const graph = buildSkillDependencyGraph(genome.geneIds);
  assert.equal(graph.valid, true, graph.errors.join('; '));
  assert.equal(graph.topologicalOrder.length, graph.nodes.length);
  assert.ok(graph.topologicalOrder.indexOf('causal-chain') < graph.topologicalOrder.indexOf('mechanism-simulation'));
});

test('validator rejects missing root, unknown genes and missing dependencies', () => {
  const noRoot: TransferGenome = { id: 'bad', generation: 0, geneIds: ['symbol-anchor'], activationThreshold: 0.2, maxActiveGenes: 3, synergyPairs: [] };
  assert.equal(validateTransferGenome(noRoot).valid, false);
  const unknown = createTransferGenome('unknown-base', ['spatial-route']);
  unknown.geneIds.push('not-a-real-gene');
  assert.equal(validateTransferGenome(unknown).valid, false);
  const missingDependency: TransferGenome = { id: 'bad-dep', generation: 0, geneIds: ['atom-chunking', 'mechanism-simulation'], activationThreshold: 0.2, maxActiveGenes: 3, synergyPairs: [] };
  assert.equal(validateTransferGenome(missingDependency).valid, false);
});

test('gene activation transfers by feature affinity with only a small source-domain prior', () => {
  const logic = geneActivation(baseFeatures, 'digital_logic', 'symbol-anchor');
  const language = geneActivation(baseFeatures, 'language', 'symbol-anchor');
  assert.ok(logic > language);
  assert.ok(logic - language < 0.06);
});

test('selector does not inspect hidden evaluator labels and respects compute budget', () => {
  const genome = defaultTransferGenome();
  const first = selectTransferSkills(task, genome, 14);
  const changedTruth = { ...task, hidden: { skillUtility: {}, synergyPairs: [] } };
  const second = selectTransferSkills(changedTruth, genome, 14);
  assert.deepEqual(first.activeGenes.map(g => g.geneId), second.activeGenes.map(g => g.geneId));
  assert.ok(first.totalCostUnits <= 14);
  assert.equal(first.budgetRespected, true);
  assert.equal(first.dependencyGraph.valid, true);
});

test('mechanism skill pulls in causal dependency and composed pair can be evaluated', () => {
  const genome = createTransferGenome('mechanism', ['mechanism-simulation'], { activationThreshold: 0.1, synergyPairs: ['causal-chain+mechanism-simulation'] });
  const result = evaluateTransferTask(task, genome, 18);
  assert.ok(result.selection.activeGenes.some(g => g.geneId === 'causal-chain'));
  assert.ok(result.selection.activeGenes.some(g => g.geneId === 'mechanism-simulation'));
  assert.ok(result.reward >= 0 && result.reward <= 1);
});

test('mutation preserves dependency closure and can evolve versioned gene alleles', () => {
  const parent = defaultTransferGenome();
  const child = mutateTransferGenomeForTest(parent, 1456);
  assert.equal(validateTransferGenome(child).valid, true);
  assert.ok(child.generation > parent.generation);
  assert.ok(child.metadata?.parentIds?.includes(parent.id));
  assert.ok((child.alleles?.length ?? 0) >= 1);
  assert.ok(child.alleles!.every(a => a.version > a.parentVersion));
});

test('equal-compute search evaluates 40 candidates per arm with identical reservation', () => {
  const training = buildTraining(310001);
  const results = runEqualBudgetTransferSearch(training, 77, 18);
  assert.deepEqual(results.map(r => r.strategy), ['fixed-heuristic', 'static-modular', 'evolved-modular', 'evolved-no-allele']);
  assert.equal(new Set(results.map(r => r.searchBudget.allocated)).size, 1);
  for (const result of results) {
    assert.equal(result.searchBudget.candidateEvaluations, 40);
    assert.equal(result.searchBudget.trainingCases, training.length);
    assert.equal(result.searchBudget.consumed, result.searchBudget.allocated);
    assert.equal(validateTransferGenome(result.genome).valid, true);
  }
  const evolved = results.find(r => r.strategy === 'evolved-modular')!;
  const noAllele = results.find(r => r.strategy === 'evolved-no-allele')!;
  assert.ok((evolved.evolutionAudit?.candidatesWithAlleles ?? 0) > 0);
  assert.equal(noAllele.evolutionAudit?.candidatesWithAlleles, 0);
});

test('independent benchmark has no target-domain or held-out-pair leakage in training', () => {
  const training = buildTraining(310123);
  const holdout = buildHoldout(910123);
  assert.ok(training.every(t => ['probability', 'programming', 'history'].includes(t.domain)));
  assert.ok(holdout.targetDomain.every(t => ['digital_logic', 'language', 'biology'].includes(t.domain)));
  assert.ok(training.every(t => !['causal+symbolic', 'analogical+retrieval', 'hierarchical+spatial', 'contrastive+sequential'].includes(topPair(t.features))));
  assert.ok(holdout.composition.every(t => t.split === 'composition_holdout' && typeof t.heldOutPair === 'string' && topPair(t.features) === t.heldOutPair));
});

test('transfer policy uses public features only, not the evaluator-only hidden skill utilities', () => {
  const genome = defaultTransferGenome();
  const a = selectTransferSkills(task, genome, 18);
  const b = selectTransferSkills({ ...task, hidden: { skillUtility: { 'spatial-route': 100 }, synergyPairs: ['spatial-route+retrieval-cue'] } }, genome, 18);
  assert.deepEqual(a.activeGenes.map(x => x.geneId), b.activeGenes.map(x => x.geneId));
});


test('transfer HTTP API exposes skill catalog and feature-only selection', async () => {
  const { api } = await import('../src/server.ts');
  const { Engine } = await import('../src/service.ts');
  const { Store } = await import('../src/store.ts');
  const { OfflineModel } = await import('../src/model.ts');
  const { mkdtemp, rm } = await import('node:fs/promises');
  const { tmpdir } = await import('node:os');
  const { join } = await import('node:path');
  const dir = await mkdtemp(join(tmpdir(), 'mp-transfer-api-'));
  const server = api(new Engine(new Store(join(dir, 'state.json')), new OfflineModel()));
  try {
    await new Promise<void>(resolve => server.listen(0, '127.0.0.1', resolve));
    const address = server.address();
    assert.ok(address && typeof address === 'object');
    const base = `http://127.0.0.1:${address.port}`;
    const skills = await fetch(`${base}/api/transfer/skills`);
    assert.equal(skills.status, 200);
    assert.ok((await skills.json() as unknown[]).length >= 12);
    const selected = await fetch(`${base}/api/transfer/select`, {
      method: 'POST', headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ task: { id: 'logic-gate', domain: 'digital_logic', features: baseFeatures }, budgetUnits: 18 })
    });
    assert.equal(selected.status, 200);
    const result = await selected.json() as { budgetRespected: boolean; dependencyGraph: { valid: boolean } };
    assert.equal(result.budgetRespected, true);
    assert.equal(result.dependencyGraph.valid, true);
  } finally {
    await new Promise<void>(resolve => server.close(() => resolve()));
    await rm(dir, { recursive: true, force: true });
  }
});
