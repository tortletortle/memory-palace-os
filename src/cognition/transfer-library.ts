import type { MemoryDomain, TransferSkillGene } from './transfer-types.ts';

const allDomains: MemoryDomain[] = ['probability', 'programming', 'history', 'digital_logic', 'language', 'biology'];

export const transferSkillLibrary: readonly TransferSkillGene[] = [
  {
    id: 'atom-chunking', version: 1, family: 'organization', requires: [], provides: ['atomic-structure'],
    featureAffinity: { hierarchical: 0.25, retrieval: 0.12 }, sourceDomains: allDomains,
    transferability: 1, costUnits: 1, description: 'Segment source knowledge into stable atomic units.', evidenceLevel: 'designed'
  },
  {
    id: 'spatial-route', version: 1, family: 'encoding', requires: ['atom-chunking'], provides: ['spatial-anchor'],
    featureAffinity: { spatial: 0.95, sequential: 0.16, retrieval: 0.2 }, sourceDomains: ['history', 'biology', 'digital_logic'],
    transferability: 0.9, costUnits: 3, description: 'Bind knowledge atoms to distinct spatial loci and routes.', evidenceLevel: 'designed'
  },
  {
    id: 'symbol-anchor', version: 1, family: 'encoding', requires: ['atom-chunking'], provides: ['symbol-mapping'],
    featureAffinity: { symbolic: 0.96, hierarchical: 0.22, sequential: 0.12 }, sourceDomains: ['probability', 'digital_logic', 'programming'],
    transferability: 0.92, costUnits: 3, description: 'Encode symbols and operators as stable visual anchors.', evidenceLevel: 'designed'
  },
  {
    id: 'causal-chain', version: 1, family: 'reasoning', requires: ['atom-chunking'], provides: ['causal-structure'],
    featureAffinity: { causal: 0.96, sequential: 0.34, dynamic: 0.2 }, sourceDomains: ['programming', 'history', 'biology', 'digital_logic'],
    transferability: 0.94, costUnits: 3, description: 'Represent cause, effect and intermediate state transitions.', evidenceLevel: 'designed'
  },
  {
    id: 'contrastive-pair', version: 1, family: 'disambiguation', requires: ['atom-chunking'], provides: ['contrast-structure'],
    featureAffinity: { contrastive: 0.96, semantic: 0.38, symbolic: 0.18 }, sourceDomains: ['probability', 'language'],
    transferability: 0.9, costUnits: 2, description: 'Separate easily confused concepts through explicit contrasts.', evidenceLevel: 'designed'
  },
  {
    id: 'timeline-sequence', version: 1, family: 'organization', requires: ['atom-chunking'], provides: ['temporal-structure'],
    featureAffinity: { sequential: 0.96, causal: 0.25, retrieval: 0.1 }, sourceDomains: ['history', 'programming', 'biology'],
    transferability: 0.91, costUnits: 2, description: 'Order knowledge into temporal or procedural sequences.', evidenceLevel: 'designed'
  },
  {
    id: 'hierarchy-chunk', version: 1, family: 'organization', requires: ['atom-chunking'], provides: ['hierarchical-structure'],
    featureAffinity: { hierarchical: 0.96, symbolic: 0.2, semantic: 0.12 }, sourceDomains: ['probability', 'programming', 'biology'],
    transferability: 0.95, costUnits: 2, description: 'Group details into nested chunks and retrieval hierarchies.', evidenceLevel: 'designed'
  },
  {
    id: 'dual-code', version: 1, family: 'encoding', requires: ['atom-chunking'], provides: ['dual-representation'],
    featureAffinity: { analogical: 0.62, spatial: 0.32, symbolic: 0.32 }, sourceDomains: ['language', 'biology'],
    transferability: 0.86, costUnits: 3, description: 'Pair verbal or symbolic representations with imagery.', evidenceLevel: 'designed'
  },
  {
    id: 'analogy-bridge', version: 1, family: 'reasoning', requires: ['atom-chunking'], provides: ['cross-domain-mapping'],
    featureAffinity: { analogical: 0.96, semantic: 0.26, hierarchical: 0.12 }, sourceDomains: ['language', 'biology', 'programming'],
    transferability: 0.91, costUnits: 3, description: 'Map a known relational structure onto a new domain.', evidenceLevel: 'designed'
  },
  {
    id: 'mechanism-simulation', version: 1, family: 'reasoning', requires: ['causal-chain'], provides: ['mechanism-model'],
    featureAffinity: { dynamic: 0.96, causal: 0.58, sequential: 0.18 }, sourceDomains: ['digital_logic', 'biology', 'programming'],
    transferability: 0.84, costUnits: 4, description: 'Use stateful mechanisms and transitions to encode dynamic systems.', evidenceLevel: 'designed'
  },
  {
    id: 'retrieval-cue', version: 1, family: 'retrieval', requires: ['atom-chunking'], provides: ['retrieval-cue'],
    featureAffinity: { retrieval: 0.96, spatial: 0.2, symbolic: 0.2 }, sourceDomains: allDomains,
    transferability: 0.98, costUnits: 2, description: 'Attach discriminative prompts to knowledge atoms.', evidenceLevel: 'designed'
  },
  {
    id: 'interleaved-retrieval', version: 1, family: 'retrieval', requires: ['retrieval-cue', 'contrastive-pair'], provides: ['interleaved-practice'],
    featureAffinity: { retrieval: 0.72, contrastive: 0.48, sequential: 0.18 }, sourceDomains: ['probability', 'language', 'history'],
    transferability: 0.87, costUnits: 3, description: 'Interleave related but distinguishable knowledge items during retrieval.', evidenceLevel: 'designed'
  },
  {
    id: 'semantic-boundary', version: 1, family: 'disambiguation', requires: ['contrastive-pair'], provides: ['semantic-boundary'],
    featureAffinity: { semantic: 0.96, contrastive: 0.42, analogical: 0.18 }, sourceDomains: ['language', 'probability', 'biology'],
    transferability: 0.9, costUnits: 2, description: 'Make definitions, category boundaries and near-neighbour differences explicit.', evidenceLevel: 'designed'
  }
];

const byId = new Map(transferSkillLibrary.map(g => [g.id, g]));
export function getTransferGene(id: string): TransferSkillGene | undefined { return byId.get(id); }
export function transferGenes(): readonly TransferSkillGene[] { return transferSkillLibrary; }
export function optionalTransferGenes(): readonly TransferSkillGene[] { return transferSkillLibrary.filter(g => g.id !== 'atom-chunking'); }
export function supportedSynergyPairs(): readonly string[] {
  return [
    'causal-chain+timeline-sequence',
    'spatial-route+retrieval-cue',
    'symbol-anchor+contrastive-pair',
    'analogy-bridge+dual-code',
    'causal-chain+mechanism-simulation'
  ];
}
