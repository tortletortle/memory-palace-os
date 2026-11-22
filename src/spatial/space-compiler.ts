import type { KnowledgeUnderstanding } from '../knowledge-understanding-types.ts';

export type RoomKind='atrium'|'library'|'threshold'|'corridor'|'workshop'|'garden'|'gallery';
export interface SpatialRoom { id:string; title:string; kind:RoomKind; conceptIds:string[]; x:number; z:number; width:number; depth:number; floorColor:string; }
export interface SpatialDoor { fromRoomId:string; toRoomId:string; relationTypes:string[]; weight:number; }
export interface SpatialPlacement { conceptId:string; roomId:string; x:number; z:number; localX:number; localZ:number; }
export interface SpatialMetrics { concepts:number; rooms:number; interRoomLinks:number; isolatedConcepts:number; meanRelatedDistance:number; overlapViolations:number; roomOverlapViolations:number; routeLength:number; }
export interface MemoryArchitecture { version:'1.1'; title:string; domain:string; rooms:SpatialRoom[]; doors:SpatialDoor[]; placements:SpatialPlacement[]; route:string[]; metrics:SpatialMetrics; objective:number; }
const kindToRoom:Record<string,RoomKind>={concept:'gallery',formula:'library',condition:'threshold',procedure:'corridor',mechanism:'workshop',example:'garden'};
const roomStyle:Record<RoomKind,{title:string;color:string}>={atrium:{title:'中央记忆中庭',color:'#dce7d5'},library:{title:'公式图书馆',color:'#e6e0f5'},threshold:{title:'条件门厅',color:'#dcebef'},corridor:{title:'推导长廊',color:'#f3e8d4'},workshop:{title:'机制工坊',color:'#f7e2d4'},garden:{title:'案例花园',color:'#e0ecd9'},gallery:{title:'概念展厅',color:'#e5eadf'}};
const palette:Record<string,string>={concept:'#9ebd80',formula:'#a99aff',condition:'#82b8c7',procedure:'#e4b76b',mechanism:'#ffb67a',example:'#e89bb2'};
function clamp(v:number,lo:number,hi:number){return Math.max(lo,Math.min(hi,v));}
function connectedComponents(ids:string[],edges:Array<{a:string;b:string}>){
 const parent=new Map(ids.map(id=>[id,id]));
 const find=(x:string):string=>{const p=parent.get(x)!;if(p===x)return x;const r=find(p);parent.set(x,r);return r;};
 for(const e of edges){if(parent.has(e.a)&&parent.has(e.b)){const a=find(e.a),b=find(e.b);if(a!==b)parent.set(b,a);}}
 const groups=new Map<string,string[]>();for(const id of ids){const r=find(id);if(!groups.has(r))groups.set(r,[]);groups.get(r)!.push(id);}return [...groups.values()];
}
function splitGroups(ids:string[],relations:KnowledgeUnderstanding['relations'],byId:Map<string,KnowledgeUnderstanding['concepts'][number]>,maxPerRoom=7){
 const kindBuckets=new Map<RoomKind,string[]>();
 for(const id of ids){const k=kindToRoom[byId.get(id)?.kind??'concept'];if(!kindBuckets.has(k))kindBuckets.set(k,[]);kindBuckets.get(k)!.push(id);}
 const result:Array<{kind:RoomKind;ids:string[]}>=[];
 for(const [kind,bucket] of [...kindBuckets].sort((a,b)=>a[0].localeCompare(b[0]))){
  const edges=relations.filter(r=>bucket.includes(r.from)&&bucket.includes(r.to)).map(r=>({a:r.from,b:r.to}));
  const components=connectedComponents(bucket,edges).sort((a,b)=>b.length-a.length||a[0].localeCompare(b[0]));
  let group:string[]=[];
  for(const component of components){for(const id of component){if(group.length>=maxPerRoom){result.push({kind,ids:group});group=[];}group.push(id);}}
  if(group.length)result.push({kind,ids:group});
 }
 return result;
}


function optimizeGroupOrder(groups:Array<{kind:RoomKind;ids:string[]}>,relations:KnowledgeUnderstanding['relations']){
 if(groups.length<3)return;
 const groupOf=new Map<string,number>();groups.forEach((g,i)=>g.ids.forEach(id=>groupOf.set(id,i)));
 const affinity=new Map<string,number>();
 for(const r of relations){const a=groupOf.get(r.from),b=groupOf.get(r.to);if(a===undefined||b===undefined||a===b)continue;const key=[a,b].sort((x,y)=>x-y).join('|');affinity.set(key,(affinity.get(key)||0)+1);}
 const n=groups.length;
 const cost=(order:number[])=>{let total=0;for(const [key,w] of affinity){const [a,b]=key.split('|').map(Number);const ia=order.indexOf(a),ib=order.indexOf(b);const steps=Math.min(Math.abs(ia-ib),n-Math.abs(ia-ib));total+=w*2*Math.sin(Math.PI*steps/n);}return total;};
 let order=groups.map((_,i)=>i),best=cost(order);
 for(let pass=0;pass<n*n*2;pass++){
  let chosen:[number,number]|null=null,chosenCost=best;
  for(let i=0;i<n;i++)for(let j=i+1;j<n;j++){const candidate=[...order];[candidate[i],candidate[j]]=[candidate[j],candidate[i]];const c=cost(candidate);if(c<chosenCost-1e-8){chosenCost=c;chosen=[i,j];}}
  if(!chosen)break;
  [order[chosen[0]],order[chosen[1]]]=[order[chosen[1]],order[chosen[0]]];best=chosenCost;
 }
 const sorted=order.map(i=>groups[i]);groups.splice(0,groups.length,...sorted);
}

function optimizeRoomPositions(rooms:SpatialRoom[],groups:Array<{kind:RoomKind;ids:string[]}>,relations:KnowledgeUnderstanding['relations'],ringRadius:number){
 const groupRoom=new Map<string,string>();groups.forEach((g,i)=>g.ids.forEach(id=>groupRoom.set(id,`room-${i+1}`)));
 const weights=new Map<string,number>();
 for(const rel of relations){const a=groupRoom.get(rel.from),b=groupRoom.get(rel.to);if(!a||!b||a===b)continue;const key=[a,b].sort().join('|');weights.set(key,(weights.get(key)||0)+1);}
 const movable=rooms.filter(r=>r.id!=='atrium');
 for(let iter=0;iter<180;iter++){
  const force=new Map(movable.map(r=>[r.id,{x:0,z:0}]));
  for(let i=0;i<movable.length;i++)for(let j=i+1;j<movable.length;j++){
   const a=movable[i],b=movable[j],dx=a.x-b.x,dz=a.z-b.z,d=Math.hypot(dx,dz)+.001;
   const required=Math.hypot(a.width/2,a.depth/2)+Math.hypot(b.width/2,b.depth/2)+.65;
   if(d<required){const f=(required-d)*.055;force.get(a.id)!.x+=dx/d*f;force.get(a.id)!.z+=dz/d*f;force.get(b.id)!.x-=dx/d*f;force.get(b.id)!.z-=dz/d*f;}
   const w=weights.get([a.id,b.id].sort().join('|'))||0;
   if(w){const target=required+1.5,af=(d-target)*Math.min(.003,.0008*w);force.get(a.id)!.x-=dx/d*af;force.get(a.id)!.z-=dz/d*af;force.get(b.id)!.x+=dx/d*af;force.get(b.id)!.z+=dz/d*af;}
  }
  const rate=.8*(1-iter/220);
  for(const r of movable){const f=force.get(r.id)!;const d=Math.hypot(r.x,r.z)||1;const radial=(d-ringRadius)*.012;r.x=clamp(r.x+(f.x-r.x/d*radial)*rate,-20,20);r.z=clamp(r.z+(f.z-r.z/d*radial)*rate,-20,20);}
 }
 for(const r of movable){r.x=Number(r.x.toFixed(3));r.z=Number(r.z.toFixed(3));}
}

function forceLayout(ids:string[],relations:KnowledgeUnderstanding['relations'],byId:Map<string,KnowledgeUnderstanding['concepts'][number]>,width:number,depth:number){
 const n=ids.length,positions=ids.map((id,i)=>{const a=2*Math.PI*i/Math.max(1,n),r=.65+Math.floor(i/8)*.3;return {x:Math.cos(a)*r,z:Math.sin(a)*r};});
 const index=new Map(ids.map((id,i)=>[id,i]));
 const edges=relations.filter(r=>index.has(r.from)&&index.has(r.to)).map(r=>({a:index.get(r.from)!,b:index.get(r.to)!,w:r.type==='depends_on'||r.type==='sequence_before'||r.type==='part_of'?1.7:1}));
 const halfW=width/2-.9,halfD=depth/2-.9;
 for(let iter=0;iter<90;iter++){
  const forces=positions.map(()=>({x:0,z:0}));
  for(let i=0;i<n;i++)for(let j=i+1;j<n;j++){
   let dx=positions[i].x-positions[j].x,dz=positions[i].z-positions[j].z;let d2=dx*dx+dz*dz+.04;const f=1.1/d2;dx*=f;dz*=f;forces[i].x+=dx;forces[i].z+=dz;forces[j].x-=dx;forces[j].z-=dz;
  }
  for(const e of edges){const a=positions[e.a],b=positions[e.b],dx=b.x-a.x,dz=b.z-a.z,d=Math.sqrt(dx*dx+dz*dz)+.001,target=1.45/e.w,f=(d-target)*.035;forces[e.a].x+=dx/d*f;forces[e.a].z+=dz/d*f;forces[e.b].x-=dx/d*f;forces[e.b].z-=dz/d*f;}
  const rate=.12*(1-iter/110);
  for(let i=0;i<n;i++){positions[i].x=clamp(positions[i].x+forces[i].x*rate,-halfW,halfW);positions[i].z=clamp(positions[i].z+forces[i].z*rate,-halfD,halfD);}
 }
 return positions;
}
export function compileMemoryArchitecture(k:KnowledgeUnderstanding,options:{optimizeGroupOrder?:boolean}={}):MemoryArchitecture{
 const concepts=k.concepts.slice(0,40),byId=new Map(concepts.map(c=>[c.id,c]));
 const groups=splitGroups(concepts.map(c=>c.id),k.relations,byId);
 const rooms:SpatialRoom[]=[{id:'atrium',title:roomStyle.atrium.title,kind:'atrium',conceptIds:[],x:0,z:0,width:7.5,depth:7.5,floorColor:roomStyle.atrium.color}];
 const roomGroups=groups.map((g,i)=>({...g,index:i}));
 if(options.optimizeGroupOrder!==false)optimizeGroupOrder(roomGroups,k.relations);
 const n=roomGroups.length;
 const maxRoomRadius=roomGroups.reduce((m,g)=>{const w=clamp(5.6+g.ids.length*.36,6,9),d=clamp(5.4+g.ids.length*.32,6,8.8);return Math.max(m,Math.hypot(w/2,d/2));},0);
 const minCenterDistance=maxRoomRadius*2+.65;
 const ringRadius=n<=1?0:Math.max(n<=2?9.2:n<=4?11:n<=6?12.8:15,minCenterDistance/(2*Math.sin(Math.PI/n))*1.08);
 const kindOccurrences=new Map<RoomKind,number>();
 roomGroups.forEach((g,i)=>{
  const angle=-Math.PI/2+2*Math.PI*i/Math.max(1,n);
  const width=clamp(5.6+g.ids.length*.36,6,9),depth=clamp(5.4+g.ids.length*.32,6,8.8);
  const style=roomStyle[g.kind],occurrence=(kindOccurrences.get(g.kind)||0)+1;kindOccurrences.set(g.kind,occurrence);
  rooms.push({id:`room-${i+1}`,title:roomGroups.filter(x=>x.kind===g.kind).length>1?`${style.title} ${occurrence}`:style.title,kind:g.kind,conceptIds:g.ids,x:Number((Math.cos(angle)*ringRadius).toFixed(3)),z:Number((Math.sin(angle)*ringRadius).toFixed(3)),width,depth,floorColor:style.color});
 });
 optimizeRoomPositions(rooms,roomGroups,k.relations,ringRadius);
 const placements:SpatialPlacement[]=[];
 for(const room of rooms.slice(1)){
  const local=forceLayout(room.conceptIds,k.relations,byId,room.width,room.depth);
  room.conceptIds.forEach((id,i)=>placements.push({conceptId:id,roomId:room.id,localX:Number(local[i].x.toFixed(3)),localZ:Number(local[i].z.toFixed(3)),x:Number((room.x+local[i].x).toFixed(3)),z:Number((room.z+local[i].z).toFixed(3))}));
 }
 const roomByConcept=new Map(placements.map(p=>[p.conceptId,p.roomId]));
 const linkMap=new Map<string,{fromRoomId:string;toRoomId:string;types:Set<string>;weight:number}>();
 for(const rel of k.relations){const a=roomByConcept.get(rel.from),b=roomByConcept.get(rel.to);if(!a||!b||a===b)continue;const key=[a,b].sort().join('|');if(!linkMap.has(key))linkMap.set(key,{fromRoomId:a,toRoomId:b,types:new Set(),weight:0});const l=linkMap.get(key)!;l.types.add(rel.type);l.weight+=1;}
 const doors:SpatialDoor[]=[...linkMap.values()].map(x=>({fromRoomId:x.fromRoomId,toRoomId:x.toRoomId,relationTypes:[...x.types].sort(),weight:x.weight}));
 for(const room of rooms.slice(1))doors.push({fromRoomId:'atrium',toRoomId:room.id,relationTypes:['main_route'],weight:1});
 const degree=new Map(concepts.map(c=>[c.id,0]));for(const r of k.relations){if(degree.has(r.from))degree.set(r.from,degree.get(r.from)!+1);if(degree.has(r.to))degree.set(r.to,degree.get(r.to)!+1);}
 const isolatedConcepts=[...degree.values()].filter(v=>v===0).length;
 const placementById=new Map(placements.map(p=>[p.conceptId,p]));
 const relatedDistances=k.relations.map(r=>{const a=placementById.get(r.from),b=placementById.get(r.to);if(!a||!b)return null;return Math.hypot(a.x-b.x,a.z-b.z);}).filter((x):x is number=>x!==null);
 const meanRelatedDistance=relatedDistances.length?relatedDistances.reduce((a,b)=>a+b,0)/relatedDistances.length:0;
 const overlapViolations=placements.reduce((sum,p,i)=>sum+placements.slice(i+1).filter(q=>Math.hypot(p.x-q.x,p.z-q.z)<.95).length,0);
 const roomOverlapViolations=rooms.slice(1).reduce((sum,a,i)=>sum+rooms.slice(i+2).filter(b=>Math.abs(a.x-b.x)<(a.width+b.width)/2&&Math.abs(a.z-b.z)<(a.depth+b.depth)/2).length,0);
 const remaining=rooms.slice(1),routeRooms:SpatialRoom[]=[];
 let cursor={x:0,z:0};
 while(remaining.length){remaining.sort((a,b)=>Math.hypot(a.x-cursor.x,a.z-cursor.z)-Math.hypot(b.x-cursor.x,b.z-cursor.z)||a.id.localeCompare(b.id));const next=remaining.shift()!;routeRooms.push(next);cursor={x:next.x,z:next.z};}
 const route=['atrium',...routeRooms.map(r=>r.id),'atrium'];
 let routeLength=0,cursorPoint={x:0,z:0};
 for(const room of routeRooms){routeLength+=Math.hypot(room.x-cursorPoint.x,room.z-cursorPoint.z);cursorPoint={x:room.x,z:room.z};}
 routeLength+=Math.hypot(cursorPoint.x,cursorPoint.z);
 const objective=Number((meanRelatedDistance+overlapViolations*4+roomOverlapViolations*20+isolatedConcepts*.15+routeLength*.012).toFixed(4));
 return {version:'1.1',title:k.title,domain:k.domain,rooms,doors,placements,route,metrics:{concepts:concepts.length,rooms:rooms.length,interRoomLinks:doors.length,isolatedConcepts,meanRelatedDistance:Number(meanRelatedDistance.toFixed(3)),overlapViolations,roomOverlapViolations,routeLength:Number(routeLength.toFixed(3))},objective};
}
export function validateMemoryArchitecture(plan:unknown,conceptIds:string[]){
 const errors:string[]=[];
 if(!plan||typeof plan!=='object'||Array.isArray(plan))return {valid:false,errors:['plan must be an object']};
 const p=plan as MemoryArchitecture;
 if(p.version!=='1.1')errors.push('unsupported architecture version');
 if(!Array.isArray(p.rooms)||!p.rooms.some(r=>r?.id==='atrium'))errors.push('central atrium missing');
 if(Array.isArray(p.rooms)){
  const roomIds=p.rooms.map(r=>r?.id);
  if(new Set(roomIds).size!==roomIds.length)errors.push('duplicate room ids');
  for(const r of p.rooms)if(!r||typeof r.id!=='string'||!Number.isFinite(r.x)||!Number.isFinite(r.z)||!Number.isFinite(r.width)||!Number.isFinite(r.depth)||r.width<3||r.depth<3)errors.push(`invalid room:${r?.id??'unknown'}`);
 }else errors.push('rooms missing');
 if(!Array.isArray(p.placements))errors.push('placements missing');
 else{
  const ids=p.placements.map(x=>x?.conceptId);
  if(new Set(ids).size!==ids.length)errors.push('duplicate concept placements');
  for(const id of conceptIds)if(!ids.includes(id))errors.push(`concept not placed:${id}`);
  for(const id of ids)if(!conceptIds.includes(id))errors.push(`unknown concept placed:${id}`);
  for(const x of p.placements)if(!x||!Number.isFinite(x.x)||!Number.isFinite(x.z)||!p.rooms?.some(r=>r.id===x.roomId))errors.push(`invalid placement:${x?.conceptId??'unknown'}`);
 }
 if(Array.isArray(p.rooms)&&Array.isArray(p.placements)){
  for(const r of p.rooms){
   const members=r.conceptIds??[];
   if(new Set(members).size!==members.length)errors.push(`duplicate room membership:${r.id}`);
   for(const id of members)if(!p.placements.some(x=>x.conceptId===id&&x.roomId===r.id))errors.push(`room membership mismatch:${r.id}:${id}`);
  }
  for(const placement of p.placements)if(!p.rooms.some(r=>r.id===placement.roomId&&(r.conceptIds??[]).includes(placement.conceptId)))errors.push(`placement missing from room membership:${placement.conceptId}`);
 }
 if(!Array.isArray(p.doors)||!Array.isArray(p.route))errors.push('doors or route missing');
 else{
  const roomIds=new Set((p.rooms??[]).map(r=>r.id));
  for(const d of p.doors)if(!roomIds.has(d.fromRoomId)||!roomIds.has(d.toRoomId)||d.fromRoomId===d.toRoomId||!Number.isFinite(d.weight)||d.weight<=0)errors.push('invalid door endpoint or weight');
  for(const id of p.route)if(!roomIds.has(id))errors.push(`invalid route room:${id}`);
  if(p.route[0]!=='atrium')errors.push('route must start at atrium');
  const routeRooms=p.route.filter(id=>id!=='atrium');
  const expectedRooms=(p.rooms??[]).filter(r=>r.id!=='atrium').map(r=>r.id);
  if(new Set(routeRooms).size!==routeRooms.length||expectedRooms.some(id=>!routeRooms.includes(id)))errors.push('route must visit each non-atrium room exactly once');
 }
 if(Array.isArray(p.rooms)){
  const actualRoomOverlaps=p.rooms.filter(r=>r.id!=='atrium').reduce((sum,a,i,arr)=>sum+arr.slice(i+1).filter(b=>Math.abs(a.x-b.x)<(a.width+b.width)/2&&Math.abs(a.z-b.z)<(a.depth+b.depth)/2).length,0);
  if(p.metrics?.roomOverlapViolations!==actualRoomOverlaps)errors.push('room overlap metric mismatch');
 }
 if(p.metrics?.concepts!==conceptIds.length)errors.push('concept count metric mismatch');
 if(!Number.isFinite(p.objective)||!Number.isFinite(p.metrics?.routeLength)||!Number.isFinite(p.metrics?.meanRelatedDistance)||!Number.isFinite(p.metrics?.roomOverlapViolations))errors.push('invalid objective metrics');
 return {valid:errors.length===0,errors};
}
