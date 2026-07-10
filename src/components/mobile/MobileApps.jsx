import { useEffect, useState } from 'react';
import {
  BookOpen, Calculator, ChevronRight, FileText, Globe, LayoutGrid,
  Lightbulb, Scale, Settings, Shield, Zap,
} from 'lucide-react';
import { checkAdmin } from '../../api/admin';
import MobilePage from './MobilePage';

const APP_GROUPS = [
  {
    label: 'Learn',
    apps: [
      { id: 'curricula', label: 'Courses', description: 'Build and follow structured courses', icon: BookOpen, tone: 'blue' },
      { id: 'lessons', label: 'Lessons', description: 'Create a focused standalone lesson', icon: Lightbulb, tone: 'amber' },
      { id: 'mathtutor', label: 'Math Tutor', description: 'Work problems with a canvas and tutor', icon: Calculator, tone: 'indigo' },
      { id: 'debate', label: 'Debate', description: 'Solo, multiplayer, and tournaments', icon: Scale, tone: 'rose' },
      { id: 'quizbowl', label: 'Quiz Bowl', description: 'Practice tossups and play matches', icon: Zap, tone: 'orange' },
      { id: 'qbpedia', label: 'QBpedia', description: 'Search the quiz-bowl knowledge base', icon: Globe, tone: 'violet' },
    ],
  },
  {
    label: 'Organize',
    apps: [
      { id: 'notes', label: 'Notes', description: 'Write notes and explore note maps', icon: FileText, tone: 'emerald' },
      { id: 'widgets', label: 'Widgets', description: 'Manage clocks, tasks, timers, and more', icon: LayoutGrid, tone: 'indigo' },
      { id: 'settings', label: 'Settings', description: 'Appearance, account, and preferences', icon: Settings, tone: 'gray' },
    ],
  },
];

const TONES = {
  blue: 'bg-blue-500/12 text-blue-600 dark:text-blue-300',
  amber: 'bg-amber-500/12 text-amber-600 dark:text-amber-300',
  orange: 'bg-orange-500/12 text-orange-600 dark:text-orange-300',
  emerald: 'bg-emerald-500/12 text-emerald-600 dark:text-emerald-300',
  indigo: 'bg-indigo-500/12 text-indigo-600 dark:text-indigo-300',
  rose: 'bg-rose-500/12 text-rose-600 dark:text-rose-300',
  violet: 'bg-violet-500/12 text-violet-600 dark:text-violet-300',
  gray: 'bg-gray-500/10 text-gray-600 dark:text-gray-300',
  red: 'bg-red-500/12 text-red-600 dark:text-red-300',
};

export default function MobileApps({ onNavigate }) {
  const [isAdmin, setIsAdmin] = useState(false);

  useEffect(() => {
    let active = true;
    checkAdmin()
      .then((result) => { if (active) setIsAdmin(!!result.isAdmin); })
      .catch(() => {});
    return () => { active = false; };
  }, []);

  return (
    <MobilePage title="Apps" subtitle="Everything in RushilAI, in one place.">
      <div className="space-y-6">
        {APP_GROUPS.map((group) => (
          <section key={group.label} aria-labelledby={`mobile-apps-${group.label.toLowerCase()}`}>
            <h2 id={`mobile-apps-${group.label.toLowerCase()}`} className="mb-2 px-1 text-[11px] font-bold uppercase tracking-[0.16em] text-gray-400 dark:text-white/35">
              {group.label}
            </h2>
            <div className="overflow-hidden rounded-2xl border border-gray-200 bg-white divide-y divide-gray-100 dark:border-white/[0.07] dark:bg-[#13131f] dark:divide-white/[0.06]">
              {group.apps.map((app) => <AppRow key={app.id} app={app} onNavigate={onNavigate} />)}
            </div>
          </section>
        ))}

        {isAdmin && (
          <section aria-labelledby="mobile-apps-admin">
            <h2 id="mobile-apps-admin" className="mb-2 px-1 text-[11px] font-bold uppercase tracking-[0.16em] text-gray-400 dark:text-white/35">Administration</h2>
            <div className="overflow-hidden rounded-2xl border border-gray-200 bg-white dark:border-white/[0.07] dark:bg-[#13131f]">
              <AppRow app={{ id: 'admin', label: 'Admin', description: 'Users, analytics, reports, and referrals', icon: Shield, tone: 'red' }} onNavigate={onNavigate} />
            </div>
          </section>
        )}
      </div>
    </MobilePage>
  );
}

function AppRow({ app, onNavigate }) {
  const Icon = app.icon;
  return (
    <button
      type="button"
      onClick={() => onNavigate(app.id)}
      className="w-full min-h-[68px] flex items-center gap-3 px-3.5 py-3 text-left active:bg-gray-50 dark:active:bg-white/[0.04] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-blue-500/60 transition-colors"
    >
      <span className={`w-10 h-10 shrink-0 rounded-xl grid place-items-center ${TONES[app.tone]}`}>
        <Icon size={19} strokeWidth={2} />
      </span>
      <span className="min-w-0 flex-1">
        <span className="block text-[14px] font-semibold text-gray-900 dark:text-white/90">{app.label}</span>
        <span className="block truncate text-[11px] text-gray-500 dark:text-white/40">{app.description}</span>
      </span>
      <ChevronRight size={17} className="shrink-0 text-gray-300 dark:text-white/20" />
    </button>
  );
}
