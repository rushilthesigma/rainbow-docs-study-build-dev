import { useState, useRef, useEffect } from 'react';
import { createPortal } from 'react-dom';
import {
  Calculator, Pen, Eraser, Undo2, Trash2, Check,
  ArrowLeft, ClipboardCheck, Settings, MessageSquare, Layers, RotateCcw,
  Play, ChevronLeft, ChevronRight, ListChecks, Cpu, ChevronDown, Lock,
} from 'lucide-react';
import { sendMathTutorMessage, generateProblemSet } from '../../../api/mathTutor';
import MathProblemSet from './MathProblemSet';
import ChatContainer from '../../chat/ChatContainer';
import { errorChatMessage } from '../../../utils/aiErrors';
import useBrowserBack from '../../../hooks/useBrowserBack';
import { InlineProgress } from '../../shared/ProgressBar';
import Button from '../../shared/Button';
import { useAuth } from '../../../context/AuthContext';
import { planFromUser } from '../../billing/modelAccess';
import { syncData } from '../../../api/auth';
import {
  STUDY_MODELS, resolveStudyModel, canUseStudyModel, requiredPlanLabelFor, studyModelLabel,
} from '../../study/studyModels';

const STORAGE_KEY = 'covalent-math-tutor-state-v1';
const PEN_SIZES = { thin: 2, medium: 4, thick: 7 };

// QBpedia-style surfaces — flat, notes-like rather than glassy: subtle fields
// with a blue focus ring, uppercase-tracked section labels, neutral buttons
// whose identity lives in a colored icon, and quiet icon-only header actions.
const FIELD_CLS =
  'w-full px-3.5 py-2.5 rounded-lg border border-white/[0.10] bg-white/[0.04] text-sm text-white/90 placeholder-white/30 outline-none focus:border-blue-400/50 focus:ring-2 focus:ring-blue-400/20 transition-colors';
const LABEL_CLS =
  'text-[11px] font-bold uppercase tracking-[0.16em] text-white/40 flex items-center gap-1.5';
export const NEUTRAL_BTN =
  'inline-flex items-center justify-center gap-1.5 rounded-lg font-medium border border-white/[0.06] bg-white/[0.03] text-white/65 hover:text-white/90 hover:bg-white/[0.06] hover:border-white/[0.12] transition-colors';
const HEADER_ICON_BTN =
  'p-1.5 rounded-md text-white/35 hover:text-white/70 hover:bg-white/[0.05] transition-colors';


function loadState() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    return JSON.parse(raw);
  } catch { return null; }
}
function saveState(s) {
  try { localStorage.setItem(STORAGE_KEY, JSON.stringify(s)); } catch {}
}

// ============== CANVAS ==============
// Strokes are recorded as { points: [{x,y,t}], tool, size } so the work can be
// re-rendered and animated back ("replay your work"). `initialStrokes` seeds
// the canvas with persisted work (remount per problem via `key`);
// `onStrokesChange` reports the live stroke list so the parent can persist it.
export function TutorCanvas({ onCaptureReady, initialStrokes = null, onStrokesChange = null }) {
  const canvasRef = useRef(null);
  const ctxRef    = useRef(null);
  const [tool, setTool]       = useState('pen');
  const [penSize, setPenSize] = useState('medium');
  const [drawing, setDrawing] = useState(false);
  const [replaying, setReplaying] = useState(false);
  const strokesRef       = useRef(
    Array.isArray(initialStrokes) ? initialStrokes.map(s => ({ ...s, points: [...s.points] })) : []
  );
  const currentStrokeRef = useRef([]);
  const animRef          = useRef(null);

  function clearCanvas(ctx, w, h) { ctx.clearRect(0, 0, w, h); }
  const cloneStrokes = () => strokesRef.current.map(s => ({ ...s, points: [...s.points] }));

  // Draw the first `count` points of a single stroke with its tool/size.
  function drawStrokeUpTo(ctx, s, count) {
    if (count < 1 || !s.points.length) return;
    if (s.tool === 'eraser') {
      ctx.save();
      ctx.globalCompositeOperation = 'destination-out';
      ctx.strokeStyle = 'rgba(0,0,0,1)';
    } else {
      ctx.strokeStyle = '#ffffff';
    }
    ctx.lineWidth = s.size;
    ctx.beginPath();
    const n = Math.min(count, s.points.length);
    for (let i = 0; i < n; i++) {
      const p = s.points[i];
      if (i === 0) ctx.moveTo(p.x, p.y); else ctx.lineTo(p.x, p.y);
    }
    ctx.stroke();
    if (s.tool === 'eraser') ctx.restore();
  }

  function replayStrokes() {
    const canvas = canvasRef.current;
    if (!canvas || !ctxRef.current) return;
    const rect = canvas.getBoundingClientRect();
    const ctx  = ctxRef.current;
    clearCanvas(ctx, rect.width, rect.height);
    for (const s of strokesRef.current) drawStrokeUpTo(ctx, s, s.points.length);
  }

  function stopAnim() {
    if (animRef.current) { cancelAnimationFrame(animRef.current); animRef.current = null; }
  }

  // Animate the recorded strokes being drawn back, in order, over ~2.8s.
  function animateReplay() {
    const canvas = canvasRef.current;
    const ctx = ctxRef.current;
    if (!canvas || !ctx) return;
    const strokes = strokesRef.current;
    const totalPoints = strokes.reduce((n, s) => n + s.points.length, 0);
    if (!totalPoints) return;
    stopAnim();
    setReplaying(true);
    const rect = canvas.getBoundingClientRect();
    const DURATION = 2800;
    const start = performance.now();
    const step = (now) => {
      const frac = Math.min(1, (now - start) / DURATION);
      const reveal = Math.max(1, Math.floor(frac * totalPoints));
      clearCanvas(ctx, rect.width, rect.height);
      let remaining = reveal;
      for (const s of strokes) {
        if (remaining <= 0) break;
        drawStrokeUpTo(ctx, s, Math.min(s.points.length, remaining));
        remaining -= s.points.length;
      }
      if (frac < 1) {
        animRef.current = requestAnimationFrame(step);
      } else {
        animRef.current = null;
        setReplaying(false);
        replayStrokes();
      }
    };
    animRef.current = requestAnimationFrame(step);
  }

  useEffect(() => {
    if (typeof onCaptureReady !== 'function') return;
    onCaptureReady({
      capture: () => canvasRef.current?.toDataURL('image/png') || null,
      clear:   () => { strokesRef.current = []; stopAnim(); setReplaying(false); replayStrokes(); onStrokesChange?.([]); },
      isEmpty: () => strokesRef.current.length === 0,
      getStrokes: () => cloneStrokes(),
      replay: () => animateReplay(),
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [onCaptureReady]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    function sync() {
      const dpr  = window.devicePixelRatio || 1;
      const rect = canvas.getBoundingClientRect();
      if (rect.width === 0 || rect.height === 0) return;
      canvas.width  = Math.round(rect.width  * dpr);
      canvas.height = Math.round(rect.height * dpr);
      const ctx = canvas.getContext('2d');
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      ctx.lineCap  = 'round';
      ctx.lineJoin = 'round';
      ctxRef.current = ctx;
      clearCanvas(ctx, rect.width, rect.height);
      replayStrokes();
    }
    sync();
    const ro = new ResizeObserver(sync);
    ro.observe(canvas);
    return () => { ro.disconnect(); stopAnim(); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function getPos(e) {
    const nativeEvent = e.nativeEvent || e;
    const touch = e.touches?.[0];
    if (touch) {
      const rect = canvasRef.current.getBoundingClientRect();
      return { x: touch.clientX - rect.left, y: touch.clientY - rect.top };
    }
    if (typeof nativeEvent.offsetX === 'number') return { x: nativeEvent.offsetX, y: nativeEvent.offsetY };
    const rect = canvasRef.current.getBoundingClientRect();
    return { x: e.clientX - rect.left, y: e.clientY - rect.top };
  }

  function startDraw(e) {
    e.preventDefault();
    // Drawing during a replay cancels it and keeps the finished work on screen.
    if (animRef.current) { stopAnim(); setReplaying(false); replayStrokes(); }
    setDrawing(true);
    const pos = getPos(e);
    currentStrokeRef.current = [{ ...pos, t: performance.now() }];
    const ctx = ctxRef.current;
    if (tool === 'eraser') {
      ctx.save();
      ctx.globalCompositeOperation = 'destination-out';
      ctx.strokeStyle = 'rgba(0,0,0,1)';
      ctx.lineWidth   = 22;
    } else {
      ctx.strokeStyle = '#ffffff';
      ctx.lineWidth   = PEN_SIZES[penSize];
    }
    ctx.beginPath();
    ctx.moveTo(pos.x, pos.y);
  }
  function draw(e) {
    if (!drawing) return;
    e.preventDefault();
    const pos = getPos(e);
    currentStrokeRef.current.push({ ...pos, t: performance.now() });
    ctxRef.current.lineTo(pos.x, pos.y);
    ctxRef.current.stroke();
  }
  function endDraw() {
    if (!drawing) return;
    setDrawing(false);
    const ctx = ctxRef.current;
    if (tool === 'eraser') ctx.restore();
    if (currentStrokeRef.current.length > 1) {
      strokesRef.current.push({ points: currentStrokeRef.current, tool, size: tool === 'eraser' ? 22 : PEN_SIZES[penSize] });
      onStrokesChange?.(cloneStrokes());
    }
    currentStrokeRef.current = [];
  }
  function handleUndo()  { strokesRef.current.pop(); replayStrokes(); onStrokesChange?.(cloneStrokes()); }
  function handleClear() { strokesRef.current = []; replayStrokes(); onStrokesChange?.([]); }

  const iconBtn = (active, onClick, children, title, disabled = false) => (
    <button
      onClick={onClick}
      title={title}
      disabled={disabled}
      className={`w-7 h-7 rounded-lg flex items-center justify-center transition-colors disabled:opacity-30 disabled:cursor-not-allowed ${
        active ? 'bg-white/15 text-white' : 'text-white/35 hover:text-white/80 hover:bg-white/10'
      }`}
    >
      {children}
    </button>
  );

  return (
    <div className="flex flex-col h-full border border-white/[0.08] rounded-xl overflow-hidden bg-white/20 dark:bg-black/20">
      {/* Canvas toolbar */}
      <div className="flex items-center gap-1 px-3 py-2 border-b border-white/[0.06] bg-white/10 dark:bg-black/10 flex-shrink-0">
        {iconBtn(tool === 'pen',    () => setTool('pen'),    <Pen    size={13} />, 'Pen')}
        {iconBtn(tool === 'eraser', () => setTool('eraser'), <Eraser size={13} />, 'Eraser')}
        <div className="w-px h-4 bg-white/10 mx-1" />
        {Object.keys(PEN_SIZES).map(s => {
          const active = penSize === s && tool === 'pen';
          return (
            <button
              key={s}
              onClick={() => setPenSize(s)}
              title={s}
              className={`w-7 h-7 rounded-lg flex items-center justify-center transition-colors ${
                active ? 'bg-white/[0.08] ring-1 ring-white/20' : 'hover:bg-white/10'
              }`}
            >
              <div
                className="rounded-full bg-white transition-opacity"
                style={{ width: PEN_SIZES[s], height: PEN_SIZES[s], opacity: active ? 0.75 : 0.3 }}
              />
            </button>
          );
        })}
        <div className="w-px h-4 bg-white/10 mx-1" />
        {iconBtn(false, handleUndo,  <Undo2  size={13} />, 'Undo')}
        {iconBtn(false, handleClear, <Trash2 size={13} />, 'Clear')}
        {iconBtn(replaying, animateReplay, <Play size={13} />, 'Replay your work')}
        <div className="flex-1" />
        <span className="text-[10px] text-white/25">{replaying ? 'Replaying…' : 'Draw · tap "Get feedback" to share with tutor'}</span>
      </div>
      <div className="flex-1 relative min-h-0">
        <canvas
          ref={canvasRef}
          className="absolute inset-0 w-full h-full cursor-crosshair"
          style={{ background: document.documentElement.classList.contains('dark') ? 'rgba(0,0,0,0.55)' : 'rgba(255,255,255,0.55)' }}
          onMouseDown={startDraw} onMouseMove={draw} onMouseUp={endDraw} onMouseLeave={endDraw}
          onTouchStart={startDraw} onTouchMove={draw} onTouchEnd={endDraw}
        />
      </div>
    </div>
  );
}

// ============== MODEL PICKER ==============
// Compact dropdown (portaled so the app window's overflow doesn't clip it),
// sharing the Study Mode model registry. Locked tiers show their required plan.
function MathModelPicker({ active, plan, onPick, disabled = false }) {
  const [open, setOpen] = useState(false);
  const [pos, setPos]   = useState(null);
  const btnRef = useRef(null);
  const popRef = useRef(null);

  useEffect(() => {
    if (!open) return;
    const place = () => {
      const r = btnRef.current?.getBoundingClientRect();
      if (r) setPos({ left: Math.min(r.left, window.innerWidth - 232), top: r.bottom + 6 });
    };
    place();
    const onDoc = (e) => {
      if (popRef.current?.contains(e.target) || btnRef.current?.contains(e.target)) return;
      setOpen(false);
    };
    document.addEventListener('mousedown', onDoc);
    window.addEventListener('resize', place);
    return () => { document.removeEventListener('mousedown', onDoc); window.removeEventListener('resize', place); };
  }, [open]);

  return (
    <>
      <button
        ref={btnRef}
        onClick={() => !disabled && setOpen(o => !o)}
        disabled={disabled}
        title="Choose tutor model"
        className={`flex items-center gap-1 px-2 h-7 rounded-lg text-[11px] font-semibold transition-colors disabled:opacity-40 ${
          open ? 'bg-white/15 text-white' : 'text-white/40 hover:text-white/80 hover:bg-white/10'
        }`}
      >
        <Cpu size={13} />
        <span className="max-w-[78px] truncate">{studyModelLabel(active)}</span>
        <ChevronDown size={11} className={`transition-transform ${open ? 'rotate-180' : ''}`} />
      </button>
      {open && pos && createPortal(
        <div
          ref={popRef}
          style={{ position: 'fixed', left: pos.left, top: pos.top, width: 224, zIndex: 9999 }}
          className="rounded-xl border border-white/10 bg-white dark:bg-[#1b1b1f] shadow-2xl p-1.5 animate-fade-in"
        >
          {STUDY_MODELS.map((m) => {
            const locked = !canUseStudyModel(m.key, plan);
            const lockLabel = locked ? requiredPlanLabelFor(m.key) : null;
            return (
              <button
                key={m.key}
                onClick={() => { if (!locked) { onPick(m.key); setOpen(false); } }}
                disabled={locked}
                className={`w-full flex items-center gap-2.5 px-2 py-1.5 rounded-lg text-left transition-colors ${
                  active === m.key ? 'bg-white/[0.09]' : locked ? 'opacity-55 cursor-not-allowed' : 'hover:bg-white/[0.06]'
                }`}
              >
                <div className="flex-1 min-w-0">
                  <p className="text-[12px] font-bold text-gray-900 dark:text-white flex items-center gap-1.5 truncate">
                    {m.label}
                    <span className="text-[9px] font-medium text-white/40">{m.provider}</span>
                    {locked && lockLabel && (
                      <span className="inline-flex items-center gap-0.5 text-[9px] font-semibold text-amber-300/80">
                        <Lock size={9} /> {lockLabel}
                      </span>
                    )}
                  </p>
                  <p className="text-[10px] text-white/45 truncate">{m.blurb}</p>
                </div>
                {active === m.key && <Check size={13} className="text-white/80 shrink-0" strokeWidth={3} />}
              </button>
            );
          })}
        </div>,
        document.body,
      )}
    </>
  );
}

// ============== MAIN APP ==============
export default function MathTutorApp({ seedTopic = null, seedProblemSet = null, onBack = null, defaultMode = 'both' } = {}) {
  const persisted = loadState();
  // Problem-set mode: when set, render the standalone problem-set runner.
  // Seeded from a curriculum `problem_set` lesson, or started on the setup screen.
  const [psConfig, setPsConfig] = useState(seedProblemSet || null);
  const [setupKind, setSetupKind] = useState('tutor'); // 'tutor' | 'problemset'
  const [psCount, setPsCount] = useState(5);
  const [standaloneStrokes, setStandaloneStrokes] = useState(() => persisted?.strokes || []);
  const [view, setView] = useState(seedTopic ? 'tutor' : (persisted?.view || 'setup'));
  const [mode, setMode] = useState(() => {
    const valid = ['both', 'tutor', 'canvas'];
    if (defaultMode && valid.includes(defaultMode)) return defaultMode;
    if (persisted?.mode && valid.includes(persisted.mode)) return persisted.mode;
    return 'both';
  });
  useBrowserBack(!onBack && view === 'tutor', () => setView('setup'));
  const [topic, setTopic]                       = useState(seedTopic || persisted?.topic || '');
  const [customInstructions, setCustomInstructions] = useState(persisted?.customInstructions || '');
  const [messages, setMessages]                 = useState(seedTopic ? [] : (persisted?.messages || []));
  const [streaming, setStreaming]               = useState(false);
  const [streamingContent, setStreamingContent] = useState('');
  const [streamingThinking, setStreamingThinking] = useState('');
  const [error, setError]                       = useState(null);
  const [input, setInput]                       = useState('');
  const [showSettings, setShowSettings]         = useState(false);
  const seedKickedOff = useRef(false);
  const streamRef  = useRef('');
  const thinkRef   = useRef('');
  const abortRef   = useRef(null);
  const captureRef = useRef(null);
  const messagesRef = useRef(messages);
  messagesRef.current = messages;

  // Per-session model picker (shares the Study Mode registry; persisted under
  // preferences.mathTutorModel). A ref mirrors the pick so doSend reads the
  // latest value through memoized callbacks.
  const { user, fetchUser } = useAuth();
  const plan = planFromUser(user);
  const [model, setModel] = useState(() => resolveStudyModel(user?.data?.preferences?.mathTutorModel, plan));
  const modelRef = useRef(model);
  modelRef.current = model;
  useEffect(() => {
    setModel(resolveStudyModel(user?.data?.preferences?.mathTutorModel, plan));
  }, [user?.data?.preferences?.mathTutorModel, plan]);
  async function pickModel(key) {
    if (!canUseStudyModel(key, plan)) return;
    setModel(key);
    try {
      await syncData({ preferences: { ...(user?.data?.preferences || {}), mathTutorModel: key } });
      await fetchUser();
    } catch (err) { console.error('save mathTutorModel failed:', err); }
  }

  useEffect(() => {
    if (seedTopic) return;
    const trimmed = messages.slice(-50).map(m => ({
      role: m.role, content: (m.content || '').slice(0, 3000), _edited: m._edited, _error: m._error,
    }));
    saveState({ view, mode, topic, customInstructions, messages: trimmed, strokes: standaloneStrokes });
  }, [view, mode, topic, customInstructions, messages, standaloneStrokes, seedTopic]);

  useEffect(() => () => abortRef.current?.(), []);

  function doSend({ text, phase = 'lesson', imageDataUrl = null, hidden = false, topicOverride = null }) {
    if (streaming) return;
    const userMsg = { role: 'user', content: text, timestamp: new Date().toISOString() };
    if (imageDataUrl) userMsg.images = [{ dataUrl: imageDataUrl, mimeType: 'image/png' }];
    if (hidden) userMsg._hidden = true;
    setMessages(prev => [...prev, userMsg]);
    setStreaming(true);
    setStreamingContent('');
    setStreamingThinking('');
    streamRef.current = '';
    thinkRef.current = '';

    const history = [...messages, userMsg].slice(-50).map((m, i, arr) => {
      const isLast = i === arr.length - 1;
      return { role: m.role, content: m.content, ...(isLast && m.images ? { images: m.images } : {}) };
    });

    const body = {
      topic: (topicOverride ?? topic).trim(),
      customInstructions: customInstructions.trim(),
      phase,
      model: modelRef.current,
      messages: history.map(({ role, content }) => ({ role, content })),
      images: imageDataUrl ? [{ dataUrl: imageDataUrl, mimeType: 'image/png' }] : [],
    };

    const abort = sendMathTutorMessage(body, {
      onChunk: (c) => { streamRef.current += c; setStreamingContent(streamRef.current); },
      onThinking: (t) => { thinkRef.current += t; setStreamingThinking(thinkRef.current); },
      onDone: () => {
        const full = streamRef.current;
        const think = thinkRef.current;
        if (full) setMessages(m => [...m, { role: 'assistant', content: full, thinking: think || undefined, timestamp: new Date().toISOString() }]);
        setStreaming(false); setStreamingContent(''); setStreamingThinking(''); streamRef.current = ''; thinkRef.current = '';
      },
      onError: (err) => {
        setMessages(m => [...m, errorChatMessage(err)]);
        setStreaming(false); setStreamingContent(''); setStreamingThinking(''); streamRef.current = ''; thinkRef.current = '';
      },
    });
    abortRef.current = abort;
  }

  function startTutor() {
    if (!topic.trim()) return;
    setView('tutor');
    setMessages([]);
    setError(null);
    setTimeout(() => doSend({ text: `Teach me "${topic.trim()}" - short and tight. One-sentence definition, one worked example in KaTeX, then one problem for the canvas. Nothing else.`, phase: 'lesson', hidden: true }), 50);
  }

  // Setup screen "Start": branch on the chosen kind (guided tutor vs problem set).
  function handleSetupStart() {
    if (!topic.trim()) return;
    if (setupKind === 'problemset') setPsConfig({ topic: topic.trim(), count: psCount });
    else startTutor();
  }


  useEffect(() => {
    if (!seedTopic || seedKickedOff.current) return;
    seedKickedOff.current = true;
    setTimeout(() => doSend({
      text: `Teach me about "${seedTopic}". Give me a real lesson - definition, why it matters, worked examples in KaTeX, then one problem to try on the canvas.`,
      phase: 'lesson', hidden: true,
    }), 60);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [seedTopic]);

  function handleSend(text) {
    if (!text.trim() || streaming) return;
    doSend({ text: text.trim(), phase: 'lesson' });
    setInput('');
  }
  function handleFeedback() {
    const png = captureRef.current?.capture?.();
    if (!png || captureRef.current.isEmpty()) { setError('Draw something on the canvas first.'); setTimeout(() => setError(null), 2500); return; }
    doSend({ text: 'Here is my current work. Give me step-by-step feedback - point out the step where I am, whether it\'s correct, and hint at the next step without solving it for me.', phase: 'practice', imageDataUrl: png });
  }
  function handleGrade() {
    const png = captureRef.current?.capture?.();
    if (!png || captureRef.current.isEmpty()) { setError('Draw your solution on the canvas before asking for a grade.'); setTimeout(() => setError(null), 2500); return; }
    doSend({ text: 'Here is my final work. Grade it out of 10 and show me the model solution.', phase: 'grade', imageDataUrl: png });
  }
  function handleReset() {
    if (!confirm('Reset this tutor session? Your conversation and canvas will be cleared.')) return;
    setMessages([]); setStreamingContent(''); streamRef.current = '';
    captureRef.current?.clear?.(); setError(null); saveState(null);
  }
  function handleStop() { abortRef.current?.(); setStreaming(false); }

  // ─── Problem-set runner ─────────────────────────────────────────────────────
  if (psConfig) {
    return (
      <MathProblemSet
        topic={psConfig.topic}
        count={psConfig.count || 5}
        presetProblems={psConfig.problems || null}
        customInstructions={customInstructions}
        onBack={() => { if (onBack) onBack(); else { setPsConfig(null); setView('setup'); } }}
      />
    );
  }

  // ─── Setup view ─────────────────────────────────────────────────────────────
  if (view === 'setup') {
    return (
      <div key="mt-setup" className="h-full overflow-y-auto bg-transparent animate-view-fade flex flex-col justify-center">
        <div className="max-w-sm mx-auto w-full space-y-3 px-1 pb-4">
          {/* Quiet header */}
          <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-white/30">Math Tutor</p>

          {/* Topic */}
          <input
            value={topic}
            onChange={e => setTopic(e.target.value)}
            onKeyDown={e => e.key === 'Enter' && topic.trim() && handleSetupStart()}
            placeholder="Topic — quadratics, integrals, vectors…"
            className={FIELD_CLS}
            autoFocus
          />

          {/* Format + problem count inline */}
          <div className="flex items-center gap-2">
            <div className="flex items-center gap-1 bg-white/[0.03] border border-white/[0.07] rounded-lg p-0.5">
              {[
                { id: 'tutor',      label: 'Tutor',   Icon: MessageSquare },
                { id: 'problemset', label: 'Problems', Icon: ListChecks },
              ].map(o => (
                <button
                  key={o.id}
                  onClick={() => setSetupKind(o.id)}
                  className={`inline-flex items-center gap-1 px-2.5 h-7 rounded-md text-[11px] font-medium transition-colors ${
                    setupKind === o.id
                      ? 'bg-blue-500/20 text-blue-300 ring-1 ring-blue-400/30'
                      : 'text-white/40 hover:text-white/70'
                  }`}
                >
                  <o.Icon size={11} /> {o.label}
                </button>
              ))}
            </div>

            {setupKind === 'problemset' && (
              <div className="flex items-center gap-1 animate-fade-in">
                {[3, 5, 8].map(n => (
                  <button
                    key={n}
                    onClick={() => setPsCount(n)}
                    className={`w-8 h-8 rounded-lg border text-[11px] font-semibold transition-colors ${
                      psCount === n
                        ? 'bg-blue-500/20 border-blue-400/30 text-blue-300'
                        : 'bg-white/[0.03] border-white/[0.06] text-white/40 hover:text-white/70 hover:bg-white/[0.06]'
                    }`}
                  >
                    {n}
                  </button>
                ))}
              </div>
            )}

            <div className="flex-1" />
            <Button onClick={handleSetupStart} disabled={!topic.trim()} size="sm">
              {setupKind === 'problemset' ? <><ListChecks size={13} /> Start</> : <>Start</>}
            </Button>
          </div>

          {/* Custom instructions - collapsed by default */}
          <div className="space-y-2">
            <button
              onClick={() => setShowSettings(s => !s)}
              className={`${LABEL_CLS} hover:text-white/60 transition-colors`}
            >
              <Settings size={11} />
              {showSettings ? 'Hide instructions' : 'Custom instructions'}
            </button>
            {showSettings && (
              <textarea
                value={customInstructions}
                onChange={e => setCustomInstructions(e.target.value)}
                rows={2}
                placeholder="How should the tutor teach you?"
                className={`${FIELD_CLS} resize-none leading-relaxed animate-fade-in`}
              />
            )}
          </div>
        </div>
      </div>
    );
  }

  // ─── Tutor view (chat + canvas) ─────────────────────────────────────────────
  const visibleIndices = messages.map((m, i) => m._hidden ? -1 : i).filter(i => i >= 0);
  const visibleMessages = visibleIndices.map(i => messages[i]);

  function onUserEditMessage(visibleIdx, newContent) {
    if (streaming) return;
    const realIdx = visibleIndices[visibleIdx];
    if (realIdx == null) return;
    if (abortRef.current) try { abortRef.current(); } catch {}
    setMessages(prev => prev.slice(0, realIdx));
    setTimeout(() => doSend({ text: newContent, phase: 'practice' }), 30);
  }

  function onAiInstruct(visibleIdx, instruction) {
    if (streaming || !instruction?.trim()) return;
    const realIdx = visibleIndices[visibleIdx];
    if (realIdx == null) return;
    if (abortRef.current) try { abortRef.current(); } catch {}
    const truncated = messages.slice(0, realIdx);
    setMessages(truncated);
    const apiHistory = truncated.map(m => ({ role: m.role, content: m.content }));
    if (apiHistory.length && apiHistory[apiHistory.length - 1].role === 'user') {
      apiHistory[apiHistory.length - 1] = {
        ...apiHistory[apiHistory.length - 1],
        content: `${apiHistory[apiHistory.length - 1].content}\n\n[SYSTEM NOTE: Regenerate your previous answer - this time ${instruction.trim()}. Do NOT acknowledge this instruction in your response. Just produce the revised answer directly.]`,
      };
    }
    setStreaming(true); setStreamingContent(''); setStreamingThinking(''); streamRef.current = ''; thinkRef.current = '';
    const body = { topic: topic.trim(), customInstructions: customInstructions.trim(), phase: 'practice', model: modelRef.current, messages: apiHistory, images: [] };
    const abort = sendMathTutorMessage(body, {
      onChunk: (c) => { streamRef.current += c; setStreamingContent(streamRef.current); },
      onThinking: (t) => { thinkRef.current += t; setStreamingThinking(thinkRef.current); },
      onDone: () => {
        const full = streamRef.current;
        const think = thinkRef.current;
        if (full) setMessages(m => [...m, { role: 'assistant', content: full, thinking: think || undefined, timestamp: new Date().toISOString(), _edited: true }]);
        setStreaming(false); setStreamingContent(''); setStreamingThinking(''); streamRef.current = ''; thinkRef.current = '';
      },
      onError: (err) => {
        setMessages(m => [...m, errorChatMessage(err)]);
        setStreaming(false); setStreamingContent(''); setStreamingThinking(''); streamRef.current = ''; thinkRef.current = '';
      },
    });
    abortRef.current = abort;
  }

  return (
    <div key="mt-tutor" className="flex flex-col h-full bg-transparent animate-view-fade" style={{ fontFamily: '-apple-system, BlinkMacSystemFont, "SF Pro Display", system-ui, sans-serif' }}>
      {/* Header — notes-style: inline back link + topic, quiet icon actions */}
      <div className="flex items-center gap-2.5 mb-3 flex-shrink-0">
        <button
          onClick={() => setView('setup')}
          className="flex items-center gap-2 text-sm text-white/35 hover:text-white/60 transition-colors flex-shrink-0"
        >
          <ArrowLeft size={16} /> Math Tutor
        </button>
        <span className="w-1 h-1 rounded-full bg-white/20 flex-shrink-0" />
        <span className="text-sm font-bold text-white/90 truncate">{topic}</span>
        <div className="flex-1" />

        <MathModelPicker active={model} plan={plan} onPick={pickModel} disabled={streaming} />

        {/* Mode toggle */}
        <div className="flex items-center gap-0.5 bg-white/[0.04] border border-white/[0.08] rounded-lg p-0.5">
          {[
            { id: 'tutor',  Icon: MessageSquare, label: 'Tutor only' },
            { id: 'both',   Icon: Layers,        label: 'Tutor + Canvas' },
            { id: 'canvas', Icon: Pen,           label: 'Canvas only' },
          ].map(o => (
            <button
              key={o.id}
              onClick={() => setMode(o.id)}
              title={o.label}
              className={`w-7 h-7 rounded-md flex items-center justify-center transition-colors ${
                mode === o.id ? 'bg-white/10 text-white' : 'text-white/30 hover:text-white/70'
              }`}
            >
              <o.Icon size={12} />
            </button>
          ))}
        </div>

        <button
          onClick={() => setShowSettings(s => !s)}
          title="Custom instructions"
          className={`p-1.5 rounded-md transition-colors ${
            showSettings ? 'bg-white/[0.08] text-white/70' : 'text-white/35 hover:text-white/70 hover:bg-white/[0.05]'
          }`}
        >
          <Settings size={14} />
        </button>
        <button
          onClick={handleReset}
          title="New session"
          className={HEADER_ICON_BTN}
        >
          <RotateCcw size={14} />
        </button>
      </div>

      {showSettings && (
        <div className="mb-3 flex-shrink-0 animate-fade-in space-y-2">
          <label className={LABEL_CLS}><Settings size={11} /> Custom instructions (live)</label>
          <textarea
            value={customInstructions}
            onChange={e => setCustomInstructions(e.target.value)}
            rows={2}
            placeholder="Changes apply to the next message"
            className={`${FIELD_CLS} resize-none`}
          />
        </div>
      )}

      {/* Main split */}
      <div className={`flex-1 min-h-0 grid gap-3 bg-transparent ${
        mode === 'both' ? 'grid-cols-1 md:grid-cols-2' : 'grid-cols-1'
      }`}>
        {/* Chat column */}
        <div className={`flex flex-col min-h-0 overflow-hidden ${
          mode === 'canvas' ? 'hidden' : ''
        }`}>
          <div className="flex-1 min-h-0 overflow-hidden">
            <ChatContainer
              messages={visibleMessages}
              streamingContent={streaming ? streamingContent : ''}
              streamingThinking={streaming ? streamingThinking : ''}
              streamingSources={[]}
              hideInput
              onUserEditMessage={onUserEditMessage}
              onAiInstruct={onAiInstruct}
              className="h-full border-0 rounded-none"
            />
          </div>

          {/* Input area — flat composer field + neutral canvas actions */}
          <div className="p-2.5 flex-shrink-0 space-y-2">
            <div className="flex items-center gap-2 px-3.5 py-2.5 rounded-lg border border-white/[0.10] bg-white/[0.04] focus-within:border-blue-400/50 focus-within:ring-2 focus-within:ring-blue-400/20 transition-colors">
              <input
                value={input}
                onChange={e => setInput(e.target.value)}
                onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); handleSend(input); } }}
                placeholder={streaming ? 'Thinking…' : 'Ask…'}
                disabled={streaming}
                className="flex-1 bg-transparent border-none outline-none text-white text-[14px] placeholder:text-white/30"
              />
              {streaming ? (
                <button
                  onClick={handleStop}
                  className="text-[#f87171] hover:text-red-400 text-[13px] font-medium transition-colors flex items-center gap-1.5"
                >
                  <InlineProgress active /> Stop
                </button>
              ) : (
                <button
                  onClick={() => handleSend(input)}
                  disabled={!input.trim()}
                  className="text-white/35 hover:text-white text-[13px] font-medium disabled:opacity-0 transition-colors"
                >
                  Send ↗
                </button>
              )}
            </div>
            {/* Canvas actions — blue accent buttons */}
            <div className="flex gap-1.5">
              <button
                onClick={handleFeedback}
                disabled={streaming}
                className="inline-flex items-center justify-center gap-1.5 rounded-lg font-medium flex-1 px-2.5 py-2 text-[12px] disabled:opacity-50 disabled:cursor-not-allowed bg-blue-500 hover:bg-blue-400 text-white transition-colors"
              >
                <Check size={12} /> Get feedback
              </button>
              <button
                onClick={handleGrade}
                disabled={streaming}
                className="inline-flex items-center justify-center gap-1.5 rounded-lg font-medium flex-1 px-2.5 py-2 text-[12px] disabled:opacity-50 disabled:cursor-not-allowed bg-blue-500 hover:bg-blue-400 text-white transition-colors"
              >
                <ClipboardCheck size={12} /> Grade my work
              </button>
            </div>
            {error && <p className="text-[11px] text-[#f87171] px-1 animate-fade-in">{error}</p>}
          </div>
        </div>

        {/* Canvas column */}
        <div className={`min-h-[280px] ${mode === 'tutor' ? 'hidden' : ''}`}>
          <TutorCanvas
            onCaptureReady={(api) => { captureRef.current = api; }}
            initialStrokes={standaloneStrokes}
            onStrokesChange={setStandaloneStrokes}
          />
        </div>
      </div>
    </div>
  );
}
