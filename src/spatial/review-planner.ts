/** Budgeted, read-only review policy. Risk predictions are engineering proxies. */
export type ReviewCandidate = {conceptId:string;label:string;observations:number;lastAttemptAt:number|null;estimatedRecall:number;costSeconds:number;marginalGain?:number};
export type ReviewPolicy = 'adaptive'|'fixed'|'marginal';
export const DAY_MS=86400000;
export function planReviews(candidates:ReviewCandidate[],now:number,budgetSeconds:number,policy:ReviewPolicy='fixed',options:{coverage?:boolean}={}) {
  if(!Number.isFinite(now)||!Number.isInteger(budgetSeconds)||budgetSeconds<0||budgetSeconds>3600||!['adaptive','fixed','marginal'].includes(policy))throw new Error('Invalid planning parameters');
  const seen=new Set<string>();
  const rows=candidates.map(c=>{
    if(!c.conceptId||seen.has(c.conceptId)||!Number.isInteger(c.observations)||c.observations<0||!Number.isFinite(c.estimatedRecall)||c.estimatedRecall<0||c.estimatedRecall>1||!Number.isInteger(c.costSeconds)||c.costSeconds<1||c.costSeconds>600||(c.lastAttemptAt!==null&&(!Number.isFinite(c.lastAttemptAt)||c.lastAttemptAt>now)))throw new Error('Invalid candidate');
    if(policy==='marginal'&&(!Number.isFinite(c.marginalGain)||c.marginalGain!<0||c.marginalGain!>1))throw new Error('Missing or invalid marginal gain');
    seen.add(c.conceptId);
    const age=c.lastAttemptAt===null?null:(now-c.lastAttemptAt)/DAY_MS;
    const cold=c.observations<3;
    // Fixed policy cycles on elapsed days; adaptive switches to evidence collection for sparse items.
    const overdue=age===null||age>=7;
    // Lexicographic objective: maximize number of overdue/unseen items, then sum of gains.
    const coverageBonus=options.coverage!==false&&overdue?candidates.length+1:0;
    const score=policy==='marginal'?coverageBonus+c.marginalGain!:policy==='fixed'?(age===null?2:Math.min(3,age/3)):(cold?(age===null?0.85:0.35+0.5*Math.min(1,age/3)):1-c.estimatedRecall+0.12*Math.min(1,(age??0)/7));
    return {...c,ageDays:age,priority:score,reason:policy==='marginal'?(coverageBonus?'coverage_guard':'marginal_gain'):policy==='fixed'?'fixed_elapsed_interval':cold?'collect_evidence':'model_risk',eligible:age===null||age>=1};
  }).filter(c=>c.eligible).sort((a,b)=>a.conceptId.localeCompare(b.conceptId));
  // Exact 0/1 knapsack over integer seconds; one task per concept. Positive scores fill remaining budget when possible.
  const dp:Array<{score:number;ids:number[]}|undefined>=Array(budgetSeconds+1);dp[0]={score:0,ids:[]};
  for(let i=0;i<rows.length;i++){const r=rows[i];for(let t=budgetSeconds;t>=r.costSeconds;t--){const prev=dp[t-r.costSeconds];if(!prev)continue;const score=prev.score+r.priority;if(!dp[t]||score>dp[t]!.score+1e-12)dp[t]={score,ids:[...prev.ids,i]};}}
  let best=0;for(let t=1;t<=budgetSeconds;t++)if(dp[t]&&(dp[t]!.score>(dp[best]?.score??0)+1e-12||(Math.abs(dp[t]!.score-(dp[best]?.score??0))<=1e-12&&t>best)))best=t;
  const tasks=dp[best]!.ids.map(i=>rows[i]).sort((a,b)=>b.priority-a.priority||a.conceptId.localeCompare(b.conceptId)).map(r=>({conceptId:r.conceptId,label:r.label,costSeconds:r.costSeconds,priority:Number(r.priority.toFixed(4)),reason:r.reason,observations:r.observations,estimatedRecall:r.observations>=3?r.estimatedRecall:null,...(policy==='marginal'?{marginalGain:r.marginalGain,coverageProtected:r.reason==='coverage_guard'}:{}),mode:'unaided' as const}));
  return {version:'1.5.0',policy,generatedAt:new Date(now).toISOString(),budgetSeconds,estimatedSeconds:best,eligibleCount:rows.length,...(policy==='marginal'?{horizonDays:7,overdueDays:7,coverageEnabled:options.coverage!==false,overdueEligible:rows.filter(r=>r.ageDays===null||r.ageDays>=7).length,overdueSelected:tasks.filter(t=>t.coverageProtected).length}:{}),tasks,measurement:'label_hidden_spatial_localization_not_free_recall',status:'advisory_only'};
}
