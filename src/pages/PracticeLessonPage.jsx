import { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { ArrowLeft, ChevronLeft, ChevronRight } from 'lucide-react';
import { getCurriculum } from '../api/curriculum';
import { apiFetch } from '../api/client';
import MathCanvas from '../components/math/MathCanvas';
import LoadingSpinner from '../components/shared/LoadingSpinner';

export default function PracticeLessonPage() {
  const { id: curriculumId, lessonId } = useParams();
  const navigate = useNavigate();
  const [curriculum, setCurriculum] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    getCurriculum(curriculumId)
      .then(d => setCurriculum(d.curriculum))
      .catch(console.error)
      .finally(() => setLoading(false));
  }, [curriculumId]);

  // Find lesson
  let currentLesson = null;
  let currentUnit = null;
  const allLessons = [];
  for (const u of curriculum?.units || []) {
    for (const l of u.lessons || []) {
      allLessons.push({ ...l, unitTitle: u.title });
      if (l.id === lessonId) { currentLesson = l; currentUnit = u; }
    }
  }
  const currentIndex = allLessons.findIndex(l => l.id === lessonId);

  async function markComplete() {
    try {
      await apiFetch(`/api/curriculum/${curriculumId}/lesson/${lessonId}/complete`, {
        method: 'POST',
        body: JSON.stringify({ score: 100 }),
      });
    } catch {}
    navigate(`/curriculum/${curriculumId}`);
  }

  if (loading) return <div className="flex items-center justify-center h-64"><LoadingSpinner size={28} /></div>;
  if (!currentLesson) return <div className="text-center py-20 text-gray-500">Lesson not found</div>;

  return (
    <div className="w-full flex flex-col flex-1 min-h-0">
      {/* Header */}
      <div className="flex items-center gap-3 px-4 py-2.5 border-b border-gray-200 dark:border-[#2A2A40] bg-white dark:bg-[#161622] flex-shrink-0">
        <button onClick={() => navigate(`/curriculum/${curriculumId}`)} className="text-gray-400 hover:text-gray-600 dark:hover:text-gray-300">
          <ArrowLeft size={16} />
        </button>
        <div className="flex-1 min-w-0">
          <p className="text-sm font-semibold text-gray-900 dark:text-white truncate">{currentLesson.title}</p>
          <p className="text-xs text-gray-400">{currentUnit?.title}</p>
        </div>

        {/* Nav + complete */}
        <div className="flex items-center gap-1.5">
          {currentIndex > 0 && (
            <button onClick={() => navigate(`/curriculum/${curriculumId}/lesson/${allLessons[currentIndex - 1].id}`)} className="p-1.5 rounded-lg text-gray-400 hover:text-gray-600 dark:hover:text-gray-300">
              <ChevronLeft size={16} />
            </button>
          )}
          <button onClick={markComplete} className="px-3 py-1 rounded-lg bg-emerald-600 text-white text-xs font-medium hover:bg-emerald-700">
            Done
          </button>
          {currentIndex < allLessons.length - 1 && (
            <button onClick={() => navigate(`/curriculum/${curriculumId}/lesson/${allLessons[currentIndex + 1].id}`)} className="p-1.5 rounded-lg text-gray-400 hover:text-gray-600 dark:hover:text-gray-300">
              <ChevronRight size={16} />
            </button>
          )}
        </div>
      </div>

      {/* Math Canvas */}
      <MathCanvas className="flex-1 min-h-0" topic={currentLesson.practiceTopic || currentUnit?.title || ''} />
    </div>
  );
}
