import { useState } from 'react';
import { ArrowRight, ChevronDown, Sparkles } from 'lucide-react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import remarkMath from 'remark-math';
import rehypeKatex from 'rehype-katex';
import 'katex/dist/katex.min.css';

// Worked example. The AI lays out a problem, then walks through it
// step by step. Each step is hidden behind a click so the student
// can pause and try before peeking. A final "now you try" prompt
// nudges them to apply what they just saw.
//
// Block shape:
//   { type: 'example', title, problem, steps: [{ label, text }], tryThis }
export default function ExampleBlock({ block, onComplete, hideContinue = false, continueLabel = 'Continue' }) {
  const steps = Array.isArray(block.steps) ? block.steps : [];
  const [revealed, setRevealed] = useState(0);

  return (
    <div className="cl-anim-in">
      <div className="border-t border-amber-300/[0.18] pt-7 lg:pt-9 mb-6">
        <div className="mx-auto max-w-[68ch]">
          {/* Type chip */}
          <div className="flex items-center gap-2 mb-3">
            <span className="inline-flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-[0.18em] text-amber-200/80 bg-amber-400/[0.10] border border-amber-300/[0.22] rounded-full px-2.5 py-0.5">
              <Sparkles size={10} strokeWidth={2.4} /> Worked Example
            </span>
          </div>

          {/* Problem */}
          <article className="prose prose-invert max-w-none
            prose-headings:text-white prose-headings:font-semibold prose-headings:tracking-[-0.01em]
            prose-h2:text-[22px] prose-h2:mt-0 prose-h2:mb-4
            prose-p:text-white/80 prose-p:leading-[1.75] prose-p:text-[15.5px]
            prose-strong:text-white prose-strong:font-semibold
            prose-code:bg-white/[0.07] prose-code:text-white/85 prose-code:rounded prose-code:px-1.5 prose-code:py-0.5 prose-code:text-[13px] prose-code:before:content-none prose-code:after:content-none">
            <ReactMarkdown remarkPlugins={[remarkGfm, remarkMath]} rehypePlugins={[[rehypeKatex, { throwOnError: false, errorColor: '#94a3b8' }]]}>
              {block.problem || ''}
            </ReactMarkdown>
          </article>

          {/* Reveal-on-click steps */}
          {steps.length > 0 && (
            <div className="mt-6 space-y-2">
              {steps.map((s, i) => {
                const open = i < revealed;
                return (
                  <div
                    key={i}
                    className={`rounded-xl border transition-colors overflow-hidden ${
                      open ? 'border-white/[0.10] bg-white/[0.025]' : 'border-white/[0.06] bg-white/[0.01]'
                    }`}
                  >
                    <button
                      onClick={() => setRevealed(r => (i < r ? i : i + 1))}
                      disabled={i > revealed}
                      className="w-full flex items-center gap-3 px-4 py-3 text-left transition-colors hover:bg-white/[0.025] disabled:cursor-not-allowed disabled:opacity-60"
                    >
                      <span
                        className={`grid place-items-center w-6 h-6 rounded-md text-[11px] font-bold tabular-nums flex-shrink-0 ${
                          open ? 'bg-amber-400/20 text-amber-200' : 'bg-white/[0.06] text-white/40'
                        }`}
                      >
                        {i + 1}
                      </span>
                      <span className={`flex-1 text-[13.5px] font-semibold ${open ? 'text-white/90' : 'text-white/55'}`}>
                        {s.label || `Step ${i + 1}`}
                      </span>
                      <ChevronDown
                        size={14}
                        className={`text-white/30 transition-transform ${open ? 'rotate-180' : ''}`}
                      />
                    </button>
                    {open && (
                      <div className="px-4 pb-4 pt-1">
                        <article className="prose prose-invert max-w-none
                          prose-p:text-white/75 prose-p:leading-[1.7] prose-p:text-[14px] prose-p:my-2
                          prose-code:bg-white/[0.07] prose-code:text-white/85 prose-code:rounded prose-code:px-1 prose-code:py-0.5 prose-code:text-[12.5px] prose-code:before:content-none prose-code:after:content-none">
                          <ReactMarkdown remarkPlugins={[remarkGfm, remarkMath]} rehypePlugins={[[rehypeKatex, { throwOnError: false, errorColor: '#94a3b8' }]]}>
                            {s.text || ''}
                          </ReactMarkdown>
                        </article>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}

          {/* Now you try */}
          {block.tryThis && (
            <div className="mt-6 rounded-xl border border-amber-300/[0.22] bg-amber-400/[0.05] px-4 py-3.5">
              <p className="text-[10px] font-bold uppercase tracking-[0.16em] text-amber-200/75 mb-1.5">Now you try</p>
              <p className="text-[14px] text-white/80 leading-relaxed">{block.tryThis}</p>
            </div>
          )}
        </div>
      </div>

      {!hideContinue && (
        <div className="flex justify-end border-t border-white/[0.05] pt-5">
          <button
            onClick={onComplete}
            className="inline-flex items-center gap-2.5 px-6 py-3 rounded-xl font-semibold text-[14px] text-white bg-blue-500 hover:bg-blue-400 border border-blue-400/45 transition-all"
          >
            {continueLabel} <ArrowRight size={15} />
          </button>
        </div>
      )}
    </div>
  );
}
