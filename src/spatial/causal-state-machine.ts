import {createHash} from 'node:crypto';
import {EngineError} from '../schema.ts';
import type {PalaceObject} from '../store.ts';

type Comparison={variable:string;op:'>'|'>='|'<'|'<='|'='|'==';value:number;source:string};
type Input={id:string;unit:string};
type Transition={from:string;event:string;to:string;guard?:Comparison;source:string};
type Machine={states:string[];initial:string;inputs:Input[];transitions:Transition[];invariants:Comparison[];revision:string;};

const idPattern=/^[A-Za-z][A-Za-z0-9_]{0,23}$/;
const numberPattern='[+-]?(?:\\d+(?:\\.\\d+)?|\\.\\d+)(?:[eE][+-]?\\d+)?';
function fail(message:string):never{throw new EngineError('FSM_INVALID',message,422);}
function normalize(s:string){return s.normalize('NFKC').replace(/[−–]/g,'-').replace(/≥/g,'>=').replace(/≤/g,'<=').replace(/＝/g,'=');}
function validId(value:string){return idPattern.test(value)&&!['constructor','prototype','__proto__','toString','valueOf','globalThis','window','document','process'].includes(value);}
function comparison(source:string):Comparison{
 const m=source.match(new RegExp('^([A-Za-z][A-Za-z0-9_]*)\\s*(>=|<=|==|>|<|=)\\s*('+numberPattern+')$'));
 if(!m||!validId(m[1]))fail('守卫或不变量必须是“变量 比较符 常数”，例如 T>=373');
 const value=Number(m[3]);
 if(!Number.isFinite(value)||Math.abs(value)>1e6)fail('守卫常数超出允许范围 ±1000000');
 return {variable:m[1],op:m[2] as Comparison['op'],value,source};
}
function compile(object:PalaceObject):Machine{
 const evidence=object.evidenceQuote;
 if(typeof evidence!=='string'||!evidence.trim()||evidence.length>2000)fail('缺少或超出长度限制的原文证据');
 if(/错误|不成立|不等于|并非|反例|不正确|不适用|≠|!=|\bwrong\b|\bincorrect\b|\bnot valid\b/i.test(object.label+' '+evidence))fail('原文含冲突线索，需人工复核');
 const states:string[]=[],inputs:Input[]=[],transitions:Transition[]=[],invariants:Comparison[]=[];
 let initial:string|undefined;
 const clauses=evidence.split(/[。；;\n]/).map(x=>normalize(x.trim())).filter(Boolean);
 for(const clause of clauses){
  let m:RegExpMatchArray|null;
  if((m=clause.match(/^state\(([A-Za-z][A-Za-z0-9_]*)\)$/))){
   if(!validId(m[1]))fail('状态名称非法');
   if(states.includes(m[1]))fail('重复状态声明：'+m[1]);
   if(states.length>=12)fail('最多十二个状态');
   states.push(m[1]);continue;
  }
  if((m=clause.match(/^initial\(([A-Za-z][A-Za-z0-9_]*)\)$/))){
   if(initial)fail('只能声明一个初始状态');
   if(!validId(m[1]))fail('初始状态名称非法');
   initial=m[1];continue;
  }
  if((m=clause.match(/^input\(([A-Za-z][A-Za-z0-9_]*)\)=([A-Za-z0-9µμΩ°/_^.-]{1,24})$/))){
   const inputId=m[1],unit=m[2];
   if(!validId(inputId))fail('输入变量名称非法');
   if(inputs.some(x=>x.id===inputId))fail('重复输入声明：'+inputId);
   if(inputs.length>=8)fail('最多八个数值输入');
   inputs.push({id:inputId,unit});continue;
  }
  if((m=clause.match(/^transition\(([A-Za-z][A-Za-z0-9_]*),([A-Za-z][A-Za-z0-9_]*),([A-Za-z][A-Za-z0-9_]*)\)(?::(.+))?$/))){
   if(!validId(m[1])||!validId(m[2])||!validId(m[3]))fail('状态转移名称非法');
   if(transitions.length>=24)fail('最多二十四条状态转移');
   const guard=m[4]?comparison(m[4]):undefined;
   transitions.push({from:m[1],event:m[2],to:m[3],...(guard?{guard}:{}),source:clause});continue;
  }
  if((m=clause.match(/^invariant\((.+)\)$/))){
   if(invariants.length>=12)fail('最多十二条不变量');
   invariants.push(comparison(m[1]));continue;
  }
  if(/^(state|initial|input|transition|invariant)\s*\(/.test(clause))fail('状态机声明格式错误：'+clause.slice(0,80));
 }
 if(states.length<2)fail('至少声明两个不同状态');
 if(!initial)fail('缺少 initial(状态名) 初始状态声明');
 if(!states.includes(initial))fail('初始状态未在 state(...) 中声明');
 if(!transitions.length)fail('至少声明一条 transition(from,event,to) 状态转移');
 for(const t of transitions){
  if(!states.includes(t.from)||!states.includes(t.to))fail('状态转移引用未声明状态：'+t.source);
  if(t.guard&&!inputs.some(x=>x.id===t.guard!.variable))fail('状态转移守卫引用未声明输入：'+t.guard.variable);
 }
 for(const c of invariants)if(!inputs.some(x=>x.id===c.variable))fail('不变量引用未声明输入：'+c.variable);
 for(let i=0;i<transitions.length;i++)for(let j=i+1;j<transitions.length;j++){
  const a=transitions[i],b=transitions[j];
  if(a.from===b.from&&a.event===b.event&&a.to===b.to&&JSON.stringify(a.guard)===JSON.stringify(b.guard))fail('重复状态转移：'+a.source);
 }
 const revision=createHash('sha256').update(JSON.stringify(['causal-state-machine-v1',object.conceptId,object.label,evidence])).digest('hex');
 return {states,initial,inputs,transitions,invariants,revision};
}
export function compileStateMachine(object:PalaceObject){
 try{
  const m=compile(object);
  return {supported:true as const,conceptId:object.conceptId,title:object.label,revision:m.revision,states:m.states,initialState:m.initial,inputs:m.inputs,transitions:m.transitions.map(t=>({from:t.from,event:t.event,to:t.to,...(t.guard?{guard:{variable:t.guard.variable,op:t.guard.op,value:t.guard.value,unit:m.inputs.find(x=>x.id===t.guard!.variable)!.unit}}:{})})),invariants:m.invariants.map(x=>({...x,unit:m.inputs.find(i=>i.id===x.variable)!.unit})),provenance:'explicit-evidence-state-machine' as const,verification:'仅验证显式状态、事件、数值守卫和不变量的结构及执行；输入值和阈值使用各自声明的单位标签，不执行单位换算或量纲证明。状态转移表达显式干预规则，不从相关性推断因果。'};
 }catch(e){if(e instanceof EngineError)return {supported:false as const,conceptId:object.conceptId,reason:e.message};throw e;}
}
function compare(value:number,c:Comparison){switch(c.op){case'>':return value>c.value;case'>=':return value>=c.value;case'<':return value<c.value;case'<=':return value<=c.value;case'=':case'==':return value===c.value;}}
export function runStateMachine(object:PalaceObject,revision:unknown,rawSteps:unknown){
 const m=compile(object);
 if(revision!==m.revision)throw new EngineError('FSM_STALE','原文或规则已改变，请重新加载状态机',409);
 if(!Array.isArray(rawSteps)||rawSteps.length<1||rawSteps.length>40)fail('steps 必须包含 1–40 个事件步骤');
 let current=m.initial;
 const trace:{index:number;event:string;from:string;to:string;inputs:Record<string,number>;transition:string;guard?:Comparison}[]=[];
 for(let index=0;index<rawSteps.length;index++){
  const raw=rawSteps[index];
  if(!raw||typeof raw!=='object'||Array.isArray(raw))fail('第 '+(index+1)+' 步必须是对象');
  const step=raw as Record<string,unknown>;
  if(Object.keys(step).some(k=>k!=='event'&&k!=='inputs')||typeof step.event!=='string'||!validId(step.event))fail('第 '+(index+1)+' 步必须只包含合法 event 和 inputs');
  if(!step.inputs||typeof step.inputs!=='object'||Array.isArray(step.inputs))fail('第 '+(index+1)+' 步缺少 inputs 对象');
  const rawInputs=step.inputs as Record<string,unknown>;
  if(Object.keys(rawInputs).length!==m.inputs.length||m.inputs.some(x=>!Object.hasOwn(rawInputs,x.id)))fail('第 '+(index+1)+' 步必须提供全部且仅提供声明的输入');
  const values:Record<string,number>={};
  for(const input of m.inputs){
   const value=rawInputs[input.id];
   if(typeof value!=='number'||!Number.isFinite(value)||Math.abs(value)>1e6)fail('第 '+(index+1)+' 步输入 '+input.id+' 必须是 ±1000000 内的有限数值（单位：'+input.unit+'）');
   values[input.id]=value;
  }
  for(const invariant of m.invariants)if(!compare(values[invariant.variable],invariant))throw new EngineError('FSM_INVARIANT','第 '+(index+1)+' 步违反不变量：'+invariant.source,409);
  const candidates=m.transitions.filter(t=>t.from===current&&t.event===step.event);
  if(!candidates.length)throw new EngineError('FSM_NO_TRANSITION','第 '+(index+1)+' 步没有从状态 '+current+' 响应事件 '+step.event+' 的转移',409);
  const eligible=candidates.filter(t=>!t.guard||compare(values[t.guard.variable],t.guard));
  if(!eligible.length)throw new EngineError('FSM_GUARD_BLOCKED','第 '+(index+1)+' 步所有候选转移的守卫条件均未满足',409);
  if(eligible.length>1)throw new EngineError('FSM_AMBIGUOUS','第 '+(index+1)+' 步存在多个同时满足的转移，拒绝猜测',409);
  const chosen=eligible[0],from=current;current=chosen.to;
  trace.push({index:index+1,event:step.event,from,to:current,inputs:values,transition:chosen.source,...(chosen.guard?{guard:chosen.guard}:{})});
 }
 return {revision:m.revision,initialState:m.initial,finalState:current,steps:trace};
}
