import { DAY, interferenceMatrix, loadFor, visualSimilarity } from '../adaptive.ts';
import { dualMemory } from '../bayesian.ts';
import { marginalMemoryGain } from './marginal-gain.ts';
import type { CueFeature, Trial, Mode } from '../adaptive.ts';
import type { PalaceExposure, PalaceRecall, PalaceScene } from '../store.ts';

const day = (value: string) => Date.parse(value) / DAY;
const clamp = (value: number, min: number, max: number) => Math.max(min, Math.min(max, value));
const GAP_DAYS = 0.05;

type DiagnosticCode = 'insufficient_evidence' | 'repeated_wrong_selection' | 'cue_dependent' | 'knowledge_risk' | 'review_due' | 'monitor';
type Recommendation = { conceptId: string; code: DiagnosticCode; action: string; message: string; relatedConceptId?: string; status: 'advisory_only' };

function independent<T extends { day: number }>(items: T[]): T[] {
  const result: T[] = [];
  for (const item of [...items].sort((a, b) => a.day - b.day)) {
    if (!result.length || item.day - result.at(-1)!.day >= GAP_DAYS) result.push(item);
  }
  return result;
}

function accuracy(items: Trial[]): number | null {
  const scored = items.filter(item => item.grade !== 'uncertain');
  return scored.length ? scored.filter(item => item.grade === 'correct').length / scored.length : null;
}

function median(values: number[]): number | null {
  if (!values.length) return null;
  const sorted = [...values].sort((a, b) => a - b);
  const middle = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[middle] : (sorted[middle - 1] + sorted[middle]) / 2;
}

function percentile(values: number[], q: number): number | null {
  if (!values.length) return null;
  const sorted = [...values].sort((a, b) => a - b);
  return sorted[Math.min(sorted.length - 1, Math.max(0, Math.ceil(q * sorted.length) - 1))];
}

function responseSummary(events: PalaceRecall[]) {
  const values = events.map(event => event.responseMs).filter((value): value is number => Number.isInteger(value) && value! >= 0);
  return { count: values.length, medianMs: median(values), p90Ms: percentile(values, 0.9) };
}

// Confidence 1..5 maps to conservative probabilities 0.1, 0.3, 0.5, 0.7, 0.9.
// This is a descriptive calibration diagnostic only; it is not used by the forgetting model.
function confidenceSummary(events: PalaceRecall[]) {
  const rows = events.filter(event => event.confidence !== undefined && (event.grade === 'correct' || event.grade === 'missed'));
  const bins = [1, 2, 3, 4, 5].map(confidence => {
    const group = rows.filter(event => event.confidence === confidence);
    return {
      confidence,
      predictedProbability: Number(((confidence - 0.5) / 5).toFixed(2)),
      count: group.length,
      observedAccuracy: group.length ? group.filter(event => event.grade === 'correct').length / group.length : null,
    };
  });
  const outcomes = rows.map(event => ({ predicted: ((event.confidence ?? 3) - 0.5) / 5, observed: event.grade === 'correct' ? 1 : 0 }));
  const brier = outcomes.length ? outcomes.reduce((sum, row) => sum + (row.predicted - row.observed) ** 2, 0) / outcomes.length : null;
  return {
    count: rows.length,
    brierScore: brier === null ? null : Number(brier.toFixed(4)),
    meanPredictedProbability: outcomes.length ? Number((outcomes.reduce((sum, row) => sum + row.predicted, 0) / outcomes.length).toFixed(3)) : null,
    observedAccuracy: outcomes.length ? Number((outcomes.reduce((sum, row) => sum + row.observed, 0) / outcomes.length).toFixed(3)) : null,
    bins,
    reliability: rows.length >= 20 ? 'exploratory' : 'sparse',
    interpretation: 'descriptive_only_not_used_for_prediction',
  };
}

function weightedQuantile(values: Array<{ value: number; weight: number }>, q: number) {
  const sorted = [...values].sort((a, b) => a.value - b.value);
  let sum = 0;
  for (const item of sorted) {
    sum += item.weight;
    if (sum >= q) return item.value;
  }
  return sorted.at(-1)?.value ?? 0;
}

function forecastDual(model: ReturnType<typeof dualMemory>, dayValue: number, mode: Mode, load: number) {
  const attenuation = clamp(1 - 0.65 * load, 0.05, 1);
  return model.posterior.reduce((sum, state) => {
    const knowledge = 2 ** (-Math.max(0, dayValue - model.lastKnowledgeExposure) / state.knowledgeHalfLife);
    const visual = 2 ** (-Math.max(0, dayValue - model.lastVisualExposure) / state.visualHalfLife);
    const recall = mode === 'unaided' ? knowledge : knowledge + (1 - knowledge) * visual * attenuation;
    return sum + state.weight * recall;
  }, 0);
}

function dueDay(model: ReturnType<typeof dualMemory>, now: number, mode: Mode, load: number) {
  const current = forecastDual(model, now, mode, load);
  if (current <= 0.8) return now;
  if (forecastDual(model, now + 90, mode, load) > 0.8) return null;
  let low = now, high = now + 90;
  for (let index = 0; index < 28; index++) {
    const middle = (low + high) / 2;
    if (forecastDual(model, middle, mode, load) > 0.8) low = middle;
    else high = middle;
  }
  return (low + high) / 2;
}

function cueFor(object: PalaceScene['objects'][number]): CueFeature {
  return {
    id: object.conceptId,
    meaning: object.label,
    asset: object.kind,
    shape: object.kind,
    color: object.color,
    action: 'static',
    position: [object.x, 0, object.z],
  };
}

function confusionPairs(events: PalaceRecall[], conceptId: string) {
  const grouped = new Map<string, PalaceRecall[]>();
  for (const event of events) {
    if (event.conceptId !== conceptId || event.grade !== 'missed' || !event.confusedWith || event.confusedWith === conceptId) continue;
    const list = grouped.get(event.confusedWith) ?? [];
    list.push(event);
    grouped.set(event.confusedWith, list);
  }
  return [...grouped.entries()].map(([relatedConceptId, rows]) => ({
    relatedConceptId,
    events: independent(rows.map(row => ({ day: day(row.createdAt), row }))).map(item => item.row),
  })).filter(pair => pair.events.length > 0).sort((a, b) => b.events.length - a.events.length || a.relatedConceptId.localeCompare(b.relatedConceptId));
}

export function buildPalaceLearningReport(
  palace: PalaceScene,
  allEvents: PalaceRecall[],
  nowMs = Date.now(),
  allExposures: PalaceExposure[] = [],
) {
  const conceptIds = new Set(palace.objects.map(object => object.conceptId));
  const events = allEvents.filter(event => event.palaceId === palace.id
    && conceptIds.has(event.conceptId)
    && Number.isFinite(Date.parse(event.createdAt))
    && Date.parse(event.createdAt) <= nowMs);
  const exposures = allExposures.filter(event => event.palaceId === palace.id
    && conceptIds.has(event.conceptId)
    && event.surface === 'inspector'
    && Number.isFinite(Date.parse(event.startedAt))
    && Number.isFinite(Date.parse(event.createdAt))
    && Date.parse(event.createdAt) <= nowMs
    && Number.isInteger(event.durationMs)
    && event.durationMs >= 1000
    && event.durationMs <= 600000);

  const history = new Map<string, Trial[]>();
  for (const event of events) {
    const rows = history.get(event.conceptId) ?? [];
    rows.push({
      day: day(event.createdAt),
      mode: event.mode,
      grade: event.grade,
      revealed: event.revealed,
      ...(event.confusedWith ? { confusedWith: event.confusedWith } : {}),
    });
    history.set(event.conceptId, rows);
  }
  for (const rows of history.values()) rows.sort((a, b) => a.day - b.day);

  const features = palace.objects.map(cueFor);
  const featureById = new Map(features.map(feature => [feature.id, feature]));
  const cuedHistory = new Map([...history].map(([id, rows]) => [id, rows.filter(row => row.mode === 'cued')]));
  const matrix = interferenceMatrix(features, cuedHistory, true);
  const items = palace.objects.map(object => {
    const conceptEvents = events.filter(event => event.conceptId === object.conceptId);
    const conceptExposures = exposures.filter(event => event.conceptId === object.conceptId);
    const trials = history.get(object.conceptId) ?? [];

    // V1.2 records have no explicit start time, so they retain the old creation-time proxy.
    // New V1.3 events use the observed inspector-view or recall-task start time.
    const hasObservedStart = conceptExposures.length > 0 || conceptEvents.some(event => Boolean(event.startedAt));
    const candidates: Array<{ at: string; source: string }> = [];
    if (hasObservedStart) {
      for (const exposure of conceptExposures) candidates.push({ at: exposure.startedAt, source: 'inspector_view' });
      for (const event of conceptEvents) candidates.push({ at: event.startedAt ?? event.createdAt, source: event.startedAt ? 'recall_task_start' : 'legacy_recall_timestamp' });
    }
    candidates.sort((a, b) => Date.parse(a.at) - Date.parse(b.at));
    const firstExposureAt = candidates[0]?.at ?? palace.createdAt;
    const firstExposureSource = candidates[0]?.source ?? 'palace_creation_proxy';
    const startDay = day(firstExposureAt);
    const nowDay = Math.max(startDay, nowMs / DAY);
    const eligibleTrials = trials.filter(trial => trial.day >= startDay);
    const cuedTrials = independent(eligibleTrials.filter(trial => trial.mode === 'cued'));
    const unaidedTrials = independent(eligibleTrials.filter(trial => trial.mode === 'unaided'));
    const load = loadFor(object.conceptId, matrix);
    const model = dualMemory(startDay, eligibleTrials, nowDay, load);
    const pairs = confusionPairs(conceptEvents.filter(event => Date.parse(event.createdAt) / DAY >= startDay), object.conceptId).filter(pair => featureById.has(pair.relatedConceptId));
    const repeatedPair = pairs.find(pair => pair.events.length >= 2);
    const related = repeatedPair ? featureById.get(repeatedPair.relatedConceptId) : undefined;
    const current = featureById.get(object.conceptId)!;
    const similarity = related ? visualSimilarity(current, related) : null;
    const cuedAccuracy = accuracy(cuedTrials);
    const unaidedAccuracy = accuracy(unaidedTrials);
    const cuedDue = model.observations.cued >= 3 ? dueDay(model, nowDay, 'cued', load) : null;
    const unaidedDue = model.observations.unaided >= 3 ? dueDay(model, nowDay, 'unaided', load) : null;
    const dueCandidates = [cuedDue, unaidedDue].filter((value): value is number => value !== null);
    const nextReviewAt = dueCandidates.length ? new Date(Math.min(...dueCandidates) * DAY).toISOString() : null;
    const knowledgeHalfLife = weightedQuantile(model.posterior.map(state => ({ value: state.knowledgeHalfLife, weight: state.weight })), 0.5);
    const visualHalfLife = weightedQuantile(model.posterior.map(state => ({ value: state.visualHalfLife, weight: state.weight })), 0.5);
    const cuedEvidence = model.observations.cued >= 5 ? 'observed' : 'sparse';
    const unaidedEvidence = model.observations.unaided >= 5 ? 'observed' : 'sparse';
    const responseTime = responseSummary(conceptEvents);
    const confidence = confidenceSummary(conceptEvents);
    const exposureDurations = conceptExposures.map(event => event.durationMs);

    let recommendation: Recommendation;
    if (repeatedPair && related) {
      const visualNote = (similarity ?? 0) >= 0.25
        ? '两者外观或位置存在较高相似性，可人工评估是否拉开空间位置或强化不同视觉形态。'
        : '当前视觉相似度不高，优先检查概念边界与题目线索，不建议仅凭误选直接移动锚点。';
      recommendation = {
        conceptId: object.conceptId,
        code: 'repeated_wrong_selection',
        action: 'inspect_pair',
        relatedConceptId: repeatedPair.relatedConceptId,
        message: `「${object.label}」被误选为「${related.meaning}」${repeatedPair.events.length}次（跨独立记录）。${visualNote}`,
        status: 'advisory_only',
      };
    } else if (model.observations.cued >= 3 && model.observations.unaided >= 3 && (cuedAccuracy ?? 0) >= 0.75 && (unaidedAccuracy ?? 1) <= 0.5) {
      recommendation = {
        conceptId: object.conceptId,
        code: 'cue_dependent',
        action: 'practice_unaided',
        message: `「${object.label}」在线索辅助下表现较好，但无标签定位较弱。优先增加无标签空间回忆练习，暂不改动场景。`,
        status: 'advisory_only',
      };
    } else if (model.observations.cued >= 3 && model.observations.unaided >= 3 && (cuedAccuracy ?? 1) <= 0.5 && (unaidedAccuracy ?? 1) <= 0.5) {
      recommendation = {
        conceptId: object.conceptId,
        code: 'knowledge_risk',
        action: 'review_source',
        message: `「${object.label}」在两种模式下都频繁出错。先回到原始知识与证据，确认是否真正理解，再考虑修改记忆锚点。`,
        status: 'advisory_only',
      };
    } else if (nextReviewAt && Date.parse(nextReviewAt) <= nowMs) {
      recommendation = {
        conceptId: object.conceptId,
        code: 'review_due',
        action: 'review_now',
        message: `「${object.label}」已达到模型建议的复习时间。该时间来自未校准的半衰期模型，应作为提醒而非确定预测。`,
        status: 'advisory_only',
      };
    } else if (model.observations.cued + model.observations.unaided < 3) {
      recommendation = {
        conceptId: object.conceptId,
        code: 'insufficient_evidence',
        action: 'collect_evidence',
        message: `「${object.label}」的独立回忆证据不足，暂不做个性化调整。`,
        status: 'advisory_only',
      };
    } else {
      recommendation = {
        conceptId: object.conceptId,
        code: 'monitor',
        action: 'maintain',
        message: `继续保持「${object.label}」的现有空间锚点，并积累跨时间回忆记录。`,
        status: 'advisory_only',
      };
    }

    return {
      conceptId: object.conceptId,
      label: object.label,
      roomId: object.roomId ?? palace.architecture?.placements.find(placement => placement.conceptId === object.conceptId)?.roomId ?? null,
      firstExposureAt,
      firstExposureSource,
      exposure: {
        inspectorViews: conceptExposures.length,
        totalDwellMs: exposureDurations.reduce((sum, value) => sum + value, 0),
        medianDwellMs: median(exposureDurations),
      },
      observations: { cued: model.observations.cued, unaided: model.observations.unaided },
      accuracy: { cued: cuedAccuracy, unaided: unaidedAccuracy },
      responseTime,
      confidence,
      memory: {
        cued: { estimatedRecall: model.now.cued, knowledgeHalfLifeDays: knowledgeHalfLife, visualTraceHalfLifeDays: visualHalfLife, evidence: cuedEvidence, observations: model.observations.cued },
        unaided: { estimatedRecall: model.now.knowledge, halfLifeDays: knowledgeHalfLife, evidence: unaidedEvidence, observations: model.observations.unaided },
      },
      confusion: pairs.map(pair => ({
        relatedConceptId: pair.relatedConceptId,
        count: pair.events.length,
        visualSimilarity: Number((visualSimilarity(current, featureById.get(pair.relatedConceptId)!) || 0).toFixed(3)),
      })),
      marginalReview: marginalMemoryGain(model, nowDay),
      nextReviewAt,
      recommendation,
    };
  });

  const allIndependent = items.flatMap(item => {
    const rows = history.get(item.conceptId) ?? [];
    const startDay = day(item.firstExposureAt);
    return (['cued', 'unaided'] as Mode[]).flatMap(mode => independent(rows.filter(trial => trial.mode === mode && trial.day >= startDay)))
      .map(trial => ({ ...trial, conceptId: item.conceptId }));
  });
  const scoredAll = allIndependent.filter(trial => trial.grade !== 'uncertain');
  const empiricalAccuracy = scoredAll.length ? scoredAll.filter(trial => trial.grade === 'correct').length / scoredAll.length : null;
  const cuedValues = items.filter(item => item.observations.cued >= 3).map(item => item.memory.cued.estimatedRecall);
  const unaidedValues = items.filter(item => item.observations.unaided >= 3).map(item => item.memory.unaided.estimatedRecall);
  const due = items.map(item => item.nextReviewAt).filter((value): value is string => Boolean(value)).sort((a, b) => Date.parse(a) - Date.parse(b));
  const activityTimes = [
    ...events.map(event => event.startedAt ?? event.createdAt),
    ...exposures.map(event => event.startedAt),
  ];
  const studyDays = new Set(activityTimes.map(value => new Date(value).toISOString().slice(0, 10))).size;
  const recommendations = items.map(item => item.recommendation).filter(item => item.code !== 'monitor');
  const observedStartItems = items.filter(item => item.firstExposureSource === 'inspector_view' || item.firstExposureSource === 'recall_task_start');
  const exposureDurations = exposures.map(event => event.durationMs);
  const responseTime = responseSummary(events);
  const confidence = confidenceSummary(events);
  const recordedAt = [...events.map(event => event.createdAt), ...exposures.map(event => event.createdAt)].sort();

  return {
    version: '1.3.0',
    palaceId: palace.id,
    generatedAt: new Date(nowMs).toISOString(),
    model: 'joint-grid-bayesian-v0.4',
    evidence: {
      eventCount: events.length,
      exposureEventCount: exposures.length,
      observedExposureConcepts: observedStartItems.length,
      legacyProxyConcepts: items.length - observedStartItems.length,
      independentAttempts: allIndependent.length,
      modelObservations: items.reduce((sum, item) => sum + item.observations.cued + item.observations.unaided, 0),
      studyDays,
      totalInspectorViewMs: exposureDurations.reduce((sum, value) => sum + value, 0),
      medianInspectorViewMs: median(exposureDurations),
      firstInstrumentedExposureAt: observedStartItems.map(item => item.firstExposureAt).sort()[0] ?? null,
      firstRecordedAt: recordedAt[0] ?? null,
      lastRecordedAt: recordedAt.at(-1) ?? null,
      exposureTiming: observedStartItems.length ? 'instrumented_per_concept_with_legacy_fallbacks' : 'legacy_timestamp_proxy',
    },
    metrics: {
      concepts: palace.objects.length,
      reviewedConcepts: items.filter(item => item.observations.cued + item.observations.unaided > 0).length,
      empiricalAccuracy: empiricalAccuracy === null ? null : Number(empiricalAccuracy.toFixed(3)),
      meanCuedRecall: cuedValues.length ? Number((cuedValues.reduce((sum, value) => sum + value, 0) / cuedValues.length).toFixed(3)) : null,
      meanUnaidedRecall: unaidedValues.length ? Number((unaidedValues.reduce((sum, value) => sum + value, 0) / unaidedValues.length).toFixed(3)) : null,
      reviewDueCount: items.filter(item => item.nextReviewAt && Date.parse(item.nextReviewAt) <= nowMs).length,
      nextReviewAt: due[0] ?? null,
      responseTime,
      confidenceCalibration: confidence,
    },
    items,
    recommendations,
    limitations: [
      'V1.3 records explicit inspector-card dwell and recall-task start times; legacy records without these fields still use palace creation time as a clearly marked proxy.',
      'Inspector dwell is a view event, not proof that the learner attended to or encoded the content; it is descriptive and does not refresh the forgetting model.',
      'Response time and confidence calibration are descriptive diagnostics only and are not model inputs.',
      'The half-life model is heuristic and uncalibrated on human longitudinal data; sparse estimates must not be interpreted as reliable probabilities.',
      'Grades and wrong selections are behavioral records, not objective proof of conceptual mastery or cognitive confusion.',
      'All adaptation outputs are advisory; this report never changes object positions, room topology, or source knowledge.',
    ],
  };
}
