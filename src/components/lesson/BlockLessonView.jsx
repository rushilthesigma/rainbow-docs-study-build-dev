import { useEffect, useMemo, useRef, useState } from 'react';
import { ArrowLeft, Trophy, Lightbulb } from 'lucide-react';
import StageTracker from './StageTracker';
import ReadingBlock from './ReadingBlock';
import QuizBlock from './QuizBlock';
import ProgressBar from '../shared/ProgressBar';
import { SkeletonProse } from '../shared/Skeleton';
import { useWindowManagerOptional } from '../../context/WindowManagerContext';
import {
  generateLessonBlocks as curriculumGenerateBlocks,
  generateFinalQuiz as curriculumGenerateFinalQuiz,
  completeLessonBlock as curriculumCompleteBlock,
  gradeQuizBlock as curriculumGradeBlock,
} from '../../api/curriculum';

// Block-based lesson runner. Walks the user through 8 stages:
//   R1 → Q1 → R2 → Q2 → R3 (SRS) → Q3 → R4 → FINAL QUIZ
//
// When the surrounding window is maximized or the browser is in
// fullscreen, the lesson swaps to a side-by-side layout: the current
// reading sits on the left, its paired quiz on the right. The student
// can read and answer concurrently — the next pair loads after the
// quiz is submitted.
export default function BlockLessonView({ curriculumId, lesson, onBack, api: apiProp, backLabel = 'Back to curriculum' }) {
  const api = useMemo(() => {
    if (apiProp) return apiProp;
    return {
      generateBlocks: () => curriculumGenerateBlocks(curriculumId, lesson.id),
      generateFinalQuiz: () => curriculumGenerateFinalQuiz(curriculumId, lesson.id),
      gradeBlock: (bid, resp) => curriculumGradeBlock(curriculumId, lesson.id, bid, resp),
      completeBlock: (bid) => curriculumCompleteBlock(curriculumId, lesson.id, bid),
    };
  }, [apiProp, curriculumId, lesson.id]);

  const [blocks, setBlocks] = useState(Array.isArray(lesson.blocks) ? lesson.blocks : []);
  const [activeIdx, setActiveIdx] = useState(() => {
    const arr = Array.isArray(lesson.blocks) ? lesson.blocks : [];
    if (arr.length === 0) return 0;
    const firstIncomplete = arr.findIndex((b) => !b.completedAt);
    return firstIncomplete === -1 ? arr.length - 1 : firstIncomplete;
  });
  const [generating, setGenerating] = useState(false);
  const [err, setErr] = useState('');

  // ── Detect "fullscreen-ish" layout — either the surrounding desktop
  // window is maximized, the page is in browser fullscreen, or (for
  // standalone routes where there's no window chrome at all) the
  // viewport is wide enough that splitting the lesson left/right
  // actually pays off. The student gets the reading + quiz side by
  // side instead of one at a time.
  const wm = useWindowManagerOptional();
  const rootRef = useRef(null);
  const [browserFs, setBrowserFs] = useState(false);
  const [wideViewport, setWideViewport] = useState(() => typeof window !== 'undefined' && window.innerWidth >= 1280);
  useEffect(() => {
    function onFs() {
      setBrowserFs(!!(document.fullscreenElement || document.webkitFullscreenElement));
    }
    function onResize() {
      setWideViewport(window.innerWidth >= 1280);
    }
    document.addEventListener('fullscreenchange', onFs);
    document.addEventListener('webkitfullscreenchange', onFs);
    window.addEventListener('resize', onResize);
    return () => {
      document.removeEventListener('fullscreenchange', onFs);
      document.removeEventListener('webkitfullscreenchange', onFs);
      window.removeEventListener('resize', onResize);
    };
  }, []);
  const windowMaximized = (() => {
    if (!wm?.state?.windows) return false;
    // Find the window that contains us — the lesson view is rendered
    // inside an app whose window has appId 'curriculum' or 'lessons'.
    // We don't know our own appId from here, so the simplest robust
    // proxy is: is there a maximized window currently focused?
    const wins = Object.values(wm.state.windows);
    return wins.some(w => w.isMaximized && !w.isMinimized);
  })();
  const sideBySide = (windowMaximized || browserFs || (!wm && wideViewport));

  useEffect(() => {
    let cancelled = false;
    if (blocks.length >= 7) return;
    (async () => {
      setGenerating(true); setErr('');
      try {
        const { blocks: gen } = await api.generateBlocks();
        if (cancelled) return;
        setBlocks(gen);
        setActiveIdx(0);
      } catch (e) {
        if (!cancelled) setErr(e.message || 'Failed to build lesson');
      } finally {
        if (!cancelled) setGenerating(false);
      }
    })();
    return () => { cancelled = true; };
  }, [api]);

  function advance() {
    setActiveIdx(i => Math.min(blocks.length - 1, i + 1));
  }

  // Jump straight to the next reading (skipping the paired quiz). Used
  // by the side-by-side layout when the quiz is submitted — we want
  // the next reading + next quiz, not just the next quiz.
  function advanceToNextReading() {
    const next = blocks.findIndex((b, i) => i > activeIdx && b.type === 'reading');
    if (next === -1) setActiveIdx(blocks.length - 1);
    else setActiveIdx(next);
  }

  async function handleReadingComplete() {
    const block = blocks[activeIdx];
    if (!block) return;
    if (block.completedAt) return advance();
    try {
      const res = await api.completeBlock(block.id);
      setBlocks(prev => prev.map((b, i) => i === activeIdx ? { ...b, completedAt: res.block.completedAt } : b));
      advance();
    } catch (e) { setErr(e.message); }
  }

  // Side-by-side variant: mark the reading complete without advancing
  // the active index. The paired quiz is already visible on the right.
  async function handleReadingCompleteInPlace(blockIdx) {
    const block = blocks[blockIdx];
    if (!block || block.completedAt) return;
    try {
      const res = await api.completeBlock(block.id);
      setBlocks(prev => prev.map((b, i) => i === blockIdx ? { ...b, completedAt: res.block.completedAt } : b));
    } catch (e) { setErr(e.message); }
  }

  async function handleQuizSubmit(results, quizBlockIdx = activeIdx) {
    const idx = quizBlockIdx;
    setBlocks(prev => prev.map((b, i) => i === idx
      ? { ...b, score: results.score, completedAt: new Date().toISOString(), responses: results.results }
      : b
    ));
    api.completeBlock(blocks[idx].id).catch(() => {});

    // After Q3 (block index 5) of a 7-block lesson, the server needs to
    // mint the final quiz. Same trigger applies in side-by-side mode.
    if (idx === 5 && blocks.length === 7) {
      try {
        const { block: finalBlock } = await api.generateFinalQuiz();
        setBlocks(prev => [...prev, finalBlock]);
      } catch (e) {
        setErr('Failed to build final quiz: ' + (e.message || ''));
      }
    }

    // In side-by-side mode we want to land on the NEXT reading (so the
    // next pair shows up). Otherwise — single-block mode — fall through
    // to the original advance() behaviour.
    if (sideBySide) {
      advanceToNextReading();
    } else {
      advance();
    }
  }

  // Resolve which reading + quiz to show in side-by-side mode. The
  // pair is anchored on the active reading; if the user clicked on a
  // quiz in the stage tracker, fall back to the reading that precedes
  // it.
  function getPair() {
    let leftIdx = activeIdx;
    if (blocks[leftIdx]?.type !== 'reading') {
      // walk back to the preceding reading
      for (let i = leftIdx - 1; i >= 0; i--) {
        if (blocks[i]?.type === 'reading') { leftIdx = i; break; }
      }
    }
    const rightIdx = leftIdx + 1; // quiz that pairs with this reading
    return { leftIdx, rightIdx, left: blocks[leftIdx], right: blocks[rightIdx] };
  }

  const active = blocks[activeIdx];
  const allDone = blocks.length === 8 && blocks.every(b => b.completedAt);
  const avgQuizScore = (() => {
    const qs = blocks.filter(b => b.type === 'quiz' && typeof b.score === 'number').map(b => b.score);
    return qs.length ? Math.round(qs.reduce((s, n) => s + n, 0) / qs.length) : 0;
  })();

  // Width container: in side-by-side mode we let the lesson breathe to
  // ~7xl so two columns actually fit. The single-block layout keeps
  // its tighter reading-width column.
  const wrapWidth = sideBySide ? 'max-w-7xl' : 'max-w-3xl';

  return (
    <div ref={rootRef} className={`w-full ${wrapWidth} mx-auto px-5 md:px-8 py-7 md:py-9`}>
      {/* Back button */}
      <button
        onClick={onBack}
        className="group inline-flex items-center gap-1.5 text-[12px] font-medium text-blue-200/55 hover:text-blue-100 mb-6 transition-colors"
      >
        <ArrowLeft size={13} className="group-hover:-translate-x-0.5 transition-transform" />
        {backLabel}
      </button>

      {/* Lesson title — pill tag + headline + subtitle */}
      <header className="mb-8">
        <span className="inline-flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-[0.18em] text-blue-300/85 bg-blue-500/[0.10] border border-blue-400/[0.22] rounded-full px-2.5 py-0.5 mb-4">
          <Lightbulb size={11} strokeWidth={2.4} /> Lesson
        </span>
        <h1 className="text-[30px] md:text-[36px] font-semibold tracking-[-0.02em] text-white/95 leading-[1.1] mb-2">
          {lesson.title}
        </h1>
        {lesson.description && (
          <p className="text-white/45 text-[14px] leading-relaxed max-w-[640px]">
            {lesson.description}
          </p>
        )}
      </header>

      {/* Generating state */}
      {generating && (
        <div className="rounded-3xl border border-blue-400/[0.18] bg-blue-500/[0.04] backdrop-blur-sm p-8 mb-6">
          <ProgressBar
            active
            label="Building your lesson"
            hint="4 readings + 4 quizzes · 15–30 seconds"
            duration={20000}
          />
          <div className="mt-6 space-y-3 opacity-40">
            <SkeletonProse lines={5} />
          </div>
        </div>
      )}

      {err && !generating && (
        <div className="mb-4 px-4 py-3 rounded-2xl border border-rose-500/30 bg-rose-500/10 text-[13px] text-rose-300">
          {err}
        </div>
      )}

      {blocks.length >= 7 && (
        <>
          <StageTracker blocks={blocks} activeIdx={activeIdx} onJump={(i) => setActiveIdx(i)} />

          {allDone ? (
            <div
              className="relative overflow-hidden rounded-3xl border border-emerald-400/25 p-10 md:p-12 text-center"
              style={{
                background:
                  'radial-gradient(at 50% 0%, rgba(16,185,129,0.18) 0%, transparent 55%),' +
                  'radial-gradient(at 100% 100%, rgba(59,130,246,0.14) 0%, transparent 60%),' +
                  'rgba(14, 20, 24, 0.55)',
              }}
            >
              <div className="w-16 h-16 rounded-2xl bg-gradient-to-br from-emerald-400 to-emerald-600 grid place-items-center mx-auto mb-5 shadow-[0_12px_28px_rgba(16,185,129,0.45)]">
                <Trophy size={28} className="text-white drop-shadow" strokeWidth={2.2} />
              </div>
              <h2 className="text-[28px] md:text-[32px] font-semibold tracking-[-0.02em] text-white mb-2">
                Lesson complete
              </h2>
              <p className="text-white/55 text-[14px] mb-1">4 readings and 4 quizzes finished.</p>
              <p className="text-[13px] text-emerald-200/85 mb-7">
                Average quiz score
                <span className="ml-2 font-mono font-bold text-white text-[15px] tabular-nums">{avgQuizScore}%</span>
              </p>
              <button
                onClick={onBack}
                className="inline-flex items-center gap-2 px-6 py-3 rounded-2xl font-semibold text-[14px] text-white bg-gradient-to-b from-emerald-500 to-emerald-600 hover:from-emerald-400 hover:to-emerald-500 border border-emerald-400/45 shadow-[inset_0_1px_0_rgba(255,255,255,0.20),0_8px_22px_rgba(16,185,129,0.40)] transition-all"
              >
                <ArrowLeft size={14} /> {backLabel}
              </button>
            </div>
          ) : sideBySide ? (
            // ── Side-by-side layout (maximized window / fullscreen) ──
            (() => {
              const { leftIdx, rightIdx, left, right } = getPair();
              const hasRight = !!right && right.type === 'quiz';
              const readingDone = !!left?.completedAt;
              return (
                <div className="grid grid-cols-1 xl:grid-cols-[1.05fr_1fr] gap-6 items-start">
                  {/* Left column — reading */}
                  <div className="min-w-0">
                    <div className="mb-3 flex items-center gap-2">
                      <span className="text-[10px] font-black uppercase tracking-[0.20em] text-blue-300/70">Read</span>
                      {readingDone && (
                        <span className="text-[10px] font-bold uppercase tracking-wide text-blue-300/85 bg-blue-500/15 border border-blue-400/25 px-1.5 py-0.5 rounded">Marked complete</span>
                      )}
                    </div>
                    {left ? (
                      <ReadingBlock
                        key={`${left.id}-r`}
                        block={left}
                        hideContinue={hasRight}
                        continueLabel={readingDone ? 'Marked complete' : 'Mark as read'}
                        onComplete={() => handleReadingCompleteInPlace(leftIdx)}
                      />
                    ) : null}
                    {/* In split view the reading's own CTA is hidden when
                        a quiz is on the right. Surface a small mark-as-read
                        button beneath the article so the student can still
                        sign off on the reading without leaving the pair. */}
                    {left && hasRight && !readingDone && (
                      <div className="flex justify-end -mt-2">
                        <button
                          onClick={() => handleReadingCompleteInPlace(leftIdx)}
                          className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-lg text-[12px] font-semibold text-blue-100 bg-blue-500/[0.10] border border-blue-400/[0.30] hover:bg-blue-500/[0.18] hover:text-white hover:border-blue-400/[0.50] transition-all"
                        >
                          Mark as read
                        </button>
                      </div>
                    )}
                  </div>

                  {/* Right column — paired quiz */}
                  <div className="min-w-0 xl:sticky xl:top-6">
                    <p className="text-[10px] font-black uppercase tracking-[0.20em] text-blue-300/70 mb-3">Answer</p>
                    {hasRight ? (
                      <QuizBlock
                        key={`${right.id}-q`}
                        block={right}
                        onComplete={(results) => handleQuizSubmit(results, rightIdx)}
                        gradeFn={(blockId, responses) => api.gradeBlock(blockId, responses)}
                      />
                    ) : (
                      <div className="rounded-3xl border border-blue-400/[0.14] bg-blue-500/[0.03] p-8 text-center text-[13px] text-blue-200/55">
                        No quiz paired with this reading.
                      </div>
                    )}
                  </div>
                </div>
              );
            })()
          ) : active?.type === 'reading' ? (
            <ReadingBlock key={active.id} block={active} onComplete={handleReadingComplete} />
          ) : active?.type === 'quiz' ? (
            <QuizBlock
              key={active.id}
              block={active}
              onComplete={handleQuizSubmit}
              gradeFn={(blockId, responses) => api.gradeBlock(blockId, responses)}
            />
          ) : null}
        </>
      )}
    </div>
  );
}
