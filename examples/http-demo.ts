import {POISSON} from '../src/knowledge.ts';
const base='http://127.0.0.1:'+(process.env.PORT??8787);
async function post(path:string,body:unknown){const r=await fetch(base+path,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(body)});const data=await r.json() as any;if(!r.ok)throw new Error(JSON.stringify(data));return data;}
const k=await post('/api/parse',{source:POISSON});const j=await post('/api/generate',{knowledgeId:k.id,anchor:{id:'desk',position:[0,2,0]}});const result=j.results.find((r:any)=>r.report.passed&&r.scene);if(!result)throw new Error('No valid scene');
// Demonstration uses the known fixture only. Real UI must request human review.
if((await (await fetch(base+'/health')).json() as any).model!=='offline-template')throw new Error('Demo auto-publication only allowed with offline model.');
const p=await post('/api/publish',{jobId:j.id,sceneId:result.scene.id,acknowledge:true});await post(`/api/publications/${p.id}/reviews`,{atoms:k.atoms.map((a:any)=>({atomId:a.id,grade:a.id==='a2'?'missed':'correct'}))});console.log(JSON.stringify({knowledge:k,candidates:j.results,publication:p,feedback:await (await fetch(base+`/api/publications/${p.id}/feedback`)).json()},null,2));
