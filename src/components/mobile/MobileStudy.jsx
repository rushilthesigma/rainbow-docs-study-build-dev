import { useState, useRef, useEffect } from 'react';
import { Sparkles, History, Send, Calculator, Beaker, Lightbulb, Compass, Plus, X } from 'lucide-react';
import { sendStudyMessage, listStudySessions, getStudySession, deleteStudySession } from '../../api/curriculum';
import { errorChatMessage } from '../../utils/aiErrors';

// Mobile-native Study Mode: full-bleed chat, slim title, no Debate
// button (head-to-head needs a wider canvas), no sidebar. The empty
// state shows a centered prompt with 4 quick-start tiles.

const QUICK_PROMPTS = [
  { icon: Calculator, label: 'Quiz me on the quadratic formula', prompt: 'Quiz me on the quadratic formula. 5 multiple-choice questions, escalating difficulty.' },
  { icon: Beaker,     label: 'Explain photosynthesis at honors level', prompt: 'Explain photosynthesis at honors-tier depth. Don\'t skip the Calvin cycle.' },
  { icon: Lightbulb,  label: 'Help me understand limits in calculus', prompt: 'Walk me through limits in calculus, starting with intuition before the formal definition.' },
  { icon: Compass,    label: "What's a good thing to study right now?", prompt: 'What should I work on right now?' },
];

export default function MobileStudy() {
  const [messages, setMessages] = useState([]);
  const [streamingContent, setStreamingContent] = useState('');
  const [streaming, setStreaming] = useState(false);
  const [sessionId, setSessionId] = useState(null);
  const [input, setInput] = useState('');
  const [historyOpen, setHistoryOpen] = useState(false);
  const [sessions, setSessions] = useState([]);
  const [loadingHistory, setLoadingHistory] = useState(false);
  const abortRef = useRef(null);
  const streamRef = useRef('');
  const scrollerRef = useRef(null);

  // Auto-scroll to bottom on new content
  useEffect(() => {
    if (scrollerRef.current) {
      scrollerRef.current.scrollTop = scrollerRef.current.scrollHeight;
    }
  }, [messages, streamingContent]);

  function doSend(text) {
    if (!text.trim() || streaming) return;
    const userMsg = { role: 'user', content: text, timestamp: new Date().toISOString() };
    setMessages((m) => [...m, userMsg]);
    setInput('');
    setStreaming(true);
    setStreamingContent('');
    streamRef.current = '';
    const abort = sendStudyMessage(text, sessionId, {}, [], {
      onChunk: (chunk) => { streamRef.current += chunk; setStreamingContent(streamRef.current); },
      onMeta: (d) => { if (d.sessionId) setSessionId(d.sessionId); },
      onDone: () => {
        const full = streamRef.current;
        if (full) setMessages((m) => [...m, { role: 'assistant', content: full, timestamp: new Date().toISOString() }]);
        setStreamingContent(''); streamRef.current = ''; setStreaming(false);
      },
      onError: (err) => {
        setMessages((m) => [...m, errorChatMessage(err)]);
        setStreamingContent(''); streamRef.current = ''; setStreaming(false);
      },
    });
    abortRef.current = abort;
  }

  function newSession() {
    if (abortRef.current) try { abortRef.current(); } catch {}
    setMessages([]); setStreamingContent(''); setStreaming(false); setSessionId(null);
    setInput('');
  }

  async function openHistory() {
    setHistoryOpen(true);
    setLoadingHistory(true);
    try {
      const d = await listStudySessions();
      setSessions(d.sessions || []);
    } catch {} finally { setLoadingHistory(false); }
  }

  async function loadSession(sid) {
    setHistoryOpen(false);
    try {
      const d = await getStudySession(sid);
      setSessionId(sid);
      setMessages(d.session?.messages || []);
    } catch {}
  }

  async function handleDeleteSession(sid, e) {
    e?.stopPropagation();
    if (!confirm('Delete this session?')) return;
    try {
      await deleteStudySession(sid);
      setSessions((prev) => prev.filter((s) => s.id !== sid));
    } catch {}
  }

  const empty = messages.length === 0 && !streaming;

  return (
    <div className="flex flex-col h-full bg-[#F4F5F7] dark:bg-[#0a0a14]">
      {/* Slim header */}
      <header className="flex items-center gap-2 px-3 py-2 border-b border-gray-200 dark:border-white/[0.06] flex-shrink-0">
        <div className="w-7 h-7 rounded-lg bg-gradient-to-br from-blue-500 to-indigo-600 grid place-items-center">
          <Sparkles size={14} className="text-white" />
        </div>
        <div className="flex-1 min-w-0">
          <p className="text-[13px] font-bold tracking-tight text-gray-900 dark:text-white truncate">Study</p>
        </div>
        <button onClick={newSession} title="New chat" className="w-8 h-8 rounded-full grid place-items-center text-gray-500 dark:text-gray-300 active:bg-gray-100 dark:active:bg-white/[0.06]">
          <Plus size={16} />
        </button>
        <button onClick={openHistory} title="History" className="w-8 h-8 rounded-full grid place-items-center text-gray-500 dark:text-gray-300 active:bg-gray-100 dark:active:bg-white/[0.06]">
          <History size={15} />
        </button>
      </header>

      {/* Body */}
      <div ref={scrollerRef} className="flex-1 min-h-0 overflow-y-auto">
        {empty ? (
          <EmptyState onPick={(p) => doSend(p)} />
        ) : (
          <div className="px-3 py-3 space-y-2.5">
            {messages.map((m, i) => <Bubble key={i} role={m.role} content={m.content} />)}
            {streaming && (
              streamingContent
                // Once any text has streamed in, render a normal bubble that
                // grows token-by-token. No "..." filler.
                ? <Bubble role="assistant" content={streamingContent} />
                // Pre-first-token: show a subtle three-dot pulse so the user
                // knows we're working without the literal "..." placeholder.
                : <TypingBubble />
            )}
          </div>
        )}
      </div>

      {/* Input */}
      <form
        className="flex-shrink-0 px-3 py-2.5 border-t border-gray-200 dark:border-white/[0.06] bg-white dark:bg-[#0c0c16]"
        onSubmit={(e) => { e.preventDefault(); doSend(input); }}
      >
        <div className="flex items-end gap-2">
          <textarea
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); doSend(input); } }}
            placeholder="Ask anything…"
            rows={1}
            disabled={streaming}
            className="flex-1 resize-none px-3.5 py-2.5 rounded-2xl border border-gray-200 dark:border-white/[0.08] bg-white dark:bg-[#13131f] text-[14px] text-gray-900 dark:text-white outline-none disabled:opacity-60 max-h-32"
          />
          <button
            type="submit"
            disabled={!input.trim() || streaming}
            className="w-10 h-10 rounded-full bg-blue-600 text-white grid place-items-center disabled:opacity-40 active:bg-blue-700 shrink-0"
            aria-label="Send"
          >
            <Send size={15} />
          </button>
        </div>
      </form>

      {/* History sheet */}
      {historyOpen && (
        <HistorySheet
          loading={loadingHistory}
          sessions={sessions}
          onClose={() => setHistoryOpen(false)}
          onPick={loadSession}
          onDelete={handleDeleteSession}
        />
      )}
    </div>
  );
}

// ===== Empty state =====
function EmptyState({ onPick }) {
  return (
    <div className="px-4 pt-8 pb-6 flex flex-col items-center text-center">
      <div className="w-12 h-12 rounded-2xl bg-gradient-to-br from-blue-500 to-indigo-600 grid place-items-center shadow-lg shadow-blue-500/40 mb-3">
        <Sparkles size={22} className="text-white" />
      </div>
      <h2 className="text-[18px] font-bold tracking-[-0.02em] text-gray-900 dark:text-white">What should we study?</h2>
      <p className="text-[12.5px] text-gray-500 dark:text-gray-400 mt-1 max-w-[280px] leading-relaxed">
        Ask anything, request a quiz, or walk through a concept.
      </p>
      <div className="grid grid-cols-1 gap-2 w-full max-w-sm mt-5">
        {QUICK_PROMPTS.map((qp, i) => {
          const Icon = qp.icon;
          return (
            <button
              key={i}
              onClick={() => onPick(qp.prompt)}
              className="rounded-2xl border border-gray-200 dark:border-white/[0.06] bg-white dark:bg-[#13131f] p-3 flex items-center gap-3 active:scale-[0.99] transition-transform text-left"
            >
              <div className="w-9 h-9 rounded-xl bg-blue-100/70 dark:bg-blue-500/15 text-blue-500 grid place-items-center shrink-0">
                <Icon size={16} />
              </div>
              <p className="text-[13px] font-semibold text-gray-900 dark:text-white leading-tight">{qp.label}</p>
            </button>
          );
        })}
      </div>
    </div>
  );
}

// ===== Bubble =====
function Bubble({ role, content }) {
  const isUser = role === 'user';
  return (
    <div className={`flex ${isUser ? 'justify-end' : 'justify-start'}`}>
      <div className={`max-w-[85%] rounded-2xl px-3.5 py-2.5 text-[13.5px] leading-relaxed whitespace-pre-wrap ${
        isUser
          ? 'bg-blue-600 text-white'
          : 'bg-white dark:bg-[#13131f] border border-gray-200 dark:border-white/[0.06] text-gray-900 dark:text-gray-100'
      }`}>
        {content}
      </div>
    </div>
  );
}

// Pre-streaming "thinking" indicator. Three pulsing dots — feels alive,
// no literal "..." characters in the content.
function TypingBubble() {
  return (
    <div className="flex justify-start">
      <div className="rounded-2xl px-4 py-3 bg-white dark:bg-[#13131f] border border-gray-200 dark:border-white/[0.06]">
        <div className="flex items-end gap-1 h-3">
          <span className="w-1.5 h-1.5 rounded-full bg-blue-400 animate-typing-bounce [animation-delay:0ms]" />
          <span className="w-1.5 h-1.5 rounded-full bg-blue-400 animate-typing-bounce [animation-delay:150ms]" />
          <span className="w-1.5 h-1.5 rounded-full bg-blue-400 animate-typing-bounce [animation-delay:300ms]" />
        </div>
      </div>
    </div>
  );
}

// ===== History sheet =====
function HistorySheet({ loading, sessions, onClose, onPick, onDelete }) {
  return (
    <div className="fixed inset-0 z-[60]">
      <button onClick={onClose} aria-label="Close" className="absolute inset-0 bg-black/50 backdrop-blur-[2px]" />
      <div className="absolute bottom-0 left-0 right-0 max-h-[70%] rounded-t-3xl bg-white dark:bg-[#13131f] border-t border-gray-200 dark:border-white/[0.06] shadow-2xl flex flex-col"
           style={{ paddingBottom: 'calc(env(safe-area-inset-bottom, 0px) + 8px)' }}>
        <div className="flex justify-center pt-2.5 pb-1">
          <div className="w-9 h-1 rounded-full bg-gray-300 dark:bg-white/15" />
        </div>
        <div className="flex items-center justify-between px-5 pt-1 pb-3 flex-shrink-0">
          <h3 className="text-[15px] font-bold text-gray-900 dark:text-white tracking-tight">History</h3>
          <button onClick={onClose} className="w-8 h-8 rounded-full grid place-items-center text-gray-400 hover:text-gray-700 dark:hover:text-gray-200">
            <X size={16} />
          </button>
        </div>
        <div className="flex-1 min-h-0 overflow-y-auto px-3 pb-3">
          {loading && <p className="text-center text-[12px] text-gray-400 py-6">Loading…</p>}
          {!loading && sessions.length === 0 && (
            <p className="text-center text-[12px] text-gray-500 dark:text-gray-400 py-6">No past sessions.</p>
          )}
          <div className="space-y-1.5">
            {sessions.map((s) => (
              <div key={s.id} className="group flex items-center gap-3 rounded-xl border border-gray-200 dark:border-white/[0.06] bg-white dark:bg-[#0e0e18] px-3 py-2.5">
                <button onClick={() => onPick(s.id)} className="flex-1 min-w-0 text-left">
                  <p className="text-[13px] font-semibold text-gray-900 dark:text-white truncate">{s.title || 'Untitled session'}</p>
                  <p className="text-[10.5px] text-gray-500 dark:text-gray-400 mt-0.5">
                    {s.updatedAt ? new Date(s.updatedAt).toLocaleDateString() : ''}
                    {s.messageCount ? ` · ${s.messageCount} messages` : ''}
                  </p>
                </button>
                <button onClick={(e) => onDelete(s.id, e)} aria-label="Delete" className="text-gray-400 hover:text-rose-500 p-1.5">
                  <X size={13} />
                </button>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
