import type {Candidate,Knowledge} from './schema.ts';
import type {Scene} from './compiler.ts';
import {compareMath} from './math.ts';
import {assets} from './catalog.ts';
export type PublishedCue={publicationId:string;knowledgeId:string;anchorId:string;assetId:string;action:string;meaning:string;metaphor:string};
export type Conflict={severity:'error'|'warning';code:'DUPLICATE_CUE'|'VISUAL_COLLISION'|'METAPHOR_COLLISION'|'HISTORICAL_COLLISION';atomIds:string[];publicationId?:string;detail:string};
const text=(s:string)=>s.normalize('NFKC').toLowerCase().replace(/\s+/g,'').replace(/[，。！？、,.!?]/g,'');
// Preserve sign, punctuation and case of mathematical evidence, where e.g. x != X.
const meaning=(s:string)=>s.trim().replace(/\s+/g,' ');
const mathLike=(s:string)=>/^[\x20-\x7eαλβγδεθμνπρστφωΛΣ−×·÷]+$/.test(s)&&/[=^+*/!\\{}]|[λπ]/.test(s);
function sameMeaning(a:string,b:string){if(meaning(a)===meaning(b))return true;return a.length<=200&&b.length<=200&&mathLike(a)&&mathLike(b)&&compareMath(a,b,{witness:false}).status==='equivalent';}
const signature=(assetId:string,action:string)=>{const a=assets.find(x=>x.id===assetId);return a?`${a.shape}:${a.color}:${action}`:`unknown:${assetId}:${action}`;};
export function publishedCues(publications:{id:string;knowledgeId:string;scene:Scene}[]):PublishedCue[]{return publications.slice(-128).flatMap(p=>p.scene.objects.map(o=>({publicationId:p.id,knowledgeId:p.knowledgeId,anchorId:p.scene.anchor.id,assetId:o.assetId,action:o.animation,meaning:o.answer,metaphor:o.cue}))).slice(-512);}
export function detectConflicts(k:Knowledge,c:Candidate,history:PublishedCue[]=[]):Conflict[]{const result:Conflict[]=[];const atoms=new Map(k.atoms.map(a=>[a.id,a]));const active=c.cues.filter(a=>atoms.has(a.atomId));const memo=new Map<string,boolean>();let equivalenceChecks=0;const equal=(a:string,b:string)=>{if(meaning(a)===meaning(b))return true;const key=JSON.stringify([a,b].sort());if(!memo.has(key)){if(equivalenceChecks>=32)return false;equivalenceChecks++;memo.set(key,sameMeaning(a,b));}return memo.get(key)!;};
 // Inspect every in-candidate pair before considering capped historical warnings.
 for(let i=0;i<active.length;i++)for(let j=i+1;j<active.length;j++){const a=active[i],b=active[j],aa=atoms.get(a.atomId)!,bb=atoms.get(b.atomId)!;if(a.atomId===b.atomId)continue;const visual=signature(a.assetId,a.action)===signature(b.assetId,b.action),metaphor=text(a.metaphor)===text(b.metaphor);if(!(visual||metaphor)||equal(aa.text,bb.text))continue;const fatal=visual&&metaphor&&aa.role===bb.role;
 result.push({severity:fatal?'error':'warning',code:fatal?'DUPLICATE_CUE':visual?'VISUAL_COLLISION':'METAPHOR_COLLISION',atomIds:[a.atomId,b.atomId],detail:fatal?'Identical rendered cue and metaphor encode different atoms in the same role.':visual?'Rendered asset and animation match; distinct positions or visuals may disambiguate.':'Same metaphor reused for distinct atoms; review semantic ambiguity.'});}
 // No room ID in v0.1 anchor contract: global-local history is advisory, not a blocker.
 const seen=new Set<string>();let historicalCount=0;for(const a of active){const aa=atoms.get(a.atomId)!;for(const h of history.slice(-512)){if(h.knowledgeId===k.id||signature(h.assetId,h.action)!==signature(a.assetId,a.action))continue;const key=JSON.stringify([a.atomId,h.anchorId,h.meaning,h.assetId,h.action]);if(seen.has(key)||equal(h.meaning,aa.text))continue;seen.add(key);result.push({severity:'warning',code:'HISTORICAL_COLLISION',atomIds:[a.atomId],publicationId:h.publicationId,detail:`Reused rendered visual signature at anchor ${h.anchorId}`});if(++historicalCount>=64)return result;}}
 return result;}
export function rankScore(coverage:number,issues:number,conflicts:Conflict[]):number{return issues?0:Math.max(0,Math.round(coverage*100-Math.min(35,conflicts.filter(c=>c.code==='VISUAL_COLLISION'||c.code==='METAPHOR_COLLISION').length*10)-Math.min(25,conflicts.filter(c=>c.code==='HISTORICAL_COLLISION').length*5)));}
