
import type { FeatureVector, MemoryDomain } from './cognition/transfer-types.ts';

export const knowledgeDomains = ['probability','programming','history','digital_logic','language','biology'] as const;
export const relationTypes = ['defines','depends_on','causes','contrasts_with','part_of','sequence_before','uses','example_of'] as const;
export type RelationType = typeof relationTypes[number];
export interface KnowledgeConcept { id:string; label:string; kind:'concept'|'formula'|'condition'|'procedure'|'example'|'mechanism'; evidenceQuote:string; }
export interface KnowledgeRelation { from:string; to:string; type:RelationType; evidenceQuote:string; }
export interface KnowledgeUnderstanding {
 title:string; domain:MemoryDomain; summary:string; concepts:KnowledgeConcept[];
 relations:KnowledgeRelation[]; features:FeatureVector; uncertaintyNotes:string[];
}
export interface KnowledgeQualityReport {
 valid:boolean; score:number; errors:string[]; warnings:string[]; evidenceCoverage:number;
 duplicateConcepts:string[]; isolatedConcepts:string[];
}
export interface KnowledgeUnderstandingResult {
 understanding:KnowledgeUnderstanding; quality:KnowledgeQualityReport;
 strategyCandidates:Array<{id:string;skills:string[];costUnits:number;featureCoverage:number;warnings:string[]}>;
 provenance:{model:string;mode:'remote'|'offline';sourceHash:string};
}
