import { useState, useEffect, useRef, useCallback } from 'react';
import { Zap, Users, Copy, Check, X, Trophy, Play, LogOut, ArrowLeft } from 'lucide-react';
import ProgressBar, { InlineProgress } from '../../shared/ProgressBar';
import {
  createMatch, joinMatch, startMatch, buzzMatch, answerMatch, nextMatchQuestion,
  leaveMatch, streamMatch,
} from '../../../api/quizMatch';

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
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);
  const [match, setMatch] = useState(null);

  const [question, setQuestion] = useState(null);
  const [buzz, setBuzz] = useState(null);
  const [answer, setAnswer] = useState('');
  const [answerResult, setAnswerResult] = useState(null);
  const [autoAdvanceDeadline, setAutoAdvanceDeadline] = useState(null);
  const [lockedOut, setLockedOut] = useState([]);
  const [wrongFlash, setWrongFlash] = useState(null);
  const [abandoned, setAbandoned] = useState(null);

  const abortRef = useRef(null);
  const myId = user?.id;

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
      onMatchEnd: ({ scores, abandoned: wasAbandoned, leftBy, reason }) => {
        setMatch(prev => prev ? { ...prev, players: prev.players.map(p => ({ ...p, score: scores[p.userId] || 0 })) } : prev);
        setQuestion(null); setBuzz(null); setAnswer(''); setAnswerResult(null);
        setAutoAdvanceDeadline(null); setWrongFlash(null);
        if (wasAbandoned) setAbandoned({ leftBy, reason });
        setView('finished');
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
    try { await startMatch(code, { category, difficulty, questionCount, revealSpeedMs }); }
    catch (e) { setError(e.message); }
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
        <div className="p-5 space-y-4">
          {/* Back */}
          <button onClick={onExit}
            className="flex items-center gap-1.5 text-[12px] text-white/35 hover:text-white/60 transition-colors">
            <ArrowLeft size={13} /> Back
          </button>

          {error && <p className="text-[11px] text-rose-400 px-3 py-2 rounded-2xl bg-rose-500/10 border border-rose-500/20 text-center">{error}</p>}

          <button onClick={handleCreate} disabled={busy}
            className="w-full py-3 rounded-2xl border border-white/[0.08] bg-white/[0.04] hover:bg-white/[0.07] text-white/70 hover:text-white/90 text-[13px] font-semibold disabled:opacity-40 inline-flex items-center justify-center gap-2 transition-colors backdrop-blur-sm">
            {busy ? <><InlineProgress active /> Creating…</> : <><Play size={13} /> Create invite code</>}
          </button>

          <div className="flex items-center gap-3">
            <div className="flex-1 h-px bg-white/[0.04]" />
            <span className="text-[10px] text-white/20 uppercase tracking-wider">or</span>
            <div className="flex-1 h-px bg-white/[0.04]" />
          </div>

          <div className="rounded-2xl border border-white/[0.06] bg-white/[0.02] backdrop-blur-sm p-4 space-y-3">
            <div className="flex gap-2">
              <input
                value={joinCodeInput}
                onChange={e => setJoinCodeInput(e.target.value.toUpperCase())}
                placeholder="6-LETTER CODE"
                maxLength={6}
                onKeyDown={e => e.key === 'Enter' && handleJoin()}
                className="flex-1 px-3 py-2.5 rounded-2xl border border-white/[0.06] bg-white/[0.03] text-[13px] font-mono tracking-[0.2em] text-center text-white/80 placeholder-white/20 outline-none focus:border-white/15 transition-colors"
              />
              <button onClick={handleJoin} disabled={!joinCodeInput.trim() || busy}
                className="px-4 py-2.5 rounded-2xl border border-white/[0.08] bg-white/[0.05] hover:bg-white/[0.09] text-white/60 hover:text-white/80 text-[13px] font-semibold disabled:opacity-30 transition-colors backdrop-blur-sm">
                Join
              </button>
            </div>
          </div>
        </div>
      </div>
    );
  }

  // ============ LOBBY ============
  if (view === 'lobby') {
    const playerCount = match?.players?.length || 0;
    const waiting = playerCount < 2;
    return (
      <div className="h-full overflow-y-auto bg-transparent">
        <div className="p-5 space-y-3">
          {/* Back */}
          <button onClick={handleLeave}
            className="flex items-center gap-1.5 text-[12px] text-white/35 hover:text-white/60 transition-colors">
            <ArrowLeft size={13} /> Back
          </button>

          <p className="text-[13px] font-semibold text-white/60 text-center">
            {waiting ? 'Waiting for opponent…' : isHost ? 'Configure match' : 'Waiting for host'}
          </p>

          {error && <p className="text-[11px] text-rose-400 px-3 py-2 rounded-2xl bg-rose-500/10 border border-rose-500/20 text-center">{error}</p>}

          {/* Invite code */}
          <div className="rounded-2xl border border-white/[0.06] bg-white/[0.02] backdrop-blur-sm p-4 text-center">
            <div className="flex items-center justify-center gap-2">
              <p className="text-[28px] font-mono font-bold tracking-[0.3em] text-white/70">{code}</p>
              <button onClick={() => navigator.clipboard.writeText(code)}
                className="p-1.5 rounded-xl text-white/25 hover:text-white/50 hover:bg-white/[0.05] transition-colors" title="Copy">
                <Copy size={13} />
              </button>
            </div>
            <p className="text-[10px] text-white/25 mt-1">
              {waiting ? 'Share with a friend' : 'Opponent joined'}
            </p>
          </div>

          {/* Players */}
          <div className="space-y-1.5">
            {(match?.players || []).map(p => (
              <div key={p.userId} className="flex items-center gap-2 px-3 py-2 rounded-2xl border border-white/[0.05] bg-white/[0.02]">
                <div className="w-6 h-6 rounded-full bg-white/[0.08] text-white/50 flex items-center justify-center text-[11px] font-bold">
                  {(p.name || '?')[0]?.toUpperCase()}
                </div>
                <span className="text-[13px] font-medium text-white/70">{p.name}</span>
                {p.userId === match?.hostId && <span className="text-[9px] font-bold px-1.5 py-0.5 rounded-full bg-white/[0.06] text-white/30">HOST</span>}
                {p.userId === myId && <span className="text-[9px] text-white/20 ml-auto">you</span>}
              </div>
            ))}
            {waiting && (
              <div className="flex items-center gap-2 px-3 py-2 rounded-2xl border border-dashed border-white/[0.06] text-[11px] text-white/25 italic">
                <span className="relative flex h-2 w-2">
                  <span className="absolute inline-flex h-full w-full rounded-full bg-white/30 animate-ping" />
                  <span className="relative inline-flex rounded-full h-2 w-2 bg-white/25" />
                </span>
                Waiting for player 2…
              </div>
            )}
          </div>

          {/* Settings — host only, both players present */}
          {!waiting && isHost && (
            <div className="rounded-2xl border border-white/[0.06] bg-white/[0.02] backdrop-blur-sm p-4 space-y-3">
              <MatchSelector label="Category" value={category} onChange={setCategory}
                options={['Science','History','Literature','Geography','Math','Art','Music','Philosophy','Pop Culture','Mixed']} />
              <MatchSelector label="Difficulty" value={difficulty} onChange={setDifficulty}
                options={['Easy','Medium','Hard','Tournament']} grid="grid-cols-4" />
              <div>
                <div className="flex items-center justify-between mb-1.5">
                  <span className="text-[10px] text-white/30 uppercase tracking-wider">Questions</span>
                  <span className="text-[11px] font-mono text-white/35">{questionCount}</span>
                </div>
                <input type="range" min="5" max="20" step="5" value={questionCount}
                  onChange={e => setQuestionCount(Number(e.target.value))} className="w-full" />
              </div>
              <div>
                <div className="flex items-center justify-between mb-1.5">
                  <span className="text-[10px] text-white/30 uppercase tracking-wider">Speed</span>
                  <span className="text-[11px] font-mono text-white/35">{revealSpeedMs}ms</span>
                </div>
                <input type="range" min="60" max="300" step="10" value={revealSpeedMs}
                  onChange={e => setRevealSpeedMs(Number(e.target.value))} className="w-full" />
              </div>
            </div>
          )}

          {!waiting && !isHost && (
            <div className="rounded-2xl border border-white/[0.05] bg-white/[0.02] p-3 text-center text-[11px] text-white/30">
              Host is configuring. Questions coming soon…
            </div>
          )}

          <div className="flex gap-2">
            <button onClick={handleLeave}
              className="flex-1 py-2.5 rounded-2xl border border-white/[0.06] bg-white/[0.02] text-[12px] font-medium text-white/40 hover:text-white/60 inline-flex items-center justify-center gap-1.5 transition-colors">
              <LogOut size={12} /> Leave
            </button>
            {isHost && (
              <button onClick={handleStart} disabled={waiting}
                className="flex-1 py-2.5 rounded-2xl bg-white/[0.08] hover:bg-white/[0.12] backdrop-blur-sm disabled:opacity-30 text-white/65 text-[12px] font-semibold inline-flex items-center justify-center gap-1.5 transition-colors border border-white/[0.08]">
                <Play size={12} /> Start
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
function PlayingView({ match, question, buzz, answerResult, answer, setAnswer, onBuzz, onSubmitAnswer, onNext, onLeave, iBuzzed, isHost, myId, lockedOut = [], wrongFlash, autoAdvanceDeadline, revealSpeedMs }) {
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
        <div className="flex-1 flex items-center gap-2 justify-center">
          {players.map(p => (
            <div key={p.userId} className={`flex items-center gap-1.5 px-2 py-1 rounded-xl text-[11px] border ${p.userId === myId ? 'bg-white/[0.06] border-white/[0.10] text-white/60' : 'bg-white/[0.03] border-white/[0.05] text-white/35'}`}>
              <span className="font-medium">{p.name}{p.userId === myId ? ' ·' : ''}</span>
              <span className="font-bold tabular-nums">{p.score || 0}</span>
            </div>
          ))}
        </div>
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
            {wrongFlash.answer ? ` — "${wrongFlash.answer}"` : ''} · continues
          </div>
        )}
        {!buzz && !answerResult && !iAmLocked && (
          <>
            <button onClick={onBuzz}
              className="w-full py-4 rounded-2xl bg-red-600/80 hover:bg-red-500/80 backdrop-blur-sm text-white text-[15px] font-bold uppercase tracking-[0.15em] active:scale-[0.98] transition-all shadow-[0_0_24px_rgba(239,68,68,0.2)]">
              BUZZ
            </button>
            <p className="text-[10px] text-white/20 text-center">Space to buzz</p>
          </>
        )}
        {!buzz && !answerResult && iAmLocked && (
          <div className="w-full py-3 rounded-2xl border border-white/[0.05] bg-white/[0.02] text-center text-[11px] text-white/25">
            Locked out — wait for next question
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
      <span className="text-[10px] text-white/30 uppercase tracking-wider block mb-1.5">{label}</span>
      <div className={grid ? `grid ${grid} gap-1.5` : 'flex flex-wrap gap-1.5'}>
        {options.map(o => (
          <button key={o} onClick={() => onChange(o)}
            className={`px-2.5 py-1 rounded-xl text-[11px] font-semibold backdrop-blur-sm transition-colors ${value === o ? 'bg-white/[0.10] text-white/80 border border-white/[0.18] shadow-[inset_0_1px_0_rgba(255,255,255,0.10)]' : 'bg-white/[0.04] border border-white/[0.04] text-white/35 hover:bg-white/[0.07] hover:text-white/55'}`}>
            {o}
          </button>
        ))}
      </div>
    </div>
  );
}
