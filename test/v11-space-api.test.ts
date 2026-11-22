
import test from 'node:test';
import assert from 'node:assert/strict';
import { api } from '../src/server.ts';
import { Engine } from '../src/service.ts';
import { Store } from '../src/store.ts';
import { OfflineModel } from '../src/model.ts';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

test('V1.1 compile endpoint creates and persists an architectural palace',async()=>{
 const dir=await mkdtemp(join(tmpdir(),'mp-v11-compile-'));
 const server=api(new Engine(new Store(join(dir,'state.json')),new OfflineModel()));
 try{
  await new Promise<void>(resolve=>server.listen(0,'127.0.0.1',resolve));
  const address=server.address();assert.ok(address&&typeof address==='object');
  const base=`http://127.0.0.1:${address.port}`;
  const response=await fetch(base+'/api/palaces/compile',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({source:'泊松分布描述随机事件发生次数。概率质量函数为 P(X=k)=λ^k e^{-λ}/k!。参数 λ 表示区间内事件发生次数的期望。'})});
  assert.equal(response.status,201);
  const result:any=await response.json();
  assert.ok(result.palace.architecture.rooms.length>=2);
  assert.equal(result.palace.objects.length,result.understanding.concepts.length);
  assert.equal(result.architectureValidation.valid,true);
  const loaded=await fetch(base+'/api/palaces/'+result.palace.id);assert.equal(loaded.status,200);
  const saved:any=await loaded.json();assert.ok(saved.architecture);assert.equal(saved.objects.length,result.palace.objects.length);
 }finally{await new Promise<void>(resolve=>server.close(()=>resolve()));await rm(dir,{recursive:true,force:true});}
});

test('V1.1 palace save rejects architecture with unplaced concepts',async()=>{
 const dir=await mkdtemp(join(tmpdir(),'mp-v11-invalid-'));
 const server=api(new Engine(new Store(join(dir,'state.json')),new OfflineModel()));
 try{
  await new Promise<void>(resolve=>server.listen(0,'127.0.0.1',resolve));
  const address=server.address();assert.ok(address&&typeof address==='object');
  const response=await fetch(`http://127.0.0.1:${address.port}/api/palaces`,{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({title:'Invalid',objects:[{conceptId:'c1',label:'概念',kind:'concept',evidenceQuote:'证据'}],architecture:{version:'1.1',rooms:[{id:'atrium',x:0,z:0,width:8,depth:8,conceptIds:[]}],placements:[],doors:[],route:['atrium'],objective:0,metrics:{routeLength:0,meanRelatedDistance:0,roomOverlapViolations:0}}})});
  assert.equal(response.status,422);
 }finally{await new Promise<void>(resolve=>server.close(()=>resolve()));await rm(dir,{recursive:true,force:true});}
});
