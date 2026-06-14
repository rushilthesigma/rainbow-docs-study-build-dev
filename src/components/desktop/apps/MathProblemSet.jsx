import { useState, useRef, useEffect } from 'react';
import { ArrowLeft, Check, ClipboardCheck, ChevronLeft, ChevronRight } from 'lucide-react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import remarkMath from 'remark-math';
import rehypeKatex from 'rehype-katex';
import 'katex/dist/katex.min.css';
import { TutorCanvas, NEUTRAL_BTN } from './MathTutorApp';
import { sendMathTutorMessage, generateProblemSet } from '../../../api/mathTutor';
import MathText from '../../shared/MathText';
import ProgressBar, { InlineProgress } from '../../shared/ProgressBar';

function normalizeMath(s) {
  return s
    .replace(/\\\[([\s\S]+?)\\\]/g, (_, b) => `\n$$${b}$$\n`)
    .replace(/\\\(([\s\S]+?)\\\)/g, (_, b) => `$${b}$`);
}

const PS_KEY = 'covalent-math-problemset-v1';

function normalize(arr) {
  return (arr || []).map((p, i) => ({ id: p.id ?? i, prompt: p.prompt || '', answer: p.answer || '' }));
}
function loadPS(k) { try { const r = localStorage.getItem(k); return r ? JSON.parse(r) : null; } catch { return null; } }
function savePS(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch {} }

// Standalone problem-set runner: solve a sequence of problems one at a time on
// the canvas, with per-problem feedback, a progress bar, and "replay your work"
// (each problem keeps its own strokes). Persists progress for standalone sets
// so work survives a reload; curriculum-seeded sets re-launch fresh.
export default function MathProblemSet({ topic, count = 5, presetProblems = null, customInstructions = '', persistKey = PS_KEY, onBack }) {
  const seeded = Array.isArray(presetProblems) && presetProblems.length > 0;
  const [problems, setProblems] = useState(() => (seeded ? normalize(presetProblems) : []));
  const [idx, setIdx]           = useState(0);
  const [loading, setLoading]   = useState(!seeded);
  const [error, setError]       = useState(null);
  const [streaming, setStreaming] = useState(false);
  const [feedback, setFeedback] = useState({}); // { [problemId]: text }
  const strokesRef = useRef({});                 // { [problemId]: strokes[] }
  const captureRef = useRef(null);
  const streamRef  = useRef('');
  const abortRef   = useRef(null);
  const kicked     = useRef(false);

  // Generate (or resume) the set once on mount.
  useEffect(() => {
    if (kicked.current) return;
    kicked.current = true;
    if (seeded) { setLoading(false); return; }
    const saved = loadPS(persistKey);
    const RESUME_WINDOW = 30 * 60 * 1000; // only resume within 30 min of last save
    if (saved && saved.topic === topic && saved.problems?.length && Date.now() - (saved.savedAt || 0) < RESUME_WINDOW) {
      setProblems(normalize(saved.problems));
      setIdx(Math.min(saved.idx || 0, saved.problems.length - 1));
      strokesRef.current = saved.strokes || {};
      setFeedback(saved.feedback || {});
      setLoading(false);
      return;
    }
    (async () => {
      try {
        const { problems: ps } = await generateProblemSet({ topic, count });
        if (!ps?.length) throw new Error('No problems were generated.');
        setProblems(normalize(ps));
      } catch (e) { setError(e?.message || 'Could not generate a problem set.'); }
      finally { setLoading(false); }
    })();
    return () => { try { abortRef.current?.(); } catch {} };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Persist progress (standalone resume); skip for curriculum-seeded sets.
  useEffect(() => {
    if (seeded || !problems.length) return;
    savePS(persistKey, { topic, problems, idx, strokes: strokesRef.current, feedback, savedAt: Date.now() });
  }, [seeded, problems, idx, feedback, topic, persistKey]);

  const cur = problems[idx];

  function getFeedback(grade = false) {
    if (streaming || !cur) return;
    const png = captureRef.current?.capture?.();
    if (!png || captureRef.current.isEmpty()) { setError('Draw your work on the canvas first.'); setTimeout(() => setError(null), 2500); return; }
    setError(null);
    const ask = grade
      ? `Problem: ${cur.prompt}\n\nHere is my final work. Grade it out of 10 and show the model solution.`
      : `Problem: ${cur.prompt}\n\nHere is my work so far. Give step-by-step feedback: tell me where I am, whether it's correct, and exactly what to do next.`;
    streamRef.current = '';
    setStreaming(true);
    const id = cur.id;
    setFeedback(f => ({ ...f, [id]: '' }));
    const abort = sendMathTutorMessage(
      {
        topic,
        customInstructions: (customInstructions || '').trim(),
        phase: grade ? 'grade' : 'practice',
        messages: [{ role: 'user', content: ask }],
        images: [{ dataUrl: png, mimeType: 'image/png' }],
      },
      {
        onChunk: (c) => { streamRef.current += c; setFeedback(f => ({ ...f, [id]: streamRef.current })); },
        onDone:  () => { setStreaming(false); streamRef.current = ''; },
        onError: (err) => { setFeedback(f => ({ ...f, [id]: `⚠️ ${typeof err === 'string' ? err : (err?.message || 'Something went wrong.')}` })); setStreaming(false); streamRef.current = ''; },
      },
    );
    abortRef.current = abort;
  }

  function go(delta) {
    if (abortRef.current) try { abortRef.current(); } catch {}
    setStreaming(false);
    setIdx(i => Math.max(0, Math.min(problems.length - 1, i + delta)));
  }

  if (loading) {
    return (
      <Center>
        <div className="w-full max-w-xs px-8 animate-view-fade">
          <ProgressBar active label="Generating problems…" hint="This usually takes a few seconds" />
        </div>
      </Center>
    );
  }
  if (error && !problems.length) {
    return (
      <Center>
        <div className="text-center animate-view-fade">
          <p className="text-rose-300 text-sm mb-3">{error}</p>
          {onBack && <button onClick={onBack} className="px-3 py-1.5 rounded-lg bg-white/10 text-white/80 text-[13px] hover:bg-white/15 transition-colors">Back</button>}
        </div>
      </Center>
    );
  }
  if (!cur) return <Center><span className="text-white/60 text-sm">No problems.</span></Center>;

  const progress = ((idx + 1) / problems.length) * 100;
  const fb = feedback[cur.id];

  return (
    <div className="flex h-full bg-transparent animate-view-fade" style={{ fontFamily: '-apple-system, BlinkMacSystemFont, "SF Pro Display", system-ui, sans-serif' }}>
      {/* Main column: header + progress + prompt + canvas */}
      <div className="flex flex-col flex-1 min-w-0 h-full">
        {/* Header — notes-style: inline back link + topic, quiet nav actions */}
        <div className="flex items-center gap-2.5 mb-3 flex-shrink-0">
          {onBack && (
            <button onClick={onBack} className="flex items-center gap-2 text-sm text-white/35 hover:text-white/60 transition-colors flex-shrink-0">
              <ArrowLeft size={16} /> Math Tutor
            </button>
          )}
          <span className="w-1 h-1 rounded-full bg-white/20 flex-shrink-0" />
          <span className="text-sm font-bold text-white/90 truncate">{topic}</span>
          <div className="flex-1" />
          <span className="text-[11px] text-white/45 tabular-nums">Problem {idx + 1} of {problems.length}</span>
          <div className="flex items-center gap-0.5 ml-1">
            <button onClick={() => go(-1)} disabled={idx === 0} title="Previous" className="p-1.5 rounded-md text-white/35 hover:text-white/70 hover:bg-white/[0.05] disabled:opacity-25 disabled:cursor-not-allowed transition-colors"><ChevronLeft size={15} /></button>
            <button onClick={() => go(1)} disabled={idx >= problems.length - 1} title="Next" className="p-1.5 rounded-md text-white/35 hover:text-white/70 hover:bg-white/[0.05] disabled:opacity-25 disabled:cursor-not-allowed transition-colors"><ChevronRight size={15} /></button>
          </div>
        </div>

        {/* Progress */}
        <div className="h-1 rounded-full bg-white/[0.08] overflow-hidden flex-shrink-0">
          <div className="h-full bg-blue-400 rounded-full transition-all duration-500" style={{ width: `${progress}%` }} />
        </div>

        {/* Problem prompt */}
        <div className="mt-3 px-4 py-3 rounded-lg bg-white/[0.03] border border-white/[0.08] flex-shrink-0">
          <MathText as="div" className="text-[14px] text-white/90 leading-relaxed">{cur.prompt}</MathText>
        </div>

        {/* Canvas (remounts per problem so each keeps its own work) */}
        <div className="flex-1 min-h-0 pt-2">
          <TutorCanvas
            key={cur.id}
            onCaptureReady={(api) => { captureRef.current = api; }}
            initialStrokes={strokesRef.current[cur.id] || null}
            onStrokesChange={(s) => {
              strokesRef.current = { ...strokesRef.current, [cur.id]: s };
              if (!seeded) savePS(persistKey, { topic, problems, idx, strokes: strokesRef.current, feedback, savedAt: Date.now() });
            }}
          />
        </div>
      </div>

      {/* Right sidebar: actions + feedback */}
      <div className="flex flex-col w-52 flex-shrink-0 border-l border-white/[0.08] p-2 gap-2">
        {/* Action buttons — neutral surfaces, identity in the icon color */}
        <button onClick={() => getFeedback(false)} disabled={streaming} className={`${NEUTRAL_BTN} w-full py-2.5 text-[12px] disabled:opacity-50 disabled:cursor-not-allowed flex-shrink-0`}>
          {streaming ? <><InlineProgress active /> Checking…</> : <><Check size={12} className="text-emerald-300" /> Get feedback</>}
        </button>
        <button onClick={() => getFeedback(true)} disabled={streaming} className={`${NEUTRAL_BTN} w-full py-2.5 text-[12px] disabled:opacity-50 disabled:cursor-not-allowed flex-shrink-0`}>
          <ClipboardCheck size={12} className="text-amber-300" /> Grade
        </button>
        {idx < problems.length - 1 ? (
          <button onClick={() => go(1)} className={`${NEUTRAL_BTN} w-full py-2.5 text-[12px] flex-shrink-0`}>
            Next <ChevronRight size={12} />
          </button>
        ) : (
          onBack && (
            <button onClick={onBack} className="w-full py-2.5 rounded-lg border border-emerald-400/30 bg-emerald-500/10 text-emerald-200 hover:bg-emerald-500/20 hover:border-emerald-400/50 text-[12px] font-medium flex items-center justify-center gap-1.5 transition-colors flex-shrink-0">
              <Check size={12} /> Finish
            </button>
          )
        )}

        {error && <p className="text-[11px] text-[#f87171] px-1 animate-fade-in flex-shrink-0">{error}</p>}

        {/* Divider */}
        {fb != null && <div className="h-px bg-white/[0.08] flex-shrink-0" />}

        {/* Feedback */}
        {fb != null && (
          <div key={cur.id} className="flex-1 min-h-0 overflow-y-auto rounded-lg bg-white/[0.03] border border-white/[0.08] px-3 py-2.5 animate-view-fade">
            <div className="prose prose-sm prose-invert max-w-none prose-p:my-1 prose-headings:my-1.5 prose-ul:my-1 prose-li:my-0 text-[12px] text-white/80 leading-relaxed">
              <ReactMarkdown remarkPlugins={[remarkGfm, remarkMath]} rehypePlugins={[[rehypeKatex, { throwOnError: false, errorColor: '#94a3b8' }]]}>
                {normalizeMath(fb)}
              </ReactMarkdown>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

function Center({ children }) {
  return <div className="h-full flex items-center justify-center">{children}</div>;
}
