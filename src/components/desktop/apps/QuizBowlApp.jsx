import { useState, useEffect, useRef } from 'react';
import { Zap, Play, Check, X, Loader2, Lightbulb, Users, BookOpen, Sparkles, Settings, ArrowRight } from 'lucide-react';
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
  const [view, setView] = useState('setup');
  useBrowserBack(view !== 'setup', () => setView('setup'));
  const { user } = useAuth();
  const [questions, setQuestions] = useState([]);
  const [currentQ, setCurrentQ] = useState(0);
  const [generating, setGenerating] = useState(false);
  const [error, setError] = useState(null);

  const [category, setCategory] = useState('Mixed');
  const [difficulty, setDifficulty] = useState('Medium');
  const [questionCount, setQuestionCount] = useState(10);
  const [customInstructions, setCustomInstructions] = useState('');
  const [revealSpeedMs, setRevealSpeedMs] = useState(140);
  const [questionSource, setQuestionSource] = useState('qbreader');
  const [playingSource, setPlayingSource] = useState('ai');

  const [buzzed, setBuzzed] = useState(false);
  const [answer, setAnswer] = useState('');
  const [showResult, setShowResult] = useState(false);
  const [correct, setCorrect] = useState(null);
  const [scores, setScores] = useState([]);
  const [reading, setReading] = useState(true);
  const fetchingMoreRef = useRef(false);
  const [refilling, setRefilling] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const QB_BATCH_SIZE = 5;
  const QB_PREFETCH_THRESHOLD = 3;

  const q = questions[currentQ];
  const { revealed, done, stop, wordIndex, totalWords } = useWordReveal(q?.text || '', revealSpeedMs, reading && !buzzed && view === 'playing');

  async function handleGenerate() {
    setGenerating(true);
    setError(null);
    if (questionSource === 'qbreader') {
      try {
        const data = await fetchQBReaderTossups({ count: QB_BATCH_SIZE, category, difficulty });
        const tossups = data?.tossups || [];
        if (!tossups.length) {
          setError('No questions for that combo. Try different filters.');
        } else {
          setQuestions(tossups);
          setPlayingSource('qbreader');
          setCurrentQ(0); setScores([]); setBuzzed(false); setShowResult(false); setReading(true);
          fetchingMoreRef.current = false;
          setView('playing');
        }
      } catch (err) {
        setError(err.message || 'Failed to fetch questions.');
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
      } else setError('Generation failed. Try again.');
    } catch (err) { setError(err.message || 'Generation failed'); }
    setGenerating(false);
  }

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
      .catch(() => {})
      .finally(() => {
        fetchingMoreRef.current = false;
        setRefilling(false);
      });
  }, [currentQ, questions.length, view, playingSource, category, difficulty]);

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
    setQuestions(prev => prev.slice(0, currentQ + 1));
  }, [category, difficulty, view, playingSource, currentQ]);

  function handleBuzz() {
    if (buzzed || !reading) return;
    setBuzzed(true); setReading(false); stop();
  }

  function handleSubmit() {
    if (!answer.trim()) return;
    const norm = s => s.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9\s]/g, '').trim();
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

  function endRound() { setView('review'); }

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
    const denom = playingSource === 'qbreader' ? scores.length : questions.length;
    return (
      <div className="h-full overflow-y-auto bg-transparent">
        <div className="p-5">
          <div className="text-center mb-6 pt-4">
            <div className="text-[42px] font-bold text-white tabular-nums leading-none">{totalCorrect}<span className="text-white/30">/{denom}</span></div>
            <div className="flex items-center justify-center gap-3 mt-2">
              {earlyBuzzes > 0 && <span className="text-[11px] text-white/55 font-medium">{earlyBuzzes} early</span>}
              <span className="text-[11px] text-white/45">{category} · {difficulty}{playingSource === 'qbreader' ? ' · QB' : ''}</span>
            </div>
          </div>
          <div className="space-y-1.5 mb-5">
            {scores.map((s, i) => (
              <div key={i} className={`rounded-2xl px-3.5 py-2.5 border flex items-start gap-2.5 ${s.correct ? 'bg-emerald-500/8 border-emerald-500/20' : 'bg-rose-500/8 border-rose-500/20'}`}>
                <div className={`mt-0.5 shrink-0 ${s.correct ? 'text-emerald-400' : 'text-rose-400'}`}>
                  {s.correct ? <Check size={13} /> : <X size={13} />}
                </div>
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <span className="text-[11px] font-bold text-white/75">Q{i + 1}</span>
                    {s.buzzWord >= 0 && <span className="text-[10px] text-white/40">word {s.buzzWord + 1}/{s.totalWords}</span>}
                    <div className="flex-1" />
                    <button
                      onClick={() => openLessonFor(s.correctAnswer)}
                      className="inline-flex items-center gap-1 text-[10px] font-medium px-1.5 py-0.5 rounded-full border border-white/[0.12] bg-white/[0.04] text-white/45 hover:text-white/70 hover:border-white/[0.22] hover:bg-white/[0.08] transition-colors"
                    >
                      <Lightbulb size={9} />
                    </button>
                  </div>
                  <p className="text-[12px] text-white/80 mt-0.5"><strong className="text-white font-semibold">{s.correctAnswer}</strong></p>
                  {s.answer && !s.correct && <p className="text-[10px] text-white/45 mt-0.5">{s.answer}</p>}
                </div>
              </div>
            ))}
          </div>
          <div className="grid grid-cols-2 gap-2">
            <button onClick={() => { setView('setup'); setQuestions([]); setScores([]); }} className="py-2.5 rounded-2xl border border-white/10 bg-white/5 text-[13px] font-semibold text-white/70 hover:bg-white/8">New set</button>
            <button onClick={() => { setCurrentQ(0); setBuzzed(false); setShowResult(false); setReading(true); setScores([]); setAnswer(''); setView('playing'); }} className="py-2.5 rounded-2xl bg-white/[0.09] hover:bg-white/[0.13] text-white/70 text-[13px] font-semibold">Replay</button>
          </div>
        </div>
      </div>
    );
  }

  // ===== PLAYING =====
  if (view === 'playing' && q) {
    const isInfinite = playingSource === 'qbreader';
    return (
      <div className="flex flex-col h-full bg-transparent">
        <div className="flex items-center gap-2 px-4 py-2.5 border-b border-white/[0.04] flex-shrink-0 relative">
          <Zap size={14} className="text-white/50" />
          <span className="text-[13px] font-bold text-white tabular-nums">
            Q{currentQ + 1}{isInfinite ? '' : `/${questions.length}`}
          </span>
          {isInfinite && (
            <span className="text-[9px] font-bold uppercase tracking-wider px-1.5 py-0.5 rounded-full bg-white/[0.08] text-white/50">∞</span>
          )}
          <div className="flex-1" />
          <span className="text-[10px] text-white/50">{category} · {difficulty}</span>
          <span className={`text-[12px] font-bold tabular-nums ${scores.filter(s => s.correct).length > 0 ? 'text-emerald-400' : 'text-white/40'}`}>
            {scores.filter(s => s.correct).length}
          </span>
          {isInfinite && (
            <>
              <button
                onClick={() => setSettingsOpen(o => !o)}
                aria-label="Settings"
                className={`p-1 rounded-lg border transition-colors ${settingsOpen ? 'border-white/[0.08] bg-white/[0.05] text-white/50' : 'border-transparent text-white/30 hover:text-white/60 hover:bg-white/5'}`}
              >
                <Settings size={13} />
              </button>
              <button
                onClick={endRound}
                className="text-[10px] font-medium px-2 py-0.5 rounded-full border border-white/[0.10] text-white/55 hover:text-white/80 hover:bg-white/[0.06]"
              >
                End
              </button>
            </>
          )}
          {isInfinite && settingsOpen && (
            <div className="absolute right-2 top-full mt-1 w-72 z-20 rounded-2xl border border-white/10 bg-[#161626]/95 backdrop-blur-xl shadow-2xl p-3.5 space-y-3">
              <div className="flex items-center justify-between">
                <span className="text-[10px] font-bold uppercase tracking-wider text-white/55">Settings</span>
                <button onClick={() => setSettingsOpen(false)} className="text-white/45 hover:text-white/75"><X size={12} /></button>
              </div>
              <div>
                <div className="grid grid-cols-3 gap-1">
                  {CATEGORIES.map(c => (
                    <button key={c} onClick={() => setCategory(c)}
                      className={`px-2 py-1 rounded-xl text-[10px] font-semibold transition-colors ${category === c ? 'bg-white/[0.12] text-white/90 border border-white/[0.18]' : 'bg-white/[0.04] text-white/55 hover:bg-white/[0.08] hover:text-white/75'}`}>
                      {c}
                    </button>
                  ))}
                </div>
              </div>
              <div className="grid grid-cols-2 gap-1">
                {DIFFICULTIES.map(d => (
                  <button key={d} onClick={() => setDifficulty(d)}
                    className={`px-2 py-1.5 rounded-xl text-[11px] font-semibold transition-colors ${difficulty === d ? 'bg-white/[0.12] text-white/90 border border-white/[0.18]' : 'bg-white/[0.04] text-white/55 hover:bg-white/[0.08] hover:text-white/75'}`}>
                    {d}
                  </button>
                ))}
              </div>
              <div>
                <div className="flex items-center justify-between mb-1">
                  <span className="text-[10px] text-white/55">Speed</span>
                  <span className="text-[10px] font-mono text-white/50">{revealSpeedMs}ms</span>
                </div>
                <input type="range" min="60" max="400" step="10" value={revealSpeedMs}
                  onChange={e => setRevealSpeedMs(Number(e.target.value))} className="w-full accent-white" />
              </div>
            </div>
          )}
        </div>

        <div className="flex-1 overflow-y-auto p-5">
          <div className="min-h-[120px]">
            <p className="text-[15px] leading-relaxed text-white/90 font-light">
              {revealed}
              {reading && !done && <span className="inline-block w-0.5 h-4 bg-white/35 animate-pulse ml-1 align-middle rounded-sm" />}
            </p>
          </div>
        </div>

        <div className="px-4 py-3 border-t border-white/[0.04] flex-shrink-0 space-y-2">
          {!buzzed && (
            <>
              <button onClick={handleBuzz}
                className="w-full py-4 rounded-2xl bg-red-600 hover:bg-red-500 text-white text-[15px] font-bold uppercase tracking-[0.15em] active:scale-[0.98] transition-all shadow-[0_0_24px_rgba(239,68,68,0.25)]">
                BUZZ
              </button>
              <p className="text-[10px] text-white/35 text-center">Space to buzz</p>
            </>
          )}
          {buzzed && !showResult && (
            <div className="flex gap-2">
              <input value={answer} onChange={e => setAnswer(e.target.value)} placeholder="Answer…" autoFocus
                className="flex-1 px-4 py-3 rounded-2xl border border-white/10 bg-white/5 text-[14px] text-white placeholder-white/25 outline-none focus:border-white/[0.15] transition-colors" />
              <button onClick={handleSubmit} disabled={!answer.trim()}
                className="px-5 py-3 rounded-2xl bg-white/[0.09] hover:bg-white/[0.13] text-white/70 text-[13px] font-bold disabled:opacity-30 transition-colors">
                <ArrowRight size={16} />
              </button>
            </div>
          )}
          {showResult && (
            <>
              <div className={`p-4 rounded-2xl text-center border-2 ${correct ? 'bg-emerald-500/10 border-emerald-500/40' : 'bg-rose-500/10 border-rose-500/40'}`}>
                <p className={`text-[15px] font-bold ${correct ? 'text-emerald-400' : 'text-rose-400'}`}>
                  {correct ? '✓' : '✗'} {q.answer}
                </p>
                {!correct && answer && <p className="text-[11px] text-white/30 mt-1">{answer}</p>}
              </div>
              <div className="flex gap-2">
                <button onClick={() => openLessonFor(q.answer)}
                  className="flex-1 py-3 rounded-2xl border border-white/[0.10] bg-white/[0.04] text-white/55 text-[12px] font-semibold hover:bg-white/[0.08] hover:text-white/75 inline-flex items-center justify-center gap-1.5 transition-colors">
                  <Lightbulb size={13} /> Lesson
                </button>
                {(() => {
                  const outOfBuffer = isInfinite && currentQ + 1 >= questions.length;
                  const showLoading = outOfBuffer && refilling;
                  return (
                    <button onClick={nextQuestion} disabled={outOfBuffer}
                      className="flex-1 py-3 rounded-2xl bg-white/[0.09] hover:bg-white/[0.13] text-white/70 text-[13px] font-semibold disabled:opacity-40 inline-flex items-center justify-center gap-2 transition-colors">
                      {showLoading ? <><InlineProgress active /> Loading…</> : 'Next →'}
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
    <div className="h-full overflow-y-auto bg-transparent">
      <div className="p-5 pb-8 space-y-3">
        {/* Multiplayer */}
        <button onClick={() => setView('multiplayer')}
          className="w-full py-2.5 rounded-2xl border border-white/[0.08] bg-white/[0.03] hover:bg-white/[0.06] text-white/50 hover:text-white/80 text-[13px] font-semibold inline-flex items-center justify-center gap-2 transition-colors">
          <Users size={14} /> Head-to-head
        </button>

        <div className="flex items-center gap-3">
          <div className="flex-1 h-px bg-white/[0.06]" />
          <span className="text-[10px] text-white/35 uppercase tracking-wider">solo</span>
          <div className="flex-1 h-px bg-white/[0.06]" />
        </div>

        {error && <p className="text-[11px] text-rose-400 px-3 py-2 rounded-xl bg-rose-500/10 border border-rose-500/20 text-center">{error}</p>}

        {/* Source */}
        <div className="grid grid-cols-2 gap-2">
          <GlassTile active={questionSource === 'qbreader'} icon={<BookOpen size={14} />} label="Past QB" sub="qbreader.org" onClick={() => setQuestionSource('qbreader')} />
          <GlassTile active={questionSource === 'ai'} icon={<Sparkles size={14} />} label="AI" sub="Gemini" onClick={() => setQuestionSource('ai')} />
        </div>

        {/* Category */}
        <div className="flex flex-wrap gap-1.5">
          {CATEGORIES.map(c => <GlassPill key={c} active={category === c} onClick={() => setCategory(c)}>{c}</GlassPill>)}
        </div>

        {/* Difficulty */}
        <div className="grid grid-cols-4 gap-1.5">
          {DIFFICULTIES.map(d => <GlassPill key={d} active={difficulty === d} onClick={() => setDifficulty(d)}>{d}</GlassPill>)}
        </div>

        {/* Count (AI only) */}
        {questionSource === 'ai' && (
          <div>
            <div className="flex items-center justify-between mb-1.5">
              <span className="text-[10px] text-white/50 uppercase tracking-wider">Questions</span>
              <span className="text-[11px] font-mono text-white/70">{questionCount}</span>
            </div>
            <input type="range" min="5" max="30" step="5" value={questionCount}
              onChange={e => setQuestionCount(Number(e.target.value))} className="w-full accent-white" />
          </div>
        )}

        {/* Speed */}
        <div>
          <div className="flex items-center justify-between mb-1.5">
            <span className="text-[10px] text-white/50 uppercase tracking-wider">Speed</span>
            <span className="text-[11px] font-mono text-white/70">{revealSpeedMs}ms</span>
          </div>
          <input type="range" min="60" max="400" step="10" value={revealSpeedMs}
            onChange={e => setRevealSpeedMs(Number(e.target.value))} className="w-full accent-white" />
        </div>

        {/* Custom instructions (AI only) */}
        {questionSource === 'ai' && (
          <textarea value={customInstructions} onChange={e => setCustomInstructions(e.target.value)}
            placeholder="Custom instructions…" rows={2}
            className="w-full px-3 py-2.5 rounded-xl border border-white/8 bg-white/[0.04] text-[12px] text-white/80 placeholder-white/20 resize-none outline-none focus:border-white/15 transition-colors" />
        )}

        {/* Start */}
        <button onClick={handleGenerate} disabled={generating}
          className="w-full py-3.5 rounded-2xl bg-white/[0.09] hover:bg-white/[0.13] backdrop-blur-sm disabled:opacity-40 text-white/80 text-[14px] font-bold inline-flex items-center justify-center gap-2 transition-colors border border-white/[0.12] shadow-[inset_0_1px_0_rgba(255,255,255,0.08)]">
          {generating
            ? <><InlineProgress active /> {questionSource === 'qbreader' ? 'Loading…' : 'Generating…'}</>
            : <><Play size={15} /> Start</>}
        </button>

        {scores.length > 0 && (
          <p className="text-center text-[11px] text-white/40">Last: {scores.filter(s => s.correct).length}/{scores.length}</p>
        )}
      </div>
    </div>
  );
}

function GlassTile({ active, icon, label, sub, onClick }) {
  return (
    <button onClick={onClick}
      className={`text-left rounded-2xl border p-3 transition-all backdrop-blur-sm ${
        active
          ? 'border-white/[0.22] bg-white/[0.10] text-white/90 shadow-[inset_0_1px_0_rgba(255,255,255,0.14)]'
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

function GlassPill({ active, onClick, children }) {
  return (
    <button onClick={onClick}
      className={`px-3 py-1.5 rounded-xl text-[11px] font-semibold transition-colors whitespace-nowrap backdrop-blur-sm ${
        active
          ? 'bg-white/[0.13] text-white/95 border border-white/[0.22] shadow-[inset_0_1px_0_rgba(255,255,255,0.14)]'
          : 'bg-white/[0.05] border border-white/[0.08] text-white/55 hover:bg-white/[0.09] hover:text-white/80'
      }`}>
      {children}
    </button>
  );
}
