import { NavLink } from 'react-router-dom';
import { LayoutDashboard, Plus, MessageSquare, Target, Layers, FileText, Settings, LogOut, BookOpen, Users, Swords } from 'lucide-react';
import { useAuth } from '../../context/AuthContext';

const navItems = [
  { to: '/dashboard', icon: LayoutDashboard, label: 'Dashboard' },
  { to: '/new', icon: Plus, label: 'New Curriculum' },
  { to: '/study', icon: MessageSquare, label: 'Study' },
  { to: '/goals', icon: Target, label: 'Goals' },
  { to: '/flashcards', icon: Layers, label: 'Flashcards' },
  { to: '/notes', icon: FileText, label: 'Notes' },
  { to: '/social', icon: Users, label: 'Social' },
  { to: '/debate', icon: Swords, label: 'Debate' },
  { to: '/settings', icon: Settings, label: 'Settings' },
];

export default function Sidebar({ hidden, onNavigate }) {
  const { user, logout } = useAuth();

  return (
    <aside className={`fixed left-0 top-0 h-screen w-60 bg-white dark:bg-[#1a1a1a] border-r border-gray-200 dark:border-white/[0.06] flex flex-col transition-transform z-30 ${hidden ? '-translate-x-full' : 'translate-x-0'}`}>
      <div className="flex items-center gap-3 px-4 h-16 border-b border-gray-200 dark:border-white/[0.06]">
        <div className="w-8 h-8 rounded-lg bg-gray-900 dark:bg-white/[0.12] flex items-center justify-center flex-shrink-0">
          <BookOpen size={18} className="text-white" />
        </div>
        <span className="font-bold text-lg text-gray-900 dark:text-white">RushilAI</span>
      </div>

      <nav className="flex-1 py-3 px-2 space-y-0.5 overflow-y-auto">
        {navItems.map(({ to, icon: Icon, label }) => (
          <NavLink
            key={to}
            to={to}
            onClick={onNavigate}
            className={({ isActive }) =>
              `flex items-center gap-3 px-3 py-2 rounded-lg text-sm font-medium transition-colors ${
                isActive
                  ? 'bg-white/70 dark:bg-white/[0.09] text-gray-900 dark:text-white font-semibold'
                  : 'text-gray-600 dark:text-gray-400 hover:bg-gray-50 dark:hover:bg-white/[0.05]'
              }`
            }
          >
            <Icon size={17} />
            {label}
          </NavLink>
        ))}
      </nav>

      <div className="p-3 border-t border-gray-200 dark:border-white/[0.06]">
        {user && (
          <div className="flex items-center gap-3 px-2 py-2 mb-2">
            <div className="w-8 h-8 rounded-full bg-gray-100 dark:bg-white/10 flex items-center justify-center text-xs font-semibold text-gray-700 dark:text-gray-300">
              {user.name?.charAt(0)?.toUpperCase() || '?'}
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-sm font-medium text-gray-900 dark:text-gray-100 truncate">{user.name}</p>
              <p className="text-xs text-gray-400 truncate">{user.email}</p>
            </div>
          </div>
        )}
        <button
          onClick={logout}
          className="flex items-center gap-3 px-3 py-2 w-full rounded-lg text-sm text-gray-500 dark:text-gray-400 hover:bg-gray-50 dark:hover:bg-white/[0.05] transition-colors"
        >
          <LogOut size={17} />
          Log out
        </button>
      </div>
    </aside>
  );
}
