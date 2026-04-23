import { useState, useEffect, useRef, useCallback } from 'react';
import { Zap, Users, Copy, Loader2, Check, X, Trophy, Play, LogOut } from 'lucide-react';
import {
  createMatch, joinMatch, startMatch, buzzMatch, answerMatch, nextMatchQuestion,
  leaveMatch, streamMatch,
} from '../../../api/quizMatch';

// Client-side word-by-word reveal: compute from `startedAt` timestamp so
// both players render identically, no polling required.
//
// Uses refs for frozen/frozenAt so the interval callback reads the latest
// value (no stale closure). When frozen flips true, we LOCK the displayed
// word index at the word that was visible at `frozenAt` and never move it
// forward again until a new startedAt arrives (next question or resume).
function useWordReveal(text, startedAt, speedMs, frozen, frozenAt) {
  const [, setTick] = useState(0);
  const frozenRef = useRef(frozen);
  const frozenAtRef = useRef(frozenAt);
  const lockedIdxRef = useRef(null); // when frozen, the word index to pin at

  // Keep refs in sync with props.
  useEffect(() => {
    frozenRef.current = frozen;
    frozenAtRef.current = frozenAt;
    if (!frozen) lockedIdxRef.current = null; // resume → recompute every tick
  }, [frozen, frozenAt]);

  // Drive re-renders while actively reading. When frozen goes true, the
  // interval callback short-circuits so `now` never advances the display.
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

  // When frozen, lock the index to what it was at frozenAt. If frozenAt is
  // missing, lock to whatever it is right now.
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
  // view: 'menu' (create/join) | 'lobby' (invite + configure) | 'generating' | 'playing' | 'finished'
  const [view, setView] = useState('menu');
  const [code, setCode] = useState('');
  const [joinCodeInput, setJoinCodeInput] = useState('');
  // Settings are chosen AFTER the opponent joins, in the lobby view.
  const [category, setCategory] = useState('Mixed');
  const [difficulty, setDifficulty] = useState('Medium');
  const [questionCount, setQuestionCount] = useState(10);
  const [revealSpeedMs, setRevealSpeedMs] = useState(140);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);
  const [match, setMatch] = useState(null);

  // Current question state pushed from server
  const [question, setQuestion] = useState(null); // { text, startedAt }
  const [buzz, setBuzz] = useState(null);         // { userId, buzzAt } | null
  const [answer, setAnswer] = useState('');
  const [answerResult, setAnswerResult] = useState(null); // { userId, correct, answer, correctAnswer, autoAdvanceInMs? }
  // Date.now() when the question will auto-advance. null if host must manually advance.
  const [autoAdvanceDeadline, setAutoAdvanceDeadline] = useState(null);
  // Set of userIds locked out of buzzing on the CURRENT question (they
  // already tried and got it wrong). Resets when question_start fires.
  const [lockedOut, setLockedOut] = useState([]);
  // Flash a "Wrong — <name>" banner for ~1.5s when a wrong answer arrives
  // while the question is still live.
  const [wrongFlash, setWrongFlash] = useState(null);

  const abortRef = useRef(null);
  // Declared early because handleBuzz and the SSE handlers need it. `const`
  // is block-scoped with a TDZ, so referencing `myId` before its declaration
  // throws ReferenceError — which is what made the view render blank.
  const myId = user?.id;

  // ----- Connect SSE stream once we have a match code -----
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
      },
      onBuzz: ({ userId, buzzAt }) => setBuzz({ userId, buzzAt }),
      onWrongAnswer: ({ userId, answer: wrongAns, lockedOut: lock, questionStartedAt: newStart }) => {
        // Resume the reveal for the still-playing player; show a brief flash.
        setBuzz(null);
        setAnswer('');
        setLockedOut(lock || []);
        if (newStart && question) setQuestion(q => q ? { ...q, startedAt: newStart } : q);
        setWrongFlash({ userId, answer: wrongAns });
        setTimeout(() => setWrongFlash(null), 1800);
      },
      onAnswerResult: (data) => {
        setAnswerResult(data);
        setAutoAdvanceDeadline(data.autoAdvanceInMs ? Date.now() + data.autoAdvanceInMs : null);
        setMatch(prev => prev ? { ...prev, players: prev.players.map(p => ({ ...p, score: data.scores[p.userId] || 0 })) } : prev);
      },
      onMatchEnd: ({ scores }) => {
        setMatch(prev => prev ? { ...prev, players: prev.players.map(p => ({ ...p, score: scores[p.userId] || 0 })) } : prev);
        setView('finished');
      },
      onError: (err) => setError(err),
    });
    abortRef.current = abort;
    return () => { try { abort(); } catch {} };
  }, [code]);

  // ----- Actions -----
  // Instant — no LLM call here. The host will pick settings in the lobby
  // after player 2 joins, then press Start which runs question generation.
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
    try { await startMatch(code, { category, difficulty, questionCount, revealSpeedMs }); }
    catch (e) { setError(e.message); }
  }

  const handleBuzz = useCallback(async () => {
    if (!question || buzz) return;
    if (lockedOut.includes(myId)) return; // already got this question wrong
    // Optimistic: freeze my reveal immediately. If the server rejects (opponent
    // buzzed first) the SSE `buzz` event will correct everyone to the winner.
    setBuzz({ userId: user?.id || 'me', buzzAt: Date.now(), _optimistic: true });
    try {
      await buzzMatch(code);
    } catch (e) {
      // 409 = someone else buzzed first, or you're locked out. SSE corrects.
    }
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
    setView('menu');
    onExit?.();
  }

  // Space / Enter shortcuts during playing view.
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
      <div className="h-full overflow-y-auto bg-white dark:bg-[#161622]">
        <div className="p-5 space-y-5 max-w-md mx-auto">
          <div className="text-center">
            <Users size={28} className="text-amber-500 mx-auto mb-2" />
            <h2 className="text-lg font-bold text-gray-900 dark:text-white">Head-to-Head Quiz Bowl</h2>
            <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">Two players, pyramidal buzz-in, live.</p>
          </div>

          {error && <p className="text-xs text-rose-500 px-3 py-2 rounded-lg bg-rose-50 dark:bg-rose-900/15">{error}</p>}

          {/* Create is now instant — you get an invite code first, settings later. */}
          <button onClick={handleCreate} disabled={busy} className="w-full py-3 rounded-xl bg-amber-500 hover:bg-amber-600 text-white text-sm font-semibold disabled:opacity-50 inline-flex items-center justify-center gap-2">
            {busy ? <><Loader2 size={14} className="animate-spin" /> Creating…</> : <><Play size={14} /> Create invite code</>}
          </button>

          <div className="flex items-center gap-3">
            <div className="flex-1 h-px bg-gray-200 dark:bg-[#2A2A40]" />
            <span className="text-[10px] text-gray-400 uppercase tracking-wider">or</span>
            <div className="flex-1 h-px bg-gray-200 dark:bg-[#2A2A40]" />
          </div>

          <div className="rounded-xl border border-gray-200 dark:border-[#2A2A40] p-4 space-y-3">
            <p className="text-xs font-semibold text-gray-500 uppercase tracking-wider">Join with code</p>
            <div className="flex gap-2">
              <input
                value={joinCodeInput}
                onChange={e => setJoinCodeInput(e.target.value.toUpperCase())}
                placeholder="6-LETTER CODE"
                maxLength={6}
                onKeyDown={e => e.key === 'Enter' && handleJoin()}
                className="flex-1 px-3 py-2.5 rounded-lg border border-gray-200 dark:border-[#2A2A40] bg-white dark:bg-[#0D0D14] text-sm font-mono tracking-wider text-center text-gray-900 dark:text-white outline-none focus:ring-2 focus:ring-amber-500/40"
              />
              <button onClick={handleJoin} disabled={!joinCodeInput.trim() || busy} className="px-4 py-2.5 rounded-lg bg-blue-600 hover:bg-blue-700 text-white text-sm font-semibold disabled:opacity-50">Join</button>
            </div>
          </div>
        </div>
      </div>
    );
  }

  // ============ LOBBY (invite code + configure-on-join) ============
  if (view === 'lobby') {
    const playerCount = match?.players?.length || 0;
    const waiting = playerCount < 2;
    return (
      <div className="h-full overflow-y-auto bg-white dark:bg-[#161622]">
        <div className="p-5 space-y-4 max-w-md mx-auto">
          <div className="text-center">
            <Users size={28} className="text-amber-500 mx-auto mb-2" />
            <h2 className="text-lg font-bold text-gray-900 dark:text-white">
              {waiting ? 'Waiting for opponent' : (isHost ? 'Configure match' : 'Waiting for host')}
            </h2>
          </div>

          {error && <p className="text-xs text-rose-500 px-3 py-2 rounded-lg bg-rose-50 dark:bg-rose-900/15">{error}</p>}

          {/* Invite code — always visible in lobby */}
          <div className="rounded-xl border border-gray-200 dark:border-[#2A2A40] p-4 text-center">
            <p className="text-[11px] font-semibold text-gray-500 uppercase tracking-wider mb-2">Invite code</p>
            <div className="flex items-center justify-center gap-2">
              <p className="text-3xl font-mono font-bold tracking-[0.3em] text-amber-600 dark:text-amber-400">{code}</p>
              <button onClick={() => { navigator.clipboard.writeText(code); }} className="p-1.5 rounded-lg text-gray-400 hover:text-blue-500 hover:bg-gray-100 dark:hover:bg-[#1e1e2e]" title="Copy code">
                <Copy size={14} />
              </button>
            </div>
            <p className="text-[10px] text-gray-400 mt-2">
              {waiting ? 'Send this to a friend so they can join' : 'Opponent joined — ready to configure'}
            </p>
          </div>

          {/* Player list */}
          <div className="space-y-2">
            {(match?.players || []).map(p => (
              <div key={p.userId} className="flex items-center gap-2 px-3 py-2 rounded-lg bg-white dark:bg-[#161622] border border-gray-200 dark:border-[#2A2A40]">
                <div className="w-7 h-7 rounded-full bg-blue-100 dark:bg-blue-900/30 text-blue-600 dark:text-blue-400 flex items-center justify-center text-xs font-bold">
                  {(p.name || '?')[0]?.toUpperCase()}
                </div>
                <span className="text-sm font-medium text-gray-900 dark:text-white">{p.name}</span>
                {p.userId === match?.hostId && <span className="text-[9px] font-bold px-1.5 py-0.5 rounded bg-amber-100 dark:bg-amber-900/30 text-amber-700 dark:text-amber-400">HOST</span>}
                {p.userId === myId && <span className="text-[9px] text-gray-400 ml-auto">you</span>}
              </div>
            ))}
            {waiting && (
              <div className="flex items-center gap-2 px-3 py-2 rounded-lg border border-dashed border-gray-300 dark:border-gray-600 text-xs text-gray-400 italic">
                <Loader2 size={12} className="animate-spin" /> Waiting for player 2…
              </div>
            )}
          </div>

          {/* Configure — only visible once both players are in, host only */}
          {!waiting && isHost && (
            <div className="rounded-xl border border-amber-200 dark:border-amber-800/60 bg-amber-50/30 dark:bg-amber-900/10 p-4 space-y-3">
              <p className="text-xs font-semibold text-amber-700 dark:text-amber-400 uppercase tracking-wider">Game settings</p>
              <Selector label="Category" value={category} onChange={setCategory}
                options={['Science','History','Literature','Geography','Math','Art','Music','Philosophy','Pop Culture','Mixed']} />
              <Selector label="Difficulty" value={difficulty} onChange={setDifficulty}
                options={['Easy','Medium','Hard','Tournament']} grid="grid-cols-4" />
              <div>
                <label className="text-xs font-medium text-gray-500 dark:text-gray-400 mb-1.5 block">Questions: {questionCount}</label>
                <input type="range" min="5" max="20" step="5" value={questionCount} onChange={e => setQuestionCount(Number(e.target.value))} className="w-full" />
              </div>
              <div>
                <label className="text-xs font-medium text-gray-500 dark:text-gray-400 mb-1.5 block">
                  Reading speed: {revealSpeedMs}ms/word <span className="text-gray-400">({revealSpeedMs <= 90 ? 'fast' : revealSpeedMs <= 160 ? 'normal' : 'slow'})</span>
                </label>
                <input type="range" min="60" max="300" step="10" value={revealSpeedMs} onChange={e => setRevealSpeedMs(Number(e.target.value))} className="w-full" />
              </div>
            </div>
          )}

          {!waiting && !isHost && (
            <div className="rounded-xl border border-gray-200 dark:border-[#2A2A40] p-4 text-center text-xs text-gray-500">
              Host is configuring the match. Questions will drop in shortly.
            </div>
          )}

          <div className="flex gap-2">
            <button onClick={handleLeave} className="flex-1 py-2.5 rounded-xl border border-gray-200 dark:border-[#2A2A40] text-sm font-medium text-gray-700 dark:text-gray-300 inline-flex items-center justify-center gap-1.5">
              <LogOut size={12} /> Leave
            </button>
            {isHost && (
              <button onClick={handleStart} disabled={waiting} className="flex-1 py-2.5 rounded-xl bg-amber-500 hover:bg-amber-600 disabled:opacity-40 text-white text-sm font-semibold inline-flex items-center justify-center gap-1.5">
                <Play size={12} /> Generate &amp; start
              </button>
            )}
          </div>
        </div>
      </div>
    );
  }

  // ============ GENERATING ============
  if (view === 'generating') {
    return (
      <div className="h-full flex flex-col items-center justify-center p-6 text-center bg-white dark:bg-[#161622]">
        <div className="w-14 h-14 rounded-2xl bg-amber-500/10 flex items-center justify-center mb-4">
          <Loader2 size={26} className="animate-spin text-amber-500" />
        </div>
        <h2 className="text-lg font-bold text-gray-900 dark:text-white mb-1">Generating questions…</h2>
        <p className="text-xs text-gray-500 dark:text-gray-400">
          {(match?.questionCount || questionCount)} {match?.category || category} · {match?.difficulty || difficulty}
        </p>
      </div>
    );
  }

  // ============ PLAYING ============
  if (view === 'playing' && match) {
    return <PlayingView
      match={match} question={question} buzz={buzz} answerResult={answerResult}
      answer={answer} setAnswer={setAnswer}
      onBuzz={handleBuzz} onSubmitAnswer={handleSubmitAnswer} onNext={handleNext}
      onLeave={handleLeave}
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
    return (
      <div className="h-full overflow-y-auto bg-white dark:bg-[#161622]">
        <div className="p-5 space-y-5 max-w-md mx-auto text-center">
          <Trophy size={40} className={`mx-auto ${amIWinner ? 'text-amber-500' : 'text-gray-400'}`} />
          <h2 className="text-2xl font-bold text-gray-900 dark:text-white">
            {amIWinner ? 'You won!' : winner ? `${winner.name} won` : 'Match over'}
          </h2>
          <div className="space-y-2">
            {sorted.map((p, i) => (
              <div key={p.userId} className={`flex items-center gap-3 px-4 py-2.5 rounded-xl ${i === 0 ? 'bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800' : 'bg-gray-50 dark:bg-[#1e1e2e] border border-gray-200 dark:border-[#2A2A40]'}`}>
                <span className="text-sm font-bold text-gray-500 w-5">#{i + 1}</span>
                <span className="flex-1 text-left text-sm font-medium text-gray-900 dark:text-white">{p.name}{p.userId === myId ? ' (you)' : ''}</span>
                <span className="text-sm font-bold tabular-nums">{p.score || 0}</span>
              </div>
            ))}
          </div>
          <button onClick={handleLeave} className="w-full py-2.5 rounded-xl bg-blue-600 text-white text-sm font-medium">Back to menu</button>
        </div>
      </div>
    );
  }

  return <div className="h-full flex items-center justify-center text-sm text-gray-400 bg-white dark:bg-[#161622]"><Loader2 size={14} className="animate-spin inline mr-1" /> Loading…</div>;
}

// ===== PLAYING VIEW =====
function PlayingView({ match, question, buzz, answerResult, answer, setAnswer, onBuzz, onSubmitAnswer, onNext, onLeave, iBuzzed, isHost, myId, lockedOut = [], wrongFlash, autoAdvanceDeadline, revealSpeedMs }) {
  const frozen = !!buzz || !!answerResult;
  const frozenAt = buzz?.buzzAt || answerResult?.buzzAt || null;
  // ALL hooks must be called before any early return — otherwise React will
  // unmount the tree and the screen can go black on the next render.
  const { revealed, wordIndex, totalWords } = useWordReveal(question?.text || '', question?.startedAt || 0, revealSpeedMs, frozen, frozenAt);

  // Question can briefly be null after the snapshot/before question_start —
  // render a neutral placeholder instead of crashing on `match.players`.
  if (!match || !Array.isArray(match.players)) {
    return <div className="p-5 text-center text-sm text-gray-400 bg-white dark:bg-[#0D0D14] h-full"><Loader2 size={14} className="animate-spin inline mr-1" /> Loading match…</div>;
  }

  const players = match.players || [];
  const buzzerName = buzz ? (players.find(p => p.userId === buzz.userId)?.name || 'Opponent') : '';
  const wrongName = wrongFlash ? (players.find(p => p.userId === wrongFlash.userId)?.name || 'Opponent') : '';
  const iAmLocked = lockedOut.includes(myId);

  return (
    <div className="flex flex-col h-full min-h-0 bg-gray-50 dark:bg-[#0D0D14]">
      {/* Header */}
      <div className="flex items-center gap-3 px-4 py-2.5 border-b border-gray-200 dark:border-[#2A2A40] flex-shrink-0 bg-white dark:bg-[#161622]">
        <Zap size={14} className="text-amber-500" />
        <span className="text-sm font-semibold text-gray-900 dark:text-white">Q{(match.currentIdx || 0) + 1}/{match.totalQuestions}</span>
        <div className="flex-1 flex items-center gap-2 justify-center">
          {match.players.map(p => (
            <div key={p.userId} className={`flex items-center gap-1.5 px-2 py-1 rounded-lg text-xs ${p.userId === myId ? 'bg-blue-50 dark:bg-blue-900/30 text-blue-700 dark:text-blue-300' : 'bg-gray-100 dark:bg-[#1e1e2e] text-gray-700 dark:text-gray-300'}`}>
              <span className="font-medium">{p.name}{p.userId === myId ? ' (you)' : ''}</span>
              <span className="font-bold tabular-nums">{p.score || 0}</span>
            </div>
          ))}
        </div>
        <button onClick={onLeave} className="text-xs text-gray-400 hover:text-rose-500"><LogOut size={12} /></button>
      </div>

      {/* Question */}
      <div className="flex-1 overflow-y-auto p-5">
        <p className="text-base leading-relaxed text-gray-900 dark:text-gray-100">
          {revealed}
          {!frozen && wordIndex < totalWords - 1 && (
            <span className="inline-block w-0.5 h-4 bg-amber-500 animate-pulse ml-1 align-middle" />
          )}
        </p>
        {buzz && !answerResult && (
          <p className="text-xs text-amber-600 dark:text-amber-400 mt-3">
            <Zap size={10} className="inline mr-0.5" /> {iBuzzed ? 'You buzzed — answer now!' : `${buzzerName} buzzed first`}
          </p>
        )}
      </div>

      {/* Action bar */}
      <div className="px-4 py-3 border-t border-gray-200 dark:border-[#2A2A40] flex-shrink-0 space-y-2 bg-white dark:bg-[#161622]">
        {wrongFlash && !buzz && !answerResult && (
          <div className="px-3 py-1.5 rounded-lg bg-rose-50 dark:bg-rose-900/20 border border-rose-200 dark:border-rose-800 text-xs text-rose-700 dark:text-rose-300 text-center">
            {wrongFlash.userId === myId ? 'Wrong' : `${wrongName} was wrong`}{wrongFlash.answer ? ` — "${wrongFlash.answer}"` : ''} · question continues
          </div>
        )}
        {!buzz && !answerResult && !iAmLocked && (
          <>
            <button onClick={onBuzz} className="w-full py-4 rounded-xl bg-red-600 hover:bg-red-700 text-white text-lg font-bold uppercase tracking-wider active:scale-95 transition-transform">BUZZ</button>
            <p className="text-[10px] text-gray-400 text-center">Press SPACE to buzz</p>
          </>
        )}
        {!buzz && !answerResult && iAmLocked && (
          <div className="w-full py-3 rounded-xl bg-gray-100 dark:bg-[#1e1e2e] text-center text-xs text-gray-500">
            You're locked out of this question. Wait for the next.
          </div>
        )}

        {buzz && !answerResult && iBuzzed && (
          <div className="flex gap-2">
            <input
              autoFocus value={answer} onChange={e => setAnswer(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && answer.trim() && onSubmitAnswer()}
              placeholder="Type your answer…"
              className="flex-1 px-4 py-3 rounded-xl border border-gray-200 dark:border-[#2A2A40] bg-white dark:bg-[#0D0D14] text-sm outline-none focus:ring-2 focus:ring-amber-500/40"
            />
            <button onClick={onSubmitAnswer} disabled={!answer.trim()} className="px-5 py-3 rounded-xl bg-amber-500 hover:bg-amber-600 text-white text-sm font-semibold disabled:opacity-40">Submit</button>
          </div>
        )}

        {buzz && !answerResult && !iBuzzed && (
          <div className="w-full py-3 rounded-xl bg-gray-100 dark:bg-[#1e1e2e] text-center text-xs text-gray-500">
            <Loader2 size={12} className="animate-spin inline mr-1" /> {buzzerName} is answering…
          </div>
        )}

        {answerResult && (
          <>
            <div className={`p-3 rounded-xl text-center ${answerResult.correct ? 'bg-emerald-500/10 border-2 border-emerald-500' : answerResult.timeout || !answerResult.userId ? 'bg-gray-100 dark:bg-[#1e1e2e] border-2 border-gray-300 dark:border-[#2A2A40]' : 'bg-rose-500/10 border-2 border-rose-500'}`}>
              <p className={`text-sm font-bold ${answerResult.correct ? 'text-emerald-600' : answerResult.timeout || !answerResult.userId ? 'text-gray-600 dark:text-gray-300' : 'text-rose-600'}`}>
                {answerResult.correct
                  ? (answerResult.userId === myId ? 'CORRECT — +1' : `${buzzerName} got it`)
                  : (answerResult.timeout || !answerResult.userId)
                    ? "No one got it"
                    : (answerResult.userId === myId ? 'WRONG' : `${buzzerName} was wrong`)}
              </p>
              <p className="text-xs text-gray-700 dark:text-gray-300 mt-1">Answer: <strong>{answerResult.correctAnswer}</strong></p>
            </div>
            <AutoAdvanceCountdown deadline={autoAdvanceDeadline} isHost={isHost} onNext={onNext} />
          </>
        )}
      </div>
    </div>
  );
}

// Live countdown until the server auto-advances. Refreshes every 100ms.
// `deadline` is a Date.now() timestamp; when it passes, we stop ticking and
// the server-pushed question_start event will drop us into the next question.
function AutoAdvanceCountdown({ deadline, isHost, onNext }) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    if (!deadline) return;
    const id = setInterval(() => setNow(Date.now()), 100);
    return () => clearInterval(id);
  }, [deadline]);
  if (!deadline) {
    return isHost
      ? <button onClick={onNext} className="w-full py-2.5 rounded-xl bg-blue-600 text-white text-sm font-semibold">Next question →</button>
      : <p className="text-[11px] text-center text-gray-400">Waiting for host to advance…</p>;
  }
  const msLeft = Math.max(0, deadline - now);
  const secondsLeft = Math.ceil(msLeft / 1000);
  const pct = Math.max(0, Math.min(100, (msLeft / 5000) * 100));
  return (
    <div className="space-y-1.5">
      <div className="flex items-center justify-between text-[11px] text-gray-500 dark:text-gray-400">
        <span>Next question in <strong className="text-gray-900 dark:text-white tabular-nums">{secondsLeft}s</strong></span>
        {isHost && (
          <button onClick={onNext} className="text-blue-500 hover:text-blue-600 font-medium">Skip →</button>
        )}
      </div>
      <div className="h-1 rounded-full bg-gray-200 dark:bg-[#2A2A40] overflow-hidden">
        <div className="h-full bg-blue-500 transition-all duration-100" style={{ width: `${pct}%` }} />
      </div>
    </div>
  );
}

// Small presentational helper
function Selector({ label, options, value, onChange, grid }) {
  return (
    <div>
      <label className="text-xs font-medium text-gray-500 dark:text-gray-400 mb-1.5 block">{label}</label>
      <div className={grid ? `grid ${grid} gap-1.5` : 'flex flex-wrap gap-1.5'}>
        {options.map(o => (
          <button key={o} onClick={() => onChange(o)} className={`px-2.5 py-1 rounded-lg text-xs font-medium ${value === o ? 'bg-amber-500 text-white' : 'bg-gray-100 dark:bg-[#1e1e2e] text-gray-700 dark:text-gray-300'}`}>{o}</button>
        ))}
      </div>
    </div>
  );
}
