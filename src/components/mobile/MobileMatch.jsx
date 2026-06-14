import { useState, useEffect, useRef, useCallback } from 'react';
import { Zap, Users, Copy, Check, X, Trophy, Play, LogOut, ArrowLeft, Flag, Bot } from 'lucide-react';
import { useAuth } from '../../context/AuthContext';
import { InlineProgress } from '../shared/ProgressBar';
import { AnswerResultPanel } from '../trial/TrialSession';
import {
  createMatch, joinMatch, startMatch, buzzMatch, answerMatch, nextMatchQuestion,
  endMatch, leaveMatch, streamMatch, botBuzz, botAnswer,
} from '../../api/quizMatch';
import MatchComparison from '../shared/MatchComparison';

// Mirrors the server's QUIZBOWL_BUZZ_ANSWER_MS; only scales the countdown bar.
const BUZZ_WINDOW_MS = 9000;

const BOT_ROSTER = [
  { id: 'biscuit', name: 'Player 2', buzzAt: 0.90, accuracy: 0.40, thinkMs: 3000 },
  { id: 'alex',    name: 'Player 3', buzzAt: 0.80, accuracy: 0.58, thinkMs: 1800 },
  { id: 'sam',     name: 'Player 4', buzzAt: 0.62, accuracy: 0.74, thinkMs: 1100 },
  { id: 'jordan',  name: 'Player 5', buzzAt: 0.50, accuracy: 0.82, thinkMs: 800  },
  { id: 'quinn',   name: 'Player 6', buzzAt: 0.36, accuracy: 0.90, thinkMs: 600  },
  { id: 'morgan',  name: 'Player 7', buzzAt: 0.22, accuracy: 0.94, thinkMs: 350  },
  { id: 'cipher',  name: 'Player 8', buzzAt: 0.12, accuracy: 0.98, thinkMs: 150  },
];
const ROOM_LEVELS = [
  { id: 'casual',  label: 'Casual',  accuracy: 0.52, buzzAt: 0.78, thinkMs: 2300 },
  { id: 'club',    label: 'Club',    accuracy: 0.68, buzzAt: 0.62, thinkMs: 1500 },
  { id: 'varsity', label: 'Varsity', accuracy: 0.78, buzzAt: 0.48, thinkMs: 950  },
  { id: 'elite',   label: 'Elite',   accuracy: 0.88, buzzAt: 0.30, thinkMs: 500  },
];
function scaleRoster(bots, levelId) {
  const m = ROOM_LEVELS.find(l => l.id === levelId) || ROOM_LEVELS[2];
  return bots.map((b, i, arr) => {
    const t = arr.length === 1 ? 0 : (i / (arr.length - 1)) - 0.5;
    return {
      ...b,
      accuracy: Math.max(0.10, Math.min(0.98, m.accuracy + t * 0.12)),
      buzzAt:   Math.max(0.05, Math.min(0.95, m.buzzAt   + t * 0.14)),
      thinkMs:  Math.max(120,  Math.round(m.thinkMs * (1 + t * 0.30))),
    };
  });
}

function useWordReveal(text, startedAt, speedMs, frozen, frozenAt) {
  const [, setTick] = useState(0);
  const lockedIdxRef = useRef(null);

  useEffect(() => {
    if (!frozen) lockedIdxRef.current = null;
  }, [frozen]);

  useEffect(() => {
    if (!text || frozen) return;
    const id = setInterval(() => setTick(t => (t + 1) | 0), 50);
    return () => clearInterval(id);
  }, [text, startedAt, frozen]);

  if (!text) return { revealed: '', wordIndex: 0, totalWords: 0, done: false };
  const words = text.split(/\s+/);
  const start = startedAt || Date.now();

  let idx;
  if (frozen) {
    if (lockedIdxRef.current == null) {
      const pinClock = frozenAt || Date.now();
      const e = Math.max(0, pinClock - start);
      lockedIdxRef.current = Math.min(words.length - 1, Math.floor(e / speedMs));
    }
    idx = lockedIdxRef.current;
  } else {
    const elapsed = Math.max(0, Date.now() - start);
    idx = Math.min(words.length - 1, Math.floor(elapsed / speedMs));
  }

  return {
    revealed: words.slice(0, idx + 1).join(' '),
    wordIndex: idx, totalWords: words.length,
    done: idx >= words.length - 1,
  };
}

export default function MobileMatch() {
  const { user } = useAuth();
  const myId = user?.id;

  const [view, setView] = useState('menu');
  const [code, setCode] = useState('');
  const [joinCodeInput, setJoinCodeInput] = useState('');
  const [category, setCategory] = useState('Mixed');
  const [difficulty, setDifficulty] = useState('Medium');
  const [questionCount, setQuestionCount] = useState(10);
  const [revealSpeedMs, setRevealSpeedMs] = useState(140);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);
  const [copied, setCopied] = useState(false);
  const [match, setMatch] = useState(null);
  const [fillWithBots, setFillWithBots] = useState(false);
  const [botLevel, setBotLevel] = useState('varsity');

  const [question, setQuestion] = useState(null);
  const [buzz, setBuzz] = useState(null);
  const [answer, setAnswer] = useState('');
  const [answerResult, setAnswerResult] = useState(null);
  const [autoAdvanceDeadline, setAutoAdvanceDeadline] = useState(null);
  const [answerDeadline, setAnswerDeadline] = useState(null);
  const [comparison, setComparison] = useState(null);
  const [lockedOut, setLockedOut] = useState([]);
  const [wrongFlash, setWrongFlash] = useState(null);
  const [abandoned, setAbandoned] = useState(null);

  const abortRef = useRef(null);
  const botEngRef = useRef({ bots: [], lockedOut: new Set(), buzzTimers: {}, thinkTimers: {} });
  const isHostRef = useRef(false);
  const speedMsRef = useRef(140);
  const questionRef = useRef(null);

  useEffect(() => { isHostRef.current = match?.hostId === myId; }, [match?.hostId, myId]);
  useEffect(() => { speedMsRef.current = match?.revealSpeedMs || 140; }, [match?.revealSpeedMs]);
  useEffect(() => { questionRef.current = question; }, [question]);

  function clearBotTimers() {
    for (const t of Object.values(botEngRef.current.buzzTimers)) clearTimeout(t);
    for (const t of Object.values(botEngRef.current.thinkTimers)) clearTimeout(t);
    botEngRef.current.buzzTimers = {};
    botEngRef.current.thinkTimers = {};
  }

  useEffect(() => {
    if (!code) return;
    const abort = streamMatch(code, {
      onSnapshot: (m) => {
        setMatch(m);
        if (m.state === 'playing' && m.currentQuestion) {
          setQuestion(m.currentQuestion);
          if (m.buzzWinner) {
            setBuzz({ userId: m.buzzWinner, buzzAt: m.buzzAt });
            setAnswerDeadline((m.buzzAt || Date.now()) + (m.answerWindowMs || BUZZ_WINDOW_MS));
          } else {
            setAnswerDeadline(null);
          }
          setAnswerResult(null);
          setView('playing');
        } else if (m.state === 'generating') {
          setView('generating');
        } else if (m.state === 'waiting') {
          setView('lobby');
        } else if (m.state === 'finished') {
          if (m.comparison) setComparison(m.comparison);
          setView('finished');
        }
      },
      onPlayerJoined: (m) => setMatch(m),
      onPlayerLeft:   (m) => setMatch(m.match || m),
      onGenerating:   (m) => { setMatch(m); setView('generating'); },
      onStartFailed:  (data) => { setError(data.error || 'Failed to start'); setMatch(data.match); setView('lobby'); },
      onQuestionStart: ({ text, startedAt, match: m }) => {
        setMatch(m);
        setQuestion({ text, startedAt });
        setBuzz(null); setAnswer(''); setAnswerResult(null);
        setAutoAdvanceDeadline(null); setAnswerDeadline(null); setLockedOut([]); setWrongFlash(null);
        setView('playing');
        if (isHostRef.current && botEngRef.current.bots.length) {
          clearBotTimers();
          botEngRef.current.lockedOut = new Set();
          const speedMs = speedMsRef.current;
          const totalWords = text.split(/\s+/).filter(Boolean).length || 1;
          const now = Date.now();
          const qStart = startedAt || now;
          for (const bot of botEngRef.current.bots) {
            const buzzMs = qStart + Math.floor(bot.buzzAt * totalWords) * speedMs - now;
            const jitter = (Math.random() - 0.5) * bot.thinkMs * 0.25;
            const delay = Math.max(300, buzzMs + jitter);
            botEngRef.current.buzzTimers[bot.userId] = setTimeout(async () => {
              delete botEngRef.current.buzzTimers[bot.userId];
              if (botEngRef.current.lockedOut.has(bot.userId)) return;
              try { await botBuzz(code, bot.userId); } catch {}
            }, delay);
          }
        }
      },
      onBuzz: ({ userId, buzzAt, answerWindowMs }) => {
        setBuzz({ userId, buzzAt });
        setAnswerDeadline((buzzAt || Date.now()) + (answerWindowMs || BUZZ_WINDOW_MS));
        if (isHostRef.current) {
          for (const t of Object.values(botEngRef.current.buzzTimers)) clearTimeout(t);
          botEngRef.current.buzzTimers = {};
          if (userId?.startsWith('bot:')) {
            const bot = botEngRef.current.bots.find(b => b.userId === userId);
            if (bot) {
              const think = Math.max(200, bot.thinkMs * (0.85 + Math.random() * 0.3));
              botEngRef.current.thinkTimers[userId] = setTimeout(async () => {
                delete botEngRef.current.thinkTimers[userId];
                const correct = Math.random() < bot.accuracy;
                try { await botAnswer(code, userId, correct); } catch {}
              }, think);
            }
          }
        }
      },
      onWrongAnswer: ({ userId, answer: wrongAns, lockedOut: lock, questionStartedAt: newStart, scores, timedOut }) => {
        setBuzz(null); setAnswer(''); setAnswerDeadline(null);
        setLockedOut(lock || []);
        if (newStart && question) setQuestion(q => q ? { ...q, startedAt: newStart } : q);
        setWrongFlash({ userId, answer: wrongAns, timedOut });
        if (scores) setMatch(prev => prev ? { ...prev, players: prev.players.map(p => ({ ...p, score: scores[p.userId] || 0 })) } : prev);
        setTimeout(() => setWrongFlash(null), 1800);
        if (isHostRef.current && botEngRef.current.bots.length) {
          for (const t of Object.values(botEngRef.current.thinkTimers)) clearTimeout(t);
          botEngRef.current.thinkTimers = {};
          botEngRef.current.lockedOut = new Set(lock || []);
          const speedMs = speedMsRef.current;
          const curQ = questionRef.current;
          if (curQ) {
            const totalWords = curQ.text.split(/\s+/).filter(Boolean).length || 1;
            const now = Date.now();
            const qStart = newStart || curQ.startedAt || now;
            for (const bot of botEngRef.current.bots) {
              if (botEngRef.current.lockedOut.has(bot.userId)) continue;
              const buzzMs = qStart + Math.floor(bot.buzzAt * totalWords) * speedMs - now;
              const jitter = (Math.random() - 0.5) * bot.thinkMs * 0.25;
              const delay = Math.max(400, buzzMs + jitter);
              botEngRef.current.buzzTimers[bot.userId] = setTimeout(async () => {
                delete botEngRef.current.buzzTimers[bot.userId];
                if (botEngRef.current.lockedOut.has(bot.userId)) return;
                try { await botBuzz(code, bot.userId); } catch {}
              }, delay);
            }
          }
        }
      },
      onAnswerResult: (data) => {
        setAnswerResult(data);
        setAnswerDeadline(null);
        setAutoAdvanceDeadline(data.autoAdvanceInMs ? Date.now() + data.autoAdvanceInMs : null);
        setMatch(prev => prev ? { ...prev, players: prev.players.map(p => ({ ...p, score: data.scores[p.userId] || 0 })) } : prev);
        if (isHostRef.current) clearBotTimers();
      },
      onMatchEnd: ({ scores, abandoned: wasAbandoned, leftBy, reason, comparison: cmp }) => {
        setMatch(prev => prev ? { ...prev, players: prev.players.map(p => ({ ...p, score: scores[p.userId] || 0 })) } : prev);
        setQuestion(null); setBuzz(null); setAnswer(''); setAnswerResult(null);
        setAutoAdvanceDeadline(null); setAnswerDeadline(null); setWrongFlash(null);
        if (cmp) setComparison(cmp);
        if (wasAbandoned) setAbandoned({ leftBy, reason });
        setView('finished');
        clearBotTimers();
        botEngRef.current.bots = [];
      },
      onError: (err) => setError(err),
    });
    abortRef.current = abort;
    return () => { try { abort(); } catch {} };
  }, [code]);

  async function handleCreate() {
    if (busy) return;
    setBusy(true); setError(null);
    try {
      const res = await createMatch();
      setCode(res.code); setMatch(res.match); setView('lobby');
    } catch (e) { setError(e.message || 'Failed to create'); }
    setBusy(false);
  }

  async function handleJoin() {
    const c = joinCodeInput.trim().toUpperCase();
    if (!c || busy) return;
    setBusy(true); setError(null);
    try {
      const res = await joinMatch(c);
      setCode(c); setMatch(res.match); setView('lobby');
    } catch (e) { setError(e.message || 'Failed to join'); }
    setBusy(false);
  }

  async function handleStart() {
    setError(null);
    const realCount = (match?.players || []).filter(p => !p.isBot).length;
    let bots = [];
    if (fillWithBots && realCount < 8) {
      const botCount = 8 - realCount;
      const scaled = scaleRoster(BOT_ROSTER, botLevel);
      bots = scaled.slice(0, botCount).map(b => ({ id: b.id, name: b.name }));
      botEngRef.current.bots = scaled.slice(0, botCount).map(b => ({
        userId: `bot:${code}:${b.id}`,
        buzzAt: b.buzzAt, accuracy: b.accuracy, thinkMs: b.thinkMs,
      }));
    } else {
      botEngRef.current.bots = [];
    }
    botEngRef.current.lockedOut = new Set();
    botEngRef.current.buzzTimers = {};
    botEngRef.current.thinkTimers = {};
    try { await startMatch(code, { category, difficulty, questionCount, revealSpeedMs, bots }); }
    catch (e) { setError(e.message); }
  }

  const handleBuzz = useCallback(async () => {
    if (!question || buzz) return;
    if (lockedOut.includes(myId)) return;
    setBuzz({ userId: myId || 'me', buzzAt: Date.now(), _optimistic: true });
    setAnswerDeadline(Date.now() + BUZZ_WINDOW_MS);
    try { await buzzMatch(code); } catch { setBuzz(null); setAnswerDeadline(null); }
  }, [question, buzz, code, myId, lockedOut]);

  async function handleSubmitAnswer() {
    if (!answer.trim()) return;
    try { await answerMatch(code, answer.trim()); } catch (e) { setError(e.message); }
  }

  async function handleNext() {
    try { await nextMatchQuestion(code); } catch (e) { setError(e.message); }
  }

  async function handleLeave() {
    try { await leaveMatch(code); } catch {}
    setCode(''); setMatch(null); setQuestion(null); setBuzz(null);
    setAnswerResult(null); setAbandoned(null); setAnswerDeadline(null); setComparison(null);
    setView('menu');
  }

  const iBuzzed = buzz && buzz.userId === myId;
  const isHost = match?.hostId === myId;

  // ── MENU ──
  if (view === 'menu') {
    return (
      <div className="flex-1 min-h-0 flex flex-col bg-[#0a0a14] text-white">
        <div className="shrink-0 flex items-center gap-2 px-3 h-12 border-b border-white/[0.06]">
          <div className="w-9 h-9 rounded-xl grid place-items-center bg-amber-500/15 border border-amber-400/20">
            <Zap size={18} className="text-amber-300" />
          </div>
          <div>
            <h1 className="text-[17px] font-bold tracking-tight leading-none">Head to Head</h1>
            <p className="text-[11px] text-white/35 mt-0.5">Buzz. Answer. Win.</p>
          </div>
        </div>
        <div className="flex-1 min-h-0 overflow-y-auto px-4 pb-6 pt-4 space-y-4">
          <button
            onClick={() => setView('setup')}
            className="w-full h-12 rounded-2xl bg-amber-500 text-black font-bold text-[15px] flex items-center justify-center gap-2 active:bg-amber-600"
          >
            <Zap size={17} /> Create room
          </button>

          <div className="flex items-center gap-2 text-white/20 text-[11px]">
            <div className="flex-1 h-px bg-white/[0.08]" /> OR <div className="flex-1 h-px bg-white/[0.08]" />
          </div>

          <div>
            <p className="text-[10px] font-bold uppercase tracking-[0.15em] text-white/30 mb-1.5">Join with code</p>
            <div className="flex gap-2">
              <input
                value={joinCodeInput}
                onChange={e => setJoinCodeInput(e.target.value.toUpperCase().slice(0, 6))}
                onKeyDown={e => { if (e.key === 'Enter') handleJoin(); }}
                placeholder="CODE"
                className="flex-1 rounded-2xl bg-white/[0.05] border border-white/[0.08] px-4 py-3 text-[16px] font-mono tracking-widest text-white placeholder-white/20 outline-none focus:border-amber-400/40"
              />
              <button
                onClick={handleJoin}
                disabled={busy || joinCodeInput.trim().length < 4}
                className="px-5 rounded-2xl bg-white/[0.08] border border-white/10 font-semibold disabled:opacity-40 active:bg-white/[0.12]"
              >
                {busy ? <InlineProgress active /> : 'Join'}
              </button>
            </div>
          </div>

          {error && <p className="text-[12px] text-rose-300">{error}</p>}
        </div>
      </div>
    );
  }

  // ── SETUP ──
  if (view === 'setup') {
    return (
      <div className="flex-1 min-h-0 flex flex-col bg-[#0a0a14] text-white">
        <MatchHeader title="New Room" onBack={() => setView('menu')} />
        <div className="flex-1 min-h-0 overflow-y-auto px-4 pb-6 space-y-4">
          <div>
            <SectionLabel>Category</SectionLabel>
            <div className="flex flex-wrap gap-1.5">
              {['Science','History','Literature','Geography','Math','Art','Music','Philosophy','Mixed'].map(o => (
                <Chip key={o} active={category === o} onClick={() => setCategory(o)}>{o}</Chip>
              ))}
            </div>
          </div>
          <div>
            <SectionLabel>Difficulty</SectionLabel>
            <div className="flex gap-1.5">
              {['Easy','Medium','Hard','Tournament'].map(o => (
                <Chip key={o} active={difficulty === o} onClick={() => setDifficulty(o)}>{o}</Chip>
              ))}
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="rounded-xl border border-white/[0.08] bg-white/[0.03] p-3">
              <div className="flex items-center justify-between mb-1.5">
                <span className="text-[10px] font-bold uppercase tracking-[0.15em] text-white/30">Questions</span>
                <span className="text-[11px] font-mono font-bold text-amber-300">{questionCount}</span>
              </div>
              <input type="range" min="5" max="20" step="5" value={questionCount}
                onChange={e => setQuestionCount(Number(e.target.value))} className="w-full accent-amber-500" />
            </div>
            <div className="rounded-xl border border-white/[0.08] bg-white/[0.03] p-3">
              <div className="flex items-center justify-between mb-1.5">
                <span className="text-[10px] font-bold uppercase tracking-[0.15em] text-white/30">Speed</span>
                <span className="text-[11px] font-mono font-bold text-amber-300">{revealSpeedMs}ms</span>
              </div>
              <input type="range" min="60" max="300" step="10" value={revealSpeedMs}
                onChange={e => setRevealSpeedMs(Number(e.target.value))} className="w-full accent-amber-500" />
            </div>
          </div>

          <div className={`rounded-2xl border p-3 transition-all ${fillWithBots ? 'border-amber-500/40 bg-amber-500/[0.07]' : 'border-white/[0.08] bg-white/[0.02]'}`}>
            <div className="flex items-center justify-between">
              <span className={`text-[11px] font-bold flex items-center gap-1.5 ${fillWithBots ? 'text-amber-200' : 'text-white/55'}`}>
                <Bot size={13} className={fillWithBots ? 'text-amber-400' : 'text-white/25'} />
                Fill with AI bots
              </span>
              <button
                onClick={() => setFillWithBots(v => !v)}
                className={`relative inline-flex h-5 w-9 items-center rounded-full transition-colors ${fillWithBots ? 'bg-amber-500' : 'bg-white/[0.12]'}`}
              >
                <span className={`inline-block h-3.5 w-3.5 transform rounded-full bg-white shadow transition-transform ${fillWithBots ? 'translate-x-[18px]' : 'translate-x-[2px]'}`} />
              </button>
            </div>
            {fillWithBots && (
              <div className="mt-2.5">
                <p className="text-[9px] font-bold uppercase tracking-[0.15em] text-amber-400/60 mb-1.5">Bot difficulty</p>
                <div className="flex gap-1.5">
                  {ROOM_LEVELS.map(l => (
                    <button key={l.id} onClick={() => setBotLevel(l.id)}
                      className={`flex-1 py-1.5 rounded-lg text-[11px] font-semibold border transition-all ${botLevel === l.id ? 'bg-amber-500/25 text-amber-100 border-amber-400/60' : 'bg-white/[0.03] text-white/45 border-white/[0.08] active:text-white/70'}`}>
                      {l.label}
                    </button>
                  ))}
                </div>
              </div>
            )}
          </div>

          {error && <p className="text-[12px] text-rose-300">{error}</p>}
        </div>
        <div className="px-4 pb-4 pt-2 border-t border-white/[0.06]">
          <button
            onClick={handleCreate}
            disabled={busy}
            className="w-full h-12 rounded-2xl bg-amber-500 text-black font-bold text-[15px] flex items-center justify-center gap-2 disabled:opacity-40 active:bg-amber-600"
          >
            {busy ? <InlineProgress active /> : <Zap size={17} />} Create Room
          </button>
        </div>
      </div>
    );
  }

  // ── LOBBY ──
  if (view === 'lobby') {
    const playerCount = match?.players?.length || 0;
    const waiting = playerCount < 2;
    const maxPlayers = match?.maxPlayers || 8;
    return (
      <div className="flex-1 min-h-0 flex flex-col bg-[#0a0a14] text-white">
        <MatchHeader title="Lobby" onBack={handleLeave} />
        <div className="flex-1 min-h-0 overflow-y-auto px-4 pb-6 space-y-4 pt-4">
          <div className="rounded-2xl border border-white/[0.08] bg-white/[0.03] p-4 text-center">
            <p className="text-[10px] uppercase tracking-widest text-white/35 mb-1">Room code</p>
            <button
              onClick={() => { try { navigator.clipboard.writeText(code); setCopied(true); setTimeout(() => setCopied(false), 1500); } catch {} }}
              className="inline-flex items-center gap-2 text-[28px] font-bold font-mono tracking-[0.2em] text-white"
            >
              {code} {copied ? <Check size={18} className="text-amber-300" /> : <Copy size={16} className="text-white/40" />}
            </button>
          </div>

          <div>
            <SectionLabel>Players ({playerCount}/{maxPlayers})</SectionLabel>
            <div className="space-y-1.5">
              {(match?.players || []).map(p => (
                <div key={p.userId} className="flex items-center gap-2 rounded-xl bg-white/[0.03] border border-white/[0.06] px-3 py-2">
                  <div className={`w-6 h-6 rounded-full grid place-items-center text-[10px] font-bold ${p.isBot ? 'bg-white/[0.06] text-white/30' : 'bg-amber-500/15 text-amber-300'}`}>
                    {p.isBot ? <Bot size={11} /> : (p.name || '?')[0]?.toUpperCase()}
                  </div>
                  <span className="flex-1 text-[13px] text-white/80 truncate">{p.name}</span>
                  {p.isBot && <span className="text-[9px] uppercase tracking-wider text-white/25">bot</span>}
                  {p.userId === match?.hostId && !p.isBot && <span className="text-[9px] text-amber-400/70 font-semibold flex items-center gap-0.5"><Trophy size={9} /> host</span>}
                  {p.userId === myId && <span className="text-[9px] text-white/30">you</span>}
                </div>
              ))}
              {waiting && !fillWithBots && (
                <div className="flex items-center gap-2 text-white/30 text-[12px] italic px-1">
                  <span className="w-1.5 h-1.5 rounded-full bg-amber-400 animate-pulse" />
                  Waiting for at least one more…
                </div>
              )}
            </div>
          </div>

          {isHost && (
            <div className={`rounded-2xl border p-3 ${fillWithBots ? 'border-amber-500/40 bg-amber-500/[0.07]' : 'border-white/[0.08] bg-white/[0.02]'}`}>
              <div className="flex items-center justify-between">
                <span className={`text-[11px] font-bold flex items-center gap-1.5 ${fillWithBots ? 'text-amber-200' : 'text-white/55'}`}>
                  <Bot size={13} className={fillWithBots ? 'text-amber-400' : 'text-white/25'} />
                  Fill empty slots with bots
                </span>
                <button
                  onClick={() => setFillWithBots(v => !v)}
                  className={`relative inline-flex h-5 w-9 items-center rounded-full transition-colors ${fillWithBots ? 'bg-amber-500' : 'bg-white/[0.12]'}`}
                >
                  <span className={`inline-block h-3.5 w-3.5 transform rounded-full bg-white shadow transition-transform ${fillWithBots ? 'translate-x-[18px]' : 'translate-x-[2px]'}`} />
                </button>
              </div>
              {fillWithBots && (
                <div className="mt-2.5">
                  <p className="text-[9px] font-bold uppercase tracking-[0.15em] text-amber-400/60 mb-1.5">Bot difficulty</p>
                  <div className="flex gap-1.5">
                    {ROOM_LEVELS.map(l => (
                      <button key={l.id} onClick={() => setBotLevel(l.id)}
                        className={`flex-1 py-1.5 rounded-lg text-[11px] font-semibold border transition-all ${botLevel === l.id ? 'bg-amber-500/25 text-amber-100 border-amber-400/60' : 'bg-white/[0.03] text-white/45 border-white/[0.08]'}`}>
                        {l.label}
                      </button>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}

          {error && <p className="text-[12px] text-rose-300">{error}</p>}
          {!isHost && <p className="text-center text-[12px] text-white/30 italic">Waiting for host to start…</p>}
        </div>
        {isHost && (
          <div className="px-4 pb-4 pt-2 border-t border-white/[0.06]">
            <button
              onClick={handleStart}
              disabled={waiting && !fillWithBots}
              className="w-full h-12 rounded-2xl bg-amber-500 text-black font-bold text-[15px] flex items-center justify-center gap-2 disabled:opacity-40 active:bg-amber-600"
            >
              <Play size={17} />
              {waiting && !fillWithBots
                ? 'Need at least one more…'
                : `Start · ${playerCount} player${playerCount !== 1 ? 's' : ''}${fillWithBots ? ` + ${Math.max(0, 8 - (match?.players?.filter(p => !p.isBot)?.length || 0))} bots` : ''}`
              }
            </button>
          </div>
        )}
      </div>
    );
  }

  // ── GENERATING ──
  if (view === 'generating') {
    return (
      <div className="flex-1 min-h-0 flex flex-col items-center justify-center bg-[#0a0a14] text-white gap-3">
        <InlineProgress active />
        <p className="text-[13px] text-white/40">Generating questions…</p>
        <p className="text-[11px] text-white/25">{match?.questionCount || questionCount} questions · {match?.category || category}</p>
      </div>
    );
  }

  // ── PLAYING ──
  if (view === 'playing' && match) {
    const frozen = !!buzz || !!answerResult;
    const frozenAt = buzz?.buzzAt || answerResult?.buzzAt || null;
    const players = match.players || [];
    const buzzerName = buzz ? (players.find(p => p.userId === buzz.userId)?.name || 'Opponent') : '';
    const wrongName = wrongFlash ? (players.find(p => p.userId === wrongFlash.userId)?.name || 'Opponent') : '';
    const iAmLocked = lockedOut.includes(myId);

    return (
      <PlayingView
        match={match} question={question} buzz={buzz} answerResult={answerResult}
        answer={answer} setAnswer={setAnswer}
        onBuzz={handleBuzz} onSubmitAnswer={handleSubmitAnswer} onNext={handleNext}
        onLeave={handleLeave} onEndMatch={async () => { try { await endMatch(code); } catch {} }}
        iBuzzed={iBuzzed} isHost={isHost} myId={myId}
        lockedOut={lockedOut} wrongFlash={wrongFlash}
        autoAdvanceDeadline={autoAdvanceDeadline}
        answerDeadline={answerDeadline}
        revealSpeedMs={match.revealSpeedMs || 140}
        frozen={frozen} frozenAt={frozenAt}
        players={players} buzzerName={buzzerName} wrongName={wrongName}
        iAmLocked={iAmLocked}
      />
    );
  }

  // ── FINISHED ──
  if (view === 'finished') {
    const sorted = [...(match?.players || [])].sort((a, b) => (b.score || 0) - (a.score || 0));
    const winner = sorted[0];
    const amIWinner = winner?.userId === myId;
    const opponentAbandoned = !!abandoned && abandoned.leftBy !== myId;
    return (
      <div className="flex-1 min-h-0 flex flex-col bg-[#0a0a14] text-white">
        <MatchHeader title="Match Over" onBack={handleLeave} />
        <div className="flex-1 min-h-0 overflow-y-auto px-4 pb-6 pt-6 space-y-4 text-center">
          <Trophy size={36} className={`mx-auto ${amIWinner && !opponentAbandoned ? 'text-amber-400/70' : 'text-white/20'}`} />
          <p className="text-[18px] font-bold text-white/80">
            {opponentAbandoned ? 'Opponent left' : amIWinner ? 'You won' : winner ? `${winner.name} won` : 'Match over'}
          </p>
          <div className="space-y-1.5">
            {sorted.map((p, i) => (
              <div key={p.userId} className={`flex items-center gap-3 px-4 py-2.5 rounded-2xl border ${i === 0 ? 'bg-white/[0.05] border-white/10' : 'bg-white/[0.02] border-white/[0.04]'}`}>
                <span className="text-[11px] font-bold text-white/30 w-4">#{i + 1}</span>
                <span className="flex-1 text-left text-[13px] font-medium text-white/70">{p.name}{p.userId === myId ? ' (you)' : ''}</span>
                <span className="text-[13px] font-bold tabular-nums text-white/60">{p.score || 0}</span>
              </div>
            ))}
          </div>
          {comparison?.questions?.length > 0 && (
            <div>
              <p className="text-[10px] font-bold uppercase tracking-[0.15em] text-white/30 mb-2 text-left">Compare &amp; contrast</p>
              <MatchComparison comparison={comparison} myUserId={myId} />
            </div>
          )}
          <button onClick={handleLeave}
            className="w-full py-3 rounded-2xl border border-white/[0.06] bg-white/[0.03] text-[13px] font-semibold text-white/50 active:bg-white/[0.07]">
            Back
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="flex-1 min-h-0 flex items-center justify-center bg-[#0a0a14] text-white/30 text-[12px]">
      <InlineProgress active /> Loading…
    </div>
  );
}

function PlayingView({ match, question, buzz, answerResult, answer, setAnswer, onBuzz, onSubmitAnswer, onNext, onLeave, onEndMatch, iBuzzed, isHost, myId, lockedOut, wrongFlash, autoAdvanceDeadline, answerDeadline, revealSpeedMs, frozen, frozenAt, players, buzzerName, wrongName, iAmLocked }) {
  const { revealed, wordIndex, totalWords } = useWordReveal(question?.text || '', question?.startedAt || 0, revealSpeedMs, frozen, frozenAt);
  const [now, setNow] = useState(() => Date.now());

  const countingDown = !!answerDeadline && !!buzz && !answerResult;
  useEffect(() => {
    if (!autoAdvanceDeadline && !countingDown) return;
    const id = setInterval(() => setNow(Date.now()), 100);
    return () => clearInterval(id);
  }, [autoAdvanceDeadline, countingDown, answerDeadline]);

  // Clamp to the window so minor client/server clock skew never shows "10s".
  const answerMsLeft = countingDown ? Math.max(0, Math.min(BUZZ_WINDOW_MS, answerDeadline - now)) : null;
  const answerSecs = answerMsLeft != null ? Math.ceil(answerMsLeft / 1000) : null;
  const answerPct = answerMsLeft != null ? Math.max(0, Math.min(100, (answerMsLeft / BUZZ_WINDOW_MS) * 100)) : 0;
  const answerUrgent = answerMsLeft != null && answerMsLeft <= 3000;
  const timeUp = answerMsLeft === 0;

  return (
    <div className="flex-1 min-h-0 flex flex-col bg-[#0a0a14] text-white">
      {/* Header */}
      <div className="shrink-0 flex items-center gap-2 px-3 h-11 border-b border-white/[0.06]">
        <Zap size={12} className="text-amber-500/70" />
        <span className="text-[11px] font-semibold text-white/40 tabular-nums">
          Q{(match.currentIdx || 0) + 1}/{match.totalQuestions}
        </span>
        <div className="flex-1 flex items-center gap-1.5 justify-center flex-wrap overflow-hidden">
          {players.map(p => (
            <div key={p.userId} className={`flex items-center gap-1 px-1.5 py-0.5 rounded-lg text-[10px] ${p.userId === myId ? 'bg-white/[0.07] text-white/60' : 'bg-white/[0.03] text-white/30'}`}>
              <span className="font-medium truncate max-w-[50px]">{p.name}</span>
              <span className="font-bold tabular-nums">{p.score || 0}</span>
            </div>
          ))}
        </div>
        {isHost && (
          <button onClick={onEndMatch} className="text-rose-400/60 active:text-rose-300">
            <Flag size={13} />
          </button>
        )}
        <button onClick={onLeave} className="text-white/20 active:text-rose-400/60">
          <LogOut size={13} />
        </button>
      </div>

      {/* Question */}
      <div className="flex-1 min-h-0 overflow-y-auto p-4">
        <p className="text-[15px] leading-relaxed text-white/85 font-light">
          {revealed}
          {!frozen && wordIndex < totalWords - 1 && (
            <span className="inline-block w-0.5 h-4 bg-white/30 animate-pulse ml-1 align-middle rounded-sm" />
          )}
        </p>
        {buzz && !answerResult && (
          <p className="text-[11px] text-amber-400/60 mt-3">
            <Zap size={9} className="inline mr-0.5" />
            {iBuzzed ? 'You buzzed' : `${buzzerName} buzzed`}
          </p>
        )}
      </div>

      {/* Action bar */}
      <div className="px-4 py-3 border-t border-white/[0.04] shrink-0 space-y-2">
        {wrongFlash && !buzz && !answerResult && (
          <div className="px-3 py-1.5 rounded-2xl bg-rose-500/[0.08] border border-rose-500/15 text-[11px] text-rose-400/70 text-center">
            {wrongFlash.userId === myId ? 'Wrong' : `${wrongName} was wrong`}
            {wrongFlash.timedOut ? ' — ran out of time' : wrongFlash.answer ? ` — "${wrongFlash.answer}"` : ''} · continues
          </div>
        )}
        {!buzz && !answerResult && !iAmLocked && (
          <button onClick={onBuzz}
            className="w-full py-5 rounded-2xl bg-blue-600 active:bg-blue-500 text-white text-[16px] font-bold uppercase tracking-[0.15em]">
            BUZZ
          </button>
        )}
        {!buzz && !answerResult && iAmLocked && (
          <div className="w-full py-3 rounded-2xl border border-white/[0.05] bg-white/[0.02] text-center text-[11px] text-white/25">
            Locked out — wait for next question
          </div>
        )}
        {buzz && !answerResult && iBuzzed && (
          <div className="space-y-1.5">
            <div className="flex items-center justify-between">
              <span className={`text-[11px] font-medium ${answerUrgent ? 'text-rose-300' : 'text-white/45'}`}>
                {timeUp ? "Time's up" : 'Answer before the timer runs out'}
              </span>
              <span className={`text-[14px] font-bold tabular-nums ${answerUrgent ? 'text-rose-300' : 'text-white/70'}`}>{answerSecs ?? 0}s</span>
            </div>
            <div className="h-1.5 rounded-full bg-white/[0.06] overflow-hidden">
              <div className={`h-full transition-all duration-100 ${answerUrgent ? 'bg-rose-500' : 'bg-amber-400'}`} style={{ width: `${answerPct}%` }} />
            </div>
            <div className="flex gap-2">
              <input
                autoFocus value={answer} onChange={e => setAnswer(e.target.value)}
                onKeyDown={e => e.key === 'Enter' && answer.trim() && !timeUp && onSubmitAnswer()}
                placeholder={timeUp ? "Time's up…" : 'Answer…'}
                disabled={timeUp}
                className="flex-1 px-4 py-3 rounded-2xl border border-white/[0.08] bg-white/[0.04] text-[14px] text-white/85 placeholder-white/20 outline-none focus:border-white/15 disabled:opacity-50"
              />
              <button onClick={onSubmitAnswer} disabled={!answer.trim() || timeUp}
                className="px-5 py-3 rounded-2xl bg-white/[0.07] active:bg-white/[0.11] border border-white/[0.08] text-white/60 text-[13px] font-semibold disabled:opacity-30">
                →
              </button>
            </div>
          </div>
        )}
        {buzz && !answerResult && !iBuzzed && (
          <div className="w-full py-3 rounded-2xl border border-white/[0.05] bg-white/[0.02] text-center text-[11px] text-white/30 flex items-center justify-center gap-2">
            <span className="relative flex h-2 w-2">
              <span className="absolute inline-flex h-full w-full rounded-full bg-amber-400/50 animate-ping" />
              <span className="relative inline-flex rounded-full h-2 w-2 bg-amber-500/50" />
            </span>
            {buzzerName} is answering
            {answerSecs != null && (
              <span className={`font-bold tabular-nums ${answerUrgent ? 'text-rose-300' : 'text-white/55'}`}>{answerSecs}s</span>
            )}
          </div>
        )}
        {answerResult && (
          <>
            <AnswerResultPanel
              correct={answerResult.correct ? true : (answerResult.timeout || !answerResult.userId) ? null : false}
              officialAnswer={answerResult.correctAnswer}
              meta={answerResult.correct
                ? (answerResult.userId === myId ? 'Correct!' : `${buzzerName} got it`)
                : (answerResult.timeout || !answerResult.userId) ? 'No one got it'
                : (answerResult.userId === myId ? 'Wrong!' : `${buzzerName} was wrong`)}
            />
            {autoAdvanceDeadline ? (
              <div className="space-y-1.5">
                <div className="flex items-center justify-between text-[11px] text-white/30">
                  <span>Next in <strong className="text-white/50 tabular-nums">{Math.max(0, Math.ceil((autoAdvanceDeadline - now) / 1000))}s</strong></span>
                  {isHost && <button onClick={onNext} className="text-white/40 active:text-white/60 font-medium">Skip →</button>}
                </div>
                <div className="h-0.5 rounded-full bg-white/[0.06] overflow-hidden">
                  <div className="h-full bg-white/25 transition-all duration-100" style={{ width: `${Math.max(0, Math.min(100, ((autoAdvanceDeadline - now) / 5000) * 100))}%` }} />
                </div>
              </div>
            ) : (
              isHost
                ? <button onClick={onNext} className="w-full py-2.5 rounded-2xl border border-white/[0.06] bg-white/[0.03] text-[12px] font-semibold text-white/50 active:text-white/70">Next →</button>
                : <p className="text-[11px] text-center text-white/25">Waiting for host…</p>
            )}
          </>
        )}
      </div>
    </div>
  );
}

function MatchHeader({ title, onBack }) {
  return (
    <div className="shrink-0 flex items-center gap-2 px-3 h-12 border-b border-white/[0.06] bg-[#0a0a14]">
      <button onClick={onBack} className="w-9 h-9 -ml-1 rounded-full grid place-items-center active:bg-white/[0.06]">
        <ArrowLeft size={18} className="text-white/70" />
      </button>
      <p className="text-[14px] font-bold tracking-tight truncate">{title}</p>
    </div>
  );
}

function SectionLabel({ children }) {
  return <p className="text-[10px] font-bold uppercase tracking-[0.15em] text-white/30 mb-1.5">{children}</p>;
}

function Chip({ active, onClick, children }) {
  return (
    <button onClick={onClick}
      className={`px-3 py-1.5 rounded-xl text-[12px] font-semibold whitespace-nowrap transition-colors ${active ? 'bg-amber-500/20 text-amber-100 border border-amber-500/50' : 'bg-white/[0.04] border border-white/[0.06] text-white/45 active:bg-white/[0.08]'}`}>
      {children}
    </button>
  );
}
