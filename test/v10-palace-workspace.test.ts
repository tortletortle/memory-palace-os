
import test from 'node:test';
import assert from 'node:assert/strict';
import { api } from '../src/server.ts';
import { Engine } from '../src/service.ts';
import { Store } from '../src/store.ts';
import { OfflineModel } from '../src/model.ts';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

test('V1.0 serves the 3D workspace and persists palace scenes',async()=>{
 const dir=await mkdtemp(join(tmpdir(),'mp-v10-api-'));
 const server=api(new Engine(new Store(join(dir,'state.json')),new OfflineModel()));
 try{
  await new Promise<void>(resolve=>server.listen(0,'127.0.0.1',resolve));
  const address=server.address();assert.ok(address&&typeof address==='object');
  const base=`http://127.0.0.1:${address.port}`;
  const home=await fetch(base+'/');assert.equal(home.status,200);assert.match(await home.text(),/Memory Palace OS/);
  const app=await fetch(base+'/app.js');assert.equal(app.status,200);assert.match(await app.text(),/OrbitControls/);
  const created=await fetch(base+'/api/palaces',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({title:'测试宫殿',domain:'probability',objects:[{id:'o1',conceptId:'c1',label:'泊松分布',kind:'concept',evidenceQuote:'泊松分布定义',metaphor:'概率塔',x:1,z:2,color:'#9ebd80'}]})});
  assert.equal(created.status,201);const palace:any=await created.json();assert.equal(palace.objects.length,1);
  const loaded=await fetch(base+'/api/palaces/'+palace.id);assert.equal(loaded.status,200);assert.equal((await loaded.json() as any).title,'测试宫殿');
  const updated=await fetch(base+'/api/palaces/'+palace.id,{method:'PUT',headers:{'content-type':'application/json'},body:JSON.stringify({title:'更新后的宫殿',domain:'probability',objects:[{id:'o1',conceptId:'c1',label:'更新后的概念',kind:'concept',evidenceQuote:'证据',metaphor:'锚点',x:2,z:3}]})});
  assert.equal(updated.status,200);assert.equal((await updated.json() as any).title,'更新后的宫殿');
  const list=await fetch(base+'/api/palaces');assert.equal((await list.json() as any[]).length,1);
 }finally{await new Promise<void>(resolve=>server.close(()=>resolve()));await rm(dir,{recursive:true,force:true});}
});
test('V1.0 palace API rejects invalid object kinds',async()=>{
 const dir=await mkdtemp(join(tmpdir(),'mp-v10-invalid-'));
 const server=api(new Engine(new Store(join(dir,'state.json')),new OfflineModel()));
 try{
  await new Promise<void>(resolve=>server.listen(0,'127.0.0.1',resolve));
  const address=server.address();assert.ok(address&&typeof address==='object');
  const response=await fetch(`http://127.0.0.1:${address.port}/api/palaces`,{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({title:'Bad',objects:[{conceptId:'x',label:'x',kind:'script',evidenceQuote:'x'}]})});
  assert.equal(response.status,422);
 }finally{await new Promise<void>(resolve=>server.close(()=>resolve()));await rm(dir,{recursive:true,force:true});}
});
