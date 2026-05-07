import { useState, useEffect } from 'react';
import { useLocation } from 'react-router-dom';
import { Plus, X, Menu, Moon, Sun, PanelRight } from 'lucide-react';
import { useTabs } from '../../context/TabContext';
import { useSplitView } from '../../context/SplitViewContext';

export default function TabBar({ onToggleSidebar, showHamburger = false }) {
  const { tabs, activeTabId, openTab, switchTab, closeTab } = useTabs();
  const { isActive: splitActive, openSplit, closeSplit } = useSplitView();
  const location = useLocation();
  const isMathPage = location.pathname === '/math';

  const [dark, setDark] = useState(() => document.documentElement.classList.contains('dark'));

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

  useEffect(() => {
    if (isMathPage && splitActive) closeSplit();
  }, [isMathPage]);

  return (
    <div className="relative flex items-center gap-0 px-1.5 bg-gray-100 dark:bg-[#141414] border-b border-gray-200 dark:border-white/[0.07] flex-shrink-0 select-none">
      {/* Hamburger (mobile) */}
      {showHamburger && (
        <button onClick={onToggleSidebar} className="p-1.5 mr-1 rounded-lg text-gray-500 hover:bg-gray-200/60 dark:hover:bg-white/[0.06] transition-colors flex-shrink-0">
          <Menu size={16} />
        </button>
      )}

      {/* Tabs area — scrollable */}
      <div className="flex items-end gap-0 flex-1 min-w-0 overflow-x-auto scrollbar-hide pt-1">
        {tabs.map(tab => {
          const isActive = tab.id === activeTabId;
          return (
            <div
              key={tab.id}
              onClick={() => switchTab(tab.id)}
              className={`group relative flex items-center gap-2 px-3.5 py-2 cursor-pointer transition-all duration-150 max-w-[180px] min-w-[80px] ${
                isActive
                  ? 'bg-white dark:bg-[#1a1a1a] text-gray-900 dark:text-white rounded-t-lg z-10 -mb-px border border-gray-200 dark:border-white/[0.07] border-b-transparent shadow-sm'
                  : 'text-gray-500 dark:text-gray-500 hover:text-gray-700 dark:hover:text-gray-300 hover:bg-gray-200/50 dark:hover:bg-[#161622]/50 rounded-t-lg mb-0'
              }`}
            >
              <div
                className={`w-2 h-2 rounded-full flex-shrink-0 transition-opacity ${isActive ? 'opacity-100' : 'opacity-40 group-hover:opacity-70'}`}
                style={{ backgroundColor: tab.color || '#6b7280' }}
              />
              <span className={`text-xs font-medium truncate ${isActive ? 'text-gray-900 dark:text-white' : ''}`}>
                {tab.label}
              </span>
              {tabs.length > 1 && (
                <button
                  onClick={e => { e.stopPropagation(); closeTab(tab.id); }}
                  className={`flex-shrink-0 p-0.5 rounded transition-all ${
                    isActive
                      ? 'text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 hover:bg-gray-100 dark:hover:bg-white/[0.04]'
                      : 'opacity-0 group-hover:opacity-100 text-gray-400 hover:text-gray-600 hover:bg-gray-300/50 dark:hover:bg-[#2A2A40]'
                  }`}
                >
                  <X size={12} />
                </button>
              )}
            </div>
          );
        })}

        <button
          onClick={() => openTab('/dashboard')}
          className="flex items-center justify-center w-7 h-7 mb-0.5 ml-0.5 rounded-lg text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 hover:bg-gray-200/60 dark:hover:bg-white/[0.06] transition-colors flex-shrink-0"
          title="New tab"
        >
          <Plus size={14} />
        </button>
      </div>

      {/* Right controls */}
      <div className="flex items-center gap-0.5 ml-2 flex-shrink-0">
        {!showHamburger && !isMathPage && (
          <button
            onClick={() => splitActive ? closeSplit() : openSplit('study')}
            className={`p-1.5 rounded-lg transition-colors ${
              splitActive
                ? 'text-gray-700 dark:text-white bg-white/70 dark:bg-white/[0.09]'
                : 'text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 hover:bg-gray-200/60 dark:hover:bg-white/[0.06]'
            }`}
            title={splitActive ? 'Close split view' : 'Split view'}
          >
            {splitActive ? <X size={15} /> : <PanelRight size={15} />}
          </button>
        )}
        <button
          onClick={() => setDark(!dark)}
          className="p-1.5 rounded-lg text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 hover:bg-gray-200/60 dark:hover:bg-white/[0.06] transition-colors"
          title={dark ? 'Light mode' : 'Dark mode'}
        >
          {dark ? <Sun size={15} /> : <Moon size={15} />}
        </button>
      </div>
    </div>
  );
}
