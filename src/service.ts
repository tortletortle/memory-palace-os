import {validCost,estimateCost} from './bayesian.ts';
import type {CostEvidence} from './bayesian.ts';
import {adaptiveReport,parseReviewContext} from './adaptive-service.ts';
import {publishedCues} from './conflicts.ts';
import {validateCandidate} from './validator.ts';
import {compareMath} from './math.ts';
import {randomUUID} from 'node:crypto';
import {EngineError} from './schema.ts';
import type {Knowledge} from './schema.ts';
import type {Model} from './model.ts';
import {approveKnowledge,parseKnowledge,POISSON} from './knowledge.ts';
import {compileBatch,parseAnchor,recallScene} from './compiler.ts';
import {promptVersion} from './prompts.ts';
import {Store} from './store.ts';
import type {Job,Publication,Review,PalaceRecall,PalaceExposure} from './store.ts';
import {planReviews} from './spatial/review-planner.ts';
import {buildPalaceLearningReport} from './spatial/palace-learning.ts';
function find<T extends {id:string}>(list:T[],id:string):T{const r=list.find(x=>x.id===id);if(!r)throw new EngineError('NOT_FOUND','Resource not found',404);return r;}
export class Engine {
  readonly store:Store;readonly model:Model;
  constructor(store:Store,model:Model){this.store=store;this.model=model;}
  async parse(source:string){const k=await parseKnowledge(source,this.model);return this.store.transaction(s=>{s.knowledge.push(k);return k;});}
  async confirm(id:string,revision:string){return this.store.transaction(s=>{const k=find(s.knowledge,id);const approved=approveKnowledge(k,revision);s.knowledge=s.knowledge.map(x=>x.id===id?approved:x);return approved;});}
  async generate(id:string,anchorInput:unknown){const anchor=parseAnchor(anchorInput);const snapshot=await this.store.read();const k=find(snapshot.knowledge,id);if(k.status==='needs_review')throw new EngineError('KNOWLEDGE_UNCONFIRMED','Confirm the source and atom roles first',409);
    const candidates=await this.model.generate(k);const results=compileBatch(k,candidates,anchor,publishedCues(snapshot.publications));const job:Job={id:randomUUID(),knowledgeId:k.id,knowledgeRevision:k.revision,model:this.model.name,promptVersion,createdAt:new Date().toISOString(),results};return this.store.transaction(s=>{s.jobs.push(job);return job;});}
  async job(id:string){return find((await this.store.read()).jobs,id);}
  async publish(jobId:string,sceneId:string,ack:boolean){if(ack!==true)throw new EngineError('CONFIRM_REQUIRED','Human semantic and visual review required',409);return this.store.transaction(s=>{const job=find(s.jobs,jobId);const k=find(s.knowledge,job.knowledgeId);if(k.revision!==job.knowledgeRevision||k.status==='needs_review')throw new EngineError('STALE_REVISION','Knowledge revision changed',409);const result=job.results.find(r=>r.scene?.id===sceneId);if(!result?.scene||!result.report.passed)throw new EngineError('CANDIDATE_REJECTED','Scene not validated',422);const old=s.publications.find(p=>p.jobId===jobId&&p.scene.id===sceneId);if(old)return old;const updated=validateCandidate(k,result.candidate,publishedCues(s.publications));if(!updated.passed)throw new EngineError('CANDIDATE_REJECTED',updated.issues.join('; '),422);const p:Publication={id:randomUUID(),jobId,knowledgeId:k.id,scene:result.scene,createdAt:new Date().toISOString()};s.publications.push(p);return p;});}
  async checkAnswer(id:string,answer:string){const k=find((await this.store.read()).knowledge,id);if(k.status==='needs_review')throw new EngineError('KNOWLEDGE_UNCONFIRMED','Confirm the source first',409);return compareMath(k.source,answer,k.source===POISSON?{witnessFilter:a=>a.lambda>0&&Number.isInteger(a.k)&&a.k>=0}:{});}
  async publication(id:string,recall:boolean){const p=find((await this.store.read()).publications,id);return recall?{...p,scene:recallScene(p.scene)}:p;}
  async adaptive(id:string){return adaptiveReport(await this.store.read(),id);}
  async bayesian(id:string){return adaptiveReport(await this.store.read(),id,Date.now()/86400000,4);}
  async costEvidence(input:unknown){if(!input||typeof input!=='object'||Array.isArray(input))throw new EngineError('COST_INVALID','Cost evidence object required',422);const e=input as CostEvidence;const keys=['id','mode','delayDays','changedCorrect','changedTotal','controlCorrect','controlTotal'];if(Object.keys(e).some(k=>!keys.includes(k))||!validCost(e))throw new EngineError('COST_INVALID','Invalid matched probe counts',422);return this.store.transaction(s=>{const entries=s.costEvidence??=[];const old=entries.find(x=>x.id===e.id);if(old){if(keys.some(k=>old[k as keyof CostEvidence]!==e[k as keyof CostEvidence]))throw new EngineError('COST_DUPLICATE','Evidence ID already in use',409);return old;}if(entries.length>=256)throw new EngineError('COST_LIMIT','Evidence cap reached',409);entries.push({...e});return e;});}
  async costReport(){const evidence=(await this.store.read()).costEvidence??[];return {source:'caller_reported_not_verified',knowledge:estimateCost(evidence,'unaided'),visual:estimateCost(evidence,'cued'),batches:evidence.length};}
  async review(id:string,input:unknown,context?:unknown){return this.store.transaction(s=>{const p=find(s.publications,id);if(!Array.isArray(input)||input.length!==p.scene.objects.length)throw new EngineError('REVIEW_INVALID','Rate every atom exactly once',422);const parsed=parseReviewContext(s,p,input,context);const remaining=new Set(p.scene.objects.map(o=>o.atomId));const atoms:Review['atoms']=input.map((item:unknown)=>{if(!item||typeof item!=='object')throw new EngineError('REVIEW_INVALID','Invalid rating');const a=item as Record<string,unknown>;if(typeof a.atomId!=='string'||!remaining.delete(a.atomId)||!['correct','missed','uncertain'].includes(a.grade as string))throw new EngineError('REVIEW_INVALID','Unknown/duplicate atom or invalid grade',422);const confusion=parsed.confusions.get(a.atomId);if(a.confusedWith!==undefined&&!confusion)throw new EngineError('REVIEW_CONFUSION','Confusion requires explicit context',422);return {atomId:a.atomId,grade:a.grade as Review['atoms'][number]['grade'],...(confusion?{confusedWith:confusion}:{})};});const review:Review={id:randomUUID(),publicationId:id,createdAt:new Date().toISOString(),atoms,...parsed.context};s.reviews.push(review);return review;});}
  async feedback(id:string){const s=await this.store.read();const p=find(s.publications,id);const reviews=s.reviews.filter(r=>r.publicationId===id);return {publicationId:id,reviewCount:reviews.length,atoms:p.scene.objects.map(o=>{const ratings=reviews.flatMap(r=>r.atoms.filter(a=>a.atomId===o.atomId));const misses=ratings.filter(a=>a.grade==='missed').length;return {atomId:o.atomId,misses,uncertain:ratings.filter(a=>a.grade==='uncertain').length,suggestion:misses>=2?'核对原知识理解；若理解正确，再考虑强化这一视觉线索。保留位置和旧版本。':'继续收集回忆证据。'};})};}
  async palaceRecall(id:string,input:unknown){
    return this.store.transaction(state=>{
      const palace=(state.palaces??[]).find(item=>item.id===id);
      if(!palace)throw new EngineError('PALACE_NOT_FOUND','Palace not found',404);
      if(!input||typeof input!=='object'||Array.isArray(input))throw new EngineError('PALACE_RECALL_INVALID','Recall event object required',422);
      const raw=input as Record<string,unknown>;
      const allowed=['conceptId','grade','mode','revealed','sessionId','confusedWith','responseMs','confidence','startedAt'];
      if(Object.keys(raw).some(key=>!allowed.includes(key)))throw new EngineError('PALACE_RECALL_INVALID','Unknown recall event field',422);
      if(typeof raw.conceptId!=='string'||!palace.objects.some(object=>object.conceptId===raw.conceptId))throw new EngineError('PALACE_RECALL_CONCEPT','Concept does not exist in this palace',422);
      if(!['cued','unaided'].includes(raw.mode as string)||!['correct','missed','uncertain'].includes(raw.grade as string)||typeof raw.revealed!=='boolean')throw new EngineError('PALACE_RECALL_INVALID','mode, grade and revealed are required',422);
      const sessionId=typeof raw.sessionId==='string'&&raw.sessionId.trim()&&raw.sessionId.length<=120?raw.sessionId.trim():randomUUID();
      let confusedWith:string|undefined;
      if(raw.confusedWith!==undefined){
        if(raw.grade!=='missed'||typeof raw.confusedWith!=='string'||raw.confusedWith===raw.conceptId||!palace.objects.some(object=>object.conceptId===raw.confusedWith))throw new EngineError('PALACE_RECALL_CONFUSION','A wrong selection must reference a different existing concept',422);
        confusedWith=raw.confusedWith;
      }
      let responseMs:number|undefined;
      if(raw.responseMs!==undefined){
        if(typeof raw.responseMs!=='number'||!Number.isInteger(raw.responseMs)||raw.responseMs<0||raw.responseMs>600000)throw new EngineError('PALACE_RECALL_TIME','responseMs must be an integer from 0 to 600000',422);
        responseMs=raw.responseMs;
      }
      let confidence:number|undefined;
      if(raw.confidence!==undefined){
        if(typeof raw.confidence!=='number'||!Number.isInteger(raw.confidence)||raw.confidence<1||raw.confidence>5)throw new EngineError('PALACE_RECALL_CONFIDENCE','confidence must be an integer from 1 to 5',422);
        confidence=raw.confidence;
      }
      let startedAt:string|undefined;
      if(raw.startedAt!==undefined){
        if(typeof raw.startedAt!=='string'||!Number.isFinite(Date.parse(raw.startedAt))||new Date(Date.parse(raw.startedAt)).toISOString()!==raw.startedAt)throw new EngineError('PALACE_RECALL_START','startedAt must be a canonical ISO timestamp',422);
        const t=Date.parse(raw.startedAt),now=Date.now();
        if(t>now+30000||t<now-12*60000)throw new EngineError('PALACE_RECALL_START','startedAt must be within the last 12 minutes',422);
        startedAt=raw.startedAt;
      }
      state.palaceRecalls??=[];
      if(state.palaceRecalls.filter(event=>event.palaceId===id).length>=20000)throw new EngineError('PALACE_RECALL_LIMIT','Recall event limit reached for this palace',409);
      const event:PalaceRecall={id:randomUUID(),palaceId:id,sessionId,conceptId:raw.conceptId,createdAt:new Date().toISOString(),...(startedAt?{startedAt}:{}),mode:raw.mode as 'cued'|'unaided',grade:raw.grade as 'correct'|'missed'|'uncertain',revealed:raw.revealed,...(confusedWith?{confusedWith}:{}),...(responseMs!==undefined?{responseMs}:{}),...(confidence!==undefined?{confidence}:{})};
      state.palaceRecalls.push(event);
      return event;
    });
  }
  async palaceExposure(id:string,input:unknown){
    return this.store.transaction(state=>{
      const palace=(state.palaces??[]).find(item=>item.id===id);
      if(!palace)throw new EngineError('PALACE_NOT_FOUND','Palace not found',404);
      if(!input||typeof input!=='object'||Array.isArray(input))throw new EngineError('PALACE_EXPOSURE_INVALID','Exposure event object required',422);
      const raw=input as Record<string,unknown>;
      const allowed=['eventId','conceptId','sessionId','startedAt','durationMs'];
      if(Object.keys(raw).some(key=>!allowed.includes(key)))throw new EngineError('PALACE_EXPOSURE_INVALID','Unknown exposure event field',422);
      if(typeof raw.conceptId!=='string'||!palace.objects.some(object=>object.conceptId===raw.conceptId))throw new EngineError('PALACE_EXPOSURE_CONCEPT','Concept does not exist in this palace',422);
      if(typeof raw.startedAt!=='string'||!Number.isFinite(Date.parse(raw.startedAt))||new Date(Date.parse(raw.startedAt)).toISOString()!==raw.startedAt)throw new EngineError('PALACE_EXPOSURE_START','startedAt must be a canonical ISO timestamp',422);
      if(typeof raw.durationMs!=='number'||!Number.isInteger(raw.durationMs)||raw.durationMs<1000||raw.durationMs>600000)throw new EngineError('PALACE_EXPOSURE_DURATION','durationMs must be an integer from 1000 to 600000',422);
      const start=Date.parse(raw.startedAt),now=Date.now(),end=start+raw.durationMs;
      if(start>now+30000||start<now-15*60000||end>now+30000||end<now-120000)throw new EngineError('PALACE_EXPOSURE_WINDOW','Exposure time must describe a recent completed view',422);
      const sessionId=typeof raw.sessionId==='string'&&raw.sessionId.trim()&&raw.sessionId.length<=120?raw.sessionId.trim():randomUUID();
      const eventId=typeof raw.eventId==='string'&&raw.eventId.trim()&&raw.eventId.length<=120?raw.eventId.trim():randomUUID();
      state.palaceExposures??=[];
      const existing=state.palaceExposures.find(event=>event.palaceId===id&&event.id===eventId);
      if(existing){
        if(existing.conceptId===raw.conceptId&&existing.sessionId===sessionId&&existing.startedAt===raw.startedAt&&existing.durationMs===raw.durationMs)return existing;
        throw new EngineError('PALACE_EXPOSURE_DUPLICATE','eventId already exists with different content',409);
      }
      if(state.palaceExposures.filter(event=>event.palaceId===id).length>=50000)throw new EngineError('PALACE_EXPOSURE_LIMIT','Exposure event limit reached for this palace',409);
      const event:PalaceExposure={id:eventId,palaceId:id,sessionId,conceptId:raw.conceptId,startedAt:raw.startedAt,createdAt:new Date().toISOString(),durationMs:raw.durationMs,surface:'inspector'};
      state.palaceExposures.push(event);
      return event;
    });
  }
  async palaceLearning(id:string){
    const state=await this.store.read();
    const palace=(state.palaces??[]).find(item=>item.id===id);
    if(!palace)throw new EngineError('PALACE_NOT_FOUND','Palace not found',404);
    return buildPalaceLearningReport(palace,state.palaceRecalls??[],Date.now(),state.palaceExposures??[]);
  }
  async palaceReviewPlan(id:string,budgetSeconds:number,policy:string){
    if(!Number.isInteger(budgetSeconds)||budgetSeconds<0||budgetSeconds>3600||(policy!=='adaptive'&&policy!=='fixed'&&policy!=='marginal'))throw new EngineError('REVIEW_PLAN_INVALID','budgetSeconds must be an integer 0–3600 and policy adaptive, marginal or fixed',422);
    const state=await this.store.read(),now=Date.now();
    const palace=(state.palaces??[]).find(item=>item.id===id);
    if(!palace)throw new EngineError('PALACE_NOT_FOUND','Palace not found',404);
    const recalls=(state.palaceRecalls??[]).filter(event=>event.palaceId===id&&Number.isFinite(Date.parse(event.createdAt))&&Date.parse(event.createdAt)<=now);
    const report=buildPalaceLearningReport(palace,recalls,now,state.palaceExposures??[]);
    const candidates=report.items.map(item=>{const days=recalls.filter(r=>r.conceptId===item.conceptId).map(r=>Date.parse(r.createdAt));return {conceptId:item.conceptId,label:item.label,observations:item.observations.unaided,lastAttemptAt:days.length?Math.max(...days):null,estimatedRecall:item.memory.unaided.estimatedRecall,marginalGain:item.marginalReview.gain,costSeconds:Math.max(15,Math.min(120,Math.ceil((item.responseTime.medianMs??20000)/1000)+10))};});
    return planReviews(candidates,now,budgetSeconds,policy);
  }
  async palaceLearningExport(id:string){
    const state=await this.store.read();
    const palace=(state.palaces??[]).find(item=>item.id===id);
    if(!palace)throw new EngineError('PALACE_NOT_FOUND','Palace not found',404);
    const recalls=(state.palaceRecalls??[]).filter(event=>event.palaceId===id);
    const exposures=(state.palaceExposures??[]).filter(event=>event.palaceId===id);
    const quote=(value:unknown)=>{let text=String(value??'');if(/^[\s]*[=+@-]/.test(text))text="'"+text;return /[",\r\n]/.test(text)?'"'+text.replace(/"/g,'""')+'"':text;};
    const header=['eventType','eventId','palaceId','conceptId','sessionId','startedAt','createdAt','durationMs','mode','grade','revealed','responseMs','confidence','confusedWith'];
    const rows=[
      ...exposures.map(event=>['exposure',event.id,event.palaceId,event.conceptId,event.sessionId,event.startedAt,event.createdAt,event.durationMs,'','','','','','']),
      ...recalls.map(event=>['recall',event.id,event.palaceId,event.conceptId,event.sessionId,event.startedAt??'',event.createdAt,'',event.mode,event.grade,event.revealed,event.responseMs??'',event.confidence??'',event.confusedWith??'']),
    ].sort((a,b)=>String(a[6]).localeCompare(String(b[6])));
    return {filename:`memory-palace-${id}-learning.csv`,content:[header,...rows].map(row=>row.map(quote).join(',')).join('\r\n')+'\r\n'};
  }
}
