import { useState } from 'react';
import { ArrowRight, ChevronDown, Eye, Lightbulb, RotateCcw, CheckCircle2 } from 'lucide-react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import remarkMath from 'remark-math';
import rehypeKatex from 'rehype-katex';
import 'katex/dist/katex.min.css';
import MathText, { normalizeMath } from '../shared/MathText';

// Worked example. The AI lays out a problem, then walks through it
// step by step. Each step is hidden behind a click so the student
// can pause and try before peeking. A final "now you try" section
// turns into a full interactive mini-lesson: work area, progressive
// hints (reusing the example steps as guidance), solution reveal,
// and self-assessment before the student moves on.
//
// Block shape:
//   { type: 'example', title, problem, steps: [{ label, text }], tryThis }

const REMARK_PLUGINS = [remarkGfm, remarkMath];
const REHYPE_PLUGINS = [[rehypeKatex, { throwOnError: false, errorColor: '#94a3b8' }]];

// Markdown + math prose. Every text surface in a worked example runs through
// here so math renders identically everywhere. normalizeMath() repairs the
// imperfect LaTeX models routinely emit (undelimited \frac, align→aligned)
// before remark-math sees it — without it, those spans render as raw text.
function Prose({ children, className }) {
  if (!children) return null;
  return (
    <article className={`prose prose-invert max-w-none ${className}`}>
      <ReactMarkdown remarkPlugins={REMARK_PLUGINS} rehypePlugins={REHYPE_PLUGINS}>
        {normalizeMath(children)}
      </ReactMarkdown>
    </article>
  );
}

// Interactive "Now You Try" mini-lesson.
// Three phases:
//   attempt  — student works the problem; can get hints or skip to solution
//   solution — full step walkthrough shown; student self-assesses
//   done     — success state with the Continue button
//
// hintSteps are the worked example's own steps, reused as scaffolded hints
// so the student sees the same problem-solving pattern applied to their turn.
function NowYouTry({ problem, hintSteps, onComplete, hideContinue, continueLabel }) {
  const hints = Array.isArray(hintSteps) ? hintSteps.filter(s => s && s.text) : [];
  const [work, setWork] = useState('');
  const [hintsRevealed, setHintsRevealed] = useState(0);
  const [phase, setPhase] = useState('attempt'); // 'attempt' | 'solution' | 'done'

  function reset() {
    setWork('');
    setHintsRevealed(0);
    setPhase('attempt');
  }

  return (
    <div className="mt-8 border-t border-white/[0.07] pt-7">
      {/* Plain uppercase label — no pill, consistent with the rest of the app */}
      <p className="text-[11px] font-bold uppercase tracking-[0.16em] text-white/40 mb-4">
        Now you try
      </p>

      {/* Problem as prose — no colored box */}
      <Prose className="
        prose-p:text-white/85 prose-p:leading-[1.75] prose-p:text-[15.5px] prose-p:my-0
        prose-strong:text-white prose-strong:font-semibold
        prose-headings:text-white prose-headings:font-semibold prose-headings:mt-0
        prose-code:bg-white/[0.07] prose-code:text-white/85 prose-code:rounded prose-code:px-1.5 prose-code:py-0.5 prose-code:text-[13px] prose-code:before:content-none prose-code:after:content-none">
        {problem}
      </Prose>

      {/* ── Attempt phase ── */}
      {phase === 'attempt' && (
        <>
          {/* Scratchpad */}
          <div className="mt-5 mb-5">
            <p className="text-[11px] font-bold uppercase tracking-[0.16em] text-white/35 mb-2">Your work</p>
            <textarea
              value={work}
              onChange={e => setWork(e.target.value)}
              rows={5}
              placeholder="Write out your steps here…"
              className="w-full px-3.5 py-3 rounded-lg border border-white/[0.10] bg-white/[0.04] text-[14px] text-white/85 placeholder-white/25 outline-none focus:border-blue-400/50 focus:ring-2 focus:ring-blue-400/20 transition-colors resize-y"
            />
          </div>

          {/* Revealed hints */}
          {hintsRevealed > 0 && (
            <div className="mb-5 space-y-2.5">
              {hints.slice(0, hintsRevealed).map((hint, i) => (
                <div key={i} className="rounded-xl border border-blue-300/[0.18] bg-blue-400/[0.05] px-4 py-3.5">
                  <p className="text-[10px] font-bold uppercase tracking-[0.16em] text-blue-200/70 mb-1.5">
                    Hint {i + 1}{hint.label ? ` · ${hint.label}` : ''}
                  </p>
                  <Prose className="
                    prose-p:text-white/80 prose-p:text-[14px] prose-p:my-0 prose-p:leading-relaxed
                    prose-strong:text-white prose-strong:font-semibold
                    prose-code:bg-white/[0.07] prose-code:text-white/80 prose-code:rounded prose-code:px-1 prose-code:py-0.5 prose-code:text-[12.5px] prose-code:before:content-none prose-code:after:content-none">
                    {hint.text}
                  </Prose>
                </div>
              ))}
            </div>
          )}

          {/* Action bar — mirrors ChallengeBlock button styles exactly */}
          <div className="flex items-center justify-between gap-3 flex-wrap">
            <div className="flex items-center gap-2">
              {hints.length > 0 && hintsRevealed < hints.length && (
                <button
                  onClick={() => setHintsRevealed(h => h + 1)}
                  className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl text-[12.5px] font-semibold text-blue-100 bg-blue-400/[0.10] border border-blue-300/[0.28] hover:bg-blue-400/[0.18] hover:border-blue-300/[0.45] transition-all"
                >
                  <Lightbulb size={13} strokeWidth={2.4} />
                  {hintsRevealed === 0 ? 'Give me a hint' : 'Next hint'}
                </button>
              )}
              <button
                onClick={() => setPhase('solution')}
                className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl text-[12.5px] font-semibold text-white/70 bg-white/[0.04] border border-white/[0.10] hover:bg-white/[0.08] hover:text-white hover:border-white/[0.20] transition-all"
              >
                <Eye size={13} strokeWidth={2.4} /> Show solution
              </button>
            </div>
            <button
              onClick={() => setPhase('done')}
              className="inline-flex items-center gap-2 px-4 py-2 rounded-xl font-semibold text-[13px] text-white bg-emerald-500/80 hover:bg-emerald-500 border border-emerald-400/40 transition-all"
            >
              <CheckCircle2 size={14} strokeWidth={2.3} /> I got it
            </button>
          </div>
        </>
      )}

      {/* ── Solution phase ── */}
      {phase === 'solution' && (
        <div className="mt-5">
          {hints.length > 0 ? (
            <div className="rounded-xl border border-white/[0.10] bg-white/[0.03] px-4 py-4 mb-4">
              <p className="text-[10px] font-bold uppercase tracking-[0.16em] text-white/45 mb-3">Solution</p>
              <div className="space-y-4">
                {hints.map((hint, i) => (
                  <div key={i}>
                    <div className="flex items-center gap-2.5 mb-1.5">
                      <span className="grid place-items-center w-5 h-5 rounded-md text-[10px] font-bold tabular-nums bg-blue-400/20 text-blue-200 flex-shrink-0">
                        {i + 1}
                      </span>
                      <MathText as="span" className="text-[13px] font-semibold text-white/80">
                        {hint.label || `Step ${i + 1}`}
                      </MathText>
                    </div>
                    <div className="ml-8">
                      <Prose className="
                        prose-p:text-white/70 prose-p:text-[14px] prose-p:my-0 prose-p:leading-[1.7]
                        prose-strong:text-white/85 prose-strong:font-semibold
                        prose-code:bg-white/[0.07] prose-code:text-white/80 prose-code:rounded prose-code:px-1 prose-code:py-0.5 prose-code:text-[12.5px] prose-code:before:content-none prose-code:after:content-none">
                        {hint.text}
                      </Prose>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          ) : (
            <p className="text-white/45 text-[14px] mb-4">
              Refer back to the worked example steps above for the approach.
            </p>
          )}

          <div className="flex items-center gap-2.5">
            <button
              onClick={() => setPhase('done')}
              className="inline-flex items-center gap-2 px-4 py-2 rounded-xl font-semibold text-[13px] text-white bg-emerald-500/80 hover:bg-emerald-500 border border-emerald-400/40 transition-all"
            >
              <CheckCircle2 size={14} strokeWidth={2.3} /> Got it
            </button>
            <button
              onClick={reset}
              className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl text-[12.5px] font-semibold text-white/70 bg-white/[0.04] border border-white/[0.10] hover:bg-white/[0.08] hover:text-white hover:border-white/[0.20] transition-all"
            >
              <RotateCcw size={12.5} strokeWidth={2.2} /> Try again
            </button>
          </div>
        </div>
      )}

      {/* ── Done phase — matches QuizBlock strong score card ── */}
      {phase === 'done' && (
        <div className="mt-5 flex items-center gap-3 rounded-3xl border border-emerald-500/25 bg-emerald-500/[0.08] px-6 py-5">
          <CheckCircle2 size={20} className="text-emerald-400 flex-shrink-0" strokeWidth={2.2} />
          <div className="flex-1 min-w-0">
            <p className="text-[15px] font-semibold text-white/90">Nice work!</p>
            <p className="text-[13px] text-white/45">You worked through the problem.</p>
          </div>
          {!hideContinue && (
            <button
              onClick={onComplete}
              className="shrink-0 inline-flex items-center gap-2.5 px-6 py-3 rounded-xl font-semibold text-[14px] text-white bg-blue-500 hover:bg-blue-400 transition-colors"
            >
              {continueLabel} <ArrowRight size={15} />
            </button>
          )}
        </div>
      )}
    </div>
  );
}

export default function ExampleBlock({ block, onComplete, hideContinue = false, continueLabel = 'Continue' }) {
  const steps = Array.isArray(block.steps) ? block.steps : [];
  const [revealed, setRevealed] = useState(0);

  return (
    <div className="cl-anim-in">
      <div className="border-t border-white/[0.07] pt-7 lg:pt-9 mb-6">
        <div className="mx-auto max-w-[68ch]">
          {/* Problem */}
          <Prose className="
            prose-headings:text-white prose-headings:font-semibold prose-headings:tracking-[-0.01em]
            prose-h2:text-[22px] prose-h2:mt-0 prose-h2:mb-4
            prose-p:text-white/80 prose-p:leading-[1.75] prose-p:text-[15.5px]
            prose-strong:text-white prose-strong:font-semibold
            prose-code:bg-white/[0.07] prose-code:text-white/85 prose-code:rounded prose-code:px-1.5 prose-code:py-0.5 prose-code:text-[13px] prose-code:before:content-none prose-code:after:content-none">
            {block.problem}
          </Prose>

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
                          open ? 'bg-blue-400/20 text-blue-200' : 'bg-white/[0.06] text-white/40'
                        }`}
                      >
                        {i + 1}
                      </span>
                      <MathText
                        as="span"
                        className={`flex-1 text-[13.5px] font-semibold ${open ? 'text-white/90' : 'text-white/55'}`}
                      >
                        {s.label || `Step ${i + 1}`}
                      </MathText>
                      <ChevronDown
                        size={14}
                        className={`text-white/30 transition-transform ${open ? 'rotate-180' : ''}`}
                      />
                    </button>
                    {open && (
                      <div className="px-4 pb-4 pt-1">
                        <Prose className="
                          prose-p:text-white/75 prose-p:leading-[1.7] prose-p:text-[14px] prose-p:my-2
                          prose-code:bg-white/[0.07] prose-code:text-white/85 prose-code:rounded prose-code:px-1 prose-code:py-0.5 prose-code:text-[12.5px] prose-code:before:content-none prose-code:after:content-none">
                          {s.text}
                        </Prose>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}

          {/* Now You Try — interactive practice mini-lesson */}
          {block.tryThis && (
            <NowYouTry
              problem={block.tryThis}
              hintSteps={steps}
              onComplete={onComplete}
              hideContinue={hideContinue}
              continueLabel={continueLabel}
            />
          )}
        </div>
      </div>

      {/* Fallback continue button when there is no tryThis section */}
      {!block.tryThis && !hideContinue && (
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
