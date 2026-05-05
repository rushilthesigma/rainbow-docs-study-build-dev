import { Home, BookOpen, Lightbulb, FileText, MoreHorizontal } from 'lucide-react';

const TABS = [
  { id: 'home',      label: 'Home',      icon: Home },
  { id: 'curricula', label: 'Courses',   icon: BookOpen },
  { id: 'lessons',   label: 'Lessons',   icon: Lightbulb },
  { id: 'notes',     label: 'Notes',     icon: FileText },
  { id: 'more',      label: 'More',      icon: MoreHorizontal },
];

// Glassy bottom tab bar with a sliding pill behind the active tab.
// 5 tabs, all the same width. Honors the iOS home-indicator inset.
export default function BottomTabs({ active, onSelect }) {
  return (
    <nav
      className="fixed bottom-0 left-0 right-0 z-30 bg-white/85 dark:bg-[#0c0c16]/85 backdrop-blur-xl border-t border-gray-200/70 dark:border-white/[0.06]"
      style={{ paddingBottom: 'env(safe-area-inset-bottom, 0px)' }}
    >
      <div className="relative flex items-stretch h-[58px] px-2">
        {TABS.map((tab) => {
          const Icon = tab.icon;
          const isActive = active === tab.id;
          return (
            <button
              key={tab.id}
              onClick={() => onSelect(tab.id)}
              aria-label={tab.label}
              aria-current={isActive ? 'page' : undefined}
              className="group relative flex-1 flex flex-col items-center justify-center gap-0.5 active:scale-[0.96] transition-transform"
            >
              {/* Pill behind the active icon */}
              <span
                className={`absolute top-1 w-12 h-9 rounded-2xl transition-all duration-200 ${
                  isActive
                    ? 'bg-blue-500/15 dark:bg-blue-400/20 scale-100 opacity-100'
                    : 'scale-90 opacity-0'
                }`}
              />
              <Icon
                size={21}
                strokeWidth={isActive ? 2.3 : 1.8}
                className={`relative transition-colors ${
                  isActive
                    ? 'text-blue-600 dark:text-blue-300'
                    : 'text-gray-500 dark:text-gray-500 group-hover:text-gray-700 dark:group-hover:text-gray-300'
                }`}
              />
              <span
                className={`relative text-[10px] font-semibold tracking-tight transition-colors ${
                  isActive
                    ? 'text-blue-600 dark:text-blue-300'
                    : 'text-gray-500 dark:text-gray-500'
                }`}
              >
                {tab.label}
              </span>
            </button>
          );
        })}
      </div>
    </nav>
  );
}
