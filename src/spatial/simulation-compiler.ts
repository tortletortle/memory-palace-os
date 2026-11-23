import {createHash} from 'node:crypto';
import {EngineError} from '../schema.ts';
import type {PalaceObject} from '../store.ts';

type Expr={kind:'number';value:number}|{kind:'variable';name:string}|{kind:'unary';op:'-'|'+';arg:Expr}|{kind:'binary';op:string;left:Expr;right:Expr}|{kind:'function';name:string;arg:Expr};
type Constraint={variable:string;op:string;value:number;source:string};
type Equation={output:string;source:string;dependencies:string[];expr:Expr};
const MAX=1e12;
const functions=new Set(['exp','sqrt','log','abs','sin','cos']);
const reserved=new Set(['constructor','prototype','__proto__','toString','valueOf','hasOwnProperty','eval','Function','process','globalThis','window','document','require','import','NaN','Infinity','undefined','null','true','false']);
const constants=new Map([['pi',Math.PI],['e',Math.E]]);
const ident=/^[A-Za-z][A-Za-z0-9_]{0,23}$/;
const validName=(s:string)=>ident.test(s)&&!/[A-Z]{2,}/.test(s)&&!reserved.has(s)&&!functions.has(s)&&!constants.has(s);
function fail(message:string):never{throw new EngineError('SIM_INVALID',message,422);}
function bounded(n:number){if(!Number.isFinite(n)||Math.abs(n)>MAX)fail('结果超出有限数值范围');return n;}
function normalize(s:string){return s.replace(/[！-～]/g,c=>String.fromCharCode(c.charCodeAt(0)-0xfee0)).replace(/[×·⋅]/g,'*').replace(/[−–]/g,'-').replace(/÷/g,'/').replace(/≥/g,'>=').replace(/≤/g,'<=').replace(/π/g,'pi').replace(/λ/g,'lambda').replace(/ω/g,'omega').replace(/θ/g,'theta');}
function tokens(s:string){if(s.length>256)fail('表达式过长');const result:string[]=[];let i=0;while(i<s.length){if(/\s/.test(s[i])){i++;continue;}const m=s.slice(i).match(/^(?:\d+(?:\.\d+)?|\.\d+)(?:[eE][+-]?\d+)?|^[A-Za-z][A-Za-z0-9_]*|^[+*/^()\-]/);if(!m)fail(`不支持的字符：${s[i]}`);result.push(m[0]);i+=m[0].length;if(result.length>100)fail('表达式 token 过多');}return result;}
function parse(source:string):Expr{const t=tokens(source);let i=0,depth=0,nodes=0;const peek=()=>t[i];const take=()=>t[i++];const node=(e:Expr)=>{if(++nodes>100)fail('AST 节点过多');return e;};function nested<T>(f:()=>T):T{if(++depth>24)fail('表达式嵌套过深');try{return f();}finally{depth--;}}
 function primary():Expr{const p=take();if(!p)fail('缺少表达式');if(p==='('){const a=nested(sum);if(take()!==')')fail('括号不匹配');return a;}if(/^[\d.]/.test(p))return node({kind:'number',value:bounded(Number(p))});if(functions.has(p)){if(take()!=='(')fail('函数需要括号');const a=nested(sum);if(take()!==')')fail('括号不匹配');return node({kind:'function',name:p,arg:a});}if(constants.has(p))return node({kind:'number',value:constants.get(p)!});if(validName(p))return node({kind:'variable',name:p});return fail('非法变量或运算符');}
 function power():Expr{const left=primary();if(peek()==='^'){take();return node({kind:'binary',op:'^',left,right:nested(unary)});}return left;}
 function unary():Expr{const p=peek();if(p==='+'||p==='-'){take();return node({kind:'unary',op:p,arg:nested(unary)});}return power();}
 function product():Expr{let a=unary();while(peek()==='*'||peek()==='/'){const op=take();a=node({kind:'binary',op,left:a,right:unary()});}return a;}
 function sum():Expr{let a=product();while(peek()==='+'||peek()==='-'){const op=take();a=node({kind:'binary',op,left:a,right:product()});}return a;}
 const result=sum();if(i!==t.length)fail('需要显式乘号；不支持隐式乘法或额外表达式');return result;}
function dependencies(e:Expr,out=new Set<string>()):string[]{if(e.kind==='variable')out.add(e.name);else if(e.kind==='binary'){dependencies(e.left,out);dependencies(e.right,out);}else if('arg'in e)dependencies(e.arg,out);return [...out];}
function evaluate(e:Expr,env:Map<string,number>):number{switch(e.kind){case'number':return e.value;case'variable':{if(!env.has(e.name))fail('未定义变量');return env.get(e.name)!;}case'unary':return bounded((e.op==='-'?-1:1)*evaluate(e.arg,env));case'binary':{const l=evaluate(e.left,env),r=evaluate(e.right,env);switch(e.op){case'+':return bounded(l+r);case'-':return bounded(l-r);case'*':return bounded(l*r);case'/':if(r===0)fail('除数不能为零');return bounded(l/r);case'^':if(Math.abs(r)>100||l===0&&r<=0||l<0&&!Number.isInteger(r))fail('幂运算超出定义域');return bounded(l**r);default:return fail('未知运算');}}case'function':{const a=evaluate(e.arg,env);switch(e.name){case'exp':return bounded(Math.exp(a));case'sqrt':if(a<0)fail('平方根定义域错误');return bounded(Math.sqrt(a));case'log':if(a<=0)fail('自然对数定义域错误');return bounded(Math.log(a));case'abs':return Math.abs(a);case'sin':return Math.sin(a);case'cos':return Math.cos(a);default:return fail('未知函数');}}}}

type Dimension=[number,number,number,number,number,number,number];
type UnitAnalysis={
 status:'not_provided'|'incomplete'|'verified';
 declared:{variable:string;unit:string;dimension:string}[];
 missing:string[];
 message:string;
};
const dim=(l=0,m=0,t=0,i=0,th=0,n=0,j=0):Dimension=>[l,m,t,i,th,n,j];
const dimensionless=dim();
const unitDefinitions=new Map<string,Dimension>([
 ['1',dim()],['rad',dim()],
 ['m',dim(1)],['kg',dim(0,1)],['s',dim(0,0,1)],['A',dim(0,0,0,1)],
 ['K',dim(0,0,0,0,1)],['mol',dim(0,0,0,0,0,1)],['cd',dim(0,0,0,0,0,0,1)],
 ['Hz',dim(0,0,-1)],['N',dim(1,1,-2)],['Pa',dim(-1,1,-2)],
 ['J',dim(2,1,-2)],['W',dim(2,1,-3)],['C',dim(0,0,1,1)],
 ['V',dim(2,1,-3,-1)],['ohm',dim(2,1,-3,-2)],['F',dim(-2,-1,4,2)],
 ['Wb',dim(2,1,-2,-1)],['T',dim(0,1,-2,-1)]
]);
const dimensionNames=['m','kg','s','A','K','mol','cd'];
function combineDimension(a:Dimension,b:Dimension,sign=1):Dimension{return a.map((x,i)=>x+sign*b[i]) as Dimension;}
function scaleDimension(a:Dimension,k:number):Dimension{return a.map(x=>x*k) as Dimension;}
function sameDimension(a:Dimension,b:Dimension):boolean{return a.every((x,i)=>Math.abs(x-b[i])<1e-9);}
function isDimensionless(a:Dimension):boolean{return sameDimension(a,dimensionless);}
function formatDimension(a:Dimension):string{
 const parts=a.flatMap((power,index)=>Math.abs(power)<1e-9?[]:[dimensionNames[index]+(Math.abs(power-1)<1e-9?'': '^'+Number(power.toFixed(6)))]);
 return parts.length?parts.join('·'):'1';
}
function parseUnitExpression(source:string):Dimension{
 const s=normalize(source).replace(/\\s+/g,'');
 if(!s)fail('单位声明不能为空');
 let i=0,sign=1,expectFactor=true,result=dim();
 while(i<s.length){
  if(expectFactor){
   const match=s.slice(i).match(/^(?:[A-Za-z]+|1)/);
   if(!match)fail('单位表达式必须使用显式单位符号和乘除，例如 kg*m/s^2');
   const symbol=match[0],base=unitDefinitions.get(symbol);
   if(!base)fail('不支持的单位符号：'+symbol);
   i+=symbol.length;
   let exponent=1;
   if(s[i]==='^'){
    i++;const power=s.slice(i).match(/^[+-]?\\d+/);
    if(!power)fail('单位指数必须是整数');
    exponent=Number(power[0]);i+=power[0].length;
    if(!Number.isInteger(exponent)||Math.abs(exponent)>8)fail('单位指数必须在 -8 到 8 之间');
   }
   result=combineDimension(result,scaleDimension(base,exponent*sign));
   expectFactor=false;
  }else{
   const op=s[i];
   if(op!=='*'&&op!=='/')fail('单位之间必须使用显式 * 或 /');
   sign=op==='*'?1:-1;i++;expectFactor=true;
  }
 }
 if(expectFactor)fail('单位表达式不能以乘除符号结尾');
 return result;
}
function numericLiteral(e:Expr):number|null{
 if(e.kind==='number')return e.value;
 if(e.kind==='unary'){const value=numericLiteral(e.arg);return value===null?null:(e.op==='-'?-value:value);}
 return null;
}
function inferDimension(e:Expr,units:Map<string,Dimension>):Dimension{
 switch(e.kind){
  case'number':return dim();
  case'variable':{const value=units.get(e.name);if(!value)fail('单位分析缺少变量声明：'+e.name);return value;}
  case'unary':return inferDimension(e.arg,units);
  case'binary':{
   const left=inferDimension(e.left,units),right=inferDimension(e.right,units);
   if(e.op==='+'||e.op==='-'){
    if(!sameDimension(left,right))fail('加减两侧量纲不一致：'+formatDimension(left)+' 与 '+formatDimension(right));
    return left;
   }
   if(e.op==='*')return combineDimension(left,right);
   if(e.op==='/')return combineDimension(left,right,-1);
   if(e.op==='^'){
    if(!isDimensionless(right))fail('幂指数必须是无量纲量');
    const power=numericLiteral(e.right);
    if(power!==null)return scaleDimension(left,power);
    if(!isDimensionless(left))fail('带量纲的底数必须使用常数指数');
    return dim();
   }
   return fail('未知运算');
  }
  case'function':{
   const arg=inferDimension(e.arg,units);
   if(e.name==='sqrt')return scaleDimension(arg,.5);
   if(e.name==='abs')return arg;
   if(!isDimensionless(arg))fail(e.name+' 函数只接受无量纲参数');
   return dim();
  }
 }
}

// No symbolic rewriting or arbitrary execution. Equations are extracted verbatim from isolated evidence clauses.

function graph(object:PalaceObject){
 const evidence=object.evidenceQuote;
 if(!evidence.trim()||evidence.length>2000)fail('缺少或超出允许长度的原文证据');
 if(/错误|不成立|不等于|并非|反例|不正确|不适用|≠|!=|\\bwrong\\b|\\bincorrect\\b|\\bnot valid\\b/i.test(object.label+' '+evidence))fail('原文含冲突线索，需人工复核');
 const clauses=evidence.split(/[。；;\\n，,：:！？?]/).map(x=>x.trim().replace(/^\\$+|\\$+$/g,'').trim()).filter(Boolean);
 const eqs:Equation[]=[],constraints:Constraint[]=[];
 const declarations=new Map<string,{unit:string;dimension:Dimension}>();
 for(const clause of clauses){
  const normalized=normalize(clause).replace(/Ω/g,'ohm');
  const unitMatch=normalized.match(/^unit\\(([A-Za-z][A-Za-z0-9_]{0,23})\\)\\s*=\\s*(.+)$/);
  if(unitMatch){
   const variable=unitMatch[1],unit=unitMatch[2].trim();
   if(!validName(variable))fail('单位声明中的变量名非法');
   if(declarations.has(variable))fail('重复单位声明：'+variable);
   if(declarations.size>=14)fail('最多十四条单位声明');
   declarations.set(variable,{unit,dimension:parseUnitExpression(unit)});
   continue;
  }
  if(/^unit\\(/.test(normalized))fail('单位声明格式错误；使用 unit(v)=m/s');
  if(/[<>]/.test(normalized)){
   const m=normalized.match(/^\\s*([A-Za-z][A-Za-z0-9_]*)\\s*(>=|<=|>|<)\\s*([+-]?(?:\\d+(?:\\.\\d+)?|\\.\\d+)(?:[eE][+-]?\\d+)?)\\s*$/);
   if(!m||!validName(m[1]))fail('仅支持独立的变量与常数比较约束，例如 t>=0');
   constraints.push({variable:m[1],op:m[2],value:bounded(Number(m[3])),source:clause});
   if(constraints.length>12)fail('最多十二条显式约束');
   continue;
  }
  if(!normalized.includes('='))continue;
  const parts=normalized.split('=');
  if(parts.length!==2||!validName(parts[0].trim()))fail('只接受独立的“变量 = 表达式”原文等式');
  const output=parts[0].trim();
  if(eqs.some(x=>x.output===output))fail('重复输出定义');
  const expr=parse(parts[1]),deps=dependencies(expr);
  eqs.push({output,source:clause,dependencies:deps,expr});
  if(eqs.length>6)fail('最多六条等式');
 }
 if(!eqs.length)fail('没有可编译的独立等式；使用显式乘号，例如 F=m*a');
 const defined=new Set(eqs.map(x=>x.output));
 const inputs=[...new Set(eqs.flatMap(x=>x.dependencies).filter(x=>!defined.has(x)))].sort();
 if(inputs.length>8)fail('最多八个外部输入');
 const ordered:Equation[]=[],done=new Set<string>(inputs);
 while(ordered.length<eqs.length){
  const next=eqs.find(x=>!done.has(x.output)&&x.dependencies.every(d=>done.has(d)));
  if(!next)fail('依赖图存在环或自引用');
  ordered.push(next);done.add(next.output);
 }
 for(const c of constraints)if(!done.has(c.variable))fail('约束引用未声明变量');
 const variableIds=[...done].sort();
 for(const variable of declarations.keys())if(!done.has(variable))fail('单位声明引用未定义变量：'+variable);
 const missing=variableIds.filter(id=>!declarations.has(id));
 let unitAnalysis:UnitAnalysis;
 if(!declarations.size){
  unitAnalysis={status:'not_provided',declared:[],missing:variableIds,message:'未提供单位声明；不执行量纲一致性检查。'};
 }else if(missing.length){
  unitAnalysis={status:'incomplete',declared:[...declarations].map(([variable,value])=>({variable,unit:value.unit,dimension:formatDimension(value.dimension)})),missing,message:'单位声明不完整，缺少：'+missing.join('、')+'；不执行量纲一致性认证。'};
 }else{
  const dimensions=new Map<string,Dimension>([...declarations].map(([id,value])=>[id,value.dimension] as [string,Dimension]));
  for(const equation of ordered){
   const declared=declarations.get(equation.output)!;
   const literal=numericLiteral(equation.expr);
   const inferred=literal===null?inferDimension(equation.expr,dimensions):declared.dimension;
   if(!sameDimension(inferred,declared.dimension))fail('量纲不一致：'+equation.output+'，表达式推导为 '+formatDimension(inferred)+'，声明单位 '+declared.unit+' ('+formatDimension(declared.dimension)+')');
  }
  unitAnalysis={status:'verified',declared:[...declarations].map(([variable,value])=>({variable,unit:value.unit,dimension:formatDimension(value.dimension)})),missing:[],message:'全部变量均有显式单位声明，等式量纲检查通过；单位标注和数值来源仍需人工核实。'};
 }
 const revision=createHash('sha256').update(JSON.stringify(['simulation-v2-unit-aware',object.conceptId,object.label,evidence])).digest('hex');
 return {ordered,inputs,revision,constraints,declarations,unitAnalysis};
}


export function compileSimulation(object:PalaceObject){
 try{
  const g=graph(object),verified=g.unitAnalysis.status==='verified';
  return {
   supported:true as const,revision:g.revision,conceptId:object.conceptId,title:object.label,evidenceQuote:object.evidenceQuote,
   inputs:g.inputs.map(id=>({id,initial:1,...(verified?{unit:g.declarations.get(id)!.unit}:{})})),
   equations:g.ordered.map(({output,source,dependencies})=>({output,source,dependencies,...(verified?{unit:g.declarations.get(output)!.unit}:{})})),
   constraints:g.constraints,unitAnalysis:g.unitAnalysis,provenance:'evidence-equation-dag' as const,
   verification:'只验证原文等式、依赖和数值执行；仅执行显式数值约束，不验证单位标注本身、完整物理适用范围、因果含义或原文真伪。'+g.unitAnalysis.message+' 输入默认值仅是演示起点。'
  };
 }catch(e){if(e instanceof EngineError)return {supported:false as const,conceptId:object.conceptId,reason:e.message};throw e;}
}


export function runSimulation(object:PalaceObject,revision:unknown,values:unknown){
 const g=graph(object);
 if(revision!==g.revision)throw new EngineError('SIM_STALE','原文已改变，请重新加载',409);
 if(!values||typeof values!=='object'||Array.isArray(values))fail('输入必须为对象');
 const x=values as Record<string,unknown>;
 if(Object.keys(x).length!==g.inputs.length||g.inputs.some(id=>!Object.hasOwn(x,id)))fail('必须提供所有且仅提供声明的输入');
 const env=new Map<string,number>();
 for(const id of g.inputs){const v=x[id];if(typeof v!=='number'||!Number.isFinite(v)||Math.abs(v)>1e6)fail(`输入 ${id} 超出有限数值范围 ±1000000`);env.set(id,v);}
 function check(id:string,v:number){for(const c of g.constraints.filter(x=>x.variable===id)){const ok=c.op==='>'?v>c.value:c.op==='>='?v>=c.value:c.op==='<'?v<c.value:v<=c.value;if(!ok)fail('不满足原文约束：'+c.source);}}
 for(const id of g.inputs)check(id,env.get(id)!);
 const verified=g.unitAnalysis.status==='verified';
 const outputs=g.ordered.map(eq=>{
  const value=evaluate(eq.expr,env);check(eq.output,value);env.set(eq.output,value);
  return {id:eq.output,value,...(verified?{unit:g.declarations.get(eq.output)!.unit}:{})};
 });
 return {revision:g.revision,outputs};
}

// Sweep points use the same checked interpreter; undefined points are explicit gaps, never interpolated.
export function sweepSimulation(object:PalaceObject,revision:unknown,values:unknown,variable:unknown,low:unknown,high:unknown,points:unknown){const g=graph(object);if(revision!==g.revision)throw new EngineError('SIM_STALE','原文已改变，请重新加载',409);if(typeof variable!=='string'||!g.inputs.includes(variable)||typeof low!=='number'||typeof high!=='number'||!Number.isFinite(low)||!Number.isFinite(high)||low>=high||Math.abs(low)>1e6||Math.abs(high)>1e6||typeof points!=='number'||!Number.isInteger(points)||points<2||points>81)fail('无效扫描参数（2–81 个点）');if(!values||typeof values!=='object'||Array.isArray(values))fail('输入必须为对象');const baseline=values as Record<string,unknown>;if(Object.keys(baseline).length!==g.inputs.length||g.inputs.some(id=>!Object.hasOwn(baseline,id)||typeof baseline[id]!=='number'||!Number.isFinite(baseline[id])||Math.abs(baseline[id] as number)>1e6))fail('扫描需要全部有效输入');const samples=[];for(let i=0;i<points;i++){const x=low+(high-low)*i/(points-1);try{samples.push({x,outputs:runSimulation(object,revision,{...baseline,[variable]:x}).outputs});}catch(e){if(!(e instanceof EngineError)||e.code!=='SIM_INVALID')throw e;samples.push({x,outputs:null,reason:e.message});}}return {revision,variable,samples};}
