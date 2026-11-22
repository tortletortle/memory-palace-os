
import { knowledgeDomains, relationTypes } from './knowledge-understanding-types.ts';
import type { KnowledgeUnderstanding, KnowledgeQualityReport } from './knowledge-understanding-types.ts';
const featureNames=['spatial','symbolic','causal','sequential','hierarchical','contrastive','analogical','dynamic','retrieval','semantic'] as const;
export function validateKnowledgeUnderstanding(source:string,value:unknown):{value?:KnowledgeUnderstanding;report:KnowledgeQualityReport}{
 const errors:string[]=[],warnings:string[]=[];
 if(!value||typeof value!=='object'||Array.isArray(value)) return {report:{valid:false,score:0,errors:['root must be an object'],warnings,evidenceCoverage:0,duplicateConcepts:[],isolatedConcepts:[]}};
 const v=value as any;
 for(const k of ['title','domain','summary','concepts','relations','features','uncertaintyNotes']) if(!(k in v)) errors.push(`missing:${k}`);
 if(typeof v.title!=='string'||!v.title.trim()) errors.push('invalid:title');
 if(!knowledgeDomains.includes(v.domain)) errors.push('invalid:domain');
 if(typeof v.summary!=='string') errors.push('invalid:summary');
 if(!Array.isArray(v.concepts)||v.concepts.length<1||v.concepts.length>40) errors.push('invalid:concepts');
 if(!Array.isArray(v.relations)||v.relations.length>80) errors.push('invalid:relations');
 if(!Array.isArray(v.uncertaintyNotes)||v.uncertaintyNotes.some((x:any)=>typeof x!=='string')) errors.push('invalid:uncertaintyNotes');
 if(!v.features||typeof v.features!=='object') errors.push('invalid:features');
 else for(const f of featureNames) if(typeof v.features[f]!=='number'||!Number.isFinite(v.features[f])||v.features[f]<0||v.features[f]>1) errors.push(`invalid:features.${f}`);
 const ids=new Set<string>(),quotes:string[]=[];
 if(Array.isArray(v.concepts)) for(const [i,c] of v.concepts.entries()){
  if(!c||typeof c!=='object'){errors.push(`concept[${i}]:object`);continue;}
  if(typeof c.id!=='string'||!/^c[0-9]{1,3}$/.test(c.id)) errors.push(`concept[${i}]:id`);
  else if(ids.has(c.id)) errors.push(`duplicate_concept_id:${c.id}`); else ids.add(c.id);
  if(typeof c.label!=='string'||!c.label.trim()||c.label.length>120) errors.push(`concept[${i}]:label`);
  if(!['concept','formula','condition','procedure','example','mechanism'].includes(c.kind)) errors.push(`concept[${i}]:kind`);
  if(typeof c.evidenceQuote!=='string'||!c.evidenceQuote.trim()||!source.includes(c.evidenceQuote)) errors.push(`concept[${i}]:evidence_not_in_source`);
  else quotes.push(c.evidenceQuote);
 }
 if(Array.isArray(v.relations)) for(const [i,r] of v.relations.entries()){
  if(!r||typeof r!=='object'){errors.push(`relation[${i}]:object`);continue;}
  if(!ids.has(r.from)||!ids.has(r.to)||r.from===r.to) errors.push(`relation[${i}]:invalid_endpoint`);
  if(!relationTypes.includes(r.type)) errors.push(`relation[${i}]:invalid_type`);
  if(typeof r.evidenceQuote!=='string'||!r.evidenceQuote.trim()||!source.includes(r.evidenceQuote)) errors.push(`relation[${i}]:evidence_not_in_source`);
  else quotes.push(r.evidenceQuote);
 }
 const labels:string[]=Array.isArray(v.concepts)?v.concepts.map((c:any)=>String(c.label??'').trim().toLowerCase()):[];
 const duplicateConcepts:string[]=[...new Set<string>(labels.filter((x:string,i:number)=>x&&labels.indexOf(x)!==i))];
 if(duplicateConcepts.length) warnings.push('duplicate_or_near-duplicate concept labels require review');
 const connected=new Set<string>();
 if(Array.isArray(v.relations)) for(const r of v.relations) {if(r&&ids.has(r.from)&&ids.has(r.to)){connected.add(r.from);connected.add(r.to);}}
 const isolatedConcepts=Array.isArray(v.concepts)?v.concepts.filter((c:any)=>c&&typeof c.id==='string'&&!connected.has(c.id)).map((c:any)=>c.id):[];
 if(isolatedConcepts.length>1) warnings.push('multiple concepts are not connected by extracted relations');
 const spans=quotes.map(q=>{const start=source.indexOf(q);return start<0?null:[start,start+q.length] as [number,number]}).filter((x):x is [number,number]=>x!==null).sort((a,b)=>a[0]-b[0]);
 let covered=0,spanStart=-1,spanEnd=-1;
 for(const [a,b] of spans){if(spanStart<0){spanStart=a;spanEnd=b;}else if(a<=spanEnd){spanEnd=Math.max(spanEnd,b);}else{covered+=spanEnd-spanStart;spanStart=a;spanEnd=b;}}
 if(spanStart>=0)covered+=spanEnd-spanStart;
 const evidenceCoverage=source.length?Math.min(1,covered/source.length):0;
 const relationCues:Record<string,RegExp>={causes:/因为|导致|因此|造成|引起|cause|because|therefore/i,contrasts_with:/区别|不同|相反|比较|对比|而|contrast|versus|unlike/i,sequence_before:/首先|然后|随后|之后|之前|先|再|finally|then|before|after/i,part_of:/组成|包含|部分|包括|由.{1,12}构成|part of|contains|composed of/i,depends_on:/依赖|取决于|条件|只有|当.{1,16}才|depends on|requires|if/i};
 if(Array.isArray(v.relations)) for(const r of v.relations){const cue=relationCues[r?.type];if(cue&&typeof r.evidenceQuote==='string'&&!cue.test(r.evidenceQuote))warnings.push(`relation_semantics_unverified:${r.type}:${r.from}->${r.to}`);}

 if(evidenceCoverage<0.15) warnings.push('low source evidence coverage; possible omissions');
 if(Array.isArray(v.uncertaintyNotes)&&v.uncertaintyNotes.length===0) warnings.push('model reported no uncertainty; independently review');
 const score=Math.max(0,Math.min(1,0.65*(errors.length===0?1:0)+0.2*evidenceCoverage+0.15*(warnings.length===0?1:0)));
 const report={valid:errors.length===0,score,errors,warnings,evidenceCoverage,duplicateConcepts,isolatedConcepts};
 return errors.length?{report}:{value:v as KnowledgeUnderstanding,report};
}
