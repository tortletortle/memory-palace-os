
import test from 'node:test';
import assert from 'node:assert/strict';
import { extractKnowledgeFeatures } from '../src/cognition/knowledge-feature-extractor.ts';
import { discoverStrategies, detectNegativeTransfer } from '../src/cognition/strategy-discovery.ts';
import { createTransferGenome } from '../src/cognition/transfer-graph.ts';

test('extracts auditable features from probability formula notes',()=>{
 const p=extractKnowledgeFeatures('泊松分布概率公式，变量lambda，回忆公式并比较指数变化。');
 assert.equal(p.domain,'probability');
 assert.ok(p.features.symbolic>0);
 assert.ok(p.features.retrieval>0);
 assert.ok(p.evidence.symbolic?.length);
});
test('sparse text warns instead of pretending high confidence',()=>{
 const p=extractKnowledgeFeatures('hello');
 assert.ok(p.warnings.length>=1);
 assert.ok(p.confidence<0.5);
});
test('strategy discovery returns dependency-valid budgeted candidates',()=>{
 const g=createTransferGenome('v08-test',['spatial-route','symbol-anchor','causal-chain','contrastive-pair','semantic-boundary','mechanism-simulation','retrieval-cue','timeline-sequence','hierarchy-chunk','analogy-bridge']);
 const r=discoverStrategies('CMOS逻辑门电路的因果机制与步骤，使用图形空间记忆和回忆测试。',g,18);
 assert.equal(r.parsed.domain,'digital_logic');
 assert.ok(r.strategies.length>=1);
 assert.ok(r.strategies.every(s=>s.dependencyValid && s.costUnits<=18));
});
test('negative transfer requires sufficient evidence and material harm',()=>{
 const rows=detectNegativeTransfer([
  {sourceDomain:'history',targetDomain:'biology',geneId:'spatial-route',sourceUtility:.8,targetUtility:.6,sampleCount:20},
  {sourceDomain:'history',targetDomain:'biology',geneId:'causal-chain',sourceUtility:.8,targetUtility:.7,sampleCount:2}
 ]);
 assert.equal(rows[0].negativeTransfer,true);
 assert.equal(rows[1].negativeTransfer,false);
});
