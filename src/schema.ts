import type {Ast} from './math.ts';
// JSON Schema subset: the same contract is sent to a model and checked locally.
// All object fields required; unknown fields rejected. No external dependencies.
export type Schema = {type:'string'|'number'|'array'|'object'|'boolean'; enum?:readonly string[]; properties?:Record<string,Schema>; required?:string[]; additionalProperties?:false; items?:Schema};
const str:Schema={type:'string'};
const en=(...values:string[]):Schema=>({type:'string',enum:values});
const arr=(items:Schema):Schema=>({type:'array',items});
const obj=(properties:Record<string,Schema>):Schema=>({type:'object',properties,required:Object.keys(properties),additionalProperties:false});
export const atomRoles=['numerator','denominator','condition','meaning','relation','general'] as const;
export type Role=typeof atomRoles[number];
export type Atom={id:string; text:string; evidence:string; role:Role};
export type Draft={title:string; atoms:Atom[]};
export type Knowledge={id:string; source:string; title:string; atoms:Atom[]; status:'verified_fixture'|'needs_review'|'user_confirmed'; revision:string; math?:{status:'parsed';ast:Ast}|{status:'unsupported';reason:string}};
export const strategies=['symbolic','story','mechanism'] as const;
export type Strategy=typeof strategies[number];
export type Cue={atomId:string; assetId:string; action:'none'|'pulse'|'rotate'|'bounce'; metaphor:string; explanation:string};
export type Candidate={title:string; strategy:Strategy; cues:Cue[]};
export type Candidates={candidates:Candidate[]};
export const parseSchema=obj({title:str,atoms:arr(obj({id:str,text:str,evidence:str,role:en(...atomRoles)}))});
export const candidateSchema=obj({candidates:arr(obj({title:str,strategy:en(...strategies),cues:arr(obj({atomId:str,assetId:str,action:en('none','pulse','rotate','bounce'),metaphor:str,explanation:str}))}))});
export function schemaErrors(schema:Schema,value:unknown,path='$'):string[]{
  const errors:string[]=[];
  if(schema.type==='array'){
    if(!Array.isArray(value))return [`${path}: array expected`];
    if(value.length>64)return [`${path}: array too large`];
    value.forEach((v,i)=>errors.push(...schemaErrors(schema.items!,v,`${path}[${i}]`)));
  }else if(schema.type==='object'){
    if(value===null||typeof value!=='object'||Array.isArray(value))return [`${path}: object expected`];
    const r=value as Record<string,unknown>;
    for(const k of Object.keys(r))if(!Object.hasOwn(schema.properties!,k))errors.push(`${path}.${k}: unknown field`);
    for(const k of schema.required??[])if(!Object.hasOwn(r,k))errors.push(`${path}.${k}: required`);else errors.push(...schemaErrors(schema.properties![k],r[k],`${path}.${k}`));
  }else{
    if(typeof value!==schema.type)return [`${path}: ${schema.type} expected`];
    if(typeof value==='string'&&(value.trim().length===0||value.length>2000))errors.push(`${path}: empty or too long`);
    if(schema.enum&&!schema.enum.includes(value as string))errors.push(`${path}: invalid enum`);
  }
  return errors;
}
export class EngineError extends Error {readonly code:string; readonly status:number; constructor(code:string,message:string,status=400){super(message);this.code=code;this.status=status;}}
export function checked<T>(schema:Schema,value:unknown):T{const errors=schemaErrors(schema,value);if(errors.length)throw new EngineError('SCHEMA_INVALID',errors.join('; '),422);return value as T;}
