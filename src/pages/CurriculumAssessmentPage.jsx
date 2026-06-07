import { useState, useEffect, useRef } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { ArrowLeft, RotateCcw, ChevronLeft, ChevronRight, CheckCircle, XCircle } from 'lucide-react';
import { getCurriculum } from '../api/curriculum';
import { getLessonAssessment, gradeAssessment } from '../api/assessments';
import { apiFetch } from '../api/client';
import LoadingSpinner from '../components/shared/LoadingSpinner';
import MathText from '../components/shared/MathText';

function letterGrade(pct) {
  if (pct >= 93) return 'A';
  if (pct >= 90) return 'A−';
  if (pct >= 87) return 'B+';
  if (pct >= 83) return 'B';
  if (pct >= 80) return 'B−';
  if (pct >= 77) return 'C+';
  if (pct >= 73) return 'C';
  if (pct >= 70) return 'C−';
  if (pct >= 67) return 'D+';
  if (pct >= 60) return 'D';
  return 'F';
}

function gradeColor(pct) {
  if (pct >= 80) return { text: 'text-emerald-400', bg: 'bg-emerald-500/10', border: 'border-emerald-500/30', bar: 'bg-emerald-500' };
  if (pct >= 65) return { text: 'text-amber-400',   bg: 'bg-amber-500/10',   border: 'border-amber-500/30',   bar: 'bg-amber-500'   };
  return               { text: 'text-rose-400',    bg: 'bg-rose-500/10',    border: 'border-rose-500/30',    bar: 'bg-rose-500'    };
}

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

  // ── Loading ───────────────────────────────────────────────────────────────
  if (loading) return (
    <div className="flex items-center justify-center h-64">
      <LoadingSpinner size={24} />
    </div>
  );

  // ── Generating ────────────────────────────────────────────────────────────
  if (generating) {
    return (
      <div className="flex flex-col items-center justify-center py-36 gap-5">
        <p className="text-[10px] font-black uppercase tracking-[0.22em] text-white/30">
          {currentUnit?.title || 'Assessment'}
        </p>
        <p className="text-[14px] font-semibold text-white/70">Building your assessment…</p>
        <div className="w-56">
          <div className="h-0.5 w-full bg-white/[0.08] rounded-full overflow-hidden">
            <div className="h-full bg-white/40 rounded-full transition-all duration-300 ease-out" style={{ width: `${genPct}%` }} />
          </div>
        </div>
        <p className="text-[11px] text-white/25 tabular-nums">{Math.round(genPct)}%</p>
      </div>
    );
  }

  // ── Error ─────────────────────────────────────────────────────────────────
  if (genError) {
    return (
      <div className="flex flex-col items-center justify-center py-32 gap-4">
        <p className="text-[13px] text-white/40">Could not load assessment.</p>
        <button
          onClick={() => fetchAssessment(true)}
          className="px-4 py-2 rounded-xl text-[13px] font-semibold text-white/70 bg-white/[0.07] border border-white/[0.12] hover:bg-white/[0.12] transition-colors"
        >
          Try again
        </button>
      </div>
    );
  }

  const WRAP = 'w-full max-w-5xl mx-auto';

  // ── Results ───────────────────────────────────────────────────────────────
  if (result) {
    const pct   = result.percentage ?? 0;
    const grade = letterGrade(pct);
    const col   = gradeColor(pct);

    const reviewItems = (result.details || []).map((d, i) => ({
      ...d,
      options: assessment?.questions?.[i]?.options || [],
      userAnswer: d.answer || d.userAnswer || '',
    }));

    return (
      <div className={WRAP}>
        <button
          onClick={() => navigate(`/curriculum/${curriculumId}`)}
          className="inline-flex items-center gap-1.5 text-[13px] text-white/30 hover:text-white/60 transition-colors mb-8"
        >
          <ArrowLeft size={14} /> Back to curriculum
        </button>

        {/* Score hero */}
        <div className={`rounded-2xl border ${col.border} ${col.bg} p-8 mb-6 flex flex-col items-center gap-3`}>
          <p className="text-[10px] font-black uppercase tracking-[0.22em] text-white/30">{currentUnit?.title}</p>
          <div className="flex items-end gap-3">
            <span className={`text-7xl font-black tabular-nums ${col.text}`}>{grade}</span>
            <span className={`text-3xl font-bold tabular-nums pb-1 ${col.text} opacity-60`}>{pct}%</span>
          </div>
          <p className="text-[13px] text-white/35">{result.score} / {result.total} correct</p>
          <div className="w-48 h-1 rounded-full bg-white/[0.08] overflow-hidden mt-1">
            <div className={`h-full rounded-full transition-all duration-700 ${col.bar}`} style={{ width: `${pct}%` }} />
          </div>
        </div>

        {/* Per-question review */}
        <p className="text-[10px] font-black uppercase tracking-[0.20em] text-white/25 mb-3 px-0.5">Question Review</p>
        <div className="flex flex-col gap-3 mb-8">
          {reviewItems.map((d, i) => {
            const isCorrect = d.correct;
            return (
              <div key={i} className={`rounded-2xl border p-4 ${isCorrect ? 'border-emerald-800/40 bg-emerald-900/10' : 'border-rose-800/40 bg-rose-900/10'}`}>
                <div className="flex items-start gap-3 mb-3">
                  {isCorrect
                    ? <CheckCircle size={16} className="text-emerald-400 flex-shrink-0 mt-0.5" />
                    : <XCircle    size={16} className="text-rose-400 flex-shrink-0 mt-0.5" />}
                  <MathText as="p" className="text-[13px] font-medium text-white/80 leading-relaxed">
                    {i + 1}. {d.question}
                  </MathText>
                </div>

                <div className="flex flex-col gap-1.5 ml-7">
                  {d.options.map((opt) => {
                    const letter  = opt.charAt(0);
                    const text    = opt.length > 2 && opt[1] === ')' ? opt.slice(2).trim() : opt;
                    const correct = letter === d.correctAnswer;
                    const wrong   = letter === d.userAnswer && !correct;

                    let cls = 'border-white/[0.05] text-white/25';
                    if (correct) cls = 'border-emerald-700/50 bg-emerald-900/20 text-white/75';
                    if (wrong)   cls = 'border-rose-700/50 bg-rose-900/20 text-white/75';

                    return (
                      <div key={opt} className={`flex items-start gap-2.5 px-3 py-2 rounded-xl border text-[12px] ${cls}`}>
                        <span className={`flex-shrink-0 w-4 h-4 rounded-full flex items-center justify-center text-[9px] font-bold mt-0.5 ${
                          correct ? 'bg-emerald-500 text-white' : wrong ? 'bg-rose-500 text-white' : 'bg-white/[0.06] text-white/25'
                        }`}>{letter}</span>
                        <MathText className="leading-relaxed flex-1">{text}</MathText>
                        {correct && <span className="ml-auto text-[10px] font-bold text-emerald-400 flex-shrink-0">Correct</span>}
                        {wrong   && <span className="ml-auto text-[10px] font-bold text-rose-400 flex-shrink-0">Your answer</span>}
                      </div>
                    );
                  })}
                </div>

                {d.explanation && (
                  <p className="mt-3 ml-7 text-[11px] text-white/30 italic leading-relaxed">{d.explanation}</p>
                )}
              </div>
            );
          })}
        </div>

        {/* Actions */}
        <div className="flex gap-2 justify-center pb-8">
          <button
            onClick={() => handleRetake(false)}
            className="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl text-[13px] font-semibold text-white/70 bg-white/[0.07] border border-white/[0.12] hover:bg-white/[0.12] transition-colors"
          >
            <RotateCcw size={13} /> Retake
          </button>
          <button
            onClick={() => handleRetake(true)}
            className="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl text-[13px] font-semibold text-white/40 bg-white/[0.03] border border-white/[0.07] hover:bg-white/[0.07] hover:text-white/65 transition-colors"
          >
            New Questions
          </button>
          <button
            onClick={() => navigate(`/curriculum/${curriculumId}`)}
            className="px-4 py-2.5 rounded-xl text-[13px] font-semibold text-white/30 hover:text-white/60 transition-colors"
          >
            Back
          </button>
        </div>
      </div>
    );
  }

  // ── Quiz ──────────────────────────────────────────────────────────────────
  const questions     = assessment.questions;
  const q             = questions[currentQ];
  const answeredCount = questions.filter(qu => answers[qu.id]).length;
  const allAnswered   = answeredCount === questions.length;
  const progressPct   = Math.round((answeredCount / questions.length) * 100);

  return (
    <div className={WRAP}>
      {/* Header */}
      <div className="flex items-center justify-between mb-8">
        <button
          onClick={() => navigate(`/curriculum/${curriculumId}`)}
          className="inline-flex items-center gap-1.5 text-[13px] text-white/30 hover:text-white/60 transition-colors"
        >
          <ArrowLeft size={14} /> Back
        </button>
        <p className="text-[10px] font-black uppercase tracking-[0.22em] text-white/25">
          {currentUnit?.title} · Assessment
        </p>
      </div>

      <div className="flex gap-6 items-start">
        {/* Left: question */}
        <div className="flex-1 min-w-0">
          {/* Progress */}
          <div className="flex items-center justify-between mb-2">
            <span className="text-[11px] text-white/30 tabular-nums">Question {currentQ + 1} of {questions.length}</span>
            <span className="text-[11px] text-white/30 tabular-nums">{answeredCount} answered</span>
          </div>
          <div className="h-0.5 w-full bg-white/[0.07] rounded-full overflow-hidden mb-6">
            <div className="h-full bg-white/30 rounded-full transition-all duration-300" style={{ width: `${progressPct}%` }} />
          </div>

          {/* Question card */}
          <div className="rounded-2xl border border-white/[0.09] bg-white/[0.03] backdrop-blur-sm p-6 mb-4">
            <MathText as="p" className="text-[16px] leading-relaxed font-semibold text-white/90 mb-6">
              {q.question}
            </MathText>

            <div className="flex flex-col gap-2">
              {(q.options || []).map((opt) => {
                const letter   = opt.charAt(0);
                const text     = opt.length > 2 && opt[1] === ')' ? opt.slice(2).trim() : opt;
                const selected = answers[q.id] === letter;
                return (
                  <button
                    key={opt}
                    onClick={() => setAnswers(prev => ({ ...prev, [q.id]: letter }))}
                    className={`w-full text-left flex items-start gap-3 px-4 py-3.5 rounded-xl border text-[13px] transition-all ${
                      selected
                        ? 'border-white/30 bg-white/[0.10] text-white'
                        : 'border-white/[0.07] bg-transparent text-white/55 hover:border-white/20 hover:bg-white/[0.05] hover:text-white/80'
                    }`}
                  >
                    <span className={`flex-shrink-0 w-6 h-6 rounded-full flex items-center justify-center text-[11px] font-bold mt-0.5 flex-shrink-0 ${
                      selected
                        ? 'bg-white text-black'
                        : 'bg-white/[0.06] text-white/35 border border-white/[0.12]'
                    }`}>
                      {letter}
                    </span>
                    <MathText className="leading-relaxed">{text}</MathText>
                  </button>
                );
              })}
            </div>
          </div>

          {/* Nav */}
          <div className="flex items-center justify-between">
            <button
              onClick={() => setCurrentQ(i => Math.max(0, i - 1))}
              disabled={currentQ === 0}
              className="inline-flex items-center gap-1 px-3 py-2 rounded-lg text-[13px] text-white/35 hover:text-white/70 hover:bg-white/[0.05] disabled:opacity-20 disabled:pointer-events-none transition-colors"
            >
              <ChevronLeft size={15} /> Previous
            </button>

            {currentQ < questions.length - 1 ? (
              <button
                onClick={() => setCurrentQ(i => i + 1)}
                className="inline-flex items-center gap-1 px-4 py-2 rounded-lg text-[13px] font-semibold text-white/70 hover:text-white hover:bg-white/[0.07] transition-colors"
              >
                Next <ChevronRight size={15} />
              </button>
            ) : (
              <button
                onClick={handleSubmit}
                disabled={!allAnswered || grading}
                className="inline-flex items-center gap-2 px-5 py-2.5 rounded-xl text-[13px] font-bold text-black bg-white hover:bg-white/90 disabled:opacity-30 disabled:pointer-events-none transition-all"
              >
                {grading ? <><LoadingSpinner size={13} /> Grading…</> : 'Submit'}
              </button>
            )}
          </div>
        </div>

        {/* Right: sidebar */}
        <div className="hidden lg:block w-40 flex-shrink-0 sticky top-6">
          <p className="text-[9px] font-black uppercase tracking-[0.20em] text-white/20 mb-3">Questions</p>
          <div className="grid grid-cols-4 gap-1.5 mb-4">
            {questions.map((qu, i) => (
              <button
                key={qu.id}
                onClick={() => setCurrentQ(i)}
                className={`w-9 h-9 rounded-lg text-[11px] font-semibold transition-colors ${
                  i === currentQ
                    ? 'bg-white text-black'
                    : answers[qu.id]
                      ? 'bg-white/[0.12] text-white/70 border border-white/20'
                      : 'bg-white/[0.03] text-white/30 border border-white/[0.08] hover:bg-white/[0.08] hover:text-white/60'
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
              className="w-full flex items-center justify-center gap-2 px-3 py-2.5 rounded-xl text-[13px] font-bold text-black bg-white hover:bg-white/90 disabled:opacity-40 transition-all"
            >
              {grading ? <LoadingSpinner size={13} /> : 'Submit'}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
