import { useNavigate } from 'react-router-dom';
import { BookOpen, Clock, ArrowRight } from 'lucide-react';
import ProgressBar from './ProgressBar';

export default function CurriculumCard({ curriculum }) {
  const navigate = useNavigate();
  const { id, title, description, totalLessons = 0, completedLessons = 0, unitCount = 0, createdAt } = curriculum;
  const pct = totalLessons > 0 ? Math.round((completedLessons / totalLessons) * 100) : 0;

  const timeAgo = createdAt ? formatTimeAgo(createdAt) : '';

  return (
    <button
      onClick={() => navigate(`/curriculum/${id}`)}
      className="w-full text-left bg-white dark:bg-[#161622] rounded-xl border border-gray-200 dark:border-[#2A2A40] p-5 hover:border-blue-300 dark:hover:border-blue-700 transition-colors group"
    >
      <div className="flex items-start justify-between mb-3">
        <div className="flex-1 min-w-0">
          <h3 className="font-semibold text-gray-900 dark:text-gray-100 truncate group-hover:text-blue-600 dark:group-hover:text-blue-400 transition-colors">
            {title}
          </h3>
          {description && (
            <p className="text-sm text-gray-500 dark:text-gray-400 mt-1 line-clamp-2">{description}</p>
          )}
        </div>
        <ArrowRight size={16} className="text-gray-300 dark:text-gray-600 group-hover:text-blue-500 transition-colors mt-1 flex-shrink-0 ml-3" />
      </div>

      <ProgressBar value={completedLessons} max={totalLessons} size="sm" showLabel={false} className="mb-3" />

      <div className="flex items-center gap-4 text-xs text-gray-400 dark:text-gray-500">
        <span className="flex items-center gap-1">
          <BookOpen size={13} />
          {unitCount} unit{unitCount !== 1 ? 's' : ''} &middot; {totalLessons} lesson{totalLessons !== 1 ? 's' : ''}
        </span>
        {pct > 0 && (
          <span className="text-blue-500 font-medium">{pct}% done</span>
        )}
        {timeAgo && (
          <span className="ml-auto flex items-center gap-1">
            <Clock size={13} />
            {timeAgo}
          </span>
        )}
      </div>
    </button>
  );
}

function formatTimeAgo(dateStr) {
  const diff = Date.now() - new Date(dateStr).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  if (days < 30) return `${days}d ago`;
  return new Date(dateStr).toLocaleDateString();
}
