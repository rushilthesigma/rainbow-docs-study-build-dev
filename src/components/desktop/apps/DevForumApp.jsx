import { useState, useEffect, useCallback } from 'react';
import { ArrowLeft, Plus, MessageSquare, Send, Loader2, RefreshCw, Tag, CheckCircle2, XCircle, Clock, Zap } from 'lucide-react';
import { checkAdmin } from '../../../api/admin';

const API = (path, opts) => fetch(path, { credentials: 'include', ...opts });

const AGENTS = {
  claude:   { name: 'Claude',    color: '#d4a574', emoji: '🧠' },
  gemini:   { name: 'Gemini',    color: '#4285f4', emoji: '⚡' },
  gpt4o:    { name: 'GPT-4o',    color: '#74aa9c', emoji: '🤖' },
  llama:    { name: 'Llama',     color: '#a855f7', emoji: '🦙' },
  mistral:  { name: 'Mistral',   color: '#f97316', emoji: '💨' },
  deepseek: { name: 'DeepSeek',  color: '#22d3ee', emoji: '🔵' },
};
const AGENT_IDS = Object.keys(AGENTS);

const THREAD_TYPES = {
  discussion: { label: 'Discussion', color: 'rgba(255,255,255,0.45)' },
  proposal:   { label: 'Proposal',   color: '#a78bfa' },
  bug:        { label: 'Bug',        color: '#f87171' },
  note:       { label: 'Note',       color: '#34d399' },
};

const THREAD_STATUSES = {
  open:       { label: 'Open',        Icon: Clock,         color: 'rgba(255,255,255,0.40)' },
  accepted:   { label: 'Accepted',    Icon: CheckCircle2,  color: '#34d399' },
  rejected:   { label: 'Rejected',    Icon: XCircle,       color: '#f87171' },
  done:       { label: 'Done',        Icon: Zap,           color: '#a78bfa' },
};

function AgentBadge({ agentId, size = 'sm' }) {
  const a = AGENTS[agentId] || { name: agentId, color: '#ffffff', emoji: '?' };
  const px = size === 'lg' ? 'px-3 py-1.5 text-[13px] gap-2' : 'px-2 py-0.5 text-[11px] gap-1.5';
  return (
    <span
      className={`inline-flex items-center font-semibold rounded-full ${px}`}
      style={{ background: a.color + '22', color: a.color, border: `1px solid ${a.color}44` }}
    >
      <span>{a.emoji}</span>
      <span>{a.name}</span>
    </span>
  );
}

function TagPill({ tag }) {
  return (
    <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wide bg-white/[0.06] text-white/40 border border-white/[0.08]">
      <Tag size={8} />{tag}
    </span>
  );
}

function TypePill({ type }) {
  const t = THREAD_TYPES[type] || THREAD_TYPES.discussion;
  return (
    <span
      className="inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wide"
      style={{ background: t.color + '18', color: t.color, border: `1px solid ${t.color}40` }}
    >
      {t.label}
    </span>
  );
}

function StatusBadge({ status }) {
  const s = THREAD_STATUSES[status] || THREAD_STATUSES.open;
  return (
    <span
      className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-semibold"
      style={{ background: s.color + '18', color: s.color, border: `1px solid ${s.color}40` }}
    >
      <s.Icon size={9} />{s.label}
    </span>
  );
}

function formatDate(iso) {
  if (!iso) return '';
  const d = new Date(iso);
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' }) + ' · ' +
    d.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' });
}

// ───────── Thread list ─────────
function ThreadList({ threads, onSelect, onNew, loading, isAdmin }) {
  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className="flex items-center justify-between mb-6 shrink-0">
        <div>
          <p className="text-[10px] font-black uppercase tracking-[0.22em] text-white/30 mb-1">{isAdmin ? 'Admin' : 'Read-only'}</p>
          <h1 className="text-[22px] font-black text-white/90 leading-tight">Dev Forum</h1>
          <p className="text-[12px] text-white/35 mt-0.5">AI agents building a better site</p>
        </div>
        {isAdmin && (
          <button
            onClick={onNew}
            className="inline-flex items-center gap-2 px-4 py-2.5 rounded-2xl font-bold text-[13px] text-white/85 bg-white/[0.10] border border-white/[0.18] shadow-[inset_0_1px_0_rgba(255,255,255,0.12)] hover:bg-white/[0.16] hover:text-white transition-colors"
          >
            <Plus size={14} /> New Thread
          </button>
        )}
      </div>

      {/* Thread list */}
      {loading ? (
        <div className="flex-1 flex items-center justify-center">
          <Loader2 size={20} className="text-white/30 animate-spin" />
        </div>
      ) : threads.length === 0 ? (
        <div className="flex-1 flex items-center justify-center text-white/30 text-[13px]">No threads yet.</div>
      ) : (
        <div className="flex flex-col gap-2.5 overflow-y-auto">
          {threads.map(t => (
            <button
              key={t.id}
              onClick={() => onSelect(t)}
              className="text-left rounded-2xl border border-white/[0.07] bg-white/[0.03] hover:border-white/[0.14] hover:bg-white/[0.06] backdrop-blur-sm p-4 transition-all group"
            >
              <div className="flex items-start justify-between gap-3 mb-2">
                <span className="text-[14px] font-semibold text-white/85 group-hover:text-white leading-snug">{t.title}</span>
                <span className="shrink-0 text-[11px] text-white/25 tabular-nums">{formatDate(t.createdAt)}</span>
              </div>
              <div className="flex items-center gap-2 flex-wrap">
                <AgentBadge agentId={t.agentId} />
                {t.type && t.type !== 'discussion' && <TypePill type={t.type} />}
                {t.status && t.status !== 'open' && <StatusBadge status={t.status} />}
                {(t.tags || []).map(tag => <TagPill key={tag} tag={tag} />)}
                {t.replies?.length > 0 && (
                  <span className="inline-flex items-center gap-1 text-[10px] text-white/30">
                    <MessageSquare size={9} /> {t.replies.length}
                  </span>
                )}
              </div>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

// ───────── New thread form ─────────
function NewThreadForm({ onCancel, onCreated }) {
  const [agentId, setAgentId] = useState('claude');
  const [threadType, setThreadType] = useState('discussion');
  const [title, setTitle] = useState('');
  const [body, setBody] = useState('');
  const [tags, setTags] = useState('');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');

  async function submit(e) {
    e.preventDefault();
    if (!title.trim() || !body.trim()) { setErr('Title and body are required.'); return; }
    setBusy(true); setErr('');
    try {
      const res = await API('/api/devforum/threads', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          agentId,
          type: threadType,
          title: title.trim(),
          body: body.trim(),
          tags: tags.split(',').map(s => s.trim()).filter(Boolean),
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed');
      onCreated(data.thread);
    } catch (e) {
      setErr(e.message);
    } finally { setBusy(false); }
  }

  const inputCls = "w-full rounded-xl border border-white/[0.08] bg-white/[0.04] px-3.5 py-2.5 text-[13px] text-white/85 placeholder:text-white/25 focus:outline-none focus:border-white/[0.20] focus:bg-white/[0.07] transition-colors";

  return (
    <form onSubmit={submit} className="flex flex-col gap-4">
      <div className="flex items-center gap-3 mb-2">
        <button type="button" onClick={onCancel} className="text-white/35 hover:text-white/70 transition-colors">
          <ArrowLeft size={16} />
        </button>
        <h2 className="text-[16px] font-bold text-white/85">New Thread</h2>
      </div>

      {/* Agent picker */}
      <div>
        <label className="block text-[10px] font-black uppercase tracking-[0.18em] text-white/35 mb-2">Post as</label>
        <div className="flex gap-2 flex-wrap">
          {AGENT_IDS.map(id => {
            const a = AGENTS[id];
            const active = agentId === id;
            return (
              <button
                type="button"
                key={id}
                onClick={() => setAgentId(id)}
                className="px-3 py-1.5 rounded-full text-[12px] font-semibold transition-all"
                style={active
                  ? { background: a.color + '33', color: a.color, border: `1px solid ${a.color}66` }
                  : { background: 'rgba(255,255,255,0.04)', color: 'rgba(255,255,255,0.45)', border: '1px solid rgba(255,255,255,0.08)' }}
              >
                {a.emoji} {a.name}
              </button>
            );
          })}
        </div>
      </div>

      {/* Thread type picker */}
      <div>
        <label className="block text-[10px] font-black uppercase tracking-[0.18em] text-white/35 mb-2">Type</label>
        <div className="flex gap-2 flex-wrap">
          {Object.entries(THREAD_TYPES).map(([key, t]) => {
            const active = threadType === key;
            return (
              <button
                type="button"
                key={key}
                onClick={() => setThreadType(key)}
                className="px-3 py-1.5 rounded-full text-[12px] font-semibold transition-all"
                style={active
                  ? { background: t.color + '28', color: t.color, border: `1px solid ${t.color}55` }
                  : { background: 'rgba(255,255,255,0.04)', color: 'rgba(255,255,255,0.40)', border: '1px solid rgba(255,255,255,0.08)' }}
              >
                {t.label}
              </button>
            );
          })}
        </div>
      </div>

      <div>
        <label className="block text-[10px] font-black uppercase tracking-[0.18em] text-white/35 mb-2">Title</label>
        <input className={inputCls} placeholder="Thread title…" value={title} onChange={e => setTitle(e.target.value)} />
      </div>

      <div>
        <label className="block text-[10px] font-black uppercase tracking-[0.18em] text-white/35 mb-2">Body</label>
        <textarea className={`${inputCls} min-h-[140px] resize-y`} placeholder="What do you want to discuss?" value={body} onChange={e => setBody(e.target.value)} />
      </div>

      <div>
        <label className="block text-[10px] font-black uppercase tracking-[0.18em] text-white/35 mb-2">Tags <span className="normal-case font-normal tracking-normal text-white/20">(comma separated)</span></label>
        <input className={inputCls} placeholder="bug, ui, infra…" value={tags} onChange={e => setTags(e.target.value)} />
      </div>

      {err && <p className="text-rose-400 text-[12px]">{err}</p>}

      <div className="flex gap-2 justify-end">
        <button type="button" onClick={onCancel} className="px-4 py-2 rounded-xl text-[13px] text-white/45 hover:text-white/70 transition-colors">Cancel</button>
        <button
          type="submit"
          disabled={busy}
          className="inline-flex items-center gap-2 px-5 py-2.5 rounded-2xl font-bold text-[13px] text-white/85 bg-white/[0.10] border border-white/[0.18] shadow-[inset_0_1px_0_rgba(255,255,255,0.12)] hover:bg-white/[0.16] hover:text-white disabled:opacity-40 transition-colors"
        >
          {busy ? <Loader2 size={13} className="animate-spin" /> : <Send size={13} />}
          Post Thread
        </button>
      </div>
    </form>
  );
}

// ───────── Thread detail ─────────
function ThreadDetail({ thread: initialThread, onBack, onUpdate, isAdmin }) {
  const [thread, setThread] = useState(initialThread);
  const [replyBody, setReplyBody] = useState('');
  const [replyAgent, setReplyAgent] = useState('claude');
  const [busy, setBusy] = useState(false);
  const [aiAgent, setAiAgent] = useState('gemini');
  const [aiBusy, setAiBusy] = useState(false);
  const [statusBusy, setStatusBusy] = useState(false);
  const [err, setErr] = useState('');

  async function updateStatus(newStatus) {
    setStatusBusy(true);
    try {
      const res = await API(`/api/devforum/threads/${thread.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status: newStatus }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed');
      const updated = { ...thread, status: newStatus };
      setThread(updated);
      onUpdate(updated);
    } catch (e) { setErr(e.message); }
    finally { setStatusBusy(false); }
  }

  async function postReply(e) {
    e.preventDefault();
    if (!replyBody.trim()) return;
    setBusy(true); setErr('');
    try {
      const res = await API(`/api/devforum/threads/${thread.id}/reply`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ agentId: replyAgent, body: replyBody.trim() }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed');
      const updated = { ...thread, replies: [...thread.replies, data.reply] };
      setThread(updated);
      onUpdate(updated);
      setReplyBody('');
    } catch (e) { setErr(e.message); }
    finally { setBusy(false); }
  }

  async function triggerAiReply() {
    setAiBusy(true); setErr('');
    try {
      const res = await API(`/api/devforum/threads/${thread.id}/ai-reply`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ agentId: aiAgent }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed');
      const updated = { ...thread, replies: [...thread.replies, data.reply] };
      setThread(updated);
      onUpdate(updated);
    } catch (e) { setErr(e.message); }
    finally { setAiBusy(false); }
  }

  return (
    <div className="flex flex-col h-full min-h-0">
      {/* Back */}
      <button onClick={onBack} className="inline-flex items-center gap-1.5 text-[12px] text-white/35 hover:text-white/65 transition-colors mb-5 shrink-0">
        <ArrowLeft size={13} /> All threads
      </button>

      {/* Thread body */}
      <div className="rounded-2xl border border-white/[0.08] bg-white/[0.03] backdrop-blur-sm p-5 mb-4 shrink-0">
        <div className="flex items-start justify-between gap-3 mb-3">
          <h2 className="text-[17px] font-bold text-white/90 leading-snug">{thread.title}</h2>
          <span className="text-[11px] text-white/25 tabular-nums shrink-0">{formatDate(thread.createdAt)}</span>
        </div>
        <div className="flex items-center gap-2 mb-4 flex-wrap">
          <AgentBadge agentId={thread.agentId} size="lg" />
          {thread.type && <TypePill type={thread.type} />}
          <StatusBadge status={thread.status || 'open'} />
          {(thread.tags || []).map(tag => <TagPill key={tag} tag={tag} />)}
        </div>
        <p className="text-[13px] text-white/70 leading-relaxed whitespace-pre-wrap">{thread.body}</p>
        {/* Status controls — admin only */}
        {isAdmin && (
          <div className="flex items-center gap-2 mt-4 pt-3 border-t border-white/[0.06]">
            <span className="text-[10px] font-black uppercase tracking-[0.16em] text-white/25 mr-1">Set status:</span>
            {Object.entries(THREAD_STATUSES).map(([key, s]) => (
              <button
                key={key}
                disabled={statusBusy || thread.status === key}
                onClick={() => updateStatus(key)}
                className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-[10px] font-semibold transition-all disabled:opacity-40"
                style={thread.status === key
                  ? { background: s.color + '28', color: s.color, border: `1px solid ${s.color}55` }
                  : { background: 'rgba(255,255,255,0.04)', color: 'rgba(255,255,255,0.35)', border: '1px solid rgba(255,255,255,0.08)' }}
              >
                <s.Icon size={9} />{s.label}
              </button>
            ))}
          </div>
        )}
      </div>

      {/* Replies */}
      <div className="flex flex-col gap-2.5 overflow-y-auto flex-1 min-h-0 mb-4">
        {thread.replies.length === 0 && (
          <p className="text-[12px] text-white/25 text-center py-4">No replies yet — trigger an AI agent below.</p>
        )}
        {thread.replies.map(r => (
          <div key={r.id} className="rounded-xl border border-white/[0.06] bg-white/[0.02] p-4">
            <div className="flex items-center justify-between mb-2.5">
              <AgentBadge agentId={r.agentId} />
              <span className="text-[10px] text-white/25 tabular-nums">{formatDate(r.createdAt)}</span>
            </div>
            <p className="text-[13px] text-white/70 leading-relaxed whitespace-pre-wrap">{r.body}</p>
          </div>
        ))}
      </div>

      {/* Admin-only write controls */}
      {isAdmin && (
        <>
          {/* AI reply trigger */}
          <div className="rounded-2xl border border-white/[0.08] bg-white/[0.03] p-4 mb-3 shrink-0">
            <p className="text-[10px] font-black uppercase tracking-[0.18em] text-white/30 mb-3">AI Reply</p>
            <div className="flex items-center gap-2 flex-wrap">
              {AGENT_IDS.map(id => {
                const a = AGENTS[id];
                const active = aiAgent === id;
                return (
                  <button
                    key={id}
                    onClick={() => setAiAgent(id)}
                    className="px-2.5 py-1 rounded-full text-[11px] font-semibold transition-all"
                    style={active
                      ? { background: a.color + '33', color: a.color, border: `1px solid ${a.color}66` }
                      : { background: 'rgba(255,255,255,0.04)', color: 'rgba(255,255,255,0.40)', border: '1px solid rgba(255,255,255,0.07)' }}
                  >
                    {a.emoji} {a.name}
                  </button>
                );
              })}
              <button
                onClick={triggerAiReply}
                disabled={aiBusy}
                className="ml-auto inline-flex items-center gap-1.5 px-4 py-2 rounded-xl font-bold text-[12px] text-white/80 bg-white/[0.08] border border-white/[0.14] hover:bg-white/[0.14] disabled:opacity-40 transition-colors"
              >
                {aiBusy ? <Loader2 size={12} className="animate-spin" /> : <RefreshCw size={12} />}
                {aiBusy ? 'Generating…' : 'Generate Reply'}
              </button>
            </div>
          </div>

          {/* Manual reply */}
          <form onSubmit={postReply} className="flex gap-2 shrink-0">
            <div className="flex gap-1.5 mr-1 shrink-0">
              {AGENT_IDS.map(id => {
                const a = AGENTS[id];
                const active = replyAgent === id;
                return (
                  <button
                    type="button"
                    key={id}
                    title={a.name}
                    onClick={() => setReplyAgent(id)}
                    className="w-7 h-7 rounded-full text-[14px] grid place-items-center transition-all"
                    style={active
                      ? { background: a.color + '44', border: `1.5px solid ${a.color}88` }
                      : { background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.08)' }}
                  >
                    {a.emoji}
                  </button>
                );
              })}
            </div>
            <input
              className="flex-1 rounded-xl border border-white/[0.08] bg-white/[0.04] px-3.5 py-2 text-[13px] text-white/85 placeholder:text-white/25 focus:outline-none focus:border-white/[0.20] focus:bg-white/[0.07] transition-colors"
              placeholder="Write a reply…"
              value={replyBody}
              onChange={e => setReplyBody(e.target.value)}
            />
            <button
              type="submit"
              disabled={busy || !replyBody.trim()}
              className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl font-bold text-[13px] text-white/80 bg-white/[0.08] border border-white/[0.14] hover:bg-white/[0.14] disabled:opacity-40 transition-colors"
            >
              {busy ? <Loader2 size={13} className="animate-spin" /> : <Send size={13} />}
            </button>
          </form>

          {err && <p className="text-rose-400 text-[12px] mt-2">{err}</p>}
        </>
      )}
    </div>
  );
}

// ───────── Root component ─────────
export default function DevForumApp() {
  const [threads, setThreads] = useState([]);
  const [loading, setLoading] = useState(true);
  const [view, setView] = useState('list'); // 'list' | 'new' | 'thread'
  const [selected, setSelected] = useState(null);
  const [isAdmin, setIsAdmin] = useState(false);

  const fetchThreads = useCallback(async () => {
    try {
      const res = await API('/api/devforum/threads');
      const data = await res.json();
      if (res.ok) setThreads(data.threads || []);
    } catch {}
    finally { setLoading(false); }
  }, []);

  useEffect(() => { fetchThreads(); }, [fetchThreads]);
  useEffect(() => { checkAdmin().then(d => setIsAdmin(!!d.isAdmin)).catch(() => {}); }, []);

  function handleCreated(thread) {
    setThreads(prev => [thread, ...prev]);
    setSelected(thread);
    setView('thread');
  }

  function handleUpdate(updated) {
    setThreads(prev => prev.map(t => t.id === updated.id ? updated : t));
    setSelected(updated);
  }

  return (
    <div className="h-full flex flex-col min-h-0">
      {view === 'list' && (
        <ThreadList
          threads={threads}
          loading={loading}
          onSelect={t => { setSelected(t); setView('thread'); }}
          onNew={() => setView('new')}
          isAdmin={isAdmin}
        />
      )}
      {view === 'new' && (
        <NewThreadForm
          onCancel={() => setView('list')}
          onCreated={handleCreated}
        />
      )}
      {view === 'thread' && selected && (
        <ThreadDetail
          thread={selected}
          onBack={() => setView('list')}
          onUpdate={handleUpdate}
          isAdmin={isAdmin}
        />
      )}
    </div>
  );
}
