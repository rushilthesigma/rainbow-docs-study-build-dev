import { useEffect, useMemo, useState } from 'react';
import { Check, X, ArrowRight, Loader2 } from 'lucide-react';
import { InlineProgress } from '../shared/ProgressBar';
import { gradeQuizBlock } from '../../api/curriculum';
import MathText from '../shared/MathText';

function defaultCurriculumGrader(curriculumId, lessonId, blockId, responses) {
  return gradeQuizBlock(curriculumId, lessonId, blockId, responses);
}

const STORAGE_PREFIX = 'covalent-quiz-draft-';
function loadDraft(blockId) {
  try { return JSON.parse(localStorage.getItem(STORAGE_PREFIX + blockId) || 'null'); } catch { return null; }
}
function saveDraft(blockId, payload) {
  try { localStorage.setItem(STORAGE_PREFIX + blockId, JSON.stringify(payload)); } catch {}
}
function clearDraft(blockId) {
  try { localStorage.removeItem(STORAGE_PREFIX + blockId); } catch {}
}

export default function QuizBlock({ curriculumId, lessonId, block, onComplete, gradeFn }) {
  const draft = useMemo(() => loadDraft(block.id), [block.id]);
  const [idx, setIdx] = useState(draft?.idx ?? 0);
  const [picks, setPicks] = useState(draft?.picks ?? {});
  const [submitting, setSubmitting] = useState(false);
  const [results, setResults] = useState(null);

  useEffect(() => {
    if (results) return;
    saveDraft(block.id, { idx, picks });
  }, [block.id, idx, picks, results]);

  const total = block.questions?.length || 0;
  const q = block.questions?.[idx];
  const allAnswered = useMemo(() => Object.keys(picks).length === total, [picks, total]);

  function pick(choice) { if (q && !results) setPicks(p => ({ ...p, [q.id]: choice })); }

  async function submit() {
    setSubmitting(true);
    try {
      const responses = block.questions.map(qq => ({ qid: qq.id, given: picks[qq.id] || '' }));
      const grader = gradeFn || ((bid, resp) => defaultCurriculumGrader(curriculumId, lessonId, bid, resp));
      const res = await grader(block.id, responses);
      clearDraft(block.id);
      setResults(res);
    } catch (e) {
      setResults({ score: 0, results: [], error: e.message || 'Failed to submit' });
    } finally { setSubmitting(false); }
  }

  // ===== RESULTS VIEW =====
  if (results) {
    const score = results.score || 0;
    const isStrong = score >= 80;
    const isMid = score >= 50;
    const scoreColor = isStrong ? 'text-emerald-400' : isMid ? 'text-white/80' : 'text-rose-400';
    const scoreBorder = isStrong ? 'border-emerald-500/25 bg-emerald-500/8' : isMid ? 'border-white/[0.10] bg-white/[0.04]' : 'border-rose-500/25 bg-rose-500/8';
    const correctCount = (results.results || []).filter(r => r.correct).length;

    return (
      <div className="cl-anim-in">
        {/* Score hero */}
        <div className={`rounded-3xl border p-8 mb-5 ${scoreBorder}`}>
          <div className="flex items-baseline justify-between mb-1">
            <span className={`text-[52px] font-black tracking-tight leading-none tabular-nums ${scoreColor}`}>
              {score}<span className="text-[28px] text-white/30">%</span>
            </span>
            <span className="text-[11px] uppercase tracking-[0.18em] font-bold text-white/40">
              {isStrong ? 'Strong' : isMid ? 'Mostly there' : 'Review needed'}
            </span>
          </div>
          <p className="text-[13px] text-white/45">{correctCount} of {total} correct</p>
        </div>

        {/* Per-question breakdown */}
        <div className="flex flex-col gap-2.5 mb-5">
          {block.questions.map((qq, i) => {
            const r = results.results?.find(x => x.qid === qq.id);
            const correct = r?.correct;
            const given = r?.given || '-';
            return (
              <div key={qq.id} className={`rounded-2xl border p-4 ${correct ? 'border-emerald-500/15 bg-emerald-500/5' : 'border-rose-500/15 bg-rose-500/5'}`}>
                <div className="flex items-start gap-3">
                  <span className={`w-5 h-5 rounded-full grid place-items-center shrink-0 mt-0.5 ${correct ? 'bg-emerald-500/20 text-emerald-400' : 'bg-rose-500/20 text-rose-400'}`}>
                    {correct ? <Check size={11} /> : <X size={11} />}
                  </span>
                  <div className="flex-1 min-w-0">
                    <MathText as="p" className="text-[13px] font-medium text-white/90 mb-1.5">{`${i + 1}. ${qq.prompt}`}</MathText>
                    <p className="text-[12px] text-white/40">
                      Your answer: <span className={correct ? 'text-emerald-400 font-medium' : 'text-rose-400 font-medium'}>{given}</span>
                      {!correct && <> · Correct: <span className="text-emerald-400 font-medium">{qq.answer}</span></>}
                    </p>
                    {qq.explanation && (
                      <p className="text-[11.5px] text-white/35 mt-2 pt-2 border-t border-white/[0.06] leading-relaxed">{qq.explanation}</p>
                    )}
                  </div>
                </div>
              </div>
            );
          })}
        </div>

        <div className="flex justify-end">
          <button
            onClick={() => onComplete?.(results)}
            className="inline-flex items-center gap-2.5 px-6 py-3 rounded-2xl font-bold text-[14px] text-white bg-blue-500 hover:bg-blue-400 transition-colors"
          >
            Continue <ArrowRight size={15} />
          </button>
        </div>
      </div>
    );
  }

  // ===== ACTIVE QUESTION =====
  if (!q) return (
    <div className="rounded-3xl border border-white/[0.06] bg-white/[0.02] p-6 text-[13px] text-white/55">
      No questions in this block.
    </div>
  );
  const selected = picks[q.id];

  return (
    <div className="cl-anim-in">
      <div className="rounded-3xl border border-white/[0.06] bg-white/[0.02] p-7 lg:p-10">
        {/* Quiz header - title shown in StageTracker above, so only the
            question counter lives here. */}
        <div className="flex items-center justify-end mb-7">
          <span className="text-[12px] font-mono text-white/45 tabular-nums">
            {idx + 1} <span className="text-white/20">/</span> {total}
          </span>
        </div>

        {/* Question */}
        <MathText as="h3" className="text-[18px] leading-relaxed text-white font-semibold mb-7">{q.prompt}</MathText>

        {/* Choices */}
        <div className="flex flex-col gap-2.5">
          {(q.choices || []).map((c, i) => {
            const letter = String.fromCharCode(65 + i);
            const isPicked = selected === c;
            return (
              <button
                key={i}
                onClick={() => pick(c)}
                disabled={submitting}
                className={`text-left flex items-start gap-3.5 px-5 py-4 rounded-2xl border transition-all ${
                  isPicked
                    ? 'border-blue-400/55 bg-blue-500/[0.14] text-white'
                    : 'border-white/[0.08] bg-white/[0.02] text-white/80 hover:border-white/[0.18] hover:bg-white/[0.04] hover:text-white'
                }`}
              >
                <span className={`w-6 h-6 rounded-lg grid place-items-center font-mono text-[11px] font-bold shrink-0 mt-0.5 transition-colors ${
                  isPicked
                    ? 'bg-blue-500 text-white border border-blue-300/50'
                    : 'bg-white/[0.04] text-white/55 border border-white/[0.10]'
                }`}>{letter}</span>
                <MathText className="text-[14px] leading-relaxed flex-1">{c}</MathText>
              </button>
            );
          })}
        </div>

        {/* Footer: dots + action button */}
        <div className="mt-8 flex items-center justify-between">
          <div className="flex gap-1.5">
            {block.questions.map((_, i) => (
              <span key={i} className={`w-1.5 h-1.5 rounded-full transition-colors ${
                i === idx ? 'bg-blue-400' : (i < idx || picks[block.questions[i].id]) ? 'bg-blue-500/55' : 'bg-white/[0.12]'
              }`} />
            ))}
          </div>
          {idx + 1 === total ? (
            <button
              onClick={submit}
              disabled={!allAnswered || submitting}
              className="inline-flex items-center gap-2.5 px-6 py-3 rounded-2xl font-bold text-[14px] text-white bg-blue-500 hover:bg-blue-400 disabled:opacity-35 disabled:cursor-not-allowed transition-colors"
            >
              {submitting ? <><InlineProgress active /> Grading…</> : 'Submit answers'}
            </button>
          ) : (
            <button
              onClick={() => setIdx(i => Math.min(total - 1, i + 1))}
              disabled={!selected}
              className="inline-flex items-center gap-2 px-5 py-2.5 rounded-2xl font-semibold text-[13px] text-blue-100 bg-blue-500/[0.10] border border-blue-400/[0.30] hover:bg-blue-500/[0.18] hover:text-white hover:border-blue-400/[0.45] disabled:opacity-35 transition-all"
            >
              Next <ArrowRight size={14} />
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
