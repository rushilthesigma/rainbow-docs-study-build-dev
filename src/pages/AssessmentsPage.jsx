import { useState, useEffect } from 'react';
import { ClipboardCheck, Plus, CheckCircle2, XCircle, Clock, ArrowRight } from 'lucide-react';
import { generateAssessment, gradeAssessment, getAssessmentHistory } from '../api/assessments';
import Button from '../components/shared/Button';
import Input from '../components/shared/Input';
import PillGroup from '../components/shared/PillGroup';
import { DIFFICULTY_OPTIONS } from '../utils/constants';
import LoadingSpinner from '../components/shared/LoadingSpinner';
import Modal from '../components/shared/Modal';

export default function AssessmentsPage() {
  const [history, setHistory] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showCreate, setShowCreate] = useState(false);
  const [generating, setGenerating] = useState(false);
  const [topic, setTopic] = useState('');
  const [difficulty, setDifficulty] = useState('beginner');
  const [questionCount, setQuestionCount] = useState(5);

  // Active quiz state
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
    e.preventDefault();
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

  // Generating loading screen
  if (generating) {
    return (
      <div className="w-full max-w-md mx-auto text-center py-20">
        <div className="w-16 h-16 rounded-2xl bg-blue-50 dark:bg-blue-900/20 flex items-center justify-center mx-auto mb-5">
          <LoadingSpinner size={28} />
        </div>
        <h2 className="text-lg font-bold text-gray-900 dark:text-white mb-2">Generating Quiz</h2>
        <p className="text-sm text-gray-500 dark:text-gray-400 mb-1">{topic}</p>
        <p className="text-xs text-gray-400 mb-6">{questionCount} questions &middot; {difficulty}</p>
        <div className="w-full h-2 bg-gray-100 dark:bg-[#1e1e2e] rounded-full overflow-hidden">
          <div className="h-full bg-blue-600 rounded-full animate-pulse" style={{ width: '65%' }} />
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
        {/* Quiz header */}
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

        {/* Question card */}
        {q && (
          <div className="bg-white dark:bg-[#161622] rounded-xl border border-gray-200 dark:border-[#2A2A40] p-6">
            <p className="text-xs text-gray-400 mb-3">Question {currentQ + 1} of {total}</p>
            <h2 className="text-base font-semibold text-gray-900 dark:text-gray-100 mb-5">{q.question}</h2>

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
                    {opt.slice(3)}
                  </button>
                );
              })}
            </div>

            {/* Nav */}
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
  return (
    <div className="w-full max-w-3xl mx-auto">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-xl font-bold text-gray-900 dark:text-white">Assessments</h1>
          <p className="text-sm text-gray-500 dark:text-gray-400">{history.length} completed</p>
        </div>
        <Button onClick={() => setShowCreate(true)} size="sm"><Plus size={16} /> New Quiz</Button>
      </div>

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
        <div className="bg-white dark:bg-[#161622] rounded-xl border border-gray-200 dark:border-[#2A2A40] p-12 text-center">
          <ClipboardCheck size={28} className="text-gray-300 dark:text-gray-600 mx-auto mb-3" />
          <p className="text-sm text-gray-500 dark:text-gray-400 mb-4">No quizzes taken yet</p>
          <Button onClick={() => setShowCreate(true)} size="sm"><Plus size={16} /> Take a Quiz</Button>
        </div>
      ) : (
        <div className="space-y-2">
          {history.map(h => (
            <div key={h.id} className="flex items-center gap-4 bg-white dark:bg-[#161622] rounded-xl border border-gray-200 dark:border-[#2A2A40] px-5 py-4">
              <div className={`w-10 h-10 rounded-full flex items-center justify-center text-sm font-bold flex-shrink-0 ${
                h.percentage >= 80 ? 'bg-emerald-50 dark:bg-emerald-900/20 text-emerald-600' :
                h.percentage >= 60 ? 'bg-amber-50 dark:bg-amber-900/20 text-amber-600' :
                'bg-rose-50 dark:bg-rose-900/20 text-rose-600'
              }`}>
                {h.percentage}%
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium text-gray-900 dark:text-gray-100 truncate">{h.topic}</p>
                <div className="flex items-center gap-2 mt-0.5">
                  <span className="text-xs text-gray-400">{h.score}/{h.total} correct</span>
                  <span className="text-xs text-gray-300">&middot;</span>
                  <span className="text-xs text-gray-400 flex items-center gap-1">
                    <Clock size={10} /> {new Date(h.createdAt).toLocaleDateString()}
                  </span>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
