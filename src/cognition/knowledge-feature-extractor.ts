
import type { FeatureVector, TransferFeature, MemoryDomain } from './transfer-types.ts';

export interface ParsedKnowledgeFeatures {
  domain: MemoryDomain;
  features: FeatureVector;
  evidence: Partial<Record<TransferFeature, string[]>>;
  confidence: number;
  warnings: string[];
}

/** Deterministic, auditable baseline extractor. It proposes features; it does not claim semantic understanding. */
const rules: Array<[TransferFeature, RegExp[]]> = [
  ['spatial', [/位置|空间|地图|路线|方位|坐标|location|spatial|map|route/i]],
  ['symbolic', [/公式|符号|变量|运算符|方程|latex|symbol|formula|variable|operator/i]],
  ['causal', [/因为|导致|原因|结果|机制|因果|cause|effect|because|mechanism/i]],
  ['sequential', [/步骤|顺序|过程|阶段|先后|sequence|step|procedure|stage/i]],
  ['hierarchical', [/分类|层级|树状|组成|结构|包含|hierarchy|taxonomy|component/i]],
  ['contrastive', [/区别|比较|相反|对比|差异|contrast|versus|difference|compare/i]],
  ['analogical', [/类比|类似|映射|隐喻|analogy|similar|metaphor|mapping/i]],
  ['dynamic', [/变化|增长|衰减|演化|动态|变化率|change|growth|decay|dynamic/i]],
  ['retrieval', [/回忆|提取|复习|记忆|测试|recall|retrieval|review|memory|quiz/i]],
  ['semantic', [/定义|含义|概念|语义|解释|meaning|definition|concept|semantic/i]]
];
const domains: Array<[MemoryDomain, RegExp[]]> = [
 ['probability', [/概率|随机变量|分布|期望|方差|probability|random variable/i]],
 ['programming', [/代码|算法|函数|程序|编程|code|algorithm|function|programming/i]],
 ['history', [/历史|年代|朝代|战争|事件|秦朝|汉朝|唐朝|工业革命|郡县|history|dynasty|century|event/i]],
 ['digital_logic', [/逻辑门|晶体管|电路|CMOS|NMOS|PMOS|上拉|下拉|与非门|数字电路|circuit|transistor/i]],
 ['language', [/词根|词缀|语法|词汇|英语|language|vocabulary|grammar|morpheme/i]],
 ['biology', [/细胞|基因|生态|生物|蛋白质|biology|cell|gene|ecosystem/i]]
];
export function extractKnowledgeFeatures(text: string): ParsedKnowledgeFeatures {
 if (!text.trim()) throw new Error('knowledge text must not be empty');
 const evidence: Partial<Record<TransferFeature,string[]>> = {};
 const features = Object.fromEntries((['spatial','symbolic','causal','sequential','hierarchical','contrastive','analogical','dynamic','retrieval','semantic'] as TransferFeature[]).map(k=>[k,0])) as FeatureVector;
 for (const [feature, patterns] of rules) {
   const hits = patterns.filter(p=>p.test(text)).map(p=>p.source);
   if (hits.length) { features[feature]=Math.min(1,0.35+0.2*hits.length); evidence[feature]=hits; }
 }
 const domainHits = domains.map(([domain,patterns])=>({domain,score:patterns.filter(p=>p.test(text)).length})).sort((a,b)=>b.score-a.score);
 const warnings:string[]=[];
 if (!domainHits[0]?.score) warnings.push('Domain could not be inferred reliably; user confirmation required.');
 if (Object.values(features).filter(v=>v>0).length<2) warnings.push('Sparse feature evidence; avoid automatic skill selection.');
 return {domain:domainHits[0]?.score?domainHits[0].domain:'probability',features,evidence,confidence:Math.min(1,domainHits[0]?.score*0.25+Object.values(features).filter(v=>v>0).length*0.08),warnings};
}
