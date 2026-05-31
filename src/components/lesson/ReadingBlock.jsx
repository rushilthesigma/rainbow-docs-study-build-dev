import { ArrowRight } from 'lucide-react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import remarkMath from 'remark-math';
import rehypeKatex from 'rehype-katex';
import 'katex/dist/katex.min.css';

// Reading panel: no card, no border, no tinted background — the content
// sits on the page like a book chapter, separated from the chrome above
// by a single hairline. Reading column is capped to ~68ch for an
// optical comfortable line length, then the continue button sits on the
// outer width so it doesn't crowd the prose.
export default function ReadingBlock({ block, onComplete, hideContinue = false, continueLabel = 'Continue to quiz' }) {
  return (
    <div className="cl-anim-in">
      <div className="border-t border-white/[0.07] pt-7 lg:pt-9 mb-6">
        <article className="mx-auto max-w-[68ch] prose prose-invert max-w-none
          prose-headings:text-white prose-headings:font-semibold prose-headings:tracking-[-0.01em] prose-headings:leading-tight
          prose-h2:text-[24px] prose-h2:mt-0 prose-h2:mb-5
          prose-h3:text-[19px] prose-h3:mt-7 prose-h3:mb-3
          prose-p:text-white/80 prose-p:leading-[1.75] prose-p:text-[15.5px] prose-p:my-5
          prose-strong:text-white prose-strong:font-semibold
          prose-em:text-white/75
          prose-code:bg-white/[0.07] prose-code:text-white/85 prose-code:rounded prose-code:px-1.5 prose-code:py-0.5 prose-code:text-[13px] prose-code:before:content-none prose-code:after:content-none
          prose-pre:bg-white/[0.04] prose-pre:border prose-pre:border-white/[0.06] prose-pre:rounded-lg
          prose-li:text-white/80 prose-li:text-[15.5px] prose-li:leading-[1.7]
          prose-ul:my-4 prose-ol:my-4
          prose-a:text-blue-200/90 prose-a:no-underline hover:prose-a:underline prose-a:underline-offset-2
          prose-blockquote:border-blue-300/30 prose-blockquote:text-white/70 prose-blockquote:not-italic prose-blockquote:pl-5
          prose-hr:border-white/[0.08]">
          <ReactMarkdown remarkPlugins={[remarkGfm, remarkMath]} rehypePlugins={[rehypeKatex]}>
            {block.content || ''}
          </ReactMarkdown>
        </article>
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
