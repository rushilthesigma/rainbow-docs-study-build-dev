import { useState, useRef, useCallback, useEffect } from 'react';
import { History, Trash2, Plus, ChevronLeft, Compass, Lightbulb, Calculator, Beaker, Sparkles } from 'lucide-react';
import { sendStudyMessage, listStudySessions, getStudySession, deleteStudySession } from '../../api/curriculum';
import ChatContainer from '../chat/ChatContainer';
import { errorChatMessage } from '../../utils/aiErrors';

// Quick-start prompts shown in the empty state. Replaces the bland
// "Start the conversation..." default with concrete suggestions tied to
// what the AI is good at, so the study mode does NOT feel like ChatGPT's
// blank greeting.
const QUICK_PROMPTS = [
  { icon: Calculator, label: 'Quiz me on the quadratic formula', prompt: 'Quiz me on the quadratic formula. 5 multiple-choice questions, escalating difficulty.' },
  { icon: Beaker,     label: 'Explain photosynthesis at honors level', prompt: 'Explain photosynthesis at honors-tier depth. Don\'t skip the Calvin cycle.' },
  { icon: Lightbulb,  label: 'Help me understand limits in calculus', prompt: 'Walk me through limits in calculus, starting with intuition before the formal definition.' },
  { icon: Compass,    label: 'What\'s a good thing to study right now?', prompt: 'What should I work on right now?' },
];

export default function StudyModePanel({ className = '', initialMessage }) {
  const [messages, setMessages] = useState([]);
  const [streamingContent, setStreamingContent] = useState('');
  const [streamingSources, setStreamingSources] = useState([]);
  const [searchStatus, setSearchStatus] = useState(null);
  const [sourceMode, setSourceMode] = useState(false);
  const [streaming, setStreaming] = useState(false);
  const [sessionId, setSessionId] = useState(null);
  const abortRef = useRef(null);
  const streamContentRef = useRef('');
  const streamSourcesRef = useRef([]);
  const initialSent = useRef(false);

  // History state
  const [showHistory, setShowHistory] = useState(false);
  const [sessions, setSessions] = useState([]);
  const [loadingHistory, setLoadingHistory] = useState(false);

  function doSend(text, opts = {}) {
    const wasSourced = !!(opts.sourced ?? sourceMode);
    const images = opts.images || [];
    const userMsg = { role: 'user', content: text, timestamp: new Date().toISOString() };
    if (images.length) userMsg.images = images.map(i => ({ dataUrl: i.dataUrl, name: i.name }));
    // Used by the AI-instruct regenerate flow: hide the hidden-instruction
    // user turn from the visible transcript while still sending it to the API.
    if (!opts.hideUserInDisplay) setMessages(prev => [...prev, userMsg]);
    setStreaming(true);
    setStreamingContent('');
    setStreamingSources([]);
    setSearchStatus(wasSourced ? 'searching' : null);
    streamContentRef.current = '';
    streamSourcesRef.current = [];

    const abort = sendStudyMessage(text, sessionId, {}, images, {
      onChunk: (chunk) => {
        streamContentRef.current += chunk;
        setStreamingContent(streamContentRef.current);
        if (searchStatus) setSearchStatus(null);
      },
      onMeta: (data) => { if (data.sessionId) setSessionId(data.sessionId); },
      onSource: (src) => {
        streamSourcesRef.current = [...streamSourcesRef.current, src];
        setStreamingSources(streamSourcesRef.current);
      },
      onStatus: (s) => setSearchStatus(s),
      onDone: () => {
        const fullContent = streamContentRef.current;
        const sources = streamSourcesRef.current;
        if (fullContent) {
          setMessages(m => [...m, {
            role: 'assistant',
            content: fullContent,
            sources: sources.length ? sources : undefined,
            timestamp: new Date().toISOString(),
          }]);
        }
        setStreamingContent('');
        setStreamingSources([]);
        setSearchStatus(null);
        streamContentRef.current = '';
        streamSourcesRef.current = [];
        setStreaming(false);
      },
      onError: (err) => {
        // eslint-disable-next-line no-use-before-define
        setMessages(m => [...m, errorChatMessage(err)]);
        setStreamingContent('');
        setStreamingSources([]);
        setSearchStatus(null);
        streamContentRef.current = '';
        streamSourcesRef.current = [];
        setStreaming(false);
      },
    }, wasSourced);
    abortRef.current = abort;
  }

  const handleSend = useCallback((text, images) => {
    if (streaming) return;
    doSend(text, { images });
  }, [streaming, sessionId]);

  useEffect(() => {
    if (initialMessage && !initialSent.current) {
      initialSent.current = true;
      setTimeout(() => doSend(initialMessage), 100);
    }
  }, [initialMessage]);

  async function loadHistory() {
    setLoadingHistory(true);
    try {
      const data = await listStudySessions();
      setSessions(data.sessions || []);
    } catch {}
    setLoadingHistory(false);
  }

  async function resumeSession(sid) {
    try {
      const data = await getStudySession(sid);
      if (data.session) {
        setSessionId(data.session.id);
        setMessages(data.session.messages || []);
        setShowHistory(false);
      }
    } catch {}
  }

  async function handleDeleteSession(sid) {
    try {
      await deleteStudySession(sid);
      setSessions(prev => prev.filter(s => s.id !== sid));
    } catch {}
  }

  function newChat() {
    setMessages([]);
    setSessionId(null);
    setShowHistory(false);
  }

  function formatDate(d) {
    if (!d) return '';
    const date = new Date(d);
    const now = new Date();
    const diff = now - date;
    if (diff < 60000) return 'Just now';
    if (diff < 3600000) return `${Math.floor(diff / 60000)}m ago`;
    if (diff < 86400000) return `${Math.floor(diff / 3600000)}h ago`;
    return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
  }

  // History view
  if (showHistory) {
    return (
      <div className={`flex flex-col ${className}`}>
        <div className="flex items-center gap-2 px-4 py-3 border-b border-gray-200 dark:border-[#2A2A40] bg-white dark:bg-[#161622]">
          <button onClick={() => setShowHistory(false)} className="p-1 rounded-lg text-gray-400 hover:text-gray-600 dark:hover:text-gray-300">
            <ChevronLeft size={16} />
          </button>
          <History size={16} className="text-blue-500" />
          <span className="text-sm font-semibold text-gray-900 dark:text-gray-100">Chat History</span>
          <div className="flex-1" />
          <button onClick={newChat} className="flex items-center gap-1 text-xs text-blue-500 hover:text-blue-600 font-medium">
            <Plus size={12} /> New Chat
          </button>
        </div>

        <div className="flex-1 overflow-y-auto p-3 space-y-1.5">
          {loadingHistory && <p className="text-xs text-gray-400 text-center py-4">Loading...</p>}
          {!loadingHistory && sessions.length === 0 && (
            <p className="text-xs text-gray-400 text-center py-8">No past sessions</p>
          )}
          {sessions.map(s => (
            <div
              key={s.id}
              onClick={() => resumeSession(s.id)}
              className={`group flex items-start gap-3 px-3 py-2.5 rounded-lg cursor-pointer transition-colors hover:bg-gray-50 dark:hover:bg-[#1e1e2e] ${s.id === sessionId ? 'bg-blue-50 dark:bg-blue-900/15' : ''}`}
            >
              <div className="flex-1 min-w-0">
                <p className="text-xs font-medium text-gray-800 dark:text-gray-200 truncate">
                  {s.preview || 'New session'}
                </p>
                <p className="text-[10px] text-gray-400 mt-0.5">
                  {s.messageCount} msg{s.messageCount !== 1 ? 's' : ''} · {formatDate(s.lastMessageAt || s.startedAt)}
                </p>
              </div>
              <button
                onClick={e => { e.stopPropagation(); handleDeleteSession(s.id); }}
                className="opacity-0 group-hover:opacity-100 p-1 rounded text-gray-300 hover:text-rose-500 transition-all"
              >
                <Trash2 size={12} />
              </button>
            </div>
          ))}
        </div>
      </div>
    );
  }

  // Distinctive header — gradient strip, mode badge, action buttons.
  // NOT the simple "icon + title bar" pattern.
  const messageCount = messages.length;
  const header = (
    <div className="relative px-4 py-2.5 border-b border-gray-200 dark:border-[#2A2A40] bg-gradient-to-r from-blue-50 via-white to-indigo-50 dark:from-blue-950/30 dark:via-[#161622] dark:to-indigo-950/30">
      <div className="flex items-center gap-2.5">
        <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-blue-500 to-indigo-600 flex items-center justify-center text-white shadow-sm">
          <Sparkles size={14} />
        </div>
        <div className="flex-1 min-w-0">
          <p className="text-[13px] font-bold text-gray-900 dark:text-white leading-tight">Study Session</p>
          <p className="text-[10px] text-gray-500 dark:text-gray-400 tabular-nums">
            {messageCount === 0 ? 'New session — ready when you are' : `${messageCount} message${messageCount === 1 ? '' : 's'}`}
            {sourceMode && <span className="ml-2 inline-flex items-center gap-1 text-amber-600 dark:text-amber-400 font-semibold uppercase tracking-wider"><span className="w-1 h-1 rounded-full bg-amber-500" /> Web · 2×</span>}
          </p>
        </div>
        <button
          onClick={() => { loadHistory(); setShowHistory(true); }}
          className="inline-flex items-center gap-1 px-2 py-1 rounded text-[11px] font-medium text-gray-600 dark:text-gray-300 hover:bg-white dark:hover:bg-[#1e1e2e] transition-colors"
          title="Past sessions"
        >
          <History size={12} /> History
        </button>
        {sessionId && (
          <button
            onClick={newChat}
            className="inline-flex items-center gap-1 px-2 py-1 rounded text-[11px] font-semibold text-blue-600 dark:text-blue-400 hover:bg-white dark:hover:bg-[#1e1e2e] transition-colors"
          >
            <Plus size={11} /> New
          </button>
        )}
      </div>
    </div>
  );

  function handleUserEdit(idx, newContent) {
    if (streaming) return;
    if (abortRef.current) try { abortRef.current(); } catch {}
    setMessages(prev => prev.slice(0, idx));
    setTimeout(() => doSend(newContent), 30);
  }
  // Regenerate the AI bubble in place — do not show the instruction as a
  // user turn. We rely on doSend-with-hidden-first-message pattern.
  function handleAiInstruct(idx, instruction) {
    if (streaming || !instruction?.trim()) return;
    let userIdx = idx - 1;
    while (userIdx >= 0 && messages[userIdx]?.role !== 'user') userIdx--;
    if (userIdx < 0) return;
    const prevUserText = messages[userIdx].content || '';
    const userMsgSnapshot = messages[userIdx];
    if (abortRef.current) try { abortRef.current(); } catch {}
    setMessages(prev => [...prev.slice(0, userIdx), userMsgSnapshot]);
    const hidden = `${prevUserText}\n\n[SYSTEM NOTE: Regenerate your previous answer — this time ${instruction.trim()}. Do NOT acknowledge this instruction. Just output the revised answer directly.]`;
    setTimeout(() => doSend(hidden, { hideUserInDisplay: true }), 30);
  }

  // Rich empty state — quick-prompt cards, NOT ChatGPT's blank greeting.
  const emptyState = (
    <div className="h-full flex flex-col items-center justify-center px-4 py-6">
      <div className="w-12 h-12 rounded-2xl bg-gradient-to-br from-blue-500 to-indigo-600 flex items-center justify-center text-white shadow-lg shadow-blue-500/20 mb-4">
        <Sparkles size={22} />
      </div>
      <h2 className="text-base font-bold text-gray-900 dark:text-white mb-1">What do you want to work on?</h2>
      <p className="text-[12px] text-gray-500 dark:text-gray-400 max-w-sm text-center mb-5">
        Ask anything, request a quiz, walk through a concept, or just say "what should I study?"
      </p>
      <div className="grid sm:grid-cols-2 gap-2 w-full max-w-md">
        {QUICK_PROMPTS.map((p, i) => {
          const Icon = p.icon;
          return (
            <button
              key={i}
              onClick={() => doSend(p.prompt)}
              disabled={streaming}
              className="group text-left flex items-start gap-2.5 p-3 rounded-xl border border-gray-200 dark:border-[#2A2A40] bg-white dark:bg-[#161622] hover:border-blue-400 dark:hover:border-blue-600 hover:bg-blue-50/40 dark:hover:bg-blue-900/10 transition-colors disabled:opacity-50"
            >
              <div className="w-7 h-7 rounded-md bg-blue-50 dark:bg-blue-900/30 flex items-center justify-center text-blue-600 dark:text-blue-400 flex-shrink-0">
                <Icon size={13} />
              </div>
              <p className="text-[12px] font-medium text-gray-800 dark:text-gray-200 leading-snug pt-0.5">{p.label}</p>
            </button>
          );
        })}
      </div>
      <p className="text-[10px] text-gray-400 dark:text-gray-500 mt-5">
        Tap a prompt or just type below.
      </p>
    </div>
  );

  return (
    <ChatContainer
      messages={messages}
      streamingContent={streamingContent}
      streamingSources={streamingSources}
      searchStatus={searchStatus}
      onSend={handleSend}
      disabled={streaming}
      placeholder={streaming ? 'AI is thinking...' : 'Message...'}
      header={header}
      className={className}
      sourceMode={sourceMode}
      onToggleSource={setSourceMode}
      onUserEditMessage={handleUserEdit}
      onAiInstruct={handleAiInstruct}
      emptyState={emptyState}
    />
  );
}
