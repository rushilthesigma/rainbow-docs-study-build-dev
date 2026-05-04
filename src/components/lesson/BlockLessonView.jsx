import { useEffect, useMemo, useState } from 'react';
import { ArrowLeft, Sparkles } from 'lucide-react';
import StageTracker from './StageTracker';
import ReadingBlock from './ReadingBlock';
import QuizBlock from './QuizBlock';
import ProgressBar from '../shared/ProgressBar';
import { SkeletonProse } from '../shared/Skeleton';
import {
  generateLessonBlocks as curriculumGenerateBlocks,
  generateFinalQuiz as curriculumGenerateFinalQuiz,
  completeLessonBlock as curriculumCompleteBlock,
  gradeQuizBlock as curriculumGradeBlock,
} from '../../api/curriculum';

// Block-based lesson runner. Walks the user through 8 stages:
//   R1 → Q1 → R2 → Q2 → R3 (SRS) → Q3 → R4 → FINAL QUIZ
// The final quiz is generated lazily (after Q3 completes) using the
// student's wrong answers from Q1-Q3 — that's the actual spaced
// repetition. Generic readings come from the upfront generation.
//
// Two host shapes are supported:
//   1. Curriculum lesson (default, backward-compatible) — pass
//      `curriculumId` + `lesson` and the legacy curriculum endpoints
//      are used.
//   2. Standalone lesson — pass an `api` object with the four
//      generate/grade/complete methods bound. `curriculumId` is
//      ignored when `api` is supplied.
export default function BlockLessonView({ curriculumId, lesson, onBack, api: apiProp, backLabel = 'Back to curriculum' }) {
  // Resolve the API: either explicit prop bag (standalone callers) or
  // the legacy curriculum binding. Memoized so the lesson-generation
  // effect's deps stay stable across renders.
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

  // Generate the first 7 blocks on mount if not cached.
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

  async function handleQuizSubmit(results) {
    const idx = activeIdx;
    setBlocks(prev => prev.map((b, i) => i === idx
      ? { ...b, score: results.score, completedAt: new Date().toISOString(), responses: results.results }
      : b
    ));
    api.completeBlock(blocks[idx].id).catch(() => {});

    // After Q3 (the third quiz at index 5) completes, generate the
    // final quiz lazily using the student's wrong answers from Q1-Q3.
    // Q3 is at index 5 because the order is R1 Q1 R2 Q2 R3 Q3 R4 (indices 0-6).
    if (idx === 5 && blocks.length === 7) {
      try {
        const { block: finalBlock } = await api.generateFinalQuiz();
        setBlocks(prev => [...prev, finalBlock]);
      } catch (e) {
        setErr('Failed to build final quiz: ' + (e.message || ''));
      }
    }
    advance();
  }

  const active = blocks[activeIdx];
  const allDone = blocks.length === 8 && blocks.every(b => b.completedAt);
  const avgQuizScore = (() => {
    const qs = blocks.filter(b => b.type === 'quiz' && typeof b.score === 'number').map(b => b.score);
    return qs.length ? Math.round(qs.reduce((s, n) => s + n, 0) / qs.length) : 0;
  })();

  return (
    <div className="w-full max-w-5xl mx-auto px-6 md:px-8 py-6 md:py-8">
      <button
        onClick={onBack}
        className="inline-flex items-center gap-1.5 text-[13px] text-gray-400 hover:text-blue-300 mb-5 transition-colors"
      >
        <ArrowLeft size={14} /> {backLabel}
      </button>

      <header className="mb-5">
        <p className="text-[11px] uppercase tracking-[0.18em] font-bold text-blue-300/80 mb-1">Lesson</p>
        <h1 className="text-3xl font-black tracking-tight text-white">{lesson.title}</h1>
        {lesson.description && <p className="text-gray-300 mt-2 leading-relaxed text-[14px]">{lesson.description}</p>}
      </header>

      {generating && (
        <div className="rounded-2xl border border-blue-500/15 bg-[#0f1124]/80 backdrop-blur p-6 mb-4">
          <ProgressBar
            active
            label="Building your lesson"
            hint="4 readings + 4 quizzes, 15-30 seconds. Don't refresh."
            duration={20000}
          />
          <div className="mt-5">
            <SkeletonProse lines={5} />
          </div>
        </div>
      )}

      {err && !generating && (
        <div className="mb-3 px-4 py-2.5 rounded-lg border border-rose-500/40 bg-rose-500/10 text-sm text-rose-300">{err}</div>
      )}

      {blocks.length >= 7 && (
        <>
          <StageTracker blocks={blocks} activeIdx={activeIdx} onJump={(i) => setActiveIdx(i)} />

          {allDone ? (
            <div className="rounded-2xl border border-blue-500/30 bg-[#0f1124]/80 backdrop-blur p-10 text-center">
              <Sparkles size={28} className="mx-auto text-blue-400 mb-3" />
              <h2 className="text-2xl font-black tracking-tight text-white mb-2">Lesson complete</h2>
              <p className="text-gray-300 mb-1">You finished all 4 readings and 4 quizzes.</p>
              <p className="text-[13px] text-gray-400 mb-6">
                Average quiz score: <span className="font-mono font-bold text-blue-300">{avgQuizScore}%</span>
              </p>
              <button
                onClick={onBack}
                className="inline-flex items-center gap-2 px-5 py-2.5 rounded-xl font-semibold text-[14px] text-white bg-gradient-to-r from-blue-600 to-indigo-600 shadow-lg shadow-blue-500/30"
              >
                {backLabel}
              </button>
            </div>
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
