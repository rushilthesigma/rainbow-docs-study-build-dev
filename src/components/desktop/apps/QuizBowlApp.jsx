import { useState, useEffect, useRef, useCallback } from 'react';
import { Zap, Play, RotateCcw, Check, X, Settings, ArrowLeft, Loader2 } from 'lucide-react';
import { apiFetch } from '../../../api/client';

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
function useWordReveal(text, speed = 150, active = false) {
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
  const [view, setView] = useState('setup'); // setup, playing, review
  const [questions, setQuestions] = useState([]);
  const [currentQ, setCurrentQ] = useState(0);
  const [generating, setGenerating] = useState(false);
  const [error, setError] = useState(null);

  // Setup
  const [category, setCategory] = useState('Mixed');
  const [difficulty, setDifficulty] = useState('Medium');
  const [questionCount, setQuestionCount] = useState(10);
  const [customInstructions, setCustomInstructions] = useState('');

  // Playing
  const [buzzed, setBuzzed] = useState(false);
  const [answer, setAnswer] = useState('');
  const [showResult, setShowResult] = useState(false);
  const [correct, setCorrect] = useState(null);
  const [scores, setScores] = useState([]);
  const [reading, setReading] = useState(true);

  const q = questions[currentQ];
  const speed = difficulty === 'Easy' ? 220 : difficulty === 'Medium' ? 160 : difficulty === 'Hard' ? 110 : 60;
  const { revealed, done, stop, wordIndex, totalWords } = useWordReveal(q?.text || '', speed, reading && !buzzed && view === 'playing');

  async function handleGenerate() {
    setGenerating(true);
    setError(null);
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
        setCurrentQ(0);
        setScores([]);
        setBuzzed(false);
        setShowResult(false);
        setReading(true);
        setView('playing');
      } else {
        setError('Failed to generate questions. Try again.');
      }
    } catch (err) {
      setError(err.message || 'Generation failed');
    }
    setGenerating(false);
  }

  function handleBuzz() {
    if (buzzed || !reading) return;
    setBuzzed(true);
    setReading(false);
    stop();
  }

  function handleSubmit() {
    if (!answer.trim()) return;
    const a = answer.trim().toLowerCase();
    const ca = q.answer.toLowerCase();
    // Fuzzy match: exact, contains, or first/last name match
    const isCorrect = a === ca || ca.includes(a) || a.includes(ca) ||
      ca.split(/[\s,]+/).some(w => w.length > 2 && a.includes(w)) ||
      a.split(/[\s,]+/).some(w => w.length > 2 && ca.includes(w));
    setCorrect(isCorrect);
    setShowResult(true);
    setScores(prev => [...prev, { question: currentQ, correct: isCorrect, buzzWord: wordIndex, totalWords, answer: answer.trim(), correctAnswer: q.answer }]);
    // Auto-advance after 1.5s
    setTimeout(() => nextQuestion(), 1500);
  }

  function handleTimeout() {
    // Ran out of words without buzzing
    setScores(prev => [...prev, { question: currentQ, correct: false, buzzWord: -1, totalWords, answer: '', correctAnswer: q.answer }]);
    setShowResult(true);
    setCorrect(false);
    setBuzzed(true);
  }

  useEffect(() => {
    if (done && !buzzed && view === 'playing') {
      // 2 second grace period after question finishes
      const t = setTimeout(handleTimeout, 2000);
      return () => clearTimeout(t);
    }
  }, [done, buzzed, view]);

  function nextQuestion() {
    if (currentQ < questions.length - 1) {
      setCurrentQ(prev => prev + 1);
      setBuzzed(false);
      setShowResult(false);
      setCorrect(null);
      setAnswer('');
      setReading(true);
    } else {
      setView('review');
    }
  }

  // Keyboard: space to buzz, enter to submit
  useEffect(() => {
    if (view !== 'playing') return;
    function handleKey(e) {
      if (e.key === ' ' && !buzzed) { e.preventDefault(); handleBuzz(); }
      if (e.key === 'Enter' && buzzed && !showResult) { e.preventDefault(); handleSubmit(); }
      if (e.key === 'Enter' && showResult) { e.preventDefault(); nextQuestion(); }
    }
    window.addEventListener('keydown', handleKey);
    return () => window.removeEventListener('keydown', handleKey);
  }, [view, buzzed, showResult, answer]);

  // ===== REVIEW =====
  if (view === 'review') {
    const totalCorrect = scores.filter(s => s.correct).length;
    const earlyBuzzes = scores.filter(s => s.correct && s.buzzWord < s.totalWords * 0.5).length;
    return (
      <div className="h-full overflow-y-auto">
        <div className="p-5">
          <div className="text-center mb-6">
            <h2 className="text-2xl font-bold text-gray-900 dark:text-white">{totalCorrect}/{questions.length}</h2>
            <p className="text-sm text-gray-500 mt-1">{earlyBuzzes} early buzzes</p>
            <p className="text-xs text-gray-400 mt-0.5">{category} / {difficulty}</p>
          </div>

          <div className="space-y-2 mb-6">
            {scores.map((s, i) => (
              <div key={i} className={`rounded-xl p-3 border ${s.correct ? 'bg-emerald-50 dark:bg-emerald-900/10 border-emerald-200 dark:border-emerald-800' : 'bg-rose-50 dark:bg-rose-900/10 border-rose-200 dark:border-rose-800'}`}>
                <div className="flex items-center gap-2 mb-1">
                  {s.correct ? <Check size={14} className="text-emerald-500" /> : <X size={14} className="text-rose-500" />}
                  <span className="text-xs font-medium text-gray-900 dark:text-white">Q{i + 1}</span>
                  {s.buzzWord >= 0 && <span className="text-[10px] text-gray-400">Buzzed at word {s.buzzWord + 1}/{s.totalWords}</span>}
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
    return (
      <div className="flex flex-col h-full">
        {/* Header */}
        <div className="flex items-center gap-2 px-4 py-2.5 border-b border-gray-200 dark:border-[#2A2A40] flex-shrink-0">
          <Zap size={16} className="text-amber-500" />
          <span className="text-sm font-semibold text-gray-900 dark:text-white">Q{currentQ + 1}/{questions.length}</span>
          <div className="flex-1" />
          <span className="text-xs text-gray-400">{category} / {difficulty}</span>
          <span className={`text-xs font-bold ${scores.filter(s => s.correct).length > 0 ? 'text-emerald-500' : 'text-gray-400'}`}>{scores.filter(s => s.correct).length} pts</span>
        </div>

        {/* Question text — word by word */}
        <div className="flex-1 overflow-y-auto p-5">
          <div className="min-h-[120px]">
            <p className="text-base leading-relaxed text-gray-900 dark:text-gray-100">
              {revealed}
              {reading && !done && <span className="inline-block w-0.5 h-4 bg-blue-500 animate-pulse ml-1 align-middle" />}
            </p>
          </div>

          {/* Result */}
          {showResult && (
            <div className={`mt-4 p-4 rounded-xl ${correct ? 'bg-emerald-50 dark:bg-emerald-900/10 border border-emerald-200 dark:border-emerald-800' : 'bg-rose-50 dark:bg-rose-900/10 border border-rose-200 dark:border-rose-800'}`}>
              <p className={`text-sm font-semibold ${correct ? 'text-emerald-600' : 'text-rose-600'}`}>{correct ? 'Correct!' : 'Incorrect'}</p>
              <p className="text-sm text-gray-700 dark:text-gray-300 mt-1">Answer: <strong>{q.answer}</strong></p>
            </div>
          )}
        </div>

        {/* Controls */}
        <div className="px-4 py-3 border-t border-gray-200 dark:border-[#2A2A40] flex-shrink-0 space-y-2">
          {!buzzed && (
            <button onClick={handleBuzz} className="w-full py-4 rounded-xl bg-red-600 hover:bg-red-700 text-white text-lg font-bold uppercase tracking-wider active:scale-95 transition-transform">
              BUZZ
            </button>
          )}

          {buzzed && !showResult && (
            <div className="flex gap-2">
              <input
                value={answer}
                onChange={e => setAnswer(e.target.value)}
                onKeyDown={e => { if (e.key === 'Enter') handleSubmit(); }}
                placeholder="Type your answer..."
                autoFocus
                className="flex-1 px-4 py-3 rounded-xl border border-gray-200 dark:border-[#2A2A40] bg-white dark:bg-[#0D0D14] text-sm outline-none"
              />
              <button onClick={handleSubmit} disabled={!answer.trim()} className="px-5 py-3 rounded-xl bg-blue-600 text-white text-sm font-medium disabled:opacity-40">Submit</button>
            </div>
          )}

          {showResult && (
            <button onClick={nextQuestion} className="w-full py-3 rounded-xl bg-blue-600 text-white text-sm font-medium">
              {currentQ < questions.length - 1 ? 'Next Question' : 'See Results'}
            </button>
          )}

          {!buzzed && <p className="text-[10px] text-gray-400 text-center">Press SPACE to buzz</p>}
        </div>
      </div>
    );
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

        {error && <p className="text-xs text-rose-500 px-3 py-2 rounded-lg bg-rose-50 dark:bg-rose-900/15">{error}</p>}

        <div>
          <label className="text-xs font-medium text-gray-500 dark:text-gray-400 mb-2 block">Category</label>
          <div className="flex flex-wrap gap-1.5">
            {CATEGORIES.map(c => (
              <button key={c} onClick={() => setCategory(c)} className={`px-3 py-1.5 rounded-lg text-xs font-medium ${category === c ? 'bg-blue-600 text-white' : 'bg-gray-100 dark:bg-[#1e1e2e] text-gray-600 dark:text-gray-300'}`}>{c}</button>
            ))}
          </div>
        </div>

        <div>
          <label className="text-xs font-medium text-gray-500 dark:text-gray-400 mb-2 block">Difficulty</label>
          <div className="flex gap-2">
            {DIFFICULTIES.map(d => (
              <button key={d} onClick={() => setDifficulty(d)} className={`flex-1 py-2 rounded-lg text-xs font-medium ${difficulty === d ? 'bg-blue-600 text-white' : 'bg-gray-100 dark:bg-[#1e1e2e] text-gray-600 dark:text-gray-300'}`}>{d}</button>
            ))}
          </div>
        </div>

        <div>
          <label className="text-xs font-medium text-gray-500 dark:text-gray-400 mb-2 block">Questions: {questionCount}</label>
          <input type="range" min="5" max="30" step="5" value={questionCount} onChange={e => setQuestionCount(Number(e.target.value))} className="w-full" />
        </div>

        <div>
          <label className="text-xs font-medium text-gray-500 dark:text-gray-400 mb-2 block">Custom Instructions (optional)</label>
          <textarea
            value={customInstructions}
            onChange={e => setCustomInstructions(e.target.value)}
            placeholder="e.g., Focus on organic chemistry, only 20th century events, include bonus clues about specific authors..."
            rows={3}
            className="w-full px-3 py-2 rounded-lg border border-gray-200 dark:border-[#2A2A40] bg-white dark:bg-[#0D0D14] text-sm text-gray-900 dark:text-white placeholder-gray-400 resize-none outline-none"
          />
        </div>

        <button onClick={handleGenerate} disabled={generating} className="w-full py-3 rounded-xl bg-blue-600 text-white text-sm font-medium hover:bg-blue-700 disabled:opacity-50 flex items-center justify-center gap-2">
          {generating ? <><Loader2 size={16} className="animate-spin" /> Generating...</> : <><Play size={16} /> Start Round</>}
        </button>

        {scores.length > 0 && (
          <div className="text-center text-xs text-gray-400">Last round: {scores.filter(s => s.correct).length}/{scores.length} correct</div>
        )}
      </div>
    </div>
  );
}
