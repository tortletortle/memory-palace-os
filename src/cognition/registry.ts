import type { Capability, CognitiveCause, CognitiveObservation, CognitiveAction, CognitionState, Diagnosis, InterferenceProfile, MemoryForecast, ModuleRole, SkillGene } from './types.ts';

export type GeneHandler = (state: CognitionState, params: Record<string, number | string | boolean>) => void;
export interface RegisteredGene { spec: SkillGene; handler: GeneHandler }
const causes: CognitiveCause[] = ['knowledge_gap', 'forgetting', 'visual_confusion', 'semantic_confusion', 'none', 'unknown'];
const clamp = (x: number, lo = 0, hi = 1) => Math.max(lo, Math.min(hi, x));
const mean = (xs: number[]) => xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : 0;
const countCause = (obs: CognitiveObservation[], cause: CognitiveCause) => obs.filter(o => o.cause === cause && o.outcome !== 'uncertain').length;

function normalize(state: CognitionState) {
  state.normalized = state.input.observations
    .filter(o => Number.isFinite(o.day) && o.day >= 0 && o.day <= state.input.nowDay)
    .map(o => ({ ...o }));
}
function diagnose(state: CognitionState, params: Record<string, number | string | boolean>, conservative: boolean) {
  const obs = state.normalized ?? [];
  const labelled = obs.filter(o => o.cause && o.cause !== 'unknown' && o.cause !== 'none' && o.outcome !== 'uncertain');
  const evidenceCount = labelled.length;
  const counts = Object.fromEntries(causes.map(c => [c, c === 'none' ? countCause(obs, 'none') : c === 'unknown' ? countCause(obs, 'unknown') : countCause(obs, c)])) as Record<CognitiveCause, number>;
  const total = Object.values(counts).reduce((a, b) => a + b, 0);
  const probabilities = Object.fromEntries(causes.map(c => [c, (counts[c] + 0.5) / (total + causes.length * 0.5)])) as Record<CognitiveCause, number>;
  let winner: CognitiveCause = 'unknown';
  for (const c of ['knowledge_gap', 'forgetting', 'visual_confusion', 'semantic_confusion', 'none'] as CognitiveCause[]) if (probabilities[c] > probabilities[winner]) winner = c;
  const confidence = probabilities[winner];
  const minEvidence = Number(params.minEvidence ?? (conservative ? 4 : 2));
  const threshold = Number(params.confidenceThreshold ?? (conservative ? 0.58 : 0.42));
  if (evidenceCount < minEvidence || confidence < threshold) winner = 'unknown';
  const finalConfidence = winner === 'unknown' ? Math.max(probabilities.unknown, 1 - confidence) : confidence;
  const diagnosis: Diagnosis = { cause: winner, confidence: clamp(finalConfidence), probabilities, evidenceCount, status: winner === 'unknown' ? (evidenceCount < minEvidence ? 'underidentified' : 'weak') : 'supported' };
  state.diagnosis = diagnosis;
}
function forecast(state: CognitionState, method: 'fast' | 'bma') {
  const obs = (state.normalized ?? []).filter(o => o.mode === 'unaided' && o.outcome !== 'uncertain');
  const last = obs.length ? Math.max(...obs.map(o => o.day)) : state.input.nowDay;
  const age = Math.max(0, state.input.nowDay - last);
  const successes = obs.filter(o => o.outcome === 'correct').length;
  const failures = obs.length - successes;
  const empirical = (successes + 1) / (obs.length + 2);
  let p: number;
  if (method === 'fast') {
    p = clamp(empirical * 2 ** (-age / 7));
  } else {
    const models = [
      (h: number) => 2 ** (-age / h),
      (h: number) => 1 / (1 + age / h),
      (h: number) => 0.72 * 2 ** (-age / (h * 0.55)) + 0.28 * 2 ** (-age / (h * 2.4))
    ];
    const halfLives = [2, 5, 12, 28];
    const modelWeights = models.map(fn => {
      let likelihood = 1;
      for (const o of obs) {
        const d = Math.max(0, state.input.nowDay - o.day);
        const probability = clamp(mean(halfLives.map(h => fn(h) * 0.5 + 0.5 * empirical * 2 ** (-d / h))), 0.02, 0.98);
        likelihood *= o.outcome === 'correct' ? probability : 1 - probability;
      }
      return likelihood;
    });
    const z = modelWeights.reduce((a, b) => a + b, 0) || 1;
    p = models.reduce((sum, fn, i) => sum + (modelWeights[i]! / z) * mean(halfLives.map(h => fn(h) * 0.5 + 0.5 * empirical)), 0);
    p = clamp(p);
  }
  const cued = (state.normalized ?? []).filter(o => o.mode === 'cued' && o.outcome !== 'uncertain');
  const cuedRate = (cued.filter(o => o.outcome === 'correct').length + 1) / (cued.length + 2);
  const cueBenefit = clamp(cuedRate - empirical, 0, 0.5);
  const result: MemoryForecast = { unaidedRecall: p, cuedRecall: clamp(p + cueBenefit), evidenceCount: obs.length, method };
  state.forecast = result;
}
function analyze(state: CognitionState, weighted: boolean) {
  const obs = state.normalized ?? [];
  const visual = obs.filter(o => o.cause === 'visual_confusion' && o.outcome === 'missed');
  const semantic = obs.filter(o => o.cause === 'semantic_confusion' && o.outcome === 'missed');
  const visualSignal = mean(visual.map(o => o.visualSimilarity ?? 0));
  const semanticSignal = mean(semantic.map(o => o.semanticSimilarity ?? 0));
  const labelledTotal = visual.length + semantic.length;
  const profile: InterferenceProfile = {
    visual: clamp(weighted ? visualSignal * (visual.length / (visual.length + 2)) : visualSignal),
    semantic: clamp(weighted ? semanticSignal * (semantic.length / (semantic.length + 2)) : semanticSignal),
    observedVisualConfusions: visual.length,
    observedSemanticConfusions: semantic.length,
    identification: labelledTotal >= 4 ? 'supported' : labelledTotal > 0 ? 'weak' : 'underidentified'
  };
  state.interference = profile;
}
function decide(state: CognitionState, params: Record<string, number | string | boolean>, conservative: boolean) {
  const d = state.diagnosis, f = state.forecast, i = state.interference;
  if (!d || !f || !i) return;
  const threshold = Number(params.utilityThreshold ?? (conservative ? 0.24 : 0.12));
  const cost = clamp(state.input.estimatedReplacementCost ?? 0.2);
  let action: CognitiveAction = 'no_action';
  let benefit = 0;
  if (d.cause === 'knowledge_gap') { action = 'relearn_concept'; benefit = 0.72 * d.confidence; }
  else if (d.cause === 'forgetting') { action = 'schedule_review'; benefit = (1 - f.unaidedRecall) * d.confidence; }
  else if (d.cause === 'visual_confusion' && i.visual >= 0.25) { action = 'replace_visual_cue'; benefit = i.visual * d.confidence; }
  else if (d.cause === 'semantic_confusion' && i.semantic >= 0.25) { action = 'clarify_semantics'; benefit = i.semantic * d.confidence; }
  const replacementCost = action === 'replace_visual_cue' ? cost * (conservative ? 1.25 : 1) : action === 'clarify_semantics' ? cost * 0.8 : 0;
  const utility = benefit - replacementCost;
  const recommend = action !== 'no_action' && utility >= threshold;
  state.decision = { action: recommend ? action : 'no_action', expectedUtility: utility, confidence: d.confidence, recommend, rationale: recommend ? `Evidence supports ${action}; estimated utility ${utility.toFixed(3)}.` : 'Evidence or expected utility is insufficient; preserve the current memory structure.' };
}
function propose(state: CognitionState) {
  const decision = state.decision;
  if (!decision) return;
  state.proposal = {
    action: decision.recommend ? decision.action : 'no_action',
    targetId: state.input.targetId,
    scope: decision.recommend ? 'single_knowledge_item' : 'none',
    sourceRevision: state.input.sourceRevision,
    requiresUserConfirmation: true
  };
}
function verify(state: CognitionState) {
  const p = state.proposal;
  const issues: string[] = [];
  if (!p) issues.push('proposal_missing');
  else {
    if (p.targetId !== state.input.targetId) issues.push('target_changed');
    if (p.sourceRevision !== state.input.sourceRevision) issues.push('source_revision_changed');
    if (!['relearn_concept', 'schedule_review', 'replace_visual_cue', 'clarify_semantics', 'no_action'].includes(p.action)) issues.push('action_not_allowlisted');
    if (!p.requiresUserConfirmation) issues.push('confirmation_required');
  }
  state.validation = { passed: issues.length === 0, issues };
}
function schedule(state: CognitionState) {
  if (!state.forecast) return;
  const p = state.forecast.unaidedRecall;
  const interval = p < 0.35 ? 1 : p < 0.55 ? 2 : p < 0.72 ? 4 : 8;
  state.schedule = { suggestedIntervalDays: interval, basis: `unaided recall estimate ${(p * 100).toFixed(1)}%` };
}

const specs: SkillGene[] = [
  { id: 'evidence-normalizer', version: 1, role: 'observe', requires: ['raw_observations'], provides: ['normalized_evidence'], cost: { base: 2, perObservation: 0.12 }, description: 'Validate and normalize explicit review evidence.', deterministic: true },
  { id: 'cause-diagnosis-balanced', version: 1, role: 'diagnose', requires: ['normalized_evidence'], provides: ['cause_diagnosis'], cost: { base: 3, perObservation: 0.15 }, description: 'Balanced diagnosis with smoothed cause frequencies.', deterministic: true },
  { id: 'cause-diagnosis-conservative', version: 1, role: 'diagnose', requires: ['normalized_evidence'], provides: ['cause_diagnosis'], cost: { base: 4, perObservation: 0.2 }, description: 'Requires stronger evidence before assigning a cause.', deterministic: true },
  { id: 'memory-forecast-fast', version: 1, role: 'forecast', requires: ['normalized_evidence'], provides: ['memory_forecast'], cost: { base: 2, perObservation: 0.1 }, description: 'Low-cost smoothed recall forecast.', deterministic: true },
  { id: 'memory-forecast-bma', version: 1, role: 'forecast', requires: ['normalized_evidence'], provides: ['memory_forecast'], cost: { base: 5, perObservation: 0.3 }, description: 'Ensemble forecast across decay families.', deterministic: true },
  { id: 'interference-separated', version: 1, role: 'analyze', requires: ['normalized_evidence', 'cause_diagnosis'], provides: ['interference_profile'], cost: { base: 4, perObservation: 0.25 }, description: 'Separate observed visual and semantic confusion channels.', deterministic: true },
  { id: 'interference-light', version: 1, role: 'analyze', requires: ['normalized_evidence', 'cause_diagnosis'], provides: ['interference_profile'], cost: { base: 2, perObservation: 0.12 }, description: 'Low-cost channel estimates using explicit labels.', deterministic: true },
  { id: 'decision-risk-sensitive', version: 1, role: 'decide', requires: ['cause_diagnosis', 'memory_forecast', 'interference_profile'], provides: ['intervention_decision'], cost: { base: 4, perObservation: 0 }, description: 'Utility-based intervention decision.', deterministic: true },
  { id: 'decision-conservative', version: 1, role: 'decide', requires: ['cause_diagnosis', 'memory_forecast', 'interference_profile'], provides: ['intervention_decision'], cost: { base: 2, perObservation: 0 }, description: 'Conservative decision threshold.', deterministic: true },
  { id: 'local-intervention', version: 1, role: 'intervene', requires: ['intervention_decision'], provides: ['intervention_proposal'], cost: { base: 2, perObservation: 0 }, description: 'Create a local, non-destructive intervention proposal.', deterministic: true },
  { id: 'proposal-verifier', version: 1, role: 'verify', requires: ['intervention_proposal'], provides: ['validated_proposal'], cost: { base: 3, perObservation: 0 }, description: 'Verify target, revision and confirmation constraints.', deterministic: true },
  { id: 'review-scheduler', version: 1, role: 'schedule', requires: ['memory_forecast'], provides: ['review_schedule'], cost: { base: 2, perObservation: 0 }, description: 'Suggest a review interval from recall probability.', deterministic: true }
];
const handlers: Partial<Record<string, GeneHandler>> = {
  'evidence-normalizer': normalize,
  'cause-diagnosis-balanced': (s, p) => diagnose(s, p, false),
  'cause-diagnosis-conservative': (s, p) => diagnose(s, p, true),
  'memory-forecast-fast': s => forecast(s, 'fast'),
  'memory-forecast-bma': s => forecast(s, 'bma'),
  'interference-separated': s => analyze(s, true),
  'interference-light': s => analyze(s, false),
  'decision-risk-sensitive': (s, p) => decide(s, p, false),
  'decision-conservative': (s, p) => decide(s, p, true),
  'local-intervention': propose,
  'proposal-verifier': verify,
  'review-scheduler': schedule
};

export const skillGeneLibrary: ReadonlyArray<SkillGene> = specs;
export function getGene(id: string): RegisteredGene | undefined {
  const spec = specs.find(g => g.id === id);
  const handler = handlers[id];
  return spec && handler ? { spec, handler } : undefined;
}
export function genesByRole(role: ModuleRole): SkillGene[] { return specs.filter(g => g.role === role); }
export function hasCapabilities(required: Capability[], available: Set<Capability>): boolean { return required.every(c => available.has(c)); }
