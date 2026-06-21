import { useState } from 'react';
import { ArrowRight, AlertCircle, PenTool, Award } from 'lucide-react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import remarkMath from 'remark-math';
import rehypeKatex from 'rehype-katex';
import 'katex/dist/katex.min.css';
import { InlineProgress } from '../shared/ProgressBar';
import MathText from '../shared/MathText';

// Open-answer block. The student types a free-form response and the
// AI grades it inline against a small rubric - no separate Assignment
// surface. Sits in the lesson flow like any other block.
//
// Block shape:
//   { type: 'open', title, prompt, rubric: [{ label, criterion, weight }], minWords? }
//
// After submission the server stamps `block.submission = { text, score,
// perRubric, feedback, submittedAt }`. We surface that inline.
export default function OpenAnswerBlock({ block, onComplete, gradeFn, hideContinue = false, continueLabel = 'Continue' }) {
  const submission = block.submission;
  const [text, setText] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');
  const minWords = block.minWords || 40;
  const rubric = Array.isArray(block.rubric) ? block.rubric : [];

  async function handleSubmit() {
    setError('');
    const trimmed = text.trim();
    const wordCount = trimmed.split(/\s+/).filter(Boolean).length;
    if (wordCount < minWords) {
      setError(`Write at least ${minWords} words before submitting.`);
      return;
    }
    if (!gradeFn) {
      setError('Grading is unavailable for this block.');
      return;
    }
    setSubmitting(true);
    try {
      await gradeFn(block.id, trimmed);
      setText('');
    } catch (e) {
      setError(e?.message || 'Failed to submit. Try again.');
    }
    setSubmitting(false);
  }

  const wordCount = text.trim().split(/\s+/).filter(Boolean).length;

  return (
    <div className="cl-anim-in">
      <div className="border-t border-white/[0.07] pt-7 lg:pt-9 mb-6">
        <div className="mx-auto max-w-[68ch]">
          {/* Type chip */}
          <div className="flex items-center gap-2 mb-3">
            {submission && (
              <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold tracking-wide ${gradeStyle(submission.score)}`}>
                <Award size={10} /> {submission.letter || letterFor(submission.score)} · {submission.score}/100
              </span>
            )}
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

          {/* Rubric - what the grader will look for */}
          {rubric.length > 0 && (
            <div className="mt-5 px-0 py-0">
              <p className="text-[10px] font-bold uppercase tracking-[0.16em] text-white/45 mb-2">Rubric</p>
              <ul className="space-y-1.5">
                {rubric.map((r, i) => {
                  const ps = submission?.perRubric?.find(p => String(p.label).toLowerCase() === String(r.label).toLowerCase());
                  return (
                    <li key={i} className="flex items-start gap-2.5 text-[12.5px]">
                      <span className="grid place-items-center w-4 h-4 mt-[2px] rounded text-[9px] font-bold bg-blue-500/[0.25] text-blue-200/90 tabular-nums flex-shrink-0">
                        {i + 1}
                      </span>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center justify-between gap-2">
                          <MathText as="span" className="font-semibold text-white/85">{r.label}</MathText>
                          {ps && (
                            <span className={`px-1.5 py-0.5 rounded text-[10px] font-bold tabular-nums ${gradeStyle(ps.score)}`}>
                              {ps.score}
                            </span>
                          )}
                        </div>
                        <MathText as="p" className="text-white/55 mt-0.5 leading-snug">{r.criterion}</MathText>
                        {ps?.note && (
                          <MathText as="p" className="text-white/75 italic mt-1 leading-snug">{ps.note}</MathText>
                        )}
                      </div>
                    </li>
                  );
                })}
              </ul>
            </div>
          )}

          {/* Submission state - graded */}
          {submission ? (
            <div className="mt-5 rounded-xl border border-emerald-400/[0.22] bg-emerald-500/[0.05] px-4 py-3.5">
              <p className="text-[10px] font-bold uppercase tracking-[0.16em] text-emerald-300/80 mb-1.5">Feedback</p>
              <MathText as="p" className="text-[14px] text-white/85 leading-relaxed whitespace-pre-wrap">{submission.feedback}</MathText>
              <details className="mt-3 group">
                <summary className="cursor-pointer text-[11.5px] text-white/45 hover:text-white/75 select-none">
                  Show your submitted response
                </summary>
                <p className="mt-2 rounded-lg border border-white/[0.06] bg-white/[0.025] px-3 py-2 text-[12.5px] text-white/72 whitespace-pre-wrap leading-relaxed">
                  {submission.text}
                </p>
              </details>
            </div>
          ) : (
            /* Submission state - input */
            <div className="mt-6">
              <label className="text-[10px] font-bold uppercase tracking-[0.16em] text-white/45 mb-2 block">Your response</label>
              <textarea
                value={text}
                onChange={e => setText(e.target.value)}
                placeholder="Write a few thoughtful paragraphs…"
                rows={8}
                className="w-full rounded-xl border border-white/[0.09] bg-white/[0.03] px-4 py-3 text-[14px] text-white/90 placeholder-white/30 focus:outline-none focus:border-sky-400/40 focus:ring-2 focus:ring-sky-400/15 resize-y leading-relaxed"
              />
              <div className="flex items-center justify-between mt-2">
                <span className={`text-[11px] tabular-nums ${wordCount >= minWords ? 'text-emerald-300/70' : 'text-white/35'}`}>
                  {wordCount} / {minWords} words
                </span>
                {error && (
                  <span className="inline-flex items-center gap-1.5 text-[12px] text-rose-300/90">
                    <AlertCircle size={12} /> {error}
                  </span>
                )}
              </div>
              <div className="flex justify-end mt-4">
                <button
                  onClick={handleSubmit}
                  disabled={submitting || wordCount < minWords}
                  className="inline-flex items-center gap-2 px-5 py-2.5 rounded-xl font-semibold text-[13.5px] text-white bg-blue-500 hover:bg-blue-400 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  {submitting ? <InlineProgress active /> : null}
                  {submitting ? 'Grading…' : 'Submit for grading'}
                </button>
              </div>
            </div>
          )}
        </div>
      </div>

      {!hideContinue && submission && (
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

function gradeStyle(score) {
  if (score == null) return 'bg-white/[0.06] text-white/55 border border-white/[0.10]';
  if (score >= 90) return 'bg-emerald-500/[0.18] border border-emerald-400/[0.30] text-emerald-200';
  if (score >= 80) return 'bg-blue-500/[0.18] border border-blue-400/[0.30] text-blue-200';
  if (score >= 70) return 'bg-amber-500/[0.18] border border-amber-400/[0.30] text-amber-200';
  return 'bg-rose-500/[0.18] border border-rose-400/[0.30] text-rose-200';
}

function letterFor(score) {
  if (score == null) return '-';
  if (score >= 93) return 'A';
  if (score >= 90) return 'A-';
  if (score >= 87) return 'B+';
  if (score >= 83) return 'B';
  if (score >= 80) return 'B-';
  if (score >= 77) return 'C+';
  if (score >= 73) return 'C';
  if (score >= 70) return 'C-';
  if (score >= 60) return 'D';
  return 'F';
}
