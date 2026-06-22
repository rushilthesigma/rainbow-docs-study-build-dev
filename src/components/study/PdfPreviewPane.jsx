import { FileText, X, PanelRightClose } from 'lucide-react';

// Side-by-side PDF viewer for Study Mode — the right half of the Claude-style
// splitscreen. PDFs pasted/dropped/attached in the composer open here and stay
// pinned while you chat. Rendering is the browser's native PDF viewer via a
// blob-URL iframe (no extra deps); the AI reads the same file through the
// existing text-extraction path, so this pane is purely the visual reference.
//
// Props:
//   docs       [{ id, name, url }]  — open PDFs (url is an object URL)
//   activeId   string               — which tab is showing
//   onSelect   (id) => void         — switch tabs
//   onClose    (id) => void         — close one tab (removes the PDF)
//   onCollapse () => void           — hide the pane (keeps the PDFs loaded)
//   width      number               — pane width in px (driven by the drag gutter)
export default function PdfPreviewPane({ docs, activeId, onSelect, onClose, onCollapse, width }) {
  const active = docs.find(d => d.id === activeId) || docs[0];
  if (!active) return null;

  return (
    <div
      style={{ width }}
      className="flex-shrink-0 min-w-0 flex flex-col bg-white dark:bg-[#181818] border-l border-gray-200 dark:border-white/[0.06]"
    >
      {/* Header: file tabs + collapse button */}
      <div className="flex items-center gap-1 px-2 h-10 flex-shrink-0 border-b border-gray-200 dark:border-white/[0.06] bg-transparent">
        <div className="flex-1 flex items-center gap-1 overflow-x-auto">
          {docs.map(d => {
            const isActive = d.id === active.id;
            return (
              <button
                key={d.id}
                onClick={() => onSelect(d.id)}
                title={d.name}
                className={`group/tab inline-flex items-center gap-1.5 pl-2 pr-1 py-1 rounded-lg text-[11px] font-medium max-w-[180px] flex-shrink-0 transition-colors ${
                  isActive
                    ? 'bg-white dark:bg-white/[0.08] text-gray-900 dark:text-white shadow-sm'
                    : 'text-gray-500 dark:text-gray-400 hover:bg-white/60 dark:hover:bg-white/[0.04]'
                }`}
              >
                <FileText size={11} className="flex-shrink-0 opacity-70" />
                <span className="truncate">{d.name}</span>
                <span
                  role="button"
                  aria-label={`Close ${d.name}`}
                  onClick={e => { e.stopPropagation(); onClose(d.id); }}
                  className="flex-shrink-0 p-0.5 rounded opacity-0 group-hover/tab:opacity-60 hover:!opacity-100 hover:bg-black/10 dark:hover:bg-white/10"
                >
                  <X size={10} />
                </span>
              </button>
            );
          })}
        </div>
        <button
          onClick={onCollapse}
          title="Hide PDF"
          className="flex-shrink-0 p-1.5 rounded-lg text-gray-400 dark:text-gray-500 hover:text-gray-700 dark:hover:text-white hover:bg-black/5 dark:hover:bg-white/[0.08] transition-colors"
        >
          <PanelRightClose size={15} />
        </button>
      </div>

      {/* Body: native browser PDF viewer */}
      <div className="flex-1 min-h-0 bg-gray-200 dark:bg-[#181818]">
        <iframe
          key={active.id}
          src={`${active.url}#toolbar=0&navpanes=0&view=FitH`}
          title={active.name}
          className="w-full h-full border-0"
        />
      </div>
    </div>
  );
}
