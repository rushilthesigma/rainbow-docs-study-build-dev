import { useCallback, useEffect, useState } from 'react';
import {
  AlertCircle, BookOpen, FileText, Globe, Lightbulb, MessageSquare,
  Scale, Settings, Shield, X, Zap,
} from 'lucide-react';
import { useAuth } from '../../context/AuthContext';
import { checkAdmin } from '../../api/admin';
import { listCurricula } from '../../api/curriculum';
import { listLessons } from '../../api/lessons';
import Skeleton from '../shared/Skeleton';

// Mobile home: greeting + Continue card + the complete app tile grid.
// Stats / recent-lessons sections were intentionally cut - the home
// screen is meant to be a single decision: "what do I do right now."
export default function MobileHome({ onNavigate }) {
  const { user } = useAuth();
  const [curricula, setCurricula] = useState([]);
  const [lessons, setLessons] = useState([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState(false);
  const [isAdmin, setIsAdmin] = useState(false);
  const [showDesktopNotice, setShowDesktopNotice] = useState(true);

  const loadProgress = useCallback(async (signal) => {
    setLoading(true);
    setLoadError(false);
    const [curriculaResult, lessonsResult] = await Promise.allSettled([
      listCurricula(),
      listLessons(),
    ]);
    if (signal?.aborted) return;
    if (curriculaResult.status === 'fulfilled') {
      setCurricula(curriculaResult.value.curricula || []);
    }
    if (lessonsResult.status === 'fulfilled') {
      setLessons(lessonsResult.value.lessons || []);
    }
    setLoadError(curriculaResult.status === 'rejected' || lessonsResult.status === 'rejected');
    setLoading(false);
  }, []);

  useEffect(() => {
    const controller = new AbortController();
    loadProgress(controller.signal);
    return () => controller.abort();
  }, [loadProgress]);

  useEffect(() => {
    let active = true;
    checkAdmin()
      .then((result) => { if (active) setIsAdmin(!!result.isAdmin); })
      .catch(() => {});
    return () => { active = false; };
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
        {showDesktopNotice && (
          <div className="mt-3 flex items-center gap-3 rounded-xl bg-red-600 px-3.5 py-3 text-white" role="status">
            <p className="min-w-0 flex-1 text-[12px] font-semibold leading-snug">RushilAI is much better on desktop.</p>
            <button
              type="button"
              onClick={() => setShowDesktopNotice(false)}
              className="-mr-1 flex h-8 w-8 shrink-0 items-center justify-center rounded-lg text-white/90 transition-colors hover:bg-black/15 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/80"
              aria-label="Dismiss desktop recommendation"
            >
              <X size={16} />
            </button>
          </div>
        )}
      </div>

      {/* Continue card - only shown when there's actual progress to resume */}
      {loading && (
        <div className="h-[126px] rounded-2xl border border-gray-200 dark:border-white/[0.06] bg-white dark:bg-[#13131f] p-4 mb-5 space-y-4" aria-label="Loading your progress">
          <Skeleton w="42%" h={10} className="bg-gray-200 dark:bg-white/[0.06]" />
          <Skeleton w="74%" h={16} className="bg-gray-200 dark:bg-white/[0.06]" />
          <Skeleton w="100%" h={6} className="bg-gray-200 dark:bg-white/[0.06]" />
        </div>
      )}
      {continueCard && !loading && (
        <button
          type="button"
          onClick={() => onNavigate(continueCard.kind === 'curriculum' ? 'curricula' : 'lessons')}
          className="w-full rounded-2xl bg-blue-500 text-white p-4 mb-5 active:scale-[0.99] motion-reduce:active:scale-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 focus-visible:ring-offset-2 dark:focus-visible:ring-offset-[#0a0a14] transition-transform text-left"
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

      {loadError && !loading && (
        <div className="flex items-center gap-3 rounded-2xl border border-amber-300/70 dark:border-amber-400/20 bg-amber-50 dark:bg-amber-400/[0.07] px-3.5 py-3 mb-5" role="status">
          <AlertCircle size={18} className="shrink-0 text-amber-600 dark:text-amber-300" />
          <p className="min-w-0 flex-1 text-[12px] leading-snug text-amber-900/75 dark:text-amber-100/65">Your progress could not fully refresh.</p>
          <button type="button" onClick={() => loadProgress()} className="min-h-11 px-2 text-[12px] font-bold text-amber-700 dark:text-amber-200 rounded-lg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber-500/60">Retry</button>
        </div>
      )}

      {/* Quick actions - bigger tiles, icon + title only, no subtext */}
      <div className="grid grid-cols-2 gap-3">
        <Action tone="blue"     icon={<BookOpen size={28} />}      title="Build a course" onClick={() => onNavigate('curricula')} />
        <Action tone="amber"    icon={<Lightbulb size={28} />}     title="Quick lesson"   onClick={() => onNavigate('lessons')} />
        <Action tone="blue"     icon={<Scale size={28} />}          title="Debate"         onClick={() => onNavigate('debate')} />
        <Action tone="violet"   icon={<Globe size={28} />}          title="QBpedia"        onClick={() => onNavigate('qbpedia')} />
        <Action tone="orange"   icon={<Zap size={28} />}           title="Quiz Bowl"      onClick={() => onNavigate('quizbowl')} />
        <Action tone="sky"      icon={<MessageSquare size={28} />} title="Study chat"     onClick={() => onNavigate('study')} />
        <Action tone="emerald"  icon={<FileText size={28} />}      title="Notes"          onClick={() => onNavigate('notes')} />
        <Action tone="gray"     icon={<Settings size={28} />}      title="Settings"       onClick={() => onNavigate('settings')} />
        {isAdmin && <Action tone="red" icon={<Shield size={28} />} title="Admin" onClick={() => onNavigate('admin')} />}
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
  indigo:  'text-indigo-500  bg-indigo-100/70 dark:bg-indigo-500/15',
  rose:    'text-rose-500    bg-rose-100/70 dark:bg-rose-500/15',
  gray:    'text-gray-500    bg-gray-200/70 dark:bg-white/[0.06]',
  red:     'text-red-500     bg-red-100/70 dark:bg-red-500/15',
};

function Action({ tone, icon, title, onClick }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="aspect-square rounded-3xl border border-gray-200 dark:border-white/[0.06] bg-white dark:bg-[#13131f] p-4 flex flex-col items-start justify-between active:scale-[0.97] motion-reduce:active:scale-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500/60 transition-transform text-left"
    >
      <div className={`w-14 h-14 rounded-2xl grid place-items-center ${TONE[tone]}`}>
        {icon}
      </div>
      <p className="text-[16px] font-bold text-gray-900 dark:text-white tracking-tight leading-tight">{title}</p>
    </button>
  );
}
