import type {AssessmentAttempt,TransferItem} from './spatial/knowledge-assessment.ts';
import type {CostEvidence} from './bayesian.ts';
import {mkdir,readFile,writeFile,rename} from 'node:fs/promises';
import {dirname} from 'node:path';
import {randomUUID} from 'node:crypto';
import type {Knowledge,Candidate} from './schema.ts';
import type {Scene} from './compiler.ts';
import type {Report} from './validator.ts';
export type Job={id:string;knowledgeId:string;knowledgeRevision:string;model:string;promptVersion:string;createdAt:string;results:{candidate:Candidate;report:Report;scene:Scene|null}[]};
export type Publication={id:string;jobId:string;knowledgeId:string;scene:Scene;createdAt:string};
export type Review={id:string;publicationId:string;createdAt:string;mode?:'cued'|'unaided';revealed?:boolean;atoms:{atomId:string;grade:'correct'|'missed'|'uncertain';confusedWith?:{publicationId:string;atomId:string}}[]};
export type PalaceObject={id:string;conceptId:string;label:string;kind:string;evidenceQuote:string;metaphor:string;x:number;z:number;color:string;roomId?:string};
export type PalaceRecall={id:string;palaceId:string;sessionId:string;conceptId:string;createdAt:string;startedAt?:string;mode:'cued'|'unaided';grade:'correct'|'missed'|'uncertain';revealed:boolean;confusedWith?:string;responseMs?:number;confidence?:number};
export type PalaceExposure={id:string;palaceId:string;sessionId:string;conceptId:string;startedAt:string;createdAt:string;durationMs:number;surface:'inspector'};
import type { MemoryArchitecture } from './spatial/space-compiler.ts';
export type PalaceScene={id:string;title:string;domain:string;objects:PalaceObject[];architecture?:MemoryArchitecture;createdAt:string;updatedAt:string};
export type State={knowledge:Knowledge[];jobs:Job[];publications:Publication[];reviews:Review[];palaces?:PalaceScene[];palaceRecalls?:PalaceRecall[];palaceExposures?:PalaceExposure[];costEvidence?:CostEvidence[];assessmentAttempts?:AssessmentAttempt[];transferItems?:TransferItem[]};
export class Store{
  private readonly filename:string;private queue:Promise<unknown>=Promise.resolve();
  constructor(filename:string){this.filename=filename;}
  async read():Promise<State>{try{return JSON.parse(await readFile(this.filename,'utf8')) as State;}catch(e){if((e as NodeJS.ErrnoException).code==='ENOENT')return {knowledge:[],jobs:[],publications:[],reviews:[]};throw e;}}
  transaction<T>(mutate:(state:State)=>T):Promise<T>{const run=this.queue.then(async()=>{const state=await this.read();const result=mutate(state);await mkdir(dirname(this.filename),{recursive:true});const temp=`${this.filename}.${randomUUID()}.tmp`;await writeFile(temp,JSON.stringify(state,null,2),{mode:0o600,flag:'wx'});await rename(temp,this.filename);return result;});this.queue=run.catch(()=>{});return run;}
}
