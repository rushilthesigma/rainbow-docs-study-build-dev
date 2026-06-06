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
  s = s.replace(
    /(\${1,2})?[ \t]*\\begin\{aligned\}([\s\S]*?)\\end\{aligned\}[ \t]*(\${1,2})?/g,
    (m, open, body, close) => (open && close ? m : `$$\\begin{aligned}${body}\\end{aligned}$$`),
  );
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
