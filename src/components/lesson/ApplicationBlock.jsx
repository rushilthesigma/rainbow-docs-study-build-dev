import { ArrowRight, Globe } from 'lucide-react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import remarkMath from 'remark-math';
import rehypeKatex from 'rehype-katex';
import 'katex/dist/katex.min.css';

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
      <div className="border-t border-violet-300/[0.18] pt-7 lg:pt-9 mb-6">
        <div className="mx-auto max-w-[68ch]">
          <div className="flex items-center gap-2 mb-3">
            <span className="inline-flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-[0.18em] text-violet-200/85 bg-violet-400/[0.10] border border-violet-300/[0.22] rounded-full px-2.5 py-0.5">
              <Globe size={10} strokeWidth={2.4} /> In the Wild
            </span>
          </div>

          {block.title && (
            <h2 className="text-[22px] font-semibold tracking-[-0.01em] text-white mb-5">
              {block.title}
            </h2>
          )}

          <article className="prose prose-invert max-w-none
            prose-headings:text-white prose-headings:font-semibold prose-headings:tracking-[-0.01em]
            prose-h3:text-[18px] prose-h3:mt-6 prose-h3:mb-3
            prose-p:text-white/82 prose-p:leading-[1.75] prose-p:text-[15.5px] prose-p:my-4
            prose-strong:text-white prose-strong:font-semibold
            prose-em:text-violet-200/80
            prose-code:bg-white/[0.07] prose-code:text-white/85 prose-code:rounded prose-code:px-1.5 prose-code:py-0.5 prose-code:text-[13px] prose-code:before:content-none prose-code:after:content-none
            prose-li:text-white/82 prose-li:text-[15.5px] prose-li:leading-[1.7]
            prose-a:text-violet-200/90 prose-a:no-underline hover:prose-a:underline
            prose-blockquote:border-violet-300/30 prose-blockquote:text-white/70 prose-blockquote:not-italic prose-blockquote:pl-5">
            <ReactMarkdown remarkPlugins={[remarkGfm, remarkMath]} rehypePlugins={[rehypeKatex]}>
              {block.content || ''}
            </ReactMarkdown>
          </article>
        </div>
      </div>

      {!hideContinue && (
        <div className="flex justify-end border-t border-white/[0.05] pt-5">
          <button
            onClick={onComplete}
            className="inline-flex items-center gap-2.5 px-6 py-3 rounded-xl font-semibold text-[14px] text-white bg-gradient-to-b from-violet-500 to-violet-600 hover:from-violet-400 hover:to-violet-500 border border-violet-400/45 transition-all"
          >
            {continueLabel} <ArrowRight size={15} />
          </button>
        </div>
      )}
    </div>
  );
}
