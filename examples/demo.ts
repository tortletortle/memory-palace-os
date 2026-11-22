import {mkdtemp,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {Engine} from '../src/service.ts';
import {Store} from '../src/store.ts';
import {OfflineModel} from '../src/model.ts';
import {POISSON} from '../src/knowledge.ts';
const folder=await mkdtemp(join(tmpdir(),'mnemonic-demo-'));
try{const engine=new Engine(new Store(join(folder,'state.json')),new OfflineModel());const k=await engine.parse(POISSON);const job=await engine.generate(k.id,{id:'desk',position:[0,2,0]});const scene=job.results[0].scene!;const p=await engine.publish(job.id,scene.id,true);for(let i=0;i<2;i++)await engine.review(p.id,k.atoms.map(a=>({atomId:a.id,grade:a.id==='a2'?'missed':'correct'})));console.log(JSON.stringify({knowledge:k,mathChecks:{correct:await engine.checkAnswer(k.id,POISSON),negativeExponentMutation:await engine.checkAnswer(k.id,POISSON.replace('-',''))},candidates:job.results.map(r=>({title:r.candidate.title,report:r.report})),publishedScene:scene,recall:await engine.publication(p.id,true),feedback:await engine.feedback(p.id)},null,2));}finally{await rm(folder,{recursive:true,force:true});}
