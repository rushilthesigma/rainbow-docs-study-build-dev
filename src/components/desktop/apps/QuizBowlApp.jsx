import { useState, useEffect, useRef } from 'react';
import { Zap, Play, Check, X, Loader2, Lightbulb, Users, BookOpen, Sparkles, Settings } from 'lucide-react';
import { apiFetch } from '../../../api/client';
import { fetchQBReaderTossups } from '../../../api/quizMatch';
import { useWindowManager } from '../../../context/WindowManagerContext';
import { setPendingLesson } from '../../../utils/pendingLesson';
import useBrowserBack from '../../../hooks/useBrowserBack';
import { useAuth } from '../../../context/AuthContext';
import QuizBowlMatch from './QuizBowlMatch';
import { InlineProgress } from '../../shared/ProgressBar';

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

function generatePrompt(category, difficulty, count, customInstructions) {
  const difficultyGuide = {
    Easy: 'Use well-known facts. Giveaway clue should be very obvious. Target: high school students.',
    Medium: 'Mix of common and uncommon knowledge. Standard college quiz bowl level.',
    Hard: 'Use obscure clues early. Require deep subject expertise. Only the giveaway should be accessible to non-experts.',
    Tournament: 'NAQT/ACF Nationals level. Opening clues should be nearly impossible except for top players. Use extremely obscure references, secondary works, lesser-known facts. Questions should be 5-7 sentences. Even the giveaway should require solid knowledge.',
  };
  return `Generate ${count} pyramidal quiz bowl tossup questions.
Category: ${category}
Difficulty: ${difficulty}
${difficultyGuide[difficulty] || ''}
${customInstructions ? `\nAdditional instructions from the user: ${customInstructions}` : ''}
Each question must be pyramidal (hardest clues first, easiest giveaway last).
Return JSON: {"questions":[{"text":"...","answer":"..."}]}`;
}

// Word-by-word display with timing
function useWordReveal(text, speed = 140, active = false) {
  const [wordIndex, setWordIndex] = useState(0);
  const words = text ? text.split(/\s+/) : [];
  const timerRef = useRef(null);

  useEffect(() => {
    setWordIndex(0);
    if (timerRef.current) clearInterval(timerRef.current);
  }, [text]);

  useEffect(() => {
    if (!active || !words.length) return;
    timerRef.current = setInterval(() => {
      setWordIndex(prev => {
        if (prev >= words.length - 1) { clearInterval(timerRef.current); return prev; }
        return prev + 1;
      });
    }, speed);
    return () => clearInterval(timerRef.current);
  }, [active, words.length, speed]);

  function stop() { if (timerRef.current) clearInterval(timerRef.current); }
  const revealed = words.slice(0, wordIndex + 1).join(' ');
  const done = wordIndex >= words.length - 1;
  return { revealed, done, wordIndex, totalWords: words.length, stop };
}

export default function QuizBowlApp() {
  const { openApp } = useWindowManager();
  function openLessonFor(topic) {
    if (!topic) return;
    setPendingLesson({ topic, difficulty: 'beginner' });
    openApp('lessons', 'Lessons');
  }
  const [view, setView] = useState('setup'); // 'setup' | 'playing' | 'review' | 'multiplayer'
  useBrowserBack(view !== 'setup', () => setView('setup'));
  const { user } = useAuth();
  const [questions, setQuestions] = useState([]);
  const [currentQ, setCurrentQ] = useState(0);
  const [generating, setGenerating] = useState(false);
  const [error, setError] = useState(null);

  // Setup
  const [category, setCategory] = useState('Mixed');
  const [difficulty, setDifficulty] = useState('Medium');
  const [questionCount, setQuestionCount] = useState(10);
  const [customInstructions, setCustomInstructions] = useState('');
  const [revealSpeedMs, setRevealSpeedMs] = useState(140);
  // Question source — 'qbreader' fetches real packet tossups from
  // qbreader.org's API, 'ai' calls Gemini to write fresh ones.
  const [questionSource, setQuestionSource] = useState('qbreader');
  // Snapshot of `questionSource` at play-time. We need a stable copy so
  // changing the setup picker mid-round can't flip play behavior.
  const [playingSource, setPlayingSource] = useState('ai');

  // Playing
  const [buzzed, setBuzzed] = useState(false);
  const [answer, setAnswer] = useState('');
  const [showResult, setShowResult] = useState(false);
  const [correct, setCorrect] = useState(null);
  const [scores, setScores] = useState([]);
  const [reading, setReading] = useState(true);
  // QBReader rounds are endless — refill the buffer when the user gets
  // close to the tail. `fetchingMoreRef` debounces overlapping refills,
  // `refilling` is the visible mirror used for button labels.
  const fetchingMoreRef = useRef(false);
  const [refilling, setRefilling] = useState(false);
  // Settings panel open flag (visible only during play, only when source = qbreader)
  const [settingsOpen, setSettingsOpen] = useState(false);
  const QB_BATCH_SIZE = 5;
  const QB_PREFETCH_THRESHOLD = 3; // start a refill when fewer than N remain after current

  const q = questions[currentQ];
  const { revealed, done, stop, wordIndex, totalWords } = useWordReveal(q?.text || '', revealSpeedMs, reading && !buzzed && view === 'playing');

  async function handleGenerate() {
    setGenerating(true);
    setError(null);
    // Branch on source. QBReader = real packet questions (endless);
    // AI = Gemini-written, fixed length per the slider.
    if (questionSource === 'qbreader') {
      try {
        // Pull a small initial batch — the rest stream in lazily as
        // the user advances through questions. See the "refill" effect.
        const data = await fetchQBReaderTossups({ count: QB_BATCH_SIZE, category, difficulty });
        const tossups = data?.tossups || [];
        if (!tossups.length) {
          setError('QBReader returned no questions for that combo. Try a different category or difficulty.');
        } else {
          setQuestions(tossups);
          setPlayingSource('qbreader');
          setCurrentQ(0); setScores([]); setBuzzed(false); setShowResult(false); setReading(true);
          fetchingMoreRef.current = false;
          setView('playing');
        }
      } catch (err) {
        setError(err.message || 'Failed to fetch QBReader questions.');
      }
      setGenerating(false);
      return;
    }
    try {
      const result = await apiFetch('/api/chat', {
        method: 'POST',
        body: JSON.stringify({
          system: SYSTEM_PROMPT,
          messages: [{ role: 'user', content: generatePrompt(category, difficulty, questionCount, customInstructions) }],
          max_tokens: 8192,
        }),
      });
      const text = result.content?.[0]?.text || '';
      let parsed;
      try { parsed = JSON.parse(text); } catch { const m = text.match(/\{[\s\S]*\}/); if (m) parsed = JSON.parse(m[0]); }
      if (parsed?.questions?.length) {
        setQuestions(parsed.questions);
        setPlayingSource('ai');
        setCurrentQ(0); setScores([]); setBuzzed(false); setShowResult(false); setReading(true);
        setView('playing');
      } else setError('Failed to generate questions. Try again.');
    } catch (err) { setError(err.message || 'Generation failed'); }
    setGenerating(false);
  }

  // Endless QBReader: when we get within QB_PREFETCH_THRESHOLD of the
  // tail of the buffer, fire a background refill. fetchingMoreRef stops
  // overlapping calls. Safe to no-op when the source is AI / fixed.
  useEffect(() => {
    if (view !== 'playing') return;
    if (playingSource !== 'qbreader') return;
    const remaining = questions.length - currentQ - 1;
    if (remaining > QB_PREFETCH_THRESHOLD) return;
    if (fetchingMoreRef.current) return;
    fetchingMoreRef.current = true;
    setRefilling(true);
    fetchQBReaderTossups({ count: QB_BATCH_SIZE, category, difficulty })
      .then(data => {
        const more = data?.tossups || [];
        if (more.length) setQuestions(prev => [...prev, ...more]);
      })
      .catch(() => { /* swallow — user can retry by advancing again */ })
      .finally(() => {
        fetchingMoreRef.current = false;
        setRefilling(false);
      });
  }, [currentQ, questions.length, view, playingSource, category, difficulty]);

  // Mid-round settings change: when category/difficulty changes WHILE
  // playing in QBReader mode, drop the buffered tail so the very next
  // tossup reflects the new selection. Otherwise the user would play
  // through ~5 prefetched stale-category questions before seeing the
  // change applied. Tracks the last-applied values via refs so we only
  // slice when the values actually move (not on every render).
  const prevCategoryRef = useRef(category);
  const prevDifficultyRef = useRef(difficulty);
  useEffect(() => {
    if (view !== 'playing' || playingSource !== 'qbreader') {
      prevCategoryRef.current = category;
      prevDifficultyRef.current = difficulty;
      return;
    }
    const changed = category !== prevCategoryRef.current || difficulty !== prevDifficultyRef.current;
    if (!changed) return;
    prevCategoryRef.current = category;
    prevDifficultyRef.current = difficulty;
    // Keep the current question + drop the tail; prefetch effect will
    // refill with the new params on the next tick.
    setQuestions(prev => prev.slice(0, currentQ + 1));
  }, [category, difficulty, view, playingSource, currentQ]);

  function handleBuzz() {
    if (buzzed || !reading) return;
    setBuzzed(true); setReading(false); stop();
  }

  function handleSubmit() {
    if (!answer.trim()) return;
    const norm = s => s.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^a-z0-9\s]/g, '').trim();
    const a = norm(answer); const ca = norm(q.answer);
    function lev(s1, s2) {
      const m = s1.length, n = s2.length;
      if (m === 0) return n; if (n === 0) return m;
      const d = Array.from({ length: m + 1 }, (_, i) => [i]);
      for (let j = 1; j <= n; j++) d[0][j] = j;
      for (let i = 1; i <= m; i++) for (let j = 1; j <= n; j++)
        d[i][j] = Math.min(d[i-1][j] + 1, d[i][j-1] + 1, d[i-1][j-1] + (s1[i-1] !== s2[j-1] ? 1 : 0));
      return d[m][n];
    }
    const dist = lev(a, ca);
    const threshold = Math.max(1, Math.floor(ca.length * 0.25));
    const isCorrect = a === ca || ca.includes(a) || a.includes(ca) || dist <= threshold ||
      ca.split(/[\s,]+/).some(w => w.length > 2 && (a.includes(w) || lev(a, w) <= 1)) ||
      a.split(/[\s,]+/).some(w => w.length > 2 && (ca.includes(w) || lev(ca, w) <= 1));
    setCorrect(isCorrect); setShowResult(true);
    setScores(prev => [...prev, { question: currentQ, correct: isCorrect, buzzWord: wordIndex, totalWords, answer: answer.trim(), correctAnswer: q.answer }]);
  }

  function handleTimeout() {
    setScores(prev => [...prev, { question: currentQ, correct: false, buzzWord: -1, totalWords, answer: '', correctAnswer: q.answer }]);
    setShowResult(true); setCorrect(false); setBuzzed(true);
  }

  useEffect(() => {
    if (done && !buzzed && view === 'playing') {
      const t = setTimeout(handleTimeout, 2000);
      return () => clearTimeout(t);
    }
  }, [done, buzzed, view]);

  function nextQuestion() {
    const isInfinite = playingSource === 'qbreader';
    // Endless mode never auto-ends. If the buffer is somehow empty (the
    // refill effect failed or hasn't landed yet), bail out — the next
    // tick of the effect will fill it and the user can press again.
    if (isInfinite) {
      if (currentQ + 1 >= questions.length) return;
      setCurrentQ(prev => prev + 1);
      setBuzzed(false); setShowResult(false); setCorrect(null); setAnswer(''); setReading(true);
      return;
    }
    if (currentQ < questions.length - 1) {
      setCurrentQ(prev => prev + 1);
      setBuzzed(false); setShowResult(false); setCorrect(null); setAnswer(''); setReading(true);
    } else setView('review');
  }

  // Endless mode: explicit exit from a long QBReader run.
  function endRound() {
    setView('review');
  }

  // Solo keyboard (space/enter)
  const justSubmitted = useRef(false);
  useEffect(() => {
    if (view !== 'playing') return;
    function handleKey(e) {
      if (e.key === ' ' && !buzzed && e.target.tagName !== 'INPUT' && e.target.tagName !== 'TEXTAREA') {
        e.preventDefault(); handleBuzz();
      }
      if (e.key === 'Enter' && buzzed && !showResult) { e.preventDefault(); handleSubmit(); justSubmitted.current = true; }
      else if (e.key === 'Enter' && showResult) {
        if (justSubmitted.current) { justSubmitted.current = false; return; }
        e.preventDefault(); nextQuestion();
      }
    }
    window.addEventListener('keydown', handleKey);
    return () => window.removeEventListener('keydown', handleKey);
  }, [view, buzzed, showResult, answer]);

  // ===== REVIEW =====
  if (view === 'review') {
    const totalCorrect = scores.filter(s => s.correct).length;
    const earlyBuzzes = scores.filter(s => s.correct && s.buzzWord < s.totalWords * 0.5).length;
    // Endless QBReader: score is over questions actually answered, not over
    // the buffered queue (which may include un-played prefetches).
    const denom = playingSource === 'qbreader' ? scores.length : questions.length;
    return (
      <div className="h-full overflow-y-auto">
        <div className="p-5">
          <div className="text-center mb-6">
            <h2 className="text-2xl font-bold text-gray-900 dark:text-white">{totalCorrect}/{denom}</h2>
            <p className="text-sm text-gray-500 mt-1">{earlyBuzzes} early buzzes</p>
            <p className="text-xs text-gray-400 mt-0.5">{category} / {difficulty}{playingSource === 'qbreader' ? ' · QBReader' : ''}</p>
          </div>
          <div className="space-y-2 mb-6">
            {scores.map((s, i) => (
              <div key={i} className={`rounded-xl p-3 border ${s.correct ? 'bg-emerald-50 dark:bg-emerald-900/10 border-emerald-200 dark:border-emerald-800' : 'bg-rose-50 dark:bg-rose-900/10 border-rose-200 dark:border-rose-800'}`}>
                <div className="flex items-center gap-2 mb-1">
                  {s.correct ? <Check size={14} className="text-emerald-500" /> : <X size={14} className="text-rose-500" />}
                  <span className="text-xs font-medium text-gray-900 dark:text-white">Q{i + 1}</span>
                  {s.buzzWord >= 0 && <span className="text-[10px] text-gray-400">Buzzed at word {s.buzzWord + 1}/{s.totalWords}</span>}
                  <div className="flex-1" />
                  <button
                    onClick={() => openLessonFor(s.correctAnswer)}
                    className="inline-flex items-center gap-1 text-[10px] font-medium px-2 py-0.5 rounded-full border border-amber-400/60 text-amber-700 dark:text-amber-300 hover:bg-amber-100 dark:hover:bg-amber-500/20"
                  >
                    <Lightbulb size={10} /> Lesson
                  </button>
                </div>
                <p className="text-xs text-gray-600 dark:text-gray-300">Answer: <strong>{s.correctAnswer}</strong></p>
                {s.answer && !s.correct && <p className="text-[10px] text-gray-400 mt-0.5">You said: {s.answer}</p>}
              </div>
            ))}
          </div>
          <div className="flex gap-2">
            <button onClick={() => { setView('setup'); setQuestions([]); setScores([]); }} className="flex-1 px-4 py-2.5 rounded-xl border border-gray-200 dark:border-[#2A2A40] text-sm font-medium text-gray-700 dark:text-gray-300">New Set</button>
            <button onClick={() => { setCurrentQ(0); setBuzzed(false); setShowResult(false); setReading(true); setScores([]); setAnswer(''); setView('playing'); }} className="flex-1 px-4 py-2.5 rounded-xl bg-blue-600 text-white text-sm font-medium">Replay</button>
          </div>
        </div>
      </div>
    );
  }

  // ===== PLAYING =====
  if (view === 'playing' && q) {
    const isInfinite = playingSource === 'qbreader';
    return (
      <div className="flex flex-col h-full">
        <div className="flex items-center gap-2 px-4 py-2.5 border-b border-gray-200 dark:border-[#2A2A40] flex-shrink-0 relative">
          <Zap size={16} className="text-amber-500" />
          <span className="text-sm font-semibold text-gray-900 dark:text-white">
            Q{currentQ + 1}{isInfinite ? '' : `/${questions.length}`}
          </span>
          {isInfinite && (
            <span className="text-[10px] font-bold uppercase tracking-wider px-1.5 py-0.5 rounded-full bg-amber-500/15 text-amber-600 dark:text-amber-300">∞</span>
          )}
          <div className="flex-1" />
          <span className="text-xs text-gray-400">{category} / {difficulty}</span>
          <span className={`text-xs font-bold ${scores.filter(s => s.correct).length > 0 ? 'text-emerald-500' : 'text-gray-400'}`}>{scores.filter(s => s.correct).length} pts</span>
          {isInfinite && (
            <>
              <button
                onClick={() => setSettingsOpen(o => !o)}
                title="Adjust settings"
                aria-label="Adjust settings"
                className={`ml-1 p-1 rounded-md border ${settingsOpen ? 'border-blue-500 bg-blue-500/10 text-blue-500' : 'border-transparent text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 hover:bg-gray-100 dark:hover:bg-[#1e1e2e]'}`}
              >
                <Settings size={14} />
              </button>
              <button
                onClick={endRound}
                className="text-[10px] font-medium px-2 py-0.5 rounded-full border border-gray-200 dark:border-[#2A2A40] text-gray-500 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-[#1e1e2e]"
              >
                End round
              </button>
            </>
          )}
          {/* In-play settings panel — only the next refilled tossup picks
              up the new category/difficulty; the question already on
              screen is left alone (mid-question swap would be jarring). */}
          {isInfinite && settingsOpen && (
            <div className="absolute right-2 top-full mt-1 w-72 z-20 rounded-xl border border-gray-200 dark:border-[#2A2A40] bg-white dark:bg-[#0D0D14] shadow-2xl p-3 space-y-3">
              <div className="flex items-center justify-between">
                <span className="text-[11px] font-bold uppercase tracking-wider text-gray-500 dark:text-gray-400">Round settings</span>
                <button onClick={() => setSettingsOpen(false)} className="text-gray-400 hover:text-gray-600 dark:hover:text-gray-300"><X size={12} /></button>
              </div>
              <div>
                <label className="text-[10px] font-medium text-gray-500 dark:text-gray-400 mb-1 block">Category</label>
                <div className="grid grid-cols-3 gap-1">
                  {CATEGORIES.map(c => (
                    <button
                      key={c}
                      onClick={() => setCategory(c)}
                      className={`px-2 py-1 rounded-md text-[10px] font-medium ${category === c ? 'bg-blue-600 text-white' : 'bg-gray-100 dark:bg-[#1e1e2e] text-gray-600 dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-[#2A2A40]'}`}
                    >
                      {c}
                    </button>
                  ))}
                </div>
                {['Math', 'Pop Culture', 'Music'].includes(category) && (
                  <p className="text-[9px] text-amber-600 dark:text-amber-400 mt-1 leading-tight">
                    {category === 'Math' && 'Math maps to Science on QBReader.'}
                    {category === 'Pop Culture' && 'Pop Culture → Trash on QBReader.'}
                    {category === 'Music' && 'Music → Fine Arts on QBReader.'}
                  </p>
                )}
              </div>
              <div>
                <label className="text-[10px] font-medium text-gray-500 dark:text-gray-400 mb-1 block">Difficulty</label>
                {/* 2x2 grid so "Tournament" gets enough room — the
                    288px-wide popover can't fit four full-width pills. */}
                <div className="grid grid-cols-2 gap-1">
                  {DIFFICULTIES.map(d => (
                    <button
                      key={d}
                      onClick={() => setDifficulty(d)}
                      className={`px-2 py-1.5 rounded-md text-[11px] font-medium whitespace-nowrap ${difficulty === d ? 'bg-blue-600 text-white' : 'bg-gray-100 dark:bg-[#1e1e2e] text-gray-600 dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-[#2A2A40]'}`}
                    >
                      {d}
                    </button>
                  ))}
                </div>
              </div>
              <div>
                <label className="text-[10px] font-medium text-gray-500 dark:text-gray-400 mb-1 block">
                  Reading speed: {revealSpeedMs}ms/word
                </label>
                <input
                  type="range" min="60" max="400" step="10"
                  value={revealSpeedMs}
                  onChange={e => setRevealSpeedMs(Number(e.target.value))}
                  className="w-full"
                />
              </div>
              <p className="text-[9px] text-gray-400 leading-tight">
                Changes apply to the next batch of QBReader questions. The current question keeps its original speed.
              </p>
            </div>
          )}
        </div>
        <div className="flex-1 overflow-y-auto p-5">
          <div className="min-h-[120px]">
            <p className="text-base leading-relaxed text-gray-900 dark:text-gray-100">
              {revealed}
              {reading && !done && <span className="inline-block w-0.5 h-4 bg-blue-500 animate-pulse ml-1 align-middle" />}
            </p>
          </div>
        </div>
        <div className="px-4 py-3 border-t border-gray-200 dark:border-[#2A2A40] flex-shrink-0 space-y-2">
          {!buzzed && (
            <>
              <button onClick={handleBuzz} className="w-full py-4 rounded-xl bg-red-600 hover:bg-red-700 text-white text-lg font-bold uppercase tracking-wider active:scale-95 transition-transform">BUZZ</button>
              <p className="text-[10px] text-gray-400 text-center">Press SPACE to buzz</p>
            </>
          )}
          {buzzed && !showResult && (
            <div className="flex gap-2">
              <input value={answer} onChange={e => setAnswer(e.target.value)} placeholder="Type your answer..." autoFocus className="flex-1 px-4 py-3 rounded-xl border border-gray-200 dark:border-[#2A2A40] bg-white dark:bg-[#0D0D14] text-sm outline-none" />
              <button onClick={handleSubmit} disabled={!answer.trim()} className="px-5 py-3 rounded-xl bg-blue-600 text-white text-sm font-medium disabled:opacity-40">Submit</button>
            </div>
          )}
          {showResult && (
            <>
              <div className={`p-4 rounded-xl text-center ${correct ? 'bg-emerald-500/10 border-2 border-emerald-500' : 'bg-rose-500/10 border-2 border-rose-500'}`}>
                <p className={`text-lg font-bold ${correct ? 'text-emerald-500' : 'text-rose-500'}`}>{correct ? 'CORRECT' : 'WRONG'}</p>
                <p className="text-sm text-gray-700 dark:text-gray-300 mt-1">Answer: <strong>{q.answer}</strong></p>
                {!correct && answer && <p className="text-xs text-gray-400 mt-0.5">You said: {answer}</p>}
              </div>
              <div className="flex gap-2">
                <button
                  onClick={() => openLessonFor(q.answer)}
                  className="flex-1 py-3 rounded-xl border border-amber-400/60 bg-amber-50 dark:bg-amber-500/10 text-amber-700 dark:text-amber-300 text-sm font-medium hover:bg-amber-100 dark:hover:bg-amber-500/20 inline-flex items-center justify-center gap-1.5"
                >
                  <Lightbulb size={14} /> Lesson on this
                </button>
                {(() => {
                  const outOfBuffer = isInfinite && currentQ + 1 >= questions.length;
                  const showLoading = outOfBuffer && refilling;
                  return (
                    <button
                      onClick={nextQuestion}
                      disabled={outOfBuffer}
                      className="flex-1 py-3 rounded-xl bg-blue-600 text-white text-sm font-medium disabled:opacity-60 inline-flex items-center justify-center gap-2"
                    >
                      {showLoading
                        ? <><InlineProgress active /> Loading next…</>
                        : (isInfinite
                            ? 'Next Question'
                            : (currentQ < questions.length - 1 ? 'Next Question' : 'See Results'))}
                    </button>
                  );
                })()}
              </div>
            </>
          )}
        </div>
      </div>
    );
  }

  // ===== MULTIPLAYER =====
  if (view === 'multiplayer') {
    return <QuizBowlMatch user={user} onExit={() => setView('setup')} />;
  }

  // ===== SETUP =====
  return (
    <div className="h-full overflow-y-auto">
      <div className="p-5 space-y-5">
        <div className="text-center">
          <Zap size={32} className="text-amber-500 mx-auto mb-3" />
          <h2 className="text-lg font-bold text-gray-900 dark:text-white">Quiz Bowl</h2>
          <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">Pyramidal tossups — buzz when you know</p>
        </div>

        <button
          onClick={() => setView('multiplayer')}
          className="w-full py-3 rounded-xl border-2 border-amber-400 bg-gradient-to-r from-amber-500/10 to-orange-500/10 hover:from-amber-500/20 hover:to-orange-500/20 text-amber-700 dark:text-amber-300 text-sm font-semibold inline-flex items-center justify-center gap-2"
        >
          <Users size={14} /> Play head-to-head →
        </button>
        <div className="flex items-center gap-3">
          <div className="flex-1 h-px bg-gray-200 dark:bg-[#2A2A40]" />
          <span className="text-[10px] text-gray-400 uppercase tracking-wider">or solo</span>
          <div className="flex-1 h-px bg-gray-200 dark:bg-[#2A2A40]" />
        </div>
        {error && <p className="text-xs text-rose-500 px-3 py-2 rounded-lg bg-rose-50 dark:bg-rose-900/15">{error}</p>}

        {/* Source picker — Past QB packet questions vs AI-generated. */}
        <div>
          <label className="text-xs font-medium text-gray-500 dark:text-gray-400 mb-2 block">Question source</label>
          <div className="grid grid-cols-2 gap-2">
            <button
              onClick={() => setQuestionSource('qbreader')}
              className={`px-3 py-2.5 rounded-lg border text-left transition-all ${
                questionSource === 'qbreader'
                  ? 'border-blue-500 bg-blue-50 dark:bg-blue-500/15 text-blue-700 dark:text-blue-200 shadow-sm'
                  : 'border-gray-200 dark:border-[#2A2A40] bg-white dark:bg-[#0D0D14] text-gray-700 dark:text-gray-300 hover:border-blue-400'
              }`}
            >
              <div className="flex items-center gap-1.5">
                <BookOpen size={12} />
                <span className="text-[12px] font-bold">Past QB questions</span>
              </div>
              <p className="text-[10px] opacity-70 mt-0.5">Real packets · qbreader.org</p>
            </button>
            <button
              onClick={() => setQuestionSource('ai')}
              className={`px-3 py-2.5 rounded-lg border text-left transition-all ${
                questionSource === 'ai'
                  ? 'border-blue-500 bg-blue-50 dark:bg-blue-500/15 text-blue-700 dark:text-blue-200 shadow-sm'
                  : 'border-gray-200 dark:border-[#2A2A40] bg-white dark:bg-[#0D0D14] text-gray-700 dark:text-gray-300 hover:border-blue-400'
              }`}
            >
              <div className="flex items-center gap-1.5">
                <Sparkles size={12} />
                <span className="text-[12px] font-bold">AI-generated</span>
              </div>
              <p className="text-[10px] opacity-70 mt-0.5">Gemini Flash · synthetic</p>
            </button>
          </div>
          {questionSource === 'qbreader' && ['Math', 'Pop Culture', 'Music'].includes(category) && (
            <p className="text-[10px] text-amber-600 dark:text-amber-400 mt-1.5">
              {category === 'Math' && 'Math maps to Science (incl. math sub-questions) on QBReader.'}
              {category === 'Pop Culture' && '"Pop Culture" maps to Trash on QBReader (sports / pop-culture grab bag).'}
              {category === 'Music' && 'Music falls under Fine Arts on QBReader.'}
            </p>
          )}
        </div>

        <Selector label="Category" options={CATEGORIES} value={category} onChange={setCategory} />
        <Selector label="Difficulty" options={DIFFICULTIES} value={difficulty} onChange={setDifficulty} grid="grid-cols-4" />
        {questionSource === 'qbreader' ? (
          <div className="rounded-lg border border-amber-400/40 bg-amber-50 dark:bg-amber-500/10 px-3 py-2">
            <p className="text-[11px] font-semibold text-amber-700 dark:text-amber-300 flex items-center gap-1.5">
              <Zap size={12} /> Endless round
            </p>
            <p className="text-[10px] text-amber-700/80 dark:text-amber-300/80 mt-0.5">
              Past QB packets stream in continuously — keep going as long as you want and hit "End round" to see your stats.
            </p>
          </div>
        ) : (
          <div>
            <label className="text-xs font-medium text-gray-500 dark:text-gray-400 mb-2 block">Questions: {questionCount}</label>
            <input type="range" min="5" max="30" step="5" value={questionCount} onChange={e => setQuestionCount(Number(e.target.value))} className="w-full" />
          </div>
        )}
        <div>
          <label className="text-xs font-medium text-gray-500 dark:text-gray-400 mb-2 block">
            Reading speed: {revealSpeedMs}ms/word <span className="text-gray-400">({revealSpeedMs <= 90 ? 'fast' : revealSpeedMs <= 160 ? 'normal' : revealSpeedMs <= 250 ? 'slow' : 'very slow'})</span>
          </label>
          <input type="range" min="60" max="400" step="10" value={revealSpeedMs} onChange={e => setRevealSpeedMs(Number(e.target.value))} className="w-full" />
        </div>
        {questionSource === 'ai' && (
          <div>
            <label className="text-xs font-medium text-gray-500 dark:text-gray-400 mb-2 block">Custom Instructions (optional)</label>
            <textarea value={customInstructions} onChange={e => setCustomInstructions(e.target.value)} placeholder="e.g., Focus on organic chemistry, only 20th century events..." rows={3} className="w-full px-3 py-2 rounded-lg border border-gray-200 dark:border-[#2A2A40] bg-white dark:bg-[#0D0D14] text-sm text-gray-900 dark:text-white placeholder-gray-400 resize-none outline-none" />
          </div>
        )}
        <button onClick={handleGenerate} disabled={generating} className="w-full py-3 rounded-xl bg-blue-600 text-white text-sm font-medium hover:bg-blue-700 disabled:opacity-50 flex items-center justify-center gap-2">
          {generating
            ? <><InlineProgress active /> {questionSource === 'qbreader' ? 'Loading…' : 'Generating…'}</>
            : <><Play size={16} /> {questionSource === 'qbreader' ? 'Start with real questions' : 'Start with AI questions'}</>}
        </button>
        {scores.length > 0 && (
          <div className="text-center text-xs text-gray-400">Last round: {scores.filter(s => s.correct).length}/{scores.length} correct</div>
        )}
      </div>
    </div>
  );
}

function Selector({ label, options, value, onChange, grid = 'flex flex-wrap gap-1.5' }) {
  return (
    <div>
      <label className="text-xs font-medium text-gray-500 dark:text-gray-400 mb-2 block">{label}</label>
      <div className={grid.startsWith('grid') ? `grid ${grid} gap-2` : grid}>
        {options.map(o => (
          <button key={o} onClick={() => onChange(o)} className={`px-3 py-1.5 rounded-lg text-xs font-medium ${value === o ? 'bg-blue-600 text-white' : 'bg-gray-100 dark:bg-[#1e1e2e] text-gray-600 dark:text-gray-300'}`}>{o}</button>
        ))}
      </div>
    </div>
  );
}
