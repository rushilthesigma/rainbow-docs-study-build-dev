import { useState, useRef, useCallback, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { History, Trash2, Plus, ChevronLeft, ChevronDown, Compass, Lightbulb, Calculator, Beaker, Swords, BookOpen, Link2, X, Check, Paperclip, Globe, Cpu, Lock, PanelRightOpen, CircleHelp, Zap, ArrowRight } from 'lucide-react';
import { sendStudyMessage, listStudySessions, getStudySession, deleteStudySession, listCurricula, extractSourceUrl, extractFiles, refineStudyPrompt } from '../../api/curriculum';
import { syncData } from '../../api/auth';
import ChatContainer from '../chat/ChatContainer';
import DebatePanel from './DebatePanel';
import PdfPreviewPane from './PdfPreviewPane';
import QuizPreviewPane from './QuizPreviewPane';
import MathTutorPreviewPane from './MathTutorPreviewPane';
import ViewFade from '../shared/ViewFade';
import { errorChatMessage } from '../../utils/aiErrors';
import { InlineProgress } from '../shared/ProgressBar';
import { Z } from '../../styles/tokens';
import { useToast } from '../shared/Toast';
import { useAuth } from '../../context/AuthContext';
import { useMathCanvas } from '../../context/MathCanvasContext';
import { useWindowManagerOptional } from '../../context/WindowManagerContext';
import { planFromUser } from '../billing/modelAccess';
import { STUDY_MODELS, resolveStudyModel, canUseStudyModel, requiredPlanLabelFor, studyModelLabel, studyModelHasFreeCap, studyModelDailyCap, studyModelSupportsThinking, isGeminiOnlyEmail, visibleStudyModels, resolveGeminiOnlyModel, isBlockedForGeminiOnly, studyModelEatsCreditsFast, recommendedCheapModel } from './studyModels';
import VoiceMenu from './voice/VoiceMenu';
import { useSpeechSynthesis, speechSynthesisSupported } from '../../hooks/useSpeechSynthesis';
import { speechRecognitionSupported } from '../../hooks/useSpeechRecognition';
import { speakableText } from '../../utils/voiceText';

// Quick-start prompts shown in the empty state. Replaces the bland
// "Start the conversation..." default with concrete suggestions tied to
// what the AI is good at, so the study mode does NOT feel like ChatGPT's
// blank greeting.
const QUICK_PROMPTS = [
  { icon: Calculator, label: 'Quiz me on the quadratic formula', prompt: 'Quiz me on the quadratic formula. 5 multiple-choice questions, escalating difficulty.' },
  { icon: Beaker,     label: 'Explain photosynthesis at honors level', prompt: 'Explain photosynthesis at honors-tier depth. Don\'t skip the Calvin cycle.' },
  { icon: Lightbulb,  label: 'Help me understand limits in calculus', prompt: 'Walk me through limits in calculus, starting with intuition before the formal definition.' },
  { icon: Compass,    label: 'What\'s a good thing to study right now?', prompt: 'What should I work on right now?' },
];

const MATH_CANVAS_WIDTH = 460;
const MATH_CANVAS_MIN_WIDTH = 360;

const BEST_OF_DEFAULT_ORDER = [
  'gpt-5.4-mini',
  'deepseek-flash',
  'flash-lite',
  'gpt-5.6-luna',
  'deepseek-pro',
  'gpt-5.6-terra',
  'flash',
  'gpt-5.6-sol',
  'gpt-5.4',
  'gemini-pro',
];

function unlockedStudyModelKeys(email, plan) {
  return visibleStudyModels(email)
    .filter((m) => canUseStudyModel(m.key, plan))
    .map((m) => m.key);
}

function normalizeBestOfState(savedModels, savedJudge, email, plan) {
  const unlocked = unlockedStudyModelKeys(email, plan);
  const preferred = [
    ...BEST_OF_DEFAULT_ORDER.filter((key) => unlocked.includes(key)),
    ...unlocked.filter((key) => !BEST_OF_DEFAULT_ORDER.includes(key)),
  ];
  let judge = unlocked.includes(savedJudge) ? savedJudge : null;
  const models = [];
  for (const key of Array.isArray(savedModels) ? savedModels : []) {
    if (!unlocked.includes(key) || key === judge || models.includes(key)) continue;
    models.push(key);
    if (models.length === 3) break;
  }
  for (const key of preferred) {
    if (models.length === 3) break;
    if (key === judge || models.includes(key)) continue;
    models.push(key);
  }
  if (!judge) {
    judge = preferred.find((key) => !models.includes(key)) || null;
  }
  return { models, judge };
}

export default function StudyModePanel({ className = '', flush = false, initialMessage, initialSources, windowId }) {
  const toast = useToast();
  const { activeCanvas: sharedMathCanvas, getActiveCanvas } = useMathCanvas();
  // Thinking toggle: only models that support thinking show the Brain button.
  // Pro always thinks (locked on); Flash / Flash-Lite default off for snappy
  // study answers and let the user opt in. A ref mirrors the value so doSend
  // reads the latest state even through memoized callbacks.
  const { user, fetchUser } = useAuth();
  const plan = planFromUser(user);
  const userEmail = user?.email || '';
  const geminiOnly = isGeminiOnlyEmail(userEmail);
  // Study Mode model picker (separate from the global tier). The saved pick
  // lives in preferences.studyModel; a plan-locked pick resolves to the floor.
  // For restricted accounts, Claude/OpenAI picks are silently replaced with the
  // best available Gemini model. DeepSeek stays selectable.
  function resolveEffectiveModel(savedKey) {
    const resolved = resolveStudyModel(savedKey, plan);
    if (geminiOnly) {
      const m = STUDY_MODELS.find(x => x.key === resolved);
      if (!m || isBlockedForGeminiOnly(m.provider)) return resolveGeminiOnlyModel(plan);
    }
    return resolved;
  }
  const [studyModel, setStudyModel] = useState(() => resolveEffectiveModel(user?.data?.preferences?.studyModel));
  const studyModelRef = useRef(studyModel);
  studyModelRef.current = studyModel;
  const [studyModelMode, setStudyModelMode] = useState(() => (
    ['best-of', 'superimpose'].includes(user?.data?.preferences?.studyModelMode) ? user.data.preferences.studyModelMode : 'single'
  ));
  const initialBestOf = normalizeBestOfState(
    user?.data?.preferences?.studyBestOfModels,
    user?.data?.preferences?.studyBestOfJudge,
    userEmail,
    plan,
  );
  const [bestOfModels, setBestOfModels] = useState(() => initialBestOf.models);
  const [bestOfJudge, setBestOfJudge] = useState(() => initialBestOf.judge);
  // Which heavy-model selection the user has dismissed the credit-burn notice
  // for. Session-only (plain state, resets on reload); keyed by the active
  // selection so switching to a different costly model surfaces it again.
  const [creditNoticeDismissed, setCreditNoticeDismissed] = useState(null);
  const studyModelModeRef = useRef(studyModelMode);
  const bestOfModelsRef = useRef(bestOfModels);
  const bestOfJudgeRef = useRef(bestOfJudge);
  studyModelModeRef.current = studyModelMode;
  bestOfModelsRef.current = bestOfModels;
  bestOfJudgeRef.current = bestOfJudge;
  // Thinking is a hard toggle the user controls for every model: off = no
  // thinking at all, on = full thinking. Never locked.
  const thinkingLocked = false;
  const [thinkingPref, setThinkingPref] = useState(false);
  const thinkingOn = thinkingLocked ? true : thinkingPref;
  const thinkingOnRef = useRef(thinkingOn);
  thinkingOnRef.current = thinkingOn;
  // Live counts of capped model messages left in the rolling 24h window.
  // Null until the server reports on the first send; the pill falls back to
  // the static daily limit until then.
  const [haikuRemaining, setHaikuRemaining] = useState(null);
  const [sonnetRemaining, setSonnetRemaining] = useState(null);

  // Keep the picker in sync if the cached user (plan / saved pick) changes.
  useEffect(() => {
    setStudyModel(resolveEffectiveModel(user?.data?.preferences?.studyModel));
  }, [user?.data?.preferences?.studyModel, plan, geminiOnly]);

  useEffect(() => {
    setStudyModelMode(['best-of', 'superimpose'].includes(user?.data?.preferences?.studyModelMode) ? user.data.preferences.studyModelMode : 'single');
    const normalized = normalizeBestOfState(
      user?.data?.preferences?.studyBestOfModels,
      user?.data?.preferences?.studyBestOfJudge,
      userEmail,
      plan,
    );
    setBestOfModels(normalized.models);
    setBestOfJudge(normalized.judge);
  }, [
    user?.data?.preferences?.studyModelMode,
    user?.data?.preferences?.studyBestOfModels,
    user?.data?.preferences?.studyBestOfJudge,
    userEmail,
    plan,
  ]);

  async function saveStudyPrefs(patch, { refresh = false } = {}) {
    try {
      const merged = { ...(user?.data?.preferences || {}), ...patch };
      await syncData({ preferences: merged });
      if (refresh) await fetchUser();
    } catch (err) {
      console.error('save study preferences failed:', err);
    }
  }

  async function pickStudyModel(key) {
    if (!canUseStudyModel(key, plan)) return; // locked tiers aren't selectable
    setStudyModel(key);
    setStudyModelMode('single');
    await saveStudyPrefs({ studyModel: key, studyModelMode: 'single' }, { refresh: true });
  }

  function pickStudyModelMode(mode) {
    const nextMode = ['best-of', 'superimpose'].includes(mode) ? mode : 'single';
    setStudyModelMode(nextMode);
    saveStudyPrefs({ studyModelMode: nextMode });
  }

  function pickBestOfModels(nextModels) {
    const normalized = normalizeBestOfState(nextModels, bestOfJudgeRef.current, userEmail, plan);
    const nextMode = ['best-of', 'superimpose'].includes(studyModelModeRef.current) ? studyModelModeRef.current : 'best-of';
    setStudyModelMode(nextMode);
    setBestOfModels(normalized.models);
    setBestOfJudge(normalized.judge);
    saveStudyPrefs({
      studyModelMode: nextMode,
      studyBestOfModels: normalized.models,
      studyBestOfJudge: normalized.judge,
    });
  }

  function pickBestOfJudge(nextJudge) {
    if (!canUseStudyModel(nextJudge, plan)) return;
    const normalized = normalizeBestOfState(bestOfModelsRef.current, nextJudge, userEmail, plan);
    const nextMode = ['best-of', 'superimpose'].includes(studyModelModeRef.current) ? studyModelModeRef.current : 'best-of';
    setStudyModelMode(nextMode);
    setBestOfModels(normalized.models);
    setBestOfJudge(normalized.judge);
    saveStudyPrefs({
      studyModelMode: nextMode,
      studyBestOfModels: normalized.models,
      studyBestOfJudge: normalized.judge,
    });
  }
  const [messages, setMessages] = useState([]);
  const [streamingContent, setStreamingContent] = useState('');
  const [streamingThinking, setStreamingThinking] = useState('');
  const [streamingSources, setStreamingSources] = useState([]);
  const [streamingArtifacts, setStreamingArtifacts] = useState([]);
  const [streamingBestOf, setStreamingBestOf] = useState(null);
  const [searchStatus, setSearchStatus] = useState(null);
  const [sourceMode, setSourceMode] = useState(false);
  const sourceModeRef = useRef(false);
  sourceModeRef.current = sourceMode;
  // Humanize (essay) mode: flips this turn from tutoring to drafting or
  // rewriting finished prose. The server swaps the whole system prompt when
  // humanize is true. Takes precedence over source mode.
  const [humanizeMode, setHumanizeMode] = useState(false);
  const humanizeModeRef = useRef(false);
  humanizeModeRef.current = humanizeMode;
  // Auto-refine: when on, every send routes through /api/study/refine-prompt
  // first so a rough draft reaches the model as a stronger prompt. Persisted
  // locally like the Quiz Bowl voice toggle - it's a device-level habit, not
  // account data.
  const [autoRefine, setAutoRefine] = useState(() => {
    try { return localStorage.getItem('covalent-study-auto-refine') === '1'; } catch { return false; }
  });
  const persistAutoRefine = useCallback((on) => {
    setAutoRefine(!!on);
    try { localStorage.setItem('covalent-study-auto-refine', on ? '1' : '0'); } catch { /* private mode */ }
  }, []);
  const [streaming, setStreaming] = useState(false);
  const [sessionId, setSessionId] = useState(null);
  // Debate sub-view - replaces the chat with the DebatePanel when true.
  const [debateOpen, setDebateOpen] = useState(false);
  const [bestOfInfoOpen, setBestOfInfoOpen] = useState(false);
  // Curriculum integration + extra sources. Both flow into the
  // request `context` object on every send. Sheets toggle from the
  // header buttons. Sources are { id, title, url?, content }.
  const [linkedCurriculumId, setLinkedCurriculumId] = useState(null);
  const [sources, setSources] = useState([]);
  const sourcesRef = useRef([]);
  sourcesRef.current = sources;
  // Quiz results the student has submitted earlier in THIS chat - folded into
  // the request context on every subsequent send so the AI actually knows
  // what they answered, instead of the score living and dying in the quiz's
  // own local component state.
  const [quizResults, setQuizResults] = useState([]);
  const quizResultsRef = useRef([]);
  quizResultsRef.current = quizResults;

  function handleQuizComplete(messageIndex, result) {
    setQuizResults(prev => [...prev, { ...result, messageIndex }]);
  }
  const [showCurriculumPicker, setShowCurriculumPicker] = useState(false);
  const [showSourcesSheet, setShowSourcesSheet] = useState(false);

  // ===== Side PDF preview (Claude-style) — as a window EXTENSION =====
  // PDFs pasted/dropped/attached in the composer open in a dedicated pane on the
  // right. Instead of splitting the existing chat width, we WIDEN the Study
  // window to the right by the pane's width, so the chat keeps its size and the
  // PDF gets its own UI; the window is restored when the last PDF closes. Each
  // entry is { id, name, url } (blob URL, revoked on close/unmount). The pane is
  // visual-only — the AI still reads the PDF via /api/files/extract.
  const wm = useWindowManagerOptional();
  // "See how it works" on the credit-burn notice opens Settings on the Plans
  // tab, which lays out the daily credit pool and per-message / per-generation cost.
  const openCreditSettings = wm
    ? () => wm.openApp('settings', 'Settings', { initialTab: 'plans' })
    : null;
  const [previewDocs, setPreviewDocs] = useState([]);
  const previewDocsRef = useRef([]);
  previewDocsRef.current = previewDocs;
  const [activePreviewId, setActivePreviewId] = useState(null);
  // Collapsed = PDFs stay loaded, but the pane is hidden and the window shrunk
  // back; a toggle at the window's top-right brings it back. Distinct from
  // closing a PDF (which removes it entirely).
  const [previewCollapsed, setPreviewCollapsed] = useState(false);
  const [previewWidth, setPreviewWidth] = useState(480);
  const [sideScreenQuiz, setSideScreenQuiz] = useState(null);
  const [quizSideScreenTarget, setQuizSideScreenTarget] = useState(null);
  const [mathTutorSideScreen, setMathTutorSideScreen] = useState(false);
  const mathTutorSideScreenRef = useRef(false);
  const setMathTutorSideScreenWithRef = useCallback((val) => {
    mathTutorSideScreenRef.current = val;
    setMathTutorSideScreen(val);
  }, []);
  const [mathCanvasStrokes, setMathCanvasStrokes] = useState([]);
  const mathCanvasStrokesRef = useRef([]);
  const canvasSnapshotRef = useRef(null);
  const mathCanvasRef = useRef(null);
  const handleMathCanvasReady = useCallback((api) => {
    mathCanvasRef.current = api;
  }, []);
  const handleMathCanvasStrokesChange = useCallback((strokes) => {
    mathCanvasStrokesRef.current = strokes;
    setMathCanvasStrokes(strokes);
    if (strokes.length === 0) {
      canvasSnapshotRef.current = null;
    } else {
      const snap = mathCanvasRef.current?.capture?.();
      if (snap) canvasSnapshotRef.current = snap;
    }
  }, []);
  const splitRef = useRef(null);
  const resizingRef = useRef(false);
  const resizeStartRef = useRef(null);
  const openingPreviewIds = useRef(new Set());
  // Whether the window has been widened for the preview (null when not running
  // inside a desktop window — then we fall back to an in-place split).
  const baseWinRef = useRef(null);

  // The live, resizable window this panel lives in (null in the mobile/classic
  // shells, or when maximized/fixed-size — both fall back to splitting).
  function liveWindow() {
    if (!wm || !windowId) return null;
    const win = wm.state.windows[windowId];
    if (!win || win.isMaximized || win.fixedSize) return null;
    return win;
  }
  // Grow the window so content width = base + desiredPaneW, clamped to the
  // viewport. Returns the pane width actually achieved so the fixed-width pane
  // never overflows a window that couldn't grow far enough.
  function applyWindowWidth(desiredPaneW) {
    const win = liveWindow();
    if (!win || !baseWinRef.current) return desiredPaneW;
    const PAD = 8;
    const vw = window.innerWidth;
    const targetW = Math.min(baseWinRef.current.w + desiredPaneW, vw - 2 * PAD);
    let x = win.position.x;
    if (x + targetW > vw - PAD) x = Math.max(PAD, vw - PAD - targetW);
    wm.resizeWindow(windowId, { w: targetW, h: win.size.h }, { x, y: win.position.y });
    return Math.max(0, targetW - baseWinRef.current.w);
  }
  // Shrink the window back by the current pane width (respects any manual
  // resize the user did while the PDF was open).
  function restoreWindowWidth() {
    const hadBase = baseWinRef.current;
    baseWinRef.current = null;
    const win = liveWindow();
    if (!hadBase || !win) return;
    const targetW = Math.max(400, win.size.w - previewWidth);
    wm.resizeWindow(windowId, { w: targetW, h: win.size.h }, { x: win.position.x, y: win.position.y });
  }
  // Extend the window to the right by the pane width (recording the pre-extend
  // size so we can restore it). No-op outside a desktop window.
  function extendWindowForPreview(desiredPaneW = previewWidth) {
    const win = liveWindow();
    if (!win) {
      if (desiredPaneW !== previewWidth) setPreviewWidth(desiredPaneW);
      return;
    }
    if (baseWinRef.current) return;
    baseWinRef.current = { w: win.size.w, x: win.position.x };
    const achieved = applyWindowWidth(desiredPaneW);
    if (achieved !== previewWidth) setPreviewWidth(achieved);
  }
  // Hide/show the pane without unloading the PDFs, resizing the window to match.
  function setPreviewCollapsedAndResize(next) {
    setPreviewCollapsed(next);
    if (next) restoreWindowWidth();
    else extendWindowForPreview();
  }

  function openQuizSideScreen(quiz) {
    const paneIsVisible = mathTutorSideScreen || !!sideScreenQuiz || (previewDocsRef.current.length > 0 && !previewCollapsed);
    if (!paneIsVisible) extendWindowForPreview();
    setMathTutorSideScreenWithRef(false);
    setSideScreenQuiz(quiz);
  }

  function collapseQuizSideScreen() {
    setSideScreenQuiz(null);
    setQuizSideScreenTarget(null);
    if (previewDocsRef.current.length === 0 || previewCollapsed) restoreWindowWidth();
  }

  function openMathTutorSideScreen() {
    const paneIsVisible = mathTutorSideScreen || !!sideScreenQuiz || (previewDocsRef.current.length > 0 && !previewCollapsed);
    const splitMax = splitRef.current
      ? Math.max(320, splitRef.current.getBoundingClientRect().width - 360)
      : MATH_CANVAS_WIDTH;
    const desiredWidth = liveWindow()
      ? MATH_CANVAS_WIDTH
      : Math.min(MATH_CANVAS_WIDTH, splitMax);
    if (!paneIsVisible) {
      extendWindowForPreview(desiredWidth);
    } else if (baseWinRef.current) {
      setPreviewWidth(applyWindowWidth(desiredWidth));
    } else {
      setPreviewWidth(desiredWidth);
    }
    setSideScreenQuiz(null);
    setQuizSideScreenTarget(null);
    setMathTutorSideScreenWithRef(true);
  }

  function collapseMathTutorSideScreen() {
    setMathTutorSideScreenWithRef(false);
    if (previewDocsRef.current.length === 0 || previewCollapsed) restoreWindowWidth();
  }

  function showPdfSideScreen() {
    const paneIsVisible = mathTutorSideScreen || !!sideScreenQuiz || (previewDocsRef.current.length > 0 && !previewCollapsed);
    if (!paneIsVisible) extendWindowForPreview();
    setMathTutorSideScreenWithRef(false);
    setSideScreenQuiz(null);
    setQuizSideScreenTarget(null);
    setPreviewCollapsed(false);
  }

  function openPdfPreview(file) {
    if (!file) return;
    const id = `${file.name}::${file.size}::${file.lastModified}`;
    if (previewDocsRef.current.some(d => d.id === id)) { setActivePreviewId(id); return; }
    if (openingPreviewIds.current.has(id)) return;
    openingPreviewIds.current.add(id);
    const paneIsVisible = mathTutorSideScreen || !!sideScreenQuiz || (previewDocsRef.current.length > 0 && !previewCollapsed);
    // First visible side pane: extend the window to the right rather than
    // squeezing the chat. A new PDF also becomes the active side-screen tool.
    if (!paneIsVisible) extendWindowForPreview();
    setMathTutorSideScreenWithRef(false);
    setSideScreenQuiz(null);
    setQuizSideScreenTarget(null);
    setPreviewCollapsed(false); // a freshly added PDF always shows
    const url = URL.createObjectURL(file);
    setPreviewDocs(prev => {
      openingPreviewIds.current.delete(id);
      if (prev.some(d => d.id === id)) { URL.revokeObjectURL(url); return prev; }
      return [...prev, { id, name: file.name, url }];
    });
    setActivePreviewId(id);
  }
  function closePdfPreview(id) {
    const doc = previewDocsRef.current.find(d => d.id === id);
    if (doc) URL.revokeObjectURL(doc.url);
    const remaining = previewDocsRef.current.filter(d => d.id !== id);
    setPreviewDocs(remaining);
    setActivePreviewId(cur => (cur === id ? (remaining[remaining.length - 1]?.id ?? null) : cur));
    if (remaining.length === 0) { restoreWindowWidth(); setPreviewCollapsed(false); }
  }
  // Drag-to-resize the divider. Inside a desktop window we grow/shrink the
  // WINDOW (keeping the chat fixed); outside one we split the panel in place.
  function handleResizeMove(e) {
    if (!resizingRef.current) return;
    if (baseWinRef.current && resizeStartRef.current) {
      const start = resizeStartRef.current;
      const dx = start.x - e.clientX; // drag left → wider PDF pane
      const min = mathTutorSideScreen ? MATH_CANVAS_MIN_WIDTH : 320;
      const desired = Math.min(Math.max(start.paneW + dx, min), 1100);
      setPreviewWidth(applyWindowWidth(desired));
    } else if (splitRef.current) {
      const rect = splitRef.current.getBoundingClientRect();
      const max = Math.max(300, rect.width - 360);
      const min = mathTutorSideScreen ? Math.min(MATH_CANVAS_MIN_WIDTH, max) : 300;
      setPreviewWidth(Math.min(Math.max(rect.right - e.clientX, min), max));
    }
  }
  function endResize() {
    resizingRef.current = false;
    resizeStartRef.current = null;
    document.body.style.cursor = '';
    document.body.style.userSelect = '';
    window.removeEventListener('mousemove', handleResizeMove);
    window.removeEventListener('mouseup', endResize);
  }
  function startResize(e) {
    e.preventDefault();
    resizingRef.current = true;
    resizeStartRef.current = { x: e.clientX, paneW: previewWidth };
    document.body.style.cursor = 'col-resize';
    document.body.style.userSelect = 'none';
    window.addEventListener('mousemove', handleResizeMove);
    window.addEventListener('mouseup', endResize);
  }
  // Free blob URLs if the panel unmounts with PDFs still open.
  useEffect(() => () => {
    for (const d of previewDocsRef.current) URL.revokeObjectURL(d.url);
  }, []);
  const abortRef = useRef(null);
  const streamContentRef = useRef('');
  const streamThinkingRef = useRef('');
  const streamSourcesRef = useRef([]);
  const streamArtifactsRef = useRef([]);
  const streamBestOfRef = useRef(null);
  const initialSent = useRef(false);
  // Counts consecutive "restart" submissions so a double-restart re-runs the
  // previous real user turn. Neither "restart" message is ever sent to the server.
  const restartCountRef = useRef(0);

  // History state
  const [showHistory, setShowHistory] = useState(false);
  const [sessions, setSessions] = useState([]);
  const [loadingHistory, setLoadingHistory] = useState(false);

  // ===== Voice mode (BETA) =====
  const [voiceRate, setVoiceRate] = useState(() => {
    const r = parseFloat(localStorage.getItem('covalent-voice-rate'));
    return Number.isFinite(r) && r > 0 ? r : 1;
  });
  const [voiceURI, setVoiceURI] = useState(() => localStorage.getItem('covalent-voice-uri') || null);
  // Panel-level synthesizer drives voice mode. The conversation overlay owns
  // its own synth instance, so we cancel this one whenever the overlay opens.
  const synth = useSpeechSynthesis({ rate: voiceRate, voiceURI });

  function persistRate(r) { setVoiceRate(r); localStorage.setItem('covalent-voice-rate', String(r)); }
  function persistVoiceURI(uri) {
    setVoiceURI(uri);
    if (uri) localStorage.setItem('covalent-voice-uri', uri);
    else localStorage.removeItem('covalent-voice-uri');
  }
  function doSend(text, opts = {}) {
    synth.cancel();
    // Regular reroute fans this prompt out to every model server-side. It owns
    // the whole turn, so source mode / humanize / best-of are all suppressed.
    const rerouteActive = !!opts.reroute;
    // Brute force is the same kind of server-owned fan-out turn as reroute, so it
    // suppresses source mode / humanize / best-of the exact same way.
    const bruteForceActive = !!opts.bruteForce;
    const fanOutActive = rerouteActive || bruteForceActive;
    // Humanize wins over source mode: citation scaffolding does not fit the
    // straight-prose output shape, so the server ignores sourced when humanize
    // is on. Mirror that here so the UI status matches.
    const wantsHumanize = !fanOutActive && !!(opts.humanize ?? humanizeModeRef.current);
    // Best of 3 runs each model as itself; web search is Gemini-only and would
    // collapse all three picks onto Gemini server-side, so grounding is off in
    // this mode. Mirror the humanize precedent and drop sourced when comparing.
    const bestOfActive = !fanOutActive && studyModelModeRef.current === 'best-of'
      && bestOfModelsRef.current.length === 3 && !!bestOfJudgeRef.current;
    // Superimpose shares Best of 3's candidate/judge picker, but the judge merges
    // all three answers into one instead of picking a winner.
    const superimposeActive = !fanOutActive && studyModelModeRef.current === 'superimpose'
      && bestOfModelsRef.current.length === 3 && !!bestOfJudgeRef.current;
    const wasSourced = !fanOutActive && !wantsHumanize && !bestOfActive && !superimposeActive && !!(opts.sourced ?? sourceModeRef.current);
    const attachedImages = opts.images || [];
    const canvasApi = mathCanvasRef.current;
    const canvasPaneOpen = mathTutorSideScreenRef.current;
    // Gate on the toggle AND content — pane must be open and canvas must have strokes.
    const hasStrokes = !canvasApi?.isEmpty?.();
    const liveCanvasDataUrl = canvasPaneOpen && hasStrokes ? canvasApi?.capture?.() : null;
    const localCanvasDataUrl = canvasPaneOpen && hasStrokes
      ? (liveCanvasDataUrl || canvasSnapshotRef.current)
      : null;
    const detectedCanvas = localCanvasDataUrl
      ? { dataUrl: localCanvasDataUrl, mimeType: 'image/png', name: 'Live Study math canvas' }
      : (!canvasPaneOpen ? getActiveCanvas() : null);
    const canvasImage = detectedCanvas?.dataUrl
      ? {
          dataUrl: detectedCanvas.dataUrl,
          mimeType: detectedCanvas.mimeType || 'image/png',
          name: detectedCanvas.name || 'Live math canvas',
        }
      : null;
    // Manual attachments and the canvas travel in separate request fields.
    // This guarantees that every send reserves a slot for the detected canvas.
    const images = attachedImages.slice(0, canvasImage ? 3 : 4);
    const userMsg = { role: 'user', content: text, timestamp: new Date().toISOString() };
    if (attachedImages.length) userMsg.images = attachedImages.map(i => ({ dataUrl: i.dataUrl, name: i.name }));
    // Auto-refined sends carry { original, note } so the bubble can show a
    // "refined" marker with the student's original draft behind it.
    if (opts.refined?.original) userMsg.refined = opts.refined;
    // Used by the AI-instruct regenerate flow: hide the hidden-instruction
    // user turn from the visible transcript while still sending it to the API.
    if (!opts.hideUserInDisplay) setMessages(prev => [...prev, userMsg]);
    setStreaming(true);
    setStreamingContent('');
    setStreamingThinking('');
    setStreamingSources([]);
    setStreamingArtifacts([]);
    setStreamingBestOf(null);
    setSearchStatus(wasSourced ? 'searching' : null);
    streamContentRef.current = '';
    streamThinkingRef.current = '';
    streamSourcesRef.current = [];
    streamArtifactsRef.current = [];
    streamBestOfRef.current = null;

    // Build the context payload - only include what the server cares
    // about. `sources` already contains extracted text from /api/files
    // /extract-url so the server doesn't have to re-fetch.
    const ctx = {};
    ctx.liveMathCanvas = !!canvasImage;
    if (linkedCurriculumId) ctx.curriculumId = linkedCurriculumId;
    const currentSources = sourcesRef.current;
    if (currentSources.length) {
      ctx.sources = currentSources.map((s) => ({
        title: s.title || s.name || s.url || 'Source',
        url: s.url || null,
        content: s.content || s.text || '',
      }));
    }
    if (quizResultsRef.current.length) ctx.quizResults = quizResultsRef.current;

    const abort = sendStudyMessage(text, sessionId, ctx, images, {
      onChunk: (chunk) => {
        streamContentRef.current += chunk;
        setStreamingContent(streamContentRef.current);
        if (searchStatus) setSearchStatus(null);
      },
      onThinking: (t) => {
        streamThinkingRef.current += t;
        setStreamingThinking(streamThinkingRef.current);
      },
      onMeta: (data) => {
        if (data.sessionId) setSessionId(data.sessionId);
        if (data.bestOf) {
          streamBestOfRef.current = data.bestOf;
          setStreamingBestOf(data.bestOf);
        }
        if (typeof data.studyModel?.haikuRemaining === 'number') {
          setHaikuRemaining(data.studyModel.haikuRemaining);
        }
        if (typeof data.studyModel?.sonnetRemaining === 'number') {
          setSonnetRemaining(data.studyModel.sonnetRemaining);
        }
        // Server auto-switched the model (Haiku daily cap hit, or a locked
        // pick). Snap the toggle to whatever model the server actually used,
        // then tell the user once rather than silently swapping models.
        if (data.studyModel?.switched && data.studyModel.key) {
          // reason 'haiku-limit' is generic across capped free models; name the
          // one the user actually had selected (Haiku, DeepSeek V4 Pro, ...).
          const cappedName = studyModelLabel(studyModelRef.current);
          setStudyModel(data.studyModel.key);
          if (data.studyModel.reason === 'haiku-limit') {
            toast.info(`Daily ${cappedName} limit reached — switched to Flash Lite until tomorrow.`);
          } else if (data.studyModel.reason === 'plan') {
            toast.info('That model needs an upgrade — using Flash Lite.');
          }
        }
      },
      onSource: (src) => {
        streamSourcesRef.current = [...streamSourcesRef.current, src];
        setStreamingSources(streamSourcesRef.current);
      },
      onArtifact: (a) => {
        // Server-side post-stream parser found a [MAKE_*] block and
        // already created the artifact. Attach to the in-flight bubble
        // so the Open card appears the instant we know about it.
        streamArtifactsRef.current = [...streamArtifactsRef.current, a];
        setStreamingArtifacts(streamArtifactsRef.current);
      },
      onStatus: (s) => setSearchStatus(s),
      onDone: () => {
        const fullContent = streamContentRef.current;
        const think = streamThinkingRef.current;
        const sources = streamSourcesRef.current;
        const artifacts = streamArtifactsRef.current;
        const bestOf = streamBestOfRef.current;
        if (fullContent) {
          setMessages(m => [...m, {
            role: 'assistant',
            content: fullContent,
            thinking: think || undefined,
            sources: sources.length ? sources : undefined,
            artifacts: artifacts.length ? artifacts : undefined,
            bestOf: bestOf || undefined,
            timestamp: new Date().toISOString(),
          }]);
        }
        setStreamingContent('');
        setStreamingThinking('');
        setStreamingSources([]);
        setStreamingArtifacts([]);
        setStreamingBestOf(null);
        setSearchStatus(null);
        streamContentRef.current = '';
        streamThinkingRef.current = '';
        streamSourcesRef.current = [];
        streamArtifactsRef.current = [];
        streamBestOfRef.current = null;
        setStreaming(false);
        if (opts.autoPlay && fullContent) {
          const speech = speakableText(fullContent);
          if (speech) synth.speak(speech);
        }
      },
      onError: (err) => {
        // eslint-disable-next-line no-use-before-define
        setMessages(m => [...m, errorChatMessage(err)]);
        setStreamingContent('');
        setStreamingThinking('');
        setStreamingSources([]);
        setStreamingArtifacts([]);
        setStreamingBestOf(null);
        setSearchStatus(null);
        streamContentRef.current = '';
        streamThinkingRef.current = '';
        streamSourcesRef.current = [];
        streamArtifactsRef.current = [];
        streamBestOfRef.current = null;
        setStreaming(false);
      },
    }, wasSourced, !thinkingOnRef.current, studyModelRef.current, canvasImage, wantsHumanize,
      (bestOfActive || superimposeActive)
        ? {
            models: bestOfModelsRef.current,
            judgeModel: bestOfJudgeRef.current,
          }
        : null,
      rerouteActive,
      rerouteActive && !!opts.smartReroute,
      bruteForceActive,
      bruteForceActive ? (opts.bruteForceFocus || '') : '',
      superimposeActive);
    abortRef.current = abort;
  }

  const handleSend = useCallback((text, images, opts = {}) => {
    if (streaming) return;
    if (text.trim().toLowerCase() === 'restart') {
      restartCountRef.current += 1;
      if (restartCountRef.current >= 2) {
        // Double restart: re-run the last real user message with a fresh response.
        restartCountRef.current = 0;
        const lastRealUserMsg = [...messages].reverse().find(
          m => m.role === 'user'
        );
        if (lastRealUserMsg) {
          // Drop the last assistant reply so the new one replaces it cleanly.
          setMessages(prev => {
            const lastAsstIdx = [...prev].reduceRight((found, m, i) =>
              found === -1 && m.role === 'assistant' ? i : found, -1);
            return lastAsstIdx !== -1 ? prev.slice(0, lastAsstIdx) : prev;
          });
          doSend(lastRealUserMsg.content, {
            images: lastRealUserMsg.images || [],
            hideUserInDisplay: true,
          });
        }
      }
      // First "restart" — wait silently for a second one.
      return;
    }
    restartCountRef.current = 0;
    doSend(text, { images, autoPlay: !!opts.isVoice, refined: opts.refined });
  }, [streaming, sessionId, messages]);

  // Prompt refine for the composer wand: a small [{role, content}] slice of
  // the conversation rides along so drafts like "explain that again but
  // simpler" keep their reference intact.
  const handleRefinePrompt = useCallback(async (draft) => {
    const recent = messages
      .filter(m => (m.role === 'user' || m.role === 'assistant') && typeof m.content === 'string')
      .slice(-6)
      .map(m => ({ role: m.role, content: m.content.slice(0, 600) }));
    return refineStudyPrompt(draft, recent);
  }, [messages]);

  // Seed sources from a parent page (e.g. "Study this note" launches the
  // panel with the note text pre-attached as a source). Only runs once on
  // mount so manual edits aren't clobbered.
  const sourcesSeeded = useRef(false);
  useEffect(() => {
    if (sourcesSeeded.current) return;
    if (Array.isArray(initialSources) && initialSources.length > 0) {
      sourcesSeeded.current = true;
      setSources(initialSources.map((s) => ({
        id: s.id || (crypto.randomUUID?.() || String(Date.now() + Math.random())),
        title: s.title || s.name || 'Source',
        url: s.url || null,
        content: s.content || s.text || '',
      })));
    }
  }, [initialSources]);

  useEffect(() => {
    if (initialMessage && !initialSent.current) {
      initialSent.current = true;
      setTimeout(() => doSend(initialMessage), 100);
    }
  }, [initialMessage]);

  async function loadHistory() {
    setLoadingHistory(true);
    try {
      const data = await listStudySessions();
      setSessions(data.sessions || []);
    } catch (err) {
      console.error('loadHistory', err);
      toast.error("Couldn't load study history");
    }
    setLoadingHistory(false);
  }

  async function resumeSession(sid) {
    try {
      const data = await getStudySession(sid);
      if (data.session) {
        setSessionId(data.session.id);
        setMessages(data.session.messages || []);
        setQuizResults(data.session.context?.quizResults || []);
        setShowHistory(false);
      }
    } catch (err) {
      console.error('resumeSession', err);
      toast.error("Couldn't open that session");
    }
  }

  async function handleDeleteSession(sid) {
    try {
      await deleteStudySession(sid);
      setSessions(prev => prev.filter(s => s.id !== sid));
    } catch (err) {
      console.error('deleteStudySession', err);
      toast.error("Couldn't delete that session");
    }
  }

  function newChat() {
    synth.cancel();
    setMessages([]);
    setSessionId(null);
    setShowHistory(false);
    setBestOfInfoOpen(false);
    setSourceMode(false);
    setSources([]);
    setLinkedCurriculumId(null);
    setQuizResults([]);
  }

  function formatDate(d) {
    if (!d) return '';
    const date = new Date(d);
    const now = new Date();
    const diff = now - date;
    if (diff < 60000) return 'Just now';
    if (diff < 3600000) return `${Math.floor(diff / 60000)}m ago`;
    if (diff < 86400000) return `${Math.floor(diff / 3600000)}h ago`;
    return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
  }

  // History view
  if (showHistory) {
    return (
      <div className={`flex flex-col ${className}`}>
        <div className="flex items-center gap-2 px-4 py-3 bg-transparent">
          <button onClick={() => setShowHistory(false)} className="p-1 rounded-lg text-gray-400 hover:text-gray-600 dark:hover:text-gray-300">
            <ChevronLeft size={16} />
          </button>
          <History size={16} className="text-gray-500 dark:text-gray-400" />
          <span className="text-sm font-semibold text-gray-900 dark:text-gray-100">Chat History</span>
          <div className="flex-1" />
          <button onClick={newChat} className="flex items-center gap-1 text-xs text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-200 font-medium">
            <Plus size={12} /> New Chat
          </button>
        </div>

        <div className="flex-1 overflow-y-auto p-3 space-y-1.5">
          {loadingHistory && <p className="text-xs text-gray-400 text-center py-4">Loading...</p>}
          {!loadingHistory && sessions.length === 0 && (
            <p className="text-xs text-gray-400 text-center py-8">No past sessions</p>
          )}
          {sessions.map(s => (
            <div
              key={s.id}
              onClick={() => resumeSession(s.id)}
              className={`group flex items-start gap-3 px-3 py-2.5 rounded-xl cursor-pointer transition-colors hover:bg-white/50 dark:hover:bg-white/[0.05] ${s.id === sessionId ? 'bg-white/60 dark:bg-white/[0.08]' : ''}`}
            >
              <div className="flex-1 min-w-0">
                <p className="text-xs font-medium text-gray-800 dark:text-gray-200 truncate">
                  {s.preview || 'New session'}
                </p>
                <p className="text-[10px] text-gray-400 mt-0.5">
                  {s.messageCount} msg{s.messageCount !== 1 ? 's' : ''} · {formatDate(s.lastMessageAt || s.startedAt)}
                </p>
              </div>
              <button
                onClick={e => { e.stopPropagation(); handleDeleteSession(s.id); }}
                className="opacity-0 group-hover:opacity-100 p-1 rounded text-gray-300 hover:text-rose-500 transition-all"
              >
                <Trash2 size={12} />
              </button>
            </div>
          ))}
        </div>
      </div>
    );
  }

  const header = (
    <div className="flex items-center gap-2 px-3 py-2.5 bg-transparent">
      <span className="text-[13px] font-bold text-gray-900 dark:text-white">Study</span>
      <div className="flex-1" />
      <button
        type="button"
        onClick={mathTutorSideScreen ? collapseMathTutorSideScreen : openMathTutorSideScreen}
        title={mathTutorSideScreen ? 'Close Math Tutor side screen' : 'Open Math Tutor in side screen'}
        aria-label={mathTutorSideScreen ? 'Close Math Tutor side screen' : 'Open Math Tutor in side screen'}
        className={`p-1.5 rounded-lg transition-colors ${mathTutorSideScreen ? 'text-white bg-white/20' : 'text-white/70 hover:text-white hover:bg-white/[0.15]'}`}
      >
        <Calculator size={14} />
      </button>
      <button
        onClick={() => setShowCurriculumPicker(true)}
        title="Integrate with a curriculum"
        className={`p-1.5 rounded-lg transition-colors ${linkedCurriculumId ? 'text-white bg-white/20' : 'text-white/70 hover:text-white hover:bg-white/[0.15]'}`}
      >
        <BookOpen size={14} />
      </button>
      <button
        onClick={() => setShowSourcesSheet(true)}
        title="Attach sources"
        className={`p-1.5 rounded-lg transition-colors relative ${sources.length ? 'text-white bg-white/20' : 'text-white/70 hover:text-white hover:bg-white/[0.15]'}`}
      >
        <Link2 size={14} />
        {sources.length > 0 && <span className="absolute -top-0.5 -right-0.5 w-3.5 h-3.5 rounded-full bg-white/80 text-gray-900 text-[8px] font-bold flex items-center justify-center">{sources.length}</span>}
      </button>
      <button
        onClick={() => { loadHistory(); setShowHistory(true); }}
        title="History"
        className="p-1.5 rounded-lg text-white/70 hover:text-white hover:bg-white/[0.15] transition-colors"
      >
        <History size={14} />
      </button>
      {sessionId && (
        <button
          onClick={newChat}
          title="New chat"
          className="p-1.5 rounded-lg text-white/70 hover:text-white hover:bg-white/[0.15] transition-colors"
        >
          <Plus size={14} />
        </button>
      )}
      {/* Show-PDF toggle: appears at the window's top-right whenever a PDF is
          loaded but the pane has been collapsed, so the preview can be reopened. */}
      {previewDocs.length > 0 && (previewCollapsed || mathTutorSideScreen || !!sideScreenQuiz) && (
        <button
          onClick={showPdfSideScreen}
          title="Show PDF"
          aria-label="Show PDF side screen"
          className="p-1.5 rounded-lg text-white bg-white/20 hover:bg-white/30 transition-colors"
        >
          <PanelRightOpen size={14} />
        </button>
      )}
    </div>
  );

  // Debate sub-view replaces the entire chat surface while open.
  if (debateOpen) {
    return (
      <div className={`flex flex-col ${className}`}>
        <DebatePanel onBack={() => setDebateOpen(false)} />
      </div>
    );
  }

  if (bestOfInfoOpen) {
    return (
      <div className={`flex flex-col min-h-0 ${className}`}>
        <BestOfModeInfoView
          mode={studyModelMode}
          bestOfModels={bestOfModels}
          bestOfJudge={bestOfJudge}
          onBack={() => setBestOfInfoOpen(false)}
        />
      </div>
    );
  }

  function handleUserEdit(idx, newContent) {
    if (streaming) return;
    if (abortRef.current) try { abortRef.current(); } catch {}
    setMessages(prev => prev.slice(0, idx));
    setTimeout(() => doSend(newContent), 30);
  }
  // Regenerate the AI bubble in place - do not show the instruction as a
  // user turn. We rely on doSend-with-hidden-first-message pattern.
  function handleAiInstruct(idx, instruction) {
    if (streaming || !instruction?.trim()) return;
    let userIdx = idx - 1;
    while (userIdx >= 0 && messages[userIdx]?.role !== 'user') userIdx--;
    if (userIdx < 0) return;
    const prevUserText = messages[userIdx].content || '';
    const userMsgSnapshot = messages[userIdx];
    if (abortRef.current) try { abortRef.current(); } catch {}
    setMessages(prev => [...prev.slice(0, userIdx), userMsgSnapshot]);
    const hidden = `${prevUserText}\n\n[SYSTEM NOTE: Regenerate your previous answer - this time ${instruction.trim()}. Do NOT acknowledge this instruction. Just output the revised answer directly.]`;
    setTimeout(() => doSend(hidden, { hideUserInDisplay: true }), 30);
  }

  // Regular reroute: re-run the user's prompt through EVERY available model and
  // append a new assistant turn that carries every response. We keep the
  // original (possibly refused) answer in place above it and don't show a
  // duplicate user bubble - the comparison panel is the whole point.
  function handleReroute(idx) {
    if (streaming) return;
    let userIdx = idx - 1;
    while (userIdx >= 0 && messages[userIdx]?.role !== 'user') userIdx--;
    if (userIdx < 0) return;
    const prevUserText = messages[userIdx].content || '';
    if (!prevUserText.trim()) return;
    if (abortRef.current) try { abortRef.current(); } catch {}
    setTimeout(() => doSend(prevUserText, { reroute: true, hideUserInDisplay: true }), 30);
  }

  // Smart reroute: same fan-out, but the server reframes the prompt up front
  // (ethos-preserving) before any model sees it - best when the original wording
  // is tripping refusals or coming back weak across the board.
  function handleSmartReroute(idx) {
    if (streaming) return;
    let userIdx = idx - 1;
    while (userIdx >= 0 && messages[userIdx]?.role !== 'user') userIdx--;
    if (userIdx < 0) return;
    const prevUserText = messages[userIdx].content || '';
    if (!prevUserText.trim()) return;
    if (abortRef.current) try { abortRef.current(); } catch {}
    setTimeout(() => doSend(prevUserText, { reroute: true, smartReroute: true, hideUserInDisplay: true }), 30);
  }

  // Brute force: the relentless option. Re-runs the prompt through 5 models and
  // keeps rewriting it WITHOUT trigger words for up to 10 rounds, until one
  // model actually answers. Same in-place behavior as reroute - no duplicate
  // user bubble, the comparison panel carries every round.
  function handleBruteForce(idx, focus = '') {
    if (streaming) return;
    let userIdx = idx - 1;
    while (userIdx >= 0 && messages[userIdx]?.role !== 'user') userIdx--;
    if (userIdx < 0) return;
    const prevUserText = messages[userIdx].content || '';
    if (!prevUserText.trim()) return;
    if (abortRef.current) try { abortRef.current(); } catch {}
    setTimeout(() => doSend(prevUserText, { bruteForce: true, bruteForceFocus: focus, hideUserInDisplay: true }), 30);
  }

  // Rich empty state - quick-prompt cards, NOT ChatGPT's blank greeting.
  const emptyState = (
    <div className="h-full flex flex-col items-center justify-center px-4 py-6">
      <div className="grid sm:grid-cols-2 gap-2 w-full max-w-md">
        {QUICK_PROMPTS.map((p, i) => {
          const Icon = p.icon;
          return (
            <button
              key={i}
              onClick={() => doSend(p.prompt)}
              disabled={streaming}
              className="group text-left flex items-start gap-2.5 p-3 rounded-xl border border-white/[0.08] dark:border-white/[0.07] bg-white/[0.03] dark:bg-white/[0.03] hover:bg-white/[0.07] dark:hover:bg-white/[0.06] transition-colors duration-150 disabled:opacity-50"
            >
              <div className="w-7 h-7 rounded-md bg-white/[0.07] dark:bg-white/[0.06] flex items-center justify-center text-gray-500 dark:text-gray-400 flex-shrink-0">
                <Icon size={13} />
              </div>
              <p className="text-[12px] font-medium text-gray-800 dark:text-gray-200 leading-snug pt-0.5">{p.label}</p>
            </button>
          );
        })}
      </div>
    </div>
  );

  return (
    <>
      <div ref={splitRef} className={`flex flex-row min-h-0 ${className}`}>
      <ChatContainer
        messages={messages}
        streamingContent={streamingContent}
        streamingThinking={streamingThinking}
        streamingSources={streamingSources}
        streamingArtifacts={streamingArtifacts}
        streamingBestOf={streamingBestOf}
        searchStatus={searchStatus}
        onSend={handleSend}
        disabled={streaming}
        placeholder={streaming ? 'AI is thinking...' : 'Message...'}
        header={header}
        className="flex-1 min-w-0 min-h-0"
        onPreviewFile={openPdfPreview}
        sideScreenQuizId={sideScreenQuiz?.id || null}
        quizSideScreenTarget={quizSideScreenTarget}
        onSideScreenQuiz={openQuizSideScreen}
        onQuizComplete={handleQuizComplete}
        sourceMode={sourceMode}
        onToggleSource={setSourceMode}
        sourceDisabled={['best-of', 'superimpose'].includes(studyModelMode) && bestOfModels.length === 3 && !!bestOfJudge}
        sourceDisabledReason={studyModelMode === 'superimpose' ? 'Web search is off while superimposing models' : 'Web search is off while comparing models in Best of 3'}
        humanizeMode={humanizeMode}
        onToggleHumanize={setHumanizeMode}
        showThinking={studyModelMode === 'single' && studyModelSupportsThinking(studyModel)}
        thinkingMode={thinkingOn}
        thinkingLocked={thinkingLocked}
        onToggleThinking={setThinkingPref}
        onRefine={handleRefinePrompt}
        autoRefine={autoRefine}
        onToggleAutoRefine={persistAutoRefine}
        composerPrefix={
          <VoiceMenu
            voices={synth.voices}
            voiceURI={voiceURI}
            onPickVoice={persistVoiceURI}
            rate={voiceRate}
            onRate={persistRate}
            sttSupported={speechRecognitionSupported}
            ttsSupported={speechSynthesisSupported}
            variant="surface"
          />
        }
        composerNotice={(() => {
          if (plan !== 'free') return null;
          const heavy = ['best-of', 'superimpose'].includes(studyModelMode)
            ? bestOfModels.filter(studyModelEatsCreditsFast)
            : (studyModelEatsCreditsFast(studyModel) ? [studyModel] : []);
          if (!heavy.length) return null;
          const key = heavy.join(',');
          if (creditNoticeDismissed === key) return null;
          return (
            <CreditBurnNotice
              models={heavy}
              recommend={recommendedCheapModel(userEmail, ['best-of', 'superimpose'].includes(studyModelMode) ? null : studyModel)}
              onSeeHow={openCreditSettings}
              onDismiss={() => setCreditNoticeDismissed(key)}
            />
          );
        })()}
        composerExtras={
          <div className="flex items-center gap-1.5">
            <StudyModelDropdown
              active={studyModel}
              mode={studyModelMode}
              bestOfModels={bestOfModels}
              bestOfJudge={bestOfJudge}
              plan={plan}
              email={userEmail}
              onPick={pickStudyModel}
              onModeChange={pickStudyModelMode}
              onBestOfModels={pickBestOfModels}
              onBestOfJudge={pickBestOfJudge}
              onOpenBestOfInfo={() => setBestOfInfoOpen(true)}
              disabled={streaming}
            />
            {studyModelMode === 'single' && studyModelHasFreeCap(studyModel, plan) && (
              <ModelCapPill
                cap={studyModelDailyCap(studyModel, plan)}
                remaining={studyModel === 'sonnet' ? sonnetRemaining : haikuRemaining}
                model={studyModel}
              />
            )}
          </div>
        }
        onUserEditMessage={handleUserEdit}
        onAiInstruct={handleAiInstruct}
        onReroute={handleReroute}
        onSmartReroute={handleSmartReroute}
        onBruteForce={handleBruteForce}
        paid={plan === 'paid'}
        onUpgrade={openCreditSettings}
        emptyState={emptyState}
        enableDictation={speechRecognitionSupported}
        flush={flush}
        canvasOpen={mathTutorSideScreen}
      />
      {(mathTutorSideScreen || sideScreenQuiz || (previewDocs.length > 0 && !previewCollapsed)) && (
        <>
          <div
            onMouseDown={startResize}
            title="Drag to resize"
            className="w-1.5 flex-shrink-0 cursor-col-resize relative group"
          >
            <div className="absolute inset-y-0 left-1/2 -translate-x-1/2 w-px bg-gray-200 dark:bg-white/[0.08] group-hover:bg-blue-400/60 group-active:bg-blue-400" />
          </div>
          {mathTutorSideScreen ? (
            <MathTutorPreviewPane
              onCollapse={collapseMathTutorSideScreen}
              width={previewWidth}
              initialStrokes={mathCanvasStrokes}
              onStrokesChange={handleMathCanvasStrokesChange}
              onCaptureReady={handleMathCanvasReady}
            />
          ) : sideScreenQuiz ? (
            <QuizPreviewPane
              title={sideScreenQuiz.title}
              onCollapse={collapseQuizSideScreen}
              width={previewWidth}
              setPortalTarget={setQuizSideScreenTarget}
            />
          ) : (
            <PdfPreviewPane
              docs={previewDocs}
              activeId={activePreviewId}
              onSelect={setActivePreviewId}
              onClose={closePdfPreview}
              onCollapse={() => setPreviewCollapsedAndResize(true)}
              width={previewWidth}
            />
          )}
        </>
      )}
      </div>
      {showCurriculumPicker && (
        <CurriculumPickerModal
          activeId={linkedCurriculumId}
          onClose={() => setShowCurriculumPicker(false)}
          onPick={(id) => { setLinkedCurriculumId(id); setShowCurriculumPicker(false); }}
        />
      )}
      {showSourcesSheet && (
        <SourcesModal
          sources={sources}
          onClose={() => setShowSourcesSheet(false)}
          onChange={setSources}
        />
      )}
    </>
  );
}

// ===== Credit-burn notice (just above the chat box) =====
//
// Free users have a small daily credit pool, so pricier models (more than 5
// credits/message) drain it fast. Surface a quiet heads-up right above the
// composer whenever such a model is the active pick (or in the Best of 3 set),
// in the app accent color. It names a cheaper model to fall back to, links to
// the Settings credits breakdown, and can be dismissed for the session.
function CreditBurnNotice({ models, recommend, onSeeHow, onDismiss }) {
  if (!models || models.length === 0) return null;
  const names = models.map(studyModelLabel);
  const subject =
    names.length === 1
      ? names[0]
      : names.length === 2
        ? `${names[0]} and ${names[1]}`
        : `${names.slice(0, -1).join(', ')}, and ${names[names.length - 1]}`;
  const verb = names.length === 1 ? 'takes' : 'take';
  return (
    <div className="px-4 pt-2 -mb-1">
      <div className="flex items-center gap-2 text-[11px] font-medium text-blue-600 dark:text-blue-300/90">
        <Zap size={12} className="shrink-0 fill-current" />
        <span className="min-w-0">
          {subject} {verb} up credits fast
          {recommend && (
            <> · try <span className="font-semibold">{studyModelLabel(recommend)}</span> to save</>
          )}
        </span>
        {onSeeHow && (
          <button
            type="button"
            onClick={onSeeHow}
            className="inline-flex items-center gap-0.5 font-semibold text-blue-600 dark:text-blue-300 hover:underline whitespace-nowrap"
          >
            See how it works
            <ArrowRight size={11} className="shrink-0" />
          </button>
        )}
        {onDismiss && (
          <button
            type="button"
            onClick={onDismiss}
            title="Dismiss"
            aria-label="Dismiss"
            className="ml-auto shrink-0 p-0.5 rounded text-blue-500/70 hover:text-blue-600 dark:hover:text-blue-200 hover:bg-blue-500/10 transition-colors"
          >
            <X size={12} />
          </button>
        )}
      </div>
    </div>
  );
}

// ===== Daily-cap pill (composer toolbar) =====
//
// Shows the rolling daily quota for capped models (Haiku on free, Sonnet on
// Plus). Before the first send the server hasn't reported a live count, so it
// shows the static cap; afterward it shows messages remaining. Turns amber
// when running low.
function ModelCapPill({ cap, remaining, model }) {
  const known = typeof remaining === 'number';
  const low = known && remaining <= 3;
  const label = `${known ? remaining : cap}/${cap}`;
  const modelName = { haiku: 'Haiku', 'gpt-5.4': 'GPT-5.4', sonnet: 'Sonnet', 'deepseek-pro': 'DeepSeek V4 Pro' }[model] || model;
  return (
    <span
      title={`${cap} ${modelName} messages per day on your plan`}
      className={`animate-fade-in inline-flex items-center px-2 py-1 rounded-lg text-[11px] font-semibold whitespace-nowrap transition-colors ${
        low
          ? 'text-amber-600 dark:text-amber-300/90 bg-amber-500/10'
          : 'text-gray-500 dark:text-blue-200/65 bg-white/30 dark:bg-blue-500/[0.10]'
      }`}
    >
      {label}
    </span>
  );
}

function BestOfModeInfoView({ mode = 'best-of', bestOfModels, bestOfJudge, onBack }) {
  const isSuperimpose = mode === 'superimpose';
  const responseLabels = bestOfModels.length
    ? bestOfModels.map((key) => studyModelLabel(key))
    : ['Response model 1', 'Response model 2', 'Response model 3'];
  const judgeLabel = bestOfJudge ? studyModelLabel(bestOfJudge) : (isSuperimpose ? 'Merge model' : 'Judge model');

  return (
    <ViewFade viewKey="best-of-mode-info" className="h-full min-h-0 overflow-y-auto bg-transparent px-5 py-5">
      <button
        type="button"
        onClick={onBack}
        className="mb-6 text-[13px] font-medium text-white/42 transition-colors hover:text-white/78"
      >
        Back to Study
      </button>

      <div className="mx-auto w-full max-w-2xl text-white/60">
        <p className="text-[11px] font-bold uppercase tracking-[0.16em] text-white/35">Study model mode</p>
        <h2 className="mt-2 text-[20px] font-bold text-white/90">{isSuperimpose ? 'Superimpose mode' : 'Best of mode'}</h2>

        <div className="mt-5 space-y-4 text-[13px] leading-relaxed">
          {isSuperimpose ? (
            <>
              <p>
                Superimpose sends your prompt to three response models, then asks a separate fourth model to merge all three answers into one.
              </p>
              <p>
                Study Mode shows the merged answer first. The three raw responses stay under it so you can see what each model contributed.
              </p>
              <p>
                It is useful for prompts where different models catch different pieces of the answer, but it can feel slower than Single because it creates several answers before merging them.
              </p>
              <p>
                Web search stays off in this mode. Grounding routes every model through Gemini, which would collapse your three picks onto the same engine, so each model answers as itself instead.
              </p>
            </>
          ) : (
            <>
              <p>
                Best of sends your prompt to three response models, then asks a separate fourth model to judge the answers.
              </p>
              <p>
                Study Mode shows the judged winner first. The other responses stay under the answer so you can compare what each model did differently.
              </p>
              <p>
                It is useful for harder prompts where multiple attempts can catch nuance, but it can feel slower than Single because it creates several answers before choosing one.
              </p>
              <p>
                Web search stays off in this mode. Grounding routes every model through Gemini, which would collapse your three picks onto the same engine, so each model answers as itself instead.
              </p>
            </>
          )}
        </div>

        <div className="mt-7 space-y-2 text-[12px] leading-relaxed text-white/45">
          <p className="text-[11px] font-bold uppercase tracking-[0.16em] text-white/32">Current setup</p>
          <p>Responses: {responseLabels.join(', ')}</p>
          <p>{isSuperimpose ? 'Merges with' : 'Judge'}: {judgeLabel}</p>
        </div>
      </div>
    </ViewFade>
  );
}

// ===== Study model dropdown (composer toolbar) =====
//
// Compact picker that lives on the composer's top rail next to the paperclip /
// globe / thinking buttons. Opens upward (it sits at the bottom of the panel).
// Non-paid users see paid-only models locked with the required plan; the server
// is the real enforcer and applies the rolling Haiku daily cap.
function StudyModelDropdown({
  active,
  mode = 'single',
  bestOfModels = [],
  bestOfJudge = null,
  plan,
  email,
  onPick,
  onModeChange,
  onBestOfModels,
  onBestOfJudge,
  onOpenBestOfInfo,
  disabled,
}) {
  const [open, setOpen] = useState(false);
  // `mounted` keeps the portal in the DOM through the close animation; `shown`
  // drives the opacity/translate so the popover fades both in and out instead
  // of popping. Without the split, unmounting on close would kill the exit fade.
  const [mounted, setMounted] = useState(false);
  const [shown, setShown] = useState(false);
  // Fixed-position coords for the portaled popover. The composer card has
  // overflow-hidden, so an in-flow absolute popover gets clipped - we portal
  // it to <body> and pin it just above the button instead.
  const [pos, setPos] = useState(null);
  const btnRef = useRef(null);
  const popRef = useRef(null);
  const [candidateSlot, setCandidateSlot] = useState(0);

  const multiModelMode = mode === 'best-of' || mode === 'superimpose';
  const WIDTH = multiModelMode ? 318 : 256;
  const pickerModels = visibleStudyModels(email);
  const unlockedKeys = unlockedStudyModelKeys(email, plan);
  const canUseBestOf = unlockedKeys.length >= 4;
  const bestOfReady = bestOfModels.length === 3 && !!bestOfJudge;

  function pickBestOfCandidate(key) {
    if (!canUseStudyModel(key, plan) || key === bestOfJudge) return;
    const selectedIndex = bestOfModels.indexOf(key);
    if (selectedIndex >= 0) {
      setCandidateSlot(selectedIndex);
      return;
    }
    const next = [...bestOfModels];
    if (next.length < 3) {
      next.push(key);
      setCandidateSlot(Math.min(next.length, 2));
    } else {
      const slot = Math.min(Math.max(candidateSlot, 0), 2);
      next[slot] = key;
      setCandidateSlot((slot + 1) % 3);
    }
    onBestOfModels?.(next);
  }

  function place() {
    const b = btnRef.current?.getBoundingClientRect();
    if (!b) return;
    setPos({
      left: Math.max(8, Math.min(b.left, window.innerWidth - WIDTH - 8)),
      bottom: window.innerHeight - b.top + 6, // grow upward from button top
    });
  }
  function toggle() {
    if (!open) place();
    setOpen((o) => !o);
  }
  function openBestOfInfo() {
    setOpen(false);
    onOpenBestOfInfo?.();
  }

  // Drive the enter/exit fade. On open: mount, then flip `shown` on the next
  // frame so the transition runs from the initial (faded) state. On close:
  // clear `shown` to fade out, then unmount after the 150ms transition.
  useEffect(() => {
    if (open) {
      setMounted(true);
      const id = requestAnimationFrame(() => setShown(true));
      return () => cancelAnimationFrame(id);
    }
    setShown(false);
    const t = setTimeout(() => setMounted(false), 160);
    return () => clearTimeout(t);
  }, [open]);

  useEffect(() => {
    if (!open) return;
    function onDoc(e) {
      if (btnRef.current?.contains(e.target)) return;
      if (popRef.current?.contains(e.target)) return;
      setOpen(false);
    }
    function reposition() { place(); }
    document.addEventListener('mousedown', onDoc);
    window.addEventListener('resize', reposition);
    window.addEventListener('scroll', reposition, true);
    return () => {
      document.removeEventListener('mousedown', onDoc);
      window.removeEventListener('resize', reposition);
      window.removeEventListener('scroll', reposition, true);
    };
  }, [open]);

  useEffect(() => {
    if (open) place();
  }, [open, mode]);

  useEffect(() => {
    setCandidateSlot((slot) => Math.min(Math.max(slot, 0), Math.max(bestOfModels.length - 1, 0)));
  }, [bestOfModels.length]);

  return (
    <div className="relative">
      <button
        ref={btnRef}
        type="button"
        onClick={toggle}
        disabled={disabled}
        title="Choose model"
        className="flex items-center gap-1 pl-1.5 pr-1 py-1 rounded-lg text-gray-500 dark:text-blue-200/65 hover:text-gray-800 dark:hover:text-blue-50 hover:bg-white/40 dark:hover:bg-blue-500/[0.12] disabled:opacity-40 transition-colors"
      >
        <Cpu size={13} />
        <span className="text-[11px] font-semibold max-w-[96px] truncate">
          {mode === 'best-of'
            ? (bestOfReady ? 'Best of 3' : 'Best setup')
            : mode === 'superimpose'
              ? (bestOfReady ? 'Superimpose' : 'Super setup')
              : studyModelLabel(active)}
        </span>
        <ChevronDown size={11} className={`transition-transform ${open ? 'rotate-180' : ''}`} />
      </button>
      {mounted && pos && createPortal(
        <div
          ref={popRef}
          style={{
            position: 'fixed',
            left: pos.left,
            bottom: pos.bottom,
            width: WIDTH,
            zIndex: 9999,
            opacity: shown ? 1 : 0,
            transform: shown ? 'translateY(0)' : 'translateY(4px)',
            transition: 'opacity 0.15s ease-out, transform 0.15s ease-out',
          }}
          className="rounded-xl border border-gray-200 dark:border-white/[0.12] bg-white dark:bg-[#1b1b1f] shadow-2xl p-1.5"
        >
          <div className="grid grid-cols-[1fr_1fr_1fr_1.75rem] gap-1 rounded-lg bg-gray-100 dark:bg-white/[0.05] p-1 mb-1.5">
            <button
              type="button"
              onClick={() => onModeChange?.('single')}
              className={`px-2 py-1 rounded-md text-[11px] font-semibold transition-colors ${
                mode === 'single'
                  ? 'bg-white dark:bg-white/[0.11] text-gray-900 dark:text-white'
                  : 'text-gray-500 dark:text-white/45 hover:text-gray-800 dark:hover:text-white/75'
              }`}
            >
              Single
            </button>
            <button
              type="button"
              onClick={() => { if (canUseBestOf) onModeChange?.('best-of'); }}
              disabled={!canUseBestOf}
              title={canUseBestOf ? 'Compare three models, then have a fourth judge the winner' : 'Best of needs four unlocked models'}
              className={`px-2 py-1 rounded-md text-[11px] font-semibold transition-colors disabled:opacity-40 disabled:cursor-not-allowed ${
                mode === 'best-of'
                  ? 'bg-white dark:bg-white/[0.11] text-gray-900 dark:text-white'
                  : 'text-gray-500 dark:text-white/45 hover:text-gray-800 dark:hover:text-white/75'
              }`}
            >
              Best of
            </button>
            <button
              type="button"
              onClick={() => { if (canUseBestOf) onModeChange?.('superimpose'); }}
              disabled={!canUseBestOf}
              title={canUseBestOf ? 'Run three models, then have a fourth merge them into one answer' : 'Superimpose needs four unlocked models'}
              className={`px-2 py-1 rounded-md text-[11px] font-semibold transition-colors disabled:opacity-40 disabled:cursor-not-allowed ${
                mode === 'superimpose'
                  ? 'bg-white dark:bg-white/[0.11] text-gray-900 dark:text-white'
                  : 'text-gray-500 dark:text-white/45 hover:text-gray-800 dark:hover:text-white/75'
              }`}
            >
              Superimpose
            </button>
            <button
              type="button"
              onClick={openBestOfInfo}
              aria-label="Explain this mode"
              title="Explain this mode"
              className="grid h-7 w-7 place-items-center rounded-md text-gray-400 transition-colors hover:bg-white hover:text-gray-700 dark:text-white/40 dark:hover:bg-white/[0.09] dark:hover:text-white/75"
            >
              <CircleHelp size={14} />
            </button>
          </div>

          {mode === 'single' && pickerModels.map((m) => {
            const locked = !canUseStudyModel(m.key, plan);
            const lockLabel = locked ? requiredPlanLabelFor(m.key, plan) : null;
            return (
              <button
                key={m.key}
                type="button"
                onClick={() => { if (!locked) { onPick(m.key); setOpen(false); } }}
                disabled={locked}
                className={`w-full flex items-center gap-2.5 px-2 py-1.5 rounded-lg text-left transition-colors ${
                  active === m.key
                    ? 'bg-gray-100 dark:bg-white/[0.09]'
                    : locked
                      ? 'opacity-55 cursor-not-allowed'
                      : 'hover:bg-gray-50 dark:hover:bg-white/[0.06]'
                }`}
              >
                <div className="flex-1 min-w-0">
                  <p className="text-[12px] font-bold text-gray-900 dark:text-white flex items-center gap-1.5 truncate">
                    {m.label}
                    <span className="text-[9px] font-medium text-gray-400 dark:text-white/40">{m.provider}</span>
                    {locked && lockLabel && (
                      <span className="inline-flex items-center gap-0.5 text-[9px] font-semibold text-amber-600 dark:text-amber-300/80">
                        <Lock size={9} /> {lockLabel}
                      </span>
                    )}
                  </p>
                </div>
                {active === m.key && <Check size={13} className="text-gray-500 dark:text-white/80 shrink-0" strokeWidth={3} />}
              </button>
            );
          })}

          {multiModelMode && (
            <div className="max-h-[430px] overflow-y-auto pr-0.5">
              <div className="flex items-center justify-between px-1.5 py-1">
                <p className="text-[10px] font-bold uppercase tracking-[0.14em] text-gray-400 dark:text-white/35">Responses</p>
                <span className={`text-[10px] tabular-nums font-semibold ${bestOfModels.length === 3 ? 'text-emerald-500 dark:text-emerald-300/80' : 'text-amber-500 dark:text-amber-300/80'}`}>
                  {bestOfModels.length}/3
                </span>
              </div>
              {pickerModels.map((m) => {
                const locked = !canUseStudyModel(m.key, plan);
                const selectedIndex = bestOfModels.indexOf(m.key);
                const selected = selectedIndex >= 0;
                const blockedByJudge = m.key === bestOfJudge;
                const replacing = bestOfModels.length >= 3 && !selected;
                const disabledRow = locked || blockedByJudge;
                const lockLabel = locked ? requiredPlanLabelFor(m.key, plan) : null;
                return (
                  <button
                    key={`candidate-${m.key}`}
                    type="button"
                    onClick={() => { if (!disabledRow) pickBestOfCandidate(m.key); }}
                    disabled={disabledRow}
                    title={selected ? `Use slot ${selectedIndex + 1} for the next replacement` : replacing ? `Replace response model ${candidateSlot + 1}` : 'Add response model'}
                    className={`w-full flex items-center gap-2.5 px-2 py-1.5 rounded-lg text-left transition-colors ${
                      selected
                        ? 'bg-blue-500/[0.12] dark:bg-blue-500/[0.16] text-blue-700 dark:text-blue-100'
                        : disabledRow
                          ? 'opacity-50 cursor-not-allowed'
                          : 'hover:bg-gray-50 dark:hover:bg-white/[0.06]'
                    }`}
                  >
                    <div className="flex-1 min-w-0">
                      <p className="text-[12px] font-bold text-gray-900 dark:text-white flex items-center gap-1.5 truncate">
                        {m.label}
                        <span className="text-[9px] font-medium text-gray-400 dark:text-white/40">{m.provider}</span>
                        {locked && lockLabel && (
                          <span className="inline-flex items-center gap-0.5 text-[9px] font-semibold text-amber-600 dark:text-amber-300/80">
                            <Lock size={9} /> {lockLabel}
                          </span>
                        )}
                        {blockedByJudge && !locked && <span className="text-[9px] font-semibold text-gray-400 dark:text-white/35">{mode === 'superimpose' ? 'Merge' : 'Judge'}</span>}
                      </p>
                    </div>
                    {selected && (
                      <span className={`w-5 h-5 rounded-md bg-blue-500 text-white text-[10px] font-bold grid place-items-center shrink-0 ${
                        selectedIndex === candidateSlot ? 'ring-2 ring-blue-300/70 ring-offset-1 ring-offset-white dark:ring-offset-[#1b1b1f]' : ''
                      }`}>
                        {selectedIndex + 1}
                      </span>
                    )}
                    {!selected && replacing && !disabledRow && (
                      <span className="text-[9px] font-semibold text-blue-500/80 dark:text-blue-200/70 shrink-0">
                        Replace {candidateSlot + 1}
                      </span>
                    )}
                  </button>
                );
              })}

              <div className="flex items-center justify-between px-1.5 pb-1 pt-2.5 mt-1 border-t border-gray-200 dark:border-white/[0.08]">
                <p className="text-[10px] font-bold uppercase tracking-[0.14em] text-gray-400 dark:text-white/35">
                  {mode === 'superimpose' ? 'Merge AI' : 'Judge AI'}
                </p>
                <span className={`text-[10px] font-semibold ${bestOfJudge ? 'text-emerald-500 dark:text-emerald-300/80' : 'text-amber-500 dark:text-amber-300/80'}`}>
                  Fourth model
                </span>
              </div>
              {pickerModels.map((m) => {
                const locked = !canUseStudyModel(m.key, plan);
                const usedAsCandidate = bestOfModels.includes(m.key);
                const selected = bestOfJudge === m.key;
                const disabledRow = locked || usedAsCandidate;
                const lockLabel = locked ? requiredPlanLabelFor(m.key, plan) : null;
                return (
                  <button
                    key={`judge-${m.key}`}
                    type="button"
                    onClick={() => { if (!disabledRow) onBestOfJudge?.(m.key); }}
                    disabled={disabledRow}
                    className={`w-full flex items-center gap-2.5 px-2 py-1.5 rounded-lg text-left transition-colors ${
                      selected
                        ? 'bg-gray-100 dark:bg-white/[0.09]'
                        : disabledRow
                          ? 'opacity-50 cursor-not-allowed'
                          : 'hover:bg-gray-50 dark:hover:bg-white/[0.06]'
                    }`}
                  >
                    <div className="flex-1 min-w-0">
                      <p className="text-[12px] font-bold text-gray-900 dark:text-white flex items-center gap-1.5 truncate">
                        {m.label}
                        <span className="text-[9px] font-medium text-gray-400 dark:text-white/40">{m.provider}</span>
                        {locked && lockLabel && (
                          <span className="inline-flex items-center gap-0.5 text-[9px] font-semibold text-amber-600 dark:text-amber-300/80">
                            <Lock size={9} /> {lockLabel}
                          </span>
                        )}
                        {usedAsCandidate && !locked && <span className="text-[9px] font-semibold text-gray-400 dark:text-white/35">Response</span>}
                      </p>
                    </div>
                    {selected && <Check size={13} className="text-gray-500 dark:text-white/80 shrink-0" strokeWidth={3} />}
                  </button>
                );
              })}
            </div>
          )}
        </div>,
        document.body
      )}
    </div>
  );
}

// ===== Curriculum picker modal =====
//
// Lists the user's curricula. The "None" row clears the link. Clicking
// any course wires its id into the next study send's `context` so the
// system prompt scopes answers to that course.
function CurriculumPickerModal({ activeId, onClose, onPick }) {
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);
  useEffect(() => {
    listCurricula()
      .then((d) => setItems(d.curricula || []))
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);
  return (
    <ModalShell title="Use a curriculum" onClose={onClose}>
      <p className="text-[12px] text-gray-500 dark:text-gray-400 mb-3">
        Scopes answers to a course&apos;s lessons.
      </p>
      <div className="space-y-1.5 max-h-[380px] overflow-y-auto pr-1">
        <PickRow active={activeId == null} onClick={() => onPick(null)} title="None" sub="Free-form study chat" />
        {loading && <p className="text-[12px] text-gray-400 py-3 text-center">Loading…</p>}
        {!loading && items.map((c) => {
          const totalLessons = (c.units || []).reduce((s, u) => s + (u.lessons?.length || 0), 0);
          return (
            <PickRow
              key={c.id}
              active={activeId === c.id}
              onClick={() => onPick(c.id)}
              title={c.title}
              sub={`${c.units?.length || 0} unit${c.units?.length === 1 ? '' : 's'} · ${totalLessons} lesson${totalLessons === 1 ? '' : 's'}`}
            />
          );
        })}
      </div>
    </ModalShell>
  );
}

function PickRow({ active, onClick, title, sub }) {
  return (
    <button
      onClick={onClick}
      className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-xl border text-left transition-colors ${
        active
          ? 'border-white/30 bg-white/10 dark:bg-white/[0.07]'
          : 'border-gray-200 dark:border-white/[0.08] bg-white dark:bg-[#111111] hover:border-gray-400/60'
      }`}
    >
      <div className={`w-8 h-8 rounded-lg grid place-items-center shrink-0 ${active ? 'bg-white/20 text-white' : 'bg-white/10 dark:bg-white/[0.07] text-gray-500 dark:text-gray-400'}`}>
        <BookOpen size={15} />
      </div>
      <div className="flex-1 min-w-0">
        <p className="text-[13px] font-bold text-gray-900 dark:text-white truncate">{title}</p>
        <p className="text-[11px] text-gray-500 dark:text-gray-400 truncate">{sub}</p>
      </div>
      {active && <Check size={14} className="text-gray-500 dark:text-gray-300 shrink-0" strokeWidth={3} />}
    </button>
  );
}

// ===== Sources modal =====
//
// Add URLs (server-side fetch + extract) or PDF/text files (multipart
// upload + extract). Each chip shows a status. Send turns include the
// extracted text in the prompt context.
function SourcesModal({ sources, onClose, onChange }) {
  const [url, setUrl] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const fileRef = useRef(null);

  async function addUrl(e) {
    e?.preventDefault?.();
    const u = url.trim();
    if (!u || busy) return;
    setBusy(true); setError('');
    try {
      const s = await extractSourceUrl(u);
      onChange([...sources, { id: crypto.randomUUID?.() || String(Date.now()), ...s }]);
      setUrl('');
    } catch (err) {
      setError(err.message || 'Failed to fetch URL');
    } finally { setBusy(false); }
  }

  async function addFiles(e) {
    const files = Array.from(e.target.files || []);
    if (!files.length) return;
    setBusy(true); setError('');
    try {
      const { files: extracted = [] } = await extractFiles(files);
      const next = [...sources];
      for (const f of extracted) {
        if (f.error) { setError(`${f.name}: ${f.error}`); continue; }
        next.push({
          id: crypto.randomUUID?.() || String(Date.now() + Math.random()),
          title: f.name, kind: f.kind, content: f.text,
        });
      }
      onChange(next);
    } catch (err) {
      setError(err.message || 'Failed to extract files');
    } finally {
      setBusy(false);
      if (fileRef.current) fileRef.current.value = '';
    }
  }

  function remove(id) {
    onChange(sources.filter((s) => s.id !== id));
  }

  return (
    <ModalShell title="Sources" onClose={onClose}>
      <p className="text-[12px] text-gray-500 dark:text-gray-400 mb-3">
        Cited inline as [1], [2], …
      </p>

      <form onSubmit={addUrl} className="flex items-center gap-2 mb-2">
        <div className="relative flex-1">
          <Globe size={13} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
          <input
            value={url}
            onChange={(e) => setUrl(e.target.value)}
            placeholder="https://…"
            className="w-full pl-8 pr-3 py-2 rounded-lg border border-gray-200 dark:border-white/[0.08] bg-white dark:bg-[#111111] text-[13px] text-gray-900 dark:text-white outline-none focus:border-white/30"
          />
        </div>
        <button
          type="submit"
          disabled={!url.trim() || busy}
          className="inline-flex items-center gap-1 px-3 py-2 rounded-lg bg-white/15 hover:bg-white/25 text-white text-[12px] font-bold disabled:opacity-50 border border-white/20"
        >
          {busy ? <InlineProgress active /> : <><Plus size={11} /> Add URL</>}
        </button>
      </form>

      <button
        type="button"
        onClick={() => fileRef.current?.click()}
        disabled={busy}
        className="w-full inline-flex items-center justify-center gap-1.5 py-2 rounded-lg border border-dashed border-gray-300 dark:border-white/[0.08] text-[12px] text-gray-600 dark:text-gray-300 hover:border-gray-400 disabled:opacity-50"
      >
        <Paperclip size={12} /> Attach PDFs or text files
      </button>
      <input
        ref={fileRef}
        type="file"
        multiple
        accept="application/pdf,text/plain,text/markdown,.md,.txt"
        onChange={addFiles}
        className="hidden"
      />

      {error && <p className="mt-2 text-[11.5px] text-rose-500">{error}</p>}

      {sources.length > 0 && (
        <div className="mt-4 space-y-1.5 max-h-[260px] overflow-y-auto pr-1">
          {sources.map((s, i) => (
            <div key={s.id} className="flex items-center gap-3 px-3 py-2 rounded-xl border border-gray-200 dark:border-white/[0.08] bg-gray-50 dark:bg-[#111111]">
              <span className="text-[10px] font-mono font-bold text-gray-400 dark:text-gray-500 w-5 text-center">[{i + 1}]</span>
              <div className="flex-1 min-w-0">
                <p className="text-[12.5px] font-semibold text-gray-900 dark:text-white truncate">{s.title || s.url || 'Source'}</p>
                {s.url && <p className="text-[10.5px] text-gray-500 dark:text-gray-400 truncate">{s.url}</p>}
                {!s.url && s.content && <p className="text-[10.5px] text-gray-500 dark:text-gray-400">{(s.content.split(/\s+/).filter(Boolean).length)} words</p>}
              </div>
              <button onClick={() => remove(s.id)} aria-label="Remove" className="p-1 text-gray-400 hover:text-rose-500">
                <X size={13} />
              </button>
            </div>
          ))}
        </div>
      )}
    </ModalShell>
  );
}

// ===== Modal shell =====
function ModalShell({ title, onClose, children }) {
  useEffect(() => {
    function onKey(e) { if (e.key === 'Escape') onClose(); }
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);
  return (
    <div className="fixed inset-0 flex items-center justify-center px-4" style={{ zIndex: Z.modal }}>
      <button aria-label="Close" onClick={onClose} className="absolute inset-0 bg-black/30 dark:bg-black/55 backdrop-blur-[2px] animate-fade-in" />
      <div className="relative w-full max-w-md rounded-2xl bg-white dark:bg-[#1a1a1a] border border-gray-200 dark:border-white/10 shadow-2xl p-5">
        <div className="flex items-center justify-between mb-3">
          <h3 className="text-[14.5px] font-bold text-gray-900 dark:text-white">{title}</h3>
          <button onClick={onClose} className="w-8 h-8 rounded-full grid place-items-center text-gray-400 hover:text-gray-700 dark:hover:text-gray-200">
            <X size={15} />
          </button>
        </div>
        {children}
      </div>
    </div>
  );
}
