import { ArrowLeft, Moon, Sun, BookOpen } from 'lucide-react';
import { useUIPreference } from '../../context/UIPreferenceContext';

export default function MobileHeader({ title, onBack }) {
  const { theme, setTheme } = useUIPreference();
  const dark = theme === 'dark';

  return (
    <header className="sticky top-0 z-40 flex items-center h-12 px-4 bg-white/80 dark:bg-[#161622]/80 backdrop-blur-xl border-b border-gray-200 dark:border-[#2A2A40]">
      {onBack ? (
        <button onClick={onBack} className="p-1.5 -ml-1 rounded-lg text-gray-500 dark:text-gray-400 active:bg-gray-100 dark:active:bg-[#1e1e2e]">
          <ArrowLeft size={20} />
        </button>
      ) : (
        <div className="flex items-center gap-2">
          <div className="w-6 h-6 rounded-md bg-blue-600 flex items-center justify-center">
            <BookOpen size={14} className="text-white" />
          </div>
        </div>
      )}
      <h1 className="flex-1 text-center text-sm font-semibold text-gray-900 dark:text-white truncate px-2">{title}</h1>
      <button onClick={() => setTheme(dark ? 'light' : 'dark')} className="p-1.5 -mr-1 rounded-lg text-gray-500 dark:text-gray-400 active:bg-gray-100 dark:active:bg-[#1e1e2e]">
        {dark ? <Sun size={18} /> : <Moon size={18} />}
      </button>
    </header>
  );
}
