import { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { ArrowLeft, Trash2 } from 'lucide-react';
import { getCurriculum, deleteCurriculum } from '../api/curriculum';
import UnitAccordion from '../components/curriculum/UnitAccordion';
import StatCards from '../components/curriculum/StatCards';
import ProgressBar from '../components/curriculum/ProgressBar';
import LoadingSpinner from '../components/shared/LoadingSpinner';
import Button from '../components/shared/Button';

export default function CurriculumPage() {
  const { id } = useParams();
  const navigate = useNavigate();
  const [curriculum, setCurriculum] = useState(null);
  const [loading, setLoading] = useState(true);
  const [deleting, setDeleting] = useState(false);

  useEffect(() => {
    async function load() {
      try {
        const data = await getCurriculum(id);
        setCurriculum(data.curriculum);
      } catch (err) {
        console.error('Failed to load curriculum:', err);
      }
      setLoading(false);
    }
    load();
  }, [id]);

  async function handleDelete() {
    if (!confirm('Delete this curriculum? This cannot be undone.')) return;
    setDeleting(true);
    try {
      await deleteCurriculum(id);
      navigate('/dashboard');
    } catch (err) {
      console.error('Failed to delete:', err);
    }
    setDeleting(false);
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <LoadingSpinner size={28} />
      </div>
    );
  }

  if (!curriculum) {
    return (
      <div className="text-center py-20">
        <p className="text-gray-500 dark:text-gray-400">Curriculum not found.</p>
        <Button variant="ghost" onClick={() => navigate('/dashboard')} className="mt-4">
          Back to Dashboard
        </Button>
      </div>
    );
  }

  const totalLessons = (curriculum.units || []).reduce((s, u) => s + (u.lessons || []).length, 0);
  const completedLessons = (curriculum.units || []).reduce((s, u) => s + (u.lessons || []).filter(l => l.isCompleted).length, 0);

  return (
    <div className="max-w-3xl mx-auto">
      <button
        onClick={() => navigate('/dashboard')}
        className="flex items-center gap-2 text-sm text-white/45 hover:text-white/80 mb-6 transition-colors"
      >
        <ArrowLeft size={16} />
        Back to Dashboard
      </button>

      {/* Header */}
      <div className="mb-6">
        <div className="flex items-start justify-between">
          <div className="flex-1">
            <h1 className="text-2xl font-bold text-white/90">{curriculum.title}</h1>
            {curriculum.description && (
              <p className="text-sm text-white/50 mt-1">{curriculum.description}</p>
            )}
          </div>
          <Button variant="ghost" onClick={handleDelete} loading={deleting} size="sm" className="text-gray-400 hover:text-rose-500">
            <Trash2 size={16} />
          </Button>
        </div>
        <ProgressBar value={completedLessons} max={totalLessons} className="mt-4" />
      </div>

      {/* Stats */}
      <StatCards curriculum={curriculum} />

      {/* Settings pills */}
      {curriculum.settings && (
        <div className="flex flex-wrap gap-2 mt-4 mb-6">
          {curriculum.settings.difficulty && (
            <span className="px-2.5 py-1 rounded-full bg-white/[0.06] border border-white/[0.10] text-white/70 text-xs font-medium">
              {curriculum.settings.difficulty}
            </span>
          )}
          {curriculum.settings.learningStyle && (
            <span className="px-2.5 py-1 rounded-full bg-purple-50 dark:bg-purple-900/20 border border-purple-200 dark:border-purple-800/40 text-purple-600 dark:text-purple-400 text-xs font-medium">
              {curriculum.settings.learningStyle}
            </span>
          )}
          {curriculum.settings.tone && (
            <span className="px-2.5 py-1 rounded-full bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800/40 text-amber-600 dark:text-amber-400 text-xs font-medium">
              {curriculum.settings.tone}
            </span>
          )}
        </div>
      )}

      {/* Units */}
      <div className="space-y-3 mt-6">
        {(curriculum.units || []).map((unit) => (
          <UnitAccordion key={unit.id} unit={unit} curriculumId={id} />
        ))}
      </div>
    </div>
  );
}
