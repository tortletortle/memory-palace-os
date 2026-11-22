import test from 'node:test';
import assert from 'node:assert/strict';
import {
  BayesianOnlineChangePointDetector,
  ChannelChangePointBank,
  adaptiveBayesianModelAverage,
  estimateSeparatedForecast
} from '../src/adaptive-model-selection.ts';

test('BOCPD stays quiet on a stable high-success stream', () => {
  const detector = new BayesianOnlineChangePointDetector({ hazard: 1 / 24, threshold: 0.25 });
  let detected = false;
  for (let i = 0; i < 120; i++) detected ||= detector.update(true).detected;
  assert.equal(detected, false);
});

test('BOCPD confirms a sustained downward shift but rejects an isolated miss', () => {
  const isolated = new BayesianOnlineChangePointDetector({ hazard: 1 / 24, threshold: 0.2 });
  for (let i = 0; i < 30; i++) isolated.update(true);
  isolated.update(false);
  isolated.update(true);
  assert.equal(isolated.update(true).detected, false);

  const shifted = new BayesianOnlineChangePointDetector({ hazard: 1 / 24, threshold: 0.2 });
  for (let i = 0; i < 30; i++) shifted.update(true);
  let hit = -1;
  for (let i = 0; i < 8; i++) if (shifted.update(false).detected && hit < 0) hit = i + 1;
  assert.ok(hit > 0 && hit <= 4, `expected confirmation within 4 observations, got ${hit}`);
});

test('adaptive BMA normalizes model weights and emits change diagnostics', () => {
  const observations = Array.from({ length: 36 }, (_, i) => ({
    day: i + 1, mode: 'unaided' as const, grade: i < 24 ? 'correct' as const : 'missed' as const
  }));
  const result = adaptiveBayesianModelAverage(observations, 'unaided', 40);
  const total = result.modelWeights.reduce((s, x) => s + x.weight, 0);
  assert.ok(Math.abs(total - 1) < 1e-9);
  assert.ok(result.probability >= 0 && result.probability <= 1);
  assert.ok(result.maxChangeProbability > 0);
  assert.ok(result.modelWeights.length === 21);
});

test('semantic cued errors do not contaminate the unaided forgetting posterior', () => {
  const base = Array.from({ length: 24 }, (_, i) => ({
    id: `u-${i}`, pairId: `p-${i}`, day: i + 1, mode: 'unaided' as const,
    grade: i % 7 === 0 ? 'missed' as const : 'correct' as const, cause: 'none' as const
  }));
  const cuedClean = Array.from({ length: 24 }, (_, i) => ({
    id: `c-${i}`, pairId: `p-${i}`, day: i + 1, mode: 'cued' as const,
    grade: 'correct' as const, cause: 'none' as const, cueHelped: false
  }));
  const cuedSemantic = cuedClean.map((o, i) => ({ ...o, grade: i % 2 ? 'missed' as const : 'correct' as const, cause: i % 2 ? 'semantic_confusion' as const : 'none' as const }));
  const a = estimateSeparatedForecast([...base, ...cuedClean], 25);
  const b = estimateSeparatedForecast([...base, ...cuedSemantic], 25);
  assert.equal(a.knowledge.probability, b.knowledge.probability);
  assert.ok(b.channels.semanticInterference.mean > a.channels.semanticInterference.mean);
  assert.ok(b.cued.probability < a.cued.probability);
});

test('unlabelled cued misses remain unattributed and reduce identification confidence', () => {
  const observations = Array.from({ length: 12 }, (_, i) => ({
    id: `x-${i}`, day: i + 1, mode: 'cued' as const, grade: 'missed' as const, cause: 'unknown' as const
  }));
  const result = estimateSeparatedForecast(observations, 15);
  assert.equal(result.identification, 'underidentified');
  assert.equal(result.exclusions.unknownCause, 12);
});

test('change-point channels are independent', () => {
  const bank = new ChannelChangePointBank({ hazard: 1 / 24, bayesThreshold: 0.2 });
  for (let i = 0; i < 30; i++) {
    bank.update('knowledge', true);
    bank.update('semantic', true);
  }
  let semanticDetected = false, knowledgeDetected = false;
  for (let i = 0; i < 8; i++) {
    semanticDetected ||= bank.update('semantic', false).detected;
    knowledgeDetected ||= bank.update('knowledge', true).detected;
  }
  assert.equal(semanticDetected, true);
  assert.equal(knowledgeDetected, false);
});
