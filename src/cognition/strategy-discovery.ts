
import type { FeatureVector, TransferGenome, TransferTask } from './transfer-types.ts';
import { transferSkillLibrary } from './transfer-library.ts';
import { selectTransferSkills } from './transfer-engine.ts';
import { buildSkillDependencyGraph } from './transfer-graph.ts';
import { extractKnowledgeFeatures } from './knowledge-feature-extractor.ts';

export interface DiscoveredStrategy {
 id:string; domain:TransferTask['domain']; selectedGeneIds:string[];
 featureCoverage:number; costUnits:number; dependencyValid:boolean;
 evidence:string[]; warnings:string[];
}
const allFeatures = Object.keys({spatial:0,symbolic:0,causal:0,sequential:0,hierarchical:0,contrastive:0,analogical:0,dynamic:0,retrieval:0,semantic:0}) as (keyof FeatureVector)[];
export function discoverStrategies(text:string, genome:TransferGenome, budget=18): {parsed:ReturnType<typeof extractKnowledgeFeatures>; strategies:DiscoveredStrategy[]} {
 const parsed=extractKnowledgeFeatures(text);
 const task:TransferTask={id:'extracted-task',domain:parsed.domain,features:parsed.features,difficulty:0.5,hidden:{skillUtility:{},synergyPairs:[]},split:'target_domain_holdout'};
 const candidates=[genome, {...genome,id:genome.id+'-contrast',geneIds:[...genome.geneIds,'contrastive-pair','semantic-boundary'].filter((v,i,a)=>a.indexOf(v)===i)}, {...genome,id:genome.id+'-mechanism',geneIds:[...genome.geneIds,'mechanism-simulation','causal-chain'].filter((v,i,a)=>a.indexOf(v)===i)}];
 const strategies:DiscoveredStrategy[]=[];
 for (const g of candidates) {
  try {
   const sel=selectTransferSkills(task,g,budget);
   const active=sel.activeGenes.map(x=>x.geneId);
   const weights=active.map(id=>transferSkillLibrary.find(x=>x.id===id)).filter(Boolean);
   const covered=new Set(weights.flatMap(x=>Object.keys(x!.featureAffinity)));
   const observed=allFeatures.filter(k=>parsed.features[k]>0);
   const coverage=observed.length?observed.filter(k=>covered.has(k)).length/observed.length:0;
   const graph=buildSkillDependencyGraph(active);
   strategies.push({id:g.id,domain:parsed.domain,selectedGeneIds:active,featureCoverage:coverage,costUnits:sel.totalCostUnits,dependencyValid:graph.valid,evidence:observed.flatMap(k=>parsed.evidence[k]??[]),warnings:[...parsed.warnings]});
  } catch(e) { strategies.push({id:g.id,domain:parsed.domain,selectedGeneIds:[],featureCoverage:0,costUnits:budget+1,dependencyValid:false,evidence:[],warnings:[String(e)]}); }
 }
 return {parsed,strategies:strategies.sort((a,b)=>(b.featureCoverage/a.costUnits)-(a.featureCoverage/b.costUnits))};
}
export interface TransferEvidence { sourceDomain:string; targetDomain:string; geneId:string; sourceUtility:number; targetUtility:number; sampleCount:number; }
export function detectNegativeTransfer(rows:TransferEvidence[], minN=8, harmThreshold=0.08) {
 return rows.map(r=>({...r,negativeTransfer:r.sampleCount>=minN && r.targetUtility-r.sourceUtility < -harmThreshold,delta:r.targetUtility-r.sourceUtility,confidence:r.sampleCount/(r.sampleCount+minN)}));
}
