import test from 'node:test';
import assert from 'node:assert/strict';
import { buildPalaceLearningReport } from '../src/spatial/palace-learning.ts';
import type { PalaceRecall, PalaceScene } from '../src/store.ts';
import { api } from '../src/server.ts';
import { Engine } from '../src/service.ts';
import { Store } from '../src/store.ts';
import { OfflineModel } from '../src/model.ts';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const base = Date.parse('2026-01-01T00:00:00.000Z');
const at = (days: number) => new Date(base + days * 86400000).toISOString();
const palace: PalaceScene = {
  id: 'palace-1', title: '测试宫殿', domain: 'probability', createdAt: at(0), updatedAt: at(0),
  objects: [
    { id: 'o1', conceptId: 'c1', label: '随机变量', kind: 'concept', evidenceQuote: '随机变量', metaphor: '地标', x: 0, z: 0, color: '#9ebd80', roomId: 'room-1' },
    { id: 'o2', conceptId: 'c2', label: '概率质量函数', kind: 'formula', evidenceQuote: '概率质量函数', metaphor: '公式装置', x: 1, z: 0, color: '#a99aff', roomId: 'room-1' },
  ],
};
function event(overrides: Partial<PalaceRecall> & Pick<PalaceRecall, 'conceptId' | 'mode' | 'grade'>): PalaceRecall {
  return {
    id: 'e-default', palaceId: palace.id, sessionId: 'session', createdAt: at(1), revealed: true,
    ...overrides,
  };
}

test('V1.2 keeps cued and unaided recall estimates separate', () => {
  const events: PalaceRecall[] = [];
  for (const day of [1, 2, 3]) {
    events.push(event({ id: `c-${day}`, conceptId: 'c1', mode: 'cued', grade: 'correct', createdAt: at(day) }));
    events.push(event({ id: `u-${day}`, conceptId: 'c1', mode: 'unaided', grade: 'missed', createdAt: at(day + 0.2) }));
  }
  const report = buildPalaceLearningReport(palace, events, base + 10 * 86400000);
  const item = report.items.find(row => row.conceptId === 'c1')!;
  assert.equal(item.observations.cued, 3);
  assert.equal(item.observations.unaided, 3);
  assert.ok(item.memory.cued.estimatedRecall > item.memory.unaided.estimatedRecall);
  assert.equal(item.recommendation.code, 'cue_dependent');
});

test('V1.2 repeated explicit wrong selections produce a pair-inspection proposal, never mutate the palace', () => {
  const before = structuredClone(palace.objects);
  const events = [1, 2].map(day => event({
    id: `x-${day}`, conceptId: 'c1', mode: 'unaided', grade: 'missed', confusedWith: 'c2', createdAt: at(day),
  }));
  const similarPalace = structuredClone(palace);
  similarPalace.objects[1].kind = 'concept';
  similarPalace.objects[1].color = '#9ebd80';
  const report = buildPalaceLearningReport(similarPalace, events, base + 4 * 86400000);
  const item = report.items.find(row => row.conceptId === 'c1')!;
  assert.equal(item.recommendation.code, 'repeated_wrong_selection');
  assert.equal(item.confusion[0].relatedConceptId, 'c2');
  assert.ok(item.confusion[0].visualSimilarity > 0.25);
  assert.deepEqual(palace.objects, before);
  assert.equal(report.recommendations[0].status, 'advisory_only');
});

test('V1.2 does not infer a confusion pair from an unattributed miss', () => {
  const events = [1, 2, 3].map(day => event({
    id: `m-${day}`, conceptId: 'c1', mode: 'cued', grade: 'missed', createdAt: at(day),
  }));
  const report = buildPalaceLearningReport(palace, events, base + 5 * 86400000);
  const item = report.items.find(row => row.conceptId === 'c1')!;
  assert.equal(item.confusion.length, 0);
  assert.notEqual(item.recommendation.code, 'repeated_wrong_selection');
});

test('V1.2 reports sparse evidence honestly and does not invent a review schedule', () => {
  const report = buildPalaceLearningReport(palace, [], base + 2 * 86400000);
  assert.equal(report.evidence.eventCount, 0);
  assert.equal(report.metrics.empiricalAccuracy, null);
  assert.equal(report.metrics.nextReviewAt, null);
  assert.ok(report.items.every(item => item.recommendation.code === 'insufficient_evidence'));
});

test('V1.2 recall API validates, persists, and exposes learning reports', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'mp-v12-api-'));
  const store = new Store(join(dir, 'state.json'));
  const server = api(new Engine(store, new OfflineModel()));
  try {
    await new Promise<void>(resolve => server.listen(0, '127.0.0.1', resolve));
    const address = server.address(); assert.ok(address && typeof address === 'object');
    const baseUrl = `http://127.0.0.1:${address.port}`;
    const created = await fetch(baseUrl + '/api/palaces', {
      method: 'POST', headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ title: '回忆闭环测试', domain: 'probability', objects: [
        { id: 'o1', conceptId: 'c1', label: '随机变量', kind: 'concept', evidenceQuote: '随机变量' },
        { id: 'o2', conceptId: 'c2', label: '概率质量函数', kind: 'formula', evidenceQuote: '概率质量函数' },
      ] }),
    });
    assert.equal(created.status, 201);
    const saved: any = await created.json();
    const recorded = await fetch(`${baseUrl}/api/palaces/${saved.id}/recalls`, {
      method: 'POST', headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ conceptId: 'c1', mode: 'cued', grade: 'missed', revealed: true, sessionId: 'session-1', responseMs: 1800, confusedWith: 'c2' }),
    });
    assert.equal(recorded.status, 201);
    const eventResult: any = await recorded.json();
    assert.equal(eventResult.confusedWith, 'c2');
    const reportResponse = await fetch(`${baseUrl}/api/palaces/${saved.id}/learning`);
    assert.equal(reportResponse.status, 200);
    const report: any = await reportResponse.json();
    assert.equal(report.version, '1.3.0');
    assert.equal(report.evidence.eventCount, 1);
    assert.equal(report.items.find((item: any) => item.conceptId === 'c1').observations.cued, 0);
    assert.equal(report.evidence.independentAttempts, 1);
    assert.equal(report.evidence.modelObservations, 0);
    const invalid = await fetch(`${baseUrl}/api/palaces/${saved.id}/recalls`, {
      method: 'POST', headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ conceptId: 'missing', mode: 'cued', grade: 'correct', revealed: true }),
    });
    assert.equal(invalid.status, 422);
    const invalidPair = await fetch(`${baseUrl}/api/palaces/${saved.id}/recalls`, {
      method: 'POST', headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ conceptId: 'c1', mode: 'cued', grade: 'missed', revealed: true, confusedWith: 'missing' }),
    });
    assert.equal(invalidPair.status, 422);
    const invalidTime = await fetch(`${baseUrl}/api/palaces/${saved.id}/recalls`, {
      method: 'POST', headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ conceptId: 'c1', mode: 'cued', grade: 'correct', revealed: true, responseMs: 600001 }),
    });
    assert.equal(invalidTime.status, 422);
    const invalidConfidence = await fetch(`${baseUrl}/api/palaces/${saved.id}/recalls`, {
      method: 'POST', headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ conceptId: 'c1', mode: 'cued', grade: 'correct', revealed: true, confidence: 6 }),
    });
    assert.equal(invalidConfidence.status, 422);
    const persisted = await new Store(join(dir, 'state.json')).read();
    assert.equal(persisted.palaceRecalls?.length, 1);
  } finally {
    await new Promise<void>(resolve => server.close(() => resolve()));
    await rm(dir, { recursive: true, force: true });
  }
});
