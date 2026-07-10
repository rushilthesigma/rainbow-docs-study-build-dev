import { useState, useEffect, useRef, useCallback } from 'react';
import { useWindowManager } from '../../../context/WindowManagerContext';
import { Zap, Users, Copy, Check, X, Trophy, Play, LogOut, ArrowLeft, Flag, Bot, Loader2, BookOpen, Sparkles } from 'lucide-react';
import ProgressBar, { InlineProgress } from '../../shared/ProgressBar';
import {
  createMatch, joinMatch, startMatch, buzzMatch, answerMatch, nextMatchQuestion,
  answerMatchBonus, setMatchTeam, endMatch, leaveMatch, streamMatch, botBuzz, botAnswer, requestAnswerReview, resolveAnswerReview,
} from '../../../api/quizMatch';
import { AnswerResultPanel } from '../../trial/TrialSession';
import MatchComparison from '../../shared/MatchComparison';

// Mirrors the server's QUIZBOWL_BUZZ_ANSWER_MS. Only used to scale the
// countdown bar; the actual deadline comes from the server buzz event.
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
const QB_MATCH_CATEGORIES = ['Science', 'History', 'Literature', 'Geography', 'Math', 'Art', 'Music', 'Philosophy', 'Pop Culture', 'Mixed', 'Custom'];
const QB_MATCH_DIFFICULTIES = ['Easy', 'Medium', 'Hard', 'Tournament'];

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

// Optional integration props (group study sessions embed this component):
//   initialJoinCode — auto-join this match on mount instead of showing the
//                     create/join menu
//   embedded        — hosted inside another view (group SessionView): no
//                     create-new path, friendlier blocked states
//   onMatchEnd      — called with the final scores map when the match ends
//                     (the group session host persists them to the summary)
export default function QuizBowlMatch({ user, onExit, initialJoinCode = null, embedded = false, onMatchEnd = null, onMatchReplay = null }) {
  const { state } = useWindowManager();
  const [view, setView] = useState('menu');
  const [code, setCode] = useState('');
  const [joinCodeInput, setJoinCodeInput] = useState('');
  const [matchMode, setMatchMode] = useState('individual');
  const [questionSource, setQuestionSource] = useState('qbreader');
  const [category, setCategory] = useState('Mixed');
  const [customTopic, setCustomTopic] = useState('');
  const [setInstructions, setSetInstructions] = useState('');
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
        if (m.mode) setMatchMode(m.mode);
        setAnswerReview(m.activeAnswerReview || null);
        if (m.state === 'bonus' || m.state === 'bonus_reveal') {
          setBonusDeadline(m.bonus?.deadlineAt || null);
          setView('playing');
        } else if (m.state === 'playing' && m.currentQuestion) {
          setQuestion(m.currentQuestion);
          if (m.buzzWinner) {
            setBuzz({ userId: m.buzzWinner, buzzAt: m.buzzAt });
            // Resume the same countdown a reconnecting client missed.
            setAnswerDeadline((m.buzzAt || Date.now()) + (m.answerWindowMs || BUZZ_WINDOW_MS));
          } else {
            setAnswerDeadline(null);
          }
          setAnswerResult(null);
          setBonusResult(null);
          setBonusAnswer('');
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
      onTeamUpdated:   (m) => { setMatch(m); if (m?.mode) setMatchMode(m.mode); },
      onGenerating:   (m) => { setMatch(m); setView('generating'); },
      onStartFailed:  (data) => { setError(data.error || 'Failed to start match'); setMatch(data.match); setView('lobby'); },
      onQuestionStart: ({ text, startedAt, match: m }) => {
        setMatch(m);
        setQuestion({ text, startedAt });
        setBuzz(null);
        setAnswer('');
        setBonusAnswer(''); setBonusResult(null); setBonusDeadline(null);
        setAnswerResult(null);
        setAutoAdvanceDeadline(null);
        setAnswerDeadline(null);
        setLockedOut([]);
        setWrongFlash(null);
        setLastReviewableWrong(null);
        setAnswerReview(null);
        setReviewStatus(null);
        setReviewBusy(false);
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
      onBuzz: ({ userId, buzzAt, answerWindowMs }) => {
        setBuzz({ userId, buzzAt });
        setAnswerDeadline((buzzAt || Date.now()) + (answerWindowMs || BUZZ_WINDOW_MS));
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
      onWrongAnswer: ({ userId, answer: wrongAns, lockedOut: lock, questionStartedAt: newStart, scores, timedOut }) => {
        setBuzz(null);
        setAnswer('');
        setAnswerDeadline(null);
        setLockedOut(lock || []);
        if (newStart && question) setQuestion(q => q ? { ...q, startedAt: newStart } : q);
        setWrongFlash({ userId, answer: wrongAns, timedOut });
        if (userId === myId && wrongAns && !timedOut) {
          setLastReviewableWrong({ userId, answer: wrongAns, timedOut });
        }
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
        setAnswerDeadline(null);
        setAutoAdvanceDeadline(data.autoAdvanceInMs ? Date.now() + data.autoAdvanceInMs : null);
        setMatch(prev => prev ? { ...prev, players: prev.players.map(p => ({ ...p, score: data.scores[p.userId] || 0 })) } : prev);
        setMatch(prev => prev ? { ...prev, teamScores: data.teamScores || prev.teamScores } : prev);
        if (isHostRef.current) clearBotTimers();
      },
      onBonusStart: (data) => {
        if (data.match) setMatch(data.match);
        setBonusDeadline(data.bonus?.deadlineAt || null);
        setBonusResult(null); setBonusAnswer(''); setAnswerResult(null); setBuzz(null);
        setView('playing');
      },
      onBonusResult: (data) => {
        setBonusResult(data);
        setBonusDeadline(null);
        if (data.match) setMatch(data.match);
        else setMatch(prev => prev ? { ...prev, teamScores: data.teamScores || prev.teamScores } : prev);
      },
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
        setBonusAnswer(''); setBonusResult(null); setBonusDeadline(null);
        setAutoAdvanceDeadline(null); setAnswerDeadline(null); setWrongFlash(null); setLastReviewableWrong(null); setAnswerReview(null); setReviewStatus(null); setReviewBusy(false);
        if (cmp) setComparison(cmp);
        if (wasAbandoned) setAbandoned({ leftBy, reason });
        setView('finished');
        clearBotTimers();
        botEngRef.current.bots = [];
        try { onMatchEnd?.(scores || {}); } catch {}
      },
      onError: (err) => setError(err),
    });
    abortRef.current = abort;
    return () => { try { abort(); } catch {} };
  }, [code]);

  // Group-session embed: join the pre-created match immediately instead of
  // showing the create/join menu. The server's join endpoint is idempotent
  // for existing players, so the host (already on the roster) lands in the
  // lobby the same way.
  const autoJoinedRef = useRef(false);
  useEffect(() => {
    if (!initialJoinCode || autoJoinedRef.current) return;
    autoJoinedRef.current = true;
    (async () => {
      setBusy(true); setError(null);
      try {
        const c = initialJoinCode.toUpperCase();
        const res = await joinMatch(c);
        setCode(c);
        setMatch(res.match);
        setView('lobby');
      } catch (e) {
        setError(e.message || 'Could not join the match');
      }
      setBusy(false);
    })();
  }, [initialJoinCode]);

  async function handleCreate() {
    if (busy) return;
    setBusy(true); setError(null);
    try {
      const res = await createMatch({ mode: matchMode });
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
      bots = scaled.slice(0, botCount).map((b, i) => ({ id: b.id, name: b.name, team: matchMode === 'team' ? (i % 2 === 0 ? 'A' : 'B') : undefined, accuracy: b.accuracy, thinkMs: b.thinkMs }));
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
    try {
      await startMatch(code, {
        questionSource, category, difficulty, questionCount, revealSpeedMs, scoringFormat, bots,
        customTopic: category === 'Custom' ? customTopic.trim() : undefined,
        setInstructions: questionSource === 'ai' ? setInstructions.trim() : undefined,
      });
    }
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
    // Start the answer clock instantly; onBuzz refines it to the server time.
    setAnswerDeadline(Date.now() + BUZZ_WINDOW_MS);
    try { await buzzMatch(code); } catch { setBuzz(null); setAnswerDeadline(null); }
  }, [question, buzz, code, user?.id, lockedOut, myId]);

  async function handleSubmitAnswer() {
    if (!answer.trim()) return;
    try { await answerMatch(code, answer.trim()); } catch (e) { setError(e.message); }
  }

  async function handleSubmitBonus(pass = false) {
    if (!pass && !bonusAnswer.trim()) return;
    try {
      await answerMatchBonus(code, bonusAnswer.trim(), pass);
      setBonusAnswer('');
    } catch (e) { setError(e.message || 'Could not submit bonus answer'); }
  }

  async function handleSelectTeam(team, userId = myId) {
    try {
      const data = await setMatchTeam(code, team, userId);
      if (data.match) setMatch(data.match);
    } catch (e) { setError(e.message || 'Could not change teams'); }
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
      setReviewStatus('pending');
      setAutoAdvanceDeadline(null);
      setAnswerDeadline(null);
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
    setCode(''); setMatch(null); setQuestion(null); setBuzz(null); setAnswerResult(null);
    setAbandoned(null); setAnswerDeadline(null); setComparison(null); setAnswerReview(null); setReviewStatus(null); setReviewBusy(false);
    setLastReviewableWrong(null);
    setView('menu');
    onExit?.();
  }

  // Keep refs current so the keydown listener (registered only on view change)
  // always reads the latest state without stale-closure gaps from re-registration.
  const _mpBuzzRef = useRef(buzz);          _mpBuzzRef.current = buzz;
  const _mpHandleBuzzRef = useRef(handleBuzz); _mpHandleBuzzRef.current = handleBuzz;
  const _mpIsActiveRef = useRef(false);     _mpIsActiveRef.current = state.windows[state.activeWindowId]?.appId === 'quizbowl';

  useEffect(() => {
    if (view !== 'playing') return;
    function onKey(e) {
      if (!_mpIsActiveRef.current) return;
      if (e.key === ' ' && !_mpBuzzRef.current) { e.preventDefault(); _mpHandleBuzzRef.current(); }
    }
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [view]);

  const iBuzzed = buzz && buzz.userId === myId;
  const isHost = match?.hostId === myId;

  // ============ MENU ============
  if (view === 'menu' && initialJoinCode) {
    // Embedded auto-join in flight (or blocked: match already started/full).
    return (
      <div className="h-full flex items-center justify-center">
        <div className="max-w-sm mx-auto text-center px-6 py-8 rounded-2xl border border-blue-500/[0.15] bg-white/[0.03]">
          {error ? (
            <>
              <p className="text-sm text-rose-300 mb-1">{error}</p>
              <p className="text-[11.5px] text-blue-300/50 mb-4">The game may have already started — you can join the next one.</p>
              <button onClick={onExit} className="px-4 py-2 rounded-xl bg-blue-500 text-white text-sm font-semibold hover:bg-blue-400 transition-colors">
                Back
              </button>
            </>
          ) : (
            <>
              <Loader2 size={20} className="animate-spin text-blue-300/70 mx-auto mb-2" />
              <p className="text-sm text-blue-200/80">Joining match {initialJoinCode}…</p>
            </>
          )}
        </div>
      </div>
    );
  }
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

          <p className="text-[11px] font-bold uppercase tracking-[0.16em] text-white/40">Game type</p>
          <div className="grid grid-cols-2 gap-2">
            <SetupTile active={matchMode === 'individual'} icon={<Zap size={14} />} label="Open match" sub="Individual scoring" onClick={() => setMatchMode('individual')} />
            <SetupTile active={matchMode === 'team'} icon={<Users size={14} />} label="Team scrimmage" sub="Tossups + 3-part bonuses" onClick={() => { setMatchMode('team'); setScoringFormat('standard'); }} />
          </div>

          <div className="grid grid-cols-2 gap-2">
            <SetupTile active={questionSource === 'qbreader'} icon={<BookOpen size={14} />} label="Past QB" sub="qbreader.org" onClick={() => setQuestionSource('qbreader')} />
            <SetupTile active={questionSource === 'ai'} icon={<Sparkles size={14} />} label="AI" sub="Gemini" onClick={() => setQuestionSource('ai')} />
          </div>

          <div className="flex flex-wrap gap-1.5">
            {QB_MATCH_CATEGORIES.map(c => (
              <SetupPill key={c} active={category === c} onClick={() => { setCategory(c); if (c === 'Custom') setQuestionSource('ai'); }}>{c}</SetupPill>
            ))}
          </div>
          {category === 'Custom' && (
            <input
              type="text" value={customTopic} maxLength={200}
              onChange={e => setCustomTopic(e.target.value)}
              placeholder="Any topic - the AI writes the tossups on it"
              className="w-full px-3 py-2 rounded-lg bg-blue-500/[0.06] border border-blue-500/25 text-[12.5px] text-blue-100 placeholder:text-blue-300/35 focus:outline-none focus:border-blue-400/60 transition-colors"
            />
          )}
          {questionSource === 'ai' && (
            <div>
              <p className="text-[11px] font-bold uppercase tracking-[0.16em] text-white/40 mb-1.5">Set instructions</p>
              <textarea
                value={setInstructions}
                onChange={e => setSetInstructions(e.target.value)}
                placeholder="e.g. Focus on 20th-century literature, avoid sports, make answers canon-friendly..."
                rows={2}
                className="w-full px-3 py-2.5 rounded-lg border border-white/[0.08] bg-white/[0.04] text-[12px] text-white/80 placeholder-white/20 resize-none outline-none focus:border-blue-400/50 focus:ring-2 focus:ring-blue-400/20 transition-colors"
              />
            </div>
          )}

          <div className="grid grid-cols-4 gap-1.5">
            {QB_MATCH_DIFFICULTIES.map(d => <SetupPill key={d} active={difficulty === d} onClick={() => setDifficulty(d)}>{d}</SetupPill>)}
          </div>

          <p className="text-[11px] font-bold uppercase tracking-[0.16em] text-white/40 mt-1">Scoring Format</p>
          <div className="grid grid-cols-2 gap-1.5">
            {QB_SCORING_FORMATS.map(f => (
              <button key={f.id} onClick={() => setScoringFormat(f.id)}
                className={`rounded-lg border p-2.5 text-left transition-all focus:outline-none ${
                  scoringFormat === f.id
                    ? 'bg-blue-500/[0.18] text-white border-blue-400/[0.40]'
                    : 'bg-white/[0.02] border-white/[0.06] text-white/75 hover:border-white/[0.14] hover:bg-white/[0.05]'
                }`}>
                <div className="text-[12px] font-semibold leading-tight">{f.label}</div>
                <div className="text-[10px] text-white/35 leading-tight mt-0.5">{f.desc}</div>
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
    const teamReady = match?.mode !== 'team' || ['A', 'B'].every(t => (match?.players || []).some(p => p.team === t));
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
              {match?.mode === 'team' ? ['A', 'B'].map(team => (
                <div key={team} className="rounded-xl border border-white/[0.07] bg-white/[0.025] p-2.5">
                  <div className="flex items-center gap-2 mb-1.5">
                    <span className={`w-2 h-2 rounded-full ${team === 'A' ? 'bg-blue-400' : 'bg-amber-400'}`} />
                    <span className="text-[11px] font-bold text-white/75">{match.teamNames?.[team] || `Team ${team}`}</span>
                    <span className="text-[9px] text-white/30 ml-auto">{(match.players || []).filter(p => p.team === team).length}/4</span>
                  </div>
                  <div className="space-y-1">
                    {(match.players || []).filter(p => p.team === team).map(p => (
                      <div key={p.userId} className="flex items-center gap-2">
                        <div className={`w-5 h-5 rounded-full flex items-center justify-center text-[9px] font-bold ${p.isBot ? 'bg-white/[0.06] text-white/30' : team === 'A' ? 'bg-blue-500/15 text-blue-300' : 'bg-amber-500/15 text-amber-300'}`}>{p.isBot ? <Bot size={10} /> : (p.name || '?')[0]?.toUpperCase()}</div>
                        <span className="text-[12px] text-gray-800 dark:text-gray-200 flex-1 truncate">{p.name}</span>
                        {!p.isBot && p.userId === myId && <span className="text-[9px] text-white/35">you</span>}
                        {!p.isBot && p.userId !== myId && <button onClick={() => handleSelectTeam(team === 'A' ? 'B' : 'A', p.userId)} className="text-[9px] text-white/25 hover:text-blue-300">Move</button>}
                      </div>
                    ))}
                  </div>
                  {(!match.players || !match.players.some(p => p.userId === myId && p.team === team)) && !match.players?.find(p => p.userId === myId)?.isBot && (
                    <button onClick={() => handleSelectTeam(team)} className="mt-2 w-full rounded-lg border border-white/[0.07] bg-white/[0.03] py-1.5 text-[10px] font-semibold text-white/45 hover:text-white/75">Join {match.teamNames?.[team] || `Team ${team}`}</button>
                  )}
                </div>
              )) : (match?.players || []).map(p => (
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

          {/* Group study matches are pinned to their material — no category. */}
          {match?.studyTitle && (
            <div className="mb-4 flex items-center gap-2 rounded-xl border border-blue-500/25 bg-blue-500/[0.07] px-3 py-2.5">
              <BookOpen size={14} className="text-blue-300/80 shrink-0" />
              <div className="min-w-0">
                <p className="text-[10px] font-bold uppercase tracking-[0.15em] text-blue-400/70">Questions from</p>
                <p className="text-[12.5px] text-blue-100 font-medium truncate">{match.studyTitle}</p>
              </div>
            </div>
          )}

          {/* Settings - host only, at least 2 players present (or bots will fill) */}
          {(fillWithBots || !waiting) && isHost && (
            <>
              {!match?.studyTitle && (
                <>
                  <div className="mb-3 grid grid-cols-2 gap-2">
                    <SetupTile active={questionSource === 'qbreader'} icon={<BookOpen size={14} />} label="Past QB" sub="qbreader.org" onClick={() => setQuestionSource('qbreader')} />
                    <SetupTile active={questionSource === 'ai'} icon={<Sparkles size={14} />} label="AI" sub="Gemini" onClick={() => setQuestionSource('ai')} />
                  </div>
                  <div className="mb-3 space-y-2">
                    <div className="flex flex-wrap gap-1.5">
                      {QB_MATCH_CATEGORIES.map(c => (
                        <SetupPill key={c} active={category === c} onClick={() => { setCategory(c); if (c === 'Custom') setQuestionSource('ai'); }}>{c}</SetupPill>
                      ))}
                    </div>
                    {category === 'Custom' && (
                      <input
                        type="text" value={customTopic} maxLength={200}
                        onChange={e => setCustomTopic(e.target.value)}
                        placeholder="Any topic - the AI writes the tossups on it"
                        className="w-full px-3 py-2 rounded-lg bg-blue-500/[0.06] border border-blue-500/25 text-[12.5px] text-blue-100 placeholder:text-blue-300/35 focus:outline-none focus:border-blue-400/60 transition-colors"
                      />
                    )}
                    {questionSource === 'ai' && (
                      <div>
                        <p className="text-[11px] font-bold uppercase tracking-[0.16em] text-white/40 mb-1.5">Set instructions</p>
                        <textarea
                          value={setInstructions}
                          onChange={e => setSetInstructions(e.target.value)}
                          placeholder="e.g. Focus on 20th-century literature, avoid sports, make answers canon-friendly..."
                          rows={2}
                          className="w-full px-3 py-2.5 rounded-lg border border-white/[0.08] bg-white/[0.04] text-[12px] text-white/80 placeholder-white/20 resize-none outline-none focus:border-blue-400/50 focus:ring-2 focus:ring-blue-400/20 transition-colors"
                        />
                      </div>
                    )}
                  </div>
                </>
              )}
              <div className="mb-3 grid grid-cols-4 gap-1.5">
                {QB_MATCH_DIFFICULTIES.map(d => <SetupPill key={d} active={difficulty === d} onClick={() => setDifficulty(d)}>{d}</SetupPill>)}
              </div>
              <p className="text-[11px] font-bold uppercase tracking-[0.16em] text-white/40 mb-2">Scoring Format</p>
              <div className="mb-3 grid grid-cols-2 gap-1.5">
                {QB_SCORING_FORMATS.map(f => (
                  <button key={f.id} onClick={() => setScoringFormat(f.id)}
                    className={`rounded-lg border p-2.5 text-left transition-all focus:outline-none ${
                      scoringFormat === f.id
                        ? 'bg-blue-500/[0.18] text-white border-blue-400/[0.40]'
                        : 'bg-white/[0.02] border-white/[0.06] text-white/75 hover:border-white/[0.14] hover:bg-white/[0.05]'
                    }`}>
                    <div className="text-[12px] font-semibold leading-tight">{f.label}</div>
                    <div className="text-[10px] text-white/35 leading-tight mt-0.5">{f.desc}</div>
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
              disabled={(waiting && !fillWithBots) || (match?.mode === 'team' && !teamReady) || (!match?.studyTitle && category === 'Custom' && !customTopic.trim())}
              className="w-full py-3 rounded-xl bg-blue-500 text-white text-sm font-semibold border border-blue-400/40 hover:bg-blue-400 disabled:opacity-40 disabled:shadow-none flex items-center justify-center gap-2 transition-all"
            >
              <Play size={14} />
              {match?.mode === 'team' && !teamReady
                ? 'Place players on both teams…'
                : waiting && !fillWithBots
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
            hint={`${(match?.questionCount || questionCount)} ${(match?.questionSource || questionSource) === 'ai' ? 'Gemini' : 'Past QB'} · ${match?.customTopic || match?.category || category} · ${match?.difficulty || difficulty}`}
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
      bonusAnswer={bonusAnswer} setBonusAnswer={setBonusAnswer} bonusResult={bonusResult} bonusDeadline={bonusDeadline}
      onBuzz={handleBuzz} onSubmitAnswer={handleSubmitAnswer} onNext={handleNext}
      onSubmitBonus={handleSubmitBonus}
      onLeave={handleLeave} onEndMatch={handleEndMatch}
      iBuzzed={iBuzzed} isHost={isHost} myId={myId}
      lockedOut={lockedOut} wrongFlash={wrongFlash} lastReviewableWrong={lastReviewableWrong}
      answerReview={answerReview} reviewStatus={reviewStatus} reviewBusy={reviewBusy}
      onRequestReview={handleRequestReview} onResolveReview={handleResolveReview}
      autoAdvanceDeadline={autoAdvanceDeadline}
      answerDeadline={answerDeadline}
      revealSpeedMs={match.revealSpeedMs || 140}
    />;
  }

  // ============ FINISHED ============
  if (view === 'finished') {
    const sorted = [...(match?.players || [])].sort((a, b) => (b.score || 0) - (a.score || 0));
    const winner = sorted[0];
    const amIWinner = winner?.userId === myId;
    const teamMode = match?.mode === 'team';
    const teamScores = match?.teamScores || { A: 0, B: 0 };
    const winningTeam = teamMode ? (teamScores.A === teamScores.B ? null : teamScores.A > teamScores.B ? 'A' : 'B') : null;
    const opponentAbandoned = !!abandoned && abandoned.leftBy !== myId;
    return (
      <div className="h-full overflow-y-auto bg-transparent">
        <div className="p-5 space-y-4 text-center">
          <Trophy size={36} className={`mx-auto ${amIWinner && !opponentAbandoned ? 'text-amber-400/70' : 'text-white/20'}`} />
          <p className="text-[17px] font-bold text-white/80">
            {opponentAbandoned ? 'Opponent left' : teamMode ? (winningTeam ? `${match.teamNames?.[winningTeam] || `Team ${winningTeam}`} won` : 'Team tie') : amIWinner ? 'You won' : winner ? `${winner.name} won` : 'Match over'}
          </p>
          {opponentAbandoned && (
            <p className="text-[11px] text-white/30 -mt-2">
              {abandoned?.reason === 'disconnect' ? 'Disconnected mid-game.' : 'Left mid-game.'}
            </p>
          )}
          {teamMode && <div className="grid grid-cols-2 gap-2 text-left">{['A', 'B'].map(team => <div key={team} className={`rounded-2xl border p-3 ${winningTeam === team ? 'border-amber-400/30 bg-amber-400/[0.08]' : 'border-white/[0.06] bg-white/[0.03]'}`}><p className="text-[10px] uppercase tracking-wider text-white/40">{match.teamNames?.[team] || `Team ${team}`}</p><p className="text-[24px] font-bold tabular-nums text-white/85 mt-1">{teamScores[team] || 0}</p></div>)}</div>}
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
            <div className="pt-1">
              <p className="text-[10px] font-bold uppercase tracking-[0.15em] text-blue-400/70 mb-2 text-left">Compare &amp; contrast</p>
              <MatchComparison comparison={comparison} myUserId={myId} />
            </div>
          )}
          {onMatchReplay && code && (
            <button onClick={() => onMatchReplay(code)}
              className="w-full py-2.5 rounded-2xl border border-blue-500/30 bg-blue-500/[0.07] text-[13px] font-medium text-blue-300/80 hover:text-blue-200 hover:border-blue-500/50 transition-colors">
              View Replay
            </button>
          )}
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

// ===== PLAYER CARD (sidebar scoreboard) =====
// Exported so the match replay (QuizBowlApp) renders the exact same
// scoreboard as the live game.
export function PlayerCard({ player, isMe, buzz, lockedOut, answerResult, maxScore }) {
  const score = player.score || 0;
  const pct = maxScore > 0 ? Math.min(100, (score / maxScore) * 100) : 0;

  const isAnswering = buzz && buzz.userId === player.userId && !answerResult;
  const gotIt = answerResult?.userId === player.userId && answerResult.correct;
  const isLocked = lockedOut.includes(player.userId);

  const dotClass = isAnswering
    ? 'bg-amber-400 animate-pulse'
    : gotIt
    ? 'bg-emerald-400'
    : isLocked
    ? 'bg-rose-400/60'
    : 'bg-white/15';

  const statusText = isAnswering ? 'Answering…'
    : gotIt ? '✓ Correct'
    : isLocked ? 'Locked out'
    : 'Listening';

  return (
    <div className={`rounded-xl border p-2.5 ${isMe ? 'bg-blue-500/[0.08] border-blue-500/30' : 'bg-white/[0.04] border-white/[0.08]'}`}>
      <div className="flex items-center gap-1.5 mb-1">
        <span className={`w-1.5 h-1.5 rounded-full flex-shrink-0 ${dotClass}`} />
        <span className={`font-semibold text-[11px] flex-1 truncate ${isMe ? 'text-blue-300' : 'text-white/65'}`}>
          {player.name}
        </span>
        <span className={`text-xs font-bold tabular-nums ${isMe ? 'text-blue-300' : 'text-white/60'}`}>
          {score}
        </span>
      </div>
      <div className="h-1 bg-white/[0.06] rounded-full overflow-hidden mb-1.5">
        <div
          className={`h-full rounded-full transition-all duration-700 ${isMe ? 'bg-blue-400' : 'bg-white/30'}`}
          style={{ width: `${pct}%` }}
        />
      </div>
      <div className="text-white/35 text-[10px]">{statusText}</div>
    </div>
  );
}

function TeamBonusView({ match, bonusAnswer, setBonusAnswer, bonusResult, bonusDeadline, onSubmitBonus, onNext, onLeave, isHost, myId }) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    if (!bonusDeadline) return undefined;
    const id = setInterval(() => setNow(Date.now()), 100);
    return () => clearInterval(id);
  }, [bonusDeadline]);
  const bonus = match.bonus;
  const activeTeam = bonus?.team || match.pendingBonusTeam;
  const me = match.players?.find(p => p.userId === myId);
  const isControlling = me?.team === activeTeam;
  const msLeft = bonusDeadline ? Math.max(0, bonusDeadline - now) : 0;
  const seconds = Math.ceil(msLeft / 1000);
  const pct = bonusDeadline ? Math.max(0, Math.min(100, msLeft / (match.bonusWindowMs || 15000) * 100)) : 0;
  const teamName = match.teamNames?.[activeTeam] || `Team ${activeTeam || ''}`;
  const scores = match.teamScores || { A: 0, B: 0 };
  return (
    <div className="flex flex-col h-full min-h-0 bg-transparent">
      <div className="flex items-center gap-2 px-4 py-2.5 border-b border-white/[0.04]">
        <Users size={14} className="text-amber-300/80" />
        <span className="text-[13px] font-bold text-white/85">Team bonus</span>
        <span className="text-[10px] text-white/35">Q{(match.currentIdx || 0) + 1}/{match.totalQuestions}</span>
        <div className="flex-1" />
        <span className="text-[12px] font-bold text-blue-300">{match.teamNames?.A || 'Blue'} {scores.A}</span>
        <span className="text-white/20">·</span>
        <span className="text-[12px] font-bold text-amber-300">{match.teamNames?.B || 'Orange'} {scores.B}</span>
        <button onClick={onLeave} aria-label="Leave match" className="text-white/20 hover:text-rose-400/60 transition-colors"><LogOut size={12} /></button>
      </div>
      <div className="flex-1 min-h-0 overflow-y-auto p-5">
        {bonus ? (
          <div className="max-w-2xl mx-auto space-y-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-[10px] font-bold uppercase tracking-[0.16em] text-amber-300/70">{teamName} confers</p>
                <p className="text-[12px] text-white/45">Part {(bonus.partIndex || 0) + 1} of {bonus.totalParts || 3} · {bonus.value || 10} points</p>
              </div>
              {bonusDeadline && <span className={`text-[18px] font-bold tabular-nums ${seconds <= 3 ? 'text-rose-300' : 'text-amber-200'}`}>{seconds}s</span>}
            </div>
            <div className="h-1 rounded-full bg-white/[0.06] overflow-hidden"><div className={`h-full ${seconds <= 3 ? 'bg-rose-400' : 'bg-amber-400'} transition-all`} style={{ width: `${pct}%` }} /></div>
            <div className="rounded-xl border border-amber-400/20 bg-amber-400/[0.06] p-4">
              <p className="text-[11px] text-amber-200/70 mb-3">{bonus.leadin}</p>
              <p className="text-[16px] leading-relaxed text-white/90">{bonus.part}</p>
            </div>
            {bonusResult ? (
              <div className={`rounded-xl border p-4 ${bonusResult.correct ? 'border-emerald-400/25 bg-emerald-400/[0.08]' : 'border-rose-400/20 bg-rose-400/[0.06]'}`}>
                <p className={`text-[12px] font-semibold ${bonusResult.correct ? 'text-emerald-200' : 'text-rose-200'}`}>{bonusResult.correct ? `+${bonusResult.points} · Correct` : bonusResult.timedOut ? 'Time expired' : 'No points'}</p>
                <p className="text-[13px] text-white/80 mt-1">Answer: <strong>{bonusResult.correctAnswer}</strong></p>
              </div>
            ) : isControlling && match.state === 'bonus' ? (
              <div className="flex gap-2">
                <input autoFocus value={bonusAnswer} onChange={e => setBonusAnswer(e.target.value)} onKeyDown={e => e.key === 'Enter' && onSubmitBonus(false)} placeholder="Team answer…" className="flex-1 rounded-xl border border-amber-400/30 bg-white/[0.04] px-3 py-3 text-sm text-white/85 placeholder-white/25 outline-none focus:border-amber-300/60" />
                <button onClick={() => onSubmitBonus(false)} disabled={!bonusAnswer.trim()} className="rounded-xl bg-amber-500 px-4 py-3 text-sm font-semibold text-black disabled:opacity-30">Submit</button>
                <button onClick={() => onSubmitBonus(true)} className="rounded-xl border border-white/[0.10] px-3 py-3 text-sm text-white/50 hover:text-white/80">Pass</button>
              </div>
            ) : (
              <p className="rounded-xl border border-white/[0.07] bg-white/[0.03] px-3 py-3 text-center text-[12px] text-white/40">{isControlling ? 'Bonus starting…' : `${teamName} is conferring…`}</p>
            )}
            {isHost && (bonusResult || match.state === 'reveal') && <button onClick={onNext} className="w-full rounded-xl border border-white/[0.08] bg-white/[0.03] py-2.5 text-[12px] font-semibold text-white/55 hover:text-white/80">Next →</button>}
          </div>
        ) : (
          <div className="h-full flex items-center justify-center text-center"><div><Loader2 size={20} className="animate-spin text-amber-300/60 mx-auto mb-2" /><p className="text-[13px] text-white/50">Preparing the bonus…</p></div></div>
        )}
      </div>
    </div>
  );
}

// ===== PLAYING VIEW =====
function PlayingView({ match, question, buzz, answerResult, answer, setAnswer, bonusAnswer, setBonusAnswer, bonusResult, bonusDeadline, onBuzz, onSubmitAnswer, onSubmitBonus, onNext, onLeave, onEndMatch, iBuzzed, isHost, myId, lockedOut = [], wrongFlash, lastReviewableWrong, answerReview, reviewStatus, reviewBusy, onRequestReview, onResolveReview, autoAdvanceDeadline, answerDeadline, revealSpeedMs }) {
  if (match?.mode === 'team' && ['bonus', 'bonus_reveal', 'reveal'].includes(match.state) && (match.bonus || match.pendingBonusTeam || bonusResult)) {
    return <TeamBonusView match={match} bonusAnswer={bonusAnswer} setBonusAnswer={setBonusAnswer} bonusResult={bonusResult} bonusDeadline={bonusDeadline} onSubmitBonus={onSubmitBonus} onNext={onNext} onLeave={onLeave} isHost={isHost} myId={myId} />;
  }
  const reviewPending = answerReview?.status === 'pending';
  const frozen = !!buzz || !!answerResult || reviewPending;
  const frozenAt = buzz?.buzzAt || answerResult?.buzzAt || null;
  const { revealed, wordIndex, totalWords } = useWordReveal(question?.text || '', question?.startedAt || 0, revealSpeedMs, frozen, frozenAt);

  // Live answer-clock tick: only runs while a buzz is awaiting an answer.
  const [nowTick, setNowTick] = useState(() => Date.now());
  const countingDown = !!answerDeadline && !!buzz && !answerResult;
  useEffect(() => {
    if (!countingDown) return;
    const id = setInterval(() => setNowTick(Date.now()), 100);
    return () => clearInterval(id);
  }, [countingDown, answerDeadline]);
  // Clamp to the window so minor client/server clock skew never shows "10s".
  const answerMsLeft = countingDown ? Math.max(0, Math.min(BUZZ_WINDOW_MS, answerDeadline - nowTick)) : null;
  const answerSecs = answerMsLeft != null ? Math.ceil(answerMsLeft / 1000) : null;
  const answerPct = answerMsLeft != null ? Math.max(0, Math.min(100, (answerMsLeft / BUZZ_WINDOW_MS) * 100)) : 0;
  const answerUrgent = answerMsLeft != null && answerMsLeft <= 3000;
  const timeUp = answerMsLeft === 0;

  if (!match || !Array.isArray(match.players)) {
    return <div className="p-5 text-center text-[12px] text-white/30 bg-transparent h-full"><InlineProgress active /> Loading…</div>;
  }

  const players = match.players || [];
  const buzzerName = buzz ? (players.find(p => p.userId === buzz.userId)?.name || 'Opponent') : '';
  const wrongName = wrongFlash ? (players.find(p => p.userId === wrongFlash.userId)?.name || 'Opponent') : '';
  const iAmLocked = lockedOut.includes(myId);
  const myScore = players.find(p => p.userId === myId)?.score || 0;
  const myTeam = players.find(p => p.userId === myId)?.team || null;
  const teamScores = match.teamScores || { A: 0, B: 0 };
  const maxScore = Math.max(1, ...players.map(p => p.score || 0));
  const progressPct = totalWords > 0 ? Math.min(100, ((wordIndex + 1) / totalWords) * 100) : 0;

  const resultCorrect = answerResult
    ? (answerResult.correct ? true : (answerResult.timeout || !answerResult.userId) ? null : false)
    : null;
  const resultMeta = answerResult
    ? (answerResult.correct
        ? (answerResult.userId === myId ? 'Correct!' : `${buzzerName} got it`)
        : (answerResult.timeout || !answerResult.userId) ? 'No one got it'
        : (answerResult.userId === myId ? 'Wrong!' : `${buzzerName} was wrong`))
    : '';
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
    <div className="flex flex-col h-full min-h-0 bg-transparent">
      {/* Header — matches TrialSession style */}
      <div className="flex items-center gap-2 px-4 py-2.5 border-b border-white/[0.04] flex-shrink-0">
        <Zap size={14} className="text-white/50" />
        <span className="text-[13px] font-bold text-white tabular-nums">
          Q{(match.currentIdx || 0) + 1}/{match.totalQuestions}
        </span>
        <span className="text-[9px] font-bold uppercase tracking-wider px-1.5 py-0.5 rounded-full bg-white/[0.08] text-white/50">
          Match
        </span>
        <div className="flex-1" />
        {match.mode === 'team' ? (
          <span className="text-[11px] font-bold tabular-nums text-white/60">{match.teamNames?.[myTeam] || 'Your team'} · {teamScores[myTeam] || 0}</span>
        ) : <span className={`text-[12px] font-bold tabular-nums ${myScore > 0 ? 'text-emerald-400' : 'text-white/40'}`}>{myScore}</span>}
        {isHost && (
          <button onClick={onEndMatch} title="End match early"
            className="inline-flex items-center gap-1 text-[10px] font-semibold text-rose-400/70 hover:text-rose-300 px-2 py-1 rounded-md border border-rose-500/20 hover:border-rose-500/40 bg-rose-500/[0.05] transition-colors">
            <Flag size={10} /> End
          </button>
        )}
        <button onClick={onLeave} className="text-white/20 hover:text-rose-400/60 transition-colors"><LogOut size={12} /></button>
      </div>

      <div className="flex flex-1 min-h-0">
        {/* Question + action bar */}
        <div className="flex-1 flex flex-col min-h-0">
          <div className="flex-1 overflow-y-auto p-5">
            <div className="min-h-[120px]">
              <p className="text-[15px] leading-relaxed text-white/90 font-light">
                {revealed}
                {!frozen && wordIndex < totalWords - 1 && (
                  <span className="inline-block w-0.5 h-4 bg-white/30 animate-pulse ml-1 align-middle rounded-sm" />
                )}
              </p>
            </div>
          </div>

          {/* Action bar */}
          <div className="px-4 py-3 border-t border-white/[0.04] flex-shrink-0 space-y-2">
            {wrongFlash && !buzz && !answerResult && (
              <div className="px-3 py-2 rounded-2xl bg-rose-500/[0.08] border border-rose-500/15 text-[11px] text-rose-400/70 text-center space-y-1.5">
                <p>
                  {wrongFlash.userId === myId ? 'Wrong' : `${wrongName} was wrong`}
                  {wrongFlash.timedOut ? ' — ran out of time' : wrongFlash.answer ? ` — "${wrongFlash.answer}"` : ''} · continues
                </p>
                {canRequestReview && (
                  <button onClick={onRequestReview} className="rounded-lg border border-amber-400/25 bg-amber-400/[0.10] px-2 py-1 text-[10px] font-semibold text-amber-200 hover:border-amber-300/45">
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
              <>
                <button onClick={onBuzz}
                  className="w-full py-4 rounded-2xl bg-blue-600 hover:bg-blue-500 text-white text-[15px] font-bold uppercase tracking-[0.15em] active:scale-[0.98] transition-all">
                  BUZZ
                </button>
                <p className="text-[10px] text-white/35 text-center">Space to buzz</p>
              </>
            )}
            {!buzz && !answerResult && iAmLocked && (
              <div className="w-full rounded-2xl border border-white/[0.05] bg-white/[0.02] px-3 py-3 text-center text-[11px] text-white/30 space-y-2">
                <p>Locked out · wait for next question</p>
                {canRequestReview && (
                  <button onClick={onRequestReview} disabled={reviewBusy}
                    className="rounded-lg border border-amber-400/25 bg-amber-400/[0.10] px-3 py-1.5 text-[11px] font-semibold text-amber-100/85 hover:border-amber-300/45 disabled:opacity-40">
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
                  <span className={`text-[13px] font-bold tabular-nums ${answerUrgent ? 'text-rose-300' : 'text-white/70'}`}>{answerSecs ?? 0}s</span>
                </div>
                <div className="h-1 rounded-full bg-white/[0.06] overflow-hidden">
                  <div className={`h-full transition-all duration-100 ${answerUrgent ? 'bg-rose-500' : 'bg-amber-400'}`} style={{ width: `${answerPct}%` }} />
                </div>
                <div className="flex gap-2">
                  <input
                    autoFocus value={answer} onChange={e => setAnswer(e.target.value)}
                    onKeyDown={e => e.key === 'Enter' && answer.trim() && !timeUp && onSubmitAnswer()}
                    placeholder={timeUp ? "Time's up…" : 'Answer…'}
                    disabled={timeUp}
                    className="flex-1 px-4 py-3 rounded-2xl border border-blue-500/40 bg-white/[0.04] text-[14px] text-white/85 placeholder-white/20 outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-500/25 transition-colors disabled:opacity-50"
                  />
                  <button onClick={onSubmitAnswer} disabled={!answer.trim() || timeUp}
                    className="px-5 py-3 rounded-2xl bg-blue-500 hover:bg-blue-400 text-white text-[13px] font-semibold disabled:opacity-30 transition-colors">
                    →
                  </button>
                </div>
              </div>
            )}
            {buzz && !answerResult && !iBuzzed && (
              <div className="w-full py-3 rounded-2xl border border-white/[0.05] bg-white/[0.02] text-center text-[11px] text-white/30 inline-flex items-center justify-center gap-2">
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
                  correct={resultCorrect}
                  officialAnswer={answerResult.correctAnswer}
                  meta={resultMeta}
                />
                {canRequestReview && (
                  <button onClick={onRequestReview} disabled={reviewBusy}
                    className="w-full py-2 rounded-2xl border border-amber-400/25 bg-amber-400/[0.08] text-[12px] font-semibold text-amber-100/80 hover:border-amber-300/45 disabled:opacity-40 transition-colors">
                    {reviewBusy ? 'Sending review…' : 'I was right'}
                  </button>
                )}
                {!reviewPending && <AutoAdvanceCountdown deadline={autoAdvanceDeadline} isHost={isHost} onNext={onNext} />}
              </>
            )}
          </div>
        </div>

        {/* Sidebar — player scorecards, matches TrialSession sidebar */}
        <div className="w-44 flex-shrink-0 border-l border-white/[0.04] p-3 flex flex-col gap-1.5 overflow-y-auto">
          <div className="flex items-center gap-1.5 mb-1 flex-shrink-0">
            <Users size={11} className="text-white/25" />
            <span className="text-[10px] font-semibold uppercase tracking-wider text-white/25">
              Match · {players.length}P
            </span>
          </div>
          {match.mode === 'team' && (
            <div className="grid grid-cols-2 gap-1.5 mb-1">
              {['A', 'B'].map(team => <div key={team} className={`rounded-lg border px-2 py-1.5 ${myTeam === team ? 'border-blue-400/30 bg-blue-500/[0.08]' : 'border-white/[0.06] bg-white/[0.02]'}`}><p className="text-[9px] text-white/35 truncate">{match.teamNames?.[team] || `Team ${team}`}</p><p className="text-[15px] font-bold tabular-nums text-white/75">{teamScores[team] || 0}</p></div>)}
            </div>
          )}
          {players.map(p => (
            <PlayerCard
              key={p.userId}
              player={p}
              isMe={p.userId === myId}
              buzz={buzz}
              lockedOut={lockedOut}
              answerResult={answerResult}
              maxScore={maxScore}
            />
          ))}
          <div className="mt-auto pt-2 border-t border-white/[0.04] flex-shrink-0">
            <div className="flex justify-between text-[10px] text-white/25 mb-1">
              <span>Read</span><span>{Math.round(progressPct)}%</span>
            </div>
            <div className="h-1 bg-white/[0.05] rounded-full overflow-hidden">
              <div className="h-full bg-white/20 rounded-full transition-all" style={{ width: `${progressPct}%` }} />
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

function AnswerReviewPanel({ review, busy, onResolve }) {
  return (
    <div className="rounded-2xl border border-amber-400/25 bg-amber-400/[0.07] p-3 text-left">
      <div className="flex items-start justify-between gap-3 mb-2">
        <div>
          <p className="text-[11px] font-bold uppercase tracking-[0.14em] text-amber-200/70">Verify answer</p>
          <p className="text-[12px] text-white/55">{review.requesterName} says they were right.</p>
        </div>
      </div>
      <p className="max-h-24 overflow-y-auto rounded-xl border border-white/[0.06] bg-black/15 p-2 text-[12px] leading-relaxed text-white/75">
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
          className="rounded-xl border border-white/[0.08] bg-white/[0.04] px-3 py-2 text-[12px] font-semibold text-white/55 hover:bg-white/[0.07] disabled:opacity-40">
          Keep wrong
        </button>
        <button onClick={() => onResolve(review.id, true)} disabled={busy}
          className="rounded-xl border border-emerald-400/30 bg-emerald-400/[0.12] px-3 py-2 text-[12px] font-semibold text-emerald-100 hover:bg-emerald-400/[0.18] disabled:opacity-40">
          Mark right
        </button>
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

function SetupTile({ active, icon, label, sub, onClick }) {
  return (
    <button onClick={onClick}
      className={`text-left rounded-2xl border p-3 transition-all backdrop-blur-sm ${
        active
          ? 'border-blue-400/45 bg-blue-500/15 text-white shadow-[inset_0_1px_0_rgba(255,255,255,0.18),0_0_14px_rgba(59,130,246,0.25)]'
          : 'border-white/[0.08] bg-white/[0.03] text-white/60 hover:bg-white/[0.07] hover:text-white/80'
      }`}>
      <div className="flex items-center gap-1.5 mb-0.5">
        {icon}
        <p className="text-[12px] font-bold">{label}</p>
      </div>
      {sub && <p className="text-[10px] opacity-55">{sub}</p>}
    </button>
  );
}

function SetupPill({ active, onClick, children }) {
  return (
    <button onClick={onClick}
      className={`px-3 py-1.5 rounded-xl text-[11px] font-semibold transition-all whitespace-nowrap backdrop-blur-sm ${
        active
          ? 'bg-blue-500/20 text-white border border-blue-400/50 shadow-[inset_0_1px_0_rgba(255,255,255,0.18),0_0_12px_rgba(59,130,246,0.28)]'
          : 'bg-white/[0.05] border border-white/[0.08] text-white/55 hover:bg-white/[0.09] hover:text-white/80'
      }`}>
      {children}
    </button>
  );
}
