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
import BlockLessonView from '../../lesson/BlockLessonView';

export default function LessonsApp() {
  const [view, setView] = useState('list'); // list | new | lesson
  const [lessons, setLessons] = useState([]);
  const [loading, setLoading] = useState(true);

  useBrowserBack(view !== 'list', () => setView('list'));

  const [topic, setTopic] = useState('');
  const [difficulty, setDifficulty] = useState('beginner');
  const [creating, setCreating] = useState(false);
  const [createError, setCreateError] = useState(null);

  const [activeLesson, setActiveLesson] = useState(null);
  const [resetKey, setResetKey] = useState(0);

  useEffect(() => {
    listLessons()
      .then(d => { setLessons(d.lessons || []); })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

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

  async function openLesson(lesson) {
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
  if (view === 'lesson' && activeLesson) {
    const lessonForView = {
      ...activeLesson,
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
        <button onClick={() => setView('list')} className="flex items-center gap-2 text-sm text-white/35 hover:text-white/65 transition-colors mb-4">
          <ArrowLeft size={16} /> Back
        </button>
        <h2 className="text-lg font-bold text-white/85 mb-1">Request a Lesson</h2>
        <p className="text-sm text-white/40 mb-5">One topic, one focused lesson. The AI will teach it directly.</p>

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
            {createError && <div className="px-4 py-2 rounded-2xl bg-rose-500/10 border border-rose-500/30 text-xs text-rose-400">{createError}</div>}
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
          <h2 className="text-lg font-bold text-white/85">Lessons</h2>
          <p className="text-xs text-white/35 mt-0.5">Single topics, taught one at a time.</p>
        </div>
        <Button size="sm" onClick={() => { setTopic(''); setCreateError(null); setView('new'); }}>
          <Plus size={14} /> New Lesson
        </Button>
      </div>

      {lessons.length === 0 ? (
        <div className="text-center py-12">
          <Lightbulb size={32} className="text-white/40 mx-auto mb-3" />
          <p className="text-sm text-white/55 mb-4">No lessons yet. Request one to get started.</p>
          <Button onClick={() => setView('new')}><Plus size={16} /> Request a Lesson</Button>
        </div>
      ) : (
        <div className="space-y-2">
          {lessons.map(l => (
            <div
              key={l.id}
              onClick={() => openLesson(l)}
              className="group flex items-center gap-4 bg-white/[0.03] rounded-2xl border border-white/[0.06] px-4 py-3 cursor-pointer hover:bg-white/[0.06] hover:border-white/[0.12] transition-colors"
            >
              <div className="w-9 h-9 rounded-xl bg-white/[0.07] flex items-center justify-center flex-shrink-0 text-white/50">
                {l.isCompleted
                  ? <CheckCircle2 size={16} />
                  : l.messageCount > 0
                    ? <Circle size={16} />
                    : <Lightbulb size={16} />}
              </div>
              <div className="flex-1 min-w-0">
                <h3 className="text-sm font-medium text-white/85 truncate">{l.title}</h3>
                <p className="text-xs text-white/40 mt-0.5">
                  {l.difficulty}
                  {l.messageCount > 0 ? ` · ${l.messageCount} messages` : ' · not started'}
                  {l.isCompleted ? ' · completed' : ''}
                </p>
              </div>
              <button
                onClick={(e) => handleDelete(l.id, e)}
                className="opacity-0 group-hover:opacity-100 transition-opacity text-white/25 hover:text-rose-400 p-1"
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
