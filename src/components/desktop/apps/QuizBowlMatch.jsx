import { useState, useEffect, useRef, useCallback } from 'react';
import { Zap, Users, Copy, Check, X, Trophy, Play, LogOut, ArrowLeft, Flag, Bot } from 'lucide-react';
import ProgressBar, { InlineProgress } from '../../shared/ProgressBar';
import {
  createMatch, joinMatch, startMatch, buzzMatch, answerMatch, nextMatchQuestion,
  endMatch, leaveMatch, streamMatch, botBuzz, botAnswer,
} from '../../../api/quizMatch';

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

// Shared preset storage (same key as AILobbyView so presets are unified).
const QB_PRESETS_KEY = 'qb-bot-presets-v1';
function loadBotPresets() {
  try { return JSON.parse(localStorage.getItem(QB_PRESETS_KEY)) || []; } catch { return []; }
}
function saveBotPresets(list) {
  try { localStorage.setItem(QB_PRESETS_KEY, JSON.stringify(list)); } catch {}
}

// Scoring formats available for multiplayer matches. Mirrors server defs.
// IAC values follow the official IAC Bee Rules (prelim & playoff PDFs).
const QB_SCORING_FORMATS = [
  { id: 'standard',    label: 'Standard',    desc: 'Continuous · earlier = more' },
  { id: 'iac-prelim',  label: 'IAC Prelim',  desc: '1 pt · race to 8' },
  { id: 'iac-playoff', label: 'IAC Playoff', desc: '6/5/4/3 · −2 / −1 neg' },
  { id: 'jv',          label: 'JV',          desc: '10 get · no power · no neg' },
];

function useWordReveal(text, startedAt, speedMs, frozen, frozenAt) {
  const [, setTick] = useState(0);
  const frozenRef = useRef(frozen);
  const frozenAtRef = useRef(frozenAt);
  const lockedIdxRef = useRef(null);

  useEffect(() => {
    frozenRef.current = frozen;
    frozenAtRef.current = frozenAt;
    if (!frozen) lockedIdxRef.current = null;
  }, [frozen, frozenAt]);

  useEffect(() => {
    if (!text) return;
    const id = setInterval(() => {
      if (frozenRef.current) return;
      setTick(t => (t + 1) | 0);
    }, 50);
    return () => clearInterval(id);
  }, [text, startedAt]);

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

export default function QuizBowlMatch({ user, onExit }) {
  const [view, setView] = useState('menu');
  const [code, setCode] = useState('');
  const [joinCodeInput, setJoinCodeInput] = useState('');
  const [category, setCategory] = useState('Mixed');
  const [difficulty, setDifficulty] = useState('Medium');
  const [questionCount, setQuestionCount] = useState(10);
  const [revealSpeedMs, setRevealSpeedMs] = useState(140);
  const [scoringFormat, setScoringFormat] = useState('standard');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);
  const [copied, setCopied] = useState(false);
  const [match, setMatch] = useState(null);

  const [question, setQuestion] = useState(null);
  const [buzz, setBuzz] = useState(null);
  const [answer, setAnswer] = useState('');
  const [answerResult, setAnswerResult] = useState(null);
  const [autoAdvanceDeadline, setAutoAdvanceDeadline] = useState(null);
  const [lockedOut, setLockedOut] = useState([]);
  const [wrongFlash, setWrongFlash] = useState(null);
  const [abandoned, setAbandoned] = useState(null);
  const [fillWithBots, setFillWithBots] = useState(false);
  const [botLevel, setBotLevel] = useState('varsity');
  const [presets, setPresets] = useState(() => loadBotPresets());
  const [savingPreset, setSavingPreset] = useState(false);
  const [presetName, setPresetName] = useState('');
  const [activeBotPresetId, setActiveBotPresetId] = useState(null);

  const abortRef = useRef(null);
  const myId = user?.id;

  // Bot engine - mutable refs, no rerenders needed.
  const botEngRef = useRef({ bots: [], lockedOut: new Set(), buzzTimers: {}, thinkTimers: {} });
  const isHostRef = useRef(false);
  const speedMsRef = useRef(140);
  const questionRef = useRef(null);

  // Keep refs in sync for use inside SSE handler closures.
  useEffect(() => { isHostRef.current = match?.hostId === myId; }, [match?.hostId, myId]);
  useEffect(() => { speedMsRef.current = match?.revealSpeedMs || 140; }, [match?.revealSpeedMs]);
  useEffect(() => { questionRef.current = question; }, [question]);

  function clearBotTimers() {
    for (const t of Object.values(botEngRef.current.buzzTimers)) clearTimeout(t);
    for (const t of Object.values(botEngRef.current.thinkTimers)) clearTimeout(t);
    botEngRef.current.buzzTimers = {};
    botEngRef.current.thinkTimers = {};
  }

  function handleSaveBotPreset() {
    const name = presetName.trim() || `Preset ${presets.length + 1}`;
    const p = { id: Date.now().toString(), name, lobbyType: 'multiplayer', roomLevel: botLevel };
    const next = [p, ...presets].slice(0, 12);
    setPresets(next);
    saveBotPresets(next);
    setPresetName('');
    setSavingPreset(false);
  }
  function handleLoadBotPreset(p) {
    if (p.roomLevel) setBotLevel(p.roomLevel);
    setFillWithBots(true);
    setActiveBotPresetId(p.id);
  }
  function handleDeleteBotPreset(id) {
    const next = presets.filter(p => p.id !== id);
    setPresets(next);
    saveBotPresets(next);
    if (activeBotPresetId === id) setActiveBotPresetId(null);
  }

  useEffect(() => {
    if (!code) return;
    const abort = streamMatch(code, {
      onSnapshot: (m) => {
        setMatch(m);
        if (m.state === 'playing' && m.currentQuestion) {
          setQuestion(m.currentQuestion);
          if (m.buzzWinner) setBuzz({ userId: m.buzzWinner, buzzAt: m.buzzAt });
          setAnswerResult(null);
          setView('playing');
        } else if (m.state === 'generating') {
          setView('generating');
        } else if (m.state === 'waiting') {
          setView('lobby');
        } else if (m.state === 'finished') {
          setView('finished');
        }
      },
      onPlayerJoined: (m) => setMatch(m),
      onPlayerLeft:   (m) => setMatch(m.match || m),
      onGenerating:   (m) => { setMatch(m); setView('generating'); },
      onStartFailed:  (data) => { setError(data.error || 'Failed to start match'); setMatch(data.match); setView('lobby'); },
      onQuestionStart: ({ text, startedAt, match: m }) => {
        setMatch(m);
        setQuestion({ text, startedAt });
        setBuzz(null);
        setAnswer('');
        setAnswerResult(null);
        setAutoAdvanceDeadline(null);
        setLockedOut([]);
        setWrongFlash(null);
        setView('playing');
        // Bot engine: schedule buzz timers for this question (host only).
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
      onBuzz: ({ userId, buzzAt }) => {
        setBuzz({ userId, buzzAt });
        if (isHostRef.current) {
          // Cancel remaining buzz timers; if a bot buzzed, schedule its answer.
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
      onWrongAnswer: ({ userId, answer: wrongAns, lockedOut: lock, questionStartedAt: newStart, scores }) => {
        setBuzz(null);
        setAnswer('');
        setLockedOut(lock || []);
        if (newStart && question) setQuestion(q => q ? { ...q, startedAt: newStart } : q);
        setWrongFlash({ userId, answer: wrongAns });
        if (scores) setMatch(prev => prev ? { ...prev, players: prev.players.map(p => ({ ...p, score: scores[p.userId] || 0 })) } : prev);
        setTimeout(() => setWrongFlash(null), 1800);
        // Bot engine: re-schedule non-locked bots after the question resumes.
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
        setAutoAdvanceDeadline(data.autoAdvanceInMs ? Date.now() + data.autoAdvanceInMs : null);
        setMatch(prev => prev ? { ...prev, players: prev.players.map(p => ({ ...p, score: data.scores[p.userId] || 0 })) } : prev);
        if (isHostRef.current) clearBotTimers();
      },
      onMatchEnd: ({ scores, abandoned: wasAbandoned, leftBy, reason }) => {
        setMatch(prev => prev ? { ...prev, players: prev.players.map(p => ({ ...p, score: scores[p.userId] || 0 })) } : prev);
        setQuestion(null); setBuzz(null); setAnswer(''); setAnswerResult(null);
        setAutoAdvanceDeadline(null); setWrongFlash(null);
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
      setCode(res.code);
      setMatch(res.match);
      setView('lobby');
    } catch (e) { setError(e.message || 'Failed to create match'); }
    setBusy(false);
  }

  async function handleJoin() {
    const c = joinCodeInput.trim().toUpperCase();
    if (!c || busy) return;
    setBusy(true); setError(null);
    try {
      const res = await joinMatch(c);
      setCode(c);
      setMatch(res.match);
      setView('lobby');
    } catch (e) { setError(e.message || 'Failed to join'); }
    setBusy(false);
  }

  async function handleStart() {
    setError(null);
    // Build bot config: fill empty slots up to 8. Always send bots[] so the
    // server clears any leftover bots from a previous (failed) start attempt.
    const realCount = (match?.players || []).filter(p => !p.isBot).length;
    let bots = [];
    if (fillWithBots && realCount < 8) {
      const botCount = 8 - realCount;
      const scaled = scaleRoster(BOT_ROSTER, botLevel);
      bots = scaled.slice(0, botCount).map(b => ({ id: b.id, name: b.name }));
      // Prime the engine so the first onQuestionStart can schedule timers.
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
    try { await startMatch(code, { category, difficulty, questionCount, revealSpeedMs, scoringFormat, bots }); }
    catch (e) { setError(e.message); }
  }

  async function handleEndMatch() {
    if (!confirm('End the match now? Final scores will be locked in.')) return;
    try { await endMatch(code); } catch (e) { setError(e.message); }
  }

  const handleBuzz = useCallback(async () => {
    if (!question || buzz) return;
    if (lockedOut.includes(myId)) return;
    setBuzz({ userId: user?.id || 'me', buzzAt: Date.now(), _optimistic: true });
    try { await buzzMatch(code); } catch {}
  }, [question, buzz, code, user?.id, lockedOut, myId]);

  async function handleSubmitAnswer() {
    if (!answer.trim()) return;
    try { await answerMatch(code, answer.trim()); } catch (e) { setError(e.message); }
  }

  async function handleNext() {
    try { await nextMatchQuestion(code); } catch (e) { setError(e.message); }
  }

  async function handleLeave() {
    try { await leaveMatch(code); } catch {}
    setCode(''); setMatch(null); setQuestion(null); setBuzz(null); setAnswerResult(null);
    setAbandoned(null);
    setView('menu');
    onExit?.();
  }

  useEffect(() => {
    if (view !== 'playing') return;
    function onKey(e) {
      if (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA') return;
      if (e.key === ' ' && !buzz) { e.preventDefault(); handleBuzz(); }
    }
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [view, buzz, handleBuzz]);

  const iBuzzed = buzz && buzz.userId === myId;
  const isHost = match?.hostId === myId;

  // ============ MENU ============
  if (view === 'menu') {
    return (
      <div className="h-full overflow-y-auto bg-transparent">
        <div className="p-6 md:p-10 max-w-md md:max-w-2xl mx-auto">
          <button onClick={onExit} className="text-xs text-blue-300/60 hover:text-blue-200 mb-3 inline-flex items-center gap-1 transition-colors">
            <ArrowLeft size={12} /> Back
          </button>
          <h2 className="text-base font-bold text-gray-900 dark:text-white mb-3">Match</h2>

          <button
            onClick={() => setView('pre-setup')}
            disabled={busy}
            className="w-full py-3 mb-4 rounded-xl bg-blue-500 text-white text-sm font-semibold border border-blue-400/40 hover:bg-blue-400 disabled:opacity-40 disabled:shadow-none flex items-center justify-center gap-2 transition-all"
          >
            <Zap size={14} />
            Create new
          </button>

          <div className="flex items-center gap-2 my-3">
            <div className="flex-1 border-t border-blue-500/20" />
            <span className="text-[10px] uppercase tracking-wider text-blue-400/70">or join</span>
            <div className="flex-1 border-t border-blue-500/20" />
          </div>

          <div className="flex gap-2">
            <input
              value={joinCodeInput}
              onChange={e => setJoinCodeInput(e.target.value.toUpperCase().slice(0, 6))}
              onKeyDown={e => { if (e.key === 'Enter') handleJoin(); }}
              placeholder="CODE"
              className="flex-1 px-3 py-2.5 rounded-xl border border-blue-500/30 bg-white/50 dark:bg-white/[0.06] text-sm font-mono uppercase tracking-widest text-gray-900 dark:text-white placeholder-gray-400 outline-none focus:ring-2 focus:ring-blue-500/40 focus:border-blue-500/60"
            />
            <button
              onClick={handleJoin}
              disabled={busy || joinCodeInput.trim().length < 4}
              className="px-5 py-2.5 rounded-xl bg-blue-500 text-white text-sm font-semibold border border-blue-400/40 hover:bg-blue-400 disabled:opacity-40 disabled:shadow-none transition-all"
            >
              Join
            </button>
          </div>

          {error && <p className="mt-3 text-xs text-rose-300 bg-rose-500/10 border border-rose-500/25 rounded-lg px-3 py-2">{error}</p>}
        </div>
      </div>
    );
  }

  // ============ PRE-SETUP ============
  if (view === 'pre-setup') {
    return (
      <div className="h-full overflow-y-auto bg-transparent">
        <div className="p-5 pb-8 space-y-3 max-w-md md:max-w-2xl mx-auto">
          <button onClick={() => setView('menu')} className="text-xs text-blue-300/60 hover:text-blue-200 mb-1 inline-flex items-center gap-1 transition-colors">
            <ArrowLeft size={12} /> Back
          </button>

          <p className="text-[10px] font-bold uppercase tracking-[0.15em] text-blue-400/70">Category</p>
          <MatchSelector value={category} onChange={setCategory}
            options={['Science','History','Literature','Geography','Math','Art','Music','Philosophy','Pop Culture','Mixed']} />

          <p className="text-[10px] font-bold uppercase tracking-[0.15em] text-blue-400/70 mt-1">Difficulty</p>
          <MatchSelector value={difficulty} onChange={setDifficulty}
            options={['Easy','Medium','Hard','Tournament']} grid="grid-cols-4" />

          <p className="text-[10px] font-bold uppercase tracking-[0.15em] text-blue-400/70 mt-1">Scoring Format</p>
          <div className="grid grid-cols-2 gap-1.5">
            {QB_SCORING_FORMATS.map(f => (
              <button key={f.id} onClick={() => setScoringFormat(f.id)}
                className={`px-2.5 py-1.5 rounded-md text-left transition-colors border ${
                  scoringFormat === f.id
                    ? 'bg-blue-500/20 text-blue-100 border-blue-500/50'
                    : 'bg-blue-500/[0.06] border-blue-500/20 text-blue-300/75 hover:bg-blue-500/15 hover:text-blue-200'
                }`}>
                <div className="text-[11px] font-semibold leading-tight">{f.label}</div>
                <div className="text-[9px] opacity-70 leading-tight mt-0.5">{f.desc}</div>
              </button>
            ))}
          </div>

          <div className="grid grid-cols-2 gap-2 mt-1">
            <div className="rounded-xl border border-blue-500/20 bg-blue-500/[0.04] p-3">
              <div className="flex items-center justify-between mb-1.5">
                <span className="text-[10px] font-bold uppercase tracking-[0.15em] text-blue-400/70">Questions</span>
                <span className="text-[11px] font-mono font-bold tabular-nums text-blue-100">{questionCount}</span>
              </div>
              <input type="range" min="5" max="20" step="5" value={questionCount}
                onChange={e => setQuestionCount(Number(e.target.value))} className="w-full accent-blue-500" />
            </div>
            <div className="rounded-xl border border-blue-500/20 bg-blue-500/[0.04] p-3">
              <div className="flex items-center justify-between mb-1.5">
                <span className="text-[10px] font-bold uppercase tracking-[0.15em] text-blue-400/70">Speed</span>
                <span className="text-[11px] font-mono font-bold tabular-nums text-blue-100">{revealSpeedMs}ms</span>
              </div>
              <input type="range" min="60" max="300" step="10" value={revealSpeedMs}
                onChange={e => setRevealSpeedMs(Number(e.target.value))} className="w-full accent-blue-500" />
            </div>
          </div>

          {/* Fill with AI bots */}
          <div className={`rounded-2xl border p-3 transition-all ${fillWithBots ? 'border-blue-500/40 bg-blue-500/[0.07]' : 'border-white/[0.08] bg-white/[0.02]'}`}>
            <div className="flex items-center justify-between">
              <span className={`text-[11px] font-bold flex items-center gap-1.5 ${fillWithBots ? 'text-blue-200' : 'text-white/55'}`}>
                <Bot size={13} className={fillWithBots ? 'text-blue-400' : 'text-white/25'} />
                Fill with AI bots
                <span className={`text-[9px] font-normal ${fillWithBots ? 'text-blue-300/60' : 'text-white/25'}`}>8-player lobby</span>
              </span>
              <button
                onClick={() => setFillWithBots(v => !v)}
                className={`relative inline-flex h-5 w-9 items-center rounded-full transition-colors ${fillWithBots ? 'bg-blue-500' : 'bg-white/[0.12]'}`}
              >
                <span className={`inline-block h-3.5 w-3.5 transform rounded-full bg-white shadow transition-transform ${fillWithBots ? 'translate-x-[18px]' : 'translate-x-[2px]'}`} />
              </button>
            </div>
            {fillWithBots && (
              <div className="mt-2.5 space-y-2.5">
                <div>
                  <p className="text-[9px] font-bold uppercase tracking-[0.15em] text-blue-400/60 mb-1.5">Bot difficulty</p>
                  <div className="grid grid-cols-4 gap-1">
                    {ROOM_LEVELS.map(l => (
                      <button key={l.id} onClick={() => { setBotLevel(l.id); setActiveBotPresetId(null); }}
                        className={`py-1.5 rounded-lg text-[11px] font-semibold border transition-all ${botLevel === l.id ? 'bg-blue-500/25 text-blue-100 border-blue-400/60' : 'bg-white/[0.03] text-white/45 border-white/[0.08] hover:text-white/70 hover:border-white/[0.15]'}`}>
                        {l.label}
                      </button>
                    ))}
                  </div>
                </div>

                {/* Presets */}
                <div className="border-t border-white/[0.06] pt-2.5">
                  <div className="flex items-center justify-between mb-1.5">
                    <span className="text-[9px] font-bold uppercase tracking-[0.15em] text-blue-400/60">Presets</span>
                    {!savingPreset && (
                      <button onClick={() => setSavingPreset(true)}
                        className="text-[9px] text-white/35 hover:text-white/65 transition-colors px-2 py-0.5 rounded border border-white/[0.08] hover:border-white/[0.18]">
                        Save current
                      </button>
                    )}
                  </div>
                  {savingPreset && (
                    <div className="flex gap-1.5 mb-1.5">
                      <input
                        autoFocus
                        value={presetName}
                        onChange={e => setPresetName(e.target.value)}
                        onKeyDown={e => { if (e.key === 'Enter') handleSaveBotPreset(); if (e.key === 'Escape') setSavingPreset(false); }}
                        placeholder="Preset name…"
                        className="flex-1 px-2 py-1 rounded-lg border border-white/[0.10] bg-white/[0.05] text-[10px] text-white/80 placeholder-white/25 outline-none focus:border-blue-400/40 transition-colors"
                      />
                      <button onClick={handleSaveBotPreset} className="px-2 py-1 rounded-lg bg-blue-500/20 text-[10px] text-blue-200 font-semibold border border-blue-400/30 hover:bg-blue-500/30 transition-colors">Save</button>
                      <button onClick={() => setSavingPreset(false)} className="text-white/30 hover:text-white/60 transition-colors px-1"><X size={11} /></button>
                    </div>
                  )}
                  {presets.length === 0 && !savingPreset && (
                    <p className="text-[9px] text-white/20 text-center py-1">No saved presets yet</p>
                  )}
                  {presets.length > 0 && (
                    <div className="space-y-1 max-h-28 overflow-y-auto">
                      {presets.map(p => {
                        const active = activeBotPresetId === p.id;
                        return (
                          <div key={p.id} className={`flex items-center gap-1.5 px-2 py-1 rounded-lg border transition-colors group ${active ? 'bg-blue-500/[0.10] border-blue-400/40' : 'bg-white/[0.02] border-white/[0.05] hover:border-white/[0.10]'}`}>
                            <div className="flex-1 min-w-0">
                              <span className={`text-[10px] font-medium truncate block ${active ? 'text-blue-100' : 'text-white/65'}`}>{p.name}</span>
                              <span className={`text-[8px] capitalize ${active ? 'text-blue-300/50' : 'text-white/25'}`}>{p.roomLevel || 'varsity'} bots</span>
                            </div>
                            {active
                              ? <span className="text-[9px] text-blue-300 font-semibold flex items-center gap-0.5"><Check size={10} /> Active</span>
                              : <button onClick={() => handleLoadBotPreset(p)} className="text-[9px] text-white/35 hover:text-blue-300 px-1.5 py-0.5 rounded border border-white/[0.08] hover:border-blue-400/30 transition-colors">Load</button>
                            }
                            <button onClick={() => handleDeleteBotPreset(p.id)} className="text-white/15 hover:text-rose-400/70 transition-colors opacity-0 group-hover:opacity-100 pl-0.5"><X size={10} /></button>
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>
              </div>
            )}
          </div>

          {error && <p className="text-xs text-rose-300 bg-rose-500/10 border border-rose-500/25 rounded-lg px-3 py-2">{error}</p>}

          <button
            onClick={handleCreate}
            disabled={busy}
            className="w-full py-3 rounded-xl bg-blue-500 text-white text-sm font-semibold border border-blue-400/40 hover:bg-blue-400 disabled:opacity-40 flex items-center justify-center gap-2 transition-all mt-1"
          >
            {busy ? <InlineProgress active /> : <Zap size={14} />}
            Create Room
          </button>
        </div>
      </div>
    );
  }

  // ============ LOBBY ============
  if (view === 'lobby') {
    const playerCount = match?.players?.length || 0;
    const waiting = playerCount < 2;
    const maxPlayers = match?.maxPlayers || 8;
    const lobbyFull = playerCount >= maxPlayers;
    function copyCode() {
      if (!code) return;
      try { navigator.clipboard.writeText(code); setCopied(true); setTimeout(() => setCopied(false), 1500); } catch {}
    }
    return (
      <div className="h-full overflow-y-auto bg-transparent">
        <div className="p-6 md:p-10 max-w-md md:max-w-2xl mx-auto">
          <p className="text-[11px] uppercase tracking-[0.18em] text-blue-400/70 mb-1.5">Match code</p>
          <button
            onClick={copyCode}
            title="Copy"
            className="w-full font-mono text-3xl font-black tabular-nums tracking-[0.2em] text-gray-900 dark:text-white bg-white/[0.10] dark:bg-white/[0.06] border border-blue-500/40 dark:border-blue-500/30 rounded-xl py-4 mb-3 hover:border-blue-500/60 hover:bg-white/[0.18] dark:hover:bg-white/[0.10] transition-colors inline-flex items-center justify-center gap-3"
          >
            {code}
            {copied ? <Check size={18} className="text-blue-400" /> : <Copy size={16} className="text-blue-400/70" />}
          </button>
          <p className="text-[11px] text-blue-300/50 text-center mb-5">
            {waiting
              ? 'Share with up to ' + (maxPlayers - 1) + ' more players'
              : lobbyFull
                ? `Lobby full · ${playerCount}/${maxPlayers}`
                : `${playerCount}/${maxPlayers} in - share to add more`}
          </p>

          <div className="bg-white/[0.07] dark:bg-white/[0.04] border border-blue-500/[0.12] rounded-xl p-3 mb-5">
            <p className="text-[10px] font-bold uppercase tracking-[0.15em] text-blue-400/70 mb-2">
              Players <span className="text-blue-300/40">({playerCount}/{maxPlayers})</span>
            </p>
            <div className="space-y-1.5">
              {(match?.players || []).map(p => (
                <div key={p.userId} className="flex items-center gap-2">
                  <div className={`w-6 h-6 rounded-full flex items-center justify-center text-[10px] font-bold ${p.isBot ? 'bg-white/[0.06] text-white/30' : 'bg-blue-500/15 text-blue-300'}`}>
                    {p.isBot ? <Bot size={11} /> : (p.name || '?')[0]?.toUpperCase()}
                  </div>
                  <span className="text-sm text-gray-800 dark:text-gray-200 flex-1 truncate">{p.name}</span>
                  {p.isBot && <span className="text-[9px] uppercase tracking-wider text-white/25">bot</span>}
                  {!p.isBot && p.userId === match?.hostId && <span title="Host" className="inline-flex items-center gap-0.5 text-[9px] uppercase tracking-wider text-blue-400/80"><Trophy size={9} /> host</span>}
                  {!p.isBot && p.userId === myId && <span className="text-[9px] uppercase tracking-wider text-blue-300/55">you</span>}
                </div>
              ))}
              {waiting && !fillWithBots && (
                <div className="flex items-center gap-2">
                  <div className="w-6 h-6 rounded-full bg-white/10 dark:bg-white/[0.06] flex items-center justify-center text-[10px] font-bold text-gray-400">?</div>
                  <span className="text-[12px] text-blue-300/50 italic">Waiting for at least one more…</span>
                  <span className="w-1.5 h-1.5 rounded-full bg-blue-400 animate-pulse" />
                </div>
              )}
              {waiting && fillWithBots && (
                <div className="flex items-center gap-2">
                  <Bot size={13} className="text-blue-400/40" />
                  <span className="text-[12px] text-blue-300/50 italic">{Math.max(0, 8 - (match?.players?.filter(p => !p.isBot)?.length || 0))} bot slots ready</span>
                </div>
              )}
            </div>
          </div>

          {/* Bot fill - host only */}
          {isHost && (
            <div className="mb-4">
              <div className="flex items-center justify-between">
                <span className="text-[10px] font-bold uppercase tracking-[0.15em] text-blue-400/70 flex items-center gap-1.5">
                  <Bot size={11} className="text-blue-400/60" />
                  Fill empty slots with bots
                </span>
                <button
                  onClick={() => setFillWithBots(v => !v)}
                  className={`relative inline-flex h-5 w-9 items-center rounded-full transition-colors ${fillWithBots ? 'bg-blue-500' : 'bg-white/[0.12]'}`}
                >
                  <span className={`inline-block h-3.5 w-3.5 transform rounded-full bg-white shadow transition-transform ${fillWithBots ? 'translate-x-[18px]' : 'translate-x-[2px]'}`} />
                </button>
              </div>
              {fillWithBots && (
                <div className="mt-2 rounded-xl border border-blue-500/20 bg-blue-500/[0.04] p-3">
                  <p className="text-[10px] font-bold uppercase tracking-[0.15em] text-blue-400/70 mb-2">Bot difficulty</p>
                  <div className="grid grid-cols-4 gap-1">
                    {ROOM_LEVELS.map(l => (
                      <button key={l.id} onClick={() => setBotLevel(l.id)}
                        className={`py-1.5 rounded-md text-[11px] font-semibold border transition-all ${botLevel === l.id ? 'bg-blue-500/20 text-blue-200 border-blue-400/50' : 'bg-white/[0.03] text-white/50 border-white/[0.08] hover:text-white/70 hover:border-white/[0.15]'}`}>
                        {l.label}
                      </button>
                    ))}
                  </div>
                  <p className="text-[10px] text-blue-300/50 mt-2">
                    {Math.max(0, 8 - (match?.players?.filter(p => !p.isBot)?.length || 0))} bots · {ROOM_LEVELS.find(l => l.id === botLevel)?.label} level
                  </p>
                </div>
              )}
            </div>
          )}

          {/* Settings - host only, at least 2 players present (or bots will fill) */}
          {(fillWithBots || !waiting) && isHost && (
            <>
              <p className="text-[10px] font-bold uppercase tracking-[0.15em] text-blue-400/70 mb-2">Category</p>
              <div className="mb-3">
                <MatchSelector value={category} onChange={setCategory}
                  options={['Science','History','Literature','Geography','Math','Art','Music','Philosophy','Pop Culture','Mixed']} />
              </div>
              <p className="text-[10px] font-bold uppercase tracking-[0.15em] text-blue-400/70 mb-2">Difficulty</p>
              <div className="mb-3">
                <MatchSelector value={difficulty} onChange={setDifficulty}
                  options={['Easy','Medium','Hard','Tournament']} grid="grid-cols-4" />
              </div>
              <p className="text-[10px] font-bold uppercase tracking-[0.15em] text-blue-400/70 mb-2">Scoring Format</p>
              <div className="mb-3 grid grid-cols-2 gap-1.5">
                {QB_SCORING_FORMATS.map(f => (
                  <button key={f.id} onClick={() => setScoringFormat(f.id)}
                    className={`px-2.5 py-1.5 rounded-md text-left transition-colors border ${
                      scoringFormat === f.id
                        ? 'bg-blue-500/20 text-blue-100 border-blue-500/50'
                        : 'bg-blue-500/[0.06] border-blue-500/20 text-blue-300/75 hover:bg-blue-500/15 hover:text-blue-200'
                    }`}>
                    <div className="text-[11px] font-semibold leading-tight">{f.label}</div>
                    <div className="text-[9px] opacity-70 leading-tight mt-0.5">{f.desc}</div>
                  </button>
                ))}
              </div>
              <div className="grid grid-cols-2 gap-2 mb-4">
                <div className="rounded-xl border border-blue-500/20 bg-blue-500/[0.04] p-3">
                  <div className="flex items-center justify-between mb-1.5">
                    <span className="text-[10px] font-bold uppercase tracking-[0.15em] text-blue-400/70">Questions</span>
                    <span className="text-[11px] font-mono font-bold tabular-nums text-blue-100">{questionCount}</span>
                  </div>
                  <input type="range" min="5" max="20" step="5" value={questionCount}
                    onChange={e => setQuestionCount(Number(e.target.value))} className="w-full accent-blue-500" />
                </div>
                <div className="rounded-xl border border-blue-500/20 bg-blue-500/[0.04] p-3">
                  <div className="flex items-center justify-between mb-1.5">
                    <span className="text-[10px] font-bold uppercase tracking-[0.15em] text-blue-400/70">Speed</span>
                    <span className="text-[11px] font-mono font-bold tabular-nums text-blue-100">{revealSpeedMs}ms</span>
                  </div>
                  <input type="range" min="60" max="300" step="10" value={revealSpeedMs}
                    onChange={e => setRevealSpeedMs(Number(e.target.value))} className="w-full accent-blue-500" />
                </div>
              </div>
            </>
          )}

          {!waiting && !isHost && (
            <p className="text-xs text-blue-300/50 text-center italic py-4 mb-2">Waiting for the host to start…</p>
          )}
          {waiting && !isHost && (
            <p className="text-xs text-blue-300/50 text-center italic py-4 mb-2">Waiting for the host…</p>
          )}

          {isHost && (
            <button
              onClick={handleStart}
              disabled={waiting && !fillWithBots}
              className="w-full py-3 rounded-xl bg-blue-500 text-white text-sm font-semibold border border-blue-400/40 hover:bg-blue-400 disabled:opacity-40 disabled:shadow-none flex items-center justify-center gap-2 transition-all"
            >
              <Play size={14} />
              {waiting && !fillWithBots
                ? 'Waiting for at least one more…'
                : fillWithBots
                  ? `Start · ${playerCount} player${playerCount !== 1 ? 's' : ''} + ${Math.max(0, 8 - (match?.players?.filter(p => !p.isBot)?.length || 0))} bots`
                  : `Start · ${playerCount} player${playerCount !== 1 ? 's' : ''}`
              }
            </button>
          )}

          <button
            onClick={handleLeave}
            className="w-full mt-2 py-2 rounded-xl text-[12px] text-rose-300/80 hover:text-rose-200 transition-colors inline-flex items-center justify-center gap-1.5"
          >
            <LogOut size={12} /> Leave
          </button>

          {error && <p className="mt-3 text-xs text-rose-300 bg-rose-500/10 border border-rose-500/25 rounded-lg px-3 py-2">{error}</p>}
        </div>
      </div>
    );
  }

  // ============ GENERATING ============
  if (view === 'generating') {
    return (
      <div className="h-full flex flex-col items-center justify-center p-6 bg-transparent">
        <div className="w-full max-w-sm">
          <ProgressBar
            active
            label="Generating questions"
            hint={`${(match?.questionCount || questionCount)} ${match?.category || category} · ${match?.difficulty || difficulty}`}
            duration={15000}
          />
        </div>
      </div>
    );
  }

  // ============ PLAYING ============
  if (view === 'playing' && match) {
    return <PlayingView
      match={match} question={question} buzz={buzz} answerResult={answerResult}
      answer={answer} setAnswer={setAnswer}
      onBuzz={handleBuzz} onSubmitAnswer={handleSubmitAnswer} onNext={handleNext}
      onLeave={handleLeave} onEndMatch={handleEndMatch}
      iBuzzed={iBuzzed} isHost={isHost} myId={myId}
      lockedOut={lockedOut} wrongFlash={wrongFlash}
      autoAdvanceDeadline={autoAdvanceDeadline}
      revealSpeedMs={match.revealSpeedMs || 140}
    />;
  }

  // ============ FINISHED ============
  if (view === 'finished') {
    const sorted = [...(match?.players || [])].sort((a, b) => (b.score || 0) - (a.score || 0));
    const winner = sorted[0];
    const amIWinner = winner?.userId === myId;
    const opponentAbandoned = !!abandoned && abandoned.leftBy !== myId;
    return (
      <div className="h-full overflow-y-auto bg-transparent">
        <div className="p-5 space-y-4 text-center">
          <Trophy size={36} className={`mx-auto ${amIWinner && !opponentAbandoned ? 'text-amber-400/70' : 'text-white/20'}`} />
          <p className="text-[17px] font-bold text-white/80">
            {opponentAbandoned ? 'Opponent left' : amIWinner ? 'You won' : winner ? `${winner.name} won` : 'Match over'}
          </p>
          {opponentAbandoned && (
            <p className="text-[11px] text-white/30 -mt-2">
              {abandoned?.reason === 'disconnect' ? 'Disconnected mid-game.' : 'Left mid-game.'}
            </p>
          )}
          <div className="space-y-1.5">
            {sorted.map((p, i) => (
              <div key={p.userId} className={`flex items-center gap-3 px-4 py-2.5 rounded-2xl border ${i === 0 ? 'bg-white/[0.05] border-white/10' : 'bg-white/[0.02] border-white/[0.04]'}`}>
                <span className="text-[11px] font-bold text-white/30 w-4">#{i + 1}</span>
                <span className="flex-1 text-left text-[13px] font-medium text-white/70">{p.name}{p.userId === myId ? ' (you)' : ''}</span>
                <span className="text-[13px] font-bold tabular-nums text-white/60">{p.score || 0}</span>
              </div>
            ))}
          </div>
          <button onClick={handleLeave}
            className="w-full py-2.5 rounded-2xl border border-white/[0.06] bg-white/[0.03] text-[13px] font-medium text-white/50 hover:text-white/70 transition-colors">
            Back
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="h-full flex items-center justify-center text-[12px] text-white/30 bg-transparent">
      <InlineProgress active /> Loading…
    </div>
  );
}

// ===== PLAYING VIEW =====
function PlayingView({ match, question, buzz, answerResult, answer, setAnswer, onBuzz, onSubmitAnswer, onNext, onLeave, onEndMatch, iBuzzed, isHost, myId, lockedOut = [], wrongFlash, autoAdvanceDeadline, revealSpeedMs }) {
  const frozen = !!buzz || !!answerResult;
  const frozenAt = buzz?.buzzAt || answerResult?.buzzAt || null;
  const { revealed, wordIndex, totalWords } = useWordReveal(question?.text || '', question?.startedAt || 0, revealSpeedMs, frozen, frozenAt);

  if (!match || !Array.isArray(match.players)) {
    return <div className="p-5 text-center text-[12px] text-white/30 bg-transparent h-full"><InlineProgress active /> Loading…</div>;
  }

  const players = match.players || [];
  const buzzerName = buzz ? (players.find(p => p.userId === buzz.userId)?.name || 'Opponent') : '';
  const wrongName = wrongFlash ? (players.find(p => p.userId === wrongFlash.userId)?.name || 'Opponent') : '';
  const iAmLocked = lockedOut.includes(myId);

  return (
    <div className="flex flex-col h-full min-h-0 bg-transparent">
      {/* Header */}
      <div className="flex items-center gap-3 px-4 py-2.5 border-b border-white/[0.04] flex-shrink-0">
        <Zap size={13} className="text-amber-500/70" />
        <span className="text-[12px] font-semibold text-white/50 tabular-nums">
          Q{(match.currentIdx || 0) + 1}/{match.totalQuestions}
        </span>
        <div className="flex-1 flex items-center gap-2 justify-center flex-wrap">
          {players.map(p => (
            <div key={p.userId} className={`flex items-center gap-1.5 px-2 py-1 rounded-xl text-[11px] border ${p.userId === myId ? 'bg-white/[0.06] border-white/[0.10] text-white/60' : 'bg-white/[0.03] border-white/[0.05] text-white/35'}`}>
              <span className="font-medium">{p.name}{p.userId === myId ? ' ·' : ''}</span>
              <span className="font-bold tabular-nums">{p.score || 0}</span>
            </div>
          ))}
        </div>
        {isHost && (
          <button onClick={onEndMatch} title="End match early"
            className="inline-flex items-center gap-1 text-[10px] font-semibold text-rose-400/70 hover:text-rose-300 px-2 py-1 rounded-md border border-rose-500/20 hover:border-rose-500/40 bg-rose-500/[0.05] transition-colors">
            <Flag size={10} /> End
          </button>
        )}
        <button onClick={onLeave} className="text-white/20 hover:text-rose-400/60 transition-colors"><LogOut size={12} /></button>
      </div>

      {/* Question */}
      <div className="flex-1 overflow-y-auto p-5">
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
      <div className="px-4 py-3 border-t border-white/[0.04] flex-shrink-0 space-y-2">
        {wrongFlash && !buzz && !answerResult && (
          <div className="px-3 py-1.5 rounded-2xl bg-rose-500/[0.08] border border-rose-500/15 text-[11px] text-rose-400/70 text-center">
            {wrongFlash.userId === myId ? 'Wrong' : `${wrongName} was wrong`}
            {wrongFlash.answer ? ` - "${wrongFlash.answer}"` : ''} · continues
          </div>
        )}
        {!buzz && !answerResult && !iAmLocked && (
          <>
            <button onClick={onBuzz}
              className="w-full py-4 rounded-2xl bg-red-600/80 hover:bg-red-500/80 backdrop-blur-sm text-white text-[15px] font-bold uppercase tracking-[0.15em] active:scale-[0.98] transition-all">
              BUZZ
            </button>
            <p className="text-[10px] text-white/20 text-center">Space to buzz</p>
          </>
        )}
        {!buzz && !answerResult && iAmLocked && (
          <div className="w-full py-3 rounded-2xl border border-white/[0.05] bg-white/[0.02] text-center text-[11px] text-white/25">
            Locked out - wait for next question
          </div>
        )}
        {buzz && !answerResult && iBuzzed && (
          <div className="flex gap-2">
            <input
              autoFocus value={answer} onChange={e => setAnswer(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && answer.trim() && onSubmitAnswer()}
              placeholder="Answer…"
              className="flex-1 px-4 py-3 rounded-2xl border border-white/[0.08] bg-white/[0.04] text-[14px] text-white/85 placeholder-white/20 outline-none focus:border-white/15 transition-colors"
            />
            <button onClick={onSubmitAnswer} disabled={!answer.trim()}
              className="px-5 py-3 rounded-2xl bg-white/[0.07] hover:bg-white/[0.11] border border-white/[0.08] text-white/60 hover:text-white/80 text-[13px] font-semibold disabled:opacity-30 transition-colors">
              →
            </button>
          </div>
        )}
        {buzz && !answerResult && !iBuzzed && (
          <div className="w-full py-3 rounded-2xl border border-white/[0.05] bg-white/[0.02] text-center text-[11px] text-white/30 inline-flex items-center justify-center gap-2">
            <span className="relative flex h-2 w-2">
              <span className="absolute inline-flex h-full w-full rounded-full bg-amber-400/50 animate-ping" />
              <span className="relative inline-flex rounded-full h-2 w-2 bg-amber-500/50" />
            </span>
            {buzzerName} is answering…
          </div>
        )}
        {answerResult && (
          <>
            <div className={`p-3 rounded-2xl text-center border ${answerResult.correct ? 'bg-emerald-500/[0.08] border-emerald-500/25' : (answerResult.timeout || !answerResult.userId) ? 'bg-white/[0.03] border-white/[0.06]' : 'bg-rose-500/[0.08] border-rose-500/25'}`}>
              <p className={`text-[13px] font-bold ${answerResult.correct ? 'text-emerald-400/80' : (answerResult.timeout || !answerResult.userId) ? 'text-white/40' : 'text-rose-400/80'}`}>
                {answerResult.correct
                  ? (answerResult.userId === myId ? '✓ Correct' : `${buzzerName} got it`)
                  : (answerResult.timeout || !answerResult.userId)
                    ? 'No one got it'
                    : (answerResult.userId === myId ? '✗ Wrong' : `${buzzerName} was wrong`)}
              </p>
              <p className="text-[11px] text-white/40 mt-1"><strong className="text-white/60">{answerResult.correctAnswer}</strong></p>
            </div>
            <AutoAdvanceCountdown deadline={autoAdvanceDeadline} isHost={isHost} onNext={onNext} />
          </>
        )}
      </div>
    </div>
  );
}

function AutoAdvanceCountdown({ deadline, isHost, onNext }) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    if (!deadline) return;
    const id = setInterval(() => setNow(Date.now()), 100);
    return () => clearInterval(id);
  }, [deadline]);
  if (!deadline) {
    return isHost
      ? <button onClick={onNext} className="w-full py-2.5 rounded-2xl border border-white/[0.06] bg-white/[0.03] text-[12px] font-semibold text-white/50 hover:text-white/70 transition-colors">Next →</button>
      : <p className="text-[11px] text-center text-white/25">Waiting for host…</p>;
  }
  const msLeft = Math.max(0, deadline - now);
  const secondsLeft = Math.ceil(msLeft / 1000);
  const pct = Math.max(0, Math.min(100, (msLeft / 5000) * 100));
  return (
    <div className="space-y-1.5">
      <div className="flex items-center justify-between text-[11px] text-white/30">
        <span>Next in <strong className="text-white/50 tabular-nums">{secondsLeft}s</strong></span>
        {isHost && <button onClick={onNext} className="text-white/40 hover:text-white/60 font-medium">Skip →</button>}
      </div>
      <div className="h-0.5 rounded-full bg-white/[0.06] overflow-hidden">
        <div className="h-full bg-white/25 transition-all duration-100" style={{ width: `${pct}%` }} />
      </div>
    </div>
  );
}

function MatchSelector({ label, options, value, onChange, grid }) {
  return (
    <div>
      {label && <span className="text-[10px] font-bold uppercase tracking-[0.15em] text-blue-400/70 block mb-1.5">{label}</span>}
      <div className={grid ? `grid ${grid} gap-1.5` : 'flex flex-wrap gap-1.5'}>
        {options.map(o => (
          <button key={o} onClick={() => onChange(o)}
            className={`px-2.5 py-1 rounded-md text-[11px] font-semibold transition-colors ${value === o ? 'bg-blue-500/20 text-blue-100 border border-blue-500/50' : 'bg-blue-500/[0.06] border border-blue-500/20 text-blue-300/75 hover:bg-blue-500/15 hover:text-blue-200'}`}>
            {o}
          </button>
        ))}
      </div>
    </div>
  );
}
