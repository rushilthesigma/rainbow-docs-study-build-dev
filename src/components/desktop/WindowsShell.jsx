import { useState, useEffect, useCallback } from 'react';
import { useWindowManager } from '../../context/WindowManagerContext';
import { useUIPreference } from '../../context/UIPreferenceContext';
import DesktopBackground from './DesktopBackground';
import Window from './Window';
import AppWindow from './AppWindow';
import Spotlight from './Spotlight';
import APP_REGISTRY from './appRegistry';
import { Search, Moon, Sun, X, Minus, Square, Settings, LogOut } from 'lucide-react';
import { checkAdmin } from '../../api/admin';
import { useAuth } from '../../context/AuthContext';

// Windows-style taskbar at bottom with start menu
function Taskbar({ onStartMenu, onSettings, onLogout, openWindows, activeWindowId, onFocusWindow }) {
  const { theme, setTheme } = useUIPreference();
  const dark = theme === 'dark';
  const time = new Date();
  const timeStr = time.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' });

  return (
    <div className="fixed bottom-0 left-0 right-0 h-10 z-[1000] flex items-center px-1 gap-0.5"
      style={{ background: dark ? 'rgba(30,30,35,0.85)' : 'rgba(240,240,245,0.85)', backdropFilter: 'blur(20px)', borderTop: dark ? '1px solid rgba(255,255,255,0.08)' : '1px solid rgba(0,0,0,0.08)' }}>
      {/* Start button */}
      <button onClick={onStartMenu} className={`h-8 px-3 rounded flex items-center gap-1.5 ${dark ? 'hover:bg-white/10 text-white' : 'hover:bg-black/5 text-gray-800'}`}>
        <svg width="16" height="16" viewBox="0 0 16 16"><rect x="1" y="1" width="6" height="6" fill="#0078d4"/><rect x="9" y="1" width="6" height="6" fill="#0078d4" opacity="0.7"/><rect x="1" y="9" width="6" height="6" fill="#0078d4" opacity="0.5"/><rect x="9" y="9" width="6" height="6" fill="#0078d4" opacity="0.3"/></svg>
      </button>

      {/* Search */}
      <button onClick={onStartMenu} className={`h-8 px-3 rounded flex items-center gap-1.5 ${dark ? 'hover:bg-white/10 text-white/50' : 'hover:bg-black/5 text-gray-400'}`}>
        <Search size={14} />
        <span className="text-xs">Search</span>
      </button>

      <div className="w-px h-6 bg-white/10 mx-1" />

      {/* Open windows */}
      {openWindows.map(w => (
        <button key={w.id} onClick={() => onFocusWindow(w.id)} className={`h-8 px-3 rounded text-xs font-medium truncate max-w-[140px] ${w.id === activeWindowId ? (dark ? 'bg-white/15 text-white' : 'bg-black/10 text-gray-900') : (dark ? 'hover:bg-white/10 text-white/60' : 'hover:bg-black/5 text-gray-600')}`}>
          {w.title}
        </button>
      ))}

      <div className="flex-1" />

      {/* System tray */}
      <button onClick={onSettings} className={`h-8 px-2 rounded ${dark ? 'hover:bg-white/10 text-white/50' : 'hover:bg-black/5 text-gray-400'}`} title="Settings">
        <Settings size={14} />
      </button>
      <button onClick={() => setTheme(dark ? 'light' : 'dark')} className={`h-8 px-2 rounded ${dark ? 'hover:bg-white/10 text-white/50' : 'hover:bg-black/5 text-gray-400'}`}>
        {dark ? <Sun size={14} /> : <Moon size={14} />}
      </button>
      <button onClick={onLogout} className={`h-8 px-2 rounded ${dark ? 'hover:bg-white/10 text-red-400/70' : 'hover:bg-black/5 text-red-400'}`} title="Log out">
        <LogOut size={14} />
      </button>
      <span className={`text-xs px-2 ${dark ? 'text-white/60' : 'text-gray-600'}`}>{timeStr}</span>
    </div>
  );
}

// Windows start menu
function StartMenu({ open, onClose, onOpenApp }) {
  const [isAdmin, setIsAdmin] = useState(false);
  useEffect(() => { checkAdmin().then(d => setIsAdmin(d.isAdmin)).catch(() => {}); }, []);

  if (!open) return null;
  const dark = document.documentElement.classList.contains('dark');
  const apps = APP_REGISTRY.filter(a => !['newcurriculum'].includes(a.id) && (!a.adminOnly || isAdmin));

  return (
    <>
      <div className="fixed inset-0 z-[1100]" onClick={onClose} />
      <div className="fixed bottom-12 left-2 z-[1200] w-72 rounded-lg shadow-2xl overflow-hidden"
        style={{ background: dark ? 'rgba(40,40,48,0.95)' : 'rgba(255,255,255,0.97)', backdropFilter: 'blur(30px)', border: dark ? '1px solid rgba(255,255,255,0.1)' : '1px solid rgba(0,0,0,0.1)' }}>
        <div className="p-3">
          <p className={`text-xs font-semibold mb-2 ${dark ? 'text-white/50' : 'text-gray-400'}`}>All Apps</p>
          <div className="space-y-0.5">
            {apps.map(app => {
              const Icon = app.icon;
              return (
                <button key={app.id} onClick={() => { onOpenApp(app.id, app.label); onClose(); }} className={`w-full flex items-center gap-3 px-3 py-2 rounded text-left ${dark ? 'hover:bg-white/10 text-white' : 'hover:bg-gray-100 text-gray-800'}`}>
                  <Icon size={16} style={{ color: app.color }} />
                  <span className="text-sm">{app.label}</span>
                </button>
              );
            })}
          </div>
        </div>
      </div>
    </>
  );
}

export default function WindowsShell() {
  const { state, openApp, focusWindow } = useWindowManager();
  const { logout } = useAuth();
  const [startOpen, setStartOpen] = useState(false);
  const [spotlightOpen, setSpotlightOpen] = useState(false);

  useEffect(() => {
    function handleKey(e) {
      if ((e.metaKey || e.ctrlKey) && e.key === 'k') { e.preventDefault(); setSpotlightOpen(p => !p); }
    }
    window.addEventListener('keydown', handleKey);
    return () => window.removeEventListener('keydown', handleKey);
  }, []);

  const windows = Object.values(state.windows);
  const visibleWindows = windows.filter(w => !w.isMinimized && !w.isClosing);

  return (
    <div className="h-screen w-screen overflow-hidden relative">
      <DesktopBackground />
      {windows.map(win => (
        <Window key={win.id} win={win} isActive={win.id === state.activeWindowId}>
          <AppWindow appId={win.appId} />
        </Window>
      ))}
      <Taskbar onStartMenu={() => setStartOpen(p => !p)} onSettings={() => openApp('settings', 'Settings')} onLogout={logout} openWindows={visibleWindows} activeWindowId={state.activeWindowId} onFocusWindow={focusWindow} />
      <StartMenu open={startOpen} onClose={() => setStartOpen(false)} onOpenApp={openApp} />
      <Spotlight open={spotlightOpen} onClose={() => setSpotlightOpen(false)} />
    </div>
  );
}
