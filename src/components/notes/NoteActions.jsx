import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { MessageSquare, ClipboardCheck, BookOpen, Sparkles, X, CheckCircle2, XCircle, ArrowRight, Wand2 } from 'lucide-react';
import Modal from '../shared/Modal';
import Button from '../shared/Button';
import PillGroup from '../shared/PillGroup';
import LoadingSpinner from '../shared/LoadingSpinner';
import MathText from '../shared/MathText';
import { DIFFICULTY_OPTIONS } from '../../utils/constants';
import { generateAssessment, gradeAssessment } from '../../api/assessments';
import { updateNote } from '../../api/notes';
import { apiFetch } from '../../api/client';
import { useWindowManagerOptional } from '../../context/WindowManagerContext';

// Actions that "create from a note": a Study session seeded with
// the note text as a source, a Quiz grounded in the note's content
// (played inline), a Curriculum that uses the note as a source, and an
// "AI Edit" pass that rewrites/extends the note based on a free-form
// instruction (e.g. "make it shorter", "add a section on X").
//
// Works in both shells — when the WindowManagerContext is present we
// launch desktop windows with seeded meta; otherwise we navigate via
// react-router (mobile + classic routes).
//
// `onNoteUpdated(patch)` is fired after a successful AI edit so the
// parent editor can refresh its local state without a re-fetch.
export default function NoteActions({ note, onNoteUpdated }) {
  const wm = useWindowManagerOptional();
  const navigate = useNavigate();
  const [quizOpen, setQuizOpen] = useState(false);
  const [aiEditOpen, setAiEditOpen] = useState(false);

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
        <ActionButton
          icon={<Wand2 size={13} />}
          label="AI Edit"
          onClick={() => setAiEditOpen(true)}
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
      <AIEditNoteModal
        open={aiEditOpen}
        onClose={() => setAiEditOpen(false)}
        note={note}
        noteText={noteText}
        onApplied={(patch) => onNoteUpdated?.(patch)}
      />
    </>
  );
}

// Free-form AI editor for the current note. The user types an
// instruction ("tighten this", "add a section on Y", "convert to a
// table"), and the AI rewrites mainNotes (and the title, if it
// volunteers a better one) in place. Cornell extras (cues/summary)
// pass through untouched — those have their own dedicated regenerate
// buttons.
function AIEditNoteModal({ open, onClose, note, noteText, onApplied }) {
  const [instruction, setInstruction] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);

  function handleClose() {
    if (busy) return;
    setError(null);
    setInstruction('');
    onClose?.();
  }

  async function handleSubmit(e) {
    e?.preventDefault?.();
    const instr = instruction.trim();
    if (!instr || busy || !note?.id) return;
    setBusy(true);
    setError(null);
    try {
      const isCornell = note.type === 'cornell';
      const system = `You revise an existing study note based on the student's instruction. Output ONLY valid JSON, no markdown fences, no prose. Shape: {"title": "...", "mainNotes": "..."}. Keep the note's overall topic but apply the requested change. Write mainNotes as plain text only — no markdown, no asterisks, no hashes, no bullet dashes. Use line breaks and indentation for structure. The note should remain organized, dense, and useful for studying.`;
      const userMessage = `INSTRUCTION FROM THE STUDENT:
${instr}

CURRENT NOTE TITLE:
${(note.title || 'Untitled').trim()}

CURRENT NOTE BODY:
"""
${(noteText || '').slice(0, 8000)}
"""

Return the revised note as JSON.`;

      const result = await apiFetch('/api/chat', {
        method: 'POST',
        body: JSON.stringify({
          system,
          messages: [{ role: 'user', content: userMessage }],
          max_tokens: 4000,
        }),
      });
      const text = result.content?.[0]?.text || '';
      let parsed = null;
      try { parsed = JSON.parse(text); } catch {
        const m = text.match(/\{[\s\S]*\}/);
        if (m) { try { parsed = JSON.parse(m[0]); } catch {} }
      }
      if (!parsed?.mainNotes && !parsed?.title) {
        throw new Error('AI did not return a usable revision.');
      }
      const patch = {};
      if (typeof parsed.title === 'string' && parsed.title.trim()) patch.title = parsed.title.trim();
      if (typeof parsed.mainNotes === 'string') patch.mainNotes = parsed.mainNotes;
      await updateNote(note.id, patch);
      onApplied?.(patch);
      // Hint not used here, but keep Cornell intact — server merges by
      // patch keys, so cues/summary stay untouched.
      void isCornell;
      handleClose();
    } catch (err) {
      setError(err?.message || 'Failed to revise the note. Try again.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <Modal open={open} onClose={handleClose} title="AI edit this note" size="md">
      <form onSubmit={handleSubmit} className="flex flex-col gap-3">
        <div className="flex items-start gap-2 rounded-xl border border-blue-400/20 bg-blue-500/[0.06] px-3 py-2 text-[12px] text-blue-100/85 leading-relaxed">
          <Sparkles size={12} className="text-blue-300 mt-0.5 flex-shrink-0" />
          <span>Describe how to revise the note. The AI rewrites the body (and title, if it volunteers a better one) in place.</span>
        </div>
        <textarea
          autoFocus
          value={instruction}
          onChange={e => setInstruction(e.target.value)}
          rows={4}
          placeholder="e.g. Make this more concise. Add a section on edge cases. Convert key facts into a numbered list."
          className="w-full rounded-xl border border-white/[0.10] bg-white/[0.04] px-3.5 py-2.5 text-[14px] text-white/90 placeholder-white/30 outline-none focus:border-blue-400/50 focus:ring-2 focus:ring-blue-400/20 resize-y leading-relaxed"
          disabled={busy}
        />
        {error && (
          <p className="text-[12px] text-rose-300/90 bg-rose-500/[0.08] border border-rose-400/[0.20] rounded-lg px-3 py-2">{error}</p>
        )}
        <div className="flex gap-2 justify-end">
          <Button type="button" variant="ghost" size="sm" onClick={handleClose} disabled={busy}>Cancel</Button>
          <Button type="submit" size="sm" disabled={!instruction.trim()} loading={busy}>
            {!busy && <Wand2 size={12} />}
            {busy ? 'Rewriting…' : 'Apply'}
          </Button>
        </div>
      </form>
    </Modal>
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
          <div className="rounded-lg border border-blue-300 bg-blue-50 text-blue-900 dark:border-blue-400/25 dark:bg-blue-500/[0.08] dark:text-blue-100/90 px-3 py-2 text-[12px] leading-relaxed flex items-start gap-2">
            <Sparkles size={12} className="text-blue-600 dark:text-blue-300 mt-0.5 flex-shrink-0" />
            <span>The AI will write questions <span className="font-semibold">grounded in your note</span> — not generic ones about the topic.</span>
          </div>
          <PillGroup label="Difficulty" options={DIFFICULTY_OPTIONS} value={difficulty} onChange={setDifficulty} />
          <div>
            <label className="block text-[10px] font-black uppercase tracking-[0.18em] text-blue-700/80 dark:text-blue-200/55 mb-2">Questions</label>
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
                        ? 'bg-blue-600 text-white border-blue-500 dark:bg-blue-500 dark:border-blue-400'
                        : 'bg-blue-50 text-blue-700 border-blue-200 hover:bg-blue-100 hover:border-blue-300 dark:bg-blue-500/[0.06] dark:text-blue-200/65 dark:border-blue-400/15 dark:hover:bg-blue-500/[0.12] dark:hover:text-blue-100'
                    }`}
                  >
                    {n}
                  </button>
                );
              })}
            </div>
          </div>
          {error && (
            <div className="text-[12px] text-rose-700 bg-rose-50 border border-rose-200 rounded-lg px-3 py-2 dark:text-rose-300 dark:bg-rose-900/20 dark:border-rose-700/30">{error}</div>
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
          <p className="text-[12px] text-blue-200/75 mt-3">Reading your note and writing questions…</p>
        </div>
      </Modal>
    );
  }

  // Results phase
  if (open && results) {
    const pct = results.percentage ?? 0;
    const wrong = (results.total ?? 0) - (results.score ?? 0);
    const tier = pct >= 80 ? 'good' : pct >= 60 ? 'ok' : 'bad';
    const heroCls = tier === 'good'
      ? 'text-emerald-600 bg-emerald-50 ring-emerald-200 dark:text-emerald-300 dark:bg-emerald-500/[0.12] dark:ring-emerald-400/30'
      : tier === 'ok'
        ? 'text-blue-600 bg-blue-50 ring-blue-200 dark:text-blue-200 dark:bg-blue-500/[0.14] dark:ring-blue-400/30'
        : 'text-rose-600 bg-rose-50 ring-rose-200 dark:text-rose-300 dark:bg-rose-500/[0.12] dark:ring-rose-400/30';
    const heroLabel = tier === 'good' ? 'Nice work.' : tier === 'ok' ? 'Solid pass.' : 'Worth another pass.';
    return (
      <Modal open={open} onClose={handleClose} title="Quiz results" size="lg">
        {/* Hero score */}
        <div className="flex items-center gap-4 mb-5">
          <div className={`inline-flex items-center justify-center w-20 h-20 rounded-2xl text-[26px] font-bold tabular-nums ring-1 flex-shrink-0 ${heroCls}`}>
            {pct}%
          </div>
          <div className="min-w-0">
            <p className="text-[15px] font-semibold text-gray-900 dark:text-white/95">{heroLabel}</p>
            <p className="text-[12px] text-gray-500 dark:text-blue-200/65 mt-0.5">
              <span className="text-emerald-600 dark:text-emerald-300 font-semibold">{results.score ?? 0}</span> correct
              <span className="mx-1.5 text-gray-300 dark:text-blue-300/30">·</span>
              <span className="text-rose-600 dark:text-rose-300 font-semibold">{wrong}</span> wrong
              <span className="mx-1.5 text-gray-300 dark:text-blue-300/30">·</span>
              <span className="text-gray-600 dark:text-blue-100/75">{results.total ?? 0} total</span>
            </p>
          </div>
        </div>

        {/* Question-by-question breakdown */}
        <p className="text-[10px] font-bold uppercase tracking-[0.16em] text-gray-500 dark:text-blue-200/45 mb-2">Review</p>
        <div className="flex flex-col gap-2 max-h-[42vh] overflow-y-auto pr-1 -mr-1">
          {(results.details || []).map((d, i) => (
            <div
              key={i}
              className={`rounded-xl p-3 border text-[12px] transition-colors ${
                d.correct
                  ? 'bg-emerald-50 border-emerald-200 dark:bg-emerald-500/[0.06] dark:border-emerald-400/20'
                  : 'bg-rose-50 border-rose-200 dark:bg-rose-500/[0.06] dark:border-rose-400/20'
              }`}
            >
              <div className="flex items-start gap-2.5">
                <span className={`inline-flex items-center justify-center w-5 h-5 rounded-full flex-shrink-0 mt-0.5 ${
                  d.correct
                    ? 'bg-emerald-500/15 dark:bg-emerald-400/20'
                    : 'bg-rose-500/15 dark:bg-rose-400/20'
                }`}>
                  {d.correct
                    ? <CheckCircle2 size={12} className="text-emerald-600 dark:text-emerald-300" />
                    : <XCircle size={12} className="text-rose-600 dark:text-rose-300" />}
                </span>
                <div className="flex-1 min-w-0">
                  <p className="text-gray-900 dark:text-white/90 font-medium break-words leading-snug">{d.question}</p>
                  {!d.correct && (
                    <p className="text-[11px] text-gray-600 dark:text-blue-200/65 mt-1.5 break-words">
                      <span className="text-gray-500 dark:text-blue-300/55">Your answer:</span>{' '}
                      <span className="text-rose-600 dark:text-rose-300 font-medium">{d.answer || '—'}</span>
                      <span className="mx-1.5 text-gray-300 dark:text-blue-300/25">·</span>
                      <span className="text-gray-500 dark:text-blue-300/55">Correct:</span>{' '}
                      <span className="text-emerald-600 dark:text-emerald-300 font-medium">{d.correctAnswer}</span>
                    </p>
                  )}
                  {d.explanation && (
                    <p className="text-[11px] text-gray-600 dark:text-blue-100/55 mt-1.5 italic break-words leading-snug">{d.explanation}</p>
                  )}
                </div>
              </div>
            </div>
          ))}
        </div>

        <div className="flex gap-2 mt-5 pt-4 border-t border-gray-200 dark:border-blue-400/15">
          <Button onClick={reset} className="flex-1"><Sparkles size={12} /> Another Quiz</Button>
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
      <Modal open={open} onClose={handleClose} title={quiz.title || `Quiz: ${noteTitle}`} size="lg">
        <div className="flex items-center justify-between mb-3">
          <p className="text-[12px] text-blue-200/75">
            <span className="text-blue-100 font-semibold">{answered}</span>
            <span className="text-blue-200/55"> / {total} answered</span>
          </p>
          <button
            onClick={reset}
            className="text-[11px] text-blue-200/65 hover:text-blue-100 inline-flex items-center gap-1 px-2 py-1 rounded-md hover:bg-blue-500/[0.12] transition-colors"
          >
            <X size={12} /> Restart
          </button>
        </div>
        <div className="flex gap-1.5 mb-5">
          {quiz.questions?.map((_, i) => {
            const qId = quiz.questions[i]?.id || i;
            const isAnswered = answers[qId] !== undefined;
            const isCurrent = i === currentQ;
            return (
              <button
                key={i}
                onClick={() => { setCurrentQ(i); setSelectedAnswer(answers[qId] || null); }}
                aria-label={`Go to question ${i + 1}`}
                className={`h-1.5 flex-1 rounded-full transition-colors ${
                  isCurrent ? 'bg-blue-400' : isAnswered ? 'bg-blue-500/60' : 'bg-blue-500/15'
                }`}
              />
            );
          })}
        </div>
        {q && (
          <div>
            <p className="text-[11px] font-medium uppercase tracking-[0.14em] text-blue-300/70 mb-2">Question {currentQ + 1} of {total}</p>
            <MathText as="h3" className="text-[15px] font-semibold text-white/95 mb-4 leading-snug break-words">{q.question}</MathText>
            <div className="flex flex-col gap-2 mb-4">
              {(q.options || []).map((opt) => {
                const letter = opt.charAt(0);
                const isSelected = selectedAnswer === letter;
                return (
                  <button
                    key={opt}
                    onClick={() => selectAnswer(letter)}
                    className={`w-full text-left px-3 py-2.5 rounded-lg text-[13px] transition-all border flex items-start gap-2.5 ${
                      isSelected
                        ? 'border-blue-400/55 bg-blue-500/[0.16] text-blue-50 font-medium'
                        : 'border-blue-400/[0.10] bg-blue-500/[0.03] text-blue-100/80 hover:border-blue-400/30 hover:bg-blue-500/[0.10] hover:text-blue-50'
                    }`}
                  >
                    <span className={`inline-flex items-center justify-center w-5 h-5 rounded-full text-[10px] font-bold flex-shrink-0 mt-0.5 ${
                      isSelected ? 'bg-blue-400 text-blue-950' : 'bg-blue-500/15 text-blue-200/70'
                    }`}>
                      {letter}
                    </span>
                    <MathText className="flex-1 min-w-0 break-words">{opt.slice(3)}</MathText>
                  </button>
                );
              })}
            </div>
            <div className="flex items-center justify-between pt-3 border-t border-blue-400/[0.12]">
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
