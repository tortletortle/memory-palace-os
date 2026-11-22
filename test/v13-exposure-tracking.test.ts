import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { buildPalaceLearningReport } from '../src/spatial/palace-learning.ts';
import type { PalaceExposure, PalaceRecall, PalaceScene } from '../src/store.ts';
import { api } from '../src/server.ts';
import { Engine } from '../src/service.ts';
import { Store } from '../src/store.ts';
import { OfflineModel } from '../src/model.ts';

const base = Date.parse('2026-01-01T00:00:00.000Z');
const at = (days: number) => new Date(base + days * 86400000).toISOString();
const palace: PalaceScene = {
  id: 'palace-v13', title: 'V1.3 Exposure Test', domain: 'probability', createdAt: at(0), updatedAt: at(0),
  objects: [
    { id: 'o1', conceptId: 'c1', label: '随机变量', kind: 'concept', evidenceQuote: '随机变量', metaphor: '地标', x: 0, z: 0, color: '#9ebd80' },
    { id: 'o2', conceptId: 'c2', label: '概率质量函数', kind: 'formula', evidenceQuote: '概率质量函数', metaphor: '公式装置', x: 1, z: 0, color: '#a99aff' },
  ],
};

function recall(overrides: Partial<PalaceRecall> & Pick<PalaceRecall, 'conceptId' | 'mode' | 'grade'>): PalaceRecall {
  return { id: 'r-default', palaceId: palace.id, sessionId: 's1', createdAt: at(5), revealed: true, ...overrides };
}
function exposure(overrides: Partial<PalaceExposure> & Pick<PalaceExposure, 'conceptId' | 'startedAt' | 'durationMs'>): PalaceExposure {
  return { id: 'x-default', palaceId: palace.id, sessionId: 's1', createdAt: at(3) , surface: 'inspector', ...overrides };
}

test('V1.3 uses observed per-concept exposure instead of palace creation time', () => {
  const exposures = [
    exposure({ id: 'x1', conceptId: 'c1', startedAt: at(3), durationMs: 2000 }),
    exposure({ id: 'x2', conceptId: 'c1', startedAt: at(4), durationMs: 4000 }),
  ];
  const recalls = [
    recall({ id: 'r1', conceptId: 'c1', mode: 'cued', grade: 'correct', startedAt: at(5), responseMs: 1000, confidence: 5 }),
    recall({ id: 'r2', conceptId: 'c1', mode: 'unaided', grade: 'missed', startedAt: at(6), createdAt: at(6), responseMs: 3000, confidence: 1 }),
  ];
  const report = buildPalaceLearningReport(palace, recalls, base + 10 * 86400000, exposures);
  const item = report.items.find(row => row.conceptId === 'c1')!;
  assert.equal(item.firstExposureAt, at(3));
  assert.equal(item.firstExposureSource, 'inspector_view');
  assert.equal(item.exposure.inspectorViews, 2);
  assert.equal(item.exposure.totalDwellMs, 6000);
  assert.equal(item.exposure.medianDwellMs, 3000);
  assert.equal(item.responseTime.medianMs, 2000);
  assert.equal(item.confidence.count, 2);
  assert.equal(item.confidence.brierScore, 0.01);
  assert.equal(report.evidence.observedExposureConcepts, 1);
  assert.equal(report.evidence.legacyProxyConcepts, 1);
  assert.equal(report.evidence.totalInspectorViewMs, 6000);
  assert.equal(item.observations.cued, 1);
  assert.equal(item.observations.unaided, 1);
  assert.equal(report.version, '1.3.0');
});

test('V1.3 uses recall-task start as an instrumented first interaction when no inspector view exists', () => {
  const report = buildPalaceLearningReport(palace, [recall({ conceptId: 'c1', mode: 'unaided', grade: 'correct', startedAt: at(2), createdAt: at(2.01) })], base + 7 * 86400000);
  const item = report.items.find(row => row.conceptId === 'c1')!;
  assert.equal(item.firstExposureAt, at(2));
  assert.equal(item.firstExposureSource, 'recall_task_start');
  assert.equal(report.evidence.observedExposureConcepts, 1);
});

test('V1.3 marks V1.2 legacy records as creation-time proxies', () => {
  const report = buildPalaceLearningReport(palace, [recall({ conceptId: 'c1', mode: 'cued', grade: 'correct' })], base + 7 * 86400000);
  const item = report.items.find(row => row.conceptId === 'c1')!;
  assert.equal(item.firstExposureAt, palace.createdAt);
  assert.equal(item.firstExposureSource, 'palace_creation_proxy');
  assert.equal(report.evidence.observedExposureConcepts, 0);
  assert.equal(report.evidence.legacyProxyConcepts, 2);
  assert.equal(report.evidence.exposureEventCount, 0);
});

test('V1.3 exposure API validates, persists, deduplicates and exports events', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'mp-v13-api-'));
  const store = new Store(join(dir, 'state.json'));
  const server = api(new Engine(store, new OfflineModel()));
  try {
    await new Promise<void>(resolve => server.listen(0, '127.0.0.1', resolve));
    const address = server.address(); assert.ok(address && typeof address === 'object');
    const baseUrl = `http://127.0.0.1:${address.port}`;
    const created = await fetch(baseUrl + '/api/palaces', {
      method: 'POST', headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ title: 'Exposure API', domain: 'probability', objects: [
        { id: 'o1', conceptId: 'c1', label: '随机变量', kind: 'concept', evidenceQuote: '随机变量' },
        { id: 'o2', conceptId: 'c2', label: '概率质量函数', kind: 'formula', evidenceQuote: '概率质量函数' },
      ] }),
    });
    assert.equal(created.status, 201);
    const saved: any = await created.json();
    const startedAt = new Date(Date.now() - 5000).toISOString();
    const payload = { eventId: 'stable-event-1', conceptId: 'c1', sessionId: '=SUM(1,1)', startedAt, durationMs: 5000 };
    const first = await fetch(`${baseUrl}/api/palaces/${saved.id}/exposures`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(payload) });
    assert.equal(first.status, 201);
    const event: any = await first.json();
    assert.equal(event.surface, 'inspector');
    const duplicate = await fetch(`${baseUrl}/api/palaces/${saved.id}/exposures`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(payload) });
    assert.equal(duplicate.status, 201);
    assert.equal((await duplicate.json()).id, 'stable-event-1');
    const invalidDuration = await fetch(`${baseUrl}/api/palaces/${saved.id}/exposures`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ ...payload, eventId: 'bad-duration', durationMs: 500 }) });
    assert.equal(invalidDuration.status, 422);
    const invalidConcept = await fetch(`${baseUrl}/api/palaces/${saved.id}/exposures`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ ...payload, eventId: 'bad-concept', conceptId: 'missing' }) });
    assert.equal(invalidConcept.status, 422);
    const conflictingDuplicate = await fetch(`${baseUrl}/api/palaces/${saved.id}/exposures`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ ...payload, durationMs: 6000 }) });
    assert.equal(conflictingDuplicate.status, 409);
    const recallResponse = await fetch(`${baseUrl}/api/palaces/${saved.id}/recalls`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ conceptId: 'c1', mode: 'cued', grade: 'correct', revealed: true, startedAt: new Date(Date.now() - 4000).toISOString(), responseMs: 4000, confidence: 4 }) });
    assert.equal(recallResponse.status, 201);
    const reportResponse = await fetch(`${baseUrl}/api/palaces/${saved.id}/learning`);
    assert.equal(reportResponse.status, 200);
    const report: any = await reportResponse.json();
    assert.equal(report.version, '1.3.0');
    assert.equal(report.evidence.exposureEventCount, 1);
    assert.equal(report.evidence.observedExposureConcepts, 1);
    const exportResponse = await fetch(`${baseUrl}/api/palaces/${saved.id}/learning/export`);
    assert.equal(exportResponse.status, 200);
    assert.match(exportResponse.headers.get('content-type') || '', /text\/csv/);
    const csv = await exportResponse.text();
    assert.match(csv, /eventType,eventId,palaceId/);
    assert.match(csv, /exposure,stable-event-1/);
    assert.match(csv, /'=SUM\(1,1\)/);
    assert.match(csv, /recall,/);
    const persisted = await new Store(join(dir, 'state.json')).read();
    assert.equal(persisted.palaceExposures?.length, 1);
    assert.equal(persisted.palaceRecalls?.length, 1);
  } finally {
    await new Promise<void>(resolve => server.close(() => resolve()));
    await rm(dir, { recursive: true, force: true });
  }
});
