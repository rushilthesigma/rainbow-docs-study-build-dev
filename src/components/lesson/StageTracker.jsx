import { BookOpen, ListChecks, Trophy, Sparkles, Globe, Flame, ClipboardList, PenTool } from 'lucide-react';

// Maps a block's `type` to the label + icon shown in the stage tracker
// chip. Reading + quiz keep the original wording; the new variety
// types surface with their own labels so the student knows what's
// coming.
const TYPE_LABELS = {
  reading:     'Reading',
  quiz:        'Quiz',
  example:     'Worked Example',
  recap:       'Recap',
  application: 'In the Wild',
  challenge:   'Challenge',
  open:        'Open Answer',
};
const TYPE_ICONS = {
  reading:     BookOpen,
  quiz:        ListChecks,
  example:     Sparkles,
  recap:       ClipboardList,
  application: Globe,
  challenge:   Flame,
  open:        PenTool,
};

export default function StageTracker({ blocks = [], activeIdx = 0, onJump }) {
  const total = blocks.length || 8;
  const completed = blocks.filter((b) => b?.completedAt).length;

  const active = blocks[activeIdx];
  const isFinal = !!active?.isFinal;
  const Icon = isFinal ? Trophy : (TYPE_ICONS[active?.type] || BookOpen);
  const stageName = isFinal
    ? 'Final Quiz'
    : (TYPE_LABELS[active?.type] || 'Step');

  return (
    <div className="mb-8">
      {/* Segmented progress bars - one per stage, clickable */}
      <div className="flex gap-1 mb-3">
        {blocks.map((b, i) => {
          const done = !!b.completedAt;
          const isCurrent = i === activeIdx;
          const title = b.title || (b.isFinal ? 'Final Quiz' : (TYPE_LABELS[b.type] || `Step ${i + 1}`));
          return (
            <button
              key={b.id || i}
              onClick={() => onJump?.(i)}
              title={title}
              className={`flex-1 h-1 rounded-full transition-all duration-200 ${
                isCurrent
                  ? 'bg-gradient-to-r from-blue-400 to-blue-500'
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
          <Icon size={12} className="text-blue-300 flex-shrink-0" />
          <span className="text-[12px] font-semibold text-white/75 flex-shrink-0">{stageName}</span>
          {(() => {
            // Strip the stage-name prefix from the block title if the
            // server already prepended it (e.g. label="Reading",
            // title="Reading 1 - The Father of Modern Philosophy"
            // collapses to just "The Father of Modern Philosophy").
            const raw = (active?.title || '').trim();
            if (!raw) return null;
            const stripped = raw
              .replace(new RegExp(`^${stageName}\\s*[-\\-:·]\\s*`, 'i'), '')
              .replace(/^(Reading|Quiz|Example|Recap|Application|Challenge)\s+\d*\s*[-\-:·]\s*/i, '');
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
