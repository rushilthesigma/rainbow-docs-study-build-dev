import { useState, useEffect, useRef, useMemo } from 'react';
import { Zap, Play, Pause, Check, X, Loader2, Lightbulb, Users, BookOpen, Sparkles, Settings, ArrowRight, Target, TrendingDown, TrendingUp, Clock, History, Flame, ChevronRight, ChevronDown, ArrowLeft, Trophy, Swords, RefreshCw, Eye, EyeOff, Volume2, VolumeX, Mic, Search, Pencil, Trash2, Layers, RotateCcw, ListChecks, Save } from 'lucide-react';
import TrialSession, { AnswerResultPanel } from '../../trial/TrialSession';
import { apiFetch } from '../../../api/client';
import { fetchQBReaderTossups, saveQuizBowlSet, fetchQuizBowlHistory, fetchQuizBowlRecommendations, fetchQuizBowlPatterns, fetchQuizBowlSm2Due, fetchQuizBowlMatches, saveAiMatchReplay, fetchSavedQuizBowlSets, getSavedQuizBowlSet, getQuizBowlCollectionSet, fetchQuizBowlPresetSet, createSavedQuizBowlSet, importSavedQuizBowlPacket, deleteSavedQuizBowlSet, renamePlayedQuizBowlSet, deletePlayedQuizBowlSet } from '../../../api/quizMatch';
import { intervalLabel } from '../../../utils/sm2';
import { peek, fetchOnce, bustPrefix } from '../../../api/cache';
import ViewFade from '../../shared/ViewFade';
import { useWindowManager } from '../../../context/WindowManagerContext';
import { setPendingLesson } from '../../../utils/pendingLesson';
import useBrowserBack from '../../../hooks/useBrowserBack';
import { useAuth } from '../../../context/AuthContext';
import QuizBowlMatch, { PlayerCard } from './QuizBowlMatch';
import ClueLabView from './ClueLabView';
import { useQbVoicePref, QbVoiceToggle, speakLine, spokenAnswer } from '../../shared/qbVoice';
import ProgressBar, { InlineProgress } from '../../shared/ProgressBar';
import QbModelPicker from '../../shared/QbModelPicker';
import { useQbModel } from '../../../hooks/useQbModel';
import { studyModelLabel } from '../../study/studyModels';
import { useSpeechRecognition, speechRecognitionSupported } from '../../../hooks/useSpeechRecognition';
import { speechSynthesisSupported } from '../../../hooks/useSpeechSynthesis';
import { CountryPracticeBrowser, QuizBowlCollection, SavedSetCreator, SavedSetEditor, SavedSetLibrary } from './QuizBowlSetLibrary';
import { judgeQuizBowlQuestion } from '../../../lib/qbAnswerChecker';
import { markLessonComplete } from '../../../api/curriculum';
import QuizBowlGameSetup from '../../quizbowl/QuizBowlGameSetup';

// Explicitly open (then immediately release) an audio stream before starting
// recognition. This is the same permission flow as Study Mode dictation.
async function requestMicPermission() {
  try {
    const stream = await navigator.mediaDevices?.getUserMedia({ audio: true });
    stream?.getTracks().forEach(t => t.stop());
    return true;
  } catch {
    return false;
  }
}

const DIFFICULTIES = ['Easy', 'Medium', 'Hard', 'Tournament'];
const CATEGORIES = ['Science', 'History', 'Literature', 'Geography', 'Math', 'Art', 'Music', 'Philosophy', 'Pop Culture', 'Mixed'];
const QUICK_START_CATEGORIES = ['Mixed', 'History', 'Science', 'Literature', 'Geography', 'Art'];
const MIC_ERROR_MESSAGES = {
  'not-allowed': 'Microphone access is blocked. Allow it in your browser settings, then retry.',
  'service-not-allowed': 'Speech recognition is blocked in this browser.',
  'audio-capture': 'No working microphone was found.',
  'network': 'You appear to be offline. Speech recognition needs an internet connection.',
  'language-not-supported': 'Dictation language is not supported by your browser.',
};
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

const SYSTEM_PROMPT = `You are an elite ACF/NAQT packet editor writing rigorously pyramidal quiz bowl tossups.

RULES:
- Each tossup is one coherent paragraph, normally 7-10 sentences and 120-190 words.
- Enforce a steep clue ladder. The first 30-35% must use extremely obscure but verifiable specialist clues: minor works, technical terminology, lesser-known episodes, named scholarly arguments, secondary characters, or distinctive details. These clues should reward a true subject expert, not merely a strong generalist.
- The middle 30-35% may use difficult connecting clues. Only the final 25-30% may use canonical classroom facts, famous works, common epithets, dates, locations, or the obvious giveaway.
- Silently audit clue order before returning JSON: if an earlier clue is more widely known than a later clue, reorder or replace it. Never open with a definition, birthplace, most-famous work, signature discovery, famous quotation, or other stock giveaway.
- Every clue must independently and factually point to the same answer. Prefer precise, uniquely identifying clues over vague pronouns or generic descriptions. Do not invent obscurity by fabricating facts.
- NEVER state the answer inside the question text - clues describe it without naming it, and the question does not end with "What is X?"
- Include exactly one NAQT-style power mark "(*)" 65-75% through the question, immediately before the accessible clues and giveaway. Buzzing before (*) earns +15, after earns +10.
- End with a natural "For 10 points, name..."-style request, without inserting the answer.
- Write exactly the number of questions requested
- Output ONLY valid JSON, no markdown

ANSWER GUIDE:
- "answer" is the canonical answer.
- "accept" is a JSON array of literal, fully acceptable equivalents such as a surname, alternate title, transliteration, abbreviation, or former name. Do not include loose fragments and do not write regex syntax.
- "prompt" is a JSON array of objects for incomplete answers that require clarification. Each object is {"answer":"literal partial answer","message":"brief directed prompt"}. A prompted response is not yet correct.
- Use empty arrays when no aliases or prompts are genuinely needed.

Format:
{"questions":[{"text":"Extremely obscure specialist clues. Hard connecting clues. (*) Accessible clues. For 10 points, name this answer.","answer":"Canonical answer","accept":["Valid alternate answer"],"prompt":[{"answer":"Ambiguous partial","message":"Be more specific."}]}]}`;

// `source` ({ title, text }) is the QBpedia handoff: when present the notes
// are the ONLY permitted fact base — the prompt flips from "write about a
// category" to "write from this text", because framing the article as a mere
// instruction let the model fall back on its own knowledge of the topic.
// Tokenize a generation context (custom instructions + note title) for
// similarity matching against past sets. Drops filler words so
// "Focus on: the Krebs Cycle" and "krebs cycle questions" line up.
const CTX_STOPWORDS = new Set(['focus', 'on', 'the', 'a', 'an', 'of', 'in', 'about', 'questions', 'question', 'tossups', 'tossup', 'and', 'or', 'for', 'to', 'with', 'please', 'make', 'give', 'me', 'some', 'only', 'exclusively']);
function ctxTokens(...parts) {
  const raw = parts.filter(Boolean).join(' ').toLowerCase().replace(/[^a-z0-9\s]/g, ' ');
  return new Set(raw.split(/\s+/).filter(w => w.length > 1 && !CTX_STOPWORDS.has(w)));
}

// A past set counts as "the same request" when its instructions/title
// share most of their meaningful words with the current request, or when
// both are plain category drills in the same category. Used to steer the
// AI away from answers the student has already seen.
function isSimilarPastSet(set, { category, tokens }) {
  if (set.source !== 'ai') return false;
  const setTokens = ctxTokens(set.customInstructions, set.noteTitle);
  if (tokens.size && setTokens.size) {
    let shared = 0;
    for (const t of tokens) if (setTokens.has(t)) shared++;
    return shared / Math.min(tokens.size, setTokens.size) >= 0.5;
  }
  // Both plain (no instructions saved): same category = same request.
  return tokens.size === 0 && setTokens.size === 0 && (set.category || 'Mixed') === category;
}

// Walk recent history (newest first) and collect the answers from past
// AI sets that match the current request, so the prompt can ban them.
function collectSeenAnswers(sets, { category, customInstructions, noteTitle }, cap = 40) {
  const tokens = ctxTokens(customInstructions, noteTitle);
  const seen = new Set();
  const answers = [];
  for (const set of sets || []) {
    if (!isSimilarPastSet(set, { category, tokens })) continue;
    for (const pq of set.perQuestion || []) {
      const a = (pq.correctAnswer || '').trim();
      const key = a.toLowerCase();
      if (!a || seen.has(key)) continue;
      seen.add(key);
      answers.push(a);
      if (answers.length >= cap) return answers;
    }
  }
  return answers;
}

function generatePrompt(category, difficulty, count, customInstructions, source = null, avoidAnswers = []) {
  const difficultyGuide = {
    Easy: 'Use well-known facts. Giveaway clue should be very obvious. Target: high school students.',
    Medium: 'Mix of common and uncommon knowledge. Standard college quiz bowl level.',
    Hard: 'Use obscure clues early. Require deep subject expertise. Only the giveaway should be accessible to non-experts.',
    Tournament: 'NAQT/ACF Nationals level. Opening clues should be nearly impossible except for top players. Use extremely obscure references, secondary works, lesser-known facts. Questions should be 5-7 sentences. Even the giveaway should require solid knowledge.',
  };
  const avoidBlock = avoidAnswers.length
    ? `\nThe student has already played AI-generated sets on this exact request. Do NOT repeat them:
- None of these may be the answer to any question: ${avoidAnswers.join('; ')}.
- Do not recycle the signature clues associated with those answers either - pick different answers, sub-topics, and angles so the set feels brand new.`
    : '';
  if (source?.text) {
    return `Generate ${count} pyramidal quiz bowl tossup questions sourced ENTIRELY from the source notes below.
Difficulty: ${difficulty}
${difficultyGuide[difficulty] || ''}

SOURCE NOTES on "${source.title}" — the only permitted fact base:
"""
${source.text}
"""

HARD RULES (these override everything above):
- Every clue in every question must restate a fact that is stated in the source notes. Use NO outside knowledge — no extra dates, names, works, numbers, or events, even ones you are certain are true.
- Every answer must be a person, work, place, event, or term named in the source notes. The source title itself is a scope label, not an answer.
- Vary the answers when the notes name enough distinct entities - a set where every answer is the page topic is invalid.
- Pyramidal means within the notes: open with the notes' most obscure details, end with the giveaway built from the notes' most famous fact.
- If the notes cannot support ${count} fully distinct questions, reuse different facts and angles from the notes rather than inventing material.
${customInstructions ? `- Additional instructions from the user: ${customInstructions}` : ''}${avoidBlock ? `${avoidBlock}
- If the notes are too thin to avoid every banned answer, prefer fresh answers first and only then reuse a banned one with entirely different clues.` : ''}
Return JSON using the complete answer guide: {"questions":[{"text":"...","answer":"...","category":"...","accept":[],"prompt":[]}]}`;
  }
  return `Generate ${count} pyramidal quiz bowl tossup questions.
Category: ${category}
Difficulty: ${difficulty}
${difficultyGuide[difficulty] || ''}
${customInstructions ? `\nAdditional instructions from the user: ${customInstructions}` : ''}${avoidBlock}
Each question must be aggressively pyramidal: extremely obscure specialist clues first, hard connecting clues next, and familiar giveaway material only at the very end.
Return JSON using the complete answer guide: {"questions":[{"text":"...","answer":"...","category":"...","accept":[],"prompt":[]}]}`;
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

// Read-aloud twin of useWordReveal (ported from eric-lu-VT's QuizBowl Discord
// bot, swapping Google Cloud TTS for the Web Speech API). The reveal is driven
// by the synthesizer's word-boundary events instead of a timer so the on-screen
// text tracks the spoken word — buzz-point scoring stays honest. Spoken one
// sentence per utterance to dodge Chrome's long-utterance cutoff; boundary
// events can drift on some voices (or not fire at all), so we snap the index
// exact at each sentence end, which also serves as the no-boundary fallback.
function useSpokenReveal(text, active, paused = false) {
  const [wordIndex, setWordIndex] = useState(0);
  const [spokenDone, setSpokenDone] = useState(false);
  const words = text ? text.split(/\s+/) : [];

  useEffect(() => { setWordIndex(0); setSpokenDone(false); }, [text]);

  useEffect(() => {
    if (!active || !words.length || !speechSynthesisSupported) return;
    const synth = window.speechSynthesis;
    const chunks = text.match(/[^.!?]+[.!?]*/g) || [text];
    let cancelled = false;
    let base = 0; // word offset of the chunk currently being spoken

    const speakChunk = (i) => {
      if (cancelled) return;
      if (i >= chunks.length) { setSpokenDone(true); return; }
      const chunk = chunks[i].trim();
      const chunkWords = chunk ? chunk.split(/\s+/).length : 0;
      // Strip power marks and pronunciation guides from the AUDIO only; the
      // displayed text keeps them, and the end-of-chunk snap absorbs the
      // small word-count drift stripping introduces mid-sentence.
      const spokenText = chunk.replace(/\(\*\)/g, '').replace(/\([^)]*\)/g, '').replace(/\s+/g, ' ').trim();
      if (!spokenText) { base += chunkWords; speakChunk(i + 1); return; }
      const u = new window.SpeechSynthesisUtterance(spokenText);
      u.onboundary = (e) => {
        if (cancelled || e.name !== 'word') return;
        const upto = spokenText.slice(0, e.charIndex).trim();
        const w = upto ? upto.split(/\s+/).length : 0;
        setWordIndex(prev => Math.max(prev, Math.min(words.length - 1, base + w)));
      };
      const advance = () => {
        if (cancelled) return;
        base += chunkWords;
        setWordIndex(prev => Math.max(prev, Math.min(words.length - 1, base - 1)));
        speakChunk(i + 1);
      };
      u.onend = advance;
      u.onerror = advance;
      try { synth.speak(u); } catch { advance(); }
    };

    try { synth.cancel(); } catch {}
    speakChunk(0);
    return () => { cancelled = true; try { synth.cancel(); } catch {} };
  }, [active, text]);

  // Pause/resume the utterance in place — toggling `active` instead would
  // restart the current sentence from its first word.
  useEffect(() => {
    if (!active || !speechSynthesisSupported) return;
    try { paused ? window.speechSynthesis.pause() : window.speechSynthesis.resume(); } catch {}
  }, [paused, active]);

  function stop() { if (speechSynthesisSupported) try { window.speechSynthesis.cancel(); } catch {} }
  const revealed = words.slice(0, wordIndex + 1).join(' ');
  const done = spokenDone || wordIndex >= words.length - 1;
  return { revealed, done, wordIndex, totalWords: words.length, stop };
}

export default function QuizBowlApp({ initialTopic = null, initialCategory = null, initialDifficulty = null, initialQuestions = null, initialContext = null, autoStart = false, curriculumId = null, curriculumLessonId = null } = {}) {
  const { openApp, state } = useWindowManager();
  function openLessonFor(topic) {
    if (!topic) return;
    setPendingLesson({ topic, difficulty: 'beginner' });
    openApp('lessons', 'Lessons');
  }
  // 'hub' is the new landing screen (stats + recommendations + history).
  // 'custom' is the old setup form, still available for fine control.
  // When deep-linked from study mode with pre-generated questions, jump
  // straight to playing. With just a topic, jump to the custom form.
  const hasPreloaded = Array.isArray(initialQuestions) && initialQuestions.length > 0;
  const [view, setView] = useState(hasPreloaded ? 'playing' : initialTopic ? 'custom' : 'hub');
  const [aiLobbyInitial, setAiLobbyInitial] = useState('lobby');
  const [replaySet, setReplaySet] = useState(null);
  const [matchReplayRec, setMatchReplayRec] = useState(null);
  const [savedSets, setSavedSets] = useState([]);
  const [savedSetsLoading, setSavedSetsLoading] = useState(false);
  const [editingSavedSet, setEditingSavedSet] = useState(null);
  const [setCreatorSeed, setSetCreatorSeed] = useState({});
  const [setCreatorReturnView, setSetCreatorReturnView] = useState('saved-sets');
  const [multiplayerSet, setMultiplayerSet] = useState(null);
  const [setupPlayMode, setSetupPlayMode] = useState('multiplayer');
  const [setupMatchMode, setSetupMatchMode] = useState('individual');
  const [setupFillWithBots, setSetupFillWithBots] = useState(false);
  const [setupBotLevel, setSetupBotLevel] = useState('varsity');
  const [setupScoringFormat, setSetupScoringFormat] = useState('iac-prelim');
  const [setupJoinCode, setSetupJoinCode] = useState('');
  const [matchJoinCode, setMatchJoinCode] = useState(null);
  const [matchLaunchConfig, setMatchLaunchConfig] = useState(null);
  // The played set open in the My Sets detail view, and where the solo
  // replay player should return when it exits (replays list vs detail).
  const [playedSetFocus, setPlayedSetFocus] = useState(null);
  const [replayReturnTo, setReplayReturnTo] = useState('replays');
  useBrowserBack(view !== 'hub', () => { setView('hub'); setReplaySet(null); setMatchReplayRec(null); setPlayedSetFocus(null); });
  const { user } = useAuth();
  // Which AI writes the AI-generated tossups (persisted, plan-gated).
  const { model: qbModel, pick: pickQbModel, available: qbModels } = useQbModel();
  const [questions, setQuestions] = useState(() =>
    hasPreloaded ? initialQuestions.map(q => ({ ...q, ...parseTossupText(q.text || '') })) : []
  );
  const [currentQ, setCurrentQ] = useState(0);
  const [generating, setGenerating] = useState(false);
  const [error, setError] = useState(null);

  const startingCategory = CATEGORIES.includes(initialCategory) ? initialCategory : 'Mixed';
  const [category, setCategory] = useState(startingCategory);
  const [selectedCategories, setSelectedCategories] = useState(() => [startingCategory]);
  const [difficulty, setDifficulty] = useState(() => {
    // Study-mode deep link maps lowercase NAQT levels to the picker labels
    // this app uses ("Easy" / "Medium" / "Hard"). Default Medium otherwise.
    const m = { elementary: 'Easy', middle: 'Easy', high: 'Medium', college: 'Hard' };
    return m[initialDifficulty] || 'Medium';
  });
  const [questionCount, setQuestionCount] = useState(10);
  const [customInstructions, setCustomInstructions] = useState(initialTopic ? `Focus on: ${initialTopic}` : '');
  const [revealSpeedMs, setRevealSpeedMs] = useState(140);
  // Topic deep-links (QBpedia, study mode) need the AI source — the custom
  // "Focus on" instructions only apply to generated questions, not qbreader.
  const [questionSource, setQuestionSource] = useState(initialTopic ? 'ai' : 'qbreader');
  const [playingSource, setPlayingSource] = useState('ai');

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

  function openGameSetup(mode = 'multiplayer') {
    setSetupPlayMode(mode);
    setMatchJoinCode(null);
    setMatchLaunchConfig(null);
    setMultiplayerSet(null);
    setError(null);
    setView('custom');
  }

  function openCustomRound() {
    const customCategory = selectedCategories.find(item => item !== 'Mixed') || category;
    setQuestionSource('ai');
    setCategory(customCategory);
    setSelectedCategories([customCategory]);
    openGameSetup('solo');
  }

  function startConfiguredGame() {
    if (setupPlayMode === 'solo') {
      handleGenerate();
      return;
    }
    const exactSet = multiplayerSet;
    const exactCategory = exactSet?.category || category;
    const exactCategories = Array.isArray(exactSet?.categories) && exactSet.categories.length
      ? exactSet.categories
      : exactSet
        ? [exactCategory]
        : selectedCategories;
    setMatchJoinCode(null);
    setMatchLaunchConfig({
      matchMode: setupMatchMode,
      questionSource: exactSet ? 'saved' : questionSource,
      categories: exactCategories,
      difficulty: exactSet?.difficulty || difficulty,
      questionCount: exactSet?.questions?.length || questionCount,
      revealSpeedMs,
      scoringFormat: setupScoringFormat,
      fillWithBots: setupFillWithBots,
      botLevel: setupBotLevel,
      setInstructions: questionSource === 'ai' ? customInstructions : '',
    });
    setView('multiplayer');
  }

  function joinConfiguredGame() {
    const code = setupJoinCode.trim().toUpperCase();
    if (code.length < 4) return;
    setMatchLaunchConfig(null);
    setMatchJoinCode(code);
    setView('multiplayer');
  }

  // Hub: history + recommendations from the server. Loaded on first
  // mount and refreshed whenever the user returns to the hub from a
  // completed set so the new entry shows up immediately. Cached across
  // app re-opens so the hub paints instantly with the last data.
  const cachedHist = peek('qb:history');
  const cachedRecs = peek('qb:recs');
  const cachedPats = peek('qb:patterns');
  const cachedSm2  = peek('qb:sm2due');
  const cachedMatches = peek('qb:matches');
  const [history, setHistory] = useState(cachedHist || null);
  const [skillProfile, setSkillProfile] = useState(cachedHist?.secretProfile || null);
  const [recs, setRecs] = useState(cachedRecs?.recommendations || []);
  const [patterns, setPatterns] = useState(cachedPats?.patterns || null);
  const [sm2Due, setSm2Due] = useState(cachedSm2?.dueCategories || []);
  const [matchList, setMatchList] = useState(cachedMatches?.matches || []);
  const [hubLoading, setHubLoading] = useState(!(cachedHist && cachedRecs && cachedPats));
  const setStartedAtRef = useRef(hasPreloaded ? Date.now() : null);
  const savedSetIdRef = useRef(null);       // guard so we save each set exactly once
  const curriculumCompletionRef = useRef(false);
  // Generation context of the set currently being played (AI sets only) -
  // saved with the set so future generations of the same request can
  // avoid repeating its answers.
  const playingCtxRef = useRef(null);
  // When re-playing a set from the My Sets archive, the original set's
  // source rides along so the new history entry keeps honest attribution
  // (a replayed QBReader round is still QBReader material, not AI).
  const playingOriginRef = useRef(null);

  // Answers from past AI sets that match this request. The generation
  // prompt bans them so replaying the same topic yields fresh questions.
  async function seenAnswersFor(ctx) {
    let sets = history?.sets;
    if (!sets) {
      try { sets = (await fetchOnce('qb:history', fetchQuizBowlHistory))?.sets; } catch { sets = []; }
    }
    return collectSeenAnswers(sets, ctx);
  }

  async function loadHub() {
    // Only show the skeleton if we have NOTHING to render - otherwise
    // refresh in the background and keep the stale data on screen.
    if (!peek('qb:history')) setHubLoading(true);
    try {
      const [h, r, p, s, m] = await Promise.all([
        fetchOnce('qb:history', fetchQuizBowlHistory)
          .catch(() => ({ sets: [], stats: { sets: 0, accuracy: 0, studyMs: 0, categoryStats: {} } })),
        fetchOnce('qb:recs', fetchQuizBowlRecommendations)
          .catch(() => ({ recommendations: [] })),
        fetchOnce('qb:patterns', fetchQuizBowlPatterns)
          .catch(() => ({ patterns: null })),
        fetchOnce('qb:sm2due', fetchQuizBowlSm2Due)
          .catch(() => ({ dueCategories: [] })),
        fetchOnce('qb:matches', fetchQuizBowlMatches)
          .catch(() => ({ matches: [] })),
      ]);
      setHistory(h);
      setSkillProfile(h?.secretProfile || null);
      setRecs(r.recommendations || []);
      setPatterns(p.patterns || null);
      setSm2Due(s.dueCategories || []);
      setMatchList(m.matches || []);
    } finally { setHubLoading(false); }
  }

  // After a completed set or match, bust the hub caches so loadHub() re-fetches.
  function bustHubCache() { bustPrefix('qb:'); }
  useEffect(() => { loadHub(); }, []);

  async function openMatchReplay(code) {
    try {
      const data = await fetchQuizBowlMatches();
      setMatchList(data.matches || []);
      const rec = (data.matches || []).find(m => m.code === code);
      if (rec) { setMatchReplayRec(rec); setView('match-replay'); }
    } catch {}
  }

  async function loadSavedSets() {
    setSavedSetsLoading(true);
    try {
      const data = await fetchSavedQuizBowlSets();
      setSavedSets(data.sets || []);
    } catch (err) { setError(err.message || 'Could not load saved sets.'); }
    setSavedSetsLoading(false);
  }

  async function openSavedSet(id) {
    try {
      const data = await getSavedQuizBowlSet(id);
      setEditingSavedSet(data.set);
      setView('set-editor');
    } catch (err) { setError(err.message || 'Could not open that set.'); }
  }

  async function playCollectionSet(listing) {
    try {
      if (listing.source === 'preset') {
        const data = await fetchQuizBowlPresetSet(listing.presetSlug);
        return playSavedSet(data.set);
      }
      const data = await getQuizBowlCollectionSet(listing.listingId);
      playSavedSet(data.set);
    } catch (err) {
      setError(err.message || 'Could not open that collection set.');
      throw err;
    }
  }

  async function playCollectionSetMultiplayer(listing) {
    try {
      const data = listing.source === 'preset'
        ? await fetchQuizBowlPresetSet(listing.presetSlug)
        : await getQuizBowlCollectionSet(listing.listingId);
      const set = data.set || {};
      const playable = (set.questions || []).filter(q => String(q.text || '').trim() && String(q.answer || '').trim());
      if (!playable.length) throw new Error('This collection set has no playable tossups.');
      setMultiplayerSet({ ...set, questions: playable, title: set.title || listing.title });
      setSetupPlayMode('multiplayer');
      setMatchJoinCode(null);
      setMatchLaunchConfig(null);
      setView('custom');
    } catch (err) {
      setError(err.message || 'Could not open that collection set.');
      throw err;
    }
  }

  function launchCountryPreset(set) { return playSavedSet(set); }

  function openSetCreator(initial = {}, returnView = 'saved-sets') {
    setSetCreatorSeed(initial);
    setSetCreatorReturnView(returnView);
    setView('set-creator');
  }

  async function createEmptySavedSet({ title = '', category: setCategory = 'Mixed', difficulty: setDifficulty = 'Medium' } = {}) {
    const data = await createSavedQuizBowlSet({
      title: title || `${setCategory} custom set`, category: setCategory, difficulty: setDifficulty, status: 'draft', questions: [],
    });
    setEditingSavedSet(data.set);
    setSavedSets(current => [data.set, ...current]);
    setView('set-editor');
    return data.set;
  }

  async function generateSavedSet({ title, category: setCategory, categories: selectedCategories = [], difficulty: setDifficulty, count, prompt }) {
    const categoryInstructions = selectedCategories.length > 1
      ? `${prompt}\n\nBalance the set across these selected categories: ${selectedCategories.join(', ')}. Give each selected category meaningful representation.`
      : prompt;
    const result = await apiFetch('/api/chat', {
      method: 'POST',
      body: JSON.stringify({
        system: SYSTEM_PROMPT,
        messages: [{ role: 'user', content: generatePrompt(setCategory, setDifficulty, count, categoryInstructions) }],
        max_tokens: 8192,
        model: qbModel,
        jsonMode: true,
      }),
    });
    const text = result.content?.[0]?.text || '';
    let parsed;
    try { parsed = JSON.parse(text); }
    catch {
      const match = text.match(/\{[\s\S]*\}/);
      if (match) parsed = JSON.parse(match[0]);
    }
    const generated = Array.isArray(parsed?.questions) ? parsed.questions : [];
    if (!generated.length) throw new Error('The AI did not return any questions. Try a more specific prompt.');
    const questions = generated.slice(0, count).map((question, index) => ({
      id: `ai-${Date.now()}-${index}`,
      text: String(question?.text || '').trim(),
      answer: String(question?.answer || '').trim(),
      category: String(question?.category || setCategory),
      coverageTag: '',
    })).filter(question => question.text && question.answer);
    if (!questions.length) throw new Error('The generated questions were incomplete. Try again.');
    const data = await createSavedQuizBowlSet({
      title: title || `${setCategory} custom set`,
      category: setCategory,
      difficulty: setDifficulty,
      status: 'draft',
      questions,
    });
    setEditingSavedSet(data.set);
    setSavedSets(current => [data.set, ...current.filter(set => set.id !== data.set.id)]);
    setView('set-editor');
    return data.set;
  }

  async function importPacketPdf(file) {
    try {
      const data = await importSavedQuizBowlPacket(file);
      setEditingSavedSet(data.set);
      setSavedSets(current => [data.set, ...current.filter(set => set.id !== data.set.id)]);
      setView('set-editor');
      return data;
    } catch (err) {
      setError(err.message || 'Could not import that PDF packet.');
      throw err;
    }
  }

  async function deleteSavedSet(id) {
    if (!window.confirm('Delete this saved Quiz Bowl set?')) return;
    try {
      await deleteSavedQuizBowlSet(id);
      setSavedSets(current => current.filter(set => set.id !== id));
    } catch (err) { setError(err.message || 'Could not delete that set.'); }
  }

  function playSavedSet(set) {
    const playable = (set.questions || []).filter(q => String(q.text || '').trim() && String(q.answer || '').trim());
    if (!playable.length) { setError('Add a question and answer before playing this set.'); return; }
    const savedCategory = set.category || 'Mixed';
    setCategory(savedCategory);
    setSelectedCategories([savedCategory]);
    setDifficulty(set.difficulty || 'Easy');
    setQuestionSource('saved');
    setPlayingSource('saved');
    // Carry the library title into the archived history entry.
    playingCtxRef.current = { title: set.title || '' };
    setQuestions(playable.map(q => ({ ...q, ...parseTossupText(q.text || '') })));
    setCurrentQ(0); setScores([]); setBuzzed(false); setShowResult(false); setReading(true); setIsPaused(false);
    fetchingMoreRef.current = false;
    beginNewSet();
    setView('playing');
  }

  async function saveCurrentSetForEditing() {
    try {
      const data = await createSavedQuizBowlSet({
        title: `${category} practice`, category, difficulty,
        questions: questions.map((question, index) => ({
          id: question.id || `question-${index + 1}`,
          text: question.text || '', answer: question.answer || '',
          category: question.category || category, coverageTag: question.coverageTag || '',
        })),
      });
      setEditingSavedSet(data.set);
      setSavedSets(current => [data.set, ...current]);
      setView('set-editor');
    } catch (err) { setError(err.message || 'Could not save this set.'); }
  }

  // ===== My Sets (played-set archive) actions =====
  // Re-play an archived set as a fresh scored round using the exact
  // questions from that game. `onlyMissed` narrows it to the ones the
  // player got wrong - a quick retry drill.
  function playPlayedSet(s, { onlyMissed = false } = {}) {
    const pool = (s.perQuestion || []).filter(q => String(q.text || '').trim() && String(q.correctAnswer || '').trim());
    const picked = onlyMissed ? pool.filter(q => !q.correct) : pool;
    if (!picked.length) return;
    const replayCategory = s.category || 'Mixed';
    setCategory(replayCategory);
    setSelectedCategories([replayCategory]);
    setDifficulty(s.difficulty || 'Medium');
    setQuestionSource('replay');
    setPlayingSource('replay');
    // Keep the archived set's title + generation context so the re-play
    // saves under the same name and future generations still avoid its
    // answers.
    playingCtxRef.current = {
      title: playedSetTitle(s),
      ...(s.source === 'ai' ? { customInstructions: s.customInstructions || '', noteTitle: s.noteTitle || '' } : {}),
    };
    setQuestions(picked.map(q => ({
      text: q.text,
      answer: q.correctAnswer,
      category: q.category || s.category || 'Mixed',
      ...parseTossupText(q.text || ''),
    })));
    setCurrentQ(0); setScores([]); setBuzzed(false); setShowResult(false); setReading(true); setIsPaused(false);
    fetchingMoreRef.current = false;
    beginNewSet();
    playingOriginRef.current = s.source || 'ai';
    setView('playing');
  }

  // Copy an archived set into the editable personal library so the user
  // can tweak questions and keep playing it from Save & edit.
  async function savePlayedSetToEditor(s) {
    try {
      const allowed = ['Easy', 'Medium', 'Hard', 'Tournament'];
      const data = await createSavedQuizBowlSet({
        title: playedSetTitle(s),
        category: s.category || 'Mixed',
        difficulty: allowed.includes(s.difficulty) ? s.difficulty : 'Medium',
        questions: (s.perQuestion || []).filter(q => String(q.text || '').trim()).map((q, index) => ({
          id: `played-${s.id}-${index}`,
          text: q.text,
          answer: q.correctAnswer || '',
          category: q.category || s.category || 'Mixed',
          coverageTag: '',
        })),
      });
      setEditingSavedSet(data.set);
      setSavedSets(current => [data.set, ...current]);
      setView('set-editor');
    } catch (err) { setError(err.message || 'Could not copy this set to the editor.'); }
  }

  async function deletePlayedSet(id) {
    if (!window.confirm('Remove this set from your history? Its questions and results go with it.')) return;
    try {
      await deletePlayedQuizBowlSet(id);
      setHistory(h => h ? { ...h, sets: (h.sets || []).filter(s => s.id !== id) } : h);
      setPlayedSetFocus(focus => (focus?.id === id ? null : focus));
      bustHubCache();
      setView('my-sets');
    } catch (err) { setError(err.message || 'Could not delete that set.'); }
  }

  async function renamePlayedSet(id, title) {
    const next = String(title || '').trim();
    if (!next) return;
    try {
      const data = await renamePlayedQuizBowlSet(id, next);
      setHistory(h => h ? { ...h, sets: (h.sets || []).map(s => (s.id === id ? { ...s, ...data.set } : s)) } : h);
      setPlayedSetFocus(focus => (focus?.id === id ? { ...focus, ...data.set } : focus));
      bustHubCache();
    } catch (err) { setError(err.message || 'Could not rename that set.'); }
  }

  // QBpedia handoff: start the game immediately instead of parking on the
  // setup form. The article rides along as the sole fact source — the
  // tossups are built from the page's text, never from the model's own
  // knowledge of the topic. Manual retries from the form keep the same
  // grounding (sourceNotes below) so a regenerate can't drift off-page.
  const sourceNotes = initialContext ? { title: initialTopic || 'this topic', text: initialContext } : null;
  const autoStartedRef = useRef(false);
  useEffect(() => {
    if (!autoStart || !initialTopic || hasPreloaded || autoStartedRef.current) return;
    autoStartedRef.current = true;
    launchSet({
      category: startingCategory,
      difficulty,
      source: 'ai',
      customInstructions: sourceNotes ? '' : `Focus on: ${initialTopic}`,
      notes: sourceNotes,
    });
  }, []);

  const [buzzed, setBuzzed] = useState(false);
  const [answer, setAnswer] = useState('');
  const [showResult, setShowResult] = useState(false);
  const [correct, setCorrect] = useState(null);
  const [wrongAnswer, setWrongAnswer] = useState(null);
  const [answerPrompt, setAnswerPrompt] = useState('');
  const [scores, setScores] = useState([]);
  const [reading, setReading] = useState(true);
  const [isPaused, setIsPaused] = useState(false);
  const fetchingMoreRef = useRef(false);
  const [refilling, setRefilling] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const QB_BATCH_SIZE = 5;
  const QB_PREFETCH_THRESHOLD = 3;

  // Read-aloud mode: TTS reads the tossup and the mic takes the answer.
  const [voiceMode, setVoiceMode] = useState(() => {
    try { return localStorage.getItem('covalent-qb-voice') === '1'; } catch { return false; }
  });
  const [micError, setMicError] = useState('');
  const [dictationLang] = useState(() => {
    try { return localStorage.getItem('covalent.dictation.lang') || 'en-US'; } catch { return 'en-US'; }
  });
  function toggleVoiceMode() {
    setMicError('');
    setVoiceMode(v => {
      try { localStorage.setItem('covalent-qb-voice', v ? '0' : '1'); } catch {}
      return !v;
    });
  }

  // Audio-only play: hide the on-screen tossup text so the question is heard,
  // not read. Only meaningful in read-aloud mode. The word reveal keeps
  // advancing underneath, so buzz-point scoring is unaffected; the text comes
  // back on the result screen for review.
  const [hideText, setHideText] = useState(() => {
    try { return localStorage.getItem('covalent-qb-hide-text') === '1'; } catch { return false; }
  });
  function toggleHideText() {
    setHideText(h => {
      try { localStorage.setItem('covalent-qb-hide-text', h ? '0' : '1'); } catch {}
      return !h;
    });
  }

  const q = questions[currentQ];
  const revealActive = reading && !buzzed && view === 'playing';
  const timedReveal = useWordReveal(q?.text || '', revealSpeedMs, !voiceMode && revealActive && !isPaused);
  const spokenReveal = useSpokenReveal(q?.text || '', voiceMode && revealActive, isPaused);
  const { revealed, done, stop, wordIndex, totalWords } = voiceMode ? spokenReveal : timedReveal;

  // Refs so the keydown handler (registered once per view change) always
  // reads the latest state without needing a stale-closure re-registration.
  const _buzzedRef    = useRef(buzzed);    _buzzedRef.current    = buzzed;
  const _readingRef   = useRef(reading);   _readingRef.current   = reading;
  const _isPausedRef  = useRef(isPaused);  _isPausedRef.current  = isPaused;
  const _showResultRef= useRef(showResult);_showResultRef.current= showResult;
  const _voiceModeRef = useRef(voiceMode); _voiceModeRef.current = voiceMode;
  const _isActiveRef  = useRef(false);    _isActiveRef.current  = state.windows[state.activeWindowId]?.appId === 'quizbowl';
  const _stopRef      = useRef(stop);      _stopRef.current      = stop;
  const _startMicRef  = useRef(null);
  const _submitRef    = useRef(null);
  const _nextQRef     = useRef(null);

  // Reset the per-set tracker each time a fresh round kicks off so the
  // save effect below doesn't think the previous set is still active.
  function beginNewSet() {
    setStartedAtRef.current = Date.now();
    savedSetIdRef.current = null;
    playingOriginRef.current = null;
    setAnswerPrompt('');
    setWrongAnswer(null);
  }

  // Launch a set with explicit category/difficulty/source - used by the
  // hub's "Train weakness" / "Recommended" / "Replay last" CTAs so the
  // user can skip the setup form when the choice is already implied.
  // Pass `customInstructions` to focus AI-generated questions on a niche
  // topic. Pass `notes` ({ title, text }) to ground generation entirely in
  // source material — only the QBpedia handoff does; hub CTAs must not, or
  // a category drill after an article game would stay pinned to the article.
  async function launchSet({ category: cat, categories: cats = null, difficulty: diff, source = 'qbreader', customInstructions: customInstr = '', notes = null, title = '' }) {
    const nextCategories = Array.isArray(cats) && cats.length ? cats : [cat];
    setSelectedCategories(nextCategories);
    setCategory(nextCategories.length === 1 ? nextCategories[0] : 'Mixed');
    setDifficulty(diff);
    setQuestionSource(source);
    // Run the same fetch logic handleGenerate() does, inline so the
    // state updates above settle into the closure.
    setGenerating(true); setError(null);
    try {
      if (source === 'qbreader') {
        const data = await fetchQBReaderTossups({ count: QB_BATCH_SIZE, category: nextCategories.length === 1 ? nextCategories[0] : 'Mixed', categories: nextCategories, difficulty: diff });
        const tossups = data?.tossups || [];
        if (!tossups.length) { setError('No questions for that combo.'); setGenerating(false); return; }
        setQuestions(tossups);
        setPlayingSource('qbreader');
      } else {
        const ctx = { category: cat, customInstructions: customInstr, noteTitle: notes?.title || '', title };
        const avoid = await seenAnswersFor(ctx);
        playingCtxRef.current = ctx;
        const result = await apiFetch('/api/chat', {
          method: 'POST',
          body: JSON.stringify({
            system: SYSTEM_PROMPT,
            messages: [{ role: 'user', content: generatePrompt(cat, diff, 10, customInstr, notes, avoid) }],
            max_tokens: 8192,
            model: qbModel,
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
      setCurrentQ(0); setScores([]); setBuzzed(false); setShowResult(false); setReading(true); setIsPaused(false);
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
        const data = await fetchQBReaderTossups({ count: QB_BATCH_SIZE, category, categories: selectedCategories, difficulty });
        const tossups = data?.tossups || [];
        if (!tossups.length) {
          setError('No questions for that combo. Try different filters.');
        } else {
          setQuestions(tossups);
          setPlayingSource('qbreader');
          setCurrentQ(0); setScores([]); setBuzzed(false); setShowResult(false); setReading(true); setIsPaused(false);
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
      const ctx = { category, customInstructions, noteTitle: sourceNotes?.title || '' };
      const avoid = await seenAnswersFor(ctx);
      playingCtxRef.current = ctx;
      const result = await apiFetch('/api/chat', {
        method: 'POST',
        body: JSON.stringify({
          system: SYSTEM_PROMPT,
          messages: [{ role: 'user', content: generatePrompt(category, difficulty, questionCount, customInstructions, sourceNotes, avoid) }],
          max_tokens: 8192,
          model: qbModel,
        }),
      });
      const text = result.content?.[0]?.text || '';
      let parsed;
      try { parsed = JSON.parse(text); } catch { const m = text.match(/\{[\s\S]*\}/); if (m) parsed = JSON.parse(m[0]); }
      if (parsed?.questions?.length) {
        setQuestions(parsed.questions.map(q => ({ ...q, ...parseTossupText(q.text || '') })));
        setPlayingSource('ai');
        setCurrentQ(0); setScores([]); setBuzzed(false); setShowResult(false); setReading(true); setIsPaused(false);
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
    fetchQBReaderTossups({ count: QB_BATCH_SIZE, category, categories: selectedCategories, difficulty })
      .then(data => {
        const more = data?.tossups || [];
        if (more.length) setQuestions(prev => [...prev, ...more]);
      })
      .catch(() => {})
      .finally(() => {
        fetchingMoreRef.current = false;
        setRefilling(false);
      });
  }, [currentQ, questions.length, view, playingSource, category, selectedCategories, difficulty]);

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
    if (buzzed) return;
    setAnswerPrompt('');
    setBuzzed(true); setReading(false); stop();
    // Match Study Mode dictation: stop TTS, request the mic, then begin the
    // same push-to-talk recognition session used by its composer.
    if (voiceMode && speechRecognitionSupported) _startMicRef.current?.();
  }

  // `spoken` can carry a transcript directly when submission happens in the
  // same tick as a final recognition result.
  function handleSubmit(spoken) {
    const given = typeof spoken === 'string' ? spoken : answer;
    if (!given.trim()) return;
    const judgement = judgeQuizBowlQuestion(q, given);
    if (judgement.directive === 'prompt') {
      setAnswerPrompt(judgement.directedPrompt || 'Be more specific.');
      return;
    }
    const isCorrect = judgement.directive === 'accept';
    setAnswerPrompt('');
    setCorrect(isCorrect); setShowResult(true);
    const points = naqtPointsFor(isCorrect, wordIndex, q.powerWordIndex, totalWords);
    setWrongAnswer(isCorrect ? null : {
      question: currentQ,
      buzzWord: wordIndex,
      totalWords,
      powerWordIndex: q.powerWordIndex ?? null,
    });
    setScores(prev => [...prev, { question: currentQ, correct: isCorrect, buzzWord: wordIndex, totalWords, powerWordIndex: q.powerWordIndex ?? null, points, answer: given.trim(), correctAnswer: q.answer }]);
  }

  function handleTimeout() {
    const points = naqtPointsFor(false, -1, q.powerWordIndex, totalWords);
    setScores(prev => [...prev, { question: currentQ, correct: false, buzzWord: -1, totalWords, powerWordIndex: q.powerWordIndex ?? null, points, answer: '', correctAnswer: q.answer }]);
    setShowResult(true); setCorrect(false); setWrongAnswer(null); setBuzzed(true);
  }

  function correctWrongAnswer() {
    if (!wrongAnswer || wrongAnswer.question !== currentQ || !q) return;
    const correctedPoints = naqtPointsFor(true, wrongAnswer.buzzWord, wrongAnswer.powerWordIndex, wrongAnswer.totalWords);
    setScores(previous => previous.map((score, index) => (
      index === previous.length - 1 && score.question === currentQ
        ? { ...score, correct: true, points: correctedPoints, reviewAccepted: true }
        : score
    )));
    setCorrect(true);
    setWrongAnswer(null);
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
      source: playingSource === 'qbreader' || playingOriginRef.current === 'qbreader' ? 'qbreader' : 'ai',
      // playingCtxRef can hold the previous AI round's context during a
      // plain QBReader round (same reason the spread below is guarded).
      title: playingSource === 'qbreader' ? '' : autoPlayedSetTitle(playingCtxRef.current),
      score, points, total, durationMs,
      perQuestion,
      // AI sets carry their generation context so future runs of the
      // same request can steer away from these answers.
      ...(playingSource !== 'qbreader' && playingCtxRef.current ? {
        customInstructions: playingCtxRef.current.customInstructions || '',
        noteTitle: playingCtxRef.current.noteTitle || '',
      } : {}),
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
      setBuzzed(false); setShowResult(false); setCorrect(null); setWrongAnswer(null); setAnswer(''); setAnswerPrompt(''); setReading(true); setIsPaused(false);
      return;
    }
    if (currentQ < questions.length - 1) {
      setCurrentQ(prev => prev + 1);
      setBuzzed(false); setShowResult(false); setCorrect(null); setWrongAnswer(null); setAnswer(''); setAnswerPrompt(''); setReading(true); setIsPaused(false);
    } else setView('review');
  }

  function endRound() { setView('review'); }

  function exitSet() {
    _stopRef.current?.();
    _micRef.current?.abort();
    setSettingsOpen(false);
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
    setIsPaused(false);
    setStartedAtRef.current = null;
    savedSetIdRef.current = null;
    playingCtxRef.current = null;
    playingOriginRef.current = null;
    setView('hub');
  }

  useEffect(() => {
    if (view !== 'review' || !curriculumId || !curriculumLessonId || curriculumCompletionRef.current) return;
    curriculumCompletionRef.current = true;
    markLessonComplete(curriculumId, curriculumLessonId)
      .then(() => window.dispatchEvent(new CustomEvent('covalent:curriculum-progress', { detail: { curriculumId } })))
      .catch(() => { curriculumCompletionRef.current = false; });
  }, [view, curriculumId, curriculumLessonId]);

  // Keep function refs current so the single keydown listener (registered
  // only when view changes) always calls the latest version.
  _submitRef.current   = handleSubmit;
  _nextQRef.current    = nextQuestion;

  useEffect(() => {
    if (view !== 'playing') return;
    function onKey(e) {
      if (!_isActiveRef.current) return;
      const buzzed     = _buzzedRef.current;
      const reading    = _readingRef.current;
      const showResult = _showResultRef.current;
      const paused     = _isPausedRef.current;
      if (e.key === ' ' && !buzzed && !showResult) {
        e.preventDefault();
        if (paused) { setIsPaused(false); return; }
        setAnswerPrompt('');
        setBuzzed(true); setReading(false); _stopRef.current?.();
        if (_voiceModeRef.current && speechRecognitionSupported) _startMicRef.current?.();
      }
      if (e.key === 'p' && !buzzed && !showResult && !(e.target instanceof HTMLInputElement)) {
        e.preventDefault();
        setIsPaused(p => !p);
      }
      if (e.key === 'Enter' && buzzed && !showResult) {
        e.preventDefault();
        _micRef.current?.stop({ finalizeNow: false });
        _submitRef.current?.();
      }
      else if (e.key === 'Enter' && showResult) { e.preventDefault(); _nextQRef.current?.(); }
    }
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [view]);

  // Read-aloud answer leg uses the exact Study Mode dictation shape:
  // continuous push-to-talk, live text, and no silence-based auto-submit.
  const mic = useSpeechRecognition({
    lang: dictationLang,
    continuous: true,
    interimResults: true,
    silenceMs: 0,
    onResult: (t) => setAnswer(t),
    onFinal: (t) => {
      const text = t.trim();
      if (!text) return;
      setAnswer(text);
    },
    onError: (err) => {
      if (!err) return;
      console.warn('QB dictation error:', err);
      // Chrome reports 'network' for any speech-service failure. Only blame
      // the connection when the browser actually says it's offline.
      if (err === 'network' && navigator.onLine !== false) {
        setMicError("Speech service didn't respond. Retry the mic or type your answer.");
        return;
      }
      setMicError(MIC_ERROR_MESSAGES[err] || 'Dictation stopped. Retry the microphone.');
    },
  });
  const _micRef = useRef(mic); _micRef.current = mic;

  async function startDictation() {
    setMicError('');
    const granted = await requestMicPermission();
    if (!granted) {
      setMicError(MIC_ERROR_MESSAGES['not-allowed']);
      return;
    }
    _micRef.current.start();
  }
  _startMicRef.current = startDictation;

  // Keep recognition alive for the entire answer leg. Stop it only when that
  // leg actually ends; tying abort() to the start effect's cleanup made a
  // harmless render/state transition capable of cancelling a fresh session.
  useEffect(() => {
    if (!voiceMode || !buzzed || showResult || view !== 'playing') {
      _micRef.current.abort();
    }
  }, [voiceMode, buzzed, showResult, view]);

  // Read the verdict back, like the bot announcing the result in-channel.
  useEffect(() => {
    if (!voiceMode || !showResult || view !== 'playing' || !speechSynthesisSupported) return;
    const answerSpoken = String(q?.answer || '').replace(/\[[^\]]*\]/g, '').replace(/\([^)]*\)/g, '').trim();
    const u = new window.SpeechSynthesisUtterance(correct ? 'Correct.' : `The answer was ${answerSpoken}.`);
    try { window.speechSynthesis.cancel(); window.speechSynthesis.speak(u); } catch {}
  }, [showResult]);

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
              <div key={i} className={`rounded-lg px-3.5 py-2.5 border flex items-start gap-2.5 ${s.correct ? 'bg-emerald-500/8 border-emerald-500/20' : 'bg-rose-500/8 border-rose-500/20'}`}>
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
          <div className="grid grid-cols-3 gap-2">
            <button onClick={() => { setView('custom'); setQuestions([]); setScores([]); }} className="py-2.5 rounded-lg border border-white/[0.08] bg-white/[0.03] text-[13px] font-semibold text-white/70 hover:bg-white/[0.06]">New set</button>
            <button onClick={() => { setCurrentQ(0); setBuzzed(false); setShowResult(false); setCorrect(null); setWrongAnswer(null); setReading(true); setScores([]); setAnswer(''); setView('playing'); }} className="py-2.5 rounded-lg bg-white/[0.09] hover:bg-white/[0.13] text-white/70 text-[13px] font-semibold">Replay</button>
            <button onClick={saveCurrentSetForEditing} className="py-2.5 rounded-lg border border-blue-400/30 bg-blue-500/[0.08] text-[13px] font-semibold text-blue-200 hover:bg-blue-500/[0.16]">Save & edit</button>
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
          {speechSynthesisSupported && (
            <button
              onClick={toggleVoiceMode}
              aria-label={voiceMode ? 'Turn off read aloud' : 'Read aloud'}
              title={voiceMode ? 'Read aloud on — questions are spoken, answer by voice' : 'Read aloud'}
              className={`p-1 rounded-lg border transition-colors ${voiceMode ? 'border-blue-400/30 bg-blue-500/[0.12] text-blue-300' : 'border-transparent text-white/30 hover:text-white/60 hover:bg-white/5'}`}
            >
              {voiceMode ? <Volume2 size={13} /> : <VolumeX size={13} />}
            </button>
          )}
          {speechSynthesisSupported && voiceMode && (
            <button
              onClick={toggleHideText}
              aria-label={hideText ? 'Show the question text' : 'Hide the question text'}
              title={hideText ? 'Text hidden. Click to show it.' : 'Hide the text and play by ear'}
              className={`p-1 rounded-lg border transition-colors ${hideText ? 'border-blue-400/30 bg-blue-500/[0.12] text-blue-300' : 'border-transparent text-white/30 hover:text-white/60 hover:bg-white/5'}`}
            >
              {hideText ? <EyeOff size={13} /> : <Eye size={13} />}
            </button>
          )}
          {!buzzed && !showResult && (
            <button
              onClick={() => setIsPaused(p => !p)}
              aria-label={isPaused ? 'Resume' : 'Pause'}
              className={`p-1 rounded-lg border transition-colors ${isPaused ? 'border-blue-400/30 bg-blue-500/[0.10] text-blue-300' : 'border-transparent text-white/30 hover:text-white/60 hover:bg-white/5'}`}
            >
              {isPaused ? <Play size={13} /> : <Pause size={13} />}
            </button>
          )}
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
          <button
            onClick={exitSet}
            className="shrink-0 rounded-full border border-white/[0.10] px-2 py-0.5 text-[10px] font-medium text-white/45 transition-colors hover:border-rose-400/30 hover:bg-rose-500/10 hover:text-rose-200"
          >
            Exit set
          </button>
          {isInfinite && settingsOpen && (
            <div className="absolute right-2 top-full mt-1 w-72 z-20 rounded-lg border border-white/[0.12] bg-white dark:bg-[#181818] p-3.5 space-y-3">
              <div className="flex items-center justify-between">
                <span className="text-[11px] font-bold uppercase tracking-[0.16em] text-white/40">Settings</span>
                <button onClick={() => setSettingsOpen(false)} className="text-white/45 hover:text-white/75"><X size={12} /></button>
              </div>
              <div>
                <div className="grid grid-cols-3 gap-1">
                  {CATEGORIES.map(c => (
                    <button key={c} onClick={() => selectCategory(c)}
                      className={`px-2 py-1 rounded-lg text-[10px] font-semibold transition-colors focus:outline-none ${(questionSource === 'qbreader' ? selectedCategories.includes(c) : category === c) ? 'bg-blue-500/[0.18] text-blue-100 border border-blue-400/[0.40]' : 'bg-white/[0.03] text-white/55 border border-white/[0.06] hover:bg-white/[0.06] hover:text-white/75'}`}>
                      {c}
                    </button>
                  ))}
                </div>
              </div>
              <div className="grid grid-cols-2 gap-1">
                {DIFFICULTIES.map(d => (
                  <button key={d} onClick={() => setDifficulty(d)}
                    className={`px-2 py-1.5 rounded-lg text-[11px] font-semibold transition-colors focus:outline-none ${difficulty === d ? 'bg-blue-500/[0.30] text-blue-100 border border-blue-400/[0.40]' : 'bg-white/[0.03] text-white/55 border border-white/[0.06] hover:bg-white/[0.06] hover:text-white/75'}`}>
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
            {voiceMode && hideText && !showResult ? (
              <div className="flex items-center gap-2 text-white/40">
                <Volume2 size={14} className={reading && !done && !isPaused ? 'animate-pulse' : ''} />
                <span className="text-[12px]">Audio only. The text returns with the result.</span>
                {isPaused && !buzzed && (
                  <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-bold uppercase tracking-[0.14em] bg-blue-500/[0.12] border border-blue-400/25 text-blue-300/80">
                    <Pause size={8} /> paused
                  </span>
                )}
              </div>
            ) : (
              <p className="text-[15px] leading-relaxed text-white/90 font-light">
                {revealed}
                {reading && !done && !isPaused && <span className="inline-block w-0.5 h-4 bg-white/35 animate-pulse ml-1 align-middle rounded-sm" />}
                {isPaused && !buzzed && (
                  <span className="inline-flex items-center gap-1 ml-2 align-middle px-1.5 py-0.5 rounded text-[10px] font-bold uppercase tracking-[0.14em] bg-blue-500/[0.12] border border-blue-400/25 text-blue-300/80">
                    <Pause size={8} /> paused
                  </span>
                )}
              </p>
            )}
          </div>
        </div>

        <div className="px-4 py-3 border-t border-white/[0.04] flex-shrink-0 space-y-2">
          {!buzzed && (
            <>
              <button onClick={handleBuzz} data-tour="qb-buzz"
                className="w-full py-4 rounded-lg bg-blue-500 hover:bg-blue-400 text-white text-[15px] font-bold uppercase tracking-[0.15em] active:scale-[0.98] transition-all">
                BUZZ
              </button>
              <p className="text-[10px] text-white/35 text-center">Space to buzz</p>
            </>
          )}
          {buzzed && !showResult && (
            <div className="space-y-2">
              {answerPrompt && <p className="text-[11px] font-semibold text-amber-300">Prompt: {answerPrompt}</p>}
              <div className="flex gap-2">
                <div className="relative flex-1">
                  <input value={answer} onChange={e => { setAnswer(e.target.value); setAnswerPrompt(''); }}
                    placeholder={voiceMode && mic.listening ? 'Listening… speak your answer' : 'Answer…'} autoFocus
                    className={`w-full pl-4 ${voiceMode ? 'pr-10' : 'pr-4'} py-3 rounded-lg border border-blue-500/40 bg-white/[0.05] text-[14px] text-white placeholder-white/25 outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-500/25 transition-colors`} />
                  {voiceMode && (
                    <button
                      type="button"
                      onClick={() => mic.listening ? mic.stop() : startDictation()}
                      aria-label={mic.listening ? 'Stop dictation' : 'Start dictation'}
                      title={mic.listening ? 'Stop dictation' : 'Start dictation'}
                      className={`absolute right-2 top-1/2 -translate-y-1/2 p-1 rounded-md transition-colors ${mic.listening ? 'text-blue-300 bg-blue-500/15' : 'text-white/35 hover:text-blue-300 hover:bg-blue-500/10'}`}
                    >
                      <Mic size={14} className={mic.listening ? 'animate-pulse' : ''} />
                    </button>
                  )}
                </div>
                <button onClick={() => { mic.stop({ finalizeNow: false }); handleSubmit(); }} disabled={!answer.trim()}
                  className="px-5 py-3 rounded-lg bg-blue-500 hover:bg-blue-400 text-white text-[13px] font-bold disabled:opacity-30 transition-colors">
                  <ArrowRight size={16} />
                </button>
              </div>
            </div>
          )}
          {buzzed && !showResult && voiceMode && micError && (
            <div className="flex items-center justify-center gap-2 text-[10px] text-rose-300/80">
              <span>{micError}</span>
              <button
                type="button"
                onClick={startDictation}
                className="inline-flex items-center gap-1 rounded-md border border-rose-400/25 bg-rose-500/10 px-2 py-1 font-semibold text-rose-200 hover:bg-rose-500/15 transition-colors"
              >
                <Mic size={10} /> Retry mic
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
              {!correct && wrongAnswer?.question === currentQ && (
                <button onClick={correctWrongAnswer}
                  className="w-full py-2.5 rounded-lg border border-amber-400/25 bg-amber-400/[0.08] text-amber-100 text-[12px] font-semibold hover:border-amber-300/45 transition-colors">
                  I was right
                </button>
              )}
              <div className="flex gap-2">
                <button onClick={() => openLessonFor(q.answer)}
                  className="flex-1 py-3 rounded-lg border border-blue-500/40 bg-blue-500/[0.08] text-blue-300 text-[12px] font-semibold hover:bg-blue-500/[0.15] hover:text-blue-200 inline-flex items-center justify-center gap-1.5 transition-colors">
                  <Lightbulb size={13} /> Lesson
                </button>
                {(() => {
                  const outOfBuffer = isInfinite && currentQ + 1 >= questions.length;
                  const showLoading = outOfBuffer && refilling;
                  return (
                    <button onClick={nextQuestion} disabled={outOfBuffer}
                      className="flex-1 py-3 rounded-lg bg-blue-600 hover:bg-blue-500 text-white text-[13px] font-semibold disabled:opacity-40 inline-flex items-center justify-center gap-2 transition-colors">
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
        <QuizBowlMatch
          user={user}
          initialSet={multiplayerSet}
          initialJoinCode={matchJoinCode}
          initialConfig={matchLaunchConfig}
          autoCreate={!!matchLaunchConfig}
          onExit={() => {
            setMultiplayerSet(null);
            setMatchJoinCode(null);
            setMatchLaunchConfig(null);
            bustHubCache();
            setView('hub');
          }}
          onMatchReplay={openMatchReplay}
        />
      </ViewFade>
    );
  }

  // ===== COUNTRY PRACTICE =====
  if (view === 'country-practice') {
    return <ViewFade viewKey="country-practice" className="h-full"><CountryPracticeBrowser
      onBack={() => setView('hub')}
      onPractice={launchCountryPreset}
    /></ViewFade>;
  }

  // ===== PUBLIC, ALREADY-WRITTEN SETS =====
  if (view === 'collection') {
    return <ViewFade viewKey="collection" className="h-full"><QuizBowlCollection
      onBack={() => setView('hub')}
      onMyPackets={() => { loadSavedSets(); setView('saved-sets'); }}
      onPlay={playCollectionSet}
      onPlayMultiplayer={playCollectionSetMultiplayer}
    /></ViewFade>;
  }

  // ===== SAVED, EDITABLE SETS =====
  if (view === 'saved-sets') {
    return <ViewFade viewKey="saved-sets" className="h-full"><SavedSetLibrary
      sets={savedSets} loading={savedSetsLoading}
      onBack={() => setView('hub')}
      onNew={() => openSetCreator({}, 'saved-sets')}
      onImport={importPacketPdf}
      onEdit={openSavedSet}
      onPlay={(id) => getSavedQuizBowlSet(id).then(data => playSavedSet(data.set)).catch(err => setError(err.message || 'Could not open that set.'))}
      onDelete={deleteSavedSet}
    /></ViewFade>;
  }

  if (view === 'set-creator') {
    return <ViewFade viewKey="set-creator" className="h-full"><SavedSetCreator
      initial={setCreatorSeed}
      onBack={() => setView(setCreatorReturnView)}
      onCreateManual={createEmptySavedSet}
      onGenerate={generateSavedSet}
      model={qbModel}
      models={qbModels}
      onPickModel={pickQbModel}
    /></ViewFade>;
  }

  if (view === 'set-editor' && editingSavedSet) {
    return <ViewFade viewKey={`set-editor:${editingSavedSet.id}`} className="h-full"><SavedSetEditor
      initialSet={editingSavedSet}
      onBack={() => { setEditingSavedSet(null); loadSavedSets(); setView('saved-sets'); }}
      onPlay={playSavedSet}
      onChanged={(saved) => {
        setEditingSavedSet(saved);
        setSavedSets(current => current.map(set => set.id === saved.id ? { ...set, ...saved, questionCount: saved.questions?.length || 0 } : set));
      }}
    /></ViewFade>;
  }

  // ===== CUSTOM SETUP (legacy form - opened from hub) =====
  if (view === 'my-sets') {
    return <ViewFade viewKey="my-sets" className="h-full"><MySetsView
      sets={history?.sets || []}
      loading={hubLoading && !history}
      onBack={() => setView('hub')}
      onOpen={(s) => { setPlayedSetFocus(s); setView('my-set-detail'); }}
    /></ViewFade>;
  }

  if (view === 'my-set-detail' && playedSetFocus) {
    return <ViewFade viewKey={`my-set:${playedSetFocus.id}`} className="h-full"><PlayedSetDetail
      set={playedSetFocus}
      onBack={() => { setPlayedSetFocus(null); setView('my-sets'); }}
      onPlayAgain={() => playPlayedSet(playedSetFocus)}
      onPracticeMissed={() => playPlayedSet(playedSetFocus, { onlyMissed: true })}
      onWatchReplay={() => { setReplayReturnTo('my-set-detail'); setReplaySet(playedSetFocus); setView('replay'); }}
      onSaveToEditor={() => savePlayedSetToEditor(playedSetFocus)}
      onRename={(title) => renamePlayedSet(playedSetFocus.id, title)}
      onDelete={() => deletePlayedSet(playedSetFocus.id)}
    /></ViewFade>;
  }

  if (view === 'custom') {
    return (
      <div className="h-full overflow-y-auto bg-transparent">
        <QuizBowlGameSetup
          onBack={() => { setMultiplayerSet(null); setView('hub'); }}
          playMode={setupPlayMode}
          onPlayModeChange={mode => { setSetupPlayMode(mode); if (mode === 'solo') setMultiplayerSet(null); }}
          matchMode={setupMatchMode}
          onMatchModeChange={setSetupMatchMode}
          questionSource={multiplayerSet ? 'saved' : questionSource}
          onQuestionSourceChange={selectQuestionSource}
          categories={multiplayerSet ? [multiplayerSet.category || 'Mixed'] : selectedCategories}
          onToggleCategory={selectCategory}
          difficulty={multiplayerSet?.difficulty || difficulty}
          onDifficultyChange={setDifficulty}
          questionCount={multiplayerSet?.questions?.length || questionCount}
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
          onBrowseCustomSets={() => { loadSavedSets(); setView('saved-sets'); }}
          initialSet={multiplayerSet}
          busy={generating}
          error={error}
          onSubmit={startConfiguredGame}
        />
      </div>
    );
  }

  // ===== CLUE LAB - clue analysis across past tossups =====
  if (view === 'clue-lab') {
    return (
      <ViewFade viewKey="clue-lab" className="h-full">
        <ClueLabView
          onBack={() => setView('hub')}
          onPractice={topic => {
            // Same handoff as a QBpedia topic deep-link: park on the custom
            // form with the answer line as the AI focus (the instructions
            // only apply to generated questions, not qbreader ones — and
            // replaying the very tossups just analyzed would be spoiled).
            setCustomInstructions(`Focus on: ${topic}`);
            setQuestionSource('ai');
            setView('custom');
          }}
        />
      </ViewFade>
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

  // ===== REPLAY - watch back a saved solo set question by question =====
  if (view === 'replay' && replaySet) {
    return <ReplayView set={replaySet} onExit={() => { setReplaySet(null); setView(replayReturnTo); setReplayReturnTo('replays'); }} />;
  }

  // ===== MATCH REPLAY - watch back a saved multiplayer match =====
  if (view === 'match-replay' && matchReplayRec) {
    return <MatchReplayView rec={matchReplayRec} myUserId={user?.id} onExit={() => { setMatchReplayRec(null); setView('replays'); }} />;
  }

  // ===== REPLAYS - full history browser =====
  if (view === 'replays') {
    return (
      <ReplaysView
        sets={history?.sets || []}
        matchList={matchList}
        myUserId={user?.id}
        onReplaySolo={(s) => { setReplaySet(s); setView('replay'); }}
        onReplayMatch={(rec) => { setMatchReplayRec(rec); setView('match-replay'); }}
        onBack={() => setView('hub')}
      />
    );
  }

  // ===== HUB (default) - stats, recommendations, history =====
  return (
    <ViewFade viewKey="hub" className="h-full flex flex-col">
    <QuizBowlHub
      hubLoading={hubLoading}
      history={history}
      skillProfile={skillProfile}
      recs={recs}
      patterns={patterns}
      sm2Due={sm2Due}
      matchList={matchList}
      error={error}
      generating={generating}
      onLaunch={launchSet}
      onMultiplayer={() => openGameSetup('multiplayer')}
      onCustom={openCustomRound}
      onClueLab={() => setView('clue-lab')}
      onCollection={() => setView('collection')}
      onCountryPractice={() => setView('country-practice')}
      onSavedSets={() => { loadSavedSets(); setView('saved-sets'); }}
      onMySets={() => setView('my-sets')}
      onOpenPlayedSet={(s) => { setPlayedSetFocus(s); setView('my-set-detail'); }}
      onAILobby={() => { setSetupFillWithBots(true); openGameSetup('multiplayer'); }}
      onReplay={(s) => { setReplaySet(s); setView('replay'); }}
      onReplayMatch={(rec) => { setMatchReplayRec(rec); setView('match-replay'); }}
      onReplays={() => setView('replays')}
    />
    </ViewFade>
  );
}

// ============================================================
// HUB
// ============================================================
function QuizBowlHub({ hubLoading, history, skillProfile, recs, patterns, sm2Due = [], matchList = [], error, generating, onLaunch, onMultiplayer, onCustom, onClueLab, onAILobby, onCollection, onCountryPractice, onSavedSets, onMySets, onOpenPlayedSet, onReplay, onReplayMatch, onReplays }) {
  const stats = history?.stats || { sets: 0, accuracy: 0, studyMs: 0, categoryStats: {} };
  const sets = history?.sets || [];
  const [showBuzzPatterns, setShowBuzzPatterns] = useState(false);

  // ML-derived weakness/strength from secretProfile; fall back to raw categoryStats.
  const topWeakness = useMemo(() => {
    if (skillProfile?.weaknesses?.length) {
      const w = skillProfile.weaknesses[0];
      return { cat: w.category, acc: w.accuracy, total: w.attempts };
    }
    const fallback = Object.entries(stats.categoryStats || {})
      .filter(([, v]) => v.total >= 3)
      .map(([cat, v]) => ({ cat, acc: Math.round((v.correct / v.total) * 100), total: v.total }))
      .sort((a, b) => a.acc - b.acc);
    return fallback[0] || null;
  }, [skillProfile, stats.categoryStats]);

  const topStrength = useMemo(() => {
    if (skillProfile?.strengths?.length) {
      const s = skillProfile.strengths[0];
      return { cat: s.category, acc: s.accuracy, total: s.attempts };
    }
    const fallback = Object.entries(stats.categoryStats || {})
      .filter(([, v]) => v.total >= 5)
      .map(([cat, v]) => ({ cat, acc: Math.round((v.correct / v.total) * 100), total: v.total }))
      .sort((a, b) => b.acc - a.acc);
    return fallback[0] || null;
  }, [skillProfile, stats.categoryStats]);

  const hoDiff = topStrength ? (topStrength.acc >= 85 ? 'Tournament' : 'Hard') : 'Hard';

  return (
    <div className="h-full overflow-y-auto bg-transparent pr-2">
      <div className="pb-8 space-y-5">
        {/* Header */}
        <div className="flex items-start justify-between gap-4">
          <div>
            <h2 className="text-lg font-bold text-white/90">Quiz Bowl</h2>
            <p className="mt-0.5 text-[11px] text-white/35">Pyramidal tossups, practice sets, and match review</p>
          </div>
          <div className="flex items-center gap-3 pt-0.5">
            <button
              type="button"
              onClick={onMySets}
              data-tour="qb-my-sets"
              className="inline-flex items-center gap-1.5 text-xs text-white/40 transition-colors hover:text-white/70"
            >
              <Layers size={12} /> My sets
            </button>
            <button
              type="button"
              onClick={onReplays}
              className="inline-flex items-center gap-1.5 text-xs text-white/40 transition-colors hover:text-white/70"
            >
              <History size={12} /> Replays
            </button>
          </div>
        </div>

        {error && <p className="text-[11px] text-rose-400 px-3 py-2 rounded-lg bg-rose-500/10 border border-rose-500/20 text-center">{error}</p>}

        {/* QBpedia-style direct entry points: one click starts a standard round. */}
        <section>
          <h3 className="mb-2 text-[11px] font-bold uppercase tracking-[0.16em] text-white/40">Quick start</h3>
          <div className="flex flex-wrap gap-1.5">
            {QUICK_START_CATEGORIES.map(quickCategory => (
              <button
                key={quickCategory}
                type="button"
                onClick={() => onLaunch({ category: quickCategory, difficulty: 'Medium', source: 'qbreader' })}
                disabled={generating}
                className="rounded-lg bg-blue-500 px-2.5 py-1 text-[12px] font-medium text-white transition-colors hover:bg-blue-400 disabled:cursor-not-allowed disabled:opacity-40"
              >
                {quickCategory}
              </button>
            ))}
          </div>
        </section>

        {/* Authored packets and maintained presets are full set sources, so
            keep them prominent and distinct from one-off custom rounds. */}
        <section>
          <h3 className="mb-2 text-[11px] font-bold uppercase tracking-[0.16em] text-white/40">Choose a set</h3>
          <div className="space-y-2">
            <button
              type="button"
              onClick={onCountryPractice}
              className="group flex w-full min-w-0 items-center gap-3 rounded-lg bg-blue-500 px-3.5 py-3 text-left text-white transition-colors hover:bg-blue-400"
            >
              <span className="min-w-0 flex-1">
                <span className="flex items-center gap-2">
                  <span className="text-[13px] font-semibold text-white/95">Preset sets</span>
                </span>
                <span className="mt-0.5 block text-[10px] leading-snug text-white/70">Browse built-in geography and history courses</span>
              </span>
              <span className="shrink-0 text-[10px] font-semibold text-white/80 transition-colors group-hover:text-white">Browse</span>
            </button>
            <button
              type="button"
              onClick={onSavedSets}
              data-tour="qb-custom-sets"
              className="group flex w-full min-w-0 items-center gap-3 rounded-lg border border-dashed border-white/[0.16] bg-white/[0.025] px-3.5 py-3 text-left transition-colors hover:border-white/[0.28] hover:bg-white/[0.055]"
            >
              <span className="min-w-0 flex-1">
                <span className="block text-[13px] font-semibold text-white/80 transition-colors group-hover:text-white/95">Custom sets</span>
                <span className="mt-0.5 block text-[10px] leading-snug text-white/40">Write a packet from scratch or import a PDF</span>
              </span>
              <span className="shrink-0 text-[10px] font-semibold text-white/35 transition-colors group-hover:text-white/65">Create or import</span>
            </button>
          </div>
        </section>

        {/* Primary play destinations use the same solid-blue treatment as the
            preset set action so the section reads as a clear action group. */}
        <section>
          <h3 className="mb-2 text-[11px] font-bold uppercase tracking-[0.16em] text-white/40">Play</h3>
          <div className="space-y-2">
            <button
              type="button"
              onClick={onAILobby}
              data-tour="qb-ai-lobby"
              className="group flex w-full min-w-0 items-center gap-3 rounded-lg bg-blue-500 px-3.5 py-3 text-left text-white transition-colors hover:bg-blue-400 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-300/70"
            >
              <Swords size={15} className="shrink-0 text-white/85" />
              <span className="min-w-0 flex-1">
                <span className="block text-[13px] font-semibold text-white/95">Compete in a lobby</span>
                <span className="mt-0.5 block text-[10px] leading-snug text-white/70">Play a full match against AI opponents</span>
              </span>
              <ChevronRight size={14} className="shrink-0 text-white/65 transition-colors group-hover:text-white" />
            </button>
            <button
              type="button"
              onClick={onCollection}
              className="group flex w-full min-w-0 items-center gap-3 rounded-lg bg-blue-500 px-3.5 py-3 text-left text-white transition-colors hover:bg-blue-400 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-300/70"
            >
              <BookOpen size={15} className="shrink-0 text-white/85" />
              <span className="min-w-0 flex-1">
                <span className="block text-[13px] font-semibold text-white/95">Quiz Bowl Collection</span>
                <span className="mt-0.5 block text-[10px] leading-snug text-white/70">Browse already-written community sets</span>
              </span>
              <ChevronRight size={14} className="shrink-0 text-white/65 transition-colors group-hover:text-white" />
            </button>
          </div>
        </section>

        {/* Secondary tools stay compact so the play paths remain dominant. */}
        <div className="grid grid-cols-3 gap-2">
          <button onClick={onMultiplayer}
            className="inline-flex items-center justify-center rounded-lg bg-blue-500 py-2 text-[11px] font-semibold text-white transition-colors hover:bg-blue-400">
            Multiplayer
          </button>
          <button onClick={onCustom} data-tour="qb-custom-set"
            className="inline-flex items-center justify-center rounded-lg bg-blue-500 py-2 text-[11px] font-semibold text-white transition-colors hover:bg-blue-400">
            Custom round
          </button>
          <button onClick={onClueLab}
            className="inline-flex items-center justify-center rounded-lg bg-blue-500 py-2 text-[11px] font-semibold text-white transition-colors hover:bg-blue-400">
            Clue Lab
          </button>
        </div>

        {/* Buzz patterns - collapsed behind a compact button, shows when there's enough data */}
        {patterns && (
          <>
            <button onClick={() => setShowBuzzPatterns(v => !v)}
              className="inline-flex items-center gap-1.5 text-xs text-white/40 transition-colors hover:text-white/70">
              <Zap size={12} className="text-violet-300/80" /> Buzz patterns
              {showBuzzPatterns
                ? <ChevronDown size={13} className="text-white/25" />
                : <ChevronRight size={13} className="text-white/25" />}
            </button>
            {showBuzzPatterns && <BuzzPatterns patterns={patterns} />}
          </>
        )}

        {/* Drill weakness + Hone strength side-by-side */}
        {(topWeakness || topStrength) && (
          <div className="grid grid-cols-2 gap-2">
            {topWeakness && (
              <button
                onClick={() => onLaunch({ category: topWeakness.cat, difficulty: 'Medium', source: 'qbreader' })}
                disabled={generating}
                className="text-left rounded-lg border border-rose-500/20 bg-rose-500/[0.05] p-3.5 hover:bg-rose-500/[0.10] hover:border-rose-500/30 transition-all disabled:opacity-40"
              >
                <div className="flex items-center gap-1 mb-1.5">
                  <TrendingDown size={11} className="text-rose-400/70" />
                  <span className="text-[10px] font-bold uppercase tracking-[0.14em] text-rose-400/70">Drill weakness</span>
                </div>
                <p className="text-[13px] font-bold text-white/90 leading-tight mb-0.5">{topWeakness.cat}</p>
                <p className="text-[10px] text-white/45">{topWeakness.acc}% · {topWeakness.total}Q</p>
              </button>
            )}
            {topStrength && (
              <button
                onClick={() => onLaunch({ category: topStrength.cat, difficulty: hoDiff, source: 'qbreader' })}
                disabled={generating}
                className="text-left rounded-lg border border-emerald-500/20 bg-emerald-500/[0.05] p-3.5 hover:bg-emerald-500/[0.10] hover:border-emerald-500/30 transition-all disabled:opacity-40"
              >
                <div className="flex items-center gap-1 mb-1.5">
                  <TrendingUp size={11} className="text-emerald-400/70" />
                  <span className="text-[10px] font-bold uppercase tracking-[0.14em] text-emerald-400/70">Hone strength</span>
                </div>
                <p className="text-[13px] font-bold text-white/90 leading-tight mb-0.5">{topStrength.cat}</p>
                <p className="text-[10px] text-white/45">{topStrength.acc}% · {hoDiff}</p>
              </button>
            )}
          </div>
        )}

        {/* Skills tracker - ML-powered category breakdown + struggle/mastery topics */}
        <SkillsPanel
          skillProfile={skillProfile}
          categoryStats={stats.categoryStats}
          generating={generating}
          onLaunch={onLaunch}
        />

        {/* SM-2 "Recommended today" — categories the spaced-repetition algorithm
            says are due based on the player's past buzz performance. */}
        {sm2Due.length > 0 && (
          <div>
            <div className="flex items-center gap-1.5 mb-1.5">
              <span className="text-[11px] font-bold uppercase tracking-[0.16em] text-white/40">Recommended today</span>
              <span className="text-[10px] text-white/25 ml-0.5">· spaced repetition</span>
            </div>
            <div className="space-y-1.5">
              {sm2Due.map((d, i) => (
                <button key={i}
                  onClick={() => onLaunch({ category: d.category, difficulty: 'Medium', source: 'qbreader' })}
                  disabled={generating}
                  className="group w-full text-left rounded-lg border border-white/[0.08] bg-white/[0.03] hover:bg-white/[0.06] hover:border-white/[0.14] p-3 transition-colors disabled:opacity-40 flex items-center gap-3"
                >
                  <div className="flex-1 min-w-0">
                    <p className="text-[13px] font-semibold text-white/90">{d.category}</p>
                    <p className="text-[10px] text-white/40">
                      {d.reps} review{d.reps !== 1 ? 's' : ''} · interval was {intervalLabel(d.interval)} · due now
                    </p>
                  </div>
                </button>
              ))}
            </div>
          </div>
        )}

        {/* AI Recommendations */}
        {recs.length > 0 && (
          <div>
            <div className="flex items-center gap-1.5 mb-1.5">
              <span className="text-[11px] font-bold uppercase tracking-[0.16em] text-white/40">Recommended for you</span>
            </div>
            <div className="space-y-1.5">
              {recs.map((r, i) => (
                <button key={i}
                  onClick={() => onLaunch({ category: r.category, difficulty: r.difficulty, source: r.source || 'qbreader', customInstructions: r.customInstructions || '' })}
                  disabled={generating}
                  className="group flex w-full min-w-0 items-center gap-3 rounded-lg bg-blue-500 px-3 py-2 text-left text-white transition-colors hover:bg-blue-400 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-300/70 disabled:cursor-not-allowed disabled:opacity-40"
                >
                  <div className="flex-1 min-w-0">
                    <p className="text-[11px] font-semibold text-white/95">
                      {r.topic || r.category}
                      <span className="text-white/70 font-normal"> · {r.difficulty}</span>
                    </p>
                  </div>
                </button>
              ))}
            </div>
          </div>
        )}

        {/* Past multiplayer matches */}
        {matchList.length > 0 && (
          <div>
            <div className="flex items-center gap-1.5 mb-1.5">
              <span className="text-[11px] font-bold uppercase tracking-[0.16em] text-white/40">Past matches</span>
              <span className="text-[10px] text-white/30">· {matchList.length}</span>
              <button onClick={onReplays} className="ml-auto text-[10px] text-white/30 hover:text-white/60 transition-colors">See all →</button>
            </div>
            <div className="space-y-1">
              {matchList.slice(0, 6).map((m) => {
                const ago = formatRelative(Date.now() - new Date(m.finishedAt).getTime());
                const myScore = m.players?.find(p => p.userId === m.myUserId)?.finalScore ?? 0;
                const sorted = [...(m.players || [])].sort((a, b) => (b.finalScore || 0) - (a.finalScore || 0));
                const myRank = sorted.findIndex(p => p.userId === m.myUserId) + 1;
                const won = myRank === 1;
                return (
                  <div key={m.id} onClick={() => onReplayMatch?.(m)}
                    className="flex items-center gap-3 px-2 py-2.5 border-b border-white/[0.06] last:border-b-0 cursor-pointer hover:bg-white/[0.03] rounded-md transition-colors group">
                    <div className={`min-w-[36px] px-1.5 py-1 rounded-md border text-center text-[10px] font-bold ${won ? 'text-amber-300 bg-amber-500/10 border-amber-500/25' : 'text-white/50 bg-white/[0.04] border-white/[0.10]'}`}>
                      #{myRank}
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-[12px] font-medium text-white/85 truncate">{m.category} <span className="text-white/35">· {m.difficulty}</span></p>
                      <p className="text-[10px] text-white/35">{ago} · {m.questions?.length || 0}Q · {m.players?.filter(p => !p.isBot).length || 1}v{(m.players?.length || 2) - 1} · {myScore} pts</p>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {/* Empty state for new players */}
        {hubLoading ? (
          <div className="py-6 text-center text-[11px] text-white/35">Loading your stats…</div>
        ) : sets.length === 0 && (
          <div className="rounded-lg border border-dashed border-white/[0.10] bg-white/[0.02] p-5 text-center">
            <p className="text-[13px] font-semibold text-white/80">No sets yet</p>
            <p className="text-[11px] text-white/40 mt-1 mb-3">Start a recommended round above, or pick your own filters in Custom.</p>
          </div>
        )}
      </div>
    </div>
  );
}

// ============================================================
// SKILLS PANEL
// ML-powered breakdown of strengths, weaknesses, and specific
// answer-objects the student keeps missing or has mastered.
// Uses secretProfile data from the backend (categoryProfile,
// struggleTopics, masteryTopics). Falls back to raw categoryStats
// for accounts without enough history for the ML model.
// ============================================================
function SkillsPanel({ skillProfile, categoryStats, generating, onLaunch }) {
  const [tab, setTab] = useState('all');

  // Build the full category list. Use richer per-category ML data when
  // available — it carries recent accuracy and buzz timing that raw
  // categoryStats doesn't have.
  const categories = useMemo(() => {
    if (skillProfile?.categoryProfile && Object.keys(skillProfile.categoryProfile).length) {
      return Object.entries(skillProfile.categoryProfile)
        .filter(([, cp]) => (cp.attempts || 0) >= 2)
        .map(([cat, cp]) => ({
          cat,
          acc: cp.accuracy || 0,
          recentAcc: cp.recentAccuracy ?? cp.accuracy ?? 0,
          total: cp.attempts || 0,
          avgBuzzPos: cp.avgBuzzPosition || 0,
        }))
        .sort((a, b) => a.acc - b.acc);
    }
    return Object.entries(categoryStats || {})
      .filter(([, v]) => (v.total || 0) >= 2)
      .map(([cat, v]) => ({
        cat,
        acc: v.total ? Math.round((v.correct / v.total) * 100) : 0,
        recentAcc: null,
        total: v.total || 0,
        avgBuzzPos: 0,
      }))
      .sort((a, b) => a.acc - b.acc);
  }, [skillProfile, categoryStats]);

  const struggleTopics = skillProfile?.struggleTopics || [];
  const masteryTopics = skillProfile?.masteryTopics || [];

  const filtered = tab === 'weak' ? categories.filter(c => c.acc < 60)
    : tab === 'strong' ? categories.filter(c => c.acc >= 70)
    : categories;

  if (!categories.length && !struggleTopics.length) return null;

  const TABS = [
    { key: 'all', label: 'All' },
    { key: 'weak', label: 'Weak' },
    { key: 'strong', label: 'Strong' },
  ];

  return (
    <div>
      {/* Header + tabs */}
      <div className="flex items-center gap-2 mb-2">
        <span className="text-[11px] font-bold uppercase tracking-[0.16em] text-white/40">Skills</span>
        <div className="ml-auto flex gap-1">
          {TABS.map(t => (
            <button
              key={t.key}
              onClick={() => setTab(t.key)}
              className={`px-2 py-0.5 rounded text-[10px] font-semibold transition-colors ${tab === t.key ? 'bg-white/[0.10] text-white/80' : 'text-white/30 hover:text-white/55'}`}
            >
              {t.label}
            </button>
          ))}
        </div>
      </div>

      {/* Category bars — each clickable to launch a set in that category */}
      {filtered.length > 0 && (
        <div className="space-y-1 mb-3">
          {filtered.map(({ cat, acc, recentAcc, total, avgBuzzPos }) => {
            const barCls = acc >= 75 ? 'bg-emerald-400/70' : acc >= 50 ? 'bg-amber-400/70' : 'bg-rose-400/70';
            const diff = recentAcc !== null ? recentAcc - acc : null;
            const trend = diff !== null && Math.abs(diff) >= 3
              ? (diff > 0 ? 'up' : 'down') : null;
            const drillDiff = acc >= 75 ? 'Hard' : 'Medium';
            return (
              <button
                key={cat}
                onClick={() => onLaunch({ category: cat, difficulty: drillDiff, source: 'qbreader' })}
                disabled={generating}
                className="w-full grid grid-cols-[84px_1fr_auto] items-center gap-2 px-3 py-2 rounded-lg bg-white/[0.02] border border-white/[0.05] hover:bg-white/[0.05] hover:border-white/[0.10] transition-colors text-left disabled:opacity-40"
              >
                <span className="text-[11px] text-white/75 font-medium truncate">{cat}</span>
                <div className="h-1.5 rounded-full bg-white/[0.06] overflow-hidden">
                  <div className={`h-full rounded-full ${barCls} transition-all`} style={{ width: `${Math.max(4, acc)}%` }} />
                </div>
                <div className="flex items-center gap-1 min-w-[64px] justify-end">
                  {trend === 'up' && <TrendingUp size={9} className="text-emerald-400/70 shrink-0" />}
                  {trend === 'down' && <TrendingDown size={9} className="text-rose-400/70 shrink-0" />}
                  <span className="text-[10px] text-white/45 tabular-nums">{acc}%</span>
                  <span className="text-[9px] text-white/25 tabular-nums">·{total}</span>
                </div>
              </button>
            );
          })}
        </div>
      )}

      {/* Struggle topics — specific answer-objects the student keeps missing.
          Launch an AI set focused on each one so they can drill to mastery. */}
      {struggleTopics.length > 0 && (
        <div className="mb-3">
          <div className="flex items-center gap-1.5 mb-1.5">
            <span className="text-[10px] font-bold uppercase tracking-[0.14em] text-rose-400/60">Need work</span>
            <span className="text-[9px] text-white/25">· specific topics you keep missing</span>
          </div>
          <div className="flex flex-wrap gap-1.5">
            {struggleTopics.slice(0, 8).map((t, i) => (
              <button
                key={i}
                onClick={() => onLaunch({
                  category: t.category || 'Mixed',
                  difficulty: 'Medium',
                  source: 'ai',
                  customInstructions: `Focus exclusively on tossups about "${t.topic}". The student has answered this incorrectly ${t.seen - t.correct} out of ${t.seen} times.`,
                })}
                disabled={generating}
                title={`${t.correct}/${t.seen} correct — click to drill`}
                className="px-2 py-1 rounded-md border border-rose-500/20 bg-rose-500/[0.06] hover:bg-rose-500/[0.12] hover:border-rose-500/30 text-[10px] text-rose-300/80 transition-colors disabled:opacity-40 truncate max-w-[140px]"
              >
                {t.topic}
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Mastery topics — things the student has answered correctly every recent attempt. */}
      {masteryTopics.length > 0 && (
        <div>
          <div className="flex items-center gap-1.5 mb-1.5">
            <span className="text-[10px] font-bold uppercase tracking-[0.14em] text-emerald-400/60">Locked in</span>
            <span className="text-[9px] text-white/25">· mastered</span>
          </div>
          <div className="flex flex-wrap gap-1.5">
            {masteryTopics.slice(0, 8).map((t, i) => (
              <span
                key={i}
                title={`${t.seen} seen — consistently correct`}
                className="px-2 py-1 rounded-md border border-emerald-500/15 bg-emerald-500/[0.04] text-[10px] text-emerald-300/60 truncate max-w-[140px]"
              >
                {t.topic}
              </span>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

function HubStat({ label, value, accent }) {
  const accentCls = accent === 'emerald' ? 'text-emerald-300'
    : accent === 'amber' ? 'text-amber-300'
    : accent === 'rose' ? 'text-rose-300'
    : 'text-white/90';
  return (
    <div className="rounded-lg border border-white/[0.07] bg-white/[0.03] px-3 py-2.5">
      <div className="text-[9.5px] uppercase tracking-[0.16em] font-bold text-white/35 mb-1">{label}</div>
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

  return (
    <div className="min-w-0 rounded-lg border border-white/[0.08] bg-white/[0.025] p-3 space-y-3">
      {/* Sparkline - recent 20 buzzes as dots on a timeline */}
      {p.recentBuzzes?.length > 3 && (
        <div>
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
      <div className="grid grid-cols-3 gap-px overflow-hidden rounded-lg bg-white/[0.04]">
        <TimingCell label="Early" count={p.early.count} accuracy={p.early.accuracy} tone="emerald" />
        <TimingCell label="Mid" count={p.mid.count} accuracy={p.mid.accuracy} tone="blue" />
        <TimingCell label="Late" count={p.late.count} accuracy={p.late.accuracy} tone="amber" />
      </div>

      {/* Avg buzz position + timeout rate */}
      <div className="grid grid-cols-2 gap-2">
        <div className="rounded-lg border border-white/[0.06] bg-white/[0.04] px-3 py-2.5">
          <div className="text-[9px] uppercase tracking-[0.14em] font-bold text-white/35 mb-0.5">Avg buzz point</div>
          <div className="text-[15px] font-bold text-white/90 tabular-nums">{p.avgBuzzPosition}%</div>
          <div className="mt-1 h-1 rounded-full bg-white/[0.06] overflow-hidden">
            <div className="h-full rounded-full bg-violet-400/70" style={{ width: `${p.avgBuzzPosition}%` }} />
          </div>
        </div>
        <div className="rounded-lg border border-white/[0.06] bg-white/[0.04] px-3 py-2.5">
          <div className="text-[9px] uppercase tracking-[0.14em] font-bold text-white/35 mb-0.5">Timeout rate</div>
          <div className={`text-[15px] font-bold tabular-nums ${p.timeoutRate > 25 ? 'text-rose-300' : 'text-white/90'}`}>{p.timeoutRate}%</div>
          <div className="mt-1 h-1 rounded-full bg-white/[0.06] overflow-hidden">
            <div className={`h-full rounded-full ${p.timeoutRate > 25 ? 'bg-rose-400/70' : 'bg-white/20'}`} style={{ width: `${Math.min(100, p.timeoutRate)}%` }} />
          </div>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-2">
        <div className="rounded-lg border border-white/[0.06] bg-white/[0.04] px-3 py-2.5">
          <div className="mb-0.5 text-[9px] font-bold uppercase tracking-[0.14em] text-white/35">Best zone</div>
          <div className="text-[13px] font-bold tabular-nums text-violet-200">
            {p.optimalZone ? `${p.optimalZone.start}–${p.optimalZone.end}%` : '—'}
          </div>
          <div className="mt-0.5 text-[9px] text-white/35">highest accuracy window</div>
        </div>
        <div className="rounded-lg border border-white/[0.06] bg-white/[0.04] px-3 py-2.5">
          <div className="mb-0.5 text-[9px] font-bold uppercase tracking-[0.14em] text-white/35">Recent trend</div>
          <div className={`text-[13px] font-bold tabular-nums ${p.trend > 0 ? 'text-emerald-300' : p.trend < 0 ? 'text-amber-300' : 'text-white/70'}`}>
            {p.trend > 0 ? 'Earlier' : p.trend < 0 ? 'Later' : 'Steady'}
          </div>
          <div className="mt-0.5 text-[9px] text-white/35">buzz timing</div>
        </div>
      </div>

      {/* Per-category buzz habits */}
      {p.categoryPatterns?.length > 0 && (
        <div>
          <div className="mb-1.5 text-[9px] font-bold uppercase tracking-[0.14em] text-white/30">Category buzz habits</div>
          <div className="space-y-1">
            {p.categoryPatterns.map(c => {
              const barColor = c.accuracy >= 75 ? 'bg-emerald-400/60' : c.accuracy >= 50 ? 'bg-blue-400/60' : 'bg-rose-400/60';
              return (
                <div key={c.category} className="grid min-w-0 grid-cols-[minmax(0,70px)_minmax(0,1fr)_auto] items-center gap-2">
                  <span className="min-w-0 truncate text-[10px] text-white/60">{c.category}</span>
                  <div className="min-w-0 h-1.5 rounded-full bg-white/[0.05] overflow-hidden relative">
                    {/* Buzz position marker */}
                    <div
                      className="absolute top-0 bottom-0 w-0.5 bg-white/50 z-10"
                      style={{ left: `${c.avgBuzzPosition}%` }}
                    />
                    <div className={`h-full rounded-full ${barColor}`} style={{ width: `${c.accuracy}%` }} />
                  </div>
                  <span className="whitespace-nowrap text-right text-[9px] text-white/40 tabular-nums">
                    {c.avgBuzzPosition}% · {c.accuracy}%
                  </span>
                </div>
              );
            })}
          </div>
        </div>
      )}

    </div>
  );
}

function TimingCell({ label, count, accuracy, tone }) {
  const accentCls = tone === 'emerald' ? 'text-emerald-300'
    : tone === 'blue' ? 'text-blue-300'
    : 'text-amber-300';
  return (
    <div className="bg-white/[0.02] px-3 py-2 text-center">
      <div className="text-[10px] font-bold text-white/55 mb-1">{label}</div>
      <div className={`text-[14px] font-bold tabular-nums ${count > 0 ? accentCls : 'text-white/25'}`}>
        {count > 0 ? `${accuracy}%` : '--'}
      </div>
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
      className={`text-left rounded-lg border p-2.5 transition-all ${
        active
          ? 'border-blue-400/45 bg-blue-500/15 text-white'
          : 'border-white/[0.08] bg-white/[0.03] text-white/60 hover:bg-white/[0.06] hover:text-white/80'
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
      className={`px-2.5 py-1 rounded-lg text-[12px] font-semibold transition-all whitespace-nowrap ${
        active
          ? 'bg-blue-500/[0.18] text-blue-100 border border-blue-400/[0.40]'
          : 'bg-white/[0.03] border border-white/[0.06] text-white/55 hover:text-white/80 hover:bg-white/[0.06]'
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
  const [selectedCategories, setSelectedCategories] = useState(['History']);
  const [difficulty, setDifficulty]     = useState('medium');
  const [source, setSource]             = useState('qbreader');
  const [scoringFormat, setScoringFormat] = useState(
    () => AI_LOBBY_SCORING_FORMATS.find((format) => format.id === 'iac-prelim') || AI_LOBBY_SCORING_FORMATS[0]
  );
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

  const diffMap = { easy: 'Easy', medium: 'Medium', hard: 'Hard', tournament: 'Tournament' };

  function selectQuestionSource(nextSource) {
    setSource(nextSource);
    if (nextSource === 'ai' && selectedCategories.length > 1) {
      setCategory(selectedCategories[0]);
    }
  }

  function selectCategory(nextCategory) {
    if (source !== 'qbreader') {
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
      const normalized = next.length ? QB_LOBBY_CATEGORIES.filter(value => next.includes(value)) : ['Mixed'];
      setCategory(normalized.length === 1 ? normalized[0] : 'Mixed');
      return normalized;
    });
  }

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

  // Pending replay save - kicked off the moment the game ends so it's
  // usually done before the player clicks through the results screen.
  // Awaited on exit so the hub refetch sees the new replay.
  const replaySaveRef = useRef(null);

  function handleMatchFinished(replay) {
    replaySaveRef.current = saveAiMatchReplay({
      ...replay,
      category,
      difficulty: diffMap[difficulty],
      scoringFormat: scoringFormat.id,
    }).catch(() => {});
  }

  async function startSession() {
    setError(null);
    setScreen('loading');
    try {
      let qs;
      if (source === 'qbreader') {
        const data = await fetchQBReaderTossups({ count: 15, category, categories: selectedCategories, difficulty: diffMap[difficulty] });
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
          <button onClick={onExit} className="flex items-center gap-2 text-sm text-white/35 hover:text-white/60 transition-colors">
            <ArrowLeft size={16} /> Hub
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
          onMatchFinished={handleMatchFinished}
          onComplete={async () => { await replaySaveRef.current; onExit(); }}
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
        <button onClick={onExit} className="flex items-center gap-2 text-sm text-white/35 hover:text-white/60 transition-colors">
          <ArrowLeft size={16} /> Hub
        </button>

        {/* ── Mode ── */}
        <div className="grid grid-cols-2 gap-2">
          <button onClick={() => setLobbyType('lobby')}
            className={`rounded-lg border p-3 text-left transition-all ${lobbyType === 'lobby' ? 'border-blue-400/45 bg-blue-500/15' : 'border-white/[0.08] bg-white/[0.03] hover:bg-white/[0.06]'}`}>
            <Users size={15} className={`mb-1.5 ${lobbyType === 'lobby' ? 'text-blue-400' : 'text-white/30'}`} />
            <div className={`font-semibold text-[12px] ${lobbyType === 'lobby' ? 'text-white' : 'text-white/60'}`}>vs AI Lobby</div>
            <div className="text-[10px] text-white/35 mt-0.5">8 bots · tournament</div>
          </button>
          <button onClick={() => setLobbyType('head-to-head')}
            className={`rounded-lg border p-3 text-left transition-all ${lobbyType === 'head-to-head' ? 'border-blue-400/45 bg-blue-500/15' : 'border-white/[0.08] bg-white/[0.03] hover:bg-white/[0.06]'}`}>
            <Swords size={15} className={`mb-1.5 ${lobbyType === 'head-to-head' ? 'text-blue-400' : 'text-white/30'}`} />
            <div className={`font-semibold text-[12px] ${lobbyType === 'head-to-head' ? 'text-white' : 'text-white/60'}`}>Head to Head</div>
            <div className="text-[10px] text-white/35 mt-0.5">1v1 · AI or real player</div>
          </button>
        </div>

        {/* ── Head to Head: sub-toggle for AI Bot vs Real Player ── */}
        {lobbyType === 'head-to-head' && (
          <div className="rounded-lg border border-white/[0.08] bg-white/[0.02] p-4 space-y-3">
            <div className="grid grid-cols-2 gap-1.5">
              <button onClick={() => setH2hOpponent('ai')}
                className={`py-2 rounded-lg text-[11px] font-semibold border transition-all ${
                  h2hOpponent === 'ai'
                    ? 'bg-blue-500/[0.18] text-blue-100 border-blue-400/[0.40]'
                    : 'bg-white/[0.03] text-white/50 border-white/[0.06] hover:text-white/70 hover:bg-white/[0.06]'
                }`}>
                vs AI Bot
              </button>
              <button onClick={() => setH2hOpponent('real')}
                className={`py-2 rounded-lg text-[11px] font-semibold border transition-all ${
                  h2hOpponent === 'real'
                    ? 'bg-blue-500/[0.18] text-blue-100 border-blue-400/[0.40]'
                    : 'bg-white/[0.03] text-white/50 border-white/[0.06] hover:text-white/70 hover:bg-white/[0.06]'
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
                  className="w-full py-3 rounded-lg bg-blue-500 hover:bg-blue-400 text-white text-[13px] font-bold inline-flex items-center justify-center gap-2 transition-all border border-blue-400/40">
                  <Users size={14} /> Enter Lobby
                </button>
              </div>
            )}
          </div>
        )}

        {/* ── Lobby: room level + player preview ── */}
        {lobbyType === 'lobby' && (
          <div className="rounded-lg border border-white/[0.08] bg-white/[0.02] p-4 space-y-3">
            <div className="flex items-center justify-between">
              <span className="text-[11px] font-bold uppercase tracking-[0.16em] text-white/40">Competition level</span>
            </div>
            <div className="grid grid-cols-4 gap-1.5" data-tour="qb-room-level">
              {ROOM_LEVELS.map(l => (
                <button key={l.id} onClick={() => setRoomLevel(l.id)}
                  className={`py-1.5 rounded-lg text-[11px] font-semibold transition-all border ${
                    roomLevel === l.id
                      ? 'bg-blue-500/[0.18] text-blue-100 border-blue-400/[0.40]'
                      : 'bg-white/[0.03] text-white/50 border-white/[0.06] hover:bg-white/[0.06] hover:text-white/70'
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
              <p className="text-[11px] font-bold uppercase tracking-[0.16em] text-white/40 mb-2">Opponent</p>
              <div className="grid grid-cols-2 gap-1.5">
                {BOT_ROSTER.map((bot, i) => (
                  <button key={bot.id} onClick={() => setSelectedBotIdx(i)}
                    className={`rounded-lg border p-2.5 text-left transition-all ${selectedBotIdx === i ? 'border-blue-400/45 bg-blue-500/15' : 'border-white/[0.07] bg-white/[0.02] hover:border-white/[0.14] hover:bg-white/[0.04]'}`}>
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
            <div className="rounded-lg border border-white/[0.08] bg-white/[0.02] p-4 space-y-3.5">
              <span className="text-[11px] font-bold uppercase tracking-[0.16em] text-white/40">Fine-tune</span>

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
            <GlassTile active={source === 'qbreader'} icon={<BookOpen size={14} />} label="Past QB" sub="qbreader.org" onClick={() => selectQuestionSource('qbreader')} />
            <GlassTile active={source === 'ai'} icon={<Sparkles size={14} />} label="AI" sub="Gemini · niche topics" onClick={() => selectQuestionSource('ai')} />
          </div>

          <div className="flex flex-wrap gap-1.5" data-tour="qb-lobby-category">
            {QB_LOBBY_CATEGORIES.map(c => <GlassPill key={c} active={source === 'qbreader' ? selectedCategories.includes(c) : category === c} onClick={() => selectCategory(c)}>{c}</GlassPill>)}
          </div>

          <div>
            <p className="text-[11px] font-bold uppercase tracking-[0.16em] text-white/40 mb-2">Question difficulty</p>
            <div className="grid grid-cols-4 gap-1.5">
              {[['easy', 'Easy'], ['medium', 'Medium'], ['hard', 'Hard'], ['tournament', 'Tournament']].map(([id, label]) => (
                <GlassPill key={id} active={difficulty === id} onClick={() => setDifficulty(id)}>{label}</GlassPill>
              ))}
            </div>
          </div>

          <div>
            <p className="text-[11px] font-bold uppercase tracking-[0.16em] text-white/40 mb-2">Scoring format</p>
            <div className="grid grid-cols-2 gap-1.5">
              {AI_LOBBY_SCORING_FORMATS.map(f => {
                const sel = scoringFormat.id === f.id;
                return (
                  <button key={f.id} onClick={() => setScoringFormat(f)}
                    className={`rounded-lg border p-2.5 text-left transition-all focus:outline-none ${
                      sel
                        ? 'bg-blue-500/[0.18] border-blue-400/[0.40]'
                        : 'bg-white/[0.02] border-white/[0.06] hover:border-white/[0.14] hover:bg-white/[0.05]'
                    }`}>
                    <div className={`text-[12px] font-semibold ${sel ? 'text-white' : 'text-white/80'}`}>{f.label}</div>
                  </button>
                );
              })}
            </div>
          </div>

          <div>
            <p className="text-[11px] font-bold uppercase tracking-[0.16em] text-white/40 mb-1.5">
              Topic <span className="normal-case tracking-normal text-white/20 font-normal text-[10px]">(optional)</span>
            </p>
            <input type="text" value={topic} onChange={e => setTopic(e.target.value)}
              placeholder="e.g. French Revolution, Thermodynamics, Shakespeare…"
              className="w-full px-3 py-2.5 rounded-lg border border-white/[0.08] bg-white/[0.03] text-[12px] text-white/80 placeholder-white/20 outline-none focus:border-blue-400/50 focus:ring-2 focus:ring-blue-400/20 transition-colors"
            />
          </div>

          {source === 'ai' && (
            <div>
              <p className="text-[11px] font-bold uppercase tracking-[0.16em] text-white/40 mb-1.5">
                Custom instructions <span className="normal-case tracking-normal text-white/20 font-normal text-[10px]">(optional)</span>
              </p>
              <textarea value={lobbyCustomInstr} onChange={e => setLobbyCustomInstr(e.target.value)}
                placeholder="e.g. Focus on 20th century events, avoid questions about leaders…"
                rows={2}
                className="w-full px-3 py-2.5 rounded-lg border border-white/[0.08] bg-white/[0.03] text-[12px] text-white/80 placeholder-white/20 resize-none outline-none focus:border-blue-400/50 focus:ring-2 focus:ring-blue-400/20 transition-colors"
              />
            </div>
          )}
        </>}

        {error && <p className="text-[11px] text-rose-400 px-3 py-2 rounded-lg bg-rose-500/10 border border-rose-500/20 text-center">{error}</p>}

        {/* ── Presets panel (AI modes only) ── */}
        {!(lobbyType === 'head-to-head' && h2hOpponent === 'real') && (
          <div className="rounded-lg border border-white/[0.07] bg-white/[0.02] p-3.5 space-y-2.5">
            <div className="flex items-center justify-between">
              <span className="text-[11px] font-bold uppercase tracking-[0.16em] text-white/40">Presets</span>
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
                  className="flex-1 px-2.5 py-1.5 rounded-lg border border-white/[0.10] bg-white/[0.05] text-[11px] text-white/80 placeholder-white/25 outline-none focus:border-blue-400/50 focus:ring-2 focus:ring-blue-400/20 transition-colors"
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
          <button onClick={startSession} data-tour="qb-enter-lobby"
            className="w-full py-3.5 rounded-lg text-white text-[14px] font-bold inline-flex items-center justify-center gap-2 transition-all border bg-blue-500 hover:bg-blue-400 border-blue-400/40">
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
// REPLAYS VIEW — full history browser: two tabs (Matches / Solo sets).
// Each row opens the corresponding replay.
// ============================================================
function ReplaysView({ sets, matchList, myUserId, onReplaySolo, onReplayMatch, onBack }) {
  // One chronological list: matches and solo sets interleaved, newest first.
  const items = [
    ...matchList.map(m => ({ kind: 'match', ts: new Date(m.finishedAt).getTime() || 0, rec: m })),
    ...sets.map(s => ({ kind: 'solo', ts: new Date(s.finishedAt).getTime() || 0, rec: s })),
  ].sort((a, b) => b.ts - a.ts);

  const matchRow = (m) => {
    const ago = formatRelative(Date.now() - new Date(m.finishedAt).getTime());
    const myScore = m.players?.find(p => p.userId === m.myUserId)?.finalScore ?? 0;
    const sortedP = [...(m.players || [])].sort((a, b) => (b.finalScore || 0) - (a.finalScore || 0));
    const myRank = sortedP.findIndex(p => p.userId === m.myUserId) + 1;
    const won = myRank === 1;
    const humanCount = (m.players || []).filter(p => !p.isBot).length;
    const totalCount = (m.players || []).length;
    return (
      <div key={`match-${m.id}`} onClick={() => onReplayMatch(m)}
        className="flex items-center gap-3 px-2 py-2.5 border-b border-white/[0.06] last:border-b-0 cursor-pointer hover:bg-white/[0.03] rounded-md transition-colors group">
        <div className={`min-w-[44px] text-center text-[12px] font-bold tabular-nums ${won ? 'text-amber-300' : 'text-white/35'}`}>
          #{myRank}
        </div>
        <div className="flex-1 min-w-0">
          <p className="text-[12px] font-medium text-white/85 truncate">
            {m.category} <span className="text-white/35 font-normal">· {m.difficulty}</span>
          </p>
          <p className="text-[10px] text-white/35 truncate">
            Match · {ago} · {m.questions?.length || 0}Q · {humanCount}v{totalCount - humanCount} · {myScore} pts · <span className="font-mono">{m.code}</span>
          </p>
        </div>
        <ChevronRight size={13} className="text-white/20 group-hover:text-white/55 flex-shrink-0 transition-colors" />
      </div>
    );
  };

  const soloRow = (s) => {
    const pct = s.total ? Math.round((s.score / s.total) * 100) : 0;
    const ago = formatRelative(Date.now() - new Date(s.finishedAt).getTime());
    const hasPoints = typeof s.points === 'number';
    const canReplay = s.perQuestion?.some(q => q.text);
    const scoreCls = pct >= 75 ? 'text-emerald-300'
      : pct >= 50 ? 'text-white/60'
      : 'text-rose-300';
    return (
      <div key={`solo-${s.id}`} onClick={canReplay ? () => onReplaySolo(s) : undefined}
        className={`flex items-center gap-3 px-2 py-2.5 border-b border-white/[0.06] last:border-b-0 rounded-md transition-colors group ${canReplay ? 'hover:bg-white/[0.03] cursor-pointer' : 'opacity-50 cursor-default'}`}>
        <div className={`text-[12px] font-bold tabular-nums min-w-[44px] text-center ${scoreCls}`}>
          {hasPoints ? `${s.points}` : `${s.score}/${s.total}`}
        </div>
        <div className="flex-1 min-w-0">
          <p className="text-[12px] font-medium text-white/85 truncate">
            {s.category} <span className="text-white/35 font-normal">· {s.difficulty}</span>
          </p>
          <p className="text-[10px] text-white/35">
            Solo · {ago} · {s.source === 'ai' ? 'AI' : 'QBReader'} · {pct}% · {formatDuration(s.durationMs)}
            {!canReplay && <span className="ml-1 text-white/25">(no text)</span>}
          </p>
        </div>
        {canReplay && <ChevronRight size={13} className="text-white/20 group-hover:text-white/55 flex-shrink-0 transition-colors" />}
      </div>
    );
  };

  return (
    <div className="h-full flex flex-col bg-transparent overflow-hidden">
      {/* Header */}
      <div className="flex items-center gap-3 px-4 py-2.5 border-b border-white/[0.04] flex-shrink-0">
        <button onClick={onBack}
          className="flex items-center gap-2 text-sm text-white/35 hover:text-white/60 transition-colors">
          <ArrowLeft size={16} /> Hub
        </button>
        <span className="text-lg font-bold text-white/90">Replays</span>
        <span className="text-[11px] text-white/25 tabular-nums ml-auto">{items.length}</span>
      </div>

      {/* Content */}
      <div className="flex-1 overflow-y-auto">
        {items.length === 0 ? (
          <div className="py-12 text-center">
            <History size={22} className="text-white/20 mx-auto mb-2" />
            <p className="text-[12px] font-semibold text-white/50">No replays yet</p>
            <p className="text-[11px] text-white/30 mt-1">Finish a solo set, an AI game, or a multiplayer match to record one.</p>
          </div>
        ) : (
          <div className="p-3 space-y-1.5">
            {items.map(item => item.kind === 'match' ? matchRow(item.rec) : soloRow(item.rec))}
          </div>
        )}
      </div>
    </div>
  );
}

// ============================================================
// MY SETS — the permanent archive of every solo set the player has
// finished. Rounds save themselves here automatically with their full
// question text, so nothing played is ever lost: browse, search, and
// filter the history, inspect any question with its buzz point and both
// answers, then re-play the set, drill only the misses, watch the
// replay, or copy it into the editable library.
// ============================================================

// Display name for a played set. Newer records carry a stored `title`
// (renameable); older ones derive a name from their generation context.
function playedSetTitle(s = {}) {
  if (s.title) return s.title;
  if (s.noteTitle) return s.noteTitle;
  const instr = String(s.customInstructions || '').replace(/^focus on:\s*/i, '').trim();
  if (instr) return instr.length > 70 ? `${instr.slice(0, 67)}...` : instr;
  return `${s.category || 'Mixed'} · ${s.difficulty || 'Medium'}`;
}

// Title stored with a freshly finished round. Only real context makes a
// title; plain category rounds stay blank and fall back at display time.
function autoPlayedSetTitle(ctx) {
  if (!ctx) return '';
  if (ctx.title) return String(ctx.title).slice(0, 140);
  if (ctx.noteTitle) return String(ctx.noteTitle).slice(0, 140);
  return String(ctx.customInstructions || '').replace(/^focus on:\s*/i, '').trim().slice(0, 140);
}

function timeBucketLabel(iso) {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return 'Earlier';
  const now = new Date();
  const dayStart = (t) => new Date(t.getFullYear(), t.getMonth(), t.getDate()).getTime();
  const days = Math.round((dayStart(now) - dayStart(d)) / 86400000);
  if (days <= 0) return 'Today';
  if (days === 1) return 'Yesterday';
  if (days < 7) return 'This week';
  if (d.getFullYear() === now.getFullYear() && d.getMonth() === now.getMonth()) return 'This month';
  return d.toLocaleDateString(undefined, { month: 'long', year: 'numeric' });
}

const MY_SETS_SORTS = [
  { key: 'newest', label: 'Newest first' },
  { key: 'oldest', label: 'Oldest first' },
  { key: 'best', label: 'Best score' },
  { key: 'worst', label: 'Lowest score' },
];

function MySetsView({ sets, loading, onBack, onOpen }) {
  const [query, setQuery] = useState('');
  const [sourceFilter, setSourceFilter] = useState('all');
  const [catFilter, setCatFilter] = useState('all');
  const [sort, setSort] = useState('newest');

  const categories = useMemo(() => {
    const seen = new Set(sets.map(s => s.category || 'Mixed'));
    return [...seen].sort((a, b) => a.localeCompare(b));
  }, [sets]);

  const agg = useMemo(() => {
    const totalQ = sets.reduce((n, s) => n + (s.total || 0), 0);
    const correct = sets.reduce((n, s) => n + (s.score || 0), 0);
    const pts = sets.reduce((n, s) => n + (typeof s.points === 'number' ? s.points : 0), 0);
    const ms = sets.reduce((n, s) => n + (s.durationMs || 0), 0);
    return {
      count: sets.length,
      totalQ,
      accuracy: totalQ ? Math.round((correct / totalQ) * 100) : 0,
      pts,
      ms,
    };
  }, [sets]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    const list = sets.filter(s => {
      if (sourceFilter !== 'all' && (s.source || 'qbreader') !== sourceFilter) return false;
      if (catFilter !== 'all' && (s.category || 'Mixed') !== catFilter) return false;
      if (!q) return true;
      // Answers are part of the haystack so "oxaloacetate" finds the set
      // that asked about it.
      const hay = [
        playedSetTitle(s), s.category, s.difficulty, s.noteTitle, s.customInstructions,
        ...(s.perQuestion || []).map(p => p.correctAnswer),
      ].filter(Boolean).join(' ').toLowerCase();
      return hay.includes(q);
    });
    const pct = (s) => (s.total ? (s.score || 0) / s.total : 0);
    const ts = (s) => new Date(s.finishedAt).getTime() || 0;
    if (sort === 'newest') list.sort((a, b) => ts(b) - ts(a));
    else if (sort === 'oldest') list.sort((a, b) => ts(a) - ts(b));
    else if (sort === 'best') list.sort((a, b) => pct(b) - pct(a) || ts(b) - ts(a));
    else if (sort === 'worst') list.sort((a, b) => pct(a) - pct(b) || ts(b) - ts(a));
    return list;
  }, [sets, query, sourceFilter, catFilter, sort]);

  // Chronological browsing gets date shelf labels; score sorts stay flat.
  const groups = useMemo(() => {
    if (sort === 'best' || sort === 'worst') return [{ label: null, items: filtered }];
    const out = [];
    for (const s of filtered) {
      const label = timeBucketLabel(s.finishedAt);
      const last = out[out.length - 1];
      if (last && last.label === label) last.items.push(s);
      else out.push({ label, items: [s] });
    }
    return out;
  }, [filtered, sort]);

  const sourceChip = (key, label) => (
    <button key={key} onClick={() => setSourceFilter(key)}
      className={`px-2.5 py-1.5 rounded-lg border text-[11px] font-semibold transition-colors ${sourceFilter === key
        ? 'border-blue-400/40 bg-blue-500/15 text-blue-200'
        : 'border-white/[0.08] bg-white/[0.03] text-white/50 hover:bg-white/[0.06] hover:text-white/75'}`}>
      {label}
    </button>
  );

  return (
    <div className="h-full flex flex-col bg-transparent min-h-0">
      <div className="flex items-center gap-3 px-5 py-3 border-b border-white/[0.06] flex-shrink-0">
        <button onClick={onBack} className="flex items-center gap-1.5 text-sm text-white/40 hover:text-white/75 transition-colors"><ArrowLeft size={15} /> Hub</button>
        <div className="min-w-0">
          <h2 className="text-[15px] font-bold text-white/90">My sets</h2>
          <p className="text-[10px] text-white/35">Every set you have played, kept automatically</p>
        </div>
        <span className="ml-auto text-[11px] text-white/25 tabular-nums">{filtered.length === agg.count ? agg.count : `${filtered.length} of ${agg.count}`}</span>
      </div>

      <div className="px-5 pt-4 flex-shrink-0 space-y-2.5">
        {/* Lifetime rollup across the whole archive */}
        <div className="grid grid-cols-5 gap-2">
          <HubStat label="Sets" value={agg.count} />
          <HubStat label="Questions" value={agg.totalQ} />
          <HubStat label="Accuracy" value={`${agg.accuracy}%`} accent={agg.accuracy >= 75 ? 'emerald' : agg.accuracy >= 50 ? 'amber' : 'rose'} />
          <HubStat label="Points" value={agg.pts} />
          <HubStat label="Play time" value={formatDuration(agg.ms)} />
        </div>

        <div className="relative">
          <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-white/25" />
          <input value={query} onChange={e => setQuery(e.target.value)} placeholder="Search titles, topics, or answers"
            className="w-full rounded-lg border border-white/[0.08] bg-white/[0.04] py-2 pl-9 pr-3 text-[13px] text-white/85 placeholder-white/25 outline-none focus:border-blue-400/50 focus:ring-2 focus:ring-blue-400/15" />
        </div>

        <div className="flex items-center gap-1.5 flex-wrap">
          {sourceChip('all', 'All')}
          {sourceChip('ai', 'AI generated')}
          {sourceChip('qbreader', 'QBReader')}
          <select value={catFilter} onChange={e => setCatFilter(e.target.value)}
            className="ml-auto rounded-lg border border-white/[0.08] bg-[#1b1b1b] px-2 py-1.5 text-[11px] font-medium text-white/70 outline-none focus:border-blue-400/50">
            <option value="all">All categories</option>
            {categories.map(c => <option key={c} value={c}>{c}</option>)}
          </select>
          <select value={sort} onChange={e => setSort(e.target.value)}
            className="rounded-lg border border-white/[0.08] bg-[#1b1b1b] px-2 py-1.5 text-[11px] font-medium text-white/70 outline-none focus:border-blue-400/50">
            {MY_SETS_SORTS.map(s => <option key={s.key} value={s.key}>{s.label}</option>)}
          </select>
        </div>
      </div>

      <div className="flex-1 min-h-0 overflow-y-auto px-5 py-4">
        {loading ? (
          <div className="py-12 flex justify-center"><Loader2 size={20} className="animate-spin text-white/35" /></div>
        ) : agg.count === 0 ? (
          <div className="rounded-xl border border-dashed border-white/[0.12] bg-white/[0.02] p-8 text-center">
            <Layers size={22} className="mx-auto mb-2 text-white/25" />
            <p className="text-[13px] font-semibold text-white/70">Nothing here yet</p>
            <p className="mt-1 text-[11px] text-white/35">Finish any solo round and it lands here automatically, questions and all.</p>
          </div>
        ) : filtered.length === 0 ? (
          <p className="py-10 text-center text-[12px] text-white/35">No sets match that search.</p>
        ) : (
          <div className="space-y-4">
            {groups.map((group, gi) => (
              <section key={group.label || `flat-${gi}`}>
                {group.label && (
                  <p className="mb-1 px-1 text-[11px] font-bold uppercase tracking-[0.16em] text-white/35">
                    {group.label} <span className="font-normal text-white/20">· {group.items.length}</span>
                  </p>
                )}
                <div className="space-y-0.5">
                  {group.items.map(s => <PlayedSetRow key={s.id} set={s} onOpen={() => onOpen(s)} />)}
                </div>
              </section>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

function PlayedSetRow({ set: s, onOpen }) {
  const pct = s.total ? Math.round(((s.score || 0) / s.total) * 100) : 0;
  const ago = formatRelative(Date.now() - new Date(s.finishedAt).getTime());
  const hasPoints = typeof s.points === 'number';
  const hasText = (s.perQuestion || []).some(q => q.text);
  const scoreCls = pct >= 75 ? 'text-emerald-300 bg-emerald-500/10 border-emerald-500/25'
    : pct >= 50 ? 'text-white/80 bg-white/[0.06] border-white/[0.12]'
    : 'text-rose-300 bg-rose-500/10 border-rose-500/25';
  return (
    <button onClick={onOpen}
      className="w-full flex items-center gap-3 px-2 py-2.5 border-b border-white/[0.06] last:border-b-0 text-left hover:bg-white/[0.03] rounded-md transition-colors group">
      <div className={`min-w-[52px] px-2 py-1 rounded-md border text-center text-[11px] font-bold tabular-nums ${scoreCls}`}>
        {hasPoints ? `${s.points} pts` : `${s.score}/${s.total}`}
      </div>
      <div className="flex-1 min-w-0">
        <p className="text-[12px] font-medium text-white/85 truncate">{playedSetTitle(s)}</p>
        <p className="text-[10px] text-white/35 truncate">
          {ago} · {s.source === 'ai' ? 'AI' : 'QBReader'} · {s.category || 'Mixed'} · {s.difficulty || 'Medium'} · {s.score}/{s.total} correct · {formatDuration(s.durationMs)}
          {!hasText && ' · results only'}
        </p>
      </div>
      <span className={`text-[11px] font-bold tabular-nums ${pct >= 75 ? 'text-emerald-300/80' : pct >= 50 ? 'text-white/40' : 'text-rose-300/80'}`}>{pct}%</span>
      <ChevronRight size={13} className="text-white/20 group-hover:text-white/55 flex-shrink-0 transition-colors" />
    </button>
  );
}

// Full tossup text with the player's buzz point pinned into the prose.
// Words inside the power window read slightly brighter.
function BuzzText({ text, buzzWord, powerWordIndex }) {
  const words = useMemo(() => String(text || '').split(/\s+/).filter(Boolean), [text]);
  if (!words.length) return null;
  return (
    <p className="text-[12px] leading-relaxed text-white/70">
      {words.map((w, i) => (
        <span key={i} className={powerWordIndex != null && i <= powerWordIndex ? 'text-white/85' : undefined}>
          {w}
          {i === buzzWord && (
            <span className="mx-1 inline-flex items-center rounded border border-blue-400/35 bg-blue-500/15 px-1 py-px align-middle text-[8px] font-bold uppercase tracking-wide text-blue-200">Buzz</span>
          )}
          {' '}
        </span>
      ))}
    </p>
  );
}

function PlayedSetDetail({ set: s, onBack, onPlayAgain, onPracticeMissed, onWatchReplay, onSaveToEditor, onRename, onDelete }) {
  const [renaming, setRenaming] = useState(false);
  const [titleDraft, setTitleDraft] = useState('');
  const [openIdx, setOpenIdx] = useState(() => new Set());
  const [allOpen, setAllOpen] = useState(false);

  const pq = s.perQuestion || [];
  const playable = pq.filter(q => String(q.text || '').trim() && String(q.correctAnswer || '').trim());
  const missed = playable.filter(q => !q.correct);
  const pct = s.total ? Math.round(((s.score || 0) / s.total) * 100) : 0;
  const hasPoints = typeof s.points === 'number';
  const powers = pq.filter(q => (q.points || 0) > 10).length;
  const negs = pq.filter(q => (q.points || 0) < 0).length;
  const buzzedQs = pq.filter(q => q.buzzWord >= 0 && q.totalWords > 0);
  const avgHeard = buzzedQs.length
    ? Math.round((buzzedQs.reduce((n, q) => n + q.buzzWord / q.totalWords, 0) / buzzedQs.length) * 100)
    : null;
  const played = new Date(s.finishedAt);

  function toggle(i) {
    setOpenIdx(prev => {
      const next = new Set(prev);
      if (next.has(i)) next.delete(i); else next.add(i);
      return next;
    });
  }
  function toggleAll() {
    setAllOpen(v => !v);
    setOpenIdx(allOpen ? new Set() : new Set(pq.map((_, i) => i)));
  }
  function commitRename() {
    setRenaming(false);
    const next = titleDraft.trim();
    if (next && next !== playedSetTitle(s)) onRename(next);
  }

  const actionBtn = 'inline-flex items-center gap-1.5 rounded-lg border border-white/[0.10] bg-white/[0.03] px-2.5 py-1.5 text-[11px] font-semibold text-white/65 hover:bg-white/[0.08] hover:text-white transition-colors disabled:opacity-40 disabled:pointer-events-none';

  return (
    <div className="h-full flex flex-col bg-transparent min-h-0">
      <div className="flex items-center gap-3 px-5 py-3 border-b border-white/[0.06] flex-shrink-0">
        <button onClick={onBack} className="flex items-center gap-1.5 text-sm text-white/40 hover:text-white/75 transition-colors"><ArrowLeft size={15} /> My sets</button>
        <button onClick={onDelete} aria-label="Delete this set" className="ml-auto rounded-md p-1.5 text-white/25 hover:bg-rose-500/10 hover:text-rose-300 transition-colors"><Trash2 size={14} /></button>
      </div>

      <div className="flex-1 min-h-0 overflow-y-auto p-5 space-y-4">
        <div>
          {renaming ? (
            <div className="flex items-center gap-2">
              <input autoFocus value={titleDraft} onChange={e => setTitleDraft(e.target.value)}
                onKeyDown={e => { if (e.key === 'Enter') commitRename(); if (e.key === 'Escape') setRenaming(false); }}
                className="min-w-0 flex-1 rounded-lg border border-white/[0.10] bg-white/[0.04] px-3 py-1.5 text-[17px] font-bold text-white/90 outline-none focus:border-blue-400/50" />
              <button onClick={commitRename} className="rounded-lg bg-blue-500 px-2.5 py-1.5 text-[11px] font-semibold text-white hover:bg-blue-400">Save</button>
            </div>
          ) : (
            <div className="flex items-center gap-2 min-w-0">
              <h2 className="text-[19px] font-bold text-white/90 truncate">{playedSetTitle(s)}</h2>
              <button onClick={() => { setTitleDraft(playedSetTitle(s)); setRenaming(true); }} aria-label="Rename set"
                className="rounded-md p-1 text-white/25 hover:bg-white/[0.06] hover:text-white/70 transition-colors flex-shrink-0"><Pencil size={13} /></button>
            </div>
          )}
          <p className="mt-1 text-[11px] text-white/40">
            {played.toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric', year: 'numeric' })} at {played.toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' })}
            {' '}· {s.source === 'ai' ? 'AI generated' : 'QBReader'} · {s.category || 'Mixed'} · {s.difficulty || 'Medium'} · {formatDuration(s.durationMs)}
          </p>
        </div>

        <div className="grid grid-cols-4 gap-2">
          <HubStat label="Score" value={hasPoints ? `${s.points} pts` : `${s.score}/${s.total}`} />
          <HubStat label="Correct" value={`${s.score}/${s.total}`} accent={pct >= 75 ? 'emerald' : pct >= 50 ? 'amber' : 'rose'} />
          <HubStat label={hasPoints ? 'Powers / negs' : 'Accuracy'} value={hasPoints ? `${powers} / ${negs}` : `${pct}%`} />
          <HubStat label="Avg heard" value={avgHeard == null ? 'n/a' : `${avgHeard}%`} />
        </div>

        <div className="flex items-center gap-2 flex-wrap">
          <button onClick={onPlayAgain} disabled={!playable.length}
            className="inline-flex items-center gap-1.5 rounded-lg bg-blue-500 px-3 py-1.5 text-[12px] font-semibold text-white hover:bg-blue-400 transition-colors disabled:opacity-40 disabled:pointer-events-none">
            <RotateCcw size={13} /> Play again
          </button>
          <button onClick={onPracticeMissed} disabled={!missed.length} className={actionBtn}>
            <ListChecks size={13} /> Practice missed{missed.length ? ` (${missed.length})` : ''}
          </button>
          <button onClick={onWatchReplay} disabled={!playable.length} className={actionBtn}>
            <Eye size={13} /> Watch replay
          </button>
          <button onClick={onSaveToEditor} disabled={!pq.some(q => String(q.text || '').trim())} className={actionBtn}>
            <Save size={13} /> Edit a copy
          </button>
        </div>
        {!playable.length && (
          <p className="text-[11px] text-white/35">This round was played before full question storage, so only its results are kept.</p>
        )}

        {pq.length > 0 && (
          <div>
            <div className="flex items-center justify-between mb-1.5">
              <p className="text-[11px] font-bold uppercase tracking-[0.16em] text-white/40">Questions <span className="font-normal tracking-normal text-white/25">· {pq.length}</span></p>
              <button onClick={toggleAll} className="text-[10px] text-white/30 hover:text-white/60 transition-colors">{allOpen ? 'Collapse all' : 'Expand all'}</button>
            </div>
            <div className="space-y-2">
              {pq.map((q, i) => {
                const open = openIdx.has(i);
                const heardPct = q.buzzWord >= 0 && q.totalWords > 0 ? Math.round((q.buzzWord / q.totalWords) * 100) : null;
                const ptsCls = (q.points || 0) > 10 ? 'text-amber-300 border-amber-400/30 bg-amber-500/10'
                  : (q.points || 0) > 0 ? 'text-emerald-300 border-emerald-500/25 bg-emerald-500/10'
                  : (q.points || 0) < 0 ? 'text-rose-300 border-rose-500/25 bg-rose-500/10'
                  : 'text-white/40 border-white/[0.10] bg-white/[0.04]';
                return (
                  <div key={i} className="rounded-xl border border-white/[0.08] bg-white/[0.03]">
                    <button onClick={() => toggle(i)} className="w-full flex items-center gap-2.5 p-3 text-left">
                      {q.correct
                        ? <Check size={14} className="text-emerald-300 flex-shrink-0" />
                        : <X size={14} className="text-rose-300 flex-shrink-0" />}
                      <span className="text-[10px] font-bold text-white/35 flex-shrink-0">Q{i + 1}</span>
                      <span className="min-w-0 flex-1 truncate text-[12px] text-white/70">{q.correctAnswer || q.text || 'Untitled question'}</span>
                      {typeof q.points === 'number' && (
                        <span className={`rounded-md border px-1.5 py-0.5 text-[10px] font-bold tabular-nums flex-shrink-0 ${ptsCls}`}>{q.points > 0 ? `+${q.points}` : q.points}</span>
                      )}
                      <ChevronRight size={13} className={`text-white/25 flex-shrink-0 transition-transform ${open ? 'rotate-90' : ''}`} />
                    </button>
                    {open && (
                      <div className="px-3 pb-3 space-y-2 border-t border-white/[0.06] pt-2.5">
                        {q.text
                          ? <BuzzText text={q.text} buzzWord={q.buzzWord} powerWordIndex={q.powerWordIndex} />
                          : <p className="text-[11px] text-white/35">Question text was not stored for this round.</p>}
                        <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-[11px]">
                          <span className="text-white/45">Answer: <span className="font-semibold text-white/85">{q.correctAnswer || 'unknown'}</span></span>
                          {q.answer && <span className="text-white/45">You said: <span className={`font-semibold ${q.correct ? 'text-emerald-300' : 'text-rose-300'}`}>{q.answer}</span></span>}
                          <span className="text-white/30">
                            {heardPct == null ? 'No buzz' : `Buzzed ${heardPct}% in`}
                            {q.category ? ` · ${q.category}` : ''}
                          </span>
                        </div>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

// ============================================================
// MATCH REPLAY VIEW — plays a saved match back through the same layout
// as the live match screen (PlayingView): word-by-word reveal, the
// PlayerCard sidebar scoreboard, and an action bar that re-enacts each
// buzz in order. A wrong buzz locks that player out and the reading
// continues, exactly like the real game, until someone gets it (or
// nobody does). Scores accumulate per buzz so the scoreboard moves the
// way it did live.
// ============================================================
const REPLAY_WORD_MS = 110;
const REPLAY_BUZZ_PAUSE_MS = 1100;
const REPLAY_WRONG_PAUSE_MS = 1600;

function MatchReplayView({ rec, myUserId, onExit }) {
  const [qIdx, setQIdx] = useState(0);
  const [revealedUpTo, setRevealedUpTo] = useState(-1);
  const [buzzPtr, setBuzzPtr] = useState(0);      // next buzz event to play
  const [stage, setStage] = useState('reading');  // reading | buzzing | wrong | done

  const totalQ = rec?.questions?.length || 0;
  const q = rec?.questions?.[qIdx] || null;
  const words = useMemo(() => (q?.text ? q.text.split(/\s+/).filter(Boolean) : []), [q?.text]);

  // Buzz events in the order they happened (the record is chronological —
  // a correct buzz always ends the question). Clamp buzz words into range
  // so a malformed record can't stall the playback.
  const buzzes = useMemo(() => (q?.buzzes || []).map(b => ({
    ...b,
    buzzWord: typeof b.buzzWord === 'number' && b.buzzWord >= 0
      ? Math.min(b.buzzWord, Math.max(0, words.length - 1))
      : 0,
  })), [q, words.length]);
  const winnerIdx = buzzes.findIndex(b => b.correct);
  const winner = winnerIdx >= 0 ? buzzes[winnerIdx] : null;

  // Read-aloud (shared Quiz Bowl audio option): TTS reads the tossup and
  // drives the reveal; the stage machine still pauses playback at each
  // recorded buzz, which pauses the speech in place.
  const [voiceMode, toggleVoiceMode] = useQbVoicePref();
  const voiceOn = voiceMode && speechSynthesisSupported;
  const spoken = useSpokenReveal(q?.text || '', voiceOn && words.length > 0 && stage !== 'done', stage !== 'reading');
  useEffect(() => {
    if (!voiceOn) return;
    setRevealedUpTo(prev => Math.max(prev, spoken.wordIndex));
  }, [spoken.wordIndex, voiceOn]); // eslint-disable-line react-hooks/exhaustive-deps
  const verdictQRef = useRef(-1);
  useEffect(() => {
    if (!voiceOn || stage !== 'done' || !q || verdictQRef.current === qIdx) return;
    verdictQRef.current = qIdx;
    const who = winner ? (winner.userId === myUserId ? 'You' : winner.name) : null;
    speakLine(`${who ? `${who} got it. ` : 'No one got it. '}The answer was ${spokenAnswer(q.answer)}.`);
  }, [stage, voiceOn]); // eslint-disable-line react-hooks/exhaustive-deps

  // Reset playback whenever the question changes.
  useEffect(() => {
    setRevealedUpTo(-1);
    setBuzzPtr(0);
    setStage(words.length ? 'reading' : 'done');
  }, [qIdx]); // eslint-disable-line react-hooks/exhaustive-deps

  // Reveal words while reading (read-aloud reveals from speech instead).
  useEffect(() => {
    if (voiceOn || stage !== 'reading' || !words.length) return;
    const id = setInterval(() => {
      setRevealedUpTo(prev => Math.min(prev + 1, words.length - 1));
    }, REPLAY_WORD_MS);
    return () => clearInterval(id);
  }, [stage, qIdx, words.length, voiceOn]);

  // Pause when the reveal reaches the next buzz; finish when the text runs
  // out with nobody left to buzz.
  useEffect(() => {
    if (stage !== 'reading' || !words.length) return;
    const nb = buzzes[buzzPtr];
    if (nb && revealedUpTo >= nb.buzzWord) setStage('buzzing');
    else if (!nb && revealedUpTo >= words.length - 1) setStage('done');
  }, [stage, revealedUpTo, buzzPtr, buzzes, words.length]);

  // Resolve the active buzz: correct ends the question, wrong flashes and
  // the reading resumes for everyone still in.
  useEffect(() => {
    if (stage === 'buzzing') {
      const id = setTimeout(() => setStage(buzzes[buzzPtr]?.correct ? 'done' : 'wrong'), REPLAY_BUZZ_PAUSE_MS);
      return () => clearTimeout(id);
    }
    if (stage === 'wrong') {
      const id = setTimeout(() => { setBuzzPtr(p => p + 1); setStage('reading'); }, REPLAY_WRONG_PAUSE_MS);
      return () => clearTimeout(id);
    }
  }, [stage, buzzPtr, buzzes]);

  // Buzzes the playback has resolved so far. During 'buzzing' the active
  // buzz hasn't landed yet (status shows "Answering…", no points); during
  // 'wrong' it has. 'done' shows everything up to the winning buzz.
  const playedCount = stage === 'done'
    ? (winnerIdx >= 0 ? winnerIdx + 1 : buzzes.length)
    : stage === 'wrong' ? buzzPtr + 1
    : buzzPtr;
  const playedBuzzes = buzzes.slice(0, playedCount);
  const activeBuzz = (stage === 'buzzing' || stage === 'wrong') ? buzzes[buzzPtr] : null;

  function skipAhead() {
    if (stage === 'done') {
      setRevealedUpTo(words.length - 1); // reveal the rest of the question
      return;
    }
    setRevealedUpTo(winner ? winner.buzzWord : Math.max(0, words.length - 1));
    setStage('done');
  }
  function goNext() {
    if (qIdx < totalQ - 1) setQIdx(i => i + 1); else onExit();
  }
  function goPrev() {
    if (qIdx > 0) setQIdx(i => i - 1);
  }

  useEffect(() => {
    function onKey(e) {
      if (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA') return;
      if (e.key === ' ') { e.preventDefault(); if (stage !== 'done') skipAhead(); else goNext(); }
      else if (e.key === 'ArrowRight') goNext();
      else if (e.key === 'ArrowLeft') goPrev();
    }
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [stage, qIdx, totalQ, winnerIdx]); // eslint-disable-line react-hooks/exhaustive-deps

  // Running scores: everything from earlier questions plus the buzzes this
  // playback has resolved so far.
  const scores = useMemo(() => {
    const s = {};
    for (const p of rec?.players || []) s[p.userId] = 0;
    for (let i = 0; i < qIdx; i++) {
      for (const b of rec?.questions?.[i]?.buzzes || []) s[b.userId] = (s[b.userId] || 0) + (b.points || 0);
    }
    for (const b of playedBuzzes) s[b.userId] = (s[b.userId] || 0) + (b.points || 0);
    return s;
  }, [rec, qIdx, playedCount]); // eslint-disable-line react-hooks/exhaustive-deps

  const players = (rec?.players || []).map(p => ({ ...p, score: scores[p.userId] || 0 }));
  const maxScore = Math.max(1, ...players.map(p => p.score || 0));
  const myScore = scores[myUserId] || 0;
  const lockedOutIds = playedBuzzes.filter(b => !b.correct).map(b => b.userId);
  const cardBuzz = stage === 'buzzing' && activeBuzz ? { userId: activeBuzz.userId } : null;
  const cardResult = stage === 'done' && winner ? { userId: winner.userId, correct: true } : null;

  // Word index → marker for buzzes the playback has shown (amber while
  // answering, then green/red) so you can see exactly where each buzz landed.
  const markerMap = {};
  const visibleCount = stage === 'buzzing' ? buzzPtr + 1 : playedCount;
  buzzes.slice(0, visibleCount).forEach((b, bi) => {
    const pending = stage === 'buzzing' && bi === buzzPtr;
    const cur = markerMap[b.buzzWord];
    markerMap[b.buzzWord] = {
      correct: cur?.correct || (!pending && b.correct),
      pending: cur?.pending || pending,
      label: [cur?.label, `${b.userId === myUserId ? 'You' : b.name}${pending ? '' : b.correct ? ' ✓' : ' ✗'}`].filter(Boolean).join(', '),
    };
  });

  const ago = rec?.finishedAt ? formatRelative(Date.now() - new Date(rec.finishedAt).getTime()) : '';
  const progressPct = words.length ? Math.min(100, ((revealedUpTo + 1) / words.length) * 100) : 0;
  const resultMeta = winner
    ? `${winner.userId === myUserId ? 'You' : winner.name} got it · word ${winner.buzzWord + 1}/${words.length || winner.totalWords}${typeof winner.points === 'number' && winner.points ? ` · +${winner.points}` : ''}`
    : 'No one got it';

  return (
    <div className="flex flex-col h-full min-h-0 bg-transparent overflow-hidden">
      {/* Header — same shape as the live match header */}
      <div className="flex items-center gap-2 px-4 py-2.5 border-b border-white/[0.04] flex-shrink-0">
        <button onClick={onExit}
          className="flex items-center gap-2 text-sm text-white/35 hover:text-white/60 transition-colors flex-shrink-0">
          <ArrowLeft size={16} /> Back
        </button>
        <Zap size={14} className="text-white/50 flex-shrink-0" />
        <span className="text-[13px] font-bold text-white tabular-nums">Q{qIdx + 1}/{totalQ}</span>
        <span className="text-[9px] font-bold uppercase tracking-wider px-1.5 py-0.5 rounded-full bg-white/[0.08] text-white/50">
          Replay
        </span>
        <span className="text-[11px] text-white/35 truncate">{rec?.category} · {rec?.difficulty} · {ago}</span>
        <div className="flex-1" />
        <span className={`text-[12px] font-bold tabular-nums ${myScore > 0 ? 'text-emerald-400' : 'text-white/40'}`}>
          {myScore}
        </span>
        <QbVoiceToggle on={voiceMode} onToggle={toggleVoiceMode} />
      </div>

      <div className="flex flex-1 min-h-0">
        {/* Question + action bar */}
        <div className="flex-1 flex flex-col min-h-0 min-w-0">
          <div className="flex-1 overflow-y-auto overflow-x-hidden p-5 cursor-pointer" onClick={skipAhead}>
            <div className="min-h-[120px]">
              {words.length > 0 ? (
                <p className="text-[15px] leading-relaxed text-white/90 font-light break-words">
                  {words.slice(0, revealedUpTo + 1).map((w, i) => {
                    const mk = markerMap[i];
                    const isPower = q?.powerWordIndex != null && i === q.powerWordIndex;
                    const cls = mk
                      ? `${mk.pending ? 'text-amber-300' : mk.correct ? 'text-emerald-300' : 'text-rose-300'} font-medium underline decoration-dotted underline-offset-2`
                      : isPower ? 'text-amber-300/80' : '';
                    return (
                      <span key={i} className={cls || undefined} title={mk?.label}>{w}{' '}</span>
                    );
                  })}
                  {stage === 'reading' && revealedUpTo < words.length - 1 && (
                    <span className="inline-block w-0.5 h-4 bg-white/30 animate-pulse ml-1 align-middle rounded-sm" />
                  )}
                </p>
              ) : (
                <p className="text-[12px] text-white/30 italic">No question text recorded.</p>
              )}
              {stage !== 'done' ? (
                <p className="text-[10px] text-white/25 mt-4 italic">Click to skip ahead · Space</p>
              ) : revealedUpTo < words.length - 1 ? (
                <p className="text-[10px] text-white/25 mt-4 italic">Click to reveal the rest</p>
              ) : null}
            </div>
          </div>

          {/* Action bar — where the live BUZZ button sits */}
          <div className="px-4 py-3 border-t border-white/[0.04] flex-shrink-0 space-y-2">
            {stage === 'reading' && (
              <div className="w-full py-3 rounded-lg border border-white/[0.05] bg-white/[0.02] text-center text-[11px] text-white/30">
                Replaying…
              </div>
            )}
            {stage === 'buzzing' && activeBuzz && (
              <div className="w-full py-3 rounded-lg border border-white/[0.05] bg-white/[0.02] text-center text-[11px] text-white/30 inline-flex items-center justify-center gap-2">
                <span className="relative flex h-2 w-2">
                  <span className="absolute inline-flex h-full w-full rounded-full bg-amber-400/50 animate-ping" />
                  <span className="relative inline-flex rounded-full h-2 w-2 bg-amber-500/50" />
                </span>
                {activeBuzz.userId === myUserId ? 'You' : activeBuzz.name} buzzed at word {activeBuzz.buzzWord + 1} — answering…
              </div>
            )}
            {stage === 'wrong' && activeBuzz && (
              <div className="px-3 py-1.5 rounded-lg bg-rose-500/[0.08] border border-rose-500/15 text-[11px] text-rose-400/70 text-center">
                {activeBuzz.userId === myUserId ? 'You were wrong' : `${activeBuzz.name} was wrong`}
                {activeBuzz.answer ? ` — "${activeBuzz.answer}"` : ''}
                {typeof activeBuzz.points === 'number' && activeBuzz.points < 0 ? ` · ${activeBuzz.points}` : ''} · continues
              </div>
            )}
            {stage === 'done' && (
              <>
                {playedBuzzes.length > 0 && (
                  <div className="flex flex-wrap gap-1.5">
                    {playedBuzzes.map((b, i) => (
                      <span key={i} className={`inline-flex items-center gap-1 px-2 py-1 rounded-lg border text-[10px] ${
                        b.correct
                          ? 'border-emerald-500/25 bg-emerald-500/[0.06] text-emerald-300/80'
                          : 'border-rose-500/25 bg-rose-500/[0.06] text-rose-300/80'
                      }`}>
                        {b.correct ? <Check size={10} /> : <X size={10} />}
                        <span className="font-semibold">{b.userId === myUserId ? 'You' : b.name}</span>
                        <span className="opacity-60">word {b.buzzWord + 1}</span>
                        {b.answer && <span className="opacity-60">"{b.answer}"</span>}
                        {typeof b.points === 'number' && b.points !== 0 && (
                          <span className="font-bold">{b.points > 0 ? `+${b.points}` : b.points}</span>
                        )}
                      </span>
                    ))}
                  </div>
                )}
                <AnswerResultPanel
                  correct={winner ? true : null}
                  officialAnswer={q?.answer}
                  meta={resultMeta}
                />
              </>
            )}
            <div className="flex gap-2">
              <button onClick={goPrev} disabled={qIdx === 0}
                className="flex-1 py-2.5 rounded-lg border border-white/[0.06] bg-white/[0.03] text-[12px] font-semibold text-white/50 hover:text-white/70 disabled:opacity-25 transition-colors">
                ← Prev
              </button>
              <button onClick={goNext}
                className="flex-1 py-2.5 rounded-lg border border-white/[0.06] bg-white/[0.03] text-[12px] font-semibold text-white/50 hover:text-white/70 transition-colors">
                {qIdx < totalQ - 1 ? 'Next →' : 'Done'}
              </button>
            </div>
          </div>
        </div>

        {/* Sidebar — identical PlayerCard scoreboard to the live game */}
        <div className="w-44 flex-shrink-0 border-l border-white/[0.04] p-3 flex flex-col gap-1.5 overflow-y-auto">
          <div className="flex items-center gap-1.5 mb-1 flex-shrink-0">
            <Users size={11} className="text-white/25" />
            <span className="text-[10px] font-semibold uppercase tracking-wider text-white/25">
              Match · {players.length}P
            </span>
          </div>
          {players.map(p => (
            <PlayerCard
              key={p.userId}
              player={p}
              isMe={p.userId === myUserId}
              buzz={cardBuzz}
              lockedOut={lockedOutIds}
              answerResult={cardResult}
              maxScore={maxScore}
            />
          ))}
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

  // Read-aloud (shared Quiz Bowl audio option): TTS reads the question up to
  // the recorded buzz word and the reveal follows the speech.
  const [voiceMode, toggleVoiceMode] = useQbVoicePref();
  const voiceOn = voiceMode && speechSynthesisSupported;
  const spokenText = useMemo(() => words.slice(0, stopAt + 1).join(' '), [q?.text, stopAt]); // eslint-disable-line react-hooks/exhaustive-deps
  const spoken = useSpokenReveal(spokenText, voiceOn && !showResult && words.length > 0, false);
  useEffect(() => {
    if (!voiceOn) return;
    setRevealedUpTo(prev => Math.max(prev, Math.min(spoken.wordIndex, stopAtRef.current)));
  }, [spoken.wordIndex, voiceOn]);

  // Reset playback whenever the question changes.
  useEffect(() => {
    clearInterval(timerRef.current);
    clearTimeout(showResultTimerRef.current);
    setRevealedUpTo(-1);
    setShowResult(false);
    if (!wordsRef.current.length) setShowResult(true);
  }, [qIdx]);

  // Timed reveal (read-aloud reveals from speech instead).
  useEffect(() => {
    if (voiceOn || showResult || !words.length) return;
    timerRef.current = setInterval(() => {
      setRevealedUpTo(prev => Math.min(prev + 1, stopAtRef.current));
    }, 120);
    return () => clearInterval(timerRef.current);
  }, [qIdx, voiceOn, showResult, words.length]); // eslint-disable-line react-hooks/exhaustive-deps

  // Show the result once the reveal reaches the buzz word, whichever
  // driver got it there.
  useEffect(() => {
    if (showResult || !words.length) return;
    if (revealedUpTo >= stopAt) {
      showResultTimerRef.current = setTimeout(() => setShowResult(true), 450);
      return () => clearTimeout(showResultTimerRef.current);
    }
  }, [revealedUpTo, stopAt, showResult, words.length]);

  // Speak the recorded outcome once per question.
  const verdictQRef = useRef(-1);
  useEffect(() => {
    if (!voiceOn || !showResult || !q || verdictQRef.current === qIdx) return;
    verdictQRef.current = qIdx;
    speakLine(`${q.correct ? 'You got it. ' : ''}The answer was ${spokenAnswer(q.correctAnswer)}.`);
  }, [showResult, voiceOn]); // eslint-disable-line react-hooks/exhaustive-deps

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
      {/* Header — same shape as the match replay header */}
      <div className="flex items-center gap-2 px-4 py-2.5 border-b border-white/[0.04] flex-shrink-0">
        <button onClick={onExit}
          className="flex items-center gap-2 text-sm text-white/35 hover:text-white/60 transition-colors flex-shrink-0">
          <ArrowLeft size={16} /> Back
        </button>
        <Zap size={14} className="text-white/50 flex-shrink-0" />
        <span className="text-[13px] font-bold text-white tabular-nums">Q{qIdx + 1}/{totalQ}</span>
        <span className="text-[9px] font-bold uppercase tracking-wider px-1.5 py-0.5 rounded-full bg-white/[0.08] text-white/50">
          Replay
        </span>
        <span className="text-[11px] text-white/35 truncate">{set?.category} · {set?.difficulty}</span>
        <div className="flex-1" />
        <QbVoiceToggle on={voiceMode} onToggle={toggleVoiceMode} />
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
      <div className="flex-1 overflow-y-auto overflow-x-hidden p-4 space-y-3">
        {/* Question text with animated reveal */}
        {words.length > 0 ? (
          <div
            onClick={!showResult ? skipToResult : undefined}
            className={`rounded-lg border border-white/[0.08] bg-white/[0.03] p-4 leading-relaxed break-words ${!showResult ? 'cursor-pointer' : ''}`}
          >
            {words.map((w, i) => {
              const isRevealed = i <= revealedUpTo;
              const isBuzzWord = showResult && q?.buzzWord >= 0 && i === q.buzzWord;
              const isPowerMark = q?.powerWordIndex != null && i === q.powerWordIndex;
              return (
                <span
                  key={i}
                  className={[
                    'text-[13px] transition-opacity duration-75',
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
                  {w}{' '}
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
          <div className="rounded-lg border border-white/[0.06] bg-white/[0.02] p-4 text-center text-[12px] text-white/30">
            No question text recorded — play a new set to enable replays.
          </div>
        )}

        {/* Result card */}
        {showResult && q && (
          <div className={`rounded-lg border p-3.5 ${
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
          className="py-2 rounded-lg border border-white/[0.08] bg-white/[0.03] text-[12px] font-semibold text-white/55 hover:text-white/80 hover:border-white/[0.14] disabled:opacity-25 transition-colors">
          ← Prev
        </button>
        <div className="text-center text-[10px] text-white/30 tabular-nums">
          Q{qIdx + 1} of {totalQ}
        </div>
        {qIdx < totalQ - 1 ? (
          <button onClick={goNext}
            className="py-2 rounded-lg border border-white/[0.08] bg-white/[0.03] text-[12px] font-semibold text-white/55 hover:text-white/80 hover:border-white/[0.14] transition-colors">
            Next →
          </button>
        ) : (
          <button onClick={onExit}
            className="py-2 rounded-lg border border-white/[0.08] bg-white/[0.03] text-[12px] font-semibold text-white/55 hover:text-white/80 hover:border-white/[0.14] transition-colors">
            Done
          </button>
        )}
      </div>
    </div>
  );
}
