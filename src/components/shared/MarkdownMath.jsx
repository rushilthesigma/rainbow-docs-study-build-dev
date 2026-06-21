import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import remarkMath from 'remark-math';
import rehypeKatex from 'rehype-katex';
import 'katex/dist/katex.min.css';
import { normalizeMath } from './MathText';

const REMARK = [remarkGfm, remarkMath];
const REHYPE = [[rehypeKatex, { throwOnError: false, errorColor: '#94a3b8' }]];
// Collapse the wrapping <p> so inline spans stay truly inline.
const INLINE_COMPONENTS = { p: ({ children }) => <>{children}</> };

// Renders markdown + LaTeX math using the same pipeline as study-mode chat.
// Runs normalizeMath() first so bare LaTeX (e.g. \frac, x^2) gets delimited
// before remark-math sees it. Use inline=true for short answer-choice text.
export default function MarkdownMath({ children, className, inline = false }) {
  const raw = typeof children === 'string' ? children : String(children ?? '');
  const text = normalizeMath(raw);

  if (inline) {
    return (
      <span className={className}>
        <ReactMarkdown remarkPlugins={REMARK} rehypePlugins={REHYPE} components={INLINE_COMPONENTS}>
          {text}
        </ReactMarkdown>
      </span>
    );
  }

  return (
    <div className={`prose prose-sm prose-invert max-w-none prose-p:my-1 prose-headings:my-2 prose-ul:my-1 prose-ol:my-1 prose-li:my-0${className ? ` ${className}` : ''}`}>
      <ReactMarkdown remarkPlugins={REMARK} rehypePlugins={REHYPE}>
        {text}
      </ReactMarkdown>
    </div>
  );
}
