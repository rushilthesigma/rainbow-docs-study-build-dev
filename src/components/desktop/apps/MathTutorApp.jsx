import { useState, useRef, useEffect, useCallback } from 'react';
import { createPortal } from 'react-dom';
import {
  Calculator, Pen, Eraser, Undo2, Trash2, Check, Send,
  ArrowLeft, ClipboardCheck, Settings, MessageSquare, RotateCcw,
  Play, ChevronLeft, ChevronRight, ListChecks, Cpu, ChevronDown, Lock, Shapes,
} from 'lucide-react';
import { sendMathTutorMessage, generateProblemSet } from '../../../api/mathTutor';
import { parseBoard } from '../../../utils/boardDSL';
import { synthBoard } from '../../../utils/strokeSynth';
import MathProblemSet from './MathProblemSet';
import { useMathCanvasOptional } from '../../../context/MathCanvasContext';
import MathText from '../../shared/MathText';
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
// Kill-switch for the Draw · BETA feature (tutor sketches figures on the board
// via ```board blocks). While false: the header pill is hidden, drawRef is
// forced off (draw:false to the server, board routing no-ops) even for users
// who persisted drawEnabled:true. Flip to true to fully restore — the toggle,
// tex-label layer, and synth pipeline are all left intact underneath.
const DRAW_BETA_ENABLED = false;
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

// Strips the tutor's hidden lesson-progression marker (server-side prompt:
// continueGate) from a reply and reports whether it was present, so the
// caller can gate the curriculum "Continue" button on the AI's own call
// rather than a fixed step count.
function extractContinueMarker(content) {
  if (!content) return { content, ready: false };
  const marker = /\n?\[\[CONTINUE_READY\]\]\s*$/;
  const ready = marker.test(content);
  return { content: ready ? content.replace(marker, '').trimEnd() : content, ready };
}

// ============== CANVAS ==============
// Strokes are recorded as { points: [{x,y,t}], tool, size } so the work can be
// re-rendered and animated back ("replay your work"). `initialStrokes` seeds
// the canvas with persisted work (remount per problem via `key`);
// `onStrokesChange` reports the live stroke list so the parent can persist it.
export function TutorCanvas({
  onCaptureReady,
  initialStrokes = null,
  onStrokesChange = null,
  hint = 'Draw · tap "Get feedback" to share with tutor',
  canvasContextId = null,
  canvasContextLabel = 'Live math canvas',
}) {
  const sharedCanvas = useMathCanvasOptional();
  const sharedCanvasIdRef = useRef(
    canvasContextId || `math-canvas-${crypto.randomUUID?.() || Math.random().toString(36).slice(2)}`
  );
  const publishSharedCanvas = sharedCanvas?.publishCanvas;
  const removeSharedCanvas = sharedCanvas?.removeCanvas;
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
  // Tutor overlay — the model's figure is drawn here, on a SEPARATE layer
  // stacked over the student canvas, so it never mixes with the student's own
  // strokes / capture / undo / clear.
  const tutorCanvasRef = useRef(null);
  const tutorCtxRef    = useRef(null);
  const tutorRef       = useRef(null);  // { ops, aspect, caption }
  const tutorAnimRef   = useRef(null);
  const [tutorMarks, setTutorMarks] = useState(false);
  // KaTeX board labels — `tex` ops can't be painted with fillText, so they
  // render as a DOM layer positioned over the overlay canvas. Reveal (opacity)
  // is driven imperatively from the same op-by-op animation as the strokes.
  const [texLabels, setTexLabels] = useState([]);   // [{ i, x, y, text, color, anchor, size }]
  const [texFit, setTexFit]       = useState(null); // px box the figure occupies in the canvas
  const texElsRef   = useRef({});                   // op index -> label element
  const texShownRef = useRef(new Set());            // op indices already revealed

  function clearCanvas(ctx, w, h) { ctx.clearRect(0, 0, w, h); }
  const cloneStrokes = () => strokesRef.current.map(s => ({ ...s, points: [...s.points] }));
  // Canvas CSS supplies the dark board color, but CSS backgrounds are not
  // included by toDataURL(). Export onto an opaque dark surface so white ink
  // remains visible to Study Mode / vision models instead of becoming
  // white-on-transparent (which is often composited onto white).
  function captureForContext() {
    const canvas = canvasRef.current;
    if (!canvas || !canvas.width || !canvas.height) return null;
    const output = document.createElement('canvas');
    output.width = canvas.width;
    output.height = canvas.height;
    const outputCtx = output.getContext('2d');
    if (!outputCtx) return null;
    outputCtx.fillStyle = '#0c1322';
    outputCtx.fillRect(0, 0, output.width, output.height);
    outputCtx.drawImage(canvas, 0, 0);
    return output.toDataURL('image/png');
  }

  function reportCanvasState() {
    const strokes = cloneStrokes();
    onStrokesChange?.(strokes);
    if (!strokes.length) {
      removeSharedCanvas?.(sharedCanvasIdRef.current);
      return;
    }
    const dataUrl = captureForContext();
    if (dataUrl) {
      publishSharedCanvas?.(sharedCanvasIdRef.current, {
        dataUrl,
        mimeType: 'image/png',
        name: canvasContextLabel,
        source: 'tutor-canvas',
      });
    }
  }

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

  // ── Tutor overlay drawing ────────────────────────────────────────────────
  function prefersReduced() {
    try { return window.matchMedia('(prefers-reduced-motion: reduce)').matches; } catch { return false; }
  }
  function stopTutorAnim() {
    if (tutorAnimRef.current) { cancelAnimationFrame(tutorAnimRef.current); tutorAnimRef.current = null; }
  }
  // Fit the figure's aspect box into the canvas, centered, with padding.
  function tutorFit(cw, ch, aspect) {
    const pad = 14;
    const aw = Math.max(10, cw - 2 * pad), ah = Math.max(10, ch - 2 * pad);
    let w, h;
    if (aw / ah > aspect) { h = ah; w = h * aspect; } else { w = aw; h = w / aspect; }
    return { x: (cw - w) / 2, y: (ch - h) / 2, w, h };
  }
  function drawTutorOp(ctx, fit, op, count) {
    const P = (p) => ({ x: fit.x + p.x * fit.w, y: fit.y + p.y * fit.h });
    if (op.k === 'stroke') {
      const n = Math.min(count, op.pts.length);
      if (n < 1) return;
      ctx.strokeStyle = op.color; ctx.lineWidth = op.w || 2;
      ctx.beginPath();
      for (let i = 0; i < n; i++) { const q = P(op.pts[i]); if (i === 0) ctx.moveTo(q.x, q.y); else ctx.lineTo(q.x, q.y); }
      ctx.stroke();
    } else if (op.k === 'dot') {
      const q = P(op);
      ctx.beginPath(); ctx.arc(q.x, q.y, op.r || 4.5, 0, Math.PI * 2);
      if (op.open) { ctx.fillStyle = '#0c1322'; ctx.fill(); ctx.lineWidth = 2; ctx.strokeStyle = op.color; ctx.stroke(); }
      else { ctx.fillStyle = op.color; ctx.fill(); }
    } else if (op.k === 'text') {
      const q = P(op);
      ctx.fillStyle = op.color; ctx.textAlign = op.anchor || 'start'; ctx.textBaseline = 'alphabetic';
      ctx.font = `${op.size || 11}px -apple-system, BlinkMacSystemFont, "SF Pro Display", system-ui, sans-serif`;
      ctx.fillText(op.text, q.x, q.y);
    }
  }
  // Reveal a KaTeX label once. The element may not have mounted yet when the
  // reveal fires (setTexLabels is async); the label's ref callback re-applies
  // visibility from texShownRef on mount, so marking the set is enough.
  function revealTex(i) {
    if (texShownRef.current.has(i)) return;
    texShownRef.current.add(i);
    const el = texElsRef.current[i];
    if (el) el.style.opacity = '1';
  }
  function drawTutorStatic() {
    const canvas = tutorCanvasRef.current, ctx = tutorCtxRef.current;
    if (!canvas || !ctx || !tutorRef.current) return;
    const rect = canvas.getBoundingClientRect();
    ctx.clearRect(0, 0, rect.width, rect.height);
    const fit = tutorFit(rect.width, rect.height, tutorRef.current.aspect);
    setTexFit(fit);
    tutorRef.current.ops.forEach((op, i) => {
      if (op.k === 'tex') revealTex(i);
      else drawTutorOp(ctx, fit, op, op.k === 'stroke' ? op.pts.length : 1);
    });
  }
  // Animate the figure being drawn, op by op, like a teacher at the board.
  function animateTutor() {
    const canvas = tutorCanvasRef.current, ctx = tutorCtxRef.current;
    if (!canvas || !ctx || !tutorRef.current) return;
    const { ops, aspect } = tutorRef.current;
    const rect = canvas.getBoundingClientRect();
    const fit = tutorFit(rect.width, rect.height, aspect);
    setTexFit(fit);
    const cost = ops.map(op => op.k === 'stroke' ? Math.max(2, op.pts.length) : 6);
    const total = cost.reduce((a, b) => a + b, 0);
    if (!total) return;
    const DURATION = Math.min(4200, Math.max(1500, total * 7));
    stopTutorAnim();
    const start = performance.now();
    const step = (now) => {
      const frac = Math.min(1, (now - start) / DURATION);
      const reveal = frac * total;
      ctx.clearRect(0, 0, rect.width, rect.height);
      let acc = 0;
      for (let i = 0; i < ops.length; i++) {
        if (acc >= reveal) break;
        const op = ops[i], c = cost[i];
        if (op.k === 'tex') {
          revealTex(i);
        } else if (op.k === 'stroke') {
          const lf = Math.min(1, (reveal - acc) / c);
          drawTutorOp(ctx, fit, op, Math.max(1, Math.ceil(lf * op.pts.length)));
        } else {
          drawTutorOp(ctx, fit, op, 1);
        }
        acc += c;
      }
      if (frac < 1) tutorAnimRef.current = requestAnimationFrame(step);
      else { tutorAnimRef.current = null; drawTutorStatic(); }
    };
    tutorAnimRef.current = requestAnimationFrame(step);
  }
  function clearTutor() {
    stopTutorAnim();
    tutorRef.current = null;
    const canvas = tutorCanvasRef.current, ctx = tutorCtxRef.current;
    if (canvas && ctx) { const rect = canvas.getBoundingClientRect(); ctx.clearRect(0, 0, rect.width, rect.height); }
    texShownRef.current = new Set();
    texElsRef.current = {};
    setTexLabels([]);
    setTexFit(null);
    setTutorMarks(false);
  }
  function drawBoard(board, { animate = true } = {}) {
    const synth = synthBoard(board);
    if (!synth || !synth.ops.length) { clearTutor(); return; }
    tutorRef.current = synth;
    texShownRef.current = new Set();
    texElsRef.current = {};
    setTexLabels(synth.ops.map((op, i) => (op.k === 'tex' ? { ...op, i } : null)).filter(Boolean));
    setTutorMarks(true);
    if (animate && !prefersReduced()) animateTutor();
    else drawTutorStatic();
  }

  useEffect(() => {
    if (typeof onCaptureReady !== 'function') return;
    onCaptureReady({
      capture: captureForContext,
      clear:   () => { strokesRef.current = []; stopAnim(); setReplaying(false); replayStrokes(); reportCanvasState(); },
      isEmpty: () => strokesRef.current.length === 0,
      getStrokes: () => cloneStrokes(),
      replay: () => animateReplay(),
      drawBoard,
      clearTutor,
      hasTutor: () => !!tutorRef.current,
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
      if (strokesRef.current.length) reportCanvasState();

      // Mirror size/DPR onto the tutor overlay, then re-render its figure.
      const overlay = tutorCanvasRef.current;
      if (overlay) {
        overlay.width  = Math.round(rect.width  * dpr);
        overlay.height = Math.round(rect.height * dpr);
        const tctx = overlay.getContext('2d');
        tctx.setTransform(dpr, 0, 0, dpr, 0, 0);
        tctx.lineCap  = 'round';
        tctx.lineJoin = 'round';
        tutorCtxRef.current = tctx;
        if (tutorRef.current) drawTutorStatic();
      }
    }
    sync();
    const ro = new ResizeObserver(sync);
    ro.observe(canvas);
    return () => { ro.disconnect(); stopAnim(); stopTutorAnim(); removeSharedCanvas?.(sharedCanvasIdRef.current); };
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
      reportCanvasState();
    }
    currentStrokeRef.current = [];
  }
  function handleUndo()  { strokesRef.current.pop(); replayStrokes(); reportCanvasState(); }
  function handleClear() { strokesRef.current = []; replayStrokes(); reportCanvasState(); }

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
        {tutorMarks && (
          <button
            onClick={clearTutor}
            title="Clear tutor's drawing"
            className="w-7 h-7 rounded-lg flex items-center justify-center text-blue-300/80 hover:text-blue-200 hover:bg-blue-500/15 transition-colors"
          >
            <Shapes size={13} />
          </button>
        )}
        <div className="flex-1" />
        {(replaying || hint) && (
          <span className="max-w-[45%] truncate text-[10px] text-white/25">{replaying ? 'Replaying…' : hint}</span>
        )}
      </div>
      <div className="flex-1 relative min-h-0">
        <canvas
          ref={canvasRef}
          className="absolute inset-0 w-full h-full cursor-crosshair"
          style={{ background: document.documentElement.classList.contains('dark') ? 'rgba(0,0,0,0.55)' : 'rgba(255,255,255,0.55)' }}
          onMouseDown={startDraw} onMouseMove={draw} onMouseUp={endDraw} onMouseLeave={endDraw}
          onTouchStart={startDraw} onTouchMove={draw} onTouchEnd={endDraw}
        />
        {/* Tutor's figure draws on this overlay — clicks pass through to the canvas below */}
        <canvas ref={tutorCanvasRef} className="absolute inset-0 w-full h-full pointer-events-none" />
        {/* KaTeX board labels — DOM layer aligned to the figure's fit box.
            Visibility is set imperatively (revealTex) in stroke order; keep
            opacity OUT of the style prop so re-renders never clobber it. */}
        {texLabels.length > 0 && texFit && (
          <div className="absolute inset-0 pointer-events-none overflow-hidden">
            {texLabels.map((l) => (
              <span
                key={l.i}
                ref={(el) => {
                  if (!el) { delete texElsRef.current[l.i]; return; }
                  texElsRef.current[l.i] = el;
                  el.style.opacity = texShownRef.current.has(l.i) ? '1' : '0';
                }}
                className="absolute whitespace-nowrap transition-opacity duration-300 select-none"
                style={{
                  left: texFit.x + l.x * texFit.w,
                  top: texFit.y + l.y * texFit.h,
                  color: l.color,
                  fontSize: (l.size || 11) + 1,
                  // Match the canvas text ops: x is the anchor point, y sits
                  // on the text baseline.
                  transform: `translate(${l.anchor === 'middle' ? '-50%' : l.anchor === 'end' ? '-100%' : '0%'}, -72%)`,
                }}
              >
                <MathText>{l.text}</MathText>
              </span>
            ))}
          </div>
        )}
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
export default function MathTutorApp({ seedTopic = null, seedProblemSet = null, seedPrompt = null, title = null, embedded = false, onContinue = null, continueLabel = 'Continue', onBack = null, defaultMode = 'both' } = {}) {
  const persisted = loadState();
  // Seeded mode = launched to teach a specific thing (a topic, or a fully
  // formed prompt e.g. a curriculum worked example). In seeded mode we skip
  // the setup screen, start with a fresh transcript + canvas, and never touch
  // the standalone Math Tutor's persisted state. `embedded` additionally hides
  // the window chrome (back-to-setup, new-session) for use inside a lesson.
  const isSeeded = !!(seedTopic || seedPrompt);
  // Problem-set mode: when set, render the standalone problem-set runner.
  // Seeded from a curriculum `problem_set` lesson, or started on the setup screen.
  const [psConfig, setPsConfig] = useState(seedProblemSet || null);
  const [setupKind, setSetupKind] = useState('tutor'); // 'tutor' | 'problemset'
  const [psCount, setPsCount] = useState(5);
  const [standaloneStrokes, setStandaloneStrokes] = useState(() => isSeeded ? [] : (persisted?.strokes || []));
  const [view, setView] = useState(isSeeded ? 'tutor' : (persisted?.view || 'setup'));
  const [mode, setMode] = useState('both');
  const modeRef = useRef(mode);
  modeRef.current = mode;
  useBrowserBack(!embedded && !onBack && view === 'tutor', () => setView('setup'));
  const [topic, setTopic]                       = useState(seedTopic || title || persisted?.topic || '');
  const [customInstructions, setCustomInstructions] = useState(persisted?.customInstructions || '');
  const [messages, setMessages]                 = useState(isSeeded ? [] : (persisted?.messages || []));
  const [streaming, setStreaming]               = useState(false);
  const [streamingContent, setStreamingContent] = useState('');
  const [streamingThinking, setStreamingThinking] = useState('');
  const [error, setError]                       = useState(null);
  const [input, setInput]                       = useState('');
  const [showSettings, setShowSettings]         = useState(false);
  // Draw · BETA — when on, the tutor may sketch figures on the board via a
  // fenced ```board block (server prompt gains the drawing rules). Persisted
  // per-user; a ref mirrors the state so doSend reads the latest value through
  // memoized callbacks.
  const [drawEnabled, setDrawEnabled] = useState(() => !!persisted?.drawEnabled);
  const drawRef = useRef(DRAW_BETA_ENABLED && drawEnabled);
  drawRef.current = DRAW_BETA_ENABLED && drawEnabled;
  const seedKickedOff = useRef(false);
  const streamRef  = useRef('');
  const thinkRef   = useRef('');
  const abortRef   = useRef(null);
  const captureRef = useRef(null);
  const pendingBoardRef = useRef(null);
  const messagesRef = useRef(messages);
  messagesRef.current = messages;

  // Stable callback: when the canvas (re)mounts it hands us its API; draw any
  // figure that was waiting on it. Stable identity (deps []) so TutorCanvas's
  // onCaptureReady effect runs once per mount, never on every parent render.
  const handleCaptureReady = useCallback((api) => {
    captureRef.current = api;
    const p = pendingBoardRef.current;
    if (p && api?.drawBoard) { api.drawBoard(p.board, { animate: p.animate }); pendingBoardRef.current = null; }
  }, []);

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
    if (isSeeded) return;
    const trimmed = messages.slice(-50).map(m => ({
      role: m.role, content: (m.content || '').slice(0, 3000), _edited: m._edited, _error: m._error,
    }));
    saveState({ view, mode, topic, customInstructions, messages: trimmed, strokes: standaloneStrokes, drawEnabled });
  }, [view, mode, topic, customInstructions, messages, standaloneStrokes, drawEnabled, seedTopic]);

  // Lesson-progression: the "Continue" button (embedded worked examples only)
  // is gated on the tutor AI's own judgment, not a fixed step. The server
  // prompt (continueGate) asks it to append a hidden [[CONTINUE_READY]]
  // marker once the student has actually shown they've got it; we strip the
  // marker before display and flip this on only then. Any new turn resets it
  // until the fresh reply confirms readiness again. (The admin skip-past-gate
  // control lives one level up, in BlockLessonView, so it's one affordance
  // shared by every curriculum step type rather than duplicated per block.)
  const [continueReady, setContinueReady] = useState(false);

  useEffect(() => () => abortRef.current?.(), []);

  // ── Route a ```board block from an assistant reply onto the canvas ──────────
  function extractBoard(content) {
    if (!content) return null;
    const m = content.match(/```board[ \t]*\n?([\s\S]*?)```/);
    if (!m) return null;
    try { return parseBoard(m[1]); } catch { return null; }
  }
  function flushPendingBoard() {
    const pend = pendingBoardRef.current;
    if (pend && captureRef.current?.drawBoard) {
      captureRef.current.drawBoard(pend.board, { animate: pend.animate });
      pendingBoardRef.current = null;
    }
  }
  // Parse the latest figure out of an assistant reply and draw it on the canvas.
  // If the canvas is hidden (tutor-only mode), reveal it first so the student
  // sees the teacher draw.
  function showBoardOnCanvas(content, { animate = true } = {}) {
    if (!drawRef.current) return;
    const board = extractBoard(content);
    if (!board) return;
    pendingBoardRef.current = { board, animate };
    if (modeRef.current === 'tutor') setMode('both');
    flushPendingBoard();
  }
  // On open, re-draw the most recent figure (static, no animation).
  useEffect(() => {
    if (!drawRef.current) return;
    const last = [...messagesRef.current].reverse().find(m => m.role === 'assistant' && /```board/.test(m.content || ''));
    if (last) showBoardOnCanvas(last.content, { animate: false });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  // Toggling on re-surfaces the latest figure from history; toggling off wipes
  // the tutor's marks (the student's own strokes are untouched).
  function toggleDraw() {
    const next = !drawRef.current;
    drawRef.current = next;
    setDrawEnabled(next);
    if (next) {
      const last = [...messagesRef.current].reverse().find(m => m.role === 'assistant' && /```board/.test(m.content || ''));
      if (last) showBoardOnCanvas(last.content, { animate: false });
    } else {
      captureRef.current?.clearTutor?.();
    }
  }

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
    // A fresh turn is in flight - hold the Continue button until this reply
    // confirms readiness again.
    if (onContinue) setContinueReady(false);

    const history = [...messages, userMsg].slice(-50).map((m, i, arr) => {
      const isLast = i === arr.length - 1;
      return { role: m.role, content: m.content, ...(isLast && m.images ? { images: m.images } : {}) };
    });

    const body = {
      topic: (topicOverride ?? topic).trim(),
      customInstructions: customInstructions.trim(),
      phase,
      model: modelRef.current,
      draw: drawRef.current,
      continueGate: !!onContinue,
      messages: history.map(({ role, content }) => ({ role, content })),
      images: imageDataUrl ? [{ dataUrl: imageDataUrl, mimeType: 'image/png' }] : [],
    };

    const abort = sendMathTutorMessage(body, {
      onChunk: (c) => { streamRef.current += c; setStreamingContent(streamRef.current); },
      onThinking: (t) => { thinkRef.current += t; setStreamingThinking(thinkRef.current); },
      onDone: () => {
        const { content: full, ready } = onContinue ? extractContinueMarker(streamRef.current) : { content: streamRef.current, ready: false };
        const think = thinkRef.current;
        if (full) setMessages(m => [...m, { role: 'assistant', content: full, thinking: think || undefined, timestamp: new Date().toISOString() }]);
        if (full) showBoardOnCanvas(full);
        if (onContinue) setContinueReady(ready);
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
    if (!isSeeded || seedKickedOff.current) return;
    seedKickedOff.current = true;
    const seedText = seedPrompt
      || `Teach me about "${seedTopic}". Give me a real lesson - definition, why it matters, worked examples in KaTeX, then one problem to try on the canvas.`;
    setTimeout(() => doSend({ text: seedText, phase: 'lesson', hidden: true }), 60);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isSeeded]);

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
    captureRef.current?.clear?.(); captureRef.current?.clearTutor?.(); setError(null); saveState(null);
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
    if (onContinue) setContinueReady(false);
    const body = { topic: topic.trim(), customInstructions: customInstructions.trim(), phase: 'practice', model: modelRef.current, draw: drawRef.current, continueGate: !!onContinue, messages: apiHistory, images: [] };
    const abort = sendMathTutorMessage(body, {
      onChunk: (c) => { streamRef.current += c; setStreamingContent(streamRef.current); },
      onThinking: (t) => { thinkRef.current += t; setStreamingThinking(thinkRef.current); },
      onDone: () => {
        const { content: full, ready } = onContinue ? extractContinueMarker(streamRef.current) : { content: streamRef.current, ready: false };
        const think = thinkRef.current;
        if (full) setMessages(m => [...m, { role: 'assistant', content: full, thinking: think || undefined, timestamp: new Date().toISOString(), _edited: true }]);
        if (full) showBoardOnCanvas(full);
        if (onContinue) setContinueReady(ready);
        setStreaming(false); setStreamingContent(''); setStreamingThinking(''); streamRef.current = ''; thinkRef.current = '';
      },
      onError: (err) => {
        setMessages(m => [...m, errorChatMessage(err)]);
        setStreaming(false); setStreamingContent(''); setStreamingThinking(''); streamRef.current = ''; thinkRef.current = '';
      },
    });
    abortRef.current = abort;
  }

  // Solid-blue canvas actions — reused in the composer (split / chat views) and
  // as a footer when the board is shown full-width (mode === 'canvas'), so
  // "Get feedback" / "Grade my work" stay reachable in every view.
  const renderCanvasActions = (className = '') => (
    <div className={`space-y-1.5 ${className}`}>
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
      {/* Lesson-progression action, when embedded in a curriculum block - only
          once the tutor AI itself has signalled the student is ready. */}
      {onContinue && continueReady && (
        <button
          onClick={onContinue}
          className="w-full inline-flex items-center justify-center gap-1.5 rounded-lg font-semibold px-2.5 py-2.5 text-[12.5px] text-white bg-blue-500 hover:bg-blue-400 transition-colors animate-fade-in"
        >
          {continueLabel} <ChevronRight size={14} />
        </button>
      )}
    </div>
  );

  return (
    <div key="mt-tutor" className="flex flex-col h-full bg-transparent animate-view-fade" style={{ fontFamily: '-apple-system, BlinkMacSystemFont, "SF Pro Display", system-ui, sans-serif' }}>
      {/* Header — notes-style: inline back link + topic, quiet icon actions */}
      <div className="flex items-center gap-2.5 mb-3 flex-shrink-0">
        {!embedded && (
          <>
            <button
              onClick={() => setView('setup')}
              className="flex items-center gap-2 text-sm text-white/35 hover:text-white/60 transition-colors flex-shrink-0"
            >
              <ArrowLeft size={16} /> Math Tutor
            </button>
            <span className="w-1 h-1 rounded-full bg-white/20 flex-shrink-0" />
          </>
        )}
        <span className="text-sm font-bold text-white/90 truncate">{topic}</span>
        <div className="flex-1" />

        <MathModelPicker active={model} plan={plan} onPick={pickModel} disabled={streaming} />

        {DRAW_BETA_ENABLED && (
          <button
            onClick={toggleDraw}
            title={drawEnabled ? 'Tutor draws figures on the board — click to turn off' : 'Let the tutor draw figures on the board (beta)'}
            className={`flex items-center gap-1 px-2 h-7 rounded-lg text-[11px] font-semibold transition-colors ${
              drawEnabled ? 'bg-blue-500/20 text-blue-300 ring-1 ring-blue-400/30' : 'text-white/40 hover:text-white/80 hover:bg-white/10'
            }`}
          >
            <Shapes size={13} /> Draw
            <span className={`text-[8px] font-bold uppercase tracking-wider ${drawEnabled ? 'text-blue-300/70' : 'text-white/25'}`}>Beta</span>
          </button>
        )}

        <button
          onClick={() => setShowSettings(s => !s)}
          title="Custom instructions"
          className={`p-1.5 rounded-md transition-colors ${
            showSettings ? 'bg-white/[0.08] text-white/70' : 'text-white/35 hover:text-white/70 hover:bg-white/[0.05]'
          }`}
        >
          <Settings size={14} />
        </button>
        {!embedded && (
          <button
            onClick={handleReset}
            title="New session"
            className={HEADER_ICON_BTN}
          >
            <RotateCcw size={14} />
          </button>
        )}
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
      <div className="flex-1 min-h-0 grid gap-3 bg-transparent grid-cols-1 md:grid-cols-2">
        {/* Chat column */}
        <div className="flex flex-col min-h-0 overflow-hidden">
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
                  className={`px-3 h-8 rounded-lg inline-flex items-center gap-1.5 text-[13px] font-medium transition-colors text-white/35 hover:text-white ${
                    input.trim() ? '' : 'cursor-not-allowed'
                  }`}
                >
                  Send <Send size={11} />
                </button>
              )}
            </div>
            {/* Canvas actions — blue accent buttons */}
            {renderCanvasActions()}
            {error && <p className="text-[11px] text-[#f87171] px-1 animate-fade-in">{error}</p>}
          </div>
        </div>

        {/* Canvas column */}
        <div className="flex flex-col min-h-[280px]">
          <div className="flex-1 min-h-0">
            <TutorCanvas
              onCaptureReady={handleCaptureReady}
              initialStrokes={standaloneStrokes}
              onStrokesChange={setStandaloneStrokes}
              hint=""
            />
          </div>
        </div>
      </div>
    </div>
  );
}
