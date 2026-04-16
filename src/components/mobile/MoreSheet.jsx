import { Target, ClipboardCheck, PenTool, Swords, Users, GraduationCap, Settings } from 'lucide-react';

const MORE_ITEMS = [
  { id: 'goals', label: 'Goals', icon: Target, color: 'text-amber-500', bg: 'bg-amber-50 dark:bg-amber-900/20' },
  { id: 'assessments', label: 'Assessments', icon: ClipboardCheck, color: 'text-rose-500', bg: 'bg-rose-50 dark:bg-rose-900/20' },
  { id: 'math', label: 'Math Canvas', icon: PenTool, color: 'text-indigo-500', bg: 'bg-indigo-50 dark:bg-indigo-900/20' },
  { id: 'debate', label: 'Debate', icon: Swords, color: 'text-blue-500', bg: 'bg-blue-50 dark:bg-blue-900/20' },
  { id: 'social', label: 'Social', icon: Users, color: 'text-cyan-500', bg: 'bg-cyan-50 dark:bg-cyan-900/20' },
  { id: 'textbook', label: 'Textbooks', icon: GraduationCap, color: 'text-violet-500', bg: 'bg-violet-50 dark:bg-violet-900/20' },
  { id: 'settings', label: 'Settings', icon: Settings, color: 'text-gray-500', bg: 'bg-gray-50 dark:bg-gray-800/30' },
];

export default function MoreSheet({ open, onClose, onSelect }) {
  if (!open) return null;

  return (
    <>
      <div className="fixed inset-0 bg-black/40 z-50" onClick={onClose} />
      <div className="fixed bottom-0 left-0 right-0 z-50 bg-white dark:bg-[#161622] rounded-t-2xl shadow-2xl" style={{ paddingBottom: 'env(safe-area-inset-bottom, 0px)' }}>
        <div className="flex justify-center pt-3 pb-2">
          <div className="w-10 h-1 rounded-full bg-gray-300 dark:bg-gray-600" />
        </div>
        <div className="grid grid-cols-4 gap-3 px-5 pb-6">
          {MORE_ITEMS.map(item => {
            const Icon = item.icon;
            return (
              <button key={item.id} onClick={() => { onSelect(item.id); onClose(); }} className="flex flex-col items-center gap-1.5 py-2">
                <div className={`w-12 h-12 rounded-2xl ${item.bg} flex items-center justify-center`}>
                  <Icon size={22} className={item.color} />
                </div>
                <span className="text-[10px] font-medium text-gray-600 dark:text-gray-400">{item.label}</span>
              </button>
            );
          })}
        </div>
      </div>
    </>
  );
}
