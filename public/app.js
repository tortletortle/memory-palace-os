import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';

const $ = (id) => document.getElementById(id);
const state = {
  title:'第一座记忆宫殿', domain:'probability', objects:[], selectedId:null,
  sceneId:null, architecture:null, recall:false, recallTarget:null, recallRound:0, recallCorrect:0, recallTotal:0,
  labelsVisible:true, three:null, recallMode:'cued', recallSessionId:null, recallQuestionAt:0, recallQuestionStartedAt:null, recallAnswered:false, recallPreviousLabels:true, learningReport:null, exposureSessionId:null, activeExposure:null, plannedQueue:null, plannedPalaceId:null
};
const palette={concept:'#9ebd80',formula:'#a99aff',condition:'#82b8c7',procedure:'#e4b76b',mechanism:'#ffb67a',example:'#e89bb2'};
const demo=[
 {id:'demo-1',conceptId:'c1',label:'泊松分布',kind:'concept',evidenceQuote:'描述固定区间内事件发生次数的概率分布。',metaphor:'一座记录随机事件的圆形大厅',x:-3,z:-1,color:palette.concept},
 {id:'demo-2',conceptId:'c2',label:'概率质量函数',kind:'formula',evidenceQuote:'P(X=k) = λᵏe⁻λ / k!',metaphor:'逐层堆叠的指数塔',x:0,z:1,color:palette.formula},
 {id:'demo-3',conceptId:'c3',label:'参数 λ',kind:'condition',evidenceQuote:'λ 表示单位区间内事件发生次数的期望。',metaphor:'控制机器速度的旋钮',x:3,z:-1,color:palette.condition}
];
let renderer,scene,camera,controls,raycaster,pointer,worldGroup,architectureGroup,objectMeshes=new Map(),labelSprites=new Map(),groundPlane;
let selectedMesh=null;
const container=$('world-container');

function toast(message){const el=$('toast');el.textContent=message;el.classList.add('show');setTimeout(()=>el.classList.remove('show'),2300);}
function sessionId(){return window.crypto?.randomUUID?window.crypto.randomUUID():`session-${Date.now()}-${Math.random().toString(36).slice(2)}`;}
function beginExposure(obj){if(!state.sceneId||state.recall||document.visibilityState==='hidden'||!obj)return;if(state.activeExposure?.palaceId===state.sceneId&&state.activeExposure?.conceptId===obj.conceptId)return;void flushActiveExposure();state.activeExposure={eventId:sessionId(),palaceId:state.sceneId,conceptId:obj.conceptId,startedAt:new Date().toISOString(),startedPerf:performance.now()};}
async function flushActiveExposure(keepalive=false){const active=state.activeExposure;if(!active)return;state.activeExposure=null;const elapsed=Math.max(0,Math.round(performance.now()-active.startedPerf));if(elapsed<1000||!active.palaceId)return;const durationMs=Math.min(600000,elapsed);const startedAt=elapsed>600000?new Date(Date.now()-durationMs).toISOString():active.startedAt;const payload={eventId:active.eventId,conceptId:active.conceptId,sessionId:state.exposureSessionId||sessionId(),startedAt,durationMs};try{const request=fetch('/api/palaces/'+encodeURIComponent(active.palaceId)+'/exposures',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify(payload),keepalive});if(keepalive){request.catch(error=>console.warn('Exposure event was not persisted',error));}else{const response=await request;if(!response.ok)throw new Error('学习浏览记录保存失败');if(state.sceneId===active.palaceId)await refreshLearningReport();}}catch(error){console.warn('Exposure event was not persisted',error);}}
function kindName(kind){return ({concept:'概念锚点',formula:'公式锚点',condition:'条件锚点',procedure:'步骤锚点',mechanism:'机制锚点',example:'案例锚点'})[kind]||'知识锚点';}
function makeId(){return 'obj-'+Math.random().toString(36).slice(2,9);}
function makeLabelSprite(text,color){
 const canvas=document.createElement('canvas');canvas.width=512;canvas.height=128;
 const ctx=canvas.getContext('2d');ctx.clearRect(0,0,512,128);
 ctx.fillStyle='rgba(255,255,255,.92)';roundRect(ctx,14,20,484,88,22);ctx.fill();
 ctx.strokeStyle='rgba(94,111,88,.18)';ctx.lineWidth=2;roundRect(ctx,14,20,484,88,22);ctx.stroke();
 ctx.fillStyle=color;ctx.beginPath();ctx.arc(45,64,9,0,Math.PI*2);ctx.fill();
 ctx.fillStyle='#344237';ctx.font='600 32px "Noto Sans SC", sans-serif';ctx.textAlign='left';ctx.textBaseline='middle';ctx.fillText(text.slice(0,18),70,65,395);
 const tex=new THREE.CanvasTexture(canvas);tex.colorSpace=THREE.SRGBColorSpace;
 const sprite=new THREE.Sprite(new THREE.SpriteMaterial({map:tex,transparent:true,depthTest:false}));
 sprite.scale.set(3.3,.82,1);sprite.position.y=2.7;sprite.userData.isLabel=true;return sprite;
}
function roundRect(ctx,x,y,w,h,r){ctx.beginPath();ctx.moveTo(x+r,y);ctx.arcTo(x+w,y,x+w,y+h,r);ctx.arcTo(x+w,y+h,x,y+h,r);ctx.arcTo(x,y+h,x,y,r);ctx.arcTo(x,y,x+w,y,r);ctx.closePath();}
function init3D(){
 scene=new THREE.Scene();scene.background=new THREE.Color('#e8eee6');scene.fog=new THREE.Fog('#e8eee6',17,42);
 camera=new THREE.PerspectiveCamera(43,container.clientWidth/container.clientHeight,.1,100);camera.position.set(25,22,28);
 renderer=new THREE.WebGLRenderer({antialias:true,alpha:false});renderer.setPixelRatio(Math.min(devicePixelRatio,2));renderer.setSize(container.clientWidth,container.clientHeight);renderer.shadowMap.enabled=true;renderer.shadowMap.type=THREE.PCFSoftShadowMap;renderer.outputColorSpace=THREE.SRGBColorSpace;renderer.toneMapping=THREE.ACESFilmicToneMapping;renderer.toneMappingExposure=1.15;
 container.insertBefore(renderer.domElement,container.firstChild);
 controls=new OrbitControls(camera,renderer.domElement);controls.target.set(0,0,0);controls.enableDamping=true;controls.dampingFactor=.06;controls.maxPolarAngle=Math.PI*.48;controls.minDistance=5;controls.maxDistance=65;
 scene.add(new THREE.HemisphereLight('#ffffff','#879783',2.0));
 const sun=new THREE.DirectionalLight('#fff5dd',2.2);sun.position.set(7,13,8);sun.castShadow=true;sun.shadow.mapSize.set(2048,2048);sun.shadow.camera.left=-18;sun.shadow.camera.right=18;sun.shadow.camera.top=18;sun.shadow.camera.bottom=-18;scene.add(sun);
 const fill=new THREE.DirectionalLight('#d5e1ff',.75);fill.position.set(-8,5,-7);scene.add(fill);
 worldGroup=new THREE.Group();scene.add(worldGroup);
 const floor=new THREE.Mesh(new THREE.CylinderGeometry(25,26,.65,64),new THREE.MeshStandardMaterial({color:'#cbd5c7',roughness:.88}));floor.position.y=-.43;floor.receiveShadow=true;worldGroup.add(floor);
 const innerFloor=new THREE.Mesh(new THREE.CircleGeometry(24.6,64),new THREE.MeshStandardMaterial({color:'#e4e9df',roughness:.94}));innerFloor.rotation.x=-Math.PI/2;innerFloor.position.y=-.095;innerFloor.receiveShadow=true;worldGroup.add(innerFloor);
 const grid=new THREE.GridHelper(48,96,'#b8c5b3','#d2dbce');grid.position.y=-.08;grid.material.opacity=.45;grid.material.transparent=true;worldGroup.add(grid);
 const ring=new THREE.Mesh(new THREE.TorusGeometry(22,.045,8,160),new THREE.MeshStandardMaterial({color:'#a6b99b',metalness:.1,roughness:.8}));ring.rotation.x=Math.PI/2;ring.position.y=.01;worldGroup.add(ring);
 // Architectural markers: a restrained circular memory cloister.
 for(let i=0;i<12;i++){const a=i*Math.PI/6;const x=Math.cos(a)*21.5,z=Math.sin(a)*21.5;const pillar=new THREE.Mesh(new THREE.CylinderGeometry(.13,.18,2.35,12),new THREE.MeshStandardMaterial({color:'#d0d9cc',roughness:.72}));pillar.position.set(x,1.1,z);pillar.castShadow=true;worldGroup.add(pillar);const cap=new THREE.Mesh(new THREE.CylinderGeometry(.25,.25,.12,12),new THREE.MeshStandardMaterial({color:'#aebda8'}));cap.position.set(x,2.33,z);worldGroup.add(cap);}
 const archRing=new THREE.Mesh(new THREE.TorusGeometry(5.2,.07,10,96),new THREE.MeshStandardMaterial({color:'#b4c5a8',roughness:.7}));archRing.rotation.x=Math.PI/2;archRing.position.y=3.15;worldGroup.add(archRing);
 raycaster=new THREE.Raycaster();pointer=new THREE.Vector2();
 renderer.domElement.addEventListener('pointerdown',onWorldClick);
 controls.addEventListener('change',()=>{$('world-coords').textContent=`X ${Math.round(camera.position.x).toString().padStart(2,'0')} · Z ${Math.round(camera.position.z).toString().padStart(2,'0')}`;});
 window.addEventListener('resize',resize3D);
 function animate(){requestAnimationFrame(animate);controls.update();renderer.render(scene,camera);}
 animate();state.three=true;
}
function resize3D(){if(!renderer)return;const w=container.clientWidth,h=container.clientHeight;camera.aspect=w/h;camera.updateProjectionMatrix();renderer.setSize(w,h);}
function createObjectMesh(obj){
 const group=new THREE.Group();group.position.set(obj.x??0,0,obj.z??0);group.userData.objectId=obj.id;
 const baseMat=new THREE.MeshStandardMaterial({color:'#aebca7',roughness:.78});
 const pedestal=new THREE.Mesh(new THREE.CylinderGeometry(.68,.82,.32,32),baseMat);pedestal.position.y=.08;pedestal.castShadow=true;pedestal.receiveShadow=true;group.add(pedestal);
 const color=new THREE.Color(obj.color||palette[obj.kind]||palette.concept);
 const mat=new THREE.MeshStandardMaterial({color,roughness:.36,metalness:.08,emissive:color,emissiveIntensity:.07});
 let mesh;
 switch(obj.kind){
  case 'formula': mesh=new THREE.TorusKnotGeometry(.48,.17,100,14,2,3);break;
  case 'condition': mesh=new THREE.OctahedronGeometry(.62,0);break;
  case 'procedure': mesh=new THREE.CylinderGeometry(.42,.58,1.05,8);break;
  case 'mechanism': mesh=new THREE.TorusGeometry(.48,.2,16,48);break;
  case 'example': mesh=new THREE.IcosahedronGeometry(.58,1);break;
  default: mesh=new THREE.DodecahedronGeometry(.62,0);
 }
 const anchor=new THREE.Mesh(mesh,mat);anchor.position.y=1.05;anchor.castShadow=true;anchor.receiveShadow=true;anchor.userData.objectId=obj.id;group.add(anchor);
 const halo=new THREE.Mesh(new THREE.TorusGeometry(.84,.025,8,48),new THREE.MeshBasicMaterial({color,transparent:true,opacity:.7}));halo.rotation.x=Math.PI/2;halo.position.y=.35;group.add(halo);
 const label=makeLabelSprite(obj.label,obj.color||palette[obj.kind]||palette.concept);group.add(label);
 group.traverse(o=>{if(o.isMesh)o.userData.objectId=obj.id;});
 worldGroup.add(group);objectMeshes.set(obj.id,group);labelSprites.set(obj.id,label);
 return group;
}
function disposeGroup(group){if(!group)return;group.traverse(o=>{if(o.geometry)o.geometry.dispose();if(o.material){if(Array.isArray(o.material))o.material.forEach(m=>{if(m.map)m.map.dispose();m.dispose();});else{if(o.material.map)o.material.map.dispose();o.material.dispose();}}});if(group.parent)group.parent.remove(group);}
function addWallSegment(group,x,z,length,rotation,color='#c9d4c4'){
 const wall=new THREE.Mesh(new THREE.BoxGeometry(length,2.35,.18),new THREE.MeshStandardMaterial({color,roughness:.85}));
 wall.position.set(x,1.08,z);wall.rotation.y=rotation;wall.castShadow=true;wall.receiveShadow=true;group.add(wall);
}
function addRoomWall(group,room,side){
 const gap=1.65,thick=.18,half=(side==='north'||side==='south'?room.width:room.depth)/2;
 const sign=side==='north'?-1:side==='south'?1:side==='east'?1:-1;
 const horizontal=side==='north'||side==='south';
 const z=horizontal?room.z+sign*(room.depth/2):room.z;
 const x=horizontal?room.x:room.x+sign*(room.width/2);
 const length=half-gap/2,offset=(half+gap/2)/2;
 if(horizontal){addWallSegment(group,x-offset,z,length,0);addWallSegment(group,x+offset,z,length,0);}
 else{addWallSegment(group,x,z-offset,length,Math.PI/2);addWallSegment(group,x,z+offset,length,Math.PI/2);}
 // lintel makes the opening legible without closing the doorway
 const lintel=new THREE.Mesh(new THREE.BoxGeometry(gap,.22,.22),new THREE.MeshStandardMaterial({color:'#aab9a4'}));
 lintel.position.set(x,2.25,z);if(!horizontal)lintel.rotation.y=Math.PI/2;group.add(lintel);
}
function makeArchitectureFallback(){
 return {version:'1.1',title:state.title,domain:state.domain,rooms:[{id:'atrium',title:'中央记忆中庭',kind:'atrium',conceptIds:state.objects.map(o=>o.conceptId),x:0,z:0,width:15,depth:13,floorColor:'#dce7d5'}],doors:[],placements:state.objects.map(o=>({conceptId:o.conceptId,roomId:'atrium',x:o.x,z:o.z,localX:o.x,localZ:o.z})),route:['atrium'],metrics:{concepts:state.objects.length,rooms:1,interRoomLinks:0,isolatedConcepts:0,meanRelatedDistance:0,overlapViolations:0,roomOverlapViolations:0,routeLength:0},objective:0};
}
function addDecorBox(group,w,h,d,x,y,z,color,roughness=.82){
 const mesh=new THREE.Mesh(new THREE.BoxGeometry(w,h,d),new THREE.MeshStandardMaterial({color,roughness}));mesh.position.set(x,y,z);mesh.castShadow=true;mesh.receiveShadow=true;group.add(mesh);return mesh;
}
function addRoomDecor(room,group){
 const x=room.x,z=room.z,w=room.width,d=room.depth;
 if(room.kind==='library'){
  for(const side of [-1,1]){
   const sx=x+side*(w*.34);addDecorBox(group,.34,1.9,d*.55,sx,.95,z,'#b7a78f');
   for(let level=0;level<3;level++){
    addDecorBox(group,.48,.1,d*.58,sx,.38+level*.62,z,'#8f806c');
    for(let b=0;b<6;b++){const bookH=.28+(b%3)*.08;addDecorBox(group,.12,bookH,.35,sx+(b-2.5)*.055,.55+level*.62+bookH/2,z-.04+(b%2)*.32,['#a99aff','#d6a77b','#8aa78b','#d18e92'][b%4]);}
   }
  }
 }else if(room.kind==='workshop'){
  addDecorBox(group,w*.42,.18,d*.24,x,.9,z,'#b69a79');
  for(const dx of [-1,1])for(const dz of [-1,1])addDecorBox(group,.16,.85,.16,x+dx*w*.18,.42,z+dz*d*.09,'#8d7d69');
  const gear=new THREE.Mesh(new THREE.TorusGeometry(.48,.13,10,36),new THREE.MeshStandardMaterial({color:'#c99b69',metalness:.35,roughness:.5}));gear.position.set(x-w*.27,.42,z-d*.28);gear.rotation.x=Math.PI/2;group.add(gear);
  const gear2=new THREE.Mesh(new THREE.TorusGeometry(.32,.1,10,32),new THREE.MeshStandardMaterial({color:'#9fae9a',metalness:.3,roughness:.5}));gear2.position.set(x+w*.27,.42,z-d*.28);gear2.rotation.x=Math.PI/2;group.add(gear2);
 }else if(room.kind==='garden'){
  for(const [dx,dz] of [[-.32,-.3],[.34,-.28],[-.28,.32],[.34,.32]]){
   const px=x+dx*w,pz=z+dz*d;const pot=new THREE.Mesh(new THREE.CylinderGeometry(.38,.48,.48,12),new THREE.MeshStandardMaterial({color:'#c7a78c'}));pot.position.set(px,.24,pz);pot.castShadow=true;group.add(pot);
   const trunk=new THREE.Mesh(new THREE.CylinderGeometry(.07,.11,.75,8),new THREE.MeshStandardMaterial({color:'#927b60'}));trunk.position.set(px,.82,pz);group.add(trunk);
   const crown=new THREE.Mesh(new THREE.IcosahedronGeometry(.48,1),new THREE.MeshStandardMaterial({color:'#9dbb88',roughness:.95}));crown.position.set(px,1.35,pz);crown.castShadow=true;group.add(crown);
  }
 }else if(room.kind==='corridor'){
  for(let i=0;i<5;i++){const pad=new THREE.Mesh(new THREE.BoxGeometry(.78,.09,.78),new THREE.MeshStandardMaterial({color:i%2?'#d7c8a9':'#c9b895',roughness:.9}));pad.position.set(x+(i-2)*.9,.03,z);pad.receiveShadow=true;group.add(pad);}
 }else if(room.kind==='threshold'){
  for(const side of [-1,1])addDecorBox(group,.24,2.7,.24,x+side*1.15,1.25,z,'#a9bdad');
  addDecorBox(group,2.55,.24,.25,x,2.55,z,'#9bb19e');
  const ring=new THREE.Mesh(new THREE.TorusGeometry(.7,.045,8,48),new THREE.MeshStandardMaterial({color:'#88a99f',emissive:'#88a99f',emissiveIntensity:.1}));ring.position.set(x,1.25,z);group.add(ring);
 }else if(room.kind==='gallery'){
  for(const [dx,dz] of [[-.3,-.3],[.3,-.3],[-.3,.3],[.3,.3]]){const plinth=new THREE.Mesh(new THREE.CylinderGeometry(.34,.42,.55,12),new THREE.MeshStandardMaterial({color:'#c3cdbb'}));plinth.position.set(x+dx*w,.28,z+dz*d);plinth.castShadow=true;group.add(plinth);}
 }
}

function renderArchitecture(){
 if(!worldGroup)return;
 if(architectureGroup)disposeGroup(architectureGroup);
 architectureGroup=new THREE.Group();worldGroup.add(architectureGroup);
 const plan=state.architecture||makeArchitectureFallback();
 const roomById=new Map(plan.rooms.map(r=>[r.id,r]));
 for(const room of plan.rooms){
  const floor=new THREE.Mesh(new THREE.BoxGeometry(room.width,.16,room.depth),new THREE.MeshStandardMaterial({color:room.floorColor||'#e5eadf',roughness:.9}));
  floor.position.set(room.x,-.08,room.z);floor.receiveShadow=true;architectureGroup.add(floor);
  const trim=new THREE.Mesh(new THREE.BoxGeometry(room.width+.24,.12,room.depth+.24),new THREE.MeshStandardMaterial({color:'#b8c6b1',roughness:.8}));
  trim.position.set(room.x,-.19,room.z);architectureGroup.add(trim);
  if(room.kind!=='atrium'){
   addRoomWall(architectureGroup,room,'north');addRoomWall(architectureGroup,room,'south');addRoomWall(architectureGroup,room,'east');addRoomWall(architectureGroup,room,'west');
   for(const [dx,dz] of [[-1,-1],[1,-1],[-1,1],[1,1]]){const pillar=new THREE.Mesh(new THREE.BoxGeometry(.24,2.5,.24),new THREE.MeshStandardMaterial({color:'#bdcbb6'}));pillar.position.set(room.x+dx*(room.width/2),1.15,room.z+dz*(room.depth/2));pillar.castShadow=true;architectureGroup.add(pillar);}
   addRoomDecor(room,architectureGroup);
  }else{
   const ring=new THREE.Mesh(new THREE.TorusGeometry(Math.min(room.width,room.depth)*.44,.09,10,96),new THREE.MeshStandardMaterial({color:'#a8bc9e'}));ring.rotation.x=Math.PI/2;ring.position.set(room.x,.1,room.z);architectureGroup.add(ring);
  }
  const label=makeLabelSprite(room.title,'#91a986');label.position.set(room.x,3.15,room.z);label.scale.set(4.1,1,1);architectureGroup.add(label);labelSprites.set(`room:${room.id}`,label);
 }
 // Main atrium paths and relation-driven room connections.
 for(const room of plan.rooms.filter(r=>r.id!=='atrium')){
  const points=[new THREE.Vector3(0,-.005,0),new THREE.Vector3(room.x,-.005,room.z)];
  const geometry=new THREE.BufferGeometry().setFromPoints(points);
  const line=new THREE.Line(geometry,new THREE.LineDashedMaterial({color:'#9bad91',dashSize:.42,gapSize:.24,transparent:true,opacity:.8}));
  line.computeLineDistances();architectureGroup.add(line);
 }
 for(const door of plan.doors||[]){
  const a=roomById.get(door.fromRoomId),b=roomById.get(door.toRoomId);if(!a||!b)continue;
  const points=[new THREE.Vector3(a.x,.015,a.z),new THREE.Vector3(b.x,.015,b.z)];
  const line=new THREE.Line(new THREE.BufferGeometry().setFromPoints(points),new THREE.LineBasicMaterial({color:'#8fa783',transparent:true,opacity:.55}));architectureGroup.add(line);
 }
 const extent=Math.max(18,...plan.rooms.map(r=>Math.hypot(r.x,r.z)+Math.max(r.width,r.depth)/2));
 camera.position.set(extent*1.25,extent*1.05,extent*1.45);controls.target.set(0,0,0);controls.update();
 renderRoomList(plan);
}
function renderRoomList(plan){
 const list=$('room-list');list.innerHTML='';
 plan.rooms.forEach(room=>{const row=document.createElement('div');row.className='room-row';const icon=document.createElement('i');icon.className='room-symbol';icon.style.background=room.floorColor||'#dce7d5';const name=document.createElement('span');name.textContent=room.title;const count=document.createElement('small');count.textContent=room.conceptIds.length?`${room.conceptIds.length} 锚点`:room.kind==='atrium'?'入口':'空间';row.append(icon,name,count);row.addEventListener('click',()=>{controls.target.set(room.x,0,room.z);camera.position.set(room.x+10,10,room.z+12);controls.update();});list.append(row);});
 $('room-count').textContent=String(plan.rooms.length).padStart(2,'0')+' ROOMS';
 $('route-length').textContent=`路线 ${Number(plan.metrics.routeLength||0).toFixed(1)} units`;
 $('architecture-score').textContent=`目标值 ${Number(plan.objective||0).toFixed(2)}`;
}
function rebuildObjects(){
 for(const [,g] of objectMeshes){worldGroup.remove(g);g.traverse(o=>{if(o.geometry)o.geometry.dispose();if(o.material){if(Array.isArray(o.material))o.material.forEach(m=>{if(m.map)m.map.dispose();m.dispose();});else{if(o.material.map)o.material.map.dispose();o.material.dispose();}}});}
 objectMeshes.clear();labelSprites.clear();
 renderArchitecture();
 state.objects.forEach(createObjectMesh);
 renderKnowledgeList();updateCounts();
 if(state.selectedId&&!state.objects.some(o=>o.id===state.selectedId))state.selectedId=null;
 if(state.selectedId)selectObject(state.selectedId);else if(state.objects[0])selectObject(state.objects[0].id);
}
function onWorldClick(event){
 const rect=renderer.domElement.getBoundingClientRect();pointer.x=((event.clientX-rect.left)/rect.width)*2-1;pointer.y=-((event.clientY-rect.top)/rect.height)*2+1;
 raycaster.setFromCamera(pointer,camera);
 const targets=[];objectMeshes.forEach(g=>g.traverse(o=>{if(o.isMesh)targets.push(o);}));
 const hits=raycaster.intersectObjects(targets,false);
 if(hits.length){const id=hits[0].object.userData.objectId;if(id)selectObject(id,true);if(state.recall)void checkRecall(id);}
}
function selectObject(id,userInitiated=false){
 const previous=state.objects.find(o=>o.id===state.selectedId);if(state.activeExposure&&previous?.id!==id)void flushActiveExposure();
 state.selectedId=id;const obj=state.objects.find(o=>o.id===id);if(!obj)return;
 objectMeshes.forEach((g,key)=>{const active=key===id;g.scale.setScalar(active?1.08:1);g.position.y=active?.12:0;});
 $('object-details').hidden=false;$('empty-selection').hidden=true;
 $('selected-index').textContent=`${String(state.objects.findIndex(o=>o.id===id)+1).padStart(2,'0')} / ${String(state.objects.length).padStart(2,'0')}`;
 $('object-type').textContent=(kindName(obj.kind)+' / '+obj.kind.toUpperCase()).toUpperCase();
 $('object-sim').href=state.sceneId?'/simulation.html?'+new URLSearchParams({palace:state.sceneId,concept:obj.conceptId}).toString():'/simulation.html';
 $('object-lab').href=state.sceneId?'/lab.html?'+new URLSearchParams({palace:state.sceneId,concept:obj.conceptId}).toString():'/lab.html';
 $('object-title').textContent=obj.label;$('object-metaphor').textContent=obj.metaphor||'空间记忆锚点';
 $('object-evidence').textContent=obj.evidenceQuote||'暂无原文证据';$('object-cue').textContent=obj.metaphor||'尝试通过物体形状和位置回忆知识。';
 $('object-preview').style.setProperty('--object-color',obj.color||palette[obj.kind]||palette.concept);
  const shape=$('object-preview').querySelector('.preview-shape');shape.textContent=obj.kind==='formula'?'ƒ':obj.kind==='condition'?'◇':obj.kind==='mechanism'?'⚙':obj.kind==='procedure'?'↗':'✳';shape.style.background=obj.color||palette[obj.kind]||palette.concept;
 $('knowledge-list').querySelectorAll('.knowledge-row').forEach(row=>row.classList.toggle('selected',row.dataset.id===id));
 if(userInitiated&&!state.recall)beginExposure(obj);
}
function renderKnowledgeList(){
 const list=$('knowledge-list');list.innerHTML='';
 state.objects.forEach((obj,i)=>{const row=document.createElement('div');row.className='knowledge-row'+(obj.id===state.selectedId?' selected':'');row.dataset.id=obj.id;const dot=document.createElement('i');dot.className='kind-dot '+obj.kind;const label=document.createElement('b');label.textContent=obj.label;const n=document.createElement('small');n.textContent=String(i+1).padStart(2,'0');row.append(dot,label,n);row.addEventListener('click',()=>selectObject(obj.id,true));list.append(row);});
 if(!state.objects.length){const empty=document.createElement('div');empty.className='empty-selection';empty.textContent='还没有知识锚点，导入一段知识开始吧。';list.append(empty);}
}
function updateCounts(){$('object-count').textContent=String(state.objects.length).padStart(2,'0')+' OBJECTS';$('stat-objects').textContent=String(state.objects.length).padStart(2,'0');$('selected-index').textContent=`01 / ${String(state.objects.length).padStart(2,'0')}`;}
function addObject(obj){
 const angle=state.objects.length*2.399;const radius=2.2+Math.min(3,Math.floor(state.objects.length/8)*.8);
 const normalized={id:obj.id||makeId(),conceptId:obj.conceptId||makeId(),label:obj.label,kind:obj.kind||'concept',evidenceQuote:obj.evidenceQuote||'',metaphor:obj.metaphor||'新的记忆锚点',x:obj.x??Math.cos(angle)*radius,z:obj.z??Math.sin(angle)*radius,color:obj.color||palette[obj.kind]||palette.concept};
 state.objects.push(normalized);if(state.architecture){const room=state.architecture.rooms.find(r=>r.id==='atrium')||state.architecture.rooms[0];if(room){normalized.roomId=room.id;room.conceptIds.push(normalized.conceptId);state.architecture.placements.push({conceptId:normalized.conceptId,roomId:room.id,x:normalized.x,z:normalized.z,localX:normalized.x-room.x,localZ:normalized.z-room.z});state.architecture.metrics.concepts++;}}createObjectMesh(normalized);selectObject(normalized.id);renderKnowledgeList();updateCounts();return normalized;
}
function removeSelected(){if(!state.selectedId)return;void flushActiveExposure();const id=state.selectedId;const g=objectMeshes.get(id);if(g){worldGroup.remove(g);objectMeshes.delete(id);labelSprites.delete(id);}const removed=state.objects.find(o=>o.id===id);state.objects=state.objects.filter(o=>o.id!==id);if(state.architecture&&removed){state.architecture.placements=state.architecture.placements.filter(p=>p.conceptId!==removed.conceptId);state.architecture.rooms.forEach(r=>r.conceptIds=r.conceptIds.filter(x=>x!==removed.conceptId));state.architecture.metrics.concepts=state.objects.length;}state.selectedId=null;rebuildObjects();toast('已移除知识锚点');}
function moveSelected(dx,dz){const obj=state.objects.find(o=>o.id===state.selectedId);if(!obj)return;const placement=state.architecture?.placements.find(x=>x.conceptId===obj.conceptId);const room=placement?state.architecture.rooms.find(r=>r.id===placement.roomId):null;obj.x=room?Math.max(room.x-room.width/2+.8,Math.min(room.x+room.width/2-.8,obj.x+dx)):Math.max(-20,Math.min(20,obj.x+dx));obj.z=room?Math.max(room.z-room.depth/2+.8,Math.min(room.z+room.depth/2-.8,obj.z+dz)):Math.max(-20,Math.min(20,obj.z+dz));const g=objectMeshes.get(obj.id);g.position.set(obj.x,0,obj.z);if(placement){placement.x=obj.x;placement.z=obj.z;placement.localX=obj.x-(room?.x||0);placement.localZ=obj.z-(room?.z||0);}toast('已调整空间位置');}
function renderLearningReport(report){
 state.learningReport=report;
 const accuracy=report.metrics.empiricalAccuracy;
 $('stat-recall').textContent=accuracy===null?'—':Math.round(accuracy*100)+'%';
 $('progress-fill').style.width=accuracy===null?'0%':Math.round(accuracy*100)+'%';
 $('stat-days').textContent=String(report.evidence.studyDays||0).padStart(2,'0');
 const next=report.metrics.nextReviewAt?new Date(report.metrics.nextReviewAt).toLocaleString('zh-CN',{month:'numeric',day:'numeric',hour:'2-digit',minute:'2-digit'}):'尚无可靠复习时间';
 const responseMs=report.metrics.responseTime?.medianMs;
 const brier=report.metrics.confidenceCalibration?.brierScore;
 const dwell=(report.evidence.totalInspectorViewMs||0)/60000;
 $('progress-note').textContent=`已记录 ${report.evidence.eventCount} 条回忆、${report.evidence.exposureEventCount||0} 次知识卡片查看（前台停留 ${dwell.toFixed(1)} 分钟）· ${report.evidence.studyDays} 个活动日 · 中位响应 ${responseMs===null||responseMs===undefined?'—':(responseMs/1000).toFixed(1)+' 秒'} · 下一次建议复习：${next}`;
 const messages=(report.recommendations||[]).slice(0,2).map(item=>item.message);
 const calibration=brier===null||brier===undefined?'信心样本不足':`信心 Brier ${brier.toFixed(3)}（${report.metrics.confidenceCalibration.count} 条，仅描述）`;
 $('learning-insights').textContent=(messages.length?messages.join(' '):'当前没有需要处理的异常。继续积累跨时间的回忆证据。')+' '+calibration+'。浏览时长不等于有效注意或学习。';
}
async function refreshLearningReport(){
 const id=state.sceneId;if(!id)return;
 try{const response=await fetch('/api/palaces/'+encodeURIComponent(id)+'/learning');if(!response.ok)throw new Error('学习报告读取失败');const report=await response.json();if(state.sceneId===id)renderLearningReport(report);}
 catch(error){console.warn('Learning report unavailable',error);}
}
function setAnchorLabelsVisible(visible){
 for(const id of objectMeshes.keys()){const sprite=labelSprites.get(id);if(sprite)sprite.visible=visible;}
}
function setRecallMode(mode){
 if(state.plannedQueue&&mode!=='unaided')return;
 state.recallMode=mode;
 $('recall-cued').classList.toggle('active',mode==='cued');
 $('recall-unaided').classList.toggle('active',mode==='unaided');
 setAnchorLabelsVisible(mode==='cued');
 $('toggle-labels').classList.toggle('active',mode==='cued');
 $('recall-mode-note').textContent=mode==='cued'?'显示原文线索和锚点名称，测试知识与空间的匹配。':'只显示知识名称并隐藏锚点标签，尝试凭记忆定位空间位置。';
 if(state.recall&&state.recallTarget)nextRecallQuestion();
}
async function loadPalaces(){
 try{const res=await fetch('/api/palaces');if(!res.ok)throw new Error();const palaces=await res.json();if(palaces.length){const p=palaces[0];state.sceneId=p.id;state.title=p.title;state.domain=p.domain;state.objects=p.objects;state.architecture=p.architecture||null;setTitle();rebuildObjects();renderPalaceList(palaces);await refreshLearningReport();return;}}
 catch(e){console.warn('Palace API unavailable; using local demo',e);}
 state.objects=demo.map(x=>({...x}));rebuildObjects();$('world-loading').classList.add('hidden');
}
function setTitle(){$('page-title').innerHTML='';$('page-title').append(document.createTextNode(state.title));const dot=document.createElement('span');dot.className='title-dot';dot.textContent='.';$('page-title').append(dot);$('breadcrumb-title').textContent=state.title;}
function renderPalaceList(palaces=[]){const list=$('palace-list');list.innerHTML='';const item={id:state.sceneId,title:state.title};[item,...palaces.filter(p=>p.id!==state.sceneId)].slice(0,5).forEach(p=>{const row=document.createElement('div');row.className='space-link'+(p.id===state.sceneId?' active':'');const dot=document.createElement('i');dot.className='space-dot';const text=document.createTextNode(p.title);row.append(dot,text);row.addEventListener('click',async()=>{if(!p.id||p.id===state.sceneId)return;await flushActiveExposure();const r=await fetch('/api/palaces/'+encodeURIComponent(p.id));if(r.ok){const data=await r.json();state.sceneId=data.id;state.title=data.title;state.domain=data.domain;state.objects=data.objects;state.architecture=data.architecture||null;setTitle();rebuildObjects();renderPalaceList(palaces);await refreshLearningReport();}});list.append(row);});}
async function savePalace(){
 await flushActiveExposure();$('save-state').textContent='● 正在保存…';
 try{const target=state.sceneId?'/api/palaces/'+encodeURIComponent(state.sceneId):'/api/palaces';const res=await fetch(target,{method:state.sceneId?'PUT':'POST',headers:{'content-type':'application/json'},body:JSON.stringify({title:state.title,domain:state.domain,objects:state.objects,architecture:state.architecture})});if(!res.ok)throw new Error((await res.json()).error?.message||'保存失败');const p=await res.json();state.sceneId=p.id;if(state.selectedId){const anchor=state.objects.find(o=>o.id===state.selectedId);if(anchor)$('object-lab').href='/lab.html?'+new URLSearchParams({palace:state.sceneId,concept:anchor.conceptId}).toString();}$('save-state').textContent='● 已保存到本地';const all=await fetch('/api/palaces').then(r=>r.json());renderPalaceList(all);await refreshLearningReport();toast('宫殿已保存');}
 catch(e){$('save-state').textContent='● 保存失败';toast(e.message||'无法连接本地服务');}
}
function openModal(){void flushActiveExposure();$('modal-backdrop').hidden=false;$('new-label').focus();}
function closeModal(){$('modal-backdrop').hidden=true;}
function createFromModal(){const label=$('new-label').value.trim(),kind=$('new-kind').value,evidence=$('new-evidence').value.trim(),metaphor=$('new-metaphor').value.trim();if(!label){toast('请先填写知识名称');return;}addObject({label,kind,evidenceQuote:evidence,metaphor:metaphor||`用一个${kindName(kind)}帮助回忆`});closeModal();$('new-label').value='';$('new-evidence').value='';$('new-metaphor').value='';}
async function analyzeSource(){
 const source=$('source-input').value.trim();if(!source){toast('先粘贴一段需要记住的知识');return;}if(source.length>20000){toast('内容超过20000字');return;}
 if(state.objects.length&&!confirm('AI将为这段知识创建一座新的记忆宫殿。当前未保存的修改请先保存。继续吗？'))return;
 const button=$('analyze-source');button.disabled=true;button.textContent='正在规划建筑…';$('import-status').textContent='AI正在解析知识，并计算房间布局、空间锚点与记忆路线…';
 try{
  const res=await fetch('/api/palaces/compile',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({source,budgetUnits:18})});
  const data=await res.json();if(!res.ok)throw new Error(data.error?.message||'建筑生成失败');
  const palace=data.palace;state.sceneId=palace.id;state.title=palace.title;state.domain=palace.domain;state.objects=palace.objects;state.architecture=palace.architecture;
  setTitle();rebuildObjects();$('source-input').value='';
  const rooms=state.architecture.rooms.length,anchors=state.objects.length;
  $('import-status').textContent=`建造完成：${rooms} 个空间 · ${anchors} 个知识锚点 · ${data.provenance.mode==='remote'?'真实模型':'离线规则'} · 证据校验 ${data.quality.valid?'通过':'待复核'}`;
  const all=await fetch('/api/palaces').then(r=>r.json());renderPalaceList(all);await refreshLearningReport();toast(`已建造「${state.title}」：${rooms} 个空间`);
 }catch(e){$('import-status').textContent='建造失败：'+e.message;toast(e.message||'建筑生成失败');}
 finally{button.disabled=false;button.innerHTML='AI规划并建造宫殿 <span>→</span>';}
}
function metaphorFor(kind,label){return ({formula:`把「${label}」想象成一台可以拆开的机械装置`,concept:`为「${label}」建造一座醒目的地标`,condition:`把「${label}」变成进入房间前的门槛`,procedure:`把「${label}」设计成一条有方向的路线`,mechanism:`把「${label}」想象成正在运转的机器`,example:`为「${label}」放置一个具体场景`})[kind]||`「${label}」的空间联想锚点`;}
async function startPlannedReview(){
 if(state.recall)return;
 if(!state.sceneId||state.objects.length<2){toast('请先保存至少两个知识锚点');return;}
 const id=state.sceneId,button=$('start-planned-review');button.disabled=true;
 try{const res=await fetch('/api/palaces/'+encodeURIComponent(id)+'/review-plan?budgetSeconds='+encodeURIComponent($('review-budget').value)+'&policy='+encodeURIComponent($('review-policy').value));const plan=await res.json();if(!res.ok)throw new Error(plan.error?.message||'计划生成失败');if(state.sceneId!==id||state.recall)return;
 const queue=plan.tasks.map(t=>state.objects.find(o=>o.conceptId===t.conceptId)?.id).filter(Boolean);
 $('review-plan-note').textContent=`${plan.policy==='fixed'?'固定间隔优先':plan.policy==='marginal'?'边际收益（实验）':'风险优先（实验）'} · 本轮 ${queue.length} 项 · 预计 ${plan.estimatedSeconds} 秒 / ${plan.budgetSeconds} 秒；仅测量空间定位。`;
 if(!queue.length){toast('暂无适合复习的项目，或预算不足');return;}state.plannedQueue=queue;state.plannedPalaceId=id;startRecall(true);
 }catch(e){toast(e.message||'复习规划失败');}finally{button.disabled=false;}
}
function startRecall(planned=false){
 if(state.recall)return;
 if(planned!==true){state.plannedQueue=null;state.plannedPalaceId=null;}
 void flushActiveExposure();
 if(state.objects.length<2){toast('至少需要两个知识锚点才能开始训练');return;}
 state.recall=true;state.recallRound=1;state.recallTotal=0;state.recallCorrect=0;state.recallTarget=null;
 state.recallPreviousLabels=state.labelsVisible;
 state.recallSessionId=sessionId();
 $('recall-overlay').hidden=false;$('recall-cued').disabled=!!state.plannedQueue;$('recall-unaided').disabled=!!state.plannedQueue;setRecallMode(state.plannedQueue?'unaided':'cued');nextRecallQuestion();
}
function nextRecallQuestion(){
 if(state.plannedQueue){
  if(state.sceneId!==state.plannedPalaceId||!state.plannedQueue.length){exitRecall();toast('本轮计划结束');return;}
  const targetId=state.plannedQueue.shift();state.recallTarget=state.objects.find(o=>o.id===targetId);if(!state.recallTarget){exitRecall();toast('宫殿已改变，请重新生成计划');return;}
 }else{const pool=state.objects;const choices=pool.filter(o=>!state.recallTarget||o.id!==state.recallTarget.id);state.recallTarget=(choices.length?choices:pool)[Math.floor(Math.random()*(choices.length?choices:pool).length)];}
 state.recallAnswered=false;state.recallQuestionAt=performance.now();state.recallQuestionStartedAt=new Date().toISOString();$('recall-confidence').value='';
 $('recall-round').textContent=String(state.recallRound).padStart(2,'0');
 $('recall-question').textContent=state.recallMode==='cued'?(state.recallTarget.evidenceQuote||`回忆知识：${state.recallTarget.label}`):`请在记忆宫殿中定位：「${state.recallTarget.label}」`;
 $('recall-feedback').textContent='';$('recall-feedback').className='recall-feedback';$('next-recall').disabled=true;
}
async function checkRecall(id){
 if(!state.recall||!state.recallTarget||$('recall-overlay').hidden||state.recallAnswered)return;
 state.recallAnswered=true;
 const target=state.recallTarget,selected=state.objects.find(object=>object.id===id),correct=id===target.id;
 state.recallTotal++;if(correct)state.recallCorrect++;
 $('recall-feedback').textContent=correct?'回答正确！你找到了对应的空间锚点。':`还不对。正确位置是「${target.label}」，再观察它的形状与位置。`;
 $('recall-feedback').className='recall-feedback '+(correct?'correct':'wrong');$('next-recall').disabled=true;
 $('stat-recall').textContent=Math.round(state.recallCorrect/state.recallTotal*100)+'%';$('progress-fill').style.width=(state.recallCorrect/state.recallTotal*100)+'%';
 if(state.sceneId){
  const confidenceValue=$('recall-confidence').value;const payload={conceptId:target.conceptId,mode:state.recallMode,grade:correct?'correct':'missed',revealed:true,sessionId:state.recallSessionId,startedAt:state.recallQuestionStartedAt,responseMs:Math.min(600000,Math.max(0,Math.round(performance.now()-state.recallQuestionAt))),...(confidenceValue?{confidence:Number(confidenceValue)}:{}),...(selected&&!correct?{confusedWith:selected.conceptId}:{})};
  try{const response=await fetch('/api/palaces/'+encodeURIComponent(state.sceneId)+'/recalls',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify(payload)});if(!response.ok)throw new Error((await response.json()).error?.message||'回忆记录保存失败');await refreshLearningReport();}
  catch(error){toast(error.message||'回忆结果未能保存');}
 }
 if(state.recall&&state.recallTarget===target)$('next-recall').disabled=false;
}
function exitRecall(){
 state.recall=false;state.plannedQueue=null;state.plannedPalaceId=null;$('recall-cued').disabled=false;$('recall-unaided').disabled=false;$('recall-overlay').hidden=true;
 setAnchorLabelsVisible(state.recallPreviousLabels);$('toggle-labels').classList.toggle('active',state.recallPreviousLabels);
}
function bindUI(){
 $('save-palace').addEventListener('click',savePalace);$('add-object').addEventListener('click',openModal);$('new-palace').addEventListener('click',()=>{void flushActiveExposure();state.sceneId=null;state.title='未命名记忆宫殿';state.domain='general';state.objects=[];state.architecture=null;state.learningReport=null;$('stat-recall').textContent='—';$('stat-days').textContent='00';$('progress-fill').style.width='0%';$('progress-note').textContent='保存宫殿并完成回忆训练后，这里会显示记忆表现。';$('learning-insights').textContent='暂无个性化建议。';setTitle();rebuildObjects();});
 $('start-planned-review').addEventListener('click',startPlannedReview);
 $('export-learning').addEventListener('click',()=>{if(!state.sceneId){toast('请先保存宫殿');return;}window.location.href='/api/palaces/'+encodeURIComponent(state.sceneId)+'/learning/export';});
 document.addEventListener('visibilitychange',()=>{if(document.visibilityState==='hidden')void flushActiveExposure(true);else if(state.selectedId&&!state.recall)beginExposure(state.objects.find(o=>o.id===state.selectedId));});
 window.addEventListener('pagehide',()=>{void flushActiveExposure(true);});
 $('close-modal').addEventListener('click',closeModal);$('modal-backdrop').addEventListener('click',e=>{if(e.target===$('modal-backdrop'))closeModal();});$('create-object').addEventListener('click',createFromModal);
 $('analyze-source').addEventListener('click',analyzeSource);$('remove-object').addEventListener('click',removeSelected);
 $('move-left').addEventListener('click',()=>moveSelected(-.5,0));$('move-right').addEventListener('click',()=>moveSelected(.5,0));$('move-forward').addEventListener('click',()=>moveSelected(0,-.5));$('move-back').addEventListener('click',()=>moveSelected(0,.5));
 $('reset-camera').addEventListener('click',()=>{camera.position.set(25,22,28);controls.target.set(0,0,0);controls.update();});
 $('toggle-labels').addEventListener('click',()=>{if(state.recall){toast('训练期间请使用当前回忆模式控制标签');return;}state.labelsVisible=!state.labelsVisible;labelSprites.forEach(s=>s.visible=state.labelsVisible);$('toggle-labels').classList.toggle('active',state.labelsVisible);});
 $('fullscreen').addEventListener('click',()=>{if(container.requestFullscreen)container.requestFullscreen();});
 $('enter-recall').addEventListener('click',startRecall);$('exit-recall').addEventListener('click',exitRecall);$('recall-cued').addEventListener('click',()=>setRecallMode('cued'));$('recall-unaided').addEventListener('click',()=>setRecallMode('unaided'));$('next-recall').addEventListener('click',()=>{state.recallRound++;nextRecallQuestion();});
 $('nav-library').addEventListener('click',()=>$('source-input').focus());$('nav-training').addEventListener('click',startRecall);
}
async function main(){
 state.exposureSessionId=sessionId();bindUI();init3D();$('world-loading').classList.add('hidden');await loadPalaces();
 if(!state.objects.length){state.objects=demo.map(x=>({...x}));rebuildObjects();}
 setTitle();updateCounts();renderPalaceList();
}
main().catch(e=>{console.error(e);$('world-loading').classList.remove('hidden');$('world-loading').textContent='3D 场景初始化失败，请检查浏览器是否支持 WebGL。';});
