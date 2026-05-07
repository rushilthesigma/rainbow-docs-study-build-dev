import { LESSON_PHASES } from '../../utils/constants';
import { CheckCircle2 } from 'lucide-react';

export default function PhaseIndicator({ currentPhase }) {
  const currentIdx = LESSON_PHASES.findIndex(p => p.key === currentPhase);

  return (
    <div className="flex items-center gap-1 px-4 py-3 bg-white/[0.03] border-b border-white/[0.07]">
      {LESSON_PHASES.map((phase, i) => {
        const isComplete = i < currentIdx;
        const isCurrent = i === currentIdx;
        return (
          <div key={phase.key} className="flex items-center flex-1">
            <div className="flex items-center gap-1.5 flex-1">
              <div className={`w-6 h-6 rounded-full flex items-center justify-center text-xs font-semibold flex-shrink-0 ${
                isComplete ? 'bg-emerald-500 text-white' :
                isCurrent ? 'bg-white/90 text-black' :
                'bg-white/[0.07] text-white/40'
              }`}>
                {isComplete ? <CheckCircle2 size={14} /> : phase.number}
              </div>
              <span className={`text-xs font-medium hidden sm:block ${
                isCurrent ? 'text-white/90' :
                isComplete ? 'text-emerald-400' :
                'text-white/35'
              }`}>
                {phase.label}
              </span>
            </div>
            {i < LESSON_PHASES.length - 1 && (
              <div className={`h-0.5 flex-1 mx-1 rounded ${
                i < currentIdx ? 'bg-emerald-500' : 'bg-white/[0.08]'
              }`} />
            )}
          </div>
        );
      })}
    </div>
  );
}
