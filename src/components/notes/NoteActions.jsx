import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { MessageSquare, ClipboardCheck, BookOpen, Sparkles, X, CheckCircle2, XCircle, ArrowRight } from 'lucide-react';
import Modal from '../shared/Modal';
import Button from '../shared/Button';
import PillGroup from '../shared/PillGroup';
import LoadingSpinner from '../shared/LoadingSpinner';
import MathText from '../shared/MathText';
import { DIFFICULTY_OPTIONS } from '../../utils/constants';
import { generateAssessment, gradeAssessment } from '../../api/assessments';
import { useWindowManagerOptional } from '../../context/WindowManagerContext';

// Three actions that "create from a note": a Study session seeded with
// the note text as a source, a Quiz grounded in the note's content
// (played inline), and a Curriculum that uses the note as a source.
// Works in both shells — when the WindowManagerContext is present we
// launch desktop windows with seeded meta; otherwise we navigate via
// react-router (mobile + classic routes).
export default function NoteActions({ note }) {
  const wm = useWindowManagerOptional();
  const navigate = useNavigate();
  const [quizOpen, setQuizOpen] = useState(false);

  const noteText = buildNoteText(note);
  const hasContent = noteText.length > 20;
  const title = (note?.title || '').trim() || 'Untitled note';

  function launchStudy() {
    const initialMessage = `Help me study these notes: "${title}". Quiz me, explain anything unclear, and use the attached source.`;
    const initialSources = [{ title, content: noteText }];
    if (wm?.openApp) {
      wm.openApp('study', 'Study Mode', { initialMessage, initialSources });
    } else {
      navigate('/study', { state: { initialMessage, initialSources } });
    }
  }

  function launchCurriculum() {
    const seedTopic = title;
    const seedSources = [{ title, kind: 'text', content: noteText }];
    if (wm?.openApp) {
      // CurriculaApp reads `seedTopic` / `seedSources` from meta and
      // jumps to the "new curriculum" view with the form pre-filled.
      wm.openApp('curricula', 'Curricula', { seedTopic, seedSources, seedView: 'new' });
    } else {
      navigate('/new', { state: { seedTopic, seedSources } });
    }
  }

  return (
    <>
      <div className="flex items-center gap-2 flex-wrap">
        <ActionButton
          icon={<MessageSquare size={13} />}
          label="Study with AI"
          onClick={launchStudy}
          disabled={!hasContent}
        />
        <ActionButton
          icon={<ClipboardCheck size={13} />}
          label="Make Quiz"
          onClick={() => setQuizOpen(true)}
          disabled={!hasContent}
        />
        <ActionButton
          icon={<BookOpen size={13} />}
          label="Build Curriculum"
          onClick={launchCurriculum}
          disabled={!hasContent}
        />
        {!hasContent && (
          <span className="text-[11px] text-white/30 ml-1">Write some notes first</span>
        )}
      </div>
      <QuizFromNoteModal
        open={quizOpen}
        onClose={() => setQuizOpen(false)}
        noteTitle={title}
        noteText={noteText}
      />
    </>
  );
}

function ActionButton({ icon, label, onClick, disabled }) {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      className="inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-[12px] font-medium border border-white/[0.10] bg-white/[0.04] text-white/75 hover:text-white hover:bg-white/[0.10] hover:border-white/[0.18] disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
    >
      <span className="text-white/55">{icon}</span>
      {label}
    </button>
  );
}

// Concatenate the note's relevant text fields into a single source body.
// Cornell notes also have cues + summary worth feeding to the model.
function buildNoteText(note) {
  if (!note) return '';
  const parts = [];
  if (note.title) parts.push(`# ${note.title}`);
  if (note.mainNotes) parts.push(note.mainNotes);
  if (Array.isArray(note.cues) && note.cues.length) {
    parts.push(`\nCues:\n${note.cues.map(c => `- ${c}`).join('\n')}`);
  }
  if (note.summary) parts.push(`\nSummary:\n${note.summary}`);
  return parts.join('\n\n').trim();
}

// Self-contained quiz player that takes over the modal once the AI
// returns questions. Lives here instead of routing to AssessmentsPage so
// the "Quiz on this note" stays anchored to the note the user is reading.
function QuizFromNoteModal({ open, onClose, noteTitle, noteText }) {
  const [difficulty, setDifficulty] = useState('beginner');
  const [questionCount, setQuestionCount] = useState(5);
  const [generating, setGenerating] = useState(false);
  const [error, setError] = useState(null);
  const [quiz, setQuiz] = useState(null);
  const [answers, setAnswers] = useState({});
  const [currentQ, setCurrentQ] = useState(0);
  const [selectedAnswer, setSelectedAnswer] = useState(null);
  const [results, setResults] = useState(null);
  const [grading, setGrading] = useState(false);

  function reset() {
    setQuiz(null); setAnswers({}); setCurrentQ(0); setSelectedAnswer(null);
    setResults(null); setGenerating(false); setGrading(false); setError(null);
  }

  function handleClose() {
    reset();
    onClose?.();
  }

  async function handleGenerate(e) {
    e?.preventDefault?.();
    if (generating) return;
    setGenerating(true); setError(null);
    try {
      const data = await generateAssessment(noteTitle, 'quiz', questionCount, difficulty, noteText);
      setQuiz(data.assessment);
      setAnswers({});
      setCurrentQ(0);
      setSelectedAnswer(null);
      setResults(null);
    } catch (err) {
      setError(err.message || 'Failed to generate quiz');
    } finally {
      setGenerating(false);
    }
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
      const result = await gradeAssessment(quiz, answers);
      setResults(result);
    } catch (err) { setError(err.message || 'Failed to grade quiz'); }
    setGrading(false);
  }

  // Setup phase — difficulty / question count
  if (open && !quiz && !generating) {
    return (
      <Modal open={open} onClose={handleClose} title={`Quiz on "${noteTitle}"`}>
        <form onSubmit={handleGenerate} className="flex flex-col gap-4">
          <div className="rounded-lg border border-emerald-300 bg-emerald-50 text-emerald-900 dark:border-emerald-500/20 dark:bg-emerald-500/[0.06] dark:text-emerald-200/90 px-3 py-2 text-[12px] leading-relaxed flex items-start gap-2">
            <Sparkles size={12} className="text-emerald-600 dark:text-emerald-400 mt-0.5 flex-shrink-0" />
            <span>The AI will write questions <span className="font-semibold">grounded in your note</span> — not generic ones about the topic.</span>
          </div>
          <PillGroup label="Difficulty" options={DIFFICULTY_OPTIONS} value={difficulty} onChange={setDifficulty} />
          <div>
            <label className="block text-[10px] font-black uppercase tracking-[0.18em] text-gray-500 dark:text-white/35 mb-2">Questions</label>
            <div className="flex gap-2">
              {[3, 5, 10, 15].map(n => {
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
          {error && (
            <div className="text-[12px] text-rose-400 bg-rose-900/20 border border-rose-700/30 rounded-lg px-3 py-2">{error}</div>
          )}
          <Button type="submit" className="w-full">
            <Sparkles size={14} /> Generate Quiz
          </Button>
        </form>
      </Modal>
    );
  }

  // Generating phase
  if (open && generating) {
    return (
      <Modal open={open} onClose={handleClose} title="Building your quiz">
        <div className="py-8 text-center">
          <LoadingSpinner size={20} />
          <p className="text-[12px] text-white/45 mt-3">Reading your note and writing questions…</p>
        </div>
      </Modal>
    );
  }

  // Results phase
  if (open && results) {
    const pct = results.percentage ?? 0;
    const scoreCls = pct >= 80 ? 'text-emerald-400 bg-emerald-900/20 ring-emerald-700/40'
      : pct >= 60 ? 'text-white/80 bg-white/[0.08] ring-white/[0.18]'
      : 'text-rose-400 bg-rose-900/20 ring-rose-700/40';
    return (
      <Modal open={open} onClose={handleClose} title="Quiz results">
        <div className="text-center mb-5">
          <div className={`inline-flex items-center justify-center w-16 h-16 rounded-full text-[20px] font-bold mb-2 ring-2 ${scoreCls}`}>
            {pct}%
          </div>
          <p className="text-[13px] text-white/65">{results.score} of {results.total} correct</p>
        </div>
        <div className="flex flex-col gap-2 max-h-[40vh] overflow-y-auto">
          {(results.details || []).map((d, i) => (
            <div key={i} className={`rounded-lg p-3 border text-[12px] ${d.correct ? 'bg-emerald-900/10 border-emerald-700/30' : 'bg-rose-900/10 border-rose-700/30'}`}>
              <div className="flex items-start gap-2">
                {d.correct
                  ? <CheckCircle2 size={14} className="text-emerald-400 mt-0.5 flex-shrink-0" />
                  : <XCircle size={14} className="text-rose-400 mt-0.5 flex-shrink-0" />}
                <div className="flex-1">
                  <p className="text-white/85 font-medium">{d.question}</p>
                  {!d.correct && (
                    <p className="text-[11px] text-white/45 mt-1">
                      You: <span className="text-rose-300">{d.answer}</span> · Correct: <span className="text-emerald-300">{d.correctAnswer}</span>
                    </p>
                  )}
                  {d.explanation && <p className="text-[11px] text-white/35 mt-1 italic">{d.explanation}</p>}
                </div>
              </div>
            </div>
          ))}
        </div>
        <div className="flex gap-2 mt-4">
          <Button onClick={reset} className="flex-1">Another Quiz</Button>
          <Button variant="secondary" onClick={handleClose} className="flex-1">Done</Button>
        </div>
      </Modal>
    );
  }

  // Active quiz phase
  if (open && quiz && !results) {
    const q = quiz.questions?.[currentQ];
    const total = quiz.questions?.length || 0;
    const answered = Object.keys(answers).length;
    return (
      <Modal open={open} onClose={handleClose} title={quiz.title || `Quiz: ${noteTitle}`}>
        <div className="flex items-center justify-between mb-4">
          <p className="text-[12px] text-white/45">{answered}/{total} answered</p>
          <button onClick={reset} className="text-[11px] text-white/35 hover:text-white/60 inline-flex items-center gap-1">
            <X size={12} /> Restart
          </button>
        </div>
        <div className="flex gap-1.5 mb-4">
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
          <div>
            <p className="text-[11px] text-white/30 mb-2">Question {currentQ + 1} of {total}</p>
            <MathText as="h3" className="text-[14px] font-semibold text-white/90 mb-4">{q.question}</MathText>
            <div className="flex flex-col gap-2 mb-4">
              {(q.options || []).map((opt) => {
                const letter = opt.charAt(0);
                const isSelected = selectedAnswer === letter;
                return (
                  <button
                    key={opt}
                    onClick={() => selectAnswer(letter)}
                    className={`w-full text-left px-3 py-2.5 rounded-lg text-[12px] transition-all border ${
                      isSelected
                        ? 'border-white/[0.24] bg-white/[0.10] text-white/90 font-medium'
                        : 'border-white/[0.07] bg-white/[0.02] text-white/60 hover:border-white/[0.16] hover:bg-white/[0.06] hover:text-white/80'
                    }`}
                  >
                    <span className={`inline-flex items-center justify-center w-5 h-5 rounded-full text-[10px] font-bold mr-2 ${
                      isSelected ? 'bg-white/[0.90] text-black' : 'bg-white/[0.08] text-white/40'
                    }`}>
                      {letter}
                    </span>
                    <MathText>{opt.slice(3)}</MathText>
                  </button>
                );
              })}
            </div>
            <div className="flex items-center justify-between pt-3 border-t border-white/[0.06]">
              <Button variant="ghost" size="sm" onClick={prevQuestion} disabled={currentQ === 0}>Previous</Button>
              {currentQ < total - 1 ? (
                <Button variant="ghost" size="sm" onClick={nextQuestion}>Next <ArrowRight size={12} /></Button>
              ) : (
                <Button size="sm" onClick={handleSubmit} loading={grading} disabled={answered < total}>Submit</Button>
              )}
            </div>
          </div>
        )}
      </Modal>
    );
  }

  return null;
}
