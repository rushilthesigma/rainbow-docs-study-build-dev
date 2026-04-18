import { useState, useEffect } from 'react';
import { useWindowManager } from '../../context/WindowManagerContext';
import { useUIPreference } from '../../context/UIPreferenceContext';
import DesktopBackground from './DesktopBackground';
import Window from './Window';
import AppWindow from './AppWindow';
import Spotlight from './Spotlight';
import APP_REGISTRY from './appRegistry';
import { Moon, Sun, Search, Settings, LogOut } from 'lucide-react';
import { checkAdmin } from '../../api/admin';
import { useAuth } from '../../context/AuthContext';

// ChromeOS shelf (centered bottom bar)
function Shelf({ onLauncher, onSettings, onLogout, openWindows, activeWindowId, onFocusWindow }) {
  const { theme, setTheme } = useUIPreference();
  const dark = theme === 'dark';
  const [isAdmin, setIsAdmin] = useState(false);
  useEffect(() => { checkAdmin().then(d => setIsAdmin(d.isAdmin)).catch(() => {}); }, []);

  const apps = APP_REGISTRY.filter(a => !['newcurriculum'].includes(a.id) && (!a.adminOnly || isAdmin));
  const time = new Date();
  const timeStr = time.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' });

  return (
    // Full-width shelf spanning the entire bottom row (ChromeOS-style)
    <div
      className="fixed bottom-0 left-0 right-0 z-[1000] h-12 flex items-center px-2"
      style={{
        background: dark ? 'rgba(30,30,40,0.85)' : 'rgba(255,255,255,0.88)',
        backdropFilter: 'blur(30px)',
        borderTop: dark ? '1px solid rgba(255,255,255,0.08)' : '1px solid rgba(0,0,0,0.06)',
      }}
    >
      {/* Launcher (left) */}
      <button onClick={onLauncher} className={`w-9 h-9 rounded-full flex items-center justify-center flex-shrink-0 ${dark ? 'hover:bg-white/10' : 'hover:bg-black/5'}`}>
        <svg width="18" height="18" viewBox="0 0 18 18"><circle cx="9" cy="9" r="8" fill="none" stroke={dark ? '#fff' : '#333'} strokeWidth="1.5"/><circle cx="9" cy="9" r="3" fill={dark ? '#fff' : '#333'}/></svg>
      </button>
      <div className="w-px h-6 bg-white/10 mx-1" />

      {/* Pinned apps — centered within the shelf */}
      <div className="flex-1 flex items-center justify-center gap-1 overflow-x-auto">
        {apps.map(app => {
          const Icon = app.icon;
          const hasWindow = openWindows.some(w => w.appId === app.id);
          return (
            <button
              key={app.id}
              onClick={() => onFocusWindow(app)}
              title={app.label}
              className={`relative w-9 h-9 rounded-full flex items-center justify-center transition-colors flex-shrink-0 ${dark ? 'hover:bg-white/10' : 'hover:bg-black/5'}`}
            >
              <Icon size={18} style={{ color: app.color }} />
              {hasWindow && <div className="absolute bottom-0.5 w-1 h-1 rounded-full bg-white/70" />}
            </button>
          );
        })}
      </div>

      {/* Status area (right) */}
      <div className="flex items-center gap-1.5 flex-shrink-0 pr-1">
        <button onClick={onSettings} className={`p-1.5 rounded ${dark ? 'text-white/60 hover:text-white/90 hover:bg-white/10' : 'text-gray-500 hover:text-gray-800 hover:bg-black/5'}`} title="Settings">
          <Settings size={14} />
        </button>
        <button onClick={() => setTheme(dark ? 'light' : 'dark')} className={`p-1.5 rounded ${dark ? 'text-white/60 hover:text-white/90 hover:bg-white/10' : 'text-gray-500 hover:text-gray-800 hover:bg-black/5'}`}>
          {dark ? <Sun size={14} /> : <Moon size={14} />}
        </button>
        <button onClick={onLogout} className={`p-1.5 rounded ${dark ? 'text-red-400/70 hover:text-red-400 hover:bg-white/10' : 'text-red-400 hover:text-red-500 hover:bg-black/5'}`} title="Log out">
          <LogOut size={14} />
        </button>
        <span className={`text-[11px] px-1.5 ${dark ? 'text-white/70' : 'text-gray-700'}`}>{timeStr}</span>
      </div>
    </div>
  );
}

export default function ChromeOSShell() {
  const { state, openApp, focusWindow, restoreWindow } = useWindowManager();
  const { logout } = useAuth();
  const [spotlightOpen, setSpotlightOpen] = useState(false);

  useEffect(() => {
    function handleKey(e) {
      const cmdish = e.metaKey || e.ctrlKey;
      const isDigit1 = e.code === 'Digit1' || e.key === '1' || e.key === '!' || e.keyCode === 49;
      if (cmdish && (e.key === 'k' || e.key === 'K')) { e.preventDefault(); setSpotlightOpen(p => !p); }
      else if (cmdish && e.shiftKey && isDigit1) { e.preventDefault(); setSpotlightOpen(p => !p); }
    }
    window.addEventListener('keydown', handleKey);
    return () => window.removeEventListener('keydown', handleKey);
  }, []);

  const windows = Object.values(state.windows);

  function handleShelfApp(app) {
    const existing = Object.values(state.windows).find(w => w.appId === app.id);
    if (existing?.isMinimized) restoreWindow(existing.id);
    else if (existing) focusWindow(existing.id);
    else openApp(app.id, app.label);
  }

  return (
    <div className="h-screen w-screen overflow-hidden relative">
      <DesktopBackground />
      {windows.map(win => (
        <Window key={win.id} win={win} isActive={win.id === state.activeWindowId}>
          <AppWindow appId={win.appId} />
        </Window>
      ))}
      <Shelf onLauncher={() => setSpotlightOpen(true)} onSettings={() => openApp('settings', 'Settings')} onLogout={logout} openWindows={Object.values(state.windows)} activeWindowId={state.activeWindowId} onFocusWindow={handleShelfApp} />
      <Spotlight open={spotlightOpen} onClose={() => setSpotlightOpen(false)} />
    </div>
  );
}
