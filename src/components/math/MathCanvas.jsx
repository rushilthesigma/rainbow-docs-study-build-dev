import { useState, useRef, useEffect } from 'react';
import { Pen, Eraser, Undo2, Trash2, Check, ArrowRight, Loader2, AlertCircle } from 'lucide-react';
import { apiFetch } from '../../api/client';
import MathText from '../shared/MathText';

const PEN_SIZES = { thin: 2, medium: 4, thick: 7 };

function isDark() {
  return document.documentElement.classList.contains('dark');
}

export default function MathCanvas({ className = '', topic: initialTopic }) {
  const canvasRef = useRef(null);
  const ctxRef = useRef(null);
  const [tool, setTool] = useState('pen');
  const [penSize, setPenSize] = useState('medium');
  const [strokes, setStrokes] = useState([]);
  const [currentStroke, setCurrentStroke] = useState([]);
  const [drawing, setDrawing] = useState(false);
  const [dark, setDark] = useState(isDark);

  // Problem state
  const [view, setView] = useState('setup'); // setup, solve, grading, results
  const [topic, setTopic] = useState(initialTopic || '');
  const [problems, setProblems] = useState([]);
  const [currentProblem, setCurrentProblem] = useState(0);
  const [answers, setAnswers] = useState({});
  const [generating, setGenerating] = useState(false);
  const [grading, setGrading] = useState(false);
  const [results, setResults] = useState(null);
  const [error, setError] = useState(null);

  // Watch dark mode changes
  useEffect(() => {
    const observer = new MutationObserver(() => {
      const now = isDark();
      setDark(now);
    });
    observer.observe(document.documentElement, { attributes: true, attributeFilter: ['class'] });
    return () => observer.disconnect();
  }, []);

  // Re-render canvas when dark mode changes
  useEffect(() => {
    if (view === 'solve' && canvasRef.current && ctxRef.current) {
      replayStrokes(strokes);
    }
  }, [dark]);

  const bgColor = dark ? '#000000' : '#ffffff';
  const penColor = dark ? '#ffffff' : '#1a1a2e';

  // Canvas setup
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const dpr = window.devicePixelRatio || 1;
    const rect = canvas.getBoundingClientRect();
    canvas.width = rect.width * dpr;
    canvas.height = rect.height * dpr;
    const ctx = canvas.getContext('2d');
    ctx.scale(dpr, dpr);
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    ctxRef.current = ctx;
    clearCanvas(ctx, rect.width, rect.height);
  }, [view]);

  function clearCanvas(ctx, w, h) {
    ctx.fillStyle = bgColor;
    ctx.fillRect(0, 0, w, h);
  }

  function replayStrokes(strokeList) {
    const canvas = canvasRef.current;
    if (!canvas || !ctxRef.current) return;
    const rect = canvas.getBoundingClientRect();
    clearCanvas(ctxRef.current, rect.width, rect.height);
    const bg = isDark() ? '#000000' : '#ffffff';
    const pen = isDark() ? '#ffffff' : '#1a1a2e';
    for (const stroke of strokeList) {
      ctxRef.current.strokeStyle = stroke.tool === 'eraser' ? bg : pen;
      ctxRef.current.lineWidth = stroke.size;
      ctxRef.current.beginPath();
      stroke.points.forEach((p, i) => {
        if (i === 0) ctxRef.current.moveTo(p.x, p.y);
        else ctxRef.current.lineTo(p.x, p.y);
      });
      ctxRef.current.stroke();
    }
  }

  function getPos(e) {
    const rect = canvasRef.current.getBoundingClientRect();
    const touch = e.touches?.[0];
    const clientX = touch ? touch.clientX : e.clientX;
    const clientY = touch ? touch.clientY : e.clientY;
    return { x: clientX - rect.left, y: clientY - rect.top };
  }

  function startDraw(e) {
    e.preventDefault();
    setDrawing(true);
    const pos = getPos(e);
    setCurrentStroke([pos]);
    const ctx = ctxRef.current;
    ctx.strokeStyle = tool === 'eraser' ? bgColor : penColor;
    ctx.lineWidth = tool === 'eraser' ? 20 : PEN_SIZES[penSize];
    ctx.beginPath();
    ctx.moveTo(pos.x, pos.y);
  }

  function draw(e) {
    if (!drawing) return;
    e.preventDefault();
    const pos = getPos(e);
    setCurrentStroke(prev => [...prev, pos]);
    ctxRef.current.lineTo(pos.x, pos.y);
    ctxRef.current.stroke();
  }

  function endDraw() {
    if (!drawing) return;
    setDrawing(false);
    if (currentStroke.length > 1) {
      setStrokes(prev => [...prev, { points: currentStroke, tool, size: tool === 'eraser' ? 20 : PEN_SIZES[penSize] }]);
    }
    setCurrentStroke([]);
  }

  function handleUndo() {
    setStrokes(prev => {
      const next = prev.slice(0, -1);
      replayStrokes(next);
      return next;
    });
  }

  function handleClear() {
    setStrokes([]);
    const canvas = canvasRef.current;
    if (canvas) clearCanvas(ctxRef.current, canvas.getBoundingClientRect().width, canvas.getBoundingClientRect().height);
  }

  function saveCurrentProblem() {
    if (!canvasRef.current) return;
    const data = canvasRef.current.toDataURL('image/png');
    setProblems(prev => prev.map((p, i) => i === currentProblem ? { ...p, canvasData: data, strokes: [...strokes] } : p));
  }

  function switchProblem(idx) {
    saveCurrentProblem();
    setCurrentProblem(idx);
    const p = problems[idx];
    if (p?.strokes?.length) {
      setStrokes(p.strokes);
      setTimeout(() => replayStrokes(p.strokes), 50);
    } else {
      setStrokes([]);
      setTimeout(() => {
        const canvas = canvasRef.current;
        if (canvas) clearCanvas(ctxRef.current, canvas.getBoundingClientRect().width, canvas.getBoundingClientRect().height);
      }, 50);
    }
  }

  async function generateProblems() {
    if (!topic.trim()) return;
    setGenerating(true);
    setError(null);
    try {
      const result = await apiFetch('/api/chat', {
        method: 'POST',
        body: JSON.stringify({
          system: 'You are a math problem generator. Output ONLY valid JSON. No markdown, no code fences. Inside the "text" and "answer" string fields, wrap ALL math in LaTeX dollar delimiters ($...$ for inline, $$...$$ for display). Never use ASCII pseudo-math like x^2; write $x^2$.',
          messages: [{ role: 'user', content: `Generate 5 math problems on "${topic}". Return JSON: {"problems": [{"text": "problem statement with $LaTeX$ math", "answer": "correct answer with $LaTeX$ math"}]}` }],
        }),
      });
      const text = result.content?.[0]?.text || '';
      let parsed;
      try { parsed = JSON.parse(text); } catch {
        const match = text.match(/\{[\s\S]*\}/);
        if (match) parsed = JSON.parse(match[0]);
      }
      if (parsed?.problems) {
        setProblems(parsed.problems.map((p, i) => ({ ...p, id: i, canvasData: null, strokes: [], userAnswer: '' })));
        setView('solve');
        setCurrentProblem(0);
      } else {
        setError('Failed to parse problems. Try again.');
      }
    } catch (err) {
      console.error(err);
      setError(err.message || 'Failed to generate problems. Check your connection.');
    }
    setGenerating(false);
  }

  async function handleGrade() {
    saveCurrentProblem();
    setGrading(true);
    setView('grading');
    try {
      const submissions = problems.map((p, i) => `Problem ${i + 1}: "${p.text}" — Student answer: "${answers[i] || 'no answer'}"`).join('\n');
      const result = await apiFetch('/api/chat', {
        method: 'POST',
        body: JSON.stringify({
          system: 'You are a math grader. Output ONLY valid JSON. No markdown.',
          messages: [{ role: 'user', content: `Grade these answers:\n${submissions}\n\nReturn JSON: {"grades": [{"correct": true/false, "explanation": "brief feedback"}]}` }],
        }),
      });
      const text = result.content?.[0]?.text || '';
      let parsed;
      try { parsed = JSON.parse(text); } catch {
        const match = text.match(/\{[\s\S]*\}/);
        if (match) parsed = JSON.parse(match[0]);
      }
      if (parsed?.grades) {
        setResults(parsed.grades);
        setView('results');
      }
    } catch (err) { console.error(err); }
    setGrading(false);
  }

  // Full-screen loading overlay
  if (generating) {
    return (
      <div className={`flex flex-col items-center justify-center ${className}`}>
        <div className="relative mb-6">
          <div className="w-16 h-16 rounded-2xl bg-blue-600/10 dark:bg-blue-400/10 flex items-center justify-center">
            <Loader2 size={32} className="animate-spin text-blue-600 dark:text-blue-400" />
          </div>
        </div>
        <h2 className="text-lg font-bold text-gray-900 dark:text-white mb-2">Generating Problems</h2>
        <p className="text-sm text-gray-500 dark:text-gray-400">
          Creating 5 problems on <span className="font-medium text-gray-700 dark:text-gray-300">{topic}</span>
        </p>
        <div className="flex gap-1 mt-4">
          <div className="w-2 h-2 rounded-full bg-blue-500 animate-bounce" style={{ animationDelay: '0ms' }} />
          <div className="w-2 h-2 rounded-full bg-blue-500 animate-bounce" style={{ animationDelay: '150ms' }} />
          <div className="w-2 h-2 rounded-full bg-blue-500 animate-bounce" style={{ animationDelay: '300ms' }} />
        </div>
      </div>
    );
  }

  // Setup view
  if (view === 'setup') {
    return (
      <div className={`flex flex-col items-center justify-center p-6 ${className}`}>
        <h2 className="text-lg font-bold text-gray-900 dark:text-white mb-4">Math Practice</h2>

        {error && (
          <div className="flex items-center gap-2 mb-4 px-4 py-2.5 rounded-xl bg-rose-50 dark:bg-rose-900/15 border border-rose-200 dark:border-rose-800 max-w-sm w-full">
            <AlertCircle size={16} className="text-rose-500 flex-shrink-0" />
            <p className="text-xs text-rose-600 dark:text-rose-400 flex-1">{error}</p>
          </div>
        )}

        <input
          value={topic}
          onChange={e => setTopic(e.target.value)}
          placeholder="e.g., Quadratic equations, Integration..."
          className="w-full max-w-sm px-4 py-2.5 rounded-xl border border-gray-200 dark:border-[#2A2A40] bg-white dark:bg-[#161622] text-sm text-gray-900 dark:text-white mb-4 outline-none focus:ring-2 focus:ring-blue-500/40"
          onKeyDown={e => e.key === 'Enter' && generateProblems()}
        />
        <button
          onClick={generateProblems}
          disabled={!topic.trim()}
          className="px-5 py-2.5 rounded-xl bg-blue-600 text-white text-sm font-medium hover:bg-blue-700 disabled:opacity-50 flex items-center gap-2"
        >
          Generate 5 Problems
        </button>
      </div>
    );
  }

  // Grading view
  if (view === 'grading') {
    return (
      <div className={`flex flex-col items-center justify-center ${className}`}>
        <div className="relative mb-6">
          <div className="w-16 h-16 rounded-2xl bg-emerald-600/10 flex items-center justify-center">
            <Loader2 size={32} className="animate-spin text-emerald-600 dark:text-emerald-400" />
          </div>
        </div>
        <h2 className="text-lg font-bold text-gray-900 dark:text-white mb-2">Grading</h2>
        <p className="text-sm text-gray-500">Checking your answers...</p>
      </div>
    );
  }

  // Results view
  if (view === 'results' && results) {
    const score = results.filter(r => r.correct).length;
    return (
      <div className={`flex flex-col p-4 overflow-y-auto ${className}`}>
        <div className="text-center mb-4">
          <p className="text-2xl font-bold text-gray-900 dark:text-white">{score}/{problems.length}</p>
          <p className="text-sm text-gray-500">correct</p>
        </div>
        <div className="space-y-3">
          {problems.map((p, i) => (
            <div key={i} className={`rounded-xl p-3 border ${results[i]?.correct ? 'bg-emerald-50 dark:bg-emerald-900/10 border-emerald-200 dark:border-emerald-800' : 'bg-rose-50 dark:bg-rose-900/10 border-rose-200 dark:border-rose-800'}`}>
              <MathText as="p" className="text-sm font-medium text-gray-800 dark:text-gray-200">{p.text}</MathText>
              <MathText as="p" className="text-xs text-gray-500 mt-1">Your answer: {answers[i] || '—'}</MathText>
              {results[i]?.explanation && <MathText as="p" className="text-xs text-gray-500 mt-1 italic">{results[i].explanation}</MathText>}
            </div>
          ))}
        </div>
        <button onClick={() => { setView('setup'); setProblems([]); setAnswers({}); setResults(null); }} className="mt-4 px-4 py-2 rounded-xl bg-blue-600 text-white text-sm font-medium hover:bg-blue-700 mx-auto">
          Practice Again
        </button>
      </div>
    );
  }

  // Solve view
  const problem = problems[currentProblem];

  return (
    <div className={`flex flex-col ${className}`}>
      {/* Problem bar */}
      <div className="flex items-center gap-2 px-3 py-2 border-b border-gray-200 dark:border-[#2A2A40] bg-white dark:bg-[#161622] flex-shrink-0">
        <div className="flex gap-1">
          {problems.map((_, i) => (
            <button key={i} onClick={() => switchProblem(i)} className={`w-6 h-6 rounded-full text-xs font-semibold ${i === currentProblem ? 'bg-blue-600 text-white' : answers[i] ? 'bg-emerald-100 dark:bg-emerald-900/30 text-emerald-600' : 'bg-gray-100 dark:bg-[#1e1e2e] text-gray-500'}`}>
              {i + 1}
            </button>
          ))}
        </div>
        <MathText as="p" className="flex-1 text-sm text-gray-800 dark:text-gray-200 font-medium truncate ml-2">{problem?.text}</MathText>
      </div>

      {/* Toolbar */}
      <div className="flex items-center gap-1 px-3 py-1.5 border-b border-gray-100 dark:border-[#2A2A40] bg-gray-50 dark:bg-[#0D0D14] flex-shrink-0">
        <button onClick={() => setTool('pen')} className={`p-1.5 rounded-lg ${tool === 'pen' ? 'bg-blue-100 dark:bg-blue-900/30 text-blue-600' : 'text-gray-400 hover:text-gray-600'}`}><Pen size={15} /></button>
        <button onClick={() => setTool('eraser')} className={`p-1.5 rounded-lg ${tool === 'eraser' ? 'bg-blue-100 dark:bg-blue-900/30 text-blue-600' : 'text-gray-400 hover:text-gray-600'}`}><Eraser size={15} /></button>
        <div className="w-px h-5 bg-gray-200 dark:bg-[#2A2A40] mx-1" />
        {Object.keys(PEN_SIZES).map(s => (
          <button key={s} onClick={() => setPenSize(s)} className={`w-6 h-6 rounded-full flex items-center justify-center ${penSize === s && tool === 'pen' ? 'bg-gray-300 dark:bg-gray-600' : 'hover:bg-gray-200 dark:hover:bg-[#1e1e2e]'}`}>
            <div className="rounded-full bg-gray-800 dark:bg-gray-200" style={{ width: PEN_SIZES[s], height: PEN_SIZES[s] }} />
          </button>
        ))}
        <div className="w-px h-5 bg-gray-200 dark:bg-[#2A2A40] mx-1" />
        <button onClick={handleUndo} className="p-1.5 rounded-lg text-gray-400 hover:text-gray-600"><Undo2 size={15} /></button>
        <button onClick={handleClear} className="p-1.5 rounded-lg text-gray-400 hover:text-gray-600"><Trash2 size={15} /></button>
        <div className="flex-1" />
        <button onClick={handleGrade} disabled={Object.keys(answers).length < problems.length} className="px-3 py-1 rounded-lg bg-emerald-600 text-white text-xs font-medium hover:bg-emerald-700 disabled:opacity-50 flex items-center gap-1">
          <Check size={13} /> Submit All
        </button>
      </div>

      {/* Canvas */}
      <div className="flex-1 relative min-h-0">
        <canvas
          ref={canvasRef}
          className={`absolute inset-0 w-full h-full cursor-crosshair ${dark ? 'bg-black' : 'bg-white'}`}
          onMouseDown={startDraw} onMouseMove={draw} onMouseUp={endDraw} onMouseLeave={endDraw}
          onTouchStart={startDraw} onTouchMove={draw} onTouchEnd={endDraw}
        />
      </div>

      {/* Answer input */}
      <div className="flex items-center gap-2 px-3 py-2 border-t border-gray-200 dark:border-[#2A2A40] bg-white dark:bg-[#161622] flex-shrink-0">
        <span className="text-xs text-gray-400">Answer:</span>
        <input
          value={answers[currentProblem] || ''}
          onChange={e => setAnswers(prev => ({ ...prev, [currentProblem]: e.target.value }))}
          placeholder="Type your answer..."
          className="flex-1 px-3 py-1.5 rounded-lg border border-gray-200 dark:border-[#2A2A40] bg-gray-50 dark:bg-[#0D0D14] text-sm text-gray-900 dark:text-white outline-none focus:ring-2 focus:ring-blue-500/40"
        />
        {currentProblem < problems.length - 1 && (
          <button onClick={() => switchProblem(currentProblem + 1)} className="p-1.5 rounded-lg text-blue-500 hover:bg-blue-50 dark:hover:bg-blue-900/20">
            <ArrowRight size={16} />
          </button>
        )}
      </div>
    </div>
  );
}
