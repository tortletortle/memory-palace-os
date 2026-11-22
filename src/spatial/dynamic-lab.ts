import {createHash} from 'node:crypto';
import {EngineError} from '../schema.ts';
import type {PalaceObject,Store} from '../store.ts';

type Input={id:string;label:string;unit:string;min:number;max:number;step:number;initial:number;integer?:boolean};
type Template={id:string;title:string;formula:string;context:RegExp;equations:string[];inputs:Input[];output:{label:string;unit:string;max:number};assumptions:string;evaluate:(x:Record<string,number>)=>number};
const num=(id:string,label:string,unit:string,min:number,max:number,initial:number,step=1,integer=false):Input=>({id,label,unit,min,max,step,initial,integer});
const bit=(id:string)=>num(id,id,'',0,1,0,1,true);
const templates:Template[]=[
 {id:'ohm',title:'欧姆定律实验台',formula:'U = I × R',context:/欧姆|ohm/i,equations:['u=ir','v=ir','u=i*r','v=i*r'],inputs:[num('I','电流','A',0,5,1,.1),num('R','电阻','Ω',0,20,4,.5)],output:{label:'电压',unit:'V',max:100},assumptions:'理想欧姆元件；电阻固定时电压与电流成正比。只演示非负电流和电阻范围。',evaluate:({I,R})=>I*R},
 {id:'capacitor',title:'电容电荷实验台',formula:'Q = C × U',context:/电容|capacitan/i,equations:['q=cu','q=cv','q=c*u','q=c*v'],inputs:[num('C','电容','μF',0,100,10,1),num('U','电压','V',0,12,3,.5)],output:{label:'电荷量',unit:'μC',max:1200},assumptions:'理想线性电容、非负电压。μF × V = μC；不模拟充放电暂态。',evaluate:({C,U})=>C*U},
 {id:'power',title:'电功率实验台',formula:'P = U × I',context:/电功率|electric power/i,equations:['p=ui','p=vi','p=u*i','p=v*i'],inputs:[num('U','电压','V',0,12,5,.5),num('I','电流','A',0,5,1,.1)],output:{label:'功率',unit:'W',max:60},assumptions:'直流或瞬时功率，采用吸收功率约定，非负电压与电流；不表示交流有功功率。',evaluate:({U,I})=>U*I},
 {id:'and',title:'与门开关实验台',formula:'Y = A ∧ B',context:/(?:^|[^非])与门|\bAND gate\b/i,equations:['y=a∧b','y=a&b','y=a*b','y=ab'],inputs:[bit('A'),bit('B')],output:{label:'Y',unit:'',max:1},assumptions:'理想二值逻辑，无传播延迟。',evaluate:({A,B})=>A*B},
 {id:'nand',title:'与非门开关实验台',formula:'Y = ¬(A ∧ B)',context:/与非门|\bNAND gate\b/i,equations:['y=¬(a∧b)','y=!(a&b)','y=!(a*b)','y=¬(ab)'],inputs:[bit('A'),bit('B')],output:{label:'Y',unit:'',max:1},assumptions:'理想二值逻辑，无传播延迟。',evaluate:({A,B})=>1-A*B},
 {id:'or',title:'或门开关实验台',formula:'Y = A ∨ B',context:/(?:^|[^非异])或门|\bOR gate\b/i,equations:['y=a∨b','y=a+b','y=a|b'],inputs:[bit('A'),bit('B')],output:{label:'Y',unit:'',max:1},assumptions:'理想二值逻辑；这里 + 表示逻辑或。无传播延迟。',evaluate:({A,B})=>Math.max(A,B)},
 {id:'not',title:'非门开关实验台',formula:'Y = ¬A',context:/(?:^|[^与或])非门|反相器|\bNOT gate\b/i,equations:['y=¬a','y=!a'],inputs:[bit('A')],output:{label:'Y',unit:'',max:1},assumptions:'理想二值逻辑，无传播延迟。',evaluate:({A})=>1-A},
 {id:'poisson',title:'泊松概率发生器',formula:'P(X=k) = λ^k × exp(-λ) / k!',context:/泊松|poisson/i,equations:['p(x=k)=λ^k*e^(-λ)/k!','p(x=k)=λ^k*exp(-λ)/k!','p(x=k)=λ^ke^(-λ)/k!'],inputs:[num('lambda','平均发生次数 λ','',0,12,2,.25),num('k','事件次数 k','',0,30,3,1,true)],output:{label:'恰好发生 k 次的概率',unit:'',max:1},assumptions:'λ 是固定区间内的平均发生次数；标准泊松模型，λ=0 时退化为零次事件。',evaluate:({lambda,k})=>{if(lambda===0)return k===0?1:0;let p=Math.exp(-lambda);for(let i=1;i<=k;i++)p*=lambda/i;return p;}}
];
const normalize=(s:string)=>s.normalize('NFKC').toLowerCase().replace(/\s+/g,'').replace(/[×·⋅]/g,'*').replace(/[−–]/g,'-');
// Exact isolated equation clauses only. No evaluation of user/model source as code.
// The exclamation mark is also a factorial or an ASCII NOT operator; preserve it inside clauses.
function equationClauses(s:string){return s.split(/[。；;\n，,：:！？?]/).map(x=>normalize(x.replace(/^[\s$]+|[\s$.]+$/g,'')));}
export function compileDynamicLab(object:PalaceObject){
 const evidence=object.evidenceQuote;const all=object.label+'\n'+evidence;
 const reject=(reason:string)=>({supported:false as const,reason,conceptId:object.conceptId});
 if(!evidence.trim())return reject('缺少原文公式证据');
 // Conservative gate, not a general truth/entailment checker.
 if(/错误|不成立|不等于|并非|反例|错误地|不正确|wrong|incorrect|\bnot valid\b|≠|!=/.test(all.toLowerCase()))return reject('存在否定或冲突线索，请人工复核');
 const c=equationClauses(evidence);
 const matched=templates.filter(t=>t.context.test(evidence)&&t.equations.some(eq=>c.includes(eq)));
 if(matched.length!==1)return reject(matched.length?'多个装置候选，请拆分知识锚点':'没有匹配到受支持的独立公式与名称；不生成猜测性装置');
 const t=matched[0];const eq=c.find(x=>t.equations.includes(x))!;
 // Multiple distinct equation clauses could conflict; refuse instead of silently choosing one.
 if(c.some(x=>x.includes('=')&&x!==eq))return reject('含有其他等式，请拆分并人工确认');
 const revision=createHash('sha256').update(JSON.stringify([object.conceptId,object.label,evidence,t.id,'1'])).digest('hex');
 return {supported:true as const,conceptId:object.conceptId,revision,templateId:t.id,title:t.title,formula:t.formula,inputs:t.inputs,output:t.output,assumptions:t.assumptions,evidenceQuote:evidence,matchedEquation:eq,provenance:'deterministic-template-match' as const,verification:'公式模式匹配，模型计算已测试；原文知识真伪与适用性仍需人工核对。'};
}
export function runDynamicLab(object:PalaceObject,revision:unknown,values:unknown){
 const lab=compileDynamicLab(object);if(!lab.supported)throw new EngineError('LAB_UNSUPPORTED',lab.reason,422);
 if(revision!==lab.revision)throw new EngineError('LAB_STALE','Knowledge or template changed; reload lab',409);
 if(!values||typeof values!=='object'||Array.isArray(values))throw new EngineError('LAB_INPUT','Input object required',422);
 const raw=values as Record<string,unknown>;const x:Record<string,number>={};
 if(Object.keys(raw).length!==lab.inputs.length)throw new EngineError('LAB_INPUT','Exactly the declared inputs are required',422);
 for(const f of lab.inputs){const v=raw[f.id];if(typeof v!=='number'||!Number.isFinite(v)||v<f.min||v>f.max||(f.integer&&!Number.isInteger(v)))throw new EngineError('LAB_INPUT',`Invalid ${f.id}`,422);x[f.id]=v;}
 const t=templates.find(x=>x.id===lab.templateId)!;const value=t.evaluate(x);
 if(!Number.isFinite(value)||value<0||value>t.output.max+1e-10)throw new EngineError('LAB_RESULT','Result outside model bounds',500);
 return {revision:lab.revision,inputs:x,value,output:lab.output,formula:lab.formula};
}
export async function labObject(store:Store,palaceId:string,conceptId:string){const state=await store.read();const p=state.palaces?.find(p=>p.id===palaceId);if(!p)throw new EngineError('PALACE_NOT_FOUND','Palace not found',404);const objects=p.objects.filter(o=>o.conceptId===conceptId);if(objects.length!==1)throw new EngineError('LAB_ANCHOR','Expected exactly one matching anchor',objects.length?409:404);return objects[0];}
