import { useState, useEffect } from 'react';
import { ArrowLeft, Plus, Lightbulb, Trash2, CheckCircle2, Circle } from 'lucide-react';
import ProgressBar from '../../shared/ProgressBar';
import {
  listLessons, createLesson, deleteLesson,
  generateLessonBlocks, generateLessonFinalQuiz,
  gradeLessonBlock, completeLessonBlock,
} from '../../../api/lessons';
import { consumePendingLesson } from '../../../utils/pendingLesson';
import useBrowserBack from '../../../hooks/useBrowserBack';
import { DIFFICULTY_OPTIONS } from '../../../utils/constants';
import Button from '../../shared/Button';
import Input from '../../shared/Input';
import PillGroup from '../../shared/PillGroup';
import LoadingSpinner from '../../shared/LoadingSpinner';
import TopicSuggestions from '../../shared/TopicSuggestions';
import BlockLessonView from '../../lesson/BlockLessonView';

export default function LessonsApp() {
  const [view, setView] = useState('list'); // list | new | lesson
  const [lessons, setLessons] = useState([]);
  const [loading, setLoading] = useState(true);

  // Browser Back → return to list instead of leaving the SPA.
  useBrowserBack(view !== 'list', () => setView('list'));

  // New-lesson form
  const [topic, setTopic] = useState('');
  const [difficulty, setDifficulty] = useState('beginner');
  const [creating, setCreating] = useState(false);
  const [createError, setCreateError] = useState(null);

  // Active lesson — drives the BlockLessonView. `resetKey` forces the
  // view to remount when the user hits Reset (so the cleared blocks
  // trigger fresh generation).
  const [activeLesson, setActiveLesson] = useState(null);
  const [resetKey, setResetKey] = useState(0);

  useEffect(() => {
    listLessons()
      .then(d => { setLessons(d.lessons || []); })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  // Auto-create a lesson when another app (e.g. Quiz Bowl) requests one
  // via setPendingLesson({ topic, difficulty }) + openApp('lessons').
  async function tryConsumePending() {
    const req = consumePendingLesson();
    if (!req?.topic) return;
    const diff = req.difficulty || 'beginner';
    try {
      const { lesson } = await createLesson(req.topic, diff);
      setLessons(prev => [lesson, ...prev.filter(l => l.id !== lesson.id)]);
      await openLesson(lesson);
    } catch (err) {
      setView('new');
      setTopic(req.topic);
      setDifficulty(diff);
      setCreateError(err.message || 'Failed to create lesson');
    }
  }
  useEffect(() => {
    // Run once on mount in case a request was queued just before this app opened.
    tryConsumePending();
    function onPending() { tryConsumePending(); }
    window.addEventListener('cov-pending-lesson', onPending);
    return () => window.removeEventListener('cov-pending-lesson', onPending);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function handleCreate() {
    if (!topic.trim() || creating) return;
    setCreating(true); setCreateError(null);
    try {
      const { lesson } = await createLesson(topic.trim(), difficulty);
      setLessons(prev => [lesson, ...prev.filter(l => l.id !== lesson.id)]);
      setTopic('');
      await openLesson(lesson);
    } catch (err) {
      setCreateError(err.message || 'Failed to create lesson');
    } finally {
      setCreating(false);
    }
  }

  // Click on an AI suggestion: jump into the same "Preparing lesson..." UX
  // the manual create flow uses, then auto-open the lesson when it's ready.
  // Uses setTopic/setDifficulty so if creation fails, the form is already
  // filled out and the user can just hit Start Lesson again.
  async function handleSuggestionPick(s) {
    if (creating) return;
    const pickedTopic = (s?.topic || '').trim();
    if (!pickedTopic) return;
    setTopic(pickedTopic);
    setDifficulty(s.difficulty || 'beginner');
    setCreateError(null);
    setView('new');
    setCreating(true);
    try {
      const { lesson } = await createLesson(pickedTopic, s.difficulty || 'beginner');
      setLessons(prev => [lesson, ...prev.filter(l => l.id !== lesson.id)]);
      setTopic('');
      await openLesson(lesson);
    } catch (err) {
      setCreateError(err.message || 'Failed to create lesson');
    } finally {
      setCreating(false);
    }
  }

  async function openLesson(lesson) {
    // Reset key forces BlockLessonView to remount whenever a different
    // lesson is opened, so cached blocks/state from the prior lesson
    // don't bleed in.
    setActiveLesson(lesson);
    setResetKey(k => k + 1);
    setView('lesson');
  }

  async function handleDelete(id, e) {
    e?.stopPropagation();
    if (!confirm('Delete this lesson?')) return;
    try {
      await deleteLesson(id);
      setLessons(prev => prev.filter(l => l.id !== id));
      if (activeLesson?.id === id) { setActiveLesson(null); setView('list'); }
    } catch (err) { console.error(err); }
  }

  // ===== LESSON VIEW =====
  // Standalone lesson runs through the same Claudius 4R/4Q + final SRS
  // block flow as curriculum lessons. The api prop wires it through the
  // /api/lessons/:id/blocks/* endpoints (no parent curriculum).
  if (view === 'lesson' && activeLesson) {
    const lessonForView = {
      ...activeLesson,
      // Block-mode list endpoint doesn't include the full blocks array
      // (only counts), so let BlockLessonView fetch them via generateBlocks.
      blocks: Array.isArray(activeLesson.blocks) ? activeLesson.blocks : [],
    };
    const standaloneApi = {
      generateBlocks: () => generateLessonBlocks(activeLesson.id),
      generateFinalQuiz: () => generateLessonFinalQuiz(activeLesson.id),
      gradeBlock: (bid, resp) => gradeLessonBlock(activeLesson.id, bid, resp),
      completeBlock: (bid) => completeLessonBlock(activeLesson.id, bid),
    };
    return (
      <div className="h-full overflow-y-auto">
        <BlockLessonView
          key={`${activeLesson.id}-${resetKey}`}
          lesson={lessonForView}
          api={standaloneApi}
          backLabel="Back to lessons"
          onBack={() => setView('list')}
        />
      </div>
    );
  }

  // ===== NEW LESSON VIEW =====
  if (view === 'new') {
    return (
      <div>
        <button onClick={() => setView('list')} className="flex items-center gap-2 text-sm text-gray-500 hover:text-gray-700 dark:hover:text-gray-200 mb-4">
          <ArrowLeft size={16} /> Back
        </button>
        <h2 className="text-lg font-bold text-gray-900 dark:text-white mb-1">Request a Lesson</h2>
        <p className="text-sm text-gray-500 dark:text-gray-400 mb-5">One topic, one focused lesson. The AI will teach it directly.</p>

        {creating ? (
          <div className="py-10 max-w-md mx-auto w-full">
            <ProgressBar
              active
              label={`Preparing lesson on ${topic || 'your topic'}`}
              hint="10-20 seconds. Don't refresh."
              duration={15000}
            />
          </div>
        ) : (
          <div className="space-y-4">
            {createError && <div className="px-4 py-2 rounded-xl bg-rose-50 dark:bg-rose-900/15 border border-rose-200 dark:border-rose-800 text-xs text-rose-600">{createError}</div>}
            <Input
              label="What do you want to learn?"
              placeholder="e.g., Photosynthesis, the French Revolution, Fourier transforms"
              value={topic}
              onChange={e => setTopic(e.target.value)}
              onKeyDown={e => { if (e.key === 'Enter') handleCreate(); }}
            />
            <PillGroup label="Difficulty" options={DIFFICULTY_OPTIONS} value={difficulty} onChange={setDifficulty} />
            <Button onClick={handleCreate} disabled={!topic.trim()}>
              <Lightbulb size={16} /> Start Lesson
            </Button>
          </div>
        )}
      </div>
    );
  }

  // ===== LIST VIEW =====
  if (loading) return <div className="flex items-center justify-center h-48"><LoadingSpinner size={24} /></div>;

  return (
    <div>
      <div className="flex items-center justify-between mb-4">
        <div>
          <h2 className="text-lg font-bold text-gray-900 dark:text-white">Lessons</h2>
          <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">Single topics, taught one at a time.</p>
        </div>
        <Button size="sm" onClick={() => { setTopic(''); setCreateError(null); setView('new'); }}>
          <Plus size={14} /> New Lesson
        </Button>
      </div>

      <TopicSuggestions
        title="Recommended topics"
        pickLabel="Teach me"
        onPick={handleSuggestionPick}
        className="mb-4"
      />

      {lessons.length === 0 ? (
        <div className="text-center py-12">
          <Lightbulb size={32} className="text-yellow-400 mx-auto mb-3" />
          <p className="text-sm text-gray-500 mb-4">No lessons yet. Request one to get started.</p>
          <Button onClick={() => setView('new')}><Plus size={16} /> Request a Lesson</Button>
        </div>
      ) : (
        <div className="space-y-2">
          {lessons.map(l => (
            <div
              key={l.id}
              onClick={() => openLesson(l)}
              className="group flex items-center gap-4 bg-white dark:bg-[#1e1e2e] rounded-xl border border-gray-200 dark:border-[#2A2A40] px-4 py-3 cursor-pointer hover:border-yellow-300 dark:hover:border-yellow-700 transition-colors"
            >
              <div className="w-9 h-9 rounded-lg bg-yellow-50 dark:bg-yellow-900/20 flex items-center justify-center flex-shrink-0">
                {l.isCompleted
                  ? <CheckCircle2 size={16} className="text-emerald-500" />
                  : l.messageCount > 0
                    ? <Circle size={16} className="text-yellow-500" />
                    : <Lightbulb size={16} className="text-yellow-500" />}
              </div>
              <div className="flex-1 min-w-0">
                <h3 className="text-sm font-medium text-gray-900 dark:text-gray-100 truncate">{l.title}</h3>
                <p className="text-xs text-gray-400 mt-0.5">
                  {l.difficulty}
                  {l.messageCount > 0 ? ` · ${l.messageCount} messages` : ' · not started'}
                  {l.isCompleted ? ' · completed' : ''}
                </p>
              </div>
              <button
                onClick={(e) => handleDelete(l.id, e)}
                className="opacity-0 group-hover:opacity-100 transition-opacity text-gray-400 hover:text-rose-500 p-1"
                title="Delete"
              >
                <Trash2 size={14} />
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
