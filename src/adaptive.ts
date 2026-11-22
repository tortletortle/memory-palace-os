// V0.3: transparent, bounded engineering model. Not a calibrated human memory model.
export type Mode='cued'|'unaided';
export type Grade='correct'|'missed'|'uncertain';
export type Trial={day:number;mode:Mode;grade:Grade;revealed:boolean;confusedWith?:string};
export type CueFeature={id:string;meaning:string;asset:string;shape:string;color:string;action:string;position:number[]};
export const DAY=86400000;
const clamp=(x:number,lo:number,hi:number)=>Math.max(lo,Math.min(hi,x));
const grid=[.25,.5,1,2,4,8,16,32,64];
const prior=[.015,.045,.12,.24,.29,.18,.075,.025,.01];
const decay=(t:number,h:number)=>2**(-Math.max(t,0)/h);
export function estimateMemory(start:number,trials:Trial[],now:number,mode:Mode){
  if(!Number.isFinite(start)||!Number.isFinite(now)||now<start)throw new Error('Invalid time window');
  let posterior=[...prior],gain=1,last=start,lastObservation=-Infinity,observations=0,misses=0,successes=0;
  const ordered=trials.filter(t=>Number.isFinite(t.day)&&t.day>=start&&t.day<=now).sort((a,b)=>a.day-b.day);
  for(const t of ordered){const dt=t.day-last;
    // Only observations in this mode update likelihood. All explicitly revealed answers are exposures.
    if(t.mode===mode&&t.grade!=='uncertain'&&dt>=.05&&t.day-lastObservation>=.05){
      posterior=posterior.map((w,i)=>{const p=clamp(decay(dt,grid[i]*gain),.015,.985);return w*(t.grade==='correct'?p:1-p);});
      const z=posterior.reduce((a,b)=>a+b,0);posterior=posterior.map(w=>w/z);observations++;lastObservation=t.day;if(t.grade==='missed')misses++;else successes++;
    }
    if(t.revealed){if(dt>=.05)gain=clamp(gain*(t.grade==='correct'?1+.35*Math.min(dt,8)/(1+dt):t.grade==='missed'?1.12:1.05),1,12);last=t.day;}
  }
  const predict=(dt:number)=>posterior.reduce((s,w,i)=>s+w*decay(dt,grid[i]*gain),0);
  const quantile=(q:number)=>{let s=0;for(let i=0;i<grid.length;i++){s+=posterior[i];if(s>=q)return grid[i]*gain;}return grid.at(-1)!*gain;};
  // Bisection for 80% posterior predictive recall. No claim of calibrated confidence.
  let low=0,high=grid.at(-1)!*gain;for(let i=0;i<32;i++){const mid=(low+high)/2;if(predict(mid)>.8)low=mid;else high=mid;}
  return {mode,observations,misses,successes,halfLifeDays:quantile(.5),modelIntervalDays:[quantile(.1),quantile(.9)],estimatedRecall:predict(now-last),lastExposureDay:last,dueDay:last+(low+high)/2,gain,posterior,evidence:observations>=5?'observed':'sparse'};
}
export function visualSimilarity(a:CueFeature,b:CueFeature){
  if(a.meaning===b.meaning)return 0;
  const distance=Math.hypot(...a.position.map((x,i)=>x-b.position[i]));
  return (.40*Number(a.asset===b.asset)+.18*Number(a.shape===b.shape)+.22*Number(a.color===b.color)+.20*Number(a.action===b.action))*(.45+.55*Math.exp(-distance/6));
}
function distinctCued(history:Trial[]){const out:Trial[]=[];for(const t of history.filter(t=>t.mode==='cued'&&t.grade!=='uncertain'&&Number.isFinite(t.day)).sort((a,b)=>a.day-b.day))if(!out.length||t.day-out.at(-1)!.day>=.05)out.push(t);return out;}
export type InterferenceCell={from:string;to:string;visual:number;observedErrors:number;exposures:number;weight:number};
// Empirical direction i -> j: responding with j when tested on i, not merely any miss.
export function interferenceMatrix(cues:CueFeature[], history:ReadonlyMap<string,Trial[]>,includeObserved=true):InterferenceCell[]{
  if(cues.length>128)throw new Error('Matrix cap: 128 cues');
  const result:InterferenceCell[]=[];
  for(const a of cues){const valid=distinctCued(history.get(a.id)??[]);for(const b of cues){if(a.id===b.id)continue;
    const visual=visualSimilarity(a,b);const observedErrors=valid.filter(t=>t.grade==='missed'&&t.confusedWith===b.id).length;
    const evidence=includeObserved?(observedErrors/(valid.length+4)):0;
    result.push({from:a.id,to:b.id,visual,observedErrors,exposures:valid.length,weight:a.meaning===b.meaning?0:clamp(.65*visual+.35*evidence,0,1)});
  }}return result;
}
export function loadFor(id:string,matrix:InterferenceCell[]){const row=matrix.filter(x=>x.from===id).map(x=>x.weight).sort((a,b)=>b-a);return (row[0]??0)+.35*(row[1]??0)+.15*(row[2]??0);}
export type Change={target:string;replacement:CueFeature;reduction:number;score:number;misses:number;reason:string};
export function chooseChange(cues:CueFeature[],history:ReadonlyMap<string,Trial[]>,alternatives:ReadonlyMap<string,CueFeature[]>,useMatrix=true,requireObserved=false):Change|null{
  const matrix=useMatrix?interferenceMatrix(cues,history):[];let best:Change|null=null;
  for(const cue of cues){const h=distinctCued(history.get(cue.id)??[]).slice(-6),misses=h.filter(t=>t.grade==='missed').length;
    if(h.length<3||misses<2||misses/h.length<.5)continue;
    if(requireObserved){const observed=h.filter(t=>t.grade==='missed'&&t.confusedWith&&cues.some(c=>c.id===t.confusedWith&&c.meaning!==cue.meaning));const times:number[]=[];for(const t of observed)if(!times.length||t.day-times.at(-1)!>=.05)times.push(t.day);if(times.length<2)continue;}
    for(const alt of alternatives.get(cue.id)??[]){if(alt.id!==cue.id||alt.meaning!==cue.meaning||alt.position.some((x,i)=>x!==cue.position[i])||(alt.asset===cue.asset&&alt.action===cue.action))continue;
      // Old reported confusion is not assumed to be cured; only visual similarity changes.
      const next=useMatrix?interferenceMatrix(cues.map(c=>c.id===cue.id?alt:c),history):[];
      const reduction=useMatrix?loadFor(cue.id,matrix)-loadFor(cue.id,next):0;
      // Include spillover on other cues and explicit replacement cost. No estimated causal gain claim.
      const spillover=useMatrix?cues.filter(c=>c.id!==cue.id).reduce((s,c)=>s+loadFor(c.id,matrix)-loadFor(c.id,next),0):0;
      const score=useMatrix?(misses/h.length)*reduction+.15*spillover-.08:misses/h.length-.35;
      if(score<=.025||(useMatrix&&reduction<=.05))continue;
      if(!best||score>best.score)best={target:cue.id,replacement:alt,reduction,score,misses,reason:useMatrix?'Repeated cued misses and predicted reduction in visual interference; verify understanding first.':'Repeated cued misses; replacement without interference ranking.'};
    }
  }return best;
}
