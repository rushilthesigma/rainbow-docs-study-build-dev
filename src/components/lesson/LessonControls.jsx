import { CheckCircle2, Circle, RefreshCw, ChevronLeft, ChevronRight } from 'lucide-react';
import Button from '../shared/Button';

export default function LessonControls({ lesson, onToggleComplete, onRegenerate, onPrev, onNext, hasPrev, hasNext, completing, regenerating }) {
  return (
    <div className="flex items-center justify-between pt-6 mt-6 border-t border-gray-200 dark:border-[#2A2A40]">
      <div className="flex items-center gap-2">
        <Button
          variant={lesson?.isCompleted ? 'primary' : 'secondary'}
          size="sm"
          onClick={onToggleComplete}
          loading={completing}
        >
          {lesson?.isCompleted ? <CheckCircle2 size={16} /> : <Circle size={16} />}
          {lesson?.isCompleted ? 'Completed' : 'Mark Complete'}
        </Button>

        {lesson?.content && (
          <Button variant="ghost" size="sm" onClick={onRegenerate} loading={regenerating}>
            <RefreshCw size={14} />
            Regenerate
          </Button>
        )}
      </div>

      <div className="flex items-center gap-2">
        <Button variant="ghost" size="sm" onClick={onPrev} disabled={!hasPrev}>
          <ChevronLeft size={16} />
          Prev
        </Button>
        <Button variant="ghost" size="sm" onClick={onNext} disabled={!hasNext}>
          Next
          <ChevronRight size={16} />
        </Button>
      </div>
    </div>
  );
}
