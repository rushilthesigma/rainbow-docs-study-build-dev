import { LESSON_PHASES } from '../../utils/constants';

// Segmented progress bar - one slim pill per phase, the current one
// glows with a gradient + halo, completed ones stay solid, upcoming
// ones are muted. The labels live below as a single line so they
// don't crowd the bar. Active phase label is highlighted; the rest
// fade out, matching how StageTracker reads on the block view.
export default function PhaseIndicator({ currentPhase }) {
  const currentIdx = LESSON_PHASES.findIndex(p => p.key === currentPhase);
  const active = LESSON_PHASES[currentIdx];

  return (
    <div className="px-5 pt-4 pb-3 border-b border-white/[0.06] bg-white/[0.015]">
      {/* Segmented bar */}
      <div className="flex gap-1.5 mb-2.5">
        {LESSON_PHASES.map((phase, i) => {
          const isComplete = i < currentIdx;
          const isCurrent  = i === currentIdx;
          return (
            <div
              key={phase.key}
              className={`flex-1 h-1 rounded-full transition-all duration-300 ${
                isCurrent
                  ? 'bg-gradient-to-r from-blue-400 to-indigo-500'
                  : isComplete
                    ? 'bg-blue-500/55'
                    : 'bg-white/[0.07]'
              }`}
              title={phase.label}
            />
          );
        })}
      </div>

      {/* Label row - phase names, current one highlighted */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-1.5 min-w-0">
          <span className="text-[10.5px] font-bold uppercase tracking-[0.14em] text-blue-300/90 truncate">
            {active?.label || 'Lesson'}
          </span>
          <span className="text-[10.5px] text-white/30">
            · Phase {Math.max(1, currentIdx + 1)} of {LESSON_PHASES.length}
          </span>
        </div>
        <div className="hidden sm:flex items-center gap-2 text-[10.5px] text-white/30">
          {LESSON_PHASES.map((phase, i) => (
            <span
              key={phase.key}
              className={
                i === currentIdx
                  ? 'text-white/85 font-medium'
                  : i < currentIdx
                    ? 'text-blue-300/60'
                    : 'text-white/25'
              }
            >
              {phase.label}
            </span>
          )).reduce((acc, el, i) => acc.length ? [...acc, <span key={`s${i}`} className="text-white/15">›</span>, el] : [el], [])}
        </div>
      </div>
    </div>
  );
}
