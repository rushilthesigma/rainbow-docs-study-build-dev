import { Home, BookOpen, Lightbulb, FileText, Settings } from 'lucide-react';
import { useUIPreference } from '../../context/UIPreferenceContext';
import { zIndexStyle } from '../../styles/tokens';

// Five primary tabs. `More` is gone - secondary surfaces (Study,
// Quiz Bowl) are reachable from the Home tiles, and Settings lives
// here as its own tab.
const TABS = [
  { id: 'home',      label: 'Home',      icon: Home },
  { id: 'curricula', label: 'Courses',   icon: BookOpen },
  { id: 'lessons',   label: 'Lessons',   icon: Lightbulb },
  { id: 'notes',     label: 'Notes',     icon: FileText },
  { id: 'settings',  label: 'Settings',  icon: Settings },
];

// Glassy tab bar with a sliding pill behind the active tab. Sits
// ABOVE the BrowserControls row at the bottom of the screen - the
// `bottom` offset accounts for the controls height (32) + the iOS
// home-indicator inset.
export default function BottomTabs({ active, onSelect }) {
  const { bottomBarTransparent } = useUIPreference();
  return (
    <nav
      className={`fixed left-0 right-0 border-t border-gray-200/70 dark:border-white/[0.06] ${
        bottomBarTransparent
          ? 'bg-white/85 dark:bg-[#0c0c16]/85 backdrop-blur-xl'
          : 'bg-white dark:bg-[#0c0c16]'
      }`}
      style={{ ...zIndexStyle.dock, bottom: 'calc(32px + env(safe-area-inset-bottom, 0px))' }}
    >
      <div className="relative flex items-stretch h-[58px] px-2">
        {TABS.map((tab) => {
          const Icon = tab.icon;
          const isActive = active === tab.id;
          return (
            <button
              key={tab.id}
              type="button"
              onClick={() => onSelect(tab.id)}
              aria-label={tab.label}
              aria-current={isActive ? 'page' : undefined}
              className="group relative flex-1 flex flex-col items-center justify-center gap-0.5 active:scale-[0.94] motion-reduce:active:scale-100 transition-transform select-none focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-blue-500/60 rounded-lg"
            >
              {/* Active indicator: thin top accent bar (Apple-style) - instantly
                  legible at a glance and works without a colored background. */}
              <span
                className={`absolute top-0 left-1/2 -translate-x-1/2 h-[3px] rounded-b-full transition-all duration-200 ${
                  isActive ? 'w-8 bg-blue-500 dark:bg-blue-400 opacity-100' : 'w-0 opacity-0'
                }`}
              />
              {/* Soft pill behind the icon */}
              <span
                className={`absolute top-2 w-11 h-9 rounded-2xl transition-all duration-200 ${
                  isActive
                    ? 'bg-blue-500/12 dark:bg-blue-400/15 scale-100 opacity-100'
                    : 'scale-90 opacity-0'
                }`}
              />
              <Icon
                size={22}
                strokeWidth={isActive ? 2.4 : 1.9}
                className={`relative transition-all ${
                  isActive
                    ? 'text-blue-600 dark:text-blue-300 scale-[1.05]'
                    : 'text-gray-500 dark:text-gray-400 group-hover:text-gray-700 dark:group-hover:text-gray-200'
                }`}
              />
              <span
                className={`relative text-[10px] font-semibold tracking-tight transition-colors ${
                  isActive
                    ? 'text-blue-600 dark:text-blue-300'
                    : 'text-gray-500 dark:text-gray-400'
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
