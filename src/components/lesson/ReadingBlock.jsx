import { ArrowRight, Repeat } from 'lucide-react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import remarkMath from 'remark-math';
import rehypeKatex from 'rehype-katex';
import 'katex/dist/katex.min.css';

export default function ReadingBlock({ block, onComplete }) {
  return (
    <div className="cl-anim-in">
      <div className="rounded-3xl border border-white/[0.08] bg-white/[0.03] backdrop-blur-sm p-7 lg:p-10 mb-5">
        {/* Header row */}
        <div className="flex items-center justify-between mb-6">
          <span className="inline-flex items-center gap-1.5 text-[10px] font-black uppercase tracking-[0.22em] px-2.5 py-1 rounded-lg bg-white/[0.06] text-white/50 border border-white/[0.08]">
            {block.title || 'Reading'}
          </span>
          {block.srs && (
            <span className="inline-flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded-lg bg-white/[0.05] text-white/35 border border-white/[0.07]">
              <Repeat size={10} /> Spaced repetition
            </span>
          )}
        </div>

        {/* Content */}
        <article className="prose prose-invert max-w-none
          prose-headings:text-white prose-headings:font-black prose-headings:tracking-tight prose-headings:leading-tight
          prose-h2:text-[22px] prose-h2:mt-0 prose-h2:mb-4
          prose-h3:text-[18px] prose-h3:mt-6 prose-h3:mb-3
          prose-p:text-white/85 prose-p:leading-relaxed prose-p:text-[15px] prose-p:my-4
          prose-strong:text-white prose-strong:font-bold
          prose-em:text-white/75
          prose-code:bg-white/[0.08] prose-code:text-white/80 prose-code:rounded-md prose-code:px-1.5 prose-code:py-0.5 prose-code:text-[13px]
          prose-pre:bg-white/[0.05] prose-pre:border prose-pre:border-white/[0.08] prose-pre:rounded-2xl
          prose-li:text-white/85 prose-li:text-[15px]
          prose-ul:my-4 prose-ol:my-4
          prose-a:text-white/70 prose-a:underline prose-a:underline-offset-2
          prose-blockquote:border-white/[0.15] prose-blockquote:text-white/60 prose-blockquote:not-italic
          prose-hr:border-white/[0.08]">
          <ReactMarkdown remarkPlugins={[remarkGfm, remarkMath]} rehypePlugins={[rehypeKatex]}>
            {block.content || ''}
          </ReactMarkdown>
        </article>
      </div>

      <div className="flex justify-end">
        <button
          onClick={onComplete}
          className="inline-flex items-center gap-2.5 px-6 py-3 rounded-2xl font-bold text-[14px] text-white/85 bg-white/[0.10] border border-white/[0.16] shadow-[inset_0_1px_0_rgba(255,255,255,0.10)] hover:bg-white/[0.15] hover:text-white transition-colors backdrop-blur-sm"
        >
          Continue to quiz <ArrowRight size={15} />
        </button>
      </div>
    </div>
  );
}
