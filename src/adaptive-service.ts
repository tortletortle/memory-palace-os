import {dualMemory,bayesianDecision,estimateCost} from './bayesian.ts';
import {DAY,estimateMemory,interferenceMatrix,loadFor,chooseChange} from './adaptive.ts';
import type {Trial,CueFeature,Mode} from './adaptive.ts';
import type {State,Publication} from './store.ts';
import {EngineError} from './schema.ts';
import {validateCandidate} from './validator.ts';
import {compileScene} from './compiler.ts';
import {publishedCues} from './conflicts.ts';
import type {Candidate,Cue} from './schema.ts';
import type {SceneObject} from './compiler.ts';
const day=(s:string)=>Date.parse(s)/DAY;
const key=(p:string,a:string)=>`${p}:${a}`;
const feature=(p:Publication,o:SceneObject):CueFeature=>({id:key(p.id,o.atomId),meaning:o.answer,asset:o.assetId,shape:o.shape,color:o.color,action:o.animation,position:o.position});
export function parseReviewContext(s:State,p:Publication,atoms:unknown,context:unknown){
  if(context===undefined)return {context:{},confusions:new Map<string,{publicationId:string;atomId:string}>()};
  if(!context||typeof context!=='object'||Array.isArray(context))throw new EngineError('REVIEW_CONTEXT','Context object required',422);
  const c=context as Record<string,unknown>;
  if(!['cued','unaided'].includes(c.mode as string)||typeof c.revealed!=='boolean'||Object.keys(c).some(k=>!['mode','revealed'].includes(k)))throw new EngineError('REVIEW_CONTEXT','Explicit mode and revealed boolean required',422);
  const confusions=new Map<string,{publicationId:string;atomId:string}>();
  if(Array.isArray(atoms))for(const a of atoms){if(!a||typeof a!=='object'||a.confusedWith===undefined)continue;const ref=a.confusedWith;
    if(c.mode!=='cued'||a.grade!=='missed'||!ref||typeof ref!=='object'||typeof ref.publicationId!=='string'||typeof ref.atomId!=='string'||(ref.publicationId===p.id&&ref.atomId===a.atomId)||!s.publications.some(q=>q.id===ref.publicationId&&q.scene.objects.some(o=>o.atomId===ref.atomId)))throw new EngineError('REVIEW_CONFUSION','Confusion requires cued missed rating and a different existing cue',422);
    confusions.set(a.atomId,{publicationId:ref.publicationId,atomId:ref.atomId});
  }
  return {context:{mode:c.mode as Mode,revealed:c.revealed},confusions};
}
export function adaptiveReport(s:State,id:string,now=Date.now()/DAY,version:3|4=3){
  const p=s.publications.find(p=>p.id===id);if(!p)throw new EngineError('NOT_FOUND','Publication not found',404);
  // Explicitly bounded local workspace; target included even if not latest. One other publication per knowledge+anchor.
  const occupied=new Set([`${p.knowledgeId}:${p.scene.anchor.id}`]);const scope=[p];let count=p.scene.objects.length;
  for(const q of [...s.publications].reverse()){const k=`${q.knowledgeId}:${q.scene.anchor.id}`;if(occupied.has(k)||count+q.scene.objects.length>128)continue;scope.push(q);occupied.add(k);count+=q.scene.objects.length;}
  const cues=scope.flatMap(q=>q.scene.objects.map(o=>feature(q,o)));const allowed=new Set(cues.map(c=>c.id));const history=new Map<string,Trial[]>();let legacyReviews=0;
  for(const r of s.reviews){if(!scope.some(q=>q.id===r.publicationId))continue;if(!r.mode||typeof r.revealed!=='boolean'){legacyReviews++;continue;}for(const a of r.atoms){const k=key(r.publicationId,a.atomId);if(!allowed.has(k))continue;const h=history.get(k)??[];h.push({day:day(r.createdAt),mode:r.mode,grade:a.grade,revealed:r.revealed,...(a.confusedWith?{confusedWith:key(a.confusedWith.publicationId,a.confusedWith.atomId)}:{})});history.set(k,h);}}
  for(const h of history.values())h.sort((a,b)=>a.day-b.day);
  const matrix=interferenceMatrix(cues,history);
  const job=s.jobs.find(j=>j.id===p.jobId),knowledge=s.knowledge.find(k=>k.id===p.knowledgeId);
  const current=job?.results.find(r=>r.scene?.id===p.scene.id)?.candidate;const alternatives=new Map<string,CueFeature[]>();const options=new Map<string,{candidate:Candidate;scene:ReturnType<typeof compileScene>;changed:Cue}>();
  if(job&&knowledge&&current&&knowledge.revision===p.scene.knowledgeRevision){
    for(const o of p.scene.objects){const target=key(p.id,o.atomId);for(const other of job.results){if(!other.report.passed||!other.scene)continue;const replacement=other.candidate.cues.find(c=>c.atomId===o.atomId);if(!replacement)continue;
      // No changes to original source or anchor. Recompile only a one-cue substitution.
      const candidate:Candidate={...current,cues:current.cues.map(c=>c.atomId===o.atomId?replacement:c)};
      if(!validateCandidate(knowledge,candidate,publishedCues(s.publications)).passed)continue;
      const scene=compileScene(knowledge,candidate,p.scene.anchor);const obj=scene.objects.find(x=>x.atomId===o.atomId)!;
      const alt=feature(p,obj);const sig=JSON.stringify([target,alt.asset,alt.action]);options.set(sig,{candidate,scene,changed:replacement});alternatives.set(target,[...(alternatives.get(target)??[]),alt]);
    }}
  }
  // Recent failures must be separated in time; avoid repeated clicks producing adaptation evidence.
  const optimizationHistory=new Map([...history].map(([k,h])=>{const distinct:Trial[]=[];for(const t of h.filter(t=>t.mode==='cued'&&t.grade!=='uncertain'))if(!distinct.length||t.day-distinct.at(-1)!.day>=.05)distinct.push(t);return [k,distinct];}));
  const historyNow=new Map([...history].map(([k,h])=>[k,h.filter(t=>t.day<=now)]));
  const starts=new Map(scope.flatMap(q=>q.scene.objects.map(o=>[key(q.id,o.atomId),day(q.createdAt)] as const)));
  const cost=s.costEvidence??[];
  const change=version===4?bayesianDecision(cues,historyNow,alternatives,now,starts,cost):chooseChange(cues,optimizationHistory,alternatives,true,true);const option=change?options.get(JSON.stringify([change.target,change.replacement.asset,change.replacement.action])):undefined;
  return {publicationId:id,model:version===4?'joint-grid-bayesian-v0.4':'grid-half-life-v0.3',generatedAt:new Date(now*DAY).toISOString(),scope:{publicationIds:scope.map(q=>q.id),cueCount:cues.length,legacyReviewsExcluded:legacyReviews,assumedInitialExposure:'publication creation',maxCues:128},memory:p.scene.objects.map(o=>{const k=key(id,o.atomId),h=history.get(k)??[];return {atomId:o.atomId,cued:estimateMemory(day(p.createdAt),h,now,'cued'),unaided:estimateMemory(day(p.createdAt),h,now,'unaided'),interferenceLoad:loadFor(k,matrix),...(version===4?{dual:dualMemory(day(p.createdAt),h,now,loadFor(k,matrix))}:{})};}),matrix,...(version===4?{costEstimate:{knowledge:estimateCost(cost,'unaided'),visual:estimateCost(cost,'cued')}}:{}),proposal:change&&option?{...change,...option,status:'advisory_human_review_required'}:null,limitations:['Heuristic uncalibrated model; no causal attribution of a miss.','Matrix includes visual priors and self-reported directed confusions; not a measured brain interference matrix.','Proposal does not change published scenes or schedule.']};
}
