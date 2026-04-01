import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { Layers, Plus, ArrowRight, RotateCcw } from 'lucide-react';
import { listDecks, createDeck } from '../api/flashcards';
import Button from '../components/shared/Button';
import Input from '../components/shared/Input';
import LoadingSpinner from '../components/shared/LoadingSpinner';

export default function FlashcardsPage() {
  const navigate = useNavigate();
  const [decks, setDecks] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [creating, setCreating] = useState(false);
  const [topic, setTopic] = useState('');
  const [deckTitle, setDeckTitle] = useState('');

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
    } catch (err) { console.error(err); }
    setCreating(false);
  }

  if (loading) return <div className="flex items-center justify-center h-64"><LoadingSpinner size={28} /></div>;

  return (
    <div className="max-w-3xl mx-auto">
      <div className="flex items-center justify-between mb-6">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-lg bg-purple-50 dark:bg-purple-900/20 flex items-center justify-center text-purple-500">
            <Layers size={20} />
          </div>
          <div>
            <h1 className="text-xl font-bold text-gray-900 dark:text-white">Flashcards</h1>
            <p className="text-sm text-gray-500 dark:text-gray-400">{decks.length} deck{decks.length !== 1 ? 's' : ''}</p>
          </div>
        </div>
        <Button onClick={() => setShowForm(!showForm)} size="sm"><Plus size={16} /> New Deck</Button>
      </div>

      {showForm && (
        <form onSubmit={handleCreate} className="bg-white dark:bg-[#161622] rounded-xl border border-gray-200 dark:border-[#2A2A40] p-5 mb-4 space-y-3">
          <Input label="Topic (AI will generate cards)" placeholder="e.g., Spanish vocabulary, Biology terms..." value={topic} onChange={e => setTopic(e.target.value)} />
          <Input label="Deck title (optional)" placeholder="Custom name for the deck" value={deckTitle} onChange={e => setDeckTitle(e.target.value)} />
          <div className="flex gap-2">
            <Button type="submit" loading={creating} size="sm"><Plus size={14} /> {topic ? 'Generate Cards' : 'Create Empty Deck'}</Button>
            <Button type="button" variant="ghost" size="sm" onClick={() => setShowForm(false)}>Cancel</Button>
          </div>
          {creating && <p className="text-xs text-gray-400">AI is generating flashcards...</p>}
        </form>
      )}

      {decks.length === 0 && !showForm ? (
        <div className="bg-white dark:bg-[#161622] rounded-xl border border-gray-200 dark:border-[#2A2A40] p-12 text-center">
          <Layers size={32} className="text-purple-500 mx-auto mb-3" />
          <p className="text-gray-500 dark:text-gray-400 mb-4">No flashcard decks yet. Create one to start studying.</p>
          <Button onClick={() => setShowForm(true)}><Plus size={16} /> Create Deck</Button>
        </div>
      ) : (
        <div className="space-y-2">
          {decks.map(deck => (
            <div
              key={deck.id}
              onClick={() => navigate(`/flashcards/${deck.id}`)}
              className="flex items-center gap-4 bg-white dark:bg-[#161622] rounded-xl border border-gray-200 dark:border-[#2A2A40] px-5 py-4 cursor-pointer hover:border-purple-300 dark:hover:border-purple-700 transition-colors group"
            >
              <div className="w-9 h-9 rounded-lg bg-purple-50 dark:bg-purple-900/20 flex items-center justify-center flex-shrink-0">
                <Layers size={16} className="text-purple-500" />
              </div>
              <div className="flex-1 min-w-0">
                <h3 className="text-sm font-medium text-gray-900 dark:text-gray-100 group-hover:text-purple-600 dark:group-hover:text-purple-400 transition-colors truncate">
                  {deck.title}
                </h3>
                <div className="flex items-center gap-2 mt-0.5 text-xs text-gray-400">
                  <span>{deck.cardCount} card{deck.cardCount !== 1 ? 's' : ''}</span>
                  {deck.dueCount > 0 && (
                    <span className="flex items-center gap-1 text-amber-500 font-medium">
                      <RotateCcw size={10} /> {deck.dueCount} due
                    </span>
                  )}
                </div>
              </div>
              <ArrowRight size={16} className="text-gray-300 group-hover:text-purple-500 transition-colors flex-shrink-0" />
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
