import test from 'node:test';
import assert from 'node:assert/strict';
import {compileSimulation,runSimulation} from '../src/spatial/simulation-compiler.ts';
import type {PalaceObject} from '../src/store.ts';

const object=(evidenceQuote:string):PalaceObject=>({
 id:'unit-test',conceptId:'unit-concept',label:'量纲测试',kind:'formula',
 evidenceQuote,metaphor:'单位校验',x:0,z:0,color:'#ffffff'
});
function compiled(source:string){
 const o=object(source),c=compileSimulation(o);
 if(!c.supported)throw new Error(c.reason);
 return {o,c};
}
function outputs(source:string,inputs:Record<string,number>){
 const {o,c}=compiled(source);
 return runSimulation(o,c.revision,inputs).outputs;
}

test('SI base and derived units verify a kinetic-energy equation',()=>{
 const {o,c}=compiled('unit(m)=kg；unit(v)=m/s；unit(E)=J；E=0.5*m*v^2。');
 assert.equal(c.unitAnalysis.status,'verified');
 assert.deepEqual(c.inputs.map(x=>[x.id,x.unit]),[['m','kg'],['v','m/s']]);
 assert.equal(c.equations[0].unit,'J');
 assert.deepEqual(runSimulation(o,c.revision,{m:2,v:3}).outputs,[{id:'E',value:9,unit:'J'}]);
});

test('multi-equation kinematics checks every term and keeps the explicit time bound',()=>{
 const {o,c}=compiled('unit(v0)=m/s；unit(a)=m/s^2；unit(t)=s；unit(v)=m/s；unit(s)=m；v=v0+a*t；s=v0*t+0.5*a*t^2；t>=0。');
 assert.equal(c.unitAnalysis.status,'verified');
 assert.deepEqual(runSimulation(o,c.revision,{v0:1,a:2,t:3}).outputs,[
  {id:'v',value:7,unit:'m/s'},{id:'s',value:12,unit:'m'}
 ]);
});

test('derived electrical units and topological ordering are dimensionally consistent',()=>{
 const {o,c}=compiled('unit(I)=A；unit(R)=ohm；unit(U)=V；unit(P)=W；P=U*I；U=I*R。');
 assert.equal(c.unitAnalysis.status,'verified');
 assert.deepEqual(c.equations.map(x=>x.output),['U','P']);
 assert.deepEqual(runSimulation(o,c.revision,{I:2,R:4}).outputs,[
  {id:'U',value:8,unit:'V'},{id:'P',value:16,unit:'W'}
 ]);
});

test('a declared unit can assign dimensions to an explicit numeric constant',()=>{
 const {o,c}=compiled('unit(g)=m/s^2；g=9.81。');
 assert.equal(c.unitAnalysis.status,'verified');
 assert.deepEqual(runSimulation(o,c.revision,{}).outputs,[{id:'g',value:9.81,unit:'m/s^2'}]);
});

test('dimension mismatch is rejected instead of silently executing',()=>{
 for(const source of [
  'unit(m)=kg；unit(a)=m/s^2；unit(F)=J；F=m*a。',
  'unit(x)=m；unit(y)=s；unit(z)=m；z=x+y。',
  'unit(x)=m；unit(y)=1；y=sin(x)。'
 ]){
  const result=compileSimulation(object(source));
  assert.equal(result.supported,false,source);
  if(!result.supported)assert.match(result.reason,/量纲|无量纲/);
 }
});

test('sqrt preserves valid fractional dimensional reasoning and trig accepts dimensionless angles',()=>{
 const area=outputs('unit(area)=m^2；unit(length)=m；length=sqrt(area)。',{area:16});
 assert.deepEqual(area,[{id:'length',value:4,unit:'m'}]);
 const angle=outputs('unit(theta)=rad；unit(y)=1；y=sin(theta)。',{theta:Math.PI/2});
 assert.ok(Math.abs(angle[0].value-1)<1e-12);
 assert.equal(angle[0].unit,'1');
});

test('variable exponents are only accepted for dimensionless bases',()=>{
 const ok=compileSimulation(object('unit(x)=1；unit(p)=1；unit(y)=1；y=x^p。'));
 assert.equal(ok.supported,true);
 const bad=compileSimulation(object('unit(x)=m；unit(p)=1；unit(y)=m；y=x^p。'));
 assert.equal(bad.supported,false);
});

test('partial unit declarations are reported as incomplete and never presented as verified',()=>{
 const {c}=compiled('unit(x)=m；y=x。');
 assert.equal(c.unitAnalysis.status,'incomplete');
 assert.deepEqual(c.unitAnalysis.missing,['y']);
 assert.equal(c.inputs[0].unit,undefined);
});

test('missing declarations preserve legacy numeric behavior without claiming unit verification',()=>{
 const {o,c}=compiled('E=0.5*m*v^2。');
 assert.equal(c.unitAnalysis.status,'not_provided');
 assert.deepEqual(runSimulation(o,c.revision,{m:2,v:3}).outputs,[{id:'E',value:9}]);
});

test('unknown, duplicate, unsupported and malformed unit declarations abstain',()=>{
 for(const source of [
  'unit(ghost)=m；y=x。',
  'unit(x)=m；unit(x)=s；y=x。',
  'unit(x)=furlong；y=x。',
  'unit(x)=kg m/s；y=x。',
  'unit(x)=m^9；y=x。',
  'unit(x)=m/；y=x。',
  'unit(x)='+'m*'.repeat(40)+'m；y=x。'
 ]){
  assert.equal(compileSimulation(object(source)).supported,false,source);
 }
});

test('unit annotations participate in revision identity and stale runs are rejected',()=>{
 const a=compiled('unit(x)=m；unit(y)=m；y=x。');
 const b=compiled('unit(x)=s；unit(y)=s；y=x。');
 assert.notEqual(a.c.revision,b.c.revision);
 assert.throws(()=>runSimulation(b.o,a.c.revision,{x:2}),/重新加载/);
});
