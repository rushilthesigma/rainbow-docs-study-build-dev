import { useState, useEffect, useRef } from 'react';
import { BookOpen, Search, LogOut, ChevronDown } from 'lucide-react';
import { useWindowManager } from '../../context/WindowManagerContext';
import { getApp } from './appRegistry';
import { useAuth } from '../../context/AuthContext';
import { Z } from '../../styles/tokens';

// Top menu bar.
//
// Layout:
//   [logo · RushilAI · | · ActiveApp]                     [search] [user] [date+time]
//
// Right-side widgets:
//   • Search   — opens Spotlight (Cmd+K)
//   • User     — dropdown with email + Log Out
//   • Clock    — date + time, refreshed every 30s
//
// Social bell was removed — Social lives in its own dock app now, no
// menu-bar notification surface.
export default function MenuBar({ onSpotlight }) {
  const { state } = useWindowManager();
  const { user, logout } = useAuth();
  const [dark, setDark] = useState(() => document.documentElement.classList.contains('dark'));
  const [time, setTime] = useState(new Date());
  const [showUserMenu, setShowUserMenu] = useState(false);
  const menuRef = useRef(null);

  useEffect(() => {
    const interval = setInterval(() => setTime(new Date()), 30000);
    return () => clearInterval(interval);
  }, []);

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

  // Close user menu on click outside
  useEffect(() => {
    if (!showUserMenu) return;
    function onClick(e) { if (menuRef.current && !menuRef.current.contains(e.target)) setShowUserMenu(false); }
    document.addEventListener('pointerdown', onClick);
    return () => document.removeEventListener('pointerdown', onClick);
  }, [showUserMenu]);

  const activeWin = state.activeWindowId ? state.windows[state.activeWindowId] : null;
  const activeApp = activeWin ? getApp(activeWin.appId) : null;

  const timeStr = time.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' });
  const dateStr = time.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' });

  return (
    <div
      data-menubar
      className="fixed top-0 left-0 right-0 h-7 flex items-center justify-between px-4 select-none text-[13px]"
      style={{
        zIndex: Z.menubar,
        background: dark ? 'rgba(22, 20, 42, 0.48)' : 'rgba(220, 220, 228, 0.50)',
        backdropFilter: 'blur(64px) saturate(2.2)',
        WebkitBackdropFilter: 'blur(64px) saturate(2.2)',
        borderBottom: dark ? '1px solid rgba(255,255,255,0.09)' : '1px solid rgba(0,0,0,0.08)',
      }}
    >
      {/* Left */}
      <div className="flex items-center gap-3">
        <div className="flex items-center gap-1.5">
          <BookOpen size={14} className={dark ? 'text-white/90' : 'text-gray-800'} />
          <span className={`font-semibold ${dark ? 'text-white/90' : 'text-gray-800'}`}>RushilAI</span>
        </div>
        {activeApp && (
          <>
            <span className={dark ? 'text-white/30' : 'text-gray-300'}>|</span>
            <span className={`font-medium ${dark ? 'text-white/70' : 'text-gray-600'}`}>{activeApp.label}</span>
          </>
        )}
      </div>

      {/* Right */}
      <div className="flex items-center gap-3">
        <button
          onClick={onSpotlight}
          className={`p-1 rounded ${dark ? 'text-white/50 hover:text-white/80' : 'text-gray-500 hover:text-gray-800'} transition-colors`}
          title="Spotlight (Cmd+K)"
        >
          <Search size={13} />
        </button>

        {/* User menu */}
        <div className="relative" ref={menuRef}>
          <button
            onClick={() => setShowUserMenu(!showUserMenu)}
            className={`flex items-center gap-1 px-1 rounded ${dark ? 'text-white/60 hover:text-white/90' : 'text-gray-600 hover:text-gray-900'} transition-colors`}
          >
            <span>{user?.name?.split(' ')[0] || 'User'}</span>
            <ChevronDown size={10} />
          </button>

          {showUserMenu && (
            <div
              className="absolute right-0 top-7 w-48 rounded-lg shadow-xl overflow-hidden"
              style={{
                zIndex: Z.menubarMenu,
                background: dark ? 'rgba(30, 30, 40, 0.9)' : 'rgba(255, 255, 255, 0.95)',
                backdropFilter: 'blur(30px)',
                border: dark ? '1px solid rgba(255,255,255,0.1)' : '1px solid rgba(0,0,0,0.1)',
              }}
            >
              <div className={`px-3 py-2 border-b ${dark ? 'border-white/10' : 'border-gray-200'}`}>
                <p className={`text-xs font-medium ${dark ? 'text-white' : 'text-gray-900'}`}>{user?.name || 'User'}</p>
                <p className={`text-[10px] ${dark ? 'text-white/50' : 'text-gray-400'}`}>{user?.email}</p>
              </div>
              <button
                onClick={() => { setShowUserMenu(false); logout(); }}
                className={`w-full flex items-center gap-2 px-3 py-2 text-xs ${dark ? 'text-red-400 hover:bg-white/5' : 'text-red-500 hover:bg-gray-50'} transition-colors`}
              >
                <LogOut size={12} /> Log Out
              </button>
            </div>
          )}
        </div>

        <span className={`tabular-nums ${dark ? 'text-white/70' : 'text-gray-600'}`}>{dateStr} {timeStr}</span>
      </div>
    </div>
  );
}
