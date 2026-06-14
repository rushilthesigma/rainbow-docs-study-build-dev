import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { MessageSquare, ClipboardCheck, BookOpen, Sparkles, X, CheckCircle2, XCircle, ArrowRight, ArrowLeft, Wand2 } from 'lucide-react';
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
// Works in both shells - when the WindowManagerContext is present we
// launch desktop windows with seeded meta; otherwise we navigate via
// react-router (mobile + classic routes).
//
// `onNoteUpdated(patch)` is fired after a successful AI edit so the
// parent editor can refresh its local state without a re-fetch.
// When the host wants the quiz to live in a real split beside the editor it
// passes `onMakeQuiz` and renders <QuizFromNotePanel> itself (desktop Notes).
// Without it we fall back to a centered modal (classic / mobile route).
export default function NoteActions({ note, onNoteUpdated, onMakeQuiz }) {
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
          onClick={() => (onMakeQuiz ? onMakeQuiz() : setQuizOpen(true))}
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
      {!onMakeQuiz && quizOpen && (
        <QuizFromNote note={note} onClose={() => setQuizOpen(false)} />
      )}
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
// pass through untouched - those have their own dedicated regenerate
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
      const system = `You revise an existing study note based on the student's instruction. Output ONLY valid JSON, no markdown fences, no prose. Shape: {"title": "...", "mainNotes": "..."}. Keep the note's overall topic but apply the requested change. Write mainNotes as plain text only - no markdown, no asterisks, no hashes, no bullet dashes. Use line breaks and indentation for structure. The note should remain organized, dense, and useful for studying.`;
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
      const d = await updateNote(note.id, patch);
      // Carry the server's updatedAt into the host's note state — hosts that
      // autosave with baseUpdatedAt would otherwise 409 on the next save.
      onApplied?.(d?.note?.updatedAt ? { ...patch, updatedAt: d.note.updatedAt } : patch);
      // Hint not used here, but keep Cornell intact - server merges by
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
      className="inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-[12px] font-medium bg-blue-500 hover:bg-blue-400 text-white disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
    >
      <span className="opacity-80">{icon}</span>
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

// Convenience wrapper for the desktop Notes split host: renders the quiz as
// a real panel docked beside the editor (so the note reflows to make room),
// not as an overlay floating on top of it.
export function QuizFromNotePanel(props) {
  return <QuizFromNote {...props} asPanel />;
}

// Self-contained quiz player grounded in the current note. Lives here instead
// of routing to AssessmentsPage so the quiz stays anchored to the note being
// read. `asPanel` renders it as an in-flow split column (desktop); otherwise
// it falls back to a centered modal (classic / mobile route). Colors use the
// neutral white/gray palette - emerald for correct, rose for wrong - not a
// blue re-skin.
function QuizFromNote({ note, onClose, asPanel = false }) {
  const noteTitle = (note?.title || '').trim() || 'Untitled note';
  const noteText = buildNoteText(note);
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

  // One shell wraps every phase. On desktop it's a real split column docked
  // beside the editor (Back chevron in the header, note reflowed to the left);
  // on the classic route it falls back to a centered modal. We build the phase
  // header + body here, then hand them to whichever shell is in play.
  let headerTitle;
  let body;

  if (!quiz && !generating) {
    // Setup phase - difficulty / question count
    headerTitle = `Quiz on "${noteTitle}"`;
    body = (
      <form onSubmit={handleGenerate} className="flex flex-col gap-4">
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
          <div className="text-[12px] text-rose-700 bg-rose-50 border border-rose-200 rounded-lg px-3 py-2 dark:text-rose-300 dark:bg-rose-900/20 dark:border-rose-700/30">{error}</div>
        )}
        <Button type="submit" className="w-full">
          <Sparkles size={14} /> Generate Quiz
        </Button>
      </form>
    );
  } else if (generating) {
    // Generating phase
    headerTitle = 'Building your quiz';
    body = (
      <div className="py-8 text-center">
        <LoadingSpinner size={20} />
        <p className="text-[12px] text-white/65 mt-3">Reading your note and writing questions…</p>
      </div>
    );
  } else if (results) {
    // Results phase
    headerTitle = 'Quiz results';
    const pct = results.percentage ?? 0;
    const wrong = (results.total ?? 0) - (results.score ?? 0);
    const tier = pct >= 80 ? 'good' : pct >= 60 ? 'ok' : 'bad';
    const heroCls = tier === 'good'
      ? 'text-emerald-600 bg-emerald-50 ring-emerald-200 dark:text-emerald-300 dark:bg-emerald-500/[0.12] dark:ring-emerald-400/30'
      : tier === 'ok'
        ? 'text-gray-700 bg-gray-100 ring-gray-200 dark:text-white/80 dark:bg-white/[0.08] dark:ring-white/[0.18]'
        : 'text-rose-600 bg-rose-50 ring-rose-200 dark:text-rose-300 dark:bg-rose-500/[0.12] dark:ring-rose-400/30';
    const heroLabel = tier === 'good' ? 'Nice work.' : tier === 'ok' ? 'Solid pass.' : 'Worth another pass.';
    body = (
      <>
        {/* Hero score */}
        <div className="flex items-center gap-4 mb-5">
          <div className={`inline-flex items-center justify-center w-20 h-20 rounded-2xl text-[26px] font-bold tabular-nums ring-1 flex-shrink-0 ${heroCls}`}>
            {pct}%
          </div>
          <div className="min-w-0">
            <p className="text-[15px] font-semibold text-gray-900 dark:text-white/95">{heroLabel}</p>
            <p className="text-[12px] text-gray-500 dark:text-white/50 mt-0.5">
              <span className="text-emerald-600 dark:text-emerald-300 font-semibold">{results.score ?? 0}</span> correct
              <span className="mx-1.5 text-gray-300 dark:text-white/25">·</span>
              <span className="text-rose-600 dark:text-rose-300 font-semibold">{wrong}</span> wrong
              <span className="mx-1.5 text-gray-300 dark:text-white/25">·</span>
              <span className="text-gray-600 dark:text-white/70">{results.total ?? 0} total</span>
            </p>
          </div>
        </div>

        {/* Question-by-question breakdown */}
        <p className="text-[10px] font-bold uppercase tracking-[0.16em] text-gray-500 dark:text-white/40 mb-2">Review</p>
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
                    <p className="text-[11px] text-gray-600 dark:text-white/55 mt-1.5 break-words">
                      <span className="text-gray-500 dark:text-white/45">Your answer:</span>{' '}
                      <span className="text-rose-600 dark:text-rose-300 font-medium">{d.answer || '-'}</span>
                      <span className="mx-1.5 text-gray-300 dark:text-white/25">·</span>
                      <span className="text-gray-500 dark:text-white/45">Correct:</span>{' '}
                      <span className="text-emerald-600 dark:text-emerald-300 font-medium">{d.correctAnswer}</span>
                    </p>
                  )}
                  {d.explanation && (
                    <p className="text-[11px] text-gray-600 dark:text-white/50 mt-1.5 italic break-words leading-snug">{d.explanation}</p>
                  )}
                </div>
              </div>
            </div>
          ))}
        </div>

        <div className="flex gap-2 mt-5 pt-4 border-t border-gray-200 dark:border-white/[0.08]">
          <Button onClick={reset} className="flex-1"><Sparkles size={12} /> Another Quiz</Button>
          <Button variant="secondary" onClick={handleClose} className="flex-1">Done</Button>
        </div>
      </>
    );
  } else {
    // Active quiz phase
    const q = quiz.questions?.[currentQ];
    const total = quiz.questions?.length || 0;
    const answered = Object.keys(answers).length;
    headerTitle = quiz.title || `Quiz: ${noteTitle}`;
    body = (
      <>
        <div className="flex items-center justify-between mb-3">
          <p className="text-[12px] text-white/65">
            <span className="text-white/90 font-semibold">{answered}</span>
            <span className="text-white/45"> / {total} answered</span>
          </p>
          <button
            onClick={reset}
            className="text-[11px] text-white/50 hover:text-white/85 inline-flex items-center gap-1 px-2 py-1 rounded-md hover:bg-white/[0.06] transition-colors"
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
                  isCurrent ? 'bg-blue-500' : isAnswered ? 'bg-blue-500/45' : 'bg-white/[0.10]'
                }`}
              />
            );
          })}
        </div>
        {q && (
          <div>
            <p className="text-[11px] font-medium uppercase tracking-[0.14em] text-white/50 mb-2">Question {currentQ + 1} of {total}</p>
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
                        ? 'border-blue-400/60 bg-blue-500/[0.12] text-white font-medium'
                        : 'border-white/[0.08] bg-white/[0.02] text-white/75 hover:border-blue-400/30 hover:bg-blue-500/[0.06] hover:text-white/90'
                    }`}
                  >
                    <span className={`inline-flex items-center justify-center w-5 h-5 rounded-full text-[10px] font-bold flex-shrink-0 mt-0.5 ${
                      isSelected ? 'bg-blue-500 text-white' : 'bg-white/[0.10] text-white/55'
                    }`}>
                      {letter}
                    </span>
                    <MathText className="flex-1 min-w-0 break-words">{opt.slice(3)}</MathText>
                  </button>
                );
              })}
            </div>
            <div className="flex items-center justify-between pt-3 border-t border-white/[0.08]">
              <Button variant="ghost" size="sm" onClick={prevQuestion} disabled={currentQ === 0}>Previous</Button>
              {currentQ < total - 1 ? (
                <Button variant="ghost" size="sm" onClick={nextQuestion}>Next <ArrowRight size={12} /></Button>
              ) : (
                <Button size="sm" onClick={handleSubmit} loading={grading} disabled={answered < total}>Submit</Button>
              )}
            </div>
          </div>
        )}
      </>
    );
  }

  // Classic / mobile route: no split host, so render a centered modal.
  if (!asPanel) {
    const size = (results || (quiz && !generating)) ? 'lg' : 'md';
    return (
      <Modal open onClose={handleClose} title={headerTitle} size={size}>
        {body}
      </Modal>
    );
  }

  // Desktop: a real split panel docked beside the note editor. The editor
  // column reflows to the left to make room - this is not an overlay.
  return (
    <div className="flex flex-col h-full min-h-0 bg-[#141414] border border-white/[0.08] rounded-lg overflow-hidden">
      <div className="flex items-center gap-3 px-4 pt-3.5 pb-3 flex-shrink-0 border-b border-white/[0.07]">
        <button
          type="button"
          onClick={handleClose}
          aria-label="Back"
          className="flex items-center gap-1.5 text-white/40 hover:text-white/80 transition-colors text-sm"
        >
          <ArrowLeft size={14} /> Back
        </button>
        <h3 className="text-[14px] font-semibold text-white/90 flex-1 truncate">{headerTitle}</h3>
      </div>
      <div className="flex-1 overflow-y-auto px-4 py-4">
        {body}
      </div>
    </div>
  );
}
