import { useState, useEffect, useRef } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { ArrowLeft, Check, RotateCcw, ChevronLeft, ChevronRight } from 'lucide-react';
import { getCurriculum } from '../api/curriculum';
import { getLessonAssessment, gradeAssessment } from '../api/assessments';
import { apiFetch } from '../api/client';
import LoadingSpinner from '../components/shared/LoadingSpinner';
import MathText from '../components/shared/MathText';

export default function CurriculumAssessmentPage() {
  const { id: curriculumId, lessonId } = useParams();
  const navigate = useNavigate();

  const [curriculum, setCurriculum] = useState(null);
  const [loading, setLoading] = useState(true);
  const [generating, setGenerating] = useState(false);
  const [genPct, setGenPct] = useState(0);
  const [assessment, setAssessment] = useState(null);
  const [genError, setGenError] = useState(false);
  const [answers, setAnswers] = useState({});
  const [currentQ, setCurrentQ] = useState(0);
  const [grading, setGrading] = useState(false);
  const [result, setResult] = useState(null);
  const genIntervalRef = useRef(null);

  let currentUnit = null;
  for (const u of curriculum?.units || []) {
    if ((u.lessons || []).find(l => l.id === lessonId)) { currentUnit = u; break; }
  }

  useEffect(() => {
    if (generating) {
      setGenPct(0);
      genIntervalRef.current = setInterval(() => {
        setGenPct(prev => {
          const remaining = 88 - prev;
          if (remaining <= 0) return prev;
          return Math.min(88, prev + Math.max(0.3, remaining * 0.025));
        });
      }, 300);
    } else {
      clearInterval(genIntervalRef.current);
      setGenPct(100);
    }
    return () => clearInterval(genIntervalRef.current);
  }, [generating]);

  async function fetchAssessment(refresh = false) {
    setGenError(false);
    setGenerating(true);
    for (let attempt = 0; attempt < 3; attempt++) {
      try {
        const resp = await getLessonAssessment(curriculumId, lessonId, refresh || attempt > 0);
        if (resp?.assessment?.questions?.length) {
          setAssessment(resp.assessment);
          setGenerating(false);
          return;
        }
      } catch (err) {
        console.error('Assessment attempt', attempt + 1, err);
      }
    }
    setGenError(true);
    setGenerating(false);
  }

  useEffect(() => {
    async function load() {
      try {
        const data = await getCurriculum(curriculumId);
        setCurriculum(data.curriculum);
        const hasUnit = (data.curriculum?.units || []).some(u =>
          (u.lessons || []).find(l => l.id === lessonId)
        );
        if (hasUnit) await fetchAssessment(false);
      } catch (err) {
        console.error(err);
        setGenError(true);
      }
      setLoading(false);
    }
    load();
  }, [curriculumId, lessonId]);

  async function handleSubmit() {
    if (!assessment) return;
    setGrading(true);
    try {
      const res = await gradeAssessment(assessment, answers);
      setResult(res);
      try {
        await apiFetch(`/api/curriculum/${curriculumId}/lesson/${lessonId}/complete`, {
          method: 'POST',
          body: JSON.stringify({ score: res.percentage }),
        });
      } catch {}
    } catch (err) {
      console.error(err);
    }
    setGrading(false);
  }

  async function handleRetake(newQuestions = false) {
    setResult(null);
    setAnswers({});
    setCurrentQ(0);
    await fetchAssessment(newQuestions);
  }

  if (loading) return (
    <div className="flex items-center justify-center h-64">
      <LoadingSpinner size={28} />
    </div>
  );

  if (generating) {
    return (
      <div className="flex flex-col items-center justify-center py-32">
        <p className="text-[10px] font-black uppercase tracking-[0.22em] text-blue-300/70 mb-6">
          {currentUnit?.title || 'Assessment'}
        </p>
        <div className="w-64 mb-3">
          <div className="h-0.5 w-full bg-blue-400/[0.12] rounded-full overflow-hidden">
            <div className="h-full bg-gradient-to-r from-blue-400 to-blue-500 rounded-full transition-all duration-300 ease-out shadow-[0_0_8px_rgba(96,165,250,0.5)]" style={{ width: `${genPct}%` }} />
          </div>
        </div>
        <p className="text-[12px] text-blue-200/55">{Math.round(genPct)}%</p>
      </div>
    );
  }

  if (genError) {
    return (
      <div className="flex flex-col items-center justify-center py-32 gap-4">
        <p className="text-[13px] text-white/40">Could not load assessment.</p>
        <button
          onClick={() => fetchAssessment(true)}
          className="px-4 py-2 rounded-xl text-[13px] font-semibold text-white/80 bg-white/[0.08] border border-white/[0.14] hover:bg-white/[0.14] transition-colors"
        >
          Try again
        </button>
      </div>
    );
  }

  const WRAP = 'w-full max-w-5xl mx-auto';

  // ── Results view ──────────────────────────────────────────────────────────
  if (result) {
    const pct = result.percentage ?? 0;
    const passed = pct >= 70;

    const reviewItems = (result.details || []).map((d, i) => ({
      ...d,
      options: assessment?.questions?.[i]?.options || [],
      userAnswer: d.answer || d.userAnswer || '',
    }));

    return (
      <div className={WRAP}>
        <button
          onClick={() => navigate(`/curriculum/${curriculumId}`)}
          className="inline-flex items-center gap-1.5 text-[13px] text-white/35 hover:text-white/65 transition-colors mb-6"
        >
          <ArrowLeft size={14} /> Back
        </button>

        {/* Score banner */}
        <div className={`rounded-2xl p-6 mb-6 text-center border ${
          passed
            ? 'bg-emerald-900/15 border-emerald-700/40'
            : 'bg-rose-900/15 border-rose-700/40'
        }`}>
          <p className={`text-5xl font-bold mb-1 ${passed ? 'text-emerald-400' : 'text-rose-400'}`}>
            {pct}%
          </p>
          <p className={`text-[13px] ${passed ? 'text-emerald-400/80' : 'text-rose-400/80'}`}>
            {result.score}/{result.total} correct
          </p>
          <p className="text-[11px] text-white/30 mt-1">{currentUnit?.title}</p>
        </div>

        {/* Per-question review */}
        <div className="flex flex-col gap-4 mb-6">
          {reviewItems.map((d, i) => (
            <div key={i} className="rounded-2xl border border-white/[0.07] bg-white/[0.03] p-5">
              <div className="flex items-start gap-2 mb-4">
                <span className={`flex-shrink-0 mt-0.5 w-5 h-5 rounded-full flex items-center justify-center text-[11px] font-bold ${
                  d.correct ? 'bg-emerald-500/25 text-emerald-400' : 'bg-rose-500/25 text-rose-400'
                }`}>
                  {d.correct ? '✓' : '✗'}
                </span>
                <MathText as="p" className="text-[14px] font-medium text-white/85 leading-relaxed">
                  {i + 1}. {d.question}
                </MathText>
              </div>

              <div className="flex flex-col gap-2">
                {d.options.map((opt) => {
                  const letter = opt.charAt(0);
                  const text = opt.length > 2 && opt[1] === ')' ? opt.slice(2).trim() : opt;
                  const isCorrect = letter === d.correctAnswer;
                  const isWrong = letter === d.userAnswer && !isCorrect;

                  let rowCls = 'border-white/[0.06] bg-white/[0.02] text-white/30';
                  let badgeCls = 'bg-white/[0.08] text-white/30';

                  if (isCorrect) {
                    rowCls = 'border-emerald-700/50 bg-emerald-900/20 text-white/80';
                    badgeCls = 'bg-emerald-500 text-white';
                  }
                  if (isWrong) {
                    rowCls = 'border-rose-700/50 bg-rose-900/20 text-white/80';
                    badgeCls = 'bg-rose-500 text-white';
                  }

                  return (
                    <div key={opt} className={`flex items-start gap-3 px-3 py-2.5 rounded-xl border text-[13px] ${rowCls}`}>
                      <span className={`flex-shrink-0 w-5 h-5 rounded-full flex items-center justify-center text-[10px] font-bold mt-0.5 ${badgeCls}`}>
                        {letter}
                      </span>
                      <MathText className="leading-relaxed flex-1">{text}</MathText>
                      {isCorrect && <span className="ml-auto flex-shrink-0 text-[11px] font-semibold text-emerald-400">Correct</span>}
                      {isWrong && <span className="ml-auto flex-shrink-0 text-[11px] font-semibold text-rose-400">Yours</span>}
                    </div>
                  );
                })}
              </div>

              {d.explanation && (
                <p className="mt-3 text-[12px] text-white/35 border-t border-white/[0.06] pt-3">
                  {d.explanation}
                </p>
              )}
            </div>
          ))}
        </div>

        <div className="flex gap-2 justify-center">
          <button
            onClick={() => handleRetake(false)}
            className="inline-flex items-center gap-2 px-4 py-2 rounded-xl text-[13px] font-semibold text-white/80 bg-white/[0.08] border border-white/[0.14] hover:bg-white/[0.14] transition-colors"
          >
            <RotateCcw size={13} /> Retake
          </button>
          <button
            onClick={() => handleRetake(true)}
            className="inline-flex items-center gap-2 px-4 py-2 rounded-xl text-[13px] font-semibold text-white/55 bg-white/[0.04] border border-white/[0.08] hover:bg-white/[0.08] hover:text-white/75 transition-colors"
          >
            New Questions
          </button>
          <button
            onClick={() => navigate(`/curriculum/${curriculumId}`)}
            className="px-4 py-2 rounded-xl text-[13px] font-semibold text-white/45 hover:text-white/70 transition-colors"
          >
            Back
          </button>
        </div>
      </div>
    );
  }

  // ── Quiz view ─────────────────────────────────────────────────────────────
  const questions = assessment.questions;
  const q = questions[currentQ];
  const answeredCount = questions.filter(qu => answers[qu.id]).length;
  const allAnswered = answeredCount === questions.length;
  const progressPct = Math.round((answeredCount / questions.length) * 100);

  return (
    <div className={WRAP}>
      <div className="flex items-center justify-between mb-6">
        <button
          onClick={() => navigate(`/curriculum/${curriculumId}`)}
          className="inline-flex items-center gap-1.5 text-[13px] text-white/35 hover:text-white/65 transition-colors"
        >
          <ArrowLeft size={14} /> Back
        </button>
        <p className="text-[10px] font-black uppercase tracking-[0.22em] text-white/30">
          {currentUnit?.title}
        </p>
      </div>

      <div className="flex gap-6 items-start">
        {/* Left: question */}
        <div className="flex-1 min-w-0">
          <div className="mb-5">
            <div className="flex items-center justify-between mb-1.5">
              <span className="text-[12px] text-blue-200/55">Question {currentQ + 1} of {questions.length}</span>
              <span className="text-[12px] text-blue-200/55">{answeredCount} answered</span>
            </div>
            <div className="h-0.5 w-full bg-blue-400/[0.12] rounded-full overflow-hidden">
              <div className="h-full bg-gradient-to-r from-blue-400 to-blue-500 rounded-full transition-all duration-300 shadow-[0_0_6px_rgba(96,165,250,0.4)]" style={{ width: `${progressPct}%` }} />
            </div>
          </div>

          <div className="rounded-2xl border border-blue-400/[0.18] bg-gradient-to-b from-blue-500/[0.06] to-blue-500/[0.02] backdrop-blur-sm p-6 mb-4 shadow-[0_0_36px_-14px_rgba(59,130,246,0.30)]">
            <MathText as="p" className="text-[15px] leading-relaxed font-medium text-white/90 mb-6">
              {q.question}
            </MathText>

            <div className="flex flex-col gap-2.5">
              {(q.options || []).map((opt) => {
                const letter = opt.charAt(0);
                const text = opt.length > 2 && opt[1] === ')' ? opt.slice(2).trim() : opt;
                const selected = answers[q.id] === letter;
                return (
                  <button
                    key={opt}
                    onClick={() => setAnswers(prev => ({ ...prev, [q.id]: letter }))}
                    className={`w-full text-left flex items-start gap-3 px-4 py-3.5 rounded-xl border text-[13px] transition-all ${
                      selected
                        ? 'border-blue-400/55 bg-blue-500/[0.14] text-white shadow-[inset_0_1px_0_rgba(255,255,255,0.12),0_4px_18px_rgba(59,130,246,0.25)]'
                        : 'border-blue-400/[0.10] bg-blue-500/[0.03] text-white/65 hover:border-blue-400/[0.30] hover:bg-blue-500/[0.08] hover:text-white'
                    }`}
                  >
                    <span className={`flex-shrink-0 w-6 h-6 rounded-full flex items-center justify-center text-[11px] font-bold mt-0.5 ${
                      selected
                        ? 'bg-gradient-to-b from-blue-400 to-blue-500 text-white border border-blue-300/55 shadow-[inset_0_1px_0_rgba(255,255,255,0.20)]'
                        : 'bg-blue-500/[0.08] text-blue-200/55 border border-blue-400/[0.18]'
                    }`}>
                      {letter}
                    </span>
                    <MathText className="leading-relaxed">{text}</MathText>
                  </button>
                );
              })}
            </div>
          </div>

          <div className="flex items-center justify-between">
            <button
              onClick={() => setCurrentQ(i => Math.max(0, i - 1))}
              disabled={currentQ === 0}
              className="inline-flex items-center gap-1 px-3 py-2 rounded-lg text-[13px] text-blue-200/55 hover:text-blue-100 hover:bg-blue-500/[0.08] disabled:opacity-30 disabled:pointer-events-none transition-colors"
            >
              <ChevronLeft size={15} /> Previous
            </button>

            {currentQ < questions.length - 1 ? (
              <button
                onClick={() => setCurrentQ(i => i + 1)}
                className="inline-flex items-center gap-1 px-4 py-2 rounded-lg text-[13px] font-semibold text-blue-100 hover:text-white hover:bg-blue-500/[0.10] transition-colors"
              >
                Next <ChevronRight size={15} />
              </button>
            ) : (
              <button
                onClick={handleSubmit}
                disabled={!allAnswered || grading}
                className="inline-flex items-center gap-2 px-5 py-2.5 rounded-xl text-[13px] font-bold text-white bg-gradient-to-b from-blue-500 to-blue-600 hover:from-blue-400 hover:to-blue-500 border border-blue-400/45 shadow-[inset_0_1px_0_rgba(255,255,255,0.20),0_4px_16px_rgba(59,130,246,0.40)] disabled:opacity-40 disabled:pointer-events-none transition-all"
              >
                {grading ? <><LoadingSpinner size={13} /> Grading</> : <><Check size={13} /> Submit</>}
              </button>
            )}
          </div>
        </div>

        {/* Right: question grid sidebar */}
        <div className="hidden lg:block w-44 flex-shrink-0 sticky top-6">
          <div className="grid grid-cols-4 gap-1.5 mb-4">
            {questions.map((qu, i) => (
              <button
                key={qu.id}
                onClick={() => setCurrentQ(i)}
                className={`w-9 h-9 rounded-lg text-[11px] font-semibold transition-colors ${
                  i === currentQ
                    ? 'bg-gradient-to-b from-blue-500 to-blue-600 text-white border border-blue-400/55 shadow-[inset_0_1px_0_rgba(255,255,255,0.18),0_2px_10px_rgba(59,130,246,0.35)]'
                    : answers[qu.id]
                      ? 'bg-blue-500/[0.14] text-blue-200 border border-blue-400/30'
                      : 'bg-blue-500/[0.04] text-blue-200/45 border border-blue-400/[0.10] hover:bg-blue-500/[0.10] hover:text-blue-100 hover:border-blue-400/[0.25]'
                }`}
              >
                {i + 1}
              </button>
            ))}
          </div>

          {allAnswered && (
            <button
              onClick={handleSubmit}
              disabled={grading}
              className="w-full inline-flex items-center justify-center gap-2 px-3 py-2.5 rounded-xl text-[13px] font-bold text-white bg-gradient-to-b from-blue-500 to-blue-600 hover:from-blue-400 hover:to-blue-500 border border-blue-400/45 shadow-[inset_0_1px_0_rgba(255,255,255,0.20),0_4px_16px_rgba(59,130,246,0.40)] disabled:opacity-40 transition-all"
            >
              {grading ? <LoadingSpinner size={13} /> : <Check size={13} />}
              Submit
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
