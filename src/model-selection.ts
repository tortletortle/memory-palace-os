import type {Mode,Grade,CueFeature,Trial} from './adaptive.ts';

const clamp=(x:number,a=0,b=1)=>Math.max(a,Math.min(b,x));
const norm=(xs:number[])=>{const s=xs.reduce((a,b)=>a+b,0);return xs.map(x=>x/s);};
const mean=(xs:number[],ws:number[])=>xs.reduce((s,x,i)=>s+x*ws[i],0);

export type ForgettingFamily='exponential'|'power_law'|'two_phase';
export type ForgettingObservation={ageDays:number;mode:Mode;grade:Grade;revealed?:boolean};
const families:ForgettingFamily[]=['exponential','power_law','two_phase'];
const prior=[1/3,1/3,1/3];
function recall(f:ForgettingFamily,age:number,h:number){
  const t=Math.max(0,age),half=Math.max(.15,h);
  if(f==='exponential')return 2**(-t/half);
  if(f==='power_law')return Math.pow(1+t/half,-1.0);
  return .72*Math.pow(2,-t/(half*.55))+.28*Math.pow(2,-t/(half*2.4));
}
/** Sequential Bayesian model averaging over three deliberately distinct decay families. */
export function bayesianModelAverage(obs:ForgettingObservation[],mode:Mode,nowAge:number){
  if(!Number.isFinite(nowAge)||nowAge<0)throw new Error('Invalid forecast age');
  let weights=[...prior],halfLife=3,lastExposure=0,used=0;
  const clean=obs.filter(o=>Number.isFinite(o.ageDays)&&o.ageDays>=0&&o.ageDays<=nowAge&&o.mode===mode&&o.grade!=='uncertain').sort((a,b)=>a.ageDays-b.ageDays);
  for(const o of clean){const age=Math.max(0,o.ageDays-lastExposure);if(age<.05)continue;
    const candidates=[.5,1,2,4,8,16,32];
    // Marginalize the family-specific half-life grid using the same weak prior.
    const likelihood=families.map(f=>{const hs=candidates.map(h=>{const p=clamp(recall(f,age,h),.015,.985);return o.grade==='correct'?p:1-p;});return hs.reduce((a,b)=>a+b,0)/hs.length;});
    weights=norm(weights.map((w,i)=>w*likelihood[i]));used++;lastExposure=o.ageDays;if(o.revealed)halfLife=Math.min(32,halfLife*(o.grade==='correct'?1.12:1.04));
  }
  const forecast=(age:number)=>families.map(f=>{const hs=[.5,1,2,4,8,16,32];return hs.reduce((s,h)=>s+recall(f,age,h*halfLife),0)/hs.length;});
  const p=forecast(Math.max(0,nowAge-lastExposure));
  return {probability:mean(p,weights),weights:families.map((family,i)=>({family,weight:weights[i]})),observations:used,evidence:used>=5?'observed':'sparse',familyPredictions:families.map((family,i)=>({family,probability:p[i]}))};
}

export type InterferenceObservation={targetId:string;confusedWith?:string;visualSimilarity:number;semanticSimilarity:number;grade:Grade};
export type InterferenceCellV05={from:string;to:string;visual:number;semantic:number;observed:number;visualWeight:number;semanticWeight:number;combined:number};
/** Keep perceptual similarity and semantic confusion as separate channels. */
export function splitInterference(cues:CueFeature[],observations:InterferenceObservation[]):InterferenceCellV05[]{
 if(cues.length>128)throw new Error('Matrix cap: 128 cues');
 const out:InterferenceCellV05[]=[];
 for(const a of cues)for(const b of cues){if(a.id===b.id)continue;
  const visual=clamp(Number(a.asset===b.asset)*.4+Number(a.shape===b.shape)*.25+Number(a.color===b.color)*.15+Number(a.action===b.action)*.2);
  const relevant=observations.filter(o=>o.targetId===a.id&&o.confusedWith===b.id&&o.grade==='missed');
  const observed=relevant.length/(observations.filter(o=>o.targetId===a.id).length+4);
  const semantic=clamp(relevant.reduce((s,o)=>s+clamp(o.semanticSimilarity),0)/(relevant.length||1));
  out.push({from:a.id,to:b.id,visual,semantic,observed,visualWeight:.65*visual+.35*observed,semanticWeight:.7*semantic+.3*observed,combined:clamp(.5*(.65*visual+.35*observed)+.5*(.7*semantic+.3*observed))});
 }
 return out;
}

export type ChangePoint={index:number;probability:number;baselineRate:number;recentRate:number;detected:boolean};
/** Online Beta-Bernoulli change detector with bounded recent window and explicit prior. */
export class OnlineChangePointDetector{
 private values:number[]=[];
 private readonly window:number;
 private readonly threshold:number;
 constructor(window=12,threshold=.95){this.window=window;this.threshold=threshold;if(!Number.isInteger(window)||window<4||window>100||threshold<=0||threshold>=1)throw new Error('Invalid change detector config');}
 update(success:boolean):ChangePoint{
  this.values.push(Number(success));if(this.values.length>this.window*4)this.values.shift();
  const n=this.values.length,cut=Math.max(2,Math.min(this.window,Math.floor(n/2)));
  const old=this.values.slice(0,-cut),recent=this.values.slice(-cut);
  const rate=(a:number[])=>a.length?(a.reduce((s,x)=>s+x,0)+1)/(a.length+2):.5;
  const baseline=rate(old),current=rate(recent);
  // Compare two Beta posteriors, rather than treating the noisy baseline mean as known.
  const grid=Array.from({length:99},(_,i)=>(i+1)/100);
  const betaWeights=(a:number[])=>{const successes=a.reduce((s,x)=>s+x,0),failures=a.length-successes;const logs=grid.map(p=>successes*Math.log(p)+failures*Math.log1p(-p));const m=Math.max(...logs),raw=logs.map(x=>Math.exp(x-m)),z=raw.reduce((s,x)=>s+x,0);return raw.map(x=>x/z);};
  const bw=betaWeights(old),rw=betaWeights(recent);let probability=0;
  if(old.length>=8&&recent.length>=6){for(let i=0;i<grid.length;i++)for(let j=0;j<grid.length;j++)if(grid[j]<=grid[i]-.2)probability+=bw[i]*rw[j];}
  return {index:n,probability,baselineRate:baseline,recentRate:current,detected:probability>=this.threshold};
 }
 reset(){this.values=[];}
}
