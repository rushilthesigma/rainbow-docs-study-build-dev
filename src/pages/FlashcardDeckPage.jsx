import { useState, useEffect, useCallback } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { ArrowLeft, RotateCcw, Plus, Check, X, Trash2 } from 'lucide-react';
import { getDeck, deleteDeck, submitReview, addCards } from '../api/flashcards';
import Button from '../components/shared/Button';
import Input from '../components/shared/Input';
import LoadingSpinner from '../components/shared/LoadingSpinner';

export default function FlashcardDeckPage() {
  const { id } = useParams();
  const navigate = useNavigate();
  const [deck, setDeck] = useState(null);
  const [loading, setLoading] = useState(true);
  const [mode, setMode] = useState('browse');
  const [reviewIndex, setReviewIndex] = useState(0);
  const [flipped, setFlipped] = useState(false);
  const [flipping, setFlipping] = useState(false);
  const [addTopic, setAddTopic] = useState('');
  const [adding, setAdding] = useState(false);
  const [manualFront, setManualFront] = useState('');
  const [manualBack, setManualBack] = useState('');
  const [addTab, setAddTab] = useState('ai');

  useEffect(() => {
    getDeck(id).then(d => { setDeck(d.deck); setLoading(false); }).catch(() => setLoading(false));
  }, [id]);

  const dueCards = (deck?.cards || []).filter(c => !c.nextReview || new Date(c.nextReview) <= new Date());
  const reviewCards = mode === 'review' ? dueCards : [];
  const currentCard = reviewCards[reviewIndex];

  function doFlip() {
    if (flipping) return;
    setFlipping(true);
    setFlipped(f => !f);
    setTimeout(() => setFlipping(false), 300);
  }

  const handleReview = useCallback(async (correct) => {
    if (!currentCard) return;
    try {
      const data = await submitReview(id, currentCard.id, correct);
      setDeck(prev => ({
        ...prev,
        cards: prev.cards.map(c => c.id === currentCard.id ? data.card : c),
      }));
    } catch {}
    setFlipped(false);
    if (reviewIndex < reviewCards.length - 1) {
      setReviewIndex(i => i + 1);
    } else {
      setMode('browse');
      setReviewIndex(0);
    }
  }, [currentCard, id, reviewIndex, reviewCards.length]);

  useEffect(() => {
    if (mode !== 'review') return;
    function handleKey(e) {
      if (e.key === ' ' || e.key === 'Enter') { e.preventDefault(); doFlip(); }
      if (flipped && (e.key === 'ArrowRight' || e.key === '2')) handleReview(true);
      if (flipped && (e.key === 'ArrowLeft' || e.key === '1')) handleReview(false);
    }
    window.addEventListener('keydown', handleKey);
    return () => window.removeEventListener('keydown', handleKey);
  }, [mode, flipped, handleReview]);

  async function handleAddCards(e) {
    e.preventDefault();
    if (!addTopic.trim()) return;
    setAdding(true);
    try {
      const data = await addCards(id, { topic: addTopic.trim(), count: 10 });
      setDeck(data.deck);
      setAddTopic(''); setMode('browse');
    } catch {}
    setAdding(false);
  }

  async function handleAddManual(e) {
    e.preventDefault();
    if (!manualFront.trim() || !manualBack.trim()) return;
    setAdding(true);
    try {
      const data = await addCards(id, { cards: [{ front: manualFront.trim(), back: manualBack.trim() }] });
      setDeck(data.deck);
      setManualFront(''); setManualBack('');
    } catch {}
    setAdding(false);
  }

  async function handleDelete() {
    if (!confirm('Delete this deck?')) return;
    await deleteDeck(id);
    navigate('/flashcards');
  }

  if (loading) return <div className="flex items-center justify-center h-64"><LoadingSpinner size={28} /></div>;
  if (!deck) return <div className="text-center py-20 text-gray-500">Deck not found</div>;

  const reviewProgress = reviewCards.length > 0 ? ((reviewIndex + 1) / reviewCards.length) * 100 : 0;

  return (
    <div className="max-w-2xl mx-auto">
      <div className="flex items-center justify-between mb-6">
        <button onClick={() => navigate('/flashcards')} className="flex items-center gap-2 text-sm text-gray-500 hover:text-gray-700 dark:hover:text-gray-200 transition-colors">
          <ArrowLeft size={16} /> Flashcards
        </button>
        <button onClick={handleDelete} className="text-gray-300 hover:text-rose-500 transition-colors"><Trash2 size={16} /></button>
      </div>

      <h1 className="text-xl font-bold text-gray-900 dark:text-white mb-1">{deck.title}</h1>
      <p className="text-sm text-gray-500 dark:text-gray-400 mb-6">{deck.cards?.length || 0} cards &middot; {dueCards.length} due for review</p>

      {mode === 'browse' && (
        <div className="flex gap-2 mb-6">
          <Button onClick={() => { setMode('review'); setReviewIndex(0); setFlipped(false); }} disabled={dueCards.length === 0}>
            <RotateCcw size={16} /> Review ({dueCards.length})
          </Button>
          <Button variant="secondary" onClick={() => setMode('add')}>
            <Plus size={16} /> Add Cards
          </Button>
        </div>
      )}

      {/* Review mode */}
      {mode === 'review' && currentCard && (
        <div className="space-y-4">
          <div className="flex items-center justify-between text-sm text-gray-400 mb-2">
            <span>{reviewIndex + 1} / {reviewCards.length}</span>
            <button onClick={() => { setMode('browse'); setReviewIndex(0); setFlipped(false); }} className="hover:text-gray-600 dark:hover:text-gray-300">Exit Review</button>
          </div>

          {/* Progress bar */}
          <div className="w-full h-1.5 bg-gray-200 dark:bg-[#2A2A40] rounded-full overflow-hidden">
            <div className="h-full bg-blue-500 rounded-full transition-all duration-300" style={{ width: `${reviewProgress}%` }} />
          </div>

          {/* 3D flip card */}
          <div
            onClick={doFlip}
            className="cursor-pointer"
            style={{ perspective: '1000px' }}
          >
            <div
              className="relative w-full h-[240px] transition-transform duration-500 ease-in-out"
              style={{
                transformStyle: 'preserve-3d',
                transform: flipped ? 'rotateY(180deg)' : 'rotateY(0deg)',
              }}
            >
              {/* Front */}
              <div
                className="absolute inset-0 bg-white dark:bg-[#161622] rounded-2xl border border-gray-200 dark:border-[#2A2A40] p-8 flex items-center justify-center shadow-lg overflow-auto"
                style={{ backfaceVisibility: 'hidden' }}
              >
                <p className="text-center text-lg font-medium text-gray-900 dark:text-gray-100">{currentCard.front}</p>
              </div>

              {/* Back */}
              <div
                className="absolute inset-0 bg-gradient-to-br from-blue-50 to-purple-50 dark:from-[#161622] dark:to-[#1a1a30] rounded-2xl border border-blue-200 dark:border-blue-900/30 p-8 flex items-center justify-center shadow-lg overflow-auto"
                style={{ backfaceVisibility: 'hidden', transform: 'rotateY(180deg)' }}
              >
                <p className="text-center text-lg text-gray-800 dark:text-gray-200">{currentCard.back}</p>
              </div>
            </div>
          </div>

          {!flipped && (
            <p className="text-center text-xs text-gray-400">Click or press Space to flip</p>
          )}

          {flipped && (
            <div className="flex justify-center gap-4 pt-2">
              <button
                onClick={() => handleReview(false)}
                className="flex items-center gap-2 px-6 py-3 rounded-xl bg-rose-50 dark:bg-rose-900/15 border border-rose-200 dark:border-rose-800 text-rose-600 dark:text-rose-400 font-medium text-sm hover:bg-rose-100 dark:hover:bg-rose-900/25 transition-colors"
              >
                <X size={18} /> Incorrect
              </button>
              <button
                onClick={() => handleReview(true)}
                className="flex items-center gap-2 px-6 py-3 rounded-xl bg-emerald-50 dark:bg-emerald-900/15 border border-emerald-200 dark:border-emerald-800 text-emerald-600 dark:text-emerald-400 font-medium text-sm hover:bg-emerald-100 dark:hover:bg-emerald-900/25 transition-colors"
              >
                <Check size={18} /> Correct
              </button>
            </div>
          )}
        </div>
      )}

      {mode === 'review' && !currentCard && (
        <div className="text-center py-12">
          <p className="text-gray-500 mb-4">All done! No more cards to review.</p>
          <Button onClick={() => setMode('browse')}>Back to Deck</Button>
        </div>
      )}

      {/* Add cards mode */}
      {mode === 'add' && (
        <div className="bg-white dark:bg-[#161622] rounded-xl border border-gray-200 dark:border-[#2A2A40] p-5 mb-4 space-y-3">
          <div className="flex gap-2 mb-3">
            <button onClick={() => setAddTab('manual')} className={`px-3 py-1.5 rounded-lg text-sm font-medium transition-colors ${addTab === 'manual' ? 'bg-blue-600 text-white' : 'bg-gray-100 dark:bg-[#1e1e2e] text-gray-600 dark:text-gray-300'}`}>
              Create Manually
            </button>
            <button onClick={() => setAddTab('ai')} className={`px-3 py-1.5 rounded-lg text-sm font-medium transition-colors ${addTab === 'ai' ? 'bg-blue-600 text-white' : 'bg-gray-100 dark:bg-[#1e1e2e] text-gray-600 dark:text-gray-300'}`}>
              AI Generate
            </button>
          </div>

          {addTab === 'manual' ? (
            <form onSubmit={handleAddManual} className="space-y-3">
              <Input label="Front (question)" placeholder="What is..." value={manualFront} onChange={e => setManualFront(e.target.value)} />
              <Input label="Back (answer)" placeholder="The answer is..." value={manualBack} onChange={e => setManualBack(e.target.value)} />
              <div className="flex gap-2">
                <Button type="submit" loading={adding} size="sm"><Plus size={14} /> Add Card</Button>
                <Button type="button" variant="ghost" size="sm" onClick={() => setMode('browse')}>Done</Button>
              </div>
            </form>
          ) : (
            <form onSubmit={handleAddCards} className="space-y-3">
              <Input label="Topic" placeholder="e.g., Photosynthesis" value={addTopic} onChange={e => setAddTopic(e.target.value)} />
              <div className="flex gap-2">
                <Button type="submit" loading={adding} size="sm"><Plus size={14} /> Generate</Button>
                <Button type="button" variant="ghost" size="sm" onClick={() => setMode('browse')}>Cancel</Button>
              </div>
            </form>
          )}
        </div>
      )}

      {/* Card list (browse) */}
      {mode === 'browse' && (
        <div className="space-y-2">
          {(deck.cards || []).map((card) => (
            <div key={card.id} className="bg-white dark:bg-[#161622] rounded-xl border border-gray-200 dark:border-[#2A2A40] p-4 hover:shadow-sm transition-shadow">
              <p className="text-sm font-medium text-gray-900 dark:text-gray-100">{card.front}</p>
              <div className="w-full h-px bg-gray-100 dark:bg-[#2A2A40] my-2" />
              <p className="text-xs text-gray-500 dark:text-gray-400">{card.back}</p>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
