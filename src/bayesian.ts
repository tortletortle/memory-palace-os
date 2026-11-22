import {interferenceMatrix,loadFor} from './adaptive.ts';
import type {CueFeature,Trial,Mode,Change} from './adaptive.ts';
// Engineering latent-state model; not an anatomical or validated psychological model.
const clamp=(x:number,lo=0,hi=1)=>Math.max(lo,Math.min(hi,x));
const grid=[.5,1,2,4,8,16,32,64];
const prior=[.07,.13,.21,.24,.18,.10,.05,.02];
const decay=(dt:number,h:number)=>2**(-Math.max(0,dt)/h);
const normalize=(weights:number[])=>{const sum=weights.reduce((a,b)=>a+b,0);return weights.map(w=>w/sum);};
const mean=(w:number[],x:number[])=>w.reduce((s,p,i)=>s+p*x[i],0);
function quantile(w:number[],x:number[],q:number){const sorted=x.map((v,i)=>({v,w:w[i]})).sort((a,b)=>a.v-b.v);let s=0;for(const a of sorted){s+=a.w;if(s>=q)return a.v;}return sorted.at(-1)!.v;}
export type RecodingEvent={day:number;knowledgeLoss:number;visualLoss:number};
export function cleanTrials(trials:Trial[],start=-Infinity,now=Infinity){return trials.filter(t=>Number.isFinite(t.day)&&t.day>=start&&t.day<=now&&['cued','unaided'].includes(t.mode)&&['correct','missed','uncertain'].includes(t.grade)).sort((a,b)=>a.day-b.day);}
export function dualMemory(start:number,trials:Trial[],now:number,load=0,changes:RecodingEvent[]=[]){
  if(!Number.isFinite(start)||!Number.isFinite(now)||now<start||!Number.isFinite(load)||load<0)throw new Error('Invalid dual memory parameters');
  const pairs=grid.flatMap(k=>grid.map(v=>({k,v})));let weights=prior.flatMap(k=>prior.map(v=>k*v));
  let lastK=start,lastV=start,gK=1,gV=1,lastObs=-Infinity,unaided=0,cued=0;
  // Load is a fixed present-day proxy, not true historical load. Version epochs should be fitted separately.
  const p=(x:{k:number;v:number},day:number,mode:Mode)=>{const k=decay(day-lastK,x.k*gK),v=decay(day-lastV,x.v*gV);return mode==='unaided'?k:k+(1-k)*v*clamp(1-.65*load,.05,1);};
  const events=[...cleanTrials(trials,start,now).map(t=>({day:t.day,trial:t})),...changes.filter(c=>c.day>=start&&c.day<=now&&[c.day,c.knowledgeLoss,c.visualLoss].every(Number.isFinite)&&c.knowledgeLoss>=0&&c.knowledgeLoss<=1&&c.visualLoss>=0&&c.visualLoss<=1).map(c=>({day:c.day,change:c}))].sort((a,b)=>a.day-b.day);
  for(const e of events){if('change' in e){const c=e.change;gK*=1-.6*c.knowledgeLoss;gV*=1-.8*c.visualLoss;gK=Math.max(.25,gK);gV=Math.max(.25,gV);continue;}
    const t=e.trial;const dt=t.day-lastK;const dv=t.day-lastV;
    if(t.grade!=='uncertain'&&t.day-lastObs>=.05&&(t.mode==='unaided'?dt:Math.min(dt,dv))>=.05){weights=normalize(weights.map((w,i)=>{const prob=clamp(p(pairs[i],t.day,t.mode),.015,.985);return w*(t.grade==='correct'?prob:1-prob);}));lastObs=t.day;if(t.mode==='unaided')unaided++;else cued++;}
    if(t.revealed&&dt>=.05){gK=Math.min(16,gK*(t.grade==='correct'?1+.33*Math.log1p(dt):1.08));lastK=t.day;}
    if(t.revealed&&t.mode==='cued'&&dv>=.05){gV=Math.min(16,gV*(t.grade==='correct'?1+.37*Math.log1p(dv):1.12));lastV=t.day;}
  }
  function forecast(day:number){if(!Number.isFinite(day)||day<now)throw new Error('Forecast in the past');const ks=pairs.map(x=>decay(day-lastK,x.k*gK)),vs=pairs.map(x=>decay(day-lastV,x.v*gV)),cs=pairs.map(x=>p(x,day,'cued'));return {knowledge:mean(weights,ks),visual:mean(weights,vs),cued:mean(weights,cs),knowledgeInterval:[quantile(weights,ks,.1),quantile(weights,ks,.9)],visualInterval:[quantile(weights,vs,.1),quantile(weights,vs,.9)]};}
  return {now:forecast(now),day7:forecast(now+7),day28:forecast(now+28),observations:{unaided,cued},evidence:unaided>=3&&cued>=3?'mixed_observations':'weakly_identified',lastKnowledgeExposure:lastK,lastVisualExposure:lastV,posterior:pairs.map((x,i)=>({knowledgeHalfLife:x.k*gK,visualHalfLife:x.v*gV,weight:weights[i]}))};
}
// Matched probe counts: same delay and study budget, no answer feedback before probing.
// Caller-reported data; control condition is approximated by its observed rate, integrated over a grid.
export type CostEvidence={id:string;mode:Mode;delayDays:number;changedCorrect:number;changedTotal:number;controlCorrect:number;controlTotal:number};
const costs=[0,.08,.18,.32,.5,.7,.9];const costPrior=[.16,.23,.24,.17,.11,.065,.025];
export function validCost(e:CostEvidence){return !!e&&typeof e.id==='string'&&e.id.length>0&&e.id.length<=100&&['cued','unaided'].includes(e.mode)&&Number.isFinite(e.delayDays)&&e.delayDays>=0&&e.delayDays<=28&&[e.changedCorrect,e.changedTotal,e.controlCorrect,e.controlTotal].every(Number.isInteger)&&e.changedTotal>=1&&e.controlTotal>=1&&e.changedTotal<=200&&e.controlTotal<=200&&e.changedCorrect>=0&&e.changedCorrect<=e.changedTotal&&e.controlCorrect>=0&&e.controlCorrect<=e.controlTotal;}
export function estimateCost(evidence:CostEvidence[],mode:Mode){
  let logs=costPrior.map(Math.log),used=0;const seen=new Set<string>();
  for(const e of evidence){if(!validCost(e)||e.mode!==mode||seen.has(e.id))continue;seen.add(e.id);used++;
    // Integrate uncertain baseline rate with a discrete Beta(1+success,1+failure) posterior.
    const ps=Array.from({length:39},(_,i)=>(i+1)/40);const bw=ps.map(p=>e.controlCorrect*Math.log(p)+(e.controlTotal-e.controlCorrect)*Math.log1p(-p));const bm=Math.max(...bw);const b=normalize(bw.map(w=>Math.exp(w-bm)));
    logs=logs.map((l,i)=>{const terms=ps.map((p,j)=>{const rate=clamp(p*(1-costs[i]*Math.exp(-e.delayDays/14)),1e-6,1-1e-6);return Math.log(b[j])+e.changedCorrect*Math.log(rate)+(e.changedTotal-e.changedCorrect)*Math.log1p(-rate);});const m=Math.max(...terms);return l+m+Math.log(terms.reduce((s,x)=>s+Math.exp(x-m),0));});
  }
  const m=Math.max(...logs),weights=normalize(logs.map(l=>Math.exp(l-m)));return {mean:mean(weights,costs),interval:[quantile(weights,costs,.1),quantile(weights,costs,.9)],evidenceBatches:used,source:used?'reported_matched_probes':'prior_only',posterior:costs.map((cost,i)=>({cost,weight:weights[i]}))};
}
export type BayesianChange=Change&{probabilityPositive:number;expectedUtility:number;downside10:number;knowledgeCost:number;visualCost:number;confusionEvidence:number;estimatedVisualGain:number;};
export function bayesianDecision(cues:CueFeature[],history:ReadonlyMap<string,Trial[]>,alternatives:ReadonlyMap<string,CueFeature[]>,now:number,startById:ReadonlyMap<string,number>,evidence:CostEvidence[]=[],epochs:ReadonlyMap<string,RecodingEvent[]>=new Map()):BayesianChange|null{
  const clean=new Map([...history].map(([id,h])=>{const spaced:Trial[]=[];for(const t of cleanTrials(h,startById.get(id)??0,now).filter(t=>t.mode==='cued'&&t.grade!=='uncertain'))if(!spaced.length||t.day-spaced.at(-1)!.day>=.05)spaced.push(t);return [id,spaced];}));
  const matrix=interferenceMatrix(cues,clean),kc=estimateCost(evidence,'unaided'),vc=estimateCost(evidence,'cued');let best:BayesianChange|null=null;
  for(const cue of cues){const recent=(clean.get(cue.id)??[]).slice(-8),errors=recent.filter(t=>t.grade==='missed'),conf=errors.filter(t=>t.confusedWith&&cues.some(c=>c.id===t.confusedWith&&c.meaning!==cue.meaning)).length;
    if(recent.length<4||errors.length<2||conf<2)continue;
    const currentLoad=loadFor(cue.id,matrix);const state=dualMemory(startById.get(cue.id)??0,history.get(cue.id)??[],now,currentLoad,epochs.get(cue.id)??[]);
    // Beta posterior over observed confusion probability. Do not infer confusion from generic misses.
    const risks=Array.from({length:19},(_,i)=>(i+1)/20);const riskWeights=normalize(risks.map(p=>p**(conf)*(1-p)**(recent.length-conf+2)));
    for(const alt of alternatives.get(cue.id)??[]){if(alt.id!==cue.id||alt.meaning!==cue.meaning||alt.position.length!==cue.position.length||alt.position.some((x,i)=>x!==cue.position[i])||(alt.asset===cue.asset&&alt.action===cue.action))continue;
      const next=interferenceMatrix(cues.map(c=>c.id===cue.id?alt:c),clean);const reduction=currentLoad-loadFor(cue.id,next);if(reduction<=.05)continue;
      const spill=cues.filter(c=>c.id!==cue.id).reduce((sum,c)=>sum+loadFor(c.id,matrix)-loadFor(c.id,next),0);const ratio=clamp(reduction/Math.max(.1,currentLoad));
      // Weighted 7d/28d utility proxy with relearning shock. Cost posteriors and risk grid independent approximation.
      const K=.6*state.day7.knowledge+.4*state.day28.knowledge,V=.6*state.day7.visual+.4*state.day28.visual;
      const values:number[]=[],weights:number[]=[];let benefit=0;
      for(let r=0;r<risks.length;r++){const gain=risks[r]*ratio*(.55+.45*V);benefit+=riskWeights[r]*gain;
        for(const k of kc.posterior)for(const v of vc.posterior){const utility=.60*gain+.10*clamp(spill,-1,1)-.55*K*k.cost-.30*(.35+.65*V)*v.cost-.025;values.push(utility);weights.push(riskWeights[r]*k.weight*v.weight);}}
      const expected=mean(weights,values),prob=weights.reduce((s,w,i)=>s+(values[i]>0?w:0),0),downside=quantile(weights,values,.1);
      if(expected<=.012||prob<.65||downside<-.12)continue;
      if(!best||expected>best.expectedUtility)best={target:cue.id,replacement:alt,reduction,score:expected,misses:errors.length,reason:'Bayesian utility proxy; human confirmation required',probabilityPositive:prob,expectedUtility:expected,downside10:downside,knowledgeCost:kc.mean,visualCost:vc.mean,confusionEvidence:conf,estimatedVisualGain:benefit};
    }
  }return best;
}
