import { useState, useEffect, useRef } from 'react';
import { useLocation } from 'react-router-dom';
import { ClipboardCheck, Plus, CheckCircle2, XCircle, Clock, ArrowRight, TrendingUp, Trophy, Target } from 'lucide-react';
import { generateAssessment, gradeAssessment, getAssessmentHistory } from '../api/assessments';
import Button from '../components/shared/Button';
import Input from '../components/shared/Input';
import PillGroup from '../components/shared/PillGroup';
import { DIFFICULTY_OPTIONS } from '../utils/constants';
import LoadingSpinner from '../components/shared/LoadingSpinner';
import Modal from '../components/shared/Modal';
import MathText from '../components/shared/MathText';

export default function AssessmentsPage() {
  const location = useLocation();
  const [history, setHistory] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showCreate, setShowCreate] = useState(false);
  const [generating, setGenerating] = useState(false);
  const [topic, setTopic] = useState('');
  const [difficulty, setDifficulty] = useState('beginner');
  const [questionCount, setQuestionCount] = useState(5);
  const [quiz, setQuiz] = useState(null);
  const [currentQ, setCurrentQ] = useState(0);
  const [answers, setAnswers] = useState({});
  const [results, setResults] = useState(null);
  const [grading, setGrading] = useState(false);
  const [selectedAnswer, setSelectedAnswer] = useState(null);
  const [genError, setGenError] = useState(null);
  // Optional source text (e.g. a note's body) passed through router state.
  // The server-side prompt grounds questions in this text instead of the
  // model's general knowledge of the topic.
  const [seedContext, setSeedContext] = useState('');
  const [seedSourceTitle, setSeedSourceTitle] = useState('');

  useEffect(() => {
    getAssessmentHistory().then(d => { setHistory(d.history || []); setLoading(false); }).catch(() => setLoading(false));
  }, []);

  // Seed from a launching page (e.g. NoteEditor "Make Quiz"). Auto-opens
  // the create modal pre-filled with the note title + content. Runs once.
  const seeded = useRef(false);
  useEffect(() => {
    if (seeded.current) return;
    const s = location.state || {};
    if (s.seedTopic || s.seedContext) {
      seeded.current = true;
      if (s.seedTopic) setTopic(s.seedTopic);
      if (s.seedContext) setSeedContext(s.seedContext);
      if (s.seedSourceTitle) setSeedSourceTitle(s.seedSourceTitle);
      if (s.seedDifficulty) setDifficulty(s.seedDifficulty);
      if (s.seedQuestionCount) setQuestionCount(s.seedQuestionCount);
      // Auto-open the create modal so the user just hits "Generate"
      setShowCreate(true);
    }
  }, [location.state]);

  async function handleGenerate(e) {
    e?.preventDefault?.();
    if (!topic.trim()) return;
    setGenerating(true); setShowCreate(false); setGenError(null);
    try {
      const data = await generateAssessment(topic.trim(), 'quiz', questionCount, difficulty, seedContext);
      setQuiz(data.assessment); setAnswers({}); setResults(null); setCurrentQ(0); setSelectedAnswer(null);
    } catch (err) { setGenError(err.message || 'Failed to generate quiz'); }
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
    setQuiz(null); setResults(null); setAnswers({}); setCurrentQ(0); setSelectedAnswer(null);
  }

  if (loading) return <div className="flex items-center justify-center h-64"><LoadingSpinner size={28} /></div>;

  if (generating) {
    return (
      <div className="w-full max-w-md mx-auto text-center py-24 px-6">
        <div className="inline-flex items-center gap-3 text-[13px] text-white/55">
          <LoadingSpinner size={16} />
          <span>Building your quiz on <span className="italic text-white/75">{topic}</span>…</span>
        </div>
      </div>
    );
  }

  if (genError && !quiz) {
    return (
      <div className="w-full max-w-md mx-auto text-center py-20">
        <p className="text-[13px] text-rose-400 mb-4">{genError}</p>
        <Button onClick={() => { setGenError(null); setShowCreate(true); }}>Try Again</Button>
      </div>
    );
  }

  // ── Active quiz ───────────────────────────────────────────────────────────
  if (quiz && !results) {
    const q = quiz.questions?.[currentQ];
    const total = quiz.questions?.length || 0;
    const answered = Object.keys(answers).length;

    return (
      <div className="w-full max-w-3xl mx-auto">
        <div className="flex items-center justify-between mb-6">
          <div>
            <h1 className="text-[18px] font-bold text-white/90">{quiz.title}</h1>
            <p className="text-[13px] text-white/35">{answered}/{total} answered</p>
          </div>
          <div className="flex items-center gap-3">
            <button onClick={resetQuiz} className="text-[13px] text-white/35 hover:text-white/60 transition-colors">Cancel</button>
            <Button onClick={handleSubmit} loading={grading} disabled={answered < total} size="sm">Submit Quiz</Button>
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
                className={`h-1.5 flex-1 rounded-full transition-colors ${
                  isCurrent ? 'bg-white/55' : isAnswered ? 'bg-white/30' : 'bg-white/[0.08]'
                }`}
              />
            );
          })}
        </div>

        {q && (
          <div className="rounded-2xl border border-white/[0.08] bg-white/[0.03] backdrop-blur-sm p-6">
            <p className="text-[11px] text-white/30 mb-3">Question {currentQ + 1} of {total}</p>
            <MathText as="h2" className="text-[15px] font-semibold text-white/90 mb-5">{q.question}</MathText>

            <div className="flex flex-col gap-2.5">
              {(q.options || []).map((opt) => {
                const letter = opt.charAt(0);
                const isSelected = selectedAnswer === letter;
                return (
                  <button
                    key={opt}
                    onClick={() => selectAnswer(letter)}
                    className={`w-full text-left px-4 py-3 rounded-xl text-[13px] transition-all border ${
                      isSelected
                        ? 'border-white/[0.24] bg-white/[0.10] text-white/90 font-medium'
                        : 'border-white/[0.07] bg-white/[0.02] text-white/60 hover:border-white/[0.16] hover:bg-white/[0.06] hover:text-white/80'
                    }`}
                  >
                    <span className={`inline-flex items-center justify-center w-6 h-6 rounded-full text-[11px] font-bold mr-3 ${
                      isSelected ? 'bg-white/[0.90] text-black' : 'bg-white/[0.08] text-white/40'
                    }`}>
                      {letter}
                    </span>
                    <MathText>{opt.slice(3)}</MathText>
                  </button>
                );
              })}
            </div>

            <div className="flex items-center justify-between mt-6 pt-4 border-t border-white/[0.06]">
              <Button variant="ghost" size="sm" onClick={prevQuestion} disabled={currentQ === 0}>Previous</Button>
              {currentQ < total - 1 ? (
                <Button variant="ghost" size="sm" onClick={nextQuestion}>Next <ArrowRight size={14} /></Button>
              ) : (
                <Button onClick={handleSubmit} loading={grading} disabled={answered < total} size="sm">Submit Quiz</Button>
              )}
            </div>
          </div>
        )}
      </div>
    );
  }

  // ── Results ───────────────────────────────────────────────────────────────
  if (results) {
    const pct = results.percentage ?? 0;
    const scoreCls = pct >= 80 ? 'text-emerald-400 bg-emerald-900/20 ring-emerald-700/40'
      : pct >= 60 ? 'text-white/80 bg-white/[0.08] ring-white/[0.18]'
      : 'text-rose-400 bg-rose-900/20 ring-rose-700/40';

    return (
      <div className="w-full max-w-3xl mx-auto">
        <div className="rounded-2xl border border-white/[0.07] bg-white/[0.03] p-6 mb-4">
          <div className="text-center mb-6">
            <div className={`inline-flex items-center justify-center w-16 h-16 rounded-full text-[22px] font-bold mb-3 ring-2 ${scoreCls}`}>
              {pct}%
            </div>
            <h2 className="text-[17px] font-bold text-white/90">
              {pct >= 80 ? 'Great job!' : pct >= 60 ? 'Not bad' : 'Keep practicing'}
            </h2>
            <p className="text-[13px] text-white/40">{results.score} of {results.total} correct</p>
          </div>

          <div className="flex flex-col gap-3">
            {(results.details || []).map((d, i) => (
              <div key={i} className={`rounded-xl p-4 border ${
                d.correct ? 'bg-emerald-900/10 border-emerald-700/30' : 'bg-rose-900/10 border-rose-700/30'
              }`}>
                <div className="flex items-start gap-3">
                  {d.correct
                    ? <CheckCircle2 size={16} className="text-emerald-400 mt-0.5 flex-shrink-0" />
                    : <XCircle size={16} className="text-rose-400 mt-0.5 flex-shrink-0" />}
                  <div className="flex-1">
                    <p className="text-[13px] font-medium text-white/80">{d.question}</p>
                    {!d.correct && (
                      <p className="text-[11px] text-white/40 mt-1">
                        Your answer: <span className="text-rose-400">{d.answer}</span> · Correct: <span className="text-emerald-400">{d.correctAnswer}</span>
                      </p>
                    )}
                    {d.explanation && <p className="text-[11px] text-white/30 mt-1.5 italic">{d.explanation}</p>}
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

  // ── History + create ──────────────────────────────────────────────────────
  const stats = computeAssessmentStats(history);

  return (
    <div className="w-full max-w-3xl mx-auto">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-[20px] font-bold text-white/90">Assessments</h1>
          <p className="text-[13px] text-white/35">
            {history.length === 0 ? 'No quizzes yet' : `${history.length} ${history.length === 1 ? 'quiz' : 'quizzes'} completed`}
          </p>
        </div>
        <Button onClick={() => setShowCreate(true)} size="sm"><Plus size={16} /> New</Button>
      </div>

      {history.length > 0 && (
        <div className="grid grid-cols-3 gap-3 mb-6">
          <StatCard icon={<TrendingUp size={13} />} label="Average" value={`${stats.avg}%`} pct={stats.avg} />
          <StatCard icon={<Trophy size={13} />} label="Best run" value={`${stats.best}%`} pct={stats.best} />
          <StatCard icon={<Target size={13} />} label="Streak" value={`${stats.streak}`} sub={stats.streak === 1 ? 'quiz' : 'quizzes'} />
        </div>
      )}

      <Modal open={showCreate} onClose={() => setShowCreate(false)} title="New quiz">
        <form onSubmit={handleGenerate} className="flex flex-col gap-4">
          {seedContext && (
            <div className="rounded-lg border border-emerald-300 bg-emerald-50 text-emerald-900 dark:border-emerald-500/20 dark:bg-emerald-500/[0.06] dark:text-emerald-200/90 px-3 py-2 text-[12px] leading-relaxed">
              <span className="font-semibold">Grounded in your note</span>
              {seedSourceTitle && <span className="text-emerald-700/80 dark:text-emerald-200/55"> · </span>}
              {seedSourceTitle && <span className="text-emerald-900 dark:text-emerald-200/85">"{seedSourceTitle}"</span>}
            </div>
          )}
          <Input label="Topic" placeholder="Calculus, WW2, etc." value={topic} onChange={e => setTopic(e.target.value)} required />
          <PillGroup label="Difficulty" options={DIFFICULTY_OPTIONS} value={difficulty} onChange={setDifficulty} />
          <div>
            <label className="block text-[10px] font-black uppercase tracking-[0.18em] text-gray-500 dark:text-white/35 mb-2">Questions</label>
            <div className="flex gap-2">
              {[3, 5, 10, 15, 20].map(n => {
                const active = questionCount === n;
                return (
                  <button
                    key={n}
                    type="button"
                    onClick={() => setQuestionCount(n)}
                    className={`px-3 py-1.5 rounded-lg text-[12px] font-semibold transition-colors border ${
                      active
                        ? 'bg-gray-900 text-white border-gray-900 dark:bg-white/15 dark:text-white/90 dark:border-white/20'
                        : 'bg-gray-100 text-gray-500 border-gray-200 hover:bg-gray-200 hover:text-gray-700 dark:bg-white/[0.04] dark:text-white/40 dark:border-white/[0.08] dark:hover:bg-white/[0.08] dark:hover:text-white/65'
                    }`}
                  >
                    {n}
                  </button>
                );
              })}
            </div>
          </div>
          <Button type="submit" loading={generating} className="w-full">
            {generating ? 'Generating quiz…' : 'Generate Quiz'}
          </Button>
        </form>
      </Modal>

      {history.length === 0 && !showCreate ? (
        <div className="rounded-2xl border border-white/[0.07] bg-white/[0.03] p-10 text-center">
          <div className="inline-grid place-items-center w-14 h-14 rounded-2xl bg-white/[0.06] border border-white/[0.09] mb-4">
            <ClipboardCheck size={22} className="text-white/35" strokeWidth={1.6} />
          </div>
          <h3 className="text-[15px] font-bold text-white/80 mb-1">Take your first quiz</h3>
          <p className="text-[12px] text-white/35 mb-5 max-w-sm mx-auto">
            Pick any topic. The engine builds a 3-20 question multiple-choice quiz on the spot, grades it, and tracks your progress.
          </p>
          <Button onClick={() => setShowCreate(true)} size="sm"><Plus size={16} /> Start a quiz</Button>
        </div>
      ) : (
        <div className="flex flex-col gap-2">
          {history.map((h) => <HistoryCard key={h.id} h={h} />)}
        </div>
      )}
    </div>
  );
}

function computeAssessmentStats(history = []) {
  if (!history.length) return { avg: 0, best: 0, streak: 0 };
  const pcts = history.map((h) => Number(h.percentage) || 0);
  const avg = Math.round(pcts.reduce((a, b) => a + b, 0) / pcts.length);
  const best = Math.max(...pcts);
  let streak = 0;
  for (const h of history) {
    if ((Number(h.percentage) || 0) >= 60) streak += 1;
    else break;
  }
  return { avg, best, streak };
}

function StatCard({ icon, label, value, sub, pct }) {
  const valueCls = pct >= 80 ? 'text-emerald-400' : pct >= 60 ? 'text-white/80' : pct !== undefined ? 'text-rose-400' : 'text-white/80';
  return (
    <div className="rounded-xl border border-white/[0.07] bg-white/[0.03] px-4 py-3">
      <div className="flex items-center gap-1.5 text-[10px] uppercase tracking-[0.18em] font-black text-white/25 mb-1.5">
        <span className="text-white/30">{icon}</span> {label}
      </div>
      <div className="flex items-baseline gap-1.5">
        <span className={`text-[22px] font-bold tracking-tight tabular-nums ${valueCls}`}>{value}</span>
        {sub && <span className="text-[11px] text-white/30">{sub}</span>}
      </div>
    </div>
  );
}

function HistoryCard({ h }) {
  const pct = Number(h.percentage) || 0;
  const scoreCls = pct >= 80 ? 'text-emerald-400 bg-emerald-900/20 ring-emerald-700/40'
    : pct >= 60 ? 'text-white/70 bg-white/[0.07] ring-white/[0.15]'
    : 'text-rose-400 bg-rose-900/20 ring-rose-700/40';

  return (
    <div className="group flex items-center gap-4 rounded-xl border border-white/[0.07] bg-white/[0.03] hover:border-white/[0.15] hover:bg-white/[0.05] backdrop-blur-sm px-4 py-3.5 transition-colors">
      <div className={`relative w-12 h-12 rounded-full flex items-center justify-center text-[12px] font-bold flex-shrink-0 ring-2 ${scoreCls}`}>
        {pct}%
      </div>
      <div className="flex-1 min-w-0">
        <p className="text-[13px] font-semibold text-white/80 truncate">{h.topic || 'Untitled quiz'}</p>
        <div className="flex items-center gap-2 mt-1 text-[11px] text-white/30">
          <span className="tabular-nums">{h.score}/{h.total} correct</span>
          {h.difficulty && (
            <>
              <span className="text-white/15">·</span>
              <span className="capitalize">{h.difficulty}</span>
            </>
          )}
          <span className="text-white/15">·</span>
          <span className="inline-flex items-center gap-1">
            <Clock size={9} />
            {new Date(h.createdAt).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })}
          </span>
        </div>
      </div>
      <ArrowRight size={13} className="text-white/20 group-hover:text-white/45 group-hover:translate-x-0.5 transition-all" />
    </div>
  );
}
