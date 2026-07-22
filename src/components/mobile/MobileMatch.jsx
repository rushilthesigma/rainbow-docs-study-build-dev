import { useState, useEffect, useRef, useCallback } from 'react';
import { Zap, Users, Copy, Check, X, Trophy, Play, LogOut, ArrowLeft, Flag, Bot, Save, Trash2 } from 'lucide-react';
import { useAuth } from '../../context/AuthContext';
import { InlineProgress } from '../shared/ProgressBar';
import { AnswerResultPanel } from '../trial/TrialSession';
import {
  createMatch, joinMatch, setMatchTeam, startMatch, buzzMatch, answerMatch, answerMatchBonus, nextMatchQuestion,
  endMatch, leaveMatch, streamMatch, botBuzz, botAnswer, requestAnswerReview, resolveAnswerReview,
} from '../../api/quizMatch';
import MatchComparison from '../shared/MatchComparison';

// Mirrors the server's QUIZBOWL_BUZZ_ANSWER_MS; only scales the countdown bar.
const BUZZ_WINDOW_MS = 9000;

// Saved room setups ("presets"). Same idea as the desktop AI-lobby presets,
// but scoped to the mobile room config: game type, questions, and bot fill.
const QB_MATCH_PRESETS_KEY = 'qb-match-presets-v1';
function loadMatchPresets() {
  try { return JSON.parse(localStorage.getItem(QB_MATCH_PRESETS_KEY)) || []; }
  catch { return []; }
}
function saveMatchPresets(list) {
  try { localStorage.setItem(QB_MATCH_PRESETS_KEY, JSON.stringify(list)); } catch {}
}

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

// Props (all optional so the component still works standalone):
//   initialView        - 'menu' (create/join) or 'setup' (jump straight into
//                        configuring a room, used by the "Vs AI bots" entry)
//   initialFillWithBots - pre-enable the bot fill toggle
//   onExit             - back out of the multiplayer surface entirely
export default function MobileMatch({ initialView = 'menu', initialFillWithBots = false, initialSet = null, onExit } = {}) {
  const { user } = useAuth();
  const myId = user?.id;

  const [view, setView] = useState(initialSet ? 'setup' : initialView);
  const [code, setCode] = useState('');
  const [joinCodeInput, setJoinCodeInput] = useState('');
  const [matchMode, setMatchMode] = useState('individual');
  const [questionSource, setQuestionSource] = useState(initialSet ? 'saved' : 'qbreader');
  const [category, setCategory] = useState(initialSet?.category || 'Mixed');
  const [customTopic, setCustomTopic] = useState('');
  const [difficulty, setDifficulty] = useState(initialSet?.difficulty || 'Medium');
  const [questionCount, setQuestionCount] = useState(initialSet?.questions?.length || 10);
  const [revealSpeedMs, setRevealSpeedMs] = useState(140);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);
  const [copied, setCopied] = useState(false);
  const [match, setMatch] = useState(null);
  const [fillWithBots, setFillWithBots] = useState(initialFillWithBots);
  const [botLevel, setBotLevel] = useState('varsity');

  const [presets, setPresets] = useState(() => loadMatchPresets());
  const [savingPreset, setSavingPreset] = useState(false);
  const [presetName, setPresetName] = useState('');

  const [question, setQuestion] = useState(null);
  const [buzz, setBuzz] = useState(null);
  const [answer, setAnswer] = useState('');
  const [bonusAnswer, setBonusAnswer] = useState('');
  const [bonusResult, setBonusResult] = useState(null);
  const [bonusDeadline, setBonusDeadline] = useState(null);
  const [answerResult, setAnswerResult] = useState(null);
  const [autoAdvanceDeadline, setAutoAdvanceDeadline] = useState(null);
  const [answerDeadline, setAnswerDeadline] = useState(null);
  const [comparison, setComparison] = useState(null);
  const [lockedOut, setLockedOut] = useState([]);
  const [wrongFlash, setWrongFlash] = useState(null);
  const [lastReviewableWrong, setLastReviewableWrong] = useState(null);
  const [answerReview, setAnswerReview] = useState(null);
  const [reviewStatus, setReviewStatus] = useState(null);
  const [reviewBusy, setReviewBusy] = useState(false);
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
        if (m.mode) setMatchMode(m.mode);
        setAnswerReview(m.activeAnswerReview || null);
        if (m.state === 'bonus' || m.state === 'bonus_reveal') {
          setBonusDeadline(m.bonus?.deadlineAt || null); setView('playing');
        } else if (m.state === 'playing' && m.currentQuestion) {
          setQuestion(m.currentQuestion);
          if (m.buzzWinner) {
            setBuzz({ userId: m.buzzWinner, buzzAt: m.buzzAt });
            setAnswerDeadline((m.buzzAt || Date.now()) + (m.answerWindowMs || BUZZ_WINDOW_MS));
          } else {
            setAnswerDeadline(null);
          }
          setAnswerResult(null);
          setBonusResult(null); setBonusAnswer(''); setBonusDeadline(null);
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
      onTeamUpdated:   (m) => setMatch(m),
      onGenerating:   (m) => { setMatch(m); setView('generating'); },
      onStartFailed:  (data) => { setError(data.error || 'Failed to start'); setMatch(data.match); setView('lobby'); },
      onQuestionStart: ({ text, startedAt, match: m }) => {
        setMatch(m);
        setQuestion({ text, startedAt });
        setBuzz(null); setAnswer(''); setAnswerResult(null);
        setBonusAnswer(''); setBonusResult(null); setBonusDeadline(null);
        setAutoAdvanceDeadline(null); setAnswerDeadline(null); setLockedOut([]); setWrongFlash(null);
        setLastReviewableWrong(null);
        setAnswerReview(null); setReviewStatus(null); setReviewBusy(false);
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
      onWrongAnswer: ({ userId, answer: wrongAns, lockedOut: lock, lockedOutTeams: lockTeams, questionStartedAt: newStart, scores, teamScores, timedOut }) => {
        setBuzz(null); setAnswer(''); setAnswerDeadline(null);
        setLockedOut(lock || []);
        if (newStart && question) setQuestion(q => q ? { ...q, startedAt: newStart } : q);
        setWrongFlash({ userId, answer: wrongAns, timedOut });
        if (userId === myId && wrongAns && !timedOut) {
          setLastReviewableWrong({ userId, answer: wrongAns, timedOut });
        }
        if (scores) setMatch(prev => prev ? { ...prev, players: prev.players.map(p => ({ ...p, score: scores[p.userId] || 0 })) } : prev);
        if (teamScores) setMatch(prev => prev ? { ...prev, teamScores, lockedOutTeams: lockTeams || prev.lockedOutTeams } : prev);
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
        setMatch(prev => prev ? { ...prev, teamScores: data.teamScores || prev.teamScores } : prev);
        if (isHostRef.current) clearBotTimers();
      },
      onBonusStart: (data) => { if (data.match) setMatch(data.match); setBonusDeadline(data.bonus?.deadlineAt || null); setBonusResult(null); setBonusAnswer(''); setView('playing'); },
      onBonusResult: (data) => { setBonusResult(data); setBonusDeadline(null); if (data.match) setMatch(data.match); else setMatch(prev => prev ? { ...prev, teamScores: data.teamScores || prev.teamScores } : prev); },
      onAnswerReview: (data) => {
        setAnswerReview(data.review || data.match?.activeAnswerReview || null);
        if (data.match) setMatch(data.match);
        if (data.match?.currentQuestion) setQuestion(data.match.currentQuestion);
        if (data.paused) {
          setAutoAdvanceDeadline(null);
          setAnswerDeadline(null);
          if (isHostRef.current) clearBotTimers();
        } else if (data.autoAdvanceInMs != null) {
          setAutoAdvanceDeadline(Date.now() + data.autoAdvanceInMs);
        }
        if (data.accepted != null && data.scores) {
          setMatch(prev => prev ? { ...prev, players: prev.players.map(p => ({ ...p, score: data.scores[p.userId] || 0 })) } : prev);
          setReviewStatus(data.accepted ? 'accepted' : 'rejected');
          setReviewBusy(false);
          if (data.accepted && data.review?.requesterId) {
            setLockedOut(prev => prev.filter(id => id !== data.review.requesterId));
          }
          if (data.review?.requesterId === myId) {
            setLastReviewableWrong(null);
          }
          if (data.accepted && data.review?.requesterId === myId) {
            setAnswerResult(prev => prev ? { ...prev, correct: true, userId: myId, ptsGained: data.ptsGained, scores: data.scores } : prev);
          }
        }
      },
      onMatchEnd: ({ scores, teamScores, abandoned: wasAbandoned, leftBy, reason, comparison: cmp }) => {
        setMatch(prev => prev ? { ...prev, teamScores: teamScores || prev.teamScores, players: prev.players.map(p => ({ ...p, score: scores[p.userId] || 0 })) } : prev);
        setQuestion(null); setBuzz(null); setAnswer(''); setAnswerResult(null);
        setAutoAdvanceDeadline(null); setAnswerDeadline(null); setWrongFlash(null);
        setLastReviewableWrong(null);
        setAnswerReview(null); setReviewStatus(null); setReviewBusy(false);
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

  function handleSavePreset() {
    const name = presetName.trim() || `Preset ${presets.length + 1}`;
    const p = {
      id: Date.now().toString(), name,
      matchMode, category, customTopic, difficulty, questionCount,
      revealSpeedMs, fillWithBots, botLevel,
    };
    const next = [p, ...presets].slice(0, 12);
    setPresets(next); saveMatchPresets(next);
    setPresetName(''); setSavingPreset(false);
  }
  function handleLoadPreset(p) {
    setMatchMode(p.matchMode === 'team' ? 'team' : 'individual');
    setCategory(p.category || 'Mixed');
    setCustomTopic(p.customTopic || '');
    setDifficulty(p.difficulty || 'Medium');
    setQuestionCount(p.questionCount || 10);
    setRevealSpeedMs(p.revealSpeedMs || 140);
    setFillWithBots(!!p.fillWithBots);
    if (p.botLevel) setBotLevel(p.botLevel);
  }
  function handleDeletePreset(id) {
    const next = presets.filter(p => p.id !== id);
    setPresets(next); saveMatchPresets(next);
  }

  async function handleCreate() {
    if (busy) return;
    setBusy(true); setError(null);
    try {
      const res = await createMatch({ mode: matchMode });
      setCode(res.code); setMatch(res.match); setMatchMode(res.match?.mode || matchMode); setView('lobby');
    } catch (e) { setError(e.message || 'Failed to create'); }
    setBusy(false);
  }

  async function handleJoin() {
    const c = joinCodeInput.trim().toUpperCase();
    if (!c || busy) return;
    setBusy(true); setError(null);
    try {
      const res = await joinMatch(c);
      setCode(c); setMatch(res.match); setMatchMode(res.match?.mode || 'individual'); setView('lobby');
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
      bots = scaled.slice(0, botCount).map((b, i) => ({ id: b.id, name: b.name, team: matchMode === 'team' ? (i % 2 === 0 ? 'A' : 'B') : undefined, accuracy: b.accuracy, thinkMs: b.thinkMs }));
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
    try {
      await startMatch(code, {
        questionSource, category, difficulty, questionCount, revealSpeedMs, bots,
        questions: questionSource === 'saved' ? initialSet?.questions : undefined,
        customTopic: category === 'Custom' ? customTopic.trim() : undefined,
      });
    }
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
    try {
      const result = await answerMatch(code, answer.trim());
      if (result.directive === 'prompt') {
        setError(result.directedPrompt ? `Prompt: ${result.directedPrompt}` : 'Prompt: be more specific.');
      }
    } catch (e) { setError(e.message); }
  }

  async function handleSubmitBonus(pass = false) {
    if (!pass && !bonusAnswer.trim()) return;
    try { await answerMatchBonus(code, bonusAnswer.trim(), pass); setBonusAnswer(''); }
    catch (e) { setError(e.message || 'Could not submit bonus answer'); }
  }

  async function handleSelectTeam(team, userId = myId) {
    try { const data = await setMatchTeam(code, team, userId); if (data.match) setMatch(data.match); }
    catch (e) { setError(e.message || 'Could not change teams'); }
  }

  async function handleNext() {
    try { await nextMatchQuestion(code); } catch (e) { setError(e.message); }
  }

  async function handleRequestReview() {
    if (reviewBusy) return;
    setReviewBusy(true); setError(null);
    try {
      const res = await requestAnswerReview(code);
      setAnswerReview(res.review);
      if (res.autoAccepted) {
        setReviewStatus(res.accepted ? 'accepted' : 'rejected');
        setAutoAdvanceDeadline(res.autoAdvanceInMs != null ? Date.now() + res.autoAdvanceInMs : null);
        setAnswerDeadline(null);
        if (res.scores) {
          setMatch(prev => prev ? { ...prev, players: prev.players.map(p => ({ ...p, score: res.scores[p.userId] || 0 })) } : prev);
        }
        if (res.accepted && res.review?.requesterId) {
          setLockedOut(prev => prev.filter(id => id !== res.review.requesterId));
        }
        setLastReviewableWrong(null);
      } else {
        setReviewStatus('pending');
        setAutoAdvanceDeadline(null);
        setAnswerDeadline(null);
      }
    } catch (e) {
      setError(e.message || 'Could not request review');
    }
    setReviewBusy(false);
  }

  async function handleResolveReview(reviewId, accepted) {
    if (reviewBusy) return;
    setReviewBusy(true); setError(null);
    try { await resolveAnswerReview(code, reviewId, accepted); }
    catch (e) { setError(e.message || 'Could not resolve review'); setReviewBusy(false); }
  }

  async function handleLeave() {
    try { await leaveMatch(code); } catch {}
    setCode(''); setMatch(null); setQuestion(null); setBuzz(null);
    setAnswerResult(null); setAbandoned(null); setAnswerDeadline(null); setComparison(null);
    setLastReviewableWrong(null);
    setAnswerReview(null); setReviewStatus(null); setReviewBusy(false);
    setView('menu');
  }

  const iBuzzed = buzz && buzz.userId === myId;
  const isHost = match?.hostId === myId;

  // ── MENU ──
  if (view === 'menu') {
    return (
      <div className="flex-1 min-h-0 flex flex-col bg-[#0a0a14] text-white">
        <div className="shrink-0 flex items-center gap-2 px-3 h-12 border-b border-white/[0.06]">
          {onExit && (
            <button onClick={onExit} className="w-9 h-9 -ml-1 rounded-full grid place-items-center active:bg-white/[0.06]" aria-label="Back">
              <ArrowLeft size={18} className="text-white/70" />
            </button>
          )}
          <div className="w-9 h-9 rounded-xl grid place-items-center bg-blue-500/15 border border-blue-400/20">
            <Zap size={18} className="text-blue-300" />
          </div>
          <div>
            <h1 className="text-[17px] font-bold tracking-tight leading-none">Multiplayer</h1>
            <p className="text-[11px] text-white/35 mt-0.5">Create a room or join with a code</p>
          </div>
        </div>
        <div className="flex-1 min-h-0 overflow-y-auto px-4 pb-6 pt-4 space-y-4">
          <button
            onClick={() => setView('setup')}
            className="w-full h-12 rounded-2xl bg-blue-500 text-white font-bold text-[15px] flex items-center justify-center gap-2 active:bg-blue-600"
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
                className="flex-1 rounded-2xl bg-white/[0.05] border border-white/[0.08] px-4 py-3 text-[16px] font-mono tracking-widest text-white placeholder-white/20 outline-none focus:border-blue-400/40"
              />
              <button
                onClick={handleJoin}
                disabled={busy || joinCodeInput.trim().length < 4}
                className="px-5 rounded-2xl bg-blue-500/15 border border-blue-400/30 text-blue-100 font-semibold disabled:opacity-40 active:bg-blue-500/25"
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
        <MatchHeader title="New Room" onBack={() => (initialView === 'setup' && onExit ? onExit() : setView('menu'))} />
        <div className="flex-1 min-h-0 overflow-y-auto px-4 pb-6 space-y-4">
          <div>
            <SectionLabel>Game type</SectionLabel>
            <div className="grid grid-cols-2 gap-2">
              <button onClick={() => setMatchMode('individual')} className={`rounded-2xl border p-3 text-left ${matchMode === 'individual' ? 'border-blue-400/50 bg-blue-500/15' : 'border-white/[0.08] bg-white/[0.03]'}`}><Zap size={14} className="text-blue-300 mb-1" /><p className="text-[12px] font-bold">Open match</p><p className="text-[10px] text-white/35">Individual scoring</p></button>
              <button onClick={() => setMatchMode('team')} disabled={!!initialSet} className={`rounded-2xl border p-3 text-left ${initialSet ? 'cursor-not-allowed border-white/[0.05] bg-white/[0.015] opacity-50' : matchMode === 'team' ? 'border-blue-400/50 bg-blue-500/15' : 'border-white/[0.08] bg-white/[0.03]'}`}><Users size={14} className="text-blue-300 mb-1" /><p className="text-[12px] font-bold">Team scrimmage</p><p className="text-[10px] text-white/35">{initialSet ? 'Needs bonus parts' : 'Tossups + bonuses'}</p></button>
            </div>
          </div>
          {initialSet && <div className="rounded-2xl border border-amber-400/25 bg-amber-500/[0.08] p-3"><p className="text-[10px] font-bold uppercase tracking-[0.15em] text-amber-300/75">Exact collection set</p><p className="mt-1 truncate text-[13px] font-semibold text-amber-50">{initialSet.title}</p><p className="mt-0.5 text-[10px] text-amber-100/55">{initialSet.questions.length} tossups · no regeneration</p></div>}
          <div>
            <SectionLabel>Category</SectionLabel>
            <div className="flex flex-wrap gap-1.5">
              {!initialSet && ['Science','History','Literature','Geography','Math','Art','Music','Philosophy','Mixed','Custom'].map(o => (
                <Chip key={o} active={category === o} onClick={() => setCategory(o)}>{o}</Chip>
              ))}
            </div>
            {!initialSet && category === 'Custom' && (
              <input
                type="text" value={customTopic} maxLength={200}
                onChange={e => setCustomTopic(e.target.value)}
                placeholder="Any topic - the AI writes the tossups on it"
                className="mt-2 w-full px-3 py-2 rounded-lg bg-white/[0.04] border border-white/[0.1] text-[13px] text-white placeholder:text-white/25 focus:outline-none focus:border-blue-400/50 transition-colors"
              />
            )}
          </div>
          <div>
            <SectionLabel>Difficulty</SectionLabel>
            <div className="flex gap-1.5">
              {!initialSet && ['Easy','Medium','Hard','Tournament'].map(o => (
                <Chip key={o} active={difficulty === o} onClick={() => setDifficulty(o)}>{o}</Chip>
              ))}
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="rounded-xl border border-white/[0.08] bg-white/[0.03] p-3">
              <div className="flex items-center justify-between mb-1.5">
                <span className="text-[10px] font-bold uppercase tracking-[0.15em] text-white/30">Questions</span>
                <span className="text-[11px] font-mono font-bold text-blue-300">{questionCount}</span>
              </div>
              {initialSet ? <p className="text-[10px] text-amber-200/55">Fixed to the published packet</p> : <input type="range" min="5" max="20" step="5" value={questionCount}
                onChange={e => setQuestionCount(Number(e.target.value))} className="w-full accent-blue-500" />}
            </div>
            <div className="rounded-xl border border-white/[0.08] bg-white/[0.03] p-3">
              <div className="flex items-center justify-between mb-1.5">
                <span className="text-[10px] font-bold uppercase tracking-[0.15em] text-white/30">Speed</span>
                <span className="text-[11px] font-mono font-bold text-blue-300">{revealSpeedMs}ms</span>
              </div>
              <input type="range" min="60" max="300" step="10" value={revealSpeedMs}
                onChange={e => setRevealSpeedMs(Number(e.target.value))} className="w-full accent-blue-500" />
            </div>
          </div>

          <div className={`rounded-2xl border p-3 transition-all ${fillWithBots ? 'border-blue-500/40 bg-blue-500/[0.07]' : 'border-white/[0.08] bg-white/[0.02]'}`}>
            <div className="flex items-center justify-between">
              <span className={`text-[11px] font-bold flex items-center gap-1.5 ${fillWithBots ? 'text-blue-200' : 'text-white/55'}`}>
                <Bot size={13} className={fillWithBots ? 'text-blue-300' : 'text-white/25'} />
                Fill with AI bots
              </span>
              <button
                onClick={() => setFillWithBots(v => !v)}
                className={`relative inline-flex h-5 w-9 items-center rounded-full transition-colors ${fillWithBots ? 'bg-blue-500' : 'bg-white/[0.12]'}`}
              >
                <span className={`inline-block h-3.5 w-3.5 transform rounded-full bg-white shadow transition-transform ${fillWithBots ? 'translate-x-[18px]' : 'translate-x-[2px]'}`} />
              </button>
            </div>
            {fillWithBots && (
              <div className="mt-2.5">
                <p className="text-[9px] font-bold uppercase tracking-[0.15em] text-blue-300/70 mb-1.5">Bot difficulty</p>
                <div className="flex gap-1.5">
                  {ROOM_LEVELS.map(l => (
                    <button key={l.id} onClick={() => setBotLevel(l.id)}
                      className={`flex-1 py-1.5 rounded-lg text-[11px] font-semibold border transition-all ${botLevel === l.id ? 'bg-blue-500/25 text-blue-100 border-blue-400/60' : 'bg-white/[0.03] text-white/45 border-white/[0.08] active:text-white/70'}`}>
                      {l.label}
                    </button>
                  ))}
                </div>
              </div>
            )}
          </div>

          <div className="rounded-2xl border border-white/[0.08] bg-white/[0.02] p-3 space-y-2">
            <div className="flex items-center justify-between">
              <span className="text-[11px] font-bold flex items-center gap-1.5 text-white/55">
                <Save size={13} className="text-white/25" /> Presets
              </span>
              {!savingPreset && (
                <button onClick={() => setSavingPreset(true)} className="text-[11px] font-semibold text-blue-300/80 active:text-blue-200">
                  Save current
                </button>
              )}
            </div>
            {savingPreset && (
              <div className="flex gap-2">
                <input
                  autoFocus value={presetName} maxLength={40}
                  onChange={e => setPresetName(e.target.value)}
                  onKeyDown={e => { if (e.key === 'Enter') handleSavePreset(); if (e.key === 'Escape') setSavingPreset(false); }}
                  placeholder="Preset name…"
                  className="flex-1 min-w-0 rounded-xl bg-white/[0.05] border border-white/[0.08] px-3 py-2 text-[12px] text-white placeholder-white/25 outline-none focus:border-blue-400/40"
                />
                <button onClick={handleSavePreset} className="px-3 rounded-xl bg-blue-500 text-white text-[12px] font-semibold active:bg-blue-600">Save</button>
                <button onClick={() => setSavingPreset(false)} className="px-2 rounded-xl text-white/35 active:text-white/60" aria-label="Cancel"><X size={13} /></button>
              </div>
            )}
            {presets.length === 0 && !savingPreset && (
              <p className="text-[10px] text-white/25">Save this setup to reuse it in one tap.</p>
            )}
            {presets.map(p => (
              <div key={p.id} className="flex items-center gap-2">
                <button onClick={() => handleLoadPreset(p)} className="flex-1 min-w-0 rounded-xl border border-white/[0.08] bg-white/[0.03] px-3 py-2 text-left active:bg-white/[0.06]">
                  <p className="text-[12px] font-semibold text-white/75 truncate">{p.name}</p>
                  <p className="text-[10px] text-white/30 truncate">
                    {p.matchMode === 'team' ? 'Team' : 'Open'} · {p.category === 'Custom' ? (p.customTopic || 'Custom') : p.category} · {p.difficulty} · {p.questionCount} Qs
                    {p.fillWithBots ? ` · ${(ROOM_LEVELS.find(l => l.id === p.botLevel)?.label || 'Varsity')} bots` : ''}
                  </p>
                </button>
                <button onClick={() => handleDeletePreset(p.id)} aria-label={`Delete ${p.name}`} className="p-2 rounded-xl text-white/25 active:text-rose-300">
                  <Trash2 size={14} />
                </button>
              </div>
            ))}
          </div>

          {error && <p className="text-[12px] text-rose-300">{error}</p>}
        </div>
        <div className="px-4 pb-4 pt-2 border-t border-white/[0.06]">
          <button
            onClick={handleCreate}
            disabled={busy || (category === 'Custom' && !customTopic.trim())}
            className="w-full h-12 rounded-2xl bg-blue-500 text-white font-bold text-[15px] flex items-center justify-center gap-2 disabled:opacity-40 active:bg-blue-600"
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
    const teamReady = match?.mode !== 'team' || ['A', 'B'].every(t => (match?.players || []).some(p => p.team === t));
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
              {code} {copied ? <Check size={18} className="text-blue-300" /> : <Copy size={16} className="text-white/40" />}
            </button>
          </div>

          <div>
            <SectionLabel>Players ({playerCount}/{maxPlayers})</SectionLabel>
            <div className="space-y-1.5">
              {match?.mode === 'team' ? ['A', 'B'].map(team => (
                <div key={team} className="rounded-2xl border border-white/[0.08] bg-white/[0.03] p-3">
                  <div className="flex items-center gap-2 mb-2"><span className={`w-2 h-2 rounded-full ${team === 'A' ? 'bg-blue-400' : 'bg-amber-400'}`} /><span className="text-[12px] font-bold">{match.teamNames?.[team] || `Team ${team}`}</span><span className="ml-auto text-[10px] text-white/30">{(match.players || []).filter(p => p.team === team).length}/4</span></div>
                  {(match.players || []).filter(p => p.team === team).map(p => <div key={p.userId} className="flex items-center gap-2 py-1"><span className="w-6 h-6 rounded-full grid place-items-center bg-white/[0.06] text-[10px]">{p.isBot ? <Bot size={11} /> : (p.name || '?')[0]?.toUpperCase()}</span><span className="flex-1 text-[13px] text-white/75 truncate">{p.name}</span>{p.userId === myId && <span className="text-[9px] text-white/30">you</span>}</div>)}
                  {!match.players?.find(p => p.userId === myId)?.isBot && <button onClick={() => handleSelectTeam(team)} className="mt-2 w-full rounded-xl border border-blue-400/25 bg-blue-500/10 py-2 text-[11px] font-semibold text-blue-100/80 active:bg-blue-500/20">Join {match.teamNames?.[team] || `Team ${team}`}</button>}
                </div>
              )) : (match?.players || []).map(p => (
                <div key={p.userId} className="flex items-center gap-2 rounded-xl bg-white/[0.03] border border-white/[0.06] px-3 py-2">
                  <div className={`w-6 h-6 rounded-full grid place-items-center text-[10px] font-bold ${p.isBot ? 'bg-white/[0.06] text-white/30' : 'bg-blue-500/15 text-blue-300'}`}>
                    {p.isBot ? <Bot size={11} /> : (p.name || '?')[0]?.toUpperCase()}
                  </div>
                  <span className="flex-1 text-[13px] text-white/80 truncate">{p.name}</span>
                  {p.isBot && <span className="text-[9px] uppercase tracking-wider text-white/25">bot</span>}
                  {p.userId === match?.hostId && !p.isBot && <span className="text-[9px] text-blue-300/80 font-semibold flex items-center gap-0.5"><Trophy size={9} /> host</span>}
                  {p.userId === myId && <span className="text-[9px] text-white/30">you</span>}
                </div>
              ))}
              {waiting && !fillWithBots && (
                <div className="flex items-center gap-2 text-white/30 text-[12px] italic px-1">
                  <span className="w-1.5 h-1.5 rounded-full bg-blue-400 animate-pulse" />
                  Waiting for at least one more…
                </div>
              )}
            </div>
          </div>

          {isHost && (
            <div className={`rounded-2xl border p-3 ${fillWithBots ? 'border-blue-500/40 bg-blue-500/[0.07]' : 'border-white/[0.08] bg-white/[0.02]'}`}>
              <div className="flex items-center justify-between">
                <span className={`text-[11px] font-bold flex items-center gap-1.5 ${fillWithBots ? 'text-blue-200' : 'text-white/55'}`}>
                  <Bot size={13} className={fillWithBots ? 'text-blue-300' : 'text-white/25'} />
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
                <div className="mt-2.5">
                  <p className="text-[9px] font-bold uppercase tracking-[0.15em] text-blue-300/70 mb-1.5">Bot difficulty</p>
                  <div className="flex gap-1.5">
                    {ROOM_LEVELS.map(l => (
                      <button key={l.id} onClick={() => setBotLevel(l.id)}
                        className={`flex-1 py-1.5 rounded-lg text-[11px] font-semibold border transition-all ${botLevel === l.id ? 'bg-blue-500/25 text-blue-100 border-blue-400/60' : 'bg-white/[0.03] text-white/45 border-white/[0.08]'}`}>
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
              disabled={(waiting && !fillWithBots) || (match?.mode === 'team' && !teamReady) || (category === 'Custom' && !customTopic.trim())}
              className="w-full h-12 rounded-2xl bg-blue-500 text-white font-bold text-[15px] flex items-center justify-center gap-2 disabled:opacity-40 active:bg-blue-600"
            >
              <Play size={17} />
              {match?.mode === 'team' && !teamReady
                ? 'Place players on both teams…'
                : waiting && !fillWithBots
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
        <p className="text-[11px] text-white/25">{match?.questionCount || questionCount} questions · {match?.customTopic || match?.category || category}</p>
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

    if (match.mode === 'team' && ['bonus', 'bonus_reveal', 'reveal'].includes(match.state) && (match.bonus || match.pendingBonusTeam || bonusResult)) {
      return <MobileBonusView match={match} myId={myId} bonusAnswer={bonusAnswer} setBonusAnswer={setBonusAnswer} bonusResult={bonusResult} bonusDeadline={bonusDeadline} onSubmitBonus={handleSubmitBonus} onNext={handleNext} onLeave={handleLeave} isHost={isHost} />;
    }

    return (
      <PlayingView
        match={match} question={question} buzz={buzz} answerResult={answerResult}
        answer={answer} setAnswer={setAnswer}
        onBuzz={handleBuzz} onSubmitAnswer={handleSubmitAnswer} onNext={handleNext}
        onLeave={handleLeave} onEndMatch={async () => { try { await endMatch(code); } catch {} }}
        iBuzzed={iBuzzed} isHost={isHost} myId={myId}
        lockedOut={lockedOut} wrongFlash={wrongFlash} lastReviewableWrong={lastReviewableWrong}
        answerReview={answerReview} reviewStatus={reviewStatus} reviewBusy={reviewBusy}
        onRequestReview={handleRequestReview} onResolveReview={handleResolveReview}
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
    const teamMode = match?.mode === 'team';
    const teamScores = match?.teamScores || { A: 0, B: 0 };
    const winningTeam = teamMode ? (teamScores.A === teamScores.B ? null : teamScores.A > teamScores.B ? 'A' : 'B') : null;
    return (
      <div className="flex-1 min-h-0 flex flex-col bg-[#0a0a14] text-white">
        <MatchHeader title="Match Over" onBack={handleLeave} />
        <div className="flex-1 min-h-0 overflow-y-auto px-4 pb-6 pt-6 space-y-4 text-center">
          <Trophy size={36} className={`mx-auto ${amIWinner && !opponentAbandoned ? 'text-amber-400/70' : 'text-white/20'}`} />
          <p className="text-[18px] font-bold text-white/80">
            {opponentAbandoned ? 'Opponent left' : teamMode ? (winningTeam ? `${match.teamNames?.[winningTeam] || `Team ${winningTeam}`} won` : 'Team tie') : amIWinner ? 'You won' : winner ? `${winner.name} won` : 'Match over'}
          </p>
          {teamMode && <div className="grid grid-cols-2 gap-2"><div className="rounded-2xl border border-blue-400/20 bg-blue-500/[0.08] p-3 text-left"><p className="text-[10px] text-white/35">{match.teamNames?.A || 'Blue Team'}</p><p className="text-[24px] font-bold">{teamScores.A || 0}</p></div><div className="rounded-2xl border border-amber-400/20 bg-amber-500/[0.08] p-3 text-left"><p className="text-[10px] text-white/35">{match.teamNames?.B || 'Orange Team'}</p><p className="text-[24px] font-bold">{teamScores.B || 0}</p></div></div>}
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

function MobileBonusView({ match, myId, bonusAnswer, setBonusAnswer, bonusResult, bonusDeadline, onSubmitBonus, onNext, onLeave, isHost }) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => { if (!bonusDeadline) return undefined; const id = setInterval(() => setNow(Date.now()), 100); return () => clearInterval(id); }, [bonusDeadline]);
  const bonus = match.bonus;
  const activeTeam = bonus?.team || match.pendingBonusTeam;
  const me = match.players?.find(p => p.userId === myId);
  const controlling = me?.team === activeTeam;
  const seconds = bonusDeadline ? Math.max(0, Math.ceil((bonusDeadline - now) / 1000)) : 0;
  const scores = match.teamScores || { A: 0, B: 0 };
  return <div className="flex-1 min-h-0 flex flex-col bg-[#0a0a14] text-white">
    <MatchHeader title="Team Bonus" onBack={onLeave} />
    <div className="flex-1 min-h-0 overflow-y-auto px-4 py-5 space-y-4">
      <div className="grid grid-cols-2 gap-2"><div className="rounded-2xl border border-blue-400/20 bg-blue-500/[0.08] p-3"><p className="text-[10px] text-white/35 truncate">{match.teamNames?.A || 'Blue Team'}</p><p className="text-[22px] font-bold tabular-nums">{scores.A || 0}</p></div><div className="rounded-2xl border border-amber-400/20 bg-amber-500/[0.08] p-3"><p className="text-[10px] text-white/35 truncate">{match.teamNames?.B || 'Orange Team'}</p><p className="text-[22px] font-bold tabular-nums">{scores.B || 0}</p></div></div>
      {bonus ? <><div><p className="text-[10px] font-bold uppercase tracking-[0.15em] text-amber-300/70">{match.teamNames?.[activeTeam] || `Team ${activeTeam}`} · Part {(bonus.partIndex || 0) + 1}/{bonus.totalParts || 3}</p><p className="text-[11px] text-white/35 mt-1">{bonus.leadin}</p></div><div className="rounded-2xl border border-amber-400/20 bg-amber-400/[0.06] p-4"><p className="text-[16px] leading-relaxed text-white/90">{bonus.part}</p></div>{bonusResult ? <div className={`rounded-2xl border p-4 ${bonusResult.correct ? 'border-emerald-400/25 bg-emerald-400/[0.08]' : 'border-rose-400/20 bg-rose-400/[0.06]'}`}><p className="text-[12px] font-semibold">{bonusResult.correct ? `+${bonusResult.points} · Correct` : bonusResult.timedOut ? 'Time expired' : 'No points'}</p><p className="text-[13px] text-white/70 mt-1">Answer: <strong>{bonusResult.correctAnswer}</strong></p></div> : controlling && match.state === 'bonus' ? <div className="space-y-2"><div className="flex justify-end text-[18px] font-bold tabular-nums text-amber-200">{seconds}s</div><div className="flex gap-2"><input autoFocus value={bonusAnswer} onChange={e => setBonusAnswer(e.target.value)} onKeyDown={e => e.key === 'Enter' && onSubmitBonus(false)} placeholder="Team answer…" className="flex-1 rounded-2xl border border-amber-400/30 bg-white/[0.04] px-4 py-3 text-[14px] text-white outline-none" /><button onClick={() => onSubmitBonus(false)} disabled={!bonusAnswer.trim()} className="rounded-2xl bg-amber-500 px-4 py-3 font-semibold text-black disabled:opacity-30">Submit</button></div><button onClick={() => onSubmitBonus(true)} className="w-full rounded-2xl border border-white/[0.08] py-2.5 text-[12px] text-white/45">Pass</button></div> : <p className="rounded-2xl border border-white/[0.07] bg-white/[0.03] p-3 text-center text-[12px] text-white/40">{controlling ? 'Bonus starting…' : 'Other team is conferring…'}</p>}{isHost && (bonusResult || match.state === 'reveal') && <button onClick={onNext} className="w-full rounded-2xl border border-white/[0.08] py-3 text-[13px] text-white/55">Next →</button>}</> : <div className="py-16 text-center text-[12px] text-white/40"><InlineProgress active /> Preparing bonus…</div>}
    </div>
  </div>;
}

function PlayingView({ match, question, buzz, answerResult, answer, setAnswer, onBuzz, onSubmitAnswer, onNext, onLeave, onEndMatch, iBuzzed, isHost, myId, lockedOut, wrongFlash, lastReviewableWrong, answerReview, reviewStatus, reviewBusy, onRequestReview, onResolveReview, autoAdvanceDeadline, answerDeadline, revealSpeedMs, frozen, frozenAt, players, buzzerName, wrongName, iAmLocked }) {
  const reviewPending = answerReview?.status === 'pending';
  const effectiveFrozen = frozen || reviewPending;
  const { revealed, wordIndex, totalWords } = useWordReveal(question?.text || '', question?.startedAt || 0, revealSpeedMs, effectiveFrozen, frozenAt);
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
  const reviewForMe = reviewPending && answerReview.requesterId === myId;
  const reviewForOpponent = reviewPending && answerReview.verifierId === myId;
  const reviewableWrong = (wrongFlash?.userId === myId && wrongFlash.answer && !wrongFlash.timedOut)
    ? wrongFlash
    : lastReviewableWrong;
  const canRequestReview = !reviewPending && !reviewBusy && (
    !!reviewableWrong
    || (answerResult?.userId === myId && answerResult.correct === false && answerResult.answer)
  );

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
          {!effectiveFrozen && wordIndex < totalWords - 1 && (
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
          <div className="px-3 py-2 rounded-2xl bg-rose-500/[0.08] border border-rose-500/15 text-[11px] text-rose-400/70 text-center space-y-1.5">
            <p>
              {wrongFlash.userId === myId ? 'Wrong' : `${wrongName} was wrong`}
              {wrongFlash.timedOut ? ' — ran out of time' : wrongFlash.answer ? ` — "${wrongFlash.answer}"` : ''} · continues
            </p>
            {canRequestReview && (
              <button onClick={onRequestReview} className="rounded-xl border border-amber-400/25 bg-amber-400/[0.10] px-3 py-1.5 text-[11px] font-semibold text-amber-100">
                I was right
              </button>
            )}
          </div>
        )}
        {reviewForOpponent && (
          <AnswerReviewPanel review={answerReview} busy={reviewBusy} onResolve={onResolveReview} />
        )}
        {reviewForMe && (
          <div className="rounded-2xl border border-amber-400/20 bg-amber-400/[0.07] px-3 py-2 text-center text-[11px] text-amber-100/75">
            Protest sent to {answerReview.verifierName}. Game paused while they verify.
          </div>
        )}
        {reviewPending && !reviewForMe && !reviewForOpponent && (
          <div className="rounded-2xl border border-amber-400/15 bg-amber-400/[0.05] px-3 py-2 text-center text-[11px] text-amber-100/60">
            Game paused for an answer review.
          </div>
        )}
        {reviewStatus && !reviewPending && answerReview?.requesterId === myId && (
          <div className={`rounded-2xl border px-3 py-2 text-center text-[11px] ${reviewStatus === 'accepted' ? 'border-emerald-400/20 bg-emerald-400/[0.08] text-emerald-200/80' : 'border-white/[0.08] bg-white/[0.03] text-white/45'}`}>
            Review {reviewStatus}. {reviewStatus === 'accepted' ? 'Score corrected.' : 'Ruling stands.'}
          </div>
        )}
        {!buzz && !answerResult && !iAmLocked && !reviewPending && (
          <button onClick={onBuzz}
            className="w-full py-5 rounded-2xl bg-blue-600 active:bg-blue-500 text-white text-[16px] font-bold uppercase tracking-[0.15em]">
            BUZZ
          </button>
        )}
        {!buzz && !answerResult && iAmLocked && (
          <div className="w-full rounded-2xl border border-white/[0.05] bg-white/[0.02] px-3 py-3 text-center text-[11px] text-white/30 space-y-2">
            <p>Locked out — wait for next question</p>
            {canRequestReview && (
              <button onClick={onRequestReview} disabled={reviewBusy}
                className="rounded-xl border border-amber-400/25 bg-amber-400/[0.10] px-3 py-1.5 text-[11px] font-semibold text-amber-100 disabled:opacity-40">
                {reviewBusy ? 'Sending review…' : 'I was right'}
              </button>
            )}
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
                className="px-5 py-3 rounded-2xl bg-blue-500 active:bg-blue-600 border border-blue-400/30 text-white text-[13px] font-semibold disabled:opacity-30">
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
            {canRequestReview && (
              <button onClick={onRequestReview} disabled={reviewBusy}
                className="w-full py-2.5 rounded-2xl border border-amber-400/25 bg-amber-400/[0.08] text-[12px] font-semibold text-amber-100/80 disabled:opacity-40">
                {reviewBusy ? 'Sending review…' : 'I was right'}
              </button>
            )}
            {!reviewPending && autoAdvanceDeadline ? (
              <div className="space-y-1.5">
                <div className="flex items-center justify-between text-[11px] text-white/30">
                  <span>Next in <strong className="text-white/50 tabular-nums">{Math.max(0, Math.ceil((autoAdvanceDeadline - now) / 1000))}s</strong></span>
                  {isHost && <button onClick={onNext} className="text-white/40 active:text-white/60 font-medium">Skip →</button>}
                </div>
                <div className="h-0.5 rounded-full bg-white/[0.06] overflow-hidden">
                  <div className="h-full bg-white/25 transition-all duration-100" style={{ width: `${Math.max(0, Math.min(100, ((autoAdvanceDeadline - now) / 5000) * 100))}%` }} />
                </div>
              </div>
            ) : !reviewPending ? (
              isHost
                ? <button onClick={onNext} className="w-full py-2.5 rounded-2xl border border-blue-400/25 bg-blue-500/10 text-[12px] font-semibold text-blue-100/80 active:bg-blue-500/20">Next →</button>
                : <p className="text-[11px] text-center text-white/25">Waiting for host…</p>
            ) : null}
          </>
        )}
      </div>
    </div>
  );
}

function AnswerReviewPanel({ review, busy, onResolve }) {
  return (
    <div className="rounded-2xl border border-amber-400/25 bg-amber-400/[0.07] p-3 text-left">
      <p className="text-[10px] font-bold uppercase tracking-[0.15em] text-amber-200/70">Verify answer</p>
      <p className="text-[12px] text-white/55 mb-2">{review.requesterName} says they were right.</p>
      <p className="max-h-28 overflow-y-auto rounded-xl border border-white/[0.06] bg-black/15 p-2 text-[12px] leading-relaxed text-white/75">
        {review.questionText}
      </p>
      <div className="mt-2 grid grid-cols-2 gap-2 text-[11px]">
        <div className="rounded-xl border border-white/[0.06] bg-white/[0.03] p-2">
          <p className="text-white/30">Submitted</p>
          <p className="font-semibold text-white/75">{review.submittedAnswer || 'No answer'}</p>
        </div>
        <div className="rounded-xl border border-white/[0.06] bg-white/[0.03] p-2">
          <p className="text-white/30">Official</p>
          <p className="font-semibold text-white/75">{review.correctAnswer}</p>
        </div>
      </div>
      <div className="mt-2 grid grid-cols-2 gap-2">
        <button onClick={() => onResolve(review.id, false)} disabled={busy}
          className="rounded-xl border border-white/[0.08] bg-white/[0.04] px-3 py-2 text-[12px] font-semibold text-white/55 disabled:opacity-40">
          Keep wrong
        </button>
        <button onClick={() => onResolve(review.id, true)} disabled={busy}
          className="rounded-xl border border-emerald-400/30 bg-emerald-400/[0.12] px-3 py-2 text-[12px] font-semibold text-emerald-100 disabled:opacity-40">
          Mark right
        </button>
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
      className={`px-3 py-1.5 rounded-xl text-[12px] font-semibold whitespace-nowrap transition-colors ${active ? 'bg-blue-500/20 text-blue-100 border border-blue-400/50' : 'bg-white/[0.04] border border-white/[0.06] text-white/45 active:bg-blue-500/[0.08]'}`}>
      {children}
    </button>
  );
}
