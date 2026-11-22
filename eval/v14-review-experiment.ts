import {planReviews,DAY_MS} from '../src/spatial/review-planner.ts';
import type {ReviewPolicy} from '../src/spatial/review-planner.ts';
import {dualMemory} from '../src/bayesian.ts';
import type {Trial} from '../src/adaptive.ts';
import {writeFileSync} from 'node:fs';
const N=24,days=21,seeds=24,budget=180;
const scenarios=['heterogeneous','homogeneous','abrupt_shift'] as const;
function u(seed:number,a:number,b:number){let x=(seed^Math.imul(a+12345,2654435761)^Math.imul(b+54321,2246822519))>>>0;x=Math.imul(x^(x>>>16),0x7feb352d);x=Math.imul(x^(x>>>15),0x846ca68b);return ((x^(x>>>16))>>>0)/4294967296;}
function run(seed:number,scenario:typeof scenarios[number],policy:ReviewPolicy){
 const items=Array.from({length:N},(_,i)=>({conceptId:`c${String(i).padStart(2,'0')}`,label:`C${i}`,half:scenario==='homogeneous'?3:0.7+9*u(seed,i,-2)**2,last:0,trials:[] as Trial[],count:0}));
 let reviews=0,correct=0,brier=0,forecastN=0;
 function probability(item:typeof items[number],d:number){const split=11;const elapsed=d-item.last;const after=scenario==='abrupt_shift'&&Number(item.conceptId.slice(1))%3===0?Math.max(0,d-Math.max(split,item.last)):0;return 2**(-(elapsed+1.7*after)/item.half);}
 for(let d=1;d<=days;d++){
 const candidates=items.map(item=>{const model=dualMemory(0,item.trials,d,0);return {conceptId:item.conceptId,label:item.label,observations:model.observations.unaided,lastAttemptAt:item.count?item.last*DAY_MS:null,estimatedRecall:model.now.knowledge,costSeconds:30};});
 const plan=planReviews(candidates,d*DAY_MS,budget,policy);
 for(const task of plan.tasks){const item=items.find(x=>x.conceptId===task.conceptId)!;const i=Number(item.conceptId.slice(1)),p=probability(item,d),ok=u(seed,i,d)<p;const estimate=candidates.find(x=>x.conceptId===item.conceptId)!.estimatedRecall;
 brier+=(estimate-Number(ok))**2;forecastN++;reviews++;correct+=Number(ok);item.trials.push({day:d,mode:'unaided',grade:ok?'correct':'missed',revealed:true});item.half=Math.min(45,item.half*(ok?1+.30*Math.log1p(d-item.last):1.10));item.last=d;item.count++;}
 }
 const probeDay=days+7;const p=items.map(x=>probability(x,probeDay));const probe=items.map((x,i)=>Number(u(seed,i,probeDay)<p[i]));return {seed,scenario,policy,reviews,reviewAccuracy:correct/reviews,brier:brier/forecastN,expectedDelayedRecall:p.reduce((a,b)=>a+b,0)/N,observedDelayedRecall:probe.reduce((a,b)=>a+b,0)/N,minReviews:Math.min(...items.map(x=>x.count))};
}
const rows=scenarios.flatMap(s=>Array.from({length:seeds},(_,i)=>['fixed','adaptive'].map(p=>run(94117+i*133,s,p as ReviewPolicy))).flat());
const mean=(xs:number[])=>xs.reduce((a,b)=>a+b,0)/xs.length;
const summary=scenarios.map(s=>{const fixed=rows.filter(r=>r.scenario===s&&r.policy==='fixed'),adaptive=rows.filter(r=>r.scenario===s&&r.policy==='adaptive');const delta=adaptive.map((r,i)=>r.expectedDelayedRecall-fixed[i].expectedDelayedRecall);const d=mean(delta);const sd=Math.sqrt(delta.reduce((a,b)=>a+(b-d)**2,0)/(delta.length-1));return {scenario:s,seeds,reviewCountsEqual:fixed.every((r,i)=>r.reviews===adaptive[i].reviews),fixed:mean(fixed.map(x=>x.expectedDelayedRecall)),adaptive:mean(adaptive.map(x=>x.expectedDelayedRecall)),pairedDelta:d,approx95CI:[d-2.069*sd/Math.sqrt(seeds),d+2.069*sd/Math.sqrt(seeds)],observedFixed:mean(fixed.map(x=>x.observedDelayedRecall)),observedAdaptive:mean(adaptive.map(x=>x.observedDelayedRecall)),fixedBrier:mean(fixed.map(x=>x.brier)),adaptiveBrier:mean(adaptive.map(x=>x.brier)),reviewsPerRun:fixed[0].reviews};});
const result={protocol:{N,days,seeds,budgetSeconds:budget,delayDays:7,allItemsInitiallyExposed:true,seedPolicy:'paired deterministic common draws',limitations:'Synthetic response and learning model only; expected probabilities are simulator ground truth not observed human outcomes. No tuning or claim of empirical superiority.'},summary,rows};
writeFileSync('verification/v14-review-experiment.json',JSON.stringify(result,null,2)+'\n');console.log(JSON.stringify(summary,null,2));
