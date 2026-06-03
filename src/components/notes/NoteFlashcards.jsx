import { useState, useEffect, useCallback } from 'react';
import { Layers, Plus, Loader2, X, ChevronDown, ChevronRight } from 'lucide-react';
import { getNoteFlashcards, generateNoteFlashcards, reviewNoteCard, deleteNoteCard } from '../../api/notes';
import { sm2Update } from '../../utils/sm2';

// Anki-style grading → SM-2 quality (mirrors NoteMapReview): Again resets,
// Hard/Good/Easy pass with growing intervals.
const GRADES = [
  { q: 1, label: 'Again', cls: 'bg-rose-500/12 border-rose-400/30 text-rose-200 hover:bg-rose-500/20' },
  { q: 3, label: 'Hard', cls: 'bg-amber-500/12 border-amber-400/30 text-amber-200 hover:bg-amber-500/20' },
  { q: 4, label: 'Good', cls: 'bg-emerald-500/12 border-emerald-400/30 text-emerald-200 hover:bg-emerald-500/20' },
  { q: 5, label: 'Easy', cls: 'bg-sky-500/12 border-sky-400/30 text-sky-200 hover:bg-sky-500/20' },
];

function fmtInterval(days) {
  if (!days || days < 1) return 'today';
  if (days < 30) return `${days}d`;
  if (days < 365) return `${Math.round(days / 30)}mo`;
  return `${(days / 365).toFixed(1)}y`;
}

// Collapsible flashcards section for a single note. Generates SM-2 cards from
// the note's content and runs an inline review without leaving the editor.
export default function NoteFlashcards({ noteId }) {
  const [open, setOpen] = useState(false);
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
    getNoteFlashcards(noteId)
      .then(d => { setCards(d.cards || []); setDue(d.due || 0); })
      .catch(() => {});
  }, [noteId]);

  useEffect(() => { load(); }, [load]);

  async function handleGenerate() {
    if (gen) return;
    setGen(true);
    setGenError(null);
    try {
      const d = await generateNoteFlashcards(noteId, {});
      setCards(d.flashcards || []);
      setOpen(true);
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
    setQueue(q); setIdx(0); setFlipped(false); setMode('session'); setOpen(true);
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

  async function handleDelete(cardId) {
    try { await deleteNoteCard(noteId, cardId); setCards(cs => cs.filter(c => c.id !== cardId)); load(); } catch {}
  }

  return (
    <div className="mt-3 flex-shrink-0 rounded-2xl border border-white/[0.06] bg-white/[0.02]">
      <div className="flex items-center gap-2 px-3 py-2.5">
        <button onClick={() => setOpen(o => !o)} className="flex items-center gap-1.5 text-white/70 hover:text-white transition-colors">
          {open ? <ChevronDown size={13} /> : <ChevronRight size={13} />}
          <Layers size={13} className="text-white/40" />
          <span className="text-[12px] font-semibold">Flashcards</span>
        </button>
        <span className="text-[11px] text-white/35">
          {cards.length}{due > 0 && <span className="text-blue-300"> · {due} due</span>}
        </span>
        <div className="flex-1" />
        {cards.length > 0 && (
          <button onClick={startReview} className="text-[11px] px-2.5 py-1 rounded-lg bg-blue-500/15 hover:bg-blue-500/25 text-blue-200 transition-colors">
            Review
          </button>
        )}
        <button
          onClick={handleGenerate}
          disabled={gen}
          className="text-[11px] px-2.5 py-1 rounded-lg text-white/65 hover:text-white hover:bg-white/[0.06] flex items-center gap-1 disabled:opacity-50 transition-colors"
        >
          {gen ? <><Loader2 size={11} className="animate-spin" /> Making…</> : <><Plus size={11} /> {cards.length ? 'More' : 'Make flashcards'}</>}
        </button>
      </div>

      {genError && <p className="px-3 pb-2.5 text-[11px] text-rose-300/90">{genError}</p>}

      {open && mode === 'list' && (
        <div className="px-3 pb-3 pt-2 max-h-56 overflow-y-auto border-t border-white/[0.06] animate-view-fade">
          {cards.length === 0 ? (
            <p className="text-[11px] text-white/30 italic">No flashcards yet. Click “Make flashcards” to generate them from this note.</p>
          ) : (
            <div className="divide-y divide-white/[0.05]">
              {cards.map(c => (
                <div key={c.id} className="py-2 flex items-start gap-2 group">
                  <div className="flex-1 min-w-0">
                    <p className="text-[12px] text-white/85">{c.front}</p>
                    <p className="text-[11px] text-white/45 mt-0.5">{c.back}</p>
                  </div>
                  <button onClick={() => handleDelete(c.id)} className="text-white/20 hover:text-rose-400 opacity-0 group-hover:opacity-100 transition-all flex-shrink-0 mt-0.5" title="Delete card">
                    <X size={12} />
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {open && mode === 'session' && current && (
        <div className="px-3 pb-3 pt-2 border-t border-white/[0.06] animate-view-fade">
          <div className="flex items-center justify-between text-[11px] text-white/45 mb-2">
            <span>{idx + 1} / {queue.length}</span>
            <button onClick={() => { setMode('list'); load(); }} className="hover:text-white/80 flex items-center gap-1"><X size={11} /> Exit</button>
          </div>
          <div
            onClick={() => setFlipped(f => !f)}
            className={`cursor-pointer rounded-xl border p-5 min-h-[120px] flex items-center justify-center text-center transition-colors ${flipped ? 'bg-blue-500/[0.08] border-blue-400/20' : 'bg-white/[0.04] border-white/[0.08]'}`}
          >
            <p className="text-[14px] text-white/90">{flipped ? current.back : current.front}</p>
          </div>
          {!flipped ? (
            <p className="text-center text-[10px] text-white/35 mt-2">Click to reveal</p>
          ) : (
            <div className="grid grid-cols-4 gap-1.5 mt-2">
              {GRADES.map(g => (
                <button
                  key={g.q}
                  onClick={() => handleGrade(g.q)}
                  disabled={grading}
                  className={`flex flex-col items-center gap-0.5 px-1 py-2 rounded-lg border text-[12px] font-semibold disabled:opacity-50 transition-colors ${g.cls}`}
                >
                  <span>{g.label}</span>
                  <span className="text-[9px] font-normal opacity-70">{fmtInterval(sm2Update(current, g.q).interval)}</span>
                </button>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
