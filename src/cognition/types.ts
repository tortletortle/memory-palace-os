export type CognitiveCause = 'knowledge_gap' | 'forgetting' | 'visual_confusion' | 'semantic_confusion' | 'none' | 'unknown';
export type CognitiveAction = 'relearn_concept' | 'schedule_review' | 'replace_visual_cue' | 'clarify_semantics' | 'no_action';
export type ModuleRole = 'observe' | 'diagnose' | 'forecast' | 'analyze' | 'decide' | 'intervene' | 'verify' | 'schedule';
export type Capability =
  | 'raw_observations' | 'normalized_evidence' | 'cause_diagnosis' | 'memory_forecast'
  | 'interference_profile' | 'intervention_decision' | 'intervention_proposal'
  | 'validated_proposal' | 'review_schedule';

export interface CognitiveObservation {
  id: string;
  day: number;
  mode: 'cued' | 'unaided';
  outcome: 'correct' | 'missed' | 'uncertain';
  cause?: CognitiveCause;
  visualSimilarity?: number;
  semanticSimilarity?: number;
  cueHelped?: boolean;
  targetId?: string;
  confusedWith?: string;
}

export interface CognitionInput {
  nowDay: number;
  targetId: string;
  observations: CognitiveObservation[];
  estimatedReplacementCost?: number;
  sourceRevision: string;
}

export interface SkillGene {
  id: string;
  version: number;
  role: ModuleRole;
  requires: Capability[];
  provides: Capability[];
  cost: { base: number; perObservation: number };
  description: string;
  deterministic: true;
}

export interface GeneInstance {
  nodeId: string;
  geneId: string;
  enabled: boolean;
  params: Record<string, number | string | boolean>;
}

export interface Genome {
  id: string;
  generation: number;
  nodes: GeneInstance[];
  edges: Array<{ from: string; to: string }>;
  metadata?: { parentIds?: string[]; mutation?: string; fitness?: number };
}

export interface Diagnosis {
  cause: CognitiveCause;
  confidence: number;
  probabilities: Record<CognitiveCause, number>;
  evidenceCount: number;
  status: 'supported' | 'weak' | 'underidentified';
}

export interface MemoryForecast {
  unaidedRecall: number;
  cuedRecall: number;
  evidenceCount: number;
  method: 'fast' | 'bma';
}

export interface InterferenceProfile {
  visual: number;
  semantic: number;
  observedVisualConfusions: number;
  observedSemanticConfusions: number;
  identification: 'supported' | 'weak' | 'underidentified';
}

export interface Decision {
  action: CognitiveAction;
  expectedUtility: number;
  confidence: number;
  recommend: boolean;
  rationale: string;
}

export interface Proposal {
  action: CognitiveAction;
  targetId: string;
  scope: 'single_knowledge_item' | 'none';
  sourceRevision: string;
  requiresUserConfirmation: true;
}

export interface CognitionState {
  input: CognitionInput;
  normalized?: CognitiveObservation[];
  diagnosis?: Diagnosis;
  forecast?: MemoryForecast;
  interference?: InterferenceProfile;
  decision?: Decision;
  proposal?: Proposal;
  validation?: { passed: boolean; issues: string[] };
  schedule?: { suggestedIntervalDays: number; basis: string };
}

export interface ExecutionTraceEntry {
  nodeId: string;
  geneId: string;
  status: 'executed' | 'skipped_budget' | 'skipped_dependency';
  costUnits: number;
  detail?: string;
}

export interface CognitionRunResult {
  genomeId: string;
  budget: { allocated: number; consumed: number; remaining: number; utilization: number };
  trace: ExecutionTraceEntry[];
  state: Omit<CognitionState, 'input' | 'normalized'>;
  validGenome: boolean;
}

export interface EvaluationCase {
  input: CognitionInput;
  truth: {
    cause: Exclude<CognitiveCause, 'unknown'>;
    unaidedRecall: number;
    idealAction: CognitiveAction;
  };
}
