import { useState, useEffect } from 'react';
import { Target, Plus, CheckCircle2, Circle, Trash2, BookOpen } from 'lucide-react';
import { listGoals, createGoal, deleteGoal, toggleMilestone, updateGoal } from '../api/goals';
import Button from '../components/shared/Button';
import Input from '../components/shared/Input';
import ProgressBar from '../components/curriculum/ProgressBar';
import LoadingSpinner from '../components/shared/LoadingSpinner';
import CurriculumLessonPicker from '../components/shared/CurriculumLessonPicker';

export default function GoalsPage() {
  const [goals, setGoals] = useState([]);
  const [loading, setLoading] = useState(true);
  const [creating, setCreating] = useState(false);
  const [showForm, setShowForm] = useState(false);
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [newLink, setNewLink] = useState(null); // { curriculumId, lessonId } | null

  useEffect(() => {
    listGoals().then(d => { setGoals(d.goals || []); setLoading(false); }).catch(() => setLoading(false));
  }, []);

  async function handleCreate(e) {
    e.preventDefault();
    if (!title.trim()) return;
    setCreating(true);
    try {
      const data = await createGoal(title.trim(), description.trim(), {
        linkedCurriculumIds: newLink?.curriculumId ? [newLink.curriculumId] : [],
        linkedLessonIds: newLink?.lessonId ? [newLink.lessonId] : [],
      });
      setGoals(prev => [data.goal, ...prev]);
      setTitle(''); setDescription(''); setShowForm(false); setNewLink(null);
    } catch (err) { console.error(err); }
    setCreating(false);
  }

  // Change a goal's linked curriculum/lesson after it's been created.
  async function handleGoalLinkChange(goalId, next) {
    const updates = {
      linkedCurriculumIds: next?.curriculumId ? [next.curriculumId] : [],
      linkedLessonIds: next?.lessonId ? [next.lessonId] : [],
    };
    setGoals(prev => prev.map(g => g.id === goalId ? { ...g, ...updates } : g));
    try { await updateGoal(goalId, updates); } catch (err) { console.error(err); }
  }

  async function handleDelete(id) {
    if (!confirm('Delete this goal?')) return;
    try {
      await deleteGoal(id);
      setGoals(prev => prev.filter(g => g.id !== id));
    } catch (err) { console.error(err); }
  }

  async function handleToggleMilestone(goalId, milestoneId) {
    try {
      const data = await toggleMilestone(goalId, milestoneId);
      setGoals(prev => prev.map(g => g.id === goalId ? data.goal : g));
    } catch (err) { console.error(err); }
  }

  if (loading) return <div className="flex items-center justify-center h-64"><LoadingSpinner size={28} /></div>;

  return (
    <div className="max-w-3xl mx-auto">
      <div className="flex items-center justify-between mb-6">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-lg bg-amber-50 dark:bg-amber-900/20 flex items-center justify-center text-amber-500">
            <Target size={20} />
          </div>
          <div>
            <h1 className="text-xl font-bold text-gray-900 dark:text-white">Goals</h1>
            <p className="text-sm text-gray-500 dark:text-gray-400">{goals.filter(g => g.status === 'active').length} active</p>
          </div>
        </div>
        <Button onClick={() => setShowForm(!showForm)} size="sm">
          <Plus size={16} /> New Goal
        </Button>
      </div>

      {showForm && (
        <form onSubmit={handleCreate} className="bg-white dark:bg-[#161622] rounded-xl border border-gray-200 dark:border-[#2A2A40] p-5 mb-4 space-y-3">
          <Input label="What's your goal?" placeholder="e.g., Master Linear Algebra" value={title} onChange={e => setTitle(e.target.value)} required />
          <Input label="Description (optional)" placeholder="Add context..." value={description} onChange={e => setDescription(e.target.value)} />
          <div>
            <CurriculumLessonPicker value={newLink} onChange={setNewLink} />
            <p className="text-[10px] text-gray-400 mt-1">Optional — anchor this goal to a specific curriculum or lesson so AI milestone generation + the study assistant know what you're working toward.</p>
          </div>
          <div className="flex gap-2">
            <Button type="submit" loading={creating} size="sm"><Plus size={14} /> Create Goal</Button>
            <Button type="button" variant="ghost" size="sm" onClick={() => { setShowForm(false); setNewLink(null); }}>Cancel</Button>
          </div>
          {creating && <p className="text-xs text-gray-400">AI is generating milestones...</p>}
        </form>
      )}

      {goals.length === 0 && !showForm ? (
        <div className="bg-white dark:bg-[#161622] rounded-xl border border-gray-200 dark:border-[#2A2A40] p-12 text-center">
          <Target size={32} className="text-amber-500 mx-auto mb-3" />
          <p className="text-gray-500 dark:text-gray-400 mb-4">No goals yet. Set a learning goal to track your progress.</p>
          <Button onClick={() => setShowForm(true)}><Plus size={16} /> Create Goal</Button>
        </div>
      ) : (
        <div className="space-y-3">
          {goals.map(goal => (
            <div key={goal.id} className="bg-white dark:bg-[#161622] rounded-xl border border-gray-200 dark:border-[#2A2A40] p-5">
              <div className="flex items-start justify-between mb-3">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <h3 className="font-semibold text-gray-900 dark:text-gray-100">{goal.title}</h3>
                    {(goal.linkedCurriculumIds?.length > 0 || goal.linkedLessonIds?.length > 0) && (
                      <span className="inline-flex items-center gap-1 text-[10px] font-semibold px-1.5 py-0.5 rounded-full bg-blue-50 dark:bg-blue-900/30 text-blue-600 dark:text-blue-400">
                        <BookOpen size={9} /> linked
                      </span>
                    )}
                  </div>
                  {goal.description && <p className="text-sm text-gray-500 dark:text-gray-400 mt-0.5">{goal.description}</p>}
                </div>
                <div className="flex items-center gap-2">
                  {goal.status === 'completed' && (
                    <span className="text-xs font-medium text-emerald-500 bg-emerald-50 dark:bg-emerald-900/20 px-2 py-0.5 rounded-full">Done</span>
                  )}
                  <button onClick={() => handleDelete(goal.id)} className="text-gray-300 hover:text-rose-500 transition-colors">
                    <Trash2 size={14} />
                  </button>
                </div>
              </div>

              <div className="mb-3">
                <CurriculumLessonPicker
                  compact
                  value={(goal.linkedCurriculumIds?.[0] || goal.linkedLessonIds?.[0])
                    ? { curriculumId: goal.linkedCurriculumIds?.[0] || null, lessonId: goal.linkedLessonIds?.[0] || null }
                    : null}
                  onChange={(next) => handleGoalLinkChange(goal.id, next)}
                />
              </div>

              <ProgressBar value={goal.progress || 0} max={100} size="sm" className="mb-3" />
              <div className="space-y-1.5">
                {(goal.milestones || []).map(m => (
                  <button
                    key={m.id}
                    onClick={() => handleToggleMilestone(goal.id, m.id)}
                    className="flex items-center gap-2.5 w-full text-left py-1.5 px-2 rounded-lg hover:bg-gray-50 dark:hover:bg-[#1e1e2e] transition-colors"
                  >
                    {m.isCompleted ? (
                      <CheckCircle2 size={16} className="text-emerald-500 flex-shrink-0" />
                    ) : (
                      <Circle size={16} className="text-gray-300 dark:text-gray-600 flex-shrink-0" />
                    )}
                    <span className={`text-sm ${m.isCompleted ? 'text-gray-400 line-through' : 'text-gray-700 dark:text-gray-200'}`}>
                      {m.title}
                    </span>
                  </button>
                ))}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
