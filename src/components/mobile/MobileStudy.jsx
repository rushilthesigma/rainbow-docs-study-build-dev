import { useState, useRef, useEffect } from 'react';
import { Sparkles, History, Send, Calculator, Beaker, Lightbulb, Compass, Plus, X, Brain, ChevronRight, Cpu, Check, Lock } from 'lucide-react';
import { sendStudyMessage, listStudySessions, getStudySession, deleteStudySession } from '../../api/curriculum';
import { syncData } from '../../api/auth';
import { errorChatMessage } from '../../utils/aiErrors';
import { Z } from '../../styles/tokens';
import useKeyboardInset from '../../hooks/useKeyboardInset';
import { useAuth } from '../../context/AuthContext';
import { planFromUser } from '../billing/modelAccess';
import { STUDY_MODELS, HAIKU_FREE_DAILY, resolveStudyModel, canUseStudyModel, requiredPlanLabelFor, studyModelLabel, studyModelHasFreeCap, studyModelBlurb } from '../study/studyModels';

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
  const { user, fetchUser } = useAuth();
  const plan = planFromUser(user);
  const [messages, setMessages] = useState([]);
  const [streamingContent, setStreamingContent] = useState('');
  const [streamingThinking, setStreamingThinking] = useState('');
  const [streaming, setStreaming] = useState(false);
  const [sessionId, setSessionId] = useState(null);
  const [input, setInput] = useState('');
  const [historyOpen, setHistoryOpen] = useState(false);
  const [sessions, setSessions] = useState([]);
  const [loadingHistory, setLoadingHistory] = useState(false);
  // Per-message model pick, mirrors the desktop Study toggle. The saved choice
  // lives in preferences.studyModel; a plan-locked pick resolves to the floor.
  const [studyModel, setStudyModel] = useState(() => resolveStudyModel(user?.data?.preferences?.studyModel, plan));
  const studyModelRef = useRef(studyModel);
  studyModelRef.current = studyModel;
  const [modelSheetOpen, setModelSheetOpen] = useState(false);
  // Free Haiku messages left in the rolling 24h window (non-paid only). Null
  // until the server reports it on the first send.
  const [haikuRemaining, setHaikuRemaining] = useState(null);
  const abortRef = useRef(null);
  const streamRef = useRef('');
  const thinkRef = useRef('');
  const scrollerRef = useRef(null);
  const kbInset = useKeyboardInset();

  // Keep the picker in sync if the cached user (plan / saved pick) changes.
  useEffect(() => {
    setStudyModel(resolveStudyModel(user?.data?.preferences?.studyModel, plan));
  }, [user?.data?.preferences?.studyModel, plan]);

  async function pickStudyModel(key) {
    if (!canUseStudyModel(key, plan)) return; // locked tiers aren't selectable
    setStudyModel(key);
    setModelSheetOpen(false);
    try {
      const merged = { ...(user?.data?.preferences || {}), studyModel: key };
      await syncData({ preferences: merged });
      await fetchUser();
    } catch (err) { console.error('save studyModel failed:', err); }
  }

  // Auto-scroll to bottom on new content - and whenever the keyboard
  // opens/closes, so the latest message stays pinned above the input.
  useEffect(() => {
    if (scrollerRef.current) {
      scrollerRef.current.scrollTop = scrollerRef.current.scrollHeight;
    }
  }, [messages, streamingContent, kbInset]);

  function doSend(text) {
    if (!text.trim() || streaming) return;
    const userMsg = { role: 'user', content: text, timestamp: new Date().toISOString() };
    setMessages((m) => [...m, userMsg]);
    setInput('');
    setStreaming(true);
    setStreamingContent('');
    setStreamingThinking('');
    streamRef.current = '';
    thinkRef.current = '';
    const abort = sendStudyMessage(text, sessionId, {}, [], {
      onChunk: (chunk) => { streamRef.current += chunk; setStreamingContent(streamRef.current); },
      onThinking: (t) => { thinkRef.current += t; setStreamingThinking(thinkRef.current); },
      onMeta: (d) => {
        if (d.sessionId) setSessionId(d.sessionId);
        if (typeof d.studyModel?.haikuRemaining === 'number') setHaikuRemaining(d.studyModel.haikuRemaining);
      },
      onDone: () => {
        const full = streamRef.current;
        const think = thinkRef.current;
        if (full) setMessages((m) => [...m, { role: 'assistant', content: full, thinking: think || undefined, timestamp: new Date().toISOString() }]);
        setStreamingContent(''); setStreamingThinking(''); streamRef.current = ''; thinkRef.current = ''; setStreaming(false);
      },
      onError: (err) => {
        setMessages((m) => [...m, errorChatMessage(err)]);
        setStreamingContent(''); setStreamingThinking(''); streamRef.current = ''; thinkRef.current = ''; setStreaming(false);
      },
    }, false, false, studyModelRef.current);
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
    // `flex-1 min-h-0` (not `h-full`) so this fills the parent flex
    // column deterministically. h-full vs flex-1 matters here because
    // the parent uses flex-1 itself - `height: 100%` of a flex-grown
    // parent resolves inconsistently across browsers, while `flex-1`
    // on the child is rock solid.
    <div
      className="flex-1 min-h-0 flex flex-col bg-[#F4F5F7] dark:bg-[#0a0a14]"
      // When the on-screen keyboard opens, lift the pinned input form
      // above it (the message scroller shrinks to match). The shell
      // already reserves 90px at the bottom for its tab/nav chrome
      // (which the keyboard covers anyway), so we only need the keyboard
      // height beyond that. Settles back to 0 on dismiss.
      style={{
        paddingBottom: kbInset ? Math.max(0, kbInset - 90) : undefined,
        transition: 'padding-bottom 0.18s ease-out',
      }}
    >
      {/* Slim header */}
      <header className="flex items-center gap-2 px-3 py-2 border-b border-gray-200 dark:border-white/[0.06] flex-shrink-0">
        <div className="w-7 h-7 rounded-lg bg-blue-500 grid place-items-center">
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
            {messages.map((m, i) => <Bubble key={i} role={m.role} content={m.content} thinking={m.thinking} />)}
            {streaming && (
              (streamingContent || streamingThinking)
                // Once any text (or reasoning) has streamed in, render a normal
                // bubble that grows token-by-token. No "..." filler.
                ? <Bubble role="assistant" content={streamingContent} thinking={streamingThinking} streaming />
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
        {/* Model toggle row */}
        <div className="flex items-center gap-2 mb-2">
          <button
            type="button"
            onClick={() => setModelSheetOpen(true)}
            disabled={streaming}
            className="flex items-center gap-1.5 pl-2 pr-2.5 py-1 rounded-full border border-gray-200 dark:border-white/[0.08] bg-gray-50 dark:bg-[#13131f] text-gray-700 dark:text-gray-200 active:bg-gray-100 dark:active:bg-white/[0.06] disabled:opacity-50"
          >
            <Cpu size={13} className="text-blue-500" />
            <span className="text-[12px] font-semibold max-w-[120px] truncate">{studyModelLabel(studyModel)}</span>
            <ChevronRight size={12} className="-rotate-90 text-gray-400" />
          </button>
          {studyModelHasFreeCap(studyModel, plan) && (
            <HaikuLimitPill remaining={haikuRemaining} />
          )}
        </div>
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

      {/* Model picker sheet */}
      {modelSheetOpen && (
        <ModelSheet
          active={studyModel}
          plan={plan}
          onClose={() => setModelSheetOpen(false)}
          onPick={pickStudyModel}
        />
      )}
    </div>
  );
}

// ===== Haiku daily-limit pill =====
// Free Haiku quota indicator. Shows the static daily allowance until the
// server reports a live count on the first send, then "N left today". Amber
// when running low / out.
function HaikuLimitPill({ remaining }) {
  const known = typeof remaining === 'number';
  const low = known && remaining <= 3;
  const label = `${known ? remaining : HAIKU_FREE_DAILY}/${HAIKU_FREE_DAILY}`;
  return (
    <span
      className={`animate-fade-in inline-flex items-center px-2 py-1 rounded-full text-[11px] font-semibold whitespace-nowrap ${
        low
          ? 'text-amber-600 dark:text-amber-300/90 bg-amber-500/10'
          : 'text-gray-500 dark:text-gray-400 bg-gray-100 dark:bg-white/[0.05]'
      }`}
    >
      {label}
    </span>
  );
}

// ===== Model picker sheet =====
// Bottom sheet mirroring the desktop dropdown: lists every study model with
// provider + blurb. Non-paid users see paid-only models locked with the
// required plan. The server is the real enforcer (plan gate + Haiku cap).
function ModelSheet({ active, plan, onClose, onPick }) {
  return (
    <div className="fixed inset-0" style={{ zIndex: Z.sheet }}>
      <button onClick={onClose} aria-label="Close" className="absolute inset-0 bg-black/50 backdrop-blur-[2px] animate-fade-in" />
      <div className="absolute bottom-0 left-0 right-0 max-h-[70%] rounded-t-3xl bg-white dark:bg-[#13131f] border-t border-gray-200 dark:border-white/[0.06] shadow-2xl flex flex-col animate-slide-up"
           style={{ paddingBottom: 'calc(env(safe-area-inset-bottom, 0px) + 8px)' }}>
        <div className="flex justify-center pt-2.5 pb-1">
          <div className="w-9 h-1 rounded-full bg-gray-300 dark:bg-white/15" />
        </div>
        <div className="flex items-center justify-between px-5 pt-1 pb-3 flex-shrink-0">
          <h3 className="text-[15px] font-bold text-gray-900 dark:text-white tracking-tight">Model</h3>
          <button onClick={onClose} className="w-8 h-8 rounded-full grid place-items-center text-gray-400 hover:text-gray-700 dark:hover:text-gray-200">
            <X size={16} />
          </button>
        </div>
        <div className="flex-1 min-h-0 overflow-y-auto px-3 pb-3">
          <div className="space-y-1.5">
            {STUDY_MODELS.map((m) => {
              const locked = !canUseStudyModel(m.key, plan);
              const lockLabel = locked ? requiredPlanLabelFor(m.key) : null;
              return (
                <button
                  key={m.key}
                  type="button"
                  disabled={locked}
                  onClick={() => onPick(m.key)}
                  className={`w-full flex items-center gap-3 rounded-xl border px-3 py-2.5 text-left transition-colors ${
                    active === m.key
                      ? 'border-blue-400/60 bg-blue-50 dark:bg-blue-500/[0.12]'
                      : locked
                        ? 'border-gray-200 dark:border-white/[0.06] opacity-55'
                        : 'border-gray-200 dark:border-white/[0.06] bg-white dark:bg-[#0e0e18] active:bg-gray-50 dark:active:bg-white/[0.04]'
                  }`}
                >
                  <div className="w-9 h-9 rounded-xl bg-blue-100/70 dark:bg-blue-500/15 text-blue-500 grid place-items-center shrink-0">
                    <Cpu size={16} />
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-[13px] font-bold text-gray-900 dark:text-white flex items-center gap-1.5 truncate">
                      {m.label}
                      <span className="text-[10px] font-medium text-gray-400 dark:text-white/40">{m.provider}</span>
                      {locked && lockLabel && (
                        <span className="inline-flex items-center gap-0.5 text-[10px] font-semibold text-amber-600 dark:text-amber-300/80">
                          <Lock size={10} /> {lockLabel}
                        </span>
                      )}
                    </p>
                    <p className="text-[11px] text-gray-500 dark:text-gray-400 truncate">{studyModelBlurb(m.key, plan)}</p>
                  </div>
                  {active === m.key && <Check size={16} className="text-blue-500 shrink-0" strokeWidth={3} />}
                </button>
              );
            })}
          </div>
        </div>
      </div>
    </div>
  );
}

// ===== Empty state =====
function EmptyState({ onPick }) {
  return (
    <div className="px-4 pt-8 pb-6 flex flex-col items-center text-center">
      <div className="w-12 h-12 rounded-2xl bg-blue-500 grid place-items-center shadow-lg shadow-blue-500/40 mb-3">
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
function Bubble({ role, content, thinking, streaming }) {
  const isUser = role === 'user';
  const [showThink, setShowThink] = useState(!!streaming);
  return (
    <div className={`flex ${isUser ? 'justify-end' : 'justify-start'}`}>
      <div className={`max-w-[85%] rounded-2xl px-3.5 py-2.5 text-[13.5px] leading-relaxed ${
        isUser
          ? 'bg-blue-600 text-white'
          : 'bg-white dark:bg-[#13131f] border border-gray-200 dark:border-white/[0.06] text-gray-900 dark:text-gray-100'
      }`}>
        {!isUser && thinking && (
          <div className="mb-1.5 rounded-xl border border-gray-200 dark:border-white/[0.08] overflow-hidden">
            <button
              type="button"
              onClick={() => setShowThink(s => !s)}
              className="w-full flex items-center gap-1.5 px-2.5 py-1.5 text-[11px] font-semibold text-gray-500 dark:text-gray-400"
            >
              <Brain size={11} className={streaming ? 'animate-pulse' : ''} />
              {streaming ? 'Thinking…' : 'Thinking'}
              <ChevronRight size={11} className={`ml-auto transition-transform ${showThink ? 'rotate-90' : ''}`} />
            </button>
            {showThink && (
              <div className="px-2.5 pb-2 pt-1.5 text-[12px] text-gray-500 dark:text-gray-400 whitespace-pre-wrap border-t border-gray-200 dark:border-white/[0.06] max-h-52 overflow-y-auto">
                {thinking}
              </div>
            )}
          </div>
        )}
        <div className="whitespace-pre-wrap">{content}</div>
      </div>
    </div>
  );
}

// Pre-streaming "thinking" indicator. Three pulsing dots - feels alive,
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
    <div className="fixed inset-0" style={{ zIndex: Z.sheet }}>
      <button onClick={onClose} aria-label="Close" className="absolute inset-0 bg-black/50 backdrop-blur-[2px] animate-fade-in" />
      <div className="absolute bottom-0 left-0 right-0 max-h-[70%] rounded-t-3xl bg-white dark:bg-[#13131f] border-t border-gray-200 dark:border-white/[0.06] shadow-2xl flex flex-col animate-slide-up"
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
