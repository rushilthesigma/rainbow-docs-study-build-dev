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
    <div className="fixed bottom-0 left-0 right-0 z-[1000] flex items-center justify-center">
      {/* Status area (right) */}
      <div className="fixed bottom-1.5 right-3 flex items-center gap-2 z-[1001]">
        <button onClick={onSettings} className={`p-1 rounded ${dark ? 'text-white/50 hover:text-white/70' : 'text-gray-500 hover:text-gray-700'}`} title="Settings">
          <Settings size={13} />
        </button>
        <button onClick={() => setTheme(dark ? 'light' : 'dark')} className={`p-1 rounded ${dark ? 'text-white/50 hover:text-white/70' : 'text-gray-500 hover:text-gray-700'}`}>
          {dark ? <Sun size={13} /> : <Moon size={13} />}
        </button>
        <button onClick={onLogout} className={`p-1 rounded ${dark ? 'text-red-400/70 hover:text-red-400' : 'text-red-400 hover:text-red-500'}`} title="Log out">
          <LogOut size={13} />
        </button>
        <span className={`text-[11px] ${dark ? 'text-white/60' : 'text-gray-600'}`}>{timeStr}</span>
      </div>

      {/* Centered shelf */}
      <div className="flex items-center gap-1 px-2 py-1.5 mb-1.5 rounded-2xl"
        style={{ background: dark ? 'rgba(30,30,40,0.7)' : 'rgba(255,255,255,0.8)', backdropFilter: 'blur(30px)', border: dark ? '1px solid rgba(255,255,255,0.08)' : '1px solid rgba(0,0,0,0.06)' }}>
        {/* Launcher */}
        <button onClick={onLauncher} className={`w-10 h-10 rounded-full flex items-center justify-center ${dark ? 'hover:bg-white/10' : 'hover:bg-black/5'}`}>
          <svg width="18" height="18" viewBox="0 0 18 18"><circle cx="9" cy="9" r="8" fill="none" stroke={dark ? '#fff' : '#333'} strokeWidth="1.5"/><circle cx="9" cy="9" r="3" fill={dark ? '#fff' : '#333'}/></svg>
        </button>
        <div className="w-px h-6 bg-white/10 mx-0.5" />
        {/* Pinned apps */}
        {apps.slice(0, 8).map(app => {
          const Icon = app.icon;
          const hasWindow = openWindows.some(w => w.appId === app.id);
          return (
            <button key={app.id} onClick={() => onFocusWindow(app)} className="relative w-10 h-10 rounded-full flex items-center justify-center hover:bg-white/10 transition-colors">
              <Icon size={20} style={{ color: app.color }} />
              {hasWindow && <div className="absolute bottom-0.5 w-1 h-1 rounded-full bg-white/70" />}
            </button>
          );
        })}
      </div>
    </div>
  );
}

export default function ChromeOSShell() {
  const { state, openApp, focusWindow } = useWindowManager();
  const { logout } = useAuth();
  const [spotlightOpen, setSpotlightOpen] = useState(false);

  useEffect(() => {
    function handleKey(e) {
      if ((e.metaKey || e.ctrlKey) && e.key === 'k') { e.preventDefault(); setSpotlightOpen(p => !p); }
    }
    window.addEventListener('keydown', handleKey);
    return () => window.removeEventListener('keydown', handleKey);
  }, []);

  const windows = Object.values(state.windows);

  function handleShelfApp(app) {
    const existing = Object.values(state.windows).find(w => w.appId === app.id);
    if (existing) focusWindow(existing.id);
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
