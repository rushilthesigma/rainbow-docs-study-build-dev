import { Target, ClipboardCheck, MessageSquare, Zap, Layers, Swords, Users, Settings, X } from 'lucide-react';

// Bottom-sheet of secondary apps. Animates up from the dock so it
// reads as "pulled out from the More tab".
const MORE_ITEMS = [
  { id: 'study',       label: 'Study',       icon: MessageSquare,  color: 'text-sky-500',     bg: 'bg-sky-50 dark:bg-sky-900/25' },
  { id: 'quizbowl',    label: 'Quiz Bowl',   icon: Zap,            color: 'text-amber-500',   bg: 'bg-amber-50 dark:bg-amber-900/25' },
  { id: 'flashcards',  label: 'Flashcards',  icon: Layers,         color: 'text-violet-500',  bg: 'bg-violet-50 dark:bg-violet-900/25' },
  { id: 'goals',       label: 'Goals',       icon: Target,         color: 'text-rose-500',    bg: 'bg-rose-50 dark:bg-rose-900/25' },
  { id: 'assessments', label: 'Assessments', icon: ClipboardCheck, color: 'text-orange-500',  bg: 'bg-orange-50 dark:bg-orange-900/25' },
  { id: 'debate',      label: 'Debate',      icon: Swords,         color: 'text-blue-500',    bg: 'bg-blue-50 dark:bg-blue-900/25' },
  { id: 'social',      label: 'Social',      icon: Users,          color: 'text-cyan-500',    bg: 'bg-cyan-50 dark:bg-cyan-900/25' },
  { id: 'settings',    label: 'Settings',    icon: Settings,       color: 'text-gray-500',    bg: 'bg-gray-100 dark:bg-white/[0.06]' },
];

export default function MoreSheet({ open, onClose, onSelect }) {
  if (!open) return null;
  return (
    <div className="fixed inset-0 z-[60]">
      {/* Backdrop */}
      <button
        aria-label="Close"
        onClick={onClose}
        className="absolute inset-0 bg-black/50 backdrop-blur-[2px] animate-fade-in"
      />
      {/* Sheet */}
      <div
        className="absolute bottom-0 left-0 right-0 rounded-t-3xl bg-white dark:bg-[#13131f] border-t border-gray-200 dark:border-white/[0.06] shadow-2xl pb-2 animate-slide-up"
        style={{ paddingBottom: 'calc(env(safe-area-inset-bottom, 0px) + 8px)' }}
      >
        {/* Drag handle */}
        <div className="flex justify-center pt-2.5 pb-1">
          <div className="w-9 h-1 rounded-full bg-gray-300 dark:bg-white/15" />
        </div>
        <div className="flex items-center justify-between px-5 pt-2 pb-3">
          <h3 className="text-[15px] font-bold text-gray-900 dark:text-white tracking-tight">More</h3>
          <button
            onClick={onClose}
            aria-label="Close"
            className="w-8 h-8 rounded-full grid place-items-center text-gray-400 hover:text-gray-600 dark:hover:text-gray-200 active:bg-gray-100 dark:active:bg-white/[0.06]"
          >
            <X size={16} />
          </button>
        </div>
        <div className="grid grid-cols-4 gap-1.5 px-4 pb-3">
          {MORE_ITEMS.map((item) => {
            const Icon = item.icon;
            return (
              <button
                key={item.id}
                onClick={() => { onSelect(item.id); onClose(); }}
                className="flex flex-col items-center gap-1.5 py-3 rounded-2xl active:bg-gray-100 dark:active:bg-white/[0.04] transition-colors"
              >
                <div className={`w-12 h-12 rounded-2xl ${item.bg} grid place-items-center`}>
                  <Icon size={22} className={item.color} strokeWidth={2} />
                </div>
                <span className="text-[10.5px] font-semibold text-gray-700 dark:text-gray-200 tracking-tight">{item.label}</span>
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );
}
