import test from 'node:test';
import assert from 'node:assert/strict';
import { compileMemoryArchitecture, validateMemoryArchitecture } from '../src/spatial/space-compiler.ts';
import type { KnowledgeUnderstanding } from '../src/knowledge-understanding-types.ts';

const fixture:KnowledgeUnderstanding={
 title:'概率论记忆宫殿',domain:'probability',summary:'概率分布与相关概念。',
 concepts:[
  {id:'c1',label:'随机变量',kind:'concept',evidenceQuote:'随机变量'},
  {id:'c2',label:'概率质量函数',kind:'formula',evidenceQuote:'概率质量函数'},
  {id:'c3',label:'参数条件',kind:'condition',evidenceQuote:'参数条件'},
  {id:'c4',label:'计算步骤',kind:'procedure',evidenceQuote:'计算步骤'},
  {id:'c5',label:'发生机制',kind:'mechanism',evidenceQuote:'发生机制'},
  {id:'c6',label:'实际案例',kind:'example',evidenceQuote:'实际案例'}
 ],
 relations:[
  {from:'c1',to:'c2',type:'uses',evidenceQuote:'随机变量使用概率质量函数'},
  {from:'c2',to:'c3',type:'depends_on',evidenceQuote:'概率质量函数依赖参数条件'},
  {from:'c3',to:'c4',type:'sequence_before',evidenceQuote:'参数条件先于计算步骤'},
  {from:'c5',to:'c6',type:'example_of',evidenceQuote:'实际案例展示发生机制'}
 ],
 features:{spatial:.2,symbolic:.8,causal:.5,sequential:.6,hierarchical:.4,contrastive:.2,analogical:.3,dynamic:.2,retrieval:.7,semantic:.8},
 uncertaintyNotes:[]
};
test('compiler places every concept and creates semantically typed rooms',()=>{
 const plan=compileMemoryArchitecture(fixture);
 assert.equal(plan.metrics.concepts,6);
 assert.ok(plan.rooms.some(r=>r.kind==='library'));
 assert.ok(plan.rooms.some(r=>r.kind==='threshold'));
 assert.ok(plan.rooms.some(r=>r.kind==='garden'));
 assert.equal(plan.placements.length,6);
 assert.equal(plan.metrics.roomOverlapViolations,0);
 assert.equal(validateMemoryArchitecture(plan,fixture.concepts.map(c=>c.id)).valid,true);
});
test('compiler is deterministic and produces finite coordinates',()=>{
 const a=compileMemoryArchitecture(fixture),b=compileMemoryArchitecture(fixture);
 assert.deepEqual(a,b);
 for(const p of a.placements){assert.ok(Number.isFinite(p.x));assert.ok(Number.isFinite(p.z));}
});
test('compiler creates central atrium access and relation-aware room links',()=>{
 const plan=compileMemoryArchitecture(fixture);
 assert.ok(plan.doors.some(d=>d.fromRoomId==='atrium'));
 for(const door of plan.doors){assert.ok(plan.rooms.some(r=>r.id===door.fromRoomId));assert.ok(plan.rooms.some(r=>r.id===door.toRoomId));}
 assert.ok(plan.route[0]==='atrium');
});
test('validator rejects missing and duplicate concept placements',()=>{
 const plan=compileMemoryArchitecture(fixture);
 const bad=structuredClone(plan);bad.placements.pop();bad.placements.push({...bad.placements[0]});
 const result=validateMemoryArchitecture(bad,fixture.concepts.map(c=>c.id));
 assert.equal(result.valid,false);
 assert.ok(result.errors.some(e=>e.includes('duplicate')));
 assert.ok(result.errors.some(e=>e.includes('not placed')));
});

test('compiler handles the 40-concept upper-bound stress fixture without room overlap',()=>{
 const concepts=Array.from({length:40},(_,i)=>({id:`s${i}`,label:`压力概念${i}`,kind:['concept','formula','condition'][i%3] as any,evidenceQuote:`压力概念${i}`}));
 const relations=Array.from({length:39},(_,i)=>({from:`s${i}`,to:`s${i+1}`,type:'depends_on' as const,evidenceQuote:`压力概念${i}依赖压力概念${i+1}`}));
 const plan=compileMemoryArchitecture({...fixture,concepts,relations});
 assert.equal(plan.metrics.concepts,40);
 assert.equal(plan.metrics.roomOverlapViolations,0);
 assert.equal(plan.metrics.overlapViolations,0);
 assert.equal(validateMemoryArchitecture(plan,concepts.map(c=>c.id)).valid,true);
});
