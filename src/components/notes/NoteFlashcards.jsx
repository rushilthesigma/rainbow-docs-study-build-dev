import { useState, useEffect, useCallback } from 'react';
import { ArrowLeft, Layers, Plus, Loader2, X, Trash2, RotateCcw } from 'lucide-react';
import { getNoteFlashcards, generateNoteFlashcards, reviewNoteCard, deleteNoteCard } from '../../api/notes';
import Button from '../shared/Button';
import LoadingSpinner from '../shared/LoadingSpinner';

// Anki-style grading → SM-2 quality (mirrors NoteMapReview): Again resets,
// Hard/Good/Easy pass with growing intervals.
const GRADES = [
  { q: 1, label: 'Again', key: '1', cls: 'bg-rose-500/12 border-rose-400/30 text-rose-200 hover:bg-rose-500/20' },
  { q: 3, label: 'Hard', key: '2', cls: 'bg-amber-500/12 border-amber-400/30 text-amber-200 hover:bg-amber-500/20' },
  { q: 4, label: 'Good', key: '3', cls: 'bg-emerald-500/12 border-emerald-400/30 text-emerald-200 hover:bg-emerald-500/20' },
  { q: 5, label: 'Easy', key: '4', cls: 'bg-white/[0.06] border-white/20 text-white/80 hover:bg-white/[0.12]' },
];

// Full-window flashcards view for a single note. Launched from the note
// editor but rendered as its own view in the Notes app (like the note map),
// not embedded in the editor GUI. Generates SM-2 cards from the note and runs
// the review session here.
export default function NoteFlashcards({ noteId, noteTitle, onBack }) {
  const [loading, setLoading] = useState(true);
  const [cards, setCards] = useState([]);
  const [due, setDue] = useState(0);
  const [gen, setGen] = useState(false);
  const [genError, setGenError] = useState(null);

  const [mode, setMode] = useState('list'); // 'list' | 'session'
  const [queue, setQueue] = useState([]);
  const [idx, setIdx] = useState(0);
  const [flipped, setFlipped] = useState(false);
  const [grading, setGrading] = useState(false);

  const load = useCallback(() => {
    return getNoteFlashcards(noteId)
      .then(d => { setCards(d.cards || []); setDue(d.due || 0); })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [noteId]);

  useEffect(() => { load(); }, [load]);

  async function handleGenerate() {
    if (gen) return;
    setGen(true);
    setGenError(null);
    try {
      const d = await generateNoteFlashcards(noteId, {});
      setCards(d.flashcards || []);
      load();
    } catch (e) {
      setGenError(e?.message || 'Could not generate flashcards.');
    }
    setGen(false);
  }

  function startReview() {
    const now = Date.now();
    const dueCards = cards.filter(c => !c.nextDue || new Date(c.nextDue).getTime() <= now);
    const q = dueCards.length ? dueCards : cards;
    if (!q.length) return;
    setQueue(q); setIdx(0); setFlipped(false); setMode('session');
  }

  const current = queue[idx];

  const handleGrade = useCallback(async (quality) => {
    if (!current || grading) return;
    setGrading(true);
    try { await reviewNoteCard(noteId, current.id, quality); } catch { /* still advance */ }
    setGrading(false);
    setFlipped(false);
    if (idx < queue.length - 1) setIdx(i => i + 1);
    else { setMode('list'); load(); }
  }, [current, grading, noteId, idx, queue.length, load]);

  // Keyboard: Space/Enter flips, 1-4 grade once flipped.
  useEffect(() => {
    if (mode !== 'session') return;
    function onKey(e) {
      if (e.key === ' ' || e.key === 'Enter') { e.preventDefault(); setFlipped(f => !f); return; }
      if (!flipped) return;
      const g = GRADES.find(x => x.key === e.key);
      if (g) { e.preventDefault(); handleGrade(g.q); }
    }
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [mode, flipped, handleGrade]);

  async function handleDelete(cardId) {
    try { await deleteNoteCard(noteId, cardId); setCards(cs => cs.filter(c => c.id !== cardId)); load(); } catch {}
  }

  return (
    <div className="flex flex-col flex-1 min-h-0">
      {/* Header */}
      <div className="flex items-center justify-between mb-3 flex-shrink-0 gap-2">
        <button onClick={onBack} className="flex items-center gap-2 text-sm text-white/35 hover:text-white/60 transition-colors">
          <ArrowLeft size={16} /> Note
        </button>
        {mode === 'list' && (
          <div className="flex items-center gap-2">
            {cards.length > 0 && (
              <Button size="sm" onClick={startReview}><RotateCcw size={14} /> Review{due > 0 ? ` (${due})` : ''}</Button>
            )}
            <Button size="sm" variant="secondary" onClick={handleGenerate} disabled={gen}>
              {gen ? <><Loader2 size={14} className="animate-spin" /> Making…</> : <><Plus size={14} /> {cards.length ? 'More' : 'Generate'}</>}
            </Button>
          </div>
        )}
      </div>

      <div className="flex items-center gap-2 mb-3 flex-shrink-0 min-w-0">
        <Layers size={15} className="text-white/40 flex-shrink-0" />
        <h2 className="text-[17px] font-bold text-white/90 truncate">{noteTitle || 'Flashcards'}</h2>
        <span className="text-[12px] text-white/40 flex-shrink-0">
          {cards.length} card{cards.length !== 1 ? 's' : ''}{due > 0 && ` · ${due} due`}
        </span>
      </div>

      {genError && (
        <p className="mb-3 flex-shrink-0 text-[12px] text-rose-300/90 bg-rose-500/[0.08] border border-rose-400/[0.20] rounded-lg px-3 py-2">{genError}</p>
      )}

      {loading ? (
        <div className="flex items-center justify-center flex-1"><LoadingSpinner size={26} /></div>
      ) : mode === 'session' && current ? (
        <div className="flex flex-col flex-1 min-h-0">
          <div className="flex items-center justify-between text-[12px] text-white/45 mb-2 flex-shrink-0">
            <span>{idx + 1} / {queue.length}</span>
            <button onClick={() => { setMode('list'); load(); }} className="hover:text-white/80 flex items-center gap-1"><X size={12} /> Exit</button>
          </div>
          <div className="w-full h-1.5 bg-white/[0.06] rounded-full overflow-hidden mb-4 flex-shrink-0">
            <div className="h-full bg-white/70 rounded-full transition-all duration-300" style={{ width: `${((idx + (flipped ? 0.5 : 0)) / queue.length) * 100}%` }} />
          </div>
          <div className="flex-1 min-h-0 flex items-center justify-center">
            <div onClick={() => setFlipped(f => !f)} className="cursor-pointer w-full max-w-xl" style={{ perspective: '1000px' }}>
              <div className="relative w-full h-[260px] transition-transform duration-500 ease-in-out" style={{ transformStyle: 'preserve-3d', transform: flipped ? 'rotateY(180deg)' : 'rotateY(0deg)' }}>
                <div className="absolute inset-0 bg-white/[0.04] rounded-2xl border border-white/[0.10] p-8 flex flex-col items-center justify-center text-center overflow-auto" style={{ backfaceVisibility: 'hidden' }}>
                  {current.origin === 'quiz-variant' && (
                    <span className="mb-2 text-[10px] px-2 py-0.5 rounded-full bg-amber-500/15 text-amber-200 border border-amber-400/25">from a question you missed</span>
                  )}
                  <p className="text-[18px] font-medium text-white/90">{current.front}</p>
                </div>
                <div className="absolute inset-0 bg-white/[0.07] rounded-2xl border border-white/[0.12] p-8 flex items-center justify-center text-center overflow-auto" style={{ backfaceVisibility: 'hidden', transform: 'rotateY(180deg)' }}>
                  <p className="text-[17px] text-white/85">{current.back}</p>
                </div>
              </div>
            </div>
          </div>
          <div className="flex-shrink-0 mt-4 max-w-xl mx-auto w-full">
            {!flipped ? (
              <p className="text-center text-[11px] text-white/35">Click or press Space to reveal</p>
            ) : (
              <div className="grid grid-cols-4 gap-2">
                {GRADES.map(g => (
                  <button key={g.q} onClick={() => handleGrade(g.q)} disabled={grading} className={`flex items-center justify-center px-2 py-3 rounded-xl border text-[13px] font-semibold disabled:opacity-50 transition-colors ${g.cls}`}>
                    {g.label}
                  </button>
                ))}
              </div>
            )}
          </div>
        </div>
      ) : cards.length === 0 ? (
        <div className="flex-1 flex flex-col items-center justify-center text-center text-white/35">
          <Layers size={30} className="text-white/20 mb-3" />
          <p className="text-[13px] mb-1">No flashcards yet</p>
          <p className="text-[11px] mb-4">Generate a set from this note, then review them with spaced repetition.</p>
          <Button size="sm" onClick={handleGenerate} disabled={gen}>
            {gen ? <><Loader2 size={14} className="animate-spin" /> Making…</> : <><Plus size={14} /> Generate flashcards</>}
          </Button>
        </div>
      ) : (
        <div className="flex-1 min-h-0 overflow-y-auto -mr-1 pr-1 space-y-2">
          {cards.map(c => (
            <div key={c.id} className="group bg-white/[0.03] rounded-2xl border border-white/[0.06] px-4 py-3 flex items-start gap-3">
              <div className="flex-1 min-w-0">
                <p className="text-[13px] text-white/90">{c.front}</p>
                <div className="w-full h-px bg-white/[0.06] my-2" />
                <p className="text-[12px] text-white/55">{c.back}</p>
              </div>
              <button onClick={() => handleDelete(c.id)} className="text-white/20 hover:text-rose-400 opacity-0 group-hover:opacity-100 transition-all flex-shrink-0 mt-0.5" title="Delete card">
                <Trash2 size={13} />
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
