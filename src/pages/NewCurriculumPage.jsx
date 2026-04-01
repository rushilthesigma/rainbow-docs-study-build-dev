import { useState, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
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
  const { addPanel, updatePanel, removePanel } = usePanels();
  const [settings, setSettings] = useState(DEFAULT_SETTINGS);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const generatingRef = useRef(false);

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

    // Run generation in background
    try {
      const data = await generateCurriculum(settings);
      if (data.curriculum) {
        updatePanel(panelId, {
          title: `Ready: ${data.curriculum.title}`,
          status: 'done',
          onRestore: () => {
            removePanel(panelId);
            // Use window.location since navigate may not be available
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
        className="flex items-center gap-2 text-sm text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-200 mb-6 transition-colors"
      >
        <ArrowLeft size={16} />
        Back to Dashboard
      </button>

      <div className="bg-white dark:bg-[#161622] rounded-xl border border-gray-200 dark:border-[#2A2A40] p-6">
        <div className="flex items-center gap-3 mb-6">
          <div className="w-10 h-10 rounded-lg bg-blue-50 dark:bg-blue-900/20 flex items-center justify-center text-blue-600">
            <Sparkles size={20} />
          </div>
          <div>
            <h1 className="text-xl font-bold text-gray-900 dark:text-white">New Curriculum</h1>
            <p className="text-sm text-gray-500 dark:text-gray-400">AI will generate a structured learning path</p>
          </div>
        </div>

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
          </div>

          {error && (
            <div className="text-sm text-rose-500 bg-rose-50 dark:bg-rose-900/20 rounded-lg px-4 py-3">{error}</div>
          )}

          <Button type="submit" loading={loading} className="w-full" size="lg">
            <Sparkles size={16} />
            Generate Curriculum
          </Button>
        </form>
      </div>

      <Modal open={showConfirm} onClose={() => setShowConfirm(false)} title="Generate Curriculum?">
        <p className="text-sm text-gray-600 dark:text-gray-300 mb-2">
          This will create a full curriculum on <span className="font-semibold">"{settings.topic}"</span> with units, lessons, and assessments.
        </p>
        <p className="text-xs text-gray-400 mb-5">
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
