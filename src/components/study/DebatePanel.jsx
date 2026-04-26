import { useState, useEffect, useRef, useCallback } from 'react';
import {
  Swords, RotateCcw, ArrowLeft, Trophy, Users, User, Copy, Check, Loader2, X, Zap, FileText, AlertCircle,
} from 'lucide-react';
import { apiFetch, getToken } from '../../api/client';
import { useAuth } from '../../context/AuthContext';
import ChatContainer from '../chat/ChatContainer';
import { errorChatMessage } from '../../utils/aiErrors';

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

  // Top-level chrome.
  const header = (
    <div className="flex items-center gap-2 px-4 py-2.5 border-b border-gray-200 dark:border-[#2A2A40] bg-gradient-to-r from-amber-50 via-white to-orange-50 dark:from-amber-950/20 dark:via-[#161622] dark:to-orange-950/20">
      <button onClick={onBack} className="p-1 rounded text-gray-500 hover:text-gray-800 dark:hover:text-gray-200">
        <ArrowLeft size={14} />
      </button>
      <div className="w-7 h-7 rounded-lg bg-gradient-to-br from-amber-400 to-orange-500 flex items-center justify-center text-white shadow-sm">
        <Swords size={13} />
      </div>
      <span className="text-[13px] font-bold text-gray-900 dark:text-white">Debate</span>
      <span className="text-[10px] font-semibold uppercase tracking-wider text-gray-400 dark:text-gray-500">
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
    <div className="h-full flex flex-col bg-white dark:bg-[#0D0D14] rounded-xl border border-gray-200 dark:border-[#2A2A40] overflow-hidden">
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
          className="text-left p-4 rounded-xl border-2 border-gray-200 dark:border-[#2A2A40] hover:border-amber-400 dark:hover:border-amber-700 bg-white dark:bg-[#161622] transition-colors group"
        >
          <div className="flex items-start gap-3">
            <div className="w-10 h-10 rounded-lg bg-amber-100 dark:bg-amber-900/30 text-amber-600 dark:text-amber-400 flex items-center justify-center flex-shrink-0">
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
          className="text-left p-4 rounded-xl border-2 border-gray-200 dark:border-[#2A2A40] hover:border-amber-400 dark:hover:border-amber-700 bg-white dark:bg-[#161622] transition-colors group"
        >
          <div className="flex items-start gap-3">
            <div className="w-10 h-10 rounded-lg bg-amber-100 dark:bg-amber-900/30 text-amber-600 dark:text-amber-400 flex items-center justify-center flex-shrink-0">
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
        <button onClick={onExit} className="text-xs text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 mb-3 inline-flex items-center gap-1">
          <ArrowLeft size={12} /> Back
        </button>
        <h2 className="text-base font-bold text-gray-900 dark:text-white mb-1">Pick a topic</h2>
        <p className="text-xs text-gray-500 dark:text-gray-400 mb-4">Anything debatable. The AI will argue the opposite side.</p>
        <input
          value={topic}
          onChange={e => setTopic(e.target.value)}
          placeholder="e.g., Social media is harmful for teens"
          className="w-full px-3 py-2 rounded-lg border border-gray-200 dark:border-[#2A2A40] bg-white dark:bg-[#161622] text-sm outline-none focus:ring-2 focus:ring-amber-500/40 mb-3"
        />
        <div className="flex flex-wrap gap-1.5 mb-5">
          {QUICK_TOPICS.map(t => (
            <button key={t} onClick={() => setTopic(t)} className="px-2.5 py-1 rounded-md bg-gray-50 dark:bg-[#161622] border border-gray-200 dark:border-[#2A2A40] text-[11px] font-medium text-gray-600 dark:text-gray-400 hover:border-amber-300 dark:hover:border-amber-700 transition-colors">
              {t}
            </button>
          ))}
        </div>
        {topic.trim() && (
          <>
            <p className="text-xs font-semibold text-gray-700 dark:text-gray-300 mb-2">You argue:</p>
            <div className="grid grid-cols-2 gap-2">
              <button onClick={() => startDebate(topic.trim(), 'for')} className="px-4 py-3 rounded-xl bg-emerald-600 text-white text-sm font-semibold hover:bg-emerald-700">
                FOR
              </button>
              <button onClick={() => startDebate(topic.trim(), 'against')} className="px-4 py-3 rounded-xl bg-rose-600 text-white text-sm font-semibold hover:bg-rose-700">
                AGAINST
              </button>
            </div>
          </>
        )}
        {error && <p className="mt-3 text-xs text-amber-600 dark:text-amber-400 bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800 rounded-lg px-3 py-2">{error}</p>}
      </div>
    );
  }

  // VERDICT
  if (mode === 'single-verdict' && verdict) {
    const won = verdict.winner === 'student';
    return (
      <div className="p-6 max-w-lg mx-auto">
        <div className={`rounded-2xl p-5 mb-4 text-center border-2 ${won ? 'bg-emerald-50 dark:bg-emerald-900/15 border-emerald-300 dark:border-emerald-800' : verdict.winner === 'ai' ? 'bg-rose-50 dark:bg-rose-900/15 border-rose-300 dark:border-rose-800' : 'bg-gray-50 dark:bg-[#161622] border-gray-300 dark:border-[#2A2A40]'}`}>
          <Trophy size={32} className={`mx-auto mb-2 ${won ? 'text-emerald-500' : verdict.winner === 'ai' ? 'text-rose-500' : 'text-gray-400'}`} />
          <p className="text-2xl font-black text-gray-900 dark:text-white uppercase tracking-wider">
            {won ? 'You won' : verdict.winner === 'ai' ? 'AI won' : 'Tie'}
          </p>
          <p className="text-xs text-gray-500 dark:text-gray-400 mt-1.5 tabular-nums">
            You: <span className="font-bold">{verdict.studentScore}/100</span> · AI: <span className="font-bold">{verdict.aiScore}/100</span>
          </p>
        </div>
        <div className="bg-white dark:bg-[#161622] border border-gray-200 dark:border-[#2A2A40] rounded-xl p-4 mb-3">
          <p className="text-[10px] font-bold uppercase tracking-[0.15em] text-gray-500 mb-1.5">Verdict</p>
          <p className="text-sm text-gray-800 dark:text-gray-100 leading-relaxed">{verdict.summary}</p>
        </div>
        {verdict.studentStrongest && (
          <div className="bg-emerald-50 dark:bg-emerald-900/10 border border-emerald-200 dark:border-emerald-800 rounded-xl p-3 mb-2">
            <p className="text-[10px] font-bold uppercase tracking-[0.15em] text-emerald-600 dark:text-emerald-400 mb-1">Your strongest moment</p>
            <p className="text-xs text-gray-800 dark:text-gray-100 leading-relaxed">{verdict.studentStrongest}</p>
          </div>
        )}
        {verdict.studentWeakest && (
          <div className="bg-rose-50 dark:bg-rose-900/10 border border-rose-200 dark:border-rose-800 rounded-xl p-3 mb-2">
            <p className="text-[10px] font-bold uppercase tracking-[0.15em] text-rose-600 dark:text-rose-400 mb-1">Your weakest moment</p>
            <p className="text-xs text-gray-800 dark:text-gray-100 leading-relaxed">{verdict.studentWeakest}</p>
          </div>
        )}
        {verdict.improve && (
          <div className="bg-amber-50 dark:bg-amber-900/10 border border-amber-200 dark:border-amber-800 rounded-xl p-3 mb-4">
            <p className="text-[10px] font-bold uppercase tracking-[0.15em] text-amber-600 dark:text-amber-400 mb-1">Drill this next</p>
            <p className="text-xs text-gray-800 dark:text-gray-100 leading-relaxed">{verdict.improve}</p>
          </div>
        )}
        <button onClick={onExit} className="w-full py-2.5 rounded-xl bg-blue-600 hover:bg-blue-700 text-white text-sm font-semibold">
          Back to Debate menu
        </button>
      </div>
    );
  }

  // ACTIVE DEBATE
  const debateHeader = (
    <div className="flex items-center gap-2 px-3 py-2 border-b border-gray-100 dark:border-[#2A2A40]/70 bg-gray-50/50 dark:bg-[#0a0a14]/40">
      <span className={`text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded-full ${side === 'for' ? 'bg-emerald-100 dark:bg-emerald-900/30 text-emerald-600 dark:text-emerald-400' : 'bg-rose-100 dark:bg-rose-900/30 text-rose-600 dark:text-rose-400'}`}>
        You · {side === 'for' ? 'FOR' : 'AGAINST'}
      </span>
      <span className="text-[11px] text-gray-700 dark:text-gray-200 truncate flex-1">{topic}</span>
      <button
        onClick={handleEndDebate}
        disabled={streaming || verdictLoading || messages.length < 2}
        className="inline-flex items-center gap-1 px-2.5 py-1 rounded-md bg-amber-500 hover:bg-amber-600 disabled:opacity-50 text-white text-[11px] font-semibold transition-colors"
      >
        {verdictLoading ? <><Loader2 size={11} className="animate-spin" /> Judging…</> : <><Swords size={11} /> End debate</>}
      </button>
    </div>
  );

  return (
    <div className="h-full flex flex-col">
      {error && <p className="px-4 py-2 text-xs text-rose-500 bg-rose-50 dark:bg-rose-900/20 border-b border-rose-200 dark:border-rose-800">{error}</p>}
      <ChatContainer
        messages={messages}
        streamingContent={streamingContent}
        onSend={(t) => !streaming && doSend(t)}
        disabled={streaming}
        placeholder={streaming ? 'AI is countering…' : 'Make your argument…'}
        header={debateHeader}
        className="h-full"
      />
    </div>
  );
}

// =========================================================
// MULTIPLAYER
// =========================================================
function Multiplayer({ mode, setMode, onExit }) {
  const { user } = useAuth();
  // Identify "me" from the AuthContext. Falls back to null while the
  // user is still hydrating — but we ALSO track `iAmHost` directly from
  // the action that put us in the lobby, so the host UI doesn't depend
  // on user.id matching match.hostId at render time.
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
  const [submittingMove, setSubmittingMove] = useState(false);
  const [voting, setVoting] = useState(false);
  const [copied, setCopied] = useState(false);
  const streamRef = useRef(null);

  // Wire SSE stream when we have a code + are in a multiplayer view.
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
    if (a.length < 20) { setError('Argument must be at least 20 characters'); return; }
    setSubmittingMove(true); setError(null);
    try {
      const r = await apiFetch(`/api/debate/match/${code}/move`, {
        method: 'POST',
        body: JSON.stringify({ argument: a }),
      });
      setMatch(r.match); setArgument('');
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
        <button onClick={onExit} className="text-xs text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 mb-3 inline-flex items-center gap-1">
          <ArrowLeft size={12} /> Back
        </button>
        <h2 className="text-base font-bold text-gray-900 dark:text-white mb-1">Head-to-head debate</h2>
        <p className="text-xs text-gray-500 dark:text-gray-400 mb-5">Create a match and share the code, or join one.</p>

        <button
          onClick={handleCreate}
          disabled={busy}
          className="w-full py-3 mb-4 rounded-xl bg-amber-500 hover:bg-amber-600 disabled:opacity-50 text-white text-sm font-semibold flex items-center justify-center gap-2"
        >
          {busy ? <Loader2 size={14} className="animate-spin" /> : <Zap size={14} />}
          Create match
        </button>

        <div className="relative my-3 text-center">
          <span className="text-[10px] uppercase tracking-wider text-gray-400 bg-white dark:bg-[#0D0D14] relative z-10 px-2">or</span>
          <div className="absolute inset-x-0 top-1/2 border-t border-gray-200 dark:border-[#2A2A40]" />
        </div>

        <div className="flex gap-2">
          <input
            value={joinInput}
            onChange={e => setJoinInput(e.target.value.toUpperCase().slice(0, 5))}
            onKeyDown={e => { if (e.key === 'Enter') handleJoin(); }}
            placeholder="Code"
            className="flex-1 px-3 py-2.5 rounded-xl border border-gray-200 dark:border-[#2A2A40] bg-white dark:bg-[#161622] text-sm font-mono uppercase tracking-widest outline-none focus:ring-2 focus:ring-amber-500/40"
          />
          <button
            onClick={handleJoin}
            disabled={busy || joinInput.trim().length < 4}
            className="px-5 py-2.5 rounded-xl bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white text-sm font-semibold"
          >
            Join
          </button>
        </div>
        {error && <p className="mt-3 text-xs text-rose-500 bg-rose-50 dark:bg-rose-900/20 border border-rose-200 dark:border-rose-800 rounded-lg px-3 py-2">{error}</p>}
      </div>
    );
  }

  // ===== LOBBY =====
  if (mode === 'mp-lobby' && match) {
    // Trust the action that put us here, with the server's hostId as a
    // backup. This way the host UI shows even if AuthContext hasn't
    // fully hydrated user.id yet.
    const isHost = iAmHost || (myId && match.hostId === myId);
    const opponent = match.players.find(p => (myId ? p.userId !== myId : p.userId !== match.hostId));
    const opponentJoined = match.players.length >= 2;
    return (
      <div className="p-6 max-w-md mx-auto">
        <p className="text-[11px] uppercase tracking-[0.18em] text-gray-500 dark:text-gray-400 mb-1.5">Match code</p>
        <button
          onClick={copyCode}
          className="w-full font-mono text-3xl font-black tabular-nums tracking-[0.2em] text-gray-900 dark:text-white bg-white dark:bg-[#161622] border-2 border-amber-300 dark:border-amber-800 rounded-xl py-4 mb-3 hover:bg-amber-50 dark:hover:bg-amber-900/15 transition-colors inline-flex items-center justify-center gap-3"
        >
          {match.code}
          {copied ? <Check size={18} className="text-emerald-500" /> : <Copy size={16} className="text-gray-400" />}
        </button>
        <p className="text-[11px] text-gray-500 dark:text-gray-400 text-center mb-5">Share this code with your opponent.</p>

        <div className="bg-gray-50 dark:bg-[#161622] border border-gray-200 dark:border-[#2A2A40] rounded-xl p-3 mb-5">
          <p className="text-[10px] font-bold uppercase tracking-[0.15em] text-gray-500 dark:text-gray-400 mb-2">Players</p>
          <div className="space-y-1.5">
            {match.players.map(p => (
              <div key={p.userId} className="flex items-center gap-2">
                <div className="w-6 h-6 rounded-full bg-amber-200 dark:bg-amber-900/40 text-amber-700 dark:text-amber-300 flex items-center justify-center text-[10px] font-bold">
                  {p.name.charAt(0).toUpperCase()}
                </div>
                <span className="text-sm text-gray-800 dark:text-gray-200">{p.name}</span>
                {p.userId === match.hostId && <span className="text-[9px] uppercase tracking-wider text-gray-400">Host</span>}
                {p.userId === myId && <span className="text-[9px] uppercase tracking-wider text-blue-500">You</span>}
              </div>
            ))}
            {!opponentJoined && (
              <div className="flex items-center gap-2 opacity-60">
                <div className="w-6 h-6 rounded-full bg-gray-200 dark:bg-[#0D0D14] flex items-center justify-center text-[10px] font-bold text-gray-400">?</div>
                <span className="text-sm text-gray-500 italic">Waiting for opponent…</span>
                <Loader2 size={12} className="animate-spin text-gray-400" />
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
              className="w-full px-3 py-2 mb-2 rounded-lg border border-gray-200 dark:border-[#2A2A40] bg-white dark:bg-[#161622] text-sm outline-none focus:ring-2 focus:ring-amber-500/40"
            />
            <div className="flex flex-wrap gap-1 mb-3">
              {QUICK_TOPICS.slice(0, 4).map(t => (
                <button key={t} onClick={() => setTopicInput(t)} className="px-2 py-0.5 rounded text-[10px] font-medium text-gray-600 dark:text-gray-400 bg-gray-100 dark:bg-[#161622] border border-gray-200 dark:border-[#2A2A40] hover:border-amber-300">
                  {t}
                </button>
              ))}
            </div>
            <p className="text-xs font-semibold text-gray-700 dark:text-gray-300 mb-2">You will argue</p>
            <div className="grid grid-cols-2 gap-2 mb-4">
              <button onClick={() => setHostSide('for')} className={`py-2 rounded-lg text-sm font-semibold border-2 ${hostSide === 'for' ? 'bg-emerald-600 text-white border-emerald-600' : 'border-gray-200 dark:border-[#2A2A40] text-gray-700 dark:text-gray-300'}`}>
                FOR
              </button>
              <button onClick={() => setHostSide('against')} className={`py-2 rounded-lg text-sm font-semibold border-2 ${hostSide === 'against' ? 'bg-rose-600 text-white border-rose-600' : 'border-gray-200 dark:border-[#2A2A40] text-gray-700 dark:text-gray-300'}`}>
                AGAINST
              </button>
            </div>
            <button
              onClick={handleStart}
              disabled={busy || !topicInput.trim() || !opponentJoined}
              className="w-full py-3 rounded-xl bg-amber-500 hover:bg-amber-600 disabled:opacity-50 text-white text-sm font-semibold flex items-center justify-center gap-2"
            >
              {busy ? <Loader2 size={14} className="animate-spin" /> : <Swords size={14} />}
              {opponentJoined ? 'Start the debate' : 'Waiting for opponent…'}
            </button>
          </>
        ) : (
          <p className="text-xs text-gray-500 dark:text-gray-400 text-center italic">Waiting for the host to set the topic and start…</p>
        )}

        {error && <p className="mt-3 text-xs text-rose-500 bg-rose-50 dark:bg-rose-900/20 border border-rose-200 dark:border-rose-800 rounded-lg px-3 py-2">{error}</p>}
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
        <div className="px-4 py-2 border-b border-gray-200 dark:border-[#2A2A40] bg-gradient-to-r from-amber-50 to-orange-50 dark:from-amber-950/15 dark:to-orange-950/15">
          <p className="text-xs text-gray-700 dark:text-gray-200 font-medium truncate">{match.topic}</p>
          <div className="flex items-center gap-3 mt-1">
            <ScorePill name={me?.name || 'You'} side={me?.side} score={myScore} active={myTurn} self />
            <span className="text-gray-300 dark:text-gray-700">vs</span>
            <ScorePill name={opp?.name || 'Opponent'} side={opp?.side} score={oppScore} active={!myTurn} />
            <span className="flex-1" />
            <button
              onClick={handleVoteEnd}
              disabled={voting || iVoted}
              title={iVoted ? 'You voted to end. Waiting for opponent.' : oppVoted ? 'Opponent voted to end. Vote yes to finish.' : 'Vote to end the debate. Both must vote.'}
              className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-md text-[11px] font-semibold transition-colors ${
                iVoted
                  ? 'bg-amber-200 dark:bg-amber-900/30 text-amber-800 dark:text-amber-300'
                  : oppVoted
                    ? 'bg-amber-500 hover:bg-amber-600 text-white animate-pulse'
                    : 'bg-amber-500 hover:bg-amber-600 text-white'
              }`}
            >
              {voting ? <Loader2 size={11} className="animate-spin" /> : iVoted ? 'Waiting…' : oppVoted ? 'Confirm end' : 'Vote to end'}
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
                <div className={`max-w-[85%] rounded-2xl p-3.5 shadow-sm ${isMine ? 'bg-blue-600 text-white rounded-tr-md' : 'bg-gray-200 dark:bg-[#2A2A40] text-gray-900 dark:text-gray-100 rounded-tl-md'}`}>
                  <div className="flex items-center gap-2 mb-1.5">
                    <span className={`text-[9px] font-bold uppercase tracking-wider ${isMine ? 'text-blue-100' : 'text-gray-500 dark:text-gray-400'}`}>
                      {t.side === 'for' ? 'FOR' : 'AGAINST'} · {isMine ? 'you' : opp?.name}
                    </span>
                  </div>
                  <p className="text-sm leading-relaxed whitespace-pre-wrap">{t.content}</p>
                  <div className={`mt-2 pt-2 border-t flex items-center gap-2 text-[10px] ${isMine ? 'border-white/20 text-blue-100' : 'border-gray-300 dark:border-[#3a3a52] text-gray-500 dark:text-gray-400'}`}>
                    <span className="font-bold tabular-nums">{t.score.total}/30</span>
                    <span>· arg {t.score.argumentation} · ev {t.score.evidence} · rh {t.score.rhetoric}</span>
                  </div>
                  {t.feedback && (
                    <p className={`mt-1 text-[10px] italic ${isMine ? 'text-blue-100' : 'text-gray-500 dark:text-gray-400'}`}>{t.feedback}</p>
                  )}
                </div>
              </div>
            );
          })}
        </div>

        {/* Composer */}
        <div className="border-t border-gray-200 dark:border-[#2A2A40] bg-white dark:bg-[#161622] px-3 pt-2 pb-3">
          {!myTurn ? (
            <p className="text-xs text-gray-500 dark:text-gray-400 text-center py-2.5">
              <Loader2 size={11} className="inline animate-spin mr-1" />
              Waiting for {opp?.name || 'opponent'} to make their argument…
            </p>
          ) : (
            <>
              <textarea
                value={argument}
                onChange={e => setArgument(e.target.value)}
                placeholder={`Make your argument as ${me?.side?.toUpperCase()}. Specifics, evidence, attack the opponent's last claim.`}
                rows={4}
                disabled={submittingMove}
                className="w-full p-3 rounded-xl border border-gray-200 dark:border-[#2A2A40] bg-white dark:bg-[#0D0D14] text-sm outline-none focus:ring-2 focus:ring-amber-500/40 resize-y"
              />
              <div className="flex items-center justify-between mt-2">
                <p className="text-[10px] text-gray-400 tabular-nums">
                  {argument.split(/\s+/).filter(Boolean).length} words · {argument.length} chars
                </p>
                <button
                  onClick={handleSubmitMove}
                  disabled={submittingMove || argument.trim().length < 20}
                  className="px-4 py-1.5 rounded-md bg-amber-500 hover:bg-amber-600 disabled:opacity-50 text-white text-xs font-semibold inline-flex items-center gap-1"
                >
                  {submittingMove ? <><Loader2 size={11} className="animate-spin" /> Grading…</> : <>Send turn</>}
                </button>
              </div>
            </>
          )}
        </div>

        {error && <p className="mx-3 mb-2 text-xs text-rose-500 bg-rose-50 dark:bg-rose-900/20 border border-rose-200 dark:border-rose-800 rounded-lg px-3 py-1.5">{error}</p>}
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
        <div className={`rounded-2xl p-5 mb-4 text-center border-2 ${won ? 'bg-emerald-50 dark:bg-emerald-900/15 border-emerald-300 dark:border-emerald-800' : tie ? 'bg-gray-50 dark:bg-[#161622] border-gray-300 dark:border-[#2A2A40]' : 'bg-rose-50 dark:bg-rose-900/15 border-rose-300 dark:border-rose-800'}`}>
          <Trophy size={32} className={`mx-auto mb-2 ${won ? 'text-emerald-500' : tie ? 'text-gray-400' : 'text-rose-500'}`} />
          <p className="text-2xl font-black uppercase tracking-wider text-gray-900 dark:text-white">
            {tie ? 'Tie' : v.winner === 'for' ? 'FOR side wins' : 'AGAINST side wins'}
          </p>
          <p className="text-xs text-gray-500 dark:text-gray-400 mt-1.5 tabular-nums">
            {match.players.map(p => `${p.name} (${p.side?.toUpperCase()}): ${match.scores[p.userId] || 0}`).join(' · ')}
          </p>
        </div>
        <div className="bg-white dark:bg-[#161622] border border-gray-200 dark:border-[#2A2A40] rounded-xl p-4 mb-3">
          <p className="text-[10px] font-bold uppercase tracking-[0.15em] text-gray-500 mb-1.5">Verdict</p>
          <p className="text-sm text-gray-800 dark:text-gray-100 leading-relaxed">{v.summary}</p>
        </div>
        {v.forStrongest && (
          <div className="bg-emerald-50 dark:bg-emerald-900/10 border border-emerald-200 dark:border-emerald-800 rounded-xl p-3 mb-2">
            <p className="text-[10px] font-bold uppercase tracking-[0.15em] text-emerald-600 dark:text-emerald-400 mb-1">FOR's strongest moment</p>
            <p className="text-xs text-gray-800 dark:text-gray-100 leading-relaxed">{v.forStrongest}</p>
          </div>
        )}
        {v.againstStrongest && (
          <div className="bg-rose-50 dark:bg-rose-900/10 border border-rose-200 dark:border-rose-800 rounded-xl p-3 mb-4">
            <p className="text-[10px] font-bold uppercase tracking-[0.15em] text-rose-600 dark:text-rose-400 mb-1">AGAINST's strongest moment</p>
            <p className="text-xs text-gray-800 dark:text-gray-100 leading-relaxed">{v.againstStrongest}</p>
          </div>
        )}
        <button onClick={onExit} className="w-full py-2.5 rounded-xl bg-blue-600 hover:bg-blue-700 text-white text-sm font-semibold">
          Back to Debate menu
        </button>
      </div>
    );
  }

  // Fallback
  return (
    <div className="p-6 text-center text-sm text-gray-500">
      <AlertCircle size={20} className="mx-auto mb-2 text-amber-500" />
      Loading…
    </div>
  );
}

function ScorePill({ name, side, score, active, self }) {
  const sideColor = side === 'for' ? 'text-emerald-600 dark:text-emerald-400' : 'text-rose-600 dark:text-rose-400';
  return (
    <div className={`flex items-center gap-1.5 px-2 py-0.5 rounded-md ${active ? 'ring-2 ring-amber-400 bg-amber-50 dark:bg-amber-900/20' : ''}`}>
      <span className={`text-[10px] font-semibold uppercase tracking-wider ${sideColor}`}>
        {side === 'for' ? 'FOR' : side === 'against' ? 'AG.' : '—'}
      </span>
      <span className="text-[11px] font-bold text-gray-800 dark:text-gray-100 tabular-nums">{score}</span>
      <span className="text-[10px] text-gray-500 dark:text-gray-400 truncate max-w-[80px]">
        {self ? 'you' : name}
      </span>
    </div>
  );
}
