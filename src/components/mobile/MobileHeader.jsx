import { ArrowLeft, BookOpen } from 'lucide-react';
import { zIndexStyle } from '../../styles/tokens';

// Compact iOS-style header. 48px tall, frosted glass, hairline border.
// Brand mark on the left when no back button is needed.
export default function MobileHeader({ title, onBack, rightSlot }) {
  return (
    <header
      className="sticky top-0 shrink-0 grid grid-cols-[44px_minmax(0,1fr)_44px] items-center px-2 bg-white/80 dark:bg-[#0c0c16]/80 backdrop-blur-2xl border-b border-gray-200/60 dark:border-white/[0.06] shadow-[0_1px_0_rgba(0,0,0,0.02)] dark:shadow-none"
      style={{ ...zIndexStyle.content, height: 'calc(48px + env(safe-area-inset-top, 0px))', paddingTop: 'env(safe-area-inset-top, 0px)' }}
    >
      <div className="h-11 flex items-center justify-start">
        {onBack ? (
          <button
            type="button"
            onClick={onBack}
            aria-label="Back"
            className="w-11 h-11 rounded-full grid place-items-center text-gray-600 dark:text-gray-300 active:bg-gray-100 dark:active:bg-white/[0.06] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500/60 transition-colors"
          >
            <ArrowLeft size={19} />
          </button>
        ) : (
          <div className="w-7 h-7 rounded-lg bg-blue-500 grid place-items-center">
            <BookOpen size={14} className="text-white" strokeWidth={2.4} />
          </div>
        )}
      </div>
      <h1 className="min-w-0 text-center text-[15px] font-semibold text-gray-900 dark:text-white truncate px-2 tracking-tight">{title}</h1>
      <div className="h-11 flex items-center justify-end gap-1">
        {rightSlot}
      </div>
    </header>
  );
}
