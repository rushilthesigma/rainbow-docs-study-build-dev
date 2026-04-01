import { usePanels } from '../../context/PanelContext';
import { Maximize2, X, Loader2, CheckCircle2 } from 'lucide-react';

export default function MinimizedPills() {
  const { panels, restorePanel, removePanel } = usePanels();
  const minimized = panels.filter(p => p.minimized);

  if (minimized.length === 0) return null;

  return (
    <div className="fixed bottom-4 right-4 z-40 flex flex-col gap-2">
      {minimized.map(panel => (
        <div
          key={panel.id}
          className="flex items-center gap-2 bg-white dark:bg-[#161622] border border-gray-200 dark:border-[#2A2A40] rounded-xl shadow-lg px-4 py-2.5 cursor-pointer hover:shadow-xl transition-shadow"
          onClick={() => {
            if (panel.onRestore) panel.onRestore();
            else restorePanel(panel.id);
          }}
        >
          {panel.status === 'loading' ? (
            <Loader2 size={16} className="text-blue-500 animate-spin" />
          ) : panel.status === 'done' ? (
            <CheckCircle2 size={16} className="text-emerald-500" />
          ) : (
            <Maximize2 size={14} className="text-gray-400" />
          )}
          <span className="text-sm font-medium text-gray-700 dark:text-gray-200">{panel.title}</span>
          {panel.status === 'done' && (
            <span className="text-xs text-emerald-500 font-medium">Done!</span>
          )}
          <button
            onClick={(e) => { e.stopPropagation(); removePanel(panel.id); }}
            className="ml-1 text-gray-300 hover:text-gray-500 dark:hover:text-gray-400"
          >
            <X size={14} />
          </button>
        </div>
      ))}
    </div>
  );
}
