// Safe maths expression compiler for graph plotting: no eval, only a known grammar.
const FUNCS = {
  sin: Math.sin, cos: Math.cos, tan: Math.tan, asin: Math.asin, acos: Math.acos, atan: Math.atan,
  arcsin: Math.asin, arccos: Math.acos, arctan: Math.atan, sinh: Math.sinh, cosh: Math.cosh, tanh: Math.tanh,
  sqrt: Math.sqrt, abs: Math.abs, ln: Math.log, log: Math.log10, log2: Math.log2, exp: Math.exp,
  floor: Math.floor, ceil: Math.ceil, round: Math.round, sign: Math.sign, sec: (x) => 1 / Math.cos(x), csc: (x) => 1 / Math.sin(x), cot: (x) => 1 / Math.tan(x),
};
const CONSTS = { pi: Math.PI, e: Math.E, π: Math.PI };

function tokenize(src) {
  const s = src.replace(/\s+/g, '').replace(/\*\*/g, '^').replace(/[×·]/g, '*').replace(/÷/g, '/').replace(/−/g, '-');
  const out = [];
  let i = 0;
  while (i < s.length) {
    const c = s[i];
    if (/[0-9.]/.test(c)) { let j = i; while (j < s.length && /[0-9.]/.test(s[j])) j++; if (s[j] === 'e' && /[0-9+-]/.test(s[j + 1] || '') && !/[a-z]/.test(s[j + 2] || '')) { j += 2; while (/[0-9]/.test(s[j] || '')) j++; } out.push({ t: 'num', v: parseFloat(s.slice(i, j)) }); i = j; continue; }
    if (/[a-zπ]/i.test(c)) {
      let j = i; while (j < s.length && /[a-zπ0-9]/i.test(s[j])) j++;
      let word = s.slice(i, j).toLowerCase();
      // split things like "2x" handled by implicit mult; split "xsin" etc.
      while (word) {
        const f = Object.keys(FUNCS).sort((a, b) => b.length - a.length).find((k) => word.startsWith(k));
        if (f) { out.push({ t: 'fn', v: f }); word = word.slice(f.length); continue; }
        if (word.startsWith('pi')) { out.push({ t: 'num', v: Math.PI }); word = word.slice(2); continue; }
        const ch = word[0];
        if (ch === 'x' || ch === 't') out.push({ t: 'var' });
        else if (ch in CONSTS) out.push({ t: 'num', v: CONSTS[ch] });
        else if (/[0-9]/.test(ch)) { let k = 0; while (/[0-9]/.test(word[k] || '')) k++; out.push({ t: 'num', v: parseFloat(word.slice(0, k)) }); word = word.slice(k); continue; }
        else throw new Error(`Unknown name “${ch}”. Use x as the variable.`);
        word = word.slice(1);
      }
      i = j; continue;
    }
    if ('+-*/^(),|!'.includes(c)) { out.push({ t: c }); i++; continue; }
    throw new Error(`Unexpected “${c}”`);
  }
  // implicit multiplication
  const res = [];
  for (let k = 0; k < out.length; k++) {
    const a = res[res.length - 1], b = out[k];
    if (a && (a.t === 'num' || a.t === 'var' || a.t === ')') && (b.t === 'num' || b.t === 'var' || b.t === 'fn' || b.t === '(')) res.push({ t: '*' });
    res.push(b);
  }
  return res;
}

export function compile(src) {
  const expr = String(src).replace(/^\s*(y|f\(x\))\s*=\s*/i, '');
  const toks = tokenize(expr);
  let p = 0;
  const peek = () => toks[p];
  const eat = (t) => { if (peek()?.t !== t) throw new Error(`Expected “${t}”`); p++; };
  function primary() {
    const tk = toks[p++];
    if (!tk) throw new Error('Expression ends too early');
    if (tk.t === 'num') return () => tk.v;
    if (tk.t === 'var') return (x) => x;
    if (tk.t === '(') { const e = add(); eat(')'); return e; }
    if (tk.t === '|') { const e = add(); eat('|'); return (x) => Math.abs(e(x)); }
    if (tk.t === 'fn') {
      const f = FUNCS[tk.v];
      let pow = null;
      if (peek()?.t === '^') { p++; pow = unary(); }
      const arg = peek()?.t === '(' ? (p++, (() => { const e = add(); eat(')'); return e; })()) : unary();
      return pow ? (x) => f(arg(x)) ** pow(x) : (x) => f(arg(x));
    }
    if (tk.t === '-') { const e = unary(); return (x) => -e(x); }
    throw new Error(`Unexpected “${tk.t}”`);
  }
  function postfix() {
    let e = primary();
    while (peek()?.t === '!') { p++; const inner = e; e = (x) => gamma(inner(x) + 1); }
    return e;
  }
  function power() {
    const base = postfix();
    if (peek()?.t === '^') { p++; const ex = unary(); return (x) => base(x) ** ex(x); }
    return base;
  }
  function unary() {
    if (peek()?.t === '-') { p++; const e = unary(); return (x) => -e(x); }
    if (peek()?.t === '+') { p++; return unary(); }
    return power();
  }
  function mul() {
    let e = unary();
    while (peek() && (peek().t === '*' || peek().t === '/')) { const op = toks[p++].t; const l = e, r = unary(); e = op === '*' ? (x) => l(x) * r(x) : (x) => l(x) / r(x); }
    return e;
  }
  function add() {
    let e = mul();
    while (peek() && (peek().t === '+' || peek().t === '-')) { const op = toks[p++].t; const l = e, r = mul(); e = op === '+' ? (x) => l(x) + r(x) : (x) => l(x) - r(x); }
    return e;
  }
  const fn = add();
  if (p < toks.length) throw new Error(`Unexpected “${toks[p].t}”`);
  return fn;
}

function gamma(z) {
  if (z < 0.5) return Math.PI / (Math.sin(Math.PI * z) * gamma(1 - z));
  z -= 1;
  const g = 7, c = [0.99999999999980993, 676.5203681218851, -1259.1392167224028, 771.32342877765313, -176.61502916214059, 12.507343278686905, -0.13857109526572012, 9.9843695780195716e-6, 1.5056327351493116e-7];
  let x = c[0];
  for (let i = 1; i < g + 2; i++) x += c[i] / (z + i);
  const t = z + g + 0.5;
  return Math.sqrt(2 * Math.PI) * t ** (z + 0.5) * Math.exp(-t) * x;
}
