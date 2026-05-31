import { useEffect, useMemo, useState } from 'react';
import { ArrowLeft, Trophy, Lightbulb } from 'lucide-react';
import StageTracker from './StageTracker';
import ReadingBlock from './ReadingBlock';
import QuizBlock from './QuizBlock';
import ExampleBlock from './ExampleBlock';
import RecapBlock from './RecapBlock';
import ApplicationBlock from './ApplicationBlock';
import ChallengeBlock from './ChallengeBlock';
import OpenAnswerBlock from './OpenAnswerBlock';
import DiscussionBlock from './DiscussionBlock';
import MatchingBlock from './MatchingBlock';
import FillBlankBlock from './FillBlankBlock';
import ProgressBar from '../shared/ProgressBar';
import { SkeletonProse } from '../shared/Skeleton';
import ViewFade from '../shared/ViewFade';
import {
  generateLessonBlocks as curriculumGenerateBlocks,
  generateFinalQuiz as curriculumGenerateFinalQuiz,
  completeLessonBlock as curriculumCompleteBlock,
  gradeQuizBlock as curriculumGradeBlock,
  gradeOpenBlock as curriculumGradeOpenBlock,
} from '../../api/curriculum';

// Block-based lesson runner. Walks the user through 8 stages:
//   R1 → Q1 → R2 → Q2 → R3 (SRS) → Q3 → R4 → FINAL QUIZ
//
// When the surrounding window is maximized or the browser is in
// fullscreen, the lesson swaps to a side-by-side layout: the current
// reading sits on the left, its paired quiz on the right. The student
// can read and answer concurrently - the next pair loads after the
// quiz is submitted.
export default function BlockLessonView({ curriculumId, lesson, onBack, api: apiProp, backLabel = 'Back to curriculum' }) {
  const api = useMemo(() => {
    if (apiProp) return apiProp;
    return {
      generateBlocks: () => curriculumGenerateBlocks(curriculumId, lesson.id),
      generateFinalQuiz: () => curriculumGenerateFinalQuiz(curriculumId, lesson.id),
      gradeBlock: (bid, resp) => curriculumGradeBlock(curriculumId, lesson.id, bid, resp),
      gradeOpenBlock: (bid, text) => curriculumGradeOpenBlock(curriculumId, lesson.id, bid, text),
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
    if (block.completedAt) {
      maybeKickFinalQuiz(activeIdx);
      return advance();
    }
    try {
      const res = await api.completeBlock(block.id);
      setBlocks(prev => prev.map((b, i) => i === activeIdx ? { ...b, completedAt: res.block.completedAt } : b));
      maybeKickFinalQuiz(activeIdx);
      advance();
    } catch (e) { setErr(e.message); }
  }

  // The last pre-generated slot is always a synthesis reading; the
  // final quiz is appended lazily. Kick it off when the student is
  // within the last two pre-gen blocks so it's loaded by the time
  // they reach it. Idempotent on the server, so safe to call more
  // than once.
  function maybeKickFinalQuiz(idx) {
    const len = blocks.length;
    // If the final quiz is already appended, skip.
    if (len >= 1 && blocks[len - 1]?.isFinal) return;
    // Need to be in the last 2 pre-gen blocks.
    if (idx < len - 2) return;
    api.generateFinalQuiz()
      .then(({ block: finalBlock }) => {
        setBlocks(prev => (prev[prev.length - 1]?.isFinal ? prev : [...prev, finalBlock]));
      })
      .catch(() => { /* idempotent on retry; ignored */ });
  }

  // Open-answer grader. Block content updates in place with the
  // server-returned submission so the inline feedback renders.
  async function handleOpenSubmit(bid, text) {
    if (!api.gradeOpenBlock) throw new Error('Open-answer grading not available');
    const { submission } = await api.gradeOpenBlock(bid, text);
    setBlocks(prev => prev.map(b => b.id === bid ? { ...b, submission, score: submission.score, completedAt: submission.submittedAt } : b));
    return submission;
  }

  async function handleQuizSubmit(results, quizBlockIdx = activeIdx) {
    const idx = quizBlockIdx;
    setBlocks(prev => prev.map((b, i) => i === idx
      ? { ...b, score: results.score, completedAt: new Date().toISOString(), responses: results.results }
      : b
    ));
    api.completeBlock(blocks[idx].id).catch(() => {});

    // Kick the final-quiz generation as soon as the student is deep
    // enough into the lesson. The endpoint is idempotent - calling it
    // more than once just returns the cached block.
    maybeKickFinalQuiz(idx);

    advance();
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
  // Reading and quiz are independent sequential blocks - same width
  // as every other variety block (example, recap, etc.) - so the
  // student advances through them one at a time, the way they walk
  // through any other lesson step.
  const wrapWidth = 'max-w-3xl';

  return (
    <div className={`w-full ${wrapWidth} mx-auto px-5 md:px-8 py-7 md:py-9`}>
      {/* Back button */}
      <button
        onClick={onBack}
        className="group inline-flex items-center gap-1.5 text-[12px] font-medium text-blue-200/55 hover:text-blue-100 mb-6 transition-colors"
      >
        <ArrowLeft size={13} className="group-hover:-translate-x-0.5 transition-transform" />
        {backLabel}
      </button>

      {/* Lesson title - pill tag + headline + subtitle */}
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
            hint="4 readings + 4 quizzes · 15-30 seconds"
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

          <ViewFade viewKey={allDone ? 'done' : active?.id || `idx:${activeIdx}`}>
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
              <div className="w-16 h-16 rounded-2xl bg-gradient-to-br from-emerald-400 to-emerald-600 grid place-items-center mx-auto mb-5">
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
                className="inline-flex items-center gap-2 px-6 py-3 rounded-2xl font-semibold text-[14px] text-white bg-gradient-to-b from-emerald-500 to-emerald-600 hover:from-emerald-400 hover:to-emerald-500 border border-emerald-400/45 transition-all"
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
          ) : active?.type === 'example' ? (
            <ExampleBlock key={active.id} block={active} onComplete={handleReadingComplete} />
          ) : active?.type === 'recap' ? (
            <RecapBlock key={active.id} block={active} onComplete={handleReadingComplete} />
          ) : active?.type === 'application' ? (
            <ApplicationBlock key={active.id} block={active} onComplete={handleReadingComplete} />
          ) : active?.type === 'challenge' ? (
            <ChallengeBlock key={active.id} block={active} onComplete={handleReadingComplete} />
          ) : active?.type === 'open' ? (
            <OpenAnswerBlock
              key={active.id}
              block={active}
              gradeFn={handleOpenSubmit}
              onComplete={handleReadingComplete}
            />
          ) : active?.type === 'discussion' ? (
            <DiscussionBlock key={active.id} block={active} onComplete={handleReadingComplete} />
          ) : active?.type === 'matching' ? (
            <MatchingBlock key={active.id} block={active} onComplete={handleReadingComplete} />
          ) : active?.type === 'fill-blank' ? (
            <FillBlankBlock key={active.id} block={active} onComplete={handleReadingComplete} />
          ) : null}
          </ViewFade>
        </>
      )}
    </div>
  );
}
