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
        <p className="text-xs font-semibold uppercase tracking-widest text-gray-400 dark:text-gray-500 mb-6">
          {currentUnit?.title || 'Assessment'}
        </p>
        <div className="w-64 mb-3">
          <div className="h-1 w-full bg-gray-100 dark:bg-[#2A2A40] rounded-full overflow-hidden">
            <div
              className="h-full bg-blue-600 rounded-full transition-all duration-300 ease-out"
              style={{ width: `${genPct}%` }}
            />
          </div>
        </div>
        <p className="text-xs text-gray-400 dark:text-gray-500">{Math.round(genPct)}%</p>
      </div>
    );
  }

  if (genError) {
    return (
      <div className="flex flex-col items-center justify-center py-32 gap-4">
        <p className="text-sm text-gray-500 dark:text-gray-400">Could not load assessment.</p>
        <button
          onClick={() => fetchAssessment(true)}
          className="px-4 py-2 rounded-xl bg-blue-600 text-white text-sm font-medium hover:bg-blue-700"
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
          className="flex items-center gap-1.5 text-sm text-gray-500 hover:text-gray-700 dark:hover:text-gray-200 mb-6"
        >
          <ArrowLeft size={15} /> Back
        </button>

        {/* Score banner */}
        <div className={`rounded-2xl p-6 mb-6 text-center border ${
          passed
            ? 'bg-emerald-50 dark:bg-emerald-900/15 border-emerald-200 dark:border-emerald-800'
            : 'bg-rose-50 dark:bg-rose-900/15 border-rose-200 dark:border-rose-800'
        }`}>
          <p className={`text-5xl font-bold mb-1 ${passed ? 'text-emerald-600 dark:text-emerald-400' : 'text-rose-600 dark:text-rose-400'}`}>
            {pct}%
          </p>
          <p className={`text-sm ${passed ? 'text-emerald-600 dark:text-emerald-400' : 'text-rose-500 dark:text-rose-400'}`}>
            {result.score}/{result.total} correct
          </p>
          <p className="text-xs text-gray-400 dark:text-gray-500 mt-1">{currentUnit?.title}</p>
        </div>

        {/* Per-question review */}
        <div className="space-y-4 mb-6">
          {reviewItems.map((d, i) => (
            <div key={i} className="bg-white dark:bg-[#161622] rounded-2xl border border-gray-200 dark:border-[#2A2A40] p-5">
              <div className="flex items-start gap-2 mb-4">
                <span className={`flex-shrink-0 mt-0.5 w-5 h-5 rounded-full flex items-center justify-center text-xs font-bold ${
                  d.correct
                    ? 'bg-emerald-100 dark:bg-emerald-900/40 text-emerald-600'
                    : 'bg-rose-100 dark:bg-rose-900/40 text-rose-500'
                }`}>
                  {d.correct ? '✓' : '✗'}
                </span>
                <MathText as="p" className="text-sm font-medium text-gray-900 dark:text-gray-100 leading-relaxed">
                  {i + 1}. {d.question}
                </MathText>
              </div>

              <div className="space-y-2">
                {d.options.map((opt) => {
                  const letter = opt.charAt(0);
                  const text = opt.length > 2 && opt[1] === ')' ? opt.slice(2).trim() : opt;
                  const isCorrect = letter === d.correctAnswer;
                  const isWrong = letter === d.userAnswer && !isCorrect;

                  let style = 'border-gray-100 dark:border-[#2A2A40] bg-gray-50 dark:bg-[#1e1e2e] text-gray-400 dark:text-gray-600';
                  let badgeStyle = 'bg-gray-200 dark:bg-[#2A2A40] text-gray-400';

                  if (isCorrect) {
                    style = 'border-emerald-300 dark:border-emerald-700 bg-emerald-50 dark:bg-emerald-900/20 text-gray-800 dark:text-gray-100';
                    badgeStyle = 'bg-emerald-500 text-white';
                  }
                  if (isWrong) {
                    style = 'border-rose-300 dark:border-rose-700 bg-rose-50 dark:bg-rose-900/20 text-gray-800 dark:text-gray-100';
                    badgeStyle = 'bg-rose-500 text-white';
                  }

                  return (
                    <div key={opt} className={`flex items-start gap-3 px-3 py-2.5 rounded-xl border text-sm ${style}`}>
                      <span className={`flex-shrink-0 w-5 h-5 rounded-full flex items-center justify-center text-xs font-bold mt-0.5 ${badgeStyle}`}>
                        {letter}
                      </span>
                      <MathText className="leading-relaxed flex-1">{text}</MathText>
                      {isCorrect && <span className="ml-auto flex-shrink-0 text-xs font-medium text-emerald-600 dark:text-emerald-400">Correct</span>}
                      {isWrong && <span className="ml-auto flex-shrink-0 text-xs font-medium text-rose-500">Yours</span>}
                    </div>
                  );
                })}
              </div>

              {d.explanation && (
                <p className="mt-3 text-xs text-gray-500 dark:text-gray-400 border-t border-gray-100 dark:border-[#2A2A40] pt-3">
                  {d.explanation}
                </p>
              )}
            </div>
          ))}
        </div>

        <div className="flex gap-2 justify-center">
          <button
            onClick={() => handleRetake(false)}
            className="flex items-center gap-2 px-4 py-2 rounded-xl bg-blue-600 text-white text-sm font-medium hover:bg-blue-700"
          >
            <RotateCcw size={13} /> Retake
          </button>
          <button
            onClick={() => handleRetake(true)}
            className="flex items-center gap-2 px-4 py-2 rounded-xl border border-gray-200 dark:border-[#2A2A40] text-sm font-medium text-gray-600 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-[#1e1e2e]"
          >
            New Questions
          </button>
          <button
            onClick={() => navigate(`/curriculum/${curriculumId}`)}
            className="px-4 py-2 rounded-xl border border-gray-200 dark:border-[#2A2A40] text-sm font-medium text-gray-600 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-[#1e1e2e]"
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
          className="flex items-center gap-1.5 text-sm text-gray-500 hover:text-gray-700 dark:hover:text-gray-200"
        >
          <ArrowLeft size={15} /> Back
        </button>
        <p className="text-xs font-semibold uppercase tracking-wider text-gray-400 dark:text-gray-500">
          {currentUnit?.title}
        </p>
      </div>

      <div className="flex gap-6 items-start">
        {/* Left: question */}
        <div className="flex-1 min-w-0">
          <div className="mb-5">
            <div className="flex items-center justify-between mb-1.5">
              <span className="text-xs text-gray-500 dark:text-gray-400">
                Question {currentQ + 1} of {questions.length}
              </span>
              <span className="text-xs text-gray-500 dark:text-gray-400">{answeredCount} answered</span>
            </div>
            <div className="h-1.5 w-full bg-gray-100 dark:bg-[#2A2A40] rounded-full overflow-hidden">
              <div
                className="h-full bg-blue-600 rounded-full transition-all duration-300"
                style={{ width: `${progressPct}%` }}
              />
            </div>
          </div>

          <div className="bg-white dark:bg-[#161622] rounded-2xl border border-gray-200 dark:border-[#2A2A40] p-6 mb-4">
            <MathText as="p" className="text-[15px] leading-relaxed font-medium text-gray-900 dark:text-gray-100 mb-6">
              {q.question}
            </MathText>

            <div className="space-y-2.5">
              {(q.options || []).map((opt) => {
                const letter = opt.charAt(0);
                const text = opt.length > 2 && opt[1] === ')' ? opt.slice(2).trim() : opt;
                const selected = answers[q.id] === letter;
                return (
                  <button
                    key={opt}
                    onClick={() => setAnswers(prev => ({ ...prev, [q.id]: letter }))}
                    className={`w-full text-left flex items-start gap-3 px-4 py-3.5 rounded-xl border text-sm transition-all ${
                      selected
                        ? 'border-blue-500 bg-blue-50 dark:bg-blue-900/20'
                        : 'border-gray-200 dark:border-[#2A2A40] hover:border-gray-300 dark:hover:border-gray-600 hover:bg-gray-50 dark:hover:bg-[#1e1e2e]'
                    }`}
                  >
                    <span className={`flex-shrink-0 w-6 h-6 rounded-full flex items-center justify-center text-xs font-bold mt-0.5 ${
                      selected
                        ? 'bg-blue-600 text-white'
                        : 'bg-gray-100 dark:bg-[#2A2A40] text-gray-500 dark:text-gray-400'
                    }`}>
                      {letter}
                    </span>
                    <MathText className={`leading-relaxed ${selected ? 'text-blue-700 dark:text-blue-300' : 'text-gray-700 dark:text-gray-300'}`}>
                      {text}
                    </MathText>
                  </button>
                );
              })}
            </div>
          </div>

          <div className="flex items-center justify-between">
            <button
              onClick={() => setCurrentQ(i => Math.max(0, i - 1))}
              disabled={currentQ === 0}
              className="flex items-center gap-1 px-3 py-2 rounded-lg text-sm text-gray-500 hover:text-gray-700 dark:hover:text-gray-300 hover:bg-gray-100 dark:hover:bg-[#1e1e2e] disabled:opacity-30 disabled:pointer-events-none transition-colors"
            >
              <ChevronLeft size={16} /> Previous
            </button>

            {currentQ < questions.length - 1 ? (
              <button
                onClick={() => setCurrentQ(i => i + 1)}
                className="flex items-center gap-1 px-4 py-2 rounded-lg text-sm font-medium text-blue-600 hover:bg-blue-50 dark:hover:bg-blue-900/15 transition-colors"
              >
                Next <ChevronRight size={16} />
              </button>
            ) : (
              <button
                onClick={handleSubmit}
                disabled={!allAnswered || grading}
                className="flex items-center gap-2 px-5 py-2 rounded-xl bg-blue-600 text-white text-sm font-medium hover:bg-blue-700 disabled:opacity-50 disabled:pointer-events-none transition-colors"
              >
                {grading
                  ? <><LoadingSpinner size={14} /> Grading</>
                  : <><Check size={14} /> Submit</>
                }
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
                className={`w-9 h-9 rounded-lg text-xs font-semibold transition-colors ${
                  i === currentQ
                    ? 'bg-blue-600 text-white'
                    : answers[qu.id]
                      ? 'bg-emerald-100 dark:bg-emerald-900/30 text-emerald-700 dark:text-emerald-400'
                      : 'bg-gray-100 dark:bg-[#1e1e2e] text-gray-500 dark:text-gray-400 hover:bg-gray-200 dark:hover:bg-[#2A2A40]'
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
              className="w-full flex items-center justify-center gap-2 px-3 py-2.5 rounded-xl bg-blue-600 text-white text-sm font-medium hover:bg-blue-700 disabled:opacity-50 transition-colors"
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
