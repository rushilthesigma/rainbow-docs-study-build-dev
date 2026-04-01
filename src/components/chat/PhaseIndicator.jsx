import { LESSON_PHASES } from '../../utils/constants';
import { CheckCircle2 } from 'lucide-react';

export default function PhaseIndicator({ currentPhase }) {
  const currentIdx = LESSON_PHASES.findIndex(p => p.key === currentPhase);

  return (
    <div className="flex items-center gap-1 px-4 py-3 bg-white dark:bg-[#161622] border-b border-gray-200 dark:border-[#2A2A40]">
      {LESSON_PHASES.map((phase, i) => {
        const isComplete = i < currentIdx;
        const isCurrent = i === currentIdx;
        return (
          <div key={phase.key} className="flex items-center flex-1">
            <div className="flex items-center gap-1.5 flex-1">
              <div className={`w-6 h-6 rounded-full flex items-center justify-center text-xs font-semibold flex-shrink-0 ${
                isComplete ? 'bg-emerald-500 text-white' :
                isCurrent ? 'bg-blue-600 text-white' :
                'bg-gray-100 dark:bg-[#1e1e2e] text-gray-400 dark:text-gray-500'
              }`}>
                {isComplete ? <CheckCircle2 size={14} /> : phase.number}
              </div>
              <span className={`text-xs font-medium hidden sm:block ${
                isCurrent ? 'text-blue-600 dark:text-blue-400' :
                isComplete ? 'text-emerald-600 dark:text-emerald-400' :
                'text-gray-400 dark:text-gray-500'
              }`}>
                {phase.label}
              </span>
            </div>
            {i < LESSON_PHASES.length - 1 && (
              <div className={`h-0.5 flex-1 mx-1 rounded ${
                i < currentIdx ? 'bg-emerald-500' : 'bg-gray-200 dark:bg-[#2A2A40]'
              }`} />
            )}
          </div>
        );
      })}
    </div>
  );
}
