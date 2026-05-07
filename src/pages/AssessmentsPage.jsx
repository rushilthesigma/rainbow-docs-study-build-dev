import { useState, useEffect } from 'react';
import { ClipboardCheck, Plus, CheckCircle2, XCircle, Clock, ArrowRight, Sparkles, TrendingUp, Trophy, Target } from 'lucide-react';
import { generateAssessment, gradeAssessment, getAssessmentHistory } from '../api/assessments';
import Button from '../components/shared/Button';
import Input from '../components/shared/Input';
import PillGroup from '../components/shared/PillGroup';
import { DIFFICULTY_OPTIONS } from '../utils/constants';
import LoadingSpinner from '../components/shared/LoadingSpinner';
import Modal from '../components/shared/Modal';
import MathText from '../components/shared/MathText';

export default function AssessmentsPage() {
  const [history, setHistory] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showCreate, setShowCreate] = useState(false);
  const [generating, setGenerating] = useState(false);
  const [topic, setTopic] = useState('');
  const [difficulty, setDifficulty] = useState('beginner');
  const [questionCount, setQuestionCount] = useState(5);

  // Active quiz state.
  const [quiz, setQuiz] = useState(null);
  const [currentQ, setCurrentQ] = useState(0);
  const [answers, setAnswers] = useState({});
  const [results, setResults] = useState(null);
  const [grading, setGrading] = useState(false);
  const [selectedAnswer, setSelectedAnswer] = useState(null);

  useEffect(() => {
    getAssessmentHistory().then(d => { setHistory(d.history || []); setLoading(false); }).catch(() => setLoading(false));
  }, []);

  const [genError, setGenError] = useState(null);

  async function handleGenerate(e) {
    e?.preventDefault?.();
    if (!topic.trim()) return;
    setGenerating(true);
    setShowCreate(false);
    setGenError(null);
    try {
      const data = await generateAssessment(topic.trim(), 'quiz', questionCount, difficulty);
      setQuiz(data.assessment);
      setAnswers({});
      setResults(null);
      setCurrentQ(0);
      setSelectedAnswer(null);
    } catch (err) {
      setGenError(err.message || 'Failed to generate quiz');
    }
    setGenerating(false);
  }

  function selectAnswer(letter) {
    setSelectedAnswer(letter);
    const qId = quiz.questions[currentQ]?.id || currentQ;
    setAnswers(prev => ({ ...prev, [qId]: letter }));
  }

  function nextQuestion() {
    if (currentQ < (quiz?.questions?.length || 0) - 1) {
      setCurrentQ(i => i + 1);
      const nextQId = quiz.questions[currentQ + 1]?.id || (currentQ + 1);
      setSelectedAnswer(answers[nextQId] || null);
    }
  }

  function prevQuestion() {
    if (currentQ > 0) {
      setCurrentQ(i => i - 1);
      const prevQId = quiz.questions[currentQ - 1]?.id || (currentQ - 1);
      setSelectedAnswer(answers[prevQId] || null);
    }
  }

  async function handleSubmit() {
    if (!quiz) return;
    setGrading(true);
    try {
      const data = await gradeAssessment(quiz, answers);
      setResults(data.result);
      setHistory(prev => [data.result, ...prev]);
    } catch (err) { console.error(err); }
    setGrading(false);
  }

  function resetQuiz() {
    setQuiz(null);
    setResults(null);
    setAnswers({});
    setCurrentQ(0);
    setSelectedAnswer(null);
  }

  if (loading) return <div className="flex items-center justify-center h-64"><LoadingSpinner size={28} /></div>;

  // Generating — small inline spinner. Flash Lite + jsonMode resolves
  // in 1-3 seconds so we don't need a fancy progress UI.
  if (generating) {
    return (
      <div className="w-full max-w-md mx-auto text-center py-24 px-6">
        <div className="inline-flex items-center gap-3 text-sm text-gray-700 dark:text-gray-200">
          <LoadingSpinner size={18} />
          <span>Building your quiz on <span className="italic">{topic}</span>…</span>
        </div>
      </div>
    );
  }

  // Generation error
  if (genError && !quiz) {
    return (
      <div className="w-full max-w-md mx-auto text-center py-20">
        <p className="text-sm text-rose-500 mb-4">{genError}</p>
        <Button onClick={() => { setGenError(null); setShowCreate(true); }}>Try Again</Button>
      </div>
    );
  }

  // Active quiz view
  if (quiz && !results) {
    const q = quiz.questions?.[currentQ];
    const total = quiz.questions?.length || 0;
    const answered = Object.keys(answers).length;

    return (
      <div className="w-full max-w-3xl mx-auto">
        <div className="flex items-center justify-between mb-6">
          <div>
            <h1 className="text-lg font-bold text-gray-900 dark:text-white">{quiz.title}</h1>
            <p className="text-sm text-gray-500 dark:text-gray-400">{answered}/{total} answered</p>
          </div>
          <div className="flex items-center gap-3">
            <button onClick={resetQuiz} className="text-sm text-gray-400 hover:text-gray-600 dark:hover:text-gray-300">Cancel</button>
            <Button onClick={handleSubmit} loading={grading} disabled={answered < total} size="sm">
              Submit Quiz
            </Button>
          </div>
        </div>

        {/* Progress dots */}
        <div className="flex gap-1.5 mb-6">
          {quiz.questions?.map((_, i) => {
            const qId = quiz.questions[i]?.id || i;
            const isAnswered = answers[qId] !== undefined;
            const isCurrent = i === currentQ;
            return (
              <button
                key={i}
                onClick={() => { setCurrentQ(i); setSelectedAnswer(answers[qId] || null); }}
                className={`h-2 flex-1 rounded-full transition-colors ${
                  isCurrent ? 'bg-blue-600' : isAnswered ? 'bg-blue-300 dark:bg-blue-700' : 'bg-gray-200 dark:bg-[#2A2A40]'
                }`}
              />
            );
          })}
        </div>

        {q && (
          <div className="bg-white dark:bg-[#161622] rounded-xl border border-gray-200 dark:border-[#2A2A40] p-6">
            <p className="text-xs text-gray-400 mb-3">Question {currentQ + 1} of {total}</p>
            <MathText as="h2" className="text-base font-semibold text-gray-900 dark:text-gray-100 mb-5">{q.question}</MathText>

            <div className="space-y-2.5">
              {(q.options || []).map((opt) => {
                const letter = opt.charAt(0);
                const isSelected = selectedAnswer === letter;
                return (
                  <button
                    key={opt}
                    onClick={() => selectAnswer(letter)}
                    className={`w-full text-left px-4 py-3 rounded-xl text-sm transition-all border ${
                      isSelected
                        ? 'bg-blue-50 dark:bg-blue-900/20 border-blue-500 text-blue-700 dark:text-blue-300 font-medium'
                        : 'bg-gray-50 dark:bg-[#0D0D14] border-gray-200 dark:border-[#2A2A40] text-gray-700 dark:text-gray-300 hover:border-gray-300 dark:hover:border-gray-600'
                    }`}
                  >
                    <span className={`inline-flex items-center justify-center w-6 h-6 rounded-full text-xs font-semibold mr-3 ${
                      isSelected ? 'bg-blue-600 text-white' : 'bg-gray-200 dark:bg-[#2A2A40] text-gray-500 dark:text-gray-400'
                    }`}>
                      {letter}
                    </span>
                    <MathText>{opt.slice(3)}</MathText>
                  </button>
                );
              })}
            </div>

            <div className="flex items-center justify-between mt-6 pt-4 border-t border-gray-100 dark:border-[#2A2A40]">
              <Button variant="ghost" size="sm" onClick={prevQuestion} disabled={currentQ === 0}>
                Previous
              </Button>
              {currentQ < total - 1 ? (
                <Button variant="ghost" size="sm" onClick={nextQuestion}>
                  Next <ArrowRight size={14} />
                </Button>
              ) : (
                <Button onClick={handleSubmit} loading={grading} disabled={answered < total} size="sm">
                  Submit Quiz
                </Button>
              )}
            </div>
          </div>
        )}
      </div>
    );
  }

  // Results view
  if (results) {
    return (
      <div className="w-full max-w-3xl mx-auto">
        <div className="bg-white dark:bg-[#161622] rounded-xl border border-gray-200 dark:border-[#2A2A40] p-6 mb-4">
          <div className="text-center mb-6">
            <div className={`inline-flex items-center justify-center w-16 h-16 rounded-full text-2xl font-bold mb-3 ${
              results.percentage >= 80 ? 'bg-emerald-50 dark:bg-emerald-900/20 text-emerald-600' :
              results.percentage >= 60 ? 'bg-amber-50 dark:bg-amber-900/20 text-amber-600' :
              'bg-rose-50 dark:bg-rose-900/20 text-rose-600'
            }`}>
              {results.percentage}%
            </div>
            <h2 className="text-lg font-bold text-gray-900 dark:text-gray-100">
              {results.percentage >= 80 ? 'Great job!' : results.percentage >= 60 ? 'Not bad' : 'Keep practicing'}
            </h2>
            <p className="text-sm text-gray-500 dark:text-gray-400">{results.score} of {results.total} correct</p>
          </div>

          <div className="space-y-3">
            {(results.details || []).map((d, i) => (
              <div key={i} className={`rounded-xl p-4 border ${
                d.correct
                  ? 'bg-emerald-50 dark:bg-emerald-900/10 border-emerald-200 dark:border-emerald-800'
                  : 'bg-rose-50 dark:bg-rose-900/10 border-rose-200 dark:border-rose-800'
              }`}>
                <div className="flex items-start gap-3">
                  {d.correct ? (
                    <CheckCircle2 size={18} className="text-emerald-500 mt-0.5 flex-shrink-0" />
                  ) : (
                    <XCircle size={18} className="text-rose-500 mt-0.5 flex-shrink-0" />
                  )}
                  <div className="flex-1">
                    <p className="text-sm font-medium text-gray-800 dark:text-gray-200">{d.question}</p>
                    {!d.correct && (
                      <p className="text-xs text-gray-500 mt-1">
                        Your answer: <span className="text-rose-600">{d.answer}</span> &middot; Correct: <span className="text-emerald-600">{d.correctAnswer}</span>
                      </p>
                    )}
                    {d.explanation && (
                      <p className="text-xs text-gray-500 mt-1.5 italic">{d.explanation}</p>
                    )}
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>

        <div className="flex gap-3">
          <Button onClick={resetQuiz}>Take Another Quiz</Button>
          <Button variant="secondary" onClick={() => { resetQuiz(); setShowCreate(false); }}>Back to History</Button>
        </div>
      </div>
    );
  }

  // Default: history + create
  // ===== History list view =====
  //
  // Top: stats strip (avg score, total taken, best topic), CTA button.
  // Body: card-based history with score chip, topic, date, difficulty,
  // and a chevron-style "review" affordance (visual only — re-take
  // flow stays in the modal). Empty state gets a richer, more inviting
  // illustration than the bare "No quizzes" line it had before.
  const stats = computeAssessmentStats(history);

  return (
    <div className="w-full max-w-3xl mx-auto">
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-xl font-bold text-gray-900 dark:text-white">Assessments</h1>
          <p className="text-sm text-gray-500 dark:text-gray-400">
            {history.length === 0 ? 'No quizzes yet' : `${history.length} ${history.length === 1 ? 'quiz' : 'quizzes'} completed`}
          </p>
        </div>
        <Button onClick={() => setShowCreate(true)} size="sm"><Plus size={16} /> New Quiz</Button>
      </div>

      {/* Stats strip — only when there's history */}
      {history.length > 0 && (
        <div className="grid grid-cols-3 gap-3 mb-6">
          <StatCard
            icon={<TrendingUp size={14} className="text-blue-500" />}
            label="Average"
            value={`${stats.avg}%`}
            tone={stats.avg >= 80 ? 'good' : stats.avg >= 60 ? 'mid' : 'low'}
          />
          <StatCard
            icon={<Trophy size={14} className="text-amber-500" />}
            label="Best run"
            value={`${stats.best}%`}
            tone="good"
          />
          <StatCard
            icon={<Target size={14} className="text-rose-500" />}
            label="Streak"
            value={`${stats.streak}`}
            sub={stats.streak === 1 ? 'quiz' : 'quizzes'}
            tone="neutral"
          />
        </div>
      )}

      {/* Create modal */}
      <Modal open={showCreate} onClose={() => setShowCreate(false)} title="Create Quiz">
        <form onSubmit={handleGenerate} className="space-y-4">
          <Input label="Topic" placeholder="e.g., Calculus derivatives, World War II" value={topic} onChange={e => setTopic(e.target.value)} required />
          <PillGroup label="Difficulty" options={DIFFICULTY_OPTIONS} value={difficulty} onChange={setDifficulty} />
          <div>
            <label className="text-sm font-medium text-gray-700 dark:text-gray-300 mb-1.5 block">Number of questions</label>
            <div className="flex gap-2">
              {[3, 5, 10, 15, 20].map(n => (
                <button
                  key={n}
                  type="button"
                  onClick={() => setQuestionCount(n)}
                  className={`px-3 py-1.5 rounded-lg text-sm font-medium transition-colors ${
                    questionCount === n ? 'bg-blue-600 text-white' : 'bg-gray-100 dark:bg-[#1e1e2e] text-gray-600 dark:text-gray-300'
                  }`}
                >
                  {n}
                </button>
              ))}
            </div>
          </div>
          <Button type="submit" loading={generating} className="w-full">
            {generating ? 'Generating quiz...' : 'Generate Quiz'}
          </Button>
        </form>
      </Modal>

      {history.length === 0 && !showCreate ? (
        <div className="relative overflow-hidden bg-gradient-to-br from-blue-50 to-indigo-50 dark:from-blue-950/15 dark:to-indigo-950/15 rounded-2xl border border-blue-100 dark:border-white/[0.06] p-10 text-center">
          <div className="absolute -top-6 -right-6 w-24 h-24 rounded-full bg-blue-200/40 dark:bg-blue-500/10 blur-2xl pointer-events-none" />
          <div className="relative">
            <div className="inline-grid place-items-center w-14 h-14 rounded-2xl bg-white dark:bg-[#0f0f18] border border-gray-200 dark:border-white/10 mb-4 shadow-sm">
              <ClipboardCheck size={22} className="text-blue-500" strokeWidth={1.6} />
            </div>
            <h3 className="text-base font-bold text-gray-900 dark:text-white mb-1">Take your first quiz</h3>
            <p className="text-[12.5px] text-gray-500 dark:text-gray-400 mb-5 max-w-sm mx-auto">
              Pick any topic. The engine builds a 3-20 question multiple-choice quiz on the spot, grades it, and tracks your progress.
            </p>
            <Button onClick={() => setShowCreate(true)} size="sm"><Plus size={16} /> Start a quiz</Button>
          </div>
        </div>
      ) : (
        <div className="space-y-2">
          {history.map((h) => (
            <HistoryCard key={h.id} h={h} />
          ))}
        </div>
      )}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────
// Stats / history helpers — split into named components so the
// main view body reads as a list of intentional surfaces, not a
// 100-line tangle of nested divs.
// ─────────────────────────────────────────────────────────────
function computeAssessmentStats(history = []) {
  if (!history.length) return { avg: 0, best: 0, streak: 0 };
  const pcts = history.map((h) => Number(h.percentage) || 0);
  const avg = Math.round(pcts.reduce((a, b) => a + b, 0) / pcts.length);
  const best = Math.max(...pcts);
  // Streak = consecutive most-recent quizzes scoring >= 60%.
  let streak = 0;
  for (const h of history) {
    if ((Number(h.percentage) || 0) >= 60) streak += 1;
    else break;
  }
  return { avg, best, streak };
}

function StatCard({ icon, label, value, sub, tone = 'neutral' }) {
  const valueTone = {
    good:    'text-emerald-600 dark:text-emerald-400',
    mid:     'text-amber-600 dark:text-amber-400',
    low:     'text-rose-600 dark:text-rose-400',
    neutral: 'text-gray-900 dark:text-white',
  }[tone] || 'text-gray-900 dark:text-white';
  return (
    <div className="rounded-xl border border-gray-200 dark:border-white/[0.06] bg-white dark:bg-[#161622] px-4 py-3">
      <div className="flex items-center gap-1.5 text-[10.5px] uppercase tracking-[0.16em] font-bold text-gray-500 dark:text-gray-400 mb-1.5">
        {icon} {label}
      </div>
      <div className="flex items-baseline gap-1.5">
        <span className={`text-[22px] font-bold tracking-tight tabular-nums ${valueTone}`}>{value}</span>
        {sub && <span className="text-[11px] text-gray-500">{sub}</span>}
      </div>
    </div>
  );
}

function HistoryCard({ h }) {
  const pct = Number(h.percentage) || 0;
  const tone = pct >= 80 ? 'good' : pct >= 60 ? 'mid' : 'low';
  const TONE = {
    good: { ring: 'ring-emerald-500/40', text: 'text-emerald-600 dark:text-emerald-400', bg: 'bg-emerald-50 dark:bg-emerald-500/10' },
    mid:  { ring: 'ring-amber-500/40',   text: 'text-amber-600 dark:text-amber-400',     bg: 'bg-amber-50 dark:bg-amber-500/10' },
    low:  { ring: 'ring-rose-500/40',    text: 'text-rose-600 dark:text-rose-400',       bg: 'bg-rose-50 dark:bg-rose-500/10' },
  }[tone];
  return (
    <div className="group flex items-center gap-4 bg-white dark:bg-[#161622] rounded-xl border border-gray-200 dark:border-[#2A2A40] hover:border-gray-300 dark:hover:border-white/15 px-4 py-3.5 transition-colors">
      <div
        className={`relative w-12 h-12 rounded-full flex items-center justify-center text-[13px] font-bold flex-shrink-0 ${TONE.bg} ${TONE.text} ring-2 ${TONE.ring}`}
        title={`${h.score}/${h.total} correct`}
      >
        {pct}%
      </div>
      <div className="flex-1 min-w-0">
        <p className="text-[13.5px] font-semibold text-gray-900 dark:text-gray-100 truncate">{h.topic || 'Untitled quiz'}</p>
        <div className="flex items-center gap-2 mt-1 text-[11px] text-gray-500 dark:text-gray-400">
          <span className="tabular-nums">{h.score}/{h.total} correct</span>
          {h.difficulty && (
            <>
              <span className="text-gray-300 dark:text-gray-600">·</span>
              <span className="capitalize">{h.difficulty}</span>
            </>
          )}
          <span className="text-gray-300 dark:text-gray-600">·</span>
          <span className="inline-flex items-center gap-1">
            <Clock size={10} />
            {new Date(h.createdAt).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })}
          </span>
        </div>
      </div>
      <ArrowRight size={14} className="text-gray-300 dark:text-gray-600 group-hover:text-gray-500 group-hover:translate-x-0.5 transition-all" />
    </div>
  );
}
