import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { ChevronDown, ChevronRight, CheckCircle2, Circle, Play, Lock, BookOpen, PenTool, FileText, ClipboardCheck } from 'lucide-react';
import ProgressBar from './ProgressBar';

const TYPE_ICONS = {
  lesson: BookOpen,
  practice: PenTool,
  essay: FileText,
  unit_test: ClipboardCheck,
};

const TYPE_COLORS = {
  lesson: 'text-blue-400',
  practice: 'text-purple-400',
  essay: 'text-amber-400',
  unit_test: 'text-rose-400',
};

export default function UnitAccordion({ unit, curriculumId }) {
  const [open, setOpen] = useState(true);
  const navigate = useNavigate();

  const totalLessons = (unit.lessons || []).length;
  const completedLessons = (unit.lessons || []).filter(l => l.isCompleted).length;

  return (
    <div className={`bg-white dark:bg-[#161622] rounded-xl border border-gray-200 dark:border-[#2A2A40] overflow-hidden ${unit.locked ? 'opacity-60' : ''}`}>
      <button
        onClick={() => setOpen(!open)}
        className="w-full flex items-center gap-3 p-4 text-left hover:bg-gray-50 dark:hover:bg-[#1e1e2e] transition-colors"
      >
        {unit.locked ? (
          <Lock size={16} className="text-gray-400" />
        ) : open ? (
          <ChevronDown size={18} className="text-gray-400" />
        ) : (
          <ChevronRight size={18} className="text-gray-400" />
        )}
        <div className="flex-1 min-w-0">
          <h4 className="font-semibold text-gray-900 dark:text-gray-100 text-sm">{unit.title}</h4>
          {unit.description && (
            <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5 truncate">{unit.description}</p>
          )}
        </div>
        <span className="text-xs text-gray-400 dark:text-gray-500 tabular-nums flex-shrink-0">
          {completedLessons}/{totalLessons}
        </span>
      </button>

      {open && !unit.locked && (
        <div className="border-t border-gray-100 dark:border-[#2A2A40]">
          <ProgressBar value={completedLessons} max={totalLessons} size="sm" showLabel={false} className="px-4 pt-3" />
          <div className="p-2">
            {(unit.lessons || []).map((lesson) => {
              const TypeIcon = TYPE_ICONS[lesson.type] || BookOpen;
              const typeColor = TYPE_COLORS[lesson.type] || 'text-gray-400';

              return (
                <button
                  key={lesson.id}
                  onClick={() => {
                    if (lesson.type === 'unit_test') navigate(`/curriculum/${curriculumId}/assessment/${lesson.id}`);
                    else if (lesson.type === 'practice' && lesson.tool === 'math_canvas') navigate(`/curriculum/${curriculumId}/practice/${lesson.id}`);
                    else navigate(`/curriculum/${curriculumId}/lesson/${lesson.id}`);
                  }}
                  className="w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-left hover:bg-gray-50 dark:hover:bg-[#1e1e2e] transition-colors group"
                >
                  {lesson.isCompleted ? (
                    <CheckCircle2 size={16} className="text-emerald-500 flex-shrink-0" />
                  ) : lesson.chatHistory?.length > 0 ? (
                    <Circle size={16} className="text-blue-400 flex-shrink-0" />
                  ) : (
                    <TypeIcon size={16} className={`${typeColor} flex-shrink-0`} />
                  )}
                  <div className="flex-1 min-w-0">
                    <p className={`text-sm ${lesson.isCompleted ? 'text-gray-400 dark:text-gray-500 line-through' : 'text-gray-700 dark:text-gray-200'} group-hover:text-blue-600 dark:group-hover:text-blue-400 transition-colors`}>
                      {lesson.title}
                    </p>
                    {lesson.description && (
                      <p className="text-xs text-gray-400 dark:text-gray-500 mt-0.5 truncate">{lesson.description}</p>
                    )}
                  </div>
                  {lesson.score !== null && lesson.score !== undefined && (
                    <span className="text-xs font-medium text-gray-400 tabular-nums flex-shrink-0">
                      {lesson.score}pts
                    </span>
                  )}
                </button>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}
