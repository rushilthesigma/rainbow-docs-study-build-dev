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
                  ? 'bg-gradient-to-r from-blue-400 to-blue-500 shadow-[0_0_8px_rgba(96,165,250,0.55)]'
                  : done
                    ? 'bg-blue-500/55'
                    : 'bg-blue-400/[0.12] hover:bg-blue-400/[0.28]'
              }`}
            />
          );
        })}
      </div>

      {/* Stage label row */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2 min-w-0">
          {isFinal ? (
            <Trophy size={12} className="text-blue-300 flex-shrink-0" />
          ) : isReading ? (
            isSrs ? <Repeat size={12} className="text-blue-300 flex-shrink-0" /> : <BookOpen size={12} className="text-blue-300 flex-shrink-0" />
          ) : (
            <ListChecks size={12} className="text-blue-300 flex-shrink-0" />
          )}
          <span className="text-[12px] font-semibold text-white/75 flex-shrink-0">{stageName}</span>
          {(() => {
            // Strip the stage-name prefix from the block title if the
            // server already prepended it (e.g. stage="Reading 1",
            // title="Reading 1 — The Father of Modern Philosophy"
            // collapses to just "The Father of Modern Philosophy").
            const raw = (active?.title || '').trim();
            if (!raw) return null;
            const stripped = raw
              .replace(new RegExp(`^${stageName}\\s*[—\\-:·]\\s*`, 'i'), '')
              .replace(/^(Reading|Quiz)\s+\d+\s*[—\-:·]\s*/i, '');
            const display = stripped || raw;
            if (display === stageName) return null;
            return (
              <span className="text-[11.5px] text-blue-200/55 truncate hidden sm:inline">
                · {display}
              </span>
            );
          })()}
        </div>
        <span className="text-[11px] font-mono text-blue-200/45 tabular-nums flex-shrink-0">{completed}/{total}</span>
      </div>
    </div>
  );
}
