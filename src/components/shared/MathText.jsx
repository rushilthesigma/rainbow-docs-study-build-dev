import { useEffect, useRef } from 'react';
import renderMathInElement from 'katex/dist/contrib/auto-render.mjs';
import 'katex/dist/katex.min.css';

// Renders plain text that may contain LaTeX math delimiters. Used anywhere
// AI-generated strings appear outside of the full markdown renderer (quiz
// questions, answer options, explanations, etc).
//
// Handles: $...$, $$...$$, \(...\), \[...\]
export default function MathText({ children, className, as: Tag = 'span' }) {
  const ref = useRef(null);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    try {
      renderMathInElement(el, {
        delimiters: [
          { left: '$$', right: '$$', display: true },
          { left: '\\[', right: '\\]', display: true },
          { left: '\\(', right: '\\)', display: false },
          { left: '$', right: '$', display: false },
        ],
        throwOnError: false,
        ignoredTags: ['script', 'noscript', 'style', 'textarea', 'pre', 'code', 'option'],
        ignoredClasses: ['katex', 'katex-display'],
      });
    } catch {}
  }, [children]);

  return <Tag ref={ref} className={className}>{children}</Tag>;
}
