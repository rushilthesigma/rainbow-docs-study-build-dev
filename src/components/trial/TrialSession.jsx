import { useState, useEffect, useRef } from 'react';
import { Zap, Trophy, X, Check, AlertCircle, ChevronRight, Users, Swords, ArrowRight } from 'lucide-react';
import Button from '../shared/Button';
import { buzzToQuality } from '../../utils/sm2';

// ── All possible AI bots ──────────────────────────────────────────────────
const ALL_BOTS = [
  { id: 'biscuit', name: 'Player 2', label: 'Newbie',       stars: 1, color: 'slate',   buzzAt: 0.90, accuracy: 0.40, thinkMs: 3000 },
  { id: 'alex',    name: 'Player 3', label: 'Amateur',      stars: 2, color: 'emerald', buzzAt: 0.80, accuracy: 0.58, thinkMs: 1800 },
  { id: 'sam',     name: 'Player 4', label: 'Varsity',      stars: 3, color: 'amber',   buzzAt: 0.62, accuracy: 0.74, thinkMs: 1100 },
  { id: 'jordan',  name: 'Player 5', label: 'Collegiate',   stars: 3, color: 'sky',     buzzAt: 0.50, accuracy: 0.82, thinkMs: 800  },
  { id: 'quinn',   name: 'Player 6', label: 'Invitational', stars: 4, color: 'violet',  buzzAt: 0.36, accuracy: 0.90, thinkMs: 600  },
  { id: 'morgan',  name: 'Player 7', label: 'National',     stars: 4, color: 'orange',  buzzAt: 0.22, accuracy: 0.94, thinkMs: 350  },
  { id: 'cipher',  name: 'Player 8', label: 'Pro',          stars: 5, color: 'rose',    buzzAt: 0.12, accuracy: 0.98, thinkMs: 150  },
];

const COLOR_MAP = {
  slate:   { bg:'bg-slate-500/10',   border:'border-slate-500/30',   text:'text-slate-300',   dot:'bg-slate-400',   bar:'bg-slate-400'   },
  emerald: { bg:'bg-emerald-500/10', border:'border-emerald-500/30', text:'text-emerald-300', dot:'bg-emerald-400', bar:'bg-emerald-400' },
  amber:   { bg:'bg-amber-500/10',   border:'border-amber-500/30',   text:'text-amber-300',   dot:'bg-amber-400',   bar:'bg-amber-400'   },
  sky:     { bg:'bg-sky-500/10',     border:'border-sky-500/30',     text:'text-sky-300',     dot:'bg-sky-400',     bar:'bg-sky-400'     },
  violet:  { bg:'bg-violet-500/10',  border:'border-violet-500/30',  text:'text-violet-300',  dot:'bg-violet-400',  bar:'bg-violet-400'  },
  orange:  { bg:'bg-orange-500/10',  border:'border-orange-500/30',  text:'text-orange-300',  dot:'bg-orange-400',  bar:'bg-orange-400'  },
  rose:    { bg:'bg-rose-500/10',    border:'border-rose-500/30',    text:'text-rose-300',    dot:'bg-rose-400',    bar:'bg-rose-400'    },
};

// ── Bot card with % bar ───────────────────────────────────────────────────
function BotCard({ bot, buzzedAt, correct, isThinking, score, maxScore, displayName }) {
  const c = COLOR_MAP[bot.color] || COLOR_MAP.slate;
  const status = buzzedAt != null ? (correct ? 'correct' : 'neg') : isThinking ? 'thinking' : 'waiting';
  const pct = maxScore > 0 ? Math.min(100, ((score || 0) / maxScore) * 100) : 0;
  return (
    <div className={`rounded-xl border p-2.5 ${c.bg} ${c.border}`}>
      <div className="flex items-center gap-1.5 mb-1">
        <span className={`w-1.5 h-1.5 rounded-full flex-shrink-0 ${
          status === 'correct' ? 'bg-emerald-400' :
          status === 'neg'     ? 'bg-rose-400' :
          status === 'thinking'? `${c.dot} animate-pulse` : 'bg-white/15'}`} />
        <span className={`font-semibold text-[11px] ${c.text} flex-1 truncate`}>{displayName}</span>
        <span className={`text-xs font-bold ${c.text} tabular-nums`}>{score ?? 0}</span>
      </div>
      <div className="h-1 bg-white/[0.06] rounded-full overflow-hidden mb-1.5">
        <div className={`h-full ${c.bar} rounded-full transition-all duration-700`} style={{ width: `${pct}%` }} />
      </div>
      <div className="flex items-center justify-between">
        <span className="text-white/35 text-[10px]">
          {status === 'correct' ? '✓ Correct' : status === 'neg' ? '✗ Wrong' : status === 'thinking' ? 'Buzzing…' : 'Listening'}
        </span>
        <span className="text-white/20 text-[9px] tracking-tighter">{'★'.repeat(bot.stars || 1)}</span>
      </div>
    </div>
  );
}

// ── 1v1 match header ──────────────────────────────────────────────────────
function MatchHeader({ userScore, botScore, botName, target = 10 }) {
  return (
    <div className="flex items-center justify-center gap-4 px-4 py-2.5 bg-white/[0.03] border-b border-white/[0.06] flex-shrink-0">
      <div className="text-right flex-1">
        <div className="text-xl font-black text-blue-400 tabular-nums">{userScore}</div>
        <div className="text-xs text-white/40">You</div>
      </div>
      <div className="flex flex-col items-center gap-0.5">
        <Swords size={13} className="text-white/25" />
        <div className="text-[10px] text-white/20">first to {target}</div>
      </div>
      <div className="text-left flex-1">
        <div className="text-xl font-black text-rose-400 tabular-nums">{botScore}</div>
        <div className="text-xs text-white/40">{botName}</div>
      </div>
    </div>
  );
}

// ── Scoring ───────────────────────────────────────────────────────────────
// Default = legacy "Standard" continuous-curve scoring. Custom formats
// (IAC Prelim, IAC Playoff, JV) come in from TrialPage.
const DEFAULT_FORMAT = {
  id: 'standard', label: 'Standard',
  powerThreshold: null, powerPts: null, getPts: 10, negPts: -5, target: null,
};
function scoreForBuzz({ correct, ratio, format }) {
  const f = format || DEFAULT_FORMAT;
  if (!correct) return f.negPts || 0;
  if (f.id === 'standard') return Math.round(10 * (2 - ratio));
  if (f.powerThreshold != null && ratio < f.powerThreshold) return f.powerPts;
  return f.getPts;
}

// ── Answer checker ────────────────────────────────────────────────────────
function normalize(str) {
  return str.toLowerCase().replace(/^(the|a|an)\s+/i, '').replace(/[^a-z0-9\s]/g, '').trim();
}
function checkAnswer(userAns, correctAns) {
  const u = normalize(userAns), c = normalize(correctAns);
  if (!u || !c) return false;
  if (u === c) return true;
  if (c.includes(u) && u.length >= c.length * 0.5) return true;
  if (u.includes(c)) return true;
  const cWords = c.split(/\s+/), uWords = u.split(/\s+/);
  return cWords.filter(w => uWords.includes(w)).length / cWords.length >= 0.5;
}

// ── Main ──────────────────────────────────────────────────────────────────
// Props:
//   questions  – QB question objects
//   difficulty – 'easy' | 'medium' | 'hard'
//   bots       – bot objects to use (subset of ALL_BOTS). null = first 3
//   matchMode  – boolean: 1v1 head-to-head
//   lobbyMode  – boolean: full 8-player tournament room
//   botNames   – { [botId]: customName } map for display
//   onComplete – ({ xp, userScore, sessionResults })
export default function TrialSession({
  questions, difficulty, bots: botsProp, matchMode = false,
  lobbyMode = false, botNames, scoringFormat, onComplete,
}) {
  const ACTIVE_BOTS = botsProp ?? ALL_BOTS.slice(0, 3);
  const FORMAT = scoringFormat || DEFAULT_FORMAT;
  const MATCH_TARGET = FORMAT.target || 10;

  const words           = useRef([]);
  const revealTimer     = useRef(null);
  const botTimers       = useRef([]);
  const questionGenRef  = useRef(0);

  const [qIdx,         setQIdx]         = useState(0);
  const [revealedCount,setRevealedCount]= useState(0);
  const [phase,        setPhase]        = useState('reading'); // reading|buzzed|result|done
  const [buzzRatio,    setBuzzRatio]    = useState(0);
  const [answer,       setAnswer]       = useState('');
  const [answerResult, setAnswerResult] = useState(null);
  const [xp,           setXp]           = useState(0);
  const [combo,        setCombo]        = useState(0);
  const [userScore,    setUserScore]    = useState(0);
  const [botStates,    setBotStates]    = useState(() =>
    ACTIVE_BOTS.map(b => ({ id: b.id, buzzedAt: null, correct: null, isThinking: false, score: 0 }))
  );
  const [buzzedBy,       setBuzzedBy]      = useState(null);
  const [sessionResults, setSessionResults]= useState([]);
  const [matchWinner,    setMatchWinner]   = useState(null);
  const [userNegged,     setUserNegged]    = useState(false);

  // Track phase in a ref so timeout callbacks can read current value without stale closures
  const phaseRef = useRef('reading');
  useEffect(() => { phaseRef.current = phase; }, [phase]);

  const q          = questions[qIdx];
  const totalQ     = questions.length;
  const revealSpeed= difficulty === 'hard' ? 115 : difficulty === 'easy' ? 210 : 155;
  const maxScore   = Math.max(userScore, ...botStates.map(b => b.score || 0), 1);
  const botTotal   = botStates.reduce((s, b) => s + (b.score || 0), 0);
  const userPct    = maxScore > 0 ? Math.min(100, (userScore / maxScore) * 100) : 0;

  // ── Question setup ────────────────────────────────────────────────────
  useEffect(() => {
    if (!q) return;
    questionGenRef.current += 1;
    words.current = q.question.split(/\s+/);
    setRevealedCount(0);
    setPhase('reading');
    setBuzzedBy(null);
    setAnswer('');
    setAnswerResult(null);
    setUserNegged(false);
    // Preserve cumulative scores, reset per-question fields
    setBotStates(prev => ACTIVE_BOTS.map(b => {
      const ex = prev.find(p => p.id === b.id);
      return { id: b.id, buzzedAt: null, correct: null, isThinking: false, score: ex?.score || 0 };
    }));
    clearAllTimers();
    startReveal();
    scheduleBots();
  }, [qIdx]); // eslint-disable-line

  useEffect(() => () => clearAllTimers(), []);

  function clearAllTimers() {
    if (revealTimer.current) clearInterval(revealTimer.current);
    botTimers.current.forEach(clearTimeout);
    botTimers.current = [];
  }

  function startReveal() {
    if (revealTimer.current) clearInterval(revealTimer.current);
    revealTimer.current = setInterval(() => {
      setRevealedCount(c => {
        const next = Math.min(c + 1, words.current.length);
        if (next >= words.current.length) clearInterval(revealTimer.current);
        return next;
      });
    }, revealSpeed);
  }

  function scheduleBots() {
    const dur = words.current.length * revealSpeed;
    ACTIVE_BOTS.forEach((bot, idx) => {
      const jitter = (Math.random() - 0.5) * 0.2;
      const ratio  = Math.max(0.1, Math.min(0.95, bot.buzzAt + jitter));

      // Stage 1 — mark bot as "thinking" at the buzz point in the question
      const t = setTimeout(() => {
        setBotStates(prev => {
          if (prev[idx]?.buzzedAt != null) return prev;
          const u = [...prev];
          u[idx] = { ...u[idx], isThinking: true };
          return u;
        });

        // Stage 2 — after processing delay, claim buzzedBy + update result atomically
        //            (both calls are in the same setTimeout callback → React 18 batches
        //            them into a single render, so the effect always sees correct = set)
        const tt = setTimeout(() => {
          const correct = Math.random() < bot.accuracy;
          // Bots use the same scoring format as the player so the
          // scoreboard stays consistent (e.g., powers worth 15 across
          // the table). On a wrong bot buzz we award 0 rather than a
          // neg — bots aren't penalized to keep the game flowing.
          const pts     = correct ? scoreForBuzz({ correct: true, ratio, format: FORMAT }) : 0;

          // Freeze the question reveal the moment a bot locks in a correct answer
          if (correct && revealTimer.current) {
            clearInterval(revealTimer.current);
            revealTimer.current = null;
          }

          // Update bot result first
          setBotStates(s => {
            const u = [...s];
            u[idx] = { ...u[idx], isThinking: false, buzzedAt: ratio, correct,
                        score: (s[idx]?.score || 0) + pts };
            return u;
          });

          // Claim buzzedBy in the same batch — effect sees both updates at once
          setBuzzedBy(prev => prev ?? bot.id);
        }, bot.thinkMs);

        botTimers.current.push(tt);
      }, dur * ratio);

      botTimers.current.push(t);
    });
  }

  // ── Bot buzz resolution ───────────────────────────────────────────────
  useEffect(() => {
    if (!buzzedBy || buzzedBy === 'user') return;
    const botState = botStates.find(s => s.id === buzzedBy);
    if (!botState?.correct) {
      setTimeout(() => {
        setBuzzedBy(null);
        if (revealedCount < words.current.length) startReveal();
      }, 1200);
    } else {
      const cumScore = botState.score || 0;
      setTimeout(() => {
        if (matchMode && cumScore >= MATCH_TARGET) { setMatchWinner(buzzedBy); setPhase('done'); }
        else advanceQuestion();
      }, 2000);
    }
  }, [buzzedBy]); // eslint-disable-line

  // ── End-of-question dead-ball: fully revealed, nobody answered ────────
  useEffect(() => {
    if (phase !== 'reading') return;
    if (!words.current.length || revealedCount < words.current.length) return;
    const gen = questionGenRef.current;
    const t = setTimeout(() => {
      if (questionGenRef.current !== gen || phaseRef.current !== 'reading') return;
      advanceQuestion();
    }, 1800);
    return () => clearTimeout(t);
  }, [revealedCount, phase]); // eslint-disable-line

  // ── Keyboard ──────────────────────────────────────────────────────────
  useEffect(() => {
    const onKey = e => {
      if (e.code === 'Space' && phase === 'reading' && !buzzedBy && !userNegged) { e.preventDefault(); handleBuzz(); }
      if (e.code === 'Enter' && phase === 'buzzed')               { e.preventDefault(); submitAnswer(); }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [phase, buzzedBy, answer, userNegged]); // eslint-disable-line

  function handleBuzz() {
    if (phase !== 'reading' || buzzedBy || userNegged) return;
    clearInterval(revealTimer.current);
    setBuzzRatio(revealedCount / Math.max(1, words.current.length));
    setBuzzedBy('user');
    setPhase('buzzed');
  }

  function submitAnswer() {
    if (phase !== 'buzzed') return;
    const correct  = checkAnswer(answer, q.answer);
    const quality  = buzzToQuality(correct, buzzRatio);
    const xpGained = correct ? Math.round(10 * (1 + combo * 0.25) * (2 - buzzRatio)) : 0;
    const ptsGained= scoreForBuzz({ correct, ratio: buzzRatio, format: FORMAT });
    const newScore = userScore + ptsGained;

    setAnswerResult({ correct, xpGained, ptsGained });
    setSessionResults(prev => [...prev, { questionId: q.id, question: q, quality, correct, buzzRatio }]);

    if (correct) {
      setXp(p => p + xpGained);
      setUserScore(newScore);
      setCombo(p => p + 1);
      if (matchMode && newScore >= MATCH_TARGET) {
        setPhase('result');
        setTimeout(() => { setMatchWinner('user'); setPhase('done'); }, 1800);
        return;
      }
    } else {
      setCombo(0);
      setUserScore(p => p + ptsGained);
      // Neg: question keeps going until a bot answers or it runs out
      setUserNegged(true);
      setAnswer('');
      setAnswerResult(null);
      setBuzzedBy(null);
      setPhase('reading');
      if (revealedCount < words.current.length) startReveal();
      return;
    }

    setPhase('result');
    setTimeout(advanceQuestion, 2200);
  }

  function advanceQuestion() {
    clearAllTimers();
    if (qIdx + 1 >= totalQ) finishSession();
    else setQIdx(i => i + 1);
  }

  function finishSession() {
    setPhase('done');
    clearAllTimers();
    if (!matchWinner) onComplete?.({ xp, userScore, sessionResults });
  }

  function skipQuestion() {
    clearAllTimers();
    setSessionResults(prev => [...prev, { questionId: q?.id, question: q, quality: 1, correct: false, buzzRatio: 1 }]);
    if (qIdx + 1 >= totalQ) finishSession();
    else setQIdx(i => i + 1);
  }

  // ── Match winner overlay ──────────────────────────────────────────────
  if (matchWinner) {
    const won     = matchWinner === 'user';
    const bot     = ACTIVE_BOTS.find(b => b.id === matchWinner);
    const botName = (botNames?.[bot?.id]) || bot?.name || 'AI';
    return (
      <div className="flex flex-col items-center justify-center flex-1 text-center p-8 gap-6">
        <div className="text-7xl">{won ? '🏆' : '💀'}</div>
        <div>
          <h2 className={`text-3xl font-black ${won ? 'text-yellow-300' : 'text-white/70'}`}>
            {won ? 'You Win!' : `${botName} Wins`}
          </h2>
          <p className="text-white/40 text-sm mt-1">
            Final: You {userScore} — {botName} {botTotal}
          </p>
        </div>
        <Button onClick={() => onComplete?.({ xp, userScore, sessionResults })} size="lg" className="w-full max-w-xs">
          <ChevronRight size={16} /> Continue
        </Button>
      </div>
    );
  }

  // ── Practice session done ─────────────────────────────────────────────
  if (phase === 'done' && !matchWinner) {
    return (
      <SessionComplete xp={xp} userScore={userScore} results={sessionResults}
        onDone={() => onComplete?.({ xp, userScore, sessionResults })} />
    );
  }

  if (!q) return null;

  const displayedWords      = words.current.slice(0, revealedCount);
  const progressPct         = words.current.length > 0 ? (revealedCount / words.current.length) * 100 : 0;
  // Only treat as "bot buzz" once buzzedAt is actually set (avoids flicker during isThinking)
  const activeBotBuzzState  = buzzedBy && buzzedBy !== 'user' ? botStates.find(s => s.id === buzzedBy) : null;
  const activeBotBuzz       = activeBotBuzzState?.buzzedAt != null
    ? ACTIVE_BOTS.find(b => b.id === buzzedBy) : null;
  const botAnsweredCorrectly= !!(activeBotBuzz && activeBotBuzzState?.correct === true);
  const sidebarLabel        = (matchMode ? '1v1' : lobbyMode ? `Tournament · ${ACTIVE_BOTS.length + 1}P` : 'Lobby') + ` · ${FORMAT.label}`;

  return (
    <div className="flex flex-col h-full min-h-0 bg-transparent">

      {/* Header */}
      {matchMode ? (
        <MatchHeader
          userScore={userScore} botScore={botTotal}
          botName={botNames?.[ACTIVE_BOTS[0]?.id] || ACTIVE_BOTS[0]?.name || 'AI'}
          target={MATCH_TARGET}
        />
      ) : (
        <div className="flex items-center gap-2 px-4 py-2.5 border-b border-white/[0.04] flex-shrink-0">
          <Zap size={14} className="text-white/50" />
          <span className="text-[13px] font-bold text-white tabular-nums">Q{qIdx + 1}/{totalQ}</span>
          <span className="text-[9px] font-bold uppercase tracking-wider px-1.5 py-0.5 rounded-full bg-white/[0.08] text-white/50">
            {lobbyMode ? '8P' : 'Lobby'}
          </span>
          <div className="flex-1" />
          <div className="flex items-center gap-1.5">
            <Zap size={12} className="text-yellow-400/70" />
            <span className="text-[12px] font-bold tabular-nums text-yellow-400/80">{xp}</span>
            {combo > 1 && (
              <span className="text-[10px] bg-yellow-400/15 text-yellow-300 px-1.5 rounded-full font-bold">×{combo}</span>
            )}
          </div>
          <span className={`text-[12px] font-bold tabular-nums ${userScore > 0 ? 'text-emerald-400' : 'text-white/40'}`}>
            {userScore}
          </span>
          <button onClick={skipQuestion}
            className="text-[10px] font-medium px-2 py-0.5 rounded-full border border-white/[0.10] text-white/55 hover:text-white/80 hover:bg-white/[0.06]">
            Skip
          </button>
        </div>
      )}

      <div className="flex flex-1 min-h-0">

        {/* ── Question + actions ── */}
        <div className="flex-1 flex flex-col min-h-0">

          {/* Revealed text */}
          <div className="flex-1 overflow-y-auto p-5">
            <div className="min-h-[120px]">
              <p className="text-[15px] leading-relaxed text-white/90 font-light">
                {displayedWords.map((w, i) => <span key={i}>{w} </span>)}
                {phase === 'reading' && revealedCount < words.current.length && (
                  <span className="inline-block w-0.5 h-4 bg-white/35 animate-pulse ml-1 align-middle rounded-sm" />
                )}
              </p>
            </div>
          </div>

          {/* Bottom controls — mirrors QuizBowlApp playing view */}
          <div className="px-4 py-3 border-t border-white/[0.04] flex-shrink-0 space-y-2">

            {/* Neg feedback banner */}
            {userNegged && phase === 'reading' && (
              <div className="rounded-xl px-3 py-2 bg-rose-500/[0.08] border border-rose-500/[0.20] flex items-center gap-2">
                <AlertCircle size={12} className="text-rose-400 flex-shrink-0" />
                <p className="text-[12px] text-rose-300/80">Negged · question continues</p>
              </div>
            )}

            {/* Bot buzzed (non-result) */}
            {activeBotBuzz && phase !== 'result' && (
              <div className="rounded-xl px-3 py-2 bg-white/[0.03] border border-white/[0.07] flex items-center gap-2">
                <AlertCircle size={12} className="text-amber-400 flex-shrink-0" />
                <p className="text-[12px] text-white/55">
                  <span className="font-semibold text-white/80">{botNames?.[activeBotBuzz.id] || activeBotBuzz.name}</span>
                  {activeBotBuzzState?.correct === true  && <span className="text-emerald-400 ml-1">correct.</span>}
                  {activeBotBuzzState?.correct === false && <span className="text-rose-400 ml-1">wrong.</span>}
                  {activeBotBuzzState?.correct == null   && <span className="text-white/30 ml-1">answering…</span>}
                </p>
              </div>
            )}

            {/* Buzz button */}
            {phase === 'reading' && !botAnsweredCorrectly && (
              <>
                <button onClick={handleBuzz}
                  className="w-full py-4 rounded-2xl bg-blue-600 hover:bg-blue-500 text-white text-[15px] font-bold uppercase tracking-[0.15em] active:scale-[0.98] transition-all shadow-[0_0_24px_rgba(59,130,246,0.25)]">
                  BUZZ
                </button>
                <p className="text-[10px] text-white/35 text-center">Space to buzz</p>
              </>
            )}

            {/* Waiting — bot already got it */}
            {phase === 'reading' && botAnsweredCorrectly && (
              <div className="py-3 rounded-xl bg-white/[0.03] text-center text-[12px] text-white/30 border border-white/[0.05]">
                Next question loading…
              </div>
            )}

            {/* Answer input */}
            {phase === 'buzzed' && buzzedBy === 'user' && (
              <div className="flex gap-2">
                <input
                  autoFocus value={answer} onChange={e => setAnswer(e.target.value)}
                  onKeyDown={e => e.key === 'Enter' && submitAnswer()}
                  placeholder="Answer…"
                  className="flex-1 px-4 py-3 rounded-2xl border border-white/10 bg-white/5 text-[14px] text-white placeholder-white/25 outline-none focus:border-white/[0.15] transition-colors"
                />
                <button onClick={submitAnswer} disabled={!answer.trim()}
                  className="px-5 py-3 rounded-2xl bg-white/[0.09] hover:bg-white/[0.13] text-white/70 text-[13px] font-bold disabled:opacity-30 transition-colors">
                  <ArrowRight size={16} />
                </button>
              </div>
            )}

            {/* Waiting while a bot answers */}
            {phase === 'buzzed' && buzzedBy !== 'user' && (
              <div className="py-3 rounded-xl bg-white/[0.03] text-center text-[12px] text-white/30 border border-white/[0.05]">
                {botNames?.[buzzedBy] || 'AI'} is answering…
              </div>
            )}

            {/* Result — answer revealed here, not in question text */}
            {phase === 'result' && answerResult && (
              <div className={`p-4 rounded-2xl text-center border-2 ${
                answerResult.correct
                  ? 'bg-emerald-500/10 border-emerald-500/40'
                  : 'bg-rose-500/10 border-rose-500/40'
              }`}>
                <p className={`text-[15px] font-bold ${answerResult.correct ? 'text-emerald-400' : 'text-rose-400'}`}>
                  {answerResult.correct ? '✓' : '✗'} {q.answer}
                </p>
                <p className="text-[11px] text-white/35 mt-1">
                  {answerResult.correct
                    ? `+${answerResult.xpGained} XP · +${answerResult.ptsGained} pts${
                        FORMAT.powerThreshold != null && buzzRatio < FORMAT.powerThreshold
                          ? ' · POWER!'
                          : (FORMAT.id === 'standard' && buzzRatio < 0.5 ? ' · Early buzz!' : '')
                      }`
                    : `Incorrect${FORMAT.negPts ? ` · ${FORMAT.negPts} pts` : ''}`}
                </p>
              </div>
            )}

            {/* Result — bot got it right */}
            {phase === 'result' && !answerResult && (
              <div className="p-4 rounded-2xl text-center border-2 bg-white/[0.04] border-white/[0.12]">
                <p className="text-[15px] font-bold text-white/60">{q.answer}</p>
                <p className="text-[11px] text-white/30 mt-1">Bot answered correctly</p>
              </div>
            )}
          </div>
        </div>

        {/* ── Scoreboard sidebar ── */}
        <div className="w-44 flex-shrink-0 border-l border-white/[0.04] p-3 flex flex-col gap-1.5 overflow-y-auto">

          <div className="flex items-center gap-1.5 mb-1 flex-shrink-0">
            {matchMode
              ? <Swords size={11} className="text-white/25" />
              : <Users  size={11} className={lobbyMode ? 'text-cyan-400/70' : 'text-white/25'} />}
            <span className={`text-[10px] font-semibold uppercase tracking-wider ${lobbyMode ? 'text-cyan-400/70' : 'text-white/25'}`}>
              {sidebarLabel}
            </span>
          </div>

          {/* You */}
          <div className="rounded-xl border border-blue-500/30 bg-blue-500/[0.08] p-2.5">
            <div className="flex items-center gap-1.5 mb-1">
              <span className="w-1.5 h-1.5 rounded-full bg-blue-400 flex-shrink-0" />
              <span className="font-semibold text-[11px] text-blue-300 flex-1">You</span>
              <span className="text-[11px] font-bold text-blue-300 tabular-nums">{userScore}</span>
            </div>
            <div className="h-1 bg-white/[0.06] rounded-full overflow-hidden mb-1.5">
              <div className="h-full bg-blue-400 rounded-full transition-all duration-700" style={{ width: `${userPct}%` }} />
            </div>
            <span className="text-white/35 text-[10px]">
              {userNegged ? '✗ Negged'
                : phase === 'buzzed' && buzzedBy === 'user' ? 'Answering…'
                : phase === 'result' && answerResult?.correct ? '✓ Correct'
                : phase === 'result' ? '✗ Wrong'
                : 'Listening'}
            </span>
          </div>

          {/* Bots */}
          {ACTIVE_BOTS.map((bot, idx) => (
            <BotCard key={bot.id} bot={bot}
              displayName={botNames?.[bot.id] || bot.name}
              buzzedAt={botStates[idx]?.buzzedAt}
              correct={botStates[idx]?.correct}
              isThinking={botStates[idx]?.isThinking}
              score={botStates[idx]?.score}
              maxScore={maxScore}
            />
          ))}

          {/* Read progress */}
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

// ── Session complete (practice) ───────────────────────────────────────────
function SessionComplete({ xp, userScore, results, onDone }) {
  const correct = results.filter(r => r.correct).length;
  const total   = results.length;
  const earlyBuzzes = results.filter(r => r.correct && r.buzzRatio < 0.5).length;
  return (
    <div className="h-full overflow-y-auto bg-transparent">
      <div className="p-5">
        {/* Score */}
        <div className="text-center mb-6 pt-4">
          <div className="text-[42px] font-bold text-white tabular-nums leading-none">
            {correct}<span className="text-white/30">/{total}</span>
          </div>
          <div className="flex items-center justify-center gap-3 mt-2">
            {earlyBuzzes > 0 && <span className="text-[11px] text-white/55 font-medium">{earlyBuzzes} early</span>}
            {xp > 0 && <span className="text-[11px] text-yellow-400/70 font-medium">+{xp} XP</span>}
            {userScore > 0 && <span className="text-[11px] text-white/45">{userScore} pts</span>}
          </div>
        </div>

        {/* Per-question breakdown */}
        <div className="space-y-1.5 mb-5">
          {results.map((r, i) => (
            <div key={i} className={`rounded-2xl px-3.5 py-2.5 border flex items-start gap-2.5 ${
              r.correct ? 'bg-emerald-500/8 border-emerald-500/20' : 'bg-rose-500/8 border-rose-500/20'
            }`}>
              <div className={`mt-0.5 shrink-0 ${r.correct ? 'text-emerald-400' : 'text-rose-400'}`}>
                {r.correct ? <Check size={13} /> : <X size={13} />}
              </div>
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2">
                  <span className="text-[11px] font-bold text-white/75">Q{i + 1}</span>
                  {r.buzzRatio >= 0 && r.buzzRatio < 1 && (
                    <span className="text-[10px] text-white/40">{Math.round(r.buzzRatio * 100)}%</span>
                  )}
                  {r.buzzRatio < 0.5 && r.correct && (
                    <span className="text-[9px] font-bold text-yellow-400/80 uppercase tracking-wide">Early</span>
                  )}
                </div>
                <p className="text-[12px] text-white/80 mt-0.5">
                  <strong className="text-white font-semibold">{r.question?.answer}</strong>
                </p>
              </div>
            </div>
          ))}
        </div>

        <button onClick={onDone}
          className="w-full py-3 rounded-2xl bg-white/[0.09] hover:bg-white/[0.13] text-white/70 text-[13px] font-semibold transition-colors">
          Done
        </button>
      </div>
    </div>
  );
}
