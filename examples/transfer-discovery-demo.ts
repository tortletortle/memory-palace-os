
import { discoverStrategies } from '../src/cognition/strategy-discovery.ts';
import { createTransferGenome } from '../src/cognition/transfer-graph.ts';
const input='泊松分布概率公式，变量lambda，回忆公式并比较指数变化。';
console.log(JSON.stringify(discoverStrategies(input,createTransferGenome('v08-test',['spatial-route','symbol-anchor','causal-chain','contrastive-pair','semantic-boundary','mechanism-simulation','retrieval-cue','timeline-sequence','hierarchy-chunk','analogy-bridge']),18),null,2));
