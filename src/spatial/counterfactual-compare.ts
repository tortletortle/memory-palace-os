import {EngineError} from '../schema.ts';
import type {PalaceObject} from '../store.ts';
import {compileStateMachine,runStateMachine} from './causal-state-machine.ts';

type Step={event:string;inputs:Record<string,number>};
type BranchResult=
 | {ok:true;initialState:string;finalState:string;steps:Array<{index:number;event:string;from:string;to:string;inputs:Record<string,number>;transition:string}>}
 | {ok:false;error:{code:string;message:string;status:number};completedSteps:number};

function fail(message:string):never{throw new EngineError('FSM_COMPARE_INVALID',message,422);}
function record(value:unknown):value is Record<string,unknown>{return !!value&&typeof value==='object'&&!Array.isArray(value);}
function execute(object:PalaceObject,revision:string,steps:unknown):BranchResult{
 try{return {ok:true,...runStateMachine(object,revision,steps)};}
 catch(error){
  if(!(error instanceof EngineError))throw error;
  const message=error.message;
  const match=message.match(/第\s*(\d+)\s*步/);
  return {ok:false,error:{code:error.code,message,status:error.status},completedSteps:match?Number(match[1])-1:0};
 }
}

/**
 * Compare two executions that differ in exactly one numeric input at one step.
 * This is a controlled intervention inside an explicit model, not evidence that
 * the same causal relationship holds in the physical world.
 */
export function compareStateMachineRuns(object:PalaceObject,revision:unknown,baselineRaw:unknown,interventionRaw:unknown){
 const model=compileStateMachine(object);
 if(!model.supported)throw new EngineError('FSM_INVALID',model.reason,422);
 if(revision!==model.revision)throw new EngineError('FSM_STALE','原文或规则已改变，请重新加载状态机',409);
 if(!Array.isArray(baselineRaw)||!Array.isArray(interventionRaw)||baselineRaw.length<1||baselineRaw.length>40||baselineRaw.length!==interventionRaw.length)fail('基线和干预序列必须具有相同的 1–40 步长度');
 const baseline:Step[]=[],intervention:Step[]=[];
 const changes:Array<{step:number;input:string;baselineValue:number;interventionValue:number}>=[];
 const inputIds=model.inputs.map(x=>x.id).sort();
 for(let i=0;i<baselineRaw.length;i++){
  const a=baselineRaw[i],b=interventionRaw[i];
  if(!record(a)||!record(b)||Object.keys(a).some(k=>k!=='event'&&k!=='inputs')||Object.keys(b).some(k=>k!=='event'&&k!=='inputs'))fail('第 '+(i+1)+' 步格式错误');
  if(typeof a.event!=='string'||typeof b.event!=='string'||a.event!==b.event)fail('两组实验必须使用完全相同的事件序列');
  if(!record(a.inputs)||!record(b.inputs))fail('第 '+(i+1)+' 步必须提供 inputs 对象');
  const aKeys=Object.keys(a.inputs).sort(),bKeys=Object.keys(b.inputs).sort();
  if(aKeys.length!==inputIds.length||bKeys.length!==inputIds.length||aKeys.some((x,j)=>x!==inputIds[j])||bKeys.some((x,j)=>x!==inputIds[j]))fail('第 '+(i+1)+' 步必须提供全部且仅提供声明的输入');
  const ai:Record<string,number>={},bi:Record<string,number>={};
  for(const input of model.inputs){
   const av=a.inputs[input.id],bv=b.inputs[input.id];
   if(typeof av!=='number'||!Number.isFinite(av)||Math.abs(av)>1e6||typeof bv!=='number'||!Number.isFinite(bv)||Math.abs(bv)>1e6)fail('第 '+(i+1)+' 步输入 '+input.id+' 必须是 ±1000000 内的有限数值');
   ai[input.id]=av;bi[input.id]=bv;
   if(av!==bv)changes.push({step:i+1,input:input.id,baselineValue:av,interventionValue:bv});
  }
  baseline.push({event:a.event,inputs:ai});
  intervention.push({event:b.event,inputs:bi});
 }
 if(changes.length!==1)fail('为了形成可解释的单变量对照，两组实验必须且只能改变一个输入值');
 const change=changes[0],unit=model.inputs.find(x=>x.id===change.input)!.unit;
 const baselineRun=execute(object,model.revision,baseline);
 const interventionRun=execute(object,model.revision,intervention);
 const baseSteps=baselineRun.ok?baselineRun.steps:[];
 const interventionSteps=interventionRun.ok?interventionRun.steps:[];
 let firstObservedDifferenceStep:number|null=null;
 if(baselineRun.ok&&interventionRun.ok){
  const count=Math.max(baseSteps.length,interventionSteps.length);
  for(let i=0;i<count;i++){
   const a=baseSteps[i],b=interventionSteps[i];
   if(!a||!b||a.from!==b.from||a.to!==b.to||a.transition!==b.transition){firstObservedDifferenceStep=i+1;break;}
  }
 }else if(!baselineRun.ok&&interventionRun.ok){
  firstObservedDifferenceStep=baselineRun.completedSteps+1;
 }else if(baselineRun.ok&&!interventionRun.ok){
  firstObservedDifferenceStep=interventionRun.completedSteps+1;
 }else if(!baselineRun.ok&&!interventionRun.ok){
  const a=baselineRun.error,b=interventionRun.error;
  if(a.code!==b.code||a.message!==b.message)firstObservedDifferenceStep=Math.min(baselineRun.completedSteps,interventionRun.completedSteps)+1;
 }
 const outcome=baselineRun.ok&&interventionRun.ok
  ?(firstObservedDifferenceStep===null?'same_path':'different_path')
  :baselineRun.ok!==interventionRun.ok?'one_branch_blocked'
  :firstObservedDifferenceStep===null?'both_blocked':'different_failure';
 return {
  revision:model.revision,
  method:'single_input_intervention' as const,
  perturbation:{step:change.step,input:change.input,unit,baselineValue:change.baselineValue,interventionValue:change.interventionValue,delta:change.interventionValue-change.baselineValue},
  baselineRun,interventionRun,firstObservedDifferenceStep,outcome,
  interpretation:'结果只描述当前显式状态机在给定事件序列和单一输入干预下的模型内差异；不能单独证明现实世界的因果关系，也不验证单位换算或输入阈值是否符合真实物理条件。'
 };
}
