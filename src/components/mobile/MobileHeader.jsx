import { ArrowLeft, BookOpen } from 'lucide-react';

// Compact iOS-style header. 48px tall, frosted glass, hairline border.
// Brand mark on the left when no back button is needed.
export default function MobileHeader({ title, onBack, rightSlot }) {
  return (
    <header className="sticky top-0 z-30 flex items-center h-12 px-3 bg-white/80 dark:bg-[#0c0c16]/80 backdrop-blur-2xl border-b border-gray-200/60 dark:border-white/[0.06] shadow-[0_1px_0_rgba(0,0,0,0.02)] dark:shadow-none">
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
          <div className="w-7 h-7 rounded-lg bg-blue-500 grid place-items-center">
            <BookOpen size={14} className="text-white" strokeWidth={2.4} />
          </div>
        </div>
      )}
      <h1 className="flex-1 text-center text-[15px] font-semibold text-gray-900 dark:text-white truncate px-2 tracking-tight">{title}</h1>
      <div className="flex items-center gap-1">
        {rightSlot}
      </div>
    </header>
  );
}
