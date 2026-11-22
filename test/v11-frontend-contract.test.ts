import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const root=join(dirname(fileURLToPath(import.meta.url)),'..');
test('V1.1 frontend DOM selectors all resolve to declared elements',async()=>{
 const html=await readFile(join(root,'public/index.html'),'utf8');
 const js=await readFile(join(root,'public/app.js'),'utf8');
 const declared=new Set([...html.matchAll(/\bid="([^"]+)"/g)].map(m=>m[1]));
 const used=new Set([...js.matchAll(/\$\('([^']+)'\)/g)].map(m=>m[1]));
 const missing=[...used].filter(id=>!declared.has(id));
 assert.deepEqual(missing,[]);
});
test('V1.1 workspace exposes architecture navigation and compile flow',async()=>{
 const html=await readFile(join(root,'public/index.html'),'utf8');
 const js=await readFile(join(root,'public/app.js'),'utf8');
 assert.match(html,/id="room-list"/);
 assert.match(html,/id="room-count"/);
 assert.match(js,/\/api\/palaces\/compile/);
 assert.match(js,/function renderArchitecture/);
 assert.match(js,/function addRoomDecor/);
});
test('V1.2 frontend exposes two recall modes and persists learning evidence',async()=>{
 const html=await readFile(join(root,'public/index.html'),'utf8');
 const js=await readFile(join(root,'public/app.js'),'utf8');
 assert.match(html,/id="recall-cued"/);
 assert.match(html,/id="recall-unaided"/);
 assert.match(html,/id="learning-insights"/);
 assert.match(js,/\/api\/palaces\/\'\+encodeURIComponent\(state\.sceneId\)\+\'\/recalls/);
 assert.match(js,/\/learning/);
 assert.match(js,/function setRecallMode/);
 assert.match(js,/confusedWith:selected\.conceptId/);
});


test('V1.3 frontend captures deliberate inspector dwell, pre-answer confidence and learning export',async()=>{
 const html=await readFile(join(root,'public/index.html'),'utf8');
 const js=await readFile(join(root,'public/app.js'),'utf8');
 assert.match(html,/id="recall-confidence"/);
 assert.match(html,/id="export-learning"/);
 assert.match(js,/function beginExposure/);
 assert.match(js,/function flushActiveExposure/);
 assert.match(js,/\/exposures/);
 assert.match(js,/startedAt:state\.recallQuestionStartedAt/);
 assert.match(js,/confidence:Number\(confidenceValue\)/);
 assert.match(js,/learning\/export/);
 assert.match(js,/visibilitychange/);
});
