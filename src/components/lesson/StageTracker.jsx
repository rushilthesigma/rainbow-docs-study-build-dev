import { BookOpen, ListChecks, Check, Repeat, Trophy } from 'lucide-react';

export default function StageTracker({ blocks = [], activeIdx = 0, onJump }) {
  const total = blocks.length || 8;
  const completed = blocks.filter((b) => b?.completedAt).length;

  const active = blocks[activeIdx];
  const isReading = active?.type === 'reading';
  const isSrs = !!active?.srs;
  const isFinal = !!active?.isFinal;
  const stageNum = Math.floor(activeIdx / 2) + 1;
  const stageName = isFinal
    ? 'Final Quiz'
    : isReading
      ? `Reading ${stageNum}${isSrs ? ' · SRS' : ''}`
      : `Quiz ${stageNum}`;

  return (
    <div className="mb-8">
      {/* Segmented progress bars — one per stage, clickable */}
      <div className="flex gap-1 mb-3">
        {blocks.map((b, i) => {
          const done = !!b.completedAt;
          const isCurrent = i === activeIdx;
          const title = b.title || (b.type === 'reading'
            ? `Reading ${Math.floor(i / 2) + 1}`
            : b.isFinal ? 'Final Quiz' : `Quiz ${Math.floor(i / 2) + 1}`);
          return (
            <button
              key={b.id || i}
              onClick={() => onJump?.(i)}
              title={title}
              className={`flex-1 h-1 rounded-full transition-all duration-200 ${
                isCurrent
                  ? 'bg-white'
                  : done
                    ? 'bg-white/45'
                    : 'bg-white/[0.10] hover:bg-white/[0.20]'
              }`}
            />
          );
        })}
      </div>

      {/* Stage label row */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          {isFinal ? (
            <Trophy size={12} className="text-white/45" />
          ) : isReading ? (
            isSrs ? <Repeat size={12} className="text-white/45" /> : <BookOpen size={12} className="text-white/45" />
          ) : (
            <ListChecks size={12} className="text-white/45" />
          )}
          <span className="text-[12px] font-semibold text-white/65">{stageName}</span>
          {active?.title && (
            <span className="text-[11px] text-white/30 hidden sm:inline">— {active.title}</span>
          )}
        </div>
        <span className="text-[11px] font-mono text-white/30 tabular-nums">{completed}/{total}</span>
      </div>
    </div>
  );
}
