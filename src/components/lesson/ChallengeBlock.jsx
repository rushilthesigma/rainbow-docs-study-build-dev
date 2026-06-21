import { useState } from 'react';
import { ArrowRight, Eye, Lightbulb, Zap } from 'lucide-react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import remarkMath from 'remark-math';
import rehypeKatex from 'rehype-katex';
import 'katex/dist/katex.min.css';
import MathText from '../shared/MathText';

// Stretch problem. The AI surfaces this when the student is clearly
// ahead of the curve (acing recent quizzes). Has a hint reveal and a
// final solution reveal - students who solve it cold get the win;
// stuck students can peek incrementally.
//
// Block shape:
//   { type: 'challenge', title, prompt, hint, solution }
export default function ChallengeBlock({ block, onComplete, hideContinue = false, continueLabel = 'Continue' }) {
  const [hintShown, setHintShown] = useState(false);
  const [solutionShown, setSolutionShown] = useState(false);

  return (
    <div className="cl-anim-in">
      <div className="border-t border-white/[0.07] pt-7 lg:pt-9 mb-6">
        <div className="mx-auto max-w-[68ch]">
          <div className="flex items-center gap-2 mb-3">
            <span className="inline-flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-[0.18em] text-blue-200/85 bg-blue-400/[0.10] border border-blue-300/[0.22] rounded-full px-2.5 py-0.5">
              <Zap size={10} strokeWidth={2.4} /> Challenge
            </span>
          </div>

          {block.title && (
            <MathText as="h2" className="text-[22px] font-semibold tracking-[-0.01em] text-white mb-5">
              {block.title}
            </MathText>
          )}

          {/* Prompt */}
          <article className="prose prose-invert max-w-none
            prose-p:text-white/82 prose-p:leading-[1.75] prose-p:text-[15.5px] prose-p:my-4
            prose-strong:text-white prose-strong:font-semibold
            prose-code:bg-white/[0.07] prose-code:text-white/85 prose-code:rounded prose-code:px-1.5 prose-code:py-0.5 prose-code:text-[13px] prose-code:before:content-none prose-code:after:content-none
            prose-li:text-white/82 prose-li:text-[15.5px] prose-li:leading-[1.7]">
            <ReactMarkdown remarkPlugins={[remarkGfm, remarkMath]} rehypePlugins={[[rehypeKatex, { throwOnError: false, errorColor: '#94a3b8' }]]}>
              {block.prompt || ''}
            </ReactMarkdown>
          </article>

          {/* Reveal controls */}
          <div className="mt-6 flex flex-wrap gap-2">
            {block.hint && !hintShown && (
              <button
                onClick={() => setHintShown(true)}
                className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl text-[12.5px] font-semibold text-blue-100 bg-blue-400/[0.10] border border-blue-300/[0.28] hover:bg-blue-400/[0.18] hover:border-blue-300/[0.45] transition-all"
              >
                <Lightbulb size={13} strokeWidth={2.4} /> Show hint
              </button>
            )}
            {block.solution && !solutionShown && (
              <button
                onClick={() => setSolutionShown(true)}
                className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl text-[12.5px] font-semibold text-white/70 bg-white/[0.04] border border-white/[0.10] hover:bg-white/[0.08] hover:text-white hover:border-white/[0.20] transition-all"
              >
                <Eye size={13} strokeWidth={2.4} /> Reveal solution
              </button>
            )}
          </div>

          {/* Hint */}
          {hintShown && block.hint && (
            <div className="mt-5 rounded-xl border border-blue-300/[0.18] bg-blue-400/[0.05] px-4 py-3.5">
              <p className="text-[10px] font-bold uppercase tracking-[0.16em] text-blue-200/70 mb-1.5">Hint</p>
              <MathText as="p" className="text-[14px] text-white/82 leading-relaxed">{block.hint}</MathText>
            </div>
          )}

          {/* Solution */}
          {solutionShown && block.solution && (
            <div className="mt-4 rounded-xl border border-white/[0.10] bg-white/[0.03] px-4 py-4">
              <p className="text-[10px] font-bold uppercase tracking-[0.16em] text-white/45 mb-2">Solution</p>
              <article className="prose prose-invert max-w-none
                prose-p:text-white/80 prose-p:leading-[1.7] prose-p:text-[14.5px] prose-p:my-2
                prose-code:bg-white/[0.07] prose-code:text-white/85 prose-code:rounded prose-code:px-1.5 prose-code:py-0.5 prose-code:text-[13px] prose-code:before:content-none prose-code:after:content-none">
                <ReactMarkdown remarkPlugins={[remarkGfm, remarkMath]} rehypePlugins={[[rehypeKatex, { throwOnError: false, errorColor: '#94a3b8' }]]}>
                  {block.solution}
                </ReactMarkdown>
              </article>
            </div>
          )}
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
