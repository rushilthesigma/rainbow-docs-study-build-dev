import { ArrowLeft, BookOpen, Moon, Sun } from 'lucide-react';
import { useUIPreference } from '../../context/UIPreferenceContext';

// Compact iOS-style header. 48px tall, frosted glass, hairline border.
// Brand mark on the left when no back button is needed; theme toggle
// always pinned right.
export default function MobileHeader({ title, onBack, rightSlot }) {
  const { theme, setTheme } = useUIPreference();
  const dark = theme === 'dark';
  return (
    <header className="sticky top-0 z-30 flex items-center h-12 px-3 bg-white/85 dark:bg-[#0c0c16]/85 backdrop-blur-xl border-b border-gray-200/70 dark:border-white/[0.06]">
      {onBack ? (
        <button
          onClick={onBack}
          aria-label="Back"
          className="w-9 h-9 -ml-1 rounded-full grid place-items-center text-gray-600 dark:text-gray-300 active:bg-gray-100 dark:active:bg-white/[0.06] transition-colors"
        >
          <ArrowLeft size={19} />
        </button>
      ) : (
        <div className="flex items-center gap-2 pl-1">
          <div className="w-7 h-7 rounded-lg bg-gradient-to-br from-blue-500 to-indigo-600 grid place-items-center">
            <BookOpen size={14} className="text-white" strokeWidth={2.4} />
          </div>
        </div>
      )}
      <h1 className="flex-1 text-center text-[15px] font-semibold text-gray-900 dark:text-white truncate px-2 tracking-tight">{title}</h1>
      <div className="flex items-center gap-1">
        {rightSlot}
        <button
          onClick={() => setTheme(dark ? 'light' : 'dark')}
          aria-label="Toggle theme"
          className="w-9 h-9 -mr-1 rounded-full grid place-items-center text-gray-600 dark:text-gray-300 active:bg-gray-100 dark:active:bg-white/[0.06] transition-colors"
        >
          {dark ? <Sun size={17} /> : <Moon size={17} />}
        </button>
      </div>
    </header>
  );
}
