import { useState, useRef, useEffect } from 'react';
import { createPortal } from 'react-dom';
import {
  Calculator, Pen, Eraser, Undo2, Trash2, Sparkles, Check,
  ArrowLeft, ClipboardCheck, Settings, MessageSquare, Layers, RotateCcw,
  Play, ChevronLeft, ChevronRight, ListChecks, Cpu, ChevronDown, Lock,
} from 'lucide-react';
import { sendMathTutorMessage, generateProblemSet } from '../../../api/mathTutor';
import MathProblemSet from './MathProblemSet';
import ChatContainer from '../../chat/ChatContainer';
import { errorChatMessage } from '../../../utils/aiErrors';
import useBrowserBack from '../../../hooks/useBrowserBack';
import { InlineProgress } from '../../shared/ProgressBar';
import { useAuth } from '../../../context/AuthContext';
import { planFromUser } from '../../billing/modelAccess';
import { syncData } from '../../../api/auth';
import {
  STUDY_MODELS, resolveStudyModel, canUseStudyModel, requiredPlanLabelFor, studyModelLabel,
} from '../../study/studyModels';

const STORAGE_KEY = 'covalent-math-tutor-state-v1';
const PEN_SIZES = { thin: 2, medium: 4, thick: 7 };


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
    <div className="flex flex-col h-full border border-white/10 rounded-2xl overflow-hidden bg-black/30 backdrop-blur-sm">
      {/* Canvas toolbar */}
      <div className="flex items-center gap-1 px-3 py-2 border-b border-white/8 bg-black/20 flex-shrink-0">
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
          style={{ background: 'rgba(0,0,0,0.55)' }}
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
          className="rounded-xl border border-white/10 bg-[#1b1b1f] shadow-2xl p-1.5 animate-fade-in"
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
                  <p className="text-[12px] font-bold text-white flex items-center gap-1.5 truncate">
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
      <div key="mt-setup" className="h-full overflow-y-auto bg-transparent animate-view-fade">
        <div className="max-w-md mx-auto px-6 py-10 space-y-5">
          {/* Icon + title */}
          <div className="text-center">
            <h1 className="text-white text-[17px] font-semibold tracking-tight">Math Tutor</h1>
          </div>

          {/* Topic */}
          <div>
            <label className="text-[11px] font-medium text-white/65 uppercase tracking-widest block mb-2">Topic</label>
            <input
              value={topic}
              onChange={e => setTopic(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && topic.trim() && handleSetupStart()}
              placeholder="Quadratic equations, integrals, etc."
              className="w-full px-3 py-2.5 rounded-xl border border-white/10 bg-white/10 backdrop-blur-sm text-sm text-white outline-none focus:border-white/25 placeholder:text-white/25 transition-colors"
              autoFocus
            />
          </div>

          {/* Custom instructions - collapsed by default */}
          <div>
            <button
              onClick={() => setShowSettings(s => !s)}
              className="flex items-center gap-1.5 text-[11px] font-medium text-white/55 hover:text-white/85 uppercase tracking-widest transition-colors"
            >
              <Settings size={11} />
              {showSettings ? 'Hide' : 'Custom instructions'}
            </button>
            {showSettings && (
              <textarea
                value={customInstructions}
                onChange={e => setCustomInstructions(e.target.value)}
                rows={3}
                placeholder="How should the tutor teach you?"
                className="mt-2 w-full px-3 py-2.5 rounded-xl border border-white/10 bg-white/10 backdrop-blur-sm text-sm text-white outline-none focus:border-white/25 resize-none placeholder:text-white/25 transition-colors animate-fade-in"
              />
            )}
          </div>

          {/* Kind: guided tutor vs problem set */}
          <div className="flex items-center gap-1 bg-white/5 border border-white/10 rounded-xl p-1">
            {[
              { id: 'tutor',      label: 'Guided tutor', Icon: Sparkles },
              { id: 'problemset', label: 'Problem set',  Icon: ListChecks },
            ].map(o => (
              <button
                key={o.id}
                onClick={() => setSetupKind(o.id)}
                className={`flex-1 flex items-center justify-center gap-1.5 py-2 rounded-lg text-[12px] font-semibold transition-colors ${
                  setupKind === o.id ? 'bg-white/15 text-white' : 'text-white/40 hover:text-white/70'
                }`}
              >
                <o.Icon size={12} /> {o.label}
              </button>
            ))}
          </div>

          {/* Problem count (problem set only) */}
          {setupKind === 'problemset' && (
            <div className="flex items-center justify-between px-1 animate-fade-in">
              <span className="text-[11px] text-white/50">Number of problems</span>
              <div className="flex items-center gap-1">
                {[3, 5, 8].map(n => (
                  <button
                    key={n}
                    onClick={() => setPsCount(n)}
                    className={`w-8 h-7 rounded-lg text-[12px] font-semibold transition-colors ${
                      psCount === n ? 'bg-blue-500 text-white' : 'bg-white/5 text-white/50 hover:text-white/80'
                    }`}
                  >
                    {n}
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* Start button */}
          <button
            onClick={handleSetupStart}
            disabled={!topic.trim()}
            className="w-full py-2.5 rounded-xl bg-blue-500 hover:bg-blue-400 border border-blue-400/40 text-white text-sm font-semibold disabled:opacity-30 disabled:cursor-not-allowed flex items-center justify-center gap-2 transition-all"
          >
            {setupKind === 'problemset'
              ? <><ListChecks size={13} className="text-white" /> Start problem set</>
              : <><Sparkles size={13} className="text-white" /> Start</>}
          </button>
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
      {/* Header */}
      <div className="flex items-center gap-2.5 mx-2 mt-2 px-4 py-2.5 rounded-2xl flex-shrink-0 bg-white/8 border border-white/10 backdrop-blur-sm">
        <button
          onClick={() => setView('setup')}
          className="w-7 h-7 rounded-lg flex items-center justify-center text-white/40 hover:text-white hover:bg-white/10 transition-colors"
          title="Back"
        >
          <ArrowLeft size={14} />
        </button>
        <span className="text-white font-semibold text-[14px] tracking-tight truncate">{topic}</span>
        <div className="flex-1" />

        <MathModelPicker active={model} plan={plan} onPick={pickModel} disabled={streaming} />

        {/* Mode toggle */}
        <div className="flex items-center gap-0.5 bg-white/5 border border-white/10 rounded-lg p-0.5">
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
                mode === o.id ? 'bg-white/15 text-white' : 'text-white/30 hover:text-white/70'
              }`}
            >
              <o.Icon size={12} />
            </button>
          ))}
        </div>

        <button
          onClick={() => setShowSettings(s => !s)}
          title="Custom instructions"
          className={`w-7 h-7 rounded-lg flex items-center justify-center transition-colors ${
            showSettings ? 'bg-white/15 text-white' : 'text-white/30 hover:text-white/70 hover:bg-white/10'
          }`}
        >
          <Settings size={13} />
        </button>
        <button
          onClick={handleReset}
          title="New session"
          className="w-7 h-7 rounded-lg flex items-center justify-center text-white/30 hover:text-white/70 hover:bg-white/10 transition-colors"
        >
          <RotateCcw size={13} />
        </button>
      </div>

      {showSettings && (
        <div className="px-4 py-3 border-b border-white/10 glass-header flex-shrink-0 animate-fade-in">
          <label className="text-[10px] font-semibold text-white/30 uppercase tracking-widest block mb-2">Custom instructions (live)</label>
          <textarea
            value={customInstructions}
            onChange={e => setCustomInstructions(e.target.value)}
            rows={2}
            placeholder="Changes apply to the next message"
            className="w-full px-3 py-2 rounded-xl border border-white/10 bg-white/10 backdrop-blur-sm text-xs text-white outline-none resize-none placeholder:text-white/25"
          />
        </div>
      )}

      {/* Main split */}
      <div className={`flex-1 min-h-0 grid gap-2 p-2 bg-transparent ${
        mode === 'both' ? 'grid-cols-1 md:grid-cols-2' : 'grid-cols-1'
      }`}>
        {/* Chat column */}
        <div className={`flex flex-col min-h-0 border border-white/10 rounded-2xl overflow-hidden bg-black/10 backdrop-blur-sm ${
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

          {/* Input area */}
          <div className="p-2.5 flex-shrink-0">
            <div className="bg-white/8 border border-white/10 rounded-2xl overflow-hidden backdrop-blur-sm">
              <div className="flex items-center gap-2 px-4 py-3">
                <input
                  value={input}
                  onChange={e => setInput(e.target.value)}
                  onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); handleSend(input); } }}
                  placeholder={streaming ? 'Thinking…' : 'Ask…'}
                  disabled={streaming}
                  className="flex-1 bg-transparent border-none outline-none text-white text-[14px] placeholder:text-white/25"
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
              {/* Canvas action strip */}
              <div className="flex gap-2 px-2.5 pb-2.5 pt-1">
                <button
                  onClick={handleFeedback}
                  disabled={streaming}
                  className="flex-1 py-2 rounded-lg bg-blue-500 hover:bg-blue-400 text-white border border-blue-400/40 text-[12px] font-semibold disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-1.5 transition-all"
                >
                  <Check size={12} /> Get feedback
                </button>
                <button
                  onClick={handleGrade}
                  disabled={streaming}
                  className="flex-1 py-2 rounded-lg bg-blue-500 hover:bg-blue-400 text-white border border-blue-400/40 text-[12px] font-semibold disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-1.5 transition-all"
                >
                  <ClipboardCheck size={12} /> Grade my work
                </button>
              </div>
            </div>
            {error && <p className="text-[11px] text-[#f87171] px-1 mt-1.5 animate-fade-in">{error}</p>}
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
