import { compileMemoryArchitecture } from '../src/spatial/space-compiler.ts';
import type { KnowledgeUnderstanding } from '../src/knowledge-understanding-types.ts';
const features=Object.fromEntries(['spatial','symbolic','causal','sequential','hierarchical','contrastive','analogical','dynamic','retrieval','semantic'].map(x=>[x,.5])) as any;
const concepts=Array.from({length:18},(_,i)=>({id:`c${i}`,label:`知识${i}`,kind:['concept','formula','condition','procedure','mechanism','example'][i%6] as any,evidenceQuote:`知识${i}`}));
const relations=Array.from({length:17},(_,i)=>({from:`c${i}`,to:`c${i+1}`,type:['uses','depends_on','sequence_before'][i%3] as any,evidenceQuote:`知识${i}关联知识${i+1}`}));
const fixture:KnowledgeUnderstanding={title:'synthetic-layout-stress',domain:'probability',summary:'',concepts,relations,features,uncertaintyNotes:[]};
const baseline=compileMemoryArchitecture(fixture,{optimizeGroupOrder:false});
const optimized=compileMemoryArchitecture(fixture);
const stressConcepts=Array.from({length:40},(_,i)=>({id:`s${i}`,label:`压力概念${i}`,kind:['concept','formula','condition'][i%3] as any,evidenceQuote:`压力概念${i}`}));
const stressRelations=Array.from({length:39},(_,i)=>({from:`s${i}`,to:`s${i+1}`,type:'depends_on' as any,evidenceQuote:`压力概念${i}依赖压力概念${i+1}`}));
const stress=compileMemoryArchitecture({...fixture,title:'40-concept-stress',concepts:stressConcepts,relations:stressRelations});
console.log(JSON.stringify({
 fixture:'18 concepts / 6 knowledge types / chain-like cross-type relations',
 baseline:{meanRelatedDistance:baseline.metrics.meanRelatedDistance,routeLength:baseline.metrics.routeLength,roomOverlapViolations:baseline.metrics.roomOverlapViolations,objective:baseline.objective},
 optimized:{meanRelatedDistance:optimized.metrics.meanRelatedDistance,routeLength:optimized.metrics.routeLength,roomOverlapViolations:optimized.metrics.roomOverlapViolations,objective:optimized.objective},
 delta:{meanRelatedDistance:Number((baseline.metrics.meanRelatedDistance-optimized.metrics.meanRelatedDistance).toFixed(3)),objective:Number((baseline.objective-optimized.objective).toFixed(4))},
 stress40:{concepts:stress.metrics.concepts,rooms:stress.metrics.rooms,interRoomLinks:stress.metrics.interRoomLinks,isolatedConcepts:stress.metrics.isolatedConcepts,objectOverlapViolations:stress.metrics.overlapViolations,roomOverlapViolations:stress.metrics.roomOverlapViolations,routeLength:stress.metrics.routeLength,objective:stress.objective}
},null,2));
