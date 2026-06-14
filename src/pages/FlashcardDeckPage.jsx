import { useState, useEffect, useCallback } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { ArrowLeft, RotateCcw, Plus, Trash2, ListChecks } from 'lucide-react';
import { getDeck, deleteDeck, submitReview, addCards } from '../api/flashcards';
import { isDue, intervalLabel, sm2NextInterval } from '../utils/sm2';
import Button from '../components/shared/Button';
import Input from '../components/shared/Input';
import LoadingSpinner from '../components/shared/LoadingSpinner';

// SM-2 rating buttons shown after flipping a card.
// quality maps to: 1=forgot, 3=hard, 4=good, 5=easy
const RATINGS = [
  { quality: 1, label: 'Forgot',  key: '1', cls: 'border-rose-500/40 bg-rose-500/10 text-rose-300 hover:bg-rose-500/20' },
  { quality: 3, label: 'Hard',    key: '2', cls: 'border-amber-500/40 bg-amber-500/10 text-amber-300 hover:bg-amber-500/20' },
  { quality: 4, label: 'Good',    key: '3', cls: 'border-blue-500/40 bg-blue-500/10 text-blue-300 hover:bg-blue-500/20' },
  { quality: 5, label: 'Easy',    key: '4', cls: 'border-emerald-500/40 bg-emerald-500/10 text-emerald-300 hover:bg-emerald-500/20' },
];

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
  const [quizQuestions, setQuizQuestions] = useState([]);
  const [quizIndex, setQuizIndex] = useState(0);
  const [quizSelected, setQuizSelected] = useState(null);
  const [quizConfirmed, setQuizConfirmed] = useState(false);
  const [quizScore, setQuizScore] = useState(0);

  useEffect(() => {
    getDeck(id).then(d => { setDeck(d.deck); setLoading(false); }).catch(() => setLoading(false));
  }, [id]);

  // Supports both legacy `nextReview` and SM-2 `nextDue` fields.
  const dueCards = (deck?.cards || []).filter(isDue);
  const reviewCards = mode === 'review' ? dueCards : [];
  const currentCard = reviewCards[reviewIndex];

  function doFlip() {
    if (flipping) return;
    setFlipping(true);
    setFlipped(f => !f);
    setTimeout(() => setFlipping(false), 300);
  }

  const handleReview = useCallback(async (quality) => {
    if (!currentCard) return;
    try {
      const data = await submitReview(id, currentCard.id, quality);
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
      if (e.key === ' ' || e.key === 'Enter') { e.preventDefault(); if (!flipped) doFlip(); }
      if (flipped) {
        if (e.key === '1') handleReview(1);
        if (e.key === '2') handleReview(3);
        if (e.key === '3') handleReview(4);
        if (e.key === '4') handleReview(5);
        // arrow shortcuts: left=forgot, right=easy
        if (e.key === 'ArrowLeft') handleReview(1);
        if (e.key === 'ArrowRight') handleReview(5);
      }
    }
    window.addEventListener('keydown', handleKey);
    return () => window.removeEventListener('keydown', handleKey);
  }, [mode, flipped, handleReview]);

  function startQuiz() {
    const cards = deck?.cards || [];
    if (cards.length < 4) return;
    const shuffled = [...cards].sort(() => Math.random() - 0.5);
    const questions = shuffled.map(card => {
      const others = cards.filter(c => c.id !== card.id);
      const distractors = [...others].sort(() => Math.random() - 0.5).slice(0, 3).map(c => c.back);
      const choices = [...distractors, card.back].sort(() => Math.random() - 0.5);
      return { question: card.front, answer: card.back, choices };
    });
    setQuizQuestions(questions);
    setQuizIndex(0);
    setQuizSelected(null);
    setQuizConfirmed(false);
    setQuizScore(0);
    setMode('quiz');
  }

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
      <p className="text-sm text-gray-500 dark:text-gray-400 mb-6">
        {deck.cards?.length || 0} cards
        {dueCards.length > 0
          ? <> &middot; <span className="text-blue-400 font-medium">{dueCards.length} recommended for review</span></>
          : ' · all caught up'}
      </p>

      {mode === 'browse' && (
        <div className="flex gap-2 mb-6">
          <Button onClick={() => { setMode('review'); setReviewIndex(0); setFlipped(false); }} disabled={dueCards.length === 0}>
            <RotateCcw size={16} /> Review ({dueCards.length})
          </Button>
          <Button variant="secondary" onClick={startQuiz} disabled={(deck?.cards?.length || 0) < 4} title={(deck?.cards?.length || 0) < 4 ? 'Add at least 4 cards to quiz' : undefined}>
            <ListChecks size={16} /> Quiz
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
            <button onClick={() => { setMode('browse'); setReviewIndex(0); setFlipped(false); }} className="hover:text-gray-600 dark:hover:text-gray-300">Exit</button>
          </div>

          <div className="w-full h-1.5 bg-gray-200 dark:bg-[#2A2A40] rounded-full overflow-hidden">
            <div className="h-full bg-blue-500 rounded-full transition-all duration-300" style={{ width: `${reviewProgress}%` }} />
          </div>

          {/* 3D flip card */}
          <div onClick={doFlip} className="cursor-pointer" style={{ perspective: '1000px' }}>
            <div
              className="relative w-full h-[240px] transition-transform duration-500 ease-in-out"
              style={{ transformStyle: 'preserve-3d', transform: flipped ? 'rotateY(180deg)' : 'rotateY(0deg)' }}
            >
              <div
                className="absolute inset-0 bg-white dark:bg-[#161622] rounded-2xl border border-gray-200 dark:border-[#2A2A40] p-8 flex items-center justify-center shadow-lg overflow-auto"
                style={{ backfaceVisibility: 'hidden' }}
              >
                <p className="text-center text-lg font-medium text-gray-900 dark:text-gray-100">{currentCard.front}</p>
              </div>
              <div
                className="absolute inset-0 bg-gradient-to-br from-blue-50 to-purple-50 dark:from-[#161622] dark:to-[#1a1a30] rounded-2xl border border-blue-200 dark:border-blue-900/30 p-8 flex items-center justify-center shadow-lg overflow-auto"
                style={{ backfaceVisibility: 'hidden', transform: 'rotateY(180deg)' }}
              >
                <p className="text-center text-lg text-gray-800 dark:text-gray-200">{currentCard.back}</p>
              </div>
            </div>
          </div>

          {!flipped && (
            <p className="text-center text-xs text-gray-400">Click or press Space to reveal</p>
          )}

          {flipped && (
            <div>
              <p className="text-center text-[11px] text-white/35 mb-2">How well did you know this?</p>
              <div className="grid grid-cols-4 gap-2">
                {RATINGS.map(r => {
                  const nextDays = sm2NextInterval(currentCard, r.quality);
                  return (
                    <button
                      key={r.quality}
                      onClick={() => handleReview(r.quality)}
                      className={`flex flex-col items-center gap-1 px-3 py-2.5 rounded-xl border text-sm font-semibold transition-colors ${r.cls}`}
                    >
                      <span>{r.label}</span>
                      <span className="text-[10px] font-normal opacity-70">{intervalLabel(nextDays)}</span>
                    </button>
                  );
                })}
              </div>
              <p className="text-center text-[10px] text-white/25 mt-2">Keys: 1 · 2 · 3 · 4</p>
            </div>
          )}
        </div>
      )}

      {mode === 'review' && !currentCard && (
        <div className="text-center py-12">
          <p className="text-gray-500 mb-4">All done! No more cards recommended for today.</p>
          <Button onClick={() => setMode('browse')}>Back to Deck</Button>
        </div>
      )}

      {/* Quiz mode */}
      {mode === 'quiz' && quizIndex < quizQuestions.length && (
        <div className="space-y-4">
          <div className="flex items-center justify-between text-sm text-gray-400 mb-2">
            <span>{quizIndex + 1} / {quizQuestions.length}</span>
            <button onClick={() => setMode('browse')} className="hover:text-gray-600 dark:hover:text-gray-300">Exit</button>
          </div>

          <div className="w-full h-1.5 bg-gray-200 dark:bg-[#2A2A40] rounded-full overflow-hidden">
            <div className="h-full bg-blue-500 rounded-full transition-all duration-300" style={{ width: `${(quizIndex / quizQuestions.length) * 100}%` }} />
          </div>

          <div className="flex justify-end">
            <span className="text-xs text-white/40 tabular-nums">{quizScore} correct</span>
          </div>

          <div className="bg-white dark:bg-[#161622] rounded-2xl border border-gray-200 dark:border-[#2A2A40] p-8 text-center min-h-[120px] flex items-center justify-center">
            <p className="text-lg font-medium text-gray-900 dark:text-gray-100">{quizQuestions[quizIndex]?.question}</p>
          </div>

          <div className="space-y-2">
            {(quizQuestions[quizIndex]?.choices || []).map((choice, i) => {
              const isCorrect = choice === quizQuestions[quizIndex]?.answer;
              const isSelected = choice === quizSelected;
              let cls = 'w-full p-3.5 rounded-xl border text-sm font-medium transition-colors text-left';
              if (!quizConfirmed) {
                cls += isSelected
                  ? ' border-blue-500/60 bg-blue-500/10 text-blue-300'
                  : ' border-gray-200 dark:border-[#2A2A40] bg-white dark:bg-[#161622] text-gray-700 dark:text-gray-300 hover:border-blue-400/40 hover:bg-blue-500/5 cursor-pointer';
              } else {
                if (isCorrect) cls += ' border-emerald-500/50 bg-emerald-500/10 text-emerald-300';
                else if (isSelected) cls += ' border-rose-500/50 bg-rose-500/10 text-rose-300';
                else cls += ' border-gray-200 dark:border-[#2A2A40] bg-white dark:bg-[#161622] text-gray-500 opacity-50';
              }
              return (
                <button key={i} disabled={quizConfirmed} onClick={() => setQuizSelected(choice)} className={cls}>
                  {choice}
                </button>
              );
            })}
          </div>

          {quizSelected && !quizConfirmed && (
            <Button onClick={() => {
              if (quizSelected === quizQuestions[quizIndex]?.answer) setQuizScore(s => s + 1);
              setQuizConfirmed(true);
            }}>
              Confirm
            </Button>
          )}

          {quizConfirmed && (
            <Button onClick={() => {
              if (quizIndex + 1 < quizQuestions.length) {
                setQuizIndex(i => i + 1);
                setQuizSelected(null);
                setQuizConfirmed(false);
              } else {
                setMode('quiz-done');
              }
            }}>
              {quizIndex + 1 < quizQuestions.length ? 'Next Question' : 'See Results'}
            </Button>
          )}
        </div>
      )}

      {/* Quiz results */}
      {mode === 'quiz-done' && (
        <div className="text-center py-12 space-y-5">
          <p className="text-4xl font-bold text-gray-900 dark:text-white">{quizScore}/{quizQuestions.length}</p>
          <p className="text-sm text-gray-500 dark:text-gray-400">
            {quizScore === quizQuestions.length
              ? 'Perfect score!'
              : `${Math.round((quizScore / quizQuestions.length) * 100)}% correct`}
          </p>
          <div className="flex justify-center gap-2">
            <Button onClick={startQuiz}>Try Again</Button>
            <Button variant="secondary" onClick={() => setMode('browse')}>Back to Deck</Button>
          </div>
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
          {(deck.cards || []).map((card) => {
            const due = isDue(card);
            return (
              <div key={card.id} className="bg-white dark:bg-[#161622] rounded-xl border border-gray-200 dark:border-[#2A2A40] p-4 hover:shadow-sm transition-shadow">
                <div className="flex items-start justify-between gap-3">
                  <p className="text-sm font-medium text-gray-900 dark:text-gray-100">{card.front}</p>
                  {due && (
                    <span className="flex-shrink-0 text-[10px] font-semibold px-1.5 py-0.5 rounded-full border border-blue-500/30 bg-blue-500/10 text-blue-300">
                      due
                    </span>
                  )}
                </div>
                <div className="w-full h-px bg-gray-100 dark:bg-[#2A2A40] my-2" />
                <div className="flex items-end justify-between gap-2">
                  <p className="text-xs text-gray-500 dark:text-gray-400">{card.back}</p>
                  {card.reps > 0 && (
                    <span className="flex-shrink-0 text-[10px] text-white/30 tabular-nums">
                      ×{card.reps}
                    </span>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
