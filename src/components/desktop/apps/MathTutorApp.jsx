import { useState, useRef, useEffect, useCallback } from 'react';
import {
  Calculator, Pen, Eraser, Undo2, Trash2, Loader2, Send, Sparkles, Check,
  ArrowLeft, ClipboardCheck, Settings, Plus,
} from 'lucide-react';
import { sendMathTutorMessage } from '../../../api/mathTutor';
import ChatContainer from '../../chat/ChatContainer';
import { errorChatMessage } from '../../../utils/aiErrors';
import useBrowserBack from '../../../hooks/useBrowserBack';
import { InlineProgress } from '../../shared/ProgressBar';

// Persist the in-progress tutor session across window closes.
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

// ============== CANVAS (reused drawing surface, returns PNG on demand) ==============
function TutorCanvas({ onCaptureReady, dark }) {
  const canvasRef = useRef(null);
  const ctxRef = useRef(null);
  const [tool, setTool] = useState('pen');
  const [penSize, setPenSize] = useState('medium');
  const [drawing, setDrawing] = useState(false);
  const strokesRef = useRef([]);
  const currentStrokeRef = useRef([]);

  const bgColor = dark ? '#000000' : '#ffffff';
  const penColor = dark ? '#ffffff' : '#1a1a2e';

  function clearCanvas(ctx, w, h) {
    ctx.fillStyle = bgColor;
    ctx.fillRect(0, 0, w, h);
  }

  function replayStrokes() {
    const canvas = canvasRef.current;
    if (!canvas || !ctxRef.current) return;
    const rect = canvas.getBoundingClientRect();
    const ctx = ctxRef.current;
    clearCanvas(ctx, rect.width, rect.height);
    for (const s of strokesRef.current) {
      if (s.tool === 'eraser') {
        ctx.save();
        ctx.globalCompositeOperation = 'destination-out';
        ctx.strokeStyle = 'rgba(0,0,0,1)';
      } else {
        ctx.strokeStyle = penColor;
      }
      ctx.lineWidth = s.size;
      ctx.beginPath();
      s.points.forEach((p, i) => i === 0 ? ctx.moveTo(p.x, p.y) : ctx.lineTo(p.x, p.y));
      ctx.stroke();
      if (s.tool === 'eraser') ctx.restore();
    }
  }

  // Expose a capture function to the parent.
  useEffect(() => {
    if (typeof onCaptureReady !== 'function') return;
    onCaptureReady({
      capture: () => canvasRef.current?.toDataURL('image/png') || null,
      clear: () => { strokesRef.current = []; replayStrokes(); },
      isEmpty: () => strokesRef.current.length === 0,
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [onCaptureReady]);

  // Re-initialize the backing store when layout changes (e.g. toolbar renders
  // after mount, window resizes, dark mode flips). Without this, the backing
  // store dimensions drift from the CSS dimensions and drawing lands at the
  // wrong pixel.
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    function sync() {
      const dpr = window.devicePixelRatio || 1;
      const rect = canvas.getBoundingClientRect();
      if (rect.width === 0 || rect.height === 0) return;
      canvas.width = Math.round(rect.width * dpr);
      canvas.height = Math.round(rect.height * dpr);
      const ctx = canvas.getContext('2d');
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      ctx.lineCap = 'round';
      ctx.lineJoin = 'round';
      ctxRef.current = ctx;
      clearCanvas(ctx, rect.width, rect.height);
      replayStrokes();
    }
    sync();
    const ro = new ResizeObserver(sync);
    ro.observe(canvas);
    return () => ro.disconnect();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [dark]);

  // Use the native MouseEvent.offsetX/offsetY — it's always measured from the
  // canvas element's own top-left in CSS pixels, so no stale-rect drift.
  function getPos(e) {
    const nativeEvent = e.nativeEvent || e;
    const touch = e.touches?.[0];
    if (touch) {
      const rect = canvasRef.current.getBoundingClientRect();
      return { x: touch.clientX - rect.left, y: touch.clientY - rect.top };
    }
    if (typeof nativeEvent.offsetX === 'number' && typeof nativeEvent.offsetY === 'number') {
      return { x: nativeEvent.offsetX, y: nativeEvent.offsetY };
    }
    const rect = canvasRef.current.getBoundingClientRect();
    return { x: e.clientX - rect.left, y: e.clientY - rect.top };
  }

  function startDraw(e) {
    e.preventDefault();
    setDrawing(true);
    const pos = getPos(e);
    currentStrokeRef.current = [pos];
    const ctx = ctxRef.current;
    if (tool === 'eraser') {
      ctx.save();
      ctx.globalCompositeOperation = 'destination-out';
      ctx.strokeStyle = 'rgba(0,0,0,1)';
      ctx.lineWidth = 22;
    } else {
      ctx.strokeStyle = penColor;
      ctx.lineWidth = PEN_SIZES[penSize];
    }
    ctx.beginPath();
    ctx.moveTo(pos.x, pos.y);
  }
  function draw(e) {
    if (!drawing) return;
    e.preventDefault();
    const pos = getPos(e);
    currentStrokeRef.current.push(pos);
    ctxRef.current.lineTo(pos.x, pos.y);
    ctxRef.current.stroke();
  }
  function endDraw() {
    if (!drawing) return;
    setDrawing(false);
    const ctx = ctxRef.current;
    if (tool === 'eraser') ctx.restore();
    if (currentStrokeRef.current.length > 1) {
      strokesRef.current.push({
        points: currentStrokeRef.current,
        tool,
        size: tool === 'eraser' ? 22 : PEN_SIZES[penSize],
      });
    }
    currentStrokeRef.current = [];
  }

  function handleUndo() {
    strokesRef.current.pop();
    replayStrokes();
  }
  function handleClear() {
    strokesRef.current = [];
    replayStrokes();
  }

  return (
    <div className="flex flex-col h-full border border-gray-200 dark:border-[#2A2A40] rounded-xl overflow-hidden bg-white dark:bg-black">
      <div className="flex items-center gap-1 px-2 py-1.5 border-b border-gray-100 dark:border-[#2A2A40] bg-gray-50 dark:bg-[#0D0D14] flex-shrink-0">
        <button onClick={() => setTool('pen')} className={`p-1.5 rounded-lg ${tool === 'pen' ? 'bg-blue-100 dark:bg-blue-900/30 text-blue-600' : 'text-gray-400 hover:text-gray-600'}`}><Pen size={14} /></button>
        <button onClick={() => setTool('eraser')} className={`p-1.5 rounded-lg ${tool === 'eraser' ? 'bg-blue-100 dark:bg-blue-900/30 text-blue-600' : 'text-gray-400 hover:text-gray-600'}`}><Eraser size={14} /></button>
        <div className="w-px h-4 bg-gray-200 dark:bg-[#2A2A40] mx-1" />
        {Object.keys(PEN_SIZES).map(s => (
          <button key={s} onClick={() => setPenSize(s)} className={`w-6 h-6 rounded-full flex items-center justify-center ${penSize === s && tool === 'pen' ? 'bg-gray-300 dark:bg-gray-600' : 'hover:bg-gray-200 dark:hover:bg-[#1e1e2e]'}`}>
            <div className="rounded-full bg-gray-800 dark:bg-gray-200" style={{ width: PEN_SIZES[s], height: PEN_SIZES[s] }} />
          </button>
        ))}
        <div className="w-px h-4 bg-gray-200 dark:bg-[#2A2A40] mx-1" />
        <button onClick={handleUndo} className="p-1.5 rounded-lg text-gray-400 hover:text-gray-600"><Undo2 size={14} /></button>
        <button onClick={handleClear} className="p-1.5 rounded-lg text-gray-400 hover:text-gray-600"><Trash2 size={14} /></button>
        <div className="flex-1" />
        <span className="text-[10px] text-gray-400">Work on the canvas. Tap "Get feedback" to show it to the tutor.</span>
      </div>
      <div className="flex-1 relative min-h-0">
        <canvas
          ref={canvasRef}
          className={`absolute inset-0 w-full h-full cursor-crosshair ${dark ? 'bg-black' : 'bg-white'}`}
          onMouseDown={startDraw} onMouseMove={draw} onMouseUp={endDraw} onMouseLeave={endDraw}
          onTouchStart={startDraw} onTouchMove={draw} onTouchEnd={endDraw}
        />
      </div>
    </div>
  );
}

// ============== MAIN APP ==============
//
// Props:
//   seedTopic — when set (e.g. when embedded inline from a curriculum
//               math_tutor lesson), bypass the setup view and start the
//               tutor immediately on the given topic.
//   onBack    — when set, replaces the setup-view back-button behavior so
//               an embedding parent can return to its own view.
export default function MathTutorApp({ seedTopic = null, onBack = null, defaultMode = 'both' } = {}) {
  const persisted = loadState();
  // When seeded, start in 'tutor' view directly. Otherwise restore from
  // localStorage like normal.
  const [view, setView] = useState(seedTopic ? 'tutor' : (persisted?.view || 'setup'));
  // Tutor-view mode: 'both' (default) shows chat + canvas side-by-side,
  // 'tutor' hides the canvas (chat full width), 'canvas' hides the chat
  // (canvas full width). Persisted across sessions.
  const [mode, setMode] = useState(() => {
    const valid = ['both', 'tutor', 'canvas'];
    if (defaultMode && valid.includes(defaultMode)) return defaultMode;
    if (persisted?.mode && valid.includes(persisted.mode)) return persisted.mode;
    return 'both';
  });
  // When embedded (onBack supplied by parent), DO NOT register our own
  // browser-back handler — the parent (e.g. CurriculaApp) owns history
  // management for the embed. Nested useBrowserBack hooks fight each other
  // in React 18 dev (the inner cleanup calls history.back, which fires
  // popstate, which the outer hook handles by bailing the embedded view).
  useBrowserBack(!onBack && view === 'tutor', () => setView('setup'));
  const [topic, setTopic] = useState(seedTopic || persisted?.topic || '');
  const [customInstructions, setCustomInstructions] = useState(persisted?.customInstructions || '');
  const [messages, setMessages] = useState(seedTopic ? [] : (persisted?.messages || []));
  const [streaming, setStreaming] = useState(false);
  const [streamingContent, setStreamingContent] = useState('');
  const [error, setError] = useState(null);
  const [input, setInput] = useState('');
  const [showSettings, setShowSettings] = useState(false);
  const seedKickedOff = useRef(false);

  const streamRef = useRef('');
  const abortRef = useRef(null);
  const captureRef = useRef(null);
  const dark = typeof window !== 'undefined' && document.documentElement.classList.contains('dark');

  // Persist across window close. Cap at ~50 msgs of 3k chars each so we don't
  // blow up localStorage on long sessions. Don't persist seeded sessions —
  // they're tied to a specific curriculum lesson, not a free session.
  useEffect(() => {
    if (seedTopic) return;
    const trimmed = messages.slice(-50).map(m => ({
      role: m.role, content: (m.content || '').slice(0, 3000), _edited: m._edited, _error: m._error,
    }));
    saveState({ view, mode, topic, customInstructions, messages: trimmed });
  }, [view, mode, topic, customInstructions, messages, seedTopic]);

  // Clean up an aborted stream if the component unmounts mid-turn.
  useEffect(() => () => abortRef.current?.(), []);

  function startTutor() {
    if (!topic.trim()) return;
    setView('tutor');
    setMessages([]);
    setError(null);
    // Kick off the opening lesson automatically.
    setTimeout(() => doSend({ text: `Teach me about "${topic.trim()}". Give me a real lesson — definition, why it matters, worked examples in KaTeX, then one problem to try on the canvas.`, phase: 'lesson', hidden: true }), 50);
  }

  // Auto-start when embedded with a seed topic — runs once on mount.
  useEffect(() => {
    if (!seedTopic || seedKickedOff.current) return;
    seedKickedOff.current = true;
    setTimeout(() => doSend({
      text: `Teach me about "${seedTopic}". Give me a real lesson — definition, why it matters, worked examples in KaTeX, then one problem to try on the canvas.`,
      phase: 'lesson',
      hidden: true,
    }), 60);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [seedTopic]);

  function doSend({ text, phase = 'lesson', imageDataUrl = null, hidden = false }) {
    if (streaming) return;
    const userMsg = { role: 'user', content: text, timestamp: new Date().toISOString() };
    if (imageDataUrl) userMsg.images = [{ dataUrl: imageDataUrl, mimeType: 'image/png' }];
    if (hidden) userMsg._hidden = true;

    // For hidden kickoff messages, don't show the user bubble; otherwise do.
    setMessages(prev => [...prev, userMsg]);
    setStreaming(true);
    setStreamingContent('');
    streamRef.current = '';

    // Trim conversation for the server: keep last 20 messages + strip images
    // from older turns so we're not re-sending canvases we already processed.
    const history = [...messages, userMsg].slice(-20).map((m, i, arr) => {
      const isLast = i === arr.length - 1;
      return {
        role: m.role,
        content: m.content,
        ...(isLast && m.images ? { images: m.images } : {}),
      };
    });

    const body = {
      topic: topic.trim(),
      customInstructions: customInstructions.trim(),
      phase,
      messages: history.map(({ role, content }) => ({ role, content })),
      images: imageDataUrl ? [{ dataUrl: imageDataUrl, mimeType: 'image/png' }] : [],
    };

    const abort = sendMathTutorMessage(body, {
      onChunk: (c) => { streamRef.current += c; setStreamingContent(streamRef.current); },
      onDone: () => {
        const full = streamRef.current;
        if (full) setMessages(m => [...m, { role: 'assistant', content: full, timestamp: new Date().toISOString() }]);
        setStreaming(false);
        setStreamingContent('');
        streamRef.current = '';
      },
      onError: (err) => {
        setMessages(m => [...m, errorChatMessage(err)]);
        setStreaming(false);
        setStreamingContent('');
        streamRef.current = '';
      },
    });
    abortRef.current = abort;
  }

  function handleSend(text) {
    if (!text.trim() || streaming) return;
    doSend({ text: text.trim(), phase: 'lesson' });
    setInput('');
  }

  function handleFeedback() {
    const png = captureRef.current?.capture?.();
    if (!png || captureRef.current.isEmpty()) {
      setError('Draw something on the canvas first.');
      setTimeout(() => setError(null), 2500);
      return;
    }
    doSend({
      text: 'Here is my current work. Give me step-by-step feedback — point out the step where I am, whether it\'s correct, and hint at the next step without solving it for me.',
      phase: 'practice',
      imageDataUrl: png,
    });
  }

  function handleGrade() {
    const png = captureRef.current?.capture?.();
    if (!png || captureRef.current.isEmpty()) {
      setError('Draw your solution on the canvas before asking for a grade.');
      setTimeout(() => setError(null), 2500);
      return;
    }
    doSend({
      text: 'Here is my final work. Grade it out of 10 and show me the model solution.',
      phase: 'grade',
      imageDataUrl: png,
    });
  }

  function handleReset() {
    if (!confirm('Reset this tutor session? Your conversation and canvas will be cleared.')) return;
    setMessages([]);
    setStreamingContent('');
    streamRef.current = '';
    captureRef.current?.clear?.();
    setError(null);
    saveState(null);
  }

  function handleStop() {
    abortRef.current?.();
    setStreaming(false);
  }

  // ----- Setup view -----
  if (view === 'setup') {
    return (
      <div className="h-full overflow-y-auto">
        <div className="max-w-md mx-auto p-6 space-y-4">
          <div className="text-center">
            <div className="w-12 h-12 rounded-xl bg-indigo-500/10 flex items-center justify-center mx-auto mb-3">
              <Calculator size={22} className="text-indigo-500" />
            </div>
            <h1 className="text-lg font-bold text-gray-900 dark:text-white">Math Tutor</h1>
            <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">Lesson, practice with a canvas, step-by-step feedback, and a final grade.</p>
          </div>

          <div>
            <label className="text-xs font-medium text-gray-500 dark:text-gray-400 mb-1.5 block">Topic</label>
            <input
              value={topic}
              onChange={e => setTopic(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && topic.trim() && startTutor()}
              placeholder="e.g. Quadratic equations, Definite integrals, Long division"
              className="w-full px-3 py-2 rounded-lg border border-gray-200 dark:border-[#2A2A40] bg-white dark:bg-[#0D0D14] text-sm text-gray-900 dark:text-white outline-none focus:ring-2 focus:ring-indigo-500/40"
              autoFocus
            />
          </div>

          {/* Mode picker — Both / Tutor / Canvas. Same toggle is also
              available in the tutor-view header so you can flip mid-session. */}
          <div>
            <label className="text-xs font-medium text-gray-500 dark:text-gray-400 mb-1.5 block">Mode</label>
            <div className="grid grid-cols-3 gap-1.5">
              {[
                { id: 'both',   label: 'Both',   sub: 'Tutor + canvas' },
                { id: 'tutor',  label: 'Tutor',  sub: 'Chat only' },
                { id: 'canvas', label: 'Canvas', sub: 'Drawing only' },
              ].map(o => (
                <button
                  key={o.id}
                  onClick={() => setMode(o.id)}
                  className={`px-2.5 py-2 rounded-lg border text-left transition-all ${
                    mode === o.id
                      ? 'border-indigo-500 bg-indigo-50 dark:bg-indigo-500/15 text-indigo-700 dark:text-indigo-200 shadow-sm'
                      : 'border-gray-200 dark:border-[#2A2A40] bg-white dark:bg-[#0D0D14] text-gray-700 dark:text-gray-300 hover:border-indigo-400'
                  }`}
                >
                  <p className="text-[12px] font-bold">{o.label}</p>
                  <p className="text-[10px] opacity-70">{o.sub}</p>
                </button>
              ))}
            </div>
          </div>

          <div>
            <label className="text-xs font-medium text-gray-500 dark:text-gray-400 mb-1.5 block">Custom instructions (optional)</label>
            <textarea
              value={customInstructions}
              onChange={e => setCustomInstructions(e.target.value)}
              rows={3}
              placeholder="e.g. Prep me for AP Calc BC. Use real exam-style problems. Don't give me answers — only hints."
              className="w-full px-3 py-2 rounded-lg border border-gray-200 dark:border-[#2A2A40] bg-white dark:bg-[#0D0D14] text-sm text-gray-900 dark:text-white outline-none focus:ring-2 focus:ring-indigo-500/40 resize-none"
            />
          </div>

          <button
            onClick={startTutor}
            disabled={!topic.trim()}
            className="w-full py-2.5 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white text-sm font-semibold disabled:opacity-50 flex items-center justify-center gap-2"
          >
            <Sparkles size={14} /> Start lesson
          </button>
        </div>
      </div>
    );
  }

  // ----- Tutor view (chat + canvas) -----
  // Hide "hidden" user kickoff messages; keep a parallel index map so edits
  // land on the right slot in the unfiltered `messages` array.
  const visibleIndices = messages.map((m, i) => m._hidden ? -1 : i).filter(i => i >= 0);
  const visibleMessages = visibleIndices.map(i => messages[i]);

  // Editing a USER message restarts the conversation from that point:
  // truncate everything at and after that index, then re-send the edited text.
  function onUserEditMessage(visibleIdx, newContent) {
    if (streaming) return;
    const realIdx = visibleIndices[visibleIdx];
    if (realIdx == null) return;
    if (abortRef.current) try { abortRef.current(); } catch {}
    setMessages(prev => prev.slice(0, realIdx));
    setTimeout(() => doSend({ text: newContent, phase: 'practice' }), 30);
  }

  // Editing an AI message REPLACES its content in place with a fresh answer.
  // We keep every user message visible (including the original one), drop
  // only the AI reply + anything after it, then stream a new reply that
  // includes a hidden instruction the user gave us.
  function onAiInstruct(visibleIdx, instruction) {
    if (streaming || !instruction?.trim()) return;
    const realIdx = visibleIndices[visibleIdx];
    if (realIdx == null) return;
    if (abortRef.current) try { abortRef.current(); } catch {}
    // Truncate the AI reply + everything after it. The original user msg
    // right before it stays in the visible transcript, unchanged.
    const truncated = messages.slice(0, realIdx);
    setMessages(truncated);

    // Call streamAIResponse directly with augmented history — append the
    // instruction to the last user message IN THE API REQUEST ONLY, not in
    // the visible state. That way the user sees their original message
    // verbatim, but the AI knows what to change.
    const apiHistory = truncated.map(m => ({ role: m.role, content: m.content }));
    if (apiHistory.length && apiHistory[apiHistory.length - 1].role === 'user') {
      apiHistory[apiHistory.length - 1] = {
        ...apiHistory[apiHistory.length - 1],
        content: `${apiHistory[apiHistory.length - 1].content}\n\n[SYSTEM NOTE: Regenerate your previous answer — this time ${instruction.trim()}. Do NOT acknowledge this instruction in your response. Just produce the revised answer directly.]`,
      };
    }

    setStreaming(true);
    setStreamingContent('');
    streamRef.current = '';
    const body = {
      topic: topic.trim(),
      customInstructions: customInstructions.trim(),
      phase: 'practice',
      messages: apiHistory,
      images: [],
    };
    const abort = sendMathTutorMessage(body, {
      onChunk: (c) => { streamRef.current += c; setStreamingContent(streamRef.current); },
      onDone: () => {
        const full = streamRef.current;
        if (full) setMessages(m => [...m, { role: 'assistant', content: full, timestamp: new Date().toISOString(), _edited: true }]);
        setStreaming(false);
        setStreamingContent('');
        streamRef.current = '';
      },
      onError: (err) => {
        setMessages(m => [...m, errorChatMessage(err)]);
        setStreaming(false);
        setStreamingContent('');
        streamRef.current = '';
      },
    });
    abortRef.current = abort;
  }

  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className="flex items-center gap-2 px-3 py-2 border-b border-gray-200 dark:border-[#2A2A40] flex-shrink-0 bg-white dark:bg-[#161622]">
        <button onClick={() => setView('setup')} className="p-1.5 rounded-lg text-gray-500 hover:bg-gray-100 dark:hover:bg-[#1e1e2e]" title="Change topic">
          <ArrowLeft size={15} />
        </button>
        <Calculator size={16} className="text-indigo-500" />
        <span className="text-sm font-semibold text-gray-900 dark:text-white truncate">{topic}</span>
        <div className="flex-1" />
        <ModeToggle mode={mode} onChange={setMode} />
        <button onClick={() => setShowSettings(s => !s)} className="p-1.5 rounded-lg text-gray-500 hover:bg-gray-100 dark:hover:bg-[#1e1e2e]" title="Custom instructions">
          <Settings size={15} />
        </button>
        <button onClick={handleReset} className="p-1.5 rounded-lg text-gray-500 hover:bg-gray-100 dark:hover:bg-[#1e1e2e]" title="Reset session">
          <Plus size={15} />
        </button>
      </div>

      {showSettings && (
        <div className="px-3 py-2 bg-amber-50/50 dark:bg-amber-900/10 border-b border-amber-200 dark:border-amber-800/40 flex-shrink-0">
          <label className="text-[10px] font-semibold text-amber-700 dark:text-amber-400 uppercase tracking-wider block mb-1">Custom instructions (live)</label>
          <textarea
            value={customInstructions}
            onChange={e => setCustomInstructions(e.target.value)}
            rows={2}
            placeholder="Changes apply to the next message"
            className="w-full px-2 py-1.5 rounded border border-amber-200 dark:border-amber-800 bg-white dark:bg-[#0D0D14] text-xs text-gray-900 dark:text-gray-100 outline-none resize-none"
          />
        </div>
      )}

      {/* Split: chat on left, canvas on right. Columns hide based on `mode`. */}
      <div className={`flex-1 min-h-0 grid gap-2 p-2 bg-gray-50 dark:bg-[#0D0D14] ${
        mode === 'both' ? 'grid-cols-1 md:grid-cols-2' : 'grid-cols-1'
      }`}>
        {/* Chat column — hidden in canvas-only mode */}
        <div className={`flex flex-col min-h-0 border border-gray-200 dark:border-[#2A2A40] rounded-xl overflow-hidden bg-white dark:bg-[#161622] ${
          mode === 'canvas' ? 'hidden' : ''
        }`}>
          <div className="flex-1 min-h-0 overflow-hidden">
            <ChatContainer
              messages={visibleMessages}
              streamingContent={streaming ? streamingContent : ''}
              streamingSources={[]}
              hideInput
              onUserEditMessage={onUserEditMessage}
              onAiInstruct={onAiInstruct}
              className="h-full border-0 rounded-none"
            />
          </div>
          <div className="p-2 border-t border-gray-200 dark:border-[#2A2A40] flex-shrink-0 space-y-1.5">
            <div className="flex gap-1.5">
              <input
                value={input}
                onChange={e => setInput(e.target.value)}
                onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); handleSend(input); } }}
                placeholder={streaming ? 'Thinking…' : 'Ask a question or type a response…'}
                disabled={streaming}
                className="flex-1 px-3 py-2 rounded-lg border border-gray-200 dark:border-[#2A2A40] bg-gray-50 dark:bg-[#0D0D14] text-sm text-gray-900 dark:text-white outline-none focus:ring-2 focus:ring-indigo-500/40"
              />
              {streaming ? (
                <button onClick={handleStop} className="px-3 py-2 rounded-lg bg-rose-600 hover:bg-rose-700 text-white text-xs font-medium flex items-center gap-1">
                  <InlineProgress active /> Stop
                </button>
              ) : (
                <button onClick={() => handleSend(input)} disabled={!input.trim()} className="px-3 py-2 rounded-lg bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-medium disabled:opacity-40 flex items-center gap-1">
                  <Send size={12} /> Send
                </button>
              )}
            </div>
            <div className="flex gap-1.5">
              <button onClick={handleFeedback} disabled={streaming} className="flex-1 px-3 py-2 rounded-lg border border-indigo-400/60 bg-indigo-50 dark:bg-indigo-500/10 text-indigo-700 dark:text-indigo-300 text-xs font-semibold hover:bg-indigo-100 dark:hover:bg-indigo-500/20 disabled:opacity-40 inline-flex items-center justify-center gap-1.5">
                <Check size={12} /> Get feedback
              </button>
              <button onClick={handleGrade} disabled={streaming} className="flex-1 px-3 py-2 rounded-lg border border-emerald-400/60 bg-emerald-50 dark:bg-emerald-500/10 text-emerald-700 dark:text-emerald-300 text-xs font-semibold hover:bg-emerald-100 dark:hover:bg-emerald-500/20 disabled:opacity-40 inline-flex items-center justify-center gap-1.5">
                <ClipboardCheck size={12} /> Grade my work
              </button>
            </div>
            {error && <p className="text-[11px] text-rose-500">{error}</p>}
          </div>
        </div>

        {/* Canvas column — hidden in tutor-only mode */}
        <div className={`min-h-[280px] ${mode === 'tutor' ? 'hidden' : ''}`}>
          <TutorCanvas onCaptureReady={(api) => { captureRef.current = api; }} dark={dark} />
        </div>
      </div>
    </div>
  );
}

// Tutor-view mode toggle: Both | Tutor | Canvas. Segmented control.
function ModeToggle({ mode, onChange }) {
  const options = [
    { id: 'both',   label: 'Both' },
    { id: 'tutor',  label: 'Tutor' },
    { id: 'canvas', label: 'Canvas' },
  ];
  return (
    <div className="inline-flex items-center gap-0 rounded-lg border border-gray-200 dark:border-[#2A2A40] bg-gray-50 dark:bg-[#0D0D14] p-0.5">
      {options.map(o => (
        <button
          key={o.id}
          onClick={() => onChange(o.id)}
          className={`px-2.5 py-1 rounded-md text-[11px] font-semibold transition-colors ${
            mode === o.id
              ? 'bg-indigo-600 text-white shadow-sm'
              : 'text-gray-600 dark:text-gray-300 hover:text-gray-900 dark:hover:text-white'
          }`}
          title={`${o.label} mode`}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}
