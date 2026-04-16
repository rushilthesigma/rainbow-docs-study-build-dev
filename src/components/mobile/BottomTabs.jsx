import { BookOpen, MessageSquare, Layers, FileText, MoreHorizontal } from 'lucide-react';

const TABS = [
  { id: 'study', label: 'Study', icon: MessageSquare },
  { id: 'curricula', label: 'Curricula', icon: BookOpen },
  { id: 'flashcards', label: 'Cards', icon: Layers },
  { id: 'notes', label: 'Notes', icon: FileText },
  { id: 'more', label: 'More', icon: MoreHorizontal },
];

export default function BottomTabs({ active, onSelect }) {
  return (
    <nav className="fixed bottom-0 left-0 right-0 z-50 bg-white dark:bg-[#161622] border-t border-gray-200 dark:border-[#2A2A40]" style={{ paddingBottom: 'env(safe-area-inset-bottom, 0px)' }}>
      <div className="flex items-center justify-around h-14">
        {TABS.map(tab => {
          const Icon = tab.icon;
          const isActive = active === tab.id;
          return (
            <button
              key={tab.id}
              onClick={() => onSelect(tab.id)}
              className={`flex flex-col items-center justify-center flex-1 h-full gap-0.5 transition-colors ${isActive ? 'text-blue-600 dark:text-blue-400' : 'text-gray-400 dark:text-gray-500'}`}
            >
              <Icon size={20} strokeWidth={isActive ? 2.2 : 1.8} />
              <span className="text-[10px] font-medium">{tab.label}</span>
            </button>
          );
        })}
      </div>
    </nav>
  );
}
