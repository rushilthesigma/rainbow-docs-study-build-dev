import { useState, useRef, useEffect } from 'react';
import {
  Calculator, Pen, Eraser, Undo2, Trash2, Sparkles, Check,
  ArrowLeft, ClipboardCheck, Settings, MessageSquare, Layers, RotateCcw,
} from 'lucide-react';
import { sendMathTutorMessage } from '../../../api/mathTutor';
import ChatContainer from '../../chat/ChatContainer';
import { errorChatMessage } from '../../../utils/aiErrors';
import useBrowserBack from '../../../hooks/useBrowserBack';
import { InlineProgress } from '../../shared/ProgressBar';

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
function TutorCanvas({ onCaptureReady }) {
  const canvasRef = useRef(null);
  const ctxRef    = useRef(null);
  const [tool, setTool]       = useState('pen');
  const [penSize, setPenSize] = useState('medium');
  const [drawing, setDrawing] = useState(false);
  const strokesRef      = useRef([]);
  const currentStrokeRef = useRef([]);

  function clearCanvas(ctx, w, h) {
    ctx.clearRect(0, 0, w, h);
  }

  function replayStrokes() {
    const canvas = canvasRef.current;
    if (!canvas || !ctxRef.current) return;
    const rect = canvas.getBoundingClientRect();
    const ctx  = ctxRef.current;
    clearCanvas(ctx, rect.width, rect.height);
    for (const s of strokesRef.current) {
      if (s.tool === 'eraser') {
        ctx.save();
        ctx.globalCompositeOperation = 'destination-out';
        ctx.strokeStyle = 'rgba(0,0,0,1)';
      } else {
        ctx.strokeStyle = '#ffffff';
      }
      ctx.lineWidth = s.size;
      ctx.beginPath();
      s.points.forEach((p, i) => i === 0 ? ctx.moveTo(p.x, p.y) : ctx.lineTo(p.x, p.y));
      ctx.stroke();
      if (s.tool === 'eraser') ctx.restore();
    }
  }

  useEffect(() => {
    if (typeof onCaptureReady !== 'function') return;
    onCaptureReady({
      capture: () => canvasRef.current?.toDataURL('image/png') || null,
      clear:   () => { strokesRef.current = []; replayStrokes(); },
      isEmpty: () => strokesRef.current.length === 0,
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
    return () => ro.disconnect();
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
    setDrawing(true);
    const pos = getPos(e);
    currentStrokeRef.current = [pos];
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
      strokesRef.current.push({ points: currentStrokeRef.current, tool, size: tool === 'eraser' ? 22 : PEN_SIZES[penSize] });
    }
    currentStrokeRef.current = [];
  }
  function handleUndo()  { strokesRef.current.pop(); replayStrokes(); }
  function handleClear() { strokesRef.current = []; replayStrokes(); }

  const iconBtn = (active, onClick, children, title) => (
    <button
      onClick={onClick}
      title={title}
      className={`w-7 h-7 rounded-lg flex items-center justify-center transition-colors ${
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
        {Object.keys(PEN_SIZES).map(s => (
          <button
            key={s}
            onClick={() => setPenSize(s)}
            title={s}
            className={`w-7 h-7 rounded-lg flex items-center justify-center transition-colors ${
              penSize === s && tool === 'pen' ? 'bg-white/15' : 'hover:bg-white/10'
            }`}
          >
            <div className="rounded-full bg-white" style={{ width: PEN_SIZES[s], height: PEN_SIZES[s], opacity: penSize === s && tool === 'pen' ? 1 : 0.35 }} />
          </button>
        ))}
        <div className="w-px h-4 bg-white/10 mx-1" />
        {iconBtn(false, handleUndo,  <Undo2  size={13} />, 'Undo')}
        {iconBtn(false, handleClear, <Trash2 size={13} />, 'Clear')}
        <div className="flex-1" />
        <span className="text-[10px] text-white/25">Draw · tap "Get feedback" to share with tutor</span>
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

// ============== MAIN APP ==============
export default function MathTutorApp({ seedTopic = null, onBack = null, defaultMode = 'both' } = {}) {
  const persisted = loadState();
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
  const [error, setError]                       = useState(null);
  const [input, setInput]                       = useState('');
  const [showSettings, setShowSettings]         = useState(false);
  const seedKickedOff = useRef(false);
  const streamRef  = useRef('');
  const abortRef   = useRef(null);
  const captureRef = useRef(null);

  useEffect(() => {
    if (seedTopic) return;
    const trimmed = messages.slice(-50).map(m => ({
      role: m.role, content: (m.content || '').slice(0, 3000), _edited: m._edited, _error: m._error,
    }));
    saveState({ view, mode, topic, customInstructions, messages: trimmed });
  }, [view, mode, topic, customInstructions, messages, seedTopic]);

  useEffect(() => () => abortRef.current?.(), []);

  function doSend({ text, phase = 'lesson', imageDataUrl = null, hidden = false, topicOverride = null }) {
    if (streaming) return;
    const userMsg = { role: 'user', content: text, timestamp: new Date().toISOString() };
    if (imageDataUrl) userMsg.images = [{ dataUrl: imageDataUrl, mimeType: 'image/png' }];
    if (hidden) userMsg._hidden = true;
    setMessages(prev => [...prev, userMsg]);
    setStreaming(true);
    setStreamingContent('');
    streamRef.current = '';

    const history = [...messages, userMsg].slice(-20).map((m, i, arr) => {
      const isLast = i === arr.length - 1;
      return { role: m.role, content: m.content, ...(isLast && m.images ? { images: m.images } : {}) };
    });

    const body = {
      topic: (topicOverride ?? topic).trim(),
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
        setStreaming(false); setStreamingContent(''); streamRef.current = '';
      },
      onError: (err) => {
        setMessages(m => [...m, errorChatMessage(err)]);
        setStreaming(false); setStreamingContent(''); streamRef.current = '';
      },
    });
    abortRef.current = abort;
  }

  function startTutor() {
    if (!topic.trim()) return;
    setView('tutor');
    setMessages([]);
    setError(null);
    setTimeout(() => doSend({ text: `Teach me about "${topic.trim()}". Give me a real lesson — definition, why it matters, worked examples in KaTeX, then one problem to try on the canvas.`, phase: 'lesson', hidden: true }), 50);
  }


  useEffect(() => {
    if (!seedTopic || seedKickedOff.current) return;
    seedKickedOff.current = true;
    setTimeout(() => doSend({
      text: `Teach me about "${seedTopic}". Give me a real lesson — definition, why it matters, worked examples in KaTeX, then one problem to try on the canvas.`,
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
    doSend({ text: 'Here is my current work. Give me step-by-step feedback — point out the step where I am, whether it\'s correct, and hint at the next step without solving it for me.', phase: 'practice', imageDataUrl: png });
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

  // ─── Setup view ─────────────────────────────────────────────────────────────
  if (view === 'setup') {
    return (
      <div className="h-full overflow-y-auto bg-transparent">
        <div className="max-w-md mx-auto px-6 py-10 space-y-5">
          {/* Icon + title */}
          <div className="text-center">
            <div className="w-11 h-11 rounded-2xl bg-white/10 flex items-center justify-center mx-auto mb-3">
              <Calculator size={20} className="text-[#aaa]" />
            </div>
            <h1 className="text-white text-[17px] font-semibold tracking-tight">Math Tutor</h1>
          </div>

          {/* Topic */}
          <div>
            <label className="text-[11px] font-medium text-[#555] uppercase tracking-widest block mb-2">
              What do you need help on?
            </label>
            <input
              value={topic}
              onChange={e => setTopic(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && topic.trim() && startTutor()}
              placeholder="e.g. Quadratic equations, Definite integrals, Long division"
              className="w-full px-3 py-2.5 rounded-xl border border-white/10 bg-white/10 backdrop-blur-sm text-sm text-white outline-none focus:border-white/25 placeholder:text-white/25 transition-colors"
              autoFocus
            />
          </div>

          {/* Custom instructions — collapsed by default */}
          <div>
            <button
              onClick={() => setShowSettings(s => !s)}
              className="flex items-center gap-1.5 text-[11px] font-medium text-[#484848] hover:text-[#888] uppercase tracking-widest transition-colors"
            >
              <Settings size={11} />
              {showSettings ? 'Hide' : 'Custom instructions (optional)'}
            </button>
            {showSettings && (
              <textarea
                value={customInstructions}
                onChange={e => setCustomInstructions(e.target.value)}
                rows={3}
                placeholder="e.g. Prep me for AP Calc BC. Use real exam-style problems. Don't give me answers — only hints."
                className="mt-2 w-full px-3 py-2.5 rounded-xl border border-white/10 bg-white/10 backdrop-blur-sm text-sm text-white outline-none focus:border-white/25 resize-none placeholder:text-white/25 transition-colors"
              />
            )}
          </div>

          {/* Start button */}
          <button
            onClick={startTutor}
            disabled={!topic.trim()}
            className="w-full py-2.5 rounded-xl bg-white/10 hover:bg-white/15 border border-white/15 text-white text-sm font-medium disabled:opacity-30 disabled:cursor-not-allowed flex items-center justify-center gap-2 transition-colors"
          >
            <Sparkles size={13} className="text-[#888]" /> Start
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
        content: `${apiHistory[apiHistory.length - 1].content}\n\n[SYSTEM NOTE: Regenerate your previous answer — this time ${instruction.trim()}. Do NOT acknowledge this instruction in your response. Just produce the revised answer directly.]`,
      };
    }
    setStreaming(true); setStreamingContent(''); streamRef.current = '';
    const body = { topic: topic.trim(), customInstructions: customInstructions.trim(), phase: 'practice', messages: apiHistory, images: [] };
    const abort = sendMathTutorMessage(body, {
      onChunk: (c) => { streamRef.current += c; setStreamingContent(streamRef.current); },
      onDone: () => {
        const full = streamRef.current;
        if (full) setMessages(m => [...m, { role: 'assistant', content: full, timestamp: new Date().toISOString(), _edited: true }]);
        setStreaming(false); setStreamingContent(''); streamRef.current = '';
      },
      onError: (err) => {
        setMessages(m => [...m, errorChatMessage(err)]);
        setStreaming(false); setStreamingContent(''); streamRef.current = '';
      },
    });
    abortRef.current = abort;
  }

  return (
    <div className="flex flex-col h-full bg-transparent" style={{ fontFamily: '-apple-system, BlinkMacSystemFont, "SF Pro Display", system-ui, sans-serif' }}>
      {/* Header */}
      <div className="flex items-center gap-2.5 mx-2 mt-2 px-4 py-2.5 rounded-2xl flex-shrink-0 bg-white/8 border border-white/10 backdrop-blur-sm">
        <button
          onClick={() => setView('setup')}
          className="w-7 h-7 rounded-lg flex items-center justify-center text-white/40 hover:text-white hover:bg-white/10 transition-colors"
          title="Back"
        >
          <ArrowLeft size={14} />
        </button>
        <div className="w-6 h-6 rounded-lg bg-white/10 flex items-center justify-center">
          <Sparkles size={12} className="text-white" />
        </div>
        <span className="text-white font-semibold text-[14px] tracking-tight truncate">{topic}</span>
        <div className="flex-1" />

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
        <div className="px-4 py-3 border-b border-white/10 glass-header flex-shrink-0">
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
                  placeholder={streaming ? 'Thinking…' : 'Message...'}
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
              <div className="flex gap-0 border-t border-white/8">
                <button
                  onClick={handleFeedback}
                  disabled={streaming}
                  className="flex-1 py-2.5 text-white/30 hover:text-white/80 text-[12px] font-medium disabled:opacity-30 flex items-center justify-center gap-1.5 transition-colors hover:bg-white/5"
                >
                  <Check size={11} /> Get feedback
                </button>
                <div className="w-px bg-white/8" />
                <button
                  onClick={handleGrade}
                  disabled={streaming}
                  className="flex-1 py-2.5 text-white/30 hover:text-white/80 text-[12px] font-medium disabled:opacity-30 flex items-center justify-center gap-1.5 transition-colors hover:bg-white/5"
                >
                  <ClipboardCheck size={11} /> Grade my work
                </button>
              </div>
            </div>
            {error && <p className="text-[11px] text-[#f87171] px-1 mt-1.5">{error}</p>}
          </div>
        </div>

        {/* Canvas column */}
        <div className={`min-h-[280px] ${mode === 'tutor' ? 'hidden' : ''}`}>
          <TutorCanvas onCaptureReady={(api) => { captureRef.current = api; }} />
        </div>
      </div>
    </div>
  );
}
