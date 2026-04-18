import { useState, useRef, useCallback, useEffect } from 'react';
import { MessageSquare, History, Trash2, Plus, ChevronLeft } from 'lucide-react';
import { sendStudyMessage, listStudySessions, getStudySession, deleteStudySession } from '../../api/curriculum';
import ChatContainer from '../chat/ChatContainer';

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
    const userMsg = { role: 'user', content: text, timestamp: new Date().toISOString() };
    setMessages(prev => [...prev, userMsg]);
    setStreaming(true);
    setStreamingContent('');
    setStreamingSources([]);
    setSearchStatus(wasSourced ? 'searching' : null);
    streamContentRef.current = '';
    streamSourcesRef.current = [];

    const abort = sendStudyMessage(text, sessionId, {}, {
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
        setMessages(m => [...m, { role: 'assistant', content: `Error: ${err}` }]);
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

  const handleSend = useCallback((text) => {
    if (streaming) return;
    doSend(text);
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

  const header = (
    <div className="flex items-center gap-2 px-4 py-3 border-b border-gray-200 dark:border-[#2A2A40] bg-white dark:bg-[#161622]">
      <MessageSquare size={16} className="text-blue-500" />
      <span className="text-sm font-semibold text-gray-900 dark:text-gray-100">Study Mode</span>
      <div className="flex-1" />
      <button
        onClick={() => { loadHistory(); setShowHistory(true); }}
        className="p-1.5 rounded-lg text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 hover:bg-gray-100 dark:hover:bg-[#1e1e2e]"
        title="Chat history"
      >
        <History size={14} />
      </button>
      {sessionId && (
        <button
          onClick={newChat}
          className="text-xs text-gray-400 hover:text-gray-600 dark:hover:text-gray-300"
        >
          New Chat
        </button>
      )}
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
    />
  );
}
