import { useState, useEffect, useRef } from 'react';
import { Zap, Play, Check, X, BookOpen, Sparkles, ArrowRight } from 'lucide-react';
import { apiFetch } from '../../api/client';
import { fetchQBReaderTossups } from '../../api/quizMatch';
import { InlineProgress } from '../shared/ProgressBar';

const DIFFICULTIES = ['Easy', 'Medium', 'Hard', 'Tournament'];
const CATEGORIES = ['Science', 'History', 'Literature', 'Geography', 'Math', 'Art', 'Music', 'Philosophy', 'Pop Culture', 'Mixed'];

const SYSTEM_PROMPT = `You are a quiz bowl question writer. Write pyramidal quiz bowl tossup questions.

RULES:
- Each question is a single paragraph that starts with hard clues and progressively gets easier
- The answer should be guessable from the first few clues by experts, but obvious by the end
- Write exactly the number of questions requested
- Output ONLY valid JSON, no markdown

Format:
{"questions":[{"text":"Full question text here, starting with obscure clues and ending with obvious giveaway clues.","answer":"Answer"}]}`;

function generatePrompt(category, difficulty, count) {
  const guides = {
    Easy: 'Use well-known facts. Giveaway should be very obvious.',
    Medium: 'Mix of common and uncommon knowledge. Standard college level.',
    Hard: 'Use obscure clues early. Require deep subject expertise.',
    Tournament: 'NAQT/ACF Nationals level. Extremely obscure references.',
  };
  return `Generate ${count} pyramidal quiz bowl tossups.\nCategory: ${category}\nDifficulty: ${difficulty}\n${guides[difficulty] || ''}\nReturn JSON: {"questions":[{"text":"...","answer":"..."}]}`;
}

function useWordReveal(text, speed = 140, active = false) {
  const [wordIndex, setWordIndex] = useState(0);
  const words = text ? text.split(/\s+/) : [];
  const timerRef = useRef(null);
  useEffect(() => { setWordIndex(0); if (timerRef.current) clearInterval(timerRef.current); }, [text]);
  useEffect(() => {
    if (!active || !words.length) return;
    timerRef.current = setInterval(() => {
      setWordIndex((p) => { if (p >= words.length - 1) { clearInterval(timerRef.current); return p; } return p + 1; });
    }, speed);
    return () => clearInterval(timerRef.current);
  }, [active, words.length, speed]);
  function stop() { if (timerRef.current) clearInterval(timerRef.current); }
  return { revealed: words.slice(0, wordIndex + 1).join(' '), done: wordIndex >= words.length - 1, wordIndex, totalWords: words.length, stop };
}

export default function MobileQuizBowl() {
  const [view, setView] = useState('setup');
  const [questions, setQuestions] = useState([]);
  const [currentQ, setCurrentQ] = useState(0);
  const [generating, setGenerating] = useState(false);
  const [error, setError] = useState(null);

  const [category, setCategory] = useState('Mixed');
  const [difficulty, setDifficulty] = useState('Medium');
  const [questionSource, setQuestionSource] = useState('qbreader');
  const [revealSpeedMs, setRevealSpeedMs] = useState(140);

  const [buzzed, setBuzzed] = useState(false);
  const [answer, setAnswer] = useState('');
  const [showResult, setShowResult] = useState(false);
  const [correct, setCorrect] = useState(null);
  const [scores, setScores] = useState([]);
  const [reading, setReading] = useState(true);

  const q = questions[currentQ];
  const { revealed, done, stop, wordIndex, totalWords } = useWordReveal(q?.text || '', revealSpeedMs, reading && !buzzed && view === 'playing');

  async function handleStart() {
    setGenerating(true); setError(null);
    if (questionSource === 'qbreader') {
      try {
        const data = await fetchQBReaderTossups({ count: 5, category, difficulty });
        const tossups = data?.tossups || [];
        if (!tossups.length) setError('No questions for that combo. Try another.');
        else { setQuestions(tossups); setCurrentQ(0); setScores([]); setBuzzed(false); setShowResult(false); setReading(true); setView('playing'); }
      } catch (e) { setError(e.message || 'Fetch failed'); }
      setGenerating(false);
      return;
    }
    try {
      const result = await apiFetch('/api/chat', {
        method: 'POST',
        body: JSON.stringify({
          system: SYSTEM_PROMPT,
          messages: [{ role: 'user', content: generatePrompt(category, difficulty, 5) }],
          max_tokens: 4096,
        }),
      });
      const text = result.content?.[0]?.text || '';
      let parsed;
      try { parsed = JSON.parse(text); } catch { const m = text.match(/\{[\s\S]*\}/); if (m) parsed = JSON.parse(m[0]); }
      if (parsed?.questions?.length) {
        setQuestions(parsed.questions); setCurrentQ(0); setScores([]); setBuzzed(false); setShowResult(false); setReading(true); setView('playing');
      } else setError('Generation failed. Try again.');
    } catch (e) { setError(e.message || 'Generation failed'); }
    setGenerating(false);
  }

  function handleBuzz() { if (buzzed || !reading) return; setBuzzed(true); setReading(false); stop(); }
  function handleSubmit() {
    if (!answer.trim()) return;
    const norm = (s) => s.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9\s]/g, '').trim();
    const a = norm(answer); const ca = norm(q.answer);
    const isCorrect = a === ca || ca.includes(a) || a.includes(ca);
    setCorrect(isCorrect); setShowResult(true);
    setScores((p) => [...p, { question: currentQ, correct: isCorrect, buzzWord: wordIndex, totalWords, answer: answer.trim(), correctAnswer: q.answer }]);
  }
  function handleTimeout() {
    setScores((p) => [...p, { question: currentQ, correct: false, buzzWord: -1, totalWords, answer: '', correctAnswer: q.answer }]);
    setShowResult(true); setCorrect(false); setBuzzed(true);
  }
  useEffect(() => {
    if (done && !buzzed && view === 'playing') {
      const t = setTimeout(handleTimeout, 2000);
      return () => clearTimeout(t);
    }
  }, [done, buzzed, view]);

  function nextQuestion() {
    if (currentQ + 1 < questions.length) {
      setCurrentQ((p) => p + 1); setBuzzed(false); setShowResult(false); setCorrect(null); setAnswer(''); setReading(true);
    } else if (questionSource === 'qbreader') {
      fetchQBReaderTossups({ count: 5, category, difficulty }).then((data) => {
        const more = data?.tossups || [];
        if (more.length) setQuestions((prev) => [...prev, ...more]);
      }).catch(() => {});
      setTimeout(() => {
        setCurrentQ((p) => p + 1); setBuzzed(false); setShowResult(false); setCorrect(null); setAnswer(''); setReading(true);
      }, 50);
    } else {
      setView('review');
    }
  }
  function endRound() { setView('review'); }

  // ===== REVIEW =====
  if (view === 'review') {
    const totalCorrect = scores.filter((s) => s.correct).length;
    return (
      <div className="px-4 pt-6 pb-8 bg-transparent min-h-full">
        <div className="text-center mb-6">
          <div className="text-[48px] font-bold text-white tabular-nums leading-none">
            {totalCorrect}<span className="text-white/25">/{scores.length}</span>
          </div>
          <p className="text-[11px] text-white/30 mt-2 uppercase tracking-wider">{category} · {difficulty}</p>
        </div>
        <div className="space-y-1.5 mb-5">
          {scores.map((s, i) => (
            <div key={i} className={`rounded-2xl px-3.5 py-2.5 border ${s.correct ? 'bg-emerald-500/8 border-emerald-500/20' : 'bg-rose-500/8 border-rose-500/20'}`}>
              <div className="flex items-center gap-2 mb-0.5">
                {s.correct ? <Check size={12} className="text-emerald-400" /> : <X size={12} className="text-rose-400" />}
                <span className="text-[10px] font-bold text-white/40">Q{i + 1}</span>
                {s.buzzWord >= 0 && <span className="text-[10px] text-white/20">w{s.buzzWord + 1}/{s.totalWords}</span>}
              </div>
              <p className="text-[12.5px] text-white/70"><strong className="text-white/90 font-semibold">{s.correctAnswer}</strong></p>
              {s.answer && !s.correct && <p className="text-[10.5px] text-white/25 mt-0.5">{s.answer}</p>}
            </div>
          ))}
        </div>
        <div className="grid grid-cols-2 gap-2.5">
          <button onClick={() => { setView('setup'); setQuestions([]); setScores([]); }}
            className="py-3.5 rounded-2xl border border-white/10 bg-white/[0.04] text-[13px] font-bold text-white/60">
            New round
          </button>
          <button onClick={() => { setCurrentQ(0); setBuzzed(false); setShowResult(false); setReading(true); setScores([]); setAnswer(''); setView('playing'); }}
            className="py-3.5 rounded-2xl bg-white/[0.09] text-white/70 text-[13px] font-bold">
            Replay
          </button>
        </div>
      </div>
    );
  }

  // ===== PLAYING =====
  if (view === 'playing' && q) {
    const isInfinite = questionSource === 'qbreader';
    return (
      <div className="flex flex-col h-full bg-transparent">
        <div className="flex items-center gap-2 px-4 py-2.5 border-b border-white/[0.06] flex-shrink-0">
          <Zap size={14} className="text-amber-500" />
          <span className="text-[13px] font-bold text-white tabular-nums">
            Q{currentQ + 1}{isInfinite ? '' : `/${questions.length}`}
          </span>
          {isInfinite && <span className="text-[9px] font-bold uppercase tracking-wider px-1.5 py-0.5 rounded-full bg-amber-500/15 text-amber-400">∞</span>}
          <div className="flex-1" />
          <span className={`text-[12px] font-bold tabular-nums ${scores.filter((s) => s.correct).length > 0 ? 'text-emerald-400' : 'text-white/25'}`}>
            {scores.filter((s) => s.correct).length}
          </span>
          {isInfinite && (
            <button onClick={endRound}
              className="text-[10px] font-semibold px-2 py-0.5 rounded-full border border-white/10 text-white/35 active:bg-white/5">
              End
            </button>
          )}
        </div>

        <div className="flex-1 overflow-y-auto p-4">
          <p className="text-[15.5px] leading-relaxed text-white/90 font-light">
            {revealed}
            {reading && !done && <span className="inline-block w-0.5 h-4 bg-white/30 animate-pulse ml-1 align-middle rounded-sm" />}
          </p>
        </div>

        <div className="px-4 py-3 border-t border-white/[0.06] flex-shrink-0 space-y-2.5">
          {!buzzed && (
            <button onClick={handleBuzz}
              className="w-full py-4 rounded-2xl bg-red-600 active:bg-red-700 active:scale-[0.98] text-white text-[17px] font-bold uppercase tracking-[0.18em] transition-all shadow-[0_0_28px_rgba(239,68,68,0.2)]">
              BUZZ
            </button>
          )}
          {buzzed && !showResult && (
            <div className="flex gap-2">
              <input value={answer} onChange={(e) => setAnswer(e.target.value)} placeholder="Answer…" autoFocus
                className="flex-1 px-4 py-3 rounded-2xl border border-white/[0.08] bg-white/[0.05] text-[14px] text-white placeholder-white/25 outline-none focus:border-white/[0.15] transition-colors" />
              <button onClick={handleSubmit} disabled={!answer.trim()}
                className="px-5 py-3 rounded-2xl bg-white/[0.09] hover:bg-white/[0.13] text-white/65 disabled:opacity-40">
                <ArrowRight size={16} />
              </button>
            </div>
          )}
          {showResult && (
            <>
              <div className={`p-4 rounded-2xl text-center border-2 ${correct ? 'bg-emerald-500/10 border-emerald-500/40' : 'bg-rose-500/10 border-rose-500/40'}`}>
                <p className={`text-[16px] font-bold ${correct ? 'text-emerald-400' : 'text-rose-400'}`}>
                  {correct ? '✓' : '✗'} {q.answer}
                </p>
                {!correct && answer && <p className="text-[11px] text-white/30 mt-1">{answer}</p>}
              </div>
              <button onClick={nextQuestion}
                className="w-full py-3.5 rounded-2xl bg-white/[0.09] hover:bg-white/[0.13] text-white/70 text-[14px] font-bold">
                {isInfinite ? 'Next →' : (currentQ < questions.length - 1 ? 'Next →' : 'Results')}
              </button>
            </>
          )}
        </div>
      </div>
    );
  }

  // ===== SETUP =====
  return (
    <div className="px-4 pt-6 pb-8 bg-transparent min-h-full">
      {/* Hero */}
      <div className="text-center mb-6">
        <div className="inline-flex items-center justify-center w-12 h-12 rounded-2xl bg-amber-500/15 border border-amber-500/20 mb-3">
          <Zap size={22} className="text-amber-400" />
        </div>
        <h1 className="text-[24px] font-bold text-white tracking-tight">Quiz Bowl</h1>
      </div>

      {error && <p className="text-[11px] text-rose-400 px-3 py-2 mb-4 rounded-xl bg-rose-500/10 border border-rose-500/20 text-center">{error}</p>}

      {/* Source */}
      <div className="grid grid-cols-2 gap-2 mb-4">
        <MobileTile active={questionSource === 'qbreader'} icon={<BookOpen size={14} />} label="Past QB" sub="qbreader.org" onClick={() => setQuestionSource('qbreader')} />
        <MobileTile active={questionSource === 'ai'} icon={<Sparkles size={14} />} label="AI" sub="Synthetic" onClick={() => setQuestionSource('ai')} />
      </div>

      {/* Category */}
      <div className="mb-4">
        <div className="grid grid-cols-3 gap-1.5">
          {CATEGORIES.map((c) => (
            <MobilePill key={c} active={category === c} onClick={() => setCategory(c)}>{c}</MobilePill>
          ))}
        </div>
      </div>

      {/* Difficulty */}
      <div className="mb-4">
        <div className="grid grid-cols-2 gap-1.5">
          {DIFFICULTIES.map((d) => (
            <MobilePill key={d} active={difficulty === d} onClick={() => setDifficulty(d)}>{d}</MobilePill>
          ))}
        </div>
      </div>

      {/* Speed */}
      <div className="mb-5">
        <div className="flex items-center justify-between mb-1.5">
          <span className="text-[10px] text-white/30 uppercase tracking-wider">Speed</span>
          <span className="text-[11px] font-mono text-white/40">{revealSpeedMs}ms</span>
        </div>
        <input type="range" min="60" max="400" step="10" value={revealSpeedMs}
          onChange={(e) => setRevealSpeedMs(Number(e.target.value))} className="w-full" />
      </div>

      {/* Start */}
      <button onClick={handleStart} disabled={generating}
        className="w-full py-4 rounded-2xl bg-white/[0.09] active:bg-white/[0.13] disabled:opacity-50 text-white/70 text-[15px] font-bold inline-flex items-center justify-center gap-2">
        {generating
          ? <><InlineProgress active /> {questionSource === 'qbreader' ? 'Loading…' : 'Generating…'}</>
          : <><Play size={16} /> Start</>}
      </button>
    </div>
  );
}

function MobileTile({ active, icon, label, sub, onClick }) {
  return (
    <button onClick={onClick}
      className={`text-left rounded-2xl border p-3 transition-all backdrop-blur-sm ${
        active
          ? 'border-white/[0.18] bg-white/[0.07] text-white/75 shadow-[inset_0_1px_0_rgba(255,255,255,0.10)]'
          : 'border-white/[0.06] bg-white/[0.02] text-white/40 active:bg-white/[0.05]'
      }`}>
      <div className="flex items-center gap-1.5 mb-0.5">
        {icon}
        <p className="text-[12px] font-bold">{label}</p>
      </div>
      {sub && <p className="text-[10px] opacity-40">{sub}</p>}
    </button>
  );
}

function MobilePill({ active, onClick, children }) {
  return (
    <button onClick={onClick}
      className={`px-3 py-2 rounded-xl text-[12px] font-semibold tracking-tight whitespace-nowrap transition-colors backdrop-blur-sm ${
        active
          ? 'bg-white/[0.10] text-white/80 border border-white/[0.18] shadow-[inset_0_1px_0_rgba(255,255,255,0.10)]'
          : 'bg-white/[0.04] border border-white/[0.05] text-white/35 active:bg-white/[0.08] active:text-white/60'
      }`}>
      {children}
    </button>
  );
}
