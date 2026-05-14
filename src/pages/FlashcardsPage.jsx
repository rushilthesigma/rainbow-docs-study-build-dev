import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { Layers, Plus, ArrowRight, RotateCcw } from 'lucide-react';
import { listDecks, createDeck } from '../api/flashcards';
import Button from '../components/shared/Button';
import Input from '../components/shared/Input';
import LoadingSpinner from '../components/shared/LoadingSpinner';

const card = 'rounded-xl border border-white/[0.07] bg-white/[0.03] backdrop-blur-sm';

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
          <div className="w-10 h-10 rounded-lg bg-white/[0.06] border border-white/[0.09] flex items-center justify-center">
            <Layers size={20} className="text-white/40" />
          </div>
          <div>
            <h1 className="text-[20px] font-bold text-white/90">Flashcards</h1>
            <p className="text-[13px] text-white/40">{decks.length} deck{decks.length !== 1 ? 's' : ''}</p>
          </div>
        </div>
        <Button onClick={() => setShowForm(!showForm)} size="sm"><Plus size={16} /> New</Button>
      </div>

      {showForm && (
        <form onSubmit={handleCreate} className={`${card} p-5 mb-4 space-y-3`}>
          <Input label="Topic" placeholder="AI generates cards from this" value={topic} onChange={e => setTopic(e.target.value)} />
          <Input label="Title (optional)" placeholder="Custom name" value={deckTitle} onChange={e => setDeckTitle(e.target.value)} />
          <div className="flex gap-2">
            <Button type="submit" loading={creating} size="sm"><Plus size={14} /> {topic ? 'Generate' : 'Create empty'}</Button>
            <Button type="button" variant="ghost" size="sm" onClick={() => setShowForm(false)}>Cancel</Button>
          </div>
          {creating && <p className="text-[12px] text-white/35">Generating…</p>}
        </form>
      )}

      {decks.length === 0 && !showForm ? (
        <div className={`${card} p-12 text-center`}>
          <Layers size={28} className="text-white/20 mx-auto mb-3" />
          <p className="text-[13px] text-white/35 mb-4">No decks yet</p>
          <Button onClick={() => setShowForm(true)}><Plus size={16} /> New deck</Button>
        </div>
      ) : (
        <div className="space-y-2">
          {decks.map(deck => (
            <div
              key={deck.id}
              onClick={() => navigate(`/flashcards/${deck.id}`)}
              className="flex items-center gap-4 rounded-xl border border-white/[0.07] bg-white/[0.03] hover:border-white/[0.16] hover:bg-white/[0.06] backdrop-blur-sm px-5 py-4 cursor-pointer transition-all group"
            >
              <div className="w-9 h-9 rounded-lg bg-white/[0.07] border border-white/[0.09] flex items-center justify-center flex-shrink-0">
                <Layers size={16} className="text-white/45" />
              </div>
              <div className="flex-1 min-w-0">
                <h3 className="text-[13px] font-semibold text-white/80 group-hover:text-white/95 transition-colors truncate">
                  {deck.title}
                </h3>
                <div className="flex items-center gap-2 mt-0.5 text-[12px] text-white/35">
                  <span>{deck.cardCount} card{deck.cardCount !== 1 ? 's' : ''}</span>
                  {deck.dueCount > 0 && (
                    <span className="flex items-center gap-1 text-white/55 font-medium">
                      <RotateCcw size={10} /> {deck.dueCount} due
                    </span>
                  )}
                </div>
              </div>
              <ArrowRight size={16} className="text-white/25 group-hover:text-white/55 transition-colors flex-shrink-0" />
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
