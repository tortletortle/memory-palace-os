import test from 'node:test';
import assert from 'node:assert/strict';
import {compileStateMachine} from '../src/spatial/causal-state-machine.ts';
import {compareStateMachineRuns} from '../src/spatial/counterfactual-compare.ts';
import type {PalaceObject} from '../src/store.ts';
import {EngineError} from '../src/schema.ts';
import {Store} from '../src/store.ts';
import {Engine} from '../src/service.ts';
import {OfflineModel} from '../src/model.ts';
import {api} from '../src/server.ts';
import {mkdtemp,readFile,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';

const source='state(low)；state(mid)；state(high)；initial(low)；input(T)=K；transition(low,heat,mid):T<373；transition(low,heat,high):T>=373；transition(mid,cool,low)；transition(high,cool,low)。';
const object=(evidenceQuote=source):PalaceObject=>({id:'o',conceptId:'c',label:'水相变模型',kind:'mechanism',evidenceQuote,metaphor:'状态转移',x:0,z:0,color:'#ffffff'});
function compiled(){const o=object(),c=compileStateMachine(o);if(!c.supported)throw new Error(c.reason);return {o,c};}
const hasCode=(code:string)=>(e:unknown)=>e instanceof EngineError&&e.code===code;
const steps=(temperature:number)=>[{event:'heat',inputs:{T:temperature}},{event:'cool',inputs:{T:300}}];

test('one-input intervention isolates a branch change and reports the first divergence',()=>{
 const {o,c}=compiled();
 const result=compareStateMachineRuns(o,c.revision,steps(372),steps(373));
 assert.equal(result.method,'single_input_intervention');
 assert.deepEqual(result.perturbation,{step:1,input:'T',unit:'K',baselineValue:372,interventionValue:373,delta:1});
 assert.equal(result.outcome,'different_path');
 assert.equal(result.firstObservedDifferenceStep,1);
 assert.equal(result.baselineRun.ok,true);
 assert.equal(result.interventionRun.ok,true);
 if(result.baselineRun.ok&&result.interventionRun.ok){
  assert.deepEqual(result.baselineRun.steps.map(x=>x.to),['mid','low']);
  assert.deepEqual(result.interventionRun.steps.map(x=>x.to),['high','low']);
  assert.equal(result.baselineRun.finalState,result.interventionRun.finalState);
 }
});

test('a numeric perturbation that does not cross a guard preserves the same path',()=>{
 const {o,c}=compiled();
 const result=compareStateMachineRuns(o,c.revision,steps(350),steps(360));
 assert.equal(result.outcome,'same_path');
 assert.equal(result.firstObservedDifferenceStep,null);
});

test('the comparison refuses zero changes, multiple changes, and altered event sequences',()=>{
 const {o,c}=compiled();
 assert.throws(()=>compareStateMachineRuns(o,c.revision,steps(350),steps(350)),hasCode('FSM_COMPARE_INVALID'));
 const twoInputs='state(a)；state(b)；initial(a)；input(T)=K；input(P)=Pa；transition(a,heat,b):T>=373。';
 const c2=compileStateMachine({...o,evidenceQuote:twoInputs});
 assert.equal(c2.supported,true);
 assert.throws(()=>compareStateMachineRuns({...o,evidenceQuote:twoInputs},c2.revision,
  [{event:'heat',inputs:{T:372,P:1}}],
  [{event:'heat',inputs:{T:373,P:2}}]),hasCode('FSM_COMPARE_INVALID'));
 assert.throws(()=>compareStateMachineRuns(o,c.revision,steps(372),[{event:'power',inputs:{T:373}},{event:'cool',inputs:{T:300}}]),hasCode('FSM_COMPARE_INVALID'));
});

test('one branch can be blocked while the other succeeds; failure is returned as data',()=>{
 const evidence='state(low)；state(high)；initial(low)；input(T)=K；transition(low,heat,high):T>=373。';
 const o=object(evidence),c=compileStateMachine(o);
 if(!c.supported)throw new Error(c.reason);
 const result=compareStateMachineRuns(o,c.revision,
  [{event:'heat',inputs:{T:373}}],
  [{event:'heat',inputs:{T:372}}]);
 assert.equal(result.outcome,'one_branch_blocked');
 assert.equal(result.firstObservedDifferenceStep,1);
 assert.equal(result.baselineRun.ok,true);
 assert.equal(result.interventionRun.ok,false);
 if(!result.interventionRun.ok)assert.equal(result.interventionRun.error.code,'FSM_GUARD_BLOCKED');
});

test('stale model revisions cannot be used for paired interventions',()=>{
 const {o,c}=compiled();
 assert.throws(()=>compareStateMachineRuns(o,'stale',steps(372),steps(373)),hasCode('FSM_STALE'));
});

test('HTTP compare endpoint runs paired traces without mutating palace learning data',async()=>{
 const dir=await mkdtemp(join(tmpdir(),'mp-v19-counterfactual-'));
 const store=new Store(join(dir,'state.json'));
 const server=api(new Engine(store,new OfflineModel()));
 try{
  await new Promise<void>(resolve=>server.listen(0,'127.0.0.1',resolve));
  const address=server.address();assert.ok(address&&typeof address==='object');
  const url='http://127.0.0.1:'+address.port;
  const post=(path:string,data:unknown)=>fetch(url+path,{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify(data)});
  const created=await post('/api/palaces',{title:'反事实对照验收',domain:'biology',objects:[object()]});
  assert.equal(created.status,201);
  const palace=await created.json() as any;
  const route='/api/palaces/'+palace.id+'/state-machines/c';
  const model=await (await fetch(url+route)).json() as any;
  const before=await store.read();
  const response=await post(route+'/compare',{revision:model.revision,baselineSteps:steps(372),interventionSteps:steps(373)});
  assert.equal(response.status,200);
  const result=await response.json() as any;
  assert.equal(result.outcome,'different_path');
  assert.equal(result.firstObservedDifferenceStep,1);
  assert.deepEqual(await store.read(),before);
  const invalid=await post(route+'/compare',{revision:model.revision,baselineSteps:steps(372),interventionSteps:steps(372)});
  assert.equal(invalid.status,422);
 }finally{
  await new Promise<void>(resolve=>server.close(()=>resolve()));
  await rm(dir,{recursive:true,force:true});
 }
});

test('counterfactual UI exposes one-factor controls and safe text rendering',async()=>{
 const html=await readFile('public/state-machine.html','utf8');
 const js=await readFile('public/state-machine.js','utf8');
 const ids=new Set([...html.matchAll(/\bid="([^"]+)"/g)].map(m=>m[1]));
 assert.deepEqual([...js.matchAll(/\$\('([^']+)'\)/g)].map(m=>m[1]).filter(x=>!ids.has(x)),[]);
 for(const id of ['compare-step','compare-variable','compare-value','compare-run'])assert.ok(ids.has(id),id);
 assert.match(js,/\/compare/);
 assert.doesNotMatch(js,/\beval\(|innerHTML/);
});
