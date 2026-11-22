import {mathInfo,ungroup} from './math.ts';
import type {Ast} from './math.ts';
import {createHash,randomUUID} from 'node:crypto';
import {checked,parseSchema,EngineError} from './schema.ts';
import type {Draft,Knowledge} from './schema.ts';
import type {Model} from './model.ts';
export const POISSON=String.raw`P(X=k)=\frac{\lambda^k e^{-\lambda}}{k!}`;
const poissonDraft:Draft={title:'泊松分布（公式）',atoms:[
  {id:'a1',text:String.raw`\lambda^k`,evidence:String.raw`\lambda^k`,role:'numerator'},
  {id:'a2',text:String.raw`e^{-\lambda}`,evidence:String.raw`e^{-\lambda}`,role:'numerator'},
  {id:'a3',text:'k!',evidence:'k!',role:'denominator'}
]};
function digest(v:unknown){return createHash('sha256').update(JSON.stringify(v)).digest('hex');}
export function verifyDraft(source:string,value:unknown):Draft{
  const draft=checked<Draft>(parseSchema,value);
  if(draft.atoms.length<1||draft.atoms.length>12)throw new EngineError('ATOM_COUNT','Require 1–12 atoms',422);
  const ids=new Set<string>();for(const a of draft.atoms){if(!/^a[1-9][0-9]?$/.test(a.id)||ids.has(a.id))throw new EngineError('ATOM_ID','Invalid or duplicate atom ID',422);ids.add(a.id);if(a.text!==a.evidence||!source.includes(a.evidence))throw new EngineError('EVIDENCE_MISMATCH','Atom not verbatim in source: '+a.id,422);}
  return draft;
}
// Deterministic atom extraction for a top-level fraction; no invented source text.
function fractionDraft(source:string,ast:Ast):Draft|null {
  const root=ungroup(ast);const rhs=ungroup(root.kind==='eq'?root.right:root);
  if(rhs.kind!=='div')return null;
  const factors=(a:Ast):Ast[]=>{a=ungroup(a);return a.kind==='mul'?[...factors(a.left),...factors(a.right)]:[a];};
  const nodes=[...factors(rhs.left).map(node=>({node,role:'numerator' as const})),...factors(rhs.right).map(node=>({node,role:'denominator' as const}))];
  if(nodes.length>12)return null;
  return {title:'待核实公式',atoms:nodes.map(({node,role},i)=>{const text=source.slice(node.start,node.end);return {id:`a${i+1}`,text,evidence:text,role};})};
}
export async function parseKnowledge(source:string,model:Model):Promise<Knowledge>{
  if(typeof source!=='string'||source.trim().length===0||source.length>2000)throw new EngineError('SOURCE_INVALID','Source must contain 1–2000 characters');
  // Exact fixture matching only; never treat similar-looking formulas as verified.
  const fixture=source===POISSON;
  const looksMath=/[=^+*/!\\{}]|[λπ]/.test(source);const math=looksMath?mathInfo(source):undefined;
  const draft=verifyDraft(source,fixture?structuredClone(poissonDraft):((math?.status==='parsed'&&fractionDraft(source,math.ast))||await model.parse(source)));
  return {id:randomUUID(),source,title:draft.title,atoms:draft.atoms,status:fixture?'verified_fixture':'needs_review',revision:digest({source,draft}),...(math?{math}:{})};
}
export function approveKnowledge(k:Knowledge,revision:string):Knowledge{
  if(k.revision!==revision)throw new EngineError('STALE_REVISION','Knowledge revision mismatch',409);
  return {...k,status:k.status==='verified_fixture'?k.status:'user_confirmed'};
}
