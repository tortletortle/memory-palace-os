import {chooseChange,estimateMemory} from '../src/adaptive.ts';
import type {CueFeature,Trial} from '../src/adaptive.ts';
export const scenarios=['visual_interference','weak_interference','replacement_cost'] as const;
export const policies=['fixed','miss_only','matrix_adaptive','guarded_matrix'] as const;
export type Scenario=typeof scenarios[number];export type Policy=typeof policies[number];
export const N=24,DAYS=42,PER_DAY=8;
// Keyed common random numbers: same item/day/mode shocks across policies, independent of order.
function uniform(seed:number,...keys:number[]){let h=seed|0;for(const k of keys){h=Math.imul(h^k,0x9e3779b1);h^=h>>>16;h=Math.imul(h,0x85ebca6b);h^=h>>>13;}return (h>>>0)/4294967296;}
const feature=(i:number,v:number):CueFeature=>({id:`i${i}`,meaning:`fact-${i}`,asset:`asset-${v}`,shape:`shape-${v%3}`,color:`color-${v%5}`,action:`action-${v%4}`,position:[i%6,0,Math.floor(i/6)*2]});
export type Outcome={seed:number;scenario:Scenario;policy:Policy;reviews:number;changes:number;trainingCorrect:number;cued7:number;unaided7:number;cued28:number;unaided28:number;brier:number;confusions:number;};
// Virtual learner uses a power-law retention curve, latent difficulty, cue crowding, and replacement shock.
// The estimator sees only binary observations and rendered features, not these latent state fields.
export function simulate(seed:number,scenario:Scenario,policy:Policy):Outcome{
  let cues=Array.from({length:N},(_,i)=>feature(i,Math.floor(i/3)%5));
  const options=new Map(cues.map((c,i)=>[c.id,[1,2,3].map(k=>feature(i,5+Math.floor(uniform(seed,10,i,k)*18)))]));
  const history=new Map<string,Trial[]>(cues.map(c=>[c.id,[]]));const strengths=cues.map((_,i)=>.7+2.1*uniform(seed,11,i));const aptitude=cues.map((_,i)=>.85+.4*uniform(seed,12,i));const last=cues.map(()=>0),changeDay=cues.map(()=>-100),changed=new Set<string>();
  let reviews=0,correct=0,confusions=0,changes=0,brier=0;
  function crowd(i:number){return cues.map((b,j)=>({j,w:i===j?0:(Number(cues[i].asset===b.asset)*.72+Number(cues[i].color===b.color)*.13+Number(cues[i].shape===b.shape)*.15)/(1+.15*Math.hypot(cues[i].position[0]-b.position[0],cues[i].position[2]-b.position[2]))})).sort((a,b)=>b.w-a.w);}
  function probability(i:number,day:number,mode:'cued'|'unaided'){
    const dt=day-last[i],strength=strengths[i];const retention=(1+dt/(strength*(mode==='cued'?1.2:1)))**(-.67);
    const near=crowd(i),load=near[0].w+.25*near[1].w;
    const interference=scenario==='visual_interference'?.48:scenario==='weak_interference'?.025:.16;
    const shock=(scenario==='replacement_cost'?.53:.19)*Math.exp(-(day-changeDay[i])/5);
    return Math.max(.01,Math.min(.985,aptitude[i]*retention*(1-(mode==='cued'?interference:.18*interference)*load)*(1-shock)));
  }
  for(let day=1;day<=DAYS;day++){
    // Same item schedule, same number of practice trials, answer exposure after every trial.
    for(let n=0;n<PER_DAY;n++){
      const i=((day-1)*PER_DAY+n)%N,c=cues[i],mode=(Math.floor((day-1)/3)%4===3?'unaided':'cued');const h=history.get(c.id)!;
      const predicted=estimateMemory(0,h,day,mode).estimatedRecall;
      const ok=uniform(seed,20,day,i)<probability(i,day,mode);brier+=(predicted-Number(ok))**2;
      const near=crowd(i);const confused=!ok&&mode==='cued'&&uniform(seed,21,day,i)<near[0].w*(scenario==='visual_interference'?.8:.12);
      h.push({day,mode,grade:ok?'correct':'missed',revealed:true,...(confused?{confusedWith:cues[near[0].j].id}:{})});reviews++;correct+=Number(ok);confusions+=Number(confused);
      const dt=day-last[i];strengths[i]=Math.min(80,strengths[i]*(ok?1+.31*Math.log1p(dt)*aptitude[i]:1.10));last[i]=day;
    }
    if(policy!=='fixed'&&day%7===0&&day<DAYS){
      // One replacement max per week; never replace the same cue twice. Same practice schedule for all.
      const available=new Map([...options].filter(([k])=>!changed.has(k)));
      const choice=chooseChange(cues,history,available,policy!=='miss_only',policy==='guarded_matrix');
      if(choice){const i=cues.findIndex(c=>c.id===choice.target);cues[i]=choice.replacement;changed.add(choice.target);changes++;changeDay[i]=day;
        // Recoding cost, not a free improvement. Also persists partially into unaided memory.
        strengths[i]*=scenario==='replacement_cost'?.56:.90;
      }
    }
  }
  // Independent delayed probes; no feedback, no updating state between the 7d and 28d probes.
  const test=(delay:number,mode:'cued'|'unaided')=>cues.reduce((sum,_,i)=>sum+Number(uniform(seed,30,delay,i,mode==='cued'?1:2)<probability(i,DAYS+delay,mode)),0)/N;
  return {seed,scenario,policy,reviews,changes,trainingCorrect:correct/reviews,cued7:test(7,'cued'),unaided7:test(7,'unaided'),cued28:test(28,'cued'),unaided28:test(28,'unaided'),brier:brier/reviews,confusions};
}
