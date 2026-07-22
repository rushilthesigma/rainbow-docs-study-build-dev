import {
  ArrowRight, CalendarDays, Check, ClipboardCheck, FileText, PenTool,
  Trophy, Zap,
} from 'lucide-react';
import { getDailyCurriculumTask } from '../../utils/dailyCurriculum';

const ICONS = {
  notes: FileText,
  quiz_bowl: Zap,
  assessment: ClipboardCheck,
  writing: PenTool,
  practice: PenTool,
};

export default function DailyTaskCard({ curriculum, onOpen, mobile = false }) {
  const daily = getDailyCurriculumTask(curriculum);
  const task = daily.task;
  const complete = daily.state === 'complete';
  const courseComplete = daily.state === 'course-complete';
  const Icon = courseComplete ? Trophy : (ICONS[task?.kind] || FileText);
  const completedCount = Math.max(0, daily.total - daily.remaining);
  const progress = daily.total ? Math.round((completedCount / daily.total) * 100) : 0;

  if (!task && !courseComplete) return null;

  if (mobile) {
    return (
      <section className="mb-6 rounded-3xl border border-blue-200/80 dark:border-blue-400/25 bg-blue-50 dark:bg-blue-500/[0.10] p-4.5 shadow-sm">
        <div className="flex items-center gap-2 mb-4">
          <CalendarDays size={15} className="text-blue-600 dark:text-blue-300" />
          <p className="text-[10.5px] font-bold uppercase tracking-[0.17em] text-blue-700 dark:text-blue-200">Your priority today</p>
          {task && <span className="ml-auto rounded-full bg-blue-600/10 dark:bg-blue-300/10 px-2 py-0.5 text-[10px] font-bold tabular-nums text-blue-600 dark:text-blue-200">Day {task.taskNumber} of {daily.total}</span>}
        </div>
        <div className="flex items-start gap-3.5">
          <div className={`w-12 h-12 rounded-2xl grid place-items-center shrink-0 ${complete || courseComplete ? 'bg-emerald-500 text-white' : 'bg-blue-600 text-white'}`}>
            {complete ? <Check size={21} strokeWidth={3} /> : <Icon size={20} />}
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-[11px] font-semibold text-blue-600/80 dark:text-blue-300/75">{courseComplete ? 'Course complete' : complete ? 'Daily task complete' : `${task.label} · ${task.estimate}`}</p>
            <p className="line-clamp-2 text-[15px] font-bold leading-tight tracking-tight text-gray-900 dark:text-white mt-0.5">{courseComplete ? 'You finished every daily task' : task.title}</p>
            <p className="text-[11px] text-gray-500 dark:text-gray-400 truncate mt-1">{complete ? 'Come back tomorrow for the next focus.' : courseComplete ? 'Every course item is complete.' : task.unit?.title}</p>
          </div>
        </div>
        <div className="mt-4 h-1.5 overflow-hidden rounded-full bg-blue-200/60 dark:bg-white/[0.08]">
          <div className={`h-full rounded-full ${courseComplete ? 'bg-emerald-500' : 'bg-blue-600'}`} style={{ width: `${progress}%` }} />
        </div>
        <div className="mt-2 flex items-center justify-between text-[10.5px] text-blue-700/60 dark:text-blue-200/50">
          <span>{completedCount} of {daily.total} course tasks complete</span>
          <span className="font-semibold tabular-nums">{progress}%</span>
        </div>
        {!complete && !courseComplete && (
          <button type="button" onClick={() => onOpen?.(task)} aria-label={`Start today's task: ${task.title}`} className="mt-4 w-full rounded-2xl bg-blue-600 py-3 text-[13.5px] font-bold text-white inline-flex items-center justify-center gap-2 active:bg-blue-700">
            Start today’s task <ArrowRight size={15} />
          </button>
        )}
      </section>
    );
  }

  return (
    <section className="mb-5 rounded-xl border border-blue-400/25 bg-blue-500/[0.10] p-4">
      <div className="mb-3 flex items-center gap-2">
        <CalendarDays size={13} className="text-blue-300" />
        <span className="text-[10px] font-bold uppercase tracking-[0.16em] text-blue-200/80">Your priority today</span>
        {task && <span className="ml-auto rounded-md border border-blue-300/15 bg-blue-300/[0.08] px-2 py-0.5 text-[10px] font-semibold tabular-nums text-blue-100/70">Day {task.taskNumber} of {daily.total}</span>}
      </div>
      <div className="flex items-center gap-3.5">
        <div className={`h-12 w-12 rounded-xl flex items-center justify-center shrink-0 ${complete || courseComplete ? 'bg-emerald-500/15 text-emerald-300' : 'bg-blue-500/20 text-blue-200'}`}>
          {complete ? <Check size={20} strokeWidth={3} /> : <Icon size={20} />}
        </div>
        <div className="flex-1 min-w-0">
          <p className="text-[11px] font-semibold text-blue-200/70">{courseComplete ? 'Course complete' : complete ? 'Daily task complete' : `${task.label} · ${task.estimate}`}</p>
          <p className="text-[15px] font-semibold text-white/95 truncate mt-0.5">{courseComplete ? 'You finished every course task' : task.title}</p>
          <p className="text-[11px] text-white/45 truncate mt-0.5">
            {courseComplete ? 'Every lesson and review is complete.' : complete ? 'Come back tomorrow for the next focus.' : task.unit?.title}
          </p>
        </div>
        {!complete && !courseComplete && (
          <button type="button" onClick={() => onOpen?.(task)} className="inline-flex items-center gap-1.5 rounded-lg bg-blue-500 px-4 py-2.5 text-xs font-semibold text-white hover:bg-blue-400 transition-colors">
            Start today <ArrowRight size={13} />
          </button>
        )}
      </div>
      <div className="mt-4 flex items-center gap-3">
        <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-white/[0.08]">
          <div className={`h-full rounded-full transition-[width] duration-300 ${courseComplete ? 'bg-emerald-400' : 'bg-blue-400'}`} style={{ width: `${progress}%` }} />
        </div>
        <span className="text-[10px] tabular-nums text-white/35">{completedCount}/{daily.total} complete</span>
      </div>
    </section>
  );
}
