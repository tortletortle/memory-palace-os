import type { Grade, Mode } from './adaptive.ts';
import { bayesianModelAverage } from './model-selection.ts';

const clamp = (x: number, lo = 0, hi = 1) => Math.max(lo, Math.min(hi, x));
const normalize = (xs: number[]) => {
  const sum = xs.reduce((a, b) => a + b, 0);
  if (!Number.isFinite(sum) || sum <= 0) return xs.map(() => 1 / Math.max(1, xs.length));
  return xs.map(x => x / sum);
};
const mean = (xs: number[]) => xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : 0;

export type ForgettingFamily = 'exponential' | 'power_law' | 'two_phase';
export type CausalCause = 'none' | 'knowledge_gap' | 'visual_confusion' | 'semantic_confusion' | 'unknown';
export type CausalObservation = {
  id: string;
  day: number;
  mode: Mode;
  grade: Grade;
  cause?: CausalCause;
  pairId?: string;
  /** Explicit paired-probe evidence that a cue rescued an unaided miss. */
  cueHelped?: boolean;
  /** Optional separately scored channel outcomes; never inferred from a generic miss. */
  channelOutcomes?: { knowledge?: boolean; visual?: boolean; semantic?: boolean };
};

const families: ForgettingFamily[] = ['exponential', 'power_law', 'two_phase'];
// Log-spaced prior centered on the V0.5 engine's historical 3-day scale.
const halfLives = [1.5, 3, 6, 12, 24, 48, 96];
function decay(family: ForgettingFamily, days: number, halfLife: number): number {
  const t = Math.max(0, days), h = Math.max(0.15, halfLife);
  if (family === 'exponential') return 2 ** (-t / h);
  if (family === 'power_law') return 1 / (1 + t / h);
  return 0.72 * 2 ** (-t / (h * 0.55)) + 0.28 * 2 ** (-t / (h * 2.4));
}

export type BOCPDResult = {
  index: number;
  changeProbability: number;
  detected: boolean;
  mapRunLength: number;
  baselineProbability: number;
  predictiveProbability: number;
  candidateProbability: number;
};
type RunState = { runLength: number; probability: number; alpha: number; beta: number };

/**
 * Bernoulli Bayesian online change-point detector (BOCPD).
 * The detector is advisory. It detects a change in the observed success rate,
 * not the psychological cause of that change.
 */
export class BayesianOnlineChangePointDetector {
  private states: RunState[];
  private count = 0;
  private pending: { index: number; direction: boolean; outcomes: boolean[]; probability: number } | undefined;
  private readonly hazard: number;
  private readonly priorAlpha: number;
  private readonly priorBeta: number;
  private readonly maxRunLength: number;
  private readonly threshold: number;

  constructor(options: { hazard?: number; priorAlpha?: number; priorBeta?: number; maxRunLength?: number; threshold?: number } = {}) {
    this.hazard = options.hazard ?? 1 / 28;
    this.priorAlpha = options.priorAlpha ?? 1;
    this.priorBeta = options.priorBeta ?? 1;
    this.maxRunLength = options.maxRunLength ?? 128;
    this.threshold = options.threshold ?? 0.35;
    if (!(this.hazard > 0 && this.hazard < 1) || !(this.priorAlpha > 0) || !(this.priorBeta > 0) ||
        !Number.isInteger(this.maxRunLength) || this.maxRunLength < 8 || this.maxRunLength > 512 ||
        !(this.threshold > 0 && this.threshold < 1)) throw new Error('Invalid BOCPD configuration');
    this.states = [{ runLength: 0, probability: 1, alpha: this.priorAlpha, beta: this.priorBeta }];
  }

  update(success: boolean): BOCPDResult {
    this.count++;
    const x = success ? 1 : 0;
    const priorPredictive = success
      ? this.priorAlpha / (this.priorAlpha + this.priorBeta)
      : this.priorBeta / (this.priorAlpha + this.priorBeta);
    let changeMass = 0;
    const growth: RunState[] = [];
    let baseline = 0;
    for (const state of this.states) {
      const predictive = success ? state.alpha / (state.alpha + state.beta) : state.beta / (state.alpha + state.beta);
      baseline += state.probability * predictive;
      changeMass += state.probability * this.hazard * priorPredictive;
      growth.push({
        runLength: state.runLength + 1,
        probability: state.probability * (1 - this.hazard) * predictive,
        alpha: state.alpha + x,
        beta: state.beta + (1 - x)
      });
    }
    const next = [{ runLength: 0, probability: changeMass, alpha: this.priorAlpha + x, beta: this.priorBeta + (1 - x) }, ...growth]
      .sort((a, b) => b.runLength - a.runLength)
      .slice(-this.maxRunLength);
    const z = next.reduce((s, r) => s + r.probability, 0);
    this.states = next.map(r => ({ ...r, probability: r.probability / Math.max(z, Number.EPSILON) }));
    const cp = this.states.find(r => r.runLength === 0)?.probability ?? 0;
    let detected = false;
    let candidateProbability = 0;
    if (this.pending) {
      this.pending.outcomes.push(success);
      if (this.pending.outcomes.length >= 3) {
        const sameDirection = this.pending.outcomes.filter(v => v === this.pending!.direction).length;
        detected = sameDirection >= 2;
        candidateProbability = this.pending.probability;
        this.pending = undefined;
      }
    }
    if (!this.pending && !detected && cp >= this.threshold) {
      this.pending = { index: this.count, direction: success, outcomes: [success], probability: cp };
    }
    const map = this.states.reduce((a, b) => b.probability > a.probability ? b : a, this.states[0]!);
    return {
      index: this.count,
      changeProbability: cp,
      detected,
      mapRunLength: map.runLength,
      baselineProbability: clamp(baseline),
      predictiveProbability: clamp(baseline),
      candidateProbability
    };
  }

  reset() {
    this.count = 0;
    this.pending = undefined;
    this.states = [{ runLength: 0, probability: 1, alpha: this.priorAlpha, beta: this.priorBeta }];
  }
}


export type HybridChangePointResult = BOCPDResult & {
  source: 'none' | 'cusum' | 'bocpd' | 'both';
  cusum: number;
  baselineRate: number;
};

/**
 * Hybrid downward-shift detector: BOCPD supplies Bayesian change evidence;
 * a one-sided Bernoulli CUSUM confirms sustained degradation. The rolling
 * baseline is frozen while the statistic is elevated and rebased after an alert.
 */
export class HybridChangePointDetector {
  private readonly bocpd: BayesianOnlineChangePointDetector;
  private readonly threshold: number;
  private readonly expectedDrop: number;
  private readonly minObservations: number;
  private readonly baselineWindow: number;
  private outcomes: boolean[] = [];
  private cusum = 0;
  private count = 0;

  constructor(options: {
    hazard?: number;
    bayesThreshold?: number;
    cusumThreshold?: number;
    expectedDrop?: number;
    minObservations?: number;
    baselineWindow?: number;
    maxRunLength?: number;
  } = {}) {
    this.threshold = options.cusumThreshold ?? 3.9;
    this.expectedDrop = options.expectedDrop ?? 0.35;
    this.minObservations = options.minObservations ?? 8;
    this.baselineWindow = options.baselineWindow ?? 60;
    if (!(this.threshold > 0) || !(this.expectedDrop > 0 && this.expectedDrop < 0.8) ||
        !Number.isInteger(this.minObservations) || this.minObservations < 4 ||
        !Number.isInteger(this.baselineWindow) || this.baselineWindow < 12) throw new Error('Invalid hybrid change detector configuration');
    this.bocpd = new BayesianOnlineChangePointDetector({
      hazard: options.hazard ?? 1 / 24,
      threshold: options.bayesThreshold ?? 0.2,
      maxRunLength: options.maxRunLength ?? 128
    });
  }

  update(success: boolean, expectedSuccessProbability?: number): HybridChangePointResult {
    this.count++;
    if (expectedSuccessProbability !== undefined && (!Number.isFinite(expectedSuccessProbability) || expectedSuccessProbability <= 0 || expectedSuccessProbability >= 1)) throw new Error('Expected probability must be between 0 and 1');
    const priorSuccess = this.outcomes.filter(Boolean).length;
    const priorFailure = this.outcomes.length - priorSuccess;
    const baselineRate = expectedSuccessProbability ?? (priorSuccess + 1) / (priorSuccess + priorFailure + 2);
    const alternativeRate = clamp(baselineRate - this.expectedDrop, 0.02, Math.max(0.03, baselineRate - 0.005));
    const llr = success
      ? Math.log(alternativeRate / Math.max(0.01, baselineRate))
      : Math.log((1 - alternativeRate) / Math.max(0.01, 1 - baselineRate));
    this.cusum = Math.max(0, this.cusum + llr);
    const bayes = this.bocpd.update(success);
    const cusumSignal = this.count >= this.minObservations && this.cusum >= this.threshold;
    // BOCPD posterior is retained as a diagnostic; a single upward/downward posterior reset
    // is not sufficient for an alert. The one-sided CUSUM requires sustained downward evidence.
    const detected = cusumSignal;
    const source = cusumSignal ? 'cusum' : 'none';

    if (detected) {
      this.cusum = 0;
      this.outcomes = [ ...this.outcomes.slice(-Math.min(9, this.baselineWindow - 1)), success ];
      this.bocpd.reset();
    } else {
      this.outcomes.push(success);
      if (this.outcomes.length > this.baselineWindow) this.outcomes.shift();
    }
    return {
      ...bayes,
      detected,
      source,
      cusum: this.cusum,
      baselineRate,
      candidateProbability: Math.max(bayes.candidateProbability, bayes.changeProbability)
    };
  }

  reset() {
    this.outcomes = [];
    this.cusum = 0;
    this.count = 0;
    this.bocpd.reset();
  }
}

export type AdaptiveBMAOptions = {
  hazard?: number;
  changeThreshold?: number;
  resetStrength?: number;
  contamination?: number;
  maxRunLength?: number;
  cusumThreshold?: number;
  expectedDrop?: number;
};
export type AdaptiveBMAResult = {
  probability: number;
  baseProbability: number;
  legacyProbability: number;
  adaptiveWeight: number;
  negativeResidualStreak: number;
  calibrationCorrection: number;
  calibrationWeight: number;
  observations: number;
  evidence: 'observed' | 'sparse';
  familyWeights: { family: ForgettingFamily; weight: number }[];
  modelWeights: { family: ForgettingFamily; halfLifeDays: number; weight: number }[];
  maxChangeProbability: number;
  changePoints: { day: number; probability: number }[];
  forecastGapDays: number;
};

/**
 * Adaptive BMA over 21 family/half-life hypotheses. A BOCPD probability
 * discounts stale model evidence before the current likelihood is applied.
 * A small contamination term prevents a single hypothesis becoming certain.
 */
export function adaptiveBayesianModelAverage(
  observations: { day: number; mode: Mode; grade: Grade }[],
  mode: Mode,
  nowDay: number,
  options: AdaptiveBMAOptions = {}
): AdaptiveBMAResult {
  if (!Number.isFinite(nowDay) || nowDay < 0) throw new Error('Invalid forecast day');
  const contamination = options.contamination ?? 0.025;
  const resetStrength = options.resetStrength ?? 0.9;
  if (!(contamination >= 0 && contamination < 0.5) || !(resetStrength >= 0 && resetStrength <= 1)) throw new Error('Invalid adaptive BMA options');
  const models = families.flatMap(family => halfLives.map(halfLifeDays => ({ family, halfLifeDays })));
  const prior = models.map(() => 1 / models.length);
  let weights = [...prior];
  const detector = new HybridChangePointDetector({
    hazard: options.hazard,
    bayesThreshold: options.changeThreshold,
    cusumThreshold: options.cusumThreshold,
    expectedDrop: options.expectedDrop,
    maxRunLength: options.maxRunLength
  });
  const clean = observations.filter(o => Number.isFinite(o.day) && o.day >= 0 && o.day <= nowDay && o.mode === mode && o.grade !== 'uncertain')
    .sort((a, b) => a.day - b.day);
  let lastDay: number | undefined;
  const gapBaseline = new Map<string, { successes: number; total: number }>();
  const changePoints: { day: number; probability: number }[] = [];
  const residuals: number[] = [];
  const legacyResiduals: number[] = [];
  let maxChangeProbability = 0;
  let used = 0;
  for (const observation of clean) {
    const gap = lastDay === undefined ? Math.max(0.5, observation.day) : observation.day - lastDay;
    if (gap < 0.05) continue;
    const success = observation.grade === 'correct';
    const priorPrediction = models.reduce((sum, model, i) => sum + weights[i]! * decay(model.family, gap, model.halfLifeDays), 0);
    residuals.push(Number(success) - priorPrediction);
    const gapBin = String(Math.min(6, Math.max(1, Math.round(gap))));
    const baseline = gapBaseline.get(gapBin) ?? { successes: 0, total: 0 };
    const expectedByGap = (baseline.successes + 4 * priorPrediction) / (baseline.total + 4);
    if (used >= 2) {
      const prefix = clean.slice(0, used).map(o => ({ ageDays: o.day, mode: o.mode, grade: o.grade }));
      const legacyBefore = bayesianModelAverage(prefix, mode, observation.day).probability;
      legacyResiduals.push(Number(success) - legacyBefore);
    }
    const cp = detector.update(success, expectedByGap);
    baseline.successes += Number(success); baseline.total++; gapBaseline.set(gapBin, baseline);
    maxChangeProbability = Math.max(maxChangeProbability, cp.changeProbability);
    if (cp.detected) changePoints.push({ day: observation.day, probability: cp.changeProbability });
    const reset = cp.detected ? clamp(Math.max(cp.changeProbability, cp.candidateProbability) * resetStrength, 0, 0.95) : 0;
    // Flatten the old posterior toward the prior after change evidence.
    weights = normalize(weights.map((w, i) => Math.pow(Math.max(w, 1e-15), 1 - reset) * Math.pow(prior[i]!, reset)));
    weights = normalize(weights.map((w, i) => {
      const model = models[i]!;
      const raw = decay(model.family, gap, model.halfLifeDays);
      const p = clamp((1 - contamination) * raw + contamination * 0.5, 0.01, 0.99);
      return w * (success ? p : 1 - p);
    }));
    lastDay = observation.day;
    used++;
  }
  const forecastGapDays = lastDay === undefined ? nowDay : Math.max(0, nowDay - lastDay);
  const baseProbability = models.reduce((s, m, i) => s + weights[i]! * decay(m.family, forecastGapDays, m.halfLifeDays), 0);
  const legacyProbability = bayesianModelAverage(clean.map(o => ({ ageDays: o.day, mode: o.mode, grade: o.grade })), mode, nowDay).probability;
  // Residuals are strictly prequential: each legacy forecast was computed using only earlier observations.
  const recentResiduals = legacyResiduals.slice(-8);
  const calibrationWeight = recentResiduals.length / (recentResiduals.length + 4);
  const residualMean = mean(recentResiduals);
  // Require three consecutive, materially negative out-of-sample residuals before applying
  // a calibration correction; isolated noisy misses do not move the stable baseline.
  const trailing = recentResiduals.slice(-4);
  let negativeResidualStreak = 0;
  for (const residual of [...trailing].reverse()) { if (residual <= -0.15) negativeResidualStreak++; else break; }
  const calibrationCorrection = negativeResidualStreak >= 3 ? clamp(0.25 * calibrationWeight * residualMean, -0.10, 0.10) : 0;
  // Keep the legacy model as the stable-regime anchor. Switch toward the adaptive family
  // posterior only after a confirmed change or a persistent run of large negative residuals.
  const adaptiveWeight = changePoints.length > 0 ? 0.65 : negativeResidualStreak >= 3 ? 0.25 : 0.02;
  const blendedProbability = (1 - adaptiveWeight) * legacyProbability + adaptiveWeight * baseProbability;
  const probability = clamp(blendedProbability + calibrationCorrection, 0.01, 0.99);
  const familyWeights = families.map(family => ({ family, weight: models.reduce((s, m, i) => s + (m.family === family ? weights[i]! : 0), 0) }));
  return {
    probability, baseProbability: clamp(baseProbability), legacyProbability: clamp(legacyProbability), adaptiveWeight, calibrationCorrection, calibrationWeight, observations: used, evidence: used >= 5 ? 'observed' : 'sparse',
    negativeResidualStreak, familyWeights, modelWeights: models.map((m, i) => ({ ...m, weight: weights[i]! })),
    maxChangeProbability, changePoints, forecastGapDays
  };
}

function betaSummary(successes: number, failures: number, alpha = 1, beta = 1) {
  const a = alpha + successes, b = beta + failures;
  return { mean: a / (a + b), alpha: a, beta: b, evidence: successes + failures >= 5 ? 'observed' as const : 'sparse' as const, n: successes + failures };
}

export type SeparatedForecast = {
  knowledge: { probability: number; familyWeights: AdaptiveBMAResult['familyWeights']; observations: number; evidence: 'observed' | 'sparse' };
  cued: { probability: number; evidence: 'observed' | 'sparse' };
  channels: {
    cueRescue: ReturnType<typeof betaSummary>;
    visualInterference: ReturnType<typeof betaSummary>;
    semanticInterference: ReturnType<typeof betaSummary>;
  };
  identification: 'identified' | 'partially_identified' | 'underidentified';
  exclusions: { unknownCause: number; unpairedCueHelp: number };
};

/**
 * Estimates forgetting from unaided trials only. Cued failures are assigned to
 * visual/semantic/knowledge channels only when explicitly labelled. This avoids
 * interpreting a semantic confusion as evidence of faster forgetting.
 */
export function estimateSeparatedForecast(observations: CausalObservation[], nowDay: number, options: AdaptiveBMAOptions = {}): SeparatedForecast {
  if (!Number.isFinite(nowDay) || nowDay < 0) throw new Error('Invalid forecast day');
  const clean = observations.filter(o => Number.isFinite(o.day) && o.day >= 0 && o.day <= nowDay && o.grade !== 'uncertain');
  const knowledgeObs = clean.filter(o => o.mode === 'unaided').map(o => ({ day: o.day, mode: o.mode, grade: o.grade }));
  const knowledge = adaptiveBayesianModelAverage(knowledgeObs, 'unaided', nowDay, options);
  const cued = clean.filter(o => o.mode === 'cued');
  const visualFailures = cued.filter(o => o.cause === 'visual_confusion').length;
  const semanticFailures = cued.filter(o => o.cause === 'semantic_confusion').length;
  const knowledgeGaps = cued.filter(o => o.cause === 'knowledge_gap').length;
  const cleanCueOutcomes = cued.filter(o => o.cause === 'none').length;
  const labelled = cued.filter(o => o.cause && o.cause !== 'unknown').length;
  // Competing-risk factorization: visual failures are conditional on passing the knowledge gate;
  // semantic failures are conditional on passing both the knowledge and visual gates.
  const visualEligible = visualFailures + semanticFailures + cleanCueOutcomes;
  const semanticEligible = semanticFailures + cleanCueOutcomes;
  const visualInterference = betaSummary(visualFailures, Math.max(0, visualEligible - visualFailures));
  const semanticInterference = betaSummary(semanticFailures, Math.max(0, semanticEligible - semanticFailures));

  const pairs = new Map<string, { unaided?: CausalObservation; cued?: CausalObservation }>();
  for (const o of clean) if (o.pairId) {
    const p = pairs.get(o.pairId) ?? {};
    if (o.mode === 'unaided') p.unaided = o; else p.cued = o;
    pairs.set(o.pairId, p);
  }
  let helped = 0, notHelped = 0, unpairedCueHelp = 0;
  for (const pair of pairs.values()) {
    if (!pair.unaided || !pair.cued || pair.unaided.mode !== 'unaided' || pair.cued.mode !== 'cued') continue;
    if (pair.unaided.grade === 'missed') {
      if (pair.cued.cause === 'none' || pair.cued.cause === 'visual_confusion' || pair.cued.cause === 'semantic_confusion') helped++;
      else if (pair.cued.cause === 'knowledge_gap') notHelped++;
    }
  }
  for (const o of cued) if (!o.pairId || !pairs.get(o.pairId)?.unaided) unpairedCueHelp++;
  const cueRescue = betaSummary(helped, notHelped, 1, 3);
  const pK = knowledge.probability;
  const pCued = clamp((pK + (1 - pK) * cueRescue.mean) * (1 - visualInterference.mean) * (1 - semanticInterference.mean));
  const identification = labelled >= 8 && visualEligible >= 5 && semanticEligible >= 5 && helped + notHelped >= 5 && knowledge.observations >= 5
    ? 'identified' : labelled >= 3 || helped + notHelped >= 2 ? 'partially_identified' : 'underidentified';
  return {
    knowledge: { probability: pK, familyWeights: knowledge.familyWeights, observations: knowledge.observations, evidence: knowledge.evidence },
    cued: { probability: pCued, evidence: labelled >= 5 && helped + notHelped >= 5 ? 'observed' : 'sparse' },
    channels: { cueRescue, visualInterference, semanticInterference },
    identification,
    exclusions: { unknownCause: cued.filter(o => !o.cause || o.cause === 'unknown').length, unpairedCueHelp }
  };
}

export type Channel = 'knowledge' | 'visual' | 'semantic';
/** Separate BOCPD instances prevent a semantic change from resetting forgetting weights. */
export class ChannelChangePointBank {
  private detectors = new Map<Channel, HybridChangePointDetector>();
  private readonly options: { hazard?: number; bayesThreshold?: number; cusumThreshold?: number; expectedDrop?: number; maxRunLength?: number };
  constructor(options: { hazard?: number; bayesThreshold?: number; cusumThreshold?: number; expectedDrop?: number; maxRunLength?: number } = {}) { this.options = options; }
  update(channel: Channel, success: boolean, expectedSuccessProbability?: number): HybridChangePointResult {
    let detector = this.detectors.get(channel);
    if (!detector) {
      detector = new HybridChangePointDetector(this.options);
      this.detectors.set(channel, detector);
    }
    return detector.update(success, expectedSuccessProbability);
  }
  reset(channel?: Channel) {
    if (channel) this.detectors.delete(channel); else this.detectors.clear();
  }
}
