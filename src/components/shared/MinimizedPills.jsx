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
          className="flex items-center gap-2 bg-white/[0.10] border border-white/[0.18] backdrop-blur-xl rounded-xl shadow-[0_4px_24px_rgba(0,0,0,0.3)] px-4 py-2.5 cursor-pointer hover:bg-white/[0.15] transition-colors"
          onClick={() => {
            if (panel.onRestore) panel.onRestore();
            else restorePanel(panel.id);
          }}
        >
          {panel.status === 'loading' ? (
            <Loader2 size={16} className="text-white/50 animate-spin" />
          ) : panel.status === 'done' ? (
            <CheckCircle2 size={16} className="text-emerald-400" />
          ) : (
            <Maximize2 size={14} className="text-white/35" />
          )}
          <span className="text-[13px] font-semibold text-white/80">{panel.title}</span>
          {panel.status === 'done' && (
            <span className="text-[11px] text-emerald-400 font-semibold">Done!</span>
          )}
          <button
            onClick={(e) => { e.stopPropagation(); removePanel(panel.id); }}
            className="ml-1 text-white/25 hover:text-white/55 transition-colors"
          >
            <X size={14} />
          </button>
        </div>
      ))}
    </div>
  );
}
