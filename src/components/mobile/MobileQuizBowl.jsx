import { useState, useEffect, useRef } from 'react';
import { Zap, Check, X, ArrowRight } from 'lucide-react';
import { apiFetch } from '../../api/client';
import MobileMatch from './MobileMatch';
import { fetchQBReaderTossups, getQuizBowlCollectionSet, fetchQuizBowlPresetSet, saveQuizBowlSet } from '../../api/quizMatch';
import QbModelPicker from '../shared/QbModelPicker';
import { useQbModel } from '../../hooks/useQbModel';
import { studyModelLabel } from '../study/studyModels';
import { judgeQuizBowlQuestion } from '../../lib/qbAnswerChecker';
import { useAuth } from '../../context/AuthContext';
import { markLessonComplete } from '../../api/curriculum';
import { QuizBowlCollection } from '../desktop/apps/QuizBowlSetLibrary';
import QuizBowlGameSetup from '../quizbowl/QuizBowlGameSetup';

const CATEGORIES = ['Science', 'History', 'Literature', 'Geography', 'Math', 'Art', 'Music', 'Philosophy', 'Pop Culture', 'Mixed'];

const SYSTEM_PROMPT = `You are an elite ACF/NAQT packet editor writing rigorously pyramidal quiz bowl tossups.

RULES:
- Each question is one coherent paragraph, normally 7-10 sentences and 120-190 words.
- The opening 30-35% must contain extremely obscure but verifiable specialist clues. The middle should contain difficult connecting clues. Reserve famous works, common dates, definitions, epithets, and classroom facts for the final 25-30%.
- Silently audit the clue order before returning JSON. If an earlier clue is easier than a later clue, reorder or replace it. Never open with the answer's birthplace, most-famous work, signature discovery, or another stock giveaway.
- Every clue must precisely and factually identify the same answer. Never fabricate a clue merely to make it obscure.
- Never state the answer in the question text.
- Include exactly one "(*)" power mark 65-75% through, immediately before the accessible clues and giveaway.
- End with a natural "For 10 points, name..."-style request.
- Write exactly the number of questions requested
- Output ONLY valid JSON, no markdown

ANSWER GUIDE:
- "answer" is canonical.
- "accept" contains only literal fully acceptable equivalents; never output regex syntax or loose fragments.
- "prompt" contains incomplete answers that need clarification, shaped as {"answer":"literal partial","message":"brief directed prompt"}.
- Use empty arrays if there are no genuine aliases or prompts.

Format:
{"questions":[{"text":"Extremely obscure clues. Hard clues. (*) Accessible clues and giveaway.","answer":"Canonical answer","accept":[],"prompt":[]}]}`;

function generatePrompt(category, difficulty, count, customInstructions = '', source = null) {
  const guides = {
    Easy: 'Use well-known facts. Giveaway should be very obvious.',
    Medium: 'Mix of common and uncommon knowledge. Standard college level.',
    Hard: 'Use obscure clues early. Require deep subject expertise.',
    Tournament: 'NAQT/ACF Nationals level. Extremely obscure references.',
  };
  if (source?.text) {
    return `Generate ${count} aggressively pyramidal quiz bowl tossups sourced ENTIRELY from the notes below.
Difficulty: ${difficulty}
${guides[difficulty] || ''}

SOURCE NOTES on "${source.title}" — the only permitted fact base:
"""
${source.text}
"""

Every clue must restate a fact from these notes; do not use outside knowledge. Every answer must be named in the notes. Start with the most obscure supported details and reserve the clearest giveaway for the end.${customInstructions ? `\nAdditional instructions: ${customInstructions}` : ''}
Return JSON: {"questions":[{"text":"...","answer":"...","category":"...","accept":[],"prompt":[]}]}`;
  }
  return `Generate ${count} aggressively pyramidal quiz bowl tossups.\nCategory: ${category}\nDifficulty: ${difficulty}\n${guides[difficulty] || ''}${customInstructions ? `\nAdditional instructions: ${customInstructions}` : ''}\nThe first clues must be the most obscure clues in each tossup; familiar clues belong only in the final giveaway.\nReturn JSON: {"questions":[{"text":"...","answer":"...","category":"...","accept":[],"prompt":[]}]}`;
}

function readOnboardingSetup() {
  try {
    const setup = JSON.parse(sessionStorage.getItem('mobileQuizBowlInitialSetup') || 'null');
    return setup && typeof setup === 'object' ? setup : null;
  } catch {
    return null;
  }
}

function readNoteQuizBowlLaunch() {
  try {
    const launch = JSON.parse(sessionStorage.getItem('mobileQuizBowlNoteLaunch') || 'null');
    return launch?.title && launch?.text ? launch : null;
  } catch {
    return null;
  }
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
  const { user } = useAuth();
  const onboardingDefaults = user?.data?.preferences?.quizBowlOnboarding;
  const [onboardingSetup] = useState(readOnboardingSetup);
  const [noteLaunch] = useState(readNoteQuizBowlLaunch);
  // Keep this for the lifetime of the Quiz Bowl session so a retry from the
  // setup screen remains grounded in the same note after the one-shot handoff
  // has been consumed from session storage.
  const [noteSource] = useState(() => noteLaunch ? { title: noteLaunch.title, text: noteLaunch.text } : null);
  // Live-room surface (MobileMatch). null = solo flows below;
  // 'menu' = create/join a multiplayer room; 'bots' = jump straight
  // into a room setup with bot fill pre-enabled.
  const [matchScreen, setMatchScreen] = useState(null);
  const [matchSet, setMatchSet] = useState(null);
  const [matchConfig, setMatchConfig] = useState(null);
  const [matchJoinCode, setMatchJoinCode] = useState(null);
  const [setupPlayMode, setSetupPlayMode] = useState('multiplayer');
  const [setupMatchMode, setSetupMatchMode] = useState('individual');
  const [setupFillWithBots, setSetupFillWithBots] = useState(false);
  const [setupBotLevel, setSetupBotLevel] = useState('varsity');
  const [setupScoringFormat, setSetupScoringFormat] = useState('iac-prelim');
  const [setupJoinCode, setSetupJoinCode] = useState('');
  const [questions, setQuestions] = useState([]);
  const [currentQ, setCurrentQ] = useState(0);
  const [generating, setGenerating] = useState(false);
  const [error, setError] = useState(null);

  const initialSoloCategory = noteLaunch ? 'Mixed' : (onboardingSetup?.category || onboardingDefaults?.category || 'Mixed');
  const [category, setCategory] = useState(initialSoloCategory);
  const [selectedCategories, setSelectedCategories] = useState(() => [initialSoloCategory]);
  const [difficulty, setDifficulty] = useState(() => noteLaunch?.difficulty || onboardingSetup?.difficulty || onboardingDefaults?.difficulty || 'Medium');
  const [questionSource, setQuestionSource] = useState(() => noteLaunch || onboardingSetup?.source === 'ai' ? 'ai' : 'qbreader');
  const [customInstructions, setCustomInstructions] = useState(() => onboardingSetup?.customInstructions || onboardingDefaults?.customInstructions || '');
  const [questionCount, setQuestionCount] = useState(() => noteLaunch?.questionCount || onboardingSetup?.questionCount || onboardingDefaults?.questionCount || 5);
  const [revealSpeedMs, setRevealSpeedMs] = useState(140);
  // Which AI writes the AI-generated tossups (persisted, plan-gated).
  const { model: qbModel, pick: pickQbModel, available: qbModels } = useQbModel();

  function selectQuestionSource(nextSource) {
    setQuestionSource(nextSource);
    if (nextSource === 'ai' && selectedCategories.length > 1) {
      setCategory(selectedCategories[0]);
    }
  }

  function selectCategory(nextCategory) {
    if (questionSource !== 'qbreader') {
      setCategory(nextCategory);
      setSelectedCategories([nextCategory]);
      return;
    }
    setSelectedCategories(current => {
      if (nextCategory === 'Mixed') {
        setCategory('Mixed');
        return ['Mixed'];
      }
      const subjects = current.filter(value => value !== 'Mixed');
      const next = subjects.includes(nextCategory)
        ? subjects.filter(value => value !== nextCategory)
        : [...subjects, nextCategory];
      const normalized = next.length ? CATEGORIES.filter(value => next.includes(value)) : ['Mixed'];
      setCategory(normalized.length === 1 ? normalized[0] : 'Mixed');
      return normalized;
    });
  }

  const [buzzed, setBuzzed] = useState(false);
  const [answer, setAnswer] = useState('');
  const [showResult, setShowResult] = useState(false);
  const [correct, setCorrect] = useState(null);
  const [wrongAnswer, setWrongAnswer] = useState(null);
  const [answerPrompt, setAnswerPrompt] = useState('');
  const [scores, setScores] = useState([]);
  const [reading, setReading] = useState(true);
  const curriculumCompletionRef = useRef(false);
  const startedAtRef = useRef(null);
  const savedSetRef = useRef(null);
  const [activeTitle, setActiveTitle] = useState('');

  const q = questions[currentQ];
  const { revealed, done, stop, wordIndex, totalWords } = useWordReveal(q?.text || '', revealSpeedMs, reading && !buzzed && view === 'playing');

  // Consume the first-run handoff after its initial value has been used.
  useEffect(() => {
    if (onboardingSetup) sessionStorage.removeItem('mobileQuizBowlInitialSetup');
  }, [onboardingSetup]);

  async function handleStart(overrides = {}) {
    const nextDifficulty = overrides.difficulty || difficulty;
    const nextSource = overrides.source || questionSource;
    const nextCategory = overrides.category || (nextSource === 'qbreader' && selectedCategories.length > 1 ? 'Mixed' : category);
    const nextCategories = Array.isArray(overrides.categories) && overrides.categories.length
      ? overrides.categories
      : overrides.category
        ? [nextCategory]
        : nextSource === 'qbreader'
          ? selectedCategories
          : [nextCategory];
    const nextCount = overrides.questionCount || questionCount;
    const nextInstructions = overrides.customInstructions ?? customInstructions;
    const nextNotes = overrides.notes || noteSource;
    const nextTitle = overrides.title || nextNotes?.title || '';
    setCategory(nextSource === 'qbreader' && nextCategories.length > 1 ? 'Mixed' : nextCategory);
    setSelectedCategories(nextCategories);
    setDifficulty(nextDifficulty);
    setQuestionSource(nextSource);
    setQuestionCount(nextCount);
    setCustomInstructions(nextInstructions);
    setActiveTitle(nextTitle);
    setGenerating(true); setError(null);
    if (nextSource === 'qbreader') {
      try {
        const data = await fetchQBReaderTossups({ count: nextCount, category: nextCategory, categories: nextCategories, difficulty: nextDifficulty });
        const tossups = data?.tossups || [];
        if (!tossups.length) setError('No questions for that combo. Try another.');
        else {
          setQuestions(tossups); setCurrentQ(0); setScores([]); setBuzzed(false); setShowResult(false); setCorrect(null); setWrongAnswer(null); setReading(true);
          startedAtRef.current = Date.now(); savedSetRef.current = null; setView('playing');
        }
      } catch (e) { setError(e.message || 'Fetch failed'); }
      setGenerating(false);
      return;
    }
    try {
      const result = await apiFetch('/api/chat', {
        method: 'POST',
        body: JSON.stringify({
          system: SYSTEM_PROMPT,
          messages: [{ role: 'user', content: generatePrompt(nextCategory, nextDifficulty, nextCount, nextInstructions, nextNotes) }],
          max_tokens: 4096,
          model: qbModel,
        }),
      });
      const text = result.content?.[0]?.text || '';
      let parsed;
      try { parsed = JSON.parse(text); } catch { const m = text.match(/\{[\s\S]*\}/); if (m) parsed = JSON.parse(m[0]); }
      if (parsed?.questions?.length) {
        setQuestions(parsed.questions); setCurrentQ(0); setScores([]); setBuzzed(false); setShowResult(false); setCorrect(null); setWrongAnswer(null); setReading(true);
        startedAtRef.current = Date.now(); savedSetRef.current = null; setView('playing');
      } else setError('Generation failed. Try again.');
    } catch (e) { setError(e.message || 'Generation failed'); }
    setGenerating(false);
  }

  function startConfiguredGame() {
    if (setupPlayMode === 'solo') {
      handleStart();
      return;
    }
    const exactCategory = matchSet?.category || category;
    setMatchJoinCode(null);
    setMatchConfig({
      matchMode: setupMatchMode,
      questionSource: matchSet ? 'saved' : questionSource,
      category: exactCategory,
      categories: matchSet ? [exactCategory] : selectedCategories,
      difficulty: matchSet?.difficulty || difficulty,
      questionCount: matchSet?.questions?.length || questionCount,
      revealSpeedMs,
      scoringFormat: setupScoringFormat,
      fillWithBots: setupFillWithBots,
      botLevel: setupBotLevel,
      setInstructions: questionSource === 'ai' ? customInstructions : '',
    });
    setMatchScreen('configured');
  }

  function joinConfiguredGame() {
    const code = setupJoinCode.trim().toUpperCase();
    if (code.length < 4) return;
    setMatchConfig(null);
    setMatchJoinCode(code);
    setMatchScreen('join');
  }

  const autoGenerationStarted = useRef(false);
  useEffect(() => {
    if (!onboardingSetup?.autoStart || autoGenerationStarted.current) return;
    autoGenerationStarted.current = true;
    handleStart();
  }, [onboardingSetup]);

  useEffect(() => {
    if (!noteLaunch || autoGenerationStarted.current) return;
    autoGenerationStarted.current = true;
    try { sessionStorage.removeItem('mobileQuizBowlNoteLaunch'); } catch {}
    handleStart({
      source: 'ai',
      category: 'Mixed',
      difficulty: noteLaunch.difficulty || 'Medium',
      questionCount: noteLaunch.questionCount || 5,
      notes: noteLaunch,
      title: noteLaunch.title,
    });
  }, [noteLaunch]);

  async function playCollectionSet(listing) {
    if (listing.source === 'preset') {
      const data = await fetchQuizBowlPresetSet(listing.presetSlug);
      const set = data.set || {};
      const playable = (set.questions || []).filter(question => String(question.text || '').trim() && String(question.answer || '').trim());
      if (!playable.length) throw new Error('This preset set has no playable tossups.');
      const presetCategory = set.category || listing.category || 'Geography';
      setCategory(presetCategory);
      setSelectedCategories([presetCategory]);
      setDifficulty(set.difficulty || 'Easy');
      setQuestionSource('saved');
      setActiveTitle(set.title || listing.title || 'Preset set');
      setQuestions(playable); setCurrentQ(0); setScores([]); setBuzzed(false); setShowResult(false); setCorrect(null); setWrongAnswer(null); setReading(true);
      startedAtRef.current = Date.now(); savedSetRef.current = null; setView('playing');
      return;
    }
    const data = await getQuizBowlCollectionSet(listing.listingId);
    const set = data.set || {};
    const playable = (set.questions || []).filter(question => String(question.text || '').trim() && String(question.answer || '').trim());
    if (!playable.length) throw new Error('This collection set has no playable tossups.');
    const collectionCategory = set.category || 'Mixed';
    setCategory(collectionCategory);
    setSelectedCategories([collectionCategory]);
    setDifficulty(set.difficulty || 'Medium');
    setQuestionSource('saved');
    setActiveTitle(set.title || listing.title || 'Collection set');
    setQuestions(playable); setCurrentQ(0); setScores([]); setBuzzed(false); setShowResult(false); setCorrect(null); setWrongAnswer(null); setReading(true);
    startedAtRef.current = Date.now(); savedSetRef.current = null; setView('playing');
  }

  async function playCollectionSetMultiplayer(listing) {
    const data = listing.source === 'preset'
      ? await fetchQuizBowlPresetSet(listing.presetSlug)
      : await getQuizBowlCollectionSet(listing.listingId);
    const set = data.set || {};
    const playable = (set.questions || []).filter(question => String(question.text || '').trim() && String(question.answer || '').trim());
    if (!playable.length) throw new Error('This collection set has no playable tossups.');
    setMatchSet({ ...set, questions: playable, title: set.title || listing.title });
    setSetupPlayMode('multiplayer');
    setMatchConfig(null);
    setMatchJoinCode(null);
    setView('setup');
  }

  function handleBuzz() { if (buzzed || !reading) return; setAnswerPrompt(''); setBuzzed(true); setReading(false); stop(); }
  function handleSubmit() {
    if (!answer.trim()) return;
    const judgement = judgeQuizBowlQuestion(q, answer);
    if (judgement.directive === 'prompt') {
      setAnswerPrompt(judgement.directedPrompt || 'Be more specific.');
      return;
    }
    const isCorrect = judgement.directive === 'accept';
    setAnswerPrompt('');
    setCorrect(isCorrect); setShowResult(true);
    setWrongAnswer(isCorrect ? null : { question: currentQ, answer: answer.trim() });
    setScores((p) => [...p, { question: currentQ, correct: isCorrect, buzzWord: wordIndex, totalWords, answer: answer.trim(), correctAnswer: q.answer }]);
  }
  function handleTimeout() {
    setScores((p) => [...p, { question: currentQ, correct: false, buzzWord: -1, totalWords, answer: '', correctAnswer: q.answer }]);
    setShowResult(true); setCorrect(false); setWrongAnswer(null); setBuzzed(true);
  }
  useEffect(() => {
    if (done && !buzzed && view === 'playing') {
      const t = setTimeout(handleTimeout, 2000);
      return () => clearTimeout(t);
    }
  }, [done, buzzed, view]);

  function nextQuestion() {
    if (currentQ + 1 < questions.length) {
      setCurrentQ((p) => p + 1); setBuzzed(false); setShowResult(false); setCorrect(null); setWrongAnswer(null); setAnswer(''); setAnswerPrompt(''); setReading(true);
    } else if (questionSource === 'qbreader') {
      fetchQBReaderTossups({ count: questionCount, category, categories: selectedCategories, difficulty }).then((data) => {
        const more = data?.tossups || [];
        if (more.length) setQuestions((prev) => [...prev, ...more]);
      }).catch(() => {});
      setTimeout(() => {
        setCurrentQ((p) => p + 1); setBuzzed(false); setShowResult(false); setCorrect(null); setWrongAnswer(null); setAnswer(''); setAnswerPrompt(''); setReading(true);
      }, 50);
    } else {
      setView('review');
    }
  }
  function endRound() { setView('review'); }

  function exitSet() {
    stop();
    setQuestions([]);
    setScores([]);
    setCurrentQ(0);
    setBuzzed(false);
    setShowResult(false);
    setCorrect(null);
    setWrongAnswer(null);
    setAnswer('');
    setAnswerPrompt('');
    setReading(false);
    setActiveTitle('');
    startedAtRef.current = null;
    savedSetRef.current = null;
    setView('setup');
  }

  function correctWrongAnswer() {
    if (!wrongAnswer || wrongAnswer.question !== currentQ || !q) return;
    setScores((previous) => previous.map((score, index) => (
      index === previous.length - 1 && score.question === currentQ
        ? { ...score, correct: true, reviewAccepted: true }
        : score
    )));
    setCorrect(true);
    setWrongAnswer(null);
  }

  useEffect(() => {
    if (view !== 'review' || savedSetRef.current || !scores.length) return;
    const perQuestion = scores.map((score, index) => {
      const question = questions[index] || {};
      return {
        category: question.category || category || 'Mixed',
        correct: !!score.correct,
        buzzWord: score.buzzWord,
        totalWords: score.totalWords,
        points: score.correct ? 10 : 0,
        answer: score.answer,
        correctAnswer: score.correctAnswer,
        text: question.text || '',
      };
    });
    savedSetRef.current = 'pending';
    saveQuizBowlSet({
      category,
      difficulty,
      source: questionSource === 'ai' ? 'ai' : 'qbreader',
      title: activeTitle,
      customInstructions: questionSource === 'ai' ? customInstructions : '',
      score: scores.filter(score => score.correct).length,
      points: perQuestion.reduce((total, question) => total + question.points, 0),
      total: scores.length,
      durationMs: Math.max(0, Date.now() - (startedAtRef.current || Date.now())),
      perQuestion,
    }).then(result => {
      savedSetRef.current = result?.set?.id || 'saved';
    }).catch(() => {
      savedSetRef.current = null;
    });
  }, [view, scores, questions, category, difficulty, questionSource, customInstructions, activeTitle]);

  useEffect(() => {
    if (view !== 'review' || !onboardingSetup?.curriculumId || !onboardingSetup?.curriculumLessonId || curriculumCompletionRef.current) return;
    curriculumCompletionRef.current = true;
    markLessonComplete(onboardingSetup.curriculumId, onboardingSetup.curriculumLessonId)
      .then(() => window.dispatchEvent(new CustomEvent('covalent:curriculum-progress', { detail: { curriculumId: onboardingSetup.curriculumId } })))
      .catch(() => { curriculumCompletionRef.current = false; });
  }, [view, onboardingSetup]);

  // ===== MULTIPLAYER / VS BOTS (live rooms) =====
  if (matchScreen) {
    return (
      <MobileMatch
        key={matchScreen}
        initialSet={matchSet}
        initialConfig={matchConfig}
        initialJoinCode={matchJoinCode}
        autoCreate={matchScreen === 'configured'}
        onExit={() => {
          setMatchSet(null);
          setMatchConfig(null);
          setMatchJoinCode(null);
          setMatchScreen(null);
        }}
      />
    );
  }

  if (view === 'collection') {
    return <div className="flex-1 min-h-0 bg-transparent"><QuizBowlCollection mobile onBack={() => setView('setup')} onPlay={playCollectionSet} onPlayMultiplayer={playCollectionSetMultiplayer} /></div>;
  }

  // ===== REVIEW =====
  if (view === 'review') {
    const totalCorrect = scores.filter((s) => s.correct).length;
    return (
      <div className="flex-1 min-h-0 overflow-y-auto px-4 pt-6 pb-8 bg-transparent">
        <div className="text-center mb-6">
          <div className="text-[48px] font-bold text-white tabular-nums leading-none">
            {totalCorrect}<span className="text-white/25">/{scores.length}</span>
          </div>
          <p className="text-[11px] text-white/30 mt-2 uppercase tracking-wider">{activeTitle || category} · {difficulty}</p>
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
            className="py-3.5 rounded-2xl border border-blue-400/30 bg-blue-500/15 text-[13px] font-bold text-blue-100 active:bg-blue-500/25">
            New round
          </button>
          <button onClick={() => {
            setCurrentQ(0); setBuzzed(false); setShowResult(false); setCorrect(null); setWrongAnswer(null); setReading(true); setScores([]); setAnswer('');
            startedAtRef.current = Date.now(); savedSetRef.current = null; setView('playing');
          }}
            className="py-3.5 rounded-2xl bg-blue-500 text-white text-[13px] font-bold active:bg-blue-600">
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
      <div className="flex-1 min-h-0 flex flex-col bg-transparent">
        <div className="flex items-center gap-2 px-4 py-2.5 border-b border-white/[0.06] flex-shrink-0">
          <Zap size={14} className="text-yellow-400" />
          <span className="text-[13px] font-bold text-white tabular-nums">
            Q{currentQ + 1}{isInfinite ? '' : `/${questions.length}`}
          </span>
          {activeTitle && <span className="truncate text-[9px] font-bold uppercase tracking-wider text-amber-200/70">{activeTitle}</span>}
          {isInfinite && <span className="text-[9px] font-bold uppercase tracking-wider px-1.5 py-0.5 rounded-full bg-blue-500/15 text-blue-300">∞</span>}
          <div className="flex-1" />
          <span className={`text-[12px] font-bold tabular-nums ${scores.filter((s) => s.correct).length > 0 ? 'text-emerald-400' : 'text-white/25'}`}>
            {scores.filter((s) => s.correct).length}
          </span>
          {isInfinite && (
            <button onClick={endRound}
              className="text-[10px] font-semibold px-2 py-0.5 rounded-full border border-blue-400/30 text-blue-200/80 active:bg-blue-500/15">
              End
            </button>
          )}
          <button onClick={exitSet}
            className="shrink-0 rounded-full border border-white/[0.12] px-2 py-1 text-[10px] font-semibold text-white/55 active:border-rose-400/35 active:bg-rose-500/10 active:text-rose-200">
            Exit set
          </button>
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
              className="w-full py-4 rounded-2xl bg-red-600 active:bg-red-700 active:scale-[0.98] text-white text-[17px] font-bold uppercase tracking-[0.18em] transition-all">
              BUZZ
            </button>
          )}
          {buzzed && !showResult && (
            <div className="space-y-2">
              {answerPrompt && <p className="text-[11px] font-semibold text-amber-300">Prompt: {answerPrompt}</p>}
              <div className="flex gap-2">
                <input value={answer} onChange={(e) => { setAnswer(e.target.value); setAnswerPrompt(''); }} placeholder="Answer…" autoFocus
                  className="flex-1 px-4 py-3 rounded-2xl border border-white/[0.08] bg-white/[0.05] text-[14px] text-white placeholder-white/25 outline-none focus:border-white/[0.15] transition-colors" />
                <button onClick={handleSubmit} disabled={!answer.trim()}
                  className="px-5 py-3 rounded-2xl bg-blue-500 hover:bg-blue-400 active:bg-blue-600 text-white disabled:opacity-40">
                  <ArrowRight size={16} />
                </button>
              </div>
            </div>
          )}
          {showResult && (
            <>
              <div className={`p-4 rounded-2xl text-left border ${correct ? 'bg-emerald-500/10 border-emerald-500/40' : 'bg-rose-500/10 border-rose-500/40'}`}>
                <p className={`text-[12px] font-bold uppercase tracking-[0.14em] ${correct ? 'text-emerald-400' : 'text-rose-400'} ${correct ? 'mb-2' : 'mb-3'}`}>
                  {correct ? '✓ Correct' : '✗ Incorrect'}
                </p>
                {correct && <p className="text-[15px] font-semibold text-white">{q.answer}</p>}
              </div>
              {!correct && wrongAnswer?.question === currentQ && (
                <button onClick={correctWrongAnswer}
                  className="w-full py-2.5 rounded-2xl border border-amber-400/25 bg-amber-400/[0.08] text-[12px] font-semibold text-amber-100 active:bg-amber-400/[0.14]">
                  I was right
                </button>
              )}
              <button onClick={nextQuestion}
                className="w-full py-3.5 rounded-2xl bg-blue-500 hover:bg-blue-400 active:bg-blue-600 text-white text-[14px] font-bold">
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
    <div className="flex-1 min-h-0 overflow-y-auto bg-transparent">
      <QuizBowlGameSetup
        mobile
        playMode={setupPlayMode}
        onPlayModeChange={mode => { setSetupPlayMode(mode); if (mode === 'solo') setMatchSet(null); }}
        matchMode={setupMatchMode}
        onMatchModeChange={setSetupMatchMode}
        questionSource={matchSet ? 'saved' : questionSource}
        onQuestionSourceChange={selectQuestionSource}
        categories={matchSet ? [matchSet.category || 'Mixed'] : selectedCategories}
        onToggleCategory={selectCategory}
        difficulty={matchSet?.difficulty || difficulty}
        onDifficultyChange={setDifficulty}
        questionCount={matchSet?.questions?.length || questionCount}
        onQuestionCountChange={setQuestionCount}
        revealSpeedMs={revealSpeedMs}
        onRevealSpeedChange={setRevealSpeedMs}
        customInstructions={customInstructions}
        onCustomInstructionsChange={setCustomInstructions}
        aiModelLabel={studyModelLabel(qbModel)}
        aiModelControl={<QbModelPicker value={qbModel} onPick={pickQbModel} models={qbModels} />}
        fillWithBots={setupFillWithBots}
        onFillWithBotsChange={setSetupFillWithBots}
        botLevel={setupBotLevel}
        onBotLevelChange={setSetupBotLevel}
        scoringFormat={setupScoringFormat}
        onScoringFormatChange={setSetupScoringFormat}
        joinCode={setupJoinCode}
        onJoinCodeChange={setSetupJoinCode}
        onJoin={joinConfiguredGame}
        onBrowseCollection={() => setView('collection')}
        initialSet={matchSet}
        busy={generating}
        error={error}
        onSubmit={startConfiguredGame}
      />
    </div>
  );
}
