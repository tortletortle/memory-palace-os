
import test from 'node:test';
import assert from 'node:assert/strict';
import { OfflineKnowledgeModel, RemoteKnowledgeModel, understandKnowledge } from '../src/knowledge-understanding.ts';
import { validateKnowledgeUnderstanding } from '../src/knowledge-understanding-validator.ts';

const source='泊松分布的概率质量函数为 P(X=k)=λ^k e^{-λ}/k!，其中 λ 是单位区间内事件发生次数的期望。';
const valid={
 title:'泊松分布',domain:'probability',summary:'描述固定区间内事件次数的概率分布。',
 concepts:[
  {id:'c1',label:'泊松分布',kind:'concept',evidenceQuote:'泊松分布'},
  {id:'c2',label:'概率质量函数',kind:'formula',evidenceQuote:'P(X=k)=λ^k e^{-λ}/k!'},
  {id:'c3',label:'参数λ',kind:'condition',evidenceQuote:'λ 是单位区间内事件发生次数的期望'}
 ],
 relations:[{from:'c1',to:'c2',type:'uses',evidenceQuote:'泊松分布的概率质量函数'},{from:'c2',to:'c3',type:'uses',evidenceQuote:'其中 λ 是单位区间内事件发生次数的期望'}],
 features:{spatial:0,symbolic:1,causal:0.2,sequential:0,hierarchical:0.3,contrastive:0,analogical:0,dynamic:0.2,retrieval:0.5,semantic:0.8},
 uncertaintyNotes:['公式适用条件未在这段材料中完整说明']
};
test('source-grounded validator rejects invented evidence',()=>{
 const bad=structuredClone(valid);bad.concepts[1].evidenceQuote='P(X=k)=λ^k e^{λ}/k!';
 const result=validateKnowledgeUnderstanding(source,bad);
 assert.equal(result.report.valid,false);
 assert.ok(result.report.errors.some(x=>x.includes('evidence_not_in_source')));
});
test('source-grounded validator rejects dangling relation endpoints',()=>{
 const bad=structuredClone(valid);bad.relations[0].to='c99';
 const result=validateKnowledgeUnderstanding(source,bad);
 assert.equal(result.report.valid,false);
});
test('offline model provides explicit low-confidence baseline, not fabricated relations',async()=>{
 const result=await understandKnowledge(source,new OfflineKnowledgeModel());
 assert.equal(result.provenance.mode,'offline');
 assert.ok(result.understanding.uncertaintyNotes.some(x=>x.includes('offline_rule_baseline')));
 assert.equal(result.understanding.relations.length,0);
});
test('remote model parses schema-constrained response and is evidence-checked locally',async()=>{
 let requestBody:any;
 const fake=async (_url:any,init:any)=>{requestBody=JSON.parse(init.body);return new Response(JSON.stringify({choices:[{finish_reason:'stop',message:{content:JSON.stringify(valid)}}]}),{status:200,headers:{'Content-Type':'application/json'}});};
 const model=new RemoteKnowledgeModel({baseUrl:'https://example.test/v1',apiKey:'test-key',model:'test-model'},fake as any);
 const result=await understandKnowledge(source,model);
 assert.equal(result.provenance.mode,'remote');
 assert.equal(requestBody.model,'test-model');
 assert.equal(requestBody.response_format.type,'json_schema');
});
test('remote model refuses unsafe non-HTTPS provider URL',()=>{
 assert.throws(()=>new RemoteKnowledgeModel({baseUrl:'http://example.com/v1',apiKey:'x',model:'m'}));
});

test('knowledge understanding HTTP endpoint works offline and returns source provenance',async()=>{
 const {api}=await import('../src/server.ts');
 const {Engine}=await import('../src/service.ts');
 const {Store}=await import('../src/store.ts');
 const {OfflineModel}=await import('../src/model.ts');
 const {mkdtemp,rm}=await import('node:fs/promises');
 const {tmpdir}=await import('node:os');
 const {join}=await import('node:path');
 const dir=await mkdtemp(join(tmpdir(),'mp-v09-api-'));
 const server=api(new Engine(new Store(join(dir,'state.json')),new OfflineModel()));
 try{
  await new Promise<void>(resolve=>server.listen(0,'127.0.0.1',resolve));
  const address=server.address();assert.ok(address&&typeof address==='object');
  const response=await fetch(`http://127.0.0.1:${address.port}/api/knowledge/understand`,{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({source:'泊松分布的概率质量函数为 P(X=k)=λ^k e^{-λ}/k!。'})});
  assert.equal(response.status,200);
  const result:any=await response.json();
  assert.equal(result.provenance.mode,'offline');
  assert.ok(result.understanding.concepts.length>0);
  assert.ok(Array.isArray(result.strategyCandidates));
 }finally{
  await new Promise<void>(resolve=>server.close(()=>resolve()));
  await rm(dir,{recursive:true,force:true});
 }
});
