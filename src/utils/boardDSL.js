// ===== TUTOR "board" DRAWING DSL =====
// The math tutor can sketch real figures by emitting a fenced ```board block
// of one-command-per-line text. This module turns that text into a validated
// list of primitives the BoardFigure SVG renderer draws. Everything here is
// DEFENSIVE: the model is a flaky narrator, so a bad line is skipped, an
// out-of-range value is tolerated downstream, and total garbage returns null —
// it must NEVER throw. plot expressions are compiled by a hand-written safe
// evaluator (NO eval / new Function — that would be an injection hole).

// Named colors map to chalkboard-friendly inks (the figure renders on a dark
// panel in both light/dark mode). `correct`/`error` are the teaching semantics.
const COLOR_MAP = {
  ink: '#cbd5e1', white: '#e8e8ea', blue: '#60a5fa', green: '#4ade80',
  red: '#f87171', amber: '#fbbf24', gray: '#94a3b8', purple: '#c4b5fd',
  pink: '#f472b6', teal: '#2dd4bf', orange: '#fb923c',
  correct: '#4ade80', error: '#f87171',
};
function resolveColor(c) {
  if (!c) return null;
  return COLOR_MAP[String(c).toLowerCase()] || null;
}
function clampWeight(w) {
  const n = Number(w);
  return Number.isFinite(n) ? Math.min(4, Math.max(1, n)) : 2;
}
function stripQuotes(s) {
  s = (s || '').trim();
  const m = s.match(/^"([\s\S]*)"$/);
  return m ? m[1] : s;
}

// Pull key=value options (quoted or bare), a standalone quoted label, and known
// boolean flags out of a line body; return what's left as positional `rest`.
function extractOpts(body) {
  const opts = {};
  const flags = new Set();
  body = body.replace(/(\w+)\s*=\s*"([^"]*)"/g, (_, k, v) => { opts[k.toLowerCase()] = v; return ' '; });
  body = body.replace(/(\w+)\s*=\s*([^\s"]+)/g, (_, k, v) => { opts[k.toLowerCase()] = v; return ' '; });
  body = body.replace(/"([^"]*)"/g, (_, v) => { if (opts.label === undefined) opts.label = v; return ' '; });
  for (const f of ['equal', 'dash', 'open', 'closed', 'halfopen']) {
    const re = new RegExp('\\b' + f + '\\b', 'i');
    if (re.test(body)) { flags.add(f); body = body.replace(re, ' '); }
  }
  return { opts, flags, rest: body.trim() };
}

// Flat list of numbers in order; "x,y" pairs read as two consecutive numbers.
function nums(rest) {
  const out = [];
  const re = /-?\d*\.?\d+/g;
  let m;
  while ((m = re.exec(rest))) {
    const v = Number(m[0]);
    if (Number.isFinite(v)) out.push(v);
  }
  return out;
}
function pairs(arr) {
  const out = [];
  for (let i = 0; i + 1 < arr.length; i += 2) out.push([arr[i], arr[i + 1]]);
  return out;
}

const MAX_PRIMS = 40;

export function parseBoard(src) {
  if (typeof src !== 'string') return null;
  const lines = src.split('\n');
  let caption = null;
  let view = null;
  let equalAspect = false;
  const primitives = [];

  for (let line of lines) {
    line = line.trim();
    if (!line || line.startsWith('#')) continue;
    if (primitives.length >= MAX_PRIMS) break;

    const sp = line.indexOf(' ');
    const cmd = (sp < 0 ? line : line.slice(0, sp)).toLowerCase();
    const body = sp < 0 ? '' : line.slice(sp + 1);

    // caption / note carry free text — never run them through the option parser
    // (an unquoted "y=x" would be misread as a key=value option).
    if (cmd === 'caption') { caption = stripQuotes(body) || caption; continue; }
    if (cmd === 'note') { primitives.push({ t: 'note', text: stripQuotes(body) }); continue; }

    const { opts, flags, rest } = extractOpts(body);
    const n = nums(rest);
    const color = resolveColor(opts.color);
    const weight = clampWeight(opts.weight);
    const label = opts.label;
    const dash = flags.has('dash');

    try {
      switch (cmd) {
        case 'view':
          if (n.length >= 4) view = { xmin: n[0], xmax: n[1], ymin: n[2], ymax: n[3] };
          if (flags.has('equal')) equalAspect = true;
          break;
        case 'axes':
          primitives.push({ t: 'axes', xlabel: opts.xlabel, ylabel: opts.ylabel });
          break;
        case 'grid':
          primitives.push({ t: 'grid', step: Math.abs(Number(opts.step)) || 1 });
          break;
        case 'plot': {
          const fn = compileExpr(rest);
          if (fn) primitives.push({ t: 'plot', fn, expr: rest, from: numOrNull(opts.from), to: numOrNull(opts.to), color, weight, dash, label });
          break;
        }
        case 'point':
          if (n.length >= 2) primitives.push({ t: 'point', x: n[0], y: n[1], color, label, at: opts.at });
          break;
        case 'line':
        case 'segment':
          if (n.length >= 4) primitives.push({ t: 'line', x1: n[0], y1: n[1], x2: n[2], y2: n[3], color, weight, dash, label });
          break;
        case 'ray':
          if (n.length >= 4) primitives.push({ t: 'line', x1: n[0], y1: n[1], x2: n[2], y2: n[3], color, weight, dash, label });
          break;
        case 'arrow':
        case 'vector':
          if (n.length >= 4) primitives.push({ t: 'arrow', x1: n[0], y1: n[1], x2: n[2], y2: n[3], color, weight, dash, label });
          break;
        case 'circle':
          if (n.length >= 3) primitives.push({ t: 'circle', cx: n[0], cy: n[1], r: Math.abs(n[2]), color, weight, dash, label });
          break;
        case 'arc':
          if (n.length >= 5) primitives.push({ t: 'arc', cx: n[0], cy: n[1], r: Math.abs(n[2]), a0: n[3], a1: n[4], color, weight, dash, label });
          break;
        case 'polygon':
          if (n.length >= 6) primitives.push({ t: 'poly', pts: pairs(n), closed: true, color, weight, dash, label });
          break;
        case 'polyline':
          if (n.length >= 4) primitives.push({ t: 'poly', pts: pairs(n), closed: false, color, weight, dash, label });
          break;
        case 'angle':
          if (n.length >= 6) primitives.push({ t: 'angle', vx: n[0], vy: n[1], ax: n[2], ay: n[3], bx: n[4], by: n[5], color, label });
          break;
        case 'label':
          if (n.length >= 2) primitives.push({ t: 'label', x: n[0], y: n[1], text: label != null ? label : '', color });
          break;
        case 'numline':
          if (n.length >= 2) primitives.push({ t: 'numline', from: n[0], to: n[1], step: Math.abs(Number(opts.step)) || 1 });
          break;
        case 'tick':
          if (n.length >= 1) primitives.push({ t: 'tick', at: n[0], label });
          break;
        case 'plotpoint':
          if (n.length >= 1) primitives.push({ t: 'plotpoint', at: n[0], label, open: flags.has('open'), color });
          break;
        case 'interval':
          if (n.length >= 2) primitives.push({ t: 'interval', a: n[0], b: n[1], color, open: flags.has('open'), halfopen: flags.has('halfopen'), closed: flags.has('closed') });
          break;
        default:
          break; // unknown command -> silently skipped
      }
    } catch {
      // a single malformed line never voids the figure
    }
  }

  if (!caption && !primitives.length) return null;
  const oneDim = primitives.some(p => p.t === 'numline' || p.t === 'interval' || p.t === 'plotpoint');
  return { caption, primitives, view, equalAspect, oneDim };
}

function numOrNull(v) {
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}

// One-line summary for compact contexts (e.g. feeding history back to the model
// without the full block). Not used by the MVP renderer but handy + cheap.
export function digest(board) {
  if (!board) return '';
  const kinds = [...new Set(board.primitives.map(p => p.t))];
  return `[figure: ${board.caption || kinds.join(', ')}]`;
}

// ===== SAFE EXPRESSION COMPILER (for plot) =====
// Recursive-descent parser over a whitelisted grammar. Returns f(x) or null.
// Supports: + - * / ^, unary minus, parentheses, implicit multiplication,
// the variable x, constants pi/e, and a fixed set of single-arg functions.
const FUNCS = {
  sin: Math.sin, cos: Math.cos, tan: Math.tan,
  asin: Math.asin, acos: Math.acos, atan: Math.atan,
  sinh: Math.sinh, cosh: Math.cosh, tanh: Math.tanh,
  sqrt: Math.sqrt, cbrt: Math.cbrt, abs: Math.abs,
  exp: Math.exp, ln: Math.log,
  log: (v) => Math.log(v) / Math.LN10, log10: (v) => Math.log(v) / Math.LN10, log2: (v) => Math.log(v) / Math.LN2,
  floor: Math.floor, ceil: Math.ceil, round: Math.round, sign: Math.sign,
};
const CONSTS = { pi: Math.PI, e: Math.E, tau: Math.PI * 2 };

function tokenizeExpr(s) {
  const toks = [];
  let i = 0;
  while (i < s.length) {
    const c = s[i];
    if (c === ' ' || c === '\t') { i++; continue; }
    if ((c >= '0' && c <= '9') || c === '.') {
      let j = i + 1;
      while (j < s.length && ((s[j] >= '0' && s[j] <= '9') || s[j] === '.')) j++;
      const v = parseFloat(s.slice(i, j));
      if (!Number.isFinite(v)) return null;
      toks.push({ t: 'num', v }); i = j; continue;
    }
    if (/[A-Za-z_]/.test(c)) {
      let j = i + 1;
      while (j < s.length && /[A-Za-z0-9_]/.test(s[j])) j++;
      toks.push({ t: 'name', v: s.slice(i, j) }); i = j; continue;
    }
    if (c === '*' && s[i + 1] === '*') { toks.push({ t: 'op', v: '^' }); i += 2; continue; }
    if ('+-*/^()'.includes(c)) { toks.push({ t: 'op', v: c }); i++; continue; }
    return null; // illegal character
  }
  return toks;
}

export function compileExpr(src) {
  if (typeof src !== 'string' || !src.trim()) return null;
  const toks = tokenizeExpr(src.trim());
  if (!toks || !toks.length) return null;
  let pos = 0;
  const peek = () => toks[pos];
  const next = () => toks[pos++];
  const isOp = (v) => { const t = peek(); return t && t.t === 'op' && t.v === v; };
  function expect(v) { if (!isOp(v)) throw 0; next(); }

  function parsePrimary() {
    const tk = peek();
    if (!tk) throw 0;
    if (tk.t === 'op' && tk.v === '(') { next(); const e = parseAdd(); expect(')'); return e; }
    if (tk.t === 'num') { next(); const v = tk.v; return () => v; }
    if (tk.t === 'name') {
      next();
      const name = tk.v.toLowerCase();
      if (isOp('(')) {
        next();
        const arg = parseAdd();
        expect(')');
        const fn = FUNCS[name];
        if (!fn) throw 0;
        return (x) => fn(arg(x));
      }
      if (name === 'x') return (x) => x;
      if (name in CONSTS) { const c = CONSTS[name]; return () => c; }
      throw 0;
    }
    throw 0;
  }
  function parsePow() {
    const base = parsePrimary();
    if (isOp('^')) { next(); const exp = parseUnary(); return (x) => Math.pow(base(x), exp(x)); }
    return base;
  }
  function parseUnary() {
    if (isOp('-')) { next(); const e = parseUnary(); return (x) => -e(x); }
    if (isOp('+')) { next(); return parseUnary(); }
    return parsePow();
  }
  function parseMul() {
    let left = parseUnary();
    for (;;) {
      const tk = peek();
      if (tk && tk.t === 'op' && (tk.v === '*' || tk.v === '/')) {
        const op = next().v;
        const right = parseUnary();
        const l = left, r = right;
        left = op === '*' ? (x) => l(x) * r(x) : (x) => l(x) / r(x);
      } else if (tk && (tk.t === 'num' || tk.t === 'name' || (tk.t === 'op' && tk.v === '('))) {
        const right = parseUnary(); // implicit multiplication: 2x, 3(x+1), x sin(x)
        const l = left, r = right;
        left = (x) => l(x) * r(x);
      } else break;
    }
    return left;
  }
  function parseAdd() {
    let left = parseMul();
    while (peek() && peek().t === 'op' && (peek().v === '+' || peek().v === '-')) {
      const op = next().v;
      const right = parseMul();
      const l = left, r = right;
      left = op === '+' ? (x) => l(x) + r(x) : (x) => l(x) - r(x);
    }
    return left;
  }

  let ast;
  try { ast = parseAdd(); } catch { return null; }
  if (pos !== toks.length) return null; // trailing junk -> reject
  return (x) => {
    try { const v = ast(x); return Number.isFinite(v) ? v : NaN; } catch { return NaN; }
  };
}

export { resolveColor as _resolveColor };
