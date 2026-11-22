import {detectConflicts,rankScore} from './conflicts.ts';
import type {Conflict,PublishedCue} from './conflicts.ts';
import {checked,candidateSchema,strategies,EngineError} from './schema.ts';
import type {Candidates,Candidate,Knowledge} from './schema.ts';
import {validAsset} from './catalog.ts';
export type Report={passed:boolean; issues:string[]; coverage:number; semanticStatus:'human_review_required'; conflicts?:Conflict[]; score?:number; rank?:number};
export function validateCandidate(k:Knowledge,c:Candidate,history:PublishedCue[]=[]):Report{
  const issues:string[]=[];const covered=new Set<string>();const atomMap=new Map(k.atoms.map(a=>[a.id,a]));
  for(const cue of c.cues){const atom=atomMap.get(cue.atomId);if(!atom){issues.push(`Unknown atom ${cue.atomId}`);continue;}if(covered.has(atom.id))issues.push(`Duplicate cue ${atom.id}`);covered.add(atom.id);if(!validAsset(cue.assetId,atom.role))issues.push(`Asset ${cue.assetId} incompatible with ${atom.role}`);}
  for(const a of k.atoms)if(!covered.has(a.id))issues.push(`Missing atom ${a.id}`);
  // Metaphor semantics and academic truth cannot be established by schema validation.
  const conflicts=issues.length===0?detectConflicts(k,c,history):[];for(const conflict of conflicts)if(conflict.severity==='error')issues.push(`${conflict.code}: ${conflict.atomIds.join(', ')}`);const coverage=covered.size/k.atoms.length;return {passed:issues.length===0,issues,coverage,semanticStatus:'human_review_required',conflicts,score:rankScore(coverage,issues.length,conflicts)};
}
export function validateBatch(k:Knowledge,value:unknown,history:PublishedCue[]=[]):{candidate:Candidate;report:Report}[]{
  const batch=checked<Candidates>(candidateSchema,value);if(batch.candidates.length!==3||strategies.some(s=>batch.candidates.filter(c=>c.strategy===s).length!==1))throw new EngineError('STRATEGIES_INVALID','Require exactly one candidate per strategy',422);
  const results=batch.candidates.map(candidate=>({candidate,report:validateCandidate(k,candidate,history)}));const sorted=[...results].sort((a,b)=>Number(b.report.passed)-Number(a.report.passed)||(b.report.score??0)-(a.report.score??0));sorted.forEach((r,i)=>r.report.rank=i+1);return results;
}
