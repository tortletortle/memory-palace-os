export const transferFeatures = [
  'spatial', 'symbolic', 'causal', 'sequential', 'hierarchical',
  'contrastive', 'analogical', 'dynamic', 'retrieval', 'semantic'
] as const;
export type TransferFeature = typeof transferFeatures[number];

export const memoryDomains = [
  'probability', 'programming', 'history', 'digital_logic', 'language', 'biology'
] as const;
export type MemoryDomain = typeof memoryDomains[number];

export type FeatureVector = Record<TransferFeature, number>;

export interface TransferSkillGene {
  id: string;
  version: number;
  family: 'encoding' | 'organization' | 'retrieval' | 'reasoning' | 'disambiguation';
  requires: string[];
  provides: string[];
  featureAffinity: Partial<Record<TransferFeature, number>>;
  sourceDomains: MemoryDomain[];
  transferability: number;
  costUnits: number;
  description: string;
  evidenceLevel: 'designed' | 'simulation_tested' | 'human_validated';
}

/**
 * The hidden field is benchmark-only. Production transfer selection must use
 * domain/features and the public genome, never hidden skill utilities or labels.
 */
export interface TransferTask {
  id: string;
  domain: MemoryDomain;
  features: FeatureVector;
  difficulty: number;
  hidden: {
    skillUtility: Record<string, number>;
    synergyPairs: string[];
  };
  split: 'source_train' | 'target_domain_holdout' | 'composition_holdout';
  heldOutPair?: string;
}

export interface TransferGeneAllele {
  geneId: string;
  version: number;
  featureAffinity: Partial<Record<TransferFeature, number>>;
  transferability: number;
  costMultiplier: number;
  parentVersion: number;
  mutation: string;
}

export interface TransferGenome {
  id: string;
  generation: number;
  geneIds: string[];
  activationThreshold: number;
  maxActiveGenes: number;
  synergyPairs: string[];
  alleles?: TransferGeneAllele[];
  metadata?: {
    parentIds?: string[];
    mutation?: string;
    fitness?: number;
  };
}

export interface SkillDependencyGraph {
  nodes: string[];
  edges: Array<{ from: string; to: string }>;
  topologicalOrder: string[];
  capabilities: string[];
  valid: boolean;
  errors: string[];
}

export interface SelectedTransferSkill {
  geneId: string;
  activation: number;
  costUnits: number;
  reason: string;
}

export interface TransferSelection {
  genomeId: string;
  domain: MemoryDomain;
  activeGenes: SelectedTransferSkill[];
  totalCostUnits: number;
  budgetUnits: number;
  budgetRespected: boolean;
  dependencyGraph: SkillDependencyGraph;
  expectedFeatureFit: number;
}

export interface TransferMetrics {
  normalizedUtility: number;
  featureFit: number;
  combinationCoverage: number;
  novelCombinationCoverage: number;
  meanActiveOptionalGenes: number;
  meanComputeUnits: number;
  budgetUtilization: number;
  episodes: number;
}

export interface TransferSearchResult {
  strategy: 'fixed-heuristic' | 'static-modular' | 'evolved-modular' | 'evolved-no-allele';
  genome: TransferGenome;
  metrics: TransferMetrics;
  evolutionAudit?: { candidatesWithAlleles: number; alleleVariantsEvaluated: number; selectedAlleleCount: number };
  searchBudget: {
    candidateEvaluations: number;
    trainingCases: number;
    inferenceBudgetPerCase: number;
    perCandidateReservation: number;
    allocated: number;
    consumed: number;
  };
}
