import { Menu, Moon, Sun, PanelRight, X, MessageSquare } from 'lucide-react';
import { useState, useEffect } from 'react';
import { useLocation } from 'react-router-dom';
import { useSplitView } from '../../context/SplitViewContext';

export default function TopBar({ onToggleSidebar, showHamburger = false }) {
  const [dark, setDark] = useState(() => document.documentElement.classList.contains('dark'));
  const { isActive, rightPanel, openSplit, closeSplit } = useSplitView();
  const location = useLocation();
  const isMathPage = location.pathname === '/math';

  // Auto-close split view when navigating to math page
  useEffect(() => {
    if (isMathPage && isActive) closeSplit();
  }, [isMathPage]);

  useEffect(() => {
    if (dark) document.documentElement.classList.add('dark');
    else document.documentElement.classList.remove('dark');
    localStorage.setItem('covalent-theme', dark ? 'dark' : 'light');
  }, [dark]);

  useEffect(() => {
    const saved = localStorage.getItem('covalent-theme');
    if (saved === 'dark') setDark(true);
    else if (saved === 'light') setDark(false);
    else if (window.matchMedia('(prefers-color-scheme: dark)').matches) setDark(true);
  }, []);

  return (
    <header className="h-14 flex items-center justify-between px-4 md:px-6 border-b border-gray-200 dark:border-[#2A2A40] bg-white dark:bg-[#161622]">
      {showHamburger && (
        <button onClick={onToggleSidebar} className="p-2 rounded-lg text-gray-500 hover:bg-gray-100 dark:hover:bg-[#1e1e2e] transition-colors">
          <Menu size={18} />
        </button>
      )}
      <div className="flex-1" />
      <div className="flex items-center gap-1">
        {/* Split view toggle — hidden on math canvas page */}
        {!showHamburger && !isMathPage && (
          <button
            onClick={() => isActive ? closeSplit() : openSplit('study')}
            className={`p-2 rounded-lg transition-colors ${
              isActive
                ? 'text-blue-600 bg-blue-50 dark:bg-blue-900/20'
                : 'text-gray-500 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-[#1e1e2e]'
            }`}
            title={isActive ? 'Close split view' : 'Open Study Mode in split view'}
          >
            {isActive ? <X size={18} /> : <PanelRight size={18} />}
          </button>
        )}
        <button
          onClick={() => setDark(!dark)}
          className="p-2 rounded-lg text-gray-500 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-[#1e1e2e] transition-colors"
        >
          {dark ? <Sun size={18} /> : <Moon size={18} />}
        </button>
      </div>
    </header>
  );
}
