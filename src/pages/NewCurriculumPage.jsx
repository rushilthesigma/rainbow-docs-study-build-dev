import { useState, useRef, useEffect } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { Sparkles, ArrowLeft } from 'lucide-react';
import { generateCurriculum } from '../api/curriculum';
import { DEFAULT_SETTINGS, DIFFICULTY_OPTIONS, LEARNING_STYLE_OPTIONS, LESSON_LENGTH_OPTIONS, TONE_OPTIONS } from '../utils/constants';
import Button from '../components/shared/Button';
import Input from '../components/shared/Input';
import PillGroup from '../components/shared/PillGroup';
import Toggle from '../components/shared/Toggle';
import Modal from '../components/shared/Modal';
import { usePanels } from '../context/PanelContext';

export default function NewCurriculumPage() {
  const navigate = useNavigate();
  const location = useLocation();
  const { addPanel, updatePanel, removePanel } = usePanels();
  const [settings, setSettings] = useState(DEFAULT_SETTINGS);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const generatingRef = useRef(false);

  // Sources passed in from a launching page (e.g. NoteEditor handing the
  // note text over). Server-side `/api/curriculum/generate` already
  // grounds the syllabus in attached sources when present.
  const [seedSources, setSeedSources] = useState([]);
  const seeded = useRef(false);
  useEffect(() => {
    if (seeded.current) return;
    const seedTopic = location.state?.seedTopic;
    const incoming = location.state?.seedSources;
    if (seedTopic) {
      seeded.current = true;
      setSettings((prev) => ({ ...prev, topic: seedTopic }));
    }
    if (Array.isArray(incoming) && incoming.length > 0) {
      seeded.current = true;
      setSeedSources(incoming);
    }
  }, [location.state]);

  function update(key, value) {
    setSettings(prev => ({ ...prev, [key]: value }));
  }

  const [showConfirm, setShowConfirm] = useState(false);

  function handleSubmit(e) {
    e.preventDefault();
    if (!settings.topic.trim() || generatingRef.current) return;
    setShowConfirm(true);
  }

  async function handleConfirmGenerate() {
    setShowConfirm(false);
    setLoading(true);
    setError(null);
    generatingRef.current = true;

    const panelId = 'curriculum-gen-' + Date.now();
    addPanel({
      id: panelId,
      title: `Generating: ${settings.topic}`,
      status: 'loading',
      onRestore: () => {},
    });
    navigate('/dashboard');

    try {
      const data = await generateCurriculum(settings, seedSources);
      if (data.curriculum) {
        updatePanel(panelId, {
          title: `Ready: ${data.curriculum.title}`,
          status: 'done',
          onRestore: () => {
            removePanel(panelId);
            window.location.href = `/curriculum/${data.curriculum.id}`;
          },
        });
      }
    } catch (err) {
      updatePanel(panelId, { title: `Failed: ${settings.topic}`, status: 'error' });
      setTimeout(() => removePanel(panelId), 5000);
    }
    generatingRef.current = false;
  }

  return (
    <div className="max-w-2xl mx-auto">
      <button
        onClick={() => navigate('/dashboard')}
        className="flex items-center gap-2 text-[13px] text-white/35 hover:text-white/65 mb-6 transition-colors"
      >
        <ArrowLeft size={16} />
        Back to Dashboard
      </button>

      <div className="rounded-xl border border-blue-400/[0.18] bg-gradient-to-b from-blue-500/[0.06] to-blue-500/[0.02] backdrop-blur-sm p-6">
        <div className="flex items-center gap-3 mb-6">
          <div className="w-10 h-10 rounded-lg bg-blue-500/[0.16] border border-blue-400/[0.30] flex items-center justify-center">
            <Sparkles size={20} className="text-blue-300" />
          </div>
          <div>
            <h1 className="text-[20px] font-bold text-white/90">New Curriculum</h1>
            <p className="text-[13px] text-blue-200/55">AI will generate a structured learning path</p>
          </div>
        </div>

        {seedSources.length > 0 && (
          <div className="mb-5 rounded-lg border border-emerald-300 bg-emerald-50 dark:border-emerald-500/20 dark:bg-emerald-500/[0.06] px-4 py-3 flex items-start gap-3">
            <Sparkles size={14} className="text-emerald-600 dark:text-emerald-400 mt-0.5 flex-shrink-0" />
            <div className="text-[12px] text-emerald-900 dark:text-emerald-200/90 leading-relaxed">
              <span className="font-semibold">{seedSources.length} source{seedSources.length === 1 ? '' : 's'} attached</span>
              <span className="text-emerald-700/80 dark:text-emerald-200/55"> — the AI will ground this curriculum in </span>
              <span className="text-emerald-900 dark:text-emerald-200/85">"{seedSources[0].title || 'your note'}"</span>
              {seedSources.length > 1 && <span className="text-emerald-700/80 dark:text-emerald-200/55"> and {seedSources.length - 1} more.</span>}
            </div>
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-5">
          <Input label="What do you want to learn?" placeholder="e.g., Quantum Mechanics, Python, Music Theory..." value={settings.topic} onChange={e => update('topic', e.target.value)} required />
          <Input label="Target audience (optional)" placeholder="e.g., high school students, professionals..." value={settings.audience} onChange={e => update('audience', e.target.value)} />
          <PillGroup label="Difficulty" options={DIFFICULTY_OPTIONS} value={settings.difficulty} onChange={v => update('difficulty', v)} />
          <PillGroup label="Learning Style" options={LEARNING_STYLE_OPTIONS} value={settings.learningStyle} onChange={v => update('learningStyle', v)} />
          <PillGroup label="Tone" options={TONE_OPTIONS} value={settings.tone} onChange={v => update('tone', v)} />
          <PillGroup label="Lesson Length" options={LESSON_LENGTH_OPTIONS} value={settings.lessonLength} onChange={v => update('lessonLength', v)} />
          <div className="space-y-3 pt-2">
            <Toggle label="Include examples" checked={settings.includeExamples} onChange={v => update('includeExamples', v)} />
            <Toggle label="Include exercises" checked={settings.includeExercises} onChange={v => update('includeExercises', v)} />
            <Toggle
              label="Graded mode"
              description="Each lesson gets an AI-assigned task with a rubric. Submissions are graded and roll up to a course grade — visible to parents."
              checked={settings.graded}
              onChange={v => update('graded', v)}
            />
          </div>

          {error && (
            <div className="text-[13px] text-rose-400 bg-rose-900/20 border border-rose-700/30 rounded-lg px-4 py-3">{error}</div>
          )}

          <Button type="submit" loading={loading} className="w-full" size="lg">
            <Sparkles size={16} />
            Generate Curriculum
          </Button>
        </form>
      </div>

      <Modal open={showConfirm} onClose={() => setShowConfirm(false)} title="Generate Curriculum?">
        <p className="text-[13px] text-white/65 mb-2">
          This will create a full curriculum on <span className="font-semibold text-white/85">"{settings.topic}"</span> with units, lessons, and assessments.
        </p>
        <p className="text-[12px] text-white/35 mb-5">
          Generation happens in the background — you can keep browsing while it works. You'll see a notification when it's ready.
        </p>
        <div className="flex gap-2">
          <Button onClick={handleConfirmGenerate} className="flex-1">Yes, Generate</Button>
          <Button variant="secondary" onClick={() => setShowConfirm(false)} className="flex-1">Cancel</Button>
        </div>
      </Modal>
    </div>
  );
}
