import { useEffect, useState } from 'react';
import { Lightbulb, Plus, ChevronRight, CheckCircle2, ArrowLeft } from 'lucide-react';
import {
  listLessons, createLesson,
  generateLessonBlocks, generateLessonFinalQuiz,
  gradeLessonBlock, completeLessonBlock,
} from '../../api/lessons';
import BlockLessonView from '../lesson/BlockLessonView';
import MobilePage from './MobilePage';
import { InlineProgress } from '../shared/ProgressBar';

// Mobile-native standalone-lessons flow: list → block lesson runner.
// New-lesson form is a small inline panel rather than a separate route.
export default function MobileLessons() {
  const [view, setView] = useState('list'); // list | new | lesson
  const [lessons, setLessons] = useState([]);
  const [loading, setLoading] = useState(true);

  // New-lesson form
  const [topic, setTopic] = useState('');
  const [difficulty, setDifficulty] = useState('beginner');
  const [creating, setCreating] = useState(false);
  const [createError, setCreateError] = useState(null);

  // Active lesson
  const [activeLesson, setActiveLesson] = useState(null);
  const [resetKey, setResetKey] = useState(0);

  useEffect(() => {
    listLessons()
      .then((d) => setLessons(d.lessons || []))
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  async function handleCreate() {
    if (!topic.trim() || creating) return;
    setCreating(true); setCreateError(null);
    try {
      const { lesson } = await createLesson(topic.trim(), difficulty);
      setLessons((prev) => [lesson, ...prev.filter((l) => l.id !== lesson.id)]);
      setTopic('');
      setActiveLesson(lesson);
      setResetKey((k) => k + 1);
      setView('lesson');
    } catch (err) {
      setCreateError(err.message || 'Failed to create lesson');
    } finally {
      setCreating(false);
    }
  }

  function openLesson(lesson) {
    setActiveLesson(lesson);
    setResetKey((k) => k + 1);
    setView('lesson');
  }

  // ===== LESSON =====
  if (view === 'lesson' && activeLesson) {
    const standaloneApi = {
      generateBlocks: () => generateLessonBlocks(activeLesson.id),
      generateFinalQuiz: () => generateLessonFinalQuiz(activeLesson.id),
      gradeBlock: (bid, resp) => gradeLessonBlock(activeLesson.id, bid, resp),
      completeBlock: (bid) => completeLessonBlock(activeLesson.id, bid),
    };
    return (
      <BlockLessonView
        key={`${activeLesson.id}-${resetKey}`}
        lesson={{ ...activeLesson, blocks: Array.isArray(activeLesson.blocks) ? activeLesson.blocks : [] }}
        api={standaloneApi}
        backLabel="Back to lessons"
        onBack={() => { setActiveLesson(null); setView('list'); }}
      />
    );
  }

  // ===== NEW =====
  if (view === 'new') {
    return (
      <div className="px-4 pt-3 pb-8">
        <button onClick={() => setView('list')} className="inline-flex items-center gap-1.5 text-[12.5px] font-semibold text-gray-500 dark:text-gray-400 mb-4 active:text-gray-700 dark:active:text-gray-200">
          <ArrowLeft size={14} /> All lessons
        </button>
        <div className="text-center mb-5">
          <div className="inline-grid place-items-center w-12 h-12 rounded-2xl bg-amber-500/15 text-amber-500 mb-2">
            <Lightbulb size={20} />
          </div>
          <h1 className="text-[22px] font-bold tracking-[-0.02em] text-gray-900 dark:text-white">New lesson</h1>
          <p className="text-[12px] text-gray-500 dark:text-gray-400 mt-1">One topic. Eight blocks. AI-paced.</p>
        </div>

        {createError && <p className="text-[11.5px] text-rose-500 px-3 py-2 mb-3 rounded-xl bg-rose-50 dark:bg-rose-500/10 text-center">{createError}</p>}

        <label className="block">
          <span className="text-[10.5px] font-bold uppercase tracking-[0.16em] text-gray-500 dark:text-gray-400 mb-2 block px-1">Topic</span>
          <input
            value={topic}
            onChange={(e) => setTopic(e.target.value)}
            onKeyDown={(e) => { if (e.key === 'Enter') handleCreate(); }}
            placeholder="e.g. Photosynthesis, Fourier transforms"
            autoFocus
            className="w-full px-4 py-3 rounded-2xl border border-gray-200 dark:border-white/[0.08] bg-white dark:bg-[#13131f] text-[14px] text-gray-900 dark:text-white outline-none"
          />
        </label>

        <div className="mt-4">
          <span className="text-[10.5px] font-bold uppercase tracking-[0.16em] text-gray-500 dark:text-gray-400 mb-2 block px-1">Difficulty</span>
          <div className="grid grid-cols-3 gap-1.5">
            {['beginner', 'intermediate', 'advanced'].map((d) => (
              <button
                key={d}
                onClick={() => setDifficulty(d)}
                className={`px-3 py-2 rounded-xl text-[12px] font-semibold tracking-tight capitalize ${
                  difficulty === d
                    ? 'bg-blue-600 text-white'
                    : 'bg-gray-100 dark:bg-white/[0.05] text-gray-700 dark:text-gray-300'
                }`}
              >
                {d}
              </button>
            ))}
          </div>
        </div>

        <button
          onClick={handleCreate}
          disabled={!topic.trim() || creating}
          className="mt-5 w-full py-3.5 rounded-2xl bg-blue-600 active:bg-blue-700 disabled:opacity-50 text-white text-[14.5px] font-bold inline-flex items-center justify-center gap-2"
        >
          {creating ? <><InlineProgress active /> Building lesson…</> : <><Lightbulb size={15} /> Start lesson</>}
        </button>
      </div>
    );
  }

  // ===== LIST =====
  return (
    <MobilePage
      eyebrow="Quick lessons"
      title="My Lessons"
      subtitle={loading ? 'Loading…' : `${lessons.length} ${lessons.length === 1 ? 'lesson' : 'lessons'}`}
    >
      <button
        onClick={() => { setTopic(''); setCreateError(null); setView('new'); }}
        className="w-full rounded-2xl bg-gradient-to-br from-amber-500 to-orange-500 text-white p-4 mb-4 active:scale-[0.99] transition-transform text-left"
      >
        <div className="flex items-center gap-3">
          <div className="w-11 h-11 rounded-xl bg-white/20 grid place-items-center shrink-0">
            <Plus size={20} className="text-white" />
          </div>
          <p className="flex-1 text-[15px] font-bold tracking-tight">New lesson</p>
          <ChevronRight size={16} className="text-white/80" />
        </div>
      </button>

      {!loading && lessons.length === 0 && (
        <div className="text-center py-12">
          <Lightbulb size={32} className="text-gray-300 dark:text-white/15 mx-auto mb-3" />
          <p className="text-[13px] text-gray-500 dark:text-gray-400">No lessons yet.</p>
        </div>
      )}

      <div className="space-y-2">
        {lessons.map((l) => {
          const total = l.blocksTotal || 8;
          const done  = l.blocksDone  || 0;
          const pct   = total ? Math.round((done / total) * 100) : 0;
          const completed = !!l.isCompleted;
          return (
            <button
              key={l.id}
              onClick={() => openLesson(l)}
              className="w-full rounded-2xl border border-gray-200 dark:border-white/[0.06] bg-white dark:bg-[#13131f] p-3.5 active:scale-[0.99] transition-transform text-left"
            >
              <div className="flex items-center gap-3 mb-2">
                <div className={`w-10 h-10 rounded-xl grid place-items-center shrink-0 ${completed ? 'bg-emerald-100 dark:bg-emerald-500/15' : 'bg-amber-100 dark:bg-amber-500/15'}`}>
                  {completed
                    ? <CheckCircle2 size={18} className="text-emerald-500" />
                    : <Lightbulb size={18} className="text-amber-500" />}
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-[14px] font-bold tracking-tight text-gray-900 dark:text-white truncate">{l.title}</p>
                  <p className="text-[11px] text-gray-500 dark:text-gray-400 mt-0.5 capitalize">
                    {l.difficulty || 'beginner'} · {completed ? 'complete' : `${done}/${total} blocks`}
                  </p>
                </div>
                <ChevronRight size={14} className="text-gray-300 dark:text-white/30 shrink-0" />
              </div>
              {!completed && total > 0 && (
                <div className="h-1 rounded-full bg-gray-200 dark:bg-white/[0.06] overflow-hidden">
                  <div
                    className="h-full bg-gradient-to-r from-amber-400 to-orange-500 rounded-full transition-all"
                    style={{ width: `${pct}%` }}
                  />
                </div>
              )}
            </button>
          );
        })}
      </div>
    </MobilePage>
  );
}
