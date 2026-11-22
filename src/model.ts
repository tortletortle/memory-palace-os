import {EngineError,checked,parseSchema,candidateSchema,strategies} from './schema.ts';
import type {Draft,Candidates,Knowledge,Schema,Cue} from './schema.ts';
import {assets,validAsset} from './catalog.ts';
import {parsePrompt,generatePrompt} from './prompts.ts';
export interface Model {readonly name:string; parse(source:string):Promise<Draft>; generate(knowledge:Knowledge):Promise<Candidates>}
export class OfflineModel implements Model {
  readonly name='offline-template';
  async parse(source:string):Promise<Draft>{return {title:'待核实知识',atoms:[{id:'a1',text:source,evidence:source,role:'general'}]};}
  async generate(knowledge:Knowledge):Promise<Candidates>{
    if(knowledge.status==='verified_fixture'&&knowledge.title==='泊松分布（公式）'){
      const themes=[
        {title:'分式机械塔',parts:[['power-tower','一座逐层叠起的塔','塔的重复层级提醒自己恢复 λ 的指数 k。'],['minus-sign','向后移动的红色负号装置','反向标记提醒指数包含负号，底数与指数以原式为准。'],['factorial-queue','分数线下的一列排列球','排列队列提醒 k 的阶乘在分母。']]},
        {title:'计数工厂',parts:[['counter','持续复制的计数机器','重复计数提示幂的结构，不是实际概率计算。'],['minus-sign','机器旁醒目的扣减标志','负号提示指数项的符号。'],['balance','分数线下的排列秤','下方的秤提醒阶乘作为除数。']]},
        {title:'公式装配台',parts:[['power-tower','上层的倍率装配塔','上层塔代表分子中的幂因子。'],['board','上层的指数提示板','提示板用于恢复指数因子，准确符号始终来自原文。'],['factorial-queue','下层的球形排列装置','下层排列装置代表分母的阶乘。']]}
      ];
      return {candidates:strategies.map((strategy,i)=>({title:themes[i].title,strategy,cues:knowledge.atoms.map((a,j):Cue=>({atomId:a.id,assetId:themes[i].parts[j][0],action:i===0?'pulse':i===1?'bounce':'rotate',metaphor:themes[i].parts[j][1],explanation:themes[i].parts[j][2]}))}))};
    }
    return {candidates:strategies.map((strategy,i)=>({title:['符号联想','故事联想','机制联想'][i],strategy,cues:knowledge.atoms.map((a,j):Cue=>{const pool=assets.filter(x=>validAsset(x.id,a.role));return {atomId:a.id,assetId:pool[(i+j)%pool.length].id,action:(['pulse','bounce','rotate','none'] as const)[(i+Math.floor(j/pool.length))%4],metaphor:['带有醒目标记的物品','沿路线活动的道具','可查看的机械部件'][i]+'（位置 '+(j+1)+'）',explanation:'此物品作为对应原子的记忆提示；准确内容以原文为准。'};})}))};}
}
export type RemoteConfig={baseUrl:string; apiKey:string; model:string; format:'json_schema'|'json_object'; timeoutMs?:number};
export class RemoteModel implements Model{
  readonly name:string; private readonly config:RemoteConfig; private readonly call:typeof fetch;
  constructor(config:RemoteConfig,call:typeof fetch=fetch){this.config=config;this.call=call;this.name=config.model;const u=new URL(config.baseUrl);if(u.username||u.password||u.search||u.hash||!(u.protocol==='https:'||(u.protocol==='http:'&&['localhost','127.0.0.1','[::1]'].includes(u.hostname))))throw new EngineError('BAD_PROVIDER','Provider requires HTTPS or loopback HTTP');}
  private async request<T>(name:string,schema:Schema,prompt:string,input:unknown):Promise<T>{
    const c=this.config;let res:Response;
    try{res=await this.call(`${c.baseUrl.replace(/\/$/,'')}/chat/completions`,{method:'POST',redirect:'error',headers:{Authorization:`Bearer ${c.apiKey}`,'Content-Type':'application/json'},signal:AbortSignal.timeout(c.timeoutMs??45000),body:JSON.stringify({model:c.model,messages:[{role:'system',content:prompt+'\n只返回符合此 JSON Schema 的 JSON：'+JSON.stringify(schema)},{role:'user',content:JSON.stringify(input)}],response_format:c.format==='json_schema'?{type:'json_schema',json_schema:{name,strict:true,schema}}:{type:'json_object'}})});}catch{throw new EngineError('MODEL_NETWORK','Model request failed or timed out',502);}
    if(!res.ok)throw new EngineError('MODEL_HTTP',`Model returned HTTP ${res.status}`,502);
    let raw:any;try{raw=await res.json();}catch{throw new EngineError('MODEL_RESPONSE','Response is not JSON',502);}
    const choice=raw?.choices?.[0];if(choice?.finish_reason!=='stop'||choice?.message?.refusal||typeof choice?.message?.content!=='string')throw new EngineError('MODEL_INCOMPLETE','Model refused or returned incomplete response',502);
    let data:unknown;try{data=JSON.parse(choice.message.content);}catch{throw new EngineError('MODEL_JSON','Model content is not JSON',502);}
    return checked<T>(schema,data);
  }
  parse(source:string){return this.request<Draft>('knowledge_draft',parseSchema,parsePrompt,{source});}
  generate(knowledge:Knowledge){return this.request<Candidates>('mnemonic_candidates',candidateSchema,generatePrompt,{knowledge,assets});}
}
export function modelFromEnv():Model{if((process.env.MODEL_MODE??'offline')==='offline')return new OfflineModel();if(process.env.MODEL_MODE!=='remote'||!process.env.MODEL_API_KEY||!process.env.MODEL_ID)throw new Error('Remote mode requires MODEL_API_KEY and MODEL_ID');const format=process.env.MODEL_FORMAT??'json_schema';if(format!=='json_schema'&&format!=='json_object')throw new Error('Invalid MODEL_FORMAT');return new RemoteModel({baseUrl:process.env.MODEL_BASE_URL??'https://api.openai.com/v1',apiKey:process.env.MODEL_API_KEY,model:process.env.MODEL_ID,format});}
