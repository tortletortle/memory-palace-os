/** Counterfactual one-step utility under the existing forgetting model.
 * Predictions describe label-hidden spatial localization, not free knowledge recall.
 * An attempted review reveals the answer in both success and failure branches.
 * This is a model-based intervention proxy, not an identified causal effect.
 */
export const GAIN_HORIZON_DAYS=7;
export function marginalMemoryGain(model:{posterior:readonly {knowledgeHalfLife:number;weight:number}[];lastKnowledgeExposure:number},nowDay:number,horizon=GAIN_HORIZON_DAYS){
  const elapsed=nowDay-model.lastKnowledgeExposure;
  if(!Number.isFinite(elapsed)||elapsed<0||!Number.isFinite(horizon)||horizon<=0||horizon>90)throw new Error('Invalid gain horizon');
  let withoutReview=0,withReview=0,weight=0;
  for(const s of model.posterior){
    const h=s.knowledgeHalfLife,w=s.weight;
    if(!Number.isFinite(h)||h<=0||!Number.isFinite(w)||w<0)throw new Error('Invalid gain posterior');
    const p=2**(-elapsed/h);
    // Match the nominal successful/missed feedback multipliers, without the latent growth cap.
    const good=h*(1+.33*Math.log1p(elapsed)),bad=h*1.08;
    withoutReview+=w*2**(-(elapsed+horizon)/h);
    withReview+=w*(p*2**(-horizon/good)+(1-p)*2**(-horizon/bad));
    weight+=w;
  }
  if(!Number.isFinite(weight)||weight<=0)throw new Error('Empty gain posterior');
  withoutReview/=weight;withReview/=weight;
  return {horizonDays:horizon,withoutReview,withReview,gain:Math.max(0,Math.min(1,withReview-withoutReview)),model:'one_step_revealed_feedback_proxy' as const};
}
