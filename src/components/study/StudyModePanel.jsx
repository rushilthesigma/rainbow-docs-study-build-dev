import { useState, useRef, useCallback, useEffect } from 'react';
import { History, Trash2, Plus, ChevronLeft, Compass, Lightbulb, Calculator, Beaker, Sparkles, Swords, BookOpen, Link2, X, Check, Paperclip, Globe } from 'lucide-react';
import { sendStudyMessage, listStudySessions, getStudySession, deleteStudySession, listCurricula, extractSourceUrl, extractFiles } from '../../api/curriculum';
import ChatContainer from '../chat/ChatContainer';
import DebatePanel from './DebatePanel';
import { errorChatMessage } from '../../utils/aiErrors';
import { InlineProgress } from '../shared/ProgressBar';

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

export default function StudyModePanel({ className = '', flush = false, initialMessage }) {
  const [messages, setMessages] = useState([]);
  const [streamingContent, setStreamingContent] = useState('');
  const [streamingSources, setStreamingSources] = useState([]);
  const [searchStatus, setSearchStatus] = useState(null);
  const [sourceMode, setSourceMode] = useState(false);
  const [streaming, setStreaming] = useState(false);
  const [sessionId, setSessionId] = useState(null);
  // Debate sub-view — replaces the chat with the DebatePanel when true.
  const [debateOpen, setDebateOpen] = useState(false);
  // Curriculum integration + extra sources. Both flow into the
  // request `context` object on every send. Sheets toggle from the
  // header buttons. Sources are { id, title, url?, content }.
  const [linkedCurriculumId, setLinkedCurriculumId] = useState(null);
  const [sources, setSources] = useState([]);
  const [showCurriculumPicker, setShowCurriculumPicker] = useState(false);
  const [showSourcesSheet, setShowSourcesSheet] = useState(false);
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

    // Build the context payload — only include what the server cares
    // about. `sources` already contains extracted text from /api/files
    // /extract-url so the server doesn't have to re-fetch.
    const ctx = {};
    if (linkedCurriculumId) ctx.curriculumId = linkedCurriculumId;
    if (sources.length) {
      ctx.sources = sources.map((s) => ({
        title: s.title || s.name || s.url || 'Source',
        url: s.url || null,
        content: s.content || s.text || '',
      }));
    }

    const abort = sendStudyMessage(text, sessionId, ctx, images, {
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
        <div className="flex items-center gap-2 px-4 py-3 bg-transparent">
          <button onClick={() => setShowHistory(false)} className="p-1 rounded-lg text-gray-400 hover:text-gray-600 dark:hover:text-gray-300">
            <ChevronLeft size={16} />
          </button>
          <History size={16} className="text-gray-500 dark:text-gray-400" />
          <span className="text-sm font-semibold text-gray-900 dark:text-gray-100">Chat History</span>
          <div className="flex-1" />
          <button onClick={newChat} className="flex items-center gap-1 text-xs text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-200 font-medium">
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
              className={`group flex items-start gap-3 px-3 py-2.5 rounded-xl cursor-pointer transition-colors hover:bg-white/50 dark:hover:bg-white/[0.05] ${s.id === sessionId ? 'bg-white/60 dark:bg-white/[0.08]' : ''}`}
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
    <div className="flex items-center gap-2 px-3 py-2.5 bg-transparent">
      <div className="w-7 h-7 rounded-xl bg-white/20 dark:bg-white/10 border border-white/40 dark:border-white/15 flex items-center justify-center text-gray-700 dark:text-gray-200 flex-shrink-0">
        <Sparkles size={13} />
      </div>
      <span className="text-[13px] font-bold text-gray-900 dark:text-white">Study</span>
      <div className="flex-1" />
      <button
        onClick={() => setShowCurriculumPicker(true)}
        title="Integrate with a curriculum"
        className={`p-1.5 rounded-lg transition-colors ${linkedCurriculumId ? 'text-white bg-white/20' : 'text-white/70 hover:text-white hover:bg-white/[0.15]'}`}
      >
        <BookOpen size={14} />
      </button>
      <button
        onClick={() => setShowSourcesSheet(true)}
        title="Attach sources"
        className={`p-1.5 rounded-lg transition-colors relative ${sources.length ? 'text-white bg-white/20' : 'text-white/70 hover:text-white hover:bg-white/[0.15]'}`}
      >
        <Link2 size={14} />
        {sources.length > 0 && <span className="absolute -top-0.5 -right-0.5 w-3.5 h-3.5 rounded-full bg-white/80 text-gray-900 text-[8px] font-bold flex items-center justify-center">{sources.length}</span>}
      </button>
      <button
        onClick={() => setDebateOpen(true)}
        title="Debate mode"
        className="p-1.5 rounded-lg text-white/70 hover:text-white hover:bg-white/[0.15] transition-colors"
      >
        <Swords size={14} />
      </button>
      <button
        onClick={() => { loadHistory(); setShowHistory(true); }}
        title="History"
        className="p-1.5 rounded-lg text-white/70 hover:text-white hover:bg-white/[0.15] transition-colors"
      >
        <History size={14} />
      </button>
      {sessionId && (
        <button
          onClick={newChat}
          title="New chat"
          className="p-1.5 rounded-lg text-white/70 hover:text-white hover:bg-white/[0.15] transition-colors"
        >
          <Plus size={14} />
        </button>
      )}
    </div>
  );

  // Debate sub-view replaces the entire chat surface while open.
  if (debateOpen) {
    return (
      <div className={`flex flex-col ${className}`}>
        <DebatePanel onBack={() => setDebateOpen(false)} />
      </div>
    );
  }

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
      <div className="grid sm:grid-cols-2 gap-2 w-full max-w-md">
        {QUICK_PROMPTS.map((p, i) => {
          const Icon = p.icon;
          return (
            <button
              key={i}
              onClick={() => doSend(p.prompt)}
              disabled={streaming}
              className="group text-left flex items-start gap-2.5 p-3 rounded-xl border border-white/[0.08] dark:border-white/[0.07] bg-white/[0.03] dark:bg-white/[0.03] hover:bg-white/[0.07] dark:hover:bg-white/[0.06] transition-colors duration-150 disabled:opacity-50"
            >
              <div className="w-7 h-7 rounded-md bg-white/[0.07] dark:bg-white/[0.06] flex items-center justify-center text-gray-500 dark:text-gray-400 flex-shrink-0">
                <Icon size={13} />
              </div>
              <p className="text-[12px] font-medium text-gray-800 dark:text-gray-200 leading-snug pt-0.5">{p.label}</p>
            </button>
          );
        })}
      </div>
    </div>
  );

  return (
    <>
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
        flush={flush}
      />
      {showCurriculumPicker && (
        <CurriculumPickerModal
          activeId={linkedCurriculumId}
          onClose={() => setShowCurriculumPicker(false)}
          onPick={(id) => { setLinkedCurriculumId(id); setShowCurriculumPicker(false); }}
        />
      )}
      {showSourcesSheet && (
        <SourcesModal
          sources={sources}
          onClose={() => setShowSourcesSheet(false)}
          onChange={setSources}
        />
      )}
    </>
  );
}

// ===== Curriculum picker modal =====
//
// Lists the user's curricula. The "None" row clears the link. Clicking
// any course wires its id into the next study send's `context` so the
// system prompt scopes answers to that course.
function CurriculumPickerModal({ activeId, onClose, onPick }) {
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);
  useEffect(() => {
    listCurricula()
      .then((d) => setItems(d.curricula || []))
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);
  return (
    <ModalShell title="Integrate with a course" onClose={onClose}>
      <p className="text-[12px] text-gray-500 dark:text-gray-400 mb-3">
        The AI will scope its answers to this course&apos;s units + lessons.
      </p>
      <div className="space-y-1.5 max-h-[380px] overflow-y-auto pr-1">
        <PickRow active={activeId == null} onClick={() => onPick(null)} title="None" sub="Free-form study chat" />
        {loading && <p className="text-[12px] text-gray-400 py-3 text-center">Loading…</p>}
        {!loading && items.map((c) => {
          const totalLessons = (c.units || []).reduce((s, u) => s + (u.lessons?.length || 0), 0);
          return (
            <PickRow
              key={c.id}
              active={activeId === c.id}
              onClick={() => onPick(c.id)}
              title={c.title}
              sub={`${c.units?.length || 0} unit${c.units?.length === 1 ? '' : 's'} · ${totalLessons} lesson${totalLessons === 1 ? '' : 's'}`}
            />
          );
        })}
      </div>
    </ModalShell>
  );
}

function PickRow({ active, onClick, title, sub }) {
  return (
    <button
      onClick={onClick}
      className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-xl border text-left transition-colors ${
        active
          ? 'border-white/30 bg-white/10 dark:bg-white/[0.07]'
          : 'border-gray-200 dark:border-white/[0.08] bg-white dark:bg-[#111111] hover:border-gray-400/60'
      }`}
    >
      <div className={`w-8 h-8 rounded-lg grid place-items-center shrink-0 ${active ? 'bg-white/20 text-white' : 'bg-white/10 dark:bg-white/[0.07] text-gray-500 dark:text-gray-400'}`}>
        <BookOpen size={15} />
      </div>
      <div className="flex-1 min-w-0">
        <p className="text-[13px] font-bold text-gray-900 dark:text-white truncate">{title}</p>
        <p className="text-[11px] text-gray-500 dark:text-gray-400 truncate">{sub}</p>
      </div>
      {active && <Check size={14} className="text-gray-500 dark:text-gray-300 shrink-0" strokeWidth={3} />}
    </button>
  );
}

// ===== Sources modal =====
//
// Add URLs (server-side fetch + extract) or PDF/text files (multipart
// upload + extract). Each chip shows a status. Send turns include the
// extracted text in the prompt context.
function SourcesModal({ sources, onClose, onChange }) {
  const [url, setUrl] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const fileRef = useRef(null);

  async function addUrl(e) {
    e?.preventDefault?.();
    const u = url.trim();
    if (!u || busy) return;
    setBusy(true); setError('');
    try {
      const s = await extractSourceUrl(u);
      onChange([...sources, { id: crypto.randomUUID?.() || String(Date.now()), ...s }]);
      setUrl('');
    } catch (err) {
      setError(err.message || 'Failed to fetch URL');
    } finally { setBusy(false); }
  }

  async function addFiles(e) {
    const files = Array.from(e.target.files || []);
    if (!files.length) return;
    setBusy(true); setError('');
    try {
      const { files: extracted = [] } = await extractFiles(files);
      const next = [...sources];
      for (const f of extracted) {
        if (f.error) { setError(`${f.name}: ${f.error}`); continue; }
        next.push({
          id: crypto.randomUUID?.() || String(Date.now() + Math.random()),
          title: f.name, kind: f.kind, content: f.text,
        });
      }
      onChange(next);
    } catch (err) {
      setError(err.message || 'Failed to extract files');
    } finally {
      setBusy(false);
      if (fileRef.current) fileRef.current.value = '';
    }
  }

  function remove(id) {
    onChange(sources.filter((s) => s.id !== id));
  }

  return (
    <ModalShell title="Sources" onClose={onClose}>
      <p className="text-[12px] text-gray-500 dark:text-gray-400 mb-3">
        Drop URLs or PDFs the AI should reference. Cited inline as [1], [2], …
      </p>

      <form onSubmit={addUrl} className="flex items-center gap-2 mb-2">
        <div className="relative flex-1">
          <Globe size={13} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
          <input
            value={url}
            onChange={(e) => setUrl(e.target.value)}
            placeholder="https://…"
            className="w-full pl-8 pr-3 py-2 rounded-lg border border-gray-200 dark:border-white/[0.08] bg-white dark:bg-[#111111] text-[13px] text-gray-900 dark:text-white outline-none focus:border-white/30"
          />
        </div>
        <button
          type="submit"
          disabled={!url.trim() || busy}
          className="inline-flex items-center gap-1 px-3 py-2 rounded-lg bg-white/15 hover:bg-white/25 text-white text-[12px] font-bold disabled:opacity-50 border border-white/20"
        >
          {busy ? <InlineProgress active /> : <><Plus size={11} /> Add URL</>}
        </button>
      </form>

      <button
        type="button"
        onClick={() => fileRef.current?.click()}
        disabled={busy}
        className="w-full inline-flex items-center justify-center gap-1.5 py-2 rounded-lg border border-dashed border-gray-300 dark:border-white/[0.08] text-[12px] text-gray-600 dark:text-gray-300 hover:border-gray-400 disabled:opacity-50"
      >
        <Paperclip size={12} /> Attach PDFs or text files
      </button>
      <input
        ref={fileRef}
        type="file"
        multiple
        accept="application/pdf,text/plain,text/markdown,.md,.txt"
        onChange={addFiles}
        className="hidden"
      />

      {error && <p className="mt-2 text-[11.5px] text-rose-500">{error}</p>}

      {sources.length > 0 && (
        <div className="mt-4 space-y-1.5 max-h-[260px] overflow-y-auto pr-1">
          {sources.map((s, i) => (
            <div key={s.id} className="flex items-center gap-3 px-3 py-2 rounded-xl border border-gray-200 dark:border-white/[0.08] bg-gray-50 dark:bg-[#111111]">
              <span className="text-[10px] font-mono font-bold text-gray-400 dark:text-gray-500 w-5 text-center">[{i + 1}]</span>
              <div className="flex-1 min-w-0">
                <p className="text-[12.5px] font-semibold text-gray-900 dark:text-white truncate">{s.title || s.url || 'Source'}</p>
                {s.url && <p className="text-[10.5px] text-gray-500 dark:text-gray-400 truncate">{s.url}</p>}
                {!s.url && s.content && <p className="text-[10.5px] text-gray-500 dark:text-gray-400">{(s.content.split(/\s+/).filter(Boolean).length)} words</p>}
              </div>
              <button onClick={() => remove(s.id)} aria-label="Remove" className="p-1 text-gray-400 hover:text-rose-500">
                <X size={13} />
              </button>
            </div>
          ))}
        </div>
      )}
    </ModalShell>
  );
}

// ===== Modal shell =====
function ModalShell({ title, onClose, children }) {
  useEffect(() => {
    function onKey(e) { if (e.key === 'Escape') onClose(); }
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);
  return (
    <div className="fixed inset-0 z-[80] flex items-center justify-center px-4">
      <button aria-label="Close" onClick={onClose} className="absolute inset-0 bg-black/55 backdrop-blur-[2px] animate-fade-in" />
      <div className="relative w-full max-w-md rounded-2xl bg-white dark:bg-[#1a1a1a] border border-gray-200 dark:border-white/10 shadow-2xl p-5">
        <div className="flex items-center justify-between mb-3">
          <h3 className="text-[14.5px] font-bold text-gray-900 dark:text-white">{title}</h3>
          <button onClick={onClose} className="w-8 h-8 rounded-full grid place-items-center text-gray-400 hover:text-gray-700 dark:hover:text-gray-200">
            <X size={15} />
          </button>
        </div>
        {children}
      </div>
    </div>
  );
}
