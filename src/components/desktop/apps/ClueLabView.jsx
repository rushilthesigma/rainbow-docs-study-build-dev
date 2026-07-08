import { useState, useRef } from 'react';
import { ArrowLeft, BarChart3, Search, ClipboardList, ChevronDown, ChevronRight, Zap, Layers, FileText, Lightbulb, Loader2 } from 'lucide-react';
import { runClueAnalysis } from '../../../api/quizMatch';
import { createNote, updateNote, addNoteFlashcards } from '../../../api/notes';
import { setPendingLesson } from '../../../utils/pendingLesson';
import { useWindowManager } from '../../../context/WindowManagerContext';
import { InlineProgress } from '../../shared/ProgressBar';

// Clue Lab - clue analysis for quiz bowl answer lines. Search QBReader
// for every tossup on an answer line (or paste your own questions) and
// get back the phrases that keep showing up in the clues - the
// vocabulary worth studying. Analysis adapted from Quizolytics (MIT).

// QBReader's own category list (distinct from the app's play categories).
const QB_QUERY_CATEGORIES = [
  'Literature', 'History', 'Science', 'Fine Arts', 'Religion', 'Mythology',
  'Philosophy', 'Social Science', 'Current Events', 'Geography',
  'Other Academic', 'Trash',
];
const DIFFICULTY_LABELS = {
  1: 'Middle school', 2: 'Easy high school', 3: 'Regular high school',
  4: 'Hard high school', 5: 'National high school', 6: 'Easy college',
  7: 'Regular college', 8: 'Hard college', 9: 'National college', 10: 'Open',
};

function Pill({ active, onClick, title, children }) {
  return (
    <button onClick={onClick} title={title}
      className={`px-2.5 py-1.5 rounded-lg border text-[11px] font-semibold transition-colors ${
        active
          ? 'border-blue-400/50 bg-blue-500/15 text-blue-200'
          : 'border-white/[0.08] bg-white/[0.03] text-white/55 hover:bg-white/[0.06] hover:text-white/75'
      }`}>
      {children}
    </button>
  );
}

// The answer line the analyzed questions point at. QBReader searches carry
// it in the query; for pasted sets (or category-only searches) fall back to
// the most common answer, but only when it covers at least half the
// questions — otherwise the set has no single answer and it stays ''.
function primaryAnswer(questions) {
  const counts = new Map();
  let total = 0;
  for (const q of questions || []) {
    const a = (q.answer || '').split(/[[(]/)[0].trim();
    if (!a) continue;
    total++;
    const key = a.toLowerCase();
    const cur = counts.get(key);
    if (cur) cur.n++;
    else counts.set(key, { label: a, n: 1 });
  }
  let best = null;
  for (const v of counts.values()) if (!best || v.n > best.n) best = v;
  return best && best.n * 2 >= total ? best.label : '';
}

// First sentence in the question set that contains the clue phrase, so a
// flashcard front shows the clue the way tossups actually phrase it.
// Grams are lowercase space-joined tokens, so this misses phrases split by
// punctuation in the original — fine, the card just omits the context.
function contextSentence(gram, questions) {
  for (const q of questions || []) {
    const text = q.question || '';
    const idx = text.toLowerCase().indexOf(gram);
    if (idx === -1) continue;
    const start = text.lastIndexOf('.', idx) + 1;
    let end = text.indexOf('.', idx + gram.length);
    if (end === -1) end = text.length - 1;
    const s = text.slice(start, end + 1).trim();
    if (s) return s.length > 220 ? `${s.slice(0, 220)}…` : s;
  }
  return '';
}

function orderedGrams(result) {
  return [
    ...(result.quadgrams || []), ...(result.trigrams || []),
    ...(result.bigrams || []), ...(result.unigrams || []),
  ];
}

function buildClueNote(result, topic) {
  const lines = [`*Seeded from Clue Lab${topic ? `: ${topic}` : ''}*`, ''];
  const sections = [
    ['Four-word clues', result.quadgrams],
    ['Three-word clues', result.trigrams],
    ['Two-word clues', result.bigrams],
    ['Top words', result.unigrams],
  ];
  for (const [title, items] of sections) {
    if (!items?.length) continue;
    lines.push(`## ${title}`);
    for (const g of items) lines.push(`- ${g}`);
    lines.push('');
  }
  lines.push(`*From ${result.numQuestions} past tossups.*`);
  return lines.join('\n');
}

// Same look as the Notes editor's action row (NoteActions.ActionButton).
function StudyAction({ icon, label, onClick, disabled }) {
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

function NgramSection({ label, sub, items }) {
  if (!items?.length) return null;
  return (
    <div>
      <div className="flex items-center gap-1.5 mb-1.5">
        <span className="text-[11px] font-bold uppercase tracking-[0.16em] text-white/40">{label}</span>
        <span className="text-[10px] text-white/25">· {sub}</span>
      </div>
      <div className="flex flex-wrap gap-1.5">
        {items.map((t, i) => (
          <span key={i} className="px-2.5 py-1 rounded-lg border border-white/[0.08] bg-white/[0.04] text-[12px] text-white/80 select-text">
            {t}
          </span>
        ))}
      </div>
    </div>
  );
}

export default function ClueLabView({ onBack, onPractice }) {
  const { openApp } = useWindowManager();
  const [source, setSource] = useState('qbreader'); // 'qbreader' | 'paste'
  const [answerQuery, setAnswerQuery] = useState('');
  const [categories, setCategories] = useState([]);
  const [difficulties, setDifficulties] = useState([]);
  const [maxResults, setMaxResults] = useState(15);
  const [pasted, setPasted] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [result, setResult] = useState(null);
  const [showQuestions, setShowQuestions] = useState(false);
  // Study handoffs. One note per analysis, shared by "Save as note" and
  // "Make flashcards" so clicking both doesn't create duplicates.
  const [topic, setTopic] = useState('');
  const [actionBusy, setActionBusy] = useState(null); // 'note' | 'cards' | null
  const [actionErr, setActionErr] = useState('');
  const noteIdRef = useRef(null);
  const cardsAddedRef = useRef(false);

  const toggle = (list, setList, v) =>
    setList(list.includes(v) ? list.filter(x => x !== v) : [...list, v]);

  const canRun = source === 'qbreader'
    ? (answerQuery.trim() || categories.length || difficulties.length)
    : pasted.trim().length > 0;

  async function analyze() {
    if (!canRun || loading) return;
    setLoading(true);
    setError('');
    setResult(null);
    setShowQuestions(false);
    setActionErr('');
    noteIdRef.current = null;
    cardsAddedRef.current = false;
    try {
      const payload = source === 'paste'
        ? { questions: pasted.split('\n').map(l => l.trim()).filter(Boolean), maxResults }
        : { answerQuery: answerQuery.trim(), categories, difficulties, maxResults };
      const data = await runClueAnalysis(payload);
      setResult(data);
      setTopic((source === 'qbreader' && answerQuery.trim()) || primaryAnswer(data.questions));
    } catch (e) {
      setError(e.message || 'Analysis failed');
    } finally {
      setLoading(false);
    }
  }

  async function ensureNote() {
    if (noteIdRef.current) return noteIdRef.current;
    const { note } = await createNote(topic ? `Clues: ${topic}` : 'Clue Lab analysis');
    await updateNote(note.id, {
      mainNotes: buildClueNote(result, topic),
      cues: orderedGrams(result).slice(0, 8),
    });
    noteIdRef.current = note.id;
    return note.id;
  }

  async function handleSaveNote() {
    if (actionBusy) return;
    setActionBusy('note');
    setActionErr('');
    try {
      const id = await ensureNote();
      openApp('notes', 'Notes', { initialNoteId: id });
    } catch (e) {
      setActionErr(e.message || 'Could not create the note.');
    }
    setActionBusy(null);
  }

  async function handleFlashcards() {
    if (actionBusy) return;
    setActionBusy('cards');
    setActionErr('');
    try {
      const id = await ensureNote();
      if (!cardsAddedRef.current) {
        // Manual clue → answer cards: no AI, no credits. Server caps a
        // manual add at 50 cards.
        const cards = orderedGrams(result).slice(0, 50).map(g => {
          const ctx = contextSentence(g, result.questions);
          return { front: ctx ? `“${g}” — ${ctx}` : `Quiz bowl clue: “${g}”`, back: topic };
        });
        await addNoteFlashcards(id, cards);
        cardsAddedRef.current = true;
      }
      openApp('notes', 'Notes', {
        initialFlashcardsNoteId: id,
        initialFlashcardsTitle: topic ? `Clues: ${topic}` : 'Clue Lab analysis',
      });
    } catch (e) {
      setActionErr(e.message || 'Could not create the flashcards.');
    }
    setActionBusy(null);
  }

  // Hand the clue vocabulary to the Lessons app: it auto-creates and opens
  // a lesson on the pending topic (utils/pendingLesson bridge).
  function handleLesson() {
    const subject = topic || 'this quiz bowl question set';
    // The server truncates the topic at 200 chars and uses it verbatim as
    // the lesson title, so pack terms greedily instead of a fixed count —
    // a fixed slice(0, 12) blew past the cap and cut the title mid-word.
    const prefix = `Key terms behind the quiz bowl clues for ${subject}: `;
    const terms = [];
    let len = prefix.length;
    for (const g of orderedGrams(result)) {
      if (len + g.length + 2 > 190) break;
      terms.push(g);
      len += g.length + 2;
    }
    setPendingLesson({ topic: prefix + terms.join(', '), difficulty: 'beginner' });
    openApp('lessons', 'Lessons');
  }

  const hasNgrams = result && (result.unigrams?.length || result.bigrams?.length || result.trigrams?.length || result.quadgrams?.length);

  return (
    <div className="h-full overflow-y-auto bg-transparent">
      <div className="p-5 pb-8 space-y-4">
        <button onClick={onBack} className="flex items-center gap-2 text-sm text-white/35 hover:text-white/60 transition-colors">
          <ArrowLeft size={16} /> Hub
        </button>

        <div>
          <div className="flex items-center gap-2 mb-1">
            <BarChart3 size={16} className="text-blue-400/80" />
            <h2 className="text-lg font-bold text-white/90">Clue Lab</h2>
          </div>
          <p className="text-[12px] text-white/50 leading-relaxed">
            Pull every past tossup on an answer line and find the clues that repeat across
            questions. Study the phrases below and you know the question before the giveaway.
          </p>
        </div>

        {/* Source */}
        <div className="grid grid-cols-2 gap-2">
          <Pill active={source === 'qbreader'} onClick={() => setSource('qbreader')}>
            <span className="inline-flex items-center gap-1.5"><Search size={12} /> Search QBReader</span>
          </Pill>
          <Pill active={source === 'paste'} onClick={() => setSource('paste')}>
            <span className="inline-flex items-center gap-1.5"><ClipboardList size={12} /> Paste questions</span>
          </Pill>
        </div>

        {source === 'qbreader' ? (
          <>
            <div>
              <span className="block text-[11px] font-bold uppercase tracking-[0.16em] text-white/40 mb-1.5">Answer line</span>
              <input value={answerQuery} onChange={e => setAnswerQuery(e.target.value)}
                onKeyDown={e => { if (e.key === 'Enter') analyze(); }}
                placeholder="e.g. Japan, Toni Morrison, mitochondria"
                className="w-full px-3 py-2.5 rounded-lg border border-white/[0.08] bg-white/[0.04] text-[13px] text-white/80 placeholder-white/20 outline-none focus:border-blue-400/50 focus:ring-2 focus:ring-blue-400/20 transition-colors" />
            </div>

            <div>
              <span className="block text-[11px] font-bold uppercase tracking-[0.16em] text-white/40 mb-1.5">Categories</span>
              <div className="flex flex-wrap gap-1.5">
                {QB_QUERY_CATEGORIES.map(c => (
                  <Pill key={c} active={categories.includes(c)} onClick={() => toggle(categories, setCategories, c)}>{c}</Pill>
                ))}
              </div>
            </div>

            <div>
              <div className="flex items-center gap-1.5 mb-1.5">
                <span className="text-[11px] font-bold uppercase tracking-[0.16em] text-white/40">Difficulty</span>
                <span className="text-[10px] text-white/25">· 1 = middle school, 10 = open · none = all</span>
              </div>
              <div className="flex flex-wrap gap-1.5">
                {Array.from({ length: 10 }, (_, i) => i + 1).map(d => (
                  <Pill key={d} active={difficulties.includes(d)} title={DIFFICULTY_LABELS[d]}
                    onClick={() => toggle(difficulties, setDifficulties, d)}>{d}</Pill>
                ))}
              </div>
            </div>
          </>
        ) : (
          <div>
            <span className="block text-[11px] font-bold uppercase tracking-[0.16em] text-white/40 mb-1.5">Questions, one per line</span>
            <textarea value={pasted} onChange={e => setPasted(e.target.value)} rows={8}
              placeholder="Paste tossup questions here, one per line…"
              className="w-full px-3 py-2.5 rounded-lg border border-white/[0.08] bg-white/[0.04] text-[12px] text-white/80 placeholder-white/20 resize-y outline-none focus:border-blue-400/50 focus:ring-2 focus:ring-blue-400/20 transition-colors" />
          </div>
        )}

        <div>
          <div className="flex items-center justify-between mb-1.5">
            <span className="text-[11px] font-bold uppercase tracking-[0.16em] text-white/40">Results per list</span>
            <span className="text-[11px] font-mono text-white/70">{maxResults}</span>
          </div>
          <input type="range" min="5" max="30" step="5" value={maxResults}
            onChange={e => setMaxResults(Number(e.target.value))} className="w-full accent-blue-400" />
        </div>

        {error && <p className="text-[11px] text-rose-400 px-3 py-2 rounded-lg bg-rose-500/10 border border-rose-500/20 text-center">{error}</p>}

        <button onClick={analyze} disabled={!canRun || loading}
          className="w-full py-3.5 rounded-lg bg-blue-500 hover:bg-blue-400 disabled:opacity-40 text-white text-[14px] font-bold inline-flex items-center justify-center gap-2 transition-all border border-blue-400/40">
          {loading ? <><InlineProgress active /> Analyzing…</> : <><BarChart3 size={15} /> Analyze</>}
        </button>

        {result && !hasNgrams && !loading && (
          <p className="text-[12px] text-white/45 text-center py-2">
            {result.numQuestions === 0
              ? 'No questions matched that search. Try a broader answer line or fewer filters.'
              : `Analyzed ${result.numQuestions} questions but no phrases repeated often enough to report. Try a more specific answer line.`}
          </p>
        )}

        {hasNgrams ? (
          <div className="space-y-4 pt-1 border-t border-white/[0.06]">
            <p className="text-[11px] text-white/40 pt-3">
              Analyzed <span className="text-white/70 font-semibold">{result.numQuestions}</span> questions
              {result.numDuplicates > 0 && <> · removed {result.numDuplicates} near-duplicate{result.numDuplicates !== 1 ? 's' : ''}</>}
            </p>

            <NgramSection label="Four-word clues" sub="strongest signals" items={result.quadgrams} />
            <NgramSection label="Three-word clues" sub="ranked by PMI" items={result.trigrams} />
            <NgramSection label="Two-word clues" sub="ranked by PMI" items={result.bigrams} />
            <NgramSection label="Top words" sub="by frequency" items={result.unigrams} />

            {/* Study handoffs — same solid-blue recipe as the Notes editor's
                action row (NoteActions.ActionButton). Practice + flashcards
                need a single answer line to point at; a pasted set of mixed
                answers only gets the lesson + note actions. */}
            <div className="flex flex-wrap items-center gap-2">
              {topic && onPractice && (
                <StudyAction icon={<Zap size={13} />} label="Practice tossups on this" onClick={() => onPractice(topic)} />
              )}
              {topic && (
                <StudyAction
                  icon={actionBusy === 'cards' ? <Loader2 size={13} className="animate-spin" /> : <Layers size={13} />}
                  label="Make flashcards" onClick={handleFlashcards} disabled={!!actionBusy}
                />
              )}
              <StudyAction icon={<Lightbulb size={13} />} label="Make a lesson on the key terms" onClick={handleLesson} />
              <StudyAction
                icon={actionBusy === 'note' ? <Loader2 size={13} className="animate-spin" /> : <FileText size={13} />}
                label="Save as note" onClick={handleSaveNote} disabled={!!actionBusy}
              />
            </div>
            {actionErr && <p className="text-[11px] text-rose-300/80">{actionErr}</p>}

            {result.questions?.length > 0 && (
              <div>
                <button onClick={() => setShowQuestions(s => !s)}
                  className="flex items-center gap-1.5 text-[11px] font-bold uppercase tracking-[0.16em] text-white/40 hover:text-white/60 transition-colors">
                  {showQuestions ? <ChevronDown size={12} /> : <ChevronRight size={12} />}
                  Questions ({result.questions.length})
                </button>
                {showQuestions && (
                  <div className="mt-2">
                    {result.questions.map((q, i) => (
                      <div key={i} className="py-2.5 border-b border-white/[0.06]">
                        <p className="text-[12px] text-white/70 leading-relaxed">{q.question}</p>
                        <p className="text-[11px] text-white/40 mt-1">
                          {q.answer && <span className="text-blue-200/80 font-semibold">{q.answer}</span>}
                          {(q.setName || q.difficulty) && (
                            <span className="text-white/30"> · {q.setName}{q.difficulty ? ` · difficulty ${q.difficulty}` : ''}</span>
                          )}
                        </p>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}
          </div>
        ) : null}
      </div>
    </div>
  );
}
