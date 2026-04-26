import { useState, useRef, useCallback, useEffect } from 'react';
import { MessageSquare, BookOpen, Layers, FileText, MoreHorizontal, Target, ClipboardCheck, PenTool, Swords, Users, GraduationCap, Settings, ArrowLeft, Moon, Sun, Send, Plus, ChevronRight, Trash2, RotateCcw, Check, X, History, Search, LogOut, Loader2 } from 'lucide-react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { useAuth } from '../../context/AuthContext';
import { apiFetch } from '../../api/client';
import { listCurricula, generateCurriculum, getCurriculum, sendStudyMessage, sendLessonMessage, getLessonHistory, listStudySessions, getStudySession } from '../../api/curriculum';
import { listGoals, createGoal } from '../../api/goals';
import { listDecks, createDeck, getDeck, submitReview, addCards } from '../../api/flashcards';
import { listNotes, createNote, getNote, updateNote, deleteNote } from '../../api/notes';
import { generateAssessment, gradeAssessment, getAssessmentHistory } from '../../api/assessments';
import { DEFAULT_SETTINGS, DIFFICULTY_OPTIONS, LEARNING_STYLE_OPTIONS } from '../../utils/constants';
import GoalsPage from '../../pages/GoalsPage';
import AssessmentsPage from '../../pages/AssessmentsPage';
import MathPracticePage from '../../pages/MathPracticePage';
import SettingsPage from '../../pages/SettingsPage';
import SocialApp from '../desktop/apps/SocialApp';
import TextbookApp from '../desktop/apps/TextbookApp';
import Button from '../shared/Button';
import Input from '../shared/Input';
import PillGroup from '../shared/PillGroup';
import Toggle from '../shared/Toggle';
import LoadingSpinner from '../shared/LoadingSpinner';

// ============ MOBILE STUDY MODE ============
function MobileStudy() {
  const [messages, setMessages] = useState([]);
  const [input, setInput] = useState('');
  const [streaming, setStreaming] = useState(false);
  const [sessionId, setSessionId] = useState(null);
  const [showHistory, setShowHistory] = useState(false);
  const [sessions, setSessions] = useState([]);
  const scrollRef = useRef(null);
  const streamRef = useRef('');
  const [streamContent, setStreamContent] = useState('');

  useEffect(() => { if (scrollRef.current) scrollRef.current.scrollTop = scrollRef.current.scrollHeight; }, [messages, streamContent]);

  function doSend(text) {
    const userMsg = { role: 'user', content: text, timestamp: new Date().toISOString() };
    setMessages(prev => [...prev, userMsg]);
    setStreaming(true);
    setStreamContent('');
    streamRef.current = '';
    sendStudyMessage(text, sessionId, {}, {
      onChunk: c => { streamRef.current += c; setStreamContent(streamRef.current); },
      onMeta: d => { if (d.sessionId) setSessionId(d.sessionId); },
      onDone: () => {
        const final = streamRef.current;
        streamRef.current = '';
        setStreamContent('');
        if (final) setMessages(m => [...m, { role: 'assistant', content: final, timestamp: new Date().toISOString() }]);
        setStreaming(false);
      },
      onError: err => { setMessages(m => [...m, { role: 'assistant', content: `Error: ${err}` }]); setStreamContent(''); setStreaming(false); },
    });
  }

  function handleSend(e) { e.preventDefault(); if (!input.trim() || streaming) return; const t = input.trim(); setInput(''); doSend(t); }

  async function loadHistory() { try { const d = await listStudySessions(); setSessions(d.sessions || []); } catch {} setShowHistory(true); }
  async function resumeSession(sid) { try { const d = await getStudySession(sid); setSessionId(d.session.id); setMessages(d.session.messages || []); } catch {} setShowHistory(false); }

  if (showHistory) {
    return (
      <div className="flex flex-col h-full">
        <div className="flex items-center gap-2 px-4 py-3 border-b border-gray-200 dark:border-[#2A2A40]">
          <button onClick={() => setShowHistory(false)} className="text-gray-400"><ArrowLeft size={20} /></button>
          <span className="text-base font-semibold text-gray-900 dark:text-white">Chat History</span>
          <div className="flex-1" />
          <button onClick={() => { setMessages([]); setSessionId(null); setShowHistory(false); }} className="text-xs text-blue-500 font-medium">New Chat</button>
        </div>
        <div className="flex-1 overflow-y-auto p-4 space-y-2">
          {sessions.length === 0 && <p className="text-sm text-gray-400 text-center py-8">No past sessions</p>}
          {sessions.map(s => (
            <button key={s.id} onClick={() => resumeSession(s.id)} className="w-full text-left px-4 py-3 rounded-xl bg-white dark:bg-[#161622] border border-gray-200 dark:border-[#2A2A40]">
              <p className="text-sm font-medium text-gray-900 dark:text-white truncate">{s.preview || 'Session'}</p>
              <p className="text-xs text-gray-400 mt-0.5">{s.messageCount} messages</p>
            </button>
          ))}
        </div>
      </div>
    );
  }

  const allMessages = [...messages];
  if (streamContent) allMessages.push({ role: 'assistant', content: streamContent, _streaming: true });

  return (
    <div className="flex flex-col h-full">
      <div className="flex items-center gap-2 px-4 py-3 border-b border-gray-200 dark:border-[#2A2A40]">
        <MessageSquare size={18} className="text-blue-500" />
        <span className="text-base font-semibold text-gray-900 dark:text-white">Study Mode</span>
        <div className="flex-1" />
        <button onClick={loadHistory} className="p-1.5 rounded-lg text-gray-400"><History size={18} /></button>
      </div>
      <div ref={scrollRef} className="flex-1 overflow-y-auto p-4 space-y-3">
        {allMessages.length === 0 && <p className="text-sm text-gray-400 text-center py-16">Ask anything to start studying</p>}
        {allMessages.map((msg, i) => (
          <div key={i} className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}>
            <div className={`max-w-[85%] px-4 py-2.5 rounded-2xl text-sm ${msg.role === 'user' ? 'bg-blue-600 text-white rounded-br-md' : 'bg-white dark:bg-[#1e1e2e] border border-gray-200 dark:border-[#2A2A40] text-gray-800 dark:text-gray-200 rounded-bl-md'}`}>
              {msg.role === 'assistant' ? (
                <div className="prose prose-sm dark:prose-invert max-w-none [&>*:first-child]:mt-0 [&>*:last-child]:mb-0">
                  <ReactMarkdown remarkPlugins={[remarkGfm]}>{msg.content}</ReactMarkdown>
                </div>
              ) : <p>{msg.content}</p>}
            </div>
          </div>
        ))}
      </div>
      <form onSubmit={handleSend} className="flex items-center gap-2 px-4 py-3 border-t border-gray-200 dark:border-[#2A2A40] bg-white dark:bg-[#161622]">
        <input value={input} onChange={e => setInput(e.target.value)} placeholder="Message..." className="flex-1 px-4 py-2.5 rounded-full border border-gray-200 dark:border-[#2A2A40] bg-gray-50 dark:bg-[#0D0D14] text-sm outline-none" />
        <button type="submit" disabled={!input.trim() || streaming} className="p-2.5 rounded-full bg-blue-600 text-white disabled:opacity-40"><Send size={16} /></button>
      </form>
    </div>
  );
}

// ============ MOBILE CURRICULA ============
function MobileCurricula() {
  const [curricula, setCurricula] = useState([]);
  const [loading, setLoading] = useState(true);
  const [view, setView] = useState('list');
  const [selected, setSelected] = useState(null);
  const [showNew, setShowNew] = useState(false);
  const [settings, setSettings] = useState(DEFAULT_SETTINGS);
  const [generating, setGenerating] = useState(false);

  useEffect(() => { listCurricula().then(d => { setCurricula(d.curricula || []); setLoading(false); }).catch(() => setLoading(false)); }, []);

  async function handleGenerate() {
    if (!settings.topic.trim() || generating) return;
    setGenerating(true);
    try { const d = await generateCurriculum(settings); setCurricula(prev => [d.curriculum, ...prev]); setShowNew(false); setSettings(DEFAULT_SETTINGS); } catch {}
    setGenerating(false);
  }

  async function openCurriculum(id) {
    try { const d = await getCurriculum(id); setSelected(d.curriculum); setView('detail'); } catch {}
  }

  if (view === 'detail' && selected) {
    return (
      <div className="flex flex-col h-full">
        <div className="flex items-center gap-2 px-4 py-3 border-b border-gray-200 dark:border-[#2A2A40]">
          <button onClick={() => { setView('list'); setSelected(null); }} className="text-gray-400"><ArrowLeft size={20} /></button>
          <span className="text-base font-semibold text-gray-900 dark:text-white truncate">{selected.title}</span>
        </div>
        <div className="flex-1 overflow-y-auto p-4 space-y-3">
          {(selected.units || []).map(unit => (
            <div key={unit.id} className="bg-white dark:bg-[#161622] rounded-xl border border-gray-200 dark:border-[#2A2A40] p-4">
              <h3 className="text-sm font-semibold text-gray-900 dark:text-white mb-2">{unit.title}</h3>
              <div className="space-y-1">
                {(unit.lessons || []).map(l => (
                  <div key={l.id} className="flex items-center gap-2 py-1.5 px-2 rounded-lg text-sm text-gray-700 dark:text-gray-300">
                    {l.isCompleted ? <Check size={14} className="text-emerald-500" /> : <BookOpen size={14} className="text-blue-400" />}
                    <span className={l.isCompleted ? 'line-through text-gray-400' : ''}>{l.title}</span>
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
      </div>
    );
  }

  if (loading) return <div className="flex items-center justify-center h-48"><LoadingSpinner size={24} /></div>;

  return (
    <div className="flex flex-col h-full">
      <div className="flex items-center gap-2 px-4 py-3 border-b border-gray-200 dark:border-[#2A2A40]">
        <BookOpen size={18} className="text-blue-500" />
        <span className="text-base font-semibold text-gray-900 dark:text-white">Curricula</span>
        <div className="flex-1" />
        <button onClick={() => setShowNew(!showNew)} className="p-1.5 rounded-lg bg-blue-600 text-white"><Plus size={16} /></button>
      </div>
      <div className="flex-1 overflow-y-auto p-4 space-y-3">
        {showNew && (
          <div className="bg-white dark:bg-[#161622] rounded-xl border border-gray-200 dark:border-[#2A2A40] p-4 space-y-3">
            <Input label="Topic" placeholder="e.g., Calculus, US History..." value={settings.topic} onChange={e => setSettings(p => ({ ...p, topic: e.target.value }))} />
            <PillGroup label="Difficulty" options={DIFFICULTY_OPTIONS} value={settings.difficulty} onChange={v => setSettings(p => ({ ...p, difficulty: v }))} />
            <Button onClick={handleGenerate} loading={generating} disabled={!settings.topic.trim()}>Generate</Button>
          </div>
        )}
        {curricula.length === 0 && !showNew && <p className="text-sm text-gray-400 text-center py-8">No curricula yet</p>}
        {curricula.map(c => (
          <button key={c.id} onClick={() => openCurriculum(c.id)} className="w-full text-left bg-white dark:bg-[#161622] rounded-xl border border-gray-200 dark:border-[#2A2A40] p-4">
            <h3 className="text-sm font-semibold text-gray-900 dark:text-white">{c.title}</h3>
            <p className="text-xs text-gray-400 mt-1">{c.units?.length || 0} units</p>
          </button>
        ))}
      </div>
    </div>
  );
}

// ============ MOBILE FLASHCARDS ============
function MobileFlashcards() {
  const [decks, setDecks] = useState([]);
  const [loading, setLoading] = useState(true);
  const [view, setView] = useState('list');
  const [deck, setDeck] = useState(null);
  const [reviewIdx, setReviewIdx] = useState(0);
  const [flipped, setFlipped] = useState(false);
  const [mode, setMode] = useState('browse');

  useEffect(() => { listDecks().then(d => { setDecks(d.decks || []); setLoading(false); }).catch(() => setLoading(false)); }, []);

  async function openDeck(id) { try { const d = await getDeck(id); setDeck(d.deck); setView('deck'); setMode('browse'); } catch {} }

  const dueCards = (deck?.cards || []).filter(c => !c.nextReview || new Date(c.nextReview) <= new Date());
  const reviewCards = mode === 'review' ? dueCards : [];
  const card = reviewCards[reviewIdx];

  async function handleReview(correct) {
    if (!card || !deck) return;
    try { const d = await submitReview(deck.id, card.id, correct); setDeck(prev => ({ ...prev, cards: prev.cards.map(c => c.id === card.id ? d.card : c) })); } catch {}
    setFlipped(false);
    if (reviewIdx < reviewCards.length - 1) setReviewIdx(i => i + 1);
    else { setMode('browse'); setReviewIdx(0); }
  }

  if (view === 'deck' && deck) {
    return (
      <div className="flex flex-col h-full">
        <div className="flex items-center gap-2 px-4 py-3 border-b border-gray-200 dark:border-[#2A2A40]">
          <button onClick={() => { setView('list'); setDeck(null); }} className="text-gray-400"><ArrowLeft size={20} /></button>
          <span className="text-base font-semibold text-gray-900 dark:text-white truncate">{deck.title}</span>
        </div>
        <div className="flex-1 overflow-y-auto p-4">
          {mode === 'browse' && (
            <>
              <div className="flex gap-2 mb-4">
                <Button size="sm" onClick={() => { setMode('review'); setReviewIdx(0); setFlipped(false); }} disabled={dueCards.length === 0}><RotateCcw size={14} /> Review ({dueCards.length})</Button>
              </div>
              <div className="space-y-2">
                {(deck.cards || []).map(c => (
                  <div key={c.id} className="bg-white dark:bg-[#1e1e2e] rounded-xl border border-gray-200 dark:border-[#2A2A40] p-3">
                    <p className="text-sm font-medium text-gray-900 dark:text-white">{c.front}</p>
                    <p className="text-xs text-gray-400 mt-1">{c.back}</p>
                  </div>
                ))}
              </div>
            </>
          )}
          {mode === 'review' && card && (
            <div className="space-y-4">
              <p className="text-xs text-gray-400 text-center">{reviewIdx + 1} / {reviewCards.length}</p>
              <div onClick={() => setFlipped(f => !f)} className="cursor-pointer" style={{ perspective: '1000px' }}>
                <div className="relative w-full h-[220px] transition-transform duration-500" style={{ transformStyle: 'preserve-3d', transform: flipped ? 'rotateY(180deg)' : 'rotateY(0deg)' }}>
                  <div className="absolute inset-0 bg-white dark:bg-[#1e1e2e] rounded-2xl border border-gray-200 dark:border-[#2A2A40] p-6 flex items-center justify-center" style={{ backfaceVisibility: 'hidden' }}>
                    <p className="text-center text-lg font-medium text-gray-900 dark:text-white">{card.front}</p>
                  </div>
                  <div className="absolute inset-0 bg-blue-50 dark:bg-[#1a1a30] rounded-2xl border border-blue-200 dark:border-blue-900/30 p-6 flex items-center justify-center" style={{ backfaceVisibility: 'hidden', transform: 'rotateY(180deg)' }}>
                    <p className="text-center text-lg text-gray-800 dark:text-gray-200">{card.back}</p>
                  </div>
                </div>
              </div>
              {!flipped && <p className="text-xs text-gray-400 text-center">Tap to flip</p>}
              {flipped && (
                <div className="flex gap-3 justify-center">
                  <button onClick={() => handleReview(false)} className="flex-1 py-3 rounded-xl bg-rose-50 dark:bg-rose-900/15 border border-rose-200 dark:border-rose-800 text-rose-600 text-sm font-medium">Wrong</button>
                  <button onClick={() => handleReview(true)} className="flex-1 py-3 rounded-xl bg-emerald-50 dark:bg-emerald-900/15 border border-emerald-200 dark:border-emerald-800 text-emerald-600 text-sm font-medium">Correct</button>
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    );
  }

  if (loading) return <div className="flex items-center justify-center h-48"><LoadingSpinner size={24} /></div>;

  return (
    <div className="flex flex-col h-full">
      <div className="flex items-center gap-2 px-4 py-3 border-b border-gray-200 dark:border-[#2A2A40]">
        <Layers size={18} className="text-purple-500" />
        <span className="text-base font-semibold text-gray-900 dark:text-white">Flashcards</span>
      </div>
      <div className="flex-1 overflow-y-auto p-4 space-y-2">
        {decks.length === 0 && <p className="text-sm text-gray-400 text-center py-8">No decks yet</p>}
        {decks.map(d => (
          <button key={d.id} onClick={() => openDeck(d.id)} className="w-full text-left bg-white dark:bg-[#161622] rounded-xl border border-gray-200 dark:border-[#2A2A40] p-4">
            <h3 className="text-sm font-semibold text-gray-900 dark:text-white">{d.title}</h3>
            <p className="text-xs text-gray-400 mt-0.5">{d.cardCount} cards{d.dueCount > 0 ? ` · ${d.dueCount} due` : ''}</p>
          </button>
        ))}
      </div>
    </div>
  );
}

// ============ MOBILE NOTES ============
function MobileNotes() {
  const [notes, setNotes] = useState([]);
  const [loading, setLoading] = useState(true);
  const [editing, setEditing] = useState(null);

  useEffect(() => { listNotes().then(d => { setNotes(d.notes || []); setLoading(false); }).catch(() => setLoading(false)); }, []);

  async function handleCreate() {
    try { const d = await createNote('Untitled Note', 'regular'); setEditing(d.note); setNotes(prev => [d.note, ...prev]); } catch {}
  }

  async function openNote(id) { try { const d = await getNote(id); setEditing(d.note); } catch {} }

  function handleChange(field, val) { setEditing(prev => ({ ...prev, [field]: val })); clearTimeout(window._noteSaveTimer); window._noteSaveTimer = setTimeout(() => updateNote(editing.id, { [field]: val }), 1000); }

  if (editing) {
    return (
      <div className="flex flex-col h-full">
        <div className="flex items-center gap-2 px-4 py-3 border-b border-gray-200 dark:border-[#2A2A40]">
          <button onClick={() => { setEditing(null); listNotes().then(d => setNotes(d.notes || [])); }} className="text-gray-400"><ArrowLeft size={20} /></button>
          <span className="text-xs text-gray-400">Auto-saved</span>
        </div>
        <div className="flex-1 flex flex-col p-4">
          <input value={editing.title} onChange={e => handleChange('title', e.target.value)} className="text-lg font-bold bg-transparent border-none outline-none text-gray-900 dark:text-white mb-3" placeholder="Title..." />
          <textarea value={editing.mainNotes || ''} onChange={e => handleChange('mainNotes', e.target.value)} className="flex-1 bg-white dark:bg-[#161622] rounded-xl border border-gray-200 dark:border-[#2A2A40] p-4 text-sm resize-none outline-none" placeholder="Start writing..." />
        </div>
      </div>
    );
  }

  if (loading) return <div className="flex items-center justify-center h-48"><LoadingSpinner size={24} /></div>;

  return (
    <div className="flex flex-col h-full">
      <div className="flex items-center gap-2 px-4 py-3 border-b border-gray-200 dark:border-[#2A2A40]">
        <FileText size={18} className="text-emerald-500" />
        <span className="text-base font-semibold text-gray-900 dark:text-white">Notes</span>
        <div className="flex-1" />
        <button onClick={handleCreate} className="p-1.5 rounded-lg bg-blue-600 text-white"><Plus size={16} /></button>
      </div>
      <div className="flex-1 overflow-y-auto p-4 space-y-2">
        {notes.length === 0 && <p className="text-sm text-gray-400 text-center py-8">No notes yet</p>}
        {notes.map(n => (
          <button key={n.id} onClick={() => openNote(n.id)} className="w-full text-left bg-white dark:bg-[#161622] rounded-xl border border-gray-200 dark:border-[#2A2A40] p-4">
            <h3 className="text-sm font-semibold text-gray-900 dark:text-white">{n.title}</h3>
            <p className="text-xs text-gray-400 mt-0.5">{new Date(n.updatedAt || n.createdAt).toLocaleDateString()}</p>
          </button>
        ))}
      </div>
    </div>
  );
}

// ============ MOBILE MORE PAGE ============
function MobileMore({ onNavigate }) {
  const { logout } = useAuth();
  const dark = document.documentElement.classList.contains('dark');
  const items = [
    { id: 'goals', label: 'Goals', icon: Target, color: 'text-amber-500', bg: 'bg-amber-50 dark:bg-amber-900/20' },
    { id: 'assessments', label: 'Assessments', icon: ClipboardCheck, color: 'text-rose-500', bg: 'bg-rose-50 dark:bg-rose-900/20' },
    { id: 'math', label: 'Math Canvas', icon: PenTool, color: 'text-indigo-500', bg: 'bg-indigo-50 dark:bg-indigo-900/20' },
    { id: 'social', label: 'Social', icon: Users, color: 'text-cyan-500', bg: 'bg-cyan-50 dark:bg-cyan-900/20' },
    { id: 'textbook', label: 'Textbooks', icon: GraduationCap, color: 'text-violet-500', bg: 'bg-violet-50 dark:bg-violet-900/20' },
    { id: 'settings', label: 'Settings', icon: Settings, color: 'text-gray-500', bg: 'bg-gray-50 dark:bg-gray-800/30' },
  ];

  function toggleTheme() {
    if (dark) { document.documentElement.classList.remove('dark'); localStorage.setItem('covalent-theme', 'light'); }
    else { document.documentElement.classList.add('dark'); localStorage.setItem('covalent-theme', 'dark'); }
    window.location.reload();
  }

  return (
    <div className="flex flex-col h-full">
      <div className="flex items-center gap-2 px-4 py-3 border-b border-gray-200 dark:border-[#2A2A40]">
        <MoreHorizontal size={18} className="text-gray-500" />
        <span className="text-base font-semibold text-gray-900 dark:text-white">More</span>
      </div>
      <div className="flex-1 overflow-y-auto p-4">
        <div className="grid grid-cols-3 gap-3 mb-6">
          {items.map(item => {
            const Icon = item.icon;
            return (
              <button key={item.id} onClick={() => onNavigate(item.id)} className="flex flex-col items-center gap-2 py-4 rounded-xl bg-white dark:bg-[#161622] border border-gray-200 dark:border-[#2A2A40]">
                <div className={`w-10 h-10 rounded-xl ${item.bg} flex items-center justify-center`}>
                  <Icon size={20} className={item.color} />
                </div>
                <span className="text-xs font-medium text-gray-700 dark:text-gray-300">{item.label}</span>
              </button>
            );
          })}
        </div>
        <div className="space-y-2">
          <button onClick={toggleTheme} className="w-full flex items-center gap-3 px-4 py-3 rounded-xl bg-white dark:bg-[#161622] border border-gray-200 dark:border-[#2A2A40]">
            {dark ? <Sun size={18} className="text-amber-500" /> : <Moon size={18} className="text-indigo-500" />}
            <span className="text-sm text-gray-900 dark:text-white">{dark ? 'Light Mode' : 'Dark Mode'}</span>
          </button>
          <button onClick={logout} className="w-full flex items-center gap-3 px-4 py-3 rounded-xl bg-white dark:bg-[#161622] border border-rose-200 dark:border-rose-900/30">
            <LogOut size={18} className="text-rose-500" />
            <span className="text-sm text-rose-500">Log Out</span>
          </button>
        </div>
      </div>
    </div>
  );
}

// ============ MOBILE SUB-PAGE WRAPPER ============
function MobileSubPage({ title, onBack, children, flex }) {
  return (
    <div className="flex flex-col h-full">
      <div className="flex items-center gap-2 px-4 py-3 border-b border-gray-200 dark:border-[#2A2A40] flex-shrink-0">
        <button onClick={onBack} className="text-gray-400"><ArrowLeft size={20} /></button>
        <span className="text-base font-semibold text-gray-900 dark:text-white">{title}</span>
      </div>
      <div className={`flex-1 min-h-0 ${flex ? 'flex flex-col overflow-hidden' : 'overflow-y-auto p-4'}`}>
        {children}
      </div>
    </div>
  );
}

// ============ MAIN MOBILE APP ============
const TABS = [
  { id: 'study', label: 'Study', icon: MessageSquare },
  { id: 'curricula', label: 'Learn', icon: BookOpen },
  { id: 'flashcards', label: 'Cards', icon: Layers },
  { id: 'notes', label: 'Notes', icon: FileText },
  { id: 'more', label: 'More', icon: MoreHorizontal },
];

export default function MobileApp() {
  // Mobile is disabled for now — show a coming-soon splash instead of the app.
  // The rest of the mobile components (MobileStudy, MobileCurricula, etc.)
  // stay defined above so we can re-enable them quickly when ready.
  return (
    <div className="min-h-screen flex flex-col items-center justify-center bg-[#F4F5F7] dark:bg-[#0D0D14] px-6 text-center">
      <div className="w-14 h-14 rounded-2xl bg-gradient-to-br from-blue-500 to-blue-700 text-white flex items-center justify-center mb-5 shadow">
        <BookOpen size={26} />
      </div>
      <h1 className="text-2xl font-bold text-gray-900 dark:text-white mb-3">
        Mobile Coming Soon
      </h1>
      <p className="text-sm text-gray-600 dark:text-gray-300 leading-relaxed max-w-sm">
        RushilAI doesn't work on mobile yet. This was because we are trying to put a quality computer product first, instead of trying to do two things at once. Sorry, and a mobile version will come soon.
      </p>
    </div>
  );
}
