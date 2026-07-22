import { useState, useEffect, useRef, useCallback } from 'react';
import {
  Swords, ArrowLeft, Copy, Check, X, Trophy, Send, Clock, Users, Flag,
  LogOut, History as HistoryIcon, Sparkles, ChevronRight, RefreshCw,
  Image as ImageIcon, Crown,
} from 'lucide-react';
import { useAuth } from '../../context/AuthContext';
import { apiFetch, getToken } from '../../api/client';
import { InlineProgress } from '../shared/ProgressBar';
import { errorChatMessage } from '../../utils/aiErrors';
import useKeyboardInset from '../../hooks/useKeyboardInset';

// ── Bespoke mobile rewrite of the desktop DebatePanel. Full parity:
// solo vs AI, 1v1 (incl. timed), single-elimination tournaments (4/8/16),
// and history. Pure-dark, game-like surface matching MobileMatch. ──

// Adversarial system prompt for solo debates (ported from DebatePanel).
function buildAdversarialSystem(side) {
  const opp = side === 'for' ? 'AGAINST' : 'FOR';
  return `You are a sharp, openly adversarial debate opponent. The user is arguing ${side === 'for' ? 'FOR' : 'AGAINST'} the topic - you argue ${opp}.

Rules:
- Be direct and combative, never wishy-washy. Take a clear stance and defend it hard.
- Use real data, examples, and web search to back claims. Cite specifics.
- Attack the user's STRONGEST argument first, not their weakest.
- Demand specifics when they hand-wave. Call out vague claims.
- Keep it tight: 2-3 paragraphs max per turn. No rambling.
- Never moderate or play both sides. You are ${opp} and only ${opp}.
- Use GitHub-flavored markdown for structure when helpful.`;
}

const THEMES = [
  { id: '',          label: 'Mixed' },
  { id: 'tech',      label: 'Tech' },
  { id: 'education', label: 'Education' },
  { id: 'science',   label: 'Science' },
  { id: 'society',   label: 'Society' },
  { id: 'sports',    label: 'Sports' },
];

const QUICK_TOPICS = [
  'Social media does more harm than good',
  'AI will create more jobs than it destroys',
  'Homework should be abolished',
  'Space exploration is worth the cost',
  'College should be free for everyone',
  'Remote work is better than office work',
];

const MAX_ROUND_OPTS = [
  { v: 3, label: '3' }, { v: 5, label: '5' }, { v: 7, label: '7' },
  { v: 10, label: '10' }, { v: 0, label: '∞' },
];

function formatClock(ms) {
  const s = Math.max(0, Math.ceil(ms / 1000));
  const m = Math.floor(s / 60);
  return `${m}:${String(s % 60).padStart(2, '0')}`;
}

function sideLabel(s) {
  return s === 'for' ? 'FOR' : s === 'against' ? 'AGAINST' : '—';
}

// Open an SSE stream via fetch (EventSource can't send the auth header).
// Calls onEvent(parsedJson) for each `data:` frame until aborted.
async function openSSE(path, onEvent, signal) {
  const res = await fetch(path, {
    headers: { Authorization: `Bearer ${getToken()}` },
    signal,
  });
  if (!res.ok || !res.body) throw new Error(`stream ${res.status}`);
  const reader = res.body.getReader();
  const dec = new TextDecoder();
  let buf = '';
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    buf += dec.decode(value, { stream: true });
    const parts = buf.split('\n\n');
    buf = parts.pop() || '';
    for (const part of parts) {
      const line = part.split('\n').find(l => l.startsWith('data:'));
      if (!line) continue;
      const json = line.slice(5).trim();
      if (!json) continue;
      try { onEvent(JSON.parse(json)); } catch {}
    }
  }
}

// Read up to 4 image Files into {dataUrl, mimeType} objects.
function readImages(files) {
  return Promise.all(
    Array.from(files).slice(0, 4).map(f => new Promise((resolve) => {
      const r = new FileReader();
      r.onload = () => resolve({ dataUrl: r.result, mimeType: f.type || 'image/png' });
      r.onerror = () => resolve(null);
      r.readAsDataURL(f);
    }))
  ).then(arr => arr.filter(Boolean));
}

export default function MobileDebate() {
  const [view, setView] = useState('menu'); // menu | solo | mp | tournament | history
  const back = useCallback(() => setView('menu'), []);

  return (
    <div className="flex-1 min-h-0 flex flex-col bg-[#0a0a14] text-white">
      {view === 'menu' && <ModeMenu onPick={setView} />}
      {view === 'solo' && <SoloDebate onExit={back} />}
      {view === 'mp' && <Multiplayer onExit={back} />}
      {view === 'tournament' && <Tournament onExit={back} />}
      {view === 'history' && <History onExit={back} />}
    </div>
  );
}

// ─────────────────────────── MODE MENU ───────────────────────────
function ModeMenu({ onPick }) {
  const [rejoin, setRejoin] = useState(null);
  useEffect(() => {
    let alive = true;
    apiFetch('/api/debate/my-active-tournament')
      .then(r => { if (alive) setRejoin(r?.tournament || null); })
      .catch(() => {});
    return () => { alive = false; };
  }, []);

  const tiles = [
    { id: 'solo',       title: 'Solo vs AI',  icon: Swords },
    { id: 'mp',         title: '1v1 Online',  icon: Users },
    { id: 'tournament', title: 'Tournament',  icon: Trophy },
    { id: 'history',    title: 'History',     icon: HistoryIcon, tone: 'from-white/10 to-white/0 border-white/10' },
  ];

  return (
    <div className="flex-1 min-h-0 overflow-y-auto px-4 pt-3 pb-6">
      <div className="flex items-center gap-2 mb-4">
        <div className="w-9 h-9 rounded-xl grid place-items-center bg-indigo-500/15 border border-indigo-400/20">
          <Swords size={18} className="text-indigo-300" />
        </div>
        <h1 className="text-[17px] font-bold tracking-tight">Debate</h1>
      </div>

      {rejoin && (
        <button
          onClick={() => onPick('tournament')}
          className="w-full mb-3 rounded-2xl border border-amber-400/30 bg-amber-500/10 p-3 flex items-center gap-3 text-left active:bg-amber-500/15"
        >
          <Trophy size={18} className="text-amber-300 shrink-0" />
          <div className="min-w-0 flex-1">
            <p className="text-[13px] font-semibold text-amber-100 truncate">Rejoin tournament</p>
            <p className="text-[11px] text-amber-200/60 truncate">{rejoin.name || rejoin.topic} · {rejoin.code}</p>
          </div>
          <ChevronRight size={16} className="text-amber-300/60 shrink-0" />
        </button>
      )}

      <div className="grid grid-cols-1 gap-3">
        {tiles.map(t => {
          const Icon = t.icon;
          return (
            <button
              key={t.id}
              onClick={() => onPick(t.id)}
              className="w-full rounded-2xl border border-blue-500 bg-blue-500 p-4 flex items-center gap-3 text-left active:bg-blue-600 active:scale-[0.99] transition-transform"
            >
              <div className="w-11 h-11 rounded-xl grid place-items-center bg-white/[0.06] border border-white/[0.08] shrink-0">
                <Icon size={20} className="text-white/80" />
              </div>
              <div className="min-w-0 flex-1">
                <p className="text-[15px] font-bold tracking-tight">{t.title}</p>
              </div>
              <ChevronRight size={18} className="text-white/25 shrink-0" />
            </button>
          );
        })}
      </div>
    </div>
  );
}

// ─────────────────────────── SOLO vs AI ───────────────────────────
function SoloDebate({ onExit }) {
  const [stage, setStage] = useState('setup'); // setup | chat | verdict
  const [side, setSide] = useState('for');
  const [topic, setTopic] = useState('');
  const [theme, setTheme] = useState('');
  const [messages, setMessages] = useState([]);
  const [input, setInput] = useState('');
  const [thinking, setThinking] = useState(false);
  const [starting, setStarting] = useState(false);
  const [verdict, setVerdict] = useState(null);
  const [judging, setJudging] = useState(false);
  const [singleProtestAccepted, setSingleProtestAccepted] = useState(false);
  const [err, setErr] = useState('');
  const systemRef = useRef('');
  const scrollerRef = useRef(null);
  const kbInset = useKeyboardInset();

  const visible = messages.filter(m => !m._hidden);

  useEffect(() => {
    const el = scrollerRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [messages, thinking]);

  const sendToAI = useCallback(async (msgs) => {
    setThinking(true);
    try {
      const apiMsgs = msgs.map(m => ({ role: m.role, content: m.content }));
      const result = await apiFetch('/api/chat', {
        method: 'POST',
        body: JSON.stringify({ system: systemRef.current, messages: apiMsgs, max_tokens: 4096, sourced: true }),
      });
      const text = result?.content?.[0]?.text || '';
      setMessages(cur => [...cur, { role: 'assistant', content: text, sources: result?.sources }]);
    } catch (e) {
      setMessages(cur => [...cur, errorChatMessage(e)]);
    } finally {
      setThinking(false);
    }
  }, []);

  async function handleStart() {
    const t = topic.trim();
    if (!t || starting) return;
    setStarting(true);
    setErr('');
    try {
      await apiFetch('/api/debate/start', { method: 'POST', body: JSON.stringify({}) });
    } catch (e) {
      setStarting(false);
      setErr(e.code === 'debate_limit_reached'
        ? "You've used this week's free debate. Upgrade to Pro for unlimited."
        : (e.message || 'Could not start debate'));
      return;
    }
    systemRef.current = buildAdversarialSystem(side);
    const boot = {
      role: 'user',
      content: `Topic: "${t}". I'm arguing ${side === 'for' ? 'FOR' : 'AGAINST'} this. Open with your counter - give me your strongest argument first.`,
      _hidden: true,
    };
    setMessages([boot]);
    setStage('chat');
    setStarting(false);
    sendToAI([boot]);
  }

  function handleSend() {
    const text = input.trim();
    if (!text || thinking) return;
    const next = [...messages, { role: 'user', content: text }];
    setMessages(next);
    setInput('');
    sendToAI(next);
  }

  async function handleEnd() {
    if (visible.length < 2 || judging) return;
    setJudging(true);
    setErr('');
    try {
      const transcript = messages
        .filter(m => !m._hidden && !m._error)
        .map(m => ({ role: m.role, content: m.content }));
      const r = await apiFetch('/api/debate/singleplayer/verdict', {
        method: 'POST',
        body: JSON.stringify({ topic: topic.trim(), userSide: side, transcript }),
      });
      setVerdict(r.verdict);
      setSingleProtestAccepted(false);
      setStage('verdict');
    } catch (e) {
      setErr(e.message || 'Could not generate verdict');
    } finally {
      setJudging(false);
    }
  }

  function reset() {
    setStage('setup'); setMessages([]); setInput(''); setVerdict(null); setSingleProtestAccepted(false); setErr('');
  }

  function handleSingleplayerProtest() {
    setVerdict(prev => {
      if (!prev) return prev;
      const currentStudent = Number(prev.studentScore) || 0;
      const currentAi = Number(prev.aiScore) || 0;
      const aiScore = currentAi >= 100 ? 99 : currentAi;
      const studentScore = Math.min(100, Math.max(currentStudent, aiScore + 1));
      return { ...prev, winner: 'student', studentScore, aiScore };
    });
    setSingleProtestAccepted(true);
  }

  // ── SETUP ──
  if (stage === 'setup') {
    return (
      <div className="flex-1 min-h-0 flex flex-col">
        <DebateHeader title="Solo vs AI" onBack={onExit} />
        <div className="flex-1 min-h-0 overflow-y-auto px-4 pb-6 space-y-4">
          <div>
            <SectionLabel>Your side</SectionLabel>
            <div className="grid grid-cols-2 gap-2">
              <SideBtn active={side === 'for'} onClick={() => setSide('for')} label="Argue FOR" tone="blue" />
              <SideBtn active={side === 'against'} onClick={() => setSide('against')} label="Argue AGAINST" tone="blue" />
            </div>
          </div>

          <div>
            <SectionLabel>Topic</SectionLabel>
            <textarea
              value={topic}
              onChange={e => setTopic(e.target.value)}
              placeholder="Type a resolution, or pick a suggestion below…"
              rows={2}
              className="w-full rounded-2xl bg-white/[0.04] border border-white/[0.08] px-3.5 py-3 text-[14px] text-white placeholder-white/25 outline-none focus:border-blue-400/40 resize-none"
            />
          </div>

          <div>
            <SectionLabel>Theme</SectionLabel>
            <div className="flex gap-2 overflow-x-auto pb-1 -mx-1 px-1">
              {THEMES.map(th => (
                <Pill key={th.id || 'mix'} active={theme === th.id} onClick={() => setTheme(th.id)}>{th.label}</Pill>
              ))}
            </div>
          </div>

          <TopicChips theme={theme} onPick={setTopic} />

          {err && <p className="text-[12px] text-rose-300">{err}</p>}
        </div>
        <div className="px-4 pb-4 pt-2 border-t border-white/[0.06]">
          <button
            onClick={handleStart}
            disabled={!topic.trim() || starting}
            className="w-full h-12 rounded-2xl bg-blue-500 text-white font-bold text-[15px] flex items-center justify-center gap-2 disabled:opacity-40 active:bg-blue-600"
          >
            {starting ? <InlineProgress active /> : <Swords size={17} />} Start debate
          </button>
        </div>
      </div>
    );
  }

  // ── VERDICT ──
  if (stage === 'verdict' && verdict) {
    const won = verdict.winner === 'student';
    const tie = verdict.winner === 'tie';
    return (
      <div className="flex-1 min-h-0 flex flex-col">
        <DebateHeader title="Verdict" onBack={onExit} />
        <div className="flex-1 min-h-0 overflow-y-auto px-4 pb-6 space-y-4">
          <div className={`rounded-3xl border p-5 text-center ${won ? 'border-emerald-400/30 bg-emerald-500/10' : tie ? 'border-white/15 bg-white/[0.04]' : 'border-rose-400/30 bg-rose-500/10'}`}>
            <Trophy size={28} className={`mx-auto mb-2 ${won ? 'text-emerald-300' : tie ? 'text-white/60' : 'text-rose-300'}`} />
            <p className="text-[20px] font-extrabold tracking-tight">{tie ? 'Tie' : won ? 'You won' : 'AI won'}</p>
            <div className="flex items-center justify-center gap-6 mt-3">
              <div><p className="text-[10px] uppercase tracking-wider text-white/40">You</p><p className="text-[22px] font-bold">{verdict.studentScore}</p></div>
              <div className="text-white/20 text-[16px]">vs</div>
              <div><p className="text-[10px] uppercase tracking-wider text-white/40">AI</p><p className="text-[22px] font-bold">{verdict.aiScore}</p></div>
            </div>
            {!won && !singleProtestAccepted && (
              <button
                onClick={handleSingleplayerProtest}
                className="mt-4 inline-flex h-9 items-center justify-center rounded-xl border border-amber-400/25 bg-amber-400/[0.10] px-3 text-[12px] font-bold text-amber-100 active:bg-amber-400/[0.16]"
              >
                I was right
              </button>
            )}
            {singleProtestAccepted && (
              <div className="mt-4 rounded-2xl border border-emerald-400/20 bg-emerald-400/[0.08] px-3 py-2 text-[11px] font-semibold text-emerald-100/80">
                Review accepted. Score corrected.
              </div>
            )}
          </div>
          <VerdictRow label="Summary" body={verdict.summary} />
          <VerdictRow label="Your strongest" body={verdict.studentStrongest} tone="emerald" />
          <VerdictRow label="Your weakest" body={verdict.studentWeakest} tone="rose" />
          <VerdictRow label="Drill next" body={verdict.improve} tone="blue" />
          <button onClick={reset} className="w-full h-12 rounded-2xl bg-blue-500 border border-blue-400/30 text-white font-semibold text-[14px] active:bg-blue-600">
            New debate
          </button>
        </div>
      </div>
    );
  }

  // ── CHAT ──
  return (
    <div className="flex-1 min-h-0 flex flex-col">
      <DebateHeader
        title={side === 'for' ? 'You: FOR' : 'You: AGAINST'}
        subtitle={topic}
        onBack={onExit}
        right={
          <button
            onClick={handleEnd}
            disabled={visible.length < 2 || judging}
            className="px-3 h-8 rounded-full bg-blue-500/20 border border-blue-400/30 text-blue-200 text-[12px] font-semibold flex items-center gap-1 disabled:opacity-40"
          >
            {judging ? <InlineProgress active /> : <Flag size={13} />} End
          </button>
        }
      />
      <div ref={scrollerRef} className="flex-1 min-h-0 overflow-y-auto px-3.5 py-3 space-y-3">
        {visible.map((m, i) => <Bubble key={i} msg={m} />)}
        {thinking && <TypingBubble />}
        {err && <p className="text-[12px] text-rose-300 text-center">{err}</p>}
      </div>
      <div
        className="px-3 pt-2 border-t border-white/[0.06] bg-[#0a0a14]"
        style={{ paddingBottom: kbInset ? Math.max(8, kbInset - 90) : 10 }}
      >
        <div className="flex items-end gap-2">
          <textarea
            value={input}
            onChange={e => setInput(e.target.value)}
            onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); handleSend(); } }}
            placeholder="Make your argument…"
            rows={1}
            className="flex-1 max-h-32 rounded-2xl bg-white/[0.05] border border-white/[0.08] px-3.5 py-2.5 text-[14px] text-white placeholder-white/25 outline-none focus:border-blue-400/40 resize-none"
          />
          <button
            onClick={handleSend}
            disabled={!input.trim() || thinking}
                  className="w-11 h-11 shrink-0 rounded-2xl bg-blue-500 grid place-items-center disabled:opacity-40 active:bg-blue-600"
          >
            <Send size={17} />
          </button>
        </div>
      </div>
    </div>
  );
}

// ─────────────────────────── 1v1 MULTIPLAYER ───────────────────────────
// Reused for tournament bracket matches via presetCode/tournamentCode.
// `onExit` returns to the debate menu (1v1) or bracket (tournament).
function Multiplayer({ onExit, presetCode = null, tournamentCode = null, spectator = false }) {
  const { user } = useAuth();
  const myId = user?.id;
  const [code, setCode] = useState(presetCode || '');
  const [match, setMatch] = useState(null);
  const [phase, setPhase] = useState(presetCode ? 'stream' : 'menu'); // menu | stream
  const [joinCode, setJoinCode] = useState('');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  const [copied, setCopied] = useState(false);
  // lobby host config
  const [topic, setTopic] = useState('');
  const [theme, setTheme] = useState('');
  const [hostSide, setHostSide] = useState('for');
  const [timedMode, setTimedMode] = useState(false);
  const [maxRounds, setMaxRounds] = useState(5);
  // game input
  const [argument, setArgument] = useState('');
  const [images, setImages] = useState([]);
  const [submitting, setSubmitting] = useState(false);
  const [now, setNow] = useState(Date.now());
  const [leaveConfirm, setLeaveConfirm] = useState(false);
  const [oppLeft, setOppLeft] = useState(null);
  const abortRef = useRef(null);
  const draftTimerRef = useRef(null);
  const timeoutFiredRef = useRef('');
  const scrollerRef = useRef(null);
  const fileRef = useRef(null);
  const kbInset = useKeyboardInset();

  const me = match?.players?.find(p => p.userId === myId) || null;
  const opp = match?.players?.find(p => p.userId !== myId) || null;
  const mySide = me?.side || (match?.hostId === myId ? hostSide : (hostSide === 'for' ? 'against' : 'for'));
  const isHost = match?.hostId === myId;
  const myTurn = match?.turnOf === myId && !spectator;

  // ── streaming ──
  const connect = useCallback((c) => {
    if (abortRef.current) abortRef.current.abort();
    const ac = new AbortController();
    abortRef.current = ac;
    openSSE(`/api/debate/match/${c}/stream`, (ev) => {
      if (ev.match) setMatch(ev.match);
      if (ev.type === 'player_left') setOppLeft(ev.leaverName || 'Opponent');
    }, ac.signal).catch(() => {});
  }, []);

  useEffect(() => {
    if (phase === 'stream' && code) connect(code);
    return () => { if (abortRef.current) abortRef.current.abort(); };
  }, [phase, code, connect]);

  // countdown ticker (timed mode)
  useEffect(() => {
    if (!match?.timedMode || match?.state !== 'playing') return;
    const id = setInterval(() => setNow(Date.now()), 250);
    return () => clearInterval(id);
  }, [match?.timedMode, match?.state]);

  useEffect(() => {
    const el = scrollerRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [match?.turns?.length]);

  const deadline = match?.timedMode && match?.turnStartedAt ? match.turnStartedAt + (match.turnLimitMs || 0) : 0;
  const remaining = deadline ? deadline - now : 0;

  const doSubmit = useCallback(async (timedOut = false) => {
    if (submitting || !code) return;
    const text = argument.trim();
    if (!timedOut && text.length < 20 && images.length === 0) {
      setErr('At least 20 characters (or attach an image).');
      return;
    }
    setSubmitting(true);
    setErr('');
    try {
      await apiFetch(`/api/debate/match/${code}/move`, {
        method: 'POST',
        body: JSON.stringify({ argument: text, images, timedOut }),
      });
      setArgument('');
      setImages([]);
    } catch (e) {
      setErr(e.message || 'Move failed');
    } finally {
      setSubmitting(false);
    }
  }, [submitting, code, argument, images]);

  // auto-submit on timeout (guarded per turnStartedAt so it fires once)
  useEffect(() => {
    if (!myTurn || !match?.timedMode || match?.state !== 'playing') return;
    if (remaining > 0) return;
    const key = String(match.turnStartedAt);
    if (timeoutFiredRef.current === key || submitting) return;
    timeoutFiredRef.current = key;
    doSubmit(true);
  }, [remaining, myTurn, match?.timedMode, match?.state, match?.turnStartedAt, submitting, doSubmit]);

  // draft broadcast (timed + my turn)
  useEffect(() => {
    if (!match?.timedMode || !myTurn || !code) return;
    if (draftTimerRef.current) clearTimeout(draftTimerRef.current);
    draftTimerRef.current = setTimeout(() => {
      apiFetch(`/api/debate/match/${code}/draft`, {
        method: 'POST', body: JSON.stringify({ text: argument }),
      }).catch(() => {});
    }, 400);
    return () => { if (draftTimerRef.current) clearTimeout(draftTimerRef.current); };
  }, [argument, match?.timedMode, myTurn, code]);

  async function handleCreate() {
    setBusy(true); setErr('');
    try {
      const r = await apiFetch('/api/debate/match', { method: 'POST', body: JSON.stringify({}) });
      setCode(r.code); setMatch(r.match); setPhase('stream');
    } catch (e) { setErr(e.message || 'Could not create'); }
    finally { setBusy(false); }
  }
  async function handleJoin() {
    const c = joinCode.trim().toUpperCase();
    if (!c) return;
    setBusy(true); setErr('');
    try {
      const r = await apiFetch(`/api/debate/match/${c}/join`, { method: 'POST', body: JSON.stringify({}) });
      setCode(c); setMatch(r.match); setPhase('stream');
    } catch (e) { setErr(e.message || 'Could not join'); }
    finally { setBusy(false); }
  }
  async function handleReady(ready) {
    try { await apiFetch(`/api/debate/match/${code}/ready`, { method: 'POST', body: JSON.stringify({ ready }) }); }
    catch (e) { setErr(e.message || 'Ready failed'); }
  }
  async function handleStartMatch() {
    if (!topic.trim()) { setErr('Topic required'); return; }
    setBusy(true); setErr('');
    try {
      await apiFetch(`/api/debate/match/${code}/start`, {
        method: 'POST',
        body: JSON.stringify({ topic: topic.trim(), hostSide, timedMode, maxRounds }),
      });
    } catch (e) { setErr(e.message || 'Could not start'); }
    finally { setBusy(false); }
  }
  async function handleVoteEnd() {
    try { await apiFetch(`/api/debate/match/${code}/vote-end`, { method: 'POST', body: JSON.stringify({}) }); }
    catch (e) { setErr(e.message || 'Vote failed'); }
  }
  async function handleLeave() {
    try {
      if (tournamentCode) await apiFetch(`/api/debate/tournament/${tournamentCode}/leave`, { method: 'POST', body: JSON.stringify({}) });
      else await apiFetch(`/api/debate/match/${code}/leave`, { method: 'POST', body: JSON.stringify({}) });
    } catch {}
    if (abortRef.current) abortRef.current.abort();
    onExit();
  }
  async function pickImages(e) {
    const files = e.target.files;
    if (!files?.length) return;
    const imgs = await readImages(files);
    setImages(cur => [...cur, ...imgs].slice(0, 4));
    if (fileRef.current) fileRef.current.value = '';
  }

  // ── MENU (create / join) ──
  if (phase === 'menu') {
    return (
      <div className="flex-1 min-h-0 flex flex-col">
        <DebateHeader title="1v1 Online" onBack={onExit} />
        <div className="flex-1 min-h-0 overflow-y-auto px-4 pb-6 space-y-4">
          <button
            onClick={handleCreate}
            disabled={busy}
            className="w-full h-12 rounded-2xl bg-blue-500 font-bold text-[15px] flex items-center justify-center gap-2 disabled:opacity-40 active:bg-blue-600"
          >
            {busy ? <InlineProgress active /> : <Users size={17} />} Create room
          </button>
          <div className="flex items-center gap-2 text-white/20 text-[11px]">
            <div className="flex-1 h-px bg-white/[0.08]" /> OR <div className="flex-1 h-px bg-white/[0.08]" />
          </div>
          <div>
            <SectionLabel>Join with code</SectionLabel>
            <div className="flex gap-2">
              <input
                value={joinCode}
                onChange={e => setJoinCode(e.target.value.toUpperCase())}
                placeholder="ABCD"
                maxLength={8}
                className="flex-1 rounded-2xl bg-white/[0.05] border border-white/[0.08] px-4 py-3 text-[16px] font-mono tracking-widest text-white placeholder-white/20 outline-none focus:border-blue-400/40"
              />
              <button
                onClick={handleJoin}
                disabled={busy || !joinCode.trim()}
                className="px-5 rounded-2xl bg-blue-500/15 border border-blue-400/30 text-blue-100 font-semibold disabled:opacity-40 active:bg-blue-500/25"
              >Join</button>
            </div>
          </div>
          {err && <p className="text-[12px] text-rose-300">{err}</p>}
        </div>
      </div>
    );
  }

  if (!match) {
    return (
      <div className="flex-1 min-h-0 flex flex-col">
        <DebateHeader title="1v1 Online" onBack={onExit} />
        <div className="flex-1 grid place-items-center text-white/40 text-[13px]"><InlineProgress active /> Connecting…</div>
      </div>
    );
  }

  // ── VERDICT ──
  if (match.state === 'finished') {
    const v = match.verdict || {};
    const myWin = v.winner === mySide;
    const tie = v.winner === 'tie';
    return (
      <div className="flex-1 min-h-0 flex flex-col">
        <DebateHeader title="Verdict" onBack={onExit} />
        <div className="flex-1 min-h-0 overflow-y-auto px-4 pb-6 space-y-4">
          <div className={`rounded-3xl border p-5 text-center ${myWin ? 'border-emerald-400/30 bg-emerald-500/10' : tie ? 'border-white/15 bg-white/[0.04]' : 'border-rose-400/30 bg-rose-500/10'}`}>
            <Trophy size={28} className={`mx-auto mb-2 ${myWin ? 'text-emerald-300' : tie ? 'text-white/60' : 'text-rose-300'}`} />
            <p className="text-[20px] font-extrabold">{tie ? 'Tie' : myWin ? 'You won' : 'You lost'}</p>
            <p className="text-[12px] text-white/40 mt-1">{sideLabel(v.winner)} side takes it</p>
            <div className="flex items-center justify-center gap-6 mt-3">
              <ScoreCol label={me?.name || 'You'} score={match.scores?.[myId] || 0} />
              <div className="text-white/20">vs</div>
              <ScoreCol label={opp?.name || 'Opp'} score={match.scores?.[opp?.userId] || 0} />
            </div>
          </div>
          <VerdictRow label="Summary" body={v.summary} />
          <VerdictRow label="FOR strongest" body={v.forStrongest} tone="emerald" />
          <VerdictRow label="AGAINST strongest" body={v.againstStrongest} tone="rose" />
          <button onClick={onExit} className="w-full h-12 rounded-2xl bg-blue-500 border border-blue-400/30 text-white font-semibold text-[14px] active:bg-blue-600">
            {tournamentCode ? 'Back to bracket' : 'Done'}
          </button>
        </div>
      </div>
    );
  }

  // ── LOBBY (waiting) ──
  if (match.state === 'waiting') {
    const iAmReady = match.readyUserIds?.includes(myId);
    const bothPresent = match.players.length >= 2;
    const allReady = bothPresent && match.players.every(p => match.readyUserIds?.includes(p.userId));
    return (
      <div className="flex-1 min-h-0 flex flex-col">
        <DebateHeader title="Lobby" onBack={() => setLeaveConfirm(true)} />
        <div className="flex-1 min-h-0 overflow-y-auto px-4 pb-6 space-y-4">
          <div className="rounded-2xl border border-white/[0.08] bg-white/[0.03] p-4 text-center">
            <p className="text-[10px] uppercase tracking-widest text-white/35 mb-1">Room code</p>
            <button
              onClick={() => { navigator.clipboard?.writeText(code); setCopied(true); setTimeout(() => setCopied(false), 1500); }}
              className="inline-flex items-center gap-2 text-[28px] font-bold font-mono tracking-[0.3em] text-white"
            >
              {code} {copied ? <Check size={18} className="text-emerald-300" /> : <Copy size={16} className="text-white/40" />}
            </button>
          </div>

          <div className="space-y-2">
            <SectionLabel>Players</SectionLabel>
            {match.players.map(p => (
              <div key={p.userId} className="flex items-center justify-between rounded-xl bg-white/[0.04] border border-white/[0.06] px-3 py-2.5">
                <span className="text-[14px] font-medium">{p.name}{p.userId === myId ? ' (you)' : ''}{p.userId === match.hostId ? ' · host' : ''}</span>
                {match.readyUserIds?.includes(p.userId)
                  ? <span className="text-[11px] text-emerald-300 font-semibold flex items-center gap-1"><Check size={12} /> Ready</span>
                  : <span className="text-[11px] text-white/30">Not ready</span>}
              </div>
            ))}
            {!bothPresent && <p className="text-[12px] text-white/35 flex items-center gap-2"><InlineProgress active /> Waiting for opponent…</p>}
          </div>

          {isHost && (
            <>
              <div>
                <SectionLabel>Topic</SectionLabel>
                <textarea value={topic} onChange={e => setTopic(e.target.value)} rows={2} placeholder="Resolution to debate…"
                  className="w-full rounded-2xl bg-white/[0.04] border border-white/[0.08] px-3.5 py-3 text-[14px] text-white placeholder-white/25 outline-none focus:border-blue-400/40 resize-none" />
                <div className="flex gap-2 overflow-x-auto pb-1 mt-2 -mx-1 px-1">
                  {THEMES.map(th => <Pill key={th.id || 'mix'} active={theme === th.id} onClick={() => setTheme(th.id)}>{th.label}</Pill>)}
                </div>
                <TopicChips theme={theme} onPick={setTopic} />
              </div>
              <div>
                <SectionLabel>Your side</SectionLabel>
                <div className="grid grid-cols-2 gap-2">
                  <SideBtn active={hostSide === 'for'} onClick={() => setHostSide('for')} label="FOR" tone="emerald" />
                  <SideBtn active={hostSide === 'against'} onClick={() => setHostSide('against')} label="AGAINST" tone="rose" />
                </div>
              </div>
              <div className="flex items-center justify-between rounded-2xl bg-white/[0.03] border border-white/[0.06] px-3.5 py-3">
                <div><p className="text-[13px] font-semibold flex items-center gap-1.5"><Clock size={14} /> Timed mode</p><p className="text-[11px] text-white/35">2 min per turn</p></div>
                <Toggle on={timedMode} onClick={() => setTimedMode(v => !v)} />
              </div>
              <div>
                <SectionLabel>Rounds per side</SectionLabel>
                <div className="flex gap-2">
                  {MAX_ROUND_OPTS.map(o => <Pill key={o.v} active={maxRounds === o.v} onClick={() => setMaxRounds(o.v)}>{o.label}</Pill>)}
                </div>
              </div>
            </>
          )}
          {err && <p className="text-[12px] text-rose-300">{err}</p>}
        </div>

        <div className="px-4 pb-4 pt-2 border-t border-white/[0.06] space-y-2">
          <button
            onClick={() => handleReady(!iAmReady)}
            className={`w-full h-11 rounded-2xl font-bold text-[14px] flex items-center justify-center gap-2 ${iAmReady ? 'bg-blue-500/15 border border-blue-400/30 text-blue-100' : 'bg-emerald-500 text-white active:bg-emerald-600'}`}
          >
            {iAmReady ? 'Ready ✓ (tap to unready)' : 'Ready up'}
          </button>
          {isHost && (
            <button
              onClick={handleStartMatch}
              disabled={busy || !allReady || !topic.trim()}
              className="w-full h-12 rounded-2xl bg-blue-500 font-bold text-[15px] flex items-center justify-center gap-2 disabled:opacity-40 active:bg-blue-600"
            >
              {busy ? <InlineProgress active /> : <Swords size={17} />} Start debate
            </button>
          )}
        </div>
        {leaveConfirm && (
          <ConfirmModal
            title="Leave lobby?"
            body="You'll be removed from this room."
            confirmLabel="Leave"
            onCancel={() => setLeaveConfirm(false)}
            onConfirm={handleLeave}
          />
        )}
      </div>
    );
  }

  // ── GAME (playing) ──
  const myTurns = match.turns.filter(t => t.userId === myId).length;
  const capReached = match.maxRounds > 0 && myTurns >= match.maxRounds;
  return (
    <div className="flex-1 min-h-0 flex flex-col">
      <DebateHeader
        title={match.topic || 'Debate'}
        subtitle={`You: ${sideLabel(mySide)} · vs ${opp?.name || 'Opp'}`}
        onBack={() => setLeaveConfirm(true)}
        right={
          <div className="flex items-center gap-2">
            <div className="text-right">
              <span className="text-[13px] font-bold text-emerald-300">{match.scores?.[myId] || 0}</span>
              <span className="text-white/25 text-[12px]"> / </span>
              <span className="text-[13px] font-bold text-rose-300">{match.scores?.[opp?.userId] || 0}</span>
            </div>
          </div>
        }
      />

      {match.timedMode && (
        <div className={`px-4 py-1.5 text-center text-[13px] font-mono font-bold ${remaining < 20000 ? 'text-rose-300 bg-rose-500/10' : 'text-white/60 bg-white/[0.03]'}`}>
          <Clock size={12} className="inline mr-1 -mt-0.5" />
          {myTurn ? `Your turn · ${formatClock(remaining)}` : `${opp?.name || 'Opp'}'s turn · ${formatClock(remaining)}`}
        </div>
      )}

      <div ref={scrollerRef} className="flex-1 min-h-0 overflow-y-auto px-3.5 py-3 space-y-3">
        {match.turns.length === 0 && <p className="text-center text-white/30 text-[13px] mt-6">FOR side opens. {match.turnOf === myId ? 'Your move.' : 'Waiting…'}</p>}
        {match.turns.map((t, i) => <TurnCard key={i} turn={t} mine={t.userId === myId} />)}
        {/* opponent live draft (timed) */}
        {match.timedMode && !myTurn && match.draftBy && match.draftBy !== myId && match.draftText && (
          <div className="rounded-2xl border border-white/[0.06] border-dashed bg-white/[0.02] px-3.5 py-2.5">
            <p className="text-[10px] uppercase tracking-wider text-white/30 mb-1">{opp?.name || 'Opp'} is typing…</p>
            <p className="text-[13px] text-white/45 whitespace-pre-wrap">{match.draftText}</p>
          </div>
        )}
      </div>

      {!spectator && (
        <div
          className="px-3 pt-2 border-t border-white/[0.06] bg-[#0a0a14]"
          style={{ paddingBottom: kbInset ? Math.max(8, kbInset - 90) : 10 }}
        >
          {images.length > 0 && (
            <div className="flex gap-2 mb-2 overflow-x-auto">
              {images.map((im, i) => (
                <div key={i} className="relative shrink-0">
                  <img src={im.dataUrl} alt="" className="h-14 w-14 rounded-lg object-cover border border-white/10" />
                  <button onClick={() => setImages(cur => cur.filter((_, j) => j !== i))} className="absolute -top-1 -right-1 w-4 h-4 rounded-full bg-rose-500 grid place-items-center"><X size={10} /></button>
                </div>
              ))}
            </div>
          )}
          {myTurn ? (
            <>
              <div className="flex items-end gap-2">
                <button onClick={() => fileRef.current?.click()} className="w-11 h-11 shrink-0 rounded-2xl bg-white/[0.05] border border-white/[0.08] grid place-items-center active:bg-white/[0.1]">
                  <ImageIcon size={17} className="text-white/50" />
                </button>
                <input ref={fileRef} type="file" accept="image/*" multiple hidden onChange={pickImages} />
                <textarea
                  value={argument}
                  onChange={e => setArgument(e.target.value)}
                  placeholder="Your argument (min 20 chars)…"
                  rows={1}
                  className="flex-1 max-h-32 rounded-2xl bg-white/[0.05] border border-white/[0.08] px-3.5 py-2.5 text-[14px] text-white placeholder-white/25 outline-none focus:border-blue-400/40 resize-none"
                />
                <button
                  onClick={() => doSubmit(false)}
                  disabled={submitting || (argument.trim().length < 20 && images.length === 0)}
            className="w-11 h-11 shrink-0 rounded-2xl bg-blue-500 grid place-items-center disabled:opacity-40 active:bg-blue-600"
                >
                  {submitting ? <InlineProgress active /> : <Send size={17} />}
                </button>
              </div>
              {err && <p className="text-[11px] text-rose-300 mt-1">{err}</p>}
            </>
          ) : (
            <div className="flex items-center gap-2">
              <p className="flex-1 text-[12px] text-white/35 flex items-center gap-2"><InlineProgress active /> Waiting for {opp?.name || 'opponent'}…</p>
          <button onClick={handleVoteEnd} className="px-3 h-9 rounded-full bg-blue-500/15 border border-blue-400/30 text-[12px] font-semibold text-blue-100 flex items-center gap-1 active:bg-blue-500/25">
                <Flag size={12} /> End {match.endVotes?.length ? `(${match.endVotes.length}/2)` : ''}
              </button>
            </div>
          )}
          {myTurn && (
            <button onClick={handleVoteEnd} className="w-full mt-2 text-[12px] text-white/35 flex items-center justify-center gap-1">
              <Flag size={11} /> Vote to end {match.endVotes?.length ? `(${match.endVotes.length}/2)` : ''}{capReached ? ' · round cap reached' : ''}
            </button>
          )}
        </div>
      )}

      {leaveConfirm && (
        <ConfirmModal
          title={tournamentCode ? 'Forfeit match?' : 'Leave debate?'}
          body={tournamentCode ? 'Leaving forfeits this bracket match — you lose and are eliminated.' : 'You will forfeit this debate.'}
          confirmLabel={tournamentCode ? 'Forfeit' : 'Leave'}
          onCancel={() => setLeaveConfirm(false)}
          onConfirm={handleLeave}
        />
      )}
      {oppLeft && (
        <ConfirmModal
          title="Opponent left"
          body={`${oppLeft} left the debate.`}
          confirmLabel="Exit"
          hideCancel
          onConfirm={onExit}
        />
      )}
    </div>
  );
}

// ─────────────────────────── TOURNAMENT ───────────────────────────
function Tournament({ onExit }) {
  const { user } = useAuth();
  const myId = user?.id;
  const [phase, setPhase] = useState('menu'); // menu | view | match
  const [code, setCode] = useState('');
  const [tour, setTour] = useState(null);
  const [activeMatch, setActiveMatch] = useState(null); // { code, spectator }
  const [joinCode, setJoinCode] = useState('');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  const [copied, setCopied] = useState(false);
  const [leaveConfirm, setLeaveConfirm] = useState(false);
  // create config
  const [size, setSize] = useState(8);
  const [name, setName] = useState('');
  const [topic, setTopic] = useState('');
  const [theme, setTheme] = useState('');
  const [timedMode, setTimedMode] = useState(false);
  const [maxRounds, setMaxRounds] = useState(5);
  const [hostPlays, setHostPlays] = useState(true);
  const abortRef = useRef(null);

  const connect = useCallback((c) => {
    if (abortRef.current) abortRef.current.abort();
    const ac = new AbortController();
    abortRef.current = ac;
    openSSE(`/api/debate/tournament/${c}/stream`, (ev) => {
      if (ev.type === 'cancelled') { setErr('Tournament was cancelled by the host.'); return; }
      if (ev.type === 'kicked') { setErr('You were removed from the tournament.'); setPhase('menu'); return; }
      if (ev.tournament) setTour(ev.tournament);
    }, ac.signal).catch(() => {});
  }, []);

  useEffect(() => {
    if (phase === 'view' && code) connect(code);
    return () => { if (abortRef.current) abortRef.current.abort(); };
  }, [phase, code, connect]);

  async function handleCreate() {
    if (!topic.trim()) { setErr('Topic required'); return; }
    setBusy(true); setErr('');
    try {
      const r = await apiFetch('/api/debate/tournament', {
        method: 'POST',
        body: JSON.stringify({ size, name: name.trim(), topic: topic.trim(), timedMode, maxRounds, hostPlays }),
      });
      setCode(r.code); setTour(r.tournament); setPhase('view');
    } catch (e) { setErr(e.message || 'Could not create'); }
    finally { setBusy(false); }
  }
  async function handleJoin() {
    const c = joinCode.trim().toUpperCase();
    if (!c) return;
    setBusy(true); setErr('');
    try {
      const r = await apiFetch(`/api/debate/tournament/${c}/join`, { method: 'POST', body: JSON.stringify({}) });
      setCode(c); setTour(r.tournament); setPhase('view');
    } catch (e) { setErr(e.message || 'Could not join'); }
    finally { setBusy(false); }
  }
  async function handleStart() {
    setBusy(true); setErr('');
    try { await apiFetch(`/api/debate/tournament/${code}/start`, { method: 'POST', body: JSON.stringify({}) }); }
    catch (e) { setErr(e.message || 'Could not start'); }
    finally { setBusy(false); }
  }
  async function handleKick(uid) {
    try { await apiFetch(`/api/debate/tournament/${code}/kick`, { method: 'POST', body: JSON.stringify({ userId: uid }) }); }
    catch (e) { setErr(e.message || 'Kick failed'); }
  }
  async function handleLeave() {
    try { await apiFetch(`/api/debate/tournament/${code}/leave`, { method: 'POST', body: JSON.stringify({}) }); } catch {}
    if (abortRef.current) abortRef.current.abort();
    onExit();
  }

  // In-bracket match (reuse Multiplayer). Returning re-streams the bracket.
  if (phase === 'match' && activeMatch) {
    return (
      <Multiplayer
        presetCode={activeMatch.code}
        tournamentCode={code}
        spectator={activeMatch.spectator}
        onExit={() => { setActiveMatch(null); setPhase('view'); connect(code); }}
      />
    );
  }

  // ── MENU ──
  if (phase === 'menu') {
    return (
      <div className="flex-1 min-h-0 flex flex-col">
        <DebateHeader title="Tournament" onBack={onExit} />
        <div className="flex-1 min-h-0 overflow-y-auto px-4 pb-6 space-y-4">
          <div>
            <SectionLabel>Bracket size</SectionLabel>
            <div className="flex gap-2">
              {[4, 8, 16].map(s => <Pill key={s} active={size === s} onClick={() => setSize(s)}>{s} players</Pill>)}
            </div>
          </div>
          <div>
            <SectionLabel>Name (optional)</SectionLabel>
            <input value={name} onChange={e => setName(e.target.value)} placeholder="Friday Night Debates" maxLength={80}
              className="w-full rounded-2xl bg-white/[0.05] border border-white/[0.08] px-3.5 py-3 text-[14px] text-white placeholder-white/25 outline-none focus:border-blue-400/40" />
          </div>
          <div>
            <SectionLabel>Topic</SectionLabel>
            <textarea value={topic} onChange={e => setTopic(e.target.value)} rows={2} placeholder="Resolution for the bracket…"
              className="w-full rounded-2xl bg-white/[0.04] border border-white/[0.08] px-3.5 py-3 text-[14px] text-white placeholder-white/25 outline-none focus:border-blue-400/40 resize-none" />
            <div className="flex gap-2 overflow-x-auto pb-1 mt-2 -mx-1 px-1">
              {THEMES.map(th => <Pill key={th.id || 'mix'} active={theme === th.id} onClick={() => setTheme(th.id)}>{th.label}</Pill>)}
            </div>
            <TopicChips theme={theme} onPick={setTopic} />
          </div>
          <div className="flex items-center justify-between rounded-2xl bg-white/[0.03] border border-white/[0.06] px-3.5 py-3">
            <div><p className="text-[13px] font-semibold flex items-center gap-1.5"><Clock size={14} /> Timed mode</p><p className="text-[11px] text-white/35">2 min per turn</p></div>
            <Toggle on={timedMode} onClick={() => setTimedMode(v => !v)} />
          </div>
          <div>
            <SectionLabel>Rounds per match</SectionLabel>
            <div className="flex gap-2">
              {[3, 5, 7, 10].map(v => <Pill key={v} active={maxRounds === v} onClick={() => setMaxRounds(v)}>{v}</Pill>)}
            </div>
          </div>
          <div className="flex items-center justify-between rounded-2xl bg-white/[0.03] border border-white/[0.06] px-3.5 py-3">
            <div><p className="text-[13px] font-semibold flex items-center gap-1.5"><Users size={14} /> I'm playing</p><p className="text-[11px] text-white/35">Off = organize & spectate only</p></div>
            <Toggle on={hostPlays} onClick={() => setHostPlays(v => !v)} />
          </div>
          <button
            onClick={handleCreate}
            disabled={busy || !topic.trim()}
            className="w-full h-12 rounded-2xl bg-amber-500 text-black font-bold text-[15px] flex items-center justify-center gap-2 disabled:opacity-40 active:bg-amber-600"
          >
            {busy ? <InlineProgress active /> : <Trophy size={17} />} Create tournament
          </button>
          <div className="flex items-center gap-2 text-white/20 text-[11px]">
            <div className="flex-1 h-px bg-white/[0.08]" /> OR JOIN <div className="flex-1 h-px bg-white/[0.08]" />
          </div>
          <div className="flex gap-2">
            <input value={joinCode} onChange={e => setJoinCode(e.target.value.toUpperCase())} placeholder="CODE" maxLength={8}
              className="flex-1 rounded-2xl bg-white/[0.05] border border-white/[0.08] px-4 py-3 text-[16px] font-mono tracking-widest text-white placeholder-white/20 outline-none focus:border-blue-400/40" />
            <button onClick={handleJoin} disabled={busy || !joinCode.trim()} className="px-5 rounded-2xl bg-blue-500/15 border border-blue-400/30 text-blue-100 font-semibold disabled:opacity-40 active:bg-blue-500/25">Join</button>
          </div>
          {err && <p className="text-[12px] text-rose-300">{err}</p>}
        </div>
      </div>
    );
  }

  if (!tour) {
    return (
      <div className="flex-1 min-h-0 flex flex-col">
        <DebateHeader title="Tournament" onBack={onExit} />
        <div className="flex-1 grid place-items-center text-white/40 text-[13px]"><InlineProgress active /> Loading…</div>
      </div>
    );
  }

  const isHost = tour.hostId === myId;

  // ── LOBBY (waiting) ──
  if (tour.state === 'waiting') {
    return (
      <div className="flex-1 min-h-0 flex flex-col">
        <DebateHeader title={tour.name || 'Tournament'} onBack={() => setLeaveConfirm(true)} />
        <div className="flex-1 min-h-0 overflow-y-auto px-4 pb-6 space-y-4">
          <div className="rounded-2xl border border-white/[0.08] bg-white/[0.03] p-4 text-center">
            <p className="text-[10px] uppercase tracking-widest text-white/35 mb-1">Tournament code</p>
            <button
              onClick={() => { navigator.clipboard?.writeText(code); setCopied(true); setTimeout(() => setCopied(false), 1500); }}
              className="inline-flex items-center gap-2 text-[26px] font-bold font-mono tracking-[0.25em]"
            >
              {code} {copied ? <Check size={18} className="text-emerald-300" /> : <Copy size={16} className="text-white/40" />}
            </button>
            <p className="text-[12px] text-white/40 mt-2">{tour.players.length} / {tour.size} players · {tour.topic}</p>
          </div>
          <div className="space-y-2">
            <SectionLabel>Players</SectionLabel>
            {tour.players.map(p => (
              <div key={p.userId} className="flex items-center justify-between rounded-xl bg-white/[0.04] border border-white/[0.06] px-3 py-2.5">
                <span className="text-[14px] font-medium">{p.name}{p.userId === myId ? ' (you)' : ''}{p.userId === tour.hostId ? ' · host' : ''}</span>
                {isHost && p.userId !== myId && (
                  <button onClick={() => handleKick(p.userId)} className="text-[11px] text-rose-300/70 font-semibold">Kick</button>
                )}
              </div>
            ))}
            {Array.from({ length: Math.max(0, tour.size - tour.players.length) }).map((_, i) => (
              <div key={i} className="rounded-xl border border-dashed border-white/[0.08] px-3 py-2.5 text-[13px] text-white/25">Open slot…</div>
            ))}
          </div>
          {err && <p className="text-[12px] text-rose-300">{err}</p>}
        </div>
        <div className="px-4 pb-4 pt-2 border-t border-white/[0.06]">
          {isHost ? (
            <button
              onClick={handleStart}
              disabled={busy || tour.players.length < tour.size}
              className="w-full h-12 rounded-2xl bg-amber-500 text-black font-bold text-[15px] flex items-center justify-center gap-2 disabled:opacity-40 active:bg-amber-600"
            >
              {busy ? <InlineProgress active /> : <Trophy size={17} />}
              {tour.players.length < tour.size ? `Need ${tour.size - tour.players.length} more` : 'Start tournament'}
            </button>
          ) : (
            <p className="text-center text-[13px] text-white/40 flex items-center justify-center gap-2"><InlineProgress active /> Waiting for host to start…</p>
          )}
        </div>
        {leaveConfirm && (
          <ConfirmModal title="Leave tournament?" body="You'll be removed from the lobby." confirmLabel="Leave"
            onCancel={() => setLeaveConfirm(false)} onConfirm={handleLeave} />
        )}
      </div>
    );
  }

  // ── BRACKET (playing / finished) ──
  const totalRounds = Math.log2(tour.size);
  const roundLabel = (n) => {
    const fromEnd = totalRounds - n;
    if (fromEnd === 0) return 'Final';
    if (fromEnd === 1) return 'Semifinal';
    if (fromEnd === 2) return 'Quarterfinal';
    return `Round ${n}`;
  };
  const byRound = {};
  for (const b of tour.bracket) (byRound[b.round] ||= []).push(b);
  const champ = tour.champion ? tour.players.find(p => p.userId === tour.champion) : null;
  // my live match this round
  const myMatch = tour.bracket.find(b => b.state === 'playing' && b.players.includes(myId));

  function openMatch(b) {
    const amPlayer = b.players.includes(myId);
    setActiveMatch({ code: b.code, spectator: !amPlayer });
    setPhase('match');
  }

  return (
    <div className="flex-1 min-h-0 flex flex-col">
      <DebateHeader title={tour.name || 'Bracket'} subtitle={tour.topic} onBack={() => setLeaveConfirm(true)} />
      <div className="flex-1 min-h-0 overflow-y-auto px-4 pb-6 space-y-4">
        {tour.state === 'finished' && champ && (
          <div className="rounded-3xl border border-amber-400/40 bg-amber-500/10 p-5 text-center">
            <Crown size={30} className="mx-auto mb-2 text-amber-300" />
            <p className="text-[12px] uppercase tracking-widest text-amber-200/70">Champion</p>
            <p className="text-[22px] font-extrabold text-amber-100 mt-1">{champ.name}</p>
          </div>
        )}

        {myMatch && tour.state === 'playing' && (
          <button onClick={() => openMatch(myMatch)} className="w-full rounded-2xl border border-blue-400/30 bg-blue-500/15 p-4 flex items-center gap-3 text-left active:bg-blue-500/20">
            <Swords size={20} className="text-blue-300 shrink-0" />
            <div className="flex-1"><p className="text-[14px] font-bold text-blue-100">Your match is ready</p><p className="text-[11px] text-blue-200/60">Tap to enter the debate</p></div>
            <ChevronRight size={18} className="text-blue-300/60" />
          </button>
        )}

        {Object.keys(byRound).sort((a, b) => a - b).map(rnd => (
          <div key={rnd}>
            <SectionLabel>{roundLabel(Number(rnd))}</SectionLabel>
            <div className="space-y-2">
              {byRound[rnd].sort((a, b) => a.matchIndex - b.matchIndex).map(b => {
                const names = b.players.map(uid => tour.players.find(p => p.userId === uid)?.name || '—');
                const watchable = b.state === 'playing' && !b.players.includes(myId);
                return (
                  <button
                    key={b.code}
                    onClick={() => (b.players.includes(myId) && b.state === 'playing') ? openMatch(b) : watchable ? openMatch(b) : null}
                    disabled={!(b.state === 'playing')}
                    className={`w-full rounded-xl border px-3 py-2.5 text-left ${b.state === 'finished' ? 'border-white/[0.06] bg-white/[0.02]' : 'border-blue-400/20 bg-blue-500/[0.06] active:bg-blue-500/10'}`}
                  >
                    {[0, 1].map(side => {
                      const uid = b.players[side];
                      const won = b.winnerId && b.winnerId === uid;
                      return (
                        <div key={side} className="flex items-center justify-between py-0.5">
                          <span className={`text-[13px] ${won ? 'font-bold text-emerald-300' : b.winnerId ? 'text-white/30 line-through' : 'text-white/80'}`}>
                            {names[side]}{uid === myId ? ' (you)' : ''}
                          </span>
                          {b.scores && <span className="text-[12px] font-mono text-white/40">{b.scores[uid] ?? 0}</span>}
                        </div>
                      );
                    })}
                    <div className="flex items-center gap-2 mt-1">
                      {b.state === 'playing' && <span className="text-[10px] text-blue-300 font-semibold uppercase tracking-wide">Live</span>}
                      {b.state === 'finished' && <span className="text-[10px] text-white/30 uppercase tracking-wide">Done</span>}
                      {b.spectatorCount > 0 && <span className="text-[10px] text-white/30">👁 {b.spectatorCount}</span>}
                      {watchable && <span className="text-[10px] text-white/35 ml-auto">Tap to watch →</span>}
                    </div>
                  </button>
                );
              })}
            </div>
          </div>
        ))}
        {err && <p className="text-[12px] text-rose-300">{err}</p>}
      </div>
      {leaveConfirm && (
        <ConfirmModal
          title={tour.state === 'playing' ? 'Leave tournament?' : 'Leave?'}
          body={tour.state === 'playing' ? 'If you have a live match this forfeits it and eliminates you.' : 'You will exit the tournament.'}
          confirmLabel="Leave"
          onCancel={() => setLeaveConfirm(false)}
          onConfirm={handleLeave}
        />
      )}
    </div>
  );
}

// ─────────────────────────── HISTORY ───────────────────────────
function History({ onExit }) {
  const [data, setData] = useState(null);
  const [detail, setDetail] = useState(null);
  const [loadingDetail, setLoadingDetail] = useState(false);

  useEffect(() => {
    apiFetch('/api/debate/history').then(setData).catch(() => setData({ history: [], stats: {} }));
  }, []);

  async function openDetail(finishedAt) {
    setLoadingDetail(true);
    try {
      const r = await apiFetch(`/api/debate/history/${finishedAt}`);
      setDetail(r.entry);
    } catch {} finally { setLoadingDetail(false); }
  }

  if (detail) {
    const v = detail.verdict || {};
    return (
      <div className="flex-1 min-h-0 flex flex-col">
        <DebateHeader title="Debate recap" subtitle={detail.topic} onBack={() => setDetail(null)} />
        <div className="flex-1 min-h-0 overflow-y-auto px-4 pb-6 space-y-3">
          <div className={`rounded-2xl border p-4 ${detail.result === 'win' ? 'border-emerald-400/30 bg-emerald-500/10' : detail.result === 'tie' ? 'border-white/15 bg-white/[0.04]' : 'border-rose-400/30 bg-rose-500/10'}`}>
            <p className="text-[15px] font-bold">{detail.result === 'win' ? 'You won' : detail.result === 'tie' ? 'Tie' : 'You lost'}{detail.forfeit ? ' (forfeit)' : ''}</p>
            <p className="text-[12px] text-white/45 mt-1">You ({sideLabel(detail.mySide)}): {detail.myScore} · {detail.opponent?.name || 'AI'}: {detail.opponentScore}</p>
            {v.summary && <p className="text-[13px] text-white/70 mt-2 whitespace-pre-wrap">{v.summary}</p>}
          </div>
          {(detail.turns || []).map((t, i) => (
            <div key={i} className="rounded-xl border border-white/[0.06] bg-white/[0.02] px-3 py-2.5">
              <p className="text-[10px] uppercase tracking-wider text-white/30 mb-1">{sideLabel(t.side)}{t.score ? ` · ${t.score.total}/30` : ''}{t.timedOut ? ' · auto' : ''}</p>
              <p className="text-[13px] text-white/75 whitespace-pre-wrap">{t.content}</p>
              {t.feedback && <p className="text-[11px] text-blue-300/70 mt-1">{t.feedback}</p>}
            </div>
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className="flex-1 min-h-0 flex flex-col">
      <DebateHeader title="History" onBack={onExit} />
      <div className="flex-1 min-h-0 overflow-y-auto px-4 pb-6 space-y-3">
        {!data && <div className="text-center text-white/40 text-[13px] mt-6 flex items-center justify-center gap-2"><InlineProgress active /> Loading…</div>}
        {data && (
          <>
            <div className="grid grid-cols-3 gap-2">
              <StatCard label="Wins" value={data.stats?.wins || 0} tone="emerald" />
              <StatCard label="Losses" value={data.stats?.losses || 0} tone="rose" />
              <StatCard label="Ties" value={data.stats?.ties || 0} tone="white" />
            </div>
            {(!data.history || data.history.length === 0) && (
              <p className="text-center text-white/30 text-[13px] mt-8">No debates yet. Go win one.</p>
            )}
            {(data.history || []).map((h, i) => (
              <button key={i} onClick={() => openDetail(h.finishedAt)} disabled={loadingDetail}
                className="w-full rounded-xl border border-white/[0.06] bg-white/[0.02] px-3 py-3 text-left active:bg-white/[0.05]">
                <div className="flex items-center gap-2">
                  <span className={`w-2 h-2 rounded-full shrink-0 ${h.result === 'win' ? 'bg-emerald-400' : h.result === 'tie' ? 'bg-white/40' : 'bg-rose-400'}`} />
                  <span className="text-[13px] font-medium text-white/85 truncate flex-1">{h.topic}</span>
                  <ChevronRight size={15} className="text-white/20 shrink-0" />
                </div>
                <p className="text-[11px] text-white/35 mt-1 ml-4">
                  {h.mode === 'solo' ? 'vs AI' : h.mode === 'tournament' ? `Tournament${h.tournament?.name ? ` · ${h.tournament.name}` : ''}` : `vs ${h.opponent?.name || 'Opponent'}`}
                  {' · '}{h.myScore}–{h.opponentScore}{h.timedMode ? ' · timed' : ''}
                </p>
              </button>
            ))}
          </>
        )}
      </div>
    </div>
  );
}

// ─────────────────────────── SHARED UI ───────────────────────────
function DebateHeader({ title, subtitle, onBack, right }) {
  return (
    <div className="shrink-0 flex items-center gap-2 px-3 h-12 border-b border-white/[0.06]">
      <button onClick={onBack} className="w-9 h-9 -ml-1 rounded-full grid place-items-center active:bg-white/[0.06]">
        <ArrowLeft size={18} className="text-white/70" />
      </button>
      <div className="min-w-0 flex-1">
        <p className="text-[14px] font-bold tracking-tight truncate leading-tight">{title}</p>
        {subtitle && <p className="text-[11px] text-white/35 truncate leading-tight">{subtitle}</p>}
      </div>
      {right}
    </div>
  );
}

function SectionLabel({ children }) {
  return <p className="text-[10px] font-bold uppercase tracking-[0.15em] text-white/30 mb-1.5">{children}</p>;
}

function Pill({ active, onClick, children }) {
  return (
    <button onClick={onClick}
      className={`px-3 py-2 rounded-xl text-[12px] font-semibold tracking-tight whitespace-nowrap transition-colors ${active ? 'bg-blue-500/20 text-blue-100 border border-blue-400/50' : 'bg-white/[0.04] border border-white/[0.05] text-white/35 active:bg-blue-500/[0.08]'}`}>
      {children}
    </button>
  );
}

function Toggle({ on, onClick }) {
  return (
    <button onClick={onClick}
      className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${on ? 'bg-blue-500' : 'bg-white/[0.12]'}`}>
      <span className="inline-block transform rounded-full bg-white shadow transition-transform" style={{ height: 18, width: 18, transform: `translateX(${on ? 22 : 3}px)` }} />
    </button>
  );
}

function SideBtn({ active, onClick, label, tone }) {
  const tones = {
    emerald: active ? 'bg-emerald-500/20 border-emerald-400/40 text-emerald-200' : 'bg-white/[0.03] border-white/[0.08] text-white/45',
    rose: active ? 'bg-rose-500/20 border-rose-400/40 text-rose-200' : 'bg-white/[0.03] border-white/[0.08] text-white/45',
    blue: active ? 'bg-blue-500/20 border-blue-400/40 text-blue-100' : 'bg-white/[0.03] border-white/[0.08] text-white/45',
  };
  return (
    <button onClick={onClick} className={`h-12 rounded-2xl border font-bold text-[13px] transition-colors ${tones[tone]}`}>
      {label}
    </button>
  );
}

function Bubble({ msg }) {
  const isUser = msg.role === 'user';
  return (
    <div className={`flex ${isUser ? 'justify-end' : 'justify-start'}`}>
      <div className={`max-w-[82%] rounded-2xl px-3.5 py-2.5 ${isUser ? 'bg-blue-500 text-white' : msg._error ? 'bg-rose-500/15 border border-rose-400/20 text-rose-100' : 'bg-white/[0.06] border border-white/[0.07] text-white/85'}`}>
        <p className="text-[14px] leading-relaxed whitespace-pre-wrap">{msg.content}</p>
        {Array.isArray(msg.sources) && msg.sources.length > 0 && (
          <div className="mt-2 pt-2 border-t border-white/10 space-y-1">
            {msg.sources.slice(0, 3).map((s, i) => (
              <a key={i} href={s.uri || s.url} target="_blank" rel="noreferrer" className="block text-[11px] text-blue-200/70 underline truncate">
                {s.title || s.uri || s.url}
              </a>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

function TypingBubble() {
  return (
    <div className="flex justify-start">
      <div className="rounded-2xl px-4 py-3 bg-white/[0.06] border border-white/[0.07]">
        <div className="flex gap-1">
          {[0, 1, 2].map(i => <span key={i} className="w-1.5 h-1.5 rounded-full bg-white/40 animate-bounce" style={{ animationDelay: `${i * 0.15}s` }} />)}
        </div>
      </div>
    </div>
  );
}

function TurnCard({ turn, mine }) {
  return (
    <div className={`flex ${mine ? 'justify-end' : 'justify-start'}`}>
      <div className={`max-w-[85%] rounded-2xl px-3.5 py-2.5 ${mine ? 'bg-blue-500/90 text-white' : 'bg-white/[0.06] border border-white/[0.07] text-white/85'}`}>
        <div className="flex items-center gap-2 mb-1">
          <span className="text-[10px] uppercase tracking-wider font-bold opacity-70">{sideLabel(turn.side)}</span>
          {turn.score && <span className="text-[10px] font-mono opacity-60">{turn.score.total}/30</span>}
          {turn.timedOut && <span className="text-[10px] opacity-50">⏱ auto</span>}
        </div>
        {turn.content && <p className="text-[14px] leading-relaxed whitespace-pre-wrap">{turn.content}</p>}
        {Array.isArray(turn.images) && turn.images.length > 0 && (
          <div className="flex gap-1.5 flex-wrap mt-2">
            {turn.images.map((im, i) => <img key={i} src={im.dataUrl} alt="" className="h-20 rounded-lg border border-white/10" />)}
          </div>
        )}
        {turn.feedback && (
          <p className={`text-[11px] mt-1.5 pt-1.5 border-t ${mine ? 'border-white/20 text-white/70' : 'border-white/10 text-blue-200/70'}`}>
            {turn.feedback}
          </p>
        )}
      </div>
    </div>
  );
}

function VerdictRow({ label, body, tone = 'white' }) {
  if (!body) return null;
  const colors = {
    white: 'text-white/70', emerald: 'text-emerald-300', rose: 'text-rose-300', blue: 'text-blue-300',
  };
  return (
    <div className="rounded-2xl border border-white/[0.06] bg-white/[0.02] px-3.5 py-3">
      <p className={`text-[10px] uppercase tracking-wider font-bold mb-1 ${colors[tone]}`}>{label}</p>
      <p className="text-[13px] text-white/75 leading-relaxed whitespace-pre-wrap">{body}</p>
    </div>
  );
}

function ScoreCol({ label, score }) {
  return (
    <div className="text-center">
      <p className="text-[10px] uppercase tracking-wider text-white/40 truncate max-w-[80px]">{label}</p>
      <p className="text-[22px] font-bold">{score}</p>
    </div>
  );
}

function StatCard({ label, value, tone }) {
  const colors = { emerald: 'text-emerald-300', rose: 'text-rose-300', white: 'text-white/70' };
  return (
    <div className="rounded-xl border border-white/[0.06] bg-white/[0.02] py-3 text-center">
      <p className={`text-[22px] font-extrabold ${colors[tone]}`}>{value}</p>
      <p className="text-[10px] uppercase tracking-wider text-white/35">{label}</p>
    </div>
  );
}

function ConfirmModal({ title, body, confirmLabel, onConfirm, onCancel, hideCancel }) {
  return (
    <div className="fixed inset-0 z-[2200] grid place-items-center p-6 bg-black/60 backdrop-blur-sm">
      <div className="w-full max-w-xs rounded-3xl border border-white/10 bg-[#13131f] p-5">
        <p className="text-[16px] font-bold mb-1">{title}</p>
        <p className="text-[13px] text-white/50 mb-4">{body}</p>
        <div className="flex gap-2">
          {!hideCancel && (
            <button onClick={onCancel} className="flex-1 h-11 rounded-xl bg-white/[0.06] border border-white/10 font-semibold text-[14px] active:bg-white/[0.1]">Cancel</button>
          )}
          <button onClick={onConfirm} className="flex-1 h-11 rounded-xl bg-rose-500 font-bold text-[14px] active:bg-rose-600">{confirmLabel}</button>
        </div>
      </div>
    </div>
  );
}

function TopicChips({ theme, onPick, exclude = [] }) {
  const [topics, setTopics] = useState(QUICK_TOPICS);
  const [loading, setLoading] = useState(false);
  const load = useCallback(async () => {
    setLoading(true);
    try {
      const r = await apiFetch('/api/debate/suggest-topics', {
        method: 'POST',
        body: JSON.stringify({ theme: theme || '', exclude }),
      });
      if (Array.isArray(r.topics) && r.topics.length) setTopics(r.topics);
    } catch {} finally { setLoading(false); }
  }, [theme]);

  return (
    <div className="mt-2">
      <div className="flex items-center justify-between mb-1.5">
        <p className="text-[10px] font-bold uppercase tracking-[0.15em] text-white/30">Suggestions</p>
        <button onClick={load} disabled={loading} className="text-[11px] text-blue-300/70 flex items-center gap-1 disabled:opacity-40">
          {loading ? <InlineProgress active /> : <RefreshCw size={11} />} New
        </button>
      </div>
      <div className="flex flex-col gap-1.5">
        {topics.map((t, i) => (
          <button key={i} onClick={() => onPick(t)}
            className="text-left rounded-xl bg-white/[0.03] border border-white/[0.06] px-3 py-2 text-[12.5px] text-white/65 active:bg-white/[0.07] flex items-center gap-2">
            <Sparkles size={12} className="text-blue-300/50 shrink-0" />
            <span className="truncate">{t}</span>
          </button>
        ))}
      </div>
    </div>
  );
}
