import { useEffect, useMemo, useState } from 'react';
import { Check, X, ArrowRight, Loader2 } from 'lucide-react';
import { InlineProgress } from '../shared/ProgressBar';
import { gradeQuizBlock } from '../../api/curriculum';

// Default grader for the legacy curriculum-bound shape.
// When a host passes `gradeFn` (BlockLessonView always does now), we
// use that instead — that keeps the standalone Lessons + curriculum
// flows on a single component.
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

// Multi-choice quiz block. One question at a time, choice cards,
// submit → grade → results page with per-question explanations. The
// final quiz uses the same component but server includes more questions.
//
// Two host shapes:
//   1. Pass `gradeFn(blockId, responses)` (preferred — used by both
//      curriculum and standalone hosts via BlockLessonView).
//   2. Legacy: pass `curriculumId` + `lessonId` and the default
//      curriculum grader is used. Kept for any direct callers.
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
    const tone = score >= 80 ? '#22c55e' : score >= 50 ? '#f59e0b' : '#ef4444';
    const toneBg = score >= 80 ? 'rgba(34,197,94,0.10)' : score >= 50 ? 'rgba(245,158,11,0.10)' : 'rgba(239,68,68,0.10)';
    const correctCount = (results.results || []).filter(r => r.correct).length;
    return (
      <div className="cl-anim-in">
        <div className="rounded-2xl border p-6 mb-4" style={{ borderColor: tone, background: toneBg }}>
          <div className="flex items-baseline justify-between">
            <h3 className="text-3xl font-black tracking-tight" style={{ color: tone }}>{score}%</h3>
            <span className="text-[11px] uppercase tracking-wider font-bold text-gray-300">
              {score >= 80 ? 'Strong' : score >= 50 ? 'Mostly there' : 'Review needed'}
            </span>
          </div>
          <p className="text-[13px] text-gray-300 mt-1">{correctCount} of {total} correct</p>
        </div>

        <div className="flex flex-col gap-3 mb-4">
          {block.questions.map((qq, i) => {
            const r = results.results?.find(x => x.qid === qq.id);
            const correct = r?.correct;
            const given = r?.given || '—';
            return (
              <div key={qq.id} className="rounded-xl border border-blue-500/15 bg-[#0f1124]/80 backdrop-blur p-4">
                <div className="flex items-start gap-3">
                  <span className={`w-6 h-6 rounded-full grid place-items-center shrink-0 text-white ${correct ? 'bg-emerald-500' : 'bg-rose-500'}`}>
                    {correct ? <Check size={13} /> : <X size={13} />}
                  </span>
                  <div className="flex-1 min-w-0">
                    <div className="text-[13px] font-medium text-white mb-1.5">{i + 1}. {qq.prompt}</div>
                    <div className="text-[12px] text-gray-400">
                      Your answer: <span className={correct ? 'text-emerald-400' : 'text-rose-400'}>{given}</span>
                      {!correct && <> · Correct: <span className="text-emerald-400 font-medium">{qq.answer}</span></>}
                    </div>
                    {qq.explanation && (
                      <div className="text-[12px] text-gray-300 mt-2 pt-2 border-t border-blue-500/10 italic">{qq.explanation}</div>
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
            className="inline-flex items-center gap-2 px-5 py-2.5 rounded-xl font-semibold text-[14px] text-white bg-gradient-to-r from-blue-600 to-indigo-600 shadow-lg shadow-blue-500/30"
          >
            Continue <ArrowRight size={14} />
          </button>
        </div>
      </div>
    );
  }

  // ===== ACTIVE QUESTION =====
  if (!q) return <div className="rounded-xl border border-blue-500/15 bg-[#0f1124]/80 p-6 text-sm text-gray-400">No questions in this block.</div>;
  const selected = picks[q.id];

  return (
    <div className="cl-anim-in">
      <div className="rounded-2xl border border-blue-500/15 bg-[#0f1124]/80 backdrop-blur p-6 lg:p-8">
        <div className="flex items-center justify-between mb-5">
          <span className="inline-flex items-center gap-1.5 text-[11px] font-bold uppercase tracking-[0.16em] px-2 py-0.5 rounded-md bg-blue-500/15 text-blue-300 border border-blue-500/30">
            {block.title || 'Check'}
          </span>
          <span className="text-[12px] font-mono text-gray-500 tabular-nums">Q {idx + 1} / {total}</span>
        </div>
        <h3 className="text-[17px] leading-relaxed text-white mb-5 font-medium">{q.prompt}</h3>
        <div className="flex flex-col gap-2.5">
          {(q.choices || []).map((c, i) => {
            const letter = String.fromCharCode(65 + i);
            const isPicked = selected === c;
            return (
              <button
                key={i}
                onClick={() => pick(c)}
                disabled={submitting}
                className={`text-left flex items-start gap-3 px-4 py-3 rounded-xl border transition-all ${
                  isPicked
                    ? 'border-blue-400 bg-blue-500/15 text-white shadow-lg shadow-blue-500/20'
                    : 'border-blue-500/10 bg-[#0a0a14] text-gray-200 hover:border-blue-500/40 hover:bg-blue-500/5'
                }`}
              >
                <span className={`w-6 h-6 rounded-md grid place-items-center font-mono text-[12px] font-bold shrink-0 ${
                  isPicked ? 'bg-gradient-to-br from-blue-500 to-indigo-500 text-white' : 'bg-[#0a0a14] text-gray-400 border border-blue-500/15'
                }`}>{letter}</span>
                <span className="text-[14px] leading-snug">{c}</span>
              </button>
            );
          })}
        </div>
        <div className="mt-6 flex items-center justify-between">
          <div className="flex gap-1.5">
            {block.questions.map((_, i) => (
              <span key={i} className={`w-1.5 h-1.5 rounded-full transition-colors ${
                i === idx ? 'bg-blue-400' : i < idx || picks[block.questions[i].id] ? 'bg-blue-500/50' : 'bg-[#2A2A40]'
              }`} />
            ))}
          </div>
          {idx + 1 === total ? (
            <button
              onClick={submit}
              disabled={!allAnswered || submitting}
              className="inline-flex items-center gap-2 px-5 py-2.5 rounded-xl font-semibold text-[14px] text-white bg-gradient-to-r from-blue-600 to-indigo-600 shadow-lg shadow-blue-500/30 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {submitting ? <><InlineProgress active /> Grading…</> : 'Submit answers'}
            </button>
          ) : (
            <button
              onClick={() => setIdx(i => Math.min(total - 1, i + 1))}
              disabled={!selected}
              className="inline-flex items-center gap-2 px-4 py-2 rounded-xl font-semibold text-[13px] text-blue-200 bg-blue-500/10 border border-blue-500/30 hover:bg-blue-500/20 disabled:opacity-40"
            >
              Next <ArrowRight size={13} />
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
