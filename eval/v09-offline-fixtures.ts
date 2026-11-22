
import { OfflineKnowledgeModel, understandKnowledge } from '../src/knowledge-understanding.ts';
const fixtures=[
 ['probability','泊松分布的概率质量函数为 P(X=k)=λ^k e^{-λ}/k!，其中 λ 表示区间内事件发生次数的期望。'],
 ['probability','正态分布的均值决定中心位置，方差描述数据的离散程度。'],
 ['programming','递归函数通过调用自身解决规模更小的子问题，直到达到基本情况。'],
 ['programming','排序算法按照比较规则调整数组元素的先后顺序。'],
 ['history','秦朝统一六国后推行郡县制，并统一文字与度量衡。'],
 ['history','工业革命推动机器生产发展，并改变城市人口与劳动结构。'],
 ['digital_logic','CMOS反相器由PMOS上拉网络和NMOS下拉网络组成，输入为高电平时输出为低电平。'],
 ['digital_logic','两个NMOS串联形成下拉通路，只有两个栅极均为高电平时才导通。'],
 ['language','英语单词 transport 可拆分为 trans 和 port，表达跨越与携带的含义。'],
 ['language','前缀 re- 常表示再次，词根 form 与形状或形成有关。'],
 ['biology','细胞通过细胞膜控制物质进出，线粒体参与细胞能量代谢。'],
 ['biology','食物网描述生态系统中生物之间的取食关系和能量流动。']
] as const;
const model=new OfflineKnowledgeModel();
const results: Array<{expected:string;actual?:string;correct:boolean;concepts?:number;evidenceValid?:boolean;error?:string}> = [];
for(const [expected,source] of fixtures){
 try{
  const r=await understandKnowledge(source,model);
  results.push({expected,actual:r.understanding.domain,correct:expected===r.understanding.domain,concepts:r.understanding.concepts.length,evidenceValid:r.quality.valid});
 }catch(e){results.push({expected,error:String(e),correct:false});}
}
const summary=['probability','programming','history','digital_logic','language','biology'].map(domain=>{
 const rows=results.filter(x=>x.expected===domain);
 return {domain,n:rows.length,domainAccuracy:rows.filter(x=>x.correct).length/rows.length,sourceValidation:rows.filter(x=>x.evidenceValid).length/rows.length,meanConcepts:rows.reduce((a,x)=>a+(x.concepts??0),0)/rows.length};
});
console.log(JSON.stringify({kind:'small_handwritten_fixture_smoke_benchmark',count:results.length,summary,results},null,2));
