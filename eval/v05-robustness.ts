import {bayesianModelAverage,OnlineChangePointDetector,splitInterference} from '../src/model-selection.ts';
import type {ForgettingObservation,ForgettingFamily} from '../src/model-selection.ts';
import type {CueFeature} from '../src/adaptive.ts';
import {writeFile} from 'node:fs/promises';

function rng(seed:number){let x=seed>>>0;return()=>{x=(1664525*x+1013904223)>>>0;return x/4294967296;};}
const scenarios=['stable_exponential','stable_powerlaw','two_phase','abrupt_decay_shift','visual_dominant','semantic_dominant'] as const;
function truth(f:ForgettingFamily,t:number,h=5){if(f==='exponential')return 2**(-t/h);if(f==='power_law')return 1/(1+t/h);return .72*2**(-t/(h*.55))+.28*2**(-t/(h*2.4));}
const rows:any[]=[]; const changeRows:any[]=[];
for(const scenario of scenarios)for(let seed=1;seed<=32;seed++){
 const rand=rng(seed*7919+scenario.length*101),obs:ForgettingObservation[]=[];let correct=0;
 for(let day=1;day<=42;day++){let f:ForgettingFamily=scenario==='stable_powerlaw'?'power_law':scenario==='two_phase'?'two_phase':'exponential';let age=day%7+1;let p=truth(f,age);if(scenario==='abrupt_decay_shift'&&day>=22)p=truth('power_law',age,2);if(scenario==='visual_dominant')p=.25+.65*truth('exponential',age);if(scenario==='semantic_dominant')p=.15+.5*truth('power_law',age);const ok=rand()<p;correct+=Number(ok);obs.push({ageDays:day,mode:scenario==='semantic_dominant'?'unaided':'cued',grade:ok?'correct':'missed'});}
 const mode=scenario==='semantic_dominant'?'unaided':'cued';const avg=bayesianModelAverage(obs,mode,49);const recent=obs.slice(-10).filter(x=>x.mode===mode);const empirical=recent.filter(x=>x.grade==='correct').length/Math.max(1,recent.length);const expOnly=2**(-7/5);rows.push({scenario,seed,bma:avg.probability,expOnly,empirical,bmaAbsError:Math.abs(avg.probability-empirical),expAbsError:Math.abs(expOnly-empirical),modelWeights:avg.weights});
 const detector=new OnlineChangePointDetector(8,.95);let first=-1;for(let i=0;i<obs.length;i++){const r=detector.update(obs[i].grade==='correct');if(r.detected&&first<0)first=i+1;}changeRows.push({scenario,seed,detected:first>0,firstDetectionDay:first,abrupt:scenario==='abrupt_decay_shift'});
}
const summary=scenarios.map(s=>{const a=rows.filter(x=>x.scenario===s);return {scenario:s,n:a.length,bmaMAE:a.reduce((z,x)=>z+x.bmaAbsError,0)/a.length,exponentialMAE:a.reduce((z,x)=>z+x.expAbsError,0)/a.length,meanPrediction:a.reduce((z,x)=>z+x.bma,0)/a.length,meanObserved:a.reduce((z,x)=>z+x.empirical,0)/a.length};});
const changeSummary=scenarios.map(s=>{const a=changeRows.filter(x=>x.scenario===s);return {scenario:s,n:a.length,detectionRate:a.filter(x=>x.detected).length/a.length,meanDetectionDay:a.filter(x=>x.detected).length?a.filter(x=>x.detected).reduce((z,x)=>z+x.firstDetectionDay,0)/a.filter(x=>x.detected).length:null};});
const report={version:'0.5.0',seedsPerScenario:32,scenarios:summary,changePoint:changeSummary,rows,changeRows};
await writeFile(new URL('../verification/v05-robustness.json',import.meta.url),JSON.stringify(report,null,2));
console.log(JSON.stringify({scenarios:summary,changePoint:changeSummary},null,2));
