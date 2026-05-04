import { ArrowRight, Repeat } from 'lucide-react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import remarkMath from 'remark-math';
import rehypeKatex from 'rehype-katex';

// One reading "page" of a lesson. Markdown body + Continue CTA. No
// chat. The R3 reading is flagged as `srs` so we surface the
// "spaced-repetition" callout above the body — the AI was prompted to
// emphasize concepts the student got wrong in Q1/Q2.
export default function ReadingBlock({ block, onComplete }) {
  return (
    <div className="cl-anim-in">
      <div className="rounded-2xl border border-blue-500/15 bg-[#0f1124]/80 backdrop-blur p-6 lg:p-8 mb-4">
        <div className="flex items-center justify-between mb-4">
          <span className="inline-flex items-center gap-1.5 text-[11px] font-bold uppercase tracking-[0.16em] px-2 py-0.5 rounded-md bg-blue-500/15 text-blue-300 border border-blue-500/30">
            {block.title || 'Reading'}
          </span>
          {block.srs && (
            <span className="inline-flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded-md bg-amber-500/15 text-amber-300 border border-amber-500/30">
              <Repeat size={10} /> Spaced repetition
            </span>
          )}
        </div>
        <article className="prose prose-invert max-w-none prose-headings:text-white prose-headings:font-bold prose-p:text-gray-200 prose-p:leading-relaxed prose-strong:text-white prose-code:bg-blue-500/10 prose-code:text-blue-200 prose-code:rounded prose-code:px-1 prose-pre:bg-[#0a0a14] prose-pre:border prose-pre:border-blue-500/15 prose-li:text-gray-200 prose-a:text-blue-300 prose-blockquote:border-blue-500/40 prose-blockquote:text-gray-300">
          <ReactMarkdown remarkPlugins={[remarkGfm, remarkMath]} rehypePlugins={[rehypeKatex]}>
            {block.content || ''}
          </ReactMarkdown>
        </article>
      </div>
      <div className="flex justify-end">
        <button
          onClick={onComplete}
          className="inline-flex items-center gap-2 px-5 py-2.5 rounded-xl font-semibold text-[14px] text-white bg-gradient-to-r from-blue-600 to-indigo-600 shadow-lg shadow-blue-500/30 hover:shadow-blue-500/50 transition-shadow"
        >
          Continue to quiz <ArrowRight size={14} />
        </button>
      </div>
    </div>
  );
}
