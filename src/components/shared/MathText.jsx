import { useRef, useEffect } from 'react';
import renderMathInElement from 'katex/dist/contrib/auto-render.mjs';
import 'katex/dist/katex.min.css';

const RENDER_OPTS = {
  delimiters: [
    { left: '$$', right: '$$', display: true },
    { left: '\\[', right: '\\]', display: true },
    { left: '\\(', right: '\\)', display: false },
    { left: '$', right: '$', display: false },
  ],
  throwOnError: false,
  // A bit of LaTeX still slips through unparseable. Render it as muted text
  // rather than KaTeX's default alarming red so a worked example never looks
  // like an error.
  errorColor: '#94a3b8',
  ignoredTags: ['script', 'noscript', 'style', 'textarea', 'pre', 'code', 'option'],
  ignoredClasses: ['katex', 'katex-display'],
};

// ---- Bare-LaTeX auto-wrapping --------------------------------------------
// Models routinely emit math WITHOUT delimiters — most visibly in quiz answer
// options like `A) \frac{3}{5}`, which KaTeX's auto-render leaves as literal
// "\frac{3}{5}" text because there's no surrounding $…$. We wrap such bare
// LaTeX so it renders. Precision-first: only anchor a math run at a real signal
// (a backslash-command or a ^/_ script) and consume BALANCED braces, so plain
// prose is never touched and already-delimited math is left exactly as written.

// Consume a balanced {...} or [...] starting at i; return index past the close,
// or -1 if unbalanced.
function matchGroup(s, i) {
  const open = s[i], close = open === '{' ? '}' : ']';
  let depth = 0;
  for (let k = i; k < s.length; k++) {
    if (s[k] === open) depth++;
    else if (s[k] === close) { depth--; if (depth === 0) return k + 1; }
  }
  return -1;
}

// Consume a chain of ^/_ scripts at i (e.g. ^2, _{i}, ^\circ, _i^2).
function matchScripts(s, i) {
  let k = i;
  while (k < s.length && (s[k] === '^' || s[k] === '_')) {
    k++;
    if (s[k] === '{') { const e = matchGroup(s, k); if (e < 0) return -1; k = e; }
    else if (s[k] === '\\' && /[a-zA-Z]/.test(s[k + 1] || '')) { k++; while (k < s.length && /[a-zA-Z]/.test(s[k])) k++; }
    else if (/[A-Za-z0-9]/.test(s[k] || '')) k++;
    else return -1;
  }
  return k;
}

// If a math token starts at i, return its end index; else -1.
function matchMathAt(s, i) {
  const c = s[i];
  // \command with balanced args and optional trailing scripts
  if (c === '\\' && /[a-zA-Z]/.test(s[i + 1] || '')) {
    let k = i + 1;
    while (k < s.length && /[a-zA-Z]/.test(s[k])) k++;
    if (s[k] === '*') k++;
    while (s[k] === '{' || s[k] === '[') { const e = matchGroup(s, k); if (e < 0) break; k = e; }
    if (s[k] === '^' || s[k] === '_') { const e = matchScripts(s, k); if (e > 0) k = e; }
    return k;
  }
  // numeric base + script: 90^\circ, 10^{-3}
  if (/[0-9]/.test(c)) {
    let k = i; while (k < s.length && /[0-9.]/.test(s[k])) k++;
    if (s[k] === '^' || s[k] === '_') { const e = matchScripts(s, k); if (e > 0) return e; }
    return -1;
  }
  // single-char base + script: x^2, )_{i}
  if (/[A-Za-z)\]}]/.test(c) && (s[i + 1] === '^' || s[i + 1] === '_')) {
    const e = matchScripts(s, i + 1); return e > 0 ? e : -1;
  }
  // bare script with no base: ^2
  if (c === '^' || c === '_') { const e = matchScripts(s, i); return e > 0 ? e : -1; }
  return -1;
}

// Length of a run of "connector" chars (operators, digits, spaces, parens) that
// may bridge two math tokens into one $…$ run, e.g. the `+ ` in `x^2 + 1`.
function bridgeLen(s, i) {
  const m = /^[ \t]*[-+*/=<>|·×÷±∓()0-9.,\s]*[ \t]*/.exec(s.slice(i));
  return m ? m[0].length : 0;
}

// Wrap bare LaTeX spans within a segment that has no math delimiters.
function wrapPlainSegment(seg) {
  if (seg.includes('$')) return seg;                  // don't risk lone-$ chaos
  if (!/\\[a-zA-Z]|[\^_]/.test(seg)) return seg;      // no LaTeX signals at all
  let out = '', i = 0;
  while (i < seg.length) {
    let end = matchMathAt(seg, i);
    if (end > i) {
      // Greedily fold following tokens joined only by math connectors.
      for (;;) {
        const br = bridgeLen(seg, end);
        const next = matchMathAt(seg, end + br);
        if (br >= 0 && next > end + br) end = next; else break;
      }
      out += '$' + seg.slice(i, end) + '$';
      i = end;
    } else {
      out += seg[i++];
    }
  }
  return out;
}

export function wrapBareLatex(text) {
  if (!text || typeof text !== 'string') return text;
  // Route already-delimited math ($$…$$, $…$, \(…\), \[…\]) to odd indices so
  // it passes through untouched; only the plain segments get auto-wrapped.
  const parts = text.split(/(\$\$[\s\S]*?\$\$|\$[^$\n]*?\$|\\\([\s\S]*?\\\)|\\\[[\s\S]*?\\\])/);
  return parts.map((p, idx) => (idx % 2 === 1 ? p : wrapPlainSegment(p))).join('');
}

// Models frequently emit `align`/`align*`/`eqnarray` environments (KaTeX wants
// `aligned`, which nests inside math mode) and sometimes drop the surrounding
// `$$` entirely. Both cases render as raw red error text. Normalize to a form
// KaTeX's auto-render actually parses.
export function normalizeMath(src) {
  let s = src;
  s = s
    .replace(/\\begin\{(align\*?|eqnarray\*?)\}/g, '\\begin{aligned}')
    .replace(/\\end\{(align\*?|eqnarray\*?)\}/g, '\\end{aligned}');
  // Wrap any aligned block that isn't already delimited by $…$ / $$…$$.
  // Allow at most one newline between the optional $$ and \begin{aligned}
  // so that $$\n\begin{aligned} is correctly detected as already-delimited.
  s = s.replace(
    /(\${1,2})?[ \t]*\n?[ \t]*\\begin\{aligned\}([\s\S]*?)\\end\{aligned\}[ \t]*\n?[ \t]*(\${1,2})?/g,
    (m, open, body, close) => (open && close ? m : `$$\\begin{aligned}${body}\\end{aligned}$$`),
  );
  // Finally, wrap any remaining bare LaTeX (e.g. undelimited `\frac{3}{5}`
  // answer options) so KaTeX's auto-render actually renders it.
  s = wrapBareLatex(s);
  return s;
}

// Renders plain text that may contain LaTeX math delimiters.
// Content is managed imperatively (not via React children) so KaTeX's DOM
// modifications survive React reconciliation.
export default function MathText({ children, className, as: Tag = 'span' }) {
  const ref = useRef(null);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    el.textContent = normalizeMath(typeof children === 'string' ? children : String(children ?? ''));
    try {
      renderMathInElement(el, RENDER_OPTS);
    } catch {}
  }, [children]);

  // Render an empty element - content is set imperatively above so React
  // never reconciles over the KaTeX-rendered HTML.
  return <Tag ref={ref} className={className} />;
}
