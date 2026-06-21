import { useState, useEffect, useRef } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { ArrowLeft, RotateCcw, ChevronLeft, ChevronRight, CheckCircle, XCircle } from 'lucide-react';
import { getCurriculum } from '../api/curriculum';
import { getLessonAssessment, gradeAssessment } from '../api/assessments';
import { apiFetch } from '../api/client';
import LoadingSpinner from '../components/shared/LoadingSpinner';
import LoadingProgress from '../components/shared/ProgressBar';
import { SkeletonProse } from '../components/shared/Skeleton';
import MarkdownMath from '../components/shared/MarkdownMath';

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
  let currentLesson = null;
  for (const u of curriculum?.units || []) {
    const l = (u.lessons || []).find(l => l.id === lessonId);
    if (l) { currentUnit = u; currentLesson = l; break; }
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
      <div className="w-full max-w-xl">
        <header className="mb-8">
          <h1 className="text-[30px] md:text-[36px] font-semibold tracking-[-0.02em] text-white/95 leading-[1.1] mb-2">
            {currentLesson?.title || currentUnit?.title || 'Assessment'}
          </h1>
          {currentUnit?.title && currentLesson?.title && (
            <p className="text-white/45 text-[14px] leading-relaxed">{currentUnit.title}</p>
          )}
        </header>
        <LoadingProgress active label="Building your assessment" hint="~15 seconds" duration={15000} />
        <div className="mt-6 opacity-40">
          <SkeletonProse lines={5} />
        </div>
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
          className="flex items-center gap-1.5 text-[13px] text-white/30 hover:text-white/60 transition-colors mb-8"
        >
          <ArrowLeft size={14} /> Back to curriculum
        </button>

        {/* Score — borderless QBpedia style */}
        <div className="pb-6 mb-6 border-b border-white/[0.07]">
          <p className="text-[10px] font-bold uppercase tracking-[0.18em] text-white/25 mb-3">{currentUnit?.title}</p>
          <div className="flex items-end gap-3 mb-1">
            <span className={`text-[60px] font-black tracking-tight leading-none tabular-nums ${col.text}`}>{grade}</span>
            <span className={`text-[28px] font-bold tabular-nums pb-1 ${col.text} opacity-55`}>{pct}%</span>
          </div>
          <p className="text-[13px] text-white/35 font-light">{result.score} / {result.total} correct</p>
        </div>

        {/* Per-question review — divider list */}
        <p className="text-[10px] font-bold uppercase tracking-[0.18em] text-white/25 mb-2">Review</p>
        <div className="flex flex-col divide-y divide-white/[0.05] mb-8">
          {reviewItems.map((d, i) => {
            const isCorrect = d.correct;
            return (
              <div key={i} className="py-4">
                <div className="flex items-start gap-3">
                  {isCorrect
                    ? <CheckCircle size={14} className="text-emerald-400 flex-shrink-0 mt-[3px]" />
                    : <XCircle    size={14} className="text-rose-400 flex-shrink-0 mt-[3px]" />}
                  <div className="flex-1 min-w-0">
                    <MarkdownMath className="text-[13px] text-white/80 mb-2">{`${i + 1}. ${d.question}`}</MarkdownMath>
                    <div className="flex flex-col gap-1">
                      {d.options.map((opt) => {
                        const letter  = opt.charAt(0);
                        const text    = opt.length > 2 && opt[1] === ')' ? opt.slice(2).trim() : opt;
                        const correct = letter === d.correctAnswer;
                        const wrong   = letter === d.userAnswer && !correct;
                        if (!correct && !wrong) return null;
                        return (
                          <div key={opt} className={`flex items-start gap-2 text-[12px] font-light ${
                            correct ? 'text-emerald-400' : 'text-rose-400/80'
                          }`}>
                            <span className="font-bold flex-shrink-0">{letter}</span>
                            <MarkdownMath inline className="flex-1">{text}</MarkdownMath>
                            <span className="text-[10px] font-bold flex-shrink-0 ml-2 opacity-70">
                              {correct ? '✓ correct' : '✗ yours'}
                            </span>
                          </div>
                        );
                      })}
                    </div>
                    {d.explanation && (
                      <p className="mt-2 text-[11px] text-white/30 font-light leading-relaxed italic">{d.explanation}</p>
                    )}
                  </div>
                </div>
              </div>
            );
          })}
        </div>

        <div className="flex gap-3 pb-8">
          <button
            onClick={() => handleRetake(false)}
            className="inline-flex items-center gap-1.5 px-4 py-2 rounded-lg text-[13px] text-white/55 border border-white/[0.10] hover:text-white/80 hover:border-white/20 transition-colors"
          >
            <RotateCcw size={13} /> Retake
          </button>
          <button
            onClick={() => handleRetake(true)}
            className="inline-flex items-center gap-1.5 px-4 py-2 rounded-lg text-[13px] text-white/35 hover:text-white/60 transition-colors"
          >
            New questions
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
      {/* QBpedia-style header: back + thin progress bar + count */}
      <div className="flex items-center gap-3 mb-7">
        <button
          onClick={() => navigate(`/curriculum/${curriculumId}`)}
          className="flex items-center gap-1.5 text-[13px] text-white/30 hover:text-white/60 transition-colors flex-shrink-0"
        >
          <ArrowLeft size={14} /> Back
        </button>
        <div className="flex-1 h-[3px] rounded-full overflow-hidden bg-white/[0.07]">
          <div
            className="h-full bg-blue-400 transition-all duration-300 ease-out rounded-full"
            style={{ width: `${progressPct}%` }}
          />
        </div>
        <span className="text-[11px] tabular-nums text-white/30 flex-shrink-0">
          {answeredCount} / {questions.length}
        </span>
      </div>

      <div className="flex gap-8 items-start">
        {/* Left: question */}
        <div className="flex-1 min-w-0">
          {/* Unit label + question position */}
          <p className="text-[10px] font-bold uppercase tracking-[0.18em] text-white/25 mb-4">
            {currentUnit?.title} · Q {currentQ + 1}
          </p>

          {/* Question text — no card, QBpedia lead paragraph style */}
          <MarkdownMath className="mb-7 text-[14px] leading-[1.75] text-white/85 font-light">{q.question}</MarkdownMath>

          {/* Options — left-border accent */}
          <div className="flex flex-col gap-1.5 mb-7">
            {(q.options || []).map((opt) => {
              const letter   = opt.charAt(0);
              const text     = opt.length > 2 && opt[1] === ')' ? opt.slice(2).trim() : opt;
              const selected = answers[q.id] === letter;
              return (
                <button
                  key={opt}
                  onClick={() => setAnswers(prev => ({ ...prev, [q.id]: letter }))}
                  className={`w-full text-left flex items-start gap-3 px-4 py-3 rounded-xl transition-all ${
                    selected
                      ? 'bg-blue-500 text-white shadow-[0_0_16px_rgba(59,130,246,0.3)]'
                      : 'bg-white/[0.05] text-white/55 hover:bg-white/[0.08] hover:text-white/80'
                  }`}
                >
                  <span className={`text-[11px] font-bold shrink-0 mt-0.5 w-4 tabular-nums ${
                    selected ? 'text-white/80' : 'text-white/25'
                  }`}>{letter}</span>
                  <MarkdownMath inline className="text-[13.5px] leading-[1.7] flex-1">{text}</MarkdownMath>
                </button>
              );
            })}
          </div>

          {/* Nav */}
          <div className="flex items-center justify-between border-t border-white/[0.06] pt-5">
            <button
              onClick={() => setCurrentQ(i => Math.max(0, i - 1))}
              disabled={currentQ === 0}
              className="inline-flex items-center gap-1.5 text-[13px] text-white/35 hover:text-white/65 disabled:opacity-20 disabled:pointer-events-none transition-colors"
            >
              <ChevronLeft size={14} /> Previous
            </button>
            {currentQ < questions.length - 1 ? (
              <button
                onClick={() => setCurrentQ(i => i + 1)}
                className="inline-flex items-center gap-1.5 text-[13px] text-white/50 hover:text-white/80 transition-colors"
              >
                Next <ChevronRight size={14} />
              </button>
            ) : (
              <button
                onClick={handleSubmit}
                disabled={!allAnswered || grading}
                className="inline-flex items-center gap-2 px-5 py-2 rounded-lg text-[13px] font-semibold text-white bg-blue-500 hover:bg-blue-400 disabled:opacity-30 disabled:pointer-events-none transition-colors"
              >
                {grading ? <><LoadingSpinner size={13} /> Grading…</> : 'Submit'}
              </button>
            )}
          </div>
        </div>

        {/* Right: question grid sidebar */}
        <div className="hidden lg:block w-36 flex-shrink-0 sticky top-6">
          <p className="text-[9px] font-bold uppercase tracking-[0.18em] text-white/20 mb-3">Questions</p>
          <div className="grid grid-cols-4 gap-1.5 mb-4">
            {questions.map((qu, i) => (
              <button
                key={qu.id}
                onClick={() => setCurrentQ(i)}
                className={`w-8 h-8 rounded-md text-[11px] font-semibold transition-colors ${
                  i === currentQ
                    ? 'bg-white text-black'
                    : answers[qu.id]
                      ? 'bg-blue-500/20 text-blue-300 border border-blue-400/30'
                      : 'text-white/25 border border-white/[0.07] hover:text-white/55 hover:border-white/15'
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
              className="w-full py-2 rounded-lg text-[12px] font-semibold text-white bg-blue-500 hover:bg-blue-400 disabled:opacity-40 transition-colors"
            >
              {grading ? '…' : 'Submit'}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
