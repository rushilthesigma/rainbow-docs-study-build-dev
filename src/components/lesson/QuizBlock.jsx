import { useEffect, useMemo, useState } from 'react';
import { Check, X, ArrowRight } from 'lucide-react';
import { InlineProgress } from '../shared/ProgressBar';
import { gradeQuizBlock } from '../../api/curriculum';
import MarkdownMath from '../shared/MarkdownMath';

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
    const correctCount = (results.results || []).filter(r => r.correct).length;

    return (
      <div className="cl-anim-in">
        {/* Score — borderless, like a QBpedia section header */}
        <div className="pb-5 mb-5 border-b border-white/[0.07]">
          <div className="flex items-baseline gap-3 mb-1">
            <span className={`text-[48px] font-black tracking-tight leading-none tabular-nums ${scoreColor}`}>
              {score}<span className="text-[24px] text-white/25">%</span>
            </span>
            <span className="text-[11px] uppercase tracking-[0.18em] font-bold text-white/30">
              {isStrong ? 'Strong' : isMid ? 'Mostly there' : 'Review needed'}
            </span>
          </div>
          <p className="text-[13px] text-white/35 font-light">{correctCount} of {total} correct</p>
        </div>

        {/* Per-question breakdown — divider list like QBpedia sections */}
        <div className="flex flex-col divide-y divide-white/[0.05] mb-6">
          {block.questions.map((qq, i) => {
            const r = results.results?.find(x => x.qid === qq.id);
            const correct = r?.correct;
            const given = r?.given || '-';
            return (
              <div key={qq.id} className="py-4">
                <div className="flex items-start gap-3">
                  <span className={`w-4 h-4 rounded-full grid place-items-center shrink-0 mt-[3px] ${
                    correct ? 'bg-emerald-500/20 text-emerald-400' : 'bg-rose-500/20 text-rose-400'
                  }`}>
                    {correct ? <Check size={9} /> : <X size={9} />}
                  </span>
                  <div className="flex-1 min-w-0">
                    <MarkdownMath className="text-[13px] text-white/80 mb-1.5">{`${i + 1}. ${qq.prompt}`}</MarkdownMath>
                    <p className="text-[12px] text-white/35 font-light">
                      Your answer: <span className={correct ? 'text-emerald-400' : 'text-rose-400'}>{given}</span>
                      {!correct && <> · Correct: <span className="text-emerald-400">{qq.answer}</span></>}
                    </p>
                    {qq.explanation && (
                      <MarkdownMath className="text-[11.5px] text-white/30 mt-2 font-light italic">{qq.explanation}</MarkdownMath>
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
            className="inline-flex items-center gap-2 px-5 py-2 rounded-lg font-semibold text-[13px] text-white bg-blue-500 hover:bg-blue-400 transition-colors"
          >
            Continue <ArrowRight size={14} />
          </button>
        </div>
      </div>
    );
  }

  // ===== ACTIVE QUESTION =====
  if (!q) return (
    <div className="py-8 text-[13px] text-white/35 text-center">No questions in this block.</div>
  );
  const selected = picks[q.id];

  return (
    <div className="cl-anim-in">
      {/* QBpedia-style thin progress bar + counter */}
      <div className="flex items-center gap-3 mb-7">
        <div className="flex-1 h-[3px] rounded-full overflow-hidden bg-white/[0.07]">
          <div
            className="h-full bg-blue-400 transition-all duration-300 ease-out rounded-full"
            style={{ width: `${((idx + 1) / total) * 100}%` }}
          />
        </div>
        <span className="text-[11px] tabular-nums text-white/30 flex-shrink-0">
          {idx + 1} / {total}
        </span>
      </div>

      {/* Question — no card, text sits directly on background like QBpedia lead */}
      <MarkdownMath className="mb-7 text-[14px] leading-[1.75] text-white/85 font-light">{q.prompt}</MarkdownMath>

      {/* Choices — left-border accent */}
      <div className="flex flex-col gap-1.5">
        {(q.choices || []).map((c, i) => {
          const letter = String.fromCharCode(65 + i);
          const isPicked = selected === c;
          return (
            <button
              key={i}
              onClick={() => pick(c)}
              disabled={submitting}
              className={`w-full text-left flex items-start gap-3 px-4 py-3 rounded-xl transition-all ${
                isPicked
                  ? 'bg-blue-500 text-white shadow-[0_0_16px_rgba(59,130,246,0.3)]'
                  : 'bg-white/[0.05] text-white/55 hover:bg-white/[0.08] hover:text-white/80'
              }`}
            >
              <span className={`text-[11px] font-bold shrink-0 mt-0.5 w-4 tabular-nums ${
                isPicked ? 'text-white/80' : 'text-white/25'
              }`}>{letter}</span>
              <MarkdownMath inline className="text-[13.5px] leading-[1.7] flex-1">{c}</MarkdownMath>
            </button>
          );
        })}
      </div>

      {/* Footer: dots + nav */}
      <div className="mt-7 flex items-center justify-between">
        <div className="flex gap-1">
          {block.questions.map((_, i) => (
            <span key={i} className={`w-1.5 h-1.5 rounded-full transition-colors ${
              i === idx ? 'bg-blue-400' : picks[block.questions[i].id] ? 'bg-blue-500/45' : 'bg-white/[0.10]'
            }`} />
          ))}
        </div>
        {idx + 1 === total ? (
          <button
            onClick={submit}
            disabled={!allAnswered || submitting}
            className="inline-flex items-center gap-2 px-5 py-2 rounded-lg font-semibold text-[13px] text-white bg-blue-500 hover:bg-blue-400 disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
          >
            {submitting ? <><InlineProgress active /> Grading…</> : 'Submit'}
          </button>
        ) : (
          <button
            onClick={() => setIdx(i => Math.min(total - 1, i + 1))}
            disabled={!selected}
            className="inline-flex items-center gap-1.5 text-[13px] text-white/45 hover:text-white/80 disabled:opacity-25 transition-colors"
          >
            Next <ArrowRight size={14} />
          </button>
        )}
      </div>
    </div>
  );
}
