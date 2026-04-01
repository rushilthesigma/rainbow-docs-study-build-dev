import { useState, useEffect, useCallback } from 'react';
import { Check, X, RotateCcw, Plus } from 'lucide-react';
import { listDecks, getDeck, submitReview } from '../../api/flashcards';

export default function SplitFlashcards({ className = '' }) {
  const [decks, setDecks] = useState([]);
  const [activeDeck, setActiveDeck] = useState(null);
  const [cards, setCards] = useState([]);
  const [index, setIndex] = useState(0);
  const [flipped, setFlipped] = useState(false);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    listDecks().then(d => { setDecks(d.decks || []); setLoading(false); }).catch(() => setLoading(false));
  }, []);

  async function selectDeck(deckId) {
    const data = await getDeck(deckId);
    const due = (data.deck?.cards || []).filter(c => !c.nextReview || new Date(c.nextReview) <= new Date());
    setCards(due.length > 0 ? due : data.deck?.cards || []);
    setActiveDeck(data.deck);
    setIndex(0);
    setFlipped(false);
  }

  const handleReview = useCallback(async (correct) => {
    const card = cards[index];
    if (!card || !activeDeck) return;
    try { await submitReview(activeDeck.id, card.id, correct); } catch {}
    setFlipped(false);
    if (index < cards.length - 1) setIndex(i => i + 1);
    else { setActiveDeck(null); setCards([]); setIndex(0); }
  }, [cards, index, activeDeck]);

  useEffect(() => {
    function handleKey(e) {
      if (!activeDeck) return;
      if (e.key === ' ') { e.preventDefault(); setFlipped(f => !f); }
      if (flipped && e.key === 'ArrowRight') handleReview(true);
      if (flipped && e.key === 'ArrowLeft') handleReview(false);
    }
    window.addEventListener('keydown', handleKey);
    return () => window.removeEventListener('keydown', handleKey);
  }, [activeDeck, flipped, handleReview]);

  const card = cards[index];

  return (
    <div className={`flex flex-col ${className}`}>
      {!activeDeck ? (
        <div className="flex-1 overflow-y-auto p-3">
          {loading ? (
            <p className="text-sm text-gray-400 text-center py-8">Loading...</p>
          ) : decks.length === 0 ? (
            <p className="text-sm text-gray-400 text-center py-8">No decks yet</p>
          ) : (
            <div className="space-y-1.5">
              {decks.map(d => (
                <button
                  key={d.id}
                  onClick={() => selectDeck(d.id)}
                  className="w-full text-left px-3 py-2.5 rounded-lg hover:bg-gray-50 dark:hover:bg-[#1e1e2e] transition-colors"
                >
                  <p className="text-sm font-medium text-gray-800 dark:text-gray-200">{d.title}</p>
                  <p className="text-xs text-gray-400">{d.cardCount} cards &middot; {d.dueCount} due</p>
                </button>
              ))}
            </div>
          )}
        </div>
      ) : (
        <div className="flex-1 flex flex-col p-3">
          <div className="flex items-center justify-between mb-3">
            <button onClick={() => { setActiveDeck(null); setCards([]); }} className="text-xs text-gray-400 hover:text-gray-600">
              <RotateCcw size={12} className="inline mr-1" />Back
            </button>
            <span className="text-xs text-gray-400">{index + 1}/{cards.length}</span>
          </div>

          {card && (
            <>
              <div
                onClick={() => setFlipped(f => !f)}
                className="flex-1 flex items-center justify-center p-4 rounded-xl border border-gray-200 dark:border-[#2A2A40] cursor-pointer hover:shadow-sm transition-shadow bg-gray-50 dark:bg-[#0D0D14] min-h-[120px]"
              >
                <p className="text-center text-sm text-gray-800 dark:text-gray-200">
                  {flipped ? card.back : card.front}
                </p>
              </div>

              {!flipped && (
                <p className="text-center text-[10px] text-gray-400 mt-2">Tap to flip</p>
              )}

              {flipped && (
                <div className="flex justify-center gap-3 mt-3">
                  <button onClick={() => handleReview(false)} className="flex items-center gap-1 px-3 py-1.5 rounded-lg bg-rose-50 dark:bg-rose-900/20 text-rose-600 text-xs font-medium hover:bg-rose-100">
                    <X size={14} /> Wrong
                  </button>
                  <button onClick={() => handleReview(true)} className="flex items-center gap-1 px-3 py-1.5 rounded-lg bg-emerald-50 dark:bg-emerald-900/20 text-emerald-600 text-xs font-medium hover:bg-emerald-100">
                    <Check size={14} /> Right
                  </button>
                </div>
              )}
            </>
          )}
        </div>
      )}
    </div>
  );
}
