import { ListChecks, PanelRightClose } from 'lucide-react';

export default function QuizPreviewPane({ title, onCollapse, width, setPortalTarget }) {
  return (
    <div
      style={{ width }}
      className="flex-shrink-0 min-w-0 flex flex-col bg-white dark:bg-[#181818] border-l border-gray-200 dark:border-white/[0.06] animate-fade-in"
    >
      <div className="flex items-center gap-2 px-3 h-10 flex-shrink-0 border-b border-gray-200 dark:border-white/[0.06] bg-transparent">
        <ListChecks size={13} className="text-gray-400 dark:text-gray-500" />
        <span className="flex-1 truncate text-[11px] font-semibold text-gray-700 dark:text-gray-200">
          {title || 'Quiz'}
        </span>
        <button
          onClick={onCollapse}
          title="Return quiz to chat"
          className="flex-shrink-0 p-1.5 rounded-lg text-gray-400 dark:text-gray-500 hover:text-gray-700 dark:hover:text-white hover:bg-black/5 dark:hover:bg-white/[0.08] transition-colors"
        >
          <PanelRightClose size={15} />
        </button>
      </div>
      <div className="flex-1 min-h-0 overflow-y-auto px-4 pb-5" ref={setPortalTarget} />
    </div>
  );
}
