import { Calculator, PanelRightClose } from 'lucide-react';
import { TutorCanvas } from '../desktop/apps/MathTutorApp';

const CANVAS_ICON_STYLE = { color: 'var(--canvas-accent-text)' };

export default function MathTutorPreviewPane({
  onCollapse,
  width,
  initialStrokes,
  onStrokesChange,
  onCaptureReady,
}) {
  return (
    <div
      style={{ width }}
      className="flex-shrink-0 min-w-0 flex flex-col bg-white dark:bg-[#181818] border-l border-gray-200 dark:border-white/[0.06] animate-fade-in"
    >
      <div className="flex items-center gap-2 px-3 h-10 flex-shrink-0 border-b border-gray-200 dark:border-white/[0.06]">
        <Calculator size={13} style={CANVAS_ICON_STYLE} />
        <span className="flex-1 truncate text-[11px] font-semibold text-gray-700 dark:text-gray-200">
          Math Canvas
        </span>
        <span className="hidden sm:inline text-[10px] text-gray-400 dark:text-white/35">
          Included with Study questions
        </span>
        <button
          type="button"
          onClick={onCollapse}
          title="Close Math Tutor side screen"
          aria-label="Close Math Tutor side screen"
          className="flex-shrink-0 p-1.5 rounded-lg text-gray-400 dark:text-gray-500 hover:text-gray-700 dark:hover:text-white hover:bg-black/5 dark:hover:bg-white/[0.08] transition-colors"
        >
          <PanelRightClose size={15} />
        </button>
      </div>
      <div className="flex-1 min-h-0 overflow-hidden p-3">
        <TutorCanvas
          onCaptureReady={onCaptureReady}
          initialStrokes={initialStrokes}
          onStrokesChange={onStrokesChange}
          hint="This canvas is included with every Study question"
        />
      </div>
    </div>
  );
}
