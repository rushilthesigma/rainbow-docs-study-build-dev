import { useState, useEffect, useRef, useMemo } from 'react';
import { Zap, Play, Check, X, Loader2, Lightbulb, Users, BookOpen, Sparkles, Settings, ArrowRight, Target, TrendingDown, Clock, History, Flame, ChevronRight, Trophy, Swords, RefreshCw, Eye } from 'lucide-react';
import TrialSession, { AnswerResultPanel } from '../../trial/TrialSession';
import { apiFetch } from '../../../api/client';
import { fetchQBReaderTossups, saveQuizBowlSet, fetchQuizBowlHistory, fetchQuizBowlRecommendations, fetchQuizBowlPatterns } from '../../../api/quizMatch';
import { peek, fetchOnce, bustPrefix } from '../../../api/cache';
import ViewFade from '../../shared/ViewFade';
import { useWindowManager } from '../../../context/WindowManagerContext';
import { setPendingLesson } from '../../../utils/pendingLesson';
import useBrowserBack from '../../../hooks/useBrowserBack';
import { useAuth } from '../../../context/AuthContext';
import QuizBowlMatch from './QuizBowlMatch';
import ProgressBar, { InlineProgress } from '../../shared/ProgressBar';

const DIFFICULTIES = ['Easy', 'Medium', 'Hard', 'Tournament'];
const CATEGORIES = ['Science', 'History', 'Literature', 'Geography', 'Math', 'Art', 'Music', 'Philosophy', 'Pop Culture', 'Mixed'];
const QB_LOBBY_CATEGORIES = ['History', 'American History', 'World History', 'European History', 'Science', 'Literature', 'Geography', 'Math', 'Art', 'Music', 'Philosophy', 'Mixed'];
const BOT_ROSTER = [
  { id: 'biscuit', name: 'Player 2', label: 'Newbie',       stars: 1, color: 'slate',   buzzAt: 0.90, accuracy: 0.40, thinkMs: 3000 },
  { id: 'alex',    name: 'Player 3', label: 'Amateur',      stars: 2, color: 'emerald', buzzAt: 0.80, accuracy: 0.58, thinkMs: 1800 },
  { id: 'sam',     name: 'Player 4', label: 'Varsity',      stars: 3, color: 'amber',   buzzAt: 0.62, accuracy: 0.74, thinkMs: 1100 },
  { id: 'jordan',  name: 'Player 5', label: 'Collegiate',   stars: 3, color: 'sky',     buzzAt: 0.50, accuracy: 0.82, thinkMs: 800  },
  { id: 'quinn',   name: 'Player 6', label: 'Invitational', stars: 4, color: 'violet',  buzzAt: 0.36, accuracy: 0.90, thinkMs: 600  },
  { id: 'morgan',  name: 'Player 7', label: 'National',     stars: 4, color: 'orange',  buzzAt: 0.22, accuracy: 0.94, thinkMs: 350  },
  { id: 'cipher',  name: 'Player 8', label: 'Pro',          stars: 5, color: 'rose',    buzzAt: 0.12, accuracy: 0.98, thinkMs: 150  },
];
const DEFAULT_BOT_NAMES = Object.fromEntries(BOT_ROSTER.map(b => [b.id, b.name]));

const SYSTEM_PROMPT = `You are a quiz bowl question writer. Write pyramidal quiz bowl tossup questions.

RULES:
- Each question is a single paragraph that starts with hard clues and progressively gets easier
- The answer should be guessable from the first few clues by experts, but obvious by the end
- Include exactly one NAQT-style power mark "(*)" placed roughly 60-70% through the question (after the hard clues, before the giveaway). Buzzing before (*) earns +15, after earns +10.
- Write exactly the number of questions requested
- Output ONLY valid JSON, no markdown

Format:
{"questions":[{"text":"Hard opening clue. More obscure clues. (*) Easier middle clue. Giveaway clue.","answer":"Answer"}]}`;

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

// Mirror of the server's NAQT-mark parser. AI-generated tossups arrive
// raw (with "(*)" embedded); QBReader tossups are already pre-parsed.
// Strips the mark and returns the word index where it lived so the
// scorer knows the power cutoff.
function parseTossupText(raw) {
  if (!raw || typeof raw !== 'string') return { text: '', powerWordIndex: null };
  const text = raw.trim();
  const re = /\s*\(\s*\*\s*\)\s*/;
  const m = text.match(re);
  if (!m) return { text, powerWordIndex: null };
  const before = text.slice(0, m.index).trim();
  const after = text.slice(m.index + m[0].length).trim();
  const clean = (before + (after ? ' ' + after : '')).trim();
  const powerWordIndex = before.split(/\s+/).filter(Boolean).length;
  return { text: clean, powerWordIndex };
}

// Real NAQT scoring: +15 power, +10 get, -5 wrong interrupt, 0 wrong-
// after / timeout. `buzzWord` is the index of the last word revealed at
// buzz time; -1 means timeout. `totalWords` is the full question length.
// `powerIdx` is the word index of the power mark, or null if the
// question wasn't authored with one.
function naqtPointsFor(correct, buzzWord, powerIdx, totalWords) {
  if (correct) {
    if (powerIdx != null && buzzWord >= 0 && buzzWord < powerIdx) return 15;
    return 10;
  }
  // Wrong. -5 if they buzzed while the question was still being read.
  const interrupted = buzzWord >= 0 && buzzWord < totalWords - 1;
  return interrupted ? -5 : 0;
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

export default function QuizBowlApp({ initialTopic = null, initialDifficulty = null } = {}) {
  const { openApp } = useWindowManager();
  function openLessonFor(topic) {
    if (!topic) return;
    setPendingLesson({ topic, difficulty: 'beginner' });
    openApp('lessons', 'Lessons');
  }
  // 'hub' is the new landing screen (stats + recommendations + history).
  // 'custom' is the old setup form, still available for fine control.
  // When deep-linked from study mode with a topic, jump straight to the
  // custom form so the student can hit Start without hunting.
  const [view, setView] = useState(initialTopic ? 'custom' : 'hub');
  const [aiLobbyInitial, setAiLobbyInitial] = useState('lobby');
  const [replaySet, setReplaySet] = useState(null);
  useBrowserBack(view !== 'hub', () => { setView('hub'); setReplaySet(null); });
  const { user } = useAuth();
  const [questions, setQuestions] = useState([]);
  const [currentQ, setCurrentQ] = useState(0);
  const [generating, setGenerating] = useState(false);
  const [error, setError] = useState(null);

  const [category, setCategory] = useState('Mixed');
  const [difficulty, setDifficulty] = useState(() => {
    // Study-mode deep link maps lowercase NAQT levels to the picker labels
    // this app uses ("Easy" / "Medium" / "Hard"). Default Medium otherwise.
    const m = { elementary: 'Easy', middle: 'Easy', high: 'Medium', college: 'Hard' };
    return m[initialDifficulty] || 'Medium';
  });
  const [questionCount, setQuestionCount] = useState(10);
  const [customInstructions, setCustomInstructions] = useState(initialTopic ? `Focus on: ${initialTopic}` : '');
  const [revealSpeedMs, setRevealSpeedMs] = useState(140);
  const [questionSource, setQuestionSource] = useState('qbreader');
  const [playingSource, setPlayingSource] = useState('ai');

  // Hub: history + recommendations from the server. Loaded on first
  // mount and refreshed whenever the user returns to the hub from a
  // completed set so the new entry shows up immediately. Cached across
  // app re-opens so the hub paints instantly with the last data.
  const cachedHist = peek('qb:history');
  const cachedRecs = peek('qb:recs');
  const cachedPats = peek('qb:patterns');
  const [history, setHistory] = useState(cachedHist || null);
  const [recs, setRecs] = useState(cachedRecs?.recommendations || []);
  const [patterns, setPatterns] = useState(cachedPats?.patterns || null);
  const [hubLoading, setHubLoading] = useState(!(cachedHist && cachedRecs && cachedPats));
  const setStartedAtRef = useRef(null);     // ms timestamp when current set began
  const savedSetIdRef = useRef(null);       // guard so we save each set exactly once

  async function loadHub() {
    // Only show the skeleton if we have NOTHING to render - otherwise
    // refresh in the background and keep the stale data on screen.
    if (!peek('qb:history')) setHubLoading(true);
    try {
      const [h, r, p] = await Promise.all([
        fetchOnce('qb:history', fetchQuizBowlHistory)
          .catch(() => ({ sets: [], stats: { sets: 0, accuracy: 0, studyMs: 0, categoryStats: {} } })),
        fetchOnce('qb:recs', fetchQuizBowlRecommendations)
          .catch(() => ({ recommendations: [] })),
        fetchOnce('qb:patterns', fetchQuizBowlPatterns)
          .catch(() => ({ patterns: null })),
      ]);
      setHistory(h);
      setRecs(r.recommendations || []);
      setPatterns(p.patterns || null);
    } finally { setHubLoading(false); }
  }

  // After a completed set, bust the hub caches so loadHub() re-fetches
  // (instead of returning the stale "before this set" data).
  function bustHubCache() { bustPrefix('qb:'); }
  useEffect(() => { loadHub(); }, []);

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

  // Refs so the keydown handler (registered once per view change) always
  // reads the latest state without needing a stale-closure re-registration.
  const _buzzedRef    = useRef(buzzed);    _buzzedRef.current    = buzzed;
  const _readingRef   = useRef(reading);   _readingRef.current   = reading;
  const _showResultRef= useRef(showResult);_showResultRef.current= showResult;
  const _stopRef      = useRef(stop);      _stopRef.current      = stop;
  const _submitRef    = useRef(null);
  const _nextQRef     = useRef(null);

  // Reset the per-set tracker each time a fresh round kicks off so the
  // save effect below doesn't think the previous set is still active.
  function beginNewSet() {
    setStartedAtRef.current = Date.now();
    savedSetIdRef.current = null;
  }

  // Launch a set with explicit category/difficulty/source - used by the
  // hub's "Train weakness" / "Recommended" / "Replay last" CTAs so the
  // user can skip the setup form when the choice is already implied.
  // Pass `customInstructions` to focus AI-generated questions on a niche topic.
  async function launchSet({ category: cat, difficulty: diff, source = 'qbreader', customInstructions: customInstr = '' }) {
    setCategory(cat);
    setDifficulty(diff);
    setQuestionSource(source);
    // Run the same fetch logic handleGenerate() does, inline so the
    // state updates above settle into the closure.
    setGenerating(true); setError(null);
    try {
      if (source === 'qbreader') {
        const data = await fetchQBReaderTossups({ count: QB_BATCH_SIZE, category: cat, difficulty: diff });
        const tossups = data?.tossups || [];
        if (!tossups.length) { setError('No questions for that combo.'); setGenerating(false); return; }
        setQuestions(tossups);
        setPlayingSource('qbreader');
      } else {
        const result = await apiFetch('/api/chat', {
          method: 'POST',
          body: JSON.stringify({
            system: SYSTEM_PROMPT,
            messages: [{ role: 'user', content: generatePrompt(cat, diff, 10, customInstr) }],
            max_tokens: 8192,
          }),
        });
        const text = result.content?.[0]?.text || '';
        let parsed;
        try { parsed = JSON.parse(text); } catch { const m = text.match(/\{[\s\S]*\}/); if (m) parsed = JSON.parse(m[0]); }
        if (!parsed?.questions?.length) { setError('Generation failed.'); setGenerating(false); return; }
        // Pull NAQT power marks out of AI-authored tossups.
        setQuestions(parsed.questions.map(q => ({ ...q, ...parseTossupText(q.text || '') })));
        setPlayingSource('ai');
      }
      setCurrentQ(0); setScores([]); setBuzzed(false); setShowResult(false); setReading(true);
      fetchingMoreRef.current = false;
      beginNewSet();
      setView('playing');
    } catch (err) { setError(err.message || 'Failed to load.'); }
    setGenerating(false);
  }

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
          beginNewSet();
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
        setQuestions(parsed.questions.map(q => ({ ...q, ...parseTossupText(q.text || '') })));
        setPlayingSource('ai');
        setCurrentQ(0); setScores([]); setBuzzed(false); setShowResult(false); setReading(true);
        beginNewSet();
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
    const points = naqtPointsFor(isCorrect, wordIndex, q.powerWordIndex, totalWords);
    setScores(prev => [...prev, { question: currentQ, correct: isCorrect, buzzWord: wordIndex, totalWords, powerWordIndex: q.powerWordIndex ?? null, points, answer: answer.trim(), correctAnswer: q.answer }]);
  }

  function handleTimeout() {
    const points = naqtPointsFor(false, -1, q.powerWordIndex, totalWords);
    setScores(prev => [...prev, { question: currentQ, correct: false, buzzWord: -1, totalWords, powerWordIndex: q.powerWordIndex ?? null, points, answer: '', correctAnswer: q.answer }]);
    setShowResult(true); setCorrect(false); setBuzzed(true);
  }

  useEffect(() => {
    if (done && !buzzed && view === 'playing') {
      const t = setTimeout(handleTimeout, 2000);
      return () => clearTimeout(t);
    }
  }, [done, buzzed, view]);

  // Save the set once when the user hits the review screen. Wrapped in
  // a ref guard so re-renders or going back into review don't double-
  // submit. We tag each per-question record with its source category
  // (QBReader tossups carry their own category metadata; AI-generated
  // ones inherit the set's category).
  useEffect(() => {
    if (view !== 'review') return;
    if (savedSetIdRef.current) return;
    if (!scores.length) return;
    const startedAt = setStartedAtRef.current || Date.now();
    const durationMs = Math.max(0, Date.now() - startedAt);
    const perQuestion = scores.map((s, i) => {
      const q = questions[i] || {};
      // QBReader tossups expose `category` directly; fall back to the
      // set's selected category for AI rounds.
      const qcat = q.category || (category === 'Mixed' ? 'Mixed' : category);
      return {
        category: qcat,
        correct: !!s.correct,
        buzzWord: s.buzzWord,
        totalWords: s.totalWords,
        powerWordIndex: s.powerWordIndex ?? null,
        points: typeof s.points === 'number' ? s.points : (s.correct ? 10 : 0),
        answer: s.answer,
        correctAnswer: s.correctAnswer,
        text: q.text || '',
      };
    });
    const score = scores.filter(s => s.correct).length;
    const points = perQuestion.reduce((n, q) => n + (q.points || 0), 0);
    const total = scores.length;
    // Mark as saved synchronously so re-entries don't fire a duplicate.
    savedSetIdRef.current = 'pending';
    saveQuizBowlSet({
      category, difficulty,
      source: playingSource === 'qbreader' ? 'qbreader' : 'ai',
      score, points, total, durationMs,
      perQuestion,
    }).then(r => {
      savedSetIdRef.current = r?.set?.id || 'saved';
      // Quietly refresh the hub data so the next time the user returns
      // there, the new set + updated weakness data shows up.
      bustHubCache();
      loadHub();
    }).catch(err => {
      console.warn('Failed to save QB set:', err);
      savedSetIdRef.current = null; // allow a retry next time
    });
  }, [view, scores, questions, category, difficulty, playingSource]);

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

  // Keep function refs current so the single keydown listener (registered
  // only when view changes) always calls the latest version.
  _submitRef.current   = handleSubmit;
  _nextQRef.current    = nextQuestion;

  useEffect(() => {
    if (view !== 'playing') return;
    function onKey(e) {
      const buzzed     = _buzzedRef.current;
      const reading    = _readingRef.current;
      const showResult = _showResultRef.current;
      if (e.key === ' ' && !buzzed && e.target.tagName !== 'INPUT' && e.target.tagName !== 'TEXTAREA') {
        e.preventDefault();
        if (!buzzed && reading) { setBuzzed(true); setReading(false); _stopRef.current?.(); }
      }
      if (e.key === 'Enter' && buzzed && !showResult) { e.preventDefault(); _submitRef.current?.(); }
      else if (e.key === 'Enter' && showResult) { e.preventDefault(); _nextQRef.current?.(); }
    }
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [view]);

  // ===== REVIEW =====
  if (view === 'review') {
    const totalCorrect = scores.filter(s => s.correct).length;
    const earlyBuzzes = scores.filter(s => s.correct && s.buzzWord < s.totalWords * 0.5).length;
    const denom = playingSource === 'qbreader' ? scores.length : questions.length;
    const naqtTotal = scores.reduce((n, s) => n + (s.points || 0), 0);
    const powers = scores.filter(s => s.points === 15).length;
    const gets = scores.filter(s => s.points === 10).length;
    const negs = scores.filter(s => s.points === -5).length;
    return (
      <div className="h-full overflow-y-auto bg-transparent">
        <div className="p-5">
          <div className="text-center mb-6 pt-4">
            <div className="text-[42px] font-bold text-white tabular-nums leading-none">
              {naqtTotal}<span className="text-white/30 text-[24px]"> pts</span>
            </div>
            <div className="text-[12px] text-white/55 mt-1 tabular-nums">
              {totalCorrect}/{denom} correct
              {powers > 0 && <span className="text-amber-300 ml-2">· {powers} power{powers > 1 ? 's' : ''}</span>}
              {gets > 0 && <span className="text-white/55 ml-2">· {gets} get{gets > 1 ? 's' : ''}</span>}
              {negs > 0 && <span className="text-rose-300 ml-2">· {negs} neg{negs > 1 ? 's' : ''}</span>}
            </div>
            <div className="flex items-center justify-center gap-3 mt-2">
              {earlyBuzzes > 0 && <span className="text-[11px] text-white/55 font-medium">{earlyBuzzes} early</span>}
              <span className="text-[11px] text-white/45">{category} · {difficulty}{playingSource === 'qbreader' ? ' · QB' : ''} · NAQT</span>
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
                    {typeof s.points === 'number' && (
                      <span className={`text-[10px] font-bold tabular-nums px-1.5 py-0.5 rounded ${
                        s.points === 15 ? 'bg-amber-500/20 text-amber-300 border border-amber-400/30'
                        : s.points === 10 ? 'bg-emerald-500/15 text-emerald-300 border border-emerald-400/25'
                        : s.points === -5 ? 'bg-rose-500/20 text-rose-300 border border-rose-400/30'
                        : 'bg-white/[0.06] text-white/45 border border-white/[0.10]'
                      }`}>
                        {s.points > 0 ? `+${s.points}` : s.points}
                      </span>
                    )}
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
      <ViewFade viewKey={`playing:${currentQ}`} className="flex flex-col h-full bg-transparent">
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
            <div className="absolute right-2 top-full mt-1 w-72 z-20 rounded-2xl border border-white/15 bg-gradient-to-b from-white/[0.10] to-white/[0.03] backdrop-blur-2xl backdrop-saturate-150 p-3.5 space-y-3">
              <div className="flex items-center justify-between">
                <span className="text-[10px] font-bold uppercase tracking-wider text-white/55">Settings</span>
                <button onClick={() => setSettingsOpen(false)} className="text-white/45 hover:text-white/75"><X size={12} /></button>
              </div>
              <div>
                <div className="grid grid-cols-3 gap-1">
                  {CATEGORIES.map(c => (
                    <button key={c} onClick={() => setCategory(c)}
                      className={`px-2 py-1 rounded-xl text-[10px] font-semibold transition-colors focus:outline-none focus-visible:ring-1 focus-visible:ring-blue-400/60 ${category === c ? 'bg-blue-500/20 text-white border border-blue-400/50' : 'bg-white/[0.04] text-white/55 border border-transparent hover:bg-white/[0.08] hover:text-white/75'}`}>
                      {c}
                    </button>
                  ))}
                </div>
              </div>
              <div className="grid grid-cols-2 gap-1">
                {DIFFICULTIES.map(d => (
                  <button key={d} onClick={() => setDifficulty(d)}
                    className={`px-2 py-1.5 rounded-xl text-[11px] font-semibold transition-colors focus:outline-none focus-visible:ring-1 focus-visible:ring-blue-400/60 ${difficulty === d ? 'bg-blue-500/20 text-white border border-blue-400/50' : 'bg-white/[0.04] text-white/55 border border-transparent hover:bg-white/[0.08] hover:text-white/75'}`}>
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
                  onChange={e => setRevealSpeedMs(Number(e.target.value))} className="w-full accent-blue-400" />
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
                className="w-full py-4 rounded-2xl bg-blue-600 hover:bg-blue-500 text-white text-[15px] font-bold uppercase tracking-[0.15em] active:scale-[0.98] transition-all">
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
              <AnswerResultPanel
                correct={correct}
                userAnswer={answer}
                officialAnswer={q.answer}
                meta={(() => {
                  const pts = naqtPointsFor(correct, wordIndex, q.powerWordIndex, totalWords);
                  if (correct) {
                    return pts === 15 ? `+15 · POWER` : `+${pts}`;
                  }
                  return pts ? `${pts}` : 'Incorrect';
                })()}
              />
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
      </ViewFade>
    );
  }

  // ===== AI LOBBY =====
  if (view === 'ai-lobby') {
    return (
      <ViewFade viewKey="ai-lobby" className="h-full flex flex-col">
        <AILobbyView user={user} initialLobbyType={aiLobbyInitial} onExit={() => { setView('hub'); setAiLobbyInitial('lobby'); bustHubCache(); loadHub(); }} />
      </ViewFade>
    );
  }

  // ===== MULTIPLAYER =====
  if (view === 'multiplayer') {
    return (
      <ViewFade viewKey="multiplayer" className="h-full flex flex-col">
        <QuizBowlMatch user={user} onExit={() => setView('hub')} />
      </ViewFade>
    );
  }

  // ===== CUSTOM SETUP (legacy form - opened from hub) =====
  if (view === 'custom') {
    return (
      <div className="h-full overflow-y-auto bg-transparent">
        <div className="p-5 pb-8 space-y-3">
          <button onClick={() => setView('hub')} className="text-[11px] text-white/40 hover:text-white/70 inline-flex items-center gap-1 mb-1">
            <ChevronRight size={12} className="rotate-180" /> Hub
          </button>

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
                onChange={e => setQuestionCount(Number(e.target.value))} className="w-full accent-blue-400" />
            </div>
          )}

          {/* Speed */}
          <div>
            <div className="flex items-center justify-between mb-1.5">
              <span className="text-[10px] text-white/50 uppercase tracking-wider">Speed</span>
              <span className="text-[11px] font-mono text-white/70">{revealSpeedMs}ms</span>
            </div>
            <input type="range" min="60" max="400" step="10" value={revealSpeedMs}
              onChange={e => setRevealSpeedMs(Number(e.target.value))} className="w-full accent-blue-400" />
          </div>

          {/* Custom instructions (AI only) */}
          {questionSource === 'ai' && (
            <textarea value={customInstructions} onChange={e => setCustomInstructions(e.target.value)}
              placeholder="Custom instructions…" rows={2}
              className="w-full px-3 py-2.5 rounded-xl border border-white/8 bg-white/[0.04] text-[12px] text-white/80 placeholder-white/20 resize-none outline-none focus:border-white/15 transition-colors" />
          )}

          {/* Start */}
          <button onClick={handleGenerate} disabled={generating}
            className="w-full py-3.5 rounded-2xl bg-blue-500 hover:bg-blue-400 backdrop-blur-sm disabled:opacity-40 text-white text-[14px] font-bold inline-flex items-center justify-center gap-2 transition-all border border-blue-400/40">
            {generating
              ? <><InlineProgress active /> {questionSource === 'qbreader' ? 'Loading…' : 'Generating…'}</>
              : <><Play size={15} /> Start</>}
          </button>
        </div>
      </div>
    );
  }

  // ===== LOADING (between hub launch and 'playing') =====
  // Gemini generation typically takes 10-20s; qbreader is faster but
  // can stall. A simulated progress bar reads better than a bare
  // spinner - the user sees forward motion and knows roughly how
  // close they are.
  if (view === 'hub' && generating) {
    const isFetch = questionSource === 'qbreader';
    return (
      <div className="h-full flex flex-col bg-transparent">
        <div className="flex-1 flex flex-col items-center justify-center px-5">
          <div className="w-full max-w-sm">
            <ProgressBar
              active
              duration={isFetch ? 4000 : 14000}
              label={isFetch ? `Fetching ${category} tossups` : `Generating ${category} questions`}
              hint={isFetch ? 'Pulling from QBReader…' : 'The AI is writing fresh tossups for this set.'}
            />
          </div>
        </div>
      </div>
    );
  }

  // ===== REPLAY - watch back a saved set question by question =====
  if (view === 'replay' && replaySet) {
    return <ReplayView set={replaySet} onExit={() => { setReplaySet(null); setView('hub'); }} />;
  }

  // ===== HUB (default) - stats, recommendations, history =====
  return (
    <ViewFade viewKey="hub" className="h-full flex flex-col">
    <QuizBowlHub
      hubLoading={hubLoading}
      history={history}
      recs={recs}
      patterns={patterns}
      error={error}
      generating={generating}
      onLaunch={launchSet}
      onMultiplayer={() => setView('multiplayer')}
      onCustom={() => setView('custom')}
      onAILobby={() => { setAiLobbyInitial('lobby'); setView('ai-lobby'); }}
      onReplay={(s) => { setReplaySet(s); setView('replay'); }}
    />
    </ViewFade>
  );
}

// ============================================================
// HUB
// ============================================================
function QuizBowlHub({ hubLoading, history, recs, patterns, error, generating, onLaunch, onMultiplayer, onCustom, onAILobby, onReplay }) {
  const stats = history?.stats || { sets: 0, accuracy: 0, studyMs: 0, categoryStats: {} };
  const sets = history?.sets || [];

  // Pre-compute weakness ranking from category stats. We surface up to
  // three weakest categories with at least 3 attempts so a single bad
  // round doesn't dominate the list.
  const weaknesses = useMemo(() => {
    return Object.entries(stats.categoryStats || {})
      .filter(([, v]) => v.total >= 3)
      .map(([cat, v]) => ({ cat, acc: Math.round((v.correct / v.total) * 100), total: v.total }))
      .sort((a, b) => a.acc - b.acc)
      .slice(0, 3);
  }, [stats.categoryStats]);

  return (
    <div className="h-full overflow-y-auto bg-transparent">
      <div className="p-5 pb-8 space-y-4">
        {/* Top stat row */}
        <div className="grid grid-cols-3 gap-2">
          <HubStat icon={<Target size={12} />} label="Sets" value={stats.sets} />
          <HubStat icon={<TrendingDown size={12} />} label="Accuracy" value={`${stats.accuracy}%`} accent={stats.accuracy >= 75 ? 'emerald' : stats.accuracy >= 50 ? 'amber' : 'rose'} />
          <HubStat icon={<Clock size={12} />} label="Study time" value={formatDuration(stats.studyMs)} />
        </div>

        {error && <p className="text-[11px] text-rose-400 px-3 py-2 rounded-xl bg-rose-500/10 border border-rose-500/20 text-center">{error}</p>}

        {/* Buzz patterns - shows when there's enough data */}
        {patterns && <BuzzPatterns patterns={patterns} />}

        {/* Train weaknesses CTA - only when we have enough data */}
        {weaknesses.length > 0 && (
          <button
            onClick={() => onLaunch({ category: weaknesses[0].cat, difficulty: 'Medium', source: 'qbreader' })}
            disabled={generating}
            className="w-full text-left rounded-2xl border border-rose-400/30 bg-gradient-to-br from-rose-500/20 via-rose-500/10 to-transparent p-4 hover:border-rose-400/55 hover:from-rose-500/30 transition-all disabled:opacity-40"
          >
            <div className="flex items-center gap-2 mb-1">
              <span className="inline-flex w-7 h-7 rounded-lg bg-rose-500/25 border border-rose-400/40 items-center justify-center"><Flame size={14} className="text-rose-300" /></span>
              <span className="text-[10px] uppercase tracking-[0.18em] font-bold text-rose-300/90">Train weaknesses</span>
            </div>
            <p className="text-[15px] font-bold text-white/95 mb-0.5">Practice {weaknesses[0].cat}</p>
            <p className="text-[11px] text-white/55">
              You're at <span className="text-rose-300 font-semibold">{weaknesses[0].acc}%</span> over {weaknesses[0].total} questions. The AI will keep feeding you {weaknesses[0].cat} tossups until you climb back.
            </p>
          </button>
        )}

        {/* Play vs AI CTA */}
        <button
          onClick={onAILobby}
          className="w-full text-left rounded-2xl border border-blue-500/30 bg-gradient-to-br from-blue-500/20 via-blue-500/10 to-transparent p-4 hover:border-blue-400/55 hover:from-blue-500/30 transition-all"
        >
          <div className="flex items-center gap-2 mb-1">
            <span className="inline-flex w-7 h-7 rounded-lg bg-blue-500/25 border border-blue-400/40 items-center justify-center"><Users size={14} className="text-blue-300" /></span>
            <span className="text-[10px] uppercase tracking-[0.18em] font-bold text-blue-300/90">Play vs AI</span>
          </div>
          <p className="text-[15px] font-bold text-white/95 mb-0.5">Compete in a Lobby</p>
          <p className="text-[11px] text-white/55">Join a lobby of 8 or go 1v1. Buzz against AI opponents with real tournament timing across niche history and more.</p>
        </button>

        {/* Quick access: head-to-head + custom set */}
        <div className="grid grid-cols-2 gap-2">
          <button onClick={onMultiplayer}
            className="py-2.5 rounded-2xl border border-white/[0.08] bg-white/[0.03] hover:bg-white/[0.06] text-white/70 hover:text-white/95 text-[12px] font-semibold inline-flex items-center justify-center gap-2 transition-colors">
            <Users size={13} /> Head-to-head
          </button>
          <button onClick={onCustom}
            className="py-2.5 rounded-2xl border border-white/[0.08] bg-white/[0.03] hover:bg-white/[0.06] text-white/70 hover:text-white/95 text-[12px] font-semibold inline-flex items-center justify-center gap-2 transition-colors">
            <Settings size={13} /> Custom set
          </button>
        </div>

        {/* Recommendations */}
        {recs.length > 0 && (
          <div>
            <div className="flex items-center gap-1.5 mb-1.5">
              <Sparkles size={11} className="text-white/40" />
              <span className="text-[10px] uppercase tracking-[0.16em] font-bold text-white/40">Recommended for you</span>
            </div>
            <div className="space-y-1.5">
              {recs.map((r, i) => (
                <button key={i}
                  onClick={() => onLaunch({ category: r.category, difficulty: r.difficulty, source: r.source || 'qbreader', customInstructions: r.customInstructions || '' })}
                  disabled={generating}
                  className="group w-full text-left rounded-xl border border-white/[0.08] bg-white/[0.03] hover:bg-white/[0.07] hover:border-white/[0.16] p-3 transition-colors disabled:opacity-40 flex items-center gap-3"
                >
                  <span className={`w-8 h-8 rounded-lg flex items-center justify-center flex-shrink-0 ${
                    r.kind === 'niche'         ? 'bg-violet-500/15 text-violet-300 border border-violet-400/30' :
                    r.kind === 'train-weakness'? 'bg-rose-500/15 text-rose-300 border border-rose-400/30' :
                    r.kind === 'explore'       ? 'bg-blue-500/15 text-blue-300 border border-blue-400/30' :
                                                 'bg-amber-500/15 text-amber-300 border border-amber-400/30'
                  }`}>
                    {r.kind === 'niche'          ? <Sparkles size={14} /> :
                     r.kind === 'train-weakness' ? <Target size={14} /> :
                     r.kind === 'explore'        ? <Sparkles size={14} /> :
                                                   <Play size={14} />}
                  </span>
                  <div className="flex-1 min-w-0">
                    <p className="text-[13px] font-semibold text-white/90">
                      {r.topic || r.category}
                      <span className="text-white/35 font-normal"> · {r.difficulty}</span>
                    </p>
                    <p className="text-[11px] text-white/45 truncate">
                      {r.topic && <span className="text-white/25">{r.category} · </span>}{r.reason}
                    </p>
                  </div>
                  <ChevronRight size={14} className="text-white/25 group-hover:text-white/55 group-hover:translate-x-0.5 transition-all flex-shrink-0" />
                </button>
              ))}
            </div>
          </div>
        )}

        {/* Past sets */}
        {sets.length > 0 && (
          <div>
            <div className="flex items-center gap-1.5 mb-1.5">
              <History size={11} className="text-white/40" />
              <span className="text-[10px] uppercase tracking-[0.16em] font-bold text-white/40">Past sets</span>
              <span className="text-[10px] text-white/30">· {sets.length}</span>
            </div>
            <div className="space-y-1">
              {sets.slice(0, 10).map((s) => {
                const pct = s.total ? Math.round((s.score / s.total) * 100) : 0;
                const ago = formatRelative(Date.now() - new Date(s.finishedAt).getTime());
                const hasPoints = typeof s.points === 'number';
                const scoreCls = pct >= 75 ? 'text-emerald-300 bg-emerald-500/10 border-emerald-500/25'
                  : pct >= 50 ? 'text-white/80 bg-white/[0.06] border-white/[0.12]'
                  : 'text-rose-300 bg-rose-500/10 border-rose-500/25';
                return (
                  <div key={s.id} onClick={() => onReplay?.(s)}
                    className="flex items-center gap-3 rounded-lg px-3 py-2 bg-white/[0.02] border border-white/[0.05] hover:border-white/[0.14] hover:bg-white/[0.05] transition-colors cursor-pointer group">
                    <div className={`min-w-[44px] px-2 py-1 rounded-md border text-center text-[11px] font-bold tabular-nums ${scoreCls}`}>
                      {hasPoints ? `${s.points} pts` : `${s.score}/${s.total}`}
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-[12px] font-medium text-white/85 truncate">{s.category} <span className="text-white/35">· {s.difficulty}</span></p>
                      <p className="text-[10px] text-white/35">{ago} · {s.source === 'ai' ? 'AI' : 'QBReader'} · {formatDuration(s.durationMs)} · {s.score}/{s.total} correct</p>
                    </div>
                    <Eye size={12} className="text-white/20 group-hover:text-white/50 flex-shrink-0 transition-colors" />
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {/* Category breakdown */}
        {weaknesses.length > 0 && (
          <div>
            <div className="flex items-center gap-1.5 mb-1.5">
              <TrendingDown size={11} className="text-white/40" />
              <span className="text-[10px] uppercase tracking-[0.16em] font-bold text-white/40">By category</span>
            </div>
            <div className="space-y-1">
              {Object.entries(stats.categoryStats || {})
                .map(([cat, v]) => ({ cat, acc: v.total ? Math.round((v.correct / v.total) * 100) : 0, total: v.total }))
                .sort((a, b) => a.acc - b.acc)
                .map(({ cat, acc, total }) => {
                  const barCls = acc >= 75 ? 'bg-emerald-400/70' : acc >= 50 ? 'bg-amber-400/70' : 'bg-rose-400/70';
                  return (
                    <button key={cat}
                      onClick={() => onLaunch({ category: cat, difficulty: 'Medium', source: 'qbreader' })}
                      disabled={generating}
                      className="w-full grid grid-cols-[80px_1fr_56px] items-center gap-2 px-3 py-2 rounded-lg bg-white/[0.02] border border-white/[0.05] hover:bg-white/[0.05] hover:border-white/[0.10] transition-colors text-left disabled:opacity-40"
                    >
                      <span className="text-[11px] text-white/75 font-medium truncate">{cat}</span>
                      <div className="h-1.5 rounded-full bg-white/[0.06] overflow-hidden">
                        <div className={`h-full rounded-full ${barCls}`} style={{ width: `${Math.max(4, acc)}%` }} />
                      </div>
                      <span className="text-[10px] text-white/45 tabular-nums text-right">{acc}% · {total}</span>
                    </button>
                  );
                })}
            </div>
          </div>
        )}

        {/* Empty state for new players */}
        {hubLoading ? (
          <div className="py-6 text-center text-[11px] text-white/35">Loading your stats…</div>
        ) : sets.length === 0 && (
          <div className="rounded-2xl border border-dashed border-white/[0.10] bg-white/[0.02] p-5 text-center">
            <Zap size={22} className="text-white/30 mx-auto mb-2" />
            <p className="text-[13px] font-semibold text-white/80">No sets yet</p>
            <p className="text-[11px] text-white/40 mt-1 mb-3">Start a recommended round above, or pick your own filters in Custom.</p>
          </div>
        )}
      </div>
    </div>
  );
}

function HubStat({ icon, label, value, accent }) {
  const accentCls = accent === 'emerald' ? 'text-emerald-300'
    : accent === 'amber' ? 'text-amber-300'
    : accent === 'rose' ? 'text-rose-300'
    : 'text-white/90';
  return (
    <div className="rounded-xl border border-white/[0.07] bg-white/[0.03] px-3 py-2.5">
      <div className="flex items-center gap-1.5 text-[9.5px] uppercase tracking-[0.16em] font-bold text-white/35 mb-1">
        <span className="text-white/45">{icon}</span>
        <span>{label}</span>
      </div>
      <div className={`text-[17px] font-bold tabular-nums leading-none ${accentCls}`}>{value}</div>
    </div>
  );
}

// ============================================================
// BUZZ PATTERNS - analytics about when/how the user buzzes.
// Shows a visual sparkline of recent buzz positions, accuracy
// by buzz timing (early/mid/late), per-category buzz habits,
// optimal zone, and trend.
// ============================================================
function BuzzPatterns({ patterns }) {
  const p = patterns;
  if (!p) return null;

  // Insight text based on the data.
  const insights = [];
  if (p.early.count > 0 && p.early.accuracy >= 70) {
    insights.push({ tone: 'emerald', text: `Your early buzzes hit ${p.early.accuracy}% of the time. You read questions well.` });
  } else if (p.early.count > 0 && p.early.accuracy < 50) {
    insights.push({ tone: 'amber', text: `Early buzzes only land ${p.early.accuracy}%. Try waiting for one more clue before committing.` });
  }
  if (p.timeoutRate > 30) {
    insights.push({ tone: 'rose', text: `You time out on ${p.timeoutRate}% of questions. Try buzzing even if you're not 100% sure.` });
  }
  if (p.trend > 10) {
    insights.push({ tone: 'emerald', text: `You're buzzing ${p.trend}% earlier in recent sets. Your pattern recognition is improving.` });
  } else if (p.trend < -10) {
    insights.push({ tone: 'amber', text: `Recent buzzes are ${Math.abs(p.trend)}% later than your average. Might be tougher categories.` });
  }
  if (p.optimalZone) {
    insights.push({ tone: 'blue', text: `Your sweet spot is ${p.optimalZone.start}-${p.optimalZone.end}% through the question (${p.optimalZone.accuracy}% accuracy there).` });
  }

  return (
    <div className="rounded-2xl border border-white/[0.08] bg-white/[0.02] overflow-hidden">
      {/* Header */}
      <div className="px-4 pt-3 pb-2 flex items-center gap-2">
        <span className="w-6 h-6 rounded-lg bg-violet-500/20 border border-violet-400/30 grid place-items-center">
          <Zap size={12} className="text-violet-300" />
        </span>
        <span className="text-[11px] uppercase tracking-[0.16em] font-bold text-white/50">Buzz Patterns</span>
        <div className="flex-1" />
        <span className="text-[10px] text-white/30 tabular-nums">{p.totalBuzzes} buzzes</span>
      </div>

      {/* Sparkline - recent 20 buzzes as dots on a timeline */}
      {p.recentBuzzes?.length > 3 && (
        <div className="px-4 py-2">
          <div className="relative h-8 rounded-lg bg-white/[0.03] border border-white/[0.04] overflow-hidden">
            {/* Zone markers */}
            <div className="absolute inset-0 flex">
              <div className="flex-1 border-r border-white/[0.04]" />
              <div className="flex-1 border-r border-white/[0.04]" />
              <div className="flex-1" />
            </div>
            <div className="absolute bottom-0 left-0 right-0 flex justify-between px-1 text-[7px] text-white/20 font-mono">
              <span>early</span><span>mid</span><span>late</span>
            </div>
            {/* Dots */}
            {p.recentBuzzes.map((b, i) => (
              <div
                key={i}
                className={`absolute w-1.5 h-1.5 rounded-full ${b.correct ? 'bg-emerald-400' : 'bg-rose-400'}`}
                style={{
                  left: `${Math.max(2, Math.min(98, b.position))}%`,
                  top: `${4 + (i % 3) * 8}px`,
                  opacity: 0.5 + (i / p.recentBuzzes.length) * 0.5,
                }}
                title={`${b.category}: ${b.position}% - ${b.correct ? 'correct' : 'wrong'}`}
              />
            ))}
          </div>
        </div>
      )}

      {/* Timing breakdown: early / mid / late */}
      <div className="grid grid-cols-3 gap-px bg-white/[0.04] mx-4 rounded-lg overflow-hidden mb-3">
        <TimingCell label="Early" sub="0-33%" count={p.early.count} accuracy={p.early.accuracy} tone="emerald" />
        <TimingCell label="Mid" sub="33-66%" count={p.mid.count} accuracy={p.mid.accuracy} tone="blue" />
        <TimingCell label="Late" sub="66-100%" count={p.late.count} accuracy={p.late.accuracy} tone="amber" />
      </div>

      {/* Avg buzz position + timeout rate */}
      <div className="grid grid-cols-2 gap-2 px-4 mb-3">
        <div className="rounded-lg bg-white/[0.03] border border-white/[0.05] px-3 py-2">
          <div className="text-[9px] uppercase tracking-[0.14em] font-bold text-white/35 mb-0.5">Avg buzz point</div>
          <div className="text-[15px] font-bold text-white/90 tabular-nums">{p.avgBuzzPosition}%</div>
          <div className="mt-1 h-1 rounded-full bg-white/[0.06] overflow-hidden">
            <div className="h-full rounded-full bg-violet-400/70" style={{ width: `${p.avgBuzzPosition}%` }} />
          </div>
        </div>
        <div className="rounded-lg bg-white/[0.03] border border-white/[0.05] px-3 py-2">
          <div className="text-[9px] uppercase tracking-[0.14em] font-bold text-white/35 mb-0.5">Timeout rate</div>
          <div className={`text-[15px] font-bold tabular-nums ${p.timeoutRate > 25 ? 'text-rose-300' : 'text-white/90'}`}>{p.timeoutRate}%</div>
          <div className="mt-1 h-1 rounded-full bg-white/[0.06] overflow-hidden">
            <div className={`h-full rounded-full ${p.timeoutRate > 25 ? 'bg-rose-400/70' : 'bg-white/20'}`} style={{ width: `${Math.min(100, p.timeoutRate)}%` }} />
          </div>
        </div>
      </div>

      {/* Per-category buzz habits */}
      {p.categoryPatterns?.length > 0 && (
        <div className="px-4 mb-3">
          <div className="text-[9px] uppercase tracking-[0.14em] font-bold text-white/30 mb-1.5">Category buzz habits</div>
          <div className="space-y-1">
            {p.categoryPatterns.map(c => {
              const barColor = c.accuracy >= 75 ? 'bg-emerald-400/60' : c.accuracy >= 50 ? 'bg-blue-400/60' : 'bg-rose-400/60';
              return (
                <div key={c.category} className="flex items-center gap-2">
                  <span className="text-[10px] text-white/60 w-[70px] truncate">{c.category}</span>
                  <div className="flex-1 h-1.5 rounded-full bg-white/[0.05] overflow-hidden relative">
                    {/* Buzz position marker */}
                    <div
                      className="absolute top-0 bottom-0 w-0.5 bg-white/50 z-10"
                      style={{ left: `${c.avgBuzzPosition}%` }}
                    />
                    <div className={`h-full rounded-full ${barColor}`} style={{ width: `${c.accuracy}%` }} />
                  </div>
                  <span className="text-[9px] text-white/40 tabular-nums w-14 text-right">
                    {c.avgBuzzPosition}% · {c.accuracy}%
                  </span>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* AI insights */}
      {insights.length > 0 && (
        <div className="px-4 pb-3 space-y-1.5">
          {insights.map((ins, i) => {
            const toneCls = ins.tone === 'emerald' ? 'border-emerald-500/25 bg-emerald-500/8 text-emerald-200'
              : ins.tone === 'amber' ? 'border-amber-500/25 bg-amber-500/8 text-amber-200'
              : ins.tone === 'rose' ? 'border-rose-500/25 bg-rose-500/8 text-rose-200'
              : 'border-blue-500/25 bg-blue-500/8 text-blue-200';
            return (
              <div key={i} className={`rounded-lg border px-3 py-2 text-[11px] leading-relaxed ${toneCls}`}>
                {ins.text}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

function TimingCell({ label, sub, count, accuracy, tone }) {
  const accentCls = tone === 'emerald' ? 'text-emerald-300'
    : tone === 'blue' ? 'text-blue-300'
    : 'text-amber-300';
  return (
    <div className="bg-white/[0.02] px-3 py-2 text-center">
      <div className="text-[10px] font-bold text-white/55">{label}</div>
      <div className="text-[8px] text-white/25 mb-1">{sub}</div>
      <div className={`text-[14px] font-bold tabular-nums ${count > 0 ? accentCls : 'text-white/25'}`}>
        {count > 0 ? `${accuracy}%` : '--'}
      </div>
      <div className="text-[8px] text-white/30 tabular-nums">{count} buzz{count !== 1 ? 'es' : ''}</div>
    </div>
  );
}

function formatDuration(ms) {
  const total = Math.round((ms || 0) / 1000);
  if (total < 60) return `${total}s`;
  const min = Math.floor(total / 60);
  if (min < 60) return `${min}m`;
  const h = Math.floor(min / 60);
  return `${h}h ${min % 60}m`;
}

function formatRelative(deltaMs) {
  const m = Math.floor(deltaMs / 60_000);
  if (m < 1) return 'just now';
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  const d = Math.floor(h / 24);
  if (d < 30) return `${d}d ago`;
  return new Date(Date.now() - deltaMs).toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
}

function GlassTile({ active, icon, label, sub, onClick }) {
  return (
    <button onClick={onClick}
      className={`text-left rounded-2xl border p-3 transition-all backdrop-blur-sm ${
        active
          ? 'border-blue-400/45 bg-blue-500/15 text-white'
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
      className={`px-3 py-1.5 rounded-xl text-[11px] font-semibold transition-all whitespace-nowrap backdrop-blur-sm ${
        active
          ? 'bg-blue-500/20 text-white border border-blue-400/50'
          : 'bg-white/[0.05] border border-white/[0.08] text-white/55 hover:bg-white/[0.09] hover:text-white/80'
      }`}>
      {children}
    </button>
  );
}

// ── Room-strength target stats for the 8-player lobby ────────────────────
// Each level sets an absolute target (accuracy, buzz timing, think delay)
// that every bot in the room clusters around with small ±jitter. This is
// a deliberate replacement of the old "preserve the Newbie→Pro spread and
// multiply" approach - that made every preset stack a Pro-level Player 8
// against six weaker bots, which felt unfair regardless of level. Now a
// "Varsity" room is 7 roughly-Varsity bots, an "Elite" room is 7
// roughly-Elite bots, etc.
const ROOM_LEVELS = [
  { id: 'casual',  label: 'Casual',  stars: 1, accuracy: 0.52, buzzAt: 0.78, thinkMs: 2300 },
  { id: 'club',    label: 'Club',    stars: 2, accuracy: 0.68, buzzAt: 0.62, thinkMs: 1500 },
  { id: 'varsity', label: 'Varsity', stars: 3, accuracy: 0.78, buzzAt: 0.48, thinkMs: 950  },
  { id: 'elite',   label: 'Elite',   stars: 5, accuracy: 0.88, buzzAt: 0.30, thinkMs: 500  },
];
// Build a roster of N bots all sitting near the level's target with
// small per-bot variance so the room feels alive but not stacked. We
// keep each bot's identity (id, name, color) from the original ROSTER
// so display chrome stays consistent, but override the skill stats AND
// the label/stars to match the room level - the old per-bot
// "Newbie/Pro" labels were misleading once we equalized.
function scaleRoster(bots, levelId) {
  const m = ROOM_LEVELS.find(l => l.id === levelId) || ROOM_LEVELS[2];
  // Symmetric jitter so the average ends up at the target. Index 0 gets
  // the smallest offset and the spread grows linearly, capped so even
  // the strongest bot in the room stays within ~12% of the target.
  return bots.map((b, i, arr) => {
    const t = arr.length === 1 ? 0 : (i / (arr.length - 1)) - 0.5;  // -0.5..+0.5
    return {
      ...b,
      label:    m.label,
      stars:    m.stars,
      accuracy: Math.max(0.10, Math.min(0.98, m.accuracy + t * 0.12)),
      buzzAt:   Math.max(0.05, Math.min(0.95, m.buzzAt   + t * 0.14)),
      thinkMs:  Math.max(120,  Math.round(m.thinkMs * (1 + t * 0.30))),
    };
  });
}

// Map slider (0-100) ↔ buzzAt (0.05-0.95)
const BUZZ_MIN = 0.05, BUZZ_MAX = 0.95;
function sliderToBuzzAt(v) { return BUZZ_MIN + (v / 100) * (BUZZ_MAX - BUZZ_MIN); }
function buzzAtToSlider(b) { return Math.round(((b - BUZZ_MIN) / (BUZZ_MAX - BUZZ_MIN)) * 100); }
// Map slider (0-100) ↔ thinkMs (100-3200)
const THINK_MIN = 100, THINK_MAX = 3200;
function sliderToThink(v) { return Math.round(THINK_MIN + (v / 100) * (THINK_MAX - THINK_MIN)); }
function thinkToSlider(ms) { return Math.round(((ms - THINK_MIN) / (THINK_MAX - THINK_MIN)) * 100); }

// ── Bot-config preset storage (localStorage) ─────────────────────────
const QB_PRESETS_KEY = 'qb-bot-presets-v1';
function loadBotPresets() {
  try { return JSON.parse(localStorage.getItem(QB_PRESETS_KEY)) || []; }
  catch { return []; }
}
function saveBotPresets(list) {
  try { localStorage.setItem(QB_PRESETS_KEY, JSON.stringify(list)); } catch {}
}

// ============================================================
// AI LOBBY - compete against AI bots in a lobby of 8 or 1v1
// ============================================================
// Scoring formats - mirrors TrialPage / TrialSession definitions. Kept
// in sync so both AI play entry points feel identical. Values for IAC
// Prelim/Playoff are from the official IAC rules PDFs (Bee Preliminary
// & Playoff Rounds Scoring System) on iacompetitions.com.
const AI_LOBBY_SCORING_FORMATS = [
  { id: 'standard',    label: 'Standard',    desc: 'Continuous · earlier = more',
    powerThreshold: null, powerPts: null, getPts: 10, negPts: -5, target: null },
  { id: 'iac-prelim',  label: 'IAC Prelim',  desc: '1 pt · no neg · race to 8',
    powerThreshold: null, powerPts: null, getPts: 1, negPts: 0, target: 8 },
  { id: 'iac-playoff', label: 'IAC Playoff', desc: '6/5/4/3 · −2 / −1 neg',
    tiers: [{ upTo: 0.33, pts: 6 }, { upTo: 0.66, pts: 5 }, { upTo: 1.0, pts: 4 }],
    afterEndPts: 3, negDuring: -2, negAfter: -1,
    powerThreshold: 0.33, powerPts: 6, getPts: 4, negPts: -2, target: 40 },
  { id: 'jv',          label: 'JV',          desc: 'Get 10 · No power · No neg',
    powerThreshold: null, powerPts: null, getPts: 10, negPts: 0, target: 40 },
];

function AILobbyView({ onExit, user, initialLobbyType = 'lobby' }) {
  const [screen, setScreen]             = useState('setup');
  // lobbyType can be 'lobby' | 'head-to-head'
  const [lobbyType, setLobbyType]       = useState(initialLobbyType);
  // within head-to-head: 'ai' | 'real'
  const [h2hOpponent, setH2hOpponent]   = useState('ai');
  const [category, setCategory]         = useState('History');
  const [difficulty, setDifficulty]     = useState('medium');
  const [source, setSource]             = useState('qbreader');
  const [scoringFormat, setScoringFormat] = useState(AI_LOBBY_SCORING_FORMATS[0]);
  const [questions, setQuestions]       = useState([]);
  const [sessionBots, setSessionBots]   = useState(null);
  const [matchMode, setMatchMode]       = useState(false);
  const [lobbyMode, setLobbyMode]       = useState(false);
  const [error, setError]               = useState(null);
  const [topic, setTopic]               = useState('');
  const [lobbyCustomInstr, setLobbyCustomInstr] = useState('');
  const [botOverrides, setBotOverrides] = useState({});
  const [botNames, setBotNames] = useState(DEFAULT_BOT_NAMES);

  // ── Presets ──
  const [presets, setPresets]           = useState(() => loadBotPresets());
  const [savingPreset, setSavingPreset] = useState(false);
  const [presetName, setPresetName]     = useState('');

  // Lobby of 8: room competition level
  const [roomLevel, setRoomLevel]       = useState('varsity');

  // 1v1: which preset bot + fine-tune sliders
  const [selectedBotIdx, setSelectedBotIdx] = useState(2);
  const selectedPreset = BOT_ROSTER[selectedBotIdx];
  const [buzzSlider,  setBuzzSlider]  = useState(() => buzzAtToSlider(BOT_ROSTER[2].buzzAt));
  const [accSlider,   setAccSlider]   = useState(() => Math.round(BOT_ROSTER[2].accuracy * 100));
  const [thinkSlider, setThinkSlider] = useState(() => thinkToSlider(BOT_ROSTER[2].thinkMs));

  // Reset fine-tune to preset whenever a different bot is picked
  useEffect(() => {
    const b = BOT_ROSTER[selectedBotIdx];
    setBuzzSlider(buzzAtToSlider(b.buzzAt));
    setAccSlider(Math.round(b.accuracy * 100));
    setThinkSlider(thinkToSlider(b.thinkMs));
  }, [selectedBotIdx]);

  // Reset per-bot overrides when competition level changes
  useEffect(() => { setBotOverrides({}); }, [roomLevel]);

  const diffMap = { easy: 'Easy', medium: 'Medium', hard: 'Hard' };

  // Effective bots that will be passed to TrialSession
  const effectiveLobbyBots = useMemo(() => {
    const scaled = scaleRoster(BOT_ROSTER, roomLevel);
    return scaled.map(bot => {
      const ov = botOverrides[bot.id];
      if (!ov) return bot;
      return {
        ...bot,
        buzzAt:   ov.buzzSlider != null ? sliderToBuzzAt(ov.buzzSlider) : bot.buzzAt,
        accuracy: ov.accSlider  != null ? ov.accSlider / 100            : bot.accuracy,
      };
    });
  }, [roomLevel, botOverrides]);
  const effective1v1Bot = useMemo(() => ({
    ...selectedPreset,
    buzzAt:  sliderToBuzzAt(buzzSlider),
    accuracy: accSlider / 100,
    thinkMs:  sliderToThink(thinkSlider),
  }), [selectedPreset, buzzSlider, accSlider, thinkSlider]);

  function handleSavePreset() {
    const name = presetName.trim() || `Preset ${presets.length + 1}`;
    const p = {
      id: Date.now().toString(),
      name,
      lobbyType,
      h2hOpponent: lobbyType === 'head-to-head' ? h2hOpponent : undefined,
      botNames: { ...botNames },
      // lobby-of-8 config
      roomLevel,
      botOverrides: { ...botOverrides },
      // 1v1 config
      selectedBotIdx,
      buzzSlider,
      accSlider,
      thinkSlider,
    };
    const next = [p, ...presets].slice(0, 12);
    setPresets(next);
    saveBotPresets(next);
    setPresetName('');
    setSavingPreset(false);
  }

  function handleLoadPreset(p) {
    setLobbyType(p.lobbyType === '1v1' ? 'head-to-head' : (p.lobbyType || 'lobby'));
    if (p.h2hOpponent) setH2hOpponent(p.h2hOpponent);
    else if (p.lobbyType === '1v1') setH2hOpponent('ai');
    if (p.botNames) setBotNames(p.botNames);
    if (p.roomLevel) setRoomLevel(p.roomLevel);
    if (p.botOverrides) setBotOverrides(p.botOverrides);
    if (p.selectedBotIdx != null) setSelectedBotIdx(p.selectedBotIdx);
    if (p.buzzSlider  != null) setBuzzSlider(p.buzzSlider);
    if (p.accSlider   != null) setAccSlider(p.accSlider);
    if (p.thinkSlider != null) setThinkSlider(p.thinkSlider);
  }

  function handleDeletePreset(id) {
    const next = presets.filter(p => p.id !== id);
    setPresets(next);
    saveBotPresets(next);
  }

  async function startSession() {
    setError(null);
    setScreen('loading');
    try {
      let qs;
      if (source === 'qbreader') {
        const data = await fetchQBReaderTossups({ count: 15, category, difficulty: diffMap[difficulty] });
        const raw = data?.tossups || [];
        if (!raw.length) throw new Error('No questions found. Try a different category or switch to AI.');
        qs = raw.map(t => ({ ...t, question: t.text || t.question }));
      } else {
        const nicheHint = topic
          ? `Focus specifically on: "${topic}". Use niche, specific clues.`
          : category.includes('History')
            ? `Focus on very specific, niche sub-topics and events within ${category} - obscure battles, treaties, minor figures, turning points.`
            : `Focus on specific niche sub-topics within ${category}.`;
        const combinedInstr = [nicheHint, lobbyCustomInstr].filter(Boolean).join('\n');
        const result = await apiFetch('/api/chat', {
          method: 'POST',
          body: JSON.stringify({
            system: SYSTEM_PROMPT,
            messages: [{ role: 'user', content: generatePrompt(category, diffMap[difficulty], 15, combinedInstr) }],
            max_tokens: 8192,
          }),
        });
        const text = result.content?.[0]?.text || '';
        let parsed;
        try { parsed = JSON.parse(text); } catch { const m = text.match(/\{[\s\S]*\}/); if (m) parsed = JSON.parse(m[0]); }
        if (!parsed?.questions?.length) throw new Error('Generation failed. Try again.');
        qs = parsed.questions.map(q => ({ ...q, question: q.text || q.question }));
      }

      if (lobbyType === 'lobby') {
        setSessionBots(effectiveLobbyBots);
        setMatchMode(false);
        setLobbyMode(true);
      } else {
        setSessionBots([effective1v1Bot]);
        setMatchMode(true);
        setLobbyMode(false);
      }
      setQuestions(qs);
      setScreen('session');
    } catch (e) {
      setError(e.message || 'Failed to load questions.');
      setScreen('setup');
    }
  }

  if (screen === 'loading') {
    const isFetch = source === 'qbreader';
    return (
      <div className="h-full flex flex-col">
        <div className="px-5 pt-4 pb-2 flex-shrink-0">
          <button onClick={onExit} className="text-[11px] text-white/40 hover:text-white/70 inline-flex items-center gap-1">
            <ChevronRight size={12} className="rotate-180" /> Hub
          </button>
        </div>
        <div className="flex-1 flex flex-col items-center justify-center px-5">
          <div className="w-full max-w-sm">
            <ProgressBar
              active
              duration={isFetch ? 4000 : 14000}
              label={isFetch ? `Fetching ${category} tossups` : `Generating ${category} questions`}
              hint={isFetch ? 'Pulling from QBReader…' : 'The AI is writing fresh tossups for this set.'}
            />
          </div>
        </div>
      </div>
    );
  }

  if (screen === 'session') {
    return (
      <div className="h-full flex flex-col min-h-0">
        <TrialSession
          questions={questions}
          difficulty={difficulty}
          bots={sessionBots}
          matchMode={matchMode}
          lobbyMode={lobbyMode}
          botNames={botNames}
          scoringFormat={scoringFormat}
          onComplete={onExit}
        />
      </div>
    );
  }

  if (screen === 'real') {
    return (
      <div className="h-full flex flex-col min-h-0">
        <QuizBowlMatch user={user} onExit={() => setScreen('setup')} />
      </div>
    );
  }

  return (
    <div className="h-full overflow-y-auto bg-transparent">
      <div className="p-5 pb-8 space-y-4">
        <button onClick={onExit} className="text-[11px] text-white/40 hover:text-white/70 inline-flex items-center gap-1">
          <ChevronRight size={12} className="rotate-180" /> Hub
        </button>

        {/* ── Mode ── */}
        <div className="grid grid-cols-2 gap-2">
          <button onClick={() => setLobbyType('lobby')}
            className={`rounded-2xl border p-3 text-left transition-all ${lobbyType === 'lobby' ? 'border-blue-500/40 bg-blue-500/15 ring-1 ring-white/10' : 'border-white/[0.08] bg-white/[0.03] hover:bg-white/[0.06]'}`}>
            <Users size={15} className={`mb-1.5 ${lobbyType === 'lobby' ? 'text-blue-400' : 'text-white/30'}`} />
            <div className={`font-semibold text-[12px] ${lobbyType === 'lobby' ? 'text-blue-300' : 'text-white/60'}`}>vs AI Lobby</div>
            <div className="text-[10px] text-white/35 mt-0.5">8 bots · tournament</div>
          </button>
          <button onClick={() => setLobbyType('head-to-head')}
            className={`rounded-2xl border p-3 text-left transition-all ${lobbyType === 'head-to-head' ? 'border-blue-500/40 bg-blue-500/15 ring-1 ring-white/10' : 'border-white/[0.08] bg-white/[0.03] hover:bg-white/[0.06]'}`}>
            <Swords size={15} className={`mb-1.5 ${lobbyType === 'head-to-head' ? 'text-blue-400' : 'text-white/30'}`} />
            <div className={`font-semibold text-[12px] ${lobbyType === 'head-to-head' ? 'text-blue-300' : 'text-white/60'}`}>Head to Head</div>
            <div className="text-[10px] text-white/35 mt-0.5">1v1 · AI or real player</div>
          </button>
        </div>

        {/* ── Head to Head: sub-toggle for AI Bot vs Real Player ── */}
        {lobbyType === 'head-to-head' && (
          <div className="rounded-2xl border border-blue-500/20 bg-blue-500/[0.04] p-4 space-y-3">
            <div className="grid grid-cols-2 gap-1.5">
              <button onClick={() => setH2hOpponent('ai')}
                className={`py-2 rounded-xl text-[11px] font-semibold border transition-all ${
                  h2hOpponent === 'ai'
                    ? 'bg-blue-500/20 text-blue-200 border-blue-400/50'
                    : 'bg-white/[0.03] text-white/50 border-white/[0.08] hover:text-white/70 hover:border-white/[0.15]'
                }`}>
                vs AI Bot
              </button>
              <button onClick={() => setH2hOpponent('real')}
                className={`py-2 rounded-xl text-[11px] font-semibold border transition-all ${
                  h2hOpponent === 'real'
                    ? 'bg-blue-500/20 text-blue-200 border-blue-400/50'
                    : 'bg-white/[0.03] text-white/50 border-white/[0.08] hover:text-white/70 hover:border-white/[0.15]'
                }`}>
                vs Real Player
              </button>
            </div>

            {h2hOpponent === 'real' && (
              <div className="text-center space-y-2 pt-1">
                <p className="text-[12px] text-white/60">
                  Create a room and share the code. Up to 8 real players can join and compete head-to-head.
                </p>
                <button
                  onClick={() => setScreen('real')}
                  className="w-full py-3 rounded-2xl bg-blue-500 hover:bg-blue-400 text-white text-[13px] font-bold inline-flex items-center justify-center gap-2 transition-all border border-blue-400/40">
                  <Users size={14} /> Enter Lobby
                </button>
              </div>
            )}
          </div>
        )}

        {/* ── Lobby: room level + player preview ── */}
        {lobbyType === 'lobby' && (
          <div className="rounded-2xl border border-white/[0.08] bg-white/[0.02] p-4 space-y-3">
            <div className="flex items-center justify-between">
              <span className="text-[10px] font-bold uppercase tracking-[0.16em] text-white/40">Competition level</span>
            </div>
            <div className="grid grid-cols-4 gap-1.5">
              {ROOM_LEVELS.map(l => (
                <button key={l.id} onClick={() => setRoomLevel(l.id)}
                  className={`py-1.5 rounded-xl text-[11px] font-semibold transition-all border ${
                    roomLevel === l.id
                      ? 'bg-blue-500/20 text-blue-200 border-blue-400/50'
                      : 'bg-white/[0.04] text-white/50 border-transparent hover:bg-white/[0.08] hover:text-white/70'
                  }`}>
                  {l.label}
                </button>
              ))}
            </div>
            {/* Player roster - draggable per-bot sliders */}
            <div className="space-y-2.5 pt-1">
              {effectiveLobbyBots.map((bot) => {
                const buzzSl = buzzAtToSlider(bot.buzzAt);
                const accSl  = Math.round(bot.accuracy * 100);
                return (
                  <div key={bot.id} className="space-y-1">
                    <div className="flex items-center justify-between gap-2">
                      <div className="flex items-center gap-2 min-w-0 flex-1">
                        <input
                          type="text"
                          value={botNames[bot.id] ?? ''}
                          onChange={e => setBotNames(prev => ({ ...prev, [bot.id]: e.target.value }))}
                          maxLength={20}
                          className="bg-transparent text-[11px] font-medium text-white/80 outline-none border-b border-transparent hover:border-white/15 focus:border-white/30 transition-colors min-w-0 max-w-[7rem] px-0 py-0"
                        />
                        <span className="text-[9px] uppercase tracking-wider text-white/30">{bot.label}</span>
                      </div>
                      <span className="text-[8px] text-white/20">{'★'.repeat(bot.stars)}</span>
                    </div>
                    <div className="grid grid-cols-2 gap-3">
                      <div>
                        <div className="flex items-center justify-between mb-0.5">
                          <span className="text-[9px] text-sky-400/60">Speed</span>
                          <span className="text-[9px] text-white/30 tabular-nums">{Math.round((1 - bot.buzzAt) * 100)}%</span>
                        </div>
                        <input type="range" min="5" max="95" step="1" value={buzzSl}
                          onChange={e => setBotOverrides(prev => ({
                            ...prev,
                            [bot.id]: { ...prev[bot.id], buzzSlider: Number(e.target.value) },
                          }))}
                          className="w-full accent-sky-400" style={{ height: '4px' }} />
                      </div>
                      <div>
                        <div className="flex items-center justify-between mb-0.5">
                          <span className="text-[9px] text-amber-400/60">Accuracy</span>
                          <span className="text-[9px] text-white/30 tabular-nums">{accSl}%</span>
                        </div>
                        <input type="range" min="10" max="99" step="1" value={accSl}
                          onChange={e => setBotOverrides(prev => ({
                            ...prev,
                            [bot.id]: { ...prev[bot.id], accSlider: Number(e.target.value) },
                          }))}
                          className="w-full accent-amber-400" style={{ height: '4px' }} />
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {/* ── Head to Head AI Bot: opponent picker + fine-tune ── */}
        {lobbyType === 'head-to-head' && h2hOpponent === 'ai' && (
          <div className="space-y-3">
            {/* Preset picker */}
            <div>
              <p className="text-[10px] text-white/35 uppercase tracking-widest mb-2 font-medium">Opponent</p>
              <div className="grid grid-cols-2 gap-1.5">
                {BOT_ROSTER.map((bot, i) => (
                  <button key={bot.id} onClick={() => setSelectedBotIdx(i)}
                    className={`rounded-xl border p-2.5 text-left transition-all ${selectedBotIdx === i ? 'border-blue-400/40 bg-blue-500/10 ring-1 ring-white/10' : 'border-white/[0.07] bg-white/[0.02] hover:border-white/[0.14]'}`}>
                    <div className="flex items-center justify-between">
                      <span className="text-[12px] font-semibold text-white/80">{bot.label}</span>
                      <span className="text-[9px] text-white/25">{'★'.repeat(bot.stars)}</span>
                    </div>
                    <div className="text-[10px] text-white/35 mt-0.5 tabular-nums">
                      {Math.round((1 - bot.buzzAt) * 100)}% speed · {Math.round(bot.accuracy * 100)}% acc
                    </div>
                  </button>
                ))}
              </div>
            </div>

            {/* Fine-tune sliders */}
            <div className="rounded-2xl border border-white/[0.08] bg-white/[0.02] p-4 space-y-3.5">
              <span className="text-[10px] font-bold uppercase tracking-[0.16em] text-white/40">Fine-tune</span>

              {/* Buzz timing */}
              <div>
                <div className="flex items-center justify-between mb-1.5">
                  <span className="text-[11px] text-white/55">Buzz timing</span>
                  <div className="flex items-center gap-2">
                    <span className="text-[10px] text-white/30">{buzzSlider < 40 ? 'Early' : buzzSlider > 65 ? 'Late' : 'Mid'}</span>
                    <span className="text-[11px] font-mono text-white/55 tabular-nums">{Math.round(sliderToBuzzAt(buzzSlider) * 100)}%</span>
                  </div>
                </div>
                <input type="range" min="5" max="95" step="1" value={buzzSlider}
                  onChange={e => setBuzzSlider(Number(e.target.value))}
                  className="w-full accent-blue-400 h-1 rounded-full" />
                <div className="flex justify-between text-[9px] text-white/20 mt-1">
                  <span>Buzzes early</span><span>Buzzes late</span>
                </div>
              </div>

              {/* Accuracy */}
              <div>
                <div className="flex items-center justify-between mb-1.5">
                  <span className="text-[11px] text-white/55">Accuracy</span>
                  <span className="text-[11px] font-mono text-white/55 tabular-nums">{accSlider}%</span>
                </div>
                <input type="range" min="10" max="99" step="1" value={accSlider}
                  onChange={e => setAccSlider(Number(e.target.value))}
                  className="w-full accent-blue-400 h-1 rounded-full" />
                <div className="flex justify-between text-[9px] text-white/20 mt-1">
                  <span>Low</span><span>High</span>
                </div>
              </div>

              {/* Think speed */}
              <div>
                <div className="flex items-center justify-between mb-1.5">
                  <span className="text-[11px] text-white/55">Think speed</span>
                  <span className="text-[11px] font-mono text-white/55 tabular-nums">{(sliderToThink(thinkSlider) / 1000).toFixed(1)}s</span>
                </div>
                <input type="range" min="0" max="100" step="1" value={thinkSlider}
                  onChange={e => setThinkSlider(Number(e.target.value))}
                  className="w-full accent-blue-400 h-1 rounded-full" />
                <div className="flex justify-between text-[9px] text-white/20 mt-1">
                  <span>Instant</span><span>Slow</span>
                </div>
              </div>

              {/* Reset to preset */}
              <button
                onClick={() => {
                  setBuzzSlider(buzzAtToSlider(selectedPreset.buzzAt));
                  setAccSlider(Math.round(selectedPreset.accuracy * 100));
                  setThinkSlider(thinkToSlider(selectedPreset.thinkMs));
                }}
                className="text-[10px] text-white/30 hover:text-white/55 transition-colors">
                Reset to preset defaults
              </button>
            </div>
          </div>
        )}

        {/* ── Source / Category / Difficulty / Scoring / Topic (AI modes only) ── */}
        {!(lobbyType === 'head-to-head' && h2hOpponent === 'real') && <>
          <div className="grid grid-cols-2 gap-2">
            <GlassTile active={source === 'qbreader'} icon={<BookOpen size={14} />} label="Past QB" sub="qbreader.org" onClick={() => setSource('qbreader')} />
            <GlassTile active={source === 'ai'} icon={<Sparkles size={14} />} label="AI" sub="Gemini · niche topics" onClick={() => setSource('ai')} />
          </div>

          <div className="flex flex-wrap gap-1.5">
            {QB_LOBBY_CATEGORIES.map(c => <GlassPill key={c} active={category === c} onClick={() => setCategory(c)}>{c}</GlassPill>)}
          </div>

          <div>
            <p className="text-[10px] text-white/35 uppercase tracking-widest mb-2 font-medium">Question difficulty</p>
            <div className="grid grid-cols-3 gap-1.5">
              {[['easy', 'Easy'], ['medium', 'Medium'], ['hard', 'Hard']].map(([id, label]) => (
                <GlassPill key={id} active={difficulty === id} onClick={() => setDifficulty(id)}>{label}</GlassPill>
              ))}
            </div>
          </div>

          <div>
            <p className="text-[10px] text-white/35 uppercase tracking-widest mb-2 font-medium">Scoring format</p>
            <div className="grid grid-cols-2 gap-1.5">
              {AI_LOBBY_SCORING_FORMATS.map(f => {
                const sel = scoringFormat.id === f.id;
                return (
                  <button key={f.id} onClick={() => setScoringFormat(f)}
                    className={`rounded-xl border p-2.5 text-left transition-all focus:outline-none ${
                      sel
                        ? 'bg-amber-500/12 border-amber-500/40 ring-1 ring-amber-500/25'
                        : 'bg-white/[0.02] border-white/[0.06] hover:border-white/[0.14]'
                    }`}>
                    <div className={`text-[12px] font-semibold ${sel ? 'text-amber-200' : 'text-white/80'}`}>{f.label}</div>
                    <div className="text-[10px] text-white/35 mt-0.5">{f.desc}</div>
                  </button>
                );
              })}
            </div>
          </div>

          <div>
            <p className="text-[10px] text-white/35 uppercase tracking-widest mb-1.5 font-medium">
              Topic <span className="normal-case tracking-normal text-white/20 font-normal">(optional)</span>
            </p>
            <input type="text" value={topic} onChange={e => setTopic(e.target.value)}
              placeholder="e.g. French Revolution, Thermodynamics, Shakespeare…"
              className="w-full px-3 py-2.5 rounded-xl border border-white/[0.08] bg-white/[0.03] text-[12px] text-white/80 placeholder-white/20 outline-none focus:border-white/[0.15] transition-colors"
            />
          </div>

          {source === 'ai' && (
            <div>
              <p className="text-[10px] text-white/35 uppercase tracking-widest mb-1.5 font-medium">
                Custom instructions <span className="normal-case tracking-normal text-white/20 font-normal">(optional)</span>
              </p>
              <textarea value={lobbyCustomInstr} onChange={e => setLobbyCustomInstr(e.target.value)}
                placeholder="e.g. Focus on 20th century events, avoid questions about leaders…"
                rows={2}
                className="w-full px-3 py-2.5 rounded-xl border border-white/[0.08] bg-white/[0.03] text-[12px] text-white/80 placeholder-white/20 resize-none outline-none focus:border-white/[0.15] transition-colors"
              />
            </div>
          )}
        </>}

        {error && <p className="text-[11px] text-rose-400 px-3 py-2 rounded-xl bg-rose-500/10 border border-rose-500/20 text-center">{error}</p>}

        {/* ── Presets panel (AI modes only) ── */}
        {!(lobbyType === 'head-to-head' && h2hOpponent === 'real') && (
          <div className="rounded-2xl border border-white/[0.07] bg-white/[0.02] p-3.5 space-y-2.5">
            <div className="flex items-center justify-between">
              <span className="text-[10px] font-bold uppercase tracking-[0.16em] text-white/35">Presets</span>
              {!savingPreset && (
                <button
                  onClick={() => setSavingPreset(true)}
                  className="text-[10px] text-white/40 hover:text-white/70 transition-colors px-2 py-0.5 rounded-md border border-white/[0.08] hover:border-white/[0.18]">
                  Save current
                </button>
              )}
            </div>

            {savingPreset && (
              <div className="flex gap-2">
                <input
                  autoFocus
                  value={presetName}
                  onChange={e => setPresetName(e.target.value)}
                  onKeyDown={e => { if (e.key === 'Enter') handleSavePreset(); if (e.key === 'Escape') setSavingPreset(false); }}
                  placeholder="Preset name…"
                  className="flex-1 px-2.5 py-1.5 rounded-lg border border-white/[0.10] bg-white/[0.05] text-[11px] text-white/80 placeholder-white/25 outline-none focus:border-white/[0.20] transition-colors"
                />
                <button onClick={handleSavePreset} className="px-3 py-1.5 rounded-lg bg-white/[0.08] hover:bg-white/[0.13] text-[11px] text-white/70 font-semibold transition-colors">Save</button>
                <button onClick={() => setSavingPreset(false)} className="px-2 py-1.5 rounded-lg text-white/35 hover:text-white/60 transition-colors"><X size={12} /></button>
              </div>
            )}

            {presets.length === 0 && !savingPreset && (
              <p className="text-[10px] text-white/25 text-center py-1">No saved presets yet</p>
            )}

            {presets.length > 0 && (
              <div className="space-y-1">
                {presets.map(p => (
                  <div key={p.id} className="flex items-center gap-2 px-2.5 py-1.5 rounded-lg bg-white/[0.03] border border-white/[0.05] hover:border-white/[0.10] transition-colors group">
                    <div className="flex-1 min-w-0">
                      <span className="text-[11px] font-medium text-white/75 truncate block">{p.name}</span>
                      <span className="text-[9px] text-white/30">{p.lobbyType === 'head-to-head' || p.lobbyType === '1v1' ? '1v1' : '8-player'} preset</span>
                    </div>
                    <button onClick={() => handleLoadPreset(p)} className="text-[10px] text-white/40 hover:text-white/75 px-2 py-0.5 rounded border border-white/[0.08] hover:border-white/[0.20] transition-colors">Load</button>
                    <button onClick={() => handleDeletePreset(p.id)} className="text-white/20 hover:text-rose-400/70 transition-colors opacity-0 group-hover:opacity-100"><X size={11} /></button>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {!(lobbyType === 'head-to-head' && h2hOpponent === 'real') && (
          <button onClick={startSession}
            className="w-full py-3.5 rounded-2xl text-white text-[14px] font-bold inline-flex items-center justify-center gap-2 transition-all border bg-blue-500 hover:bg-blue-400 border-blue-400/40">
            {lobbyType === 'lobby' ? <><Users size={15} /> Enter Lobby</> : <><Swords size={15} /> Start Match</>}
          </button>
        )}
      </div>
    </div>
  );
}

// ============================================================
// REPLAY VIEW - replays a saved set question by question,
// animating the word reveal up to the buzz point, then showing
// the result. Works for any set in history; questions without a
// stored text field show only the result card.
// ============================================================
function ReplayView({ set, onExit }) {
  const [qIdx, setQIdx] = useState(0);
  const [revealedUpTo, setRevealedUpTo] = useState(-1);
  const [showResult, setShowResult] = useState(false);
  const timerRef = useRef(null);
  const showResultTimerRef = useRef(null);

  // Refs so the effect closure always sees the current question's data
  // without needing to list derived values in the dependency array.
  const wordsRef = useRef([]);
  const stopAtRef = useRef(0);

  const totalQ = set?.perQuestion?.length || 0;
  const q = set?.perQuestion?.[qIdx] || null;
  const words = q?.text ? q.text.split(/\s+/).filter(Boolean) : [];
  // Stop reveal at buzz word; if timed out (buzzWord === -1) reveal everything.
  const stopAt = q ? (q.buzzWord >= 0 ? q.buzzWord : words.length - 1) : 0;

  wordsRef.current = words;
  stopAtRef.current = stopAt;

  useEffect(() => {
    clearInterval(timerRef.current);
    clearTimeout(showResultTimerRef.current);
    setRevealedUpTo(-1);
    setShowResult(false);

    const currentWords = wordsRef.current;
    const currentStopAt = stopAtRef.current;

    if (!currentWords.length) {
      setShowResult(true);
      return;
    }

    let current = -1;
    timerRef.current = setInterval(() => {
      current++;
      setRevealedUpTo(current);
      if (current >= currentStopAt) {
        clearInterval(timerRef.current);
        showResultTimerRef.current = setTimeout(() => setShowResult(true), 450);
      }
    }, 120);

    return () => {
      clearInterval(timerRef.current);
      clearTimeout(showResultTimerRef.current);
    };
  }, [qIdx]); // eslint-disable-line react-hooks/exhaustive-deps

  function skipToResult() {
    clearInterval(timerRef.current);
    clearTimeout(showResultTimerRef.current);
    setRevealedUpTo(stopAt);
    setShowResult(true);
  }

  function goNext() { if (qIdx < totalQ - 1) setQIdx(i => i + 1); }
  function goPrev() { if (qIdx > 0) setQIdx(i => i - 1); }

  const naqtTotal = set?.perQuestion?.reduce((n, q) => n + (q.points || 0), 0) ?? 0;
  const correctCount = set?.perQuestion?.filter(q => q.correct).length ?? 0;

  return (
    <div className="h-full flex flex-col bg-transparent overflow-hidden">
      {/* Header */}
      <div className="flex items-center gap-2 px-4 py-2.5 border-b border-white/[0.04] flex-shrink-0">
        <button onClick={onExit}
          className="text-white/45 hover:text-white/75 text-[11px] flex items-center gap-1 transition-colors">
          <ChevronRight size={12} className="rotate-180" /> Back
        </button>
        <div className="flex-1 text-center">
          <span className="text-[12px] font-bold text-white/70">{set?.category}</span>
          <span className="text-[11px] text-white/35"> · {set?.difficulty}</span>
        </div>
        <span className="text-[11px] text-white/35 tabular-nums">{qIdx + 1}/{totalQ}</span>
      </div>

      {/* Summary bar */}
      <div className="flex items-center justify-center gap-3 px-4 py-1.5 border-b border-white/[0.03] flex-shrink-0 bg-white/[0.01]">
        <span className="text-[10px] text-white/40 tabular-nums">{naqtTotal} pts total</span>
        <span className="text-white/20 text-[9px]">·</span>
        <span className="text-[10px] text-white/40 tabular-nums">{correctCount}/{totalQ} correct</span>
        <span className="text-white/20 text-[9px]">·</span>
        <span className="text-[10px] text-white/30">{set?.source === 'ai' ? 'AI' : 'QBReader'}</span>
      </div>

      {/* Body */}
      <div className="flex-1 overflow-y-auto p-4 space-y-3">
        {/* Question text with animated reveal */}
        {words.length > 0 ? (
          <div
            onClick={!showResult ? skipToResult : undefined}
            className={`rounded-2xl border border-white/[0.08] bg-white/[0.03] p-4 leading-relaxed ${!showResult ? 'cursor-pointer' : ''}`}
          >
            {words.map((w, i) => {
              const isRevealed = i <= revealedUpTo;
              const isBuzzWord = showResult && q?.buzzWord >= 0 && i === q.buzzWord;
              const isPowerMark = q?.powerWordIndex != null && i === q.powerWordIndex;
              return (
                <span
                  key={i}
                  className={[
                    'mr-1 text-[13px] transition-opacity duration-75',
                    isRevealed ? 'opacity-100' : 'opacity-0',
                    isBuzzWord
                      ? (q.correct
                          ? 'text-emerald-300 underline decoration-dotted underline-offset-2'
                          : 'text-rose-300 underline decoration-dotted underline-offset-2')
                      : isPowerMark
                        ? 'text-amber-300/80'
                        : 'text-white/80',
                  ].join(' ')}
                >
                  {w}
                </span>
              );
            })}
            {/* Inline buzz badge rendered after the last revealed word */}
            {showResult && q?.buzzWord >= 0 && (
              <span className={`inline-flex items-center gap-0.5 ml-0.5 text-[9px] font-bold px-1.5 py-0.5 rounded align-middle ${
                q.correct
                  ? 'bg-emerald-500/20 text-emerald-300 border border-emerald-400/30'
                  : 'bg-rose-500/20 text-rose-300 border border-rose-400/30'
              }`}>
                <Zap size={8} /> BUZZ
              </span>
            )}
            {!showResult && (
              <span className="ml-2 text-[10px] text-white/20 italic">tap to skip…</span>
            )}
          </div>
        ) : (
          <div className="rounded-2xl border border-white/[0.06] bg-white/[0.02] p-4 text-center text-[12px] text-white/30">
            No question text recorded — play a new set to enable replays.
          </div>
        )}

        {/* Result card */}
        {showResult && q && (
          <div className={`rounded-2xl border p-3.5 ${
            q.correct
              ? 'border-emerald-500/25 bg-emerald-500/8'
              : 'border-rose-500/25 bg-rose-500/8'
          }`}>
            <div className="flex items-center gap-2 mb-1">
              <span className={q.correct ? 'text-emerald-400' : 'text-rose-400'}>
                {q.correct ? <Check size={14} /> : <X size={14} />}
              </span>
              <span className="text-[13px] font-bold text-white/90">{q.correctAnswer}</span>
              {typeof q.points === 'number' && (
                <span className={`ml-auto text-[11px] font-bold px-2 py-0.5 rounded-md ${
                  q.points === 15 ? 'bg-amber-500/20 text-amber-300 border border-amber-400/30'
                  : q.points === 10 ? 'bg-emerald-500/15 text-emerald-300 border border-emerald-400/25'
                  : q.points === -5 ? 'bg-rose-500/20 text-rose-300 border border-rose-400/30'
                  : 'bg-white/[0.06] text-white/45 border border-white/[0.10]'
                }`}>
                  {q.points > 0 ? `+${q.points}` : q.points}
                </span>
              )}
            </div>
            {q.answer && !q.correct && (
              <p className="text-[11px] text-white/45 mb-1">You said: <span className="text-white/60">{q.answer}</span></p>
            )}
            <div className="flex items-center gap-3 mt-1.5">
              {q.buzzWord >= 0 && (
                <span className="text-[10px] text-white/30">
                  Word {q.buzzWord + 1}/{q.totalWords}
                  {q.powerWordIndex != null && (
                    <span className="ml-1 text-amber-400/60">
                      {q.buzzWord < q.powerWordIndex ? '· before power' : '· after power'}
                    </span>
                  )}
                </span>
              )}
              {q.buzzWord === -1 && (
                <span className="text-[10px] text-white/30">Timed out</span>
              )}
            </div>
          </div>
        )}
      </div>

      {/* Nav footer */}
      <div className="flex-shrink-0 border-t border-white/[0.04] p-3 grid grid-cols-3 gap-2 items-center">
        <button onClick={goPrev} disabled={qIdx === 0}
          className="py-2 rounded-xl border border-white/[0.08] bg-white/[0.03] text-[12px] font-semibold text-white/55 hover:text-white/80 hover:border-white/[0.14] disabled:opacity-25 transition-colors">
          ← Prev
        </button>
        <div className="text-center text-[10px] text-white/30 tabular-nums">
          Q{qIdx + 1} of {totalQ}
        </div>
        {qIdx < totalQ - 1 ? (
          <button onClick={goNext}
            className="py-2 rounded-xl border border-white/[0.08] bg-white/[0.03] text-[12px] font-semibold text-white/55 hover:text-white/80 hover:border-white/[0.14] transition-colors">
            Next →
          </button>
        ) : (
          <button onClick={onExit}
            className="py-2 rounded-xl border border-white/[0.08] bg-white/[0.03] text-[12px] font-semibold text-white/55 hover:text-white/80 hover:border-white/[0.14] transition-colors">
            Done
          </button>
        )}
      </div>
    </div>
  );
}
