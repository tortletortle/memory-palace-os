import {chooseChange,estimateMemory} from '../src/adaptive.ts';
import {bayesianDecision,dualMemory,estimateCost} from '../src/bayesian.ts';
import type {CueFeature,Trial,Mode} from '../src/adaptive.ts';
import type {CostEvidence,RecodingEvent} from '../src/bayesian.ts';
export const profiles=['visual_power','weak_exponential','high_cost','mixed_heterogeneous','context_drift','semantic_collision'] as const;
export const strategies=['fixed','miss_only','guarded_v3','bayes_prior','bayes_adaptive'] as const;
export type Profile=typeof profiles[number];export type Strategy=typeof strategies[number];
export const ITEMS=24,DAYS=42,DAILY=8;
const clamp=(v:number,min=.005,max=.995)=>Math.max(min,Math.min(max,v));
export function uniform(seed:number,...keys:number[]){let h=seed|0;for(const k of keys){h=Math.imul(h^k,0x9e3779b1);h^=h>>>16;h=Math.imul(h,0x85ebca6b);h^=h>>>13;}return (h>>>0)/4294967296;}
const feature=(i:number,v:number):CueFeature=>({id:`i${i}`,meaning:`fact-${i}`,asset:`asset-${v}`,shape:`shape-${v%3}`,color:`color-${v%5}`,action:`action-${v%4}`,position:[i%6,0,Math.floor(i/6)*2]});
export type Result={seed:number;profile:Profile;strategy:Strategy;reviews:number;calibrationProbes:number;changes:number;unaided7:number;cued7:number;unaided28:number;cued28:number;trainingAccuracy:number;confusions:number;brierDual:number;brierV3:number;estimatedKCost:number;estimatedVCost:number;trueKCost:number;trueVCost:number;};
export function runLearner(seed:number,profile:Profile,strategy:Strategy):Result{
 const rnd=(...keys:number[])=>uniform(seed,...keys),mixed=['mixed_heterogeneous','context_drift','semantic_collision'].includes(profile);
 const baseInterference=profile==='visual_power'?.70:profile==='weak_exponential'?.035:profile==='high_cost'?.40:.20+.65*rnd(1);
 const trueKCost=profile==='high_cost'?.55+.30*rnd(2):profile==='visual_power'?.02+.10*rnd(2):profile==='weak_exponential'?.15+.20*rnd(2):.03+.65*rnd(2);
 const trueVCost=profile==='high_cost'?.55+.32*rnd(3):profile==='visual_power'?.03+.13*rnd(3):profile==='weak_exponential'?.20+.30*rnd(3):.05+.70*rnd(3);
 let cues=Array.from({length:ITEMS},(_,i)=>feature(i,Math.floor(i/3)%5));const options=new Map(cues.map((c,i)=>[c.id,[1,2,3].map(k=>feature(i,5+Math.floor(rnd(4,i,k)*20)))]));
 const history=new Map<string,Trial[]>(cues.map(c=>[c.id,[]])),epochs=new Map<string,RecodingEvent[]>(),starts=new Map(cues.map(c=>[c.id,0])),changed=new Set<string>();
 const K=cues.map((_,i)=>.55+3.1*rnd(5,i)),V=cues.map((_,i)=>.7+4.6*rnd(6,i)),lastK=cues.map(()=>0),lastV=cues.map(()=>0),lastChange=cues.map(()=>-100),apt=cues.map((_,i)=>.85+.30*rnd(7,i));
 let trainCorrect=0,confusions=0,changes=0,brierDual=0,brierV3=0,calibrationProbes=0;const evidence:CostEvidence[]=[];
 function crowd(i:number){return cues.map((b,j)=>({j,w:i===j?0:(.72*Number(cues[i].asset===b.asset)+.14*Number(cues[i].color===b.color)+.14*Number(cues[i].shape===b.shape))/(1+.14*Math.hypot(cues[i].position[0]-b.position[0],cues[i].position[2]-b.position[2]))})).sort((a,b)=>b.w-a.w);}
 function retention(dt:number,s:number,i:number,visual=false){const f=profile==='weak_exponential'?0:profile==='visual_power'?1:Math.floor(rnd(8,i,visual?1:0)*3);return f===0?Math.exp(-Math.log(2)*dt/s):f===1?(1+dt/s)**(-.72):.58*Math.exp(-dt/s)+.42*(1+dt/(2*s))**(-.5);}
 function probability(i:number,day:number,mode:Mode){const k=retention(day-lastK[i],K[i],i),v=retention(day-lastV[i],V[i],i,true),near=crowd(i),load=near[0].w+.25*near[1].w;
 const drift=profile==='context_drift'&&day>=23?.23+.6*Number(i%3===0):1,sem=profile==='semantic_collision'?.28*Number(i%3!==0):0;
 const costK=1-trueKCost*Math.exp(-(day-lastChange[i])/(mixed?6+14*rnd(9,i):12)),costV=1-trueVCost*Math.exp(-(day-lastChange[i])/(mixed?4+16*rnd(10,i):12));
 const pk=clamp(k*costK*apt[i]*(1-.04*baseInterference*load)),pv=clamp(v*costV*(1-clamp(baseInterference*drift*load+sem,0,.95)));
 return mode==='unaided'?pk:profile==='visual_power'?clamp(.35*pk+.65*pv):profile==='mixed_heterogeneous'&&i%3===0?clamp(.65*pk+.35*pv):clamp(pk+(1-pk)*pv*.88);}
 // Independent calibration pools, same probe budget for every strategy. No hidden state enters the decision.
 function calibrate(day:number){for(const mode of ['cued','unaided'] as const){const n=16,delay=day===7?2:7,base=.62+.23*rnd(11,day,mode==='cued'?1:2),cost=mode==='cued'?trueVCost:trueKCost;let changedCorrect=0,controlCorrect=0;for(let j=0;j<n;j++){changedCorrect+=Number(rnd(12,day,j,mode==='cued'?1:2)<base*(1-cost*Math.exp(-delay/(mixed?9:12))));controlCorrect+=Number(rnd(13,day,j,mode==='cued'?1:2)<base);}evidence.push({id:`cal-${day}-${mode}`,mode,delayDays:delay,changedCorrect,changedTotal:n,controlCorrect,controlTotal:n});calibrationProbes+=2*n;}}
 for(let day=1;day<=DAYS;day++){
 for(let n=0;n<DAILY;n++){const i=((day-1)*DAILY+n)%ITEMS,c=cues[i],mode:Mode=Math.floor((day-1)/3)%4===3?'unaided':'cued',h=history.get(c.id)!;
 const near=crowd(i),d=dualMemory(0,h,day,near[0].w*.65,epochs.get(c.id)??[]).now,pv=estimateMemory(0,h,day,mode).estimatedRecall;
 const ok=rnd(20,day,i)<probability(i,day,mode);brierDual+=((mode==='cued'?d.cued:d.knowledge)-Number(ok))**2;brierV3+=(pv-Number(ok))**2;
 const semantic=profile==='semantic_collision'&&rnd(21,day,i)<.7,confusion=!ok&&mode==='cued'&&rnd(22,day,i)<(semantic?.8:clamp(near[0].w*baseInterference*1.35,0,.95)),other=semantic?(i+7)%ITEMS:near[0].j;
 h.push({day,mode,grade:ok?'correct':'missed',revealed:true,...(confusion?{confusedWith:cues[other].id}:{})});trainCorrect+=Number(ok);confusions+=Number(confusion);
 const dt=day-lastK[i],dv=day-lastV[i];K[i]=Math.min(95,K[i]*(ok?1+.27*Math.log1p(dt)*apt[i]:1.09));lastK[i]=day;if(mode==='cued'){V[i]=Math.min(95,V[i]*(ok?1+.32*Math.log1p(dv)*apt[i]:1.11));lastV[i]=day;}}
 if(day===7||day===21)calibrate(day);
 if(strategy!=='fixed'&&day%7===0&&day<DAYS){const available=new Map([...options].filter(([id])=>!changed.has(id)));const choice=strategy==='guarded_v3'||strategy==='miss_only'?chooseChange(cues,history,available,strategy==='guarded_v3',strategy==='guarded_v3'):bayesianDecision(cues,history,available,day,starts,strategy==='bayes_adaptive'?evidence:[],epochs);
 if(choice){const i=cues.findIndex(c=>c.id===choice.target);cues[i]=choice.replacement;changed.add(choice.target);changes++;lastChange[i]=day;K[i]*=1-.65*trueKCost;V[i]*=1-.8*trueVCost;const data=strategy==='bayes_adaptive'?evidence:[];epochs.set(choice.target,[{day,knowledgeLoss:estimateCost(data,'unaided').mean,visualLoss:estimateCost(data,'cued').mean}]);}}}
 const probe=(delay:number,mode:Mode)=>cues.reduce((s,_,i)=>s+Number(rnd(30,delay,i,mode==='cued'?1:2)<probability(i,DAYS+delay,mode)),0)/ITEMS;
 return {seed,profile,strategy,reviews:DAYS*DAILY,calibrationProbes,changes,unaided7:probe(7,'unaided'),cued7:probe(7,'cued'),unaided28:probe(28,'unaided'),cued28:probe(28,'cued'),trainingAccuracy:trainCorrect/(DAYS*DAILY),confusions,brierDual:brierDual/(DAYS*DAILY),brierV3:brierV3/(DAYS*DAILY),estimatedKCost:estimateCost(evidence,'unaided').mean,estimatedVCost:estimateCost(evidence,'cued').mean,trueKCost,trueVCost};}
