import { useRef, useState } from 'react';
import { X, MessageSquare, Layers, FileText } from 'lucide-react';
import { useSplitView } from '../../context/SplitViewContext';
import StudyModePanel from '../study/StudyModePanel';
import SplitFlashcards from '../flashcards/SplitFlashcards';
import SplitNotes from '../notes/SplitNotes';

const PANELS = {
  study: { label: 'Study Mode', icon: MessageSquare, component: StudyModePanel },
  flashcards: { label: 'Flashcards', icon: Layers, component: SplitFlashcards },
  notes: { label: 'Quick Note', icon: FileText, component: SplitNotes },
};

export default function SplitView({ children }) {
  const { rightPanel, openSplit, closeSplit } = useSplitView();
  const [splitRatio, setSplitRatio] = useState(55);
  const dragging = useRef(false);
  const containerRef = useRef(null);

  const panelConfig = rightPanel ? PANELS[rightPanel] : null;
  const PanelComponent = panelConfig?.component;

  function handleMouseDown(e) {
    e.preventDefault();
    dragging.current = true;
    document.addEventListener('mousemove', handleMouseMove);
    document.addEventListener('mouseup', handleMouseUp);
  }

  function handleMouseMove(e) {
    if (!dragging.current || !containerRef.current) return;
    const rect = containerRef.current.getBoundingClientRect();
    const ratio = ((e.clientX - rect.left) / rect.width) * 100;
    setSplitRatio(Math.min(Math.max(ratio, 25), 75));
  }

  function handleMouseUp() {
    dragging.current = false;
    document.removeEventListener('mousemove', handleMouseMove);
    document.removeEventListener('mouseup', handleMouseUp);
  }

  if (!PanelComponent) return children;

  return (
    <div ref={containerRef} className="h-full overflow-hidden" style={{ display: 'grid', gridTemplateColumns: `${splitRatio}% 4px 1fr` }}>
      <div className="overflow-y-auto overflow-x-hidden p-4 md:p-6 flex flex-col min-w-0">
        {children}
      </div>

      <div onMouseDown={handleMouseDown} className="cursor-col-resize bg-gray-200 dark:bg-white/[0.07] hover:bg-violet-400 dark:hover:bg-violet-600 transition-colors" />

      <div className="flex flex-col overflow-hidden min-w-0 bg-white dark:bg-[#1a1a1a]">
        {/* Panel header with switcher */}
        <div className="flex items-center gap-1 px-2 py-1.5 border-b border-gray-200 dark:border-white/[0.07] flex-shrink-0">
          {Object.entries(PANELS).map(([key, cfg]) => {
            const Icon = cfg.icon;
            const active = key === rightPanel;
            return (
              <button
                key={key}
                onClick={() => openSplit(key)}
                className={`flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-xs font-medium transition-colors ${
                  active ? 'bg-white/70 dark:bg-white/[0.09] text-gray-900 dark:text-white' : 'text-gray-400 hover:text-gray-600 dark:hover:text-gray-300'
                }`}
              >
                <Icon size={13} />
                {active && cfg.label}
              </button>
            );
          })}
          <div className="flex-1" />
          <button onClick={closeSplit} className="p-1.5 rounded-lg text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 hover:bg-gray-100 dark:hover:bg-[#1e1e2e]">
            <X size={14} />
          </button>
        </div>

        <div className="flex-1 overflow-hidden">
          <PanelComponent className="h-full" />
        </div>
      </div>
    </div>
  );
}
