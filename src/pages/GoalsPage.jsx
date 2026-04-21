import { useState, useEffect } from 'react';
import { Target, Plus, CheckCircle2, Circle, Trash2, Wand2, Loader2 } from 'lucide-react';
import { listGoals, createGoal, deleteGoal, toggleMilestone } from '../api/goals';
import { apiFetch } from '../api/client';
import Button from '../components/shared/Button';
import Input from '../components/shared/Input';
import ProgressBar from '../components/curriculum/ProgressBar';
import LoadingSpinner from '../components/shared/LoadingSpinner';
import Modal from '../components/shared/Modal';

export default function GoalsPage() {
  const [goals, setGoals] = useState([]);
  const [loading, setLoading] = useState(true);
  const [creating, setCreating] = useState(false);
  const [showForm, setShowForm] = useState(false);
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [showAI, setShowAI] = useState(false);
  const [aiPrompt, setAiPrompt] = useState('');
  const [aiBusy, setAiBusy] = useState(false);
  const [aiError, setAiError] = useState(null);

  useEffect(() => {
    listGoals().then(d => { setGoals(d.goals || []); setLoading(false); }).catch(() => setLoading(false));
  }, []);

  async function handleCreate(e) {
    e.preventDefault();
    if (!title.trim()) return;
    setCreating(true);
    try {
      const data = await createGoal(title.trim(), description.trim());
      setGoals(prev => [data.goal, ...prev]);
      setTitle(''); setDescription(''); setShowForm(false);
    } catch (err) { console.error(err); }
    setCreating(false);
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

  // AI drafts a goal title + description from the user's rough prompt, then
  // the existing createGoal endpoint generates milestones.
  async function handleAIGenerate() {
    if (!aiPrompt.trim() || aiBusy) return;
    setAiBusy(true); setAiError(null);
    try {
      const system = `You turn a learner's rough intent into a crisp goal. Output ONLY valid JSON: {"title":"short title, max 8 words","description":"1-2 sentence description with what they'll do and roughly how they'll measure success"}. No markdown, no fences.`;
      const result = await apiFetch('/api/chat', {
        method: 'POST',
        body: JSON.stringify({ system, messages: [{ role: 'user', content: aiPrompt.trim() }], max_tokens: 500 }),
      });
      const text = result.content?.[0]?.text || '';
      let parsed = null;
      try { parsed = JSON.parse(text); } catch {
        const m = text.match(/\{[\s\S]*\}/);
        if (m) { try { parsed = JSON.parse(m[0]); } catch {} }
      }
      if (!parsed?.title) throw new Error('AI did not return a usable goal.');
      // createGoal already generates milestones server-side.
      const data = await createGoal(parsed.title, parsed.description || '');
      setGoals(prev => [data.goal, ...prev]);
      setShowAI(false);
      setAiPrompt('');
    } catch (e) {
      setAiError(e?.message || 'Generation failed. Try again.');
    }
    setAiBusy(false);
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
        <div className="flex items-center gap-2">
          <Button onClick={() => setShowAI(true)} size="sm" variant="ghost">
            <Wand2 size={14} /> Generate with AI
          </Button>
          <Button onClick={() => setShowForm(!showForm)} size="sm">
            <Plus size={16} /> New Goal
          </Button>
        </div>
      </div>

      <Modal open={showAI} onClose={() => { setShowAI(false); setAiError(null); }} title="Generate goal with AI">
        <div className="space-y-3">
          <div>
            <label className="text-xs font-medium text-gray-500 dark:text-gray-400 mb-1.5 block">What do you want to accomplish?</label>
            <textarea
              value={aiPrompt}
              onChange={e => setAiPrompt(e.target.value)}
              rows={3}
              placeholder="e.g., Get better at calculus before finals in 6 weeks. Focus on integrals and series."
              className="w-full px-3 py-2 rounded-lg border border-gray-200 dark:border-[#2A2A40] bg-white dark:bg-[#0D0D14] text-sm text-gray-900 dark:text-white outline-none focus:ring-2 focus:ring-amber-500/40 resize-none"
            />
          </div>
          <p className="text-[11px] text-gray-400">AI will draft a title + description. Milestones are then generated automatically.</p>
          {aiError && <p className="text-xs text-rose-500">{aiError}</p>}
          <div className="flex gap-2 justify-end">
            <Button size="sm" variant="ghost" onClick={() => { setShowAI(false); setAiError(null); }}>Cancel</Button>
            <Button size="sm" onClick={handleAIGenerate} disabled={!aiPrompt.trim() || aiBusy}>
              {aiBusy ? <><Loader2 size={14} className="animate-spin" /> Generating…</> : <><Wand2 size={14} /> Generate</>}
            </Button>
          </div>
        </div>
      </Modal>

      {showForm && (
        <form onSubmit={handleCreate} className="bg-white dark:bg-[#161622] rounded-xl border border-gray-200 dark:border-[#2A2A40] p-5 mb-4 space-y-3">
          <Input label="What's your goal?" placeholder="e.g., Master Linear Algebra" value={title} onChange={e => setTitle(e.target.value)} required />
          <Input label="Description (optional)" placeholder="Add context..." value={description} onChange={e => setDescription(e.target.value)} />
          <div className="flex gap-2">
            <Button type="submit" loading={creating} size="sm"><Plus size={14} /> Create Goal</Button>
            <Button type="button" variant="ghost" size="sm" onClick={() => setShowForm(false)}>Cancel</Button>
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
                <div>
                  <h3 className="font-semibold text-gray-900 dark:text-gray-100">{goal.title}</h3>
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
