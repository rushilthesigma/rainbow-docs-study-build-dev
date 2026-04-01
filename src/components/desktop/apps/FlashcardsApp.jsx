import { useState, useEffect, useCallback } from 'react';
import { ArrowLeft, Layers, Plus, RotateCcw, Check, X, Trash2, ArrowRight } from 'lucide-react';
import { listDecks, createDeck, getDeck, deleteDeck, submitReview, addCards } from '../../../api/flashcards';
import Button from '../../shared/Button';
import Input from '../../shared/Input';
import LoadingSpinner from '../../shared/LoadingSpinner';

export default function FlashcardsApp() {
  const [view, setView] = useState('list'); // list, deck
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

  // Keyboard shortcuts for review
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

  // Deck loading
  if (view === 'deck' && !deck) {
    return <div className="flex items-center justify-center h-48"><LoadingSpinner size={24} /></div>;
  }

  // Deck detail view
  if (view === 'deck' && deck) {
    const progress = reviewCards.length > 0 ? ((reviewIndex + 1) / reviewCards.length) * 100 : 0;

    return (
      <div>
        <div className="flex items-center justify-between mb-4">
          <button onClick={() => { setView('list'); setDeck(null); }} className="flex items-center gap-2 text-sm text-gray-500 hover:text-gray-700 dark:hover:text-gray-200">
            <ArrowLeft size={16} /> Decks
          </button>
          <button onClick={handleDeleteDeck} className="text-gray-300 hover:text-rose-500"><Trash2 size={15} /></button>
        </div>

        <h2 className="text-lg font-bold text-gray-900 dark:text-white mb-1">{deck.title}</h2>
        <p className="text-sm text-gray-500 mb-4">{deck.cards?.length || 0} cards · {dueCards.length} due</p>

        {mode === 'add' && (
          <div className="bg-white dark:bg-[#1e1e2e] rounded-xl border border-gray-200 dark:border-[#2A2A40] p-4 mb-4 space-y-3">
            <div className="flex gap-2 mb-2">
              <button onClick={() => setAddTab('ai')} className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-colors ${addTab === 'ai' ? 'bg-blue-600 text-white' : 'bg-gray-100 dark:bg-[#161622] text-gray-600 dark:text-gray-300'}`}>AI Generate</button>
              <button onClick={() => setAddTab('manual')} className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-colors ${addTab === 'manual' ? 'bg-blue-600 text-white' : 'bg-gray-100 dark:bg-[#161622] text-gray-600 dark:text-gray-300'}`}>Manual</button>
            </div>

            {addTab === 'ai' ? (
              <>
                <Input label="Topic" placeholder="e.g., Photosynthesis, Spanish vocabulary" value={addTopic} onChange={e => setAddTopic(e.target.value)} />
                <div className="flex gap-2">
                  <Button size="sm" loading={adding} onClick={async () => {
                    if (!addTopic.trim()) return;
                    setAdding(true);
                    try { const d = await addCards(deck.id, { topic: addTopic.trim(), count: 10 }); setDeck(d.deck); setAddTopic(''); setMode('browse'); } catch {}
                    setAdding(false);
                  }}><Plus size={14} /> Generate 10 Cards</Button>
                  <Button size="sm" variant="ghost" onClick={() => setMode('browse')}>Cancel</Button>
                </div>
              </>
            ) : (
              <>
                <Input label="Front (question)" placeholder="What is..." value={manualFront} onChange={e => setManualFront(e.target.value)} />
                <Input label="Back (answer)" placeholder="The answer is..." value={manualBack} onChange={e => setManualBack(e.target.value)} />
                <div className="flex gap-2">
                  <Button size="sm" loading={adding} onClick={async () => {
                    if (!manualFront.trim() || !manualBack.trim()) return;
                    setAdding(true);
                    try { const d = await addCards(deck.id, { cards: [{ front: manualFront.trim(), back: manualBack.trim() }] }); setDeck(d.deck); setManualFront(''); setManualBack(''); } catch {}
                    setAdding(false);
                  }}><Plus size={14} /> Add Card</Button>
                  <Button size="sm" variant="ghost" onClick={() => setMode('browse')}>Done</Button>
                </div>
              </>
            )}
          </div>
        )}

        {mode === 'browse' && (
          <>
            <div className="flex gap-2 mb-4">
              <Button size="sm" onClick={() => { setMode('review'); setReviewIndex(0); setFlipped(false); }} disabled={dueCards.length === 0}>
                <RotateCcw size={14} /> Review ({dueCards.length})
              </Button>
              <Button size="sm" variant="secondary" onClick={() => setMode('add')}>
                <Plus size={14} /> Add Cards
              </Button>
            </div>
            <div className="space-y-1.5">
              {(deck.cards || []).map(card => (
                <div key={card.id} className="bg-white dark:bg-[#1e1e2e] rounded-lg border border-gray-200 dark:border-[#2A2A40] p-3">
                  <p className="text-sm font-medium text-gray-900 dark:text-gray-100">{card.front}</p>
                  <div className="w-full h-px bg-gray-100 dark:bg-[#2A2A40] my-1.5" />
                  <p className="text-xs text-gray-500">{card.back}</p>
                </div>
              ))}
            </div>
          </>
        )}

        {mode === 'review' && currentCard && (
          <div className="space-y-3">
            <div className="flex items-center justify-between text-xs text-gray-400">
              <span>{reviewIndex + 1} / {reviewCards.length}</span>
              <button onClick={() => { setMode('browse'); setFlipped(false); }} className="hover:text-gray-600">Exit</button>
            </div>
            <div className="w-full h-1 bg-gray-200 dark:bg-[#2A2A40] rounded-full overflow-hidden">
              <div className="h-full bg-blue-500 rounded-full transition-all" style={{ width: `${progress}%` }} />
            </div>

            {/* Flip card */}
            <div onClick={() => setFlipped(f => !f)} className="cursor-pointer" style={{ perspective: '1000px' }}>
              <div className="relative w-full h-[200px] transition-transform duration-500" style={{ transformStyle: 'preserve-3d', transform: flipped ? 'rotateY(180deg)' : 'rotateY(0deg)' }}>
                <div className="absolute inset-0 bg-white dark:bg-[#1e1e2e] rounded-2xl border border-gray-200 dark:border-[#2A2A40] p-6 flex items-center justify-center shadow-lg overflow-auto" style={{ backfaceVisibility: 'hidden' }}>
                  <p className="text-center text-base font-medium text-gray-900 dark:text-gray-100">{currentCard.front}</p>
                </div>
                <div className="absolute inset-0 bg-gradient-to-br from-purple-50 to-blue-50 dark:from-[#1e1e2e] dark:to-[#1a1a30] rounded-2xl border border-purple-200 dark:border-purple-900/30 p-6 flex items-center justify-center shadow-lg overflow-auto" style={{ backfaceVisibility: 'hidden', transform: 'rotateY(180deg)' }}>
                  <p className="text-center text-base text-gray-800 dark:text-gray-200">{currentCard.back}</p>
                </div>
              </div>
            </div>

            {!flipped && <p className="text-center text-[11px] text-gray-400">Click or press Space to flip</p>}
            {flipped && (
              <div className="flex justify-center gap-3">
                <button onClick={() => handleReview(false)} className="flex items-center gap-1.5 px-5 py-2.5 rounded-xl bg-rose-50 dark:bg-rose-900/15 border border-rose-200 dark:border-rose-800 text-rose-600 dark:text-rose-400 text-sm font-medium">
                  <X size={16} /> Wrong
                </button>
                <button onClick={() => handleReview(true)} className="flex items-center gap-1.5 px-5 py-2.5 rounded-xl bg-emerald-50 dark:bg-emerald-900/15 border border-emerald-200 dark:border-emerald-800 text-emerald-600 dark:text-emerald-400 text-sm font-medium">
                  <Check size={16} /> Correct
                </button>
              </div>
            )}
          </div>
        )}

        {mode === 'review' && !currentCard && (
          <div className="text-center py-8">
            <p className="text-gray-500 mb-3">All done!</p>
            <Button size="sm" onClick={() => setMode('browse')}>Back to Deck</Button>
          </div>
        )}
      </div>
    );
  }

  // List view
  if (loading) return <div className="flex items-center justify-center h-48"><LoadingSpinner size={24} /></div>;

  return (
    <div>
      <div className="flex items-center justify-between mb-5">
        <h2 className="text-lg font-bold text-gray-900 dark:text-white">Flashcards</h2>
        <Button size="sm" onClick={() => setShowForm(!showForm)}><Plus size={14} /> New Deck</Button>
      </div>

      {showForm && (
        <form onSubmit={handleCreate} className="bg-white dark:bg-[#1e1e2e] rounded-xl border border-gray-200 dark:border-[#2A2A40] p-4 mb-4 space-y-3">
          <Input label="Topic (AI generates cards)" placeholder="e.g., Spanish vocabulary" value={topic} onChange={e => setTopic(e.target.value)} />
          <Input label="Deck title (optional)" placeholder="Custom name" value={deckTitle} onChange={e => setDeckTitle(e.target.value)} />
          <div className="flex gap-2">
            <Button type="submit" loading={creating} size="sm"><Plus size={14} /> {topic ? 'Generate' : 'Create'}</Button>
            <Button type="button" variant="ghost" size="sm" onClick={() => setShowForm(false)}>Cancel</Button>
          </div>
        </form>
      )}

      {decks.length === 0 && !showForm ? (
        <div className="text-center py-12">
          <Layers size={28} className="text-purple-400 mx-auto mb-3" />
          <p className="text-sm text-gray-500 mb-3">No decks yet</p>
          <Button size="sm" onClick={() => setShowForm(true)}><Plus size={14} /> Create Deck</Button>
        </div>
      ) : (
        <div className="space-y-1.5">
          {decks.map(d => (
            <div key={d.id} onClick={() => openDeck(d.id)} className="flex items-center gap-3 bg-white dark:bg-[#1e1e2e] rounded-xl border border-gray-200 dark:border-[#2A2A40] px-4 py-3 cursor-pointer hover:border-purple-300 dark:hover:border-purple-700 transition-colors">
              <div className="w-8 h-8 rounded-lg bg-purple-50 dark:bg-purple-900/20 flex items-center justify-center flex-shrink-0">
                <Layers size={14} className="text-purple-500" />
              </div>
              <div className="flex-1 min-w-0">
                <h3 className="text-sm font-medium text-gray-900 dark:text-gray-100 truncate">{d.title}</h3>
                <p className="text-xs text-gray-400">{d.cardCount} cards{d.dueCount > 0 ? ` · ${d.dueCount} due` : ''}</p>
              </div>
              <ArrowRight size={14} className="text-gray-300 flex-shrink-0" />
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
