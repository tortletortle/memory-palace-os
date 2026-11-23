import {compileSimulation,runSimulation,sweepSimulation} from './spatial/simulation-compiler.ts';
import {compileStateMachine,runStateMachine} from './spatial/causal-state-machine.ts';
import {compileDynamicLab,runDynamicLab,labObject} from './spatial/dynamic-lab.ts';
import {assessmentCatalog, assessmentBank, addTransfer, issueAssessment, getAssessment, submitAssessment, gradeAssessment, assessmentReport} from './spatial/knowledge-assessment.ts';
import {mathInfo,compareMath} from './math.ts';
import {createServer} from 'node:http';
import type {IncomingMessage,ServerResponse} from 'node:http';
import {pathToFileURL} from 'node:url';
import {readFile} from 'node:fs/promises';
import {resolve,extname,sep} from 'node:path';
import {EngineError} from './schema.ts';
import {Engine} from './service.ts';
import {Store} from './store.ts';
import {modelFromEnv} from './model.ts';
import {assets} from './catalog.ts';
import {estimateSeparatedForecast} from './adaptive-model-selection.ts';
import {skillGeneLibrary} from './cognition/registry.ts';
import {buildGenome,capabilityDependencies,canonicalGenome,validateGenome} from './cognition/graph.ts';
import {runCognition} from './cognition/runtime.ts';
import type {CognitionInput,Genome} from './cognition/types.ts';
import {transferSkillLibrary} from './cognition/transfer-library.ts';
import {createTransferGenome,defaultTransferGenome,validateTransferGenome} from './cognition/transfer-graph.ts';
import {selectTransferSkills} from './cognition/transfer-engine.ts';
import {extractKnowledgeFeatures} from './cognition/knowledge-feature-extractor.ts';
import {discoverStrategies,detectNegativeTransfer} from './cognition/strategy-discovery.ts';
import {knowledgeModelFromEnv,understandKnowledge} from './knowledge-understanding.ts';
import {compileMemoryArchitecture,validateMemoryArchitecture} from './spatial/space-compiler.ts';
import {randomUUID} from 'node:crypto';

import type {FeatureVector,MemoryDomain,TransferGenome,TransferTask} from './cognition/transfer-types.ts';
async function body(req:IncomingMessage):Promise<Record<string,unknown>>{if(!(req.headers['content-type']??'').startsWith('application/json'))throw new EngineError('CONTENT_TYPE','application/json required',415);let n=0;const chunks:Buffer[]=[];for await(const chunk of req){const b=Buffer.from(chunk);n+=b.length;if(n>65536)throw new EngineError('BODY_TOO_LARGE','Request exceeds 64 KiB',413);chunks.push(b);}let data:unknown;try{data=JSON.parse(Buffer.concat(chunks).toString('utf8'));}catch{throw new EngineError('INVALID_JSON','Invalid JSON');}if(!data||Array.isArray(data)||typeof data!=='object')throw new EngineError('INVALID_BODY','Object expected');return data as Record<string,unknown>;}
function string(b:Record<string,unknown>,k:string):string{if(typeof b[k]!=='string'||!(b[k] as string).trim())throw new EngineError('FIELD_REQUIRED',`${k} must be a non-empty string`);return b[k] as string;}
function send(res:ServerResponse,status:number,value:unknown){res.writeHead(status,{'Content-Type':'application/json; charset=utf-8','Cache-Control':'no-store','X-Content-Type-Options':'nosniff'});res.end(JSON.stringify(value));}
export function api(engine:Engine){let active=0;return createServer(async(req,res)=>{try{const u=new URL(req.url??'/','http://localhost');const path=u.pathname,method=req.method;let match:RegExpMatchArray|null;
  // Local-only API; fail closed if users accidentally send cross-origin requests.
  if(!/^(localhost|127\.0\.0\.1)(:\d{1,5})?$/.test(req.headers.host??''))throw new EngineError('HOST_DENIED','Local host required',403);
  if(req.headers.origin&&req.headers.origin!==`http://${req.headers.host}`)throw new EngineError('ORIGIN_DENIED','Cross-origin requests disabled',403);
  if(method==='GET'&&path==='/health')return send(res,200,{ok:true,model:engine.model.name});
  if(method==='GET'&&(match=path.match(/^\/api\/palaces\/([^/]+)\/simulations\/([^/]+)$/)))return send(res,200,compileSimulation(await labObject(engine.store,decodeURIComponent(match[1]),decodeURIComponent(match[2]))));
  if(method==='GET'&&(match=path.match(/^\/api\/palaces\/([^/]+)\/state-machines\/([^/]+)$/)))return send(res,200,compileStateMachine(await labObject(engine.store,decodeURIComponent(match[1]),decodeURIComponent(match[2]))));
  if(method==='GET'&&(match=path.match(/^\/api\/palaces\/([^/]+)\/labs\/([^/]+)$/)))return send(res,200,compileDynamicLab(await labObject(engine.store,decodeURIComponent(match[1]),decodeURIComponent(match[2]))));
  if(method==='GET'&&path==='/api/assessment/palaces')return send(res,200,await assessmentCatalog(engine.store));
  if(method==='GET'&&(match=path.match(/^\/api\/palaces\/([^/]+)\/assessment\/bank$/)))return send(res,200,await assessmentBank(engine.store,decodeURIComponent(match[1])));
  if(method==='GET'&&(match=path.match(/^\/api\/palaces\/([^/]+)\/assessment\/report$/)))return send(res,200,await assessmentReport(engine.store,decodeURIComponent(match[1])));
  if(method==='GET'&&(match=path.match(/^\/api\/palaces\/([^/]+)\/assessment\/attempts\/([^/]+)$/)))return send(res,200,await getAssessment(engine.store,decodeURIComponent(match[1]),decodeURIComponent(match[2])));
  if(method==='GET'&&path==='/api/palaces'){
    const state=await engine.store.read();
    return send(res,200,state.palaces??[]);
  }
  if(method==='GET'&&(match=path.match(/^\/api\/palaces\/([^/]+)\/review-plan$/)))return send(res,200,await engine.palaceReviewPlan(decodeURIComponent(match[1]),Number(u.searchParams.get('budgetSeconds')??300),u.searchParams.get('policy')??'fixed'));
  if(method==='GET'&&(match=path.match(/^\/api\/palaces\/([^/]+)\/learning\/export$/))){const file=await engine.palaceLearningExport(decodeURIComponent(match[1]));res.writeHead(200,{'Content-Type':'text/csv; charset=utf-8','Content-Disposition':`attachment; filename=\"${file.filename}\"`,'Cache-Control':'no-store','X-Content-Type-Options':'nosniff'});res.end(file.content);return;}
  if(method==='GET'&&(match=path.match(/^\/api\/palaces\/([^/]+)\/learning$/)))return send(res,200,await engine.palaceLearning(decodeURIComponent(match[1])));
  if(method==='GET'&&(match=path.match(/^\/api\/palaces\/([^/]+)$/))){
    const state=await engine.store.read();const palace=(state.palaces??[]).find(x=>x.id===decodeURIComponent(match![1]));
    if(!palace)throw new EngineError('PALACE_NOT_FOUND','Palace not found',404);
    return send(res,200,palace);
  }

  if(method==='GET'&&path==='/api/assets')return send(res,200,assets);
  if(method==='GET'&&path==='/api/cognition/genes')return send(res,200,skillGeneLibrary);
  if(method==='GET'&&path==='/api/cognition/capabilities')return send(res,200,{dependencies:capabilityDependencies});
  if(method==='GET'&&path==='/api/cognition/default-genome')return send(res,200,canonicalGenome());
  if(method==='GET'&&path==='/api/transfer/skills')return send(res,200,transferSkillLibrary);
  if(method==='GET'&&path==='/api/transfer/default-genome')return send(res,200,defaultTransferGenome());
  if(method==='GET'&&path==='/api/transfer/discovery-info')return send(res,200,{features:['spatial','symbolic','causal','sequential','hierarchical','contrastive','analogical','dynamic','retrieval','semantic'],domains:['probability','programming','history','digital_logic','language','biology'],mode:'deterministic-rule-extractor'});
  if(method==='GET'&&(match=path.match(/^\/api\/jobs\/([^/]+)$/)))return send(res,200,await engine.job(match[1]));
  if(method==='GET'&&(match=path.match(/^\/api\/publications\/([^/]+)$/)))return send(res,200,await engine.publication(match[1],u.searchParams.get('mode')==='recall'));
  if(method==='GET'&&(match=path.match(/^\/api\/publications\/([^/]+)\/feedback$/)))return send(res,200,await engine.feedback(match[1]));
  if(method==='GET'&&(match=path.match(/^\/api\/publications\/([^/]+)\/adaptive$/)))return send(res,200,await engine.adaptive(match[1]));
  if(method==='GET'&&path==='/api/cost-evidence')return send(res,200,await engine.costReport());
  if(method==='GET'&&(match=path.match(/^\/api\/publications\/([^/]+)\/bayesian$/)))return send(res,200,await engine.bayesian(match[1]));
  if(method==='POST'||method==='PUT'){
    const b=await body(req);
    if(method==='POST'&&(match=path.match(/^\/api\/palaces\/([^/]+)\/simulations\/([^/]+)\/(run|sweep)$/))){const o=await labObject(engine.store,decodeURIComponent(match[1]),decodeURIComponent(match[2]));return send(res,200,match[3]==='run'?runSimulation(o,b.revision,b.inputs):sweepSimulation(o,b.revision,b.inputs,b.variable,b.low,b.high,b.points));}
    if(method==='POST'&&(match=path.match(/^\/api\/palaces\/([^/]+)\/state-machines\/([^/]+)\/run$/))){const o=await labObject(engine.store,decodeURIComponent(match[1]),decodeURIComponent(match[2]));return send(res,200,runStateMachine(o,b.revision,b.steps));}
    if(method==='POST'&&(match=path.match(/^\/api\/palaces\/([^/]+)\/labs\/([^/]+)\/run$/)))return send(res,200,runDynamicLab(await labObject(engine.store,decodeURIComponent(match[1]),decodeURIComponent(match[2])),b.revision,b.inputs));
    if(method==='POST'&&(match=path.match(/^\/api\/palaces\/([^/]+)\/assessment\/bank$/)))return send(res,201,await addTransfer(engine.store,decodeURIComponent(match[1]),b));
    if(method==='POST'&&(match=path.match(/^\/api\/palaces\/([^/]+)\/assessment\/attempts$/)))return send(res,201,await issueAssessment(engine.store,decodeURIComponent(match[1]),b));
    if(method==='POST'&&(match=path.match(/^\/api\/palaces\/([^/]+)\/assessment\/attempts\/([^/]+)\/(submit|grade)$/)))return send(res,200,await (match[3]==='submit'?submitAssessment:gradeAssessment)(engine.store,decodeURIComponent(match[1]),decodeURIComponent(match[2]),b));
    if(method==='POST'&&(match=path.match(/^\/api\/palaces\/([^/]+)\/recalls$/)))return send(res,201,await engine.palaceRecall(decodeURIComponent(match[1]),b));
    if(method==='POST'&&(match=path.match(/^\/api\/palaces\/([^/]+)\/exposures$/)))return send(res,201,await engine.palaceExposure(decodeURIComponent(match[1]),b));
    if(method==='PUT'&&(match=path.match(/^\/api\/palaces\/([^/]+)$/))){
      const id=decodeURIComponent(match[1]);const title=string(b,'title').slice(0,120);
      if(!Array.isArray(b.objects)||b.objects.length>100)throw new EngineError('PALACE_OBJECTS','objects array (max 100) required',422);
      const allowedKinds=['concept','formula','condition','procedure','example','mechanism'];
      const objects=b.objects.map((raw:any,index:number)=>{
        if(!raw||typeof raw!=='object'||typeof raw.conceptId!=='string'||typeof raw.label!=='string'||typeof raw.kind!=='string'||!allowedKinds.includes(raw.kind)||typeof raw.evidenceQuote!=='string')throw new EngineError('PALACE_OBJECT',`Invalid object at index ${index}`,422);
        return {id:typeof raw.id==='string'?raw.id:`obj-${index+1}`,conceptId:raw.conceptId,label:raw.label.slice(0,120),kind:raw.kind,evidenceQuote:raw.evidenceQuote.slice(0,2000),metaphor:typeof raw.metaphor==='string'?raw.metaphor.slice(0,240):'记忆锚点',x:typeof raw.x==='number'&&Number.isFinite(raw.x)?Math.max(-20,Math.min(20,raw.x)):0,z:typeof raw.z==='number'&&Number.isFinite(raw.z)?Math.max(-20,Math.min(20,raw.z)):0,color:typeof raw.color==='string'&&/^#[0-9a-fA-F]{6}$/.test(raw.color)?raw.color:'#78a6ff',...(typeof raw.roomId==='string'?{roomId:raw.roomId}:{})};
      });
      if(b.architecture&&typeof b.architecture==='object'){const report=validateMemoryArchitecture(b.architecture,objects.map(o=>o.conceptId));if(!report.valid)throw new EngineError('ARCHITECTURE_INVALID',report.errors.join('; '),422);}
      const updated=await engine.store.transaction(state=>{state.palaces??=[];const existing=state.palaces.find(x=>x.id===id);if(!existing)return null;existing.title=title;existing.domain=typeof b.domain==='string'?b.domain:existing.domain;existing.objects=objects;if(b.architecture&&typeof b.architecture==='object')existing.architecture=b.architecture as any;else existing.architecture=undefined;existing.updatedAt=new Date().toISOString();return existing;});
      if(!updated)throw new EngineError('PALACE_NOT_FOUND','Palace not found',404);
      return send(res,200,updated);
    }
    if(path==='/api/palaces/compile'){
      const source=string(b,'source');
      if(source.length>20000)throw new EngineError('SOURCE_TOO_LARGE','source exceeds 20000 characters',413);
      const budget=typeof b.budgetUnits==='number'?b.budgetUnits:18;
      if(active>=2)throw new EngineError('BUSY','Too many active model requests',429);
      let result;active++;
      try{result=await understandKnowledge(source,knowledgeModelFromEnv(),budget);}
      catch(e){throw new EngineError('KNOWLEDGE_UNDERSTANDING',e instanceof Error?e.message:'Knowledge understanding failed',422);}
      finally{active--;}
      const understanding=result.understanding;
      const architecture=compileMemoryArchitecture(understanding);
      const validation=validateMemoryArchitecture(architecture,understanding.concepts.map(c=>c.id));
      if(!validation.valid)throw new EngineError('ARCHITECTURE_INVALID',validation.errors.join('; '),500);
      const placementById=new Map(architecture.placements.map(p=>[p.conceptId,p]));
      const objects=understanding.concepts.map((c,i)=>{
        const place=placementById.get(c.id)!;
        return {id:`anchor-${c.id}`,conceptId:c.id,label:c.label,kind:c.kind,evidenceQuote:c.evidenceQuote,metaphor:`${c.label}的${({concept:'地标',formula:'公式装置',condition:'门槛',procedure:'路线',mechanism:'机关',example:'案例场景'} as Record<string,string>)[c.kind]??'记忆锚点'}`,x:place.x,z:place.z,color:({concept:'#9ebd80',formula:'#a99aff',condition:'#82b8c7',procedure:'#e4b76b',mechanism:'#ffb67a',example:'#e89bb2'} as Record<string,string>)[c.kind]??'#9ebd80',roomId:place.roomId};
      });
      const now=new Date().toISOString();
      const palace={id:randomUUID(),title:typeof b.title==='string'&&b.title.trim()?b.title.slice(0,120):understanding.title,domain:understanding.domain,objects,architecture,createdAt:now,updatedAt:now};
      const saved=await engine.store.transaction(state=>{state.palaces??=[];state.palaces.unshift(palace);return palace;});
      return send(res,201,{palace:saved,understanding,quality:result.quality,provenance:result.provenance,architectureValidation:validation});
    }
    if(path==='/api/palaces'){
      const title=string(b,'title').slice(0,120);
      const domain=typeof b.domain==='string'?b.domain:'general';
      if(!Array.isArray(b.objects)||b.objects.length>100)throw new EngineError('PALACE_OBJECTS','objects array (max 100) required',422);
      const allowedKinds=['concept','formula','condition','procedure','example','mechanism'];
      const objects=b.objects.map((raw:any,index:number)=>{
        if(!raw||typeof raw!=='object'||typeof raw.conceptId!=='string'||typeof raw.label!=='string'||typeof raw.kind!=='string'||!allowedKinds.includes(raw.kind)||typeof raw.evidenceQuote!=='string')throw new EngineError('PALACE_OBJECT',`Invalid object at index ${index}`,422);
        const x=typeof raw.x==='number'&&Number.isFinite(raw.x)?Math.max(-20,Math.min(20,raw.x)):0;
        const z=typeof raw.z==='number'&&Number.isFinite(raw.z)?Math.max(-20,Math.min(20,raw.z)):0;
        const color=typeof raw.color==='string'&&/^#[0-9a-fA-F]{6}$/.test(raw.color)?raw.color:'#78a6ff';
        return {id:typeof raw.id==='string'?raw.id:`obj-${index+1}`,conceptId:raw.conceptId,label:raw.label.slice(0,120),kind:raw.kind,evidenceQuote:raw.evidenceQuote.slice(0,2000),metaphor:typeof raw.metaphor==='string'?raw.metaphor.slice(0,240):'记忆锚点',x,z,color,...(typeof raw.roomId==='string'?{roomId:raw.roomId}:{})};
      });
      if(b.architecture&&typeof b.architecture==='object'){const report=validateMemoryArchitecture(b.architecture,objects.map(o=>o.conceptId));if(!report.valid)throw new EngineError('ARCHITECTURE_INVALID',report.errors.join('; '),422);}
      const now=new Date().toISOString();
      const palace={id:crypto.randomUUID(),title,domain,objects,...(b.architecture&&typeof b.architecture==='object'?{architecture:b.architecture as any}:{}),createdAt:now,updatedAt:now};
      const saved=await engine.store.transaction(state=>{state.palaces??=[];state.palaces.unshift(palace);return palace;});
      return send(res,201,saved);
    }
    if(path==='/api/knowledge/understand'){
      const source=string(b,'source');
      if(source.length>20000)throw new EngineError('SOURCE_TOO_LARGE','source exceeds 20000 characters',413);
      const budget=typeof b.budgetUnits==='number'?b.budgetUnits:18;
      try{return send(res,200,await understandKnowledge(source,knowledgeModelFromEnv(),budget));}
      catch(e){throw new EngineError('KNOWLEDGE_UNDERSTANDING',e instanceof Error?e.message:'Knowledge understanding failed',422);}
    }
    if(path==='/api/transfer/discover'){
      const text=string(b,'text');
      const genome=(b.genome&&typeof b.genome==='object'&&!Array.isArray(b.genome)?b.genome:defaultTransferGenome()) as TransferGenome;
      const validation=validateTransferGenome(genome);
      if(!validation.valid)throw new EngineError('INVALID_TRANSFER_GENOME',validation.errors.join('; '),422);
      const budget=typeof b.budgetUnits==='number'?b.budgetUnits:18;
      try{return send(res,200,discoverStrategies(text,genome,budget));}
      catch(e){throw new EngineError('TRANSFER_DISCOVERY',e instanceof Error?e.message:'Discovery failed',422);}
    }
    if(path==='/api/transfer/extract-features'){
      const text=string(b,'text');
      try{return send(res,200,extractKnowledgeFeatures(text));}
      catch(e){throw new EngineError('FEATURE_EXTRACTION',e instanceof Error?e.message:'Extraction failed',422);}
    }
    if(path==='/api/transfer/detect-negative-transfer'){
      if(!Array.isArray(b.observations)||b.observations.length>500)throw new EngineError('TRANSFER_EVIDENCE','observations array (max 500) required',422);
      return send(res,200,detectNegativeTransfer(b.observations as any,typeof b.minN==='number'?b.minN:8,typeof b.harmThreshold==='number'?b.harmThreshold:0.08));
    }
    if(path==='/api/cognition/run'){
      if(!b.input||typeof b.input!=='object'||Array.isArray(b.input))throw new EngineError('COGNITION_INPUT','input object required',422);
      const input=b.input as CognitionInput;
      const genome=(b.genome&&typeof b.genome==='object'&&!Array.isArray(b.genome)?b.genome:canonicalGenome()) as Genome;
      const validation=validateGenome(genome);
      if(!validation.valid)throw new EngineError('INVALID_GENOME',validation.errors.join('; '),422);
      const budget=typeof b.budgetUnits==='number'?b.budgetUnits:40;
      try{return send(res,200,runCognition(input,genome,budget));}
      catch(e){throw new EngineError('COGNITION_INPUT',e instanceof Error?e.message:'Invalid cognition request',422);}
    }
    if(path==='/api/cognition/compose'){
      if(!Array.isArray(b.geneIds)||b.geneIds.length>16||b.geneIds.some(x=>typeof x!=='string'))throw new EngineError('GENOME_COMPOSE','geneIds array (max 16) required',422);
      const id=typeof b.id==='string'&&b.id.length<=120?b.id:'user-composed-genome';
      const params=b.params&&typeof b.params==='object'&&!Array.isArray(b.params)?b.params as Record<string,Record<string,number|string|boolean>>:{};
      try{return send(res,201,buildGenome(id,b.geneIds as string[],0,params));}
      catch(e){throw new EngineError('GENOME_COMPOSE',e instanceof Error?e.message:'Invalid gene composition',422);}
    }
    if(path==='/api/cognition/validate-genome'){
      if(!b.genome||typeof b.genome!=='object'||Array.isArray(b.genome))throw new EngineError('INVALID_GENOME','genome object required',422);
      return send(res,200,validateGenome(b.genome as Genome));
    }
    if(path==='/api/transfer/validate-genome'){
      if(!b.genome||typeof b.genome!=='object'||Array.isArray(b.genome))throw new EngineError('INVALID_TRANSFER_GENOME','genome object required',422);
      return send(res,200,validateTransferGenome(b.genome as TransferGenome));
    }
    if(path==='/api/transfer/compose'){
      if(!Array.isArray(b.geneIds)||b.geneIds.length>20||b.geneIds.some(x=>typeof x!=='string'))throw new EngineError('TRANSFER_COMPOSE','geneIds array (max 20) required',422);
      const id=typeof b.id==='string'&&b.id.length<=120?b.id:'user-transfer-genome';
      const threshold=typeof b.activationThreshold==='number'?b.activationThreshold:0.24;
      const maxActive=typeof b.maxActiveGenes==='number'?b.maxActiveGenes:5;
      const pairs=Array.isArray(b.synergyPairs)&&b.synergyPairs.every(x=>typeof x==='string')?b.synergyPairs as string[]:[];
      try{return send(res,201,createTransferGenome(id,b.geneIds as string[],{activationThreshold:threshold,maxActiveGenes:maxActive,synergyPairs:pairs}));}
      catch(e){throw new EngineError('TRANSFER_COMPOSE',e instanceof Error?e.message:'Invalid transfer composition',422);}
    }
    if(path==='/api/transfer/select'){
      const raw=b.task;
      if(!raw||typeof raw!=='object'||Array.isArray(raw))throw new EngineError('TRANSFER_TASK','task object required',422);
      const t=raw as Record<string,unknown>;
      const domains=['probability','programming','history','digital_logic','language','biology'];
      if(typeof t.id!=='string'||!t.id||!domains.includes(t.domain as string)||!t.features||typeof t.features!=='object'||Array.isArray(t.features))throw new EngineError('TRANSFER_TASK','id, supported domain and feature vector required',422);
      const featureNames=['spatial','symbolic','causal','sequential','hierarchical','contrastive','analogical','dynamic','retrieval','semantic'];
      const f=t.features as Record<string,unknown>;
      const features:Record<string,number>={};
      for(const name of featureNames){const value=f[name];if(typeof value!=='number'||!Number.isFinite(value)||value<0||value>1)throw new EngineError('TRANSFER_TASK',`feature ${name} must be in [0,1]`,422);features[name]=value;}
      const task:TransferTask={id:t.id,domain:t.domain as MemoryDomain,features:features as FeatureVector,difficulty:typeof t.difficulty==='number'&&Number.isFinite(t.difficulty)?Math.max(0,Math.min(1,t.difficulty)):0.5,hidden:{skillUtility:{},synergyPairs:[]},split:'target_domain_holdout'};
      const genome=(b.genome&&typeof b.genome==='object'&&!Array.isArray(b.genome)?b.genome:defaultTransferGenome()) as TransferGenome;
      const validation=validateTransferGenome(genome);if(!validation.valid)throw new EngineError('INVALID_TRANSFER_GENOME',validation.errors.join('; '),422);
      const budget=typeof b.budgetUnits==='number'?b.budgetUnits:18;
      try{return send(res,200,selectTransferSkills(task,genome,budget));}catch(e){throw new EngineError('TRANSFER_SELECT',e instanceof Error?e.message:'Invalid transfer selection',422);}
    }
    if(path==='/api/model-selection/forecast'){
      if(!Array.isArray(b.observations)||b.observations.length>2000||typeof b.nowDay!=='number'||!Number.isFinite(b.nowDay)||b.nowDay<0)throw new EngineError('MODEL_SELECTION_INPUT','observations array (max 2000) and non-negative nowDay required',422);
      const nowDay=b.nowDay as number;
      const allowedCauses=['none','knowledge_gap','visual_confusion','semantic_confusion','unknown'];
      const observations=b.observations.map((raw,index)=>{
        if(!raw||typeof raw!=='object'||Array.isArray(raw))throw new EngineError('MODEL_SELECTION_INPUT',`Observation ${index} must be an object`,422);
        const o=raw as Record<string,unknown>;
        if(typeof o.id!=='string'||!o.id||o.id.length>120||typeof o.day!=='number'||!Number.isFinite(o.day)||o.day<0||o.day>nowDay||!['cued','unaided'].includes(o.mode as string)||!['correct','missed','uncertain'].includes(o.grade as string))throw new EngineError('MODEL_SELECTION_INPUT',`Observation ${index} has invalid id/day/mode/grade`,422);
        if(o.cause!==undefined&&!allowedCauses.includes(o.cause as string))throw new EngineError('MODEL_SELECTION_INPUT',`Observation ${index} has invalid cause`,422);
        if(o.pairId!==undefined&&(typeof o.pairId!=='string'||o.pairId.length>120))throw new EngineError('MODEL_SELECTION_INPUT',`Observation ${index} has invalid pairId`,422);
        if(o.cueHelped!==undefined&&typeof o.cueHelped!=='boolean')throw new EngineError('MODEL_SELECTION_INPUT',`Observation ${index} has invalid cueHelped`,422);
        return {id:o.id,day:o.day,mode:o.mode as 'cued'|'unaided',grade:o.grade as 'correct'|'missed'|'uncertain',...(o.cause!==undefined?{cause:o.cause as 'none'|'knowledge_gap'|'visual_confusion'|'semantic_confusion'|'unknown'}:{}),...(o.pairId!==undefined?{pairId:o.pairId as string}:{}),...(o.cueHelped!==undefined?{cueHelped:o.cueHelped as boolean}:{})};
      });
      return send(res,200,estimateSeparatedForecast(observations,nowDay));
    }
    if(path==='/api/cost-evidence')return send(res,201,await engine.costEvidence(b));
    if(path==='/api/parse'||path==='/api/generate'){
      if(active>=2)throw new EngineError('BUSY','Too many active model requests',429);active++;try{return send(res,201,path==='/api/parse'?await engine.parse(string(b,'source')):await engine.generate(string(b,'knowledgeId'),b.anchor));}finally{active--;}
    }
    if(path==='/api/math/parse')return send(res,200,mathInfo(string(b,'expression')));
    if(path==='/api/math/compare')return send(res,200,compareMath(string(b,'left'),string(b,'right')));
    if(path==='/api/math/check-answer')return send(res,200,await engine.checkAnswer(string(b,'knowledgeId'),string(b,'answer')));
    if(path==='/api/confirm')return send(res,200,await engine.confirm(string(b,'knowledgeId'),string(b,'revision')));
    if(path==='/api/publish')return send(res,201,await engine.publish(string(b,'jobId'),string(b,'sceneId'),b.acknowledge===true));
    if((match=path.match(/^\/api\/publications\/([^/]+)\/reviews$/)))return send(res,201,await engine.review(match[1],b.atoms,b.context));
  }
  if(method==='GET'&&!path.startsWith('/api/')){
    const publicRoot=resolve(process.cwd(),'public');
    const requested=path==='/'?'/index.html':path;
    const file=resolve(publicRoot,'.'+requested);
    if(file!==publicRoot&&!file.startsWith(publicRoot+sep))throw new EngineError('NOT_FOUND','Route not found',404);
    try{
      const data=await readFile(file);
      const type=({'.html':'text/html; charset=utf-8','.js':'text/javascript; charset=utf-8','.css':'text/css; charset=utf-8','.svg':'image/svg+xml','.json':'application/json'} as Record<string,string>)[extname(file)]??'application/octet-stream';
      res.writeHead(200,{'Content-Type':type,'Cache-Control':'no-cache','X-Content-Type-Options':'nosniff'});res.end(data);return;
    }catch{throw new EngineError('NOT_FOUND','Static file not found',404);}
  }
  throw new EngineError('NOT_FOUND','Route not found',404);
}catch(e){const err=e instanceof EngineError?e:new EngineError('INTERNAL','Internal error',500);if(err.status===500)console.error(e);if(!res.headersSent)send(res,err.status,{error:{code:err.code,message:err.message}});else res.end();}});}
if(process.argv[1]&&import.meta.url===pathToFileURL(process.argv[1]).href){const engine=new Engine(new Store(process.env.DATA_FILE??'.data/state.json'),modelFromEnv());const port=Number(process.env.PORT??8787);api(engine).listen(port,'127.0.0.1',()=>console.log(`Memory Palace Engine: http://127.0.0.1:${port} (${engine.model.name})`));}
