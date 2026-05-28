/**
 * Scientific expression evaluator.
 *
 * Grammar (informal):
 *   expr     := term { ('+'|'-') term }
 *   term     := factor { ('*'|'/'|'%') factor }
 *   factor   := unary { '^' factor }            (right-associative)
 *   unary    := ('-'|'+') unary | postfix
 *   postfix  := primary { '!' }
 *   primary  := number | constant | ident '(' expr { ',' expr } ')' | '(' expr ')'
 *
 * Trig functions accept radians by default. Pass `angleMode: 'deg'` to evaluate()
 * to switch sin/cos/tan/asin/acos/atan into degrees.
 */

export type AngleMode = 'rad' | 'deg';

export interface EvalOptions {
  angleMode?: AngleMode;
}

interface Token {
  kind:
    | 'num'
    | 'op'
    | 'lparen'
    | 'rparen'
    | 'comma'
    | 'ident'
    | 'fact'
    | 'const';
  text: string;
  value?: number;
}

const CONSTS: Record<string, number> = {
  pi: Math.PI,
  π: Math.PI,
  e: Math.E,
  tau: Math.PI * 2,
};

function tokenize(src: string): Token[] {
  const tokens: Token[] = [];
  let i = 0;
  const isDigit = (c: string) => c >= '0' && c <= '9';
  const isAlpha = (c: string) =>
    (c >= 'a' && c <= 'z') || (c >= 'A' && c <= 'Z') || c === '_';
  while (i < src.length) {
    const c = src[i];
    if (c === ' ' || c === '\t' || c === '\n') {
      i++;
      continue;
    }
    if (isDigit(c) || (c === '.' && isDigit(src[i + 1]))) {
      let j = i;
      while (j < src.length && (isDigit(src[j]) || src[j] === '.')) j++;
      // exponent part
      if (src[j] === 'e' || src[j] === 'E') {
        j++;
        if (src[j] === '+' || src[j] === '-') j++;
        while (j < src.length && isDigit(src[j])) j++;
      }
      const text = src.slice(i, j);
      const value = parseFloat(text);
      if (Number.isNaN(value)) throw new Error(`Invalid number "${text}"`);
      tokens.push({ kind: 'num', text, value });
      i = j;
      continue;
    }
    if (isAlpha(c) || c === 'π') {
      let j = i;
      while (j < src.length && (isAlpha(src[j]) || isDigit(src[j]) || src[j] === 'π'))
        j++;
      const text = src.slice(i, j);
      const low = text.toLowerCase();
      if (low in CONSTS)
        tokens.push({ kind: 'const', text, value: CONSTS[low] });
      else tokens.push({ kind: 'ident', text });
      i = j;
      continue;
    }
    if ('+-*/%^'.includes(c)) {
      tokens.push({ kind: 'op', text: c });
      i++;
      continue;
    }
    if (c === '(') {
      tokens.push({ kind: 'lparen', text: c });
      i++;
      continue;
    }
    if (c === ')') {
      tokens.push({ kind: 'rparen', text: c });
      i++;
      continue;
    }
    if (c === ',') {
      tokens.push({ kind: 'comma', text: c });
      i++;
      continue;
    }
    if (c === '!') {
      tokens.push({ kind: 'fact', text: c });
      i++;
      continue;
    }
    throw new Error(`Unexpected character "${c}"`);
  }
  return tokens;
}

function factorial(n: number): number {
  if (n < 0 || !Number.isFinite(n)) return NaN;
  if (Math.floor(n) !== n) {
    // Use gamma for non-integers via Lanczos approximation
    return lanczosGamma(n + 1);
  }
  let acc = 1;
  for (let i = 2; i <= n; i++) acc *= i;
  return acc;
}

function lanczosGamma(z: number): number {
  const g = 7;
  const p = [
    0.99999999999980993,
    676.5203681218851,
    -1259.1392167224028,
    771.32342877765313,
    -176.61502916214059,
    12.507343278686905,
    -0.13857109526572012,
    9.9843695780195716e-6,
    1.5056327351493116e-7,
  ];
  if (z < 0.5) {
    return Math.PI / (Math.sin(Math.PI * z) * lanczosGamma(1 - z));
  }
  z -= 1;
  let x = p[0];
  for (let i = 1; i < g + 2; i++) x += p[i] / (z + i);
  const t = z + g + 0.5;
  return Math.sqrt(2 * Math.PI) * Math.pow(t, z + 0.5) * Math.exp(-t) * x;
}

const TRIG_INPUTS = new Set(['sin', 'cos', 'tan']);
const TRIG_INVERSE = new Set(['asin', 'acos', 'atan']);

function applyFunction(
  name: string,
  args: number[],
  angleMode: AngleMode,
): number {
  const single = (fn: (x: number) => number) => {
    if (args.length !== 1) throw new Error(`${name} takes 1 argument`);
    return fn(args[0]);
  };
  const lower = name.toLowerCase();
  if (TRIG_INPUTS.has(lower)) {
    return single((x) => {
      const r = angleMode === 'deg' ? (x * Math.PI) / 180 : x;
      return (Math as any)[lower](r);
    });
  }
  if (TRIG_INVERSE.has(lower)) {
    return single((x) => {
      const r = (Math as any)[lower](x);
      return angleMode === 'deg' ? (r * 180) / Math.PI : r;
    });
  }
  switch (lower) {
    case 'sqrt':
      return single(Math.sqrt);
    case 'cbrt':
      return single(Math.cbrt);
    case 'ln':
      return single(Math.log);
    case 'log':
    case 'log10':
      return single(Math.log10);
    case 'log2':
      return single(Math.log2);
    case 'exp':
      return single(Math.exp);
    case 'abs':
      return single(Math.abs);
    case 'floor':
      return single(Math.floor);
    case 'ceil':
      return single(Math.ceil);
    case 'round':
      return single(Math.round);
    case 'sinh':
      return single(Math.sinh);
    case 'cosh':
      return single(Math.cosh);
    case 'tanh':
      return single(Math.tanh);
    case 'min':
      return Math.min(...args);
    case 'max':
      return Math.max(...args);
    case 'pow':
      if (args.length !== 2) throw new Error('pow takes 2 args');
      return Math.pow(args[0], args[1]);
    case 'mod':
      if (args.length !== 2) throw new Error('mod takes 2 args');
      return args[0] % args[1];
  }
  throw new Error(`Unknown function "${name}"`);
}

class Parser {
  pos = 0;
  constructor(public tokens: Token[], public angleMode: AngleMode) {}

  peek(): Token | undefined {
    return this.tokens[this.pos];
  }
  consume(): Token {
    return this.tokens[this.pos++];
  }
  expect(kind: Token['kind'], text?: string): Token {
    const t = this.peek();
    if (!t || t.kind !== kind || (text && t.text !== text)) {
      throw new Error(`Expected ${text ?? kind}`);
    }
    return this.consume();
  }

  parse(): number {
    const v = this.expr();
    if (this.peek()) throw new Error(`Unexpected token "${this.peek()!.text}"`);
    return v;
  }

  expr(): number {
    let v = this.term();
    while (this.peek()?.kind === 'op' && (this.peek()!.text === '+' || this.peek()!.text === '-')) {
      const op = this.consume().text;
      const r = this.term();
      v = op === '+' ? v + r : v - r;
    }
    return v;
  }

  term(): number {
    let v = this.factor();
    while (
      this.peek()?.kind === 'op' &&
      (this.peek()!.text === '*' || this.peek()!.text === '/' || this.peek()!.text === '%')
    ) {
      const op = this.consume().text;
      const r = this.factor();
      v = op === '*' ? v * r : op === '/' ? v / r : v % r;
    }
    return v;
  }

  factor(): number {
    const v = this.unary();
    if (this.peek()?.kind === 'op' && this.peek()!.text === '^') {
      this.consume();
      const r = this.factor(); // right-assoc
      return Math.pow(v, r);
    }
    return v;
  }

  unary(): number {
    const t = this.peek();
    if (t?.kind === 'op' && (t.text === '-' || t.text === '+')) {
      this.consume();
      const v = this.unary();
      return t.text === '-' ? -v : v;
    }
    return this.postfix();
  }

  postfix(): number {
    let v = this.primary();
    while (this.peek()?.kind === 'fact') {
      this.consume();
      v = factorial(v);
    }
    return v;
  }

  primary(): number {
    const t = this.peek();
    if (!t) throw new Error('Unexpected end of expression');
    if (t.kind === 'num' || t.kind === 'const') {
      this.consume();
      return t.value!;
    }
    if (t.kind === 'lparen') {
      this.consume();
      const v = this.expr();
      this.expect('rparen');
      return v;
    }
    if (t.kind === 'ident') {
      this.consume();
      this.expect('lparen');
      const args: number[] = [];
      if (this.peek()?.kind !== 'rparen') {
        args.push(this.expr());
        while (this.peek()?.kind === 'comma') {
          this.consume();
          args.push(this.expr());
        }
      }
      this.expect('rparen');
      return applyFunction(t.text, args, this.angleMode);
    }
    throw new Error(`Unexpected token "${t.text}"`);
  }
}

export function evaluate(expr: string, opts: EvalOptions = {}): number {
  const tokens = tokenize(expr);
  if (!tokens.length) throw new Error('Empty expression');
  const parser = new Parser(tokens, opts.angleMode ?? 'rad');
  return parser.parse();
}

/**
 * Try to evaluate, returning null instead of throwing — useful for live previews.
 */
export function tryEvaluate(expr: string, opts?: EvalOptions): number | null {
  try {
    return evaluate(expr, opts);
  } catch {
    return null;
  }
}

/* Formatting helpers */

export function formatNumber(n: number, precision = 10): string {
  if (Number.isNaN(n)) return 'NaN';
  if (!Number.isFinite(n)) return n > 0 ? '∞' : '-∞';
  // Use a sensible default — fix trailing zeros from precision.
  if (n === 0) return '0';
  const abs = Math.abs(n);
  if (abs >= 1e15 || (abs < 1e-6 && abs > 0)) return n.toExponential(precision - 1);
  const fixed = parseFloat(n.toPrecision(precision)).toString();
  return fixed;
}

/* Base conversion for programmer mode */

export function parseInBase(s: string, base: 2 | 8 | 10 | 16): bigint | null {
  if (!s) return null;
  try {
    s = s.trim();
    if (base === 16) return BigInt('0x' + s.replace(/^0x/i, ''));
    if (base === 2) return BigInt('0b' + s.replace(/^0b/i, ''));
    if (base === 8) return BigInt('0o' + s.replace(/^0o/i, ''));
    return BigInt(s);
  } catch {
    return null;
  }
}

export function formatInBase(n: bigint, base: 2 | 8 | 10 | 16): string {
  if (n < 0n) {
    // Two's complement representation in 64 bits for negative numbers
    const mask = (1n << 64n) - 1n;
    const tc = (n & mask).toString(base);
    return tc;
  }
  return n.toString(base);
}
