import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  ArrowLeft,
  ArrowRight,
  Brain,
  CalendarClock,
  FileText,
  Layers,
  Loader2,
  Plus,
  RotateCcw,
  Search,
  Share2,
  Sparkles,
  Trash2,
  TrendingUp,
} from 'lucide-react';
import {
  addCards,
  createDeck,
  deleteDeck,
  getDeck,
  listDecks,
  submitReview,
} from '../../../api/flashcards';
import {
  addNoteFlashcards,
  generateNoteFlashcards,
  getNoteFlashcards,
  listNotes,
  reviewNoteCard,
} from '../../../api/notes';
import { bust } from '../../../api/cache';
import { useWindowManagerOptional } from '../../../context/WindowManagerContext';
import { intervalLabel, isDue, sm2NextInterval } from '../../../utils/sm2';
import Button from '../../shared/Button';
import EmptyState from '../../shared/EmptyState';
import Input from '../../shared/Input';
import LoadingSpinner from '../../shared/LoadingSpinner';
import ShareDialog from '../../shared/ShareDialog';
import ViewFade from '../../shared/ViewFade';

const FILTERS = [
  { id: 'all', label: 'All' },
  { id: 'deck', label: 'Decks' },
  { id: 'note', label: 'From notes' },
];

// Full SM-2 quality scale. These are intentionally more expressive than a
// binary right/wrong choice: the quality changes both ease and next interval.
const RATINGS = [
  { quality: 1, key: '1', label: 'Again', tone: 'border-rose-400/30 bg-rose-500/[0.10] text-rose-200 hover:bg-rose-500/[0.18]' },
  { quality: 3, key: '2', label: 'Hard', tone: 'border-amber-400/30 bg-amber-500/[0.10] text-amber-200 hover:bg-amber-500/[0.18]' },
  { quality: 4, key: '3', label: 'Good', tone: 'border-blue-400/30 bg-blue-500/[0.10] text-blue-200 hover:bg-blue-500/[0.18]' },
  { quality: 5, key: '4', label: 'Easy', tone: 'border-emerald-400/30 bg-emerald-500/[0.10] text-emerald-200 hover:bg-emerald-500/[0.18]' },
];

function collectionKey(collection) {
  return collection ? `${collection.kind}:${collection.id}` : '';
}

function stageFor(card) {
  if (!card?.lastReviewed && !card?.reps) return { label: 'New', tone: 'text-sky-300 bg-sky-500/[0.10] border-sky-400/20' };
  if ((card?.reps || 0) < 2) return { label: 'Learning', tone: 'text-amber-300 bg-amber-500/[0.10] border-amber-400/20' };
  if ((card?.interval || 0) >= 21) return { label: 'Mature', tone: 'text-emerald-300 bg-emerald-500/[0.10] border-emerald-400/20' };
  return { label: 'Young', tone: 'text-blue-300 bg-blue-500/[0.10] border-blue-400/20' };
}

function dueText(card) {
  if (isDue(card)) return 'Due now';
  const due = new Date(card.nextDue || card.nextReview);
  const days = Math.max(1, Math.ceil((due.getTime() - Date.now()) / 86400000));
  return `Due in ${intervalLabel(days)}`;
}

function Metric({ icon: Icon, label, value, tone = 'text-white/55' }) {
  return (
    <div className="min-w-0 rounded-xl border border-white/[0.07] bg-white/[0.025] px-3 py-2.5">
      <div className="flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-[0.14em] text-white/30">
        <Icon size={11} className={tone} /> {label}
      </div>
      <div className="mt-1 text-[18px] font-semibold tabular-nums text-white/85">{value}</div>
    </div>
  );
}

export default function FlashcardsApp() {
  const windowManager = useWindowManagerOptional();
  const [view, setView] = useState('library');
  const [decks, setDecks] = useState([]);
  const [notes, setNotes] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [filter, setFilter] = useState('all');
  const [query, setQuery] = useState('');
  const [showCreate, setShowCreate] = useState(false);
  const [creating, setCreating] = useState(false);
  const [topic, setTopic] = useState('');
  const [deckTitle, setDeckTitle] = useState('');

  const [collection, setCollection] = useState(null);
  const [cards, setCards] = useState([]);
  const [collectionLoading, setCollectionLoading] = useState(false);
  const [collectionError, setCollectionError] = useState('');
  const [addMode, setAddMode] = useState(null);
  const [addTopic, setAddTopic] = useState('');
  const [manualFront, setManualFront] = useState('');
  const [manualBack, setManualBack] = useState('');
  const [adding, setAdding] = useState(false);
  const [shareTarget, setShareTarget] = useState(null);

  const [queueIds, setQueueIds] = useState([]);
  const [reviewIndex, setReviewIndex] = useState(0);
  const [flipped, setFlipped] = useState(false);
  const [grading, setGrading] = useState(false);

  const loadLibrary = useCallback(async () => {
    setError('');
    try {
      const [deckData, noteData] = await Promise.all([listDecks(), listNotes()]);
      setDecks(deckData.decks || []);
      setNotes(noteData.notes || []);
    } catch (e) {
      setError(e?.message || 'Could not load your flashcards.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { loadLibrary(); }, [loadLibrary]);

  const collections = useMemo(() => {
    const deckRows = decks.map(deck => ({ ...deck, kind: 'deck' }));
    const noteRows = notes.map(note => ({
      ...note,
      kind: 'note',
      cardCount: note.flashcardCount || 0,
      dueCount: note.flashcardDueCount || 0,
    }));
    const rows = filter === 'deck' ? deckRows
      : filter === 'note' ? noteRows
      : [...deckRows, ...noteRows.filter(note => note.cardCount > 0)];
    const needle = query.trim().toLowerCase();
    return needle ? rows.filter(row => row.title?.toLowerCase().includes(needle)) : rows;
  }, [decks, notes, filter, query]);

  const totalCards = decks.reduce((sum, deck) => sum + (deck.cardCount || 0), 0)
    + notes.reduce((sum, note) => sum + (note.flashcardCount || 0), 0);
  const totalDue = decks.reduce((sum, deck) => sum + (deck.dueCount || 0), 0)
    + notes.reduce((sum, note) => sum + (note.flashcardDueCount || 0), 0);
  const connectedNotes = notes.filter(note => (note.flashcardCount || 0) > 0).length;

  const openCollection = useCallback(async (nextCollection) => {
    setCollection(nextCollection);
    setCards([]);
    setCollectionError('');
    setCollectionLoading(true);
    setAddMode(null);
    setView('collection');
    try {
      const data = nextCollection.kind === 'note'
        ? await getNoteFlashcards(nextCollection.id)
        : await getDeck(nextCollection.id);
      setCards(nextCollection.kind === 'note' ? (data.cards || []) : (data.deck?.cards || []));
      if (nextCollection.kind === 'deck' && data.deck) {
        setCollection(current => ({ ...current, title: data.deck.title }));
      }
    } catch (e) {
      setCollectionError(e?.message || 'Could not open this collection.');
    } finally {
      setCollectionLoading(false);
    }
  }, []);

  async function handleCreate(event) {
    event.preventDefault();
    if (!topic.trim() && !deckTitle.trim()) return;
    setCreating(true);
    try {
      const data = await createDeck(deckTitle.trim() || topic.trim(), topic.trim() || null, 10, 'beginner');
      bust('flashcards:list');
      setTopic('');
      setDeckTitle('');
      setShowCreate(false);
      await loadLibrary();
      await openCollection({
        ...data.deck,
        kind: 'deck',
        cardCount: data.deck?.cards?.length || 0,
        dueCount: data.deck?.cards?.length || 0,
      });
    } catch (e) {
      setError(e?.message || 'Could not create the deck.');
    } finally {
      setCreating(false);
    }
  }

  function goLibrary() {
    setView('library');
    setCollection(null);
    setCards([]);
    setQueueIds([]);
    setReviewIndex(0);
    setFlipped(false);
    loadLibrary();
  }

  async function handleDeleteDeck() {
    if (!collection || collection.kind !== 'deck' || !confirm(`Delete “${collection.title}”?`)) return;
    try {
      await deleteDeck(collection.id);
      bust('flashcards:list');
      goLibrary();
    } catch (e) {
      setCollectionError(e?.message || 'Could not delete the deck.');
    }
  }

  async function handleAdd(event) {
    event.preventDefault();
    const isManual = addMode === 'manual';
    if (isManual && (!manualFront.trim() || !manualBack.trim())) return;
    if (!isManual && collection.kind === 'deck' && !addTopic.trim()) return;
    setAdding(true);
    setCollectionError('');
    try {
      let data;
      if (collection.kind === 'note') {
        data = isManual
          ? await addNoteFlashcards(collection.id, [{ front: manualFront.trim(), back: manualBack.trim() }])
          : await generateNoteFlashcards(collection.id, { count: 8 });
        setCards(data.flashcards || data.cards || []);
      } else {
        data = await addCards(collection.id, isManual
          ? { cards: [{ front: manualFront.trim(), back: manualBack.trim() }] }
          : { topic: addTopic.trim(), count: 10 });
        setCards(data.deck?.cards || []);
      }
      setManualFront('');
      setManualBack('');
      setAddTopic('');
      setAddMode(null);
      loadLibrary();
    } catch (e) {
      setCollectionError(e?.message || 'Could not add cards.');
    } finally {
      setAdding(false);
    }
  }

  function startReview() {
    const dueIds = cards.filter(isDue).map(card => card.id);
    if (!dueIds.length) return;
    setQueueIds(dueIds);
    setReviewIndex(0);
    setFlipped(false);
    setView('review');
  }

  const currentCard = useMemo(() => {
    const id = queueIds[reviewIndex];
    return cards.find(card => card.id === id) || null;
  }, [cards, queueIds, reviewIndex]);

  const handleGrade = useCallback(async (quality) => {
    if (!currentCard || !collection || grading) return;
    setGrading(true);
    setCollectionError('');
    try {
      const data = collection.kind === 'note'
        ? await reviewNoteCard(collection.id, currentCard.id, quality)
        : await submitReview(collection.id, currentCard.id, quality);
      if (data.card) {
        setCards(current => current.map(card => card.id === currentCard.id ? data.card : card));
      }
      setFlipped(false);
      if (reviewIndex + 1 < queueIds.length) {
        setReviewIndex(index => index + 1);
      } else {
        setView('collection');
        setQueueIds([]);
        setReviewIndex(0);
        loadLibrary();
      }
    } catch (e) {
      setCollectionError(e?.message || 'Could not save that review.');
    } finally {
      setGrading(false);
    }
  }, [collection, currentCard, grading, loadLibrary, queueIds.length, reviewIndex]);

  useEffect(() => {
    if (view !== 'review') return undefined;
    function onKeyDown(event) {
      if ((event.key === ' ' || event.key === 'Enter') && !flipped) {
        event.preventDefault();
        setFlipped(true);
        return;
      }
      if (!flipped || grading) return;
      const rating = RATINGS.find(item => item.key === event.key);
      if (rating) {
        event.preventDefault();
        handleGrade(rating.quality);
      }
    }
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [flipped, grading, handleGrade, view]);

  if (view === 'review') {
    const progress = queueIds.length ? (reviewIndex / queueIds.length) * 100 : 0;
    return (
      <ViewFade viewKey={`${collectionKey(collection)}:review`} className="flex h-full min-h-0 flex-col">
        <div className="mb-3 flex flex-shrink-0 items-center justify-between">
          <button
            type="button"
            onClick={() => { setView('collection'); setFlipped(false); }}
            className="inline-flex items-center gap-1.5 text-[12px] text-white/40 transition-colors hover:text-white/70"
          >
            <ArrowLeft size={14} /> {collection?.title}
          </button>
          <span className="font-mono text-[11px] tabular-nums text-white/35">{reviewIndex + 1} / {queueIds.length}</span>
        </div>

        <div className="mb-4 h-1 flex-shrink-0 overflow-hidden rounded-full bg-white/[0.07]">
          <div className="h-full rounded-full bg-blue-400 transition-[width] duration-300" style={{ width: `${progress}%` }} />
        </div>

        {collectionError && (
          <div role="alert" className="mb-3 rounded-lg border border-rose-400/20 bg-rose-500/[0.08] px-3 py-2 text-[12px] text-rose-200">
            {collectionError}
          </div>
        )}

        {currentCard ? (
          <div className="flex min-h-0 flex-1 flex-col">
            <div className="flex min-h-0 flex-1 items-center justify-center">
              <button
                type="button"
                onClick={() => setFlipped(value => !value)}
                className="h-full max-h-[330px] min-h-[210px] w-full max-w-2xl cursor-pointer text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-400/50"
                style={{ perspective: '1000px' }}
                aria-label={flipped ? 'Show question' : 'Reveal answer'}
              >
                <div
                  className="relative h-full w-full transition-transform duration-500 [transform-style:preserve-3d]"
                  style={{ transform: flipped ? 'rotateY(180deg)' : 'rotateY(0deg)' }}
                >
                  <div className="absolute inset-0 flex flex-col items-center justify-center overflow-auto rounded-2xl border border-white/[0.10] bg-white/[0.035] p-8 text-center [backface-visibility:hidden]">
                    <span className="mb-3 text-[10px] font-bold uppercase tracking-[0.16em] text-white/30">Prompt</span>
                    <p className="text-[18px] font-medium leading-relaxed text-white/90">{currentCard.front}</p>
                  </div>
                  <div className="absolute inset-0 flex flex-col items-center justify-center overflow-auto rounded-2xl border border-blue-400/20 bg-blue-500/[0.06] p-8 text-center [backface-visibility:hidden] [transform:rotateY(180deg)]">
                    <span className="mb-3 text-[10px] font-bold uppercase tracking-[0.16em] text-blue-200/45">Answer</span>
                    <p className="text-[17px] leading-relaxed text-white/85">{currentCard.back}</p>
                  </div>
                </div>
              </button>
            </div>

            <div className="mx-auto mt-4 w-full max-w-2xl flex-shrink-0">
              {!flipped ? (
                <p className="text-center text-[11px] text-white/30">Click the card or press Space to reveal</p>
              ) : (
                <>
                  <p className="mb-2 text-center text-[11px] text-white/35">How clearly did you recall it?</p>
                  <div className="grid grid-cols-4 gap-2">
                    {RATINGS.map(rating => (
                      <button
                        key={rating.quality}
                        type="button"
                        disabled={grading}
                        onClick={() => handleGrade(rating.quality)}
                        className={`rounded-xl border px-2 py-2.5 text-center transition-colors disabled:opacity-45 ${rating.tone}`}
                      >
                        <span className="block text-[12px] font-semibold">{rating.label}</span>
                        <span className="mt-0.5 block font-mono text-[10px] opacity-65">{intervalLabel(sm2NextInterval(currentCard, rating.quality))}</span>
                      </button>
                    ))}
                  </div>
                  <p className="mt-2 text-center font-mono text-[10px] text-white/20">Keys 1 · 2 · 3 · 4</p>
                </>
              )}
            </div>
          </div>
        ) : (
          <EmptyState icon={Brain} title="Review complete" body="Your schedule is saved." action={<Button size="sm" onClick={() => setView('collection')}>Back to collection</Button>} className="flex-1" />
        )}
      </ViewFade>
    );
  }

  if (view === 'collection' && collection) {
    const dueCards = cards.filter(isDue);
    const matureCards = cards.filter(card => (card.interval || 0) >= 21).length;
    return (
      <ViewFade viewKey={collectionKey(collection)} className="flex h-full min-h-0 flex-col">
        <div className="mb-3 flex flex-shrink-0 items-center justify-between gap-3">
          <button type="button" onClick={goLibrary} className="inline-flex items-center gap-1.5 text-[12px] text-white/40 transition-colors hover:text-white/70">
            <ArrowLeft size={14} /> Library
          </button>
          <div className="flex items-center gap-1">
            {collection.kind === 'note' ? (
              <Button
                size="sm"
                variant="ghost"
                onClick={() => {
                  if (windowManager) {
                    windowManager.openApp('notes', 'Notes', { initialNoteId: collection.id });
                  } else {
                    window.location.assign(`/notes/${collection.id}`);
                  }
                }}
              >
                <FileText size={13} /> Open note
              </Button>
            ) : (
              <>
                <button
                  type="button"
                  aria-label="Share deck"
                  onClick={() => setShareTarget({ id: collection.id, type: 'flashcardDeck', title: collection.title })}
                  className="rounded-lg p-2 text-white/30 transition-colors hover:bg-white/[0.05] hover:text-blue-300"
                >
                  <Share2 size={14} />
                </button>
                <button
                  type="button"
                  aria-label="Delete deck"
                  onClick={handleDeleteDeck}
                  className="rounded-lg p-2 text-white/30 transition-colors hover:bg-rose-500/[0.08] hover:text-rose-300"
                >
                  <Trash2 size={14} />
                </button>
              </>
            )}
          </div>
        </div>

        {shareTarget && <ShareDialog item={shareTarget} onClose={() => setShareTarget(null)} />}

        <div className="mb-4 flex flex-shrink-0 items-end justify-between gap-4">
          <div className="min-w-0">
            <div className="mb-1 flex items-center gap-2 text-[10px] font-bold uppercase tracking-[0.16em] text-white/30">
              {collection.kind === 'note' ? <><FileText size={11} className="text-emerald-300/70" /> Connected note</> : <><Layers size={11} className="text-violet-300/70" /> Deck</>}
            </div>
            <h1 className="truncate text-[20px] font-semibold text-white/90">{collection.title || 'Untitled'}</h1>
          </div>
          <div className="flex flex-shrink-0 gap-2">
            <Button size="sm" onClick={startReview} disabled={!dueCards.length}>
              <RotateCcw size={14} /> Review {dueCards.length || ''}
            </Button>
            <Button size="sm" variant="secondary" onClick={() => setAddMode(addMode ? null : (collection.kind === 'note' ? 'generate' : 'manual'))}>
              <Plus size={14} /> Add cards
            </Button>
          </div>
        </div>

        <div className="mb-4 grid flex-shrink-0 grid-cols-3 gap-2">
          <Metric icon={Layers} label="Cards" value={cards.length} tone="text-violet-300" />
          <Metric icon={CalendarClock} label="Due" value={dueCards.length} tone="text-blue-300" />
          <Metric icon={TrendingUp} label="Mature" value={matureCards} tone="text-emerald-300" />
        </div>

        {collectionError && (
          <div role="alert" className="mb-3 flex-shrink-0 rounded-lg border border-rose-400/20 bg-rose-500/[0.08] px-3 py-2 text-[12px] text-rose-200">
            {collectionError}
          </div>
        )}

        {addMode && (
          <form onSubmit={handleAdd} className="mb-4 flex-shrink-0 rounded-xl border border-white/[0.08] bg-white/[0.03] p-4">
            <div className="mb-3 flex items-center justify-between gap-3">
              <div>
                <h2 className="text-[13px] font-semibold text-white/85">Add to {collection.title}</h2>
                <p className="mt-0.5 text-[11px] text-white/35">{collection.kind === 'note' ? 'Generate directly from the note or write one card.' : 'Write a card or generate a set by topic.'}</p>
              </div>
              <div className="flex rounded-lg border border-white/[0.08] bg-black/10 p-0.5">
                {[
                  { id: 'manual', label: 'Manual' },
                  { id: 'generate', label: collection.kind === 'note' ? 'From note' : 'AI set' },
                ].map(option => (
                  <button
                    key={option.id}
                    type="button"
                    onClick={() => setAddMode(option.id)}
                    className={`rounded-md px-2.5 py-1 text-[11px] font-medium transition-colors ${addMode === option.id ? 'bg-white/[0.10] text-white/80' : 'text-white/35 hover:text-white/60'}`}
                  >
                    {option.label}
                  </button>
                ))}
              </div>
            </div>
            {addMode === 'manual' ? (
              <div className="grid grid-cols-2 gap-2">
                <Input aria-label="Card front" placeholder="Question or prompt" value={manualFront} onChange={event => setManualFront(event.target.value)} />
                <Input aria-label="Card back" placeholder="Answer" value={manualBack} onChange={event => setManualBack(event.target.value)} />
              </div>
            ) : collection.kind === 'deck' ? (
              <Input aria-label="Generation topic" placeholder="Topic for 10 new cards" value={addTopic} onChange={event => setAddTopic(event.target.value)} />
            ) : (
              <div className="rounded-lg border border-emerald-400/15 bg-emerald-500/[0.06] px-3 py-2 text-[12px] text-emerald-100/65">
                AI will create up to 8 focused cards from the current note and its known weak spots.
              </div>
            )}
            <div className="mt-3 flex gap-2">
              <Button type="submit" size="sm" loading={adding}>
                {adding ? <Loader2 size={13} className="animate-spin" /> : addMode === 'generate' ? <Sparkles size={13} /> : <Plus size={13} />}
                {addMode === 'generate' ? 'Generate cards' : 'Add card'}
              </Button>
              <Button type="button" size="sm" variant="ghost" onClick={() => setAddMode(null)}>Cancel</Button>
            </div>
          </form>
        )}

        {collectionLoading ? (
          <div className="flex flex-1 items-center justify-center"><LoadingSpinner size={24} /></div>
        ) : cards.length === 0 ? (
          <EmptyState
            icon={collection.kind === 'note' ? FileText : Layers}
            title={collection.kind === 'note' ? 'Turn this note into memory' : 'This deck is empty'}
            body={collection.kind === 'note' ? 'Generate a focused set from the note, then SM-2 will build a review schedule from your answers.' : 'Add a card manually or generate a set by topic.'}
            action={<Button size="sm" onClick={() => setAddMode('generate')}><Sparkles size={14} /> {collection.kind === 'note' ? 'Generate from note' : 'Generate a set'}</Button>}
            className="flex-1"
          />
        ) : (
          <div className="min-h-0 flex-1 overflow-y-auto pr-1">
            <div className="mb-2 flex items-center justify-between px-1">
              <span className="text-[10px] font-bold uppercase tracking-[0.16em] text-white/30">Card schedule</span>
              <span className="text-[10px] text-white/25">Ease · interval · repetitions</span>
            </div>
            <div className="space-y-1.5">
              {cards.map(card => {
                const stage = stageFor(card);
                return (
                  <div key={card.id} className="rounded-xl border border-white/[0.06] bg-white/[0.025] px-4 py-3 transition-colors hover:border-white/[0.11] hover:bg-white/[0.04]">
                    <div className="flex items-start gap-3">
                      <div className="min-w-0 flex-1">
                        <p className="text-[13px] font-medium leading-snug text-white/82">{card.front}</p>
                        <p className="mt-1.5 line-clamp-2 text-[12px] leading-relaxed text-white/42">{card.back}</p>
                      </div>
                      <div className="flex flex-shrink-0 flex-col items-end gap-1.5">
                        <span className={`rounded-md border px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-[0.1em] ${stage.tone}`}>{stage.label}</span>
                        <span className={`text-[10px] ${isDue(card) ? 'font-medium text-blue-300' : 'text-white/30'}`}>{dueText(card)}</span>
                      </div>
                    </div>
                    <div className="mt-2.5 flex gap-3 border-t border-white/[0.05] pt-2 font-mono text-[10px] tabular-nums text-white/28">
                      <span>ease {Number(card.ease || 2.5).toFixed(2)}</span>
                      <span>interval {intervalLabel(card.interval || 0)}</span>
                      <span>{card.reps || 0} reps</span>
                      {(card.lapses || 0) > 0 && <span className="text-rose-300/55">{card.lapses} lapse{card.lapses === 1 ? '' : 's'}</span>}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}
      </ViewFade>
    );
  }

  if (loading) return <div className="flex h-full items-center justify-center"><LoadingSpinner size={26} /></div>;

  return (
    <ViewFade viewKey="library" className="flex h-full min-h-0 flex-col">
      <div className="mb-4 flex flex-shrink-0 items-center justify-between gap-4">
        <div>
          <div className="mb-1 flex items-center gap-2 text-[10px] font-bold uppercase tracking-[0.17em] text-violet-300/60">
            <Brain size={12} /> Spaced repetition
          </div>
          <h1 className="text-[21px] font-semibold text-white/92">Flashcards</h1>
          <p className="mt-0.5 text-[12px] text-white/38">Decks and connected notes in one place.</p>
        </div>
        <Button size="sm" onClick={() => setShowCreate(value => !value)}><Plus size={14} /> New deck</Button>
      </div>

      <div className="mb-4 grid flex-shrink-0 grid-cols-3 gap-2">
        <Metric icon={Layers} label="Cards" value={totalCards} tone="text-violet-300" />
        <Metric icon={CalendarClock} label="Due today" value={totalDue} tone="text-blue-300" />
        <Metric icon={FileText} label="Connected notes" value={connectedNotes} tone="text-emerald-300" />
      </div>

      {error && (
        <div role="alert" className="mb-3 flex-shrink-0 rounded-lg border border-rose-400/20 bg-rose-500/[0.08] px-3 py-2 text-[12px] text-rose-200">
          {error}
        </div>
      )}

      {showCreate && (
        <form onSubmit={handleCreate} className="mb-4 flex-shrink-0 rounded-xl border border-white/[0.08] bg-white/[0.03] p-4">
          <div className="mb-3">
            <h2 className="text-[13px] font-semibold text-white/85">Create a deck</h2>
            <p className="mt-0.5 text-[11px] text-white/35">Add a topic to generate 10 cards, or leave it blank for an empty deck.</p>
          </div>
          <div className="grid grid-cols-2 gap-2">
            <Input aria-label="Deck title" placeholder="Deck title" value={deckTitle} onChange={event => setDeckTitle(event.target.value)} />
            <Input aria-label="Deck topic" placeholder="Generation topic (optional)" value={topic} onChange={event => setTopic(event.target.value)} />
          </div>
          <div className="mt-3 flex gap-2">
            <Button type="submit" size="sm" loading={creating} disabled={!topic.trim() && !deckTitle.trim()}>
              {creating ? <Loader2 size={13} className="animate-spin" /> : topic.trim() ? <Sparkles size={13} /> : <Plus size={13} />}
              {topic.trim() ? 'Generate deck' : 'Create deck'}
            </Button>
            <Button type="button" size="sm" variant="ghost" onClick={() => setShowCreate(false)}>Cancel</Button>
          </div>
        </form>
      )}

      <div className="mb-3 flex flex-shrink-0 items-center gap-2">
        <div className="flex rounded-lg border border-white/[0.07] bg-white/[0.025] p-0.5">
          {FILTERS.map(item => (
            <button
              key={item.id}
              type="button"
              onClick={() => setFilter(item.id)}
              className={`rounded-md px-3 py-1.5 text-[11px] font-medium transition-colors ${filter === item.id ? 'bg-blue-500/[0.16] text-blue-100' : 'text-white/35 hover:text-white/60'}`}
            >
              {item.label}
            </button>
          ))}
        </div>
        <label className="relative min-w-0 flex-1">
          <Search size={13} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-white/25" />
          <span className="sr-only">Search collections</span>
          <input
            value={query}
            onChange={event => setQuery(event.target.value)}
            placeholder="Search decks and notes"
            className="h-8 w-full rounded-lg border border-white/[0.07] bg-white/[0.025] pl-8 pr-3 text-[12px] text-white/80 outline-none placeholder:text-white/25 focus:border-blue-400/35 focus:bg-blue-500/[0.04]"
          />
        </label>
      </div>

      {collections.length === 0 ? (
        <EmptyState
          icon={filter === 'note' ? FileText : Layers}
          title={query ? 'No matching collections' : filter === 'note' ? 'No notes yet' : 'No flashcards yet'}
          body={filter === 'note' ? 'Your notes appear here automatically. Open one to generate its first connected cards.' : 'Create a deck or connect an existing note to start reviewing with SM-2.'}
          action={!query && filter !== 'note' ? <Button size="sm" onClick={() => setShowCreate(true)}><Plus size={14} /> New deck</Button> : undefined}
          className="flex-1"
        />
      ) : (
        <div className="min-h-0 flex-1 overflow-y-auto pr-1">
          {filter === 'note' && (
            <div className="mb-2 rounded-lg border border-emerald-400/15 bg-emerald-500/[0.05] px-3 py-2 text-[11px] leading-relaxed text-emerald-100/55">
              Every note is available here. Opening one creates a live connection—new cards remain attached to that note.
            </div>
          )}
          <div className="space-y-1.5">
            {collections.map(item => (
              <button
                key={collectionKey(item)}
                type="button"
                onClick={() => openCollection(item)}
                className="group flex w-full items-center gap-3 rounded-xl border border-white/[0.06] bg-white/[0.025] px-3.5 py-3 text-left transition-colors hover:border-white/[0.13] hover:bg-white/[0.05]"
              >
                <div className={`flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-lg border ${item.kind === 'note' ? 'border-emerald-400/15 bg-emerald-500/[0.08] text-emerald-300' : 'border-violet-400/15 bg-violet-500/[0.08] text-violet-300'}`}>
                  {item.kind === 'note' ? <FileText size={15} /> : <Layers size={15} />}
                </div>
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <p className="truncate text-[13px] font-semibold text-white/82 group-hover:text-white/92">{item.title || 'Untitled'}</p>
                    {item.kind === 'note' && <span className="rounded border border-emerald-400/15 bg-emerald-500/[0.07] px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-[0.1em] text-emerald-300/70">Note</span>}
                  </div>
                  <p className="mt-0.5 text-[11px] text-white/30">
                    {item.cardCount || 0} card{item.cardCount === 1 ? '' : 's'}
                    {(item.dueCount || 0) > 0 ? <span className="font-medium text-blue-300/80"> · {item.dueCount} due</span> : item.cardCount > 0 ? ' · caught up' : ' · ready to connect'}
                  </p>
                </div>
                <ArrowRight size={14} className="flex-shrink-0 text-white/18 transition-colors group-hover:text-white/45" />
              </button>
            ))}
          </div>
        </div>
      )}
    </ViewFade>
  );
}
