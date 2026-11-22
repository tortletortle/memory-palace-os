// Bounded, exact symbolic checker. No eval, floating point, or external CAS.
export type Ast = {kind:'int'|'decimal'|'symbol';value:string;start:number;end:number} | {kind:'neg'|'factorial'|'exp'|'group';arg:Ast;start:number;end:number} | {kind:'add'|'sub'|'mul'|'div'|'pow'|'eq';left:Ast;right:Ast;start:number;end:number} | {kind:'probability';arg:Ast;start:number;end:number};
class MathLimit extends Error {}
type Token={v:string;s:number;e:number};
function tokenize(s:string):Token[]{
  if(s.length>2000)throw new MathLimit('expression too long'); const out:Token[]=[]; const latexPairs:string[]=[]; let i=0;
  while(i<s.length){const start=i;const c=s[i];if(/\s/.test(c)){i++;continue;}let v:string;
    if(c==='\\'){const m=s.slice(i).match(/^\\[A-Za-z]+/);if(!m)throw new MathLimit('unsupported LaTeX escape');i+=m[0].length;const cmd=m[0].slice(1);if(['left','right'].includes(cmd)){const delim=s.slice(i).match(/^\s*([()])/);if(!delim)throw new MathLimit('unsupported delimiter');if(cmd==='left'){if(delim[1]!=='(')throw new MathLimit('expected left parenthesis');latexPairs.push('(');}else if(delim[1]!==')'||!latexPairs.pop())throw new MathLimit('unmatched right delimiter');continue;}if(['cdot','times'].includes(cmd))v='*';else if(['frac','exp'].includes(cmd))v='\\'+cmd;else if(['alpha','beta','gamma','delta','epsilon','theta','lambda','mu','nu','pi','rho','sigma','tau','phi','omega','Lambda','Sigma'].includes(cmd))v=cmd;else throw new MathLimit(`unsupported LaTeX command: ${cmd}`);}
    else if(/[0-9.]/.test(c)){const m=s.slice(i).match(/^(?:\d+(?:\.\d+)?|\.\d+)/);if(!m)throw new MathLimit('invalid number');v=m[0];i+=v.length;if(v.length>40)throw new MathLimit('numeric literal too long');}
    else if(/[A-Za-z]/.test(c)){v=s.slice(i).match(/^[A-Za-z][A-Za-z0-9_]*/)![0];i+=v.length;}
    else if('+-*/^!(){}='.includes(c)){v=c;i++;}
    else if('−×·÷'.includes(c)){v=({'−':'-','×':'*','·':'*','÷':'/'} as Record<string,string>)[c];i++;}
    else if('αλβγδεθμνπρστφωΛΣ'.includes(c)){v=({α:'alpha',λ:'lambda',β:'beta',γ:'gamma',δ:'delta',ε:'epsilon',θ:'theta',μ:'mu',ν:'nu',π:'pi',ρ:'rho',σ:'sigma',τ:'tau',φ:'phi',ω:'omega',Λ:'Lambda',Σ:'Sigma'} as Record<string,string>)[c];i++;}
    else throw new MathLimit(`unsupported character at ${i}`);
    out.push({v,s:start,e:i});if(out.length>192)throw new MathLimit('token limit');
  }if(latexPairs.length)throw new MathLimit('unmatched left delimiter');out.push({v:'<end>',s:i,e:i});return out;
}
const numeric=(v:string)=>/^(?:\d|\.\d)/.test(v);const ident=(v:string)=>/^[A-Za-z][A-Za-z0-9_]*$/.test(v);
class Parser{
 private i=0; private depth=0; private readonly ts:Token[]; constructor(ts:Token[]){this.ts=ts;}
 peek(){return this.ts[this.i].v;} take(){return this.ts[this.i++];} expect(v:string){if(this.peek()!==v)throw new MathLimit(`expected ${v}`);return this.take();}
 nest<T>(f:()=>T):T{if(++this.depth>40)throw new MathLimit('nesting limit');try{return f();}finally{this.depth--;}}
 bin(kind:'add'|'sub'|'mul'|'div'|'pow'|'eq',left:Ast,right:Ast):Ast{return {kind,left,right,start:left.start,end:right.end};}
 parse():Ast{const a=this.eq();this.expect('<end>');return a;}
 eq():Ast{const a=this.sum();if(this.peek()==='='){this.take();return this.bin('eq',a,this.sum());}return a;}
 sum():Ast{let a=this.product();while(['+','-'].includes(this.peek())){const op=this.take().v;a=this.bin(op==='+'?'add':'sub',a,this.product());}return a;}
 product():Ast{let a=this.unary();for(;;){const p=this.peek();if(p==='*'||p==='/'){this.take();a=this.bin(p==='*'?'mul':'div',a,this.unary());}else if(p==='('||p==='{'||p==='\\frac'||p==='\\exp'||ident(p)||numeric(p)){if(numeric(p)&&['int','decimal'].includes(a.kind))throw new MathLimit('adjacent numbers');if(a.kind==='div'&&!this.ts.some(t=>t.s===a.start&&t.v==='\\frac'))throw new MathLimit('ambiguous implicit product after slash; use parentheses or explicit *');a=this.bin('mul',a,this.unary());}else return a;}}
 unary():Ast{return this.nest(()=>{if(this.peek()==='-'){const t=this.take(),arg=this.unary();return {kind:'neg',arg,start:t.s,end:arg.end};}if(this.peek()==='+'){this.take();return this.unary();}return this.power();});}
 power():Ast{let a=this.primary();while(this.peek()==='!'){const t=this.take();a={kind:'factorial',arg:a,start:a.start,end:t.e};if(this.peek()==='!')throw new MathLimit('double factorial not supported');}if(this.peek()==='^'){this.take();a=this.bin('pow',a,this.unary());}return a;}
 group(open:string,allowEq=false):Ast{const t=this.expect(open),arg=this.nest(()=>allowEq?this.eq():this.sum()),end=this.expect(open==='('?')':'}');return {kind:'group',arg,start:t.s,end:end.e};}
 primary():Ast{const p=this.peek();if(p==='('||p==='{')return this.group(p);const t=this.take();if(t.v==='\\frac'){const left=this.group('{'),right=this.group('{');return {kind:'div',left,right,start:t.s,end:right.end};}
 if(t.v==='exp'||t.v==='\\exp'||t.v==='P'){if(t.v==='P'&&this.peek()!=='(')return {kind:'symbol',value:t.v,start:t.s,end:t.e};if(!['(','{'].includes(this.peek()))throw new MathLimit('function needs grouped argument');const arg=this.group(this.peek(),t.v==='P');return {kind:t.v==='P'?'probability':'exp',arg,start:t.s,end:arg.end};}
 if(numeric(t.v))return {kind:t.v.includes('.')?'decimal':'int',value:t.v,start:t.s,end:t.e};if(ident(t.v)){if(['sin','cos','tan','ln','log','sqrt','abs','lim','sum','integral'].includes(t.v)||this.peek()==='('&&t.v.length>1)throw new MathLimit('unsupported function');return {kind:'symbol',value:t.v,start:t.s,end:t.e};}throw new MathLimit('expected an expression');}
}
export function parseMath(source:string):Ast{if(typeof source!=='string'||!source.trim())throw new MathLimit('empty expression');return new Parser(tokenize(source)).parse();}
export function ungroup(a:Ast):Ast{while(a.kind==='group')a=a.arg;return a;}
// Structural key deliberately omits source spans and grouping.
function keyTree(a:Ast):unknown{a=ungroup(a);if('value'in a)return [a.kind,a.value];if('arg'in a)return [a.kind,keyTree(a.arg)];if('left'in a)return [a.kind,keyTree(a.left),keyTree(a.right)];throw new MathLimit('invalid AST');}
export function structuralKey(a:Ast):string{return JSON.stringify(keyTree(a));}
type Poly=Map<string,bigint>;type Rational={n:Poly;d:Poly};
const ONE='[]';const constant=(v:bigint):Poly=>new Map(v===0n?[]:[[ONE,v]]);const variable=(v:string):Poly=>new Map([[JSON.stringify([v]),1n]]);
class Budget{ops=0;guards=new Set<string>();opaque=false;readonly assignment?:Record<string,number>;constructor(assignment?:Record<string,number>){this.assignment=assignment;}tick(n=1){this.ops+=n;if(this.ops>45000)throw new MathLimit('symbolic operation budget');}}
function set(p:Poly,k:string,v:bigint){if(v.toString().length>300)throw new MathLimit('coefficient limit');if(v===0n)p.delete(k);else p.set(k,v);if(p.size>256)throw new MathLimit('polynomial term limit');}
function add(a:Poly,b:Poly,ctx:Budget,sign=1n):Poly{const m=new Map(a);for(const [k,v]of b){ctx.tick();set(m,k,(m.get(k)??0n)+v*sign);}return m;}
function mul(a:Poly,b:Poly,c:Budget):Poly{const m:Poly=new Map();for(const [ak,av]of a)for(const [bk,bv]of b){c.tick();const terms=[...JSON.parse(ak),...JSON.parse(bk)].sort();if(terms.length>48)throw new MathLimit('degree limit');const k=JSON.stringify(terms);set(m,k,(m.get(k)??0n)+av*bv);}return m;}
function sorted(p:Poly){return [...p].sort(([a],[b])=>a<b?-1:a>b?1:0);}
function gcd(a:bigint,b:bigint):bigint{a=a<0n?-a:a;b=b<0n?-b:b;while(b){[a,b]=[b,a%b];}return a;}
function guardNonzero(p:Poly,c:Budget){if(!p.size)throw new MathLimit('division by identically zero expression');if(p.size===1){const [key]=p.keys();const factors=JSON.parse(key) as string[];for(const factor of new Set(factors)){if(factor==='EulerE'||factor.startsWith('opaque:["factorial",')||factor.startsWith('opaque:["exp",'))continue;c.guards.add('nonzero-factor:'+factor);}return;}if([...p.keys()].every(k=>(JSON.parse(k) as string[]).every(v=>v==='EulerE')))return;const t=sorted(p);const g=t.reduce((a,[,v])=>gcd(a,v),0n)*(t[0][1]<0n?-1n:1n);c.guards.add('nonzero:'+JSON.stringify(t.map(([k,v])=>[k,(v/g).toString()])));}
const rat=(n:Poly,d=constant(1n)):Rational=>({n,d});
function pow(r:Rational,n:bigint,c:Budget):Rational{if(n>16n||n< -16n)throw new MathLimit('integer exponent limit');if(n<=0n)guardNonzero(r.n,c);if(n<0n){r={n:r.d,d:r.n};n=-n;}let out=rat(constant(1n));while(n>0n){if(n%2n)out=rat(mul(out.n,r.n,c),mul(out.d,r.d,c));n/=2n;if(n)r=rat(mul(r.n,r.n,c),mul(r.d,r.d,c));}return out;}
function constInt(r:Rational):bigint|null{if(r.n.size>1||(r.n.size===1&&!r.n.has(ONE))||r.d.size!==1||!r.d.has(ONE))return null;const n=r.n.get(ONE)??0n,d=r.d.get(ONE)!;return d!==0n&&n%d===0n?n/d:null;}
function opaque(a:Ast,c:Budget,guard:boolean,key=structuralKey(a)):Rational{if(c.assignment)throw new MathLimit('witness requires integer powers/factorials and no unsupported constants');c.opaque=true;if(guard)c.guards.add('defined:'+key);return rat(variable('opaque:'+key));}
function euler(c:Budget):Rational{if(!c.assignment)c.opaque=true;return rat(variable('EulerE'));}
function expNorm(a:Ast,c:Budget):Rational{const arg=norm(a,c),n=constInt(arg);if(n!==null){if(n===0n)return rat(constant(1n));return pow(euler(c),n,c);}return opaque(a,c,false,JSON.stringify(['exp',structuralKey(a)]));}
function norm(raw:Ast,c:Budget):Rational{c.tick();const a=ungroup(raw);
 switch(a.kind){case'int':return rat(constant(BigInt(a.value)));case'decimal':{const [i,f]=a.value.split('.');return rat(constant(BigInt((i||'0')+f)),constant(10n**BigInt(f.length)));}
 case'symbol':{if(a.value==='e')return euler(c);if(a.value==='pi')return opaque(a,c,false);if(c.assignment){if(!Object.hasOwn(c.assignment,a.value))throw new MathLimit('unassigned variable');return rat(constant(BigInt(c.assignment[a.value])));}return rat(variable('symbol:'+a.value));}
 case'neg':{const r=norm(a.arg,c);return rat(mul(constant(-1n),r.n,c),r.d);}
 case'factorial':{const arg=norm(a.arg,c),v=constInt(arg);if(v!==null){if(v<0n||v>30n)throw new MathLimit('factorial outside 0..30');let f=1n;for(let i=2n;i<=v;i++)f*=i;return rat(constant(f));}return opaque(a,c,true);}
 case'exp':return expNorm(a.arg,c);
 case'pow':{const b=ungroup(a.left);if(b.kind==='symbol'&&b.value==='e')return expNorm(a.right,c);const right=norm(a.right,c),n=constInt(right),left=norm(a.left,c);if(n!==null)return pow(left,n,c);return opaque(a,c,true);}
 case'add':case'sub':case'mul':case'div':{const l=norm(a.left,c),r=norm(a.right,c);if(a.kind==='mul')return rat(mul(l.n,r.n,c),mul(l.d,r.d,c));if(a.kind==='div'){guardNonzero(r.n,c);return rat(mul(l.n,r.d,c),mul(l.d,r.n,c));}return rat(add(mul(l.n,r.d,c),mul(r.n,l.d,c),c,a.kind==='add'?1n:-1n),mul(l.d,r.d,c));}
 default:throw new MathLimit('equations or probability expressions are only supported as matching left-hand labels');}
}
export type Equivalence={status:'equivalent'|'not_equivalent'|'inconclusive';reason:string;method:'exact-rational-polynomial'|'exact-counterexample'|'unsupported';guards:{left:string[];right:string[]};witness?:Record<string,number>};
function symbols(a:Ast,out:Set<string>){a=ungroup(a);if(a.kind==='symbol'&&!['e','pi'].includes(a.value))out.add(a.value);if('arg'in a)symbols(a.arg,out);if('left'in a){symbols(a.left,out);symbols(a.right,out);}}
// Exact witness: integer substitutions; non-integer powers, pi, etc. are skipped.
// The only residual indeterminate is EulerE. A nonzero integer polynomial in e
// cannot vanish because e is transcendental. Thus no floating-point tolerance.
function exactWitness(a:Ast,b:Ast,filter?:(assignment:Record<string,number>)=>boolean):Record<string,number>|undefined{const vars=new Set<string>();symbols(a,vars);symbols(b,vars);const names=[...vars].sort();if(names.length>12)return;const patterns=[0,1,2,3,-1,-2,4,5];for(let i=0;i<patterns.length;i++){const assignment=Object.fromEntries(names.map((n,j)=>[n,i<6?patterns[i]:(j%3)+1+(i-6)]));if(filter&&!filter(assignment))continue;try{const l=new Budget(assignment),r=new Budget(assignment),x=norm(a,l),y=norm(b,r),c=new Budget();if(add(mul(x.n,y.d,c),mul(y.n,x.d,c),c,-1n).size)return assignment;}catch{/* Outside supported witness domain; skip. */}}}
export function compareMath(left:string,right:string,options:{witness?:boolean; witnessFilter?:(assignment:Record<string,number>)=>boolean}={}):Equivalence{const l=new Budget(),r=new Budget();const result=(status:Equivalence['status'],reason:string,method:Equivalence['method']='exact-rational-polynomial'):Equivalence=>({status,reason,method,guards:{left:[...l.guards].sort(),right:[...r.guards].sort()}});try{let a=ungroup(parseMath(left)),b=ungroup(parseMath(right));if(a.kind==='eq'||b.kind==='eq'){if(a.kind!=='eq'||b.kind!=='eq'||structuralKey(a.left)!==structuralKey(b.left))return result('inconclusive','Different equation labels; equation-solving is not supported','unsupported');a=a.right;b=b.right;}
 const x=norm(a,l),y=norm(b,r);const sameDomain=JSON.stringify([...l.guards].sort())===JSON.stringify([...r.guards].sort());
 const c=new Budget();const diff=add(mul(x.n,y.d,c),mul(y.n,x.d,c),c,-1n);if(sameDomain&&!diff.size)return result('equivalent','Exact identity on the shared domain of the supported expression semantics');if(sameDomain&&!l.opaque&&!r.opaque)return result('not_equivalent','Distinct rational polynomials over real variables with matching nonzero guards');
 if(options.witness!==false){const witness=exactWitness(a,b,options.witnessFilter);if(witness!==undefined)return {...result('not_equivalent','Exact integer substitution separates the expressions (rational arithmetic or transcendence of e)','exact-counterexample'),witness};}
 return result('inconclusive',!sameDomain?'Definedness guards differ; no cancellation across domains':'Distinct normal forms with opaque functions; no proof of inequality');
 }catch(e){return result('inconclusive',e instanceof Error?e.message:'Unsupported expression','unsupported');}}
export function mathInfo(source:string):{status:'parsed';ast:Ast}|{status:'unsupported';reason:string}{try{return {status:'parsed',ast:parseMath(source)};}catch(e){return {status:'unsupported',reason:e instanceof Error?e.message:'unsupported'};}}
