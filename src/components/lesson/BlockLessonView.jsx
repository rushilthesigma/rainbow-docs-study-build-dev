import { useEffect, useMemo, useRef, useState } from 'react';
import { ArrowLeft, SkipForward, Trophy } from 'lucide-react';
import { checkAdmin } from '../../api/admin';
import StageTracker from './StageTracker';
import ReadingBlock from './ReadingBlock';
import QuizBlock from './QuizBlock';
import ExampleBlock from './ExampleBlock';
import RecapBlock from './RecapBlock';
import ApplicationBlock from './ApplicationBlock';
import ChallengeBlock from './ChallengeBlock';
import OpenAnswerBlock from './OpenAnswerBlock';
import MatchingBlock from './MatchingBlock';
import FillBlankBlock from './FillBlankBlock';
import ProgressBar from '../shared/ProgressBar';
import { SkeletonProse } from '../shared/Skeleton';
import ViewFade from '../shared/ViewFade';
import LessonCoChat from './LessonCoChat';
import {
  generateLessonBlocks as curriculumGenerateBlocks,
  generateFinalQuiz as curriculumGenerateFinalQuiz,
  completeLessonBlock as curriculumCompleteBlock,
  gradeQuizBlock as curriculumGradeBlock,
  gradeOpenBlock as curriculumGradeOpenBlock,
  markLessonComplete as curriculumMarkLessonComplete,
} from '../../api/curriculum';

// Block-based lesson runner. A lesson is a sequence of typed blocks the
// student steps through one at a time - readings, quizzes, worked
// examples, recaps, real-world applications, challenges, open-answer
// prompts, and matching / fill-in-the-blank games. The
// AI picks the mix per lesson; a final quiz is appended lazily at the
// end. Each block renders with its own component and reports back via
// onComplete (or a grader) so the runner can mark it done and advance.
//
// `coStudy` ({ shareId, partnerNames }) marks the lesson as part of a
// SHARED curriculum: a live human chat rail (LessonCoChat) renders beside
// the lesson column so both sides can talk while working through the same
// blocks. shareId is null when the current user is the curriculum owner.
export default function BlockLessonView({ curriculumId, lesson, onBack, api: apiProp, backLabel = 'Back to curriculum', coStudy = null }) {
  const api = useMemo(() => {
    if (apiProp) return apiProp;
    return {
      generateBlocks: () => curriculumGenerateBlocks(curriculumId, lesson.id),
      generateFinalQuiz: () => curriculumGenerateFinalQuiz(curriculumId, lesson.id),
      gradeBlock: (bid, resp) => curriculumGradeBlock(curriculumId, lesson.id, bid, resp),
      gradeOpenBlock: (bid, text) => curriculumGradeOpenBlock(curriculumId, lesson.id, bid, text),
      completeBlock: (bid) => curriculumCompleteBlock(curriculumId, lesson.id, bid),
      markComplete: () => curriculumMarkLessonComplete(curriculumId, lesson.id),
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
  // Tracks whether the server has recorded isCompleted for this lesson so we
  // don't double-call the complete endpoint.
  const serverMarkedRef = useRef(!!lesson.isCompleted);

  // Admin-only escape hatch for testing: skip the current step regardless of
  // block type or completion state. One shared affordance for every step
  // (reading/example/quiz/etc.) rather than something each block reimplements.
  const [isAdmin, setIsAdmin] = useState(false);
  useEffect(() => { checkAdmin().then(d => setIsAdmin(!!d.isAdmin)).catch(() => {}); }, []);

  useEffect(() => {
    let cancelled = false;
    // Already have blocks (count varies by difficulty: 5/7/10/14) - the
    // server is idempotent, so don't refetch and risk swapping IDs the
    // child blocks are holding.
    if (blocks.length > 0) return;
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

  // Generic "this block is done" handler. Self-contained blocks (reading,
  // example, recap, application, challenge, matching,
  // fill-blank) call this from their Continue button; the server marks
  // the block complete and we advance. Quiz and open-answer have their
  // own grading handlers below.
  async function handleBlockComplete() {
    const block = blocks[activeIdx];
    if (!block) return;
    if (block.completedAt) {
      maybeKickFinalQuiz(activeIdx);
      return advance();
    }
    try {
      const res = await api.completeBlock(block.id);
      setBlocks(prev => prev.map((b, i) => i === activeIdx ? { ...b, completedAt: res.block.completedAt } : b));
      if (res.lesson?.isCompleted) serverMarkedRef.current = true;
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
        setBlocks(prev => {
          if (prev[prev.length - 1]?.isFinal) return prev;
          // Don't append if the student has already finished all existing blocks
          if (prev.length > 0 && prev.every(b => b.completedAt)) return prev;
          return [...prev, finalBlock];
        });
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
    api.completeBlock(blocks[idx].id)
      .then(res => { if (res?.lesson?.isCompleted) serverMarkedRef.current = true; })
      .catch(() => {});

    // Kick the final-quiz generation as soon as the student is deep
    // enough into the lesson. The endpoint is idempotent - calling it
    // more than once just returns the cached block.
    maybeKickFinalQuiz(idx);

    advance();
  }

  const active = blocks[activeIdx];
  // Done = every block has a completedAt. The final quiz is optional - if
  // generation fails the student shouldn't be stuck forever.
  const allDone = blocks.length > 0 && blocks.every(b => b.completedAt);

  // When allDone first becomes true, ensure the server records isCompleted.
  // Uses markLessonComplete (idempotent force-set) so concurrent calls are safe.
  useEffect(() => {
    if (!allDone || serverMarkedRef.current) return;
    serverMarkedRef.current = true;
    if (api.markComplete) api.markComplete().catch(() => {});
  }, [allDone, api]);
  const avgQuizScore = (() => {
    const qs = blocks.filter(b => b.type === 'quiz' && typeof b.score === 'number').map(b => b.score);
    return qs.length ? Math.round(qs.reduce((s, n) => s + n, 0) / qs.length) : 0;
  })();

  // Every block is its own sequential step at the same reading width -
  // the student advances through them one at a time. The worked-example
  // block is the exception: it embeds the Math Tutor's chat+canvas split
  // view, which needs real horizontal room to be usable in a maximized
  // window rather than being squeezed into a 768px reading column.
  const wrapWidth = active?.type === 'example' ? 'max-w-none' : 'max-w-3xl';

  // Dispatch the active block to the component that renders its type.
  // Self-contained blocks (reading / example / recap / application /
  // challenge / matching / fill-blank) get the generic
  // completion handler; quiz and open-answer get their graders. Unknown
  // or malformed legacy blocks fall back to a reading rendering so a
  // step never shows up blank.
  function renderActiveBlock() {
    if (!active) return null;
    const props = { key: active.id, block: active, onComplete: handleBlockComplete };
    switch (active.type) {
      case 'quiz':
        return (
          <QuizBlock
            key={active.id}
            block={active}
            onComplete={handleQuizSubmit}
            gradeFn={(blockId, responses) => api.gradeBlock(blockId, responses)}
          />
        );
      case 'open':
        return (
          <OpenAnswerBlock
            key={active.id}
            block={active}
            gradeFn={handleOpenSubmit}
            onComplete={handleBlockComplete}
            continueLabel="Continue"
          />
        );
      case 'example':     return <ExampleBlock {...props} continueLabel="Continue" />;
      case 'recap':       return <RecapBlock {...props} />;
      case 'application': return <ApplicationBlock {...props} continueLabel="Continue" />;
      case 'challenge':   return <ChallengeBlock {...props} continueLabel="Continue" />;
      case 'matching':    return <MatchingBlock {...props} />;
      case 'fill-blank':  return <FillBlankBlock {...props} />;
      case 'reading':     return <ReadingBlock {...props} continueLabel="Continue" />;
      default:
        return <ReadingBlock key={active.id} block={normalizeToReading(active)} onComplete={handleBlockComplete} continueLabel="Continue" />;
    }
  }

  const lessonColumn = (
    <>
      {/* Back button */}
      <button
        onClick={onBack}
        className="group inline-flex items-center gap-1.5 text-[12px] font-medium text-white/40 hover:text-white/75 mb-5 transition-colors"
      >
        <ArrowLeft size={13} className="group-hover:-translate-x-0.5 transition-transform" />
        {backLabel}
      </button>

      {/* Lesson title - headline + subtitle */}
      <header className="mb-7">
        <h1 className="text-[22px] md:text-[27px] font-semibold tracking-[-0.02em] text-white/90 leading-[1.15] mb-2">
          {lesson.title}
        </h1>
        {lesson.description && (
          <p className="text-white/40 text-[14px] leading-relaxed max-w-[640px]">
            {lesson.description}
          </p>
        )}
      </header>

      {/* Generating state */}
      {generating && (
        <div className="mb-6">
          <ProgressBar
            active
            label="Building your lesson"
            hint="A mix of readings, quizzes, and exercises · 15-30 seconds"
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

      {blocks.length > 0 && (
        <>
          <StageTracker blocks={blocks} activeIdx={activeIdx} onJump={(i) => setActiveIdx(i)} />

          <ViewFade viewKey={allDone ? 'done' : active?.id || `idx:${activeIdx}`}>
          {allDone ? (
            <div className="p-8">
              {/* Icon + title */}
              <div className="flex items-center gap-3 mb-6">
                <div className="grid place-items-center flex-shrink-0">
                  <Trophy size={20} className="text-blue-400" />
                </div>
                <div>
                  <p className="text-[10px] uppercase tracking-[0.18em] font-bold text-blue-400/60 mb-0.5">Completed</p>
                  <h2 className="text-[15px] font-bold text-white/90 leading-tight">Lesson complete</h2>
                </div>
              </div>

              {/* Large score — only shown when quizzes were scored */}
              {avgQuizScore > 0 && (
                <div className="mb-5">
                  <p className="text-[10px] uppercase tracking-[0.18em] font-bold text-white/30 mb-1">Average quiz score</p>
                  <div className="flex items-baseline gap-1">
                    <span className={`text-[48px] font-black tabular-nums leading-none ${
                      avgQuizScore >= 80 ? 'text-blue-400' :
                      avgQuizScore >= 50 ? 'text-white/80' :
                      'text-rose-400'
                    }`}>{avgQuizScore}</span>
                    <span className="text-[24px] text-white/25">%</span>
                  </div>
                </div>
              )}

              {/* Stat cards */}
              <div className="flex gap-2 mb-6">
                <div className="flex-1 rounded-lg px-3 py-2.5">
                  <p className="text-[9.5px] uppercase tracking-[0.16em] font-bold text-white/35 mb-1">Blocks done</p>
                  <p className="text-[17px] font-bold tabular-nums text-blue-400">{blocks.length}</p>
                </div>
                {avgQuizScore > 0 && (
                  <div className="flex-1 rounded-lg px-3 py-2.5">
                    <p className="text-[9.5px] uppercase tracking-[0.16em] font-bold text-white/35 mb-1">Quiz avg</p>
                    <p className={`text-[17px] font-bold tabular-nums ${
                      avgQuizScore >= 80 ? 'text-blue-400' :
                      avgQuizScore >= 50 ? 'text-white/90' :
                      'text-rose-400'
                    }`}>{avgQuizScore}%</p>
                  </div>
                )}
              </div>

              <button
                onClick={onBack}
                className="inline-flex items-center gap-2 px-5 py-2 rounded-lg font-semibold text-[13px] text-white bg-blue-500 hover:bg-blue-400 transition-colors"
              >
                <ArrowLeft size={13} /> {backLabel}
              </button>
            </div>
          ) : (
            renderActiveBlock()
          )}
          </ViewFade>
        </>
      )}
    </>
  );

  if (!coStudy) {
    return <div className={`w-full ${wrapWidth} mx-auto px-5 md:px-8 py-7 md:py-9`}>{lessonColumn}</div>;
  }

  // Shared curriculum: lesson column + live co-study chat rail. The rail is
  // sticky so it stays in view while the lesson content scrolls underneath.
  return (
    <div className="w-full max-w-6xl mx-auto px-5 md:px-8 py-7 md:py-9 flex items-start gap-5">
      <div className={`flex-1 min-w-0 ${wrapWidth}`}>{lessonColumn}</div>
      <ViewFade viewKey={`cochat:${lesson.id}`} className="w-[290px] shrink-0 sticky top-3">
        <LessonCoChat
          curriculumId={curriculumId}
          lessonId={lesson.id}
          shareId={coStudy.shareId || null}
          partnerNames={coStudy.partnerNames || []}
          className="h-[460px]"
        />
      </ViewFade>
    </div>
  );
}

// Fallback only. Known block types render with their own component; this
// catches an unknown type or a malformed/legacy block missing the fields
// its component needs, flattening whatever text it carried into a
// reading-shaped block so a step never renders blank.
function normalizeToReading(block) {
  if (!block) return block;
  if (block.type === 'reading' && block.content) return block;
  if (block.content) return { ...block, type: 'reading' };

  const parts = [];
  if (block.prompt) parts.push(block.prompt);
  if (block.problem) parts.push(block.problem);
  if (Array.isArray(block.bullets) && block.bullets.length) {
    parts.push(block.bullets.map((b) => `- ${b}`).join('\n'));
  }
  if (Array.isArray(block.steps) && block.steps.length) {
    parts.push(block.steps.map((s, i) => `### Step ${i + 1}${s.label ? `: ${s.label}` : ''}\n\n${s.text || ''}`).join('\n\n'));
  }
  if (Array.isArray(block.pairs) && block.pairs.length) {
    parts.push('### Key terms\n\n' + block.pairs.map((p) => `- **${p.term}** — ${p.definition}`).join('\n'));
  }
  if (Array.isArray(block.sentences) && block.sentences.length) {
    parts.push('### Examples\n\n' + block.sentences.map((s) => `- ${s.before || ''}**${s.answer || '___'}**${s.after || ''}`).join('\n'));
  }
  if (Array.isArray(block.talkingPoints) && block.talkingPoints.length) {
    parts.push('### Points to consider\n\n' + block.talkingPoints.map((p) => `- ${p}`).join('\n'));
  }
  if (block.solution) parts.push(`### Solution\n\n${block.solution}`);
  if (block.tryThis) parts.push(`### Try it\n\n${block.tryThis}`);

  return {
    ...block,
    type: 'reading',
    content: parts.join('\n\n') || block.title || '',
  };
}
