import {
  BookOpen, Calculator, PenTool, FileText, ClipboardCheck, Lock, Check, Trophy, Sparkles,
} from 'lucide-react';

// =========================================================
// Trail view (BETA) — gamifies a curriculum as a zigzag learning path,
// Duolingo-style. Lessons become circular nodes connected by curved
// SVG segments. Completed nodes: emerald + check. Current: blue with
// pulsing ring. Future: gray ring. Click any unlocked node to open
// the lesson via the existing curriculum onOpenLesson handler.
// =========================================================

const TYPE_ICON = {
  lesson: BookOpen,
  math_tutor: Calculator,
  practice: PenTool,
  essay: FileText,
  unit_test: ClipboardCheck,
};
const TYPE_LABEL = {
  lesson: 'Lesson',
  math_tutor: 'Drill',
  practice: 'Practice',
  essay: 'Essay',
  unit_test: 'Assessment',
};

// Zig-zag horizontal offset per node — alternates left / center / right.
const X_OFFSETS = [-90, -45, 0, 45, 90, 45, 0, -45]; // 8-step cycle
const NODE_SPACING = 110; // vertical px between nodes

export default function TrailView({ curriculum, onOpenLesson }) {
  // Flatten the curriculum into a single ordered list with unit headers
  // mixed in. Each entry is either { kind: 'header', unit } or
  // { kind: 'node', unit, lesson, idx, total }.
  const items = [];
  let nodeIdx = 0;
  for (const unit of (curriculum.units || [])) {
    items.push({ kind: 'header', unit });
    for (const lesson of (unit.lessons || [])) {
      items.push({ kind: 'node', unit, lesson, idx: nodeIdx });
      nodeIdx++;
    }
  }
  const totalNodes = nodeIdx;
  const completedCount = (curriculum.units || []).reduce(
    (n, u) => n + (u.lessons || []).filter(l => l.isCompleted).length, 0
  );

  // Find the "current" lesson — first incomplete node that has chat history,
  // or the first incomplete node if none have been started.
  let currentNodeIdx = -1;
  let firstIncompleteIdx = -1;
  let i = 0;
  for (const unit of (curriculum.units || [])) {
    for (const lesson of (unit.lessons || [])) {
      if (!lesson.isCompleted) {
        if (firstIncompleteIdx < 0) firstIncompleteIdx = i;
        if ((lesson.chatHistory || []).length > 0 && currentNodeIdx < 0) currentNodeIdx = i;
      }
      i++;
    }
  }
  if (currentNodeIdx < 0) currentNodeIdx = firstIncompleteIdx;

  return (
    <div className="relative">
      {/* Top banner — progress summary */}
      <div className="relative mb-6 rounded-2xl overflow-hidden border border-white/[0.08] bg-white/[0.04] p-4">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-emerald-500 flex items-center justify-center text-white shadow-sm">
            <Sparkles size={18} />
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-[10px] font-bold uppercase tracking-[0.18em] text-emerald-600 dark:text-emerald-400">Trail · BETA</p>
            <p className="text-sm font-bold text-gray-900 dark:text-white truncate">{curriculum.title}</p>
            <p className="text-[11px] text-gray-500 dark:text-gray-400 tabular-nums">
              {completedCount} of {totalNodes} stops cleared
              {totalNodes > 0 && ` · ${Math.round((completedCount / totalNodes) * 100)}%`}
            </p>
          </div>
          <Trophy size={20} className={completedCount === totalNodes && totalNodes > 0 ? 'text-amber-500' : 'text-gray-300 dark:text-gray-600'} />
        </div>
        {/* Mini progress bar */}
        <div className="mt-3 h-1.5 rounded-full bg-emerald-100 dark:bg-emerald-900/40 overflow-hidden">
          <div
            className="h-full bg-emerald-500 transition-all duration-500"
            style={{ width: totalNodes > 0 ? `${(completedCount / totalNodes) * 100}%` : '0%' }}
          />
        </div>
      </div>

      {/* The trail itself */}
      <div className="relative max-w-md mx-auto px-2 pt-2 pb-10">
        {items.map((item, ii) => {
          if (item.kind === 'header') {
            return <UnitHeader key={`h-${ii}`} unit={item.unit} />;
          }
          const { lesson, idx } = item;
          const x = X_OFFSETS[idx % X_OFFSETS.length];
          const isCompleted = !!lesson.isCompleted;
          const isCurrent = idx === currentNodeIdx;
          const hasStarted = (lesson.chatHistory || []).length > 0;
          const prev = items.slice(0, ii).filter(it => it.kind === 'node').pop();
          const prevX = prev ? X_OFFSETS[prev.idx % X_OFFSETS.length] : x;

          return (
            <TrailNode
              key={lesson.id}
              lesson={lesson}
              x={x}
              prevX={prevX}
              isCompleted={isCompleted}
              isCurrent={isCurrent}
              hasStarted={hasStarted}
              onOpen={() => onOpenLesson(lesson)}
            />
          );
        })}

        {/* Finish flag */}
        {totalNodes > 0 && (
          <div className="flex justify-center mt-2">
            <div className={`flex items-center gap-1.5 px-3 py-1.5 rounded-full text-[11px] font-bold uppercase tracking-wider ${completedCount === totalNodes ? 'bg-amber-100 dark:bg-amber-900/30 text-amber-700 dark:text-amber-300' : 'bg-gray-100 dark:bg-[#1e1e2e] text-gray-400 dark:text-gray-500'}`}>
              <Trophy size={12} /> {completedCount === totalNodes ? 'Course mastered' : 'Finish line'}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

function UnitHeader({ unit }) {
  return (
    <div className="relative flex justify-center my-6 first:mt-0">
      <div className="relative px-3 py-1 bg-white dark:bg-[#0D0D14] z-10">
        <p className="text-[10px] font-bold uppercase tracking-[0.18em] text-white/60">
          {unit.title}
        </p>
      </div>
      {/* Decorative dashed divider */}
      <div className="absolute inset-x-0 top-1/2 -translate-y-1/2 h-px border-t border-dashed border-gray-300 dark:border-[#2A2A40]" />
    </div>
  );
}

function TrailNode({ lesson, x, prevX, isCompleted, isCurrent, hasStarted, onOpen }) {
  const Icon = TYPE_ICON[lesson.type] || BookOpen;
  const isMilestone = lesson.type === 'unit_test' || lesson.type === 'essay';

  // Color tokens
  let ring, fill, text, badgeBg;
  if (isCompleted) {
    ring = 'ring-emerald-500/0';
    fill = 'bg-emerald-500';
    text = 'text-white';
    badgeBg = 'bg-emerald-100 dark:bg-emerald-900/40 text-emerald-700 dark:text-emerald-300';
  } else if (isCurrent) {
    ring = 'ring-white/40';
    fill = 'bg-white/20';
    text = 'text-white';
    badgeBg = 'bg-white/10 text-white/70';
  } else if (hasStarted) {
    ring = 'ring-amber-400';
    fill = 'bg-amber-100 dark:bg-amber-900/40';
    text = 'text-amber-700 dark:text-amber-300';
    badgeBg = 'bg-amber-100 dark:bg-amber-900/40 text-amber-700 dark:text-amber-300';
  } else {
    ring = 'ring-gray-300 dark:ring-[#2A2A40]';
    fill = 'bg-gray-100 dark:bg-[#1e1e2e]';
    text = 'text-gray-400';
    badgeBg = 'bg-gray-100 dark:bg-[#1e1e2e] text-gray-400';
  }

  const size = isMilestone ? 76 : 60;
  const dx = x - prevX;

  return (
    <div className="relative flex flex-col items-center" style={{ marginTop: NODE_SPACING - size / 2 }}>
      {/* Connector to previous node — a curved SVG segment */}
      <svg
        className="absolute pointer-events-none"
        width={Math.abs(dx) + 20}
        height={NODE_SPACING}
        style={{
          left: `calc(50% + ${Math.min(x, prevX) - 10}px)`,
          top: -(NODE_SPACING - size / 2),
        }}
      >
        <path
          d={`M ${dx >= 0 ? 10 : Math.abs(dx) + 10} 0 Q ${(Math.abs(dx) + 20) / 2} ${NODE_SPACING / 2} ${dx >= 0 ? Math.abs(dx) + 10 : 10} ${NODE_SPACING}`}
          fill="none"
          stroke={isCompleted ? 'rgb(16 185 129)' : 'rgba(156,163,175,0.35)'}
          strokeWidth="3"
          strokeLinecap="round"
          strokeDasharray={isCompleted ? 'none' : '4 4'}
        />
      </svg>

      {/* Node button */}
      <button
        onClick={onOpen}
        title={lesson.title}
        style={{ transform: `translateX(${x}px)`, width: size, height: size }}
        className={`relative rounded-full ${fill} ${text} flex items-center justify-center transition-all hover:scale-105 ring-4 ${ring} ${isCurrent ? 'shadow-lg shadow-white/10' : 'shadow-md'}`}
      >
        {isCurrent && (
          <span className="absolute inset-0 rounded-full ring-4 ring-white/30 animate-ping opacity-50" />
        )}
        {isCompleted ? (
          <Check size={isMilestone ? 32 : 24} strokeWidth={3} />
        ) : (
          <Icon size={isMilestone ? 28 : 22} />
        )}
        {isMilestone && !isCompleted && (
          <span className="absolute -top-1 -right-1 w-5 h-5 rounded-full bg-rose-500 text-white flex items-center justify-center text-[9px] font-bold border-2 border-white dark:border-[#0D0D14]">
            !
          </span>
        )}
      </button>

      {/* Label */}
      <button
        onClick={onOpen}
        style={{ transform: `translateX(${x}px)` }}
        className="mt-1.5 max-w-[180px] text-center"
      >
        <p className={`text-[11px] font-semibold leading-tight ${isCompleted ? 'text-gray-400 line-through' : isCurrent ? 'text-white/90' : 'text-gray-700 dark:text-gray-200'} truncate`}>
          {lesson.title}
        </p>
        <span className={`inline-block mt-0.5 px-1.5 py-0.5 rounded text-[9px] font-bold uppercase tracking-wider ${badgeBg}`}>
          {TYPE_LABEL[lesson.type] || 'Lesson'}
        </span>
      </button>
    </div>
  );
}
