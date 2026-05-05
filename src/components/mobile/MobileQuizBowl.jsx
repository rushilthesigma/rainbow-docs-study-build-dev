import { useState, useEffect, useRef } from 'react';
import { Zap, Play, Check, X, BookOpen, Sparkles } from 'lucide-react';
import { apiFetch } from '../../api/client';
import { fetchQBReaderTossups } from '../../api/quizMatch';
import { InlineProgress } from '../shared/ProgressBar';

// Mobile-first Quiz Bowl. Layouts are designed for ~375px width:
// 2-col difficulty grid (so "Tournament" fits), 3-col category grid,
// big-thumb buttons. Multiplayer is intentionally cut on mobile —
// head-to-head needs a wider canvas. Solo only here.

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
  const [view, setView] = useState('setup'); // setup | playing | review
  const [questions, setQuestions] = useState([]);
  const [currentQ, setCurrentQ] = useState(0);
  const [generating, setGenerating] = useState(false);
  const [error, setError] = useState(null);

  // Setup
  const [category, setCategory] = useState('Mixed');
  const [difficulty, setDifficulty] = useState('Medium');
  const [questionSource, setQuestionSource] = useState('qbreader');
  const [revealSpeedMs, setRevealSpeedMs] = useState(140);

  // Playing
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
      // Endless: refill in background
      fetchQBReaderTossups({ count: 5, category, difficulty }).then((data) => {
        const more = data?.tossups || [];
        if (more.length) setQuestions((prev) => [...prev, ...more]);
      }).catch(() => {});
      // Advance into the freshly-fetched batch on next paint
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
      <div className="px-4 pt-5 pb-8">
        <div className="text-center mb-5">
          <h1 className="text-[34px] font-bold tracking-[-0.02em] text-gray-900 dark:text-white tabular-nums">{totalCorrect}/{scores.length}</h1>
          <p className="text-[11px] uppercase tracking-[0.16em] font-bold text-blue-500 dark:text-blue-300 mt-1">Round complete</p>
          <p className="text-[12px] text-gray-500 dark:text-gray-400 mt-1">{category} · {difficulty}</p>
        </div>
        <div className="space-y-2 mb-5">
          {scores.map((s, i) => (
            <div key={i} className={`rounded-xl p-3 border ${s.correct ? 'bg-emerald-50 dark:bg-emerald-500/10 border-emerald-300 dark:border-emerald-500/30' : 'bg-rose-50 dark:bg-rose-500/10 border-rose-300 dark:border-rose-500/30'}`}>
              <div className="flex items-center gap-2 mb-1">
                {s.correct ? <Check size={13} className="text-emerald-500" /> : <X size={13} className="text-rose-500" />}
                <span className="text-[11px] font-bold text-gray-900 dark:text-white">Q{i + 1}</span>
                {s.buzzWord >= 0 && <span className="text-[10px] text-gray-400">word {s.buzzWord + 1}/{s.totalWords}</span>}
              </div>
              <p className="text-[12px] text-gray-600 dark:text-gray-300">Answer: <strong>{s.correctAnswer}</strong></p>
              {s.answer && !s.correct && <p className="text-[10px] text-gray-400 mt-0.5">You: {s.answer}</p>}
            </div>
          ))}
        </div>
        <div className="grid grid-cols-2 gap-2.5">
          <button onClick={() => { setView('setup'); setQuestions([]); setScores([]); }} className="py-3 rounded-2xl border border-gray-200 dark:border-white/10 text-[13px] font-bold text-gray-700 dark:text-gray-200">New round</button>
          <button onClick={() => { setCurrentQ(0); setBuzzed(false); setShowResult(false); setReading(true); setScores([]); setAnswer(''); setView('playing'); }} className="py-3 rounded-2xl bg-blue-600 text-white text-[13px] font-bold">Replay</button>
        </div>
      </div>
    );
  }

  // ===== PLAYING =====
  if (view === 'playing' && q) {
    const isInfinite = questionSource === 'qbreader';
    return (
      <div className="flex flex-col h-full">
        <div className="flex items-center gap-2 px-4 py-2.5 border-b border-gray-200 dark:border-white/[0.06] flex-shrink-0">
          <Zap size={14} className="text-amber-500" />
          <span className="text-[12.5px] font-bold text-gray-900 dark:text-white tabular-nums">
            Q{currentQ + 1}{isInfinite ? '' : `/${questions.length}`}
          </span>
          {isInfinite && <span className="text-[9px] font-bold uppercase tracking-wider px-1.5 py-0.5 rounded-full bg-amber-500/15 text-amber-600 dark:text-amber-300">∞</span>}
          <div className="flex-1" />
          <span className={`text-[11.5px] font-bold tabular-nums ${scores.filter((s) => s.correct).length > 0 ? 'text-emerald-500' : 'text-gray-400'}`}>{scores.filter((s) => s.correct).length} pts</span>
          {isInfinite && (
            <button onClick={endRound} className="text-[10px] font-semibold px-2 py-0.5 rounded-full border border-gray-200 dark:border-white/10 text-gray-500 dark:text-gray-400 active:bg-gray-100 dark:active:bg-white/[0.06]">End</button>
          )}
        </div>
        <div className="flex-1 overflow-y-auto p-4">
          <p className="text-[15.5px] leading-relaxed text-gray-900 dark:text-gray-100">
            {revealed}
            {reading && !done && <span className="inline-block w-0.5 h-4 bg-blue-500 animate-pulse ml-1 align-middle" />}
          </p>
        </div>
        <div className="px-4 py-3 border-t border-gray-200 dark:border-white/[0.06] flex-shrink-0 space-y-2.5">
          {!buzzed && (
            <button onClick={handleBuzz} className="w-full py-4 rounded-2xl bg-red-600 hover:bg-red-700 active:scale-[0.98] text-white text-[17px] font-bold uppercase tracking-[0.18em] transition-transform">BUZZ</button>
          )}
          {buzzed && !showResult && (
            <div className="flex gap-2">
              <input value={answer} onChange={(e) => setAnswer(e.target.value)} placeholder="Your answer…" autoFocus className="flex-1 px-4 py-3 rounded-2xl border border-gray-200 dark:border-white/[0.08] bg-white dark:bg-[#13131f] text-[14px] outline-none" />
              <button onClick={handleSubmit} disabled={!answer.trim()} className="px-4 py-3 rounded-2xl bg-blue-600 text-white text-[13px] font-bold disabled:opacity-40">Submit</button>
            </div>
          )}
          {showResult && (
            <>
              <div className={`p-4 rounded-2xl text-center ${correct ? 'bg-emerald-500/10 border-2 border-emerald-500' : 'bg-rose-500/10 border-2 border-rose-500'}`}>
                <p className={`text-[16px] font-bold ${correct ? 'text-emerald-500' : 'text-rose-500'}`}>{correct ? 'CORRECT' : 'WRONG'}</p>
                <p className="text-[12.5px] text-gray-700 dark:text-gray-200 mt-1">Answer: <strong>{q.answer}</strong></p>
                {!correct && answer && <p className="text-[10.5px] text-gray-400 mt-0.5">You said: {answer}</p>}
              </div>
              <button onClick={nextQuestion} className="w-full py-3 rounded-2xl bg-blue-600 text-white text-[14px] font-bold">
                {isInfinite ? 'Next question' : (currentQ < questions.length - 1 ? 'Next question' : 'See results')}
              </button>
            </>
          )}
        </div>
      </div>
    );
  }

  // ===== SETUP =====
  return (
    <div className="px-4 pt-5 pb-8">
      {/* Centered heading */}
      <div className="text-center mb-6">
        <div className="inline-grid place-items-center w-12 h-12 rounded-2xl bg-amber-500/15 text-amber-500 mb-2">
          <Zap size={22} />
        </div>
        <h1 className="text-[24px] font-bold tracking-[-0.02em] text-gray-900 dark:text-white">Quiz Bowl</h1>
        <p className="text-[12.5px] text-gray-500 dark:text-gray-400 mt-1">Pyramidal tossups · buzz when you know</p>
      </div>

      {error && <p className="text-[11px] text-rose-500 px-3 py-2 mb-4 rounded-xl bg-rose-50 dark:bg-rose-500/10 text-center">{error}</p>}

      {/* Source */}
      <Section label="Question source">
        <div className="grid grid-cols-2 gap-2">
          <SourceTile
            active={questionSource === 'qbreader'}
            icon={<BookOpen size={14} />}
            title="Past QB packets"
            sub="Real · qbreader.org"
            onClick={() => setQuestionSource('qbreader')}
          />
          <SourceTile
            active={questionSource === 'ai'}
            icon={<Sparkles size={14} />}
            title="AI-generated"
            sub="Synthetic"
            onClick={() => setQuestionSource('ai')}
          />
        </div>
      </Section>

      {/* Category — 3-col compact pill grid */}
      <Section label="Category">
        <div className="grid grid-cols-3 gap-1.5">
          {CATEGORIES.map((c) => (
            <Pill key={c} active={category === c} onClick={() => setCategory(c)}>{c}</Pill>
          ))}
        </div>
      </Section>

      {/* Difficulty — 2x2 so Tournament fits */}
      <Section label="Difficulty">
        <div className="grid grid-cols-2 gap-1.5">
          {DIFFICULTIES.map((d) => (
            <Pill key={d} active={difficulty === d} onClick={() => setDifficulty(d)}>{d}</Pill>
          ))}
        </div>
      </Section>

      {/* Endless callout */}
      {questionSource === 'qbreader' && (
        <div className="rounded-2xl border border-amber-300 dark:border-amber-500/40 bg-amber-50 dark:bg-amber-500/10 px-3.5 py-2.5 mb-4">
          <p className="text-[11.5px] font-bold text-amber-700 dark:text-amber-300 flex items-center gap-1.5">
            <Zap size={11} /> Endless round
          </p>
          <p className="text-[10.5px] text-amber-700/80 dark:text-amber-200/80 mt-0.5 leading-relaxed">
            Real packets stream in continuously. Tap End to see your stats.
          </p>
        </div>
      )}

      {/* Reading speed */}
      <Section label={`Reading speed · ${revealSpeedMs}ms/word`}>
        <input
          type="range" min="60" max="400" step="10"
          value={revealSpeedMs}
          onChange={(e) => setRevealSpeedMs(Number(e.target.value))}
          className="w-full"
        />
      </Section>

      {/* Start */}
      <button
        onClick={handleStart}
        disabled={generating}
        className="w-full py-3.5 rounded-2xl bg-blue-600 active:bg-blue-700 disabled:opacity-50 text-white text-[14.5px] font-bold inline-flex items-center justify-center gap-2"
      >
        {generating
          ? <><InlineProgress active /> {questionSource === 'qbreader' ? 'Loading…' : 'Generating…'}</>
          : <><Play size={15} /> Start round</>}
      </button>
    </div>
  );
}

// ===== bits =====

function Section({ label, children }) {
  return (
    <div className="mb-4">
      <p className="text-[10.5px] font-bold uppercase tracking-[0.16em] text-gray-500 dark:text-gray-400 mb-2 px-0.5">{label}</p>
      {children}
    </div>
  );
}

function SourceTile({ active, icon, title, sub, onClick }) {
  return (
    <button
      onClick={onClick}
      className={`text-left rounded-2xl border p-3 transition-colors ${
        active
          ? 'border-blue-500 bg-blue-500/10 text-blue-700 dark:text-blue-200'
          : 'border-gray-200 dark:border-white/[0.06] bg-white dark:bg-[#13131f] text-gray-700 dark:text-gray-300'
      }`}
    >
      <div className="flex items-center gap-1.5 mb-0.5">
        {icon}
        <p className="text-[12px] font-bold tracking-tight">{title}</p>
      </div>
      <p className="text-[10px] opacity-70">{sub}</p>
    </button>
  );
}

function Pill({ active, onClick, children }) {
  return (
    <button
      onClick={onClick}
      className={`px-3 py-2 rounded-xl text-[12px] font-semibold tracking-tight whitespace-nowrap transition-colors ${
        active
          ? 'bg-blue-600 text-white'
          : 'bg-gray-100 dark:bg-white/[0.05] text-gray-700 dark:text-gray-300 active:bg-gray-200 dark:active:bg-white/[0.10]'
      }`}
    >
      {children}
    </button>
  );
}
