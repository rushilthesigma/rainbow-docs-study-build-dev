import { useState, useEffect, useCallback, useRef, useMemo } from 'react';
import { Check, ArrowLeft, Loader2, X, Plus } from 'lucide-react';
import Button from '../shared/Button';
import LoadingSpinner from '../shared/LoadingSpinner';
import { getMapSrs, generateNodeFlashcards, reviewMapCard } from '../../api/notes';

// Anki-style grading → SM-2 quality. Again resets the card (<3); Hard/Good/Easy
// are passing grades that push the interval out by growing amounts.
const GRADES = [
  { q: 1, label: 'Again', hint: 'forgot', cls: 'bg-rose-500/12 border-rose-400/30 text-rose-200 hover:bg-rose-500/20', key: '1' },
  { q: 3, label: 'Hard', hint: 'barely', cls: 'bg-amber-500/12 border-amber-400/30 text-amber-200 hover:bg-amber-500/20', key: '2' },
  { q: 4, label: 'Good', hint: 'got it', cls: 'bg-emerald-500/12 border-emerald-400/30 text-emerald-200 hover:bg-emerald-500/20', key: '3' },
  { q: 5, label: 'Easy', hint: 'instant', cls: 'bg-white/[0.06] border-white/20 text-white/80 hover:bg-white/[0.12]', key: '4' },
];

// Spaced-repetition review for one note map. Overview shows what to do next
// (review due cards, quiz a new concept, drill weak spots); the session runs
// the SM-2 flip-card loop with 4-button grading.
//
// Persistence is injectable via `api` so the same UI drives a personal map
// (default, keyed by mapId) or a group's shared map (the group endpoints).
// Pass either `mapId` (personal) or `api` ({ getSrs, generateNodeCards,
// reviewCard }); api wins when both are given.
export default function NoteMapReview({ open, onClose, mapId, api: apiProp, onChange }) {
  const api = useMemo(() => apiProp || {
    getSrs: () => getMapSrs(mapId),
    generateNodeCards: (nodeId) => generateNodeFlashcards(mapId, nodeId, {}),
    reviewCard: (cardId, quality) => reviewMapCard(mapId, cardId, quality),
  }, [apiProp, mapId]);

  const [loading, setLoading] = useState(true);
  const [srs, setSrs] = useState(null);
  const [view, setView] = useState('overview'); // 'overview' | 'session' | 'done'
  const [genId, setGenId] = useState(null);      // node id currently generating
  const [genError, setGenError] = useState(null);

  // Session state.
  const [queue, setQueue] = useState([]);
  const [idx, setIdx] = useState(0);
  const [flipped, setFlipped] = useState(false);
  const [grading, setGrading] = useState(false);
  const [reviewed, setReviewed] = useState(0);
  const [sessionLabel, setSessionLabel] = useState('Review');

  const refresh = useCallback(async () => {
    try {
      const data = await api.getSrs();
      setSrs(data);
    } catch { /* keep prior state */ }
  }, [api]);

  useEffect(() => {
    if (!open) return;
    setView('overview');
    setLoading(true);
    setGenError(null);
    api.getSrs()
      .then(d => setSrs(d))
      .catch(() => setSrs(null))
      .finally(() => setLoading(false));
  }, [open, api]);

  // Esc closes the panel (it's non-modal, so this is the only dismissal key).
  useEffect(() => {
    if (!open) return;
    function onEsc(e) { if (e.key === 'Escape') { e.stopPropagation(); onClose?.(); } }
    window.addEventListener('keydown', onEsc);
    return () => window.removeEventListener('keydown', onEsc);
  }, [open, onClose]);

  const currentCard = queue[idx];

  function startSession(cards, label) {
    if (!cards || cards.length === 0) return;
    setQueue(cards);
    setIdx(0);
    setFlipped(false);
    setReviewed(0);
    setSessionLabel(label);
    setView('session');
  }

  const handleGrade = useCallback(async (q) => {
    if (!currentCard || grading) return;
    setGrading(true);
    try {
      await api.reviewCard(currentCard.id, q);
    } catch { /* still advance - schedule is best-effort */ }
    setGrading(false);
    setReviewed(n => n + 1);
    setFlipped(false);
    if (idx < queue.length - 1) {
      setIdx(i => i + 1);
    } else {
      setView('done');
      refresh();
      onChange?.();
    }
  }, [currentCard, grading, api, idx, queue.length, refresh, onChange]);

  // Keyboard: Space/Enter flips, 1-4 grade once flipped.
  useEffect(() => {
    if (view !== 'session') return;
    function onKey(e) {
      if (e.key === ' ' || e.key === 'Enter') { e.preventDefault(); setFlipped(f => !f); return; }
      if (!flipped) return;
      const g = GRADES.find(x => x.key === e.key);
      if (g) { e.preventDefault(); handleGrade(g.q); }
    }
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [view, flipped, handleGrade]);

  async function handleGenerate(nodeId) {
    if (genId) return;
    setGenId(nodeId);
    setGenError(null);
    try {
      await api.generateNodeCards(nodeId);
      await refresh();
      onChange?.();
    } catch (e) {
      setGenError(e?.message || 'Could not generate flashcards.');
    }
    setGenId(null);
  }

  const summary = srs?.summary || { totalCards: 0, due: 0, struggling: 0, newNodes: 0 };

  if (!open) return null;

  // In-app floating panel (not a screen-dimming modal): anchored top-right of
  // the note map, leaves the rest of the app visible and interactive.
  return (
    <div className="absolute z-30 top-2 right-2 w-[340px] max-h-[calc(100%-1rem)] overflow-y-auto rounded-2xl border border-white/[0.12] bg-white/95 dark:bg-[#0f0f0f]/95 backdrop-blur-xl shadow-[0_10px_40px_rgba(0,0,0,0.45)] animate-view-fade">
      <div className="sticky top-0 z-10 flex items-center justify-between px-4 pt-3.5 pb-2.5 bg-white/95 dark:bg-[#0f0f0f]/95 backdrop-blur-xl border-b border-white/[0.06]">
        <h3 className="text-[14px] font-bold text-white/90">Spaced Repetition</h3>
        <button
          onClick={onClose}
          aria-label="Close"
          className="p-1.5 -mr-1 rounded-lg text-white/30 hover:text-white/70 hover:bg-white/[0.07] transition-colors"
        ><X size={15} /></button>
      </div>
      <div className="px-4 py-3">
        {loading ? (
          <div className="flex items-center justify-center py-12"><LoadingSpinner size={24} /></div>
        ) : view === 'overview' ? (
          <OverviewView
            srs={srs}
            summary={summary}
            genId={genId}
            genError={genError}
            onStartReview={() => startSession(srs?.due || [], 'Review')}
            onDrill={() => startSession(srs?.struggling || [], 'Weak spots')}
            onGenerate={handleGenerate}
          />
        ) : view === 'session' && currentCard ? (
          <SessionView
            card={currentCard}
            idx={idx}
            total={queue.length}
            flipped={flipped}
            grading={grading}
            label={sessionLabel}
            onFlip={() => setFlipped(f => !f)}
            onGrade={handleGrade}
            onExit={() => { setView('overview'); refresh(); }}
          />
        ) : (
          <DoneView
            reviewed={reviewed}
            remaining={summary.due}
            onBack={() => setView('overview')}
            onClose={onClose}
          />
        )}
      </div>
    </div>
  );
}

const LABEL = 'text-[11px] font-semibold uppercase tracking-[0.14em] text-white/35';

function Stat({ value, label }) {
  return (
    <div>
      <div className="text-[19px] font-semibold leading-none text-white/90 tabular-nums">{value}</div>
      <div className="text-[11px] text-white/40 mt-1.5">{label}</div>
    </div>
  );
}

function OverviewView({ srs, summary, genId, genError, onStartReview, onDrill, onGenerate }) {
  const newNodes = srs?.newNodes || [];
  const struggling = srs?.struggling || [];

  return (
    <div className="flex flex-col">
      {/* Stats - plain figures on the modal glass, hairline divider below */}
      <div className="flex items-center gap-8 pb-4 border-b border-white/[0.07]">
        <Stat value={summary.due} label="due now" />
        <Stat value={summary.totalCards} label="cards" />
        <Stat value={summary.newNodes} label="new concepts" />
      </div>

      {/* Review now */}
      <div className="flex items-center justify-between gap-3 py-4 border-b border-white/[0.07]">
        <div className="min-w-0">
          <p className="text-[13px] font-semibold text-white/85">Review due cards</p>
          <p className="text-[11px] text-white/45 mt-0.5">
            {summary.due > 0
              ? `${summary.due} card${summary.due !== 1 ? 's' : ''} scheduled for today.`
              : 'Nothing due right now, you’re caught up.'}
          </p>
        </div>
        <Button size="sm" onClick={onStartReview} disabled={summary.due === 0}>Start</Button>
      </div>

      {/* New concepts to quiz */}
      <div className="py-4 border-b border-white/[0.07]">
        <p className={`${LABEL} mb-2`}>New concepts to quiz</p>
        {genError && <p className="text-[11px] text-rose-300/90 mb-2">{genError}</p>}
        {newNodes.length === 0 ? (
          <p className="text-[11px] text-white/35">Every concept on this map already has flashcards.</p>
        ) : (
          <div className="divide-y divide-white/[0.05]">
            {newNodes.map(n => (
              <div key={n.id} className="flex items-center gap-2.5 py-1.5">
                <span className="w-2 h-2 rounded-full flex-shrink-0" style={{ background: n.color || '#9ca3af' }} />
                <span className="flex-1 min-w-0 text-[12px] text-white/80 truncate">{n.label}</span>
                {n.degree > 0 && <span className="text-[10px] text-white/30">{n.degree} link{n.degree !== 1 ? 's' : ''}</span>}
                <button
                  onClick={() => onGenerate(n.id)}
                  disabled={!!genId}
                  className="text-[11px] px-2.5 py-1 rounded-lg text-white/65 hover:text-white hover:bg-white/[0.06] flex items-center gap-1 disabled:opacity-50 flex-shrink-0"
                >
                  {genId === n.id ? <><Loader2 size={11} className="animate-spin" /> Making…</> : <><Plus size={11} /> Make cards</>}
                </button>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Weak spots */}
      {struggling.length > 0 && (
        <div className="pt-4">
          <p className={`${LABEL} mb-2`}>Needs extra practice</p>
          <div className="mb-3">
            {struggling.slice(0, 4).map(c => (
              <div key={c.id} className="flex items-center gap-2 text-[11px] text-white/55 py-0.5">
                <span className="text-white/25">·</span>
                <span className="truncate">{c.front}</span>
                <span className="text-white/25 flex-shrink-0">({c.nodeLabel})</span>
              </div>
            ))}
          </div>
          <Button size="sm" variant="secondary" onClick={onDrill}>Drill {struggling.length} weak card{struggling.length !== 1 ? 's' : ''}</Button>
        </div>
      )}
    </div>
  );
}

function SessionView({ card, idx, total, flipped, grading, label, onFlip, onGrade, onExit }) {
  const progress = total > 0 ? ((idx + (flipped ? 0.5 : 0)) / total) * 100 : 0;
  return (
    <div className="flex flex-col gap-3">
      <div className="flex items-center justify-between text-[12px] text-white/45">
        <span>{label} · {idx + 1} / {total}</span>
        <button onClick={onExit} className="hover:text-white/80 flex items-center gap-1"><X size={12} /> Exit</button>
      </div>

      <div className="w-full h-1.5 bg-white/[0.06] rounded-full overflow-hidden">
        <div className="h-full bg-white/70 rounded-full transition-all duration-300" style={{ width: `${progress}%` }} />
      </div>

      {/* Flip card */}
      <div onClick={onFlip} className="cursor-pointer" style={{ perspective: '1000px' }}>
        <div
          className="relative w-full h-[200px] transition-transform duration-500 ease-in-out"
          style={{ transformStyle: 'preserve-3d', transform: flipped ? 'rotateY(180deg)' : 'rotateY(0deg)' }}
        >
          <div
            className="absolute inset-0 bg-white/[0.04] rounded-2xl border border-white/[0.08] p-8 flex flex-col items-center justify-center text-center overflow-auto"
            style={{ backfaceVisibility: 'hidden' }}
          >
            {card.origin === 'quiz-variant' && (
              <span className="mb-2 text-[10px] px-2 py-0.5 rounded-full bg-amber-500/15 text-amber-200 border border-amber-400/25">from a question you missed</span>
            )}
            <p className="text-[17px] font-medium text-white/90">{card.front}</p>
          </div>
          <div
            className="absolute inset-0 bg-white/[0.07] rounded-2xl border border-white/[0.12] p-8 flex items-center justify-center text-center overflow-auto"
            style={{ backfaceVisibility: 'hidden', transform: 'rotateY(180deg)' }}
          >
            <p className="text-[16px] text-white/85">{card.back}</p>
          </div>
        </div>
      </div>

      {!flipped ? (
        <p className="text-center text-[11px] text-white/35">Click or press Space to reveal</p>
      ) : (
        <div className="grid grid-cols-4 gap-2">
          {GRADES.map(g => (
            <button
              key={g.q}
              onClick={() => onGrade(g.q)}
              disabled={grading}
              className={`flex items-center justify-center px-2 py-2.5 rounded-xl border text-[13px] font-semibold transition-colors disabled:opacity-50 ${g.cls}`}
            >
              {g.label}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

function DoneView({ reviewed, remaining, onBack, onClose }) {
  return (
    <div className="text-center py-10 flex flex-col items-center gap-3">
      <div className="w-14 h-14 rounded-full bg-emerald-500/15 border border-emerald-400/30 flex items-center justify-center">
        <Check size={26} className="text-emerald-300" />
      </div>
      <div>
        <p className="text-[15px] font-semibold text-white/90">Nice work</p>
        <p className="text-[12px] text-white/45 mt-1">
          Reviewed {reviewed} card{reviewed !== 1 ? 's' : ''}.
          {remaining > 0 ? ` ${remaining} still due.` : ' All caught up!'}
        </p>
      </div>
      <div className="flex gap-2 mt-1">
        <Button size="sm" variant="ghost" onClick={onBack}><ArrowLeft size={13} /> Overview</Button>
        <Button size="sm" onClick={onClose}>Done</Button>
      </div>
    </div>
  );
}
