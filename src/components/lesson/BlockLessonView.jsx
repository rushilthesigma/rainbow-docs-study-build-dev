import { useEffect, useMemo, useState } from 'react';
import { ArrowLeft, Sparkles, Trophy } from 'lucide-react';
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
    <div className="w-full max-w-3xl mx-auto px-5 md:px-8 py-7 md:py-10">
      {/* Back button */}
      <button
        onClick={onBack}
        className="inline-flex items-center gap-1.5 text-[12px] font-medium text-white/30 hover:text-white/65 mb-8 transition-colors"
      >
        <ArrowLeft size={13} /> {backLabel}
      </button>

      {/* Lesson title */}
      <header className="mb-10">
        <p className="text-[10px] font-black uppercase tracking-[0.28em] text-white/25 mb-3">Lesson</p>
        <h1 className="text-[42px] md:text-[52px] font-black tracking-tight text-white leading-[1.0] mb-3">
          {lesson.title}
        </h1>
        {lesson.description && (
          <p className="text-white/40 text-[15px] leading-relaxed">{lesson.description}</p>
        )}
      </header>

      {/* Generating state */}
      {generating && (
        <div className="rounded-3xl border border-white/[0.07] bg-white/[0.02] backdrop-blur-sm p-8 mb-6">
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
            <div className="rounded-3xl border border-white/[0.10] bg-white/[0.04] backdrop-blur-sm p-12 text-center">
              <div className="w-14 h-14 rounded-2xl bg-white/[0.08] grid place-items-center mx-auto mb-5">
                <Trophy size={24} className="text-white/60" />
              </div>
              <h2 className="text-[28px] font-black tracking-tight text-white mb-2">Lesson complete</h2>
              <p className="text-white/45 mb-1 text-[15px]">4 readings and 4 quizzes finished.</p>
              <p className="text-[13px] text-white/30 mb-8">
                Average quiz score: <span className="font-mono font-bold text-white/55">{avgQuizScore}%</span>
              </p>
              <button
                onClick={onBack}
                className="inline-flex items-center gap-2 px-6 py-3 rounded-2xl font-bold text-[14px] text-white/80 bg-white/[0.10] border border-white/[0.16] shadow-[inset_0_1px_0_rgba(255,255,255,0.10)] hover:bg-white/[0.15] transition-colors backdrop-blur-sm"
              >
                <ArrowLeft size={14} /> {backLabel}
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
