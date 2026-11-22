import type {Role} from './schema.ts';
export const catalogVersion='1';
// Primitive asset descriptors. A frontend can render these without downloading GLB assets.
export const assets=[
  {id:'counter',shape:'box',color:'#66BBD1',roles:['numerator','meaning','general']},
  {id:'power-tower',shape:'cylinder',color:'#D1A14C',roles:['numerator','general']},
  {id:'minus-sign',shape:'box',color:'#E46C6C',roles:['numerator','general']},
  {id:'factorial-queue',shape:'sphere',color:'#9877D1',roles:['denominator','general']},
  {id:'balance',shape:'box',color:'#59AB83',roles:['numerator','denominator','relation','general']},
  {id:'gate',shape:'box',color:'#B3A794',roles:['condition','relation','general']},
  {id:'board',shape:'box',color:'#8E9DB9',roles:['numerator','denominator','condition','meaning','relation','general']}
] as const;
export function validAsset(id:string,role:Role){return assets.some(a=>a.id===id&&(a.roles as readonly string[]).includes(role));}
