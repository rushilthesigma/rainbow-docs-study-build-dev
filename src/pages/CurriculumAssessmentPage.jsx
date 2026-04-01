import { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { ArrowLeft, Loader2, Check, X, RotateCcw } from 'lucide-react';
import { getCurriculum } from '../api/curriculum';
import { generateAssessment, gradeAssessment } from '../api/assessments';
import { apiFetch } from '../api/client';
import LoadingSpinner from '../components/shared/LoadingSpinner';

export default function CurriculumAssessmentPage() {
  const { id: curriculumId, lessonId } = useParams();
  const navigate = useNavigate();

  const [curriculum, setCurriculum] = useState(null);
  const [loading, setLoading] = useState(true);
  const [generating, setGenerating] = useState(false);
  const [assessment, setAssessment] = useState(null);
  const [answers, setAnswers] = useState({});
  const [currentQ, setCurrentQ] = useState(0);
  const [grading, setGrading] = useState(false);
  const [result, setResult] = useState(null);

  // Find the lesson and unit
  let currentLesson = null;
  let currentUnit = null;
  for (const u of curriculum?.units || []) {
    const l = (u.lessons || []).find(l => l.id === lessonId);
    if (l) { currentLesson = l; currentUnit = u; break; }
  }

  useEffect(() => {
    async function load() {
      try {
        const data = await getCurriculum(curriculumId);
        setCurriculum(data.curriculum);

        // Find the unit for this assessment
        let unit = null;
        for (const u of data.curriculum?.units || []) {
          if ((u.lessons || []).find(l => l.id === lessonId)) { unit = u; break; }
        }

        if (unit) {
          setGenerating(true);
          const difficulty = data.curriculum.settings?.difficulty || 'beginner';
          const topic = unit.title;
          const resp = await generateAssessment(topic, 'quiz', 10, difficulty);
          setAssessment(resp.assessment);
          setGenerating(false);
        }
      } catch (err) {
        console.error(err);
      }
      setLoading(false);
    }
    load();
  }, [curriculumId, lessonId]);

  async function handleSubmit() {
    if (!assessment) return;
    setGrading(true);
    try {
      const resp = await gradeAssessment(assessment, answers);
      setResult(resp);

      // Mark lesson as complete
      try {
        await apiFetch(`/api/curriculum/${curriculumId}/lesson/${lessonId}/complete`, {
          method: 'POST',
          body: JSON.stringify({ score: resp.percentage }),
        });
      } catch {}
    } catch (err) {
      console.error(err);
    }
    setGrading(false);
  }

  async function handleRetake() {
    setResult(null);
    setAnswers({});
    setCurrentQ(0);
    setGenerating(true);
    try {
      const difficulty = curriculum?.settings?.difficulty || 'beginner';
      const topic = currentUnit?.title || 'General';
      const resp = await generateAssessment(topic, 'quiz', 10, difficulty);
      setAssessment(resp.assessment);
    } catch {}
    setGenerating(false);
  }

  if (loading) return <div className="flex items-center justify-center h-64"><LoadingSpinner size={28} /></div>;

  if (generating) {
    return (
      <div className="flex flex-col items-center justify-center py-20">
        <div className="w-16 h-16 rounded-2xl bg-rose-100 dark:bg-rose-900/20 flex items-center justify-center mb-4">
          <Loader2 size={28} className="animate-spin text-rose-500" />
        </div>
        <h2 className="text-lg font-bold text-gray-900 dark:text-white mb-2">Generating Assessment</h2>
        <p className="text-sm text-gray-500">{currentUnit?.title || 'Unit'} — {curriculum?.settings?.difficulty || 'beginner'}</p>
      </div>
    );
  }

  // Results view
  if (result) {
    const pct = result.percentage || 0;
    const color = pct >= 80 ? 'emerald' : pct >= 60 ? 'amber' : 'rose';
    return (
      <div className="max-w-2xl mx-auto">
        <button onClick={() => navigate(`/curriculum/${curriculumId}`)} className="flex items-center gap-2 text-sm text-gray-500 hover:text-gray-700 dark:hover:text-gray-200 mb-6">
          <ArrowLeft size={16} /> Back to Curriculum
        </button>

        <div className="text-center mb-6">
          <div className={`inline-flex items-center justify-center w-20 h-20 rounded-full bg-${color}-50 dark:bg-${color}-900/15 mb-3`}>
            <span className={`text-2xl font-bold text-${color}-600`}>{pct}%</span>
          </div>
          <h2 className="text-lg font-bold text-gray-900 dark:text-white">{currentUnit?.title} — Assessment</h2>
          <p className="text-sm text-gray-500">{result.score}/{result.total} correct</p>
        </div>

        <div className="space-y-3 mb-6">
          {(result.details || []).map((d, i) => (
            <div key={i} className={`rounded-xl p-4 border ${d.correct ? 'bg-emerald-50 dark:bg-emerald-900/10 border-emerald-200 dark:border-emerald-800' : 'bg-rose-50 dark:bg-rose-900/10 border-rose-200 dark:border-rose-800'}`}>
              <p className="text-sm font-medium text-gray-800 dark:text-gray-200 mb-1">{d.question}</p>
              {!d.correct && (
                <p className="text-xs text-gray-500">Your answer: {d.userAnswer} · Correct: {d.correctAnswer}</p>
              )}
              {d.explanation && <p className="text-xs text-gray-400 mt-1 italic">{d.explanation}</p>}
            </div>
          ))}
        </div>

        <div className="flex gap-3 justify-center">
          <button onClick={handleRetake} className="flex items-center gap-2 px-4 py-2 rounded-xl bg-blue-600 text-white text-sm font-medium hover:bg-blue-700">
            <RotateCcw size={14} /> Retake
          </button>
          <button onClick={() => navigate(`/curriculum/${curriculumId}`)} className="px-4 py-2 rounded-xl border border-gray-200 dark:border-[#2A2A40] text-sm font-medium text-gray-600 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-[#1e1e2e]">
            Back to Curriculum
          </button>
        </div>
      </div>
    );
  }

  if (!assessment?.questions?.length) {
    return <div className="text-center py-20 text-gray-500">Failed to generate assessment.</div>;
  }

  // Quiz view
  const questions = assessment.questions;
  const q = questions[currentQ];
  const allAnswered = questions.every(qu => answers[qu.id]);

  return (
    <div className="max-w-2xl mx-auto">
      <button onClick={() => navigate(`/curriculum/${curriculumId}`)} className="flex items-center gap-2 text-sm text-gray-500 hover:text-gray-700 dark:hover:text-gray-200 mb-4">
        <ArrowLeft size={16} /> Back to Curriculum
      </button>

      <h2 className="text-lg font-bold text-gray-900 dark:text-white mb-1">{currentUnit?.title} — Assessment</h2>
      <p className="text-sm text-gray-500 dark:text-gray-400 mb-4">{questions.length} questions</p>

      {/* Progress dots */}
      <div className="flex gap-1.5 mb-5 flex-wrap">
        {questions.map((qu, i) => (
          <button
            key={qu.id}
            onClick={() => setCurrentQ(i)}
            className={`w-7 h-7 rounded-full text-xs font-semibold transition-colors ${
              i === currentQ
                ? 'bg-blue-600 text-white'
                : answers[qu.id]
                  ? 'bg-emerald-100 dark:bg-emerald-900/30 text-emerald-600'
                  : 'bg-gray-100 dark:bg-[#1e1e2e] text-gray-500'
            }`}
          >
            {i + 1}
          </button>
        ))}
      </div>

      {/* Question card */}
      <div className="bg-white dark:bg-[#161622] rounded-xl border border-gray-200 dark:border-[#2A2A40] p-6 mb-4">
        <p className="text-sm font-medium text-gray-800 dark:text-gray-200 mb-4">
          <span className="text-gray-400 mr-2">Q{currentQ + 1}.</span>
          {q.question}
        </p>

        <div className="space-y-2">
          {(q.options || []).map((opt) => {
            const letter = opt.charAt(0);
            const selected = answers[q.id] === letter;
            return (
              <button
                key={opt}
                onClick={() => setAnswers(prev => ({ ...prev, [q.id]: letter }))}
                className={`w-full text-left px-4 py-3 rounded-lg border text-sm transition-colors ${
                  selected
                    ? 'border-blue-500 bg-blue-50 dark:bg-blue-900/15 text-blue-700 dark:text-blue-300'
                    : 'border-gray-200 dark:border-[#2A2A40] hover:border-gray-300 dark:hover:border-gray-600 text-gray-700 dark:text-gray-300'
                }`}
              >
                {opt}
              </button>
            );
          })}
        </div>
      </div>

      {/* Navigation */}
      <div className="flex items-center justify-between">
        <button
          onClick={() => setCurrentQ(i => Math.max(0, i - 1))}
          disabled={currentQ === 0}
          className="px-4 py-2 rounded-lg text-sm text-gray-500 hover:text-gray-700 dark:hover:text-gray-300 disabled:opacity-30"
        >
          Previous
        </button>

        {currentQ < questions.length - 1 ? (
          <button
            onClick={() => setCurrentQ(i => i + 1)}
            className="px-4 py-2 rounded-lg text-sm font-medium text-blue-600 hover:bg-blue-50 dark:hover:bg-blue-900/15"
          >
            Next
          </button>
        ) : (
          <button
            onClick={handleSubmit}
            disabled={!allAnswered || grading}
            className="flex items-center gap-2 px-5 py-2 rounded-xl bg-blue-600 text-white text-sm font-medium hover:bg-blue-700 disabled:opacity-50"
          >
            {grading ? <Loader2 size={14} className="animate-spin" /> : <Check size={14} />}
            Submit
          </button>
        )}
      </div>
    </div>
  );
}
