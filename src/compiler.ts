import type {PublishedCue} from './conflicts.ts';
import {createHash} from 'node:crypto';
import {assets,catalogVersion} from './catalog.ts';
import {validateBatch,validateCandidate} from './validator.ts';
import {EngineError} from './schema.ts';
import type {Candidate,Knowledge} from './schema.ts';
export type Anchor={id:string;position:[number,number,number]};
export type SceneObject={id:string;atomId:string;assetId:string;shape:string;color:string;position:[number,number,number];scale:[number,number,number];animation:string;cue:string;explanation:string;answer:string};
export type Scene={version:1;id:string;knowledgeId:string;knowledgeRevision:string;anchor:Anchor;catalogVersion:string;strategy:string;objects:SceneObject[];fractionBar:null|{position:[number,number,number];scale:[number,number,number]}};
export function parseAnchor(value:unknown):Anchor{
  if(!value||typeof value!=='object')throw new EngineError('ANCHOR_INVALID','Anchor required');const a=value as Record<string,unknown>;if(typeof a.id!=='string'||!/^[a-zA-Z0-9_-]{1,64}$/.test(a.id)||!Array.isArray(a.position)||a.position.length!==3||a.position.some(x=>typeof x!=='number'||!Number.isFinite(x)||Math.abs(x)>1000))throw new EngineError('ANCHOR_INVALID','Anchor id and three finite coordinates required');return {id:a.id,position:[...a.position] as Anchor['position']};
}
export function compileScene(k:Knowledge,c:Candidate,anchor:Anchor):Scene{
  const report=validateCandidate(k,c);if(!report.passed)throw new EngineError('CANDIDATE_REJECTED',report.issues.join('; '),422);
  const a=parseAnchor(anchor);const [x,y,z]=a.position;
  const numerator=k.atoms.filter(a=>a.role==='numerator'),denominator=k.atoms.filter(a=>a.role==='denominator'),other=k.atoms.filter(a=>!['numerator','denominator'].includes(a.role));
  const fraction=numerator.length>0&&denominator.length>0;
  const objects:SceneObject[]=k.atoms.map(atom=>{const cue=c.cues.find(c=>c.atomId===atom.id)!;const model=assets.find(m=>m.id===cue.assetId)!;
    const row=atom.role==='numerator'?numerator:atom.role==='denominator'?denominator:other;
    const index=row.findIndex(r=>r.id===atom.id);const dx=(index-(row.length-1)/2)*1.35;const dy=atom.role==='numerator'?1.1:atom.role==='denominator'?-1.1:0;
    return {id:`obj-${atom.id}`,atomId:atom.id,assetId:model.id,shape:model.shape,color:model.color,position:[x+dx,y+dy,z+(row===other?1.6:0)],scale:[.65,.65,.65],animation:cue.action,cue:cue.metaphor,explanation:cue.explanation,answer:atom.text};
  });
  const id=createHash('sha256').update(JSON.stringify({revision:k.revision,id:k.id,anchor:a,c,catalogVersion})).digest('hex').slice(0,24);
  return {version:1,id,knowledgeId:k.id,knowledgeRevision:k.revision,anchor:a,catalogVersion,strategy:c.strategy,objects,fractionBar:fraction?{position:[x,y,z],scale:[Math.max(numerator.length,denominator.length)*1.35,.06,.08]}:null};
}
export function compileBatch(k:Knowledge,value:unknown,anchor:Anchor,history:PublishedCue[]=[]){return validateBatch(k,value,history).map(({candidate,report})=>({candidate,report,scene:report.passed?compileScene(k,candidate,anchor):null}));}
// Do not ship canonical answers or free-text cues in blind recall (cues may leak answers).
export function recallScene(s:Scene){return {...s,objects:s.objects.map(({answer:_,explanation:__,cue:___,...obj})=>obj)};}
