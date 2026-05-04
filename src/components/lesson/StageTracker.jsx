import { BookOpen, ListChecks, Check, Repeat } from 'lucide-react';

// 8-stage indicator for the Claudius-style lesson:
//   R1  Q1  R2  Q2  R3 (SRS)  Q3  R4  FINAL QUIZ
// Pills are clickable so the user can jump back to any earlier stage.
export default function StageTracker({ blocks = [], activeIdx = 0, onJump }) {
  const total = blocks.length || 8;
  const completed = blocks.filter((b) => b?.completedAt).length;
  const pct = Math.round((completed / total) * 100);

  return (
    <div className="rounded-2xl border border-blue-500/15 bg-[#0f1124]/70 backdrop-blur p-3 mb-5">
      {/* `scrollbar-hide` kills the horizontal scrollbar that otherwise
          renders as a grey bar between the pills and the progress bar
          (especially on macOS with "always show scrollbars" enabled). */}
      <div className="flex items-center gap-1.5 overflow-x-auto scrollbar-hide">
        {blocks.map((b, i) => {
          const isReading = b.type === 'reading';
          const isSrs = !!b.srs;
          const isFinal = !!b.isFinal;
          const Icon = isSrs ? Repeat : isReading ? BookOpen : ListChecks;
          const done = !!b.completedAt;
          const active = i === activeIdx;
          const label = isFinal ? 'Final' : isReading
            ? `Reading ${Math.floor(i / 2) + 1}${isSrs ? ' · SRS' : ''}`
            : `Quiz ${Math.floor(i / 2) + 1}`;
          return (
            <div key={b.id || i} className="flex items-center shrink-0">
              <button
                onClick={() => onJump?.(i)}
                title={`${b.title || label}${b.type === 'quiz' && b.score != null ? ` · ${b.score}%` : ''}`}
                className={`flex items-center gap-2 px-3 py-1.5 rounded-full text-[12px] font-medium transition-all ${
                  active
                    ? 'bg-gradient-to-r from-blue-600 to-indigo-600 text-white shadow-lg shadow-blue-500/40'
                    : done
                      ? 'bg-blue-500/10 text-blue-200 border border-blue-500/30 hover:bg-blue-500/20'
                      : 'bg-[#161622] border border-[#2A2A40] text-gray-400 hover:border-blue-500/40 hover:text-blue-300'
                }`}
              >
                <span className={`w-5 h-5 rounded-full grid place-items-center shrink-0 ${
                  done && !active ? 'bg-blue-500 text-white' : active ? 'bg-white/25 text-white' : 'bg-[#0d0d14] text-gray-500'
                }`}>
                  {done && !active ? <Check size={11} /> : <Icon size={10} />}
                </span>
                <span className="whitespace-nowrap">{label}</span>
              </button>
              {i < blocks.length - 1 && (
                <div className={`w-3 h-0.5 mx-0.5 ${blocks[i].completedAt ? 'bg-blue-500' : 'bg-[#2A2A40]'}`} />
              )}
            </div>
          );
        })}
      </div>
      <div className="mt-2.5 flex items-center gap-2.5">
        <div className="flex-1 h-1 rounded-full bg-white/5 overflow-hidden">
          <div
            className="h-full bg-gradient-to-r from-blue-500 to-indigo-500 rounded-full transition-all duration-300"
            style={{ width: `${pct}%` }}
          />
        </div>
        <span className="text-[10px] font-mono text-gray-500 tabular-nums shrink-0">{completed}/{total} · {pct}%</span>
      </div>
    </div>
  );
}
