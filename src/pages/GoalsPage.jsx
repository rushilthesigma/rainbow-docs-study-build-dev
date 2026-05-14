import { useState, useEffect } from 'react';
import { Target, Plus, CheckCircle2, Circle, Trash2, Wand2, Loader2 } from 'lucide-react';
import { listGoals, createGoal, deleteGoal, toggleMilestone } from '../api/goals';
import { apiFetch } from '../api/client';
import Button from '../components/shared/Button';
import Input from '../components/shared/Input';
import ProgressBar from '../components/curriculum/ProgressBar';
import LoadingSpinner from '../components/shared/LoadingSpinner';
import Modal from '../components/shared/Modal';
import { InlineProgress } from '../components/shared/ProgressBar';

const card = 'rounded-xl border border-white/[0.07] bg-white/[0.03] backdrop-blur-sm';
const inputCls = 'w-full px-3 py-2 rounded-lg border border-white/[0.08] bg-white/[0.04] text-[13px] text-white/85 placeholder:text-white/25 outline-none focus:border-white/[0.20] focus:bg-white/[0.07] transition-colors resize-none';

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
          <div className="w-10 h-10 rounded-lg bg-white/[0.06] border border-white/[0.09] flex items-center justify-center">
            <Target size={20} className="text-white/40" />
          </div>
          <div>
            <h1 className="text-[20px] font-bold text-white/90">Goals</h1>
            <p className="text-[13px] text-white/40">{goals.filter(g => g.status === 'active').length} active</p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <Button onClick={() => setShowAI(true)} size="sm" variant="ghost">
            <Wand2 size={14} /> AI
          </Button>
          <Button onClick={() => setShowForm(!showForm)} size="sm">
            <Plus size={16} /> New
          </Button>
        </div>
      </div>

      <Modal open={showAI} onClose={() => { setShowAI(false); setAiError(null); }} title="Goal from AI">
        <div className="space-y-3">
          <textarea
            value={aiPrompt}
            onChange={e => setAiPrompt(e.target.value)}
            rows={3}
            placeholder="What do you want to accomplish?"
            className={inputCls}
          />
          {aiError && <p className="text-[12px] text-rose-400">{aiError}</p>}
          <div className="flex gap-2 justify-end">
            <Button size="sm" variant="ghost" onClick={() => { setShowAI(false); setAiError(null); }}>Cancel</Button>
            <Button size="sm" onClick={handleAIGenerate} disabled={!aiPrompt.trim() || aiBusy}>
              {aiBusy ? <><InlineProgress active /> Generating…</> : <><Wand2 size={14} /> Generate</>}
            </Button>
          </div>
        </div>
      </Modal>

      {showForm && (
        <form onSubmit={handleCreate} className={`${card} p-5 mb-4 space-y-3`}>
          <Input label="Goal" placeholder="e.g., Master Linear Algebra" value={title} onChange={e => setTitle(e.target.value)} required />
          <Input label="Notes (optional)" placeholder="Context…" value={description} onChange={e => setDescription(e.target.value)} />
          <div className="flex gap-2">
            <Button type="submit" loading={creating} size="sm"><Plus size={14} /> Create</Button>
            <Button type="button" variant="ghost" size="sm" onClick={() => setShowForm(false)}>Cancel</Button>
          </div>
          {creating && <p className="text-[12px] text-white/35">Generating milestones…</p>}
        </form>
      )}

      {goals.length === 0 && !showForm ? (
        <div className={`${card} p-12 text-center`}>
          <Target size={28} className="text-white/20 mx-auto mb-3" />
          <p className="text-[13px] text-white/35 mb-4">No goals yet</p>
          <Button onClick={() => setShowForm(true)}><Plus size={16} /> New goal</Button>
        </div>
      ) : (
        <div className="space-y-3">
          {goals.map(goal => (
            <div key={goal.id} className={`${card} p-5`}>
              <div className="flex items-start justify-between mb-3">
                <div>
                  <h3 className="text-[14px] font-semibold text-white/85">{goal.title}</h3>
                  {goal.description && <p className="text-[13px] text-white/45 mt-0.5">{goal.description}</p>}
                </div>
                <div className="flex items-center gap-2">
                  {goal.status === 'completed' && (
                    <span className="text-[12px] font-medium text-emerald-400 bg-emerald-900/20 px-2 py-0.5 rounded-full">Done</span>
                  )}
                  <button onClick={() => handleDelete(goal.id)} className="text-white/20 hover:text-rose-400 transition-colors">
                    <Trash2 size={14} />
                  </button>
                </div>
              </div>
              <ProgressBar value={goal.progress || 0} max={100} size="sm" className="mb-3" />
              <div className="space-y-0.5">
                {(goal.milestones || []).map(m => (
                  <button
                    key={m.id}
                    onClick={() => handleToggleMilestone(goal.id, m.id)}
                    className="flex items-center gap-2.5 w-full text-left py-1.5 px-2 rounded-lg hover:bg-white/[0.04] transition-colors"
                  >
                    {m.isCompleted ? (
                      <CheckCircle2 size={16} className="text-emerald-500 flex-shrink-0" />
                    ) : (
                      <Circle size={16} className="text-white/25 flex-shrink-0" />
                    )}
                    <span className={`text-[13px] ${m.isCompleted ? 'text-white/35 line-through' : 'text-white/75'}`}>
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
