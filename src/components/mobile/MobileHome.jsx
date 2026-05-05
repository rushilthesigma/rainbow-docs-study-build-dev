import { useEffect, useState } from 'react';
import {
  BookOpen, Lightbulb, MessageSquare, Zap, FileText, Settings,
} from 'lucide-react';
import { useAuth } from '../../context/AuthContext';
import { listCurricula } from '../../api/curriculum';
import { listLessons } from '../../api/lessons';

// Mobile home: greeting + Continue card + a 6-tile quick-actions grid.
// Stats / recent-lessons sections were intentionally cut — the home
// screen is meant to be a single decision: "what do I do right now."
export default function MobileHome({ onNavigate }) {
  const { user } = useAuth();
  const [curricula, setCurricula] = useState([]);
  const [lessons, setLessons] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    Promise.all([
      listCurricula().catch(() => ({ curricula: [] })),
      listLessons().catch(() => ({ lessons: [] })),
    ]).then(([c, l]) => {
      if (cancelled) return;
      setCurricula(c.curricula || []);
      setLessons(l.lessons || []);
      setLoading(false);
    });
    return () => { cancelled = true; };
  }, []);

  const firstName = (user?.name || user?.email || 'there').split(/[\s@]/)[0];
  const continueCard = pickContinueCard(curricula, lessons);

  return (
    <div className="px-4 pt-5 pb-8">
      {/* Greeting */}
      <div className="mb-5">
        <p className="text-[12px] uppercase tracking-[0.16em] font-bold text-blue-500 dark:text-blue-300 mb-1">
          {greetingForHour()}
        </p>
        <h1 className="text-[28px] font-bold tracking-[-0.02em] text-gray-900 dark:text-white leading-tight">
          Hi, {firstName}.
        </h1>
      </div>

      {/* Continue card — only shown when there's actual progress to resume */}
      {continueCard && !loading && (
        <button
          onClick={() => onNavigate(continueCard.kind === 'curriculum' ? 'curricula' : 'lessons')}
          className="w-full rounded-2xl bg-gradient-to-br from-blue-500 to-indigo-600 text-white p-4 mb-5 active:scale-[0.99] transition-transform text-left"
        >
          <div className="flex items-center gap-2 mb-2">
            <span className="text-[10px] uppercase tracking-[0.18em] font-bold opacity-90">Continue</span>
            <span className="text-[10px] opacity-80 truncate">
              {continueCard.kind === 'curriculum' ? continueCard.courseTitle : 'Lesson'}
            </span>
          </div>
          <p className="text-[15px] font-bold tracking-tight mb-1 line-clamp-2">{continueCard.lessonTitle}</p>
          {continueCard.progress != null && (
            <div className="flex items-center gap-2 mt-3">
              <div className="flex-1 h-1.5 rounded-full bg-white/25 overflow-hidden">
                <div className="h-full bg-white rounded-full transition-all" style={{ width: `${continueCard.progress}%` }} />
              </div>
              <span className="text-[10px] font-mono opacity-90">{continueCard.progress}%</span>
            </div>
          )}
        </button>
      )}

      {/* Quick actions — bigger tiles, icon + title only, no subtext */}
      <div className="grid grid-cols-2 gap-3">
        <Action tone="blue"     icon={<BookOpen size={28} />}      title="Build a course" onClick={() => onNavigate('curricula')} />
        <Action tone="amber"    icon={<Lightbulb size={28} />}     title="Quick lesson"   onClick={() => onNavigate('lessons')} />
        <Action tone="orange"   icon={<Zap size={28} />}           title="Quiz Bowl"      onClick={() => onNavigate('quizbowl')} />
        <Action tone="sky"      icon={<MessageSquare size={28} />} title="Study chat"     onClick={() => onNavigate('study')} />
        <Action tone="emerald"  icon={<FileText size={28} />}      title="Notes"          onClick={() => onNavigate('notes')} />
        <Action tone="gray"     icon={<Settings size={28} />}      title="Settings"       onClick={() => onNavigate('settings')} />
      </div>
    </div>
  );
}

// ===== helpers =====

function greetingForHour() {
  const h = new Date().getHours();
  if (h < 5) return 'Late night';
  if (h < 12) return 'Good morning';
  if (h < 18) return 'Good afternoon';
  return 'Good evening';
}

function pickContinueCard(curricula, lessons) {
  // Most-recent in-progress curriculum lesson wins.
  for (const c of curricula) {
    for (const u of c.units || []) {
      for (const l of u.lessons || []) {
        if (l.isCompleted) continue;
        const blocks = l.blocks || [];
        const done = blocks.filter((b) => b.completedAt).length;
        if (done > 0) {
          const total = blocks.length || 8;
          return { kind: 'curriculum', courseTitle: c.title, lessonTitle: l.title, progress: Math.round((done / total) * 100) };
        }
      }
    }
  }
  const inProgress = lessons.find((l) => !l.isCompleted && (l.blocksDone ?? 0) > 0);
  if (inProgress) {
    const total = inProgress.blocksTotal || 8;
    return { kind: 'lesson', lessonTitle: inProgress.title, progress: Math.round((inProgress.blocksDone / total) * 100) };
  }
  return null;
}

// ===== Tile =====
//
// Big, clean, square-ish tile. Icon top-left in a tinted square,
// title at the bottom. No subtext, no progress, no clutter.
const TONE = {
  blue:    'text-blue-500    bg-blue-100/70 dark:bg-blue-500/15',
  amber:   'text-amber-500   bg-amber-100/70 dark:bg-amber-500/15',
  orange:  'text-orange-500  bg-orange-100/70 dark:bg-orange-500/15',
  emerald: 'text-emerald-500 bg-emerald-100/70 dark:bg-emerald-500/15',
  sky:     'text-sky-500     bg-sky-100/70 dark:bg-sky-500/15',
  violet:  'text-violet-500  bg-violet-100/70 dark:bg-violet-500/15',
  gray:    'text-gray-500    bg-gray-200/70 dark:bg-white/[0.06]',
};

function Action({ tone, icon, title, onClick }) {
  return (
    <button
      onClick={onClick}
      className="aspect-square rounded-3xl border border-gray-200 dark:border-white/[0.06] bg-white dark:bg-[#13131f] p-4 flex flex-col items-start justify-between active:scale-[0.97] transition-transform text-left"
    >
      <div className={`w-14 h-14 rounded-2xl grid place-items-center ${TONE[tone]}`}>
        {icon}
      </div>
      <p className="text-[16px] font-bold text-gray-900 dark:text-white tracking-tight leading-tight">{title}</p>
    </button>
  );
}
