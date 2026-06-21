import { ArrowRight, Globe } from 'lucide-react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import remarkMath from 'remark-math';
import rehypeKatex from 'rehype-katex';
import 'katex/dist/katex.min.css';
import MathText from '../shared/MathText';

// Real-world application block. Connects the lesson concept to
// something tangible the student would recognize - a product, a
// historical event, a phenomenon they've seen. Reads like a short
// magazine column rather than a textbook.
//
// Block shape:
//   { type: 'application', title, content (markdown) }
export default function ApplicationBlock({ block, onComplete, hideContinue = false, continueLabel = 'Continue' }) {
  return (
    <div className="cl-anim-in">
      <div className="border-t border-white/[0.07] pt-7 lg:pt-9 mb-6">
        <div className="mx-auto max-w-[68ch]">
          <div className="flex items-center gap-2 mb-3">
            <span className="inline-flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-[0.18em] text-blue-200/85 bg-blue-400/[0.10] border border-blue-300/[0.22] rounded-full px-2.5 py-0.5">
              <Globe size={10} strokeWidth={2.4} /> In the Wild
            </span>
          </div>

          {block.title && (
            <MathText as="h2" className="text-[22px] font-semibold tracking-[-0.01em] text-white mb-5">
              {block.title}
            </MathText>
          )}

          <article className="prose prose-invert max-w-none
            prose-headings:text-white prose-headings:font-semibold prose-headings:tracking-[-0.01em]
            prose-h3:text-[18px] prose-h3:mt-6 prose-h3:mb-3
            prose-p:text-white/82 prose-p:leading-[1.75] prose-p:text-[15.5px] prose-p:my-4
            prose-strong:text-white prose-strong:font-semibold
            prose-em:text-white/75
            prose-code:bg-white/[0.07] prose-code:text-white/85 prose-code:rounded prose-code:px-1.5 prose-code:py-0.5 prose-code:text-[13px] prose-code:before:content-none prose-code:after:content-none
            prose-li:text-white/82 prose-li:text-[15.5px] prose-li:leading-[1.7]
            prose-a:text-blue-200/90 prose-a:no-underline hover:prose-a:underline
            prose-blockquote:border-blue-300/30 prose-blockquote:text-white/70 prose-blockquote:not-italic prose-blockquote:pl-5">
            <ReactMarkdown remarkPlugins={[remarkGfm, remarkMath]} rehypePlugins={[[rehypeKatex, { throwOnError: false, errorColor: '#94a3b8' }]]}>
              {block.content || ''}
            </ReactMarkdown>
          </article>
        </div>
      </div>

      {!hideContinue && (
        <div className="flex justify-end border-t border-white/[0.05] pt-5">
          <button
            onClick={onComplete}
            className="inline-flex items-center gap-2.5 px-6 py-3 rounded-xl font-semibold text-[14px] text-white bg-blue-500 hover:bg-blue-400 transition-colors"
          >
            {continueLabel} <ArrowRight size={15} />
          </button>
        </div>
      )}
    </div>
  );
}
