import { useState, useEffect, useCallback } from 'react';
import { ArrowLeft, Layers, Plus, RotateCcw, Check, X, Trash2, ArrowRight, Loader2, Sparkles, Edit3 } from 'lucide-react';
import { listDecks, createDeck, getDeck, deleteDeck, submitReview, addCards } from '../../../api/flashcards';
import LoadingSpinner from '../../shared/LoadingSpinner';

const inputCls = 'w-full rounded-xl border border-white/[0.08] bg-white/[0.04] px-3.5 py-2.5 text-[13px] text-white/85 placeholder:text-white/25 focus:outline-none focus:border-white/[0.20] focus:bg-white/[0.07] transition-colors';

export default function FlashcardsApp() {
  const [view, setView] = useState('list');
  const [decks, setDecks] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [creating, setCreating] = useState(false);
  const [topic, setTopic] = useState('');
  const [deckTitle, setDeckTitle] = useState('');

  // Deck view state
  const [deck, setDeck] = useState(null);
  const [mode, setMode] = useState('browse');
  const [reviewIndex, setReviewIndex] = useState(0);
  const [flipped, setFlipped] = useState(false);
  const [addTopic, setAddTopic] = useState('');
  const [adding, setAdding] = useState(false);
  const [addTab, setAddTab] = useState('ai');
  const [manualFront, setManualFront] = useState('');
  const [manualBack, setManualBack] = useState('');

  useEffect(() => {
    listDecks().then(d => { setDecks(d.decks || []); setLoading(false); }).catch(() => setLoading(false));
  }, []);

  async function handleCreate(e) {
    e.preventDefault();
    if (!topic.trim() && !deckTitle.trim()) return;
    setCreating(true);
    try {
      const data = await createDeck(deckTitle.trim() || topic.trim(), topic.trim() || null, 10, 'beginner');
      setDecks(prev => [{ ...data.deck, cardCount: data.deck.cards?.length || 0, dueCount: data.deck.cards?.length || 0 }, ...prev]);
      setTopic(''); setDeckTitle(''); setShowForm(false);
    } catch {}
    setCreating(false);
  }

  async function openDeck(id) {
    setView('deck');
    setMode('browse');
    setFlipped(false);
    setReviewIndex(0);
    try {
      const d = await getDeck(id);
      setDeck(d.deck);
    } catch {}
  }

  async function handleDeleteDeck() {
    if (!deck || !confirm('Delete this deck?')) return;
    await deleteDeck(deck.id);
    setDecks(prev => prev.filter(d => d.id !== deck.id));
    setView('list');
    setDeck(null);
  }

  const dueCards = (deck?.cards || []).filter(c => !c.nextReview || new Date(c.nextReview) <= new Date());
  const reviewCards = mode === 'review' ? dueCards : [];
  const currentCard = reviewCards[reviewIndex];

  const handleReview = useCallback(async (correct) => {
    if (!currentCard || !deck) return;
    try {
      const data = await submitReview(deck.id, currentCard.id, correct);
      setDeck(prev => ({ ...prev, cards: prev.cards.map(c => c.id === currentCard.id ? data.card : c) }));
    } catch {}
    setFlipped(false);
    if (reviewIndex < reviewCards.length - 1) setReviewIndex(i => i + 1);
    else { setMode('browse'); setReviewIndex(0); }
  }, [currentCard, deck, reviewIndex, reviewCards.length]);

  useEffect(() => {
    if (mode !== 'review' || view !== 'deck') return;
    function handleKey(e) {
      if (e.key === ' ' || e.key === 'Enter') { e.preventDefault(); setFlipped(f => !f); }
      if (flipped && (e.key === 'ArrowRight' || e.key === '2')) handleReview(true);
      if (flipped && (e.key === 'ArrowLeft' || e.key === '1')) handleReview(false);
    }
    window.addEventListener('keydown', handleKey);
    return () => window.removeEventListener('keydown', handleKey);
  }, [mode, view, flipped, handleReview]);

  // ─── Deck loading ───
  if (view === 'deck' && !deck) {
    return <div className="flex items-center justify-center h-48"><LoadingSpinner size={24} /></div>;
  }

  // ─── Deck detail ───
  if (view === 'deck' && deck) {
    const progress = reviewCards.length > 0 ? ((reviewIndex) / reviewCards.length) * 100 : 0;

    return (
      <div className="flex flex-col h-full min-h-0">
        {/* Header */}
        <div className="flex items-center justify-between mb-4 shrink-0">
          <button
            onClick={() => { setView('list'); setDeck(null); }}
            className="inline-flex items-center gap-1.5 text-[12px] text-white/35 hover:text-white/65 transition-colors"
          >
            <ArrowLeft size={13} /> Decks
          </button>
          <button onClick={handleDeleteDeck} className="text-white/20 hover:text-rose-400 transition-colors">
            <Trash2 size={14} />
          </button>
        </div>

        <h2 className="text-[18px] font-bold text-white/90 mb-0.5 shrink-0">{deck.title}</h2>
        <p className="text-[12px] text-white/35 mb-4 shrink-0">{deck.cards?.length || 0} cards · {dueCards.length} due</p>

        {/* Add cards panel */}
        {mode === 'add' && (
          <div className="rounded-2xl border border-white/[0.08] bg-white/[0.03] p-4 mb-4 shrink-0">
            <div className="flex gap-2 mb-3">
              {['ai', 'manual'].map(tab => (
                <button
                  key={tab}
                  onClick={() => setAddTab(tab)}
                  className="px-3 py-1.5 rounded-lg text-[12px] font-semibold transition-colors capitalize"
                  style={addTab === tab
                    ? { background: 'rgba(255,255,255,0.12)', color: 'rgba(255,255,255,0.85)', border: '1px solid rgba(255,255,255,0.20)' }
                    : { background: 'rgba(255,255,255,0.04)', color: 'rgba(255,255,255,0.40)', border: '1px solid rgba(255,255,255,0.07)' }}
                >
                  {tab === 'ai' ? <><Sparkles size={11} className="inline mr-1" />AI Generate</> : <><Edit3 size={11} className="inline mr-1" />Manual</>}
                </button>
              ))}
            </div>
            {addTab === 'ai' ? (
              <div className="flex flex-col gap-2">
                <input className={inputCls} placeholder="Topic to generate cards on…" value={addTopic} onChange={e => setAddTopic(e.target.value)} />
                <div className="flex gap-2">
                  <button
                    disabled={adding || !addTopic.trim()}
                    onClick={async () => {
                      if (!addTopic.trim()) return;
                      setAdding(true);
                      try { const d = await addCards(deck.id, { topic: addTopic.trim(), count: 10 }); setDeck(d.deck); setAddTopic(''); setMode('browse'); } catch {}
                      setAdding(false);
                    }}
                    className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl text-[12px] font-bold text-white/80 bg-white/[0.08] border border-white/[0.14] hover:bg-white/[0.14] disabled:opacity-40 transition-colors"
                  >
                    {adding ? <Loader2 size={12} className="animate-spin" /> : <Plus size={12} />}
                    Generate 10 Cards
                  </button>
                  <button onClick={() => setMode('browse')} className="px-3 py-2 rounded-xl text-[12px] text-white/35 hover:text-white/60 transition-colors">Cancel</button>
                </div>
              </div>
            ) : (
              <div className="flex flex-col gap-2">
                <input className={inputCls} placeholder="Front (question)…" value={manualFront} onChange={e => setManualFront(e.target.value)} />
                <input className={inputCls} placeholder="Back (answer)…" value={manualBack} onChange={e => setManualBack(e.target.value)} />
                <div className="flex gap-2">
                  <button
                    disabled={adding || !manualFront.trim() || !manualBack.trim()}
                    onClick={async () => {
                      if (!manualFront.trim() || !manualBack.trim()) return;
                      setAdding(true);
                      try { const d = await addCards(deck.id, { cards: [{ front: manualFront.trim(), back: manualBack.trim() }] }); setDeck(d.deck); setManualFront(''); setManualBack(''); } catch {}
                      setAdding(false);
                    }}
                    className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl text-[12px] font-bold text-white/80 bg-white/[0.08] border border-white/[0.14] hover:bg-white/[0.14] disabled:opacity-40 transition-colors"
                  >
                    {adding ? <Loader2 size={12} className="animate-spin" /> : <Plus size={12} />}
                    Add Card
                  </button>
                  <button onClick={() => setMode('browse')} className="px-3 py-2 rounded-xl text-[12px] text-white/35 hover:text-white/60 transition-colors">Done</button>
                </div>
              </div>
            )}
          </div>
        )}

        {/* Browse mode */}
        {mode === 'browse' && (
          <>
            <div className="flex gap-2 mb-4 shrink-0">
              <button
                disabled={dueCards.length === 0}
                onClick={() => { setMode('review'); setReviewIndex(0); setFlipped(false); }}
                className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl text-[12px] font-bold text-white/85 bg-white/[0.10] border border-white/[0.18] shadow-[inset_0_1px_0_rgba(255,255,255,0.12)] hover:bg-white/[0.16] disabled:opacity-35 transition-colors"
              >
                <RotateCcw size={12} /> Review ({dueCards.length})
              </button>
              <button
                onClick={() => setMode('add')}
                className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl text-[12px] font-bold text-white/60 bg-white/[0.05] border border-white/[0.09] hover:bg-white/[0.09] hover:text-white/80 transition-colors"
              >
                <Plus size={12} /> Add Cards
              </button>
            </div>
            <div className="flex flex-col gap-1.5 overflow-y-auto flex-1 min-h-0">
              {(deck.cards || []).map(card => (
                <div key={card.id} className="rounded-xl border border-white/[0.06] bg-white/[0.02] p-3.5">
                  <p className="text-[13px] font-medium text-white/80">{card.front}</p>
                  <div className="w-full h-px bg-white/[0.06] my-2" />
                  <p className="text-[12px] text-white/40">{card.back}</p>
                </div>
              ))}
            </div>
          </>
        )}

        {/* Review mode */}
        {mode === 'review' && currentCard && (
          <div className="flex flex-col gap-3 flex-1 min-h-0">
            <div className="flex items-center justify-between text-[11px] text-white/30 shrink-0">
              <span>{reviewIndex + 1} / {reviewCards.length}</span>
              <button onClick={() => { setMode('browse'); setFlipped(false); }} className="hover:text-white/55 transition-colors">Exit</button>
            </div>
            {/* Progress bar */}
            <div className="w-full h-0.5 rounded-full bg-white/[0.07] overflow-hidden shrink-0">
              <div className="h-full bg-white/40 rounded-full transition-all duration-300" style={{ width: `${progress}%` }} />
            </div>

            {/* Flip card */}
            <div
              onClick={() => setFlipped(f => !f)}
              className="cursor-pointer flex-1 min-h-0"
              style={{ perspective: '1000px' }}
            >
              <div
                className="relative w-full h-full transition-transform duration-500"
                style={{ transformStyle: 'preserve-3d', transform: flipped ? 'rotateY(180deg)' : 'rotateY(0deg)' }}
              >
                {/* Front */}
                <div
                  className="absolute inset-0 rounded-2xl border border-white/[0.10] bg-white/[0.05] backdrop-blur-sm p-6 flex items-center justify-center"
                  style={{ backfaceVisibility: 'hidden' }}
                >
                  <p className="text-center text-[15px] font-semibold text-white/90">{currentCard.front}</p>
                </div>
                {/* Back */}
                <div
                  className="absolute inset-0 rounded-2xl border border-white/[0.14] bg-white/[0.08] backdrop-blur-sm p-6 flex items-center justify-center"
                  style={{ backfaceVisibility: 'hidden', transform: 'rotateY(180deg)' }}
                >
                  <p className="text-center text-[14px] text-white/75">{currentCard.back}</p>
                </div>
              </div>
            </div>

            {!flipped && (
              <p className="text-center text-[11px] text-white/25 shrink-0">Click or press Space to flip</p>
            )}
            {flipped && (
              <div className="flex justify-center gap-3 shrink-0">
                <button
                  onClick={() => handleReview(false)}
                  className="inline-flex items-center gap-1.5 px-5 py-2.5 rounded-xl text-[13px] font-semibold text-rose-400 bg-rose-500/10 border border-rose-500/20 hover:bg-rose-500/20 transition-colors"
                >
                  <X size={15} /> Wrong
                </button>
                <button
                  onClick={() => handleReview(true)}
                  className="inline-flex items-center gap-1.5 px-5 py-2.5 rounded-xl text-[13px] font-semibold text-emerald-400 bg-emerald-500/10 border border-emerald-500/20 hover:bg-emerald-500/20 transition-colors"
                >
                  <Check size={15} /> Correct
                </button>
              </div>
            )}
            {!flipped && <p className="text-center text-[10px] text-white/20 shrink-0">← Wrong · Correct →  (after flipping)</p>}
          </div>
        )}

        {mode === 'review' && !currentCard && (
          <div className="flex-1 flex flex-col items-center justify-center gap-3">
            <p className="text-[14px] font-semibold text-white/55">All done!</p>
            <button
              onClick={() => setMode('browse')}
              className="px-4 py-2 rounded-xl text-[12px] font-bold text-white/70 bg-white/[0.07] border border-white/[0.12] hover:bg-white/[0.12] transition-colors"
            >
              Back to Deck
            </button>
          </div>
        )}
      </div>
    );
  }

  // ─── List view ───
  if (loading) return <div className="flex items-center justify-center h-48"><LoadingSpinner size={24} /></div>;

  return (
    <div className="flex flex-col h-full min-h-0">
      {/* Header */}
      <div className="flex items-center justify-between mb-6 shrink-0">
        <div>
          <p className="text-[10px] font-black uppercase tracking-[0.22em] text-white/30 mb-1">Spaced Repetition</p>
          <h1 className="text-[22px] font-black text-white/90 leading-tight">Flashcards</h1>
        </div>
        <button
          onClick={() => setShowForm(!showForm)}
          className="inline-flex items-center gap-2 px-4 py-2.5 rounded-2xl font-bold text-[13px] text-white/85 bg-white/[0.10] border border-white/[0.18] shadow-[inset_0_1px_0_rgba(255,255,255,0.12)] hover:bg-white/[0.16] hover:text-white transition-colors"
        >
          <Plus size={14} /> New Deck
        </button>
      </div>

      {/* Create form */}
      {showForm && (
        <form onSubmit={handleCreate} className="rounded-2xl border border-white/[0.08] bg-white/[0.03] p-4 mb-4 flex flex-col gap-3 shrink-0">
          <div>
            <label className="block text-[10px] font-black uppercase tracking-[0.18em] text-white/35 mb-2">Topic <span className="normal-case font-normal tracking-normal text-white/20">(AI generates cards)</span></label>
            <input className={inputCls} placeholder="e.g., Spanish vocabulary, photosynthesis…" value={topic} onChange={e => setTopic(e.target.value)} />
          </div>
          <div>
            <label className="block text-[10px] font-black uppercase tracking-[0.18em] text-white/35 mb-2">Deck title <span className="normal-case font-normal tracking-normal text-white/20">(optional)</span></label>
            <input className={inputCls} placeholder="Custom name…" value={deckTitle} onChange={e => setDeckTitle(e.target.value)} />
          </div>
          <div className="flex gap-2">
            <button
              type="submit"
              disabled={creating || (!topic.trim() && !deckTitle.trim())}
              className="inline-flex items-center gap-2 px-4 py-2 rounded-xl text-[12px] font-bold text-white/85 bg-white/[0.10] border border-white/[0.18] shadow-[inset_0_1px_0_rgba(255,255,255,0.10)] hover:bg-white/[0.16] disabled:opacity-40 transition-colors"
            >
              {creating ? <Loader2 size={12} className="animate-spin" /> : <Plus size={12} />}
              {topic.trim() ? 'Generate' : 'Create'}
            </button>
            <button type="button" onClick={() => setShowForm(false)} className="px-3 py-2 rounded-xl text-[12px] text-white/35 hover:text-white/60 transition-colors">Cancel</button>
          </div>
        </form>
      )}

      {/* Deck list */}
      {decks.length === 0 && !showForm ? (
        <div className="flex-1 flex flex-col items-center justify-center gap-3">
          <div className="w-12 h-12 rounded-2xl bg-white/[0.05] border border-white/[0.08] flex items-center justify-center">
            <Layers size={20} className="text-white/30" />
          </div>
          <p className="text-[13px] text-white/30">No decks yet</p>
          <button
            onClick={() => setShowForm(true)}
            className="inline-flex items-center gap-2 px-4 py-2 rounded-xl text-[12px] font-bold text-white/70 bg-white/[0.07] border border-white/[0.12] hover:bg-white/[0.12] transition-colors"
          >
            <Plus size={12} /> Create Deck
          </button>
        </div>
      ) : (
        <div className="flex flex-col gap-2 overflow-y-auto flex-1 min-h-0">
          {decks.map(d => (
            <button
              key={d.id}
              onClick={() => openDeck(d.id)}
              className="text-left rounded-2xl border border-white/[0.07] bg-white/[0.03] hover:border-white/[0.14] hover:bg-white/[0.06] backdrop-blur-sm px-4 py-3.5 transition-all group flex items-center gap-3"
            >
              <div className="w-9 h-9 rounded-xl bg-white/[0.05] border border-white/[0.08] flex items-center justify-center flex-shrink-0">
                <Layers size={15} className="text-white/40" />
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-[14px] font-semibold text-white/80 group-hover:text-white/90 truncate">{d.title}</p>
                <p className="text-[11px] text-white/30">{d.cardCount} cards{d.dueCount > 0 ? ` · ${d.dueCount} due` : ''}</p>
              </div>
              <ArrowRight size={13} className="text-white/20 flex-shrink-0 group-hover:text-white/40 transition-colors" />
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
