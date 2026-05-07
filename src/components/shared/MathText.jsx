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
  ignoredTags: ['script', 'noscript', 'style', 'textarea', 'pre', 'code', 'option'],
  ignoredClasses: ['katex', 'katex-display'],
};

// Renders plain text that may contain LaTeX math delimiters.
// Content is managed imperatively (not via React children) so KaTeX's DOM
// modifications survive React reconciliation.
export default function MathText({ children, className, as: Tag = 'span' }) {
  const ref = useRef(null);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    el.textContent = typeof children === 'string' ? children : String(children ?? '');
    try {
      renderMathInElement(el, RENDER_OPTS);
    } catch {}
  }, [children]);

  // Render an empty element — content is set imperatively above so React
  // never reconciles over the KaTeX-rendered HTML.
  return <Tag ref={ref} className={className} />;
}
