import {writeFile,mkdir} from 'node:fs/promises';
import {simulate,scenarios,policies,N,DAYS,PER_DAY} from '../eval/simulation.ts';
import type {Outcome} from '../eval/simulation.ts';
const initial=process.argv.includes('--initial');const activePolicies=initial?policies.filter(p=>p!=='guarded_matrix'):policies;
const seeds=Array.from({length:48},(_,i)=>(initial?10001:900001)+i*7919);
const data:Outcome[]=[];
const metrics=['cued7','unaided7','cued28','unaided28','trainingCorrect','changes','brier','confusions'] as const;
const mean=(v:number[])=>v.reduce((s,x)=>s+x,0)/v.length;
function paired(a:number[],b:number[]){const d=a.map((v,i)=>v-b[i]),m=mean(d),sd=Math.sqrt(d.reduce((s,v)=>s+(v-m)**2,0)/(d.length-1)),margin=2.012*sd/Math.sqrt(d.length);return {difference:m,ci95:[m-margin,m+margin],seeds:d.length};}
for(const scenario of scenarios)for(const seed of seeds)for(const policy of activePolicies)data.push(simulate(seed,scenario,policy));
const groups=scenarios.map(scenario=>{const groups=activePolicies.map(policy=>{const rows=data.filter(x=>x.scenario===scenario&&x.policy===policy);return {policy,means:Object.fromEntries(metrics.map(k=>[k,mean(rows.map(x=>x[k]))]))};});const rows=(policy:string)=>data.filter(x=>x.scenario===scenario&&x.policy===policy);return {scenario,groups,pairedComparisons:activePolicies.filter(p=>p!=='fixed').flatMap(policy=>['fixed',...(policy==='matrix_adaptive'?['miss_only']:policy==='guarded_matrix'?['miss_only','matrix_adaptive']:[])].map(baseline=>({policy,baseline,metrics:Object.fromEntries(metrics.slice(0,4).map(k=>[k,paired(rows(policy).map(x=>x[k]),rows(baseline).map(x=>x[k]))]))})))};});
const report={protocol:{seeds,items:N,trainingDays:DAYS,reviewsPerDay:PER_DAY,primary:'unaided28',secondary:['cued7','unaided7','cued28'],paired:'paired seed-level t interval (descriptive, unadjusted)',design:'same schedule and common random numbers, probes without feedback; at most one replacement/week, no repeated replacement; '+(initial?'initial comparison of three policies':'guard designed after initial run; seed holdout with same synthetic scenarios, not independent model validation'),scope:'Synthetic virtual learner only; not human evidence'},groups,data};
await mkdir('verification',{recursive:true});await writeFile(initial?'verification/initial-experiment.json':'verification/adaptive-experiment.json',JSON.stringify(report,null,2));
await writeFile(initial?'verification/initial-seeds.csv':'verification/adaptive-seeds.csv',[Object.keys(data[0]).join(','),...data.map(x=>Object.values(x).join(','))].join('\n')+'\n');
console.log(JSON.stringify({protocol:report.protocol,groups},null,2));
