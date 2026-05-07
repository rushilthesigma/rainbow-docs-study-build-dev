import { useState, useEffect, useRef, useCallback } from 'react';
import {
  Swords, RotateCcw, ArrowLeft, Trophy, Users, User, Copy, Check, Loader2, X, Zap, FileText, AlertCircle, Paperclip,
} from 'lucide-react';
import { apiFetch, getToken } from '../../api/client';
import { useAuth } from '../../context/AuthContext';
import ChatContainer from '../chat/ChatContainer';
import { errorChatMessage } from '../../utils/aiErrors';
import { InlineProgress } from '../shared/ProgressBar';

// =========================================================
// DEBATE PANEL — embedded inside Study Mode (no longer a top-level app).
// Modes:
//   menu          — pick singleplayer or multiplayer
//   single-setup  — pick topic + side, start solo debate vs AI
//   single-debate — chat with AI; click End Debate → final verdict
//   single-verdict — read AI verdict + scores
//   mp-menu       — Create or Join code
//   mp-lobby      — waiting room; host configures topic/side and starts
//   mp-game       — turn-based with AI per-move grade + dual end vote
//   mp-verdict    — final verdict
// =========================================================
const QUICK_TOPICS = [
  'Social media is harmful',
  'AI will replace most jobs',
  'College is worth the cost',
  'Space exploration matters',
  'Standardized testing should be abolished',
  'Self-driving cars are safer than humans',
];

export default function DebatePanel({ onBack }) {
  const [mode, setMode] = useState('menu');

  const header = (
    <div className="flex items-center gap-2 px-4 py-2.5 bg-transparent">
      <button onClick={onBack} className="p-1 rounded text-white/70 hover:text-white transition-colors">
        <ArrowLeft size={14} />
      </button>
      <div className="w-7 h-7 rounded-xl bg-white/20 dark:bg-white/10 border border-white/40 dark:border-white/15 flex items-center justify-center text-white/80 flex-shrink-0">
        <Swords size={13} />
      </div>
      <span className="text-[13px] font-bold text-white">Debate</span>
      <span className="text-[10px] font-semibold uppercase tracking-wider text-white/50">
        {mode === 'menu' && 'Pick a mode'}
        {mode === 'single-setup' && 'Solo · Setup'}
        {mode === 'single-debate' && 'Solo · Live'}
        {mode === 'single-verdict' && 'Solo · Verdict'}
        {mode === 'mp-menu' && 'Multiplayer · Setup'}
        {mode === 'mp-lobby' && 'Multiplayer · Lobby'}
        {mode === 'mp-game' && 'Multiplayer · Live'}
        {mode === 'mp-verdict' && 'Multiplayer · Verdict'}
      </span>
    </div>
  );

  return (
    <div className="h-full flex flex-col glass-card rounded-xl overflow-hidden">
      {header}
      <div className="flex-1 min-h-0 overflow-y-auto">
        {mode === 'menu' && <ModeMenu onSelect={setMode} />}
        {(mode === 'single-setup' || mode === 'single-debate' || mode === 'single-verdict') && (
          <Singleplayer
            mode={mode}
            setMode={setMode}
            onExit={() => setMode('menu')}
          />
        )}
        {(mode === 'mp-menu' || mode === 'mp-lobby' || mode === 'mp-game' || mode === 'mp-verdict') && (
          <Multiplayer
            mode={mode}
            setMode={setMode}
            onExit={() => setMode('menu')}
          />
        )}
      </div>
    </div>
  );
}

// =========================================================
// MENU
// =========================================================
function ModeMenu({ onSelect }) {
  return (
    <div className="p-6 max-w-md mx-auto">
      <h2 className="text-base font-bold text-gray-900 dark:text-white mb-1 text-center">How do you want to debate?</h2>
      <p className="text-xs text-gray-500 dark:text-gray-400 text-center mb-5">Solo against the AI, or head-to-head with a friend.</p>

      <div className="grid gap-3">
        <button
          onClick={() => onSelect('single-setup')}
          className="text-left p-4 rounded-xl border border-white/[0.10] dark:border-white/[0.07] bg-white/[0.07] dark:bg-white/[0.04] hover:bg-white/[0.14] dark:hover:bg-white/[0.08] transition-colors group"
        >
          <div className="flex items-start gap-3">
            <div className="w-10 h-10 rounded-lg bg-white/20 dark:bg-white/[0.08] text-gray-600 dark:text-gray-300 flex items-center justify-center flex-shrink-0">
              <User size={18} />
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-sm font-bold text-gray-900 dark:text-white">Solo vs AI</p>
              <p className="text-[11px] text-gray-500 dark:text-gray-400 mt-0.5 leading-snug">
                The AI argues the opposite side, openly adversarial — it pushes back hard. Hit End Debate when you're done and it gives you a real verdict.
              </p>
            </div>
          </div>
        </button>

        <button
          onClick={() => onSelect('mp-menu')}
          className="text-left p-4 rounded-xl border border-white/[0.10] dark:border-white/[0.07] bg-white/[0.07] dark:bg-white/[0.04] hover:bg-white/[0.14] dark:hover:bg-white/[0.08] transition-colors group"
        >
          <div className="flex items-start gap-3">
            <div className="w-10 h-10 rounded-lg bg-white/20 dark:bg-white/[0.08] text-gray-600 dark:text-gray-300 flex items-center justify-center flex-shrink-0">
              <Users size={18} />
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-sm font-bold text-gray-900 dark:text-white">Head-to-head with a friend</p>
              <p className="text-[11px] text-gray-500 dark:text-gray-400 mt-0.5 leading-snug">
                Game-code lobby. Each turn is graded by AI on argumentation, evidence, and rhetoric. Both players must vote to End — then AI declares a winner.
              </p>
            </div>
          </div>
        </button>
      </div>
    </div>
  );
}

// =========================================================
// SINGLEPLAYER
// =========================================================
function buildAdversarialSystem(side) {
  const opp = side === 'for' ? 'AGAINST' : 'FOR';
  return `You are a sharp, openly adversarial debate opponent. The user is arguing ${side === 'for' ? 'FOR' : 'AGAINST'} the topic — you argue ${opp}. Your job is to make this hard for them.

How to debate (read this twice):
- Be DIRECT and POINTED. Don't soften ("I see your point but…"). Open with a counter-claim, name the user's weakest assumption, and make them defend it.
- Use REAL DATA. You have web search — pull specific numbers, studies, examples, dates. Cite them inline naturally (no separate Sources section — the UI shows one). If you can't find data, attack the user's lack of data instead.
- ATTACK the user's strongest argument first, not their weakest. Don't strawman; quote their actual claim and dismantle it.
- DEMAND specifics when they hand-wave. "Which study?" "What time period?" "Compared to what baseline?" — push back hard on vagueness.
- Keep responses TIGHT. 2-3 paragraphs max per turn. Lead with the strongest counter, support it, end with a question that puts them on the defensive.

What you do NOT do:
- Don't moderate or summarize unless the user explicitly asks for a recap.
- Don't say "good point" or "I agree" — you're arguing the opposite side.
- Don't volunteer to end the debate; the user has an "End Debate" button for that.

Format: GitHub-flavored markdown. **Bold** key claims, use - bullets for evidence lists, $math$ if relevant.`;
}

function Singleplayer({ mode, setMode, onExit }) {
  const [topic, setTopic] = useState('');
  const [side, setSide] = useState(null);
  const [messages, setMessages] = useState([]);
  const [streaming, setStreaming] = useState(false);
  const [streamingContent, setStreamingContent] = useState('');
  const [verdict, setVerdict] = useState(null);
  const [verdictLoading, setVerdictLoading] = useState(false);
  const [error, setError] = useState(null);
  const systemRef = useRef('');

  async function startDebate(t, s) {
    setError(null);
    try { await apiFetch('/api/debate/start', { method: 'POST' }); }
    catch (err) {
      if (err.code === 'debate_limit_reached') { setError(err.message || 'Weekly debate limit reached.'); return; }
    }
    setSide(s);
    setTopic(t);
    setMode('single-debate');
    systemRef.current = buildAdversarialSystem(s);
    doSend(`Topic: "${t}". I'm arguing ${s === 'for' ? 'FOR' : 'AGAINST'} this. Open with your counter — give me your strongest argument first.`);
  }

  async function doSend(text) {
    const userMsg = { role: 'user', content: text, timestamp: new Date().toISOString() };
    setMessages(prev => [...prev, userMsg]);
    setStreaming(true);
    try {
      const allMessages = [...messages, userMsg].map(m => ({ role: m.role, content: m.content }));
      const result = await apiFetch('/api/chat', {
        method: 'POST',
        body: JSON.stringify({ system: systemRef.current, messages: allMessages, max_tokens: 4096, sourced: true }),
      });
      const reply = result.content?.[0]?.text || 'I need a moment to formulate my argument...';
      const sources = Array.isArray(result.sources) ? result.sources : [];
      const msg = { role: 'assistant', content: reply, timestamp: new Date().toISOString() };
      if (sources.length) msg.sources = sources;
      setMessages(prev => [...prev, msg]);
    } catch (err) {
      setMessages(prev => [...prev, errorChatMessage(err)]);
    }
    setStreamingContent('');
    setStreaming(false);
  }

  async function handleEndDebate() {
    if (verdictLoading) return;
    if (messages.length < 2) { setError('Make at least one argument before ending.'); return; }
    setVerdictLoading(true);
    try {
      const r = await apiFetch('/api/debate/singleplayer/verdict', {
        method: 'POST',
        body: JSON.stringify({
          topic, userSide: side,
          transcript: messages.map(m => ({ role: m.role, content: m.content })),
        }),
      });
      setVerdict(r.verdict);
      setMode('single-verdict');
    } catch (e) {
      setError(e.message || 'Failed to get verdict');
    }
    setVerdictLoading(false);
  }

  // SETUP
  if (mode === 'single-setup') {
    return (
      <div className="p-6 max-w-md mx-auto">
        <button onClick={onExit} className="text-xs text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 mb-3 inline-flex items-center gap-1 transition-colors">
          <ArrowLeft size={12} /> Back
        </button>
        <h2 className="text-base font-bold text-gray-900 dark:text-white mb-1">Pick a topic</h2>
        <p className="text-xs text-gray-500 dark:text-gray-400 mb-4">Anything debatable. The AI will argue the opposite side.</p>
        <input
          value={topic}
          onChange={e => setTopic(e.target.value)}
          placeholder="e.g., Social media is harmful for teens"
          className="w-full px-3 py-2 rounded-lg border border-white/20 dark:border-white/[0.10] bg-white/50 dark:bg-white/[0.06] text-sm text-gray-900 dark:text-white placeholder-gray-400 dark:placeholder-gray-500 outline-none focus:ring-2 focus:ring-white/30 mb-3"
        />
        <div className="flex flex-wrap gap-1.5 mb-5">
          {QUICK_TOPICS.map(t => (
            <button key={t} onClick={() => setTopic(t)} className="px-2.5 py-1 rounded-md bg-white/[0.07] dark:bg-white/[0.04] border border-white/[0.10] dark:border-white/[0.07] text-[11px] font-medium text-gray-600 dark:text-gray-400 hover:border-white/30 dark:hover:border-white/20 transition-colors">
              {t}
            </button>
          ))}
        </div>
        {topic.trim() && (
          <>
            <p className="text-xs font-semibold text-gray-700 dark:text-gray-300 mb-2">You argue:</p>
            <div className="grid grid-cols-2 gap-2">
              <button onClick={() => startDebate(topic.trim(), 'for')} className="px-4 py-3 rounded-xl bg-gray-900 dark:bg-white/80 text-white dark:text-gray-900 text-sm font-semibold hover:bg-gray-700 dark:hover:bg-white transition-colors">
                FOR
              </button>
              <button onClick={() => startDebate(topic.trim(), 'against')} className="px-4 py-3 rounded-xl bg-white/20 dark:bg-white/[0.10] border border-white/40 dark:border-white/20 text-gray-800 dark:text-white text-sm font-semibold hover:bg-white/30 dark:hover:bg-white/[0.17] transition-colors">
                AGAINST
              </button>
            </div>
          </>
        )}
        {error && <p className="mt-3 text-xs text-gray-600 dark:text-gray-300 bg-white/[0.08] dark:bg-white/[0.04] border border-white/20 dark:border-white/[0.07] rounded-lg px-3 py-2">{error}</p>}
      </div>
    );
  }

  // VERDICT
  if (mode === 'single-verdict' && verdict) {
    const won = verdict.winner === 'student';
    const tie = verdict.winner === 'tie';
    return (
      <div className="p-6 max-w-lg mx-auto">
        <div className="rounded-2xl p-5 mb-4 text-center bg-white/[0.10] dark:bg-white/[0.05] border border-white/30 dark:border-white/[0.10]">
          <Trophy size={32} className="mx-auto mb-2 text-gray-500 dark:text-gray-300" />
          <p className="text-2xl font-black text-gray-900 dark:text-white uppercase tracking-wider">
            {won ? 'You won' : tie ? 'Tie' : 'AI won'}
          </p>
          <p className="text-xs text-gray-500 dark:text-gray-400 mt-1.5 tabular-nums">
            You: <span className="font-bold">{verdict.studentScore}/100</span> · AI: <span className="font-bold">{verdict.aiScore}/100</span>
          </p>
        </div>
        <div className="bg-white/[0.07] dark:bg-white/[0.04] border border-white/[0.10] dark:border-white/[0.07] rounded-xl p-4 mb-3">
          <p className="text-[10px] font-bold uppercase tracking-[0.15em] text-gray-500 dark:text-gray-400 mb-1.5">Verdict</p>
          <p className="text-sm text-gray-800 dark:text-gray-100 leading-relaxed">{verdict.summary}</p>
        </div>
        {verdict.studentStrongest && (
          <div className="bg-white/[0.07] dark:bg-white/[0.04] border border-white/[0.10] dark:border-white/[0.07] rounded-xl p-3 mb-2">
            <p className="text-[10px] font-bold uppercase tracking-[0.15em] text-gray-500 dark:text-gray-400 mb-1">Your strongest moment</p>
            <p className="text-xs text-gray-800 dark:text-gray-100 leading-relaxed">{verdict.studentStrongest}</p>
          </div>
        )}
        {verdict.studentWeakest && (
          <div className="bg-white/[0.07] dark:bg-white/[0.04] border border-white/[0.10] dark:border-white/[0.07] rounded-xl p-3 mb-2">
            <p className="text-[10px] font-bold uppercase tracking-[0.15em] text-gray-500 dark:text-gray-400 mb-1">Your weakest moment</p>
            <p className="text-xs text-gray-800 dark:text-gray-100 leading-relaxed">{verdict.studentWeakest}</p>
          </div>
        )}
        {verdict.improve && (
          <div className="bg-white/[0.07] dark:bg-white/[0.04] border border-white/[0.10] dark:border-white/[0.07] rounded-xl p-3 mb-4">
            <p className="text-[10px] font-bold uppercase tracking-[0.15em] text-gray-500 dark:text-gray-400 mb-1">Drill this next</p>
            <p className="text-xs text-gray-800 dark:text-gray-100 leading-relaxed">{verdict.improve}</p>
          </div>
        )}
        <button onClick={onExit} className="w-full py-2.5 rounded-xl bg-gray-900 dark:bg-white/80 text-white dark:text-gray-900 text-sm font-semibold hover:bg-gray-700 dark:hover:bg-white transition-colors">
          Back to Debate menu
        </button>
      </div>
    );
  }

  // ACTIVE DEBATE
  const debateHeader = (
    <div className="flex items-center gap-2 px-3 py-2 bg-transparent">
      <span className="text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded-full bg-white/20 border border-white/30 text-white">
        You · {side === 'for' ? 'FOR' : 'AGAINST'}
      </span>
      <span className="text-[11px] text-white/80 truncate flex-1">{topic}</span>
      <button
        onClick={handleEndDebate}
        disabled={streaming || verdictLoading || messages.length < 2}
        className="inline-flex items-center gap-1 px-2.5 py-1 rounded-md bg-gray-900 dark:bg-white/75 text-white dark:text-gray-900 text-[11px] font-semibold hover:bg-gray-700 dark:hover:bg-white/90 disabled:opacity-40 transition-colors"
      >
        {verdictLoading ? <><InlineProgress active /> Judging…</> : <><Swords size={11} /> End debate</>}
      </button>
    </div>
  );

  return (
    <div className="h-full flex flex-col">
      {error && <p className="px-4 py-2 text-xs text-gray-600 dark:text-gray-300 bg-white/[0.08] dark:bg-white/[0.04] border-b border-white/10">{error}</p>}
      <ChatContainer
        messages={messages}
        streamingContent={streamingContent}
        onSend={(t) => !streaming && doSend(t)}
        disabled={streaming}
        placeholder={streaming ? 'AI is countering…' : 'Make your argument…'}
        header={debateHeader}
        className="h-full"
        flush
      />
    </div>
  );
}

// =========================================================
// MULTIPLAYER
// =========================================================
function Multiplayer({ mode, setMode, onExit }) {
  const { user } = useAuth();
  const myId = user?.id || null;
  const [iAmHost, setIAmHost] = useState(false);
  const [code, setCode] = useState('');
  const [match, setMatch] = useState(null);
  const [joinInput, setJoinInput] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);
  const [topicInput, setTopicInput] = useState('');
  const [hostSide, setHostSide] = useState('for');
  const [argument, setArgument] = useState('');
  const [argImages, setArgImages] = useState([]);
  const [argDragOver, setArgDragOver] = useState(false);
  const argFileRef = useRef(null);
  const argDragDepth = useRef(0);
  const [submittingMove, setSubmittingMove] = useState(false);
  const [voting, setVoting] = useState(false);
  const [copied, setCopied] = useState(false);
  const streamRef = useRef(null);

  function fileToDataUrl(file) {
    return new Promise((resolve, reject) => {
      const r = new FileReader();
      r.onload = () => resolve(r.result);
      r.onerror = () => reject(r.error);
      r.readAsDataURL(file);
    });
  }
  async function addImageFiles(files) {
    const list = Array.from(files || []).filter(f => f.type?.startsWith('image/'));
    if (!list.length) return;
    const added = [];
    for (const f of list.slice(0, 4 - argImages.length)) {
      if (f.size > 5 * 1024 * 1024) continue;
      const dataUrl = await fileToDataUrl(f);
      added.push({ dataUrl, mimeType: f.type, name: f.name });
    }
    if (added.length) setArgImages(prev => [...prev, ...added]);
  }

  useEffect(() => {
    if (!code || mode === 'mp-menu') return;
    const tok = getToken();
    if (!tok) return;
    const ctrl = new AbortController();
    (async () => {
      try {
        const res = await fetch(`/api/debate/match/${code}/stream`, {
          headers: { Authorization: `Bearer ${tok}` },
          signal: ctrl.signal,
        });
        if (!res.ok) return;
        const reader = res.body.getReader();
        const dec = new TextDecoder();
        let buf = '';
        while (true) {
          const { done, value } = await reader.read();
          if (done) break;
          buf += dec.decode(value, { stream: true });
          const lines = buf.split('\n');
          buf = lines.pop();
          for (const line of lines) {
            if (!line.startsWith('data: ')) continue;
            try {
              const ev = JSON.parse(line.slice(6));
              if (ev.match) setMatch(ev.match);
              if (ev.type === 'started') setMode('mp-game');
              if (ev.type === 'finished') setMode('mp-verdict');
            } catch {}
          }
        }
      } catch {}
    })();
    streamRef.current = ctrl;
    return () => { try { ctrl.abort(); } catch {} };
  }, [code, mode, setMode]);

  async function handleCreate() {
    setBusy(true); setError(null);
    try {
      const r = await apiFetch('/api/debate/match', { method: 'POST' });
      setCode(r.code); setMatch(r.match); setIAmHost(true); setMode('mp-lobby');
    } catch (e) { setError(e.message); }
    setBusy(false);
  }

  async function handleJoin() {
    const c = joinInput.trim().toUpperCase();
    if (!c) return;
    setBusy(true); setError(null);
    try {
      const r = await apiFetch(`/api/debate/match/${c}/join`, { method: 'POST' });
      setCode(c); setMatch(r.match); setIAmHost(false); setMode('mp-lobby');
    } catch (e) { setError(e.message); }
    setBusy(false);
  }

  async function handleStart() {
    const t = topicInput.trim();
    if (!t) { setError('Topic required'); return; }
    setBusy(true); setError(null);
    try {
      const r = await apiFetch(`/api/debate/match/${code}/start`, {
        method: 'POST',
        body: JSON.stringify({ topic: t, hostSide }),
      });
      setMatch(r.match); setMode('mp-game');
    } catch (e) { setError(e.message); }
    setBusy(false);
  }

  async function handleSubmitMove() {
    const a = argument.trim();
    if (a.length < 20 && argImages.length === 0) {
      setError('Argument must be at least 20 characters (or attach an image)');
      return;
    }
    setSubmittingMove(true); setError(null);
    try {
      const r = await apiFetch(`/api/debate/match/${code}/move`, {
        method: 'POST',
        body: JSON.stringify({
          argument: a,
          images: argImages.map(im => ({ dataUrl: im.dataUrl, mimeType: im.mimeType })),
        }),
      });
      setMatch(r.match);
      setArgument('');
      setArgImages([]);
    } catch (e) { setError(e.message); }
    setSubmittingMove(false);
  }

  async function handleVoteEnd() {
    setVoting(true); setError(null);
    try {
      const r = await apiFetch(`/api/debate/match/${code}/vote-end`, { method: 'POST' });
      setMatch(r.match);
      if (r.finished) setMode('mp-verdict');
    } catch (e) { setError(e.message); }
    setVoting(false);
  }

  function copyCode() {
    if (!code) return;
    try { navigator.clipboard.writeText(code); setCopied(true); setTimeout(() => setCopied(false), 1500); }
    catch {}
  }

  // ===== MENU (Create / Join) =====
  if (mode === 'mp-menu') {
    return (
      <div className="p-6 max-w-md mx-auto">
        <button onClick={onExit} className="text-xs text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 mb-3 inline-flex items-center gap-1 transition-colors">
          <ArrowLeft size={12} /> Back
        </button>
        <h2 className="text-base font-bold text-gray-900 dark:text-white mb-1">Head-to-head debate</h2>
        <p className="text-xs text-gray-500 dark:text-gray-400 mb-5">Create a match and share the code, or join one.</p>

        <button
          onClick={handleCreate}
          disabled={busy}
          className="w-full py-3 mb-4 rounded-xl bg-gray-900 dark:bg-white/80 text-white dark:text-gray-900 text-sm font-semibold hover:bg-gray-700 dark:hover:bg-white/90 disabled:opacity-40 flex items-center justify-center gap-2 transition-colors"
        >
          {busy ? <InlineProgress active /> : <Zap size={14} />}
          Create match
        </button>

        <div className="flex items-center gap-2 my-3">
          <div className="flex-1 border-t border-white/20 dark:border-white/[0.10]" />
          <span className="text-[10px] uppercase tracking-wider text-gray-400">or</span>
          <div className="flex-1 border-t border-white/20 dark:border-white/[0.10]" />
        </div>

        <div className="flex gap-2">
          <input
            value={joinInput}
            onChange={e => setJoinInput(e.target.value.toUpperCase().slice(0, 5))}
            onKeyDown={e => { if (e.key === 'Enter') handleJoin(); }}
            placeholder="Code"
            className="flex-1 px-3 py-2.5 rounded-xl border border-white/20 dark:border-white/[0.10] bg-white/50 dark:bg-white/[0.06] text-sm font-mono uppercase tracking-widest text-gray-900 dark:text-white placeholder-gray-400 outline-none focus:ring-2 focus:ring-white/30"
          />
          <button
            onClick={handleJoin}
            disabled={busy || joinInput.trim().length < 4}
            className="px-5 py-2.5 rounded-xl bg-gray-900 dark:bg-white/80 text-white dark:text-gray-900 text-sm font-semibold hover:bg-gray-700 dark:hover:bg-white/90 disabled:opacity-40 transition-colors"
          >
            Join
          </button>
        </div>
        {error && <p className="mt-3 text-xs text-gray-600 dark:text-gray-300 bg-white/[0.08] dark:bg-white/[0.04] border border-white/20 dark:border-white/[0.07] rounded-lg px-3 py-2">{error}</p>}
      </div>
    );
  }

  // ===== LOBBY =====
  if (mode === 'mp-lobby' && match) {
    const isHost = iAmHost || (myId && match.hostId === myId);
    const opponent = match.players.find(p => (myId ? p.userId !== myId : p.userId !== match.hostId));
    const opponentJoined = match.players.length >= 2;
    return (
      <div className="p-6 max-w-md mx-auto">
        <p className="text-[11px] uppercase tracking-[0.18em] text-gray-500 dark:text-gray-400 mb-1.5">Match code</p>
        <button
          onClick={copyCode}
          className="w-full font-mono text-3xl font-black tabular-nums tracking-[0.2em] text-gray-900 dark:text-white bg-white/[0.10] dark:bg-white/[0.06] border border-white/40 dark:border-white/[0.15] rounded-xl py-4 mb-3 hover:bg-white/[0.18] dark:hover:bg-white/[0.10] transition-colors inline-flex items-center justify-center gap-3"
        >
          {match.code}
          {copied ? <Check size={18} className="text-gray-500 dark:text-gray-300" /> : <Copy size={16} className="text-gray-400" />}
        </button>
        <p className="text-[11px] text-gray-500 dark:text-gray-400 text-center mb-5">Share this code with your opponent.</p>

        <div className="bg-white/[0.07] dark:bg-white/[0.04] border border-white/[0.10] dark:border-white/[0.07] rounded-xl p-3 mb-5">
          <p className="text-[10px] font-bold uppercase tracking-[0.15em] text-gray-500 dark:text-gray-400 mb-2">Players</p>
          <div className="space-y-1.5">
            {match.players.map(p => (
              <div key={p.userId} className="flex items-center gap-2">
                <div className="w-6 h-6 rounded-full bg-white/20 dark:bg-white/10 text-gray-600 dark:text-gray-300 flex items-center justify-center text-[10px] font-bold">
                  {p.name.charAt(0).toUpperCase()}
                </div>
                <span className="text-sm text-gray-800 dark:text-gray-200">{p.name}</span>
                {p.userId === match.hostId && <span className="text-[9px] uppercase tracking-wider text-gray-400">Host</span>}
                {p.userId === myId && <span className="text-[9px] uppercase tracking-wider text-gray-400">You</span>}
              </div>
            ))}
            {!opponentJoined && (
              <div className="flex items-center gap-2 opacity-60">
                <div className="w-6 h-6 rounded-full bg-white/10 dark:bg-white/[0.06] flex items-center justify-center text-[10px] font-bold text-gray-400">?</div>
                <span className="text-sm text-gray-500 italic">Waiting for opponent…</span>
                <InlineProgress active />
              </div>
            )}
          </div>
        </div>

        {isHost ? (
          <>
            <p className="text-xs font-semibold text-gray-700 dark:text-gray-300 mb-2">Topic</p>
            <input
              value={topicInput}
              onChange={e => setTopicInput(e.target.value)}
              placeholder="What are we debating?"
              className="w-full px-3 py-2 mb-2 rounded-lg border border-white/20 dark:border-white/[0.10] bg-white/50 dark:bg-white/[0.06] text-sm text-gray-900 dark:text-white placeholder-gray-400 outline-none focus:ring-2 focus:ring-white/30"
            />
            <div className="flex flex-wrap gap-1 mb-3">
              {QUICK_TOPICS.slice(0, 4).map(t => (
                <button key={t} onClick={() => setTopicInput(t)} className="px-2 py-0.5 rounded text-[10px] font-medium text-gray-600 dark:text-gray-400 bg-white/[0.07] dark:bg-white/[0.04] border border-white/[0.10] dark:border-white/[0.07] hover:border-white/30 transition-colors">
                  {t}
                </button>
              ))}
            </div>
            <p className="text-xs font-semibold text-gray-700 dark:text-gray-300 mb-2">You will argue</p>
            <div className="grid grid-cols-2 gap-2 mb-4">
              <button
                onClick={() => setHostSide('for')}
                className={`py-2 rounded-lg text-sm font-semibold border transition-colors ${hostSide === 'for' ? 'bg-gray-900 dark:bg-white/80 text-white dark:text-gray-900 border-transparent' : 'border-white/20 dark:border-white/[0.10] text-gray-700 dark:text-gray-300 bg-transparent hover:bg-white/10'}`}
              >
                FOR
              </button>
              <button
                onClick={() => setHostSide('against')}
                className={`py-2 rounded-lg text-sm font-semibold border transition-colors ${hostSide === 'against' ? 'bg-gray-900 dark:bg-white/80 text-white dark:text-gray-900 border-transparent' : 'border-white/20 dark:border-white/[0.10] text-gray-700 dark:text-gray-300 bg-transparent hover:bg-white/10'}`}
              >
                AGAINST
              </button>
            </div>
            <button
              onClick={handleStart}
              disabled={busy || !topicInput.trim() || !opponentJoined}
              className="w-full py-3 rounded-xl bg-gray-900 dark:bg-white/80 text-white dark:text-gray-900 text-sm font-semibold hover:bg-gray-700 dark:hover:bg-white/90 disabled:opacity-40 flex items-center justify-center gap-2 transition-colors"
            >
              {busy ? <InlineProgress active /> : <Swords size={14} />}
              {opponentJoined ? 'Start the debate' : 'Waiting for opponent…'}
            </button>
          </>
        ) : (
          <p className="text-xs text-gray-500 dark:text-gray-400 text-center italic">Waiting for the host to set the topic and start…</p>
        )}

        {error && <p className="mt-3 text-xs text-gray-600 dark:text-gray-300 bg-white/[0.08] dark:bg-white/[0.04] border border-white/20 dark:border-white/[0.07] rounded-lg px-3 py-2">{error}</p>}
      </div>
    );
  }

  // ===== GAME =====
  if (mode === 'mp-game' && match) {
    const me = match.players.find(p => p.userId === myId);
    const opp = match.players.find(p => p.userId !== myId);
    const myTurn = match.turnOf === myId;
    const myScore = match.scores[myId] || 0;
    const oppScore = (opp && match.scores[opp.userId]) || 0;
    const iVoted = match.endVotes.includes(myId);
    const oppVoted = opp && match.endVotes.includes(opp.userId);

    return (
      <div className="h-full flex flex-col">
        {/* Topic + scoreboard */}
        <div className="px-4 py-2 bg-transparent">
          <p className="text-xs text-white/80 font-medium truncate">{match.topic}</p>
          <div className="flex items-center gap-3 mt-1">
            <ScorePill name={me?.name || 'You'} side={me?.side} score={myScore} active={myTurn} self />
            <span className="text-gray-300 dark:text-gray-600">vs</span>
            <ScorePill name={opp?.name || 'Opponent'} side={opp?.side} score={oppScore} active={!myTurn} />
            <span className="flex-1" />
            <button
              onClick={handleVoteEnd}
              disabled={voting || iVoted}
              title={iVoted ? 'You voted to end. Waiting for opponent.' : oppVoted ? 'Opponent voted to end. Vote yes to finish.' : 'Vote to end the debate. Both must vote.'}
              className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-md text-[11px] font-semibold transition-colors ${
                iVoted
                  ? 'bg-white/20 dark:bg-white/10 text-gray-600 dark:text-gray-300'
                  : oppVoted
                    ? 'bg-gray-900 dark:bg-white/80 text-white dark:text-gray-900 animate-pulse'
                    : 'bg-gray-900 dark:bg-white/75 text-white dark:text-gray-900 hover:bg-gray-700 dark:hover:bg-white/90'
              }`}
            >
              {voting ? <InlineProgress active /> : iVoted ? 'Waiting…' : oppVoted ? 'Confirm end' : 'Vote to end'}
            </button>
          </div>
        </div>

        {/* Turn list */}
        <div className="flex-1 min-h-0 overflow-y-auto p-4 space-y-3">
          {match.turns.length === 0 && (
            <p className="text-xs text-gray-400 text-center py-8">
              {myTurn ? 'You have the opening statement. Lay out your strongest argument first.' : 'Waiting for opponent\'s opening statement…'}
            </p>
          )}
          {match.turns.map((t, i) => {
            const isMine = t.userId === myId;
            return (
              <div key={i} className={`flex ${isMine ? 'justify-end' : 'justify-start'}`}>
                <div className={`max-w-[85%] rounded-2xl p-3.5 shadow-sm ${isMine ? 'bg-gray-900 dark:bg-white/80 text-white dark:text-gray-900 rounded-tr-md' : 'bg-white/[0.12] dark:bg-white/[0.07] border border-white/20 dark:border-white/[0.06] text-gray-900 dark:text-gray-100 rounded-tl-md'}`}>
                  <div className="flex items-center gap-2 mb-1.5">
                    <span className={`text-[9px] font-bold uppercase tracking-wider ${isMine ? 'text-white/60 dark:text-gray-600' : 'text-gray-500 dark:text-gray-400'}`}>
                      {t.side === 'for' ? 'FOR' : 'AGAINST'} · {isMine ? 'you' : opp?.name}
                    </span>
                  </div>
                  {Array.isArray(t.images) && t.images.length > 0 && (
                    <div className="flex flex-wrap gap-1.5 mb-2">
                      {t.images.map((img, ii) => (
                        <a key={ii} href={img.dataUrl} target="_blank" rel="noopener noreferrer" className="block">
                          <img
                            src={img.dataUrl}
                            alt={`evidence ${ii + 1}`}
                            className="max-w-[180px] max-h-[180px] rounded-lg object-cover border border-white/20 dark:border-white/10"
                          />
                        </a>
                      ))}
                    </div>
                  )}
                  {t.content && <p className="text-sm leading-relaxed whitespace-pre-wrap">{t.content}</p>}
                  <div className={`mt-2 pt-2 border-t flex items-center gap-2 text-[10px] ${isMine ? 'border-white/20 dark:border-gray-800/50 text-white/50 dark:text-gray-600' : 'border-white/20 dark:border-white/[0.06] text-gray-500 dark:text-gray-400'}`}>
                    <span className="font-bold tabular-nums">{t.score.total}/30</span>
                    <span>· arg {t.score.argumentation} · ev {t.score.evidence} · rh {t.score.rhetoric}</span>
                  </div>
                  {t.feedback && (
                    <p className={`mt-1 text-[10px] italic ${isMine ? 'text-white/50 dark:text-gray-600' : 'text-gray-500 dark:text-gray-400'}`}>{t.feedback}</p>
                  )}
                </div>
              </div>
            );
          })}
        </div>

        {/* Composer */}
        <div
          className="relative bg-transparent px-3 pt-2 pb-3"
          onDragEnter={e => {
            if (!myTurn) return;
            if (!e.dataTransfer?.types?.includes('Files')) return;
            e.preventDefault();
            argDragDepth.current++;
            setArgDragOver(true);
          }}
          onDragOver={e => {
            if (!myTurn) return;
            if (e.dataTransfer?.types?.includes('Files')) {
              e.preventDefault();
              e.dataTransfer.dropEffect = 'copy';
            }
          }}
          onDragLeave={e => {
            e.preventDefault();
            argDragDepth.current = Math.max(0, argDragDepth.current - 1);
            if (argDragDepth.current === 0) setArgDragOver(false);
          }}
          onDrop={async (e) => {
            if (!myTurn) return;
            e.preventDefault();
            argDragDepth.current = 0;
            setArgDragOver(false);
            await addImageFiles(e.dataTransfer?.files);
          }}
        >
          {/* Drag overlay */}
          {argDragOver && myTurn && (
            <div className="absolute inset-x-3 top-2 bottom-3 z-20 rounded-xl border-2 border-dashed border-white/50 bg-white/60 dark:bg-white/[0.10] flex items-center justify-center pointer-events-none">
              <p className="text-sm font-bold text-gray-700 dark:text-white">Drop image to attach</p>
            </div>
          )}

          {!myTurn ? (
            <p className="text-xs text-gray-500 dark:text-gray-400 text-center py-2.5">
              <InlineProgress active />
              Waiting for {opp?.name || 'opponent'} to make their argument…
            </p>
          ) : (
            <>
              <input
                ref={argFileRef}
                type="file"
                accept="image/*"
                multiple
                className="hidden"
                onChange={e => { addImageFiles(e.target.files); e.target.value = ''; }}
              />

              {/* Image thumbnails */}
              {argImages.length > 0 && (
                <div className="flex flex-wrap gap-2 mb-2">
                  {argImages.map((img, i) => (
                    <div key={i} className="relative w-14 h-14 rounded-md overflow-hidden border border-white/20 dark:border-white/[0.10] bg-white/10 dark:bg-white/[0.06]">
                      <img src={img.dataUrl} alt={img.name} className="w-full h-full object-cover" />
                      <button
                        type="button"
                        onClick={() => setArgImages(prev => prev.filter((_, idx) => idx !== i))}
                        className="absolute top-0.5 right-0.5 w-4 h-4 rounded-full bg-black/70 text-white flex items-center justify-center hover:bg-black"
                        aria-label="Remove image"
                      >
                        <X size={10} />
                      </button>
                    </div>
                  ))}
                </div>
              )}

              <textarea
                value={argument}
                onChange={e => setArgument(e.target.value)}
                onPaste={async (e) => {
                  const items = e.clipboardData?.items;
                  if (!items) return;
                  const files = [];
                  for (const it of items) {
                    if (it.kind === 'file') {
                      const f = it.getAsFile();
                      if (f && f.type?.startsWith('image/')) files.push(f);
                    }
                  }
                  if (files.length) {
                    e.preventDefault();
                    await addImageFiles(files);
                  }
                }}
                placeholder={`Make your argument as ${me?.side?.toUpperCase()}. Drop or paste images for evidence — specifics, attack the opponent's last claim.`}
                rows={4}
                disabled={submittingMove}
                className="w-full p-3 rounded-xl border border-white/20 dark:border-white/[0.10] bg-white/30 dark:bg-white/[0.04] text-sm text-gray-900 dark:text-white placeholder-gray-400 dark:placeholder-gray-500 outline-none focus:ring-2 focus:ring-white/30 resize-y"
              />
              <div className="flex items-center justify-between mt-2 gap-2">
                <button
                  type="button"
                  onClick={() => argFileRef.current?.click()}
                  disabled={submittingMove || argImages.length >= 4}
                  className="inline-flex items-center gap-1 px-2 py-1 rounded text-[11px] text-gray-500 hover:text-gray-800 dark:hover:text-white hover:bg-white/20 dark:hover:bg-white/10 disabled:opacity-40 transition-colors"
                  title="Attach image (you can also paste or drag-and-drop)"
                >
                  <Paperclip size={11} /> Image
                </button>
                <p className="text-[10px] text-gray-400 tabular-nums flex-1">
                  {argument.split(/\s+/).filter(Boolean).length} words · {argument.length} chars
                  {argImages.length > 0 && <span className="ml-2">· {argImages.length} image{argImages.length === 1 ? '' : 's'}</span>}
                </p>
                <button
                  onClick={handleSubmitMove}
                  disabled={submittingMove || (argument.trim().length < 20 && argImages.length === 0)}
                  className="px-4 py-1.5 rounded-md bg-gray-900 dark:bg-white/80 text-white dark:text-gray-900 text-xs font-semibold hover:bg-gray-700 dark:hover:bg-white/90 disabled:opacity-40 inline-flex items-center gap-1 transition-colors"
                >
                  {submittingMove ? <><InlineProgress active /> Grading…</> : <>Send turn</>}
                </button>
              </div>
            </>
          )}
        </div>

        {error && <p className="mx-3 mb-2 text-xs text-gray-600 dark:text-gray-300 bg-white/[0.08] dark:bg-white/[0.04] border border-white/20 dark:border-white/[0.07] rounded-lg px-3 py-1.5">{error}</p>}
      </div>
    );
  }

  // ===== VERDICT =====
  if (mode === 'mp-verdict' && match?.verdict) {
    const v = match.verdict;
    const me = match.players.find(p => p.userId === myId);
    const won = v.winner === me?.side;
    const tie = v.winner === 'tie';
    return (
      <div className="p-6 max-w-lg mx-auto">
        <div className="rounded-2xl p-5 mb-4 text-center bg-white/[0.10] dark:bg-white/[0.05] border border-white/30 dark:border-white/[0.10]">
          <Trophy size={32} className="mx-auto mb-2 text-gray-500 dark:text-gray-300" />
          <p className="text-2xl font-black uppercase tracking-wider text-gray-900 dark:text-white">
            {tie ? 'Tie' : v.winner === 'for' ? 'FOR side wins' : 'AGAINST side wins'}
          </p>
          <p className="text-xs text-gray-500 dark:text-gray-400 mt-1.5 tabular-nums">
            {match.players.map(p => `${p.name} (${p.side?.toUpperCase()}): ${match.scores[p.userId] || 0}`).join(' · ')}
          </p>
        </div>
        <div className="bg-white/[0.07] dark:bg-white/[0.04] border border-white/[0.10] dark:border-white/[0.07] rounded-xl p-4 mb-3">
          <p className="text-[10px] font-bold uppercase tracking-[0.15em] text-gray-500 dark:text-gray-400 mb-1.5">Verdict</p>
          <p className="text-sm text-gray-800 dark:text-gray-100 leading-relaxed">{v.summary}</p>
        </div>
        {v.forStrongest && (
          <div className="bg-white/[0.07] dark:bg-white/[0.04] border border-white/[0.10] dark:border-white/[0.07] rounded-xl p-3 mb-2">
            <p className="text-[10px] font-bold uppercase tracking-[0.15em] text-gray-500 dark:text-gray-400 mb-1">FOR's strongest moment</p>
            <p className="text-xs text-gray-800 dark:text-gray-100 leading-relaxed">{v.forStrongest}</p>
          </div>
        )}
        {v.againstStrongest && (
          <div className="bg-white/[0.07] dark:bg-white/[0.04] border border-white/[0.10] dark:border-white/[0.07] rounded-xl p-3 mb-4">
            <p className="text-[10px] font-bold uppercase tracking-[0.15em] text-gray-500 dark:text-gray-400 mb-1">AGAINST's strongest moment</p>
            <p className="text-xs text-gray-800 dark:text-gray-100 leading-relaxed">{v.againstStrongest}</p>
          </div>
        )}
        <button onClick={onExit} className="w-full py-2.5 rounded-xl bg-gray-900 dark:bg-white/80 text-white dark:text-gray-900 text-sm font-semibold hover:bg-gray-700 dark:hover:bg-white/90 transition-colors">
          Back to Debate menu
        </button>
      </div>
    );
  }

  // Fallback
  return (
    <div className="p-6 text-center text-sm text-gray-500">
      <AlertCircle size={20} className="mx-auto mb-2 text-gray-400" />
      Loading…
    </div>
  );
}

function ScorePill({ name, side, score, active, self }) {
  return (
    <div className={`flex items-center gap-1.5 px-2 py-0.5 rounded-md transition-colors ${active ? 'ring-2 ring-white/40 dark:ring-white/20 bg-white/20 dark:bg-white/10' : ''}`}>
      <span className="text-[10px] font-semibold uppercase tracking-wider text-gray-600 dark:text-gray-300">
        {side === 'for' ? 'FOR' : side === 'against' ? 'AG.' : '—'}
      </span>
      <span className="text-[11px] font-bold text-gray-800 dark:text-gray-100 tabular-nums">{score}</span>
      <span className="text-[10px] text-gray-500 dark:text-gray-400 truncate max-w-[80px]">
        {self ? 'you' : name}
      </span>
    </div>
  );
}
