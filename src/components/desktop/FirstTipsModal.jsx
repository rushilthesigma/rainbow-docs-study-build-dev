import { useEffect, useState } from 'react';
import { BookOpen, X } from 'lucide-react';

const STORAGE_KEY = 'covalent-first-tips-seen-v1';

// Shown once, the first time a user lands on the desktop after onboarding.
// Subsequent sessions skip it. Clearing localStorage will show it again.
export default function FirstTipsModal() {
  const [open, setOpen] = useState(false);

  useEffect(() => {
    try {
      if (!localStorage.getItem(STORAGE_KEY)) setOpen(true);
    } catch {}
  }, []);

  function dismiss() {
    try { localStorage.setItem(STORAGE_KEY, '1'); } catch {}
    setOpen(false);
  }

  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-[9999] flex items-center justify-center bg-black/50 backdrop-blur-sm px-4"
      onClick={dismiss}
    >
      <div
        onClick={e => e.stopPropagation()}
        className="relative w-full max-w-sm rounded-2xl bg-white dark:bg-[#161622] border border-gray-200 dark:border-[#2A2A40] shadow-2xl p-6"
      >
        <button
          onClick={dismiss}
          className="absolute top-3 right-3 p-1 rounded-lg text-gray-400 hover:text-gray-600 dark:hover:text-gray-200 hover:bg-gray-100 dark:hover:bg-[#1e1e2e]"
          aria-label="Close"
        >
          <X size={16} />
        </button>

        <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-blue-500 to-blue-700 text-white flex items-center justify-center mb-4 shadow">
          <BookOpen size={22} />
        </div>

        <h2 className="text-base font-bold text-gray-900 dark:text-white mb-2">
          Curriculum App
        </h2>
        <p className="text-sm text-gray-600 dark:text-gray-300 leading-relaxed">
          I recommend creating a curriculum with the Curriculum app to get started. It's probably the most useful feature.
        </p>

        <button
          onClick={dismiss}
          className="mt-5 w-full px-4 py-2.5 rounded-xl bg-blue-600 hover:bg-blue-700 text-white text-sm font-semibold"
        >
          Got it
        </button>
      </div>
    </div>
  );
}
