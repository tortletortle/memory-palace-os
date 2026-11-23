import test from 'node:test';
import assert from 'node:assert/strict';
import {compileStateMachine,runStateMachine} from '../src/spatial/causal-state-machine.ts';
import type {PalaceObject} from '../src/store.ts';
import {Store} from '../src/store.ts';
import {Engine} from '../src/service.ts';
import {OfflineModel} from '../src/model.ts';
import {api} from '../src/server.ts';
import {EngineError} from '../src/schema.ts';
import {mkdtemp,readFile,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';

const object=(evidenceQuote:string):PalaceObject=>({id:'o',conceptId:'c',label:'水相变状态机',kind:'mechanism',evidenceQuote,metaphor:'状态转移',x:0,z:0,color:'#ffffff'});
function compiled(source:string){const o=object(source),c=compileStateMachine(o);if(!c.supported)throw new Error(c.reason);assert.equal(c.supported,true);return {o,c};}
const hasCode=(code:string)=>(e:unknown)=>e instanceof EngineError&&e.code===code;
function run(source:string,steps:unknown){const {o,c}=compiled(source);return runStateMachine(o,c.revision,steps);}

test('explicit event interventions produce a deterministic finite-state trace',()=>{
 const source='state(off)；state(on)；initial(off)；transition(off,power_on,on)；transition(on,power_off,off)。';
 const {o,c}=compiled(source);
 assert.deepEqual(c.states,['off','on']);
 assert.equal(c.evidenceQuote,source);
 assert.equal(c.initialState,'off');
 const steps=[{event:'power_on',inputs:{}},{event:'power_off',inputs:{}}];
 const result=runStateMachine(o,c.revision,steps);
 assert.equal(result.finalState,'off');
 assert.deepEqual(result.steps.map(x=>[x.from,x.event,x.to]),[['off','power_on','on'],['on','power_off','off']]);
 assert.deepEqual(runStateMachine(o,c.revision,steps),result);
});

test('guards and invariants gate state transitions using declared input units',()=>{
 const source='state(idle)；state(boiling)；initial(idle)；input(T)=K；transition(idle,heat,boiling):T>=373；invariant(T>=0)。';
 const {o,c}=compiled(source);
 assert.deepEqual(c.inputs,[{id:'T',unit:'K'}]);
 assert.throws(()=>runStateMachine(o,c.revision,[{event:'heat',inputs:{T:372}}]),hasCode('FSM_GUARD_BLOCKED'));
 assert.throws(()=>runStateMachine(o,c.revision,[{event:'heat',inputs:{T:-1}}]),hasCode('FSM_INVARIANT'));
 const result=runStateMachine(o,c.revision,[{event:'heat',inputs:{T:373}}]);
 assert.equal(result.finalState,'boiling');
 assert.equal(result.steps[0].guard?.source,'T>=373');
});

test('disjoint guarded branches select exactly one transition',()=>{
 const source='state(low)；state(mid)；state(high)；initial(low)；input(T)=K；transition(low,heat,mid):T<373；transition(low,heat,high):T>=373。';
 assert.equal(run(source,[{event:'heat',inputs:{T:350}}]).finalState,'mid');
 assert.equal(run(source,[{event:'heat',inputs:{T:400}}]).finalState,'high');
});

test('overlapping guards are rejected at runtime rather than choosing by source order',()=>{
 const source='state(low)；state(mid)；state(high)；initial(low)；input(T)=K；transition(low,heat,mid):T>=300；transition(low,heat,high):T>=200。';
 const {o,c}=compiled(source);
 assert.throws(()=>runStateMachine(o,c.revision,[{event:'heat',inputs:{T:350}}]),hasCode('FSM_AMBIGUOUS'));
});

test('all declared inputs are required and extra, non-finite, or oversized values are refused',()=>{
 const source='state(a)；state(b)；initial(a)；input(T)=K；input(P)=W；transition(a,start,b)。';
 const {o,c}=compiled(source);
 for(const inputs of [{T:1},{T:1,P:2,extra:3},{T:NaN,P:2},{T:1,P:1e7},{T:'300',P:2}])
  assert.throws(()=>runStateMachine(o,c.revision,[{event:'start',inputs}]));
});

test('unknown events and events unavailable from the current state fail closed',()=>{
 const source='state(off)；state(on)；initial(off)；transition(off,power_on,on)；transition(on,power_off,off)。';
 const {o,c}=compiled(source);
 assert.throws(()=>runStateMachine(o,c.revision,[{event:'power_off',inputs:{}}]),hasCode('FSM_NO_TRANSITION'));
 assert.throws(()=>runStateMachine(o,c.revision,[{event:'unknown',inputs:{}}]),hasCode('FSM_NO_TRANSITION'));
});

test('malformed or structurally incomplete state machines abstain',()=>{
 const invalid=[
  'state(a)；state(b)；transition(a,start,b)。',
  'state(a)；state(b)；initial(c)；transition(a,start,b)。',
  'state(a)；state(b)；initial(a)；transition(a,start,c)。',
  'state(a)；state(a)；initial(a)；transition(a,start,a)。',
  'state(a)；state(b)；initial(a)；input(T)=K；input(T)=s；transition(a,start,b)。',
  'state(a)；state(b)；initial(a)；transition(a,start,b):T>=1。',
  'state(a)；state(b)；initial(a)；input(T)=K；invariant(P>=0)；transition(a,start,b)。',
  'state(a)；state(b)；initial(a)；transition(a,start,b)；transition(a,start,b)。',
  'state(a)；state(b)；initial(a)；transition(a,start,b)；这是错误的规则。',
  'state(a)；state(b)；initial(a)；transition(a,start,b)；invariant(T>=1e99)。',
  'state(a)；state(b)；initial(a)；transition(a,start,b)；'+'state('.repeat(13)+'x'+')'.repeat(13)+'。'
 ];
 for(const source of invalid)assert.equal(compileStateMachine(object(source)).supported,false,source);
});

test('stale source revisions and oversized traces are rejected',()=>{
 const {o,c}=compiled('state(a)；state(b)；initial(a)；transition(a,start,b)。');
 assert.throws(()=>runStateMachine({...o,evidenceQuote:o.evidenceQuote+' state(c)'},c.revision,[{event:'start',inputs:{}}]),hasCode('FSM_STALE'));
 assert.throws(()=>runStateMachine(o,c.revision,Array(41).fill({event:'start',inputs:{}})));
});

test('HTTP routes compile and run a state machine without mutating palace learning data',async()=>{
 const dir=await mkdtemp(join(tmpdir(),'mp-v19-fsm-'));
 const store=new Store(join(dir,'state.json'));
 const server=api(new Engine(store,new OfflineModel()));
 try{
  await new Promise<void>(resolve=>server.listen(0,'127.0.0.1',resolve));
  const address=server.address();assert.ok(address&&typeof address==='object');
  const url='http://127.0.0.1:'+address.port;
  const post=(path:string,data:unknown)=>fetch(url+path,{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify(data)});
  const created=await post('/api/palaces',{title:'状态机验收',domain:'biology',objects:[object('state(off)；state(on)；initial(off)；transition(off,power_on,on)；transition(on,power_off,off)。')]});
  assert.equal(created.status,201);
  const palace=await created.json() as any;
  const route='/api/palaces/'+palace.id+'/state-machines/c';
  const compiledResponse=await fetch(url+route);
  assert.equal(compiledResponse.status,200);
  const model=await compiledResponse.json() as any;
  assert.equal(model.supported,true);
  const before=await store.read();
  const response=await post(route+'/run',{revision:model.revision,steps:[{event:'power_on',inputs:{}},{event:'power_off',inputs:{}}]});
  assert.equal(response.status,200);
  assert.equal((await response.json() as any).finalState,'off');
  assert.deepEqual(await store.read(),before);
  for(const file of ['state-machine.html','state-machine.js','state-machine.css'])assert.equal((await fetch(url+'/'+file)).status,200);
  const stale=await post(route+'/run',{revision:'stale',steps:[{event:'power_on',inputs:{}}]});
  assert.equal(stale.status,409);
 }finally{
  await new Promise<void>(resolve=>server.close(()=>resolve()));
  await rm(dir,{recursive:true,force:true});
 }
});

test('state-machine frontend DOM contract has no executable HTML injection sink',async()=>{
 const html=await readFile('public/state-machine.html','utf8'),js=await readFile('public/state-machine.js','utf8'),index=await readFile('public/index.html','utf8'),app=await readFile('public/app.js','utf8');
 const ids=new Set([...html.matchAll(/\bid="([^"]+)"/g)].map(m=>m[1]));
 assert.deepEqual([...js.matchAll(/\$\('([^']+)'\)/g)].map(m=>m[1]).filter(x=>!ids.has(x)),[]);
 assert.match(index,/id="object-state-machine"/);
 assert.match(app,/object-state-machine/);
 assert.doesNotMatch(js,/\beval\(|innerHTML/);
});
