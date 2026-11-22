
import { discoverStrategies, detectNegativeTransfer } from '../src/cognition/strategy-discovery.ts';
import { createTransferGenome } from '../src/cognition/transfer-graph.ts';
import { extractKnowledgeFeatures } from '../src/cognition/knowledge-feature-extractor.ts';
const cases=[
 ['probability','泊松分布概率公式 lambda 指数阶乘，回忆并比较不同分布。'],
 ['programming','算法程序代码函数执行步骤和因果机制，调试错误。'],
 ['history','历史事件年代时间顺序、原因结果与地图空间路线。'],
 ['digital_logic','CMOS晶体管逻辑门电路结构、符号与导通机制。'],
 ['language','英语词根词缀词汇定义和语义对比，记忆复习。'],
 ['biology','生物细胞基因生态系统层级结构与因果变化。']
] as const;
const genome=createTransferGenome('v08-test',['spatial-route','symbol-anchor','causal-chain','contrastive-pair','semantic-boundary','mechanism-simulation','retrieval-cue','timeline-sequence','hierarchy-chunk','analogy-bridge']);
const rows:any[]=[];
for(let seed=1;seed<=40;seed++){
 for(const [domain,text] of cases){
  const parsed=extractKnowledgeFeatures(text);
  const result=discoverStrategies(text,genome,18);
  const best=result.strategies[0];
  // Benchmark labels are hand-authored for this fixed synthetic suite, not inferred from the model.
  const target=domain==='digital_logic'?['symbolic','causal','hierarchical']:domain==='history'?['sequential','causal','spatial']:domain==='language'?['semantic','contrastive','retrieval']:domain==='biology'?['hierarchical','causal','dynamic']:domain==='programming'?['causal','sequential','retrieval']:['symbolic','semantic','retrieval'];
  const detected=target.filter(k=>(parsed.features as any)[k]>0).length/target.length;
  rows.push({seed,domain,detectedFeatureRecall:detected,selectedGenes:best.selectedGeneIds.length,coverage:best.featureCoverage,cost:best.costUnits,valid:best.dependencyValid});
 }
}
const summary=cases.map(([domain])=>{
 const r=rows.filter(x=>x.domain===domain);
 return {domain,n:r.length,meanFeatureRecall:r.reduce((a,b)=>a+b.detectedFeatureRecall,0)/r.length,meanCoverage:r.reduce((a,b)=>a+b.coverage,0)/r.length,meanCost:r.reduce((a,b)=>a+b.cost,0)/r.length,invalid:r.filter(x=>!x.valid).length};
});
const negativeTransfer=detectNegativeTransfer([
 {sourceDomain:'history',targetDomain:'biology',geneId:'spatial-route',sourceUtility:.82,targetUtility:.65,sampleCount:24},
 {sourceDomain:'programming',targetDomain:'language',geneId:'mechanism-simulation',sourceUtility:.78,targetUtility:.76,sampleCount:24},
 {sourceDomain:'probability',targetDomain:'digital_logic',geneId:'symbol-anchor',sourceUtility:.8,targetUtility:.71,sampleCount:24}
]);
console.log(JSON.stringify({seedCount:40,caseCount:240,summary,negativeTransfer},null,2));
