import {planReviews,DAY_MS} from '../src/spatial/review-planner.ts';
import type {ReviewPolicy} from '../src/spatial/review-planner.ts';
import {marginalMemoryGain} from '../src/spatial/marginal-gain.ts';
import {dualMemory} from '../src/bayesian.ts';
import type {Trial} from '../src/adaptive.ts';
import {writeFileSync,readFileSync} from 'node:fs';
const N=24,days=21,seeds=24,budget=180;
const scenarios=['heterogeneous','homogeneous','abrupt_shift','power_law','reset_only','retrieval_strong'] as const;
function u(seed:number,a:number,b:number){let x=(seed^Math.imul(a+12345,2654435761)^Math.imul(b+54321,2246822519))>>>0;x=Math.imul(x^(x>>>16),0x7feb352d);x=Math.imul(x^(x>>>15),0x846ca68b);return ((x^(x>>>16))>>>0)/4294967296;}
function run(seed:number,scenario:typeof scenarios[number],policy:ReviewPolicy|'marginal_unprotected'){
 const items=Array.from({length:N},(_,i)=>({conceptId:`c${String(i).padStart(2,'0')}`,label:`C${i}`,half:scenario==='homogeneous'?3:0.7+9*u(seed,i,-2)**2,last:0,trials:[] as Trial[],count:0,maxGap:0}));
 let reviews=0,correct=0,brier=0,forecastN=0;
 function probability(item:typeof items[number],d:number){const split=11;const elapsed=d-item.last;const after=scenario==='abrupt_shift'&&Number(item.conceptId.slice(1))%3===0?Math.max(0,d-Math.max(split,item.last)):0;const x=(elapsed+1.7*after)/item.half;return scenario==='power_law'?1/(1+x):2**(-x);}
 for(let d=1;d<=days;d++){
 const candidates=items.map(item=>{const model=dualMemory(0,item.trials,d,0);return {conceptId:item.conceptId,label:item.label,observations:model.observations.unaided,lastAttemptAt:item.count?item.last*DAY_MS:null,estimatedRecall:model.now.knowledge,marginalGain:marginalMemoryGain(model,d).gain,costSeconds:30};});
 const plan=planReviews(candidates,d*DAY_MS,budget,policy==='marginal_unprotected'?'marginal':policy,{coverage:policy!=='marginal_unprotected'});
 for(const task of plan.tasks){const item=items.find(x=>x.conceptId===task.conceptId)!;const i=Number(item.conceptId.slice(1)),p=probability(item,d),ok=u(seed,i,d)<p;const estimate=candidates.find(x=>x.conceptId===item.conceptId)!.estimatedRecall;
 brier+=(estimate-Number(ok))**2;forecastN++;reviews++;correct+=Number(ok);item.trials.push({day:d,mode:'unaided',grade:ok?'correct':'missed',revealed:true});const elapsed=d-item.last;const growth=scenario==='reset_only'?1:scenario==='retrieval_strong'?(ok?1+.65*Math.log1p(elapsed):1.01):(ok?1+.30*Math.log1p(elapsed):1.10);item.half=Math.min(45,item.half*growth);item.maxGap=Math.max(item.maxGap,elapsed);item.last=d;item.count++;}
 }
 const probeDay=days+7;const p=items.map(x=>probability(x,probeDay));const probe=items.map((x,i)=>Number(u(seed,i,probeDay)<p[i]));return {seed,scenario,policy,reviews,reviewAccuracy:correct/reviews,brier:brier/forecastN,expectedDelayedRecall:p.reduce((a,b)=>a+b,0)/N,observedDelayedRecall:probe.reduce((a,b)=>a+b,0)/N,minReviews:Math.min(...items.map(x=>x.count)),maxTrainingGap:Math.max(...items.map(x=>Math.max(x.maxGap,days-x.last))),unreviewed:items.filter(x=>x.count===0).length,expectedDay1:items.reduce((a,x)=>a+probability(x,days+1),0)/N,expectedDay28:items.reduce((a,x)=>a+probability(x,days+28),0)/N};
}
const merge=process.argv[2]==='--merge';
const scenarioFilter=merge?undefined:process.argv[2], start=Number(process.argv[3]??0), count=Number(process.argv[4]??seeds);
if((scenarioFilter&&!scenarios.some(s=>s===scenarioFilter))||!Number.isInteger(start)||!Number.isInteger(count)||start<0||count<1||start+count>seeds)throw new Error('Invalid batch');
const selected=scenarioFilter?scenarios.filter(s=>s===scenarioFilter):scenarios;
const rows:ReturnType<typeof run>[]=merge?scenarios.flatMap(s=>JSON.parse(readFileSync(`verification/v15-batch-${s}-0.json`,'utf8')) as ReturnType<typeof run>[]):selected.flatMap(s=>Array.from({length:count},(_,i)=>(['fixed','adaptive','marginal','marginal_unprotected'] as const).map(p=>run(731927+(start+i)*379,s,p))).flat());
const mean=(xs:number[])=>xs.reduce((a,b)=>a+b,0)/xs.length;
if(scenarioFilter){writeFileSync(`verification/v15-batch-${scenarioFilter}-${start}.json`,JSON.stringify(rows)+'\n');process.exit(0);}
const arms=['fixed','adaptive','marginal','marginal_unprotected'] as const;
if(rows.length!==scenarios.length*seeds*arms.length||new Set(rows.map(r=>`${r.scenario}:${r.seed}:${r.policy}`)).size!==rows.length||scenarios.some(s=>Array.from({length:seeds},(_,i)=>731927+i*379).some(seed=>arms.some(arm=>!rows.some(r=>r.scenario===s&&r.seed===seed&&r.policy===arm)))))throw new Error('Incomplete or duplicate experiment rows');
rows.sort((a,b)=>scenarios.indexOf(a.scenario)-scenarios.indexOf(b.scenario)||a.seed-b.seed||arms.indexOf(a.policy)-arms.indexOf(b.policy));
const summary=scenarios.map(s=>{const fixed=rows.filter(r=>r.scenario===s&&r.policy==='fixed');return {scenario:s,arms:arms.map(arm=>{const rs=rows.filter(r=>r.scenario===s&&r.policy===arm),delta=rs.map((r,i)=>r.expectedDelayedRecall-fixed[i].expectedDelayedRecall),d=mean(delta),sd=Math.sqrt(delta.reduce((a,b)=>a+(b-d)**2,0)/(seeds-1));return {arm,expected1:mean(rs.map(x=>x.expectedDay1)),expected7:mean(rs.map(x=>x.expectedDelayedRecall)),expected28:mean(rs.map(x=>x.expectedDay28)),observed7:mean(rs.map(x=>x.observedDelayedRecall)),pairedDelta7:d,approx95CI7:[d-2.069*sd/Math.sqrt(seeds),d+2.069*sd/Math.sqrt(seeds)],matchedReviewCounts:rs.every((r,i)=>r.reviews===fixed[i].reviews),reviewsPerRun:rs[0].reviews,minReviews:mean(rs.map(x=>x.minReviews)),meanMaxGap:mean(rs.map(x=>x.maxTrainingGap)),unreviewed:rs.reduce((a,x)=>a+x.unreviewed,0)};})};});
const result={protocol:{N,days,seeds,budget,scenarios,arms,delays:[1,7,28],seedPolicy:'new deterministic paired seeds, common draws; no fitted tuning',limitations:'Synthetic model only, author-selected generators; intervals are Monte Carlo, not human effects.'},summary,rows};
writeFileSync('verification/v15-marginal-experiment.json',JSON.stringify(result,null,2)+'\n');console.log(JSON.stringify(summary,null,2));
